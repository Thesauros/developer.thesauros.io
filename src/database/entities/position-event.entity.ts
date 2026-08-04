import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('position_events')
export class PositionEventEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'varchar', length: 32, default: 'position_event' })
  object: string;

  @Index()
  @Column({ type: 'varchar', length: 64 })
  position_id: string;

  @Column({ type: 'varchar', length: 32 })
  type: string;

  @Column({ type: 'timestamptz' })
  at: string;

  @Column({ type: 'float' })
  amount: number;

  @Column({ type: 'float', nullable: true })
  apy: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  vault_id: string | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;
}
