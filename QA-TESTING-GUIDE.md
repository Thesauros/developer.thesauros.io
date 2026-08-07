# Thesauros Partner API v1 — QA Testing Guide

**Partner API** is the backend service behind the partner programme. Partners (wallets, fintech apps, aggregators) integrate Thesauros through the API and earn a revenue share on the yield of the users they bring in.

### What this service does

1. **Partner Attribution** — tracks which partner brought which user, through which campaign and from which source (UTM tags, referral links, widgets).

2. **Partner Dashboard API** — self-service API for partners: a summary of attributed users, deposits, TVL, accrued yield, points and revenue share. A partner only ever sees their own users.

3. **Admin API** — internal API for managing partners, campaigns and API keys. Used by the Thesauros team.

4. **Authentication and authorisation** — Bearer API keys with a scope system. Every key carries a set of permissions and, optionally, a binding to a specific partner. Rate limit: 60 requests per minute.

### Modules

| Module | Purpose |
|---|---|
| **AuthModule** | Issuing, validating and revoking API keys. Secret hashing (SHA-256) and encryption (AES-256-GCM). |
| **PartnerModule** | CRUD for partners and campaigns. Attribution logic (user → partner → campaign). Revenue share calculation. |
| **StoreModule** | Database abstraction. Seeds test data on first start. |
| **CryptoModule** | Encryption/decryption of API key secrets (AES-256-GCM). |
| **DatabaseModule** | PostgreSQL connection via TypeORM. |

### Endpoint groups

| Group | Prefix | Audience | What it does |
|---|---|---|---|
| **Keys** | `/api/v1/keys` | Thesauros admins | Create, list and revoke API keys |
| **Partners (Admin)** | `/api/v1/partners` | Thesauros admins | Create and manage partners, create campaigns |
| **Partner (Self-Service)** | `/api/v1/partner` | Partners | View **your own** statistics: users, deposits, TVL, yield, revenue share, user positions. Every route requires a partner-bound key |
| **Yield (Protocol)** | `/api/v1/yield` | Everyone | Protocol-level yield metrics, identical for every caller. No partner binding required |

---

## Environment

**Base URL:** `https://partner-api-production-10ad.up.railway.app`
**Swagger UI:** `https://partner-api-production-10ad.up.railway.app/swagger`
**Swagger JSON:** `https://partner-api-production-10ad.up.railway.app/swagger-json`

### Response format

Every successful response is wrapped in a JSON envelope — exactly two top-level fields, `object` and `data`:
```json
{
  "object": "partner",
  "data": {
    "id": "ptn_seed_acme",
    "object": "partner",
    "name": "Acme Wallet"
  }
}
```

- The envelope's `object` mirrors the resource type inside `data` (`partner`, `campaign`, `api_key`, `partner_summary`, `partner_tvl`, `revenue_share`, `yield_history`, …).
- For collections `object` is `"list"` and `data` is an array:

```json
{ "object": "list", "data": [ { "id": "ptn_seed_acme", "object": "partner" } ] }
```

