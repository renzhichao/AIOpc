/**
 * 实例相关类型定义
 */

/**
 * 实例状态
 */
export type InstanceStatus = 'pending' | 'active' | 'stopped' | 'error' | 'recovering';

/**
 * 实例模板
 */
export type InstanceTemplate = 'personal' | 'team' | 'enterprise';

/**
 * 实例配置
 */
export interface InstanceConfig {
  name?: string;
  description?: string;
  temperature?: number;
  max_tokens?: number;
  [key: string]: unknown;
}

/**
 * 实例信息
 */
export interface Instance {
  id: string;
  owner_id: string;
  name: string;
  description?: string;
  template: InstanceTemplate;
  config: InstanceConfig;
  status: InstanceStatus;
  docker_container_id?: string;
  restart_attempts: number;
  created_at: string;
  updated_at: string;
  last_active_at?: string;
  expires_at?: string;
}

/**
 * 实例列表响应
 */
export interface InstanceListResponse {
  success: boolean;
  data: Instance[];
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
  };
}

/**
 * 实例详情响应
 */
export interface InstanceDetailResponse {
  success: boolean;
  data: Instance;
  message?: string;
}

/**
 * 创建实例请求
 */
export interface CreateInstanceRequest {
  template: InstanceTemplate;
  config?: InstanceConfig;
}

/**
 * 创建实例响应
 */
export interface CreateInstanceResponse {
  success: boolean;
  data: Instance;
  message: string;
}

/**
 * 实例操作响应
 */
export interface InstanceActionResponse {
  success: boolean;
  data: Instance;
  message: string;
}

/**
 * 实例使用统计
 */
export interface InstanceUsageStats {
  total_messages: number;
  total_tokens: number;
  cpu_usage: number;
  memory_usage: number;
  uptime: number;
  last_active: string;
}

/**
 * 实例健康状态
 */
export interface InstanceHealth {
  healthy: boolean;
  container_status: string;
  http_status: string;
  cpu_usage: number;
  memory_usage: number;
  timestamp: string;
}

/**
 * API 错误响应
 */
export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}
