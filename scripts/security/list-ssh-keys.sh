#!/opt/homebrew/bin/bash
#==============================================================================
# SSH Key Listing Script
# (SSH密钥列表脚本)
#
# Purpose: List SSH keys for tenants with detailed information including
#          fingerprints, age, and expiration status
#
# Usage:
#   scripts/security/list-ssh-keys.sh [options]
#   --tenant TID      Show keys for specific tenant
#   --all             Show all keys
#   --include-expired Include expired keys
#   --format FORMAT   Output format (table|json|csv)
#   --verbose         Show detailed information
#
# Examples:
#   scripts/security/list-ssh-keys.sh --all
#   scripts/security/list-ssh-keys.sh --tenant tenant_001
#   scripts/security/list-ssh-keys.sh --all --format json
#
# Version: 1.0
# Last Updated: 2026-03-19
#==============================================================================

set -euo pipefail

#==============================================================================
# Configuration and Initialization
#==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
LIB_DIR="${PROJECT_ROOT}/scripts/lib"
CONFIG_DIR="${PROJECT_ROOT}/config/tenants"
SSH_DIR="${HOME}/.ssh"

# Source required libraries
source "${LIB_DIR}/logging.sh" 2>/dev/null || { echo "ERROR: logging.sh not found"; exit 1; }
source "${LIB_DIR}/config.sh" 2>/dev/null || { echo "ERROR: config.sh not found"; exit 1; }
source "${LIB_DIR}/state.sh" 2>/dev/null || { echo "ERROR: state.sh not found"; exit 1; }

# Default values
TENANT_ID=""
LIST_ALL=false
INCLUDE_EXPIRED=false
OUTPUT_FORMAT="table"
VERBOSE=false

# Key information storage
declare -a KEY_INFO=()

# Colors for output
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    CYAN='\033[0;36m'
    BOLD='\033[1m'
    NC='\033[0m'
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    CYAN=''
    BOLD=''
    NC=''
fi

#==============================================================================
# Helper Functions
#==============================================================================

