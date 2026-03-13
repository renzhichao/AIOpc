/**
 * Error Handling Utilities
 *
 * Centralized exports for error handling components.
 * Import from this file for convenience:
 *
 * ```typescript
 * import { AppError, ErrorCodes, ErrorCodeKey } from '@/utils/errors';
 * import { ErrorService } from '@/services/ErrorService';
 * import { asyncHandler } from '@/middleware/asyncHandler';
 * ```
 */

export { AppError } from './AppError';
export { ErrorCodes, ErrorCodeKey } from './ErrorCodes';
