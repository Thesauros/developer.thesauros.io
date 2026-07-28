/** GET /api/v1/status — component health (public). */
import { apiHandler, OPTIONS } from '../../../../lib/api/http.js';
import { getStore } from '../../../../lib/api/store.js';

export { OPTIONS };

const COMPONENTS = [
  { id: 'api', name: 'REST API v1', status: 'operational', uptime_90d: 99.99, latency_ms: 48 },
  { id: 'engine', name: 'Routing & Rebalance Engine', status: 'operational', uptime_90d: 99.98, latency_ms: 61 },
  { id: 'webhooks', name: 'Webhook Delivery', status: 'operational', uptime_90d: 99.95, latency_ms: 132 },
  { id: 'data', name: 'Market Data Feed', status: 'operational', uptime_90d: 99.97, latency_ms: 89 },
];

export const GET = apiHandler({ public: true }, async (request, ctx, api) => {
  const store = getStore();
  const uptime_s = Math.floor((Date.now() - store.bootedAt) / 1000);
  const overall = COMPONENTS.every((c) => c.status === 'operational') ? 'operational' : 'degraded';
  return api.json({
    object: 'status',
    overall,
    components: COMPONENTS,
    incidents: [],
    uptime_s,
    updated_at: new Date().toISOString(),
  });
});