print_usage() {
    cat << EOF
Usage: ${0##*/} [options]

List SSH keys for tenants with detailed information.

Arguments:
  --tenant TID           Show keys for specific tenant
  --all                  Show all tenant keys

Options:
  --include-expired      Include expired keys
  --format FORMAT        Output format (table|json|csv) [default: table]
  -v, --verbose          Show detailed information
  -h, --help             Show this help message

Examples:
  ${0##*/} --all
  ${0##*/} --tenant tenant_001
  ${0##*/} --all --format json
  ${0##*/} --all --include-expired --verbose

EOF
}

# Get SSH key fingerprint
# Usage: get_ssh_key_fingerprint <public_key_file>
# Returns: Fingerprint string
get_ssh_key_fingerprint() {
    local pub_key="$1"

    if [ ! -f "$pub_key" ]; then
        echo "N/A"
        return
    fi

    ssh-keygen -lf "$pub_key" 2>/dev/null | awk '{print $2}' || echo "N/A"
}

# Get SSH key type
# Usage: get_ssh_key_type <public_key_file>
# Returns: Key type string
get_ssh_key_type() {
    local pub_key="$1"

    if [ ! -f "$pub_key" ]; then
        echo "N/A"
        return
    fi

    local key_info
    key_info=$(ssh-keygen -lf "$pub_key" 2>/dev/null)

    if [[ "$key_info" =~ "(RSA)" ]]; then
        echo "RSA"
    elif [[ "$key_info" =~ "(ED25519)" ]]; then
        echo "ED25519"
    elif [[ "$key_info" =~ "(ECDSA)" ]]; then
        echo "ECDSA"
    elif [[ "$key_info" =~ "(DSA)" ]]; then
        echo "DSA"
    else
        echo "UNKNOWN"
    fi
}

# Get SSH key age in days
# Usage: get_key_age_days <key_file>
# Returns: Age in days
get_key_age_days() {
    local key_file="$1"

    if [ ! -f "$key_file" ]; then
        echo "N/A"
        return
    fi

    local key_mtime
    local current_time
    local age_seconds
    local age_days

    # Try macOS stat first, then Linux stat
    key_mtime=$(stat -f "%m" "$key_file" 2>/dev/null || stat -c "%Y" "$key_file" 2>/dev/null)

    if [ -z "$key_mtime" ]; then
        echo "N/A"
        return
    fi

    current_time=$(date +%s)
    age_seconds=$((current_time - key_mtime))
    age_days=$((age_seconds / 86400))

    echo "$age_days"
}

# Get key expiration status
# Usage: get_expiration_status <age_days>
# Returns: Status (expiring|expired|active)
get_expiration_status() {
    local age="$1"

    if [ "$age" = "N/A" ]; then
        echo "unknown"
        return
    fi

    if [ "$age" -ge 90 ]; then
        echo "expired"
    elif [ "$age" -ge 83 ]; then
        echo "expiring"
    else
        echo "active"
    fi
}

# Get key file path for tenant
# Usage: get_tenant_key_path <tenant_id>
# Returns: Key file path or empty string
get_tenant_key_path() {
    local tenant_id="$1"

    # Check common key file locations
    local possible_paths=(
        "${SSH_DIR}/${tenant_id}_key"
        "${SSH_DIR}/id_${tenant_id}"
        "${SSH_DIR}/${tenant_id}"
    )

    for path in "${possible_paths[@]}"; do
        if [ -f "$path" ]; then
            echo "$path"
            return 0
        fi
    done

    # Check tenant config
    local config_file="${CONFIG_DIR}/${tenant_id}.yml"
    if [ -f "$config_file" ]; then
        local config_key_path
        config_key_path=$(get_config_value "$config_file" "server.ssh_key_path" 2>/dev/null)

        if [ -n "$config_key_path" ] && [ -f "$config_key_path" ]; then
            echo "$config_key_path"
            return 0
        fi
    fi

    echo ""
}

# Get last key usage from audit log
# Usage: get_last_key_usage <tenant_id> <fingerprint>
# Returns: Last usage timestamp or "Never"
get_last_key_usage() {
    local tenant_id="$1"
    local fingerprint="$2"

    # Initialize state database
    if ! state_init 2>/dev/null; then
        echo "N/A"
        return
    fi

    # Query audit log for last usage
    local sql_query
    sql_query="SELECT MAX(last_used_at)
    FROM ssh_key_audit
    WHERE tenant_id = '$tenant_id'
    AND ssh_key_fingerprint = '$fingerprint'
    AND action = 'accessed';"

    local result
    if state_exec_sql "$sql_query" result 2>/dev/null; then
        if [ -n "$result" ] && [ "$result" != "" ]; then
            echo "$result"
        else
            echo "Never"
        fi
    else
        echo "N/A"
    fi
}

# Collect SSH key information for a tenant
# Usage: collect_tenant_key_info <tenant_id>
# Returns: 0 on success, 1 on failure
collect_tenant_key_info() {
    local tenant_id="$1"

    # Get key file path
    local key_path
    key_path=$(get_tenant_key_path "$tenant_id")

    if [ -z "$key_path" ]; then
        log_verbose "No SSH key found for tenant: $tenant_id"
        return 1
    fi

    local pub_key="${key_path}.pub"

    if [ ! -f "$pub_key" ]; then
        log_verbose "No public key found for tenant: $tenant_id"
        return 1
    fi

    # Get key information
    local fingerprint
    local key_type
    local age_days
    local expiration_status
    local last_used

    fingerprint=$(get_ssh_key_fingerprint "$pub_key")
    key_type=$(get_ssh_key_type "$pub_key")
    age_days=$(get_key_age_days "$key_path")
    expiration_status=$(get_expiration_status "$age_days")
    last_used=$(get_last_key_usage "$tenant_id" "$fingerprint")

    # Filter expired keys if requested
    if [ "$INCLUDE_EXPIRED" = "false" ] && [ "$expiration_status" = "expired" ]; then
        return 0
    fi

    # Store key information
    KEY_INFO+=("${tenant_id}|${key_type}|${fingerprint}|${age_days}|${expiration_status}|${last_used}|${key_path}")

    return 0
}

# Output in table format
# Usage: output_table
output_table() {
    if [ ${#KEY_INFO[@]} -eq 0 ]; then
        echo "No SSH keys found"
        return
    fi

    # Print header
    printf "${BOLD}%-15s | %-10s | %-20s | %-10s | %-10s | %-15s${NC}\n" \
        "TENANT_ID" "KEY_TYPE" "FINGERPRINT" "AGE" "STATUS" "LAST_USED"
    printf "%s\n" "---------------------------------------------------------------------------------------------------"

    # Print rows
    for key_info in "${KEY_INFO[@]}"; do
        IFS='|' read -r tenant_id key_type fingerprint age status last_used path <<< "$key_info"

        # Color code status
        local status_color=""
        case "$status" in
            active)
                status_color="${GREEN}"
                ;;
            expiring)
                status_color="${YELLOW}"
                ;;
            expired)
                status_color="${RED}"
                ;;
            *)
                status_color=""
                ;;
        esac

        # Truncate fingerprint for display
        local short_fingerprint="${fingerprint:0:20}..."

        printf "%-15s | %-10s | %-20s | %-10s | ${status_color}%-10s${NC} | %-15s\n" \
            "$tenant_id" \
            "$key_type" \
            "$short_fingerprint" \
            "${age_days} days" \
            "$status" \
            "$last_used"
    done
}

# Output in JSON format
# Usage: output_json
output_json() {
    echo "{"
    echo "  \"keys\": ["

    local first=true
    for key_info in "${KEY_INFO[@]}"; do
        IFS='|' read -r tenant_id key_type fingerprint age status last_used path <<< "$key_info"

        if [ "$first" = "true" ]; then
            first=false
        else
            echo ","
        fi

        cat <<EOF
    {
      "tenant_id": "$tenant_id",
      "key_type": "$key_type",
      "fingerprint": "$fingerprint",
      "age_days": $age,
      "status": "$status",
      "last_used": "$last_used",
      "key_path": "$path"
    }
EOF
    done

    echo ""
    echo "  ]"
    echo "}"
}

# Output in CSV format
# Usage: output_csv
output_csv() {
    # Print header
    echo "tenant_id,key_type,fingerprint,age_days,status,last_used,key_path"

    # Print rows
    for key_info in "${KEY_INFO[@]}"; do
        IFS='|' read -r tenant_id key_type fingerprint age status last_used path <<< "$key_info"
        echo "$tenant_id,$key_type,$fingerprint,$age,$status,$last_used,$path"
    done
}

# Output detailed information
# Usage: output_detailed
output_detailed() {
    if [ ${#KEY_INFO[@]} -eq 0 ]; then
        echo "No SSH keys found"
        return
    fi

    for key_info in "${KEY_INFO[@]}"; do
        IFS='|' read -r tenant_id key_type fingerprint age status last_used path <<< "$key_info"

        echo "=========================================="
        echo "Tenant: $tenant_id"
        echo "=========================================="
        echo "Key Type: $key_type"
        echo "Fingerprint: $fingerprint"
        echo "Age: $age days"
        echo "Status: $status"
        echo "Last Used: $last_used"
        echo "Key Path: $path"

        # Show public key content
        local pub_key="${path}.pub"
        if [ -f "$pub_key" ]; then
            echo "Public Key:"
            cat "$pub_key"
        fi

        echo
    done
}

#==============================================================================
# Main Execution
#==============================================================================

main() {
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --tenant)
                TENANT_ID="$2"
                shift 2
                ;;
            --all)
                LIST_ALL=true
                shift
                ;;
            --include-expired)
                INCLUDE_EXPIRED=true
                shift
                ;;
            --format)
                OUTPUT_FORMAT="$2"
                if [[ ! "$OUTPUT_FORMAT" =~ ^(table|json|csv|detailed)$ ]]; then
                    log_error "Invalid output format: $OUTPUT_FORMAT (must be table, json, csv, or detailed)"
                    exit 1
                fi
                shift 2
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -h|--help)
                print_usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                print_usage
                exit 1
                ;;
        esac
    done

    # Validate arguments
    if [ -z "$TENANT_ID" ] && [ "$LIST_ALL" = "false" ]; then
        log_error "Either --tenant or --all must be specified"
        print_usage
        exit 1
    fi

    if [ -n "$TENANT_ID" ] && [ "$LIST_ALL" = "true" ]; then
        log_error "Cannot specify both --tenant and --all"
        exit 1
    fi

    # Get list of tenants to process
    local tenants_to_process=()

    if [ "$LIST_ALL" = "true" ]; then
        # Get all tenant config files
        for config_file in "${CONFIG_DIR}"/*.yml; do
            if [ -f "$config_file" ]; then
                local tenant_name
                tenant_name=$(basename "$config_file" .yml)
                tenants_to_process+=("$tenant_name")
            fi
        done
    else
        tenants_to_process=("$TENANT_ID")
    fi

    # Collect key information for each tenant
    for tenant in "${tenants_to_process[@]}"; do
        collect_tenant_key_info "$tenant" || true
    done

    # Sort key info by tenant ID
    IFS=$'\n' KEY_INFO=($(sort <<<"${KEY_INFO[*]}"))
    unset IFS

    # Output results
    case "$OUTPUT_FORMAT" in
        table)
            output_table
            ;;
        json)
            output_json
            ;;
        csv)
            output_csv
            ;;
        detailed)
            output_detailed
            ;;
    esac
}

# Run main function
main "$@"
