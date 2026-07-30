# Thesauros Developer Platform

Developer portal, sandbox REST API and client SDKs for integrating Thesauros
non-custodial stablecoin yield into wallets, neobanks and fintech platforms.

This is a standalone Next.js application. The marketing site lives separately in
`../b2b.thesauros.io`.

## What's inside

```
developer.thesauros.io/
├── app/
│   ├── page.jsx                 Developer Portal UI (client SPA shell)
│   ├── layout.jsx               Root layout (Onest + JetBrains Mono)
│   ├── platform.module.css      Portal design system (dark console)
│   ├── views/                   Overview, Quickstart, ApiReference (live Try-it),
│   │                            ApiKeys, Users, Webhooks, Analytics & Advisor,
│   │                            Reconciliation, Usage, Vaults, Status
│   ├── ui/                      CodeBlock + syntax highlight, SVG charts, primitives
│   ├── lib/                     Client-side API helper + formatters, icon set
│   ├── data/                    Endpoint catalog + code samples (TS/Python/cURL)
│   └── api/v1/                  REST API — 31 route handlers (see below)
├── lib/api/                     Server core: auth, rate limiting, simulation engine,
│                                webhook signing/dispatch, SSRF guard, HTTP envelopes
├── sdk/
│   ├── typescript/              @thesauros/sdk (typed, zero runtime deps)
│   └── python/                  thesauros (typed, stdlib only)
└── spec/
    └── developer-platform-architecture.md   Architecture + API contract (source of truth)
```

## Running locally

```bash
npm install
npm run dev
```

- Portal: http://localhost:3000
- API base: http://localhost:3000/api/v1
- OpenAPI: http://localhost:3000/api/v1/openapi.json

Production build:

```bash
npm run build
npm run start
```

## The sandbox

The API is a deterministic, single-instance simulation of the Thesauros routing
engine. Every endpoint is real and behaves per the contract, but no funds move
and state resets on process restart. A shared bootstrap key is seeded for the
portal:

```
tsk_test_thesauros_sandbox_0000000000000000
```

APY values are decimal fractions (`0.052` == 5.2%).

## API surface (v1)

| Area | Endpoints |
| --- | --- |
| Keys | `POST /keys`, `GET /keys`, `DELETE /keys/:id` |
| Users | `POST /users`, `GET /users`, `GET /users/:id`, `PATCH /users/:id`, `GET /users/:id/positions`, `GET /users/:id/ledger` |
| Vaults | `GET /vaults`, `GET /vaults/:id` |
| Yield | `GET /yield`, `GET /yield/:asset` |
| Positions | `POST /positions`, `GET /positions`, `GET /positions/:id`, `POST /positions/:id/withdraw`, `GET /positions/:id/history` |
| Rebalances | `GET /rebalances` |
| Webhooks | `POST /webhooks`, `GET /webhooks`, `DELETE /webhooks/:id`, `POST /webhooks/:id/test`, `GET /webhooks/events` |
| Reconciliation | `GET /reconciliation/ledger`, `GET /reconciliation/balances`, `GET /reconciliation/report`, `GET /reconciliation/snapshots` |
| Analytics | `GET /analytics/uplift`, `GET /analytics/decisions`, `GET /analytics/signals`, `GET /analytics/regime`, `GET /analytics/advisor` |
| Telemetry | `GET /usage`, `GET /status` (public), `GET /openapi.json` (public) |

Cross-cutting behavior:

- Auth: `Authorization: Bearer tsk_test_... | tsk_live_...`
- Scopes: `read` (GET), `write` (mutations), `keys:admin` (key management).
  Live-key creation requires `keys:live`/`*`. Out-of-scope calls return 403.
- Envelopes: single `{object,data,meta?}`, list `{object:"list",data,meta}`,
  error `{error:{code,message,doc_url}}`.
- Pagination: `?limit=&cursor=` on lists; `meta.next_cursor` is opaque.
- Idempotency: `Idempotency-Key` header on `POST` replays the original response.
- Rate limiting: token bucket per key (120/min test, 600/min live) plus an
  IP-based limit on failed auth. `429` carries `Retry-After`.
- Webhooks: HMAC-SHA256 signed (`Webhook-Signature: t=...,v1=...`); endpoint
  URLs are SSRF-guarded (loopback/private/link-local/metadata rejected).

## SDKs

TypeScript:

```bash
cd sdk/typescript && npm install && npm run build
```

```ts
import { Thesauros } from '@thesauros/sdk';
const client = new Thesauros({ apiKey: process.env.THESAUROS_API_KEY });
const position = await client.positions.create({ wallet, asset: 'USDC', amount: 1000 });
```

Python:

```bash
pip install ./sdk/python
```

```python
from thesauros import Thesauros
client = Thesauros(api_key=os.environ["THESAUROS_API_KEY"])
position = client.positions.create(wallet=addr, asset="USDC", amount=1000)
```

Both SDKs include webhook signature verification and typed resource models. See
`sdk/typescript/README.md` and `sdk/python/README.md`.

## Analytics & AI foundation

The `/analytics` endpoints implement the measurement + explainability foundation
for the AI-over-PSO concept (`spec/AI_CONCEPT_STRATEGY.pdf`). This is the
evidence-first slice, deliberately built before any ML models:

- `uplift` — routed value vs passive baselines (Aave-only, hold-original). The
  concept's primary proof point.
- `decisions` — explainable log of every routing/rebalance decision with
  alternatives considered, expected uplift and rationale.
- `signals` — per-vault risk-adjusted APY (APY discounted by risk tier and
  volatility) with a naive trend forecast and a recommendation.
- `regime` — classifies the current rate regime (rising/falling/stable/volatile).
- `advisor` — template-generated (non-LLM) strategy summary derived from the
  metrics above.

Everything here is deterministic and derived from live sandbox data. There are
no ML models and no LLM — those require data and proof of uplift that do not
exist yet. This layer is what a real AI allocator would need as its measurement
and feature foundation anyway. See the critical assessment in the concept doc's
companion notes.

## Architecture

See `spec/developer-platform-architecture.md` for the full contract, simulation
model and design decisions.
