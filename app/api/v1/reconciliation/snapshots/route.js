/** GET /api/v1/reconciliation/snapshots — daily balance snapshots for period accounting. */
import { apiHandler, OPTIONS } from '../../../../../lib/api/http.js';
import { balanceSnapshots } from '../../../../../lib/api/engine.js';

export { OPTIONS };

export const GET = apiHandler({}, async (request, ctx, api) => {
  const { searchParams } = new URL(request.url);
  const snaps = balanceSnapshots({
    from: searchParams.get('from') || undefined,
    to: searchParams.get('to') || undefined,
    asset: searchParams.get('asset') || undefined,
  });
  return api.list(snaps, { meta: { total: snaps.length } });
});
