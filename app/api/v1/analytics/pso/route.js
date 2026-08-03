/** GET /api/v1/analytics/pso — current PSO allocation for an asset. */
import { apiHandler, OPTIONS } from '../../../../../lib/api/http.js';
import { signals } from '../../../../../lib/api/analytics.js';
import { runPSO } from '../../../../../lib/api/pso.js';

export { OPTIONS };

export const GET = apiHandler({}, async (request, ctx, api) => {
  const { searchParams } = new URL(request.url);
  const asset = searchParams.get('asset') || undefined;
  const sig = signals(asset);
  const result = runPSO({ signals: sig });

  // Enrich weights with vault names for readability.
  const allocations = sig
    .map((s) => ({
      vault_id: s.vault_id,
      name: s.name,
      asset: s.asset,
      risk_tier: s.risk_tier,
      weight: result.weights[s.vault_id] || 0,
      risk_adjusted_apy: s.risk_adjusted_apy,
    }))
    .filter((a) => a.weight > 0.0001)
    .sort((a, b) => b.weight - a.weight);

  return api.json({
    object: 'pso_allocation',
    asset: asset || 'ALL',
    expected_return: result.expected_return,
    iterations: result.iterations,
    particles: result.particles,
    converged: result.converged,
    allocations,
  });
});
