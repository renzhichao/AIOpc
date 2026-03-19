#!/opt/homebrew/bin/bash
#==============================================================================
# Tenant Health Status Query Script
# (租户健康状态查询脚本)
#
# Purpose: Query health check history and current status for a tenant
#
# Usage:
#   scripts/tenant/health-status.sh <tenant_id> [options]
#
# Options:
#   --history N        Show last N health checks (default: 10)
#   --check-type TYPE  Filter by check type (http|database|oauth|redis|ssh|docker|full)
#   --status STATUS     Filter by status (pass|fail|warning|skip)
#   --since DATE       Show checks since DATE (format: YYYY-MM-DD)
#   --until DATE       Show checks until DATE (format: YYYY-MM-DD)
#   --json             Output in JSON format
#   --compact          Compact output (one line per check)
#   --latest           Show only the latest health status
#
# Exit codes:
#   0: Success
#   1: Error
#   2: Tenant not found
#   3: No health checks found
#
# Example:
#   scripts/tenant/health-status.sh tenant_001
#   scripts/tenant/health-status.sh tenant_001 --history 20
#   scripts/tenant/health-status.sh tenant_001 --latest --json
#   scripts/tenant/health-status.sh tenant_001 --check-type http --status fail
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
TENANT_ID=""
HISTORY_LIMIT=10
FILTER_CHECK_TYPE=""
FILTER_STATUS=""
SINCE_DATE=""
UNTIL_DATE=""
JSON_OUTPUT=false
COMPACT_OUTPUT=false
LATEST_ONLY=false

