# @thesauros/sdk

Official TypeScript SDK for the **Thesauros Developer Platform** — the enterprise
B2B yield-infrastructure API. Typed, dependency-free, and built on the runtime
`fetch` API (Node >= 18, Deno, Bun, Cloudflare Workers, and modern browsers).

- Full TypeScript types for every resource and envelope
- Namespaced resources that mirror the REST API one-to-one
- Automatic retries with exponential backoff + jitter on `429` / `5xx`
- Per-request timeouts, typed errors, rate-limit introspection
- Webhook signature verification (HMAC-SHA256, constant-time)

## Installation

```bash
npm install @thesauros/sdk
# or
pnpm add @thesauros/sdk
# or
yarn add @thesauros/sdk
```

Requires a runtime with a global `fetch` (Node 18+). There are no runtime
dependencies.

## Quickstart

```ts
import { Thesauros } from '@thesauros/sdk';
const client = new Thesauros({ apiKey: 'tsk_test_...' });   // sandbox default
await client.vaults.list({ asset: 'USDC' });
await client.yield.get('USDC');
const pos = await client.positions.create({ wallet, asset:'USDC', amount:1000 });
await client.positions.withdraw(pos.id, { all: true });
await client.webhooks.create({ url, events: ['position.rebalanced'] });
```

> The shared sandbox bootstrap key is `tsk_test_thesauros_sandbox_0000000000000000`.
> It is test-namespaced and intended only for the sandbox demo — do not ship it
> in production code.

## Configuration

```ts
const client = new Thesauros({
  apiKey: process.env.THESAUROS_API_KEY!, // required: tsk_test_... or tsk_live_...
  base_url: 'https://developer.thesauros.io/api/v1', // optional, this is the default
  timeout: 30_000,   // optional, per-request timeout in ms (default 30000)
  maxRetries: 3,     // optional, retries for 429/5xx (default 3)
});
```

## Response shape: unwrapped `data` + `lastResponse`

Every successful API response is an envelope: `{ object, data, meta? }` (single)
or `{ object: "list", data: [...], meta: { total } }` (list). Resource methods
return the **unwrapped `data`** directly, so you work with real objects and
arrays — not envelopes.

Envelope `meta`, the `X-Request-Id`, and rate-limit headers from the most recent
call are recorded on the client:

```ts
const vaults = await client.vaults.list({ asset: 'USDC' });
console.log(vaults.length);                 // Vault[]
console.log(client.lastMeta?.total);        // list total from meta
console.log(client.lastResponse?.requestId); // X-Request-Id
console.log(client.lastResponse?.rateLimit); // { limit, remaining, reset }
```

`lastResponse` reflects the last completed request on this client instance. If
you share one client across concurrent calls, read it immediately after the call
you care about (or use a client per logical worker).

## Resources

### Keys

```ts
const key = await client.keys.create({ label: 'production-backend' });
console.log(key.secret); // shown in full ONLY here — store it now

const keys = await client.keys.list();      // secrets masked: tsk_test_...a1b2
await client.keys.revoke('key_abc123');      // -> { id, revoked: true }
```

### Vaults

```ts
const vaults = await client.vaults.list({ asset: 'USDC', chain: 'base', status: 'active' });
const vault = await client.vaults.retrieve('vault_abc123');
console.log(vault.apy, vault.risk_tier);
```

### Yield

`yield` is a reserved word, but it is a legal property name, so `client.yield`
works directly. A `client.rates` alias is provided for tooling that prefers it —
both reference the same resource.

```ts
const aggregated = await client.yield.get();        // GET /yield (aggregated view)
const detail = await client.yield.get('USDC');      // GET /yield/USDC (per-asset detail)
const same = await client.rates.get('USDC');        // alias, identical result
console.log(detail.best_apy, detail.breakdown, detail.history);
```

### Positions

```ts
const pos = await client.positions.create({
  wallet: '0xabc...',
  asset: 'USDC',
  amount: 1000,
  strategy: 'auto',        // or a specific vault_id
});

const positions = await client.positions.list({ wallet: '0xabc...', status: 'active' });
const fresh = await client.positions.retrieve(pos.id); // live accrued yield
const events = await client.positions.history(pos.id);

await client.positions.withdraw(pos.id, { amount: 250 }); // partial
await client.positions.withdraw(pos.id, { all: true });   // close out
```

### Rebalances

