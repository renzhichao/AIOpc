/**
 * OAuth Interfaces Module
 *
 * Central export point for all OAuth-related interfaces and types.
 * This module provides the abstraction layer for multi-platform OAuth support.
 *
 * @module auth/interfaces
 *
 * @example
 * ```typescript
 * import {
 *   IOAuthProvider,
 *   OAuthPlatform,
 *   UserProfile,
 *   TokenResponse,
 *   OAuthError
 * } from '@/auth/interfaces';
 *
 * // Use in your code
 * const platform: OAuthPlatform = OAuthPlatform.FEISHU;
 * ```
 */

// Core Interfaces
export type { IOAuthProvider, IOAuthConfig, IOAuthProviderFactory } from './IOAuthProvider';

// Types and Enums
export type {
  UserProfile,
  TokenResponse,
  IOAuthErrorHandler
} from './OAuthTypes';

export {
  OAuthPlatform,
  OAuthErrorType,
  OAuthError
} from './OAuthTypes';
