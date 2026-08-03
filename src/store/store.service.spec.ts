import { StoreService } from './store.service';

describe('StoreService', () => {
  let store: StoreService;

  beforeEach(() => {
    delete (globalThis as any).__thesaurosNestStore;
    store = new StoreService();
    store.onModuleInit();
  });

  it('seeds partners on init', () => {
    const partners = store.all('partners');
    expect(partners.length).toBe(2);
    expect(partners[0].id).toBe('ptn_seed_acme');
    expect(partners[1].id).toBe('ptn_seed_orbit');
  });

  it('seeds campaigns on init', () => {
    const campaigns = store.all('campaigns');
    expect(campaigns.length).toBe(4);
  });

  it('seeds attributions on init', () => {
    const attributions = store.all('attributions');
    expect(attributions.length).toBe(3);
  });

  it('seeds positions with partner_id', () => {
    const positions = store.all('positions');
    expect(positions.length).toBe(4);
    expect(positions[0].partner_id).toBe('ptn_seed_acme');
  });

  it('seeds keys with partner scoping', () => {
    const keys = store.all('keys');
    expect(keys.length).toBe(3);
    const acmeKey = keys.find((k: any) => k.id === 'key_seed_acme');
    expect(acmeKey).toBeDefined();
    expect(acmeKey!.partner_id).toBe('ptn_seed_acme');
  });

  it('CRUD: create + get + update + remove', () => {
    const record = store.create('partners', { id: 'ptn_test', object: 'partner', name: 'Test' });
    expect(store.get('partners', 'ptn_test')).toBe(record);
    store.update('partners', 'ptn_test', { name: 'Updated' });
    expect(store.get('partners', 'ptn_test')!.name).toBe('Updated');
    expect(store.remove('partners', 'ptn_test')).toBe(true);
    expect(store.get('partners', 'ptn_test')).toBeNull();
  });

  it('filter works correctly', () => {
    const acmeCampaigns = store.filter('campaigns', (c: any) => c.partner_id === 'ptn_seed_acme');
    expect(acmeCampaigns.length).toBe(2);
  });

  it('randomId generates prefixed IDs', () => {
    const id = store.randomId('ptn');
    expect(id).toMatch(/^ptn_[0-9a-f]{16}$/);
  });
});
