/**
 * InstanceCard 组件测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import InstanceCard from './InstanceCard';
import type { Instance } from '../types/instance';

const mockInstance: Instance = {
  id: '1',
  owner_id: 'user1',
  name: 'Test Instance',
  description: 'Test Description',
  template: 'personal',
  config: {
    name: 'Test Instance',
    description: 'Test Description',
  },
  status: 'active',
  restart_attempts: 0,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('InstanceCard', () => {
  const mockHandlers = {
    onStart: vi.fn(),
    onStop: vi.fn(),
    onRestart: vi.fn(),
    onDelete: vi.fn(),
    onClick: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render instance information correctly', () => {
    render(<InstanceCard instance={mockInstance} {...mockHandlers} />);

    expect(screen.getByText('Test Instance')).toBeInTheDocument();
    expect(screen.getByText('Test Description')).toBeInTheDocument();
    expect(screen.getByText('运行中')).toBeInTheDocument();
  });

  it('should display correct status for active instances', () => {
    const activeInstance = { ...mockInstance, status: 'active' as const };
    render(<InstanceCard instance={activeInstance} {...mockHandlers} />);

    expect(screen.getByText('🟢')).toBeInTheDocument();
    expect(screen.getByText('运行中')).toBeInTheDocument();
  });

  it('should display correct status for stopped instances', () => {
    const stoppedInstance = { ...mockInstance, status: 'stopped' as const };
    render(<InstanceCard instance={stoppedInstance} {...mockHandlers} />);

    expect(screen.getByText('⏸️')).toBeInTheDocument();
    expect(screen.getByText('已停止')).toBeInTheDocument();
  });

  it('should display correct status for pending instances', () => {
    const pendingInstance = { ...mockInstance, status: 'pending' as const };
    render(<InstanceCard instance={pendingInstance} {...mockHandlers} />);

    expect(screen.getByText('🔄')).toBeInTheDocument();
    expect(screen.getByText('启动中')).toBeInTheDocument();
  });

  it('should display correct status for error instances', () => {
    const errorInstance = { ...mockInstance, status: 'error' as const };
    render(<InstanceCard instance={errorInstance} {...mockHandlers} />);

    expect(screen.getByText('❌')).toBeInTheDocument();
    expect(screen.getByText('错误')).toBeInTheDocument();
  });

  it('should show start button for stopped instances', () => {
    const stoppedInstance = { ...mockInstance, status: 'stopped' as const };
    render(<InstanceCard instance={stoppedInstance} {...mockHandlers} />);

    expect(screen.getByText('启动')).toBeInTheDocument();
  });

  it('should show stop button for active instances', () => {
    const activeInstance = { ...mockInstance, status: 'active' as const };
    render(<InstanceCard instance={activeInstance} {...mockHandlers} />);

    expect(screen.getByText('停止')).toBeInTheDocument();
  });

  it('should show restart button for active or error instances', () => {
    const errorInstance = { ...mockInstance, status: 'error' as const };
    render(<InstanceCard instance={errorInstance} {...mockHandlers} />);

    expect(screen.getByText('重启')).toBeInTheDocument();
  });

  it('should call onStart when start button is clicked', () => {
    const stoppedInstance = { ...mockInstance, status: 'stopped' as const };
    render(<InstanceCard instance={stoppedInstance} {...mockHandlers} />);

    const startButton = screen.getByText('启动');
    fireEvent.click(startButton);

    expect(mockHandlers.onStart).toHaveBeenCalledWith('1');
  });

  it('should call onStop when stop button is clicked', () => {
    const activeInstance = { ...mockInstance, status: 'active' as const };
    render(<InstanceCard instance={activeInstance} {...mockHandlers} />);

    const stopButton = screen.getByText('停止');
    fireEvent.click(stopButton);

    expect(mockHandlers.onStop).toHaveBeenCalledWith('1');
  });

  it('should call onRestart when restart button is clicked', () => {
    const activeInstance = { ...mockInstance, status: 'active' as const };
    render(<InstanceCard instance={activeInstance} {...mockHandlers} />);

    const restartButton = screen.getByText('重启');
    fireEvent.click(restartButton);

    expect(mockHandlers.onRestart).toHaveBeenCalledWith('1');
  });

  it('should call onClick when card is clicked', () => {
    render(<InstanceCard instance={mockInstance} {...mockHandlers} />);

    const card = screen.getByText('Test Instance').closest('.bg-white');
    fireEvent.click(card!);

    expect(mockHandlers.onClick).toHaveBeenCalledWith('1');
  });

  it('should not trigger onClick when action buttons are clicked', () => {
    const activeInstance = { ...mockInstance, status: 'active' as const };
    render(<InstanceCard instance={activeInstance} {...mockHandlers} />);

    const stopButton = screen.getByText('停止');
    fireEvent.click(stopButton);

    expect(mockHandlers.onClick).not.toHaveBeenCalled();
  });

  it('should display template name correctly', () => {
    const personalInstance = { ...mockInstance, template: 'personal' as const };
    render(<InstanceCard instance={personalInstance} {...mockHandlers} />);

    expect(screen.getByText('📦')).toBeInTheDocument();
    expect(screen.getByText('个人版')).toBeInTheDocument();
  });

  it('should display restart attempt warning', () => {
    const instanceWithRetries = { ...mockInstance, restart_attempts: 3 };
    render(<InstanceCard instance={instanceWithRetries} {...mockHandlers} />);

    expect(screen.getByText('⚠️ 已尝试重启 3 次')).toBeInTheDocument();
  });

  it('should format instance name correctly when config.name is missing', () => {
    const instanceWithoutName = {
      ...mockInstance,
      config: {},
      id: '1234567890abcdef',
    };
    render(<InstanceCard instance={instanceWithoutName} {...mockHandlers} />);

    expect(screen.getByText('实例 12345678')).toBeInTheDocument();
  });

  it('should disable buttons when loading', () => {
    const activeInstance = { ...mockInstance, status: 'active' as const };
    render(<InstanceCard instance={activeInstance} {...mockHandlers} loading={true} />);

    const stopButton = screen.getByText('停止中...');
    expect(stopButton).toBeDisabled();
  });
});
