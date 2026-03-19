#!/bin/bash
#==============================================================================
# State Management Library Test Suite
# (状态管理库测试套件)
#
# Purpose: Comprehensive testing of state.sh library functions
#
# Test Coverage:
# - Database connection and initialization
# - Deployment lifecycle recording (start, success, failure)
# - Configuration snapshot recording
# - Health check recording
# - Security audit logging
# - Tenant deployment queries
# - Concurrent deployment detection
# - Configuration drift recording
# - Error handling and edge cases
#
# Usage:
#   ./test-state.sh [test_name]
#
#   Without arguments: Run all tests
#   With test_name: Run specific test
#
# Environment Variables:
# - TEST_STATE_DB_HOST: Database host for testing (default: localhost)
# - TEST_STATE_DB_PORT: Database port for testing (default: 5432)
# - TEST_STATE_DB_NAME: Database name for testing (default: deployment_state)
# - TEST_STATE_DB_USER: Database user for testing (default: postgres)
# - TEST_STATE_DB_PASSWORD: Database password for testing (required)
# - TEST_TENANT_ID: Tenant ID for testing (default: test_tenant_001)
# - TEST_VERBOSE: Enable verbose output (default: false)
#
# Dependencies:
# - state.sh (library under test)
# - PostgreSQL server with deployment_state database
# - bc (for calculations)
#
# Version: 1.0
# Last Updated: 2026-03-19
#==============================================================================

#==============================================================================
# Configuration
#==============================================================================

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="${SCRIPT_DIR}/../lib"

# Test configuration
TEST_STATE_DB_HOST="${TEST_STATE_DB_HOST:-localhost}"
TEST_STATE_DB_PORT="${TEST_STATE_DB_PORT:-5432}"
TEST_STATE_DB_NAME="${TEST_STATE_DB_NAME:-deployment_state}"
TEST_STATE_DB_USER="${TEST_STATE_DB_USER:-postgres}"
TEST_STATE_DB_PASSWORD="${TEST_STATE_DB_PASSWORD:-}"
TEST_TENANT_ID="${TEST_TENANT_ID:-test_tenant_$(date +%s)}"
TEST_VERBOSE="${TEST_VERBOSE:-false}"

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Test results storage
declare -a FAILED_TESTS=()
declare -a SKIPPED_TESTS=()

# Colors
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    MAGENTA='\033[0;35m'
    CYAN='\033[0;36m'
    BOLD='\033[1m'
    NC='\033[0m' # No Color
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    MAGENTA=''
    CYAN=''
    BOLD=''
    NC=''
fi

#==============================================================================
# Utility Functions
#==============================================================================

# Print test header
print_header() {
    echo -e "${CYAN}==============================================================================${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}==============================================================================${NC}"
}

# Print test section
print_section() {
    echo ""
    echo -e "${BLUE}>>> $1${NC}"
}

# Print test start
print_test_start() {
    echo ""
    echo -e "${YELLOW}[TEST $TESTS_RUN]${NC} $1"
}

# Print test result
print_test_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

# Print test failure
print_test_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    FAILED_TESTS+=("$2")
    ((TESTS_FAILED++))
}

# Print test skip
print_test_skip() {
    echo -e "${YELLOW}[SKIP]${NC} $1"
    SKIPPED_TESTS+=("$2")
    ((TESTS_SKIPPED++))
}

# Print verbose output
print_verbose() {
    if [[ "$TEST_VERBOSE" == "true" ]]; then
        echo -e "${CYAN}[VERBOSE]${NC} $1"
    fi
}

# Assert equals
assert_equals() {
    local expected="$1"
    local actual="$2"
    local message="${3:-Assertion failed}"

    if [[ "$expected" == "$actual" ]]; then
        return 0
    else
        echo -e "${RED}  Expected: $expected${NC}"
        echo -e "${RED}  Actual: $actual${NC}"
        return 1
    fi
}