Errors come back in this shape:
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Partner not found."
  }
}
```

---

## 1. Authentication

Every request requires the `Authorization: Bearer <API_KEY>` header.

### Preconfigured test keys

| Key | Scopes | Partner | Description |
|---|---|---|---|
| `tsk_test_master_full_access_000000000000000` | `read`, `write`, `keys:admin`, `partner:admin`, `partner:read` | — | **Master key with full access (for QA)** |
| `tsk_test_thesauros_sandbox_0000000000000000` | `read`, `write` | — | Bootstrap key (no admin rights) |
| `tsk_test_acme_partner_key_00000000000000000` | `partner:read` | Acme Wallet (`ptn_seed_acme`) | Acme partner key |
| `tsk_test_orbit_partner_key_0000000000000000` | `partner:read` | Orbit Finance (`ptn_seed_orbit`) | Orbit partner key |

### Scopes

| Scope | Grants |
|---|---|
| `read` | Read general data |
| `write` | Write general data |
| `partner:read` | Read partner data (self-service) |
| `partner:admin` | Manage partners (admin) |
| `keys:admin` | Manage API keys |

---

## 2. Seed data

### Partners

| ID | Name | Revenue share | Status |
|---|---|---|---|
| `ptn_seed_acme` | Acme Wallet | 15% | active |
| `ptn_seed_orbit` | Orbit Finance | 20% | active |

### Campaigns

| ID | Partner | Name | UTM source |
|---|---|---|---|
| `cmp_seed_acme_launch` | Acme | Acme Summer Launch | twitter |
| `cmp_seed_acme_earn` | Acme | Acme Earn Widget | widget |
| `cmp_seed_orbit_q3` | Orbit | Orbit Q3 Promo | newsletter |
| `cmp_seed_orbit_app` | Orbit | Orbit In-App | app |

### Users

| ID | Name | Attributed to |
|---|---|---|
| `usr_seed_nova` | Nova Treasury | Acme (via `cmp_seed_acme_launch`) |
| `usr_seed_orbit` | Orbit Payments | Acme (via `cmp_seed_acme_earn`) |
| `usr_seed_quill` | Quill Holdings | Orbit (via `cmp_seed_orbit_q3`) |

### Positions

| ID | User | Asset | Principal | Status | Partner |
|---|---|---|---|---|---|
| `pos_seed_alpha` | Nova | USDC | $25,000 | active | Acme |
| `pos_seed_beta` | Orbit | USDT | $10,000 | active | Acme |
| `pos_seed_gamma` | Nova | USDC | $50,000 | active | Acme |
| `pos_seed_delta` | Quill | USDC | $5,000 | closed | Orbit |

---

## 3. Endpoints and test cases

### 3.1 Keys management (`/api/v1/keys`)

Required scope: `keys:admin`

> Note: the bootstrap key holds `read` and `write` — it does **not** have `keys:admin`. To test these endpoints, first create a key with the `keys:admin` scope through Swagger or directly in the database.

#### `POST /api/v1/keys` — Create an API key

```bash
curl -X POST https://partner-api-production-10ad.up.railway.app/api/v1/keys \
  -H "Authorization: Bearer <KEY_WITH_keys:admin>" \
  -H "Content-Type: application/json" \
  -d '{"label": "Test Key", "scopes": ["read", "write"]}'
```

**Test cases:**
- [ ] Response is the envelope `{ "object": "api_key", "data": { ... } }`
- [ ] On success `data.secret` holds the full secret (shown exactly once)
- [ ] `data` does **NOT** contain `secret_hash` or `_plaintext_secret`
- [ ] `partner_id` of a non-existent partner → **400**
- [ ] `partner_id` of a `disabled` partner → **400**
- [ ] Creating a key with `scopes: ["*"]` → **400 Bad Request** (wildcards are rejected)
- [ ] Creating a key with `scopes: ["keys:admin"]` → **400 Bad Request** (not assignable)
- [ ] `environment` is always `test` — passing `"environment": "live"` → **400**
- [ ] No `Authorization` header → **401 Unauthorized**
- [ ] Key without the `keys:admin` scope → **403 Forbidden**

#### `GET /api/v1/keys` — List keys

```bash
curl https://partner-api-production-10ad.up.railway.app/api/v1/keys \
  -H "Authorization: Bearer <KEY_WITH_keys:admin>"
```

**Test cases:**
- [ ] Returns an array of keys
- [ ] `secret` is masked (never the full secret)
- [ ] `secret_hash` is **NOT** present in the response

#### `DELETE /api/v1/keys/:id` — Revoke a key

```bash
curl -X DELETE https://partner-api-production-10ad.up.railway.app/api/v1/keys/KEY_ID \
  -H "Authorization: Bearer <KEY_WITH_keys:admin>"
