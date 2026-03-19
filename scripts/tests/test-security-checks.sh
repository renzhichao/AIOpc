#!/usr/bin/env bash
#==============================================================================
# Security Checks Test Suite
# (安全检查测试套件)
#
# Purpose: Comprehensive testing for all security check scripts
#
# Features:
# - Test configuration security checks
# - Test secret strength validation
# - Test file permission checks
# - Test log scanning functionality
# - Test orchestrator functionality
# - Mock data generation for testing
# - Coverage reporting
#
# Usage:
#   ./test-security-checks.sh [test_name]
#
# Arguments:
#   test_name    Optional specific test to run (runs all if omitted)
#
# Exit Codes:
#   0: All tests passed
#   1: One or more tests failed
#
# Dependencies:
# - scripts/security/*.sh (all security check scripts)
# - scripts/lib/*.sh (all library files)
#
# Version: 1.0
# Last Updated: 2026-03-19
#==============================================================================

set -euo pipefail

#==============================================================================
# Test Configuration
#==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SECURITY_DIR="${SCRIPT_DIR}/../security"
LIB_DIR="${SCRIPT_DIR}/../lib"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Test results
declare -a TEST_RESULTS=()
declare -i TESTS_RUN=0
declare -i TESTS_PASSED=0
declare -i TESTS_FAILED=0

# Test directories
TEST_DIR="${PROJECT_ROOT}/test_security_temp"
TEST_CONFIG_DIR="${TEST_DIR}/configs"
TEST_LOG_DIR="${TEST_DIR}/logs"

