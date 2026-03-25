/**
 * InstanceTypeBadge Component Tests
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { InstanceTypeBadge } from './InstanceTypeBadge';

describe('InstanceTypeBadge Component', () => {
  describe('Rendering', () => {
    it('should render local type correctly', () => {
      render(<InstanceTypeBadge type="local" />);

      expect(screen.getByText('本地')).toBeInTheDocument();
      expect(screen.getByTestId('instance-type-local')).toBeInTheDocument();
    });

    it('should render remote type correctly', () => {
      render(<InstanceTypeBadge type="remote" />);

      expect(screen.getByText('远程')).toBeInTheDocument();
      expect(screen.getByTestId('instance-type-remote')).toBeInTheDocument();
    });
  });

  describe('Size Variants', () => {
    it('should render small size badge', () => {
      const { container } = render(<InstanceTypeBadge type="local" size="sm" />);

      const badge = container.querySelector('span');
      expect(badge).toHaveClass('px-2', 'py-0.5', 'text-xs');
    });

    it('should render medium size badge (default)', () => {
      const { container } = render(<InstanceTypeBadge type="local" size="md" />);

      const badge = container.querySelector('span');
      expect(badge).toHaveClass('px-3', 'py-1', 'text-sm');
    });

    it('should render large size badge', () => {
      const { container } = render(<InstanceTypeBadge type="local" size="lg" />);

      const badge = container.querySelector('span');
      expect(badge).toHaveClass('px-4', 'py-2', 'text-base');
    });
  });

  describe('Styling', () => {
    it('should apply correct color for local type', () => {
      const { container } = render(<InstanceTypeBadge type="local" />);

      const badge = container.querySelector('span');
      expect(badge).toHaveClass('bg-blue-100', 'text-blue-800', 'border-blue-200');
    });

    it('should apply correct color for remote type', () => {
      const { container } = render(<InstanceTypeBadge type="remote" />);

      const badge = container.querySelector('span');
      expect(badge).toHaveClass('bg-purple-100', 'text-purple-800', 'border-purple-200');
    });

    it('should include icon for local type', () => {
      render(<InstanceTypeBadge type="local" />);

      expect(screen.getByText('🏠')).toBeInTheDocument();
    });

    it('should include icon for remote type', () => {
      render(<InstanceTypeBadge type="remote" />);

      expect(screen.getByText('🌐')).toBeInTheDocument();
    });

    it('should apply border classes', () => {
      const { container } = render(<InstanceTypeBadge type="local" />);

      const badge = container.querySelector('span');
      expect(badge).toHaveClass('border', 'rounded-full');
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<InstanceTypeBadge type="local" />);

      const badge = screen.getByTestId('instance-type-local');
      expect(badge).toHaveAttribute('role', 'badge');
    });
  });

  describe('Edge Cases', () => {
    it('should handle custom className prop', () => {
      const { container } = render(
        <InstanceTypeBadge type="local" className="custom-class" />
      );

      const badge = container.querySelector('span');
      expect(badge).toHaveClass('custom-class');
    });

    it('should maintain base classes with custom className', () => {
      const { container } = render(
        <InstanceTypeBadge type="local" className="custom-class" />
      );

      const badge = container.querySelector('span');
      expect(badge).toHaveClass('bg-blue-100');
      expect(badge).toHaveClass('custom-class');
    });
  });
});
