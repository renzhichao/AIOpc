/**
 * 实例列表页面
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import InstanceCard from '../components/InstanceCard';
import CreateInstanceModal from '../components/CreateInstanceModal';
import { instanceService } from '../services/instance';
import type { Instance, InstanceTemplate } from '../types/instance';

export default function InstanceListPage() {
  const navigate = useNavigate();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [filteredInstances, setFilteredInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  /**
   * 加载实例列表
   */
  const loadInstances = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await instanceService.listInstances();
      setInstances(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载实例列表失败';
      setError(message);
      console.error('加载实例列表失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * 组件挂载时加载实例列表
   */
  useEffect(() => {
    loadInstances();

    // 设置定时刷新（每 10 秒）
    const interval = setInterval(loadInstances, 10000);
    return () => clearInterval(interval);
  }, [loadInstances]);

  /**
   * 搜索过滤
   */
  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredInstances(instances);
    } else {
      const term = searchTerm.toLowerCase();
      const filtered = instances.filter((instance) =>
        instance.config.name?.toLowerCase().includes(term) ||
        instance.config.description?.toLowerCase().includes(term)
      );
      setFilteredInstances(filtered);
    }
  }, [searchTerm, instances]);

  /**
   * 处理搜索输入
   */
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  /**
   * 启动实例
   */
  const handleStart = async (id: string) => {
    try {
      setActionLoading(true);
      await instanceService.startInstance(id);
      await loadInstances();
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
  const handleStop = async (id: string) => {
    try {
      setActionLoading(true);
      await instanceService.stopInstance(id);
      await loadInstances();
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
  const handleRestart = async (id: string) => {
    try {
      setActionLoading(true);
      await instanceService.restartInstance(id);
      await loadInstances();
    } catch (err) {
      const message = err instanceof Error ? err.message : '重启实例失败';
      alert(message);
      console.error('重启实例失败:', err);
    } finally {
      setActionLoading(false);
    }
  };

  /**
   * 删除实例
   */
  const handleDelete = async (id: string) => {
    try {
      setActionLoading(true);
      await instanceService.deleteInstance(id);
      await loadInstances();
    } catch (err) {
      const message = err instanceof Error ? err.message : '删除实例失败';
      alert(message);
      console.error('删除实例失败:', err);
    } finally {
      setActionLoading(false);
    }
  };

  /**
   * 创建实例
   */
  const handleCreate = async (data: {
    template: InstanceTemplate;
    config: {
      name?: string;
      description?: string;
    };
  }) => {
    try {
      setActionLoading(true);
      await instanceService.createInstance(data);
      setIsCreateModalOpen(false);
      await loadInstances();
    } catch (err) {
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  /**
   * 点击实例卡片，跳转到详情页
   */
  const handleInstanceClick = (id: string) => {
    navigate(`/instances/${id}`);
  };

  return (
    <div className="min-h-screen bg-gray-50" data-testid="instances-container">
      {/* 头部 */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900" data-testid="instances-title">我的实例</h1>
              <p className="mt-1 text-sm text-gray-600" data-testid="instances-header">
                管理您的 OpenClaw 智能体实例
              </p>
            </div>
            <button
              onClick={() => navigate('/instances/create')}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-md hover:shadow-lg transition-all duration-200 font-medium"
              data-testid="create-instance-button"
            >
              + 创建新实例
            </button>
          </div>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 工具栏：搜索和刷新 */}
        <div className="mb-6 flex items-center gap-4">
          {/* 搜索框 */}
          <div className="flex-1 max-w-md">
            <input
              type="text"
              placeholder="搜索实例名称或描述..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              data-testid="search-input"
            />
          </div>

          {/* 过滤按钮 */}
          <button
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors duration-200"
            data-testid="filter-button"
          >
            过滤
          </button>

          {/* 刷新按钮 */}
          <button
            onClick={loadInstances}
            disabled={loading}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 text-gray-700 disabled:text-gray-400 rounded-lg transition-colors duration-200 flex items-center gap-2"
            data-testid="refresh-button"
          >
            <svg
              className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            刷新
          </button>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center justify-between">
              <p className="text-sm text-red-600">{error}</p>
              <button
                onClick={loadInstances}
                className="text-sm text-red-700 hover:text-red-800 underline"
              >
                重试
              </button>
            </div>
          </div>
        )}

        {/* 加载状态 */}
        {loading && instances.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
            <p className="text-gray-600">加载中...</p>
          </div>
        )}

        {/* 空状态 */}
        {!loading && filteredInstances.length === 0 && instances.length > 0 && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🔍</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              没有找到匹配的实例
            </h3>
            <p className="text-gray-600">
              请尝试其他搜索关键词
            </p>
          </div>
        )}

        {/* 空状态 - 无实例 */}
        {!loading && instances.length === 0 && !error && (
          <div className="text-center py-12" data-testid="empty-state">
            <div className="text-6xl mb-4">🦞</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              还没有实例
            </h3>
            <p className="text-gray-600 mb-6">
              创建您的第一个 OpenClow 智能体实例开始使用
            </p>
            <button
              onClick={() => navigate('/instances/create')}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-md hover:shadow-lg transition-all duration-200 font-medium"
            >
              + 创建新实例
            </button>
          </div>
        )}

        {/* 实例列表 */}
        {!loading && filteredInstances.length > 0 && (
          <>
            {/* 统计信息 */}
            <div className="mb-6 flex items-center gap-6 text-sm text-gray-600">
              <span>
                总计: <strong className="text-gray-900">{filteredInstances.length}</strong> 个实例
              </span>
              <span>
                运行中: <strong className="text-green-600">{filteredInstances.filter(i => i.status === 'active').length}</strong>
              </span>
              <span>
                已停止: <strong className="text-gray-600">{filteredInstances.filter(i => i.status === 'stopped').length}</strong>
              </span>
            </div>

            {/* 实例卡片网格 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="instance-list">
              {filteredInstances.map((instance) => (
                <InstanceCard
                  key={instance.id}
                  instance={instance}
                  onStart={handleStart}
                  onStop={handleStop}
                  onRestart={handleRestart}
                  onDelete={handleDelete}
                  onClick={handleInstanceClick}
                  loading={actionLoading}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* 创建实例模态框 */}
      <CreateInstanceModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreate}
        loading={actionLoading}
      />
    </div>
  );
}
