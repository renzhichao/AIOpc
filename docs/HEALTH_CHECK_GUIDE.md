# Enhanced Health Check System - Complete Guide

## Overview

The Enhanced Health Check System provides comprehensive, multi-layer verification of all critical system components. It implements a robust health checking mechanism with retry logic, structured output, and actionable error reporting.

## Architecture

### Layer Design

The system uses a 5-layer architecture that progressively validates system health:

```
Layer 1: HTTP Health Check
├─ Backend container status
├─ HTTP 200 response from /health endpoint
└─ Valid JSON response parsing

Layer 2: Database Connection Check
├─ PostgreSQL container status
├─ Port 5432 listening check
├─ pg_isready validation
└─ Container health status

Layer 3: Database Query Test
├─ SELECT 1 query execution
├─ Timestamp query validation
├─ Connection count retrieval
└─ Database size information

Layer 4: OAuth Configuration Validation
├─ Feishu APP_ID validation
├─ Feishu APP_SECRET validation
├─ JWT_SECRET validation
├─ Feishu ENCRYPT_KEY validation
└─ OAuth endpoint accessibility

Layer 5: Redis Connection Check
├─ Redis container status
├─ Port 6379 listening check
├─ Redis PING response
├─ Redis authentication validation
└─ Redis server info retrieval
```

### Component Structure

```
scripts/
├── lib/
│   └── health-check.sh          # Health check library (shared functions)
└── monitoring/
    ├── enhanced-health-check.sh  # Main orchestration script
    ├── health-check-layer1.sh    # HTTP health check
    ├── health-check-layer2.sh    # Database connection check
    ├── health-check-layer3.sh    # Database query test
    ├── health-check-layer4.sh    # OAuth configuration validation
    └── health-check-layer5.sh    # Redis connection check
```

## Features

### 1. Retry Logic with Exponential Backoff

- **Default**: 3 retries with exponential backoff (1s, 2s, 4s)
- **Configurable**: Adjust `MAX_RETRIES`, `INITIAL_BACKOFF`, `BACKOFF_MULTIPLIER`
- **Smart**: Only retries on transient failures, skips on configuration errors

### 2. Structured Output

#### Human-Readable Format
```
============================================================
  Health Check Summary
============================================================
Overall Status: healthy
Checks: 5/5 passed
Total Execution Time: 1847ms

Recommendation: All systems operational. No action required.
============================================================
```

#### JSON Format
```json
{
  "check_start": "2026-03-19T04:05:11Z",
  "timeout_per_layer": 10,
  "max_retries": 3,
  "overall_status": "healthy",
  "summary": {
    "total_checks": 5,
    "passed": 5,
    "failed": 0,
    "execution_time_ms": 1847
  }
}
```

### 3. Health Status Classification

- **healthy**: All checks passed
- **warning**: 1 check failed (non-critical)
- **critical**: 2+ checks failed (system unavailable)

### 4. Actionable Error Messages

Each failure includes:
- **What failed**: Specific component or check
- **Why it failed**: Error details or diagnostics
- **Next steps**: Actionable remediation steps

Example:
```
[✗] Layer layer1: HTTP health endpoint not responding
Details: URL: http://localhost:3000/health | Expected: 200 | Received: 000
Action: Check backend logs: docker logs opclaw-backend
```

## Usage

### Basic Usage

Run all health checks with default settings:
```bash
./enhanced-health-check.sh
```

### Command-Line Options

| Option | Description | Example |
|--------|-------------|---------|
| `--json` | Output in JSON format | `./enhanced-health-check.sh --json` |
| `--verbose` | Show detailed information | `./enhanced-health-check.sh --verbose` |
| `--quick` | Skip non-critical checks (Layer 3) | `./enhanced-health-check.sh --quick` |
| `--layer N` | Run only specific layer (1-5) | `./enhanced-health-check.sh --layer 1` |
| `--no-retry` | Disable retry logic | `./enhanced-health-check.sh --no-retry` |
| `--timeout N` | Timeout per layer in seconds | `./enhanced-health-check.sh --timeout 15` |
| `--help` | Show usage information | `./enhanced-health-check.sh --help` |

### Run Individual Layer Checks

Each layer can be executed independently:

