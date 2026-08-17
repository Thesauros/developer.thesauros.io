import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('webhook_deliveries')
export class WebhookDeliveryEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'varchar', length: 32, default: 'delivery' })
  object: string;

  @Index()
  @Column({ type: 'varchar', length: 64 })
  webhook_id: string;

  @Index()
  @Column({ type: 'varchar', length: 64 })
  partner_id: string;

  @Column({ type: 'text' })
  url: string;

  @Column({ type: 'varchar', length: 64 })
  event: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'text' })
  signature: string;

  @Column({ type: 'varchar', length: 16 })
  status: string;

  @Column({ type: 'int', default: 1 })
  attempts: number;

  @Index()
  @Column({ type: 'timestamptz' })
  at: string;

  @Column({ type: 'int', default: 0 })
  latency_ms: number;
}
