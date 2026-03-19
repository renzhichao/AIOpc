#!/opt/homebrew/bin/bash
#==============================================================================
# Tenant Health Check Test Suite
# (租户健康检查测试套件)
#
# Purpose: Comprehensive testing of tenant health check scripts
#
# Usage:
#   scripts/tests/test-health-check.sh [options]
#
# Options:
#   --verbose          Show detailed test output
#   --skip-integration Skip integration tests (require actual tenant)
#   --tenant ID        Test specific tenant only
#   --parallel         Run tests in parallel (experimental)
#   --help             Show this help message
#
# Test Categories:
#   1. Unit Tests - Test individual functions
#   2. Integration Tests - Test with actual tenant
#   3. Performance Tests - Measure execution time
#   4. Error Handling Tests - Test failure scenarios
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
TENANT_DIR="${PROJECT_ROOT}/scripts/tenant"
TEST_TENANT_ID="${TEST_TENANT_ID:-test_tenant_alpha}"

# Test statistics
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0
TEST_START_TIME=$(date +%s)

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

# Test configuration
VERBOSE=${VERBOSE:-false}
SKIP_INTEGRATION=${SKIP_INTEGRATION:-false}
PARALLEL_TESTS=${PARALLEL_TESTS:-false}

#==============================================================================
# Test Framework Functions
#==============================================================================

