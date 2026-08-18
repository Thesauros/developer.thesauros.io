import { Injectable } from '@nestjs/common';
import { StoreService } from '../store/store.service';
import { ApySnapshotService } from './apy-snapshot.service';
import {
  DAY_MS,
  accrue,
  baselineValue,
  linearSlope,
  round2,
  round4,
  stddev,
} from '../common/accrual';

/** Days of observed history the signal/regime models read. */
const WINDOW_DAYS = 30;
/** Fewer observations than this and the models report nothing rather than guess. */
const MIN_OBSERVATIONS = 3;

/** Risk multiplier applied to raw APY to produce a risk-adjusted signal. */
const RISK_FACTOR: Record<string, number> = { bluechip: 1.0, core: 0.92, opportunistic: 0.82 };
const DEFAULT_RISK_FACTOR = 0.9;

/**
 * Venue every routed position is measured against ("would you have done
 * better just parking it here?"). Overridable because the passive benchmark
 * is a product decision, not a constant.
 */
const BASELINE_PROVIDER = process.env.ANALYTICS_BASELINE_PROVIDER ?? 'aave';

const REGIME_DESC: Record<string, string> = {
  rising: 'Rates are trending up; favor locking higher yields and tilting to longer-horizon venues.',
  falling: 'Rates are trending down; favor flexibility and capital preservation.',
  volatile: 'Rate signals are unstable; the risk model discounts forecast confidence and widens penalties.',
  stable: 'Rates are range-bound; optimize on risk-adjusted carry and low turnover.',
  unknown: 'Not enough observed rate history yet to classify a regime.',
};

interface VaultRow {
  id: string;
  name: string;
  provider: string;
  asset: string;
  chain: string;
  apy: number;
  risk_tier: string;
  status: string;
  allocation_pct: number;
}

interface PositionRow {
  id: string;
  user_id: string;
  partner_id: string | null;
  asset: string;
  vault_id: string;
  principal: number;
  apy: number;
  status: string;
  opened_at: string;
  updated_at: string;
}

interface PositionEventRow {
  id: string;
  position_id: string;
  type: string;
  at: string;
  amount: number;
  apy: number | null;
  vault_id: string | null;
  note: string | null;
}

export interface AnalyticsScope {
  /** Partner the calling key belongs to; null for protocol-level keys. */
  partnerId: string | null;
  userId?: string;
  positionId?: string;
  asset?: string;
}

function classifyRegime(slopeBpsPerDay: number, volatility: number): string {
  if (volatility > 0.0035) return 'volatile';
  if (slopeBpsPerDay > 0.5) return 'rising';
  if (slopeBpsPerDay < -0.5) return 'falling';
  return 'stable';
}

