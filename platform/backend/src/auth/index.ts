/**
 * Authentication Module
 *
 * Central export point for all authentication-related functionality.
 * Includes OAuth providers, factory, interfaces, and utilities.
 *
 * @module auth
 *
 * @example
 * ```typescript
 * import {
 *   ProviderFactory,
 *   FeishuOAuthProvider,
 *   DingTalkOAuthProvider,
 *   OAuthPlatform,
 *   IOAuthProvider
 * } from '@/auth';
 *
 * // Create factory and register providers
 * const factory = new ProviderFactory();
 * factory.registerProvider(OAuthPlatform.FEISHU, new FeishuOAuthProvider());
 * factory.registerProvider(OAuthPlatform.DINGTALK, new DingTalkOAuthProvider());
 *
 * // Get provider
 * const provider = factory.getProvider(OAuthPlatform.FEISHU);
 * const authUrl = await provider.getAuthorizationUrl(redirectUri, state);
 * ```
 */

// Factory
export { ProviderFactory } from './ProviderFactory';

// Providers
export { FeishuOAuthProvider } from './providers/FeishuOAuthProvider';
export { DingTalkOAuthProvider } from './providers/DingTalkOAuthProvider';
export { DingTalkErrorHandler } from './providers/DingTalkErrorHandler';

// Base Provider
export { BaseOAuthProvider } from './BaseOAuthProvider';

// State Manager (TASK-001)
export { StateManager } from './StateManager';

// Interfaces and Types
export type {
  IOAuthProvider,
  IOAuthConfig,
  IOAuthProviderFactory
} from './interfaces/IOAuthProvider';

export type {
  UserProfile,
  TokenResponse,
  IOAuthErrorHandler
} from './interfaces/OAuthTypes';

export {
  OAuthPlatform,
  OAuthErrorType,
  OAuthError
} from './interfaces/OAuthTypes';
