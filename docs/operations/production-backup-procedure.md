# Production Backup Procedure

## Overview

This document describes the comprehensive backup and restore procedures for the AIOpc production environment (118.25.0.190). The backup strategy ensures data safety, system recoverability, and business continuity.

## Backup Architecture

### Backup Components

1. **Database Backup**
   - PostgreSQL full dump with schema and data
   - Separate schema and data exports
   - Gzip compression
   - SHA256 checksums

2. **Configuration Backup**
   - Environment files (.env.production)
   - Docker Compose configurations
   - Container configurations (Docker inspect)
   - Nginx configurations (if applicable)

3. **Code Repository Backup**
   - Git archive or tarball of repository
   - Git state information (commit, status)
   - Excludes: node_modules, .git, dist, build

4. **SSH Keys Documentation**
   - SSH directory listing
   - Key documentation (not actual keys for security)
   - Local storage required for actual keys

5. **System State Backup**
   - Running containers list
   - System metrics (disk, memory, uptime)
   - Recent application logs

### Multi-Location Storage

Backups are stored in multiple locations for redundancy:

1. **Primary Location**: Production server (`/opt/opclaw/backups/`)
2. **Secondary Location**: Local machine (`/tmp/opclaw-backups/`)
3. **Optional Remote**: Additional remote server if configured

## Backup Scripts

### 1. Production Backup Script

**Location**: `scripts/backup/backup-production.sh`

**Usage**:
```bash
# Full backup (default)
./scripts/backup/backup-production.sh --full

# Quick backup (database + config only)
./scripts/backup/backup-production.sh --quick

# Skip verification (faster)
./scripts/backup/backup-production.sh --no-verify

# Custom retention period
./scripts/backup/backup-production.sh --retention 30
```

**Features**:
- Automated backup of all components
- Integrity verification
- Multi-location copy
- Automatic cleanup of old backups
- Metadata generation
- Comprehensive logging

**Environment Variables**:
```bash
DEPLOY_USER=root                    # SSH user
DEPLOY_HOST=118.25.0.190           # SSH host
DEPLOY_PATH=/opt/opclaw            # Deployment path
BACKUP_PATH=/opt/opclaw/backups    # Remote backup path
LOCAL_BACKUP_PATH=/tmp/opclaw-backups  # Local backup path
```

### 2. Backup Verification Script

**Location**: `scripts/backup/verify-backup.sh`

**Usage**:
```bash
# Verify full backup
./scripts/backup/verify-backup.sh --path /opt/opclaw/backups/20260319_120000

# Quick verification
./scripts/backup/verify-backup.sh --path /opt/opclaw/backups/20260319_120000 --quick

# Detailed output
./scripts/backup/verify-backup.sh --path /opt/opclaw/backups/20260319_120000 --detailed

# Verify specific component
./scripts/backup/verify-backup.sh --path /opt/opclaw/backups/20260319_120000 --type database
```

**Verification Checks**:
- File existence and size validation
- Gzip integrity verification
- SQL format validation
- Configuration placeholder detection
- JSON syntax validation
- Checksum verification
- Archive integrity testing

### 3. Restore Testing Script

**Location**: `scripts/backup/test-restore.sh`

**Usage**:
```bash
# Test full restore (dry run)
./scripts/backup/test-restore.sh --source /opt/opclaw/backups/20260319_120000 --dry-run

# Test database restore
./scripts/backup/test-restore.sh --source /opt/opclaw/backups/20260319_120000 --type database

# Leave test containers for inspection
./scripts/backup/test-restore.sh --source /opt/opclaw/backups/20260319_120000 --no-cleanup
```

**Test Components**:
- Database restore to isolated container
- Configuration validation
- Code extraction test
- Integrity verification
- Restore time estimation

## Manual Backup Procedure

If automated scripts fail, follow this manual procedure:

### Step 1: Prepare Backup Directory

```bash
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/opclaw/backups/${TIMESTAMP}"
mkdir -p "${BACKUP_DIR}"/{database,config,code,ssh,system}
```

### Step 2: Backup Database

```bash
# Schema only
docker exec opclaw-postgres pg_dump -U opclaw -d opclaw --schema-only > "${BACKUP_DIR}/database/schema.sql"

# Data only
docker exec opclaw-postgres pg_dump -U opclaw -d opclaw --data-only > "${BACKUP_DIR}/database/data.sql"

# Full dump
docker exec opclaw-postgres pg_dump -U opclaw -d opclaw | gzip > "${BACKUP_DIR}/database/opclaw_full.sql.gz"
```

### Step 3: Backup Configurations

