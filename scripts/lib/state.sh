#!/bin/bash
#==============================================================================
# State Management Library
# (状态管理库)
#
# Purpose: Interface with deployment state database for recording deployment
#          lifecycle events, configuration snapshots, health checks, and audits
#
# Features:
# - Deployment lifecycle tracking (start, success, failure)
# - Configuration snapshot recording
# - Health check logging
# - Security audit trails
# - Concurrent deployment detection
# - Configuration drift detection
# - Tenant deployment history queries
# - Database connection management with retry
#
# Usage:
#   source /path/to/state.sh
#   state_init  # Initialize database connection
#   record_deployment_start "tenant_001" "v1.0.0" "production"
#   deployment_id=$STATE_LAST_DEPLOYMENT_ID
#   record_deployment_success "$deployment_id" "Deployment completed successfully"
#
# Dependencies:
# - logging.sh (for logging functions)
# - error.sh (for error codes and handling)
# - PostgreSQL client (psql)
# - base64 (for encoding config files)
#
# Environment Variables:
# - STATE_DB_HOST: Database host (default: localhost)
# - STATE_DB_PORT: Database port (default: 5432)
# - STATE_DB_NAME: Database name (default: deployment_state)
# - STATE_DB_USER: Database user (default: postgres)
# - STATE_DB_PASSWORD: Database password (required)
# - STATE_DB_SSL_MODE: SSL mode (default: prefer)
#
# Version: 1.0
# Last Updated: 2026-03-19
#==============================================================================

#==============================================================================
# Configuration and State
#==============================================================================

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="${SCRIPT_DIR}"

# Database connection configuration
STATE_DB_HOST="${STATE_DB_HOST:-localhost}"
STATE_DB_PORT="${STATE_DB_PORT:-5432}"
STATE_DB_NAME="${STATE_DB_NAME:-deployment_state}"
STATE_DB_USER="${STATE_DB_USER:-postgres}"
STATE_DB_PASSWORD="${STATE_DB_PASSWORD:-}"
STATE_DB_SSL_MODE="${STATE_DB_SSL_MODE:-prefer}"

# Connection timeout (seconds)
STATE_DB_CONNECT_TIMEOUT="${STATE_DB_CONNECT_TIMEOUT:-10}"

# Query timeout (seconds)
STATE_DB_QUERY_TIMEOUT="${STATE_DB_QUERY_TIMEOUT:-30}"

# Maximum retry attempts for database operations
STATE_DB_MAX_RETRIES="${STATE_DB_MAX_RETRIES:-3}"

# Retry delay (seconds)
STATE_DB_RETRY_DELAY="${STATE_DB_RETRY_DELAY:-2}"

# Database connection state
STATE_DB_CONNECTED=false
STATE_DB_CONNECTION_TESTED=false

# Last operation result
STATE_LAST_DEPLOYMENT_ID=""
STATE_LAST_ERROR=""
STATE_LAST_EXIT_CODE=0

# PSQL command options
declare -a STATE_PSQL_OPTS=()

#==============================================================================
# Dependency Loading
#==============================================================================

# Load logging library
if [[ -f "${LIB_DIR}/logging.sh" ]]; then
    source "${LIB_DIR}/logging.sh"
else
    # Fallback logging functions if logging.sh not available
    log_info() { echo "[INFO] $*"; }
    log_success() { echo "[SUCCESS] $*"; }
    log_warning() { echo "[WARNING] $*"; }
    log_error() { echo "[ERROR] $*"; }
    log_debug() { [[ "${DEBUG:-false}" == "true" ]] && echo "[DEBUG] $*"; }
fi

# Load error library
if [[ -f "${LIB_DIR}/error.sh" ]]; then
    source "${LIB_DIR}/error.sh"
else
    # Fallback error codes if error.sh not available
    declare -ri ERROR_SUCCESS=0
    declare -ri ERROR_GENERAL=1
    declare -ri ERROR_INVALID_ARGUMENT=2
    declare -ri ERROR_DATABASE=12
    declare -ri ERROR_STATE=10
fi

#==============================================================================
# Database Connection Functions
#==============================================================================

