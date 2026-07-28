/**
 * Deterministic simulation engine: continuous yield accrual, scheduled
 * rebalancing, and the usage time series.
 *
 * Everything time-derived is a pure function of (seed data, wall clock), and
 * everything random is seeded by position id, so repeated reads are stable and
 * every cold start is identical.
 */

import { get, filter, all, getStore, rngFromString, detId, detTxHash } from './store.js';

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_REBALANCES = 40;

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Continuous linear accrual: value = principal * (1 + apy * elapsedYears).
 * Returns a NEW object; does not mutate the stored position.
 */
export function withAccrual(position) {
  const apy = position.apy || 0;
  const openedMs = Date.parse(position.opened_at);
  // Closed positions freeze at their last update; live ones accrue to now.
  const endMs = position.status === 'closed' ? Date.parse(position.updated_at) : Date.now();
  const elapsedYears = Math.max(0, (endMs - openedMs) / YEAR_MS);
  const current_value = round2(position.principal * (1 + apy * elapsedYears));
  const accrued_yield = round2(current_value - position.principal);
  return {
    ...position,
    current_value,
    accrued_yield,
    updated_at: position.status === 'closed' ? position.updated_at : new Date().toISOString(),
  };
}

/** Best active vault for an asset, preferring the highest APY other than `excludeId`. */
function bestVaultFor(asset, excludeId) {
  const candidates = filter('vaults', (v) => v.asset === asset && v.status === 'active').sort(
    (a, b) => b.apy - a.apy,
  );
  if (candidates.length === 0) return null;
  const other = candidates.find((v) => v.id !== excludeId);
  return (other || candidates[0]).id;
}

function rebalanceReason(rng) {
  const r = rng();
  if (r < 0.6) return 'yield_optimization';
  if (r < 0.85) return 'capacity_rebalance';
  return 'risk_adjustment';
}

/**
 * Bring a position's rebalance history up to date deterministically.
 *
 * A per-position PRNG fixes a rebalance interval; the number of rebalances that
 * "should" have happened by now is replayed from the origin vault. The result is
 * idempotent — calling it any number of times yields the same stored state.
 */
export function maybeRebalance(position) {
  if (!position.origin_vault_id) position.origin_vault_id = position.vault_id;

  const rng = rngFromString(position.id);
  const intervalMs = (36 + rng() * 60) * 60 * 60 * 1000; // 36–96h, stable per position
  const startMs = Date.parse(position.opened_at);
  const endMs = position.status === 'active' ? Date.now() : Date.parse(position.updated_at);
  let desired = Math.floor((endMs - startMs) / intervalMs);
  desired = Math.max(0, Math.min(desired, MAX_REBALANCES));

  // Replay the full deterministic sequence from the origin vault.
  let curVault = position.origin_vault_id;
  const rebalances = [];
  const events = [];
  for (let i = 0; i < desired; i++) {
    const atMs = startMs + (i + 1) * intervalMs;
    const at = new Date(atMs).toISOString();
    const toId = bestVaultFor(position.asset, curVault);
    if (!toId || toId === curVault) break;
    const from = get('vaults', curVault);
    const to = get('vaults', toId);
    const reason = rebalanceReason(rng);
    const rb = {
      id: detId('rb', `${position.id}:${i}`),
      object: 'rebalance',
      position_id: position.id,
      from_vault: curVault,
      to_vault: toId,
      amount: position.principal,
      reason,
      apy_before: from ? from.apy : position.apy,
      apy_after: to ? to.apy : position.apy,
      at,
      tx_hash: detTxHash(`${position.id}:rb:${i}`),
    };
    rebalances.push(rb);
    events.push({
      id: detId('evt', rb.id),
      object: 'position_event',
      position_id: position.id,
      type: 'rebalance',
      at,
      amount: rb.amount,
      apy: rb.apy_after,
      vault_id: toId,
      note: `Rebalanced into ${to ? to.name : toId} (${reason})`,
    });
    curVault = toId;
  }

  // Reconcile store state (idempotent replace of this position's rows).
  const store = getStore();
  store.rebalances = store.rebalances.filter((r) => r.position_id !== position.id).concat(rebalances);
  store.positionEvents = store.positionEvents
    .filter((e) => !(e.position_id === position.id && e.type === 'rebalance'))
    .concat(events);

  if (rebalances.length > 0) {
    const last = rebalances[rebalances.length - 1];
    position.vault_id = last.to_vault;
    position.apy = last.apy_after;
    position.last_rebalance_at = last.at;
  }
  return position;
}

/** Serialize a position for API output: synced, accrued, internals stripped. */
export function serializePosition(position) {
  maybeRebalance(position);
  const pub = withAccrual(position);
  delete pub.withdrawn_total;
  delete pub.origin_vault_id;
  return pub;
}

/* ------------------------------------------------------------------ *
 * Yield aggregation
 * ------------------------------------------------------------------ */

