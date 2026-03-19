#!/opt/homebrew/bin/bash
#==============================================================================
# Batch Tenant Health Check Script
# (批量租户健康检查脚本)
#
# Purpose: Perform health checks on all tenants or filtered subset
#
# Usage:
#   scripts/tenant/health-check-all.sh [options]
#
# Options:
#   --environment ENV  Filter by environment (production|staging|development)
#   --status STATUS    Filter by tenant status (active|suspended|provisioning)
#   --parallel         Enable parallel execution
#   --max-workers N    Max parallel workers (default: 5)
#   --timeout SEC      Timeout per tenant in seconds (default: 60)
#   --json             Output in JSON format
#   --summary-only     Show summary only (no per-tenant details)
#   --continue-on-error Continue checking other tenants if one fails
#
# Exit codes:
#   0: All checks passed
#   1: Some checks failed
#   2: Configuration error
#   3: No tenants found
#
# Example:
#   scripts/tenant/health-check-all.sh
#   scripts/tenant/health-check-all.sh --environment production --parallel
#   scripts/tenant/health-check-all.sh --parallel --max-workers 10 --json
#   scripts/tenant/health-check-all.sh --summary-only
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
TENANT_DIR="${SCRIPT_DIR}"

# Source required libraries
source "${LIB_DIR}/logging.sh" 2>/dev/null || { echo "ERROR: logging.sh not found"; exit 1; }
source "${LIB_DIR}/config.sh" 2>/dev/null || { echo "ERROR: config.sh not found"; exit 1; }
source "${LIB_DIR}/state.sh" 2>/dev/null || { echo "ERROR: state.sh not found"; exit 1; }

# Default values
FILTER_ENVIRONMENT=""
FILTER_STATUS=""
PARALLEL_MODE=false
MAX_WORKERS=5
CHECK_TIMEOUT=60
JSON_OUTPUT=false
SUMMARY_ONLY=false
CONTINUE_ON_ERROR=true

# Health status codes
declare -ri HEALTHY=0
declare -ri WARNING=1
declare -ri CRITICAL=2
declare -ri UNKNOWN=3

