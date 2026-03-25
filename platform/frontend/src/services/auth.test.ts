/**
 * AuthService 测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from './auth';

describe('AuthService', () => {
  let authService: AuthService;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    authService = new AuthService('http://test.api');
    fetchMock = vi.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = fetchMock;
  });

  describe('getAuthorizationUrl', () => {
    it('应该成功获取授权 URL', async () => {
      const mockResponse = {
        url: 'https://open.feishu.cn/open-apis/authen/v1/authorize?test=123',
        state: 'test-state',
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await authService.getAuthorizationUrl();

      expect(result).toEqual(mockResponse);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('http://test.api/oauth/authorize?redirect_uri='),
        expect.objectContaining({
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        })
      );
    });

    it('应该处理 API 错误', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ code: 'ERROR', message: '获取失败' }),
      });

      await expect(authService.getAuthorizationUrl()).rejects.toThrow('获取失败');
    });
  });

  describe('handleCallback', () => {
    it('应该成功处理回调', async () => {
      const mockResponse = {
        access_token: 'test-token',
        refresh_token: 'test-refresh-token',
        expires_in: 3600,
        user: {
          id: '123',
          name: 'Test User',
          feishu_user_id: 'feishu-123',
        },
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await authService.handleCallback('test-code', 'test-state');

      expect(result).toEqual(mockResponse);
    });

    it('应该处理回调错误', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ code: 'ERROR', message: '登录失败' }),
      });

      await expect(
        authService.handleCallback('invalid-code', 'test-state')
      ).rejects.toThrow('登录失败');
    });
  });

  describe('refreshToken', () => {
    it('应该成功刷新 token', async () => {
      const mockResponse = {
        access_token: 'new-token',
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await authService.refreshToken('refresh-token');

      expect(result).toEqual(mockResponse);
    });

    it('应该处理刷新失败', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ code: 'ERROR', message: '刷新失败' }),
      });

      await expect(authService.refreshToken('invalid-token')).rejects.toThrow(
        '刷新失败'
      );
    });
  });
});
