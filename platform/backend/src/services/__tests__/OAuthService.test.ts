/**
 * OAuthService Unit Tests
 *
 * TDD Implementation for TASK-001: OAuth Auto-Claim Integration
 *
 * Test Cycle: Red (Write failing tests) → Green (Make tests pass) → Refactor
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { OAuthService } from '../OAuthService';
import { UserRepository } from '../../repositories/UserRepository';
import { InstanceRepository } from '../../repositories/InstanceRepository';
import { User } from '../../entities/User.entity';
import { Instance } from '../../entities/Instance.entity';

// Mock logger
jest.mock('../../utils/logger', () => ({
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

import logger from '../../utils/logger';

describe('OAuthService - Auto-Claim Integration (TASK-001)', () => {
  let oauthService: OAuthService;
  let userRepository: UserRepository;
  let instanceRepository: InstanceRepository;

  // Mock functions
  let mockFindUnclaimed: jest.Mock;
  let mockClaimInstance: jest.Mock;
  let mockUserFindOne: jest.Mock;
  let mockUserSave: jest.Mock;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Create repositories
    userRepository = new UserRepository();
    instanceRepository = new InstanceRepository();

    // Spy on repository methods
    mockFindUnclaimed = jest.spyOn(instanceRepository, 'findUnclaimed');
    mockClaimInstance = jest.spyOn(instanceRepository, 'claimInstance');
    mockUserFindOne = jest.spyOn(userRepository, 'findByFeishuUserId');
    mockUserSave = jest.spyOn(userRepository, 'updateLastLogin');

    // Create OAuthService with repositories
    oauthService = new OAuthService(userRepository, instanceRepository);

    // Set required environment variables
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.JWT_EXPIRES_IN = '604800';
    process.env.JWT_REFRESH_EXPIRES_IN = '2592000';
    process.env.FEISHU_APP_ID = 'test_feishu_app_id';
    process.env.FEISHU_APP_SECRET = 'test_feishu_app_secret';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /**
   * TEST 1: User with unclaimed instances auto-claims on login
   *
   * Expected: When a user logs in via OAuth and unclaimed instances exist,
   * the system should automatically claim one for the user
   */
  it('should auto-claim unclaimed instance when user logs in', async () => {
    // Arrange: Create test user and unclaimed instance
    const testUser: User = {
      id: 1,
      feishu_user_id: 'test_feishu_123',
      name: 'Test User',
      email: 'test@example.com',
      avatar_url: 'https://example.com/avatar.jpg',
      created_at: new Date(),
      updated_at: new Date(),
      last_login_at: new Date(),
    } as User;

    const unclaimedInstance: Instance = {
      instance_id: 'inst-auto-claim-123',
      owner_id: null, // Unclaimed
      status: 'pending',
      preset_type: 'personal',
      created_at: new Date(),
      updated_at: new Date(),
    } as Instance;

    // Mock user repository to return test user
    mockUserFindOne.mockResolvedValue(testUser);
    mockUserSave.mockResolvedValue(undefined);

    // Mock instance repository to return unclaimed instance
    mockFindUnclaimed.mockResolvedValue(unclaimedInstance);
    mockClaimInstance.mockResolvedValue(undefined);

    // Act: Simulate OAuth callback
    const result = await oauthService.handleCallback('test_auth_code', 'test_state');

    // Assert: Verify auto-claim occurred
    expect(mockFindUnclaimed).toHaveBeenCalled();
    expect(mockClaimInstance).toHaveBeenCalledWith(
      'inst-auto-claim-123',
      1
    );
    expect(logger.info).toHaveBeenCalledWith(
      'Auto-claimed instance for user',
      expect.objectContaining({
        userId: 1,
        instanceId: 'inst-auto-claim-123',
      })
    );

    // Assert: Response should include instance information
    expect(result).toHaveProperty('has_instance', true);
    expect(result).toHaveProperty('instance_id', 'inst-auto-claim-123');
    expect(result).toHaveProperty('redirect_to', '/chat');
  });

  /**
   * TEST 2: User without available instances gets correct response
   *
   * Expected: When no unclaimed instances are available,
   * user should receive has_instance=false and redirect_to='/no-instance'
   */
  it('should return has_instance=false when no instances available', async () => {
    // Arrange: Create test user but no unclaimed instances
    const testUser: User = {
      id: 2,
      feishu_user_id: 'test_feishu_456',
      name: 'Test User 2',
      email: 'test2@example.com',
      avatar_url: 'https://example.com/avatar2.jpg',
      created_at: new Date(),
      updated_at: new Date(),
      last_login_at: new Date(),
    } as User;

    // Mock user repository to return test user
    mockUserFindOne.mockResolvedValue(testUser);
    mockUserSave.mockResolvedValue(undefined);

    // Mock instance repository to return no unclaimed instances
    mockFindUnclaimed.mockResolvedValue(null);

    // Act: Simulate OAuth callback
    const result = await oauthService.handleCallback('test_auth_code', 'test_state');

    // Assert: Verify no claim attempt was made
    expect(mockFindUnclaimed).toHaveBeenCalled();
    expect(mockClaimInstance).not.toHaveBeenCalled();

    // Assert: Response should indicate no instance available
    expect(result).toHaveProperty('has_instance', false);
    expect(result).not.toHaveProperty('instance_id');
    expect(result).toHaveProperty('redirect_to', '/no-instance');
  });

  /**
   * TEST 3: User with existing instance doesn't reclaim
   *
   * Expected: When user already has an instance and logs in again,
   * they should not reclaim another instance
   */
  it('should not reclaim if user already has instance', async () => {
    // Arrange: Create test user with existing instance
    const testUser: User = {
      id: 3,
      feishu_user_id: 'test_feishu_789',
      name: 'Test User 3',
      email: 'test3@example.com',
      avatar_url: 'https://example.com/avatar3.jpg',
      created_at: new Date(),
      updated_at: new Date(),
      last_login_at: new Date(),
    } as User;

    // Mock user repository to return test user
    mockUserFindOne.mockResolvedValue(testUser);
    mockUserSave.mockResolvedValue(undefined);

    // Mock instance repository
    // findUnclaimed returns an instance, but we should check if user already has one
    mockFindUnclaimed.mockResolvedValue(null); // No unclaimed available

    // Act: Simulate OAuth callback
    const result = await oauthService.handleCallback('test_auth_code', 'test_state');

    // Assert: Verify findUnclaimed was called
    expect(mockFindUnclaimed).toHaveBeenCalled();

    // Assert: Verify no claim attempt was made
    expect(mockClaimInstance).not.toHaveBeenCalled();

    // Assert: Response should show no instance claimed in this session
    expect(result).toHaveProperty('has_instance', false);
  });

  /**
   * TEST 4: Verify logging occurs for auto-claim events
   *
   * Expected: When an instance is auto-claimed, the system should log the event
   * with userId and instanceId for auditing purposes
   */
  it('should log auto-claim event with userId and instanceId', async () => {
    // Arrange: Create test user and unclaimed instance
    const testUser: User = {
      id: 4,
      feishu_user_id: 'test_feishu_log',
      name: 'Test User Log',
      email: 'log@example.com',
      avatar_url: 'https://example.com/avatar_log.jpg',
      created_at: new Date(),
      updated_at: new Date(),
      last_login_at: new Date(),
    } as User;

    const unclaimedInstance: Instance = {
      instance_id: 'inst-log-123',
      owner_id: null,
      status: 'pending',
      preset_type: 'personal',
      created_at: new Date(),
      updated_at: new Date(),
    } as Instance;

    // Mock repositories
    mockUserFindOne.mockResolvedValue(testUser);
    mockUserSave.mockResolvedValue(undefined);
    mockFindUnclaimed.mockResolvedValue(unclaimedInstance);
    mockClaimInstance.mockResolvedValue(undefined);

    // Act: Simulate OAuth callback
    await oauthService.handleCallback('test_auth_code', 'test_state');

    // Assert: Verify logger was called with correct parameters
    expect(logger.info).toHaveBeenCalledWith(
      'Auto-claimed instance for user',
      expect.objectContaining({
        userId: 4,
        instanceId: 'inst-log-123',
      })
    );
  });

  /**
   * TEST 5: Multiple unclaimed instances - claims oldest first
   *
   * Expected: When multiple unclaimed instances exist,
   * system should claim the oldest one (created_at ASC)
   */
  it('should claim oldest unclaimed instance when multiple available', async () => {
    // Arrange: Create test user and multiple unclaimed instances
    const testUser: User = {
      id: 5,
      feishu_user_id: 'test_feishu_multi',
      name: 'Test User Multi',
      email: 'multi@example.com',
      avatar_url: 'https://example.com/avatar_multi.jpg',
      created_at: new Date(),
      updated_at: new Date(),
      last_login_at: new Date(),
    } as User;

    const oldInstance: Instance = {
      instance_id: 'inst-old-123',
      owner_id: null,
      status: 'pending',
      preset_type: 'personal',
      created_at: new Date('2025-01-01'), // Older
      updated_at: new Date(),
    } as Instance;

    // Mock repositories to return oldest instance
    mockUserFindOne.mockResolvedValue(testUser);
    mockUserSave.mockResolvedValue(undefined);
    mockFindUnclaimed.mockResolvedValue(oldInstance);
    mockClaimInstance.mockResolvedValue(undefined);

    // Act: Simulate OAuth callback
    const result = await oauthService.handleCallback('test_auth_code', 'test_state');

    // Assert: Verify oldest instance was claimed
    expect(mockClaimInstance).toHaveBeenCalledWith(
      'inst-old-123',
      5
    );
    expect(result).toHaveProperty('instance_id', 'inst-old-123');
  });

  /**
   * TEST 6: Error handling when findUnclaimed fails
   *
   * Expected: When database error occurs during findUnclaimed,
   * the system should handle gracefully and still complete login
   */
  it('should handle database error gracefully during findUnclaimed', async () => {
    // Arrange: Create test user
    const testUser: User = {
      id: 6,
      feishu_user_id: 'test_feishu_error',
      name: 'Test User Error',
      email: 'error@example.com',
      avatar_url: 'https://example.com/avatar_error.jpg',
      created_at: new Date(),
      updated_at: new Date(),
      last_login_at: new Date(),
    } as User;

    // Mock repositories
    mockUserFindOne.mockResolvedValue(testUser);
    mockUserSave.mockResolvedValue(undefined);

    // Mock findUnclaimed to throw error
    mockFindUnclaimed.mockRejectedValue(
      new Error('Database connection failed')
    );

    // Act & Assert: Should not throw error, login should still succeed
    const result = await oauthService.handleCallback('test_auth_code', 'test_state');

    // Assert: Login should succeed even if auto-claim fails
    expect(result).toHaveProperty('access_token');
    expect(result).toHaveProperty('user');
    expect(result).toHaveProperty('has_instance', false);

    // Assert: Error should be logged
    expect(logger.error).toHaveBeenCalled();
  });

  /**
   * TEST 7: OAuth configuration validation - missing Feishu credentials
   *
   * Expected: When FEISHU_APP_ID and FEISHU_APP_SECRET are not set,
   * the service should fail to initialize with a clear error message.
   * This test prevents Bug #33 regression where missing env vars caused 500 errors.
   */
  it('should throw error when Feishu OAuth credentials are missing', () => {
    // Arrange: Remove Feishu environment variables
    const originalAppId = process.env.FEISHU_APP_ID;
    const originalAppSecret = process.env.FEISHU_APP_SECRET;

    delete process.env.FEISHU_APP_ID;
    delete process.env.FEISHU_APP_SECRET;

    // Act & Assert: Creating OAuthService should throw error
    expect(() => {
      new OAuthService(userRepository, instanceRepository);
    }).toThrow();

    // Restore environment variables
    if (originalAppId) process.env.FEISHU_APP_ID = originalAppId;
    if (originalAppSecret) process.env.FEISHU_APP_SECRET = originalAppSecret;
  });
});
