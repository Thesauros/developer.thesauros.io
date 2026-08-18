import { DataSource } from 'typeorm';
import { StoreService } from '../store/store.service';
import { createTestStore, destroyTestStore } from '../test/create-test-store';
import { MonitorClient, ObservedSnapshot } from './monitor.client';
import { ReconciliationService } from './reconciliation.service';

const ACME = 'ptn_seed_acme';

/** Monitor stub: reconciliation must never open its own RPC connections. */
function stubMonitor(snapshot: ObservedSnapshot | null): MonitorClient {
  return {
    get configured() {
      return snapshot !== null;
    },
    observed: async () => {
      if (!snapshot) throw new Error('monitoring unreachable');
      return snapshot;
    },
  } as unknown as MonitorClient;
}

function observedSnapshot(usdc: number, usdt: number): ObservedSnapshot {
  return {
    fetched_at: new Date().toISOString(),
    networks: ['base', 'arbitrum'],
    vaults: [
      { address: '0xaaa', name: 'Aave V3 USDC Core', asset: 'USDC', network: 'base', tvl: usdc, active_provider: null },
      { address: '0xbbb', name: 'Morpho Blue USDT', asset: 'USDT', network: 'arbitrum', tvl: usdt, active_provider: null },
    ],
  };
}

describe('ReconciliationService', () => {
  let dataSource: DataSource;
  let store: StoreService;

  beforeEach(async () => {
    ({ dataSource, store } = await createTestStore());
  });

  afterEach(async () => {
    await destroyTestStore(dataSource);
  });

  describe('balances', () => {
    it('groups active positions by user and asset', async () => {
      const service = new ReconciliationService(store, stubMonitor(null));
      const rows = await service.balances({ partnerId: ACME });
      const nova = rows.find((r) => r.user_id === 'usr_seed_nova' && r.asset === 'USDC');
      // Nova holds two USDC positions: 25k + 50k principal.
      expect(nova?.positions).toBe(2);
      expect(nova?.principal).toBe(75_000);
      expect(nova?.current_value as number).toBeGreaterThan(75_000);
      expect(rows.find((r) => r.asset === 'USDT')?.positions).toBe(1);
    });

    it('is scoped to the calling partner', async () => {
      const service = new ReconciliationService(store, stubMonitor(null));
      const rows = await service.balances({ partnerId: 'ptn_seed_orbit' });
      // Orbit's only position is closed, so it contributes no balance.
      expect(rows).toHaveLength(0);
    });
  });

  describe('ledger', () => {
    it('runs a balance forward and closes it with an accrual row', async () => {
      const service = new ReconciliationService(store, stubMonitor(null));
      const rows = await service.ledger({ partnerId: ACME, positionId: 'pos_seed_alpha' });
      expect(rows.map((r) => r.type)).toEqual(['deposit', 'accrual']);
      expect(rows[0].amount).toBe(25_000);
      expect(rows[0].balance_after).toBe(25_000);
      expect(rows[0].settled).toBe(true);
      // Yield on an open position is unrealized.
      expect(rows[1].settled).toBe(false);
      expect(rows[1].amount).toBeGreaterThan(0);
      expect(rows[1].balance_after).toBeCloseTo(25_000 + rows[1].amount, 2);
    });

    it('signs withdrawals negative and keeps the running balance right', async () => {
      await store.create('positionEvents', {
        id: 'evt_alpha_wd',
        object: 'position_event',
        position_id: 'pos_seed_alpha',
        type: 'withdraw',
        at: new Date().toISOString(),
        amount: 5_000,
        apy: null,
        vault_id: 'vault_aave_base_usdc',
        note: null,
      } as any);

      const service = new ReconciliationService(store, stubMonitor(null));
      const rows = await service.ledger({ partnerId: ACME, positionId: 'pos_seed_alpha' });
      const withdrawal = rows.find((r) => r.type === 'withdraw');
      expect(withdrawal?.amount).toBe(-5_000);
      expect(withdrawal?.balance_after).toBe(20_000);
    });

    it('filters by movement type', async () => {
      const service = new ReconciliationService(store, stubMonitor(null));
      const rows = await service.ledger({ partnerId: ACME, type: 'deposit' });
      expect(rows.length).toBe(3);
      expect(rows.every((r) => r.type === 'deposit')).toBe(true);
    });
  });

  describe('snapshots', () => {
    it('emits one row per day in the requested window', async () => {
      const service = new ReconciliationService(store, stubMonitor(null));
      const to = new Date();
      const from = new Date(to.getTime() - 6 * 24 * 60 * 60 * 1000);
      const rows = await service.snapshots({
        partnerId: ACME,
        from: from.toISOString(),
        to: to.toISOString(),
      });
      expect(rows.length).toBeGreaterThanOrEqual(7);
      expect(rows[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const last = rows[rows.length - 1];
      expect(last.value).toBeGreaterThan(last.principal);
      expect(last.accrued).toBeCloseTo(last.value - last.principal, 2);
    });
  });

  describe('report', () => {
    it('says the observed side is missing rather than faking it', async () => {
      const service = new ReconciliationService(store, stubMonitor(null));
      const report = await service.report();
      expect(report.status).toBe('unavailable');
      expect(report.onchain_total).toBeNull();
      expect(report.diff_bps).toBeNull();
      expect(report.recorded_total).toBeGreaterThan(0);
      expect(report.breakdown.every((b) => b.onchain === null)).toBe(true);
    });

    it('degrades to unavailable when monitoring is unreachable', async () => {
      const broken = { configured: true, observed: async () => { throw new Error('boom'); } };
      const service = new ReconciliationService(store, broken as unknown as MonitorClient);
      const report = await service.report();
      expect(report.status).toBe('unavailable');
      expect(report.unavailable_reason).toContain('boom');
    });

    it('reconciles when the chain agrees within tolerance', async () => {
      const probe = new ReconciliationService(store, stubMonitor(null));
      const recorded = (await probe.report()).recorded_total;
      const usdcRecorded = (await probe.report()).breakdown.find((b) => b.asset === 'USDC')?.recorded ?? 0;
      const usdtRecorded = recorded - usdcRecorded;

      const service = new ReconciliationService(store, stubMonitor(observedSnapshot(usdcRecorded, usdtRecorded)));
      const report = await service.report();
      expect(report.status).toBe('reconciled');
      expect(report.open_discrepancies).toHaveLength(0);
      expect(report.diff_bps).toBeCloseTo(0, 1);
    });

    it('flags an asset whose chain balance drifts past tolerance', async () => {
      const probe = new ReconciliationService(store, stubMonitor(null));
      const breakdown = (await probe.report()).breakdown;
      const usdcRecorded = breakdown.find((b) => b.asset === 'USDC')?.recorded ?? 0;
      const usdtRecorded = breakdown.find((b) => b.asset === 'USDT')?.recorded ?? 0;

      // 1% short on USDC — 100 bps, well past the 10 bps tolerance.
      const service = new ReconciliationService(
        store,
        stubMonitor(observedSnapshot(usdcRecorded * 0.99, usdtRecorded)),
      );
      const report = await service.report();
      expect(report.status).toBe('mismatch');
      expect(report.open_discrepancies.map((d) => d.asset)).toEqual(['USDC']);
      expect(report.open_discrepancies[0].diff_bps as number).toBeCloseTo(101, 0);
    });
  });
});
