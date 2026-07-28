# Thesauros Developer Platform — Architecture

Status: APPROVED FOR BUILD
Owner: CTO
Date: 2026-07-28

## 1. Product thesis

Thesauros sells yield infrastructure to wallets, neobanks and fintechs. The sale
closes when the partner's engineers believe integration is trivial and safe.
The Developer Platform is the artifact that proves it: a working sandbox API,
typed SDKs, live API reference, key management, webhooks and usage telemetry —
the same surface a Stripe- or Veda-grade infrastructure vendor ships.

This is not a marketing page with a code snippet. It is a functional product:
every endpoint responds, every key authenticates, every webhook fires.

## 2. Scope

In scope:
- REST API v1 (sandbox mode, deterministic simulation of the routing engine)
- API key auth (test + live key namespaces), rate limiting, request logging
- Webhook registration, HMAC signing, event log, test dispatcher
- TypeScript SDK and Python SDK (source-complete, installable, typed)
- OpenAPI 3.1 spec served at `/api/v1/openapi.json`
- Developer Portal UI at `/platform`: overview, quickstart, API reference
  with live "Try it", API keys, webhooks, usage, vaults, status
- Deterministic seed data so the sandbox feels alive on first load

Out of scope (this phase):
- Real blockchain settlement (the sandbox simulates it)
- Persistent database (in-process store with file-backed keys)
- Billing / invoicing UI

## 3. Architecture

```
developer.thesauros.io (Next.js 16, App Router) — standalone app
├── app/                          Developer Portal (client SPA shell)
│   ├── page.jsx                  Shell + view router
│   ├── platform.module.css       Portal design system
│   ├── data/                     endpoint catalog, code samples, copy
│   ├── views/                    Overview, Quickstart, ApiReference,
│   │                             ApiKeys, Webhooks, Usage, Vaults, Status
│   └── ui/                       shared primitives (CodeBlock w/ highlight,
│                                 Charts (SVG), tables, badges, modal)
├── app/api/v1/                   REST API (route handlers)
│   ├── keys/                     POST GET, [id]/DELETE
│   ├── vaults/                   GET, [id]/GET
│   ├── yield/                    GET, [asset]/GET
│   ├── positions/                POST GET, [id]/GET, [id]/withdraw/POST,
│   │                             [id]/history/GET
│   ├── rebalances/               GET
│   ├── webhooks/                 POST GET, [id]/DELETE, [id]/test/POST,
│   │                             events/GET
│   ├── usage/                    GET
│   ├── status/                   GET
│   └── openapi.json/             GET
├── lib/api/                      server-only core
│   ├── store.js                  singleton in-process store + seed
│   ├── auth.js                   key parse/verify, keygen
│   ├── ratelimit.js              token bucket per key + auth-failure limit
│   ├── http.js                   envelope, errors, headers, scopes, pagination, idempotency
│   ├── engine.js                 yield accrual + rebalance simulation
│   ├── urlguard.js               SSRF guard for webhook URLs
│   └── webhooks.js               HMAC signing + dispatch + event log
└── sdk/
    ├── typescript/               @thesauros/sdk (src/, package.json, tsconfig)
    └── python/                   thesauros (thesauros/, pyproject.toml)
```

## 4. API contract (source of truth)

Base: `/api/v1`. All responses are JSON envelopes:

Success: `{ "object": "<type>", "data": ... , "meta": {...} }` for single,
`{ "object": "list", "data": [...], "meta": { "total": n } }` for lists.
Error: `{ "error": { "code": "...", "message": "...", "doc_url": "..." } }`.

Auth: `Authorization: Bearer tsk_test_...` or `tsk_live_...`.
Every response carries `X-RateLimit-Limit`, `X-RateLimit-Remaining`,
`X-RateLimit-Reset`, `X-Request-Id`.

### 4.1 Keys
- `POST /keys` `{ "label": "..." }` -> ApiKey. Secret shown ONCE in full.
- `GET /keys` -> list (secrets masked `tsk_test_...a1b2`).
- `DELETE /keys/:id` -> `{ "object":"api_key","data":{"id","revoked":true} }`.

