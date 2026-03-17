/**
 * InstanceTypeBadge Component
 *
 * Reusable badge component for displaying instance deployment type.
 * Supports different sizes with appropriate icons and styling.
 */

import React from 'react';
import type { DeploymentType } from '../types/instance';

export interface InstanceTypeBadgeProps {
  type: DeploymentType;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const InstanceTypeBadge: React.FC<InstanceTypeBadgeProps> = ({
  type,
  size = 'md',
  className = '',
}) => {
  /**
   * Get type configuration
   */
  const getTypeConfig = () => {
    switch (type) {
      case 'local':
        return {
          label: '本地',
          icon: '🏠',
          bgColor: 'bg-blue-100',
          textColor: 'text-blue-800',
          borderColor: 'border-blue-200',
        };
      case 'remote':
        return {
          label: '远程',
          icon: '🌐',
          bgColor: 'bg-purple-100',
          textColor: 'text-purple-800',
          borderColor: 'border-purple-200',
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

  const config = getTypeConfig();
  const sizeClasses = getSizeClasses();

  return (
    <span
      role="badge"
      className={`
        inline-flex items-center gap-1.5 rounded-full font-medium
        border ${config.bgColor} ${config.textColor}
        ${config.borderColor} ${sizeClasses}
        ${className}
      `}
      data-testid={`instance-type-${type}`}
    >
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </span>
  );
};

export default InstanceTypeBadge;
