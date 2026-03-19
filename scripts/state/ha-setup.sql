--==============================================================================
-- High Availability Setup for Deployment State Database
-- (部署状态数据库高可用配置)
--
-- This file contains optional high availability configurations including:
-- - Replication setup
-- - Backup procedures
-- - Monitoring queries
-- - Failover scripts
--
-- IMPORTANT: This is optional advanced configuration. Basic setup does not
-- require these features.
--
-- Database: deployment_state
-- Version: 1.0
-- Created: 2026-03-19
#==============================================================================

--==============================================================================
-- 1. Replication Setup (Streaming Replication)
--==============================================================================

-- NOTE: This section requires PostgreSQL configuration changes on both primary
-- and standby servers. See documentation for full setup instructions.

-- Create replication user (run on primary)
/*
CREATE USER replica_user WITH REPLICATION ENCRYPTED PASSWORD 'change_me_secure_password';
ALTER USER replica_user CONNECTION LIMIT 5;
*/

-- Create publication for logical replication (alternative to streaming)
/*
CREATE PUBLICATION deployment_state_pub
    FOR TABLE tenants, deployments, deployment_config_snapshots, health_checks,
              security_audit_log, config_drift_reports, incidents, ssh_key_audit;
*/

COMMENT ON PUBLICATION deployment_state_pub IS 'Publication for logical replication of deployment state';

--==============================================================================
-- 2. Backup Procedures
--==============================================================================

-- Function to mark backup start
CREATE OR REPLACE FUNCTION mark_backup_start(p_backup_type TEXT DEFAULT 'full')
RETURNS INTEGER AS $$
DECLARE
    v_backup_id INTEGER;
BEGIN
    INSERT INTO deployment_metadata (metadata_key, metadata_value, created_at)
    VALUES ('backup_start', jsonb_build_object(
        'type', p_backup_type,
        'start_time', NOW(),
        'status', 'in_progress'
    ), NOW())
    ON CONFLICT (metadata_key) DO UPDATE SET
        metadata_value = jsonb_build_object(
            'type', p_backup_type,
            'start_time', NOW(),
            'status', 'in_progress'
        ),
        created_at = NOW()
    RETURNING metadata_id INTO v_backup_id;

    RETURN v_backup_id;
END;
$$ LANGUAGE plpgsql;

-- Function to mark backup completion
CREATE OR REPLACE FUNCTION mark_backup_complete(p_backup_id INTEGER, p_backup_path TEXT, p_backup_size_gb NUMERIC)
RETURNS VOID AS $$
BEGIN
    UPDATE deployment_metadata
    SET metadata_value = jsonb_set(
        jsonb_set(metadata_value, '{status}', '"completed"'),
        '{end_time}', to_jsonb(NOW())
    ) || jsonb_build_object(
        'backup_path', p_backup_path,
        'backup_size_gb', p_backup_size_gb
    )
    WHERE metadata_id = p_backup_id;
END;
$$ LANGUAGE plpgsql;

-- View to show backup history
CREATE OR REPLACE VIEW v_backup_history AS
SELECT
    metadata_value->>'type' as backup_type,
    metadata_value->>'start_time' as start_time,
    metadata_value->>'end_time' as end_time,
    metadata_value->>'status' as status,
    metadata_value->>'backup_path' as backup_path,
    (metadata_value->>'backup_size_gb')::NUMERIC as backup_size_gb
FROM deployment_metadata
WHERE metadata_key = 'backup_start'
ORDER BY (metadata_value->>'start_time')::TIMESTAMP DESC;

COMMENT ON VIEW v_backup_history IS 'Backup history view';

--==============================================================================
-- 3. Monitoring Queries
--==============================================================================

-- Database size monitoring
CREATE OR REPLACE VIEW v_database_size AS
SELECT
    pg_database.datname as database_name,
    pg_size_pretty(pg_database_size(pg_database.datname)) as size_pretty,
    pg_database_size(pg_database.datname) as size_bytes
FROM pg_database
WHERE pg_database.datname = current_database();

COMMENT ON VIEW v_database_size IS 'Database size monitoring view';

