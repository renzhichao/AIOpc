import { Controller, Get, Put, Delete, Body, Param, Req } from 'routing-controllers';
import { Service } from 'typedi';
import { UserRepository } from '../repositories/UserRepository';
import { InstanceRepository } from '../repositories/InstanceRepository';
import { logger } from '../config/logger';
import { AppError } from '../utils/errors';

/**
 * User Controller
 *
 * RESTful API endpoints for user management.
 */
@Service()
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
          401,
          'UNAUTHORIZED',
          'User not authenticated'
        );
      }

      const userProfile = await this.userRepository.findById(user.id);

      if (!userProfile) {
        throw new AppError(
          404,
          'NOT_FOUND',
          'User not found'
        );
      }

      // Remove sensitive information (tokens are not stored in User model)
      const safeUser = userProfile;

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
        500,
        'INTERNAL_ERROR',
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
          401,
          'UNAUTHORIZED',
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
          400,
          'VALIDATION_ERROR',
          'No valid fields to update'
        );
      }

      const updatedUser = await this.userRepository.update(user.id, updates);

      // Remove sensitive information (tokens are not stored in User model)
      const safeUser = updatedUser;

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
        500,
        'INTERNAL_ERROR',
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
          401,
          'UNAUTHORIZED',
          'User not authenticated'
        );
      }

      // Check if user is admin or requesting own profile
      if (currentUser.id !== id && currentUser.role !== 'admin') {
        throw new AppError(
          403,
          'FORBIDDEN',
          'Access denied'
        );
      }

      const user = await this.userRepository.findById(id);

      if (!user) {
        throw new AppError(
          404,
          'NOT_FOUND',
          'User not found'
        );
      }

      // Remove sensitive information (tokens are not stored in User model)
      const safeUser = user;

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
        500,
        'INTERNAL_ERROR',
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
          401,
          'UNAUTHORIZED',
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
        500,
        'INTERNAL_ERROR',
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
          401,
          'UNAUTHORIZED',
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
        500,
        'INTERNAL_ERROR',
        'Failed to get user instances'
      );
    }
  }
}
