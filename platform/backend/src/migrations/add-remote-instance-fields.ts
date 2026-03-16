/**
 * Database Migration: Add Remote Instance Fields
 *
 * This migration adds fields to support remote instance registration:
 * - deployment_type: 'local' | 'remote'
 * - remote_host: hostname/IP for remote instances
 * - remote_port: port for remote instances
 * - remote_version: OpenClaw Agent version
 * - platform_api_key: API key for remote instance authentication
 * - last_heartbeat_at: timestamp of last heartbeat
 * - heartbeat_interval: heartbeat interval in milliseconds
 * - capabilities: comma-separated list of capabilities
 * - remote_metadata: additional metadata as JSONB
 *
 * Run: npm run migration:add-remote-instance-fields
 */

import { AppDataSource } from '../config/database';
import { QueryRunner } from 'typeorm';
import { logger } from '../config/logger';

export async function up(queryRunner: QueryRunner): Promise<void> {
  try {
    logger.info('Running migration: Add Remote Instance Fields');

    // Add deployment_type column
    await queryRunner.query(`
      ALTER TABLE instances
      ADD COLUMN IF NOT EXISTS deployment_type VARCHAR(20)
      DEFAULT 'local'
      CHECK (deployment_type IN ('local', 'remote'))
    `);

    // Add index on deployment_type
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_deployment_type
      ON instances(deployment_type)
    `);

    // Add remote_host column
    await queryRunner.query(`
      ALTER TABLE instances
      ADD COLUMN IF NOT EXISTS remote_host VARCHAR(255)
    `);

    // Add remote_port column
    await queryRunner.query(`
      ALTER TABLE instances
      ADD COLUMN IF NOT EXISTS remote_port INTEGER
    `);

    // Add remote_version column
    await queryRunner.query(`
      ALTER TABLE instances
      ADD COLUMN IF NOT EXISTS remote_version VARCHAR(50)
    `);

    // Add platform_api_key column
    await queryRunner.query(`
      ALTER TABLE instances
      ADD COLUMN IF NOT EXISTS platform_api_key VARCHAR(255)
    `);

    // Add last_heartbeat_at column
    await queryRunner.query(`
      ALTER TABLE instances
      ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMP
    `);

    // Add index on last_heartbeat_at
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_last_heartbeat
      ON instances(last_heartbeat_at)
    `);

    // Add heartbeat_interval column
    await queryRunner.query(`
      ALTER TABLE instances
      ADD COLUMN IF NOT EXISTS heartbeat_interval INTEGER
      DEFAULT 30000
    `);

    // Add capabilities column
    await queryRunner.query(`
      ALTER TABLE instances
      ADD COLUMN IF NOT EXISTS capabilities TEXT
    `);

    // Add remote_metadata column
    await queryRunner.query(`
      ALTER TABLE instances
      ADD COLUMN IF NOT EXISTS remote_metadata JSONB
    `);

    logger.info('Migration completed successfully: Add Remote Instance Fields');
  } catch (error) {
    logger.error('Migration failed: Add Remote Instance Fields', {
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

export async function down(queryRunner: QueryRunner): Promise<void> {
  try {
    logger.info('Rolling back migration: Add Remote Instance Fields');

    // Drop columns in reverse order
    await queryRunner.query(`ALTER TABLE instances DROP COLUMN IF EXISTS remote_metadata`);
    await queryRunner.query(`ALTER TABLE instances DROP COLUMN IF EXISTS capabilities`);
    await queryRunner.query(`ALTER TABLE instances DROP COLUMN IF EXISTS heartbeat_interval`);
    await queryRunner.query(`ALTER TABLE instances DROP COLUMN IF EXISTS last_heartbeat_at`);
    await queryRunner.query(`ALTER TABLE instances DROP COLUMN IF EXISTS platform_api_key`);
    await queryRunner.query(`ALTER TABLE instances DROP COLUMN IF EXISTS remote_version`);
    await queryRunner.query(`ALTER TABLE instances DROP COLUMN IF EXISTS remote_port`);
    await queryRunner.query(`ALTER TABLE instances DROP COLUMN IF EXISTS remote_host`);
    await queryRunner.query(`ALTER TABLE instances DROP COLUMN IF EXISTS deployment_type`);

    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS idx_last_heartbeat`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_deployment_type`);

    logger.info('Rollback completed: Add Remote Instance Fields');
  } catch (error) {
    logger.error('Rollback failed: Add Remote Instance Fields', {
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}
