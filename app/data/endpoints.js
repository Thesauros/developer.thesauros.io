// Endpoint catalog that drives the API Reference + Try-it playground.
// `path` uses :param placeholders resolved from Try-it inputs.

export const ENDPOINT_GROUPS = [
  {
    id: 'positions',
    label: 'Positions',
    blurb: 'Open, inspect and redeem non-custodial yield positions.',
    endpoints: [
      {
        id: 'create-position',
        method: 'POST',
        path: '/positions',
        summary: 'Open a yield position',
        description:
          'Deposits stablecoins from a user wallet into the optimal vault for the chosen strategy. Funds never leave the user\u2019s custody; Thesauros only routes.',
        params: [
          { name: 'wallet', in: 'body', type: 'string', required: true, desc: 'User wallet address (0x\u2026)', example: '0x8b3E5f2A91cD4b6E80fA2d19c7B4e3A5d0F61234' },
          { name: 'asset', in: 'body', type: 'enum', required: true, options: ['USDC', 'USDT'], desc: 'Stablecoin asset', example: 'USDC' },
          { name: 'amount', in: 'body', type: 'number', required: true, desc: 'Deposit amount (whole units)', example: '1000' },
          { name: 'strategy', in: 'body', type: 'string', required: false, desc: '"auto" (default) or a vault_id', example: 'auto' },
        ],
        bodyExample: { wallet: '0x8b3E5f2A91cD4b6E80fA2d19c7B4e3A5d0F61234', asset: 'USDC', amount: 1000, strategy: 'auto' },
        returns: '201 \u2014 Position object (status transitions pending \u2192 active)',
      },
      {
        id: 'list-positions',
        method: 'GET',
        path: '/positions',
        summary: 'List positions',
        description: 'Returns positions visible to this API key, newest first. Filter by wallet or status.',
        params: [
          { name: 'wallet', in: 'query', type: 'string', required: false, desc: 'Filter by wallet address', example: '' },
          { name: 'status', in: 'query', type: 'enum', required: false, options: ['pending', 'active', 'withdrawing', 'closed'], desc: 'Filter by lifecycle status', example: '' },
        ],
        returns: '200 \u2014 list of Position',
      },
      {
        id: 'get-position',
        method: 'GET',
        path: '/positions/:id',
        summary: 'Retrieve a position',
        description: 'Returns a single position with live accrued yield computed to the current block time.',
        params: [{ name: 'id', in: 'path', type: 'string', required: true, desc: 'Position id (pos_\u2026)', example: 'pos_seed_0' }],
        returns: '200 \u2014 Position',
      },
      {
        id: 'withdraw-position',
        method: 'POST',
        path: '/positions/:id/withdraw',
        summary: 'Withdraw from a position',
        description: 'Redeems part or all of a position back to the user wallet. Full withdrawal closes the position.',
        params: [
          { name: 'id', in: 'path', type: 'string', required: true, desc: 'Position id', example: 'pos_seed_0' },
          { name: 'amount', in: 'body', type: 'number', required: false, desc: 'Amount to withdraw', example: '500' },
          { name: 'all', in: 'body', type: 'boolean', required: false, desc: 'Withdraw everything and close', example: 'false' },
        ],
        bodyExample: { amount: 500 },
        returns: '200 \u2014 updated Position',
      },
      {
        id: 'position-history',
        method: 'GET',
        path: '/positions/:id/history',
        summary: 'Position event history',
        description: 'Chronological ledger of deposits, accruals, rebalances and withdrawals for a position.',
        params: [{ name: 'id', in: 'path', type: 'string', required: true, desc: 'Position id', example: 'pos_seed_0' }],
        returns: '200 \u2014 list of PositionEvent',
      },
    ],
  },
  {
    id: 'vaults',
    label: 'Vaults',
    blurb: 'The underlying yield venues the router allocates across.',
    endpoints: [
      {
        id: 'list-vaults',
        method: 'GET',
        path: '/vaults',
        summary: 'List vaults',
        description: 'All yield venues with live APY, TVL, capacity and risk tier.',
        params: [
          { name: 'asset', in: 'query', type: 'enum', required: false, options: ['USDC', 'USDT'], desc: 'Filter by asset', example: '' },
          { name: 'chain', in: 'query', type: 'enum', required: false, options: ['base', 'arbitrum'], desc: 'Filter by chain', example: '' },
          { name: 'status', in: 'query', type: 'enum', required: false, options: ['active', 'paused'], desc: 'Filter by status', example: '' },
        ],
        returns: '200 \u2014 list of Vault',
      },
      {
        id: 'get-vault',
        method: 'GET',
        path: '/vaults/:id',
        summary: 'Retrieve a vault',
        description: 'A single vault with its current metrics and allocation weight.',
        params: [{ name: 'id', in: 'path', type: 'string', required: true, desc: 'Vault id (vault_\u2026)', example: 'vault_aave_usdc_base' }],
        returns: '200 \u2014 Vault',
      },
    ],
  },
  {
    id: 'yield',
    label: 'Yield',
    blurb: 'Aggregated, allocation-weighted yield intelligence.',
    endpoints: [
      {
        id: 'yield-aggregate',
        method: 'GET',
        path: '/yield',
        summary: 'Aggregate yield',
        description: 'Best and blend APY across the router for each supported asset.',
        params: [{ name: 'asset', in: 'query', type: 'enum', required: false, options: ['USDC', 'USDT'], desc: 'Restrict to one asset', example: '' }],
        returns: '200 \u2014 list of Yield',
      },
      {
        id: 'yield-asset',
        method: 'GET',
        path: '/yield/:asset',
        summary: 'Yield for an asset',
        description: 'Per-asset detail: best/blend APY, per-vault breakdown and 30-day history.',
        params: [{ name: 'asset', in: 'path', type: 'enum', required: true, options: ['USDC', 'USDT'], desc: 'Stablecoin asset', example: 'USDC' }],
        returns: '200 \u2014 Yield with breakdown + history',
      },
    ],
  },
  {
    id: 'rebalances',
    label: 'Rebalances',
    blurb: 'Every routing decision, with the reasoning.',
    endpoints: [
      {
        id: 'list-rebalances',
        method: 'GET',
        path: '/rebalances',
        summary: 'List rebalances',
        description: 'Rebalance events across positions, including source/destination vault and APY improvement.',
        params: [{ name: 'position_id', in: 'query', type: 'string', required: false, desc: 'Filter by position', example: '' }],
        returns: '200 \u2014 list of Rebalance',
      },
    ],
  },
  {
    id: 'webhooks',
    label: 'Webhooks',
    blurb: 'Real-time event delivery to your backend, HMAC-signed.',
    endpoints: [
      {
        id: 'create-webhook',
        method: 'POST',
        path: '/webhooks',
        summary: 'Register an endpoint',
        description: 'Subscribe a URL to lifecycle events. Returns a signing secret (whsec_\u2026).',
        params: [
          { name: 'url', in: 'body', type: 'string', required: true, desc: 'HTTPS endpoint', example: 'https://api.yourapp.com/webhooks/thesauros' },
          { name: 'events', in: 'body', type: 'array', required: true, desc: 'Event types to subscribe', example: 'position.active,position.rebalanced' },
        ],
        bodyExample: { url: 'https://api.yourapp.com/webhooks/thesauros', events: ['position.active', 'position.rebalanced'] },
        returns: '201 \u2014 Webhook',
      },
      {
        id: 'list-webhooks',
        method: 'GET',
        path: '/webhooks',
        summary: 'List endpoints',
        description: 'All registered webhook endpoints for this key.',
        params: [],
        returns: '200 \u2014 list of Webhook',
      },
      {
        id: 'delete-webhook',
        method: 'DELETE',
        path: '/webhooks/:id',
        summary: 'Remove an endpoint',
        description: 'Stops delivery and deletes the endpoint.',
        params: [{ name: 'id', in: 'path', type: 'string', required: true, desc: 'Webhook id (wh_\u2026)', example: 'wh_seed_0' }],
        returns: '200 \u2014 confirmation',
      },
      {
        id: 'test-webhook',
        method: 'POST',
        path: '/webhooks/:id/test',
        summary: 'Send a test event',
        description: 'Dispatches a synthetic position.rebalanced event so you can verify signature handling end-to-end.',
        params: [{ name: 'id', in: 'path', type: 'string', required: true, desc: 'Webhook id', example: 'wh_seed_0' }],
        returns: '200 \u2014 Delivery record (includes signature)',
      },
      {
        id: 'webhook-events',
        method: 'GET',
        path: '/webhooks/events',
        summary: 'Delivery log',
        description: 'Recent deliveries with status, attempts, latency and the exact signature sent.',
        params: [{ name: 'webhook_id', in: 'query', type: 'string', required: false, desc: 'Filter by endpoint', example: '' }],
        returns: '200 \u2014 list of Delivery',
      },
    ],
  },
  {
    id: 'keys',
    label: 'API Keys',
    blurb: 'Credential management for your integration.',
    endpoints: [
      {
        id: 'create-key',
        method: 'POST',
        path: '/keys',
        summary: 'Create an API key',
        description: 'Issues a new key. The full secret is returned only once \u2014 store it securely.',
        params: [{ name: 'label', in: 'body', type: 'string', required: true, desc: 'Human-readable label', example: 'Production backend' }],
        bodyExample: { label: 'Production backend' },
        returns: '201 \u2014 ApiKey (secret shown once)',
      },
      {
        id: 'list-keys',
        method: 'GET',
        path: '/keys',
        summary: 'List API keys',
        description: 'All keys for this account. Secrets are masked.',
        params: [],
        returns: '200 \u2014 list of ApiKey (masked)',
      },
      {
        id: 'revoke-key',
        method: 'DELETE',
        path: '/keys/:id',
        summary: 'Revoke a key',
        description: 'Immediately invalidates a key. Requests using it return 401.',
        params: [{ name: 'id', in: 'path', type: 'string', required: true, desc: 'Key id (key_\u2026)', example: 'key_bootstrap' }],
        returns: '200 \u2014 revoked ApiKey',
      },
    ],
  },
  {
    id: 'observability',
    label: 'Usage & Status',
    blurb: 'Telemetry for your integration and platform health.',
    endpoints: [
      {
        id: 'usage',
        method: 'GET',
        path: '/usage',
        summary: 'Usage metrics',
        description: 'Request volume, error rate and latency percentiles over a time range.',
        params: [{ name: 'range', in: 'query', type: 'enum', required: false, options: ['24h', '7d', '30d'], desc: 'Time range', example: '7d' }],
        returns: '200 \u2014 Usage with time series',
      },
      {
        id: 'status',
        method: 'GET',
        path: '/status',
        summary: 'System status',
        description: 'Per-component health, 90-day uptime and latency. Public endpoint.',
        params: [],
        returns: '200 \u2014 Status',
      },
    ],
  },
];

export const WEBHOOK_EVENTS = [
  'position.opened',
  'position.active',
  'position.rebalanced',
  'position.withdrawn',
  'position.closed',
  'yield.threshold',
  'system.status',
];

export function findEndpoint(id) {
  for (const g of ENDPOINT_GROUPS) {
    const e = g.endpoints.find((x) => x.id === id);
    if (e) return { group: g, endpoint: e };
  }
  return null;
}
