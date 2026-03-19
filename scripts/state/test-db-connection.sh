#!/bin/bash
#==============================================================================
# State Database Connection Test Script
# (状态数据库连接测试脚本)
#
# This script tests the connection to the deployment_state database and
# verifies all tables, views, and functions are working correctly.
#
# Usage:
#   ./test-db-connection.sh [options]
#
# Options:
#   -h, --help              Show this help message
#   -v, --verbose           Show detailed output
#   --db-host HOST          Database host
#   --db-port PORT          Database port
#   --db-name NAME          Database name
#   --db-user USER          Database user
#   --db-pass PASS          Database password
#
# Environment Variables:
#   STATE_DB_HOST, STATE_DB_PORT, STATE_DB_NAME, STATE_DB_USER, STATE_DB_PASSWORD
#
# Author: AIOpc DevOps Team
# Created: 2026-03-19
# Version: 1.0.0
#==============================================================================

set -euo pipefail

#------------------------------------------------------------------------------
# Configuration
#------------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Load configuration from .env.state_db if exists
if [ -f "${PROJECT_ROOT}/.env.state_db" ]; then
    source "${PROJECT_ROOT}/.env.state_db"
fi

# Default configuration
DB_HOST="${STATE_DB_HOST:-${POSTGRES_HOST:-localhost}}"
DB_PORT="${STATE_DB_PORT:-${POSTGRES_PORT:-5432}}"
DB_NAME="${STATE_DB_NAME:-deployment_state}"
DB_USER="${STATE_DB_USER:-${POSTGRES_USER:-postgres}}"
DB_PASSWORD="${STATE_DB_PASSWORD:-${POSTGRES_PASSWORD:-}}"

# Flags
VERBOSE=false

#------------------------------------------------------------------------------
# Functions
#------------------------------------------------------------------------------

print_header() {
    echo "=============================================================================="
    echo "$1"
    echo "=============================================================================="
}

print_section() {
    echo ""
    echo ">>> $1"
}

print_success() {
    echo "✓ $1"
}

print_error() {
    echo "✗ $1" >&2
}

print_warning() {
    echo "⚠ $1"
}

show_help() {
    cat << EOF
State Database Connection Test Script

Usage:
    $0 [options]

Options:
    -h, --help              Show this help message
    -v, --verbose           Show detailed output
    --db-host HOST          Database host
    --db-port PORT          Database port
    --db-name NAME          Database name
    --db-user USER          Database user
    --db-pass PASS          Database password

Environment Variables:
    STATE_DB_HOST           Database host
    STATE_DB_PORT           Database port
    STATE_DB_NAME           Database name
    STATE_DB_USER           Database user
    STATE_DB_PASSWORD       Database password

Examples:
    # Test connection to local database
    $0

    # Test connection to remote database with verbose output
    $0 --db-host 118.25.0.190 --db-user opclaw_state --verbose

EOF
}

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

verbose() {
    if [ "${VERBOSE}" = true ]; then
        echo "$1"
    fi
}

# Test database connection
test_connection() {
    print_section "Testing database connection..."

    local test_result
    test_result=$(PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -tAc "SELECT version();" 2>&1)

    if [ $? -eq 0 ]; then
        print_success "Database connection successful"
        verbose "Database version: ${test_result:0:80}..."
        return 0
    else
        print_error "Database connection failed"
        echo "Error: ${test_result}"
        return 1
    fi
}

