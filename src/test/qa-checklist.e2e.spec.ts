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

/**
 * Executable form of the QA sign-off checklist ("Partner program API service
 * issues"). Every item in that report maps to a test here, so a regression on
 * any of them fails CI instead of resurfacing in the next manual QA round.
 *
 * The report was filed against a stale production build: everything below
 * already held on master at the time. That is exactly why this spec exists —
 * "fixed on master" and "verified against the deployed contract" kept
 * drifting apart, and the checklist lived only in a Confluence table.
 */
describe('QA checklist regression (e2e)', () => {
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

  function expectEnvelope(body: any, expectedObject?: string): void {
    expect(Object.keys(body).sort()).toEqual(expect.arrayContaining(['data', 'object']));
    expect(body).not.toHaveProperty('id'); // flat resource = no envelope
    expect(body.data).toBeDefined();
    if (expectedObject) expect(body.object).toBe(expectedObject);
  }

  describe('QA #1 — every success response is wrapped in {object, data}', () => {
    // The report lists 13 endpoints that answered flat. One test per row.
    it('POST /keys', async () => {
      const res = await call('POST', '/api/v1/keys', MASTER, { label: 'qa', scopes: ['read'] });
      expect(res.status).toBe(201);
      expectEnvelope(res.body, 'api_key');
      // The stale build also leaked these two fields — pin their absence.
      expect(res.body.data).not.toHaveProperty('secret_hash');
      expect(res.body.data).not.toHaveProperty('_plaintext_secret');
      expect(typeof res.body.data.secret).toBe('string'); // one-time plaintext, by design
    });

    it('POST /partners/:id/campaigns', async () => {
      const res = await call('POST', '/api/v1/partners/ptn_seed_acme/campaigns', MASTER, {
        name: 'QA Regression Campaign',
      });
      expect(res.status).toBe(201);
      expectEnvelope(res.body, 'campaign');
    });

    it('GET /partners/:id', async () => {
      const res = await get('/api/v1/partners/ptn_seed_acme', MASTER);
      expect(res.status).toBe(200);
      expectEnvelope(res.body, 'partner');
      expect(res.body.data).toHaveProperty('status');
    });

    it('PATCH /partners/:id — enveloped AND carries the same field set as GET (incl. status)', async () => {
      const gotten = await get('/api/v1/partners/ptn_seed_acme', MASTER);
      const patched = await call('PATCH', '/api/v1/partners/ptn_seed_acme', MASTER, {
        name: 'Acme Wallet',
      });
      expect(patched.status).toBe(200);
      expectEnvelope(patched.body, 'partner');
      expect(Object.keys(patched.body.data).sort()).toEqual(Object.keys(gotten.body.data).sort());
      expect(patched.body.data).toHaveProperty('status');
    });

    const partnerScoped: Array<[string, string]> = [
      ['/api/v1/partner/summary', 'partner_summary'],
      ['/api/v1/partner/deposits', 'partner_deposits'],
      ['/api/v1/partner/withdrawals', 'partner_withdrawals'],
      ['/api/v1/partner/tvl', 'partner_tvl'],
      ['/api/v1/partner/yield', 'partner_yield'],
      ['/api/v1/partner/yield/history/USDC', 'yield_history'],
      ['/api/v1/partner/points', 'partner_points'],
      ['/api/v1/partner/revenue', 'revenue_share'],
    ];

    it.each(partnerScoped)('GET %s', async (path, objectType) => {
      const res = await get(path, ACME);
      expect(res.status).toBe(200);
      expectEnvelope(res.body, objectType);
    });
  });

  describe('QA #2 — the documented 60 req/min limit holds account-wide', () => {
    it('returns 429 on the 61st request across mixed endpoints, not after ~200', async () => {
      // Spray several endpoints like the QA run did: the limit must bind to
      // the key, not to each route's own bucket.
      const paths = [
        '/api/v1/partner/tvl',
        '/api/v1/partner/deposits',
        '/api/v1/partner/points',
        '/api/v1/partner/summary',
      ];
      const statuses: number[] = [];
      for (let i = 0; i < 65; i++) {
        const res = await get(paths[i % paths.length], ORBIT);
        statuses.push(res.status);
      }
      const first429 = statuses.indexOf(429);
      expect(first429).toBe(60); // 0-based: request #61
      expect(statuses.slice(0, 60).every((s) => s === 200)).toBe(true);
    }, 60_000);
  });

  describe('QA #3 — disabling a partner locks its keys out immediately', () => {
    it('disable revokes keys; re-enable does not resurrect them', async () => {
      // Fresh partner + key so this test owns its fixtures. POST /partners
      // returns data: { partner, api_key } — the bootstrap key is issued in
      // the same call.
      const partner = await call('POST', '/api/v1/partners', MASTER, {
        name: 'QA Disable Co',
        contact_email: 'qa-disable@example.com',
      });
      expect(partner.status).toBe(201);
      const pid = partner.body.data.partner.id;
      const secret = partner.body.data.api_key.secret;
      expect(typeof secret).toBe('string');

      const before = await get('/api/v1/partner/summary', secret);
      expect(before.status).toBe(200);

      await call('PATCH', `/api/v1/partners/${pid}`, MASTER, { status: 'disabled' });
      const during = await get('/api/v1/partner/summary', secret);
      expect(during.status).toBe(401); // revoked, not merely "disabled"

      await call('PATCH', `/api/v1/partners/${pid}`, MASTER, { status: 'active' });
      const after = await get('/api/v1/partner/summary', secret);
      expect(after.status).toBe(401); // re-enabling must not resurrect old keys
    });
  });

  describe('QA #4 — partner:read key with partner_id=null gets no partner data', () => {
    it('rejects /partner/yield/history/:asset with 403, not someone else’s data', async () => {
      // MASTER carries partner:read but no partner binding — the report's case.
      const res = await get('/api/v1/partner/yield/history/USDC', MASTER);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('forbidden');
    });

    it('rejects every other /partner/* route the same way', async () => {
      for (const path of [
        '/api/v1/partner/summary',
        '/api/v1/partner/deposits',
        '/api/v1/partner/tvl',
        '/api/v1/partner/revenue',
      ]) {
        const res = await get(path, MASTER);
        expect(res.status).toBe(403);
      }
    });
  });
});
