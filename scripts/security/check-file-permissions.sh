#!/usr/bin/env bash
#==============================================================================
# File Permission Check Script
# (文件权限检查脚本)
#
# Purpose: Verify secure file permissions for configuration and sensitive files
#
# Features:
# - Configuration file permission checks (600)
# - SSH key permission checks (private: 600, public: 644)
# - Script permission checks (755)
# - Log file permission checks (600/640)
# - Directory permission checks
# - Integration with state database for audit logging
#
# Usage:
#   ./check-file-permissions.sh <config_file> [tenant_id]
#
# Exit Codes:
#   0: All checks passed
#   1: Permission issues found
#   2: Configuration errors
#
# Dependencies:
# - scripts/lib/logging.sh
# - scripts/lib/error.sh
# - scripts/lib/config.sh
# - scripts/lib/state.sh
# - yq (YAML processor)
# - stat (file info)
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

# Permission check results
declare -a PERMISSION_ISSUES=()
declare -a PERMISSION_WARNINGS=()
declare -a PERMISSION_PASSED=()

# Exit codes
declare -r EXIT_SUCCESS=0
declare -r EXIT_PERMISSION_ISSUES=1
declare -r EXIT_CONFIG_ERROR=2

#==============================================================================
# Permission Requirements
#==============================================================================

# Required permissions (octal)
declare -r PERM_CONFIG_FILE=600          # rw-------
declare -r PERM_SSH_PRIVATE=600          # rw-------
declare -r PERM_SSH_PUBLIC=644           # rw-r--r--
declare -r PERM_SCRIPT=755               # rwxr-xr-x
declare -r PERM_LOG_FILE=600             # rw-------
declare -r PERM_LOG_FILE_WARN=640        # rw-r-----
declare -r PERM_DIRECTORY=700            # rwx------
declare -r PERM_DIRECTORY_WARN=755       # rwxr-xr-x

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

# Get file permissions in octal format
# Usage: get_file_perms <file_path>
get_file_perms() {
    local file_path="$1"

    if [[ ! -e "$file_path" ]]; then
        echo "9999"  # Invalid permissions
        return 1
    fi

    # Use stat to get permissions
    if stat -c %a "$file_path" &>/dev/null; then
        stat -c %a "$file_path"
    elif stat -f %Lp "$file_path" &>/dev/null; then
        stat -f %Lp "$file_path"
    else
        # Fallback: use ls and parse
        ls -ld "$file_path" | awk '{print $1}' | tr -d '-' | tr 'xrwst' '01231' | cut -c1-3
    fi
}

# Check if permissions match required value
# Usage: check_permissions <file_path> <required_perms> <warn_perms>
check_permissions() {
    local file_path="$1"
    local required_perms="$2"
    local warn_perms="${3:-}"
    local file_type="$4"

    local current_perms
    current_perms=$(get_file_perms "$file_path")

    if [[ "$current_perms" == "9999" ]]; then
        log_warning "File not found: $file_path"
        PERMISSION_WARNINGS+=("not_found:$file_path")
        return 0
    fi

    # Check exact match for required permissions
    if [[ "$current_perms" == "$required_perms" ]]; then
        log_success "Permissions correct: $file_path ($current_perms)"
        PERMISSION_PASSED+=("$file_path")
        return 0
    fi

    # Check warning permissions
    if [[ -n "$warn_perms" && "$current_perms" == "$warn_perms" ]]; then
        log_warning "Weak permissions: $file_path ($current_perms, recommended: $required_perms)"
        PERMISSION_WARNINGS+=("weak_perms:$file_path:$current_perms:$required_perms")
        return 0
    fi

    # Permission issue
    log_error "Insecure permissions: $file_path ($current_perms, required: $required_perms)"
    PERMISSION_ISSUES+=("insecure_perms:$file_path:$current_perms:$required_perms")

    return 1
}

