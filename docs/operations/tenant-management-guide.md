# Tenant Management Guide

**Version**: 1.0
**Last Updated**: 2026-03-19
**Audience**: System Administrators, DevOps Engineers

---

## Overview

This guide provides comprehensive instructions for managing tenant configurations in the AIOpc multi-instance deployment platform. The tenant management system allows you to create, view, update, validate, and delete tenant configurations through a consistent command-line interface.

### What is a Tenant?

A **tenant** represents a complete deployment instance for a specific organization or customer. Each tenant has:
- **Unique ID**: Identifier for the tenant (e.g., `tenant_001`, `acme_corp`)
- **Configuration**: Separate YAML configuration file
- **Database Records**: State tracking in PostgreSQL
- **Deployment History**: Record of all deployments
- **Health Status**: Monitoring and health check results

---

## Quick Start

### Prerequisites

Before using tenant management scripts, ensure you have:

1. **Required Software**:
   ```bash
   # Check bash version (need 5.0+)
   /opt/homebrew/bin/bash --version

   # Check yq installation
   yq --version

   # Check PostgreSQL client
   psql --version
   ```

2. **Database Access**:
   ```bash
   # Set database password
   export STATE_DB_PASSWORD="your_password"
   ```

3. **Project Structure**:
   ```bash
   # Verify directories exist
   ls scripts/tenant/
   ls config/tenants/
   ls scripts/lib/
   ```

### Basic Workflow

```bash
# 1. Create a new tenant
scripts/tenant/create.sh \
  --tenant-id tenant_001 \
  --name "Acme Corporation" \
  --environment production

# 2. List all tenants
scripts/tenant/list.sh

# 3. View tenant details
scripts/tenant/show.sh tenant_001

# 4. Validate configuration
scripts/tenant/validate.sh tenant_001

# 5. Update configuration (optional)
scripts/tenant/update.sh tenant_001 --status active

# 6. Deploy tenant (see deployment guide)
scripts/deploy/deploy-tenant.sh --tenant-id tenant_001
```

---

## Command Reference

### create.sh - Create Tenant

Create a new tenant configuration from the template.

#### Syntax
```bash
scripts/tenant/create.sh [options]
```

#### Options
| Option | Description | Required |
|--------|-------------|----------|
| `--tenant-id ID` | Unique tenant identifier | Yes |
| `--name NAME` | Human-readable tenant name | Yes |
| `--environment ENV` | Environment (production\|staging\|development) | No (default: development) |
| `--tier TIER` | Tenant tier (trial\|basic\|standard\|premium\|enterprise) | No (default: trial) |
| `--non-interactive` | Skip all prompts | No |
| `--dry-run` | Show what would be done | No |

#### Examples

**Interactive Mode**:
```bash
scripts/tenant/create.sh
# Prompts for:
# - Tenant ID
# - Tenant Name
# - Environment
# - Tier
# - Confirmation
```

**Non-Interactive Mode**:
```bash
scripts/tenant/create.sh \
  --tenant-id acme_corp \
  --name "Acme Corporation" \
  --environment production \
  --tier premium \
  --non-interactive
```

**Dry-Run Mode**:
```bash
scripts/tenant/create.sh \
  --tenant-id test_tenant \
  --name "Test Tenant" \
  --environment development \
  --dry-run
```

#### Output
```
[INFO] === Tenant Creation Script ===
[INFO] Creating tenant configuration: /path/to/config/tenants/acme_corp.yml
[SUCCESS] Tenant configuration created: /path/to/config/tenants/acme_corp.yml
[SUCCESS] Tenant record added to database
[SUCCESS] Tenant created successfully!

Next Steps:
  1. Review and edit the configuration file:
     /path/to/config/tenants/acme_corp.yml

  2. Set required environment variables or edit config directly:
     - FEISHU_APP_ID
     - FEISHU_APP_SECRET
     - FEISHU_ENCRYPT_KEY
     - DB_PASSWORD
     - REDIS_PASSWORD
     - JWT_SECRET
     - DEEPSEEK_API_KEY

  3. Validate the configuration:
     scripts/tenant/validate.sh acme_corp

  4. Deploy the tenant:
     scripts/deploy/deploy-tenant.sh --tenant-id acme_corp
```

---

### list.sh - List Tenants

List all tenant configurations with filtering and sorting.

#### Syntax
```bash
scripts/tenant/list.sh [options]
```

