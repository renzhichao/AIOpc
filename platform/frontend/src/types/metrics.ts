/**
 * Metrics and monitoring type definitions
 */

/**
 * Metric data point
 */
export interface MetricDataPoint {
  timestamp: string;
  value: number;
}

/**
 * Time series metric data
 */
export interface TimeSeriesMetric {
  metric_name: string;
  data_points: MetricDataPoint[];
  unit: string;
  min_value: number;
  max_value: number;
  avg_value: number;
  current_value: number;
}

/**
 * Instance metrics response
 */
export interface InstanceMetricsResponse {
  success: boolean;
  data: {
    instance_id: string;
    start_time: string;
    end_time: string;
    period_minutes: number;
    metrics: {
      cpu: TimeSeriesMetric;
      memory: TimeSeriesMetric;
      network_rx: TimeSeriesMetric;
      network_tx: TimeSeriesMetric;
      disk_read: TimeSeriesMetric;
      disk_write: TimeSeriesMetric;
    };
  };
}

/**
 * Real-time instance metrics
 */
export interface RealtimeMetrics {
  instance_id: string;
  cpu_percent: number;
  memory_percent: number;
  memory_used_mb: number;
  memory_total_mb: number;
  network_rx_bytes: number;
  network_tx_bytes: number;
  disk_read_bytes: number;
  disk_write_bytes: number;
  timestamp: string;
}

/**
 * Chart data format for Recharts
 */
export interface ChartDataPoint {
  timestamp: string;
  [key: string]: string | number;
}

/**
 * Metrics period preset
 */
export type MetricsPeriod = '30m' | '1h' | '6h' | '24h' | '7d' | '30d';

/**
 * Metrics query parameters
 */
export interface MetricsQueryParams {
  start_time?: string;
  end_time?: string;
  period?: MetricsPeriod;
  aggregate?: 'raw' | '1m' | '5m' | '15m' | '1h' | '1d';
}
