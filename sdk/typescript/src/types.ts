/**
 * Type definitions for the Thesauros Developer Platform API v1.
 *
 * These types mirror the API contract one-to-one (see
 * `spec/developer-platform-architecture.md`, section 4). Field names use the
 * API's native `snake_case` so that SDK objects are wire-identical to the JSON
 * returned by the service.
 */

/* -------------------------------------------------------------------------- */
/* Request options                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Optional controls for mutating (create) requests.
 */
export interface CreateOptions {
  /**
   * Idempotency key. Retrying a create with the same key replays the original
   * response instead of producing a duplicate resource.
   */
  idempotencyKey?: string;
}

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

/** Lifecycle status of a user. */
export type UserStatus = 'active' | 'disabled';

/** The kind of movement recorded in the ledger. */
export type LedgerEntryType = 'deposit' | 'withdraw' | 'close' | 'accrual';

/** Outcome of a reconciliation run. */
export type ReconciliationStatus = 'reconciled' | 'mismatch';

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
/* 4.9 Users                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A platform user, mapped to one or more wallets and an external identifier in
 * the caller's own system.
 */
export interface User {
  id: string;
  object: 'user';
  /** The caller's own unique identifier for this user. */
  external_id: string;
  label: string | null;
  email: string | null;
  metadata: Record<string, unknown>;
  wallets: string[];
  status: UserStatus;
  created_at: string;
  updated_at: string;
}

/**
 * A single ledger entry recording a signed movement of funds. `amount` is
 * signed (deposits/accruals positive, withdrawals/closes negative).
 */
export interface LedgerEntry {
  id: string;
  object: 'ledger_entry';
  /** ISO-8601 timestamp. */
  at: string;
  user_id: string | null;
  position_id: string;
  wallet: string;
  asset: string;
  type: LedgerEntryType;
  /** Signed amount. */
  amount: number;
  balance_after: number;
  vault_id: string;
  settled: boolean;
  ref: string;
}

/* -------------------------------------------------------------------------- */
/* 4.10 Reconciliation                                                         */
/* -------------------------------------------------------------------------- */

/** An aggregated balance for a user (or the whole platform) and asset. */
export interface Balance {
  object: 'balance';
  user_id: string | null;
  asset: string;
  principal: number;
  current_value: number;
  accrued_yield: number;
  /** Number of positions contributing to this balance. */
  positions: number;
}

/** Per-asset contribution to a reconciliation result. */
export interface ReconciliationBreakdown {
  asset: string;
  recorded: number;
  onchain: number;
  discrepancy: number;
}

/**
 * The result of comparing recorded balances against on-chain balances. All
 * monetary fields are in the asset's native units; `tolerance` is the threshold
 * within which a `discrepancy` is still considered `reconciled`.
 */
export interface Reconciliation {
  object: 'reconciliation';
  /** ISO-8601 timestamp the reconciliation was computed at. */
  as_of: string;
  scope: string;
  recorded_total: number;
  onchain_total: number;
  discrepancy: number;
  unsettled_yield: number;
  tolerance: number;
  status: ReconciliationStatus;
  /** Number of positions included in the reconciliation. */
  positions: number;
  breakdown: ReconciliationBreakdown[];
}

/** A point-in-time snapshot of platform balances. */
export interface BalanceSnapshot {
  object: 'balance_snapshot';
  /** Calendar date (`YYYY-MM-DD`). */
  date: string;
  /** Unix epoch timestamp in milliseconds. */
  t: number;
  principal: number;
  value: number;
  accrued: number;
  /** Number of positions at snapshot time. */
  positions: number;
  /** Number of users at snapshot time. */
  users: number;
  by_asset: Record<string, unknown>[];
}

/* -------------------------------------------------------------------------- */
/* 4.11 Analytics                                                              */
/* -------------------------------------------------------------------------- */

/** A vault's directional recommendation derived from its signal. */
export type SignalRecommendation = 'overweight' | 'neutral' | 'underweight';

