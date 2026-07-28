/** GET /api/v1/users/:id/ledger — a user's reconciliation ledger. */
import { apiHandler, OPTIONS, paginate } from '../../../../../../lib/api/http.js';
import { get } from '../../../../../../lib/api/store.js';
import { buildLedger } from '../../../../../../lib/api/engine.js';

export { OPTIONS };

export const GET = apiHandler({}, async (request, ctx, api) => {
  const { id } = await ctx.params;
  const user = get('users', id);
  if (!user) return api.error('not_found', 'No user with that id.');

  const { searchParams } = new URL(request.url);
  const entries = buildLedger({
    user_id: id,
    asset: searchParams.get('asset') || undefined,
    type: searchParams.get('type') || undefined,
  });
  const page = paginate(request, entries);
  return api.list(page.items, { meta: page.meta });
});
