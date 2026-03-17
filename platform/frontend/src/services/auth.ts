/**
 * 认证服务 - 处理与后端 API 的交互
 */

import type { LoginResponse, ApiError, ClaimQRCodeResponse } from '../types/auth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

export class AuthService {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * 获取授权 URL（用于生成二维码）
   */
  async getAuthorizationUrl(): Promise<{ url: string }> {
    const redirectUri = `${window.location.origin}/oauth/callback`;
    const response = await fetch(`${this.baseUrl}/oauth/authorize?redirect_uri=${encodeURIComponent(redirectUri)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error: ApiError = await response.json();
      throw new Error(error.message || '获取授权 URL 失败');
    }

    return response.json();
  }

  /**
   * 处理 OAuth 回调
   */
  async handleCallback(code: string, state: string): Promise<LoginResponse> {
    const response = await fetch(`${this.baseUrl}/oauth/callback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code,
        state,
        redirect_uri: `${window.location.origin}/oauth/callback`,
      }),
    });

    if (!response.ok) {
      const error: ApiError = await response.json();
      throw new Error(error.message || '登录失败');
    }

    const result = await response.json();
    // 后端返回格式: { success: true, data: { access_token, user, ... } }
    return result.data || result;
  }

  /**
   * 刷新 Token
   */
  async refreshToken(refreshToken: string): Promise<{ access_token: string }> {
    const response = await fetch(`${this.baseUrl}/oauth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const error: ApiError = await response.json();
      throw new Error(error.message || '刷新 Token 失败');
    }

    return response.json();
  }

  /**
   * 获取当前用户信息
   */
  async getCurrentUser(token: string): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}/users/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('获取用户信息失败');
    }

    return response.json();
  }

  /**
   * 获取实例认领二维码
   */
  async getClaimQRCode(token: string): Promise<ClaimQRCodeResponse> {
    const response = await fetch(`${this.baseUrl}/qrcode/claim`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error: ApiError = await response.json();
      throw new Error(error.message || '获取认领二维码失败');
    }

    const result = await response.json();
    // 后端返回格式: { success: true, data: { ... } }
    return result.data || result;
  }
}

// 导出单例实例
export const authService = new AuthService();
