import { Service } from 'typedi';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import { UserRepository } from '../repositories/UserRepository';
import { InstanceRepository } from '../repositories/InstanceRepository';
import { User } from '../entities/User.entity';
import { logger } from '../config/logger';
import { LogSanitizer } from '../utils/LogSanitizer';
import type { StringValue } from 'ms';
import {
  FeishuAuthUrlOptions,
  FeishuTokenResponse,
  FeishuUserInfo,
  JwtPayload,
  OAuthTokenResponse
} from '../types/oauth.types';
import { ProviderFactory } from '../auth/ProviderFactory';
import { FeishuOAuthProvider } from '../auth/providers/FeishuOAuthProvider';
import { DingTalkOAuthProvider } from '../auth/providers/DingTalkOAuthProvider';
import { OAuthPlatform, UserProfile } from '../auth/interfaces/OAuthTypes';
import type { IOAuthProvider } from '../auth/interfaces/IOAuthProvider';

/**
 * OAuth Platform Information
 */
interface OAuthPlatformInfo {
  platform: OAuthPlatform;
  enabled: boolean;
  isDefault: boolean;
}

/**
 * OAuth 2.0 Service (Multi-Platform Support)
 *
 * Handles OAuth flows for multiple platforms including Feishu and DingTalk.
 * Manages authorization, token exchange, user authentication, and instance claiming.
 *
 * Architecture:
 * - ProviderFactory: Manages platform provider instances
 * - IOAuthProvider: Abstraction layer for platform-specific OAuth implementations
 * - Backward Compatibility: Defaults to Feishu for existing integrations
 *
 * @service
 */
@Service()
export class OAuthService {
  private readonly providerFactory: ProviderFactory;
  private readonly defaultPlatform: OAuthPlatform;
  private readonly enabledPlatforms: OAuthPlatform[];

  constructor(
    private readonly userRepository: UserRepository,
    private readonly instanceRepository: InstanceRepository
  ) {
    // Initialize provider factory
    this.providerFactory = new ProviderFactory();

    // Load configuration
    this.defaultPlatform = this.loadDefaultPlatform();
    this.enabledPlatforms = this.loadEnabledPlatforms();

    // Register providers based on enabled platforms
    this.registerProviders();

    logger.info('[OAuthService] Service initialized', {
      defaultPlatform: this.defaultPlatform,
      enabledPlatforms: this.enabledPlatforms,
      providerCount: this.providerFactory.getProviderCount()
    });
  }

  /**
   * Get list of enabled OAuth platforms
   *
   * Returns all platforms that are configured and enabled in the system.
   *
   * @returns Promise<OAuthPlatformInfo[]> Array of platform information
   *
   * @example
   * ```typescript
   * const platforms = await oauthService.getEnabledPlatforms();
   * console.log(platforms);
   * // [
   * //   { platform: 'feishu', enabled: true, isDefault: true },
   * //   { platform: 'dingtalk', enabled: true, isDefault: false }
   * // ]
   * ```
   */
  async getEnabledPlatforms(): Promise<OAuthPlatformInfo[]> {
    const platforms: OAuthPlatformInfo[] = [];

    for (const platform of this.enabledPlatforms) {
      platforms.push({
        platform,
        enabled: true,
        isDefault: platform === this.defaultPlatform
      });
    }

    logger.debug('[OAuthService] Retrieved enabled platforms', {
      platforms,
      count: platforms.length
    });

    return platforms;
  }

  /**
   * Get OAuth provider for specified platform
   *
   * Retrieves the provider instance for the given platform.
   * Throws error if platform is not enabled.
   *
   * @param platform - Platform identifier
   * @returns IOAuthProvider instance
   * @throws {Error} If platform is not enabled
   * @private
   */
  private getProvider(platform: OAuthPlatform): IOAuthProvider {
    if (!this.enabledPlatforms.includes(platform)) {
      throw new Error(
        `Platform ${platform} is not enabled. ` +
        `Enabled platforms: ${this.enabledPlatforms.join(', ')}`
      );
    }

    return this.providerFactory.getProvider(platform);
  }

