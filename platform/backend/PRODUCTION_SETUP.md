# Production Setup Guide

Quick reference guide for setting up the AIOpc Platform Backend in production environment.

> **Companion Guide**: See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

---

## Quick Start

### 1. Environment Setup (5 minutes)

```bash
# Copy production environment template
cp .env.production.example .env.production

# Edit and configure required variables
nano .env.production
```

**Required variables**:
- `DB_PASSWORD`: Strong database password
- `REDIS_PASSWORD`: Strong Redis password
- `JWT_SECRET`: 32+ character secret
- `SESSION_SECRET`: 32+ character secret
- `ENCRYPTION_KEY`: 32+ character encryption key
- `FEISHU_APP_ID`: Your Feishu app ID
- `FEISHU_APP_SECRET`: Your Feishu app secret
- `DEEPSEEK_API_KEY`: Your DeepSeek API key

### 2. Database Setup (10 minutes)

```bash
# Create database and user
sudo -u postgres psql
CREATE USER opclaw WITH PASSWORD 'your-password';
CREATE DATABASE opclaw_production OWNER opclaw;
GRANT ALL PRIVILEGES ON DATABASE opclaw_production TO opclaw;
\q

# Run migrations
cd /path/to/platform/backend
pnpm install
pnpm run build
pnpm run db:migrate
```

### 3. Deploy (2 minutes)

```bash
# Run deployment script
./scripts/deploy.sh production

# Or manually:
pnpm run build
NODE_ENV=production node dist/app.js
```

### 4. Verify (1 minute)

```bash
# Health check
curl http://localhost:3000/health

# Expected response:
# {"status":"healthy","timestamp":"..."}
```

---

## Configuration Checklist

### Security

- [ ] All passwords are 16+ characters
- [ ] All secrets are 32+ characters
- [ ] SSL/TLS enabled
- [ ] CORS restricted to your domain
- [ ] Rate limiting enabled
- [ ] Environment file permissions: 600
- [ ] `.env.production` NOT in git

### Database

- [ ] PostgreSQL 14+ installed
- [ ] Database and user created
- [ ] Password set and secure
- [ ] Migrations run successfully
- [ ] Connection pooling configured (20 max)
- [ ] Query timeout set (30s)
- [ ] Logging set to 'error' only

### Redis

- [ ] Redis 6+ installed
- [ ] Password set and secure
- [ ] Max retries configured (3)
- [ ] Connection timeout set (10s)
- [ ] Keep-alive enabled (30s)

### Application

- [ ] Node.js 20+ installed
- [ ] Dependencies installed
- [ ] TypeScript build successful
- [ ] Environment file configured
- [ ] Log directory exists
- [ ] Backup directory exists

### Monitoring

- [ ] Health checks enabled
- [ ] Metrics collection enabled
- [ ] Logging configured
- [ ] Performance monitoring enabled
- [ ] Error tracking configured

---

## Common Commands

### Service Management

```bash
# Start service
sudo systemctl start opclaw-backend

# Stop service
sudo systemctl stop opclaw-backend

# Restart service
sudo systemctl restart opclaw-backend

# Check status
sudo systemctl status opclaw-backend

# View logs
sudo journalctl -u opclaw-backend -f
```

### Database Operations

```bash
# Run migrations
pnpm run db:migrate

# Rollback migration
pnpm run db:revert

# Create new migration
pnpm run db:create

# Backup database
./scripts/backup.sh db

# Restore database
gunzip < backup.sql.gz | psql -U opclaw -d opclaw_production
```

### Backup & Restore

```bash
# Full backup
./scripts/backup.sh full

# Database only
./scripts/backup.sh db

# Files only
./scripts/backup.sh files

# Rollback to latest
./scripts/rollback.sh

# Rollback to specific timestamp
./scripts/rollback.sh 20260316_120000
```

### Monitoring

```bash
# Health check
curl http://localhost:3000/health

# Detailed health
curl http://localhost:3000/health/ready

# Application logs
tail -f logs/application-*.log

# Error logs
tail -f logs/error-*.log
```

---

## Troubleshooting

### Service won't start

```bash
# Check service status
sudo systemctl status opclaw-backend

# Check logs
sudo journalctl -u opclaw-backend -n 50

# Verify environment file
cat .env.production

# Check port availability
sudo netstat -tlnp | grep 3000
```

### Database connection failed

```bash
# Test connection
psql -U opclaw -d opclaw_production -h localhost

# Check PostgreSQL status
sudo systemctl status postgresql

# Check PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-*.log
```

### Redis connection failed

```bash
# Test connection
redis-cli ping

# Check Redis status
sudo systemctl status redis

# Check Redis logs
sudo tail -f /var/log/redis/redis-server.log
```

### High memory usage

```bash
# Check memory
free -m

# Check Node.js process
ps aux | grep node

# Restart service
sudo systemctl restart opclaw-backend
```

---

## Performance Tuning

### Database

```bash
# PostgreSQL configuration (postgresql.conf)
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 64MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
work_mem = 2621kB
min_wal_size = 1GB
max_wal_size = 4GB
```

### Redis

```bash
# Redis configuration (redis.conf)
maxmemory 2gb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
```

### Application

```bash
# Environment variables (.env.production)
DB_MAX_CONNECTIONS=20
DB_MIN_CONNECTIONS=5
REDIS_MAX_RETRIES_PER_REQUEST=3
HEALTH_CHECK_INTERVAL=60000
METRICS_COLLECTION_INTERVAL=30000
```

---

## Security Hardening

### Firewall

```bash
# Install UFW
sudo apt-get install -y ufw

# Default policies
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow SSH
sudo ufw allow 22/tcp

# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable
```

### Fail2Ban

```bash
# Install Fail2Ban
sudo apt-get install -y fail2ban

# Create local jail
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local

# Enable service
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### SSL/TLS

```bash
# Install Certbot
sudo apt-get install -y certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal
sudo certbot renew --dry-run
```

---

## Maintenance Schedule

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

For detailed deployment instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md).

For issues or questions:
1. Check logs: `journalctl -u opclaw-backend -n 100`
2. Check health: `curl http://localhost:3000/health`
3. Review documentation: `/docs`
