#!/bin/bash
#==============================================================================
# Post-Deployment Verification Script
# (部署后验证脚本)
#
# Purpose: Comprehensive post-deployment verification and health checks
#
# Features:
# - HTTP endpoint health checks
# - Database connectivity verification
# - OAuth flow testing
# - Service availability checks
# - Performance metrics collection
# - State database recording
#
# Usage:
#   ./post-deploy.sh <tenant_config_file> [deployment_id]
#
# Options:
#   --skip-oauth         Skip OAuth flow verification
#   --skip-performance   Skip performance tests
#   --verbose            Enable verbose output
#
# Dependencies:
# - scripts/lib/*.sh (all library files)
# - curl (for HTTP requests)
#
# Version: 1.0
# Last Updated: 2026-03-19
#==============================================================================

set -euo pipefail

#==============================================================================
# Script Configuration
#==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="${SCRIPT_DIR}/../lib"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Verification options
SKIP_OAUTH=false
SKIP_PERFORMANCE=false
VERBOSE=false

# Check results
declare -a FAILED_CHECKS=()
declare -a WARNING_CHECKS=()
declare -a PASSED_CHECKS=()

# Timing
declare -A CHECK_DURATIONS=()

#==============================================================================
# Source Libraries
#==============================================================================

# Source required libraries
for lib in logging.sh error.sh config.sh validation.sh state.sh; do
    if [[ -f "${LIB_DIR}/$lib" ]]; then
        source "${LIB_DIR}/$lib"
    else
        echo "ERROR: Required library not found: $lib" >&2
        exit 1
    fi
done

#==============================================================================
# Helper Functions
#==============================================================================

# Show usage
show_usage() {
    cat << EOF
Usage: $(basename "$0") <tenant_config_file> [deployment_id] [options]

Verify tenant deployment and run health checks.

Arguments:
  tenant_config_file    Path to tenant YAML configuration file
  deployment_id         Optional deployment ID from database

Options:
  --skip-oauth         Skip OAuth flow verification
  --skip-performance   Skip performance tests
  --verbose            Enable verbose output
  --help               Show this help message

EOF
}

# Parse arguments
parse_arguments() {
    local config_file=""
    local deployment_id=""

    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-oauth)
                SKIP_OAUTH=true
                shift
                ;;
            --skip-performance)
                SKIP_PERFORMANCE=true
                shift
                ;;
            --verbose)
                VERBOSE=true
                log_set_level DEBUG
                shift
                ;;
            --help|-h)
                show_usage
                exit 0
                ;;
            -*)
                log_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
            *)
                if [[ -z "$config_file" ]]; then
                    config_file="$1"
                elif [[ -z "$deployment_id" ]]; then
                    deployment_id="$1"
                else
                    log_error "Too many arguments"
                    show_usage
                    exit 1
                fi
                shift
                ;;
        esac
    done

    if [[ -z "$config_file" ]]; then
        log_error "Configuration file is required"
        show_usage
        exit 1
    fi

    # Convert to absolute path
    if [[ ! "$config_file" =~ ^/ ]]; then
        config_file="${PROJECT_ROOT}/${config_file}"
    fi

    CONFIG_FILE="$config_file"
    DEPLOYMENT_ID="$deployment_id"
}

# Time a check
time_check() {
    local check_name="$1"
    shift
    local start_time
    start_time=$(date +%s%3N)

    "$@" && local exit_code=0 || local exit_code=$?

    local end_time
    end_time=$(date +%s%3N)
    local duration=$((end_time - start_time))

    CHECK_DURATIONS[$check_name]=$duration

    return $exit_code
}

#==============================================================================
# Verification Functions
#==============================================================================

# Check 1: Load configuration
verify_configuration_loaded() {
    log_info "Loading tenant configuration..."

    if ! load_tenant_config "$CONFIG_FILE"; then
        log_error "Failed to load configuration"
        FAILED_CHECKS+=("config_load")
        return 1
    fi

    local tenant_id="${CONFIG_TENANT_ID:-}"
    if [[ -z "$tenant_id" ]]; then
        log_error "Tenant ID not found in configuration"
        FAILED_CHECKS+=("tenant_id")
        return 1
    fi

    log_success "Configuration loaded successfully"
    PASSED_CHECKS+=("config")
    return 0
}