  /**
   * Generate OAuth authorization URL for specified platform
   *
   * Creates the complete URL for redirecting users to the platform's authorization page.
   * Defaults to Feishu platform for backward compatibility.
   *
   * @param platform - OAuth platform (defaults to 'feishu')
   * @param options - Authorization URL options
   * @returns Authorization URL
   * @throws {Error} If platform is not enabled or configuration is missing
   *
   * @example
   * ```typescript
   * // Feishu OAuth (backward compatible)
   * const url = await oauthService.getAuthorizationUrl(undefined, {
   *   redirect_uri: 'https://example.com/callback',
   *   state: 'random-state'
   * });
   *
   * // DingTalk OAuth
   * const url = await oauthService.getAuthorizationUrl('dingtalk', {
   *   redirect_uri: 'https://example.com/callback',
   *   state: 'random-state'
   * });
   * ```
   */
  async getAuthorizationUrl(
    platform?: OAuthPlatform,
    options: FeishuAuthUrlOptions = {}
  ): Promise<string> {
    // Default to Feishu for backward compatibility
    const targetPlatform: OAuthPlatform = platform || this.defaultPlatform;

    // Get provider for platform
    const provider = this.getProvider(targetPlatform);

    // Generate state if not provided
    const state = options.state || this.generateState();

    // Get redirect URI from options or environment
    const redirectUri = options.redirect_uri || this.getRedirectUri(targetPlatform);

    // Generate authorization URL
    const authUrl = await provider.getAuthorizationUrl(redirectUri, state);

    // Validate generated URL
    if (authUrl.includes('undefined')) {
      LogSanitizer.log('error', 'Generated OAuth URL contains "undefined"', {
        platform: targetPlatform,
        url: authUrl
      });
      throw new Error(
        `Failed to generate valid OAuth URL for ${targetPlatform}. ` +
        'URL contains undefined values. Please check your environment configuration.'
      );
    }

    LogSanitizer.log('info', `Generated ${targetPlatform} authorization URL`, {
      platform: targetPlatform,
      state
    });

    return authUrl;
  }

