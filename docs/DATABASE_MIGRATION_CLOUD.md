# Cloud Database Migration Guide

> **Task**: TASK-059 - Database Migration Execution
> **Priority**: P0 CRITICAL
> **Status**: Implementation Complete, Ready for Execution

---

## Overview

This guide documents the complete database migration process for deploying the AIOpc platform to the cloud server (118.25.0.190).

**CRITICAL**: Unlike TASK-051 which only created migration files, this task actually **EXECUTES** the migration to create the database schema.

---

## Database Schema

### Expected Tables (8 tables)

1. **users** - User accounts from Feishu OAuth
   - Primary key: `id`
   - Feishu user ID, union ID, name, email, avatar
   - Created at, last login at

2. **api_keys** - API key management for LLM providers
   - Primary key: `id`
   - Provider, encrypted key, status, usage count, quota
   - Current instance ID assignment
   - Created at, last used at

3. **qr_codes** - OAuth QR code management
   - Primary key: `id`
   - Instance ID, token, state, expires at
   - Scan count, claimed at

4. **instances** - Docker instance records
   - Primary key: `id`
   - Instance ID (unique), status, template, name
   - JSONB config, owner (FK to users)
   - Docker container ID, health status
   - Created at, updated at, expires at, claimed at

5. **documents** - Document storage
   - Primary key: `id`
   - Instance ID, title, content, category
   - JSONB metadata
   - Created at, updated at

6. **document_chunks** - Document chunks for vector search
   - Primary key: `id`
   - Document ID (FK to documents), chunk index
   - Content, JSONB embedding
   - Created at

7. **instance_metrics** - Metrics collection
   - Primary key: `id`
   - Instance ID (FK to instances), metric type
   - Metric value, unit, recorded at
   - CHECK constraint on metric types

8. **instance_renewals** - Instance renewal history
   - Primary key: `id`
   - Instance ID (FK to instances)
   - Old/new expires at, duration days
   - Renewed by (FK to users), renewed at

### Foreign Key Relationships

```
instances.owner_id → users.id
document_chunks.document_id → documents.id
instance_metrics.instance_id → instances.instance_id
instance_renewals.instance_id → instances.instance_id
instance_renewals.renewed_by → users.id
```

### Indexes

- **users**: feishu_user_id
- **api_keys**: provider, status
- **qr_codes**: instance_id, token, expires_at
- **instances**: instance_id, status, owner_id, health_status
- **documents**: instance_id, category
- **document_chunks**: document_id, embedding
- **instance_metrics**: (instance_id, recorded_at), (metric_type, recorded_at)
- **instance_renewals**: instance_id, renewed_by

---

## Migration Scripts

### 1. deploy-database.sh

**Purpose**: Main deployment script that orchestrates the entire migration process.

**Location**: `/scripts/cloud/deploy-database.sh`

**Usage**:
```bash
cd /Users/arthurren/projects/AIOpc/scripts/cloud
./deploy-database.sh [OPTIONS]
```

**Options**:
- `--dry-run` - Show what would be done without executing
- `--skip-init` - Skip database initialization (if already done)
- `--skip-migrate` - Skip migration execution (for testing)
- `--verify-only` - Only verify existing database
- `--help` - Show help message

**Environment Variables**:
- `SERVER` - Server address (default: root@118.25.0.190)
- `DB_NAME` - Database name (default: opclaw)
- `DB_USER` - Database user (default: opclaw)
- `DB_PASSWORD` - Database password (default: opclaw123)
- `BACKEND_PATH` - Backend path on server (default: /opt/opclaw/backend)

**What It Does**:
1. Validates local files (migration files, TypeORM config)
2. Checks server connectivity
3. Checks server environment (Node.js, pnpm, PostgreSQL)
4. Uploads backend files to server
5. Installs dependencies via pnpm
6. Initializes database (creates DB and user)
7. Executes TypeORM migration
8. Verifies schema (table count, critical tables, foreign keys, indexes)

### 2. run-migration.sh

**Purpose**: Execute TypeORM migration on the server.

**Location**: `/scripts/cloud/run-migration.sh`

