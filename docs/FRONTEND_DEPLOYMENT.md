# Frontend Deployment Guide

## Overview

This guide covers deploying the React frontend to the AIOpc cloud server.

## Infrastructure

- **Server**: 118.25.0.190 (root@118.25.0.190)
- **Domain**: renava.cn
- **Frontend**: React + Vite
- **Web Server**: Nginx
- **Deployment Path**: /var/www/opclaw

## Prerequisites

### Local Requirements

- Node.js v22+
- pnpm
- rsync
- SSH access to server

### Server Requirements

- Nginx installed and configured
- SSL certificates (optional, recommended)
- www-data user/group

## Quick Start

### Initial Deployment

```bash
# 1. Build and deploy frontend
./scripts/cloud/deploy-frontend.sh

# 2. Verify deployment
./scripts/cloud/verify-frontend.sh

# 3. Setup SSL (if not configured)
./scripts/cloud/setup-ssl.sh
```

### Subsequent Deployments

```bash
# Deploy with existing build
./scripts/cloud/deploy-frontend.sh --skip-build

# Verify deployment
./scripts/cloud/verify-frontend.sh
```

## Deployment Scripts

### deploy-frontend.sh

Main deployment script that builds and uploads the frontend.

**Features**:
- Local build optimization
- Backup before deployment
- Rsync file synchronization
- Nginx configuration
- Deployment verification

**Usage**:
```bash
./scripts/cloud/deploy-frontend.sh [OPTIONS]
```

**Options**:
- `--skip-build` - Skip local build (use existing dist/)
- `--dry-run` - Show what would be done without executing

**Process**:
1. Pre-flight checks (dependencies, SSH connection)
2. Build frontend locally
3. Create backup on server
4. Upload build artifacts via rsync
5. Set permissions (www-data:www-data, 755)
6. Configure Nginx
7. Verify deployment

**Example**:
```bash
# Full deployment
./scripts/cloud/deploy-frontend.sh

# Quick deployment with existing build
./scripts/cloud/deploy-frontend.sh --skip-build

# Dry run to see what would happen
./scripts/cloud/deploy-frontend.sh --dry-run
```

### verify-frontend.sh

Verification script that checks deployment health.

**Features**:
- File deployment verification
- Permission checks
- Nginx configuration validation
- HTTP/HTTPS accessibility tests
- API proxy verification

**Usage**:
```bash
./scripts/cloud/verify-frontend.sh [OPTIONS]
```

**Options**:
- `--verbose` - Show detailed information

**Checks**:
1. File deployment (count and types)
2. index.html presence and validity
3. Asset files (JS, CSS)
4. Permissions (755, www-data:www-data)
5. Directory structure
6. Nginx configuration validity
7. Nginx running status
8. Site enabled status
9. HTTP accessibility
10. HTTPS accessibility
11. API proxy functionality
12. Disk space usage
13. Critical file integrity

**Example**:
```bash
# Standard verification
./scripts/cloud/verify-frontend.sh

# Verbose output
./scripts/cloud/verify-frontend.sh --verbose
```

## Build Configuration

### Vite Config

The `vite.config.ts` is optimized for production:

```typescript
build: {
  outDir: 'dist',
  sourcemap: false,
  minify: 'terser',
  rollupOptions: {
    output: {
      manualChunks: {
        vendor: ['react', 'react-dom', 'react-router-dom'],
        ui: ['recharts']
      }
    }
  },
  chunkSizeWarningLimit: 1000
}
```

**Optimizations**:
- Code splitting (vendor, UI chunks)
- Terser minification
- No source maps (smaller bundles)
- Chunk size warnings at 1MB

### Build Locally vs Remotely

**Why build locally?**
- Faster build times (better local hardware)
- Consistent build environment
- Easier debugging
- Reduced server load

**Build process**:
1. `pnpm install --frozen-lockfile` - Install dependencies
2. `pnpm run build` - Build application
3. Verify `dist/` directory and `index.html`
4. Upload via rsync

## Nginx Configuration

### Configuration File

Location: `/etc/nginx/sites-available/opclaw`

**Key features**:
- HTTP to HTTPS redirect
- Static file serving with caching
- API proxy to backend (port 3000)
- OAuth callback handling
- Security headers
- SSL configuration
- Gzip compression

### Static File Caching

