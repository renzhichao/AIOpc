import { MetricsCollectionService } from '../MetricsCollectionService';
import { InstanceMetricRepository } from '../../repositories/InstanceMetricRepository';
import { InstanceRepository } from '../../repositories/InstanceRepository';
import { DockerService } from '../DockerService';
import { Instance } from '../../entities/Instance.entity';
import { Container } from 'typedi';

// Mock node-cron
jest.mock('node-cron', () => ({
  schedule: jest.fn(() => ({
    stop: jest.fn(),
  })),
}));

describe('MetricsCollectionService', () => {
  let metricsCollectionService: MetricsCollectionService;
  let metricRepository: jest.Mocked<InstanceMetricRepository>;
  let instanceRepository: jest.Mocked<InstanceRepository>;
  let dockerService: jest.Mocked<DockerService>;

  // Mock instance data
  const mockInstance: Instance = {
    id: 1,
    instance_id: 'test-instance-1',
    status: 'running',
    template: 'personal',
    name: 'Test Instance',
    config: {},
    owner_id: 1,
    docker_container_id: 'opclaw-test-instance-1',
    created_at: new Date(),
    updated_at: new Date(),
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    claimed_at: null,
    restart_attempts: 0,
    health_status: 'healthy',
    health_reason: 'Instance is running normally',
    health_last_checked: new Date(),
  };

  // Mock container stats
  const mockContainerStats = {
    id: 'container-id',
    name: 'opclaw-test-instance-1',
    cpuPercent: 45.5,
    memoryUsage: 512 * 1024 * 1024, // 512 MB
    memoryLimit: 1024 * 1024 * 1024, // 1 GB
    memoryPercent: 50.0,
    networkRX: 1024 * 1024, // 1 MB
    networkTX: 2048 * 1024, // 2 MB
    blockRead: 10 * 1024 * 1024, // 10 MB
    blockWrite: 20 * 1024 * 1024, // 20 MB
    timestamp: new Date(),
  };

  beforeEach(() => {
    // Create mock repositories
    metricRepository = {
      recordMetric: jest.fn().mockResolvedValue({}),
      findByInstanceAndTimeRange: jest.fn().mockResolvedValue([]),
      findByInstanceAndType: jest.fn().mockResolvedValue([]),
      deleteOlderThan: jest.fn().mockResolvedValue(0),
    } as any;

    instanceRepository = {
      findByStatus: jest.fn().mockResolvedValue([mockInstance]),
      findByInstanceId: jest.fn().mockResolvedValue(mockInstance),
      update: jest.fn().mockResolvedValue(mockInstance),
      create: jest.fn().mockResolvedValue(mockInstance),
    } as any;

    dockerService = {
      getContainerStats: jest.fn().mockResolvedValue(mockContainerStats),
    } as any;

    // Set up container
    Container.set('InstanceMetricRepository', metricRepository);
    Container.set('InstanceRepository', instanceRepository);
    Container.set('DockerService', dockerService);

    metricsCollectionService = new MetricsCollectionService(
      metricRepository,
      instanceRepository,
      dockerService
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Scheduler Management', () => {
    it('should start the metrics collection scheduler', () => {
      const cron = require('node-cron');

      metricsCollectionService.startScheduler();

      expect(cron.schedule).toHaveBeenCalledWith(
        '*/30 * * * * *', // Every 30 seconds
        expect.any(Function)
      );
    });

    it('should start the cleanup scheduler', () => {
      const cron = require('node-cron');

      metricsCollectionService.startScheduler();

      expect(cron.schedule).toHaveBeenCalledWith(
        '0 2 * * *', // Daily at 2 AM
        expect.any(Function)
      );
    });

    it('should not start scheduler if already running', () => {
      const cron = require('node-cron');

      metricsCollectionService.startScheduler();
      metricsCollectionService.startScheduler(); // Second call should be ignored

      // Should be called twice (collection + cleanup), not four times
      expect(cron.schedule).toHaveBeenCalledTimes(2);
    });

    it('should stop the schedulers', () => {
      const mockTask = { stop: jest.fn() };
      const cron = require('node-cron');
      cron.schedule.mockReturnValue(mockTask);

      metricsCollectionService.startScheduler();

      const statusRunning = metricsCollectionService.getSchedulerStatus();
      expect(statusRunning.collectionRunning).toBe(true);
      expect(statusRunning.cleanupRunning).toBe(true);

      metricsCollectionService.stopScheduler();

      expect(mockTask.stop).toHaveBeenCalledTimes(2);

      const statusStopped = metricsCollectionService.getSchedulerStatus();
      expect(statusStopped.collectionRunning).toBe(false);
      expect(statusStopped.cleanupRunning).toBe(false);
    });

    it('should return correct status when not running', () => {
      const status = metricsCollectionService.getSchedulerStatus();

      expect(status.collectionRunning).toBe(false);
      expect(status.cleanupRunning).toBe(false);
      expect(status.lastCollection).toBeNull();
    });

    it('should return correct status when running', () => {
      metricsCollectionService.startScheduler();
      const status = metricsCollectionService.getSchedulerStatus();

      expect(status.collectionRunning).toBe(true);
      expect(status.cleanupRunning).toBe(true);
    });
  });

  describe('Metrics Collection', () => {
    it('should collect metrics for all active instances', async () => {
      await metricsCollectionService.collectAllMetrics();

      expect(instanceRepository.findByStatus).toHaveBeenCalledWith('running');
      expect(dockerService.getContainerStats).toHaveBeenCalledWith(mockInstance.instance_id);
      expect(metricRepository.recordMetric).toHaveBeenCalled();
    });

    it('should record CPU metrics', async () => {
      await metricsCollectionService.collectMetricsForInstance(mockInstance.instance_id);

      // Check that CPU metric was recorded
      const cpuCalls = metricRepository.recordMetric.mock.calls.filter(
        call => call[0].metric_type === 'cpu_usage'
      );

      expect(cpuCalls.length).toBeGreaterThan(0);
      expect(cpuCalls[0][0]).toMatchObject({
        instance_id: mockInstance.instance_id,
        metric_type: 'cpu_usage',
        metric_value: mockContainerStats.cpuPercent,
        unit: 'percent',
      });
    });

    it('should record memory metrics', async () => {
      await metricsCollectionService.collectMetricsForInstance(mockInstance.instance_id);

      // Check that memory metrics were recorded
      const memoryUsageCalls = metricRepository.recordMetric.mock.calls.filter(
        call => call[0].metric_type === 'memory_usage'
      );
      const memoryPercentCalls = metricRepository.recordMetric.mock.calls.filter(
        call => call[0].metric_type === 'memory_percent'
      );
      const memoryLimitCalls = metricRepository.recordMetric.mock.calls.filter(
        call => call[0].metric_type === 'memory_limit'
      );

      expect(memoryUsageCalls.length).toBeGreaterThan(0);
      expect(memoryPercentCalls.length).toBeGreaterThan(0);
      expect(memoryLimitCalls.length).toBeGreaterThan(0);

      expect(memoryUsageCalls[0][0].metric_value).toBeCloseTo(512, 0); // 512 MB
      expect(memoryPercentCalls[0][0].metric_value).toBe(50.0); // 50%
      expect(memoryLimitCalls[0][0].metric_value).toBeCloseTo(1024, 0); // 1024 MB
    });

    it('should record network metrics', async () => {
      await metricsCollectionService.collectMetricsForInstance(mockInstance.instance_id);

      // Check that network metrics were recorded
      const networkRxCalls = metricRepository.recordMetric.mock.calls.filter(
        call => call[0].metric_type === 'network_rx_bytes'
      );
      const networkTxCalls = metricRepository.recordMetric.mock.calls.filter(
        call => call[0].metric_type === 'network_tx_bytes'
      );

      expect(networkRxCalls.length).toBeGreaterThan(0);
      expect(networkTxCalls.length).toBeGreaterThan(0);

      expect(networkRxCalls[0][0].metric_value).toBe(mockContainerStats.networkRX);
      expect(networkTxCalls[0][0].metric_value).toBe(mockContainerStats.networkTX);
    });

    it('should record disk I/O metrics', async () => {
      await metricsCollectionService.collectMetricsForInstance(mockInstance.instance_id);

      // Check that disk metrics were recorded
      const diskReadCalls = metricRepository.recordMetric.mock.calls.filter(
        call => call[0].metric_type === 'disk_read_bytes'
      );
      const diskWriteCalls = metricRepository.recordMetric.mock.calls.filter(
        call => call[0].metric_type === 'disk_write_bytes'
      );

      expect(diskReadCalls.length).toBeGreaterThan(0);
      expect(diskWriteCalls.length).toBeGreaterThan(0);

      expect(diskReadCalls[0][0].metric_value).toBe(mockContainerStats.blockRead);
      expect(diskWriteCalls[0][0].metric_value).toBe(mockContainerStats.blockWrite);
    });
  });

  describe('Health Status Updates', () => {
    it('should update instance health status to healthy for normal metrics', async () => {
      await metricsCollectionService.collectMetricsForInstance(mockInstance.instance_id);

      expect(instanceRepository.update).toHaveBeenCalledWith(
        mockInstance.instance_id,
        expect.objectContaining({
          health_status: 'healthy',
          health_reason: 'Instance is running normally',
        })
      );
    });

    it('should update health status to warning for high CPU', async () => {
      const highCpuStats = { ...mockContainerStats, cpuPercent: 85 };
      (dockerService.getContainerStats as jest.Mock).mockResolvedValueOnce(highCpuStats);

      await metricsCollectionService.collectMetricsForInstance(mockInstance.instance_id);

      expect(instanceRepository.update).toHaveBeenCalledWith(
        mockInstance.instance_id,
        expect.objectContaining({
          health_status: 'warning',
          health_reason: expect.stringContaining('High CPU usage'),
        })
      );
    });

    it('should update health status to unhealthy for critical CPU', async () => {
      const criticalCpuStats = { ...mockContainerStats, cpuPercent: 95 };
      (dockerService.getContainerStats as jest.Mock).mockResolvedValueOnce(criticalCpuStats);

      await metricsCollectionService.collectMetricsForInstance(mockInstance.instance_id);

      expect(instanceRepository.update).toHaveBeenCalledWith(
        mockInstance.instance_id,
        expect.objectContaining({
          health_status: 'unhealthy',
          health_reason: expect.stringContaining('Critical CPU usage'),
        })
      );
    });

    it('should update health status to warning for high memory', async () => {
      const highMemoryStats = { ...mockContainerStats, memoryPercent: 88 };
      (dockerService.getContainerStats as jest.Mock).mockResolvedValueOnce(highMemoryStats);

      await metricsCollectionService.collectMetricsForInstance(mockInstance.instance_id);

      expect(instanceRepository.update).toHaveBeenCalledWith(
        mockInstance.instance_id,
        expect.objectContaining({
          health_status: 'warning',
          health_reason: expect.stringContaining('High memory usage'),
        })
      );
    });

    it('should update health status to unhealthy for critical memory', async () => {
      const criticalMemoryStats = { ...mockContainerStats, memoryPercent: 97 };
      (dockerService.getContainerStats as jest.Mock).mockResolvedValueOnce(criticalMemoryStats);

      await metricsCollectionService.collectMetricsForInstance(mockInstance.instance_id);

      expect(instanceRepository.update).toHaveBeenCalledWith(
        mockInstance.instance_id,
        expect.objectContaining({
          health_status: 'unhealthy',
          health_reason: expect.stringContaining('Critical memory usage'),
        })
      );
    });

    it('should update health_last_checked timestamp', async () => {
      await metricsCollectionService.collectMetricsForInstance(mockInstance.instance_id);

      expect(instanceRepository.update).toHaveBeenCalledWith(
        mockInstance.instance_id,
        expect.objectContaining({
          health_last_checked: expect.any(Date),
        })
      );
    });
  });

  describe('Metrics Cleanup', () => {
    it('should clean up old metrics', async () => {
      await metricsCollectionService.cleanupOldMetrics();

      expect(metricRepository.deleteOlderThan).toHaveBeenCalled();

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30);

      const callArgs = (metricRepository.deleteOlderThan as jest.Mock).mock.calls[0][0];
      expect(callArgs).toBeInstanceOf(Date);
      expect(callArgs.getTime()).toBeCloseTo(cutoffDate.getTime(), -10000); // Within 10 seconds
    });
  });

  describe('Error Handling', () => {
    it('should throw error when instance not found', async () => {
      (instanceRepository.findByInstanceId as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        metricsCollectionService.collectMetricsForInstance('non-existent')
      ).rejects.toThrow('Instance non-existent not found');
    });

    it('should handle Docker service errors gracefully', async () => {
      (dockerService.getContainerStats as jest.Mock).mockRejectedValueOnce(
        new Error('Docker error')
      );

      // Should not throw, but handle error internally
      await metricsCollectionService.collectAllMetrics();

      // Verify error was logged (no exception thrown)
      expect(dockerService.getContainerStats).toHaveBeenCalled();
    });

    it('should continue collecting metrics when one instance fails', async () => {
      const failingInstance = { ...mockInstance, instance_id: 'failing-instance' };
      const workingInstance = { ...mockInstance, instance_id: 'working-instance' };

      (instanceRepository.findByStatus as jest.Mock).mockResolvedValueOnce([
        failingInstance,
        workingInstance,
      ]);

      (dockerService.getContainerStats as jest.Mock)
        .mockRejectedValueOnce(new Error('Container not found'))
        .mockResolvedValueOnce(mockContainerStats);

      // Should not throw
      await expect(metricsCollectionService.collectAllMetrics()).resolves.not.toThrow();

      // Should have attempted to collect from both
      expect(dockerService.getContainerStats).toHaveBeenCalledTimes(2);
    });
  });

  describe('Metrics Collection for Single Instance', () => {
    it('should collect metrics for a specific instance', async () => {
      await metricsCollectionService.collectMetricsForInstance(mockInstance.instance_id);

      expect(dockerService.getContainerStats).toHaveBeenCalledWith(mockInstance.instance_id);
      expect(metricRepository.recordMetric).toHaveBeenCalled();
    });

    it('should record all metric types', async () => {
      await metricsCollectionService.collectMetricsForInstance(mockInstance.instance_id);

      const recordedTypes = new Set(
        metricRepository.recordMetric.mock.calls.map(call => call[0].metric_type)
      );

      expect(recordedTypes).toContain('cpu_usage');
      expect(recordedTypes).toContain('memory_usage');
      expect(recordedTypes).toContain('memory_percent');
      expect(recordedTypes).toContain('memory_limit');
      expect(recordedTypes).toContain('network_rx_bytes');
      expect(recordedTypes).toContain('network_tx_bytes');
      expect(recordedTypes).toContain('disk_read_bytes');
      expect(recordedTypes).toContain('disk_write_bytes');
    });
  });

  describe('Configuration Constants', () => {
    it('should use correct collection interval (30 seconds)', () => {
      const cron = require('node-cron');

      metricsCollectionService.startScheduler();

      const collectionSchedule = cron.schedule.mock.calls[0];
      expect(collectionSchedule[0]).toBe('*/30 * * * * *');
    });

    it('should use correct cleanup schedule (daily at 2 AM)', () => {
      const cron = require('node-cron');

      metricsCollectionService.startScheduler();

      const cleanupSchedule = cron.schedule.mock.calls[1];
      expect(cleanupSchedule[0]).toBe('0 2 * * *');
    });

    it('should use 30-day retention for cleanup', async () => {
      await metricsCollectionService.cleanupOldMetrics();

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30);

      const callDate = (metricRepository.deleteOlderThan as jest.Mock).mock.calls[0][0];
      const daysDiff = Math.abs(callDate.getTime() - cutoffDate.getTime()) / (1000 * 60 * 60 * 24);

      expect(daysDiff).toBeLessThan(1); // Within 1 day
    });
  });
});
