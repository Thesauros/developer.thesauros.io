import { Global, INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { DatabaseModule } from '../database/database.module';
import { configureApp } from '../bootstrap';
import { createTestDataSource, destroyTestStore } from './create-test-store';

/** The published schema must describe the envelope clients actually receive. */
describe('OpenAPI document (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let baseUrl: string;
  let doc: any;

  beforeAll(async () => {
    dataSource = await createTestDataSource();

    @Global()
    @Module({
      providers: [{ provide: DataSource, useValue: dataSource }],
      exports: [DataSource],
    })
    class TestDatabaseModule {}

    process.env.DB_SEED = 'true';
    // The deployment runs in production; the schema must ship there too.
    process.env.NODE_ENV = 'production';
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideModule(DatabaseModule)
      .useModule(TestDatabaseModule)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    await app.listen(0);
    baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');
    doc = await (await fetch(`${baseUrl}/api/v1/openapi.json`)).json();
  }, 30_000);

  afterAll(async () => {
    delete process.env.NODE_ENV;
    delete process.env.ENCRYPTION_KEY;
    await app?.close();
    await destroyTestStore(dataSource);
  });

  it('is served without auth in production', () => {
    expect(doc.openapi).toMatch(/^3\./);
    expect(Object.keys(doc.paths).length).toBeGreaterThan(10);
  });

  it('documents every P2 route', () => {
    for (const path of [
      '/api/v1/analytics/signals',
      '/api/v1/analytics/regime',
      '/api/v1/analytics/uplift',
      '/api/v1/analytics/decisions',
      '/api/v1/analytics/advisor',
      '/api/v1/reconciliation/balances',
      '/api/v1/reconciliation/ledger',
      '/api/v1/reconciliation/snapshots',
      '/api/v1/reconciliation/report',
    ]) {
      expect([path, Boolean(doc.paths[path]?.get)]).toEqual([path, true]);
    }
  });

  function okSchema(path: string): any {
    return doc.paths[path].get.responses['200'].content['application/json'].schema;
  }

  it('describes the single-resource envelope', () => {
    const schema = okSchema('/api/v1/analytics/regime');
    expect(Object.keys(schema.properties).sort()).toEqual(['data', 'object']);
    expect(schema.properties.data.$ref).toContain('RegimeDto');
  });

  it('describes the paginated list envelope including meta', () => {
    const schema = okSchema('/api/v1/analytics/decisions');
    expect(Object.keys(schema.properties).sort()).toEqual(['data', 'meta', 'object']);
    expect(schema.properties.data.items.$ref).toContain('DecisionDto');
    const meta = doc.components.schemas.ListMetaDto.properties;
    expect(Object.keys(meta).sort()).toEqual(['has_more', 'limit', 'next_cursor', 'total']);
  });

  it('carries worked examples on payload fields', () => {
    const decision = doc.components.schemas.DecisionDto.properties;
    expect(decision.type.enum).toEqual(['initial_routing', 'rebalance']);
    expect(decision.expected_uplift_bps.example).toBe(160);
    const report = doc.components.schemas.ReconciliationReportDto.properties;
    expect(report.status.enum).toEqual(['reconciled', 'mismatch', 'unavailable']);
  });

  it('marks limit and cursor optional, and only USDC/USDT0 as assets', () => {
    const params = doc.paths['/api/v1/analytics/decisions'].get.parameters;
    const byName = Object.fromEntries(params.map((p: any) => [p.name, p]));
    expect(byName.cursor.required).toBeFalsy();
    expect(byName.limit.required).toBeFalsy();
    expect(byName.asset.schema.enum).toEqual(['USDC', 'USDT0']);
  });
});
