#!/bin/bash
#==============================================================================
# Pre-Deployment Checks Script
# (部署前检查脚本)
#
# Purpose: Comprehensive pre-deployment validation and checks
#
# Features:
# - Configuration validation
# - Dependency checking
# - Resource availability verification
# - Network connectivity testing
# - Security validation
# - Concurrent deployment detection
#
# Usage:
#   ./pre-deploy.sh <tenant_config_file>
#
# Dependencies:
# - scripts/lib/*.sh (all library files)
# - yq (YAML processor)
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

# Check results
declare -a FAILED_CHECKS=()
declare -a WARNING_CHECKS=()
declare -a PASSED_CHECKS=()

#==============================================================================
# Source Libraries
#==============================================================================

# Source required libraries
for lib in logging.sh error.sh config.sh validation.sh state.sh ssh.sh; do
    if [[ -f "${LIB_DIR}/$lib" ]]; then
        source "${LIB_DIR}/$lib"
    else
        echo "ERROR: Required library not found: $lib" >&2
        exit 1
    fi
done

#==============================================================================
# Check Functions
#==============================================================================

# Check 1: Configuration file exists and is readable
check_config_file() {
    local config_file="$1"

    log_info "Checking configuration file..."

    if [[ ! -f "$config_file" ]]; then
        log_error "Configuration file not found: $config_file"
        FAILED_CHECKS+=("config_file")
        return 1
    fi

    if [[ ! -r "$config_file" ]]; then
        log_error "Configuration file not readable: $config_file"
        FAILED_CHECKS+=("config_file")
        return 1
    fi

    log_success "Configuration file check passed"
    PASSED_CHECKS+=("config_file")
    return 0
}

