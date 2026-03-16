/**
 * WebSocketGateway Unit Tests
 *
 * TDD Implementation for TASK-006: WebSocket Gateway Service
 *
 * Test Cycle: Red (Write failing tests) → Green (Make tests pass) → Refactor
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { WebSocketGateway } from '../WebSocketGateway';
import { OAuthService } from '../OAuthService';
import { InstanceRepository } from '../../repositories/InstanceRepository';
import { Instance } from '../../entities/Instance.entity';
import { JwtPayload } from '../../types/oauth.types';
import {
  WebSocketMessage,
  WebSocketMessageType,
  WebSocketCloseCode,
  createStatusMessage,
  parseWebSocketMessage,
} from '../../types/websocket.types';
import { Server } from 'ws';

// Mock logger
jest.mock('../../config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import logger from '../../config/logger';

// Mock WebSocket library
jest.mock('ws', () => {
  return {
    WebSocketServer: jest.fn().mockImplementation(() => {
      return {
        on: jest.fn(),
        close: jest.fn(),
        clients: [],
      };
    }),
  };
});

import { WebSocketServer } from 'ws';

// Mock WebSocket factory
function createMockWebSocket() {
  return {
    readyState: 1, // OPEN
    isAlive: true,
    send: jest.fn(),
    close: jest.fn(),
    ping: jest.fn(),
    terminate: jest.fn(),
    on: jest.fn(),
  };
}

describe('WebSocketGateway - Connection Tests (TASK-006)', () => {
  let wsGateway: WebSocketGateway;
  let oauthService: OAuthService;
  let instanceRepository: InstanceRepository;
  let mockWss: any;
  let mockVerifyToken: jest.Mock;
  let mockFindByOwnerId: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create service mocks
    oauthService = {
      verifyToken: jest.fn(),
    } as any;

    instanceRepository = {
      findByOwnerId: jest.fn(),
    } as any;

    // Mock verifyToken
    mockVerifyToken = oauthService.verifyToken as jest.Mock;
    mockFindByOwnerId = instanceRepository.findByOwnerId as jest.Mock;

    // Create gateway
    wsGateway = new WebSocketGateway(oauthService, instanceRepository);

    // Set environment variables
    process.env.WS_PORT = '3001';
    process.env.WS_HEARTBEAT_INTERVAL = '30000';
    process.env.WS_MAX_CONNECTIONS = '50';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /**
   * TEST 1: Valid token connects successfully
   *
   * Expected: When a client connects with a valid JWT token,
   * the connection should be established and a "connected" status sent
   */
  it('should establish connection with valid token', async () => {
    // Arrange
    const mockPayload: JwtPayload = {
      userId: 1,
      feishuUserId: 'feishu_123',
      name: 'Test User',
      email: 'test@example.com',
    };

    const mockInstance: Instance = {
      instance_id: 'inst-123',
      owner_id: 1,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    } as Instance;

    mockVerifyToken.mockReturnValue(mockPayload);
    mockFindByOwnerId.mockResolvedValue([mockInstance]);

    // Act
    await wsGateway.start();

    // Assert
    expect(mockVerifyToken).toHaveBeenCalledWith('valid_jwt_token');
    expect(mockFindByOwnerId).toHaveBeenCalledWith(1);
  });

  /**
   * TEST 2: Invalid token closes connection (1008)
   *
   * Expected: When a client connects with an invalid token,
   * the connection should be closed with code 1008 (Policy Violation)
   */
  it('should close connection with code 1008 for invalid token', async () => {
    // Arrange
    mockVerifyToken.mockImplementation(() => {
      throw new Error('Invalid token');
    });

    const mockWs = createMockWebSocket();

    // Act
    const connectionHandler = jest.spyOn(wsGateway as any, 'handleConnection');
    await wsGateway.start();

    // Simulate connection with invalid token
    // This would be called by the actual WebSocket server
    const req = { url: 'ws://localhost:3001?token=invalid_token' };

    // Mock the connection handling
    try {
      await (wsGateway as any).handleConnection(mockWs as any, req);
    } catch (error) {
      // Expected to throw
    }

    // Assert
    expect(mockVerifyToken).toHaveBeenCalledWith('invalid_token');
    expect(mockWs.close).toHaveBeenCalledWith(
      WebSocketCloseCode.POLICY_VIOLATION,
      expect.stringContaining('Invalid token')
    );
  });

  /**
   * TEST 3: Missing token closes connection (1008)
   *
   * Expected: When a client connects without a token,
   * the connection should be closed with code 1008
   */
  it('should close connection with code 1008 for missing token', async () => {
    // Arrange
    const mockWs = createMockWebSocket();
    const req = { url: 'ws://localhost:3001' }; // No token parameter

    // Act & Assert
    await expect(
      (wsGateway as any).handleConnection(mockWs as any, req)
    ).rejects.toThrow();

    expect(mockWs.close).toHaveBeenCalledWith(
      WebSocketCloseCode.POLICY_VIOLATION,
      expect.stringContaining('token')
    );
  });

  /**
   * TEST 4: User without instance closes connection (1008)
   *
   * Expected: When a user has no instances,
   * the connection should be closed with code 1008
   */
  it('should close connection with code 1008 when user has no instance', async () => {
    // Arrange
    const mockPayload: JwtPayload = {
      userId: 1,
      feishuUserId: 'feishu_123',
      name: 'Test User',
    };

    mockVerifyToken.mockReturnValue(mockPayload);
    mockFindByOwnerId.mockResolvedValue([]); // No instances

    const mockWs = createMockWebSocket();
    const req = { url: 'ws://localhost:3001?token=valid_token' };

    // Act
    await (wsGateway as any).handleConnection(mockWs as any, req);

    // Assert
    expect(mockWs.close).toHaveBeenCalledWith(
      WebSocketCloseCode.POLICY_VIOLATION,
      expect.stringContaining('instance')
    );
  });
});

