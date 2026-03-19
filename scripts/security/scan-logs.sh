#!/usr/bin/env bash
#==============================================================================
# Log Scanning Script for Secrets
# (日志扫描脚本 - 检测密钥泄露)
#
# Purpose: Scan log files for potential secret leaks and sensitive information
#
# Features:
# - Scan logs for passwords, API keys, tokens
# - Detect JWT secrets in logs
# - Detect database connection strings
# - Pattern-based secret detection
# - Report findings with line numbers
# - Integration with state database for audit logging
#
# Usage:
#   ./scan-logs.sh <log_directory|log_file> [tenant_id]
#   ./scan-logs.sh --all [tenant_id]  # Scan all common log locations
#
# Exit Codes:
#   0: No secrets found (or scan completed)
#   1: Secrets detected in logs
#   2: Configuration errors
#
# Dependencies:
# - scripts/lib/logging.sh
# - scripts/lib/error.sh
# - scripts/lib/state.sh
# - grep (pattern matching)
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

# Scan results
declare -a SECRETS_FOUND=()
declare -a WARNINGS_FOUND=()
declare -a FILES_SCANNED=()

# Exit codes
declare -r EXIT_SUCCESS=0
declare -r EXIT_SECRETS_FOUND=1
declare -r EXIT_CONFIG_ERROR=2

#==============================================================================
# Secret Patterns
#==============================================================================

# JWT token pattern
declare -r JWT_PATTERN='eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*'

# API key patterns
declare -a API_KEY_PATTERNS=(
    'sk-[a-zA-Z0-9]{20,}'                    # OpenAI/DeepSeek API keys
    'api[_-]?key["\s=:]+["\']?[a-zA-Z0-9]{20,}' # Generic API key
    'apikey["\s=:]+["\']?[a-zA-Z0-9]{20,}'     # Another variation
    'AIza[A-Za-z0-9_-]{35}'                   # Google API keys
    'AKIA[0-9A-Z]{16}'                        # AWS access keys
    'xox[baprs]-[0-9]{12}-[0-9]{12}-[0-9]{12}-[0-9a-z]{32}' # Slack tokens
)

# Password patterns
declare -a PASSWORD_PATTERNS=(
    'password["\s=:]+["\']?[^\s'"'"'"]{8,}'    # password: "secret"
    'passwd["\s=:]+["\']?[^\s'"'"'"]{8,}'      # passwd: "secret"
    'pwd["\s=:]+["\']?[^\s'"'"'"]{8,}'         # pwd: "secret"
    'db_password["\s=:]+["\']?[^\s'"'"'"]{8,}' # db_password: "secret"
    'redis[_-]?password["\s=:]+["\']?[^\s'"'"'"]{8,}' # Redis password
    'jwt[_-]?secret["\s=:]+["\']?[^\s'"'"'"]{20,}'    # JWT secret
)

# Database connection string patterns
declare -a DB_URL_PATTERNS=(
    'postgresql://[^[:space:]]+:[^[:space:]]+@[^/:]+:[0-9]+/[^[:space:]]+' # PostgreSQL URLs
    'mysql://[^[:space:]]+:[^[:space:]]+@[^/:]+:[0-9]+/[^[:space:]]+'      # MySQL URLs
    'mongodb://[^[:space:]]+:[^[:space:]]+@[^/:]+:[0-9]+/[^[:space:]]+'    # MongoDB URLs
    'redis://[:@]*:[^[:space:]]+@[^/:]+:[0-9]+'                            # Redis URLs
)

# Token patterns
declare -a TOKEN_PATTERNS=(
    'token["\s=:]+["\']?[a-zA-Z0-9]{20,}'        # Generic token
    'access[_-]?token["\s=:]+["\']?[a-zA-Z0-9]{20,}' # Access token
    'refresh[_-]?token["\s=:]+["\']?[a-zA-Z0-9]{20,}' # Refresh token
    'bearer["\s\:]+[a-zA-Z0-9_-]{20,}'           # Bearer tokens
    'session["\s=:]+["\']?[a-zA-Z0-9]{20,}'      # Session tokens
)

