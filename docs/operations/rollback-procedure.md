# Rollback Procedure

**Document Version**: 1.0
**Last Updated**: 2026-03-19
**Author**: TASK-004 Implementation
**Status**: Production Ready

## Overview

This document provides step-by-step procedures for rolling back AIOpc platform deployments. It covers automated and manual rollback procedures for various failure scenarios.

## Prerequisites

### Access Requirements

- SSH access to production server: `ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190`
- Permission to execute Docker operations
- Access to backup files in `/opt/opclaw/backups/`
- Permission to restart services

### Required Scripts

- `scripts/deploy/rollback.sh` - Main rollback script
- `scripts/deploy/rollback-decision-tree.sh` - Decision tree automation
- `scripts/backup/restore-db.sh` - Database restore
- `scripts/backup/restore-config.sh` - Configuration restore
- `scripts/monitoring/enhanced-health-check.sh` - Health verification

### Pre-Rollback Checklist

- [ ] Verify backup exists and is accessible
- [ ] Confirm rollback is necessary (check health status)
- [ ] Notify team of upcoming rollback
- [ ] Schedule maintenance window if needed
- [ ] Prepare rollback plan

## Quick Rollback (Emergency)

### Scenario: Immediate Rollback Required

**Time Target**: < 3 minutes

```bash
# 1. Run health check to confirm failure
./scripts/monitoring/enhanced-health-check.sh --json

# 2. If critical failure, execute automatic rollback
./scripts/deploy/rollback.sh --env production --component all

# 3. Verify rollback success
./scripts/monitoring/enhanced-health-check.sh
```

**Expected Output**:
```
==============================================================================
AIOpc 回滚脚本 (Rollback Script)
==============================================================================
时间戳 (Timestamp): 20260319_123456
主机 (Host): root@118.25.0.190
组件 (Component): all
环境 (Environment): production
==============================================================================

确认回滚到 /opt/opclaw/backups/backup_20260318_120000? (yes/no): yes

==> 回滚后端 (Rolling back backend)
INFO: 停止后端服务...
INFO: 恢复后端文件...
INFO: 启动后端服务...
SUCCESS: 后端回滚完成

==> 验证回滚 (Verifying rollback)
INFO: 验证后端...
SUCCESS: 后端验证通过
SUCCESS: 所有验证通过

==> 回滚成功完成! (Rollback completed successfully!)
```

## Automated Rollback Procedure

### Scenario: Health Check Failure Triggers Automatic Rollback

**Trigger**: Deployment health check fails within 15 minutes

**Procedure**:

```bash
# 1. Health check runs automatically after deployment
./scripts/monitoring/enhanced-health-check.sh --json > /tmp/health-status.json

# 2. Rollback decision tree evaluates failure
./scripts/deploy/rollback-decision-tree.sh --auto

# 3. Script executes rollback if criteria met
#    - Deployment age < 15 minutes
#    - Critical health check failures
#    - Automatic rollback trigger conditions met

# 4. Post-rollback verification runs automatically
./scripts/monitoring/enhanced-health-check.sh
```

**Automatic Rollback Criteria**:
- All critical health check layers failed
- Deployment completed within 15 minutes
- No manual override in place

**Manual Override**:
```bash
# To prevent automatic rollback
./scripts/deploy/rollback-decision-tree.sh --disable-auto

# To re-enable automatic rollback
./scripts/deploy/rollback-decision-tree.sh --enable-auto
```

## Manual Rollback Procedure

### Scenario: Manual Rollback Decision Required

**Trigger**: Health check failure after 15 minutes, or non-critical issues

**Procedure**:

#### Step 1: Assess Current State

```bash
# Check health status
./scripts/monitoring/enhanced-health-check.sh

# Check recent deployments
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 "ls -lt /opt/opclaw/backups/ | head -10"

# Check deployment logs
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 "docker logs opclaw-backend --tail 100"
```

#### Step 2: Select Rollback Version

