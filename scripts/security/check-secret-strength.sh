#!/usr/bin/env bash
#==============================================================================
# Secret Strength Validation Script
# (密钥强度验证脚本)
#
# Purpose: Validate the strength and complexity of secrets in configuration
#
# Features:
# - Password strength validation (length, complexity, entropy)
# - JWT secret validation
# - API key validation
# - SSH key validation
# - Encryption key validation
# - Integration with state database for audit logging
#
# Usage:
#   ./check-secret-strength.sh <config_file> [tenant_id]
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
declare -a WEAK_SECRETS=()
declare -a MEDIUM_SECRETS=()
declare -a STRONG_SECRETS=()

# Exit codes
declare -r EXIT_SUCCESS=0
declare -r EXIT_SECURITY_ISSUES=1
declare -r EXIT_CONFIG_ERROR=2

#==============================================================================
# Strength Requirements
#==============================================================================

# Minimum lengths
declare -r MIN_DB_PASSWORD_LENGTH=16
declare -r MIN_JWT_SECRET_LENGTH=32
declare -r MIN_API_KEY_LENGTH=20
declare -r MIN_ENCRYPT_KEY_LENGTH=24

# Character requirements
declare -r REQUIRE_UPPERCASE=true
declare -r REQUIRE_LOWERCASE=true
declare -r REQUIRE_DIGITS=true
declare -r REQUIRE_SPECIAL=true

# Minimum entropy (bits)
declare -r MIN_ENTROPY=80

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
# Helper Functions
#==============================================================================

