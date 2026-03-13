import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './User.entity';

@Entity('instances')
export class Instance {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  @Index()
  instance_id: string;

  @Column({
    type: 'enum',
    enum: ['pending', 'active', 'stopped', 'error', 'recovering'],
    default: 'pending'
  })
  @Index()
  status: string;

  @Column({ nullable: true })
  template: string;

  @Column({ type: 'jsonb', nullable: true })
  config: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  expires_at: Date;

  @Column({ name: 'owner_id', nullable: true })
  @Index()
  owner_id: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @Column({ type: 'timestamp', nullable: true })
  claimed_at: Date;

  @Column({ name: 'docker_container_id', nullable: true })
  docker_container_id: string;

  @Column({ default: 0 })
  restart_attempts: number;

  @Column({ type: 'jsonb', nullable: true })
  health_status: Record<string, any>;
}
