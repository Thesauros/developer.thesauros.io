# Thesauros Partner API

Backend for the Thesauros developer platform: NestJS REST API with Postgres
persistence (partner attribution, campaigns, revenue share, yield history),
plus client SDKs.

This is the backend half of the former `developer.thesauros.io` monorepo.
The developer portal (Next.js UI + built-in sandbox API) was extracted into a
separate repository, `Thesauros/developer-portal`. The marketing site lives in
`../b2b.thesauros.io`.

## What's inside

```
developer.thesauros.io/
├── src/
│   ├── main.ts                  Bootstrap: Nest app, Swagger (/swagger, non-prod)
│   ├── bootstrap.ts             Shared app configuration (helmet, CORS, filters)
│   ├── app.module.ts            Root module
│   ├── auth/                    API key auth: tsk_test_/tsk_live_ keys, scopes
│   ├── partner/                 Partner Attribution v1 & Partner API v1
│   ├── yield/                   Protocol yield history endpoints
│   ├── store/                   Persistence services (TypeORM)
│   ├── crypto/                  Key encryption (ENCRYPTION_KEY)
│   ├── database/                TypeORM module + entities
│   └── common/                  Guards, decorators, filters, envelope interceptor
├── sdk/
│   ├── typescript/              @thesauros/sdk (typed, zero runtime deps)
│   └── python/                  thesauros (typed, stdlib only)
├── spec/
│   ├── developer-platform-architecture.md   Architecture + API contract (source of truth)
│   └── AI_CONCEPT_STRATEGY.pdf
├── QA-TESTING-GUIDE.md          End-to-end QA flows against the Partner API
├── PARTNER_PLAN.md              Partner integration plan
└── docker-compose.yml           Local Postgres
```

## Running locally

```bash
npm install
npm run db:up          # Postgres via docker compose
npm run dev:api        # watch mode
```

- API: http://localhost:3001 (PORT/API_PORT env override)
- Swagger (non-production): http://localhost:3001/swagger

Production build:

```bash
npm run build:api
npm run start:api
```

## Configuration

See `.env.example`. Key variables:

- `API_PORT` / `PORT` — listen port (default 3001)
- `DATABASE_URL` (+ `PGHOST`/`PGDATABASE`/`PGUSER`/`PGPASSWORD`/`PGPORT`) — Postgres
- `DB_SYNCHRONIZE`, `DB_SEED`, `DB_SSL`, `DB_LOGGING` — TypeORM behavior
- `ENCRYPTION_KEY` — 32-byte hex key for API key encryption at rest
- `CORS_ORIGINS` — allowed origins (e.g. the portal deployment)
- `PARTNER_API_URL` — where the portal's Next.js rewrites proxy
  `/api/v1/partners/*` and `/api/v1/partner/*` (set in the portal repo)
- `MONITOR_API_URL`, `MONITOR_NETWORKS` — monitoring service used for observed
  on-chain balances in `/api/v1/reconciliation/report`
- `APY_SNAPSHOTS`, `ANALYTICS_BASELINE_PROVIDER`, `RECONCILIATION_TOLERANCE_BPS`
  — analytics/reconciliation knobs (see `.env.example`)

## API surface (v1)

Partner Attribution v1 (public integration surface):

| Area | Endpoints |
| --- | --- |
| Keys | `POST /api/v1/keys`, `GET /api/v1/keys`, `DELETE /api/v1/keys/:id` |
| Partners | `POST /api/v1/partners`, `GET /api/v1/partners`, `GET /api/v1/partners/:id`, `PATCH /api/v1/partners/:id` |
| Campaigns | `POST /api/v1/partners/:id/campaigns`, `GET /api/v1/partners/:id/campaigns`, `PATCH /api/v1/partners/:id/campaigns/:campaignId` |
| Partner portal data | `GET /api/v1/partner/summary`, `GET /api/v1/partner/users`, `GET /api/v1/partner/deposits`, `GET /api/v1/partner/yield/history/:asset`, `GET /api/v1/partner/revenue`, `GET /api/v1/partner/user/:id/positions` |
| Yield | `GET /api/v1/yield/history/:asset` |
| Webhooks | `POST /api/v1/webhooks`, `GET /api/v1/webhooks`, `DELETE /api/v1/webhooks/:id`, `POST /api/v1/webhooks/:id/test`, `GET /api/v1/webhooks/events`, `GET /api/v1/webhooks/:id/deliveries` |
| Usage | `GET /api/v1/usage?range=` |
| Users | `POST /api/v1/users`, `GET /api/v1/users/:id/ledger` |
| Status | `GET /api/v1/status` (public) |
| Analytics | `GET /api/v1/analytics/{signals,regime,uplift,decisions,advisor}` |
| Reconciliation | `GET /api/v1/reconciliation/{balances,ledger,snapshots,report}` |

### Scopes & test keys

Key kinds: **admin** (`read`, `write`, …, no partner binding) and **partner**
(`partner:read`, bound to one partner). Seeded QA keys:

| Key | Kind | Partner |
| --- | --- | --- |
| `tsk_test_master_full_access_000000000000000` | admin (all scopes) | — |
| `tsk_test_acme_partner_key_00000000000000000` | partner | `ptn_seed_acme` (users: `usr_seed_nova`, `usr_seed_orbit`) |
| `tsk_test_orbit_partner_key_0000000000000000` | partner | `ptn_seed_orbit` (user: `usr_seed_quill`) |

Per endpoint (Swagger at `/swagger` documents the same, with input schemas):

| Endpoints | Scope |
| --- | --- |
| `GET /status` | public, no key |
| `GET /yield/history/:asset`, `GET /analytics/{signals,regime}` | any key (`read` or `partner:read`) — protocol-level |
| `GET /analytics/{uplift,decisions,advisor}`, `GET /reconciliation/{balances,ledger,snapshots}`, `/usage`, `/users*`, `/webhooks*`, `/partner/*` | **partner key only** — data is scoped to the caller's partner; an admin key gets 403 (no partner to scope to) |
| `GET /reconciliation/report` | **admin `read` only** — protocol-wide; partner keys get 403 |
| `/partners*`, `/keys*` | admin scopes (`partner:admin`, `keys:admin`) |

Valid assets are `USDC` and `USDT0` (Plasma's USDT flavour; plain `USDT`
does not exist). Unknown assets, malformed ids/limits/dates and unknown
query params are rejected with 400.

Cross-cutting behavior:

- Auth: `Authorization: Bearer tsk_test_... | tsk_live_...`
- Envelopes: single `{object,data,meta?}`, list `{object:"list",data,meta}`,
  error `{error:{code,message,doc_url}}`
- Rate limiting via `@nestjs/throttler`
- API keys encrypted at rest (`ENCRYPTION_KEY`)

See `QA-TESTING-GUIDE.md` for end-to-end request/response examples and
`spec/developer-platform-architecture.md` for the full contract.

## SDKs

TypeScript:

```bash
cd sdk/typescript && npm install && npm run build
```

```ts
import { Thesauros } from '@thesauros/sdk';
const client = new Thesauros({ apiKey: process.env.THESAUROS_API_KEY });
```

Python:

```bash
pip install ./sdk/python
```

```python
from thesauros import Thesauros
client = Thesauros(api_key=os.environ["THESAUROS_API_KEY"])
```

Both SDKs include webhook signature verification and typed resource models.
See `sdk/typescript/README.md` and `sdk/python/README.md`.

## Tests

```bash
npm test
```

Jest + ts-jest against `src/**/*.spec.ts`; database-dependent specs use
`pg-mem`, so no running Postgres is required.