# Temporary directory for parallel execution results
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

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
Usage: ${0##*/} [options]

Perform health checks on all tenants or filtered subset.

Options:
  --environment ENV   Filter by environment (production|staging|development)
  --status STATUS     Filter by tenant status (active|suspended|provisioning)
  --parallel          Enable parallel execution
  --max-workers N     Max parallel workers (default: 5)
  --timeout SEC       Timeout per tenant in seconds (default: 60)
  --json              Output in JSON format
  --summary-only      Show summary only (no per-tenant details)
  --continue-on-error Continue checking other tenants if one fails
  -h, --help         Show this help message

Health Status:
  0 (healthy)    - All checks passed
  1 (warning)    - Some checks failed but service is functional
  2 (critical)   - Critical services down
  3 (unknown)    - Unable to determine status

Examples:
  ${0##*/} --environment production
  ${0##*/} --parallel --max-workers 10
  ${0##*/} --json --summary-only
  ${0##*/} --status active --parallel

EOF
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*" >&2
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $*" >&2
}

log_warning() {
    echo -e "${YELLOW}[⚠]${NC} $*" >&2
}

log_error() {
    echo -e "${RED}[✗]${NC} $*" >&2
}

log_debug() {
    if [[ "${DEBUG:-false}" == "true" ]]; then
        echo -e "${CYAN}[DEBUG]${NC} $*" >&2
    fi
}

#==============================================================================
# Tenant Discovery Functions
#==============================================================================

get_all_tenants() {
    local filter_env=$1
    local filter_status=$2

    # Try to get tenants from database first
    if state_init 2>/dev/null; then
        local sql_query
        sql_query="SELECT tenant_id, name, environment, tier, status
        FROM tenants
        WHERE 1=1"

        if [ -n "$filter_env" ]; then
            sql_query="$sql_query AND environment = '$filter_env'"
        fi

        if [ -n "$filter_status" ]; then
            sql_query="$sql_query AND status = '$filter_status'"
        fi

        sql_query="$sql_query AND status != 'deleted'
        ORDER BY tenant_id;"

        local result
        if state_exec_sql "$sql_query" result 2>/dev/null; then
            echo "$result"
            return 0
        fi
    fi

    # Fallback to config files
    log_debug "Database query failed, falling back to config files"

    local tenants=()
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

        local tenant_id
        local tenant_name
        local environment

        tenant_id=$(get_config_value "$config_file" "tenant.id" 2>/dev/null || echo "unknown")
        tenant_name=$(get_config_value "$config_file" "tenant.name" 2>/dev/null || echo "unknown")
        environment=$(get_config_value "$config_file" "tenant.environment" 2>/dev/null || echo "unknown")

        # Apply environment filter
        if [ -n "$filter_env" ] && [ "$environment" != "$filter_env" ]; then
            continue
        fi

        tenants+=("$tenant_id|$tenant_name|$environment|unknown|unknown")
    done

    # Sort and output
    IFS=$'\n' sort <<<"${tenants[*]}"
}

#==============================================================================
# Health Check Functions
#==============================================================================

# Check single tenant (for parallel execution)
check_tenant() {
    local tenant_id=$1
    local output_file=$2
    local timeout_sec=$3

    local start_time=$(date +%s%3N)

    # Run health check with timeout
    local result
    result=$(timeout "$timeout_sec" "$TENANT_DIR/health-check.sh" "$tenant_id" --json --quiet 2>&1)
    local exit_code=$?

    local end_time=$(date +%s%3N)
    local execution_time=$((end_time - start_time))

    # Write result to output file
    cat > "$output_file" <<EOF
$exit_code
$execution_time
$result
EOF

    return $exit_code
}

# Execute health checks in parallel
execute_parallel_checks() {
    local tenant_ids=$1
    local max_workers=$2
    local timeout_sec=$3

    local total_tenants=0
    local completed_tenants=0
    local failed_tenants=0
    local tenant_results=()
    local active_workers=0
    local tenant_queue=()

    # Build tenant queue
    while IFS= read -r tenant_line; do
        if [ -n "$tenant_line" ]; then
            local tenant_id
            tenant_id=$(echo "$tenant_line" | cut -d'|' -f1)
            tenant_queue+=("$tenant_id")
            ((total_tenants++))
        fi
    done <<<"$tenant_ids"

    if [ $total_tenants -eq 0 ]; then
        log_warning "No tenants found to check"
        return 3
    fi

    log_info "Checking $total_tenants tenants (parallel, max $max_workers workers)..."

    # Process tenants in parallel with worker pool
    local tenant_index=0
    local pids=()

    while [ $tenant_index -lt $total_tenants ] || [ ${#pids[@]} -gt 0 ]; do
        # Start new workers if slots available
        while [ $tenant_index -lt $total_tenants ] && [ ${#pids[@]} -lt $max_workers ]; do
            local tenant_id="${tenant_queue[$tenant_index]}"
            local output_file="$TEMP_DIR/tenant_${tenant_id}.json"

            # Start health check in background
            check_tenant "$tenant_id" "$output_file" "$timeout_sec" &
            pids+=($!)
            ((tenant_index++))

            log_debug "Started worker for tenant: $tenant_id (PID: ${pids[-1]})"
        done

        # Wait for any worker to complete
        if [ ${#pids[@]} -gt 0 ]; then
            local completed_pid
            local wait_result

            # Wait for first worker to complete
            wait -n ${pids[@]} 2>/dev/null
            wait_result=$?

            # Remove completed workers from pid list
            local new_pids=()
            for pid in "${pids[@]}"; do
                if kill -0 "$pid" 2>/dev/null; then
                    new_pids+=("$pid")
                fi
            done
            pids=("${new_pids[@]}")

            ((completed_tenants++))

            # Update progress
            if [ "$JSON_OUTPUT" = false ] && [ "$SUMMARY_ONLY" = false ]; then
                echo -ne "\rProgress: $completed_tenants/$total_tenants tenants checked..."
            fi
        fi
    done

    if [ "$JSON_OUTPUT" = false ] && [ "$SUMMARY_ONLY" = false ]; then
        echo ""
    fi

    # Collect results
    for output_file in "$TEMP_DIR"/tenant_*.json; do
        if [ -f "$output_file" ]; then
            local exit_code
            local execution_time
            local result_json

            exit_code=$(head -1 "$output_file")
            execution_time=$(sed -n '2p' "$output_file")
            result_json=$(sed -n '3,${p}' "$output_file")

            tenant_results+=("$exit_code|$execution_time|$result_json")

            if [ $exit_code -ne 0 ]; then
                ((failed_tenants++))
            fi
        fi
    done

    # Return results
    echo "$total_tenants|$completed_tenants|$failed_tenants"
    printf '%s\n' "${tenant_results[@]}"

    return 0
}

# Execute health checks sequentially
execute_sequential_checks() {
    local tenant_ids=$1
    local timeout_sec=$2

    local total_tenants=0
    local completed_tenants=0
    local failed_tenants=0
    declare -a tenant_results=()

    while IFS= read -r tenant_line; do
        if [ -z "$tenant_line" ]; then
            continue
        fi

        local tenant_id
        tenant_id=$(echo "$tenant_line" | cut -d'|' -f1)

        ((total_tenants++))

        if [ "$JSON_OUTPUT" = false ] && [ "$SUMMARY_ONLY" = false ]; then
            echo -ne "\rChecking tenant $completed_tenants/$total_tenants: $tenant_id..."
        fi

        local start_time=$(date +%s%3N)

        # Run health check
        local result
        result=$(timeout "$timeout_sec" "$TENANT_DIR/health-check.sh" "$tenant_id" --json --quiet 2>&1)
        local exit_code=$?

        local end_time=$(date +%s%3N)
        local execution_time=$((end_time - start_time))

        tenant_results+=("$exit_code|$execution_time|$result")

        if [ $exit_code -ne 0 ]; then
            ((failed_tenants++))
            if [ "$CONTINUE_ON_ERROR" = false ]; then
                log_error "Health check failed for tenant: $tenant_id"
                break
            fi
        fi

        ((completed_tenants++))
    done <<<"$tenant_ids"

    if [ "$JSON_OUTPUT" = false ] && [ "$SUMMARY_ONLY" = false ]; then
        echo ""
    fi

    # Return results
    echo "$total_tenants|$completed_tenants|$failed_tenants"
    printf '%s\n' "${tenant_results[@]}"

    return 0
}

#==============================================================================
# Output Formatting Functions
#==============================================================================

output_table() {
    local tenant_data=$1
    local total_tenants=$2
    local completed_tenants=$3
    local failed_tenants=$4

    echo
    echo -e "${BOLD}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}  Batch Tenant Health Check Report${NC}"
    echo -e "${BOLD}════════════════════════════════════════════════════════════════${NC}"
    echo
    echo "Total Tenants:   $total_tenants"
    echo "Completed:       $completed_tenants"
    echo "Failed:          $failed_tenants"
    echo

    if [ "$SUMMARY_ONLY" = false ]; then
        echo -e "${BOLD}Tenant Details:${NC}"
        echo

        # Print table header
        printf "%-20s  %-20s  %-15s  %-12s  %-12s  %-20s\n" \
            "TENANT_ID" "NAME" "ENVIRONMENT" "STATUS" "TIME(ms)" "TIMESTAMP"
        printf "%-20s  %-20s  %-15s  %-12s  %-12s  %-20s\n" \
            "--------------------" "--------------------" "---------------" "------------" "------------" "--------------------"

        # Print tenant results
        while IFS= read -r result_line; do
            if [ -z "$result_line" ]; then
                continue
            fi

            local exit_code
            local execution_time
            local result_json

            exit_code=$(echo "$result_line" | cut -d'|' -f1)
            execution_time=$(echo "$result_line" | cut -d'|' -f2)
            result_json=$(echo "$result_line" | cut -d'|' -f3-)

            local tenant_id
            local tenant_name
            local environment
            local status
            local timestamp

            tenant_id=$(echo "$result_json" | jq -r '.tenant_id // "unknown"' 2>/dev/null || echo "unknown")
            tenant_name=$(echo "$result_json" | jq -r '.name // "unknown"' 2>/dev/null || echo "unknown")
            environment=$(echo "$result_json" | jq -r '.environment // "unknown"' 2>/dev/null || echo "unknown")
            status=$(echo "$result_json" | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")
            timestamp=$(echo "$result_json" | jq -r '.timestamp // "unknown"' 2>/dev/null || echo "unknown")

            # Colorize status
            local status_colored
            case $status in
                healthy)
                    status_colored="${GREEN}${status}${NC}"
                    ;;
                warning)
                    status_colored="${YELLOW}${status}${NC}"
                    ;;
                critical)
                    status_colored="${RED}${status}${NC}"
                    ;;
                *)
                    status_colored="${status}"
                    ;;
            esac

            printf "%-20s  %-20s  %-15s  %-12s  %-12s  %-20s\n" \
                "$tenant_id" \
                "$tenant_name" \
                "$environment" \
                "$status_colored" \
                "$execution_time" \
                "$timestamp"
        done <<<"$tenant_data"
    fi

    echo
    echo -e "${BOLD}════════════════════════════════════════════════════════════════${NC}"
    echo
}

output_json() {
    local tenant_data=$1
    local total_tenants=$2
    local completed_tenants=$3
    local failed_tenants=$4
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    # Start JSON array
    echo "["

    local first=true
    while IFS= read -r result_line; do
        if [ -z "$result_line" ]; then
            continue
        fi

        local result_json
        result_json=$(echo "$result_line" | cut -d'|' -f3-)

        if [ "$first" = true ]; then
            first=false
        else
            echo ","
        fi

        echo -n "  $result_json"
    done <<<"$tenant_data"

    # End JSON array
    echo
    echo "]"
}

output_summary() {
    local total_tenants=$1
    local completed_tenants=$2
    local failed_tenants=$3

    local success_rate=0
    if [ $completed_tenants -gt 0 ]; then
        success_rate=$(( (completed_tenants - failed_tenants) * 100 / completed_tenants ))
    fi

    echo
    echo -e "${BOLD}Summary:${NC}"
    echo "  Total Tenants:     $total_tenants"
    echo "  Completed:         $completed_tenants"
    echo "  Failed:            $failed_tenants"
    echo "  Success Rate:      ${success_rate}%"
    echo
}

#==============================================================================
# Main Execution
#==============================================================================

main() {
    local start_time=$(date +%s%3N)

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
            --parallel)
                PARALLEL_MODE=true
                shift
                ;;
            --max-workers)
                MAX_WORKERS="$2"
                shift 2
                ;;
            --timeout)
                CHECK_TIMEOUT="$2"
                shift 2
                ;;
            --json)
                JSON_OUTPUT=true
                shift
                ;;
            --summary-only)
                SUMMARY_ONLY=true
                shift
                ;;
            --continue-on-error)
                CONTINUE_ON_ERROR=true
                shift
                ;;
            -h|--help)
                print_usage
                exit 0
                ;;
            *)
                echo "Unknown option: $1" >&2
                print_usage
                exit 2
                ;;
        esac
    done

    log_info "Starting batch tenant health checks..."

    # Get list of tenants to check
    local tenant_ids
    tenant_ids=$(get_all_tenants "$FILTER_ENVIRONMENT" "$FILTER_STATUS")

    if [ -z "$tenant_ids" ]; then
        log_error "No tenants found"
        exit 3
    fi

    # Execute health checks
    local check_results
    local total_tenants
    local completed_tenants
    local failed_tenants
    local tenant_data

    if [ "$PARALLEL_MODE" = true ]; then
        check_results=$(execute_parallel_checks "$tenant_ids" "$MAX_WORKERS" "$CHECK_TIMEOUT")
    else
        check_results=$(execute_sequential_checks "$tenant_ids" "$CHECK_TIMEOUT")
    fi

    # Parse summary
    total_tenants=$(echo "$check_results" | head -1 | cut -d'|' -f1)
    completed_tenants=$(echo "$check_results" | head -1 | cut -d'|' -f2)
    failed_tenants=$(echo "$check_results" | head -1 | cut -d'|' -f3)

    tenant_data=$(echo "$check_results" | tail -n +2)

    # Calculate execution time
    local end_time=$(date +%s%3N)
    local total_execution_time=$((end_time - start_time))

    # Output results
    if [ "$JSON_OUTPUT" = true ]; then
        output_json "$tenant_data" "$total_tenants" "$completed_tenants" "$failed_tenants"
    else
        output_table "$tenant_data" "$total_tenants" "$completed_tenants" "$failed_tenants"
        output_summary "$total_tenants" "$completed_tenants" "$failed_tenants"
        echo "Total execution time: ${total_execution_time}ms"
        echo
    fi

    # Exit with appropriate code
    if [ $failed_tenants -eq 0 ]; then
        exit 0
    else
        exit 1
    fi
}

# Run main function
main "$@"
