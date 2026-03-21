/**
 * OAuth Providers Module
 *
 * Exports all OAuth provider implementations and related types.
 * Supports multiple platforms: Feishu, DingTalk.
 *
 * @module auth/providers
 */

// Feishu OAuth Provider
export { FeishuOAuthProvider } from './FeishuOAuthProvider';

// DingTalk OAuth Provider
export { DingTalkOAuthProvider } from './DingTalkOAuthProvider';
export { DingTalkErrorHandler } from './DingTalkErrorHandler';
export {
  DingTalkOAuthConfig,
  DingTalkTokenRequest,
  DingTalkTokenResponse,
  DingTalkUserInfo,
  DingTalkErrorResponse,
  DEFAULT_DINGTALK_CONFIG
} from './DingTalkOAuthConfig';
