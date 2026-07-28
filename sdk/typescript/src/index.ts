/**
 * @thesauros/sdk — official TypeScript SDK for the Thesauros Developer Platform.
 *
 * @packageDocumentation
 */

// Resource + envelope types.
export * from './types.js';

// Error hierarchy.
export * from './errors.js';

// Client + namespaced resources.
export {
  Thesauros,
  KeysResource,
  UsersResource,
  VaultsResource,
  YieldResource,
  PositionsResource,
  RebalancesResource,
  WebhooksResource,
  ReconciliationResource,
  UsageResource,
  StatusResource,
} from './client.js';

// Transport + configuration.
export { HttpClient, DEFAULT_BASE_URL } from './http.js';
export type { ClientConfig, LastResponse, RateLimitInfo, RequestOptions } from './http.js';

// Webhook signature verification.
export { verifyWebhookSignature } from './webhooks.js';
export type { VerifyOptions } from './webhooks.js';
