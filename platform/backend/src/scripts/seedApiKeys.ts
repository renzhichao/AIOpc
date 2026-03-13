import { ApiKeyService } from '../services/ApiKeyService';
import { Container } from 'typedi';
import { AppDataSource } from '../config/database';
import { logger } from '../config/logger';

/**
 * Seed API Keys Script
 *
 * Adds sample API keys to the database for testing and development.
 * This should only be used in development environments.
 */
export async function seedApiKeys() {
  try {
    // Initialize database connection
    await AppDataSource.initialize();
    logger.info('Database connection established');

    // Get ApiKeyService from container
    const apiKeyService = Container.get(ApiKeyService);

    // Add sample DeepSeek API keys
    // NOTE: These are placeholder keys - replace with actual keys for testing
    const sampleKeys = [
      {
        provider: 'deepseek',
        key: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        quota: 1000
      },
      {
        provider: 'deepseek',
        key: 'sk-yyyyyyyyyyyyyyyyyyyyyyyyyyyy',
        quota: 1000
      },
      {
        provider: 'deepseek',
        key: 'sk-zzzzzzzzzzzzzzzzzzzzzzzzzzzzz',
        quota: 1000
      }
    ];

    for (const sampleKey of sampleKeys) {
      try {
        await apiKeyService.addApiKey(sampleKey.provider, sampleKey.key, sampleKey.quota);
        logger.info(`API key added: ${sampleKey.provider} (quota: ${sampleKey.quota})`);
      } catch (error) {
        logger.warn(`Failed to add API key (may already exist):`, error);
      }
    }

    // Display usage statistics
    const stats = await apiKeyService.getUsageStats();
    logger.info('Current API key statistics:', stats);

    logger.info('Sample API keys seeded successfully');
  } catch (error) {
    logger.error('Failed to seed API keys:', error);
    throw error;
  } finally {
    await AppDataSource.destroy();
  }
}

// Run if executed directly
if (require.main === module) {
  seedApiKeys()
    .then(() => {
      console.log('✅ API keys seeded successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Failed to seed API keys:', error);
      process.exit(1);
    });
}
