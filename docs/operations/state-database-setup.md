# State Database Setup Guide

> **Deployment State Database Setup and Operations Guide**
> **Version**: 1.0.0
> **Created**: 2026-03-19
> **Author**: AIOpc DevOps Team

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Database Schema](#database-schema)
4. [Installation](#installation)
5. [Configuration](#configuration)
6. [Verification](#verification)
7. [Operations](#operations)
8. [Backup and Recovery](#backup-and-recovery)
9. [Troubleshooting](#troubleshooting)
10. [Security Considerations](#security-considerations)

---

## Overview

The **Deployment State Database** (`deployment_state`) is a PostgreSQL database that tracks all deployment state, version history, configuration snapshots, and audit trails for multi-tenant deployments.

### Key Features

- **Deployment Tracking**: Complete history of all deployments across all tenants
- **Configuration Snapshots**: Store complete configuration state for each deployment
- **Health Monitoring**: Track health check results over time
- **Security Auditing**: Comprehensive audit log of all security-sensitive operations
- **Incident Management**: Track and manage deployment incidents
- **SSH Key Management**: Audit trail for SSH key usage
- **Config Drift Detection**: Monitor and report configuration drift

### Benefits

- **Rollback Support**: Complete history enables safe rollbacks
- **Compliance**: Comprehensive audit trails for regulatory requirements
- **Debugging**: Historical data aids in troubleshooting
- **Analytics**: Query deployment patterns and success rates
- **Multi-Tenant**: Support for multiple independent deployments

---

## Architecture

### Database Components

```
deployment_state (PostgreSQL Database)
│
├── Core Tables (8)
│   ├── tenants                    - Tenant information
│   ├── deployments                - Deployment records
│   ├── deployment_config_snapshots - Configuration snapshots
│   ├── health_checks              - Health check history
│   ├── security_audit_log         - Security audit trail
│   ├── config_drift_reports       - Configuration drift tracking
│   ├── incidents                  - Incident management
│   └── ssh_key_audit              - SSH key audit log
│
├── Views (3)
│   ├── v_deployment_summary       - Deployment summary with health checks
│   ├── v_tenant_health            - Tenant health status
│   └── v_recent_security_events   - Recent security events
│
└── Functions (4)
    ├── health_check()             - Database health check
    ├── log_ssh_key_usage()        - SSH key usage logging
    ├── record_tenant()            - Create/update tenant
    └── get_deployment_stats()     - Deployment statistics
```

### Integration Points

```
┌─────────────────────────────────────────────────────────────┐
│                   Deployment Scripts                         │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  - deploy-multi-tenant.sh                             │ │
│  │  - rollback-deployment.sh                             │ │
│  │  - health-monitor.sh                                  │ │
│  └────────────────────────────────────────────────────────┘ │
│                           │                                  │
│                           ▼                                  │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  State Management Library (scripts/lib/state.sh)      │ │
│  └────────────────────────────────────────────────────────┘ │
│                           │                                  │
└───────────────────────────┼──────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              deployment_state Database                       │
│  (PostgreSQL - Docker Container)                            │
└─────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Tables

#### 1. tenants

Stores tenant (customer) information.

| Column | Type | Description |
|--------|------|-------------|
| tenant_id | VARCHAR(255) | Primary key, tenant unique identifier |
| tenant_name | VARCHAR(500) | Tenant name |
| environment | VARCHAR(50) | Environment (production/staging/development) |
| server_host | VARCHAR(255) | Server hostname/IP |
| feishu_app_id | VARCHAR(100) | Feishu OAuth app ID |
| created_at | TIMESTAMP | Creation timestamp |
| updated_at | TIMESTAMP | Last update timestamp |
| is_active | BOOLEAN | Active status |

**Indexes**:
- `idx_tenants_active` - For active tenant queries
- `idx_tenants_environment` - For environment filtering

#### 2. deployments

Main deployment tracking table.

| Column | Type | Description |
|--------|------|-------------|
| deployment_id | SERIAL | Primary key |
| tenant_id | VARCHAR(255) | Foreign key to tenants |
| deployment_type | VARCHAR(50) | Type (initial/update/rollback/scale) |
| component | VARCHAR(50) | Component (all/backend/frontend/database) |
| version | VARCHAR(100) | Deployment version |
| git_commit_sha | VARCHAR(100) | Git commit SHA |
| git_branch | VARCHAR(255) | Git branch name |
| deployed_by | VARCHAR(255) | Deployment operator |
| status | VARCHAR(50) | Status (pending/in_progress/success/failed/rolled_back) |
| started_at | TIMESTAMP | Start time |
| completed_at | TIMESTAMP | Completion time |
| health_check_status | VARCHAR(50) | Health check result |
| rollback_deployment_id | INTEGER | Link to rollback deployment |
| error_message | TEXT | Error details |
| deployment_metadata | JSONB | Additional metadata |

**Indexes**:
- `idx_deployments_tenant` - Tenant deployments with time ordering
- `idx_deployments_status` - Status filtering
- `idx_deployments_deployed_by` - Operator filtering
- `idx_deployments_version` - Version filtering
- `idx_deployments_type` - Deployment type filtering

#### 3. deployment_config_snapshots

Stores configuration snapshots for each deployment.

| Column | Type | Description |
|--------|------|-------------|
| snapshot_id | SERIAL | Primary key |
| deployment_id | INTEGER | Foreign key to deployments (unique) |
| config_content | TEXT | YAML configuration (Base64 encoded) |
| env_content | TEXT | Environment variables (Base64 encoded) |
| docker_compose_content | TEXT | Docker Compose configuration (Base64 encoded) |
| nginx_config_content | TEXT | Nginx configuration (Base64 encoded) |
| created_at | TIMESTAMP | Snapshot creation time |

#### 4. health_checks

Health check execution history.

| Column | Type | Description |
|--------|------|-------------|
| health_check_id | SERIAL | Primary key |
| deployment_id | INTEGER | Foreign key to deployments (nullable) |
| tenant_id | VARCHAR(255) | Foreign key to tenants |
| check_type | VARCHAR(100) | Check type (http/database/oauth/redis/ssh/docker) |
| status | VARCHAR(50) | Status (pass/fail/warning/skip) |
| response_time_ms | INTEGER | Response time in milliseconds |
| error_message | TEXT | Error details |
| checked_at | TIMESTAMP | Check execution time |
| check_details | JSONB | Additional check details |

**Indexes**:
- `idx_health_checks_deployment` - Deployment health checks
- `idx_health_checks_tenant` - Tenant health checks with time ordering
- `idx_health_checks_status` - Status filtering with time
- `idx_health_checks_type` - Check type filtering

#### 5. security_audit_log

Security audit trail for all sensitive operations.

| Column | Type | Description |
|--------|------|-------------|
| audit_id | SERIAL | Primary key |
| tenant_id | VARCHAR(255) | Foreign key to tenants (nullable) |
| event_type | VARCHAR(100) | Event type (ssh_access/config_change/deployment/etc) |
| actor | VARCHAR(255) | Operator who performed the action |
| action | VARCHAR(255) | Action performed |
| resource_type | VARCHAR(100) | Type of resource affected |
| resource_id | VARCHAR(255) | Resource identifier |
| old_value | JSONB | Previous value |
| new_value | JSONB | New value |
| ip_address | INET | IP address of operator |
| user_agent | TEXT | User agent string |
| event_timestamp | TIMESTAMP | Event time |

**Indexes**:
- `idx_audit_tenant` - Tenant audit log with time ordering
- `idx_audit_actor` - Actor audit log with time ordering
- `idx_audit_event_type` - Event type filtering with time
- `idx_audit_timestamp` - Time-based queries

#### 6. config_drift_reports

Configuration drift detection and tracking.

| Column | Type | Description |
|--------|------|-------------|
| drift_report_id | SERIAL | Primary key |
| tenant_id | VARCHAR(255) | Foreign key to tenants |
| drift_detected_at | TIMESTAMP | Detection timestamp |
| config_file_path | VARCHAR(500) | Path to drifted config file |
| expected_value | TEXT | Expected configuration value |
| actual_value | TEXT | Actual configuration value |
| drift_severity | VARCHAR(50) | Severity (critical/major/minor) |
| resolved | BOOLEAN | Resolution status |
| resolved_at | TIMESTAMP | Resolution timestamp |
| resolution_notes | TEXT | Resolution details |

**Indexes**:
- `idx_drift_tenant` - Tenant drift reports with time ordering
- `idx_drift_unresolved` - Unresolved drift filtering by severity
- `idx_drift_severity` - Severity-based filtering

#### 7. incidents

Incident tracking and management.

| Column | Type | Description |
|--------|------|-------------|
| incident_id | SERIAL | Primary key |
| tenant_id | VARCHAR(255) | Foreign key to tenants (nullable) |
| deployment_id | INTEGER | Foreign key to deployments (nullable) |
| incident_type | VARCHAR(100) | Type (deployment_failure/health_check_fail/etc) |
| severity | VARCHAR(50) | Severity (P0/P1/P2/P3) |
| title | VARCHAR(500) | Incident title |
| description | TEXT | Detailed description |
| impact | TEXT | Impact assessment |
| mitigation_steps | TEXT | Mitigation actions taken |
| root_cause | TEXT | Root cause analysis |
| detected_at | TIMESTAMP | Detection timestamp |
| resolved_at | TIMESTAMP | Resolution timestamp |
| resolution_notes | TEXT | Resolution details |
| assignee | VARCHAR(255) | Assigned person |
| status | VARCHAR(50) | Status (open/investigating/resolved/closed) |
| incident_metadata | JSONB | Additional metadata |

**Indexes**:
- `idx_incidents_tenant` - Tenant incidents with time ordering
- `idx_incidents_severity` - Severity and status filtering
- `idx_incidents_status` - Status filtering with time
- `idx_incidents_type` - Incident type filtering

#### 8. ssh_key_audit

SSH key usage audit log.

| Column | Type | Description |
|--------|------|-------------|
| audit_id | SERIAL | Primary key |
| tenant_id | VARCHAR(255) | Foreign key to tenants |
| ssh_key_name | VARCHAR(255) | SSH key name |
| ssh_key_fingerprint | VARCHAR(255) | SSH key fingerprint |
| ssh_key_type | VARCHAR(50) | Key type (RSA/ED25519/ECDSA) |
| action | VARCHAR(100) | Action (created/accessed/revoked/rotated/expired) |
| actor | VARCHAR(255) | Operator |
| server_host | VARCHAR(255) | Target server |
| access_granted_at | TIMESTAMP | Access grant time |
| access_revoked_at | TIMESTAMP | Access revocation time |
| last_used_at | TIMESTAMP | Last usage time |
| key_status | VARCHAR(50) | Status (active/revoked/expired/compromised) |
| access_reason | TEXT | Access justification |
| ip_address | INET | IP address |
| audit_timestamp | TIMESTAMP | Audit timestamp |

**Indexes**:
- `idx_ssh_tenant` - Tenant SSH audit with time ordering
- `idx_ssh_fingerprint` - Fingerprint-based lookup
- `idx_ssh_status` - Status filtering
- `idx_ssh_action` - Action filtering with time

### Views

#### v_deployment_summary

Combines deployment information with health check statistics.

```sql
SELECT
    deployment_id,
    tenant_id,
    tenant_name,
    environment,
    server_host,
    deployment_type,
    component,
    version,
    status,
    deployed_by,
    started_at,
    completed_at,
    deployment_duration_seconds,
    health_checks_passed,
    health_checks_failed,
    health_checks_warning,
    git_commit_sha,
    git_branch,
    error_message
FROM v_deployment_summary
ORDER BY started_at DESC;
```

#### v_tenant_health

Provides overall tenant health status.

```sql
SELECT
    tenant_id,
    tenant_name,
    environment,
    server_host,
    feishu_app_id,
    is_active,
    successful_deployments_7d,
    total_deployments_7d,
    last_deployment_at,
    last_healthy_check_at,
    open_incidents,
    critical_incidents,
    unresolved_drift,
    created_at,
    updated_at
FROM v_tenant_health;
```

#### v_recent_security_events

Recent security events with risk level assessment.

```sql
SELECT
    audit_id,
    tenant_id,
    tenant_name,
    event_type,
    actor,
    action,
    resource_type,
    resource_id,
    ip_address,
    event_timestamp,
    risk_level
FROM v_recent_security_events
WHERE event_timestamp > NOW() - INTERVAL '7 days'
ORDER BY event_timestamp DESC;
```

---

## Installation

### Prerequisites

- PostgreSQL 14+ (running in Docker container)
- Docker and Docker Compose installed
- Access to PostgreSQL with administrative privileges
- Sufficient disk space (recommend 10GB+ for production)

### Quick Start (Production Server)

1. **Copy scripts to server**:
   ```bash
   scp -i ~/.ssh/your_key -r scripts/state root@118.25.0.190:/tmp/state-db-setup
   ```

2. **Create database**:
   ```bash
   ssh -i ~/.ssh/your_key root@118.25.0.190
   docker exec opclaw-postgres psql -U opclaw -d opclaw -c 'CREATE DATABASE deployment_state;'
   ```

3. **Initialize schema**:
   ```bash
   docker exec -i opclaw-postgres psql -U opclaw -d deployment_state < /tmp/state-db-setup/schema.sql
   ```

4. **Verify installation**:
   ```bash
   docker exec opclaw-postgres psql -U opclaw -d deployment_state -c 'SELECT * FROM health_check();'
   ```

### Detailed Installation

#### Option 1: Using Setup Script (Recommended for Local)

```bash
cd scripts/state
./setup-state-db.sh --create-user --db-host localhost --db-user postgres
```

This will:
- Create the `deployment_state` database
- Create a dedicated user `opclaw_state` with least privileges
- Initialize all tables, indexes, views, and functions
- Save credentials to `.env.state_db`

#### Option 2: Manual Setup (For Production Servers)

```bash
# 1. Create database
docker exec opclaw-postgres psql -U opclaw -d opclaw -c 'CREATE DATABASE deployment_state;'

# 2. Initialize schema
docker exec -i opclaw-postgres psql -U opclaw -d deployment_state < /path/to/schema.sql

# 3. Create dedicated user (optional)
docker exec opclaw-postgres psql -U opclaw -d opclaw -c "CREATE USER opclaw_state WITH PASSWORD 'your_secure_password';"
docker exec opclaw-postgres psql -U opclaw -d opclaw -c 'GRANT ALL PRIVILEGES ON DATABASE deployment_state TO opclaw_state;'

# 4. Grant schema permissions
docker exec opclaw-postgres psql -U opclaw -d deployment_state -c 'GRANT ALL ON SCHEMA public TO opclaw_state;'
docker exec opclaw-postgres psql -U opclaw -d deployment_state -c 'GRANT ALL ON ALL TABLES IN SCHEMA public TO opclaw_state;'
docker exec opclaw-postgres psql -U opclaw -d deployment_state -c 'GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO opclaw_state;'
docker exec opclaw-postgres psql -U opclaw -d deployment_state -c 'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO opclaw_state;'
```

### High Availability Setup (Optional)

For production environments requiring high availability:

```bash
# Apply HA configurations
docker exec -i opclaw-postgres psql -U opclaw -d deployment_state < /path/to/ha-setup.sql
```

This adds:
- Replication setup commands
- Backup procedures
- Monitoring queries
- Maintenance functions
- Enhanced health checks

---

## Configuration

### Environment Variables

Create a `.env.state_db` file in the project root:

```bash
# Deployment State Database Configuration
STATE_DB_HOST=localhost
STATE_DB_PORT=5432
STATE_DB_NAME=deployment_state
STATE_DB_USER=opclaw_state
STATE_DB_PASSWORD=your_secure_password
```

### Connection String Examples

**For PostgreSQL Client**:
```bash
psql -h localhost -U opclaw_state -d deployment_state
```

**For Docker Exec**:
```bash
docker exec opclaw-postgres psql -U opclaw -d deployment_state
```

**For Node.js (pg library)**:
```javascript
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.STATE_DB_HOST,
  port: process.env.STATE_DB_PORT,
  database: process.env.STATE_DB_NAME,
  user: process.env.STATE_DB_USER,
  password: process.env.STATE_DB_PASSWORD,
});
```

**For Bash Scripts**:
```bash
export PGHOST="${STATE_DB_HOST}"
export PGPORT="${STATE_DB_PORT}"
export PGDATABASE="${STATE_DB_NAME}"
export PGUSER="${STATE_DB_USER}"
export PGPASSWORD="${STATE_DB_PASSWORD}"
```

---

## Verification

### Run Connection Test

```bash
cd scripts/state
./test-db-connection.sh
```

Expected output:
```
==============================================================================
State Database Connection Test
==============================================================================

Database Configuration:
  Host:  localhost
  Port:  5432
  Name:  deployment_state
  User:  opclaw_state

>>> Testing database connection...
✓ Database connection successful

>>> Testing tables...
✓ Table 'tenants' exists
✓ Table 'deployments' exists
✓ Table 'deployment_config_snapshots' exists
✓ Table 'health_checks' exists
✓ Table 'security_audit_log' exists
✓ Table 'config_drift_reports' exists
✓ Table 'incidents' exists
✓ Table 'ssh_key_audit' exists
✓ All 8 tables verified

>>> Testing views...
✓ View 'v_deployment_summary' exists
✓ View 'v_tenant_health' exists
✓ View 'v_recent_security_events' exists
✓ All 3 views verified

>>> Testing functions...
✓ Function 'health_check()' exists
✓ Function 'log_ssh_key_usage()' exists
✓ Function 'record_tenant()' exists
✓ Function 'get_deployment_stats()' exists
✓ All 4 functions verified
```

### Manual Verification Queries

```sql
-- 1. Check database health
SELECT * FROM health_check();

-- 2. List all tables
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- 3. List all views
SELECT table_name
FROM information_schema.views
WHERE table_schema = 'public'
ORDER BY table_name;

-- 4. List all functions
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_type = 'FUNCTION'
ORDER BY routine_name;

-- 5. Check table sizes
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- 6. Test tenant creation
SELECT record_tenant(
    'test_tenant',
    'Test Tenant',
    'development',
    'localhost',
    'cli_test123'
);

-- 7. Verify tenant created
SELECT * FROM tenants WHERE tenant_id = 'test_tenant';

-- 8. Clean up test tenant
DELETE FROM tenants WHERE tenant_id = 'test_tenant';
```

---

## Operations

### Common Queries

#### Get Recent Deployments

```sql
SELECT
    deployment_id,
    tenant_id,
    deployment_type,
    version,
    status,
    started_at,
    completed_at,
    deployment_duration_seconds
FROM v_deployment_summary
ORDER BY started_at DESC
LIMIT 10;
```

#### Get Tenant Health Status

```sql
SELECT
    tenant_id,
    tenant_name,
    environment,
    is_active,
    successful_deployments_7d,
    total_deployments_7d,
    last_deployment_at,
    open_incidents,
    critical_incidents
FROM v_tenant_health
WHERE is_active = true
ORDER BY last_deployment_at DESC;
```

#### Get Deployment Statistics

```sql
SELECT * FROM get_deployment_stats(7);
-- Returns: tenant_id, total_deployments, successful_deployments, failed_deployments, avg_duration_seconds, last_deployment
```

#### Get Failed Deployments

```sql
SELECT
    d.deployment_id,
    d.tenant_id,
    d.deployment_type,
    d.version,
    d.status,
    d.error_message,
    d.started_at
FROM deployments d
WHERE d.status = 'failed'
ORDER BY d.started_at DESC
LIMIT 20;
```

#### Get Open Incidents

```sql
SELECT
    incident_id,
    tenant_id,
    incident_type,
    severity,
    title,
    status,
    detected_at,
    assignee
FROM incidents
WHERE status NOT IN ('resolved', 'closed')
ORDER BY
    CASE severity
        WHEN 'P0' THEN 1
        WHEN 'P1' THEN 2
        WHEN 'P2' THEN 3
        WHEN 'P3' THEN 4
    END,
    detected_at DESC;
```

#### Get Recent Security Events

```sql
SELECT * FROM v_recent_security_events
WHERE risk_level = 'high'
ORDER BY event_timestamp DESC
LIMIT 50;
```

### Data Management

#### Archive Old Deployments

```sql
-- Mark old deployments as archived (optional metadata update)
UPDATE deployments
SET deployment_metadata = deployment_metadata || '{"archived": true}'::jsonb
WHERE started_at < NOW() - INTERVAL '1 year'
  AND status = 'success';
```

#### Cleanup Old Audit Logs

```sql
-- View count of old logs
SELECT vacuum_old_audit_logs(90);
-- Returns count of logs older than 90 days

-- Actually delete old logs (use with caution)
DELETE FROM security_audit_log
WHERE event_timestamp < NOW() - INTERVAL '90 days';
```

#### Update Statistics

```sql
-- Update table statistics for query optimization
SELECT analyze_all_tables();
```

---

## Backup and Recovery

### Backup Procedures

#### Full Database Backup

```bash
# Create backup directory
mkdir -p /backups/deployment_state
DATE=$(date +%Y%m%d_%H%M%S)

# Perform backup
docker exec opclaw-postgres pg_dump -U opclaw deployment_state | gzip > "/backups/deployment_state/deployment_state_${DATE}.sql.gz"

# Verify backup
gunzip -c "/backups/deployment_state/deployment_state_${DATE}.sql.gz" | head -n 50
```

#### Schema-Only Backup

```bash
docker exec opclaw-postgres pg_dump -U opclaw --schema-only deployment_state > "/backups/deployment_state/schema_$(date +%Y%m%d).sql"
```

#### Data-Only Backup

```bash
docker exec opclaw-postgres pg_dump -U opclaw --data-only deployment_state | gzip > "/backups/deployment_state/data_$(date +%Y%m%d_%H%M%S).sql.gz"
```

### Recovery Procedures

#### Restore from Backup

```bash
# Drop existing database (CAUTION!)
docker exec opclaw-postgres psql -U opclaw -d postgres -c 'DROP DATABASE deployment_state;'

# Create new database
docker exec opclaw-postgres psql -U opclaw -d opclaw -c 'CREATE DATABASE deployment_state;'

# Restore from backup
gunzip -c /backups/deployment_state/deployment_state_20260319_120000.sql.gz | docker exec -i opclaw-postgres psql -U opclaw -d deployment_state
```

#### Point-in-Time Recovery (Advanced)

Requires WAL archiving to be configured. See PostgreSQL documentation for details.

### Automated Backup Script

Create `/etc/cron.daily/backup-deployment-state`:

```bash
#!/bin/bash
BACKUP_DIR="/backups/deployment_state"
RETENTION_DAYS=30

# Create backup directory
mkdir -p "${BACKUP_DIR}"

# Perform backup
DATE=$(date +%Y%m%d_%H%M%S)
docker exec opclaw-postgres pg_dump -U opclaw deployment_state | gzip > "${BACKUP_DIR}/deployment_state_${DATE}.sql.gz"

# Log backup
logger "Deployment state database backup completed: deployment_state_${DATE}.sql.gz"

# Remove old backups
find "${BACKUP_DIR}" -name "deployment_state_*.sql.gz" -mtime +${RETENTION_DAYS} -delete

# Mark backup in database
docker exec opclaw-postgres psql -U opclaw -d deployment_state -c "SELECT mark_backup_start('full');"
```

Make it executable:
```bash
chmod +x /etc/cron.daily/backup-deployment-state
```

---

## Troubleshooting

### Common Issues

#### Issue: Connection Refused

**Symptoms**:
```
psql: error: connection to server at "localhost", port 5432 failed: Connection refused
```

**Solutions**:
1. Check PostgreSQL is running:
   ```bash
   docker ps | grep postgres
   ```

2. Check port mapping:
   ```bash
   docker port opclaw-postgres
   ```

3. Verify firewall rules:
   ```bash
   sudo ufw status
   ```

#### Issue: Authentication Failed

**Symptoms**:
```
psql: error: connection to server at "localhost", port 5432 failed: FATAL: password authentication failed for user "opclaw_state"
```

**Solutions**:
1. Verify user exists:
   ```sql
   SELECT usename FROM pg_user WHERE usename = 'opclaw_state';
   ```

2. Check password:
   ```bash
   echo $STATE_DB_PASSWORD
   ```

3. Reset password if needed:
   ```sql
   ALTER USER opclaw_state WITH PASSWORD 'new_secure_password';
   ```

#### Issue: Database Does Not Exist

**Symptoms**:
```
psql: error: connection to server at "localhost", port 5432 failed: FATAL: database "deployment_state" does not exist
```

**Solutions**:
1. Create database:
   ```sql
   CREATE DATABASE deployment_state;
   ```

2. Verify database list:
   ```sql
   \l
   ```

#### Issue: Slow Queries

**Symptoms**:
- Queries taking longer than expected
- High CPU usage on PostgreSQL

**Solutions**:
1. Check slow queries:
   ```sql
   SELECT * FROM v_long_running_queries;
   ```

2. Update statistics:
   ```sql
   SELECT analyze_all_tables();
   ```

3. Check for missing indexes:
   ```sql
   SELECT * FROM v_table_sizes;
   ```

4. Review query plans:
   ```sql
   EXPLAIN ANALYZE <your query>;
   ```

#### Issue: Disk Space Full

**Symptoms**:
- Cannot insert new records
- PostgreSQL logs showing disk full errors

**Solutions**:
1. Check database size:
   ```sql
   SELECT * FROM v_database_size;
   ```

2. Check table sizes:
   ```sql
   SELECT * FROM v_table_sizes;
   ```

3. Archive old data:
   ```sql
   -- Archive old security audit logs
   DELETE FROM security_audit_log
   WHERE event_timestamp < NOW() - INTERVAL '90 days';
   ```

4. Vacuum database:
   ```bash
   docker exec opclaw-postgres vacuumdb -U opclaw -d deployment_state --analyze --verbose
   ```

### Diagnostic Queries

```sql
-- Check active connections
SELECT * FROM v_connection_stats;

-- Check for locks
SELECT * FROM v_locks;

-- Check database size
SELECT * FROM v_database_size;

-- Check table sizes
SELECT * FROM v_table_sizes;

-- Check long-running queries
SELECT * FROM v_long_running_queries;

-- Run comprehensive health check
SELECT * FROM health_check_ha();
```

---

## Security Considerations

### Access Control

#### Principle of Least Privilege

Create users with minimum required permissions:

```sql
-- Read-only user for monitoring
CREATE USER opclaw_state_readonly WITH PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE deployment_state TO opclaw_state_readonly;
GRANT USAGE ON SCHEMA public TO opclaw_state_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO opclaw_state_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO opclaw_state_readonly;

-- Application user with limited permissions
CREATE USER opclaw_state_app WITH PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE deployment_state TO opclaw_state_app;
GRANT USAGE ON SCHEMA public TO opclaw_state_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO opclaw_state_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO opclaw_state_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO opclaw_state_app;
```

#### Network Security

1. **Bind to localhost only** (default):
   ```yaml
   # docker-compose.yml
   services:
     postgres:
       ports:
         - "127.0.0.1:5432:5432"  # Only accessible from localhost
   ```

2. **Use SSL/TLS for remote connections**:
   ```bash
   # Require SSL in pg_hba.conf
   hostssl deployment_state all 0.0.0.0/0 cert
   ```

3. **Firewall rules**:
   ```bash
   # Only allow specific IPs
   sudo ufw allow from 192.168.1.0/24 to any port 5432
   ```

### Data Encryption

#### At Rest

- Enable full disk encryption on the host
- Use encrypted volumes for PostgreSQL data directory

#### In Transit

```sql
-- Require SSL for all connections
ALTER SYSTEM SET ssl = on;
ALTER SYSTEM SET ssl_cert_file = '/var/lib/postgresql/server.crt';
ALTER SYSTEM SET ssl_key_file = '/var/lib/postgresql/server.key';
```

### Audit Logging

PostgreSQL has built-in audit logging enabled via the `security_audit_log` table. Ensure all sensitive operations are logged:

```sql
-- Example: Log SSH key access
SELECT log_ssh_key_usage(
    'tenant_001',
    'prod_server_key',
    'SHA256:abc123...',
    'ED25519',
    'accessed',
    'admin',
    '118.25.0.190',
    'Deployment troubleshooting',
    '192.168.1.100'
);
```

### Regular Security Tasks

1. **Rotate passwords** (quarterly):
   ```sql
   ALTER USER opclaw_state WITH PASSWORD 'new_secure_password';
   ```

2. **Review user permissions** (monthly):
   ```sql
   SELECT
       r.rolname as role_name,
       r.rolsuper as is_super,
       r.rolcreaterole as can_create_role,
       r.rolcreatedb as can_create_db
   FROM pg_roles r
   WHERE r.rolname LIKE 'opclaw%';
   ```

3. **Audit access logs** (weekly):
   ```sql
   SELECT
       event_type,
       actor,
       action,
       ip_address,
       event_timestamp
   FROM security_audit_log
   WHERE event_timestamp > NOW() - INTERVAL '7 days'
   ORDER BY event_timestamp DESC;
   ```

---

## Performance Tuning

### Index Optimization

Regularly analyze and optimize indexes:

```sql
-- Check index usage
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan as index_scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan ASC;

-- Rebuild indexes if needed
REINDEX TABLE deployments;
REINDEX TABLE security_audit_log;
```

### Query Optimization

Use EXPLAIN ANALYZE for slow queries:

```sql
EXPLAIN ANALYZE
SELECT
    d.deployment_id,
    d.tenant_id,
    d.status,
    COUNT(hc.health_check_id)
FROM deployments d
LEFT JOIN health_checks hc ON d.deployment_id = hc.deployment_id
WHERE d.started_at > NOW() - INTERVAL '7 days'
GROUP BY d.deployment_id, d.tenant_id, d.status;
```

### Connection Pooling

Consider using PgBouncer for high-traffic scenarios:

```yaml
# docker-compose.yml
services:
  pgbouncer:
    image: pgbouncer/pgbouncer
    environment:
      - DATABASES_HOST=opclaw-postgres
      - POOL_MODE=transaction
      - MAX_CLIENT_CONN=100
      - DEFAULT_POOL_SIZE=25
```

---

## Maintenance

### Daily Tasks

- Monitor database size and growth
- Check for failed deployments
- Review security audit logs

### Weekly Tasks

- Analyze table statistics: `SELECT analyze_all_tables();`
- Review slow queries
- Check for configuration drift

### Monthly Tasks

- Archive old deployment records
- Review and clean up old audit logs
- Update documentation
- Test backup restoration

### Quarterly Tasks

- Rotate database passwords
- Review user permissions
- Performance tuning review
- Security audit

---

## Appendix

### SQL Reference

#### Create Tenant

```sql
SELECT record_tenant(
    'tenant_001',
    'Production Tenant',
    'production',
    '118.25.0.190',
    'cli_a93ce5614ce11bd6'
);
```

#### Record Deployment Start

```sql
INSERT INTO deployments (
    tenant_id, deployment_type, component, version,
    git_commit_sha, git_branch, deployed_by, status
) VALUES (
    'tenant_001',
    'update',
    'backend',
    'v1.2.3',
    'abc123def456',
    'main',
    'admin',
    'pending'
) RETURNING deployment_id;
```

#### Record Deployment Success

```sql
UPDATE deployments
SET
    status = 'success',
    completed_at = CURRENT_TIMESTAMP,
    health_check_status = 'pass'
WHERE deployment_id = 123;
```

#### Record Health Check

```sql
INSERT INTO health_checks (
    deployment_id,
    tenant_id,
    check_type,
    status,
    response_time_ms
) VALUES (
    123,
    'tenant_001',
    'http',
    'pass',
    150
);
```

#### Log Security Event

```sql
INSERT INTO security_audit_log (
    tenant_id,
    event_type,
    actor,
    action,
    resource_type,
    resource_id,
    ip_address
) VALUES (
    'tenant_001',
    'deployment',
    'admin',
    'deploy',
    'server',
    '118.25.0.190',
    '192.168.1.100'::INET
);
```

### Useful Aliases

Add to `~/.bashrc` or `~/.zshrc`:

```bash
# State database aliases
alias state-db='docker exec -it opclaw-postgres psql -U opclaw -d deployment_state'
alias state-backup='docker exec opclaw-postgres pg_dump -U opclaw deployment_state | gzip'
alias state-restore='gunzip | docker exec -i opclaw-postgres psql -U opclaw -d deployment_state'
alias state-health='docker exec opclaw-postgres psql -U opclaw -d deployment_state -c "SELECT * FROM health_check();"'
```

---

**Document Version**: 1.0.0
**Last Updated**: 2026-03-19
**Maintained By**: AIOpc DevOps Team