```bash
# Layer 1: HTTP Health Check
./health-check-layer1.sh

# Layer 2: Database Connection Check
./health-check-layer2.sh

# Layer 3: Database Query Test
./health-check-layer3.sh

# Layer 4: OAuth Configuration Validation
./health-check-layer4.sh

# Layer 5: Redis Connection Check
./health-check-layer5.sh
```

### Environment Variables

Configure behavior using environment variables:

```bash
# Retry configuration
export MAX_RETRIES=5
export INITIAL_BACKOFF=2
export BACKOFF_MULTIPLIER=2

# Timeout configuration
export LAYER_TIMEOUT=15
export TOTAL_TIMEOUT=120

# Container names
export BACKEND_CONTAINER=opclaw-backend
export POSTGRES_CONTAINER=opclaw-postgres
export REDIS_CONTAINER=opclaw-redis

# Database configuration
export DB_HOST=localhost
export DB_PORT=5432
export DB_USER=opclaw
export DB_NAME=opclaw

# Health check URLs
export HEALTH_URL=http://localhost:3000/health
```

## Integration

### With Deployment Scripts

Add health checks to deployment workflows:

```bash
#!/bin/bash
# Example deployment script with health checks

# Deploy new version
./deploy-backend.sh

# Run health checks
if ./enhanced-health-check.sh --quick --no-retry; then
    echo "Deployment successful, all systems healthy"
else
    echo "Health check failed, rolling back"
    ./rollback.sh
    exit 1
fi
```

### With Monitoring Systems

#### Prometheus Integration

```bash
# Run health check and parse output
HEALTH_OUTPUT=$(./enhanced-health-check.sh --json)
HEALTH_STATUS=$(echo "$HEALTH_OUTPUT" | jq -r '.overall_status')

# Update Prometheus metrics
curl -X POST http://pushgateway:9091/metrics/job/health-check \
  --data "health_status{status=\"$HEALTH_STATUS\"} 1"
```

#### AlertManager Integration

```bash
# Trigger alert on critical status
if ! ./enhanced-health-check.sh --json | jq -e '.overall_status == "healthy"'; then
    # Send alert to AlertManager
    curl -X POST http://alertmanager:9093/api/v1/alerts \
      -H 'Content-Type: application/json' \
      -d '{
        "alerts": [{
          "labels": {
            "alertname": "SystemHealthCritical",
            "severity": "critical"
          }
        }]
      }'
fi
```

### With CI/CD Pipelines

Add to CI/CD pipeline for automated testing:

```yaml
# Example GitHub Actions workflow
- name: Run Health Checks
  run: |
    ssh deploy-server 'cd /opt/scripts && ./enhanced-health-check.sh --json'

- name: Parse Results
  run: |
    STATUS=$(ssh deploy-server 'cd /opt/scripts && ./enhanced-health-check.sh --json' | jq -r '.overall_status')
    if [ "$STATUS" != "healthy" ]; then
      echo "Health check failed: $STATUS"
      exit 1
    fi
```

## Performance Metrics

Based on production testing (2026-03-19):

| Layer | Average Execution Time | Timeout |
|-------|----------------------|---------|
| Layer 1 | 89ms | 10s |
| Layer 2 | 190ms | 10s |
| Layer 3 | 457ms | 10s |
| Layer 4 | 516ms | 10s |
| Layer 5 | 569ms | 10s |
| **Total (All Layers)** | **1847ms** (1.8s) | 50s |
| **Total (Quick Mode)** | **1364ms** (1.4s) | 40s |

## Troubleshooting

### Common Issues

#### 1. Script Hangs or Times Out

**Symptoms**: Script appears to hang, no output after header

**Solutions**:
- Check if `set -e` is causing issues with arithmetic operations
- Verify all layer scripts have execute permissions: `chmod +x scripts/monitoring/*.sh`
- Ensure `health-check.sh` library is sourced correctly

**Debug Commands**:
```bash
# Test individual layer
./health-check-layer1.sh

# Enable verbose output
./enhanced-health-check.sh --verbose

# Disable retry to isolate issues
./enhanced-health-check.sh --no-retry
```

#### 2. Permission Denied Errors

**Symptoms**: `Permission denied` when executing scripts

**Solutions**:
```bash
# Make scripts executable
chmod +x scripts/monitoring/*.sh
chmod +x scripts/lib/health-check.sh
```

