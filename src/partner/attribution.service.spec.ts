import { StoreService } from '../store/store.service';
import { AttributionService } from './attribution.service';

describe('AttributionService', () => {
  let store: StoreService;
  let service: AttributionService;

  beforeEach(() => {
    delete (globalThis as any).__thesaurosNestStore;
    store = new StoreService();
    store.onModuleInit();
    service = new AttributionService(store);
  });

  describe('attributeUser', () => {
    it('creates attribution for unattributed user', () => {
      store.create('users', { id: 'usr_new', object: 'user', label: 'New', wallets: [], status: 'active', metadata: {} });
      const attr = service.attributeUser({ user_id: 'usr_new', partner_id: 'ptn_seed_acme' });
      expect(attr.id).toMatch(/^atr_/);
      expect(attr.partner_id).toBe('ptn_seed_acme');
    });

    it('returns existing attribution (first-touch, idempotent)', () => {
      const first = service.getAttribution('usr_seed_nova');
      expect(first).not.toBeNull();
      const second = service.attributeUser({
        user_id: 'usr_seed_nova',
        partner_id: 'ptn_seed_orbit',
      });
      expect(second.partner_id).toBe('ptn_seed_acme');
    });
  });

  describe('isUserAttributedToPartner', () => {
    it('returns true for correctly attributed user', () => {
      expect(service.isUserAttributedToPartner('usr_seed_nova', 'ptn_seed_acme')).toBe(true);
    });

    it('returns false for wrong partner', () => {
      expect(service.isUserAttributedToPartner('usr_seed_nova', 'ptn_seed_orbit')).toBe(false);
    });
  });

  describe('getAttributedUsers', () => {
    it('returns users attributed to Acme', () => {
      const users = service.getAttributedUsers('ptn_seed_acme');
      expect(users.length).toBe(2);
      const ids = users.map((u) => u.id);
      expect(ids).toContain('usr_seed_nova');
      expect(ids).toContain('usr_seed_orbit');
    });

    it('returns users attributed to Orbit', () => {
      const users = service.getAttributedUsers('ptn_seed_orbit');
      expect(users.length).toBe(1);
      expect(users[0].id).toBe('usr_seed_quill');
    });
  });

  describe('aggregation', () => {
    it('getAttributedDeposits returns correct totals for Acme', () => {
      const result = service.getAttributedDeposits('ptn_seed_acme');
      expect(result.count).toBe(3);
      expect(result.total).toBe(85000);
    });

    it('getNetTVL returns positive TVL for active positions', () => {
      const tvl = service.getNetTVL('ptn_seed_acme');
      expect(tvl.tvl).toBeGreaterThan(85000);
      expect(tvl.breakdown.length).toBeGreaterThan(0);
    });

    it('getAttributedYield returns accrued yield', () => {
      const result = service.getAttributedYield('ptn_seed_acme');
      expect(result.total_yield).toBeGreaterThan(0);
      expect(result.positions.length).toBe(3);
    });

    it('getAttributedWithdrawals for Orbit includes closed position', () => {
      const result = service.getAttributedWithdrawals('ptn_seed_orbit');
      expect(result.total).toBe(5000);
    });

    it('getAttributedPoints returns zero when no locks exist', () => {
      const result = service.getAttributedPoints('ptn_seed_acme');
      expect(result.total_points).toBe(0);
    });
  });
});
