#!/opt/homebrew/bin/bash
#==============================================================================
# Tenant Health Check Script
# (租户健康检查脚本)
#
# Purpose: Perform comprehensive health checks on a single tenant instance
#
# Usage:
#   scripts/tenant/health-check.sh <tenant_id> [options]
#
# Options:
#   --layer LAYER      Check specific layer only (1-5)
#   --timeout SEC      Timeout per check in seconds (default: 30)
#   --json             Output in JSON format
#   --quiet            Suppress output, exit code only
#   --no-db            Skip database recording
#   --verbose          Show detailed check information
#
# Layers:
#   1. HTTP Health Check - Backend endpoint responding
#   2. Database Connection - PostgreSQL accepting connections
#   3. Database Query - PostgreSQL executing queries
#   4. OAuth Configuration - Feishu OAuth configured
#   5. Redis Connection - Redis cache service operational
#
# Exit codes:
#   0: All checks passed (healthy)
#   1: Some checks failed (warning/critical)
#   2: Configuration error
#   3: Tenant not found
#
# Example:
#   scripts/tenant/health-check.sh tenant_001
#   scripts/tenant/health-check.sh tenant_001 --layer 1 --json
#   scripts/tenant/health-check.sh tenant_001 --timeout 60 --verbose
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
MONITORING_DIR="${PROJECT_ROOT}/scripts/monitoring"

# Source required libraries
source "${LIB_DIR}/logging.sh" 2>/dev/null || { echo "ERROR: logging.sh not found"; exit 1; }
source "${LIB_DIR}/config.sh" 2>/dev/null || { echo "ERROR: config.sh not found"; exit 1; }
source "${LIB_DIR}/state.sh" 2>/dev/null || { echo "ERROR: state.sh not found"; exit 1; }
source "${LIB_DIR}/health-check.sh" 2>/dev/null || { echo "ERROR: health-check.sh not found"; exit 1; }

# Default values
TENANT_ID=""
SPECIFIC_LAYER=0
CHECK_TIMEOUT=30
JSON_OUTPUT=false
QUIET_MODE=false
SKIP_DATABASE=false
VERBOSE_MODE=false
HEALTH_CHECK_SCRIPT="${MONITORING_DIR}/enhanced-health-check.sh"

# Health status codes
declare -ri HEALTHY=0
declare -ri WARNING=1
declare -ri CRITICAL=2
declare -ri UNKNOWN=3

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

Perform comprehensive health checks on a single tenant instance.

Arguments:
  tenant_id            Tenant ID (required)

Options:
  --layer LAYER        Check specific layer only (1-5)
  --timeout SEC        Timeout per check in seconds (default: 30)
  --json               Output in JSON format
  --quiet              Suppress output, exit code only
  --no-db              Skip database recording
  --verbose            Show detailed check information
  -h, --help           Show this help message

Layers:
  1. HTTP Health Check - Backend endpoint responding with 200
  2. Database Connection - PostgreSQL accepting connections
  3. Database Query Test - PostgreSQL executing queries
  4. OAuth Configuration - Feishu OAuth configured
  5. Redis Connection - Redis cache service operational

Health Status:
  0 (healthy)    - All checks passed
  1 (warning)    - Some checks failed but service is functional
  2 (critical)   - Critical services down
  3 (unknown)    - Unable to determine status

Exit codes:
  0: All checks passed (healthy)
  1: Some checks failed (warning/critical)
  2: Configuration error
  3: Tenant not found