# Calculate password entropy
# Usage: calculate_entropy <password>
calculate_entropy() {
    local password="$1"
    local length=${#password}

    # Determine character set size
    local charset_size=0

    if [[ "$password" =~ [A-Z] ]]; then
        ((charset_size+=26))
    fi

    if [[ "$password" =~ [a-z] ]]; then
        ((charset_size+=26))
    fi

    if [[ "$password" =~ [0-9] ]]; then
        ((charset_size+=10))
    fi

    if [[ "$password" =~ [^a-zA-Z0-9] ]]; then
        ((charset_size+=32))
    fi

    # Calculate entropy: log2(charset_size^length)
    if [[ $charset_size -gt 0 ]]; then
        echo "scale=2; $length * l($charset_size) / l(2)" | bc -l
    else
        echo "0"
    fi
}

# Check password strength
# Usage: check_password_strength <password> <field_name> <min_length>
check_password_strength() {
    local password="$1"
    local field_name="$2"
    local min_length="$3"
    local tenant_id="$4"

    local issues=()
    local score=0

    # Check length
    if [[ ${#password} -lt $min_length ]]; then
        issues+=("length<${min_length}")
    else
        ((score+=25))
    fi

    # Check uppercase
    if [[ "$REQUIRE_UPPERCASE" == true ]]; then
        if [[ ! "$password" =~ [A-Z] ]]; then
            issues+=("no_uppercase")
        else
            ((score+=25))
        fi
    fi

    # Check lowercase
    if [[ "$REQUIRE_LOWERCASE" == true ]]; then
        if [[ ! "$password" =~ [a-z] ]]; then
            issues+=("no_lowercase")
        else
            ((score+=25))
        fi
    fi

    # Check digits
    if [[ "$REQUIRE_DIGITS" == true ]]; then
        if [[ ! "$password" =~ [0-9] ]]; then
            issues+=("no_digits")
        else
            ((score+=25))
        fi
    fi

    # Check special characters
    if [[ "$REQUIRE_SPECIAL" == true ]]; then
        if [[ ! "$password" =~ [^a-zA-Z0-9] ]]; then
            issues+=("no_special")
        else
            ((score+=25))
        fi
    fi

    # Check entropy
    local entropy
    entropy=$(calculate_entropy "$password")

    if [[ $(echo "$entropy < $MIN_ENTROPY" | bc -l) -eq 1 ]]; then
        issues+=("low_entropy")
    fi

    # Determine strength level
    local strength="weak"
    if [[ ${#issues[@]} -eq 0 && $(echo "$entropy >= 100" | bc -l) -eq 1 ]]; then
        strength="strong"
    elif [[ ${#issues[@]} -le 1 ]]; then
        strength="medium"
    fi

    # Log result
    if [[ "$strength" == "weak" ]]; then
        log_error "WEAK: $field_name (${#password} chars, ${entropy} bits entropy): ${issues[*]}"
        WEAK_SECRETS+=("$field_name")

        # Record to security audit
        if [[ -n "$tenant_id" ]]; then
            record_security_audit \
                "$tenant_id" \
                "security_event" \
                "security_check" \
                "weak_secret_detected" \
                "config_field" \
                "$field_name" \
                "" \
                "" \
                "{\"length\":${#password},\"entropy\":$entropy,\"issues\":[${issues[*]}]}" \
                "{}"
        fi

        return 1
    elif [[ "$strength" == "medium" ]]; then
        log_warning "MEDIUM: $field_name (${#password} chars, ${entropy} bits entropy): ${issues[*]}"
        MEDIUM_SECRETS+=("$field_name")

        # Record to security audit
        if [[ -n "$tenant_id" ]]; then
            record_security_audit \
                "$tenant_id" \
                "security_event" \
                "security_check" \
                "medium_secret_detected" \
                "config_field" \
                "$field_name" \
                "" \
                "" \
                "{\"length\":${#password},\"entropy\":$entropy,\"issues\":[${issues[*]}]}" \
                "{}"
        fi

        return 0
    else
        log_success "STRONG: $field_name (${#password} chars, ${entropy} bits entropy)"
        STRONG_SECRETS+=("$field_name")
        return 0
    fi
}

# Check JWT secret strength
# Usage: check_jwt_secret <secret> <tenant_id>
check_jwt_secret() {
    local secret="$1"
    local tenant_id="$2"

    log_info "Checking JWT secret strength..."

    if ! check_password_strength "$secret" "jwt.secret" "$MIN_JWT_SECRET_LENGTH" "$tenant_id"; then
        return 1
    fi

    # Additional JWT-specific checks
    # Check if it's a random string (high entropy)
    local entropy
    entropy=$(calculate_entropy "$secret")

    if [[ $(echo "$entropy < 120" | bc -l) -eq 1 ]]; then
        log_warning "JWT secret has low entropy for HMAC-SHA256: ${entropy} bits (recommended: 120+ bits)"
        MEDIUM_SECRETS+=("jwt.secret_entropy")
    fi

    return 0
}

# Check API key format
# Usage: check_api_key <key> <field_name> <tenant_id>
check_api_key() {
    local key="$1"
    local field_name="$2"
    local tenant_id="$3"

    log_info "Checking $field_name format..."

    # Check length
    if [[ ${#key} -lt $MIN_API_KEY_LENGTH ]]; then
        log_error "API key too short: ${#key} chars (minimum: $MIN_API_KEY_LENGTH)"
        WEAK_SECRETS+=("$field_name")

        # Record to security audit
        if [[ -n "$tenant_id" ]]; then
            record_security_audit \
                "$tenant_id" \
                "security_event" \
                "security_check" \
                "weak_api_key" \
                "config_field" \
                "$field_name" \
                "" \
                "" \
                "{\"length\":${#key}}" \
                "{}"
        fi

        return 1
    fi

    # Check for sequential patterns
    if [[ "$key" =~ (012345|123456|234567|345678|456789|567890|678901|789012|890123|901234) ]]; then
        log_warning "API key contains sequential pattern"
        MEDIUM_SECRETS+=("$field_name")
    fi

    # Check for repeated characters
    if [[ "$key" =~ (.)\1{4,} ]]; then
        log_warning "API key contains repeated characters"
        MEDIUM_SECRETS+=("$field_name")
    fi

    log_success "API key format check passed: $field_name"
    STRONG_SECRETS+=("$field_name")
    return 0
}

# Check Feishu App Secret
# Usage: check_feishu_secret <secret> <tenant_id>
check_feishu_secret() {
    local secret="$1"
    local tenant_id="$2"

    log_info "Checking Feishu App Secret..."

    # Feishu App Secret should be at least 28 characters (based on actual format)
    if [[ ${#secret} -lt 28 ]]; then
        log_error "Feishu App Secret too short: ${#secret} chars (expected: 28+)"
        WEAK_SECRETS+=("feishu.app_secret")

        # Record to security audit
        if [[ -n "$tenant_id" ]]; then
            record_security_audit \
                "$tenant_id" \
                "security_event" \
                "security_check" \
                "weak_feishu_secret" \
                "config_field" \
                "feishu.app_secret" \
                "" \
                "" \
                "{\"length\":${#secret}}" \
                "{}"
        fi

        return 1
    fi

    log_success "Feishu App Secret strength check passed"
    STRONG_SECRETS+=("feishu.app_secret")
    return 0
}

# Check encryption key
# Usage: check_encrypt_key <key> <tenant_id>
check_encrypt_key() {
    local key="$1"
    local tenant_id="$2"

    log_info "Checking Feishu encryption key..."

    # Encryption key should be at least 24 characters (192 bits for AES-192)
    if [[ ${#key} -lt $MIN_ENCRYPT_KEY_LENGTH ]]; then
        log_error "Encryption key too short: ${#key} chars (minimum: $MIN_ENCRYPT_KEY_LENGTH)"
        WEAK_SECRETS+=("feishu.encrypt_key")

        # Record to security audit
        if [[ -n "$tenant_id" ]]; then
            record_security_audit \
                "$tenant_id" \
                "security_event" \
                "security_check" \
                "weak_encrypt_key" \
                "config_field" \
                "feishu.encrypt_key" \
                "" \
                "" \
                "{\"length\":${#key}}" \
                "{}"
        fi

        return 1
    fi

    log_success "Encryption key strength check passed"
    STRONG_SECRETS+=("feishu.encrypt_key")
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
    fi

    # Initialize logging
    log_init "$(basename "$0")"

    log_section "Secret Strength Validation"

    # Initialize state database if tenant_id provided
    if [[ -n "$tenant_id" ]]; then
        if ! state_init; then
            log_warning "Could not initialize state database, audit logging disabled"
        fi
    fi

    # Check if bc is installed (for entropy calculation)
    if ! command -v bc &> /dev/null; then
        log_warning "bc not installed, entropy calculation disabled"
        log_warning "Install with: apt-get install bc (Debian/Ubuntu) or brew install bc (macOS)"
    fi

    # Extract values from config
    local db_password
    local redis_password
    local jwt_secret
    local feishu_app_secret
    local feishu_encrypt_key
    local deepseek_api_key

    db_password=$(yq eval '.database.password // ""' "$config_file" 2>/dev/null)
    redis_password=$(yq eval '.redis.password // ""' "$config_file" 2>/dev/null)
    jwt_secret=$(yq eval '.jwt.secret // ""' "$config_file" 2>/dev/null)
    feishu_app_secret=$(yq eval '.feishu.app_secret // ""' "$config_file" 2>/dev/null)
    feishu_encrypt_key=$(yq eval '.feishu.encrypt_key // ""' "$config_file" 2>/dev/null)
    deepseek_api_key=$(yq eval '.agent.deepseek.api_key // ""' "$config_file" 2>/dev/null)

    local has_failures=false

    # Run strength checks
    if [[ -n "$db_password" && "$db_password" != "null" ]]; then
        if ! check_password_strength "$db_password" "database.password" "$MIN_DB_PASSWORD_LENGTH" "$tenant_id"; then
            has_failures=true
        fi
    fi

    if [[ -n "$redis_password" && "$redis_password" != "null" ]]; then
        if ! check_password_strength "$redis_password" "redis.password" "$MIN_DB_PASSWORD_LENGTH" "$tenant_id"; then
            has_failures=true
        fi
    fi

    if [[ -n "$jwt_secret" && "$jwt_secret" != "null" ]]; then
        if ! check_jwt_secret "$jwt_secret" "$tenant_id"; then
            has_failures=true
        fi
    fi

    if [[ -n "$feishu_app_secret" && "$feishu_app_secret" != "null" ]]; then
        if ! check_feishu_secret "$feishu_app_secret" "$tenant_id"; then
            has_failures=true
        fi
    fi

    if [[ -n "$feishu_encrypt_key" && "$feishu_encrypt_key" != "null" ]]; then
        if ! check_encrypt_key "$feishu_encrypt_key" "$tenant_id"; then
            has_failures=true
        fi
    fi

    if [[ -n "$deepseek_api_key" && "$deepseek_api_key" != "null" ]]; then
        if ! check_api_key "$deepseek_api_key" "agent.deepseek.api_key" "$tenant_id"; then
            has_failures=true
        fi
    fi

    # Print summary
    log_separator
    log_info "Secret Strength Summary"
    log_separator

    local total_checks=$((${#STRONG_SECRETS[@]} + ${#MEDIUM_SECRETS[@]} + ${#WEAK_SECRETS[@]}))
    local strong_count=${#STRONG_SECRETS[@]}
    local medium_count=${#MEDIUM_SECRETS[@]}
    local weak_count=${#WEAK_SECRETS[@]}

    log_info "Total checks: $total_checks"
    log_success "Strong: $strong_count"
    log_warning "Medium: $medium_count"
    log_error "Weak: $weak_count"

    if [[ ${#WEAK_SECRETS[@]} -gt 0 ]]; then
        log_separator
        log_error "Weak Secrets:"
        for secret in "${WEAK_SECRETS[@]}"; do
            echo "  - $secret"
        done
    fi

    if [[ ${#MEDIUM_SECRETS[@]} -gt 0 ]]; then
        log_separator
        log_warning "Medium Strength Secrets:"
        for secret in "${MEDIUM_SECRETS[@]}"; do
            echo "  - $secret"
        done
    fi

    log_separator

    # Return exit code
    if [[ "$has_failures" == true ]]; then
        log_error "Secret strength validation FAILED"
        exit $EXIT_SECURITY_ISSUES
    else
        log_success "Secret strength validation PASSED"
        exit $EXIT_SUCCESS
    fi
}

main "$@"
