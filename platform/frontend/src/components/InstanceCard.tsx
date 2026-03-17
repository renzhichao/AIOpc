/**
 * 实例卡片组件 - 显示单个实例的信息和操作按钮
 */

import { Link } from 'react-router-dom';
import type { Instance } from '../types/instance';
import { StatusBadge } from './StatusBadge';
import { InstanceTypeBadge } from './InstanceTypeBadge';
import { HealthStatusBadge } from './HealthStatusBadge';

interface InstanceCardProps {
  instance: Instance;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onRestart: (id: string) => void;
  onDelete: (id: string) => void;
  onClick: (id: string) => void;
  loading?: boolean;
  cpuUsage?: number;
  memoryUsage?: number;
}

export default function InstanceCard({
  instance,
  onStart,
  onStop,
  onRestart,
  onDelete,
  onClick,
  loading = false,
  cpuUsage,
  memoryUsage,
}: InstanceCardProps) {
  /**
   * 获取模板显示名称
   */
  const getTemplateName = () => {
    switch (instance.template) {
      case 'personal':
        return '个人版';
      case 'team':
        return '团队版';
      case 'enterprise':
        return '企业版';
      default:
        return '未知';
    }
  };

  /**
   * 格式化时间
   */
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  /**
   * Get resource usage color based on value
   */
  const getResourceColor = (value?: number) => {
    if (value === undefined) return 'bg-gray-200';
    if (value < 50) return 'bg-green-500';
    if (value < 80) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const canStart = instance.status === 'stopped' || instance.status === 'error';
  const canStop = instance.status === 'active';
  const canRestart = instance.status === 'active' || instance.status === 'error';

  return (
    <div
      className={`bg-white rounded-lg shadow-md hover:shadow-lg transition-all duration-200 overflow-hidden cursor-pointer ${
        instance.deployment_type === 'remote' ? 'border-2 border-purple-200' : ''
      }`}
      onClick={() => onClick(String(instance.id))}
      data-testid="instance-card"
    >
      {/* 头部 */}
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-xl font-semibold text-gray-900 truncate" data-testid="instance-name">
                {instance.config.name || `实例 ${String(instance.id).slice(0, 8)}`}
              </h3>
              <InstanceTypeBadge type={instance.deployment_type} size="sm" />
            </div>
            {instance.config.description && (
              <p className="text-sm text-gray-600 line-clamp-2">
                {instance.config.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {instance.health_status && (
              <HealthStatusBadge status={instance.health_status} />
            )}
            <StatusBadge status={instance.status} size="sm" />
          </div>
        </div>

        {/* 元信息 */}
        <div className="flex items-center gap-4 text-sm text-gray-600 mb-4">
          <span className="inline-flex items-center" data-testid="instance-template">
            <span className="mr-1">📦</span>
            {getTemplateName()}
          </span>
          <span className="inline-flex items-center">
            <span className="mr-1">🕐</span>
            {formatDate(instance.created_at)}
          </span>
        </div>

        {/* 远程实例信息 */}
        {instance.deployment_type === 'remote' && (
          <div className="mb-4 text-sm text-gray-600 space-y-1">
            <div>
              <span className="font-medium">远程地址: </span>
              <span>{instance.remote_host}:{instance.remote_port}</span>
            </div>
            {instance.last_heartbeat_at && (
              <div>
                <span className="font-medium">最后心跳: </span>
                <span>{formatDate(instance.last_heartbeat_at)}</span>
              </div>
            )}
            {instance.remote_version && (
              <div>
                <span className="font-medium">版本: </span>
                <span>{instance.remote_version}</span>
              </div>
            )}
          </div>
        )}

        {/* 资源使用率预览 */}
        {(cpuUsage !== undefined || memoryUsage !== undefined) && (
          <div className="mb-4 space-y-2">
            {cpuUsage !== undefined && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600 w-12">CPU</span>
                <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full ${getResourceColor(cpuUsage)} transition-all duration-300`}
                    style={{ width: `${Math.min(cpuUsage, 100)}%` }}
                  ></div>
                </div>
                <span className="text-xs font-medium text-gray-900 w-12 text-right">
                  {cpuUsage.toFixed(1)}%
                </span>
              </div>
            )}
            {memoryUsage !== undefined && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600 w-12">内存</span>
                <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full ${getResourceColor(memoryUsage)} transition-all duration-300`}
                    style={{ width: `${Math.min(memoryUsage, 100)}%` }}
                  ></div>
                </div>
                <span className="text-xs font-medium text-gray-900 w-12 text-right">
                  {memoryUsage.toFixed(1)}%
                </span>
              </div>
            )}
          </div>
        )}

        {/* 操作按钮 */}
        <div
          className="flex items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          {canStart && (
            <button
              onClick={() => onStart(String(instance.id))}
              disabled={loading}
              className="flex-1 py-2 px-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-lg transition-colors duration-200 text-sm font-medium"
              data-testid="start-button"
            >
              {loading ? '启动中...' : '启动'}
            </button>
          )}
          {canStop && (
            <button
              onClick={() => onStop(String(instance.id))}
              disabled={loading}
              className="flex-1 py-2 px-4 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-300 text-white rounded-lg transition-colors duration-200 text-sm font-medium"
              data-testid="stop-button"
            >
              {loading ? '停止中...' : '停止'}
            </button>
          )}
          {canRestart && (
            <button
              onClick={() => onRestart(String(instance.id))}
              disabled={loading}
              className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg transition-colors duration-200 text-sm font-medium"
              data-testid="restart-button"
            >
              {loading ? '重启中...' : '重启'}
            </button>
          )}
          {instance.status === 'active' && (
            <Link
              to={`/instances/${instance.id}/chat`}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 py-2 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white rounded-lg transition-colors duration-200 text-sm font-medium text-center"
              data-testid="chat-button"
            >
              开始对话
            </Link>
          )}
          <button
            onClick={() => {
              if (confirm(`确定要删除实例 "${instance.config.name || String(instance.id).slice(0, 8)}" 吗？`)) {
                onDelete(String(instance.id));
              }
            }}
            disabled={loading}
            className="py-2 px-4 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white rounded-lg transition-colors duration-200 text-sm font-medium"
            data-testid="delete-button"
          >
            删除
          </button>
        </div>
      </div>

      {/* 底部信息栏 */}
      {instance.restart_attempts > 0 && (
        <div className="px-6 py-3 bg-yellow-50 border-t border-yellow-100">
          <p className="text-xs text-yellow-800">
            ⚠️ 已尝试重启 {instance.restart_attempts} 次
          </p>
        </div>
      )}
    </div>
  );
}
