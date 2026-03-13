import { Request, Response, NextFunction } from 'express';
import { validateBody, validateQuery, validateParams } from '../validate';
import Joi from 'joi';

describe('Validation Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      body: {},
      query: {},
      params: {}
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    mockNext = jest.fn();
  });

  describe('validateBody', () => {
    it('should pass valid data', () => {
      const schema = Joi.object({
        name: Joi.string().required(),
        email: Joi.string().email().required()
      });

      mockReq.body = {
        name: 'Test User',
        email: 'test@example.com'
      };

      validateBody(schema)(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should reject invalid data', () => {
      const schema = Joi.object({
        email: Joi.string().email().required()
      });

      mockReq.body = {
        email: 'invalid-email'
      };

      validateBody(schema)(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should apply default values', () => {
      const schema = Joi.object({
        count: Joi.number().default(10)
      });

      mockReq.body = {};

      validateBody(schema)(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.body.count).toBe(10);
    });

    it('should strip unknown fields', () => {
      const schema = Joi.object({
        name: Joi.string().required()
      });

      mockReq.body = {
        name: 'Test',
        unknown: 'field'
      };

      validateBody(schema)(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.body).toHaveProperty('name');
      expect(mockReq.body).not.toHaveProperty('unknown');
    });

    it('should handle missing required fields', () => {
      const schema = Joi.object({
        name: Joi.string().required(),
        email: Joi.string().required()
      });

      mockReq.body = {
        name: 'Test'
      };

      validateBody(schema)(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: 'VALIDATION_ERROR'
        })
      );
    });
  });

  describe('validateQuery', () => {
    it('should validate query parameters', () => {
      const schema = Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).default(20)
      });

      mockReq.query = {
        page: '2',
        limit: '10'
      };

      validateQuery(schema)(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.query.page).toBe(2);
      expect(mockReq.query.limit).toBe(10);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should apply defaults to query parameters', () => {
      const schema = Joi.object({
        page: Joi.number().default(1),
        limit: Joi.number().default(20)
      });

      mockReq.query = {};

      validateQuery(schema)(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.query.page).toBe(1);
      expect(mockReq.query.limit).toBe(20);
    });

    it('should reject invalid query parameters', () => {
      const schema = Joi.object({
        page: Joi.number().integer().min(1).required()
      });

      mockReq.query = {
        page: 'invalid'
      };

      validateQuery(schema)(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('validateParams', () => {
    it('should validate path parameters', () => {
      const schema = Joi.object({
        id: Joi.string().pattern(/^[0-9]+$/).required()
      });

      mockReq.params = {
        id: '123'
      };

      validateParams(schema)(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject invalid path parameters', () => {
      const schema = Joi.object({
        id: Joi.string().pattern(/^[0-9]+$/).required()
      });

      mockReq.params = {
        id: 'abc'
      };

      validateParams(schema)(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle pattern validation', () => {
      const schema = Joi.object({
        instanceId: Joi.string().pattern(/^[a-z0-9-]{36}$/).required()
      });

      mockReq.params = {
        instanceId: '123e4567-e89b-12d3-a456-426614174000'
      };

      validateParams(schema)(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });
});
