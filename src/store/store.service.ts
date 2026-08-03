import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';

interface StoreRecord {
  id: string;
  [key: string]: unknown;
}

interface StoreState {
  keys: StoreRecord[];
  vaults: StoreRecord[];
  users: StoreRecord[];
  positions: StoreRecord[];
  positionEvents: StoreRecord[];
  rebalances: StoreRecord[];
  webhooks: StoreRecord[];
  deliveries: StoreRecord[];
  partners: StoreRecord[];
  campaigns: StoreRecord[];
  attributions: StoreRecord[];
  locks: StoreRecord[];
  requestLog: StoreRecord[];
  bootedAt: number;
  [key: string]: unknown;
}

const DAY = 24 * 60 * 60 * 1000;
const SEED_NOW = Date.UTC(2026, 6, 28, 12, 0, 0);

function daysAgo(days: number): string {
  return new Date(SEED_NOW - days * DAY).toISOString();
}

function detHex(seedStr: string, len: number): string {
  const HEX = '0123456789abcdef';
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  function xmurNext(): number {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  }
  const seed = xmurNext();
  let a = seed;
  function rng(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  let s = '';
  for (let i = 0; i < len; i++) s += HEX[Math.floor(rng() * 16)];
  return s;
}

function detTxHash(seedStr: string): string {
  return `0x${detHex('tx:' + seedStr, 64)}`;
}

@Injectable()
export class StoreService implements OnModuleInit {
  private readonly logger = new Logger(StoreService.name);
  private store!: StoreState;

  onModuleInit(): void {
    if ((globalThis as any).__thesaurosNestStore) {
      this.store = (globalThis as any).__thesaurosNestStore;
      this.logger.log('Reusing existing store (HMR-safe)');
      return;
    }
    this.store = this.buildSeed();
    (globalThis as any).__thesaurosNestStore = this.store;
    this.logger.log(
      `Store seeded: ${this.store.partners.length} partners, ` +
      `${this.store.campaigns.length} campaigns, ` +
      `${this.store.users.length} users, ` +
      `${this.store.positions.length} positions`,
    );
  }

  /* ---------------------------------------------------------------- *
   * Generic CRUD
   * ---------------------------------------------------------------- */

  all<T extends StoreRecord>(collection: string): T[] {
    return (this.store[collection] as T[]) ?? [];
  }

  get<T extends StoreRecord>(collection: string, id: string): T | null {
    return this.all<T>(collection).find((r) => r.id === id) ?? null;
  }

  filter<T extends StoreRecord>(collection: string, predicate: (r: T) => boolean): T[] {
    return this.all<T>(collection).filter(predicate);
  }

  create<T extends StoreRecord>(collection: string, record: T): T {
    this.all(collection).push(record);
    return record;
  }

  update<T extends StoreRecord>(collection: string, id: string, patch: Partial<T>): T | null {
    const record = this.get<T>(collection, id);
    if (!record) return null;
    Object.assign(record, patch);
    return record;
  }

  remove(collection: string, id: string): boolean {
    const arr = this.all(collection);
    const idx = arr.findIndex((r) => r.id === id);
    if (idx === -1) return false;
    arr.splice(idx, 1);
    return true;
  }

  randomId(prefix: string, bytes = 8): string {
    const { randomBytes } = require('node:crypto');
    return `${prefix}_${randomBytes(bytes).toString('hex')}`;
  }

  /* ---------------------------------------------------------------- *
   * Seed
   * ---------------------------------------------------------------- */

  private buildSeed(): StoreState {
    const store: StoreState = {
      keys: this.seedKeys(),
      vaults: this.seedVaults(),
      users: [],
      positions: [],
      positionEvents: [],
      rebalances: [],
      webhooks: [],
      deliveries: [],
      partners: this.seedPartners(),
      campaigns: this.seedCampaigns(),
      attributions: this.seedAttributions(),
      locks: [],
      requestLog: [],
      bootedAt: Date.now(),
    };
    this.seedUsers(store);
    this.seedPositions(store);
    return store;
  }

  private seedPartners(): StoreRecord[] {
    return [
      {
        id: 'ptn_seed_acme',
        object: 'partner',
        name: 'Acme Wallet',
        slug: 'acme-wallet',
        contact_email: 'dev@acmewallet.example',
        webhook_url: null,
        revenue_share_pct: 0.15,
        status: 'active',
        metadata: {},
        created_at: daysAgo(60),
        updated_at: daysAgo(2),
      },
      {
        id: 'ptn_seed_orbit',
        object: 'partner',
        name: 'Orbit Finance',
        slug: 'orbit-finance',
        contact_email: 'integrations@orbitfinance.example',
        webhook_url: 'https://orbitfinance.example/webhooks/thesauros',
        revenue_share_pct: 0.20,
        status: 'active',
        metadata: {},
        created_at: daysAgo(45),
        updated_at: daysAgo(5),
      },
    ];
  }

  private seedCampaigns(): StoreRecord[] {
    return [
      { id: 'cmp_seed_acme_launch', object: 'campaign', partner_id: 'ptn_seed_acme', name: 'Acme Summer Launch', slug: 'summer-launch', utm_source: 'twitter', utm_medium: 'cpc', status: 'active', created_at: daysAgo(55), updated_at: daysAgo(10) },
      { id: 'cmp_seed_acme_earn', object: 'campaign', partner_id: 'ptn_seed_acme', name: 'Acme Earn Widget', slug: 'earn-widget', utm_source: 'widget', utm_medium: 'embed', status: 'active', created_at: daysAgo(40), updated_at: daysAgo(3) },
      { id: 'cmp_seed_orbit_q3', object: 'campaign', partner_id: 'ptn_seed_orbit', name: 'Orbit Q3 Promo', slug: 'q3-promo', utm_source: 'newsletter', utm_medium: 'email', status: 'active', created_at: daysAgo(30), updated_at: daysAgo(7) },
      { id: 'cmp_seed_orbit_app', object: 'campaign', partner_id: 'ptn_seed_orbit', name: 'Orbit In-App', slug: 'in-app', utm_source: 'app', utm_medium: 'direct', status: 'active', created_at: daysAgo(25), updated_at: daysAgo(5) },
    ];
  }

  private seedAttributions(): StoreRecord[] {
    return [
      { id: 'atr_seed_nova', object: 'attribution', user_id: 'usr_seed_nova', partner_id: 'ptn_seed_acme', campaign_id: 'cmp_seed_acme_launch', source: 'link', attributed_at: daysAgo(45) },
      { id: 'atr_seed_orbit', object: 'attribution', user_id: 'usr_seed_orbit', partner_id: 'ptn_seed_acme', campaign_id: 'cmp_seed_acme_earn', source: 'widget', attributed_at: daysAgo(30) },
      { id: 'atr_seed_quill', object: 'attribution', user_id: 'usr_seed_quill', partner_id: 'ptn_seed_orbit', campaign_id: 'cmp_seed_orbit_q3', source: 'link', attributed_at: daysAgo(62) },
    ];
  }

  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private seedKeys(): StoreRecord[] {
    const bootstrapSecret = 'tsk_test_thesauros_sandbox_0000000000000000';
    const acmeSecret = 'tsk_test_acme_partner_key_00000000000000000';
    const orbitSecret = 'tsk_test_orbit_partner_key_0000000000000000';
    return [
      { id: 'key_bootstrap', object: 'api_key', label: 'Sandbox bootstrap key', secret: bootstrapSecret, secret_hash: this.sha256(bootstrapSecret), prefix: 'tsk_test_the', environment: 'test', created_at: daysAgo(90), last_used_at: null, revoked: false, scopes: ['read', 'write'], partner_id: null },
      { id: 'key_seed_acme', object: 'api_key', label: 'Acme Wallet partner key', secret: acmeSecret, secret_hash: this.sha256(acmeSecret), prefix: 'tsk_test_acm', environment: 'test', created_at: daysAgo(58), last_used_at: null, revoked: false, scopes: ['partner:read'], partner_id: 'ptn_seed_acme' },
      { id: 'key_seed_orbit', object: 'api_key', label: 'Orbit Finance partner key', secret: orbitSecret, secret_hash: this.sha256(orbitSecret), prefix: 'tsk_test_orb', environment: 'test', created_at: daysAgo(43), last_used_at: null, revoked: false, scopes: ['partner:read'], partner_id: 'ptn_seed_orbit' },
    ];
  }

  private seedVaults(): StoreRecord[] {
    const v = (o: Record<string, unknown>): StoreRecord => ({ object: 'vault', ...o } as unknown as StoreRecord);
    return [
      v({ id: 'vault_aave_base_usdc', name: 'Aave V3 USDC Core', provider: 'aave', asset: 'USDC', chain: 'base', apy: 0.052, apy_7d_avg: 0.05, apy_30d_avg: 0.048, tvl_usd: 48_200_000, capacity_usd: 120_000_000, risk_tier: 'bluechip', status: 'active', allocation_pct: 0.28 }),
      v({ id: 'vault_morpho_base_usdc', name: 'Morpho Blue USDC Yield', provider: 'morpho', asset: 'USDC', chain: 'base', apy: 0.068, apy_7d_avg: 0.066, apy_30d_avg: 0.063, tvl_usd: 21_700_000, capacity_usd: 60_000_000, risk_tier: 'core', status: 'active', allocation_pct: 0.22 }),
      v({ id: 'vault_compound_arb_usdc', name: 'Compound V3 USDC', provider: 'compound', asset: 'USDC', chain: 'arbitrum', apy: 0.045, apy_7d_avg: 0.044, apy_30d_avg: 0.043, tvl_usd: 33_900_000, capacity_usd: 90_000_000, risk_tier: 'bluechip', status: 'active', allocation_pct: 0.18 }),
      v({ id: 'vault_morpho_arb_usdt', name: 'Morpho Blue USDT Yield', provider: 'morpho', asset: 'USDT', chain: 'arbitrum', apy: 0.076, apy_7d_avg: 0.073, apy_30d_avg: 0.07, tvl_usd: 12_800_000, capacity_usd: 40_000_000, risk_tier: 'core', status: 'active', allocation_pct: 0.07 }),
      v({ id: 'vault_treasury_base_usdc', name: 'Tokenized Treasury USDC', provider: 'treasury', asset: 'USDC', chain: 'base', apy: 0.039, apy_7d_avg: 0.039, apy_30d_avg: 0.04, tvl_usd: 74_500_000, capacity_usd: 250_000_000, risk_tier: 'bluechip', status: 'active', allocation_pct: 0.12 }),
      v({ id: 'vault_compound_base_usdc', name: 'Compound V3 USDC Base', provider: 'compound', asset: 'USDC', chain: 'base', apy: 0.048, apy_7d_avg: 0.047, apy_30d_avg: 0.046, tvl_usd: 18_100_000, capacity_usd: 55_000_000, risk_tier: 'core', status: 'active', allocation_pct: 0.05 }),
    ];
  }

  private seedUsers(store: StoreState): void {
    const u = (o: Record<string, unknown>): StoreRecord => ({ object: 'user', status: 'active', metadata: {}, ...o } as unknown as StoreRecord);
    store.users.push(
      u({ id: 'usr_seed_nova', external_id: 'partner-user-1001', label: 'Nova Treasury', email: 'treasury@novacorp.example', wallets: ['0x8a3f1c9e2b7d4065a1c8e9f0b2d4c6a8e1f3b5d7'], created_at: daysAgo(45), updated_at: daysAgo(2) }),
      u({ id: 'usr_seed_orbit', external_id: 'partner-user-1002', label: 'Orbit Payments', email: 'ops@orbitpay.example', wallets: ['0x1b2c3d4e5f60718293a4b5c6d7e8f90123456789'], created_at: daysAgo(30), updated_at: daysAgo(1) }),
      u({ id: 'usr_seed_quill', external_id: 'partner-user-1003', label: 'Quill Holdings', email: 'finance@quill.example', wallets: ['0xdeadbeef00112233445566778899aabbccddeeff'], created_at: daysAgo(62), updated_at: daysAgo(20) }),
    );
  }

  private seedPositions(store: StoreState): void {
    const pos = (o: Record<string, unknown>) => {
      const p = { object: 'position', strategy: 'auto', status: 'active', last_rebalance_at: null, withdrawn_total: 0, ...o } as unknown as StoreRecord;
      store.positions.push(p);
      store.positionEvents.push({ id: `evt_${(p.id).slice(4)}_dep`, object: 'position_event', position_id: p.id, type: 'deposit', at: p['opened_at'], amount: p['principal'], apy: p['apy'], vault_id: p['vault_id'], note: 'Initial deposit routed to vault' } as StoreRecord);
    };
    pos({ id: 'pos_seed_alpha', user_id: 'usr_seed_nova', wallet: '0x8a3f1c9e2b7d4065a1c8e9f0b2d4c6a8e1f3b5d7', asset: 'USDC', chain: 'base', vault_id: 'vault_aave_base_usdc', principal: 25_000, apy: 0.052, opened_at: daysAgo(38), updated_at: daysAgo(2), tx_hash: detTxHash('pos_seed_alpha'), partner_id: 'ptn_seed_acme', campaign_id: 'cmp_seed_acme_launch' });
    pos({ id: 'pos_seed_beta', user_id: 'usr_seed_orbit', wallet: '0x1b2c3d4e5f60718293a4b5c6d7e8f90123456789', asset: 'USDT', chain: 'arbitrum', vault_id: 'vault_morpho_arb_usdt', principal: 10_000, apy: 0.076, opened_at: daysAgo(23), updated_at: daysAgo(1), tx_hash: detTxHash('pos_seed_beta'), partner_id: 'ptn_seed_acme', campaign_id: 'cmp_seed_acme_earn' });
    pos({ id: 'pos_seed_gamma', user_id: 'usr_seed_nova', wallet: '0x8a3f1c9e2b7d4065a1c8e9f0b2d4c6a8e1f3b5d7', asset: 'USDC', chain: 'base', vault_id: 'vault_morpho_base_usdc', principal: 50_000, apy: 0.068, opened_at: daysAgo(13), updated_at: daysAgo(1), tx_hash: detTxHash('pos_seed_gamma'), partner_id: 'ptn_seed_acme', campaign_id: null });
    pos({ id: 'pos_seed_delta', user_id: 'usr_seed_quill', wallet: '0xdeadbeef00112233445566778899aabbccddeeff', asset: 'USDC', chain: 'base', vault_id: 'vault_treasury_base_usdc', principal: 5_000, apy: 0.039, status: 'closed', opened_at: daysAgo(60), updated_at: daysAgo(20), tx_hash: detTxHash('pos_seed_delta'), partner_id: 'ptn_seed_orbit', campaign_id: 'cmp_seed_orbit_q3' });
  }
}
