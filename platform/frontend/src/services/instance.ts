/**
 * 实例服务 - 处理与后端实例 API 的交互
 */

import type {
  Instance,
  InstanceListResponse,
  InstanceDetailResponse,
  CreateInstanceRequest,
  CreateInstanceResponse,
  InstanceActionResponse,
  InstanceUsageStats,
  InstanceHealth,
  UnclaimedInstance,
  InstanceStats,
} from '../types/instance';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

/**
 * 从 localStorage 获取 Token
 */
function getToken(): string {
  // Try multiple possible token keys for E2E test compatibility
  const token = localStorage.getItem('access_token') || localStorage.getItem('auth_token');
  if (!token) {
    throw new Error('No authentication token found');
  }
  return token;
}

/**
 * 处理 API 错误
 */
function handleApiError(_response: Response): never {
  throw new Error('请求失败');
}

export class InstanceService {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * 获取所有实例列表
   */
  async listInstances(params?: { status?: string; page?: number; limit?: number }): Promise<Instance[]> {
    const queryParams = new URLSearchParams();
    if (params?.status) queryParams.append('status', params.status);
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());

    const response = await fetch(`${this.baseUrl}/instances?${queryParams.toString()}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      handleApiError(response);
    }

    const result: InstanceListResponse = await response.json();
    return result.data;
  }

  /**
   * 获取实例详情
   */
  async getInstance(id: string): Promise<Instance> {
    const response = await fetch(`${this.baseUrl}/instances/${id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      handleApiError(response);
    }

    const result: InstanceDetailResponse = await response.json();
    return result.data;
  }

  /**
   * 创建新实例
   */
  async createInstance(request: CreateInstanceRequest): Promise<Instance> {
    const response = await fetch(`${this.baseUrl}/instances`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      handleApiError(response);
    }

    const result: CreateInstanceResponse = await response.json();
    return result.data;
  }

  /**
   * 启动实例
   */
  async startInstance(id: string): Promise<Instance> {
    const response = await fetch(`${this.baseUrl}/instances/${id}/start`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      handleApiError(response);
    }

    const result: InstanceActionResponse = await response.json();
    return result.data;
  }

  /**
   * 停止实例
   */
  async stopInstance(id: string): Promise<Instance> {
    const response = await fetch(`${this.baseUrl}/instances/${id}/stop`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      handleApiError(response);
    }

    const result: InstanceActionResponse = await response.json();
    return result.data;
  }

  /**
   * 重启实例
   */
  async restartInstance(id: string): Promise<Instance> {
    const response = await fetch(`${this.baseUrl}/instances/${id}/restart`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      handleApiError(response);
    }

    const result: InstanceActionResponse = await response.json();
    return result.data;
  }

  /**
   * 删除实例
   */
  async deleteInstance(id: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/instances/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      handleApiError(response);
    }
  }

  /**
   * 获取实例使用统计
   */
  async getInstanceUsage(id: string): Promise<InstanceUsageStats> {
    const response = await fetch(`${this.baseUrl}/instances/${id}/usage`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      handleApiError(response);
    }

    return response.json();
  }

  /**
   * 获取实例健康状态
   */
  async getInstanceHealth(id: string): Promise<InstanceHealth> {
    const response = await fetch(`${this.baseUrl}/health/instances/${id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      handleApiError(response);
    }

    return response.json();
  }

  /**
   * 获取实例配置
   */
  async getInstanceConfig(id: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/instances/${id}/config`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      handleApiError(response);
    }

    const result = await response.json();
    return result.data.config;
  }

  /**
   * 更新实例配置
   */
  async updateInstanceConfig(id: string, config: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}/instances/${id}/config`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || '更新配置失败');
    }

    const result = await response.json();
    return result.data.config;
  }

  /**
   * 获取未认领的远程实例
   * GET /api/instances/unclaimed
   */
  async getUnclaimedInstances(params?: {
    deployment_type?: 'remote';
    status?: 'pending';
  }): Promise<UnclaimedInstance[]> {
    const queryParams = new URLSearchParams();
    if (params?.deployment_type) queryParams.append('deployment_type', params.deployment_type);
    if (params?.status) queryParams.append('status', params.status);

    const response = await fetch(`${this.baseUrl}/instances/unclaimed?${queryParams.toString()}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      handleApiError(response);
    }

    const result: { success: boolean; data: UnclaimedInstance[] } = await response.json();
    return result.data;
  }

  /**
   * 认领实例
   * POST /api/instances/:instanceId/claim
   */
  async claimInstance(instanceId: string): Promise<Instance> {
    const response = await fetch(`${this.baseUrl}/instances/${instanceId}/claim`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      handleApiError(response);
    }

    const result: InstanceActionResponse = await response.json();
    return result.data;
  }

  /**
   * 释放实例
   * DELETE /api/instances/:instanceId/claim
   */
  async releaseInstance(instanceId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/instances/${instanceId}/claim`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      handleApiError(response);
    }
  }

  /**
   * 获取实例统计
   * GET /api/instances/stats
   */
  async getStats(): Promise<InstanceStats> {
    const response = await fetch(`${this.baseUrl}/instances/stats`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      handleApiError(response);
    }

    const result: { success: boolean; data: InstanceStats } = await response.json();
    return result.data;
  }
}

// 导出单例实例
export const instanceService = new InstanceService();
