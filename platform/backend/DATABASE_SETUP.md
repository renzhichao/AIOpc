# Database Setup Guide

This guide explains how to set up and initialize the database for the AIOpc Platform.

## Prerequisites

- PostgreSQL 12+ installed and running
- Node.js 20+ installed
- Database credentials configured

## Quick Start

### 1. Configure Environment

Create a `.env` file in the backend directory:

```bash
cp .env.example .env
```

Edit `.env` with your database credentials:

```bash
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=opclaw
DB_PASSWORD=your_secure_password
DB_NAME=opclaw

# For development only - enables auto-sync
DB_SYNC=false

# Environment
NODE_ENV=development
```

### 2. Create Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database and user
CREATE DATABASE opclaw;
CREATE USER opclaw WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE opclaw TO opclaw;
\q
```

### 3. Initialize Database Schema

```bash
# Run database initialization (recommended)
npm run db:init

# Or run migrations manually
npm run db:migrate
```

### 4. Verify Setup

```bash
# List all tables
psql -U opclaw -d opclaw -c "\dt"

# Check specific table structure
psql -U opclaw -d opclaw -c "\d instances"

# Verify foreign keys
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
```

## Database Schema

### Tables Overview

| Table | Description | Rows (Est.) |
|-------|-------------|-------------|
| `users` | User accounts and Feishu OAuth data | 1-10K |
| `api_keys` | API keys for LLM services | 10-100 |
| `qr_codes` | QR codes for instance claiming | 1-10K |
| `instances` | OpenClaw instance records | 1-1K |
| `documents` | Knowledge base documents | 100-10K |
| `document_chunks` | Document chunks for RAG | 1K-1M |
| `instance_metrics` | Time-series metrics | 100K-10M |
| `instance_renewals` | Instance renewal history | 1-10K |

### Entity Relationships

```
┌─────────────┐
│    users    │
└──────┬──────┘
       │
       ├──< instances (1:N)
       │
       └──< instance_renewals (1:N)

┌─────────────┐
│  instances  │
└──────┬──────┘
       │
       ├──< documents (1:N)
       ├──< instance_metrics (1:N)
       ├──< instance_renewals (1:N)
       └───< qr_codes (1:1)

┌─────────────┐
│  documents  │
└──────┬──────┘
       │
       └──< document_chunks (1:N)
```

## Development vs Production

### Development Mode

For rapid development, you can enable auto-sync:

```bash
# In .env
DB_SYNC=true
```

This automatically syncs entity changes to the database schema.

⚠️ **WARNING**: Never use `DB_SYNC=true` in production!

### Production Mode

In production, always use migrations:

```bash
# In .env
NODE_ENV=production
DB_SYNC=false

# Run migrations
npm run db:migrate
```

## Migration Commands

```bash
# Run pending migrations
npm run db:migrate

# Revert last migration
npm run db:revert

# Generate migration from entities
npm run db:generate -- -n MigrationName

# Create empty migration
npm run db:create -- -n MigrationName

# Initialize database (run migrations)
npm run db:init

# Verify migration integrity
npx ts-node scripts/verify-migration.ts
```

## Troubleshooting

### "relation does not exist" Error

**Problem**: Database tables not created

**Solution**:
```bash
npm run db:init
```

### Connection Refused

**Problem**: PostgreSQL not running or wrong credentials

**Solution**:
```bash
# Check if PostgreSQL is running
pg_isready

# Verify credentials in .env
cat .env | grep DB_

# Test connection
psql -U opclaw -d opclaw -c "SELECT 1;"
```

### Migration Already Applied

**Problem**: Migration was already run

**Solution**: This is normal. Migrations track applied versions.

### Permission Denied

**Problem**: Database user lacks privileges

**Solution**:
```sql
-- Connect as postgres user
psql -U postgres

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE opclaw TO opclaw;
GRANT ALL PRIVILEGES ON SCHEMA public TO opclaw;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO opclaw;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO opclaw;

-- Alter default privileges
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON TABLES TO opclaw;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON SEQUENCES TO opclaw;
```

## Maintenance

### Backup Database

```bash
# Backup
pg_dump -U opclaw opclaw | gzip > backup_$(date +%Y%m%d).sql.gz

# Restore
gunzip < backup_20241215.sql.gz | psql -U opclaw opclaw
```

### Cleanup Old Metrics

```sql
-- Delete metrics older than 30 days
DELETE FROM instance_metrics
WHERE recorded_at < NOW() - INTERVAL '30 days';
```

### Vacuum and Analyze

```sql
-- Reclaim storage and update statistics
VACUUM ANALYZE;
```

## Performance Tuning

### Recommended Indexes

All necessary indexes are created by migrations. To view them:

```sql
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```

### Query Optimization

```sql
-- Enable query logging (development only)
ALTER DATABASE opclaw SET log_min_duration_statement = 1000;

-- Check slow queries
SELECT query, mean_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

## Security

### Best Practices

1. **Use strong passwords** - Generate random passwords
2. **Limit network access** - Use firewall rules
3. **Enable SSL** - Use SSL connections in production
4. **Regular backups** - Automate daily backups
5. **Monitor access** - Review PostgreSQL logs

### SSL Configuration

```bash
# In .env
DATABASE_URL=postgres://opclaw:password@localhost:5432/opclaw?sslmode=require
```

## Docker Setup

### Docker Compose

```yaml
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: opclaw
      POSTGRES_USER: opclaw
      POSTGRES_PASSWORD: your_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

### Run with Docker

```bash
# Start PostgreSQL
docker-compose up -d postgres

# Run migrations
docker-compose exec backend npm run db:init
```

## Resources

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [TypeORM Migrations](https://typeorm.io/#/migrations)
- [Migration Guide](./MIGRATION_GUIDE.md)
- [Entity Definitions](../src/entities/README.md)
