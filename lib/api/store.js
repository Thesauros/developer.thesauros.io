/**
 * Thesauros Developer Platform — in-process store.
 *
 * Singleton keyed on globalThis so state survives Next.js HMR in dev. All seed
 * data is deterministic (seeded PRNG, fixed timestamps) so every cold start is
 * identical. Runtime collections (keys created via the API, requestLog, etc.)
 * accumulate on top of the seed for the life of the process.
 *
 * NOTE on APY representation: every `apy` value in this system is a decimal
 * fraction (0.052 === 5.2% APY). This keeps the accrual math
 * `principal * (1 + apy * elapsedYears)` dimensionally correct.
 */

import { randomBytes } from 'node:crypto';

/* ------------------------------------------------------------------ *
 * Deterministic PRNG utilities (exported for the engine + webhooks).
 * ------------------------------------------------------------------ */

/** xmur3 string -> 32-bit seed hasher. Returns a function producing a uint32. */
export function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

/** mulberry32 — tiny fast PRNG seeded by a uint32. Returns () => [0,1). */
export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Convenience: a [0,1) PRNG seeded deterministically from an arbitrary string. */
export function rngFromString(str) {
  return mulberry32(xmur3(String(str))());
}

const HEX = '0123456789abcdef';

/** Deterministic hex string of `len` chars derived from `seedStr`. */
export function detHex(seedStr, len) {
  const rng = rngFromString(seedStr);
  let s = '';
  for (let i = 0; i < len; i++) s += HEX[Math.floor(rng() * 16)];
  return s;
}

/** Deterministic id like `pos_3f9a...` derived from `seedStr`. */
export function detId(prefix, seedStr, len = 12) {
  return `${prefix}_${detHex(seedStr, len)}`;
}

/** Deterministic 0x-prefixed 64-hex tx hash derived from `seedStr`. */
export function detTxHash(seedStr) {
  return `0x${detHex('tx:' + seedStr, 64)}`;
}

/** Non-deterministic id for runtime-created records (keys, positions, ...). */
export function randomId(prefix, bytes = 8) {
  return `${prefix}_${randomBytes(bytes).toString('hex')}`;
}

/* ------------------------------------------------------------------ *
 * Seed data
 * ------------------------------------------------------------------ */

/** Fixed anchor so seed timestamps are identical on every cold start. */
const DAY = 24 * 60 * 60 * 1000;
const SEED_NOW = Date.UTC(2026, 6, 28, 12, 0, 0); // 2026-07-28T12:00:00Z

/** ISO string `days` days before the fixed seed anchor. */
function daysAgo(days) {
  return new Date(SEED_NOW - days * DAY).toISOString();
}

