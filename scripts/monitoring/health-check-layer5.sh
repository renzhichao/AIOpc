#!/bin/bash
#==============================================================================
# Layer 5: Redis Connection Check
#==============================================================================
# Purpose: Verify Redis cache service is operational
#
# Checks:
# - Redis container is running
# - Redis PING command responds
# - Redis is accepting connections on port 6379
# - Redis AUTH is working (if password is set)
#
# Usage:
#   ./health-check-layer5.sh [--json] [--verbose]
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

REDIS_CONTAINER="${REDIS_CONTAINER:-opclaw-redis}"
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
TIMEOUT=${LAYER_TIMEOUT:-10}

#==============================================================================
# Functions
#==============================================================================

check_container_running() {
    if is_container_running "$REDIS_CONTAINER"; then
        output_health_result \
            "layer5" \
            "pass" \
            "Redis container running" \
            "Container: $REDIS_CONTAINER" \
            0
        return 0
    else
        output_health_result \
            "layer5" \
            "fail" \
            "Redis container not running" \
            "Container: $REDIS_CONTAINER | Action: docker start $REDIS_CONTAINER" \
            0
        return 1
    fi
}

check_port_listening() {
    local start_time=$(date +%s%3N)

    if is_port_listening "$REDIS_PORT" "$REDIS_HOST"; then
        local end_time=$(date +%s%3N)
        local execution_time=$((end_time - start_time))

        output_health_result \
            "layer5" \
            "pass" \
            "Redis port listening" \
            "Host: $REDIS_HOST:$REDIS_PORT | Connection successful" \
            $execution_time
        return 0
    else
        output_health_result \
            "layer5" \
            "fail" \
            "Redis port not listening" \
            "Host: $REDIS_HOST:$REDIS_PORT | Action: Check container: docker logs $REDIS_CONTAINER" \
            0
        return 1
    fi
}

check_redis_ping() {
    local start_time=$(date +%s%3N)

    # Try PING without auth first
    local ping_response=$(timeout $TIMEOUT docker exec "$REDIS_CONTAINER" redis-cli PING 2>&1)
    local ping_exit=$?

    local end_time=$(date +%s%3N)
    local execution_time=$((end_time - start_time))

    if [ $ping_exit -eq 0 ] && [ "$ping_response" = "PONG" ]; then
        output_health_result \
            "layer5" \
            "pass" \
            "Redis PING successful" \
            "Response: $ping_response | Auth: Not required" \
            $execution_time
        return 0
    elif echo "$ping_response" | grep -qi "NOAUTH"; then
        # Redis requires authentication
        output_health_result \
            "layer5" \
            "warn" \
            "Redis requires authentication" \
            "Response: $ping_response | Action: Test with auth: docker exec $REDIS_CONTAINER redis-cli -a \$REDIS_PASSWORD PING" \
            $execution_time
        return 0  # Warning is not a failure
    else
        output_health_result \
            "layer5" \
            "fail" \
            "Redis PING failed" \
            "Exit code: $ping_exit | Response: $ping_response | Action: Check Redis logs: docker logs $REDIS_CONTAINER" \
            $execution_time
        return 1
    fi
}

check_redis_auth() {
    # Get Redis password from environment
    local redis_password=$(docker exec "$REDIS_CONTAINER" bash -c "echo \$REDIS_PASSWORD" 2>/dev/null || echo "")

    if [ -z "$redis_password" ]; then
        output_health_result \
            "layer5" \
            "info" \
            "Redis password not set" \
            "Action: Consider setting REDIS_PASSWORD for production security" \
            0
        return 0
    fi

    local start_time=$(date +%s%3N)

    # Test PING with authentication
    local ping_response=$(timeout $TIMEOUT docker exec "$REDIS_CONTAINER" redis-cli -a "$redis_password" PING 2>&1)
    local ping_exit=$?

    local end_time=$(date +%s%3N)
    local execution_time=$((end_time - start_time))

    if [ $ping_exit -eq 0 ] && [ "$ping_response" = "PONG" ]; then
        output_health_result \
            "layer5" \
            "pass" \
            "Redis authentication successful" \
            "Response: $ping_response | Auth: Required and working" \
            $execution_time
        return 0
    else
        output_health_result \
            "layer5" \
            "fail" \
            "Redis authentication failed" \
            "Exit code: $ping_exit | Response: $ping_response | Action: Verify REDIS_PASSWORD in environment" \
            $execution_time
        return 1
    fi
}

