/**
 * PlatformSelector Component Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import PlatformSelector from '../PlatformSelector';

// Mock authService
const mockGetEnabledPlatforms = vi.fn();

vi.mock('@/services/auth', () => ({
  authService: {
    getEnabledPlatforms: () => mockGetEnabledPlatforms(),
  },
}));

describe('PlatformSelector', () => {
  const mockOnPlatformSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockGetEnabledPlatforms.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Component Rendering', () => {
    it('should render loading state initially', () => {
      mockGetEnabledPlatforms.mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      render(<PlatformSelector onPlatformSelect={mockOnPlatformSelect} />);

      expect(screen.getByText(/选择登录方式/)).toBeInTheDocument();
    });

    it('should render platform cards when platforms are loaded', async () => {
      mockGetEnabledPlatforms.mockResolvedValue([
        { platform: 'feishu', enabled: true, isDefault: true },
        { platform: 'dingtalk', enabled: true, isDefault: false },
      ]);

      render(<PlatformSelector onPlatformSelect={mockOnPlatformSelect} />);

      await waitFor(() => {
        expect(screen.getByText('飞书')).toBeInTheDocument();
        expect(screen.getByText('钉钉')).toBeInTheDocument();
      });
    });

    it('should render error state when API fails', async () => {
      mockGetEnabledPlatforms.mockRejectedValue(
        new Error('网络错误')
      );

      render(<PlatformSelector onPlatformSelect={mockOnPlatformSelect} />);

      await waitFor(() => {
        expect(screen.getByText(/获取平台列表失败/)).toBeInTheDocument();
      });
    });
  });

  describe('Platform Selection', () => {
    it('should call onPlatformSelect when a platform is clicked', async () => {
      mockGetEnabledPlatforms.mockResolvedValue([
        { platform: 'feishu', enabled: true, isDefault: true },
        { platform: 'dingtalk', enabled: true, isDefault: false },
      ]);

      render(<PlatformSelector onPlatformSelect={mockOnPlatformSelect} />);

      await waitFor(() => {
        expect(screen.getByText('飞书')).toBeInTheDocument();
      });

      const feishuButton = screen.getByTestId('platform-card-feishu');
      fireEvent.click(feishuButton);

      expect(mockOnPlatformSelect).toHaveBeenCalledWith('feishu');
    });

    it('should save selected platform to localStorage when remember is checked', async () => {
      mockGetEnabledPlatforms.mockResolvedValue([
        { platform: 'feishu', enabled: true, isDefault: true },
        { platform: 'dingtalk', enabled: true, isDefault: false },
      ]);

      render(
        <PlatformSelector
          onPlatformSelect={mockOnPlatformSelect}
          showRememberOption={true}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('飞书')).toBeInTheDocument();
      });

      // Check the remember checkbox
      const rememberCheckbox = screen.getByTestId('remember-checkbox');
      fireEvent.click(rememberCheckbox);
      expect(rememberCheckbox).toBeChecked();

      // Select platform
      const feishuButton = screen.getByTestId('platform-card-feishu');
      fireEvent.click(feishuButton);

      expect(localStorage.getItem('selected_oauth_platform')).toBe('feishu');
    });

    it('should load saved platform from localStorage on mount', async () => {
      localStorage.setItem('selected_oauth_platform', 'dingtalk');

      mockGetEnabledPlatforms.mockResolvedValue([
        { platform: 'feishu', enabled: true, isDefault: true },
        { platform: 'dingtalk', enabled: true, isDefault: false },
      ]);

      render(<PlatformSelector onPlatformSelect={mockOnPlatformSelect} />);

      await waitFor(() => {
        const dingtalkButton = screen.getByTestId('platform-card-dingtalk');
        expect(dingtalkButton).toHaveAttribute('data-selected', 'true');
      });
    });
  });

  describe('Single Platform Scenario', () => {
    it('should auto-select single platform and not show selector', async () => {
      mockGetEnabledPlatforms.mockResolvedValue([
        { platform: 'feishu', enabled: true, isDefault: true },
      ]);

      render(<PlatformSelector onPlatformSelect={mockOnPlatformSelect} />);

      await waitFor(() => {
        expect(mockOnPlatformSelect).toHaveBeenCalledWith('feishu');
      });

      // Component should render null (no platform cards)
      expect(screen.queryByText('飞书')).not.toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should show fallback platforms when API fails', async () => {
      mockGetEnabledPlatforms.mockRejectedValue(new Error('API Error'));

      render(<PlatformSelector onPlatformSelect={mockOnPlatformSelect} />);

      await waitFor(() => {
        expect(screen.getByText('飞书')).toBeInTheDocument();
        expect(screen.getByText('钉钉')).toBeInTheDocument();
      });
    });

    it('should show reload button when API fails', async () => {
      mockGetEnabledPlatforms.mockRejectedValue(new Error('API Error'));

      render(<PlatformSelector onPlatformSelect={mockOnPlatformSelect} />);

      await waitFor(() => {
        expect(screen.getByText(/重新加载/)).toBeInTheDocument();
      });
    });
  });

  describe('Remember Choice Feature', () => {
    it('should show remember checkbox when showRememberOption is true', async () => {
      mockGetEnabledPlatforms.mockResolvedValue([
        { platform: 'feishu', enabled: true, isDefault: true },
        { platform: 'dingtalk', enabled: true, isDefault: false },
      ]);

      render(
        <PlatformSelector
          onPlatformSelect={mockOnPlatformSelect}
          showRememberOption={true}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('记住我的选择')).toBeInTheDocument();
      });
    });

    it('should not show remember checkbox when showRememberOption is false', async () => {
      mockGetEnabledPlatforms.mockResolvedValue([
        { platform: 'feishu', enabled: true, isDefault: true },
        { platform: 'dingtalk', enabled: true, isDefault: false },
      ]);

      render(
        <PlatformSelector
          onPlatformSelect={mockOnPlatformSelect}
          showRememberOption={false}
        />
      );

      await waitFor(() => {
        expect(screen.queryByText('记住我的选择')).not.toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper data-testid attributes', async () => {
      mockGetEnabledPlatforms.mockResolvedValue([
        { platform: 'feishu', enabled: true, isDefault: true },
        { platform: 'dingtalk', enabled: true, isDefault: false },
      ]);

      render(<PlatformSelector onPlatformSelect={mockOnPlatformSelect} />);

      await waitFor(() => {
        expect(screen.getByTestId('platform-selector')).toBeInTheDocument();
        expect(screen.getByTestId('platform-card-feishu')).toBeInTheDocument();
        expect(screen.getByTestId('platform-card-dingtalk')).toBeInTheDocument();
        expect(screen.getByTestId('remember-checkbox')).toBeInTheDocument();
      });
    });

    it('should update data-selected attribute when platform is selected', async () => {
      mockGetEnabledPlatforms.mockResolvedValue([
        { platform: 'feishu', enabled: true, isDefault: true },
        { platform: 'dingtalk', enabled: true, isDefault: false },
      ]);

      render(<PlatformSelector onPlatformSelect={mockOnPlatformSelect} />);

      await waitFor(() => {
        expect(screen.getByText('飞书')).toBeInTheDocument();
      });

      const feishuButton = screen.getByTestId('platform-card-feishu');
      fireEvent.click(feishuButton);

      expect(feishuButton).toHaveAttribute('data-selected', 'true');
    });
  });
});
