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
      { name: 'vaults', description: 'Yield vaults' },
      { name: 'yield', description: 'Aggregated yield' },
      { name: 'positions', description: 'Positions & lifecycle' },
      { name: 'rebalances', description: 'Rebalance history' },
      { name: 'webhooks', description: 'Webhook endpoints & events' },
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
      },
    },
  };
}

export const GET = apiHandler({ public: true }, async (request, ctx, api) => {
  return api.raw(buildDoc());
});
