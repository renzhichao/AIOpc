/**
 * Database Test Helper
 *
 * Provides utilities for setting up and tearing down test databases,
 * creating test fixtures, and managing test data.
 */

import { AppDataSource } from '../../../src/config/database';
import { User } from '../../../src/entities/User.entity';
import { Instance } from '../../../src/entities/Instance.entity';
import { ApiKey } from '../../../src/entities/ApiKey.entity';
import { QRCode } from '../../../src/entities/QRCode.entity';

export class DatabaseHelper {
  private static isConnected = false;

  /**
   * Initialize database connection for tests
   */
  static async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
      this.isConnected = true;
      console.log('✓ Test database connected');
    }
  }

  /**
   * Close database connection
   */
  static async disconnect(): Promise<void> {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
      this.isConnected = false;
      console.log('✓ Test database disconnected');
    }
  }

  /**
   * Clean all test data from database
   */
  static async clean(): Promise<void> {
    if (!AppDataSource.isInitialized) {
      return;
    }

    // Delete in correct order due to foreign key constraints
    await AppDataSource.getRepository(Instance).delete({});
    await AppDataSource.getRepository(ApiKey).delete({});
    await AppDataSource.getRepository(QRCode).delete({});
    await AppDataSource.getRepository(User).delete({});

    console.log('✓ Test database cleaned');
  }

  /**
   * Create a test user
   */
  static async createTestUser(overrides?: Partial<User>): Promise<User> {
    const userRepository = AppDataSource.getRepository(User);

    const user = userRepository.create({
      feishu_user_id: `test-user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: 'Test User',
      email: `test-${Date.now()}@example.com`,
      avatar: 'https://example.com/avatar.png',
      ...overrides,
    });

    await userRepository.save(user);
    console.log(`✓ Created test user: ${user.id}`);

    return user;
  }

  /**
   * Create multiple test users
   */
  static async createTestUsers(count: number): Promise<User[]> {
    const users: User[] = [];

    for (let i = 0; i < count; i++) {
      const user = await this.createTestUser({
        name: `Test User ${i + 1}`,
        email: `test-${i + 1}-${Date.now()}@example.com`,
      });
      users.push(user);
    }

    return users;
  }

  /**
   * Create a test instance
   */
  static async createTestInstance(user: User, overrides?: Partial<Instance>): Promise<Instance> {
    const instanceRepository = AppDataSource.getRepository(Instance);

    const instance = instanceRepository.create({
      instance_id: `test-inst-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      owner_id: user.id,
      status: 'active',
      template: 'personal',
      config: {
        apiKey: 'test-api-key',
        feishuAppId: 'test-feishu-app-id',
        skills: ['general_chat'],
        tools: [{ name: 'read', layer: 1 }],
      },
      docker_container_id: null,
      restart_attempts: 0,
      health_status: {},
      ...overrides,
    });

    await instanceRepository.save(instance);
    console.log(`✓ Created test instance: ${instance.instance_id}`);

    return instance;
  }

  /**
   * Create a test QR code
   */
  static async createTestQRCode(
    instanceId: string,
    overrides?: Partial<QRCode>
  ): Promise<QRCode> {
    const qrCodeRepository = AppDataSource.getRepository(QRCode);

    const qrCode = qrCodeRepository.create({
      instance_id: instanceId,
      token: `test-token-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      state: `test-state-${Date.now()}`,
      expires_at: new Date(Date.now() + 24 * 3600 * 1000), // 24 hours
      scan_count: 0,
      claimed_at: null,
      ...overrides,
    });

    await qrCodeRepository.save(qrCode);
    console.log(`✓ Created test QR code: ${qrCode.token}`);

    return qrCode;
  }

  /**
   * Create a test API key
   */
  static async createTestApiKey(
    user: User,
    overrides?: Partial<ApiKey>
  ): Promise<ApiKey> {
    const apiKeyRepository = AppDataSource.getRepository(ApiKey);

    const apiKey = apiKeyRepository.create({
      key: `sk-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      user_id: user.id,
      instance_id: null,
      status: 'active',
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      last_used_at: null,
      ...overrides,
    });

    await apiKeyRepository.save(apiKey);
    console.log(`✓ Created test API key: ${apiKey.key}`);

    return apiKey;
  }

  /**
   * Find user by Feishu user ID
   */
  static async findUserByFeishuId(feishuUserId: string): Promise<User | null> {
    const userRepository = AppDataSource.getRepository(User);
    return await userRepository.findOne({
      where: { feishu_user_id: feishuUserId },
    });
  }

  /**
   * Find instance by instance ID
   */
  static async findInstanceById(instanceId: string): Promise<Instance | null> {
    const instanceRepository = AppDataSource.getRepository(Instance);
    return await instanceRepository.findOne({
      where: { instance_id: instanceId },
    });
  }

  /**
   * Find API key by key
   */
  static async findApiKeyByKey(key: string): Promise<ApiKey | null> {
    const apiKeyRepository = AppDataSource.getRepository(ApiKey);
    return await apiKeyRepository.findOne({
      where: { key },
    });
  }

  /**
   * Count instances for a user
   */
  static async countUserInstances(userId: string): Promise<number> {
    const instanceRepository = AppDataSource.getRepository(Instance);
    return await instanceRepository.count({
      where: { owner_id: userId },
    });
  }

  /**
   * Count API keys for a user
   */
  static async countUserApiKeys(userId: string): Promise<number> {
    const apiKeyRepository = AppDataSource.getRepository(ApiKey);
    return await apiKeyRepository.count({
      where: { user_id: userId },
    });
  }

  /**
   * Delete all instances for a user
   */
  static async deleteUserInstances(userId: string): Promise<void> {
    const instanceRepository = AppDataSource.getRepository(Instance);
    await instanceRepository.delete({
      owner_id: userId,
    });
  }

  /**
   * Delete all API keys for a user
   */
  static async deleteUserApiKeys(userId: string): Promise<void> {
    const apiKeyRepository = AppDataSource.getRepository(ApiKey);
    await apiKeyRepository.delete({
      user_id: userId,
    });
  }

  /**
   * Run a function within a database transaction
   */
  static async withTransaction<T>(
    fn: () => Promise<T>
  ): Promise<T> {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const result = await fn();
      await queryRunner.commitTransaction();
      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Get database statistics
   */
  static async getStats(): Promise<{
    users: number;
    instances: number;
    apiKeys: number;
    qrcodes: number;
  }> {
    const [users, instances, apiKeys, qrcodes] = await Promise.all([
      AppDataSource.getRepository(User).count(),
      AppDataSource.getRepository(Instance).count(),
      AppDataSource.getRepository(ApiKey).count(),
      AppDataSource.getRepository(QRCode).count(),
    ]);

    return { users, instances, apiKeys, qrcodes };
  }
}