```bash
# List available backups
./scripts/deploy/rollback.sh --list

# Output:
# [1] backup_20260318_120000
#     Timestamp: 2026-03-18 12:00:00
#     Deploy Date: 2026-03-18 12:00:00
#     Component: all
#     Environment: production
#
# [2] backup_20260317_180000
#     Timestamp: 2026-03-17 18:00:00
#     ...
```

#### Step 3: Execute Rollback

```bash
# Rollback to latest backup
./scripts/deploy/rollback.sh --env production --component all

# OR rollback to specific version
./scripts/deploy/rollback.sh --to backup_20260318_120000

# OR rollback specific component only
./scripts/deploy/rollback.sh --component backend
```

#### Step 4: Verify Rollback

```bash
# Run health checks
./scripts/monitoring/enhanced-health-check.sh

# Check specific layers
./scripts/monitoring/health-check-layer1.sh  # HTTP health
./scripts/monitoring/health-check-layer2.sh  # DB connection
./scripts/monitoring/health-check-layer3.sh  # DB query
```

## Partial Rollback Procedure

### Scenario: Component-Specific Failure

**Use When**:
- Only one component failed
- Other components working correctly
- Faster rollback time needed

#### Backend-Only Rollback

```bash
# 1. Verify backend failure
curl http://118.25.0.190:3000/health
# Expected: HTTP 5xx or timeout

# 2. Rollback backend only
./scripts/deploy/rollback.sh --component backend

# 3. Verify backend recovery
curl http://118.25.0.190:3000/health
# Expected: HTTP 200 with healthy status
```

#### Frontend-Only Rollback

```bash
# 1. Verify frontend failure
curl -I http://renava.cn
# Expected: HTTP 5xx or incorrect content

# 2. Rollback frontend only
./scripts/deploy/rollback.sh --component frontend

# 3. Verify frontend recovery
curl -I http://renava.cn
# Expected: HTTP 200 with correct content
```

#### Database-Only Rollback

```bash
# 1. Verify database issue
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 \
  "docker exec opclaw-postgres psql -U opclaw -d opclaw -c 'SELECT count(*) FROM users;'"

# 2. Rollback database only
./scripts/backup/restore-db.sh --source /opt/opclaw/backups/backup_20260318_120000

# 3. Verify database recovery
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 \
  "docker exec opclaw-postgres psql -U opclaw -d opclaw -c 'SELECT count(*) FROM users;'"
```

## Database Rollback Procedure

### Scenario: Database Migration Failure or Data Corruption

**Time Target**: < 3 minutes

#### Step 1: Identify Database Issue

```bash
# Check database connection
./scripts/monitoring/health-check-layer2.sh

# Check database query execution
./scripts/monitoring/health-check-layer3.sh

# Check database logs
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 \
  "docker logs opclaw-postgres --tail 50"
```

#### Step 2: Create Pre-Rollback Backup

```bash
# Always backup current database before rollback
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 \
  "docker exec opclaw-postgres pg_dump -U opclaw opclaw | \
   gzip > /opt/opclaw/backups/pre-rollback_\$(date +%Y%m%d_%H%M%S)/database.sql.gz"
```

#### Step 3: Restore Database

```bash
# Method 1: Using restore script (recommended)
./scripts/backup/restore-db.sh \
  --source /opt/opclaw/backups/backup_20260318_120000 \
  --type database

# Method 2: Manual restore
# Extract and restore database
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 \
  "gunzip < /opt/opclaw/backups/backup_20260318_120000/database.sql.gz | \
   docker exec -i opclaw-postgres psql -U opclaw opclaw"
```

#### Step 4: Verify Data Integrity

```bash
# Check database connectivity
./scripts/monitoring/health-check-layer2.sh

# Check query execution
./scripts/monitoring/health-check-layer3.sh

# Verify critical data
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 \
  "docker exec opclaw-postgres psql -U opclaw -d opclaw -c \
  'SELECT COUNT(*) FROM users; SELECT COUNT(*) FROM instances;'"
```

## Configuration Rollback Procedure

### Scenario: Configuration Error or Drift Detected

**Time Target**: < 2 minutes

#### Step 1: Identify Configuration Issue

