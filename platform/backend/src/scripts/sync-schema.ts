import 'reflect-metadata';
import { AppDataSource } from '../config/database';
import { logger } from '../config/logger';

async function syncSchema() {
  console.log('🔄 Starting schema synchronization...');

  try {
    // Initialize the data source
    await AppDataSource.initialize();
    console.log('✅ Database connection established');

    // Synchronize schema
    console.log('🔄 Synchronizing schema...');
    await AppDataSource.synchronize();
    console.log('✅ Schema synchronized successfully');

    // Close connection
    await AppDataSource.destroy();
    console.log('✅ Database connection closed');
  } catch (error) {
    console.error('❌ Schema synchronization failed:', error);
    process.exit(1);
  }
}

syncSchema();
