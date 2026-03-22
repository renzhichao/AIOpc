/**
 * Metrics Service
 *
 * Handles fetching metrics data from the backend API.
 * Supports time-series data for CPU, memory, network, and disk I/O.
 */

import type {
  InstanceMetricsResponse,
  RealtimeMetrics,
  MetricsQueryParams,
  MetricsPeriod,
} from '../types/metrics';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

/**
 * From localStorage get Token
 */
function getToken(): string {
  const token = localStorage.getItem('access_token') || localStorage.getItem('auth_token');
  if (!token) {
    throw new Error('No authentication token found');
  }
  return token;
}

/**
 * Handle API errors
 */
function handleApiError(response: Response): never {
  throw new Error(`API error: ${response.status} ${response.statusText}`);
}

export class MetricsService {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Fetch instance metrics for a time period
   */
  async getInstanceMetrics(
    instanceId: string,
    params?: MetricsQueryParams
  ): Promise<InstanceMetricsResponse['data']> {
    const queryParams = new URLSearchParams();

    if (params?.period) {
      queryParams.append('period', params.period);
    }
    if (params?.start_time) {
      queryParams.append('start_time', params.start_time);
    }
    if (params?.end_time) {
      queryParams.append('end_time', params.end_time);
    }
    if (params?.aggregate) {
      queryParams.append('aggregate', params.aggregate);
    }

    const url = `${this.baseUrl}/v1/instances/${instanceId}/metrics${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      handleApiError(response);
    }

    const result: InstanceMetricsResponse = await response.json();
    return result.data;
  }

  /**
   * Fetch real-time metrics for an instance
   */
  async getRealtimeMetrics(instanceId: string): Promise<RealtimeMetrics> {
    const response = await fetch(
      `${this.baseUrl}/v1/instances/${instanceId}/metrics/realtime`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      handleApiError(response);
    }

    return response.json();
  }

  /**
   * Fetch metrics summary (aggregated data)
   */
  async getMetricsSummary(
    instanceId: string,
    period: MetricsPeriod = '30m'
  ): Promise<{
    cpu_avg: number;
    cpu_max: number;
    memory_avg: number;
    memory_max: number;
    network_rx_total: number;
    network_tx_total: number;
    disk_read_total: number;
    disk_write_total: number;
  }> {
    const response = await fetch(
      `${this.baseUrl}/v1/instances/${instanceId}/metrics/summary?period=${period}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      handleApiError(response);
    }

    return response.json();
  }

  /**
   * Fetch metrics for multiple instances (batch)
   */
  async getBatchMetrics(
    instanceIds: string[],
    period: MetricsPeriod = '30m'
  ): Promise<Map<string, RealtimeMetrics>> {
    const response = await fetch(
      `${this.baseUrl}/v1/metrics/batch?period=${period}&instance_ids=${instanceIds.join(',')}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      handleApiError(response);
    }

    const data = await response.json();
    return new Map(Object.entries(data.data));
  }
}

// Export singleton instance
export const metricsService = new MetricsService();
