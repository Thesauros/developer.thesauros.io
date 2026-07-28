/** POST /api/v1/users — create an end-user. GET — list. */
import { apiHandler, OPTIONS, readJson, fail, paginate, idempotent } from '../../../../lib/api/http.js';
import { filter, create, randomId } from '../../../../lib/api/store.js';

export { OPTIONS };

const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateWallets(wallets) {
  if (wallets == null) return [];
  if (!Array.isArray(wallets)) fail('invalid_request', 'wallets must be an array of addresses.');
  for (const w of wallets) {
    if (!WALLET_RE.test(w)) fail('invalid_request', `Invalid wallet address "${w}".`);
  }
  return wallets;
}

export const POST = apiHandler({}, async (request, ctx, api) => {
  const body = await readJson(request);
  const external_id = body.external_id != null ? String(body.external_id).trim() : '';
  if (!external_id) fail('invalid_request', 'external_id is required (your customer id).');
  if (filter('users', (u) => u.external_id === external_id).length) {
    fail('invalid_request', `A user with external_id "${external_id}" already exists.`);
  }
  if (body.email != null && !EMAIL_RE.test(body.email)) fail('invalid_request', 'email is invalid.');
  const wallets = validateWallets(body.wallets);

  // Idempotent: a retried create with the same Idempotency-Key returns the
  // original user instead of failing on the external_id uniqueness check.
  return idempotent(request, api.auth, api, async () => {
    const now = new Date().toISOString();
    const user = create('users', {
      id: randomId('usr'),
      object: 'user',
      external_id,
      label: body.label != null ? String(body.label) : null,
      email: body.email != null ? String(body.email) : null,
      metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
      wallets,
      status: 'active',
      created_at: now,
      updated_at: now,
    });
    return { status: 201, body: { object: 'user', data: user } };
  });
});

export const GET = apiHandler({}, async (request, ctx, api) => {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const wallet = searchParams.get('wallet');
  const users = filter(
    'users',
    (u) => (!status || u.status === status) && (!wallet || (u.wallets || []).includes(wallet)),
  );
  const page = paginate(request, users);
  return api.list(page.items, { meta: page.meta });
});