#### Options
| Option | Description |
|--------|-------------|
| `--environment ENV` | Filter by environment |
| `--status STATUS` | Filter by status |
| `--tier TIER` | Filter by tier |
| `--sort FIELD` | Sort by field (id\|name\|created\|status\|environment\|tier) |
| `--format FORMAT` | Output format (table\|json\|yaml) |
| `--show-deleted` | Include deleted tenants |

#### Examples

**List All Tenants**:
```bash
scripts/tenant/list.sh
```

**Filter by Environment**:
```bash
scripts/tenant/list.sh --environment production
```

**Filter by Multiple Criteria**:
```bash
scripts/tenant/list.sh --environment production --status active --tier premium
```

**Sort by Name**:
```bash
scripts/tenant/list.sh --sort name
```

**JSON Output**:
```bash
scripts/tenant/list.sh --format json
```

#### Output (Table Format)
```
Tenant ID    Name              Environment    Tier      Status    Created
----------    ----              -----------    ----      ------    -------
acme_corp    Acme Corporation  production     premium   active    2026-03-19
test_tenant  Test Tenant       development    trial     active    2026-03-19

Total tenants: 2
```

---

### show.sh - Show Tenant Details

Display detailed information about a specific tenant.

#### Syntax
```bash
scripts/tenant/show.sh <tenant_id> [options]
```

#### Options
| Option | Description |
|--------|-------------|
| `--show-secrets` | Display sensitive values (passwords, keys, secrets) |
| `--output FILE` | Write output to file |
| `--format FORMAT` | Output format (yaml\|json\|pretty) |

#### Examples

**Show Tenant (Pretty Format)**:
```bash
scripts/tenant/show.sh acme_corp
```

**Show Tenant with Secrets**:
```bash
scripts/tenant/show.sh acme_corp --show-secrets
```

**Export to JSON**:
```bash
scripts/tenant/show.sh acme_corp --format json --output acme_corp.json
```

**Export to YAML**:
```bash
scripts/tenant/show.sh acme_corp --format yaml --output acme_corp.yml
```

#### Output (Pretty Format)
```
════════════════════════════════════════════════════════════════
  Tenant Details: acme_corp
════════════════════════════════════════════════════════════════

Basic Information:
  Tenant ID: acme_corp
  Name: Acme Corporation
  Environment: production
  Tier: premium
  Status: active
  Created: 2026-03-19T10:30:00Z
  Updated: 2026-03-19T10:30:00Z

Server Configuration:
  Host: 192.168.1.100
  SSH User: root
  Deploy Path: /opt/opclaw/platform
  API Port: 3000

Feishu Integration:
  App ID: cli_a93ce5614ce11bd6
  OAuth Redirect: https://acme.example.com/api/auth/feishu/callback
  App Secret: ******** (use --show-secrets to display)

Database Configuration:
  Host: localhost
  Port: 5432
  Database: opclaw_acme_corp
  User: opclaw
  Password: ******** (use --show-secrets to display)

Recent Deployments:
  [1] initial - v1.0.0
      Status: success
      Started: 2026-03-19T10:35:00Z

Configuration File:
  /path/to/config/tenants/acme_corp.yml
```

---

### update.sh - Update Tenant

Update tenant configuration and database records.

#### Syntax
```bash
scripts/tenant/update.sh <tenant_id> [options]
```

#### Options
| Option | Description |
|--------|-------------|
| `--name NAME` | Update tenant name |
| `--status STATUS` | Update tenant status (provisioning\|active\|suspended\|deleted) |
| `--tier TIER` | Update tenant tier (trial\|basic\|standard\|premium\|enterprise) |
| `--config KEY=VAL` | Update config value (e.g., server.host=192.168.1.100) |
| `--set-env VAR=VAL` | Set environment variable (e.g., DEEPSEEK_API_KEY=sk-xxx) |
| `--dry-run` | Show what would be done |

#### Examples

**Update Name**:
```bash
scripts/tenant/update.sh acme_corp --name "Acme Corp (Updated)"
```

**Update Status**:
```bash
scripts/tenant/update.sh acme_corp --status active
```

**Update Multiple Fields**:
```bash
scripts/tenant/update.sh acme_corp \
  --name "Acme Corporation" \
  --status active \
  --tier premium
```

**Update Config Value**:
```bash
scripts/tenant/update.sh acme_corp --config server.host=192.168.1.200
```

**Update Multiple Config Values**:
```bash
scripts/tenant/update.sh acme_corp \
  --config server.host=192.168.1.200 \
  --config server.api_port=3001 \
  --config database.port=5433
```

**Set Environment Variable**:
```bash
scripts/tenant/update.sh acme_corp --set-env DEEPSEEK_API_KEY=sk-xxxxx
```

