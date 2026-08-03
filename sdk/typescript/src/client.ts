/**
 * The {@link Thesauros} client and its namespaced resource objects.
 *
 * Each resource mirrors a group of API endpoints one-to-one. Resource methods
 * return the unwrapped envelope `data` directly; envelope `meta`, the request
 * id, and rate-limit headers from the most recent call are available on
 * `client.lastResponse` (and `client.lastMeta`).
 */

import { HttpClient, type ClientConfig, type LastResponse } from './http.js';
import type {
  Advisor,
  AnalyticsBacktestParams,
  AnalyticsBacktestsCompareParams,
  AnalyticsDecisionsParams,
  AnalyticsPsoParams,
  AnalyticsRegimeParams,
  AnalyticsSignalsParams,
  AnalyticsUpliftParams,
  ApiKey,
  Backtest,
  BacktestComparison,
  Balance,
  BalanceSnapshot,
  CreateOptions,
  Decision,
  DeletionResult,
  Delivery,
  KeyCreateParams,
  LedgerEntry,
  Position,
  PositionCreateParams,
  PositionEvent,
  PositionListParams,
  PositionWithdrawParams,
  PsoAllocation,
  Rebalance,
  RebalanceListParams,
  Reconciliation,
  ReconciliationBalancesParams,
  ReconciliationLedgerParams,
  ReconciliationReportParams,
  ReconciliationSnapshotsParams,
  Regime,
  RevokedKey,
  Signal,
  Status,
  UpliftReport,
  Usage,
  UsageGetParams,
  User,
  UserCreateParams,
  UserLedgerParams,
  UserListParams,
  UserPositionsParams,
  UserUpdateParams,
  Vault,
  VaultListParams,
  Webhook,
  WebhookCreateParams,
  WebhookEventsParams,
  Yield,
} from './types.js';

function enc(segment: string): string {
  return encodeURIComponent(segment);
}

/** Build extra headers from create options (currently: Idempotency-Key). */
function createHeaders(options?: CreateOptions): Record<string, string> | undefined {
  return options?.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : undefined;
}

/** API key management (`/keys`). */
export class KeysResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Create a new API key. The full `secret` is returned in plaintext ONLY here;
   * subsequent list calls mask it. Store it immediately.
   */
  create(params: KeyCreateParams, options?: CreateOptions): Promise<ApiKey> {
    return this.http.request<ApiKey>({
      method: 'POST',
      path: 'keys',
      body: params,
      headers: createHeaders(options),
    });
  }

  /** List all keys. Secrets are masked (e.g. `tsk_test_...a1b2`). */
  list(): Promise<ApiKey[]> {
    return this.http.request<ApiKey[]>({ method: 'GET', path: 'keys' });
  }

  /** Revoke a key by id. Returns `{ id, revoked: true }`. */
  revoke(id: string): Promise<RevokedKey> {
    return this.http.request<RevokedKey>({ method: 'DELETE', path: `keys/${enc(id)}` });
  }
}

/** Yield vault discovery (`/vaults`). */
export class VaultsResource {
  constructor(private readonly http: HttpClient) {}

  /** List vaults, optionally filtered by `asset`, `chain`, and/or `status`. */
  list(params: VaultListParams = {}): Promise<Vault[]> {
    return this.http.request<Vault[]>({ method: 'GET', path: 'vaults', query: { ...params } });
  }

  /** Retrieve a single vault by id. */
  retrieve(id: string): Promise<Vault> {
    return this.http.request<Vault>({ method: 'GET', path: `vaults/${enc(id)}` });
  }
}

/**
 * Aggregated yield rates (`/yield`).
 *
 * Note: this resource is exposed on the client as `client.yield`. `yield` is a
 * reserved word, but it is a legal property name, so `client.yield.get(...)`
 * works. A `client.rates` alias is also provided for tooling that dislikes
 * reserved-word members.
 */
