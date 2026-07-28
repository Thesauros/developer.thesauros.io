/** GET /api/v1/positions/:id — a position with live accrued yield. */
import { apiHandler, OPTIONS } from '../../../../../lib/api/http.js';
import { get } from '../../../../../lib/api/store.js';
import { serializePosition } from '../../../../../lib/api/engine.js';

export { OPTIONS };

export const GET = apiHandler({}, async (request, ctx, api) => {
  const { id } = await ctx.params;
  const position = get('positions', id);
  if (!position) return api.error('not_found', 'No position with that id.');
  return api.json(serializePosition(position));
});
