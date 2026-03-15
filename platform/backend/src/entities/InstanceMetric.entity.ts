/**
 * Instance Metric Entity
 *
 * Stores time-series metrics for OpenClaw instances including:
 * - Container metrics (CPU usage, memory usage)
 * - API metrics (message count, token usage)
 * - Performance metrics (response time, error rate)
 *
 * Metrics are collected every 5 minutes by MetricsCollectionService
 * and aggregated for reporting and visualization.
 */

import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { Instance } from './Instance.entity';

@Entity('instance_metrics')
@Index(['instance_id', 'recorded_at'])
@Index(['metric_type', 'recorded_at'])
export class InstanceMetric {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'instance_id', length: 255 })
  instance_id: string;

  @ManyToOne(() => Instance, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'instance_id' })
  instance: Instance;

  /**
   * Metric type identifier
   * - cpu_usage: CPU usage percentage
   * - memory_usage: Memory usage in MB
   * - message_count: Number of messages sent
   * - token_usage: Number of tokens consumed
   */
  @Column({ name: 'metric_type', length: 50 })
  metric_type: 'cpu_usage' | 'memory_usage' | 'message_count' | 'token_usage';

  /**
   * Metric value
   * - cpu_usage: percentage (0-100)
   * - memory_usage: megabytes
   * - message_count: count
   * - token_usage: count
   */
  @Column({ name: 'metric_value', type: 'numeric' })
  metric_value: number;

  /**
   * Unit of measurement
   * - percent: for cpu_usage
   * - mb: for memory_usage
   * - count: for message_count and token_usage
   */
  @Column({ name: 'unit', length: 20, nullable: true })
  unit: 'percent' | 'mb' | 'count' | null;

  /**
   * Timestamp when the metric was recorded
   */
  @Column({ name: 'recorded_at', type: 'timestamp' })
  recorded_at: Date;

  /**
   * Creation timestamp (automatically managed)
   */
  @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;
}
