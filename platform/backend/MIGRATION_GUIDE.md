# Database Migration Guide

This guide explains how to manage database schema changes using TypeORM migrations in the AIOpc Platform.

## Overview

The platform uses TypeORM migrations to manage database schema changes. Migrations are the **production-ready** way to update database structure, providing:

- Version control for schema changes
- Rollback capabilities
- Team collaboration support
- Safe deployment practices

## Quick Start

### Initial Database Setup

```bash
# Option 1: Use initialization script (recommended)
npm run db:init

# Option 2: Run migrations manually
npm run db:migrate
```

### Development Mode (Auto-Sync)

For rapid development, you can enable schema synchronization:

```bash
# Set in .env file
DB_SYNC=true

# Start the application
npm run dev
```

⚠️ **WARNING**: Never use `DB_SYNC=true` in production!

## Migration Commands

### Run Pending Migrations

```bash
npm run db:migrate
```

This applies all pending migrations to the database.

### Revert Last Migration

```bash
npm run db:revert
```

This rolls back the most recently applied migration.

### Generate Migration from Entities

```bash
npm run db:generate -- -n MigrationName
```

Generates a new migration based on current entity differences.

### Create Empty Migration

```bash
npm run db:create -- -n MigrationName
```

Creates a blank migration file for manual SQL.

## Database Configuration

### Environment Variables

```bash
# Database Connection
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=opclaw
DB_PASSWORD=your_password
DB_NAME=opclaw

# Schema Synchronization (Development Only!)
DB_SYNC=false  # Set to 'true' for dev auto-sync, 'false' for migrations

# Environment
NODE_ENV=development  # or 'production'
```

### Synchronization Behavior

| Environment | DB_SYNC | synchronize | Behavior |
|------------|---------|-------------|----------|
| development | true | true | Auto-sync schema changes |
| development | false | false | Use migrations |
| production | any | false | **Always** use migrations |

## Database Schema

### Tables

1. **users** - User accounts and Feishu OAuth data
2. **api_keys** - API key management for LLM services
3. **qr_codes** - QR code tokens for instance claiming
4. **instances** - OpenClaw instance records
5. **documents** - Knowledge base documents
6. **document_chunks** - Document chunks for RAG
7. **instance_metrics** - Time-series metrics collection
8. **instance_renewals** - Instance renewal history

### Entity Relationships

```
users (1) ───────< (N) instances
users (1) ───────< (N) instance_renewals

instances (1) ───< (N) documents
instances (1) ───< (N) instance_metrics
instances (1) ───< (N) instance_renewals
instances (1) ───< (1) qr_codes

documents (1) ───< (N) document_chunks
```

## Migration Workflow

### Creating a New Migration

1. **Modify Entities** - Update entity files in `src/entities/`

2. **Generate Migration** - Auto-generate migration from entity changes:
   ```bash
   npm run db:generate -- -n AddUserAvatarField
   ```

3. **Review Migration** - Check generated migration in `migrations/` folder

4. **Test Migration** - Apply to development database:
   ```bash
   npm run db:migrate
   ```

5. **Verify Changes** - Confirm tables are correct:
   ```bash
   psql -U opclaw -d opclaw -c "\dt"
   psql -U opclaw -d opclaw -c "\d users"
   ```

6. **Rollback if Needed** - Revert the migration:
   ```bash
   npm run db:revert
   ```

### Example Migration Workflow

```bash
# 1. Add a new column to User entity
# Edit src/entities/User.entity.ts, add: @Column() phone: string;

# 2. Generate migration
npm run db:generate -- -n AddUserPhone

# 3. Check the generated migration
cat migrations/1700000000001-AddUserPhone.ts

# 4. Apply migration
npm run db:migrate

# 5. Verify
psql -U opclaw -d opclaw -c "\d users"

# 6. If issues, rollback
npm run db:revert
```

## Deployment

### Production Deployment

1. **Set Environment**:
   ```bash
   export NODE_ENV=production
   export DB_SYNC=false
   ```

2. **Run Migrations**:
   ```bash
   npm run db:init  # or npm run db:migrate
   ```

3. **Start Application**:
   ```bash
   npm run build
   npm start
   ```

### Docker Deployment

The `docker-compose.yml` should include a migration step:

```yaml
services:
  backend:
    image: aiopcn-backend:latest
    environment:
      - NODE_ENV=production
      - DB_SYNC=false
    command: >
      sh -c "npm run db:migrate && npm start"
```

## Troubleshooting

### "relation does not exist" Error

**Cause**: Database tables not created

**Solution**:
```bash
npm run db:init
```

### Migration Already Applied

**Cause**: Migration was already run

**Solution**: This is normal. Migrations are idempotent.

### Connection Refused

**Cause**: PostgreSQL not running or wrong credentials

**Solution**:
1. Check PostgreSQL is running: `pg_isready`
2. Verify .env file credentials
3. Ensure database exists: `createdb opclaw`

### Permission Denied

**Cause**: Database user lacks privileges

**Solution**:
```sql
GRANT ALL PRIVILEGES ON DATABASE opclaw TO opclaw;
GRANT ALL PRIVILEGES ON SCHEMA public TO opclaw;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO opclaw;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO opclaw;
```

## Best Practices

1. **Always use migrations in production** - Never enable synchronize
2. **Review generated migrations** - Auto-generation may miss things
3. **Test migrations locally** - Apply to dev database first
4. **Keep migrations reversible** - Implement `down()` method
5. **One logical change per migration** - Don't batch unrelated changes
6. **Commit migrations with code** - Keep migrations in version control
7. **Never modify applied migrations** - Create new ones instead

## Current Migration Status

```bash
# Check migration status
npm run typeorm -- migration:show -d typeorm.config.ts
```

## Schema Verification

After running migrations, verify the schema:

```bash
# List all tables
psql -U opclaw -d opclaw -c "\dt"

# Describe specific table
psql -U opclaw -d opclaw -c "\d instances"

# Check foreign keys
psql -U opclaw -d opclaw -c "
  SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name
  FROM information_schema.table_constraints AS tc
  JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
  JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY';
"

# Check indexes
psql -U opclaw -d opclaw -c "
  SELECT indexname, tablename FROM pg_indexes
  WHERE schemaname = 'public'
  ORDER BY tablename, indexname;
"
```

## Resources

- [TypeORM Migrations Documentation](https://typeorm.io/#/migrations)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Entity Definition Guide](../src/entities/README.md)
