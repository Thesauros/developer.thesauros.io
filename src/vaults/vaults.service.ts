import { Injectable } from '@nestjs/common';
import { StoreService } from '../store/store.service';
import { ApySnapshotService } from '../analytics/apy-snapshot.service';
import { DAY_MS, mean, round4 } from '../common/accrual';

interface VaultRow {
  id: string;
  name: string;
  provider: string;
  asset: string;
  chain: string;
  apy: number;
  tvl_usd: number;
  capacity_usd: number;
  risk_tier: string;
  status: string;
  allocation_pct: number;
}

export interface ApyHistoryPoint {
  t: number;
  apy: number;
}

/**
 * Vault reference data with real trailing averages.
 *
 * `apy_7d_avg`/`apy_30d_avg` are computed from the hourly observations
 * ApySnapshotService records — not from the static column, which only ever
 * held a seeded guess. A vault with no observations yet reports null rather
 * than echoing its current APY as if it were an average.
 */
@Injectable()
export class VaultsService {
  constructor(
    private readonly store: StoreService,
    private readonly snapshots: ApySnapshotService,
  ) {}

  /** Trailing averages per vault over the requested windows. */
  private async trailingAverages(days: number[]): Promise<Map<string, Map<number, number | null>>> {
    const longest = Math.max(...days);
    const rows = await this.snapshots.history(Date.now() - longest * DAY_MS);
    const byVault = new Map<string, { at: number; apy: number }[]>();
    for (const row of rows) {
      const list = byVault.get(row.vault_id) ?? [];
      list.push({ at: new Date(row.at).getTime(), apy: row.apy });
      byVault.set(row.vault_id, list);
    }

    const out = new Map<string, Map<number, number | null>>();
    const now = Date.now();
    for (const [vaultId, points] of byVault) {
      const perWindow = new Map<number, number | null>();
      for (const window of days) {
        const cutoff = now - window * DAY_MS;
        const inWindow = points.filter((p) => p.at >= cutoff).map((p) => p.apy);
        perWindow.set(window, inWindow.length ? round4(mean(inWindow)) : null);
      }
      out.set(vaultId, perWindow);
    }
    return out;
  }

  async list(filters: { asset?: string; network?: string } = {}) {
    const asset = filters.asset?.toUpperCase();
    const network = filters.network;
    const vaults = await this.store.filter<VaultRow & Record<string, unknown>>(
      'vaults',
      (v) => (!asset || v.asset === asset) && (!network || v.chain === network),
    );
    const averages = await this.trailingAverages([7, 30]);

    return vaults
      .map((v) => {
        const windows = averages.get(v.id);
        return {
          object: 'vault',
          id: v.id,
          name: v.name,
          provider: v.provider,
          asset: v.asset,
          chain: v.chain,
          apy: v.apy,
          // null until enough observations exist — never the current APY
          // dressed up as an average.
          apy_7d_avg: windows?.get(7) ?? null,
          apy_30d_avg: windows?.get(30) ?? null,
          tvl_usd: v.tvl_usd,
          capacity_usd: v.capacity_usd,
          risk_tier: v.risk_tier,
          status: v.status,
          allocation_pct: v.allocation_pct,
        };
      })
      .sort((a, b) => b.apy - a.apy);
  }

  /** Per-vault observed APY series, oldest first. */
  async apyHistory(vaultId: string, days: number) {
    const vault = await this.store.get<VaultRow & Record<string, unknown>>('vaults', vaultId);
    const rows = await this.snapshots.history(Date.now() - days * DAY_MS, vaultId);
    const points: ApyHistoryPoint[] = rows.map((row) => ({
      t: new Date(row.at).getTime(),
      apy: row.apy,
    }));
    return {
      object: 'apy_history',
      vault_id: vaultId,
      name: vault?.name ?? null,
      asset: vault?.asset ?? null,
      chain: vault?.chain ?? null,
      days,
      apy_avg: points.length ? round4(mean(points.map((p) => p.apy))) : null,
      observations: points.length,
      points,
    };
  }
}
