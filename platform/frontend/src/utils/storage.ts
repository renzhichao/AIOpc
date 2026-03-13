/**
 * 本地存储工具
 */

const TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const USER_KEY = 'user_data';
const TOKEN_EXPIRY_KEY = 'token_expiry';

export const storage = {
  /**
   * 保存 Token
   */
  setToken(token: string, expiresIn?: number): void {
    localStorage.setItem(TOKEN_KEY, token);
    if (expiresIn) {
      const expiryTime = Date.now() + expiresIn * 1000;
      localStorage.setItem(TOKEN_EXPIRY_KEY, expiryTime.toString());
    }
  },

  /**
   * 获取 Token
   */
  getToken(): string | null {
    const token = localStorage.getItem(TOKEN_KEY);
    const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);

    // 检查 Token 是否过期
    if (expiry && Date.now() > parseInt(expiry)) {
      this.clearAuth();
      return null;
    }

    return token;
  },

  /**
   * 保存刷新 Token
   */
  setRefreshToken(refreshToken: string): void {
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  },

  /**
   * 获取刷新 Token
   */
  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  },

  /**
   * 保存用户信息
   */
  setUser(user: unknown): void {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },

  /**
   * 获取用户信息
   */
  getUser(): unknown | null {
    const userStr = localStorage.getItem(USER_KEY);
    if (userStr) {
      try {
        return JSON.parse(userStr);
      } catch {
        return null;
      }
    }
    return null;
  },

  /**
   * 清除所有认证信息
   */
  clearAuth(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
  },

  /**
   * 检查是否已认证
   */
  isAuthenticated(): boolean {
    return !!this.getToken();
  },
};