  /**
   * Handle OAuth callback and exchange authorization code for tokens
   *
   * Processes the OAuth callback from the specified platform, exchanges
   * the authorization code for tokens, retrieves user info, and creates
   * or updates the user in the database.
   *
   * Defaults to Feishu platform for backward compatibility.
   *
   * @param platform - OAuth platform (defaults to 'feishu')
   * @param authCode - Authorization code from OAuth callback
   * @returns OAuth Token response with user info
   * @throws {Error} If token exchange fails or user creation fails
   *
   * @example
   * ```typescript
   * // Feishu callback (backward compatible)
   * const result = await oauthService.handleCallback(undefined, 'auth_code_here');
   *
   * // DingTalk callback
   * const result = await oauthService.handleCallback('dingtalk', 'auth_code_here');
   * ```
   */
  async handleCallback(
    platform?: OAuthPlatform,
    authCode: string
  ): Promise<OAuthTokenResponse> {
    // Default to Feishu for backward compatibility
    const targetPlatform: OAuthPlatform = platform || this.defaultPlatform;

    try {
      // Get provider for platform
      const provider = this.getProvider(targetPlatform);

      // Exchange code for token
      const tokenResponse = await provider.exchangeCodeForToken(authCode);

      // Get user info from token response or separate API call
      let userProfile: UserProfile;

      // Feishu returns user info in token response
      if (targetPlatform === OAuthPlatform.FEISHU && tokenResponse.raw) {
        // Map Feishu user info to UserProfile
        const feishuUserInfo = tokenResponse.raw as any;
        userProfile = {
          platform: targetPlatform,
          user_id: feishuUserInfo.open_id,
          union_id: feishuUserInfo.union_id,
          name: feishuUserInfo.name,
          en_name: feishuUserInfo.en_name,
          email: feishuUserInfo.email,
          avatar_url: feishuUserInfo.avatar_url,
          raw: feishuUserInfo
        };
      } else {
        // DingTalk requires separate API call
        userProfile = await provider.getUserInfo(tokenResponse.access_token);
      }

      LogSanitizer.log('info', `User info retrieved from ${targetPlatform}`, {
        platform: targetPlatform,
        user_id: userProfile.user_id,
        union_id: userProfile.union_id,
        name: userProfile.name
      });

      // Find or create user in database
      const user = await this.findOrCreateUser(targetPlatform, userProfile);

      // Update last login time
      await this.userRepository.updateLastLogin(user.id);

      // Auto-claim unclaimed instance
      const claimedInstance = await this.autoClaimInstanceIfAvailable(user.id);

      // Generate JWT tokens
      const jwtPayload: JwtPayload = {
        userId: user.id,
        feishuUserId: targetPlatform === OAuthPlatform.FEISHU ? userProfile.user_id : undefined,
        feishuUnionId: targetPlatform === OAuthPlatform.FEISHU ? userProfile.union_id : undefined,
        name: user.name,
        email: user.email || undefined
      };

      const accessToken = this.generateJWTToken(jwtPayload);
      const refreshToken = this.generateRefreshToken(jwtPayload);

      LogSanitizer.log('info', `OAuth callback successful for ${targetPlatform}`, {
        userId: user.id,
        platform: targetPlatform
      });

      return {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: parseInt(process.env.JWT_EXPIRES_IN || '604800'), // 7 days
        token_type: 'Bearer',
        user: {
          id: user.id,
          feishu_user_id: user.feishu_user_id,
          name: user.name,
          email: user.email
        },
        // Auto-claim response fields
        has_instance: !!claimedInstance,
        instance_id: claimedInstance?.instance_id || null,
        redirect_to: claimedInstance ? '/chat' : '/no-instance'
      };
    } catch (error) {
      LogSanitizer.log('error', `OAuth callback failed for ${targetPlatform}`, {
        platform: targetPlatform,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error(`OAuth callback failed for ${targetPlatform}`);
    }
  }

  /**
   * Refresh JWT Token
   * @param refreshToken Refresh token
   * @returns New access token
   */
  async refreshToken(refreshToken: string): Promise<{ access_token: string }> {
    try {
      const payload = jwt.verify(
        refreshToken,
        process.env.JWT_SECRET!
      ) as JwtPayload;

      const newAccessToken = this.generateJWTToken({
        userId: payload.userId,
        feishuUserId: payload.feishuUserId,
        feishuUnionId: payload.feishuUnionId,
        name: payload.name,
        email: payload.email
      });

      LogSanitizer.log('info', 'Token refresh successful', { userId: payload.userId });

      return { access_token: newAccessToken };
    } catch (error) {
      LogSanitizer.log('error', 'Token refresh failed', error);
      throw new Error('Invalid refresh token');
    }
  }

  /**
   * Verify JWT Token
   * @param token JWT Token
   * @returns Token payload
   */
  verifyToken(token: string): JwtPayload {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
      return payload;
    } catch (error) {
      LogSanitizer.log('error', 'Token verification failed', error);
      throw new Error('Invalid token');
    }
  }

  /**
   * Load default platform from environment
   * @returns Default platform identifier
   * @private
   */
  private loadDefaultPlatform(): OAuthPlatform {
    const defaultPlatform = (process.env.OAUTH_DEFAULT_PLATFORM || OAuthPlatform.FEISHU) as OAuthPlatform;

    if (defaultPlatform !== OAuthPlatform.FEISHU && defaultPlatform !== OAuthPlatform.DINGTALK) {
      logger.warn('[OAuthService] Invalid default platform in config, defaulting to feishu', {
        configuredDefault: defaultPlatform
      });
      return OAuthPlatform.FEISHU;
    }

    return defaultPlatform;
  }

  /**
   * Load enabled platforms from environment
   * @returns Array of enabled platform identifiers
   * @private
   */
  private loadEnabledPlatforms(): OAuthPlatform[] {
    const enabledPlatformsEnv = process.env.OAUTH_ENABLED_PLATFORMS || OAuthPlatform.FEISHU;
    const platforms = enabledPlatformsEnv.split(',').map(p => p.trim()) as OAuthPlatform[];

    // Validate platforms
    const validPlatforms = platforms.filter(p =>
      p === OAuthPlatform.FEISHU || p === OAuthPlatform.DINGTALK
    );

    if (validPlatforms.length === 0) {
      logger.warn('[OAuthService] No valid platforms configured, defaulting to feishu');
      return [OAuthPlatform.FEISHU];
    }

    return validPlatforms;
  }

  /**
   * Register OAuth providers with factory
   * @private
   */
  private registerProviders(): void {
    // Register Feishu provider if enabled
    if (this.enabledPlatforms.includes(OAuthPlatform.FEISHU)) {
      try {
        const feishuProvider = new FeishuOAuthProvider();
        this.providerFactory.registerProvider(OAuthPlatform.FEISHU, feishuProvider);
        logger.info('[OAuthService] Feishu provider registered');
      } catch (error) {
        logger.error('[OAuthService] Failed to register Feishu provider', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // Register DingTalk provider if enabled
    if (this.enabledPlatforms.includes(OAuthPlatform.DINGTALK)) {
      try {
        const dingtalkProvider = new DingTalkOAuthProvider();
        this.providerFactory.registerProvider(OAuthPlatform.DINGTALK, dingtalkProvider);
        logger.info('[OAuthService] DingTalk provider registered');
      } catch (error) {
        logger.error('[OAuthService] Failed to register DingTalk provider', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    logger.info('[OAuthService] Provider registration completed', {
      registeredCount: this.providerFactory.getProviderCount(),
      requestedCount: this.enabledPlatforms.length
    });
  }

  /**
   * Get redirect URI for platform
   * @param platform - Platform identifier
   * @returns Redirect URI
   * @private
   */
  private getRedirectUri(platform: OAuthPlatform): string {
    const redirectUriKey = `${platform.toUpperCase()}_REDIRECT_URI` as keyof NodeJS.ProcessEnv;
    return process.env[redirectUriKey] || process.env.OAUTH_REDIRECT_URI || '';
  }

  /**
   * Find or create user based on platform and user profile
   * @param platform - OAuth platform
   * @param userProfile - User profile from OAuth provider
   * @returns User entity
   * @private
   */
  private async findOrCreateUser(platform: OAuthPlatform, userProfile: UserProfile): Promise<User> {
    let user: User | null = null;

    // Try to find existing user by platform-specific user ID
    if (platform === OAuthPlatform.FEISHU) {
      user = await this.userRepository.findByFeishuUserId(userProfile.user_id);
    } else if (platform === OAuthPlatform.DINGTALK) {
      user = await this.userRepository.findByDingtalkUserId(userProfile.user_id);
    }

    // If not found, check for recovered users (temporary migration logic)
    if (!user) {
      user = await this.handleRecoveredUser(platform, userProfile);
    }

    // If still not found, create new user
    if (!user) {
      const newUserData: any = {
        name: userProfile.name,
        email: userProfile.email || undefined,
        avatar_url: userProfile.avatar_url,
        oauth_platform: platform
      };

      // Add platform-specific fields
      if (platform === OAuthPlatform.FEISHU) {
        newUserData.feishu_user_id = userProfile.user_id;
        newUserData.feishu_union_id = userProfile.union_id;
      } else if (platform === OAuthPlatform.DINGTALK) {
        newUserData.dingtalk_user_id = userProfile.user_id;
        newUserData.dingtalk_union_id = userProfile.union_id;
      }

      user = await this.userRepository.create(newUserData);
      LogSanitizer.log('info', 'New user created', {
        userId: user.id,
        platform,
        name: user.name
      });
    } else {
      // Update existing user data
      const updateData: Partial<User> = {
        name: userProfile.name,
        email: userProfile.email || undefined,
        avatar_url: userProfile.avatar_url,
        oauth_platform: platform
      };

      // Update platform-specific fields
      if (platform === OAuthPlatform.FEISHU && userProfile.union_id !== undefined) {
        updateData.feishu_union_id = userProfile.union_id;
      } else if (platform === OAuthPlatform.DINGTALK && userProfile.union_id !== undefined) {
        updateData.dingtalk_union_id = userProfile.union_id;
      }

      await this.userRepository.update(user.id, updateData);
      const updatedUser = await this.userRepository.findById(user.id);
      if (updatedUser) {
        user = updatedUser;
      }
      LogSanitizer.log('info', 'Existing user updated', {
        userId: user.id,
        platform,
        name: user.name
      });
    }

    return user;
  }

  /**
   * Handle recovered user (temporary migration logic)
   * @param platform - OAuth platform
   * @param userProfile - User profile from OAuth provider
   * @returns User entity or null
   * @private
   */
  private async handleRecoveredUser(
    platform: OAuthPlatform,
    userProfile: UserProfile
  ): Promise<User | null> {
    // Only applies to Feishu platform for data loss recovery (2026-03-18)
    if (platform !== OAuthPlatform.FEISHU) {
      return null;
    }

    try {
      // Data loss recovery special user mapping (based on user name fuzzy matching)
      const recoveredUsersMap: { [key: string]: number } = {
        '向总': 3,
        '李芬': 4,
        '蔡总': 5,
        '张志云': 6
      };

      // Check if user name matches
      let matchedUserId: number | null = null;

      // Exact match
      if (recoveredUsersMap[userProfile.name]) {
        matchedUserId = recoveredUsersMap[userProfile.name];
      } else {
        // Fuzzy match (handles "向总 (待恢复)" scenarios)
        for (const [namePattern, userId] of Object.entries(recoveredUsersMap)) {
          if (userProfile.name.includes(namePattern) || namePattern.includes(userProfile.name)) {
            matchedUserId = userId;
            break;
          }
        }
      }

      // If found matching user
      if (matchedUserId !== null) {
        const tempUser = await this.userRepository.findById(matchedUserId);

        if (tempUser) {
          // Check if this is a temporary user (feishu_user_id starts with pending_recover_)
          if (tempUser.feishu_user_id && tempUser.feishu_user_id.startsWith('pending_recover_')) {
            LogSanitizer.log('info', 'Found recovered user, updating with real Feishu credentials', {
              userId: tempUser.id,
              userName: tempUser.name,
              oldFeishuId: tempUser.feishu_user_id,
              newFeishuId: userProfile.user_id
            });

            // Update user with real Feishu ID
            await this.userRepository.update(tempUser.id, {
              feishu_user_id: userProfile.user_id,
              feishu_union_id: userProfile.union_id || undefined,
              name: userProfile.name,
              email: userProfile.email || undefined,
              avatar_url: userProfile.avatar_url,
              oauth_platform: OAuthPlatform.FEISHU
            });

            // Re-fetch updated user
            const updatedUser = await this.userRepository.findById(tempUser.id);

            LogSanitizer.log('info', 'Successfully merged recovered user account', {
              userId: updatedUser?.id,
              feishuUserId: updatedUser?.feishu_user_id
            });

            return updatedUser || null;
          }
        }
      }

      // No matching temporary user found, return null to create new user
      return null;
    } catch (error) {
      // If handling fails, log error but don't interrupt login flow
      LogSanitizer.log('error', 'Failed to handle recovered user', {
        platform,
        userName: userProfile.name,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Auto-claim unclaimed instance for user (TASK-001)
   * @param userId - User ID
   * @returns Claimed instance info or null
   * @private
   */
  private async autoClaimInstanceIfAvailable(userId: number): Promise<{ instance_id: string } | null> {
    try {
      const unclaimedInstance = await this.instanceRepository.findUnclaimed();

      if (unclaimedInstance) {
        await this.instanceRepository.claimInstance(
          unclaimedInstance.instance_id,
          userId
        );

        LogSanitizer.log('info', 'Auto-claimed instance for user', {
          userId: userId,
          instanceId: unclaimedInstance.instance_id
        });

        return { instance_id: unclaimedInstance.instance_id };
      }

      return null;
    } catch (error) {
      // If auto-claim fails, log error but don't interrupt login flow
      LogSanitizer.log('error', 'Failed to auto-claim instance for user', {
        userId: userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Generate JWT access token
   * @param payload - Token payload
   * @returns JWT token
   * @private
   */
  private generateJWTToken(payload: JwtPayload): string {
    const tokenExpiresIn = process.env.JWT_EXPIRES_IN || '7d';
    return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: tokenExpiresIn as StringValue | number });
  }

  /**
   * Generate JWT refresh token
   * @param payload - Token payload
   * @returns JWT token
   * @private
   */
  private generateRefreshToken(payload: JwtPayload): string {
    const refreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '30d';
    return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: refreshExpiresIn as StringValue | number });
  }

  /**
   * Generate random state parameter
   * @returns Random string
   * @private
   */
  private generateState(): string {
    return Math.random().toString(36).substring(2, 15) +
           Math.random().toString(36).substring(2, 15);
  }
}
