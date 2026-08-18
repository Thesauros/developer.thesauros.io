import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Observed APY/TVL of a vault at a point in time.
 *
 * Analytics needs real history to compute volatility, trend and regime. The
 * `vaults` table only holds the current value, so nothing could derive those
 * without inventing numbers. This table is the record of what was actually
 * observed; every analytics figure is computed from these rows.
 *
 * `bucket` is the truncated hour the row belongs to and is part of the primary
 * key, so several API instances recording the same hour collide instead of
 * writing duplicate points.
 */
@Entity('vault_apy_snapshots')
export class VaultApySnapshotEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  vault_id: string;

  /** ISO hour, e.g. "2026-08-18T13". */
  @PrimaryColumn({ type: 'varchar', length: 16 })
  bucket: string;

  @Index()
  @Column({ type: 'varchar', length: 16 })
  asset: string;

  @Column({ type: 'varchar', length: 64 })
  provider: string;

  @Column({ type: 'varchar', length: 32 })
  chain: string;

  @Column({ type: 'float' })
  apy: number;

  @Column({ type: 'float', default: 0 })
  tvl_usd: number;

  @Column({ type: 'float', default: 0 })
  allocation_pct: number;

  @Column({ type: 'varchar', length: 32 })
  risk_tier: string;

  @Index()
  @Column({ type: 'timestamptz' })
  at: string;
}
