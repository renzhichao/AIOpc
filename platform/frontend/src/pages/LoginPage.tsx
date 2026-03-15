/**
 * 登录页面 - 显示二维码进行扫码登录
 */

import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/auth';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  // 如果已登录，跳转到主页
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // 获取授权 URL（生成二维码）
  useEffect(() => {
    const fetchAuthUrl = async () => {
      try {
        setLoading(true);
        setError('');

        const data = await authService.getAuthorizationUrl();
        setQrCodeUrl(data.url);
      } catch (err) {
        const message = err instanceof Error ? err.message : '获取二维码失败，请稍后重试';
        setError(message);
        console.error('获取授权 URL 失败:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAuthUrl();
  }, []);

  // 刷新二维码
  const handleRefresh = () => {
    const fetchAuthUrl = async () => {
      try {
        setLoading(true);
        setError('');

        const data = await authService.getAuthorizationUrl();
        setQrCodeUrl(data.url);
      } catch (err) {
        const message = err instanceof Error ? err.message : '获取二维码失败，请稍后重试';
        setError(message);
        console.error('获取授权 URL 失败:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAuthUrl();
  };

  // 计算二维码过期时间（24小时后）
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const timeRemaining = expiresAt.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8" data-testid="login-container">
        {/* Logo 和标题 */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🦞</div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2" data-testid="login-title">OpenClaw</h1>
          <p className="text-gray-600" data-testid="login-subtitle">扫码即用 AI 智能体平台</p>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
            <button
              onClick={handleRefresh}
              className="mt-2 text-sm text-red-700 hover:text-red-800 underline"
            >
              重新获取二维码
            </button>
          </div>
        )}

        {/* 加载状态 */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
            <p className="text-gray-600">正在生成二维码...</p>
          </div>
        )}

        {/* 二维码显示 */}
        {!loading && qrCodeUrl && (
          <div className="flex flex-col items-center" data-testid="qr-container">
            <div className="bg-white p-6 rounded-lg shadow-inner border-2 border-gray-200 mb-6">
              <QRCodeSVG
                value={qrCodeUrl}
                size={200}
                level="M"
                includeMargin={false}
                className="block"
                data-testid="qr-code"
              />
            </div>

            <div className="text-center space-y-2 mb-6">
              <p className="text-gray-700 font-medium">使用飞书扫码登录</p>
              <p className="text-sm text-gray-500">
                打开飞书APP，扫描上方二维码
              </p>
              <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                <p className="text-xs text-blue-600" data-testid="qr-code-expiry">
                  有效期至: {timeRemaining}
                </p>
              </div>
            </div>

            <button
              onClick={handleRefresh}
              className="w-full py-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors duration-200 text-sm font-medium"
            >
              刷新二维码
            </button>
          </div>
        )}

        {/* 使用说明 */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">登录说明</h3>
          <ol className="text-sm text-gray-600 space-y-2 list-decimal list-inside">
            <li>打开飞书移动应用</li>
            <li>点击右上角扫描图标</li>
            <li>扫描上方二维码</li>
            <li>确认登录授权</li>
          </ol>
        </div>

        {/* 底部信息 */}
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500">
            登录即表示您同意我们的
            <a href="#" className="text-indigo-600 hover:text-indigo-700 mx-1">
              服务条款
            </a>
            和
            <a href="#" className="text-indigo-600 hover:text-indigo-700 mx-1">
              隐私政策
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
