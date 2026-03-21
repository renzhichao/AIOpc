import { LogSanitizer } from '../LogSanitizer';

describe('LogSanitizer', () => {
  describe('sanitizeConfig', () => {
    it('should sanitize appKey to show first 8 characters only', () => {
      const config = {
        appKey: 'ding6fgvcdmcdigtazrm',
        appSecret: 'wRJsPR2nWnLiuYYhAspWsQX_hPQjyrmLRfbuZbV3LEzGqAAGG9Ca1rXKz27bgiSq'
      };

      const sanitized = LogSanitizer.sanitizeConfig(config);

      expect(sanitized.appKey).toBe('ding6fgv***');
      expect(sanitized.appSecret).toBe('***');
    });

    it('should sanitize short appKey (less than 8 chars)', () => {
      const config = {
        appKey: 'ding6',
        appSecret: 'secret123'
      };

      const sanitized = LogSanitizer.sanitizeConfig(config);

      expect(sanitized.appKey).toBe('ding***');
      expect(sanitized.appSecret).toBe('***');
    });

    it('should completely hide appSecret', () => {
      const config = {
        appSecret: 'wRJsPR2nWnLiuYYhAspWsQX_hPQjyrmLRfbuZbV3LEzGqAAGG9Ca1rXKz27bgiSq'
      };

      const sanitized = LogSanitizer.sanitizeConfig(config);

      expect(sanitized.appSecret).toBe('***');
    });

    it('should sanitize appId similarly to appKey', () => {
      const config = {
        appId: 'cli_a93ce5614ce11bd6'
      };

      const sanitized = LogSanitizer.sanitizeConfig(config);

      expect(sanitized.appId).toBe('cli_a93c***');
    });

    it('should sanitize other sensitive fields', () => {
      const config = {
        clientSecret: 'secret123',
        secret: 'secret456',
        password: 'password789',
        token: 'token999'
      };

      const sanitized = LogSanitizer.sanitizeConfig(config);

      expect(sanitized.clientSecret).toBe('***');
      expect(sanitized.secret).toBe('***');
      expect(sanitized.password).toBe('***');
      expect(sanitized.token).toBe('***');
    });

    it('should preserve non-sensitive fields', () => {
      const config = {
        appKey: 'ding6fgvcdmcdigtazrm',
        appSecret: 'secret123',
        redirectUri: 'https://example.com/callback',
        scope: 'contact:user.base:readonly'
      };

      const sanitized = LogSanitizer.sanitizeConfig(config);

      expect(sanitized.redirectUri).toBe('https://example.com/callback');
      expect(sanitized.scope).toBe('contact:user.base:readonly');
    });

    it('should handle empty config', () => {
      const config = {};
      const sanitized = LogSanitizer.sanitizeConfig(config);

      expect(sanitized).toEqual({});
    });
  });

  describe('sanitizeToken', () => {
    it('should hide all token fields', () => {
      const token = {
        accessToken: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        tokenType: 'Bearer'
      };

      const sanitized = LogSanitizer.sanitizeToken(token);

      expect(sanitized.accessToken).toBe('***');
      expect(sanitized.refreshToken).toBe('***');
      expect(sanitized.tokenType).toBe('Bearer');
    });

    it('should hide snake_case token fields', () => {
      const token = {
        access_token: 'Bearer token123',
        refresh_token: 'refresh456',
        token_type: 'Bearer'
      };

      const sanitized = LogSanitizer.sanitizeToken(token);

      expect(sanitized.access_token).toBe('***');
      expect(sanitized.refresh_token).toBe('***');
      expect(sanitized.token_type).toBe('Bearer');
    });

    it('should hide generic token field', () => {
      const token = {
        token: 'secret-token-123'
      };

      const sanitized = LogSanitizer.sanitizeToken(token);

      expect(sanitized.token).toBe('***');
    });

    it('should hide authorization field', () => {
      const token = {
        authorization: 'Bearer secret123'
      };

      const sanitized = LogSanitizer.sanitizeToken(token);

      expect(sanitized.authorization).toBe('***');
    });

    it('should preserve non-token fields', () => {
      const token = {
        accessToken: 'secret123',
        expiresIn: 3600,
        scope: 'read write'
      };

      const sanitized = LogSanitizer.sanitizeToken(token);

      expect(sanitized.accessToken).toBe('***');
      expect(sanitized.expiresIn).toBe(3600);
      expect(sanitized.scope).toBe('read write');
    });
  });

  describe('sanitizeCode', () => {
    it('should show code length only', () => {
      const code = 'ding6fgvcdmcdigtazrm';
      const sanitized = LogSanitizer.sanitizeCode(code);

      expect(sanitized).toBe('[code length: 20]');
    });

    it('should handle empty code', () => {
      const sanitized = LogSanitizer.sanitizeCode('');

      expect(sanitized).toBe('[code length: 0]');
    });

    it('should handle undefined code', () => {
      const sanitized = LogSanitizer.sanitizeCode(undefined);

      expect(sanitized).toBe('[code: empty or undefined]');
    });

    it('should handle short code', () => {
      const sanitized = LogSanitizer.sanitizeCode('abc');

      expect(sanitized).toBe('[code length: 3]');
    });
  });

  describe('sanitizeState', () => {
    it('should show state length only', () => {
      const state = 'abc123def456';
      const sanitized = LogSanitizer.sanitizeState(state);

      expect(sanitized).toBe('[state length: 12]');
    });

    it('should handle empty state', () => {
      const sanitized = LogSanitizer.sanitizeState('');

      expect(sanitized).toBe('[state length: 0]');
    });

    it('should handle undefined state', () => {
      const sanitized = LogSanitizer.sanitizeState(undefined);

      expect(sanitized).toBe('[state: empty or undefined]');
    });
  });

  describe('sanitizeUserId', () => {
    it('should show first 8 and last 4 characters for long IDs', () => {
      const userId = 'ou_1234567890abcdef';
      const sanitized = LogSanitizer.sanitizeUserId(userId);

      expect(sanitized).toBe('ou_12345***cdef');
    });

    it('should show first 4 characters for short IDs (<=12 chars)', () => {
      const userId = 'ou_1234abcd';
      const sanitized = LogSanitizer.sanitizeUserId(userId);

      expect(sanitized).toBe('ou_1***');
    });

    it('should handle empty userId', () => {
      const sanitized = LogSanitizer.sanitizeUserId('');

      expect(sanitized).toBe('[userId: empty]');
    });

    it('should handle undefined userId', () => {
      const sanitized = LogSanitizer.sanitizeUserId(undefined);

      expect(sanitized).toBe('[userId: empty]');
    });

    it('should handle very long userId', () => {
      const userId = 'ou_123456789012345678901234567890abcdefghijklmnop';
      const sanitized = LogSanitizer.sanitizeUserId(userId);

      expect(sanitized).toBe('ou_12345***mnop');
    });
  });

  describe('sanitizeError', () => {
    it('should sanitize error message with sensitive info', () => {
      const error = new Error('Failed with appSecret: wRJsPR2nWnLiuYYh');

      const sanitized = LogSanitizer.sanitizeError(error);

      expect(sanitized.message).toContain('***');
      expect(sanitized.message).not.toContain('wRJsPR2nWnLiuYYh');
    });

    it('should preserve safe error fields', () => {
      const error: any = new Error('Test error');
      error.code = 'ERR_TEST';
      error.statusCode = 500;
      error.status = 500;

      const sanitized = LogSanitizer.sanitizeError(error);

      expect(sanitized.code).toBe('ERR_TEST');
      expect(sanitized.statusCode).toBe(500);
      expect(sanitized.status).toBe(500);
    });

    it('should sanitize error stack trace', () => {
      const error = new Error('Error with appSecret: secret123');

      const sanitized = LogSanitizer.sanitizeError(error);

      expect(sanitized.stack).toContain('***');
      expect(sanitized.stack).not.toContain('secret123');
    });

    it('should handle error without stack', () => {
      const error = { message: 'Simple error' };

      const sanitized = LogSanitizer.sanitizeError(error);

      expect(sanitized.message).toBe('Simple error');
      expect(sanitized.stack).toBeUndefined();
    });

    it('should sanitize Bearer tokens in error messages', () => {
      const error = new Error('Authorization failed: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');

      const sanitized = LogSanitizer.sanitizeError(error);

      expect(sanitized.message).toContain('***');
      expect(sanitized.message).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    });
  });

  describe('sanitizeObject', () => {
    it('should recursively sanitize nested objects', () => {
      const obj = {
        user: {
          open_id: 'ou_1234567890abcdef',
          name: 'Test User',
          credentials: {
            appSecret: 'secret123'
          }
        }
      };

      const sanitized = LogSanitizer.sanitizeObject(obj);

      expect(sanitized.user.open_id).toBe('ou_12345***cdef');
      expect(sanitized.user.name).toBe('Test User');
      expect(sanitized.user.credentials.appSecret).toBe('***');
    });

    it('should sanitize arrays of objects', () => {
      const obj = {
        users: [
          { open_id: 'ou_1111111111111111', name: 'User 1' },
          { open_id: 'ou_2222222222222222', name: 'User 2' }
        ]
      };

      const sanitized = LogSanitizer.sanitizeObject(obj);

      expect(sanitized.users[0].open_id).toBe('ou_11111***1111');
      expect(sanitized.users[1].open_id).toBe('ou_22222***2222');
    });

    it('should detect and sanitize token fields', () => {
      const obj = {
        accessToken: 'token123',
        refreshToken: 'refresh456',
        authorization: 'Bearer auth789'
      };

      const sanitized = LogSanitizer.sanitizeObject(obj);

      expect(sanitized.accessToken).toBe('***');
      expect(sanitized.refreshToken).toBe('***');
      expect(sanitized.authorization).toBe('***');
    });

    it('should detect and sanitize secret/password fields', () => {
      const obj = {
        clientSecret: 'secret123',
        appSecret: 'secret456',
        password: 'password789'
      };

      const sanitized = LogSanitizer.sanitizeObject(obj);

      expect(sanitized.clientSecret).toBe('***');
      expect(sanitized.appSecret).toBe('***');
      expect(sanitized.password).toBe('***');
    });

    it('should detect and sanitize user_id/open_id/union_id fields', () => {
      const obj = {
        user_id: 'user_1234567890abcdef',
        open_id: 'ou_1111111111111111',
        union_id: 'on_2222222222222222'
      };

      const sanitized = LogSanitizer.sanitizeObject(obj);

      expect(sanitized.user_id).toBe('user_123***cdef');
      expect(sanitized.open_id).toBe('ou_11111***1111');
      expect(sanitized.union_id).toBe('on_22222***2222');
    });

    it('should sanitize appKey/appId/app_id fields', () => {
      const obj = {
        appKey: 'ding6fgvcdmcdigtazrm',
        appId: 'cli_a93ce5614ce11bd6',
        app_id: 'app_1234567890abcdef'
      };

      const sanitized = LogSanitizer.sanitizeObject(obj);

      expect(sanitized.appKey).toBe('ding6fgv***');
      expect(sanitized.appId).toBe('cli_a93c***');
      expect(sanitized.app_id).toBe('app_1234***');
    });

    it('should sanitize code field (show length only)', () => {
      const obj = {
        code: 'ding6fgvcdmcdigtazrm'
      };

      const sanitized = LogSanitizer.sanitizeObject(obj);

      expect(sanitized.code).toBe('[code length: 20]');
    });

    it('should preserve null and undefined values', () => {
      const obj = {
        nullField: null,
        undefinedField: undefined,
        normalField: 'value'
      };

      const sanitized = LogSanitizer.sanitizeObject(obj);

      expect(sanitized.nullField).toBeNull();
      expect(sanitized.undefinedField).toBeUndefined();
      expect(sanitized.normalField).toBe('value');
    });

    it('should handle primitive values', () => {
      expect(LogSanitizer.sanitizeObject('string')).toBe('string');
      expect(LogSanitizer.sanitizeObject(123)).toBe(123);
      expect(LogSanitizer.sanitizeObject(true)).toBe(true);
      expect(LogSanitizer.sanitizeObject(null)).toBe(null);
    });

    it('should handle empty object', () => {
      const sanitized = LogSanitizer.sanitizeObject({});
      expect(sanitized).toEqual({});
    });

    it('should handle empty array', () => {
      const sanitized = LogSanitizer.sanitizeObject([]);
      expect(sanitized).toEqual([]);
    });
  });

  describe('log method', () => {
    it('should call logger.info with sanitized data', () => {
      const loggerInfoSpy = jest.spyOn(require('../../config/logger').logger, 'info');

      LogSanitizer.log('info', 'Test message', {
        appSecret: 'secret123',
        accessToken: 'token456'
      });

      expect(loggerInfoSpy).toHaveBeenCalledWith(
        'Test message',
        expect.objectContaining({
          appSecret: '***',
          accessToken: '***'
        })
      );

      loggerInfoSpy.mockRestore();
    });

    it('should call logger.error with sanitized data', () => {
      const loggerErrorSpy = jest.spyOn(require('../../config/logger').logger, 'error');

      LogSanitizer.log('error', 'Error message', {
        appSecret: 'secret123'
      });

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Error message',
        expect.objectContaining({
          appSecret: '***'
        })
      );

      loggerErrorSpy.mockRestore();
    });

    it('should handle data without sanitization', () => {
      const loggerInfoSpy = jest.spyOn(require('../../config/logger').logger, 'info');

      LogSanitizer.log('info', 'Test message', {
        normalField: 'normalValue',
        number: 123
      });

      expect(loggerInfoSpy).toHaveBeenCalledWith(
        'Test message',
        expect.objectContaining({
          normalField: 'normalValue',
          number: 123
        })
      );

      loggerInfoSpy.mockRestore();
    });

    it('should handle undefined data', () => {
      const loggerInfoSpy = jest.spyOn(require('../../config/logger').logger, 'info');

      LogSanitizer.log('info', 'Test message', undefined);

      expect(loggerInfoSpy).toHaveBeenCalledWith('Test message', undefined);

      loggerInfoSpy.mockRestore();
    });
  });

  describe('CIIBER tenant specific tests', () => {
    const CIIBER_APP_KEY = 'ding6fgvcdmcdigtazrm';
    const CIIBER_APP_SECRET = 'wRJsPR2nWnLiuYYhAspWsQX_hPQjyrmLRfbuZbV3LEzGqAAGG9Ca1rXKz27bgiSq';

    it('should correctly sanitize CIIBER appKey', () => {
      const config = { appKey: CIIBER_APP_KEY };
      const sanitized = LogSanitizer.sanitizeConfig(config);

      expect(sanitized.appKey).toBe('ding6fgv***');
      expect(sanitized.appKey).not.toContain(CIIBER_APP_KEY);
    });

    it('should completely hide CIIBER appSecret', () => {
      const config = { appSecret: CIIBER_APP_SECRET };
      const sanitized = LogSanitizer.sanitizeConfig(config);

      expect(sanitized.appSecret).toBe('***');
      expect(sanitized.appSecret).not.toContain(CIIBER_APP_SECRET);
    });

    it('should not leak CIIBER credentials in logs', () => {
      const logData = {
        appKey: CIIBER_APP_KEY,
        appSecret: CIIBER_APP_SECRET,
        timestamp: Date.now()
      };

      const sanitized = LogSanitizer.sanitizeObject(logData);

      // Verify appKey is partially visible but not complete
      expect(sanitized.appKey).toMatch(/^ding6fgv\*\*\*$/);
      expect(sanitized.appKey).not.toMatch(CIIBER_APP_KEY);

      // Verify appSecret is completely hidden
      expect(sanitized.appSecret).toBe('***');
      expect(JSON.stringify(sanitized)).not.toContain(CIIBER_APP_SECRET);

      // Verify timestamp is preserved
      expect(sanitized.timestamp).toBe(logData.timestamp);
    });
  });
});