ApiKey: `{ id:"key_...", object:"api_key", label, secret, prefix,
  environment:"test"|"live", created_at, last_used_at, revoked, scopes:[...] }`

Bootstrap: portal needs a working key without auth. The store seeds one
bootstrap test key with a KNOWN secret (see 4.10). The portal surfaces it in
the Quickstart "sandbox key" callout. Key management endpoints themselves
require the bootstrap key (or any valid key) — this keeps the API honest while
making the demo frictionless.

### 4.2 Vaults
- `GET /vaults?asset=USDC&chain=base&status=active` -> list of Vault.
- `GET /vaults/:id` -> Vault.

Vault: `{ id:"vault_...", object:"vault", name, provider:"aave"|"morpho"|
  "compound"|"dolomite"|"treasury", asset:"USDC"|"USDT", chain:"base"|
  "arbitrum", apy: number, apy_7d_avg, apy_30d_avg, tvl_usd, capacity_usd,
  risk_tier:"bluechip"|"core"|"opportunistic", status:"active"|"paused",
  inception_date, description, allocation_pct }`

### 4.3 Yield
- `GET /yield?asset=USDC` -> aggregated best/blend rates.
- `GET /yield/:asset` -> per-asset detail with per-vault breakdown + history.

Yield: `{ object:"yield", asset, best_apy, blend_apy, blended_30d,
  breakdown:[{vault_id,name,provider,apy,allocation}], history:[{t,apy}] }`

### 4.4 Positions
- `POST /positions` `{ "wallet":"0x..", "asset":"USDC", "amount":1000,
    "strategy":"auto"|"vault_id" }` -> Position (status pending -> active).
- `GET /positions?wallet=&status=` -> list.
- `GET /positions/:id` -> Position with live accrued yield.
- `POST /positions/:id/withdraw` `{ "amount": n | "all": true }` -> Position.
- `GET /positions/:id/history` -> list of PositionEvent.

Position: `{ id:"pos_...", object:"position", wallet, asset, chain,
  vault_id, strategy, principal, current_value, accrued_yield,
  apy, status:"pending"|"active"|"withdrawing"|"closed",
  opened_at, updated_at, last_rebalance_at, tx_hash }`

PositionEvent: `{ id:"evt_...", type:"deposit"|"rebalance"|"accrual"|
  "withdraw"|"close", at, amount, apy, vault_id, note }`

### 4.5 Rebalances
- `GET /rebalances?position_id=` -> list of Rebalance.

Rebalance: `{ id:"rb_...", object:"rebalance", position_id, from_vault,
  to_vault, amount, reason:"yield_optimization"|"risk_adjustment"|
  "capacity_rebalance", apy_before, apy_after, at, tx_hash }`

### 4.6 Webhooks
- `POST /webhooks` `{ "url":"https://..", "events":["position.active",...] }`
- `GET /webhooks` -> list.
- `DELETE /webhooks/:id`.
- `POST /webhooks/:id/test` -> dispatches a synthetic event, returns delivery.
- `GET /webhooks/events?webhook_id=` -> event log with delivery status.

Webhook: `{ id:"wh_...", object:"webhook", url, events:[], secret:"whsec_...",
  active, created_at }`. Delivery: `{ id:"del_...", event, payload,
  signature, status:"delivered"|"failed", attempts, at, latency_ms }`.

Signature: `t=<unix>,v1=<hmac_sha256(secret, t + "." + body)>` in
`Webhook-Signature` header. Documented + verifiable in portal.

Supported events: `position.opened`, `position.active`, `position.rebalanced`,
`position.withdrawn`, `position.closed`, `yield.threshold`, `system.status`.

### 4.7 Usage
- `GET /usage?range=24h|7d|30d` -> time series + totals.

Usage: `{ object:"usage", range, totals:{requests, errors, p50_ms, p99_ms,
  unique_keys}, series:[{t, requests, errors, p50_ms, p99_ms}] }`

### 4.8 Status
- `GET /status` -> component health + uptime + incidents.

Status: `{ object:"status", overall:"operational", components:[{id,name,
  status, uptime_90d, latency_ms}], incidents:[], updated_at }`

### 4.9 OpenAPI
- `GET /openapi.json` -> full OpenAPI 3.1 document for everything above.

