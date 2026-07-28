/** POST /api/v1/webhooks/:id/test — dispatch a synthetic event, return delivery. */
import { apiHandler, OPTIONS } from '../../../../../../lib/api/http.js';
import { get } from '../../../../../../lib/api/store.js';
import { dispatch } from '../../../../../../lib/api/webhooks.js';

export { OPTIONS };

export const POST = apiHandler({}, async (request, ctx, api) => {
  const { id } = await ctx.params;
  const webhook = get('webhooks', id);
  if (!webhook) return api.error('not_found', 'No webhook with that id.');

  const { delivery } = await dispatch(webhook, 'system.status', {
    test: true,
    message: 'Synthetic test event from the Thesauros sandbox.',
    webhook_id: webhook.id,
  });
  // Returned regardless of delivery outcome so the portal can show the signed payload.
  return api.json(delivery);
});
