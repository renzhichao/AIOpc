# FIP 021: Multi-Instance Single-Tenant Deployment Support

> **Feature Implementation Proposal**
> **Version**: 2.0
> **Created**: 2026-03-19
> **Last Updated**: 2026-03-19
> **Issue**: #21 - Support Multi-Service Instance Deployment
> **Status**: DRAFT - ENHANCED
> **Priority**: P0 - Critical

---

## Executive Summary

### Problem Statement

Current AIOpc platform deployment is **hardcoded to a single production server** (118.25.0.190), preventing the platform from serving multiple enterprise customers. Each customer requires:

- Independent server infrastructure
- Isolated database and resources
- Dedicated Feishu (Lark) OAuth application
- Custom domain and SSL configuration
- Separate configuration management

**Current Limitations**:
- Deployment target server hardcoded in workflow and scripts
- Single `.env.production` configuration file
- OAuth configuration hardcoded for one Feishu app
- No tenant management tooling
- Manual deployment processes

### Proposed Solution

Implement **Multi-Instance Single-Tenant** architecture where each tenant gets a completely independent deployment:

```
┌─────────────────────────────────────────────────────────────┐
│                    GitHub Repository                        │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  config/tenants/                                        │ │
│  │  ├── template.yml      (Configuration template)        │ │
│  │  ├── tenant_a.yml      (Customer A config)             │ │
│  │  ├── tenant_b.yml      (Customer B config)             │ │
│  │  └── tenant_c.yml      (Customer C config)             │ │
│  └────────────────────────────────────────────────────────┘ │
│                           │                                  │
│                           ▼                                  │
│              Parameterized Deployment Scripts               │
│                           │                                  │
│            ┌──────────┬───────────┬───────────┐             │
│            ▼          ▼           ▼           ▼             │
│      ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│      │Tenant A │ │Tenant B │ │Tenant C │ │Tenant D │       │
│      │Server   │ │Server   │ │Server   │ │Server   │       │
│      └─────────┘ └─────────┘ └─────────┘ └─────────┘       │
└─────────────────────────────────────────────────────────────┘
```

**Key Characteristics**:
- ✅ **Simple**: No database-level multi-tenancy complexity
- ✅ **Isolated**: Complete data and resource separation
- ✅ **Scalable**: Add tenants by deploying new instances
- ✅ **Manageable**: Configuration-driven deployment
- ✅ **Safe**: Comprehensive production safety nets
- ✅ **Secure**: Enhanced security with testing and validation

### Expected Outcomes

**Quantitative Benefits**:
- Deployment time reduced from 2-4 hours to <10 minutes per tenant
- Configuration errors reduced by 80% through validation
- Tenant onboarding time reduced by 90%
- Zero-downtime deployments with rollback verification
- 99.9% deployment success rate

**Qualitative Benefits**:
- Eliminate manual server configuration
- Reduce human error in deployment
- Enable rapid customer onboarding
- Simplify tenant management operations
- Production-grade safety and reliability

---

## Production Safety Net

> **CRITICAL**: This section MUST be fully implemented before ANY production deployment

### Zero-Downtime Migration Strategy

**Pre-Migration Requirements**:
1. **Full System Backup**
   - Database: Complete pg_dump with schema + data
   - Configuration: All .env files, docker-compose.yml
   - Code: Complete repository snapshot
   - SSH Keys: Backup all SSH private keys
   - Documentation: Current state documentation

2. **Staging Validation**
   - Deploy to staging environment first
   - Complete end-to-end testing
   - Performance validation
   - Security testing
   - OAuth flow verification

3. **Rollback Readiness**
   - Automated rollback scripts tested
   - Restoration procedures validated
   - Rollback time < 3 minutes
   - Data integrity verification

**Migration Execution Plan**:

```
┌─────────────────────────────────────────────────────────────────┐
│                   Production Migration Flow                     │
└─────────────────────────────────────────────────────────────────┘

PHASE 0: Pre-Migration (Day -7 to -1)
├─ Document current production state
├─ Create full system backup
├─ Set up staging environment
├─ Test deployment in staging
└─ Verify rollback procedures

PHASE 1: Maintenance Window (Day 0, 02:00-04:00)
├─ T-30min: Final backup verification
├─ T-15min: Pre-migration checks
├─ T-0: Announce maintenance
├─ T+5min: Execute migration
├─ T+20min: Health check validation
├─ T+30min: OAuth flow testing
├─ T+45min: Performance validation
└─ T+60min: Declare success OR rollback

PHASE 2: Post-Migration (Day 0-7)
├─ Monitoring for 24 hours (on-call)
├─ Daily health checks
├─ Performance monitoring
├─ User feedback collection
└─ Documentation updates
```

**Rollback Decision Tree**:
```
Health Check Failed?
    │
    ├─ Backend HTTP != 200?
    │   └─ YES: Check backend logs
    │       ├─ Database connection error?
    │       │   └─ YES: Restore .env.production from backup
    │       ├─ Port binding error?
    │       │   └─ YES: Restart backend container
    │       └─ Other error?
    │           └─ YES: Rollback to previous code
    │
    ├─ Database unhealthy?
    │   └─ YES: Check database logs
    │       ├─ Connection refused?
    │       │   └─ YES: Restart database container
    │       ├─ Data corruption?
    │       │   └─ YES: Restore database from backup
    │       └─ Other error?
    │           └─ YES: Escalate to DBA
    │
    └─ OAuth callback failing?
        └─ YES: Check Feishu configuration
            ├─ App ID mismatch?
            │   └─ YES: Restore .env.production
            ├─ Redirect URI mismatch?
            │   └─ YES: Update Feishu app config
            └─ Other error?
                └─ YES: Escalate to Feishu support

ROLLBACK EXECUTION (if ANY health check fails):
1. STOP: Immediately halt deployment
2. RESTORE: Database from backup
3. RESTORE: Code from previous version
4. RESTORE: Configuration files
5. VERIFY: All services healthy
6. NOTIFY: Team and stakeholders
7. DOCUMENT: Root cause analysis
```

### Configuration Drift Detection

**Automated Consistency Checks**:

```bash
#!/bin/bash
# scripts/monitoring/detect-config-drift.sh

# Check configuration consistency between Git and running containers
detect_config_drift() {
    local tenant_id=$1
    local config_file="config/tenants/${tenant_id}.yml"

    # Load expected configuration
    load_tenant_config "$config_file"

    # Fetch running configuration
    local running_config=$(ssh_exec "cat ${TENANT_DEPLOY_PATH}/.env.production")

    # Compare critical values
    local expected_feishu_app_id="${TENANT_FEISHU_APP_ID}"
    local running_feishu_app_id=$(echo "$running_config" | grep FEISHU_APP_ID | cut -d'=' -f2)

    if [ "$expected_feishu_app_id" != "$running_feishu_app_id" ]; then
        log_error "CONFIG DRIFT DETECTED: Feishu App ID mismatch"
        log_error "  Expected: $expected_feishu_app_id"
        log_error "  Running:  $running_feishu_app_id"
        return 1
    fi

    # Check other critical configuration...
}
```

**Scheduled Drift Detection**:
- **Daily**: Automated configuration consistency check
- **Weekly**: Manual configuration audit
- **Monthly**: Comprehensive configuration review

### Enhanced Health Checks

**Multi-Layer Health Validation**:

```bash
#!/bin/bash
# scripts/monitoring/enhanced-health-check.sh

enhanced_health_check() {
    local tenant_id=$1
    local health_status=0

    # Layer 1: HTTP Health Check
    local backend_http=$(curl -s -o /dev/null -w '%{http_code}' \
        http://localhost:3000/health)

    if [ "$backend_http" != "200" ]; then
        log_error "HTTP health check failed: HTTP $backend_http"
        health_status=1
    fi

    # Layer 2: Database Connectivity Check
    if ! docker exec ${TENANT_DB_CONTAINER} \
        pg_isready -U ${TENANT_DB_USER} &> /dev/null; then
        log_error "Database connectivity check failed"
        health_status=1
    fi

    # Layer 3: Database Query Test
    local db_test_result=$(docker exec ${TENANT_DB_CONTAINER} \
        psql -U ${TENANT_DB_USER} -d ${TENANT_DB_NAME} \
        -tAc "SELECT 1" 2>/dev/null)

    if [ "$db_test_result" != "1" ]; then
        log_error "Database query test failed"
        health_status=1
    fi

    # Layer 4: OAuth Configuration Check
    local oauth_test=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d '{"app_id":"'"${TENANT_FEISHU_APP_ID}"'"}' \
        http://localhost:3000/api/test/oauth/config)

    if ! echo "$oauth_test" | grep -q '"valid":true'; then
        log_error "OAuth configuration check failed"
        health_status=1
    fi

    # Layer 5: Redis Connectivity Check
    if ! docker exec ${TENANT_REDIS_CONTAINER} \
        redis-cli -a ${TENANT_REDIS_PASSWORD} PING &> /dev/null; then
        log_error "Redis connectivity check failed"
        health_status=1
    fi

    return $health_status
}
```

