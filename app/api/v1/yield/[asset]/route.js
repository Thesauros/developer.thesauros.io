/** GET /api/v1/yield/:asset — per-asset detail with breakdown + history. */
import { apiHandler, OPTIONS } from '../../../../../lib/api/http.js';
import { yieldFor } from '../../../../../lib/api/engine.js';

export { OPTIONS };

export const GET = apiHandler({}, async (request, ctx, api) => {
  const { asset } = await ctx.params;
  const result = yieldFor(String(asset).toUpperCase());
  if (!result) return api.error('not_found', `Unsupported asset "${asset}". Use USDC or USDT.`);
  return api.json(result);
});
