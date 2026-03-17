# TASK-009-07 Component Usage Examples

## InstanceTypeBadge

Display instance deployment type (local/remote) as a visual badge.

### Basic Usage

```tsx
import { InstanceTypeBadge } from '@/components/InstanceTypeBadge';

// Local instance
<InstanceTypeBadge type="local" />

// Remote instance
<InstanceTypeBadge type="remote" />
```

### Size Variants

```tsx
// Small size
<InstanceTypeBadge type="remote" size="sm" />

// Medium size (default)
<InstanceTypeBadge type="remote" size="md" />

// Large size
<InstanceTypeBadge type="remote" size="lg" />
```

### With Custom Styling

```tsx
<InstanceTypeBadge
  type="remote"
  size="md"
  className="ml-2"
/>
```

---

## HealthStatusBadge

Display instance health status as a visual badge.

### Basic Usage

```tsx
import { HealthStatusBadge } from '@/components/HealthStatusBadge';

// Healthy status
<HealthStatusBadge status="healthy" />

// Warning status
<HealthStatusBadge status="warning" />

// Unhealthy status
<HealthStatusBadge status="unhealthy" />
```

### Icon Only (No Text)

```tsx
<HealthStatusBadge status="healthy" showText={false} />
```

### With Custom Styling

```tsx
<HealthStatusBadge
  status="healthy"
  showText={true}
  className="ml-2"
/>
```

---

## RemoteInstanceCard

Display remote instance information with actions.

### With Unclaimed Instance

```tsx
import RemoteInstanceCard from '@/components/RemoteInstanceCard';
import type { UnclaimedInstance } from '@/types/instance';

const unclaimedInstance: UnclaimedInstance = {
  instance_id: 'unclaimed-123',
  deployment_type: 'remote',
  status: 'pending',
  remote_host: '192.168.1.100',
  remote_port: 3000,
  remote_version: '1.0.0',
  capabilities: ['chat', 'code', 'analysis'],
  health_status: 'healthy',
  created_at: '2024-01-01T00:00:00Z',
};

function MyComponent() {
  const handleClaim = async (instanceId: string) => {
    await claimInstance(instanceId);
  };

  return (
    <RemoteInstanceCard
      instance={unclaimedInstance}
      onClaim={handleClaim}
    />
  );
}
```

### With Claimed Instance

```tsx
import RemoteInstanceCard from '@/components/RemoteInstanceCard';
import type { Instance } from '@/types/instance';

const claimedInstance: Instance = {
  id: 1,
  instance_id: 'remote-456',
  owner_id: 1,
  template: 'personal',
  config: { name: 'My Remote Instance' },
  status: 'active',
  deployment_type: 'remote',
  restart_attempts: 0,
  created_at: '2024-01-01T00:00:00Z',
  remote_host: '192.168.1.101',
  remote_port: 3000,
  remote_version: '1.0.0',
  health_status: 'healthy',
  capabilities: ['chat', 'code'],
  last_heartbeat_at: '2024-01-01T12:00:00Z',
};

function MyComponent() {
  const handleViewDetails = (instanceId: string) => {
    navigate(`/instances/${instanceId}`);
  };

  return (
    <RemoteInstanceCard
      instance={claimedInstance}
      onViewDetails={handleViewDetails}
    />
  );
}
```

### With Loading State

```tsx
function MyComponent() {
  const [loading, setLoading] = useState(false);

  const handleClaim = async (instanceId: string) => {
    setLoading(true);
    try {
      await claimInstance(instanceId);
    } finally {
      setLoading(false);
    }
  };

  return (
    <RemoteInstanceCard
      instance={unclaimedInstance}
      onClaim={handleClaim}
      loading={loading}
    />
  );
}
```

### Grid Layout for Multiple Instances

```tsx
function InstanceGrid({ instances }: { instances: Instance[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {instances.map((instance) => (
        <RemoteInstanceCard
          key={instance.instance_id}
          instance={instance}
          onViewDetails={(id) => navigate(`/instances/${id}`)}
        />
      ))}
    </div>
  );
}
```

---

## Component Composition Example

```tsx
import { InstanceTypeBadge } from '@/components/InstanceTypeBadge';
import { HealthStatusBadge } from '@/components/HealthStatusBadge';

function InstanceHeader({ instance }: { instance: Instance }) {
  return (
    <div className="flex items-center gap-2">
      <h2>{instance.config.name || instance.instance_id}</h2>
      <InstanceTypeBadge type={instance.deployment_type} size="sm" />
      {instance.health_status && (
        <HealthStatusBadge status={instance.health_status} />
      )}
    </div>
  );
}
```

---

## Styling Customization

All components support custom className prop for additional styling:

```tsx
<InstanceTypeBadge
  type="remote"
  className="shadow-sm"
/>

<HealthStatusBadge
  status="healthy"
  className="border-2"
/>

<RemoteInstanceCard
  instance={instance}
  onViewDetails={handleView}
  className="hover:scale-105 transition-transform"
/>
```

---

## Accessibility Features

All components include proper ARIA labels and keyboard navigation support:

- **InstanceTypeBadge**: `role="badge"` and proper testids
- **HealthStatusBadge**: `role="badge"`, `aria-label="健康状态"`
- **RemoteInstanceCard**: `role="article"`, semantic HTML structure

---

## TypeScript Support

All components have full TypeScript type definitions:

```tsx
import type {
  InstanceTypeBadgeProps,
  HealthStatusBadgeProps,
} from '@/components';

import type {
  Instance,
  UnclaimedInstance,
  DeploymentType,
  HealthStatus,
} from '@/types/instance';
```

---

## Testing

Components are fully tested with React Testing Library:

```bash
# Run all tests
npm test

# Run specific component tests
npm test -- InstanceTypeBadge
npm test -- HealthStatusBadge
npm test -- RemoteInstanceCard
```

---

## Notes

1. **RemoteInstanceCard** automatically detects whether an instance is claimed or unclaimed
2. The card shows different actions based on instance state:
   - Unclaimed: Shows "认领" (Claim) button
   - Claimed: Shows "查看详情" (View Details) button
3. All components follow the existing design system patterns
4. Components are responsive and work on mobile, tablet, and desktop
5. Loading states disable interaction and show appropriate text
