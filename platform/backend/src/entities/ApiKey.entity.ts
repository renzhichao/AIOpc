import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('api_keys')
export class ApiKey {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index()
  provider: string;

  @Column({ name: 'encrypted_key' })
  encrypted_key: string;

  @Column({ default: 'active' })
  @Index()
  status: string;

  @Column({ default: 0 })
  usage_count: number;

  @Column({ default: 1000 })
  quota: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @Column({ name: 'current_instance_id', nullable: true })
  current_instance_id: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  last_used_at: Date;
}