/**
 * Analytics over observed data only.
 *
 * Every number here traces back to a row: vault APY snapshots recorded hourly
 * by ApySnapshotService, and the partner's own positions and position events.
 * Where history is too short to support a statistic, the field is null and
 * `insufficient_history` says so — the endpoints never synthesise a series.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly store: StoreService,
    private readonly snapshots: ApySnapshotService,
  ) {}

  private normalizeAsset(asset?: string): string | undefined {
    return asset ? asset.toUpperCase() : undefined;
  }

  /** Observed APY series per vault over the analytics window, oldest first. */
  private async apySeries(asset?: string): Promise<Map<string, { at: number; apy: number; allocation_pct: number }[]>> {
    const since = Date.now() - WINDOW_DAYS * DAY_MS;
    const rows = await this.snapshots.history(since);
    const series = new Map<string, { at: number; apy: number; allocation_pct: number }[]>();
    for (const row of rows) {
      if (asset && row.asset !== asset) continue;
      const list = series.get(row.vault_id) ?? [];
      list.push({ at: new Date(row.at).getTime(), apy: row.apy, allocation_pct: row.allocation_pct });
      series.set(row.vault_id, list);
    }
    return series;
  }

  async signals(asset?: string) {
    const symbol = this.normalizeAsset(asset);
    const vaults = await this.store.filter<VaultRow & Record<string, unknown>>(
      'vaults',
      (v) => v.status === 'active' && (!symbol || v.asset === symbol),
    );
    const series = await this.apySeries(symbol);

    const rows = vaults.map((v) => {
      const observed = (series.get(v.id) ?? []).map((p) => p.apy);
      const enough = observed.length >= MIN_OBSERVATIONS;
      const volatility = enough ? round4(stddev(observed)) : null;
      // Snapshots are hourly; express the trend per day for readability.
      const slopePerDay = enough ? linearSlope(observed) * 24 : null;
      const riskFactor = RISK_FACTOR[v.risk_tier] ?? DEFAULT_RISK_FACTOR;
      const forecast =
        enough && slopePerDay !== null
          ? round4(Math.min(0.3, Math.max(0, observed[observed.length - 1] + slopePerDay * 7)))
          : null;
      return {
        object: 'signal',
        vault_id: v.id,
        name: v.name,
        provider: v.provider,
        asset: v.asset,
        chain: v.chain,
        risk_tier: v.risk_tier,
        apy: v.apy,
        volatility,
        trend_slope_bps_day: slopePerDay === null ? null : round2(slopePerDay * 10000),
        forecast_apy: forecast,
        risk_factor: riskFactor,
        // Without observed volatility the risk discount is the tier alone.
        risk_adjusted_apy: round4(v.apy * riskFactor - 0.5 * (volatility ?? 0)),
        observations: observed.length,
        insufficient_history: !enough,
      };
    });

    rows.sort((a, b) => b.risk_adjusted_apy - a.risk_adjusted_apy);
    return rows.map((row, i) => ({
      ...row,
      rank: i + 1,
      recommendation: i === 0 ? 'overweight' : i >= rows.length - 1 ? 'underweight' : 'neutral',
    }));
  }

  async regime(asset?: string) {
    const symbol = this.normalizeAsset(asset);
    const vaults = await this.store.filter<VaultRow & Record<string, unknown>>(
      'vaults',
      (v) => v.status === 'active' && (!symbol || v.asset === symbol),
    );
    const assets = [...new Set(vaults.map((v) => v.asset))].sort();
    const series = await this.apySeries(symbol);
    const vaultAsset = new Map(vaults.map((v) => [v.id, v.asset]));

    const perAsset = assets.map((a) => {
      // Allocation-weighted blend per hour bucket, so the regime tracks the
      // rate the protocol actually earns rather than an unweighted average.
      const byBucket = new Map<number, { weighted: number; weight: number }>();
      for (const [vaultId, points] of series) {
        if (vaultAsset.get(vaultId) !== a) continue;
        for (const point of points) {
          const slot = byBucket.get(point.at) ?? { weighted: 0, weight: 0 };
          const weight = point.allocation_pct > 0 ? point.allocation_pct : 1;
          slot.weighted += point.apy * weight;
          slot.weight += weight;
          byBucket.set(point.at, slot);
        }
      }
      const blended = [...byBucket.entries()]
        .sort((x, y) => x[0] - y[0])
        .map(([, slot]) => (slot.weight ? slot.weighted / slot.weight : 0));
      const enough = blended.length >= MIN_OBSERVATIONS;
      const slopeBpsPerDay = enough ? linearSlope(blended) * 24 * 10000 : null;
      const volatility = enough ? stddev(blended) : null;
      return {
        asset: a,
        regime: enough ? classifyRegime(slopeBpsPerDay as number, volatility as number) : 'unknown',
        blend_apy: blended.length ? round4(blended[blended.length - 1]) : null,
        trend_slope_bps_day: slopeBpsPerDay === null ? null : round2(slopeBpsPerDay),
        volatility: volatility === null ? null : round4(volatility),
        observations: blended.length,
      };
    });

    // Overall regime: the most cautious classification across assets.
    const order = ['volatile', 'falling', 'rising', 'stable'];
    const known = perAsset.filter((p) => p.regime !== 'unknown');
    const overall = known.length ? order.find((r) => known.some((p) => p.regime === r)) ?? 'stable' : 'unknown';

    return {
      object: 'regime',
      as_of: new Date().toISOString(),
      regime: overall,
      description: REGIME_DESC[overall],
      per_asset: perAsset,
    };
  }

  private async scopedPositions(scope: AnalyticsScope): Promise<PositionRow[]> {
    const asset = this.normalizeAsset(scope.asset);
    return this.store.filter<PositionRow & Record<string, unknown>>(
      'positions',
      (p) =>
        (!scope.partnerId || p.partner_id === scope.partnerId) &&
        (!scope.userId || p.user_id === scope.userId) &&
        (!scope.positionId || p.id === scope.positionId) &&
        (!asset || p.asset === asset),
    );
  }

  async uplift(scope: AnalyticsScope) {
    const positions = (await this.scopedPositions(scope)).filter((p) => p.status === 'active');
    const vaults = await this.store.filter<VaultRow & Record<string, unknown>>('vaults', () => true);
    const vaultById = new Map(vaults.map((v) => [v.id, v]));

    // Baseline venue per asset: the passive alternative to routing.
    const baselineApy = new Map<string, number>();
    for (const v of vaults) {
      if (v.provider === BASELINE_PROVIDER && v.status === 'active') baselineApy.set(v.asset, v.apy);
    }

    const events = await this.store.filter<PositionEventRow & Record<string, unknown>>(
      'positionEvents',
      () => true,
    );
    const originVault = new Map<string, string>();
    for (const e of events.filter((e) => e.type === 'deposit')) {
      if (e.vault_id && !originVault.has(e.position_id)) originVault.set(e.position_id, e.vault_id);
    }

    let principal = 0;
    let current = 0;
    let baseTotal = 0;
    let holdTotal = 0;
    let baselineCovered = 0;

    const rows = positions.map((p) => {
      const live = accrue(p);
      const baseApy = baselineApy.get(p.asset) ?? null;
      const baseVal = baseApy === null ? null : baselineValue(p.principal, baseApy, live.elapsed_years);
      const origin = vaultById.get(originVault.get(p.id) ?? p.vault_id);
      const holdApy = origin ? origin.apy : p.apy;
      const holdVal = baselineValue(p.principal, holdApy, live.elapsed_years);

      principal += p.principal;
      current += live.current_value;
      holdTotal += holdVal;
      if (baseVal !== null) {
        baseTotal += baseVal;
        baselineCovered += live.current_value;
      }

      return {
        object: 'uplift_row',
        position_id: p.id,
        user_id: p.user_id || null,
        asset: p.asset,
        vault_id: p.vault_id,
        principal: p.principal,
        current_value: live.current_value,
        apy: p.apy,
        aave_baseline: baseVal,
        baseline_provider: BASELINE_PROVIDER,
        baseline_apy: baseApy,
        hold_baseline: holdVal,
        uplift_vs_aave: baseVal === null ? null : round2(live.current_value - baseVal),
        uplift_vs_hold: round2(live.current_value - holdVal),
        // Realized is what accrued so far; projected annualises today's spread.
        realized_uplift: baseVal === null ? null : round2(live.current_value - baseVal),
        projected_uplift_annual:
          baseApy === null ? null : round2(p.principal * (p.apy - baseApy)),
      };
    });

    principal = round2(principal);
    current = round2(current);
    baseTotal = round2(baseTotal);
    holdTotal = round2(holdTotal);

    return {
      object: 'uplift',
      as_of: new Date().toISOString(),
      scope: scope.userId
        ? `user:${scope.userId}`
        : scope.asset
          ? `asset:${this.normalizeAsset(scope.asset)}`
          : scope.partnerId
            ? `partner:${scope.partnerId}`
            : 'all',
      totals: {
        principal,
        current_value: current,
        aave_baseline: baseTotal,
        hold_baseline: holdTotal,
        uplift_vs_aave: round2(round2(baselineCovered) - baseTotal),
        uplift_vs_hold: round2(current - holdTotal),
        uplift_vs_aave_pct:
          baseTotal > 0 ? round4(((round2(baselineCovered) - baseTotal) / baseTotal) * 100) : 0,
        // Positions whose asset has no baseline venue are excluded from the
        // baseline totals; without this the comparison silently understates.
        baseline_coverage: positions.length
          ? round4(rows.filter((r) => r.aave_baseline !== null).length / positions.length)
          : 0,
      },
      positions: rows,
    };
  }

  async decisions(scope: AnalyticsScope) {
    const positions = await this.scopedPositions(scope);
    const positionById = new Map(positions.map((p) => [p.id, p]));
    if (!positions.length) return [];

    const vaults = await this.store.filter<VaultRow & Record<string, unknown>>(
      'vaults',
      (v) => v.status === 'active',
    );
    const vaultById = new Map(vaults.map((v) => [v.id, v]));
    const alternativesByAsset = new Map<string, unknown[]>();
    for (const v of vaults) {
      const list = (alternativesByAsset.get(v.asset) ?? []) as unknown[];
      list.push({ vault_id: v.id, name: v.name, provider: v.provider, apy: v.apy, risk_tier: v.risk_tier });
      alternativesByAsset.set(v.asset, list);
    }
    for (const list of alternativesByAsset.values()) {
      (list as { apy: number }[]).sort((a, b) => b.apy - a.apy);
    }

    const events = (
      await this.store.filter<PositionEventRow & Record<string, unknown>>('positionEvents', (e) =>
        positionById.has(e.position_id),
      )
    ).sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

    const lastApy = new Map<string, number | null>();
    const lastVault = new Map<string, string | null>();
    const out: Record<string, unknown>[] = [];

    for (const e of events) {
      const p = positionById.get(e.position_id);
      if (!p) continue;
      const isRouting = e.type === 'deposit';
      const isRebalance = e.type === 'rebalance';
      if (!isRouting && !isRebalance) continue;

      const apyBefore = isRouting ? null : (lastApy.get(e.position_id) ?? null);
      const apyAfter = e.apy ?? null;
      const fromVault = isRouting ? null : (lastVault.get(e.position_id) ?? null);
      const toVault = e.vault_id ?? p.vault_id;
      const to = vaultById.get(toVault ?? '');
      const from = fromVault ? vaultById.get(fromVault) : null;
      const upliftBps =
        apyBefore !== null && apyAfter !== null ? round2((apyAfter - apyBefore) * 10000) : null;

      out.push({
        id: `dec_${e.id}`,
        object: 'decision',
        at: e.at,
        position_id: p.id,
        user_id: p.user_id || null,
        asset: p.asset,
        type: isRouting ? 'initial_routing' : 'rebalance',
        from_vault: fromVault,
        to_vault: toVault,
        apy_before: apyBefore,
        apy_after: apyAfter,
        expected_uplift_bps: upliftBps,
        reason: e.note ?? null,
        alternatives: alternativesByAsset.get(p.asset) ?? [],
        rationale: isRouting
          ? `Routed ${p.asset} deposit to ${to ? to.name : toVault}${
              apyAfter !== null ? ` at ${(apyAfter * 100).toFixed(2)}%` : ''
            }.${e.note ? ` ${e.note}` : ''}`
          : `Moved from ${from ? from.name : (fromVault ?? 'unknown')}${
              apyBefore !== null ? ` (${(apyBefore * 100).toFixed(2)}%)` : ''
            } to ${to ? to.name : toVault}${
              apyAfter !== null ? ` (${(apyAfter * 100).toFixed(2)}%)` : ''
            }${upliftBps !== null ? `; uplift ${upliftBps} bps` : ''}.${e.note ? ` ${e.note}` : ''}`,
        status: 'executed',
      });

      if (apyAfter !== null) lastApy.set(e.position_id, apyAfter);
      if (toVault) lastVault.set(e.position_id, toVault);
    }

    return out.sort((a, b) => new Date(b.at as string).getTime() - new Date(a.at as string).getTime());
  }

  async advisor(scope: AnalyticsScope) {
    const [reg, sig, up, decisions] = await Promise.all([
      this.regime(scope.asset),
      this.signals(scope.asset),
      this.uplift(scope),
      this.decisions(scope),
    ]);
    const top = sig.slice(0, 3);
    const totals = up.totals;

    const bullets: string[] = [];
    bullets.push(`Market regime is ${reg.regime}. ${reg.description}`);
    if (top.length) {
      bullets.push(
        `Best risk-adjusted venue right now: ${top[0].name} (${top[0].asset}) at ${(top[0].risk_adjusted_apy * 100).toFixed(2)}% risk-adjusted, ${(top[0].apy * 100).toFixed(2)}% raw, ${top[0].risk_tier} tier.`,
      );
    }
    const hasBaseline = totals.aave_baseline > 0;
    const beating = totals.uplift_vs_aave >= 0;
    if (hasBaseline) {
      bullets.push(
        `Routed capital is ${beating ? 'outperforming' : 'underperforming'} the ${BASELINE_PROVIDER}-only baseline by ${beating ? '+' : ''}$${totals.uplift_vs_aave.toFixed(2)} (${totals.uplift_vs_aave_pct}%) on $${totals.current_value.toFixed(2)} of value.`,
      );
    } else {
      bullets.push(`No ${BASELINE_PROVIDER} baseline venue is active, so passive comparison is unavailable.`);
    }
    const rebalances = decisions.filter((d) => d.type === 'rebalance').length;
    bullets.push(
      rebalances === 0
        ? 'No rebalance has been executed on these positions yet.'
        : `${rebalances} rebalance decision${rebalances === 1 ? '' : 's'} on record, each with its rationale.`,
    );
    const thin = sig.filter((s) => s.insufficient_history).length;
    if (thin) {
      bullets.push(
        `${thin} of ${sig.length} venues have under ${MIN_OBSERVATIONS} recorded observations; their trend and volatility are withheld rather than estimated.`,
      );
    }

    return {
      object: 'advisor',
      as_of: new Date().toISOString(),
      headline: !hasBaseline
        ? 'No passive baseline available; judging routing on risk-adjusted carry alone.'
        : beating
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
        current_value: totals.current_value,
        uplift_vs_aave: totals.uplift_vs_aave,
        uplift_vs_aave_pct: totals.uplift_vs_aave_pct,
        positions: up.positions.length,
      },
      disclaimer:
        'Derived from recorded vault APY observations and your own position history. Deterministic statistics, not an ML model or LLM, and not financial advice.',
    };
  }
}
