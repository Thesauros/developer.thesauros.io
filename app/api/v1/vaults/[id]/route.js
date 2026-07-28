/** GET /api/v1/vaults/:id — a single vault. */
import { apiHandler, OPTIONS } from '../../../../../lib/api/http.js';
import { get } from '../../../../../lib/api/store.js';

export { OPTIONS };

export const GET = apiHandler({}, async (request, ctx, api) => {
  const { id } = await ctx.params;
  const vault = get('vaults', id);
  if (!vault) return api.error('not_found', 'No vault with that id.');
  return api.json(vault);
});
