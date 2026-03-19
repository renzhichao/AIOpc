# State Management Guide
# (状态管理指南)

**Version**: 1.0
**Last Updated**: 2026-03-19
**Author**: TASK-009 Implementation

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Database Schema](#database-schema)
4. [Library Reference](#library-reference)
5. [Usage Examples](#usage-examples)
6. [Best Practices](#best-practices)
7. [Error Handling](#error-handling)
8. [Testing](#testing)
9. [Troubleshooting](#troubleshooting)

---

## Overview

The State Management Library (`scripts/lib/state.sh`) provides a comprehensive interface to the deployment state database for tracking deployment lifecycle events, configuration snapshots, health checks, and security audits in the AIOpc multi-tenant deployment system.

### Key Features

- **Deployment Lifecycle Tracking**: Record deployment start, success, and failure events
- **Configuration Snapshots**: Capture and store configuration files for each deployment
- **Health Check Logging**: Track system health checks with timestamps and results
- **Security Audit Trail**: Maintain comprehensive audit logs for security events
- **Concurrent Deployment Detection**: Prevent conflicting simultaneous deployments
- **Configuration Drift Detection**: Identify and report configuration inconsistencies
- **Tenant Deployment History**: Query and analyze deployment patterns per tenant

### Design Principles

1. **Idempotent Operations**: Safe to call multiple times without side effects
2. **Robust Error Handling**: Graceful degradation with meaningful error messages
3. **Security First**: Parameterized queries to prevent SQL injection
4. **Audit Trail**: All operations logged for compliance and debugging
5. **Retry Logic**: Automatic retry for transient database failures

---

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Deployment Scripts                        │
│  (deploy.sh, rollback.sh, health-check.sh, etc.)             │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           │ source
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  State Management Library                    │
│                    (scripts/lib/state.sh)                    │
├─────────────────────────────────────────────────────────────┤
│  • Database Connection Management                            │
│  • Deployment Recording Functions                            │
│  • Configuration Snapshot Functions                          │
│  • Health Check Functions                                    │
│  • Security Audit Functions                                  │
│  • Tenant Query Functions                                    │
│  • Concurrent Deployment Detection                           │
│  • Configuration Drift Functions                             │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           │ psql client
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Deployment State Database                        │
│                   (PostgreSQL)                               │
├─────────────────────────────────────────────────────────────┤
│  Tables:                                                    │
│  • tenants                  • incidents                    │
│  • deployments              • ssh_key_audit                │
│  • deployment_config_snapshots                              │
│  • health_checks            • Views (3)                    │
│  • security_audit_log       • Functions (4)                │
│  • config_drift_reports     • Triggers (1)                 │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

```
Deployment Start
    │
    ├─> record_deployment_start()
    │       │
    │       ├─> Validate parameters
    │       ├─> Check concurrent deployments
    │       ├─> Insert deployments row
    │       └─> Return deployment_id
    │
    ├─> record_config_snapshot()
    │       │
    │       ├─> Encode config files (base64)
    │       ├─> Insert deployment_config_snapshots row
    │       └─> Link to deployment_id
    │
    ├─> [Deployment Process]
    │
    ├─> record_health_check()
    │       │
    │       └─> Insert health_checks row
    │
    ├─> record_security_audit()
    │       │
    │       └─> Insert security_audit_log row
    │
    └─> record_deployment_success() OR record_deployment_failure()
            │
            ├─> Update deployments status
            ├─> Set completed_at timestamp
            └─> Store error_message (if failed)
```

---

## Database Schema

### Core Tables

#### `tenants`
Tenant基本信息表

| Column | Type | Description |
|--------|------|-------------|
| tenant_id | VARCHAR(255) | 租户唯一标识 (PK) |
| tenant_name | VARCHAR(500) | 租户名称 |
| environment | VARCHAR(50) | 环境类型 (production/staging/development) |
| server_host | VARCHAR(255) | 服务器主机地址 |
| feishu_app_id | VARCHAR(100) | 飞书应用ID |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |
| is_active | BOOLEAN | 是否激活 |

#### `deployments`
部署记录表

| Column | Type | Description |
|--------|------|-------------|
| deployment_id | SERIAL | 部署记录ID (PK) |
| tenant_id | VARCHAR(255) | 租户ID (FK) |
| deployment_type | VARCHAR(50) | 部署类型 (initial/update/rollback/scale) |
| component | VARCHAR(50) | 部署组件 (all/backend/frontend/database) |
| version | VARCHAR(100) | 版本号 |
| git_commit_sha | VARCHAR(100) | Git提交SHA |
| git_branch | VARCHAR(255) | Git分支 |
| deployed_by | VARCHAR(255) | 部署操作人 |
| status | VARCHAR(50) | 部署状态 (pending/in_progress/success/failed/rolled_back) |
| started_at | TIMESTAMP | 开始时间 |
| completed_at | TIMESTAMP | 完成时间 |
| health_check_status | VARCHAR(50) | 健康检查状态 |
| rollback_deployment_id | INTEGER | 回滚部署ID (FK) |
| error_message | TEXT | 错误信息 |
| deployment_metadata | JSONB | 部署元数据 |

#### `deployment_config_snapshots`
部署配置快照表

| Column | Type | Description |
|--------|------|-------------|
| snapshot_id | SERIAL | 快照ID (PK) |
| deployment_id | INTEGER | 部署ID (FK, UNIQUE) |
| config_content | TEXT | YAML配置内容 (Base64编码) |
| env_content | TEXT | 环境变量内容 (Base64编码) |
| docker_compose_content | TEXT | Docker Compose配置 (Base64编码) |
| nginx_config_content | TEXT | Nginx配置 (Base64编码) |
| created_at | TIMESTAMP | 创建时间 |

#### `health_checks`
健康检查记录表

| Column | Type | Description |
|--------|------|-------------|
| health_check_id | SERIAL | 健康检查ID (PK) |
| deployment_id | INTEGER | 部署ID (FK) |
| tenant_id | VARCHAR(255) | 租户ID (FK) |
| check_type | VARCHAR(100) | 检查类型 (http/database/oauth/redis/ssh/docker) |
| status | VARCHAR(50) | 检查状态 (pass/fail/warning/skip) |
| response_time_ms | INTEGER | 响应时间(毫秒) |
| error_message | TEXT | 错误信息 |
| checked_at | TIMESTAMP | 检查时间 |
| check_details | JSONB | 检查详情 |

#### `security_audit_log`
安全审计日志表

| Column | Type | Description |
|--------|------|-------------|
| audit_id | SERIAL | 审计ID (PK) |
| tenant_id | VARCHAR(255) | 租户ID (FK) |
| event_type | VARCHAR(100) | 事件类型 (ssh_access/config_change/deployment/key_rotation/permission_change/data_access/security_event) |
| actor | VARCHAR(255) | 操作人 |
| action | VARCHAR(255) | 操作动作 |
| resource_type | VARCHAR(100) | 资源类型 |
| resource_id | VARCHAR(255) | 资源ID |
| old_value | JSONB | 旧值 |
| new_value | JSONB | 新值 |
| ip_address | INET | IP地址 |
| user_agent | TEXT | 用户代理 |
| event_timestamp | TIMESTAMP | 事件时间戳 |

#### `config_drift_reports`
配置漂移报告表

| Column | Type | Description |
|--------|------|-------------|
| drift_report_id | SERIAL | 漂移报告ID (PK) |
| tenant_id | VARCHAR(255) | 租户ID (FK) |
| drift_detected_at | TIMESTAMP | 检测到漂移的时间 |
| config_file_path | VARCHAR(500) | 配置文件路径 |
| expected_value | TEXT | 期望值 |
| actual_value | TEXT | 实际值 |
| drift_severity | VARCHAR(50) | 漂移严重程度 (critical/major/minor) |
| resolved | BOOLEAN | 是否已解决 |
| resolved_at | TIMESTAMP | 解决时间 |
| resolution_notes | TEXT | 解决备注 |

### Database Views

#### `v_deployment_summary`
Deployment summary with health check statistics

```sql
SELECT
    d.deployment_id,
    d.tenant_id,
    t.tenant_name,
    t.environment,
    d.status,
    d.version,
    d.started_at,
    d.completed_at,
    -- Health check counts
    (SELECT COUNT(*) FROM health_checks hc
     WHERE hc.deployment_id = d.deployment_id AND hc.status = 'pass') as health_checks_passed,
    (SELECT COUNT(*) FROM health_checks hc
     WHERE hc.deployment_id = d.deployment_id AND hc.status = 'fail') as health_checks_failed
FROM deployments d
JOIN tenants t ON d.tenant_id = t.tenant_id
ORDER BY d.started_at DESC;
```

#### `v_tenant_health`
Tenant health status with deployment statistics

#### `v_recent_security_events`
Recent security events with risk level classification

### Database Functions

#### `health_check()`
Returns database component health status

#### `log_ssh_key_usage()`
Records SSH key access and operations

#### `record_tenant()`
Creates or updates tenant information

#### `get_deployment_stats(days)`
Returns deployment statistics for specified time period

---

## Library Reference

### Initialization

#### `state_init`
Initialize state library and test database connection

**Usage**:
```bash
state_init
```

**Returns**:
- `0` on success
- `ERROR_DATABASE` (12) on connection failure

**Example**:
```bash
source scripts/lib/state.sh
state_init || exit 1
```

**Environment Variables**:
- `STATE_DB_HOST`: Database host (default: localhost)
- `STATE_DB_PORT`: Database port (default: 5432)
- `STATE_DB_NAME`: Database name (default: deployment_state)
- `STATE_DB_USER`: Database user (default: postgres)
- `STATE_DB_PASSWORD`: Database password (required)
- `STATE_DB_SSL_MODE`: SSL mode (default: prefer)

---

### Deployment Recording

#### `record_deployment_start`
Record deployment start in database

**Usage**:
```bash
record_deployment_start <tenant_id> <version> <environment> \
    [deployment_type] [component] [deployed_by] [git_commit_sha] [git_branch] [metadata_json]
```

**Parameters**:
- `tenant_id`: Tenant identifier (required)
- `version`: Deployment version (required)
- `environment`: Environment type (required) - `production|staging|development`
- `deployment_type`: Deployment type (optional, default: `update`) - `initial|update|rollback|scale`
- `component`: Deployment component (optional, default: `all`) - `all|backend|frontend|database`
- `deployed_by`: Deployer username (optional, default: `$USER`)
- `git_commit_sha`: Git commit SHA (optional)
- `git_branch`: Git branch name (optional)
- `metadata_json`: Additional metadata as JSON (optional, default: `{}`)

**Returns**:
- `0` on success
- `ERROR_INVALID_ARGUMENT` (2) on invalid parameters
- `ERROR_DATABASE` (12) on database failure

**Sets**:
- `STATE_LAST_DEPLOYMENT_ID`: The new deployment ID

**Example**:
```bash
record_deployment_start "tenant_001" "v1.2.3" "production" "update" "all" "admin" "abc123" "main"
deployment_id=$STATE_LAST_DEPLOYMENT_ID
echo "Deployment started with ID: $deployment_id"
```

---

#### `record_deployment_success`
Record deployment success in database

**Usage**:
```bash
record_deployment_success <deployment_id> [output_message]
```

**Parameters**:
- `deployment_id`: Deployment ID (required, must be numeric)
- `output_message`: Success message (optional, default: "Deployment completed successfully")

**Returns**:
- `0` on success
- `ERROR_INVALID_ARGUMENT` (2) on invalid parameters
- `ERROR_DATABASE` (12) on database failure

**Example**:
```bash
record_deployment_success "$deployment_id" "All services deployed successfully"
```

---

#### `record_deployment_failure`
Record deployment failure in database

**Usage**:
```bash
record_deployment_failure <deployment_id> <error_code> <error_message>
```

**Parameters**:
- `deployment_id`: Deployment ID (required, must be numeric)
- `error_code`: Error code (required)
- `error_message`: Error description (required)

**Returns**:
- `0` on success
- `ERROR_INVALID_ARGUMENT` (2) on invalid parameters
- `ERROR_DATABASE` (12) on database failure

**Example**:
```bash
record_deployment_failure "$deployment_id" "DEPLOY001" "Container startup timeout"
```

---

### Configuration Snapshots

#### `record_config_snapshot`
Record configuration snapshot for a deployment

**Usage**:
```bash
record_config_snapshot <deployment_id> <config_file> \
    [env_file] [docker_compose_file] [nginx_config_file]
```

**Parameters**:
- `deployment_id`: Deployment ID (required, must be numeric)
- `config_file`: Path to YAML configuration file (required)
- `env_file`: Path to environment file (optional)
- `docker_compose_file`: Path to docker-compose.yml (optional)
- `nginx_config_file`: Path to nginx configuration (optional)

**Returns**:
- `0` on success
- `ERROR_INVALID_ARGUMENT` (2) on invalid parameters
- `ERROR_FILE_NOT_FOUND` (5) if config file doesn't exist
- `ERROR_FILE_OPERATION` (6) on file read failure
- `ERROR_DATABASE` (12) on database failure

**Example**:
```bash
record_config_snapshot "$deployment_id" \
    "/opt/opclaw/tenant_001/config.yml" \
    "/opt/opclaw/tenant_001/.env" \
    "/opt/opclaw/tenant_001/docker-compose.yml" \
    "/etc/nginx/sites-available/tenant_001.conf"
```

**Note**: Files are encoded in base64 before storage. The function is idempotent - calling multiple times with same deployment_id updates the snapshot.

---

### Health Checks

#### `record_health_check`
Record health check result

**Usage**:
```bash
record_health_check <tenant_id> <check_type> <status> \
    [response_time_ms] [error_message] [deployment_id] [check_details_json]
```

**Parameters**:
- `tenant_id`: Tenant identifier (required)
- `check_type`: Check type (required) - `http|database|oauth|redis|ssh|docker`
- `status`: Check status (required) - `pass|fail|warning|skip`
- `response_time_ms`: Response time in milliseconds (optional)
- `error_message`: Error message if failed (optional)
- `deployment_id`: Associated deployment ID (optional)
- `check_details_json`: Additional details as JSON (optional, default: `{}`)

**Returns**:
- `0` on success
- `ERROR_INVALID_ARGUMENT` (2) on invalid parameters
- `ERROR_DATABASE` (12) on database failure

**Example**:
```bash
# Successful HTTP check
record_health_check "tenant_001" "http" "pass" "150"

# Failed database check
record_health_check "tenant_001" "database" "fail" "" "Connection timeout" "$deployment_id"

# SSH check with details
record_health_check "tenant_001" "ssh" "pass" "45" "" "" '{"key": "rap001_opclaw", "user": "root"}'
```

---

### Security Audit

#### `record_security_audit`
Record security audit event

**Usage**:
```bash
record_security_audit <tenant_id> <event_type> <actor> <action> \
    [resource_type] [resource_id] [ip_address] [user_agent] [old_value_json] [new_value_json]
```

**Parameters**:
- `tenant_id`: Tenant identifier (required)
- `event_type`: Event type (required) - `ssh_access|config_change|deployment|key_rotation|permission_change|data_access|security_event`
- `actor`: User or system performing action (required)
- `action`: Action performed (required)
- `resource_type`: Type of resource affected (optional)
- `resource_id`: Identifier of resource (optional)
- `ip_address`: IP address of actor (optional)
- `user_agent`: User agent string (optional)
- `old_value_json`: Previous state as JSON (optional, default: `{}`)
- `new_value_json`: New state as JSON (optional, default: `{}`)

**Returns**:
- `0` on success
- `ERROR_INVALID_ARGUMENT` (2) on invalid parameters
- `ERROR_DATABASE` (12) on database failure

**Example**:
```bash
# Log SSH access
record_security_audit "tenant_001" "ssh_access" "admin" "login" \
    "ssh_key" "rap001_opclaw" "192.168.1.100" "OpenSSH_9.0"

# Log config change
record_security_audit "tenant_001" "config_change" "admin" "update" \
    "config" "config.yml" "192.168.1.100" "" \
    '{"feishu.app_secret": "old_secret"}' \
    '{"feishu.app_secret": "new_secret"}'

# Log deployment
record_security_audit "tenant_001" "deployment" "ci_system" "deploy" \
    "server" "118.25.0.190" "10.0.0.1" "deployment-bot/1.0"
```

---

### Tenant Queries

#### `get_tenant_last_deployment`
Get last deployment for a tenant

**Usage**:
```bash
get_tenant_last_deployment <tenant_id> [output_variable]
```

**Parameters**:
- `tenant_id`: Tenant identifier (required)
- `output_variable`: Variable name to store result (optional, default: `STATE_TENANT_LAST_DEPLOYMENT`)

**Returns**:
- `0` on success
- `ERROR_INVALID_ARGUMENT` (2) on invalid parameters
- `ERROR_DATABASE` (12) on database failure

**Output Format**: `deployment_id|status|version|started_at|completed_at`

**Example**:
```bash
get_tenant_last_deployment "tenant_001" last_deployment
IFS='|' read -r deployment_id status version started_at completed_at <<< "$last_deployment"
echo "Last deployment: $deployment_id, Status: $status, Version: $version"
```

---

### Concurrent Deployment Detection

#### `check_concurrent_deployment`
Check if there's a concurrent deployment in progress

**Usage**:
```bash
check_concurrent_deployment <tenant_id> [output_variable]
```

**Parameters**:
- `tenant_id`: Tenant identifier (required)
- `output_variable`: Variable name to store deployment ID (optional, default: `STATE_CONCURRENT_DEPLOYMENT_ID`)

**Returns**:
- `0` if no concurrent deployment exists
- `1` if concurrent deployment detected
- `ERROR_INVALID_ARGUMENT` (2) on invalid parameters
- `ERROR_DATABASE` (12) on database failure

**Example**:
```bash
if ! check_concurrent_deployment "tenant_001" concurrent_id; then
    echo "Error: Concurrent deployment detected (ID: $concurrent_id)"
    exit 1
fi

echo "No concurrent deployments, safe to proceed"
```

**Note**: Only considers deployments started within the last hour with status `in_progress`.

---

### Configuration Drift

#### `record_config_drift`
Record configuration drift detection

**Usage**:
```bash
record_config_drift <tenant_id> <severity> <config_file_path> \
    <expected_value> <actual_value> [resolution_notes]
```

**Parameters**:
- `tenant_id`: Tenant identifier (required)
- `severity`: Drift severity (required) - `critical|major|minor`
- `config_file_path`: Path to configuration file (required)
- `expected_value`: Expected configuration value (required)
- `actual_value`: Actual configuration value found (required)
- `resolution_notes`: Notes about resolution (optional)

**Returns**:
- `0` on success
- `ERROR_INVALID_ARGUMENT` (2) on invalid parameters
- `ERROR_DATABASE` (12) on database failure

**Example**:
```bash
# Critical drift - FEISHU_APP_ID changed
record_config_drift "tenant_001" "critical" \
    "/opt/opclaw/tenant_001/.env" \
    "FEISHU_APP_ID=cli_a93ce5614ce11bd6" \
    "FEISHU_APP_ID=cli_wrong123" \
    "Reverted to expected value"

# Major drift - port changed
record_config_drift "tenant_001" "major" \
    "/opt/opclaw/tenant_01/config.yml" \
    "server.port: 3000" \
    "server.port: 3001"
```

---

### Utility Functions

#### `get_deployment_stats`
Get deployment statistics for a tenant

**Usage**:
```bash
get_deployment_stats <tenant_id> <days> [output_variable]
```

**Parameters**:
- `tenant_id`: Tenant identifier (required)
- `days`: Number of days to look back (required, default: 7)
- `output_variable`: Variable name to store result (optional, default: `STATE_DEPLOYMENT_STATS`)

**Returns**:
- `0` on success
- `ERROR_INVALID_ARGUMENT` (2) on invalid parameters
- `ERROR_DATABASE` (12) on database failure

**Output Format**: `total|success|failed|avg_duration_seconds`

**Example**:
```bash
get_deployment_stats "tenant_001" 30 stats
IFS='|' read -r total success failed avg_duration <<< "$stats"
echo "Deployments (30 days):"
echo "  Total: $total"
echo "  Success: $success"
echo "  Failed: $failed"
echo "  Avg Duration: ${avg_duration}s"
```

---

#### `state_cleanup`
Cleanup function to close database connection

**Usage**:
```bash
state_cleanup
```

**Example**:
```bash
trap state_cleanup EXIT
```

---

## Usage Examples

### Complete Deployment Workflow

```bash
#!/bin/bash

source scripts/lib/state.sh
source scripts/lib/logging.sh

# Initialize
log_init "deploy_tenant"
state_init || exit 1

tenant_id="tenant_001"
version="v1.2.3"
environment="production"

# Check for concurrent deployments
if ! check_concurrent_deployment "$tenant_id"; then
    log_error "Concurrent deployment detected, aborting"
    exit 1
fi

# Record deployment start
record_deployment_start "$tenant_id" "$version" "$environment" "update" "all" "admin"
deployment_id=$STATE_LAST_DEPLOYMENT_ID

log_info "Deployment started with ID: $deployment_id"

# Record configuration snapshot
record_config_snapshot "$deployment_id" \
    "/opt/opclaw/$tenant_id/config.yml" \
    "/opt/opclaw/$tenant_id/.env" \
    "/opt/opclaw/$tenant_id/docker-compose.yml"

# Perform deployment
if deploy_services "$tenant_id"; then
    # Record success
    record_deployment_success "$deployment_id" "All services deployed successfully"

    # Record health checks
    record_health_check "$tenant_id" "http" "pass" "150" "" "$deployment_id"
    record_health_check "$tenant_id" "database" "pass" "25" "" "$deployment_id"

    log_success "Deployment completed successfully"
else
    # Record failure
    record_deployment_failure "$deployment_id" "DEPLOY001" "Service deployment failed"
    log_error "Deployment failed"
    exit 1
fi

# Record security audit
record_security_audit "$tenant_id" "deployment" "admin" "deploy" \
    "server" "118.25.0.190" "$(curl -s ifconfig.me)"

state_cleanup
```

### Health Check Monitoring

```bash
#!/bin/bash

source scripts/lib/state.sh
source scripts/lib/health-check.sh

state_init || exit 1

tenant_id="tenant_001"

# HTTP health check
start_time=$(date +%s%N)
http_status=$(curl -s -o /dev/null -w "%{http_code}" "https://$tenant_id.example.com/health")
end_time=$(date +%s%N)
response_time=$(( (end_time - start_time) / 1000000 ))

if [[ "$http_status" == "200" ]]; then
    record_health_check "$tenant_id" "http" "pass" "$response_time"
else
    record_health_check "$tenant_id" "http" "fail" "$response_time" "HTTP $http_status"
fi

# Database health check
if psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" &>/dev/null; then
    record_health_check "$tenant_id" "database" "pass" "50"
else
    record_health_check "$tenant_id" "database" "fail" "" "Connection failed"
fi

# SSH health check
if ssh -i ~/.ssh/rap001_opclaw -o ConnectTimeout=5 root@118.25.0.190 "echo ok" &>/dev/null; then
    record_health_check "$tenant_id" "ssh" "pass" "120"
else
    record_health_check "$tenant_id" "ssh" "fail" "" "SSH connection failed"
fi

state_cleanup
```

### Configuration Drift Detection

```bash
#!/bin/bash

source scripts/lib/state.sh
source scripts/lib/config.sh

state_init || exit 1

tenant_id="tenant_001"
config_file="/opt/opclaw/$tenant_id/.env"

# Get expected value from database snapshot
last_deployment=$(get_tenant_last_deployment "$tenant_id")
IFS='|' read -r deployment_id status version started_at completed_at <<< "$last_deployment"

expected_secret=$(psql -h "$STATE_DB_HOST" -U "$STATE_DB_USER" -d "$STATE_DB_NAME" -t \
    -c "SELECT convert_from(decode(env_content, 'base64'), 'UTF8')
        FROM deployment_config_snapshots
        WHERE deployment_id = $deployment_id" | \
    grep "^FEISHU_APP_SECRET=" | cut -d'=' -f2)

# Get actual value from running system
actual_secret=$(ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 \
    "grep ^FEISHU_APP_SECRET= /opt/opclaw/platform/.env.production | cut -d'=' -f2")

# Compare
if [[ "$expected_secret" != "$actual_secret" ]]; then
    log_warning "Configuration drift detected in FEISHU_APP_SECRET"
    record_config_drift "$tenant_id" "critical" "$config_file" \
        "FEISHU_APP_SECRET=$expected_secret" \
        "FEISHU_APP_SECRET=$actual_value" \
        "Alert sent to security team"
fi

state_cleanup
```

### Querying Deployment History

```bash
#!/bin/bash

source scripts/lib/state.sh

state_init || exit 1

tenant_id="tenant_001"

# Get last deployment
get_tenant_last_deployment "$tenant_id" last_deployment
IFS='|' read -r deployment_id status version started_at completed_at <<< "$last_deployment"

echo "Last Deployment:"
echo "  ID: $deployment_id"
echo "  Status: $status"
echo "  Version: $version"
echo "  Started: $started_at"
echo "  Completed: $completed_at"

# Get deployment statistics
get_deployment_stats "$tenant_id" 30 stats
IFS='|' read -r total success failed avg_duration <<< "$stats"

echo ""
echo "Deployment Statistics (30 days):"
echo "  Total: $total"
echo "  Success: $success"
echo "  Failed: $failed"
echo "  Average Duration: ${avg_duration}s"

# Calculate success rate
if [[ $total -gt 0 ]]; then
    success_rate=$((success * 100 / total))
    echo "  Success Rate: ${success_rate}%"
fi

# Get recent health checks
echo ""
echo "Recent Health Checks:"
psql -h "$STATE_DB_HOST" -U "$STATE_DB_USER" -d "$STATE_DB_NAME" -c \
    "SELECT check_type, status, response_time_ms, checked_at
     FROM health_checks
     WHERE tenant_id = '$tenant_id'
     ORDER BY checked_at DESC
     LIMIT 10;"

state_cleanup
```

---

## Best Practices

### 1. Always Initialize First

```bash
# Good
state_init || exit 1

# Bad - operations will fail
record_deployment_start "$tenant_id" "$version" "$environment"
```

### 2. Check Return Codes

```bash
# Good
if ! record_deployment_start "$tenant_id" "$version" "$environment"; then
    log_error "Failed to start deployment"
    exit 1
fi

# Bad - ignores errors
record_deployment_start "$tenant_id" "$version" "$environment"
```

### 3. Use Deployment IDs Consistently

```bash
# Good
record_deployment_start "$tenant_id" "$version" "$environment"
deployment_id=$STATE_LAST_DEPLOYMENT_ID
record_config_snapshot "$deployment_id" "$config_file"
record_health_check "$tenant_id" "http" "pass" "" "" "$deployment_id"

# Bad - loses tracking
record_deployment_start "$tenant_id" "$version" "$environment"
# Later tries to use wrong ID
```

### 4. Record All Operations

```bash
# Good - complete audit trail
record_deployment_start "$tenant_id" "$version" "$environment"
deployment_id=$STATE_LAST_DEPLOYMENT_ID
record_config_snapshot "$deployment_id" "$config_file"
# ... deployment steps ...
record_health_check "$tenant_id" "http" "pass" "150" "" "$deployment_id"
record_security_audit "$tenant_id" "deployment" "$USER" "deploy" \
    "server" "$SERVER_HOST" "$IP_ADDRESS"
record_deployment_success "$deployment_id" "Deployment completed"

# Bad - gaps in audit trail
record_deployment_start "$tenant_id" "$version" "$environment"
# ... deployment steps with no recording ...
# Missing health checks and security audit
```

### 5. Handle Concurrent Deployments

```bash
# Good - prevents conflicts
if ! check_concurrent_deployment "$tenant_id"; then
    log_error "Another deployment is in progress for $tenant_id"
    exit 1
fi

# Bad - may cause conflicts
record_deployment_start "$tenant_id" "$version" "$environment"
```

### 6. Clean Up Resources

```bash
# Good
trap state_cleanup EXIT INT TERM

# Or explicitly
state_init
# ... operations ...
state_cleanup

# Bad - leaves connection open
state_init
# ... operations ...
exit 0  # state_cleanup not called
```

### 7. Validate Input Parameters

```bash
# Good
if [[ -z "$tenant_id" || -z "$version" ]]; then
    log_error "Missing required parameters"
    exit 1
fi

# Also good - library validates
if ! record_deployment_start "$tenant_id" "$version" "$environment"; then
    log_error "Invalid parameters or database error"
    exit 1
fi

# Bad - assumes input is valid
record_deployment_start "$tenant_id" "$version" "$environment"
```

### 8. Use Meaningful Error Codes

```bash
# Good
record_deployment_failure "$deployment_id" "DB_TIMEOUT" \
    "Database connection timeout after 30s"

# Good - includes context
record_deployment_failure "$deployment_id" "DOCKER_START_FAILED" \
    "Container opclaw-backend failed to start: exit code 125"

# Bad - unclear error
record_deployment_failure "$deployment_id" "ERROR" "Failed"
```

### 9. Include Metadata

```bash
# Good - rich metadata
metadata='{
    "trigger": "manual",
    "initiated_by": "admin@example.com",
    "git_branch": "feature/new-auth",
    "rollback_from": "v1.2.2",
    "deploy_duration_seconds": 245
}'
record_deployment_start "$tenant_id" "$version" "$environment" \
    "rollback" "all" "admin" "" "" "$metadata"

# Bad - no context
record_deployment_start "$tenant_id" "$version" "$environment"
```

### 10. Monitor Configuration Drift

```bash
# Good - proactive detection
if detect_config_drift "$tenant_id"; then
    log_warning "Configuration drift detected"
    record_config_drift "$tenant_id" "$severity" "$file" "$expected" "$actual"
    notify_team "$tenant_id" "Configuration drift detected"
fi

# Bad - reactive only
# Only discover drift when something breaks
```

---

## Error Handling

### Error Codes

The library uses standard error codes defined in `scripts/lib/error.sh`:

| Code | Constant | Description |
|------|----------|-------------|
| 0 | ERROR_SUCCESS | Operation successful |
| 1 | ERROR_GENERAL | General error |
| 2 | ERROR_INVALID_ARGUMENT | Invalid argument provided |
| 12 | ERROR_DATABASE | Database operation failed |

### Handling Database Errors

```bash
# Check database connection
if ! state_init; then
    log_error "Cannot connect to state database"
    log_info "Please check:"
    log_info "  1. Database server is running"
    log_info "  2. STATE_DB_PASSWORD is set correctly"
    log_info "  3. Network connectivity to database"
    exit 1
fi

# Handle operation failures
if ! record_deployment_start "$tenant_id" "$version" "$environment"; then
    case $? in
        $ERROR_INVALID_ARGUMENT)
            log_error "Invalid deployment parameters"
            ;;
        $ERROR_DATABASE)
            log_error "Database error: $STATE_LAST_ERROR"
            ;;
        *)
            log_error "Unknown error occurred"
            ;;
    esac
    exit 1
fi
```

### Retry Logic

The library implements automatic retry for transient database errors:

- **Maximum retries**: 3 (configurable via `STATE_DB_MAX_RETRIES`)
- **Retry delay**: 2 seconds (configurable via `STATE_DB_RETRY_DELAY`)
- **Retry on**: Connection timeouts, temporary network issues

```bash
# Customize retry behavior
export STATE_DB_MAX_RETRIES=5
export STATE_DB_RETRY_DELAY=3

state_init  # Will retry up to 5 times with 3s delay
```

### Common Errors and Solutions

#### "Database not connected. Call state_init() first"

**Cause**: Attempting database operations before initialization

**Solution**:
```bash
state_init || exit 1
# Now safe to use other functions
```

#### "Failed to connect to state database"

**Cause**: Database connection failed

**Solutions**:
1. Check database server is running:
```bash
psql -h "$STATE_DB_HOST" -p "$STATE_DB_PORT" -U "$STATE_DB_USER" -d "$STATE_DB_NAME"
```

2. Verify credentials:
```bash
echo "STATE_DB_HOST: $STATE_DB_HOST"
echo "STATE_DB_PORT: $STATE_DB_PORT"
echo "STATE_DB_NAME: $STATE_DB_NAME"
echo "STATE_DB_USER: $STATE_DB_USER"
# STATE_DB_PASSWORD should be set but not echoed
```

3. Check network connectivity:
```bash
ping -c 3 "$STATE_DB_HOST"
telnet "$STATE_DB_HOST" "$STATE_DB_PORT"
```

#### "Invalid deployment_type: ..."

**Cause**: Provided invalid deployment_type value

**Solution**:
```bash
# Valid values: initial, update, rollback, scale
record_deployment_start "$tenant_id" "$version" "$environment" "update"
```

#### "Invalid check_type: ..."

**Cause**: Provided invalid health check type

**Solution**:
```bash
# Valid values: http, database, oauth, redis, ssh, docker
record_health_check "$tenant_id" "http" "pass"
```

---

## Testing

### Running Tests

The library includes comprehensive tests in `scripts/tests/test-state.sh`:

```bash
# Run all tests
./scripts/tests/test-state.sh

# Run specific test
./scripts/tests/test-state.sh database_connection
./scripts/tests/test-state.sh deployment_start
./scripts/tests/test-state.sh health_check

# Verbose mode
TEST_VERBOSE=true ./scripts/tests/test-state.sh
```

### Test Environment Setup

Tests require a running PostgreSQL database with the deployment_state schema:

```bash
# 1. Create test database
createdb deployment_state_test

# 2. Apply schema
psql -d deployment_state_test -f scripts/state/schema.sql

# 3. Set test credentials
export TEST_STATE_DB_HOST=localhost
export TEST_STATE_DB_PORT=5432
export TEST_STATE_DB_NAME=deployment_state_test
export TEST_STATE_DB_USER=postgres
export TEST_STATE_DB_PASSWORD=your_test_password

# 4. Run tests
./scripts/tests/test-state.sh
```

### Test Coverage

The test suite covers:

- Database connection and initialization
- Deployment lifecycle (start, success, failure)
- Configuration snapshot recording
- Health check recording (all types)
- Security audit logging
- Tenant deployment queries
- Concurrent deployment detection
- Configuration drift recording
- Error handling and validation
- Edge cases and boundary conditions

---

## Troubleshooting

### Debug Mode

Enable verbose logging to debug issues:

```bash
# Enable library debug output
export DEBUG=true

# Enable test verbose mode
export TEST_VERBOSE=true

# Enable database query logging
export STATE_DB_DEBUG=true
```

### Common Issues

#### Issue: `psql: error: connection refused`

**Symptoms**: Cannot connect to database

**Diagnosis**:
```bash
# Check if PostgreSQL is running
pg_ctl status

# Check if port is listening
netstat -an | grep 5432

# Test connection manually
psql -h localhost -p 5432 -U postgres -d deployment_state
```

**Solutions**:
1. Start PostgreSQL service
2. Check firewall rules
3. Verify pg_hba.conf allows connection
4. Confirm correct port number

#### Issue: `permission denied for table deployments`

**Symptoms**: Cannot insert/query database tables

**Diagnosis**:
```bash
# Check user permissions
psql -d deployment_state -c "\dp deployments"

# Check current user
psql -d deployment_state -c "SELECT current_user;"
```

**Solutions**:
1. Grant permissions:
```sql
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO deployment_state_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO deployment_state_user;
```

2. Reconnect as correct user:
```bash
export STATE_DB_USER=deployment_state_user
```

#### Issue: Deployment ID not set after record_deployment_start

**Symptoms**: `STATE_LAST_DEPLOYMENT_ID` is empty

**Diagnosis**:
```bash
# Check function return code
record_deployment_start "$tenant_id" "$version" "$environment"
echo "Return code: $?"
echo "Deployment ID: $STATE_LAST_DEPLOYMENT_ID"
```

**Solutions**:
1. Ensure tenant exists in database:
```sql
INSERT INTO tenants (tenant_id, tenant_name, environment, server_host, feishu_app_id)
VALUES ('tenant_001', 'Test Tenant', 'production', 'localhost', 'cli_test123');
```

2. Check database for errors:
```bash
# View recent deployments
psql -d deployment_state -c "SELECT * FROM deployments ORDER BY started_at DESC LIMIT 5;"
```

#### Issue: Base64 encoding fails for config files

**Symptoms**: `record_config_snapshot` fails with encoding error

**Diagnosis**:
```bash
# Test file encoding
file /path/to/config.yml

# Test base64 encoding
base64 -i /path/to/config.yml | head -c 100
```

**Solutions**:
1. Ensure file exists and is readable
2. Check file encoding (should be UTF-8)
3. Verify file permissions:
```bash
chmod 644 /path/to/config.yml
```

---

## Performance Considerations

### Connection Pooling

For high-frequency operations, consider using a connection pool (e.g., pgBouncer):

```bash
# Configure connection pool
export STATE_DB_HOST=localhost
export STATE_DB_PORT=6432  # pgBouncer port
```

### Batch Operations

When recording multiple health checks, batch them:

```bash
# Less efficient - multiple round trips
record_health_check "$tenant_id" "http" "pass" "150"
record_health_check "$tenant_id" "database" "pass" "50"
record_health_check "$tenant_id" "redis" "pass" "25"

# More efficient - would require batch function (future enhancement)
# record_health_checks_batch "$tenant_id" \
#     "http|pass|150" "database|pass|50" "redis|pass|25"
```

### Index Usage

The database schema includes indexes for common queries:

- `idx_deployments_tenant`: Tenant + time queries
- `idx_health_checks_deployment`: Deployment health checks
- `idx_audit_tenant`: Tenant audit logs
- `idx_drift_tenant`: Tenant drift reports

Monitor index usage:

```sql
-- Check index usage
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE tablename IN ('deployments', 'health_checks', 'security_audit_log', 'config_drift_reports')
ORDER BY idx_scan DESC;
```

---

## Security Considerations

### SQL Injection Prevention

The library uses parameterized queries and string escaping:

```bash
# Library handles escaping automatically
record_deployment_start "$tenant_id" "$version" "$environment"

# Don't construct raw SQL queries
# psql -c "INSERT INTO deployments VALUES ('$tenant_id', ...)"  # DON'T DO THIS
```

### Credential Management

Never hardcode database passwords:

```bash
# Good - use environment variable
export STATE_DB_PASSWORD="$(cat ~/.secret/state_db_password)"

# Good - use .env file (not in git)
source .env.state_db

# Bad - hardcoded password
export STATE_DB_PASSWORD="mypassword"  # DON'T DO THIS
```

### Audit Trail

All operations are logged in `security_audit_log`:

```sql
-- Review recent security events
SELECT event_type, actor, action, event_timestamp
FROM security_audit_log
WHERE event_timestamp > NOW() - INTERVAL '7 days'
ORDER BY event_timestamp DESC;
```

---

## Appendix

### Environment Variable Reference

| Variable | Default | Description |
|----------|---------|-------------|
| STATE_DB_HOST | localhost | Database server hostname |
| STATE_DB_PORT | 5432 | Database server port |
| STATE_DB_NAME | deployment_state | Database name |
| STATE_DB_USER | postgres | Database user |
| STATE_DB_PASSWORD | (none) | Database password (required) |
| STATE_DB_SSL_MODE | prefer | SSL connection mode |
| STATE_DB_CONNECT_TIMEOUT | 10 | Connection timeout (seconds) |
| STATE_DB_QUERY_TIMEOUT | 30 | Query timeout (seconds) |
| STATE_DB_MAX_RETRIES | 3 | Maximum retry attempts |
| STATE_DB_RETRY_DELAY | 2 | Delay between retries (seconds) |
| STATE_DB_AUTO_INIT | false | Auto-initialize on load |
| DEBUG | false | Enable debug output |

### State Variables

| Variable | Type | Description |
|----------|------|-------------|
| STATE_DB_CONNECTED | Boolean | Database connection status |
| STATE_DB_CONNECTION_TESTED | Boolean | Connection test status |
| STATE_LAST_DEPLOYMENT_ID | String | Last created deployment ID |
| STATE_LAST_ERROR | String | Last error message |
| STATE_LAST_EXIT_CODE | Integer | Last exit code |

### Database Schema Version

Current schema version: 1.0
Last updated: 2026-03-19

Schema file: `scripts/state/schema.sql`

### Related Documentation

- [TASK-006: State Database Setup](../TASK_LIST_issue21_multi_tenant_deployment.md#task-006)
- [TASK-010: Health Check Framework](../TASK_LIST_issue21_multi_tenant_deployment.md#task-010)
- [Library Reference Guide](library-reference.md)
- [Deployment Best Practices](deployment-guide.md)

### Support and Contributing

For issues, questions, or contributions related to the State Management Library:

1. Check this documentation first
2. Review test cases for usage examples
3. Check database schema for constraints
4. Contact: DevOps team

---

**Document Version**: 1.0
**Last Updated**: 2026-03-19
**Status**: Complete - TASK-009
