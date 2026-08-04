import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('locks')
export class LockEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  userAddress: string | null;

  @Column({ type: 'float', default: 0 })
  amount: number;

  @Column({ type: 'float', default: 0 })
  duration: number;
}
