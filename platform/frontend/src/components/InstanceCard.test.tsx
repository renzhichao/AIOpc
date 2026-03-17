/**
 * InstanceCard 组件测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import InstanceCard from './InstanceCard';
import type { Instance } from '../types/instance';

const mockInstance: Instance = {
  id: 1,
  instance_id: 'inst-1',
  owner_id: 1,
  template: 'personal',
  config: {
    name: 'Test Instance',
    description: 'Test Description',
  },
  status: 'active',
  restart_attempts: 0,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  deployment_type: 'local',
};

describe('InstanceCard', () => {
  const mockHandlers = {
    onStart: vi.fn(),
    onStop: vi.fn(),
    onRestart: vi.fn(),
    onDelete: vi.fn(),
    onClick: vi.fn(),
  };

  const renderWithRouter = (component: React.ReactElement) => {
    return render(<BrowserRouter>{component}</BrowserRouter>);
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render instance information correctly', () => {
    renderWithRouter(<InstanceCard instance={mockInstance} {...mockHandlers} />);

    expect(screen.getByText('Test Instance')).toBeInTheDocument();
    expect(screen.getByText('Test Description')).toBeInTheDocument();
    expect(screen.getByText('运行中')).toBeInTheDocument();
  });

  it('should display correct status for active instances', () => {
    const activeInstance = { ...mockInstance, status: 'active' as const };
    renderWithRouter(<InstanceCard instance={activeInstance} {...mockHandlers} />);

    expect(screen.getByText('🟢')).toBeInTheDocument();
    expect(screen.getByText('运行中')).toBeInTheDocument();
  });

  it('should display correct status for stopped instances', () => {
    const stoppedInstance = { ...mockInstance, status: 'stopped' as const };
    renderWithRouter(<InstanceCard instance={stoppedInstance} {...mockHandlers} />);

    expect(screen.getByText('⏸️')).toBeInTheDocument();
    expect(screen.getByText('已停止')).toBeInTheDocument();
  });

  it('should display correct status for pending instances', () => {
    const pendingInstance = { ...mockInstance, status: 'pending' as const };
    renderWithRouter(<InstanceCard instance={pendingInstance} {...mockHandlers} />);

    expect(screen.getByText('🔄')).toBeInTheDocument();
    expect(screen.getByText('启动中')).toBeInTheDocument();
  });

  it('should display correct status for error instances', () => {
    const errorInstance = { ...mockInstance, status: 'error' as const };
    renderWithRouter(<InstanceCard instance={errorInstance} {...mockHandlers} />);

    expect(screen.getByText('❌')).toBeInTheDocument();
    expect(screen.getByText('错误')).toBeInTheDocument();
  });

  it('should show start button for stopped instances', () => {
    const stoppedInstance = { ...mockInstance, status: 'stopped' as const };
    renderWithRouter(<InstanceCard instance={stoppedInstance} {...mockHandlers} />);

    expect(screen.getByText('启动')).toBeInTheDocument();
  });

  it('should show stop button for active instances', () => {
    const activeInstance = { ...mockInstance, status: 'active' as const };
    renderWithRouter(<InstanceCard instance={activeInstance} {...mockHandlers} />);

    expect(screen.getByText('停止')).toBeInTheDocument();
  });

  it('should show restart button for active or error instances', () => {
    const errorInstance = { ...mockInstance, status: 'error' as const };
    renderWithRouter(<InstanceCard instance={errorInstance} {...mockHandlers} />);

    expect(screen.getByText('重启')).toBeInTheDocument();
  });

  it('should call onStart when start button is clicked', () => {
    const stoppedInstance = { ...mockInstance, status: 'stopped' as const };
    renderWithRouter(<InstanceCard instance={stoppedInstance} {...mockHandlers} />);

    const startButton = screen.getByText('启动');
    fireEvent.click(startButton);

    expect(mockHandlers.onStart).toHaveBeenCalledWith('1');
  });

  it('should call onStop when stop button is clicked', () => {
    const activeInstance = { ...mockInstance, status: 'active' as const };
    renderWithRouter(<InstanceCard instance={activeInstance} {...mockHandlers} />);

    const stopButton = screen.getByText('停止');
    fireEvent.click(stopButton);

    expect(mockHandlers.onStop).toHaveBeenCalledWith('1');
  });

  it('should call onRestart when restart button is clicked', () => {
    const activeInstance = { ...mockInstance, status: 'active' as const };
    renderWithRouter(<InstanceCard instance={activeInstance} {...mockHandlers} />);

    const restartButton = screen.getByText('重启');
    fireEvent.click(restartButton);

    expect(mockHandlers.onRestart).toHaveBeenCalledWith('1');
  });

  it('should call onClick when card is clicked', () => {
    renderWithRouter(<InstanceCard instance={mockInstance} {...mockHandlers} />);

    const card = screen.getByText('Test Instance').closest('.bg-white');
    fireEvent.click(card!);

    expect(mockHandlers.onClick).toHaveBeenCalledWith('1');
  });

  it('should not trigger onClick when action buttons are clicked', () => {
    const activeInstance = { ...mockInstance, status: 'active' as const };
    renderWithRouter(<InstanceCard instance={activeInstance} {...mockHandlers} />);

    const stopButton = screen.getByText('停止');
    fireEvent.click(stopButton);

    expect(mockHandlers.onClick).not.toHaveBeenCalled();
  });

  it('should display template name correctly', () => {
    const personalInstance = { ...mockInstance, template: 'personal' as const };
    renderWithRouter(<InstanceCard instance={personalInstance} {...mockHandlers} />);

    expect(screen.getByText('📦')).toBeInTheDocument();
    expect(screen.getByText('个人版')).toBeInTheDocument();
  });

  it('should display restart attempt warning', () => {
    const instanceWithRetries = { ...mockInstance, restart_attempts: 3 };
    renderWithRouter(<InstanceCard instance={instanceWithRetries} {...mockHandlers} />);

    expect(screen.getByText('⚠️ 已尝试重启 3 次')).toBeInTheDocument();
  });

  it('should format instance name correctly when config.name is missing', () => {
    const instanceWithoutName = {
      ...mockInstance,
      config: {},
      id: 1234567890,
    };
    renderWithRouter(<InstanceCard instance={instanceWithoutName} {...mockHandlers} />);

    expect(screen.getByText('实例 12345678')).toBeInTheDocument();
  });

  it('should disable buttons when loading', () => {
    const activeInstance = { ...mockInstance, status: 'active' as const };
    renderWithRouter(<InstanceCard instance={activeInstance} {...mockHandlers} loading={true} />);

    const stopButton = screen.getByText('停止中...');
    expect(stopButton).toBeDisabled();
  });

  // New tests for remote instances and badge components

  it('should display local instance type badge', () => {
    const localInstance = { ...mockInstance, deployment_type: 'local' as const };
    renderWithRouter(<InstanceCard instance={localInstance} {...mockHandlers} />);

    expect(screen.getByTestId('instance-type-local')).toBeInTheDocument();
    expect(screen.getByText('🏠')).toBeInTheDocument();
    expect(screen.getByText('本地')).toBeInTheDocument();
  });

  it('should display remote instance type badge', () => {
    const remoteInstance: Instance = {
      ...mockInstance,
      deployment_type: 'remote',
      remote_host: '192.168.1.100',
      remote_port: 3000,
    };
    renderWithRouter(<InstanceCard instance={remoteInstance} {...mockHandlers} />);

    expect(screen.getByTestId('instance-type-remote')).toBeInTheDocument();
    expect(screen.getByText('🌐')).toBeInTheDocument();
    expect(screen.getByText('远程')).toBeInTheDocument();
  });

  it('should display health status badge when available', () => {
    const healthyInstance: Instance = {
      ...mockInstance,
      health_status: 'healthy',
    };
    renderWithRouter(<InstanceCard instance={healthyInstance} {...mockHandlers} />);

    expect(screen.getByTestId('health-status-healthy')).toBeInTheDocument();
    expect(screen.getAllByText('🟢').length).toBeGreaterThan(0);
    expect(screen.getByText('健康')).toBeInTheDocument();
  });

  it('should display warning health status', () => {
    const warningInstance: Instance = {
      ...mockInstance,
      health_status: 'warning',
    };
    renderWithRouter(<InstanceCard instance={warningInstance} {...mockHandlers} />);

    expect(screen.getByTestId('health-status-warning')).toBeInTheDocument();
    expect(screen.getByText('🟡')).toBeInTheDocument();
    expect(screen.getByText('警告')).toBeInTheDocument();
  });

  it('should display unhealthy health status', () => {
    const unhealthyInstance: Instance = {
      ...mockInstance,
      health_status: 'unhealthy',
    };
    renderWithRouter(<InstanceCard instance={unhealthyInstance} {...mockHandlers} />);

    expect(screen.getByTestId('health-status-unhealthy')).toBeInTheDocument();
    expect(screen.getByText('🔴')).toBeInTheDocument();
    expect(screen.getByText('不健康')).toBeInTheDocument();
  });

  it('should display remote instance information', () => {
    const remoteInstance: Instance = {
      ...mockInstance,
      deployment_type: 'remote',
      remote_host: '192.168.1.100',
      remote_port: 3000,
      remote_version: '1.0.0',
      last_heartbeat_at: '2024-01-01T12:00:00Z',
    };
    renderWithRouter(<InstanceCard instance={remoteInstance} {...mockHandlers} />);

    expect(screen.getByText('192.168.1.100:3000')).toBeInTheDocument();
    expect(screen.getByText('1.0.0')).toBeInTheDocument();
    expect(screen.getByText(/最后心跳/)).toBeInTheDocument();
  });

  it('should not display remote instance information for local instances', () => {
    const localInstance = { ...mockInstance, deployment_type: 'local' as const };
    renderWithRouter(<InstanceCard instance={localInstance} {...mockHandlers} />);

    expect(screen.queryByText(/远程地址/)).not.toBeInTheDocument();
    expect(screen.queryByText(/最后心跳/)).not.toBeInTheDocument();
  });

  it('should show start chat button for active instances', () => {
    const activeInstance = { ...mockInstance, status: 'active' as const };
    renderWithRouter(<InstanceCard instance={activeInstance} {...mockHandlers} />);

    const chatButton = screen.getByText('开始对话');
    expect(chatButton).toBeInTheDocument();
    expect(chatButton.closest('a')).toHaveAttribute('href', '/instances/1/chat');
  });

  it('should not show start chat button for non-active instances', () => {
    const stoppedInstance = { ...mockInstance, status: 'stopped' as const };
    renderWithRouter(<InstanceCard instance={stoppedInstance} {...mockHandlers} />);

    expect(screen.queryByText('开始对话')).not.toBeInTheDocument();
  });

  it('should apply special styling for remote instances', () => {
    const remoteInstance: Instance = {
      ...mockInstance,
      deployment_type: 'remote',
      remote_host: '192.168.1.100',
      remote_port: 3000,
    };
    const { container } = renderWithRouter(<InstanceCard instance={remoteInstance} {...mockHandlers} />);

    const card = container.querySelector('.bg-white');
    expect(card).toHaveClass('border-purple-200');
  });

  it('should not apply special styling for local instances', () => {
    const localInstance = { ...mockInstance, deployment_type: 'local' as const };
    const { container } = renderWithRouter(<InstanceCard instance={localInstance} {...mockHandlers} />);

    const card = container.querySelector('.bg-white');
    expect(card).not.toHaveClass('border-purple-200');
  });
});
