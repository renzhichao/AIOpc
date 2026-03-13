import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { logger } from '../config/logger';

/**
 * 验证请求体
 */
export function validateBody(schema: Joi.ObjectSchema): (req: Request, res: Response, next: NextFunction) => void | Response {
  return (req: Request, res: Response, next: NextFunction): void | Response => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      logger.warn('Request body validation failed', {
        path: req.path,
        details
      });

      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: '请求参数验证失败',
        details
      });
    }

    // 替换为验证后的值（类型转换和默认值）
    req.body = value;
    next();
  };
}

/**
 * 验证查询参数
 */
export function validateQuery(schema: Joi.ObjectSchema): (req: Request, res: Response, next: NextFunction) => void | Response {
  return (req: Request, res: Response, next: NextFunction): void | Response => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      logger.warn('Request query validation failed', {
        path: req.path,
        details
      });

      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: '查询参数验证失败',
        details
      });
    }

    req.query = value;
    next();
  };
}

/**
 * 验证路径参数
 */
export function validateParams(schema: Joi.ObjectSchema): (req: Request, res: Response, next: NextFunction) => void | Response {
  return (req: Request, res: Response, next: NextFunction): void | Response => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
      stripUnknown: false,
      convert: true
    });

    if (error) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      logger.warn('Request params validation failed', {
        path: req.path,
        details
      });

      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: '路径参数验证失败',
        details
      });
    }

    req.params = value;
    next();
  };
}

/**
 * 清理输入，防止 XSS 攻击
 */
export function sanitizeInput(req: Request, res: Response, next: NextFunction) {
  const sanitize = (obj: any): any => {
    if (typeof obj === 'string') {
      // 移除危险的 HTML 标签
      return obj
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '');
    }

    if (Array.isArray(obj)) {
      return obj.map(sanitize);
    }

    if (obj !== null && typeof obj === 'object') {
      const sanitized: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          sanitized[key] = sanitize(obj[key]);
        }
      }
      return sanitized;
    }

    return obj;
  };

  req.body = sanitize(req.body);
  req.query = sanitize(req.query);
  req.params = sanitize(req.params);

  next();
}

/**
 * 防止 SQL 注入的额外检查
 */
export function preventSQLInjection(req: Request, res: Response, next: NextFunction): void | Response {
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/i,
    /(;|--|\|\/\*|\*\/)/i,
    /'(\s+OR\s+|'|\s*=)/i,
    /'(\s+AND\s+|'|\s*=)/i
  ];

  const checkValue = (value: any): boolean => {
    if (typeof value === 'string') {
      return sqlPatterns.some(pattern => pattern.test(value));
    }
    if (Array.isArray(value)) {
      return value.some(checkValue);
    }
    if (typeof value === 'object' && value !== null) {
      return Object.values(value).some(checkValue);
    }
    return false;
  };

  const suspiciousInputs = [
    checkValue(req.body),
    checkValue(req.query),
    checkValue(req.params)
  ];

  if (suspiciousInputs.some(Boolean)) {
    logger.warn('Potential SQL injection detected', {
      path: req.path,
      ip: req.ip,
      body: req.body,
      query: req.query
    });

    return res.status(400).json({
      success: false,
      code: 'VALIDATION_ERROR',
      message: '检测到非法输入'
    });
  }

  next();
}