# Fix file permissions
# Usage: fix_permissions <file_path> <required_perms>
fix_permissions() {
    local file_path="$1"
    local required_perms="$2"

    log_info "Fixing permissions: $file_path -> $required_perms"

    if chmod "$required_perms" "$file_path" 2>/dev/null; then
        log_success "Permissions fixed: $file_path"
        return 0
    else
        log_error "Failed to fix permissions: $file_path"
        return 1
    fi
}

#==============================================================================
# Permission Check Functions
#==============================================================================

# Check 1: Configuration file permissions
check_config_file_permissions() {
    local config_file="$1"
    local tenant_id="$2"
    local auto_fix="${3:-false}"

    log_info "Checking configuration file permissions..."

    if [[ ! -f "$config_file" ]]; then
        log_warning "Configuration file not found: $config_file"
        return 0
    fi

    if ! check_permissions "$config_file" "$PERM_CONFIG_FILE" "" "config"; then
        # Record to security audit
        if [[ -n "$tenant_id" ]]; then
            local current_perms
            current_perms=$(get_file_perms "$config_file")
            record_security_audit \
                "$tenant_id" \
                "security_event" \
                "security_check" \
                "insecure_file_permissions" \
                "config_file" \
                "$config_file" \
                "" \
                "" \
                "{\"current_perms\":$current_perms,\"required_perms\":$PERM_CONFIG_FILE}" \
                "{}"
        fi

        # Auto-fix if requested
        if [[ "$auto_fix" == true ]]; then
            fix_permissions "$config_file" "$PERM_CONFIG_FILE"
        fi

        return 1
    fi

    return 0
}

# Check 2: SSH key permissions
check_ssh_key_permissions() {
    local config_file="$1"
    local tenant_id="$2"
    local auto_fix="${3:-false}"

    log_info "Checking SSH key permissions..."

    # Extract SSH key path from config
    local ssh_key_path
    ssh_key_path=$(yq eval '.server.ssh_key_path // ""' "$config_file" 2>/dev/null)

    if [[ -z "$ssh_key_path" || "$ssh_key_path" == "null" ]]; then
        log_debug "No SSH key path specified in config"
        return 0
    fi

    # Expand tilde
    ssh_key_path="${ssh_key_path/#\~/$HOME}"

    # Check private key
    if [[ -f "$ssh_key_path" ]]; then
        if ! check_permissions "$ssh_key_path" "$PERM_SSH_PRIVATE" "" "ssh_private"; then
            # Record to security audit
            if [[ -n "$tenant_id" ]]; then
                local current_perms
                current_perms=$(get_file_perms "$ssh_key_path")
                record_security_audit \
                    "$tenant_id" \
                    "security_event" \
                    "security_check" \
                    "insecure_ssh_key_permissions" \
                    "ssh_key" \
                    "$ssh_key_path" \
                    "" \
                    "" \
                    "{\"current_perms\":$current_perms,\"required_perms\":$PERM_SSH_PRIVATE}" \
                    "{}"
            fi

            # Auto-fix if requested
            if [[ "$auto_fix" == true ]]; then
                fix_permissions "$ssh_key_path" "$PERM_SSH_PRIVATE"
            fi

            return 1
        fi
    else
        log_debug "SSH private key not found: $ssh_key_path"
    fi

    # Check public key (if exists)
    local public_key_path="${ssh_key_path}.pub"
    if [[ -f "$public_key_path" ]]; then
        check_permissions "$public_key_path" "$PERM_SSH_PUBLIC" "" "ssh_public"
        if [[ $? -ne 0 ]]; then
            # Record to security audit
            if [[ -n "$tenant_id" ]]; then
                local current_perms
                current_perms=$(get_file_perms "$public_key_path")
                record_security_audit \
                    "$tenant_id" \
                    "security_event" \
                    "security_check" \
                    "insecure_ssh_public_key_permissions" \
                    "ssh_public_key" \
                    "$public_key_path" \
                    "" \
                    "" \
                    "{\"current_perms\":$current_perms,\"required_perms\":$PERM_SSH_PUBLIC}" \
                    "{}"
            fi

            # Auto-fix if requested
            if [[ "$auto_fix" == true ]]; then
                fix_permissions "$public_key_path" "$PERM_SSH_PUBLIC"
            fi
        fi
    fi

    return 0
}

