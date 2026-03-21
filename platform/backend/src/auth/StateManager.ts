import { Service } from 'typedi';
import { redis } from '../config/redis';
import { logger } from '../config/logger';
import crypto from 'crypto';

/**
 * State metadata stored in Redis
 */
interface StateMetadata {
  /** OAuth platform (feishu/dingtalk) */
  platform: string;
  /** Timestamp when state was created (milliseconds) */
  timestamp: number;
  /** Redirect URI for OAuth callback */
  redirectUri: string;
}

/**
 * State validation result
 */
interface StateValidationResult {
  /** Whether the state is valid */
  valid: boolean;
  /** Platform from the state metadata (if valid) */
  platform?: string;
  /** Redirect URI from the state metadata (if valid) */
  redirectUri?: string;
  /** Error message (if invalid) */
  error?: string;
}

/**
 * OAuth State Manager
 *
 * Manages OAuth 2.0 state parameter lifecycle to prevent CSRF attacks and replay attacks.
 *
 * Security features:
 * - Cryptographically secure random state generation (32 bytes)
 * - State storage in Redis with metadata
 * - 10-minute TTL for automatic expiration
 * - One-time use enforcement (auto-delete on validation)
 *
 * Usage:
 * ```typescript
 * const stateManager = new StateManager();
 *
 * // Generate and store state
 * const state = await stateManager.store('feishu', 'https://example.com/callback');
 *
 * // Validate state (automatically deletes after validation)
 * const result = await stateManager.validate(state);
 * if (result.valid) {
 *   // Proceed with OAuth callback
 *   const platform = result.platform;
 * }
 * ```
 *
 * @see https://datatracker.ietf.org/doc/html/rfc6749#section-10.12
 */
@Service()
export class StateManager {
  /** State parameter TTL in seconds (10 minutes) */
  private static readonly STATE_TTL_SECONDS = 600;

  /** State parameter length in bytes (32 bytes = 256 bits) */
  private static readonly STATE_LENGTH_BYTES = 32;

  /** Redis key prefix for state storage */
  private static readonly REDIS_KEY_PREFIX = 'oauth:state:';

  /**
   * Generate and store a secure OAuth state parameter
   *
   * @param platform - OAuth platform (feishu/dingtalk)
   * @param redirectUri - OAuth callback redirect URI
   * @returns Cryptographically secure random state string
   * @throws {Error} If Redis storage fails
   */
  async store(platform: string, redirectUri: string): Promise<string> {
    try {
      // Generate cryptographically secure random state (32 bytes = 256 bits)
      const state = crypto.randomBytes(StateManager.STATE_LENGTH_BYTES).toString('base64url');

      // Create metadata
      const metadata: StateMetadata = {
        platform,
        timestamp: Date.now(),
        redirectUri
      };

      // Store in Redis with TTL
      const key = this.getRedisKey(state);
      const value = JSON.stringify(metadata);

      await redis.setex(key, StateManager.STATE_TTL_SECONDS, value);

      logger.info('OAuth state generated and stored', {
        platform,
        state: state.substring(0, 8) + '...', // Log only first 8 chars for security
        redirectUri
      });

      return state;
    } catch (error) {
      logger.error('Failed to store OAuth state', {
        platform,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error('Failed to generate OAuth state parameter');
    }
  }

  /**
   * Validate OAuth state parameter
   *
   * Performs the following checks:
   * 1. State exists in Redis
   * 2. State has not expired (TTL enforced by Redis)
   * 3. One-time use enforcement (state is deleted after validation)
   *
   * @param state - State parameter from OAuth callback
   * @returns Validation result with metadata if valid
   */
  async validate(state: string): Promise<StateValidationResult> {
    try {
      const key = this.getRedisKey(state);

      // Get state metadata from Redis
      const value = await redis.get(key);

      if (!value) {
        logger.warn('OAuth state not found or expired', {
          state: state.substring(0, 8) + '...'
        });
        return {
          valid: false,
          error: 'State parameter not found or has expired'
        };
      }

      // Parse metadata
      const metadata: StateMetadata = JSON.parse(value);

      // Delete state to enforce one-time use
      await redis.del(key);

      // Validate timestamp (defense in depth, Redis TTL should have already expired)
      const ageMs = Date.now() - metadata.timestamp;
      const maxAgeMs = StateManager.STATE_TTL_SECONDS * 1000;

      if (ageMs > maxAgeMs) {
        logger.warn('OAuth state expired', {
          platform: metadata.platform,
          ageSeconds: Math.floor(ageMs / 1000),
          maxAgeSeconds: StateManager.STATE_TTL_SECONDS
        });
        return {
          valid: false,
          error: 'State parameter has expired'
        };
      }

      logger.info('OAuth state validated successfully', {
        platform: metadata.platform,
        ageSeconds: Math.floor(ageMs / 1000)
      });

      return {
        valid: true,
        platform: metadata.platform,
        redirectUri: metadata.redirectUri
      };
    } catch (error) {
      logger.error('Failed to validate OAuth state', {
        state: state.substring(0, 8) + '...',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return {
        valid: false,
        error: 'Failed to validate state parameter'
      };
    }
  }

  /**
   * Manually delete a state parameter
   *
   * Useful for cleanup or explicit state invalidation
   *
   * @param state - State parameter to delete
   * @returns True if state was deleted, false if it didn't exist
   */
  async delete(state: string): Promise<boolean> {
    try {
      const key = this.getRedisKey(state);
      const result = await redis.del(key);

      if (result > 0) {
        logger.info('OAuth state deleted manually', {
          state: state.substring(0, 8) + '...'
        });
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Failed to delete OAuth state', {
        state: state.substring(0, 8) + '...',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Get Redis key for state storage
   *
   * @param state - State parameter
   * @returns Redis key with prefix
   */
  private getRedisKey(state: string): string {
    return `${StateManager.REDIS_KEY_PREFIX}${state}`;
  }

  /**
   * Get remaining TTL for a state in seconds
   *
   * Useful for monitoring and debugging
   *
   * @param state - State parameter
   * @returns Remaining TTL in seconds, or -1 if state doesn't exist
   */
  async getTTL(state: string): Promise<number> {
    try {
      const key = this.getRedisKey(state);
      return await redis.ttl(key);
    } catch (error) {
      logger.error('Failed to get state TTL', {
        state: state.substring(0, 8) + '...',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return -1;
    }
  }

  /**
   * Clean up expired states (manual cleanup)
   *
   * Note: Redis automatically handles expiration via TTL.
   * This method is provided for manual cleanup if needed.
   *
   * @returns Number of states cleaned up
   */
  async cleanup(): Promise<number> {
    // This is a no-op since Redis handles TTL automatically
    // Kept for API completeness and potential future use cases
    logger.info('OAuth state cleanup requested (handled by Redis TTL automatically)');
    return 0;
  }
}
