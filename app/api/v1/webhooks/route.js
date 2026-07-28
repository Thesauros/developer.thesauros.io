/** POST /api/v1/webhooks — register an endpoint. GET — list. */
import { apiHandler, OPTIONS, readJson, fail, paginate, idempotent } from '../../../../lib/api/http.js';
import { all, create, randomId } from '../../../../lib/api/store.js';
import { SUPPORTED_EVENTS, publicWebhook } from '../../../../lib/api/webhooks.js';
import { assertSafeUrl } from '../../../../lib/api/urlguard.js';

export { OPTIONS };

export const POST = apiHandler({}, async (request, ctx, api) => {
  const body = await readJson(request);
  const { url } = body;
  if (!url) fail('invalid_request', 'url is required.');
  // SSRF guard: rejects non-http(s), loopback, private, link-local and
  // cloud-metadata targets. Throws a tagged invalid_request on failure.
  const safeUrl = assertSafeUrl(url);

  let events = body.events;
  if (events == null) events = ['*'];
  if (!Array.isArray(events) || events.length === 0) {
    fail('invalid_request', 'events must be a non-empty array.');
  }
  for (const e of events) {
    if (e !== '*' && !SUPPORTED_EVENTS.includes(e)) {
      fail('invalid_request', `Unsupported event "${e}". Supported: ${SUPPORTED_EVENTS.join(', ')}.`);
    }
  }

  // Idempotent: a retried register with the same Idempotency-Key returns the
  // original endpoint (and secret) instead of creating a duplicate.
  return idempotent(request, api.auth, api, async () => {
    const webhook = create('webhooks', {
      id: randomId('wh'),
      object: 'webhook',
      url: safeUrl,
      events,
      secret: randomId('whsec', 16),
      active: body.active !== false,
      created_at: new Date().toISOString(),
    });
    // Full secret is returned exactly once, at creation.
    return { status: 201, body: { object: 'webhook', data: webhook } };
  });
});

export const GET = apiHandler({}, async (request, ctx, api) => {
  // Secrets are masked in list responses.
  const page = paginate(request, all('webhooks').map(publicWebhook));
  return api.list(page.items, { meta: page.meta });
});
