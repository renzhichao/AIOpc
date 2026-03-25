/**
 * MetricsCharts Component Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MetricsCharts } from './MetricsCharts';

// Mock fetch
global.fetch = vi.fn();

describe('MetricsCharts Component', () => {
  const mockInstanceId = 'test-instance-123';

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('access_token', 'test-token');
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should render loading state initially', () => {
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          instance_id: mockInstanceId,
          start_time: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
          end_time: new Date().toISOString(),
          period_minutes: 30,
          metrics: {
            cpu: {
              metric_name: 'cpu',
              data_points: [],
              unit: 'percent',
              min_value: 0,
              max_value: 100,
              avg_value: 50,
              current_value: 55,
            },
            memory: {
              metric_name: 'memory',
              data_points: [],
              unit: 'percent',
              min_value: 0,
              max_value: 100,
              avg_value: 60,
              current_value: 65,
            },
            network_rx: null,
            network_tx: null,
            disk_read: null,
            disk_write: null,
          },
        },
      }),
    });

    render(<MetricsCharts instanceId={mockInstanceId} />);

    // Check for loading skeletons
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('should display CPU usage chart', async () => {
    const mockData = {
      success: true,
      data: {
        instance_id: mockInstanceId,
        start_time: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        end_time: new Date().toISOString(),
        period_minutes: 30,
        metrics: {
          cpu: {
            metric_name: 'cpu',
            data_points: [
              { timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(), value: 45.5 },
              { timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(), value: 52.3 },
              { timestamp: new Date().toISOString(), value: 48.7 },
            ],
            unit: 'percent',
            min_value: 45,
            max_value: 53,
            avg_value: 48.8,
            current_value: 48.7,
          },
          memory: null,
          network_rx: null,
          network_tx: null,
          disk_read: null,
          disk_write: null,
        },
      },
    };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockData,
    });

    render(<MetricsCharts instanceId={mockInstanceId} />);

    await waitFor(() => {
      expect(screen.getByText('CPU 使用率')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText(/当前:/)).toBeInTheDocument();
      expect(screen.getByText(/平均:/)).toBeInTheDocument();
      expect(screen.getByText(/峰值:/)).toBeInTheDocument();
    });
  });

  it('should display memory usage chart', async () => {
    const mockData = {
      success: true,
      data: {
        instance_id: mockInstanceId,
        start_time: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        end_time: new Date().toISOString(),
        period_minutes: 30,
        metrics: {
          cpu: null,
          memory: {
            metric_name: 'memory',
            data_points: [
              { timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(), value: 65.2 },
              { timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(), value: 68.1 },
              { timestamp: new Date().toISOString(), value: 63.8 },
            ],
            unit: 'percent',
            min_value: 63,
            max_value: 69,
            avg_value: 65.7,
            current_value: 63.8,
          },
          network_rx: null,
          network_tx: null,
          disk_read: null,
          disk_write: null,
        },
      },
    };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockData,
    });

    render(<MetricsCharts instanceId={mockInstanceId} />);

    await waitFor(() => {
      expect(screen.getByText('内存使用率')).toBeInTheDocument();
    });
  });

  it('should display network I/O chart', async () => {
    const mockData = {
      success: true,
      data: {
        instance_id: mockInstanceId,
        start_time: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        end_time: new Date().toISOString(),
        period_minutes: 30,
        metrics: {
          cpu: null,
          memory: null,
          network_rx: {
            metric_name: 'network_rx',
            data_points: [
              { timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(), value: 1024000 },
              { timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(), value: 2048000 },
              { timestamp: new Date().toISOString(), value: 1536000 },
            ],
            unit: 'bytes/s',
            min_value: 1024000,
            max_value: 2048000,
            avg_value: 1533333,
            current_value: 1536000,
          },
          network_tx: {
            metric_name: 'network_tx',
            data_points: [
              { timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(), value: 512000 },
              { timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(), value: 1024000 },
              { timestamp: new Date().toISOString(), value: 768000 },
            ],
            unit: 'bytes/s',
            min_value: 512000,
            max_value: 1024000,
            avg_value: 768000,
            current_value: 768000,
          },
          disk_read: null,
          disk_write: null,
        },
      },
    };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockData,
    });

    render(<MetricsCharts instanceId={mockInstanceId} />);

    await waitFor(() => {
      expect(screen.getByText('网络 I/O')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText(/接收:/)).toBeInTheDocument();
      expect(screen.getByText(/发送:/)).toBeInTheDocument();
    });
  });

  it('should display disk I/O chart', async () => {
    const mockData = {
      success: true,
      data: {
        instance_id: mockInstanceId,
        start_time: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        end_time: new Date().toISOString(),
        period_minutes: 30,
        metrics: {
          cpu: null,
          memory: null,
          network_rx: null,
          network_tx: null,
          disk_read: {
            metric_name: 'disk_read',
            data_points: [
              { timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(), value: 512000 },
              { timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(), value: 1024000 },
              { timestamp: new Date().toISOString(), value: 768000 },
            ],
            unit: 'bytes/s',
            min_value: 512000,
            max_value: 1024000,
            avg_value: 768000,
            current_value: 768000,
          },
          disk_write: {
            metric_name: 'disk_write',
            data_points: [
              { timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(), value: 256000 },
              { timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(), value: 512000 },
              { timestamp: new Date().toISOString(), value: 384000 },
            ],
            unit: 'bytes/s',
            min_value: 256000,
            max_value: 512000,
            avg_value: 384000,
            current_value: 384000,
          },
        },
      },
    };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockData,
    });

    render(<MetricsCharts instanceId={mockInstanceId} />);

    await waitFor(() => {
      expect(screen.getByText('磁盘 I/O')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText(/读取:/)).toBeInTheDocument();
      expect(screen.getByText(/写入:/)).toBeInTheDocument();
    });
  });

  it('should handle API errors gracefully', async () => {
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global.fetch as any).mockRejectedValue(new Error('Network error'));

    render(<MetricsCharts instanceId={mockInstanceId} />);

    await waitFor(() => {
      expect(screen.getByText('加载失败')).toBeInTheDocument();
    });
  });

  it('should refetch data at specified interval', async () => {
    let fetchCount = 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global.fetch as any).mockImplementation(() => {
      fetchCount++;
      return Promise.resolve({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            instance_id: mockInstanceId,
            start_time: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
            end_time: new Date().toISOString(),
            period_minutes: 30,
            metrics: { cpu: null, memory: null, network_rx: null, network_tx: null, disk_read: null, disk_write: null },
          },
        }),
      });
    });

    render(<MetricsCharts instanceId={mockInstanceId} refreshInterval={100} />);

    // Initial fetch happens immediately
    await waitFor(() => {
      expect(fetchCount).toBeGreaterThanOrEqual(1);
    });

    // Wait for the interval to trigger at least one more fetch
    await waitFor(() => {
      expect(fetchCount).toBeGreaterThanOrEqual(2);
    }, { timeout: 1000 });
  });
});
