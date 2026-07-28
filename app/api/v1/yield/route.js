/** GET /api/v1/yield?asset= — aggregated best/blend yield. */
import { apiHandler, OPTIONS } from '../../../../lib/api/http.js';
import { yieldFor } from '../../../../lib/api/engine.js';

export { OPTIONS };

export const GET = apiHandler({}, async (request, ctx, api) => {
  const { searchParams } = new URL(request.url);
  const asset = searchParams.get('asset');
  const result = yieldFor(asset);
  if (!result) return api.error('not_found', `Unsupported asset "${asset}". Use USDC or USDT.`);
  return api.json(result);
});
