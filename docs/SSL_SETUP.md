# SSL/TLS Setup Guide for renava.cn

## Overview

This guide provides comprehensive instructions for setting up SSL/TLS certificates for the renava.cn domain using Let's Encrypt and Certbot.

## Prerequisites

### Before You Begin

1. **DNS Configuration**: DNS records must be configured and propagated
   - A record for `renava.cn` → `118.25.0.190`
   - A record for `www.renava.cn` → `118.25.0.190`
   - A record for `api.renava.cn` → `118.25.0.190`

2. **Server Access**: SSH access to the server with root or sudo privileges

3. **HTTP Access**: Server must be accessible via HTTP (port 80)
   - Firewall must allow HTTP traffic
   - Nginx must be running and configured

4. **Nginx Configuration**: Nginx configuration files must be in place
   - `/etc/nginx/sites-available/opclaw`
   - `/etc/nginx/sites-enabled/opclaw`

### Verify Prerequisites

```bash
# Check DNS resolution
dig renava.cn
dig www.renava.cn
dig api.renava.cn

# Check HTTP access
curl -I http://renava.cn

# Check Nginx status
systemctl status nginx

# Check firewall
ufw status
# or
firewall-cmd --list-all
```

## Quick Start

### Automated Setup (Recommended)

The easiest way to set up SSL is to use the automated setup script:

```bash
# Navigate to scripts directory
cd /path/to/AIOpc/scripts/cloud

# Run the setup script
sudo ./setup-ssl.sh
```

The script will:
1. Check DNS configuration
2. Install Certbot (if not installed)
3. Request SSL certificate from Let's Encrypt
4. Configure Nginx for SSL
5. Set up automatic renewal
6. Verify the installation

### Manual Setup

If you prefer manual setup or need to customize the installation:

```bash
# 1. Install Certbot
sudo apt update
sudo apt install -y certbot python3-certbot-nginx

# 2. Create webroot for ACME challenge
sudo mkdir -p /var/www/certbot
sudo chown -R www-data:www-data /var/www/certbot

# 3. Request certificate
sudo certbot certonly --webroot -w /var/www/certbot \
  -d renava.cn -d www.renava.cn -d api.renava.cn \
  --email admin@renava.cn \
  --agree-tos \
  --non-interactive

# 4. Verify certificate
sudo certbot certificates

# 5. Reload Nginx
sudo systemctl reload nginx

# 6. Enable auto-renewal
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

## Certificate Details

### Certificate Locations

After successful installation, certificates will be stored at:

```
Certificate: /etc/letsencrypt/live/renava.cn/fullchain.pem
Private Key: /etc/letsencrypt/live/renava.cn/privkey.pem
Chain File:   /etc/letsencrypt/live/renava.cn/chain.pem
```

### Certificate Information

- **Issuer**: Let's Encrypt
- **Validity**: 90 days (auto-renewed)
- **Domains Covered**:
  - renava.cn
  - www.renava.cn
  - api.renava.cn

## Nginx SSL Configuration

### SSL Configuration Block

The Nginx configuration includes:

```nginx
# SSL Certificate paths
ssl_certificate /etc/letsencrypt/live/renava.cn/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/renava.cn/privkey.pem;

# SSL session configuration
ssl_session_timeout 1d;
ssl_session_cache shared:MozSSL:10m;
ssl_session_tickets off;

# Modern SSL configuration
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
ssl_prefer_server_ciphers off;

# OCSP Stapling
ssl_stapling on;
ssl_stapling_verify on;
```

### Security Headers

The configuration includes security headers:

```nginx
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```

## HTTP to HTTPS Redirect

All HTTP traffic is automatically redirected to HTTPS:

```nginx
server {
    listen 80;
    server_name renava.cn www.renava.cn api.renava.cn;

    # Allow Let's Encrypt ACME challenge
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # Redirect to HTTPS
    location / {
        return 301 https://$server_name$request_uri;
    }
}
```

## Automatic Certificate Renewal

### Certbot Timer

Certbot includes a systemd timer for automatic renewal:

```bash
# Check timer status
sudo systemctl status certbot.timer

