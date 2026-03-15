/**
 * Integration Tests for RenewalService
 *
 * These tests use a real database to test instance renewal operations.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { RenewalService } from '../RenewalService';
import { InstanceRenewalRepository } from '../../repositories/InstanceRenewalRepository';
import { InstanceRepository } from '../../repositories/InstanceRepository';
import { AppDataSource } from '../../config/database';
import { InstanceRenewal } from '../../entities/InstanceRenewal.entity';
import { Instance } from '../../entities/Instance.entity';
import { User } from '../../entities/User.entity';

describe('RenewalService Integration Tests', () => {
  let renewalService: RenewalService;
  let renewalRepository: InstanceRenewalRepository;
  let instanceRepository: InstanceRepository;
  let testUser: User;
  let testInstance: Instance;

  // Set up environment variables
  const originalEnv = process.env;

  beforeAll(async () => {
    // Configure test environment
    process.env.DB_HOST = process.env.DB_HOST || 'localhost';
    process.env.DB_PORT = process.env.DB_PORT || '5432';
    process.env.DB_USERNAME = process.env.DB_USERNAME || 'opclaw';
    process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'opclaw';
    process.env.DB_NAME = process.env.DB_NAME || 'opclaw';

    // Initialize database connection
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    // Create repositories
    renewalRepository = new InstanceRenewalRepository(AppDataSource.getRepository(InstanceRenewal));
    instanceRepository = new InstanceRepository(AppDataSource.getRepository(Instance));

    // Create service
    renewalService = new RenewalService(renewalRepository);

    // Create test user
    const userRepository = AppDataSource.getRepository(User);
    testUser = userRepository.create({
      feishu_user_id: `test-user-${Date.now()}`,
      name: 'Test User',
      email: `test-${Date.now()}@example.com`,
    });
    await userRepository.save(testUser);

    // Create test instance
    const initialExpiresAt = new Date();
    initialExpiresAt.setDate(initialExpiresAt.getDate() + 30); // 30 days from now

    testInstance = await instanceRepository.create({
      instance_id: `test-instance-${Date.now()}`,
      owner_id: testUser.id,
      status: 'active',
      template: 'personal',
      config: {
        apiKey: 'test-api-key',
        feishuAppId: 'test-app-id',
        feishuAppSecret: 'test-app-secret',
        skills: ['chat', 'code'],
        systemPrompt: 'Test prompt',
        temperature: 0.7,
        maxTokens: 4000,
      },
      expires_at: initialExpiresAt,
      restart_attempts: 0,
      health_status: {},
    });
  });

  afterAll(async () => {
    // Clean up test data
    const renewalRepo = AppDataSource.getRepository(InstanceRenewal);
    await renewalRepo.delete({});

    if (testInstance) {
      await instanceRepository.delete(testInstance.id);
    }

    if (testUser) {
      const userRepository = AppDataSource.getRepository(User);
      await userRepository.delete(testUser.id);
    }

    // Close database connection
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }

    // Restore environment
    process.env = originalEnv;
  });

  beforeEach(async () => {
    // Clean up renewals before each test
    const renewalRepo = AppDataSource.getRepository(InstanceRenewal);
    await renewalRepo.delete({});
  });

  afterEach(async () => {
    // Clean up renewals after each test
    const renewalRepo = AppDataSource.getRepository(InstanceRenewal);
    await renewalRepo.delete({});
  });

  describe('Renewal Record Creation with Real Database', () => {
    it('should record renewal successfully', async () => {
      const oldExpiresAt = new Date(testInstance.expires_at!);
      const newExpiresAt = new Date(oldExpiresAt);
      newExpiresAt.setDate(newExpiresAt.getDate() + 30); // Extend by 30 days

      const renewal = await renewalService.record({
        instance_id: testInstance.instance_id,
        old_expires_at: oldExpiresAt,
        new_expires_at: newExpiresAt,
        duration_days: 30,
        renewed_by: testUser.id,
      });

      expect(renewal).toBeDefined();
      expect(renewal.id).toBeDefined();
      expect(renewal.instance_id).toBe(testInstance.instance_id);
      expect(renewal.old_expires_at).toEqual(oldExpiresAt);
      expect(renewal.new_expires_at).toEqual(newExpiresAt);
      expect(renewal.duration_days).toBe(30);
      expect(renewal.renewed_by).toBe(testUser.id);
      expect(renewal.renewed_at).toBeDefined();

      // Verify renewal was saved to database
      const renewalRepo = AppDataSource.getRepository(InstanceRenewal);
      const savedRenewal = await renewalRepo.findOne({
        where: { id: renewal.id },
      });

      expect(savedRenewal).toBeDefined();
      expect(savedRenewal!.instance_id).toBe(testInstance.instance_id);
    });

    it('should create unique renewal records for multiple renewals', async () => {
      const oldExpiresAt = new Date(testInstance.expires_at!);
      const newExpiresAt1 = new Date(oldExpiresAt);
      newExpiresAt1.setDate(newExpiresAt1.getDate() + 30);

      const renewal1 = await renewalService.record({
        instance_id: testInstance.instance_id,
        old_expires_at: oldExpiresAt,
        new_expires_at: newExpiresAt1,
        duration_days: 30,
        renewed_by: testUser.id,
      });

      const newExpiresAt2 = new Date(newExpiresAt1);
      newExpiresAt2.setDate(newExpiresAt2.getDate() + 60);

      const renewal2 = await renewalService.record({
        instance_id: testInstance.instance_id,
        old_expires_at: newExpiresAt1,
        new_expires_at: newExpiresAt2,
        duration_days: 60,
        renewed_by: testUser.id,
      });

      expect(renewal1.id).not.toBe(renewal2.id);
      expect(renewal1.duration_days).toBe(30);
      expect(renewal2.duration_days).toBe(60);

      // Verify both renewals were saved to database
      const renewalRepo = AppDataSource.getRepository(InstanceRenewal);
      const renewals = await renewalRepo.find({
        where: { instance_id: testInstance.instance_id },
      });

      expect(renewals).toHaveLength(2);
    });
  });

  describe('Renewal History Retrieval', () => {
    it('should retrieve renewal history by instance ID', async () => {
      // Create multiple renewals
      const oldExpiresAt = new Date(testInstance.expires_at!);
      const newExpiresAt1 = new Date(oldExpiresAt);
      newExpiresAt1.setDate(newExpiresAt1.getDate() + 30);

      await renewalService.record({
        instance_id: testInstance.instance_id,
        old_expires_at: oldExpiresAt,
        new_expires_at: newExpiresAt1,
        duration_days: 30,
        renewed_by: testUser.id,
      });

      const newExpiresAt2 = new Date(newExpiresAt1);
      newExpiresAt2.setDate(newExpiresAt2.getDate() + 60);

      await renewalService.record({
        instance_id: testInstance.instance_id,
        old_expires_at: newExpiresAt1,
        new_expires_at: newExpiresAt2,
        duration_days: 60,
        renewed_by: testUser.id,
      });

      // Retrieve renewal history
      const renewals = await renewalService.findByInstance(testInstance.instance_id);

      expect(renewals).toHaveLength(2);
      expect(renewals[0].instance_id).toBe(testInstance.instance_id);
      expect(renewals[1].instance_id).toBe(testInstance.instance_id);

      // Verify ordering (most recent first)
      const timeDiff = renewals[0].renewed_at.getTime() - renewals[1].renewed_at.getTime();
      expect(timeDiff).toBeGreaterThan(0);
    });

    it('should return empty array for instance with no renewals', async () => {
      const renewals = await renewalService.findByInstance('non-existent-instance');
      expect(renewals).toEqual([]);
    });

    it('should include user relation in renewal history', async () => {
      const oldExpiresAt = new Date(testInstance.expires_at!);
      const newExpiresAt = new Date(oldExpiresAt);
      newExpiresAt.setDate(newExpiresAt.getDate() + 30);

      await renewalService.record({
        instance_id: testInstance.instance_id,
        old_expires_at: oldExpiresAt,
        new_expires_at: newExpiresAt,
        duration_days: 30,
        renewed_by: testUser.id,
      });

      const renewals = await renewalService.findByInstance(testInstance.instance_id);

      expect(renewals).toHaveLength(1);
      expect(renewals[0].renewed_by_user).toBeDefined();
      expect(renewals[0].renewed_by_user.id).toBe(testUser.id);
      expect(renewals[0].renewed_by_user.name).toBe(testUser.name);
    });
  });

  describe('Latest Renewal Retrieval', () => {
    it('should retrieve latest renewal by instance ID', async () => {
      // Create multiple renewals
      const oldExpiresAt = new Date(testInstance.expires_at!);
      const newExpiresAt1 = new Date(oldExpiresAt);
      newExpiresAt1.setDate(newExpiresAt1.getDate() + 30);

      const renewal1 = await renewalService.record({
        instance_id: testInstance.instance_id,
        old_expires_at: oldExpiresAt,
        new_expires_at: newExpiresAt1,
        duration_days: 30,
        renewed_by: testUser.id,
      });

      // Wait a bit to ensure time difference
      await new Promise(resolve => setTimeout(resolve, 10));

      const newExpiresAt2 = new Date(newExpiresAt1);
      newExpiresAt2.setDate(newExpiresAt2.getDate() + 60);

      const renewal2 = await renewalService.record({
        instance_id: testInstance.instance_id,
        old_expires_at: newExpiresAt1,
        new_expires_at: newExpiresAt2,
        duration_days: 60,
        renewed_by: testUser.id,
      });

      // Retrieve latest renewal
      const latestRenewal = await renewalService.findLatestByInstance(testInstance.instance_id);

      expect(latestRenewal).toBeDefined();
      expect(latestRenewal!.id).toBe(renewal2.id);
      expect(latestRenewal!.duration_days).toBe(60);
    });

    it('should return null for instance with no renewals', async () => {
      const latestRenewal = await renewalService.findLatestByInstance('non-existent-instance');
      expect(latestRenewal).toBeNull();
    });

    it('should include user relation in latest renewal', async () => {
      const oldExpiresAt = new Date(testInstance.expires_at!);
      const newExpiresAt = new Date(oldExpiresAt);
      newExpiresAt.setDate(newExpiresAt.getDate() + 30);

      await renewalService.record({
        instance_id: testInstance.instance_id,
        old_expires_at: oldExpiresAt,
        new_expires_at: newExpiresAt,
        duration_days: 30,
        renewed_by: testUser.id,
      });

      const latestRenewal = await renewalService.findLatestByInstance(testInstance.instance_id);

      expect(latestRenewal).toBeDefined();
      expect(latestRenewal!.renewed_by_user).toBeDefined();
      expect(latestRenewal!.renewed_by_user.id).toBe(testUser.id);
    });
  });

  describe('Expiration Time Tracking', () => {
    it('should correctly track old and new expiration times', async () => {
      const oldExpiresAt = new Date(testInstance.expires_at!);
      const newExpiresAt = new Date(oldExpiresAt);
      newExpiresAt.setDate(newExpiresAt.getDate() + 30);

      const renewal = await renewalService.record({
        instance_id: testInstance.instance_id,
        old_expires_at: oldExpiresAt,
        new_expires_at: newExpiresAt,
        duration_days: 30,
        renewed_by: testUser.id,
      });

      // Verify expiration times are correctly stored
      const renewalRepo = AppDataSource.getRepository(InstanceRenewal);
      const savedRenewal = await renewalRepo.findOne({
        where: { id: renewal.id },
      });

      expect(savedRenewal!.old_expires_at.getTime()).toBe(oldExpiresAt.getTime());
      expect(savedRenewal!.new_expires_at.getTime()).toBe(newExpiresAt.getTime());

      // Verify new expiration is later than old expiration
      expect(savedRenewal!.new_expires_at.getTime()).toBeGreaterThan(
        savedRenewal!.old_expires_at.getTime()
      );
    });

    it('should correctly calculate duration in days', async () => {
      const oldExpiresAt = new Date(testInstance.expires_at!);
      const newExpiresAt = new Date(oldExpiresAt);
      newExpiresAt.setDate(newExpiresAt.getDate() + 90); // 90 days

      const renewal = await renewalService.record({
        instance_id: testInstance.instance_id,
        old_expires_at: oldExpiresAt,
        new_expires_at: newExpiresAt,
        duration_days: 90,
        renewed_by: testUser.id,
      });

      expect(renewal.duration_days).toBe(90);

      // Verify in database
      const renewalRepo = AppDataSource.getRepository(InstanceRenewal);
      const savedRenewal = await renewalRepo.findOne({
        where: { id: renewal.id },
      });

      expect(savedRenewal!.duration_days).toBe(90);
    });
  });

  describe('Permission Validation', () => {
    it('should record renewal for instance owner', async () => {
      const oldExpiresAt = new Date(testInstance.expires_at!);
      const newExpiresAt = new Date(oldExpiresAt);
      newExpiresAt.setDate(newExpiresAt.getDate() + 30);

      const renewal = await renewalService.record({
        instance_id: testInstance.instance_id,
        old_expires_at: oldExpiresAt,
        new_expires_at: newExpiresAt,
        duration_days: 30,
        renewed_by: testUser.id, // Same as owner
      });

      expect(renewal.renewed_by).toBe(testUser.id);
    });

    it('should record renewal for different user (admin scenario)', async () => {
      // Create another user (admin)
      const userRepository = AppDataSource.getRepository(User);
      const adminUser = userRepository.create({
        feishu_user_id: `admin-user-${Date.now()}`,
        name: 'Admin User',
        email: `admin-${Date.now()}@example.com`,
      });
      await userRepository.save(adminUser);

      const oldExpiresAt = new Date(testInstance.expires_at!);
      const newExpiresAt = new Date(oldExpiresAt);
      newExpiresAt.setDate(newExpiresAt.getDate() + 30);

      const renewal = await renewalService.record({
        instance_id: testInstance.instance_id,
        old_expires_at: oldExpiresAt,
        new_expires_at: newExpiresAt,
        duration_days: 30,
        renewed_by: adminUser.id, // Different user (admin)
      });

      expect(renewal.renewed_by).toBe(adminUser.id);
      expect(renewal.renewed_by).not.toBe(testUser.id);

      // Cleanup
      await userRepository.delete(adminUser.id);
    });
  });

  describe('Timestamp Tracking', () => {
    it('should automatically set renewed_at timestamp', async () => {
      const beforeTime = new Date();

      const oldExpiresAt = new Date(testInstance.expires_at!);
      const newExpiresAt = new Date(oldExpiresAt);
      newExpiresAt.setDate(newExpiresAt.getDate() + 30);

      const renewal = await renewalService.record({
        instance_id: testInstance.instance_id,
        old_expires_at: oldExpiresAt,
        new_expires_at: newExpiresAt,
        duration_days: 30,
        renewed_by: testUser.id,
      });

      const afterTime = new Date();

      expect(renewal.renewed_at).toBeDefined();
      expect(renewal.renewed_at.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(renewal.renewed_at.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });
  });

  describe('Multiple Instances Renewal History', () => {
    it('should keep renewal history separate for different instances', async () => {
      // Create another instance
      const secondInstance = await instanceRepository.create({
        instance_id: `test-instance-2-${Date.now()}`,
        owner_id: testUser.id,
        status: 'active',
        template: 'personal',
        config: {
          apiKey: 'test-api-key-2',
          feishuAppId: 'test-app-id',
          feishuAppSecret: 'test-app-secret',
          skills: ['chat'],
          systemPrompt: 'Test prompt',
          temperature: 0.7,
          maxTokens: 4000,
        },
        expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        restart_attempts: 0,
        health_status: {},
      });

      // Record renewals for both instances
      const oldExpiresAt1 = new Date(testInstance.expires_at!);
      const newExpiresAt1 = new Date(oldExpiresAt1);
      newExpiresAt1.setDate(newExpiresAt1.getDate() + 30);

      await renewalService.record({
        instance_id: testInstance.instance_id,
        old_expires_at: oldExpiresAt1,
        new_expires_at: newExpiresAt1,
        duration_days: 30,
        renewed_by: testUser.id,
      });

      const oldExpiresAt2 = new Date(secondInstance.expires_at!);
      const newExpiresAt2 = new Date(oldExpiresAt2);
      newExpiresAt2.setDate(newExpiresAt2.getDate() + 60);

      await renewalService.record({
        instance_id: secondInstance.instance_id,
        old_expires_at: oldExpiresAt2,
        new_expires_at: newExpiresAt2,
        duration_days: 60,
        renewed_by: testUser.id,
      });

      // Retrieve renewal history for each instance
      const renewals1 = await renewalService.findByInstance(testInstance.instance_id);
      const renewals2 = await renewalService.findByInstance(secondInstance.instance_id);

      expect(renewals1).toHaveLength(1);
      expect(renewals2).toHaveLength(1);
      expect(renewals1[0].instance_id).toBe(testInstance.instance_id);
      expect(renewals2[0].instance_id).toBe(secondInstance.instance_id);
      expect(renewals1[0].duration_days).toBe(30);
      expect(renewals2[0].duration_days).toBe(60);

      // Cleanup
      await instanceRepository.delete(secondInstance.id);
    });
  });
});
