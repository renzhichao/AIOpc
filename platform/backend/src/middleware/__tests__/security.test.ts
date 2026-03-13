import { Request, Response, NextFunction } from 'express';
import { sanitizeInput, preventSQLInjection } from '../validate';

describe('Security Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      body: {},
      query: {},
      params: {},
      path: '/test',
      ip: '127.0.0.1'
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    mockNext = jest.fn();
  });

  describe('sanitizeInput', () => {
    it('should remove script tags', () => {
      mockReq.body = {
        content: '<script>alert("xss")</script>Hello'
      };

      sanitizeInput(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.body.content).not.toContain('<script>');
      expect(mockReq.body.content).toContain('Hello');
    });

    it('should remove javascript: protocol', () => {
      mockReq.body = {
        url: 'javascript:alert("xss")'
      };

      sanitizeInput(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.body.url).not.toContain('javascript:');
    });

    it('should remove event handlers', () => {
      mockReq.body = {
        html: '<img src=x onerror="alert(1)">'
      };

      sanitizeInput(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.body.html).not.toContain('onerror');
    });

    it('should sanitize nested objects', () => {
      mockReq.body = {
        user: {
          bio: '<script>alert("xss")</script>Developer'
        }
      };

      sanitizeInput(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.body.user.bio).not.toContain('<script>');
    });

    it('should sanitize arrays', () => {
      mockReq.body = {
        items: [
          '<script>alert(1)</script>Item1',
          '<script>alert(2)</script>Item2'
        ]
      };

      sanitizeInput(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.body.items[0]).not.toContain('<script>');
      expect(mockReq.body.items[1]).not.toContain('<script>');
    });

    it('should sanitize query parameters', () => {
      mockReq.query = {
        search: '<script>alert("xss")</script>test'
      };

      sanitizeInput(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.query.search).not.toContain('<script>');
    });

    it('should sanitize path parameters', () => {
      mockReq.params = {
        id: '<script>alert("xss")</script>123'
      };

      sanitizeInput(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.params.id).not.toContain('<script>');
    });

    it('should handle null and undefined values', () => {
      mockReq.body = {
        null: null,
        undefined: undefined,
        valid: 'test'
      };

      sanitizeInput(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.body.null).toBeNull();
      expect(mockReq.body.undefined).toBeUndefined();
      expect(mockReq.body.valid).toBe('test');
    });

    it('should handle numeric and boolean values', () => {
      mockReq.body = {
        number: 42,
        bool: true,
        string: 'test'
      };

      sanitizeInput(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.body.number).toBe(42);
      expect(mockReq.body.bool).toBe(true);
      expect(mockReq.body.string).toBe('test');
    });
  });

  describe('preventSQLInjection', () => {
    it('should block SQL injection attempts with OR', () => {
      mockReq.body = {
        query: "1' OR '1'='1"
      };

      preventSQLInjection(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should block SELECT statements', () => {
      mockReq.query = {
        search: "test'; SELECT * FROM users--"
      };

      preventSQLInjection(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should block UNION injection', () => {
      mockReq.body = {
        id: "1 UNION SELECT * FROM users"
      };

      preventSQLInjection(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should block DROP statements', () => {
      mockReq.body = {
        query: "'; DROP TABLE users--"
      };

      preventSQLInjection(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should block INSERT statements', () => {
      mockReq.query = {
        data: "'; INSERT INTO users VALUES ('hacker', 'password')--"
      };

      preventSQLInjection(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should block DELETE statements', () => {
      mockReq.body = {
        id: "1; DELETE FROM users WHERE 1=1--"
      };

      preventSQLInjection(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should block UPDATE statements', () => {
      mockReq.params = {
        id: "1'; UPDATE users SET password='hacked' WHERE 1=1--"
      };

      preventSQLInjection(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should block comments', () => {
      mockReq.body = {
        query: "test'--"
      };

      preventSQLInjection(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should allow safe input', () => {
      mockReq.body = {
        name: 'John Doe',
        email: 'john@example.com',
        age: 30
      };

      preventSQLInjection(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should allow text containing SQL words in safe context', () => {
      mockReq.body = {
        description: 'This is a selection of items'
      };

      preventSQLInjection(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should detect SQL injection in nested objects', () => {
      mockReq.body = {
        user: {
          name: "test'; DROP TABLE users--"
        }
      };

      preventSQLInjection(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should detect SQL injection in arrays', () => {
      mockReq.body = {
        ids: ["1", "2", "'; DROP TABLE users--"]
      };

      preventSQLInjection(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should handle empty request body', () => {
      mockReq.body = {};

      preventSQLInjection(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });
});