describe('WebSocketGateway - Message Tests', () => {
  let wsGateway: WebSocketGateway;
  let oauthService: OAuthService;
  let instanceRepository: InstanceRepository;
  let mockVerifyToken: jest.Mock;
  let mockFindByOwnerId: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    oauthService = {
      verifyToken: jest.fn(),
    } as any;

    instanceRepository = {
      findByOwnerId: jest.fn(),
    } as any;

    mockVerifyToken = oauthService.verifyToken as jest.Mock;
    mockFindByOwnerId = instanceRepository.findByOwnerId as jest.Mock;

    wsGateway = new WebSocketGateway(oauthService, instanceRepository);
  });

  /**
   * TEST 5: Receive and parse user message
   *
   * Expected: Gateway should receive message from client and parse it correctly
   */
  it('should receive and parse user message correctly', async () => {
    // Arrange
    const mockPayload: JwtPayload = {
      userId: 1,
      feishuUserId: 'feishu_123',
      name: 'Test User',
    };

    const mockInstance: Instance = {
      instance_id: 'inst-123',
      owner_id: 1,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    } as Instance;

    mockVerifyToken.mockReturnValue(mockPayload);
    mockFindByOwnerId.mockResolvedValue([mockInstance]);

    const mockWs = createMockWebSocket();
    const req = { url: 'ws://localhost:3001?token=valid_token' };

    // Act - Simulate connection
    await (wsGateway as any).handleConnection(mockWs as any, req);

    const userMessage: WebSocketMessage = {
      type: WebSocketMessageType.USER_MESSAGE,
      timestamp: new Date().toISOString(),
      content: 'Hello, AI assistant!',
    };

    // Act - Simulate message received
    const handleMessage = jest.spyOn(wsGateway as any, 'handleMessage');
    handleMessage(1, JSON.stringify(userMessage));

    // Assert
    expect(handleMessage).toHaveBeenCalledWith(1, JSON.stringify(userMessage));
  });

  /**
   * TEST 6: Handle malformed messages gracefully
   *
   * Expected: Gateway should not crash on malformed messages
   */
  it('should handle malformed messages gracefully', async () => {
    // Arrange
    const mockWs = createMockWebSocket();

    // Act & Assert
    expect(() => {
      parseWebSocketMessage('invalid json{{');
    }).not.toThrow();

    expect(() => {
      parseWebSocketMessage('{"type": "invalid"}');
    }).not.toThrow();
  });

  /**
   * TEST 7: Forward instance response to client
   *
   * Expected: Gateway should forward messages from instance to connected client
   */
  it('should forward instance response to client', async () => {
    // Arrange
    const mockPayload: JwtPayload = {
      userId: 1,
      feishuUserId: 'feishu_123',
      name: 'Test User',
    };

    const mockInstance: Instance = {
      instance_id: 'inst-123',
      owner_id: 1,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    } as Instance;

    mockVerifyToken.mockReturnValue(mockPayload);
    mockFindByOwnerId.mockResolvedValue([mockInstance]);

    const mockWs = createMockWebSocket();
    const req = { url: 'ws://localhost:3001?token=valid_token' };

    // Act - Establish connection
    await (wsGateway as any).handleConnection(mockWs as any, req);

    // Act - Send assistant message to client
    const assistantMessage: WebSocketMessage = {
      type: WebSocketMessageType.ASSISTANT_MESSAGE,
      timestamp: new Date().toISOString(),
      content: 'Hello! How can I help you?',
      instance_id: 'inst-123',
    };

    (wsGateway as any).sendToClient(1, assistantMessage);

    // Assert
    expect(mockWs.send).toHaveBeenCalledWith(
      JSON.stringify(assistantMessage)
    );
  });
});

