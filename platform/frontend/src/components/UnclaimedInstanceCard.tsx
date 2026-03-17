/**
 * UnclaimedInstanceCard 组件
 * 显示未认领的远程实例信息，并提供认领按钮
 */

import type { UnclaimedInstance } from '../types/instance';

interface UnclaimedInstanceCardProps {
  instance: UnclaimedInstance;
  onClaim: (instanceId: string) => void;
  loading?: boolean;
}

export default function UnclaimedInstanceCard({
  instance,
  onClaim,
  loading = false,
}: UnclaimedInstanceCardProps) {
  const {
    instance_id,
    remote_host,
    remote_port,
    remote_version,
    capabilities,
    health_status,
  } = instance;

  const healthStatusConfig = {
    healthy: { color: 'bg-green-100 text-green-800', icon: '🟢', text: '健康' },
    warning: { color: 'bg-yellow-100 text-yellow-800', icon: '🟡', text: '警告' },
    unhealthy: { color: 'bg-red-100 text-red-800', icon: '🔴', text: '不健康' },
  };

  const healthConfig = healthStatusConfig[health_status];

  return (
    <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow duration-200 p-6">
      {/* 头部：实例ID和健康状态 */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 mb-1" data-testid={`unclaimed-instance-${instance_id}`}>
            {instance_id}
          </h3>
          <p className="text-sm text-gray-600">
            {remote_host}:{remote_port}
          </p>
        </div>
        <div
          className={`px-3 py-1 rounded-full text-xs font-medium ${healthConfig.color}`}
          data-testid="health-status"
        >
          {healthConfig.icon} {healthConfig.text}
        </div>
      </div>

      {/* 版本信息 */}
      <div className="mb-4">
        <span className="text-sm text-gray-600">版本: </span>
        <span className="text-sm font-medium text-gray-900">{remote_version}</span>
      </div>

      {/* 能力标签 */}
      {capabilities && capabilities.length > 0 && (
        <div className="mb-4">
          <div className="flex flex-wrap gap-2">
            {capabilities.map((capability) => (
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

      {/* 认领按钮 */}
      <button
        onClick={() => onClaim(instance_id)}
        disabled={loading}
        className={`w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white rounded-lg transition-colors duration-200 font-medium ${
          loading ? 'cursor-not-allowed' : ''
        }`}
        data-testid={`claim-${instance_id}`}
      >
        {loading ? '认领中...' : '认领'}
      </button>
    </div>
  );
}
