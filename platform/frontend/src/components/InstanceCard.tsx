/**
 * 实例卡片组件 - 显示单个实例的信息和操作按钮
 */

import type { Instance } from '../types/instance';

interface InstanceCardProps {
  instance: Instance;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onRestart: (id: string) => void;
  onDelete: (id: string) => void;
  onClick: (id: string) => void;
  loading?: boolean;
}

export default function InstanceCard({
  instance,
  onStart,
  onStop,
  onRestart,
  onDelete,
  onClick,
  loading = false,
}: InstanceCardProps) {
  /**
   * 获取状态显示信息
   */
  const getStatusInfo = () => {
    switch (instance.status) {
      case 'active':
        return {
          label: '运行中',
          color: 'bg-green-100 text-green-800',
          icon: '🟢',
        };
      case 'stopped':
        return {
          label: '已停止',
          color: 'bg-gray-100 text-gray-800',
          icon: '⏸️',
        };
      case 'pending':
        return {
          label: '启动中',
          color: 'bg-yellow-100 text-yellow-800',
          icon: '🔄',
        };
      case 'error':
        return {
          label: '错误',
          color: 'bg-red-100 text-red-800',
          icon: '❌',
        };
      case 'recovering':
        return {
          label: '恢复中',
          color: 'bg-blue-100 text-blue-800',
          icon: '🔧',
        };
      default:
        return {
          label: '未知',
          color: 'bg-gray-100 text-gray-800',
          icon: '❓',
        };
    }
  };

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

  const statusInfo = getStatusInfo();
  const canStart = instance.status === 'stopped' || instance.status === 'error';
  const canStop = instance.status === 'active';
  const canRestart = instance.status === 'active' || instance.status === 'error';

  return (
    <div
      className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow duration-200 overflow-hidden cursor-pointer"
      onClick={() => onClick(instance.id)}
      data-testid="instance-card"
    >
      {/* 头部 */}
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-gray-900 mb-1" data-testid="instance-name">
              {instance.config.name || `实例 ${instance.id.slice(0, 8)}`}
            </h3>
            {instance.config.description && (
              <p className="text-sm text-gray-600 line-clamp-2">
                {instance.config.description}
              </p>
            )}
          </div>
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}
            data-testid="instance-status"
          >
            <span className="mr-1">{statusInfo.icon}</span>
            {statusInfo.label}
          </span>
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

        {/* 操作按钮 */}
        <div className="flex items-center gap-2">
          {canStart && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onStart(instance.id);
              }}
              disabled={loading}
              className="flex-1 py-2 px-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-lg transition-colors duration-200 text-sm font-medium"
              data-testid="start-button"
            >
              {loading ? '启动中...' : '启动'}
            </button>
          )}
          {canStop && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onStop(instance.id);
              }}
              disabled={loading}
              className="flex-1 py-2 px-4 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-300 text-white rounded-lg transition-colors duration-200 text-sm font-medium"
              data-testid="stop-button"
            >
              {loading ? '停止中...' : '停止'}
            </button>
          )}
          {canRestart && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRestart(instance.id);
              }}
              disabled={loading}
              className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg transition-colors duration-200 text-sm font-medium"
              data-testid="restart-button"
            >
              {loading ? '重启中...' : '重启'}
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`确定要删除实例 "${instance.config.name || instance.id.slice(0, 8)}" 吗？`)) {
                onDelete(instance.id);
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
