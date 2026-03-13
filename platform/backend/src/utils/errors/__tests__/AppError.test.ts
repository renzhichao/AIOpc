import { AppError } from '../AppError';

describe('AppError', () => {
  describe('constructor', () => {
    it('should create error with all properties', () => {
      const error = new AppError(
        400,
        'VALIDATION_ERROR',
        'Validation failed',
        { field: 'email' },
        '邮箱格式不正确',
        ['请检查邮箱格式', '重新输入']
      );

      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.message).toBe('Validation failed');
      expect(error.userMessage).toBe('邮箱格式不正确');
      expect(error.details).toEqual({ field: 'email' });
      expect(error.actions).toEqual(['请检查邮箱格式', '重新输入']);
      expect(error.isOperational).toBe(true);
      expect(error.name).toBe('AppError');
    });

    it('should create error with default values', () => {
      const error = new AppError(500, 'INTERNAL_ERROR', 'Internal error');

      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.message).toBe('Internal error');
      expect(error.isOperational).toBe(true);
      expect(error.name).toBe('AppError');
    });

    it('should capture stack trace', () => {
      const error = new AppError(500, 'TEST_ERROR', 'Test error');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('AppError');
    });
  });

  describe('toJSON', () => {
    it('should serialize to JSON correctly', () => {
      const error = new AppError(
        404,
        'NOT_FOUND',
        'Not found',
        { resource: 'User' },
        '用户不存在'
      );
      const json = error.toJSON();

      expect(json).toHaveProperty('code', 'NOT_FOUND');
      expect(json).toHaveProperty('message', '用户不存在');
      expect(json).toHaveProperty('statusCode', 404);
      expect(json).toHaveProperty('details', { resource: 'User' });
    });

    it('should use userMessage if provided', () => {
      const error = new AppError(
        400,
        'VALIDATION_ERROR',
        'Validation failed',
        undefined,
        '请检查输入'
      );
      const json = error.toJSON();

      expect(json.message).toBe('请检查输入');
    });

    it('should fallback to message if no userMessage', () => {
      const error = new AppError(
        500,
        'INTERNAL_ERROR',
        'Internal error'
      );
      const json = error.toJSON();

      expect(json.message).toBe('Internal error');
    });

    it('should include optional properties only if provided', () => {
      const error = new AppError(404, 'NOT_FOUND', 'Not found');
      const json = error.toJSON();

      expect(json).not.toHaveProperty('details');
      expect(json).not.toHaveProperty('actions');
    });
  });

  describe('isClientError', () => {
    it('should return true for 4xx errors', () => {
      const error = new AppError(404, 'NOT_FOUND', 'Not found');

      expect(error.isClientError()).toBe(true);
      expect(error.isServerError()).toBe(false);
    });

    it('should return false for 5xx errors', () => {
      const error = new AppError(500, 'INTERNAL_ERROR', 'Internal error');

      expect(error.isClientError()).toBe(false);
    });
  });

  describe('isServerError', () => {
    it('should return true for 5xx errors', () => {
      const error = new AppError(500, 'INTERNAL_ERROR', 'Internal error');

      expect(error.isServerError()).toBe(true);
      expect(error.isClientError()).toBe(false);
    });

    it('should return false for 4xx errors', () => {
      const error = new AppError(404, 'NOT_FOUND', 'Not found');

      expect(error.isServerError()).toBe(false);
    });
  });

  describe('Error properties', () => {
    it('should be instanceof Error', () => {
      const error = new AppError(500, 'TEST_ERROR', 'Test error');

      expect(error instanceof Error).toBe(true);
      expect(error instanceof AppError).toBe(true);
    });

    it('should work with throw/catch', () => {
      expect(() => {
        throw new AppError(500, 'TEST_ERROR', 'Test error');
      }).toThrow('Test error');
    });
  });
});
