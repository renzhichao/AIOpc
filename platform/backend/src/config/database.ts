import { DataSource } from 'typeorm';
import { join } from 'path';
import { User, Instance, ApiKey, Document, DocumentChunk, QRCode, InstanceRenewal } from '../entities';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'opclaw',
  password: process.env.DB_PASSWORD || 'opclaw',
  database: process.env.DB_NAME || 'opclaw',
  synchronize: process.env.NODE_ENV !== 'production',
  logging: process.env.NODE_ENV === 'development' ? true : false,
  entities: [User, Instance, ApiKey, Document, DocumentChunk, QRCode, InstanceRenewal],
  migrations: [join(__dirname, '..', 'migrations', '**', '*{.ts,.js}')],
  subscribers: [],
});
