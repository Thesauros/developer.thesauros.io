# Partner Attribution v1 & Partner API v1 — Implementation Plan

Status: IN PROGRESS
Date: 2026-08-03

---

## 1. Context

The `developer.thesauros.io` monolith (Next.js 16, App Router) already has a
sandbox REST API with auth, rate limiting, webhooks, and an in-process store.
This plan extends it with **partner attribution** and a **partner-facing API**.

Structural patterns are borrowed from Thesauros-Rebalance-Engine:
- Clean module separation (service → route handler, like service → controller)
- Static factory-style service initialisation
- Input/output type contracts
- Consistent error handling via the existing `apiHandler` wrapper
- Central entity registry in the store

---

## 2. Deliverables

### 2.1 Partner Attribution v1
- `partner_id` / `campaign_id` labels on links, deposits, users, positions
- Partner dashboard data: users, deposits, withdrawals, net TVL, yield, points,
  expected revenue share

### 2.2 Partner API v1
Stable external contract wrapping sandbox internals:
| Endpoint | Description |
|----------|-------------|
| `GET  /api/v1/partner/yield` | Current yield (blend + per-vault) |
| `GET  /api/v1/partner/tvl` | Total value locked |
| `GET  /api/v1/partner/yield/history/:asset` | Historical yield series |
| `GET  /api/v1/partner/user/:id/position` | User positions (partner-scoped) |
| `GET  /api/v1/partner/user/:id/points` | User points (partner-scoped) |
| `GET  /api/v1/partner/summary` | Partner summary (auto-scoped to auth key) |
| `GET  /api/v1/partner/users` | Partner's attributed users |
| `GET  /api/v1/partner/deposits` | Partner's attributed deposits |
| `GET  /api/v1/partner/withdrawals` | Partner's attributed withdrawals |
| `GET  /api/v1/partner/revenue` | Expected revenue share |

Auth: existing Bearer key system. Partners get a key with `partner_id` binding
and scope `partner:read`. Admin keys can manage partners (`partner:admin`).

### 2.3 Encryption
AES-256-GCM encryption of API key secrets at rest. Transparent — callers of
`authenticate()` don't change.

### 2.4 Tests
Vitest suite covering: crypto module, store operations, partner service logic,
API route integration tests. `npm test` runs all.

---

## 3. Architecture (new files)

```
lib/
  api/
    crypto.js              AES-256-GCM encrypt/decrypt for secrets
    partner/
      partner.service.js   Partner + Campaign CRUD, slug lookup
      attribution.service.js Attribution tracking, deposit/TVL/yield aggregation
      revenue.service.js   Revenue share calculation
      index.js             Barrel export
    store.js               MODIFIED — add partner/campaign/attribution collections + seed

app/
  api/
    v1/
      partners/
        route.js                     POST (create) / GET (list)
        [id]/
          route.js                   GET / PATCH
          campaigns/
            route.js                 POST / GET
      partner/
        summary/route.js             GET — auto-scoped to auth key's partner
        users/route.js               GET — attributed users
        deposits/route.js            GET — attributed deposits
        withdrawals/route.js         GET — attributed withdrawals
        tvl/route.js                 GET — net TVL
        yield/
          route.js                   GET — current yield
          history/[asset]/route.js   GET — yield history
        user/
          [id]/
            position/route.js       GET — user position (partner-scoped)
            points/route.js         GET — user points (partner-scoped)
        revenue/route.js             GET — expected revenue share

tests/
  crypto.test.js
  store.test.js
  partner.service.test.js
  attribution.service.test.js
  revenue.service.test.js
  api/
    partners.test.js
    partner-api.test.js
```

---

## 4. Data Model (store collections)

### 4.1 `partners`
```js
{
  id: 'ptn_...',
  object: 'partner',
  name: 'Acme Wallet',
  slug: 'acme-wallet',            // unique, for attribution links
  contact_email: 'dev@acme.io',
  webhook_url: null,
  revenue_share_pct: 0.15,        // 15% of protocol fees from attributed TVL
  status: 'active' | 'disabled',
  metadata: {},
  created_at: ISO,
  updated_at: ISO,
}
```

### 4.2 `campaigns`
```js
{
  id: 'cmp_...',
  object: 'campaign',
  partner_id: 'ptn_...',
  name: 'Summer 2026 Launch',
  slug: 'summer-2026',            // unique within partner
  utm_source: 'twitter',
  utm_medium: 'cpc',
  status: 'active' | 'paused',
  created_at: ISO,
  updated_at: ISO,
}
```

