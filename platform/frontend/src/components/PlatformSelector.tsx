/**
 * 平台选择组件 - 允许用户选择OAuth登录平台
 */

import { useState, useEffect } from 'react';
import { authService } from '../services/auth';
import type { OAuthPlatform, PlatformDisplayConfig } from '../types/auth';

// 平台显示配置
const PLATFORM_CONFIGS: Record<OAuthPlatform, PlatformDisplayConfig> = {
  feishu: {
    id: 'feishu',
    name: '飞书',
    description: '使用飞书账号登录',
    iconUrl: '/images/feishu-logo.svg',
    color: '#00D6B9',
    bgColor: 'bg-cyan-50',
  },
  dingtalk: {
    id: 'dingtalk',
    name: '钉钉',
    description: '使用钉钉账号登录',
    iconUrl: '/images/dingtalk-logo.svg',
    color: '#0089FF',
    bgColor: 'bg-blue-50',
  },
};

interface PlatformSelectorProps {
  onPlatformSelect: (platform: OAuthPlatform) => void;
  showRememberOption?: boolean;
}

export default function PlatformSelector({
  onPlatformSelect,
  showRememberOption = true,
}: PlatformSelectorProps) {
  const [platforms, setPlatforms] = useState<OAuthPlatform[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [rememberChoice, setRememberChoice] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<OAuthPlatform | null>(null);

  // 从localStorage读取记住的选择
  useEffect(() => {
    const savedPlatform = localStorage.getItem('selected_oauth_platform') as OAuthPlatform | null;
    if (savedPlatform && ['feishu', 'dingtalk'].includes(savedPlatform)) {
      setSelectedPlatform(savedPlatform);
      if (showRememberOption) {
        setRememberChoice(true);
      }
    }
  }, [showRememberOption]);  // eslint-disable-line react-hooks/exhaustive-deps

  // 获取启用的平台列表
  useEffect(() => {
    const fetchPlatforms = async () => {
      try {
        setLoading(true);
        setError('');

        const platformList = await authService.getEnabledPlatforms();
        const enabledPlatforms = platformList
          .filter((p) => p.enabled)
          .map((p) => p.platform);

        setPlatforms(enabledPlatforms);

        // 如果只有一个平台且是默认平台，自动选择
        if (enabledPlatforms.length === 1) {
          const singlePlatform = enabledPlatforms[0];
          setSelectedPlatform(singlePlatform);
          handlePlatformSelect(singlePlatform, false);
        }
      } catch {
        const message = err instanceof Error ? err.message : '获取平台列表失败';
        setError(message);
        console.error('获取平台列表失败:', err);
        // 降级：默认显示所有平台
        setPlatforms(['feishu', 'dingtalk']);
      } finally {
        setLoading(false);
      }
    };

    fetchPlatforms();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 处理平台选择
  const handlePlatformSelect = (platform: OAuthPlatform, shouldRemember = rememberChoice) => {
    setSelectedPlatform(platform);

    // 保存选择到localStorage
    if (shouldRemember && showRememberOption) {
      localStorage.setItem('selected_oauth_platform', platform);
    }

    // 触发回调
    onPlatformSelect(platform);
  };

  // 如果加载中，显示骨架屏
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse">
          <div className="h-32 bg-gray-200 rounded-lg"></div>
        </div>
        <div className="animate-pulse">
          <div className="h-32 bg-gray-200 rounded-lg"></div>
        </div>
      </div>
    );
  }

  // 如果出错，显示错误信息
  if (error && platforms.length === 0) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-sm text-red-600 mb-2">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="text-sm text-red-700 hover:text-red-800 underline"
        >
          重新加载
        </button>
      </div>
    );
  }

  // 如果只有一个平台，不显示选择器（自动选择）
  if (platforms.length === 1) {
    return null;
  }

  return (
    <div className="space-y-6" data-testid="platform-selector">
      {/* 标题 */}
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">选择登录方式</h2>
        <p className="text-sm text-gray-600">请选择您的登录平台</p>
      </div>

      {/* 平台卡片网格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {platforms.map((platform) => {
          const config = PLATFORM_CONFIGS[platform];
          const isSelected = selectedPlatform === platform;

          return (
            <button
              key={platform}
              onClick={() => handlePlatformSelect(platform)}
              className={`
                relative p-6 rounded-xl border-2 transition-all duration-200
                ${isSelected ? 'border-indigo-600 shadow-lg' : 'border-gray-200 hover:border-gray-300'}
                ${config.bgColor}
              `}
              data-testid={`platform-card-${platform}`}
              data-selected={isSelected}
            >
              {/* 选中标记 */}
              {isSelected && (
                <div className="absolute top-3 right-3">
                  <div className="w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                </div>
              )}

              {/* 图标 */}
              <div className="flex justify-center mb-4">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: config.color + '20' }}
                >
                  {/* 使用SVG图标作为后备 */}
                  {platform === 'feishu' ? (
                    <svg
                      className="w-10 h-10"
                      style={{ color: config.color }}
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
                    </svg>
                  ) : (
                    <svg
                      className="w-10 h-10"
                      style={{ color: config.color }}
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                    </svg>
                  )}
                </div>
              </div>

              {/* 平台名称和描述 */}
              <h3 className="text-lg font-semibold text-gray-900 mb-1">{config.name}</h3>
              <p className="text-sm text-gray-600">{config.description}</p>

              {/* 官方颜色条 */}
              <div className="absolute bottom-0 left-0 right-0 h-1 rounded-b-xl" style={{ backgroundColor: config.color }} />
            </button>
          );
        })}
      </div>

      {/* 记住选择选项 */}
      {showRememberOption && platforms.length > 1 && (
        <div className="flex items-center justify-center space-x-2">
          <input
            type="checkbox"
            id="remember-platform"
            checked={rememberChoice}
            onChange={(e) => setRememberChoice(e.target.checked)}
            className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
            data-testid="remember-checkbox"
          />
          <label htmlFor="remember-platform" className="text-sm text-gray-700 cursor-pointer">
            记住我的选择
          </label>
        </div>
      )}

      {/* 错误提示（非阻塞） */}
      {error && platforms.length > 0 && (
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-xs text-yellow-700">{error}</p>
          <p className="text-xs text-yellow-600 mt-1">显示默认平台选项</p>
        </div>
      )}
    </div>
  );
}
