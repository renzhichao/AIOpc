#!/bin/bash
#==============================================================================
# Configuration Validation Library
# (配置验证库)
#
# Purpose: Advanced validation functions for tenant configurations
#
# Features:
# - JSON Schema validation (using ajv-cli or similar)
# - Secret strength validation
# - Configuration consistency checking
# - Cross-field validation
# - Best practices enforcement
#
# Usage:
#   source /path/to/validation.sh
#   validate_config_comprehensive "/path/to/config.yml"
#
# Dependencies:
# - yq (for YAML parsing)
# - ajv-cli (optional, for JSON Schema validation)
#
# Version: 1.0
# Last Updated: 2026-03-19
#==============================================================================

# Source the config library for shared functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -f "${SCRIPT_DIR}/config.sh" ]; then
    source "${SCRIPT_DIR}/config.sh"
else
    echo "ERROR: config.sh not found in ${SCRIPT_DIR}" >&2
    exit 1
fi

#==============================================================================
# Validation Configuration
#==============================================================================

# Secret strength requirements
MIN_SECRET_LENGTH=32
MIN_PASSWORD_LENGTH=16
MIN_ENCRYPT_KEY_LENGTH=24

# Best practices rules
STRICT_MODE="${STRICT_MODE:-false}"
WARN_ON_PLACEHOLDERS="${WARN_ON_PLACEHOLDERS:-true}"

#==============================================================================
# Advanced Validation Functions
#==============================================================================

# Comprehensive configuration validation
# Usage: validate_config_comprehensive <config_file>
validate_config_comprehensive() {
    local config_file=$1

    check_yq_installed || return 1
    check_config_file "$config_file" || return 1

    log_config_info "Running comprehensive validation on: $config_file"

    local total_checks=0
    local passed_checks=0
    local failed_checks=0
    local warning_checks=0

    # Run all validation checks
    if run_validation_check "basic_structure" "$config_file"; then
        ((passed_checks++))
    else
        ((failed_checks++))
    fi
    ((total_checks++))

    if run_validation_check "required_fields" "$config_file"; then
        ((passed_checks++))
    else
        ((failed_checks++))
    fi
    ((total_checks++))

    if run_validation_check "data_types" "$config_file"; then
        ((passed_checks++))
    else
        ((failed_checks++))
    fi
    ((total_checks++))

    if run_validation_check "secret_strength" "$config_file"; then
        ((passed_checks++))
    else
        ((failed_checks++))
    fi
    ((total_checks++))

    if run_validation_check "network_settings" "$config_file"; then
        ((passed_checks++))
    else
        ((failed_checks++))
    fi
    ((total_checks++))

    if run_validation_check "file_paths" "$config_file"; then
        ((passed_checks++))
    else
        ((failed_checks++))
    fi
    ((total_checks++))

    if run_validation_check "best_practices" "$config_file"; then
        ((passed_checks++))
    else
        ((warning_checks++))
    fi
    ((total_checks++))

    if run_validation_check "consistency" "$config_file"; then
        ((passed_checks++))
    else
        ((warning_checks++))
    fi
    ((total_checks++))

    # Print summary
    echo
    echo "========================================"
    echo "  Validation Summary"
    echo "========================================"
    echo "Total Checks: $total_checks"
    echo "Passed: $passed_checks"
    echo "Failed: $failed_checks"
    echo "Warnings: $warning_checks"
    echo

    if [ $failed_checks -gt 0 ]; then
        log_config_error "Validation FAILED with $failed_checks error(s)"
        return 1
    elif [ $warning_checks -gt 0 ]; then
        log_config_warning "Validation PASSED with $warning_checks warning(s)"
        return 0
    else
        log_config_success "Validation PASSED all checks"
        return 0
    fi
}

# Run individual validation check
run_validation_check() {
    local check_name=$1
    local config_file=$2

    log_config_debug "Running check: $check_name"

    case $check_name in
        basic_structure)
            validate_basic_structure "$config_file"
            ;;
        required_fields)
            validate_required_fields "$config_file"
            ;;
        data_types)
            validate_data_types "$config_file"
            ;;
        secret_strength)
            validate_secret_strength "$config_file"
            ;;
        network_settings)
            validate_network_settings "$config_file"
            ;;
        file_paths)
            validate_file_paths "$config_file"
            ;;
        best_practices)
            validate_best_practices "$config_file"
            ;;
        consistency)
            validate_consistency "$config_file"
            ;;
        *)
            log_config_warning "Unknown validation check: $check_name"
            return 1
            ;;
    esac
}

#==============================================================================
# Specific Validation Checks
#==============================================================================

