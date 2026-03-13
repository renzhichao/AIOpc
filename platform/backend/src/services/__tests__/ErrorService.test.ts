import { ErrorService } from '../ErrorService';
import { AppError } from '../../utils/errors/AppError';

describe('ErrorService', () => {
  let errorService: ErrorService;

  beforeEach(() => {
    errorService = new ErrorService();
  });

  describe('createError', () => {
    it('should create error from ErrorCodes', () => {
      const error = errorService.createError('UNAUTHORIZED');

      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.userMessage).toBe('您需要先登录才能进行此操作');
    });

    it('should create error with details and actions', () => {
      const details = { resource: 'User', id: 123 };
      const actions = ['检查用户ID', '联系管理员'];

      const error = errorService.createError('NOT_FOUND', details, actions);

      expect(error.details).toEqual(details);
      expect(error.actions).toEqual(actions);
    });

    it('should create different error types', () => {
      const unauthorized = errorService.createError('UNAUTHORIZED');
      const forbidden = errorService.createError('FORBIDDEN');
      const notFound = errorService.createError('NOT_FOUND');

      expect(unauthorized.statusCode).toBe(401);
      expect(forbidden.statusCode).toBe(403);
      expect(notFound.statusCode).toBe(404);
    });
  });

  describe('notFound', () => {
    it('should create not found error with resource name', () => {
      const error = errorService.notFound('User');

      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toContain('User');
      expect(error.userMessage).toContain('User');
      expect(error.details).toEqual({ resource: 'User', identifier: undefined });
    });

    it('should create not found error with identifier', () => {
      const error = errorService.notFound('User', '123');

      expect(error.statusCode).toBe(404);
      expect(error.message).toContain('123');
      expect(error.userMessage).toContain('123');
      expect(error.details).toEqual({ resource: 'User', identifier: '123' });
    });

    it('should create different not found errors', () => {
      const userError = errorService.notFound('User');
      const instanceError = errorService.notFound('Instance', 'abc-123');

      expect(userError.message).toContain('User');
      expect(instanceError.message).toContain('Instance');
      expect(instanceError.message).toContain('abc-123');
    });
  });

  describe('validation', () => {
    it('should create validation error', () => {
      const error = errorService.validation('email', 'Invalid format');

      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.message).toContain('email');
      expect(error.message).toContain('Invalid format');
      expect(error.userMessage).toContain('email');
      expect(error.userMessage).toContain('Invalid format');
      expect(error.details).toEqual({ field: 'email' });
    });

    it('should create validation errors for different fields', () => {
      const emailError = errorService.validation('email', 'Invalid format');
      const passwordError = errorService.validation('password', 'Too short');

      expect(emailError.details.field).toBe('email');
      expect(passwordError.details.field).toBe('password');
    });
  });

  describe('unauthorized', () => {
    it('should create unauthorized error without reason', () => {
      const error = errorService.unauthorized();

      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.message).toBe('Unauthorized access');
      expect(error.userMessage).toBe('您需要先登录才能进行此操作');
    });

    it('should create unauthorized error with reason', () => {
      const error = errorService.unauthorized('Token expired');

      expect(error.statusCode).toBe(401);
      expect(error.details).toEqual({ reason: 'Token expired' });
    });
  });

  describe('forbidden', () => {
    it('should create forbidden error without action', () => {
      const error = errorService.forbidden();

      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('FORBIDDEN');
      expect(error.message).toBe('Forbidden');
      expect(error.userMessage).toBe('您没有权限执行此操作');
    });

    it('should create forbidden error with action', () => {
      const error = errorService.forbidden('Delete user');

      expect(error.statusCode).toBe(403);
      expect(error.message).toContain('Delete user');
      expect(error.details).toEqual({ action: 'Delete user' });
    });
  });

  describe('conflict', () => {
    it('should create conflict error', () => {
      const error = errorService.conflict('User', { email: 'test@example.com' });

      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('CONFLICT');
      expect(error.message).toContain('User');
      expect(error.details).toEqual({ email: 'test@example.com' });
    });
  });

  describe('logError', () => {
    it('should log error without crashing', () => {
      const error = new Error('Test error');
      const context = { userId: 123 };

      expect(() => {
        errorService.logError(error, context);
      }).not.toThrow();
    });

    it('should log AppError', () => {
      const error = new AppError(500, 'INTERNAL_ERROR', 'Internal error');

      expect(() => {
        errorService.logError(error);
      }).not.toThrow();
    });

    it('should log critical errors', () => {
      const error = new AppError(500, 'INTERNAL_ERROR', 'Critical error');

      expect(() => {
        errorService.logError(error);
      }).not.toThrow();
    });

    it('should log non-critical errors', () => {
      const error = new AppError(404, 'NOT_FOUND', 'Not found');

      expect(() => {
        errorService.logError(error);
      }).not.toThrow();
    });
  });
});
