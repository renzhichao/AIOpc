/**
 * 认证相关类型定义
 */

/**
 * OAuth 平台类型
 */
export type OAuthPlatform = 'feishu' | 'dingtalk';

/**
 * OAuth 平台信息
 */
export interface OAuthPlatformInfo {
  platform: OAuthPlatform;
  enabled: boolean;
  isDefault: boolean;
}

/**
 * 平台显示配置
 */
export interface PlatformDisplayConfig {
  id: OAuthPlatform;
  name: string;
  description: string;
  iconUrl: string;
  color: string;
  bgColor: string;
}

export interface User {
  id: string;
  feishu_user_id?: string;
  dingtalk_user_id?: string;
  oauth_platform: OAuthPlatform;
  name: string;
  email?: string;
  avatar_url?: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface AuthContextValue extends AuthState {
  login: (token: string, user: User) => void;
  logout: () => void;
  refreshToken: () => Promise<void>;
  clearError: () => void;
}

export interface LoginResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  user: User;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * QR Code API Types
 */

export interface ClaimQRCode {
  id: string;
  token: string;
  expires_at: string;
  image_url: string;
  scan_url: string;
}

export interface ClaimQRCodeResponse {
  success: boolean;
  already_has_instance: boolean;
  qr_code?: ClaimQRCode;
  instance?: InstanceInfo;
  redirect_to?: string;
}

export interface InstanceInfo {
  instance_id: string;
  status?: string;
  [key: string]: unknown;
}
