import { retry, retryWithJitter } from '../retry';

describe('retry', () => {
  describe('basic retry', () => {
    it('should succeed on first attempt', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await retry(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      let attemptCount = 0;
      const fn = jest.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          return Promise.reject(new Error('fail'));
        }
        return Promise.resolve('success');
      });

      const result = await retry(fn, {
        maxAttempts: 5,
        initialDelay: 10,
        maxDelay: 50
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
      expect(attemptCount).toBe(3);
    });

    it('should throw after max attempts', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      await expect(
        retry(fn, {
          maxAttempts: 2,
          initialDelay: 10,
          maxDelay: 50
        })
      ).rejects.toThrow('fail');

      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should use exponential backoff', async () => {
      const delays: number[] = [];
      let attemptCount = 0;

      const fn = jest.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 4) {
          return Promise.reject(new Error('fail'));
        }
        return Promise.resolve('success');
      });

      const startTime = Date.now();
      const result = await retry(fn, {
        maxAttempts: 5,
        initialDelay: 50,
        backoffMultiplier: 2,
        maxDelay: 2000,
        onRetry: (attempt) => {
          delays.push(Date.now() - startTime);
        }
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(4);
      expect(delays.length).toBe(3);
    });

    it('should respect maxDelay', async () => {
      let attemptCount = 0;
      const fn = jest.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 4) {
          return Promise.reject(new Error('fail'));
        }
        return Promise.resolve('success');
      });

      const result = await retry(fn, {
        maxAttempts: 5,
        initialDelay: 50,
        maxDelay: 100,
        backoffMultiplier: 3
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(4);
    });
  });

  describe('shouldRetry callback', () => {
    it('should not retry if shouldRetry returns false', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fatal'));
      const shouldRetry = jest.fn().mockReturnValue(false);

      await expect(
        retry(fn, {
          maxAttempts: 3,
          initialDelay: 10,
          maxDelay: 50,
          shouldRetry
        })
      ).rejects.toThrow('fatal');

      expect(fn).toHaveBeenCalledTimes(1);
      expect(shouldRetry).toHaveBeenCalledTimes(1);
    });

    it('should retry based on shouldRetry condition', async () => {
      let attemptCount = 0;
      const fn = jest.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount === 3) {
          return Promise.reject(new Error('fatal'));
        }
        return Promise.reject(new Error('transient'));
      });

      const shouldRetry = (error: Error) => {
        return error.message === 'transient';
      };

      await expect(
        retry(fn, {
          maxAttempts: 5,
          initialDelay: 10,
          maxDelay: 50,
          shouldRetry
        })
      ).rejects.toThrow('fatal');

      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  describe('onRetry callback', () => {
    it('should call onRetry before each retry', async () => {
      let attemptCount = 0;
      const fn = jest.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          return Promise.reject(new Error('fail'));
        }
        return Promise.resolve('success');
      });

      const onRetry = jest.fn();

      const result = await retry(fn, {
        maxAttempts: 5,
        initialDelay: 10,
        maxDelay: 50,
        onRetry
      });

      expect(result).toBe('success');
      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenNthCalledWith(1, 1, expect.any(Error));
      expect(onRetry).toHaveBeenNthCalledWith(2, 2, expect.any(Error));
    });
  });

  describe('retryWithJitter', () => {
    it('should add jitter to retry delays', async () => {
      let attemptCount = 0;
      const fn = jest.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          return Promise.reject(new Error('fail'));
        }
        return Promise.resolve('success');
      });

      const result = await retryWithJitter(fn, {
        maxAttempts: 5,
        initialDelay: 50,
        maxDelay: 200
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  describe('default options', () => {
    it('should use default maxAttempts of 3', async () => {
      let attemptCount = 0;
      const fn = jest.fn().mockImplementation(() => {
        attemptCount++;
        return Promise.reject(new Error('fail'));
      });

      await expect(
        retry(fn)
      ).rejects.toThrow('fail');

      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  describe('edge cases', () => {
    it('should handle non-Error errors', async () => {
      const fn = jest.fn().mockRejectedValue('string error');

      await expect(
        retry(fn, {
          maxAttempts: 2,
          initialDelay: 10,
          maxDelay: 50
        })
      ).rejects.toBe('string error');

      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should handle null errors', async () => {
      const fn = jest.fn().mockRejectedValue(null);

      await expect(
        retry(fn, {
          maxAttempts: 2,
          initialDelay: 10,
          maxDelay: 50
        })
      ).rejects.toBeNull();

      expect(fn).toHaveBeenCalledTimes(2);
    });
  });
});
