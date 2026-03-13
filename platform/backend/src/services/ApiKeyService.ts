import { Service } from 'typedi';
import { ApiKeyRepository } from '../repositories/ApiKeyRepository';
import { InstanceRepository } from '../repositories/InstanceRepository';
import { encrypt, decrypt } from '../utils/encryption';
import { logger } from '../config/logger';
import { ErrorService } from './ErrorService';

/**
 * API Key Service
 *
 * Manages API key pool with encryption, load balancing, and quota management.
 * Provides secure key storage and distribution for LLM API providers.
 */
@Service()
export class ApiKeyService {
  private encryptionPassword: string;

  constructor(
    private readonly apiKeyRepository: ApiKeyRepository,
    private readonly instanceRepository: InstanceRepository,
    private readonly errorService: ErrorService
  ) {
    this.encryptionPassword = process.env.ENCRYPTION_PASSWORD || 'default-password-change-in-production';
  }

  /**
   * Add a new API key to the pool
   *
   * @param provider - API provider name (e.g., 'deepseek')
   * @param key - API key to encrypt and store
   * @param quota - Maximum usage quota (default 1000)
   */
  async addApiKey(provider: string, key: string, quota: number = 1000): Promise<void> {
    const encryptedKey = encrypt(key, this.encryptionPassword);

    await this.apiKeyRepository.create({
      provider,
      encrypted_key: encryptedKey,
      status: 'active',
      usage_count: 0,
      quota
    });

    logger.info('API key added to pool', { provider });
  }

  /**
   * Assign an available API key to an instance
   * Uses least-connection load balancing algorithm
   *
   * @param instanceId - Instance ID to assign key to
   * @returns Decrypted API key
   * @throws AppError if no keys available or quota exceeded
   */
  async assignKey(instanceId: string): Promise<string> {
    // 1. Find the key with least usage count
    const apiKey = await this.apiKeyRepository.findAvailableKey();

    if (!apiKey) {
      this.errorService.logError(
        new Error('No API keys available'),
        { instanceId }
      );
      throw this.errorService.createError('APIKEY_UNAVAILABLE');
    }

    // 2. Check if quota is exceeded
    if (await this.apiKeyRepository.isQuotaExceeded(apiKey.id)) {
      throw this.errorService.createError('QUOTA_EXCEEDED', {
        apiKeyId: apiKey.id
      });
    }

    // 3. Assign key to instance
    await this.apiKeyRepository.assignKeyToInstance(apiKey.id, instanceId);

    // 4. Increment usage count
    await this.apiKeyRepository.incrementUsage(apiKey.id);

    // 5. Decrypt and return the key
    const decryptedKey = decrypt(apiKey.encrypted_key, this.encryptionPassword);

    logger.info('API key assigned', {
      instanceId,
      apiKeyId: apiKey.id,
      usageCount: apiKey.usage_count + 1
    });

    return decryptedKey;
  }

  /**
   * Release an API key from an instance
   *
   * @param instanceId - Instance ID to release key from
   */
  async releaseKey(instanceId: string): Promise<void> {
    await this.apiKeyRepository.releaseKey(instanceId);

    logger.info('API key released', { instanceId });
  }

  /**
   * Get API key usage statistics
   *
   * @returns Usage statistics including total keys, active keys, and usage metrics
   */
  async getUsageStats(): Promise<{
    totalKeys: number;
    activeKeys: number;
    availableKeys: number;
    assignedKeys: number;
    totalUsage: number;
    averageUsage: number;
  }> {
    const totalKeys = await this.apiKeyRepository.count();
    const activeKeys = await this.apiKeyRepository.countActiveKeys();
    const availableKeys = await this.apiKeyRepository.countAvailableKeys();
    const assignedKeys = await this.apiKeyRepository.countAssignedKeys();

    const allKeys = await this.apiKeyRepository.findAll();
    const totalUsage = allKeys.reduce((sum, key) => sum + key.usage_count, 0);
    const averageUsage = totalKeys > 0 ? totalUsage / totalKeys : 0;

    return {
      totalKeys,
      activeKeys,
      availableKeys,
      assignedKeys,
      totalUsage,
      averageUsage
    };
  }

