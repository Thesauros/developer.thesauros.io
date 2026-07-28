/** GET /api/v1/reconciliation/ledger — append-only ledger with running balance. */
import { apiHandler, OPTIONS, paginate } from '../../../../../lib/api/http.js';
import { buildLedger } from '../../../../../lib/api/engine.js';

export { OPTIONS };

export const GET = apiHandler({}, async (request, ctx, api) => {
  const { searchParams } = new URL(request.url);
  const entries = buildLedger({
    user_id: searchParams.get('user_id') || undefined,
    position_id: searchParams.get('position_id') || undefined,
    asset: searchParams.get('asset') || undefined,
    type: searchParams.get('type') || undefined,
  });
  const page = paginate(request, entries);
  return api.list(page.items, { meta: page.meta });
});
