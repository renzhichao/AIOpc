/**
 * ProviderFactory - OAuth Provider Factory
 *
 * Manages registration and instantiation of OAuth providers.
 * Implements factory pattern for creating platform-specific OAuth provider instances.
 *
 * Responsibilities:
 * - Register OAuth provider instances
 * - Retrieve provider by platform type
 * - List available/registered platforms
 * - Validate platform availability
 *
 * @module auth/ProviderFactory
 */

import type {
  IOAuthProvider,
  IOAuthProviderFactory,
  OAuthPlatform
} from './interfaces/IOAuthProvider';
import { OAuthError, OAuthErrorType } from './interfaces/OAuthTypes';
import { logger } from '../config/logger';

/**
 * Provider Factory Implementation
 *
 * Singleton factory that manages OAuth provider instances.
 * Uses dependency injection to register and retrieve providers.
 *
 * @class
 * @implements IOAuthProviderFactory
 */
export class ProviderFactory implements IOAuthProviderFactory {
  /**
   * Map of registered providers keyed by platform type
   * @private
   */
  private readonly providers: Map<OAuthPlatform, IOAuthProvider>;

  /**
   * Create a new ProviderFactory instance
   *
   * Initializes empty provider registry.
   */
  constructor() {
    this.providers = new Map<OAuthPlatform, IOAuthProvider>();
    logger.info('[ProviderFactory] Factory initialized');
  }

  /**
   * Register a new OAuth provider instance
   *
   * Associates a provider instance with its platform type.
   * If a provider for the platform already exists, it will be replaced.
   *
   * @param platform - Platform identifier
   * @param provider - Provider instance to register
   * @throws {OAuthError} If provider is null or undefined
   *
   * @example
   * ```typescript
   * const factory = new ProviderFactory();
   * const feishuProvider = new FeishuOAuthProvider();
   * factory.registerProvider(OAuthPlatform.FEISHU, feishuProvider);
   * ```
   */
  registerProvider(platform: OAuthPlatform, provider: IOAuthProvider): void {
    if (!provider) {
      throw new OAuthError(
        OAuthErrorType.CONFIG_MISSING,
        platform,
        `Cannot register null or undefined provider for platform: ${platform}`
      );
    }

    // Validate provider implements required interface
    if (typeof provider.getPlatformType !== 'function') {
      throw new OAuthError(
        OAuthErrorType.CONFIG_MISSING,
        platform,
        `Provider must implement getPlatformType() method`
      );
    }

    // Verify provider's platform matches registration
    const providerPlatform = provider.getPlatformType();
    if (providerPlatform !== platform) {
      logger.warn('[ProviderFactory] Platform mismatch', {
        registrationPlatform: platform,
        providerPlatform: providerPlatform
      });
    }

    this.providers.set(platform, provider);

    logger.info('[ProviderFactory] Provider registered', {
      platform,
      totalProviders: this.providers.size
    });
  }

  /**
   * Get provider instance for specified platform
   *
   * Retrieves the registered provider for the given platform.
   * Throws error if platform is not registered.
   *
   * @param platform - Platform identifier
   * @returns Provider instance for the platform
   * @throws {OAuthError} If platform is not registered
   *
   * @example
   * ```typescript
   * const provider = factory.getProvider(OAuthPlatform.FEISHU);
   * const authUrl = await provider.getAuthorizationUrl(redirectUri, state);
   * ```
   */
  getProvider(platform: OAuthPlatform): IOAuthProvider {
    const provider = this.providers.get(platform);

    if (!provider) {
      const availablePlatforms = Array.from(this.providers.keys()).join(', ');
      throw new OAuthError(
        OAuthErrorType.CONFIG_MISSING,
        platform,
        `No provider registered for platform: ${platform}. ` +
        `Available platforms: ${availablePlugins || 'none'}`
      );
    }

    logger.debug('[ProviderFactory] Provider retrieved', {
      platform
    });

    return provider;
  }