export class YieldResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Fetch yield rates.
   * - With no argument: `GET /yield` — the aggregated best/blend view.
   * - With an `asset`: `GET /yield/:asset` — per-asset detail with a per-vault
   *   `breakdown` and `history`.
   */
  get(asset?: string): Promise<Yield> {
    if (asset !== undefined) {
      return this.http.request<Yield>({ method: 'GET', path: `yield/${enc(asset)}` });
    }
    return this.http.request<Yield>({ method: 'GET', path: 'yield' });
  }
}

/** Deployed yield positions (`/positions`). */
export class PositionsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Open a new position. `strategy` defaults to `"auto"` server-side; pass a
   * `vault_id` to pin the position to a specific vault.
   */
  create(params: PositionCreateParams, options?: CreateOptions): Promise<Position> {
    return this.http.request<Position>({
      method: 'POST',
      path: 'positions',
      body: params,
      headers: createHeaders(options),
    });
  }

  /** List positions, optionally filtered by `wallet` and/or `status`. */
  list(params: PositionListParams = {}): Promise<Position[]> {
    return this.http.request<Position[]>({ method: 'GET', path: 'positions', query: { ...params } });
  }

  /** Retrieve a single position by id, with live accrued yield. */
  retrieve(id: string): Promise<Position> {
    return this.http.request<Position>({ method: 'GET', path: `positions/${enc(id)}` });
  }

  /**
   * Withdraw from a position. Pass `{ amount }` for a partial withdrawal or
   * `{ all: true }` to close it out entirely.
   */
  withdraw(id: string, params: PositionWithdrawParams = {}): Promise<Position> {
    return this.http.request<Position>({
      method: 'POST',
      path: `positions/${enc(id)}/withdraw`,
      body: params,
    });
  }

  /** Retrieve the event history for a position. */
  history(id: string): Promise<PositionEvent[]> {
    return this.http.request<PositionEvent[]>({
      method: 'GET',
      path: `positions/${enc(id)}/history`,
    });
  }
}

/** Rebalance activity (`/rebalances`). */
export class RebalancesResource {
  constructor(private readonly http: HttpClient) {}

  /** List rebalances, optionally scoped to a single `position_id`. */
  list(params: RebalanceListParams = {}): Promise<Rebalance[]> {
    return this.http.request<Rebalance[]>({ method: 'GET', path: 'rebalances', query: { ...params } });
  }
}

/** Webhook endpoint management (`/webhooks`). */
export class WebhooksResource {
  constructor(private readonly http: HttpClient) {}

  /** Register a webhook endpoint subscribed to the given `events`. */
  create(params: WebhookCreateParams, options?: CreateOptions): Promise<Webhook> {
    return this.http.request<Webhook>({
      method: 'POST',
      path: 'webhooks',
      body: params,
      headers: createHeaders(options),
    });
  }

  /** List registered webhook endpoints. */
  list(): Promise<Webhook[]> {
    return this.http.request<Webhook[]>({ method: 'GET', path: 'webhooks' });
  }

  /** Delete a webhook endpoint by id. */
  delete(id: string): Promise<DeletionResult> {
    return this.http.request<DeletionResult>({ method: 'DELETE', path: `webhooks/${enc(id)}` });
  }

  /** Dispatch a synthetic test event to the endpoint; returns the delivery record. */
  test(id: string): Promise<Delivery> {
    return this.http.request<Delivery>({ method: 'POST', path: `webhooks/${enc(id)}/test` });
  }

  /** Retrieve the delivery event log, optionally filtered by `webhook_id`. */
  events(params: WebhookEventsParams = {}): Promise<Delivery[]> {
    return this.http.request<Delivery[]>({
      method: 'GET',
      path: 'webhooks/events',
      query: { ...params },
    });
  }
}

/** API usage telemetry (`/usage`). */
export class UsageResource {
  constructor(private readonly http: HttpClient) {}

  /** Fetch usage telemetry for a `range` (`24h` | `7d` | `30d`). */
  get(params: UsageGetParams = {}): Promise<Usage> {
    return this.http.request<Usage>({ method: 'GET', path: 'usage', query: { ...params } });
  }
}

/** Platform health (`/status`). */
export class StatusResource {
  constructor(private readonly http: HttpClient) {}

