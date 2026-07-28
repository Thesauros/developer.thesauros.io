/** GET /api/v1/reconciliation/balances — current recorded balances by user/asset. */
import { apiHandler, OPTIONS } from '../../../../../lib/api/http.js';
import { balances } from '../../../../../lib/api/engine.js';

export { OPTIONS };

export const GET = apiHandler({}, async (request, ctx, api) => {
  const { searchParams } = new URL(request.url);
  const rows = balances({
    user_id: searchParams.get('user_id') || undefined,
    asset: searchParams.get('asset') || undefined,
  });
  return api.list(rows, { meta: { total: rows.length } });
});
