#!/bin/bash
#==============================================================================
# Health Check Library
#==============================================================================
# Purpose: Reusable functions for multi-layer health checking
#
# Features:
# - Retry logic with exponential backoff
# - Structured JSON output
# - Error reporting with actionable messages
# - Timeout management per layer
#
# Usage:
#   source /path/to/health-check-lib.sh
#   retry_with_backoff "command" "description"
#==============================================================================

#==============================================================================
# Configuration
#==============================================================================

# Retry configuration
MAX_RETRIES=${MAX_RETRIES:-3}
INITIAL_BACKOFF=${INITIAL_BACKOFF:-1}  # seconds
BACKOFF_MULTIPLIER=${BACKOFF_MULTIPLIER:-2}

# Timeout configuration (per layer)
LAYER_TIMEOUT=${LAYER_TIMEOUT:-10}  # seconds

# Output configuration
JSON_OUTPUT=${JSON_OUTPUT:-false}
VERBOSE=${VERBOSE:-false}

# Colors for output
if [ "$JSON_OUTPUT" = false ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    NC='\033[0m' # No Color
fi

#==============================================================================
# Logging Functions
#==============================================================================

log_info() {
    if [ "$JSON_OUTPUT" = false ]; then
        echo -e "${BLUE}[INFO]${NC} $1" >&2
    fi
}

log_success() {
    if [ "$JSON_OUTPUT" = false ]; then
        echo -e "${GREEN}[✓]${NC} $1" >&2
    fi
}

log_warning() {
    if [ "$JSON_OUTPUT" = false ]; then
        echo -e "${YELLOW}[⚠]${NC} $1" >&2
    fi
}

log_error() {
    if [ "$JSON_OUTPUT" = false ]; then
        echo -e "${RED}[✗]${NC} $1" >&2
    fi
}

log_retry() {
    if [ "$JSON_OUTPUT" = false ]; then
        echo -e "${YELLOW}[↻]${NC} $1" >&2
    fi
}

#==============================================================================
# Utility Functions
#==============================================================================

# Get current timestamp in ISO 8601 format
get_timestamp() {
    date -u +"%Y-%m-%dT%H:%M:%SZ"
}

# Execute command with timeout
execute_with_timeout() {
    local command=$1
    local timeout=${2:-$LAYER_TIMEOUT}

    timeout "$timeout" bash -c "$command" 2>/dev/null
    return $?
}

# Calculate exponential backoff delay
calculate_backoff() {
    local attempt=$1
    local delay=$INITIAL_BACKOFF

    for ((i=1; i<attempt; i++)); do
        delay=$((delay * BACKOFF_MULTIPLIER))
    done

    echo $delay
}

#==============================================================================
# Retry Logic
#==============================================================================

# Execute command with retry logic and exponential backoff
retry_with_backoff() {
    local command=$1
    local description=${2:-"Operation"}
    local max_retries=${3:-$MAX_RETRIES}
    local output_var=${4:-""}

    local attempt=1
    local output=""
    local exit_code=1

    while [ $attempt -le $max_retries ]; do
        log_info "$description (attempt $attempt/$max_retries)"

        output=$(execute_with_timeout "$command" 2>&1)
        exit_code=$?

        if [ $exit_code -eq 0 ]; then
            log_success "$description succeeded"
            if [ -n "$output_var" ]; then
                eval "$output_var='$output'"
            fi
            return 0
        fi

        if [ $attempt -lt $max_retries ]; then
            local delay=$(calculate_backoff $attempt)
            log_retry "$description failed, retrying in ${delay}s..."
            sleep $delay
        fi

        ((attempt++))
    done

    log_error "$description failed after $max_retries attempts"
    if [ -n "$output_var" ]; then
        eval "$output_var='$output'"
    fi
    return 1
}

#==============================================================================
# JSON Output Functions
#==============================================================================

# Start JSON object
json_start() {
    if [ "$JSON_OUTPUT" = true ]; then
        echo "{"
    fi
}

# Add JSON field
json_add_field() {
    local key=$1
    local value=$2

    if [ "$JSON_OUTPUT" = true ]; then
        # Check if value is a number or boolean
        if [[ "$value" =~ ^[0-9]+$ ]] || [[ "$value" =~ ^(true|false)$ ]]; then
            echo "  \"$key\": $value,"
        else
            # Escape quotes and special characters in value
            value=$(echo "$value" | sed 's/"/\\"/g' | sed ':a;N;$!ba;s/\n/\\n/g')
            echo "  \"$key\": \"$value\","
        fi
    fi
}

# Add JSON timestamp field
json_add_timestamp() {
    local key=${1:-"timestamp"}
    local timestamp=$(get_timestamp)

    if [ "$JSON_OUTPUT" = true ]; then
        echo "  \"$key\": \"$timestamp\","
    fi
}

# End JSON object (remove trailing comma)
json_end() {
    if [ "$JSON_OUTPUT" = true ]; then
        echo "  \"_completed\": true"
        echo "}"
    fi
}

# Start JSON array
json_array_start() {
    if [ "$JSON_OUTPUT" = true ]; then
        echo "  \"$1\": ["
    fi
}

# Add JSON array item
json_array_add() {
    if [ "$JSON_OUTPUT" = true ]; then
        echo "    $1,"
    fi
}

# End JSON array (remove trailing comma)
json_array_end() {
    if [ "$JSON_OUTPUT" = true ]; then
        sed -i '$ s/,$//' "$1" 2>/dev/null || true
        echo "  ],"
    fi
}

#==============================================================================
# Health Check Result Functions
#==============================================================================

# Output health check result
output_health_result() {
    local layer=$1
    local status=$2  # "pass" | "fail" | "warn"
    local message=${3:-""}
    local details=${4:-""}
    local execution_time=${5:-0}

    if [ "$JSON_OUTPUT" = true ]; then
        cat <<EOF
  {
    "layer": "$layer",
    "status": "$status",
    "message": "$message",
    "details": "$details",
    "execution_time_ms": $execution_time,
    "timestamp": "$(get_timestamp)"
  },
EOF
    else
        case $status in
            pass)
                log_success "Layer $layer: $message"
                ;;
            fail)
                log_error "Layer $layer: $message"
                ;;
            warn)
                log_warning "Layer $layer: $message"
                ;;
        esac

        if [ -n "$details" ] && [ "$VERBOSE" = true ]; then
            echo "  Details: $details"
        fi

        if [ "$execution_time" -gt 0 ]; then
            echo "  Execution time: ${execution_time}ms"
        fi
    fi
}

