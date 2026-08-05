import { DataSource } from 'typeorm';
import { StoreService } from './store.service';
import { createTestStore, destroyTestStore } from '../test/create-test-store';

describe('StoreService', () => {
  let dataSource: DataSource;
  let store: StoreService;

  beforeEach(async () => {
    ({ dataSource, store } = await createTestStore());
  });

  afterEach(async () => {
    await destroyTestStore(dataSource);
  });

  it('seeds partners on init', async () => {
    const partners = await store.all('partners');
    expect(partners.length).toBe(2);
    expect(partners[0].id).toBe('ptn_seed_acme');
    expect(partners[1].id).toBe('ptn_seed_orbit');
  });

  it('seeds campaigns on init', async () => {
    const campaigns = await store.all('campaigns');
    expect(campaigns.length).toBe(4);
  });

  it('seeds attributions on init', async () => {
    const attributions = await store.all('attributions');
    expect(attributions.length).toBe(3);
  });

  it('seeds positions with partner_id', async () => {
    const positions = await store.all('positions');
    expect(positions.length).toBe(4);
    expect(positions[0].partner_id).toBe('ptn_seed_acme');
  });

  it('seeds keys with partner scoping', async () => {
    const keys = await store.all('keys');
    expect(keys.length).toBe(4);
    const acmeKey = keys.find((k: any) => k.id === 'key_seed_acme');
    expect(acmeKey).toBeDefined();
    expect(acmeKey!.partner_id).toBe('ptn_seed_acme');
  });

  it('CRUD: create + get + update + remove', async () => {
    const record = await store.create('partners', {
      id: 'ptn_test',
      object: 'partner',
      name: 'Test',
      slug: 'test-partner-x',
      contact_email: null,
      webhook_url: null,
      revenue_share_pct: 0.1,
      status: 'active',
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);
    expect(await store.get('partners', 'ptn_test')).toMatchObject({ id: record.id });
    await store.update('partners', 'ptn_test', { name: 'Updated' });
    expect((await store.get('partners', 'ptn_test'))!.name).toBe('Updated');
    expect(await store.remove('partners', 'ptn_test')).toBe(true);
    expect(await store.get('partners', 'ptn_test')).toBeNull();
  });

  it('filter works correctly', async () => {
    const acmeCampaigns = await store.filter('campaigns', (c: any) => c.partner_id === 'ptn_seed_acme');
    expect(acmeCampaigns.length).toBe(2);
  });

  it('randomId generates prefixed IDs', () => {
    const id = store.randomId('ptn');
    expect(id).toMatch(/^ptn_[0-9a-f]{16}$/);
  });
});
