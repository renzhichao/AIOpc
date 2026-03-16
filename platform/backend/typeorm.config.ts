import { DataSource, DataSourceOptions } from 'typeorm';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'opclaw',
  password: process.env.DB_PASSWORD || 'opclaw',
  database: process.env.DB_NAME || 'opclaw',
  synchronize: false,
  logging: process.env.NODE_ENV === 'development' ? true : false,
  entities: ['src/entities/**/*.entity.ts'],
  migrations: ['migrations/**/*.ts'],
  subscribers: [],
};

export default new DataSource(dataSourceOptions);
