/**
 * Database Initialization Script
 *
 * This script initializes the database by running pending migrations.
 * It's designed to be safe to run multiple times (idempotent).
 *
 * Usage:
 *   npm run db:init
 *   or
 *   ts-node scripts/init-database.ts
 *
 * Environment Variables:
 *   DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_NAME
 */

import * as dotenv from 'dotenv';
import { AppDataSource } from '../src/config/database';

// Load environment variables
dotenv.config();

async function initializeDatabase() {
  console.log('🔧 Starting database initialization...\n');

  try {
    // Initialize connection
    console.log('📡 Connecting to database...');
    await AppDataSource.initialize();
    console.log('✅ Database connection established\n');

    // Show connection info
    const { database, host, port } = AppDataSource.options as any;
    console.log(`📊 Database: ${database}@${host}:${port}\n`);

    // Run migrations
    console.log('🔄 Running database migrations...');
    const migrations = await AppDataSource.runMigrations({
      transaction: 'each',
    });

    if (migrations.length === 0) {
      console.log('ℹ️  No new migrations to run - database is up to date\n');
    } else {
      console.log(`✅ Successfully ran ${migrations.length} migration(s):`);
      migrations.forEach((migration) => {
        console.log(`   - ${migration.name}`);
      });
      console.log('');
    }

    // Verify tables
    console.log('🔍 Verifying database schema...');
    const tableNames = AppDataSource.entityMetadatas.map((meta) => meta.tableName);
    console.log(`✅ Found ${tableNames.length} tables:`);
    tableNames.forEach((table) => {
      console.log(`   - ${table}`);
    });
    console.log('');

    // Display success message
    console.log('✨ Database initialization completed successfully!\n');
    console.log('📝 Summary:');
    console.log(`   • Database: ${database}`);
    console.log(`   • Tables: ${tableNames.length}`);
    console.log(`   • Migrations run: ${migrations.length}`);
    console.log('\n🚀 System is ready to start!\n');

  } catch (error) {
    console.error('❌ Database initialization failed!\n');
    console.error('Error details:', error);

    // Provide helpful error messages
    if (error instanceof Error) {
      if (error.message.includes('connect')) {
        console.error('\n💡 Troubleshooting:');
        console.error('   1. Ensure PostgreSQL is running');
        console.error('   2. Check DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD in .env');
        console.error('   3. Verify database exists: CREATE DATABASE opclaw;');
      } else if (error.message.includes('permission')) {
        console.error('\n💡 Troubleshooting:');
        console.error('   1. Check database user permissions');
        console.error('   2. Grant necessary privileges to user');
      } else if (error.message.includes('already exists')) {
        console.error('\n💡 Note: This is normal if migrations were already run');
        console.error('   The script is idempotent and safe to run multiple times');
      }
    }

    process.exit(1);
  } finally {
    // Close connection
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
      console.log('🔌 Database connection closed\n');
    }
  }
}

// Run initialization
initializeDatabase().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
