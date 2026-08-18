import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { VaultApySnapshotEntity } from '../database/entities';
import { StoreService } from '../store/store.service';

const HOUR_MS = 60 * 60 * 1000;

interface VaultRow {
  id: string;
  asset: string;
  provider: string;
  chain: string;
  apy: number;
  tvl_usd: number;
  allocation_pct: number;
  risk_tier: string;
  status: string;
}

/** ISO hour bucket, e.g. "2026-08-18T13". */
export function hourBucket(at: number | Date): string {
  return new Date(at).toISOString().slice(0, 13);
}

/**
 * Records what each vault's APY actually was, once an hour.
 *
 * Analytics (volatility, trend, regime, realized uplift) is only honest if it
 * reads observed history. Without this recorder there is no history at all —
 * `vaults` holds a single current value — and the endpoints would have to
 * invent one, which is exactly the mock this work removes.
 *
 * ponytail: in-process interval, not a job queue. Instances that overlap
 * collide on the (vault_id, bucket) primary key and the write is ignored, so
 * running several is safe. Move to a scheduler if snapshotting ever needs to
 * outlive the API process.
 */
@Injectable()
export class ApySnapshotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ApySnapshotService.name);
  private readonly repo: Repository<VaultApySnapshotEntity>;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly dataSource: DataSource,
    private readonly store: StoreService,
  ) {
    this.repo = this.dataSource.getRepository(VaultApySnapshotEntity);
  }

  async onModuleInit(): Promise<void> {
    if (process.env.APY_SNAPSHOTS === 'false') {
      this.logger.log('APY_SNAPSHOTS=false — not recording vault APY history');
      return;
    }
    await this.record().catch((error) => this.logger.error(`Initial APY snapshot failed: ${error}`));
    this.timer = setInterval(() => {
      void this.record().catch((error) => this.logger.error(`APY snapshot failed: ${error}`));
    }, HOUR_MS);
    // Do not hold the process open just to take snapshots.
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Snapshot every active vault into the current hour bucket. */
  async record(at = Date.now()): Promise<number> {
    const vaults = await this.store.filter<VaultRow & { [k: string]: unknown }>(
      'vaults',
      (v) => v.status === 'active',
    );
    if (!vaults.length) return 0;
    const bucket = hourBucket(at);
    const rows = vaults.map((v) => ({
      vault_id: v.id,
      bucket,
      asset: v.asset,
      provider: v.provider,
      chain: v.chain,
      apy: v.apy ?? 0,
      tvl_usd: v.tvl_usd ?? 0,
      allocation_pct: v.allocation_pct ?? 0,
      risk_tier: v.risk_tier ?? 'unknown',
      at: new Date(at).toISOString(),
    }));
    // orIgnore: the hour is already recorded (another instance, or a restart).
    await this.repo.createQueryBuilder().insert().values(rows).orIgnore().execute();
    return rows.length;
  }

  /** Snapshots since `since`, oldest first. */
  async history(since: number, vaultId?: string): Promise<VaultApySnapshotEntity[]> {
    const query = this.repo
      .createQueryBuilder('s')
      .where('s.at >= :since', { since: new Date(since).toISOString() })
      .orderBy('s.at', 'ASC');
    if (vaultId) query.andWhere('s.vault_id = :vaultId', { vaultId });
    return query.getMany();
  }
}
