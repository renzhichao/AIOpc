/**
 * StatusBadge Component Tests
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { StatusBadge } from './StatusBadge';
import type { InstanceStatus } from '../types/instance';

describe('StatusBadge Component', () => {
  const testCases: Array<{
    status: InstanceStatus;
    expectedLabel: string;
    expectedIcon: string;
    expectedTestId: string;
  }> = [
    { status: 'active', expectedLabel: '运行中', expectedIcon: '🟢', expectedTestId: 'status-badge-active' },
    { status: 'stopped', expectedLabel: '已停止', expectedIcon: '⏸️', expectedTestId: 'status-badge-stopped' },
    { status: 'pending', expectedLabel: '启动中', expectedIcon: '🔄', expectedTestId: 'status-badge-pending' },
    { status: 'error', expectedLabel: '错误', expectedIcon: '❌', expectedTestId: 'status-badge-error' },
    { status: 'recovering', expectedLabel: '恢复中', expectedIcon: '🔧', expectedTestId: 'status-badge-recovering' },
  ];

  testCases.forEach(({ status, expectedLabel, expectedIcon, expectedTestId }) => {
    it(`should render ${status} status correctly`, () => {
      render(<StatusBadge status={status} />);

      expect(screen.getByText(expectedLabel)).toBeInTheDocument();
      expect(screen.getByText(expectedIcon)).toBeInTheDocument();
      expect(screen.getByTestId(expectedTestId)).toBeInTheDocument();
    });
  });

  it('should render without icon when showIcon is false', () => {
    render(<StatusBadge status="active" showIcon={false} />);

    expect(screen.getByText('运行中')).toBeInTheDocument();
    expect(screen.queryByText('🟢')).not.toBeInTheDocument();
  });

  it('should render small size badge', () => {
    const { container } = render(<StatusBadge status="active" size="sm" />);

    const badge = container.querySelector('span');
    expect(badge).toHaveClass('px-2', 'py-0.5', 'text-xs');
  });

  it('should render medium size badge (default)', () => {
    const { container } = render(<StatusBadge status="active" size="md" />);

    const badge = container.querySelector('span');
    expect(badge).toHaveClass('px-3', 'py-1', 'text-sm');
  });

  it('should render large size badge', () => {
    const { container } = render(<StatusBadge status="active" size="lg" />);

    const badge = container.querySelector('span');
    expect(badge).toHaveClass('px-4', 'py-2', 'text-base');
  });

  it('should apply custom className', () => {
    const { container } = render(<StatusBadge status="active" className="custom-class" />);

    const badge = container.querySelector('span');
    expect(badge).toHaveClass('custom-class');
  });

  it('should render correct colors for each status', () => {
    const colorTests = [
      { status: 'active' as InstanceStatus, expectedColorClass: 'bg-green-100' },
      { status: 'stopped' as InstanceStatus, expectedColorClass: 'bg-gray-100' },
      { status: 'pending' as InstanceStatus, expectedColorClass: 'bg-yellow-100' },
      { status: 'error' as InstanceStatus, expectedColorClass: 'bg-red-100' },
      { status: 'recovering' as InstanceStatus, expectedColorClass: 'bg-blue-100' },
    ];

    colorTests.forEach(({ status, expectedColorClass }) => {
      const { container } = render(<StatusBadge status={status} />);
      const badge = container.querySelector('span');
      expect(badge).toHaveClass(expectedColorClass);
    });
  });
});