/** The prevailing interest-rate regime for an asset (or the market overall). */
export type MarketRegime = 'rising' | 'falling' | 'stable' | 'volatile';

/** The kind of routing decision recorded by the engine. */
export type DecisionType = 'initial_routing' | 'rebalance';

/**
 * A per-vault yield signal. All `*_apy` fields, `volatility`, and `risk_factor`
 * are decimal fractions (`0.0642` == 6.42%); `trend_slope_bps_day` is a slope in
 * basis points per day.
 */
export interface Signal {
  object: 'signal';
  vault_id: string;
  name: string;
  provider: VaultProvider;
  asset: Asset;
  chain: Chain;
  risk_tier: RiskTier;
  /** Current APY as a decimal fraction (`0.0642` == 6.42%). */
  apy: number;
  /** APY volatility as a decimal fraction. */
  volatility: number;
  /** Trend slope in basis points per day. */
  trend_slope_bps_day: number;
  /** Forecast APY as a decimal fraction. */
  forecast_apy: number;
  /** Multiplicative risk factor applied to derive the risk-adjusted APY. */
  risk_factor: number;
  /** Risk-adjusted APY as a decimal fraction. */
  risk_adjusted_apy: number;
  /** Rank across all vaults (1 = best). */
  rank: number;
  recommendation: SignalRecommendation;
}

/** Per-asset contribution to a market regime report. */
export interface RegimeAsset {
  asset: string;
  regime: MarketRegime;
  /** Blended APY as a decimal fraction (`0.0642` == 6.42%). */
  blend_apy: number;
  /** Trend slope in basis points per day. */
  trend_slope_bps_day: number;
  /** APY volatility as a decimal fraction. */
  volatility: number;
}

/** The current market regime and its per-asset breakdown. */
export interface Regime {
  object: 'regime';
  /** ISO-8601 timestamp the regime was computed at. */
  as_of: string;
  regime: MarketRegime;
  description: string;
  per_asset: RegimeAsset[];
}

/** Aggregate totals for an uplift report. */
export interface UpliftTotals {
  principal: number;
  current_value: number;
  aave_baseline: number;
  hold_baseline: number;
  uplift_vs_aave: number;
  uplift_vs_hold: number;
  /** Uplift vs. the Aave-only baseline as a decimal fraction (`0.0006` == 0.06%). */
  uplift_vs_aave_pct: number;
}

/** A single position's contribution to an uplift report. */
export interface UpliftRow {
  object: 'uplift_row';
  position_id: string;
  user_id: string | null;
  asset: string;
  vault_id: string;
  principal: number;
  current_value: number;
  /** APY as a decimal fraction (`0.0642` == 6.42%). */
  apy: number;
  aave_baseline: number;
  /** Baseline APY as a decimal fraction. */
  baseline_apy: number;
  hold_baseline: number;
  uplift_vs_aave: number;
  uplift_vs_hold: number;
}

/**
 * A comparison of routed portfolio value against passive baselines (Aave-only
 * and hold). All monetary fields are in the asset's native units;
 * `uplift_vs_aave_pct` is a decimal fraction.
 */
export interface UpliftReport {
  object: 'uplift';
  /** ISO-8601 timestamp the report was computed at. */
  as_of: string;
  scope: string;
  totals: UpliftTotals;
  positions: UpliftRow[];
}

/** A vault considered alongside a routing decision. */
export interface DecisionAlternative {
  vault_id: string;
  name: string;
  provider: VaultProvider;
  /** APY as a decimal fraction (`0.0642` == 6.42%). */
  apy: number;
  risk_tier: RiskTier;
}

/** A single routing/rebalance decision with its rationale. */
export interface Decision {
  object: 'decision';
  id: string;
  /** ISO-8601 timestamp of the decision. */
  at: string;
  position_id: string;
  user_id: string | null;
  asset: string;
  type: DecisionType;
  from_vault: string | null;
  to_vault: string;
  /** APY before the move as a decimal fraction (`null` for initial routing). */
  apy_before: number | null;
  /** APY after the move as a decimal fraction. */
  apy_after: number;
  /** Expected uplift in basis points (`null` when not applicable). */
  expected_uplift_bps: number | null;
  reason?: string;
  alternatives: DecisionAlternative[];
  rationale: string;
  status: string;
}

