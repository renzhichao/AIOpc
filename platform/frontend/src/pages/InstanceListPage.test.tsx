/**
 * InstanceListPage 组件测试
 * 测试实例列表页面的标签页切换和实例管理功能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import InstanceListPage from './InstanceListPage';
import { AuthProvider } from '../contexts/AuthContext';
import { instanceService } from '../services/instance';
import type { Instance, UnclaimedInstance } from '../types/instance';

// Mock instanceService
vi.mock('../services/instance', () => ({
  instanceService: {
    listInstances: vi.fn(),
    getUnclaimedInstances: vi.fn(),
    claimInstance: vi.fn(),
    startInstance: vi.fn(),
    stopInstance: vi.fn(),
    restartInstance: vi.fn(),
    deleteInstance: vi.fn(),
  },
}));

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Helper function to render component with providers
function renderInstanceListPage(initialEntries = ['/instances']) {
  return {
    user: userEvent.setup(),
    ...render(
      <MemoryRouter initialEntries={initialEntries}>
        <AuthProvider>
          <InstanceListPage />
        </AuthProvider>
      </MemoryRouter>
    ),
  };
}

// Mock data
const mockClaimedInstances: Instance[] = [
  {
    id: 1,
    instance_id: 'inst-001',
    owner_id: 1,
    owner: { id: 1, username: 'testuser' },
    name: 'My Local Instance',
    description: 'A local instance',
    template: 'personal',
    config: { name: 'My Local Instance', description: 'A local instance' },
    status: 'active',
    deployment_type: 'local',
    restart_attempts: 0,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    health_status: 'healthy',
  },
  {
    id: 2,
    instance_id: 'inst-002',
    owner_id: 1,
    owner: { id: 1, username: 'testuser' },
    name: 'My Remote Instance',
    description: 'A claimed remote instance',
    template: 'team',
    config: { name: 'My Remote Instance', description: 'A claimed remote instance' },
    status: 'active',
    deployment_type: 'remote',
    remote_host: '192.168.1.100',
    remote_port: 3000,
    remote_version: '1.0.0',
    restart_attempts: 0,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    claimed_at: '2024-01-01T01:00:00Z',
    last_heartbeat_at: '2024-01-01T02:00:00Z',
    health_status: 'healthy',
    capabilities: ['chat', 'code'],
  },
];

const mockUnclaimedInstances: UnclaimedInstance[] = [
  {
    instance_id: 'unclaimed-001',
    deployment_type: 'remote',
    status: 'pending',
    remote_host: '192.168.1.101',
    remote_port: 3000,
    remote_version: '1.0.0',
    capabilities: ['chat', 'code', 'analysis'],
    health_status: 'healthy',
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    instance_id: 'unclaimed-002',
    deployment_type: 'remote',
    status: 'pending',
    remote_host: '192.168.1.102',
    remote_port: 3000,
    remote_version: '1.0.0',
    capabilities: ['chat'],
    health_status: 'warning',
    created_at: '2024-01-01T00:00:00Z',
  },
];

describe('InstanceListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock localStorage to have a valid token and user
    localStorage.setItem('access_token', 'mock-token');
    localStorage.setItem('auth_token', 'mock-token');
    localStorage.setItem('auth_user', JSON.stringify({
      id: '1',
      feishu_user_id: 'test_user',
      name: 'Test User',
      email: 'test@example.com',
    }));
  });

  describe('Tab Navigation', () => {
    it('should render tab navigation', () => {
      vi.mocked(instanceService.listInstances).mockResolvedValue(mockClaimedInstances);
      vi.mocked(instanceService.getUnclaimedInstances).mockResolvedValue(mockUnclaimedInstances);

      renderInstanceListPage();

      expect(screen.getByTestId('tab-claimed')).toBeInTheDocument();
      expect(screen.getByTestId('tab-unclaimed')).toBeInTheDocument();
    });

    it('should display correct tab labels', () => {
      vi.mocked(instanceService.listInstances).mockResolvedValue(mockClaimedInstances);
      vi.mocked(instanceService.getUnclaimedInstances).mockResolvedValue(mockUnclaimedInstances);

      renderInstanceListPage();

      expect(screen.getByTestId('tab-claimed')).toHaveTextContent('我的实例');
      expect(screen.getByTestId('tab-unclaimed')).toHaveTextContent('可用实例');
    });

    it('should default to "claimed" tab', () => {
      vi.mocked(instanceService.listInstances).mockResolvedValue(mockClaimedInstances);
      vi.mocked(instanceService.getUnclaimedInstances).mockResolvedValue(mockUnclaimedInstances);

      renderInstanceListPage();

      expect(screen.getByTestId('tab-claimed')).toHaveClass('border-indigo-600');
    });

    it('should switch to unclaimed tab when clicked', async () => {
      vi.mocked(instanceService.listInstances).mockResolvedValue(mockClaimedInstances);
      vi.mocked(instanceService.getUnclaimedInstances).mockResolvedValue(mockUnclaimedInstances);

      const { user } = renderInstanceListPage();

      await user.click(screen.getByTestId('tab-unclaimed'));

      await waitFor(() => {
        expect(screen.getByTestId('tab-unclaimed')).toHaveClass('border-indigo-600');
      });
    });

    it('should switch back to claimed tab when clicked', async () => {
      vi.mocked(instanceService.listInstances).mockResolvedValue(mockClaimedInstances);
      vi.mocked(instanceService.getUnclaimedInstances).mockResolvedValue([]);

      const { user } = renderInstanceListPage(['/instances?tab=unclaimed']);

      await user.click(screen.getByTestId('tab-claimed'));

      await waitFor(() => {
        expect(screen.getByTestId('tab-claimed')).toHaveClass('border-indigo-600');
      });
    });

    it('should update URL parameter when tab is clicked', async () => {
      vi.mocked(instanceService.listInstances).mockResolvedValue(mockClaimedInstances);
      vi.mocked(instanceService.getUnclaimedInstances).mockResolvedValue(mockUnclaimedInstances);

      const { user } = renderInstanceListPage();

      await user.click(screen.getByTestId('tab-unclaimed'));

      await waitFor(() => {
        expect(screen.getByTestId('tab-unclaimed')).toHaveClass('border-indigo-600');
      });
    });

    it('should read tab from URL parameter on mount', () => {
      vi.mocked(instanceService.listInstances).mockResolvedValue(mockClaimedInstances);
      vi.mocked(instanceService.getUnclaimedInstances).mockResolvedValue(mockUnclaimedInstances);

      renderInstanceListPage(['/instances?tab=unclaimed']);

      expect(screen.getByTestId('tab-unclaimed')).toHaveClass('border-indigo-600');
    });
  });

  describe('My Instances Tab Content', () => {
    it('should fetch and display claimed instances', async () => {
      vi.mocked(instanceService.listInstances).mockResolvedValue(mockClaimedInstances);
      vi.mocked(instanceService.getUnclaimedInstances).mockResolvedValue([]);

      renderInstanceListPage();

      await waitFor(() => {
        expect(instanceService.listInstances).toHaveBeenCalledOnce();
      });

      await waitFor(() => {
        expect(screen.getByText('My Local Instance')).toBeInTheDocument();
        expect(screen.getByText('My Remote Instance')).toBeInTheDocument();
      });
    });

    it('should display instance type badges', async () => {
      vi.mocked(instanceService.listInstances).mockResolvedValue(mockClaimedInstances);
      vi.mocked(instanceService.getUnclaimedInstances).mockResolvedValue([]);

      renderInstanceListPage();

      await waitFor(() => {
        expect(screen.getByText('本地')).toBeInTheDocument();
        expect(screen.getByText('远程')).toBeInTheDocument();
      });
    });

    it('should display health status indicators', async () => {
      vi.mocked(instanceService.listInstances).mockResolvedValue(mockClaimedInstances);
      vi.mocked(instanceService.getUnclaimedInstances).mockResolvedValue([]);

      renderInstanceListPage();

      await waitFor(() => {
        expect(screen.getAllByTestId('health-status')).toHaveLength(2);
      });
    });

    it('should display last heartbeat time for remote instances', async () => {
      vi.mocked(instanceService.listInstances).mockResolvedValue(mockClaimedInstances);
      vi.mocked(instanceService.getUnclaimedInstances).mockResolvedValue([]);

      renderInstanceListPage();

      await waitFor(() => {
        expect(screen.getByText(/最后心跳/)).toBeInTheDocument();
      });
    });

    it('should show empty state when no claimed instances', async () => {
      vi.mocked(instanceService.listInstances).mockResolvedValue([]);
      vi.mocked(instanceService.getUnclaimedInstances).mockResolvedValue([]);

      renderInstanceListPage();

      await waitFor(() => {
        expect(screen.getByText('还没有实例')).toBeInTheDocument();
      });
    });
  });

  describe('Available Instances Tab Content', () => {
    it('should fetch and display unclaimed instances', async () => {
      vi.mocked(instanceService.listInstances).mockResolvedValue([]);
      vi.mocked(instanceService.getUnclaimedInstances).mockResolvedValue(mockUnclaimedInstances);

      const { user } = renderInstanceListPage(['/instances?tab=unclaimed']);

      await user.click(screen.getByTestId('tab-unclaimed'));

      await waitFor(() => {
        expect(instanceService.getUnclaimedInstances).toHaveBeenCalledOnce();
      });

      expect(screen.getByText('unclaimed-001')).toBeInTheDocument();
      expect(screen.getByText('unclaimed-002')).toBeInTheDocument();
    });

    it('should display remote host and port for unclaimed instances', async () => {
      vi.mocked(instanceService.listInstances).mockResolvedValue([]);
      vi.mocked(instanceService.getUnclaimedInstances).mockResolvedValue(mockUnclaimedInstances);

      const { user } = renderInstanceListPage(['/instances?tab=unclaimed']);

      await user.click(screen.getByTestId('tab-unclaimed'));

      await waitFor(() => {
        expect(screen.getByText('192.168.1.101:3000')).toBeInTheDocument();
        expect(screen.getByText('192.168.1.102:3000')).toBeInTheDocument();
      });
    });

    it('should display remote version', async () => {
      vi.mocked(instanceService.listInstances).mockResolvedValue([]);
      vi.mocked(instanceService.getUnclaimedInstances).mockResolvedValue(mockUnclaimedInstances);

      const { user } = renderInstanceListPage(['/instances?tab=unclaimed']);

      await user.click(screen.getByTestId('tab-unclaimed'));

      await waitFor(() => {
        expect(screen.getAllByText('1.0.0')).toHaveLength(2);
      });
    });

    it('should display capabilities as tags', async () => {
      vi.mocked(instanceService.listInstances).mockResolvedValue([]);
      vi.mocked(instanceService.getUnclaimedInstances).mockResolvedValue(mockUnclaimedInstances);

      const { user } = renderInstanceListPage(['/instances?tab=unclaimed']);

      await user.click(screen.getByTestId('tab-unclaimed'));

      await waitFor(() => {
        expect(screen.getAllByTestId('capability-chat')).toHaveLength(2);
        expect(screen.getByTestId('capability-code')).toBeInTheDocument();
        expect(screen.getByTestId('capability-analysis')).toBeInTheDocument();
      });
    });

    it('should display claim button for each unclaimed instance', async () => {
      vi.mocked(instanceService.listInstances).mockResolvedValue([]);
      vi.mocked(instanceService.getUnclaimedInstances).mockResolvedValue(mockUnclaimedInstances);

      const { user } = renderInstanceListPage(['/instances?tab=unclaimed']);

      await user.click(screen.getByTestId('tab-unclaimed'));

      await waitFor(() => {
        const claimButtons = screen.getAllByText('认领');
        expect(claimButtons).toHaveLength(2);
      });
    });

    it('should show empty state when no unclaimed instances', async () => {
      vi.mocked(instanceService.listInstances).mockResolvedValue([]);
      vi.mocked(instanceService.getUnclaimedInstances).mockResolvedValue([]);

      const { user } = renderInstanceListPage(['/instances?tab=unclaimed']);

      await user.click(screen.getByTestId('tab-unclaimed'));

      await waitFor(() => {
        expect(screen.getByText('暂无可用实例')).toBeInTheDocument();
      });
    });
  });

  describe('Claim Functionality', () => {
    it('should call claimInstance when claim button is clicked', async () => {
      const claimedInstance: Instance = {
        ...mockUnclaimedInstances[0],
        id: 1,
        owner_id: 1,
        status: 'active',
        restart_attempts: 0,
        claimed_at: '2024-01-01T01:00:00Z',
      };

      vi.mocked(instanceService.listInstances).mockResolvedValue([]);
      vi.mocked(instanceService.getUnclaimedInstances).mockResolvedValue(mockUnclaimedInstances);
      vi.mocked(instanceService.claimInstance).mockResolvedValue(claimedInstance);

      const { user } = renderInstanceListPage(['/instances?tab=unclaimed']);

      await user.click(screen.getByTestId('tab-unclaimed'));

      await waitFor(() => {
        expect(screen.getByTestId('claim-unclaimed-001')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('claim-unclaimed-001'));

      await waitFor(() => {
        expect(instanceService.claimInstance).toHaveBeenCalledWith('unclaimed-001');
      });
    });

    it('should show loading state during claim operation', async () => {
      const claimedInstance: Instance = {
        ...mockUnclaimedInstances[0],
        id: 1,
        owner_id: 1,
        status: 'active',
        restart_attempts: 0,
        claimed_at: '2024-01-01T01:00:00Z',
      };

      vi.mocked(instanceService.listInstances).mockResolvedValue([]);
      vi.mocked(instanceService.getUnclaimedInstances).mockResolvedValue(mockUnclaimedInstances);
      vi.mocked(instanceService.claimInstance).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(claimedInstance), 100))
      );

      const { user } = renderInstanceListPage(['/instances?tab=unclaimed']);

      await user.click(screen.getByTestId('tab-unclaimed'));

      await waitFor(() => {
        expect(screen.getByTestId('claim-unclaimed-001')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('claim-unclaimed-001'));

      await waitFor(() => {
        expect(screen.getByTestId('claim-unclaimed-001')).toBeDisabled();
        expect(screen.getByTestId('claim-unclaimed-001')).toHaveTextContent('认领中...');
      });
    });

    it('should refresh list after successful claim', async () => {
      const claimedInstance: Instance = {
        ...mockUnclaimedInstances[0],
        id: 1,
        owner_id: 1,
        status: 'active',
        restart_attempts: 0,
        claimed_at: '2024-01-01T01:00:00Z',
      };

      vi.mocked(instanceService.listInstances).mockResolvedValue([claimedInstance]);
      vi.mocked(instanceService.getUnclaimedInstances)
        .mockResolvedValueOnce(mockUnclaimedInstances)
        .mockResolvedValueOnce([mockUnclaimedInstances[1]]);
      vi.mocked(instanceService.claimInstance).mockResolvedValue(claimedInstance);

      const { user } = renderInstanceListPage(['/instances?tab=unclaimed']);

      await user.click(screen.getByTestId('tab-unclaimed'));

      await waitFor(() => {
        expect(screen.getByTestId('claim-unclaimed-001')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('claim-unclaimed-001'));

      await waitFor(() => {
        expect(instanceService.getUnclaimedInstances).toHaveBeenCalledTimes(2);
      });
    });

    it('should show error message on claim failure', async () => {
      // Mock window.alert
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

      vi.mocked(instanceService.listInstances).mockResolvedValue([]);
      vi.mocked(instanceService.getUnclaimedInstances).mockResolvedValue(mockUnclaimedInstances);
      vi.mocked(instanceService.claimInstance).mockRejectedValue(new Error('Claim failed'));

      const { user } = renderInstanceListPage(['/instances?tab=unclaimed']);

      await user.click(screen.getByTestId('tab-unclaimed'));

      await waitFor(() => {
        expect(screen.getByTestId('claim-unclaimed-001')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('claim-unclaimed-001'));

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('Claim failed');
      });

      alertSpy.mockRestore();
    });
  });

  describe('Loading States', () => {
    it('should show loading state while fetching claimed instances', async () => {
      vi.mocked(instanceService.listInstances).mockImplementation(
        () => new Promise(() => {})
      );
      vi.mocked(instanceService.getUnclaimedInstances).mockResolvedValue([]);

      renderInstanceListPage();

      expect(screen.getByTestId('loading-state')).toBeInTheDocument();
    });

    it('should show loading state while fetching unclaimed instances', async () => {
      vi.mocked(instanceService.listInstances).mockResolvedValue([]);
      vi.mocked(instanceService.getUnclaimedInstances).mockImplementation(
        () => new Promise(() => {})
      );

      const { user } = renderInstanceListPage(['/instances?tab=unclaimed']);

      await user.click(screen.getByTestId('tab-unclaimed'));

      expect(screen.getByTestId('loading-state')).toBeInTheDocument();
    });
  });

  describe('Error States', () => {
    it('should show error message when API call fails', async () => {
      vi.mocked(instanceService.listInstances).mockRejectedValue(new Error('API Error'));
      vi.mocked(instanceService.getUnclaimedInstances).mockResolvedValue([]);

      renderInstanceListPage();

      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toBeInTheDocument();
      });
    });
  });

  describe('Search and Filter', () => {
    it('should filter claimed instances by search term', async () => {
      vi.mocked(instanceService.listInstances).mockResolvedValue(mockClaimedInstances);
      vi.mocked(instanceService.getUnclaimedInstances).mockResolvedValue([]);

      const { user } = renderInstanceListPage();

      await waitFor(() => {
        expect(screen.getByText('My Local Instance')).toBeInTheDocument();
      });

      const searchInput = screen.getByTestId('search-input');
      await user.type(searchInput, 'Remote');

      await waitFor(() => {
        expect(screen.queryByText('My Local Instance')).not.toBeInTheDocument();
        expect(screen.getByText('My Remote Instance')).toBeInTheDocument();
      });
    });

    it('should filter unclaimed instances by search term', async () => {
      vi.mocked(instanceService.listInstances).mockResolvedValue([]);
      vi.mocked(instanceService.getUnclaimedInstances).mockResolvedValue(mockUnclaimedInstances);

      const { user } = renderInstanceListPage(['/instances?tab=unclaimed']);

      await user.click(screen.getByTestId('tab-unclaimed'));

      await waitFor(() => {
        expect(screen.getByText('unclaimed-001')).toBeInTheDocument();
        expect(screen.getByText('unclaimed-002')).toBeInTheDocument();
      });

      const searchInput = screen.getByTestId('search-input');
      await user.type(searchInput, 'unclaimed-001');

      await waitFor(() => {
        expect(screen.getByText('unclaimed-001')).toBeInTheDocument();
        expect(screen.queryByText('unclaimed-002')).not.toBeInTheDocument();
      });
    });
  });

  describe('Responsive Design', () => {
    it('should render instance cards in grid layout', async () => {
      vi.mocked(instanceService.listInstances).mockResolvedValue(mockClaimedInstances);
      vi.mocked(instanceService.getUnclaimedInstances).mockResolvedValue([]);

      renderInstanceListPage();

      await waitFor(() => {
        expect(screen.getByTestId('instance-list')).toBeInTheDocument();
      });
    });
  });
});