### 4.10 Bootstrap sandbox key
The store seeds exactly one key the portal can use out of the box:

```
secret: tsk_test_thesauros_sandbox_0000000000000000
id:     key_bootstrap
label:  "Sandbox bootstrap key"
```

Deterministic, documented, test-namespaced. Good enough for a sandbox demo;
the portal clearly labels it as shared/test.

## 5. Simulation engine (deterministic, alive)

- Seed ~8 vaults across Aave/Morpho/Compound/Dolomite/Treasury on Base +
  Arbitrum, realistic APYs (3-9%), TVLs, risk tiers.
- Yield accrual: position value grows continuously at its vault APY
  (computed from `opened_at`, not stored ticks) — GET feels live.
- Rebalances: engine generates a rebalance event for a position roughly every
  N hours of simulated time, moving to the best-APY vault for its asset.
  Deterministic PRNG seeded by position id so repeated reads are stable.
- Usage series: deterministic PRNG generates a plausible 30d request/latency
  curve; real API calls since boot are layered on top.
- All randomness is seeded -> identical on every cold start (testable).

## 6. SDK contract

Both SDKs mirror the API 1:1, are typed, and support:

```ts
import { Thesauros } from '@thesauros/sdk';
const client = new Thesauros({ apiKey: 'tsk_test_...' });   // sandbox default
await client.vaults.list({ asset: 'USDC' });
await client.yield.get('USDC');
const pos = await client.positions.create({ wallet, asset:'USDC', amount:1000 });
await client.positions.withdraw(pos.id, { all: true });
await client.webhooks.create({ url, events: ['position.rebalanced'] });
```

Python mirrors with `thesauros.Thesauros(api_key=...)` and snake_case methods.
SDKs are source-complete with types, error classes, retries, and README.
They point at a configurable `base_url` (default the deployed host).

## 7. Design system (Developer Portal)

Dark developer console, connected to brand but distinct from the marketing
site. NOT "black + one neon" — uses the existing multi-accent stack palette
semantically.

- Background layers: `#0a0f1e` base, `#0e1526` panels, `#131c33` raised,
  subtle blue radial glow + faint grid (CSS only, no assets).
- Ink: `#e8eefc` primary, `#93a4c3` secondary, `#5b6b8c` muted.
- Stroke: `rgba(147,164,195,0.14)`.
- Accents (semantic): blue `#3a7fff` interactive, teal `#4dead8` live/success,
  green `#5fe082` gains, orange `#ffa24d` pending/warning, purple `#ae82ff`
  strategies, red `#ff6b6b` errors.
- Type: Onest (brand, weights 400-800) for UI; JetBrains Mono for code, keys,
  numbers, tables. Strong size/weight contrast.
- Layout: fixed left sidebar (nav + env switcher), top bar (breadcrumb, search
  hint, org), scrollable content. Dense but breathable. 8px grid.
- Motion: view transitions, row hover, live-ticking numbers, chart draw-in,
  copy-button feedback, request/response animation in Try-it.
- No external UI libs, no icon packs — hand-built inline SVG icon set.
- No glassmorphism, no uniform rounded-2xl (use 6-10px radii), no gradient
  headline text.

## 8. Quality bar

- Every endpoint returns correct envelopes + headers, validated in browser.
- Try-it playground executes real requests against the API with the bootstrap
  key and renders real responses.
- API keys generated in the portal actually authenticate subsequent calls.
- Webhook test dispatch produces a real, HMAC-verifiable delivery log entry.
- Charts render from real `/usage` data.
- Zero console errors, zero broken states, keyboard navigable, reduced-motion
  respected.
- `next build` passes.

## 9. Build plan (parallel)

1. CTO: this spec + OpenAPI contract (done here).
2. Subagent BACKEND: `lib/api/*` + `app/api/v1/*` + `openapi.json` (this spec).
3. Subagent SDK: `sdk/typescript` + `sdk/python` (section 6 + API contract).
4. CTO: Developer Portal UI (section 7) against the contract.
5. CTO: integrate, run, verify end-to-end in browser, screenshot.
6. Critic agent: independent QA review -> iterate.