```bash
# Environment files
cp /opt/opclaw/platform/.env.production "${BACKUP_DIR}/config/"
cp /opt/opclaw/platform/docker-compose.yml "${BACKUP_DIR}/config/"

# Container configurations
docker inspect opclaw-backend > "${BACKUP_DIR}/config/backend_container.json"
docker inspect opclaw-postgres > "${BACKUP_DIR}/config/postgres_container.json"
docker inspect opclaw-redis > "${BACKUP_DIR}/config/redis_container.json"
docker inspect opclaw-frontend > "${BACKUP_DIR}/config/frontend_container.json"
```

### Step 4: Backup Code Repository

```bash
# Git archive (preferred)
cd /opt/opclaw && git archive --format=tar.gz HEAD > "${BACKUP_DIR}/code/repository.tar.gz"

# Or tar backup
cd /opt/opclaw && tar -czf "${BACKUP_DIR}/code/repository.tar.gz" \
    --exclude=node_modules \
    --exclude=.git \
    --exclude=dist \
    --exclude=build \
    platform/

# Git state
git rev-parse HEAD > "${BACKUP_DIR}/code/git_commit.txt"
git status > "${BACKUP_DIR}/code/git_status.txt"
```

### Step 5: Document SSH Keys

```bash
# Documentation only (do NOT copy actual keys)
ls -lah ~/.ssh/ > "${BACKUP_DIR}/ssh/ssh_dir_list.txt"
find ~/.ssh/ -name 'opclaw*' -type f -exec ls -lh {} \; > "${BACKUP_DIR}/ssh/opclaw_keys_list.txt"
```

### Step 6: Capture System State

```bash
# Docker state
docker ps > "${BACKUP_DIR}/system/docker_ps.txt"
docker compose -f /opt/opclaw/platform/docker-compose.yml ps > "${BACKUP_DIR}/system/docker_compose_ps.txt"

# System info
df -h > "${BACKUP_DIR}/system/df.txt"
free -h > "${BACKUP_DIR}/system/memory.txt"
uptime > "${BACKUP_DIR}/system/uptime.txt"

# Recent logs
docker logs opclaw-backend --tail 500 > "${BACKUP_DIR}/system/backend.log"
docker logs opclaw-postgres --tail 500 > "${BACKUP_DIR}/system/postgres.log"
```

### Step 7: Create Checksums

```bash
find "${BACKUP_DIR}/database" -type f -exec sha256sum {} \; > "${BACKUP_DIR}/database/checksums.txt"
find "${BACKUP_DIR}/config" -type f -exec sha256sum {} \; > "${BACKUP_DIR}/config/checksums.txt"
find "${BACKUP_DIR}/code" -type f -exec sha256sum {} \; > "${BACKUP_DIR}/code/checksums.txt"
```

### Step 8: Create Metadata

```bash
cat > "${BACKUP_DIR}/metadata.json" << EOF
{
  "backup_timestamp": "${TIMESTAMP}",
  "backup_date": "$(date -Iseconds)",
  "backup_type": "manual",
  "backup_host": "118.25.0.190",
  "backup_path": "/opt/opclaw",
  "git_commit": "$(cd /opt/opclaw && git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "disk_usage": "$(du -sh ${BACKUP_DIR} | awk '{print $1}')"
}
EOF
```

### Step 9: Download to Local

```bash
# On local machine
mkdir -p /tmp/opclaw-backups
scp -i ~/.ssh/rap001_opclaw -r root@118.25.0.190:${BACKUP_DIR} /tmp/opclaw-backups/
```

## Restore Procedure

### Prerequisites

1. Verify backup integrity
2. Ensure sufficient disk space
3. Have SSH access to production server
4. Have local SSH keys available

### Step 1: Verify Backup

```bash
./scripts/backup/verify-backup.sh --path /path/to/backup
```

### Step 2: Test Restore (Optional but Recommended)

```bash
./scripts/backup/test-restore.sh --source /path/to/backup --type database
```

### Step 3: Restore Database

```bash
# Stop backend service
cd /opt/opclaw/platform && docker compose stop backend

# Restore database
gunzip < /path/to/backup/database/opclaw_full.sql.gz | \
    docker exec -i opclaw-postgres psql -U opclaw -d opclaw

# Restart backend
docker compose start backend
```

### Step 4: Restore Configurations

```bash
# Copy environment files
cp /path/to/backup/config/.env.production /opt/opclaw/platform/
cp /path/to/backup/config/docker-compose.yml /opt/opclaw/platform/

# Restart services to apply
cd /opt/opclaw/platform && docker compose restart backend
```

### Step 5: Restore Code

```bash
# Extract repository
rm -rf /opt/opclaw/platform
mkdir -p /opt/opclaw/platform
tar -xzf /path/to/backup/code/repository.tar.gz -C /opt/opclaw/platform/

# Restart services
cd /opt/opclaw/platform && docker compose up -d
```

## Backup Retention

### Default Retention Policy

- **Production server**: 30 days
- **Local storage**: 30 days
- **Remote storage**: Configurable

### Cleanup Schedule