  /** Fetch overall platform health, component status, and incidents. */
  get(): Promise<Status> {
    return this.http.request<Status>({ method: 'GET', path: 'status' });
  }
}

/** Platform users (`/users`). */
export class UsersResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Create a user keyed by your own `external_id`. Optionally attach a `label`,
   * `email`, free-form `metadata`, and one or more `wallets`.
   */
  create(params: UserCreateParams, options?: CreateOptions): Promise<User> {
    return this.http.request<User>({
      method: 'POST',
      path: 'users',
      body: params,
      headers: createHeaders(options),
    });
  }

  /** List users, optionally filtered by `status` and/or `wallet`. */
  list(params: UserListParams = {}): Promise<User[]> {
    return this.http.request<User[]>({ method: 'GET', path: 'users', query: { ...params } });
  }

  /** Retrieve a single user by id. */
  retrieve(id: string): Promise<User> {
    return this.http.request<User>({ method: 'GET', path: `users/${enc(id)}` });
  }

  /** Update mutable user fields. Only the provided fields are changed. */
  update(id: string, params: UserUpdateParams = {}): Promise<User> {
    return this.http.request<User>({ method: 'PATCH', path: `users/${enc(id)}`, body: params });
  }

  /** List the positions belonging to a user. */
  positions(id: string, params: UserPositionsParams = {}): Promise<Position[]> {
    return this.http.request<Position[]>({
      method: 'GET',
      path: `users/${enc(id)}/positions`,
      query: { ...params },
    });
  }

  /** List the ledger entries belonging to a user. */
  ledger(id: string, params: UserLedgerParams = {}): Promise<LedgerEntry[]> {
    return this.http.request<LedgerEntry[]>({
      method: 'GET',
      path: `users/${enc(id)}/ledger`,
      query: { ...params },
    });
  }
}

/** Reconciliation (`/reconciliation`). */
export class ReconciliationResource {
  constructor(private readonly http: HttpClient) {}

  /** Query the global ledger, optionally scoped by user/position/asset/type. */
  ledger(params: ReconciliationLedgerParams = {}): Promise<LedgerEntry[]> {
    return this.http.request<LedgerEntry[]>({
      method: 'GET',
      path: 'reconciliation/ledger',
      query: { ...params },
    });
  }

  /** List aggregated balances, optionally scoped to a `user_id` and/or `asset`. */
  balances(params: ReconciliationBalancesParams = {}): Promise<Balance[]> {
    return this.http.request<Balance[]>({
      method: 'GET',
      path: 'reconciliation/balances',
      query: { ...params },
    });
  }

  /** Fetch a reconciliation of recorded vs. on-chain balances for a `scope`. */
  report(params: ReconciliationReportParams = {}): Promise<Reconciliation> {
    return this.http.request<Reconciliation>({
      method: 'GET',
      path: 'reconciliation/report',
      query: { ...params },
    });
  }

  /** List historical balance snapshots, optionally bounded by `from`/`to`/`asset`. */
  snapshots(params: ReconciliationSnapshotsParams = {}): Promise<BalanceSnapshot[]> {
    return this.http.request<BalanceSnapshot[]>({
      method: 'GET',
      path: 'reconciliation/snapshots',
      query: { ...params },
    });
  }
}

