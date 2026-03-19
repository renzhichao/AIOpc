# Local Deployment Guide
# 本地部署指南

> **Version**: 1.0
> **Last Updated**: 2026-03-19
> **Author**: TASK-012 Implementation Team

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Quick Start](#quick-start)
4. [Deployment Modes](#deployment-modes)
5. [Configuration](#configuration)
6. [Building Docker Images](#building-docker-images)
7. [Transferring Files](#transferring-files)
8. [Deploying to Remote Servers](#deploying-to-remote-servers)
9. [Rollback Procedures](#rollback-procedures)
10. [Troubleshooting](#troubleshooting)
11. [Best Practices](#best-practices)
12. [Examples](#examples)

---

## Overview

This guide provides comprehensive instructions for deploying AIOpc tenant instances locally without relying on GitHub Actions. The local deployment system provides feature parity with GitHub Actions deployment while offering greater control and faster feedback loops.

### Key Features

- **Local-First**: All deployment operations run from your local machine
- **Docker Integration**: Build and manage Docker images locally
- **Efficient Transfer**: Use rsync for fast file synchronization
- **Configuration-Driven**: Deploy using YAML tenant configuration files
- **Safety Features**: Automatic backups, health checks, and rollback
- **Feature Parity**: Same capabilities as GitHub Actions deployment

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   Local Deployment Architecture                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. CONFIGURATION                                              │
│     ├── Load tenant YAML config                                │
│     ├── Validate configuration                                 │
│     └── Check prerequisites                                    │
│                                                                 │
│  2. BUILD (Optional)                                           │
│     ├── Build Docker images locally                            │
│     ├── Tag images for tenant                                  │
│     └── Verify image integrity                                 │
│                                                                 │
│  3. TRANSFER                                                  │
│     ├── Transfer images via docker save/load                  │
│     ├── Transfer configuration files                           │
│     └── Verify transfer integrity                              │
│                                                                 │
│  4. DEPLOY                                                    │
│     ├── Create deployment backup                               │
│     ├── Execute deployment on remote server                    │
│     ├── Monitor deployment progress                           │
│     └── Run health checks                                      │
│                                                                 │
│  5. VERIFY                                                    │
│     ├── HTTP health checks                                     │
│     ├── Database connectivity                                  │
│     ├── OAuth flow verification                                │
│     └── Performance validation                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

### System Requirements

- **Operating System**: Linux, macOS, or Windows with WSL2
- **Bash Version**: 4.0 or higher (for associative arrays)
- **Memory**: 4GB RAM minimum (8GB recommended)
- **Disk Space**: 10GB free space for Docker images and builds

### Required Tools

| Tool | Version | Purpose | Installation |
|------|---------|---------|--------------|
| **bash** | 4.0+ | Script execution | `brew install bash` (macOS) |
| **docker** | 20.10+ | Container operations | `brew install docker` |
| **rsync** | 3.1+ | File transfer | Pre-installed on most systems |
| **ssh** | 7.6+ | Remote operations | Pre-installed on most systems |
| **yq** | 4.0+ | YAML processing | `brew install yq` |
| **git** | 2.0+ | Version control | Pre-installed on most systems |

### Installation

```bash
# macOS
brew install bash docker yq

# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y bash docker.io rsync yq

# Verify installations
bash --version  # Should be 4.0+
docker --version
rsync --version
ssh -V
yq --version
git --version
```

### SSH Key Setup

```bash
# Generate SSH key if not exists
ssh-keygen -t rsa -b 4096 -C "your_email@example.com"

# Copy public key to remote server
ssh-copy-id -i ~/.ssh/id_rsa.pub user@remote-server

# Test SSH connection
ssh -i ~/.ssh/id_rsa user@remote-server
```

---

## Quick Start

### 1. Create Tenant Configuration

Create a tenant configuration file in `config/tenants/`:

```yaml
# config/tenants/my-tenant.yml
tenant:
  id: my-tenant
  name: My Tenant
  environment: production

server:
  host: 192.168.1.100
  ssh_user: root
  ssh_key_path: ~/.ssh/id_rsa
  deploy_path: /opt/opclaw/platform
  api_port: 3000
  metrics_port: 9090

feishu:
  app_id: cli_your_app_id
  app_secret: your_app_secret_min_32_chars
  encrypt_key: your_encrypt_key_24_chars_min
  oauth_redirect_uri: http://your-domain.com/api/auth/feishu/callback
  api_base_url: https://open.feishu.cn

database:
  host: localhost
  port: 5432
  name: opclaw_my_tenant
  user: opclaw
  password: your_secure_password

redis:
  host: localhost
  port: 6379
  password: your_redis_password

jwt:
  secret: your_jwt_secret_32_characters_long_min
  expires_in: 24h

agent:
  deepseek:
    api_key: sk-your-deepseek-api-key
    model: deepseek-chat
```

### 2. Deploy Tenant

```bash
# Deploy using local deployment script
./scripts/deploy/deploy-local.sh config/tenants/my-tenant.yml
```

### 3. Verify Deployment

```bash
# Check deployment health
curl http://your-server:3000/health

# Check container status
ssh root@your-server "docker ps | grep opclaw"

# Check logs
ssh root@your-server "docker logs opclaw-backend --tail 50"
```

---

## Deployment Modes

The local deployment system supports three primary deployment modes:

### 1. Local Build Mode (Default)

Build Docker images locally and transfer them to the remote server.

**Best for**: Small to medium deployments, slow network connections, custom images

```bash
# Build locally and deploy
./scripts/deploy/deploy-local.sh config/tenants/my-tenant.yml

# Build only (skip deployment)
./scripts/deploy/deploy-local.sh config/tenants/my-tenant.yml --build-only

# Build specific component
./scripts/deploy/deploy-local.sh config/tenants/my-tenant.yml --component backend
```

**Process Flow**:
1. Build Docker images locally
2. Save images to tar files
3. Transfer tar files via rsync
4. Load images on remote server
5. Deploy and start containers

### 2. Remote Build Mode

Transfer source code and build on the remote server.

**Best for**: Large deployments, fast network connections, standard images

```bash
# Build on remote server
./scripts/deploy/deploy-local.sh config/tenants/my-tenant.yml --remote-build
```

**Process Flow**:
1. Transfer source code via rsync
2. Build Docker images on remote server
3. Deploy and start containers

### 3. Transfer-Only Mode

Transfer pre-built images without rebuilding.

**Best for**: Multiple deployments with same images, testing different configurations

```bash
# Transfer only (skip build)
./scripts/deploy/deploy-local.sh config/tenants/my-tenant.yml --transfer-only
```

**Process Flow**:
1. Transfer existing Docker images
2. Transfer configuration files
3. Deploy and start containers

---

## Configuration

### Tenant Configuration Files

Tenant configurations are stored in YAML format in `config/tenants/`:

**File Structure**:
```
config/tenants/
├── template.yml              # Configuration template
├── test_tenant_alpha.yml     # Test tenant
├── tenant_001.yml           # Production tenant 1
└── tenant_002.yml           # Production tenant 2
```

**Required Sections**:
- `tenant`: Tenant identification and environment
- `server`: Remote server connection details
- `feishu`: Feishu OAuth configuration
- `database`: PostgreSQL connection details
- `redis`: Redis connection details
- `jwt`: JWT authentication settings
- `agent`: AI agent configuration

### Environment Variables

The deployment scripts support the following environment variables:

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `DEPLOYMENT_VERSION` | Version tag for images | `v1.0.0` | `DEPLOYMENT_VERSION=v1.2.3` |
| `GIT_COMMIT_SHA` | Git commit hash | Auto-detected | Override for specific commits |
| `GIT_BRANCH` | Git branch name | Auto-detected | Override for specific branches |
| `SSH_TIMEOUT` | SSH connection timeout | `300s` | `SSH_TIMEOUT=600` |
| `SSH_RETRIES` | SSH retry attempts | `3` | `SSH_RETRIES=5` |

**Example**:
```bash
# Deploy with custom version
DEPLOYMENT_VERSION=v2.0.0 ./scripts/deploy/deploy-local.sh config/tenants/my-tenant.yml

# Deploy with increased timeout
SSH_TIMEOUT=600 ./scripts/deploy/deploy-local.sh config/tenants/my-tenant.yml
```

### Configuration Validation

Validate tenant configuration before deployment:

```bash
# Using the validation script
./scripts/config/validate-config.sh config/tenants/my-tenant.yml

# Using yq directly
yq eval '.tenant.id' config/tenants/my-tenant.yml
```

---

## Building Docker Images

### Build Commands

**Build Script Usage**:
```bash
./scripts/deploy/local-build.sh <tenant_config> [options]
```

**Options**:
- `--component <name>`: Build specific component (`all`, `backend`, `frontend`)
- `--platform <arch>`: Target platform (`linux/amd64`, `linux/arm64`)
- `--no-cache`: Disable build cache
- `--verbose`: Enable verbose output
- `--dry-run`: Show what would be built without building

**Examples**:
```bash
# Build all components
./scripts/deploy/local-build.sh config/tenants/my-tenant.yml

# Build backend only
./scripts/deploy/local-build.sh config/tenants/my-tenant.yml --component backend

# Build for ARM64 platform
./scripts/deploy/local-build.sh config/tenants/my-tenant.yml --platform linux/arm64

# Build without cache
./scripts/deploy/local-build.sh config/tenants/my-tenant.yml --no-cache

# Dry run to see what would be built
./scripts/deploy/local-build.sh config/tenants/my-tenant.yml --dry-run
```

### Build Process

The build process follows these steps:

1. **Load Configuration**: Read tenant configuration from YAML file
2. **Check Prerequisites**: Verify Docker and required tools
3. **Build Images**: Execute Docker build with appropriate arguments
4. **Tag Images**: Apply version tags and additional labels
5. **Verify Images**: Confirm images were built successfully
6. **Display Summary**: Show build results and image sizes

### Image Tagging

Built images are tagged with multiple labels:

```
opclaw-backend:v1.0.0              # Version tag
opclaw-backend:my-tenant-v1.0.0    # Tenant-specific tag
opclaw-backend:production-v1.0.0    # Environment-specific tag
opclaw-backend:latest               # Latest tag
```

### Build Optimization

**Use Build Cache**:
```bash
# Default: uses cache
./scripts/deploy/local-build.sh config/tenants/my-tenant.yml

# Disable cache
./scripts/deploy/local-build.sh config/tenants/my-tenant.yml --no-cache
```

**Multi-Platform Builds**:
```bash
# Build for AMD64
./scripts/deploy/local-build.sh config/tenants/my-tenant.yml --platform linux/amd64

# Build for ARM64
./scripts/deploy/local-build.sh config/tenants/my-tenant.yml --platform linux/arm64

# Build for multiple platforms (requires buildx)
docker buildx build --platform linux/amd64,linux/arm64 -t opclaw-backend:v1.0.0 .
```

---

## Transferring Files

### Transfer Commands

**Transfer Script Usage**:
```bash
./scripts/deploy/local-transfer.sh <tenant_config> [options]
```

**Options**:
- `--component <name>`: Transfer specific component (`all`, `backend`, `frontend`)
- `--remote-build`: Transfer code for remote build instead of images
- `--skip-images`: Skip image transfer
- `--skip-code`: Skip code transfer
- `--verbose`: Enable verbose output
- `--dry-run`: Show what would be transferred without transferring

**Examples**:
```bash
# Transfer all components
./scripts/deploy/local-transfer.sh config/tenants/my-tenant.yml

# Transfer backend only
./scripts/deploy/local-transfer.sh config/tenants/my-tenant.yml --component backend

# Transfer code for remote build
./scripts/deploy/local-transfer.sh config/tenants/my-tenant.yml --remote-build

# Skip image transfer
./scripts/deploy/local-transfer.sh config/tenants/my-tenant.yml --skip-images

# Dry run to see what would be transferred
./scripts/deploy/local-transfer.sh config/tenants/my-tenant.yml --dry-run
```

### Transfer Process

**Image Transfer** (default mode):
1. Save Docker images to tar files
2. Compress tar files
3. Transfer compressed files via rsync
4. Load images on remote server
5. Verify image integrity

**Code Transfer** (remote-build mode):
1. Prepare source code directory
2. Use rsync to transfer only changed files
3. Exclude unnecessary files (node_modules, .git, etc.)
4. Verify transfer integrity

### Transfer Optimization

**Rsync Options**:
```bash
# Default rsync options used by scripts
rsync -avz --delete \
  --exclude 'node_modules/' \
  --exclude 'dist/' \
  --exclude '.env*' \
  --exclude '*.log' \
  --exclude '.git/' \
  source/ user@host:dest/
```

**Bandwidth Optimization**:
```bash
# Limit bandwidth usage (useful for slow connections)
rsync --bwlimit=1000k source/ user@host:dest/
```

**Transfer Verification**:
```bash
# Verify transferred images
ssh root@remote-server "docker images | grep opclaw"

# Verify transferred files
ssh root@remote-server "ls -lh /opt/opclaw/platform/"
```

---

## Deploying to Remote Servers

### Deployment Commands

**Deploy Script Usage**:
```bash
./scripts/deploy/deploy-local.sh <tenant_config> [options]
```

**Options**:
- `--build-only`: Only build images, don't deploy
- `--transfer-only`: Only transfer files, don't build
- `--remote-build`: Build on remote server instead of local
- `--dry-run`: Show what would be deployed without deploying
- `--skip-health-check`: Skip post-deployment health checks
- `--skip-backup`: Skip pre-deployment backup
- `--force`: Force deployment even if concurrent deployment detected
- `--component <name>`: Deploy specific component (`all`, `backend`, `frontend`)
- `--verbose`: Enable verbose output
- `--help`: Show help message

**Examples**:
```bash
# Full deployment
./scripts/deploy/deploy-local.sh config/tenants/my-tenant.yml

# Build and transfer only
./scripts/deploy/deploy-local.sh config/tenants/my-tenant.yml --build-only

# Deploy with remote build
./scripts/deploy/deploy-local.sh config/tenants/my-tenant.yml --remote-build

# Deploy specific component
./scripts/deploy/deploy-local.sh config/tenants/my-tenant.yml --component backend

# Deploy without backup
./scripts/deploy/deploy-local.sh config/tenants/my-tenant.yml --skip-backup

# Force deployment (override concurrent deployment check)
./scripts/deploy/deploy-local.sh config/tenants/my-tenant.yml --force

# Dry run to see what would be deployed
./scripts/deploy/deploy-local.sh config/tenants/my-tenant.yml --dry-run
```

### Deployment Process

**Full Deployment Flow**:

1. **Pre-Deployment Phase**:
   - Load and validate tenant configuration
   - Check local prerequisites (Docker, rsync, etc.)
   - Check for concurrent deployments
   - Test SSH connection to remote server
   - Create deployment backup
   - Record deployment start in state database

2. **Build Phase** (if not --remote-build):
   - Build Docker images locally
   - Tag images with version and tenant information
   - Verify image integrity

3. **Transfer Phase**:
   - Transfer Docker images to remote server
   - Transfer configuration files
   - Verify transfer integrity

4. **Deployment Phase**:
   - Create deployment directory on remote server
   - Generate `.env` file from configuration
   - Start/restart containers
   - Configure Nginx (if applicable)
   - Configure SSL certificates (if applicable)

5. **Post-Deployment Phase**:
   - Run health checks
   - Verify OAuth flow
   - Record deployment success
   - Display deployment summary

### Deployment Verification

**Health Checks**:
```bash
# HTTP health check
curl http://your-server:3000/health

# Expected response
{"status":"healthy","timestamp":"2026-03-19T13:00:00Z"}

# Database connectivity check
ssh root@your-server "docker exec opclaw-backend pg_isready -U opclaw"

# Redis connectivity check
ssh root@your-server "docker exec opclaw-backend redis-cli -a your_password PING"
```

**Container Status**:
```bash
# Check container status
ssh root@your-server "docker ps | grep opclaw"

# Check container logs
ssh root@your-server "docker logs opclaw-backend --tail 100 -f"

# Check container resource usage
ssh root@your-server "docker stats opclaw-backend --no-stream"
```

---

## Rollback Procedures

### Automatic Rollback

The deployment system includes automatic rollback on failure:

1. **Pre-Deployment Backup**: Automatically backs up current deployment
2. **Failure Detection**: Monitors deployment health
3. **Automatic Rollback**: Reverts to previous version on failure
4. **Verification**: Confirms rollback success

### Manual Rollback

**Rollback Commands**:
```bash
# Rollback to previous version
./scripts/deploy/rollback-tenant.sh config/tenants/my-tenant.yml

# Rollback to specific deployment ID
./scripts/deploy/rollback-tenant.sh config/tenants/my-tenant.yml --deployment-id <id>

# Rollback without health checks
./scripts/deploy/rollback-tenant.sh config/tenants/my-tenant.yml --skip-health-check

# Dry run to see what would be rolled back
./scripts/deploy/rollback-tenant.sh config/tenants/my-tenant.yml --dry-run
```

### Rollback Process

**Automatic Rollback**:
1. Detect deployment failure (health check, container crash, etc.)
2. Stop current deployment
3. Restore from backup
4. Restart services
5. Run health checks
6. Record rollback in state database

**Manual Rollback**:
1. Stop current containers
2. Restore files from backup directory
3. Restart containers
4. Verify service health
5. Update deployment records

### Backup Locations

**Default Backup Structure**:
```
/var/backups/opclaw/
└── my-tenant/
    ├── pre-deploy.20260319_130000/
    │   ├── backend/
    │   ├── frontend/
    │   ├── docker-compose.yml
    │   └── .env
    ├── pre-deploy.20260319_140000/
    └── ...
```

---

## Troubleshooting

### Common Issues

#### Issue 1: Docker Build Fails

**Symptoms**:
```
ERROR: Failed to build backend image
```

**Solutions**:
1. Check Docker daemon is running:
   ```bash
   docker info
   ```

2. Check available disk space:
   ```bash
   df -h
   ```

3. Clear Docker cache:
   ```bash
   docker system prune -a
   ```

4. Verify Dockerfile exists:
   ```bash
   ls -la platform/backend/Dockerfile
   ```

#### Issue 2: SSH Connection Fails

**Symptoms**:
```
ERROR: SSH connection test failed
```

**Solutions**:
1. Verify SSH key exists:
   ```bash
   ls -la ~/.ssh/id_rsa
   ```

2. Test SSH connection manually:
   ```bash
   ssh -i ~/.ssh/id_rsa root@remote-server
   ```

3. Check SSH key permissions:
   ```bash
   chmod 600 ~/.ssh/id_rsa
   ```

4. Verify remote server is reachable:
   ```bash
   ping remote-server
   ```

#### Issue 3: Image Transfer Fails

**Symptoms**:
```
ERROR: File transfer failed
```

**Solutions**:
1. Check available disk space on remote server:
   ```bash
   ssh root@remote-server "df -h"
   ```

2. Verify rsync is installed on remote server:
   ```bash
   ssh root@remote-server "which rsync"
   ```

3. Try transferring smaller files first:
   ```bash
   rsync -avz --progress small-file.txt root@remote-server:/tmp/
   ```

4. Check network connectivity:
   ```bash
   ping remote-server
   traceroute remote-server
   ```

#### Issue 4: Health Check Fails

**Symptoms**:
```
ERROR: HTTP health check failed
```

**Solutions**:
1. Check if container is running:
   ```bash
   ssh root@remote-server "docker ps | grep opclaw"
   ```

2. Check container logs:
   ```bash
   ssh root@remote-server "docker logs opclaw-backend --tail 100"
   ```

3. Verify environment variables:
   ```bash
   ssh root@remote-server "cat /opt/opclaw/platform/.env"
   ```

4. Test endpoint directly:
   ```bash
   curl -v http://remote-server:3000/health
   ```

### Debug Mode

Enable verbose logging for troubleshooting:

```bash
# Enable verbose output
./scripts/deploy/deploy-local.sh config/tenants/my-tenant.yml --verbose

# Enable script debugging
bash -x ./scripts/deploy/deploy-local.sh config/tenants/my-tenant.yml 2>&1 | tee deploy-debug.log
```

### Log Analysis

**Deployment Logs**:
```bash
# Local deployment logs
./scripts/deploy/deploy-local.sh config/tenants/my-tenant.yml 2>&1 | tee local-deploy.log

# Remote container logs
ssh root@remote-server "docker logs opclaw-backend --tail 500" > backend.log

# System logs
ssh root@remote-server "journalctl -u docker -n 100" > docker.log
```

---

## Best Practices

### 1. Configuration Management

- **Use Version Control**: Store tenant configurations in Git
- **Template-Based**: Use template.yml as starting point
- **Validation**: Always validate configuration before deployment
- **Documentation**: Document tenant-specific requirements

### 2. Deployment Strategy

- **Incremental Changes**: Deploy small changes frequently
- **Testing**: Test in staging environment first
- **Backups**: Always ensure backups are current
- **Monitoring**: Monitor deployments closely

### 3. Security

- **SSH Keys**: Use key-based authentication, not passwords
- **Key Rotation**: Rotate SSH keys regularly
- **Access Control**: Limit SSH access to necessary users
- **Secrets Management**: Use secure secret storage

### 4. Performance

- **Parallel Operations**: Use buildx for parallel builds
- **Cache Utilization**: Leverage Docker build cache
- **Incremental Transfer**: Use rsync for delta transfers
- **Resource Monitoring**: Monitor system resources during deployment

### 5. Reliability

- **Health Checks**: Always run health checks post-deployment
- **Rollback Planning**: Plan rollback procedures in advance
- **Monitoring Setup**: Configure monitoring and alerts
- **Documentation**: Maintain deployment logs and records

---

## Examples

### Example 1: Deploy New Tenant

```bash
# 1. Create tenant configuration
cp config/tenants/template.yml config/tenants/tenant-001.yml

# 2. Edit configuration with tenant-specific values
vim config/tenants/tenant-001.yml

# 3. Validate configuration
./scripts/config/validate-config.sh config/tenants/tenant-001.yml

# 4. Deploy tenant
./scripts/deploy/deploy-local.sh config/tenants/tenant-001.yml

# 5. Verify deployment
curl http://tenant-001-server:3000/health
```

### Example 2: Update Existing Tenant

```bash
# 1. Update tenant configuration
vim config/tenants/tenant-001.yml

# 2. Validate changes
./scripts/config/validate-config.sh config/tenants/tenant-001.yml

# 3. Deploy update (with backup)
./scripts/deploy/deploy-local.sh config/tenants/tenant-001.yml

# 4. Monitor deployment
watch -n 5 'curl -s http://tenant-001-server:3000/health | jq .'
```

### Example 3: Deploy Backend Only

```bash
# Deploy only backend component
./scripts/deploy/deploy-local.sh config/tenants/tenant-001.yml --component backend
```

### Example 4: Deploy with Remote Build

```bash
# Use remote build for faster deployment on fast connections
./scripts/deploy/deploy-local.sh config/tenants/tenant-001.yml --remote-build
```

### Example 5: Rollback Failed Deployment

```bash
# 1. Identify failed deployment
./scripts/lib/state.sh get_deployment_history tenant-001 | tail -10

# 2. Rollback to previous version
./scripts/deploy/rollback-tenant.sh config/tenants/tenant-001.yml

# 3. Verify rollback
curl http://tenant-001-server:3000/health
```

---

## Appendix

### A. Script Reference

**Main Scripts**:
- `scripts/deploy/deploy-local.sh`: Main deployment orchestration
- `scripts/deploy/local-build.sh`: Docker image building
- `scripts/deploy/local-transfer.sh`: File and image transfer
- `scripts/deploy/rollback-tenant.sh`: Deployment rollback
- `scripts/tests/test-local-deploy.sh`: Test suite

**Configuration Scripts**:
- `scripts/lib/config.sh`: Configuration loading and validation
- `scripts/lib/validation.sh`: Configuration validation rules
- `scripts/config/validate-config.sh`: Standalone validation script
- `scripts/config/generate-config.sh`: Configuration generation

**Library Scripts**:
- `scripts/lib/logging.sh`: Logging functions
- `scripts/lib/error.sh`: Error handling
- `scripts/lib/ssh.sh`: SSH operations
- `scripts/lib/state.sh`: State database management
- `scripts/lib/file.sh`: File operations

### B. Exit Codes

| Code | Meaning | Action |
|------|---------|--------|
| 0 | Success | Deployment completed successfully |
| 1 | General Error | Check logs for specific error |
| 2 | Invalid Argument | Check command syntax |
| 3 | Missing Dependency | Install required tool |
| 4 | Permission Denied | Check file permissions |
| 5 | File Not Found | Verify file paths |
| 6 | File Operation Failed | Check disk space and permissions |
| 7 | Network Error | Check network connectivity |
| 8 | Timeout | Increase timeout value |
| 9 | Validation Failed | Fix configuration errors |
| 10 | Invalid State | Check deployment state |

### C. Environment Variables Reference

**Deployment Variables**:
```bash
# Deployment versioning
DEPLOYMENT_VERSION=v1.0.0

# Git information
GIT_COMMIT_SHA=abc123
GIT_BRANCH=main

# SSH configuration
SSH_TIMEOUT=300
SSH_RETRIES=3
```

**Database Variables**:
```bash
# State database connection
STATE_DB_HOST=localhost
STATE_DB_PORT=5432
STATE_DB_NAME=deployment_state
STATE_DB_USER=opclaw
STATE_DB_PASSWORD=secure_password
```

### D. Related Documentation

- **Architecture**: `docs/01-technical-architecture-local.md`
- **Deployment Guide**: `docs/07-local-deployment-guide.md`
- **Configuration**: `docs/operations/config-system-guide.md`
- **Troubleshooting**: `docs/troubleshooting/phase0-1-issues.md`
- **Task List**: `docs/tasks/TASK_LIST_issue21_multi_tenant_deployment.md`

### E. Support and Resources

**Getting Help**:
```bash
# Script help
./scripts/deploy/deploy-local.sh --help

# Version information
./scripts/deploy/deploy-local.sh --version

# Test suite
./scripts/tests/test-local-deploy.sh --help
```

**Community Resources**:
- GitHub Issues: Report bugs and request features
- Documentation: Check `docs/` directory for detailed guides
- Examples: See `config/tenants/test_tenant_alpha.yml` for example configuration

---

**Document Version**: 1.0
**Last Updated**: 2026-03-19
**Maintained By**: TASK-012 Implementation Team
**Status**: Complete ✅