# Initialize state library and test database connection
# Usage: state_init
# Returns: 0 on success, ERROR_DATABASE on failure
state_init() {
    log_debug "Initializing state management library..."

    # Validate required environment variables
    if [[ -z "$STATE_DB_PASSWORD" ]]; then
        # Try to load from .env.state_db file
        local env_file="${SCRIPT_DIR}/../.env.state_db"
        if [[ -f "$env_file" ]]; then
            log_debug "Loading database credentials from $env_file"
            set -a
            source "$env_file"
            set +a
        fi
    fi

    if [[ -z "$STATE_DB_PASSWORD" ]]; then
        log_error "Database password not set. Please set STATE_DB_PASSWORD environment variable"
        return $ERROR_DATABASE
    fi

    # Build psql connection options
    STATE_PSQL_OPTS=(
        -h "$STATE_DB_HOST"
        -p "$STATE_DB_PORT"
        -d "$STATE_DB_NAME"
        -U "$STATE_DB_USER"
        -c
        "sslmode=${STATE_DB_SSL_MODE}"
        -q
        -t
    )

    # Export password for psql (more secure than command line)
    export PGPASSWORD="$STATE_DB_PASSWORD"

    # Test database connection
    if ! state_test_connection; then
        log_error "Failed to connect to state database at ${STATE_DB_HOST}:${STATE_DB_PORT}/${STATE_DB_NAME}"
        STATE_DB_CONNECTED=false
        return $ERROR_DATABASE
    fi

    STATE_DB_CONNECTED=true
    STATE_DB_CONNECTION_TESTED=true
    log_success "State database connection established"
    return $ERROR_SUCCESS
}

# Test database connection with retry
# Usage: state_test_connection
# Returns: 0 on success, ERROR_DATABASE on failure
state_test_connection() {
    local attempt=1
    local max_attempts=$STATE_DB_MAX_RETRIES

    while [[ $attempt -le $max_attempts ]]; do
        log_debug "Testing database connection (attempt $attempt/$max_attempts)..."

        if PGPASSWORD="$STATE_DB_PASSWORD" psql \
            -h "$STATE_DB_HOST" \
            -p "$STATE_DB_PORT" \
            -d "$STATE_DB_NAME" \
            -U "$STATE_DB_USER" \
            -c "sslmode=${STATE_DB_SSL_MODE}" \
            -c "SELECT 1" \
            -q \
            -o /dev/null \
            2>&1; then
            log_debug "Database connection test successful"
            return 0
        fi

        if [[ $attempt -lt $max_attempts ]]; then
            log_debug "Connection test failed, retrying in ${STATE_DB_RETRY_DELAY}s..."
            sleep "$STATE_DB_RETRY_DELAY"
        fi

        ((attempt++))
    done

    log_error "Database connection test failed after $max_attempts attempts"
    return $ERROR_DATABASE
}

# Execute SQL query with error handling and retry
# Usage: state_exec_sql <sql_query> [variable_name_for_result]
# Returns: 0 on success, ERROR_DATABASE on failure
# If variable_name is provided, result is stored in that variable
state_exec_sql() {
    local sql_query="$1"
    local result_var="${2:-}"

    if [[ "$STATE_DB_CONNECTED" != "true" ]]; then
        log_error "Database not connected. Call state_init() first"
        return $ERROR_DATABASE
    fi

    log_debug "Executing SQL: ${sql_query:0:100}..."

    local attempt=1
    local max_attempts=$STATE_DB_MAX_RETRIES
    local output
    local exit_code

    while [[ $attempt -le $max_attempts ]]; do
        output=$(PGPASSWORD="$STATE_DB_PASSWORD" psql \
            -h "$STATE_DB_HOST" \
            -p "$STATE_DB_PORT" \
            -d "$STATE_DB_NAME" \
            -U "$STATE_DB_USER" \
            -c "sslmode=${STATE_DB_SSL_MODE}" \
            -c "$sql_query" \
            -t \
            -q \
            2>&1)
        exit_code=$?

        if [[ $exit_code -eq 0 ]]; then
            # Trim whitespace
            output=$(echo "$output" | xargs)

            if [[ -n "$result_var" ]]; then
                eval "$result_var='$output'"
            fi

            return 0
        fi

        if [[ $attempt -lt $max_attempts ]]; then
            log_debug "SQL execution failed (exit code: $exit_code), retrying in ${STATE_DB_RETRY_DELAY}s..."
            sleep "$STATE_DB_RETRY_DELAY"
        fi

        ((attempt++))
    done

    STATE_LAST_ERROR="$output"
    STATE_LAST_EXIT_CODE=$exit_code
    log_error "SQL execution failed after $max_attempts attempts: $output"
    return $ERROR_DATABASE
}

