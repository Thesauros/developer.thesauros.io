/**
 * Type definitions for the Thesauros Developer Platform API v1.
 *
 * These types mirror the API contract one-to-one (see
 * `spec/developer-platform-architecture.md`, section 4). Field names use the
 * API's native `snake_case` so that SDK objects are wire-identical to the JSON
 * returned by the service.
 */

/* -------------------------------------------------------------------------- */
/* Envelopes                                                                   */
/* -------------------------------------------------------------------------- */

/** Metadata attached to a list response. */
export interface ListMeta {
  /** Total number of records available server-side for this query. */
  total: number;
  /** Forward-compatible: the API may add pagination fields later. */
  [key: string]: unknown;
}

/**
 * A single-object success envelope: `{ object, data, meta? }`.
 * The SDK unwraps `data` for you; `meta` is exposed via `client.lastResponse`.
 */
export interface SingleEnvelope<T> {
  object: string;
  data: T;
  meta?: Record<string, unknown>;
}

/** A list success envelope: `{ object: "list", data: [...], meta: { total } }`. */
export interface ListEnvelope<T> {
  object: 'list';
  data: T[];
  meta: ListMeta;
}

/** An error envelope: `{ error: { code, message, doc_url } }`. */
export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    doc_url?: string;
  };
}

/* -------------------------------------------------------------------------- */
/* Shared enums                                                                */
/* -------------------------------------------------------------------------- */

/** Key/environment namespace. Test keys (`tsk_test_`) hit the sandbox. */
export type Environment = 'test' | 'live';

/** Supported stablecoin assets. */
export type Asset = 'USDC' | 'USDT';

/** Supported deployment chains. */
export type Chain = 'base' | 'arbitrum';

/** Lending provider backing a vault. */
export type VaultProvider = 'aave' | 'morpho' | 'compound' | 'dolomite' | 'treasury';

/** Risk classification for a vault. */
export type RiskTier = 'bluechip' | 'core' | 'opportunistic';

/** Lifecycle status of a vault. */
export type VaultStatus = 'active' | 'paused';

/**
 * Position lifecycle status. In the sandbox, deposits activate synchronously
 * and withdrawals settle immediately, so only `active` and `closed` are
 * observable.
 */
export type PositionStatus = 'active' | 'closed';

/**
 * A position strategy: either the literal `"auto"` (let the engine route to the
 * best vault) or a specific `vault_id` to pin the position to one vault.
 * The `(string & {})` term preserves autocomplete for `"auto"` while still
 * accepting an arbitrary vault id string.
 */
export type PositionStrategy = 'auto' | (string & {});

/** The kind of event recorded in a position's history. */
export type PositionEventType = 'deposit' | 'rebalance' | 'accrual' | 'withdraw' | 'close';

/** Why the engine moved funds between vaults. */
export type RebalanceReason = 'yield_optimization' | 'risk_adjustment' | 'capacity_rebalance';

/** Webhook event topics that can be subscribed to. */
export type WebhookEventType =
  | 'position.opened'
  | 'position.active'
  | 'position.rebalanced'
  | 'position.withdrawn'
  | 'position.closed'
  | 'yield.threshold'
  | 'system.status';

/** Outcome of a webhook delivery attempt. */
export type DeliveryStatus = 'delivered' | 'failed';

/** Time range selector for usage telemetry. */
export type UsageRange = '24h' | '7d' | '30d';

/** Health status of a platform component (and of the system overall). */
export type ComponentStatus = 'operational' | 'degraded' | 'partial_outage' | 'major_outage';

/* -------------------------------------------------------------------------- */
/* 4.1 Keys                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * An API key. The full `secret` is returned in plaintext ONLY by
 * {@link KeysResource.create}; list responses mask it (e.g. `tsk_test_...a1b2`).
 */
export interface ApiKey {
  id: string;
  object: 'api_key';
  label: string;
  secret: string;
  prefix: string;
  environment: Environment;
  created_at: string;
  last_used_at: string | null;
  revoked: boolean;
  scopes: string[];
}