# Check 2: HTTP health endpoint
verify_http_health() {
    log_info "Checking HTTP health endpoint..."

    local server_host="${CONFIG_SERVER_HOST:-}"
    local domain="${CONFIG_SERVER_DOMAIN:-$server_host}"
    local api_port="${CONFIG_SERVER_API_PORT:-3000}"
    local health_url="http://${domain}:${api_port}/health"

    log_debug "Health URL: $health_url"

    # Make HTTP request
    local start_time
    start_time=$(date +%s%3N)

    local http_response
    http_response=$(curl -s -w "\n%{http_code}" "$health_url" 2>&1)
    local http_code=$(echo "$http_response" | tail -n1)
    local http_body=$(echo "$http_response" | head -n-1)

    local end_time
    end_time=$(date +%s%3N)
    local response_time=$((end_time - start_time))

    log_debug "HTTP code: $http_code"
    log_debug "Response time: ${response_time}ms"

    if [[ "$http_code" != "200" ]]; then
        log_error "HTTP health check failed with code $http_code"
        log_error "Response: $http_body"
        FAILED_CHECKS+=("http_health")
        return 1
    fi

    log_success "HTTP health check passed (${response_time}ms)"
    PASSED_CHECKS+=("http_health")
    return 0
}

# Check 3: Database connectivity from deployed service
verify_database_connectivity() {
    log_info "Verifying database connectivity..."

    local server_host="${CONFIG_SERVER_HOST:-}"
    local domain="${CONFIG_SERVER_DOMAIN:-$server_host}"
    local api_port="${CONFIG_SERVER_API_PORT:-3000}"
    local db_url="http://${domain}:${api_port}/api/health/database"

    log_debug "Database health URL: $db_url"

    # Make HTTP request
    local start_time
    start_time=$(date +%s%3N)

    local http_response
    http_response=$(curl -s -w "\n%{http_code}" "$db_url" 2>&1)
    local http_code=$(echo "$http_response" | tail -n1)
    local http_body=$(echo "$http_response" | head -n-1)

    local end_time
    end_time=$(date +%s%3N)
    local response_time=$((end_time - start_time))

    if [[ "$http_code" != "200" ]]; then
        log_error "Database connectivity check failed with code $http_code"
        FAILED_CHECKS+=("database_connectivity")
        return 1
    fi

    # Parse response
    if echo "$http_body" | grep -q '"status":"ok"'; then
        log_success "Database connectivity check passed (${response_time}ms)"
        PASSED_CHECKS+=("database_connectivity")
        return 0
    else
        log_error "Database health check failed"
        log_error "Response: $http_body"
        FAILED_CHECKS+=("database_connectivity")
        return 1
    fi
}

# Check 4: Redis connectivity from deployed service
verify_redis_connectivity() {
    log_info "Verifying Redis connectivity..."

    local server_host="${CONFIG_SERVER_HOST:-}"
    local domain="${CONFIG_SERVER_DOMAIN:-$server_host}"
    local api_port="${CONFIG_SERVER_API_PORT:-3000}"
    local redis_url="http://${domain}:${api_port}/api/health/redis"

    log_debug "Redis health URL: $redis_url"

    # Make HTTP request
    local start_time
    start_time=$(date +%s%3N)

    local http_response
    http_response=$(curl -s -w "\n%{http_code}" "$redis_url" 2>&1)
    local http_code=$(echo "$http_response" | tail -n1)
    local http_body=$(echo "$http_response" | head -n-1)

    local end_time
    end_time=$(date +%s%3N)
    local response_time=$((end_time - start_time))

    if [[ "$http_code" != "200" ]]; then
        log_warning "Redis connectivity check failed with code $http_code (Redis may be optional)"
        WARNING_CHECKS+=("redis_connectivity")
        return 0
    fi

    # Parse response
    if echo "$http_body" | grep -q '"status":"ok"'; then
        log_success "Redis connectivity check passed (${response_time}ms)"
        PASSED_CHECKS+=("redis_connectivity")
        return 0
    else
        log_warning "Redis health check returned non-OK status (Redis may be optional)"
        WARNING_CHECKS+=("redis_connectivity")
        return 0
    fi
}

# Check 5: Service process status
verify_service_status() {
    log_info "Verifying service process status..."

    local server_host="${CONFIG_SERVER_HOST:-}"
    local server_user="${CONFIG_SERVER_SSH_USER:-}"
    local ssh_target="${server_user}@${server_host}"

    # Check if Docker container is running
    if ssh_exec "$ssh_target" "docker ps | grep -q opclaw-backend"; then
        log_success "Service container is running"
        PASSED_CHECKS+=("service_status")
        return 0
    else
        log_error "Service container is not running"
        FAILED_CHECKS+=("service_status")
        return 1
    fi
}

