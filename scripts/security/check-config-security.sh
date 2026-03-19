#!/usr/bin/env bash
#==============================================================================
# Configuration Security Check Script
# (配置安全检查脚本)
#
# Purpose: Detect placeholder values and security issues in configuration files
#
# Features:
# - Placeholder value detection (cli_xxxxxxxxxxxxx, CHANGE_THIS, etc.)
# - Weak password detection
# - Default value detection
# - Configuration file validation
# - Integration with state database for audit logging
#
# Usage:
#   ./check-config-security.sh <config_file> [tenant_id]
#
# Exit Codes:
#   0: All checks passed
#   1: Security issues found
#   2: Configuration errors
#
# Dependencies:
# - scripts/lib/logging.sh
# - scripts/lib/error.sh
# - scripts/lib/config.sh
# - scripts/lib/state.sh
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

# Security check results
declare -a SECURITY_ISSUES=()
declare -a SECURITY_WARNINGS=()
declare -a SECURITY_PASSED=()

# Exit codes
declare -r EXIT_SUCCESS=0
declare -r EXIT_SECURITY_ISSUES=1
declare -r EXIT_CONFIG_ERROR=2

#==============================================================================
# Source Libraries
#==============================================================================

for lib in logging.sh error.sh config.sh state.sh; do
    if [[ -f "${LIB_DIR}/$lib" ]]; then
        source "${LIB_DIR}/$lib"
    else
        echo "ERROR: Required library not found: $lib" >&2
        exit $EXIT_CONFIG_ERROR
    fi
done

#==============================================================================
# Security Patterns
#==============================================================================

# Placeholder patterns that indicate configuration is not production-ready
declare -a PLACEHOLDER_PATTERNS=(
    "cli_xxxxxxxxxxxxx"           # Feishu placeholder (11+ x's)
    "CHANGE_THIS"                 # Generic placeholder
    "YOUR_"                       # Generic placeholder prefix
    "your_"                       # Generic placeholder prefix
    "placeholder"                 # Literal placeholder
    "REPLACE_WITH_SECRET"         # Instruction placeholder
    "TODO_ADD_REAL_VALUE"         # TODO placeholder
    "example_password"            # Example password
    "test_password"               # Test password
    "demo_password"               # Demo password
    "\${.*:-example}"             # Environment default with example
    "\${.*:-test}"                # Environment default with test
    "replace-in-config-page"      # UI placeholder
)

# Weak password patterns
declare -a WEAK_PASSWORD_PATTERNS=(
    "12345678"                    # Sequential numbers
    "123456789"                   # Sequential numbers
    "password"                    # Literal "password"
    "admin"                       # Literal "admin"
    "root"                        # Literal "root"
    "test123"                     # Common test password
    "demo123"                     # Common demo password
    "qwerty"                      # Keyboard pattern
    "abc123"                      # Common pattern
    "11111111"                    # Repeated numbers
    "00000000"                    # Repeated zeros
)

# Default value patterns
declare -a DEFAULT_VALUE_PATTERNS=(
    "example\.com"                # Example domain
    "example@"                    # Example email
    "test@"                       # Test email
    "demo@"                       # Demo email
    "localhost"                   # Localhost (warning in production)
    "127\.0\.0\.1"                # Local IP (warning in production)
    "0\.0\.0\.0"                  # All interfaces (warning)
)

# Fields that require strong secrets
declare -a CRITICAL_SECRET_FIELDS=(
    "feishu.app_id"
    "feishu.app_secret"
    "feishu.encrypt_key"
    "database.password"
    "redis.password"
    "jwt.secret"
    "agent.deepseek.api_key"
)

#==============================================================================
# Helper Functions
#==============================================================================

# Check if string matches any pattern in array
# Usage: matches_pattern <string> <pattern_array_name>
matches_pattern() {
    local string="$1"
    local pattern_array_name="$2"
    local pattern

    eval "local patterns=(\"\${${pattern_array_name}[@]}\")"

    for pattern in "${patterns[@]}"; do
        if [[ "$string" =~ $pattern ]]; then
            return 0  # Match found
        fi
    done

    return 1  # No match
}

# Extract all string values from YAML config
# Usage: extract_config_values <config_file>
extract_config_values() {
    local config_file="$1"

    yq eval '.. | select(kind == "Scalar") | select(string_value != "null") | string_value' "$config_file" 2>/dev/null
}

# Extract all field paths from YAML config
# Usage: extract_config_paths <config_file>
extract_config_paths() {
    local config_file="$1"

    yq eval '.. | select(kind == "Scalar") | select(string_value != "null") | path | join(".")' "$config_file" 2>/dev/null
}

#==============================================================================
# Security Check Functions
#==============================================================================

