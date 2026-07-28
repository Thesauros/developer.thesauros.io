/** POST /api/v1/positions — open a position. GET — list (live accrued). */
import { apiHandler, OPTIONS, readJson, fail, paginate, idempotent } from '../../../../lib/api/http.js';
import { all, filter, create, get, randomId, detTxHash } from '../../../../lib/api/store.js';
import { serializePosition } from '../../../../lib/api/engine.js';
import { emit } from '../../../../lib/api/webhooks.js';

export { OPTIONS };

const ASSETS = ['USDC', 'USDT'];
const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;

/** Resolve the destination vault from an auto strategy or an explicit vault id. */
function chooseVault(asset, strategy) {
  if (strategy && strategy !== 'auto') {
    const vault = get('vaults', strategy);
    if (!vault || vault.asset !== asset || vault.status !== 'active') {
      fail('invalid_request', `strategy "${strategy}" is not an active vault for ${asset}.`);
    }
    return vault;
  }
  const best = filter('vaults', (v) => v.asset === asset && v.status === 'active').sort(
    (a, b) => b.apy - a.apy,
  )[0];
  if (!best) fail('invalid_request', `No active vault available for ${asset}.`);
  return best;
}

export const POST = apiHandler({}, async (request, ctx, api) => {
  const body = await readJson(request);
  const { wallet, asset, amount } = body;

  // Validate up front so malformed requests are never cached as idempotent.
  if (!wallet || !WALLET_RE.test(wallet)) {
    fail('invalid_request', 'wallet must be a 0x-prefixed 40-hex address.');
  }
  if (!ASSETS.includes(asset)) {
    fail('invalid_request', 'asset must be one of USDC, USDT.');
  }
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    fail('invalid_request', 'amount must be a positive number.');
  }
  const strategy = body.strategy || 'auto';
  const vault = chooseVault(asset, strategy);

  // Idempotent: a retried POST with the same Idempotency-Key returns the
  // original position instead of opening a duplicate.
  return idempotent(request, api.auth, api, async () => {
    const now = new Date().toISOString();
    const id = randomId('pos');

    const position = create('positions', {
      id,
      object: 'position',
      wallet,
      asset,
      chain: vault.chain,
      vault_id: vault.id,
      origin_vault_id: vault.id,
      strategy,
      principal: amount,
      withdrawn_total: 0,
      apy: vault.apy,
      // Sandbox settlement is synchronous: the position is active immediately.
      status: 'active',
      opened_at: now,
      updated_at: now,
      last_rebalance_at: null,
      tx_hash: detTxHash(id),
    });

    create('positionEvents', {
      id: randomId('evt'),
      object: 'position_event',
      position_id: id,
      type: 'deposit',
      at: now,
      amount,
      apy: vault.apy,
      vault_id: vault.id,
      note: 'Initial deposit routed to vault',
    });

    const serialized = serializePosition(position);

    // Fire-and-forget webhook fan-out.
    emit('position.opened', serialized);
    emit('position.active', serialized);

    return { status: 201, body: { object: 'position', data: serialized } };
  });
});

export const GET = apiHandler({}, async (request, ctx, api) => {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get('wallet');
  const status = searchParams.get('status');

  const positions = all('positions')
    .filter((p) => (!wallet || p.wallet === wallet) && (!status || p.status === status))
    .map(serializePosition);
  const page = paginate(request, positions);
  return api.list(page.items, { meta: page.meta });
});
