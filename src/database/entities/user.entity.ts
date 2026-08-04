import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('users')
export class UserEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'varchar', length: 32, default: 'user' })
  object: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  external_id: string | null;

  @Column({ type: 'varchar', length: 255 })
  label: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'jsonb', default: [] })
  wallets: string[];

  @Column({ type: 'varchar', length: 32, default: 'active' })
  status: string;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @Column({ type: 'timestamptz' })
  created_at: string;

  @Column({ type: 'timestamptz' })
  updated_at: string;
}
