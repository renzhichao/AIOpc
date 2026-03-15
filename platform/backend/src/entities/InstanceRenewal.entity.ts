import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { Instance } from './Instance.entity';
import { User } from './User.entity';

@Entity('instance_renewals')
export class InstanceRenewal {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'instance_id' })
  @Index()
  instance_id: string;

  @ManyToOne(() => Instance)
  @JoinColumn({ name: 'instance_id' })
  instance: Instance;

  @Column({ name: 'old_expires_at', type: 'timestamp' })
  old_expires_at: Date;

  @Column({ name: 'new_expires_at', type: 'timestamp' })
  new_expires_at: Date;

  @Column({ name: 'duration_days' })
  duration_days: number;

  @Column({ name: 'renewed_by' })
  @Index()
  renewed_by: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'renewed_by' })
  renewed_by_user: User;

  @CreateDateColumn({ name: 'renewed_at' })
  renewed_at: Date;
}
