/** GET /api/v1/analytics/regime — market regime indicator. */
import { apiHandler, OPTIONS } from '../../../../../lib/api/http.js';
import { regime } from '../../../../../lib/api/analytics.js';

export { OPTIONS };

export const GET = apiHandler({}, async (request, ctx, api) => {
  const { searchParams } = new URL(request.url);
  return api.json(regime(searchParams.get('asset') || undefined));
});