# Check 1: Placeholder value detection
check_placeholders() {
    local config_file="$1"
    local tenant_id="$2"
    local has_issues=false

    log_info "Checking for placeholder values..."

    # Get all paths and values
    local paths
    paths=$(extract_config_paths "$config_file")

    while IFS= read -r path; do
        if [[ -z "$path" ]]; then
            continue
        fi

        local value
        value=$(yq eval ".$path" "$config_file" 2>/dev/null)

        if [[ -z "$value" || "$value" == "null" ]]; then
            continue
        fi

        # Check if value matches placeholder patterns
        if matches_pattern "$value" "PLACEHOLDER_PATTERNS"; then
            # Determine if this is a critical field
            local is_critical=false
            for critical_field in "${CRITICAL_SECRET_FIELDS[@]}"; do
                if [[ ".$path" == *".$critical_field" ]]; then
                    is_critical=true
                    break
                fi
            done

            if [[ "$is_critical" == true ]]; then
                log_error "CRITICAL: Placeholder in $path: $value"
                SECURITY_ISSUES+=("placeholder:$path")

                # Record to security audit
                if [[ -n "$tenant_id" ]]; then
                    record_security_audit \
                        "$tenant_id" \
                        "security_event" \
                        "security_check" \
                        "placeholder_detected" \
                        "config_field" \
                        "$path" \
                        "" \
                        "" \
                        "$value" \
                        "{}"
                fi

                has_issues=true
            else
                log_warning "Placeholder in $path: $value"
                SECURITY_WARNINGS+=("placeholder:$path")
            fi
        fi
    done <<< "$paths"

    if [[ "$has_issues" == false ]]; then
        log_success "No placeholder values found"
        SECURITY_PASSED+=("placeholders")
    fi

    return 0
}

# Check 2: Weak password detection
check_weak_passwords() {
    local config_file="$1"
    local tenant_id="$2"
    local has_issues=false

    log_info "Checking for weak passwords..."

    # Check password fields
    local password_fields=(
        "database.password"
        "redis.password"
        "feishu.app_secret"
    )

    for field in "${password_fields[@]}"; do
        local value
        value=$(yq eval ".$field" "$config_file" 2>/dev/null)

        if [[ -z "$value" || "$value" == "null" ]]; then
            continue
        fi

        # Check against weak password patterns
        if matches_pattern "$value" "WEAK_PASSWORD_PATTERNS"; then
            log_error "WEAK: Weak password in $field: $value"
            SECURITY_ISSUES+=("weak_password:$field")

            # Record to security audit
            if [[ -n "$tenant_id" ]]; then
                record_security_audit \
                    "$tenant_id" \
                    "security_event" \
                    "security_check" \
                    "weak_password_detected" \
                    "config_field" \
                    "$field" \
                    "" \
                    "" \
                    "$value" \
                    "{}"
            fi

            has_issues=true
        fi
    done

    if [[ "$has_issues" == false ]]; then
        log_success "No weak passwords found"
        SECURITY_PASSED+=("weak_passwords")
    fi

    return 0
}

# Check 3: Default value detection
check_default_values() {
    local config_file="$1"
    local tenant_id="$2"

    log_info "Checking for default values..."

    # Get environment
    local environment
    environment=$(yq eval '.tenant.environment // "development"' "$config_file" 2>/dev/null)

    # Get all paths and values
    local paths
    paths=$(extract_config_paths "$config_file")

    while IFS= read -r path; do
        if [[ -z "$path" ]]; then
            continue
        fi

        local value
        value=$(yq eval ".$path" "$config_file" 2>/dev/null)

        if [[ -z "$value" || "$value" == "null" ]]; then
            continue
        fi

        # Check if value matches default patterns
        if matches_pattern "$value" "DEFAULT_VALUE_PATTERNS"; then
            # In production, default values are warnings
            # In development, they're informational
            if [[ "$environment" == "production" ]]; then
                log_warning "Production config with default value in $path: $value"
                SECURITY_WARNINGS+=("default_value:$path")

                # Record to security audit
                if [[ -n "$tenant_id" ]]; then
                    record_security_audit \
                        "$tenant_id" \
                        "security_event" \
                        "security_check" \
                        "default_value_detected" \
                        "config_field" \
                        "$path" \
                        "" \
                        "" \
                        "$value" \
                        "{}"
                fi
            else
                log_debug "Default value in $path: $value"
            fi
        fi
    done <<< "$paths"

    log_success "Default value check completed"
    SECURITY_PASSED+=("default_values")
    return 0
}

