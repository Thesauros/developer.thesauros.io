# Backend requirements: eliminate mocks in the developer portal

Audience: backend developer (Partner API, `Thesauros/developer.thesauros.io`)
and monitoring service owner (`Thesauros/thesauros_monitoring_service`).

Status (2026-08-12): portal real mode (`NEXT_PUBLIC_DATA_SOURCE=real`) shows
live data only where real endpoints exist: Overview/Vaults (monitoring
on-chain), API Keys, Users list/positions, Analytics partner block (Partner
API). Everything else still renders from the built-in sandbox. This doc lists
the knobs needed to remove the remaining mocks, ordered by priority.

Contract rules (apply to every new endpoint):

- Envelopes: single `{object, data, meta?}`, list `{object:"list", data, meta}`,
  error `{error:{code,message,doc_url}}`.
- Pagination: `?limit=&cursor=`, opaque `meta.next_cursor`.
- Auth: `Authorization: Bearer tsk_test_|tsk_live_`; scopes as noted per item.
- The sandbox implementation in `Thesauros/developer-portal`
  (`app/api/v1/*` + `lib/api/*`, OpenAPI at `/api/v1/openapi.json`) is the
  reference shape. Mirror field names exactly so the portal views switch
  without UI rework.

The portal proxies real calls same-origin (`/api/v1/real/*` ->
`PARTNER_API_URL`, `/api/v1/monitor/*` -> `MONITOR_API_URL`), so no CORS work
is needed; just add the endpoints.

---

## P1 — partner-facing surfaces currently mocked

### 1. Webhooks (real)

Portal view: Webhooks.jsx. Sandbox reference: `app/api/v1/webhooks/*`,
`lib/api/webhooks.js` (signing, delivery recording).

Needed on Partner API (partner-scoped key):

| Method + path | Purpose |
| --- | --- |
| `POST /api/v1/webhooks` | register endpoint (url, events[], secret) |
| `GET /api/v1/webhooks` | list with recent deliveries embedded |
| `DELETE /api/v1/webhooks/:id` | remove |
| `POST /api/v1/webhooks/:id/test` | dispatch a signed test event now |
| `GET /api/v1/webhooks/events` | catalog of event types |
| `GET /api/v1/webhooks/:id/deliveries` | delivery log (status, latency_ms, attempts, response_code) |

Backend must actually sign (`Webhook-Signature: t=...,v1=...`, HMAC-SHA256)
and POST to the partner URL, persist delivery rows, retry policy as in
sandbox. SSRF validation of target URLs (block loopback/private/link-local/
metadata) must move server-side too.

### 2. Usage / telemetry

Portal view: Usage.jsx + Overview "API p99" card. Sandbox reference:
`/api/v1/usage?range=30d` (`totals{requests,errors,p99_ms}`, `series[]`).

Needed: `GET /api/v1/usage?range=` (partner-scoped) computed from real
request logs (throttler/middleware counters): requests, error rate, latency
percentiles, per-day series, top endpoints.

### 3. User onboarding + ledger

Portal view: Users.jsx (create button + Ledger panel are sandbox-only today).

Needed (partner-scoped):

- `POST /api/v1/users` — create attributed end-user (external_id, label,
  email, wallets) — same shape as sandbox.
- `GET /api/v1/users/:id/ledger?limit=` — per-user event ledger (deposits,
  withdrawals, rebalance moves, yield accruals) from attribution/accounting
  events.

### 4. Status

Portal view: Status.jsx + Overview uptime. Sandbox reference:
`/api/v1/status` (public): `{status, version, uptime_s, services[], chains[]}`.

Needed: `GET /api/v1/status` (public) on Partner API aggregating: API health,
DB health, per-chain RPC health + last block lag (pull from monitoring),
monitoring last-update age.

---

## P2 — analytics that are simulation today

### 5. Rebalancer decision telemetry

Portal view: Analytics.jsx (advisor banner, uplift, signals, decisions,
regime). Sandbox reference: `/api/v1/analytics/{advisor,uplift,signals,
decisions,regime}`.

Source of truth: the off-chain rebalancer engine
(`optimized-rebalancer-contracts` ops). It must persist, and Partner API must
expose (partner-scoped, protocol-level parts public):

- `GET /api/v1/analytics/decisions` — executed rebalances: from/to venue,
  amount, reason codes, tx hashes, outcome.
- `GET /api/v1/analytics/signals` — input signals snapshot (rates, spreads,
  regime inputs) with timestamps.
- `GET /api/v1/analytics/uplift` — blended APY vs static-venue baseline,
  realized vs projected.
- `GET /api/v1/analytics/regime` — current risk regime + history.
- `GET /api/v1/analytics/advisor` — current recommendations with confidence
  and rationale text.

If the engine does not persist these yet, that persistence is the work item;
the portal only needs the read endpoints in sandbox shape.

### 6. Reconciliation

Portal view: Reconciliation.jsx. Sandbox reference:
`/api/v1/reconciliation/{report,balances,ledger,snapshots}`.

Needed (partner-scoped or admin): on-chain vault balances vs internal
accounting per asset/venue: `balances` (expected vs observed, diff_bps),
`ledger` (movement rows), `report` (summary + open discrepancies),
`snapshots` (periodic). Data sources: chain reads (monitoring can supply
observed balances) + Partner API accounting.

---

## P3 — monitoring service gaps (feed Overview/Vaults fully)

### 7. APY history persistence (7d averages)

Monitoring `apyAnalytics.series[].points` starts empty and only accumulates
while the service is polled. Portal shows `apy_7d_avg: null` because of this.

Needed: persist APY snapshots (DB or file), backfill from deployment logs if
available, expose per-vault history with at least 7 days depth:
`GET /api/vaults` should carry `apy_7d_avg` (percent string ok, portal
converts) or a dedicated `GET /api/apy/history?vault=&days=`.

### 8. Per-request network selection

`POST /api/network/switch` mutates global server state — unusable from a
multi-user portal. Needed: `?network=` query param on `/api/dashboard`,
`/api/vaults`, `/api/apy`, `/api/vault-lifetime` (keep current behavior as
default). Then the portal can add a network selector.

### 9. Venue risk tiers and per-venue yield breakdown

Portal Vaults table shows `risk_tier: on-chain` placeholder and Overview
yield table lacks per-venue breakdown (sandbox `/yield/:asset` has
`breakdown[]` per venue).

Needed from monitoring: per-venue risk classification (core/satellite/
experimental or equivalent) and per-venue current rates in one payload
(`providers[].depositRates` exists — add `riskTier` and venue identifiers
matching vault rows).

---

## Not needed from backend (stay sandbox by product decision)

- Try-it console in ApiReference executes against the sandbox by design
  (docs playground); endpoint catalog `app/data/endpoints.js` is
  documentation content, not live data.
- Decorative sparklines/deltas on Overview cards are design placeholders,
  not data.

---

## Acceptance

Real mode is mock-free for a view when: the view renders with
`NEXT_PUBLIC_DATA_SOURCE=real` against production with zero sandbox calls
and zero hardcoded placeholder values, and QA verifies parity of shapes with
the sandbox OpenAPI. Track per-view status in `.qa-skill/data/` of
`Thesauros/developer-portal`.
