/**
 * HealthStatusBadge Component
 *
 * Reusable badge component for displaying instance health status.
 * Supports icon-only or icon+text display with appropriate styling.
 */

import React from 'react';
import type { HealthStatus } from '../types/instance';

export interface HealthStatusBadgeProps {
  status: HealthStatus;
  showText?: boolean;
  className?: string;
}

export const HealthStatusBadge: React.FC<HealthStatusBadgeProps> = ({
  status,
  showText = true,
  className = '',
}) => {
  /**
   * Get health status configuration
   */
  const getStatusConfig = () => {
    switch (status) {
      case 'healthy':
        return {
          label: '健康',
          icon: '🟢',
          bgColor: 'bg-green-100',
          textColor: 'text-green-800',
          borderColor: 'border-green-200',
        };
      case 'warning':
        return {
          label: '警告',
          icon: '🟡',
          bgColor: 'bg-yellow-100',
          textColor: 'text-yellow-800',
          borderColor: 'border-yellow-200',
        };
      case 'unhealthy':
        return {
          label: '不健康',
          icon: '🔴',
          bgColor: 'bg-red-100',
          textColor: 'text-red-800',
          borderColor: 'border-red-200',
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

  const config = getStatusConfig();

  return (
    <span
      role="badge"
      aria-label="健康状态"
      className={`
        inline-flex items-center gap-1.5 rounded-full font-medium
        border ${config.bgColor} ${config.textColor}
        ${config.borderColor} px-3 py-1 text-sm
        ${className}
      `}
      data-testid={`health-status-${status}`}
    >
      <span>{config.icon}</span>
      {showText && <span>{config.label}</span>}
    </span>
  );
};

export default HealthStatusBadge;
