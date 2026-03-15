/**
 * 仪表板页面 - 用户登录后的主页
 */

import React from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function DashboardPage() {
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
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

              {/* 功能提示 */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg
                      className="h-5 w-5 text-blue-400"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-blue-800">
                      功能开发中
                    </h3>
                    <div className="mt-2 text-sm text-blue-700">
                      <p>
                        实例管理功能正在开发中，敬请期待。您将能够创建和管理您的
                        AI 智能体实例。
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 统计卡片占位 */}
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <dt className="text-sm font-medium text-gray-500 truncate">
                  我的实例
                </dt>
                <dd className="mt-1 text-3xl font-semibold text-gray-900">0</dd>
              </div>
            </div>
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <dt className="text-sm font-medium text-gray-500 truncate">
                  总消息数
                </dt>
                <dd className="mt-1 text-3xl font-semibold text-gray-900">0</dd>
              </div>
            </div>
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <dt className="text-sm font-medium text-gray-500 truncate">
                  API 调用
                </dt>
                <dd className="mt-1 text-3xl font-semibold text-gray-900">0</dd>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
