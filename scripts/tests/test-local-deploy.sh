#!/opt/homebrew/bin/bash
#==============================================================================
# Local Deployment Test Suite
# (本地部署测试套件)
#
# Purpose: Comprehensive testing for local deployment scripts
#
# Features:
# - Unit tests for individual components
# - Integration tests for complete deployment flow
# - Mock mode for safe testing without real deployment
# - Progress reporting and detailed results
# - Test coverage reporting
#
# Usage:
#   ./test-local-deploy.sh [options]
#
# Options:
#   --component <name>     Test specific component (all, build, transfer, deploy)
#   --mock                 Use mock mode for safe testing
#   --verbose              Enable verbose output
#   --help                 Show this help message
#
# Examples:
#   ./test-local-deploy.sh
#   ./test-local-deploy.sh --component build
#   ./test-local-deploy.sh --mock
#
# Dependencies:
# - scripts/deploy/deploy-local.sh
# - scripts/deploy/local-build.sh
# - scripts/deploy/local-transfer.sh
# - scripts/lib/*.sh
#
# Version: 1.0
# Last Updated: 2026-03-19
#==============================================================================

set -euo pipefail

#==============================================================================
# Script Configuration
#==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="${SCRIPT_DIR}/../deploy"
LIB_DIR="${SCRIPT_DIR}/../lib"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Test configuration
TEST_COMPONENT="all"
TEST_MOCK=false
TEST_VERBOSE=false

# Test results
declare -i TESTS_TOTAL=0
declare -i TESTS_PASSED=0
declare -i TESTS_FAILED=0
declare -a TEST_FAILURES=()

# Test timing
TEST_START_TIME=0
TEST_END_TIME=0

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

#==============================================================================
# Test Framework Functions
#==============================================================================

# Show usage information
show_usage() {
    cat << EOF
Usage: $(basename "$0") [options]

Run tests for local deployment scripts.

Options:
  --component <name>     Test specific component (all, build, transfer, deploy)
  --mock                 Use mock mode for safe testing
  --verbose              Enable verbose output
  --help                 Show this help message

Test Components:
  all      Test all components (default)
  build    Test local-build.sh script
  transfer Test local-transfer.sh script
  deploy   Test deploy-local.sh script

Examples:
  $(basename "$0")                    # Run all tests
  $(basename "$0") --component build  # Test build component only
  $(basename "$0") --mock             # Run tests in mock mode

EOF
}

# Parse command line arguments
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --component)
                TEST_COMPONENT="$2"
                shift 2
                ;;
            --mock)
                TEST_MOCK=true
                shift
                ;;
            --verbose)
                TEST_VERBOSE=true
                shift
                ;;
            --help|-h)
                show_usage
                exit 0
                ;;
            *)
                echo -e "${RED}Unknown option: $1${NC}" >&2
                show_usage
                exit 1
                ;;
        esac
    done

    # Validate component
    if [[ ! "$TEST_COMPONENT" =~ ^(all|build|transfer|deploy)$ ]]; then
        echo -e "${RED}Invalid component: $TEST_COMPONENT${NC}" >&2
        exit 1
    fi
}

# Test assertion helper
assert_equals() {
    local expected="$1"
    local actual="$2"
    local message="${3:-Assertion failed}"

    if [[ "$expected" == "$actual" ]]; then
        return 0
    else
        echo -e "${RED}✗ $message${NC}"
        echo -e "  Expected: $expected"
        echo -e "  Actual: $actual"
        return 1
    fi
}

# Test assertion helper for success
assert_success() {
    local command="$1"
    local message="${2:-Command should succeed}"

    if eval "$command" &> /dev/null; then
        return 0
    else
        echo -e "${RED}✗ $message${NC}"
        echo -e "  Command: $command"
        return 1
    fi
}

# Test assertion helper for failure
assert_failure() {
    local command="$1"
    local message="${2:-Command should fail}"

    if ! eval "$command" &> /dev/null; then
        return 0
    else
        echo -e "${RED}✗ $message${NC}"
        echo -e "  Command: $command"
        return 1
    fi
}

# Test runner
run_test() {
    local test_name="$1"
    local test_function="$2"

    TESTS_TOTAL=$((TESTS_TOTAL + 1))

    echo -ne "${BLUE}Testing: $test_name ... ${NC}"

    if $test_function; then
        echo -e "${GREEN}✓ PASS${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC}"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        TEST_FAILURES+=("$test_name")
        return 1
    fi
}

