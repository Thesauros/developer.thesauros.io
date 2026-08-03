/**
 * Market data provider — the DATA SEAM for the optimizer + backtester.
 *
 * THE CONTRACT (what the rest of the system relies on):
 *   getHistoricalSeries({ asset, from, to, stepMs })
 *     -> [{ t, rates: { [vault_id]: apy } }]   // apy as decimal fraction
 *   getVaults(asset) -> the active vault universe for an asset
 *
 * CURRENTLY this returns a deterministic simulation: each vault's APY is a
 * slow sinusoidal cycle (so rates trend and "best APY" chasing matters) plus
 * risk-tier-scaled daily noise, both seeded by vault id + absolute day. The
 * series is window-independent (anchored to absolute day indices), so a caller
 * asking for any [from, to] gets a consistent slice.
 *
 * TO CONNECT REAL DATA: replace the body of `apyAt()` / `getHistoricalSeries()`
 * with a read from your indexer / subgraph / on-chain source, keeping the same
 * return shape. Nothing above this file (PSO, backtester, routes, portal, SDK)
 * needs to change. That is the point of the seam.
 */

import { filter } from './store.js';
import { rngFromString } from './store.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Daily APY volatility by risk tier (absolute, decimal fraction). */
const VOL_BY_TIER = { bluechip: 0.0012, core: 0.0028, opportunistic: 0.0055 };

/** Absolute day index for a timestamp (window-independent anchor). */
function dayIndex(t) {
  return Math.floor(t / DAY_MS);
}

/**
 * Simulated APY for a vault on a given absolute day. Deterministic.
 * Swap this for a real-data lookup to connect live markets.
 */
function apyAt(vault, dIdx) {
  const vol = VOL_BY_TIER[vault.risk_tier] ?? 0.0028;
  // Daily noise, seeded by vault + day.
  const noiseRng = rngFromString(`mkt:${vault.id}:${dIdx}`);
  const noise = (noiseRng() - 0.5) * 2 * vol;
  // Slow cycle (~48-day period, ~0.9% absolute amplitude), phase seeded per vault.
  const phaseRng = rngFromString(`cycle:${vault.id}`);
  const phase = phaseRng() * Math.PI * 2;
  const cycle = 0.009 * Math.sin((dIdx / 48) * Math.PI * 2 + phase);
  return Math.max(0.001, vault.apy + cycle + noise);
}

/** Active vault universe for an asset. */
export function getVaults(asset = null) {
  if (asset) asset = String(asset).toUpperCase();
  return filter('vaults', (v) => v.status === 'active' && (!asset || v.asset === asset));
}

/**
 * Historical APY series for every active vault of an asset over [from, to].
 * @param {{asset?: string, from: number, to: number, stepMs?: number}} opts
 * @returns {Array<{t:number, rates:Object<string, number>}>}
 */
export function getHistoricalSeries({ asset = null, from, to, stepMs = DAY_MS }) {
  const vaults = getVaults(asset);
  const out = [];
  const start = Math.floor(from / stepMs) * stepMs;
  for (let t = start; t <= to; t += stepMs) {
    const dIdx = dayIndex(t);
    const rates = {};
    for (const v of vaults) rates[v.id] = apyAt(v, dIdx);
    out.push({ t, rates });
  }
  return out;
}

/** The Aave (bluechip baseline) vault for an asset, if present. */
export function getAaveVault(asset) {
  return getVaults(asset).find((v) => v.provider === 'aave') || null;
}
