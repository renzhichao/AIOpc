/**
 * OAuth 回调页面 - 处理飞书 OAuth 回调
 * Flow: OAuth callback → Login → Check instance status → Redirect to chat or instance list
 */

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { authService } from '../services/auth';
import { useAuth } from '../contexts/AuthContext';

type CallbackStatus = 'loading' | 'success' | 'error';

export default function OAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  // Callback state
  const [status, setStatus] = useState<CallbackStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  /**
   * 从URL路径中提取平台标识
   * 例如：/oauth/callback/dingtalk -> dingtalk
   */
  const extractPlatformFromPath = (): string | null => {
    const pathParts = location.pathname.split('/');
    // /oauth/callback/dingtalk -> ['oauth', 'callback', 'dingtalk']
    if (pathParts.length >= 3 && pathParts[1] === 'oauth' && pathParts[2] === 'callback') {
      const platform = pathParts[3];
      // 验证是否是有效的平台
      if (platform === 'feishu' || platform === 'dingtalk') {
        return platform;
      }
    }
    return null;
  };

  /**
   * 检查实例状态并重定向
   */
  const checkInstanceStatus = async (token: string) => {
    try {
      const response = await authService.getClaimQRCode(token);

      if (response.already_has_instance) {
        // 用户已有实例，直接跳转到聊天页面
        setStatus('success');
        setTimeout(() => {
          navigate(response.redirect_to || '/chat', { replace: true });
        }, 500);
      } else {
        // 用户没有可用实例，跳转到实例列表页面（显示可用实例）
        setStatus('success');
        setTimeout(() => {
          navigate('/instances?tab=unclaimed', { replace: true });
        }, 500);
      }
    } catch (err) {
      console.error('检查实例状态失败:', err);
      setStatus('error');
      setErrorMessage(
        err instanceof Error ? err.message : '检查实例状态失败'
      );
    }
  };

  /**
   * 处理 OAuth 回调
   */
  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const error = searchParams.get('error');
      // 从URL路径中提取平台，而不是从查询参数
      const platform = extractPlatformFromPath();

      // 处理错误情况
      if (error) {
        console.error('OAuth 错误:', error);
        setStatus('error');
        setErrorMessage(
          error === 'access_denied'
            ? '您取消了授权'
            : '授权过程中发生错误'
        );
        return;
      }

      // 检查是否有授权码
      if (!code || !state) {
        setStatus('error');
        setErrorMessage('无效的回调参数');
        return;
      }

      try {
        setStatus('loading');

        // 调用后端 API 处理回调（传递platform参数）
        const response = await authService.handleCallback(code, state, platform || undefined);

        // 更新认证状态
        login(response.access_token, response.user);

        // 检查实例状态
        await checkInstanceStatus(response.access_token);
      } catch (err) {
        console.error('处理回调失败:', err);
        setStatus('error');
        setErrorMessage(
          err instanceof Error ? err.message : '登录失败，请稍后重试'
        );
      }
    };

    handleCallback();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, navigate, login, location.pathname]);

  /**
   * 返回登录页
   */
  const handleBackToLogin = () => {
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center">
          {/* Logo */}
          <div className="text-6xl mb-4">🦞</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-6">OpenClaw</h1>

          {/* OAuth Callback Loading */}
          {status === 'loading' && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
              </div>
              <div>
                <p className="text-gray-700 font-medium">正在处理登录...</p>
                <p className="text-sm text-gray-500 mt-1">请稍候</p>
              </div>
            </div>
          )}

          {/* OAuth Callback Success (will redirect) */}
          {status === 'success' && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="rounded-full bg-green-100 p-3">
                  <svg
                    className="w-12 h-12 text-green-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
              </div>
              <div>
                <p className="text-gray-700 font-medium">登录成功！</p>
                <p className="text-sm text-gray-500 mt-1">正在跳转...</p>
              </div>
            </div>
          )}

          {/* OAuth Callback Error */}
          {status === 'error' && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="rounded-full bg-red-100 p-3">
                  <svg
                    className="w-12 h-12 text-red-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </div>
              </div>
              <div>
                <p className="text-gray-700 font-medium">登录失败</p>
                <p className="text-sm text-red-600 mt-1">{errorMessage}</p>
              </div>
              <button
                onClick={handleBackToLogin}
                className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors duration-200 font-medium"
              >
                返回登录页
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
