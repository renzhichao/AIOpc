#!/opt/homebrew/bin/bash
#==============================================================================
# Tenant Listing Script
# (租户列表脚本)
#
# Purpose: List all tenant configurations with filtering and sorting
#
# Usage:
#   scripts/tenant/list.sh [options]
#   --environment ENV  Filter by environment
#   --status STATUS    Filter by status
#   --tier TIER        Filter by tier
#   --sort FIELD       Sort by field (id|name|created|status|environment)
#   --format FORMAT    Output format (table|json|yaml)
#   --show-deleted     Include deleted tenants
#
# Example:
#   scripts/tenant/list.sh --environment production --sort name
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

# Source required libraries
source "${LIB_DIR}/logging.sh" 2>/dev/null || { echo "ERROR: logging.sh not found"; exit 1; }
source "${LIB_DIR}/config.sh" 2>/dev/null || { echo "ERROR: config.sh not found"; exit 1; }
source "${LIB_DIR}/state.sh" 2>/dev/null || { echo "ERROR: state.sh not found"; exit 1; }

# Default values
FILTER_ENVIRONMENT=""
FILTER_STATUS=""
FILTER_TIER=""
SORT_FIELD="id"
OUTPUT_FORMAT="table"
SHOW_DELETED=false

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

List all tenant configurations with filtering and sorting.

Options:
  --environment ENV   Filter by environment (production|staging|development)
  --status STATUS     Filter by status (provisioning|active|suspended|deleted)
  --tier TIER         Filter by tier (trial|basic|standard|premium|enterprise)
  --sort FIELD        Sort by field (id|name|created|status|environment|tier) [default: id]
  --format FORMAT     Output format (table|json|yaml) [default: table]
  --show-deleted      Include deleted tenants
  -h, --help          Show this help message