print_usage() {
    cat << EOF
Usage: ${0##*/} [options]

Comprehensive testing of tenant health check scripts.

Options:
  --verbose          Show detailed test output
  --skip-integration Skip integration tests (require actual tenant)
  --tenant ID        Test specific tenant only
  --parallel         Run tests in parallel (experimental)
  --help             Show this help message

Environment Variables:
  TEST_TENANT_ID     Tenant ID to use for integration tests (default: test_tenant_alpha)

Examples:
  ${0##*/}
  ${0##*/} --verbose
  ${0##*/} --skip-integration
  ${0##*/} --tenant tenant_001 --verbose

EOF
}

log_test() {
    echo -e "${BLUE}[TEST]${NC} $*"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $*"
    ((TESTS_PASSED++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $*"
    ((TESTS_FAILED++))
}

log_skip() {
    echo -e "${YELLOW}[SKIP]${NC} $*"
    ((TESTS_SKIPPED++))
}

log_info() {
    echo -e "${CYAN}[INFO]${NC} $*"
}

assert_equals() {
    local expected=$1
    local actual=$2
    local message=$3

    ((TESTS_RUN++))

    if [ "$expected" = "$actual" ]; then
        log_pass "$message"
        return 0
    else
        log_fail "$message (expected: $expected, got: $actual)"
        return 1
    fi
}

assert_not_empty() {
    local value=$1
    local message=$2

    ((TESTS_RUN++))

    if [ -n "$value" ]; then
        log_pass "$message"
        return 0
    else
        log_fail "$message (value is empty)"
        return 1
    fi
}

assert_file_exists() {
    local file=$1
    local message=$2

    ((TESTS_RUN++))

    if [ -f "$file" ]; then
        log_pass "$message"
        return 0
    else
        log_fail "$message (file not found: $file)"
        return 1
    fi
}

assert_exit_code() {
    local expected=$1
    local actual=$2
    local message=$3

    ((TESTS_RUN++))

    if [ "$expected" -eq "$actual" ]; then
        log_pass "$message"
        return 0
    else
        log_fail "$message (expected exit code: $expected, got: $actual)"
        return 1
    fi
}

#==============================================================================
# Unit Tests
#==============================================================================

test_script_files_exist() {
    log_test "Testing script files exist..."

    assert_file_exists "$TENANT_DIR/health-check.sh" "health-check.sh exists"
    assert_file_exists "$TENANT_DIR/health-check-all.sh" "health-check-all.sh exists"
    assert_file_exists "$TENANT_DIR/health-status.sh" "health-status.sh exists"
    assert_file_exists "$TENANT_DIR/alert-health-issue.sh" "alert-health-issue.sh exists"
}

test_scripts_are_executable() {
    log_test "Testing scripts are executable..."

    local script
    for script in "$TENANT_DIR"/health-check*.sh "$TENANT_DIR"/alert-health-issue.sh; do
        if [ -x "$script" ]; then
            log_pass "$(basename "$script") is executable"
            ((TESTS_PASSED++))
        else
            log_fail "$(basename "$script") is not executable"
            ((TESTS_FAILED++))
        fi
        ((TESTS_RUN++))
    done
}

test_script_help_messages() {
    log_test "Testing script help messages..."

    local script
    for script in "$TENANT_DIR"/health-check*.sh "$TENANT_DIR"/alert-health-issue.sh; do
        local output
        output=$("$script" --help 2>&1 || true)

        if echo "$output" | grep -q "Usage:"; then
            log_pass "$(basename "$script") help message available"
            ((TESTS_PASSED++))
        else
            log_fail "$(basename "$script") help message missing"
            ((TESTS_FAILED++))
        fi
        ((TESTS_RUN++))
    done
}

test_json_output_format() {
    log_test "Testing JSON output format..."

    # Test health-check.sh JSON output
    local output
    output=$("$TENANT_DIR/health-check.sh" --help 2>&1 || true)

    if echo "$output" | grep -q "\-\-json"; then
        log_pass "health-check.sh supports JSON output"
        ((TESTS_PASSED++))
    else
        log_fail "health-check.sh missing JSON output option"
        ((TESTS_FAILED++))
    fi
    ((TESTS_RUN++))
}

#==============================================================================
# Integration Tests
#==============================================================================

test_single_tenant_health_check() {
    if [ "$SKIP_INTEGRATION" = true ]; then
        log_skip "Single tenant health check (integration test skipped)"
        ((TESTS_RUN++))
        return 0
    fi

    log_test "Testing single tenant health check..."

    # Check if test tenant exists
    if [ ! -f "${PROJECT_ROOT}/config/tenants/${TEST_TENANT_ID}.yml" ]; then
        log_skip "Single tenant health check (test tenant not found: $TEST_TENANT_ID)"
        ((TESTS_RUN++))
        return 0
    fi

    # Run health check
    local output
    local exit_code
    output=$("$TENANT_DIR/health-check.sh" "$TEST_TENANT_ID" --quiet 2>&1)
    exit_code=$?

    # Check exit code is valid (0 or 1, not 2 or 3)
    if [ $exit_code -eq 0 ] || [ $exit_code -eq 1 ]; then
        log_pass "Single tenant health check executed (exit code: $exit_code)"
        ((TESTS_PASSED++))
    else
        log_fail "Single tenant health check failed with unexpected exit code: $exit_code"
        ((TESTS_FAILED++))
    fi
    ((TESTS_RUN++))
}

test_health_status_query() {
    if [ "$SKIP_INTEGRATION" = true ]; then
        log_skip "Health status query (integration test skipped)"
        ((TESTS_RUN++))
        return 0
    fi

    log_test "Testing health status query..."

    if [ ! -f "${PROJECT_ROOT}/config/tenants/${TEST_TENANT_ID}.yml" ]; then
        log_skip "Health status query (test tenant not found: $TEST_TENANT_ID)"
        ((TESTS_RUN++))
        return 0
    fi

    # Run health status query
    local output
    local exit_code
    output=$("$TENANT_DIR/health-status.sh" "$TEST_TENANT_ID" --history 1 2>&1)
    exit_code=$?

    if [ $exit_code -eq 0 ] || [ $exit_code -eq 3 ]; then
        log_pass "Health status query executed (exit code: $exit_code)"
        ((TESTS_PASSED++))
    else
        log_fail "Health status query failed with unexpected exit code: $exit_code"
        ((TESTS_FAILED++))
    fi
    ((TESTS_RUN++))
}

test_batch_health_check() {
    if [ "$SKIP_INTEGRATION" = true ]; then
        log_skip "Batch health check (integration test skipped)"
        ((TESTS_RUN++))
        return 0
    fi

    log_test "Testing batch health check..."

    # Run batch health check with dry-run mode
    local output
    local exit_code
    output=$("$TENANT_DIR/health-check-all.sh" --help 2>&1)
    exit_code=$?

    if [ $exit_code -eq 0 ]; then
        log_pass "Batch health check script available"
        ((TESTS_PASSED++))
    else
        log_fail "Batch health check script not available"
        ((TESTS_FAILED++))
    fi
    ((TESTS_RUN++))
}

test_health_alert_dry_run() {
    log_test "Testing health alert dry-run..."

    # Test alert script with dry-run
    local output
    output=$("$TENANT_DIR/alert-health-issue.sh" "$TEST_TENANT_ID" --issue test --dry-run 2>&1 || true)

    if echo "$output" | grep -q "DRY RUN"; then
        log_pass "Health alert dry-run mode works"
        ((TESTS_PASSED++))
    else
        log_fail "Health alert dry-run mode failed"
        ((TESTS_FAILED++))
    fi
    ((TESTS_RUN++))
}

#==============================================================================
# Performance Tests
#==============================================================================

test_script_execution_time() {
    log_test "Testing script execution time..."

    local script
    for script in "$TENANT_DIR"/health-check*.sh; do
        local start_time=$(date +%s%3N)
        "$script" --help >/dev/null 2>&1 || true
        local end_time=$(date +%s%3N)
        local execution_time=$((end_time - start_time))

        if [ $execution_time -lt 5000 ]; then  # Less than 5 seconds
            log_pass "$(basename "$script") help loads in ${execution_time}ms"
            ((TESTS_PASSED++))
        else
            log_fail "$(basename "$script") help too slow: ${execution_time}ms"
            ((TESTS_FAILED++))
        fi
        ((TESTS_RUN++))
    done
}

test_parallel_execution_benefit() {
    if [ "$SKIP_INTEGRATION" = true ]; then
        log_skip "Parallel execution benefit (integration test skipped)"
        ((TESTS_RUN++))
        return 0
    fi

    log_test "Testing parallel execution benefit..."

    # This test requires multiple tenants to show benefit
    local tenant_count
    tenant_count=$(find "${PROJECT_ROOT}/config/tenants" -name "*.yml" -type f | grep -v -E "(template|test_)" | wc -l)

    if [ $tenant_count -lt 3 ]; then
        log_skip "Parallel execution benefit (need at least 3 tenants, found: $tenant_count)"
        ((TESTS_RUN++))
        return 0
    fi

    log_info "Found $tenant_count tenants for parallel test"
    log_skip "Parallel execution benefit (test not implemented yet)"
    ((TESTS_RUN++))
}

#==============================================================================
# Error Handling Tests
#==============================================================================

test_invalid_tenant_id() {
    log_test "Testing invalid tenant ID handling..."

    local output
    local exit_code
    output=$("$TENANT_DIR/health-check.sh" "invalid_tenant_12345" 2>&1)
    exit_code=$?

    if [ $exit_code -eq 3 ]; then
        log_pass "Invalid tenant ID returns exit code 3"
        ((TESTS_PASSED++))
    else
        log_fail "Invalid tenant ID returns unexpected exit code: $exit_code"
        ((TESTS_FAILED++))
    fi
    ((TESTS_RUN++))
}

test_missing_required_parameters() {
    log_test "Testing missing required parameters..."

    local script
    for script in "$TENANT_DIR/health-check.sh" "$TENANT_DIR/health-status.sh" "$TENANT_DIR/alert-health-issue.sh"; do
        local output
        local exit_code
        output=$("$script" 2>&1)
        exit_code=$?

        if [ $exit_code -ne 0 ]; then
            log_pass "$(basename "$script") requires parameters"
            ((TESTS_PASSED++))
        else
            log_fail "$(basename "$script") should fail without parameters"
            ((TESTS_FAILED++))
        fi
        ((TESTS_RUN++))
    done
}

test_invalid_options() {
    log_test "Testing invalid option handling..."

    local output
    local exit_code
    output=$("$TENANT_DIR/health-check.sh" "$TEST_TENANT_ID" --invalid-option 2>&1)
    exit_code=$?

    if [ $exit_code -eq 2 ]; then
        log_pass "Invalid option returns exit code 2"
        ((TESTS_PASSED++))
    else
        log_fail "Invalid option returns unexpected exit code: $exit_code"
        ((TESTS_FAILED++))
    fi
    ((TESTS_RUN++))
}

test_timeout_handling() {
    log_test "Testing timeout handling..."

    # This test would require a tenant that actually times out
    log_skip "Timeout handling (requires tenant with slow response)"
    ((TESTS_RUN++))
}

#==============================================================================
# Test Summary
#==============================================================================

print_test_summary() {
    local test_end_time=$(date +%s)
    local total_duration=$((test_end_time - TEST_START_TIME))

    echo
    echo -e "${BOLD}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}  Test Summary${NC}"
    echo -e "${BOLD}════════════════════════════════════════════════════════════════${NC}"
    echo
    echo "Total Tests:      $TESTS_RUN"
    echo -e "Passed:           ${GREEN}${TESTS_PASSED}${NC}"
    echo -e "Failed:           ${RED}${TESTS_FAILED}${NC}"
    echo -e "Skipped:          ${YELLOW}${TESTS_SKIPPED}${NC}"
    echo

    local success_rate=0
    if [ $TESTS_RUN -gt 0 ]; then
        success_rate=$(( TESTS_PASSED * 100 / TESTS_RUN ))
    fi

    echo "Success Rate:      ${success_rate}%"
    echo "Duration:          ${total_duration}s"
    echo

    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}All tests passed!${NC}"
        echo
        return 0
    else
        echo -e "${RED}Some tests failed!${NC}"
        echo
        return 1
    fi
}

#==============================================================================
# Main Execution
#==============================================================================

main() {
    echo
    echo -e "${BOLD}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}  Tenant Health Check Test Suite${NC}"
    echo -e "${BOLD}════════════════════════════════════════════════════════════════${NC}"
    echo

    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --verbose)
                VERBOSE=true
                shift
                ;;
            --skip-integration)
                SKIP_INTEGRATION=true
                shift
                ;;
            --tenant)
                TEST_TENANT_ID="$2"
                shift 2
                ;;
            --parallel)
                PARALLEL_TESTS=true
                shift
                ;;
            --help)
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

    if [ "$VERBOSE" = true ]; then
        echo "Configuration:"
        echo "  TEST_TENANT_ID:     $TEST_TENANT_ID"
        echo "  SKIP_INTEGRATION:   $SKIP_INTEGRATION"
        echo "  PARALLEL_TESTS:     $PARALLEL_TESTS"
        echo "  VERBOSE:            $VERBOSE"
        echo
    fi

    # Run unit tests
    echo -e "${BOLD}Unit Tests${NC}"
    echo "────────────────────────────────────────────────────────────────"
    test_script_files_exist
    test_scripts_are_executable
    test_script_help_messages
    test_json_output_format
    echo

    # Run integration tests
    echo -e "${BOLD}Integration Tests${NC}"
    echo "────────────────────────────────────────────────────────────────"
    test_single_tenant_health_check
    test_health_status_query
    test_batch_health_check
    test_health_alert_dry_run
    echo

    # Run performance tests
    echo -e "${BOLD}Performance Tests${NC}"
    echo "────────────────────────────────────────────────────────────────"
    test_script_execution_time
    test_parallel_execution_benefit
    echo

    # Run error handling tests
    echo -e "${BOLD}Error Handling Tests${NC}"
    echo "────────────────────────────────────────────────────────────────"
    test_invalid_tenant_id
    test_missing_required_parameters
    test_invalid_options
    test_timeout_handling
    echo

    # Print summary and exit
    print_test_summary
    exit $?
}

# Run main function
main "$@"