```

**Test cases:**
- [ ] Successful revoke → `{ "object": "api_key", "data": { "id": "...", "revoked": true } }`
- [ ] Reusing the revoked key → **401**
- [ ] Unknown ID → `data` is `{ "id": "...", "revoked": false }`

---

### 3.2 Partners admin (`/api/v1/partners`)

Required scope: `partner:admin`

#### `POST /api/v1/partners` — Create a partner

```bash
curl -X POST https://partner-api-production-10ad.up.railway.app/api/v1/partners \
  -H "Authorization: Bearer <KEY_WITH_partner:admin>" \
  -H "Content-Type: application/json" \
  -d '{"name": "New Partner", "slug": "new-partner", "contact_email": "test@example.com", "revenue_share_pct": 0.10}'
```

**Test cases:**
- [ ] Creates the partner and automatically issues an API key for it
- [ ] `data` contains `partner` and `api_key` with a `secret`
- [ ] Missing required fields → **400**
- [ ] Key without `partner:admin` → **403**

#### `GET /api/v1/partners` — List partners

```bash
curl https://partner-api-production-10ad.up.railway.app/api/v1/partners \
  -H "Authorization: Bearer <KEY_WITH_partner:admin>"
```

**Test cases:**
- [ ] Returns every partner
- [ ] `?status=active` filter — active partners only
- [ ] `?status=disabled` filter — disabled partners only

#### `GET /api/v1/partners/:id` — Partner by ID

```bash
curl https://partner-api-production-10ad.up.railway.app/api/v1/partners/ptn_seed_acme \
  -H "Authorization: Bearer <KEY_WITH_partner:admin>"
```

**Test cases:**
- [ ] `ptn_seed_acme` → Acme Wallet data
- [ ] Unknown ID → **404**

#### `PATCH /api/v1/partners/:id` — Update a partner

```bash
curl -X PATCH https://partner-api-production-10ad.up.railway.app/api/v1/partners/ptn_seed_acme \
  -H "Authorization: Bearer tsk_test_master_full_access_000000000000000" \
  -H "Content-Type: application/json" \
  -d '{"status": "disabled"}'