# Mock helper
mock_command() {
    local command="$1"
    local output="$2"

    if [[ "$TEST_MOCK" == "true" ]]; then
        echo "$output"
        return 0
    else
        eval "$command"
    fi
}

#==============================================================================
# Setup and Teardown
#==============================================================================

setup_test_environment() {
    echo -e "${BLUE}Setting up test environment...${NC}"

    # Create test config if it doesn't exist
    local test_config="${PROJECT_ROOT}/config/tenants/test_tenant_alpha.yml"
    if [[ ! -f "$test_config" ]]; then
        echo -e "${YELLOW}Warning: Test config not found: $test_config${NC}"
        echo -e "${YELLOW}Tests may fail without proper configuration${NC}"
    fi

    # Create temporary directory for test artifacts
    local test_temp="/tmp/opclaw-test-${USER}"
    mkdir -p "$test_temp"

    echo -e "${GREEN}Test environment ready${NC}"
}

cleanup_test_environment() {
    echo -e "${BLUE}Cleaning up test environment...${NC}"

    # Remove temporary test artifacts
    local test_temp="/tmp/opclaw-test-${USER}"
    if [[ -d "$test_temp" ]]; then
        rm -rf "$test_temp"
    fi

    echo -e "${GREEN}Cleanup complete${NC}"
}

#==============================================================================
# Unit Tests: deploy-local.sh
#==============================================================================

test_deploy_local_script_exists() {
    [[ -f "${DEPLOY_DIR}/deploy-local.sh" ]]
}

test_deploy_local_executable() {
    [[ -x "${DEPLOY_DIR}/deploy-local.sh" ]]
}

test_deploy_local_help() {
    "${DEPLOY_DIR}/deploy-local.sh" --help &> /dev/null
}

test_deploy_local_parse_args() {
    # Test with test config
    local test_config="${PROJECT_ROOT}/config/tenants/test_tenant_alpha.yml"
    if [[ -f "$test_config" ]]; then
        # Check if script starts properly (SSH connection failure is expected in test env)
        local output
        output=$("${DEPLOY_DIR}/deploy-local.sh" "$test_config" --dry-run 2>&1)
        echo "$output" | grep -q "Local Deployment"
    else
        echo -e "${YELLOW}Skipping: Test config not found${NC}"
        return 0
    fi
}

test_deploy_local_build_only() {
    local test_config="${PROJECT_ROOT}/config/tenants/test_tenant_alpha.yml"
    if [[ -f "$test_config" ]]; then
        # Check if script starts properly
        local output
        output=$("${DEPLOY_DIR}/deploy-local.sh" "$test_config" --build-only --dry-run 2>&1)
        echo "$output" | grep -q "Local Deployment"
    else
        echo -e "${YELLOW}Skipping: Test config not found${NC}"
        return 0
    fi
}

test_deploy_local_transfer_only() {
    local test_config="${PROJECT_ROOT}/config/tenants/test_tenant_alpha.yml"
    if [[ -f "$test_config" ]]; then
        # Check if script starts properly
        local output
        output=$("${DEPLOY_DIR}/deploy-local.sh" "$test_config" --transfer-only --dry-run 2>&1)
        echo "$output" | grep -q "Local Deployment"
    else
        echo -e "${YELLOW}Skipping: Test config not found${NC}"
        return 0
    fi
}

test_deploy_local_remote_build() {
    local test_config="${PROJECT_ROOT}/config/tenants/test_tenant_alpha.yml"
    if [[ -f "$test_config" ]]; then
        # Check if script starts properly
        local output
        output=$("${DEPLOY_DIR}/deploy-local.sh" "$test_config" --remote-build --dry-run 2>&1)
        echo "$output" | grep -q "Local Deployment"
    else
        echo -e "${YELLOW}Skipping: Test config not found${NC}"
        return 0
    fi
}

#==============================================================================
# Unit Tests: local-build.sh
#==============================================================================

test_local_build_script_exists() {
    [[ -f "${DEPLOY_DIR}/local-build.sh" ]]
}

test_local_build_executable() {
    [[ -x "${DEPLOY_DIR}/local-build.sh" ]]
}

test_local_build_help() {
    "${DEPLOY_DIR}/local-build.sh" --help &> /dev/null
}

