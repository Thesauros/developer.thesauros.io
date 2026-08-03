/** GET /api/v1/analytics/backtests/compare — all strategies side by side. */
import { apiHandler, OPTIONS, fail } from '../../../../../../lib/api/http.js';
import { compareBacktests } from '../../../../../../lib/api/backtest.js';

export { OPTIONS };

const DAY_MS = 24 * 60 * 60 * 1000;

function parseBound(value, fallback) {
  if (value == null || value === '') return fallback;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 1e11) return numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const GET = apiHandler({}, async (request, ctx, api) => {
  const { searchParams } = new URL(request.url);
  const now = Date.now();
  const from = parseBound(searchParams.get('from'), now - 90 * DAY_MS);
  const to = parseBound(searchParams.get('to'), now);
  if (to <= from) fail('invalid_request', 'to must be after from.');

  const principal = Number(searchParams.get('principal')) || 10000;
  const rebalanceEvery = Number(searchParams.get('rebalance_every')) || 7;

  const result = compareBacktests({
    asset: searchParams.get('asset') || undefined,
    from,
    to,
    principal,
    rebalanceEvery,
  });
  return api.json(result);
});