# Check 3: Script permissions
check_script_permissions() {
    local config_file="$1"
    local tenant_id="$2"

    log_info "Checking script permissions..."

    # Check scripts in the project
    local script_dirs=(
        "${SCRIPT_DIR}"
        "${SCRIPT_DIR}/../deploy"
        "${SCRIPT_DIR}/../ci"
    )

    local has_issues=false

    for script_dir in "${script_dirs[@]}"; do
        if [[ ! -d "$script_dir" ]]; then
            continue
        fi

        while IFS= read -r script_file; do
            if [[ ! -f "$script_file" ]]; then
                continue
            fi

            local current_perms
            current_perms=$(get_file_perms "$script_file")

            # Check if script is executable
            if [[ ! -x "$script_file" ]]; then
                log_debug "Script not executable: $script_file"
                continue
            fi

            # Check permissions (755 is standard for executable scripts)
            if [[ "$current_perms" != "755" && "$current_perms" != "775" ]]; then
                log_warning "Unusual script permissions: $script_file ($current_perms)"
                PERMISSION_WARNINGS+=("script_perms:$script_file:$current_perms")
            fi
        done < <(find "$script_dir" -maxdepth 1 -type f -name "*.sh" 2>/dev/null)
    done

    log_success "Script permission check completed"
    PERMISSION_PASSED+=("scripts")
    return 0
}

# Check 4: Log file permissions
check_log_file_permissions() {
    local config_file="$1"
    local tenant_id="$2"

    log_info "Checking log file permissions..."

    # Common log directories
    local log_dirs=(
        "/var/log"
        "${PROJECT_ROOT}/logs"
        "/var/log/opclaw"
    )

    for log_dir in "${log_dirs[@]}"; do
        if [[ ! -d "$log_dir" ]]; then
            continue
        fi

        while IFS= read -r log_file; do
            if [[ ! -f "$log_file" ]]; then
                continue
            fi

            local current_perms
            current_perms=$(get_file_perms "$log_file")

            # Check if permissions are too open
            if [[ "$current_perms" == "644" || "$current_perms" == "666" ]]; then
                log_warning "Log file too readable: $log_file ($current_perms)"
                PERMISSION_WARNINGS+=("log_perms:$log_file:$current_perms")

                # Record to security audit
                if [[ -n "$tenant_id" ]]; then
                    record_security_audit \
                        "$tenant_id" \
                        "security_event" \
                        "security_check" \
                        "log_file_too_readable" \
                        "log_file" \
                        "$log_file" \
                        "" \
                        "" \
                        "{\"current_perms\":$current_perms,\"recommended_perms\":$PERM_LOG_FILE}" \
                        "{}"
                fi
            elif [[ "$current_perms" == "600" || "$current_perms" == "640" ]]; then
                log_debug "Log file permissions OK: $log_file ($current_perms)"
            fi
        done < <(find "$log_dir" -maxdepth 1 -type f \( -name "*.log" -o -name "*.log.*" \) 2>/dev/null)
    done

    log_success "Log file permission check completed"
    PERMISSION_PASSED+=("logs")
    return 0
}

# Check 5: Directory permissions
check_directory_permissions() {
    local config_file="$1"
    local tenant_id="$2"

    log_info "Checking directory permissions..."

    # Check config directory
    local config_dir
    config_dir=$(dirname "$config_file")

    if [[ -d "$config_dir" ]]; then
        check_permissions "$config_dir" "$PERM_DIRECTORY" "$PERM_DIRECTORY_WARN" "directory"
    fi

    # Check project root directory
    if [[ -d "$PROJECT_ROOT" ]]; then
        local perms
        perms=$(get_file_perms "$PROJECT_ROOT")

        # Project root should not be world-writable
        if [[ "$perms" == *"[789]" ]]; then
            log_warning "Project root is world-writable: $PROJECT_ROOT ($perms)"
            PERMISSION_WARNINGS+=("world_writable:$PROJECT_ROOT:$perms")
        fi
    fi

    log_success "Directory permission check completed"
    PERMISSION_PASSED+=("directories")
    return 0
}

