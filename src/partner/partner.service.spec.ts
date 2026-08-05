import { DataSource } from 'typeorm';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { StoreService } from '../store/store.service';
import { PartnerService } from './partner.service';
import { createTestStore, destroyTestStore } from '../test/create-test-store';

describe('PartnerService', () => {
  let dataSource: DataSource;
  let store: StoreService;
  let service: PartnerService;

  beforeEach(async () => {
    ({ dataSource, store } = await createTestStore());
    service = new PartnerService(store);
  });

  afterEach(async () => {
    await destroyTestStore(dataSource);
  });

  describe('createPartner', () => {
    it('creates a partner with auto-generated slug', async () => {
      const partner = await service.createPartner({ name: 'New Wallet' });
      expect(partner.id).toMatch(/^ptn_/);
      expect(partner.slug).toBe('new-wallet');
      expect(partner.revenue_share_pct).toBe(0.15);
      expect(partner.status).toBe('active');
    });

    it('rejects duplicate slugs', async () => {
      await expect(service.createPartner({ name: 'Acme Wallet', slug: 'acme-wallet' }))
        .rejects.toThrow(ConflictException);
    });

    it('rejects invalid slugs', async () => {
      await expect(service.createPartner({ name: 'X', slug: 'a' }))
        .rejects.toThrow(BadRequestException);
    });

    it('clamps revenue_share_pct to [0, 1]', async () => {
      const p = await service.createPartner({ name: 'Clamped', revenue_share_pct: 5 });
      expect(p.revenue_share_pct).toBe(1);
    });
  });

  describe('updatePartner', () => {
    it('updates fields and sets updated_at', async () => {
      const beforeAt = (await service.getPartner('ptn_seed_acme'))!.updated_at;
      const updated = await service.updatePartner('ptn_seed_acme', { name: 'Acme Wallet v2' });
      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('Acme Wallet v2');
      expect(new Date(updated!.updated_at as string).getTime())
        .toBeGreaterThanOrEqual(new Date(beforeAt as string).getTime());
    });

    it('rejects slug conflict on update', async () => {
      await expect(service.updatePartner('ptn_seed_acme', { slug: 'orbit-finance' }))
        .rejects.toThrow(ConflictException);
    });

    it('returns null for non-existent ID', async () => {
      expect(await service.updatePartner('ptn_nope', { name: 'X' })).toBeNull();
    });

    it('disables a partner via status', async () => {
      const updated = await service.updatePartner('ptn_seed_acme', { status: 'disabled' });
      expect(updated!.status).toBe('disabled');
      const disabled = await service.listPartners('disabled');
      expect(disabled.map((p) => p.id)).toContain('ptn_seed_acme');
    });

    it('rejects invalid status', async () => {
      await expect(service.updatePartner('ptn_seed_acme', { status: 'deleted' }))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('campaigns', () => {
    it('creates a campaign', async () => {
      const campaign = await service.createCampaign('ptn_seed_acme', { name: 'New Campaign' });
      expect(campaign.id).toMatch(/^cmp_/);
      expect(campaign.partner_id).toBe('ptn_seed_acme');
    });

    it('rejects duplicate campaign slug within partner', async () => {
      await expect(service.createCampaign('ptn_seed_acme', { name: 'Summer Launch' }))
        .rejects.toThrow(ConflictException);
    });

    it('lists campaigns for a partner', async () => {
      const campaigns = await service.listCampaigns('ptn_seed_acme');
      expect(campaigns.length).toBe(2);
    });

    it('disables a campaign via status', async () => {
      const updated = await service.updateCampaign(
        'ptn_seed_acme',
        'cmp_seed_acme_launch',
        { status: 'disabled' },
      );
      expect(updated!.status).toBe('disabled');
      const active = await service.listCampaigns('ptn_seed_acme', 'active');
      expect(active.map((c) => c.id)).not.toContain('cmp_seed_acme_launch');
    });

    it('returns null when campaign belongs to another partner', async () => {
      expect(
        await service.updateCampaign('ptn_seed_orbit', 'cmp_seed_acme_launch', { status: 'disabled' }),
      ).toBeNull();
    });
  });

  describe('lookups', () => {
    it('getPartner returns correct partner', async () => {
      const p = await service.getPartner('ptn_seed_acme');
      expect(p).not.toBeNull();
      expect(p!.name).toBe('Acme Wallet');
    });

    it('getPartnerBySlug works', async () => {
      const p = await service.getPartnerBySlug('orbit-finance');
      expect(p).not.toBeNull();
      expect(p!.id).toBe('ptn_seed_orbit');
    });

    it('listPartners with status filter', async () => {
      const active = await service.listPartners('active');
      expect(active.length).toBe(2);
      const disabled = await service.listPartners('disabled');
      expect(disabled.length).toBe(0);
    });
  });
});