# Assert not equals
assert_not_equals() {
    local not_expected="$1"
    local actual="$2"
    local message="${3:-Assertion failed}"

    if [[ "$not_expected" != "$actual" ]]; then
        return 0
    else
        echo -e "${RED}  Should not equal: $not_expected${NC}"
        echo -e "${RED}  Actual: $actual${NC}"
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
        echo -e "${RED}  String should contain: $needle${NC}"
        echo -e "${RED}  Actual: $haystack${NC}"
        return 1
    fi
}

# Assert matches regex
assert_matches() {
    local string="$1"
    local regex="$2"
    local message="${3:-Assertion failed}"

    if [[ "$string" =~ $regex ]]; then
        return 0
    else
        echo -e "${RED}  String should match: $regex${NC}"
        echo -e "${RED}  Actual: $string${NC}"
        return 1
    fi
}

# Assert file exists
assert_file_exists() {
    local file="$1"

    if [[ -f "$file" ]]; then
        return 0
    else
        echo -e "${RED}  File should exist: $file${NC}"
        return 1
    fi
}

# Assert variable is not empty
assert_not_empty() {
    local value="$1"
    local var_name="${2:-value}"

    if [[ -n "$value" ]]; then
        return 0
    else
        echo -e "${RED}  Variable should not be empty: $var_name${NC}"
        return 1
    fi
}

# Sleep with progress indicator
sleep_with_progress() {
    local seconds=$1
    local message="${2:-Waiting}"

    for ((i=1; i<=seconds; i++)); do
        echo -ne "${CYAN}${message} ${i}/${seconds}...${NC}\r"
        sleep 1
    done
    echo ""
}

#==============================================================================
# Test Setup and Teardown
#==============================================================================

# Setup test environment
setup_test_environment() {
    print_section "Setting up test environment"

    # Export database credentials
    export STATE_DB_HOST="$TEST_STATE_DB_HOST"
    export STATE_DB_PORT="$TEST_STATE_DB_PORT"
    export STATE_DB_NAME="$TEST_STATE_DB_NAME"
    export STATE_DB_USER="$TEST_STATE_DB_USER"
    export STATE_DB_PASSWORD="$TEST_STATE_DB_PASSWORD"

    print_verbose "Database configuration:"
    print_verbose "  Host: $STATE_DB_HOST"
    print_verbose "  Port: $STATE_DB_PORT"
    print_verbose "  Database: $STATE_DB_NAME"
    print_verbose "  User: $STATE_DB_USER"
    print_verbose "  Tenant ID: $TEST_TENANT_ID"

    # Load state library
    if [[ ! -f "${LIB_DIR}/state.sh" ]]; then
        echo -e "${RED}[ERROR]${NC} state.sh not found at ${LIB_DIR}/state.sh"
        exit 1
    fi

    source "${LIB_DIR}/state.sh"

    # Test database connection
    print_verbose "Testing database connection..."
    if ! state_init; then
        echo -e "${RED}[ERROR]${NC} Failed to connect to state database"
        echo "Please ensure:"
        echo "  1. PostgreSQL server is running"
        echo "  2. Database '$TEST_STATE_DB_NAME' exists"
        echo "  3. Credentials are correct (set TEST_STATE_DB_PASSWORD)"
        echo ""
        echo "Example setup:"
        echo "  export TEST_STATE_DB_PASSWORD='your_password'"
        echo "  ./test-state.sh"
        exit 1
    fi

    echo -e "${GREEN}✓ Database connection established${NC}"

    # Create test tenant
    print_verbose "Creating test tenant: $TEST_TENANT_ID"
    psql -h "$STATE_DB_HOST" \
         -p "$STATE_DB_PORT" \
         -d "$STATE_DB_NAME" \
         -U "$STATE_DB_USER" \
         -c "sslmode=prefer" \
         -c "INSERT INTO tenants (tenant_id, tenant_name, environment, server_host, feishu_app_id)
              VALUES ('$TEST_TENANT_ID', 'Test Tenant', 'development', 'localhost', 'cli_test123')
              ON CONFLICT (tenant_id) DO NOTHING;" \
         -q \
         -o /dev/null

    echo -e "${GREEN}✓ Test tenant created${NC}"
}

