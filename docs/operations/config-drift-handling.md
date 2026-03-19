# Configuration Drift Handling Guide

## Overview

Configuration drift detection is a critical safety mechanism that automatically compares Git configuration with running container configuration to detect inconsistencies that could lead to production issues.

## Architecture

### Three-Way Comparison

The drift detection system performs a three-way comparison:

1. **Git Configuration** (`platform/.env.production`)
   - Source of truth committed to repository
   - Represents documented configuration
   - Reviewed through PR process

2. **Remote File Configuration** (`/opt/opclaw/platform/.env.production`)
   - Configuration file on production server
   - May differ from Git due to manual changes
   - Should match Git in production

3. **Container Environment** (Docker container environment variables)
   - Actual runtime configuration
   - May differ from files due to deployment process
   - What the application actually uses

### Drift Types

- **ADDED**: Variable exists in container but not in Git config
- **DELETED**: Variable exists in Git but missing from container
- **MODIFIED**: Variable has different values between sources
- **PLACEHOLDER**: Variable contains placeholder value (cli_xxxxxxxxxxxxx)

### Severity Classification

#### CRITICAL (Exit Code 2)
- Placeholder values detected
- Critical configuration variables (FEISHU_APP_ID, FEISHU_APP_SECRET, JWT_SECRET)
- Database passwords or Redis secrets
- DB_SYNC enabled in production (should be false)

**Action Required**: Immediate investigation and remediation

#### MAJOR (Exit Code 1)
- OAuth configuration changes (FEISHU_REDIRECT_URI, CORS settings)
- Database connection settings
- Production environment mode incorrect

**Action Required**: Review and validate changes within 24 hours

#### MINOR (Exit Code 0)
- Non-critical value changes
- Build-time variables (NODE_VERSION, YARN_VERSION)
- Whitelisted differences

**Action Required**: Monitor and document changes

## Installation

### 1. Install Scripts

Scripts are located in:
- `/scripts/monitoring/detect-config-drift.sh` - Main detection script
- `/scripts/monitoring/schedule-drift-check.sh` - Scheduler script
- `/scripts/lib/config.sh` - Configuration library

```bash
# Make scripts executable
chmod +x scripts/monitoring/detect-config-drift.sh
chmod +x scripts/monitoring/schedule-drift-check.sh
chmod +x scripts/lib/config.sh
```

### 2. Configure SSH Access

Ensure SSH key is configured for remote server access:

```bash
# Test SSH connection
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 "hostname"

# Verify remote config path
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 "cat /opt/opclaw/platform/.env.production"
```

### 3. Install Scheduled Checks

```bash
# Install cron job for daily checks (default: 2 AM)
cd scripts/monitoring
./schedule-drift-check.sh install

# View status
./schedule-drift-check.sh status

# Run test check
./schedule-drift-check.sh test
```

## Usage

### Manual Drift Detection

```bash
# Basic drift check
./scripts/monitoring/detect-config-drift.sh

# Verbose output
./scripts/monitoring/detect-config-drift.sh --verbose

# JSON output
./scripts/monitoring/detect-config-drift.sh --json

# Save report to file
./scripts/monitoring/detect-config-drift.sh --report-file /path/to/report.txt

# Check different container
./scripts/monitoring/detect-config-drift.sh --container opclaw-frontend

# Check remote server
./scripts/monitoring/detect-config-drift.sh --ssh-host root@192.168.1.100
```

### Scheduled Checks

```bash
# Install daily check
./scripts/monitoring/schedule-drift-check.sh install

# Uninstall cron job
./scripts/monitoring/schedule-drift-check.sh uninstall

# Run check immediately
./scripts/monitoring/schedule-drift-check.sh run-now

# View status
./scripts/monitoring/schedule-drift-check.sh status

# Cleanup old reports
./scripts/monitoring/schedule-drift-check.sh cleanup
```

### Custom Schedule

```bash
# Install for 6 AM daily
CRON_SCHEDULE="0 6 * * *" ./scripts/monitoring/schedule-drift-check.sh install

# Install for every 6 hours
CRON_SCHEDULE="0 */6 * * *" ./scripts/monitoring/schedule-drift-check.sh install

# Install for weekly (Sunday 3 AM)
CRON_SCHEDULE="0 3 * * 0" ./scripts/monitoring/schedule-drift-check.sh install
```

## Drift Handling Procedures

### When Drift is Detected

#### 1. CRITICAL Drift

**Immediate Actions**:
1. Review drift report to identify affected variables
2. Determine root cause:
   - Recent deployment with wrong config?
   - Manual server changes?
   - Compromised credentials?