```nginx
# Cache static assets (JS, CSS, images, fonts)
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}

# No cache for HTML files
location ~* \.html$ {
    expires -1;
    add_header Cache-Control "no-cache, no-store, must-revalidate";
}
```

### SPA Routing

```nginx
location / {
    root /var/www/opclaw;
    try_files $uri $uri/ /index.html;
}
```

This ensures React Router works correctly by serving index.html for all routes.

## Deployment Process

### Phase 1: Preparation

1. **Verify local environment**
   ```bash
   node --version  # Should be v22+
   pnpm --version
   rsync --version
   ```

2. **Test SSH connection**
   ```bash
   ssh root@118.25.0.190 "echo 'Connected'"
   ```

3. **Check server requirements**
   ```bash
   ssh root@118.25.0.190 "nginx -v"
   ssh root@118.25.0.190 "systemctl status nginx"
   ```

### Phase 2: Build

```bash
cd platform/frontend

# Install dependencies
pnpm install --frozen-lockfile

# Run tests (optional)
pnpm run test

# Build for production
pnpm run build

# Verify build
ls -la dist/
```

**Expected output**:
```
dist/
├── index.html
├── assets/
│   ├── index-[hash].js
│   ├── index-[hash].css
│   └── ...
```

### Phase 3: Deploy

```bash
# Run deployment script
./scripts/cloud/deploy-frontend.sh
```

**What happens**:
1. Pre-flight checks (dependencies, SSH)
2. Local build (unless --skip-build)
3. Backup existing frontend on server
4. Create directory structure
5. Upload files via rsync
6. Set permissions (755, www-data:www-data)
7. Configure Nginx
8. Verify deployment

### Phase 4: Verify

```bash
# Run verification script
./scripts/cloud/verify-frontend.sh --verbose
```

**Expected output**:
```
=== Frontend Deployment Verification ===

1. Checking deployed files...
✓ Files deployed: 15

2. Checking index.html...
✓ index.html exists
✓ index.html is valid HTML

...

=== Verification Summary ===

Total checks: 13
Passed: 13
Failed: 0

✓ All checks passed! Frontend deployment is healthy.
```

## Troubleshooting

### Build Failures

**Problem**: Build fails with errors

**Solutions**:
```bash
# Clear node_modules and reinstall
cd platform/frontend
rm -rf node_modules
pnpm install

# Clear Vite cache
rm -rf .vite
pnpm run build

# Check Node.js version
node --version  # Should be v22+
```

### SSH Connection Issues

**Problem**: Cannot connect to server

**Solutions**:
```bash
# Test SSH connection
ssh -v root@118.25.0.190

# Check SSH key
ssh-add -l

# Try with password
ssh root@118.25.0.190
```

### Permission Errors

**Problem**: Permission denied on server

**Solutions**:
```bash
# Check ownership
ssh root@118.25.0.190 "ls -la /var/www/opclaw"

# Fix permissions
ssh root@118.25.0.190 "chown -R www-data:www-data /var/www/opclaw"
ssh root@118.25.0.190 "chmod -R 755 /var/www/opclaw"
```

### Nginx Configuration Errors

**Problem**: Nginx configuration test fails

**Solutions**:
```bash
# Test configuration
ssh root@118.25.0.190 "nginx -t"

# Check error log
ssh root@118.25.0.190 "tail -f /var/log/nginx/opclaw-error.log"

# Reload Nginx
ssh root@118.25.0.190 "systemctl reload nginx"
```

### HTTP/HTTPS Issues

**Problem**: Cannot access frontend via browser

**Solutions**:
```bash
# Check HTTP
curl -I http://renava.cn

# Check HTTPS
curl -I https://renava.cn

# Verify SSL certificates
ssh root@118.25.0.190 "certbot certificates"

# Setup SSL if needed
./scripts/cloud/setup-ssl.sh
```

### API Proxy Issues

**Problem**: API calls fail

**Solutions**:
```bash
# Check if backend is running
ssh root@118.25.0.190 "systemctl status opclaw-backend"

# Check API proxy
curl http://renava.cn/api/health

# Verify Nginx configuration
ssh root@118.25.0.190 "grep -A 10 'location /api/' /etc/nginx/sites-available/opclaw"
```

### Deployment Rollback

**Problem**: New deployment breaks the site

