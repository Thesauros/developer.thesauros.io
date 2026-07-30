/** GET /api/v1/analytics/decisions — explainable decision log. */
import { apiHandler, OPTIONS, paginate } from '../../../../../lib/api/http.js';
import { decisions } from '../../../../../lib/api/analytics.js';

export { OPTIONS };

export const GET = apiHandler({}, async (request, ctx, api) => {
  const { searchParams } = new URL(request.url);
  const rows = decisions({
    user_id: searchParams.get('user_id') || undefined,
    position_id: searchParams.get('position_id') || undefined,
    asset: searchParams.get('asset') || undefined,
  });
  const page = paginate(request, rows);
  return api.list(page.items, { meta: page.meta });
});