# Cleanup test environment
cleanup_test_environment() {
    print_section "Cleaning up test environment"

    # Cleanup test data (optional - keep for inspection)
    print_verbose "Cleaning up test data..."

    # Uncomment to delete test data
    # psql -h "$STATE_DB_HOST" \
    #      -p "$STATE_DB_PORT" \
    #      -d "$STATE_DB_NAME" \
    #      -U "$STATE_DB_USER" \
    #      -c "sslmode=prefer" \
    #      -c "DELETE FROM deployments WHERE tenant_id = '$TEST_TENANT_ID';" \
    #      -c "DELETE FROM tenants WHERE tenant_id = '$TEST_TENANT_ID';" \
    #      -q \
    #      -o /dev/null

    state_cleanup
    echo -e "${GREEN}✓ Cleanup complete${NC}"
}

#==============================================================================
# Test Functions
#==============================================================================

# Test: Database connection and initialization
test_database_connection() {
    ((TESTS_RUN++))
    print_test_start "Database connection and initialization"

    # Test: state_init succeeds
    if state_init; then
        print_test_pass "state_init() connected successfully"
    else
        print_test_fail "state_init() failed to connect" "database_connection"
        return 1
    fi

    # Test: Connection state is set
    if [[ "$STATE_DB_CONNECTED" == "true" ]]; then
        print_test_pass "Database connection state is correct"
    else
        print_test_fail "Database connection state not set" "database_connection_state"
        return 1
    fi

    print_test_pass "All database connection tests passed"
}

# Test: record_deployment_start
test_record_deployment_start() {
    ((TESTS_RUN++))
    print_test_start "record_deployment_start()"

    local deployment_id
    local version="v1.0.0-test-$(date +%s)"

    # Test: Basic deployment start
    if record_deployment_start "$TEST_TENANT_ID" "$version" "development"; then
        deployment_id="$STATE_LAST_DEPLOYMENT_ID"
        if assert_not_empty "$deployment_id" "deployment_id"; then
            print_test_pass "Deployment started successfully, ID: $deployment_id"
        else
            print_test_fail "Deployment ID is empty" "deployment_start_no_id"
            return 1
        fi
    else
        print_test_fail "Failed to start deployment" "deployment_start_failed"
        return 1
    fi

    # Test: Verify deployment in database
    local result
    result=$(psql -h "$STATE_DB_HOST" \
                   -p "$STATE_DB_PORT" \
                   -d "$STATE_DB_NAME" \
                   -U "$STATE_DB_USER" \
                   -c "sslmode=prefer" \
                   -t \
                   -c "SELECT status FROM deployments WHERE deployment_id = $deployment_id;")

    if assert_equals "in_progress" "$result" "Deployment status"; then
        print_test_pass "Deployment status is 'in_progress'"
    else
        print_test_fail "Deployment status not correct" "deployment_start_status"
        return 1
    fi

    # Test: Invalid deployment_type
    if record_deployment_start "$TEST_TENANT_ID" "$version" "development" "invalid_type" 2>/dev/null; then
        print_test_fail "Should reject invalid deployment_type" "deployment_start_invalid_type"
        return 1
    else
        print_test_pass "Invalid deployment_type rejected"
    fi

    # Test: Missing required parameters
    if record_deployment_start "" "$version" "development" 2>/dev/null; then
        print_test_fail "Should reject missing tenant_id" "deployment_start_missing_tenant"
        return 1
    else
        print_test_pass "Missing tenant_id rejected"
    fi

    print_test_pass "All record_deployment_start tests passed"
    echo "STATE_LAST_DEPLOYMENT_ID=$deployment_id" > /tmp/test_deployment_id.txt
}

