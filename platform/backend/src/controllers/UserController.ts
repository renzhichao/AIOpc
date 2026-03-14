import { Controller, Get, Post, Put, Delete, Body, Param, Req } from 'routing-controllers';
import { Service } from 'typedi';
import { UserRepository } from '../repositories/UserRepository';
import { InstanceRepository } from '../repositories/InstanceRepository';
import { logger } from '../config/logger';
import { AppError, ErrorCodes } from '../utils/errors';

/**
 * User Controller
 *
 * RESTful API endpoints for user management.
 */
@Controller('/users')
export class UserController {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly instanceRepository: InstanceRepository
  ) {}

  /**
   * Get current user profile
   * GET /api/users/me
   */
  @Get('/me')
  async getCurrentUser(@Req() req: any) {
    try {
      const user = req.user;

      if (!user || !user.id) {
        throw new AppError(
          ErrorCodes.UNAUTHORIZED.statusCode,
          ErrorCodes.UNAUTHORIZED.code,
          'User not authenticated'
        );
      }

      const userProfile = await this.userRepository.findById(user.id);

      if (!userProfile) {
        throw new AppError(
          ErrorCodes.NOT_FOUND.statusCode,
          ErrorCodes.NOT_FOUND.code,
          'User not found'
        );
      }

      // Remove sensitive information
      const { encrypted_access_token, encrypted_refresh_token, ...safeUser } = userProfile as any;

      return {
        success: true,
        data: safeUser
      };
    } catch (error) {
      logger.error('Failed to get current user', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        ErrorCodes.INTERNAL_ERROR.statusCode,
        ErrorCodes.INTERNAL_ERROR.code,
        'Failed to get user profile'
      );
    }
  }

  /**
   * Update current user profile
   * PUT /api/users/me
   *
   * Request body:
   * {
   *   "name": "New Name",
   *   "email": "new@example.com",
   *   "avatar_url": "https://..."
   * }
   */
  @Put('/me')
  async updateCurrentUser(@Body() body: any, @Req() req: any) {
    try {
      const user = req.user;

      if (!user || !user.id) {
        throw new AppError(
          ErrorCodes.UNAUTHORIZED.statusCode,
          ErrorCodes.UNAUTHORIZED.code,
          'User not authenticated'
        );
      }

      // Validate input
      const allowedFields = ['name', 'email', 'avatar_url'];
      const updates: any = {};

      for (const field of allowedFields) {
        if (body[field] !== undefined) {
          updates[field] = body[field];
        }
      }

      if (Object.keys(updates).length === 0) {
        throw new AppError(
          ErrorCodes.VALIDATION_ERROR.statusCode,
          ErrorCodes.VALIDATION_ERROR.code,
          'No valid fields to update'
        );
      }

      const updatedUser = await this.userRepository.update(user.id, updates);

      // Remove sensitive information
      const { encrypted_access_token, encrypted_refresh_token, ...safeUser } = updatedUser as any;

      return {
        success: true,
        data: safeUser,
        message: 'Profile updated successfully'
      };
    } catch (error) {
      logger.error('Failed to update user profile', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        ErrorCodes.INTERNAL_ERROR.statusCode,
        ErrorCodes.INTERNAL_ERROR.code,
        'Failed to update profile'
      );
    }
  }

  /**
   * Get user by ID (admin only)
   * GET /api/users/:id
   */
  @Get('/:id')
  async getUserById(@Param('id') id: string, @Req() req: any) {
    try {
      const currentUser = req.user;

      if (!currentUser || !currentUser.id) {
        throw new AppError(
          ErrorCodes.UNAUTHORIZED.statusCode,
          ErrorCodes.UNAUTHORIZED.code,
          'User not authenticated'
        );
      }

      // Check if user is admin or requesting own profile
      if (currentUser.id !== id && currentUser.role !== 'admin') {
        throw new AppError(
          ErrorCodes.FORBIDDEN.statusCode,
          ErrorCodes.FORBIDDEN.code,
          'Access denied'
        );
      }

      const user = await this.userRepository.findById(id);

      if (!user) {
        throw new AppError(
          ErrorCodes.NOT_FOUND.statusCode,
          ErrorCodes.NOT_FOUND.code,
          'User not found'
        );
      }

      // Remove sensitive information
      const { encrypted_access_token, encrypted_refresh_token, ...safeUser } = user as any;

      return {
        success: true,
        data: safeUser
      };
    } catch (error) {
      logger.error('Failed to get user', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        ErrorCodes.INTERNAL_ERROR.statusCode,
        ErrorCodes.INTERNAL_ERROR.code,
        'Failed to get user'
      );
    }
  }

  /**
   * Delete current user account
   * DELETE /api/users/me
   */
  @Delete('/me')
  async deleteCurrentUser(@Req() req: any) {
    try {
      const user = req.user;

      if (!user || !user.id) {
        throw new AppError(
          ErrorCodes.UNAUTHORIZED.statusCode,
          ErrorCodes.UNAUTHORIZED.code,
          'User not authenticated'
        );
      }

      await this.userRepository.delete(user.id);

      return {
        success: true,
        message: 'Account deleted successfully'
      };
    } catch (error) {
      logger.error('Failed to delete user account', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        ErrorCodes.INTERNAL_ERROR.statusCode,
        ErrorCodes.INTERNAL_ERROR.code,
        'Failed to delete account'
      );
    }
  }

  /**
   * Get user instances
   * GET /api/users/me/instances
   */
  @Get('/me/instances')
  async getUserInstances(@Req() req: any) {
    try {
      const user = req.user;

      if (!user || !user.id) {
        throw new AppError(
          ErrorCodes.UNAUTHORIZED.statusCode,
          ErrorCodes.UNAUTHORIZED.code,
          'User not authenticated'
        );
      }

      const instances = await this.instanceRepository.findByOwnerId(user.id);

      return {
        success: true,
        data: instances
      };
    } catch (error) {
      logger.error('Failed to get user instances', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        ErrorCodes.INTERNAL_ERROR.statusCode,
        ErrorCodes.INTERNAL_ERROR.code,
        'Failed to get user instances'
      );
    }
  }
}
