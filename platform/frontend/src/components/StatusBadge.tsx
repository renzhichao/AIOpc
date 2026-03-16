/**
 * StatusBadge Component
 *
 * Reusable status indicator badge with icon and color coding.
 * Supports different instance states with appropriate styling.
 */

import React from 'react';
import type { InstanceStatus } from '../types/instance';

export interface StatusBadgeProps {
  status: InstanceStatus;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'md',
  showIcon = true,
  className = '',
}) => {
  /**
   * Get status configuration
   */
  const getStatusConfig = () => {
    switch (status) {
      case 'active':
        return {
          label: '运行中',
          icon: '🟢',
          bgColor: 'bg-green-100',
          textColor: 'text-green-800',
          borderColor: 'border-green-200',
        };
      case 'stopped':
        return {
          label: '已停止',
          icon: '⏸️',
          bgColor: 'bg-gray-100',
          textColor: 'text-gray-800',
          borderColor: 'border-gray-200',
        };
      case 'pending':
        return {
          label: '启动中',
          icon: '🔄',
          bgColor: 'bg-yellow-100',
          textColor: 'text-yellow-800',
          borderColor: 'border-yellow-200',
        };
      case 'error':
        return {
          label: '错误',
          icon: '❌',
          bgColor: 'bg-red-100',
          textColor: 'text-red-800',
          borderColor: 'border-red-200',
        };
      case 'recovering':
        return {
          label: '恢复中',
          icon: '🔧',
          bgColor: 'bg-blue-100',
          textColor: 'text-blue-800',
          borderColor: 'border-blue-200',
        };
      default:
        return {
          label: '未知',
          icon: '❓',
          bgColor: 'bg-gray-100',
          textColor: 'text-gray-800',
          borderColor: 'border-gray-200',
        };
    }
  };

  /**
   * Get size classes
   */
  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return 'px-2 py-0.5 text-xs';
      case 'lg':
        return 'px-4 py-2 text-base';
      case 'md':
      default:
        return 'px-3 py-1 text-sm';
    }
  };

  const config = getStatusConfig();
  const sizeClasses = getSizeClasses();

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 rounded-full font-medium
        border ${config.bgColor} ${config.textColor}
        ${config.borderColor} ${sizeClasses}
        ${className}
      `}
      data-testid={`status-badge-${status}`}
    >
      {showIcon && <span>{config.icon}</span>}
      <span>{config.label}</span>
    </span>
  );
};

export default StatusBadge;
