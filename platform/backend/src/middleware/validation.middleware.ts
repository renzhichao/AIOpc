/**
 * Validation Middleware
 *
 * Request validation middleware using class-validator and class-transformer.
 * Provides standardized request validation with detailed error responses.
 */

import { Request, Response, NextFunction } from 'express';
import { validate, ValidationError } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { HttpError } from 'routing-controllers';
import { logger } from '../config/logger';
import { formatErrorResponse } from './responseFormat';

/**
 * Validation error details format
 */
export interface ValidationErrorDetail {
  field: string;
  constraints: string[];
  value?: any;
}

/**
 * Validate request body against a DTO class
 * @param DtoClass - The DTO class to validate against
 * @param options - Validation options
 */
export function validateDto<T extends object>(
  DtoClass: new () => T,
  options: {
    skipMissingProperties?: boolean;
    whitelist?: boolean;
    forbidNonWhitelisted?: boolean;
  } = {}
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Convert plain request body to DTO instance
      const dtoInstance = plainToInstance(DtoClass, req.body, {
        enableImplicitConversion: true,
      });

      // Validate the DTO instance
      const errors = await validate(dtoInstance as object, {
        skipMissingProperties: options.skipMissingProperties ?? false,
        whitelist: options.whitelist ?? true,
        forbidNonWhitelisted: options.forbidNonWhitelisted ?? true,
      });

      if (errors.length > 0) {
        // Format validation errors
        const formattedErrors = formatValidationErrors(errors);

        logger.warn('Request validation failed', {
          path: req.path,
          method: req.method,
          errors: formattedErrors,
        });

        // Send standardized error response
        res.status(400).json(
          formatErrorResponse('VALIDATION_ERROR', 'Request validation failed', {
            validationErrors: formattedErrors,
          })
        );
        return;
      }

      // Replace request body with validated DTO instance
      req.body = dtoInstance;
      next();
    } catch (error) {
      logger.error('Validation middleware error', error);
      next(error);
    }
  };
}

/**
 * Validate request query parameters against a DTO class
 * @param DtoClass - The DTO class to validate against
 */
export function validateQuery<T extends object>(DtoClass: new () => T) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Convert plain query params to DTO instance
      const dtoInstance = plainToInstance(DtoClass, req.query, {
        enableImplicitConversion: true,
      });

      // Validate the DTO instance
      const errors = await validate(dtoInstance as object, {
        skipMissingProperties: true, // Allow optional query params
        whitelist: true,
        forbidNonWhitelisted: true,
      });

      if (errors.length > 0) {
        const formattedErrors = formatValidationErrors(errors);

        logger.warn('Query validation failed', {
          path: req.path,
          method: req.method,
          errors: formattedErrors,
        });

        res.status(400).json(
          formatErrorResponse('VALIDATION_ERROR', 'Query parameter validation failed', {
            validationErrors: formattedErrors,
          })
        );
        return;
      }

      // Replace request query with validated DTO instance
      req.query = dtoInstance as any;
      next();
    } catch (error) {
      logger.error('Query validation middleware error', error);
      next(error);
    }
  };
}

/**
 * Validate request path parameters against a DTO class
 * @param DtoClass - The DTO class to validate against
 */
export function validateParams<T extends object>(DtoClass: new () => T) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Convert plain params to DTO instance
      const dtoInstance = plainToInstance(DtoClass, req.params, {
        enableImplicitConversion: true,
      });

      // Validate the DTO instance
      const errors = await validate(dtoInstance as object, {
        skipMissingProperties: false, // All params are required
        whitelist: true,
        forbidNonWhitelisted: true,
      });

      if (errors.length > 0) {
        const formattedErrors = formatValidationErrors(errors);

        logger.warn('Path parameter validation failed', {
          path: req.path,
          method: req.method,
          errors: formattedErrors,
        });

        res.status(400).json(
          formatErrorResponse('VALIDATION_ERROR', 'Path parameter validation failed', {
            validationErrors: formattedErrors,
          })
        );
        return;
      }

      // Replace request params with validated DTO instance
      req.params = dtoInstance as any;
      next();
    } catch (error) {
      logger.error('Params validation middleware error', error);
      next(error);
    }
  };
}

/**
 * Format validation errors into a consistent structure
 */
function formatValidationErrors(errors: ValidationError[]): ValidationErrorDetail[] {
  const formattedErrors: ValidationErrorDetail[] = [];

  for (const error of errors) {
    const constraints = error.constraints
      ? Object.values(error.constraints)
      : ['Invalid value'];

    formattedErrors.push({
      field: error.property,
      constraints,
      value: error.value,
    });

    // Handle nested validation errors
    if (error.children && error.children.length > 0) {
      const nestedErrors = formatValidationErrors(error.children);
      for (const nested of nestedErrors) {
        formattedErrors.push({
          field: `${error.property}.${nested.field}`,
          constraints: nested.constraints,
          value: nested.value,
        });
      }
    }
  }

  return formattedErrors;
}

/**
 * Validate specific fields manually
 * Useful for simple validation scenarios
 */
export function validateFields(
  fields: Record<string, { value: any; required?: boolean; validator?: (value: any) => boolean | string }>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: ValidationErrorDetail[] = [];

    for (const [fieldName, config] of Object.entries(fields)) {
      const value = config.value;

      // Check required fields
      if (config.required && (value === undefined || value === null || value === '')) {
        errors.push({
          field: fieldName,
          constraints: [`Field '${fieldName}' is required`],
        });
        continue;
      }

      // Skip validation if field is optional and not provided
      if (!config.required && (value === undefined || value === null || value === '')) {
        continue;
      }

      // Run custom validator
      if (config.validator) {
        const result = config.validator(value);
        if (result !== true) {
          errors.push({
            field: fieldName,
            constraints: [typeof result === 'string' ? result : `Invalid value for '${fieldName}'`],
            value,
          });
        }
      }
    }

    if (errors.length > 0) {
      logger.warn('Manual field validation failed', {
        path: req.path,
        method: req.method,
        errors,
      });

      res.status(400).json(
        formatErrorResponse('VALIDATION_ERROR', 'Request validation failed', {
          validationErrors: errors,
        })
      );
      return;
    }

    next();
  };
}

/**
 * Common validation helpers
 */
export const validators = {
  /**
   * Validate email format
   */
  isEmail: (value: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  },

  /**
   * Validate UUID format
   */
  isUUID: (value: string): boolean => {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  },

  /**
   * Validate URL format
   */
  isURL: (value: string): boolean => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Validate string length
   */
  isLength: (value: string, min: number, max: number): boolean => {
    return value.length >= min && value.length <= max;
  },

  /**
   * Validate numeric range
   */
  isInRange: (value: number, min: number, max: number): boolean => {
    return value >= min && value <= max;
  },

  /**
   * Validate enum value
   */
  isEnum: (value: any, enumValues: any[]): boolean => {
    return enumValues.includes(value);
  },

  /**
   * Validate date string
   */
  isDate: (value: string): boolean => {
    return !isNaN(Date.parse(value));
  },
};

/**
 * Create a custom validation error
 */
export class ValidationError extends HttpError {
  public errors: ValidationErrorDetail[];

  constructor(errors: ValidationErrorDetail[]) {
    super(400, 'Validation failed');
    this.errors = errors;
  }
}
