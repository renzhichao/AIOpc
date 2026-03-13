import { logger } from '../config/logger';

/**
 * Retry Options
 *
 * Configuration for retry mechanism with exponential backoff.
 */
export interface RetryOptions {
  /**
   * Maximum number of retry attempts
   * @default 3
   */
  maxAttempts?: number;

  /**
   * Initial delay in milliseconds before first retry
   * @default 1000
   */
  initialDelay?: number;

  /**
   * Maximum delay between retries in milliseconds
   * @default 10000
   */
  maxDelay?: number;

  /**
   * Multiplier for exponential backoff
   * @default 2
   */
  backoffMultiplier?: number;

  /**
   * Function to determine if error should trigger retry
   * @default () => true
   */
  shouldRetry?: (error: any) => boolean;

  /**
   * Function to call before each retry attempt
   */
  onRetry?: (attempt: number, error: any) => void;
}

/**
 * Retry with Exponential Backoff
 *
 * Retries a function with exponential backoff delay between attempts.
 * Useful for handling transient failures in external API calls,
 * database operations, etc.
 *
 * Delay calculation: delay = min(initialDelay * (backoffMultiplier ^ (attempt - 1)), maxDelay)
 *
 * @param fn - Async function to retry
 * @param options - Retry configuration options
 * @returns Promise that resolves with function result or rejects with last error
 *
 * @example
 * ```typescript
 * // Basic retry
 * const result = await retry(() => fetchData());
 *
 * // Custom retry options
 * const result = await retry(
 *   () => fetchData(),
 *   {
 *     maxAttempts: 5,
 *     initialDelay: 2000,
 *     maxDelay: 30000,
 *     shouldRetry: (error) => error.statusCode >= 500
 *   }
 * );
 * ```
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffMultiplier = 2,
    shouldRetry = () => true,
    onRetry
  } = options;

  let lastError: any;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const willRetry = attempt < maxAttempts && shouldRetry(error);

      logger.warn(`Attempt ${attempt}/${maxAttempts} failed`, {
        error: error instanceof Error ? error.message : String(error),
        willRetry,
        delay: willRetry ? delay : 0
      });

      if (!willRetry) {
        throw error;
      }

      // Call onRetry callback if provided
      if (onRetry) {
        onRetry(attempt, error);
      }

      // Exponential backoff
      await sleep(delay);
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }
  }

  throw lastError;
}

/**
 * Sleep for specified milliseconds
 *
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after delay
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry with Jitter
 *
 * Adds random jitter to retry delay to prevent thundering herd problem.
 * Useful when multiple clients might retry simultaneously.
 *
 * @param fn - Async function to retry
 * @param options - Retry configuration options
 * @returns Promise that resolves with function result or rejects with last error
 */
export async function retryWithJitter<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffMultiplier = 2,
    shouldRetry = () => true,
    onRetry
  } = options;

  let lastError: any;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const willRetry = attempt < maxAttempts && shouldRetry(error);

      logger.warn(`Attempt ${attempt}/${maxAttempts} failed`, {
        error: error instanceof Error ? error.message : String(error),
        willRetry,
        delay: willRetry ? delay : 0
      });

      if (!willRetry) {
        throw error;
      }

      if (onRetry) {
        onRetry(attempt, error);
      }

      // Add jitter: random value between 0 and delay * 0.5
      const jitter = Math.random() * delay * 0.5;
      await sleep(delay + jitter);
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }
  }

  throw lastError;
}
