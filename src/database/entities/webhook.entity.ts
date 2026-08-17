import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('webhooks')
export class WebhookEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'varchar', length: 32, default: 'webhook' })
  object: string;

  @Index()
  @Column({ type: 'varchar', length: 64 })
  partner_id: string;

  @Column({ type: 'text' })
  url: string;

  @Column({ type: 'jsonb', default: [] })
  events: string[];

  /** Signing secret, encrypted at rest with the same CryptoService as API keys. */
  @Column({ type: 'text' })
  secret: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'timestamptz' })
  created_at: string;
}
