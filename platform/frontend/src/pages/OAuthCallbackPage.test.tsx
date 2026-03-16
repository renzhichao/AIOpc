/**
 * OAuthCallbackPage Component Tests
 *
 * Tests the complete OAuth callback → QR code display → claim polling → redirect flow
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import OAuthCallbackPage from './OAuthCallbackPage';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../contexts/AuthContext';

// Mock the auth service
const mockHandleCallback = vi.fn();
const mockGetClaimQRCode = vi.fn();

vi.mock('../services/auth', () => ({
  authService: {
    handleCallback: () => mockHandleCallback(),
    getClaimQRCode: () => mockGetClaimQRCode(),
  },
}));

// Mock navigation
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Wrapper component with providers
function TestWrapper({
  children,
  initialEntries,
}: {
  children: React.ReactNode;
  initialEntries?: string[];
}) {
  return (
    <MemoryRouter initialEntries={initialEntries || ['/oauth/callback?code=test-code&state=test-state']}>
      <AuthProvider>{children}</AuthProvider>
    </MemoryRouter>
  );
}

describe('OAuthCallbackPage - OAuth Callback Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockNavigate.mockReset();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should extract code parameter from URL and show loading state', async () => {
    render(
      <TestWrapper>
        <OAuthCallbackPage />
      </TestWrapper>
    );

    // Verify loading state is shown
    expect(screen.getByText('正在处理登录...')).toBeInTheDocument();
  });

  it('should save access_token and refresh_token on successful login', async () => {
    const mockResponse = {
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      expires_in: 3600,
      user: {
        id: '123',
        name: 'Test User',
        feishu_user_id: 'feishu-123',
      },
    };

    mockHandleCallback.mockResolvedValueOnce(mockResponse);

    // Mock QR code response (no instance yet)
    const mockQRCodeResponse = {
      success: true,
      already_has_instance: false,
      qr_code: {
        id: 'qrcode-123',
        token: 'claim-token-123',
        expires_at: '2026-03-16T21:00:00Z',
        image_url: '/api/qrcode/123/image',
        scan_url: 'http://localhost:5173/claim/123',
      },
    };

    mockGetClaimQRCode.mockResolvedValueOnce(mockQRCodeResponse);

    render(
      <TestWrapper>
        <OAuthCallbackPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(mockHandleCallback).toHaveBeenCalled();
    });

    await waitFor(() => {
      // Verify tokens are saved using the correct storage keys
      expect(localStorage.getItem('auth_token')).toBe('test-access-token');
      expect(localStorage.getItem('refresh_token')).toBe('test-refresh-token');
      expect(localStorage.getItem('user_data')).toBeTruthy();
    });
  });

  it('should handle OAuth error parameter', async () => {
    render(
      <TestWrapper initialEntries={['/oauth/callback?error=access_denied']}>
        <OAuthCallbackPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('您取消了授权')).toBeInTheDocument();
    });
  });

  it('should handle missing code parameter', async () => {
    render(
      <TestWrapper initialEntries={['/oauth/callback?state=test-state']}>
        <OAuthCallbackPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('无效的回调参数')).toBeInTheDocument();
    });
  });
});

describe('OAuthCallbackPage - Instance Status Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockNavigate.mockReset();
  });

  it('should redirect to /chat if user already has instance', async () => {
    const mockLoginResponse = {
      access_token: 'test-access-token',
      user: {
        id: '123',
        name: 'Test User',
        feishu_user_id: 'feishu-123',
      },
    };

    mockHandleCallback.mockResolvedValueOnce(mockLoginResponse);

    // Mock instance status (already has instance)
    mockGetClaimQRCode.mockResolvedValueOnce({
      success: true,
      already_has_instance: true,
      instance: { instance_id: 'test-instance' },
      redirect_to: '/chat',
    });

    render(
      <TestWrapper>
        <OAuthCallbackPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('登录成功！')).toBeInTheDocument();
    });

    await waitFor(
      () => {
        expect(mockNavigate).toHaveBeenCalledWith('/chat', { replace: true });
      },
      { timeout: 2000 }
    );
  });

  it('should display QR code if user has no instance', async () => {
    const mockLoginResponse = {
      access_token: 'test-access-token',
      user: {
        id: '123',
        name: 'Test User',
        feishu_user_id: 'feishu-123',
      },
    };

    mockHandleCallback.mockResolvedValueOnce(mockLoginResponse);

    const mockQRCodeResponse = {
      success: true,
      already_has_instance: false,
      qr_code: {
        id: 'qrcode-123',
        token: 'claim-token-123',
        expires_at: '2026-03-16T21:00:00Z',
        image_url: '/api/qrcode/123/image',
        scan_url: 'http://localhost:5173/claim/123',
      },
    };

    mockGetClaimQRCode.mockResolvedValueOnce(mockQRCodeResponse);

    render(
      <TestWrapper>
        <OAuthCallbackPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText(/Test User/)).toBeInTheDocument();
    });

    const qrImage = screen.queryByAltText(/claim qr code/i);
    expect(qrImage).toBeInTheDocument();
    expect(qrImage).toHaveAttribute('src', '/api/qrcode/123/image');
  });
});

describe('OAuthCallbackPage - QR Code Display', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockNavigate.mockReset();
  });

  it('should display username and welcome message', async () => {
    const mockLoginResponse = {
      access_token: 'test-access-token',
      user: {
        id: '123',
        name: 'Test User',
        feishu_user_id: 'feishu-123',
      },
    };

    mockHandleCallback.mockResolvedValueOnce(mockLoginResponse);

    const mockQRCodeResponse = {
      success: true,
      already_has_instance: false,
      qr_code: {
        id: 'qrcode-123',
        token: 'claim-token-123',
        expires_at: '2026-03-16T21:00:00Z',
        image_url: '/api/qrcode/123/image',
        scan_url: 'http://localhost:5173/claim/123',
      },
    };

    mockGetClaimQRCode.mockResolvedValueOnce(mockQRCodeResponse);

    render(
      <TestWrapper>
        <OAuthCallbackPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('欢迎, Test User!')).toBeInTheDocument();
    });
  });

  it('should display QR code expiry hint', async () => {
    const mockLoginResponse = {
      access_token: 'test-access-token',
      user: {
        id: '123',
        name: 'Test User',
        feishu_user_id: 'feishu-123',
      },
    };

    mockHandleCallback.mockResolvedValueOnce(mockLoginResponse);

    const mockQRCodeResponse = {
      success: true,
      already_has_instance: false,
      qr_code: {
        id: 'qrcode-123',
        token: 'claim-token-123',
        expires_at: '2026-03-16T21:00:00Z',
        image_url: '/api/qrcode/123/image',
        scan_url: 'http://localhost:5173/claim/123',
      },
    };

    mockGetClaimQRCode.mockResolvedValueOnce(mockQRCodeResponse);

    render(
      <TestWrapper>
        <OAuthCallbackPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText(/有效期至/)).toBeInTheDocument();
    });
  });

  it('should display waiting for claim loading state', async () => {
    const mockLoginResponse = {
      access_token: 'test-access-token',
      user: {
        id: '123',
        name: 'Test User',
        feishu_user_id: 'feishu-123',
      },
    };

    mockHandleCallback.mockResolvedValueOnce(mockLoginResponse);

    const mockQRCodeResponse = {
      success: true,
      already_has_instance: false,
      qr_code: {
        id: 'qrcode-123',
        token: 'claim-token-123',
        expires_at: '2026-03-16T21:00:00Z',
        image_url: '/api/qrcode/123/image',
        scan_url: 'http://localhost:5173/claim/123',
      },
    };

    mockGetClaimQRCode.mockResolvedValueOnce(mockQRCodeResponse);

    render(
      <TestWrapper>
        <OAuthCallbackPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('等待实例认领...')).toBeInTheDocument();
    });
  });
});

describe('OAuthCallbackPage - Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockNavigate.mockReset();
  });

  it('should show regenerate QR code button', async () => {
    const mockLoginResponse = {
      access_token: 'test-access-token',
      user: {
        id: '123',
        name: 'Test User',
        feishu_user_id: 'feishu-123',
      },
    };

    mockHandleCallback.mockResolvedValueOnce(mockLoginResponse);

    const mockQRCodeResponse = {
      success: true,
      already_has_instance: false,
      qr_code: {
        id: 'qrcode-123',
        token: 'claim-token-123',
        expires_at: '2026-03-16T21:00:00Z',
        image_url: '/api/qrcode/123/image',
        scan_url: 'http://localhost:5173/claim/123',
      },
    };

    mockGetClaimQRCode.mockResolvedValueOnce(mockQRCodeResponse);

    render(
      <TestWrapper>
        <OAuthCallbackPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText(/Test User/)).toBeInTheDocument();
    });

    const regenerateButton = screen.queryByText('重新生成二维码');
    expect(regenerateButton).toBeInTheDocument();
  });

  it('should show back to login button on error', async () => {
    mockHandleCallback.mockRejectedValueOnce(new Error('Login failed'));

    render(
      <TestWrapper>
        <OAuthCallbackPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('登录失败')).toBeInTheDocument();
      expect(screen.getByText('返回登录页')).toBeInTheDocument();
    });
  });
});