# Test tables
test_tables() {
    print_section "Testing tables..."

    local expected_tables=(
        "tenants"
        "deployments"
        "deployment_config_snapshots"
        "health_checks"
        "security_audit_log"
        "config_drift_reports"
        "incidents"
        "ssh_key_audit"
    )

    local all_passed=true

    for table in "${expected_tables[@]}"; do
        local exists
        exists=$(PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -tAc "
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = '${table}';
        " 2>&1)

        if [ "${exists}" = "1" ]; then
            print_success "Table '${table}' exists"
        else
            print_error "Table '${table}' missing"
            all_passed=false
        fi
    done

    if [ "${all_passed}" = true ]; then
        print_success "All 8 tables verified"
    else
        return 1
    fi
}

# Test views
test_views() {
    print_section "Testing views..."

    local expected_views=(
        "v_deployment_summary"
        "v_tenant_health"
        "v_recent_security_events"
    )

    local all_passed=true

    for view in "${expected_views[@]}"; do
        local exists
        exists=$(PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -tAc "
            SELECT 1 FROM information_schema.views
            WHERE table_schema = 'public' AND table_name = '${view}';
        " 2>&1)

        if [ "${exists}" = "1" ]; then
            print_success "View '${view}' exists"
        else
            print_error "View '${view}' missing"
            all_passed=false
        fi
    done

    if [ "${all_passed}" = true ]; then
        print_success "All 3 views verified"
    else
        return 1
    fi
}

# Test functions
test_functions() {
    print_section "Testing functions..."

    local expected_functions=(
        "health_check"
        "log_ssh_key_usage"
        "record_tenant"
        "get_deployment_stats"
    )

    local all_passed=true

    for func in "${expected_functions[@]}"; do
        local exists
        exists=$(PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -tAc "
            SELECT 1 FROM information_schema.routines
            WHERE routine_schema = 'public' AND routine_name = '${func}';
        " 2>&1)

        if [ "${exists}" = "1" ]; then
            print_success "Function '${func}()' exists"
        else
            print_error "Function '${func}()' missing"
            all_passed=false
        fi
    done

    if [ "${all_passed}" = true ]; then
        print_success "All 4 functions verified"
    else
        return 1
    fi
}

# Test health_check function
test_health_check_function() {
    print_section "Testing health_check() function..."

    local result
    result=$(PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -tAc "SELECT * FROM health_check();" 2>&1)

    if [ $? -eq 0 ]; then
        local pass_count
        pass_count=$(echo "${result}" | grep -c "pass" || true)

        print_success "health_check() function executed"
        echo "  Passing checks: ${pass_count}/5"

        if [ "${VERBOSE}" = true ]; then
            echo ""
            echo "Detailed results:"
            echo "${result}" | while IFS='|' read -r check_name status details checked_at; do
                local status_symbol="✓"
                if [ "${status}" != "pass" ]; then
                    status_symbol="✗"
                fi
                echo "  ${status_symbol} ${check_name}: ${status}"
            done
        fi

        if [ "${pass_count}" -eq 5 ]; then
            return 0
        else
            print_warning "Some health checks failed"
            return 1
        fi
    else
        print_error "health_check() function failed"
        echo "Error: ${result}"
        return 1
    fi
}

# Test record_tenant function
test_record_tenant_function() {
    print_section "Testing record_tenant() function..."

    local test_tenant_id="test_tenant_$(date +%s)"
    local test_result

    # Insert test tenant
    test_result=$(PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -tAc "
        SELECT record_tenant(
            '${test_tenant_id}',
            'Test Tenant',
            'development',
            'localhost',
            'cli_test123'
        );
    " 2>&1)

    if [ $? -eq 0 ]; then
        print_success "record_tenant() function executed"

        # Verify tenant was created
        local tenant_exists
        tenant_exists=$(PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -tAc "
            SELECT 1 FROM tenants WHERE tenant_id = '${test_tenant_id}';
        " 2>&1)

        if [ "${tenant_exists}" = "1" ]; then
            print_success "Test tenant created successfully"

            # Clean up test tenant
            PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c "
                DELETE FROM tenants WHERE tenant_id = '${test_tenant_id}';
            " > /dev/null 2>&1

            print_success "Test tenant cleaned up"
            return 0
        else
            print_error "Test tenant not found"
            return 1
        fi
    else
        print_error "record_tenant() function failed"
        echo "Error: ${test_result}"
        return 1
    fi
}

# Test indexes
test_indexes() {
    print_section "Testing indexes..."

    local expected_indexes=(
        "idx_tenants_active"
        "idx_deployments_tenant"
        "idx_health_checks_tenant"
        "idx_audit_tenant"
        "idx_drift_tenant"
        "idx_incidents_tenant"
        "idx_ssh_tenant"
    )

    local found_count=0

    for idx in "${expected_indexes[@]}"; do
        local exists
        exists=$(PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -tAc "
            SELECT 1 FROM pg_indexes
            WHERE schemaname = 'public' AND indexname = '${idx}';
        " 2>&1)

        if [ "${exists}" = "1" ]; then
            print_success "Index '${idx}' exists"
            ((found_count++))
        else
            print_warning "Index '${idx}' not found"
        fi
    done

    print_success "Found ${found_count}/${#expected_indexes[@]} expected indexes"
}

# Run performance test
run_performance_test() {
    print_section "Running performance test..."

    local query_time
    query_time=$(PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -tAc "
        EXPLAIN ANALYZE SELECT * FROM v_deployment_summary LIMIT 1;
    " 2>&1 | grep "Execution Time" | awk '{print $3}')

    if [ -n "${query_time}" ]; then
        print_success "Query execution time: ${query_time} ms"

        # Convert to float for comparison
        local query_time_float=$(echo "${query_time}" | awk '{printf "%.2f", $1}')

        if (( $(echo "${query_time_float} < 100" | bc -l) )); then
            print_success "Performance is good (< 100ms)"
            return 0
        else
            print_warning "Query took longer than expected (> 100ms)"
            return 1
        fi
    else
        print_warning "Could not measure query time"
        return 1
    fi
}

# Generate summary report
generate_summary() {
    local total_tests=$1
    local passed_tests=$2
    local failed_tests=$3

    print_header "Test Summary"

    echo ""
    echo "Total Tests:  ${total_tests}"
    echo "Passed:       ${passed_tests}"
    echo "Failed:       ${failed_tests}"
    echo ""

    local pass_rate=0
    if [ ${total_tests} -gt 0 ]; then
        pass_rate=$((passed_tests * 100 / total_tests))
    fi

    echo "Pass Rate:    ${pass_rate}%"
    echo ""

    if [ ${failed_tests} -eq 0 ]; then
        print_success "All tests passed!"
        return 0
    else
        print_error "Some tests failed. Please review the output above."
        return 1
    fi
}

#------------------------------------------------------------------------------
# Parse Arguments
#------------------------------------------------------------------------------

parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            --db-host)
                DB_HOST="$2"
                shift 2
                ;;
            --db-port)
                DB_PORT="$2"
                shift 2
                ;;
            --db-name)
                DB_NAME="$2"
                shift 2
                ;;
            --db-user)
                DB_USER="$2"
                shift 2
                ;;
            --db-pass)
                DB_PASSWORD="$2"
                shift 2
                ;;
            *)
                print_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

#------------------------------------------------------------------------------
# Main Execution
#------------------------------------------------------------------------------

main() {
    parse_arguments "$@"

    print_header "State Database Connection Test"

    cat << EOF

Database Configuration:
  Host:  ${DB_HOST}
  Port:  ${DB_PORT}
  Name:  ${DB_NAME}
  User:  ${DB_USER}

EOF

    local total_tests=0
    local passed_tests=0
    local failed_tests=0

    # Run tests
    if test_connection; then
        ((passed_tests++))
    else
        ((failed_tests++))
    fi
    ((total_tests++))

    if test_tables; then
        ((passed_tests++))
    else
        ((failed_tests++))
    fi
    ((total_tests++))

    if test_views; then
        ((passed_tests++))
    else
        ((failed_tests++))
    fi
    ((total_tests++))

    if test_functions; then
        ((passed_tests++))
    else
        ((failed_tests++))
    fi
    ((total_tests++))

    if test_health_check_function; then
        ((passed_tests++))
    else
        ((failed_tests++))
    fi
    ((total_tests++))

    if test_record_tenant_function; then
        ((passed_tests++))
    else
        ((failed_tests++))
    fi
    ((total_tests++))

    if test_indexes; then
        ((passed_tests++))
    else
        ((failed_tests++))
    fi
    ((total_tests++))

    # Performance test (optional, doesn't affect pass/fail)
    run_performance_test || true

    # Generate summary
    generate_summary ${total_tests} ${passed_tests} ${failed_tests}
    exit $?
}

# Run main function
main "$@"
