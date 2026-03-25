/**
 * 本地存储工具
 */

import type { User } from '../types/auth';

const TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const USER_KEY = 'user_data';
const TOKEN_EXPIRY_KEY = 'token_expiry';

export const storage = {
  /**
   * 保存 Token
   * Saves to both localStorage and sessionStorage for WebView compatibility
   */
  setToken(token: string, expiresIn?: number): void {
    // Try localStorage first (normal browser)
    try {
      localStorage.setItem(TOKEN_KEY, token);
      if (expiresIn) {
        const expiryTime = Date.now() + expiresIn * 1000;
        localStorage.setItem(TOKEN_EXPIRY_KEY, expiryTime.toString());
      }
    } catch {
      console.warn('[Storage] localStorage not available:', e);
    }

    // Also save to sessionStorage for WebView compatibility (e.g., Feishu App)
    try {
      sessionStorage.setItem(TOKEN_KEY, token);
      if (expiresIn) {
        const expiryTime = Date.now() + expiresIn * 1000;
        sessionStorage.setItem(TOKEN_EXPIRY_KEY, expiryTime.toString());
      }
    } catch {
      console.warn('[Storage] sessionStorage not available:', e);
    }
  },

  /**
   * 获取 Token
   * Checks sessionStorage first, then localStorage for WebView compatibility
   */
  getToken(): string | null {
    // Try sessionStorage first (for WebView compatibility)
    let token = sessionStorage.getItem(TOKEN_KEY);
    let expiry = sessionStorage.getItem(TOKEN_EXPIRY_KEY);

    // Fall back to localStorage if not in sessionStorage
    if (!token) {
      token = localStorage.getItem(TOKEN_KEY);
      expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
    }

    // 检查 Token 是否过期
    if (expiry && Date.now() > parseInt(expiry)) {
      this.clearAuth();
      return null;
    }

    return token;
  },

  /**
   * 保存刷新 Token
   * Saves to both localStorage and sessionStorage for WebView compatibility
   */
  setRefreshToken(refreshToken: string): void {
    // Try localStorage first
    try {
      localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    } catch {
      console.warn('[Storage] localStorage not available for refresh token:', e);
    }

    // Also save to sessionStorage for WebView compatibility
    try {
      sessionStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    } catch {
      console.warn('[Storage] sessionStorage not available for refresh token:', e);
    }
  },

  /**
   * 获取刷新 Token
   * Checks sessionStorage first, then localStorage for WebView compatibility
   */
  getRefreshToken(): string | null {
    // Try sessionStorage first (for WebView compatibility)
    let token = sessionStorage.getItem(REFRESH_TOKEN_KEY);

    // Fall back to localStorage if not in sessionStorage
    if (!token) {
      token = localStorage.getItem(REFRESH_TOKEN_KEY);
    }

    return token;
  },

  /**
   * 保存用户信息
   * Saves to both localStorage and sessionStorage for WebView compatibility
   */
  setUser(user: User): void {
    const userStr = JSON.stringify(user);

    // Try localStorage first
    try {
      localStorage.setItem(USER_KEY, userStr);
    } catch {
      console.warn('[Storage] localStorage not available for user:', e);
    }

    // Also save to sessionStorage for WebView compatibility
    try {
      sessionStorage.setItem(USER_KEY, userStr);
    } catch {
      console.warn('[Storage] sessionStorage not available for user:', e);
    }
  },

  /**
   * 获取用户信息
   * Checks sessionStorage first, then localStorage for WebView compatibility
   */
  getUser(): User | null {
    // Try sessionStorage first (for WebView compatibility)
    let userStr = sessionStorage.getItem(USER_KEY);

    // Fall back to localStorage if not in sessionStorage
    if (!userStr) {
      userStr = localStorage.getItem(USER_KEY);
    }

    if (userStr) {
      try {
        return JSON.parse(userStr) as User;
      } catch {
        return null;
      }
    }
    return null;
  },

  /**
   * 清除所有认证信息
   * Clears from both localStorage and sessionStorage
   */
  clearAuth(): void {
    // Clear from localStorage
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(TOKEN_EXPIRY_KEY);
    } catch {
      console.warn('[Storage] localStorage not available for clearing:', e);
    }

    // Clear from sessionStorage
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(REFRESH_TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
      sessionStorage.removeItem(TOKEN_EXPIRY_KEY);
    } catch {
      console.warn('[Storage] sessionStorage not available for clearing:', e);
    }
  },

  /**
   * 检查是否已认证
   */
  isAuthenticated(): boolean {
    return !!this.getToken();
  },
};