Examples:
  ${0##*/} tenant_001
  ${0##*/} tenant_001 --layer 1 --json
  ${0##*/} tenant_001 --timeout 60 --verbose
  ${0##*/} tenant_001 --no-db --quiet

EOF
}

log_info() {
    if [ "$QUIET_MODE" = false ] && [ "$JSON_OUTPUT" = false ]; then
        echo -e "${BLUE}[INFO]${NC} $*" >&2
    fi
}

log_success() {
    if [ "$QUIET_MODE" = false ] && [ "$JSON_OUTPUT" = false ]; then
        echo -e "${GREEN}[✓]${NC} $*" >&2
    fi
}

log_warning() {
    if [ "$QUIET_MODE" = false ] && [ "$JSON_OUTPUT" = false ]; then
        echo -e "${YELLOW}[⚠]${NC} $*" >&2
    fi
}

log_error() {
    if [ "$QUIET_MODE" = false ] && [ "$JSON_OUTPUT" = false ]; then
        echo -e "${RED}[✗]${NC} $*" >&2
    fi
}

log_debug() {
    if [ "$VERBOSE_MODE" = true ] && [ "$JSON_OUTPUT" = false ]; then
        echo -e "${CYAN}[DEBUG]${NC} $*" >&2
    fi
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
    local server_host
    local api_port

    tenant_id=$(get_config_value "$config_file" "tenant.id" 2>/dev/null || echo "unknown")
    tenant_name=$(get_config_value "$config_file" "tenant.name" 2>/dev/null || echo "unknown")
    environment=$(get_config_value "$config_file" "tenant.environment" 2>/dev/null || echo "unknown")
    server_host=$(get_config_value "$config_file" "server.host" 2>/dev/null || echo "unknown")
    api_port=$(get_config_value "$config_file" "server.api_port" 2>/dev/null || echo "3000")

    echo "$tenant_id|$tenant_name|$environment|$server_host|$api_port"
}

#==============================================================================
# Health Check Functions
#==============================================================================

# Execute health check for a specific layer
execute_layer_check() {
    local layer_num=$1
    local server_host=$2
    local api_port=$3

    local layer_script
    local layer_name
    local start_time
    local output
    local exit_code
    local execution_time

    case $layer_num in
        1)
            layer_script="${MONITORING_DIR}/health-check-layer1.sh"
            layer_name="HTTP Health Check"
            ;;
        2)
            layer_script="${MONITORING_DIR}/health-check-layer2.sh"
            layer_name="Database Connection"
            ;;
        3)
            layer_script="${MONITORING_DIR}/health-check-layer3.sh"
            layer_name="Database Query"
            ;;
        4)
            layer_script="${MONITORING_DIR}/health-check-layer4.sh"
            layer_name="OAuth Configuration"
            ;;
        5)
            layer_script="${MONITORING_DIR}/health-check-layer5.sh"
            layer_name="Redis Connection"
            ;;
        *)
            log_error "Invalid layer number: $layer_num"
            return 1
            ;;
    esac

    if [ ! -f "$layer_script" ]; then
        log_error "Layer script not found: $layer_script"
        return 1
    fi

    start_time=$(date +%s%3N)

    # Execute layer check with timeout
    if [ "$VERBOSE_MODE" = true ]; then
        log_debug "Executing layer $layer_num: $layer_name"
    fi

    output=$(timeout "$CHECK_TIMEOUT" "$layer_script" --server-host "$server_host" --api-port "$api_port" 2>&1)
    exit_code=$?

    local end_time=$(date +%s%3N)
    execution_time=$((end_time - start_time))

    # Determine status
    local status="fail"
    if [ $exit_code -eq 0 ]; then
        status="pass"
    fi

    # Output result
    if [ "$JSON_OUTPUT" = true ]; then
        echo "{\"layer\": \"layer${layer_num}\", \"name\": \"$layer_name\", \"status\": \"$status\", \"response_time_ms\": $execution_time, \"details\": \"$(echo "$output" | tail -1 | tr -d '\n')\"},"
    else
        case $status in
            pass)
                log_success "Layer $layer_num ($layer_name): PASS (${execution_time}ms)"
                ;;
            fail)
                log_error "Layer $layer_num ($layer_name): FAIL (${execution_time}ms)"
                ;;
        esac

        if [ "$VERBOSE_MODE" = true ] && [ -n "$output" ]; then
            echo "  Details: $output"
        fi
    fi

    return $exit_code
}