**Dry-Run Mode**:
```bash
scripts/tenant/update.sh acme_corp --name "New Name" --dry-run
```

#### Output
```
[INFO] The following updates will be applied to tenant: acme_corp

  Name: Acme Corporation
  Status: active
  Tier: premium
  Config: server.host = 192.168.1.200

Continue? [y/N]: y
[SUCCESS] Config value updated: server.host = 192.168.1.200
[SUCCESS] Tenant record updated in database
[INFO] Validating updated configuration...
[SUCCESS] Configuration validation passed
[SUCCESS] Tenant updated successfully: acme_corp
```

---

### delete.sh - Delete Tenant

Safely delete tenant configuration and database records.

#### Syntax
```bash
scripts/tenant/delete.sh <tenant_id> [options]
```

#### Options
| Option | Description |
|--------|-------------|
| `--force` | Skip confirmation prompts |
| `--backup` | Backup configuration before deletion |
| `--backup-dir DIR` | Custom backup directory |
| `--purge` | Remove all database records (not just soft delete) |

#### Examples

**Delete with Confirmation**:
```bash
scripts/tenant/delete.sh test_tenant
# Requires typing tenant ID to confirm
```

**Delete with Backup**:
```bash
scripts/tenant/delete.sh acme_corp --backup
```

**Force Delete**:
```bash
scripts/tenant/delete.sh test_tenant --force
```

**Purge (Hard Delete)**:
```bash
scripts/tenant/delete.sh test_tenant --purge --force
```

**Custom Backup Directory**:
```bash
scripts/tenant/delete.sh acme_corp --backup --backup-dir /backups/my-tenants
```

#### Output
```
[INFO] === Tenant Deletion Script ===

WARNING: You are about to delete tenant: acme_corp

This will:
  - Delete the configuration file
  - Mark tenant as deleted in database (soft delete)
  - Create a backup before deletion

This action is difficult to undo!

Type 'acme_corp' to confirm deletion: acme_corp

[INFO] Backing up tenant configuration...
[SUCCESS] Configuration backed up to: /backups/tenants/acme_corp_20260319_103000.yml
[SUCCESS] Configuration backed up to database
[SUCCESS] Tenant marked as deleted in database
[SUCCESS] Configuration file deleted: /path/to/config/tenants/acme_corp.yml
[SUCCESS] Tenant deleted successfully: acme_corp
[INFO] Backup is available in: /backups/tenants
```

---

### validate.sh - Validate Tenant

Validate tenant configuration against schema and best practices.

#### Syntax
```bash
scripts/tenant/validate.sh <tenant_id> [options]
```

#### Options
| Option | Description |
|--------|-------------|
| `--strict` | Treat warnings as errors |
| `--show-secrets` | Show secret values in output |
| `--output FILE` | Write validation report to file |
| `--format FORMAT` | Output format (text\|json) |

#### Examples

**Basic Validation**:
```bash
scripts/tenant/validate.sh acme_corp
```

**Strict Mode**:
```bash
scripts/tenant/validate.sh acme_corp --strict
```

**Generate Report**:
```bash
scripts/tenant/validate.sh acme_corp --output validation_report.txt
```

**JSON Output**:
```bash
scripts/tenant/validate.sh acme_corp --format json
```

#### Output (Text Format)
```
[INFO] === Tenant Configuration Validation ===
[INFO] Validating configuration: /path/to/config/tenants/acme_corp.yml
Checking basic structure...
Checking required fields...
Checking data types...
Checking secret strength...
Checking network settings...
Checking file paths...
Checking best practices...
Checking consistency...

Configuration: /path/to/config/tenants/acme_corp.yml
Timestamp: 2026-03-19T10:30:00Z

✓ Basic structure: PASS
✓ Required fields: PASS
✓ Data types: PASS
✓ Secret strength: PASS
✓ Network settings: PASS
✓ File paths: PASS
⚠ Best practices: WARNING
⚠ Consistency: WARNING

========================================
  Validation Summary
========================================
Total Checks: 8
Passed: 6
Failed: 0
Warnings: 2

Result: PASSED with warnings
[SUCCESS] Validation passed
```

---

## Common Workflows

### Workflow 1: Create and Deploy New Tenant

