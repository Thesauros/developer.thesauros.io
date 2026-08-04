import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('attributions')
export class AttributionEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'varchar', length: 32, default: 'attribution' })
  object: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  user_id: string;

  @Index()
  @Column({ type: 'varchar', length: 64 })
  partner_id: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  campaign_id: string | null;

  @Column({ type: 'varchar', length: 64, default: 'api' })
  source: string;

  @Column({ type: 'timestamptz' })
  attributed_at: string;
}
