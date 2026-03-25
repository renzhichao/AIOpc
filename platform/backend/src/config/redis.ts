import Redis from 'ioredis';

/**
 * Redis Configuration
 *
 * Production-ready Redis client with:
 * - Connection pooling
 * - Retry strategies
 * - Connection timeout handling
 * - Error logging
 */


// Redis connection configuration
const redisConfig = {
  // Connection settings
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),

  // Connection timeout
  connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || '10000'),
  commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT || '3000'),

  // Retry strategy for production resilience
  maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES_PER_REQUEST || '3'),
  retryStrategy: (times: number) => {
    const delay = Math.min(times * parseInt(process.env.REDIS_RETRY_STRATEGY_DELAY || '50'), 2000);
    // After 3 retries, use exponential backoff
    if (times > 3) {
      return Math.min(delay * 2, 5000);
    }
    return delay;
  },

  // Reconnection strategy
  enableReadyCheck: true,
  enableOfflineQueue: true,

  // Keep-alive settings
  keepAlive: 30000,

  // Connection pool settings
  family: 4, // IPv4
  // DNS lookup
  lazyConnect: false,
};

// Create Redis client
export const redis = new Redis(redisConfig);

// Event handlers for monitoring
redis.on('connect', () => {
  console.log('Redis Client Connected');
});

redis.on('ready', () => {
  console.log('Redis Client Ready');
});

redis.on('error', (err) => {
  console.error('Redis Client Error:', err.message);
});

redis.on('close', () => {
  console.warn('Redis Connection Closed');
});

redis.on('reconnecting', (delay: number) => {
  console.log(`Redis Reconnecting in ${delay}ms`);
});

// Health check function
export async function checkRedisHealth(): Promise<boolean> {
  try {
    const result = await redis.ping();
    return result === 'PONG';
  } catch (error) {
    console.error('Redis health check failed:', error);
    return false;
  }
}

// Graceful shutdown handler
export async function closeRedisConnection(): Promise<void> {
  try {
    await redis.quit();
    console.log('Redis connection closed gracefully');
  } catch (error) {
    console.error('Error closing Redis connection:', error);
    // Force close if graceful shutdown fails
    redis.disconnect();
  }
}
