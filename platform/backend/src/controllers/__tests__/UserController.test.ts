import 'reflect-metadata';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { UserController } from '../UserController';
import { UserRepository } from '../repositories/UserRepository';
import { AppError, ErrorCodes } from '../utils/errors';

// Mock UserRepository
jest.mock('../repositories/UserRepository');

// Mock logger
jest.mock('../config/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('UserController', () => {
  let userController: UserController;
  let mockUserRepository: jest.Mocked<UserRepository>;

  const mockUser = {
    id: 'user_123',
    feishu_user_id: 'feishu_123',
    name: 'Test User',
    email: 'test@example.com',
    avatar_url: 'https://example.com/avatar.jpg',
    created_at: new Date(),
    updated_at: new Date(),
    encrypted_access_token: 'encrypted_token',
    encrypted_refresh_token: 'encrypted_refresh',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockUserRepository = {
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      getUserInstances: jest.fn(),
    } as any;

    userController = new UserController(mockUserRepository);
  });

  describe('getCurrentUser', () => {
    it('should get current user successfully', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);

      const req = { user: mockUser };

      const result = await userController.getCurrentUser(req);

      expect(result).toEqual({
        success: true,
        data: {
          id: 'user_123',
          feishu_user_id: 'feishu_123',
          name: 'Test User',
          email: 'test@example.com',
          avatar_url: 'https://example.com/avatar.jpg',
          created_at: mockUser.created_at,
          updated_at: mockUser.updated_at,
        },
      });
      expect(mockUserRepository.findById).toHaveBeenCalledWith('user_123');
    });

    it('should throw error when user is not authenticated', async () => {
      const req = { user: null };

      await expect(userController.getCurrentUser(req)).rejects.toThrow(
        AppError
      );
    });

    it('should throw error when user not found', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      const req = { user: mockUser };

      await expect(userController.getCurrentUser(req)).rejects.toThrow(
        AppError
      );
    });

    it('should not expose sensitive tokens', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);

      const req = { user: mockUser };

      const result = await userController.getCurrentUser(req);

      expect(result.data).not.toHaveProperty('encrypted_access_token');
      expect(result.data).not.toHaveProperty('encrypted_refresh_token');
    });
  });

  describe('updateCurrentUser', () => {
    it('should update user profile successfully', async () => {
      const updatedUser = { ...mockUser, name: 'Updated Name' };
      mockUserRepository.update.mockResolvedValue(updatedUser);

      const req = { user: mockUser };
      const body = { name: 'Updated Name' };

      const result = await userController.updateCurrentUser(body, req);

      expect(result).toEqual({
        success: true,
        data: expect.objectContaining({
          name: 'Updated Name',
        }),
        message: 'Profile updated successfully',
      });
      expect(mockUserRepository.update).toHaveBeenCalledWith('user_123', {
        name: 'Updated Name',
      });
    });

    it('should update multiple fields', async () => {
      const updatedUser = {
        ...mockUser,
        name: 'Updated Name',
        email: 'updated@example.com',
      };
      mockUserRepository.update.mockResolvedValue(updatedUser);

      const req = { user: mockUser };
      const body = {
        name: 'Updated Name',
        email: 'updated@example.com',
      };

      const result = await userController.updateCurrentUser(body, req);

      expect(result.success).toBe(true);
      expect(mockUserRepository.update).toHaveBeenCalledWith('user_123', {
        name: 'Updated Name',
        email: 'updated@example.com',
      });
    });

    it('should reject invalid fields', async () => {
      const req = { user: mockUser };
      const body = {
        invalid_field: 'value',
        role: 'admin',
      };

      const result = await userController.updateCurrentUser(body, req);

      // Only valid fields should be updated
      expect(mockUserRepository.update).toHaveBeenCalledWith('user_123', {});
    });

    it('should throw error when no valid fields provided', async () => {
      const req = { user: mockUser };
      const body = {};

      await expect(
        userController.updateCurrentUser(body, req)
      ).rejects.toThrow(AppError);
    });

    it('should throw error when user is not authenticated', async () => {
      const req = { user: null };
      const body = { name: 'Updated Name' };

      await expect(
        userController.updateCurrentUser(body, req)
      ).rejects.toThrow(AppError);
    });
  });

  describe('getUserById', () => {
    it('should get user by id when user is admin', async () => {
      const adminUser = { ...mockUser, role: 'admin' };
      mockUserRepository.findById.mockResolvedValue(mockUser);

      const req = { user: adminUser };

      const result = await userController.getUserById('user_123', req);

      expect(result.success).toBe(true);
      expect(mockUserRepository.findById).toHaveBeenCalledWith('user_123');
    });

    it('should get user when requesting own profile', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);

      const req = { user: mockUser };

      const result = await userController.getUserById('user_123', req);

      expect(result.success).toBe(true);
    });

    it('should throw error when non-admin user requests other user', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);

      const req = { user: mockUser };

      await expect(
        userController.getUserById('other_user_id', req)
      ).rejects.toThrow(AppError);
    });

    it('should throw error when user not found', async () => {
      const adminUser = { ...mockUser, role: 'admin' };
      mockUserRepository.findById.mockResolvedValue(null);

      const req = { user: adminUser };

      await expect(userController.getUserById('nonexistent', req)).rejects.toThrow(
        AppError
      );
    });
  });

  describe('deleteCurrentUser', () => {
    it('should delete current user successfully', async () => {
      mockUserRepository.delete.mockResolvedValue(undefined);

      const req = { user: mockUser };

      const result = await userController.deleteCurrentUser(req);

      expect(result).toEqual({
        success: true,
        message: 'Account deleted successfully',
      });
      expect(mockUserRepository.delete).toHaveBeenCalledWith('user_123');
    });

    it('should throw error when user is not authenticated', async () => {
      const req = { user: null };

      await expect(userController.deleteCurrentUser(req)).rejects.toThrow(
        AppError
      );
    });
  });

  describe('getUserInstances', () => {
    it('should get user instances successfully', async () => {
      const mockInstances = [
        { id: 'instance_1', name: 'Instance 1' },
        { id: 'instance_2', name: 'Instance 2' },
      ];
      mockUserRepository.getUserInstances.mockResolvedValue(mockInstances);

      const req = { user: mockUser };

      const result = await userController.getUserInstances(req);

      expect(result).toEqual({
        success: true,
        data: mockInstances,
      });
      expect(mockUserRepository.getUserInstances).toHaveBeenCalledWith('user_123');
    });

    it('should throw error when user is not authenticated', async () => {
      const req = { user: null };

      await expect(userController.getUserInstances(req)).rejects.toThrow(
        AppError
      );
    });
  });
});
