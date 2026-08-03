/**
 * Backtesting engine.
 *
 * Replays the (data-seam) historical rate series through competing allocation
 * strategies and compares them. This is the evidence the AI-over-PSO concept
 * needs: does optimization actually beat the passive baseline, over time, net
 * of the risk taken?
 *
 * Strategies:
 *   aave-only          — everything in the bluechip Aave vault (the baseline).
 *   best-apy           — each rebalance, chase the single highest current APY.
 *   risk-adjusted-pso  — each rebalance, run PSO on risk-adjusted signals and
 *                        allocate by the optimized weights.
 *
 * Compounding is daily: value *= (1 + weightedApy/365).
 */

import { getVaults, getHistoricalSeries, getAaveVault } from './marketdata.js';
import { runPSO } from './pso.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const YEAR_MS = 365 * DAY_MS;
const VOL_WINDOW = 30;

const RISK_FACTOR = { bluechip: 1.0, core: 0.92, opportunistic: 0.82 };

export const STRATEGIES = ['aave-only', 'best-apy', 'risk-adjusted-pso'];

function round2(n) {
  return Math.round(n * 100) / 100;
}
function round4(n) {
  return Math.round(n * 10000) / 10000;
}
function stddev(arr) {
  if (arr.length < 2) return 0;
  const m = arr.reduce((s, x) => s + x, 0) / arr.length;
  return Math.sqrt(arr.reduce((s, x) => s + (x - m) * (x - m), 0) / (arr.length - 1));
}

/** Risk-adjusted score per vault at series index i (uses trailing volatility). */
function scoresAt(series, vaults, i) {
  const lo = Math.max(0, i - VOL_WINDOW);
  const scores = {};
  for (const v of vaults) {
    const window = [];
    for (let j = lo; j <= i; j++) window.push(series[j].rates[v.id]);
    const vol = stddev(window);
    const apy = series[i].rates[v.id];
    scores[v.id] = apy * (RISK_FACTOR[v.risk_tier] || 0.9) - 0.5 * vol;
  }
  return scores;
}

/** Choose weights for a strategy at series index i. */
function weightsFor(strategy, { series, vaults, aaveVault, i, psoCache }) {
  if (strategy === 'aave-only') {
    const target = aaveVault || vaults[0];
    return { [target.id]: 1 };
  }
  if (strategy === 'best-apy') {
    let best = vaults[0];
    for (const v of vaults) {
      if (series[i].rates[v.id] > series[i].rates[best.id]) best = v;
    }
    return { [best.id]: 1 };
  }
  if (strategy === 'risk-adjusted-pso') {
    // Cache PSO per rebalance index (deterministic; avoids recomputation).
    if (!psoCache.has(i)) {
      const scores = scoresAt(series, vaults, i);
      const signals = vaults.map((v) => ({ vault_id: v.id, risk_adjusted_apy: scores[v.id] }));
      const res = runPSO({ signals, config: { seed: `bt:${i}` } });
      psoCache.set(i, res.weights);
    }
    return psoCache.get(i);
  }
  throw Object.assign(new Error(`Unknown strategy "${strategy}".`), { code: 'invalid_request' });
}

/**
 * Run a single backtest.
 * @param {{strategy:string, asset?:string, from:number, to:number, principal?:number, rebalanceEvery?:number}} opts
 */
export function runBacktest({ strategy, asset = null, from, to, principal = 10000, rebalanceEvery = 7 }) {
  if (!STRATEGIES.includes(strategy)) {
    throw Object.assign(new Error(`Unknown strategy "${strategy}". Valid: ${STRATEGIES.join(', ')}.`), {
      code: 'invalid_request',
    });
  }
  if (asset) asset = String(asset).toUpperCase();
  const vaults = getVaults(asset);
  if (!vaults.length) {
    throw Object.assign(new Error('No active vaults for that asset.'), { code: 'invalid_request' });
  }
  const aaveVault = getAaveVault(asset);
  const series = getHistoricalSeries({ asset, from, to });
  if (series.length < 2) {
    throw Object.assign(new Error('Range too small to backtest.'), { code: 'invalid_request' });
  }

  const psoCache = new Map();
  let value = principal;
  let weights = weightsFor(strategy, { series, vaults, aaveVault, i: 0, psoCache });
  let rebalances = 0;
  let peak = value;
  let maxDrawdown = 0;
  const dailyReturns = [];
  const curve = [{ t: series[0].t, value: round2(value) }];

  for (let i = 1; i < series.length; i++) {
    // Daily return under current weights.
    let dailyApy = 0;
    for (const v of vaults) {
      const w = weights[v.id] || 0;
      dailyApy += w * series[i].rates[v.id];
    }
    dailyReturns.push(dailyApy / 365);
    value *= 1 + dailyApy / 365;

    // Rebalance on schedule.
    if (rebalanceEvery > 0 && i % rebalanceEvery === 0) {
      weights = weightsFor(strategy, { series, vaults, aaveVault, i, psoCache });
      rebalances++;
    }

    peak = Math.max(peak, value);
    const dd = peak > 0 ? (peak - value) / peak : 0;
    maxDrawdown = Math.max(maxDrawdown, dd);
    curve.push({ t: series[i].t, value: round2(value) });
  }

  const years = Math.max(1e-9, (to - from) / YEAR_MS);
  const totalReturn = (value - principal) / principal;
  const apy = Math.pow(value / principal, 1 / years) - 1;
  // Annualized volatility of daily returns (the real risk metric in a
  // principal-preserving lending simulation, where drawdown stays ~0).
  const dailyVol = stddev(dailyReturns);
  const volatility = dailyVol * Math.sqrt(365);

  return {
    object: 'backtest',
    strategy,
    asset: asset || 'ALL',
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    days: series.length,
    principal,
    final_value: round2(value),
    total_return_pct: round4(totalReturn * 100),
    apy: round4(apy),
    volatility_pct: round4(volatility * 100),
    max_drawdown_pct: round4(maxDrawdown * 100),
    rebalances,
    series: curve,
  };
}

/**
 * Run all strategies over the same range and return them side by side, with the
 * uplift of each vs the aave-only baseline.
 */
export function compareBacktests({ asset = null, from, to, principal = 10000, rebalanceEvery = 7 }) {
  const results = STRATEGIES.map((strategy) =>
    runBacktest({ strategy, asset, from, to, principal, rebalanceEvery }),
  );
  const baseline = results.find((r) => r.strategy === 'aave-only');
  const strategies = results.map((r) => {
    const upliftVsBaseline = round2(r.final_value - baseline.final_value);
    return {
      strategy: r.strategy,
      final_value: r.final_value,
      total_return_pct: r.total_return_pct,
      apy: r.apy,
      volatility_pct: r.volatility_pct,
      max_drawdown_pct: r.max_drawdown_pct,
      rebalances: r.rebalances,
      uplift_vs_baseline: upliftVsBaseline,
    };
  });
  return {
    object: 'backtest_comparison',
    asset: asset || 'ALL',
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    principal,
    baseline: 'aave-only',
    strategies,
    series: results.map((r) => ({ strategy: r.strategy, points: r.series })),
  };
}
