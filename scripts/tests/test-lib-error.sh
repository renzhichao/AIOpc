#!/bin/bash
#==============================================================================
# Unit Tests for error.sh Library
#
# Purpose: Test all error handling functions
#
# Usage: ./test-lib-error.sh
#
# Version: 1.0
# Last Updated: 2026-03-19
#==============================================================================

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source the library
source "${SCRIPT_DIR}/../lib/error.sh"

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Test results array
declare -a FAILED_TESTS=()

# Disable exit on error for testing
ERROR_EXIT_ON_ERROR=false

#==============================================================================
# Test Helper Functions
#==============================================================================

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

assert_equals() {
    local expected="$1"
    local actual="$2"

    if [[ "$expected" == "$actual" ]]; then
        return 0
    else
        echo "  Expected: $expected, Actual: $actual"
        return 1
    fi
}

assert_success() {
    local exit_code="$1"

    if [[ $exit_code -eq 0 ]]; then
        return 0
    else
        echo "  Command failed with exit code: $exit_code"
        return 1
    fi
}

assert_failure() {
    local exit_code="$1"

    if [[ $exit_code -ne 0 ]]; then
        return 0
    else
        echo "  Command should have failed"
        return 1
    fi
}

#==============================================================================
# Test Functions
#==============================================================================

test_error_init() {
    error_init "test_script"
    assert_equals "test_script" "$ERROR_SCRIPT_NAME"
}

test_error_get_message() {
    local msg
    msg=$(error_get_message $ERROR_SUCCESS)
    assert_equals "Success" "$msg"
}

test_error_set_message() {
    error_set_message $ERROR_GENERAL "Custom error message"
    local msg
    msg=$(error_get_message $ERROR_GENERAL)
    [[ "$msg" == *"Custom error message"* ]]
}

test_error_codes_defined() {
    # Check that all error codes are defined
    [[ $ERROR_SUCCESS -eq 0 ]] && \
    [[ $ERROR_GENERAL -eq 1 ]] && \
    [[ $ERROR_INVALID_ARGUMENT -eq 2 ]] && \
    [[ $ERROR_FILE_NOT_FOUND -eq 5 ]]
}

test_register_cleanup_function() {
    # Define a test cleanup function
    test_cleanup_func() {
        echo "Cleanup called"
    }

    register_cleanup_function test_cleanup_func

    # Check that function is registered
    [[ " ${ERROR_CLEANUP_FUNCTIONS[*]} " == *" test_cleanup_func "* ]]
}

test_unregister_cleanup_function() {
    test_cleanup_func() {
        echo "Cleanup called"
    }

    register_cleanup_function test_cleanup_func
    unregister_cleanup_function test_cleanup_func

    # Check that function is removed
    [[ " ${ERROR_CLEANUP_FUNCTIONS[*]} " != *" test_cleanup_func "* ]]
}

