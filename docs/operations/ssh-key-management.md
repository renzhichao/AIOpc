# SSH Key Management Guide

## Overview

This guide covers SSH key management for AIOpc multi-tenant deployments, including key generation, rotation, auditing, and security best practices.

## Table of Contents

1. [Quick Start](#quick-start)
2. [SSH Key Scripts](#ssh-key-scripts)
3. [Key Rotation Schedule](#key-rotation-schedule)
4. [Security Best Practices](#security-best-practices)
5. [Troubleshooting](#troubleshooting)
6. [API Reference](#api-reference)

## Quick Start

### Initial Setup

```bash
# Setup SSH key for a new tenant
scripts/security/setup-ssh-key.sh tenant_001

# Setup with GitHub Secrets integration
scripts/security/setup-ssh-key.sh tenant_001 --github --test

# Setup with RSA key instead of ED25519
scripts/security/setup-ssh-key.sh tenant_001 --type rsa
```

### List SSH Keys

```bash
# List all SSH keys
scripts/security/list-ssh-keys.sh --all

# List keys for specific tenant
scripts/security/list-ssh-keys.sh --tenant tenant_001

# List with detailed information
scripts/security/list-ssh-keys.sh --all --format detailed

# List in JSON format
scripts/security/list-ssh-keys.sh --all --format json
```

### Test SSH Connection

```bash
# Test SSH connection
scripts/security/test-ssh-key.sh tenant_001

# Test with verbose output
scripts/security/test-ssh-key.sh tenant_001 --verbose --commands

# Test with custom timeout
scripts/security/test-ssh-key.sh tenant_001 --timeout 15
```

## SSH Key Scripts

### setup-ssh-key.sh

Initialize SSH keys for new tenant deployments.

**Usage:**
```bash
scripts/security/setup-ssh-key.sh <tenant_id> [options]
```

**Options:**
- `--type TYPE` - Key type (ed25519|rsa) [default: ed25519]
- `--comment COMMENT` - Key comment [default: auto-generated]
- `--github` - Update GitHub Secrets (requires gh CLI)
- `--test` - Test SSH connection after setup
- `--force` - Overwrite existing key
- `-v, --verbose` - Show detailed output

**Examples:**
```bash
# Basic setup
scripts/security/setup-ssh-key.sh tenant_001

# Setup with GitHub integration and testing
scripts/security/setup-ssh-key.sh tenant_001 --github --test

# Setup with RSA key
scripts/security/setup-ssh-key.sh tenant_001 --type rsa --comment "Production key"
```

**Output:**
```
SSH Key Setup Plan
======================================
Tenant ID: tenant_001
Key Type: ed25519
Key Comment: auto-generated
Key Path: /Users/user/.ssh/tenant_001_key
Update GitHub: false
Test Connection: false
Force Overwrite: false
======================================

✓ SSH key generated: /Users/user/.ssh/tenant_001_key
✓ Fingerprint: SHA256:AbCd1234...
✓ SSH key deployed to root@server.com:22
✓ SSH connection test successful
✓ Key creation recorded to audit log
```

### rotate-ssh-key.sh

Rotate SSH keys for tenant deployments with automated deployment and audit logging.

**Usage:**
```bash
scripts/security/rotate-ssh-key.sh [options]
```

**Options:**
- `--tenant TID` - Rotate key for specific tenant
- `--all` - Rotate keys for all tenants
- `--type TYPE` - Key type (ed25519|rsa) [default: ed25519]
- `--days N` - Auto-rotate keys older than N days [default: 90]
- `--dry-run` - Show what would be done without making changes
- `--force` - Skip confirmation prompts
- `--keep-old` - Keep old key (don't remove from servers)
- `--archive-dir DIR` - Archive directory [default: /var/backups/ssh-keys]
- `--github` - Update GitHub Secrets (requires gh CLI)
- `--no-backup` - Skip backup of old key
- `-v, --verbose` - Show detailed output

**Examples:**
```bash
# Rotate key for specific tenant
scripts/security/rotate-ssh-key.sh --tenant tenant_001

# Rotate all keys older than 90 days
scripts/security/rotate-ssh-key.sh --all --days 90

# Dry-run to see what would be done
scripts/security/rotate-ssh-key.sh --all --dry-run --verbose

# Rotate with GitHub integration
scripts/security/rotate-ssh-key.sh --tenant tenant_001 --github
```

**Workflow:**
1. Generate new key pair
2. Test new key connectivity
3. Deploy new key to servers
4. Update GitHub Secrets (if --github)
5. Verify all operations work with new key
6. Archive old key (encrypt and store)
7. Remove old key from servers
8. Record rotation to audit log

### list-ssh-keys.sh

List SSH keys for tenants with detailed information.

**Usage:**
```bash
scripts/security/list-ssh-keys.sh [options]
```

**Options:**
- `--tenant TID` - Show keys for specific tenant
- `--all` - Show all tenant keys
- `--include-expired` - Include expired keys
- `--format FORMAT` - Output format (table|json|csv|detailed)
- `-v, --verbose` - Show detailed information

**Examples:**
```bash
# List all keys in table format
scripts/security/list-ssh-keys.sh --all

# List specific tenant key
scripts/security/list-ssh-keys.sh --tenant tenant_001

# List in JSON format
scripts/security/list-ssh-keys.sh --all --format json

# List with detailed information
scripts/security/list-ssh-keys.sh --tenant tenant_001 --format detailed
```

**Output Format (table):**
```
TENANT_ID       | KEY_TYPE  | FINGERPRINT        | AGE        | STATUS     | LAST_USED
----------------|-----------|--------------------|------------|------------|---------------
tenant_001      | ED25519   | SHA256:AbCd1234... | 45 days    | active     | 2026-03-19
tenant_002      | RSA       | SHA256:XyZa9876... | 95 days    | expired    | Never
```

### audit-ssh-keys.sh

Audit SSH keys for security compliance, expiration, and usage patterns.

**Usage:**
```bash
scripts/security/audit-ssh-keys.sh [options]
```

**Options:**
- `--tenant TID` - Audit specific tenant
- `--all` - Audit all tenants
- `--days N` - Show audit history for last N days [default: 30]
- `--check-expired` - Check for keys expiring within 90 days
- `--report` - Generate detailed audit report
- `--format FORMAT` - Output format (text|json|html)

**Examples:**
```bash
# Audit all tenants
scripts/security/audit-ssh-keys.sh --all

# Generate detailed report
scripts/security/audit-ssh-keys.sh --all --report --format json

# Check for expiring keys
scripts/security/audit-ssh-keys.sh --all --check-expired

# Audit specific tenant
scripts/security/audit-ssh-keys.sh --tenant tenant_001 --days 7
```

**Audit Checks:**
- Key file permissions (must be 600 or 400)
- Key age (warning at 83 days, expired at 90 days)
- Key usage history
- Weak key types (DSA is deprecated)
- Key rotation history

### test-ssh-key.sh

Test SSH key connectivity and functionality.

**Usage:**
```bash
scripts/security/test-ssh-key.sh <tenant_id> [options]
```

**Options:**
- `--verbose` - Show detailed connection test
- `--timeout N` - Connection timeout in seconds [default: 10]
- `--commands` - Test basic commands on remote server
- `--check-permissions` - Check key file permissions

**Examples:**
```bash
# Test SSH connection
scripts/security/test-ssh-key.sh tenant_001

# Test with verbose output and command testing
scripts/security/test-ssh-key.sh tenant_001 --verbose --commands

# Test with custom timeout
scripts/security/test-ssh-key.sh tenant_001 --timeout 15

# Test permissions only
scripts/security/test-ssh-key.sh tenant_001 --check-permissions
```

**Connection Tests:**
- Basic SSH connectivity
- Latency measurement
- Remote command execution (pwd, whoami, uname, uptime)
- Server information gathering (hostname, OS, CPU, memory, disk)

## Key Rotation Schedule

### Recommended Rotation Intervals

| Environment | Rotation Frequency | Warning Threshold |
|-------------|-------------------|-------------------|
| Production | 90 days | 83 days (7 days before) |
| Staging | 90 days | 83 days (7 days before) |
| Development | 180 days | 173 days (7 days before) |

### Automated Rotation

```bash
# Setup cron job for automatic rotation
# Add to crontab: crontab -e

# Check weekly for keys nearing expiration
0 9 * * 1 /path/to/scripts/security/audit-ssh-keys.sh --all --check-expired

# Rotate expired keys weekly
0 10 * * 1 /path/to/scripts/security/rotate-ssh-key.sh --all --days 90 --force
```

### Manual Rotation Procedure

1. **Pre-rotation checklist:**
   ```bash
   # Check current key status
   scripts/security/list-ssh-keys.sh --all

   # Run security audit
   scripts/security/audit-ssh-keys.sh --all --check-expired
   ```

2. **Perform rotation:**
   ```bash
   # Dry-run first
   scripts/security/rotate-ssh-key.sh --tenant tenant_001 --dry-run --verbose

   # Actual rotation
   scripts/security/rotate-ssh-key.sh --tenant tenant_001 --github --test
   ```

3. **Post-rotation verification:**
   ```bash
   # Test new key
   scripts/security/test-ssh-key.sh tenant_001 --verbose --commands

   # Verify audit log
   scripts/security/audit-ssh-keys.sh --tenant tenant_001 --days 1
   ```

## Security Best Practices

### Key Generation

1. **Use ED25519 keys by default:**
   - Faster and more secure than RSA
   - Smaller key size (256 bits vs 4096 bits)
   - Better performance

2. **Key comment format:**
   ```bash
   # Recommended format
   ssh-keygen -t ed25519 -C "tenant_001-user@company-$(date +%Y%m%d)"

   # Examples
   ssh-keygen -t ed25519 -C "production-tenant_001-admin@company-20260319"
   ssh-keygen -t ed25519 -C "staging-tenant_002-deploy@company-20260319"
   ```

### Key Storage

1. **Private key permissions:**
   ```bash
   # Must be 600 or 400
   chmod 600 ~/.ssh/tenant_001_key
   chmod 400 ~/.ssh/tenant_001_key
   ```

2. **Public key permissions:**
   ```bash
   # Must be 644
   chmod 644 ~/.ssh/tenant_001_key.pub
   ```

3. **Key locations:**
   ```
   ~/.ssh/tenant_id_key          # Standard location
   ~/.ssh/id_tenant_id           # Alternative
   ~/.ssh/tenant_id              # Short form
   ```

### Key Rotation

1. **Rotation triggers:**
   - Scheduled rotation (every 90 days)
   - Security incident or compromise
   - Personnel changes
   - System migration

2. **Rollback procedure:**
   ```bash
   # List archived keys
   ls -la /var/backups/ssh-keys/tenant_001/

   # Decrypt and restore old key
   openssl enc -d -aes-256-cbc -pbkdf2 \
     -in /var/backups/ssh-keys/tenant_001/ssh_key_20260319_120000.tar.gz \
     -k "$(hostname)_tenant_001" \
     | tar -xz

   # Deploy restored key
   scripts/security/setup-ssh-key.sh tenant_001 --force
   ```

### Access Control

1. **Limit key distribution:**
   - Only distribute to authorized personnel
   - Use separate keys for different environments
   - Document key ownership and purpose

2. **Monitor key usage:**
   ```bash
   # Check recent key usage
   scripts/security/audit-ssh-keys.sh --all --days 7

   # Identify unused keys
   scripts/security/audit-ssh-keys.sh --all --check-expired
   ```

3. **Revoke compromised keys:**
   ```bash
   # Remove from servers
   ssh root@server "sed -i '/FINGERPRINT/d' ~/.ssh/authorized_keys"

   # Remove from local storage
   rm -f ~/.ssh/compromised_key*
   ```

## Troubleshooting

### Connection Issues

**Problem:** SSH connection fails with "Permission denied (publickey)"

**Solutions:**
```bash
# 1. Verify key exists and has correct permissions
ls -la ~/.ssh/tenant_001_key
chmod 600 ~/.ssh/tenant_001_key

# 2. Test SSH connection with verbose output
ssh -i ~/.ssh/tenant_001_key -v user@server

# 3. Verify public key is deployed on server
ssh user@server "cat ~/.ssh/authorized_keys"

# 4. Check SSH server configuration
ssh user@server "grep -E 'PubkeyAuthentication|AuthorizedKeysFile' /etc/ssh/sshd_config"
```

**Problem:** SSH connection times out

**Solutions:**
```bash
# 1. Test with increased timeout
scripts/security/test-ssh-key.sh tenant_001 --timeout 30

# 2. Check network connectivity
ping server
telnet server 22

# 3. Verify firewall rules
sudo ufw status
sudo iptables -L -n | grep 22
```

### Key Issues

**Problem:** Key generation fails

**Solutions:**
```bash
# 1. Check disk space
df -h ~/.ssh

# 2. Verify permissions on .ssh directory
chmod 700 ~/.ssh

# 3. Try different key type
scripts/security/setup-ssh-key.sh tenant_001 --type rsa
```

**Problem:** Key rotation fails

**Solutions:**
```bash
# 1. Run in dry-run mode first
scripts/security/rotate-ssh-key.sh --tenant tenant_001 --dry-run --verbose

# 2. Check old key status
scripts/security/test-ssh-key.sh tenant_001 --verbose

# 3. Verify backup directory exists
mkdir -p /var/backups/ssh-keys
chmod 700 /var/backups/ssh-keys

# 4. Force rotation with error preservation
scripts/security/rotate-ssh-key.sh --tenant tenant_001 --force --keep-old
```

### Permission Issues

**Problem:** Insecure key file permissions

**Solutions:**
```bash
# 1. Fix permissions
chmod 600 ~/.ssh/tenant_001_key
chmod 644 ~/.ssh/tenant_001_key.pub

# 2. Fix .ssh directory permissions
chmod 700 ~/.ssh

# 3. Check ownership
ls -la ~/.ssh/
sudo chown -R $USER:$USER ~/.ssh/
```

### Audit Issues

**Problem:** Audit log not recording events

**Solutions:**
```bash
# 1. Verify state database connection
source scripts/lib/state.sh
state_init

# 2. Check ssh_key_audit table exists
psql -h localhost -U postgres -d deployment_state -c "\d ssh_key_audit"

# 3. Test audit function
source scripts/lib/state.sh
record_security_audit "test_tenant" "key_rotation" "test_user" "test_action" "ssh_key" "test_fp"
```

## API Reference

### Key Generation Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| Key Type | string | ed25519 | SSH key type (ed25519 or rsa) |
| Key Size | int | - | RSA key size in bits (4096 for RSA) |
| Comment | string | auto-generated | Key comment/label |
| Password | string | empty | Private key encryption password (not recommended) |

### Key Rotation Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| Key Age Threshold | int | 90 | Rotate keys older than N days |
| Warning Threshold | int | 83 | Warn N days before expiration |
| Backup Directory | string | /var/backups/ssh-keys | Archive location for old keys |
| Encryption | string | AES-256-CBC | Archive encryption algorithm |

### Audit Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| Audit Period | int | 30 | Number of days to audit |
| Expiration Warning | int | 90 | Days before key is considered expired |
| Usage Tracking | boolean | true | Track key usage in audit log |

### State Database Schema

**Table: ssh_key_audit**

| Column | Type | Description |
|--------|------|-------------|
| audit_id | SERIAL | Primary key |
| tenant_id | VARCHAR(255) | Tenant identifier |
| ssh_key_name | VARCHAR(255) | SSH key name |
| ssh_key_fingerprint | VARCHAR(255) | SSH key fingerprint |
| ssh_key_type | VARCHAR(50) | Key type (RSA/ED25519/ECDSA) |
| action | VARCHAR(50) | Action (created/accessed/revoked/rotated/expired) |
| actor | VARCHAR(255) | User who performed action |
| server_host | VARCHAR(255) | Server hostname |
| access_granted_at | TIMESTAMP | When access was granted |
| access_revoked_at | TIMESTAMP | When access was revoked |
| last_used_at | TIMESTAMP | Last time key was used |
| key_status | VARCHAR(50) | Key status (active/revoked/expired/compromised) |
| access_reason | TEXT | Reason for access |
| ip_address | INET | IP address of access |
| audit_timestamp | TIMESTAMP | When audit record was created |

## Additional Resources

- [OpenSSH Documentation](https://www.openssh.com/manual.html)
- [SSH Key Best Practices](https://www.ssh.com/academy/ssh/key)
- [NIST SSH Key Management Guidelines](https://csrc.nist.gov/publications/detail/sp/800-57-part-1/rev-5/final)
