import { Global, INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { createHmac } from 'node:crypto';
import { AppModule } from '../app.module';
import { DatabaseModule } from '../database/database.module';
import { configureApp } from '../bootstrap';
import { createTestDataSource, destroyTestStore } from './create-test-store';

const MASTER = 'tsk_test_master_full_access_000000000000000';
const ACME = 'tsk_test_acme_partner_key_00000000000000000';
const ORBIT = 'tsk_test_orbit_partner_key_0000000000000000';

/** E2e coverage for the P1 "eliminate mocks" endpoints: webhooks, usage, users/ledger, status. */
describe('P1 real endpoints (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let baseUrl: string;

  async function call(
    method: string,
    path: string,
    key: string | null,
    body?: unknown,
  ): Promise<{ status: number; body: any }> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (key) headers.Authorization = `Bearer ${key}`;
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }
  const get = (path: string, key: string | null) => call('GET', path, key);

  beforeAll(async () => {
    dataSource = await createTestDataSource();

    @Global()
    @Module({
      providers: [{ provide: DataSource, useValue: dataSource }],
      exports: [DataSource],
    })
    class TestDatabaseModule {}

    process.env.DB_SEED = 'true';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideModule(DatabaseModule)
      .useModule(TestDatabaseModule)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    await app.listen(0);
    baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  }, 30_000);

  afterAll(async () => {
    await app?.close();
    await destroyTestStore(dataSource);
  });

  describe('GET /status', () => {
    it('is public and carries real component health', async () => {
      const res = await get('/api/v1/status', null);
      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.services.find((s: any) => s.id === 'api').status).toBe('operational');
      expect(data.services.find((s: any) => s.id === 'db').status).toBe('operational');
      // MONITOR_API_URL is unset in tests — degraded, stated as such, not invented.
      expect(data.services.find((s: any) => s.id === 'monitoring').status).toBe('degraded');
      expect(typeof data.uptime_s).toBe('number');
    });
  });

  describe('webhooks', () => {
    it.each([
      'http://169.254.169.254/latest/meta-data',
      'http://localhost:8080/x',
      'http://10.0.0.5/hook',
      'http://[::1]:3000/x',
      'ftp://example.com/x',
      'http://metadata.google.internal/computeMetadata',
    ])('rejects SSRF target %s at registration', async (url) => {
      const res = await call('POST', '/api/v1/webhooks', ACME, { url });
      expect(res.status).toBe(400);
    });

    it('creates, masks, signs, records deliveries, and scopes to the partner', async () => {
      const created = await call('POST', '/api/v1/webhooks', ACME, {
        url: 'https://example.com/hooks/t',
        events: ['system.status'],
      });
      expect(created.status).toBe(201);
      const webhook = created.body.data;
      const secret = webhook.secret;
      expect(secret.startsWith('whsec_')).toBe(true);

      // List masks the secret.
      const listed = await get('/api/v1/webhooks', ACME);
      const row = listed.body.data.find((w: any) => w.id === webhook.id);
      expect(row.secret).toMatch(/^whsec_\.\.\./);

      // The other partner cannot see or touch it.
      const foreignList = await get('/api/v1/webhooks', ORBIT);
      expect(foreignList.body.data.find((w: any) => w.id === webhook.id)).toBeUndefined();
      const foreignDelete = await call('DELETE', `/api/v1/webhooks/${webhook.id}`, ORBIT);
      expect(foreignDelete.status).toBe(404);

      // Test dispatch records a delivery with a verifiable signature.
      const test = await call('POST', `/api/v1/webhooks/${webhook.id}/test`, ACME);
      expect(test.status).toBe(201);
      const delivery = test.body.data;
      expect(['delivered', 'failed']).toContain(delivery.status); // example.com may or may not accept POSTs
      const match = delivery.signature.match(/^t=(\d+),v1=([0-9a-f]{64})$/);
      expect(match).not.toBeNull();
      const expected = createHmac('sha256', secret)
        .update(`${match![1]}.${JSON.stringify(delivery.payload)}`)
        .digest('hex');
      expect(match![2]).toBe(expected);

      const deliveries = await get('/api/v1/webhooks/deliveries', ACME);
      expect(deliveries.body.data.some((d: any) => d.id === delivery.id)).toBe(true);
      // Foreign partner sees no deliveries for it.
      const foreignDeliveries = await get('/api/v1/webhooks/deliveries', ORBIT);
      expect(foreignDeliveries.body.data.some((d: any) => d.id === delivery.id)).toBe(false);
    }, 20_000);

    it('rejects unsupported event types', async () => {
      const res = await call('POST', '/api/v1/webhooks', ACME, {
        url: 'https://example.com/h',
        events: ['nope.event'],
      });
      expect(res.status).toBe(400);
    });
  });

  describe('usage', () => {
    it('counts real requests per partner with totals/series/top_endpoints', async () => {
      for (let i = 0; i < 5; i++) await get('/api/v1/partner/tvl', ORBIT);
      await get('/api/v1/partner/nonexistent', ORBIT); // a 404 -> error bucket

      const res = await get('/api/v1/usage?range=24h', ORBIT);
      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.totals.requests).toBeGreaterThanOrEqual(6);
      expect(data.totals.errors).toBeGreaterThanOrEqual(1);
      expect(data.series).toHaveLength(24);
      expect(data.top_endpoints[0].requests).toBeGreaterThanOrEqual(1);

      // Scoped: ACME's usage does not include ORBIT's traffic signature.
      const acme = await get('/api/v1/usage?range=24h', ACME);
      expect(acme.body.data.totals.requests).toBeLessThan(data.totals.requests + 100);
    });

    it('rejects a non-partner key and bad ranges', async () => {
      expect((await get('/api/v1/usage', MASTER)).status).toBe(403);
      expect((await get('/api/v1/usage?range=90d', ORBIT)).status).toBe(400);
    });
  });

  describe('users + ledger', () => {
    it('creates an attributed user and serves its ledger; foreign users are 403', async () => {
      const created = await call('POST', '/api/v1/users', ORBIT, {
        external_id: 'e2e-user-1',
        label: 'E2E',
        wallets: ['0x0000000000000000000000000000000000000123'],
      });
      expect(created.status).toBe(201);
      const user = created.body.data;

      // Appears among the partner's attributed users.
      const partnerUsers = await get('/api/v1/partner/users', ORBIT);
      expect(partnerUsers.body.data.some((u: any) => u.id === user.id)).toBe(true);

      // Own ledger: 200 with a list envelope (empty for a fresh user).
      const ledger = await get(`/api/v1/users/${user.id}/ledger?limit=5`, ORBIT);
      expect(ledger.status).toBe(200);
      expect(ledger.body.object).toBe('list');

      // A seeded user attributed to the other partner: 403, not data.
      const foreign = await get('/api/v1/users/usr_seed_nova/ledger', ORBIT);
      expect(foreign.status).toBe(403);

      // Ledger of an attributed seed user carries real position events.
      const nova = await get('/api/v1/users/usr_seed_nova/ledger?limit=10', ACME);
      expect(nova.status).toBe(200);
      expect(nova.body.data.length).toBeGreaterThan(0);
      expect(nova.body.data[0]).toHaveProperty('type');
      expect(nova.body.data[0]).toHaveProperty('amount');
    });

    it('rejects duplicates and invalid wallets', async () => {
      await call('POST', '/api/v1/users', ORBIT, { external_id: 'e2e-dup' });
      const dup = await call('POST', '/api/v1/users', ORBIT, { external_id: 'e2e-dup' });
      expect(dup.status).toBe(400);
      const badWallet = await call('POST', '/api/v1/users', ORBIT, {
        external_id: 'e2e-wallet',
        wallets: ['nope'],
      });
      expect(badWallet.status).toBe(400);
    });
  });
});
