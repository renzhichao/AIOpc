/**
 * InstanceControls Component Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { InstanceControls } from './InstanceControls';
import type { InstanceStatus } from '../types/instance';

describe('InstanceControls Component', () => {
  const mockHandlers = {
    onStart: vi.fn(),
    onStop: vi.fn(),
    onRestart: vi.fn(),
    onDelete: vi.fn(),
    onConfig: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock confirm to return true
    global.confirm = vi.fn(() => true);
  });

  it('should render start button for stopped instance', () => {
    render(<InstanceControls status="stopped" {...mockHandlers} />);

    expect(screen.getByTestId('start-button')).toBeInTheDocument();
    expect(screen.queryByTestId('stop-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('restart-button')).not.toBeInTheDocument();
  });

  it('should render stop and restart buttons for active instance', () => {
    render(<InstanceControls status="active" {...mockHandlers} />);

    expect(screen.queryByTestId('start-button')).not.toBeInTheDocument();
    expect(screen.getByTestId('stop-button')).toBeInTheDocument();
    expect(screen.getByTestId('restart-button')).toBeInTheDocument();
  });

  it('should render start and restart buttons for error instance', () => {
    render(<InstanceControls status="error" {...mockHandlers} />);

    expect(screen.getByTestId('start-button')).toBeInTheDocument();
    expect(screen.queryByTestId('stop-button')).not.toBeInTheDocument();
    expect(screen.getByTestId('restart-button')).toBeInTheDocument();
  });

  it('should render config button when provided', () => {
    render(<InstanceControls status="active" {...mockHandlers} />);

    expect(screen.getByTestId('config-button')).toBeInTheDocument();
  });

  it('should render delete button when provided', () => {
    render(<InstanceControls status="active" {...mockHandlers} />);

    expect(screen.getByTestId('delete-button')).toBeInTheDocument();
  });

  it('should not render delete button when not provided', () => {
    render(<InstanceControls status="active" onStart={mockHandlers.onStart} />);

    expect(screen.queryByTestId('delete-button')).not.toBeInTheDocument();
  });

  it('should call onStart when start button is clicked', async () => {
    const user = userEvent.setup();
    render(<InstanceControls status="stopped" {...mockHandlers} />);

    await user.click(screen.getByTestId('start-button'));

    expect(mockHandlers.onStart).toHaveBeenCalledTimes(1);
  });

  it('should call onStop when stop button is clicked', async () => {
    const user = userEvent.setup();
    render(<InstanceControls status="active" {...mockHandlers} />);

    await user.click(screen.getByTestId('stop-button'));

    expect(mockHandlers.onStop).toHaveBeenCalledTimes(1);
  });

  it('should call onRestart when restart button is clicked', async () => {
    const user = userEvent.setup();
    render(<InstanceControls status="active" {...mockHandlers} />);

    await user.click(screen.getByTestId('restart-button'));

    expect(mockHandlers.onRestart).toHaveBeenCalledTimes(1);
  });

  it('should call onConfig when config button is clicked', async () => {
    const user = userEvent.setup();
    render(<InstanceControls status="active" {...mockHandlers} />);

    await user.click(screen.getByTestId('config-button'));

    expect(mockHandlers.onConfig).toHaveBeenCalledTimes(1);
  });

  it('should show confirmation dialog before deleting', async () => {
    const user = userEvent.setup();
    render(<InstanceControls status="active" {...mockHandlers} />);

    const deleteButton = screen.getByTestId('delete-button');
    await user.click(deleteButton);

    // The confirmation is handled inside the component
    // If confirm returns true (which we mocked), onDelete should be called
    expect(mockHandlers.onDelete).toHaveBeenCalled();
  });

  it('should not call onDelete when cancelled', async () => {
    const user = userEvent.setup();
    global.confirm = vi.fn(() => false);

    render(<InstanceControls status="active" {...mockHandlers} />);

    await user.click(screen.getByTestId('delete-button'));

    expect(mockHandlers.onDelete).not.toHaveBeenCalled();
  });

  it('should disable all buttons when loading', () => {
    render(<InstanceControls status="active" {...mockHandlers} loading={true} />);

    expect(screen.getByTestId('stop-button')).toBeDisabled();
    expect(screen.getByTestId('restart-button')).toBeDisabled();
    expect(screen.getByTestId('config-button')).toBeDisabled();
    expect(screen.getByTestId('delete-button')).toBeDisabled();
  });

  it('should disable all buttons when disabled prop is true', () => {
    render(<InstanceControls status="active" {...mockHandlers} disabled={true} />);

    expect(screen.getByTestId('stop-button')).toBeDisabled();
    expect(screen.getByTestId('restart-button')).toBeDisabled();
  });

  it('should render small size buttons', () => {
    const { container } = render(<InstanceControls status="active" {...mockHandlers} size="sm" />);

    const buttons = container.querySelectorAll('button');
    buttons.forEach((button) => {
      expect(button).toHaveClass('px-3', 'py-1.5', 'text-xs');
    });
  });

  it('should render medium size buttons (default)', () => {
    const { container } = render(<InstanceControls status="active" {...mockHandlers} size="md" />);

    const buttons = container.querySelectorAll('button');
    buttons.forEach((button) => {
      expect(button).toHaveClass('px-4', 'py-2', 'text-sm');
    });
  });

  it('should render large size buttons', () => {
    const { container } = render(<InstanceControls status="active" {...mockHandlers} size="lg" />);

    const buttons = container.querySelectorAll('button');
    buttons.forEach((button) => {
      expect(button).toHaveClass('px-6', 'py-3', 'text-base');
    });
  });

  it('should render horizontal layout (default)', () => {
    const { container } = render(<InstanceControls status="active" {...mockHandlers} layout="horizontal" />);

    const wrapper = container.querySelector('[data-testid="instance-controls"]');
    expect(wrapper).toHaveClass('flex-row');
  });

  it('should render vertical layout', () => {
    const { container } = render(<InstanceControls status="active" {...mockHandlers} layout="vertical" />);

    const wrapper = container.querySelector('[data-testid="instance-controls"]');
    expect(wrapper).toHaveClass('flex-col');
  });

  it('should show labels by default', () => {
    render(<InstanceControls status="active" {...mockHandlers} />);

    expect(screen.getByText('停止')).toBeInTheDocument();
    expect(screen.getByText('重启')).toBeInTheDocument();
    expect(screen.getByText('配置')).toBeInTheDocument();
    expect(screen.getByText('删除')).toBeInTheDocument();
  });

  it('should hide labels when showLabels is false', () => {
    render(<InstanceControls status="active" {...mockHandlers} showLabels={false} />);

    expect(screen.queryByText('停止')).not.toBeInTheDocument();
    expect(screen.queryByText('重启')).not.toBeInTheDocument();
    expect(screen.queryByText('配置')).not.toBeInTheDocument();
    expect(screen.queryByText('删除')).not.toBeInTheDocument();
  });
});