**Usage**:
```bash
# On the server
export DB_PASSWORD="your-password"
./run-migration.sh [OPTIONS]
```

**Options**:
- `--dry-run` - Show what would be done without executing
- `--revert` - Revert the last migration
- `--show` - Show available migrations and current status
- `--help` - Show help message

**What It Does**:
1. Creates `.env` file with database credentials
2. Runs `npm run db:migrate` (TypeORM migration)
3. Verifies tables were created
4. Lists all created tables

### 3. verify-database.sh

**Purpose**: Verify database schema after migration.

**Location**: `/scripts/cloud/verify-database.sh`

**Usage**:
```bash
# Local verification
sudo ./verify-database.sh

# Remote verification
./verify-database.sh --remote

# Remote with custom server
./verify-database.sh --remote --server root@118.25.0.190

# Quiet mode (minimal output)
./verify-database.sh --quiet
```

**What It Checks**:
1. Database exists
2. Table count (≥ 8 tables)
3. All critical tables exist
4. Table schemas are correct
5. Foreign keys are created
6. Indexes are created
7. Constraints are created
8. Read/write operations work

---

## Execution Procedure

### Phase 1: Preparation (Local)

1. **Verify migration files exist**:
   ```bash
   ls -lh platform/backend/migrations/
   ```
   Should show: `1700000000000-InitialSchema.ts`

2. **Review migration content**:
   ```bash
   cat platform/backend/migrations/1700000000000-InitialSchema.ts
   ```

3. **Test scripts locally** (dry-run):
   ```bash
   cd scripts/cloud
   ./deploy-database.sh --dry-run
   ```

### Phase 2: Deployment (Execute on Server)

1. **Execute full deployment**:
   ```bash
   cd /Users/arthurren/projects/AIOpc/scripts/cloud
   ./deploy-database.sh
   ```

   This will:
   - Connect to server `root@118.25.0.190`
   - Upload backend files
   - Install dependencies
   - Initialize database
   - Run migration
   - Verify results

2. **Monitor execution**:
   - Watch for errors
   - Check log file: `/tmp/opclaw-db-deployment.log`
   - Verify each step completes successfully

### Phase 3: Verification (After Deployment)

1. **Verify database schema**:
   ```bash
   cd scripts/cloud
   ./verify-database.sh --remote
   ```

2. **Manual verification** (if needed):
   ```bash
   ssh root@118.25.0.190

   # Connect to database
   sudo -u postgres psql -d opclaw

   # List tables
   \dt

   # Check table count
   SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';

   # Exit
   \q
   ```

---

## Troubleshooting

### Issue: Migration fails with "Cannot connect to database"

**Cause**: Database not created or user permissions incorrect

**Solution**:
```bash
# On server
sudo -u postgres psql
CREATE DATABASE opclaw;
CREATE USER opclaw WITH PASSWORD 'opclaw123';
GRANT ALL PRIVILEGES ON DATABASE opclaw TO opclaw;
\q
```

### Issue: Migration fails with "relation already exists"

**Cause**: Partial migration already executed

**Solution**:
```bash
# On server, check current state
cd /opt/opclaw/backend
npm run db:migrate -- --show

# Drop and recreate database
sudo -u postgres psql
DROP DATABASE opclaw;
CREATE DATABASE opclaw;
\q

# Re-run migration
./run-migration.sh
```

### Issue: "Cannot find module 'typeorm'"

**Cause**: Dependencies not installed

**Solution**:
```bash
# On server
cd /opt/opclaw/backend
pnpm install
```

### Issue: Table count < 8

**Cause**: Migration partially failed

**Solution**:
```bash
# Check migration status
cd /opt/opclaw/backend
npm run db:migrate -- --show

# Re-run migration
npm run db:migrate

# If still failing, drop and recreate database
sudo -u postgres psql -c "DROP DATABASE opclaw;"
sudo -u postgres psql -c "CREATE DATABASE opclaw;"
npm run db:migrate
```

### Issue: "permission denied for table"

**Cause**: User lacks permissions

**Solution**:
```bash
# On server
sudo -u postgres psql -d opclaw
GRANT ALL ON SCHEMA public TO opclaw;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO opclaw;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO opclaw;
\q
```

