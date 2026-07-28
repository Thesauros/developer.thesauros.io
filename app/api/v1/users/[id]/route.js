/** GET /api/v1/users/:id — fetch a user. PATCH — update. */
import { apiHandler, OPTIONS, readJson, fail } from '../../../../../lib/api/http.js';
import { get, update } from '../../../../../lib/api/store.js';

export { OPTIONS };

const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const GET = apiHandler({}, async (request, ctx, api) => {
  const { id } = await ctx.params;
  const user = get('users', id);
  if (!user) return api.error('not_found', 'No user with that id.');
  return api.json(user);
});

export const PATCH = apiHandler({}, async (request, ctx, api) => {
  const { id } = await ctx.params;
  const user = get('users', id);
  if (!user) return api.error('not_found', 'No user with that id.');

  const body = await readJson(request);
  const patch = {};
  if (body.label !== undefined) patch.label = body.label != null ? String(body.label) : null;
  if (body.email !== undefined) {
    if (body.email != null && !EMAIL_RE.test(body.email)) fail('invalid_request', 'email is invalid.');
    patch.email = body.email != null ? String(body.email) : null;
  }
  if (body.metadata !== undefined) {
    if (body.metadata != null && typeof body.metadata !== 'object') {
      fail('invalid_request', 'metadata must be an object.');
    }
    patch.metadata = body.metadata || {};
  }
  if (body.wallets !== undefined) {
    if (!Array.isArray(body.wallets)) fail('invalid_request', 'wallets must be an array of addresses.');
    for (const w of body.wallets) {
      if (!WALLET_RE.test(w)) fail('invalid_request', `Invalid wallet address "${w}".`);
    }
    patch.wallets = body.wallets;
  }
  if (body.status !== undefined) {
    if (!['active', 'disabled'].includes(body.status)) {
      fail('invalid_request', 'status must be "active" or "disabled".');
    }
    patch.status = body.status;
  }
  patch.updated_at = new Date().toISOString();

  const updated = update('users', id, patch);
  return api.json(updated);
});
