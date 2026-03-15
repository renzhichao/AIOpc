import { MetricsCollectionService } from '../MetricsCollectionService';
import { InstanceMetricRepository } from '../../repositories/InstanceMetricRepository';
import { InstanceRepository } from '../../repositories/InstanceRepository';
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

  beforeEach(() => {
    // Create mock repositories
    metricRepository = {
      recordMetric: jest.fn(),
    } as any;

    instanceRepository = {
      findByStatus: jest.fn(),
      findByInstanceId: jest.fn(),
    } as any;

    // Set up container
    Container.set('InstanceMetricRepository', metricRepository);
    Container.set('InstanceRepository', instanceRepository);

    metricsCollectionService = new MetricsCollectionService(metricRepository, instanceRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('scheduler management', () => {
    it('should start the cron scheduler', () => {
      const cron = require('node-cron');

      (metricsCollectionService as any).startScheduler();

      expect(cron.schedule).toHaveBeenCalledWith(
        '*/5 * * * *',
        expect.any(Function)
      );
    });

    it('should not start scheduler if already running', () => {
      const cron = require('node-cron');

      (metricsCollectionService as any).startScheduler();
      (metricsCollectionService as any).startScheduler(); // Second call should be ignored

      expect(cron.schedule).toHaveBeenCalledTimes(1);
    });

    it('should stop the cron scheduler', () => {
      (metricsCollectionService as any).startScheduler();

      const statusRunning = (metricsCollectionService as any).getSchedulerStatus();
      expect(statusRunning.running).toBe(true);

      (metricsCollectionService as any).stopScheduler();

      const statusStopped = (metricsCollectionService as any).getSchedulerStatus();
      expect(statusStopped.running).toBe(false);
    });

    it('should return correct status when not running', () => {
      const status = (metricsCollectionService as any).getSchedulerStatus();

      expect(status.running).toBe(false);
    });

    it('should return correct status when running', () => {
      (metricsCollectionService as any).startScheduler();
      const status = (metricsCollectionService as any).getSchedulerStatus();

      expect(status.running).toBe(true);
    });
  });

  describe('collectMetricsForInstance', () => {
    it('should throw error when instance not found', async () => {
      (instanceRepository.findByInstanceId as jest.Mock).mockResolvedValue(null);

      await expect(
        (metricsCollectionService as any).collectMetricsForInstance('non-existent')
      ).rejects.toThrow();
    });

    // Note: Actual metrics collection tests require Docker integration
    // and are better suited for integration tests
  });
});
