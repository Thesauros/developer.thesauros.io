/** POST /api/v1/keys — create a key (secret shown once). GET — list (masked). */
import { apiHandler, OPTIONS, readJson, paginate, idempotent } from '../../../../lib/api/http.js';
import { generateKey, publicKey, listKeys } from '../../../../lib/api/auth.js';

export { OPTIONS };

export const POST = apiHandler({}, async (request, ctx, api) => {
  const body = await readJson(request);
  const environment = body.environment === 'live' ? 'live' : 'test';

  // Privilege separation: minting live keys is restricted to credentials that
  // hold the wildcard or an explicit keys:live scope. A regular scoped key
  // cannot escalate itself into the live environment.
  if (environment === 'live') {
    const scopes = (api.auth && api.auth.scopes) || [];
    if (!scopes.includes('*') && !scopes.includes('keys:live')) {
      return api.error('forbidden', 'Creating live keys requires the "keys:live" scope.', {
        status: 403,
      });
    }
  }

  // Idempotent: a retried create with the same Idempotency-Key returns the
  // original key (and its secret) instead of minting a duplicate.
  return idempotent(request, api.auth, api, async () => {
    // Scopes are server-assigned (see generateKey); client input is ignored.
    const key = generateKey({ label: body.label, environment });
    // Full secret is returned exactly once, at creation time.
    return { status: 201, body: { object: 'api_key', data: key } };
  });
});

export const GET = apiHandler({}, async (request, ctx, api) => {
  const keys = listKeys().map(publicKey);
  const page = paginate(request, keys);
  return api.list(page.items, { meta: page.meta });
});
