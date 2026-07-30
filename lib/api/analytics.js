/**
 * Analytics layer — the measurement + explainability foundation for the
 * AI-over-PSO concept (spec/AI_CONCEPT_STRATEGY.pdf).
 *
 * This is deliberately the *evidence-first* slice: baseline uplift tracking,
 * a decision log, risk-adjusted signals, a naive forecast, a regime indicator
 * and a template advisor. All deterministic, all derived from live sandbox
 * data. No ML models and no LLM — those require data and proof of uplift that
 * do not exist yet (see the critical assessment). Everything here is what a
 * real AI layer would need as its measurement + feature foundation anyway.
 */

import { filter, get, detId } from './store.js';
import { rngFromString } from './store.js';
import { withAccrual, maybeRebalance, yieldFor } from './engine.js';

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const VALID_ASSETS = ['USDC', 'USDT'];

/** Risk multiplier applied to raw APY to produce a risk-adjusted signal. */
const RISK_FACTOR = { bluechip: 1.0, core: 0.92, opportunistic: 0.82 };

function round2(n) {
  return Math.round(n * 100) / 100;
}
function round4(n) {
  return Math.round(n * 10000) / 10000;
}
function round6(n) {
  return Math.round(n * 1e6) / 1e6;
}
function mean(arr) {
  return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0;
}
function stddev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, x) => s + (x - m) * (x - m), 0) / (arr.length - 1));
}
/** Least-squares slope per index step over a numeric series. */
function linearSlope(arr) {
  const n = arr.length;
  if (n < 2) return 0;
  const xs = (n - 1) / 2;
  const ys = mean(arr);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xs) * (arr[i] - ys);
    den += (i - xs) * (i - xs);
  }
  return den === 0 ? 0 : num / den;
}