# Feishu-specific patterns
declare -a FEISHU_PATTERNS=(
    'cli_a[a-zA-Z0-9]{14,}'                     # Feishu App IDs
    'feishu[_-]?app[_-]?secret["\s=:]+["\']?[a-zA-Z0-9]{20,}' # Feishu secrets
)

#==============================================================================
# Source Libraries
#==============================================================================

for lib in logging.sh error.sh state.sh; do
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

# Scan a file for a pattern
# Usage: scan_file_pattern <file_path> <pattern> <pattern_name>
scan_file_pattern() {
    local file_path="$1"
    local pattern="$2"
    local pattern_name="$3"

    if [[ ! -f "$file_path" ]]; then
        return 0
    fi

    # Use grep to find matches with line numbers
    local matches
    matches=$(grep -nE "$pattern" "$file_path" 2>/dev/null || true)

    if [[ -z "$matches" ]]; then
        return 0
    fi

    # Process matches
    while IFS= read -r match; do
        local line_number
        local line_content

        line_number=$(echo "$match" | cut -d':' -f1)
        line_content=$(echo "$match" | cut -d':' -f2-)

        # Mask sensitive values in output
        local masked_content
        masked_content=$(mask_secret_value "$line_content")

        log_warning "Secret found: $file_path:$line_number [$pattern_name]"
        echo "    $masked_content"

        SECRETS_FOUND+=("$file_path:$line_number:$pattern_name")
    done <<< "$matches"
}

# Mask secret value for display
# Usage: mask_secret_value <string>
mask_secret_value() {
    local string="$1"

    # Mask common patterns
    # Keep first 4 and last 4 characters, mask middle
    echo "$string" | sed -E 's/([a-zA-Z0-9]{4})[a-zA-Z0-9]{8,}([a-zA-Z0-9]{4})/\1********\2/g'
}

# Scan a single log file
# Usage: scan_log_file <file_path> [tenant_id]
scan_log_file() {
    local file_path="$1"
    local tenant_id="${2:-}"

    log_debug "Scanning: $file_path"

    if [[ ! -f "$file_path" ]]; then
        log_debug "File not found: $file_path"
        return 0
    fi

    FILES_SCANNED+=("$file_path")

    # Scan for JWT tokens
    scan_file_pattern "$file_path" "$JWT_PATTERN" "jwt_token"

    # Scan for API keys
    for pattern in "${API_KEY_PATTERNS[@]}"; do
        scan_file_pattern "$file_path" "$pattern" "api_key"
    done

    # Scan for passwords
    for pattern in "${PASSWORD_PATTERNS[@]}"; do
        scan_file_pattern "$file_path" "$pattern" "password"
    done

    # Scan for database URLs
    for pattern in "${DB_URL_PATTERNS[@]}"; do
        scan_file_pattern "$file_path" "$pattern" "database_url"
    done

    # Scan for tokens
    for pattern in "${TOKEN_PATTERNS[@]}"; do
        scan_file_pattern "$file_path" "$pattern" "token"
    done

    # Scan for Feishu patterns
    for pattern in "${FEISHU_PATTERNS[@]}"; do
        scan_file_pattern "$file_path" "$pattern" "feishu"
    done
}

# Scan all log files in a directory
# Usage: scan_log_directory <directory_path> [tenant_id]
scan_log_directory() {
    local directory_path="$1"
    local tenant_id="${2:-}"

    if [[ ! -d "$directory_path" ]]; then
        log_warning "Directory not found: $directory_path"
        return 0
    fi

    log_info "Scanning directory: $directory_path"

    # Find all log files
    while IFS= read -r log_file; do
        scan_log_file "$log_file" "$tenant_id"
    done < <(find "$directory_path" -type f \( -name "*.log" -o -name "*.log.*" \) 2>/dev/null)
}

# Scan common log locations
# Usage: scan_common_logs [tenant_id]
scan_common_logs() {
    local tenant_id="${1:-}"

    log_info "Scanning common log locations..."

    local log_locations=(
        "/var/log/opclaw"
        "${PROJECT_ROOT}/logs"
        "/var/log"
        "/tmp"
        "${PROJECT_ROOT}/.pm2/logs"
        "${HOME}/.pm2/logs"
    )

    for location in "${log_locations[@]}"; do
        if [[ -d "$location" ]]; then
            scan_log_directory "$location" "$tenant_id"
        fi
    done
}

