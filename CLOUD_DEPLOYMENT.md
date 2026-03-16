# AIOpc Cloud Deployment Guide

This guide provides step-by-step instructions for deploying the AIOpc platform to the cloud server.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Server Information](#server-information)
- [Quick Start](#quick-start)
- [Detailed Steps](#detailed-steps)
- [SSL Certificate Setup](#ssl-certificate-setup)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### Local Requirements

- SSH client installed
- Git installed
- Node.js 22+ installed
- pnpm installed

### Server Requirements

- Ubuntu 20.04+ or Debian 11+
- Root or sudo access
- At least 2 CPU cores
- At least 4GB RAM
- At least 20GB disk space

### Domain Requirements

- Domain name (renava.cn) pointing to server IP (118.25.0.190)
- DNS configured:
  - A record: `renava.cn` → `118.25.0.190`
  - A record: `www.renava.cn` → `118.25.0.190`

## Server Information

- **IP Address**: 118.25.0.190
- **Domain**: renava.cn
- **SSH User**: root (or your sudo user)
- **Deployment Path**: /opt/opclaw

## Quick Start

### 1. Initialize Server

```bash
# Copy init script to server
scp scripts/cloud/init-server.sh root@118.25.0.190:/root/

# SSH into server
ssh root@118.25.0.190

# Run initialization script
chmod +x /root/init-server.sh
./root/init-server.sh
```

### 2. Check Environment

```bash
# Copy check script to server
scp scripts/cloud/check-environment.sh root@118.25.0.190:/root/

# Run environment check
ssh root@118.25.0.190 'bash /root/check-environment.sh'
```

### 3. Initialize Database

```bash
# Copy database init script to server
scp scripts/cloud/init-database.sh root@118.25.0.190:/root/

# Run database initialization
ssh root@118.25.0.190 'bash /root/init-database.sh'
```

### 4. Deploy Application

```bash
# From your local machine
cd /path/to/AIOpc

# Run deployment script
./scripts/cloud/deploy.sh
```

### 5. Configure SSL

```bash
# SSH into server
ssh root@118.25.0.190

# Install certbot and obtain certificate
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d renava.cn -d www.renava.cn

# Test auto-renewal
certbot renew --dry-run
```

## Detailed Steps

### Step 1: Server Access

Connect to your server using SSH:

```bash
ssh root@118.25.0.190
```

**First time setup**: You'll be prompted to add the host to your known hosts. Type `yes`.

### Step 2: Server Initialization

The initialization script (`init-server.sh`) installs and configures:

- **Docker & Docker Compose**: For containerized services
- **Node.js 22**: JavaScript runtime for the backend
- **pnpm**: Fast, disk space efficient package manager
- **PostgreSQL 16**: Relational database
- **Redis**: Caching and session storage
- **Nginx**: Web server and reverse proxy
- **UFW Firewall**: Security configuration

**What it does**:
- Updates system packages
- Installs all dependencies
- Configures firewall rules
- Creates directory structure
- Generates secure passwords

**Output**: Credentials saved to `/etc/opclaw/.env`

### Step 3: Environment Verification

The check script (`check-environment.sh`) verifies:

- **OS**: Ubuntu/Debian detection
- **Docker**: Installation and daemon status
- **Node.js**: Version check (requires 22.x)
- **PostgreSQL**: Installation and service status
- **Redis**: Installation and service status
- **Nginx**: Installation and configuration
- **Firewall**: UFW status and rules
- **Directories**: Required directory structure
- **Credentials**: Environment file validation
- **Ports**: Availability check

**Exit codes**:
- `0`: All checks passed
- `1`: Some checks failed

### Step 4: Database Initialization

The database init script (`init-database.sh`) performs:

- **Database Creation**: Creates `opclaw` and `opclaw_test` databases
- **User Creation**: Creates `opclaw` user with password
- **Schema Creation**: Creates schemas for users, instances, metrics, knowledge
- **Extensions**: Installs required PostgreSQL extensions
- **Permissions**: Grants necessary privileges

**Options**:
```bash
# Drop existing database and recreate
./init-database.sh --drop-existing

# Only run seed data (skip database creation)
./init-database.sh --seed-only
```

### Step 5: Application Build

Before deploying, build the application locally:

```bash
# Clone repository (if not already done)
git clone https://github.com/yourusername/AIOpc.git
cd AIOpc

# Install dependencies
pnpm install

# Build backend
cd backend
pnpm run build

# Build frontend
cd ../frontend
pnpm run build
```

### Step 6: Application Deployment

The deployment script (`deploy.sh`) handles:

- **Backup**: Creates timestamped backup of current deployment
- **Upload**: Uploads build artifacts to server
- **Configuration**: Deploys configuration files
- **Dependencies**: Installs production dependencies
- **Services**: Restarts backend and metrics services
- **Health Check**: Verifies deployment success

**Options**:
```bash
# Skip backup (faster but less safe)
./deploy.sh --skip-backup

# Skip tests (faster but risky)
./deploy.sh --skip-tests

# Rollback to previous backup
./deploy.sh --rollback
```

**Process**:
1. Pre-flight checks (SSH connection, build artifacts)
2. Run tests (unless `--skip-tests`)
3. Create backup (unless `--skip-backup`)
4. Deploy configuration files
5. Deploy backend
6. Deploy frontend
7. Restart services
8. Health check

**On failure**: Automatically rolls back to previous backup

### Step 7: SSL Certificate Setup

SSL certificates are provided by Let's Encrypt using certbot:

```bash
# Install certbot
apt-get install -y certbot python3-certbot-nginx

# Obtain certificate
certbot --nginx -d renava.cn -d www.renava.cn
```

**Certbot will**:
- Install SSL certificate
- Configure Nginx to use HTTPS
- Set up auto-renewal

**Test renewal**:
```bash
certbot renew --dry-run
```

**Certificate location**:
- Certificate: `/etc/letsencrypt/live/renava.cn/fullchain.pem`
- Private key: `/etc/letsencrypt/live/renava.cn/privkey.pem`

### Step 8: Verification

After deployment, verify everything is working:

```bash
# Check service status
ssh root@118.25.0.190 'systemctl status opclaw-backend'

# Check backend health
curl https://renava.cn/health

# Check frontend
curl https://renava.cn

# Check API
curl https://renava.cn/api/health
```

## SSL Certificate Setup

### Manual Certificate Request

If automatic configuration fails:

```bash
# Stop nginx
systemctl stop nginx

# Obtain certificate in standalone mode
certbot certonly --standalone -d renava.cn -d www.renava.cn

# Start nginx
systemctl start nginx
```

### Certificate Renewal

Certificates are automatically renewed by cron. To manually renew:

```bash
# Test renewal
certbot renew --dry-run

# Force renewal
certbot renew --force-renewal
```

Renewal log: `/var/log/letsencrypt/letsencrypt.log`

## Verification

### Service Status

```bash
# Backend service
systemctl status opclaw-backend

# Metrics service
systemctl status opclaw-metrics

# Nginx service
systemctl status nginx

# PostgreSQL service
systemctl status postgresql

# Redis service
systemctl status redis-server
```

### Logs

```bash
# Backend logs
journalctl -u opclaw-backend -f

# Metrics logs
journalctl -u opclaw-metrics -f

# Nginx logs
tail -f /var/log/nginx/opclaw-access.log
tail -f /var/log/nginx/opclaw-error.log

# Application logs
tail -f /var/log/opclaw/backend.log
```

### Health Checks

```bash
# Backend health endpoint
curl https://renava.cn/health

# API health endpoint
curl https://renava.cn/api/health

# Metrics endpoint
curl https://renava.cn/metrics
```

### Database Connectivity

```bash
# Connect to PostgreSQL
sudo -u postgres psql -d opclaw

# List databases
sudo -u postgres psql -l

# Check database size
sudo -u postgres psql -d opclaw -c "SELECT pg_size_pretty(pg_database_size('opclaw'));"
```

### Redis Connectivity

```bash
# Test Redis connection
redis-cli ping

# Check Redis info
redis-cli info
```

## Troubleshooting

### Common Issues

#### 1. SSH Connection Refused

**Problem**: Cannot connect to server via SSH

**Solutions**:
- Check server is running: `ping 118.25.0.190`
- Check SSH service: `systemctl status sshd`
- Check firewall: `ufw status`
- Check SSH port: `ss -tulnp | grep 22`

#### 2. Docker Daemon Not Running

**Problem**: Docker commands fail

**Solution**:
```bash
# Start Docker
systemctl start docker
systemctl enable docker

# Check status
systemctl status docker
docker info
```

#### 3. PostgreSQL Connection Failed

**Problem**: Cannot connect to database

**Solutions**:
```bash
# Check PostgreSQL is running
systemctl status postgresql

# Check connection
sudo -u postgres psql -c "SELECT 1"

# Verify credentials
cat /etc/opclaw/.env

# Test connection
PGPASSWORD=$POSTGRES_PASSWORD psql -h localhost -U opclaw -d opclaw
```

#### 4. Nginx Configuration Test Failed

**Problem**: Nginx won't start or reload

**Solutions**:
```bash
# Test configuration
nginx -t

# Check error log
tail -f /var/log/nginx/error.log

# Fix configuration errors
nano /etc/nginx/sites-available/opclaw

# Reload after fix
systemctl reload nginx
```

#### 5. Backend Service Won't Start

**Problem**: opclaw-backend service fails

**Solutions**:
```bash
# Check service status
systemctl status opclaw-backend

# Check logs
journalctl -u opclaw-backend -n 50

# Check application logs
tail -f /var/log/opclaw/backend.log

# Verify Node.js version
node --version

# Check permissions
ls -la /opt/opclaw/backend
```

#### 6. Health Check Failed

**Problem**: Backend health endpoint returns error

**Solutions**:
```bash
# Check backend is running
systemctl status opclaw-backend

# Check backend logs
journalctl -u opclaw-backend -f

# Check port is listening
ss -tulnp | grep 3000

# Test locally
curl http://localhost:3000/health

# Check database connection
PGPASSWORD=$POSTGRES_PASSWORD psql -h localhost -U opclaw -d opclaw
```

#### 7. SSL Certificate Issues

**Problem**: HTTPS not working or certificate errors

**Solutions**:
```bash
# Check certificate exists
ls -la /etc/letsencrypt/live/renava.cn/

# Check certificate expiry
openssl x509 -in /etc/letsencrypt/live/renava.cn/fullchain.pem -noout -dates

# Renew certificate
certbot renew

# Force renewal
certbot renew --force-renewal

# Restart nginx
systemctl restart nginx
```

### Getting Help

If you encounter issues not covered here:

1. Check logs in `/var/log/opclaw/`
2. Check service logs with `journalctl`
3. Run environment check: `./scripts/cloud/check-environment.sh --verbose`
4. Review the [troubleshooting guide](CLOUD_TROUBLESHOOTING.md)

### Useful Commands

```bash
# System overview
htop
df -h
free -h

# Service management
systemctl list-units --type=service
systemctl status --all

# Network
ss -tulnp
netstat -tulnp

# Processes
ps aux
top

# Logs
journalctl -f
dmesg | tail
```

## Security Considerations

1. **SSH Keys**: Use SSH keys instead of password authentication
2. **Firewall**: Keep UFW enabled and only open necessary ports
3. **Updates**: Keep system packages updated
4. **Backups**: Regular database and file backups
5. **Monitoring**: Set up monitoring for services and resources
6. **SSL**: Always use HTTPS in production
7. **Credentials**: Use strong, unique passwords
8. **User isolation**: Run services as dedicated user (opclaw)

## Maintenance

### Regular Updates

```bash
# Update system packages
apt-get update && apt-get upgrade -y

# Update Node.js dependencies
cd /opt/opclaw/backend
pnpm update

# Update SSL certificates
certbot renew
```

### Database Backups

```bash
# Manual backup
sudo -u postgres pg_dump opclaw | gzip > backup_$(date +%Y%m%d).sql.gz

# Automated backup (add to crontab)
0 2 * * * sudo -u postgres pg_dump opclaw | gzip > /opt/opclaw/backups/db_$(date +\%Y\%m\%d).sql.gz
```

### Log Rotation

Logs are automatically rotated by systemd. For custom log rotation:

```bash
# Install logrotate
apt-get install logrotate

# Configure logrotate
nano /etc/logrotate.d/opclaw
```

### Monitoring

Consider setting up:

- **Prometheus**: Metrics collection
- **Grafana**: Visualization dashboards
- **Alertmanager**: Alert routing
- **Uptime monitoring**: External service monitoring

## Rollback Procedure

If deployment fails or issues arise:

```bash
# Automatic rollback (if health check fails)
./scripts/cloud/deploy.sh --rollback

# Manual rollback
ssh root@118.25.0.190
cd /opt/opclaw/backups
ls -lt  # List backups by time
# Select backup to restore
cd backup_YYYYMMDD_HHMMSS
tar -xzf backend.tar.gz -C /opt/opclaw/
systemctl restart opclaw-backend
```

## Next Steps

After successful deployment:

1. Configure Feishu OAuth credentials
2. Set up monitoring and alerting
3. Configure backup automation
4. Set up CI/CD pipeline
5. Configure custom domain (if different from renava.cn)
6. Set up email notifications
7. Configure rate limiting
8. Set up log aggregation

## Resources

- [Project Documentation](docs/)
- [API Documentation](docs/api/)
- [Architecture Guide](docs/01-technical-architecture-local.md)
- [Troubleshooting Guide](CLOUD_TROUBLESHOOTING.md)
- [Task List](docs/tasks/TASK_LIST_005_cloud_deployment.md)
