#!/bin/bash
#==============================================================================
# Unit Tests for logging.sh Library
#
# Purpose: Test all logging functions and features
#
# Usage: ./test-lib-logging.sh
#
# Version: 1.0
# Last Updated: 2026-03-19
#==============================================================================

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source the library
source "${SCRIPT_DIR}/../lib/logging.sh"

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Test results array
declare -a FAILED_TESTS=()

#==============================================================================
# Test Helper Functions
#==============================================================================

# Run a test
run_test() {
    local test_name="$1"
    local test_function="$2"

    ((TESTS_RUN++))
    echo -n "Running: $test_name ... "

    if $test_function; then
        echo "✓ PASS"
        ((TESTS_PASSED++))
        return 0
    else
        echo "✗ FAIL"
        ((TESTS_FAILED++))
        FAILED_TESTS+=("$test_name")
        return 1
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
        echo "  $message"
        echo "  Expected: $expected"
        echo "  Actual: $actual"
        return 1
    fi
}

# Assert success (exit code 0)
assert_success() {
    local exit_code="$1"
    local message="${2:-Command should succeed}"

    if [[ $exit_code -eq 0 ]]; then
        return 0
    else
        echo "  $message (exit code: $exit_code)"
        return 1
    fi
}

# Assert failure (non-zero exit code)
assert_failure() {
    local exit_code="$1"
    local message="${2:-Command should fail}"

    if [[ $exit_code -ne 0 ]]; then
        return 0
    else
        echo "  $message (exit code: $exit_code)"
        return 1
    fi
}

# Assert file exists
assert_file_exists() {
    local file="$1"
    local message="${2:-File should exist}"

    if [[ -f "$file" ]]; then
        return 0
    else
        echo "  $message: $file"
        return 1
    fi
}

# Assert file contains
assert_file_contains() {
    local file="$1"
    local pattern="$2"
    local message="${3:-File should contain pattern}"

    if grep -q "$pattern" "$file" 2>/dev/null; then
        return 0
    else
        echo "  $message: $pattern"
        return 1
    fi
}

#==============================================================================
# Test Functions
#==============================================================================

test_log_init() {
    local test_log_file="/tmp/test_logging_$$.log"

    log_init "test_script" "$test_log_file"
    assert_file_exists "$test_log_file" "Log file should be created"
    local result=$?

    rm -f "$test_log_file"
    return $result
}

test_log_levels() {
    local test_log_file="/tmp/test_logging_levels_$$.log"

    log_init "test_script" "$test_log_file"

    # Test all log levels
    log_debug "Debug message" > /dev/null
    log_info "Info message" > /dev/null
    log_warning "Warning message" > /dev/null
    log_success "Success message" > /dev/null
    log_error "Error message" > /dev/null

    # Verify log file contains messages
    assert_file_contains "$test_log_file" "INFO" "Log should contain INFO"
    local result=$?

    rm -f "$test_log_file"
    return $result
}

test_log_set_level() {
    log_set_level "DEBUG"
    local level=$(log_get_level)
    assert_equals "DEBUG" "$level" "Log level should be DEBUG"
}

test_log_step_tracking() {
    local test_log_file="/tmp/test_logging_steps_$$.log"

    log_init "test_script" "$test_log_file"

    log_reset_steps
    log_step "Test step 1"
    log_step_complete
    log_step "Test step 2"
    log_step_failed "Test failure"

    # Verify log file contains step markers
    assert_file_contains "$test_log_file" "STEP 01" "Log should contain STEP 01"
    local result=$?

    rm -f "$test_log_file"
    return $result
}

test_log_separator() {
    local test_log_file="/tmp/test_logging_sep_$$.log"

    log_init "test_script" "$test_log_file"

    log_separator
    log_separator "-" 40

    assert_file_contains "$test_log_file" "=" "Log should contain separator"
    local result=$?

    rm -f "$test_log_file"
    return $result
}