### 4.3 `attributions`
One record per attributed user (first-touch model):
```js
{
  id: 'atr_...',
  object: 'attribution',
  user_id: 'usr_...',             // FK to users collection
  partner_id: 'ptn_...',
  campaign_id: 'cmp_...' | null,
  source: 'link' | 'widget' | 'direct' | 'api',
  attributed_at: ISO,
}
```

### 4.4 Modifications to existing collections

**keys** — add optional `partner_id` field. When set, the key is partner-scoped.

**positions** — add optional `partner_id`, `campaign_id` (set on creation if
the creating key is partner-scoped or if body includes them).

**users** — no schema change; attribution is tracked in `attributions` collection.

---

## 5. Implementation Phases

### Phase 1: Encryption module
- `lib/api/crypto.js` — AES-256-GCM with random IV
- Derive key from `ENCRYPTION_KEY` env var (fallback to deterministic dev key)
- Modify `auth.js` → encrypt secret before storing, decrypt on authenticate
- Backwards-compatible: detect plaintext vs encrypted on read

### Phase 2: Store extensions + seed data
- Add `partners`, `campaigns`, `attributions` to store
- Seed 2 demo partners (Acme Wallet, Orbit Finance) with 2 campaigns each
- Attribute existing seed users to partners
- Add `partner_id` to 2 seed API keys (one per partner)

### Phase 3: Partner services
- `partner.service.js` — CRUD with slug uniqueness, campaign management
- `attribution.service.js` — attribute, query, aggregate (deposits/TVL/yield/points)
- `revenue.service.js` — fee model: `attributed_tvl × blend_apy × fee_rate × share_pct`

### Phase 4: API route handlers
- Admin routes (`/partners`, `/partners/:id`, `/partners/:id/campaigns`)
- Partner-scoped routes (`/partner/summary`, etc.)
- Modify `POST /positions` to propagate `partner_id`/`campaign_id` from auth key

### Phase 5: Tests
- Install vitest
- Unit tests for crypto, services
- Integration tests for API routes (using fetch against test server)
- `npm test` script

### Phase 6: OpenAPI + docs
- Add new endpoints to openapi.json route handler
- Update `app/data/endpoints.js` catalog
- Update README

---

## 6. Revenue Share Model

```
partner_attributed_tvl = Σ position.current_value  where position.partner_id = partner
protocol_fee_rate      = 0.10  (10% of yield — configurable)
partner_share_pct      = partner.revenue_share_pct (default 15%)

daily_yield     = partner_attributed_tvl × blend_apy / 365
protocol_fees   = daily_yield × protocol_fee_rate
partner_revenue = protocol_fees × partner_share_pct
```

Annualised and daily views in the summary endpoint.

---

## 7. Auth & Scoping

Existing scopes: `read`, `write`, `keys:admin`, `*`.

New scopes:
- `partner:read` — read own partner data (summary, users, deposits, etc.)
- `partner:admin` — manage partners/campaigns (create, update, list all)

Partner-scoped keys get `['read', 'partner:read']` by default.

The `apiHandler` already enforces scopes via `requiredScope`. Partner routes
use `partner:read`. Admin routes use `partner:admin`.

Auto-scoping: when a request is authenticated with a partner key, the partner_id
is resolved from `key.partner_id`. No need to pass it explicitly.

---

## 8. Encryption Detail

Algorithm: AES-256-GCM (authenticated encryption).

```
ENCRYPTION_KEY env var → 32-byte key (hex or base64)
Fallback (dev): sha256('thesauros-dev-encryption-key-do-not-use-in-prod')

encrypt(plaintext):
  iv = randomBytes(12)
  cipher = createCipheriv('aes-256-gcm', key, iv)
  encrypted = cipher.update(plaintext) + cipher.final()
  tag = cipher.getAuthTag()
  return 'enc:' + base64(iv + tag + encrypted)

decrypt(blob):
  if (!blob.startsWith('enc:')) return blob  // plaintext compat
  raw = base64decode(blob.slice(4))
  iv = raw[0..12], tag = raw[12..28], data = raw[28..]
  decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(data) + decipher.final()
```

Only `secret` field on API keys is encrypted. Prefixes (`tsk_test_`, `tsk_live_`)
and masked versions remain plaintext for display.
