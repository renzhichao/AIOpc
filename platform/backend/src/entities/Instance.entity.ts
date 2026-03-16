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
    enum: ['pending', 'active', 'stopped', 'error', 'recovering', 'running'],
    default: 'pending'
  })
  @Index()
  status: string;

  @Column({ nullable: true })
  template: string;

  @Column({ name: 'name', nullable: true })
  name: string;

  @Column({ type: 'jsonb', nullable: true })
  config: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @Column({ name: 'updated_at', type: 'timestamp', nullable: true })
  updated_at: Date;

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

  /**
   * Health status: 'healthy', 'warning', 'unhealthy'
   * Updated by MetricsCollectionService based on container metrics
   */
  @Column({
    type: 'enum',
    enum: ['healthy', 'warning', 'unhealthy'],
    default: 'healthy',
    nullable: true
  })
  @Index()
  health_status: 'healthy' | 'warning' | 'unhealthy' | null;

  /**
   * Human-readable reason for the current health status
   */
  @Column({ name: 'health_reason', type: 'text', nullable: true })
  health_reason: string | null;

  /**
   * Timestamp of the last health check
   */
  @Column({ name: 'health_last_checked', type: 'timestamp', nullable: true })
  health_last_checked: Date | null;

  /**
   * Deployment type: 'local' (platform-managed Docker) or 'remote' (self-hosted Agent)
   */
  @Column({
    name: 'deployment_type',
    type: 'enum',
    enum: ['local', 'remote'],
    default: 'local'
  })
  @Index()
  deployment_type: 'local' | 'remote';

  /**
   * Remote instance hostname/IP (only for remote instances)
   */
  @Column({ name: 'remote_host', type: 'varchar', nullable: true })
  remote_host: string;

  /**
   * Remote instance port (only for remote instances)
   */
  @Column({ name: 'remote_port', type: 'integer', nullable: true })
  remote_port: number;

  /**
   * OpenClaw Agent version (only for remote instances)
   */
  @Column({ name: 'remote_version', type: 'varchar', nullable: true })
  remote_version: string;

  /**
   * Platform API key assigned to this remote instance
   * Used for authentication when instance registers and sends heartbeats
   */
  @Column({ name: 'platform_api_key', type: 'varchar', nullable: true })
  platform_api_key: string;

  /**
   * Timestamp of the last heartbeat received from remote instance
   */
  @Column({ name: 'last_heartbeat_at', type: 'timestamp', nullable: true })
  @Index()
  last_heartbeat_at: Date;

  /**
   * Heartbeat interval in milliseconds (default: 30000ms)
   */
  @Column({ name: 'heartbeat_interval', type: 'integer', default: 30000 })
  heartbeat_interval: number;

  /**
   * Remote instance capabilities (e.g., ['chat', 'web_search', 'code_execution'])
   */
  @Column({ name: 'capabilities', type: 'text', nullable: true })
  capabilities: string;

  /**
   * Additional metadata for remote instances
   */
  @Column({ name: 'remote_metadata', type: 'jsonb', nullable: true })
  remote_metadata: Record<string, any>;
}
