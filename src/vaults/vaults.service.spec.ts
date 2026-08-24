import { DataSource } from 'typeorm';
import { StoreService } from '../store/store.service';
import { createTestStore, destroyTestStore } from '../test/create-test-store';
import { ApySnapshotService } from '../analytics/apy-snapshot.service';
import { VaultsService } from './vaults.service';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

describe('VaultsService', () => {
  let dataSource: DataSource;
  let store: StoreService;
  let snapshots: ApySnapshotService;
  let service: VaultsService;

  beforeEach(async () => {
    ({ dataSource, store } = await createTestStore());
    snapshots = new ApySnapshotService(dataSource, store);
    service = new VaultsService(store, snapshots);
  });

  afterEach(async () => {
    await destroyTestStore(dataSource);
  });

  it('reports null averages rather than echoing the current APY', async () => {
    const vaults = await service.list();
    expect(vaults.length).toBe(6);
    for (const v of vaults) {
      expect(v.apy_7d_avg).toBeNull();
      expect(v.apy_30d_avg).toBeNull();
    }
    // Highest current APY first.
    expect(vaults[0].apy).toBeGreaterThanOrEqual(vaults[1].apy);
  });

  it('averages observed snapshots once they exist', async () => {
    const vaultId = 'vault_aave_base_usdc';
    // Two observations 4 % and 6 % -> 5 % mean.
    await store.update('vaults', vaultId, { apy: 0.04 } as any);
    await snapshots.record(Date.now() - 2 * HOUR_MS);
    await store.update('vaults', vaultId, { apy: 0.06 } as any);
    await snapshots.record(Date.now() - HOUR_MS);

    const vault = (await service.list()).find((v) => v.id === vaultId);
    expect(vault?.apy_7d_avg).toBeCloseTo(0.05, 4);
  });

  it('excludes observations older than the window', async () => {
    const vaultId = 'vault_aave_base_usdc';
    await store.update('vaults', vaultId, { apy: 0.2 } as any);
    await snapshots.record(Date.now() - 20 * DAY_MS);
    await store.update('vaults', vaultId, { apy: 0.05 } as any);
    await snapshots.record(Date.now() - HOUR_MS);

    const vault = (await service.list()).find((v) => v.id === vaultId);
    // The 20-day-old 20 % reading counts for 30d but not for 7d.
    expect(vault?.apy_7d_avg).toBeCloseTo(0.05, 4);
    expect(vault?.apy_30d_avg).toBeCloseTo(0.125, 4);
  });

  it('filters by asset and network without switching server state', async () => {
    expect((await service.list({ asset: 'USDT0' })).every((v) => v.asset === 'USDT0')).toBe(true);
    const plasma = await service.list({ network: 'plasma' });
    expect(plasma.every((v) => v.chain === 'plasma')).toBe(true);
    // Concurrent reads of different chains do not interfere.
    const [base, arb] = await Promise.all([service.list({ network: 'base' }), service.list({ network: 'arbitrum' })]);
    expect(base.every((v) => v.chain === 'base')).toBe(true);
    expect(arb.every((v) => v.chain === 'arbitrum')).toBe(true);
  });

  describe('apyHistory', () => {
    it('returns an empty series with no observations, not a generated one', async () => {
      const result = await service.apyHistory('vault_aave_base_usdc', 7);
      expect(result.points).toEqual([]);
      expect(result.apy_avg).toBeNull();
      expect(result.observations).toBe(0);
      expect(result.name).toBe('Aave V3 USDC Core');
    });

    it('returns recorded points oldest first', async () => {
      const vaultId = 'vault_aave_base_usdc';
      for (let i = 3; i >= 1; i--) {
        await store.update('vaults', vaultId, { apy: 0.05 + i * 0.01 } as any);
        await snapshots.record(Date.now() - i * HOUR_MS);
      }
      const result = await service.apyHistory(vaultId, 7);
      expect(result.observations).toBe(3);
      expect(result.points.map((p) => p.t)).toEqual([...result.points.map((p) => p.t)].sort((a, b) => a - b));
      expect(result.apy_avg).toBeCloseTo(0.07, 4);
    });

    it('is empty for an unknown vault instead of throwing', async () => {
      const result = await service.apyHistory('vault_nope', 7);
      expect(result.points).toEqual([]);
      expect(result.name).toBeNull();
    });
  });
});
