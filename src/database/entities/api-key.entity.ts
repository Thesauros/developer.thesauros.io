import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('api_keys')
export class ApiKeyEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'varchar', length: 32, default: 'api_key' })
  object: string;

  @Column({ type: 'varchar', length: 255 })
  label: string;

  @Column({ type: 'text' })
  secret: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64, nullable: true })
  secret_hash: string | null;

  @Column({ type: 'varchar', length: 32 })
  prefix: string;

  @Column({ type: 'varchar', length: 16, default: 'test' })
  environment: string;

  @Column({ type: 'timestamptz' })
  created_at: string;

  @Column({ type: 'timestamptz', nullable: true })
  last_used_at: string | null;

  @Column({ type: 'boolean', default: false })
  revoked: boolean;

  @Column({ type: 'jsonb', default: [] })
  scopes: string[];

  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  partner_id: string | null;
}
