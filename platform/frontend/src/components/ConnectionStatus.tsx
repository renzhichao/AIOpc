/**
 * ConnectionStatus Component
 *
 * Displays the current WebSocket connection status with visual indicators.
 * Enhanced to show detailed connection information without interrupting user chat flow.
 */

import React from 'react';
import type { WebSocketStatus } from '../services/websocket';

export interface ConnectionStatusProps {
  status: WebSocketStatus;
  className?: string;
  instanceId?: string;
  lastConnected?: Date;
  connectionError?: string;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  status,
  className = '',
  instanceId,
  lastConnected,
  connectionError,
}) => {
  /**
   * Get status configuration
   */
  const getStatusConfig = () => {
    switch (status) {
      case 'connected':
        return {
          label: '已连接',
          dotColor: 'bg-green-500',
          textColor: 'text-green-700',
          bgColor: 'bg-green-50',
          icon: '●',
          detail: getInstanceInfo(),
        };
      case 'connecting':
        return {
          label: '连接中',
          dotColor: 'bg-yellow-500',
          textColor: 'text-yellow-700',
          bgColor: 'bg-yellow-50',
          icon: '○',
          detail: '正在连接实例...',
        };
      case 'disconnected':
        return {
          label: '未连接',
          dotColor: 'bg-gray-400',
          textColor: 'text-gray-600',
          bgColor: 'bg-gray-50',
          icon: '○',
          detail: '连接已断开',
        };
      case 'error':
        return {
          label: '连接错误',
          dotColor: 'bg-red-500',
          textColor: 'text-red-700',
          bgColor: 'bg-red-50',
          icon: '●',
          detail: connectionError || '连接失败，请重试',
        };
      default:
        return {
          label: '未知',
          dotColor: 'bg-gray-400',
          textColor: 'text-gray-600',
          bgColor: 'bg-gray-50',
          icon: '?',
          detail: '',
        };
    }
  };

  /**
   * Get instance information for display
   */
  const getInstanceInfo = (): string => {
    if (instanceId) {
      const shortId = instanceId.slice(0, 8);
      return `实例 ${shortId}`;
    }
    return '实例已就绪';
  };

  /**
   * Format last connected time
   */
  const formatLastConnected = (): string => {
    if (!lastConnected) return '';

    const now = new Date();
    const diffMs = now.getTime() - lastConnected.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return '刚刚连接';
    if (diffMins < 60) return `${diffMins}分钟前连接`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}小时前连接`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}天前连接`;
  };

  const config = getStatusConfig();
  const showDetail = status === 'connected' || status === 'error';
  const lastConnectedText = status === 'connected' ? formatLastConnected() : '';

  return (
    <div
      className={`
        inline-flex flex-col items-end gap-1
        ${className}
      `}
      data-testid="connection-status"
    >
      <div
        className={`
          inline-flex items-center gap-2 px-3 py-1.5 rounded-full
          ${config.bgColor} ${config.textColor}
        `}
      >
        <span
          className={`
            w-2 h-2 rounded-full animate-pulse
            ${config.dotColor}
          `}
          aria-hidden="true"
        />
        <span className="text-sm font-medium">{config.label}</span>
      </div>

      {/* Additional connection details shown below the main status */}
      {showDetail && (
        <div className={`text-xs ${config.textColor} opacity-80`}>
          {config.detail}
          {lastConnectedText && (
            <span className="ml-2">({lastConnectedText})</span>
          )}
        </div>
      )}
    </div>
  );
};

export default ConnectionStatus;