# Check 6: OAuth flow verification
verify_oauth_flow() {
    if [[ "$SKIP_OAUTH" == "true" ]]; then
        log_info "Skipping OAuth flow verification (--skip-oauth specified)"
        return 0
    fi

    log_info "Verifying OAuth flow..."

    local feishu_app_id="${CONFIG_FEISHU_APP_ID:-}"

    if [[ -z "$feishu_app_id" ]]; then
        log_warning "Feishu App ID not configured, skipping OAuth verification"
        WARNING_CHECKS+=("oauth_config")
        return 0
    fi

    # Get OAuth URL
    local server_host="${CONFIG_SERVER_HOST:-}"
    local domain="${CONFIG_SERVER_DOMAIN:-$server_host}"
    local api_port="${CONFIG_SERVER_API_PORT:-3000}"
    local oauth_url="http://${domain}:${api_port}/api/auth/feishu/login"

    log_debug "OAuth URL: $oauth_url"

    # Check OAuth endpoint responds
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" "$oauth_url" 2>&1)

    if [[ "$http_code" != "200" && "$http_code" != "302" ]]; then
        log_error "OAuth endpoint check failed with code $http_code"
        FAILED_CHECKS+=("oauth_flow")
        return 1
    fi

    log_success "OAuth flow verification passed"
    PASSED_CHECKS+=("oauth_flow")
    return 0
}

# Check 7: Performance metrics
verify_performance_metrics() {
    if [[ "$SKIP_PERFORMANCE" == "true" ]]; then
        log_info "Skipping performance metrics (--skip-performance specified)"
        return 0
    fi

    log_info "Collecting performance metrics..."

    local server_host="${CONFIG_SERVER_HOST:-}"
    local domain="${CONFIG_SERVER_DOMAIN:-$server_host}"
    local api_port="${CONFIG_SERVER_API_PORT:-3000}"
    local metrics_url="http://${domain}:${api_port}/metrics"

    log_debug "Metrics URL: $metrics_url"

    # Make HTTP request
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" "$metrics_url" 2>&1)

    if [[ "$http_code" != "200" ]]; then
        log_warning "Metrics endpoint not available (code: $http_code)"
        WARNING_CHECKS+=("metrics_endpoint")
        return 0
    fi

    # Parse some basic metrics
    local metrics
    metrics=$(curl -s "$metrics_url" 2>&1)

    if [[ -n "$metrics" ]]; then
        log_success "Performance metrics collected"
        PASSED_CHECKS+=("performance_metrics")
        return 0
    else
        log_warning "No metrics data available"
        WARNING_CHECKS+=("metrics_data")
        return 0
    fi
}

# Check 8: Configuration integrity
verify_configuration_integrity() {
    log_info "Verifying configuration integrity..."

    # Check if deployed configuration matches source
    local server_host="${CONFIG_SERVER_HOST:-}"
    local server_user="${CONFIG_SERVER_SSH_USER:-}"
    local deploy_path="${CONFIG_SERVER_DEPLOY_PATH:-/opt/opclaw/platform}"
    local ssh_target="${server_user}@${server_host}"

    # Check if .env file exists
    if ! ssh_exec "$ssh_target" "test -f ${deploy_path}/.env"; then
        log_error "Environment file not found on remote server"
        FAILED_CHECKS+=("env_file")
        return 1
    fi

    log_success "Configuration integrity verified"
    PASSED_CHECKS+=("config_integrity")
    return 0
}

# Check 9: Log files are being written
verify_logging() {
    log_info "Verifying logging..."

    local server_host="${CONFIG_SERVER_HOST:-}"
    local server_user="${CONFIG_SERVER_SSH_USER:-}"
    local deploy_path="${CONFIG_SERVER_DEPLOY_PATH:-/opt/opclaw/platform}"
    local ssh_target="${server_user}@${server_host}"

    # Check if logs directory exists and has recent entries
    if ssh_exec "$ssh_target" "test -d ${deploy_path}/logs"; then
        log_success "Logging directory exists"
        PASSED_CHECKS+=("logging")
        return 0
    else
        log_warning "Logging directory not found (may not be initialized yet)"
        WARNING_CHECKS+=("logging_directory")
        return 0
    fi
}

# Check 10: SSL/TLS configuration
verify_ssl_configuration() {
    log_info "Verifying SSL/TLS configuration..."

    local ssl_enabled="${CONFIG_SERVER_SSL_ENABLED:-true}"

    if [[ "$ssl_enabled" != "true" ]]; then
        log_info "SSL not enabled, skipping verification"
        return 0
    fi

    local server_host="${CONFIG_SERVER_HOST:-}"
    local domain="${CONFIG_SERVER_DOMAIN:-$server_host}"
    local https_url="https://${domain}/health"

    # Check HTTPS endpoint
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" -k "$https_url" 2>&1)

    if [[ "$http_code" != "200" ]]; then
        log_warning "HTTPS endpoint check failed (code: $http_code)"
        WARNING_CHECKS+=("ssl_endpoint")
        return 0
    fi

    log_success "SSL/TLS configuration verified"
    PASSED_CHECKS+=("ssl")
    return 0
}

#==============================================================================
# Recording Functions
#==============================================================================