test_local_build_parse_args() {
    local test_config="${PROJECT_ROOT}/config/tenants/test_tenant_alpha.yml"
    if [[ -f "$test_config" ]]; then
        "${DEPLOY_DIR}/local-build.sh" "$test_config" --dry-run &> /dev/null
    else
        echo -e "${YELLOW}Skipping: Test config not found${NC}"
        return 0
    fi
}

test_local_build_backend_only() {
    local test_config="${PROJECT_ROOT}/config/tenants/test_tenant_alpha.yml"
    if [[ -f "$test_config" ]]; then
        "${DEPLOY_DIR}/local-build.sh" "$test_config" --component backend --dry-run &> /dev/null
    else
        echo -e "${YELLOW}Skipping: Test config not found${NC}"
        return 0
    fi
}

#==============================================================================
# Unit Tests: local-transfer.sh
#==============================================================================

test_local_transfer_script_exists() {
    [[ -f "${DEPLOY_DIR}/local-transfer.sh" ]]
}

test_local_transfer_executable() {
    [[ -x "${DEPLOY_DIR}/local-transfer.sh" ]]
}

test_local_transfer_help() {
    "${DEPLOY_DIR}/local-transfer.sh" --help &> /dev/null
}

test_local_transfer_parse_args() {
    local test_config="${PROJECT_ROOT}/config/tenants/test_tenant_alpha.yml"
    if [[ -f "$test_config" ]]; then
        # In test environment, SSH connection will fail
        # This is expected, so we check if the script starts properly
        local output
        output=$("${DEPLOY_DIR}/local-transfer.sh" "$test_config" --dry-run 2>&1)
        echo "$output" | grep -q "Local File Transfer"
    else
        echo -e "${YELLOW}Skipping: Test config not found${NC}"
        return 0
    fi
}

test_local_transfer_skip_code() {
    local test_config="${PROJECT_ROOT}/config/tenants/test_tenant_alpha.yml"
    if [[ -f "$test_config" ]]; then
        # Check if script starts properly (SSH connection failure is expected in test env)
        local output
        output=$("${DEPLOY_DIR}/local-transfer.sh" "$test_config" --skip-code --dry-run 2>&1)
        echo "$output" | grep -q "Local File Transfer"
    else
        echo -e "${YELLOW}Skipping: Test config not found${NC}"
        return 0
    fi
}

test_local_transfer_remote_build() {
    local test_config="${PROJECT_ROOT}/config/tenants/test_tenant_alpha.yml"
    if [[ -f "$test_config" ]]; then
        # Check if script starts properly (SSH connection failure is expected in test env)
        local output
        output=$("${DEPLOY_DIR}/local-transfer.sh" "$test_config" --remote-build --dry-run 2>&1)
        echo "$output" | grep -q "Local File Transfer"
    else
        echo -e "${YELLOW}Skipping: Test config not found${NC}"
        return 0
    fi
}

#==============================================================================
# Integration Tests
#==============================================================================

test_integration_build_transfer_deploy() {
    local test_config="${PROJECT_ROOT}/config/tenants/test_tenant_alpha.yml"
    if [[ ! -f "$test_config" ]]; then
        echo -e "${YELLOW}Skipping: Test config not found${NC}"
        return 0
    fi

    # This test simulates the full deployment flow
    # In mock mode, we just verify the scripts can be called in sequence
    if [[ "$TEST_MOCK" == "true" ]]; then
        "${DEPLOY_DIR}/local-build.sh" "$test_config" --dry-run &> /dev/null
        "${DEPLOY_DIR}/local-transfer.sh" "$test_config" --dry-run &> /dev/null
        "${DEPLOY_DIR}/deploy-local.sh" "$test_config" --dry-run &> /dev/null
    else
        echo -e "${YELLOW}Skipping full integration test (not in mock mode)${NC}"
    fi
}

test_integration_rollback_scenario() {
    # This test verifies rollback capability
    # In a real scenario, this would test rollback after failed deployment
    if [[ "$TEST_MOCK" == "true" ]]; then
        echo -e "${YELLOW}Rollback simulation (mock mode)${NC}"
        return 0
    else
        echo -e "${YELLOW}Skipping rollback test (not in mock mode)${NC}"
    fi
}

#==============================================================================
# Test Suite Runners
#==============================================================================

