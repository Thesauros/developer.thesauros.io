/**
 * GET /api/v1/openapi.json — complete OpenAPI 3.1 document (public).
 *
 * Describes every v1 endpoint, its schemas, bearer auth and the success/error
 * envelopes from spec section 4. Served raw (not wrapped in an envelope).
 */
import { apiHandler, OPTIONS } from '../../../../lib/api/http.js';
import { SUPPORTED_EVENTS } from '../../../../lib/api/webhooks.js';

export { OPTIONS };

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });

/** 2xx single-object envelope response. */
function single(name, description, status = 200) {
  return {
    description,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['object', 'data'],
          properties: { object: { type: 'string' }, data: ref(name), meta: { type: 'object' } },
        },
      },
    },
  };
}

/** 2xx list envelope response. */
function listOf(name, description) {
  return {
    description,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['object', 'data', 'meta'],
          properties: {
            object: { type: 'string', enum: ['list'] },
            data: { type: 'array', items: ref(name) },
            meta: ref('ListMeta'),
          },
        },
      },
    },
  };
}

const errorResponse = (description, headers) => ({
  description,
  ...(headers ? { headers } : {}),
  content: { 'application/json': { schema: ref('ErrorEnvelope') } },
});

const RETRY_AFTER = {
  'Retry-After': {
    description: 'Seconds to wait before retrying (present on 429).',
    schema: { type: 'integer' },
  },
};

/** Attach the standard error responses to an operation's response map. */
function withErrors(responses, codes) {
  const map = {
    400: 'Invalid request',
    401: 'Unauthorized',
    403: 'Forbidden (key lacks the required scope)',
    404: 'Not found',
    429: 'Rate limited',
    500: 'Internal error',
  };
  for (const code of codes) {
    responses[code] = errorResponse(map[code], code === 429 ? RETRY_AFTER : undefined);
  }
  return responses;
}

const AUTH = [{ bearerAuth: [] }];
const PUBLIC = [];

const q = (name, description, opts = {}) => ({
  name,
  in: 'query',
  required: false,
  description,
  schema: { type: 'string', ...opts },
});

/** Standard cursor-pagination query params for list endpoints. */
const paginationParams = () => [
  q('limit', 'Page size (1-500, default 100)', { type: 'integer', minimum: 1, maximum: 500 }),
  q('cursor', 'Opaque cursor returned as meta.next_cursor'),
];

/** Idempotency-Key request header for mutating endpoints. */
const idempotencyHeader = () => ({
  name: 'Idempotency-Key',
  in: 'header',
  required: false,
  description: 'Client-generated key. Retries with the same key replay the original response.',
  schema: { type: 'string' },
});

const pathId = (description = 'Resource id') => ({
  name: 'id',
  in: 'path',
  required: true,
  description,
  schema: { type: 'string' },
});

