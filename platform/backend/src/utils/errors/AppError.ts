/**
 * Application Error Base Class
 *
 * Provides a structured error format for all application errors.
 * Includes both technical and user-facing messages, error codes,
 * and suggested actions for resolution.
 */
export class AppError extends Error {
  /**
   * Create a new AppError
   *
   * @param statusCode - HTTP status code
   * @param code - Error code identifier
   * @param message - Technical error message (internal)
   * @param details - Additional error details (optional)
   * @param userMessage - User-friendly error message (optional)
   * @param actions - Suggested actions for resolution (optional)
   * @param isOperational - Whether this is an expected operational error (default: true)
   */
  constructor(
    public statusCode: number,
    public code: string,
    public message: string,
    public details?: any,
    public userMessage?: string,
    public actions?: string[],
    public isOperational = true
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert error to JSON format for API responses
   * Returns user-facing information only
   */
  toJSON(): any {
    const json: any = {
      code: this.code,
      message: this.userMessage || this.message,
      statusCode: this.statusCode
    };

    if (this.details !== undefined) {
      json.details = this.details;
    }

    if (this.actions !== undefined) {
      json.actions = this.actions;
    }

    return json;
  }

  /**
   * Check if error is client error (4xx)
   */
  isClientError(): boolean {
    return this.statusCode >= 400 && this.statusCode < 500;
  }

  /**
   * Check if error is server error (5xx)
   */
  isServerError(): boolean {
    return this.statusCode >= 500;
  }
}
