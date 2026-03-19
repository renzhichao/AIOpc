#!/bin/bash
#==============================================================================
# Layer 3: Database Query Test
#==============================================================================
# Purpose: Verify PostgreSQL can execute queries
#
# Checks:
# - Execute SELECT 1 query
# - Verify database connection from application perspective
# - Check basic database operations
#
# Usage:
#   ./health-check-layer3.sh [--json] [--verbose]
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
DB_NAME="${DB_NAME:-opclaw}"
DB_USER="${DB_USER:-opclaw}"
TIMEOUT=${LAYER_TIMEOUT:-10}

#==============================================================================
# Functions
#==============================================================================

check_select_one() {
    local start_time=$(date +%s%3N)

    local query_result=$(timeout $TIMEOUT docker exec "$POSTGRES_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT 1 as status;" 2>&1)
    local query_exit=$?

    local end_time=$(date +%s%3N)
    local execution_time=$((end_time - start_time))

    if [ $query_exit -eq 0 ]; then
        # Trim whitespace and verify result is "1"
        local result=$(echo "$query_result" | tr -d '[:space:]')

        if [ "$result" = "1" ]; then
            output_health_result \
                "layer3" \
                "pass" \
                "Database query test passed" \
                "Query: SELECT 1 | Result: $result | Database: $DB_NAME | User: $DB_USER" \
                $execution_time
            return 0
        else
            output_health_result \
                "layer3" \
                "fail" \
                "Unexpected query result" \
                "Expected: 1 | Received: $result | Query: SELECT 1 | Action: Verify database integrity" \
                $execution_time
            return 1
        fi
    else
        output_health_result \
            "layer3" \
            "fail" \
            "Database query failed" \
            "Query: SELECT 1 | Database: $DB_NAME | User: $DB_USER | Error: $query_result | Action: Check database logs and user permissions" \
            $execution_time
        return 1
    fi
}

check_current_timestamp() {
    local start_time=$(date +%s%3N)

    local query_result=$(timeout $TIMEOUT docker exec "$POSTGRES_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT NOW();" 2>&1)
    local query_exit=$?

    local end_time=$(date +%s%3N)
    local execution_time=$((end_time - start_time))

    if [ $query_exit -eq 0 ]; then
        local timestamp=$(echo "$query_result" | tr -d '[:space:]')

        output_health_result \
            "layer3" \
            "pass" \
            "Database timestamp query passed" \
            "Query: SELECT NOW() | Result: $timestamp | Database: $DB_NAME" \
            $execution_time
        return 0
    else
        output_health_result \
            "layer3" \
            "warn" \
            "Database timestamp query failed" \
            "Query: SELECT NOW() | Database: $DB_NAME | Error: $query_result | Action: This may indicate database performance issues" \
            $execution_time
        return 1
    fi
}

check_connection_count() {
    local start_time=$(date +%s%3N)

    local query_result=$(timeout $TIMEOUT docker exec "$POSTGRES_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT count(*) FROM pg_stat_activity;" 2>&1)
    local query_exit=$?

    local end_time=$(date +%s%3N)
    local execution_time=$((end_time - start_time))

    if [ $query_exit -eq 0 ]; then
        local connections=$(echo "$query_result" | tr -d '[:space:]')

        output_health_result \
            "layer3" \
            "pass" \
            "Database connection count retrieved" \
            "Active connections: $connections | Query: SELECT count(*) FROM pg_stat_activity | Database: $DB_NAME" \
            $execution_time
        return 0
    else
        output_health_result \
            "layer3" \
            "warn" \
            "Failed to retrieve connection count" \
            "Error: $query_result | Action: Check pg_stat_activity permissions" \
            $execution_time
        return 1
    fi
}

check_database_size() {
    local start_time=$(date +%s%3N)

    local query_result=$(timeout $TIMEOUT docker exec "$POSTGRES_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT pg_size_pretty(pg_database_size('$DB_NAME'));" 2>&1)
    local query_exit=$?

    local end_time=$(date +%s%3N)
    local execution_time=$((end_time - start_time))

    if [ $query_exit -eq 0 ]; then
        local size=$(echo "$query_result" | tr -d '[:space:]')

        output_health_result \
            "layer3" \
            "pass" \
            "Database size retrieved" \
            "Database size: $size | Database: $DB_NAME" \
            $execution_time
        return 0
    else
        output_health_result \
            "layer3" \
            "info" \
            "Database size query skipped" \
            "Error: $query_result | This is informational only" \
            $execution_time
        return 0
    fi
}

#==============================================================================
# Main Execution
#==============================================================================

main() {
    local overall_status="pass"
    local exit_code=0
    local failed_checks=0

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
    check_select_one || { overall_status="fail"; exit_code=1; ((failed_checks++)); }

    # Run additional checks (non-critical)
    check_current_timestamp || true
    check_connection_count || true
    check_database_size || true

    # End JSON output if enabled
    if [ "$JSON_OUTPUT" = true ]; then
        json_add_field "layer" "3"
        json_add_field "name" "Database Query Test"
        json_add_field "status" "$overall_status"
        json_add_field "failed_checks" "$failed_checks"
        json_end
    fi

    exit $exit_code
}

# Run main function
main "$@"