function seedVaults() {
  const v = (o) => ({ object: 'vault', ...o });
  return [
    v({
      id: 'vault_aave_base_usdc',
      name: 'Aave V3 USDC Core',
      provider: 'aave',
      asset: 'USDC',
      chain: 'base',
      apy: 0.052,
      apy_7d_avg: 0.05,
      apy_30d_avg: 0.048,
      tvl_usd: 48_200_000,
      capacity_usd: 120_000_000,
      risk_tier: 'bluechip',
      status: 'active',
      inception_date: '2024-03-14',
      description: 'Senior USDC supply tranche on Aave V3 Base. Battle-tested money market with deep liquidity.',
      allocation_pct: 0.28,
    }),
    v({
      id: 'vault_morpho_base_usdc',
      name: 'Morpho Blue USDC Yield',
      provider: 'morpho',
      asset: 'USDC',
      chain: 'base',
      apy: 0.068,
      apy_7d_avg: 0.066,
      apy_30d_avg: 0.063,
      tvl_usd: 21_700_000,
      capacity_usd: 60_000_000,
      risk_tier: 'core',
      status: 'active',
      inception_date: '2024-08-02',
      description: 'Curated Morpho Blue USDC market with conservative collateral factors and active curators.',
      allocation_pct: 0.22,
    }),
    v({
      id: 'vault_compound_arb_usdc',
      name: 'Compound V3 USDC',
      provider: 'compound',
      asset: 'USDC',
      chain: 'arbitrum',
      apy: 0.045,
      apy_7d_avg: 0.044,
      apy_30d_avg: 0.043,
      tvl_usd: 33_900_000,
      capacity_usd: 90_000_000,
      risk_tier: 'bluechip',
      status: 'active',
      inception_date: '2024-01-20',
      description: 'Compound V3 USDC supply on Arbitrum. Minimalist single-asset market, audited oracle.',
      allocation_pct: 0.18,
    }),
    v({
      id: 'vault_dolomite_arb_usdt',
      name: 'Dolomite USDT Leverage',
      provider: 'dolomite',
      asset: 'USDT',
      chain: 'arbitrum',
      apy: 0.084,
      apy_7d_avg: 0.081,
      apy_30d_avg: 0.077,
      tvl_usd: 6_400_000,
      capacity_usd: 15_000_000,
      risk_tier: 'opportunistic',
      status: 'active',
      inception_date: '2025-02-11',
      description: 'Higher-yield USDT strategy via Dolomite money market. Opportunistic tier, capacity constrained.',
      allocation_pct: 0.08,
    }),
    v({
      id: 'vault_treasury_base_usdc',
      name: 'Tokenized Treasury USDC',
      provider: 'treasury',
      asset: 'USDC',
      chain: 'base',
      apy: 0.039,
      apy_7d_avg: 0.039,
      apy_30d_avg: 0.04,
      tvl_usd: 74_500_000,
      capacity_usd: 250_000_000,
      risk_tier: 'bluechip',
      status: 'active',
      inception_date: '2023-11-05',
      description: 'Tokenized short-duration T-bill exposure settled in USDC. Lowest-volatility floor allocation.',
      allocation_pct: 0.12,
    }),
    v({
      id: 'vault_morpho_arb_usdt',
      name: 'Morpho Blue USDT Yield',
      provider: 'morpho',
      asset: 'USDT',
      chain: 'arbitrum',
      apy: 0.076,
      apy_7d_avg: 0.073,
      apy_30d_avg: 0.07,
      tvl_usd: 12_800_000,
      capacity_usd: 40_000_000,
      risk_tier: 'core',
      status: 'active',
      inception_date: '2024-10-19',
      description: 'Curated Morpho Blue USDT market on Arbitrum with institutional curators.',
      allocation_pct: 0.07,
    }),
    v({
      id: 'vault_aave_arb_usdt',
      name: 'Aave V3 USDT',
      provider: 'aave',
      asset: 'USDT',
      chain: 'arbitrum',
      apy: 0.059,
      apy_7d_avg: 0.057,
      apy_30d_avg: 0.055,
      tvl_usd: 27_300_000,
      capacity_usd: 80_000_000,
      risk_tier: 'bluechip',
      status: 'paused',
      inception_date: '2024-05-30',
      description: 'Aave V3 USDT on Arbitrum. Temporarily paused pending a parameter governance update.',
      allocation_pct: 0.0,
    }),
    v({
      id: 'vault_compound_base_usdc',
      name: 'Compound V3 USDC Base',
      provider: 'compound',
      asset: 'USDC',
      chain: 'base',
      apy: 0.048,
      apy_7d_avg: 0.047,
      apy_30d_avg: 0.046,
      tvl_usd: 18_100_000,
      capacity_usd: 55_000_000,
      risk_tier: 'core',
      status: 'active',
      inception_date: '2024-12-08',
      description: 'Compound V3 USDC supply on Base. Core-tier diversifier for Base-denominated flows.',
      allocation_pct: 0.05,
    }),
  ];
}

function seedPosition(store, o) {
  const position = {
    object: 'position',
    strategy: 'auto',
    status: 'active',
    last_rebalance_at: null,
    withdrawn_total: 0,
    ...o,
  };
  store.positions.push(position);
  // Seed the opening position events deterministically.
  store.positionEvents.push({
    id: detId('evt', position.id + ':deposit'),
    object: 'position_event',
    position_id: position.id,
    type: 'deposit',
    at: position.opened_at,
    amount: position.principal,
    apy: position.apy,
    vault_id: position.vault_id,
    note: 'Initial deposit routed to vault',
  });
  return position;
}

