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
const dbSyncEnabled = process.env.DB_SYNC === 'true';

// In development, allow sync unless explicitly disabled
// In production, never use sync - always use migrations
const synchronize = isDevelopment ? dbSyncEnabled : false;

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'opclaw',
  password: process.env.DB_PASSWORD || 'opclaw',
  database: process.env.DB_NAME || 'opclaw',
  synchronize,
  logging: process.env.NODE_ENV === 'development' ? true : false,
  entities: [User, Instance, ApiKey, Document, DocumentChunk, QRCode, InstanceRenewal, InstanceMetric],
  migrations: [join(__dirname, '../../migrations/**/*.ts')],
  subscribers: [],
});
