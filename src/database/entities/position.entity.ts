import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('positions')
export class PositionEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'varchar', length: 32, default: 'position' })
  object: string;

  @Index()
  @Column({ type: 'varchar', length: 64 })
  user_id: string;

  @Column({ type: 'varchar', length: 128 })
  wallet: string;

  @Column({ type: 'varchar', length: 16 })
  asset: string;

  @Column({ type: 'varchar', length: 32 })
  chain: string;

  @Column({ type: 'varchar', length: 64 })
  vault_id: string;

  @Column({ type: 'float' })
  principal: number;

  @Column({ type: 'float' })
  apy: number;

  @Column({ type: 'varchar', length: 32, default: 'auto' })
  strategy: string;

  @Column({ type: 'varchar', length: 32, default: 'active' })
  status: string;

  @Column({ type: 'timestamptz', nullable: true })
  last_rebalance_at: string | null;

  @Column({ type: 'float', default: 0 })
  withdrawn_total: number;

  @Column({ type: 'timestamptz' })
  opened_at: string;

  @Column({ type: 'timestamptz' })
  updated_at: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  tx_hash: string | null;

  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  partner_id: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  campaign_id: string | null;
}