function seedUsers(store) {
  const u = (o) => ({ object: 'user', status: 'active', metadata: {}, ...o });
  store.users.push(
    u({
      id: 'usr_seed_nova',
      external_id: 'partner-user-1001',
      label: 'Nova Treasury',
      email: 'treasury@novacorp.example',
      wallets: ['0x8a3f1c9e2b7d4065a1c8e9f0b2d4c6a8e1f3b5d7'],
      created_at: daysAgo(45),
      updated_at: daysAgo(2),
    }),
    u({
      id: 'usr_seed_orbit',
      external_id: 'partner-user-1002',
      label: 'Orbit Payments',
      email: 'ops@orbitpay.example',
      wallets: ['0x1b2c3d4e5f60718293a4b5c6d7e8f90123456789'],
      created_at: daysAgo(30),
      updated_at: daysAgo(1),
    }),
    u({
      id: 'usr_seed_quill',
      external_id: 'partner-user-1003',
      label: 'Quill Holdings',
      email: 'finance@quill.example',
      wallets: ['0xdeadbeef00112233445566778899aabbccddeeff'],
      created_at: daysAgo(62),
      updated_at: daysAgo(20),
    }),
  );
}

function seedPositions(store) {
  seedPosition(store, {
    id: 'pos_seed_alpha',
    user_id: 'usr_seed_nova',
    wallet: '0x8a3f1c9e2b7d4065a1c8e9f0b2d4c6a8e1f3b5d7',
    asset: 'USDC',
    chain: 'base',
    vault_id: 'vault_aave_base_usdc',
    principal: 25_000,
    apy: 0.052,
    opened_at: daysAgo(38),
    updated_at: daysAgo(2),
    tx_hash: detTxHash('pos_seed_alpha'),
    partner_id: 'ptn_seed_acme',
    campaign_id: 'cmp_seed_acme_launch',
  });
  seedPosition(store, {
    id: 'pos_seed_beta',
    user_id: 'usr_seed_orbit',
    wallet: '0x1b2c3d4e5f60718293a4b5c6d7e8f90123456789',
    asset: 'USDT',
    chain: 'arbitrum',
    vault_id: 'vault_morpho_arb_usdt',
    principal: 10_000,
    apy: 0.076,
    opened_at: daysAgo(23),
    updated_at: daysAgo(1),
    tx_hash: detTxHash('pos_seed_beta'),
    partner_id: 'ptn_seed_acme',
    campaign_id: 'cmp_seed_acme_earn',
  });
  seedPosition(store, {
    id: 'pos_seed_gamma',
    user_id: 'usr_seed_nova',
    wallet: '0x8a3f1c9e2b7d4065a1c8e9f0b2d4c6a8e1f3b5d7',
    asset: 'USDC',
    chain: 'base',
    vault_id: 'vault_morpho_base_usdc',
    principal: 50_000,
    apy: 0.068,
    opened_at: daysAgo(13),
    updated_at: daysAgo(1),
    tx_hash: detTxHash('pos_seed_gamma'),
    partner_id: 'ptn_seed_acme',
    campaign_id: null,
  });
  seedPosition(store, {
    id: 'pos_seed_delta',
    user_id: 'usr_seed_quill',
    wallet: '0xdeadbeef00112233445566778899aabbccddeeff',
    asset: 'USDC',
    chain: 'base',
    vault_id: 'vault_treasury_base_usdc',
    principal: 5_000,
    apy: 0.039,
    status: 'closed',
    opened_at: daysAgo(60),
    updated_at: daysAgo(20),
    tx_hash: detTxHash('pos_seed_delta'),
    partner_id: 'ptn_seed_orbit',
    campaign_id: 'cmp_seed_orbit_q3',
  });
}

function seedWebhooks(store) {
  store.webhooks.push({
    id: 'wh_seed_example',
    object: 'webhook',
    url: 'https://example.com/webhooks/thesauros',
    events: ['position.active', 'position.rebalanced', 'position.closed'],
    secret: 'whsec_seed_example_000000000000',
    active: false,
    created_at: daysAgo(30),
  });
}