```bash
# 1. Create tenant
scripts/tenant/create.sh \
  --tenant-id acme_corp \
  --name "Acme Corporation" \
  --environment production \
  --tier premium

# 2. Edit configuration to set secrets
vi config/tenants/acme_corp.yml
# Set: FEISHU_APP_ID, FEISHU_APP_SECRET, etc.

# 3. Validate configuration
scripts/tenant/validate.sh acme_corp --strict

# 4. Deploy tenant
scripts/deploy/deploy-tenant.sh --tenant-id acme_corp

# 5. Verify deployment
scripts/tenant/show.sh acme_corp
```

### Workflow 2: Update Production Tenant

```bash
# 1. Show current configuration
scripts/tenant/show.sh production_tenant

# 2. Make changes (dry-run first)
scripts/tenant/update.sh production_tenant \
  --config server.host=new-server.example.com \
  --dry-run

# 3. Apply changes
scripts/tenant/update.sh production_tenant \
  --config server.host=new-server.example.com

# 4. Validate after update
scripts/tenant/validate.sh production_tenant

# 5. Deploy with new configuration
scripts/deploy/deploy-tenant.sh --tenant-id production_tenant
```

### Workflow 3: Tenant Maintenance

```bash
# 1. List all production tenants
scripts/tenant/list.sh --environment production

# 2. Check health status
for tenant in $(scripts/tenant/list.sh --format json | jq -r '.[].tenant_id'); do
    scripts/tenant/show.sh "$tenant" | grep -A 5 "Recent Health Checks"
done

# 3. Update tenant tiers
scripts/tenant/update.sh trial_tenant --tier basic --status active

# 4. Validate all tenants
for tenant in $(scripts/tenant/list.sh --format json | jq -r '.[].tenant_id'); do
    scripts/tenant/validate.sh "$tenant" || echo "Validation failed for: $tenant"
done
```

### Workflow 4: Tenant Decommissioning

```bash
# 1. Suspend tenant first
scripts/tenant/update.sh old_tenant --status suspended

# 2. Backup tenant configuration
scripts/tenant/delete.sh old_tenant --backup

# 3. Verify backup exists
ls -la backups/tenants/old_tenant_*.yml

# 4. Purge after retention period (e.g., 30 days)
scripts/tenant/delete.sh old_tenant --purge --force
```

---

## Troubleshooting

### Issue: "Tenant not found"

**Symptom**: `Error: Tenant not found: xxx`

**Causes**:
1. Tenant ID is incorrect
2. Configuration file was deleted
3. Working directory is wrong

**Solutions**:
```bash
# List all tenants to find correct ID
scripts/tenant/list.sh

# Check current directory
pwd
# Should be: /path/to/AIOpc

# Verify config file exists
ls config/tenants/
```

### Issue: "Database connection failed"

**Symptom**: `Failed to initialize state database`

**Causes**:
1. PostgreSQL not running
2. Wrong database password
3. Database host unreachable

**Solutions**:
```bash
# Set database password
export STATE_DB_PASSWORD="your_password"

# Check PostgreSQL is running
pg_isready -h localhost -p 5432

# Test connection
psql -h localhost -U postgres -d deployment_state
```

### Issue: "Validation failed"

**Symptom**: Configuration validation returns errors

**Common Errors**:
1. Missing required fields
2. Invalid environment value
3. Placeholder values in critical fields
4. Weak secrets

**Solutions**:
```bash
# Run validation in verbose mode
DEBUG=true scripts/tenant/validate.sh tenant_id

# Check for placeholder values
grep -E "(cli_xxxxxxxxxxxxx|CHANGE_THIS|placeholder)" config/tenants/tenant_id.yml

# Generate strong secrets
openssl rand -base64 32  # For JWT secret
openssl rand -base64 24  # For encrypt key
```

### Issue: "yq command not found"

**Symptom**: `yq: command not found`

**Solution**:
```bash
# Install yq v4+
brew install yq

# Verify version
yq --version
# Should show: version v4.x.x
```

### Issue: "Permission denied"

**Symptom**: Cannot write to config directory

**Solution**:
```bash
# Check directory permissions
ls -la config/tenants/

# Fix permissions if needed
chmod 755 config/tenants/
chmod 644 config/tenants/*.yml
```

---

## Best Practices

### 1. Tenant Naming Conventions
- Use lowercase alphanumeric characters with underscores
- Be descriptive: `acme_corp`, `production_main`, `staging_acme`
- Avoid: `tenant1`, `test`, `temp`

### 2. Environment Organization
- **development**: For testing and development
- **staging**: For pre-production testing
- **production**: For live deployments

### 3. Tier Assignment
- **trial**: New customers, limited resources
- **basic**: Small deployments, standard resources
- **standard**: Medium deployments, enhanced resources
- **premium**: Large deployments, maximum resources
- **enterprise**: Custom deployments, dedicated resources

