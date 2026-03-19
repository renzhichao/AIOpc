# Zero-Downtime Migration Guide

**Version**: 1.0
**Last Updated**: 2026-03-19
**Maintained By**: DevOps Team

## Overview

This guide provides comprehensive procedures for executing zero-downtime migrations of the AIOpc platform. It covers the complete migration lifecycle from planning through post-migration monitoring.

**Target Metrics**:
- Migration Time: < 60 minutes
- Downtime: < 5 minutes
- Rollback Time: < 3 minutes
- OAuth Success Rate: > 99%
- Data Integrity: 100%

## Table of Contents

1. [Pre-Migration Phase](#pre-migration-phase)
2. [Migration Execution](#migration-execution)
3. [Post-Migration Monitoring](#post-migration-monitoring)
4. [Rollback Procedures](#rollback-procedures)
5. [Troubleshooting](#troubleshooting)
6. [Best Practices](#best-practices)

---

## Pre-Migration Phase

### Timeline: Day -7 to Day -1

### Day -7: Planning and Preparation

**Objective**: Establish migration plan and team coordination

**Checklist**:
- [ ] Define migration scope and objectives
- [ ] Schedule maintenance window (02:00-04:00 recommended)
- [ ] Identify all stakeholders and communication channels
- [ ] Assign migration lead and on-call engineer
- [ ] Document rollback plan
- [ ] Complete risk assessment

**Deliverables**:
- Migration plan document
- Stakeholder contact list
- Risk assessment matrix
- Communication plan

### Day -5 to -3: Staging Environment Setup

**Objective**: Prepare and validate staging environment

**Environment Requirements**:
```yaml
staging:
  server: Dedicated staging server
  os: Ubuntu 20.04+ or CentOS 8+
  docker: Docker 20.10+ and Docker Compose 2.0+
  database: PostgreSQL 14+
  cache: Redis 6+
  network: Isolated from production
```

**Setup Steps**:

1. **Server Preparation**:
```bash
# Install Docker and Docker Compose
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

2. **Database Setup**:
```bash
# Start PostgreSQL
docker run -d \
  --name staging-postgres \
  -e POSTGRES_PASSWORD=staging_password \
  -e POSTGRES_DB=opclaw_staging \
  -p 5432:5432 \
  postgres:14

# Verify connection
docker exec staging-postgres pg_isready -U postgres
```

3. **Application Deployment**:
```bash
# Clone repository
git clone <repository-url> /opt/opclaw-staging
cd /opt/opclaw-staging

# Configure environment
cp .env.staging.example .env.staging
# Edit .env.staging with staging configuration

# Deploy services
docker-compose -f docker-compose.staging.yml up -d
```

**Validation Steps**:
- [ ] All containers running (`docker ps`)
- [ ] Health checks passing (all 5 layers)
- [ ] OAuth flow functional
- [ ] Database connectivity verified
- [ ] Performance baseline recorded

### Day -2: Backup Verification

**Objective**: Validate backup and restoration procedures

**Backup Components**:

1. **Database Backup**:
```bash
# Create backup
docker exec staging-postgres pg_dump -U postgres opclaw_staging | \
  gzip > /opt/backups/staging_db_$(date +%Y%m%d).sql.gz

# Verify backup integrity
gunzip -t /opt/backups/staging_db_$(date +%Y%m%d).sql.gz

# Test restoration
docker run --rm -d --name temp-restore \
  -e POSTGRES_PASSWORD=test \
  postgres:14
gunzip < /opt/backups/staging_db_$(date +%Y%m%d).sql.gz | \
  docker exec -i temp-restore psql -U postgres -d postgres
```

2. **Configuration Backup**:
```bash
# Backup configuration files
tar -czf /opt/backups/staging_config_$(date +%Y%m%d).tar.gz \
  /opt/opclaw-staging/.env.staging \
  /opt/opclaw-staging/docker-compose.staging.yml
```

3. **Code Backup**:
```bash
# Backup application code
tar -czf /opt/backups/staging_code_$(date +%Y%m%d).tar.gz \
  -C /opt/opclaw-staging platform \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.git'
```

**Backup Verification Checklist**:
- [ ] All backup files created successfully
- [ ] Backup file integrity verified (no corruption)
- [ ] Restoration procedure tested
- [ ] Restoration time measured (< 3 minutes target)
- [ ] Backup location documented

### Day -1: Pre-Migration Testing

**Objective**: Execute complete migration test in staging

**Test Migration**:
```bash
# Execute staging migration test
cd /opt/opclaw-staging/scripts/migration
./test-migration-staging.sh --phase 1 --test-rollback
```

**Validation Criteria**:
- [ ] Migration completes < 60 minutes
- [ ] Downtime < 5 minutes
- [ ] Rollback < 3 minutes
- [ ] All health checks passing
- [ ] OAuth flow functional
- [ ] Data integrity verified
- [ ] Performance within 10% of baseline

**Go/No-Go Decision**:

**GO Criteria**:
- All validation criteria met
- No critical issues identified
- Rollback procedure tested successfully
- Team ready and available

**NO-GO Triggers**:
- Critical bugs discovered
- Performance degradation > 10%
- OAuth flow not working
- Rollback procedure failed
- Team member unavailable

---

## Migration Execution

### Timeline: Day 0, 02:00-04:00

### T-30min: Final Verification (02:00-02:30)

**Objective**: Confirm readiness for migration

**Checklist**:
- [ ] Team check-in completed (Slack/standup)
- [ ] Backup integrity confirmed
- [ ] Staging environment ready
- [ ] Rollback scripts prepared and tested
- [ ] Monitoring dashboards active
- [ ] Communication channels open

**Commands**:
```bash
# Verify backup
ls -lh /opt/backups/staging_db_$(date +%Y%m%d).sql.gz
gunzip -t /opt/backups/staging_db_$(date +%Y%m%d).sql.gz

# Check container status
docker ps --format "table {{.Names}}\t{{.Status}}"

# Run health check
./scripts/monitoring/enhanced-health-check.sh
```

### T-15min: Pre-Migration Checks (02:30-02:45)

**Objective**: Final system validation before migration

**Disk Space Check**:
```bash
df -h / | awk 'NR==2 {print "Disk usage: "$5" (free: "$4")"}'
# Target: < 80% used
```

**Database Connectivity**:
```bash
docker exec opclaw-postgres pg_isready -U opclaw
# Expected: "opclaw-postgres is accepting connections"
```

**Configuration Validation**:
```bash
grep -E 'cli_xxxxxxxxxxxxx|CHANGE_THIS|placeholder' /opt/opclaw/.env.production
# Expected: No matches (empty output)
```

**Container Status**:
```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
# Verify: backend, postgres, redis all running
```

**Performance Baseline**:
```bash
# Record baseline metrics
docker stats opclaw-backend --no-stream --format "Backend: {{.CPUPerc}} CPU, {{.MemUsage}} RAM"
docker stats opclaw-postgres --no-stream --format "DB: {{.CPUPerc}} CPU, {{.MemUsage}} RAM"
```

### T-0: Migration Start (02:45)

**Objective**: Announce maintenance and initiate migration

**Announcement Template**:
```
🚀 MAINTENANCE ANNOUNCEMENT

Migration ID: migration_20260319_024500
Start Time: 2026-03-19 02:45:00 UTC
Estimated Duration: 60 minutes
Estimated Downtime: 5 minutes

Services Affected:
- Web Application
- API Endpoints
- OAuth Login

Migration Lead: @username
On-Call Engineer: @username
Status Updates: #migration-updates channel

Thank you for your patience!
```

**Pre-Migration Snapshot**:
```bash
# Create state snapshot
cat > /opt/backups/pre_migration_state_$(date +%Y%m%d_%H%M%S).txt <<EOF
Migration ID: migration_$(date +%Y%m%d_%H%M%S)
Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)

Containers:
$(docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}")

Database Size:
$(docker exec opclaw-postgres psql -U opclaw -d opclaw -c "SELECT pg_size_pretty(pg_database_size('opclaw'));" -t)

Resource Usage:
$(docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}")
EOF
```

### T+5min: Migration Execution (02:50)

**Objective**: Execute migration with minimal downtime

**Step-by-Step Process**:

1. **Stop Services (Downtime Starts)**:
```bash
# Graceful shutdown
docker stop opclaw-backend
# Downtime timer starts here
DOWNTIME_START=$(date +%s)
```

2. **Apply Migration Changes**:
```bash
# Pull latest code
cd /opt/opclaw/platform
git pull origin main

# Run database migrations
docker exec -i opclaw-postgres psql -U opclaw -d opclaw < migrations/migrate.sql

# Update configuration
cp .env.production.new .env.production
```

3. **Start Services (Downtime Ends)**:
```bash
# Start backend
docker start opclaw-backend

# Wait for health check
sleep 10

# Verify service is up
curl -f http://localhost:3000/health || echo "Service not ready"
# Downtime timer ends here
DOWNTIME_END=$(date +%s)

# Calculate downtime
DOWNTIME=$((DOWNTIME_END - DOWNTIME_START))
echo "Downtime: ${DOWNTIME} seconds ($(($DOWNTIME / 60)) minutes)"
```

**Timing Targets**:
- Target: < 5 minutes
- Warning: 5-7 minutes
- Critical: > 7 minutes (consider rollback)

### T+20min: Health Validation (03:05)

**Objective**: Verify system health after migration

**Enhanced Health Check**:
```bash
./scripts/monitoring/enhanced-health-check.sh --verbose
```

**Layer-by-Layer Validation**:

1. **Layer 1: HTTP Health Check**:
```bash
curl -f http://localhost:3000/health
# Expected: 200 OK with health status JSON
```

2. **Layer 2: Database Connection**:
```bash
docker exec opclaw-postgres pg_isready -U opclaw
# Expected: "opclaw-postgres accepting connections"
```

3. **Layer 3: Database Query Test**:
```bash
docker exec opclaw-postgres psql -U opclaw -d opclaw -c "SELECT 1;"
# Expected: Returns "1"
```

4. **Layer 4: OAuth Configuration**:
```bash
grep "^FEISHU_APP_ID=" /opt/opclaw/.env.production
grep "^FEISHU_APP_SECRET=" /opt/opclaw/.env.production
# Expected: Both variables present and non-empty
```

5. **Layer 5: Redis Connection**:
```bash
docker exec opclaw-redis redis-cli ping
# Expected: "PONG"
```

**Validation Results**:
- [ ] All 5 health layers passing
- [ ] HTTP status codes all 200-299
- [ ] Database responding within 100ms
- [ ] Redis responding within 50ms
- [ ] No critical errors in logs

### T+30min: OAuth Flow Testing (03:15)

**Objective**: Validate OAuth authentication end-to-end

**Test Cases**:

1. **OAuth Endpoint Health**:
```bash
curl -f http://localhost:3000/api/auth/feishu/health
# Expected: 200 OK
```

2. **QR Code Generation**:
```bash
curl -X POST http://localhost:3000/api/auth/feishu/qr \
  -H "Content-Type: application/json" \
  -d '{"state":"test_123"}'
# Expected: QR code data in response
```

3. **Token Exchange** (requires manual testing):
   - Open OAuth URL in browser
   - Scan QR code with Feishu app
   - Verify successful authentication
   - Check session creation

4. **Session Management**:
```bash
# Check active sessions
curl -X GET http://localhost:3000/api/auth/sessions \
  -H "Authorization: Bearer <token>"
# Expected: List of active sessions
```

**Validation Checklist**:
- [ ] OAuth endpoint accessible
- [ ] QR code generation working
- [ ] Token exchange successful
- [ ] User authentication functional
- [ ] Session management working
- [ ] Logout process functional

### T+45min: Performance Validation (03:30)

**Objective**: Verify performance metrics are acceptable

**Response Time Testing**:
```bash
# Measure average response time
for i in {1..100}; do
  curl -o /dev/null -s -w "%{time_total}\n" http://localhost:3000/health
done | awk '{sum+=$1; count++} END {print "Average:", sum/count "s"}'
# Target: < 0.5s average
```

**Database Performance**:
```bash
# Check database query performance
docker exec opclaw-postgres psql -U opclaw -d opclaw <<EOF
SELECT
  schemaname,
  tablename,
  seq_scan,
  seq_tup_read,
  idx_scan,
  idx_tup_fetch
FROM pg_stat_user_tables
ORDER BY seq_scan DESC;
EOF
# Look for: High seq_scan (should use indexes)
```

**Resource Usage**:
```bash
# Compare with baseline
docker stats opclaw-backend --no-stream --format "{{.CPUPerc}},{{.MemUsage}}"
docker stats opclaw-postgres --no-stream --format "{{.CPUPerc}},{{.MemUsage}}"
# Target: Within 10% of baseline
```

**Performance Checklist**:
- [ ] Response times within 10% of baseline
- [ ] Memory usage normal
- [ ] CPU usage normal
- [ ] Database query performance acceptable
- [ ] Cache hit ratio > 80%

### T+60min: Migration Complete (03:45)

**Objective**: Declare migration successful

**Final Validation**:
```bash
# Run comprehensive health check
./scripts/monitoring/enhanced-health-check.sh

# Check for errors in logs
tail -100 /var/log/opclaw/backend.log | grep -i error
# Expected: No critical errors

# Verify all services running
docker ps --format "table {{.Names}}\t{{.Status}}"
# Expected: All services "Up"
```

**Success Announcement Template**:
```
✅ MIGRATION COMPLETE

Migration ID: migration_20260319_024500
End Time: 2026-03-19 03:45:00 UTC
Total Duration: 60 minutes
Downtime: 3 minutes 45 seconds

Status: SUCCESS

All Services:
✅ Backend: Operational
✅ Database: Operational
✅ Redis: Operational
✅ OAuth: Functional

Performance:
✅ Response Times: Normal
✅ Resource Usage: Normal
✅ Error Rate: 0%

Next Steps:
- 24-hour monitoring active
- On-call engineer available
- Daily health checks scheduled

Thank you for your patience!
```

---

## Post-Migration Monitoring

### Timeline: Day 0-7

### Day 0: 24-Hour On-Call Monitoring

**Objective**: Immediate post-migration monitoring and rapid incident response

**Monitoring Setup**:
```bash
# Start automated monitoring
cd /opt/opclaw/scripts/migration
./post-migration-monitor.sh --duration 86400 --interval 300
```

**Monitoring Metrics**:

1. **Health Checks** (every 5 minutes):
   - HTTP endpoint status
   - Database connectivity
   - Database query performance
   - OAuth configuration
   - Redis connectivity

2. **Resource Usage**:
   - CPU utilization
   - Memory usage
   - Disk I/O
   - Network I/O

3. **Application Metrics**:
   - Request rate
   - Response times
   - Error rate
   - OAuth success rate

4. **Database Metrics**:
   - Connection count
   - Query performance
   - Lock contention
   - Replication lag (if applicable)

**Alert Thresholds**:
```yaml
cpu:
  warning: 80%
  critical: 90%
memory:
  warning: 80%
  critical: 90%
disk:
  warning: 80%
  critical: 90%
error_rate:
  warning: 5%
  critical: 10%
response_time:
  warning: 1s
  critical: 2s
```

**Incident Response**:
- Alert received → Investigate within 5 minutes
- Critical issue → Execute rollback decision tree
- Non-critical issue → Document and monitor

### Day 1-7: Daily Health Checks

**Objective**: Extended monitoring and trend analysis

**Daily Checklist**:
- [ ] Review health check results
- [ ] Analyze error logs
- [ ] Check resource usage trends
- [ ] Verify performance metrics
- [ ] Collect user feedback
- [ ] Document any issues

**Daily Commands**:
```bash
# Run health check
./scripts/monitoring/enhanced-health-check.sh

# Check error logs
tail -500 /var/log/opclaw/backend.log | grep -i error

# Check resource usage
docker stats --no-stream --format "table {{.Name}}\t{{.CPUs}}\t{{.MemUsage}}"

# Check database size
docker exec opclaw-postgres psql -U opclaw -d opclaw \
  -c "SELECT pg_size_pretty(pg_database_size('opclaw'));"
```

### Day 7: Post-Migration Review

**Objective**: Final assessment and documentation

**Review Checklist**:
- [ ] All 24-hour monitoring clean
- [ ] No critical incidents
- [ ] Performance stable
- [ ] User feedback positive
- [ ] Migration report completed
- [ ] Lessons learned documented

---

## Rollback Procedures

### Rollback Decision Tree

```
Health Check Failed?
    │
    ├─ Backend HTTP != 200?
    │   └─ YES: Check backend logs
    │       ├─ Database connection error?
    │       │   └─ YES: Restore .env.production from backup
    │       ├─ Port binding error?
    │       │   └─ YES: Restart backend container
    │       └─ Other error?
    │           └─ YES: Rollback to previous code
    │
    ├─ Database unhealthy?
    │   └─ YES: Check database logs
    │       ├─ Connection refused?
    │       │   └─ YES: Restart database container
    │       ├─ Data corruption?
    │       │   └─ YES: Restore database from backup
    │       └─ Other error?
    │           └─ YES: Escalate to DBA
    │
    └─ OAuth callback failing?
        └─ YES: Check Feishu configuration
            ├─ App ID mismatch?
            │   └─ YES: Restore .env.production
            ├─ Redirect URI mismatch?
            │   └─ YES: Update Feishu app config
            └─ Other error?
                └─ YES: Escalate to Feishu support
```

### Automated Rollback

**Execution**:
```bash
# Use rollback decision tree script
cd /opt/opclaw/scripts/deploy
./rollback-decision-tree.sh --auto-rollback
```

**Manual Rollback Steps**:

1. **Stop Current Services**:
```bash
docker stop opclaw-backend
```

2. **Restore Database**:
```bash
# Find latest backup
LATEST_BACKUP=$(ls -t /opt/backups/staging_db_*.sql.gz | head -1)

# Restore database
gunzip < "$LATEST_BACKUP" | \
  docker exec -i opclaw-postgres psql -U opclaw -d opclaw
```

3. **Restore Configuration**:
```bash
# Restore from backup
cp /opt/backups/.env.production.backup /opt/opclaw/.env.production
```

4. **Restore Code**:
```bash
# Revert to previous git commit
cd /opt/opclaw/platform
git revert HEAD
# OR
git checkout <previous-commit-hash>
```

5. **Restart Services**:
```bash
docker start opclaw-backend
```

6. **Verify Rollback**:
```bash
# Run health checks
./scripts/monitoring/enhanced-health-check.sh

# Verify OAuth working
curl -f http://localhost:3000/api/auth/feishu/health
```

**Rollback Timing Target**: < 3 minutes

---

## Troubleshooting

### Common Issues

#### Issue 1: Backend Not Starting

**Symptoms**:
- Container exits immediately
- Health check returns 503
- Logs show "Cannot connect to database"

**Diagnosis**:
```bash
# Check container logs
docker logs opclaw-backend --tail 100

# Check database connectivity
docker exec opclaw-backend ping -c 3 opclaw-postgres

# Verify database is ready
docker exec opclaw-postgres pg_isready -U opclaw
```

**Solutions**:
1. Database not ready → Wait for database to start
2. Wrong database credentials → Restore .env.production from backup
3. Database not accessible → Check network configuration
4. Port conflict → Check port binding

#### Issue 2: OAuth Not Working

**Symptoms**:
- OAuth login fails
- QR code not generating
- Token exchange fails

**Diagnosis**:
```bash
# Check OAuth configuration
grep "^FEISHU_APP_ID=" /opt/opclaw/.env.production
grep "^FEISHU_APP_SECRET=" /opt/opclaw/.env.production

# Check OAuth endpoint
curl -f http://localhost:3000/api/auth/feishu/health

# Check backend logs for OAuth errors
docker logs opclaw-backend | grep -i oauth
```

**Solutions**:
1. Missing configuration → Restore .env.production from backup
2. Invalid credentials → Verify Feishu app configuration
3. Redirect URI mismatch → Update Feishu app settings

#### Issue 3: High Memory Usage

**Symptoms**:
- Container OOM killed
- Memory usage > 90%
- Performance degradation

**Diagnosis**:
```bash
# Check memory usage
docker stats opclaw-backend --no-stream

# Check container limits
docker inspect opclaw-backend | grep -i memory

# Check for memory leaks
docker logs opclaw-backend | grep -i "out of memory"
```

**Solutions**:
1. Temporary spike → Restart container
2. Memory leak → Investigate application code
3. Insufficient limits → Increase container memory limit

#### Issue 4: Database Slow

**Symptoms**:
- Queries timing out
- High response times
- Database CPU > 80%

**Diagnosis**:
```bash
# Check long-running queries
docker exec opclaw-postgres psql -U opclaw -d opclaw <<EOF
SELECT pid, now() - query_start as duration, query
FROM pg_stat_activity
WHERE state = 'active'
ORDER BY query_start;
EOF

# Check database size
docker exec opclaw-postgres psql -U opclaw -d opclaw \
  -c "SELECT pg_size_pretty(pg_database_size('opclaw'));"

# Check table bloat
docker exec opclaw-postgres psql -U opclaw -d opclaw <<EOF
SELECT
  schemaname, tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;
EOF
```

**Solutions**:
1. Long-running queries → Kill or optimize queries
2. Missing indexes → Create indexes
3. Database bloat → Run VACUUM ANALYZE
4. High connection count → Investigate connection pooling

---

## Best Practices

### Pre-Migration

1. **Always test in staging first**
   - Never skip staging validation
   - Test rollback procedures
   - Measure timing metrics

2. **Document everything**
   - Current system state
   - Backup locations
   - Rollback procedures
   - Contact information

3. **Prepare rollback plan**
   - Test rollback procedures
   - Verify backup integrity
   - Time rollback execution

### During Migration

1. **Maintain communication**
   - Regular status updates
   - Clear timeline
   - Incident notifications

2. **Monitor continuously**
   - Health checks every step
   - Resource usage tracking
   - Error rate monitoring

3. **Be prepared to rollback**
   - Set clear rollback triggers
   - Don't hesitate to rollback
   - Document rollback reasons

### Post-Migration

1. **Extended monitoring**
   - 24-hour on-call coverage
   - Frequent health checks
   - Alert notifications

2. **Document lessons learned**
   - What went well
   - What could be improved
   - Recommendations for next time

3. **Update documentation**
   - Runbook updates
   - Configuration changes
   - Architecture diagrams

---

## Appendix

### A. Migration Scripts Reference

- `scripts/migration/test-migration-staging.sh` - Staging migration test
- `scripts/migration/migration-checklist.md` - Migration checklist
- `scripts/migration/post-migration-monitor.sh` - 24-hour monitoring
- `scripts/monitoring/enhanced-health-check.sh` - Health checks
- `scripts/backup/backup-production.sh` - Backup procedures
- `scripts/backup/restore-db.sh` - Database restore
- `scripts/deploy/rollback-decision-tree.sh` - Rollback automation

### B. Contact Information

**Migration Team**:
- Migration Lead: [Name] - [Email] - [Phone]
- On-Call Engineer: [Name] - [Email] - [Phone]
- Database Admin: [Name] - [Email] - [Phone]
- DevOps Engineer: [Name] - [Email] - [Phone]

**Stakeholders**:
- Product Manager: [Name] - [Email]
- Engineering Manager: [Name] - [Email]
- Customer Support: [Name] - [Email]

### C. Communication Channels

- Status Updates: #migration-updates
- Incident Response: #incident-response
- General Discussion: #devops

### D. Useful Commands

```bash
# Quick health check
curl -f http://localhost:3000/health

# Container status
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Resource usage
docker stats --no-stream --format "table {{.Name}}\t{{.CPUs}}\t{{.MemUsage}}"

# Database connection
docker exec opclaw-postgres pg_isready -U opclaw

# Redis connection
docker exec opclaw-redis redis-cli ping

# View logs
docker logs opclaw-backend --tail 100 -f

# Restart service
docker restart opclaw-backend

# System resources
htop
df -h
free -h
```

---

**Document Version**: 1.0
**Last Updated**: 2026-03-19
**Next Review**: 2026-04-19