```bash
# Check for configuration drift
./scripts/monitoring/detect-config-drift.sh

# Check current configuration
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 \
  "cat /opt/opclaw/backend/.env | grep -E 'FEISHU|JWT|DB_'"
```

#### Step 2: Restore Configuration

```bash
# Method 1: Using restore script (recommended)
./scripts/backup/restore-config.sh \
  --source /opt/opclaw/backups/backup_20260318_120000

# Method 2: Manual restore
# Restore environment configuration
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 \
  "cp /opt/opclaw/backups/backup_20260318_120000/.env \
     /opt/opclaw/backend/.env"

# Restore nginx configuration
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 \
  "cp /opt/opclaw/backups/backup_20260318_120000/nginx.conf \
     /etc/nginx/sites-available/opclaw && \
   systemctl reload nginx"
```

#### Step 3: Restart Services

```bash
# Restart backend to apply configuration
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 \
  "cd /opt/opclaw && docker compose restart backend"

# Reload nginx
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 \
  "systemctl reload nginx"
```

#### Step 4: Verify Configuration

```bash
# Verify environment configuration loaded
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 \
  "docker exec opclaw-backend printenv | grep -E 'FEISHU|JWT|DB_'"

# Run health checks
./scripts/monitoring/enhanced-health-check.sh
```

## Rollback Verification

### Post-Rollback Health Checks

After any rollback, verify system health:

```bash
# Run complete health check suite
./scripts/monitoring/enhanced-health-check.sh --verbose

# Expected output:
# ✓ Layer 1 (HTTP Health): PASS
# ✓ Layer 2 (Database Connection): PASS
# ✓ Layer 3 (Database Query): PASS
# ✓ Layer 4 (OAuth Configuration): PASS
# ✓ Layer 5 (Redis Connection): PASS
#
# Overall Status: HEALTHY
# Execution Time: 45.2s
```

### Manual Verification Steps

1. **Check Service Status**:
   ```bash
   ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 \
     "cd /opt/opclaw && docker compose ps"
   ```

2. **Check Application Logs**:
   ```bash
   ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 \
     "docker logs opclaw-backend --tail 50"
   ```

3. **Check API Endpoints**:
   ```bash
   curl http://118.25.0.190:3000/health
   curl http://renava.cn/api/health
   ```

4. **Check Database Connectivity**:
   ```bash
   ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 \
     "docker exec opclaw-postgres pg_isready -U opclaw"
   ```

## Rollback Failure Handling

### If Rollback Fails

#### Step 1: Identify Failure Point

```bash
# Check rollback logs
tail -100 /Users/arthurren/projects/AIOpc/rollback.log

# Check server logs
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 \
  "journalctl -u docker -n 50"
```

#### Step 2: Attempt Manual Recovery

```bash
# If database restore failed, retry manually
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 \
  "gunzip < /opt/opclaw/backups/backup_20260318_120000/database.sql.gz | \
   docker exec -i opclaw-postgres psql -U opclaw opclaw"

# If code restore failed, retry manually
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 \
  "cd /opt/opclaw && tar -xzf /opt/opclaw/backups/backup_20260318_120000/backend.tar.gz"

# If service restart failed, check Docker
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 \
  "docker ps -a | grep opclaw"
```

#### Step 3: Use Pre-Rollback Backup

If rollback created a pre-rollback backup, use it:

```bash
./scripts/backup/restore.sh \
  --source /opt/opclaw/backups/pre-rollback_20260319_123456 \
  --type all
```

#### Step 4: Escalate If Needed

If manual recovery fails:
1. Page on-call engineer
2. Activate incident response
3. Consider full system restore from backup

## Rollback Time Optimization

### Speed Optimization Techniques

#### 1. Parallel Rollback Operations

```bash
# Run database and code rollback in parallel
# (Script handles this automatically)
```

#### 2. Optimized Database Restore

```bash
# Direct pipe restore (no intermediate file)
gunzip < backup.sql.gz | docker exec -i db psql -U user db
```

#### 3. Pre-Validation

```bash
# Validate backup before starting rollback
./scripts/backup/verify-backup.sh \
  --source /opt/opclaw/backups/backup_20260318_120000
```