```ts
const rebalances = await client.rebalances.list({ position_id: pos.id });
console.log(rebalances[0].from_vault, rebalances[0].to_vault, rebalances[0].apy_after);
```

### Webhooks

```ts
const hook = await client.webhooks.create({
  url: 'https://example.com/webhooks/thesauros',
  events: ['position.rebalanced', 'position.active'],
});
console.log(hook.secret); // whsec_... — used to verify deliveries

const hooks = await client.webhooks.list();
const delivery = await client.webhooks.test(hook.id);   // dispatch a synthetic event
const log = await client.webhooks.events({ webhook_id: hook.id });
await client.webhooks.delete(hook.id);
```

Supported events: `position.opened`, `position.active`, `position.rebalanced`,
`position.withdrawn`, `position.closed`, `yield.threshold`, `system.status`.

### Usage

```ts
const usage = await client.usage.get({ range: '7d' }); // 24h | 7d | 30d
console.log(usage.totals.requests, usage.totals.p99_ms, usage.series.length);
```

### Status

```ts
const status = await client.status.get();
console.log(status.overall, status.components.map((c) => c.status));
```

## Error handling

All errors extend `ThesaurosError`, so a single catch can narrow on subclass:

```ts
import { Thesauros, ThesaurosError, ApiError, RateLimitError, NetworkError } from '@thesauros/sdk';

try {
  await client.positions.retrieve('pos_missing');
} catch (err) {
  if (err instanceof RateLimitError) {
    console.warn(`Rate limited; retry after ${err.retryAfter}s`, err.requestId);
  } else if (err instanceof ApiError) {
    console.error(`API error ${err.status} ${err.code}: ${err.message}`, err.doc_url);
  } else if (err instanceof NetworkError) {
    console.error('Transport failure or timeout', err.cause);
  } else if (err instanceof ThesaurosError) {
    console.error('SDK error', err.message);
  } else {
    throw err; // not from the SDK
  }
}
```

- `ApiError` — a non-2xx response carrying the API error envelope. Fields:
  `status`, `code`, `message`, `doc_url`, `requestId`.
- `RateLimitError` (extends `ApiError`) — a `429`, with `retryAfter` (seconds).
  Only surfaced after automatic retries are exhausted.
- `NetworkError` — DNS/connection/TLS failures or a request timeout. `cause`
  holds the underlying error when available.
- `ThesaurosError` — base class; also used for client-side validation (e.g. a
  missing `apiKey`) and malformed successful responses.

## Rate limiting & retries

Every response carries `X-RateLimit-Limit`, `X-RateLimit-Remaining`,
`X-RateLimit-Reset`, and `X-Request-Id`. The SDK:

- retries `429` and `5xx` responses up to `maxRetries` times (default 3),
- uses exponential backoff with jitter,
- honors `Retry-After` (seconds or HTTP-date) and falls back to
  `X-RateLimit-Reset` when choosing the delay,
- enforces a per-request `timeout` via `AbortController` (throws `NetworkError`).

Inspect the live state after any call:

```ts
await client.vaults.list();
const { remaining, reset } = client.lastResponse?.rateLimit ?? {};
```

## Verifying webhook signatures

Each delivery includes a `Webhook-Signature` header of the form
`t=<unix>,v1=<hmac_sha256_hex>`, where the HMAC is computed over the string
`"<t>.<rawBody>"` using your endpoint's signing secret (`whsec_...`).

Verify it with the exported helper. Pass the **raw, unmodified** request body:

```ts
import { verifyWebhookSignature } from '@thesauros/sdk';

// Node 18+ / Web Crypto — works on server and edge runtimes.
export async function handler(req: Request) {
  const rawBody = await req.text(); // must be the exact bytes received
  const ok = await verifyWebhookSignature(
    process.env.WEBHOOK_SECRET!,
    req.headers.get('webhook-signature'),
    rawBody,
    { toleranceSeconds: 300 }, // optional replay protection
  );
  if (!ok) return new Response('invalid signature', { status: 400 });

  const event = JSON.parse(rawBody);
  // ...handle event...
  return new Response('ok', { status: 200 });
}
```

The helper recomputes the HMAC-SHA256 and compares against every `v1` component
using a constant-time comparison (multiple `v1` values support secret rotation).
It uses the Web Crypto API, so it runs unchanged in Node >= 18, Deno, Bun,
Cloudflare Workers, and browsers.

## Building from source

```bash
npm install
npm run build   # tsc -> dist/
```

## License

MIT
