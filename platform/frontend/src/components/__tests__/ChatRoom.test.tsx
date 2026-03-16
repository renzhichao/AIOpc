/**
 * ChatRoom Component Tests
 *
 * Testing the main chat interface component following TDD principles.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ChatRoom } from '../ChatRoom';
import { useWebSocket } from '../../hooks/useWebSocket';

// Mock the useWebSocket hook
vi.mock('../../hooks/useWebSocket');

describe('ChatRoom Component', () => {
  const mockConnect = vi.fn();
  const mockDisconnect = vi.fn();
  const mockSendMessage = vi.fn();
  const mockOnMessage = vi.fn();
  const mockOnStatusChange = vi.fn();

  // Default mock return value
  const defaultMockWebSocket = {
    status: 'disconnected' as const,
    messages: [],
    sendMessage: mockSendMessage,
    onMessage: mockOnMessage,
    onStatusChange: mockOnStatusChange,
    getStatus: () => 'disconnected' as const,
    isConnected: false,
    connect: mockConnect,
    disconnect: mockDisconnect,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Setup default mock return values
    mockOnMessage.mockReturnValue(vi.fn());
    mockOnStatusChange.mockReturnValue(vi.fn());
    (useWebSocket as any).mockReturnValue(defaultMockWebSocket);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering Tests', () => {
    it('should render ChatRoom component', () => {
      render(<ChatRoom />);

      const chatRoom = screen.getByTestId('chat-room');
      expect(chatRoom).toBeInTheDocument();
    });

    it('should display "OpenClaw Assistant" title', () => {
      render(<ChatRoom />);

      const title = screen.getByText('OpenClaw Assistant');
      expect(title).toBeInTheDocument();
    });

    it('should display connection status indicator', () => {
      render(<ChatRoom />);

      const statusIndicator = screen.getByTestId('connection-status');
      expect(statusIndicator).toBeInTheDocument();
    });

    it('should display MessageList component', () => {
      render(<ChatRoom />);

      const messageList = screen.getByTestId('message-list');
      expect(messageList).toBeInTheDocument();
    });

    it('should display MessageInput component', () => {
      render(<ChatRoom />);

      const messageInput = screen.getByTestId('message-input');
      expect(messageInput).toBeInTheDocument();
    });

    it('should have correct CSS classes for layout', () => {
      const { container } = render(<ChatRoom />);

      const chatRoom = container.querySelector('[data-testid="chat-room"]');
      expect(chatRoom).toHaveClass('flex', 'flex-col', 'h-screen');
    });
  });

  describe('WebSocket Connection Tests', () => {
    it('should auto-connect on mount', () => {
      render(<ChatRoom />);

      expect(mockConnect).toHaveBeenCalled();
    });

    it('should disconnect on unmount', () => {
      const { unmount } = render(<ChatRoom />);

      unmount();

      expect(mockDisconnect).toHaveBeenCalled();
    });

    it('should subscribe to message events on mount', () => {
      const mockUnsubscribe = vi.fn();
      mockOnMessage.mockReturnValue(mockUnsubscribe);

      render(<ChatRoom />);

      expect(mockOnMessage).toHaveBeenCalled();
      expect(typeof mockOnMessage.mock.calls[0][0]).toBe('function');
    });

    // Note: Status change subscription tests removed since component now directly uses hook's status
  });

  describe('Message Handling Tests', () => {
    it('should add user message to list when sent', async () => {
      const messageHandler = vi.fn();
      mockOnStatusChange.mockReturnValue(vi.fn());
      mockOnMessage.mockImplementation((handler) => {
        messageHandler.mockImplementation(handler);
        return vi.fn();
      });

      render(<ChatRoom />);

      // Get the message handler that was registered
      const registeredHandler = mockOnMessage.mock.calls[0][0];

      // Simulate receiving a user message
      await registeredHandler({
        type: 'user_message',
        content: 'Test message',
        timestamp: '2025-01-01T00:00:00Z',
      });

      await waitFor(() => {
        const userMessage = screen.getByTestId('message-user-0');
        expect(userMessage).toBeInTheDocument();
        expect(userMessage).toHaveTextContent('Test message');
      });
    });

    it('should add assistant message to list when received', async () => {
      const messageHandler = vi.fn();
      mockOnStatusChange.mockReturnValue(vi.fn());
      mockOnMessage.mockImplementation((handler) => {
        messageHandler.mockImplementation(handler);
        return vi.fn();
      });

      render(<ChatRoom />);

      const registeredHandler = mockOnMessage.mock.calls[0][0];

      // Simulate receiving an assistant message
      await registeredHandler({
        type: 'assistant_message',
        content: 'Assistant response',
        timestamp: '2025-01-01T00:00:00Z',
        instance_id: 'instance-1',
      });

      await waitFor(() => {
        const assistantMessage = screen.getByTestId('message-assistant-0');
        expect(assistantMessage).toBeInTheDocument();
        expect(assistantMessage).toHaveTextContent('Assistant response');
      });
    });

    it('should add error message to list when error occurs', async () => {
      const messageHandler = vi.fn();
      mockOnStatusChange.mockReturnValue(vi.fn());
      mockOnMessage.mockImplementation((handler) => {
        messageHandler.mockImplementation(handler);
        return vi.fn();
      });

      render(<ChatRoom />);

      const registeredHandler = mockOnMessage.mock.calls[0][0];

      // Simulate receiving an error message
      await registeredHandler({
        type: 'error',
        error: 'Connection failed',
        timestamp: '2025-01-01T00:00:00Z',
      });

      await waitFor(() => {
        const errorMessage = screen.getByTestId('message-error-0');
        expect(errorMessage).toBeInTheDocument();
        expect(errorMessage).toHaveTextContent('Connection failed');
      });
    });

    it('should display multiple messages in correct order', async () => {
      const messageHandler = vi.fn();
      mockOnStatusChange.mockReturnValue(vi.fn());
      mockOnMessage.mockImplementation((handler) => {
        messageHandler.mockImplementation(handler);
        return vi.fn();
      });

      render(<ChatRoom />);

      const registeredHandler = mockOnMessage.mock.calls[0][0];

      // Add multiple messages
      await registeredHandler({
        type: 'user_message',
        content: 'First message',
        timestamp: '2025-01-01T00:00:00Z',
      });

      await registeredHandler({
        type: 'assistant_message',
        content: 'First response',
        timestamp: '2025-01-01T00:01:00Z',
        instance_id: 'instance-1',
      });

      await registeredHandler({
        type: 'user_message',
        content: 'Second message',
        timestamp: '2025-01-01T00:02:00Z',
      });

      await waitFor(() => {
        expect(screen.getByTestId('message-user-0')).toHaveTextContent('First message');
        expect(screen.getByTestId('message-assistant-1')).toHaveTextContent('First response');
        expect(screen.getByTestId('message-user-2')).toHaveTextContent('Second message');
      });
    });
  });

  describe('Input Tests', () => {
    it('should send message when submitted', async () => {
      const mockWebSocketWithConnection = {
        ...defaultMockWebSocket,
        status: 'connected' as const,
        isConnected: true,
      };

      // Reset and setup new mocks
      mockConnect.mockReset();
      mockDisconnect.mockReset();
      mockSendMessage.mockReset();
      mockOnMessage.mockReturnValue(vi.fn());
      mockOnStatusChange.mockReturnValue(vi.fn());

      (useWebSocket as any).mockReset();
      (useWebSocket as any).mockReturnValue(mockWebSocketWithConnection);

      render(<ChatRoom />);

      const input = screen.getByPlaceholderText('输入消息...');
      const sendButton = screen.getByRole('button', { name: /发送/i });

      // Type a message
      fireEvent.change(input, { target: { value: 'Hello, Assistant!' } });

      // Click send button
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith('Hello, Assistant!');
      });
    });

    it('should disable input when disconnected', () => {
      mockOnStatusChange.mockReturnValue(vi.fn());
      mockOnMessage.mockReturnValue(vi.fn());

      render(<ChatRoom />);

      const input = screen.getByPlaceholderText('输入消息...');
      const sendButton = screen.getByRole('button', { name: /发送/i });

      expect(input).toBeDisabled();
      expect(sendButton).toBeDisabled();
    });

    it('should enable input when connected', () => {
      const mockWebSocketWithConnection = {
        ...defaultMockWebSocket,
        status: 'connected' as const,
        isConnected: true,
      };

      // Reset and setup new mocks
      mockConnect.mockReset();
      mockDisconnect.mockReset();
      mockSendMessage.mockReset();
      mockOnMessage.mockReturnValue(vi.fn());
      mockOnStatusChange.mockReturnValue(vi.fn());

      (useWebSocket as any).mockReset();
      (useWebSocket as any).mockReturnValue(mockWebSocketWithConnection);

      render(<ChatRoom />);

      const input = screen.getByPlaceholderText('输入消息...');
      const sendButton = screen.getByRole('button', { name: /发送/i });

      expect(input).not.toBeDisabled();
      expect(sendButton).not.toBeDisabled();
    });

    it('should send message on Enter key press', async () => {
      const mockWebSocketWithConnection = {
        ...defaultMockWebSocket,
        status: 'connected' as const,
        isConnected: true,
      };

      // Reset and setup new mocks
      mockConnect.mockReset();
      mockDisconnect.mockReset();
      mockSendMessage.mockReset();
      mockOnMessage.mockReturnValue(vi.fn());
      mockOnStatusChange.mockReturnValue(vi.fn());

      (useWebSocket as any).mockReset();
      (useWebSocket as any).mockReturnValue(mockWebSocketWithConnection);

      render(<ChatRoom />);

      const input = screen.getByPlaceholderText('输入消息...');

      // Type a message and press Enter
      fireEvent.change(input, { target: { value: 'Test message' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith('Test message');
      });
    });

    it('should not send message on Shift+Enter (allow newline)', async () => {
      mockOnStatusChange.mockReturnValue(vi.fn());
      mockOnMessage.mockReturnValue(vi.fn());

      const mockWebSocketWithConnection = {
        ...defaultMockWebSocket,
        status: 'connected' as const,
        isConnected: true,
      };
      (useWebSocket as any).mockReturnValue(mockWebSocketWithConnection);

      render(<ChatRoom />);

      const input = screen.getByPlaceholderText('输入消息...');

      // Type a message and press Shift+Enter
      fireEvent.change(input, { target: { value: 'Test message' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', shiftKey: true });

      // Should not send message
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('should clear input after sending message', async () => {
      const mockWebSocketWithConnection = {
        ...defaultMockWebSocket,
        status: 'connected' as const,
        isConnected: true,
      };

      // Reset and setup new mocks
      mockConnect.mockReset();
      mockDisconnect.mockReset();
      mockSendMessage.mockReset();
      mockOnMessage.mockReturnValue(vi.fn());
      mockOnStatusChange.mockReturnValue(vi.fn());

      (useWebSocket as any).mockReset();
      (useWebSocket as any).mockReturnValue(mockWebSocketWithConnection);

      render(<ChatRoom />);

      const input = screen.getByPlaceholderText('输入消息...') as HTMLInputElement;
      const sendButton = screen.getByRole('button', { name: /发送/i });

      // Type and send
      fireEvent.change(input, { target: { value: 'Test message' } });
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(input.value).toBe('');
      });
    });

    it('should disable send button when input is empty', () => {
      mockOnStatusChange.mockReturnValue(vi.fn());
      mockOnMessage.mockReturnValue(vi.fn());

      const mockWebSocketWithConnection = {
        ...defaultMockWebSocket,
        status: 'connected' as const,
        isConnected: true,
      };
      (useWebSocket as any).mockReturnValue(mockWebSocketWithConnection);

      render(<ChatRoom />);

      const sendButton = screen.getByRole('button', { name: /发送/i });

      // Initially disabled (empty input)
      expect(sendButton).toBeDisabled();
    });

    it('should enable send button when input has text', () => {
      const mockWebSocketWithConnection = {
        ...defaultMockWebSocket,
        status: 'connected' as const,
        isConnected: true,
      };

      mockOnMessage.mockReturnValue(vi.fn());
      mockOnStatusChange.mockReturnValue(vi.fn());

      (useWebSocket as any).mockReturnValue(mockWebSocketWithConnection);

      render(<ChatRoom />);

      const input = screen.getByPlaceholderText('输入消息...');
      const sendButton = screen.getByRole('button', { name: /发送/i });

      // Type text
      fireEvent.change(input, { target: { value: 'Test' } });

      expect(sendButton).not.toBeDisabled();
    });
  });

  describe('Connection Status Tests', () => {
    it('should display connecting status', () => {
      const mockWebSocketConnecting = {
        ...defaultMockWebSocket,
        status: 'connecting' as const,
      };

      mockOnMessage.mockReturnValue(vi.fn());
      mockOnStatusChange.mockReturnValue(vi.fn());

      (useWebSocket as any).mockReturnValue(mockWebSocketConnecting);

      render(<ChatRoom />);

      const statusIndicator = screen.getByTestId('connection-status');
      expect(statusIndicator).toHaveTextContent(/连接中/i);
    });

    it('should display connected status', () => {
      const mockWebSocketConnected = {
        ...defaultMockWebSocket,
        status: 'connected' as const,
      };

      mockOnMessage.mockReturnValue(vi.fn());
      mockOnStatusChange.mockReturnValue(vi.fn());

      (useWebSocket as any).mockReturnValue(mockWebSocketConnected);

      render(<ChatRoom />);

      const statusIndicator = screen.getByTestId('connection-status');
      expect(statusIndicator).toHaveTextContent(/已连接/i);
    });

    it('should display disconnected status', () => {
      const mockWebSocketDisconnected = {
        ...defaultMockWebSocket,
        status: 'disconnected' as const,
      };
      (useWebSocket as any).mockReturnValue(mockWebSocketDisconnected);

      render(<ChatRoom />);

      const statusIndicator = screen.getByTestId('connection-status');
      expect(statusIndicator).toHaveTextContent(/未连接/i);
    });

    it('should display error status', () => {
      const mockWebSocketError = {
        ...defaultMockWebSocket,
        status: 'error' as const,
      };

      mockOnMessage.mockReturnValue(vi.fn());
      mockOnStatusChange.mockReturnValue(vi.fn());

      (useWebSocket as any).mockReturnValue(mockWebSocketError);

      render(<ChatRoom />);

      const statusIndicator = screen.getByTestId('connection-status');
      expect(statusIndicator).toHaveTextContent(/错误/i);
    });

    it('should update status when connection status changes', async () => {
      // This test verifies that the component reflects the WebSocket status from the hook
      // Since we're using the hook's status directly, we just need to verify
      // that different initial statuses are displayed correctly

      // Test with 'connecting' status
      const mockWebSocketConnecting = {
        ...defaultMockWebSocket,
        status: 'connecting' as const,
      };

      mockOnMessage.mockReturnValue(vi.fn());
      mockOnStatusChange.mockReturnValue(vi.fn());
      (useWebSocket as any).mockReturnValue(mockWebSocketConnecting);

      const { rerender } = render(<ChatRoom />);

      expect(screen.getByTestId('connection-status')).toHaveTextContent(/连接中/i);

      // Test with 'connected' status
      const mockWebSocketConnected = {
        ...defaultMockWebSocket,
        status: 'connected' as const,
      };

      (useWebSocket as any).mockReturnValue(mockWebSocketConnected);
      rerender(<ChatRoom />);

      expect(screen.getByTestId('connection-status')).toHaveTextContent(/已连接/i);
    });
  });

  describe('Auto-scroll Tests', () => {
    it('should auto-scroll to latest message', async () => {
      const messageHandler = vi.fn();
      mockOnStatusChange.mockReturnValue(vi.fn());
      mockOnMessage.mockImplementation((handler) => {
        messageHandler.mockImplementation(handler);
        return vi.fn();
      });

      const { container } = render(<ChatRoom />);

      const messageList = container.querySelector('[data-testid="message-list"]');
      const scrollIntoViewMock = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoViewMock;

      const registeredHandler = mockOnMessage.mock.calls[0][0];

      // Add first message
      await registeredHandler({
        type: 'user_message',
        content: 'First message',
        timestamp: '2025-01-01T00:00:00Z',
      });

      await waitFor(() => {
        expect(scrollIntoViewMock).toHaveBeenCalled();
      });

      // Add second message
      scrollIntoViewMock.mockClear();
      await registeredHandler({
        type: 'assistant_message',
        content: 'Second message',
        timestamp: '2025-01-01T00:01:00Z',
        instance_id: 'instance-1',
      });

      await waitFor(() => {
        expect(scrollIntoViewMock).toHaveBeenCalled();
      });
    });
  });

  describe('Accessibility Tests', () => {
    it('should have proper ARIA labels', () => {
      mockOnStatusChange.mockReturnValue(vi.fn());
      mockOnMessage.mockReturnValue(vi.fn());

      render(<ChatRoom />);

      const chatRoom = screen.getByTestId('chat-room');
      expect(chatRoom).toHaveAttribute('role', 'region');
      expect(chatRoom).toHaveAttribute('aria-label', '聊天室');
    });

    it('should announce new messages to screen readers', async () => {
      const messageHandler = vi.fn();
      mockOnStatusChange.mockReturnValue(vi.fn());
      mockOnMessage.mockImplementation((handler) => {
        messageHandler.mockImplementation(handler);
        return vi.fn();
      });

      render(<ChatRoom />);

      const registeredHandler = mockOnMessage.mock.calls[0][0];

      await registeredHandler({
        type: 'user_message',
        content: 'Test message',
        timestamp: '2025-01-01T00:00:00Z',
      });

      await waitFor(() => {
        const message = screen.getByTestId('message-user-0');
        expect(message).toHaveAttribute('aria-live', 'polite');
      });
    });

    it('should have keyboard navigation support', () => {
      mockOnMessage.mockReturnValue(vi.fn());
      mockOnStatusChange.mockReturnValue(vi.fn());

      render(<ChatRoom />);

      const input = screen.getByPlaceholderText('输入消息...');
      expect(input.tagName.toLowerCase()).toBe('textarea');
    });
  });

  describe('Responsive Design Tests', () => {
    it('should render correctly on mobile', () => {
      mockOnStatusChange.mockReturnValue(vi.fn());
      mockOnMessage.mockReturnValue(vi.fn());

      // Mock mobile viewport
      global.innerWidth = 375;

      render(<ChatRoom />);

      const chatRoom = screen.getByTestId('chat-room');
      expect(chatRoom).toBeInTheDocument();
    });

    it('should render correctly on tablet', () => {
      mockOnStatusChange.mockReturnValue(vi.fn());
      mockOnMessage.mockReturnValue(vi.fn());

      // Mock tablet viewport
      global.innerWidth = 768;

      render(<ChatRoom />);

      const chatRoom = screen.getByTestId('chat-room');
      expect(chatRoom).toBeInTheDocument();
    });

    it('should render correctly on desktop', () => {
      mockOnStatusChange.mockReturnValue(vi.fn());
      mockOnMessage.mockReturnValue(vi.fn());

      // Mock desktop viewport
      global.innerWidth = 1920;

      render(<ChatRoom />);

      const chatRoom = screen.getByTestId('chat-room');
      expect(chatRoom).toBeInTheDocument();
    });
  });
});