---

## Migration File Details

### File: 1700000000000-InitialSchema.ts

**Location**: `/platform/backend/migrations/1700000000000-InitialSchema.ts`

**Creation Date**: TASK-051 (Migration Infrastructure)

**Contents**:
- Creates 8 tables with proper relationships
- Creates indexes for performance
- Creates foreign keys for data integrity
- Creates CHECK constraints for data validation
- Implements `down()` method for rollback

**Key Features**:
- Uses SERIAL primary keys
- JSONB for flexible metadata storage
- TIMESTAMP with defaults
- CHECK constraints for status enums
- CASCADE deletes for related data

---

## Database Connection Details

### Connection String

```
postgresql://opclaw:opclaw123@localhost:5432/opclaw
```

### Environment Variables

```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=opclaw
DB_USERNAME=opclaw
DB_PASSWORD=opclaw123
```

### TypeORM Configuration

File: `/platform/backend/typeorm.config.ts`

```typescript
{
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
}
```

---

## Post-Migration Steps

After successful migration:

1. **Verify application can connect**:
   ```bash
   cd /opt/opclaw/backend
   npm run db:migrate -- --show
   ```

2. **Deploy backend application** (TASK-060):
   ```bash
   cd scripts/cloud
   ./deploy-backend.sh
   ```

3. **Deploy frontend application** (TASK-061):
   ```bash
   cd scripts/cloud
   ./deploy-frontend.sh
   ```

4. **Configure Nginx** (TASK-062):
   ```bash
   cd scripts/cloud
   ./configure-nginx.sh
   ```

---

## Success Criteria

The migration is successful when:

- ✅ Database `opclaw` exists
- ✅ User `opclaw` exists with correct password
- ✅ 8 tables are created
- ✅ All foreign keys are created
- ✅ All indexes are created
- ✅ All CHECK constraints are created
- ✅ Verification script passes all checks
- ✅ Application can connect to database

---

## Related Tasks

- **TASK-051**: Created migration infrastructure (COMPLETED)
- **TASK-057**: Server environment preparation (COMPLETED)
- **TASK-059**: Database migration execution (THIS TASK)
- **TASK-060**: Backend deployment (NEXT)
- **TASK-061**: Frontend deployment (PENDING)
- **TASK-062**: Nginx configuration (PENDING)

---

## Files Created/Modified

### Created Files

1. `/scripts/cloud/deploy-database.sh` - Main deployment script
2. `/scripts/cloud/run-migration.sh` - Migration execution script
3. `/scripts/cloud/verify-database.sh` - Verification script
4. `/docs/DATABASE_MIGRATION_CLOUD.md` - This documentation

### Modified Files

1. `/scripts/cloud/init-database.sh` - Added migration execution step

### Existing Files (Referenced)

1. `/platform/backend/migrations/1700000000000-InitialSchema.ts` - Migration file (from TASK-051)
2. `/platform/backend/typeorm.config.ts` - TypeORM configuration
3. `/platform/backend/package.json` - NPM scripts (db:migrate)

---

## Quick Reference

### Execute Migration (One Command)

```bash
cd /Users/arthurren/projects/AIOpc/scripts/cloud
./deploy-database.sh
```

### Verify Migration

```bash
cd /Users/arthurren/projects/AIOpc/scripts/cloud
./verify-database.sh --remote
```

### Manual Migration (On Server)

```bash
ssh root@118.25.0.190
cd /opt/opclaw/backend
export DB_PASSWORD="opclaw123"
npm run db:migrate
```

### Check Tables (On Server)

```bash
ssh root@118.25.0.190
sudo -u postgres psql -d opclaw
\dt
SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';
\q
```

---

## Support

If you encounter issues:

1. Check log files:
   - `/tmp/opclaw-db-deployment.log` (deployment)
   - `/var/log/opclaw-migration.log` (migration)
   - `/var/log/opclaw-db-init.log` (initialization)

2. Review error messages carefully

3. Check database permissions

4. Verify migration files exist

5. Ensure all dependencies are installed

6. Review this documentation

---

**Document Version**: 1.0
**Last Updated**: 2026-03-16
**Status**: Ready for Execution
