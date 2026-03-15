import { MetricsService } from '../MetricsService';
import { InstanceMetricRepository } from '../../repositories/InstanceMetricRepository';
import { InstanceRepository } from '../../repositories/InstanceRepository';
import { AppError } from '../../utils/errors/AppError';
import { Container } from 'typedi';

describe('MetricsService', () => {
  let metricsService: MetricsService;
  let metricRepository: jest.Mocked<InstanceMetricRepository>;
  let instanceRepository: jest.Mocked<InstanceRepository>;

  beforeEach(() => {
    // Create mock repositories
    metricRepository = {
      getUsageStats: jest.fn(),
      getLatestMetric: jest.fn(),
      findByInstanceAndType: jest.fn(),
      aggregateByHour: jest.fn(),
      aggregateByDay: jest.fn(),
    } as any;

    instanceRepository = {
      findByInstanceId: jest.fn(),
    } as any;

    // Set up container
    Container.set('InstanceMetricRepository', metricRepository);
    Container.set('InstanceRepository', instanceRepository);

    metricsService = new MetricsService(metricRepository, instanceRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getUsageStats', () => {
    it('should return usage statistics for a valid instance', async () => {
      const mockInstance = { instance_id: 'test-instance-1' };
      const mockStats = {
        total_messages: 100,
        total_tokens: 50000,
        avg_cpu_usage: 45.5,
        avg_memory_usage: 512,
        max_cpu_usage: 80,
        max_memory_usage: 1024,
      };

      (instanceRepository.findByInstanceId as jest.Mock).mockResolvedValue(mockInstance);
      (metricRepository.getUsageStats as jest.Mock).mockResolvedValue(mockStats);
      (metricRepository.aggregateByHour as jest.Mock)
        .mockResolvedValueOnce([
          { hour: new Date('2026-03-15T10:00:00Z'), avg_value: 40, max_value: 60, min_value: 30 },
        ])
        .mockResolvedValueOnce([
          { hour: new Date('2026-03-15T10:00:00Z'), avg_value: 500, max_value: 600, min_value: 400 },
        ]);

      const result = await metricsService.getUsageStats('test-instance-1', 'day');

      expect(result).toEqual({
        instance_id: 'test-instance-1',
        period: 'day',
        total_messages: 100,
        total_tokens: 50000,
        avg_cpu_usage: 45.5,
        avg_memory_usage: 512,
        max_cpu_usage: 80,
        max_memory_usage: 1024,
        hourly_data: [
          {
            timestamp: new Date('2026-03-15T10:00:00Z'),
            cpu_usage: 40,
            memory_usage: 500,
          },
        ],
      });
    });

    it('should throw AppError when instance not found', async () => {
      (instanceRepository.findByInstanceId as jest.Mock).mockResolvedValue(null);

      await expect(metricsService.getUsageStats('non-existent', 'day')).rejects.toThrow();
      await expect(metricsService.getUsageStats('non-existent', 'day')).rejects.toThrow('Instance non-existent not found');
    });

    it('should handle missing hourly data gracefully', async () => {
      const mockInstance = { instance_id: 'test-instance-1' };
      const mockStats = {
        total_messages: 0,
        total_tokens: 0,
        avg_cpu_usage: 0,
        avg_memory_usage: 0,
        max_cpu_usage: 0,
        max_memory_usage: 0,
      };

      (instanceRepository.findByInstanceId as jest.Mock).mockResolvedValue(mockInstance);
      (metricRepository.getUsageStats as jest.Mock).mockResolvedValue(mockStats);
      (metricRepository.aggregateByHour as jest.Mock).mockResolvedValue([]);

      const result = await metricsService.getUsageStats('test-instance-1', 'hour');

      expect(result.hourly_data).toEqual([]);
    });
  });

  describe('getHealthStatus', () => {
    it('should return healthy status when resources are normal', async () => {
      const mockInstance = { instance_id: 'test-instance-1', status: 'running' };
      const mockCpuMetric = { metric_value: 45 }; // 45% CPU - normal
      const mockMemoryMetric = { metric_value: 50 }; // 50% memory - normal

      (instanceRepository.findByInstanceId as jest.Mock).mockResolvedValue(mockInstance);
      (metricRepository.getLatestMetric as jest.Mock)
        .mockResolvedValueOnce(mockCpuMetric)
        .mockResolvedValueOnce(mockMemoryMetric);

      const result = await metricsService.getHealthStatus('test-instance-1');

      expect(result).toMatchObject({
        instance_id: 'test-instance-1',
        healthy: true,
        container_status: 'running',
        cpu_status: 'normal',
        memory_status: 'normal',
      });
      expect(result.last_check).toBeInstanceOf(Date);
    });

    it('should return warning status when CPU is high', async () => {
      const mockInstance = { instance_id: 'test-instance-1', status: 'running' };
      const mockCpuMetric = { metric_value: 75 }; // 75% CPU - warning
      const mockMemoryMetric = { metric_value: 85 }; // 85% memory - warning

      (instanceRepository.findByInstanceId as jest.Mock).mockResolvedValue(mockInstance);
      (metricRepository.getLatestMetric as jest.Mock)
        .mockResolvedValueOnce(mockCpuMetric)
        .mockResolvedValueOnce(mockMemoryMetric);

      const result = await metricsService.getHealthStatus('test-instance-1');

      expect(result.cpu_status).toBe('warning');
      expect(result.memory_status).toBe('warning');
      expect(result.healthy).toBe(true);
    });

    it('should return critical status when CPU is very high', async () => {
      const mockInstance = { instance_id: 'test-instance-1', status: 'running' };
      const mockCpuMetric = { metric_value: 95 }; // 95% CPU - critical
      const mockMemoryMetric = { metric_value: 50 }; // 50% memory - normal

      (instanceRepository.findByInstanceId as jest.Mock).mockResolvedValue(mockInstance);
      (metricRepository.getLatestMetric as jest.Mock)
        .mockResolvedValueOnce(mockCpuMetric)
        .mockResolvedValueOnce(mockMemoryMetric);

      const result = await metricsService.getHealthStatus('test-instance-1');

      expect(result.cpu_status).toBe('critical');
      expect(result.healthy).toBe(false);
    });

    it('should throw AppError when instance not found', async () => {
      (instanceRepository.findByInstanceId as jest.Mock).mockResolvedValue(null);

      await expect(metricsService.getHealthStatus('non-existent')).rejects.toThrow();
    });
  });

  describe('getTimeSeriesData', () => {
    it('should return time series data for a specific metric', async () => {
      const mockInstance = { instance_id: 'test-instance-1' };
      const mockMetrics = [
        { recorded_at: new Date('2026-03-15T10:00:00Z'), metric_value: 45 },
        { recorded_at: new Date('2026-03-15T11:00:00Z'), metric_value: 50 },
      ];

      (instanceRepository.findByInstanceId as jest.Mock).mockResolvedValue(mockInstance);
      (metricRepository.findByInstanceAndType as jest.Mock).mockResolvedValue(mockMetrics);

      const result = await metricsService.getTimeSeriesData('test-instance-1', 'cpu_usage', 'day');

      expect(result).toEqual({
        metric_type: 'cpu_usage',
        data: [
          { timestamp: new Date('2026-03-15T10:00:00Z'), value: 45 },
          { timestamp: new Date('2026-03-15T11:00:00Z'), value: 50 },
        ],
      });
    });

    it('should throw AppError when instance not found', async () => {
      (instanceRepository.findByInstanceId as jest.Mock).mockResolvedValue(null);

      await expect(
        metricsService.getTimeSeriesData('non-existent', 'cpu_usage', 'day')
      ).rejects.toThrow(AppError);
    });
  });

  describe('getHourlyMetrics', () => {
    it('should return hourly aggregated metrics', async () => {
      const mockData = [
        { hour: new Date('2026-03-15T10:00:00Z'), avg_value: 45, max_value: 60, min_value: 30 },
      ];

      (metricRepository.aggregateByHour as jest.Mock).mockResolvedValue(mockData);

      const result = await metricsService.getHourlyMetrics(
        'test-instance-1',
        'cpu_usage',
        new Date('2026-03-15T00:00:00Z'),
        new Date('2026-03-15T23:59:59Z')
      );

      expect(result).toEqual(mockData);
      expect(metricRepository.aggregateByHour).toHaveBeenCalledWith(
        'test-instance-1',
        'cpu_usage',
        expect.any(Date),
        expect.any(Date)
      );
    });
  });

  describe('getDailyMetrics', () => {
    it('should return daily aggregated metrics', async () => {
      const mockData = [
        {
          day: new Date('2026-03-15T00:00:00Z'),
          avg_value: 50,
          max_value: 80,
          min_value: 20,
          total_value: 1200,
        },
      ];

      (metricRepository.aggregateByDay as jest.Mock).mockResolvedValue(mockData);

      const result = await metricsService.getDailyMetrics(
        'test-instance-1',
        'cpu_usage',
        new Date('2026-03-15T00:00:00Z'),
        new Date('2026-03-15T23:59:59Z')
      );

      expect(result).toEqual(mockData);
      expect(metricRepository.aggregateByDay).toHaveBeenCalledWith(
        'test-instance-1',
        'cpu_usage',
        expect.any(Date),
        expect.any(Date)
      );
    });
  });
});