# Colors for output
if [ -t 1 ] && [ "$JSON_OUTPUT" = false ]; then
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
Usage: ${0##*/} <tenant_id> [options]

Query health check history and current status for a tenant.

Arguments:
  tenant_id            Tenant ID (required)

Options:
  --history N          Show last N health checks (default: 10)
  --check-type TYPE    Filter by check type (http|database|oauth|redis|ssh|docker|full)
  --status STATUS      Filter by status (pass|fail|warning|skip)
  --since DATE         Show checks since DATE (format: YYYY-MM-DD)
  --until DATE         Show checks until DATE (format: YYYY-MM-DD)
  --json               Output in JSON format
  --compact            Compact output (one line per check)
  --latest             Show only the latest health status
  -h, --help           Show this help message

Check Types:
  http       - HTTP endpoint health
  database   - Database connection and query
  oauth      - OAuth configuration
  redis      - Redis cache service
  ssh        - SSH access
  docker     - Docker container status
  full       - Complete health check (all layers)

Status Values:
  pass       - Check passed successfully
  fail       - Check failed
  warning    - Check passed with warnings
  skip       - Check was skipped

Examples:
  ${0##*/} tenant_001
  ${0##*/} tenant_001 --history 20
  ${0##*/} tenant_001 --latest --json
  ${0##*/} tenant_001 --check-type http --status fail
  ${0##*/} tenant_001 --since 2026-03-01 --until 2026-03-15

EOF
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*" >&2
}

log_warning() {
    echo -e "${YELLOW}[⚠]${NC} $*" >&2
}

log_error() {
    echo -e "${RED}[✗]${NC} $*" >&2
}

#==============================================================================
# Tenant Discovery Functions
#==============================================================================

get_tenant_config_file() {
    local tenant_id=$1
    local config_file="${CONFIG_DIR}/${tenant_id}.yml"

    if [ ! -f "$config_file" ]; then
        log_error "Tenant configuration not found: $config_file"
        return 1
    fi

    echo "$config_file"
    return 0
}

load_tenant_info() {
    local config_file=$1

    local tenant_id
    local tenant_name
    local environment

    tenant_id=$(get_config_value "$config_file" "tenant.id" 2>/dev/null || echo "unknown")
    tenant_name=$(get_config_value "$config_file" "tenant.name" 2>/dev/null || echo "unknown")
    environment=$(get_config_value "$config_file" "tenant.environment" 2>/dev/null || echo "unknown")

    echo "$tenant_id|$tenant_name|$environment"
}

#==============================================================================
# Database Query Functions
#==============================================================================

query_health_checks() {
    local tenant_id=$1
    local limit=$2
    local check_type=$3
    local status=$4
    local since=$5
    local until=$6

    # Initialize state database
    if ! state_init 2>/dev/null; then
        log_error "Failed to initialize state database"
        return 1
    fi

    # Build SQL query
    local sql_query
    sql_query="SELECT
        check_type,
        status,
        response_time_ms,
        checked_at,
        error_message,
        check_details
    FROM health_checks
    WHERE tenant_id = '$tenant_id'"

    # Apply filters
    if [ -n "$check_type" ]; then
        sql_query="$sql_query AND check_type = '$check_type'"
    fi

    if [ -n "$status" ]; then
        sql_query="$sql_query AND status = '$status'"
    fi

    if [ -n "$since" ]; then
        sql_query="$sql_query AND checked_at >= '$since 00:00:00'"
    fi

    if [ -n "$until" ]; then
        sql_query="$sql_query AND checked_at <= '$until 23:59:59'"
    fi

    sql_query="$sql_query ORDER BY checked_at DESC"

    if [ -n "$limit" ]; then
        sql_query="$sql_query LIMIT $limit;"
    else
        sql_query="$sql_query;"
    fi

    # Execute query
    local result
    if state_exec_sql "$sql_query" result 2>/dev/null; then
        echo "$result"
        return 0
    fi

    return 1
}

get_latest_health_status() {
    local tenant_id=$1

    local result
    result=$(query_health_checks "$tenant_id" 1 "" "" "" "")

    if [ -n "$result" ]; then
        echo "$result"
        return 0
    fi

    return 1
}

calculate_health_statistics() {
    local tenant_id=$1
    local since=$2

    # Initialize state database
    if ! state_init 2>/dev/null; then
        return 1
    fi

    # Build SQL query for statistics
    local sql_query
    sql_query="SELECT
        COUNT(*) as total_checks,
        SUM(CASE WHEN status = 'pass' THEN 1 ELSE 0 END) as passed_checks,
        SUM(CASE WHEN status = 'fail' THEN 1 ELSE 0 END) as failed_checks,
        SUM(CASE WHEN status = 'warning' THEN 1 ELSE 0 END) as warning_checks,
        SUM(CASE WHEN status = 'skip' THEN 1 ELSE 0 END) as skipped_checks,
        ROUND(AVG(response_time_ms), 2) as avg_response_time,
        MIN(response_time_ms) as min_response_time,
        MAX(response_time_ms) as max_response_time
    FROM health_checks
    WHERE tenant_id = '$tenant_id'"

    if [ -n "$since" ]; then
        sql_query="$sql_query AND checked_at >= '$since 00:00:00'"
    fi

    sql_query="$sql_query;"

    # Execute query
    local result
    if state_exec_sql "$sql_query" result 2>/dev/null; then
        echo "$result"
        return 0
    fi

    return 1
}

#==============================================================================
# Output Formatting Functions
#==============================================================================

format_status_color() {
    local status=$1

    case $status in
        pass)
            echo -e "${GREEN}${status}${NC}"
            ;;
        fail)
            echo -e "${RED}${status}${NC}"
            ;;
        warning)
            echo -e "${YELLOW}${status}${NC}"
            ;;
        skip)
            echo -e "\x1B[2m${status}\x1B[0m"
            ;;
        *)
            echo "$status"
            ;;
    esac
}

format_check_type() {
    local check_type=$1

    case $check_type in
        http) echo "HTTP" ;;
        database) echo "Database" ;;
        oauth) echo "OAuth" ;;
        redis) echo "Redis" ;;
        ssh) echo "SSH" ;;
        docker) echo "Docker" ;;
        full) echo "Full" ;;
        *) echo "$check_type" ;;
    esac
}