# Check 2: Required tools are installed
check_required_tools() {
    log_info "Checking required tools..."

    local required_tools=("yq" "ssh" "scp" "curl" "docker")
    local missing_tools=()

    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            log_error "Required tool not found: $tool"
            missing_tools+=("$tool")
        fi
    done

    if [[ ${#missing_tools[@]} -gt 0 ]]; then
        log_error "Missing required tools: ${missing_tools[*]}"
        FAILED_CHECKS+=("required_tools")
        return 1
    fi

    log_success "Required tools check passed"
    PASSED_CHECKS+=("required_tools")
    return 0
}

# Check 3: Configuration validation
check_configuration() {
    local config_file="$1"

    log_info "Validating configuration..."

    # Load configuration
    if ! load_tenant_config "$config_file"; then
        log_error "Failed to load configuration"
        FAILED_CHECKS+=("config_load")
        return 1
    fi

    # Basic validation
    if ! validate_config "$config_file"; then
        log_error "Configuration validation failed"
        FAILED_CHECKS+=("config_validation")
        return 1
    fi

    # Comprehensive validation
    if ! validate_config_comprehensive "$config_file"; then
        log_error "Comprehensive validation failed"
        FAILED_CHECKS+=("config_comprehensive")
        return 1
    fi

    log_success "Configuration validation passed"
    PASSED_CHECKS+=("configuration")
    return 0
}

# Check 4: SSH connectivity
check_ssh_connectivity() {
    log_info "Checking SSH connectivity..."

    local server_host="${CONFIG_SERVER_HOST:-}"
    local server_user="${CONFIG_SERVER_SSH_USER:-}"
    local ssh_key_path="${CONFIG_SERVER_SSH_KEY_PATH:-}"

    if [[ -z "$server_host" || -z "$server_user" ]]; then
        log_error "Server host or SSH user not configured"
        FAILED_CHECKS+=("ssh_config")
        return 1
    fi

    # Expand SSH key path
    ssh_key_path="${ssh_key_path/#\~/$HOME}"

    if [[ ! -f "$ssh_key_path" ]]; then
        log_error "SSH key not found: $ssh_key_path"
        FAILED_CHECKS+=("ssh_key")
        return 1
    fi

    # Configure SSH
    ssh_set_key "$ssh_key_path"

    # Test connection
    local ssh_target="${server_user}@${server_host}"
    if ! ssh_test "$ssh_target"; then
        log_error "SSH connection test failed"
        FAILED_CHECKS+=("ssh_connection")
        return 1
    fi

    log_success "SSH connectivity check passed"
    PASSED_CHECKS+=("ssh_connectivity")
    return 0
}

# Check 5: Docker availability on remote server
check_remote_docker() {
    log_info "Checking Docker availability on remote server..."

    local server_host="${CONFIG_SERVER_HOST:-}"
    local server_user="${CONFIG_SERVER_SSH_USER:-}"
    local ssh_target="${server_user}@${server_host}"

    if ! ssh_exec "$ssh_target" "docker --version" &> /dev/null; then
        log_error "Docker not available on remote server"
        FAILED_CHECKS+=("remote_docker")
        return 1
    fi

    log_success "Remote Docker check passed"
    PASSED_CHECKS+=("remote_docker")
    return 0
}

# Check 6: Disk space on remote server
check_disk_space() {
    log_info "Checking disk space on remote server..."

    local server_host="${CONFIG_SERVER_HOST:-}"
    local server_user="${CONFIG_SERVER_SSH_USER:-}"
    local deploy_path="${CONFIG_SERVER_DEPLOY_PATH:-/opt/opclaw/platform}"
    local ssh_target="${server_user}@${server_host}"
    local min_space_gb=5

    # Get available disk space
    local available_space
    available_space=$(ssh_exec "$ssh_target" "df -BG '$deploy_path' | tail -1 | awk '{print \$4}' | tr -d 'G'")

    if [[ -z "$available_space" ]]; then
        log_warning "Could not determine available disk space"
        WARNING_CHECKS+=("disk_space")
        return 0
    fi

    if [[ "$available_space" -lt "$min_space_gb" ]]; then
        log_error "Insufficient disk space: ${available_space}G available, ${min_space_gb}G required"
        FAILED_CHECKS+=("disk_space")
        return 1
    fi

    log_success "Disk space check passed (${available_space}G available)"
    PASSED_CHECKS+=("disk_space")
    return 0
}

# Check 7: Memory availability on remote server
check_memory_availability() {
    log_info "Checking memory availability on remote server..."

    local server_host="${CONFIG_SERVER_HOST:-}"
    local server_user="${CONFIG_SERVER_SSH_USER:-}"
    local ssh_target="${server_user}@${server_host}"
    local min_memory_mb=1024

    # Get available memory
    local available_memory
    available_memory=$(ssh_exec "$ssh_target" "free -m | grep '^Mem:' | awk '{print \$7}'")

    if [[ -z "$available_memory" ]]; then
        log_warning "Could not determine available memory"
        WARNING_CHECKS+=("memory")
        return 0
    fi

    if [[ "$available_memory" -lt "$min_memory_mb" ]]; then
        log_warning "Low memory: ${available_memory}MB available, ${min_memory_mb}MB recommended"
        WARNING_CHECKS+=("memory")
        return 0
    fi

    log_success "Memory check passed (${available_memory}MB available)"
    PASSED_CHECKS+=("memory")
    return 0
}

# Check 8: Database connectivity
check_database_connectivity() {
    log_info "Checking database connectivity..."

    local db_host="${CONFIG_DATABASE_HOST:-}"
    local db_port="${CONFIG_DATABASE_PORT:-5432}"

    if [[ -z "$db_host" ]]; then
        log_error "Database host not configured"
        FAILED_CHECKS+=("database_config")
        return 1
    fi

    # Check if database is reachable
    if ! timeout 5 bash -c "cat < /dev/null > /dev/tcp/${db_host}/${db_port}" 2>/dev/null; then
        log_error "Database not reachable: ${db_host}:${db_port}"
        FAILED_CHECKS+=("database_connectivity")
        return 1
    fi

    log_success "Database connectivity check passed"
    PASSED_CHECKS+=("database_connectivity")
    return 0
}

# Check 9: Redis connectivity
check_redis_connectivity() {
    log_info "Checking Redis connectivity..."

    local redis_host="${CONFIG_REDIS_HOST:-}"
    local redis_port="${CONFIG_REDIS_PORT:-6379}"

    if [[ -z "$redis_host" ]]; then
        log_error "Redis host not configured"
        FAILED_CHECKS+=("redis_config")
        return 1
    fi

    # Check if Redis is reachable
    if ! timeout 5 bash -c "cat < /dev/null > /dev/tcp/${redis_host}/${redis_port}" 2>/dev/null; then
        log_warning "Redis not reachable: ${redis_host}:${redis_port}"
        WARNING_CHECKS+=("redis_connectivity")
        return 0
    fi

    log_success "Redis connectivity check passed"
    PASSED_CHECKS+=("redis_connectivity")
    return 0
}

# Check 10: Port availability
check_port_availability() {
    log_info "Checking port availability..."

    local server_host="${CONFIG_SERVER_HOST:-}"
    local server_user="${CONFIG_SERVER_SSH_USER:-}"
    local api_port="${CONFIG_SERVER_API_PORT:-3000}"
    local ssh_target="${server_user}@${server_host}"

    # Check if port is already in use
    if ssh_exec "$ssh_target" "netstat -tuln 2>/dev/null | grep -q ':${api_port} '"; then
        log_warning "Port ${api_port} is already in use"
        WARNING_CHECKS+=("port_availability")
        return 0
    fi

    log_success "Port availability check passed"
    PASSED_CHECKS+=("port_availability")
    return 0
}

# Check 11: Concurrent deployments
check_concurrent_deployments() {
    log_info "Checking for concurrent deployments..."

    local tenant_id="${CONFIG_TENANT_ID:-}"

    if [[ -z "$tenant_id" ]]; then
        log_error "Tenant ID not configured"
        FAILED_CHECKS+=("concurrent_check")
        return 1
    fi

    # Initialize state database
    if ! state_init; then
        log_warning "Could not initialize state database, skipping concurrent deployment check"
        WARNING_CHECKS+=("concurrent_check")
        return 0
    fi

    # Check for concurrent deployments
    local concurrent_id
    if check_concurrent_deployment "$tenant_id" concurrent_id; then
        log_error "Concurrent deployment detected: $concurrent_id"
        FAILED_CHECKS+=("concurrent_deployment")
        return 1
    fi

    log_success "Concurrent deployment check passed"
    PASSED_CHECKS+=("concurrent_deployment")
    return 0
}

# Check 12: Security validation (comprehensive security check suite)
check_security_validation() {
    local config_file="$1"
    local tenant_id="${CONFIG_TENANT_ID:-}"

    log_section "Comprehensive Security Validation"

    # Run the comprehensive security check suite
    local security_dir="${SCRIPT_DIR}/../security"
    local security_suite="${security_dir}/security-check-suite.sh"

    if [[ ! -f "$security_suite" ]]; then
        log_warning "Security check suite not found: $security_suite"
        log_warning "Falling back to basic security checks"

        # Fallback to basic checks
        if check_placeholders "$config_file"; then
            log_error "Configuration contains placeholder values"
            FAILED_CHECKS+=("security_placeholders")
            return 1
        fi

        if ! check_critical_fields "$config_file"; then
            log_error "Critical security fields are missing or invalid"
            FAILED_CHECKS+=("security_critical")
            return 1
        fi

        local jwt_secret="${CONFIG_JWT_SECRET:-}"
        if [[ ${#jwt_secret} -lt 32 ]]; then
            log_warning "JWT secret is weak (< 32 characters)"
            WARNING_CHECKS+=("jwt_strength")
        fi

        log_success "Basic security validation passed"
        PASSED_CHECKS+=("security")
        return 0
    fi

    # Run comprehensive security checks
    log_info "Running comprehensive security check suite..."

    local security_output
    local security_exit_code=0

    # Run security checks (config, secrets, permissions - skip log scan for speed)
    security_output=$("$security_suite" "$config_file" "$tenant_id" --config --secrets --permissions --quiet 2>&1) || security_exit_code=$?

    case $security_exit_code in
        0)
            log_success "Comprehensive security validation PASSED"
            PASSED_CHECKS+=("security")
            return 0
            ;;
        1)
            log_error "Comprehensive security validation FAILED"
            log_error "Security issues detected - deployment BLOCKED"

            # Parse output for details
            if [[ "$security_output" =~ (Secrets found|Weak secrets|Placeholders detected) ]]; then
                FAILED_CHECKS+=("security_comprehensive")
            fi

            return 1
            ;;
        2)
            log_warning "Security check suite configuration error"
            log_warning "Falling back to basic security checks"

            # Fallback to basic checks
            if check_placeholders "$config_file"; then
                log_error "Configuration contains placeholder values"
                FAILED_CHECKS+=("security_placeholders")
                return 1
            fi

            if ! check_critical_fields "$config_file"; then
                log_error "Critical security fields are missing or invalid"
                FAILED_CHECKS+=("security_critical")
                return 1
            fi

            log_success "Basic security validation passed"
            PASSED_CHECKS+=("security")
            return 0
            ;;
        *)
            log_warning "Security check suite returned unexpected exit code: $security_exit_code"
            log_warning "Treating as warning and proceeding with basic checks"

            # Basic checks
            if check_placeholders "$config_file"; then
                log_error "Configuration contains placeholder values"
                FAILED_CHECKS+=("security_placeholders")
                return 1
            fi

            log_success "Basic security validation passed"
            PASSED_CHECKS+=("security")
            return 0
            ;;
    esac
}

# Check 13: Network configuration
check_network_configuration() {
    log_info "Checking network configuration..."

    local server_host="${CONFIG_SERVER_HOST:-}"
    local domain="${CONFIG_SERVER_DOMAIN:-$server_host}"

    # Check if domain resolves
    if [[ "$domain" != "localhost" && "$domain" != "$server_host" ]]; then
        if ! host "$domain" &> /dev/null; then
            log_warning "Domain does not resolve: $domain"
            WARNING_CHECKS+=("domain_resolution")
            return 0
        fi
    fi

    log_success "Network configuration check passed"
    PASSED_CHECKS+=("network")
    return 0
}

# Check 14: Backup availability
check_backup_availability() {
    log_info "Checking backup availability..."

    local server_host="${CONFIG_SERVER_HOST:-}"
    local server_user="${CONFIG_SERVER_SSH_USER:-}"
    local deploy_path="${CONFIG_SERVER_DEPLOY_PATH:-/opt/opclaw/platform}"
    local ssh_target="${server_user}@${server_host}"

    # Check if backup directory exists and is writable
    if ! ssh_exec "$ssh_target" "mkdir -p /var/backups/opclaw && test -w /var/backups/opclaw"; then
        log_warning "Backup directory not available or not writable"
        WARNING_CHECKS+=("backup_directory")
        return 0
    fi

    log_success "Backup availability check passed"
    PASSED_CHECKS+=("backup")
    return 0
}

#==============================================================================
# Main Function
#==============================================================================

# Run all pre-deployment checks
run_all_checks() {
    local config_file="$1"

    log_section "Pre-Deployment Checks"

    # Run all checks
    check_config_file "$config_file"
    check_required_tools
    check_configuration "$config_file"
    check_ssh_connectivity
    check_remote_docker
    check_disk_space
    check_memory_availability
    check_database_connectivity
    check_redis_connectivity
    check_port_availability
    check_concurrent_deployments
    check_security_validation "$config_file"
    check_network_configuration
    check_backup_availability

    # Print summary
    log_separator
    log_info "Check Summary"
    log_separator

    local total_checks=$((${#PASSED_CHECKS[@]} + ${#FAILED_CHECKS[@]} + ${#WARNING_CHECKS[@]}))
    local passed_count=${#PASSED_CHECKS[@]}
    local failed_count=${#FAILED_CHECKS[@]}
    local warning_count=${#WARNING_CHECKS[@]}

    log_info "Total checks: $total_checks"
    log_success "Passed: $passed_count"
    log_error "Failed: $failed_count"
    log_warning "Warnings: $warning_count"

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

    # Return exit code
    if [[ ${#FAILED_CHECKS[@]} -gt 0 ]]; then
        log_error "Pre-deployment checks FAILED"
        return 1
    elif [[ ${#WARNING_CHECKS[@]} -gt 0 ]]; then
        log_warning "Pre-deployment checks PASSED with warnings"
        return 0
    else
        log_success "Pre-deployment checks PASSED"
        return 0
    fi
}

#==============================================================================
# Script Entry Point
#==============================================================================

main() {
    local config_file="$1"

    if [[ -z "$config_file" ]]; then
        echo "Usage: $(basename "$0") <tenant_config_file>" >&2
        exit 1
    fi

    # Convert to absolute path
    if [[ ! "$config_file" =~ ^/ ]]; then
        config_file="${PROJECT_ROOT}/${config_file}"
    fi

    # Initialize logging
    log_init "$(basename "$0")"
    error_init "$(basename "$0")"

    # Run all checks
    if run_all_checks "$config_file"; then
        exit 0
    else
        exit 1
    fi
}

main "$@"