# Output final health status
output_final_status() {
    local overall_status=$1  # "healthy" | "warning" | "critical"
    local total_checks=$2
    local passed_checks=$3
    local failed_checks=$4
    local total_time=$5

    if [ "$JSON_OUTPUT" = true ]; then
        cat <<EOF
  "overall_status": "$overall_status",
  "summary": {
    "total_checks": $total_checks,
    "passed": $passed_checks,
    "failed": $failed_checks,
    "execution_time_ms": $total_time
  },
  "recommendation": "$(get_recommendation "$overall_status")"
}
EOF
    else
        echo
        echo "============================================================"
        echo "  Health Check Summary"
        echo "============================================================"
        echo "Overall Status: $overall_status"
        echo "Checks: $passed_checks/$total_checks passed"
        echo "Total Execution Time: ${total_time}ms"
        echo
        echo "Recommendation: $(get_recommendation "$overall_status")"
        echo "============================================================"
    fi
}

# Get recommendation based on status
get_recommendation() {
    local status=$1

    case $status in
        healthy)
            echo "All systems operational. No action required."
            ;;
        warning)
            echo "Some checks failed. Monitor closely and investigate warnings."
            ;;
        critical)
            echo "Critical systems unavailable. Immediate investigation required."
            ;;
        *)
            echo "Unable to determine system status. Manual inspection needed."
            ;;
    esac
}

#==============================================================================
# Docker Container Utilities
#==============================================================================

# Check if Docker container is running
is_container_running() {
    local container_name=$1
    docker ps --format '{{.Names}}' | grep -q "^${container_name}$"
    return $?
}

# Get container health status
get_container_health() {
    local container_name=$1
    docker inspect --format='{{.State.Health.Status}}' "$container_name" 2>/dev/null || echo "unknown"
}

# Execute command in container
exec_in_container() {
    local container_name=$1
    local command=$2

    docker exec "$container_name" bash -c "$command" 2>&1
}

#==============================================================================
# Network Utilities
#==============================================================================

# Check if port is listening
is_port_listening() {
    local port=$1
    local host=${2:-"localhost"}

    timeout 1 bash -c "cat < /dev/null > /dev/tcp/$host/$port" 2>/dev/null
    return $?
}

# HTTP health check
http_health_check() {
    local url=$1
    local expected_status=${2:-200}
    local timeout_sec=${3:-5}

    local response=$(timeout "$timeout_sec" curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)
    [ "$response" = "$expected_status" ]
    return $?
}

#==============================================================================
# Section Display Function
#==============================================================================

log_section() {
    if [ "$JSON_OUTPUT" = false ]; then
        echo
        echo -e "${BLUE}==>${NC} $1"
        echo
    fi
}

#==============================================================================
# Export Functions
#==============================================================================

# Export all functions for use in sourced scripts
export -f log_info log_success log_warning log_error log_retry log_section
export -f get_timestamp execute_with_timeout calculate_backoff
export -f retry_with_backoff
export -f json_start json_add_field json_add_timestamp json_end
export -f json_array_start json_array_add json_array_end
export -f output_health_result output_final_status get_recommendation
export -f is_container_running get_container_health exec_in_container
export -f is_port_listening http_health_check
