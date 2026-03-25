/**
 * 仪表板页面 - 用户登录后的主页
 * 显示实例统计和快捷操作
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { instanceService } from '../services/instance';
import type { InstanceStats } from '../types/instance';

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState<InstanceStats | null>(null);
  const [unclaimedCount, setUnclaimedCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // 并行获取统计数据和未认领实例
        const [statsData, unclaimedData] = await Promise.all([
          instanceService.getStats(),
          instanceService.getUnclaimedInstances({ deployment_type: 'remote', status: 'pending' }),
        ]);

        setStats(statsData);
        setUnclaimedCount(unclaimedData.length);
      } catch {
        console.error('Failed to fetch dashboard data:', err);
        setError('加载失败，请稍后重试');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleLogout = () => {
    logout();
  };

  const handleViewInstances = () => {
    navigate('/instances');
  };

  const handleClaimInstance = () => {
    navigate('/instances?filter=unclaimed');
  };

  const handleUnclaimedClick = () => {
    navigate('/instances?filter=unclaimed');
  };

  return (
    <div className="min-h-screen bg-gray-50" data-testid="dashboard-container">
      {/* 顶部导航栏 */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <span className="text-2xl mr-2">🦞</span>
              <span className="text-xl font-bold text-gray-900">OpenClaw</span>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-gray-700" data-testid="user-name">
                欢迎, {user?.name || '用户'}
              </span>
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors duration-200"
                data-testid="logout-button"
              >
                退出登录
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* 主内容区域 */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* 欢迎卡片 */}
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h1 className="text-2xl font-bold text-gray-900 mb-2" data-testid="dashboard-title">
                欢迎来到 OpenClaw
              </h1>
              <p className="text-gray-600 mb-4">
                您已成功登录！这里是您的 AI 智能体管理平台。
              </p>

              {/* 用户信息 */}
              {user && (
                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-3">
                    用户信息
                  </h2>
                  <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                    <div>
                      <dt className="text-sm font-medium text-gray-500">用户ID</dt>
                      <dd className="mt-1 text-sm text-gray-900">{user.id}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">飞书ID</dt>
                      <dd className="mt-1 text-sm text-gray-900">
                        {user.feishu_user_id}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">姓名</dt>
                      <dd className="mt-1 text-sm text-gray-900">{user.name}</dd>
                    </div>
                    {user.email && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">
                          邮箱
                        </dt>
                        <dd className="mt-1 text-sm text-gray-900">
                          {user.email}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}

              {/* 未认领实例通知 */}
              {unclaimedCount > 0 && (
                <div
                  onClick={handleUnclaimedClick}
                  className="mb-6 bg-yellow-50 border-l-4 border-yellow-400 rounded-lg p-4 cursor-pointer hover:bg-yellow-100 transition-colors"
                  data-testid="unclaimed-notification"
                >
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg
                        className="h-5 w-5 text-yellow-400"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-yellow-800">
                        有 {unclaimedCount} 个可用实例
                      </h3>
                      <div className="mt-2 text-sm text-yellow-700">
                        <p>
                          点击此处查看并认领可用的实例。
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 加载状态 */}
          {loading && (
            <div className="mt-6 flex justify-center items-center py-12" data-testid="loading-state">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
              <span className="ml-3 text-gray-600">加载中...</span>
            </div>
          )}

          {/* 错误状态 */}
          {error && (
            <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4" data-testid="error-message">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-red-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">
                    {error}
                  </h3>
                </div>
              </div>
            </div>
          )}

          {/* 统计卡片 */}
          {!loading && !error && stats && (
            <>
              <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4" data-testid="stats-grid">
                {/* 我的实例数 */}
                <div className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow">
                  <div className="px-4 py-5 sm:p-6">
                    <dt className="text-sm font-medium text-gray-500 truncate flex items-center">
                      <svg className="h-5 w-5 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                      我的实例数
                    </dt>
                    <dd className="mt-1 text-3xl font-semibold text-gray-900" data-testid="stat-my-instances">
                      {stats.total}
                    </dd>
                  </div>
                </div>

                {/* 可用实例数 */}
                <div className={`bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow ${unclaimedCount > 0 ? 'ring-2 ring-yellow-400' : ''}`}>
                  <div className="px-4 py-5 sm:p-6">
                    <dt className="text-sm font-medium text-gray-500 truncate flex items-center">
                      <svg className="h-5 w-5 mr-2 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      可用实例数
                      {unclaimedCount > 0 && (
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                          新
                        </span>
                      )}
                    </dt>
                    <dd className={`mt-1 text-3xl font-semibold ${unclaimedCount > 0 ? 'text-yellow-600' : 'text-gray-900'}`} data-testid="stat-available-instances">
                      {stats.unclaimed}
                    </dd>
                  </div>
                </div>

                {/* 运行中实例数 */}
                <div className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow">
                  <div className="px-4 py-5 sm:p-6">
                    <dt className="text-sm font-medium text-gray-500 truncate flex items-center">
                      <svg className="h-5 w-5 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      运行中实例数
                    </dt>
                    <dd className="mt-1 text-3xl font-semibold text-gray-900" data-testid="stat-running-instances">
                      {stats.active}
                    </dd>
                  </div>
                </div>

                {/* 健康实例数 */}
                <div className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow">
                  <div className="px-4 py-5 sm:p-6">
                    <dt className="text-sm font-medium text-gray-500 truncate flex items-center">
                      <svg className="h-5 w-5 mr-2 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      健康实例数
                    </dt>
                    <dd className="mt-1 text-3xl font-semibold text-gray-900" data-testid="stat-healthy-instances">
                      {stats.healthy}
                    </dd>
                  </div>
                </div>
              </div>

              {/* 快捷操作卡片 */}
              <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
                <button
                  onClick={handleViewInstances}
                  className="bg-white overflow-hidden shadow rounded-lg hover:shadow-lg transition-all p-6 text-left group"
                  data-testid="action-view-instances"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-medium text-gray-900 group-hover:text-indigo-600 transition-colors">
                        查看我的实例
                      </h3>
                      <p className="mt-1 text-sm text-gray-500">
                        查看和管理您的所有实例
                      </p>
                    </div>
                    <svg className="h-6 w-6 text-gray-400 group-hover:text-indigo-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>

                <button
                  onClick={handleClaimInstance}
                  className={`bg-white overflow-hidden shadow rounded-lg hover:shadow-lg transition-all p-6 text-left group ${unclaimedCount > 0 ? 'ring-2 ring-yellow-400' : ''}`}
                  data-testid="action-claim-instance"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center">
                        <h3 className="text-lg font-medium text-gray-900 group-hover:text-green-600 transition-colors">
                          认领新实例
                        </h3>
                        {unclaimedCount > 0 && (
                          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                            {unclaimedCount}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-gray-500">
                        {unclaimedCount > 0
                          ? `有 ${unclaimedCount} 个实例等待认领`
                          : '当前没有可用实例'}
                      </p>
                    </div>
                    <svg className="h-6 w-6 text-gray-400 group-hover:text-green-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
