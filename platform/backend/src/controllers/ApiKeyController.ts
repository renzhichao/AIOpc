import { Controller, Get, Post, Delete, Param, QueryParam } from 'routing-controllers';
import { Service } from 'typedi';
import { ApiKeyService } from '../services/ApiKeyService';
import { logger } from '../config/logger';

/**
 * API Key Controller
 *
 * Provides REST endpoints for API key management and statistics.
 */
@Service()
@Controller('/api-keys')
export class ApiKeyController {
  constructor(
    private readonly apiKeyService: ApiKeyService
  ) {}

  /**
   * Get API key usage statistics
   * GET /api/api-keys/stats
   */
  @Get('/stats')
  async getStats() {
    try {
      const stats = await this.apiKeyService.getUsageStats();
      return { success: true, data: stats };
    } catch (error) {
      logger.error('Failed to get API key stats', error);
      return { success: false, error: 'Failed to get statistics' };
    }
  }

  /**
   * Get keys near quota limit
   * GET /api/api-keys/near-quota?threshold=0.8
   */
  @Get('/near-quota')
  async getNearQuota(@QueryParam('threshold') threshold: string = '0.8') {
    try {
      const keys = await this.apiKeyService.getNearQuotaLimit(parseFloat(threshold));
      return { success: true, data: keys };
    } catch (error) {
      logger.error('Failed to get keys near quota', error);
      return { success: false, error: 'Failed to get keys' };
    }
  }

  /**
   * Get provider-specific statistics
   * GET /api/api-keys/provider/:provider/stats
   */
  @Get('/provider/:provider/stats')
  async getProviderStats(@Param('provider') provider: string) {
    try {
      const stats = await this.apiKeyService.getProviderStats(provider);
      return { success: true, data: stats };
    } catch (error) {
      logger.error('Failed to get provider stats', error);
      return { success: false, error: 'Failed to get provider statistics' };
    }
  }

  /**
   * Get keys with usage information
   * GET /api/api-keys/provider/:provider/usage
   */
  @Get('/provider/:provider/usage')
  async getKeysWithUsage(@Param('provider') provider: string) {
    try {
      const keys = await this.apiKeyService.getKeysWithUsage(provider);
      return { success: true, data: keys };
    } catch (error) {
      logger.error('Failed to get keys with usage', error);
      return { success: false, error: 'Failed to get keys' };
    }
  }

  /**
   * Deactivate an API key
   * DELETE /api/api-keys/:id/deactivate
   */
  @Delete('/:id/deactivate')
  async deactivateKey(@Param('id') id: string) {
    try {
      await this.apiKeyService.deactivateKey(parseInt(id));
      return { success: true, message: 'API key deactivated' };
    } catch (error) {
      logger.error('Failed to deactivate API key', error);
      return { success: false, error: 'Failed to deactivate key' };
    }
  }

  /**
   * Activate an API key
   * POST /api/api-keys/:id/activate
   */
  @Post('/:id/activate')
  async activateKey(@Param('id') id: string) {
    try {
      await this.apiKeyService.activateKey(parseInt(id));
      return { success: true, message: 'API key activated' };
    } catch (error) {
      logger.error('Failed to activate API key', error);
      return { success: false, error: 'Failed to activate key' };
    }
  }

  /**
   * Validate an API key
   * GET /api/api-keys/:id/validate
   */
  @Get('/:id/validate')
  async validateKey(@Param('id') id: string) {
    try {
      const isValid = await this.apiKeyService.validateKey(parseInt(id));
      return { success: true, data: { valid: isValid } };
    } catch (error) {
      logger.error('Failed to validate API key', error);
      return { success: false, error: 'Failed to validate key' };
    }
  }
}
