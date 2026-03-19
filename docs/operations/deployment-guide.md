# Tenant Deployment Guide
# (租户部署指南)

**Version**: 1.0
**Last Updated**: 2026-03-19
**Status**: Production Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Quick Start](#quick-start)
4. [Configuration](#configuration)
5. [Deployment Process](#deployment-process)
6. [Monitoring and Verification](#monitoring-and-verification)
7. [Rollback Procedures](#rollback-procedures)
8. [Troubleshooting](#troubleshooting)
9. [Best Practices](#best-practices)
10. [API Reference](#api-reference)

---

## Overview

The AIOpc deployment system provides parameterized, configuration-driven deployment for tenant instances. Each tenant is deployed as an isolated instance with its own database, Redis cache, and configuration.

### Key Features

- **Configuration-Driven**: All deployment parameters defined in YAML files
- **Idempotent**: Safe to run multiple times
- **Atomic**: Either complete success or complete rollback
- **Observable**: Progress logging and state tracking
- **Safe**: Health checks before marking as successful

### Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Deployment Manager                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. PRE_DEPLOY                                                  │
│     ├── Load tenant configuration                              │
│     ├── Validate configuration                                 │
│     ├── Check concurrent deployments                           │
│     ├── Backup current state                                   │
│     └── Record deployment start                                │
│                                                                 │
│  2. DEPLOY                                                      │
│     ├── Deploy backend service                                 │
│     ├── Deploy frontend (if applicable)                        │
│     ├── Configure Nginx                                        │
│     ├── Configure SSL certificates                             │
│     └── Update DNS records                                     │
│                                                                 │
│  3. POST_DEPLOY                                                 │
│     ├── Run health checks                                      │
│     ├── Verify OAuth flow                                      │
│     ├── Record deployment success/failure                      │
│     └── Cleanup temporary files                                │
│                                                                 │
│  4. ROLLBACK (if failed)                                      │
│     ├── Restore from backup                                    │
│     ├── Record deployment failure                              │
│     └── Notify operators                                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

### System Requirements

**Development Machine** (where deployment scripts run):
- **OS**: Linux, macOS, or Windows with WSL
- **Bash**: Version 4+
- **Tools**:
  - `yq` (v4+) - YAML processor
  - `ssh` - Remote connection
  - `curl` - HTTP requests
  - `git` - Version control

**Target Server** (where tenant is deployed):
- **OS**: Ubuntu 20.04+, Debian 11+, or CentOS 8+
- **RAM**: Minimum 2GB, Recommended 4GB+
- **Disk**: Minimum 10GB available space
- **Docker**: Version 20.10+
- **Docker Compose**: Version 2.0+

### Software Installation

Install required tools on your development machine:

```bash
# Install yq (YAML processor)
# macOS
brew install yq

# Linux
wget https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64 -O /usr/local/bin/yq
chmod +x /usr/local/bin/yq

# Install other tools
# macOS
brew install curl git

# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y curl git openssh-client

# CentOS/RHEL
sudo yum install -y curl git openssh-clients
```

### Network Requirements

- **SSH Access**: SSH key-based authentication to target server
- **Firewall**: Ports 3000 (API), 9090 (Metrics) accessible
- **Database**: PostgreSQL port 5432 accessible from application server
- **Redis**: Redis port 6379 accessible from application server

---

## Quick Start

### 1. Create Tenant Configuration

Copy the template and customize for your tenant:

```bash
# Copy template
cp config/tenants/template.yml config/tenants/tenant_001.yml

# Edit configuration
vim config/tenants/tenant_001.yml
```

### 2. Validate Configuration

```bash
# Validate configuration file
./scripts/deploy/pre-deploy.sh config/tenants/tenant_001.yml
```

### 3. Deploy Tenant

```bash
# Deploy tenant
./scripts/deploy/deploy-tenant.sh config/tenants/tenant_001.yml
```

### 4. Verify Deployment

```bash
# Run post-deployment verification
./scripts/deploy/post-deploy.sh config/tenants/tenant_001.yml
```

---

## Configuration

### Configuration File Structure

Tenant configuration files are located in `config/tenants/` and follow this structure:

```yaml
tenant:
  id: tenant_001              # Unique tenant identifier
  name: "Production Tenant 001" # Human-readable name
  environment: production      # production, staging, or development
  tier: standard              # trial, basic, standard, premium, enterprise

server:
  host: 118.25.0.190          # Server hostname or IP
  ssh_user: root              # SSH user for deployment
  ssh_key_path: ~/.ssh/tenant_key  # Path to SSH private key
  deploy_path: /opt/opclaw/platform  # Deployment directory
  api_port: 3000              # API service port
  metrics_port: 9090          # Metrics endpoint port

feishu:
  app_id: cli_a93ce5614ce11bd6  # Feishu App ID
  app_secret: L0cHQDBbEiIys6AHW53miecONb1xA4qy  # Feishu App Secret
  encrypt_key: base64_encoded_key_32_chars_min  # Encryption key
  oauth_redirect_uri: https://your-domain.com/api/auth/feishu/callback
  api_base_url: https://open.feishu.cn

database:
  host: localhost              # Database host
  port: 5432                   # Database port
  name: opclaw_tenant_001      # Database name
  user: opclaw                  # Database user
  password: secure_password_16_chars_min  # Database password

redis:
  host: localhost              # Redis host
  port: 6379                   # Redis port
  password: redis_password     # Redis password (if configured)

jwt:
  secret: base64_encoded_jwt_secret_64_chars_min  # JWT signing secret
  expires_in: 24h             # Token expiration time

agent:
  deepseek:
    api_key: sk-xxxx          # DeepSeek API key
    model: deepseek-chat      # Model name
```

### Required Fields

These fields **must** be configured:

| Section | Field | Description |
|---------|-------|-------------|
| `tenant.id` | - | Unique alphanumeric identifier |
| `tenant.name` | - | Human-readable name |
| `tenant.environment` | - | `production`, `staging`, or `development` |
| `server.host` | - | Server hostname or IP address |
| `server.ssh_user` | - | SSH user for remote deployment |
| `server.ssh_key_path` | - | Path to SSH private key |
| `feishu.app_id` | - | Feishu application ID |
| `feishu.app_secret` | - | Feishu application secret |
| `feishu.encrypt_key` | - | Data encryption key (32+ chars) |
| `database.host` | - | Database server hostname |
| `database.name` | - | Database name |
| `database.user` | - | Database user |
| `database.password` | - | Database password (16+ chars) |
| `jwt.secret` | - | JWT signing secret (32+ chars) |
| `agent.deepseek.api_key` | - | DeepSeek API key |

### Environment Variables

Sensitive values can be provided via environment variables instead of hardcoding:

```bash
# Set environment variables
export FEISHU_APP_ID="cli_a93ce5614ce11bd6"
export FEISHU_APP_SECRET="L0cHQDBbEiIys6AHW53miecONb1xA4qy"
export JWT_SECRET="$(openssl rand -base64 64)"
export DEEPSEEK_API_KEY="sk-xxxx"

# Deploy with environment variables
./scripts/deploy/deploy-tenant.sh config/tenants/tenant_001.yml
```

---

## Deployment Process

### Standard Deployment

```bash
# Deploy all components
./scripts/deploy/deploy-tenant.sh config/tenants/tenant_001.yml
```

### Deploy Specific Component

```bash
# Deploy backend only
./scripts/deploy/deploy-tenant.sh config/tenants/tenant_001.yml --component backend

# Deploy frontend only
./scripts/deploy/deploy-tenant.sh config/tenants/tenant_001.yml --component frontend
```

### Dry Run Deployment

See what would be deployed without making changes:

```bash
# Dry run deployment
./scripts/deploy/deploy-tenant.sh config/tenants/tenant_001.yml --dry-run
```

### Force Deployment

Deploy even if concurrent deployment is detected:

```bash
# Force deployment
./scripts/deploy/deploy-tenant.sh config/tenants/tenant_001.yml --force
```

### Skip Health Checks

Skip post-deployment health checks:

```bash
# Deploy without health checks
./scripts/deploy/deploy-tenant.sh config/tenants/tenant_001.yml --skip-health-check
```

### Verbose Output

Enable detailed logging:

```bash
# Deploy with verbose output
./scripts/deploy/deploy-tenant.sh config/tenants/tenant_001.yml --verbose
```

---

## Monitoring and Verification

### Pre-Deployment Checks

Run comprehensive checks before deploying:

```bash
# Run pre-deployment checks
./scripts/deploy/pre-deploy.sh config/tenants/tenant_001.yml
```

**Checks performed**:
1. Configuration file validation
2. Required tools availability
3. SSH connectivity test
4. Remote Docker availability
5. Disk space verification
6. Memory availability check
7. Database connectivity
8. Redis connectivity
9. Port availability
10. Concurrent deployment detection
11. Security validation
12. Network configuration
13. Backup availability

### Post-Deployment Verification

Verify deployment success:

```bash
# Run post-deployment verification
./scripts/deploy/post-deploy.sh config/tenants/tenant_001.yml
```

**Verifications performed**:
1. HTTP health endpoint check
2. Database connectivity from deployed service
3. Redis connectivity from deployed service
4. Service process status
5. OAuth flow verification
6. Performance metrics collection
7. Configuration integrity
8. Logging verification
9. SSL/TLS configuration

### Health Check Endpoints

Once deployed, these health endpoints are available:

```bash
# General health check
curl http://your-domain.com:3000/health

# Database health check
curl http://your-domain.com:3000/api/health/database

# Redis health check
curl http://your-domain.com:3000/api/health/redis

# Metrics endpoint
curl http://your-domain.com:3000/metrics
```

### State Database Queries

Query deployment state from the database:

```bash
# Connect to state database
psql -h localhost -U postgres -d deployment_state

# Query deployment history
SELECT deployment_id, tenant_id, status, version, started_at, completed_at
FROM deployments
WHERE tenant_id = 'tenant_001'
ORDER BY started_at DESC
LIMIT 10;

# Query health checks
SELECT tenant_id, check_type, status, response_time_ms, checked_at
FROM health_checks
WHERE tenant_id = 'tenant_001'
ORDER BY checked_at DESC
LIMIT 20;
```

---

## Rollback Procedures

### Automatic Rollback

If deployment fails during execution, automatic rollback is triggered:

```bash
# Automatic rollback happens on failure
# No manual intervention required
```

### Manual Rollback to Backup

```bash
# Rollback to latest backup
./scripts/deploy/rollback-tenant.sh config/tenants/tenant_001.yml backup

# Rollback to specific backup
./scripts/deploy/rollback-tenant.sh config/tenants/tenant_001.yml backup --backup-id pre-deploy.20240319_143022
```

### Rollback to Previous Deployment

```bash
# Rollback to previous successful deployment
./scripts/deploy/rollback-tenant.sh config/tenants/tenant_001.yml previous
```

### Rollback to Specific Version

```bash
# Rollback to specific version
./scripts/deploy/rollback-tenant.sh config/tenants/tenant_001.yml version --version v1.0.0
```

### Force Rollback Without Confirmation

```bash
# Force rollback without confirmation
./scripts/deploy/rollback-tenant.sh config/tenants/tenant_001.yml backup --force
```

### Dry Run Rollback

```bash
# See what would be rolled back
./scripts/deploy/rollback-tenant.sh config/tenants/tenant_001.yml backup --dry-run
```

---

## Troubleshooting

### Common Issues

#### Issue 1: SSH Connection Failed

**Symptoms**:
```
[ERROR] SSH connection test failed: user@host
```

**Solutions**:
1. Verify SSH key is correct: `ls -la ~/.ssh/tenant_key`
2. Test SSH connection manually: `ssh -i ~/.ssh/tenant_key user@host`
3. Check SSH key permissions: `chmod 600 ~/.ssh/tenant_key`
4. Verify server is reachable: `ping host`

#### Issue 2: Configuration Validation Failed

**Symptoms**:
```
[ERROR] Configuration validation FAILED with errors
```

**Solutions**:
1. Check for placeholder values: `cli_xxxxxxxxxxxxx`, `CHANGE_THIS`
2. Verify all required fields are present
3. Check field formats (app_id should be `cli_*`)
4. Run validation in verbose mode: `--verbose`

#### Issue 3: Database Connection Failed

**Symptoms**:
```
[ERROR] Database not reachable: localhost:5432
```

**Solutions**:
1. Verify PostgreSQL is running: `sudo systemctl status postgresql`
2. Check database exists: `psql -U postgres -l | grep opclaw`
3. Test connection: `psql -h localhost -U opclaw -d opclaw_tenant_001`
4. Check firewall rules: `sudo ufw status`

#### Issue 4: Docker Container Failed to Start

**Symptoms**:
```
[ERROR] Failed to start services after rollback
```

**Solutions**:
1. Check Docker logs: `docker logs opclaw-backend`
2. Verify Docker daemon is running: `sudo systemctl status docker`
3. Check port conflicts: `netstat -tuln | grep 3000`
4. Inspect container: `docker inspect opclaw-backend`

#### Issue 5: Health Checks Failed

**Symptoms**:
```
[ERROR] HTTP health check failed with code 502
```

**Solutions**:
1. Wait for services to fully start (may take 30-60 seconds)
2. Check application logs: `docker logs -f opclaw-backend`
3. Verify configuration: `docker exec opclaw-backend cat /app/.env`
4. Test endpoint manually: `curl -v http://localhost:3000/health`

### Debug Mode

Enable debug logging for troubleshooting:

```bash
# Set environment variable
export DEBUG=true
export CONFIG_DEBUG=true

# Run deployment with debug output
./scripts/deploy/deploy-tenant.sh config/tenants/tenant_001.yml --verbose
```

### Log Files

Deployment logs are stored in:

```
/var/log/opclaw/deployment/              # Server-side logs
/var/log/opclaw/tenant.log              # Tenant application logs
~/.pm2/logs/                             # Process manager logs (if using PM2)
docker logs opclaw-backend               # Container logs
```

### Getting Help

If issues persist:

1. Check deployment state database
2. Review all log files
3. Run test suite: `./scripts/tests/test-deploy-tenant.sh`
4. Verify configuration: `./scripts/deploy/pre-deploy.sh config.yml`
5. Contact DevOps team with:
   - Configuration file (sanitized)
   - Deployment logs
   - Error messages
   - State database query results

---

## Best Practices

### 1. Configuration Management

**DO**:
- Use version control for configuration files
- Store sensitive values in environment variables
- Validate configuration before deployment
- Document tenant-specific requirements

**DON'T**:
- Hardcode secrets in configuration files
- Use placeholder values in production
- Skip configuration validation
- Mix multiple tenant configurations

### 2. Deployment Process

**DO**:
- Run pre-deployment checks before deploying
- Test in staging environment first
- Deploy during low-traffic periods
- Monitor deployment progress
- Have rollback plan ready

**DON'T**:
- Deploy to production without testing
- Deploy during peak hours
- Skip health checks
- Force deployments routinely
- Ignore concurrent deployment warnings

### 3. Security

**DO**:
- Use strong, unique secrets for each tenant
- Rotate secrets regularly
- Limit SSH key access
- Use SSL/TLS in production
- Enable audit logging

**DON'T**:
- Reuse secrets across tenants
- Share SSH keys
- Deploy without SSL
- Disable security for convenience
- Ignore security warnings

### 4. Monitoring

**DO**:
- Monitor health checks regularly
- Set up alerts for failures
- Review deployment logs
- Track performance metrics
- Maintain deployment history

**DON'T**:
- Ignore health check failures
- Skip post-deployment verification
- Delete old deployment records
- Disable monitoring
- Ignore performance degradation

### 5. Testing

**DO**:
- Run test suite before deployment
- Test rollback procedures
- Validate configuration changes
- Monitor resource usage
- Document test results

**DON'T**:
- Deploy without testing
- Skip rollback testing
- Assume configuration is correct
- Ignore resource limits
- Deploy unvalidated changes

---

## API Reference

### Deploy Tenant Script

**Script**: `scripts/deploy/deploy-tenant.sh`

**Usage**:
```bash
./scripts/deploy/deploy-tenant.sh <tenant_config_file> [options]
```

**Options**:
- `--dry-run` - Show what would be deployed without making changes
- `--skip-health-check` - Skip post-deployment health checks
- `--skip-backup` - Skip pre-deployment backup
- `--force` - Force deployment even if concurrent deployment detected
- `--component <name>` - Deploy specific component (all, backend, frontend)
- `--verbose` - Enable verbose output
- `--help` - Show help message

**Exit Codes**:
- `0` - Deployment successful
- `1` - Deployment failed
- `2` - Invalid arguments
- `130` - Interrupted by user

### Pre-Deploy Script

**Script**: `scripts/deploy/pre-deploy.sh`

**Usage**:
```bash
./scripts/deploy/pre-deploy.sh <tenant_config_file>
```

**Checks performed**:
1. Configuration file validation
2. Required tools availability
3. SSH connectivity
4. Remote Docker availability
5. Disk space verification
6. Memory availability
7. Database connectivity
8. Redis connectivity
9. Port availability
10. Concurrent deployment detection
11. Security validation
12. Network configuration
13. Backup availability

### Post-Deploy Script

**Script**: `scripts/deploy/post-deploy.sh`

**Usage**:
```bash
./scripts/deploy/post-deploy.sh <tenant_config_file> [deployment_id] [options]
```

**Options**:
- `--skip-oauth` - Skip OAuth flow verification
- `--skip-performance` - Skip performance tests
- `--verbose` - Enable verbose output
- `--help` - Show help message

**Verifications performed**:
1. HTTP health endpoint check
2. Database connectivity from deployed service
3. Redis connectivity from deployed service
4. Service process status
5. OAuth flow verification
6. Performance metrics collection
7. Configuration integrity
8. Logging verification
9. SSL/TLS configuration

### Rollback Tenant Script

**Script**: `scripts/deploy/rollback-tenant.sh`

**Usage**:
```bash
./scripts/deploy/rollback-tenant.sh <tenant_config_file> [strategy] [options]
```

**Strategies**:
- `backup` - Rollback to backup (default)
- `previous` - Rollback to previous deployment
- `version` - Rollback to specific version

**Options**:
- `--force` - Force rollback without confirmation
- `--skip-health-check` - Skip health checks after rollback
- `--backup-id <id>` - Specific backup ID to restore
- `--version <version>` - Specific version to rollback to
- `--dry-run` - Show what would be rolled back
- `--verbose` - Enable verbose output
- `--help` - Show help message

### Test Suite

**Script**: `scripts/tests/test-deploy-tenant.sh`

**Usage**:
```bash
./scripts/tests/test-deploy-tenant.sh [test_type] [options]
```

**Test Types**:
- `all` - Run all tests (default)
- `unit` - Run unit tests only
- `integration` - Run integration tests only
- `failure` - Run failure scenario tests
- `rollback` - Run rollback tests

**Options**:
- `--verbose` - Enable verbose output
- `--keep-logs` - Keep test logs
- `--coverage` - Show test coverage

---

## Appendix

### State Database Schema

**deployments table**:
```sql
CREATE TABLE deployments (
    deployment_id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    deployment_type VARCHAR(50) NOT NULL,
    component VARCHAR(50) NOT NULL,
    version VARCHAR(50) NOT NULL,
    git_commit_sha VARCHAR(255),
    git_branch VARCHAR(255),
    deployed_by VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL,
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    error_message TEXT,
    deployment_metadata JSONB,
    INDEX idx_tenant_id (tenant_id),
    INDEX idx_status (status),
    INDEX idx_started_at (started_at)
);
```

**health_checks table**:
```sql
CREATE TABLE health_checks (
    check_id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    check_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    response_time_ms INTEGER,
    error_message TEXT,
    deployment_id INTEGER REFERENCES deployments(deployment_id),
    check_details JSONB,
    checked_at TIMESTAMP NOT NULL,
    INDEX idx_tenant_id (tenant_id),
    INDEX idx_check_type (check_type),
    INDEX idx_status (status),
    INDEX idx_checked_at (checked_at)
);
```

**deployment_config_snapshots table**:
```sql
CREATE TABLE deployment_config_snapshots (
    snapshot_id SERIAL PRIMARY KEY,
    deployment_id INTEGER REFERENCES deployments(deployment_id) UNIQUE,
    config_content TEXT NOT NULL,
    env_content TEXT,
    docker_compose_content TEXT,
    nginx_config_content TEXT,
    created_at TIMESTAMP NOT NULL
);
```

### Configuration Template

See `config/tenants/template.yml` for the complete configuration template with all available options and documentation.

### Related Documentation

- [Tenant Configuration Schema](../../config/tenants/schema.json)
- [Deployment Architecture](../../docs/01-technical-architecture-local.md)
- [Rollback Testing](../../docs/fips/FIP_001_scan_to_enable.md)
- [Quality Gates](../../docs/requirements/core_req_001.md)

---

**Document History**:

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-19 | Initial creation | TASK-011 |