**False Positive Prevention**:
- Multiple validation layers (not just HTTP 200)
- Database query verification
- OAuth configuration validation
- Redis connectivity testing
- 3 retries with 30s exponential backoff

---

## Technical Architecture

### System Architecture Design

#### Multi-Instance Single-Tenant Pattern

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Development Environment                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  AIOpc Code Repository                                         │ │
│  │  ├─ platform/backend/          (Shared codebase)              │ │
│  │  ├─ platform/frontend/         (Shared codebase)              │ │
│  │  ├─ config/tenants/            (Tenant-specific configs)      │ │
│  │  ├─ scripts/deploy/            (Deployment scripts)           │ │
│  │  ├─ scripts/tenant/            (Management scripts)           │ │
│  │  ├─ scripts/monitoring/        (Monitoring & health checks)   │ │
│  │  ├─ scripts/security/          (Security validation)          │ │
│  │  └─ scripts/state/             (State management)             │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                │ Deployment Trigger
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      GitHub Actions Workflow                         │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  Input: Tenant ID, Component, Skip Tests                      │ │
│  │  Process:                                                     │ │
│  │    1. Load tenant config from config/tenants/{tenant}.yml     │ │
│  │    2. Validate configuration completeness                    │ │
│  │    3. Run unit tests                                         │ │
│  │    4. Run security tests                                      │ │
│  │    5. Build Docker images                                    │ │
│  │    6. Deploy to target server using SSH                      │ │
│  │    7. Enhanced health check with rollback                     │ │
│  │    8. Update deployment state                                 │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                │ SSH + rsync
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Tenant A Production Server                     │
│  server-a.example.com                                              │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  /opt/opclaw/                                                  │ │
│  │  ├─ .env.production          (Tenant A's Feishu OAuth)        │ │
│  │  ├─ docker-compose.yml      (Tenant A's services)            │ │
│  │  ├─ platform/backend/       (Deployed code)                  │ │
│  │  ├─ platform/frontend/      (Deployed code)                  │ │
│  │  └─ state/                   (Deployment state)              │ │
│  │                                                                │ │
│  │  Docker Containers:                                           │ │
│  │  ├─ opclaw-backend        (Tenant A's backend)               │ │
│  │  ├─ opclaw-frontend       (Tenant A's frontend)              │ │
│  │  ├─ opclaw-postgres       (Tenant A's database)              │ │
│  │  └─ opclaw-redis          (Tenant A's cache)                 │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      Tenant B Production Server                     │
│  server-b.example.com                                              │
│  (Similar isolated deployment with Tenant B's configuration)       │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      Tenant C Production Server                     │
│  server-c.example.com                                              │
│  (Similar isolated deployment with Tenant C's configuration)       │
└─────────────────────────────────────────────────────────────────────┘
```

### State Management Architecture

**Deployment State Database Schema**:

```sql
-- Database: deployment_state (PostgreSQL)
-- This database tracks all deployment state, version history, and audit trails

-- Tenants table
CREATE TABLE tenants (
    tenant_id VARCHAR(255) PRIMARY KEY,
    tenant_name VARCHAR(500) NOT NULL,
    environment VARCHAR(50) NOT NULL,
    server_host VARCHAR(255) NOT NULL,
    feishu_app_id VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    CONSTRAINT env_check CHECK (environment IN ('production', 'staging', 'development'))
);

-- Deployments table
CREATE TABLE deployments (
    deployment_id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(tenant_id),
    deployment_type VARCHAR(50) NOT NULL, -- 'initial', 'update', 'rollback'
    component VARCHAR(50) NOT NULL, -- 'all', 'backend', 'frontend'
    version VARCHAR(100) NOT NULL,
    git_commit_sha VARCHAR(100),
    git_branch VARCHAR(255),
    deployed_by VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL, -- 'pending', 'success', 'failed', 'rolled_back'
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    health_check_status VARCHAR(50),
    rollback_deployment_id INTEGER REFERENCES deployments(deployment_id),
    error_message TEXT,
    deployment_metadata JSONB,
    INDEX idx_tenant_deployments (tenant_id, started_at DESC),
    INDEX idx_status (status),
    INDEX idx_deployed_by (deployed_by)
);

-- Deployment configuration snapshots
CREATE TABLE deployment_config_snapshots (
    snapshot_id SERIAL PRIMARY KEY,
    deployment_id INTEGER NOT NULL REFERENCES deployments(deployment_id),
    config_content TEXT NOT NULL, -- YAML configuration
    env_content TEXT, -- .env.production content (encrypted)
    docker_compose_content TEXT, -- docker-compose.yml content
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(deployment_id)
);

-- Health check history
CREATE TABLE health_checks (
    health_check_id SERIAL PRIMARY KEY,
    deployment_id INTEGER NOT NULL REFERENCES deployments(deployment_id),
    tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(tenant_id),
    check_type VARCHAR(100) NOT NULL, -- 'http', 'database', 'oauth', 'redis'
    status VARCHAR(50) NOT NULL, -- 'pass', 'fail', 'warning'
    response_time_ms INTEGER,
    error_message TEXT,
    checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_deployment_health (deployment_id),
    INDEX idx_tenant_health (tenant_id, checked_at DESC)
);

-- Security audit log
CREATE TABLE security_audit_log (
    audit_id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) REFERENCES tenants(tenant_id),
    event_type VARCHAR(100) NOT NULL, -- 'ssh_access', 'config_change', 'deployment'
    actor VARCHAR(255) NOT NULL,
    action VARCHAR(255) NOT NULL,
    resource_type VARCHAR(100),
    resource_id VARCHAR(255),
    old_value JSONB,
    new_value JSONB,
    ip_address INET,
    user_agent TEXT,
    event_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tenant_audit (tenant_id, event_timestamp DESC),
    INDEX idx_actor_audit (actor, event_timestamp DESC),
    INDEX idx_event_type (event_type, event_timestamp DESC)
);

-- Configuration drift detection
CREATE TABLE config_drift_reports (
    drift_report_id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(tenant_id),
    drift_detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    config_file_path VARCHAR(500),
    expected_value TEXT,
    actual_value TEXT,
    drift_severity VARCHAR(50), -- 'critical', 'major', 'minor'
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP,
    INDEX idx_tenant_drift (tenant_id, drift_detected_at DESC),
    INDEX idx_unresolved_drift (resolved, drift_severity)
);

-- Incident tracking
CREATE TABLE incidents (
    incident_id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) REFERENCES tenants(tenant_id),
    deployment_id INTEGER REFERENCES deployments(deployment_id),
    incident_type VARCHAR(100) NOT NULL, -- 'deployment_failure', 'health_check_fail', 'security_breach'
    severity VARCHAR(50) NOT NULL, -- 'P0', 'P1', 'P2', 'P3'
    title VARCHAR(500) NOT NULL,
    description TEXT,
    impact TEXT,
    mitigation_steps TEXT,
    root_cause TEXT,
    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    resolution_notes TEXT,
    assignee VARCHAR(255),
    status VARCHAR(50) DEFAULT 'open', -- 'open', 'investigating', 'resolved', 'closed'
    INDEX idx_tenant_incidents (tenant_id, detected_at DESC),
    INDEX idx_severity (severity, status),
    INDEX idx_status (status, detected_at DESC)
);

-- Views for common queries
CREATE VIEW deployment_summary AS
SELECT
    d.deployment_id,
    d.tenant_id,
    t.tenant_name,
    d.deployment_type,
    d.component,
    d.version,
    d.status,
    d.deployed_by,
    d.started_at,
    d.completed_at,
    EXTRACT(EPOCH FROM (d.completed_at - d.started_at)) as deployment_duration_seconds,
    (SELECT COUNT(*) FROM health_checks hc WHERE hc.deployment_id = d.deployment_id AND hc.status = 'pass') as health_checks_passed,
    (SELECT COUNT(*) FROM health_checks hc WHERE hc.deployment_id = d.deployment_id AND hc.status = 'fail') as health_checks_failed
FROM deployments d
JOIN tenants t ON d.tenant_id = t.tenant_id
ORDER BY d.started_at DESC;

CREATE VIEW tenant_status AS
SELECT
    t.tenant_id,
    t.tenant_name,
    t.environment,
    t.server_host,
    (SELECT COUNT(*) FROM deployments d WHERE d.tenant_id = t.tenant_id AND d.status = 'success' AND d.started_at > NOW() - INTERVAL '7 days') as successful_deployments_7d,
    (SELECT MAX(d.started_at) FROM deployments d WHERE d.tenant_id = t.tenant_id) as last_deployment_at,
    (SELECT MAX(hc.checked_at) FROM health_checks hc WHERE hc.tenant_id = t.tenant_id AND hc.status = 'pass') as last_healthy_check_at,
    (SELECT COUNT(*) FROM incidents i WHERE i.tenant_id = t.tenant_id AND i.status != 'closed') as open_incidents,
    t.is_active
FROM tenants t;
```

**State Management Library** (`scripts/lib/state.sh`):

```bash
#!/bin/bash
#==============================================================================
# State Management Library
# (状态管理库)
#
# Functions for tracking deployment state, version history, and audit trails
#
#==============================================================================

STATE_DB_HOST="${DEPLOYMENT_STATE_DB_HOST:-localhost}"
STATE_DB_NAME="${DEPLOYMENT_STATE_DB_NAME:-deployment_state}"
STATE_DB_USER="${DEPLOYMENT_STATE_DB_USER:-opclaw_deploy}"
STATE_DB_PASSWORD="${DEPLOYMENT_STATE_DB_PASSWORD:-}"

#------------------------------------------------------------------------------
# Record Deployment Start
#------------------------------------------------------------------------------

record_deployment_start() {
    local tenant_id=$1
    local deployment_type=$2
    local component=$3
    local version=$4
    local deployed_by=$5
    local git_commit_sha=$6
    local git_branch=$7

    psql -h "$STATE_DB_HOST" -U "$STATE_DB_USER" -d "$STATE_DB_NAME" << EOF
INSERT INTO deployments (
    tenant_id, deployment_type, component, version,
    git_commit_sha, git_branch, deployed_by, status
) VALUES (
    '$tenant_id', '$deployment_type', '$component', '$version',
    '$git_commit_sha', '$git_branch', '$deployed_by', 'pending'
) RETURNING deployment_id;
EOF
}

#------------------------------------------------------------------------------
# Record Deployment Success
#------------------------------------------------------------------------------

record_deployment_success() {
    local deployment_id=$1
    local health_check_status=$2

    psql -h "$STATE_DB_HOST" -U "$STATE_DB_USER" -d "$STATE_DB_NAME" << EOF
UPDATE deployments
SET
    status = 'success',
    completed_at = CURRENT_TIMESTAMP,
    health_check_status = '$health_check_status'
WHERE deployment_id = $deployment_id;
EOF
}

#------------------------------------------------------------------------------
# Record Deployment Failure
#------------------------------------------------------------------------------

record_deployment_failure() {
    local deployment_id=$1
    local error_message=$2

    psql -h "$STATE_DB_HOST" -U "$STATE_DB_USER" -d "$STATE_DB_NAME" << EOF
UPDATE deployments
SET
    status = 'failed',
    completed_at = CURRENT_TIMESTAMP,
    error_message = '$error_message'
WHERE deployment_id = $deployment_id;
EOF
}

#------------------------------------------------------------------------------
# Record Configuration Snapshot
#------------------------------------------------------------------------------

record_config_snapshot() {
    local deployment_id=$1
    local config_file=$2
    local env_file=$3
    local docker_compose_file=$4

    local config_content=$(cat "$config_file" | base64)
    local env_content=$(cat "$env_file" | base64)
    local docker_content=$(cat "$docker_compose_file" | base64)

    psql -h "$STATE_DB_HOST" -U "$STATE_DB_USER" -d "$STATE_DB_NAME" << EOF
INSERT INTO deployment_config_snapshots (
    deployment_id, config_content, env_content, docker_compose_content
) VALUES (
    $deployment_id, '$config_content', '$env_content', '$docker_content'
);
EOF
}

#------------------------------------------------------------------------------
# Record Health Check
#------------------------------------------------------------------------------

record_health_check() {
    local deployment_id=$1
    local tenant_id=$2
    local check_type=$3
    local status=$4
    local response_time_ms=$5
    local error_message=$6

    psql -h "$STATE_DB_HOST" -U "$STATE_DB_USER" -d "$STATE_DB_NAME" << EOF
INSERT INTO health_checks (
    deployment_id, tenant_id, check_type, status,
    response_time_ms, error_message
) VALUES (
    $deployment_id, '$tenant_id', '$check_type', '$status',
    $response_time_ms, ${error_message:+"'$error_message'"}
);
EOF
}

#------------------------------------------------------------------------------
# Record Security Audit Event
#------------------------------------------------------------------------------

record_security_audit() {
    local tenant_id=$1
    local event_type=$2
    local actor=$3
    local action=$4
    local resource_type=$5
    local resource_id=$6
    local ip_address=$7
    local user_agent=$8

    psql -h "$STATE_DB_HOST" -U "$STATE_DB_USER" -d "$STATE_DB_NAME" << EOF
INSERT INTO security_audit_log (
    tenant_id, event_type, actor, action,
    resource_type, resource_id, ip_address, user_agent
) VALUES (
    '$tenant_id', '$event_type', '$actor', '$action',
    ${resource_type:+"'$resource_type'"}, ${resource_id:+"'$resource_id'"},
    ${ip_address:+"INET '$ip_address'"}, ${user_agent:+"'$user_agent'"}
);
EOF
}

#------------------------------------------------------------------------------
# Get Tenant Last Deployment
#------------------------------------------------------------------------------

get_tenant_last_deployment() {
    local tenant_id=$1

    psql -h "$STATE_DB_HOST" -U "$STATE_DB_USER" -d "$STATE_DB_NAME" -tAc << EOF
SELECT deployment_id, version, status, started_at
FROM deployments
WHERE tenant_id = '$tenant_id'
ORDER BY started_at DESC
LIMIT 1;
EOF
}

#------------------------------------------------------------------------------
# Check For Concurrent Deployment
#------------------------------------------------------------------------------

check_concurrent_deployment() {
    local tenant_id=$1

    local active_count=$(psql -h "$STATE_DB_HOST" -U "$STATE_DB_USER" -d "$STATE_DB_NAME" -tAc << EOF
SELECT COUNT(*)
FROM deployments
WHERE tenant_id = '$tenant_id'
  AND status = 'pending'
  AND started_at > NOW() - INTERVAL '1 hour';
EOF
)

    if [ "$active_count" -gt 0 ]; then
        echo "ERROR: Concurrent deployment detected for tenant $tenant_id"
        echo "Active deployments: $active_count"
        return 1
    fi

    return 0
}

#------------------------------------------------------------------------------
# Record Configuration Drift
#------------------------------------------------------------------------------

record_config_drift() {
    local tenant_id=$1
    local config_file_path=$2
    local expected_value=$3
    local actual_value=$4
    local drift_severity=$5

    psql -h "$STATE_DB_HOST" -U "$STATE_DB_USER" -d "$STATE_DB_NAME" << EOF
INSERT INTO config_drift_reports (
    tenant_id, config_file_path, expected_value,
    actual_value, drift_severity
) VALUES (
    '$tenant_id', '$config_file_path', '$expected_value',
    '$actual_value', '$drift_severity'
);
EOF
}
```

### Security Considerations

#### Enhanced SSH Key Management

**SSH Key Rotation Procedures**:

```bash
#!/bin/bash
#==============================================================================
# SSH Key Rotation Script
# (SSH 密钥轮换脚本)
#
# Description:
#   Automates SSH key rotation for tenant servers with minimal downtime
#
# Usage:
#   ./scripts/security/rotate-ssh-key.sh --tenant <tenant_id>
#
#==============================================================================

set -e
set -u
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/config.sh"
source "$SCRIPT_DIR/../lib/logging.sh"

#------------------------------------------------------------------------------
# Generate New SSH Key Pair
#------------------------------------------------------------------------------

generate_new_ssh_key() {
    local tenant_id=$1
    local key_path="$HOME/.ssh/${tenant_id}_key_$(date +%Y%m%d)"

    log_step "Generating new SSH key pair for $tenant_id"

    ssh-keygen -t rsa -b 4096 -f "$key_path" -N "" -C "${tenant_id}_deploy_$(date +%Y%m%d)"

    chmod 600 "$key_path"
    chmod 644 "${key_path}.pub"

    echo "$key_path"
}

#------------------------------------------------------------------------------
# Deploy New SSH Key to Server
#------------------------------------------------------------------------------

deploy_new_ssh_key() {
    local new_key_path=$1
    local server_host=$2
    local ssh_user=$3
    local old_key_path=$4

    log_step "Deploying new SSH key to server"

    # Add new key to server's authorized_keys
    ssh-copy-key -i "${new_key_path}.pub" \
        -o StrictHostKeyChecking=no \
        "${ssh_user}@${server_host}" || {
        log_error "Failed to deploy new SSH key"
        return 1
    }

    # Test new key connection
    if ! ssh -i "$new_key_path" -o StrictHostKeyChecking=no \
        -o ConnectTimeout=10 "${ssh_user}@${server_host}" "echo 'Connection successful'"; then
        log_error "New SSH key connection test failed"
        return 1
    fi

    log_success "New SSH key deployed and tested successfully"
    return 0
}

#------------------------------------------------------------------------------
# Remove Old SSH Key from Server
#------------------------------------------------------------------------------

remove_old_ssh_key() {
    local old_key_path=$1
    local server_host=$2
    local ssh_user=$3
    local new_key_path=$4

    log_step "Removing old SSH key from server"

    # Get the old public key
    local old_public_key=$(cat "${old_key_path}.pub")

    # Remove from authorized_keys using new key
    ssh -i "$new_key_path" -o StrictHostKeyChecking=no \
        "${ssh_user}@${server_host}" \
        "sed -i '/${old_public_key}/d' ~/.ssh/authorized_keys" || {
        log_warning "Failed to remove old key from authorized_keys (may have already been removed)"
    }

    log_success "Old SSH key removed from server"
}

#------------------------------------------------------------------------------
# Update GitHub Secrets
#------------------------------------------------------------------------------

update_github_secrets() {
    local tenant_id=$1
    local new_key_path=$2
    local github_token=$3

    log_step "Updating GitHub Secrets"

    local new_private_key=$(cat "$new_key_path")
    local new_public_key=$(cat "${new_key_path}.pub")

    # Update GitHub Secrets using GitHub API
    local secret_name="SSH_PRIVATE_KEY_${tenant_id^^}"

    # This requires GitHub CLI or API call
    # Example using gh CLI:
    # echo "$new_private_key" | gh secret set "$secret_name"

    log_info "Manual step: Update GitHub Secret $secret_name"
    log_info "New key path: $new_key_path"
    log_info "Public key for authorized_keys:"
    echo "$new_public_key"
}

#------------------------------------------------------------------------------
# Archive Old SSH Key
#------------------------------------------------------------------------------

archive_old_ssh_key() {
    local old_key_path=$1
    local archive_dir="$HOME/.ssh/archive"

    log_step "Archiving old SSH key"

    mkdir -p "$archive_dir"

    local archive_name="$(basename "$old_key_path")_archived_$(date +%Y%m%d_%H%M%S)"

    mv "$old_key_path" "$archive_dir/${archive_name}"
    mv "${old_key_path}.pub" "$archive_dir/${archive_name}.pub"

    log_success "Old SSH key archived to $archive_dir/${archive_name}"
}

#------------------------------------------------------------------------------
# Main Rotation Process
#------------------------------------------------------------------------------

main() {
    local tenant_id=""
    local dry_run=false

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --tenant)
                tenant_id="$2"
                shift 2
                ;;
            --dry-run)
                dry_run=true
                shift
                ;;
            *)
                echo "Unknown option: $1"
                exit 1
                ;;
        esac
    done

    if [ -z "$tenant_id" ]; then
        echo "ERROR: --tenant is required"
        exit 1
    fi

    # Load tenant configuration
    local config_file="config/tenants/${tenant_id}.yml"
    load_tenant_config "$config_file"

    local server_host="${TENANT_SERVER_HOST}"
    local ssh_user="${TENANT_SSH_USER}"
    local old_key_path="${TENANT_SSH_KEY_PATH}"

    log_info "Starting SSH key rotation for $tenant_id"
    log_info "Server: $server_host"
    log_info "Old key: $old_key_path"

    if [ "$dry_run" = true ]; then
        log_warning "Dry run mode - no changes will be made"
        exit 0
    fi

    # Step 1: Generate new SSH key
    local new_key_path=$(generate_new_ssh_key "$tenant_id")

    # Step 2: Deploy new SSH key to server
    if ! deploy_new_ssh_key "$new_key_path" "$server_host" "$ssh_user" "$old_key_path"; then
        log_error "Failed to deploy new SSH key, aborting rotation"
        rm -f "$new_key_path" "${new_key_path}.pub"
        exit 1
    fi

    # Step 3: Update GitHub Secrets (manual step with instructions)
    update_github_secrets "$tenant_id" "$new_key_path"

    # Step 4: Remove old SSH key from server
    remove_old_ssh_key "$old_key_path" "$server_host" "$ssh_user" "$new_key_path"

    # Step 5: Archive old SSH key
    archive_old_ssh_key "$old_key_path"

    # Step 6: Update tenant configuration
    log_step "Updating tenant configuration"
    # Update the ssh_key_path in tenant config
    # This needs to be done manually or via yq

    log_success "SSH key rotation completed successfully"
    log_info "New key: $new_key_path"
    log_info "Next steps:"
    log_info "  1. Update config/tenants/${tenant_id}.yml with new key path"
    log_info "  2. Update GitHub Secret SSH_PRIVATE_KEY_${tenant_id^^}"
    log_info "  3. Test deployment with new key"
    log_info "  4. Remove old key from GitHub Secrets after testing"
}

main "$@"
```

**SSH Key Rotation Schedule**:
- **Frequency**: Every 90 days (quarterly)
- **Process**: Automated script with manual verification steps
- **Backup**: Old keys archived with timestamps
- **Audit**: All rotation events logged to security_audit_log table

**SSH Key Audit Trail**:

```sql
-- SSH key usage tracking
CREATE TABLE ssh_key_audit (
    audit_id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    key_fingerprint VARCHAR(100) NOT NULL,
    key_path VARCHAR(500),
    action VARCHAR(100) NOT NULL, -- 'created', 'rotated', 'archived', 'used'
    actor VARCHAR(255) NOT NULL,
    ip_address INET,
    action_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tenant_keys (tenant_id, action_timestamp DESC),
    INDEX idx_key_fingerprint (key_fingerprint)
);

-- Function to log SSH key usage
CREATE OR REPLACE FUNCTION log_ssh_key_usage(
    p_tenant_id VARCHAR,
    p_key_fingerprint VARCHAR,
    p_action VARCHAR,
    p_actor VARCHAR,
    p_ip_address INET DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    INSERT INTO ssh_key_audit (
        tenant_id, key_fingerprint, action, actor, ip_address
    ) VALUES (
        p_tenant_id, p_key_fingerprint, p_action, p_actor, p_ip_address
    );
END;
$$ LANGUAGE plpgsql;
```

#### Security Testing Strategy

**Security Test Scenarios**:

```bash
#!/bin/bash
#==============================================================================
# Security Testing Script
# (安全测试脚本)
#
# Description:
#   Comprehensive security validation for multi-tenant deployments
#
# Usage:
#   ./scripts/security/security-test.sh --tenant <tenant_id>
#
#==============================================================================

set -e
set -u
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/config.sh"
source "$SCRIPT_DIR/../lib/logging.sh"

#------------------------------------------------------------------------------
# Test SSH Key Isolation
#------------------------------------------------------------------------------

test_ssh_key_isolation() {
    local tenant_id=$1

    log_step "Testing SSH Key Isolation"

    local test_passed=true

    # Test 1: Verify SSH key cannot access other tenants
    for other_tenant in tenant_a tenant_b tenant_c; do
        if [ "$other_tenant" != "$tenant_id" ]; then
            if ssh -i "${TENANT_SSH_KEY_PATH}" -o StrictHostKeyChecking=no \
                -o ConnectTimeout=5 -o BatchMode=yes \
                "${TENANT_SSH_USER}@${other_tenant}.example.com" "echo 'ERROR: Cross-tenant access'" 2>/dev/null; then
                log_error "SECURITY VIOLATION: SSH key can access $other_tenant"
                test_passed=false
            fi
        fi
    done

    # Test 2: Verify SSH key permissions
    local key_perms=$(stat -c "%a" "${TENANT_SSH_KEY_PATH}" 2>/dev/null || stat -f "%OLp" "${TENANT_SSH_KEY_PATH}")
    if [ "$key_perms" != "600" ]; then
        log_error "SSH key permissions incorrect: $key_perms (should be 600)"
        test_passed=false
    fi

    # Test 3: Verify SSH key is not passphrase-protected (for automation)
    # Note: This is acceptable for deployment keys, but should be documented

    if [ "$test_passed" = true ]; then
        log_success "SSH key isolation tests passed"
        return 0
    else
        log_error "SSH key isolation tests failed"
        return 1
    fi
}

#------------------------------------------------------------------------------
# Test Cross-Tenant Data Leak Prevention
#------------------------------------------------------------------------------

test_cross_tenant_leak_prevention() {
    local tenant_id=$1

    log_step "Testing Cross-Tenant Leak Prevention"

    local test_passed=true

    # Test 1: Verify database isolation
    local db_result=$(docker exec ${TENANT_DB_CONTAINER} \
        psql -U ${TENANT_DB_USER} -d ${TENANT_DB_NAME} \
        -tAc "SELECT COUNT(*) FROM users WHERE tenant_id != '$tenant_id'" 2>/dev/null || echo "0")

    if [ "$db_result" -gt 0 ]; then
        log_error "SECURITY VIOLATION: Database contains data from other tenants"
        test_passed=false
    fi

    # Test 2: Verify Redis isolation
    local redis_keys=$(docker exec ${TENANT_REDIS_CONTAINER} \
        redis-cli -a ${TENANT_REDIS_PASSWORD} KEYS "*tenant_${tenant_id}*" 2>/dev/null | wc -l)

    # Should only have keys for this tenant
    local other_keys=$(docker exec ${TENANT_REDIS_CONTAINER} \
        redis-cli -a ${TENANT_REDIS_PASSWORD} KEYS "*" 2>/dev/null | grep -v "tenant_${tenant_id}" | wc -l)

    if [ "$other_keys" -gt 0 ]; then
        log_error "SECURITY WARNING: Redis contains keys potentially from other tenants"
        # This might be acceptable if keys are properly namespaced
    fi

    # Test 3: Verify OAuth configuration isolation
    local oauth_result=$(curl -s http://localhost:3000/api/oauth/config | jq -r '.app_id')
    if [ "$oauth_result" != "${TENANT_FEISHU_APP_ID}" ]; then
        log_error "SECURITY VIOLATION: OAuth configuration mismatch"
        test_passed=false
    fi

    if [ "$test_passed" = true ]; then
        log_success "Cross-tenant leak prevention tests passed"
        return 0
    else
        log_error "Cross-tenant leak prevention tests failed"
        return 1
    fi
}

#------------------------------------------------------------------------------
# Test Secret Validation
#------------------------------------------------------------------------------

test_secret_validation() {
    local tenant_id=$1

    log_step "Testing Secret Validation"

    local test_passed=true

    # Test 1: Verify no placeholder values in production
    local env_file="${TENANT_DEPLOY_PATH}/.env.production"
    local placeholders=$(grep -E 'cli_xxxxxxxxxxxxx|CHANGE_THIS|your_|placeholder' "$env_file" || echo "")

    if [ -n "$placeholders" ]; then
        log_error "SECURITY VIOLATION: Placeholder values found in production"
        echo "$placeholders"
        test_passed=false
    fi

    # Test 2: Verify secret strength
    local db_password="${TENANT_DB_PASSWORD}"
    if [ ${#db_password} -lt 16 ]; then
        log_error "SECURITY WARNING: Database password too short (< 16 characters)"
        test_passed=false
    fi

    local jwt_secret="${TENANT_JWT_SECRET}"
    if [ ${#jwt_secret} -lt 32 ]; then
        log_error "SECURITY WARNING: JWT secret too short (< 32 characters)"
        test_passed=false
    fi

    # Test 3: Verify secrets are not in logs
    # Check recent logs for exposed secrets
    local logs_with_secrets=$(docker logs opclaw-backend 2>&1 | \
        grep -c "${TENANT_DB_PASSWORD}" || echo "0")

    if [ "$logs_with_secrets" -gt 0 ]; then
        log_error "SECURITY VIOLATION: Secrets found in logs"
        test_passed=false
    fi

    if [ "$test_passed" = true ]; then
        log_success "Secret validation tests passed"
        return 0
    else
        log_error "Secret validation tests failed"
        return 1
    fi
}

#------------------------------------------------------------------------------
# Main Security Test Execution
#------------------------------------------------------------------------------

main() {
    local tenant_id=""

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --tenant)
                tenant_id="$2"
                shift 2
                ;;
            *)
                echo "Unknown option: $1"
                exit 1
                ;;
        esac
    done

    if [ -z "$tenant_id" ]; then
        echo "ERROR: --tenant is required"
        exit 1
    fi

    # Load tenant configuration
    local config_file="config/tenants/${tenant_id}.yml"
    load_tenant_config "$config_file"

    log_info "Starting security tests for $tenant_id"

    local test_results=()

    # Run all security tests
    if test_ssh_key_isolation "$tenant_id"; then
        test_results+=("SSH Key Isolation: PASS")
    else
        test_results+=("SSH Key Isolation: FAIL")
    fi

    if test_cross_tenant_leak_prevention "$tenant_id"; then
        test_results+=("Cross-Tenant Leak Prevention: PASS")
    else
        test_results+=("Cross-Tenant Leak Prevention: FAIL")
    fi

    if test_secret_validation "$tenant_id"; then
        test_results+=("Secret Validation: PASS")
    else
        test_results+=("Secret Validation: FAIL")
    fi

    # Print results
    echo ""
    echo "=================================="
    echo "Security Test Results"
    echo "=================================="
    for result in "${test_results[@]}"; do
        echo "$result"
    done
    echo "=================================="

    # Exit with error if any test failed
    if echo "${test_results[@]}" | grep -q "FAIL"; then
        log_error "One or more security tests failed"
        exit 1
    else
        log_success "All security tests passed"
        exit 0
    fi
}

main "$@"
```

### Configuration Management Improvements

**Reduced GitHub Actions Dependency**:

```bash
#!/bin/bash
#==============================================================================
# Local Deployment Script
# (本地部署脚本)
#
# Description:
#   Enables local deployment without GitHub Actions dependency
#
# Usage:
#   ./scripts/deploy/deploy-local.sh --config config/tenants/tenant_a.yml
#
#==============================================================================

set -e
set -u
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Source library functions
source "$PROJECT_ROOT/scripts/lib/config.sh"
source "$PROJECT_ROOT/scripts/lib/validation.sh"
source "$PROJECT_ROOT/scripts/lib/logging.sh"
source "$PROJECT_ROOT/scripts/lib/ssh.sh"
source "$PROJECT_ROOT/scripts/lib/state.sh"

# Main deployment flow
main() {
    local config_file=$1

    # Load configuration
    load_tenant_config "$config_file"

    # Validate configuration
    if ! validate_tenant_config; then
        log_error "Configuration validation failed"
        exit 1
    fi

    # Check for concurrent deployments
    if ! check_concurrent_deployment "$TENANT_ID"; then
        log_error "Concurrent deployment detected"
        exit 1
    fi

    # Record deployment start
    local deployment_id=$(record_deployment_start \
        "$TENANT_ID" "update" "all" "local" \
        "$(whoami)" "$(git rev-parse HEAD)" "$(git branch --show-current)")

    # Create backup
    create_backup

    # Deploy
    if ! deploy_backend; then
        record_deployment_failure "$deployment_id" "Backend deployment failed"
        rollback
        exit 1
    fi

    # Health check
    if ! enhanced_health_check "$TENANT_ID"; then
        record_deployment_failure "$deployment_id" "Health check failed"
        rollback
        exit 1
    fi

    # Record success
    record_deployment_success "$deployment_id" "all_pass"

    log_success "Local deployment completed successfully"
}

# Execute main
main "$@"
```

### Blue-Green Deployment Pattern (Future Evolution)

**Design for Future Implementation**:

```
┌─────────────────────────────────────────────────────────────────┐
│                   Blue-Green Deployment Pattern                  │
│              (Planned for Evolution - 3-5 year path)            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    Load Balancer (Nginx)                        │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Current: Blue (100%) ────────────────────────────────→    │ │
│  │  Switch: ───────────────────────→ Green (100%)             │ │
│  │  Rollback: Green (100%) ─────────────────────────→ Blue    │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
         │                                        │
         │                                        │
    ┌────▼────┐                            ┌────▼────┐
    │  Blue   │                            │  Green  │
    │ (Active)│                            │ (Idle)  │
    └─────────┘                            └─────────┘
    Version 1.0                            Version 1.1
```

**Implementation Timeline**:
- **Phase 1** (Current): In-place upgrades with rollback
- **Phase 2** (Year 2): Blue-green infrastructure setup
- **Phase 3** (Year 3): Automated blue-green deployments
- **Phase 4** (Year 4): Canary deployments
- **Phase 5** (Year 5): Full multi-tenancy with shared infrastructure

---

## Implementation Plan

### Phased Implementation Approach

```
┌─────────────────────────────────────────────────────────────────┐
│                   Implementation Phases                         │
└─────────────────────────────────────────────────────────────────┘

Phase 0: Production Safety Net (Week 0 - CRITICAL)
├─ Zero-downtime migration strategy
├─ Enhanced health checks implementation
├─ Configuration drift detection
├─ Rollback verification procedures
└─ Production backup validation

Phase 1: Foundation (Week 1)
├─ Configuration system
├─ Tenant config template
├─ Config validation scripts
├─ State management database
├─ Documentation

Phase 2: Deployment Automation (Week 2)
├─ Parameterized deploy scripts
├─ Environment variable resolution
├─ GitHub Actions workflow
├─ Rollback mechanisms
├─ Local deployment support

Phase 3: Management Tools (Week 3)
├─ Tenant CRUD scripts
├─ Health check scripts
├─ Batch deployment tools
├─ Monitoring integration
├─ SSH key management

Phase 4: Testing & Validation (Week 4)
├─ Unit tests
├─ Integration tests
├─ Security tests
├─ Concurrent operations tests
├─ Disaster recovery tests
├─ End-to-end deployment tests
└─ Performance validation

Phase 5: Documentation & Training (Week 5)
├─ Operations runbook
├─ Troubleshooting guide
├─ Security procedures
├─ Team training
└─ Production migration
```

### Enhanced Testing Strategy

#### Test Data Management

**Test Data Generation**:

```bash
#!/bin/bash
#==============================================================================
# Test Data Generator
# (测试数据生成器)
#
# Description:
#   Generates synthetic test data for development and testing
#   with PII redaction and data sanitization
#
#==============================================================================

generate_test_user_data() {
    local count=$1
    local tenant_id=$2

    log_step "Generating $count test users for $tenant_id"

    for i in $(seq 1 $count); do
        local username="test_user_${i}_${tenant_id}"
        local email="test${i}@${tenant_id}.example.com"
        local phone="+86138${printf "%08d" $i}"
        local company="Test Company ${tenant_id^^}"

        # Insert test data
        docker exec ${TENANT_DB_CONTAINER} \
            psql -U ${TENANT_DB_USER} -d ${TENANT_DB_NAME} << EOF
INSERT INTO users (
    username, email, phone, company, tenant_id,
    created_at, updated_at, is_test_data
) VALUES (
    '$username', '$email', '$phone', '$company', '$tenant_id',
    NOW(), NOW(), true
);
EOF
    done

    log_success "Generated $count test users"
}

redact_pii_data() {
    local input_file=$1
    local output_file=$2

    log_step "Redacting PII data from $input_file"

    # Redact email addresses
    sed -E 's/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/REDACTED_EMAIL/g' \
        "$input_file" > "$output_file"

    # Redact phone numbers
    sed -i -E 's/\+?[0-9]{10,15}/REDACTED_PHONE/g' "$output_file"

    # Redate ID numbers
    sed -i -E 's/[0-9X]{18}/REDACTED_ID/g' "$output_file"

    log_success "PII data redacted to $output_file"
}

cleanup_test_data() {
    local tenant_id=$1

    log_step "Cleaning up test data for $tenant_id"

    local deleted_count=$(docker exec ${TENANT_DB_CONTAINER} \
        psql -U ${TENANT_DB_USER} -d ${TENANT_DB_NAME} -tAc << EOF
DELETE FROM users
WHERE tenant_id = '$tenant_id'
  AND is_test_data = true
RETURNING COUNT(*);
EOF
)

    log_success "Deleted $deleted_count test users"
}
```

**Test Environment Setup**:

```
┌─────────────────────────────────────────────────────────────────┐
│                  Test Environment Architecture                  │
└─────────────────────────────────────────────────────────────────┘

Test Servers:
├─ staging-1.example.com (Integration tests)
├─ staging-2.example.com (Performance tests)
└─ staging-3.example.com (Security tests)

Test Tenants:
├─ test_tenant_alpha (Functional tests)
├─ test_tenant_beta (Security tests)
└─ test_tenant_gamma (Performance tests)

Test Data:
├─ Synthetic users: 1000 per test tenant
├─ Test orders: 5000 per test tenant
├─ Test documents: 200 per test tenant
└─ PII Data: All redacted/anonymized
```

#### Disaster Recovery Testing

**Full System Restore Tests**:

```bash
#!/bin/bash
#==============================================================================
# Disaster Recovery Test Script
# (灾难恢复测试脚本)
#
# Description:
#   Validates full system restore capabilities
#
# Usage:
#   ./scripts/testing/disaster-recovery-test.sh --tenant test_tenant_alpha
#
#==============================================================================

run_disaster_recovery_test() {
    local tenant_id=$1
    local test_date=$(date +%Y%m%d_%H%M%S)

    log_step "Starting disaster recovery test for $tenant_id"

    # Step 1: Create baseline backup
    log_info "Creating baseline backup"
    ./scripts/backup/backup-tenant.sh --tenant "$tenant_id"

    # Step 2: Simulate data loss
    log_warning "Simulating data loss (destructive test)"
    docker exec ${TENANT_DB_CONTAINER} \
        psql -U ${TENANT_DB_USER} -d ${TENANT_DB_NAME} \
        -c "DROP TABLE IF EXISTS users CASCADE;"

    # Step 3: Verify data loss
    local table_exists=$(docker exec ${TENANT_DB_CONTAINER} \
        psql -U ${TENANT_DB_USER} -d ${TENANT_DB_NAME} \
        -tAc "SELECT EXISTS (SELECT FROM pg_tables WHERE tablename = 'users');")

    if [ "$table_exists" = "t" ]; then
        log_error "Data loss simulation failed"
        return 1
    fi

    # Step 4: Restore from backup
    log_info "Restoring from backup"
    ./scripts/backup/restore-tenant.sh --tenant "$tenant_id" \
        --backup "backup_${test_date}"

    # Step 5: Verify restore
    local users_count=$(docker exec ${TENANT_DB_CONTAINER} \
        psql -U ${TENANT_DB_USER} -d ${TENANT_DB_NAME} \
        -tAc "SELECT COUNT(*) FROM users;")

    if [ "$users_count" -gt 0 ]; then
        log_success "Disaster recovery test passed"
        log_info "Restored $users_count records"
        return 0
    else
        log_error "Disaster recovery test failed"
        return 1
    fi
}
```

**Multi-Tenant Disaster Scenarios**:

```
┌─────────────────────────────────────────────────────────────────┐
│              Multi-Tenant Disaster Scenarios                     │
└─────────────────────────────────────────────────────────────────┘

Scenario 1: Single Tenant Database Failure
├─ Impact: Only tenant_a affected
├─ Recovery: Restore tenant_a database from backup
├─ Downtime: < 15 minutes
└─ Data Loss: < 1 hour

Scenario 2: Server Failure (Single Tenant)
├─ Impact: Tenant B completely down
├─ Recovery: Deploy to standby server
├─ Downtime: < 30 minutes
└─ Data Loss: None (replicated)

Scenario 3: Database Corruption (Undetected)
├─ Impact: Data integrity issues across tenant_c
├─ Recovery: Restore from last known good backup
├─ Downtime: < 1 hour
└─ Data Loss: < 24 hours

Scenario 4: SSH Key Compromise
├─ Impact: Security breach for tenant_a
├─ Recovery: SSH key rotation + security audit
├─ Downtime: < 1 hour
└─ Data Loss: None (access only)

Scenario 5: Configuration Drift (Multiple Tenants)
├─ Impact: 3 tenants with incorrect configuration
├─ Recovery: Restore correct configs + drift detection
├─ Downtime: < 15 minutes per tenant
└─ Data Loss: None
```

#### Concurrent Operations Testing

**Simultaneous Deployment Tests**:

```bash
#!/bin/bash
#==============================================================================
# Concurrent Deployment Test Script
# (并发部署测试脚本)
#
# Description:
#   Tests system behavior under concurrent deployments
#
# Usage:
#   ./scripts/testing/concurrent-deployment-test.sh
#
#==============================================================================

run_concurrent_deployment_test() {
    local tenants=("tenant_a" "tenant_b" "tenant_c")
    local pids=()

    log_step "Starting concurrent deployment test"

    # Start concurrent deployments
    for tenant in "${tenants[@]}"; do
        ./scripts/deploy/deploy-tenant.sh \
            --config "config/tenants/${tenant}.yml" \
            --skip-tests &
        pids+=($!)
    done

    # Wait for all deployments
    local failed=0
    for i in "${!pids[@]}"; do
        if ! wait ${pids[$i]}; then
            log_error "Deployment for ${tenants[$i]} failed"
            failed=1
        fi
    done

    if [ $failed -eq 0 ]; then
        log_success "Concurrent deployment test passed"
    else
        log_error "Concurrent deployment test failed"
    fi

    return $failed
}

run_race_condition_test() {
    log_step "Testing race conditions"

    # Test 1: Simultaneous config writes
    local tenant_id="test_tenant_alpha"
    local config_file="config/tenants/${tenant_id}.yml"

    # Create 10 simultaneous config updates
    for i in {1..10}; do
        (
            load_tenant_config "$config_file"
            sleep $((RANDOM % 5))
            # Simulate config update
        ) &
    done

    wait

    log_success "Race condition test completed"
}
```

### Deployment Orchestrator Design (Scalability)

**Architecture for Large-Scale Deployments**:

```
┌─────────────────────────────────────────────────────────────────┐
│              Deployment Orchestrator Architecture                │
│              (For 10+ Tenants - Scalability Path)               │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     Orchestrator Service                         │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Deployment Queue Management                               │ │
│  │  ├─ Queue: Pending deployments                             │ │
│  │  ├─ In Progress: Active deployments                        │ │
│  │  ├─ Completed: Deployment history                          │ │
│  │  └─ Failed: Failed deployments with retry logic            │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Deployment Coordinator                                     │ │
│  │  ├─ Parallel deployment execution (max 3 concurrent)       │ │
│  │  ├─ Dependency resolution                                  │ │
│  │  ├─ Conflict detection                                     │ │
│  │  └─ Resource allocation                                    │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  State Manager                                              │ │
│  │  ├─ Deployment state tracking                               │ │
│  │  ├─ Version history                                         │ │
│  │  ├─ Audit trail                                             │ │
│  │  └─ Configuration drift detection                           │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
        ┌─────▼─────┐   ┌─────▼─────┐   ┌─────▼─────┐
        │  Worker 1 │   │  Worker 2 │   │  Worker 3 │
        │  (Pool)   │   │  (Pool)   │   │  (Pool)   │
        └───────────┘   └───────────┘   └───────────┘
              │               │               │
        ┌─────┴─────┬─────────┴───────┬───────┴─────┐
        │           │                │             │
    ┌───▼───┐  ┌───▼───┐        ┌───▼───┐     ┌───▼───┐
    │Tenant A│  │Tenant B│        │Tenant C│     │Tenant D│
    └───────┘  └───────┘        └───────┘     └───────┘
```

**Orchestrator Implementation** (Python - Future Path):

```python
# scripts/orchestrator/deployment_coordinator.py
"""
Deployment Coordinator for Multi-Tenant Deployments
Handles parallel deployments, conflict detection, and state management
"""

import asyncio
from typing import List, Dict
from dataclasses import dataclass
from datetime import datetime

@dataclass
class DeploymentTask:
    tenant_id: str
    config_file: str
    priority: int = 0
    dependencies: List[str] = None
    status: str = "pending"

class DeploymentCoordinator:
    def __init__(self, max_concurrent: int = 3):
        self.max_concurrent = max_concurrent
        self.queue: asyncio.Queue = asyncio.Queue()
        self.active_deployments: Dict[str, DeploymentTask] = {}
        self.completed_deployments: List[DeploymentTask] = []

    async def submit_deployment(self, task: DeploymentTask):
        """Submit a deployment task to the queue"""
        await self.queue.put(task)

    async def deploy_tenant(self, task: DeploymentTask):
        """Execute deployment for a single tenant"""
        self.active_deployments[task.tenant_id] = task
        task.status = "in_progress"

        try:
            # Execute deployment
            await self._execute_deployment(task)
            task.status = "completed"
        except Exception as e:
            task.status = "failed"
            raise
        finally:
            del self.active_deployments[task.tenant_id]
            self.completed_deployments.append(task)

    async def _execute_deployment(self, task: DeploymentTask):
        """Execute the actual deployment"""
        # Implementation here...
        pass

    async def run(self):
        """Main coordinator loop"""
        workers = [
            asyncio.create_task(self._worker(i))
            for i in range(self.max_concurrent)
        ]
        await asyncio.gather(*workers)

    async def _worker(self, worker_id: int):
        """Worker process that pulls from queue and deploys"""
        while True:
            task = await self.queue.get()
            try:
                await self.deploy_tenant(task)
            except Exception as e:
                print(f"Worker {worker_id}: Deployment failed for {task.tenant_id}: {e}")
            finally:
                self.queue.task_done()

# Example usage
async def main():
    coordinator = DeploymentCoordinator(max_concurrent=3)

    # Submit deployments
    tenants = ["tenant_a", "tenant_b", "tenant_c", "tenant_d", "tenant_e"]
    for tenant in tenants:
        task = DeploymentTask(
            tenant_id=tenant,
            config_file=f"config/tenants/{tenant}.yml",
            priority=1
        )
        await coordinator.submit_deployment(task)

    # Run coordinator
    await coordinator.run()

if __name__ == "__main__":
    asyncio.run(main())
```

---

## Risk Assessment (Enhanced)

### Additional Technical Risks from Expert Reviews

```
┌─────────────────────────────────────────────────────────────────┐
│              Additional Technical Risk Matrix                     │
└─────────────────────────────────────────────────────────────────┘

Risk ID: R011
Risk Name: SSH Key Rotation Complexity
Impact: High
Probability: Medium
Mitigation:
  - Automated SSH key rotation scripts
  - Quarterly rotation schedule
  - Comprehensive audit trail
  - Backup access procedures
  - Testing before production rotation

Risk ID: R012
Risk Name: Configuration Drift Between Tenants
Impact: Medium
Probability: Medium
Mitigation:
  - Automated consistency checks (daily)
  - Configuration drift detection scripts
  - Version-controlled configurations
  - Regular configuration audits
  - Automated remediation

Risk ID: R013
Risk Name: Health Check False Positives
Impact: Medium
Probability: Medium
Mitigation:
  - Multi-layer health checks (HTTP, DB, OAuth, Redis)
  - Database query verification
  - OAuth configuration validation
  - 3 retries with exponential backoff
  - Manual override capability

Risk ID: R014
Risk Name: Concurrent Deployment Conflicts
Impact: Medium
Probability: Low
Mitigation:
  - Deployment queue system
  - State database tracking
  - Lock mechanisms per tenant
  - Deployment serialization
  - Conflict detection and resolution

Risk ID: R015
Risk Name: Test Data PII Exposure
Impact: High
Probability: Low
Mitigation:
  - PII redaction in test data
  - Anonymized test data generation
  - Test data isolation
  - Regular security scans
  - Data access logging

Risk ID: R016
Risk Name: Cross-Tenant Data Leaks
Impact: Critical
Probability: Low
Mitigation:
  - Comprehensive security testing
  - Database isolation verification
  - Redis namespace separation
  - OAuth configuration validation
  - Regular security audits

Risk ID: R017
Risk Name: Backup Restoration Failures
Impact: Critical
Probability: Low
Mitigation:
  - Monthly backup restoration tests
  - Automated restore testing
  - Backup integrity verification
  - Multi-location backup storage
  - Disaster recovery drills

Risk ID: R018
Risk Name: State Database Single Point of Failure
Impact: High
Probability: Low
Mitigation:
  - State database replication
  - Automated backups of state DB
  - Failover procedures
  - State database HA setup
  - Local state caching
```

---

## Success Metrics (Enhanced)

### Additional KPIs from Expert Reviews

```
┌─────────────────────────────────────────────────────────────────┐
│              Enhanced Success Metrics Dashboard                  │
└─────────────────────────────────────────────────────────────────┘

Security Metrics:

M15: SSH Key Rotation Compliance
   Target: 100% within 90 days
   Measurement: (Keys Rotated / Total Keys) * 100
   Frequency: Quarterly
   Owner: Security Team

M16: Configuration Drift Incidents
   Target: 0 incidents
   Measurement: Count of drift detections
   Frequency: Weekly
   Owner: Operations Team

M17: Security Test Pass Rate
   Target: 100%
   Measurement: (Passed Tests / Total Security Tests) * 100
   Frequency: Per deployment
   Owner: QA Team

M18: PII Data Exposure Incidents
   Target: 0 incidents
   Measurement: Count of PII exposures
   Frequency: Monthly
   Owner: Security Team

Operational Metrics:

M19: Backup Restoration Success Rate
   Target: 100%
   Measurement: (Successful Restores / Total Restore Tests) * 100
   Frequency: Monthly
   Owner: Operations Team

M20: Concurrent Deployment Success Rate
   Target: > 95%
   Measurement: (Successful Concurrent / Total Concurrent) * 100
   Frequency: Per concurrent deployment
   Owner: DevOps Team

M21: State Database Availability
   Target: > 99.9%
   Measurement: (Available Time / Total Time) * 100
   Frequency: Monthly
   Owner: DevOps Team

M22: Configuration Consistency Score
   Target: 100%
   Measurement: (Consistent Tenants / Total Tenants) * 100
   Frequency: Daily
   Owner: Operations Team
```

---

## Appendix

### Implementation Timeline (Enhanced)

```
┌─────────────────────────────────────────────────────────────────┐
│              Enhanced 5-Week Implementation Plan                 │
└─────────────────────────────────────────────────────────────────┘

Week 0: Production Safety Net (CRITICAL - Must Complete First)
├─ Day 1-2: Production backup validation
├─ Day 3-4: Enhanced health check implementation
├─ Day 5-6: Configuration drift detection setup
├─ Day 7: Zero-downtime migration procedure testing
└─ Day 8: Rollback verification and documentation

Week 1: Foundation (March 20 - March 26)
├─ Day 1-2: Project setup + state database setup
├─ Day 3-4: Configuration system + security tests
├─ Day 5-7: Core scripts + SSH key management
└─ Day 8-9: Documentation + security validation

Week 2: Deployment Automation (March 27 - April 2)
├─ Day 8-10: Deployment scripts + local deployment support
├─ Day 11-12: GitHub Actions + security integration
└─ Day 13-14: Documentation + security procedures

Week 3: Management Tools (April 3 - April 9)
├─ Day 15-17: Management scripts + monitoring
├─ Day 18-19: Batch operations + concurrent deployment testing
└─ Day 20-21: Security testing + audit procedures

Week 4: Testing & Validation (April 10 - April 16)
├─ Day 22-24: Integration tests + disaster recovery tests
├─ Day 25-26: Performance tests + concurrent operations tests
└─ Day 27-28: Security validation + penetration testing

Week 5: Documentation & Training (April 17 - April 23)
├─ Day 29-30: Documentation + security guides
├─ Day 31-32: Training + security procedures
└─ Day 33-35: Production migration + monitoring
```

### Resource Requirements (Enhanced)

```
┌─────────────────────────────────────────────────────────────────┐
│              Enhanced Resource Allocation                        │
└─────────────────────────────────────────────────────────────────┘

Human Resources (Enhanced):

Development Team:
├─ 1 Senior DevOps Engineer (40 hours/week)
├─ 1 Backend Developer (20 hours/week)
├─ 1 Security Engineer (20 hours/week) - NEW
├─ 1 QA Engineer (20 hours/week)
└─ 1 Technical Writer (10 hours/week)

Total: 110 hours/week for 5 weeks = 550 hours

Infrastructure Resources (Enhanced):

Development:
├─ 2 Staging servers (for testing)
├─ 1 State database server (PostgreSQL) - NEW
├─ GitHub Enterprise (if not already)
├─ Monitoring tools (Prometheus, Grafana)
└─ CI/CD tools (GitHub Actions)

Production:
├─ 1 Production server (existing)
├─ Additional servers per new tenant
├─ State database replication (HA) - NEW
└─ Enhanced monitoring infrastructure - NEW

Software Tools (Enhanced):
├─ yq (YAML processor)
├─ BATS (testing framework)
├─ Docker (container platform)
├─ rsync (file synchronization)
├─ OpenSSH (secure shell)
├─ PostgreSQL (state database) - NEW
└─ Security scanning tools - NEW

Budget Estimate (Enhanced):

Development:
├─ Personnel: $30,000 (550 hours @ $50/hour average)
├─ Staging servers: $750 (3 servers x $250/month)
├─ State database: $200/month
├─ Security tools: $2,000
└─ Contingency: $3,000
Total Development: $35,950 + $950/month = $39,850 first year

Production (per tenant):
├─ Server: $100/month
├─ Storage: $20/month
├─ Bandwidth: $30/month
├─ Monitoring: $15/month - ENHANCED
├─ Support: $40/month
└─ State database allocation: $10/month - NEW
Total Per Tenant: $215/month

ROI Calculation (Enhanced):
├─ Time savings: 2-4 hours → 10 minutes = 95% reduction
├─ Error reduction: 80% reduction in configuration errors
├─ Onboarding speed: 2-4 days → 2 hours = 90% reduction
├─ Security improvements: 100% security test coverage
└─ Payback period: < 4 months
```

---

## Conclusion

This Feature Implementation Proposal (FIP) provides a comprehensive, production-ready plan for implementing Multi-Instance Single-Tenant deployment support for the AIOpc platform. The enhanced version 2.0 addresses all critical issues and major concerns identified through expert reviews.

### Key Enhancements in Version 2.0

**Production Safety**:
- Zero-downtime migration strategy with comprehensive rollback procedures
- Enhanced health checks with multi-layer validation (HTTP, DB, OAuth, Redis)
- Configuration drift detection with automated consistency checks
- State management database for deployment tracking and audit trails

**Security Enhancements**:
- Automated SSH key rotation with quarterly schedule and audit trail
- Comprehensive security testing (SSH isolation, cross-tenant leaks, secret validation)
- PII redaction in test data
- Test data management with cleanup procedures

**Operational Excellence**:
- State management architecture with deployment history and version tracking
- Concurrent deployment support with conflict detection
- Disaster recovery testing with multi-tenant scenarios
- Blue-green deployment pattern design for future evolution

**Scalability**:
- Deployment orchestrator design for 10+ tenants
- Reduced GitHub Actions dependency with local deployment support
- Enhanced monitoring and alerting coverage
- Technology migration path (Python/Go scripts, Kubernetes evolution)

### Expected Benefits (Enhanced)

- 95% reduction in deployment time (2-4 hours → 10 minutes)
- 90% reduction in tenant onboarding time (2-4 days → 2 hours)
- 80% reduction in configuration errors
- 100% security test coverage
- Zero-downtime deployments with rollback verification
- Complete tenant isolation and security
- Scalable architecture for 10+ tenants
- Production-grade safety and reliability

---

## Revision History

**Version 1.0** (2026-03-19)
- Initial FIP document created
- Basic multi-instance single-tenant architecture
- Deployment automation design
- Testing and operational considerations

**Version 2.0** (2026-03-19)
- **Production Safety Net** section added:
  - Zero-downtime migration strategy
  - Enhanced health checks with multi-layer validation
  - Configuration drift detection
  - Rollback verification procedures
- **Enhanced Security** sections added:
  - SSH key rotation procedures with audit trail
  - Comprehensive security testing strategy
  - PII data redaction and test data management
  - Cross-tenant leak prevention tests
- **State Management Architecture** added:
  - Deployment state database schema
  - Version history tracking
  - Audit trail design
  - Configuration drift tracking
- **Enhanced Testing Strategy** added:
  - Test data management with generation and cleanup
  - Security testing scenarios
  - Disaster recovery testing with multi-tenant scenarios
  - Concurrent operations testing
- **Deployment Orchestrator Design** added for scalability
- **Configuration Management** improvements to reduce GitHub Actions dependency
- **Blue-Green Deployment** pattern design for future evolution
- Updated risk assessment with additional technical risks
- Enhanced success metrics with security and operational KPIs
- Updated implementation timeline and resource requirements
- Enhanced glossary and documentation

**Changes Summary**:
- 8 major sections added
- 15+ new scripts/procedures documented
- 4 additional risk items identified and mitigated
- 8 additional success metrics defined
- Comprehensive production safety measures implemented
- Full security testing and validation framework
- State management for deployment tracking
- Disaster recovery and concurrent operations testing

---

**Document Status**: DRAFT - ENHANCED
**Last Updated**: 2026-03-19
**Next Review**: Upon stakeholder feedback
**Version**: 2.0

---

*End of FIP 021 v2.0*