# Check 6: Other sensitive files
check_other_sensitive_files() {
    local config_file="$1"
    local tenant_id="$2"

    log_info "Checking other sensitive file permissions..."

    # Check for .env files
    local env_files=(
        "${PROJECT_ROOT}/.env"
        "${PROJECT_ROOT}/.env.production"
        "${PROJECT_ROOT}/.env.local"
        "${CONFIG_DIR}/.env"
    )

    for env_file in "${env_files[@]}"; do
        if [[ -f "$env_file" ]]; then
            if ! check_permissions "$env_file" "$PERM_CONFIG_FILE" "" "env"; then
                # Record to security audit
                if [[ -n "$tenant_id" ]]; then
                    local current_perms
                    current_perms=$(get_file_perms "$env_file")
                    record_security_audit \
                        "$tenant_id" \
                        "security_event" \
                        "security_check" \
                        "insecure_env_file_permissions" \
                        "env_file" \
                        "$env_file" \
                        "" \
                        "" \
                        "{\"current_perms\":$current_perms,\"required_perms\":$PERM_CONFIG_FILE}" \
                        "{}"
                fi
            fi
        fi
    done

    log_success "Sensitive file check completed"
    PERMISSION_PASSED+=("sensitive_files")
    return 0
}

#==============================================================================
# Main Function
#==============================================================================

main() {
    local config_file="$1"
    local tenant_id="${2:-}"
    local auto_fix="${3:-false}"

    # Validate arguments
    if [[ -z "$config_file" ]]; then
        log_error "Usage: $(basename "$0") <config_file> [tenant_id] [auto_fix]"
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

    log_section "File Permission Check"

    # Initialize state database if tenant_id provided
    if [[ -n "$tenant_id" ]]; then
        if ! state_init; then
            log_warning "Could not initialize state database, audit logging disabled"
        fi
    fi

    # Run all permission checks
    check_config_file_permissions "$config_file" "$tenant_id" "$auto_fix"
    check_ssh_key_permissions "$config_file" "$tenant_id" "$auto_fix"
    check_script_permissions "$config_file" "$tenant_id"
    check_log_file_permissions "$config_file" "$tenant_id"
    check_directory_permissions "$config_file" "$tenant_id"
    check_other_sensitive_files "$config_file" "$tenant_id"

    # Print summary
    log_separator
    log_info "Permission Check Summary"
    log_separator

    local total_checks=$((${#PERMISSION_PASSED[@]} + ${#PERMISSION_ISSUES[@]} + ${#PERMISSION_WARNINGS[@]}))
    local passed_count=${#PERMISSION_PASSED[@]}
    local issue_count=${#PERMISSION_ISSUES[@]}
    local warning_count=${#PERMISSION_WARNINGS[@]}

    log_info "Total checks: $total_checks"
    log_success "Passed: $passed_count"
    log_error "Issues: $issue_count"
    log_warning "Warnings: $warning_count"

    if [[ ${#PERMISSION_ISSUES[@]} -gt 0 ]]; then
        log_separator
        log_error "Permission Issues:"
        for issue in "${PERMISSION_ISSUES[@]}"; do
            IFS=':' read -r type path current required <<< "$issue"
            echo "  - $path: $current (should be $required)"
        done
    fi

    if [[ ${#PERMISSION_WARNINGS[@]} -gt 0 ]]; then
        log_separator
        log_warning "Warnings:"
        for warning in "${PERMISSION_WARNINGS[@]}"; do
            IFS=':' read -r type path current required <<< "$warning"
            if [[ -n "$required" ]]; then
                echo "  - $path: $current (recommended: $required)"
            else
                echo "  - $path: $current"
            fi
        done
    fi

    log_separator

    # Return exit code
    if [[ ${#PERMISSION_ISSUES[@]} -gt 0 ]]; then
        log_error "File permission check FAILED"
        exit $EXIT_PERMISSION_ISSUES
    else
        log_success "File permission check PASSED"
        exit $EXIT_SUCCESS
    fi
}

main "$@"