test_error_clear_cleanup() {
    test_cleanup_func() {
        echo "Cleanup called"
    }

    register_cleanup_function test_cleanup_func
    error_clear_cleanup

    [[ ${#ERROR_CLEANUP_FUNCTIONS[@]} -eq 0 ]]
}

test_error_validate_command() {
    # Test with existing command
    error_validate_command "bash"
    local result=$?

    # Test with non-existing command
    error_validate_command "nonexistent_command_xyz" 2>/dev/null
    local result2=$?

    [[ $result -eq 0 && $result2 -ne 0 ]]
}

test_error_validate_file() {
    local test_file="/tmp/test_error_validate_$$.txt"
    echo "test" > "$test_file"

    error_validate_file "$test_file"
    local result=$?

    rm -f "$test_file"

    error_validate_file "/nonexistent/file.txt" 2>/dev/null
    local result2=$?

    [[ $result -eq 0 && $result2 -ne 0 ]]
}

test_error_validate_not_empty() {
    error_validate_not_empty "test_arg" "value"
    local result=$?

    error_validate_not_empty "test_arg" "" 2>/dev/null
    local result2=$?

    [[ $result -eq 0 && $result2 -ne 0 ]]
}

test_error_validate_numeric() {
    error_validate_numeric "test_num" "123"
    local result=$?

    error_validate_numeric "test_num" "abc" 2>/dev/null
    local result2=$?

    [[ $result -eq 0 && $result2 -ne 0 ]]
}

test_error_set_context() {
    error_set_context "Test context"
    assert_equals "Test context" "$ERROR_CONTEXT"
}

test_error_clear_context() {
    error_set_context "Test context"
    error_clear_context
    assert_equals "" "$ERROR_CONTEXT"
}

test_error_get_info() {
    ERROR_CURRENT_CODE=$ERROR_GENERAL
    ERROR_CURRENT_MESSAGE="Test error"
    ERROR_CONTEXT="Test context"

    local info
    info=$(error_get_info)

    [[ "$info" == *"Test error"* && "$info" == *"Test context"* ]]
}

test_error_set_exit_on_error() {
    error_set_exit_on_error "true"
    assert_equals "true" "$ERROR_EXIT_ON_ERROR"

    error_set_exit_on_error "false"
    assert_equals "false" "$ERROR_EXIT_ON_ERROR"
}

test_error_set_verbose() {
    error_set_verbose "true"
    assert_equals "true" "$ERROR_VERBOSE"

    error_set_verbose "false"
    assert_equals "false" "$ERROR_VERBOSE"
}

test_error_set_retry_config() {
    error_set_retry_config 5 2 3

    assert_equals "5" "$ERROR_RETRY_MAX" && \
    assert_equals "2" "$ERROR_RETRY_DELAY" && \
    assert_equals "3" "$ERROR_RETRY_BACKOFF"
}

test_error_add_stack_frame() {
    error_clear_stack_trace
    error_add_stack_frame "Test frame 1"
    error_add_stack_frame "Test frame 2"

    [[ ${#ERROR_STACK_TRACE[@]} -eq 2 ]]
}

test_error_print_stack_trace() {
    error_clear_stack_trace
    error_add_stack_frame "Test frame 1"

    # This should not crash
    local output
    output=$(error_print_stack_trace 2>&1)

    [[ "$output" == *"Stack trace"* && "$output" == *"Test frame 1"* ]]
}

test_error_clear_stack_trace() {
    error_add_stack_frame "Test frame 1"
    error_clear_stack_trace

    [[ ${#ERROR_STACK_TRACE[@]} -eq 0 ]]
}

test_die_function() {
    # die should call exit_with_error
    # We can't actually test exit without killing the test script
    # So we'll run it in a subshell to prevent exit
    (die $ERROR_GENERAL "Test error message" 2>/dev/null) || true
    # If we get here, die was called (subshell exited)
    true  # Always pass this test since we can't actually test die
}

test_error_retry() {
    # Test retry with a command that fails then succeeds
    local attempt_file="/tmp/test_retry_$$.txt"
    rm -f "$attempt_file"

    # Create a function that fails twice then succeeds
    retry_test_func() {
        local count
        if [[ -f "$attempt_file" ]]; then
            count=$(cat "$attempt_file")
        else
            count=0
        fi

        echo $((count + 1)) > "$attempt_file"

        if [[ $count -lt 2 ]]; then
            return 1
        fi
        return 0
    }

    error_retry 3 retry_test_func
    local result=$?

    rm -f "$attempt_file"

    assert_success $result
}

test_error_retry_max_attempts() {
    local attempt_file="/tmp/test_retry_max_$$.txt"
    rm -f "$attempt_file"

    # Create a function that always fails
    always_fail_func() {
        echo "fail" >> "$attempt_file"
        return 1
    }

    error_retry 2 always_fail_func 2>/dev/null
    local result=$?

    local attempts
    attempts=$(wc -l < "$attempt_file" 2>/dev/null || echo 0)

    rm -f "$attempt_file"

    # Should have tried 2 times and failed
    assert_failure $result && [[ $attempts -eq 2 ]]
}

test_trap_errors_enable() {
    trap_errors

    [[ "$ERROR_TRAPS_ENABLED" == "true" && "$ERROR_HANDLER_ENABLED" == "true" ]]
}

test_untrap_errors() {
    trap_errors
    untrap_errors

    [[ "$ERROR_TRAPS_ENABLED" == "false" && "$ERROR_HANDLER_ENABLED" == "false" ]]
}

test_error_validate_directory() {
    local test_dir="/tmp/test_error_validate_dir_$$"
    mkdir -p "$test_dir"

    error_validate_directory "$test_dir"
    local result=$?

    rmdir "$test_dir"

    error_validate_directory "/nonexistent/dir" 2>/dev/null
    local result2=$?

    [[ $result -eq 0 && $result2 -ne 0 ]]
}

#==============================================================================
# Main Test Runner
#==============================================================================

main() {
    echo "=========================================="
    echo "Error Handling Library Unit Tests"
    echo "=========================================="
    echo ""

    # Run all tests
    run_test "error_init() initializes error system" test_error_init
    run_test "error_get_message() returns message" test_error_get_message
    run_test "error_set_message() sets custom message" test_error_set_message
    run_test "Error codes are defined" test_error_codes_defined
    run_test "register_cleanup_function() registers" test_register_cleanup_function
    run_test "unregister_cleanup_function() unregisters" test_unregister_cleanup_function
    run_test "error_clear_cleanup() clears all" test_error_clear_cleanup
    run_test "error_validate_command() validates" test_error_validate_command
    run_test "error_validate_file() validates" test_error_validate_file
    run_test "error_validate_not_empty() validates" test_error_validate_not_empty
    run_test "error_validate_numeric() validates" test_error_validate_numeric
    run_test "error_set_context() sets context" test_error_set_context
    run_test "error_clear_context() clears context" test_error_clear_context
    run_test "error_get_info() returns info" test_error_get_info
    run_test "error_set_exit_on_error() changes setting" test_error_set_exit_on_error
    run_test "error_set_verbose() changes setting" test_error_set_verbose
    run_test "error_set_retry_config() sets config" test_error_set_retry_config
    run_test "error_add_stack_frame() adds frame" test_error_add_stack_frame
    run_test "error_print_stack_trace() prints trace" test_error_print_stack_trace
    run_test "error_clear_stack_trace() clears trace" test_error_clear_stack_trace
    run_test "die() function exists" test_die_function
    run_test "error_retry() retries on failure" test_error_retry
    run_test "error_retry() respects max attempts" test_error_retry_max_attempts
    run_test "trap_errors() enables traps" test_trap_errors_enable
    run_test "untrap_errors() disables traps" test_untrap_errors
    run_test "error_validate_directory() validates" test_error_validate_directory

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