# Perform all health checks for tenant
perform_health_checks() {
    local tenant_id=$1
    local server_host=$2
    local api_port=$3

    local total_checks=0
    local passed_checks=0
    local failed_checks=0
    local overall_status_code=$HEALTHY
    local layer_results=""

    # Set environment variables for health check scripts
    export SERVER_HOST="$server_host"
    export API_PORT="$api_port"
    export CHECK_TIMEOUT="$CHECK_TIMEOUT"

    # Execute checks
    local layers_to_check=(1 2 3 4 5)
    if [ "$SPECIFIC_LAYER" -gt 0 ] && [ "$SPECIFIC_LAYER" -le 5 ]; then
        layers_to_check=("$SPECIFIC_LAYER")
    fi

    for layer in "${layers_to_check[@]}"; do
        ((total_checks++))

        local output
        output=$(execute_layer_check "$layer" "$server_host" "$api_port")
        local layer_exit_code=$?

        layer_results="${layer_results}${output}"$'\n'

        if [ $layer_exit_code -eq 0 ]; then
            ((passed_checks++))
        else
            ((failed_checks++))
        fi
    done

    # Calculate overall status
    if [ $failed_checks -eq 0 ]; then
        overall_status_code=$HEALTHY
    elif [ $failed_checks -eq 1 ]; then
        overall_status_code=$WARNING
    else
        overall_status_code=$CRITICAL
    fi

    # Return results
    echo "$total_checks|$passed_checks|$failed_checks|$overall_status_code"
    echo "$layer_results"

    return $overall_status_code
}

#==============================================================================
# Database Recording Functions
#==============================================================================

record_health_check_to_db() {
    local tenant_id=$1
    local check_type=$2
    local status=$3
    local response_time=$4
    local error_message=$5
    local details_json=$6

    if [ "$SKIP_DATABASE" = true ]; then
        log_debug "Skipping database recording"
        return 0
    fi

    # Initialize state database
    if ! state_init 2>/dev/null; then
        log_warning "Failed to initialize state database, skipping recording"
        return 1
    fi

    # Record health check
    record_health_check "$tenant_id" "$check_type" "$status" "$response_time" "$error_message" "" "$details_json" 2>/dev/null

    if [ $? -eq 0 ]; then
        log_debug "Health check recorded to database"
    else
        log_warning "Failed to record health check to database"
    fi

    return 0
}

#==============================================================================
# Output Formatting Functions
#==============================================================================

output_table() {
    local tenant_id=$1
    local tenant_name=$2
    local environment=$3
    local total_checks=$4
    local passed_checks=$5
    local failed_checks=$6
    local overall_status_code=$7
    local timestamp=$8

    local status_text
    local status_color

    case $overall_status_code in
        $HEALTHY)
            status_text="healthy"
            status_color="$GREEN"
            ;;
        $WARNING)
            status_text="warning"
            status_color="$YELLOW"
            ;;
        $CRITICAL)
            status_text="critical"
            status_color="$RED"
            ;;
        *)
            status_text="unknown"
            status_color="$CYAN"
            ;;
    esac

    echo
    echo -e "${BOLD}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}  Tenant Health Check: $tenant_id${NC}"
    echo -e "${BOLD}════════════════════════════════════════════════════════════════${NC}"
    echo
    echo "Tenant ID:     $tenant_id"
    echo "Name:          $tenant_name"
    echo "Environment:   $environment"
    echo "Status:        ${status_color}${status_text}${NC}"
    echo "Checks:        $passed_checks/$total_checks passed"
    echo "Timestamp:     $timestamp"
    echo
}

output_json() {
    local tenant_id=$1
    local tenant_name=$2
    local environment=$3
    local total_checks=$4
    local passed_checks=$5
    local failed_checks=$6
    local overall_status_code=$7
    local timestamp=$8
    local layer_results=$9

    local status_text
    case $overall_status_code in
        $HEALTHY) status_text="healthy" ;;
        $WARNING) status_text="warning" ;;
        $CRITICAL) status_text="critical" ;;
        *) status_text="unknown" ;;
    esac

    # Remove trailing comma from layer results
    layer_results=$(echo "$layer_results" | sed '$ s/,$//')

    cat <<EOF
{
  "tenant_id": "$tenant_id",
  "name": "$tenant_name",
  "environment": "$environment",
  "status": "$status_text",
  "status_code": $overall_status_code,
  "timestamp": "$timestamp",
  "summary": {
    "total_checks": $total_checks,
    "passed": $passed_checks,
    "failed": $failed_checks
  },
  "layers": [
$layer_results
  ]
}
EOF
}

