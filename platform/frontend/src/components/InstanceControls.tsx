/**
 * InstanceControls Component
 *
 * Control button group for instance management.
 * Provides start, stop, restart, and delete actions.
 */

import React from 'react';
import type { InstanceStatus } from '../types/instance';

export interface InstanceControlsProps {
  status: InstanceStatus;
  onStart?: () => void;
  onStop?: () => void;
  onRestart?: () => void;
  onDelete?: () => void;
  onConfig?: () => void;
  loading?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  layout?: 'horizontal' | 'vertical';
  showLabels?: boolean;
}

export const InstanceControls: React.FC<InstanceControlsProps> = ({
  status,
  onStart,
  onStop,
  onRestart,
  onDelete,
  onConfig,
  loading = false,
  disabled = false,
  size = 'md',
  layout = 'horizontal',
  showLabels = true,
}) => {
  /**
   * Determine which actions are available based on status
   */
  const canStart = status === 'stopped' || status === 'error';
  const canStop = status === 'active';
  const canRestart = status === 'active' || status === 'error';

  /**
   * Get button size classes
   */
  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return 'px-3 py-1.5 text-xs';
      case 'lg':
        return 'px-6 py-3 text-base';
      case 'md':
      default:
        return 'px-4 py-2 text-sm';
    }
  };

  /**
   * Base button classes
   */
  const buttonClasses = `
    ${getSizeClasses()}
    rounded-lg font-medium
    transition-colors duration-200
    disabled:bg-gray-300 disabled:text-gray-500
    flex items-center justify-center gap-2
  `;

  /**
   * Handle delete with confirmation
   */
  const handleDeleteClick = () => {
    if (onDelete && confirm('确定要删除此实例吗？此操作不可恢复。')) {
      onDelete();
    }
  };

  /**
   * Render single control button
   */
  const renderButton = (
    onClick: (() => void) | undefined,
    label: string,
    icon: string,
    colorClass: string,
    testId: string,
    extraDisabled: boolean = false
  ) => (
    <button
      onClick={onClick}
      disabled={loading || disabled || extraDisabled}
      className={`${buttonClasses} ${colorClass}`}
      data-testid={testId}
    >
      {loading ? (
        <>
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
          {showLabels && '处理中...'}
        </>
      ) : (
        <>
          <span>{icon}</span>
          {showLabels && <span>{label}</span>}
        </>
      )}
    </button>
  );

  const controls = (
    <>
      {canStart && renderButton(onStart, '启动', '▶️', 'bg-green-600 hover:bg-green-700 text-white', 'start-button', false)}
      {canStop && renderButton(onStop, '停止', '⏸️', 'bg-yellow-600 hover:bg-yellow-700 text-white', 'stop-button', false)}
      {canRestart && renderButton(onRestart, '重启', '🔄', 'bg-blue-600 hover:bg-blue-700 text-white', 'restart-button', false)}
      {onConfig && renderButton(onConfig, '配置', '⚙️', 'bg-purple-600 hover:bg-purple-700 text-white', 'config-button', false)}
      {onDelete && renderButton(handleDeleteClick, '删除', '🗑️', 'bg-red-600 hover:bg-red-700 text-white', 'delete-button', false)}
    </>
  );

  return (
    <div
      className={`
        flex gap-2
        ${layout === 'vertical' ? 'flex-col' : 'flex-row'}
      `}
      data-testid="instance-controls"
    >
      {controls}
    </div>
  );
};

export default InstanceControls;