/** A top opportunity surfaced by the advisor. */
export interface AdvisorOpportunity {
  vault_id: string;
  name: string;
  asset: string;
  /** Risk-adjusted APY as a decimal fraction (`0.0642` == 6.42%). */
  risk_adjusted_apy: number;
  /** Forecast APY as a decimal fraction. */
  forecast_apy: number;
  recommendation: SignalRecommendation;
}

/** Portfolio summary embedded in the advisor report. */
export interface AdvisorPortfolio {
  current_value: number;
  uplift_vs_aave: number;
  /** Uplift vs. the Aave-only baseline as a decimal fraction. */
  uplift_vs_aave_pct: number;
  /** Number of positions in the portfolio. */
  positions: number;
}

/** A human-readable advisory summarizing regime, opportunities, and portfolio. */
export interface Advisor {
  object: 'advisor';
  /** ISO-8601 timestamp the advisory was computed at. */
  as_of: string;
  headline: string;
  regime: MarketRegime;
  bullets: string[];
  top_opportunities: AdvisorOpportunity[];
  portfolio: AdvisorPortfolio;
  disclaimer: string;
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
  /** Optional end-user association: a user id (`usr_...`) or `external_id`. */
  user?: string;
}

/** Query for `GET /positions`. All filters are optional. */
export interface PositionListParams {
  wallet?: string;
  status?: PositionStatus;
  user_id?: string;
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

/** Body for `POST /users`. `external_id` is required; all else is optional. */
export interface UserCreateParams {
  external_id: string;
  label?: string;
  email?: string;
  metadata?: Record<string, unknown>;
  wallets?: string[];
}

/** Query for `GET /users`. All filters are optional. */
export interface UserListParams {
  status?: UserStatus;
  wallet?: string;
  limit?: number;
  cursor?: string;
}

/** Body for `PATCH /users/:id`. All fields are optional. */
export interface UserUpdateParams {
  label?: string;
  email?: string;
  metadata?: Record<string, unknown>;
  wallets?: string[];
  status?: UserStatus;
}

/** Query for `GET /users/:id/positions`. All filters are optional. */
export interface UserPositionsParams {
  status?: PositionStatus;
  limit?: number;
  cursor?: string;
}

/** Query for `GET /users/:id/ledger`. All filters are optional. */
export interface UserLedgerParams {
  asset?: string;
  type?: LedgerEntryType;
  limit?: number;
  cursor?: string;
}

/** Query for `GET /reconciliation/ledger`. All filters are optional. */
export interface ReconciliationLedgerParams {
  user_id?: string;
  position_id?: string;
  asset?: string;
  type?: LedgerEntryType;
  limit?: number;
  cursor?: string;
}

/** Query for `GET /reconciliation/balances`. All filters are optional. */
export interface ReconciliationBalancesParams {
  user_id?: string;
  asset?: string;
}

/** Query for `GET /reconciliation/report`. */
export interface ReconciliationReportParams {
  scope?: string;
}

/** Query for `GET /reconciliation/snapshots`. All filters are optional. */
export interface ReconciliationSnapshotsParams {
  from?: string;
  to?: string;
  asset?: string;
}

/** Query for `GET /analytics/uplift`. All filters are optional. */
export interface AnalyticsUpliftParams {
  user_id?: string;
  asset?: string;
}

/** Query for `GET /analytics/decisions`. All filters are optional. */
export interface AnalyticsDecisionsParams {
  user_id?: string;
  position_id?: string;
  asset?: string;
  limit?: number;
  cursor?: string;
}

/** Query for `GET /analytics/signals`. */
export interface AnalyticsSignalsParams {
  asset?: string;
}

/** Query for `GET /analytics/regime`. */
export interface AnalyticsRegimeParams {
  asset?: string;
}