function seedDeliveries(store) {
  const wh = store.webhooks[0];
  const mk = (i, event, status) => {
    const at = daysAgo(20 - i);
    const t = Math.floor(new Date(at).getTime() / 1000);
    const payload = {
      id: detId('evt', `seed_del_${i}`),
      type: event,
      created_at: at,
      data: { position_id: 'pos_seed_alpha', note: 'seed sample event' },
    };
    const body = JSON.stringify(payload);
    // Signature is illustrative for seed rows (computed with the same scheme).
    const signature = `t=${t},v1=${detHex('sig:' + body + wh.secret, 64)}`;
    return {
      id: detId('del', `seed_del_${i}`),
      object: 'delivery',
      webhook_id: wh.id,
      url: wh.url,
      event,
      payload,
      signature,
      status,
      attempts: status === 'delivered' ? 1 : 3,
      at,
      latency_ms: 120 + i * 37,
    };
  };
  store.deliveries.push(
    mk(0, 'position.active', 'failed'),
    mk(1, 'position.rebalanced', 'failed'),
    mk(2, 'position.closed', 'failed'),
  );
}

function seedPartners() {
  const p = (o) => ({ object: 'partner', status: 'active', metadata: {}, ...o });
  return [
    p({
      id: 'ptn_seed_acme',
      name: 'Acme Wallet',
      slug: 'acme-wallet',
      contact_email: 'dev@acmewallet.example',
      webhook_url: null,
      revenue_share_pct: 0.15,
      created_at: daysAgo(60),
      updated_at: daysAgo(2),
    }),
    p({
      id: 'ptn_seed_orbit',
      name: 'Orbit Finance',
      slug: 'orbit-finance',
      contact_email: 'integrations@orbitfinance.example',
      webhook_url: 'https://orbitfinance.example/webhooks/thesauros',
      revenue_share_pct: 0.20,
      created_at: daysAgo(45),
      updated_at: daysAgo(5),
    }),
  ];
}

function seedCampaigns() {
  const c = (o) => ({ object: 'campaign', status: 'active', ...o });
  return [
    c({
      id: 'cmp_seed_acme_launch',
      partner_id: 'ptn_seed_acme',
      name: 'Acme Summer Launch',
      slug: 'summer-launch',
      utm_source: 'twitter',
      utm_medium: 'cpc',
      created_at: daysAgo(55),
      updated_at: daysAgo(10),
    }),
    c({
      id: 'cmp_seed_acme_earn',
      partner_id: 'ptn_seed_acme',
      name: 'Acme Earn Widget',
      slug: 'earn-widget',
      utm_source: 'widget',
      utm_medium: 'embed',
      created_at: daysAgo(40),
      updated_at: daysAgo(3),
    }),
    c({
      id: 'cmp_seed_orbit_q3',
      partner_id: 'ptn_seed_orbit',
      name: 'Orbit Q3 Promo',
      slug: 'q3-promo',
      utm_source: 'newsletter',
      utm_medium: 'email',
      created_at: daysAgo(30),
      updated_at: daysAgo(7),
    }),
    c({
      id: 'cmp_seed_orbit_app',
      partner_id: 'ptn_seed_orbit',
      name: 'Orbit In-App',
      slug: 'in-app',
      utm_source: 'app',
      utm_medium: 'direct',
      created_at: daysAgo(25),
      updated_at: daysAgo(5),
    }),
  ];
}

function seedAttributions() {
  const a = (o) => ({ object: 'attribution', ...o });
  return [
    a({
      id: 'atr_seed_nova',
      user_id: 'usr_seed_nova',
      partner_id: 'ptn_seed_acme',
      campaign_id: 'cmp_seed_acme_launch',
      source: 'link',
      attributed_at: daysAgo(45),
    }),
    a({
      id: 'atr_seed_orbit',
      user_id: 'usr_seed_orbit',
      partner_id: 'ptn_seed_acme',
      campaign_id: 'cmp_seed_acme_earn',
      source: 'widget',
      attributed_at: daysAgo(30),
    }),
    a({
      id: 'atr_seed_quill',
      user_id: 'usr_seed_quill',
      partner_id: 'ptn_seed_orbit',
      campaign_id: 'cmp_seed_orbit_q3',
      source: 'link',
      attributed_at: daysAgo(62),
    }),
  ];
}

