/** GET /api/v1/usage?range=24h|7d|30d — request/latency time series + totals. */
import { apiHandler, OPTIONS, fail } from '../../../../lib/api/http.js';
import { usageSeries } from '../../../../lib/api/engine.js';

export { OPTIONS };

const RANGES = ['24h', '7d', '30d'];

export const GET = apiHandler({}, async (request, ctx, api) => {
  const { searchParams } = new URL(request.url);
  const range = searchParams.get('range') || '30d';
  if (!RANGES.includes(range)) fail('invalid_request', 'range must be one of 24h, 7d, 30d.');
  return api.json(usageSeries(range));
});
