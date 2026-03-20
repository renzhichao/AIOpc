import { DataSource } from 'typeorm';
import { join } from 'path';
import { User, Instance, ApiKey, Document, DocumentChunk, QRCode, InstanceRenewal, InstanceMetric } from '../entities';
import { Conversation, ConversationMessage } from '../entities';

/**
 * Database Configuration
 *
 * Synchronization Behavior:
 * - Development (NODE_ENV=development): synchronize=true unless DB_SYNC=false
 * - Production (NODE_ENV=production): synchronize=false by default
 * - Override: Set DB_SYNC=true to force synchronize in any environment
 *
 * ⚠️ WARNING: DB_SYNC=true should only be used for:
 * - Quick testing/validation
 * - Initial setup
 * - NEVER in long-term production use
 *
 * For production deployment:
 * 1. Set NODE_ENV=production
 * 2. Run migrations: npm run db:migrate
 * 3. Or use DB_SYNC=true for initial setup, then disable
 */
const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';
const dbSyncEnabled = process.env.DB_SYNC === 'true';

// Allow DB_SYNC to override synchronize behavior in any environment
// This is useful for quick validation, but should be disabled for production
const synchronize = dbSyncEnabled;

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
  entities: [User, Instance, ApiKey, Document, DocumentChunk, QRCode, InstanceRenewal, InstanceMetric, Conversation, ConversationMessage],
  // Migrations should be run explicitly via CLI, not loaded during app startup
  // This prevents TypeDI container initialization issues
  // Use: npm run db:migrate to run migrations
  migrations: [],
  subscribers: [],

  // Production connection pool configuration
  extra: {
    // Connection pool settings
    max: maxConnections,
    min: minConnections,

    // Timeouts - increased to prevent premature disconnection
    connectionTimeoutMillis: connectionTimeout,
    idleTimeoutMillis: idleTimeout * 10, // 5 minutes instead of 30 seconds
    statement_timeout: parseInt(process.env.DB_QUERY_TIMEOUT || '60000'),

    // Connection validation - check before each use
    validateConnectionForEachUsage: true,

    // TCP Keepalive settings to prevent connection drops
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000, // 10 seconds

    // Performance optimizations
    statement_cache_size: 100,
    query_cache_size: 100,

    // Automatic reconnection with more attempts
    reconnectAttempts: 10,
    reconnectDelayMilliseconds: 3000,
  },
});
