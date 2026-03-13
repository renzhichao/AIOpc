/**
 * 认证相关类型定义
 */

export interface User {
  id: string;
  feishu_user_id: string;
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
