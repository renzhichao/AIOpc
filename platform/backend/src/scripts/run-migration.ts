import 'reflect-metadata';
import { AppDataSource } from '../config/database';

async function runMigrations() {
  console.log('🚀 Starting database migrations...');

  try {
    // Initialize the data source
    await AppDataSource.initialize();
    console.log('✅ Database connection established');

    // Run migrations
    await AppDataSource.runMigrations();
    console.log('✅ Migrations executed successfully');

    // Close connection
    await AppDataSource.destroy();
    console.log('✅ Database connection closed');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();