# Check for log files with excessive permissions
# Usage: check_log_permissions
check_log_permissions() {
    log_info "Checking log file permissions..."

    local log_locations=(
        "/var/log/opclaw"
        "${PROJECT_ROOT}/logs"
    )

    for location in "${log_locations[@]}"; do
        if [[ ! -d "$location" ]]; then
            continue
        fi

        while IFS= read -r log_file; do
            if [[ ! -f "$log_file" ]]; then
                continue
            fi

            local perms
            perms=$(stat -c %a "$log_file" 2>/dev/null || stat -f %Lp "$log_file" 2>/dev/null)

            # Check if log file is world-readable
            if [[ "$perms" == *"4" ]]; then
                log_warning "Log file is world-readable: $log_file ($perms)"
                WARNINGS_FOUND+=("world_readable:$log_file:$perms")
            fi
        done < <(find "$location" -type f \( -name "*.log" -o -name "*.log.*" \) 2>/dev/null)
    done
}

#==============================================================================
# Main Function
#==============================================================================

main() {
    local target="$1"
    local tenant_id="${2:-}"
    local scan_all=false

    # Check for --all flag
    if [[ "$target" == "--all" ]]; then
        scan_all=true
    fi

    # Initialize logging
    log_init "$(basename "$0")"

    log_section "Log Scanning for Secrets"

    # Initialize state database if tenant_id provided
    if [[ -n "$tenant_id" ]]; then
        if ! state_init; then
            log_warning "Could not initialize state database, audit logging disabled"
        fi
    fi

    # Scan based on target
    if [[ "$scan_all" == true ]]; then
        scan_common_logs "$tenant_id"
        check_log_permissions
    elif [[ -f "$target" ]]; then
        log_info "Scanning file: $target"
        scan_log_file "$target" "$tenant_id"
        check_log_permissions
    elif [[ -d "$target" ]]; then
        log_info "Scanning directory: $target"
        scan_log_directory "$target" "$tenant_id"
        check_log_permissions
    else
        log_error "Target not found: $target"
        log_info "Usage: $(basename "$0") <log_file|log_directory|--all> [tenant_id]"
        exit $EXIT_CONFIG_ERROR
    fi

    # Print summary
    log_separator
    log_info "Scan Summary"
    log_separator

    local files_scanned=${#FILES_SCANNED[@]}
    local secrets_found=${#SECRETS_FOUND[@]}
    local warnings_found=${#WARNINGS_FOUND[@]}

    log_info "Files scanned: $files_scanned"
    log_error "Secrets found: $secrets_found"
    log_warning "Warnings: $warnings_found"

    if [[ ${#SECRETS_FOUND[@]} -gt 0 ]]; then
        log_separator
        log_error "Secrets Detected:"
        for secret in "${SECRETS_FOUND[@]}"; do
            IFS=':' read -r file line type <<< "$secret"
            echo "  - $file:$line ($type)"
        done

        log_separator
        log_error "ACTION REQUIRED: Secrets found in log files!"
        log_error "1. Remove secrets from log files"
        log_error "2. Fix logging code to not output secrets"
        log_error "3. Rotate exposed secrets immediately"

        # Record to security audit
        if [[ -n "$tenant_id" ]]; then
            record_security_audit \
                "$tenant_id" \
                "security_event" \
                "security_check" \
                "secrets_found_in_logs" \
                "log_scan" \
                "" \
                "" \
                "" \
                "{\"secrets_count\":$secrets_found,\"files_scanned\":$files_scanned}" \
                "{}"
        fi
    fi

    if [[ ${#WARNINGS_FOUND[@]} -gt 0 ]]; then
        log_separator
        log_warning "Warnings:"
        for warning in "${WARNINGS_FOUND[@]}"; do
            IFS=':' read -r type file perms <<< "$warning"
            echo "  - $file: $perms"
        done
    fi

    log_separator

    # Return exit code
    if [[ ${#SECRETS_FOUND[@]} -gt 0 ]]; then
        log_error "Log scan FAILED - Secrets detected"
        exit $EXIT_SECRETS_FOUND
    else
        log_success "Log scan PASSED - No secrets detected"
        exit $EXIT_SUCCESS
    fi
}

main "$@"