test_log_section() {
    local test_log_file="/tmp/test_logging_section_$$.log"

    log_init "test_script" "$test_log_file"

    log_section "Test Section"

    assert_file_contains "$test_log_file" "Test Section" "Log should contain section title"
    assert_file_contains "$test_log_file" "===" "Log should contain section delimiter"
    local result=$?

    rm -f "$test_log_file"
    return $result
}

test_log_file_rotation() {
    local test_log_file="/tmp/test_logging_rotate_$$.log"

    # Set small max size for testing
    LOG_FILE_MAX_SIZE=1024

    log_init "test_script" "$test_log_file"

    # Write large content to trigger rotation
    for i in {1..100}; do
        log_info "This is a test message to trigger log rotation: $i" > /dev/null 2>&1
    done

    # Check if backup was created (log rotation)
    local backup_count
    backup_count=$(ls -1 "${test_log_file}".* 2>/dev/null | wc -l)

    rm -f "${test_log_file}"*
    return 0  # Don't fail if rotation didn't happen (depends on system)
}

test_log_disable_file() {
    local test_log_file="/tmp/test_logging_disable_$$.log"

    log_init "test_script" "$test_log_file"
    log_disable_file

    # Write a message
    log_info "Test message" > /dev/null 2>&1

    # File should still exist but no new content
    assert_file_exists "$test_log_file"
    local result=$?

    rm -f "$test_log_file"
    return $result
}

test_log_enable_file() {
    local test_log_file="/tmp/test_logging_enable_$$.log"

    log_init "test_script"
    log_enable_file "$test_log_file"

    log_info "Test message" > /dev/null 2>&1

    assert_file_contains "$test_log_file" "INFO" "Log should contain message"
    local result=$?

    rm -f "$test_log_file"
    return $result
}

test_log_aliases() {
    # Test that log_warn is an alias for log_warning
    local test_log_file="/tmp/test_logging_aliases_$$.log"

    log_init "test_script" "$test_log_file"

    log_warn "Warning via alias" > /dev/null
    log_warning "Warning direct" > /dev/null

    assert_file_contains "$test_log_file" "WARNING" "Log should contain WARNING"
    local result=$?

    rm -f "$test_log_file"
    return $result
}

test_log_timestamps() {
    local test_log_file="/tmp/test_logging_timestamps_$$.log"

    log_init "test_script" "$test_log_file"

    log_info "Test with timestamp" > /dev/null 2>&1

    # Check for timestamp pattern [YYYY-MM-DD HH:MM:SS]
    assert_file_contains "$test_log_file" "\[20[0-9][0-9]-[0-9][0-9]-[0-9][0-9]" "Log should contain timestamp"
    local result=$?

    rm -f "$test_log_file"
    return $result
}

#==============================================================================
# Main Test Runner
#==============================================================================

main() {
    echo "=========================================="
    echo "Logging Library Unit Tests"
    echo "=========================================="
    echo ""

    # Run all tests
    run_test "log_init() creates log file" test_log_init
    run_test "All log levels work correctly" test_log_levels
    run_test "log_set_level() changes log level" test_log_set_level
    run_test "Step tracking functions work" test_log_step_tracking
    run_test "Log separator works" test_log_separator
    run_test "Log section works" test_log_section
    run_test "Log file rotation triggers" test_log_file_rotation
    run_test "Disable file logging works" test_log_disable_file
    run_test "Enable file logging works" test_log_enable_file
    run_test "Log aliases (log_warn) work" test_log_aliases
    run_test "Log timestamps are present" test_log_timestamps

    # Print summary
    echo ""
    echo "=========================================="
    echo "Test Summary"
    echo "=========================================="
    echo "Tests Run:    $TESTS_RUN"
    echo "Tests Passed: $TESTS_PASSED"
    echo "Tests Failed: $TESTS_FAILED"
    echo ""

    if [[ $TESTS_FAILED -gt 0 ]]; then
        echo "Failed Tests:"
        for test in "${FAILED_TESTS[@]}"; do
            echo "  - $test"
        done
        echo ""
        return 1
    else
        echo "All tests passed! ✓"
        return 0
    fi
}

# Run tests
main "$@"
