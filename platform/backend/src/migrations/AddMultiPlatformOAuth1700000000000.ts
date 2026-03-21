import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add Multi-Platform OAuth Support
 *
 * Purpose: Extend User entity to support multiple OAuth platforms (Feishu, DingTalk)
 *
 * Task: TASK-008 - Database Schema Changes for Multi-Platform OAuth
 * Issue: #23 - DingTalk OAuth Support
 *
 * Changes:
 * - Add oauth_platform field (default: 'feishu' for backward compatibility)
 * - Add dingtalk_union_id field (nullable)
 * - Make feishu_user_id nullable (for multi-platform support)
 * - Add index on oauth_platform for query optimization
 * - Add index on dingtalk_union_id
 * - Update existing Feishu users to set oauth_platform='feishu'
 *
 * Note: dingtalk_user_id field and UNIQUE constraint already added in TASK-003
 *
 * Migration ID: 1700000000000 (timestamp-based for sorting)
 */
export class AddMultiPlatformOAuth1700000000000
  implements MigrationInterface {
  name = 'AddMultiPlatformOAuth1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add oauth_platform field (default: 'feishu')
    const oauthPlatformColumnExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users'
        AND column_name = 'oauth_platform'
      );
    `);

    if (!oauthPlatformColumnExists.rows[0].exists) {
      await queryRunner.query(`
        ALTER TABLE "users"
        ADD COLUMN "oauth_platform" varchar(20) DEFAULT 'feishu'
      `);
      console.log('✅ Added oauth_platform column (default: feishu)');
    } else {
      console.log('ℹ️  oauth_platform column already exists');
    }

    // 2. Add dingtalk_union_id field (nullable)
    const dingtalkUnionIdColumnExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users'
        AND column_name = 'dingtalk_union_id'
      );
    `);

    if (!dingtalkUnionIdColumnExists.rows[0].exists) {
      await queryRunner.query(`
        ALTER TABLE "users"
        ADD COLUMN "dingtalk_union_id" varchar(255)
      `);
      console.log('✅ Added dingtalk_union_id column');
    } else {
      console.log('ℹ️  dingtalk_union_id column already exists');
    }

    // 3. Make feishu_user_id nullable (for multi-platform support)
    // Check if feishu_user_id is currently NOT NULL
    const feishuUserIdNullable = await queryRunner.query(`
      SELECT is_nullable
      FROM information_schema.columns
      WHERE table_name = 'users'
      AND column_name = 'feishu_user_id'
    `);

    if (feishuUserIdNullable.rows.length > 0 &&
        feishuUserIdNullable.rows[0].is_nullable === 'NO') {
      await queryRunner.query(`
        ALTER TABLE "users"
        ALTER COLUMN "feishu_user_id" DROP NOT NULL
      `);
      console.log('✅ Made feishu_user_id nullable');
    } else {
      console.log('ℹ️  feishu_user_id is already nullable');
    }

    // 4. Create index on oauth_platform (for query optimization)
    const oauthPlatformIndexExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'IDX_users_oauth_platform'
      );
    `);

    if (!oauthPlatformIndexExists.rows[0].exists) {
      await queryRunner.query(`
        CREATE INDEX "IDX_users_oauth_platform"
        ON "users" ("oauth_platform")
      `);
      console.log('✅ Created index on oauth_platform');
    } else {
      console.log('ℹ️  Index on oauth_platform already exists');
    }

    // 5. Create index on dingtalk_union_id
    const dingtalkUnionIdIndexExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'IDX_users_dingtalk_union_id'
      );
    `);

    if (!dingtalkUnionIdIndexExists.rows[0].exists) {
      await queryRunner.query(`
        CREATE INDEX "IDX_users_dingtalk_union_id"
        ON "users" ("dingtalk_union_id")
        WHERE "dingtalk_union_id" IS NOT NULL
      `);
      console.log('✅ Created index on dingtalk_union_id');
    } else {
      console.log('ℹ️  Index on dingtalk_union_id already exists');
    }

    // 6. Update existing Feishu users to set oauth_platform='feishu'
    // Only update users who have feishu_user_id but oauth_platform is NULL or 'feishu'
    const updateResult = await queryRunner.query(`
      UPDATE "users"
      SET "oauth_platform" = 'feishu'
      WHERE "feishu_user_id" IS NOT NULL
      AND ("oauth_platform" IS NULL OR "oauth_platform" = 'feishu')
    `);

    console.log(`✅ Updated ${updateResult.rowCount || 0} existing Feishu users`);

    // 7. Add comments for documentation
    await queryRunner.query(`
      COMMENT ON COLUMN "users"."oauth_platform" IS
      'OAuth platform identifier (feishu/dingtalk). Default: feishu for backward compatibility (TASK-008)'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "users"."dingtalk_union_id" IS
      'DingTalk cross-application user identifier (union_id) for multi-platform support (TASK-008)'
    `);

    console.log('✅ Added column comments for documentation');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rollback operations in reverse order

    // 1. Remove comments
    await queryRunner.query(`
      COMMENT ON COLUMN "users"."oauth_platform" IS NULL
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "users"."dingtalk_union_id" IS NULL
    `);

    console.log('✅ Removed column comments');

    // 2. Drop index on dingtalk_union_id
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_users_dingtalk_union_id"
    `);
    console.log('✅ Dropped index on dingtalk_union_id');

    // 3. Drop index on oauth_platform
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_users_oauth_platform"
    `);
    console.log('✅ Dropped index on oauth_platform');

    // 4. Make feishu_user_id NOT NULL (revert to original)
    await queryRunner.query(`
      ALTER TABLE "users"
      ALTER COLUMN "feishu_user_id" SET NOT NULL
    `);
    console.log('✅ Made feishu_user_id NOT NULL');

    // 5. Drop dingtalk_union_id column
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "dingtalk_union_id"
    `);
    console.log('✅ Dropped dingtalk_union_id column');

    // 6. Drop oauth_platform column
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "oauth_platform"
    `);
    console.log('✅ Dropped oauth_platform column');

    console.log('✅ Migration rollback completed');
  }
}
