#!/bin/bash
#==============================================================================
# Layer 1: HTTP Health Check
#==============================================================================
# Purpose: Verify HTTP health endpoint is responding
#
# Checks:
# - Backend container is running
# - HTTP 200 response from /health endpoint
# - Response contains valid JSON
#
# Usage:
#   ./health-check-layer1.sh [--json] [--verbose]
#
# Exit codes:
#   0: Check passed
#   1: Check failed
#   2: Configuration error
#==============================================================================

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$(dirname "$SCRIPT_DIR")/lib"

# Source health check library
source "$LIB_DIR/health-check.sh"

#==============================================================================
# Configuration
#==============================================================================

BACKEND_CONTAINER="${BACKEND_CONTAINER:-opclaw-backend}"
HEALTH_URL="${HEALTH_URL:-http://localhost:3000/health}"
TIMEOUT=${LAYER_TIMEOUT:-10}

#==============================================================================
# Functions
#==============================================================================

check_container_running() {
    if is_container_running "$BACKEND_CONTAINER"; then
        output_health_result \
            "layer1" \
            "pass" \
            "Backend container running" \
            "Container: $BACKEND_CONTAINER" \
            0
        return 0
    else
        output_health_result \
            "layer1" \
            "fail" \
            "Backend container not running" \
            "Container: $BACKEND_CONTAINER | Action: docker start $BACKEND_CONTAINER" \
            0
        return 1
    fi
}

check_http_response() {
    local start_time=$(date +%s%3N)

    local response_code=$(timeout $TIMEOUT curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "000")
    local end_time=$(date +%s%3N)
    local execution_time=$((end_time - start_time))

    if [ "$response_code" = "200" ]; then
        output_health_result \
            "layer1" \
            "pass" \
            "HTTP health endpoint responding" \
            "URL: $HEALTH_URL | Status: $response_code | Response time: ${execution_time}ms" \
            $execution_time
        return 0
    else
        output_health_result \
            "layer1" \
            "fail" \
            "HTTP health endpoint not responding" \
            "URL: $HEALTH_URL | Expected: 200 | Received: $response_code | Action: Check backend logs: docker logs $BACKEND_CONTAINER" \
            $execution_time
        return 1
    fi
}

check_json_response() {
    local start_time=$(date +%s%3N)

    local response=$(timeout $TIMEOUT curl -s "$HEALTH_URL" 2>/dev/null || echo "{}")
    local end_time=$(date +%s%3N)
    local execution_time=$((end_time - start_time))

    if echo "$response" | jq -e '.status' >/dev/null 2>&1; then
        local status=$(echo "$response" | jq -r '.status')

        if [ "$status" = "ok" ]; then
            output_health_result \
                "layer1" \
                "pass" \
                "Valid JSON response received" \
                "Status: $status | Database: $(echo "$response" | jq -r '.database // "unknown") | Redis: $(echo "$response" | jq -r '.redis // "unknown") | Uptime: $(echo "$response" | jq -r '.uptime // "unknown"')s" \
                $execution_time
            return 0
        else
            output_health_result \
                "layer1" \
                "warn" \
                "JSON response indicates issue" \
                "Status: $status | Full response: $response | Action: Check service logs" \
                $execution_time
            return 1
        fi
    else
        output_health_result \
            "layer1" \
            "fail" \
            "Invalid JSON response" \
            "Response: $response | Action: Verify backend service health" \
            $execution_time
        return 1
    fi
}

#==============================================================================
# Main Execution
#==============================================================================

main() {
    local overall_status="pass"
    local exit_code=0

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --json)
                JSON_OUTPUT=true
                shift
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            *)
                echo "Unknown option: $1"
                exit 2
                ;;
        esac
    done

    # Start JSON output if enabled
    if [ "$JSON_OUTPUT" = true ]; then
        json_start
        json_add_timestamp "check_start"
    fi

    # Run checks
    check_container_running || { overall_status="fail"; exit_code=1; }
    check_http_response || { overall_status="fail"; exit_code=1; }
    check_json_response || { overall_status="fail"; exit_code=1; }

    # End JSON output if enabled
    if [ "$JSON_OUTPUT" = true ]; then
        # Remove trailing comma and add layer result
        sed -i '$ s/,$//' <<<"" 2>/dev/null || true
        json_add_field "layer" "1"
        json_add_field "name" "HTTP Health Check"
        json_add_field "status" "$overall_status"
        json_end
    fi

    exit $exit_code
}

# Run main function
main "$@"
