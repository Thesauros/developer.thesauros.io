import { Global, INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { DatabaseModule } from '../database/database.module';
import { configureApp } from '../bootstrap';
import { createTestDataSource, destroyTestStore } from './create-test-store';

const MASTER = 'tsk_test_master_full_access_000000000000000';
const ACME = 'tsk_test_acme_partner_key_00000000000000000';
const ORBIT = 'tsk_test_orbit_partner_key_0000000000000000';

describe('Partner API (e2e)', () => {
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

  function expectEnvelope(body: any, objectType?: string): void {
    expect(Object.keys(body).sort()).toEqual(['data', 'object']);
    expect(typeof body.object).toBe('string');
    expect(body.data).not.toBeNull();
    if (objectType) expect(body.object).toBe(objectType);
  }

  describe('response envelope', () => {
    it('POST /keys is enveloped and leaks no secret material', async () => {
      const res = await call('POST', '/api/v1/keys', MASTER, {
        label: 'QA envelope key',
        scopes: ['read'],
      });
      expect(res.status).toBe(201);
      expectEnvelope(res.body, 'api_key');
      expect(res.body.data.object).toBe('api_key');
      expect(res.body.data.secret).toMatch(/^tsk_test_/);
      expect(res.body.data).not.toHaveProperty('secret_hash');
      expect(res.body.data).not.toHaveProperty('_plaintext_secret');
    });

    it('GET /partners/:id is enveloped', async () => {
      const res = await get('/api/v1/partners/ptn_seed_acme', MASTER);
      expect(res.status).toBe(200);
      expectEnvelope(res.body, 'partner');
      expect(res.body.data.id).toBe('ptn_seed_acme');
    });

    it('POST /partners/:id/campaigns is enveloped', async () => {
      const res = await call('POST', '/api/v1/partners/ptn_seed_acme/campaigns', MASTER, {
        name: 'QA Envelope Campaign',
      });
      expect(res.status).toBe(201);
      expectEnvelope(res.body, 'campaign');
      expect(res.body.data.partner_id).toBe('ptn_seed_acme');
    });

    it('list endpoints are enveloped as object:"list"', async () => {
      const res = await get('/api/v1/partners', MASTER);
      expect(res.status).toBe(200);
      expectEnvelope(res.body, 'list');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it.each([
      ['/api/v1/partner/summary', 'partner_summary'],
      ['/api/v1/partner/deposits', 'partner_deposits'],
      ['/api/v1/partner/withdrawals', 'partner_withdrawals'],
      ['/api/v1/partner/tvl', 'partner_tvl'],
      ['/api/v1/partner/yield', 'partner_yield'],
      ['/api/v1/partner/yield/history/USDC', 'yield_history'],
      ['/api/v1/partner/points', 'partner_points'],
      ['/api/v1/partner/revenue', 'revenue_share'],
    ])('GET %s is enveloped', async (path, objectType) => {
      const res = await get(path, ACME);
      expect(res.status).toBe(200);
      expectEnvelope(res.body, objectType);
    });
  });

  describe('PATCH /partners/:id', () => {
    it('returns the same field set as GET, including status', async () => {
      const before = await get('/api/v1/partners/ptn_seed_acme', MASTER);
      const patched = await call('PATCH', '/api/v1/partners/ptn_seed_acme', MASTER, {
        contact_email: 'qa@acmewallet.example',
      });
      expect(patched.status).toBe(200);
      expectEnvelope(patched.body, 'partner');
      expect(Object.keys(patched.body.data).sort()).toEqual(Object.keys(before.body.data).sort());
      expect(patched.body.data.status).toBe('active');
      expect(patched.body.data.contact_email).toBe('qa@acmewallet.example');
    });
  });

  describe('disabling a partner', () => {
    it('revokes its keys and locks it out of the API', async () => {
      const ok = await get('/api/v1/partner/summary', ORBIT);
      expect(ok.status).toBe(200);

      const disabled = await call('PATCH', '/api/v1/partners/ptn_seed_orbit', MASTER, {
        status: 'disabled',
      });
      expect(disabled.status).toBe(200);
      expect(disabled.body.data.status).toBe('disabled');

      const keys = await get('/api/v1/keys', MASTER);
      const orbitKey = keys.body.data.find((k: any) => k.id === 'key_seed_orbit');
      expect(orbitKey.revoked).toBe(true);

      const afterDisable = await get('/api/v1/partner/summary', ORBIT);
      expect(afterDisable.status).toBe(401);
      expect(afterDisable.body.error.message).toMatch(/revoked/i);
    });

    it('refuses to issue new keys for a disabled partner', async () => {
      const res = await call('POST', '/api/v1/keys', MASTER, {
        label: 'Key for disabled partner',
        partner_id: 'ptn_seed_orbit',
      });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/disabled/i);
    });
  });

  describe('partner-scoped access', () => {
    it('rejects the deprecated /partner alias for a key with no partner binding', async () => {
      const created = await call('POST', '/api/v1/keys', MASTER, {
        label: 'Unbound partner:read key',
        scopes: ['partner:read'],
      });
      const unbound = created.body.data.secret;
      const res = await get('/api/v1/partner/yield/history/USDC', unbound);
      expect(res.status).toBe(403);
      expect(res.body.error.message).toMatch(/partner-scoped/i);
    });

    it('marks yield history as protocol-wide, not partner data', async () => {
      const res = await get('/api/v1/partner/yield/history/USDC', ACME);
      expect(res.body.data.scope).toBe('protocol');
    });
  });

  describe('GET /api/v1/yield/history/:asset (protocol namespace)', () => {
    it('is enveloped and marked protocol-scoped', async () => {
      const res = await get('/api/v1/yield/history/USDC', ACME);
      expect(res.status).toBe(200);
      expectEnvelope(res.body, 'yield_history');
      expect(res.body.data.scope).toBe('protocol');
      expect(res.body.data.asset).toBe('USDC');
      expect(res.body.data.blend_apy).toBeGreaterThan(0);
      expect(res.body.data.history).toHaveLength(30);
    });

    it('returns byte-identical series to every caller, partner-bound or not', async () => {
      const acme = await get('/api/v1/yield/history/USDC', ACME);
      const admin = await get('/api/v1/yield/history/USDC', MASTER);
      expect(admin.status).toBe(200);
      expect(admin.body.data.blend_apy).toBe(acme.body.data.blend_apy);
      expect(admin.body.data.history.map((p: any) => p.apy)).toEqual(
        acme.body.data.history.map((p: any) => p.apy),
      );
    });

    it('accepts an admin key with partner_id: null — no partner binding needed', async () => {
      const created = await call('POST', '/api/v1/keys', MASTER, {
        label: 'Unbound key for protocol yield',
        scopes: ['partner:read'],
      });
      const res = await get('/api/v1/yield/history/USDC', created.body.data.secret);
      expect(res.status).toBe(200);
      expect(res.body.data.scope).toBe('protocol');
    });

    it('matches the deprecated alias payload field for field', async () => {
      const fresh = await get('/api/v1/yield/history/USDT0', ACME);
      const alias = await get('/api/v1/partner/yield/history/USDT0', ACME);
      expect(Object.keys(alias.body.data).sort()).toEqual(Object.keys(fresh.body.data).sort());
      expect(alias.body.data.blend_apy).toBe(fresh.body.data.blend_apy);
    });

    it('rejects an unsupported asset', async () => {
      const res = await get('/api/v1/yield/history/ETH', ACME);
      expect(res.status).toBe(404);
      expect(res.body.error.message).toMatch(/unsupported asset/i);
    });
  });

  describe('GET /api/v1/partner/revenue', () => {
    it('names the protocol-wide rate explicitly and returns it equal for all partners', async () => {
      const acme = await get('/api/v1/partner/revenue', ACME);
      expect(acme.body.data).toHaveProperty('protocol_blend_apy');
      expect(acme.body.data).not.toHaveProperty('blend_apy');

      const created = await call('POST', '/api/v1/partners', MASTER, { name: 'Revenue Compare Co' });
      const other = await get('/api/v1/partner/revenue', created.body.data.api_key.secret);
      expect(other.body.data.protocol_blend_apy).toBe(acme.body.data.protocol_blend_apy);
      // ...while the partner-specific side genuinely differs.
      expect(other.body.data.tvl).not.toBe(acme.body.data.tvl);
    });
  });

  describe('rate limiting', () => {
    it('applies the 60 req/min budget across all endpoints, not per endpoint', async () => {
      // Fresh partner => fresh key => untouched rate-limit bucket.
      const created = await call('POST', '/api/v1/partners', MASTER, { name: 'Ratelimit QA Co' });
      const key = created.body.data.api_key.secret;
      const paths = [
        '/api/v1/partner/summary',
        '/api/v1/partner/deposits',
        '/api/v1/partner/tvl',
        '/api/v1/partner/yield',
        '/api/v1/partner/points',
        '/api/v1/partner/revenue',
      ];
      const statuses: number[] = [];
      for (let i = 0; i < 61; i++) {
        const res = await get(paths[i % paths.length], key);
        statuses.push(res.status);
      }
      expect(statuses.filter((s) => s === 429)).toHaveLength(1);
      expect(statuses[60]).toBe(429);
    }, 30_000);
  });
});