check_redis_info() {
    local start_time=$(date +%s%3N)

    # Get Redis INFO
    local redis_info=$(timeout $TIMEOUT docker exec "$REDIS_CONTAINER" redis-cli INFO server 2>&1)
    local info_exit=$?

    local end_time=$(date +%s%3N)
    local execution_time=$((end_time - start_time))

    if [ $info_exit -eq 0 ]; then
        # Extract Redis version
        local redis_version=$(echo "$redis_info" | grep "^redis_version:" | cut -d':' -f2 | tr -d '\r')

        output_health_result \
            "layer5" \
            "pass" \
            "Redis server info retrieved" \
            "Version: $redis_version | Command: redis-cli INFO server" \
            $execution_time
        return 0
    else
        output_health_result \
            "layer5" \
            "warn" \
            "Failed to retrieve Redis info" \
            "Error: $redis_info | Action: Check Redis server status" \
            $execution_time
        return 0  # Warning is not a failure
    fi
}

check_redis_memory() {
    local start_time=$(date +%s%3N)

    # Get Redis memory info
    local redis_info=$(timeout $TIMEOUT docker exec "$REDIS_CONTAINER" redis-cli INFO memory 2>&1)
    local info_exit=$?

    local end_time=$(date +%s%3N)
    local execution_time=$((end_time - start_time))

    if [ $info_exit -eq 0 ]; then
        # Extract memory usage
        local used_memory=$(echo "$redis_info" | grep "^used_memory_human:" | cut -d':' -f2 | tr -d '\r')
        local max_memory=$(echo "$redis_info" | grep "^maxmemory_human:" | cut -d':' -f2 | tr -d '\r')

        output_health_result \
            "layer5" \
            "pass" \
            "Redis memory usage retrieved" \
            "Used: $used_memory | Max: ${max_memory:-unlimited} | Command: redis-cli INFO memory" \
            $execution_time
        return 0
    else
        output_health_result \
            "layer5" \
            "info" \
            "Redis memory info skipped" \
            "This is informational only" \
            $execution_time
        return 0
    fi
}

check_container_health() {
    local health_status=$(get_container_health "$REDIS_CONTAINER")

    if [ "$health_status" = "healthy" ]; then
        output_health_result \
            "layer5" \
            "pass" \
            "Redis container healthy" \
            "Container health: $health_status" \
            0
        return 0
    elif [ "$health_status" = "unknown" ]; then
        output_health_result \
            "layer5" \
            "warn" \
            "Redis container health unknown" \
            "Container health: $health_status (no healthcheck configured or not yet run)" \
            0
        return 0
    else
        output_health_result \
            "layer5" \
            "fail" \
            "Redis container unhealthy" \
            "Container health: $health_status | Action: Check logs: docker logs $REDIS_CONTAINER --tail 50" \
            0
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

    # Run critical checks
    check_container_running || { overall_status="fail"; exit_code=1; }
    check_port_listening || { overall_status="fail"; exit_code=1; }
    check_redis_ping || { overall_status="fail"; exit_code=1; }
    check_container_health || { overall_status="fail"; exit_code=1; }

    # Run additional checks (non-critical)
    check_redis_auth || true
    check_redis_info || true
    check_redis_memory || true

    # End JSON output if enabled
    if [ "$JSON_OUTPUT" = true ]; then
        json_add_field "layer" "5"
        json_add_field "name" "Redis Connection Check"
        json_add_field "status" "$overall_status"
        json_end
    fi

    exit $exit_code
}

# Run main function
main "$@"
