# SSH Key Rotation Procedure

## Overview

This document provides detailed procedures for SSH key rotation in AIOpc multi-tenant deployments, including emergency rotation, scheduled rotation, and rollback procedures.

## Table of Contents

1. [Pre-rotation Checklist](#pre-rotation-checklist)
2. [Scheduled Rotation Procedure](#scheduled-rotation-procedure)
3. [Emergency Rotation Procedure](#emergency-rotation-procedure)
4. [Rollback Procedure](#rollback-procedure)
5. [Verification Steps](#verification-steps)
6. [Troubleshooting](#troubleshooting)
7. [Incident Response](#incident-response)

## Pre-rotation Checklist

### 1. Environment Assessment

```bash
# List all current SSH keys
scripts/security/list-ssh-keys.sh --all --format detailed

# Audit SSH keys for security issues
scripts/security/audit-ssh-keys.sh --all --check-expired

# Check for keys approaching expiration
scripts/security/audit-ssh-keys.sh --all --days 90
```

### 2. Backup Verification

```bash
# Verify backup directory exists and is writable
ls -la /var/backups/ssh-keys/
df -h /var/backups/

# Create backup directory if needed
sudo mkdir -p /var/backups/ssh-keys
sudo chmod 700 /var/backups/ssh-keys
```

### 3. Access Verification

```bash
# Test current SSH access
scripts/security/test-ssh-key.sh tenant_001 --verbose

# Verify server accessibility
ssh -i ~/.ssh/tenant_001_key user@server "echo 'OK'"

# Check server disk space
ssh user@server "df -h /"
```

### 4. Documentation Review

- [ ] Review tenant configuration files
- [ ] Document current key fingerprints
- [ ] Identify key owners and users
- [ ] Schedule maintenance window
- [ ] Notify stakeholders

## Scheduled Rotation Procedure

### Phase 1: Preparation (T-7 days)

1. **Identify keys for rotation**
   ```bash
   # Find keys older than 83 days
   scripts/security/list-ssh-keys.sh --all | awk '$4 >= 83 days {print $1}'
   ```

2. **Schedule maintenance window**
   - Choose low-traffic period
   - Allow 2-hour window for rotation
   - Notify all stakeholders

3. **Prepare rotation plan**
   ```bash
   # Generate rotation plan (dry-run)
   scripts/security/rotate-ssh-key.sh --all --days 90 --dry-run --verbose > rotation_plan.txt
   ```

### Phase 2: Execution (Maintenance Window)

1. **Pre-rotation verification**
   ```bash
   # Verify all systems accessible
   for tenant in tenant_001 tenant_002 tenant_003; do
       scripts/security/test-ssh-key.sh "$tenant" --commands
   done
   ```

2. **Execute rotation**
   ```bash
   # Rotate all expired keys
   scripts/security/rotate-ssh-key.sh --all --days 90 --github --verbose
   ```

3. **Monitor progress**
   - Watch for error messages
   - Verify each key rotation
   - Check audit logs

### Phase 3: Verification (T+1 hour)

```bash
# Test all new keys
for tenant in tenant_001 tenant_002 tenant_003; do
    scripts/security/test-ssh-key.sh "$tenant" --verbose --commands
done

# Verify audit logs
scripts/security/audit-ssh-keys.sh --all --days 1 --report

# Check for failed rotations
scripts/security/audit-ssh-keys.sh --all --check-expired
```

### Phase 4: Cleanup (T+24 hours)

```bash
# Verify old keys removed from servers
for tenant in tenant_001 tenant_002 tenant_003; do
    ssh user@server "grep -v 'OLD_FINGERPRINT' ~/.ssh/authorized_keys"
done

# Archive rotation logs
mv rotation_*.log /var/backups/ssh-keys/logs/

# Update documentation
echo "$(date): Completed scheduled rotation" >> /var/backups/ssh-keys/rotation_history.log
```

## Emergency Rotation Procedure

### Trigger Conditions

Execute emergency rotation when:
- SSH key compromise suspected or confirmed
- Unauthorized access detected
- Key exposed in logs or repositories
- Personnel security incident
- Malware infection on management system

### Immediate Response (T+0)

1. **Isolate affected systems**
   ```bash
   # Revoke affected keys immediately
   ssh root@server "sed -i '/COMPROMISED_FINGERPRINT/d' ~/.ssh/authorized_keys"
   ```

2. **Assess scope**
   ```bash
   # Check which tenants use affected key
   grep -r "COMPROMISED_FINGERPRINT" config/tenants/*.yml
   ```

3. **Notify security team**
   - Document incident
   - Identify affected systems
   - Begin incident response log

### Emergency Rotation (T+15 minutes)

1. **Generate emergency keys**
   ```bash
   # Rotate affected tenant keys immediately
   scripts/security/rotate-ssh-key.sh --tenant tenant_001 --force --no-backup
   ```

2. **Update all systems**
   ```bash
   # Deploy new keys to all servers
   scripts/security/setup-ssh-key.sh tenant_001 --force --test
   ```

3. **Verify access**
   ```bash
   # Test new keys
   scripts/security/test-ssh-key.sh tenant_001 --verbose
   ```

### Post-Incident (T+24 hours)

1. **Security audit**
   ```bash
   # Full security audit of all tenants
   scripts/security/audit-ssh-keys.sh --all --days 1 --report
   ```

2. **Incident documentation**
   - Write incident report
   - Document timeline
   - Identify root cause
   - Implement preventive measures

3. **Rotate all keys (if compromise widespread)**
   ```bash
   # Rotate all tenant keys as precaution
   scripts/security/rotate-ssh-key.sh --all --force --days 0
   ```

## Rollback Procedure

### When to Rollback

- New key deployment fails
- Connection issues after rotation
- Application errors post-rotation
- Performance degradation

### Rollback Steps

1. **Identify backup key**
   ```bash
   # List archived keys
   ls -la /var/backups/ssh-keys/tenant_001/
   ```

2. **Decrypt backup key**
   ```bash
   # Extract and decrypt archived key
   cd /tmp
   openssl enc -d -aes-256-cbc -pbkdf2 \
     -in /var/backups/ssh-keys/tenant_001/ssh_key_TIMESTAMP.tar.gz \
     -k "$(hostname)_tenant_001" \
     | tar -xz

   # Verify key integrity
   ssh-keygen -lf tenant_001_key.pub
   ```

3. **Deploy old key**
   ```bash
   # Restore old key to standard location
   cp tenant_001_key ~/.ssh/tenant_001_key
   cp tenant_001_key.pub ~/.ssh/tenant_001_key.pub
   chmod 600 ~/.ssh/tenant_001_key
   chmod 644 ~/.ssh/tenant_001_key.pub
   ```

4. **Update servers**
   ```bash
   # Deploy old key to server
   scripts/security/setup-ssh-key.sh tenant_001 --force --test
   ```

5. **Verify rollback**
   ```bash
   # Test connection with restored key
   scripts/security/test-ssh-key.sh tenant_001 --verbose --commands
   ```

6. **Document rollback**
   ```bash
   # Log rollback incident
   echo "$(date): Rolled back tenant_001 key rotation due to REASON" \
     >> /var/backups/ssh-keys/rollback_log.txt
   ```

## Verification Steps

### Post-Rotation Verification

1. **Connection Testing**
   ```bash
   # Test all tenant connections
   for tenant in $(scripts/tenant/list.sh --format plain); do
       scripts/security/test-ssh-key.sh "$tenant" --commands
   done
   ```

2. **Functionality Testing**
   ```bash
   # Test deployment scripts
   scripts/deploy/deploy-tenant.sh tenant_001 --dry-run

   # Test health checks
   scripts/tenant/health-check.sh tenant_001
   ```

3. **Audit Log Verification**
   ```bash
   # Verify rotation recorded in audit log
   scripts/security/audit-ssh-keys.sh --all --days 1 --report
   ```

4. **Security Verification**
   ```bash
   # Run full security audit
   scripts/security/audit-ssh-keys.sh --all --check-expired

   # Verify no weak keys
   scripts/security/audit-ssh-keys.sh --all | grep -i "weak"
   ```

### Performance Verification

1. **Latency Testing**
   ```bash
   # Measure SSH connection latency
   for i in {1..10}; do
       time ssh -i ~/.ssh/tenant_001_key user@server "echo OK"
   done
   ```

2. **Load Testing**
   ```bash
   # Test concurrent connections
   for i in {1..5}; do
       ssh -i ~/.ssh/tenant_001_key user@server "uptime" &
   done
   wait
   ```

## Troubleshooting

### Rotation Failures

**Problem:** Rotation fails at key generation

**Diagnosis:**
```bash
# Check disk space
df -h ~/.ssh

# Verify permissions
ls -la ~/.ssh

# Check system logs
tail -f /var/log/system.log | grep -i ssh
```

**Solution:**
```bash
# Free disk space
sudo rm -rf /var/backups/ssh-keys/old_backups

# Fix permissions
chmod 700 ~/.ssh
chmod 600 ~/.ssh/*
```

**Problem:** Rotation fails at deployment

**Diagnosis:**
```bash
# Test server connectivity
ping server
telnet server 22

# Check server disk space
ssh user@server "df -h"

# Verify server SSH config
ssh user@server "sudo grep -E 'PubkeyAuthentication|AuthorizedKeysFile' /etc/ssh/sshd_config"
```

**Solution:**
```bash
# Increase connection timeout
scripts/security/rotate-ssh-key.sh --tenant tenant_001 --verbose

# Check server firewall
sudo ufw status
sudo iptables -L -n | grep 22
```

### Verification Failures

**Problem:** New key not working after rotation

**Diagnosis:**
```bash
# Verify key deployed on server
ssh user@server "cat ~/.ssh/authorized_keys"

# Test with verbose SSH
ssh -i ~/.ssh/tenant_001_key -v user@server

# Check server SSH logs
ssh user@server "sudo tail -f /var/log/auth.log"
```

**Solution:**
```bash
# Manually deploy key
cat ~/.ssh/tenant_001_key.pub | \
    ssh user@server "cat >> ~/.ssh/authorized_keys"

# Restart SSH service
ssh user@server "sudo systemctl restart sshd"
```

### Audit Issues

**Problem:** Rotation not recorded in audit log

**Diagnosis:**
```bash
# Check state database connection
source scripts/lib/state.sh
state_init

# Verify audit table exists
psql -h localhost -U postgres -d deployment_state -c "\d ssh_key_audit"
```

**Solution:**
```bash
# Reinitialize state database
scripts/state/setup-state-db.sh -y

# Manually record rotation
source scripts/lib/state.sh
record_security_audit "tenant_001" "key_rotation" "admin" "rotated" \
    "ssh_key" "NEW_FINGERPRINT" "" "" "" "OLD_FINGERPRINT"
```

## Incident Response

### Security Incident Categories

1. **Key Compromise**
   - Unauthorized access detected
   - Key found in public repository
   - Key exposed in logs

2. **System Compromise**
   - Malware on management system
   - Unauthorized system access
   - Root-level compromise

3. **Insider Threat**
   - Disgruntled employee
   - Unauthorized key use
   - Policy violations

### Incident Response Timeline

**T+0: Detection**
- Identify incident
- Activate response team
- Begin documentation

**T+15 minutes: Containment**
- Revoke affected keys
- Isolate affected systems
- Prevent further access

**T+1 hour: Eradication**
- Rotate all affected keys
- Scan for malware
- Patch vulnerabilities

**T+4 hours: Recovery**
- Deploy new keys
- Verify access
- Monitor for anomalies

**T+24 hours: Post-Incident**
- Complete security audit
- Document lessons learned
- Update procedures

### Communication Plan

1. **Internal Notification**
   - Security team: Immediate
   - DevOps team: T+15 minutes
   - Management: T+1 hour
   - All staff: T+4 hours

2. **External Notification**
   - Customers: If affected
   - Partners: If affected
   - Authorities: If required

3. **Status Updates**
   - Hourly during incident
   - Summary at resolution
   - Post-mortem within 7 days

## Appendix

### Rotation Templates

**Scheduled Rotation Template:**
```bash
#!/bin/bash
# Scheduled SSH Key Rotation
# Usage: ./scheduled-rotation.sh

DATE=$(date +%Y%m%d)
LOG_FILE="/var/backups/ssh-keys/logs/rotation_${DATE}.log"

echo "[$(date)] Starting scheduled rotation" | tee -a "$LOG_FILE"

# Dry-run first
scripts/security/rotate-ssh-key.sh --all --days 90 --dry-run --verbose 2>&1 | tee -a "$LOG_FILE"

# Execute rotation
scripts/security/rotate-ssh-key.sh --all --days 90 --github --verbose 2>&1 | tee -a "$LOG_FILE"

# Verify
for tenant in $(scripts/tenant/list.sh --format plain); do
    scripts/security/test-ssh-key.sh "$tenant" 2>&1 | tee -a "$LOG_FILE"
done

echo "[$(date)] Rotation complete" | tee -a "$LOG_FILE"
```

**Emergency Rotation Template:**
```bash
#!/bin/bash
# Emergency SSH Key Rotation
# Usage: ./emergency-rotation.sh <tenant_id>

TENANT_ID="$1"
LOG_FILE="/var/backups/ssh-keys/logs/emergency_${TENANT_ID}_$(date +%Y%m%d_%H%M%S).log"

echo "[$(date)] EMERGENCY ROTATION: $TENANT_ID" | tee -a "$LOG_FILE"

# Force rotation with no backup
scripts/security/rotate-ssh-key.sh --tenant "$TENANT_ID" --force --no-backup --verbose 2>&1 | tee -a "$LOG_FILE"

# Verify
scripts/security/test-ssh-key.sh "$TENANT_ID" --verbose --commands 2>&1 | tee -a "$LOG_FILE"

echo "[$(date)] Emergency rotation complete" | tee -a "$LOG_FILE"
```

### Checklists

**Pre-Rotation Checklist:**
- [ ] Backup directory exists and is writable
- [ ] All SSH keys accessible
- [ ] Servers accessible
- [ ] Stakeholders notified
- [ ] Maintenance window scheduled
- [ ] Rollback plan prepared
- [ ] Audit log working

**Post-Rotation Checklist:**
- [ ] All keys tested successfully
- [ ] Audit log updated
- [ ] Old keys archived
- [ ] Documentation updated
- [ ] Stakeholders notified
- [ ] Monitoring enabled
- [ ] Lessons learned documented

### Contact Information

- **Security Team:** security@company.com
- **DevOps Team:** devops@company.com
- **On-Call Engineer:** on-call@company.com
- **Management:** management@company.com
