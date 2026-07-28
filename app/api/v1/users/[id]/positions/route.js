/** GET /api/v1/users/:id/positions — a user's positions (live accrual). */
import { apiHandler, OPTIONS, paginate } from '../../../../../../lib/api/http.js';
import { get, filter } from '../../../../../../lib/api/store.js';
import { serializePosition } from '../../../../../../lib/api/engine.js';

export { OPTIONS };

export const GET = apiHandler({}, async (request, ctx, api) => {
  const { id } = await ctx.params;
  const user = get('users', id);
  if (!user) return api.error('not_found', 'No user with that id.');

  const positions = filter('positions', (p) => p.user_id === id).map(serializePosition);
  const page = paginate(request, positions);
  return api.list(page.items, { meta: page.meta });
});
