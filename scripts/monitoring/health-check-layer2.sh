#!/bin/bash
#==============================================================================
# Layer 2: Database Connection Check
#==============================================================================
# Purpose: Verify PostgreSQL container is accepting connections
#
# Checks:
# - PostgreSQL container is running
# - pg_isready reports accepting connections
# - Port 5432 is listening
#
# Usage:
#   ./health-check-layer2.sh [--json] [--verbose]
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

POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-opclaw-postgres}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-opclaw}"
TIMEOUT=${LAYER_TIMEOUT:-10}

#==============================================================================
# Functions
#==============================================================================

check_container_running() {
    if is_container_running "$POSTGRES_CONTAINER"; then
        output_health_result \
            "layer2" \
            "pass" \
            "PostgreSQL container running" \
            "Container: $POSTGRES_CONTAINER" \
            0
        return 0
    else
        output_health_result \
            "layer2" \
            "fail" \
            "PostgreSQL container not running" \
            "Container: $POSTGRES_CONTAINER | Action: docker start $POSTGRES_CONTAINER" \
            0
        return 1
    fi
}

check_port_listening() {
    local start_time=$(date +%s%3N)

    if is_port_listening "$DB_PORT" "$DB_HOST"; then
        local end_time=$(date +%s%3N)
        local execution_time=$((end_time - start_time))

        output_health_result \
            "layer2" \
            "pass" \
            "PostgreSQL port listening" \
            "Host: $DB_HOST:$DB_PORT | Connection successful" \
            $execution_time
        return 0
    else
        output_health_result \
            "layer2" \
            "fail" \
            "PostgreSQL port not listening" \
            "Host: $DB_HOST:$DB_PORT | Action: Check container logs: docker logs $POSTGRES_CONTAINER" \
            0
        return 1
    fi
}

check_pg_isready() {
    local start_time=$(date +%s%3N)

    local pg_ready_output=$(timeout $TIMEOUT docker exec "$POSTGRES_CONTAINER" pg_isready -U "$DB_USER" 2>&1)
    local pg_ready_exit=$?

    local end_time=$(date +%s%3N)
    local execution_time=$((end_time - start_time))

    if [ $pg_ready_exit -eq 0 ]; then
        # Extract socket and port info
        local socket_info=$(echo "$pg_ready_output" | grep -oP 'accepting connections on \K.*')

        output_health_result \
            "layer2" \
            "pass" \
            "PostgreSQL accepting connections" \
            "User: $DB_USER | Socket: $socket_info | Command: pg_isready -U $DB_USER" \
            $execution_time
        return 0
    else
        output_health_result \
            "layer2" \
            "fail" \
            "PostgreSQL not ready" \
            "User: $DB_USER | Output: $pg_ready_output | Action: Check container health: docker inspect --format='{{.State.Health.Status}}' $POSTGRES_CONTAINER" \
            $execution_time
        return 1
    fi
}

check_container_health() {
    local health_status=$(get_container_health "$POSTGRES_CONTAINER")

    if [ "$health_status" = "healthy" ]; then
        output_health_result \
            "layer2" \
            "pass" \
            "PostgreSQL container healthy" \
            "Container health: $health_status" \
            0
        return 0
    elif [ "$health_status" = "unknown" ]; then
        output_health_result \
            "layer2" \
            "warn" \
            "PostgreSQL container health unknown" \
            "Container health: $health_status (no healthcheck configured or not yet run)" \
            0
        return 0
    else
        output_health_result \
            "layer2" \
            "fail" \
            "PostgreSQL container unhealthy" \
            "Container health: $health_status | Action: Check logs: docker logs $POSTGRES_CONTAINER --tail 50" \
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

    # Run checks
    check_container_running || { overall_status="fail"; exit_code=1; }
    check_port_listening || { overall_status="fail"; exit_code=1; }
    check_pg_isready || { overall_status="fail"; exit_code=1; }
    check_container_health || { overall_status="fail"; exit_code=1; }

    # End JSON output if enabled
    if [ "$JSON_OUTPUT" = true ]; then
        json_add_field "layer" "2"
        json_add_field "name" "Database Connection Check"
        json_add_field "status" "$overall_status"
        json_end
    fi

    exit $exit_code
}

# Run main function
main "$@"