3. Restore correct configuration:
   ```bash
   # Option A: Update Git config (preferred)
   # 1. Make changes in platform/.env.production
   # 2. Create PR with explanation
   # 3. Review and merge
   # 4. Deploy with new config

   # Option B: Update remote config (emergency only)
   # 1. SSH to server
   # 2. Backup current config
   # 3. Copy Git config to server
   # 4. Restart container
   ```

4. Rotate compromised secrets:
   ```bash
   # Generate new JWT_SECRET
   openssl rand -base64 64

   # Update in platform/.env.production
   # Deploy with new secret
   ```

5. Verify fix:
   ```bash
   ./scripts/monitoring/detect-config-drift.sh --verbose
   ```

#### 2. MAJOR Drift

**Actions** (within 24 hours):
1. Review drift impact
2. Determine if change is intentional:
   - If intentional: Document and update Git
   - If unintentional: Revert to Git config
3. Test after correction
4. Document incident in change log

#### 3. MINOR Drift

**Actions**:
1. Review during next maintenance window
2. Document whitelisted variables
3. Update whitelist if needed

### Common Drift Scenarios

#### Scenario 1: NODE_ENV Mismatch

**Detection**:
```
[CRITICAL DRIFT] NODE_ENV
  Type: MODIFIED
  Git Value: development
  Running Value: production
```

**Resolution**:
1. Update Git config to `production`
2. Commit and deploy
3. Verify fix

#### Scenario 2: OAuth Callback URL Mismatch

**Detection**:
```
[MAJOR DRIFT] FEISHU_REDIRECT_URI
  Type: MODIFIED
  Git Value: http://localhost:3000/oauth/callback
  Running Value: https://renava.cn/oauth/callback
```

