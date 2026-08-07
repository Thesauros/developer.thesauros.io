import { DataSource } from 'typeorm';
import { StoreService } from '../store/store.service';
import { AttributionService } from './attribution.service';
import { RevenueService } from './revenue.service';
import { createTestStore, destroyTestStore } from '../test/create-test-store';

describe('RevenueService', () => {
  let dataSource: DataSource;
  let store: StoreService;
  let attribution: AttributionService;
  let service: RevenueService;

  beforeEach(async () => {
    ({ dataSource, store } = await createTestStore());
    attribution = new AttributionService(store);
    service = new RevenueService(store, attribution);
  });

  afterEach(async () => {
    await destroyTestStore(dataSource);
  });

  it('returns null for non-existent partner', async () => {
    expect(await service.calculateRevenueShare('ptn_nope')).toBeNull();
  });

  it('calculates revenue share for Acme', async () => {
    const result = await service.calculateRevenueShare('ptn_seed_acme');
    expect(result).not.toBeNull();
    expect(result!.object).toBe('revenue_share');
    expect(result!.partner_id).toBe('ptn_seed_acme');
    expect(result!.revenue_share_pct).toBe(0.15);
    expect(result!.protocol_fee_rate).toBe(0.1);
    expect(result!.tvl).toBeGreaterThan(0);
    expect(result!.protocol_blend_apy).toBeGreaterThan(0);
    expect(result!.annual.partner_revenue).toBeGreaterThan(0);
    expect(result!.daily.partner_revenue).toBeGreaterThan(0);
    expect(result!.annual.partner_revenue).toBeGreaterThan(result!.daily.partner_revenue);
  });

  it('Orbit has higher share pct than Acme', async () => {
    const acme = (await service.calculateRevenueShare('ptn_seed_acme'))!;
    const orbit = (await service.calculateRevenueShare('ptn_seed_orbit'))!;
    expect(orbit.revenue_share_pct).toBeGreaterThan(acme.revenue_share_pct);
  });
});