# Check 4: Empty critical fields
check_empty_critical_fields() {
    local config_file="$1"
    local tenant_id="$2"
    local has_issues=false

    log_info "Checking for empty critical fields..."

    for field in "${CRITICAL_SECRET_FIELDS[@]}"; do
        local value
        value=$(yq eval ".$field" "$config_file" 2>/dev/null)

        if [[ -z "$value" || "$value" == "null" || "$value" == "''" ]]; then
            log_error "CRITICAL: Empty value for $field"
            SECURITY_ISSUES+=("empty_field:$field")

            # Record to security audit
            if [[ -n "$tenant_id" ]]; then
                record_security_audit \
                    "$tenant_id" \
                    "security_event" \
                    "security_check" \
                    "empty_critical_field" \
                    "config_field" \
                    "$field" \
                    "" \
                    "" \
                    "{}" \
                    "{}"
            fi

            has_issues=true
        fi
    done

    if [[ "$has_issues" == false ]]; then
        log_success "All critical fields have values"
        SECURITY_PASSED+=("critical_fields")
    fi

    return 0
}

# Check 5: Suspicious patterns
check_suspicious_patterns() {
    local config_file="$1"
    local tenant_id="$2"
    local has_issues=false

    log_info "Checking for suspicious patterns..."

    # Check for HTTP URLs in production (should be HTTPS)
    local environment
    environment=$(yq eval '.tenant.environment // "development"' "$config_file" 2>/dev/null)

    if [[ "$environment" == "production" ]]; then
        local url_fields=(
            "feishu.oauth_redirect_uri"
            "feishu.api_base_url"
        )

        for field in "${url_fields[@]}"; do
            local value
            value=$(yq eval ".$field" "$config_file" 2>/dev/null)

            if [[ -n "$value" && "$value" != "null" && "$value" =~ ^http:// ]]; then
                log_warning "Production config using HTTP instead of HTTPS in $field"
                SECURITY_WARNINGS+=("http_url:$field")

                # Record to security audit
                if [[ -n "$tenant_id" ]]; then
                    record_security_audit \
                        "$tenant_id" \
                        "security_event" \
                        "security_check" \
                        "insecure_url" \
                        "config_field" \
                        "$field" \
                        "" \
                        "" \
                        "$value" \
                        "{}"
                fi
            fi
        done
    fi

    log_success "Suspicious pattern check completed"
    SECURITY_PASSED+=("suspicious_patterns")
    return 0
}

#==============================================================================
# Main Function
#==============================================================================

main() {
    local config_file="$1"
    local tenant_id="${2:-}"

    # Validate arguments
    if [[ -z "$config_file" ]]; then
        log_error "Usage: $(basename "$0") <config_file> [tenant_id]"
        exit $EXIT_CONFIG_ERROR
    fi

    # Convert to absolute path
    if [[ ! "$config_file" =~ ^/ ]]; then
        config_file="${PROJECT_ROOT}/${config_file}"
    fi

    # Check if config file exists
    if [[ ! -f "$config_file" ]]; then
        log_error "Configuration file not found: $config_file"
        exit $EXIT_CONFIG_ERROR
    }

    # Initialize logging
    log_init "$(basename "$0")"

    log_section "Configuration Security Check"

    # Initialize state database if tenant_id provided
    if [[ -n "$tenant_id" ]]; then
        if ! state_init; then
            log_warning "Could not initialize state database, audit logging disabled"
        fi
    fi

    # Run all security checks
    check_placeholders "$config_file" "$tenant_id"
    check_weak_passwords "$config_file" "$tenant_id"
    check_default_values "$config_file" "$tenant_id"
    check_empty_critical_fields "$config_file" "$tenant_id"
    check_suspicious_patterns "$config_file" "$tenant_id"

    # Print summary
    log_separator
    log_info "Security Check Summary"
    log_separator

    local total_checks=$((${#SECURITY_PASSED[@]} + ${#SECURITY_ISSUES[@]} + ${#SECURITY_WARNINGS[@]}))
    local passed_count=${#SECURITY_PASSED[@]}
    local issue_count=${#SECURITY_ISSUES[@]}
    local warning_count=${#SECURITY_WARNINGS[@]}

    log_info "Total checks: $total_checks"
    log_success "Passed: $passed_count"
    log_error "Issues: $issue_count"
    log_warning "Warnings: $warning_count"

    if [[ ${#SECURITY_ISSUES[@]} -gt 0 ]]; then
        log_separator
        log_error "Security Issues:"
        for issue in "${SECURITY_ISSUES[@]}"; do
            echo "  - $issue"
        done
    fi

    if [[ ${#SECURITY_WARNINGS[@]} -gt 0 ]]; then
        log_separator
        log_warning "Warnings:"
        for warning in "${SECURITY_WARNINGS[@]}"; do
            echo "  - $warning"
        done
    fi

    log_separator

    # Return exit code
    if [[ ${#SECURITY_ISSUES[@]} -gt 0 ]]; then
        log_error "Configuration security check FAILED"
        exit $EXIT_SECURITY_ISSUES
    else
        log_success "Configuration security check PASSED"
        exit $EXIT_SUCCESS
    fi
}

main "$@"