function seedKeys() {
  return [
    {
      id: 'key_bootstrap',
      object: 'api_key',
      label: 'Sandbox bootstrap key',
      secret: 'tsk_test_thesauros_sandbox_0000000000000000',
      secret_hash: null,
      prefix: 'tsk_test_the',
      environment: 'test',
      created_at: daysAgo(90),
      last_used_at: null,
      revoked: false,
      scopes: ['*'],
      partner_id: null,
    },
    {
      id: 'key_seed_acme',
      object: 'api_key',
      label: 'Acme Wallet partner key',
      secret: 'tsk_test_acme_partner_key_00000000000000000',
      secret_hash: null,
      prefix: 'tsk_test_acm',
      environment: 'test',
      created_at: daysAgo(58),
      last_used_at: daysAgo(1),
      revoked: false,
      scopes: ['read', 'partner:read'],
      partner_id: 'ptn_seed_acme',
    },
    {
      id: 'key_seed_orbit',
      object: 'api_key',
      label: 'Orbit Finance partner key',
      secret: 'tsk_test_orbit_partner_key_0000000000000000',
      secret_hash: null,
      prefix: 'tsk_test_orb',
      environment: 'test',
      created_at: daysAgo(43),
      last_used_at: daysAgo(2),
      revoked: false,
      scopes: ['read', 'partner:read'],
      partner_id: 'ptn_seed_orbit',
    },
  ];
}

/* ------------------------------------------------------------------ *
 * Store singleton + CRUD
 * ------------------------------------------------------------------ */

function buildSeed() {
  const store = {
    keys: [],
    vaults: [],
    users: [],
    positions: [],
    positionEvents: [],
    rebalances: [],
    webhooks: [],
    deliveries: [],
    partners: [],
    campaigns: [],
    attributions: [],
    locks: [],
    requestLog: [],
    bootedAt: Date.now(),
  };
  store.keys = seedKeys();
  store.vaults = seedVaults();
  store.partners = seedPartners();
  store.campaigns = seedCampaigns();
  store.attributions = seedAttributions();
  seedUsers(store);
  seedPositions(store);
  seedWebhooks(store);
  seedDeliveries(store);
  return store;
}

/** Return the process-wide store, seeding it on first access. */
export function getStore() {
  if (!globalThis.__thesaurosStore) {
    globalThis.__thesaurosStore = buildSeed();
  }
  return globalThis.__thesaurosStore;
}

/** All records in a collection. */
export function all(coll) {
  return getStore()[coll];
}

/** Find a record by id. */
export function get(coll, id) {
  return getStore()[coll].find((r) => r.id === id) || null;
}

/** Return all records matching a predicate. */
export function filter(coll, predicate) {
  return getStore()[coll].filter(predicate);
}

/** Insert a record and return it. */
export function create(coll, record) {
  getStore()[coll].push(record);
  return record;
}

/** Ring-buffer caps so unbounded collections can't OOM a long-lived process. */
const CAPS = { requestLog: 5000, deliveries: 500 };

/**
 * Insert a record, evicting the oldest entries beyond the collection's cap.
 * Used for append-heavy, non-authoritative collections (requestLog, deliveries).
 */
export function createCapped(coll, record) {
  const arr = getStore()[coll];
  arr.push(record);
  const cap = CAPS[coll];
  if (cap && arr.length > cap) arr.splice(0, arr.length - cap);
  return record;
}

/** Shallow-merge a patch into the record with the given id. Returns it or null. */
export function update(coll, id, patch) {
  const rec = get(coll, id);
  if (!rec) return null;
  Object.assign(rec, patch);
  return rec;
}

/** Remove a record by id. Returns true if something was removed. */
export function remove(coll, id) {
  const arr = getStore()[coll];
  const idx = arr.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  arr.splice(idx, 1);
  return true;
}