#### 3. Container Not Found

**Symptoms**: `Container X not running` errors

**Solutions**:
- Verify container names are correct
- Check if containers are running: `docker ps | grep opclaw`
- Update environment variables if using custom container names

```bash
# Check container status
docker ps --format 'table {{.Names}}\t{{.Status}}'

# Update container name if needed
export BACKEND_CONTAINER=my-custom-backend-name
```

#### 4. Database Connection Failures

**Symptoms**: Layer 2 or Layer 3 checks fail

**Solutions**:
```bash
# Check PostgreSQL container
docker logs opclaw-postgres --tail 50

# Verify database credentials
docker exec opclaw-postgres psql -U opclaw -d opclaw -c "SELECT 1;"

# Check pg_isready
docker exec opclaw-postgres pg_isready -U opclaw
```

#### 5. Redis Authentication Failures

**Symptoms**: Layer 5 shows Redis auth failed

**Solutions**:
```bash
# Check Redis password
docker exec opclaw-redis bash -c 'echo $REDIS_PASSWORD'

# Test Redis with auth
docker exec opclaw-redis redis-cli -a PASSWORD PING

# Update password if needed
export REDIS_PASSWORD=your-password
```

## Best Practices

### 1. Production Deployment

- **Always use retry logic** for production checks (default enabled)
- **Set appropriate timeouts** based on your infrastructure
- **Use quick mode** for frequent checks (every minute)
- **Use full checks** for less frequent validation (every 5-10 minutes)

### 2. Monitoring Integration

- **Parse JSON output** for automated monitoring systems
- **Set up alerts** for `critical` status
- **Create dashboards** for health check trends
- **Log results** for historical analysis

### 3. Incident Response

- **Run individual layers** to isolate failures
- **Check container logs** for failed components
- **Verify configuration** before restarting services
- **Use verbose mode** for detailed diagnostics

### 4. Performance Optimization

- **Quick mode** reduces execution time by 26% (1.4s vs 1.8s)
- **Increase timeouts** for slow networks or distant servers
- **Reduce retries** for faster failure detection
- **Cache results** for very frequent checks

## Maintenance

### Updating Health Checks

To add new checks or modify existing ones:

1. **Create new layer script**:
   ```bash
   cp health-check-layer1.sh health-check-layer6.sh
   # Edit health-check-layer6.sh with new checks
   ```

2. **Update orchestration script**:
   ```bash
   # Add LAYER6_SCRIPT variable
   LAYER6_SCRIPT="$LAYERS_DIR/health-check-layer6.sh"

   # Add layer execution in main()
   execute_layer 6 "$LAYER6_SCRIPT" "New Check Description"
   ```

3. **Test new layer**:
   ```bash
   ./health-check-layer6.sh --verbose
   ./enhanced-health-check.sh --layer 6
   ```

### Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-03-19 | Initial release with 5-layer health check system |

## Support

For issues or questions:
1. Check troubleshooting section above
2. Run with `--verbose` flag for detailed diagnostics
3. Test individual layers to isolate failures
4. Review container logs for failed components
5. Verify environment configuration

## Appendix

### Exit Codes

| Code | Meaning | Action |
|------|---------|--------|
| 0 | All checks passed (healthy) | No action required |
| 1 | Some checks failed (warning/critical) | Investigate failed layers |
| 2 | Configuration error | Verify script configuration and environment |
| 124 | Timeout error | Increase timeout or check system load |

### File Locations

**Production Server (118.25.0.190)**:
- Scripts: `/root/health-check-scripts/`
- Library: `/root/health-check-scripts/lib/health-check.sh`
- Main: `/root/health-check-scripts/monitoring/enhanced-health-check.sh`

**Development**:
- Scripts: `/Users/arthurren/projects/AIOpc/scripts/monitoring/`
- Library: `/Users/arthurren/projects/AIOpc/scripts/lib/health-check.sh`

### Related Documentation

- [FIP-001: Scan-to-Enable Feature](../fips/FIP_001_scan_to_enable.md) - Contains health check requirements
- [Production Deployment Guide](./07-local-deployment-guide.md) - Deployment procedures
- [Troubleshooting Guide](./troubleshooting.md) - Common issues and solutions
