/**
 * Response Format Middleware
 *
 * Standardizes API response format across all endpoints.
 * Ensures consistent success and error response structures.
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';

/**
 * Standard success response format
 */
export interface SuccessResponse<T = any> {
  success: true;
  data: T;
  message?: string;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
    [key: string]: any;
  };
}

/**
 * Standard error response format
 */
export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    stack?: string; // Only in development
  };
}

/**
 * Enhanced Response object with standardized methods
 */
export interface FormattedResponse extends Response {
  success: <T>(data: T, message?: string, meta?: any) => void;
  error: (code: string, message: string, statusCode?: number, details?: any) => void;
  paginated: <T>(data: T[], page: number, limit: number, total: number, message?: string) => void;
}

/**
 * Response format middleware
 * Adds standardized response methods to the response object
 */
export function responseFormatMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const formattedRes = res as FormattedResponse;

  /**
   * Send a success response
   * @param data - The response data
   * @param message - Optional success message
   * @param meta - Optional metadata (pagination, etc.)
   */
  formattedRes.success = <T>(data: T, message?: string, meta?: any): void => {
    const response: SuccessResponse<T> = {
      success: true,
      data,
    };

    if (message) {
      response.message = message;
    }

    if (meta) {
      response.meta = meta;
    }

    res.json(response);
  };

  /**
   * Send an error response
   * @param code - Error code (e.g., 'VALIDATION_ERROR', 'NOT_FOUND')
   * @param message - Human-readable error message
   * @param statusCode - HTTP status code (default: 500)
   * @param details - Additional error details
   */
  formattedRes.error = (
    code: string,
    message: string,
    statusCode: number = 500,
    details?: any
  ): void => {
    const response: ErrorResponse = {
      success: false,
      error: {
        code,
        message,
      },
    };

    if (details) {
      response.error.details = details;
    }

    // Include stack trace in development
    if (process.env.NODE_ENV === 'development' && details?.stack) {
      response.error.stack = details.stack;
    }

    logger.error('API error response', {
      code,
      message,
      statusCode,
      details,
      path: req.path,
      method: req.method,
    });

    res.status(statusCode).json(response);
  };

  /**
   * Send a paginated response
   * @param data - Array of items
   * @param page - Current page number
   * @param limit - Items per page
   * @param total - Total number of items
   * @param message - Optional success message
   */
  formattedRes.paginated = <T>(
    data: T[],
    page: number,
    limit: number,
    total: number,
    message?: string
  ): void => {
    const totalPages = Math.ceil(total / limit);

    const response: SuccessResponse<T[]> = {
      success: true,
      data,
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    };

    if (message) {
      response.message = message;
    }

    res.json(response);
  };

  next();
}

/**
 * Helper function to format success responses
 * Can be used in controllers if needed
 */
export function formatSuccessResponse<T>(
  data: T,
  message?: string,
  meta?: any
): SuccessResponse<T> {
  const response: SuccessResponse<T> = {
    success: true,
    data,
  };

  if (message) {
    response.message = message;
  }

  if (meta) {
    response.meta = meta;
  }

  return response;
}

/**
 * Helper function to format error responses
 * Can be used in controllers if needed
 */
export function formatErrorResponse(
  code: string,
  message: string,
  details?: any
): ErrorResponse {
  const response: ErrorResponse = {
    success: false,
    error: {
      code,
      message,
    },
  };

  if (details) {
    response.error.details = details;
  }

  // Include stack trace in development
  if (process.env.NODE_ENV === 'development' && details instanceof Error) {
    response.error.stack = details.stack;
  }

  return response;
}

/**
 * Helper function to format paginated responses
 * Can be used in controllers if needed
 */
export function formatPaginatedResponse<T>(
  data: T[],
  page: number,
  limit: number,
  total: number,
  message?: string
): SuccessResponse<T[]> {
  const totalPages = Math.ceil(total / limit);

  const response: SuccessResponse<T[]> = {
    success: true,
    data,
    meta: {
      page,
      limit,
      total,
      totalPages,
    },
  };

  if (message) {
    response.message = message;
  }

  return response;
}
