/** GET /api/v1/reconciliation/report — recorded vs on-chain reconciliation. */
import { apiHandler, OPTIONS } from '../../../../../lib/api/http.js';
import { reconciliationReport } from '../../../../../lib/api/engine.js';

export { OPTIONS };

export const GET = apiHandler({}, async (request, ctx, api) => {
  const { searchParams } = new URL(request.url);
  const scope = searchParams.get('scope') || 'all';
  return api.json(reconciliationReport(scope));
});
