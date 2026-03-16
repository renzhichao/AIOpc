/**
 * OAuth 回调页面 - 处理飞书 OAuth 回调
 * Flow: OAuth callback → Login → Check instance status → Show QR code / Redirect
 */

import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authService } from '../services/auth';
import { useAuth } from '../contexts/AuthContext';
import { storage } from '../utils/storage';
import type { ClaimQRCode } from '../types/auth';

type CallbackStatus = 'loading' | 'success' | 'error' | 'qrcode';
type QrCodeStatus = 'loading' | 'waiting' | 'claimed' | 'expired' | 'error';

export default function OAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Callback state
  const [status, setStatus] = useState<CallbackStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // QR code state
  const [qrCode, setQrCode] = useState<ClaimQRCode | null>(null);
  const [qrStatus, setQrStatus] = useState<QrCodeStatus>('loading');
  const [user, setUser] = useState<{ name: string } | null>(null);

  /**
   * 处理 OAuth 回调
   */
  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const error = searchParams.get('error');

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

        // 调用后端 API 处理回调
        const response = await authService.handleCallback(code, state);

        // 保存 Token 和用户信息
        storage.setToken(response.access_token, response.expires_in);
        if (response.refresh_token) {
          storage.setRefreshToken(response.refresh_token);
        }
        storage.setUser(response.user);

        // 更新认证状态
        login(response.access_token, response.user);

        // 保存用户信息用于显示
        setUser({ name: response.user.name });

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
  }, [searchParams, navigate, login]);

  /**
   * 检查实例状态并显示 QR 码或重定向
   */
  const checkInstanceStatus = async (token: string) => {
    try {
      const response = await authService.getClaimQRCode(token);

      if (response.already_has_instance) {
        // 用户已有实例，直接跳转
        setStatus('success');
        setTimeout(() => {
          navigate(response.redirect_to || '/chat', { replace: true });
        }, 500);
      } else if (response.qr_code) {
        // 用户没有实例，显示 QR 码
        setQrCode(response.qr_code);
        setStatus('qrcode');
        setQrStatus('waiting');

        // 开始轮询检查认领状态
        startPolling(token);
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
   * 开始轮询检查认领状态
   */
  const startPolling = (token: string) => {
    // 清除之前的轮询
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    // 每 3 秒检查一次
    pollingIntervalRef.current = setInterval(async () => {
      try {
        const response = await authService.getClaimQRCode(token);

        if (response.already_has_instance) {
          // 实例已被认领
          setQrStatus('claimed');
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
          }

          // 跳转到聊天页面
          setTimeout(() => {
            navigate(response.redirect_to || '/chat', { replace: true });
          }, 500);
        }
      } catch (err) {
        console.error('轮询检查失败:', err);
        // 继续轮询，不中断用户体验
      }
    }, 3000);
  };

  /**
   * 组件卸载时清理轮询
   */
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  /**
   * 重新生成 QR 码
   */
  const handleRegenerateQRCode = async () => {
    const token = storage.getToken();
    if (!token) {
      setStatus('error');
      setErrorMessage('未找到访问令牌');
      return;
    }

    setQrStatus('loading');
    try {
      const response = await authService.getClaimQRCode(token);
      if (response.qr_code) {
        setQrCode(response.qr_code);
        setQrStatus('waiting');
      }
    } catch (err) {
      console.error('重新生成 QR 码失败:', err);
      setQrStatus('error');
      setErrorMessage(
        err instanceof Error ? err.message : '重新生成二维码失败'
      );
    }
  };

  /**
   * 返回登录页
   */
  const handleBackToLogin = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }
    navigate('/login', { replace: true });
  };

  /**
   * 格式化过期时间
   */
  const formatExpiryTime = (expiresAt: string) => {
    const date = new Date(expiresAt);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
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

          {/* QR Code Display */}
          {status === 'qrcode' && qrCode && user && (
            <div className="space-y-6">
              {/* Welcome Message */}
              <div>
                <p className="text-xl font-semibold text-gray-900">
                  欢迎, {user.name}!
                </p>
                <p className="text-sm text-gray-600 mt-2">
                  请扫描下方二维码认领您的 AI 实例
                </p>
              </div>

              {/* QR Code */}
              <div className="flex flex-col items-center space-y-4">
                {qrStatus === 'loading' && (
                  <div className="flex flex-col items-center py-8">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
                    <p className="text-gray-600">正在生成二维码...</p>
                  </div>
                )}

                {(qrStatus === 'waiting' || qrStatus === 'claimed') && (
                  <>
                    <div className="bg-white p-6 rounded-lg shadow-inner border-2 border-gray-200">
                      <img
                        src={qrCode.image_url}
                        alt="Claim QR Code"
                        className="w-48 h-48 block"
                        data-testid="claim-qr-code"
                      />
                    </div>

                    <div className="text-center space-y-2">
                      <p className="text-gray-700 font-medium">
                        使用设备扫描二维码认领实例
                      </p>
                      <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                        <p className="text-xs text-blue-600">
                          有效期至: {formatExpiryTime(qrCode.expires_at)}
                        </p>
                      </div>

                      {qrStatus === 'waiting' && (
                        <div className="flex items-center justify-center space-x-2 mt-3">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600"></div>
                          <p className="text-sm text-gray-600">等待实例认领...</p>
                        </div>
                      )}

                      {qrStatus === 'claimed' && (
                        <div className="flex items-center justify-center space-x-2 mt-3">
                          <svg
                            className="w-5 h-5 text-green-600"
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
                          <p className="text-sm text-green-600 font-medium">
                            认领成功！正在跳转...
                          </p>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={handleRegenerateQRCode}
                      className="w-full py-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors duration-200 text-sm font-medium"
                    >
                      重新生成二维码
                    </button>
                  </>
                )}

                {qrStatus === 'error' && (
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
                            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      </div>
                    </div>
                    <div>
                      <p className="text-gray-700 font-medium">加载二维码失败</p>
                      <p className="text-sm text-red-600 mt-1">{errorMessage}</p>
                    </div>
                    <button
                      onClick={handleRegenerateQRCode}
                      className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors duration-200 font-medium"
                    >
                      重试
                    </button>
                  </div>
                )}
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
