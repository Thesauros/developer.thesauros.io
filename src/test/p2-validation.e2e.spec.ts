import { Global, INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { DatabaseModule } from '../database/database.module';
import { configureApp } from '../bootstrap';
import { createTestDataSource, destroyTestStore } from './create-test-store';

const MASTER = 'tsk_test_master_full_access_000000000000000';
const ACME = 'tsk_test_acme_partner_key_00000000000000000';

/** Input validation + scope enforcement on the P2 endpoints (QA feedback). */
describe('P2 validation & scopes (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let baseUrl: string;

  async function get(path: string, key: string | null): Promise<{ status: number; body: any }> {
    const headers: Record<string, string> = {};
    if (key) headers.Authorization = `Bearer ${key}`;
    const res = await fetch(`${baseUrl}${path}`, { headers });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

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

  describe('asset validation', () => {
    it('rejects an unknown asset with 400', async () => {
      const res = await get('/api/v1/analytics/signals?asset=DOGE', ACME);
      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('asset');
    });

    it('accepts lowercase asset and normalizes it', async () => {
      const res = await get('/api/v1/analytics/signals?asset=usdt0', ACME);
      expect(res.status).toBe(200);
      expect(res.body.data.every((s: any) => s.asset === 'USDT0')).toBe(true);
    });

    it('knows only deployed assets — plain USDT does not exist', async () => {
      const res = await get('/api/v1/analytics/signals?asset=USDT', ACME);
      expect(res.status).toBe(400);
    });
  });

  describe('query validation', () => {
    it('rejects a malformed limit', async () => {
      const res = await get('/api/v1/analytics/decisions?limit=abc', ACME);
      expect(res.status).toBe(400);
    });

    it('rejects a malformed user_id', async () => {
      const res = await get('/api/v1/reconciliation/balances?user_id=DROP%20TABLE', ACME);
      expect(res.status).toBe(400);
    });

    it('rejects unknown query params instead of ignoring them', async () => {
      const res = await get('/api/v1/analytics/regime?nonsense=1', ACME);
      expect(res.status).toBe(400);
    });

    it('rejects a malformed snapshots date', async () => {
      const res = await get('/api/v1/reconciliation/snapshots?from=yesterday', ACME);
      expect(res.status).toBe(400);
    });

    // TS-361: the docs promise days is 1-90; 0 and 365 used to be clamped
    // silently to 1 and 90 and answered 200.
    it('rejects an apy/history window outside the documented 1-90', async () => {
      for (const days of ['0', '91', '365', '-1', '7.5', 'abc']) {
        const res = await get(`/api/v1/apy/history?vault=vault_plasma_usdt0&days=${days}`, ACME);
        expect([days, res.status]).toEqual([days, 400]);
        expect(res.body.error.message).toContain('days');
      }
    });

    it('serves the boundaries of the apy/history window', async () => {
      for (const days of [1, 90]) {
        const res = await get(`/api/v1/apy/history?vault=vault_plasma_usdt0&days=${days}`, ACME);
        expect([days, res.status]).toEqual([days, 200]);
        expect(res.body.data.days).toBe(days);
      }
      // Omitted stays the documented default rather than the clamp's.
      const fallback = await get('/api/v1/apy/history?vault=vault_plasma_usdt0', ACME);
      expect(fallback.body.data.days).toBe(7);
    });
  });

  describe('scopes', () => {
    it('protocol-level signals/regime answer to both key kinds', async () => {
      for (const key of [MASTER, ACME]) {
        expect((await get('/api/v1/analytics/signals', key)).status).toBe(200);
        expect((await get('/api/v1/analytics/regime', key)).status).toBe(200);
      }
    });

    it('position-derived endpoints refuse a non-partner admin key', async () => {
      for (const path of [
        '/api/v1/analytics/uplift',
        '/api/v1/analytics/decisions',
        '/api/v1/analytics/advisor',
        '/api/v1/reconciliation/balances',
        '/api/v1/reconciliation/ledger',
        '/api/v1/reconciliation/snapshots',
      ]) {
        const res = await get(path, MASTER);
        expect([res.status, path]).toEqual([403, path]);
      }
    });

    it('the protocol-wide report refuses a partner key and answers an admin key', async () => {
      expect((await get('/api/v1/reconciliation/report', ACME)).status).toBe(403);
      expect((await get('/api/v1/reconciliation/report', MASTER)).status).toBe(200);
    });

    it('everything refuses no key', async () => {
      expect((await get('/api/v1/analytics/signals', null)).status).toBe(401);
      expect((await get('/api/v1/reconciliation/report', null)).status).toBe(401);
    });
  });
});