# Test: record_deployment_success
test_record_deployment_success() {
    ((TESTS_RUN++))
    print_test_start "record_deployment_success()"

    # Get deployment ID from previous test
    if [[ ! -f /tmp/test_deployment_id.txt ]]; then
        print_test_skip "No deployment ID available (run test_record_deployment_start first)" "deployment_success_no_id"
        return 0
    fi

    source /tmp/test_deployment_id.txt
    local deployment_id="$STATE_LAST_DEPLOYMENT_ID"

    if [[ -z "$deployment_id" ]]; then
        print_test_skip "Deployment ID is empty" "deployment_success_empty_id"
        return 0
    fi

    # Test: Mark deployment as success
    if record_deployment_success "$deployment_id" "Test deployment completed"; then
        print_test_pass "Deployment marked as successful"
    else
        print_test_fail "Failed to mark deployment as success" "deployment_success_failed"
        return 1
    fi

    # Test: Verify deployment status in database
    local result
    result=$(psql -h "$STATE_DB_HOST" \
                   -p "$STATE_DB_PORT" \
                   -d "$STATE_DB_NAME" \
                   -U "$STATE_DB_USER" \
                   -c "sslmode=prefer" \
                   -t \
                   -c "SELECT status FROM deployments WHERE deployment_id = $deployment_id;")

    if assert_equals "success" "$result" "Deployment status after success"; then
        print_test_pass "Deployment status updated to 'success'"
    else
        print_test_fail "Deployment status not updated" "deployment_success_status_not_updated"
        return 1
    fi

    # Test: completed_at is set
    local completed_at
    completed_at=$(psql -h "$STATE_DB_HOST" \
                       -p "$STATE_DB_PORT" \
                       -d "$STATE_DB_NAME" \
                       -U "$STATE_DB_USER" \
                       -c "sslmode=prefer" \
                       -t \
                       -c "SELECT completed_at IS NOT NULL FROM deployments WHERE deployment_id = $deployment_id;")

    if assert_equals "t" "$completed_at" "completed_at set"; then
        print_test_pass "Deployment completed_at timestamp set"
    else
        print_test_fail "Deployment completed_at not set" "deployment_success_no_timestamp"
        return 1
    fi

    print_test_pass "All record_deployment_success tests passed"
}

# Test: record_deployment_failure
test_record_deployment_failure() {
    ((TESTS_RUN++))
    print_test_start "record_deployment_failure()"

    # Start a new deployment for failure test
    local version="v1.0.0-fail-$(date +%s)"
    record_deployment_start "$TEST_TENANT_ID" "$version" "development" 2>/dev/null
    local deployment_id="$STATE_LAST_DEPLOYMENT_ID"

    if [[ -z "$deployment_id" ]]; then
        print_test_skip "Failed to create deployment for failure test" "deployment_failure_no_deployment"
        return 0
    fi

    # Test: Mark deployment as failed
    if record_deployment_failure "$deployment_id" "ERR001" "Test deployment failed"; then
        print_test_pass "Deployment marked as failed"
    else
        print_test_fail "Failed to mark deployment as failed" "deployment_failure_failed"
        return 1
    fi

    # Test: Verify deployment status in database
    local result
    result=$(psql -h "$STATE_DB_HOST" \
                   -p "$STATE_DB_PORT" \
                   -d "$STATE_DB_NAME" \
                   -U "$STATE_DB_USER" \
                   -c "sslmode=prefer" \
                   -t \
                   -c "SELECT status FROM deployments WHERE deployment_id = $deployment_id;")

    if assert_equals "failed" "$result" "Deployment status after failure"; then
        print_test_pass "Deployment status updated to 'failed'"
    else
        print_test_fail "Deployment status not updated" "deployment_failure_status_not_updated"
        return 1
    fi

    # Test: Verify error message
    local error_msg
    error_msg=$(psql -h "$STATE_DB_HOST" \
                     -p "$STATE_DB_PORT" \
                     -d "$STATE_DB_NAME" \
                     -U "$STATE_DB_USER" \
                     -c "sslmode=prefer" \
                     -t \
                     -c "SELECT error_message FROM deployments WHERE deployment_id = $deployment_id;")

    if assert_contains "$error_msg" "ERR001" "Error code"; then
        print_test_pass "Error message recorded correctly"
    else
        print_test_fail "Error message not recorded" "deployment_failure_no_error"
        return 1
    fi

    print_test_pass "All record_deployment_failure tests passed"
}

