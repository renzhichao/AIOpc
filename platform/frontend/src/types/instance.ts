/**
 * 实例相关类型定义
 */

/**
 * 实例状态
 */
export type InstanceStatus = 'pending' | 'active' | 'stopped' | 'error' | 'recovering' | 'running';

/**
 * 部署类型
 */
export type DeploymentType = 'local' | 'remote';

/**
 * 健康状态
 */
export type HealthStatus = 'healthy' | 'warning' | 'unhealthy';

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
  id: number;
  instance_id: string;
  owner_id?: number;
  owner?: {
    id: number;
    username: string;
  };
  name?: string;
  description?: string;
  template?: InstanceTemplate;
  config: InstanceConfig;
  status: InstanceStatus;
  docker_container_id?: string;
  restart_attempts: number;
  created_at: string;
  updated_at?: string;
  last_active_at?: string;
  expires_at?: string;
  claimed_at?: string;

  // 健康状态相关
  health_status?: HealthStatus;
  health_reason?: string;
  health_last_checked?: string;

  // 部署类型相关
  deployment_type: DeploymentType;

  // 远程实例相关字段
  remote_host?: string;
  remote_port?: number;
  remote_version?: string;
  platform_api_key?: string;
  capabilities?: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  remote_metadata?: Record<string, any>;

  // 心跳相关
  last_heartbeat_at?: string;
  heartbeat_interval?: number;
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

/**
 * 未认领的远程实例
 */
export interface UnclaimedInstance {
  instance_id: string;
  deployment_type: 'remote';
  status: 'pending';
  remote_host: string;
  remote_port: number;
  remote_version: string;
  capabilities: string[];
  health_status: HealthStatus;
  created_at: string;
}

/**
 * 实例统计信息
 */
export interface InstanceStats {
  total: number;
  local: number;
  remote: number;
  unclaimed: number;
  active: number;
  healthy: number;
}

