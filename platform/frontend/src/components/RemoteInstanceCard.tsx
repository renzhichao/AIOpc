/**
 * RemoteInstanceCard Component
 *
 * Card component for displaying remote instance information.
 * Handles both claimed (Instance) and unclaimed (UnclaimedInstance) remote instances.
 */

import React from 'react';
import type { Instance, UnclaimedInstance } from '../types/instance';
import { InstanceTypeBadge } from './InstanceTypeBadge';
import { HealthStatusBadge } from './HealthStatusBadge';

interface RemoteInstanceCardProps {
  instance: Instance | UnclaimedInstance;
  onClaim?: (instanceId: string) => Promise<void>;
  onViewDetails?: (instanceId: string) => void;
  loading?: boolean;
}

export default function RemoteInstanceCard({
  instance,
  onClaim,
  onViewDetails,
  loading = false,
}: RemoteInstanceCardProps) {
  /**
   * Check if instance is unclaimed
   */
  const isUnclaimed = (inst: Instance | UnclaimedInstance): inst is UnclaimedInstance => {
    return 'status' in inst && inst.status === 'pending' && !('owner_id' in inst);
  };

  /**
   * Get instance ID
   */
  const getInstanceId = (): string => {
    return instance.instance_id;
  };

  /**
   * Get instance display name
   */
  const getDisplayName = (): string => {
    if (!isUnclaimed(instance) && instance.config?.name) {
      return instance.config.name;
    }
    return getInstanceId();
  };

  /**
   * Get remote host and port
   */
  const getConnectionInfo = (): string => {
    return `${instance.remote_host}:${instance.remote_port}`;
  };

  /**
   * Format date for display
   */
  const formatDate = (dateString?: string): string => {
    if (!dateString) return '';

    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  /**
   * Handle claim action
   */
  const handleClaim = async () => {
    if (onClaim) {
      await onClaim(getInstanceId());
    }
  };

  /**
   * Handle view details action
   */
  const handleViewDetails = () => {
    if (onViewDetails) {
      onViewDetails(getInstanceId());
    }
  };

  return (
    <article
      data-testid="remote-instance-card"
      role="article"
      className="bg-white rounded-lg shadow-md hover:shadow-lg transition-all duration-200 overflow-hidden"
    >
      <div className="p-6">
        {/* Header: Name/ID and Badges */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <h3
                className="text-lg font-semibold text-gray-900 truncate"
                data-testid={`instance-name-${getInstanceId()}`}
              >
                {getDisplayName()}
              </h3>
              <InstanceTypeBadge type="remote" size="sm" />
            </div>
            <p className="text-sm text-gray-600">{getConnectionInfo()}</p>
          </div>

          <HealthStatusBadge status={instance.health_status} />
        </div>

        {/* Connection Information */}
        <div className="mb-4 text-sm text-gray-600 space-y-1">
          {instance.remote_version && (
            <div data-testid="remote-version">
              <span className="font-medium">版本: </span>
              <span>{instance.remote_version}</span>
            </div>
          )}

          {!isUnclaimed(instance) && instance.last_heartbeat_at && (
            <div data-testid="last-heartbeat">
              <span className="font-medium">最后心跳: </span>
              <span>{formatDate(instance.last_heartbeat_at)}</span>
            </div>
          )}
        </div>

        {/* Capabilities */}
        {instance.capabilities && instance.capabilities.length > 0 && (
          <div className="mb-4">
            <div className="flex flex-wrap gap-2" data-testid="capabilities">
              {instance.capabilities.map((capability) => (
                <span
                  key={capability}
                  className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded text-xs font-medium"
                  data-testid={`capability-${capability}`}
                >
                  {capability}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div
          className="flex items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          {isUnclaimed(instance) && onClaim && (
            <button
              onClick={handleClaim}
              disabled={loading}
              className={`flex-1 py-2 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white rounded-lg transition-colors duration-200 text-sm font-medium ${
                loading ? 'cursor-not-allowed' : ''
              }`}
              data-testid={`claim-button-${getInstanceId()}`}
            >
              {loading ? '认领中...' : '认领'}
            </button>
          )}

          {!isUnclaimed(instance) && onViewDetails && (
            <button
              onClick={handleViewDetails}
              disabled={loading}
              className={`flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition-colors duration-200 text-sm font-medium ${
                loading ? 'cursor-not-allowed' : ''
              }`}
              data-testid={`view-details-button-${getInstanceId()}`}
            >
              {loading ? '加载中...' : '查看详情'}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