```

**Why `status` exists:** there is deliberately no hard delete for partners or campaigns — attribution, positions and revenue history must be preserved. A soft disable (`active` → `disabled`) switches a partner or campaign off without losing data. Reverse it with the same PATCH and `"status": "active"`.

**What `status: "disabled"` triggers:**
1. Every live API key of the partner is revoked immediately (`revoked: true`) — the partner loses access to all endpoints.
2. A key bound to a disabled partner is rejected at authentication time, even if it was never revoked.
3. New keys cannot be issued for a disabled partner (**400**).
4. Switching back to `active` does **not** restore revoked keys — issue a new one via `POST /api/v1/keys`.

**Test cases:**
- [ ] Response is the envelope `{ "object": "partner", "data": { ... } }` with the same field set as `GET /partners/:id` (including `status`)
- [ ] Updating `revenue_share_pct` → the value changes
- [ ] `{"status":"disabled"}` → partner is disabled and appears in `GET /partners?status=disabled`
- [ ] After disable: `GET /api/v1/keys` → the partner's keys show `revoked: true`
- [ ] After disable: any `/api/v1/partner/*` call with that partner's key → **401** (key revoked)
- [ ] `{"status":"active"}` → active again (keys stay revoked — issue a new one)
- [ ] `{"status":"deleted"}` → **400**
- [ ] `updated_at` is refreshed
- [ ] Unknown ID → **404**

#### `POST /api/v1/partners/:id/campaigns` — Create a campaign

```bash
curl -X POST https://partner-api-production-10ad.up.railway.app/api/v1/partners/ptn_seed_acme/campaigns \
  -H "Authorization: Bearer tsk_test_master_full_access_000000000000000" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Campaign", "slug": "test-campaign", "utm_source": "test", "utm_medium": "manual"}'
```

#### `GET /api/v1/partners/:id/campaigns` — Campaigns of a partner

```bash
curl https://partner-api-production-10ad.up.railway.app/api/v1/partners/ptn_seed_acme/campaigns \
  -H "Authorization: Bearer tsk_test_master_full_access_000000000000000"
```

**Test cases:**
- [ ] Acme → 2 campaigns (`cmp_seed_acme_launch`, `cmp_seed_acme_earn`)
- [ ] Orbit → 2 campaigns (`cmp_seed_orbit_q3`, `cmp_seed_orbit_app`)
- [ ] `?status=disabled` after soft-disabling a campaign

#### `PATCH /api/v1/partners/:id/campaigns/:campaignId` — Update or disable a campaign

```bash
curl -X PATCH https://partner-api-production-10ad.up.railway.app/api/v1/partners/ptn_seed_acme/campaigns/cmp_seed_acme_launch \
  -H "Authorization: Bearer tsk_test_master_full_access_000000000000000" \
  -H "Content-Type: application/json" \
  -d '{"status": "disabled"}'
```

**Test cases:**
- [ ] `status: disabled` → the campaign is switched off
- [ ] A `campaignId` belonging to another partner → **404**
- [ ] `name` / `utm_source` / `utm_medium` can be changed

---

### 3.3 Partner self-service API (`/api/v1/partner`)

Required scope: `partner:read`
The key must be bound to a partner (`partner_id`).

> Use `tsk_test_acme_partner_key_00000000000000000` for Acme or `tsk_test_orbit_partner_key_0000000000000000` for Orbit.

#### `GET /api/v1/partner/summary` — Partner summary

```bash
curl https://partner-api-production-10ad.up.railway.app/api/v1/partner/summary \
  -H "Authorization: Bearer tsk_test_acme_partner_key_00000000000000000"
```

**Test cases:**
- [ ] Contains `partner`, `users`, `deposits`, `tvl`, `yield`, `points`, `revenue`
- [ ] `users.total` — number of attributed users (Acme: 2, Orbit: 1)
- [ ] `revenue.revenue_share_pct` — matches the partner's setting (Acme: 0.15)
- [ ] With the bootstrap key (no `partner_id`) → **403** "requires a partner-scoped API key"

#### `GET /api/v1/partner/users` — Attributed users

```bash
curl https://partner-api-production-10ad.up.railway.app/api/v1/partner/users \
  -H "Authorization: Bearer tsk_test_acme_partner_key_00000000000000000"
```

**Test cases:**
- [ ] Acme → 2 users (`usr_seed_nova`, `usr_seed_orbit`)
- [ ] Orbit → 1 user (`usr_seed_quill`)
- [ ] Another partner's users are **not** visible

#### `GET /api/v1/partner/deposits` — Deposits

```bash
curl https://partner-api-production-10ad.up.railway.app/api/v1/partner/deposits \
  -H "Authorization: Bearer tsk_test_acme_partner_key_00000000000000000"
```

**Test cases:**
- [ ] Acme: `total` = $85,000 (25k + 10k + 50k), `count` = 3
- [ ] Orbit: `total` = $5,000, `count` = 1

#### `GET /api/v1/partner/withdrawals` — Withdrawals

#### `GET /api/v1/partner/tvl` — Net TVL

**Test cases:**
- [ ] Acme TVL: sum of the principal of active positions = $85,000
- [ ] Orbit TVL: $0 (its only position is `closed`)

#### `GET /api/v1/partner/yield` — Accrued yield

#### `GET /api/v1/partner/yield/history/:asset` — Yield history for an asset

```bash
curl https://partner-api-production-10ad.up.railway.app/api/v1/partner/yield/history/USDC \
  -H "Authorization: Bearer tsk_test_acme_partner_key_00000000000000000"
```

> **Deprecated — use `GET /api/v1/yield/history/:asset` instead (see 3.4).**
>
> **This endpoint returns no partner data.** The series is the protocol-wide blended APY of the asset and is byte-for-byte identical for Acme, for Orbit and for an admin key with no partner at all. The endpoint takes no `partner_id` as input — it never did, and moving it did not change that. It is flagged in the payload by `scope: "protocol"`.
>
> That is exactly why it no longer belongs under `/partner/*`, and why the canonical route now lives in the protocol namespace where **no partner binding is required**.
>
> This alias is kept only so existing integrations keep working. It returns the identical payload, but still demands a partner-scoped key — that is a statement about *access*, not about *content*: every route under `/partner/*` requires a partner-bound key, without exception, so QA never has to reason about a third category of endpoint.

**Test cases:**
- [ ] `USDC` → a `history` array of 30 points, `blend_apy` > 0, `scope: "protocol"`
- [ ] `USDT` → same
- [ ] The response for the Acme key and the Orbit key is **identical** — no per-partner figures here
- [ ] `ETH` → **404** "Unsupported asset"
- [ ] A key with the `partner:read` scope but `partner_id: null` → **403** "requires a partner-scoped API key" (access rule of the `/partner/*` namespace; the same key gets **200** on the canonical route in 3.4)
- [ ] Payload is identical to `GET /api/v1/yield/history/:asset`

#### `GET /api/v1/partner/points` — Accrued points

#### `GET /api/v1/partner/revenue` — Revenue share

```bash
curl https://partner-api-production-10ad.up.railway.app/api/v1/partner/revenue \
  -H "Authorization: Bearer tsk_test_acme_partner_key_00000000000000000"
```

**Test cases:**
- [ ] `revenue_share_pct` = 0.15 for Acme
- [ ] Contains the `annual` and `daily` breakdowns
- [ ] `partner_revenue` > 0
- [ ] `protocol_blend_apy` is **the same** for Acme and Orbit (it is the protocol rate, not a partner one). The field was previously named `blend_apy`
- [ ] `tvl`, by contrast, **differs** between partners

#### `GET /api/v1/partner/user/:id/positions` — Positions of a user

```bash
curl https://partner-api-production-10ad.up.railway.app/api/v1/partner/user/usr_seed_nova/positions \
  -H "Authorization: Bearer tsk_test_acme_partner_key_00000000000000000"
```

**Test cases:**
- [ ] `usr_seed_nova` with the Acme key → 2 positions (`pos_seed_alpha`, `pos_seed_gamma`) plus `current_value` and `accrued_yield`
- [ ] `usr_seed_quill` with the Acme key → **403** "not attributed to your partner"
- [ ] `usr_seed_quill` with the Orbit key → 1 position (`pos_seed_delta`)

---

### 3.4 Protocol yield (`/api/v1/yield`)

Required scope: `read` **or** `partner:read`. A partner binding is **not** required — this data is protocol-level.

> **Publicly readable by any valid key.** Nothing here is partner-scoped: every caller gets the same numbers, and no endpoint in this namespace accepts or infers a `partner_id`.

The rule that separates the namespaces:

| Namespace | What lives there | Key |
|---|---|---|
| `/api/v1/partner/*` | Partner data only. Every route requires a key with a `partner_id` | partner-scoped |
| `/api/v1/yield/*` | Protocol metrics, identical for everyone | any `read` / `partner:read` key, no `partner_id` needed |

#### `GET /api/v1/yield/history/:asset` — Blended APY history for an asset

```bash
curl https://partner-api-production-10ad.up.railway.app/api/v1/yield/history/USDC \
  -H "Authorization: Bearer tsk_test_master_full_access_000000000000000"
```

Prove for yourself that the series carries no partner data — three different keys, one identical body:

```bash
BASE=https://partner-api-production-10ad.up.railway.app
for KEY in tsk_test_master_full_access_000000000000000 \
           tsk_test_acme_partner_key_00000000000000000 \
           tsk_test_orbit_partner_key_0000000000000000; do
  curl -s "$BASE/api/v1/yield/history/USDC" -H "Authorization: Bearer $KEY" \
    | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print(d['blend_apy'], [p['apy'] for p in d['history']])"
done | sort -u | wc -l
# expected: 1  (one distinct response across an admin key and two different partners)
```

Allocation-weighted APY across all active Thesauros vaults for the asset. The series is **identical for every caller** — it is a protocol showcase metric, not partner-attributed funds. Flagged explicitly by `data.scope: "protocol"`. The series is deterministic (sandbox), not a real historical export.

**Test cases:**
- [ ] `USDC` → `scope: "protocol"`, `blend_apy` > 0, `history` of 30 points
- [ ] The response is **identical** for the Acme key, the Orbit key and the master key (`partner_id: null`)
- [ ] A key with `partner:read` and `partner_id: null` → **200** (unlike the deprecated alias under `/partner/*`)
- [ ] A key with neither `read` nor `partner:read` → **403**
- [ ] `ETH` → **404** "Unsupported asset"

---

## 4. Security checks

| # | Test | Expected result |
|---|---|---|
| S1 | Request without `Authorization` | 401 |
| S2 | Request with an invalid key | 401 |
| S3 | Request with a revoked key | 401 |
| S4 | `partner:read` key → `GET /api/v1/partners` (admin) | 403 |
| S5 | `read` key → `GET /api/v1/partner/summary` | 403 |
| S6 | Acme key → `GET /api/v1/partner/user/usr_seed_quill/positions` | 403 (another partner's user) |
| S7 | Creating a key with `scopes: ["*"]` | 400 |
| S8 | Creating a key with `environment: "live"` | 400 |
| S9 | `GET /api/v1/keys` and `POST /api/v1/keys` → check that `secret_hash` and `_plaintext_secret` are absent | Absent |
| S10 | Rate limiting: 61 requests in a minute with one key (endpoints may vary) | 61st → 429 Too Many Requests |
| S11 | Key of a `disabled` partner | 401 (revoked) / 403 (partner disabled) |
| S12 | Key with `partner:read` but `partner_id: null` → any `/api/v1/partner/*` route | 403 |
| S13 | The same key → `GET /api/v1/yield/history/USDC` | 200 (protocol data, no partner needed) |

### Rate limiting

The limit is **60 requests per minute per API key, across all endpoints combined** (per IP when no key is supplied). The budget used to be counted per endpoint, which is why a 429 only appeared after ~200 requests; it is now a single shared budget.

Every response carries `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset`; a 429 adds `Retry-After`.

```bash
for i in $(seq 1 61); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    https://partner-api-production-10ad.up.railway.app/api/v1/partner/summary \
    -H "Authorization: Bearer tsk_test_acme_partner_key_00000000000000000"
done | sort | uniq -c
# expected: 60x 200, 1x 429
```

---

## 5. Response format checks

- [ ] Every successful response is wrapped in `{ "object": "...", "data": ... }` — exactly two top-level fields
- [ ] The envelope's `object` matches `data.object` for single resources, and is `"list"` for arrays
- [ ] Every error carries `{ "error": { "code": "...", "message": "..." } }`
- [ ] HTTP codes: 200 (ok), 201 (created), 400 (validation), 401 (no/bad auth), 403 (forbidden), 404 (not found), 429 (rate limit)

---

## 6. Testing tools

1. **Swagger UI** — interactive testing straight from the browser:
   `https://partner-api-production-10ad.up.railway.app/swagger`
   Click "Authorize" → paste a key → call the endpoints

2. **curl** — see the examples above

3. **Postman** — import the Swagger JSON:
   `https://partner-api-production-10ad.up.railway.app/swagger-json`