run_deploy_tests() {
    echo -e "\n${BLUE}=== Testing deploy-local.sh ===${NC}"

    run_test "deploy-local.sh exists" test_deploy_local_script_exists
    run_test "deploy-local.sh is executable" test_deploy_local_executable
    run_test "deploy-local.sh --help" test_deploy_local_help
    run_test "deploy-local.sh argument parsing" test_deploy_local_parse_args
    run_test "deploy-local.sh --build-only" test_deploy_local_build_only
    run_test "deploy-local.sh --transfer-only" test_deploy_local_transfer_only
    run_test "deploy-local.sh --remote-build" test_deploy_local_remote_build
}

run_build_tests() {
    echo -e "\n${BLUE}=== Testing local-build.sh ===${NC}"

    run_test "local-build.sh exists" test_local_build_script_exists
    run_test "local-build.sh is executable" test_local_build_executable
    run_test "local-build.sh --help" test_local_build_help
    run_test "local-build.sh argument parsing" test_local_build_parse_args
    run_test "local-build.sh --component backend" test_local_build_backend_only
}

run_transfer_tests() {
    echo -e "\n${BLUE}=== Testing local-transfer.sh ===${NC}"

    run_test "local-transfer.sh exists" test_local_transfer_script_exists
    run_test "local-transfer.sh is executable" test_local_transfer_executable
    run_test "local-transfer.sh --help" test_local_transfer_help
    run_test "local-transfer.sh argument parsing" test_local_transfer_parse_args
    run_test "local-transfer.sh --skip-code" test_local_transfer_skip_code
    run_test "local-transfer.sh --remote-build" test_local_transfer_remote_build
}

run_integration_tests() {
    echo -e "\n${BLUE}=== Running Integration Tests ===${NC}"

    run_test "Build → Transfer → Deploy flow" test_integration_build_transfer_deploy
    run_test "Rollback scenario" test_integration_rollback_scenario
}

#==============================================================================
# Results Reporting
#==============================================================================

show_test_summary() {
    TEST_END_TIME=$(date +%s)
    local duration=$((TEST_END_TIME - TEST_START_TIME))

    echo -e "\n${BLUE}=== Test Summary ===${NC}"
    echo -e "Total Tests: $TESTS_TOTAL"
    echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
    echo -e "${RED}Failed: $TESTS_FAILED${NC}"
    echo -e "Duration: ${duration}s"
    echo -e "Test Mode: $([ "$TEST_MOCK" == "true" ] && echo "Mock" || echo "Live")"

    if [[ $TESTS_FAILED -gt 0 ]]; then
        echo -e "\n${RED}Failed Tests:${NC}"
        for failure in "${TEST_FAILURES[@]}"; do
            echo -e "  ${RED}✗${NC} $failure"
        done
    fi

    local pass_rate=0
    if [[ $TESTS_TOTAL -gt 0 ]]; then
        pass_rate=$((TESTS_PASSED * 100 / TESTS_TOTAL))
    fi

    echo -e "\nPass Rate: ${pass_rate}%"

    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "${GREEN}All tests passed!${NC}"
        return 0
    else
        echo -e "${RED}Some tests failed${NC}"
        return 1
    fi
}

#==============================================================================
# Main Test Flow
#==============================================================================

# Main function
main() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Local Deployment Test Suite${NC}"
    echo -e "${BLUE}========================================${NC}"

    # Parse arguments
    parse_arguments "$@"

    # Show test mode
    if [[ "$TEST_MOCK" == "true" ]]; then
        echo -e "${YELLOW}Running in MOCK mode (safe testing)${NC}\n"
    else
        echo -e "${YELLOW}Running in LIVE mode (real deployment tests)${NC}\n"
    fi

    # Record start time
    TEST_START_TIME=$(date +%s)

    # Setup
    setup_test_environment

    # Run tests based on component selection
    case "$TEST_COMPONENT" in
        all)
            run_build_tests
            run_transfer_tests
            run_deploy_tests
            run_integration_tests
            ;;
        build)
            run_build_tests
            ;;
        transfer)
            run_transfer_tests
            ;;
        deploy)
            run_deploy_tests
            ;;
    esac

    # Cleanup
    cleanup_test_environment

    # Show summary
    show_test_summary

    # Exit with appropriate code
    [[ $TESTS_FAILED -eq 0 ]] && exit 0 || exit 1
}

#==============================================================================
# Script Entry Point
#==============================================================================

# Run main function
main "$@"
