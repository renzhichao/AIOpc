/**
 * RemoteInstanceCard Component Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import RemoteInstanceCard from './RemoteInstanceCard';
import type { Instance, UnclaimedInstance } from '../types/instance';

describe('RemoteInstanceCard Component', () => {
  const mockClaimedInstance: Instance = {
    id: 1,
    instance_id: 'test-instance-id-123',
    owner_id: 1,
    template: 'personal',
    config: { name: 'Test Remote Instance' },
    status: 'active',
    deployment_type: 'remote',
    restart_attempts: 0,
    created_at: '2024-01-01T00:00:00Z',
    remote_host: '192.168.1.100',
    remote_port: 3000,
    remote_version: '1.0.0',
    health_status: 'healthy',
    capabilities: ['chat', 'code'],
    last_heartbeat_at: '2024-01-01T12:00:00Z',
  };

  const mockUnclaimedInstance: UnclaimedInstance = {
    instance_id: 'unclaimed-instance-456',
    deployment_type: 'remote',
    status: 'pending',
    remote_host: '192.168.1.101',
    remote_port: 3000,
    remote_version: '1.0.0',
    capabilities: ['chat', 'code', 'analysis'],
    health_status: 'healthy',
    created_at: '2024-01-01T00:00:00Z',
  };

  describe('Rendering Claimed Instances', () => {
    it('should render claimed instance correctly', () => {
      render(
        <RemoteInstanceCard
          instance={mockClaimedInstance}
          onViewDetails={vi.fn()}
        />
      );

      expect(screen.getByText('Test Remote Instance')).toBeInTheDocument();
      expect(screen.getByText('192.168.1.100:3000')).toBeInTheDocument();
      expect(screen.getByText('1.0.0')).toBeInTheDocument();
    });

    it('should display instance name if available', () => {
      render(
        <RemoteInstanceCard
          instance={mockClaimedInstance}
          onViewDetails={vi.fn()}
        />
      );

      expect(screen.getByText('Test Remote Instance')).toBeInTheDocument();
    });

    it('should display instance ID if name not available', () => {
      const instanceWithoutName = { ...mockClaimedInstance, config: {} };
      render(
        <RemoteInstanceCard
          instance={instanceWithoutName}
          onViewDetails={vi.fn()}
        />
      );

      expect(screen.getByText('test-instance-id-123')).toBeInTheDocument();
    });

    it('should display connection information', () => {
      render(
        <RemoteInstanceCard
          instance={mockClaimedInstance}
          onViewDetails={vi.fn()}
        />
      );

      expect(screen.getByText('192.168.1.100:3000')).toBeInTheDocument();
      expect(screen.getByText('1.0.0')).toBeInTheDocument();
    });

    it('should display last heartbeat time', () => {
      render(
        <RemoteInstanceCard
          instance={mockClaimedInstance}
          onViewDetails={vi.fn()}
        />
      );

      expect(screen.getByText(/最后心跳/)).toBeInTheDocument();
    });

    it('should display capabilities as tags', () => {
      render(
        <RemoteInstanceCard
          instance={mockClaimedInstance}
          onViewDetails={vi.fn()}
        />
      );

      expect(screen.getByText('chat')).toBeInTheDocument();
      expect(screen.getByText('code')).toBeInTheDocument();
    });
  });

  describe('Rendering Unclaimed Instances', () => {
    it('should render unclaimed instance correctly', () => {
      const onClaim = vi.fn();
      render(
        <RemoteInstanceCard
          instance={mockUnclaimedInstance}
          onClaim={onClaim}
        />
      );

      expect(screen.getByText('unclaimed-instance-456')).toBeInTheDocument();
      expect(screen.getByText('192.168.1.101:3000')).toBeInTheDocument();
    });

    it('should show claim button for unclaimed instances', () => {
      const onClaim = vi.fn();
      render(
        <RemoteInstanceCard
          instance={mockUnclaimedInstance}
          onClaim={onClaim}
        />
      );

      const claimButton = screen.getByRole('button', { name: /认领/ });
      expect(claimButton).toBeInTheDocument();
    });

    it('should not show claim button for claimed instances', () => {
      render(
        <RemoteInstanceCard
          instance={mockClaimedInstance}
          onViewDetails={vi.fn()}
        />
      );

      expect(screen.queryByRole('button', { name: /认领/ })).not.toBeInTheDocument();
    });
  });

  describe('Badge Components Integration', () => {
    it('should display InstanceTypeBadge for remote instances', () => {
      render(
        <RemoteInstanceCard
          instance={mockClaimedInstance}
          onViewDetails={vi.fn()}
        />
      );

      expect(screen.getByTestId('instance-type-remote')).toBeInTheDocument();
      expect(screen.getByText('远程')).toBeInTheDocument();
    });

    it('should display HealthStatusBadge', () => {
      render(
        <RemoteInstanceCard
          instance={mockClaimedInstance}
          onViewDetails={vi.fn()}
        />
      );

      expect(screen.getByTestId('health-status-healthy')).toBeInTheDocument();
      expect(screen.getByText('健康')).toBeInTheDocument();
    });

    it('should display warning health status correctly', () => {
      const instanceWithWarning = {
        ...mockClaimedInstance,
        health_status: 'warning' as const,
      };
      render(
        <RemoteInstanceCard
          instance={instanceWithWarning}
          onViewDetails={vi.fn()}
        />
      );

      expect(screen.getByTestId('health-status-warning')).toBeInTheDocument();
      expect(screen.getByText('警告')).toBeInTheDocument();
    });

    it('should display unhealthy status correctly', () => {
      const instanceUnhealthy = {
        ...mockClaimedInstance,
        health_status: 'unhealthy' as const,
      };
      render(
        <RemoteInstanceCard
          instance={instanceUnhealthy}
          onViewDetails={vi.fn()}
        />
      );

      expect(screen.getByTestId('health-status-unhealthy')).toBeInTheDocument();
      expect(screen.getByText('不健康')).toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    it('should call onClaim when claim button is clicked', () => {
      const onClaim = vi.fn();
      render(
        <RemoteInstanceCard
          instance={mockUnclaimedInstance}
          onClaim={onClaim}
        />
      );

      const claimButton = screen.getByRole('button', { name: /认领/ });
      fireEvent.click(claimButton);

      expect(onClaim).toHaveBeenCalledTimes(1);
      expect(onClaim).toHaveBeenCalledWith('unclaimed-instance-456');
    });

    it('should call onViewDetails when view details button is clicked', () => {
      const onViewDetails = vi.fn();
      render(
        <RemoteInstanceCard
          instance={mockClaimedInstance}
          onViewDetails={onViewDetails}
        />
      );

      const viewButton = screen.getByRole('button', { name: /查看详情/ });
      fireEvent.click(viewButton);

      expect(onViewDetails).toHaveBeenCalledTimes(1);
      expect(onViewDetails).toHaveBeenCalledWith('test-instance-id-123');
    });

    it('should not call onClaim when clicked outside button', () => {
      const onClaim = vi.fn();
      render(
        <RemoteInstanceCard
          instance={mockUnclaimedInstance}
          onClaim={onClaim}
        />
      );

      const card = screen.getByTestId('remote-instance-card');
      fireEvent.click(card);

      expect(onClaim).not.toHaveBeenCalled();
    });
  });

  describe('Loading States', () => {
    it('should show loading state on claim button', () => {
      const onClaim = vi.fn();
      render(
        <RemoteInstanceCard
          instance={mockUnclaimedInstance}
          onClaim={onClaim}
          loading={true}
        />
      );

      const claimButton = screen.getByRole('button', { name: /认领中/ });
      expect(claimButton).toBeDisabled();
    });

    it('should show loading state on view details button', () => {
      const onViewDetails = vi.fn();
      render(
        <RemoteInstanceCard
          instance={mockClaimedInstance}
          onViewDetails={onViewDetails}
          loading={true}
        />
      );

      const viewButton = screen.getByRole('button', { name: /加载中/ });
      expect(viewButton).toBeDisabled();
    });
  });

  describe('Styling and Layout', () => {
    it('should apply card styling classes', () => {
      const { container } = render(
        <RemoteInstanceCard
          instance={mockClaimedInstance}
          onViewDetails={vi.fn()}
        />
      );

      const card = container.querySelector('[data-testid="remote-instance-card"]');
      expect(card).toHaveClass('bg-white', 'rounded-lg', 'shadow-md');
    });

    it('should apply hover effect', () => {
      const { container } = render(
        <RemoteInstanceCard
          instance={mockClaimedInstance}
          onViewDetails={vi.fn()}
        />
      );

      const card = container.querySelector('[data-testid="remote-instance-card"]');
      expect(card).toHaveClass('hover:shadow-lg');
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(
        <RemoteInstanceCard
          instance={mockClaimedInstance}
          onViewDetails={vi.fn()}
        />
      );

      const card = screen.getByTestId('remote-instance-card');
      expect(card).toHaveAttribute('role', 'article');
    });

    it('should have accessible button labels', () => {
      render(
        <RemoteInstanceCard
          instance={mockClaimedInstance}
          onViewDetails={vi.fn()}
        />
      );

      const viewButton = screen.getByRole('button', { name: /查看详情/ });
      expect(viewButton).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle instance without capabilities', () => {
      const instanceWithoutCapabilities = {
        ...mockClaimedInstance,
        capabilities: undefined,
      };
      render(
        <RemoteInstanceCard
          instance={instanceWithoutCapabilities}
          onViewDetails={vi.fn()}
        />
      );

      // Should not crash and should not display capability section
      expect(screen.queryByText('能力')).not.toBeInTheDocument();
    });

    it('should handle instance without last heartbeat', () => {
      const instanceWithoutHeartbeat = {
        ...mockClaimedInstance,
        last_heartbeat_at: undefined,
      };
      render(
        <RemoteInstanceCard
          instance={instanceWithoutHeartbeat}
          onViewDetails={vi.fn()}
        />
      );

      expect(screen.queryByText(/最后心跳/)).not.toBeInTheDocument();
    });

    it('should handle instance without version', () => {
      const instanceWithoutVersion = {
        ...mockClaimedInstance,
        remote_version: undefined,
      };
      render(
        <RemoteInstanceCard
          instance={instanceWithoutVersion}
          onViewDetails={vi.fn()}
        />
      );

      expect(screen.queryByText('版本')).not.toBeInTheDocument();
    });
  });
});
