/** GET /api/v1/analytics/uplift — routed value vs passive baselines. */
import { apiHandler, OPTIONS } from '../../../../../lib/api/http.js';
import { upliftReport } from '../../../../../lib/api/analytics.js';

export { OPTIONS };

export const GET = apiHandler({}, async (request, ctx, api) => {
  const { searchParams } = new URL(request.url);
  const report = upliftReport({
    user_id: searchParams.get('user_id') || undefined,
    asset: searchParams.get('asset') || undefined,
  });
  return api.json(report);
});