  /**
   * Get keys near quota limit
   *
   * @param threshold - Usage threshold (default 0.8 = 80%)
   * @returns List of keys near quota limit
   */
  async getNearQuotaLimit(threshold: number = 0.8): Promise<any[]> {
    return this.apiKeyRepository.findNearQuotaLimit(threshold);
  }

  /**
   * Deactivate an API key
   *
   * @param keyId - Key ID to deactivate
   */
  async deactivateKey(keyId: number): Promise<void> {
    await this.apiKeyRepository.updateStatus(keyId, 'inactive');
    logger.info('API key deactivated', { keyId });
  }

  /**
   * Activate an API key
   *
   * @param keyId - Key ID to activate
   */
  async activateKey(keyId: number): Promise<void> {
    await this.apiKeyRepository.updateStatus(keyId, 'active');
    logger.info('API key activated', { keyId });
  }

  /**
   * Rotate API keys (change encryption password)
   *
   * @param newPassword - New encryption password
   */
  async rotateKeys(newPassword: string): Promise<void> {
    const keys = await this.apiKeyRepository.findAll();

    for (const key of keys) {
      // Decrypt with old password
      const decryptedKey = decrypt(key.encrypted_key, this.encryptionPassword);

      // Encrypt with new password
      const newEncryptedKey = encrypt(decryptedKey, newPassword);

      // Update in database
      await this.apiKeyRepository.update(key.id, {
        encrypted_key: newEncryptedKey
      });
    }

    this.encryptionPassword = newPassword;
    logger.info('All API keys rotated', { count: keys.length });
  }

  /**
   * Get usage stats for a specific provider
   *
   * @param provider - Provider name
   * @returns Provider-specific statistics
   */
  async getProviderStats(provider: string): Promise<{
    count: number;
    totalUsage: number;
    available: number;
  }> {
    const keys = await this.apiKeyRepository.findByProvider(provider);

    const totalUsage = keys.reduce((sum, key) => sum + key.usage_count, 0);
    const available = keys.filter(key => !key.current_instance_id).length;

    return {
      count: keys.length,
      totalUsage,
      available
    };
  }

  /**
   * Get key assigned to instance
   *
   * @param instanceId - Instance ID
   * @returns Decrypted API key or null
   */
  async getKeyForInstance(instanceId: string): Promise<string | null> {
    const apiKey = await this.apiKeyRepository.findByInstanceId(instanceId);

    if (!apiKey) {
      return null;
    }

    return decrypt(apiKey.encrypted_key, this.encryptionPassword);
  }

  /**
   * Validate API key encryption
   *
   * @param keyId - Key ID to validate
   * @returns True if key can be decrypted successfully
   */
  async validateKey(keyId: number): Promise<boolean> {
    try {
      const apiKey = await this.apiKeyRepository.findById(keyId);
      if (!apiKey) {
        return false;
      }

      // Attempt to decrypt
      decrypt(apiKey.encrypted_key, this.encryptionPassword);
      return true;
    } catch (error) {
      logger.error('API key validation failed', { keyId, error });
      return false;
    }
  }

  /**
   * Get all keys for a provider with usage info
   *
   * @param provider - Provider name
   * @returns List of keys with usage information
   */
  async getKeysWithUsage(provider: string): Promise<Array<{
    id: number;
    status: string;
    usageCount: number;
    quota: number;
    usagePercentage: number;
    isAssigned: boolean;
    lastUsed: Date | null;
  }>> {
    const keys = await this.apiKeyRepository.findByProvider(provider);

    return keys.map(key => ({
      id: key.id,
      status: key.status,
      usageCount: key.usage_count,
      quota: key.quota,
      usagePercentage: (key.usage_count / key.quota) * 100,
      isAssigned: !!key.current_instance_id,
      lastUsed: key.last_used_at || null
    }));
  }
}
