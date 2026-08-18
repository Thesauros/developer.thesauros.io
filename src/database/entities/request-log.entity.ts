import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * One row per handled API request — the source of truth for /usage.
 *
 * The route template (`/api/v1/partner/yield/history/:asset`), not the
 * concrete URL, so cardinality stays bounded and "top endpoints" aggregates
 * sensibly.
 */
@Entity('request_log')
export class RequestLogEntity {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Index()
  @Column({ type: 'timestamptz' })
  t: string;

  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  partner_id: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  key_id: string | null;

  @Column({ type: 'varchar', length: 8 })
  method: string;

  @Column({ type: 'varchar', length: 255 })
  endpoint: string;

  @Column({ type: 'int' })
  status: number;

  @Column({ type: 'int' })
  duration_ms: number;
}
