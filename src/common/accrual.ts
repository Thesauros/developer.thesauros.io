/**
 * Position value accrual — the single definition of "what is this position
 * worth right now" used by attribution, analytics and reconciliation alike.
 *
 * Closed positions stop accruing at `updated_at`; active ones accrue to now.
 */

export const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export interface AccruablePosition {
  principal: number;
  apy: number;
  status: string;
  opened_at: string;
  updated_at: string;
}

export interface Accrued {
  current_value: number;
  accrued_yield: number;
  /** Years the position has been earning, used by baseline comparisons. */
  elapsed_years: number;
}

/** Value of `position` at `at` (default: now). */
export function accrue<T extends AccruablePosition>(position: T, at = Date.now()): T & Accrued {
  const apy = position.apy ?? 0;
  const openedMs = Date.parse(String(position.opened_at));
  const endMs = position.status === 'closed' ? Date.parse(String(position.updated_at)) : at;
  const elapsed_years = Math.max(0, (endMs - openedMs) / YEAR_MS);
  const current_value = round2(position.principal * (1 + apy * elapsed_years));
  return {
    ...position,
    current_value,
    accrued_yield: round2(current_value - position.principal),
    elapsed_years,
  };
}

/** Value the same principal would have at a flat `apy` over the same period. */
export function baselineValue(principal: number, apy: number, elapsedYears: number): number {
  return round2(principal * (1 + apy * elapsedYears));
}

export function mean(values: number[]): number {
  return values.length ? values.reduce((s, x) => s + x, 0) / values.length : 0;
}

export function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((s, x) => s + (x - m) * (x - m), 0) / (values.length - 1));
}

/** Least-squares slope per index step over a numeric series. */
export function linearSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const xMean = (n - 1) / 2;
  const yMean = mean(values);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - yMean);
    den += (i - xMean) * (i - xMean);
  }
  return den === 0 ? 0 : num / den;
}