function buildDoc() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Thesauros Developer Platform API',
      version: '1.0.0',
      description:
        'Enterprise yield-infrastructure sandbox API. Deterministic simulation of the Thesauros routing engine: vaults, aggregated yield, positions with live accrual, rebalances, webhooks and usage telemetry. All APY values are decimal fractions (0.052 = 5.2%).',
      contact: { name: 'Thesauros', url: 'https://developer.thesauros.io' },
    },
    servers: [{ url: '/api/v1', description: 'Sandbox (relative to deployed host)' }],
    tags: [
      { name: 'keys', description: 'API key management' },
      { name: 'users', description: 'Partner end-users' },
      { name: 'vaults', description: 'Yield vaults' },
      { name: 'yield', description: 'Aggregated yield' },
      { name: 'positions', description: 'Positions & lifecycle' },
      { name: 'rebalances', description: 'Rebalance history' },
      { name: 'webhooks', description: 'Webhook endpoints & events' },
      { name: 'reconciliation', description: 'Ledger, balances & reconciliation' },
      { name: 'analytics', description: 'Uplift, decision log, signals, regime & advisor' },
      { name: 'telemetry', description: 'Usage & status' },
    ],
    security: AUTH,
    paths: {
      '/keys': {
        post: {
          tags: ['keys'],
          summary: 'Create an API key',
          description:
            'Creates a key. The full secret is returned exactly once. Scopes are server-assigned; creating live keys requires the keys:live scope.',
          parameters: [idempotencyHeader()],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('CreateKeyRequest') } },
          },
          responses: withErrors({ 201: single('ApiKey', 'Key created (secret shown once)') }, [
            400, 401, 403, 429, 500,
          ]),
        },
        get: {
          tags: ['keys'],
          summary: 'List API keys',
          description: 'Lists keys with masked secrets.',
          parameters: paginationParams(),
          responses: withErrors({ 200: listOf('ApiKey', 'Masked keys') }, [401, 429, 500]),
        },
      },
      '/keys/{id}': {
        delete: {
          tags: ['keys'],
          summary: 'Revoke an API key',
          description: 'Revokes a key. The shared sandbox key (key_bootstrap) cannot be revoked.',
          parameters: [pathId('Key id')],
          responses: withErrors({ 200: single('ApiKey', 'Key revoked') }, [400, 401, 404, 429, 500]),
        },
      },
      '/users': {
        post: {
          tags: ['users'],
          summary: 'Create an end-user',
          description:
            'Maps one of your customers to a Thesauros user via external_id (unique) and links their wallets.',
          parameters: [idempotencyHeader()],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('CreateUserRequest') } },
          },
          responses: withErrors({ 201: single('User', 'User created') }, [400, 401, 429, 500]),
        },
        get: {
          tags: ['users'],
          summary: 'List end-users',
          parameters: [
            q('status', 'Filter by status', { enum: ['active', 'disabled'] }),
            q('wallet', 'Filter by linked wallet'),
            ...paginationParams(),
          ],
          responses: withErrors({ 200: listOf('User', 'Users') }, [401, 429, 500]),
        },
      },
      '/users/{id}': {
        get: {
          tags: ['users'],
          summary: 'Get an end-user',
          parameters: [pathId('User id')],
          responses: withErrors({ 200: single('User', 'The user') }, [401, 404, 429, 500]),
        },
        patch: {
          tags: ['users'],
          summary: 'Update an end-user',
          parameters: [pathId('User id')],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('UpdateUserRequest') } },
          },
          responses: withErrors({ 200: single('User', 'Updated user') }, [400, 401, 404, 429, 500]),
        },
      },
      '/users/{id}/positions': {
        get: {
          tags: ['users'],
          summary: "A user's positions",
          parameters: [pathId('User id'), ...paginationParams()],
          responses: withErrors({ 200: listOf('Position', "User's positions with live accrual") }, [
            401, 404, 429, 500,
          ]),
        },
      },
      '/users/{id}/ledger': {
        get: {
          tags: ['users'],
          summary: "A user's reconciliation ledger",
          parameters: [
            pathId('User id'),
            q('asset', 'Filter by asset', { enum: ['USDC', 'USDT'] }),
            q('type', 'Filter by entry type', { enum: ['deposit', 'withdraw', 'close', 'accrual'] }),
            ...paginationParams(),
          ],
          responses: withErrors({ 200: listOf('LedgerEntry', "User's ledger") }, [401, 404, 429, 500]),
        },
      },
      '/vaults': {
        get: {
          tags: ['vaults'],
          summary: 'List vaults',
          parameters: [
            q('asset', 'Filter by asset', { enum: ['USDC', 'USDT'] }),
            q('chain', 'Filter by chain', { enum: ['base', 'arbitrum'] }),
            q('status', 'Filter by status', { enum: ['active', 'paused'] }),
            ...paginationParams(),
          ],
          responses: withErrors({ 200: listOf('Vault', 'Matching vaults') }, [401, 429, 500]),
        },
      },
      '/vaults/{id}': {
        get: {
          tags: ['vaults'],
          summary: 'Get a vault',
          parameters: [pathId('Vault id')],
          responses: withErrors({ 200: single('Vault', 'The vault') }, [401, 404, 429, 500]),
        },
      },
      '/yield': {
        get: {
          tags: ['yield'],
          summary: 'Aggregated yield',
          description: 'Best and allocation-blended APY. Omit asset to aggregate all active vaults.',
          parameters: [q('asset', 'Asset to aggregate', { enum: ['USDC', 'USDT'] })],
          responses: withErrors({ 200: single('Yield', 'Aggregated yield') }, [401, 404, 429, 500]),
        },
      },
      '/yield/{asset}': {
        get: {
          tags: ['yield'],
          summary: 'Per-asset yield detail',
          parameters: [{ name: 'asset', in: 'path', required: true, schema: { type: 'string', enum: ['USDC', 'USDT'] } }],
          responses: withErrors({ 200: single('Yield', 'Per-asset yield with breakdown + history') }, [401, 404, 429, 500]),
        },
      },
      '/positions': {
        post: {
          tags: ['positions'],
          summary: 'Open a position',
          description:
            'Validates the wallet/asset/amount and routes to a vault. Settlement is synchronous: the position is active immediately.',
          parameters: [idempotencyHeader()],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('CreatePositionRequest') } },
          },
          responses: withErrors({ 201: single('Position', 'Position created and active') }, [400, 401, 429, 500]),
        },
        get: {
          tags: ['positions'],
          summary: 'List positions',
          parameters: [
            q('wallet', 'Filter by wallet address'),
            q('status', 'Filter by status', { enum: ['active', 'closed'] }),
            ...paginationParams(),
          ],
          responses: withErrors({ 200: listOf('Position', 'Positions with live accrual') }, [401, 429, 500]),
        },
      },
      '/positions/{id}': {
        get: {
          tags: ['positions'],
          summary: 'Get a position',
          parameters: [pathId('Position id')],
          responses: withErrors({ 200: single('Position', 'Position with live accrued yield') }, [401, 404, 429, 500]),
        },
      },
      '/positions/{id}/withdraw': {
        post: {
          tags: ['positions'],
          summary: 'Withdraw from a position',
          description:
            'Partial or full withdrawal. Partial withdrawals preserve accrued yield exactly (the remaining value keeps compounding).',
          parameters: [pathId('Position id')],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('WithdrawRequest') } },
          },
          responses: withErrors({ 200: single('Position', 'Updated position') }, [400, 401, 404, 429, 500]),
        },
      },
      '/positions/{id}/history': {
        get: {
          tags: ['positions'],
          summary: 'Position event timeline',
          parameters: [pathId('Position id'), ...paginationParams()],
          responses: withErrors({ 200: listOf('PositionEvent', 'Chronological events') }, [401, 404, 429, 500]),
        },
      },
      '/rebalances': {
        get: {
          tags: ['rebalances'],
          summary: 'List rebalances',
          parameters: [q('position_id', 'Filter by position'), ...paginationParams()],
          responses: withErrors({ 200: listOf('Rebalance', 'Rebalances, newest first') }, [401, 429, 500]),
        },
      },
      '/webhooks': {
        post: {
          tags: ['webhooks'],
          summary: 'Register a webhook endpoint',
          description:
            'Registers an endpoint. The URL is SSRF-guarded (loopback, private, link-local and metadata addresses are rejected). The signing secret is returned once.',
          parameters: [idempotencyHeader()],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('CreateWebhookRequest') } },
          },
          responses: withErrors({ 201: single('Webhook', 'Endpoint registered') }, [400, 401, 429, 500]),
        },
        get: {
          tags: ['webhooks'],
          summary: 'List webhook endpoints',
          description: 'Lists endpoints with masked signing secrets.',
          parameters: paginationParams(),
          responses: withErrors({ 200: listOf('Webhook', 'Endpoints') }, [401, 429, 500]),
        },
      },
      '/webhooks/events': {
        get: {
          tags: ['webhooks'],
          summary: 'Webhook delivery log',
          parameters: [q('webhook_id', 'Filter by webhook'), ...paginationParams()],
          responses: withErrors({ 200: listOf('Delivery', 'Deliveries, newest first') }, [401, 429, 500]),
        },
      },
      '/webhooks/{id}': {
        delete: {
          tags: ['webhooks'],
          summary: 'Delete a webhook endpoint',
          parameters: [pathId('Webhook id')],
          responses: withErrors({ 200: single('Webhook', 'Endpoint deleted') }, [401, 404, 429, 500]),
        },
      },
      '/webhooks/{id}/test': {
        post: {
          tags: ['webhooks'],
          summary: 'Send a test event',
          description: 'Dispatches a synthetic system.status event and returns the delivery record.',
          parameters: [pathId('Webhook id')],
          responses: withErrors({ 200: single('Delivery', 'Resulting delivery (delivered or failed)') }, [401, 404, 429, 500]),
        },
      },
      '/reconciliation/ledger': {
        get: {
          tags: ['reconciliation'],
          summary: 'Reconciliation ledger',
          description: 'Append-only ledger of balance-affecting entries with running balance per position.',
          parameters: [
            q('user_id', 'Filter by user'),
            q('position_id', 'Filter by position'),
            q('asset', 'Filter by asset', { enum: ['USDC', 'USDT'] }),
            q('type', 'Filter by entry type', { enum: ['deposit', 'withdraw', 'close', 'accrual'] }),
            ...paginationParams(),
          ],
          responses: withErrors({ 200: listOf('LedgerEntry', 'Ledger entries') }, [401, 429, 500]),
        },
      },
      '/reconciliation/balances': {
        get: {
          tags: ['reconciliation'],
          summary: 'Current balances',
          description: 'Current recorded balances grouped by user and asset (active positions).',
          parameters: [q('user_id', 'Filter by user'), q('asset', 'Filter by asset', { enum: ['USDC', 'USDT'] })],
          responses: withErrors({ 200: listOf('Balance', 'Balances by user/asset') }, [401, 429, 500]),
        },
      },
      '/reconciliation/report': {
        get: {
          tags: ['reconciliation'],
          summary: 'Reconciliation report',
          description:
            'Recorded (ledger) vs on-chain (settled) totals. The difference is intraday unsettled yield; within tolerance the status is "reconciled".',
          parameters: [q('scope', 'all, a user id (usr_...) or a position id (pos_...)')],
          responses: withErrors({ 200: single('Reconciliation', 'Reconciliation result') }, [401, 429, 500]),
        },
      },
      '/reconciliation/snapshots': {
        get: {
          tags: ['reconciliation'],
          summary: 'Balance snapshots',
          description: 'Daily balance snapshots over a range, for period accounting.',
          parameters: [
            q('from', 'Start date (YYYY-MM-DD)'),
            q('to', 'End date (YYYY-MM-DD)'),
            q('asset', 'Filter by asset', { enum: ['USDC', 'USDT'] }),
          ],
          responses: withErrors({ 200: listOf('BalanceSnapshot', 'Daily snapshots') }, [401, 429, 500]),
        },
      },
      '/analytics/uplift': {
        get: {
          tags: ['analytics'],
          summary: 'Uplift vs baselines',
          description:
            'Routed portfolio value versus passive baselines (Aave-only and hold-original-vault). The concept\u2019s primary proof point.',
          parameters: [q('user_id', 'Scope to a user'), q('asset', 'Filter by asset', { enum: ['USDC', 'USDT'] })],
          responses: withErrors({ 200: single('UpliftReport', 'Uplift report') }, [401, 429, 500]),
        },
      },
      '/analytics/decisions': {
        get: {
          tags: ['analytics'],
          summary: 'Decision log',
          description:
            'Explainable log of routing and rebalance decisions: inputs, alternatives considered, expected uplift and rationale.',
          parameters: [
            q('user_id', 'Filter by user'),
            q('position_id', 'Filter by position'),
            q('asset', 'Filter by asset', { enum: ['USDC', 'USDT'] }),
            ...paginationParams(),
          ],
          responses: withErrors({ 200: listOf('Decision', 'Decisions, newest first') }, [401, 429, 500]),
        },
      },
      '/analytics/signals': {
        get: {
          tags: ['analytics'],
          summary: 'Risk-adjusted signals',
          description:
            'Per-vault risk-adjusted APY (APY discounted by risk tier and volatility) with a naive trend forecast and a recommendation. Ranked.',
          parameters: [q('asset', 'Filter by asset', { enum: ['USDC', 'USDT'] })],
          responses: withErrors({ 200: listOf('Signal', 'Signals, best risk-adjusted first') }, [401, 429, 500]),
        },
      },
      '/analytics/regime': {
        get: {
          tags: ['analytics'],
          summary: 'Market regime',
          description: 'Classifies the current rate regime (rising/falling/stable/volatile) from recent yield trend and volatility.',
          parameters: [q('asset', 'Restrict to one asset', { enum: ['USDC', 'USDT'] })],
          responses: withErrors({ 200: single('Regime', 'Regime classification') }, [401, 429, 500]),
        },
      },
      '/analytics/advisor': {
        get: {
          tags: ['analytics'],
          summary: 'Strategy advisor',
          description:
            'Template-generated (non-LLM) strategy summary: regime, top risk-adjusted opportunities, portfolio uplift and rationale bullets.',
          responses: withErrors({ 200: single('Advisor', 'Advisor summary') }, [401, 429, 500]),
        },
      },
      '/analytics/pso': {
        get: {
          tags: ['analytics'],
          summary: 'PSO allocation',
          description:
            'Current Particle Swarm Optimization allocation for an asset: per-vault weights maximizing risk-adjusted return under a diversification cap.',
          parameters: [q('asset', 'Restrict to one asset', { enum: ['USDC', 'USDT'] })],
          responses: withErrors({ 200: single('PsoAllocation', 'Optimized allocation') }, [401, 429, 500]),
        },
      },
      '/analytics/backtest': {
        get: {
          tags: ['analytics'],
          summary: 'Run a backtest',
          description:
            'Replay the historical rate series through one allocation strategy. Returns the equity curve, APY, volatility, drawdown and rebalance count.',
          parameters: [
            q('strategy', 'Allocation strategy', { enum: ['aave-only', 'best-apy', 'risk-adjusted-pso'] }),
            q('asset', 'Restrict to one asset', { enum: ['USDC', 'USDT'] }),
            q('from', 'Start (epoch ms or YYYY-MM-DD). Default: 90 days ago'),
            q('to', 'End (epoch ms or YYYY-MM-DD). Default: now'),
            q('principal', 'Starting principal (default 10000)'),
            q('rebalance_every', 'Rebalance cadence in days (default 7)'),
          ],
          responses: withErrors({ 200: single('Backtest', 'Backtest result') }, [400, 401, 429, 500]),
        },
      },
      '/analytics/backtests/compare': {
        get: {
          tags: ['analytics'],
          summary: 'Compare strategies',
          description:
            'Run all strategies over the same range and compare final value, APY, volatility, drawdown and uplift vs the aave-only baseline.',
          parameters: [
            q('asset', 'Restrict to one asset', { enum: ['USDC', 'USDT'] }),
            q('from', 'Start (epoch ms or YYYY-MM-DD). Default: 90 days ago'),
            q('to', 'End (epoch ms or YYYY-MM-DD). Default: now'),
            q('principal', 'Starting principal (default 10000)'),
            q('rebalance_every', 'Rebalance cadence in days (default 7)'),
          ],
          responses: withErrors({ 200: single('BacktestComparison', 'Strategy comparison') }, [400, 401, 429, 500]),
        },
      },
      '/usage': {
        get: {
          tags: ['telemetry'],
          summary: 'Usage time series',
          parameters: [q('range', 'Time range', { enum: ['24h', '7d', '30d'], default: '30d' })],
          responses: withErrors({ 200: single('Usage', 'Series + totals') }, [400, 401, 429, 500]),
        },
      },
      '/status': {
        get: {
          tags: ['telemetry'],
          summary: 'Platform status',
          security: PUBLIC,
          responses: withErrors({ 200: single('Status', 'Component health') }, [500]),
        },
      },
      '/openapi.json': {
        get: {
          tags: ['telemetry'],
          summary: 'OpenAPI document',
          security: PUBLIC,
          responses: {
            200: {
              description: 'This OpenAPI 3.1 document',
              content: { 'application/json': { schema: { type: 'object' } } },
            },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'API key. Format tsk_test_... (sandbox) or tsk_live_... (live).',
        },
      },
      schemas: {
        ListMeta: {
          type: 'object',
          properties: {
            total: { type: 'integer', description: 'Total items matching the filter' },
            limit: { type: 'integer', description: 'Page size applied' },
            next_cursor: {
              type: ['string', 'null'],
              description: 'Opaque cursor for the next page, or null when exhausted',
            },
          },
          required: ['total'],
        },
        ErrorEnvelope: {
          type: 'object',
          required: ['error'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message', 'doc_url'],
              properties: {
                code: {
                  type: 'string',
                  enum: ['unauthorized', 'forbidden', 'invalid_request', 'not_found', 'rate_limited', 'internal'],
                },
                message: { type: 'string' },
                doc_url: { type: 'string', format: 'uri' },
              },
            },
          },
        },
        CreateKeyRequest: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'Human label for the key' },
            environment: { type: 'string', enum: ['test', 'live'], default: 'test' },
          },
        },
        ApiKey: {
          type: 'object',
          required: ['id', 'object', 'label', 'environment', 'created_at', 'revoked', 'scopes'],
          properties: {
            id: { type: 'string', example: 'key_bootstrap' },
            object: { type: 'string', enum: ['api_key'] },
            label: { type: 'string' },
            secret: { type: 'string', description: 'Full secret only on create; masked (tsk_test_...a1b2) on list' },
            prefix: { type: 'string', description: 'First 12 chars of the secret' },
            environment: { type: 'string', enum: ['test', 'live'] },
            created_at: { type: 'string', format: 'date-time' },
            last_used_at: { type: ['string', 'null'], format: 'date-time' },
            revoked: { type: 'boolean' },
            scopes: { type: 'array', items: { type: 'string' } },
          },
        },
        Vault: {
          type: 'object',
          required: ['id', 'object', 'name', 'provider', 'asset', 'chain', 'apy', 'status', 'risk_tier'],
          properties: {
            id: { type: 'string', example: 'vault_aave_base_usdc' },
            object: { type: 'string', enum: ['vault'] },
            name: { type: 'string' },
            provider: { type: 'string', enum: ['aave', 'morpho', 'compound', 'dolomite', 'treasury'] },
            asset: { type: 'string', enum: ['USDC', 'USDT'] },
            chain: { type: 'string', enum: ['base', 'arbitrum'] },
            apy: { type: 'number', description: 'Decimal fraction (0.052 = 5.2%)' },
            apy_7d_avg: { type: 'number' },
            apy_30d_avg: { type: 'number' },
            tvl_usd: { type: 'number' },
            capacity_usd: { type: 'number' },
            risk_tier: { type: 'string', enum: ['bluechip', 'core', 'opportunistic'] },
            status: { type: 'string', enum: ['active', 'paused'] },
            inception_date: { type: 'string', format: 'date' },
            description: { type: 'string' },
            allocation_pct: { type: 'number' },
          },
        },
        YieldBreakdown: {
          type: 'object',
          properties: {
            vault_id: { type: 'string' },
            name: { type: 'string' },
            provider: { type: 'string' },
            apy: { type: 'number' },
            allocation: { type: 'number' },
          },
        },
        YieldHistoryPoint: {
          type: 'object',
          properties: { t: { type: 'integer', description: 'Epoch ms' }, apy: { type: 'number' } },
        },
        Yield: {
          type: 'object',
          required: ['object', 'asset', 'best_apy', 'blend_apy'],
          properties: {
            object: { type: 'string', enum: ['yield'] },
            asset: { type: 'string', example: 'USDC' },
            best_apy: { type: 'number' },
            blend_apy: { type: 'number', description: 'Allocation-weighted blended APY' },
            blended_30d: { type: 'number' },
            breakdown: { type: 'array', items: ref('YieldBreakdown') },
            history: { type: 'array', items: ref('YieldHistoryPoint') },
          },
        },
        CreatePositionRequest: {
          type: 'object',
          required: ['wallet', 'asset', 'amount'],
          properties: {
            wallet: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
            asset: { type: 'string', enum: ['USDC', 'USDT'] },
            amount: { type: 'number', exclusiveMinimum: 0 },
            strategy: { type: 'string', description: '"auto" or a target vault id', default: 'auto' },
            user: { type: 'string', description: 'Optional user id (usr_...) or external_id to associate' },
          },
        },
        WithdrawRequest: {
          type: 'object',
          description: 'Provide a positive amount for a partial withdrawal, or { "all": true } to close.',
          properties: {
            amount: { type: 'number', exclusiveMinimum: 0 },
            all: { type: 'boolean' },
          },
        },
        Position: {
          type: 'object',
          required: ['id', 'object', 'wallet', 'asset', 'chain', 'vault_id', 'principal', 'current_value', 'accrued_yield', 'apy', 'status'],
          properties: {
            id: { type: 'string', example: 'pos_seed_alpha' },
            object: { type: 'string', enum: ['position'] },
            user_id: { type: ['string', 'null'], description: 'Owning end-user, if associated' },
            wallet: { type: 'string' },
            asset: { type: 'string', enum: ['USDC', 'USDT'] },
            chain: { type: 'string', enum: ['base', 'arbitrum'] },
            vault_id: { type: 'string' },
            strategy: { type: 'string' },
            principal: { type: 'number' },
            current_value: { type: 'number', description: 'principal * (1 + apy * elapsedYears)' },
            accrued_yield: { type: 'number' },
            apy: { type: 'number' },
            status: { type: 'string', enum: ['active', 'closed'] },
            opened_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
            last_rebalance_at: { type: ['string', 'null'], format: 'date-time' },
            tx_hash: { type: 'string' },
          },
        },
        PositionEvent: {
          type: 'object',
          required: ['id', 'type', 'at'],
          properties: {
            id: { type: 'string' },
            object: { type: 'string', enum: ['position_event'] },
            position_id: { type: 'string' },
            type: { type: 'string', enum: ['deposit', 'rebalance', 'accrual', 'withdraw', 'close'] },
            at: { type: 'string', format: 'date-time' },
            amount: { type: 'number' },
            apy: { type: 'number' },
            vault_id: { type: 'string' },
            note: { type: 'string' },
          },
        },
        Rebalance: {
          type: 'object',
          required: ['id', 'object', 'position_id', 'from_vault', 'to_vault', 'at'],
          properties: {
            id: { type: 'string' },
            object: { type: 'string', enum: ['rebalance'] },
            position_id: { type: 'string' },
            from_vault: { type: 'string' },
            to_vault: { type: 'string' },
            amount: { type: 'number' },
            reason: { type: 'string', enum: ['yield_optimization', 'risk_adjustment', 'capacity_rebalance'] },
            apy_before: { type: 'number' },
            apy_after: { type: 'number' },
            at: { type: 'string', format: 'date-time' },
            tx_hash: { type: 'string' },
          },
        },
        CreateWebhookRequest: {
          type: 'object',
          required: ['url'],
          properties: {
            url: { type: 'string', format: 'uri' },
            events: { type: 'array', items: { type: 'string', enum: ['*', ...SUPPORTED_EVENTS] }, description: 'Defaults to ["*"]' },
            active: { type: 'boolean', default: true },
          },
        },
        Webhook: {
          type: 'object',
          required: ['id', 'object', 'url', 'events', 'secret', 'active', 'created_at'],
          properties: {
            id: { type: 'string', example: 'wh_seed_example' },
            object: { type: 'string', enum: ['webhook'] },
            url: { type: 'string', format: 'uri' },
            events: { type: 'array', items: { type: 'string' } },
            secret: { type: 'string', description: 'whsec_... used to compute Webhook-Signature' },
            active: { type: 'boolean' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        Delivery: {
          type: 'object',
          required: ['id', 'object', 'event', 'status', 'at'],
          properties: {
            id: { type: 'string' },
            object: { type: 'string', enum: ['delivery'] },
            webhook_id: { type: 'string' },
            url: { type: 'string', description: 'Target endpoint URL' },
            event: { type: 'string', enum: SUPPORTED_EVENTS },
            payload: { type: 'object', description: 'The signed event payload { id, type, created_at, data }' },
            signature: { type: 'string', description: 't=<unix>,v1=<hmac_sha256(secret, t + "." + body)>' },
            status: { type: 'string', enum: ['delivered', 'failed'] },
            attempts: { type: 'integer' },
            at: { type: 'string', format: 'date-time' },
            latency_ms: { type: 'integer' },
          },
        },
        UsageTotals: {
          type: 'object',
          properties: {
            requests: { type: 'integer' },
            errors: { type: 'integer' },
            p50_ms: { type: 'integer' },
            p99_ms: { type: 'integer' },
            unique_keys: { type: 'integer' },
          },
        },
        UsagePoint: {
          type: 'object',
          properties: {
            t: { type: 'integer', description: 'Epoch ms bucket start' },
            requests: { type: 'integer' },
            errors: { type: 'integer' },
            p50_ms: { type: 'integer' },
            p99_ms: { type: 'integer' },
          },
        },
        Usage: {
          type: 'object',
          required: ['object', 'range', 'totals', 'series'],
          properties: {
            object: { type: 'string', enum: ['usage'] },
            range: { type: 'string', enum: ['24h', '7d', '30d'] },
            totals: ref('UsageTotals'),
            series: { type: 'array', items: ref('UsagePoint') },
          },
        },
        StatusComponent: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            status: { type: 'string', enum: ['operational', 'degraded', 'outage'] },
            uptime_90d: { type: 'number' },
            latency_ms: { type: 'integer' },
          },
        },
        Status: {
          type: 'object',
          required: ['object', 'overall', 'components', 'incidents', 'updated_at'],
          properties: {
            object: { type: 'string', enum: ['status'] },
            overall: { type: 'string', enum: ['operational', 'degraded', 'outage'] },
            components: { type: 'array', items: ref('StatusComponent') },
            incidents: { type: 'array', items: { type: 'object' } },
            uptime_s: { type: 'integer' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        CreateUserRequest: {
          type: 'object',
          required: ['external_id'],
          properties: {
            external_id: { type: 'string', description: 'Your customer id (unique)' },
            label: { type: ['string', 'null'] },
            email: { type: ['string', 'null'], format: 'email' },
            metadata: { type: 'object' },
            wallets: { type: 'array', items: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' } },
          },
        },
        UpdateUserRequest: {
          type: 'object',
          properties: {
            label: { type: ['string', 'null'] },
            email: { type: ['string', 'null'], format: 'email' },
            metadata: { type: 'object' },
            wallets: { type: 'array', items: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' } },
            status: { type: 'string', enum: ['active', 'disabled'] },
          },
        },
        User: {
          type: 'object',
          required: ['id', 'object', 'external_id', 'wallets', 'status', 'created_at'],
          properties: {
            id: { type: 'string', example: 'usr_seed_nova' },
            object: { type: 'string', enum: ['user'] },
            external_id: { type: 'string' },
            label: { type: ['string', 'null'] },
            email: { type: ['string', 'null'] },
            metadata: { type: 'object' },
            wallets: { type: 'array', items: { type: 'string' } },
            status: { type: 'string', enum: ['active', 'disabled'] },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        LedgerEntry: {
          type: 'object',
          required: ['id', 'object', 'at', 'position_id', 'asset', 'type', 'amount', 'balance_after', 'settled'],
          properties: {
            id: { type: 'string' },
            object: { type: 'string', enum: ['ledger_entry'] },
            at: { type: 'string', format: 'date-time' },
            user_id: { type: ['string', 'null'] },
            position_id: { type: 'string' },
            wallet: { type: 'string' },
            asset: { type: 'string', enum: ['USDC', 'USDT'] },
            type: { type: 'string', enum: ['deposit', 'withdraw', 'close', 'accrual'] },
            amount: { type: 'number', description: 'Signed delta' },
            balance_after: { type: 'number', description: 'Running balance for the position' },
            vault_id: { type: 'string' },
            settled: { type: 'boolean' },
            ref: { type: 'string' },
          },
        },
        Balance: {
          type: 'object',
          properties: {
            object: { type: 'string', enum: ['balance'] },
            user_id: { type: ['string', 'null'] },
            asset: { type: 'string', enum: ['USDC', 'USDT'] },
            principal: { type: 'number' },
            current_value: { type: 'number' },
            accrued_yield: { type: 'number' },
            positions: { type: 'integer' },
          },
        },
        Reconciliation: {
          type: 'object',
          required: ['object', 'as_of', 'scope', 'recorded_total', 'onchain_total', 'discrepancy', 'status'],
          properties: {
            object: { type: 'string', enum: ['reconciliation'] },
            as_of: { type: 'string', format: 'date-time' },
            scope: { type: 'string' },
            recorded_total: { type: 'number' },
            onchain_total: { type: 'number' },
            discrepancy: { type: 'number' },
            unsettled_yield: { type: 'number' },
            tolerance: { type: 'number' },
            status: { type: 'string', enum: ['reconciled', 'mismatch'] },
            positions: { type: 'integer' },
            breakdown: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  asset: { type: 'string' },
                  recorded: { type: 'number' },
                  onchain: { type: 'number' },
                  discrepancy: { type: 'number' },
                },
              },
            },
          },
        },
        BalanceSnapshot: {
          type: 'object',
          properties: {
            object: { type: 'string', enum: ['balance_snapshot'] },
            date: { type: 'string' },
            t: { type: 'integer', description: 'Epoch ms' },
            principal: { type: 'number' },
            value: { type: 'number' },
            accrued: { type: 'number' },
            positions: { type: 'integer' },
            users: { type: 'integer' },
            by_asset: { type: 'array', items: { type: 'object' } },
          },
        },
        Signal: {
          type: 'object',
          description: 'Per-vault risk-adjusted signal. APY fields are decimal fractions.',
          properties: {
            object: { type: 'string', enum: ['signal'] },
            vault_id: { type: 'string' },
            name: { type: 'string' },
            provider: { type: 'string' },
            asset: { type: 'string', enum: ['USDC', 'USDT'] },
            chain: { type: 'string' },
            risk_tier: { type: 'string', enum: ['bluechip', 'core', 'opportunistic'] },
            apy: { type: 'number' },
            volatility: { type: 'number' },
            trend_slope_bps_day: { type: 'number' },
            forecast_apy: { type: 'number', description: 'Naive 7-day trend forecast (decimal fraction)' },
            risk_factor: { type: 'number' },
            risk_adjusted_apy: { type: 'number' },
            rank: { type: 'integer' },
            recommendation: { type: 'string', enum: ['overweight', 'neutral', 'underweight'] },
          },
        },
        Regime: {
          type: 'object',
          properties: {
            object: { type: 'string', enum: ['regime'] },
            as_of: { type: 'string', format: 'date-time' },
            regime: { type: 'string', enum: ['rising', 'falling', 'stable', 'volatile'] },
            description: { type: 'string' },
            per_asset: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  asset: { type: 'string' },
                  regime: { type: 'string', enum: ['rising', 'falling', 'stable', 'volatile'] },
                  blend_apy: { type: 'number' },
                  trend_slope_bps_day: { type: 'number' },
                  volatility: { type: 'number' },
                },
              },
            },
          },
        },
        UpliftRow: {
          type: 'object',
          properties: {
            object: { type: 'string', enum: ['uplift_row'] },
            position_id: { type: 'string' },
            user_id: { type: ['string', 'null'] },
            asset: { type: 'string' },
            vault_id: { type: 'string' },
            principal: { type: 'number' },
            current_value: { type: 'number' },
            apy: { type: 'number' },
            aave_baseline: { type: 'number' },
            baseline_apy: { type: 'number' },
            hold_baseline: { type: 'number' },
            uplift_vs_aave: { type: 'number' },
            uplift_vs_hold: { type: 'number' },
          },
        },
        UpliftReport: {
          type: 'object',
          properties: {
            object: { type: 'string', enum: ['uplift'] },
            as_of: { type: 'string', format: 'date-time' },
            scope: { type: 'string' },
            totals: {
              type: 'object',
              properties: {
                principal: { type: 'number' },
                current_value: { type: 'number' },
                aave_baseline: { type: 'number' },
                hold_baseline: { type: 'number' },
                uplift_vs_aave: { type: 'number' },
                uplift_vs_hold: { type: 'number' },
                uplift_vs_aave_pct: { type: 'number' },
              },
            },
            positions: { type: 'array', items: ref('UpliftRow') },
          },
        },
        Decision: {
          type: 'object',
          properties: {
            object: { type: 'string', enum: ['decision'] },
            id: { type: 'string' },
            at: { type: 'string', format: 'date-time' },
            position_id: { type: 'string' },
            user_id: { type: ['string', 'null'] },
            asset: { type: 'string' },
            type: { type: 'string', enum: ['initial_routing', 'rebalance'] },
            from_vault: { type: ['string', 'null'] },
            to_vault: { type: 'string' },
            apy_before: { type: ['number', 'null'] },
            apy_after: { type: 'number' },
            expected_uplift_bps: { type: ['number', 'null'] },
            reason: { type: 'string' },
            alternatives: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  vault_id: { type: 'string' },
                  name: { type: 'string' },
                  provider: { type: 'string' },
                  apy: { type: 'number' },
                  risk_tier: { type: 'string' },
                },
              },
            },
            rationale: { type: 'string' },
            status: { type: 'string' },
          },
        },
        Advisor: {
          type: 'object',
          properties: {
            object: { type: 'string', enum: ['advisor'] },
            as_of: { type: 'string', format: 'date-time' },
            headline: { type: 'string' },
            regime: { type: 'string' },
            bullets: { type: 'array', items: { type: 'string' } },
            top_opportunities: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  vault_id: { type: 'string' },
                  name: { type: 'string' },
                  asset: { type: 'string' },
                  risk_adjusted_apy: { type: 'number' },
                  forecast_apy: { type: 'number' },
                  recommendation: { type: 'string' },
                },
              },
            },
            portfolio: {
              type: 'object',
              properties: {
                current_value: { type: 'number' },
                uplift_vs_aave: { type: 'number' },
                uplift_vs_aave_pct: { type: 'number' },
                positions: { type: 'integer' },
              },
            },
            disclaimer: { type: 'string' },
          },
        },
        PsoAllocationItem: {
          type: 'object',
          properties: {
            vault_id: { type: 'string' },
            name: { type: 'string' },
            asset: { type: 'string' },
            risk_tier: { type: 'string' },
            weight: { type: 'number', description: 'Allocation weight (0-1)' },
            risk_adjusted_apy: { type: 'number', description: 'Decimal fraction' },
          },
        },
        PsoAllocation: {
          type: 'object',
          properties: {
            object: { type: 'string', enum: ['pso_allocation'] },
            asset: { type: 'string' },
            expected_return: { type: 'number', description: 'Risk-adjusted expected return, decimal fraction' },
            iterations: { type: 'integer' },
            particles: { type: 'integer' },
            converged: { type: 'boolean' },
            allocations: { type: 'array', items: ref('PsoAllocationItem') },
          },
        },
        BacktestPoint: {
          type: 'object',
          properties: {
            t: { type: 'integer', description: 'Epoch ms' },
            value: { type: 'number' },
          },
        },
        Backtest: {
          type: 'object',
          properties: {
            object: { type: 'string', enum: ['backtest'] },
            strategy: { type: 'string', enum: ['aave-only', 'best-apy', 'risk-adjusted-pso'] },
            asset: { type: 'string' },
            from: { type: 'string', format: 'date-time' },
            to: { type: 'string', format: 'date-time' },
            days: { type: 'integer' },
            principal: { type: 'number' },
            final_value: { type: 'number' },
            total_return_pct: { type: 'number' },
            apy: { type: 'number', description: 'Decimal fraction' },
            volatility_pct: { type: 'number', description: 'Annualized volatility of daily returns' },
            max_drawdown_pct: { type: 'number' },
            rebalances: { type: 'integer' },
            series: { type: 'array', items: ref('BacktestPoint') },
          },
        },
        BacktestStrategyRow: {
          type: 'object',
          properties: {
            strategy: { type: 'string' },
            final_value: { type: 'number' },
            total_return_pct: { type: 'number' },
            apy: { type: 'number' },
            volatility_pct: { type: 'number' },
            max_drawdown_pct: { type: 'number' },
            rebalances: { type: 'integer' },
            uplift_vs_baseline: { type: 'number' },
          },
        },
        BacktestComparison: {
          type: 'object',
          properties: {
            object: { type: 'string', enum: ['backtest_comparison'] },
            asset: { type: 'string' },
            from: { type: 'string', format: 'date-time' },
            to: { type: 'string', format: 'date-time' },
            principal: { type: 'number' },
            baseline: { type: 'string' },
            strategies: { type: 'array', items: ref('BacktestStrategyRow') },
            series: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  strategy: { type: 'string' },
                  points: { type: 'array', items: ref('BacktestPoint') },
                },
              },
            },
          },
        },
      },
    },
  };
}

export const GET = apiHandler({ public: true }, async (request, ctx, api) => {
  return api.raw(buildDoc());
});