# Validate basic YAML structure
validate_basic_structure() {
    local config_file=$1

    log_config_debug "Validating basic YAML structure..."

    # Check if YAML is valid
    if ! yq eval '.' "$config_file" &>/dev/null; then
        log_config_error "Invalid YAML syntax"
        return 1
    fi

    # Check for required top-level keys
    local required_keys=("tenant" "server" "feishu" "database" "redis" "jwt" "agent")
    for key in "${required_keys[@]}"; do
        if ! yq eval ".$key" "$config_file" &>/dev/null; then
            log_config_error "Missing required top-level key: $key"
            return 1
        fi
    done

    log_config_debug "Basic structure validation passed"
    return 0
}

# Validate required fields
validate_required_fields() {
    local config_file=$1

    log_config_debug "Validating required fields..."

    local required_fields=(
        "tenant.id"
        "tenant.name"
        "tenant.environment"
        "server.host"
        "server.ssh_user"
        "server.ssh_key_path"
        "server.deploy_path"
        "feishu.app_id"
        "feishu.app_secret"
        "feishu.encrypt_key"
        "feishu.oauth_redirect_uri"
        "database.host"
        "database.port"
        "database.name"
        "database.user"
        "database.password"
        "redis.host"
        "redis.port"
        "jwt.secret"
        "jwt.expires_in"
        "agent.deepseek.api_key"
    )

    local missing_fields=()
    for field in "${required_fields[@]}"; do
        local value
        value=$(get_config_value "$config_file" "$field" 2>/dev/null)

        if [ -z "$value" ] || [ "$value" = "null" ]; then
            missing_fields+=("$field")
        fi
    done

    if [ ${#missing_fields[@]} -gt 0 ]; then
        log_config_error "Missing required fields:"
        for field in "${missing_fields[@]}"; do
            echo "  - $field"
        done
        return 1
    fi

    log_config_debug "Required fields validation passed"
    return 0
}

# Validate data types
validate_data_types() {
    local config_file=$1

    log_config_debug "Validating data types..."

    local errors=0

    # Check tenant.id is alphanumeric
    local tenant_id
    tenant_id=$(get_config_value "$config_file" "tenant.id")
    if [[ ! "$tenant_id" =~ ^[a-zA-Z0-9_-]+$ ]]; then
        log_config_error "tenant.id must be alphanumeric (can contain underscores and hyphens): $tenant_id"
        ((errors++))
    fi

    # Check environment is valid
    local environment
    environment=$(get_config_value "$config_file" "tenant.environment")
    if [[ ! "$environment" =~ ^(production|staging|development)$ ]]; then
        log_config_error "tenant.environment must be 'production', 'staging', or 'development': $environment"
        ((errors++))
    fi

    # Check port numbers are numeric
    local port_fields=("server.api_port" "server.metrics_port" "database.port" "redis.port")
    for field in "${port_fields[@]}"; do
        local value
        value=$(get_config_value "$config_file" "$field" 2>/dev/null)

        if [ -n "$value" ] && [ "$value" != "null" ]; then
            if ! [[ "$value" =~ ^[0-9]+$ ]]; then
                log_config_error "$field must be numeric: $value"
                ((errors++))
            fi
        fi
    done

    if [ $errors -gt 0 ]; then
        return 1
    fi

    log_config_debug "Data types validation passed"
    return 0
}

# Validate secret strength
validate_secret_strength() {
    local config_file=$1

    log_config_debug "Validating secret strength..."

    local errors=0

    # Check JWT secret
    local jwt_secret
    jwt_secret=$(get_config_value "$config_file" "jwt.secret")
    if [ ${#jwt_secret} -lt $MIN_SECRET_LENGTH ]; then
        log_config_error "jwt.secret is too weak (minimum ${MIN_SECRET_LENGTH} characters)"
        ((errors++))
    fi

    # Check Feishu App Secret
    local feishu_secret
    feishu_secret=$(get_config_value "$config_file" "feishu.app_secret")
    if [ ${#feishu_secret} -lt $MIN_SECRET_LENGTH ]; then
        log_config_warning "feishu.app_secret seems weak (expected at least ${MIN_SECRET_LENGTH} characters)"
    fi

    # Check encrypt key
    local encrypt_key
    encrypt_key=$(get_config_value "$config_file" "feishu.encrypt_key")
    if [ ${#encrypt_key} -lt $MIN_ENCRYPT_KEY_LENGTH ]; then
        log_config_error "feishu.encrypt_key is too weak (minimum ${MIN_ENCRYPT_KEY_LENGTH} characters)"
        ((errors++))
    fi

    # Check database password
    local db_password
    db_password=$(get_config_value "$config_file" "database.password")
    if [ ${#db_password} -lt $MIN_PASSWORD_LENGTH ]; then
        log_config_warning "database.password seems weak (expected at least ${MIN_PASSWORD_LENGTH} characters)"
    fi

    if [ $errors -gt 0 ]; then
        return 1
    fi

    log_config_debug "Secret strength validation passed"
    return 0
}

# Validate network settings
validate_network_settings() {
    local config_file=$1

    log_config_debug "Validating network settings..."

    local errors=0

    # Check port ranges
    local port_fields=(
        "server.api_port:3000:65535"
        "server.metrics_port:1024:65535"
        "database.port:1:65535"
        "redis.port:1:65535"
    )

    for port_field_spec in "${port_fields[@]}"; do
        IFS=':' read -r field min_port max_port <<< "$port_field_spec"

        local value
        value=$(get_config_value "$config_file" "$field" 2>/dev/null)

        if [ -n "$value" ] && [ "$value" != "null" ]; then
            if ! [[ "$value" =~ ^[0-9]+$ ]]; then
                log_config_error "$field must be numeric: $value"
                ((errors++))
            elif [ "$value" -lt $min_port ] || [ "$value" -gt $max_port ]; then
                log_config_error "$field out of range ($min_port-$max_port): $value"
                ((errors++))
            fi
        fi
    done

    # Check URL formats
    local url_fields=(
        "feishu.oauth_redirect_uri"
        "feishu.api_base_url"
    )

    for field in "${url_fields[@]}"; do
        local value
        value=$(get_config_value "$config_file" "$field" 2>/dev/null)

        if [ -n "$value" ] && [ "$value" != "null" ]; then
            if [[ ! "$value" =~ ^https?:// ]]; then
                log_config_error "$field must be a valid URL (http:// or https://): $value"
                ((errors++))
            fi
        fi
    done

    if [ $errors -gt 0 ]; then
        return 1
    fi

    log_config_debug "Network settings validation passed"
    return 0
}

# Validate file paths
validate_file_paths() {
    local config_file=$1

    log_config_debug "Validating file paths..."

    local errors=0
    local warnings=0

    # Check SSH key path format
    local ssh_key_path
    ssh_key_path=$(get_config_value "$config_file" "server.ssh_key_path")
    if [[ ! "$ssh_key_path" =~ ^(/|\~/|~).* ]]; then
        log_config_error "server.ssh_key_path must be an absolute path or start with ~/: $ssh_key_path"
        ((errors++))
    fi

    # Check deploy path format
    local deploy_path
    deploy_path=$(get_config_value "$config_file" "server.deploy_path")
    if [[ ! "$deploy_path" =~ ^/.* ]]; then
        log_config_error "server.deploy_path must be an absolute path: $deploy_path"
        ((errors++))
    fi

    # Check if paths exist (warning only for production)
    local environment
    environment=$(get_config_value "$config_file" "tenant.environment")

    # In CI environment, SSH_KEY_PATH is set via environment variable
    # Skip path validation if SSH_KEY_PATH env var is set
    if [ -z "${SSH_KEY_PATH:-}" ]; then
        # Only check config file path if SSH_KEY_PATH env var is not set
        if [ "$environment" = "production" ]; then
            if [ ! -f "$ssh_key_path" ]; then
                log_config_warning "SSH key path does not exist: $ssh_key_path"
                ((warnings++))
            fi
        fi
    else
        log_config_debug "SSH_KEY_PATH environment variable set, skipping config path validation"
    fi

    if [ $errors -gt 0 ]; then
        return 1
    fi

    log_config_debug "File paths validation passed"
    return 0
}

# Validate best practices
validate_best_practices() {
    local config_file=$1

    log_config_debug "Validating best practices..."

    local warnings=0

    # Check for default values
    local tenant_id
    tenant_id=$(get_config_value "$config_file" "tenant.id")
    if [[ "$tenant_id" =~ (example|test|demo|placeholder) ]]; then
        log_config_warning "tenant.id contains default/test value: $tenant_id"
        ((warnings++))
    fi

    # Check for localhost in production
    local environment
    environment=$(get_config_value "$config_file" "tenant.environment")
    local server_host
    server_host=$(get_config_value "$config_file" "server.host")

    if [ "$environment" = "production" ] && [[ "$server_host" =~ (localhost|127\.0\.0\.1) ]]; then
        log_config_warning "Production environment should not use localhost: $server_host"
        ((warnings++))
    fi

    # Check for default ports in production
    if [ "$environment" = "production" ]; then
        local api_port
        api_port=$(get_config_value "$config_file" "server.api_port")
        if [ "$api_port" = "3000" ]; then
            log_config_warning "Production environment should use non-default API port"
            ((warnings++))
        fi
    fi

    # Check for weak JWT expiration
    local jwt_expires
    jwt_expires=$(get_config_value "$config_file" "jwt.expires_in")
    if [[ "$jwt_expires" =~ ^[0-9]+(h|hr)$ ]]; then
        local hours
        hours=$(echo "$jwt_expires" | grep -oE '^[0-9]+')
        if [ "$hours" -gt 24 ]; then
            log_config_warning "JWT expiration time is long ($jwt_expires), consider shorter tokens for security"
            ((warnings++))
        fi
    fi

    if [ $warnings -gt 0 ]; then
        return 1
    fi

    log_config_debug "Best practices validation passed"
    return 0
}

# Validate consistency across fields
validate_consistency() {
    local config_file=$1

    log_config_debug "Validating field consistency..."

    local errors=0

    # Check database name includes tenant ID
    local tenant_id
    tenant_id=$(get_config_value "$config_file" "tenant.id")
    local db_name
    db_name=$(get_config_value "$config_file" "database.name")

    if [[ ! "$db_name" == *"$tenant_id"* ]] && [[ ! "$db_name" == *"opclaw"* ]]; then
        log_config_warning "database.name doesn't reference tenant ID or 'opclaw': $db_name"
    fi

    # Check JWT issuer matches tenant ID or is set
    local jwt_issuer
    jwt_issuer=$(get_config_value "$config_file" "jwt.issuer" 2>/dev/null)

    if [ -n "$jwt_issuer" ] && [ "$jwt_issuer" != "null" ]; then
        if [[ ! "$jwt_issuer" == *"$tenant_id"* ]]; then
            log_config_warning "jwt.issuer doesn't match tenant ID: $jwt_issuer vs $tenant_id"
        fi
    fi

    # Check TLS settings consistency
    local redis_tls_enabled
    redis_tls_enabled=$(get_config_value "$config_file" "redis.tls.enabled" 2>/dev/null)

    if [ "$redis_tls_enabled" = "true" ]; then
        local redis_tls_ca
        redis_tls_ca=$(get_config_value "$config_file" "redis.tls.ca_cert" 2>/dev/null)

        if [ -z "$redis_tls_ca" ] || [ "$redis_tls_ca" = "null" ]; then
            log_config_warning "Redis TLS is enabled but ca_cert is not specified"
        fi
    fi

    if [ $errors -gt 0 ]; then
        return 1
    fi

    log_config_debug "Consistency validation passed"
    return 0
}

#==============================================================================
# Schema Validation (Optional)
#==============================================================================

# Validate against JSON schema
# Usage: validate_against_schema <config_file> <schema_file>
validate_against_schema() {
    local config_file=$1
    local schema_file=${2:-"${SCHEMA_FILE}"}

    if [ ! -f "$schema_file" ]; then
        log_config_warning "Schema file not found: $schema_file"
        return 0
    fi

    log_config_info "Validating against schema: $schema_file"

    # Check if ajv-cli is available
    if ! command -v ajv &> /dev/null; then
        log_config_warning "ajv-cli not found, skipping schema validation"
        return 0
    fi

    # Convert YAML to JSON
    local json_config
    json_config=$(get_config_json "$config_file")

    # Validate against schema
    if echo "$json_config" | ajv validate -s "$schema_file" &>/dev/null; then
        log_config_success "Schema validation passed"
        return 0
    else
        log_config_error "Schema validation failed"
        echo "$json_config" | ajv validate -s "$schema_file" 2>&1
        return 1
    fi
}

#==============================================================================
# Report Generation
#==============================================================================

# Generate validation report
# Usage: generate_validation_report <config_file> <output_file>
generate_validation_report() {
    local config_file=$1
    local output_file=$2

    log_config_info "Generating validation report..."

    {
        echo "# Configuration Validation Report"
        echo "# Generated: $(get_timestamp)"
        echo "# Config: $config_file"
        echo

        echo "## Configuration Summary"
        echo "- Tenant ID: $(get_config_value "$config_file" "tenant.id")"
        echo "- Tenant Name: $(get_config_value "$config_file" "tenant.name")"
        echo "- Environment: $(get_config_value "$config_file" "tenant.environment")"
        echo

        echo "## Validation Results"
        echo

        # Run comprehensive validation
        if validate_config_comprehensive "$config_file"; then
            echo "Status: PASSED"
        else
            echo "Status: FAILED"
        fi

    } > "$output_file"

    log_config_success "Validation report saved to: $output_file"
}

#==============================================================================
# Export Functions
#==============================================================================

export -f validate_config_comprehensive run_validation_check
export -f validate_basic_structure validate_required_fields validate_data_types
export -f validate_secret_strength validate_network_settings validate_file_paths
export -f validate_best_practices validate_consistency
export -f validate_against_schema generate_validation_report
