/**
 * storage 工具测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { storage } from './storage';

describe('storage', () => {
  beforeEach(() => {
    // 清除 localStorage
    localStorage.clear();
  });

  describe('setToken 和 getToken', () => {
    it('应该正确保存和获取 token', () => {
      const token = 'test-token';
      storage.setToken(token);
      expect(storage.getToken()).toBe(token);
    });

    it('应该正确处理 token 过期', () => {
      const token = 'test-token';
      // 设置过期时间为 1 秒
      storage.setToken(token, 0.001);
      // 等待过期
      return new Promise((resolve) => {
        setTimeout(() => {
          expect(storage.getToken()).toBeNull();
          resolve(true);
        }, 10);
      });
    });

    it('没有过期时间时应该正常返回 token', () => {
      const token = 'test-token';
      storage.setToken(token);
      expect(storage.getToken()).toBe(token);
    });
  });

  describe('setRefreshToken 和 getRefreshToken', () => {
    it('应该正确保存和获取刷新 token', () => {
      const refreshToken = 'refresh-token';
      storage.setRefreshToken(refreshToken);
      expect(storage.getRefreshToken()).toBe(refreshToken);
    });
  });

  describe('setUser 和 getUser', () => {
    it('应该正确保存和获取用户信息', () => {
      const user = {
        id: '123',
        name: 'Test User',
        email: 'test@example.com',
      };
      storage.setUser(user);
      expect(storage.getUser()).toEqual(user);
    });

    it('应该处理无效的 JSON', () => {
      localStorage.setItem('user_data', 'invalid json');
      expect(storage.getUser()).toBeNull();
    });
  });

  describe('clearAuth', () => {
    it('应该清除所有认证信息', () => {
      storage.setToken('token');
      storage.setRefreshToken('refresh-token');
      storage.setUser({ id: '123' });

      storage.clearAuth();

      expect(storage.getToken()).toBeNull();
      expect(storage.getRefreshToken()).toBeNull();
      expect(storage.getUser()).toBeNull();
    });
  });

  describe('isAuthenticated', () => {
    it('有 token 时应该返回 true', () => {
      storage.setToken('token');
      expect(storage.isAuthenticated()).toBe(true);
    });

    it('没有 token 时应该返回 false', () => {
      expect(storage.isAuthenticated()).toBe(false);
    });

    it('token 过期时应该返回 false', () => {
      storage.setToken('token', 0.001);
      return new Promise((resolve) => {
        setTimeout(() => {
          expect(storage.isAuthenticated()).toBe(false);
          resolve(true);
        }, 10);
      });
    });
  });
});
