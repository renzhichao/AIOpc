# Tenant Management Quick Reference

**Quick reference guide for common tenant management operations.**

## Create Tenant

```bash
# Interactive
scripts/tenant/create.sh

# Non-interactive
scripts/tenant/create.sh \
  --tenant-id <ID> \
  --name "<NAME>" \
  --environment production|staging|development \
  [--tier trial|basic|standard|premium|enterprise]

# Dry-run
scripts/tenant/create.sh --tenant-id <ID> --name "<NAME>" --dry-run
```

## List Tenants

```bash
# All tenants
scripts/tenant/list.sh

# Filtered
scripts/tenant/list.sh --environment production --status active --tier premium

# Sorted
scripts/tenant/list.sh --sort name|created|status

# Different formats
scripts/tenant/list.sh --format table|json|yaml
```

## Show Tenant Details

```bash
# Pretty format (default)
scripts/tenant/show.sh <tenant_id>

# Show secrets
scripts/tenant/show.sh <tenant_id> --show-secrets

# Export format
scripts/tenant/show.sh <tenant_id> --format json|yaml --output <file>
```

## Update Tenant

```bash
# Update metadata
scripts/tenant/update.sh <tenant_id> --name "<NAME>" --status active --tier premium

# Update config value
scripts/tenant/update.sh <tenant_id> --config server.host=192.168.1.100

# Update multiple configs
scripts/tenant/update.sh <tenant_id> \
  --config server.host=192.168.1.100 \
  --config database.port=5433

# Set environment variable
scripts/tenant/update.sh <tenant_id> --set-env DEEPSEEK_API_KEY=sk-xxx

# Dry-run
scripts/tenant/update.sh <tenant_id> --config <key>=<value> --dry-run
```

## Validate Tenant

```bash
# Basic validation
scripts/tenant/validate.sh <tenant_id>

# Strict mode (warnings = errors)
scripts/tenant/validate.sh <tenant_id> --strict

# Generate report
scripts/tenant/validate.sh <tenant_id> --output report.txt --format json
```

## Delete Tenant

```bash
# With confirmation
scripts/tenant/delete.sh <tenant_id>

# With backup
scripts/tenant/delete.sh <tenant_id> --backup

# Force delete
scripts/tenant/delete.sh <tenant_id> --force

# Purge (hard delete)
scripts/tenant/delete.sh <tenant_id> --purge --force

# Custom backup location
scripts/tenant/delete.sh <tenant_id> --backup --backup-dir /backups/my-tenants
```

## Common Workflows

### New Production Tenant
```bash
# 1. Create
scripts/tenant/create.sh --tenant-id acme --name "Acme Corp" --environment production --tier premium

# 2. Edit secrets
vi config/tenants/acme.yml

# 3. Validate
scripts/tenant/validate.sh acme --strict

# 4. Deploy
scripts/deploy/deploy-tenant.sh --tenant-id acme
```

### Update Production Tenant
```bash
# 1. Show current
scripts/tenant/show.sh acme

# 2. Dry-run update
scripts/tenant/update.sh acme --config server.host=new-server --dry-run

# 3. Apply update
scripts/tenant/update.sh acme --config server.host=new-server

# 4. Validate
scripts/tenant/validate.sh acme

# 5. Deploy
scripts/deploy/deploy-tenant.sh --tenant-id acme
```

### List Active Production Tenants
```bash
scripts/tenant/list.sh --environment production --status active
```

### Backup All Tenants
```bash
mkdir -p backups/all_tenants_$(date +%Y%m%d)
for t in $(scripts/tenant/list.sh --format json | jq -r '.[].tenant_id'); do
    cp config/tenants/${t}.yml backups/all_tenants_$(date +%Y%m%d)/
done
```

### Validate All Tenants
```bash
for t in $(scripts/tenant/list.sh --format json | jq -r '.[].tenant_id'); do
    scripts/tenant/validate.sh "$t" || echo "FAILED: $t"
done
```

## Environment Values

- `production` - Live production environment
- `staging` - Pre-production staging
- `development` - Development/testing

## Status Values

- `provisioning` - Initial provisioning state
- `active` - Normal operational state
- `suspended` - Temporarily suspended
- `deleted` - Soft-deleted state

## Tier Values

- `trial` - Trial/evaluation (1-10 users)
- `basic` - Basic resources (1-10 users)
- `standard` - Standard resources (10-50 users)
- `premium` - Premium resources (50-200 users)
- `enterprise` - Custom/dedicated resources

## Help

```bash
# Each script supports --help
scripts/tenant/create.sh --help
scripts/tenant/list.sh --help
scripts/tenant/show.sh --help
scripts/tenant/update.sh --help
scripts/tenant/delete.sh --help
scripts/tenant/validate.sh --help
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Tenant not found" | Check ID with `scripts/tenant/list.sh` |
| "Database connection failed" | Set `STATE_DB_PASSWORD` |
| "Validation failed" | Check config for placeholders with `grep CHANGE_* config/tenants/*.yml` |
| "yq command not found" | Install with `brew install yq` |
| "Permission denied" | Check permissions on `config/tenants/` |

---

**For detailed documentation, see**: `docs/operations/tenant-management-guide.md`