### 4. Secret Management
- **Never** commit secrets to version control
- Use environment variables for sensitive values
- Rotate secrets regularly
- Use different secrets per tenant

### 5. Backup Strategy
- Always backup before deletion
- Keep backups for retention period (e.g., 30 days)
- Test backup restoration process
- Store backups in secure location

### 6. Validation
- Validate after every configuration change
- Use strict mode for production tenants
- Fix warnings before deploying
- Automate validation in CI/CD

### 7. Documentation
- Document tenant-specific configurations
- Track changes and reasons
- Maintain deployment history
- Document custom configurations

---

## Advanced Usage

### Batch Operations

```bash
# Update all tenants in environment
for tenant in $(scripts/tenant/list.sh --environment production --format json | jq -r '.[].tenant_id'); do
    scripts/tenant/update.sh "$tenant" --config server.timeout=30
done

# Validate all tenants
for tenant in $(scripts/tenant/list.sh --format json | jq -r '.[].tenant_id'); do
    echo "Validating: $tenant"
    scripts/tenant/validate.sh "$tenant" --strict || echo "FAILED: $tenant"
done

# Backup all tenants
mkdir -p backups/all_tenants_$(date +%Y%m%d)
for tenant in $(scripts/tenant/list.sh --format json | jq -r '.[].tenant_id'); do
    cp config/tenants/${tenant}.yml backups/all_tenants_$(date +%Y%m%d)/
done
```

### Export/Import

```bash
# Export tenant to JSON
scripts/tenant/show.sh acme_corp --format json > acme_corp_export.json

# Import tenant from backup
cp backups/tenants/acme_corp_20260319.yml config/tenants/acme_corp.yml
scripts/tenant/validate.sh acme_corp
```

### Integration with CI/CD

```bash
#!/bin/bash
# ci-validate-all-tenants.sh

set -e

echo "Validating all tenant configurations..."

FAILED_TENANTS=()

for tenant in $(scripts/tenant/list.sh --format json | jq -r '.[].tenant_id'); do
    if ! scripts/tenant/validate.sh "$tenant" --strict >/dev/null 2>&1; then
        FAILED_TENANTS+=("$tenant")
    fi
done

if [ ${#FAILED_TENANTS[@]} -gt 0 ]; then
    echo "Validation failed for tenants:"
    printf '%s\n' "${FAILED_TENANTS[@]}"
    exit 1
fi

echo "All tenants validated successfully"
```

---

## Appendix

### A. Tenant Status Values

| Status | Description | Usage |
|--------|-------------|-------|
| `provisioning` | Tenant is being provisioned | Initial creation state |
| `active` | Tenant is active and operational | Normal operational state |
| `suspended` | Tenant is temporarily suspended | Maintenance, non-payment |
| `deleted` | Tenant is deleted | Soft-deleted state |

### B. Tenant Tier Values

| Tier | Description | Typical Use |
|------|-------------|-------------|
| `trial` | Trial/evaluation | New customer evaluation |
| `basic` | Basic resources | Small teams, 1-10 users |
| `standard` | Standard resources | Medium teams, 10-50 users |
| `premium` | Premium resources | Large teams, 50-200 users |
| `enterprise` | Custom resources | Enterprise deployments |

### C. Configuration File Structure

```yaml
tenant:
  id: "tenant_id"
  name: "Tenant Name"
  environment: "production"
  tier: "premium"

server:
  host: "server.example.com"
  ssh_user: "root"
  ssh_key_path: "~/.ssh/id_rsa"
  deploy_path: "/opt/opclaw/platform"

feishu:
  app_id: "cli_xxxxxxxxxxxxx"
  app_secret: "${FEISHU_APP_SECRET}"
  encrypt_key: "${FEISHU_ENCRYPT_KEY}"
  oauth_redirect_uri: "https://example.com/api/auth/feishu/callback"

database:
  host: "localhost"
  port: 5432
  name: "opclaw_tenant_id"
  user: "opclaw"
  password: "${DB_PASSWORD}"

redis:
  host: "localhost"
  port: 6379
  password: "${REDIS_PASSWORD}"

jwt:
  secret: "${JWT_SECRET}"
  expires_in: "24h"

agent:
  deepseek:
    api_key: "${DEEPSEEK_API_KEY}"
    model: "deepseek-chat"
```

---

**Document Version**: 1.0
**Last Updated**: 2026-03-19
**Maintained By**: AIOpc DevOps Team