const VALID_ASSETS = ['USDC', 'USDT'];

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

function weighted(vaults, field) {
  const totalAlloc = vaults.reduce((s, v) => s + (v.allocation_pct || 0), 0);
  if (totalAlloc > 0) {
    return vaults.reduce((s, v) => s + v[field] * (v.allocation_pct || 0), 0) / totalAlloc;
  }
  // Fall back to an equal-weight average when allocations are unset/zero.
  return vaults.reduce((s, v) => s + v[field], 0) / vaults.length;
}

/**
 * Aggregate yield for an asset (or all active vaults when asset is null).
 * Returns null if `asset` is provided but not a supported asset.
 */
export function yieldFor(asset = null) {
  // Normalize case so `/yield?asset=usdc` and `/yield/usdc` behave identically.
  if (asset) asset = String(asset).toUpperCase();
  if (asset && !VALID_ASSETS.includes(asset)) return null;
  const vaults = filter('vaults', (v) => v.status === 'active' && (!asset || v.asset === asset));
  if (vaults.length === 0) {
    return {
      object: 'yield',
      asset: asset || 'ALL',
      best_apy: 0,
      blend_apy: 0,
      blended_30d: 0,
      breakdown: [],
      history: [],
    };
  }

  const best_apy = round4(Math.max(...vaults.map((v) => v.apy)));
  const blend_apy = round4(weighted(vaults, 'apy'));
  const blended_30d = round4(weighted(vaults, 'apy_30d_avg'));
  const breakdown = vaults
    .slice()
    .sort((a, b) => b.apy - a.apy)
    .map((v) => ({
      vault_id: v.id,
      name: v.name,
      provider: v.provider,
      apy: v.apy,
      allocation: v.allocation_pct,
    }));

  // Deterministic 30-point history oscillating around the blended rate.
  const history = [];
  const dayMs = 24 * 60 * 60 * 1000;
  const now = Date.now();
  for (let i = 0; i < 30; i++) {
    const rng = rngFromString(`yieldhist:${asset || 'ALL'}:${i}`);
    const drift = (rng() - 0.5) * 0.01; // +/- 1% absolute wiggle
    history.push({ t: now - (29 - i) * dayMs, apy: round4(Math.max(0, blend_apy + drift)) });
  }

  return { object: 'yield', asset: asset || 'ALL', best_apy, blend_apy, blended_30d, breakdown, history };
}

/* ------------------------------------------------------------------ *
 * Usage series
 * ------------------------------------------------------------------ */

function bucketConfig(range) {
  if (range === '24h') return { count: 24, stepMs: 60 * 60 * 1000 };
  if (range === '7d') return { count: 7, stepMs: 24 * 60 * 60 * 1000 };
  return { count: 30, stepMs: 24 * 60 * 60 * 1000 }; // 30d default
}

/**
 * Deterministic plausible usage curve for a range, with real requestLog counts
 * layered onto the most recent bucket.
 */
export function usageSeries(range = '30d') {
  const { count, stepMs } = bucketConfig(range);
  const now = Date.now();
  const endBucketStart = Math.floor(now / stepMs) * stepMs;
  const log = all('requestLog');

  const series = [];
  let totReq = 0;
  let totErr = 0;
  let p50Sum = 0;
  let p99Max = 0;

  for (let i = 0; i < count; i++) {
    const t = endBucketStart - (count - 1 - i) * stepMs;
    const rng = rngFromString(`usage:${range}:${i}`);
    // Weekly seasonality for daily buckets.
    const weekday = new Date(t).getUTCDay();
    const weekendDamp = weekday === 0 || weekday === 6 ? 0.6 : 1;
    const requests = Math.round((1400 + 2600 * rng()) * weekendDamp);
    const errors = Math.round(requests * (0.004 + 0.02 * rng()));
    const p50_ms = Math.round(42 + 38 * rng());
    const p99_ms = Math.round(p50_ms * 2.4 + 90 * rng());

    let realReq = 0;
    let realErr = 0;
    if (i === count - 1) {
      // Layer real traffic recorded since boot onto the current bucket.
      for (const entry of log) {
        if (entry.t >= t && entry.t < t + stepMs) {
          realReq += 1;
          if (entry.status >= 400) realErr += 1;
        }
      }
    }

    const req = requests + realReq;
    const err = errors + realErr;
    series.push({ t, requests: req, errors: err, p50_ms, p99_ms });
    totReq += req;
    totErr += err;
    p50Sum += p50_ms;
    if (p99_ms > p99Max) p99Max = p99_ms;
  }

  const uniqueKeys = new Set(log.map((e) => e.keyId).filter(Boolean)).size;

  return {
    object: 'usage',
    range,
    totals: {
      requests: totReq,
      errors: totErr,
      p50_ms: Math.round(p50Sum / count),
      p99_ms: p99Max,
      unique_keys: uniqueKeys || 3,
    },
    series,
  };
}