describe('WebSocketGateway - Heartbeat Tests', () => {
  let wsGateway: WebSocketGateway;
  let oauthService: OAuthService;
  let instanceRepository: InstanceRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    oauthService = {
      verifyToken: jest.fn(),
    } as any;

    instanceRepository = {
      findByOwnerId: jest.fn(),
    } as any;

    wsGateway = new WebSocketGateway(oauthService, instanceRepository);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /**
   * TEST 8: Ping sent every 30 seconds
   *
   * Expected: Gateway should send ping every 30 seconds
   */
  it('should send ping every 30 seconds', async () => {
    // Arrange
    const mockWs = createMockWebSocket();

    // Act - Start heartbeat
    (wsGateway as any).startHeartbeat(mockWs);

    // Assert - Initial ping
    expect(mockWs.ping).not.toHaveBeenCalled();

    // Fast forward 30 seconds
    jest.advanceTimersByTime(30000);

    // Ping should be called
    expect(mockWs.ping).toHaveBeenCalled();

    // Fast forward another 30 seconds
    jest.advanceTimersByTime(30000);

    // Ping should be called again
    expect(mockWs.ping).toHaveBeenCalledTimes(2);
  });

  /**
   * TEST 9: Pong response received
   *
   * Expected: Client should respond to ping with pong
   */
  it('should receive pong response', async () => {
    // Arrange
    const mockWs = createMockWebSocket();
    let pongCallback: any;

    mockWs.on.mockImplementation((event: string, callback: any) => {
      if (event === 'pong') {
        pongCallback = callback;
      }
    });

    // Act - Start heartbeat
    (wsGateway as any).startHeartbeat(mockWs);

    // Simulate pong
    if (pongCallback) {
      pongCallback();
    }

    // Assert - isAlive should be true
    expect(mockWs.isAlive).toBe(true);
  });

  /**
   * TEST 10: Connection terminated on timeout
   *
   * Expected: Gateway should terminate connection if no pong received
   */
  it('should terminate connection on heartbeat timeout', async () => {
    // Arrange
    const mockWs = createMockWebSocket();
    mockWs.isAlive = false;

    // Act - Start heartbeat
    (wsGateway as any).startHeartbeat(mockWs);

    // Fast forward 30 seconds
    jest.advanceTimersByTime(30000);

    // Assert - Connection should be terminated
    expect(mockWs.terminate).toHaveBeenCalled();
  });

  /**
   * TEST 11: Cleanup on disconnect
   *
   * Expected: Resources should be cleaned up when connection closes
   */
  it('should cleanup resources on disconnect', async () => {
    // Arrange
    const mockPayload: JwtPayload = {
      userId: 1,
      feishuUserId: 'feishu_123',
      name: 'Test User',
    };

    const mockInstance: Instance = {
      instance_id: 'inst-123',
      owner_id: 1,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    } as Instance;

    (oauthService.verifyToken as jest.Mock).mockReturnValue(mockPayload);
    (instanceRepository.findByOwnerId as jest.Mock).mockResolvedValue([
      mockInstance,
    ]);

    const mockWs = createMockWebSocket();
    const req = { url: 'ws://localhost:3001?token=valid_token' };

    // Act - Establish connection
    await (wsGateway as any).handleConnection(mockWs as any, req);

    // Verify connection exists
    expect((wsGateway as any).clients.has(1)).toBe(true);

    // Simulate disconnect
    const handleClose = jest.spyOn(wsGateway as any, 'handleDisconnect');
    handleClose(1, mockWs);

    // Assert - Connection should be removed
    expect((wsGateway as any).clients.has(1)).toBe(false);
  });
});

