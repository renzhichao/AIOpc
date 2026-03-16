# Production Deployment Guide

This guide provides comprehensive instructions for deploying the AIOpc Platform Backend to production environment.

> **Last Updated**: 2026-03-16
> **Version**: 1.0.0
> **Environment**: Production

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Database Migration](#database-migration)
4. [Build and Deploy](#build-and-deploy)
5. [Nginx Configuration](#nginx-configuration)
6. [SSL/TLS Setup](#ssltls-setup)
7. [Health Checks](#health-checks)
8. [Monitoring Setup](#monitoring-setup)
9. [Backup Strategy](#backup-strategy)
10. [Rollback Procedure](#rollback-procedure)
11. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### System Requirements

- **Operating System**: Ubuntu 20.04+ / CentOS 8+ / Debian 11+
- **Node.js**: v20.0.0 or higher
- **PostgreSQL**: 14+ or 15+
- **Redis**: 6.0+
- **Docker**: 20.10+ with Docker Compose v2
- **Memory**: Minimum 4GB RAM (8GB recommended)
- **Disk**: Minimum 20GB free space
- **CPU**: Minimum 2 cores (4 cores recommended)

### Software Dependencies

```bash
# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install pnpm
npm install -g pnpm

# Install PostgreSQL 14
sudo apt-get install -y postgresql postgresql-contrib

# Install Redis
sudo apt-get install -y redis-server

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Nginx
sudo apt-get install -y nginx
```

---

## Environment Setup

### 1. Create Production Environment File

```bash
cd /path/to/platform/backend
cp .env.production.example .env.production
```

### 2. Configure Environment Variables

Edit `.env.production` and set the following critical values:

#### Database Configuration

```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=opclaw_production
DB_USERNAME=opclaw
DB_PASSWORD=<generate-strong-password>
DB_MAX_CONNECTIONS=20
DB_MIN_CONNECTIONS=5
```

#### Redis Configuration

```bash
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=<generate-strong-password>
```

#### Security Keys

```bash
# Generate secure secrets (32+ characters)
JWT_SECRET=<generate-with-openssl-rand-base64-32>
SESSION_SECRET=<generate-with-openssl-rand-base64-32>
ENCRYPTION_KEY=<generate-with-openssl-rand-base64-32>
```

#### Feishu OAuth

```bash
FEISHU_APP_ID=<your-feishu-app-id>
FEISHU_APP_SECRET=<your-feishu-app-secret>
FEISHU_REDIRECT_URI=https://your-domain.com/oauth/callback
```

#### DeepSeek API

```bash
DEEPSEEK_API_KEY=<your-deepseek-api-key>
```

### 3. Generate Secure Secrets

```bash
# Generate JWT secret
openssl rand -base64 32

# Generate session secret
openssl rand -base64 32

# Generate encryption key
openssl rand -base64 32
```

### 4. Set File Permissions

```bash
chmod 600 .env.production
chown app-user:app-group .env.production
```

---

## Database Migration

### 1. Create Database User and Database

```bash
# Switch to postgres user
sudo -u postgres psql

# Create user
CREATE USER opclaw WITH PASSWORD 'your-strong-password';

# Create database
CREATE DATABASE opclaw_production OWNER opclaw;

# Grant privileges
GRANT ALL PRIVILEGES ON DATABASE opclaw_production TO opclaw;

# Exit psql
\q
```

### 2. Run Database Migrations

```bash
cd /path/to/platform/backend

# Install dependencies
pnpm install

# Build the project
pnpm run build

# Run migrations
pnpm run db:migrate
```

### 3. Verify Database Schema

```bash
# Connect to database
psql -U opclaw -d opclaw_production

# List tables
\dt

# Expected output:
# - users
# - instances
# - api_keys
# - documents
# - document_chunks
# - qrcodes
# - instance_renewals
# - instance_metrics

# Exit
\q
```

### 4. Seed Initial Data (Optional)

```bash
# Seed API keys
pnpm run db:seed
```

---

## Build and Deploy

### 1. Install Dependencies

```bash
cd /path/to/platform/backend
pnpm install --prod=false
```

### 2. Build TypeScript

```bash
pnpm run build
```

### 3. Create Systemd Service

Create `/etc/systemd/system/opclaw-backend.service`:

```ini
[Unit]
Description=AIOpc Platform Backend
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=app-user
WorkingDirectory=/path/to/platform/backend
Environment=NODE_ENV=production
EnvironmentFile=/path/to/platform/backend/.env.production
ExecStart=/usr/bin/node dist/app.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=opclaw-backend

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/path/to/platform/backend/logs

# Resource limits
MemoryMax=2G
CPUQuota=200%

[Install]
WantedBy=multi-user.target
```

### 4. Enable and Start Service

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service
sudo systemctl enable opclaw-backend

# Start service
sudo systemctl start opclaw-backend

# Check status
sudo systemctl status opclaw-backend
```

### 5. Verify Service

```bash
# Check logs
sudo journalctl -u opclaw-backend -f

# Test health endpoint
curl http://localhost:3000/health

# Expected response:
# {"status":"healthy","timestamp":"2026-03-16T..."}
```

---

## Nginx Configuration

### 1. Create Nginx Configuration

Create `/etc/nginx/sites-available/opclaw-backend`:

```nginx
upstream opclaw_backend {
    server localhost:3000;
    keepalive 64;
}

server {
    listen 80;
    server_name your-domain.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL configuration (see below)
    ssl_certificate /etc/ssl/certs/opclaw-backend.crt;
    ssl_certificate_key /etc/ssl/private/opclaw-backend.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Logging
    access_log /var/log/nginx/opclaw-backend-access.log;
    error_log /var/log/nginx/opclaw-backend-error.log;

    # Proxy settings
    location / {
        proxy_pass http://opclaw_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Health check endpoint (no auth required)
    location /health {
        proxy_pass http://opclaw_backend/health;
        access_log off;
    }

    # Static files (if any)
    location /static {
        alias /path/to/platform/backend/public;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

### 2. Enable Site

```bash
# Create symbolic link
sudo ln -s /etc/nginx/sites-available/opclaw-backend /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

---

## SSL/TLS Setup

### Option 1: Let's Encrypt (Recommended)

```bash
# Install Certbot
sudo apt-get install -y certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal (configured automatically)
sudo certbot renew --dry-run
```

### Option 2: Self-Signed Certificate (Testing Only)

```bash
# Generate self-signed certificate
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/opclaw-backend.key \
  -out /etc/ssl/certs/opclaw-backend.crt

# Set permissions
sudo chmod 600 /etc/ssl/private/opclaw-backend.key
sudo chmod 644 /etc/ssl/certs/opclaw-backend.crt
```

---

## Health Checks

### 1. Basic Health Check

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2026-03-16T10:00:00.000Z",
  "uptime": 3600
}
```

### 2. Detailed Health Check

```bash
curl http://localhost:3000/health/ready
```

Response:
```json
{
  "status": "ready",
  "checks": {
    "database": {
      "status": "healthy",
      "latency": 5
    },
    "redis": {
      "status": "healthy",
      "latency": 1
    },
    "docker": {
      "status": "healthy",
      "latency": 10
    }
  }
}
```

### 3. Liveness Probe

```bash
curl http://localhost:3000/health/live
```

### 4. Monitor Health Checks

Create cron job for automated monitoring:

```bash
# Edit crontab
crontab -e

# Add health check every minute
* * * * * /usr/bin/curl -f http://localhost:3000/health || /usr/bin/logger "Backend health check failed"
```

---

## Monitoring Setup

### 1. Application Monitoring

The application includes built-in monitoring:

- **Metrics collection**: Every 30 seconds
- **Health checks**: Every 60 seconds
- **Performance tracking**: Request times, query times
- **Error tracking**: Error rates, slow queries

### 2. Log Monitoring

```bash
# Application logs
tail -f /path/to/platform/backend/logs/application-*.log

# Error logs
tail -f /path/to/platform/backend/logs/error-*.log

# Systemd logs
journalctl -u opclaw-backend -f
```

### 3. System Monitoring (Optional)

Install monitoring tools:

```bash
# Install htop
sudo apt-get install -y htop

# Monitor resources
htop

# Check disk usage
df -h

# Check memory
free -m

# Check processes
ps aux | grep node
```

### 4. External Monitoring (Recommended)

Consider using:
- **Prometheus + Grafana**: Metrics and visualization
- **DataDog**: Full-stack monitoring
- **New Relic**: APM and monitoring
- **Sentry**: Error tracking

---

## Backup Strategy

### 1. Database Backup

Create automated backup script `/usr/local/bin/backup-opclaw-db.sh`:

```bash
#!/bin/bash

BACKUP_DIR="/var/backups/opclaw"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/opclaw_db_$TIMESTAMP.sql.gz"

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup database
PGPASSWORD='your-db-password' pg_dump -U opclaw -h localhost opclaw_production | gzip > $BACKUP_FILE

# Delete backups older than 30 days
find $BACKUP_DIR -name "opclaw_db_*.sql.gz" -mtime +30 -delete

echo "Backup completed: $BACKUP_FILE"
```

Make it executable and add to cron:

```bash
sudo chmod +x /usr/local/bin/backup-opclaw-db.sh

# Add to crontab (daily at 2 AM)
crontab -e
0 2 * * * /usr/local/bin/backup-opclaw-db.sh
```

### 2. File Backup

```bash
# Backup configuration and files
tar -czf /var/backups/opclaw/files_$(date +%Y%m%d).tar.gz \
  /path/to/platform/backend/.env.production \
  /path/to/platform/backend/dist/
```

### 3. Redis Backup

```bash
# Save Redis snapshot
redis-cli BGSAVE

# Backup Redis dump file
cp /var/lib/redis/dump.rdb /var/backups/opclaw/redis_$(date +%Y%m%d).rdb
```

---

## Rollback Procedure

### 1. Identify Problem

```bash
# Check service status
sudo systemctl status opclaw-backend

# Check logs
sudo journalctl -u opclaw-backend -n 100

# Check health
curl http://localhost:3000/health
```

### 2. Stop Service

```bash
sudo systemctl stop opclaw-backend
```

### 3. Restore Previous Version

```bash
# List available backups
ls -lh /path/to/backups/

# Restore previous deployment
cd /path/to/platform/backend
git checkout <previous-commit-tag>
pnpm run build
```

### 4. Restore Database (if needed)

```bash
# Stop database
sudo systemctl stop postgresql

# Restore backup
gunzip < /var/backups/opclaw/opclaw_db_YYYYMMDD_HHMMSS.sql.gz | \
  psql -U opclaw -d opclaw_production

# Start database
sudo systemctl start postgresql
```

### 5. Start Service

```bash
sudo systemctl start opclaw-backend
sudo systemctl status opclaw-backend
```

### 6. Verify Rollback

```bash
# Check health
curl http://localhost:3000/health

# Run smoke tests
cd /path/to/platform/backend
pnpm run test:integration
```

---

## Troubleshooting

### Service Won't Start

```bash
# Check service status
sudo systemctl status opclaw-backend

# Check logs
sudo journalctl -u opclaw-backend -n 50

# Check port availability
sudo netstat -tlnp | grep 3000

# Verify environment file
cat .env.production
```

### Database Connection Issues

```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Test connection
psql -U opclaw -d opclaw_production -h localhost

# Check PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-*.log
```

### Redis Connection Issues

```bash
# Check Redis status
sudo systemctl status redis

# Test connection
redis-cli ping

# Check Redis logs
sudo tail -f /var/log/redis/redis-server.log
```

### Docker Issues

```bash
# Check Docker status
sudo systemctl status docker

# Test Docker
sudo docker run hello-world

# Check Docker logs
sudo journalctl -u docker -n 50
```

### High Memory Usage

```bash
# Check memory usage
free -m

# Check Node.js process memory
ps aux | grep node

# Restart service
sudo systemctl restart opclaw-backend
```

### Slow Performance

```bash
# Check database query performance
psql -U opclaw -d opclaw_production -c "SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;"

# Check slow queries
tail -f /path/to/platform/backend/logs/error-*.log | grep "slow"

# Check system resources
htop
```

---

## Security Checklist

- [ ] Strong passwords (16+ characters)
- [ ] SSL/TLS enabled
- [ ] Firewall configured (UFW/iptables)
- [ ] Fail2Ban installed
- [ ] Regular security updates
- [ ] File permissions restricted
- [ ] Environment file not in git
- [ ] CORS configured properly
- [ ] Rate limiting enabled
- [ ] Input validation enabled
- [ ] SQL injection prevention (TypeORM)
- [ ] XSS protection enabled
- [ ] CSRF protection enabled

---

## Maintenance Tasks

### Daily

- Check application logs
- Monitor health checks
- Review error rates
- Check disk space

### Weekly

- Review backup logs
- Check performance metrics
- Review security logs
- Test restore procedure

### Monthly

- Apply security updates
- Review and rotate secrets
- Audit user access
- Clean old logs
- Test disaster recovery

---

## Support

For issues or questions:

1. Check logs: `journalctl -u opclaw-backend -n 100`
2. Check health: `curl http://localhost:3000/health`
3. Review documentation: `/docs`
4. Contact: [your-support-email]

---

## Appendix

### Useful Commands

```bash
# Restart service
sudo systemctl restart opclaw-backend

# Reload service (graceful)
sudo systemctl reload opclaw-backend

# View logs
sudo journalctl -u opclaw-backend -f

# Check port
sudo netstat -tlnp | grep 3000

# Kill process on port
sudo kill -9 $(sudo lsof -t -i:3000)

# Database backup
pg_dump -U opclaw opclaw_production | gzip > backup.sql.gz

# Database restore
gunzip < backup.sql.gz | psql -U opclaw opclaw_production
```

### Configuration Files

- Environment: `.env.production`
- Nginx: `/etc/nginx/sites-available/opclaw-backend`
- Systemd: `/etc/systemd/system/opclaw-backend.service`
- Database: `/var/lib/postgresql/14/main/`
- Redis: `/etc/redis/redis.conf`