# Colors
if [ -t 1 ]; then
    GREEN='\033[0;32m'
    RED='\033[0;31m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    NC='\033[0m'
else
    GREEN=''
    RED=''
    YELLOW=''
    BLUE=''
    NC=''
fi

#==============================================================================
# Test Helper Functions
#==============================================================================

# Print test header
test_header() {
    echo
    echo "=========================================="
    echo "TEST: $1"
    echo "=========================================="
}

# Assert equals
assert_equals() {
    local expected="$1"
    local actual="$2"
    local message="${3:-Assertion failed}"

    if [[ "$expected" == "$actual" ]]; then
        return 0
    else
        echo "  ${RED}✗${NC} $message"
        echo "    Expected: $expected"
        echo "    Actual: $actual"
        return 1
    fi
}

# Assert contains
assert_contains() {
    local haystack="$1"
    local needle="$2"
    local message="${3:-Assertion failed}"

    if [[ "$haystack" == *"$needle"* ]]; then
        return 0
    else
        echo "  ${RED}✗${NC} $message"
        echo "    String does not contain: $needle"
        return 1
    fi
}

# Assert file exists
assert_file_exists() {
    local file_path="$1"
    local message="${2:-File should exist: $file_path}"

    if [[ -f "$file_path" ]]; then
        return 0
    else
        echo "  ${RED}✗${NC} $message"
        return 1
    fi
}

# Assert exit code
assert_exit_code() {
    local expected="$1"
    local actual="$2"
    local message="${3:-Exit code mismatch}"

    if [[ "$expected" == "$actual" ]]; then
        return 0
    else
        echo "  ${RED}✗${NC} $message"
        echo "    Expected exit code: $expected"
        echo "    Actual exit code: $actual"
        return 1
    fi
}

# Run a test
run_test() {
    local test_name="$1"
    local test_function="$2"

    ((TESTS_RUN++))

    echo -n "  ${BLUE}Running${NC}: $test_name ... "

    local output
    local exit_code=0

    # Run test function and capture output
    output=$($test_function 2>&1) || exit_code=$?

    if [[ $exit_code -eq 0 ]]; then
        ((TESTS_PASSED++))
        echo "${GREEN}PASS${NC}"
        TEST_RESULTS+=("PASS:$test_name")
        [[ -n "$output" ]] && echo "$output"
        return 0
    else
        ((TESTS_FAILED++))
        echo "${RED}FAIL${NC}"
        TEST_RESULTS+=("FAIL:$test_name")
        echo "$output"
        return 1
    fi
}

#==============================================================================
# Setup and Teardown
#==============================================================================

setup_test_environment() {
    echo "Setting up test environment..."

    # Create test directories
    mkdir -p "$TEST_CONFIG_DIR"
    mkdir -p "$TEST_LOG_DIR"

    # Create test configuration files
    create_test_configs

    # Create test log files
    create_test_logs

    echo "Test environment ready: $TEST_DIR"
}

cleanup_test_environment() {
    echo "Cleaning up test environment..."

    # Remove test directory
    rm -rf "$TEST_DIR"

    echo "Test environment cleaned up"
}

create_test_configs() {
    # Secure config (should pass all checks)
    cat > "${TEST_CONFIG_DIR}/secure.yml" << 'EOF'
tenant:
  id: test_tenant_001
  name: Test Tenant
  environment: production

server:
  host: example.com
  ssh_user: deploy
  ssh_key_path: ~/.ssh/id_rsa
  deploy_path: /opt/opclaw/platform

feishu:
  app_id: cli_a1b2c3d4e5f6g7h8i9j0
  app_secret: L0cHQDBbEiIys6AHW53miecONb1xA4qySecureSecret28Chars!
  encrypt_key: VeryStrongEncryptionKey24Chars!!
  oauth_redirect_uri: https://example.com/oauth/callback

database:
  host: db.example.com
  port: 5432
  name: opclaw_test_tenant_001
  user: opclaw_user
  password: VeryStrongDatabasePassword16Chars!

redis:
  host: redis.example.com
  port: 6379
  password: VeryStrongRedisPassword16Chars!

jwt:
  secret: VeryStrongJWTSecretWithHighEntropy32Chars!!
  expires_in: 24h

agent:
  deepseek:
    api_key: sk-1234567890abcdef1234567890abcdef
EOF

    # Insecure config with placeholders (should fail)
    cat > "${TEST_CONFIG_DIR}/insecure-placeholders.yml" << 'EOF'
tenant:
  id: test_tenant_002
  name: Test Tenant 2
  environment: production

server:
  host: example.com
  ssh_user: deploy
  ssh_key_path: ~/.ssh/id_rsa
  deploy_path: /opt/opclaw/platform

feishu:
  app_id: cli_xxxxxxxxxxxxx
  app_secret: CHANGE_THIS
  encrypt_key: TODO_ADD_REAL_VALUE
  oauth_redirect_uri: https://example.com/oauth/callback

database:
  host: db.example.com
  port: 5432
  name: opclaw_test
  user: opclaw_user
  password: password

redis:
  host: redis.example.com
  port: 6379
  password: 12345678

jwt:
  secret: weak
  expires_in: 24h

agent:
  deepseek:
    api_key: sk-short
EOF

    # Config with weak secrets (should fail strength check)
    cat > "${TEST_CONFIG_DIR}/weak-secrets.yml" << 'EOF'
tenant:
  id: test_tenant_003
  name: Test Tenant 3
  environment: production

server:
  host: example.com
  ssh_user: deploy
  ssh_key_path: ~/.ssh/id_rsa
  deploy_path: /opt/opclaw/platform

feishu:
  app_id: cli_a1b2c3d4e5f6g7h8i9j0
  app_secret: short
  encrypt_key: weak
  oauth_redirect_uri: https://example.com/oauth/callback

database:
  host: db.example.com
  port: 5432
  name: opclaw_test
  user: opclaw_user
  password: weak

redis:
  host: redis.example.com
  port: 6379
  password: weak

jwt:
  secret: weak
  expires_in: 24h

agent:
  deepseek:
    api_key: sk-short
EOF

    # Set restrictive permissions on secure config
    chmod 600 "${TEST_CONFIG_DIR}/secure.yml"

    # Set weak permissions on insecure config
    chmod 644 "${TEST_CONFIG_DIR}/insecure-placeholders.yml"
}

create_test_logs() {
    # Clean log (no secrets)
    cat > "${TEST_LOG_DIR}/clean.log" << 'EOF'
2025-03-19 10:00:00 INFO Application started
2025-03-19 10:00:01 INFO Connected to database
2025-03-19 10:00:02 INFO Server listening on port 3000
2025-03-19 10:00:03 INFO Request received: GET /api/health
2025-03-19 10:00:04 INFO Response sent: 200 OK
EOF

    # Log with secrets (should be detected)
    cat > "${TEST_LOG_DIR}/secrets.log" << 'EOF'
2025-03-19 10:00:00 INFO Application started
2025-03-19 10:00:01 DEBUG Database connection: postgresql://user:password123@db.example.com:5432/dbname
2025-03-19 10:00:02 DEBUG JWT secret: weakjwtsecret12345678901234567890
2025-03-19 10:00:03 DEBUG API key: sk-1234567890abcdef1234567890abcdef
2025-03-19 10:00:04 INFO Response sent: 200 OK
EOF

    # Set appropriate permissions
    chmod 600 "${TEST_LOG_DIR}/clean.log"
    chmod 600 "${TEST_LOG_DIR}/secrets.log"
}

#==============================================================================
# Test Functions
#==============================================================================

# Test: Configuration security check with secure config
test_config_security_secure() {
    local output
    local exit_code

    output=$("${SECURITY_DIR}/check-config-security.sh" "${TEST_CONFIG_DIR}/secure.yml" 2>&1) || exit_code=$?

    assert_exit_code 0 $exit_code "Secure config should pass"
    assert_contains "$output" "PASSED" "Should indicate success"
}

# Test: Configuration security check with placeholders
test_config_security_placeholders() {
    local output
    local exit_code

    output=$("${SECURITY_DIR}/check-config-security.sh" "${TEST_CONFIG_DIR}/insecure-placeholders.yml" 2>&1) || exit_code=$?

    assert_exit_code 1 $exit_code "Config with placeholders should fail"
    assert_contains "$output" "cli_xxxxxxxxxxxxx" "Should detect placeholder app_id"
    assert_contains "$output" "CHANGE_THIS" "Should detect placeholder secret"
}

# Test: Secret strength check with secure config
test_secret_strength_secure() {
    local output
    local exit_code

    output=$("${SECURITY_DIR}/check-secret-strength.sh" "${TEST_CONFIG_DIR}/secure.yml" 2>&1) || exit_code=$?

    assert_exit_code 0 $exit_code "Secure config should pass strength check"
}

# Test: Secret strength check with weak secrets
test_secret_strength_weak() {
    local output
    local exit_code

    output=$("${SECURITY_DIR}/check-secret-strength.sh" "${TEST_CONFIG_DIR}/weak-secrets.yml" 2>&1) || exit_code=$?

    assert_exit_code 1 $exit_code "Weak secrets should fail"
    assert_contains "$output" "WEAK" "Should indicate weak secrets"
}

# Test: File permission check with correct permissions
test_file_permissions_secure() {
    local output
    local exit_code

    output=$("${SECURITY_DIR}/check-file-permissions.sh" "${TEST_CONFIG_DIR}/secure.yml" 2>&1) || exit_code=$?

    assert_exit_code 0 $exit_code "Config with correct permissions should pass"
}

# Test: File permission check with incorrect permissions
test_file_permissions_insecure() {
    local output
    local exit_code

    output=$("${SECURITY_DIR}/check-file-permissions.sh" "${TEST_CONFIG_DIR}/insecure-placeholders.yml" 2>&1) || exit_code=$?

    assert_exit_code 1 $exit_code "Config with incorrect permissions should fail"
}

# Test: Log scanning with clean logs
test_log_scanning_clean() {
    local output
    local exit_code

    output=$("${SECURITY_DIR}/scan-logs.sh" "${TEST_LOG_DIR}/clean.log" 2>&1) || exit_code=$?

    assert_exit_code 0 $exit_code "Clean logs should pass"
    assert_contains "$output" "No secrets detected" "Should indicate no secrets"
}

# Test: Log scanning with secrets
test_log_scanning_secrets() {
    local output
    local exit_code

    output=$("${SECURITY_DIR}/scan-logs.sh" "${TEST_LOG_DIR}/secrets.log" 2>&1) || exit_code=$?

    assert_exit_code 1 $exit_code "Logs with secrets should fail"
    assert_contains "$output" "Secrets found" "Should detect secrets"
}

# Test: Security check suite with secure config
test_security_suite_secure() {
    local output
    local exit_code

    # Mock log scan to avoid scanning real logs
    output=$("${SECURITY_DIR}/security-check-suite.sh" "${TEST_CONFIG_DIR}/secure.yml" "" --config --secrets --permissions 2>&1) || exit_code=$?

    assert_exit_code 0 $exit_code "Secure config should pass all checks"
}

# Test: Security check suite with insecure config
test_security_suite_insecure() {
    local output
    local exit_code

    output=$("${SECURITY_DIR}/security-check-suite.sh" "${TEST_CONFIG_DIR}/insecure-placeholders.yml" "" --config 2>&1) || exit_code=$?

    assert_exit_code 1 $exit_code "Insecure config should fail"
}

# Test: Security check suite continue on error
test_security_suite_continue() {
    local output
    local exit_code

    output=$("${SECURITY_DIR}/security-check-suite.sh" "${TEST_CONFIG_DIR}/insecure-placeholders.yml" "" --config --continue-on-error 2>&1) || exit_code=$?

    assert_exit_code 3 $exit_code "Should return partial exit code with continue-on-error"
}

#==============================================================================
# Test Runner
#==============================================================================

run_all_tests() {
    echo
    echo "=========================================="
    echo "Security Checks Test Suite"
    echo "=========================================="
    echo

    # Run configuration security tests
    test_header "Configuration Security Tests"
    run_test "Secure config validation" test_config_security_secure
    run_test "Placeholder detection" test_config_security_placeholders

    # Run secret strength tests
    test_header "Secret Strength Tests"
    run_test "Strong secret validation" test_secret_strength_secure
    run_test "Weak secret detection" test_secret_strength_weak

    # Run file permission tests
    test_header "File Permission Tests"
    run_test "Correct permissions" test_file_permissions_secure
    run_test "Incorrect permissions" test_file_permissions_insecure

    # Run log scanning tests
    test_header "Log Scanning Tests"
    run_test "Clean log scanning" test_log_scanning_clean
    run_test "Secret detection in logs" test_log_scanning_secrets

    # Run orchestrator tests
    test_header "Orchestrator Tests"
    run_test "Security suite with secure config" test_security_suite_secure
    run_test "Security suite with insecure config" test_security_suite_insecure
    run_test "Security suite continue on error" test_security_suite_continue
}

print_test_summary() {
    echo
    echo "=========================================="
    echo "Test Summary"
    echo "=========================================="
    echo
    echo "Total Tests: $TESTS_RUN"
    echo "${GREEN}Passed: $TESTS_PASSED${NC}"
    echo "${RED}Failed: $TESTS_FAILED${NC}"
    echo

    if [[ $TESTS_FAILED -gt 0 ]]; then
        echo "${RED}Failed Tests:${NC}"
        for result in "${TEST_RESULTS[@]}"; do
            IFS=':' read -r status name <<< "$result"
            if [[ "$status" == "FAIL" ]]; then
                echo "  ${RED}✗${NC} $name"
            fi
        done
        echo
    fi

    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo "${GREEN}All tests passed!${NC}"
        return 0
    else
        echo "${RED}Some tests failed!${NC}"
        return 1
    fi
}

#==============================================================================
# Main Function
#==============================================================================

main() {
    local specific_test="${1:-}"

    # Setup test environment
    setup_test_environment

    # Run tests
    if [[ -n "$specific_test" ]]; then
        # Run specific test
        test_header "$specific_test"
        if declare -f "$specific_test" > /dev/null; then
            run_test "$specific_test" "$specific_test"
        else
            echo "Test not found: $specific_test"
            exit 1
        fi
    else
        # Run all tests
        run_all_tests
    fi

    # Print summary
    print_test_summary
    local exit_code=$?

    # Cleanup
    cleanup_test_environment

    exit $exit_code
}

main "$@"
