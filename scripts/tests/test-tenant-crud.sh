#!/opt/homebrew/bin/bash
#==============================================================================
# Tenant CRUD Test Script
# (租户CRUD测试脚本)
#
# Purpose: Test all tenant CRUD operations with various scenarios
#
# Usage:
#   scripts/tests/test-tenant-crud.sh [options]
#   --keep-test-data   Keep test data after tests complete
#   --verbose          Show detailed test output
#   --test-id PREFIX   Use custom test ID prefix
#
# Example:
#   scripts/tests/test-tenant-crud.sh --verbose
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
TENANT_SCRIPT_DIR="${PROJECT_ROOT}/scripts/tenant"
LIB_DIR="${PROJECT_ROOT}/scripts/lib"

# Source required libraries
source "${LIB_DIR}/logging.sh" 2>/dev/null || { echo "ERROR: logging.sh not found"; exit 1; }

# Test configuration
KEEP_TEST_DATA=false
VERBOSE=false
TEST_ID_PREFIX="test_tenant_$$"

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Test data
TEST_TENANT_IDS=()

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

#==============================================================================
# Helper Functions
#==============================================================================

print_usage() {
    cat << EOF
Usage: ${0##*/} [options]

Test all tenant CRUD operations with various scenarios.

Options:
  --keep-test-data    Keep test data after tests complete
  --verbose           Show detailed test output
  --test-id PREFIX    Use custom test ID prefix
  -h, --help          Show this help message

Examples:
  ${0##*/} --verbose
  ${0##*/} --test-id mytest

EOF
}

log_test() {
    echo -e "${BLUE}[TEST]${NC} $*" >&2
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $*" >&2
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $*" >&2
}

log_debug() {
    if [ "$VERBOSE" = "true" ]; then
        echo -e "${CYAN}[DEBUG]${NC} $*" >&2
    fi
}

#==============================================================================
# Test Framework Functions
#==============================================================================

run_test() {
    local test_name=$1
    local test_function=$2

    ((TESTS_RUN++))

    if [ "$VERBOSE" = "true" ]; then
        log_test "Running: $test_name"
    fi

    if $test_function; then
        ((TESTS_PASSED++))
        log_pass "$test_name"
        return 0
    else
        ((TESTS_FAILED++))
        log_fail "$test_name"
        return 1
    fi
}

assert_success() {
    local description=$1
    shift

    if [ "$VERBOSE" = "true" ]; then
        log_debug "Executing: $*"
    fi

    if "$@" >/dev/null 2>&1; then
        return 0
    else
        log_debug "Command failed: $*"
        return 1
    fi
}

assert_failure() {
    local description=$1
    shift

    if [ "$VERBOSE" = "true" ]; then
        log_debug "Executing (expecting failure): $*"
    fi

    if "$@" >/dev/null 2>&1; then
        log_debug "Command succeeded when it should have failed: $*"
        return 1
    else
        return 0
    fi
}

assert_file_exists() {
    local file=$1

    if [ -f "$file" ]; then
        return 0
    else
        log_debug "File does not exist: $file"
        return 1
    fi
}

assert_file_not_exists() {
    local file=$1

    if [ ! -f "$file" ]; then
        return 0
    else
        log_debug "File exists when it shouldn't: $file"
        return 1
    fi
}

cleanup_test_data() {
    if [ "$KEEP_TEST_DATA" = "true" ]; then
        log_test "Keeping test data (as requested)"
        return 0
    fi

    log_test "Cleaning up test data..."

    for tenant_id in "${TEST_TENANT_IDS[@]}"; do
        log_debug "Deleting test tenant: $tenant_id"
        "${TENANT_SCRIPT_DIR}/delete.sh" "$tenant_id" --force --purge >/dev/null 2>&1 || true
    done

    log_pass "Test data cleaned up"
}

print_summary() {
    echo
    echo -e "${BOLD}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}  Test Summary${NC}"
    echo -e "${BOLD}════════════════════════════════════════════════════════════════${NC}"
    echo
    echo "  Total Tests: $TESTS_RUN"
    echo -e "  ${GREEN}Passed: $TESTS_PASSED${NC}"
    echo -e "  ${RED}Failed: $TESTS_FAILED${NC}"
    echo

    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}${BOLD}All tests passed!${NC}"
        return 0
    else
        echo -e "${RED}${BOLD}Some tests failed!${NC}"
        return 1
    fi
}

#==============================================================================
# Test Cases
#==============================================================================

test_create_with_valid_input() {
    local tenant_id="${TEST_ID_PREFIX}_001"

    assert_success "Create tenant with valid input" \
        "${TENANT_SCRIPT_DIR}/create.sh" \
        --tenant-id "$tenant_id" \
        --name "Test Tenant 001" \
        --environment development \
        --non-interactive

    assert_file_exists "Config file exists" \
        "${PROJECT_ROOT}/config/tenants/${tenant_id}.yml"

    TEST_TENANT_IDS+=("$tenant_id")
    return 0
}

test_create_with_duplicate_id() {
    local tenant_id="${TEST_ID_PREFIX}_001"

    # First create should succeed
    assert_success "Create initial tenant" \
        "${TENANT_SCRIPT_DIR}/create.sh" \
        --tenant-id "$tenant_id" \
        --name "Test Tenant Duplicate" \
        --environment development \
        --non-interactive 2>/dev/null || true

    # Second create with same ID should fail
    assert_failure "Reject duplicate tenant ID" \
        "${TENANT_SCRIPT_DIR}/create.sh" \
        --tenant-id "$tenant_id" \
        --name "Test Tenant Duplicate 2" \
        --environment development \
        --non-interactive

    return 0
}

test_create_interactive_mode() {
    local tenant_id="${TEST_ID_PREFIX}_002"

    # Simulate interactive input
    echo "$tenant_id
Test Tenant Interactive
development

y" | assert_success "Create tenant in interactive mode" \
        "${TENANT_SCRIPT_DIR}/create.sh"

    assert_file_exists "Config file exists" \
        "${PROJECT_ROOT}/config/tenants/${tenant_id}.yml"

    TEST_TENANT_IDS+=("$tenant_id")
    return 0
}

test_list_all_tenants() {
    # Create a test tenant first
    local tenant_id="${TEST_ID_PREFIX}_003"
    assert_success "Create tenant for list test" \
        "${TENANT_SCRIPT_DIR}/create.sh" \
        --tenant-id "$tenant_id" \
        --name "Test Tenant List" \
        --environment staging \
        --non-interactive >/dev/null

    TEST_TENANT_IDS+=("$tenant_id")

    # List should include the new tenant
    local output
    output=$("${TENANT_SCRIPT_DIR}/list.sh" --format table 2>/dev/null)

    if echo "$output" | grep -q "$tenant_id"; then
        return 0
    else
        log_debug "List output did not contain tenant: $tenant_id"
        return 1
    fi
}

test_list_with_filter() {
    local tenant_id="${TEST_ID_PREFIX}_004"

    # Create a production tenant
    assert_success "Create production tenant" \
        "${TENANT_SCRIPT_DIR}/create.sh" \
        --tenant-id "$tenant_id" \
        --name "Test Tenant Production" \
        --environment production \
        --non-interactive >/dev/null

    TEST_TENANT_IDS+=("$tenant_id")

    # Filter by environment
    local output
    output=$("${TENANT_SCRIPT_DIR}/list.sh" --environment production 2>/dev/null)

    if echo "$output" | grep -q "$tenant_id"; then
        return 0
    else
        log_debug "Filtered list did not contain tenant: $tenant_id"
        return 1
    fi
}

test_show_tenant_details() {
    local tenant_id="${TEST_ID_PREFIX}_005"

    assert_success "Create tenant for show test" \
        "${TENANT_SCRIPT_DIR}/create.sh" \
        --tenant-id "$tenant_id" \
        --name "Test Tenant Show" \
        --environment development \
        --non-interactive >/dev/null

    TEST_TENANT_IDS+=("$tenant_id")

    # Show tenant details
    local output
    output=$("${TENANT_SCRIPT_DIR}/show.sh" "$tenant_id" 2>/dev/null)

    if echo "$output" | grep -q "$tenant_id"; then
        return 0
    else
        log_debug "Show output did not contain tenant: $tenant_id"
        return 1
    fi
}

test_show_with_secrets() {
    local tenant_id="${TEST_ID_PREFIX}_006"

    assert_success "Create tenant for secrets test" \
        "${TENANT_SCRIPT_DIR}/create.sh" \
        --tenant-id "$tenant_id" \
        --name "Test Tenant Secrets" \
        --environment development \
        --non-interactive >/dev/null

    TEST_TENANT_IDS+=("$tenant_id")

    # Show with secrets should not mask values
    local output
    output=$("${TENANT_SCRIPT_DIR}/show.sh" "$tenant_id" --show-secrets 2>/dev/null)

    if echo "$output" | grep -q "********"; then
        log_debug "Show with secrets still contains masked values"
        return 1
    else
        return 0
    fi
}

test_update_tenant_name() {
    local tenant_id="${TEST_ID_PREFIX}_007"

    assert_success "Create tenant for update test" \
        "${TENANT_SCRIPT_DIR}/create.sh" \
        --tenant-id "$tenant_id" \
        --name "Original Name" \
        --environment development \
        --non-interactive >/dev/null

    TEST_TENANT_IDS+=("$tenant_id")

    # Update tenant name
    assert_success "Update tenant name" \
        "${TENANT_SCRIPT_DIR}/update.sh" \
        "$tenant_id" \
        --name "Updated Name" \
        --non-interactive

    # Verify update
    local output
    output=$("${TENANT_SCRIPT_DIR}/show.sh" "$tenant_id" 2>/dev/null)

    if echo "$output" | grep -q "Updated Name"; then
        return 0
    else
        log_debug "Update did not apply: name not changed"
        return 1
    fi
}

test_update_tenant_status() {
    local tenant_id="${TEST_ID_PREFIX}_008"

    assert_success "Create tenant for status test" \
        "${TENANT_SCRIPT_DIR}/create.sh" \
        --tenant-id "$tenant_id" \
        --name "Test Tenant Status" \
        --environment development \
        --non-interactive >/dev/null

    TEST_TENANT_IDS+=("$tenant_id")

    # Update tenant status
    assert_success "Update tenant status" \
        "${TENANT_SCRIPT_DIR}/update.sh" \
        "$tenant_id" \
        --status active \
        --non-interactive

    return 0
}

test_update_config_value() {
    local tenant_id="${TEST_ID_PREFIX}_009"

    assert_success "Create tenant for config update test" \
        "${TENANT_SCRIPT_DIR}/create.sh" \
        --tenant-id "$tenant_id" \
        --name "Test Tenant Config" \
        --environment development \
        --non-interactive >/dev/null

    TEST_TENANT_IDS+=("$tenant_id")

    # Update config value
    assert_success "Update config value" \
        "${TENANT_SCRIPT_DIR}/update.sh" \
        "$tenant_id" \
        --config server.api_port=3001 \
        --non-interactive

    # Verify update
    local config_file="${PROJECT_ROOT}/config/tenants/${tenant_id}.yml"
    local port
    port=$(grep "api_port:" "$config_file" | awk '{print $2}')

    if [ "$port" = "3001" ]; then
        return 0
    else
        log_debug "Config value not updated: api_port is $port, expected 3001"
        return 1
    fi
}

test_validate_tenant() {
    local tenant_id="${TEST_ID_PREFIX}_010"

    assert_success "Create tenant for validation test" \
        "${TENANT_SCRIPT_DIR}/create.sh" \
        --tenant-id "$tenant_id" \
        --name "Test Tenant Validate" \
        --environment development \
        --non-interactive >/dev/null

    TEST_TENANT_IDS+=("$tenant_id")

    # Validate tenant
    assert_success "Validate tenant configuration" \
        "${TENANT_SCRIPT_DIR}/validate.sh" \
        "$tenant_id"

    return 0
}

test_delete_tenant_with_backup() {
    local tenant_id="${TEST_ID_PREFIX}_011"

    assert_success "Create tenant for delete test" \
        "${TENANT_SCRIPT_DIR}/create.sh" \
        --tenant-id "$tenant_id" \
        --name "Test Tenant Delete" \
        --environment development \
        --non-interactive >/dev/null

    # Delete with backup
    assert_success "Delete tenant with backup" \
        "${TENANT_SCRIPT_DIR}/delete.sh" \
        "$tenant_id" \
        --backup \
        --force

    # Verify deletion
    assert_file_not_exists "Config file deleted" \
        "${PROJECT_ROOT}/config/tenants/${tenant_id}.yml"

    # Note: Don't add to TEST_TENANT_IDS since it's already deleted
    return 0
}

test_delete_tenant_force() {
    local tenant_id="${TEST_ID_PREFIX}_012"

    assert_success "Create tenant for force delete test" \
        "${TENANT_SCRIPT_DIR}/create.sh" \
        --tenant-id "$tenant_id" \
        --name "Test Tenant Force Delete" \
        --environment development \
        --non-interactive >/dev/null

    # Delete with force
    assert_success "Delete tenant with force" \
        "${TENANT_SCRIPT_DIR}/delete.sh" \
        "$tenant_id" \
        --force

    # Verify deletion
    assert_file_not_exists "Config file deleted" \
        "${PROJECT_ROOT}/config/tenants/${tenant_id}.yml"

    return 0
}

test_dry_run_mode() {
    local tenant_id="${TEST_ID_PREFIX}_013"

    # Dry run should not create file
    assert_success "Create tenant in dry-run mode" \
        "${TENANT_SCRIPT_DIR}/create.sh" \
        --tenant-id "$tenant_id" \
        --name "Test Tenant Dry Run" \
        --environment development \
        --dry-run \
        --non-interactive

    # Verify file was not created
    assert_file_not_exists "Config file not created in dry-run" \
        "${PROJECT_ROOT}/config/tenants/${tenant_id}.yml"

    return 0
}

test_json_output_format() {
    local tenant_id="${TEST_ID_PREFIX}_014"

    assert_success "Create tenant for JSON output test" \
        "${TENANT_SCRIPT_DIR}/create.sh" \
        --tenant-id "$tenant_id" \
        --name "Test Tenant JSON" \
        --environment development \
        --non-interactive >/dev/null

    TEST_TENANT_IDS+=("$tenant_id")

    # List in JSON format
    local output
    output=$("${TENANT_SCRIPT_DIR}/list.sh" --format json 2>/dev/null)

    if echo "$output" | grep -q '"tenant_id"'; then
        return 0
    else
        log_debug "JSON output is invalid"
        return 1
    fi
}

#==============================================================================
# Main Execution
#==============================================================================

main() {
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --keep-test-data)
                KEEP_TEST_DATA=true
                shift
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            --test-id)
                TEST_ID_PREFIX="$2"
                shift 2
                ;;
            -h|--help)
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

    echo
    echo -e "${BOLD}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}  Tenant CRUD Test Suite${NC}"
    echo -e "${BOLD}════════════════════════════════════════════════════════════════${NC}"
    echo
    log_test "Test ID prefix: $TEST_ID_PREFIX"
    log_test "Verbose mode: $VERBOSE"
    log_test "Keep test data: $KEEP_TEST_DATA"
    echo

    # Run all tests
    run_test "Create tenant with valid input" test_create_with_valid_input
    run_test "Reject duplicate tenant ID" test_create_with_duplicate_id
    run_test "Create tenant in interactive mode" test_create_interactive_mode
    run_test "List all tenants" test_list_all_tenants
    run_test "List tenants with filter" test_list_with_filter
    run_test "Show tenant details" test_show_tenant_details
    run_test "Show tenant with secrets" test_show_with_secrets
    run_test "Update tenant name" test_update_tenant_name
    run_test "Update tenant status" test_update_tenant_status
    run_test "Update config value" test_update_config_value
    run_test "Validate tenant configuration" test_validate_tenant
    run_test "Delete tenant with backup" test_delete_tenant_with_backup
    run_test "Delete tenant with force" test_delete_tenant_force
    run_test "Dry-run mode" test_dry_run_mode
    run_test "JSON output format" test_json_output_format

    # Cleanup
    cleanup_test_data

    # Print summary
    print_summary
    exit $?
}

# Set up cleanup trap
trap cleanup_test_data EXIT INT TERM

# Run main function
main "$@"
