/**
 * 实例服务单元测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InstanceService } from './instance';
import type { UnclaimedInstance, InstanceStats } from '../types/instance';

// Mock fetch
const mockFetch = vi.fn();
(global as any).fetch = mockFetch;

describe('InstanceService', () => {
  let service: InstanceService;
  const mockToken = 'test-token';

  beforeEach(() => {
    service = new InstanceService();
    localStorage.setItem('access_token', mockToken);
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('listInstances', () => {
    it('should fetch instances successfully', async () => {
      const mockInstances = [
        {
          id: '1',
          owner_id: 'user1',
          name: 'Test Instance',
          template: 'personal',
          config: {},
          status: 'active',
          restart_attempts: 0,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockInstances,
        }),
      });

      const result = await service.listInstances();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/instances'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockToken}`,
          }),
        })
      );
      expect(result).toEqual(mockInstances);
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
      });

      await expect(service.listInstances()).rejects.toThrow('请求失败');
    });

    it('should pass query parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [],
        }),
      });

      await service.listInstances({ status: 'active', page: 2, limit: 10 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('status=active&page=2&limit=10'),
        expect.any(Object)
      );
    });
  });

  describe('getInstance', () => {
    it('should fetch instance details successfully', async () => {
      const mockInstance = {
        id: '1',
        owner_id: 'user1',
        name: 'Test Instance',
        template: 'personal' as const,
        config: {},
        status: 'active' as const,
        restart_attempts: 0,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockInstance,
        }),
      });

      const result = await service.getInstance('1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/instances/1'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockToken}`,
          }),
        })
      );
      expect(result).toEqual(mockInstance);
    });

    it('should handle errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
      });

      await expect(service.getInstance('1')).rejects.toThrow('请求失败');
    });
  });

  describe('createInstance', () => {
    it('should create instance successfully', async () => {
      const mockInstance = {
        id: '1',
        owner_id: 'user1',
        name: 'New Instance',
        template: 'personal' as const,
        config: { name: 'New Instance' },
        status: 'pending' as const,
        restart_attempts: 0,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockInstance,
          message: 'Instance created successfully',
        }),
      });

      const result = await service.createInstance({
        template: 'personal',
        config: { name: 'New Instance' },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/instances'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('New Instance'),
        })
      );
      expect(result).toEqual(mockInstance);
    });

    it('should handle validation errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
      });

      await expect(
        service.createInstance({
          template: 'personal',
          config: {},
        })
      ).rejects.toThrow('请求失败');
    });
  });

  describe('startInstance', () => {
    it('should start instance successfully', async () => {
      const mockInstance = {
        id: '1',
        owner_id: 'user1',
        name: 'Test Instance',
        template: 'personal' as const,
        config: {},
        status: 'active' as const,
        restart_attempts: 0,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockInstance,
          message: 'Instance started successfully',
        }),
      });

      const result = await service.startInstance('1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/instances/1/start'),
        expect.objectContaining({
          method: 'POST',
        })
      );
      expect(result).toEqual(mockInstance);
    });
  });

  describe('stopInstance', () => {
    it('should stop instance successfully', async () => {
      const mockInstance = {
        id: '1',
        owner_id: 'user1',
        name: 'Test Instance',
        template: 'personal' as const,
        config: {},
        status: 'stopped' as const,
        restart_attempts: 0,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockInstance,
          message: 'Instance stopped successfully',
        }),
      });

      const result = await service.stopInstance('1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/instances/1/stop'),
        expect.objectContaining({
          method: 'POST',
        })
      );
      expect(result).toEqual(mockInstance);
    });
  });

  describe('restartInstance', () => {
    it('should restart instance successfully', async () => {
      const mockInstance = {
        id: '1',
        owner_id: 'user1',
        name: 'Test Instance',
        template: 'personal' as const,
        config: {},
        status: 'active' as const,
        restart_attempts: 0,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockInstance,
          message: 'Instance restarted successfully',
        }),
      });

      const result = await service.restartInstance('1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/instances/1/restart'),
        expect.objectContaining({
          method: 'POST',
        })
      );
      expect(result).toEqual(mockInstance);
    });
  });

  describe('deleteInstance', () => {
    it('should delete instance successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      });

      await expect(service.deleteInstance('1')).resolves.not.toThrow();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/instances/1'),
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });

    it('should handle delete errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
      });

      await expect(service.deleteInstance('1')).rejects.toThrow('请求失败');
    });
  });

  describe('getInstanceUsage', () => {
    it('should fetch usage stats successfully', async () => {
      const mockUsage = {
        total_messages: 100,
        total_tokens: 50000,
        cpu_usage: 45.5,
        memory_usage: 62.3,
        uptime: 3600,
        last_active: '2024-01-01T01:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockUsage,
      });

      const result = await service.getInstanceUsage('1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/instances/1/usage'),
        expect.any(Object)
      );
      expect(result).toEqual(mockUsage);
    });
  });

  describe('getInstanceHealth', () => {
    it('should fetch health status successfully', async () => {
      const mockHealth = {
        healthy: true,
        container_status: 'running',
        http_status: 'ok',
        cpu_usage: 45.5,
        memory_usage: 62.3,
        timestamp: '2024-01-01T01:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockHealth,
      });

      const result = await service.getInstanceHealth('1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/health/instances/1'),
        expect.any(Object)
      );
      expect(result).toEqual(mockHealth);
    });
  });

  describe('getUnclaimedInstances', () => {
    it('should fetch unclaimed instances successfully', async () => {
      const mockUnclaimedInstances = [
        {
          instance_id: 'remote-1',
          deployment_type: 'remote' as const,
          status: 'pending' as const,
          remote_host: '192.168.1.100',
          remote_port: 3000,
          remote_version: '1.0.0',
          capabilities: ['chat', 'code'],
          health_status: 'healthy' as const,
          created_at: '2024-01-01T00:00:00Z',
        },
        {
          instance_id: 'remote-2',
          deployment_type: 'remote' as const,
          status: 'pending' as const,
          remote_host: '192.168.1.101',
          remote_port: 3000,
          remote_version: '1.0.0',
          capabilities: ['chat'],
          health_status: 'healthy' as const,
          created_at: '2024-01-01T01:00:00Z',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockUnclaimedInstances,
        }),
      });

      const result = await service.getUnclaimedInstances();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/instances/unclaimed'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockToken}`,
          }),
        })
      );
      expect(result).toEqual(mockUnclaimedInstances);
    });

    it('should pass query parameters for filtering', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [],
        }),
      });

      await service.getUnclaimedInstances({
        deployment_type: 'remote',
        status: 'pending',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('deployment_type=remote&status=pending'),
        expect.any(Object)
      );
    });

    it('should handle errors when fetching unclaimed instances', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
      });

      await expect(service.getUnclaimedInstances()).rejects.toThrow('请求失败');
    });
  });

  describe('claimInstance', () => {
    it('should claim instance successfully', async () => {
      const mockClaimedInstance = {
        id: 1,
        instance_id: 'remote-1',
        owner_id: 1,
        deployment_type: 'remote' as const,
        status: 'active' as const,
        config: {},
        restart_attempts: 0,
        created_at: '2024-01-01T00:00:00Z',
        claimed_at: '2024-01-01T01:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockClaimedInstance,
          message: 'Instance claimed successfully',
        }),
      });

      const result = await service.claimInstance('remote-1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/instances/remote-1/claim'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockToken}`,
          }),
        })
      );
      expect(result).toEqual(mockClaimedInstance);
    });

    it('should handle claim errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
      });

      await expect(service.claimInstance('remote-1')).rejects.toThrow('请求失败');
    });

    it('should handle network errors during claim', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(service.claimInstance('remote-1')).rejects.toThrow('Network error');
    });
  });

  describe('releaseInstance', () => {
    it('should release instance successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      });

      await expect(service.releaseInstance('remote-1')).resolves.not.toThrow();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/instances/remote-1/claim'),
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockToken}`,
          }),
        })
      );
    });

    it('should handle release errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
      });

      await expect(service.releaseInstance('remote-1')).rejects.toThrow('请求失败');
    });
  });

  describe('getStats', () => {
    it('should fetch instance stats successfully', async () => {
      const mockStats = {
        total: 10,
        local: 5,
        remote: 5,
        unclaimed: 2,
        active: 7,
        healthy: 9,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockStats,
        }),
      });

      const result = await service.getStats();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/instances/stats'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockToken}`,
          }),
        })
      );
      expect(result).toEqual(mockStats);
    });

    it('should handle stats fetch errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
      });

      await expect(service.getStats()).rejects.toThrow('请求失败');
    });
  });

  describe('error handling', () => {
    it('should throw error when no token is available', async () => {
      localStorage.removeItem('access_token');

      await expect(service.listInstances()).rejects.toThrow('No authentication token found');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(service.listInstances()).rejects.toThrow('Network error');
    });
  });
});