/** Deterministic 30-day APY history oscillating around a vault's rate. */
function vaultHistory(vaultId, apy) {
  const out = [];
  const now = Date.now();
  for (let i = 0; i < 30; i++) {
    const rng = rngFromString(`vaulthist:${vaultId}:${i}`);
    const drift = (rng() - 0.5) * 0.012;
    out.push({ t: now - (29 - i) * DAY_MS, apy: round4(Math.max(0, apy + drift)) });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Risk-adjusted signals + naive forecast (Layer 1 proxy)
 * ------------------------------------------------------------------ */

export function signals(asset = null) {
  if (asset) asset = String(asset).toUpperCase();
  const vaults = filter(
    'vaults',
    (v) => v.status === 'active' && (!asset || v.asset === asset),
  );

  const rows = vaults.map((v) => {
    const hist = vaultHistory(v.id, v.apy).map((h) => h.apy);
    const vol = stddev(hist);
    const slopePerDay = linearSlope(hist); // apy units per day
    const last = hist[hist.length - 1];
    // Naive 7-day forecast: linear extrapolation, clamped to a sane band.
    const forecast = Math.min(0.3, Math.max(0, last + slopePerDay * 7));
    const riskFactor = RISK_FACTOR[v.risk_tier] || 0.9;
    // Risk-adjusted signal: reward APY, discount by risk tier and volatility.
    const riskAdjusted = round4(v.apy * riskFactor - 0.5 * vol);
    return {
      object: 'signal',
      vault_id: v.id,
      name: v.name,
      provider: v.provider,
      asset: v.asset,
      chain: v.chain,
      risk_tier: v.risk_tier,
      apy: v.apy,
      volatility: round4(vol),
      trend_slope_bps_day: round2(slopePerDay * 10000),
      forecast_apy: round4(forecast),
      risk_factor: riskFactor,
      risk_adjusted_apy: riskAdjusted,
    };
  });

  rows.sort((a, b) => b.risk_adjusted_apy - a.risk_adjusted_apy);
  rows.forEach((r, i) => {
    r.rank = i + 1;
    r.recommendation = i === 0 ? 'overweight' : i >= rows.length - 1 ? 'underweight' : 'neutral';
  });
  return rows;
}

/* ------------------------------------------------------------------ *
 * Regime indicator (Layer 2 proxy)
 * ------------------------------------------------------------------ */

function classifyRegime(slopeBpsPerDay, vol) {
  if (vol > 0.0035) return 'volatile';
  if (slopeBpsPerDay > 0.5) return 'rising';
  if (slopeBpsPerDay < -0.5) return 'falling';
  return 'stable';
}

const REGIME_DESC = {
  rising: 'Rates are trending up; favor locking higher yields and tilting to longer-horizon venues.',
  falling: 'Rates are trending down; favor flexibility and capital preservation.',
  volatile: 'Rate signals are unstable; the risk model discounts forecast confidence and widens penalties.',
  stable: 'Rates are range-bound; optimize on risk-adjusted carry and low turnover.',
};

export function regime(asset = null) {
  if (asset) asset = String(asset).toUpperCase();
  const assets = asset ? [asset] : VALID_ASSETS;
  const perAsset = assets.map((a) => {
    const y = yieldFor(a);
    const hist = y.history.map((h) => h.apy);
    const slopeBpsPerDay = linearSlope(hist) * 10000;
    const vol = stddev(hist);
    return {
      asset: a,
      regime: classifyRegime(slopeBpsPerDay, vol),
      blend_apy: y.blend_apy,
      trend_slope_bps_day: round2(slopeBpsPerDay),
      volatility: round4(vol),
    };
  });

  // Overall regime: prefer the most cautious classification across assets.
  const order = ['volatile', 'falling', 'rising', 'stable'];
  const overall = order.find((r) => perAsset.some((p) => p.regime === r)) || 'stable';

  return {
    object: 'regime',
    as_of: new Date().toISOString(),
    regime: overall,
    description: REGIME_DESC[overall],
    per_asset: perAsset,
  };
}

/* ------------------------------------------------------------------ *
 * Uplift vs baselines (the concept's #1 proof point)
 * ------------------------------------------------------------------ */

export function upliftReport({ user_id, asset } = {}) {
  if (asset) asset = String(asset).toUpperCase();
  const positions = filter(
    'positions',
    (p) =>
      p.status === 'active' &&
      (!user_id || p.user_id === user_id) &&
      (!asset || p.asset === asset),
  );

  // Bluechip baseline: the Aave APY for each asset (passive "just use Aave").
  const aaveApy = {};
  for (const v of filter('vaults', (v) => v.provider === 'aave')) aaveApy[v.asset] = v.apy;

  const now = Date.now();
  let principal = 0;
  let current = 0;
  let aave = 0;
  let hold = 0;

  const rows = positions.map((p) => {
    maybeRebalance(p);
    const live = withAccrual(p);
    const elapsedYears = Math.max(0, (now - Date.parse(p.opened_at)) / YEAR_MS);

    const baseApy = aaveApy[p.asset] || 0;
    const aaveValue = round2(p.principal * (1 + baseApy * elapsedYears));

    const origin = get('vaults', p.origin_vault_id);
    const holdApy = origin ? origin.apy : p.apy;
    const holdValue = round2(p.principal * (1 + holdApy * elapsedYears));

    principal += p.principal;
    current += live.current_value;
    aave += aaveValue;
    hold += holdValue;

    return {
      object: 'uplift_row',
      position_id: p.id,
      user_id: p.user_id || null,
      asset: p.asset,
      vault_id: p.vault_id,
      principal: p.principal,
      current_value: live.current_value,
      apy: p.apy,
      aave_baseline: aaveValue,
      baseline_apy: baseApy,
      hold_baseline: holdValue,
      uplift_vs_aave: round2(live.current_value - aaveValue),
      uplift_vs_hold: round2(live.current_value - holdValue),
    };
  });

  principal = round2(principal);
  current = round2(current);
  aave = round2(aave);
  hold = round2(hold);

  return {
    object: 'uplift',
    as_of: new Date().toISOString(),
    scope: user_id ? `user:${user_id}` : asset ? `asset:${asset}` : 'all',
    totals: {
      principal,
      current_value: current,
      aave_baseline: aave,
      hold_baseline: hold,
      uplift_vs_aave: round2(current - aave),
      uplift_vs_hold: round2(current - hold),
      uplift_vs_aave_pct: aave > 0 ? round4(((current - aave) / aave) * 100) : 0,
    },
    positions: rows,
  };
}

/* ------------------------------------------------------------------ *
 * Decision log (explainability / audit trail)
 * ------------------------------------------------------------------ */

export function decisions({ user_id, position_id, asset } = {}) {
  if (asset) asset = String(asset).toUpperCase();
  const positions = filter(
    'positions',
    (p) =>
      (!user_id || p.user_id === user_id) &&
      (!position_id || p.id === position_id) &&
      (!asset || p.asset === asset),
  );

  const out = [];
  for (const p of positions) {
    maybeRebalance(p);
    const alternatives = filter('vaults', (v) => v.asset === p.asset && v.status === 'active')
      .map((v) => ({ vault_id: v.id, name: v.name, provider: v.provider, apy: v.apy, risk_tier: v.risk_tier }))
      .sort((a, b) => b.apy - a.apy);

    const deposit = filter(
      'positionEvents',
      (e) => e.position_id === p.id && e.type === 'deposit',
    )[0];
    if (deposit) {
      const chosen = get('vaults', deposit.vault_id);
      out.push({
        id: detId('dec', deposit.id),
        object: 'decision',
        at: deposit.at,
        position_id: p.id,
        user_id: p.user_id || null,
        asset: p.asset,
        type: 'initial_routing',
        from_vault: null,
        to_vault: deposit.vault_id,
        apy_before: null,
        apy_after: deposit.apy,
        expected_uplift_bps: null,
        alternatives,
        rationale: `Routed ${p.asset} deposit to ${chosen ? chosen.name : deposit.vault_id} at ${(deposit.apy * 100).toFixed(2)}% \u2014 best risk-adjusted venue at deposit time.`,
        status: 'executed',
      });
    }

    for (const rb of filter('rebalances', (r) => r.position_id === p.id)) {
      const to = get('vaults', rb.to_vault);
      const from = get('vaults', rb.from_vault);
      const upliftBps = round2((rb.apy_after - rb.apy_before) * 10000);
      out.push({
        id: detId('dec', rb.id),
        object: 'decision',
        at: rb.at,
        position_id: p.id,
        user_id: p.user_id || null,
        asset: p.asset,
        type: 'rebalance',
        from_vault: rb.from_vault,
        to_vault: rb.to_vault,
        apy_before: rb.apy_before,
        apy_after: rb.apy_after,
        expected_uplift_bps: upliftBps,
        reason: rb.reason,
        alternatives,
        rationale: `Rebalanced from ${from ? from.name : rb.from_vault} (${(rb.apy_before * 100).toFixed(2)}%) to ${to ? to.name : rb.to_vault} (${(rb.apy_after * 100).toFixed(2)}%); expected uplift ${upliftBps} bps (${rb.reason.replace(/_/g, ' ')}).`,
        status: 'executed',
      });
    }
  }

  return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/* ------------------------------------------------------------------ *
 * Template advisor (Layer 3 without LLM confabulation risk)
 * ------------------------------------------------------------------ */

export function advisor() {
  const reg = regime();
  const sig = signals();
  const up = upliftReport();
  const top = sig.slice(0, 3);
  const t = up.totals;

  const bullets = [];
  bullets.push(`Market regime is ${reg.regime}. ${reg.description}`);
  if (top.length) {
    bullets.push(
      `Best risk-adjusted venue right now: ${top[0].name} (${top[0].asset}) at ${(top[0].risk_adjusted_apy * 100).toFixed(2)}% risk-adjusted, ${(top[0].apy * 100).toFixed(2)}% raw, ${top[0].risk_tier} tier.`,
    );
  }
  const beating = t.uplift_vs_aave >= 0;
  bullets.push(
    `Routed portfolio is ${beating ? 'outperforming' : 'underperforming'} the Aave-only baseline by ${beating ? '+' : ''}$${t.uplift_vs_aave.toFixed(2)} (${t.uplift_vs_aave_pct}%) on $${t.current_value.toFixed(2)} of value.`,
  );
  const rebalanceCount = decisions({}).filter((d) => d.type === 'rebalance').length;
  bullets.push(
    `${rebalanceCount} rebalance decision${rebalanceCount === 1 ? '' : 's'} on record; each is logged with rationale and expected uplift.`,
  );

  return {
    object: 'advisor',
    as_of: new Date().toISOString(),
    headline: beating
      ? 'Routing is beating the passive baseline; hold the strategy and keep monitoring the regime.'
      : 'Routing is trailing the passive baseline; review venue selection and risk penalties.',
    regime: reg.regime,
    bullets,
    top_opportunities: top.map((s) => ({
      vault_id: s.vault_id,
      name: s.name,
      asset: s.asset,
      risk_adjusted_apy: s.risk_adjusted_apy,
      forecast_apy: s.forecast_apy,
      recommendation: s.recommendation,
    })),
    portfolio: {
      current_value: t.current_value,
      uplift_vs_aave: t.uplift_vs_aave,
      uplift_vs_aave_pct: t.uplift_vs_aave_pct,
      positions: up.positions.length,
    },
    disclaimer:
      'Deterministic sandbox advisor. Template-generated from live sandbox metrics, not an ML model or LLM, and not financial advice.',
  };
}
