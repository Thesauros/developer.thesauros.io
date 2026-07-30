/** GET /api/v1/analytics/advisor — template-generated strategy summary. */
import { apiHandler, OPTIONS } from '../../../../../lib/api/http.js';
import { advisor } from '../../../../../lib/api/analytics.js';

export { OPTIONS };

export const GET = apiHandler({}, async (request, ctx, api) => {
  return api.json(advisor());
});