# Enable timer (if not enabled)
sudo systemctl enable certbot.timer

# Start timer (if not started)
sudo systemctl start certbot.timer
```

### Renewal Schedule

Certificates are automatically renewed:
- **Check Frequency**: Twice daily
- **Renewal Trigger**: When certificate has less than 30 days validity
- **Auto-Reload**: Nginx is automatically reloaded after renewal

### Manual Renewal

To manually renew certificates:

```bash
# Renew all certificates
sudo certbot renew

# Force renewal (even if not expired)
sudo certbot renew --force-renewal

# Dry-run (test renewal process)
sudo certbot renew --dry-run
```

## Verification

### Run Verification Script

Use the verification script to check SSL configuration:

```bash
# Navigate to scripts directory
cd /path/to/AIOpc/scripts/cloud

# Run verification
sudo ./verify-ssl.sh

# Run with verbose output
sudo ./verify-ssl.sh --verbose

# Check from multiple DNS servers
sudo ./verify-ssl.sh --check-all
```

### Manual Verification

#### 1. Check Certificate Files

```bash
# Check certificate exists
ls -la /etc/letsencrypt/live/renava.cn/

# View certificate details
sudo openssl x509 -in /etc/letsencrypt/live/renava.cn/fullchain.pem -noout -text
```

#### 2. Test HTTPS Access

```bash
# Test main domain
curl -I https://renava.cn

# Test www subdomain
curl -I https://www.renava.cn

# Test API subdomain
curl -I https://api.renava.cn
```

#### 3. Check SSL Configuration

```bash
# Check SSL connection
openssl s_client -connect renava.cn:443 -servername renava.cn

# Check certificate chain
openssl s_client -connect renava.cn:443 -showcerts
```

#### 4. Test HTTP Redirect

```bash
# Should return 301 or 302
curl -I http://renava.cn

# Should follow redirect to HTTPS
curl -L http://renava.cn
```

#### 5. Online SSL Testing

- **SSL Labs**: [https://www.ssllabs.com/ssltest/analyze.html?d=renava.cn](https://www.ssllabs.com/ssltest/analyze.html?d=renava.cn)
- **SSL Checker**: [https://www.sslshopper.com/ssl-checker.html](https://www.sslshopper.com/ssl-checker.html)
- **Let's Debug**: [https://letsdebug.net/](https://letsdebug.net/)

## Troubleshooting

### Certificate Request Fails

**Problem**: Certbot fails to obtain certificate

**Solutions**:

1. **Check DNS Propagation**:
   ```bash
   dig renava.cn
   dig www.renava.cn
   dig api.renava.cn
   ```

2. **Check HTTP Access**:
   ```bash
   curl -I http://renava.cn
   ```

3. **Check Firewall**:
   ```bash
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   ```

4. **Check Nginx Configuration**:
   ```bash
   sudo nginx -t
   sudo systemctl reload nginx
   ```

5. **Use Staging Server** (for testing):
   ```bash
   sudo ./setup-ssl.sh --test
   ```

### Certificate Not Trusted

**Problem**: Browser shows certificate as untrusted

**Solutions**:

1. **Clear Browser Cache**: Clear SSL state in browser
2. **Check System Time**: Ensure system time is correct
3. **Check Certificate Chain**:
   ```bash
   openssl s_client -connect renava.cn:443 -showcerts
   ```

### Auto-Renewal Not Working

**Problem**: Certificates not renewing automatically

**Solutions**:

1. **Check Timer Status**:
   ```bash
   sudo systemctl status certbot.timer
   ```

2. **Test Renewal**:
   ```bash
   sudo certbot renew --dry-run
   ```

3. **Check Renewal Log**:
   ```bash
   sudo tail -f /var/log/letsencrypt/letsencrypt.log
   ```

4. **Manually Renew**:
   ```bash
   sudo certbot renew
   ```

### Mixed Content Warnings

**Problem**: Browser shows mixed content warnings

**Solutions**:

1. **Update All URLs**: Ensure all resources use HTTPS
2. **Check Content Security Policy**: Review CSP headers
3. **Use Relative URLs**: Use protocol-relative URLs (`//example.com`)

