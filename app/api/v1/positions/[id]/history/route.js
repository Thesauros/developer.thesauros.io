/** GET /api/v1/positions/:id/history — position event timeline. */
import { apiHandler, OPTIONS, paginate } from '../../../../../../lib/api/http.js';
import { get, filter } from '../../../../../../lib/api/store.js';
import { maybeRebalance } from '../../../../../../lib/api/engine.js';

export { OPTIONS };

export const GET = apiHandler({}, async (request, ctx, api) => {
  const { id } = await ctx.params;
  const position = get('positions', id);
  if (!position) return api.error('not_found', 'No position with that id.');

  // Ensure deterministic rebalance events exist before reading the timeline.
  maybeRebalance(position);
  const events = filter('positionEvents', (e) => e.position_id === id).sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at),
  );
  const page = paginate(request, events);
  return api.list(page.items, { meta: page.meta });
});
