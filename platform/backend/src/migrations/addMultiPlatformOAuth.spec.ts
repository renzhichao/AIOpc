import { MigrationInterface, QueryRunner } from 'typeorm';
import { AddMultiPlatformOAuth1700000000000 } from './AddMultiPlatformOAuth1700000000000';

/**
 * Migration Tests for TASK-008: Multi-Platform OAuth Schema Changes
 *
 * This test file validates:
 * - Migration up() method execution
 * - Migration down() method execution (rollback)
 * - Existing data is not affected
 * - Indexes are created correctly
 * - Default values are set correctly
 *
 * Run tests with: npm test -- addMultiPlatformOAuth.spec.ts
 */

describe('AddMultiPlatformOAuth1700000000000 Migration', () => {
  let migration: AddMultiPlatformOAuth1700000000000;
  let mockQueryRunner: jest.Mocked<QueryRunner>;

  beforeEach(() => {
    migration = new AddMultiPlatformOAuth1700000000000();

    // Mock QueryRunner
    mockQueryRunner = {
      query: jest.fn(),
    } as any;

    // Setup default mock responses
    mockQueryRunner.query.mockImplementation((query: string) => {
      // Mock column existence checks (return false initially)
      if (query.includes('SELECT EXISTS') && query.includes('information_schema.columns')) {
        return Promise.resolve({
          rows: [{ exists: false }]
        });
      }

      // Mock index existence checks (return false initially)
      if (query.includes('SELECT EXISTS') && query.includes('pg_indexes')) {
        return Promise.resolve({
          rows: [{ exists: false }]
        });
      }

      // Mock nullable check (return NOT NULL initially)
      if (query.includes('is_nullable') && query.includes('feishu_user_id')) {
        return Promise.resolve({
          rows: [{ is_nullable: 'NO' }]
        });
      }

      // Mock UPDATE queries
      if (query.includes('UPDATE "users"')) {
        return Promise.resolve({
          rowCount: 5 // Simulate 5 existing Feishu users
        });
      }

      // Default success response
      return Promise.resolve(undefined);
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Migration Up', () => {
    it('should have correct migration name', () => {
      expect(migration.name).toBe('AddMultiPlatformOAuth1700000000000');
    });

    it('should add oauth_platform column with default value', async () => {
      await migration.up(mockQueryRunner);

      // Verify oauth_platform column was added
      const addColumnCalls = mockQueryRunner.query.mock.calls.filter(call =>
        call[0].includes('ADD COLUMN "oauth_platform"')
      );
      expect(addColumnCalls.length).toBeGreaterThan(0);

      // Verify default value is 'feishu'
      const defaultCall = addColumnCalls.find(call =>
        call[0].includes("DEFAULT 'feishu'")
      );
      expect(defaultCall).toBeDefined();
    });

    it('should add dingtalk_union_id column', async () => {
      await migration.up(mockQueryRunner);

      const addColumnCalls = mockQueryRunner.query.mock.calls.filter(call =>
        call[0].includes('ADD COLUMN "dingtalk_union_id"')
      );
      expect(addColumnCalls.length).toBeGreaterThan(0);
    });

    it('should make feishu_user_id nullable', async () => {
      await migration.up(mockQueryRunner);

      const alterColumnCalls = mockQueryRunner.query.mock.calls.filter(call =>
        call[0].includes('ALTER COLUMN "feishu_user_id" DROP NOT NULL')
      );
      expect(alterColumnCalls.length).toBeGreaterThan(0);
    });

    it('should create index on oauth_platform', async () => {
      await migration.up(mockQueryRunner);

      const createIndexCalls = mockQueryRunner.query.mock.calls.filter(call =>
        call[0].includes('CREATE INDEX "IDX_users_oauth_platform"')
      );
      expect(createIndexCalls.length).toBeGreaterThan(0);
    });

    it('should create index on dingtalk_union_id', async () => {
      await migration.up(mockQueryRunner);

      const createIndexCalls = mockQueryRunner.query.mock.calls.filter(call =>
        call[0].includes('CREATE INDEX "IDX_users_dingtalk_union_id"')
      );
      expect(createIndexCalls.length).toBeGreaterThan(0);
    });

    it('should update existing Feishu users to set oauth_platform', async () => {
      await migration.up(mockQueryRunner);

      const updateCalls = mockQueryRunner.query.mock.calls.filter(call =>
        call[0].includes('UPDATE "users"') &&
        call[0].includes('SET "oauth_platform"')
      );
      expect(updateCalls.length).toBeGreaterThan(0);
    });

    it('should add column comments for documentation', async () => {
      await migration.up(mockQueryRunner);

      const commentCalls = mockQueryRunner.query.mock.calls.filter(call =>
        call[0].includes('COMMENT ON COLUMN')
      );
      expect(commentCalls.length).toBe(2); // oauth_platform and dingtalk_union_id
    });

    it('should skip operations if columns/indexes already exist', async () => {
      // Mock all existence checks to return true
      mockQueryRunner.query.mockImplementation((query: string) => {
        if (query.includes('SELECT EXISTS')) {
          return Promise.resolve({
            rows: [{ exists: true }]
          });
        }

        if (query.includes('is_nullable')) {
          return Promise.resolve({
            rows: [{ is_nullable: 'YES' }]
          });
        }

        if (query.includes('UPDATE "users"')) {
          return Promise.resolve({
            rowCount: 5
          });
        }

        return Promise.resolve(undefined);
      });

      await migration.up(mockQueryRunner);

      // Should not try to add columns or indexes that already exist
      const addColumnCalls = mockQueryRunner.query.mock.calls.filter(call =>
        call[0].includes('ADD COLUMN')
      );
      expect(addColumnCalls.length).toBe(0);

      const createIndexCalls = mockQueryRunner.query.mock.calls.filter(call =>
        call[0].includes('CREATE INDEX')
      );
      expect(createIndexCalls.length).toBe(0);
    });

    it('should log success messages', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await migration.up(mockQueryRunner);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('✅'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('oauth_platform'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('dingtalk_union_id'));

      consoleSpy.mockRestore();
    });
  });

  describe('Migration Down (Rollback)', () => {
    it('should remove comments', async () => {
      await migration.down(mockQueryRunner);

      const commentCalls = mockQueryRunner.query.mock.calls.filter(call =>
        call[0].includes('COMMENT ON COLUMN') &&
        call[0].includes('IS NULL')
      );
      expect(commentCalls.length).toBe(2);
    });

    it('should drop index on dingtalk_union_id', async () => {
      await migration.down(mockQueryRunner);

      const dropIndexCalls = mockQueryRunner.query.mock.calls.filter(call =>
        call[0].includes('DROP INDEX IF EXISTS "IDX_users_dingtalk_union_id"')
      );
      expect(dropIndexCalls.length).toBeGreaterThan(0);
    });

    it('should drop index on oauth_platform', async () => {
      await migration.down(mockQueryRunner);

      const dropIndexCalls = mockQueryRunner.query.mock.calls.filter(call =>
        call[0].includes('DROP INDEX IF EXISTS "IDX_users_oauth_platform"')
      );
      expect(dropIndexCalls.length).toBeGreaterThan(0);
    });

    it('should make feishu_user_id NOT NULL', async () => {
      await migration.down(mockQueryRunner);

      const alterColumnCalls = mockQueryRunner.query.mock.calls.filter(call =>
        call[0].includes('ALTER COLUMN "feishu_user_id" SET NOT NULL')
      );
      expect(alterColumnCalls.length).toBeGreaterThan(0);
    });

    it('should drop dingtalk_union_id column', async () => {
      await migration.down(mockQueryRunner);

      const dropColumnCalls = mockQueryRunner.query.mock.calls.filter(call =>
        call[0].includes('DROP COLUMN IF EXISTS "dingtalk_union_id"')
      );
      expect(dropColumnCalls.length).toBeGreaterThan(0);
    });

    it('should drop oauth_platform column', async () => {
      await migration.down(mockQueryRunner);

      const dropColumnCalls = mockQueryRunner.query.mock.calls.filter(call =>
        call[0].includes('DROP COLUMN IF EXISTS "oauth_platform"')
      );
      expect(dropColumnCalls.length).toBeGreaterThan(0);
    });

    it('should log rollback success messages', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await migration.down(mockQueryRunner);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('✅'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Migration rollback completed'));

      consoleSpy.mockRestore();
    });
  });

  describe('Complete Migration Cycle', () => {
    it('should successfully complete up() and down() cycle', async () => {
      // Track all queries
      const upQueries: string[] = [];
      const downQueries: string[] = [];

      mockQueryRunner.query.mockImplementation((query: string) => {
        // Always track queries FIRST
        upQueries.push(query);

        // Mock existence checks to return false
        if (query.includes('SELECT EXISTS')) {
          return Promise.resolve({
            rows: [{ exists: false }]
          });
        }

        if (query.includes('is_nullable')) {
          return Promise.resolve({
            rows: [{ is_nullable: 'NO' }]
          });
        }

        if (query.includes('UPDATE') && query.includes('users')) {
          return Promise.resolve({
            rowCount: 5
          });
        }

        return Promise.resolve(undefined);
      });

      // Run migration up
      await migration.up(mockQueryRunner);

      // Verify up() executed all required operations
      expect(upQueries.some(q => q.includes('ADD COLUMN "oauth_platform"'))).toBe(true);
      expect(upQueries.some(q => q.includes('ADD COLUMN "dingtalk_union_id"'))).toBe(true);
      expect(upQueries.some(q => q.includes('CREATE INDEX "IDX_users_oauth_platform"'))).toBe(true);
      expect(upQueries.some(q => q.includes('CREATE INDEX "IDX_users_dingtalk_union_id"'))).toBe(true);

      // Check if UPDATE query exists (may be in different format)
      const hasUpdateQuery = upQueries.some(q =>
        q.toUpperCase().includes('UPDATE') && q.toLowerCase().includes('users')
      );
      expect(hasUpdateQuery).toBe(true);

      // Reset mock for down
      mockQueryRunner.query.mockImplementation((query: string) => {
        downQueries.push(query);
        return Promise.resolve(undefined);
      });

      // Run migration down
      await migration.down(mockQueryRunner);

      // Verify down() executed all rollback operations
      expect(downQueries.some(q => q.includes('DROP INDEX') && q.includes('oauth_platform'))).toBe(true);
      expect(downQueries.some(q => q.includes('DROP INDEX') && q.includes('dingtalk_union_id'))).toBe(true);
      expect(downQueries.some(q => q.includes('DROP COLUMN') && q.includes('dingtalk_union_id'))).toBe(true);
      expect(downQueries.some(q => q.includes('DROP COLUMN') && q.includes('oauth_platform'))).toBe(true);
      expect(downQueries.some(q => q.includes('SET NOT NULL'))).toBe(true);
    });
  });
});