output_table() {
    local tenant_id=$1
    local tenant_name=$2
    local environment=$3
    local health_checks=$4
    local statistics=$5

    echo
    echo -e "${BOLD}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}  Tenant Health Status: $tenant_id${NC}"
    echo -e "${BOLD}════════════════════════════════════════════════════════════════${NC}"
    echo
    echo "Tenant ID:     $tenant_id"
    echo "Name:          $tenant_name"
    echo "Environment:   $environment"
    echo

    # Display statistics
    if [ -n "$statistics" ]; then
        local total
        local passed
        local failed
        local warnings
        local skipped
        local avg_time
        local min_time
        local max_time

        read -r total passed failed warnings skipped avg_time min_time max_time <<<"$statistics"

        echo -e "${BOLD}Health Statistics:${NC}"
        echo "  Total Checks:     $total"
        echo -e "  Passed:           ${GREEN}${passed}${NC}"
        echo -e "  Failed:           ${RED}${failed}${NC}"
        echo -e "  Warnings:         ${YELLOW}${warnings}${NC}"
        echo "  Skipped:          $skipped"
        echo "  Avg Response:     ${avg_time}ms"
        echo "  Min Response:     ${min_time}ms"
        echo "  Max Response:     ${max_time}ms"
        echo
    fi

    # Display health check history
    if [ -n "$health_checks" ]; then
        echo -e "${BOLD}Health Check History:${NC}"
        echo

        if [ "$COMPACT_OUTPUT" = true ]; then
            # Compact output (one line per check)
            printf "%-12s  %-12s  %-12s  %-10s  %-25s\n" \
                "Type" "Status" "Time(ms)" "Error" "Timestamp"
            printf "%-12s  %-12s  %-12s  %-10s  %-25s\n" \
                "------------" "------------" "------------" "----------" "-------------------------"

            while IFS= read -r line; do
                if [ -z "$line" ]; then
                    continue
                fi

                local check_type
                local status
                local response_time
                local checked_at
                local error_msg
                local details

                read -r check_type status response_time checked_at error_msg details <<<"$line"

                local status_colored
                status_colored=$(format_status_color "$status")

                local type_formatted
                type_formatted=$(format_check_type "$check_type")

                local error_short
                if [ -n "$error_msg" ]; then
                    error_short=$(echo "$error_msg" | cut -c1-20)
                else
                    error_short="-"
                fi

                printf "%-12s  %-12s  %-12s  %-10s  %-25s\n" \
                    "$type_formatted" \
                    "$status_colored" \
                    "$response_time" \
                    "$error_short" \
                    "$checked_at"
            done <<<"$health_checks"
        else
            # Detailed output
            while IFS= read -r line; do
                if [ -z "$line" ]; then
                    continue
                fi

                local check_type
                local status
                local response_time
                local checked_at
                local error_msg
                local details

                read -r check_type status response_time checked_at error_msg details <<<"$line"

                local status_colored
                status_colored=$(format_status_color "$status")

                local type_formatted
                type_formatted=$(format_check_type "$check_type")

                echo "[$type_formatted] $status_colored (${response_time}ms) - $checked_at"

                if [ -n "$error_msg" ]; then
                    echo "  Error: $error_msg"
                fi

                if [ "$VERBOSE_MODE" = true ] && [ -n "$details" ]; then
                    echo "  Details: $details"
                fi

                echo
            done <<<"$health_checks"
        fi
    else
        echo "No health checks found"
    fi

    echo
    echo -e "${BOLD}════════════════════════════════════════════════════════════════${NC}"
    echo
}

output_json() {
    local tenant_id=$1
    local tenant_name=$2
    local environment=$3
    local health_checks=$4
    local statistics=$5
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    # Parse statistics
    local total=0
    local passed=0
    local failed=0
    local warnings=0
    local skipped=0
    local avg_time=0
    local min_time=0
    local max_time=0

    if [ -n "$statistics" ]; then
        read -r total passed failed warnings skipped avg_time min_time max_time <<<"$statistics"
    fi

    # Start JSON object
    cat <<EOF
{
  "tenant_id": "$tenant_id",
  "name": "$tenant_name",
  "environment": "$environment",
  "timestamp": "$timestamp",
  "statistics": {
    "total_checks": $total,
    "passed": $passed,
    "failed": $failed,
    "warnings": $warnings,
    "skipped": $skipped,
    "avg_response_time_ms": $avg_time,
    "min_response_time_ms": $min_time,
    "max_response_time_ms": $max_time
  },
  "health_checks": [
EOF

    # Output health checks array
    local first=true
    while IFS= read -r line; do
        if [ -z "$line" ]; then
            continue
        fi

        local check_type
        local status
        local response_time
        local checked_at
        local error_msg
        local details

        read -r check_type status response_time checked_at error_msg details <<<"$line"

        if [ "$first" = true ]; then
            first=false
        else
            echo ","
        fi

        # Escape error message and details for JSON
        error_msg=$(echo "$error_msg" | sed 's/"/\\"/g' | sed ':a;N;$!ba;s/\n/\\n/g')
        details=$(echo "$details" | sed 's/"/\\"/g' | sed ':a;N;$!ba;s/\n/\\n/g')

        cat <<EOF
    {
      "check_type": "$check_type",
      "status": "$status",
      "response_time_ms": $response_time,
      "checked_at": "$checked_at",
      "error_message": "${error_msg:-}",
      "details": ${details:-{}}
    }EOF
    done <<<"$health_checks"

    # End JSON object
    cat <<EOF

  ]
}
EOF
}

