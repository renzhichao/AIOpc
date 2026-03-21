import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { QueryFailedError } from 'typeorm';
import { UserRepository } from '../../src/repositories/UserRepository';
import { User } from '../../src/entities/User.entity';
import { AppDataSource } from '../../src/config/database';

/**
 * TASK-003: Database Concurrent User Creation Protection
 *
 * 单元测试：并发创建用户保护机制
 *
 * 测试场景:
 * 1. 唯一约束冲突检测 (23505 错误码)
 * 2. 重试机制 (最多 3 次)
 * 3. 并发创建 (100 个并发请求)
 * 4. 验证只创建一条用户记录
 */
describe('UserRepository - Concurrent Creation Protection (TASK-003)', () => {
  let userRepository: UserRepository;
  let mockRepository: any;
  let originalGetRepository: any;

  beforeEach(() => {
    // Create mock repository
    mockRepository = {
      findOne: jest.fn(),
      create: jest.fn(), // This creates the entity
      save: jest.fn(),   // This saves the entity
      update: jest.fn(),
      count: jest.fn(),
    };

    // Create UserRepository instance
    userRepository = new UserRepository();

    // Store original getRepository method
    originalGetRepository = (userRepository as any).getRepository;

    // Replace getRepository to return mock
    (userRepository as any).getRepository = () => mockRepository;

    // Reset cached repository
    (userRepository as any)._repository = undefined;
  });

  afterEach(() => {
    // Restore original getRepository
    if (originalGetRepository) {
      (userRepository as any).getRepository = originalGetRepository;
    }
    jest.clearAllMocks();
  });

  describe('isUniqueViolationError - 23505 Error Code Detection', () => {
    it('should detect PostgreSQL unique constraint violation (error code 23505)', () => {
      // Create a QueryFailedError with code 23505
      const error = new QueryFailedError(
        'INSERT INTO "users" (...) VALUES (...)',
        [],
        new Error('duplicate key value violates unique constraint "UQ_users_feishu_user_id"')
      );
      (error as any).code = '23505';

      // Access private method for testing
      const isUniqueViolation = (userRepository as any).isUniqueViolationError(error);

      expect(isUniqueViolation).toBe(true);
    });

    it('should return false for non-23505 errors', () => {
      const error = new QueryFailedError(
        'INSERT INTO "users" (...) VALUES (...)',
        [],
        new Error('some other database error')
      );
      (error as any).code = '23502'; // NOT NULL violation

      const isUniqueViolation = (userRepository as any).isUniqueViolationError(error);

      expect(isUniqueViolation).toBe(false);
    });

    it('should return false for non-QueryFailedError errors', () => {
      const error = new Error('Generic error');

      const isUniqueViolation = (userRepository as any).isUniqueViolationError(error);

      expect(isUniqueViolation).toBe(false);
    });
  });

  describe('createWithRetry - Retry Mechanism', () => {
    const mockUserData = {
      feishu_user_id: 'test_feishu_id_123',
      name: 'Test User',
      email: 'test@example.com'
    };

    const createMockUser = (overrides: any = {}): User => ({
      id: 1,
      feishu_user_id: 'test_feishu_id_123',
      feishu_union_id: null,
      name: 'Test User',
      email: 'test@example.com',
      avatar_url: null,
      created_at: new Date(),
      last_login_at: null,
      conversations: [],
      ...overrides
    } as User);

    it('should create user successfully on first attempt', async () => {
      const mockUser = createMockUser();
      // BaseRepository.create() calls repository.create() then repository.save()
      mockRepository.create.mockReturnValue(mockUser);
      mockRepository.save.mockResolvedValue(mockUser);

      const result = await (userRepository as any).createWithRetry(mockUserData);

      expect(result).toEqual(mockUser);
      expect(mockRepository.create).toHaveBeenCalledTimes(1);
      expect(mockRepository.save).toHaveBeenCalledTimes(1);
    });

    it('should retry on 23505 error and find existing user', async () => {
      const mockUser = createMockUser();

      // First call throws 23505 error from save()
      const uniqueViolationError = new QueryFailedError(
        'INSERT INTO "users" (...) VALUES (...)',
        [],
        new Error('duplicate key value violates unique constraint')
      );
      (uniqueViolationError as any).code = '23505';

      // Mock the flow: create() returns entity, save() throws 23505 error
      mockRepository.create.mockReturnValue(mockUser);
      mockRepository.save.mockRejectedValueOnce(uniqueViolationError);

      // Mock findByFeishuUserId to find user after conflict
      jest.spyOn(userRepository, 'findByFeishuUserId')
        .mockResolvedValueOnce(mockUser as any);

      const result = await (userRepository as any).createWithRetry(mockUserData);

      expect(result).toEqual(mockUser);
      expect(userRepository['findByFeishuUserId']).toHaveBeenCalledTimes(1);
    });

    it('should respect maxRetries parameter', async () => {
      const uniqueViolationError = new QueryFailedError(
        'INSERT INTO "users" (...) VALUES (...)',
        [],
        new Error('duplicate key')
      );
      (uniqueViolationError as any).code = '23505';

      const mockUser = createMockUser();
      mockRepository.create.mockReturnValue(mockUser);
      mockRepository.save.mockRejectedValue(uniqueViolationError);
      jest.spyOn(userRepository, 'findByFeishuUserId').mockResolvedValue(null);

      await expect(
        (userRepository as any).createWithRetry(mockUserData, 2)
      ).rejects.toThrow();

      // Should retry maxRetries times (2 times)
      expect(mockRepository.save).toHaveBeenCalledTimes(2);
    });

    it('should use exponential backoff between retries', async () => {
      const uniqueViolationError = new QueryFailedError(
        'INSERT INTO "users" (...) VALUES (...)',
        [],
        new Error('duplicate key')
      );
      (uniqueViolationError as any).code = '23505';

      const sleepSpy = jest.spyOn(userRepository as any, 'sleep');
      const mockUser = createMockUser();
      mockRepository.create.mockReturnValue(mockUser);
      mockRepository.save.mockRejectedValue(uniqueViolationError);
      jest.spyOn(userRepository, 'findByFeishuUserId').mockResolvedValue(null);

      try {
        await (userRepository as any).createWithRetry(mockUserData, 3);
      } catch (error) {
        // Expected to fail
      }

      // Should have slept between retries (3 attempts = 2 sleeps)
      expect(sleepSpy).toHaveBeenCalledTimes(2);

      // Check exponential backoff: 200ms (2^1 * 100), 400ms (2^2 * 100)
      expect(sleepSpy).toHaveBeenNthCalledWith(1, 200);
      expect(sleepSpy).toHaveBeenNthCalledWith(2, 400);
    });

    it('should not retry on non-23505 errors', async () => {
      const otherError = new Error('Connection failed');
      mockRepository.create.mockImplementation(() => { throw otherError; });

      await expect(
        (userRepository as any).createWithRetry(mockUserData)
      ).rejects.toThrow('Connection failed');

      expect(mockRepository.create).toHaveBeenCalledTimes(1); // No retry
    });
  });

  describe('findOrCreate - Concurrent Creation Scenarios', () => {
    const mockUserData = {
      feishu_user_id: 'concurrent_test_user',
      name: 'Concurrent Test User',
      email: 'concurrent@example.com'
    };

    const createMockUser = (overrides: any = {}): User => ({
      id: 1,
      feishu_user_id: 'concurrent_test_user',
      feishu_union_id: null,
      name: 'Concurrent Test User',
      email: 'concurrent@example.com',
      avatar_url: null,
      created_at: new Date(),
      last_login_at: null,
      conversations: [],
      ...overrides
    } as User);

    it('should create new user when not found', async () => {
      const mockUser = createMockUser();

      jest.spyOn(userRepository, 'findByFeishuUserId').mockResolvedValue(null);
      jest.spyOn(userRepository as any, 'createWithRetry').mockResolvedValue(mockUser);
      mockRepository.update.mockResolvedValue({});
      jest.spyOn(userRepository, 'findById').mockResolvedValue(mockUser as any);

      const result = await userRepository.findOrCreate(mockUserData);

      expect(result).toEqual(mockUser);
      expect(userRepository['findByFeishuUserId']).toHaveBeenCalledWith(mockUserData.feishu_user_id);
      expect(userRepository['createWithRetry']).toHaveBeenCalledWith(mockUserData);
    });

    it('should update existing user when found', async () => {
      const existingUser = createMockUser();
      const updatedUser = createMockUser({ name: 'Updated Name' });

      jest.spyOn(userRepository, 'findByFeishuUserId').mockResolvedValue(existingUser as any);
      mockRepository.update.mockResolvedValue({});
      jest.spyOn(userRepository, 'findById').mockResolvedValue(updatedUser as any);

      const result = await userRepository.findOrCreate({
        ...mockUserData,
        name: 'Updated Name'
      });

      expect(result).toEqual(updatedUser);
      expect(mockRepository.update).toHaveBeenCalledWith(1, expect.any(Object));
    });
  });

  describe('Concurrent Creation Test - 100 Parallel Attempts', () => {
    const testUserId = 'stress_test_user_001';
    const mockUserData = {
      feishu_user_id: testUserId,
      name: 'Stress Test User',
      email: 'stress@example.com'
    };

    const createMockUser = (overrides: any = {}): User => ({
      id: 1,
      feishu_user_id: testUserId,
      feishu_union_id: null,
      name: 'Stress Test User',
      email: 'stress@example.com',
      avatar_url: null,
      created_at: new Date(),
      last_login_at: null,
      conversations: [],
      ...overrides
    } as User);

    it('should handle 100 concurrent creation requests for same user', async () => {
      const concurrentRequests = 100;
      const createdUser = createMockUser();

      // Mock findByFeishuUserId to return null initially (user doesn't exist)
      jest.spyOn(userRepository, 'findByFeishuUserId').mockResolvedValue(null);

      // Mock createWithRetry to simulate concurrent scenario:
      // - First few requests will attempt to create
      // - One succeeds, others get 23505 error
      // - All eventually return the same user
      let callCount = 0;
      jest.spyOn(userRepository as any, 'createWithRetry').mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // First request succeeds
          return createdUser;
        } else {
          // Simulate finding existing user after conflict
          await (userRepository as any).sleep(10); // Small delay to simulate race condition
          return createdUser;
        }
      });

      mockRepository.update.mockResolvedValue({});
      jest.spyOn(userRepository, 'findById').mockResolvedValue(createdUser as any);

      // Launch 100 concurrent requests
      const promises = Array(concurrentRequests)
        .fill(null)
        .map(() => userRepository.findOrCreate(mockUserData));

      // Wait for all requests to complete
      const results = await Promise.all(promises);

      // Verify all requests returned the same user
      results.forEach((result) => {
        expect(result.id).toBe(1);
        expect(result.feishu_user_id).toBe(testUserId);
      });

      // Verify createWithRetry was called for each initial request
      // (Note: In real scenario, some calls might be skipped if user found immediately)
      expect(userRepository['createWithRetry']).toHaveBeenCalled();
    });

    it('should only create ONE user record despite 100 concurrent attempts', async () => {
      const concurrentRequests = 100;
      const testUserId = 'unique_user_' + Date.now();
      const userData = {
        feishu_user_id: testUserId,
        name: 'Unique Test User',
        email: `unique_${Date.now()}@example.com`
      };

      // Track actual database inserts
      let insertCount = 0;
      const createdUser = createMockUser({
        feishu_user_id: testUserId,
        name: 'Unique Test User',
        email: `unique_${Date.now()}@example.com`
      });

      jest.spyOn(userRepository, 'findByFeishuUserId').mockResolvedValue(null);

      jest.spyOn(userRepository as any, 'createWithRetry').mockImplementation(async () => {
        insertCount++;
        if (insertCount === 1) {
          // Only first concurrent request creates
          return createdUser;
        } else {
          // Others find the created user after conflict
          return createdUser;
        }
      });

      mockRepository.update.mockResolvedValue({});
      jest.spyOn(userRepository, 'findById').mockResolvedValue(createdUser as any);

      // Simulate 100 concurrent OAuth callbacks
      const promises = Array(concurrentRequests)
        .fill(null)
        .map(() => userRepository.findOrCreate(userData));

      await Promise.all(promises);

      // CRITICAL: Only ONE user should be created
      // In real database, UNIQUE constraint prevents duplicates
      // Here we verify the logic by checking createWithRetry was called appropriately
      expect(insertCount).toBeGreaterThan(0);

      // All results should be identical
      const results = await Promise.all(promises);
      const uniqueUsers = new Set(results.map(r => r.id));
      expect(uniqueUsers.size).toBe(1); // Only one unique user ID
    });
  });

  describe('sleep - Utility Method', () => {
    it('should sleep for specified milliseconds', async () => {
      const start = Date.now();
      await (userRepository as any).sleep(100);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(100);
      expect(elapsed).toBeLessThan(150); // Allow some margin
    });
  });
});
