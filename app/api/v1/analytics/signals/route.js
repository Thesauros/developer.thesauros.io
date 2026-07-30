/** GET /api/v1/analytics/signals — risk-adjusted signals + naive forecast. */
import { apiHandler, OPTIONS } from '../../../../../lib/api/http.js';
import { signals } from '../../../../../lib/api/analytics.js';

export { OPTIONS };

export const GET = apiHandler({}, async (request, ctx, api) => {
  const { searchParams } = new URL(request.url);
  const rows = signals(searchParams.get('asset') || undefined);
  return api.list(rows, { meta: { total: rows.length } });
});
