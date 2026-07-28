/** GET /api/v1/webhooks/events?webhook_id= — delivery log with status. */
import { apiHandler, OPTIONS, paginate } from '../../../../../lib/api/http.js';
import { listDeliveries } from '../../../../../lib/api/webhooks.js';

export { OPTIONS };

export const GET = apiHandler({}, async (request, ctx, api) => {
  const { searchParams } = new URL(request.url);
  const webhookId = searchParams.get('webhook_id');
  const deliveries = listDeliveries(webhookId).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const page = paginate(request, deliveries);
  return api.list(page.items, { meta: page.meta });
});