#==============================================================================
# Main Execution
#==============================================================================

main() {
    local start_time=$(date +%s%3N)

    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --layer)
                SPECIFIC_LAYER="$2"
                if ! [[ "$SPECIFIC_LAYER" =~ ^[1-5]$ ]]; then
                    log_error "Invalid layer number: $SPECIFIC_LAYER"
                    print_usage
                    exit 2
                fi
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
            --quiet)
                QUIET_MODE=true
                shift
                ;;
            --no-db)
                SKIP_DATABASE=true
                shift
                ;;
            --verbose)
                VERBOSE_MODE=true
                shift
                ;;
            -h|--help)
                print_usage
                exit 0
                ;;
            -*)
                log_error "Unknown option: $1"
                print_usage
                exit 2
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
        exit 2
    fi

    log_debug "Starting health check for tenant: $TENANT_ID"

    # Get tenant configuration file
    local config_file
    config_file=$(get_tenant_config_file "$TENANT_ID") || exit 3

    # Load tenant information
    local tenant_info
    tenant_info=$(load_tenant_info "$config_file")

    local tenant_name
    local environment
    local server_host
    local api_port

    tenant_name=$(echo "$tenant_info" | cut -d'|' -f2)
    environment=$(echo "$tenant_info" | cut -d'|' -f3)
    server_host=$(echo "$tenant_info" | cut -d'|' -f4)
    api_port=$(echo "$tenant_info" | cut -d'|' -f5)

    log_debug "Tenant: $tenant_name ($environment)"
    log_debug "Server: $server_host:$api_port"

    # Perform health checks
    local check_results
    local layer_results

    check_results=$(perform_health_checks "$TENANT_ID" "$server_host" "$api_port")

    local total_checks
    local passed_checks
    local failed_checks
    local overall_status_code

    total_checks=$(echo "$check_results" | head -1 | cut -d'|' -f1)
    passed_checks=$(echo "$check_results" | head -1 | cut -d'|' -f2)
    failed_checks=$(echo "$check_results" | head -1 | cut -d'|' -f3)
    overall_status_code=$(echo "$check_results" | head -1 | cut -d'|' -f4)

    layer_results=$(echo "$check_results" | tail -n +2)

    # Calculate execution time
    local end_time=$(date +%s%3N)
    local total_execution_time=$((end_time - start_time))
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    # Record to database
    local status_text
    case $overall_status_code in
        $HEALTHY) status_text="pass" ;;
        $WARNING) status_text="warning" ;;
        $CRITICAL) status_text="fail" ;;
        *) status_text="skip" ;;
    esac

    local details_json="{\"total_checks\":$total_checks,\"passed\":$passed_checks,\"failed\":$failed_checks,\"execution_time_ms\":$total_execution_time}"

    record_health_check_to_db "$TENANT_ID" "full" "$status_text" "$total_execution_time" "" "$details_json"

    # Output results
    if [ "$JSON_OUTPUT" = true ]; then
        output_json "$TENANT_ID" "$tenant_name" "$environment" "$total_checks" "$passed_checks" "$failed_checks" "$overall_status_code" "$timestamp" "$layer_results"
    else
        if [ "$QUIET_MODE" = false ]; then
            output_table "$TENANT_ID" "$tenant_name" "$environment" "$total_checks" "$passed_checks" "$failed_checks" "$overall_status_code" "$timestamp"

            # Output layer results if verbose
            if [ "$VERBOSE_MODE" = true ]; then
                echo "$layer_results"
            fi

            echo "Execution time: ${total_execution_time}ms"
            echo
        fi
    fi

    # Exit with appropriate code
    if [ $overall_status_code -eq $HEALTHY ]; then
        exit 0
    else
        exit 1
    fi
}

# Run main function
main "$@"