**Resolution**:
1. Determine correct URL (production: https://renava.cn)
2. Update Git config
3. Deploy with correct config

#### Scenario 3: Placeholder Values

**Detection**:
```
[CRITICAL DRIFT] FEISHU_APP_ID
  Type: PLACEHOLDER
  Git Value: cli_xxxxxxxxxxxxx
  Running Value: cli_a93ce5614ce11bd6
```

**Resolution**:
1. **CRITICAL**: Git config has placeholder!
2. Update Git config with real value
3. Never commit placeholders to repository

## Configuration

### Environment Variables

```bash
# Detection script
GIT_CONFIG_PATH=/path/to/platform/.env.production
REMOTE_CONFIG_PATH=/opt/opclaw/platform/.env.production
CONTAINER_NAME=opclaw-backend
SSH_HOST=root@118.25.0.190
SSH_KEY=~/.ssh/rap001_opclaw
OUTPUT_DIR=/tmp/config-drift-reports

# Scheduler
CRON_SCHEDULE="0 2 * * *"
REPORT_RETENTION_DAYS=30
LOG_RETENTION_DAYS=7
LOG_DIR=/var/log/config-drift

# Email alerts
EMAIL_FROM=config-drift@renava.cn
EMAIL_TO=admin@renava.cn
```

### Whitelist Configuration

Edit `/scripts/lib/config.sh` to customize whitelist:

```bash
# Whitelist for expected differences
WHITELIST=(
    "PATH::"                    # PATH always differs
    "HOSTNAME::"                # Container hostname varies
    "HOME::"                    # Home paths differ
    "NODE_VERSION::"            # Build-time vars
    "YARN_VERSION::"            # Build-time vars
    "YOUR_VAR:value1:value2"   # Specific value mapping
)
```

### Critical Variables

Edit `/scripts/lib/config.sh` to customize critical variables:

```bash
# Critical variables that must match exactly
CRITICAL_VARS=(
    "FEISHU_APP_ID"
    "FEISHU_APP_SECRET"
    "JWT_SECRET"
    "DB_PASSWORD"
    "REDIS_PASSWORD"
)
```

## Monitoring and Alerting

### Report Locations

- Reports: `/tmp/config-drift-reports/drift-report-YYYYMMDD-HHMMSS.txt`
- Logs: `/var/log/config-drift/check.log`

### Alert Configuration

```bash
# Enable email alerts for critical drift
./scripts/monitoring/detect-config-drift.sh --email

# Enable database recording
./scripts/monitoring/detect-config-drift.sh --db-record
```

### Integration with Monitoring Systems

#### Prometheus Metrics

```bash
# Add to prometheus.yml
scrape_configs:
  - job_name: 'config-drift'
    static_configs:
      - targets: ['localhost:9090']
    metrics_path: '/metrics/config-drift'
```

#### Grafana Dashboard

Create dashboard with:
- Drift detection count over time
- Severity distribution (critical/major/minor)
- Recent drift incidents
- Configuration consistency score

## Troubleshooting

### SSH Connection Issues

**Problem**: Cannot fetch remote config

**Solution**:
```bash
# Test SSH connection manually
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 "hostname"

# Check SSH key permissions
chmod 600 ~/.ssh/rap001_opclaw

# Verify remote path exists
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 "ls -la /opt/opclaw/platform/.env.production"
```

### Container Access Issues

**Problem**: Cannot read container environment

**Solution**:
```bash
# Check if container is running
docker ps | grep opclaw-backend

# Test container access
docker exec opclaw-backend printenv

# Check container permissions
docker inspect opclaw-backend | grep -A 10 "HostConfig"
```

### False Positives

**Problem**: Whitelisted differences reported as drift

**Solution**:
```bash
# Edit whitelist in /scripts/lib/config.sh
WHITELIST=(
    "YOUR_VAR::"
)

# Re-run detection
./scripts/monitoring/detect-config-drift.sh --verbose
```

### Cron Job Not Running

**Problem**: Scheduled checks not executing

**Solution**:
```bash
# Check cron job status
crontab -l | grep config-drift-check

# Check cron logs
grep CRON /var/log/syslog
tail -f /var/log/config-drift/check.log

# Test cron job manually
run-parts --test /etc/cron.daily
```

## Best Practices

### 1. Configuration Management

- **Single Source of Truth**: Git repository is always the source of truth
- **No Placeholders**: Never commit placeholder values to repository
- **Document Changes**: Always include configuration changes in PR descriptions
- **Review Process**: All config changes require PR review

### 2. Deployment Safety

- **Pre-Deployment Check**: Run drift detection before deploying
- **Post-Deployment Verification**: Run drift detection after deploying
- **Rollback Planning**: Know how to rollback configuration changes

### 3. Monitoring

- **Daily Checks**: Schedule automatic drift detection
- **Alert Response**: Have procedures for responding to alerts
- **Trend Analysis**: Monitor drift patterns over time

### 4. Incident Response

- **Critical Priority**: Critical drift gets immediate attention
- **Documentation**: Document all drift incidents
- **Root Cause Analysis**: Understand why drift occurred
- **Prevention**: Implement measures to prevent recurrence

## Integration with CI/CD

### Pre-Deployment Check

Add to deployment pipeline:

```yaml
# .github/workflows/deploy-production.yml
- name: Check Configuration Drift
  run: |
    ./scripts/monitoring/detect-config-drift.sh
  if: failure()
  run: |
    echo "Configuration drift detected!"
    echo "Please resolve before deploying."
    exit 1
```

### Post-Deployment Verification

Add after deployment:

```yaml
- name: Verify Configuration
  run: |
    ./scripts/monitoring/detect-config-drift.sh --report-file drift-report.txt
    cat drift-report.txt
```

## Database Integration (Future)

When state database is implemented:

```sql
-- Create config_drift_reports table
CREATE TABLE config_drift_reports (
    id SERIAL PRIMARY KEY,
    check_time TIMESTAMP NOT NULL,
    drift_count INTEGER NOT NULL,
    critical_count INTEGER NOT NULL,
    major_count INTEGER NOT NULL,
    minor_count INTEGER NOT NULL,
    report_file TEXT,
    status TEXT NOT NULL, -- 'active', 'resolved', 'ignored'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Query for drift history
SELECT
    DATE(check_time) as date,
    SUM(drift_count) as total_drifts,
    SUM(critical_count) as critical,
    SUM(major_count) as major,
    SUM(minor_count) as minor
FROM config_drift_reports
WHERE check_time >= NOW() - INTERVAL '30 days'
GROUP BY DATE(check_time)
ORDER BY date DESC;
```

## Appendix

### Exit Codes

- `0`: No drift detected or only minor drift
- `1`: Major drift detected
- `2`: Critical drift detected
- `3`: Configuration error

### File Locations

```
scripts/
├── lib/
│   └── config.sh                    # Configuration library
├── monitoring/
│   ├── detect-config-drift.sh       # Main detection script
│   └── schedule-drift-check.sh      # Scheduler script
└── docs/
    └── operations/
        └── config-drift-handling.md # This document
```

### Related Documentation

- [Production Backup Validation](../tasks/TASK-001.md)
- [Enhanced Health Check](../tasks/TASK-002.md)
- [FIP: Configuration Drift Detection](../fips/FIP_001_scan_to_enable.md)
- [CLAUDE.md: Production Configuration Safety](../../CLAUDE.md)

### Support

For issues or questions:
1. Check this documentation
2. Review drift reports in `/tmp/config-drift-reports/`
3. Check logs in `/var/log/config-drift/`
4. Create GitHub issue with drift report attached
