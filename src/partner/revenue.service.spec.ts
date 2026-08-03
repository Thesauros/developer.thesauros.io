import { StoreService } from '../store/store.service';
import { AttributionService } from './attribution.service';
import { RevenueService } from './revenue.service';

describe('RevenueService', () => {
  let store: StoreService;
  let attribution: AttributionService;
  let service: RevenueService;

  beforeEach(() => {
    delete (globalThis as any).__thesaurosNestStore;
    store = new StoreService();
    store.onModuleInit();
    attribution = new AttributionService(store);
    service = new RevenueService(store, attribution);
  });

  it('returns null for non-existent partner', () => {
    expect(service.calculateRevenueShare('ptn_nope')).toBeNull();
  });

  it('calculates revenue share for Acme', () => {
    const result = service.calculateRevenueShare('ptn_seed_acme');
    expect(result).not.toBeNull();
    expect(result!.object).toBe('revenue_share');
    expect(result!.partner_id).toBe('ptn_seed_acme');
    expect(result!.revenue_share_pct).toBe(0.15);
    expect(result!.protocol_fee_rate).toBe(0.1);
    expect(result!.tvl).toBeGreaterThan(0);
    expect(result!.blend_apy).toBeGreaterThan(0);
    expect(result!.annual.partner_revenue).toBeGreaterThan(0);
    expect(result!.daily.partner_revenue).toBeGreaterThan(0);
    expect(result!.annual.partner_revenue).toBeGreaterThan(result!.daily.partner_revenue);
  });

  it('Orbit has higher share pct than Acme', () => {
    const acme = service.calculateRevenueShare('ptn_seed_acme')!;
    const orbit = service.calculateRevenueShare('ptn_seed_orbit')!;
    expect(orbit.revenue_share_pct).toBeGreaterThan(acme.revenue_share_pct);
  });
});