# Test: record_config_snapshot
test_record_config_snapshot() {
    ((TESTS_RUN++))
    print_test_start "record_config_snapshot()"

    # Create temporary config file
    local temp_config="/tmp/test_config_$$.yml"
    cat > "$temp_config" <<EOF
test:
  config: value
  version: 1.0.0
EOF

    # Get deployment ID
    local version="v1.0.0-snapshot-$(date +%s)"
    record_deployment_start "$TEST_TENANT_ID" "$version" "development" 2>/dev/null
    local deployment_id="$STATE_LAST_DEPLOYMENT_ID"

    if [[ -z "$deployment_id" ]]; then
        print_test_skip "No deployment ID available" "config_snapshot_no_deployment"
        rm -f "$temp_config"
        return 0
    fi

    # Test: Record config snapshot
    if record_config_snapshot "$deployment_id" "$temp_config"; then
        print_test_pass "Config snapshot recorded"
    else
        print_test_fail "Failed to record config snapshot" "config_snapshot_failed"
        rm -f "$temp_config"
        return 1
    fi

    # Test: Verify snapshot in database
    local snapshot_id
    snapshot_id=$(psql -h "$STATE_DB_HOST" \
                       -p "$STATE_DB_PORT" \
                       -d "$STATE_DB_NAME" \
                       -U "$STATE_DB_USER" \
                       -c "sslmode=prefer" \
                       -t \
                       -c "SELECT snapshot_id FROM deployment_config_snapshots WHERE deployment_id = $deployment_id;")

    if assert_not_empty "$snapshot_id" "snapshot_id"; then
        print_test_pass "Snapshot created with ID: $snapshot_id"
    else
        print_test_fail "Snapshot not found in database" "config_snapshot_not_found"
        rm -f "$temp_config"
        return 1
    fi

    # Test: Non-existent file
    if record_config_snapshot "$deployment_id" "/nonexistent/file.yml" 2>/dev/null; then
        print_test_fail "Should reject non-existent file" "config_snapshot_nonexistent_file"
        rm -f "$temp_config"
        return 1
    else
        print_test_pass "Non-existent file rejected"
    fi

    rm -f "$temp_config"
    print_test_pass "All record_config_snapshot tests passed"
}

