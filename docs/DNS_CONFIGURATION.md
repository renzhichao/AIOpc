# DNS Configuration Guide for renava.cn

## Overview

This guide provides step-by-step instructions for configuring DNS records for the renava.cn domain to point to the AIOpc cloud platform server.

## Server Information

- **Domain**: renava.cn
- **Server IP**: 118.25.0.190
- **Required Subdomains**:
  - `renava.cn` (main domain)
  - `www.renava.cn` (www subdomain)
  - `api.renava.cn` (API subdomain)

## Required DNS Records

### A Records (Required)

Create the following A records to point domains to your server:

```
Type: A
Name: @
Value: 118.25.0.190
TTL: 600 (or default)

Type: A
Name: www
Value: 118.25.0.190
TTL: 600 (or default)

Type: A
Name: api
Value: 118.25.0.190
TTL: 600 (or default)
```

### Optional Records

#### Wildcard Subdomain (Optional)
If you want to support all subdomains:

```
Type: A
Name: *
Value: 118.25.0.190
TTL: 600
```

#### CNAME for www (Alternative)
Some providers prefer CNAME for www:

```
Type: CNAME
Name: www
Value: renava.cn
TTL: 600
```

## DNS Provider Instructions

### Alibaba Cloud DNS (阿里云DNS)