## Advanced Configuration

### Wildcard Certificate

For wildcard certificates (`*.renava.cn`), you must use DNS challenge:

```bash
sudo certbot certonly --manual --preferred-challenges dns \
  -d "*.renava.cn" -d "renava.cn" \
  --email admin@renava.cn \
  --agree-tos
```

Note: This requires manual DNS TXT record validation each time.

### Multiple Domains

To secure multiple domains:

```bash
sudo certbot certonly --webroot -w /var/www/certbot \
  -d renava.cn -d www.renava.cn -d api.renava.cn \
  -d app.renava.cn -d admin.renava.cn \
  --email admin@renava.cn \
  --agree-tos
```

### Revoking Certificate

To revoke a certificate:

```bash
sudo certbot revoke --cert-path /etc/letsencrypt/live/renava.cn/cert.pem
```

## Security Best Practices

### 1. Strong SSL Configuration

- Use TLS 1.2 and 1.3 only
- Disable weak ciphers
- Enable OCSP stapling
- Use strong key exchange (ECDHE)

### 2. Security Headers

- HSTS (HTTP Strict Transport Security)
- X-Frame-Options (prevent clickjacking)
- X-Content-Type-Options (prevent MIME sniffing)
- Content Security Policy (CSP)

### 3. Regular Updates

- Keep Nginx updated
- Keep Certbot updated
- Monitor certificate expiry
- Test SSL configuration regularly

### 4. Monitoring

- Set up certificate expiry alerts
- Monitor SSL Labs score
- Check auto-renewal logs
- Test HTTPS access regularly

## Maintenance

### Regular Tasks

**Weekly**:
- Check certificate status: `sudo certbot certificates`
- Monitor renewal logs: `sudo tail -20 /var/log/letsencrypt/letsencrypt.log`

**Monthly**:
- Run verification script: `sudo ./verify-ssl.sh`
- Check SSL Labs rating
- Review security headers

**Quarterly**:
- Update Certbot: `sudo apt update && sudo apt upgrade certbot`
- Review and update SSL configuration
- Test disaster recovery procedures

## Resources

### Official Documentation

- [Let's Encrypt](https://letsencrypt.org/)
- [Certbot Documentation](https://certbot.eff.org/)
- [Nginx SSL Configuration](https://nginx.org/en/docs/http/configuring_https_servers.html)

### Testing Tools

- [SSL Labs](https://www.ssllabs.com/ssltest/)
- [SSL Checker](https://www.sslshopper.com/ssl-checker.html)
- [Let's Debug](https://letsdebug.net/)
- [ Hardenize](https://www.hardenize.com/)

### Security Guidelines

- [Mozilla SSL Configuration Generator](https://ssl-config.mozilla.org/)
- [OWASP TLS Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Transport_Layer_Protection_Cheat_Sheet.html)

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review Certbot logs: `/var/log/letsencrypt/letsencrypt.log`
3. Check Nginx logs: `/var/log/nginx/error.log`
4. Run verification script: `./verify-ssl.sh --verbose`
5. Consult Let's Encrypt community forums

## Checklist

Use this checklist to ensure SSL is properly configured:

- [ ] DNS records configured and propagated
- [ ] HTTP access verified
- [ ] Certificate obtained from Let's Encrypt
- [ ] Certificate files exist in `/etc/letsencrypt/live/renava.cn/`
- [ ] Nginx configured for SSL
- [ ] HTTPS accessible for all domains
- [ ] HTTP redirects to HTTPS
- [ ] Security headers configured
- [ ] Auto-renewal enabled
- [ ] Auto-renewal tested
- [ ] SSL Labs verification passed
- [ ] Verification script passed

---

**Last Updated**: 2026-03-16
**Document Version**: 1.0
**Related Tasks**: TASK-058 (Cloud Deployment - DNS and SSL Configuration)
**Related Documents**:
- `docs/DNS_CONFIGURATION.md` - DNS configuration guide
- `scripts/cloud/setup-ssl.sh` - SSL setup script
- `scripts/cloud/verify-ssl.sh` - SSL verification script
- `config/nginx/opclaw.conf` - Nginx SSL configuration