/** Result of revoking a key: `DELETE /keys/:id` -> `{ id, revoked: true }`. */
export interface RevokedKey {
  id: string;
  revoked: boolean;
}

/* -------------------------------------------------------------------------- */
/* 4.2 Vaults                                                                  */
/* -------------------------------------------------------------------------- */

/** A yield vault across a lending provider. */
export interface Vault {
  id: string;
  object: 'vault';
  name: string;
  provider: VaultProvider;
  asset: Asset;
  chain: Chain;
  /** Current annual percentage yield as a decimal fraction (`0.0642` == 6.42%). */
  apy: number;
  /** 7-day average APY, decimal fraction. */
  apy_7d_avg: number;
  /** 30-day average APY, decimal fraction. */
  apy_30d_avg: number;
  tvl_usd: number;
  capacity_usd: number;
  risk_tier: RiskTier;
  status: VaultStatus;
  inception_date: string;
  description: string;
  /** Current share of routed allocation as a decimal fraction (`0.28` == 28%). */
  allocation_pct: number;
}

/* -------------------------------------------------------------------------- */
/* 4.3 Yield                                                                   */
/* -------------------------------------------------------------------------- */

/** Per-vault contribution to a blended yield figure. */
export interface YieldBreakdown {
  vault_id: string;
  name: string;
  provider: VaultProvider;
  /** APY as a decimal fraction (`0.0642` == 6.42%). */
  apy: number;
  /** Allocation weight as a decimal fraction (`0.28` == 28%). */
  allocation: number;
}

/** A single point in a yield history series. */
export interface YieldHistoryPoint {
  /** Unix epoch timestamp in milliseconds. */
  t: number;
  /** APY as a decimal fraction. */
  apy: number;
}

/**
 * Aggregated yield for an asset. `GET /yield` returns the cross-asset aggregate
 * view; `GET /yield/:asset` returns per-asset detail with `breakdown` + `history`.
 * All `*_apy` fields are decimal fractions (`0.0642` == 6.42%).
 */
export interface Yield {
  object: 'yield';
  asset: string;
  best_apy: number;
  blend_apy: number;
  blended_30d: number;
  breakdown: YieldBreakdown[];
  history: YieldHistoryPoint[];
}

/* -------------------------------------------------------------------------- */
/* 4.4 Positions                                                               */
/* -------------------------------------------------------------------------- */

/** A deployed yield position. */
export interface Position {
  id: string;
  object: 'position';
  wallet: string;
  asset: string;
  chain: Chain;
  vault_id: string;
  strategy: string;
  principal: number;
  current_value: number;
  accrued_yield: number;
  /** APY as a decimal fraction (`0.0642` == 6.42%). */
  apy: number;
  status: PositionStatus;
  opened_at: string;
  updated_at: string;
  last_rebalance_at: string | null;
  tx_hash: string | null;
}

/** A single entry in a position's history log. */
export interface PositionEvent {
  id: string;
  type: PositionEventType;
  /** ISO-8601 timestamp of the event. */
  at: string;
  amount: number;
  apy: number;
  vault_id: string;
  note: string | null;
}

/* -------------------------------------------------------------------------- */
/* 4.5 Rebalances                                                              */
/* -------------------------------------------------------------------------- */

/** A movement of funds between two vaults for a position. */
export interface Rebalance {
  id: string;
  object: 'rebalance';
  position_id: string;
  from_vault: string;
  to_vault: string;
  amount: number;
  reason: RebalanceReason;
  apy_before: number;
  apy_after: number;
  /** ISO-8601 timestamp. */
  at: string;
  tx_hash: string | null;
}

/* -------------------------------------------------------------------------- */
/* 4.6 Webhooks                                                                */
/* -------------------------------------------------------------------------- */

