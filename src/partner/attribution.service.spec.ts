import { DataSource } from 'typeorm';
import { StoreService } from '../store/store.service';
import { AttributionService } from './attribution.service';
import { createTestStore, destroyTestStore } from '../test/create-test-store';

describe('AttributionService', () => {
  let dataSource: DataSource;
  let store: StoreService;
  let service: AttributionService;

  beforeEach(async () => {
    ({ dataSource, store } = await createTestStore());
    service = new AttributionService(store);
  });

  afterEach(async () => {
    await destroyTestStore(dataSource);
  });

  describe('attributeUser', () => {
    it('creates attribution for unattributed user', async () => {
      await store.create('users', {
        id: 'usr_new', object: 'user', label: 'New', wallets: [], status: 'active', metadata: {},
        external_id: null, email: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      } as any);
      const attr = await service.attributeUser({ user_id: 'usr_new', partner_id: 'ptn_seed_acme' });
      expect(attr.id).toMatch(/^atr_/);
      expect(attr.partner_id).toBe('ptn_seed_acme');
    });

    it('returns existing attribution (first-touch, idempotent)', async () => {
      const first = await service.getAttribution('usr_seed_nova');
      expect(first).not.toBeNull();
      const second = await service.attributeUser({
        user_id: 'usr_seed_nova',
        partner_id: 'ptn_seed_orbit',
      });
      expect(second.partner_id).toBe('ptn_seed_acme');
    });
  });

  describe('isUserAttributedToPartner', () => {
    it('returns true for correctly attributed user', async () => {
      expect(await service.isUserAttributedToPartner('usr_seed_nova', 'ptn_seed_acme')).toBe(true);
    });

    it('returns false for wrong partner', async () => {
      expect(await service.isUserAttributedToPartner('usr_seed_nova', 'ptn_seed_orbit')).toBe(false);
    });
  });

  describe('getAttributedUsers', () => {
    it('returns users attributed to Acme', async () => {
      const users = await service.getAttributedUsers('ptn_seed_acme');
      expect(users.length).toBe(2);
      const ids = users.map((u) => u.id);
      expect(ids).toContain('usr_seed_nova');
      expect(ids).toContain('usr_seed_orbit');
    });

    it('returns users attributed to Orbit', async () => {
      const users = await service.getAttributedUsers('ptn_seed_orbit');
      expect(users.length).toBe(1);
      expect(users[0].id).toBe('usr_seed_quill');
    });
  });

  describe('aggregation', () => {
    it('getAttributedDeposits returns correct totals for Acme', async () => {
      const result = await service.getAttributedDeposits('ptn_seed_acme');
      expect(result.count).toBe(3);
      expect(result.total).toBe(85000);
    });

    it('getNetTVL returns positive TVL for active positions', async () => {
      const tvl = await service.getNetTVL('ptn_seed_acme');
      expect(tvl.tvl).toBeGreaterThan(85000);
      expect(tvl.breakdown.length).toBeGreaterThan(0);
    });

    it('getAttributedYield returns accrued yield', async () => {
      const result = await service.getAttributedYield('ptn_seed_acme');
      expect(result.total_yield).toBeGreaterThan(0);
      expect(result.positions.length).toBe(3);
    });

    it('getAttributedWithdrawals for Orbit includes closed position', async () => {
      const result = await service.getAttributedWithdrawals('ptn_seed_orbit');
      expect(result.total).toBe(5000);
    });

    it('getAttributedPoints returns zero when no locks exist', async () => {
      const result = await service.getAttributedPoints('ptn_seed_acme');
      expect(result.total_points).toBe(0);
    });
  });
});
