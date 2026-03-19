# Security Checks Guide
# (安全检查指南)

**Version**: 1.0
**Last Updated**: 2026-03-19
**Author**: TASK-014 Implementation

## Overview

The Security Check Suite is a comprehensive set of tools designed to validate the security posture of tenant configurations before deployment. This guide covers the implementation, usage, and best practices for security checks in the AIOpc multi-tenant deployment platform.

## Table of Contents

1. [Architecture](#architecture)
2. [Security Check Components](#security-check-components)
3. [Usage Guide](#usage-guide)
4. [Integration Points](#integration-points)
5. [Security Policies](#security-policies)
6. [Troubleshooting](#troubleshooting)
7. [Best Practices](#best-practices)

---

## Architecture

### Component Structure

```
scripts/security/
├── check-config-security.sh      # Configuration security checks
├── check-secret-strength.sh      # Secret strength validation
├── check-file-permissions.sh     # File permission verification
├── scan-logs.sh                  # Log scanning for secrets
└── security-check-suite.sh       # Main orchestrator

scripts/tests/
└── test-security-checks.sh       # Test suite
```

### Design Principles

1. **Fail-Safe**: Security failures block deployment by default
2. **Comprehensive**: Covers all major security vectors
3. **Auditable**: All security events logged to state database
4. **Flexible**: Supports selective check execution
5. **Recoverable**: Provides clear guidance for fixing issues

### Data Flow

```
Configuration File
       ↓
Security Check Suite
       ↓
┌─────────────────────────────────┐
│  1. Placeholder Detection       │
│  2. Secret Strength Validation  │
│  3. File Permission Checks      │
│  4. Log Scanning                │
└─────────────────────────────────┘
       ↓
Results Aggregation
       ↓
State Database (Audit Log)
       ↓
Pass/Fail Decision
```

---

## Security Check Components

### 1. Configuration Security Checks

**Script**: `scripts/security/check-config-security.sh`

**Purpose**: Detect placeholder values and security issues in configuration files

**Checks Performed**:
- Placeholder value detection (`cli_xxxxxxxxxxxxx`, `CHANGE_THIS`, etc.)
- Weak password detection (`12345678`, `password`, etc.)
- Default value detection (example domains, test emails)
- Empty critical fields validation
- Suspicious pattern detection (HTTP in production)

**Exit Codes**:
- `0`: All checks passed
- `1`: Security issues found
- `2`: Configuration errors

**Example Usage**:
```bash
./scripts/security/check-config-security.sh config/tenants/tenant001.yml tenant001
```

**Placeholder Patterns Detected**:
```yaml
# Critical placeholders (block deployment)
feishu.app_id: cli_xxxxxxxxxxxxx
feishu.app_secret: CHANGE_THIS
database.password: password
jwt.secret: weak

# Warning placeholders (allow with warning)
feishu.oauth_redirect_uri: http://example.com/callback
server.host: localhost  # in production environment
```

### 2. Secret Strength Validation

**Script**: `scripts/security/check-secret-strength.sh`

**Purpose**: Validate the strength and complexity of secrets

**Requirements**:
- **Database Password**: ≥16 characters, mixed case, numbers, special chars
- **JWT Secret**: ≥32 characters, high entropy (≥80 bits)
- **Feishu App Secret**: ≥28 characters (based on Feishu format)
- **Encryption Key**: ≥24 characters (192 bits minimum)
- **API Keys**: ≥20 characters, non-sequential

**Entropy Calculation**:
```
Entropy = length × log2(character_set_size)

Character Sets:
- Uppercase: 26
- Lowercase: 26
- Digits: 10
- Special: 32
```

**Strength Levels**:
- **Strong**: All requirements met, entropy ≥100 bits
- **Medium**: 1 or 2 missing requirements, or 80-99 bits entropy
- **Weak**: 3+ missing requirements, or <80 bits entropy

**Example Usage**:
```bash
./scripts/security/check-secret-strength.sh config/tenants/tenant001.yml tenant001
```

**Output Example**:
```
✓ database.password (24 chars, 145.20 bits entropy)
✓ jwt.secret (48 chars, 289.76 bits entropy)
✗ feishu.app_secret: too short (12 chars, minimum: 28)
```

### 3. File Permission Checks

**Script**: `scripts/security/check-file-permissions.sh`

**Purpose**: Verify secure file permissions for sensitive files

**Permission Requirements**:
```bash
Configuration files: 600  (rw-------)
SSH private keys:      600  (rw-------)
SSH public keys:       644  (rw-r--r--)
Scripts:              755  (rwxr-xr-x)
Log files:            600  (rw-------) or 640 (rw-r-----)
Directories:          700  (rwx------) or 755 (rwxr-xr-x)
```

**Auto-Fix Capability**:
```bash
# Automatically fix permission issues
./scripts/security/check-file-permissions.sh config/tenants/tenant001.yml tenant001 true
```

**Files Checked**:
- Configuration files (`.yml`, `.env`)
- SSH keys (private and public)
- Project scripts
- Log files
- Project directories

### 4. Log Scanning

**Script**: `scripts/security/scan-logs.sh`

**Purpose**: Detect secrets leaked into log files

**Secret Patterns Detected**:
- JWT tokens: `eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*`
- API keys: `sk-[a-zA-Z0-9]{20,}`, `AIza[A-Za-z0-9_-]{35}`
- Passwords: `password["\s=:]+["\']?[^\s'"'"'"]{8,}`
- Database URLs: `postgresql://[^[:space:]]+:[^[:space:]]+@...`
- Tokens: `token["\s=:]+["\']?[a-zA-Z0-9]{20,}`
- Feishu patterns: `cli_a[a-zA-Z0-9]{14,}`

**Usage Examples**:
```bash
# Scan specific log file
./scripts/security/scan-logs.sh /var/log/opclaw/application.log tenant001

# Scan all common log locations
./scripts/security/scan-logs.sh --all tenant001

# Scan directory
./scripts/security/scan-logs.sh /var/log/opclaw tenant001
```

**Output Example**:
```
WARNING: Secret found: /var/log/opclaw/app.log:42 [jwt_token]
    eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

WARNING: Secret found: /var/log/opclaw/app.log:45 [database_url]
    postgresql://user:********@db.example.com:5432/dbname

✗ Log scan FAILED - Secrets detected
ACTION REQUIRED:
1. Remove secrets from log files
2. Fix logging code to not output secrets
3. Rotate exposed secrets immediately
```

### 5. Security Check Suite (Orchestrator)

**Script**: `scripts/security/security-check-suite.sh`

**Purpose**: Main orchestrator for all security checks

**Options**:
```bash
--all              # Run all checks (default)
--config           # Run configuration checks only
--secrets          # Run secret strength checks only
--permissions      # Run file permission checks only
--logs             # Run log scanning only
--fix-permissions  # Auto-fix permission issues
--continue-on-error # Continue running checks even if some fail
--quiet            # Minimal output (for CI/CD)
--verbose          # Detailed output (for debugging)
```

**Usage Examples**:
```bash
# Run all security checks
./scripts/security/security-check-suite.sh config/tenants/tenant001.yml tenant001

# Run specific checks only
./scripts/security/security-check-suite.sh config/tenants/tenant001.yml tenant001 --config --secrets

# Auto-fix permission issues
./scripts/security/security-check-suite.sh config/tenants/tenant001.yml tenant001 --fix-permissions

# CI/CD mode (quiet, continue on error)
./scripts/security/security-check-suite.sh config/tenants/tenant001.yml tenant001 --quiet --continue-on-error
```

**Exit Codes**:
- `0`: All security checks passed
- `1`: Security issues found (deployment blocked)
- `2`: Configuration errors
- `3`: Partial completion (some checks failed with --continue-on-error)

**Generated Report**:
```markdown
# Security Check Report
# Generated: 2025-03-19 10:30:00 UTC

## Summary
- Total Checks: 4
- Passed: 3
- Failed: 1
- Warnings: 0

## Security Issues
CRITICAL: 1 security check(s) failed.

Deployment is BLOCKED until these issues are resolved:
- Secret Strength

## Recommendation
**BLOCKED**: Deployment must NOT proceed until security issues are resolved.
```

---

## Usage Guide

### Basic Usage

1. **Run All Security Checks**:
```bash
cd /path/to/AIOpc
./scripts/security/security-check-suite.sh config/tenants/tenant001.yml tenant001
```

2. **Run Specific Checks**:
```bash
# Only configuration checks
./scripts/security/check-config-security.sh config/tenants/tenant001.yml tenant001

# Only secret strength
./scripts/security/check-secret-strength.sh config/tenants/tenant001.yml tenant001

# Only file permissions
./scripts/security/check-file-permissions.sh config/tenants/tenant001.yml tenant001

# Only log scanning
./scripts/security/scan-logs.sh --all tenant001
```

### Advanced Usage

1. **Auto-Fix Permissions**:
```bash
./scripts/security/check-file-permissions.sh config/tenants/tenant001.yml tenant001 true
```

2. **Continue on Error** (for auditing):
```bash
./scripts/security/security-check-suite.sh config/tenants/tenant001.yml tenant001 --continue-on-error
```

3. **CI/CD Integration**:
```bash
# Quiet mode, fail on security issues
./scripts/security/security-check-suite.sh config/tenants/tenant001.yml tenant001 --quiet

# Check exit code
if [ $? -eq 0 ]; then
    echo "Security checks passed, proceeding with deployment"
else
    echo "Security checks failed, deployment blocked"
    exit 1
fi
```

### Testing Security Checks

Run the test suite to verify functionality:

```bash
./scripts/tests/test-security-checks.sh
```

**Test Coverage**:
- Configuration security (secure vs insecure)
- Secret strength (strong vs weak)
- File permissions (correct vs incorrect)
- Log scanning (clean vs with secrets)
- Orchestrator functionality
- Continue-on-error behavior

---

## Integration Points

### 1. Pre-Deployment Integration

**Location**: `scripts/deploy/pre-deploy.sh`

The security check suite is integrated into the pre-deployment pipeline:

```bash
# Check 12: Security validation
check_security_validation() {
    local config_file="$1"
    local tenant_id="${CONFIG_TENANT_ID:-}"

    # Run comprehensive security check suite
    local security_suite="${SCRIPT_DIR}/../security/security-check-suite.sh"

    security_output=$("$security_suite" "$config_file" "$tenant_id" \
        --config --secrets --permissions --quiet 2>&1) || security_exit_code=$?

    # Handle exit codes...
}
```

**Behavior**:
- Security failures block deployment
- Fallback to basic checks if suite not available
- Results logged to state database

### 2. GitHub Actions Integration

**Location**: `.github/workflows/deploy-tenant.yml`

```yaml
- name: Security Checks
  run: |
    ./scripts/security/security-check-suite.sh \
      config/tenants/${{ inputs.tenant_id }}.yml \
      "${{ inputs.tenant_id }}" \
      --quiet
```

### 3. Manual Deployment

For manual deployments, always run security checks first:

```bash
# 1. Run security checks
./scripts/security/security-check-suite.sh config/tenants/tenant001.yml tenant001

# 2. If checks pass, proceed with deployment
./scripts/deploy/deploy.sh config/tenants/tenant001.yml
```

---

## Security Policies

### Deployment Blocking Rules

Deployments are **BLOCKED** when:

1. **Placeholder Values Detected**:
   - Critical fields contain `cli_xxxxxxxxxxxxx`, `CHANGE_THIS`, etc.
   - Empty critical fields

2. **Weak Secrets Detected**:
   - Database password <16 characters or low complexity
   - JWT secret <32 characters or low entropy
   - API keys <20 characters or sequential

3. **Insecure File Permissions**:
   - Configuration files not `600`
   - SSH private keys not `600`
   - Log files world-readable

4. **Secrets in Logs**:
   - JWT tokens detected in logs
   - Passwords detected in logs
   - API keys detected in logs

### Warning Conditions

Deployments proceed **WITH WARNINGS** when:

1. **Medium-Strength Secrets**:
   - Secrets meet minimum requirements but not best practices
   - Entropy between 80-99 bits

2. **Default Values in Production**:
   - Example domains or emails in production config
   - Localhost references in production

3. **HTTP URLs in Production**:
   - OAuth redirect URIs using HTTP instead of HTTPS

### Security Event Recording

All security events are recorded to the `security_audit_log` table:

```sql
CREATE TABLE security_audit_log (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    actor VARCHAR(255) NOT NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    old_value JSONB,
    new_value JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Recorded Events**:
- `placeholder_detected`: Placeholder value found
- `weak_secret_detected`: Weak secret detected
- `insecure_file_permissions`: Incorrect file permissions
- `secrets_found_in_logs`: Secrets detected in logs
- `security_check_suite`: Suite execution (started/completed)

---

## Troubleshooting

### Common Issues

#### 1. Permission Denied Errors

**Problem**:
```
ERROR: Configuration file not readable: config/tenants/tenant001.yml
```

**Solution**:
```bash
# Check file permissions
ls -l config/tenants/tenant001.yml

# Fix permissions
chmod 600 config/tenants/tenant001.yml
# OR use auto-fix
./scripts/security/check-file-permissions.sh config/tenants/tenant001.yml tenant001 true
```

#### 2. Missing Dependencies

**Problem**:
```
ERROR: Required library not found: state.sh
```

**Solution**:
```bash
# Verify library exists
ls -la scripts/lib/state.sh

# Check library path
grep 'LIB_DIR=' scripts/security/security-check-suite.sh
```

#### 3. Database Connection Failures

**Problem**:
```
WARNING: Could not initialize state database, audit logging disabled
```

**Solution**:
```bash
# Check database connection
psql -h $STATE_DB_HOST -U $STATE_DB_USER -d $STATE_DB_NAME

# Verify environment variables
echo $STATE_DB_HOST
echo $STATE_DB_PASSWORD
```

#### 4. False Positives in Log Scanning

**Problem**:
```
WARNING: Secret found: app.log:100 [jwt_token]
    # Not actually a JWT token, just a similar pattern
```

**Solution**:
```bash
# Review the detected pattern
grep -n "eyJ" app.log | head -5

# If false positive, update patterns in scan-logs.sh
# OR exclude specific log files
```

### Debug Mode

Enable verbose output for troubleshooting:

```bash
# Verbose mode for individual check
./scripts/security/check-config-security.sh config/tenants/tenant001.yml tenant001

# Verbose mode for full suite
./scripts/security/security-check-suite.sh config/tenants/tenant001.yml tenant001 --verbose
```

### Test Environment

Use the test suite to verify functionality:

```bash
# Run all tests
./scripts/tests/test-security-checks.sh

# Run specific test
./scripts/tests/test-security-checks.sh test_config_security_placeholders
```

---

## Best Practices

### 1. Configuration Management

**DO**:
- Use environment variables for secrets where possible
- Generate strong random secrets for production
- Use password managers or secret management tools
- Rotate secrets regularly (every 90 days recommended)
- Keep configuration files at 600 permissions

**DON'T**:
- Commit secrets to version control
- Use placeholder values in production
- Share secrets via email or chat
- Reuse secrets across environments
- Use weak passwords for convenience

### 2. Secret Generation

Generate strong secrets using cryptographically secure methods:

```bash
# Generate 32-character random secret
openssl rand -base64 32 | tr -d "=+/" | cut -c1-32

# Generate UUID-based secret
uuidgen | tr -d '-'

# Use password manager (recommended)
# 1Password, Bitwarden, LastPass, etc.
```

### 3. Pre-Deployment Checklist

Before deployment, verify:

- [ ] All placeholder values replaced
- [ ] All secrets meet strength requirements
- [ ] Configuration files have correct permissions (600)
- [ ] SSH keys have correct permissions (600 private, 644 public)
- [ ] No secrets in log files
- [ ] Security checks pass
- [ ] State database accessible for audit logging

### 4. Incident Response

If secrets are leaked:

1. **Immediate Actions**:
   - Identify exposed secrets
   - Rotate all exposed secrets immediately
   - Review access logs for unauthorized access

2. **Containment**:
   - Revoke compromised credentials
   - Change all related secrets
   - Invalidate affected sessions/tokens

3. **Recovery**:
   - Update configuration with new secrets
   - Re-deploy with new secrets
   - Monitor for suspicious activity

4. **Prevention**:
   - Review logging practices
   - Implement secret filtering in logs
   - Add security checks to CI/CD pipeline

### 5. CI/CD Integration

**Recommended Pipeline**:
```yaml
stages:
  - security-scan
  - build
  - test
  - deploy

security-scan:
  script:
    - ./scripts/security/security-check-suite.sh config.yml $TENANT_ID --quiet
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
```

### 6. Regular Auditing

Schedule regular security audits:

```bash
# Daily: Scan logs for secrets
0 2 * * * /path/to/AIOpc/scripts/security/scan-logs.sh --all > /var/log/security-scan.log 2>&1

# Weekly: Full security check suite
0 3 * * 0 /path/to/AIOpc/scripts/security/security-check-suite.sh config/tenants/*.yml --all

# Monthly: Review security audit log
psql -d deployment_state -c "SELECT * FROM security_audit_log WHERE created_at > NOW() - INTERVAL '30 days' ORDER BY created_at DESC;"
```

---

## Appendix

### A. Complete Security Check List

| Check | Description | Block | Warning |
|-------|-------------|-------|---------|
| Placeholder Detection | Detect placeholder values | ✅ | |
| Weak Password Detection | Detect common weak passwords | ✅ | |
| Empty Critical Fields | Check required fields have values | ✅ | |
| Default Values | Detect example/test values | | ✅ |
| Secret Strength | Validate secret complexity | ✅ | ✅ |
| File Permissions | Verify secure file permissions | ✅ | |
| Log Scanning | Detect secrets in logs | ✅ | |
| HTTP in Production | Detect insecure URLs | | ✅ |

### B. Exit Code Reference

| Code | Meaning | Action |
|------|---------|--------|
| 0 | Success | Proceed with deployment |
| 1 | Security Issues | Block deployment, fix issues |
| 2 | Configuration Error | Fix configuration, retry |
| 3 | Partial Completion | Review warnings, decide |

### C. Environment Variables

```bash
# State Database
STATE_DB_HOST="${STATE_DB_HOST:-localhost}"
STATE_DB_PORT="${STATE_DB_PORT:-5432}"
STATE_DB_NAME="${STATE_DB_NAME:-deployment_state}"
STATE_DB_USER="${STATE_DB_USER:-postgres}"
STATE_DB_PASSWORD="${STATE_DB_PASSWORD:-}"

# Logging
LOG_CURRENT_LEVEL="${LOG_CURRENT_LEVEL:-1}"  # INFO
LOG_TO_FILE="${LOG_TO_FILE:-false}"
LOG_FILE="${LOG_FILE:-}"

# Security Checks
MIN_DB_PASSWORD_LENGTH=16
MIN_JWT_SECRET_LENGTH=32
MIN_API_KEY_LENGTH=20
MIN_ENCRYPT_KEY_LENGTH=24
MIN_ENTROPY=80
```

### D. Related Documentation

- [Configuration Management Guide](../configuration/README.md)
- [Deployment Guide](../deployment/README.md)
- [State Database Schema](../../database/state-database-schema.md)
- [Troubleshooting Guide](../troubleshooting/README.md)

---

**Document Version**: 1.0
**Last Updated**: 2026-03-19
**Maintained By**: DevOps Team
**Change Log**:
- 2025-03-19: Initial version (TASK-014)
