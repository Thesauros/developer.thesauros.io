import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('campaigns')
@Index('ux_campaigns_partner_slug', ['partner_id', 'slug'], { unique: true })
export class CampaignEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'varchar', length: 32, default: 'campaign' })
  object: string;

  @Index()
  @Column({ type: 'varchar', length: 64 })
  partner_id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 64 })
  slug: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  utm_source: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  utm_medium: string | null;

  @Column({ type: 'varchar', length: 32, default: 'active' })
  status: string;

  @Column({ type: 'timestamptz' })
  created_at: string;

  @Column({ type: 'timestamptz' })
  updated_at: string;
}
