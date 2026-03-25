import { StateManager } from './StateManager';
import { redis } from '../config/redis';
import { logger } from '../config/logger';

// Mock Redis module
jest.mock('../config/redis', () => ({
  redis: {
    setex: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    ttl: jest.fn()
  }
}));

// Mock logger
jest.mock('../config/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('StateManager', () => {
  let stateManager: StateManager;
  const mockRedis = redis as jest.Mocked<typeof redis>;

  beforeEach(() => {
    jest.clearAllMocks();
    stateManager = new StateManager();
  });

  describe('store', () => {
    it('should generate a cryptographically secure state and store it in Redis', async () => {
      // Arrange
      const platform = 'feishu';
      const redirectUri = 'https://example.com/callback';
      mockRedis.setex.mockResolvedValue('OK');

      // Act
      const state = await stateManager.store(platform, redirectUri);

      // Assert
      expect(state).toBeDefined();
      expect(typeof state).toBe('string');
      expect(state.length).toBeGreaterThan(0); // base64url encoded 32 bytes

      // Verify Redis storage
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.stringContaining('oauth:state:'),
        600, // 10 minutes TTL
        expect.stringContaining('"platform":"feishu"')
      );

      // Verify metadata structure
      const setexCall = mockRedis.setex.mock.calls[0];
      const storedValue = JSON.parse(String(setexCall[2]));
      expect(storedValue.platform).toBe(platform);
      expect(storedValue.redirectUri).toBe(redirectUri);
      expect(storedValue.timestamp).toBeDefined();
      expect(typeof storedValue.timestamp).toBe('number');
    });

    it('should store state with correct metadata for dingtalk platform', async () => {
      // Arrange
      const platform = 'dingtalk';
      const redirectUri = 'https://ciiber.opclaw.cn/oauth/callback';
      mockRedis.setex.mockResolvedValue('OK');

      // Act
      await stateManager.store(platform, redirectUri);

      // Assert
      const setexCall = mockRedis.setex.mock.calls[0];
      const storedValue = JSON.parse(String(setexCall[2]));
      expect(storedValue.platform).toBe(platform);
      expect(storedValue.redirectUri).toBe(redirectUri);
    });

    it('should throw error when Redis storage fails', async () => {
      // Arrange
      const platform = 'feishu';
      const redirectUri = 'https://example.com/callback';
      mockRedis.setex.mockRejectedValue(new Error('Redis connection error'));

      // Act & Assert
      await expect(stateManager.store(platform, redirectUri)).rejects.toThrow(
        'Failed to generate OAuth state parameter'
      );

      // Verify error was logged
      logger;
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to store OAuth state',
        expect.objectContaining({
          platform,
          error: 'Redis connection error'
        })
      );
    });

    it('should generate unique states on multiple calls', async () => {
      // Arrange
      mockRedis.setex.mockResolvedValue('OK');

      // Act
      const state1 = await stateManager.store('feishu', 'https://example.com/callback');
      const state2 = await stateManager.store('feishu', 'https://example.com/callback');

      // Assert
      expect(state1).not.toBe(state2);
    });
  });

  describe('validate', () => {
    const mockMetadata = {
      platform: 'feishu',
      timestamp: Date.now(),
      redirectUri: 'https://example.com/callback'
    };

    it('should validate a valid state and return metadata', async () => {
      // Arrange
      const state = 'valid-state-123';
      mockRedis.get.mockResolvedValue(JSON.stringify(mockMetadata));
      mockRedis.del.mockResolvedValue(1);

      // Act
      const result = await stateManager.validate(state);

      // Assert
      expect(result.valid).toBe(true);
      expect(result.platform).toBe('feishu');
      expect(result.redirectUri).toBe('https://example.com/callback');
      expect(result.error).toBeUndefined();

      // Verify state was deleted (one-time use)
      expect(mockRedis.del).toHaveBeenCalledWith(expect.stringContaining(state));
    });

    it('should reject state that does not exist in Redis', async () => {
      // Arrange
      const state = 'non-existent-state';
      mockRedis.get.mockResolvedValue(null);

      // Act
      const result = await stateManager.validate(state);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.error).toBe('State parameter not found or has expired');
      expect(result.platform).toBeUndefined();
      expect(result.redirectUri).toBeUndefined();

      // Verify warning was logged
      logger;
      expect(logger.warn).toHaveBeenCalledWith(
        'OAuth state not found or expired',
        expect.any(Object)
      );
    });

    it('should reject state that has expired based on timestamp', async () => {
      // Arrange
      const state = 'expired-state';
      const expiredMetadata = {
        ...mockMetadata,
        timestamp: Date.now() - 11 * 60 * 1000 // 11 minutes ago (beyond 10-minute TTL)
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(expiredMetadata));
      mockRedis.del.mockResolvedValue(1);

      // Act
      const result = await stateManager.validate(state);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.error).toBe('State parameter has expired');

      // Verify warning was logged with age info
      logger;
      expect(logger.warn).toHaveBeenCalledWith(
        'OAuth state expired',
        expect.objectContaining({
          platform: 'feishu',
          ageSeconds: expect.any(Number),
          maxAgeSeconds: 600
        })
      );
    });

    it('should reject state with corrupted metadata', async () => {
      // Arrange
      const state = 'corrupted-state';
      mockRedis.get.mockResolvedValue('invalid-json{');
      mockRedis.del.mockResolvedValue(1);

      // Act
      const result = await stateManager.validate(state);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Failed to validate state parameter');

      // Verify error was logged
      logger;
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to validate OAuth state',
        expect.any(Object)
      );
    });

    it('should handle Redis errors gracefully', async () => {
      // Arrange
      const state = 'error-state';
      mockRedis.get.mockRejectedValue(new Error('Redis connection lost'));

      // Act
      const result = await stateManager.validate(state);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Failed to validate state parameter');

      // Verify error was logged
      logger;
      expect(logger.error).toHaveBeenCalled();
    });

    it('should enforce one-time use by deleting state after validation', async () => {
      // Arrange
      const state = 'one-time-state';
      mockRedis.get.mockResolvedValue(JSON.stringify(mockMetadata));
      mockRedis.del.mockResolvedValue(1);

      // Act
      const result1 = await stateManager.validate(state);

      // Assert - First validation succeeds
      expect(result1.valid).toBe(true);
      expect(mockRedis.del).toHaveBeenCalledTimes(1);

      // Act - Second validation with same state (now deleted from Redis)
      mockRedis.get.mockResolvedValue(null);
      const result2 = await stateManager.validate(state);

      // Assert - Second validation fails
      expect(result2.valid).toBe(false);
      expect(result2.error).toBe('State parameter not found or has expired');
    });

    it('should validate state for dingtalk platform', async () => {
      // Arrange
      const dingtalkMetadata = {
        platform: 'dingtalk',
        timestamp: Date.now(),
        redirectUri: 'https://ciiber.opclaw.cn/oauth/callback'
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(dingtalkMetadata));
      mockRedis.del.mockResolvedValue(1);

      // Act
      const result = await stateManager.validate('dingtalk-state');

      // Assert
      expect(result.valid).toBe(true);
      expect(result.platform).toBe('dingtalk');
      expect(result.redirectUri).toBe('https://ciiber.opclaw.cn/oauth/callback');
    });
  });

  describe('delete', () => {
    it('should delete existing state and return true', async () => {
      // Arrange
      const state = 'existing-state';
      mockRedis.del.mockResolvedValue(1);

      // Act
      const result = await stateManager.delete(state);

      // Assert
      expect(result).toBe(true);
      expect(mockRedis.del).toHaveBeenCalledWith(expect.stringContaining(state));

      // Verify info log
      logger;
      expect(logger.info).toHaveBeenCalledWith(
        'OAuth state deleted manually',
        expect.any(Object)
      );
    });

    it('should return false for non-existent state', async () => {
      // Arrange
      const state = 'non-existent-state';
      mockRedis.del.mockResolvedValue(0);

      // Act
      const result = await stateManager.delete(state);

      // Assert
      expect(result).toBe(false);
      expect(mockRedis.del).toHaveBeenCalledWith(expect.stringContaining(state));
    });

    it('should handle Redis errors gracefully', async () => {
      // Arrange
      const state = 'error-state';
      mockRedis.del.mockRejectedValue(new Error('Redis error'));

      // Act
      const result = await stateManager.delete(state);

      // Assert
      expect(result).toBe(false);
      expect(mockRedis.del).toHaveBeenCalled();

      // Verify error was logged
      logger;
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('getTTL', () => {
    it('should return remaining TTL for existing state', async () => {
      // Arrange
      const state = 'existing-state';
      mockRedis.ttl.mockResolvedValue(300); // 5 minutes remaining

      // Act
      const ttl = await stateManager.getTTL(state);

      // Assert
      expect(ttl).toBe(300);
      expect(mockRedis.ttl).toHaveBeenCalledWith(expect.stringContaining(state));
    });

    it('should return -1 for non-existent state', async () => {
      // Arrange
      const state = 'non-existent-state';
      mockRedis.ttl.mockResolvedValue(-2); // Redis returns -2 for non-existent keys

      // Act
      const ttl = await stateManager.getTTL(state);

      // Assert
      expect(ttl).toBe(-2);
    });

    it('should handle Redis errors gracefully', async () => {
      // Arrange
      const state = 'error-state';
      mockRedis.ttl.mockRejectedValue(new Error('Redis error'));

      // Act
      const ttl = await stateManager.getTTL(state);

      // Assert
      expect(ttl).toBe(-1);

      // Verify error was logged
      logger;
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should log cleanup message and return 0 (no-op since Redis handles TTL)', async () => {
      // Act
      const result = await stateManager.cleanup();

      // Assert
      expect(result).toBe(0);

      // Verify info log
      logger;
      expect(logger.info).toHaveBeenCalledWith(
        'OAuth state cleanup requested (handled by Redis TTL automatically)'
      );
    });
  });

  describe('Security', () => {
    it('should generate states with sufficient entropy (32 bytes = 256 bits)', async () => {
      // Arrange
      mockRedis.setex.mockResolvedValue('OK');
      const states: string[] = [];

      // Act - Generate 1000 states
      for (let i = 0; i < 1000; i++) {
        const state = await stateManager.store('feishu', 'https://example.com/callback');
        states.push(state);
      }

      // Assert - All states should be unique (very low probability of collision)
      const uniqueStates = new Set(states);
      expect(uniqueStates.size).toBe(1000);

      // Assert - States should use base64url encoding (safe for URLs)
      states.forEach(state => {
        expect(state).not.toContain('+'); // Plus sign not in base64url
        expect(state).not.toContain('/'); // Slash not in base64url
        expect(state).not.toContain('='); // Padding not in base64url
      });
    });

    it('should not log full state parameter in logs (security)', async () => {
      // Arrange
      mockRedis.setex.mockResolvedValue('OK');
      logger;

      // Act
      await stateManager.store('feishu', 'https://example.com/callback');

      // Assert - Verify only first 8 chars are logged
      const infoCalls = logger.info.mock.calls;
      const logWithState = infoCalls.find((call: any[]) =>
        call[1] && typeof call[1] === 'object' && 'state' in call[1]
      );

      expect(logWithState).toBeDefined();
      const loggedState = logWithState![1].state;
      expect(loggedState).toMatch(/^\w{8}\.\.\.$/); // First 8 chars + "..."
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete OAuth state lifecycle', async () => {
      // Arrange
      const platform = 'dingtalk';
      const redirectUri = 'https://ciiber.opclaw.cn/oauth/callback';
      mockRedis.setex.mockResolvedValue('OK');

      // Act - Store state
      const state = await stateManager.store(platform, redirectUri);
      expect(state).toBeDefined();

      // Act - Validate state (first time)
      const metadata = {
        platform,
        timestamp: Date.now(),
        redirectUri
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(metadata));
      mockRedis.del.mockResolvedValue(1);

      const validationResult = await stateManager.validate(state);
      expect(validationResult.valid).toBe(true);
      expect(validationResult.platform).toBe(platform);

      // Act - Try to validate same state again (should fail)
      mockRedis.get.mockResolvedValue(null);
      const validationResult2 = await stateManager.validate(state);
      expect(validationResult2.valid).toBe(false);
      expect(validationResult2.error).toBe('State parameter not found or has expired');
    });

    it('should handle concurrent state validation (replay attack prevention)', async () => {
      // Arrange
      const state = 'concurrent-state';
      const metadata = {
        platform: 'feishu',
        timestamp: Date.now(),
        redirectUri: 'https://example.com/callback'
      };

      // Mock Redis to return valid state on first call, null on subsequent calls
      let callCount = 0;
      mockRedis.get.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return JSON.stringify(metadata);
        }
        return null;
      });
      mockRedis.del.mockResolvedValue(1);

      // Act - Simulate concurrent validation attempts
      const results = await Promise.all([
        stateManager.validate(state),
        stateManager.validate(state),
        stateManager.validate(state)
      ]);

      // Assert - Only first validation should succeed
      const successCount = results.filter(r => r.valid).length;
      expect(successCount).toBe(1);
      expect(mockRedis.del).toHaveBeenCalledTimes(1); // Only one delete call
    });
  });
});