```bash
# View old backups
find /opt/opclaw/backups -maxdepth 1 -type d -name '20*' -mtime +30

# Remove old backups (automated by script)
find /opt/opclaw/backups -maxdepth 1 -type d -name '20*' -mtime +30 -exec rm -rf {} \;
```

## Monitoring and Alerts

### Backup Health Checks

1. **Daily automated backup**: Scheduled via cron
2. **Backup verification**: Run after each backup
3. **Disk space monitoring**: Alert at 80% usage
4. **Restore testing**: Weekly automated tests

### Monitoring Commands

```bash
# Check latest backup
ls -lt /opt/opclaw/backups/ | head -5

# Check backup size
du -sh /opt/opclaw/backups/*

# Verify backup integrity
./scripts/backup/verify-backup.sh --path /opt/opclaw/backups/$(ls -t /opt/opclaw/backups/ | head -1)

# Check disk space
df -h /opt/opclaw/backups
```

## Troubleshooting

### Common Issues

#### 1. Backup Fails with "Disk Space Full"

**Solution**:
```bash
# Check disk usage
df -h

# Clean old backups
find /opt/opclaw/backups -maxdepth 1 -type d -name '20*' -mtime +7 -exec rm -rf {} \;

# Clean Docker logs
docker system prune -a
```

#### 2. Database Backup Fails

**Solution**:
```bash
# Check if PostgreSQL container is running
docker ps | grep opclaw-postgres

# Check database connectivity
docker exec opclaw-postgres pg_isready -U opclaw

# Check database logs
docker logs opclaw-postgres --tail 100
```

#### 3. Restore Fails with "Checksum Mismatch"

**Solution**:
```bash
# Re-verify checksums
cd /path/to/backup/database
sha256sum -c checksums.txt

# If checksums fail, try alternative backup
ls -lt /opt/opclaw/backups/ | head -5
```

#### 4. Missing SSH Keys After Restore

**Solution**:
```bash
# SSH keys are NOT included in backups for security
# Restore from local backup:
ls -lah ~/.ssh/opclaw*

# If lost, regenerate:
ssh-keygen -t rsa -b 4096 -f ~/.ssh/rap001_opclaw
```

## Security Considerations

### SSH Keys

- **NEVER include actual SSH keys in backups**
- **Always store SSH keys separately in secure location**
- **Document which keys are needed for restore**
- **Rotate keys regularly**

### Sensitive Data

- **Environment files contain sensitive data**
- **Limit access to backup directories**
- **Encrypt backups if storing off-site**
- **Use secure transfer protocols (SCP, SFTP)**

### Access Control

```bash
# Set appropriate permissions
chmod 700 /opt/opclaw/backups/*
chmod 600 /opt/opclaw/backups/*/config/.env.production

# Limit backup directory access
chown root:root /opt/opclaw/backups
chmod 700 /opt/opclaw/backups
```

## Automation

### Cron Jobs

```bash
# Daily backup at 2 AM
0 2 * * * /path/to/scripts/backup/backup-production.sh --full >> /var/log/opclaw-backup.log 2>&1

# Weekly backup verification on Sunday at 3 AM
0 3 * * 0 /path/to/scripts/backup/verify-backup.sh --path /opt/opclaw/backups/\$(ls -t /opt/opclaw/backups/ | head -1) >> /var/log/opclaw-backup-verify.log 2>&1

# Monthly restore testing on 1st at 4 AM
0 4 1 * * /path/to/scripts/backup/test-restore.sh --source /opt/opclaw/backups/\$(ls -t /opt/opclaw/backups/ | head -1) --type database >> /var/log/opclaw-restore-test.log 2>&1
```

### Monitoring Setup

```bash
# Create monitoring script
cat > /usr/local/bin/check-backup-health.sh << 'EOF'
#!/bin/bash
LATEST_BACKUP=$(ls -t /opt/opclaw/backups/ | head -1)
BACKUP_AGE=$(find /opt/opclaw/backups/${LATEST_BACKUP} -mtime +1 | wc -l)

if [ $BACKUP_AGE -gt 0 ]; then
    echo "WARNING: Latest backup is older than 24 hours"
    exit 1
fi

if ! /path/to/scripts/backup/verify-backup.sh --path /opt/opclaw/backups/${LATEST_BACKUP} --quick; then
    echo "ERROR: Backup verification failed"
    exit 1
fi

echo "OK: Backup is healthy"
exit 0
EOF

chmod +x /usr/local/bin/check-backup-health.sh
```

## Contact and Support

### Backup Issues

For issues with backups or restores:
1. Check logs: `/var/log/opclaw-backup.log`
2. Run verification: `./scripts/backup/verify-backup.sh`
3. Contact: [Your DevOps Team]

### Emergency Restore

For emergency restores:
1. Verify backup integrity
2. Run test restore first
3. Document all steps
4. Have rollback plan ready

---

**Last Updated**: 2026-03-19
**Version**: 1.0
**Status**: Production Ready