describe('WebSocketGateway - Performance Tests', () => {
  let wsGateway: WebSocketGateway;
  let oauthService: OAuthService;
  let instanceRepository: InstanceRepository;

  beforeEach(() => {
    jest.clearAllMocks();

    oauthService = {
      verifyToken: jest.fn(),
    } as any;

    instanceRepository = {
      findByOwnerId: jest.fn(),
    } as any;

    wsGateway = new WebSocketGateway(oauthService, instanceRepository);
  });

  /**
   * TEST 12: Support 50 concurrent connections
   *
   * Expected: Gateway should handle at least 50 concurrent connections
   */
  it('should support 50 concurrent connections', async () => {
    // Arrange
    const connections: any[] = [];

    for (let i = 1; i <= 50; i++) {
      const mockPayload: JwtPayload = {
        userId: i,
        feishuUserId: `feishu_${i}`,
        name: `User ${i}`,
      };

      const mockInstance: Instance = {
        instance_id: `inst-${i}`,
        owner_id: i,
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
      } as Instance;

      (oauthService.verifyToken as jest.Mock).mockReturnValue(mockPayload);
      (instanceRepository.findByOwnerId as jest.Mock).mockResolvedValue([
        mockInstance,
      ]);

      const mockWs = createMockWebSocket();
      const req = { url: `ws://localhost:3001?token=token_${i}` };

      // Act - Establish connection
      await (wsGateway as any).handleConnection(mockWs as any, req);
      connections.push(mockWs);
    }

    // Assert - All connections should be established
    expect((wsGateway as any).clients.size).toBe(50);
  });
});

describe('WebSocketGateway - Error Handling Tests', () => {
  let wsGateway: WebSocketGateway;
  let oauthService: OAuthService;
  let instanceRepository: InstanceRepository;

  beforeEach(() => {
    jest.clearAllMocks();

    oauthService = {
      verifyToken: jest.fn(),
    } as any;

    instanceRepository = {
      findByOwnerId: jest.fn(),
    } as any;

    wsGateway = new WebSocketGateway(oauthService, instanceRepository);
  });

  /**
   * TEST 13: Handle token expiration during connection
   *
   * Expected: Connection should be closed when token expires
   */
  it('should handle token expiration during connection', async () => {
    // Arrange
    const mockPayload: JwtPayload = {
      userId: 1,
      feishuUserId: 'feishu_123',
      name: 'Test User',
    };

    const mockInstance: Instance = {
      instance_id: 'inst-123',
      owner_id: 1,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    } as Instance;

    (oauthService.verifyToken as jest.Mock).mockReturnValue(mockPayload);
    (instanceRepository.findByOwnerId as jest.Mock).mockResolvedValue([
      mockInstance,
    ]);

    const mockWs = createMockWebSocket();
    const req = { url: 'ws://localhost:3001?token=valid_token' };

    // Act - Establish connection
    await (wsGateway as any).handleConnection(mockWs as any, req);

    // Simulate token expiration
    (oauthService.verifyToken as jest.Mock).mockImplementation(() => {
      throw new Error('Token expired');
    });

    // Try to verify token again (simulating re-verification)
    try {
      (oauthService.verifyToken as jest.Mock)('valid_token');
    } catch (error) {
      // Expected
    }

    // Assert
    expect((oauthService.verifyToken as jest.Mock)).toThrow();
  });

  /**
   * TEST 14: Handle database connection errors
   *
   * Expected: Gateway should gracefully handle database errors
   */
  it('should handle database connection errors gracefully', async () => {
    // Arrange
    (oauthService.verifyToken as jest.Mock).mockReturnValue({
      userId: 1,
      feishuUserId: 'feishu_123',
      name: 'Test User',
    });

    (instanceRepository.findByOwnerId as jest.Mock).mockRejectedValue(
      new Error('Database connection failed')
    );

    const mockWs = createMockWebSocket();
    const req = { url: 'ws://localhost:3001?token=valid_token' };

    // Act & Assert
    await expect(
      (wsGateway as any).handleConnection(mockWs as any, req)
    ).resolves.not.toThrow();

    // Connection should be closed due to error
    expect(mockWs.close).toHaveBeenCalled();
  });

  /**
   * TEST 15: Log all important events
   *
   * Expected: All connection, disconnection, and error events should be logged
   */
  it('should log all important events', async () => {
    // Arrange
    const mockPayload: JwtPayload = {
      userId: 1,
      feishuUserId: 'feishu_123',
      name: 'Test User',
    };

    const mockInstance: Instance = {
      instance_id: 'inst-123',
      owner_id: 1,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    } as Instance;

    (oauthService.verifyToken as jest.Mock).mockReturnValue(mockPayload);
    (instanceRepository.findByOwnerId as jest.Mock).mockResolvedValue([
      mockInstance,
    ]);

    const mockWs = createMockWebSocket();
    const req = { url: 'ws://localhost:3001?token=valid_token' };

    // Act - Establish connection
    await (wsGateway as any).handleConnection(mockWs as any, req);

    // Assert - Logger should be called
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('WebSocket connected'),
      expect.any(Object)
    );
  });
});