1. **Login**: Go to [https://dns.console.aliyun.com](https://dns.console.aliyun.com)
2. **Find Domain**: Locate `renava.cn` in your domain list
3. **Click "解析设置" (DNS Settings)**
4. **Add Records**:
   - Click "添加记录" (Add Record)
   - Fill in the form:
     - 记录类型: A
     - 主机记录: @ (for main domain)
     - 记录值: 118.25.0.190
     - TTL: 600 (or use default)
   - Click "确认" (Confirm)
   - Repeat for `www` and `api` subdomains
5. **Save**: Wait for DNS propagation

### Tencent Cloud DNS (腾讯云DNS)

1. **Login**: Go to [https://console.cloud.tencent.com/cns](https://console.cloud.tencent.com/cns)
2. **Find Domain**: Locate `renava.cn` in your domain list
3. **Click "解析" (Resolve)**
4. **Add Records**:
   - Click "添加记录" (Add Record)
   - Fill in the form:
     - 主机记录: @ (for main domain)
     - 记录类型: A
     - 线路类型: 默认 (Default)
     - 记录值: 118.25.0.190
     - TTL: 600 (or use default)
   - Click "保存" (Save)
   - Repeat for `www` and `api` subdomains
5. **Save**: Wait for DNS propagation

### Cloudflare

1. **Login**: Go to [https://dash.cloudflare.com](https://dash.cloudflare.com)
2. **Select Domain**: Click on `renava.cn`
3. **Add Records**:
   - Click "Add Record"
   - Fill in the form:
     - Type: A
     - Name: @ (for main domain)
     - IPv4 address: 118.25.0.190
     - Proxy status: DNS only (gray cloud icon)
     - TTL: Auto
   - Click "Save"
   - Repeat for `www` and `api` subdomains
4. **Save**: Wait for DNS propagation

### GoDaddy

1. **Login**: Go to [https://dcc.godaddy.com/manage/dns](https://dcc.godaddy.com/manage/dns)
2. **Select Domain**: Choose `renava.cn`
3. **Add Records**:
   - Click "Add" or "Add New Record"
   - Select Type: A
   - Fill in:
     - Host: @ (for main domain)
     - Points to: 118.25.0.190
     - TTL: 1 hour (or default)
   - Click "Save"
   - Repeat for `www` and `api` subdomains
4. **Save**: Wait for DNS propagation

### Namecheap

1. **Login**: Go to [https://ap.www.namecheap.com](https://ap.www.namecheap.com)
2. **Domain List**: Click "Manage" next to `renava.cn`
3. **Advanced DNS**: Click "Advanced DNS" tab
4. **Add Records**:
   - Click "Add New Record"
   - Fill in:
     - Type: A Record
     - Host: @ (for main domain)
     - Value: 118.25.0.190
     - TTL: Automatic
   - Click "Save All Changes"
   - Repeat for `www` and `api` subdomains
5. **Save**: Wait for DNS propagation

## DNS Propagation

### What is DNS Propagation?

DNS propagation is the time it takes for DNS changes to be updated across all DNS servers worldwide. This process can take anywhere from 10 minutes to 48 hours.

### Typical Propagation Times

- **Fast**: 10-30 minutes (most DNS providers)
- **Normal**: 1-4 hours (typical)
- **Slow**: Up to 48 hours (rare, but possible)

### Factors Affecting Propagation

1. **DNS Provider**: Some providers update faster than others
2. **ISP DNS Caching**: Your ISP may cache old DNS records
4. **TTL Settings**: Lower TTL values speed up propagation
5. **Geographic Location**: Some regions update faster than others

## DNS Verification

### Command Line Verification

After updating DNS records, verify them using these commands:

#### Using `dig` (Recommended)

```bash
# Check main domain
dig renava.cn

# Check www subdomain
dig www.renava.cn

# Check api subdomain
dig api.renava.cn

# Check specific DNS server (Google DNS)
dig @8.8.8.8 renava.cn

# Check specific DNS server (Cloudflare DNS)
dig @1.1.1.1 renava.cn

# Check for A records only
dig renava.cn A +short
```

#### Using `nslookup`

```bash
# Check main domain
nslookup renava.cn

# Check specific DNS server
nslookup renava.cn 8.8.8.8
```

#### Using `host`

```bash
# Check main domain
host renava.cn

# Check with verbose output
host -v renava.cn
```

### Online DNS Verification Tools

- **DNSChecker**: [https://dnschecker.org/](https://dnschecker.org/)
  - Enter domain: `renava.cn`
  - Select record type: `A`
  - Check propagation worldwide

- **MXToolbox**: [https://mxtoolbox.com/DNSLookup.aspx](https://mxtoolbox.com/DNSLookup.aspx)
  - Enter domain: `renava.cn`
  - Click "DNS Lookup"

- **WhatsMyDNS**: [https://www.whatsmydns.net/](https://www.whatsmydns.net/)
  - Enter domain: `renava.cn`
  - Select record type: `A`
  - Check global propagation

### Expected Results

After DNS propagation, you should see:

```
$ dig renava.cn +short

118.25.0.190
```

For all three domains:
- `renava.cn` → `118.25.0.190`
- `www.renava.cn` → `118.25.0.190`
- `api.renava.cn` → `118.25.0.190`

## Troubleshooting

### DNS Not Propagating

**Problem**: DNS records not updating

**Solutions**:
1. **Wait Longer**: DNS propagation can take up to 48 hours
2. **Check TTL**: Lower TTL values before making changes
3. **Clear DNS Cache**:
   ```bash
   # Clear DNS cache on Linux
   sudo systemd-resolve --flush-caches

   # Clear DNS cache on macOS
   sudo dscacheutil -flushcache
   sudo killall -HUP mDNSResponder
   ```
4. **Try Different DNS Servers**:
   - Use Google DNS (8.8.8.8)
   - Use Cloudflare DNS (1.1.1.1)
5. **Verify DNS Configuration**: Double-check records in DNS provider console

### DNS Points to Wrong IP

**Problem**: DNS resolves to incorrect IP address

**Solutions**:
1. **Check DNS Records**: Verify A records in DNS provider
2. **Check for CNAME**: CNAME records override A records
3. **Wait for Propagation**: Recent changes may not have propagated
4. **Clear Local Cache**: Clear DNS cache on your computer

### Partial Propagation

**Problem**: DNS works for some but not all users

**Solutions**:
1. **Wait**: Some DNS servers update slower than others
2. **Check TTL**: Lower TTL for faster updates
3. **Verify Multiple DNS Servers**: Test with different DNS servers
4. **Use Online Tools**: Check propagation status worldwide

## Next Steps

After DNS configuration is complete and verified:

1. **Update TASK_LIST_005**: Mark DNS configuration as complete
2. **Run SSL Setup**: Execute `scripts/cloud/setup-ssl.sh`
3. **Verify HTTPS**: Use `scripts/cloud/verify-ssl.sh`
4. **Test Access**: Verify HTTPS access to all subdomains

## Additional Resources

- [What is DNS?](https://www.cloudflare.com/learning/dns/what-is-dns/)
- [DNS Propagation Explained](https://www.cloudflare.com/learning/dns/dns-records/dns-propagation/)
- [How to Check DNS Propagation](https://www.keycdn.com/blog/dns-propagation-check/)
- [DNS Record Types Explained](https://www.cloudflare.com/learning/dns/dns-records/)

## Checklist

Use this checklist to ensure DNS is properly configured:

- [ ] DNS A records created for `renava.cn`
- [ ] DNS A records created for `www.renava.cn`
- [ ] DNS A records created for `api.renava.cn`
- [ ] DNS records verified with `dig` command
- [ ] DNS propagation verified with online tools
- [ ] All three domains resolve to `118.25.0.190`
- [ ] Ready to proceed with SSL certificate setup

---

**Last Updated**: 2026-03-16
**Document Version**: 1.0
**Related Tasks**: TASK-058 (Cloud Deployment - DNS and SSL Configuration)