  /**
   * Get list of available platforms
   *
   * Returns array of all registered platform identifiers.
   *
   * @returns Array of platform identifiers
   *
   * @example
   * ```typescript
   * const platforms = factory.getAvailablePlatforms();
   * console.log(platforms); // ['feishu', 'dingtalk']
   * ```
   */
  getAvailablePlatforms(): OAuthPlatform[] {
    const platforms = Array.from(this.providers.keys());

    logger.debug('[ProviderFactory] Available platforms listed', {
      platforms,
      count: platforms.length
    });

    return platforms;
  }

  /**
   * Check if platform is available
   *
   * Tests whether a provider has been registered for the given platform.
   *
   * @param platform - Platform identifier
   * @returns true if platform is registered and available
   *
   * @example
   * ```typescript
   * if (factory.hasPlatform(OAuthPlatform.DINGTALK)) {
   *   // DingTalk OAuth is available
   * }
   * ```
   */
  hasPlatform(platform: OAuthPlatform): boolean {
    const hasPlatform = this.providers.has(platform);

    logger.debug('[ProviderFactory] Platform availability checked', {
      platform,
      available: hasPlatform
    });

    return hasPlatform;
  }

  /**
   * Get count of registered providers
   *
   * Returns the number of providers currently registered.
   *
   * @returns Number of registered providers
   *
   * @example
   * ```typescript
   * const count = factory.getProviderCount();
   * console.log(`Registered ${count} OAuth providers`);
   * ```
   */
  getProviderCount(): number {
    return this.providers.size;
  }

  /**
   * Clear all registered providers
   *
   * Removes all providers from the factory.
   * Primarily used for testing and cleanup.
   *
   * @example
   * ```typescript
   * factory.clearProviders();
   * console.log(factory.getProviderCount()); // 0
   * ```
   */
  clearProviders(): void {
    const previousCount = this.providers.size;
    this.providers.clear();

    logger.info('[ProviderFactory] All providers cleared', {
      previousCount
    });
  }

  /**
   * Get detailed information about registered providers
   *
   * Returns an array of objects containing platform type and
   * provider class name for each registered provider.
   *
   * @returns Array of provider information objects
   *
   * @example
   * ```typescript
   * const info = factory.getProvidersInfo();
   * console.log(info);
   * // [
   * //   { platform: 'feishu', className: 'FeishuOAuthProvider' },
   * //   { platform: 'dingtalk', className: 'DingTalkOAuthProvider' }
   * // ]
   * ```
   */
  getProvidersInfo(): Array<{ platform: OAuthPlatform; className: string }> {
    const info = Array.from(this.providers.entries()).map(([platform, provider]) => ({
      platform,
      className: provider.constructor.name
    }));

    logger.debug('[ProviderFactory] Providers info retrieved', {
      providers: info
    });

    return info;
  }

  /**
   * Batch register multiple providers
   *
   * Registers multiple providers in a single operation.
   * Useful for initializing all providers at startup.
   *
   * @param providers - Map of platform to provider instances
   *
   * @example
   * ```typescript
   * factory.registerProviders(new Map([
   *   [OAuthPlatform.FEISHU, feishuProvider],
   *   [OAuthPlatform.DINGTALK, dingtalkProvider]
   * ]));
   * ```
   */
  registerProviders(providers: Map<OAuthPlatform, IOAuthProvider>): void {
    let registeredCount = 0;

    for (const [platform, provider] of providers.entries()) {
      try {
        this.registerProvider(platform, provider);
        registeredCount++;
      } catch (error) {
        logger.error('[ProviderFactory] Failed to register provider in batch', {
          platform,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        // Continue registering other providers
      }
    }

    logger.info('[ProviderFactory] Batch registration completed', {
      requested: providers.size,
      registered: registeredCount,
      failed: providers.size - registeredCount
    });
  }
}