Examples:
  ${0##*/} --environment production
  ${0##*/} --status active --sort name
  ${0##*/} --format json
  ${0##*/} --tier premium --environment production

EOF
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*" >&2
}

log_debug() {
    if [[ "${DEBUG:-false}" == "true" ]]; then
        echo -e "${CYAN}[DEBUG]${NC} $*" >&2
    fi
}

#==============================================================================
# Data Collection Functions
#==============================================================================

get_tenant_from_config() {
    local config_file=$1

    if [ ! -f "$config_file" ]; then
        return 1
    fi

    local tenant_id
    local tenant_name
    local environment
    local tier

    tenant_id=$(get_config_value "$config_file" "tenant.id" 2>/dev/null || echo "unknown")
    tenant_name=$(get_config_value "$config_file" "tenant.name" 2>/dev/null || echo "unknown")
    environment=$(get_config_value "$config_file" "tenant.environment" 2>/dev/null || echo "unknown")
    tier=$(get_config_value "$config_file" "tenant.tier" 2>/dev/null || echo "trial")

    echo "$tenant_id|$tenant_name|$environment|$tier"
    return 0
}

get_tenant_from_database() {
    local tenant_id=$1

    # Initialize state database
    if ! state_init 2>/dev/null; then
        return 1
    fi

    local sql_query
    sql_query="SELECT tenant_id, name, environment, tier, status, created_at, updated_at
    FROM tenants
    WHERE tenant_id = '$tenant_id';"

    local result
    if state_exec_sql "$sql_query" result 2>/dev/null; then
        echo "$result"
        return 0
    fi

    return 1
}

get_all_tenants_from_database() {
    local filter_env=$1
    local filter_status=$2
    local filter_tier=$3
    local show_deleted=$4

    # Initialize state database
    if ! state_init 2>/dev/null; then
        return 1
    fi

    local sql_query
    sql_query="SELECT tenant_id, name, environment, tier, status, created_at, updated_at
    FROM tenants
    WHERE 1=1"

    if [ -n "$filter_env" ]; then
        sql_query="$sql_query AND environment = '$filter_env'"
    fi

    if [ -n "$filter_status" ]; then
        sql_query="$sql_query AND status = '$filter_status'"
    fi

    if [ -n "$filter_tier" ]; then
        sql_query="$sql_query AND tier = '$filter_tier'"
    fi

    if [ "$show_deleted" != "true" ]; then
        sql_query="$sql_query AND status != 'deleted'"
    fi

    sql_query="$sql_query ORDER BY tenant_id;"

    local result
    if state_exec_sql "$sql_query" result 2>/dev/null; then
        echo "$result"
        return 0
    fi

    return 1
}

get_all_tenants_from_configs() {
    local filter_env=$1

    local tenants=()

    # Find all config files (excluding template and test files)
    for config_file in "$CONFIG_DIR"/*.yml; do
        if [ ! -f "$config_file" ]; then
            continue
        fi

        local basename
        basename=$(basename "$config_file" .yml)

        # Skip template and test files
        if [[ "$basename" =~ (template|test_) ]]; then
            continue
        fi

        local tenant_data
        tenant_data=$(get_tenant_from_config "$config_file" 2>/dev/null) || continue

        local tenant_id
        tenant_id=$(echo "$tenant_data" | cut -d'|' -f1)

        local environment
        environment=$(echo "$tenant_data" | cut -d'|' -f3)

        # Apply environment filter
        if [ -n "$filter_env" ] && [ "$environment" != "$filter_env" ]; then
            continue
        fi

        tenants+=("$tenant_data")
    done

    # Sort and output
    IFS=$'\n' sort <<<"${tenants[*]}"
}

#==============================================================================
# Output Formatting Functions
#==============================================================================

format_status_color() {
    local status=$1

    case $status in
        active)
            echo -e "${GREEN}${status}${NC}"
            ;;
        provisioning|pending)
            echo -e "${YELLOW}${status}${NC}"
            ;;
        suspended|error|failed)
            echo -e "${RED}${status}${NC}"
            ;;
        deleted)
            echo -e "\x1B[2m${status}\x1B[0m"
            ;;
        *)
            echo "$status"
            ;;
    esac
}

format_environment_color() {
    local environment=$1

    case $environment in
        production)
            echo -e "${RED}${environment}${NC}"
            ;;
        staging)
            echo -e "${YELLOW}${environment}${NC}"
            ;;
        development)
            echo -e "${GREEN}${environment}${NC}"
            ;;
        *)
            echo "$environment"
            ;;
    esac
}

output_table() {
    local tenants=$1

    # Parse tenant data
    local tenant_ids=()
    local tenant_names=()
    local environments=()
    local tiers=()
    local statuses=()
    local created_dates=()

    while IFS= read -r line; do
        if [ -z "$line" ]; then
            continue
        fi

        tenant_ids+=("$(echo "$line" | cut -d'|' -f1)")
        tenant_names+=("$(echo "$line" | cut -d'|' -f2)")
        environments+=("$(echo "$line" | cut -d'|' -f3)")
        tiers+=("$(echo "$line" | cut -d'|' -f4)")
        statuses+=("$(echo "$line" | cut -d'|' -f5)")
        created_dates+=("$(echo "$line" | cut -d'|' -f6)")
    done <<<"$tenants"

    # Calculate column widths
    local max_id_len=10
    local max_name_len=10
    local max_env_len=11
    local max_tier_len=4
    local max_status_len=6
    local max_created_len=10

    for i in "${!tenant_ids[@]}"; do
        [ ${#tenant_ids[$i]} -gt $max_id_len ] && max_id_len=${#tenant_ids[$i]}
        [ ${#tenant_names[$i]} -gt $max_name_len ] && max_name_len=${#tenant_names[$i]}
        [ ${#environments[$i]} -gt $max_env_len ] && max_env_len=${#environments[$i]}
        [ ${#tiers[$i]} -gt $max_tier_len ] && max_tier_len=${#tiers[$i]}
        [ ${#statuses[$i]} -gt $max_status_len ] && max_status_len=${#statuses[$i]}
        [ ${#created_dates[$i]} -gt $max_created_len ] && max_created_len=${#created_dates[$i]}
    done

    # Print header
    local header_format="${BOLD}%-${max_id_len}s  %-${max_name_len}s  %-${max_env_len}s  %-${max_tier_len}s  %-${max_status_len}s  %-${max_created_len}s${NC}"
    printf "$header_format\n" "Tenant ID" "Name" "Environment" "Tier" "Status" "Created"

    # Print separator
    local separator_format="%-${max_id_len}s  %-${max_name_len}s  %-${max_env_len}s  %-${max_tier_len}s  %-${max_status_len}s  %-${max_created_len}s"
    printf "$separator_format\n" "----------" "----" "-----------" "----" "------" "----------"

    # Print rows
    for i in "${!tenant_ids[@]}"; do
        local status_colored
        status_colored=$(format_status_color "${statuses[$i]}")

        local env_colored
        env_colored=$(format_environment_color "${environments[$i]}")

        printf "%-${max_id_len}s  %-${max_name_len}s  " "${tenant_ids[$i]}" "${tenant_names[$i]}"
        printf -v env_str "%s" "$env_colored"
        printf "%-${max_env_len}s  " "$env_str"
        printf "%-${max_tier_len}s  " "${tiers[$i]}"
        printf -v status_str "%s" "$status_colored"
        printf "%-${max_status_len}s  " "$status_str"
        printf "%-${max_created_len}s\n" "${created_dates[$i]}"
    done

    # Print summary
    echo
    echo "Total tenants: ${#tenant_ids[@]}"
}

output_json() {
    local tenants=$1

    echo "["

    local first=true
    while IFS= read -r line; do
        if [ -z "$line" ]; then
            continue
        fi

        if [ "$first" = "true" ]; then
            first=false
        else
            echo ","
        fi

        local tenant_id=$(echo "$line" | cut -d'|' -f1)
        local tenant_name=$(echo "$line" | cut -d'|' -f2)
        local environment=$(echo "$line" | cut -d'|' -f3)
        local tier=$(echo "$line" | cut -d'|' -f4)
        local status=$(echo "$line" | cut -d'|' -f5)
        local created_at=$(echo "$line" | cut -d'|' -f6)
        local updated_at=$(echo "$line" | cut -d'|' -f7)

        echo "  {"
        echo "    \"tenant_id\": \"$tenant_id\","
        echo "    \"name\": \"$tenant_name\","
        echo "    \"environment\": \"$environment\","
        echo "    \"tier\": \"$tier\","
        echo "    \"status\": \"$status\","
        echo "    \"created_at\": \"$created_at\","
        echo "    \"updated_at\": \"$updated_at\""
        echo -n "  }"
    done <<<"$tenants"

    echo
    echo "]"
}

output_yaml() {
    local tenants=$1

    while IFS= read -r line; do
        if [ -z "$line" ]; then
            continue
        fi

        local tenant_id=$(echo "$line" | cut -d'|' -f1)
        local tenant_name=$(echo "$line" | cut -d'|' -f2)
        local environment=$(echo "$line" | cut -d'|' -f3)
        local tier=$(echo "$line" | cut -d'|' -f4)
        local status=$(echo "$line" | cut -d'|' -f5)
        local created_at=$(echo "$line" | cut -d'|' -f6)
        local updated_at=$(echo "$line" | cut -d'|' -f7)

        echo "- tenant_id: $tenant_id"
        echo "  name: $tenant_name"
        echo "  environment: $environment"
        echo "  tier: $tier"
        echo "  status: $status"
        echo "  created_at: $created_at"
        echo "  updated_at: $updated_at"
        echo
    done <<<"$tenants"
}

sort_tenants() {
    local tenants=$1
    local sort_field=$2

    local field_index=1
    case $sort_field in
        id) field_index=1 ;;
        name) field_index=2 ;;
        environment) field_index=3 ;;
        tier) field_index=4 ;;
        status) field_index=5 ;;
        created) field_index=6 ;;
        *)
            log_info "Unknown sort field: $sort_field, using 'id'"
            field_index=1
            ;;
    esac

    sort -t'|' -k${field_index} <<<"$tenants"
}

#==============================================================================
# Main Execution
#==============================================================================

main() {
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --environment)
                FILTER_ENVIRONMENT="$2"
                shift 2
                ;;
            --status)
                FILTER_STATUS="$2"
                shift 2
                ;;
            --tier)
                FILTER_TIER="$2"
                shift 2
                ;;
            --sort)
                SORT_FIELD="$2"
                shift 2
                ;;
            --format)
                OUTPUT_FORMAT="$2"
                shift 2
                ;;
            --show-deleted)
                SHOW_DELETED=true
                shift
                ;;
            -h|--help)
                print_usage
                exit 0
                ;;
            *)
                echo "Unknown option: $1" >&2
                print_usage
                exit 1
                ;;
        esac
    done

    log_debug "Fetching tenant list"

    # Get tenants from database (primary source)
    local tenants
    tenants=$(get_all_tenants_from_database "$FILTER_ENVIRONMENT" "$FILTER_STATUS" "$FILTER_TIER" "$SHOW_DELETED")

    # If database query failed, fall back to config files
    if [ -z "$tenants" ]; then
        log_debug "Database query failed, falling back to config files"
        tenants=$(get_all_tenants_from_configs "$FILTER_ENVIRONMENT")

        # Add placeholder status and created date for config-only tenants
        local modified_tenants=""
        while IFS= read -r line; do
            if [ -n "$line" ]; then
                modified_tenants="${modified_tenants}${line}|unknown|unknown|unknown"$'\n'
            fi
        done <<<"$tenants"
        tenants="$modified_tenants"
    fi

    # Check if any tenants found
    if [ -z "$tenants" ]; then
        log_info "No tenants found"
        exit 0
    fi

    # Sort tenants
    tenants=$(sort_tenants "$tenants" "$SORT_FIELD")

    # Output in requested format
    case $OUTPUT_FORMAT in
        table)
            output_table "$tenants"
            ;;
        json)
            output_json "$tenants"
            ;;
        yaml)
            output_yaml "$tenants"
            ;;
        *)
            echo "Unknown output format: $OUTPUT_FORMAT" >&2
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
