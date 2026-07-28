/** DELETE /api/v1/webhooks/:id — remove an endpoint. */
import { apiHandler, OPTIONS } from '../../../../../lib/api/http.js';
import { get, remove } from '../../../../../lib/api/store.js';

export { OPTIONS };

export const DELETE = apiHandler({}, async (request, ctx, api) => {
  const { id } = await ctx.params;
  const webhook = get('webhooks', id);
  if (!webhook) return api.error('not_found', 'No webhook with that id.');
  remove('webhooks', id);
  return api.json({ object: 'webhook', id, deleted: true });
});
