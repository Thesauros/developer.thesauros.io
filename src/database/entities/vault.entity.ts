import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('vaults')
export class VaultEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'varchar', length: 32, default: 'vault' })
  object: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 64 })
  provider: string;

  @Index()
  @Column({ type: 'varchar', length: 16 })
  asset: string;

  @Column({ type: 'varchar', length: 32 })
  chain: string;

  @Column({ type: 'float' })
  apy: number;

  @Column({ type: 'float' })
  apy_7d_avg: number;

  @Column({ type: 'float' })
  apy_30d_avg: number;

  @Column({ type: 'float' })
  tvl_usd: number;

  @Column({ type: 'float' })
  capacity_usd: number;

  @Column({ type: 'varchar', length: 32 })
  risk_tier: string;

  @Column({ type: 'varchar', length: 32, default: 'active' })
  status: string;

  @Column({ type: 'float', default: 0 })
  allocation_pct: number;
}