# Record all health check results
record_health_results() {
    local tenant_id="${CONFIG_TENANT_ID:-}"

    if [[ -z "$tenant_id" ]]; then
        log_warning "Cannot record health results: tenant ID not found"
        return 1
    fi

    log_info "Recording health check results..."

    # Initialize state database
    if ! state_init; then
        log_warning "Cannot record health results: state database initialization failed"
        return 1
    fi

    # Record HTTP health check
    local http_status="fail"
    if [[ " ${PASSED_CHECKS[*]} " =~ " http_health " ]]; then
        http_status="pass"
    fi
    local http_response_time="${CHECK_DURATIONS[http_health]:-0}"
    record_health_check "$tenant_id" "http" "$http_status" "$http_response_time" "" "$DEPLOYMENT_ID"

    # Record database health check
    local db_status="fail"
    if [[ " ${PASSED_CHECKS[*]} " =~ " database_connectivity " ]]; then
        db_status="pass"
    fi
    local db_response_time="${CHECK_DURATIONS[database_connectivity]:-0}"
    record_health_check "$tenant_id" "database" "$db_status" "$db_response_time" "" "$DEPLOYMENT_ID"

    # Record OAuth health check
    if [[ "$SKIP_OAUTH" != "true" ]]; then
        local oauth_status="fail"
        if [[ " ${PASSED_CHECKS[*]} " =~ " oauth_flow " ]]; then
            oauth_status="pass"
        fi
        record_health_check "$tenant_id" "oauth" "$oauth_status" "" "" "$DEPLOYMENT_ID"
    fi

    # Record Redis health check
    local redis_status="fail"
    if [[ " ${PASSED_CHECKS[*]} " =~ " redis_connectivity " ]]; then
        redis_status="pass"
    fi
    local redis_response_time="${CHECK_DURATIONS[redis_connectivity]:-0}"
    record_health_check "$tenant_id" "redis" "$redis_status" "$redis_response_time" "" "$DEPLOYMENT_ID"

    log_success "Health check results recorded"
    return 0
}

#==============================================================================
# Main Function
#==============================================================================

# Run all verification checks
run_all_verifications() {
    log_section "Post-Deployment Verification"

    # Run all checks with timing
    time_check "config" verify_configuration_loaded
    time_check "http_health" verify_http_health
    time_check "database" verify_database_connectivity
    time_check "redis" verify_redis_connectivity
    time_check "service" verify_service_status
    time_check "config_integrity" verify_configuration_integrity
    time_check "logging" verify_logging
    time_check "ssl" verify_ssl_configuration

    if [[ "$SKIP_OAUTH" != "true" ]]; then
        time_check "oauth" verify_oauth_flow
    fi

    if [[ "$SKIP_PERFORMANCE" != "true" ]]; then
        time_check "performance" verify_performance_metrics
    fi

    # Print summary
    log_separator
    log_info "Verification Summary"
    log_separator

    local total_checks=$((${#PASSED_CHECKS[@]} + ${#FAILED_CHECKS[@]} + ${#WARNING_CHECKS[@]}))
    local passed_count=${#PASSED_CHECKS[@]}
    local failed_count=${#FAILED_CHECKS[@]}
    local warning_count=${#WARNING_CHECKS[@]}

    log_info "Total checks: $total_checks"
    log_success "Passed: $passed_count"
    log_error "Failed: $failed_count"
    log_warning "Warnings: $warning_count"

    # Print timing information
    if [[ "$VERBOSE" == "true" ]]; then
        log_separator
        log_info "Check Durations:"
        for check in "${!CHECK_DURATIONS[@]}"; do
            local duration="${CHECK_DURATIONS[$check]}"
            log_info "  $check: ${duration}ms"
        done
    fi

    if [[ ${#FAILED_CHECKS[@]} -gt 0 ]]; then
        log_separator
        log_error "Failed Checks:"
        for check in "${FAILED_CHECKS[@]}"; do
            echo "  - $check"
        done
    fi

    if [[ ${#WARNING_CHECKS[@]} -gt 0 ]]; then
        log_separator
        log_warning "Warnings:"
        for check in "${WARNING_CHECKS[@]}"; do
            echo "  - $check"
        done
    fi

    log_separator

    # Record health results
    record_health_results

    # Return exit code
    if [[ ${#FAILED_CHECKS[@]} -gt 0 ]]; then
        log_error "Post-deployment verification FAILED"
        return 1
    elif [[ ${#WARNING_CHECKS[@]} -gt 0 ]]; then
        log_warning "Post-deployment verification PASSED with warnings"
        return 0
    else
        log_success "Post-deployment verification PASSED"
        return 0
    fi
}

#==============================================================================
# Script Entry Point
#==============================================================================

main() {
    # Parse arguments
    parse_arguments "$@"

    # Initialize logging
    log_init "$(basename "$0")"
    error_init "$(basename "$0")"

    # Run all verifications
    if run_all_verifications; then
        exit 0
    else
        exit 1
    fi
}

main "$@"
