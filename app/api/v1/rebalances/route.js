/** GET /api/v1/rebalances?position_id= — rebalance history. */
import { apiHandler, OPTIONS, paginate } from '../../../../lib/api/http.js';
import { all, filter } from '../../../../lib/api/store.js';
import { maybeRebalance } from '../../../../lib/api/engine.js';

export { OPTIONS };

export const GET = apiHandler({}, async (request, ctx, api) => {
  const { searchParams } = new URL(request.url);
  const positionId = searchParams.get('position_id');

  // Materialize deterministic rebalances for every position first.
  all('positions').forEach(maybeRebalance);

  const rebalances = filter('rebalances', (r) => !positionId || r.position_id === positionId).sort(
    (a, b) => Date.parse(b.at) - Date.parse(a.at),
  );
  const page = paginate(request, rebalances);
  return api.list(page.items, { meta: page.meta });
});
