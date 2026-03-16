# AIOpc Backend Deployment Guide

> **Complete guide for deploying the AIOpc backend application to cloud server**

**Server**: 118.25.0.190 (renava.cn)
**Backend Port**: 3000
**Node.js Version**: 22
**Process Manager**: PM2

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Deployment Scripts](#deployment-scripts)
4. [Environment Configuration](#environment-configuration)
5. [PM2 Process Management](#pm2-process-management)
6. [Systemd Service](#systemd-service)
7. [Health Monitoring](#health-monitoring)
8. [Troubleshooting](#troubleshooting)
9. [Maintenance](#maintenance)

---

## Prerequisites

### Server Requirements

- **OS**: Ubuntu 20.04+ or Debian 11+
- **Node.js**: v22 or higher
- **pnpm**: Latest version
- **PostgreSQL**: 16 or higher
- **Redis**: 6 or higher
- **Docker**: Latest version (for container management)
- **Nginx**: Latest version (for reverse proxy)

### Local Requirements

- **Node.js**: v22 or higher
- **pnpm**: Latest version
- **SSH access**: To server with key-based authentication
- **rsync**: For efficient file transfer

### Pre-deployment Checklist

- [ ] Server environment is configured (TASK-057)
- [ ] Database migration is completed (TASK-059)
- [ ] SSL certificates are installed (TASK-058)
- [ ] SSH key-based authentication is configured
- [ ] Firewall rules allow SSH (port 22), HTTP (80), HTTPS (443)

---

## Quick Start

### 1. Initial Deployment

```bash
# Navigate to project directory
cd /Users/arthurren/projects/AIOpc

# Deploy backend to server
./scripts/cloud/deploy-backend.sh
```

### 2. Configure Environment

```bash
# Generate and configure environment variables
./scripts/cloud/configure-backend-env.sh

# Edit environment file manually if needed
ssh root@118.25.0.190
nano /opt/opclaw/backend/.env

# Restart service after configuration
pm2 restart opclaw-backend
```

### 3. Verify Deployment

```bash
# Run health check
./scripts/cloud/health-check.sh

# Check service status
ssh root@118.25.0.190 'pm2 status'
```

---

## Deployment Scripts

### deploy-backend.sh

**Purpose**: Automated backend deployment script

**Location**: `scripts/cloud/deploy-backend.sh`

**Features**:
- Local build optimization
- Automated backup creation
- Efficient code upload with rsync
- PM2 process management
- Health check verification
- Dry-run mode for testing

**Usage**:

```bash
# Standard deployment
./scripts/cloud/deploy-backend.sh

# Dry-run mode (no changes made)
./scripts/cloud/deploy-backend.sh --dry-run

# Skip local build
./scripts/cloud/deploy-backend.sh --skip-build

# Verbose output
./scripts/cloud/deploy-backend.sh --verbose
```

**Environment Variables**:

```bash
# Customize server and directory
export SERVER=root@118.25.0.190
export BACKEND_DIR=/opt/opclaw/backend
export LOCAL_BACKEND=platform/backend

# Run with custom settings
./scripts/cloud/deploy-backend.sh
```

**Deployment Steps**:

1. **Pre-flight Checks**
   - Verify required commands
   - Check local backend directory
   - Test server connectivity
   - Verify Node.js version

2. **Local Build**
   - Clean previous build
   - Install dependencies
   - Run tests (optional)
   - Build TypeScript

3. **Backup Creation**
   - Create timestamped backup
   - Keep last 5 backups
   - Clean old backups

4. **Code Upload**
   - Create remote directory
   - Upload files with rsync
   - Exclude unnecessary files

5. **Server Setup**
   - Install production dependencies
   - Build on server
   - Configure environment

6. **PM2 Management**
   - Install PM2 globally
   - Upload ecosystem config
   - Start/restart service

7. **Health Check**
   - Verify PM2 process
   - Test health endpoint
   - Display service info

### configure-backend-env.sh

**Purpose**: Generate and configure production environment variables

**Location**: `scripts/cloud/configure-backend-env.sh`

**Features**:
- Cryptographically secure secret generation
- Automatic database password update
- Environment file creation
- Secrets export for safe storage

**Usage**:

```bash
# Standard configuration
./scripts/cloud/configure-backend-env.sh

# Custom output directory
./scripts/cloud/configure-backend-env.sh --output-dir /secure/path

# Display secrets (use with caution)
./scripts/cloud/configure-backend-env.sh --show-secrets
```

**Generated Secrets**:

- JWT Secret (32 characters)
- Session Secret (32 characters)
- Encryption Key (32 characters)
- Database Password (24 characters)
- Redis Password (24 characters)
- Feishu Verify Token (32 characters)
- Feishu Encrypt Key (32 characters)

**Manual Configuration Required**:

After running the script, you must manually configure:

1. **Feishu OAuth Credentials**:
   ```bash
   ssh root@118.25.0.190
   nano /opt/opclaw/backend/.env

   # Update these values:
   FEISHU_APP_ID=cli_xxxxxxxxxxxxx
   FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxx
   ```

2. **DeepSeek API Key**:
   ```bash
   # In the same file, update:
   DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxx
   ```

3. **Restart Service**:
   ```bash
   pm2 restart opclaw-backend
   ```

### health-check.sh

**Purpose**: Verify backend service health and status

**Location**: `scripts/cloud/health-check.sh`

**Features**:
- PM2 process status check
- Health endpoint verification
- Database connectivity test
- Redis connectivity test
- Docker connectivity test
- Recent error log analysis
- Performance metrics display

**Usage**:

```bash
# Standard health check
./scripts/cloud/health-check.sh

# Verbose output
./scripts/cloud/health-check.sh --verbose

# JSON output (for automation)
./scripts/cloud/health-check.sh --json

# Watch mode (continuous monitoring)
./scripts/cloud/health-check.sh --watch

# Custom watch interval
./scripts/cloud/health-check.sh --watch --interval 30
```

**Health Checks**:

1. **PM2 Process Status**: Verify process is running
2. **Health Endpoint**: Test `/health` endpoint
3. **API Endpoints**: Verify API is accessible
4. **Database Connection**: Test PostgreSQL connectivity
5. **Redis Connection**: Test Redis connectivity
6. **Docker Connection**: Verify Docker daemon
7. **Recent Errors**: Analyze error logs
8. **Performance Metrics**: Display CPU and memory usage

---

## Environment Configuration

### Environment File Structure

The `.env` file is located at `/opt/opclaw/backend/.env` on the server.

**Key Configuration Sections**:

#### 1. Application Configuration

```env
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
```

#### 2. Database Configuration

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=opclaw
DB_USERNAME=opclaw
DB_PASSWORD=<generated-password>
DB_SYNC=false
DB_MAX_CONNECTIONS=20
```

#### 3. Redis Configuration

```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=<generated-password>
```

#### 4. Feishu OAuth

```env
FEISHU_APP_ID=<your-app-id>
FEISHU_APP_SECRET=<your-app-secret>
FEISHU_REDIRECT_URI=https://renava.cn/oauth/callback
```

#### 5. DeepSeek LLM

```env
DEEPSEEK_API_KEY=<your-api-key>
DEEPSEEK_API_BASE=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
```

#### 6. Security

```env
JWT_SECRET=<generated-secret>
SESSION_SECRET=<generated-secret>
ENCRYPTION_KEY=<generated-key>
```

#### 7. CORS

```env
CORS_ALLOWED_ORIGINS=https://renava.cn,https://www.renava.cn
CORS_CREDENTIALS=true
```

### Updating Environment Variables

```bash
# SSH to server
ssh root@118.25.0.190

# Edit environment file
nano /opt/opclaw/backend/.env

# Restart service to apply changes
pm2 restart opclaw-backend

# Verify health
curl http://localhost:3000/health
```

---

## PM2 Process Management

### PM2 Commands

**Basic Commands**:

```bash
# Start application
pm2 start /opt/opclaw/backend/ecosystem.config.js

# Restart application
pm2 restart opclaw-backend

# Stop application
pm2 stop opclaw-backend

# Delete application
pm2 delete opclaw-backend

# Reload (zero-downtime)
pm2 reload opclaw-backend
```

**Status and Monitoring**:

```bash
# Show process status
pm2 status

# Show detailed info
pm2 show opclaw-backend

# Show logs
pm2 logs opclaw-backend

# Show logs (follow)
pm2 logs opclaw-backend --lines 100

# Show logs (error only)
pm2 logs opclaw-backend --err

# Monitor in real-time
pm2 monit
```

**Process Management**:

```bash
# Save process list
pm2 save

# Startup script
pm2 startup

# Reset restart count
pm2 reset opclaw-backend

# Flush logs
pm2 flush
```

### PM2 Ecosystem Configuration

**Location**: `config/pm2/ecosystem.config.js`

**Key Features**:

- **Auto-restart**: Automatically restarts on failure
- **Memory limit**: Restarts if memory exceeds 2GB
- **Log management**: Separate error and output logs
- **Environment variables**: Production configuration
- **Cluster support**: Can scale to multiple instances

**Configuration Details**:

```javascript
{
  name: 'opclaw-backend',
  script: './dist/app.js',
  cwd: '/opt/opclaw/backend',
  instances: 1,
  exec_mode: 'fork',
  autorestart: true,
  max_memory_restart: '2G',
  env: {
    NODE_ENV: 'production',
    PORT: 3000
  }
}
```

### PM2 Log Rotation

**Install PM2 Log Rotate**:

```bash
pm2 install pm2-logrotate
```

**Configure Log Rotation**:

```bash
# Max size of a log file
pm2 set pm2-logrotate:max_size 100M

# Retain logs for 7 days
pm2 set pm2-logrotate:retain 7

# Compress rotated logs
pm2 set pm2-logrotate:compress true
```

---

## Systemd Service

### Service File

**Location**: `config/systemd/opclaw-backend.service`

**Purpose**: Manage PM2 as a systemd service for auto-start on boot

**Features**:

- Auto-start on system boot
- Auto-restart on failure
- Resource limits (2GB memory, 200% CPU)
- Security hardening
- Proper logging

### Installing Systemd Service

```bash
# On server
ssh root@118.25.0.190

# Copy service file
cp config/systemd/opclaw-backend.service /etc/systemd/system/

# Reload systemd
systemctl daemon-reload

# Enable service
systemctl enable opclaw-backend

# Start service
systemctl start opclaw-backend

# Check status
systemctl status opclaw-backend
```

### Managing Systemd Service

```bash
# Start service
systemctl start opclaw-backend

# Stop service
systemctl stop opclaw-backend

# Restart service
systemctl restart opclaw-backend

# Check status
systemctl status opclaw-backend

# View logs
journalctl -u opclaw-backend -f

# View logs (last 100 lines)
journalctl -u opclaw-backend -n 100
```

---

## Health Monitoring

### Health Endpoint

**URL**: `http://118.25.0.190:3000/health`

**Response**:

```json
{
  "status": "ok",
  "timestamp": "2026-03-16T12:00:00Z",
  "uptime": 3600,
  "database": "connected",
  "redis": "connected",
  "docker": "running"
}
```

### Using Health Check Script

```bash
# Standard check
./scripts/cloud/health-check.sh

# Continuous monitoring
./scripts/cloud/health-check.sh --watch

# JSON output for automation
./scripts/cloud/health-check.sh --json
```

### Manual Health Checks

```bash
# SSH to server
ssh root@118.25.0.190

# Check PM2 status
pm2 status

# Check health endpoint
curl http://localhost:3000/health

# Check database connection
sudo -u postgres psql -U opclaw -d opclaw -c 'SELECT 1'

# Check Redis connection
redis-cli ping

# Check Docker status
docker ps
```

---

## Troubleshooting

### Common Issues

#### 1. Service Won't Start

**Symptoms**:
- PM2 status shows "errored" or "stopped"
- Health endpoint returns 502/503

**Diagnosis**:

```bash
# Check PM2 logs
pm2 logs opclaw-backend --lines 50

# Check systemd logs
journalctl -u opclaw-backend -n 50

# Check application logs
tail -f /var/log/opclaw/backend-error.log
```

**Common Causes**:

- **Environment variables missing**: Check `.env` file
- **Database connection failed**: Verify PostgreSQL is running
- **Port already in use**: Check with `netstat -tlnp | grep 3000`
- **Build errors**: Rebuild with `pnpm run build`

**Solution**:

```bash
# Verify environment
cat /opt/opclaw/backend/.env

# Rebuild application
cd /opt/opclaw/backend
pnpm run build

# Restart service
pm2 restart opclaw-backend
```

#### 2. Database Connection Failed

**Symptoms**:
- Logs show "ECONNREFUSED" or "connection refused"
- Health check shows database disconnected

**Diagnosis**:

```bash
# Check PostgreSQL status
systemctl status postgresql

# Check database exists
sudo -u postgres psql -l | grep opclaw

# Test connection
sudo -u postgres psql -U opclaw -d opclaw -c 'SELECT 1'
```

**Solution**:

```bash
# Start PostgreSQL
systemctl start postgresql

# Verify database exists
sudo -u postgres psql -c "CREATE DATABASE opclaw;" 2>/dev/null || true

# Verify user exists
sudo -u postgres psql -c "CREATE USER opclaw;" 2>/dev/null || true

# Grant privileges
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE opclaw TO opclaw;"
```

#### 3. High Memory Usage

**Symptoms**:
- PM2 shows high memory usage
- Service restarts frequently

**Diagnosis**:

```bash
# Check memory usage
pm2 show opclaw-backend

# Check system memory
free -h

# Check Node.js memory
node --max-old-space-size=4096 dist/app.js
```

**Solution**:

```bash
# Update ecosystem.config.js
nano /opt/opclaw/backend/ecosystem.config.js

# Increase memory limit
max_memory_restart: '4G'

# Add Node.js args
node_args: ['--max-old-space-size=4096']

# Restart service
pm2 restart opclaw-backend
```

#### 4. Health Check Fails

**Symptoms**:
- Health endpoint returns 500
- Health check script shows failures

**Diagnosis**:

```bash
# Check health endpoint
curl -v http://localhost:3000/health

# Check application logs
pm2 logs opclaw-backend --lines 20

# Test database connection
psql -U opclaw -d opclaw -c 'SELECT 1'

# Test Redis connection
redis-cli ping
```

**Solution**:

```bash
# Verify all dependencies
systemctl status postgresql redis-server docker

# Restart services if needed
systemctl restart postgresql
systemctl restart redis-server

# Restart backend
pm2 restart opclaw-backend
```

### Debug Mode

Enable debug logging:

```bash
# Edit environment file
nano /opt/opclaw/backend/.env

# Enable debug mode
DEBUG_MODE=true
LOG_LEVEL=debug

# Restart service
pm2 restart opclaw-backend

# View debug logs
pm2 logs opclaw-backend --lines 100
```

---

## Maintenance

### Regular Maintenance Tasks

#### Daily

- Check service status: `pm2 status`
- Review error logs: `pm2 logs opclaw-backend --err --lines 50`

#### Weekly

- Review performance metrics: `pm2 monit`
- Check disk space: `df -h`
- Rotate logs: `pm2 flush`

#### Monthly

- Update dependencies: `pnpm update`
- Review security updates
- Backup database

### Log Management

**View Logs**:

```bash
# PM2 logs
pm2 logs opclaw-backend

# Application logs
tail -f /var/log/opclaw/backend.log

# Error logs
tail -f /var/log/opclaw/backend-error.log

# Systemd logs
journalctl -u opclaw-backend -f
```

**Rotate Logs**:

```bash
# PM2 log rotation
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 100M
pm2 set pm2-logrotate:retain 7

# Manual log cleanup
pm2 flush
> /var/log/opclaw/backend.log
> /var/log/opclaw/backend-error.log
```

### Backup Strategy

**Application Backup**:

```bash
# Create backup
cd /opt/opclaw
tar -czf backups/backend_$(date +%Y%m%d).tar.gz backend

# List backups
ls -lh backups/

# Restore backup
tar -xzf backups/backend_YYYYMMDD.tar.gz
```

**Database Backup**:

```bash
# Automated backup (configured in .env)
BACKUP_SCHEDULE=0 2 * * *  # Daily at 2 AM

# Manual backup
sudo -u postgres pg_dump opclaw | gzip > backups/opclaw_$(date +%Y%m%d).sql.gz

# Restore backup
gunzip < backups/opclaw_YYYYMMDD.sql.gz | sudo -u postgres psql opclaw
```

### Update Deployment

**Update Application**:

```bash
# On local machine
cd /Users/arthurren/projects/AIOpc

# Pull latest changes
git pull

# Run deployment script
./scripts/cloud/deploy-backend.sh

# Verify deployment
./scripts/cloud/health-check.sh
```

**Zero-Downtime Deployment**:

```bash
# Use PM2 reload for zero-downtime
ssh root@118.25.0.190 'pm2 reload opclaw-backend'

# Or use ecosystem config
ssh root@118.25.0.190 'pm2 reload ecosystem.config.js --env production'
```

---

## Security Best Practices

### 1. Environment Variables

- Never commit `.env` files to version control
- Use strong, unique passwords (min 24 characters)
- Rotate secrets regularly
- Store secrets in secure location

### 2. File Permissions

```bash
# Secure environment file
chmod 600 /opt/opclaw/backend/.env

# Secure application directory
chmod 750 /opt/opclaw/backend

# Secure logs
chmod 640 /var/log/opclaw/*.log
```

### 3. Firewall Configuration

```bash
# Allow only necessary ports
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw enable
```

### 4. SSL/TLS

- Use HTTPS for all external connections
- Keep SSL certificates updated
- Configure HTTP to HTTPS redirect

### 5. Dependencies

```bash
# Regularly update dependencies
pnpm update

# Audit for vulnerabilities
pnpm audit

# Fix vulnerabilities
pnpm audit fix
```

---

## Performance Optimization

### 1. Connection Pooling

```env
# Database connection pool
DB_MAX_CONNECTIONS=20
DB_MIN_CONNECTIONS=5

# Redis connection pool
REDIS_MAX_RETRIES_PER_REQUEST=3
```

### 2. Caching

```env
# Enable Redis caching
REDIS_ENABLED=true
CACHE_TTL=3600
```

### 3. Cluster Mode

```javascript
// ecosystem.config.js
instances: 'max', // or specific number like 4
exec_mode: 'cluster'
```

### 4. Load Balancing

Configure Nginx for load balancing:

```nginx
upstream backend {
    server localhost:3000;
    server localhost:3001;
    server localhost:3002;
}
```

---

## Monitoring and Alerts

### PM2 Plus

```bash
# Link to PM2 Plus
pm2 link <secret_key> <public_key>

# Monitor in real-time
pm2 monit
```

### External Monitoring

Consider using:

- **Prometheus + Grafana**: Metrics collection and visualization
- **DataDog**: Infrastructure monitoring
- **New Relic**: Application performance monitoring
- **Uptime Robot**: Uptime monitoring

### Alert Configuration

Configure alerts for:

- Service downtime
- High memory usage
- High CPU usage
- Database connection failures
- Error rate spikes

---

## Appendix

### File Locations

| File | Location |
|------|----------|
| Application | `/opt/opclaw/backend` |
| Environment | `/opt/opclaw/backend/.env` |
| PM2 Config | `/opt/opclaw/backend/ecosystem.config.js` |
| PM2 Logs | `/var/log/opclaw/pm2-*.log` |
| App Logs | `/var/log/opclaw/backend*.log` |
| Systemd Service | `/etc/systemd/system/opclaw-backend.service` |
| Backups | `/opt/opclaw/backups` |

### Port Reference

| Service | Port | Notes |
|---------|------|-------|
| Backend API | 3000 | Direct access |
| HTTP | 80 | Nginx redirect |
| HTTPS | 443 | Nginx SSL |
| PostgreSQL | 5432 | Internal only |
| Redis | 6379 | Internal only |

### Useful Commands

```bash
# Quick service status
pm2 status && systemctl status opclaw-backend

# Quick health check
curl http://localhost:3000/health

# Quick error check
pm2 logs opclaw-backend --err --lines 20

# Quick restart
pm2 restart opclaw-backend

# Quick reconnection check
sudo -u postgres psql -U opclaw -d opclaw -c 'SELECT 1' && redis-cli ping
```

### Support

For issues or questions:

1. Check logs: `pm2 logs opclaw-backend`
2. Run health check: `./scripts/cloud/health-check.sh --verbose`
3. Review documentation: `docs/`
4. Check server status: `systemctl status opclaw-backend`

---

**Last Updated**: 2026-03-16
**Version**: 1.0.0
**Status**: Production Ready
