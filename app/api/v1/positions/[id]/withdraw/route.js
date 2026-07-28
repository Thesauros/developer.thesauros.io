/** POST /api/v1/positions/:id/withdraw — partial or full withdrawal. */
import { apiHandler, OPTIONS, readJson, fail } from '../../../../../../lib/api/http.js';
import { get, create, randomId } from '../../../../../../lib/api/store.js';
import { serializePosition, withAccrual } from '../../../../../../lib/api/engine.js';
import { emit } from '../../../../../../lib/api/webhooks.js';

export { OPTIONS };

export const POST = apiHandler({}, async (request, ctx, api) => {
  const { id } = await ctx.params;
  const position = get('positions', id);
  if (!position) return api.error('not_found', 'No position with that id.');
  if (position.status === 'closed') fail('invalid_request', 'Position is already closed.');

  const body = await readJson(request);
  const now = new Date().toISOString();
  const live = withAccrual(position);
  const withdrawAll = body.all === true;

  let withdrawn;
  if (withdrawAll) {
    withdrawn = live.current_value;
    position.principal = 0;
    position.status = 'closed';
  } else {
    const amount = body.amount;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      fail('invalid_request', 'Provide a positive amount or { "all": true }.');
    }
    if (amount > live.current_value) {
      fail('invalid_request', `amount exceeds current value (${live.current_value}).`);
    }
    withdrawn = amount;
    // Rebase so the withdrawal preserves accrued yield exactly. Accrual is
    // principal * (1 + apy * elapsed) from opened_at, so simply subtracting
    // `amount` from principal would destroy the yield earned on the withdrawn
    // amount. Instead, carry the remaining value (current_value - amount)
    // forward as the new principal and reset the accrual origin to now — the
    // balance continues compounding from its true post-withdrawal value.
    position.principal = Math.round((live.current_value - amount) * 100) / 100;
    position.opened_at = now;
    position.withdrawn_total = Math.round(((position.withdrawn_total || 0) + amount) * 100) / 100;
  }
  position.updated_at = now;

  const closed = position.status === 'closed';
  create('positionEvents', {
    id: randomId('evt'),
    object: 'position_event',
    position_id: position.id,
    type: closed ? 'close' : 'withdraw',
    at: now,
    amount: withdrawn,
    apy: position.apy,
    vault_id: position.vault_id,
    note: closed ? 'Position closed; full balance withdrawn' : 'Partial withdrawal',
  });

  const serialized = serializePosition(position);
  emit(closed ? 'position.closed' : 'position.withdrawn', serialized);

  return api.json(serialized);
});
