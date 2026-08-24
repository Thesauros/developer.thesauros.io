import { Injectable, NotFoundException } from '@nestjs/common';
import { StoreService } from '../store/store.service';
import { ApySnapshotService } from '../analytics/apy-snapshot.service';
import { DAY_MS, mean, round4 } from '../common/accrual';

const HISTORY_DAYS = 30;

export interface YieldHistoryPoint {
  t: number;
  apy: number;
}

export interface YieldBreakdownRow {
  vault_id: string;
  name: string;
  provider: string;
  chain: string;
  risk_tier: string;
  apy: number;
  apy_7d_avg: number | null;
  allocation_pct: number;
  tvl_usd: number;
}

export interface YieldHistory {
  object: 'yield_history';
  /** Always "protocol": this series is protocol-wide, never partner-attributed. */
  scope: 'protocol';
  asset: string;
  blend_apy: number;
  observations: number;
  history: YieldHistoryPoint[];
  breakdown: YieldBreakdownRow[];
}

interface VaultRow {
  id: string;
  name: string;
  provider: string;
  asset: string;
  chain: string;
  apy: number;
  risk_tier: string;
  status: string;
  allocation_pct: number;
  tvl_usd: number;
}

/**
 * Protocol-level yield reference data. Deliberately takes no partner input —
 * the blended APY of a Thesauros asset is the same number for every caller.
 *
 * The daily series is the allocation-weighted blend of what was actually
 * observed, one point per day. It used to be generated from a seeded PRNG
 * because nothing recorded rate history; ApySnapshotService now does, so the
 * curve is real and simply starts empty on a fresh deployment.
 */
@Injectable()
export class YieldService {
  constructor(
    private readonly store: StoreService,
    private readonly snapshots: ApySnapshotService,
  ) {}

  async getAssetHistory(asset: string): Promise<YieldHistory> {
    const symbol = asset.toUpperCase();
    const vaults = await this.store.filter<VaultRow & Record<string, unknown>>(
      'vaults',
      (v) => v.asset === symbol && v.status === 'active',
    );
    if (vaults.length === 0) {
      throw new NotFoundException(`Unsupported asset "${asset}".`);
    }

    const rows = await this.snapshots.history(Date.now() - HISTORY_DAYS * DAY_MS);
    const forAsset = rows.filter((row) => row.asset === symbol);

    // Allocation-weighted blend per day, so the curve tracks what the protocol
    // actually earned rather than an unweighted average of venues.
    const byDay = new Map<number, { weighted: number; weight: number }>();
    for (const row of forAsset) {
      const day = Math.floor(new Date(row.at).getTime() / DAY_MS) * DAY_MS;
      const slot = byDay.get(day) ?? { weighted: 0, weight: 0 };
      const weight = row.allocation_pct > 0 ? row.allocation_pct : 1;
      slot.weighted += row.apy * weight;
      slot.weight += weight;
      byDay.set(day, slot);
    }
    const history: YieldHistoryPoint[] = [...byDay.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([t, slot]) => ({ t, apy: round4(slot.weight ? slot.weighted / slot.weight : 0) }));

    const sevenDayCutoff = Date.now() - 7 * DAY_MS;
    const apy7dByVault = new Map<string, number>();
    for (const vault of vaults) {
      const observed = forAsset
        .filter((row) => row.vault_id === vault.id && new Date(row.at).getTime() >= sevenDayCutoff)
        .map((row) => row.apy);
      if (observed.length) apy7dByVault.set(vault.id, round4(mean(observed)));
    }

    return {
      object: 'yield_history',
      scope: 'protocol',
      asset: symbol,
      // Latest observed blend when there is history; otherwise today's vaults.
      blend_apy: history.length ? history[history.length - 1].apy : round4(this.blendApy(vaults)),
      observations: history.length,
      history,
      breakdown: vaults
        .map((v) => ({
          vault_id: v.id,
          name: v.name,
          provider: v.provider,
          chain: v.chain,
          risk_tier: v.risk_tier,
          apy: v.apy,
          apy_7d_avg: apy7dByVault.get(v.id) ?? null,
          allocation_pct: v.allocation_pct,
          tvl_usd: v.tvl_usd,
        }))
        .sort((a, b) => b.apy - a.apy),
    };
  }

  private blendApy(vaults: VaultRow[]): number {
    const totalAlloc = vaults.reduce((s, v) => s + (v.allocation_pct || 0), 0);
    if (totalAlloc > 0) {
      return vaults.reduce((s, v) => s + v.apy * (v.allocation_pct || 0), 0) / totalAlloc;
    }
    return vaults.reduce((s, v) => s + v.apy, 0) / vaults.length;
  }
}