/** A registered webhook endpoint. */
export interface Webhook {
  id: string;
  object: 'webhook';
  url: string;
  events: WebhookEventType[];
  /**
   * Signing secret (`whsec_...`) used to compute the `Webhook-Signature` header.
   * Returned in full only at creation; masked (`whsec_...a1b2`) in list responses.
   */
  secret: string;
  active: boolean;
  created_at: string;
}

/** A single webhook delivery attempt (also the shape of the event log entries). */
export interface Delivery {
  id: string;
  webhook_id: string;
  /** Target endpoint URL. */
  url: string;
  event: string;
  payload: Record<string, unknown>;
  /** The `Webhook-Signature` header value that was (or would be) sent. */
  signature: string;
  status: DeliveryStatus;
  attempts: number;
  /** ISO-8601 timestamp. */
  at: string;
  latency_ms: number;
}

/**
 * The unwrapped body of `DELETE /webhooks/:id`. The contract guarantees the
 * deleted id; any additional fields are tolerated via the index signature.
 */
export interface DeletionResult {
  id: string;
  [key: string]: unknown;
}

/* -------------------------------------------------------------------------- */
/* 4.7 Usage                                                                   */
/* -------------------------------------------------------------------------- */

/** Aggregate totals for a usage range. */
export interface UsageTotals {
  requests: number;
  errors: number;
  p50_ms: number;
  p99_ms: number;
  unique_keys: number;
}

/** A single point in the usage time series. */
export interface UsageSeriesPoint {
  /** Unix epoch timestamp in milliseconds. */
  t: number;
  requests: number;
  errors: number;
  p50_ms: number;
  p99_ms: number;
}

/** API usage telemetry. */
export interface Usage {
  object: 'usage';
  range: UsageRange;
  totals: UsageTotals;
  series: UsageSeriesPoint[];
}

/* -------------------------------------------------------------------------- */
/* 4.8 Status                                                                  */
/* -------------------------------------------------------------------------- */

/** Health of a single platform component. */
export interface StatusComponent {
  id: string;
  name: string;
  status: ComponentStatus;
  uptime_90d: number;
  latency_ms: number;
}

/**
 * A past or ongoing incident. The contract does not fix the incident schema, so
 * the fields below are the conventional minimum and extra fields are tolerated.
 */
export interface Incident {
  id: string;
  title: string;
  status: string;
  started_at: string;
  resolved_at: string | null;
  [key: string]: unknown;
}

/** Overall platform health. */
export interface Status {
  object: 'status';
  overall: ComponentStatus;
  components: StatusComponent[];
  incidents: Incident[];
  updated_at: string;
}

/* -------------------------------------------------------------------------- */
/* Request parameter shapes                                                    */
/* -------------------------------------------------------------------------- */

/** Body for `POST /keys`. */
export interface KeyCreateParams {
  label: string;
}

/** Query for `GET /vaults`. All filters are optional. */
export interface VaultListParams {
  asset?: Asset;
  chain?: Chain;
  status?: VaultStatus;
}

/** Body for `POST /positions`. */
export interface PositionCreateParams {
  wallet: string;
  asset: Asset;
  amount: number;
  strategy?: PositionStrategy;
}

/** Query for `GET /positions`. All filters are optional. */
export interface PositionListParams {
  wallet?: string;
  status?: PositionStatus;
}

/**
 * Body for `POST /positions/:id/withdraw`. Provide `amount` for a partial
 * withdrawal or `all: true` to close out the position entirely.
 */
export interface PositionWithdrawParams {
  amount?: number;
  all?: boolean;
}

/** Query for `GET /rebalances`. */
export interface RebalanceListParams {
  position_id?: string;
}

/** Body for `POST /webhooks`. */
export interface WebhookCreateParams {
  url: string;
  events: WebhookEventType[];
}

/** Query for `GET /webhooks/events`. */
export interface WebhookEventsParams {
  webhook_id?: string;
}

/** Query for `GET /usage`. */
export interface UsageGetParams {
  range?: UsageRange;
}