# Escape single quotes for SQL strings
# Usage: state_escape_sql <string>
# Outputs: Escaped string safe for SQL
state_escape_sql() {
    local input="$1"
    # Replace ' with ''
    echo "${input//\'/\'\'}"
}

#==============================================================================
# Deployment Recording Functions
#==============================================================================

# Record deployment start in database
# Usage: record_deployment_start <tenant_id> <version> <environment> [deployment_type] [component] [deployed_by] [git_commit_sha] [git_branch]
# Returns: 0 on success, error code on failure
# Sets STATE_LAST_DEPLOYMENT_ID to the new deployment_id
record_deployment_start() {
    local tenant_id="$1"
    local version="$2"
    local environment="$3"
    local deployment_type="${4:-update}"
    local component="${5:-all}"
    local deployed_by="${6:-${USER:-unknown}}"
    local git_commit_sha="${7:-}"
    local git_branch="${8:-}"
    local metadata_json="${9:-{}}"

    log_info "Recording deployment start for tenant: $tenant_id, version: $version, environment: $environment"

    # Validate required parameters
    if [[ -z "$tenant_id" || -z "$version" || -z "$environment" ]]; then
        log_error "Missing required parameters: tenant_id, version, environment"
        return $ERROR_INVALID_ARGUMENT
    fi

    # Validate deployment_type
    if [[ ! "$deployment_type" =~ ^(initial|update|rollback|scale)$ ]]; then
        log_error "Invalid deployment_type: $deployment_type (must be: initial, update, rollback, scale)"
        return $ERROR_INVALID_ARGUMENT
    fi

    # Validate component
    if [[ ! "$component" =~ ^(all|backend|frontend|database)$ ]]; then
        log_error "Invalid component: $component (must be: all, backend, frontend, database)"
        return $ERROR_INVALID_ARGUMENT
    fi

    # Escape values for SQL
    local escaped_tenant_id
    local escaped_version
    local escaped_deployment_type
    local escaped_component
    local escaped_deployed_by
    local escaped_git_commit_sha
    local escaped_git_branch
    local escaped_metadata

    escaped_tenant_id=$(state_escape_sql "$tenant_id")
    escaped_version=$(state_escape_sql "$version")
    escaped_deployment_type=$(state_escape_sql "$deployment_type")
    escaped_component=$(state_escape_sql "$component")
    escaped_deployed_by=$(state_escape_sql "$deployed_by")
    escaped_git_commit_sha=$(state_escape_sql "$git_commit_sha")
    escaped_git_branch=$(state_escape_sql "$git_branch")
    escaped_metadata=$(state_escape_sql "$metadata_json")

    # Build INSERT query
    local sql_query
    sql_query="INSERT INTO deployments (
        tenant_id,
        deployment_type,
        component,
        version,
        git_commit_sha,
        git_branch,
        deployed_by,
        status,
        started_at,
        deployment_metadata
    ) VALUES (
        '$escaped_tenant_id',
        '$escaped_deployment_type',
        '$escaped_component',
        '$escaped_version',
        ${git_commit_sha:+\'$escaped_git_commit_sha\'}NULL,
        ${git_branch:+\'$escaped_git_branch\'}NULL,
        '$escaped_deployed_by',
        'in_progress',
        NOW(),
        '$escaped_metadata'::jsonb
    ) RETURNING deployment_id;"

    local deployment_id
    if ! state_exec_sql "$sql_query" deployment_id; then
        log_error "Failed to record deployment start: $STATE_LAST_ERROR"
        return $ERROR_DATABASE
    fi

    # Extract deployment_id from output
    deployment_id=$(echo "$deployment_id" | tr -d ' ')

    if [[ -z "$deployment_id" ]]; then
        log_error "Failed to get deployment_id from database"
        return $ERROR_DATABASE
    fi

    STATE_LAST_DEPLOYMENT_ID="$deployment_id"
    log_success "Deployment started with ID: $deployment_id"
    return $ERROR_SUCCESS
}

# Record deployment success in database
# Usage: record_deployment_success <deployment_id> [output_message]
# Returns: 0 on success, error code on failure
record_deployment_success() {
    local deployment_id="$1"
    local output_message="${2:-Deployment completed successfully}"

    log_info "Recording deployment success for deployment_id: $deployment_id"

    # Validate deployment_id
    if [[ -z "$deployment_id" ]]; then
        log_error "Missing deployment_id parameter"
        return $ERROR_INVALID_ARGUMENT
    fi

    # Ensure deployment_id is a number
    if [[ ! "$deployment_id" =~ ^[0-9]+$ ]]; then
        log_error "Invalid deployment_id: $deployment_id (must be numeric)"
        return $ERROR_INVALID_ARGUMENT
    fi

    # Escape values for SQL
    local escaped_output
    escaped_output=$(state_escape_sql "$output_message")

    # Build UPDATE query
    local sql_query
    sql_query="UPDATE deployments
    SET status = 'success',
        completed_at = NOW(),
        error_message = NULL
    WHERE deployment_id = $deployment_id
    RETURNING deployment_id;"

    local result
    if ! state_exec_sql "$sql_query" result; then
        log_error "Failed to record deployment success: $STATE_LAST_ERROR"
        return $ERROR_DATABASE
    fi

    log_success "Deployment success recorded for deployment_id: $deployment_id"
    return $ERROR_SUCCESS
}

# Record deployment failure in database
# Usage: record_deployment_failure <deployment_id> <error_code> <error_message>
# Returns: 0 on success, error code on failure
record_deployment_failure() {
    local deployment_id="$1"
    local error_code="$2"
    local error_message="$3"

    log_info "Recording deployment failure for deployment_id: $deployment_id"

    # Validate required parameters
    if [[ -z "$deployment_id" || -z "$error_code" || -z "$error_message" ]]; then
        log_error "Missing required parameters: deployment_id, error_code, error_message"
        return $ERROR_INVALID_ARGUMENT
    fi

    # Ensure deployment_id is a number
    if [[ ! "$deployment_id" =~ ^[0-9]+$ ]]; then
        log_error "Invalid deployment_id: $deployment_id (must be numeric)"
        return $ERROR_INVALID_ARGUMENT
    fi

    # Escape values for SQL
    local escaped_error_code
    local escaped_error_message
    escaped_error_code=$(state_escape_sql "$error_code")
    escaped_error_message=$(state_escape_sql "$error_message")

    # Build UPDATE query
    local sql_query
    sql_query="UPDATE deployments
    SET status = 'failed',
        completed_at = NOW(),
        error_message = '[$escaped_error_code] $escaped_error_message'
    WHERE deployment_id = $deployment_id
    RETURNING deployment_id;"

    local result
    if ! state_exec_sql "$sql_query" result; then
        log_error "Failed to record deployment failure: $STATE_LAST_ERROR"
        return $ERROR_DATABASE
    fi

    log_warning "Deployment failure recorded for deployment_id: $deployment_id"
    return $ERROR_SUCCESS
}

#==============================================================================
# Configuration Snapshot Functions
#==============================================================================

# Record configuration snapshot for a deployment
# Usage: record_config_snapshot <deployment_id> <config_file> [env_file] [docker_compose_file] [nginx_config_file]
# Returns: 0 on success, error code on failure
record_config_snapshot() {
    local deployment_id="$1"
    local config_file="$2"
    local env_file="${3:-}"
    local docker_compose_file="${4:-}"
    local nginx_config_file="${5:-}"

    log_info "Recording configuration snapshot for deployment_id: $deployment_id"

    # Validate required parameters
    if [[ -z "$deployment_id" || -z "$config_file" ]]; then
        log_error "Missing required parameters: deployment_id, config_file"
        return $ERROR_INVALID_ARGUMENT
    fi

    # Ensure deployment_id is a number
    if [[ ! "$deployment_id" =~ ^[0-9]+$ ]]; then
        log_error "Invalid deployment_id: $deployment_id (must be numeric)"
        return $ERROR_INVALID_ARGUMENT
    fi

    # Check if config file exists
    if [[ ! -f "$config_file" ]]; then
        log_error "Config file not found: $config_file"
        return $ERROR_FILE_NOT_FOUND
    fi

    # Encode files to base64
    local config_content
    local env_content=""
    local docker_compose_content=""
    local nginx_config_content=""

    config_content=$(base64 -i "$config_file" 2>/dev/null)

    if [[ -z "$config_content" ]]; then
        log_error "Failed to encode config file: $config_file"
        return $ERROR_FILE_OPERATION
    fi

    # Optional files
    if [[ -n "$env_file" && -f "$env_file" ]]; then
        env_content=$(base64 -i "$env_file" 2>/dev/null) || env_content=""
    fi

    if [[ -n "$docker_compose_file" && -f "$docker_compose_file" ]]; then
        docker_compose_content=$(base64 -i "$docker_compose_file" 2>/dev/null) || docker_compose_content=""
    fi

    if [[ -n "$nginx_config_file" && -f "$nginx_config_file" ]]; then
        nginx_config_content=$(base64 -i "$nginx_config_file" 2>/dev/null) || nginx_config_content=""
    fi

    # Escape values for SQL
    local escaped_config
    local escaped_env
    local escaped_docker_compose
    local escaped_nginx

    escaped_config=$(state_escape_sql "$config_content")
    escaped_env=$(state_escape_sql "$env_content")
    escaped_docker_compose=$(state_escape_sql "$docker_compose_content")
    escaped_nginx=$(state_escape_sql "$nginx_config_content")

    # Build INSERT query
    local sql_query
    sql_query="INSERT INTO deployment_config_snapshots (
        deployment_id,
        config_content,
        env_content,
        docker_compose_content,
        nginx_config_content,
        created_at
    ) VALUES (
        $deployment_id,
        '$escaped_config',
        ${env_content:+\'$escaped_env\'}NULL,
        ${docker_compose_content:+\'$escaped_docker_compose\'}NULL,
        ${nginx_config_content:+\'$escaped_nginx\'}NULL,
        NOW()
    ) ON CONFLICT (deployment_id) DO UPDATE SET
        config_content = EXCLUDED.config_content,
        env_content = EXCLUDED.env_content,
        docker_compose_content = EXCLUDED.docker_compose_content,
        nginx_config_content = EXCLUDED.nginx_config_content
    RETURNING snapshot_id;"

    local snapshot_id
    if ! state_exec_sql "$sql_query" snapshot_id; then
        log_error "Failed to record configuration snapshot: $STATE_LAST_ERROR"
        return $ERROR_DATABASE
    fi

    snapshot_id=$(echo "$snapshot_id" | tr -d ' ')
    log_success "Configuration snapshot recorded with ID: $snapshot_id"
    return $ERROR_SUCCESS
}

#==============================================================================
# Health Check Functions
#==============================================================================

# Record health check result
# Usage: record_health_check <tenant_id> <check_type> <status> [response_time_ms] [error_message] [deployment_id] [check_details_json]
# Returns: 0 on success, error code on failure
record_health_check() {
    local tenant_id="$1"
    local check_type="$2"
    local status="$3"
    local response_time_ms="${4:-}"
    local error_message="${5:-}"
    local deployment_id="${6:-}"
    local check_details_json="${7:-{}}"

    log_debug "Recording health check for tenant: $tenant_id, type: $check_type, status: $status"

    # Validate required parameters
    if [[ -z "$tenant_id" || -z "$check_type" || -z "$status" ]]; then
        log_error "Missing required parameters: tenant_id, check_type, status"
        return $ERROR_INVALID_ARGUMENT
    fi

    # Validate check_type
    if [[ ! "$check_type" =~ ^(http|database|oauth|redis|ssh|docker)$ ]]; then
        log_error "Invalid check_type: $check_type (must be: http, database, oauth, redis, ssh, docker)"
        return $ERROR_INVALID_ARGUMENT
    fi

    # Validate status
    if [[ ! "$status" =~ ^(pass|fail|warning|skip)$ ]]; then
        log_error "Invalid status: $status (must be: pass, fail, warning, skip)"
        return $ERROR_INVALID_ARGUMENT
    fi

    # Escape values for SQL
    local escaped_tenant_id
    local escaped_check_type
    local escaped_status
    local escaped_error
    local escaped_details

    escaped_tenant_id=$(state_escape_sql "$tenant_id")
    escaped_check_type=$(state_escape_sql "$check_type")
    escaped_status=$(state_escape_sql "$status")
    escaped_error=$(state_escape_sql "$error_message")
    escaped_details=$(state_escape_sql "$check_details_json")

    # Build INSERT query
    local sql_query
    sql_query="INSERT INTO health_checks (
        tenant_id,
        check_type,
        status,
        response_time_ms,
        error_message,
        ${deployment_id:+deployment_id,}
        check_details,
        checked_at
    ) VALUES (
        '$escaped_tenant_id',
        '$escaped_check_type',
        '$escaped_status',
        ${response_time_ms:+$response_time_ms}NULL,
        ${error_message:+\'$escaped_error\'}NULL,
        ${deployment_id:+$deployment_id,}
        '$escaped_details'::jsonb,
        NOW()
    );"

    if ! state_exec_sql "$sql_query"; then
        log_error "Failed to record health check: $STATE_LAST_ERROR"
        return $ERROR_DATABASE
    fi

    log_debug "Health check recorded successfully"
    return $ERROR_SUCCESS
}

#==============================================================================
# Security Audit Functions
#==============================================================================

# Record security audit event
# Usage: record_security_audit <tenant_id> <event_type> <actor> <action> [resource_type] [resource_id] [ip_address] [user_agent] [old_value_json] [new_value_json]
# Returns: 0 on success, error code on failure
record_security_audit() {
    local tenant_id="$1"
    local event_type="$2"
    local actor="$3"
    local action="$4"
    local resource_type="${5:-}"
    local resource_id="${6:-}"
    local ip_address="${7:-}"
    local user_agent="${8:-}"
    local old_value_json="${9:-{}}"
    local new_value_json="${10:-{}}"

    log_debug "Recording security audit for tenant: $tenant_id, event: $event_type, actor: $actor"

    # Validate required parameters
    if [[ -z "$tenant_id" || -z "$event_type" || -z "$actor" || -z "$action" ]]; then
        log_error "Missing required parameters: tenant_id, event_type, actor, action"
        return $ERROR_INVALID_ARGUMENT
    fi

    # Validate event_type
    if [[ ! "$event_type" =~ ^(ssh_access|config_change|deployment|key_rotation|permission_change|data_access|security_event)$ ]]; then
        log_error "Invalid event_type: $event_type"
        return $ERROR_INVALID_ARGUMENT
    fi

    # Escape values for SQL
    local escaped_tenant_id
    local escaped_event_type
    local escaped_actor
    local escaped_action
    local escaped_resource_type
    local escaped_resource_id
    local escaped_ip
    local escaped_user_agent
    local escaped_old_value
    local escaped_new_value

    escaped_tenant_id=$(state_escape_sql "$tenant_id")
    escaped_event_type=$(state_escape_sql "$event_type")
    escaped_actor=$(state_escape_sql "$actor")
    escaped_action=$(state_escape_sql "$action")
    escaped_resource_type=$(state_escape_sql "$resource_type")
    escaped_resource_id=$(state_escape_sql "$resource_id")
    escaped_ip=$(state_escape_sql "$ip_address")
    escaped_user_agent=$(state_escape_sql "$user_agent")
    escaped_old_value=$(state_escape_sql "$old_value_json")
    escaped_new_value=$(state_escape_sql "$new_value_json")

    # Build INSERT query
    local sql_query
    sql_query="INSERT INTO security_audit_log (
        tenant_id,
        event_type,
        actor,
        action,
        resource_type,
        resource_id,
        ip_address,
        user_agent,
        old_value,
        new_value,
        event_timestamp
    ) VALUES (
        '$escaped_tenant_id',
        '$escaped_event_type',
        '$escaped_actor',
        '$escaped_action',
        ${resource_type:+\'$escaped_resource_type\'}NULL,
        ${resource_id:+\'$escaped_resource_id\'}NULL,
        ${ip_address:+\'$escaped_ip\'::inet}NULL,
        ${user_agent:+\'$escaped_user_agent\'}NULL,
        '$escaped_old_value'::jsonb,
        '$escaped_new_value'::jsonb,
        NOW()
    );"

    if ! state_exec_sql "$sql_query"; then
        log_error "Failed to record security audit: $STATE_LAST_ERROR"
        return $ERROR_DATABASE
    fi

    log_debug "Security audit recorded successfully"
    return $ERROR_SUCCESS
}

#==============================================================================
# Tenant Query Functions
#==============================================================================

# Get last deployment for a tenant
# Usage: get_tenant_last_deployment <tenant_id> [output_variable]
# Returns: 0 on success, error code on failure
# If output_variable is provided, result is stored in that variable
# Output format: deployment_id|status|version|started_at|completed_at
get_tenant_last_deployment() {
    local tenant_id="$1"
    local output_var="${2:-STATE_TENANT_LAST_DEPLOYMENT}"

    log_debug "Getting last deployment for tenant: $tenant_id"

    # Validate required parameters
    if [[ -z "$tenant_id" ]]; then
        log_error "Missing required parameter: tenant_id"
        return $ERROR_INVALID_ARGUMENT
    fi

    # Escape values for SQL
    local escaped_tenant_id
    escaped_tenant_id=$(state_escape_sql "$tenant_id")

    # Build SELECT query
    local sql_query
    sql_query="SELECT deployment_id|status|version|started_at|completed_at
    FROM deployments
    WHERE tenant_id = '$escaped_tenant_id'
    ORDER BY started_at DESC
    LIMIT 1;"

    local result
    if ! state_exec_sql "$sql_query" result; then
        log_error "Failed to get tenant last deployment: $STATE_LAST_ERROR"
        return $ERROR_DATABASE
    fi

    if [[ -z "$result" ]]; then
        log_debug "No deployments found for tenant: $tenant_id"
        eval "$output_var=''"
        return $ERROR_SUCCESS
    fi

    eval "$output_var='$result'"
    log_debug "Last deployment retrieved: $result"
    return $ERROR_SUCCESS
}

#==============================================================================
# Concurrent Deployment Detection
#==============================================================================

# Check if there's a concurrent deployment in progress
# Usage: check_concurrent_deployment <tenant_id> [output_variable]
# Returns: 0 if no concurrent deployment, 1 if concurrent deployment exists
# If output_variable is provided, deployment_id is stored in that variable
check_concurrent_deployment() {
    local tenant_id="$1"
    local output_var="${2:-STATE_CONCURRENT_DEPLOYMENT_ID}"

    log_debug "Checking for concurrent deployments for tenant: $tenant_id"

    # Validate required parameters
    if [[ -z "$tenant_id" ]]; then
        log_error "Missing required parameter: tenant_id"
        return $ERROR_INVALID_ARGUMENT
    fi

    # Escape values for SQL
    local escaped_tenant_id
    escaped_tenant_id=$(state_escape_sql "$tenant_id")

    # Build SELECT query for in_progress deployments
    local sql_query
    sql_query="SELECT deployment_id
    FROM deployments
    WHERE tenant_id = '$escaped_tenant_id'
        AND status = 'in_progress'
        AND started_at > NOW() - INTERVAL '1 hour'
    ORDER BY started_at DESC
    LIMIT 1;"

    local result
    if ! state_exec_sql "$sql_query" result; then
        log_error "Failed to check concurrent deployments: $STATE_LAST_ERROR"
        return $ERROR_DATABASE
    fi

    if [[ -n "$result" ]]; then
        result=$(echo "$result" | tr -d ' ')
        eval "$output_var='$result'"
        log_warning "Concurrent deployment detected: $result"
        return 1
    fi

    eval "$output_var=''"
    log_debug "No concurrent deployments detected"
    return $ERROR_SUCCESS
}

#==============================================================================
# Configuration Drift Functions
#==============================================================================

# Record configuration drift detection
# Usage: record_config_drift <tenant_id> <severity> <config_file_path> <expected_value> <actual_value> [resolution_notes]
# Returns: 0 on success, error code on failure
record_config_drift() {
    local tenant_id="$1"
    local severity="$2"
    local config_file_path="$3"
    local expected_value="$4"
    local actual_value="$5"
    local resolution_notes="${6:-}"

    log_info "Recording configuration drift for tenant: $tenant_id, severity: $severity"

    # Validate required parameters
    if [[ -z "$tenant_id" || -z "$severity" || -z "$config_file_path" ]]; then
        log_error "Missing required parameters: tenant_id, severity, config_file_path"
        return $ERROR_INVALID_ARGUMENT
    fi

    # Validate severity
    if [[ ! "$severity" =~ ^(critical|major|minor)$ ]]; then
        log_error "Invalid severity: $severity (must be: critical, major, minor)"
        return $ERROR_INVALID_ARGUMENT
    fi

    # Escape values for SQL
    local escaped_tenant_id
    local escaped_severity
    local escaped_config_path
    local escaped_expected
    local escaped_actual
    local escaped_resolution

    escaped_tenant_id=$(state_escape_sql "$tenant_id")
    escaped_severity=$(state_escape_sql "$severity")
    escaped_config_path=$(state_escape_sql "$config_file_path")
    escaped_expected=$(state_escape_sql "$expected_value")
    escaped_actual=$(state_escape_sql "$actual_value")
    escaped_resolution=$(state_escape_sql "$resolution_notes")

    # Build INSERT query
    local sql_query
    sql_query="INSERT INTO config_drift_reports (
        tenant_id,
        drift_detected_at,
        config_file_path,
        expected_value,
        actual_value,
        drift_severity,
        resolved,
        resolution_notes
    ) VALUES (
        '$escaped_tenant_id',
        NOW(),
        '$escaped_config_path',
        '$escaped_expected',
        '$escaped_actual',
        '$escaped_severity',
        false,
        ${resolution_notes:+\'$escaped_resolution\'}NULL
    );"

    if ! state_exec_sql "$sql_query"; then
        log_error "Failed to record configuration drift: $STATE_LAST_ERROR"
        return $ERROR_DATABASE
    fi

    log_warning "Configuration drift recorded successfully"
    return $ERROR_SUCCESS
}

#==============================================================================
# Utility Functions
#==============================================================================

# Get deployment statistics for a tenant
# Usage: get_deployment_stats <tenant_id> <days> [output_variable]
# Returns: 0 on success, error code on failure
# Output format: total|success|failed|avg_duration_seconds
get_deployment_stats() {
    local tenant_id="$1"
    local days="${2:-7}"
    local output_var="${3:-STATE_DEPLOYMENT_STATS}"

    log_debug "Getting deployment stats for tenant: $tenant_id, days: $days"

    # Validate required parameters
    if [[ -z "$tenant_id" ]]; then
        log_error "Missing required parameter: tenant_id"
        return $ERROR_INVALID_ARGUMENT
    fi

    # Escape values for SQL
    local escaped_tenant_id
    escaped_tenant_id=$(state_escape_sql "$tenant_id")

    # Build SELECT query using database function
    local sql_query
    sql_query="SELECT total_deployments|successful_deployments|failed_deployments|avg_duration_seconds
    FROM get_deployment_stats($days)
    WHERE tenant_id = '$escaped_tenant_id';"

    local result
    if ! state_exec_sql "$sql_query" result; then
        log_error "Failed to get deployment stats: $STATE_LAST_ERROR"
        return $ERROR_DATABASE
    fi

    if [[ -z "$result" ]]; then
        log_debug "No deployment stats found for tenant: $tenant_id"
        eval "$output_var='0|0|0|0'"
        return $ERROR_SUCCESS
    fi

    eval "$output_var='$result'"
    log_debug "Deployment stats retrieved: $result"
    return $ERROR_SUCCESS
}

# Cleanup function to close database connection
# Usage: state_cleanup
state_cleanup() {
    log_debug "Cleaning up state library..."

    # Unset password
    unset PGPASSWORD

    STATE_DB_CONNECTED=false
    STATE_DB_CONNECTION_TESTED=false

    log_debug "State library cleanup complete"
}

# Register cleanup function
if [[ -n "$ERROR_SCRIPT_NAME" ]]; then
    register_cleanup_function "state_cleanup"
fi

#==============================================================================
# Library Initialization
#==============================================================================

# Auto-initialize if STATE_DB_AUTO_INIT is set
if [[ "${STATE_DB_AUTO_INIT:-false}" == "true" ]]; then
    state_init
fi

log_debug "State management library loaded"
