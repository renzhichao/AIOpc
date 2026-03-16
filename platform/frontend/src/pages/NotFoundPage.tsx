/**
 * 404 页面 - 页面未找到
 */

import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        {/* 404 图标 */}
        <div className="text-9xl mb-4">🦞</div>

        <h1 className="text-6xl font-bold text-gray-900 mb-4">404</h1>
        <h2 className="text-2xl font-semibold text-gray-700 mb-4">
          页面未找到
        </h2>
        <p className="text-gray-600 mb-8">
          抱歉，您访问的页面不存在或已被移除。
        </p>

        <div className="space-y-3">
          <Link
            to="/dashboard"
            className="inline-block w-full sm:w-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors duration-200 font-medium"
          >
            返回首页
          </Link>
          <Link
            to="/login"
            className="inline-block w-full sm:w-auto px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors duration-200 font-medium sm:ml-3"
          >
            前往登录
          </Link>
        </div>
      </div>
    </div>
  );
}
