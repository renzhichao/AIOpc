/**
 * Instance Metric Entity
 *
 * Stores time-series metrics for OpenClaw instances including:
 * - Container metrics (CPU usage, memory usage, network, disk I/O)
 * - API metrics (message count, token usage)
 * - Performance metrics (response time, error rate)
 *
 * Metrics are collected every 30 seconds by MetricsCollectionService
 * and aggregated for reporting and visualization.
 *
 * Retention: 30 days (automatically cleaned up)
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
   * - memory_percent: Memory usage percentage
   * - memory_limit: Memory limit in MB
   * - network_rx_bytes: Network received bytes
   * - network_tx_bytes: Network transmitted bytes
   * - disk_read_bytes: Disk read bytes
   * - disk_write_bytes: Disk write bytes
   * - message_count: Number of messages sent
   * - token_usage: Number of tokens consumed
   */
  @Column({
    name: 'metric_type',
    length: 50,
    type: 'enum',
    enum: [
      'cpu_usage',
      'memory_usage',
      'memory_percent',
      'memory_limit',
      'network_rx_bytes',
      'network_tx_bytes',
      'disk_read_bytes',
      'disk_write_bytes',
      'message_count',
      'token_usage',
    ]
  })
  metric_type:
    | 'cpu_usage'
    | 'memory_usage'
    | 'memory_percent'
    | 'memory_limit'
    | 'network_rx_bytes'
    | 'network_tx_bytes'
    | 'disk_read_bytes'
    | 'disk_write_bytes'
    | 'message_count'
    | 'token_usage';

  /**
   * Metric value
   * - cpu_usage/memory_percent: percentage (0-100)
   * - memory_usage/memory_limit: megabytes
   * - network/disk: bytes
   * - message_count/token_usage: count
   */
  @Column({ name: 'metric_value', type: 'numeric' })
  metric_value: number;

  /**
   * Unit of measurement
   * - percent: for cpu_usage, memory_percent
   * - mb: for memory_usage, memory_limit
   * - bytes: for network and disk metrics
   * - count: for message_count and token_usage
   */
  @Column({ name: 'unit', length: 20, nullable: true })
  unit: 'percent' | 'mb' | 'bytes' | 'count' | null;

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