output_latest() {
    local tenant_id=$1
    local tenant_name=$2
    local environment=$3
    local latest_check=$4

    if [ -z "$latest_check" ]; then
        echo "No health checks found for tenant: $tenant_id"
        return 1
    fi

    local check_type
    local status
    local response_time
    local checked_at

    read -r check_type status response_time checked_at _ _ <<<"$latest_check"

    local status_colored
    status_colored=$(format_status_color "$status")

    local type_formatted
    type_formatted=$(format_check_type "$check_type")

    echo "$tenant_id|$tenant_name|$environment|$status_colored|$response_time|$checked_at"
}

#==============================================================================
# Main Execution
#==============================================================================

main() {
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --history)
                HISTORY_LIMIT="$2"
                shift 2
                ;;
            --check-type)
                FILTER_CHECK_TYPE="$2"
                shift 2
                ;;
            --status)
                FILTER_STATUS="$2"
                shift 2
                ;;
            --since)
                SINCE_DATE="$2"
                shift 2
                ;;
            --until)
                UNTIL_DATE="$2"
                shift 2
                ;;
            --json)
                JSON_OUTPUT=true
                shift
                ;;
            --compact)
                COMPACT_OUTPUT=true
                shift
                ;;
            --latest)
                LATEST_ONLY=true
                shift
                ;;
            -h|--help)
                print_usage
                exit 0
                ;;
            -*)
                log_error "Unknown option: $1"
                print_usage
                exit 1
                ;;
            *)
                TENANT_ID="$1"
                shift
                ;;
        esac
    done

    # Validate tenant ID
    if [ -z "$TENANT_ID" ]; then
        log_error "Tenant ID is required"
        print_usage
        exit 1
    fi

    # Get tenant configuration file
    local config_file
    config_file=$(get_tenant_config_file "$TENANT_ID") || exit 2

    # Load tenant information
    local tenant_info
    tenant_info=$(load_tenant_info "$config_file")

    local tenant_name
    local environment

    tenant_name=$(echo "$tenant_info" | cut -d'|' -f2)
    environment=$(echo "$tenant_info" | cut -d'|' -f3)

    # Query health checks
    local health_checks
    local statistics

    if [ "$LATEST_ONLY" = true ]; then
        health_checks=$(get_latest_health_status "$TENANT_ID")
        output_latest "$TENANT_ID" "$tenant_name" "$environment" "$health_checks"
        exit $?
    fi

    # Get health check history
    health_checks=$(query_health_checks "$TENANT_ID" "$HISTORY_LIMIT" "$FILTER_CHECK_TYPE" "$FILTER_STATUS" "$SINCE_DATE" "$UNTIL_DATE")

    if [ -z "$health_checks" ]; then
        if [ "$JSON_OUTPUT" = true ]; then
            echo "{\"error\": \"No health checks found\"}"
        else
            echo "No health checks found for tenant: $TENANT_ID"
        fi
        exit 3
    fi

    # Calculate statistics
    statistics=$(calculate_health_statistics "$TENANT_ID" "$SINCE_DATE")

    # Output results
    if [ "$JSON_OUTPUT" = true ]; then
        output_json "$TENANT_ID" "$tenant_name" "$environment" "$health_checks" "$statistics"
    else
        output_table "$TENANT_ID" "$tenant_name" "$environment" "$health_checks" "$statistics"
    fi

    exit 0
}

# Run main function
main "$@"
