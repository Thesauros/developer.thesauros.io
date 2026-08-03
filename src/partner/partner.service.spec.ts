import { ConflictException, BadRequestException } from '@nestjs/common';
import { StoreService } from '../store/store.service';
import { PartnerService } from './partner.service';

describe('PartnerService', () => {
  let store: StoreService;
  let service: PartnerService;

  beforeEach(() => {
    delete (globalThis as any).__thesaurosNestStore;
    store = new StoreService();
    store.onModuleInit();
    service = new PartnerService(store);
  });

  describe('createPartner', () => {
    it('creates a partner with auto-generated slug', () => {
      const partner = service.createPartner({ name: 'New Wallet' });
      expect(partner.id).toMatch(/^ptn_/);
      expect(partner.slug).toBe('new-wallet');
      expect(partner.revenue_share_pct).toBe(0.15);
      expect(partner.status).toBe('active');
    });

    it('rejects duplicate slugs', () => {
      expect(() => service.createPartner({ name: 'Acme Wallet', slug: 'acme-wallet' }))
        .toThrow(ConflictException);
    });

    it('rejects invalid slugs', () => {
      expect(() => service.createPartner({ name: 'X', slug: 'a' }))
        .toThrow(BadRequestException);
    });

    it('clamps revenue_share_pct to [0, 1]', () => {
      const p = service.createPartner({ name: 'Clamped', revenue_share_pct: 5 });
      expect(p.revenue_share_pct).toBe(1);
    });
  });

  describe('updatePartner', () => {
    it('updates fields and sets updated_at', () => {
      const beforeAt = service.getPartner('ptn_seed_acme')!.updated_at;
      const updated = service.updatePartner('ptn_seed_acme', { name: 'Acme Wallet v2' });
      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('Acme Wallet v2');
      expect(new Date(updated!.updated_at as string).getTime())
        .toBeGreaterThanOrEqual(new Date(beforeAt as string).getTime());
    });

    it('rejects slug conflict on update', () => {
      expect(() => service.updatePartner('ptn_seed_acme', { slug: 'orbit-finance' }))
        .toThrow(ConflictException);
    });

    it('returns null for non-existent ID', () => {
      expect(service.updatePartner('ptn_nope', { name: 'X' })).toBeNull();
    });
  });

  describe('campaigns', () => {
    it('creates a campaign', () => {
      const campaign = service.createCampaign('ptn_seed_acme', { name: 'New Campaign' });
      expect(campaign.id).toMatch(/^cmp_/);
      expect(campaign.partner_id).toBe('ptn_seed_acme');
    });

    it('rejects duplicate campaign slug within partner', () => {
      expect(() => service.createCampaign('ptn_seed_acme', { name: 'Summer Launch' }))
        .toThrow(ConflictException);
    });

    it('lists campaigns for a partner', () => {
      const campaigns = service.listCampaigns('ptn_seed_acme');
      expect(campaigns.length).toBe(2);
    });
  });

  describe('lookups', () => {
    it('getPartner returns correct partner', () => {
      const p = service.getPartner('ptn_seed_acme');
      expect(p).not.toBeNull();
      expect(p!.name).toBe('Acme Wallet');
    });

    it('getPartnerBySlug works', () => {
      const p = service.getPartnerBySlug('orbit-finance');
      expect(p).not.toBeNull();
      expect(p!.id).toBe('ptn_seed_orbit');
    });

    it('listPartners with status filter', () => {
      const active = service.listPartners('active');
      expect(active.length).toBe(2);
      const disabled = service.listPartners('disabled');
      expect(disabled.length).toBe(0);
    });
  });
});