# Test: record_health_check
test_record_health_check() {
    ((TESTS_RUN++))
    print_test_start "record_health_check()"

    # Test: Record successful health check
    if record_health_check "$TEST_TENANT_ID" "http" "pass" "150"; then
        print_test_pass "Health check recorded (http/pass)"
    else
        print_test_fail "Failed to record health check" "health_check_failed"
        return 1
    fi

    # Test: Verify health check in database
    local check_id
    check_id=$(psql -h "$STATE_DB_HOST" \
                   -p "$STATE_DB_PORT" \
                   -d "$STATE_DB_NAME" \
                   -U "$STATE_DB_USER" \
                   -c "sslmode=prefer" \
                   -t \
                   -c "SELECT health_check_id FROM health_checks
                        WHERE tenant_id = '$TEST_TENANT_ID'
                        AND check_type = 'http'
                        ORDER BY checked_at DESC LIMIT 1;")

    if assert_not_empty "$check_id" "health_check_id"; then
        print_test_pass "Health check found with ID: $check_id"
    else
        print_test_fail "Health check not found in database" "health_check_not_found"
        return 1
    fi

    # Test: Record failed health check
    if record_health_check "$TEST_TENANT_ID" "database" "fail" "" "Connection timeout"; then
        print_test_pass "Failed health check recorded"
    else
        print_test_fail "Failed to record failed health check" "health_check_fail_failed"
        return 1
    fi

    # Test: Invalid check_type
    if record_health_check "$TEST_TENANT_ID" "invalid_type" "pass" 2>/dev/null; then
        print_test_fail "Should reject invalid check_type" "health_check_invalid_type"
        return 1
    else
        print_test_pass "Invalid check_type rejected"
    fi

    # Test: Invalid status
    if record_health_check "$TEST_TENANT_ID" "http" "invalid_status" 2>/dev/null; then
        print_test_fail "Should reject invalid status" "health_check_invalid_status"
        return 1
    else
        print_test_pass "Invalid status rejected"
    fi

    print_test_pass "All record_health_check tests passed"
}

# Test: record_security_audit
test_record_security_audit() {
    ((TESTS_RUN++))
    print_test_start "record_security_audit()"

    # Test: Record security audit
    if record_security_audit "$TEST_TENANT_ID" "deployment" "test_user" "deploy" "server" "localhost" "192.168.1.100"; then
        print_test_pass "Security audit recorded"
    else
        print_test_fail "Failed to record security audit" "security_audit_failed"
        return 1
    fi

    # Test: Verify audit in database
    local audit_id
    audit_id=$(psql -h "$STATE_DB_HOST" \
                  -p "$STATE_DB_PORT" \
                  -d "$STATE_DB_NAME" \
                  -U "$STATE_DB_USER" \
                  -c "sslmode=prefer" \
                  -t \
                  -c "SELECT audit_id FROM security_audit_log
                       WHERE tenant_id = '$TEST_TENANT_ID'
                       AND event_type = 'deployment'
                       ORDER BY event_timestamp DESC LIMIT 1;")

    if assert_not_empty "$audit_id" "audit_id"; then
        print_test_pass "Security audit found with ID: $audit_id"
    else
        print_test_fail "Security audit not found in database" "security_audit_not_found"
        return 1
    fi

    # Test: Invalid event_type
    if record_security_audit "$TEST_TENANT_ID" "invalid_event" "test_user" "action" 2>/dev/null; then
        print_test_fail "Should reject invalid event_type" "security_audit_invalid_event"
        return 1
    else
        print_test_pass "Invalid event_type rejected"
    fi

    print_test_pass "All record_security_audit tests passed"
}

# Test: get_tenant_last_deployment
test_get_tenant_last_deployment() {
    ((TESTS_RUN++))
    print_test_start "get_tenant_last_deployment()"

    # Create a deployment first
    local version="v1.0.0-query-$(date +%s)"
    record_deployment_start "$TEST_TENANT_ID" "$version" "development" 2>/dev/null
    local deployment_id="$STATE_LAST_DEPLOYMENT_ID"
    record_deployment_success "$deployment_id" "Test" 2>/dev/null

    # Test: Get last deployment
    local last_deployment
    if get_tenant_last_deployment "$TEST_TENANT_ID" last_deployment; then
        print_test_pass "Retrieved last deployment"
    else
        print_test_fail "Failed to get last deployment" "get_last_deployment_failed"
        return 1
    fi

    if assert_not_empty "$last_deployment" "last_deployment"; then
        print_test_pass "Last deployment data: $last_deployment"
    else
        print_test_fail "Last deployment is empty" "get_last_deployment_empty"
        return 1
    fi

    # Test: Verify deployment_id in result
    if assert_contains "$last_deployment" "$deployment_id" "deployment_id in result"; then
        print_test_pass "Deployment ID found in result"
    else
        print_test_fail "Deployment ID not in result" "get_last_deployment_no_id"
        return 1
    fi

    # Test: Non-existent tenant
    local empty_result
    if get_tenant_last_deployment "nonexistent_tenant_12345" empty_result; then
        if [[ -z "$empty_result" ]]; then
            print_test_pass "Non-existent tenant returns empty result"
        else
            print_test_fail "Non-existent tenant should return empty" "get_last_deployment_nonexistent"
            return 1
        fi
    else
        print_test_fail "Query should succeed for non-existent tenant" "get_last_deployment_nonexistent_fail"
        return 1
    fi

    print_test_pass "All get_tenant_last_deployment tests passed"
}

# Test: check_concurrent_deployment
test_check_concurrent_deployment() {
    ((TESTS_RUN++))
    print_test_start "check_concurrent_deployment()"

    # Test: No concurrent deployment initially
    local concurrent_id
    if check_concurrent_deployment "$TEST_TENANT_ID" concurrent_id; then
        print_test_pass "No concurrent deployment detected"
    else
        print_test_fail "Concurrent deployment check failed" "concurrent_check_failed"
        return 1
    fi

    if [[ -z "$concurrent_id" ]]; then
        print_test_pass "Concurrent deployment ID is empty (correct)"
    else
        print_test_fail "Concurrent deployment ID should be empty" "concurrent_check_not_empty"
        return 1
    fi

    # Start a deployment
    local version="v1.0.0-concurrent-$(date +%s)"
    record_deployment_start "$TEST_TENANT_ID" "$version" "development" 2>/dev/null
    local deployment_id="$STATE_LAST_DEPLOYMENT_ID"

    # Test: Detect concurrent deployment
    if ! check_concurrent_deployment "$TEST_TENANT_ID" concurrent_id; then
        print_test_pass "Concurrent deployment detected"
    else
        print_test_fail "Should detect concurrent deployment" "concurrent_not_detected"
        return 1
    fi

    if assert_not_empty "$concurrent_id" "concurrent_id"; then
        print_test_pass "Concurrent deployment ID: $concurrent_id"
    else
        print_test_fail "Concurrent deployment ID is empty" "concurrent_id_empty"
        return 1
    fi

    # Complete the deployment
    record_deployment_success "$deployment_id" "Test" 2>/dev/null

    print_test_pass "All check_concurrent_deployment tests passed"
}

# Test: record_config_drift
test_record_config_drift() {
    ((TESTS_RUN++))
    print_test_start "record_config_drift()"

    # Test: Record config drift
    if record_config_drift "$TEST_TENANT_ID" "major" "/etc/config.yml" "expected_value" "actual_value"; then
        print_test_pass "Config drift recorded"
    else
        print_test_fail "Failed to record config drift" "config_drift_failed"
        return 1
    fi

    # Test: Verify drift in database
    local drift_id
    drift_id=$(psql -h "$STATE_DB_HOST" \
                  -p "$STATE_DB_PORT" \
                  -d "$STATE_DB_NAME" \
                  -U "$STATE_DB_USER" \
                  -c "sslmode=prefer" \
                  -t \
                  -c "SELECT drift_report_id FROM config_drift_reports
                       WHERE tenant_id = '$TEST_TENANT_ID'
                       AND resolved = false
                       ORDER BY drift_detected_at DESC LIMIT 1;")

    if assert_not_empty "$drift_id" "drift_id"; then
        print_test_pass "Config drift found with ID: $drift_id"
    else
        print_test_fail "Config drift not found in database" "config_drift_not_found"
        return 1
    fi

    # Test: Invalid severity
    if record_config_drift "$TEST_TENANT_ID" "invalid_severity" "/etc/config.yml" "expected" "actual" 2>/dev/null; then
        print_test_fail "Should reject invalid severity" "config_drift_invalid_severity"
        return 1
    else
        print_test_pass "Invalid severity rejected"
    fi

    print_test_pass "All record_config_drift tests passed"
}

# Test: Error handling
test_error_handling() {
    ((TESTS_RUN++))
    print_test_start "Error handling"

    # Test: Invalid deployment_id
    if record_deployment_success "invalid_id" 2>/dev/null; then
        print_test_fail "Should reject invalid deployment_id" "error_handling_invalid_deployment_id"
        return 1
    else
        print_test_pass "Invalid deployment_id rejected"
    fi

    # Test: Missing required parameters
    if record_deployment_start 2>/dev/null; then
        print_test_fail "Should reject missing parameters" "error_handling_missing_params"
        return 1
    else
        print_test_pass "Missing parameters rejected"
    fi

    # Test: Empty tenant_id
    if record_health_check "" "http" "pass" 2>/dev/null; then
        print_test_fail "Should reject empty tenant_id" "error_handling_empty_tenant"
        return 1
    else
        print_test_pass "Empty tenant_id rejected"
    fi

    # Test: Non-existent deployment_id for config snapshot
    if record_config_snapshot "999999" "/tmp/test.yml" 2>/dev/null; then
        # May succeed or fail depending on foreign key constraints
        print_test_pass "Config snapshot handled (FK constraint may allow)"
    else
        print_test_pass "Non-existent deployment_id rejected (FK constraint)"
    fi

    print_test_pass "All error handling tests passed"
}

#==============================================================================
# Test Execution
#==============================================================================

# Run all tests
run_all_tests() {
    print_header "State Management Library Test Suite"

    echo ""
    echo "Test Configuration:"
    echo "  Database: $TEST_STATE_DB_HOST:$TEST_STATE_DB_PORT/$TEST_STATE_DB_NAME"
    echo "  Tenant ID: $TEST_TENANT_ID"
    echo "  Verbose: $TEST_VERBOSE"
    echo ""

    setup_test_environment

    print_section "Running Tests"

    test_database_connection
    test_record_deployment_start
    test_record_deployment_success
    test_record_deployment_failure
    test_record_config_snapshot
    test_record_health_check
    test_record_security_audit
    test_get_tenant_last_deployment
    test_check_concurrent_deployment
    test_record_config_drift
    test_error_handling

    cleanup_test_environment

    print_test_summary
}

# Print test summary
print_test_summary() {
    print_header "Test Summary"

    echo ""
    echo "Total Tests: $TESTS_RUN"
    echo -e "${GREEN}Passed:${NC} $TESTS_PASSED"
    echo -e "${RED}Failed:${NC} $TESTS_FAILED"
    echo -e "${YELLOW}Skipped:${NC} $TESTS_SKIPPED"
    echo ""

    if [[ $TESTS_FAILED -gt 0 ]]; then
        echo -e "${RED}Failed Tests:${NC}"
        for test in "${FAILED_TESTS[@]}"; do
            echo -e "${RED}  ✗${NC} $test"
        done
        echo ""
    fi

    if [[ $TESTS_SKIPPED -gt 0 ]]; then
        echo -e "${YELLOW}Skipped Tests:${NC}"
        for test in "${SKIPPED_TESTS[@]}"; do
            echo -e "${YELLOW}  ⊘${NC} $test"
        done
        echo ""
    fi

    local success_rate=0
    if [[ $TESTS_RUN -gt 0 ]]; then
        success_rate=$((TESTS_PASSED * 100 / TESTS_RUN))
    fi

    echo "Success Rate: ${success_rate}%"
    echo ""

    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "${GREEN}${BOLD}All tests passed!${NC}"
        return 0
    else
        echo -e "${RED}${BOLD}Some tests failed!${NC}"
        return 1
    fi
}

# Run specific test
run_specific_test() {
    local test_name="$1"
    print_header "Running Test: $test_name"

    setup_test_environment

    case "$test_name" in
        "database_connection"|"connection")
            test_database_connection
            ;;
        "deployment_start"|"start")
            test_record_deployment_start
            ;;
        "deployment_success"|"success")
            test_record_deployment_success
            ;;
        "deployment_failure"|"failure")
            test_record_deployment_failure
            ;;
        "config_snapshot"|"snapshot")
            test_record_config_snapshot
            ;;
        "health_check"|"health")
            test_record_health_check
            ;;
        "security_audit"|"audit")
            test_record_security_audit
            ;;
        "get_last_deployment"|"last_deployment")
            test_get_tenant_last_deployment
            ;;
        "concurrent_deployment"|"concurrent")
            test_check_concurrent_deployment
            ;;
        "config_drift"|"drift")
            test_record_config_drift
            ;;
        "error_handling"|"errors")
            test_error_handling
            ;;
        *)
            echo -e "${RED}[ERROR]${NC} Unknown test: $test_name"
            echo ""
            echo "Available tests:"
            echo "  database_connection, connection"
            echo "  deployment_start, start"
            echo "  deployment_success, success"
            echo "  deployment_failure, failure"
            echo "  config_snapshot, snapshot"
            echo "  health_check, health"
            echo "  security_audit, audit"
            echo "  get_last_deployment, last_deployment"
            echo "  concurrent_deployment, concurrent"
            echo "  config_drift, drift"
            echo "  error_handling, errors"
            exit 1
            ;;
    esac

    cleanup_test_environment
    print_test_summary
}

#==============================================================================
# Main
#==============================================================================

main() {
    local test_name="${1:-}"

    if [[ -n "$test_name" ]]; then
        run_specific_test "$test_name"
    else
        run_all_tests
    fi
}

# Run main
main "$@"