/** Analytics & insights (`/analytics`). All methods are read-only. */
export class AnalyticsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Fetch the uplift report comparing routed portfolio value against the
   * Aave-only and hold baselines, optionally scoped by `user_id` and/or `asset`.
   */
  uplift(params: AnalyticsUpliftParams = {}): Promise<UpliftReport> {
    return this.http.request<UpliftReport>({
      method: 'GET',
      path: 'analytics/uplift',
      query: { ...params },
    });
  }

  /** List routing/rebalance decisions, optionally scoped and paginated. */
  decisions(params: AnalyticsDecisionsParams = {}): Promise<Decision[]> {
    return this.http.request<Decision[]>({
      method: 'GET',
      path: 'analytics/decisions',
      query: { ...params },
    });
  }

  /** List per-vault yield signals, optionally filtered by `asset`. */
  signals(params: AnalyticsSignalsParams = {}): Promise<Signal[]> {
    return this.http.request<Signal[]>({
      method: 'GET',
      path: 'analytics/signals',
      query: { ...params },
    });
  }

  /** Fetch the current market regime, optionally for a single `asset`. */
  regime(params: AnalyticsRegimeParams = {}): Promise<Regime> {
    return this.http.request<Regime>({
      method: 'GET',
      path: 'analytics/regime',
      query: { ...params },
    });
  }

  /** Fetch the human-readable advisory (headline, regime, opportunities, portfolio). */
  advisor(): Promise<Advisor> {
    return this.http.request<Advisor>({ method: 'GET', path: 'analytics/advisor' });
  }

  /** Fetch the current PSO allocation for an asset (per-vault weights). */
  pso(params: AnalyticsPsoParams = {}): Promise<PsoAllocation> {
    return this.http.request<PsoAllocation>({
      method: 'GET',
      path: 'analytics/pso',
      query: { ...params },
    });
  }

  /**
   * Run a single backtest of a strategy over a range. `from`/`to` accept epoch
   * ms or a YYYY-MM-DD string. Defaults server-side to the last 90 days.
   */
  backtest(params: AnalyticsBacktestParams): Promise<Backtest> {
    return this.http.request<Backtest>({
      method: 'GET',
      path: 'analytics/backtest',
      query: { ...params },
    });
  }

  /** Run all strategies over the same range and compare them vs the baseline. */
  compareBacktests(params: AnalyticsBacktestsCompareParams = {}): Promise<BacktestComparison> {
    return this.http.request<BacktestComparison>({
      method: 'GET',
      path: 'analytics/backtests/compare',
      query: { ...params },
    });
  }
}

/**
 * Thesauros Developer Platform API client.
 *
 * @example
 * import { Thesauros } from '@thesauros/sdk';
 *
 * const client = new Thesauros({ apiKey: 'tsk_test_...' });
 * const vaults = await client.vaults.list({ asset: 'USDC' });
 * const rates = await client.yield.get('USDC');
 * const pos = await client.positions.create({ wallet, asset: 'USDC', amount: 1000 });
 * await client.positions.withdraw(pos.id, { all: true });
 */
export class Thesauros {
  readonly keys: KeysResource;
  readonly vaults: VaultsResource;
  /** Yield rates. `yield` is a reserved word but a legal property name. See also {@link rates}. */
  readonly yield: YieldResource;
  readonly positions: PositionsResource;
  readonly rebalances: RebalancesResource;
  readonly webhooks: WebhooksResource;
  readonly usage: UsageResource;
  readonly status: StatusResource;
  readonly users: UsersResource;
  readonly reconciliation: ReconciliationResource;
  readonly analytics: AnalyticsResource;

  private readonly http: HttpClient;

  constructor(config: ClientConfig) {
    this.http = new HttpClient(config);
    this.keys = new KeysResource(this.http);
    this.vaults = new VaultsResource(this.http);
    this.yield = new YieldResource(this.http);
    this.positions = new PositionsResource(this.http);
    this.rebalances = new RebalancesResource(this.http);
    this.webhooks = new WebhooksResource(this.http);
    this.usage = new UsageResource(this.http);
    this.status = new StatusResource(this.http);
    this.users = new UsersResource(this.http);
    this.reconciliation = new ReconciliationResource(this.http);
    this.analytics = new AnalyticsResource(this.http);
  }

  /**
   * Alias for {@link yield}, provided for environments/tooling that handle
   * reserved-word property names awkwardly. Both reference the same resource.
   */
  get rates(): YieldResource {
    return this.yield;
  }

  /** Metadata (status, object, meta, request id, rate limits) from the last call. */
  get lastResponse(): LastResponse | null {
    return this.http.lastResponse;
  }

  /** Convenience accessor for the envelope `meta` of the last call, if any. */
  get lastMeta(): Record<string, unknown> | undefined {
    return this.http.lastResponse?.meta;
  }
}
