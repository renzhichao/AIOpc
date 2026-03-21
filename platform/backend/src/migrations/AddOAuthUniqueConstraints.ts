import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add OAuth Unique Constraints for Concurrent User Creation Protection
 *
 * Purpose: Prevent duplicate user creation from concurrent OAuth callbacks
 *
 * Changes:
 * - Add UNIQUE constraint on feishu_user_id (if not exists)
 * - Add UNIQUE constraint on dingtalk_user_id (nullable, for future use)
 *
 * Task: TASK-003 - Database Concurrent User Creation Protection
 * Issue: #23 - DingTalk OAuth Support
 *
 * PostgreSQL Error Code 23505: unique_violation
 * - This constraint will trigger error 23505 on duplicate insertion attempts
 * - Application layer will catch this error and retry with user lookup instead
 */
export class AddOAuthUniqueConstraints1735640400000
  implements MigrationInterface {
  name = 'AddOAuthUniqueConstraints1735640400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if unique constraint already exists on feishu_user_id
    const feishuConstraintExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'UQ_users_feishu_user_id'
      );
    `);

    // Add UNIQUE constraint on feishu_user_id if not exists
    if (!feishuConstraintExists.rows[0].exists) {
      await queryRunner.query(`
        ALTER TABLE "users"
        ADD CONSTRAINT "UQ_users_feishu_user_id" UNIQUE ("feishu_user_id")
      `);
      console.log('✅ Added UNIQUE constraint on feishu_user_id');
    } else {
      console.log('ℹ️  UNIQUE constraint on feishu_user_id already exists');
    }

    // Add dingtalk_user_id column (nullable) for TASK-008 preparation
    const dingtalkColumnExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users'
        AND column_name = 'dingtalk_user_id'
      );
    `);

    if (!dingtalkColumnExists.rows[0].exists) {
      await queryRunner.query(`
        ALTER TABLE "users"
        ADD COLUMN "dingtalk_user_id" varchar(255)
      `);
      console.log('✅ Added dingtalk_user_id column');
    } else {
      console.log('ℹ️  dingtalk_user_id column already exists');
    }

    // Add UNIQUE constraint on dingtalk_user_id (nullable unique index)
    // Using partial index for NULL values allows multiple NULLs but unique non-NULL values
    const dingtalkConstraintExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'UQ_users_dingtalk_user_id'
      );
    `);

    if (!dingtalkConstraintExists.rows[0].exists) {
      await queryRunner.query(`
        ALTER TABLE "users"
        ADD CONSTRAINT "UQ_users_dingtalk_user_id" UNIQUE ("dingtalk_user_id")
      `);
      console.log('✅ Added UNIQUE constraint on dingtalk_user_id');
    } else {
      console.log('ℹ️  UNIQUE constraint on dingtalk_user_id already exists');
    }

    // Add comment for documentation
    await queryRunner.query(`
      COMMENT ON CONSTRAINT "UQ_users_feishu_user_id" ON "users" IS
      'Prevents duplicate Feishu user creation from concurrent OAuth callbacks (TASK-003)'
    `);

    await queryRunner.query(`
      COMMENT ON CONSTRAINT "UQ_users_dingtalk_user_id" ON "users" IS
      'Prevents duplicate DingTalk user creation from concurrent OAuth callbacks (TASK-003)'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove UNIQUE constraint from dingtalk_user_id
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP CONSTRAINT IF EXISTS "UQ_users_dingtalk_user_id"
    `);
    console.log('✅ Dropped UNIQUE constraint on dingtalk_user_id');

    // Remove dingtalk_user_id column (optional - only if this migration added it)
    // Note: We check if column exists before dropping to avoid errors
    const dingtalkColumnExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users'
        AND column_name = 'dingtalk_user_id'
      );
    `);

    if (dingtalkColumnExists.rows[0].exists) {
      await queryRunner.query(`
        ALTER TABLE "users"
        DROP COLUMN IF EXISTS "dingtalk_user_id"
      `);
      console.log('✅ Dropped dingtalk_user_id column');
    }

    // Remove UNIQUE constraint from feishu_user_id
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP CONSTRAINT IF EXISTS "UQ_users_feishu_user_id"
    `);
    console.log('✅ Dropped UNIQUE constraint on feishu_user_id');
  }
}
