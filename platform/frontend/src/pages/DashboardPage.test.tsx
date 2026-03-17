/**
 * DashboardPage 组件测试
 * 测试仪表板页面的实例统计和快捷操作功能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from './DashboardPage';
import { AuthProvider } from '../contexts/AuthContext';
import { instanceService } from '../services/instance';

// Mock instanceService
vi.mock('../services/instance', () => ({
  instanceService: {
    getStats: vi.fn(),
    getUnclaimedInstances: vi.fn(),
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
function renderDashboardPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <DashboardPage />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock localStorage to have a valid token and user
    // AuthContext looks for 'auth_user' and 'auth_token' or 'access_token'
    localStorage.setItem('access_token', 'mock-token');
    localStorage.setItem('auth_token', 'mock-token');
    localStorage.setItem('auth_user', JSON.stringify({
      id: '1',
      feishu_user_id: 'test_user',
      name: 'Test User',
      email: 'test@example.com',
    }));
  });

  describe('Component Rendering', () => {
    it('should render the dashboard container', () => {
      renderDashboardPage();
      expect(screen.getByTestId('dashboard-container')).toBeInTheDocument();
    });

    it('should render the dashboard title', () => {
      renderDashboardPage();
      expect(screen.getByTestId('dashboard-title')).toBeInTheDocument();
      expect(screen.getByTestId('dashboard-title')).toHaveTextContent('欢迎来到 OpenClaw');
    });

    it('should render user name', () => {
      renderDashboardPage();
      expect(screen.getByTestId('user-name')).toBeInTheDocument();
      expect(screen.getByTestId('user-name')).toHaveTextContent('欢迎, Test User');
    });

    it('should render logout button', () => {
      renderDashboardPage();
      expect(screen.getByTestId('logout-button')).toBeInTheDocument();
      expect(screen.getByTestId('logout-button')).toHaveTextContent('退出登录');
    });
  });

  describe('Instance Statistics Cards', () => {
    it('should fetch and display statistics on mount', async () => {
      const mockStats = {
        total: 5,
        local: 2,
        remote: 3,
        unclaimed: 2,
        active: 4,
        healthy: 4,
      };

      vi.mocked(instanceService.getStats).mockResolvedValue(mockStats);
      vi.mocked(instanceService.getUnclaimedInstances).mockResolvedValue([
        { instance_id: '1', deployment_type: 'remote', status: 'pending', remote_host: 'host1', remote_port: 8080, remote_version: '1.0', capabilities: [], health_status: 'healthy', created_at: '2024-01-01' },
        { instance_id: '2', deployment_type: 'remote', status: 'pending', remote_host: 'host2', remote_port: 8080, remote_version: '1.0', capabilities: [], health_status: 'healthy', created_at: '2024-01-01' },
      ]);

      renderDashboardPage();

      await waitFor(() => {
        expect(instanceService.getStats).toHaveBeenCalledOnce();
      });
    });

    it('should display my instances count', async () => {
      const mockStats = {
        total: 5,
        local: 2,
        remote: 3,
        unclaimed: 2,
        active: 4,
        healthy: 4,
      };

      vi.mocked(instanceService.getStats).mockResolvedValue(mockStats);
      vi.mocked(instanceService.getUnclaimedInstances).mockResolvedValue([]);

      renderDashboardPage();

      await waitFor(() => {
        expect(screen.getByTestId('stat-my-instances')).toBeInTheDocument();
        expect(screen.getByTestId('stat-my-instances')).toHaveTextContent('5');
      });
    });

    it('should display available instances count', async () => {
      const mockStats = {
        total: 5,
        local: 2,
        remote: 3,
        unclaimed: 2,
        active: 4,
        healthy: 4,
      };

      vi.mocked(instanceService.getStats).mockResolvedValue(mockStats);
      vi.mocked(instanceService.getUnclaimedInstances).mockResolvedValue([]);

      renderDashboardPage();

      await waitFor(() => {
        expect(screen.getByTestId('stat-available-instances')).toBeInTheDocument();
        expect(screen.getByTestId('stat-available-instances')).toHaveTextContent('2');
      });
    });

    it('should display running instances count', async () => {
      const mockStats = {
        total: 5,
        local: 2,
        remote: 3,
        unclaimed: 2,
        active: 4,
        healthy: 4,
      };

      vi.mocked(instanceService.getStats).mockResolvedValue(mockStats);
      vi.mocked(instanceService.getUnclaimedInstances).mockResolvedValue([]);

      renderDashboardPage();

      await waitFor(() => {
        expect(screen.getByTestId('stat-running-instances')).toBeInTheDocument();
        expect(screen.getByTestId('stat-running-instances')).toHaveTextContent('4');
      });
    });

    it('should display healthy instances count', async () => {
      const mockStats = {
        total: 5,
        local: 2,
        remote: 3,
        unclaimed: 2,
        active: 4,
        healthy: 4,
      };

      vi.mocked(instanceService.getStats).mockResolvedValue(mockStats);
      vi.mocked(instanceService.getUnclaimedInstances).mockResolvedValue([]);

      renderDashboardPage();

      await waitFor(() => {
        expect(screen.getByTestId('stat-healthy-instances')).toBeInTheDocument();
        expect(screen.getByTestId('stat-healthy-instances')).toHaveTextContent('4');
      });
    });
  });

  describe('Unclaimed Instances Notification', () => {
    it('should show notification when unclaimed instances > 0', async () => {
      const mockStats = {
        total: 3,
        local: 1,
        remote: 2,
        unclaimed: 2,
        active: 1,
        healthy: 1,
      };

      vi.mocked(instanceService.getStats).mockResolvedValue(mockStats);
      vi.mocked(instanceService.getUnclaimedInstances).mockResolvedValue([
        { instance_id: '1', deployment_type: 'remote', status: 'pending', remote_host: 'host1', remote_port: 8080, remote_version: '1.0', capabilities: [], health_status: 'healthy', created_at: '2024-01-01' },
        { instance_id: '2', deployment_type: 'remote', status: 'pending', remote_host: 'host2', remote_port: 8080, remote_version: '1.0', capabilities: [], health_status: 'healthy', created_at: '2024-01-01' },
      ]);

      renderDashboardPage();

      await waitFor(() => {
        expect(screen.getByTestId('unclaimed-notification')).toBeInTheDocument();
        expect(screen.getByTestId('unclaimed-notification')).toHaveTextContent('2');
      });
    });

    it('should not show notification when unclaimed instances = 0', async () => {
      const mockStats = {
        total: 3,
        local: 1,
        remote: 2,
        unclaimed: 0,
        active: 2,
        healthy: 2,
      };

      vi.mocked(instanceService.getStats).mockResolvedValue(mockStats);
      vi.mocked(instanceService.getUnclaimedInstances).mockResolvedValue([]);

      renderDashboardPage();

      await waitFor(() => {
        expect(screen.queryByTestId('unclaimed-notification')).not.toBeInTheDocument();
      });
    });

    it('should navigate to instance list when notification is clicked', async () => {
      const mockStats = {
        total: 3,
        local: 1,
        remote: 2,
        unclaimed: 1,
        active: 1,
        healthy: 1,
      };

      vi.mocked(instanceService.getStats).mockResolvedValue(mockStats);
      vi.mocked(instanceService.getUnclaimedInstances).mockResolvedValue([
        { instance_id: '1', deployment_type: 'remote', status: 'pending', remote_host: 'host1', remote_port: 8080, remote_version: '1.0', capabilities: [], health_status: 'healthy', created_at: '2024-01-01' },
      ]);

      renderDashboardPage();

      await waitFor(() => {
        expect(screen.getByTestId('unclaimed-notification')).toBeInTheDocument();
      });

      const notification = screen.getByTestId('unclaimed-notification');
      await userEvent.click(notification);

      expect(mockNavigate).toHaveBeenCalledWith('/instances?filter=unclaimed');
    });
  });

  describe('Quick Action Cards', () => {
    it('should render "View My Instances" button', async () => {
      const mockStats = {
        total: 3,
        local: 1,
        remote: 2,
        unclaimed: 0,
        active: 2,
        healthy: 2,
      };

      vi.mocked(instanceService.getStats).mockResolvedValue(mockStats);
      vi.mocked(instanceService.getUnclaimedInstances).mockResolvedValue([]);

      renderDashboardPage();

      await waitFor(() => {
        expect(screen.getByTestId('action-view-instances')).toBeInTheDocument();
        expect(screen.getByTestId('action-view-instances')).toHaveTextContent('查看我的实例');
      });
    });

    it('should navigate to instance list when "View My Instances" is clicked', async () => {
      const mockStats = {
        total: 3,
        local: 1,
        remote: 2,
        unclaimed: 0,
        active: 2,
        healthy: 2,
      };

      vi.mocked(instanceService.getStats).mockResolvedValue(mockStats);
      vi.mocked(instanceService.getUnclaimedInstances).mockResolvedValue([]);

      renderDashboardPage();

      await waitFor(() => {
        expect(screen.getByTestId('action-view-instances')).toBeInTheDocument();
      });

      const button = screen.getByTestId('action-view-instances');
      await userEvent.click(button);

      expect(mockNavigate).toHaveBeenCalledWith('/instances');
    });

    it('should render "Claim New Instance" button', async () => {
      const mockStats = {
        total: 3,
        local: 1,
        remote: 2,
        unclaimed: 1,
        active: 1,
        healthy: 1,
      };

      vi.mocked(instanceService.getStats).mockResolvedValue(mockStats);
      vi.mocked(instanceService.getUnclaimedInstances).mockResolvedValue([
        { instance_id: '1', deployment_type: 'remote', status: 'pending', remote_host: 'host1', remote_port: 8080, remote_version: '1.0', capabilities: [], health_status: 'healthy', created_at: '2024-01-01' },
      ]);

      renderDashboardPage();

      await waitFor(() => {
        expect(screen.getByTestId('action-claim-instance')).toBeInTheDocument();
        expect(screen.getByTestId('action-claim-instance')).toHaveTextContent('认领新实例');
      });
    });

    it('should navigate to unclaimed instances when "Claim New Instance" is clicked', async () => {
      const mockStats = {
        total: 3,
        local: 1,
        remote: 2,
        unclaimed: 1,
        active: 1,
        healthy: 1,
      };

      vi.mocked(instanceService.getStats).mockResolvedValue(mockStats);
      vi.mocked(instanceService.getUnclaimedInstances).mockResolvedValue([
        { instance_id: '1', deployment_type: 'remote', status: 'pending', remote_host: 'host1', remote_port: 8080, remote_version: '1.0', capabilities: [], health_status: 'healthy', created_at: '2024-01-01' },
      ]);

      renderDashboardPage();

      await waitFor(() => {
        expect(screen.getByTestId('action-claim-instance')).toBeInTheDocument();
      });

      const button = screen.getByTestId('action-claim-instance');
      await userEvent.click(button);

      expect(mockNavigate).toHaveBeenCalledWith('/instances?filter=unclaimed');
    });
  });

  describe('Loading States', () => {
    it('should show loading state while fetching statistics', async () => {
      vi.mocked(instanceService.getStats).mockImplementation(() => new Promise(() => {}));
      vi.mocked(instanceService.getUnclaimedInstances).mockResolvedValue([]);

      renderDashboardPage();

      expect(screen.getByTestId('loading-state')).toBeInTheDocument();
    });
  });

  describe('Error States', () => {
    it('should show error message when API call fails', async () => {
      vi.mocked(instanceService.getStats).mockRejectedValue(new Error('API Error'));
      vi.mocked(instanceService.getUnclaimedInstances).mockResolvedValue([]);

      renderDashboardPage();

      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toBeInTheDocument();
        expect(screen.getByTestId('error-message')).toHaveTextContent('加载失败');
      });
    });
  });

  describe('Responsive Design', () => {
    it('should render statistics cards in grid layout', async () => {
      const mockStats = {
        total: 5,
        local: 2,
        remote: 3,
        unclaimed: 2,
        active: 4,
        healthy: 4,
      };

      vi.mocked(instanceService.getStats).mockResolvedValue(mockStats);
      vi.mocked(instanceService.getUnclaimedInstances).mockResolvedValue([]);

      renderDashboardPage();

      await waitFor(() => {
        expect(screen.getByTestId('stats-grid')).toBeInTheDocument();
      });
    });
  });
});
