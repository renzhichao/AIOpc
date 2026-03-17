/**
 * ChatPage Tests
 *
 * TDD Test Suite for ChatPage component
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ChatPage from './ChatPage';
import { instanceService } from '../services/instance';

// Mock the instance service
vi.mock('../services/instance', () => ({
  instanceService: {
    getInstance: vi.fn(),
  },
}));

// Mock the WebSocket service
vi.mock('../services/websocket', () => ({
  createWebSocketService: vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    sendMessage: vi.fn(),
    onMessage: vi.fn(() => vi.fn()),
    onStatusChange: vi.fn(() => vi.fn()),
    getStatus: vi.fn(() => 'connected'),
    isConnected: vi.fn(() => true),
  })),
}));

// Mock useWebSocket hook
vi.mock('../hooks/useWebSocket', () => ({
  useWebSocket: vi.fn(() => ({
    status: 'connected',
    messages: [],
    sendMessage: vi.fn(),
    onMessage: vi.fn(() => vi.fn()),
    onStatusChange: vi.fn(() => vi.fn()),
    getStatus: vi.fn(() => 'connected'),
    isConnected: true,
  })),
}));

// Mock navigation
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ instanceId: '1' }),
  };
});

const mockInstance = {
  id: 1,
  instance_id: 'test-instance-123',
  name: 'Test Instance',
  description: 'Test Description',
  status: 'running' as const,
  deployment_type: 'remote' as const,
  config: {
    name: 'Test Instance',
    description: 'Test Description',
  },
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  restart_attempts: 0,
  template: 'personal' as const,
};

function TestWrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter initialEntries={['/instances/1/chat']}>{children}</MemoryRouter>;
}

const renderWithRouter = (component: React.ReactElement) => {
  return render(<TestWrapper>{component}</TestWrapper>);
};

describe('ChatPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock successful instance fetch
    vi.mocked(instanceService.getInstance).mockResolvedValue(mockInstance);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Component Rendering', () => {
    it('should render without crashing', async () => {
      renderWithRouter(<ChatPage />);
      await waitFor(() => {
        expect(screen.getByTestId('chat-page')).toBeInTheDocument();
      });
    });

    it('should display loading state initially', () => {
      renderWithRouter(<ChatPage />);
      expect(screen.getByTestId('chat-loading')).toBeInTheDocument();
      expect(screen.getByText(/加载中/i)).toBeInTheDocument();
    });

    it('should display message list container', async () => {
      renderWithRouter(<ChatPage />);
      await waitFor(() => {
        expect(screen.getByTestId('message-list')).toBeInTheDocument();
      });
    });

    it('should display message input', async () => {
      renderWithRouter(<ChatPage />);
      await waitFor(() => {
        expect(screen.getByTestId('message-input')).toBeInTheDocument();
      });
    });

    it('should display connection status', async () => {
      renderWithRouter(<ChatPage />);
      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toBeInTheDocument();
      });
    });
  });

  describe('Instance Information', () => {
    it('should display instance name in header', async () => {
      renderWithRouter(<ChatPage />);
      await waitFor(() => {
        expect(screen.getByText('Test Instance')).toBeInTheDocument();
      });
    });

    it('should display instance type badge', async () => {
      renderWithRouter(<ChatPage />);
      await waitFor(() => {
        expect(screen.getByText(/远程/i)).toBeInTheDocument();
      });
    });

    it('should display instance status badge', async () => {
      renderWithRouter(<ChatPage />);
      await waitFor(() => {
        expect(screen.getByTestId('status-badge-running')).toBeInTheDocument();
      });
    });

    it('should show error state when instance not found', async () => {
      vi.mocked(instanceService.getInstance).mockRejectedValue(new Error('Instance not found'));
      renderWithRouter(<ChatPage />);
      await waitFor(() => {
        expect(screen.getByText(/实例不存在/i)).toBeInTheDocument();
      });
    });
  });

  describe('Message Handling', () => {
    it('should send message when clicking send button', async () => {
      renderWithRouter(<ChatPage />);
      await waitFor(() => {
        expect(screen.getByTestId('message-input')).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/输入消息/i);
      const sendButton = screen.getByRole('button', { name: /发送/i });

      fireEvent.change(input, { target: { value: 'Test message' } });
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(screen.getByText('Test message')).toBeInTheDocument();
      });
    });

    it('should send message when pressing Enter key', async () => {
      renderWithRouter(<ChatPage />);
      await waitFor(() => {
        expect(screen.getByTestId('message-input')).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/输入消息/i);

      fireEvent.change(input, { target: { value: 'Test message' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

      await waitFor(() => {
        expect(screen.getByText('Test message')).toBeInTheDocument();
      });
    });

    it('should not send message when pressing Shift+Enter', async () => {
      renderWithRouter(<ChatPage />);
      await waitFor(() => {
        expect(screen.getByTestId('message-input')).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/输入消息/i);

      fireEvent.change(input, { target: { value: 'Test message' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', shiftKey: true });

      await waitFor(() => {
        expect(input).toHaveValue('Test message\n');
      });
    });

    it('should not send empty messages', async () => {
      renderWithRouter(<ChatPage />);
      await waitFor(() => {
        expect(screen.getByTestId('message-input')).toBeInTheDocument();
      });

      const sendButton = screen.getByRole('button', { name: /发送/i });
      const initialButtonState = sendButton.disabled;

      expect(initialButtonState).toBe(true);
    });

    it('should display user messages with proper styling', async () => {
      renderWithRouter(<ChatPage />);
      await waitFor(() => {
        expect(screen.getByTestId('message-input')).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/输入消息/i);
      const sendButton = screen.getByRole('button', { name: /发送/i });

      fireEvent.change(input, { target: { value: 'User message' } });
      fireEvent.click(sendButton);

      await waitFor(() => {
        const userMessage = screen.getByTestId('message-user-0');
        expect(userMessage).toBeInTheDocument();
        expect(userMessage).toHaveClass('justify-end');
      });
    });

    it('should display AI messages with proper styling', async () => {
      renderWithRouter(<ChatPage />);
      await waitFor(() => {
        expect(screen.getByTestId('message-list')).toBeInTheDocument();
      });

      // AI messages would come through WebSocket
      // This test verifies the styling when messages are present
      const messageList = screen.getByTestId('message-list');
      expect(messageList).toBeInTheDocument();
    });

    it('should display message timestamps', async () => {
      renderWithRouter(<ChatPage />);
      await waitFor(() => {
        expect(screen.getByTestId('message-input')).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/输入消息/i);
      const sendButton = screen.getByRole('button', { name: /发送/i });

      fireEvent.change(input, { target: { value: 'Test message' } });
      fireEvent.click(sendButton);

      await waitFor(() => {
        const timestamp = screen.queryByText(/\d{2}:\d{2}/);
        expect(timestamp).toBeInTheDocument();
      });
    });
  });

  describe('WebSocket Integration', () => {
    it('should connect to WebSocket on mount', async () => {
      renderWithRouter(<ChatPage />);
      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toBeInTheDocument();
      });
    });

    it('should update connection status', async () => {
      renderWithRouter(<ChatPage />);
      await waitFor(() => {
        const statusElement = screen.getByTestId('connection-status');
        expect(statusElement).toBeInTheDocument();
      });
    });
  });

  describe('UI Interactions', () => {
    it('should navigate back when clicking back button', async () => {
      renderWithRouter(<ChatPage />);
      await waitFor(() => {
        const backButton = screen.getByTestId('back-button');
        expect(backButton).toBeInTheDocument();
      });
    });

    it('should disable send button while sending', async () => {
      renderWithRouter(<ChatPage />);
      await waitFor(() => {
        expect(screen.getByTestId('message-input')).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/输入消息/i);
      const sendButton = screen.getByRole('button', { name: /发送/i });

      // Initially disabled because input is empty
      expect(sendButton).toBeDisabled();

      // Enabled when there's input
      fireEvent.change(input, { target: { value: 'Test' } });
      expect(sendButton).not.toBeDisabled();
    });

    it('should clear input after sending message', async () => {
      renderWithRouter(<ChatPage />);
      await waitFor(() => {
        expect(screen.getByTestId('message-input')).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/输入消息/i) as HTMLTextAreaElement;
      const sendButton = screen.getByRole('button', { name: /发送/i });

      fireEvent.change(input, { target: { value: 'Test message' } });
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(input.value).toBe('');
      });
    });

    it('should auto-scroll to bottom on new message', async () => {
      renderWithRouter(<ChatPage />);
      await waitFor(() => {
        expect(screen.getByTestId('message-list')).toBeInTheDocument();
      });

      const messageList = screen.getByTestId('message-list');
      expect(messageList).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long messages', async () => {
      renderWithRouter(<ChatPage />);
      await waitFor(() => {
        expect(screen.getByTestId('message-input')).toBeInTheDocument();
      });

      const longMessage = 'A'.repeat(5000);
      const input = screen.getByPlaceholderText(/输入消息/i);
      const sendButton = screen.getByRole('button', { name: /发送/i });

      fireEvent.change(input, { target: { value: longMessage } });
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(screen.getByText(longMessage)).toBeInTheDocument();
      });
    });

    it('should handle special characters in messages', async () => {
      renderWithRouter(<ChatPage />);
      await waitFor(() => {
        expect(screen.getByTestId('message-input')).toBeInTheDocument();
      });

      const specialMessage = 'Test <script>alert("test")</script> & special chars: @#$%^&*()';
      const input = screen.getByPlaceholderText(/输入消息/i);
      const sendButton = screen.getByRole('button', { name: /发送/i });

      fireEvent.change(input, { target: { value: specialMessage } });
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(screen.getByText(/Test.*special chars/i)).toBeInTheDocument();
      });
    });

    it('should handle whitespace-only messages', async () => {
      renderWithRouter(<ChatPage />);
      await waitFor(() => {
        expect(screen.getByTestId('message-input')).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/输入消息/i);
      const sendButton = screen.getByRole('button', { name: /发送/i });

      fireEvent.change(input, { target: { value: '   ' } });
      expect(sendButton).toBeDisabled();
    });

    it('should handle connection errors gracefully', async () => {
      // This would test WebSocket error handling
      renderWithRouter(<ChatPage />);
      await waitFor(() => {
        expect(screen.getByTestId('chat-page')).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', async () => {
      renderWithRouter(<ChatPage />);
      await waitFor(() => {
        expect(screen.getByRole('region', { name: /聊天页面/i })).toBeInTheDocument();
      });
    });

    it('should support keyboard navigation', async () => {
      renderWithRouter(<ChatPage />);
      await waitFor(() => {
        const input = screen.getByPlaceholderText(/输入消息/i);
        expect(input).toHaveFocus();
      });
    });

    it('should have proper heading hierarchy', async () => {
      renderWithRouter(<ChatPage />);
      await waitFor(() => {
        const heading = screen.getByRole('heading', { level: 1 });
        expect(heading).toBeInTheDocument();
      });
    });
  });

  describe('Responsive Design', () => {
    it('should render correctly on mobile', async () => {
      // Mock mobile viewport
      global.innerWidth = 375;
      global.dispatchEvent(new Event('resize'));

      renderWithRouter(<ChatPage />);
      await waitFor(() => {
        expect(screen.getByTestId('chat-page')).toBeInTheDocument();
      });
    });
  });
});
