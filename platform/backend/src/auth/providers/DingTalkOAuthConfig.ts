/**
 * DingTalk OAuth Configuration
 *
 * Defines the configuration structure for DingTalk OAuth provider.
 * All fields are optional to allow validation to handle missing config.
 *
 * @module auth/providers/DingTalkOAuthConfig
 */

/**
 * DingTalk OAuth Configuration Interface
 *
 * Contains all configuration needed for DingTalk OAuth 2.0 flow.
 *
 * @interface
 */
export interface DingTalkOAuthConfig {
  /** DingTalk AppKey (also known as ClientID) */
  appKey: string;

  /** DingTalk AppSecret (also known as ClientSecret) */
  appSecret: string;

  /** Enterprise ID (optional, for enterprise internal apps) */
  corpId?: string;

  /** OAuth authorization URL */
  authorizeUrl: string;

  /** Token exchange URL */
  tokenUrl: string;

  /** User info API URL */
  userInfoUrl: string;

  /** OAuth callback redirect URI */
  redirectUri: string;

  /** OAuth scope(s) to request */
  scope?: string[];
}

/**
 * DingTalk API Request/Response Types
 *
 * These types match the official DingTalk OAuth 2.0 API specification.
 * Documentation: https://open.dingtalk.com/document/orgapp-server/obtain-user-token
 */

/**
 * Token Request Body
 *
 * @interface
 */
export interface DingTalkTokenRequest {
  /** AppKey (ClientID) */
  clientId: string;

  /** Authorization code received from OAuth callback */
  code: string;

  /** Grant type - always "authorization_code" for OAuth 2.0 */
  grantType: 'authorization_code';

  /** Refresh token (optional, for refresh flow) */
  refreshToken?: string;
}

/**
 * Token Response from DingTalk API
 *
 * @interface
 */
export interface DingTalkTokenResponse {
  /** Access token for API calls */
  accessToken: string;

  /** Token type (typically "Bearer") */
  tokenType: string;

  /** Token expiration time in seconds */
  expiresIn: number;

  /** Refresh token (optional, not always provided) */
  refreshToken?: string;
}

/**
 * User Information from DingTalk API
 *
 * @interface
 */
export interface DingTalkUserInfo {
  /** Cross-enterprise unique user identifier */
  unionId: string;

  /** Enterprise-specific unique user identifier */
  userId: string;

  /** User display name */
  name: string;

  /** Profile avatar URL */
  avatarUrl: string;

  /** User state code */
  stateCode: string;

  /** User email address (optional) */
  email?: string;

  /** User mobile number (optional) */
  mobile?: string;

  /** Department order list (optional) */
  deptOrderList?: Array<{
    deptId: number;
    order: number;
  }>;
}

/**
 * DingTalk API Error Response
 *
 * @interface
 */
export interface DingTalkErrorResponse {
  /** DingTalk error code */
  code: string;

  /** Error message */
  message: string;

  /** Request ID for troubleshooting (optional) */
  requestId?: string;
}

/**
 * Default DingTalk OAuth Configuration
 *
 * Provides default values for DingTalk OAuth endpoints.
 * Override with environment variables as needed.
 */
export const DEFAULT_DINGTALK_CONFIG: Partial<DingTalkOAuthConfig> = {
  authorizeUrl: 'https://login.dingtalk.com/oauth2/auth',
  tokenUrl: 'https://api.dingtalk.com/v1.0/oauth2/userAccessToken',
  userInfoUrl: 'https://api.dingtalk.com/v1.0/contact/users/me',
  scope: ['openid', 'corpid'] // Get user info and enterprise info
};
