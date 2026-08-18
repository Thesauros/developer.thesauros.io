import { DataSource } from 'typeorm';
import { StoreService } from '../store/store.service';
import { createTestStore, destroyTestStore } from '../test/create-test-store';
import { AnalyticsService } from './analytics.service';
import { ApySnapshotService } from './apy-snapshot.service';

const HOUR_MS = 60 * 60 * 1000;
const ACME = 'ptn_seed_acme';

describe('AnalyticsService', () => {
  let dataSource: DataSource;
  let store: StoreService;
  let snapshots: ApySnapshotService;
  let service: AnalyticsService;

  beforeEach(async () => {
    ({ dataSource, store } = await createTestStore());
    snapshots = new ApySnapshotService(dataSource, store);
    service = new AnalyticsService(store, snapshots);
  });

  afterEach(async () => {
    await destroyTestStore(dataSource);
  });

  /** Record `count` hourly snapshots, nudging one vault's APY each hour. */
  async function recordHistory(count: number, vaultId = 'vault_morpho_base_usdc'): Promise<void> {
    const start = Date.now() - count * HOUR_MS;
    for (let i = 0; i < count; i++) {
      await store.update('vaults', vaultId, { apy: 0.068 + i * 0.001 } as any);
      await snapshots.record(start + i * HOUR_MS);
    }
  }

  describe('signals', () => {
    it('withholds trend and volatility until enough is observed', async () => {
      const rows = await service.signals();
      expect(rows.length).toBe(6);
      for (const row of rows) {
        expect(row.insufficient_history).toBe(true);
        expect(row.volatility).toBeNull();
        expect(row.trend_slope_bps_day).toBeNull();
        expect(row.forecast_apy).toBeNull();
        expect(row.observations).toBe(0);
      }
    });

    it('ranks by risk-adjusted APY, discounting by risk tier', async () => {
      const rows = await service.signals();
      // 0.076 * 0.92 (core) beats 0.052 * 1.0 (bluechip).
      expect(rows[0].vault_id).toBe('vault_morpho_arb_usdt');
      expect(rows[0].rank).toBe(1);
      expect(rows[0].recommendation).toBe('overweight');
      const aave = rows.find((r) => r.vault_id === 'vault_aave_base_usdc');
      expect(aave?.risk_factor).toBe(1);
      expect(aave?.risk_adjusted_apy).toBeCloseTo(0.052, 6);
    });

    it('computes volatility and trend once history exists', async () => {
      await recordHistory(6);
      const rows = await service.signals();
      const moved = rows.find((r) => r.vault_id === 'vault_morpho_base_usdc');
      expect(moved?.insufficient_history).toBe(false);
      expect(moved?.observations).toBe(6);
      expect(moved?.volatility).toBeGreaterThan(0);
      // APY rose 10 bps per hour, so the daily trend must be positive.
      expect(moved?.trend_slope_bps_day as number).toBeGreaterThan(0);
      expect(moved?.forecast_apy as number).toBeGreaterThan(0);
    });

    it('filters by asset', async () => {
      const rows = await service.signals('usdt');
      expect(rows.map((r) => r.asset)).toEqual(['USDT']);
    });
  });

  describe('regime', () => {
    it('reports unknown rather than guessing with no history', async () => {
      const result = await service.regime();
      expect(result.regime).toBe('unknown');
      expect(result.per_asset.every((a) => a.regime === 'unknown')).toBe(true);
      expect(result.per_asset.every((a) => a.trend_slope_bps_day === null)).toBe(true);
    });

    it('classifies a rising market from observed snapshots', async () => {
      await recordHistory(8);
      const result = await service.regime('USDC');
      const usdc = result.per_asset.find((a) => a.asset === 'USDC');
      expect(usdc?.observations).toBeGreaterThanOrEqual(3);
      expect(['rising', 'volatile']).toContain(usdc?.regime);
      expect(usdc?.blend_apy).not.toBeNull();
    });
  });

  describe('uplift', () => {
    it('measures only the calling partner positions', async () => {
      const acme = await service.uplift({ partnerId: ACME });
      expect(acme.positions.map((p) => p.position_id).sort()).toEqual([
        'pos_seed_alpha',
        'pos_seed_beta',
        'pos_seed_gamma',
      ]);
      const orbit = await service.uplift({ partnerId: 'ptn_seed_orbit' });
      // Orbit's only position is closed, so it holds no active value.
      expect(orbit.positions).toHaveLength(0);
      expect(orbit.totals.current_value).toBe(0);
    });

    it('reports baseline coverage instead of silently skipping assets', async () => {
      const result = await service.uplift({ partnerId: ACME });
      const usdt = result.positions.find((p) => p.asset === 'USDT');
      // No aave USDT venue exists, so that row has no passive baseline.
      expect(usdt?.aave_baseline).toBeNull();
      expect(usdt?.uplift_vs_aave).toBeNull();
      expect(result.totals.baseline_coverage).toBeCloseTo(2 / 3, 4);
    });

    it('beats the passive baseline when routed into a higher-APY venue', async () => {
      const result = await service.uplift({ partnerId: ACME, asset: 'USDC' });
      const gamma = result.positions.find((p) => p.position_id === 'pos_seed_gamma');
      // Routed at 6.8% against a 5.2% aave baseline.
      expect(gamma?.baseline_apy).toBeCloseTo(0.052, 6);
      expect(gamma?.uplift_vs_aave as number).toBeGreaterThan(0);
      expect(gamma?.projected_uplift_annual as number).toBeCloseTo(50_000 * (0.068 - 0.052), 2);
      expect(result.totals.uplift_vs_aave).toBeGreaterThan(0);
    });
  });

  describe('decisions', () => {
    it('logs the initial routing of every position', async () => {
      const rows = await service.decisions({ partnerId: ACME });
      expect(rows).toHaveLength(3);
      expect(rows.every((r) => r.type === 'initial_routing')).toBe(true);
      const alpha = rows.find((r) => r.position_id === 'pos_seed_alpha');
      expect(alpha?.from_vault).toBeNull();
      expect(alpha?.to_vault).toBe('vault_aave_base_usdc');
      expect(alpha?.apy_before).toBeNull();
      expect(alpha?.rationale).toContain('Aave V3 USDC Core');
    });

    it('derives from/to and uplift for a rebalance from the event chain', async () => {
      await store.create('positionEvents', {
        id: 'evt_alpha_reb',
        object: 'position_event',
        position_id: 'pos_seed_alpha',
        type: 'rebalance',
        at: new Date().toISOString(),
        amount: 25_000,
        apy: 0.068,
        vault_id: 'vault_morpho_base_usdc',
        note: 'rate_spread',
      } as any);

      const rows = await service.decisions({ partnerId: ACME, positionId: 'pos_seed_alpha' });
      expect(rows).toHaveLength(2);
      // Newest first.
      const rebalance = rows[0];
      expect(rebalance.type).toBe('rebalance');
      expect(rebalance.from_vault).toBe('vault_aave_base_usdc');
      expect(rebalance.to_vault).toBe('vault_morpho_base_usdc');
      expect(rebalance.apy_before).toBeCloseTo(0.052, 6);
      expect(rebalance.apy_after).toBeCloseTo(0.068, 6);
      expect(rebalance.expected_uplift_bps).toBeCloseTo(160, 2);
      expect(rebalance.reason).toBe('rate_spread');
    });

    it('does not leak another partner decisions', async () => {
      const rows = await service.decisions({ partnerId: 'ptn_seed_orbit' });
      expect(rows.every((r) => r.position_id === 'pos_seed_delta')).toBe(true);
    });
  });

  describe('advisor', () => {
    it('composes regime, signals and uplift without inventing history', async () => {
      const result = await service.advisor({ partnerId: ACME });
      expect(result.object).toBe('advisor');
      expect(result.regime).toBe('unknown');
      expect(result.top_opportunities).toHaveLength(3);
      expect(result.portfolio.positions).toBe(3);
      // It must say out loud that the venues have no recorded history yet.
      expect(result.bullets.some((b) => b.includes('recorded observations'))).toBe(true);
    });
  });
});