**Solutions**:
```bash
# List backups
ssh root@118.25.0.190 "ls -lth /opt/opclaw/backups/frontend/"

# Restore from backup
ssh root@118.25.0.190 "tar -xzf /opt/opclaw/backups/frontend/frontend-YYYYMMDD-HHMMSS.tar.gz -C /var/www"

# Or redeploy with previous commit
git checkout <previous-commit>
./scripts/cloud/deploy-frontend.sh
```

## Monitoring

### Logs

**Nginx access log**:
```bash
ssh root@118.25.0.190 "tail -f /var/log/nginx/opclaw-access.log"
```

**Nginx error log**:
```bash
ssh root@118.25.0.190 "tail -f /var/log/nginx/opclaw-error.log"
```

### Performance

**Check response times**:
```bash
curl -o /dev/null -s -w "%{time_total}\n" http://renava.cn
curl -o /dev/null -s -w "%{time_total}\n" https://renava.cn
```

**Check file sizes**:
```bash
ssh root@118.25.0.190 "du -sh /var/www/opclaw"
```

### Uptime Monitoring

**Simple health check**:
```bash
# Add to cron for monitoring
*/5 * * * * curl -f http://renava.cn/health || echo "Frontend down" | mail -s "Alert" admin@example.com
```

## Best Practices

### Before Deployment

1. **Run tests locally**
   ```bash
   cd platform/frontend
   pnpm run test
   ```

2. **Check build size**
   ```bash
   pnpm run build
   du -sh dist/
   ```

3. **Test build locally**
   ```bash
   pnpm run preview
   ```

4. **Review changes**
   ```bash
   git diff
   ```

### During Deployment

1. **Use --dry-run first**
   ```bash
   ./scripts/cloud/deploy-frontend.sh --dry-run
   ```

2. **Monitor the process**
   - Watch for errors
   - Check backup creation
   - Verify file upload

3. **Verify immediately**
   ```bash
   ./scripts/cloud/verify-frontend.sh
   ```

### After Deployment

1. **Check accessibility**
   - HTTP: http://renava.cn
   - HTTPS: https://renava.cn
   - API: http://renava.cn/api/health

2. **Test key functionality**
   - Page loads
   - Navigation works
   - API calls succeed
   - OAuth flow (if configured)

3. **Monitor logs**
   ```bash
   ssh root@118.25.0.190 "tail -20 /var/log/nginx/opclaw-error.log"
   ```

## Security Considerations

### File Permissions

**Recommended**:
```bash
# Directories: 755
# Files: 644
# Owner: www-data:www-data
```

**Apply**:
```bash
ssh root@118.25.0.190 "chown -R www-data:www-data /var/www/opclaw"
ssh root@118.25.0.190 "find /var/www/opclaw -type d -exec chmod 755 {} \;"
ssh root@118.25.0.190 "find /var/www/opclaw -type f -exec chmod 644 {} \;"
```

### Nginx Security Headers

Already configured in `/etc/nginx/sites-available/opclaw`:

- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security: max-age=63072000`
- `Content-Security-Policy: ...`

### SSL/TLS

**Best practices**:
- Use HTTPS only
- Redirect HTTP to HTTPS
- Keep certificates updated
- Use strong cipher suites

**Setup SSL**:
```bash
./scripts/cloud/setup-ssl.sh
```

**Renew certificates**:
```bash
# Certbot auto-renews via cron
# Manual renewal:
ssh root@118.25.0.190 "certbot renew"
```

## Maintenance

### Regular Tasks

**Weekly**:
- Check deployment health
- Review logs for errors
- Verify SSL certificates

**Monthly**:
- Update dependencies
- Review build sizes
- Performance audit

### Updates

**Update dependencies**:
```bash
cd platform/frontend
pnpm update
pnpm run build
./scripts/cloud/deploy-frontend.sh
```

**Update Nginx config**:
```bash
# Edit config
vim config/nginx/opclaw.conf

# Test locally
nginx -t -c config/nginx/opclaw.conf

# Deploy
./scripts/cloud/deploy-frontend.sh
```

## Related Documentation

- [Backend Deployment](./BACKEND_DEPLOYMENT.md)
- [Database Deployment](./DATABASE_DEPLOYMENT.md)
- [SSL Setup](./SSL_SETUP.md)
- [Cloud Architecture](./CLOUD_ARCHITECTURE.md)

## Support

For issues or questions:
1. Check troubleshooting section
2. Review logs
3. Contact: [Your contact info]

---

**Last Updated**: 2026-03-16
**Version**: 1.0.0
