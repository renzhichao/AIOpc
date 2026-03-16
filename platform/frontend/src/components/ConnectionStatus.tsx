/**
 * ConnectionStatus Component
 *
 * Displays the current WebSocket connection status with visual indicators.
 * This is a simplified version that will be enhanced in TASK-014.
 */

import React from 'react';
import type { WebSocketStatus } from '../services/websocket';

export interface ConnectionStatusProps {
  status: WebSocketStatus;
  className?: string;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  status,
  className = '',
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
        };
      case 'connecting':
        return {
          label: '连接中',
          dotColor: 'bg-yellow-500',
          textColor: 'text-yellow-700',
          bgColor: 'bg-yellow-50',
          icon: '○',
        };
      case 'disconnected':
        return {
          label: '未连接',
          dotColor: 'bg-gray-400',
          textColor: 'text-gray-600',
          bgColor: 'bg-gray-50',
          icon: '○',
        };
      case 'error':
        return {
          label: '错误',
          dotColor: 'bg-red-500',
          textColor: 'text-red-700',
          bgColor: 'bg-red-50',
          icon: '●',
        };
      default:
        return {
          label: '未知',
          dotColor: 'bg-gray-400',
          textColor: 'text-gray-600',
          bgColor: 'bg-gray-50',
          icon: '?',
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div
      className={`
        inline-flex items-center gap-2 px-3 py-1.5 rounded-full
        ${config.bgColor} ${config.textColor}
        ${className}
      `}
      data-testid="connection-status"
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
  );
};

export default ConnectionStatus;
