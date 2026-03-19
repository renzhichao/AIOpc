# Enhanced Health Check - Quick Reference

## Quick Start

```bash
# Run all health checks
./scripts/monitoring/enhanced-health-check.sh

# Quick check (skip non-critical)
./scripts/monitoring/enhanced-health-check.sh --quick

# JSON output for monitoring
./scripts/monitoring/enhanced-health-check.sh --json

# Specific layer only
./scripts/monitoring/enhanced-health-check.sh --layer 1

# Verbose diagnostics
./scripts/monitoring/enhanced-health-check.sh --verbose
```

## Health Check Layers

| Layer | Check | Command | Timeout |
|-------|-------|---------|---------|
| 1 | HTTP Health Check | `./health-check-layer1.sh` | 10s |
| 2 | Database Connection | `./health-check-layer2.sh` | 10s |
| 3 | Database Query | `./health-check-layer3.sh` | 10s |
| 4 | OAuth Config | `./health-check-layer4.sh` | 10s |
| 5 | Redis Connection | `./health-check-layer5.sh` | 10s |

## Common Commands

### Production Server
```bash
# SSH to server
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190

# Run health checks
cd /root/health-check-scripts/monitoring
./enhanced-health-check.sh
```

### Local Development
```bash
# From project root
./scripts/monitoring/enhanced-health-check.sh
```

## Output Interpretation

### Status Levels
- **healthy**: All checks passed ✓
- **warning**: 1 check failed (investigate)
- **critical**: 2+ checks failed (urgent action)

### Exit Codes
- **0**: Success (healthy)
- **1**: Failure (warning/critical)
- **2**: Configuration error

## Troubleshooting

### Script hangs
```bash
# Use --no-retry to isolate
./enhanced-health-check.sh --no-retry

# Test individual layers
./health-check-layer1.sh
```

### Permission denied
```bash
chmod +x scripts/monitoring/*.sh
chmod +x scripts/lib/health-check.sh
```

### Container not found
```bash
# Check container status
docker ps | grep opclaw

# Update container name
export BACKEND_CONTAINER=correct-name
```

## Integration Examples

### With Deployment
```bash
./deploy-backend.sh && ./enhanced-health-check.sh --quick
```

### With Monitoring
```bash
# Get health status
STATUS=$(./enhanced-health-check.sh --json | jq -r '.overall_status')

# Alert if not healthy
if [ "$STATUS" != "healthy" ]; then
  send_alert "System health: $STATUS"
fi
```

### With Cron
```bash
# Add to crontab for periodic checks
*/5 * * * * cd /root/health-check-scripts && ./monitoring/enhanced-health-check.sh --quick
```

## Performance

| Mode | Layers | Time | Use Case |
|------|--------|------|----------|
| Full | 1-5 | 1.8s | Complete validation |
| Quick | 1,2,4,5 | 1.4s | Frequent monitoring |
| Single | 1 | 0.1s | Rapid diagnostics |

## Environment Variables

```bash
# Retry settings
MAX_RETRIES=3
INITIAL_BACKOFF=1
BACKOFF_MULTIPLIER=2

# Timeout settings
LAYER_TIMEOUT=10
TOTAL_TIMEOUT=60

# Container names
BACKEND_CONTAINER=opclaw-backend
POSTGRES_CONTAINER=opclaw-postgres
REDIS_CONTAINER=opclaw-redis

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=opclaw
DB_NAME=opclaw
```

## Quick Tips

1. **Use `--quick`** for frequent checks (every 1-5 minutes)
2. **Use `--json`** for monitoring system integration
3. **Use `--verbose`** for troubleshooting and diagnostics
4. **Use `--layer N`** to test specific components
5. **Use `--no-retry`** for faster failure detection

## Related Files

- **Main Script**: `/scripts/monitoring/enhanced-health-check.sh`
- **Library**: `/scripts/lib/health-check.sh`
- **Layer Scripts**: `/scripts/monitoring/health-check-layer*.sh`
- **Documentation**: `/docs/HEALTH_CHECK_GUIDE.md`
