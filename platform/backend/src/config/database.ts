import { DataSource } from 'typeorm';
import { join } from 'path';
import { User, Instance, ApiKey, Document, DocumentChunk, QRCode, InstanceRenewal, InstanceMetric } from '../entities';

/**
 * Database Configuration
 *
 * Synchronization Behavior:
 * - Development (NODE_ENV=development): synchronize=true unless DB_SYNC=false
 * - Production (NODE_ENV=production): synchronize=false, migrations required
 *
 * For production deployment:
 * 1. Set NODE_ENV=production
 * 2. Run migrations: npm run db:migrate
 * 3. Or use initialization script: npm run db:init
 */
const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';
const dbSyncEnabled = process.env.DB_SYNC === 'true';

// In development, allow sync unless explicitly disabled
// In production, never use sync - always use migrations
const synchronize = isDevelopment ? dbSyncEnabled : false;

// Configure logging based on environment
const logging = isDevelopment
  ? true
  : isProduction
    ? (['error'] as any)
    : false;

// Production-optimized connection pooling
const maxConnections = parseInt(process.env.DB_MAX_CONNECTIONS || '20');
const minConnections = parseInt(process.env.DB_MIN_CONNECTIONS || '5');
const connectionTimeout = parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000');
const idleTimeout = parseInt(process.env.DB_IDLE_TIMEOUT || '30000');

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'opclaw',
  password: process.env.DB_PASSWORD || 'opclaw',
  database: process.env.DB_NAME || 'opclaw',
  synchronize,
  logging,
  entities: [User, Instance, ApiKey, Document, DocumentChunk, QRCode, InstanceRenewal, InstanceMetric],
  migrations: [join(__dirname, '../../migrations/**/*.ts')],
  subscribers: [],

  // Production connection pool configuration
  extra: {
    // Connection pool settings
    max: maxConnections,
    min: minConnections,

    // Timeouts
    connectionTimeoutMillis: connectionTimeout,
    idleTimeoutMillis: idleTimeout,
    statement_timeout: parseInt(process.env.DB_QUERY_TIMEOUT || '30000'),

    // Connection validation
    validateConnectionForEachUsage: isProduction,

    // Performance optimizations
    statement_cache_size: 100,
    query_cache_size: 100,

    // Automatic reconnection
    reconnectAttempts: 3,
    reconnectDelayMilliseconds: 2000,
  },
});
