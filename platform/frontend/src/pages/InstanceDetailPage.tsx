/**
 * 实例详情页面
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { instanceService } from '../services/instance';
import type { Instance, InstanceUsageStats, InstanceHealth } from '../types/instance';

export default function InstanceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [instance, setInstance] = useState<Instance | null>(null);
  const [usageStats, setUsageStats] = useState<InstanceUsageStats | null>(null);
  const [health, setHealth] = useState<InstanceHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  /**
   * 加载实例详情
   */
  const loadInstanceDetails = useCallback(async () => {
    if (!id) return;

    try {
      setLoading(true);
      setError('');

      const [instanceData, usageData, healthData] = await Promise.all([
        instanceService.getInstance(id),
        instanceService.getInstanceUsage(id).catch(() => null),
        instanceService.getInstanceHealth(id).catch(() => null),
      ]);

      setInstance(instanceData);
      setUsageStats(usageData);
      setHealth(healthData);
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载实例详情失败';
      setError(message);
      console.error('加载实例详情失败:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  /**
   * 组件挂载时加载实例详情
   */
  useEffect(() => {
    loadInstanceDetails();

    // 设置定时刷新（每 5 秒）
    const interval = setInterval(loadInstanceDetails, 5000);
    return () => clearInterval(interval);
  }, [loadInstanceDetails]);

  /**
   * 启动实例
   */
  const handleStart = async () => {
    if (!id) return;
    try {
      setActionLoading(true);
      await instanceService.startInstance(id);
      await loadInstanceDetails();
    } catch (err) {
      const message = err instanceof Error ? err.message : '启动实例失败';
      alert(message);
      console.error('启动实例失败:', err);
    } finally {
      setActionLoading(false);
    }
  };

  /**
   * 停止实例
   */
  const handleStop = async () => {
    if (!id) return;
    try {
      setActionLoading(true);
      await instanceService.stopInstance(id);
      await loadInstanceDetails();
    } catch (err) {
      const message = err instanceof Error ? err.message : '停止实例失败';
      alert(message);
      console.error('停止实例失败:', err);
    } finally {
      setActionLoading(false);
    }
  };

  /**
   * 重启实例
   */
  const handleRestart = async () => {
    if (!id) return;
    try {
      setActionLoading(true);
      await instanceService.restartInstance(id);
      await loadInstanceDetails();
    } catch (err) {
      const message = err instanceof Error ? err.message : '重启实例失败';
      alert(message);
      console.error('重启实例失败:', err);
    } finally {
      setActionLoading(false);
    }
  };

  /**
   * 获取状态显示信息
   */
  const getStatusInfo = () => {
    if (!instance) return null;

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
   * 格式化时间
   */
  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
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
   * 格式化运行时间
   */
  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}小时${minutes}分钟`;
    } else if (minutes > 0) {
      return `${minutes}分钟${secs}秒`;
    } else {
      return `${secs}秒`;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" data-testid="instance-details-container">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  if (error || !instance) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">❌</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            {error || '实例不存在'}
          </h3>
          <button
            onClick={() => navigate('/instances')}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors duration-200 font-medium"
          >
            返回实例列表
          </button>
        </div>
      </div>
    );
  }

  const statusInfo = getStatusInfo();
  const canStart = instance.status === 'stopped' || instance.status === 'error';
  const canStop = instance.status === 'active';
  const canRestart = instance.status === 'active' || instance.status === 'error';

  return (
    <div className="min-h-screen bg-gray-50" data-testid="instance-details-container">
      {/* 头部 */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => navigate('/instances')}
              className="text-indigo-600 hover:text-indigo-700 font-medium"
              data-testid="back-button"
            >
              ← 返回实例列表
            </button>
          </div>

          {/* 实例名称和状态 */}
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-4 mb-2">
                <h1 className="text-3xl font-bold text-gray-900" data-testid="instance-name">
                  {instance.config.name || `实例 ${instance.id.slice(0, 8)}`}
                </h1>
                {statusInfo && (
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusInfo.color}`} data-testid="instance-status">
                    <span className="mr-1">{statusInfo.icon}</span>
                    {statusInfo.label}
                  </span>
                )}
              </div>
              {instance.config.description && (
                <p className="text-gray-600">{instance.config.description}</p>
              )}
            </div>

            {/* 操作按钮 */}
            <div className="flex items-center gap-2">
              {canStart && (
                <button
                  onClick={handleStart}
                  disabled={actionLoading}
                  className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-lg transition-colors duration-200 font-medium"
                  data-testid="start-button"
                >
                  {actionLoading ? '启动中...' : '启动'}
                </button>
              )}
              {canStop && (
                <button
                  onClick={handleStop}
                  disabled={actionLoading}
                  className="px-6 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-300 text-white rounded-lg transition-colors duration-200 font-medium"
                  data-testid="stop-button"
                >
                  {actionLoading ? '停止中...' : '停止'}
                </button>
              )}
              {canRestart && (
                <button
                  onClick={handleRestart}
                  disabled={actionLoading}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg transition-colors duration-200 font-medium"
                  data-testid="restart-button"
                >
                  {actionLoading ? '重启中...' : '重启'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左侧：实例信息 */}
          <div className="lg:col-span-2 space-y-6">
            {/* 基本信息 */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">基本信息</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600 mb-1">实例 ID</p>
                  <p className="text-sm font-mono text-gray-900">{instance.id}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">模板类型</p>
                  <p className="text-sm text-gray-900">
                    {instance.template === 'personal' ? '个人版' :
                     instance.template === 'team' ? '团队版' :
                     instance.template === 'enterprise' ? '企业版' : '未知'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">创建时间</p>
                  <p className="text-sm text-gray-900">{formatDate(instance.created_at)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">更新时间</p>
                  <p className="text-sm text-gray-900">{formatDate(instance.updated_at)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">最后活跃</p>
                  <p className="text-sm text-gray-900">{formatDate(instance.last_active_at)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Docker 容器 ID</p>
                  <p className="text-sm font-mono text-gray-900">
                    {instance.docker_container_id || '-'}
                  </p>
                </div>
              </div>
            </div>

            {/* 使用统计 */}
            {usageStats && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">使用统计</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">总消息数</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {usageStats.total_messages.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">总 Token 数</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {usageStats.total_tokens.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">运行时间</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {formatUptime(usageStats.uptime)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">最后活跃</p>
                    <p className="text-sm text-gray-900">{formatDate(usageStats.last_active)}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 右侧：健康状态 */}
          <div className="space-y-6">
            {/* 健康状态 */}
            {health && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">健康状态</h2>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">容器状态</p>
                    <p className="text-sm font-medium text-gray-900">
                      {health.container_status}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">HTTP 状态</p>
                    <p className="text-sm font-medium text-gray-900">
                      {health.http_status}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">CPU 使用率</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-indigo-600 h-2 rounded-full"
                          style={{ width: `${health.cpu_usage}%` }}
                        ></div>
                      </div>
                      <span className="text-sm font-medium text-gray-900">
                        {health.cpu_usage.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">内存使用率</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-green-600 h-2 rounded-full"
                          style={{ width: `${health.memory_usage}%` }}
                        ></div>
                      </div>
                      <span className="text-sm font-medium text-gray-900">
                        {health.memory_usage.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-gray-200">
                    <p className="text-xs text-gray-500">
                      最后更新: {formatDate(health.timestamp)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 重启信息 */}
            {instance.restart_attempts > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start">
                  <span className="text-2xl mr-3">⚠️</span>
                  <div>
                    <h3 className="text-sm font-semibold text-yellow-800 mb-1">
                      重启记录
                    </h3>
                    <p className="text-sm text-yellow-700">
                      此实例已尝试自动重启 {instance.restart_attempts} 次
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
