/**
 * HealthStatusBadge Component Tests
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { HealthStatusBadge } from './HealthStatusBadge';

describe('HealthStatusBadge Component', () => {
  describe('Rendering', () => {
    it('should render healthy status correctly', () => {
      render(<HealthStatusBadge status="healthy" />);

      expect(screen.getByText('健康')).toBeInTheDocument();
      expect(screen.getByTestId('health-status-healthy')).toBeInTheDocument();
    });

    it('should render warning status correctly', () => {
      render(<HealthStatusBadge status="warning" />);

      expect(screen.getByText('警告')).toBeInTheDocument();
      expect(screen.getByTestId('health-status-warning')).toBeInTheDocument();
    });

    it('should render unhealthy status correctly', () => {
      render(<HealthStatusBadge status="unhealthy" />);

      expect(screen.getByText('不健康')).toBeInTheDocument();
      expect(screen.getByTestId('health-status-unhealthy')).toBeInTheDocument();
    });
  });

  describe('Icon Display', () => {
    it('should show icon by default for healthy status', () => {
      render(<HealthStatusBadge status="healthy" showText={true} />);

      expect(screen.getByText('🟢')).toBeInTheDocument();
    });

    it('should show icon by default for warning status', () => {
      render(<HealthStatusBadge status="warning" showText={true} />);

      expect(screen.getByText('🟡')).toBeInTheDocument();
    });

    it('should show icon by default for unhealthy status', () => {
      render(<HealthStatusBadge status="unhealthy" showText={true} />);

      expect(screen.getByText('🔴')).toBeInTheDocument();
    });

    it('should show only icon when showText is false', () => {
      render(<HealthStatusBadge status="healthy" showText={false} />);

      expect(screen.getByText('🟢')).toBeInTheDocument();
      expect(screen.queryByText('健康')).not.toBeInTheDocument();
    });

    it('should show icon and text when showText is true', () => {
      render(<HealthStatusBadge status="healthy" showText={true} />);

      expect(screen.getByText('🟢')).toBeInTheDocument();
      expect(screen.getByText('健康')).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('should apply correct color for healthy status', () => {
      const { container } = render(<HealthStatusBadge status="healthy" />);

      const badge = container.querySelector('span');
      expect(badge).toHaveClass('bg-green-100', 'text-green-800', 'border-green-200');
    });

    it('should apply correct color for warning status', () => {
      const { container } = render(<HealthStatusBadge status="warning" />);

      const badge = container.querySelector('span');
      expect(badge).toHaveClass('bg-yellow-100', 'text-yellow-800', 'border-yellow-200');
    });

    it('should apply correct color for unhealthy status', () => {
      const { container } = render(<HealthStatusBadge status="unhealthy" />);

      const badge = container.querySelector('span');
      expect(badge).toHaveClass('bg-red-100', 'text-red-800', 'border-red-200');
    });

    it('should include border and rounded classes', () => {
      const { container } = render(<HealthStatusBadge status="healthy" />);

      const badge = container.querySelector('span');
      expect(badge).toHaveClass('border', 'rounded-full');
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<HealthStatusBadge status="healthy" />);

      const badge = screen.getByTestId('health-status-healthy');
      expect(badge).toHaveAttribute('role', 'badge');
    });

    it('should have proper aria-label for screen readers', () => {
      render(<HealthStatusBadge status="healthy" />);

      const badge = screen.getByTestId('health-status-healthy');
      expect(badge).toHaveAttribute('aria-label', '健康状态');
    });
  });

  describe('Edge Cases', () => {
    it('should handle custom className prop', () => {
      const { container } = render(
        <HealthStatusBadge status="healthy" className="custom-class" />
      );

      const badge = container.querySelector('span');
      expect(badge).toHaveClass('custom-class');
    });

    it('should maintain base classes with custom className', () => {
      const { container } = render(
        <HealthStatusBadge status="healthy" className="custom-class" />
      );

      const badge = container.querySelector('span');
      expect(badge).toHaveClass('bg-green-100');
      expect(badge).toHaveClass('custom-class');
    });
  });
});