#### 4. Graceful Service Shutdown

```bash
# Stop services gracefully before rollback
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 \
  "cd /opt/opclaw && docker compose stop --timeout 30"
```

### Time Budget Breakdown

| Phase | Target | Optimization |
|-------|--------|--------------|
| Pre-rollback Check | 20s | Parallel validation |
| Backup Creation | 25s | Skip if recent backup exists |
| Database Restore | 45s | Direct pipe restore |
| Code Restore | 20s | Parallel with DB |
| Config Restore | 15s | Batch operations |
| Service Restart | 25s | Graceful shutdown |
| Health Verification | 30s | Parallel health checks |
| **TOTAL** | **2m 50s** | **Under 3min target** |

## Post-Rollback Actions

### 1. Document Rollback

```bash
# Create rollback incident report
cat > /tmp/rollback-report.md <<EOF
# Rollback Report

**Date**: $(date)
**Trigger**: Health check failure
**Rollback Version**: backup_20260318_120000
**Rollback Time**: 2m 45s
**Reason**: [Fill in reason]

**Root Cause**: [To be determined]

**Prevention**: [Action items]

EOF
```

### 2. Notify Team

```bash
# Post to Slack (example)
curl -X POST \
  -H 'Content-type: application/json' \
  --data '{"text":"Rollback completed: backend restored to backup_20260318_120000"}' \
  https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

### 3. Monitor System

```bash
# Continuous monitoring for 30 minutes
watch -n 30 './scripts/monitoring/enhanced-health-check.sh --json'
```

### 4. Schedule Root Cause Analysis

- Schedule postmortem meeting within 24 hours
- Review rollback procedure effectiveness
- Identify improvements needed

## Rollback Testing

### Staging Environment Test

Before production rollback, test in staging:

```bash
# 1. Deploy to staging
./scripts/deploy/deploy.sh --env staging

# 2. Trigger failure (simulated)
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 \
  "docker stop opclaw-backend"

# 3. Execute rollback
./scripts/deploy/rollback.sh --env staging

# 4. Verify recovery
./scripts/monitoring/enhanced-health-check.sh
```

### Rollback Drill Checklist

- [ ] Full rollback procedure tested
- [ ] Partial rollback tested
- [ ] Database rollback tested
- [ ] Configuration rollback tested
- [ ] Rollback time measured
- [ ] Health verification tested
- [ ] Team communication tested
- [ ] Documentation updated

## Troubleshooting

### Common Issues

#### Issue: Rollback Script Fails

**Symptoms**: Script exits with error
**Causes**:
- SSH connection failure
- Backup file missing
- Insufficient permissions

**Solutions**:
```bash
# Check SSH connection
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 "echo 'Connection OK'"

# Check backup exists
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 \
  "ls -la /opt/opclaw/backups/backup_20260318_120000"

# Check permissions
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 \
  "ls -la /opt/opclaw/backups/"
```

#### Issue: Database Restore Fails

**Symptoms**: Database restore command fails
**Causes**:
- Database connection refused
- Insufficient disk space
- Corrupted backup file

**Solutions**:
```bash
# Check database running
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 \
  "docker ps | grep opclaw-postgres"

# Check disk space
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 \
  "df -h /opt/opclaw"

# Verify backup integrity
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 \
  "gunzip -t /opt/opclaw/backups/backup_20260318_120000/database.sql.gz"
```

#### Issue: Services Won't Start After Rollback

**Symptoms**: Docker containers fail to start
**Causes**:
- Configuration error
- Port conflict
- Resource constraints

**Solutions**:
```bash
# Check container logs
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 \
  "docker logs opclaw-backend"

# Check port availability
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 \
  "netstat -tulpn | grep :3000"

# Check system resources
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 \
  "free -h && df -h"
```

## References

- [Rollback Decision Tree](./rollback-decision-tree.md)
- [Production Backup Procedure](./production-backup-procedure.md)
- [Enhanced Health Check](../scripts/monitoring/enhanced-health-check.sh)
- [Incident Response](./INCIDENT_RESPONSE.md)

## Change History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-19 | TASK-004 | Initial version |