-- Table size monitoring
CREATE OR REPLACE VIEW v_table_sizes AS
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
    pg_total_relation_size(schemaname||'.'||tablename) as total_bytes,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
    pg_relation_size(schemaname||'.'||tablename) as table_bytes,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as index_size,
    (pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as index_bytes
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

COMMENT ON VIEW v_table_sizes IS 'Table size monitoring view';

-- Connection monitoring
CREATE OR REPLACE VIEW v_connection_stats AS
SELECT
    datname as database_name,
    usename as user_name,
    application_name,
    client_addr,
    state,
    state_change,
    query_start,
    waiting,
    COUNT(*) as connections
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY datname, usename, application_name, client_addr, state, state_change, query_start, waiting
ORDER BY query_start;

COMMENT ON VIEW v_connection_stats IS 'Connection statistics monitoring view';

-- Long-running query monitoring
CREATE OR REPLACE VIEW v_long_running_queries AS
SELECT
    pid,
    now() - query_start as duration,
    state,
    query
FROM pg_stat_activity
WHERE datname = current_database()
  AND state != 'idle'
  AND now() - query_start > interval '5 minutes'
ORDER BY duration DESC;

COMMENT ON VIEW v_long_running_queries IS 'Long-running queries monitoring view (queries > 5 minutes)';

-- Lock monitoring
CREATE OR REPLACE VIEW v_locks AS
SELECT
    l.locktype,
    l.database,
    l.relation,
    l.page,
    l.tuple,
    l.virtualxid,
    l.transactionid,
    l.classid,
    l.objid,
    l.objsubid,
    l.virtualtransaction,
    l.pid,
    l.mode,
    l.granted,
    a.usename,
    a.query,
    a.query_start,
    age(now(), a.query_start) as "age"
FROM pg_locks l
LEFT JOIN pg_stat_activity a ON l.pid = a.pid
WHERE NOT l.granted
ORDER BY a.query_start;

COMMENT ON VIEW v_locks IS 'Current lock monitoring view';

--==============================================================================
-- 4. Automatic Maintenance Functions
#------------------------------------------------------------------------------

-- Function to update table statistics
CREATE OR REPLACE FUNCTION analyze_all_tables()
RETURNS VOID AS $$
BEGIN
    ANALYZE tenants;
    ANALYZE deployments;
    ANALYZE deployment_config_snapshots;
    ANALYZE health_checks;
    ANALYZE security_audit_log;
    ANALYZE config_drift_reports;
    ANALYZE incidents;
    ANALYZE ssh_key_audit;

    RAISE NOTICE 'All tables analyzed successfully';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION analyze_all_tables() IS 'Update statistics for all tables (run periodically)';

-- Function to vacuum old audit logs
CREATE OR REPLACE FUNCTION vacuum_old_audit_logs(p_retention_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    -- Archive old audit logs to a separate table (optional)
    -- For now, just note the count that would be deleted

    SELECT COUNT(*) INTO v_deleted_count
    FROM security_audit_log
    WHERE event_timestamp < NOW() - (p_retention_days || ' days')::INTERVAL;

    -- Uncomment to actually delete old logs:
    -- DELETE FROM security_audit_log
    -- WHERE event_timestamp < NOW() - (p_retention_days || ' days')::INTERVAL;

    RAISE NOTICE 'Audit logs older than % days: % records', p_retention_days, v_deleted_count;
    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION vacuum_old_audit_logs() IS 'Count or delete old audit logs (run periodically)';

-- Function to clean up old deployments
CREATE OR REPLACE FUNCTION cleanup_old_deployments(p_retention_days INTEGER DEFAULT 365)
RETURNS INTEGER AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    -- Keep deployments for historical analysis, but mark old ones as archived
    -- This function identifies old deployments that could be archived

    SELECT COUNT(*) INTO v_deleted_count
    FROM deployments
    WHERE started_at < NOW() - (p_retention_days || ' days')::INTERVAL
    AND status = 'success';

    RAISE NOTICE 'Old deployments (>% days): % records', p_retention_days, v_deleted_count;
    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_deployments() IS 'Identify old deployments for archival (run periodically)';

--==============================================================================
-- 5. Health Check Enhancements
--==============================================================================

-- Enhanced health check function with HA status
CREATE OR REPLACE FUNCTION health_check_ha()
RETURNS TABLE(
    check_name TEXT,
    status TEXT,
    details TEXT,
    checked_at TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        'replication_status' as check_name,
        CASE
            WHEN EXISTS (SELECT 1 FROM pg_stat_replication) THEN 'pass'
            ELSE 'warning'
        END as status,
        CASE
            WHEN EXISTS (SELECT 1 FROM pg_stat_replication)
            THEN 'Replication active: ' || (SELECT COUNT(*) FROM pg_stat_replication) || ' standby(s)'
            ELSE 'No replication configured'
        END as details,
        NOW() as checked_at
    UNION ALL
    SELECT
        'database_size' as check_name,
        CASE
            WHEN pg_database_size(current_database()) < 10 * 1024 * 1024 * 1024 THEN 'pass' -- < 10GB
            WHEN pg_database_size(current_database()) < 50 * 1024 * 1024 * 1024 THEN 'warning' -- < 50GB
            ELSE 'fail' -- > 50GB
        END as status,
        'Database size: ' || pg_size_pretty(pg_database_size(current_database())) as details,
        NOW() as checked_at
    UNION ALL
    SELECT
        'connection_count' as check_name,
        CASE
            WHEN (SELECT COUNT(*) FROM pg_stat_activity WHERE datname = current_database()) < 50 THEN 'pass'
            WHEN (SELECT COUNT(*) FROM pg_stat_activity WHERE datname = current_database()) < 100 THEN 'warning'
            ELSE 'fail'
        END as status,
        'Active connections: ' || (SELECT COUNT(*) FROM pg_stat_activity WHERE datname = current_database()) as details,
        NOW() as checked_at
    UNION ALL
    SELECT * FROM health_check();
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION health_check_ha() IS 'Enhanced health check with high availability status';

--==============================================================================
-- 6. Metadata Table (for storing backup and maintenance info)
--==============================================================================

CREATE TABLE IF NOT EXISTS deployment_metadata (
    metadata_id SERIAL PRIMARY KEY,
    metadata_key VARCHAR(255) UNIQUE NOT NULL,
    metadata_value JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE deployment_metadata IS 'Deployment metadata for backups, maintenance, and operational info';
COMMENT ON COLUMN deployment_metadata.metadata_key IS 'Metadata key (e.g., backup_start, last_maintenance)';
COMMENT ON COLUMN deployment_metadata.metadata_value IS 'Metadata value (JSONB format)';

-- Create index for metadata lookups
CREATE INDEX IF NOT EXISTS idx_deployment_metadata_key ON deployment_metadata(metadata_key);

-- Insert initial metadata
INSERT INTO deployment_metadata (metadata_key, metadata_value)
VALUES
    ('database_version', jsonb_build_object('version', '1.0', 'created_at', NOW())),
    ('last_maintenance', jsonb_build_object('timestamp', NOW(), 'type', 'initial_setup'))
ON CONFLICT (metadata_key) DO NOTHING;

--==============================================================================
-- 7. Example Backup Script (Bash)
--==============================================================================

/*
#!/bin/bash
# Example backup script for deployment_state database

BACKUP_DIR="/backups/deployment_state"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/deployment_state_${DATE}.sql.gz"

# Create backup directory
mkdir -p "${BACKUP_DIR}"

# Mark backup start in database
psql -h localhost -U opclaw_state -d deployment_state -c "SELECT mark_backup_start('full');"

# Perform backup
pg_dump -h localhost -U opclaw_state -d deployment_state | gzip > "${BACKUP_FILE}"

# Get backup size
BACKUP_SIZE=$(du -m "${BACKUP_FILE}" | cut -f1)

# Mark backup complete
psql -h localhost -U opclaw_state -d deployment_state -c "SELECT mark_backup_complete(1, '${BACKUP_FILE}', ${BACKUP_SIZE}/1024.0);"

# Keep only last 30 days of backups
find "${BACKUP_DIR}" -name "deployment_state_*.sql.gz" -mtime +30 -delete

echo "Backup completed: ${BACKUP_FILE} (${BACKUP_SIZE} MB)"
*/

--==============================================================================
-- 8. Failover Procedure Documentation
--==============================================================================

/*
Failover Procedure for Deployment State Database:

1. Detect Primary Failure:
   - Monitor using health_check_ha()
   - Check replication lag in pg_stat_replication
   - Verify connectivity from application

2. Promote Standby (if using streaming replication):
   - On standby server: pg_ctl promote -D /var/lib/postgresql/data
   - Update application connection strings
   - Update DNS if using virtual IP

3. Reconfigure Replication (after failover):
   - Set old primary as new standby
   - Update recovery.conf on new standby
   - Monitor catch-up progress

4. Verification:
   - Run: SELECT * FROM health_check_ha();
   - Check all tables are accessible
   - Verify application connectivity

5. Post-Failover:
   - Investigate root cause of primary failure
   - Document incident in incidents table
   - Update monitoring and alerting

Monitoring Queries During Failover:

-- Check replication status
SELECT * FROM pg_stat_replication;

-- Check replication lag
SELECT now() - pg_last_xact_replay_timestamp() AS replication_lag;

-- Check if server is in recovery
SELECT pg_is_in_recovery();

-- View current WAL position
SELECT pg_current_wal_lsn(), pg_last_wal_replay_lsn();
*/

--==============================================================================
-- Setup Complete Notification
--==============================================================================

DO $$
BEGIN
    RAISE NOTICE '==============================================================================';
    RAISE NOTICE 'High Availability Setup Complete!';
    RAISE NOTICE '==============================================================================';
    RAISE NOTICE 'Optional HA components have been added:';
    RAISE NOTICE '  - Replication setup commands';
    RAISE NOTICE '  - Backup procedures and monitoring';
    RAISE NOTICE '  - Maintenance functions';
    RAISE NOTICE '  - Enhanced health checks';
    RAISE NOTICE '';
    RAISE NOTICE 'Next Steps:';
    RAISE NOTICE '  1. Configure replication (see documentation)';
    RAISE NOTICE '  2. Set up automated backups (crontab)';
    RAISE NOTICE '  3. Configure monitoring alerts';
    RAISE NOTICE '  4. Test failover procedures';
    RAISE NOTICE '';
    RAISE NOTICE 'Run this to test:';
    RAISE NOTICE '  SELECT * FROM health_check_ha();';
    RAISE NOTICE '==============================================================================';
END $$;
