/** DELETE /api/v1/keys/:id — revoke a key. */
import { apiHandler, OPTIONS, fail } from '../../../../../lib/api/http.js';
import { get, update } from '../../../../../lib/api/store.js';

export { OPTIONS };

// The shared sandbox bootstrap key is a public, documented credential that
// backs every anonymous portal session. Allowing it to be revoked would let
// any visitor permanently DoS the shared sandbox. It is non-revocable.
const NON_REVOCABLE = new Set(['key_bootstrap']);

export const DELETE = apiHandler({}, async (request, ctx, api) => {
  const { id } = await ctx.params;
  const key = get('keys', id);
  if (!key) return api.error('not_found', 'No API key with that id.');
  if (NON_REVOCABLE.has(key.id)) {
    fail('invalid_request', 'The shared sandbox key cannot be revoked.');
  }
  update('keys', key.id, { revoked: true });
  return api.json({ object: 'api_key', id: key.id, revoked: true });
});
