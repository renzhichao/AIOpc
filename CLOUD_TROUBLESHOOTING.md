# AIOpc Cloud Troubleshooting Guide

This guide helps diagnose and resolve common issues with the AIOpc cloud deployment.

## Table of Contents

- [Quick Diagnostics](#quick-diagnostics)
- [Installation Issues](#installation-issues)
- [Service Issues](#service-issues)
- [Database Issues](#database-issues)
- [Network Issues](#network-issues)
- [SSL Issues](#ssl-issues)
- [Performance Issues](#performance-issues)
- [Debugging Tools](#debugging-tools)

## Quick Diagnostics

When troubleshooting, start with these commands:

```bash
# System overview
systemctl status --all           # All service statuses
htop                             # System resources
df -h                            # Disk usage
free -h                          # Memory usage

# AIOpc services
systemctl status opclaw-backend
systemctl status opclaw-metrics
systemctl status nginx
systemctl status postgresql
systemctl status redis-server

# Recent logs
journalctl -xe                   # Recent system errors
journalctl -u opclaw-backend -n 50
tail -f /var/log/opclaw/backend.log
```

## Installation Issues

### Issue: init-server.sh fails

**Symptoms**:
- Script exits with error
- Packages fail to install
- Services won't start

**Diagnosis**:
```bash
# Check OS is supported
cat /etc/os-release

# Check you're running as root
whoami  # Should be "root"

# Check script is executable
ls -l init-server.sh

# Run with verbose output
./init-server.sh --verbose
```

**Solutions**:

1. **OS not supported**:
   ```bash
   # Script only supports Ubuntu and Debian
   # For other distributions, manual installation required
   ```

2. **Not running as root**:
   ```bash
   # Use sudo
   sudo ./init-server.sh
   ```

3. **Network issues**:
   ```bash
   # Check internet connectivity
   ping -c 4 google.com

   # Check DNS
   nslookup archive.ubuntu.com

   # Try different mirror
   # Edit /etc/apt/sources.list
   ```

4. **Disk space**:
   ```bash
   # Check disk space
   df -h

   # Clean up if needed
   apt-get clean
   apt-get autoremove
   ```

### Issue: Environment check fails

**Symptoms**:
- `check-environment.sh` reports failures
- Services not installed
- Versions don't match requirements

**Diagnosis**:
```bash
# Run with verbose output
./check-environment.sh --verbose

# Check individual components
docker --version
node --version
psql --version
redis-server --version
nginx -v
```

**Solutions**:

1. **Docker not installed**:
   ```bash
   # Re-run init script
   ./init-server.sh
   ```

2. **Node.js version mismatch**:
   ```bash
   # Remove old version
   apt-get remove nodejs

   # Reinstall Node.js 22
   curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
   apt-get install -y nodejs
   ```

3. **Service not running**:
   ```bash
   # Start the service
   systemctl start <service-name>
   systemctl enable <service-name>
   ```

## Service Issues

### Issue: opclaw-backend service won't start

**Symptoms**:
- Service fails to start
- Service starts but immediately stops
- Service restarts repeatedly

**Diagnosis**:
```bash
# Check service status
systemctl status opclaw-backend

# Check service logs
journalctl -u opclaw-backend -n 100

# Check application logs
tail -f /var/log/opclaw/backend.log
tail -f /var/log/opclaw/backend-error.log

# Check if port is in use
ss -tulnp | grep 3000

# Verify Node.js is working
node --version
```

**Solutions**:

1. **Port already in use**:
   ```bash
   # Find process using port 3000
   lsof -i :3000
   # or
   fuser 3000/tcp

   # Kill the process
   kill -9 <PID>

   # Then restart service
   systemctl restart opclaw-backend
   ```

2. **Missing dependencies**:
   ```bash
   cd /opt/opclaw/backend

   # Install dependencies
   pnpm install --prod

   # Verify installation
   pnpm list --depth=0
   ```

3. **Environment variables missing**:
   ```bash
   # Check environment file exists
   cat /etc/opclaw/.env

   # Verify required variables
   grep -E "^(POSTGRES_|REDIS_|NODE_ENV|PORT)" /etc/opclaw/.env
   ```

4. **Build artifacts missing**:
   ```bash
   # Check if dist directory exists
   ls -la /opt/opclaw/backend/dist

   # If missing, redeploy
   ./scripts/cloud/deploy.sh
   ```

5. **Permission issues**:
   ```bash
   # Check ownership
   ls -la /opt/opclaw/backend

   # Fix ownership
   chown -R opclaw:opclaw /opt/opclaw/backend
   chmod -R 755 /opt/opclaw/backend
   ```

### Issue: Service starts but health check fails

**Symptoms**:
- Service is running
- Health endpoint returns error
- API calls fail

**Diagnosis**:
```bash
# Check service is running
systemctl status opclaw-backend

# Test health endpoint locally
curl http://localhost:3000/health
curl -v http://localhost:3000/health

# Check logs
journalctl -u opclaw-backend -f

# Check database connectivity
PGPASSWORD=$POSTGRES_PASSWORD psql -h localhost -U opclaw -d opclaw
```

**Solutions**:

1. **Database connection failed**:
   ```bash
   # Check PostgreSQL is running
   systemctl status postgresql

   # Test connection
   PGPASSWORD=$POSTGRES_PASSWORD psql -h localhost -U opclaw -d opclaw

   # Check credentials
   cat /etc/opclaw/.env | grep POSTGRES
   ```

2. **Missing environment variables**:
   ```bash
   # Check environment in service
   systemctl show opclaw-backend | grep Environment

   # Reload service
   systemctl daemon-reload
   systemctl restart opclaw-backend
   ```

3. **Application error**:
   ```bash
   # Check error logs
   tail -f /var/log/opclaw/backend-error.log

   # Check journal logs
   journalctl -u opclaw-backend -e
   ```

## Database Issues

### Issue: Can't connect to PostgreSQL

**Symptoms**:
- Connection refused errors
- Authentication failures
- Timeout errors

**Diagnosis**:
```bash
# Check PostgreSQL is running
systemctl status postgresql

# Check PostgreSQL is listening
ss -tulnp | grep 5432

# Test connection
sudo -u postgres psql -c "SELECT 1"

# Check PostgreSQL logs
tail -f /var/log/postgresql/postgresql-16-main.log
```

**Solutions**:

1. **PostgreSQL not running**:
   ```bash
   # Start PostgreSQL
   systemctl start postgresql
   systemctl enable postgresql

   # Check status
   systemctl status postgresql
   ```

2. **Authentication failure**:
   ```bash
   # Check pg_hba.conf
   cat /etc/postgresql/16/main/pg_hba.conf

   # Should include:
   # host    all    all    127.0.0.1/32    scram-sha-256

   # Reload configuration
   systemctl reload postgresql
   ```

3. **Wrong credentials**:
   ```bash
   # Reset password
   sudo -u postgres psql
   ALTER USER opclaw WITH PASSWORD 'new_password';
   \q

   # Update .env file
   nano /etc/opclaw/.env
   ```

4. **Database doesn't exist**:
   ```bash
   # Create database
   sudo -u postgres createdb opclaw

   # Run initialization script
   ./scripts/cloud/init-database.sh
   ```

### Issue: Database performance issues

**Symptoms**:
- Slow queries
- High CPU usage
- Connection timeouts

**Diagnosis**:
```bash
# Check database size
sudo -u postgres psql -d opclaw -c "SELECT pg_size_pretty(pg_database_size('opclaw'));"

# Check active connections
sudo -u postgres psql -d opclaw -c "SELECT count(*) FROM pg_stat_activity;"

# Check long-running queries
sudo -u postgres psql -d opclaw -c "SELECT pid, now() - pg_stat_activity.query_start AS duration, query FROM pg_stat_activity WHERE (now() - pg_stat_activity.query_start) > interval '5 seconds';"

# Check table sizes
sudo -u postgres psql -d opclaw -c "SELECT schemaname,tablename,pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size FROM pg_tables WHERE schemaname = 'public' ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;"
```

**Solutions**:

1. **Kill long-running queries**:
   ```bash
   sudo -u postgres psql -d opclaw
   SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'active' AND pid != pg_backend_pid();
   ```

2. **Vacuum and analyze**:
   ```bash
   sudo -u postgres vacuumdb -d opclaw -z -v
   ```

3. **Reindex database**:
   ```bash
   sudo -u postgres reindexdb -d opclaw
   ```

4. **Check configuration**:
   ```bash
   # Edit PostgreSQL configuration
   nano /etc/postgresql/16/main/postgresql.conf

   # Adjust settings:
   # shared_buffers = 256MB
   # effective_cache_size = 1GB
   # maintenance_work_mem = 64MB
   # checkpoint_completion_target = 0.9

   # Restart PostgreSQL
   systemctl restart postgresql
   ```

## Network Issues

### Issue: Can't access server

**Symptoms**:
- SSH connection refused
- Ping fails
- Connection timeout

**Diagnosis**:
```bash
# Test connectivity
ping 118.25.0.190

# Check SSH
ssh -vvv root@118.25.0.190

# Check firewall
ufw status

# Check if SSH is running
systemctl status sshd
```

**Solutions**:

1. **SSH service not running**:
   ```bash
   # Start SSH
   systemctl start sshd
   systemctl enable sshd

   # Check status
   systemctl status sshd
   ```

2. **Firewall blocking**:
   ```bash
   # Check firewall status
   ufw status

   # Allow SSH
   ufw allow 22/tcp

   # Enable firewall
   ufw enable
   ```

3. **Network connectivity**:
   ```bash
   # Check network interface
   ip addr show

   # Check routing
   ip route show

   # Restart network
   systemctl restart networking
   ```

### Issue: Can't access website

**Symptoms**:
- Website won't load
- Connection refused
- Timeout errors

**Diagnosis**:
```bash
# Test local connection
curl http://localhost:3000/health

# Check Nginx is running
systemctl status nginx

# Check Nginx configuration
nginx -t

# Check ports
ss -tulnp | grep -E '(:80|:443|:3000)'

# Check DNS
nslookup renava.cn
dig renava.cn
```

**Solutions**:

1. **Nginx not running**:
   ```bash
   # Start Nginx
   systemctl start nginx
   systemctl enable nginx

   # Check status
   systemctl status nginx
   ```

2. **Nginx configuration error**:
   ```bash
   # Test configuration
   nginx -t

   # Fix errors
   nano /etc/nginx/sites-available/opclaw

   # Reload Nginx
   systemctl reload nginx
   ```

3. **Port not accessible**:
   ```bash
   # Check firewall
   ufw status

   # Allow HTTP/HTTPS
   ufw allow 80/tcp
   ufw allow 443/tcp

   # Check if service is listening
   ss -tulnp | grep -E '(:80|:443)'
   ```

4. **DNS not configured**:
   ```bash
   # Check DNS records
   nslookup renava.cn
   dig renava.cn

   # Should point to 118.25.0.190
   ```

## SSL Issues

### Issue: SSL certificate errors

**Symptoms**:
- Browser warnings about certificates
- Connection not secure
- Certificate expired

**Diagnosis**:
```bash
# Check certificate exists
ls -la /etc/letsencrypt/live/renava.cn/

# Check certificate expiry
openssl x509 -in /etc/letsencrypt/live/renava.cn/fullchain.pem -noout -dates

# Check certificate details
openssl x509 -in /etc/letsencrypt/live/renava.cn/fullchain.pem -noout -text

# Test SSL configuration
openssl s_client -connect renava.cn:443 -servername renava.cn
```

**Solutions**:

1. **Certificate expired**:
   ```bash
   # Renew certificate
   certbot renew

   # Force renewal
   certbot renew --force-renewal

   # Restart Nginx
   systemctl restart nginx
   ```

2. **Certificate not found**:
   ```bash
   # Obtain new certificate
   certbot --nginx -d renava.cn -d www.renava.cn

   # Or in standalone mode
   systemctl stop nginx
   certbot certonly --standalone -d renava.cn -d www.renava.cn
   systemctl start nginx
   ```

3. **Domain mismatch**:
   ```bash
   # Check certificate covers domain
   openssl x509 -in /etc/letsencrypt/live/renava.cn/fullchain.pem -noout -text | grep -A1 "Subject Alternative Name"

   # Should include renava.cn and www.renava.cn
   ```

4. **Auto-renewal not working**:
   ```bash
   # Test renewal
   certbot renew --dry-run

   # Check cron job
   cat /etc/cron.d/certbot
   systemctl status certbot.timer

   # Manual renewal
   certbot renew
   ```

## Performance Issues

### Issue: High CPU usage

**Diagnosis**:
```bash
# Check CPU usage
top
htop

# Check per-process CPU
ps aux --sort=-%cpu | head -n 20

# Check Node.js process
ps aux | grep node
```

**Solutions**:

1. **Reduce Node.js process CPU**:
   ```bash
   # Restart service
   systemctl restart opclaw-backend

   # Check for memory leaks
   # (may require profiling tools)
   ```

2. **Limit CPU usage**:
   ```bash
   # Edit service file
   nano /etc/systemd/system/opclaw-backend.service

   # Add CPU quota:
   # CPUQuota=200%

   # Reload and restart
   systemctl daemon-reload
   systemctl restart opclaw-backend
   ```

### Issue: High memory usage

**Diagnosis**:
```bash
# Check memory usage
free -h

# Check per-process memory
ps aux --sort=-%mem | head -n 20

# Check Node.js memory
node --max-old-space-size=4096 /opt/opclaw/backend/dist/index.js
```

**Solutions**:

1. **Increase Node.js memory limit**:
   ```bash
   # Edit service file
   nano /etc/systemd/system/opclaw-backend.service

   # Add environment variable:
   # Environment=NODE_OPTIONS=--max-old-space-size=4096

   # Reload and restart
   systemctl daemon-reload
   systemctl restart opclaw-backend
   ```

2. **Set memory limit**:
   ```bash
   # Edit service file
   nano /etc/systemd/system/opclaw-backend.service

   # Add memory limit:
   # MemoryMax=2G

   # Reload and restart
   systemctl daemon-reload
   systemctl restart opclaw-backend
   ```

3. **Restart service to free memory**:
   ```bash
   systemctl restart opclaw-backend
   ```

### Issue: Disk space full

**Diagnosis**:
```bash
# Check disk usage
df -h

# Find large files
find / -type f -size +100M 2>/dev/null

# Check PostgreSQL size
sudo -u postgres psql -d opclaw -c "SELECT pg_size_pretty(pg_database_size('opclaw'));"

# Check log sizes
du -sh /var/log/*
```

**Solutions**:

1. **Clean old logs**:
   ```bash
   # Clean application logs
   > /var/log/opclaw/backend.log
   > /var/log/opclaw/backend-error.log

   # Clean systemd journals
   journalctl --vacuum-time=7d
   ```

2. **Clean old backups**:
   ```bash
   # List backups
   ls -lh /opt/opclaw/backups/

   # Remove old backups (keep last 5)
   cd /opt/opclaw/backups
   ls -t | tail -n +6 | xargs -r rm -rf
   ```

3. **Clean package cache**:
   ```bash
   # Clean apt cache
   apt-get clean
   apt-get autoremove

   # Clean pnpm cache
   pnpm store prune
   ```

4. **Vacuum PostgreSQL**:
   ```bash
   # Vacuum database to reclaim space
   sudo -u postgres vacuumdb -d opclaw -z -v
   ```

## Debugging Tools

### System Monitoring

```bash
# Real-time monitoring
htop                    # System resources
iotop                   # I/O usage
nethogs                 # Network usage by process

# Log monitoring
journalctl -f           # System logs
tail -f /var/log/syslog # System log
```

### Service Debugging

```bash
# Service status
systemctl status opclaw-backend
systemctl status nginx
systemctl status postgresql

# Service logs
journalctl -u opclaw-backend -f
journalctl -u nginx -f

# Enable debug logging
journalctl -u opclaw-backend --verify
```

### Network Debugging

```bash
# Check ports
ss -tulnp
netstat -tulnp

# Test connectivity
ping 118.25.0.190
curl -v https://renava.cn

# DNS debugging
nslookup renava.cn
dig renava.cn
dig renava.cn ANY

# SSL debugging
openssl s_client -connect renava.cn:443 -servername renava.cn
```

### Database Debugging

```bash
# Connect to database
sudo -u postgres psql -d opclaw

# Check connections
SELECT * FROM pg_stat_activity;

# Check table sizes
SELECT schemaname, tablename,
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

# Check slow queries
SELECT query, calls, total_time, mean_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
```

### Application Debugging

```bash
# Test API endpoints
curl http://localhost:3000/health
curl -X POST http://localhost:3000/api/test -H "Content-Type: application/json" -d '{"test": true}'

# Check Node.js process
ps aux | grep node

# Debug with Node.js
node --inspect /opt/opclaw/backend/dist/index.js
```

## Getting Help

If you can't resolve the issue:

1. **Check logs**:
   ```bash
   journalctl -xe
   tail -f /var/log/opclaw/backend.log
   ```

2. **Run environment check**:
   ```bash
   ./scripts/cloud/check-environment.sh --verbose
   ```

3. **Review documentation**:
   - [CLOUD_DEPLOYMENT.md](CLOUD_DEPLOYMENT.md)
   - [Project docs](docs/)

4. **Check task list**:
   - [TASK_LIST_005](docs/tasks/TASK_LIST_005_cloud_deployment.md)

5. **Collect diagnostics**:
   ```bash
   # Create diagnostic bundle
   mkdir -p /tmp/opclaw-diagnostics
   systemctl status opclaw-backend > /tmp/opclaw-diagnostics/backend-status.txt
   journalctl -u opclaw-backend -n 100 > /tmp/opclaw-diagnostics/backend-logs.txt
   df -h > /tmp/opclaw-diagnostics/disk-usage.txt
   free -h > /tmp/opclaw-diagnostics/memory-usage.txt
   ss -tulnp > /tmp/opclaw-diagnostics/network-ports.txt
   tar -czf /tmp/opclaw-diagnostics.tar.gz /tmp/opclaw-diagnostics
   ```

## Emergency Procedures

### Complete Reset

If everything is broken and you need to start over:

```bash
# 1. Stop all services
systemctl stop opclaw-backend
systemctl stop opclaw-metrics
systemctl stop nginx

# 2. Backup current state
cd /opt/opclaw
tar -czf /root/opclaw-backup-$(date +%Y%m%d).tar.gz .

# 3. Clean directories
rm -rf /opt/opclaw/backend/*
rm -rf /var/www/opclaw/*

# 4. Reinitialize
./scripts/cloud/init-server.sh
./scripts/cloud/init-database.sh

# 5. Redeploy
./scripts/cloud/deploy.sh
```

### Rollback to Previous Backup

```bash
# List available backups
ls -lh /opt/opclaw/backups/

# Restore specific backup
cd /opt/opclaw/backups/backup_YYYYMMDD_HHMMSS

# Restore backend
tar -xzf backend.tar.gz -C /opt/opclaw/

# Restore frontend
tar -xzf frontend.tar.gz -C /

# Restore database
gunzip < database.sql.gz | PGPASSWORD=$POSTGRES_PASSWORD psql -h localhost -U opclaw opclaw

# Restart services
systemctl restart opclaw-backend
systemctl restart nginx
```

### Service Restart Sequence

When multiple services are affected:

```bash
# 1. Stop all services
systemctl stop opclaw-backend
systemctl stop opclaw-metrics
systemctl stop nginx
systemctl stop postgresql
systemctl stop redis-server

# 2. Start database
systemctl start postgresql
systemctl start redis-server

# 3. Wait for databases to be ready
sleep 5

# 4. Start backend
systemctl start opclaw-backend

# 5. Start metrics
systemctl start opclaw-metrics

# 6. Start nginx
systemctl start nginx

# 7. Verify all services
systemctl status opclaw-backend opclaw-metrics nginx postgresql redis-server
```

---

Remember to always backup before making changes, and test procedures in a non-production environment first when possible.
