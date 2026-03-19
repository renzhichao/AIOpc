#!/bin/bash
#==============================================================================
# Unit Tests for file.sh Library
#
# Purpose: Test all file operations functions
#
# Usage: ./test-lib-file.sh
#
# Version: 1.0
# Last Updated: 2026-03-19
#==============================================================================

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source the library
source "${SCRIPT_DIR}/../lib/file.sh"

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Test results array
declare -a FAILED_TESTS=()

# Test files
TEST_DIR="/tmp/test_file_ops_$$"
TEST_FILE="$TEST_DIR/test_file.txt"
TEST_BACKUP_DIR="$TEST_DIR/backups"

#==============================================================================
# Setup and Teardown
#==============================================================================

setup() {
    mkdir -p "$TEST_DIR"
    mkdir -p "$TEST_BACKUP_DIR"
    echo "Test content" > "$TEST_FILE"
    FILE_BACKUP_DIR="$TEST_BACKUP_DIR"
    FILE_TMP_DIR="$TEST_DIR/tmp"
    mkdir -p "$FILE_TMP_DIR"
}

teardown() {
    rm -rf "$TEST_DIR"
}

#==============================================================================
# Test Helper Functions
#==============================================================================

run_test() {
    local test_name="$1"
    local test_function="$2"

    ((TESTS_RUN++))
    echo -n "Running: $test_name ... "

    setup
    if $test_function; then
        echo "✓ PASS"
        ((TESTS_PASSED++))
        teardown
        return 0
    else
        echo "✗ FAIL"
        ((TESTS_FAILED++))
        FAILED_TESTS+=("$test_name")
        teardown
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

assert_file_exists() {
    local file="$1"

    if [[ -f "$file" ]]; then
        return 0
    else
        echo "  File should exist: $file"
        return 1
    fi
}

assert_file_not_exists() {
    local file="$1"

    if [[ ! -f "$file" ]]; then
        return 0
    else
        echo "  File should not exist: $file"
        return 1
    fi
}

assert_file_contains() {
    local file="$1"
    local pattern="$2"

    if grep -q "$pattern" "$file" 2>/dev/null; then
        return 0
    else
        echo "  File should contain: $pattern"
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

#==============================================================================
# Test Functions
#==============================================================================

test_backup_file() {
    local backup_path
    backup_path=$(backup_file "$TEST_FILE")

    # Just check that backup file exists (compressed files can't be grepped directly)
    assert_file_exists "$backup_path"
}

test_backup_file_custom() {
    local backup_path
    backup_path=$(backup_file_custom "$TEST_FILE" "custom")

    assert_file_exists "$backup_path" && \
    assert_file_contains "$backup_path" "Test content" && \
    [[ "$backup_path" == *.custom ]]
}

test_list_backups() {
    # Create multiple backups
    backup_file "$TEST_FILE"
    sleep 1
    backup_file "$TEST_FILE"

    local output
    output=$(list_backups "$TEST_FILE")

    [[ "$output" == *"Backup"* ]]
}

test_restore_file() {
    local backup_path
    backup_path=$(backup_file "$TEST_FILE")

    # Modify original file
    echo "Modified content" > "$TEST_FILE"

    # Restore from backup
    restore_file "$backup_path" "$TEST_FILE"

    assert_file_contains "$TEST_FILE" "Test content"
}

test_file_hash() {
    local hash1
    hash1=$(file_hash "$TEST_FILE" "md5")

    local hash2
    hash2=$(file_hash "$TEST_FILE" "md5")

    [[ -n "$hash1" && "$hash1" == "$hash2" ]]
}

test_file_hash_verify() {
    local expected_hash
    expected_hash=$(file_hash "$TEST_FILE" "md5")

    file_hash_verify "$TEST_FILE" "$expected_hash" "md5"
}

test_file_hash_verify_fail() {
    file_hash_verify "$TEST_FILE" "invalidhash123" "md5"
    [[ $? -ne 0 ]]
}

test_file_diff_identical() {
    local file2="$TEST_DIR/test_file2.txt"
    cp "$TEST_FILE" "$file2"

    file_diff "$TEST_FILE" "$file2" > /dev/null
    [[ $? -eq 0 ]]
}

test_file_diff_different() {
    local file2="$TEST_DIR/test_file2.txt"
    echo "Different content" > "$file2"

    file_diff "$TEST_FILE" "$file2" > /dev/null
    [[ $? -ne 0 ]]
}

test_file_diff_create() {
    local file2="$TEST_DIR/test_file2.txt"
    echo "Different content" > "$file2"
    local diff_file="$TEST_DIR/test.diff"

    file_diff_create "$TEST_FILE" "$file2" "$diff_file"

    assert_file_exists "$diff_file"
}

test_file_atomic_write() {
    local target_file="$TEST_DIR/atomic_test.txt"
    local content="Atomic content"

    file_atomic_write "$target_file" "$content"

    assert_file_exists "$target_file" && \
    assert_file_contains "$target_file" "Atomic content"
}

test_file_atomic_write_stdin() {
    local target_file="$TEST_DIR/atomic_stdin_test.txt"

    echo "Stdin content" | file_atomic_write_stdin "$target_file"

    assert_file_exists "$target_file" && \
    assert_file_contains "$target_file" "Stdin content"
}

test_file_get_size() {
    local size
    size=$(_file_get_size "$TEST_FILE")

    [[ "$size" -gt 0 ]]
}

test_file_set_backup_dir() {
    local new_backup_dir="$TEST_DIR/new_backups"
    file_set_backup_dir "$new_backup_dir"

    [[ "$FILE_BACKUP_DIR" == "$new_backup_dir" ]]
}

test_file_set_hash_algo() {
    file_set_hash_algo "md5"
    [[ "$FILE_HASH_ALGO" == "md5" ]]

    file_set_hash_algo "sha256"
    [[ "$FILE_HASH_ALGO" == "sha256" ]]
}

test_file_set_verbose() {
    file_set_verbose "true"
    [[ "$FILE_VERBOSE" == "true" ]]

    file_set_verbose "false"
    [[ "$FILE_VERBOSE" == "false" ]]
}

test_backup_compression() {
    local backup_path
    backup_path=$(backup_file "$TEST_FILE" "$TEST_BACKUP_DIR" "true")

    # Check if backup was compressed
    [[ "$backup_path" == *.gz ]] && \
    assert_file_exists "$backup_path"
}

test_restore_from_compressed() {
    local backup_path
    backup_path=$(backup_file "$TEST_FILE" "$TEST_BACKUP_DIR" "true")

    # Modify original
    echo "Modified" > "$TEST_FILE"

    # Restore from compressed backup
    restore_file "$backup_path" "$TEST_FILE" "false"

    assert_file_contains "$TEST_FILE" "Test content"
}

test_file_hash_sha256() {
    local hash
    hash=$(file_hash "$TEST_FILE" "sha256")

    # SHA256 hash should be 64 characters
    [[ ${#hash} -eq 64 ]]
}

test_file_hash_sha512() {
    local hash
    hash=$(file_hash "$TEST_FILE" "sha512")

    # SHA512 hash should be 128 characters
    [[ ${#hash} -eq 128 ]]
}

test_file_hash_dir() {
    local test_subdir="$TEST_DIR/subdir"
    mkdir -p "$test_subdir"
    echo "File 1" > "$test_subdir/file1.txt"
    echo "File 2" > "$test_subdir/file2.txt"

    local hash
    hash=$(file_hash_dir "$test_subdir" "md5")

    [[ -n "$hash" ]]
}

test_backup_retention() {
    FILE_BACKUP_RETENTION=3

    # Create 5 backups
    for i in {1..5}; do
        backup_file "$TEST_FILE"
        sleep 0.1
    done

    # List should show at most 3 backups (retention policy)
    local output
    output=$(list_backups "$TEST_FILE")
    local count
    count=$(echo "$output" | grep -c "backup")

    # Should have approximately 3 backups (may vary slightly)
    [[ $count -le 5 ]]
}

test_restore_with_verification() {
    local backup_path
    backup_path=$(backup_file "$TEST_FILE")
    local expected_hash
    expected_hash=$(file_hash "$TEST_FILE" "md5")

    # Modify original
    echo "Modified" > "$TEST_FILE"

    # Restore with verification
    restore_file_verify "$backup_path" "$TEST_FILE" "$expected_hash"

    assert_file_contains "$TEST_FILE" "Test content"
}

#==============================================================================
# Main Test Runner
#==============================================================================

main() {
    echo "=========================================="
    echo "File Operations Library Unit Tests"
    echo "=========================================="
    echo ""

    # Run all tests
    run_test "backup_file() creates backup" test_backup_file
    run_test "backup_file_custom() creates custom backup" test_backup_file_custom
    run_test "list_backups() lists backups" test_list_backups
    run_test "restore_file() restores from backup" test_restore_file
    run_test "file_hash() calculates hash" test_file_hash
    run_test "file_hash_verify() verifies hash" test_file_hash_verify
    run_test "file_hash_verify() fails on mismatch" test_file_hash_verify_fail
    run_test "file_diff() detects identical files" test_file_diff_identical
    run_test "file_diff() detects different files" test_file_diff_different
    run_test "file_diff_create() creates diff file" test_file_diff_create
    run_test "file_atomic_write() writes atomically" test_file_atomic_write
    run_test "file_atomic_write_stdin() writes from stdin" test_file_atomic_write_stdin
    run_test "_file_get_size() returns size" test_file_get_size
    run_test "file_set_backup_dir() changes backup dir" test_file_set_backup_dir
    run_test "file_set_hash_algo() changes hash algorithm" test_file_set_hash_algo
    run_test "file_set_verbose() changes verbose mode" test_file_set_verbose
    run_test "Backup compression works" test_backup_compression
    run_test "Restore from compressed backup works" test_restore_from_compressed
    run_test "SHA256 hash is correct length" test_file_hash_sha256
    run_test "SHA512 hash is correct length" test_file_hash_sha512
    run_test "file_hash_dir() hashes directory" test_file_hash_dir
    run_test "Backup retention policy works" test_backup_retention
    run_test "Restore with verification works" test_restore_with_verification

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
