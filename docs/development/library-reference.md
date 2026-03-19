# Core Script Library Reference

**Version**: 1.0
**Last Updated**: 2026-03-19
**Status**: Production Ready

## Overview

This document provides comprehensive reference documentation for the core script libraries developed for the AIOpc multi-tenant deployment system. These libraries provide standardized functionality for logging, SSH operations, file operations, and error handling across all deployment scripts.

## Table of Contents

1. [Library Summary](#library-summary)
2. [Logging Library (logging.sh)](#logging-library-logging-sh)
3. [SSH Library (ssh.sh)](#ssh-library-ssh-sh)
4. [File Operations Library (file.sh)](#file-operations-library-file-sh)
5. [Error Handling Library (error.sh)](#error-handling-library-error-sh)
6. [Usage Examples](#usage-examples)
7. [Best Practices](#best-practices)

---

## Library Summary

| Library | Purpose | Key Features | Dependencies |
|---------|---------|--------------|--------------|
| **logging.sh** | Standardized logging | Multiple log levels, colors, file output, step tracking | bash 4+, coreutils |
| **ssh.sh** | Remote operations | Command execution, file transfer, connection testing | openssh-client, sshpass (optional) |
| **file.sh** | File operations | Backup/restore, hash calculation, diff generation | coreutils, diffutils, gzip |
| **error.sh** | Error management | Error codes, cleanup handlers, retry mechanism | bash 4+, logging.sh (optional) |

---

## Logging Library (logging.sh)

### Purpose

Provide a standardized logging system with multiple log levels, color-coded terminal output, optional file logging, and step tracking for multi-stage operations.

### Installation

```bash
source /path/to/logging.sh
```

### Configuration Variables

```bash
# Log levels
LOG_LEVEL_DEBUG=0
LOG_LEVEL_INFO=1
LOG_LEVEL_WARNING=2
LOG_LEVEL_ERROR=3
LOG_LEVEL_SUCCESS=4

# Current log level (default: INFO)
LOG_CURRENT_LEVEL=$LOG_LEVEL_INFO

# File logging
LOG_FILE=""                    # Log file path
LOG_TO_FILE=false              # Enable file logging
LOG_TIMESTAMPS=true            # Include timestamps
LOG_FILE_MAX_SIZE=10485760     # 10MB default

# Step tracking
LOG_STEP_NUMBER=0              # Current step number
LOG_STEPS=()                   # Step history array
```

### Public Functions

#### Initialization

##### `log_init <script_name> [log_file_path]`

Initialize the logging system.

**Parameters:**
- `script_name`: Name of the script for log prefixes
- `log_file_path`: (Optional) Path to log file

**Example:**
```bash
log_init "deploy_script" "/var/log/deploy.log"
```

#### Logging Functions

##### `log_debug <message>`

Log a debug message (lowest priority).

**Example:**
```bash
log_debug "Checking configuration file..."
```

##### `log_info <message>`

Log an informational message.

**Example:**
```bash
log_info "Starting deployment process"
```

##### `log_warning <message>`

Log a warning message.

**Example:**
```bash
log_warning "Configuration file not found, using defaults"
```

##### `log_error <message>`

Log an error message.

**Example:**
```bash
log_error "Failed to connect to database"
```

##### `log_success <message>`

Log a success message.

**Example:**
```bash
log_success "Deployment completed successfully"
```

#### Step Tracking

##### `log_step <step_description>`

Start a new step in a multi-stage operation.

**Example:**
```bash
log_step "Validating configuration"
# ... perform validation
log_step_complete
```

##### `log_step_complete [message]`

Mark the current step as complete.

**Parameters:**
- `message`: (Optional) Completion message (default: "Complete")

**Example:**
```bash
log_step_complete "All validations passed"
```

##### `log_step_failed <reason>`

Mark the current step as failed.

**Parameters:**
- `reason`: Failure reason

**Example:**
```bash
log_step_failed "Configuration validation failed"
```

##### `log_reset_steps`

Reset the step counter.

**Example:**
```bash
log_reset_steps
```

#### Utility Functions

##### `log_set_level <level>`

Set the current log level.

**Valid Levels:** DEBUG, INFO, WARNING, ERROR, SUCCESS

**Example:**
```bash
log_set_level "DEBUG"  # Show all messages
log_set_level "ERROR"  # Show only errors
```

##### `log_enable_file <log_file_path>`

Enable file logging.

**Example:**
```bash
log_enable_file "/var/log/my_script.log"
```

##### `log_disable_file`

Disable file logging.

**Example:**
```bash
log_disable_file
```

##### `log_get_level`

Get the current log level name.

**Example:**
```bash
current_level=$(log_get_level)
echo "Current level: $current_level"
```

##### `log_separator [char] [length]`

Print a separator line.

**Parameters:**
- `char`: (Optional) Character to use (default: "=")
- `length`: (Optional) Line length (default: 60)

**Example:**
```bash
log_separator
log_separator "-" 40
```

##### `log_section <title>`

Print a formatted section header.

**Example:**
```bash
log_section "Deployment Phase 1"
```

---

## SSH Library (ssh.sh)

### Purpose

Provide secure SSH command execution and file transfer functions with timeout, retry, and connection testing capabilities.

### Installation

```bash
source /path/to/ssh.sh
```

### Configuration Variables

```bash
# SSH options
SSH_OPTS=" -o StrictHostKeyChecking=no -o ConnectTimeout=10"
SSH_TIMEOUT=300              # Default timeout (seconds)
SSH_RETRIES=3                # Default retry count
SSH_RETRY_DELAY=5            # Delay between retries (seconds)
SSH_PASSWORD=""              # For password-based auth
SSH_KEY_PATH=""              # Path to SSH private key
SSH_VERBOSE=false            # Verbose mode
```

### Public Functions

#### Connection Testing

##### `ssh_test <user@host> [timeout]`

Test SSH connection to a remote host.

**Parameters:**
- `user@host`: SSH target
- `timeout`: (Optional) Connection timeout in seconds (default: 10)

**Returns:** 0 on success, 1 on failure

**Example:**
```bash
if ssh_test "root@192.168.1.100"; then
    echo "Connection successful"
fi
```

##### `ssh_test_verbose <user@host> [timeout]`

Test SSH connection with detailed diagnostics.

**Example:**
```bash
ssh_test_verbose "root@192.168.1.100"
```

#### Command Execution

##### `ssh_exec <user@host> <command> [timeout] [retries]`

Execute a command on a remote host.

**Parameters:**
- `user@host`: SSH target
- `command`: Command to execute
- `timeout`: (Optional) Timeout in seconds (default: 300)
- `retries`: (Optional) Number of retries (default: 3)

**Returns:** 0 on success, 1 on failure

**Example:**
```bash
ssh_exec "root@192.168.1.100" "systemctl status nginx"
```

##### `ssh_exec_output <user@host> <command> [timeout] [retries]`

Execute command and capture output.

**Example:**
```bash
output=$(ssh_exec_output "root@192.168.1.100" "cat /etc/os-release")
echo "$output"
```

##### `ssh_exec_silent <user@host> <command> [timeout] [retries]`

Execute command without output.

**Example:**
```bash
ssh_exec_silent "root@192.168.1.100" "apt-get update"
```

##### `ssh_exec_parallel <hosts_array> <command> [timeout] [retries]`

Execute command on multiple hosts in parallel.

**Example:**
```bash
hosts=("root@host1" "root@host2" "root@host3")
ssh_exec_parallel hosts "systemctl restart nginx"
```

#### File Transfer

##### `ssh_scp_upload <local_file> <user@host:/remote/path> [timeout]`

Upload file to remote host.

**Example:**
```bash
ssh_scp_upload "./config.yml" "root@192.168.1.100:/etc/app/config.yml"
```

##### `ssh_scp_download <user@host:/remote/file> <local_path> [timeout]`

Download file from remote host.

**Example:**
```bash
ssh_scp_download "root@192.168.1.100:/var/log/app.log" "./logs/"
```

##### `ssh_scp_upload_dir <local_dir> <user@host:/remote/path> [timeout]`

Upload directory recursively.

**Example:**
```bash
ssh_scp_upload_dir "./app" "root@192.168.1.100:/opt/"
```

##### `ssh_scp_download_dir <user@host:/remote/dir> <local_path> [timeout]`

Download directory recursively.

**Example:**
```bash
ssh_scp_download_dir "root@192.168.1.100:/etc/config" "./config-backup"
```

#### Configuration Functions

##### `ssh_set_key <key_path>`

Set SSH private key path.

**Example:**
```bash
ssh_set_key "~/.ssh/deployment_key"
```

##### `ssh_set_password <password>`

Set SSH password for password-based authentication.

**Example:**
```bash
ssh_set_password "mypassword"
```

##### `ssh_set_timeout <seconds>`

Set command timeout.

**Example:**
```bash
ssh_set_timeout 600
```

##### `ssh_set_retries <count>`

Set number of retries.

**Example:**
```bash
ssh_set_retries 5
```

---

## File Operations Library (file.sh)

### Purpose

Provide file backup, restore, hash calculation, and diff generation functions with support for compression and atomic operations.

### Installation

```bash
source /path/to/file.sh
```

### Configuration Variables

```bash
# Backup configuration
FILE_BACKUP_DIR="/var/backups/script_backups"
FILE_BACKUP_COMPRESS=true          # Compress backups with gzip
FILE_BACKUP_RETENTION=10           # Number of backups to keep
FILE_BACKUP_EXT=".backup"

# Hash configuration
FILE_HASH_ALGO="sha256"            # md5, sha256, sha512

# Temporary directories
FILE_TMP_DIR="/tmp/file_ops"
FILE_ATOMIC_DIR="/tmp/atomic_writes"

# Misc
FILE_VERBOSE=false                 # Verbose mode
```

### Public Functions

#### Backup Functions

##### `backup_file <file_path> [backup_dir] [compress]`

Create a timestamped backup of a file.

**Parameters:**
- `file_path`: Path to file to backup
- `backup_dir`: (Optional) Backup directory (default: $FILE_BACKUP_DIR)
- `compress`: (Optional) Compress with gzip (default: true)

**Returns:** Path to backup file on stdout

**Example:**
```bash
backup_path=$(backup_file "/etc/config.yml")
echo "Backup created: $backup_path"
```

##### `backup_file_custom <file_path> <suffix> [backup_dir]`

Create backup with custom suffix.

**Example:**
```bash
backup_file_custom "/etc/config.yml" "pre-deployment"
```

##### `list_backups <file_path> [backup_dir]`

List all backup files for a given file.

**Example:**
```bash
list_backups "/etc/config.yml"
```

#### Restore Functions

##### `restore_file <backup_file> <target_file> [validate]`

Restore file from backup.

**Parameters:**
- `backup_file`: Path to backup file
- `target_file`: Path to restore to
- `validate`: (Optional) Validate restored file (default: true)

**Example:**
```bash
restore_file "/var/backups/config.yml.backup.20240319" "/etc/config.yml"
```

##### `restore_file_verify <backup_file> <target_file> <expected_hash>`

Restore file with hash verification.

**Example:**
```bash
expected_hash=$(file_hash "/etc/config.yml" "sha256")
# ... modify file ...
restore_file_verify "/var/backups/config.yml.backup" "/etc/config.yml" "$expected_hash"
```

#### Hash Functions

##### `file_hash <file_path> [algorithm]`

Calculate file hash.

**Algorithms:** md5, sha256, sha512

**Example:**
```bash
hash=$(file_hash "/etc/config.yml" "sha256")
echo "SHA256: $hash"
```

##### `file_hash_verify <file_path> <expected_hash> [algorithm]`

Verify file hash matches expected value.

**Example:**
```bash
if file_hash_verify "/etc/config.yml" "abc123..." "sha256"; then
    echo "Hash verified"
fi
```

##### `file_hash_dir <directory_path> [algorithm]`

Calculate hash of directory contents (recursive).

**Example:**
```bash
dir_hash=$(file_hash_dir "/etc/app" "sha256")
```

#### Diff Functions

##### `file_diff <file1> <file2> [unified]`

Compare two files and show differences.

**Parameters:**
- `file1`: First file path
- `file2`: Second file path
- `unified`: (Optional) Use unified diff format (default: true)

**Returns:** 0 if identical, 1 if different

**Example:**
```bash
if ! file_diff "/etc/config.old.yml" "/etc/config.new.yml"; then
    echo "Files are different"
fi
```

##### `file_diff_create <file1> <file2> <diff_file>`

Create a diff file.

**Example:**
```bash
file_diff_create "/etc/config.old.yml" "/etc/config.new.yml" "/tmp/config.diff"
```

##### `file_diff_apply <diff_file> <target_file>`

Apply a diff file to a target file.

**Example:**
```bash
file_diff_apply "/tmp/config.diff" "/etc/config.yml"
```

#### Atomic Write Functions

##### `file_atomic_write <target_file> <content>`

Write to file atomically (prevents partial writes).

**Example:**
```bash
file_atomic_write "/etc/config.yml" "key: value"
```

##### `file_atomic_write_stdin <target_file>`

Write to file atomically from stdin.

**Example:**
```bash
cat "config.yml" | file_atomic_write_stdin "/etc/config.yml"
```

#### Configuration Functions

##### `file_set_backup_dir <directory>`

Set backup directory.

**Example:**
```bash
file_set_backup_dir "/mnt/backups"
```

##### `file_set_hash_algo <algorithm>`

Set hash algorithm.

**Example:**
```bash
file_set_hash_algo "sha512"
```

##### `file_set_verbose <true|false>`

Enable/disable verbose mode.

**Example:**
```bash
file_set_verbose true
```

---

## Error Handling Library (error.sh)

### Purpose

Provide comprehensive error handling with error codes, cleanup handlers, signal trapping, and retry mechanisms.

### Installation

```bash
source /path/to/error.sh
error_init "my_script"
trap_errors
```

### Error Codes

| Code | Name | Description |
|------|------|-------------|
| 0 | ERROR_SUCCESS | Success |
| 1 | ERROR_GENERAL | General error |
| 2 | ERROR_INVALID_ARGUMENT | Invalid argument |
| 3 | ERROR_MISSING_DEPENDENCY | Missing dependency |
| 4 | ERROR_PERMISSION_DENIED | Permission denied |
| 5 | ERROR_FILE_NOT_FOUND | File not found |
| 6 | ERROR_FILE_OPERATION | File operation failed |
| 7 | ERROR_NETWORK | Network error |
| 8 | ERROR_TIMEOUT | Operation timed out |
| 9 | ERROR_VALIDATION | Validation failed |
| 10 | ERROR_STATE | Invalid state |
| 11 | ERROR_CONFIGURATION | Configuration error |
| 12 | ERROR_DATABASE | Database error |
| 13 | ERROR_SSH | SSH operation failed |
| 14 | ERROR_DEPLOYMENT | Deployment failed |
| 15 | ERROR_ROLLBACK | Rollback failed |

### Public Functions

#### Initialization

##### `error_init <script_name> [verbose]`

Initialize error handling system.

**Example:**
```bash
error_init "deploy_script" true
```

##### `trap_errors`

Enable error trapping (ERR, EXIT, INT, TERM signals).

**Example:**
```bash
trap_errors
```

##### `untrap_errors`

Disable error trapping.

**Example:**
```bash
untrap_errors
```

#### Error Exit Functions

##### `exit_with_error [exit_code] [message]`

Exit with error message and run cleanup.

**Example:**
```bash
exit_with_error $ERROR_FILE_NOT_FOUND "Configuration file not found"
```

##### `exit_with_success [message]`

Exit with success message and run cleanup.

**Example:**
```bash
exit_with_success "Deployment completed successfully"
```

##### `die <error_code> <message>`

Exit with error (shorthand for exit_with_error).

**Example:**
```bash
die $ERROR_VALIDATION "Invalid configuration"
```

#### Cleanup Functions

##### `register_cleanup_function <function_name>`

Register a cleanup function to be called on exit.

**Example:**
```bash
cleanup_resources() {
    rm -rf /tmp/my_script_temp
}
register_cleanup_function cleanup_resources
```

##### `unregister_cleanup_function <function_name>`

Unregister a cleanup function.

**Example:**
```bash
unregister_cleanup_function cleanup_resources
```

##### `error_run_cleanup`

Manually run all registered cleanup functions.

**Example:**
```bash
error_run_cleanup
```

##### `error_clear_cleanup`

Clear all cleanup functions.

**Example:**
```bash
error_clear_cleanup
```

#### Retry Mechanism

##### `error_retry <max_attempts> <command> [args...]`

Execute command with retry.

**Example:**
```bash
error_retry 3 curl -s "https://api.example.com"
```

##### `error_retry_default <command> [args...]`

Execute command with default retry configuration.

**Example:**
```bash
error_retry_default systemctl restart nginx
```

#### Validation Functions

##### `error_validate_command <command>`

Validate that a command exists.

**Example:**
```bash
if ! error_validate_command "docker"; then
    exit_with_error $ERROR_MISSING_DEPENDENCY "Docker not found"
fi
```

##### `error_validate_file <file_path>`

Validate that a file exists and is readable.

**Example:**
```bash
error_validate_file "/etc/config.yml" || exit $?
```

##### `error_validate_directory <directory_path>`

Validate that a directory exists and is writable.

**Example:**
```bash
error_validate_directory "/var/log" || exit $?
```

##### `error_validate_not_empty <arg_name> <value>`

Validate that an argument is not empty.

**Example:**
```bash
error_validate_not_empty "config_file" "$CONFIG_FILE" || exit $?
```

##### `error_validate_numeric <arg_name> <value>`

Validate that an argument is numeric.

**Example:**
```bash
error_validate_numeric "port" "$PORT" || exit $?
```

#### Stack Trace Functions

##### `error_print_stack_trace`

Print error stack trace.

**Example:**
```bash
error_print_stack_trace
```

##### `error_clear_stack_trace`

Clear stack trace.

**Example:**
```bash
error_clear_stack_trace
```

##### `error_add_stack_frame <message>`

Add custom frame to stack trace.

**Example:**
```bash
error_add_stack_frame "Custom error in deployment"
```

#### Context Functions

##### `error_set_context <context_string>`

Set error context.

**Example:**
```bash
error_set_context "Deploying to production"
```

##### `error_get_context`

Get error context.

**Example:**
```bash
context=$(error_get_context)
```

##### `error_clear_context`

Clear error context.

**Example:**
```bash
error_clear_context
```

##### `error_get_info`

Get full error information.

**Example:**
```bash
error_get_info
```

#### Configuration Functions

##### `error_set_exit_on_error <true|false>`

Set whether to exit on error.

**Example:**
```bash
error_set_exit_on_error false
```

##### `error_set_verbose <true|false>`

Set verbose error reporting.

**Example:**
```bash
error_set_verbose true
```

##### `error_set_retry_config <max_attempts> <delay> <backoff>`

Set retry configuration.

**Example:**
```bash
error_set_retry_config 5 2 2  # 5 attempts, 2s delay, 2x backoff
```

---

## Usage Examples

### Complete Deployment Script Example

```bash
#!/bin/bash

# Source libraries
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/logging.sh"
source "${SCRIPT_DIR}/lib/ssh.sh"
source "${SCRIPT_DIR}/lib/file.sh"
source "${SCRIPT_DIR}/lib/error.sh"

# Initialize
error_init "deploy_production" true
trap_errors
log_init "deploy_production" "/var/log/deploy_production.log"
log_set_level "INFO"

# Register cleanup
cleanup_deployment() {
    log_info "Cleaning up deployment resources"
    rm -rf /tmp/deploy_temp
}
register_cleanup_function cleanup_deployment

# Validation
log_step "Validating prerequisites"
error_validate_command "docker" || die $ERROR_MISSING_DEPENDENCY "Docker required"
error_validate_file "$CONFIG_FILE" || die $ERROR_FILE_NOT_FOUND "Config file missing"
log_step_complete

# Backup
log_step "Creating backup"
backup_file "/etc/app/config.yml"
log_step_complete

# Deploy
log_step "Deploying to remote hosts"
hosts=("user@host1" "user@host2")
for host in "${hosts[@]}"; do
    if ssh_test "$host"; then
        ssh_scp_upload "$APP_ARCHIVE" "$host:/tmp/app.tar.gz"
        ssh_exec "$host" "docker-compose -f /tmp/app.tar.gz up -d"
    else
        log_error "Cannot connect to $host"
    fi
done
log_step_complete

# Success
exit_with_success "Deployment completed successfully"
```

### File Operations Example

```bash
#!/bin/bash

source "lib/file.sh"
source "lib/logging.sh"

log_init "file_operations"

# Create backup
backup_path=$(backup_file "/etc/config.yml")
log_info "Backup created: $backup_path"

# Modify file
file_atomic_write "/etc/config.yml" "new_key: new_value"

# Verify changes
if file_hash_verify "/etc/config.yml" "$expected_hash"; then
    log_success "File verified"
else
    log_error "Hash verification failed"
    restore_file "$backup_path" "/etc/config.yml"
fi

# Create diff
file_diff_create "/etc/config.old.yml" "/etc/config.new.yml" "/tmp/config.diff"
```

### Error Handling Example

```bash
#!/bin/bash

source "lib/error.sh"
source "lib/logging.sh"

error_init "robust_script" true
trap_errors

# Validate inputs
error_validate_not_empty "config_file" "$CONFIG_FILE"
error_validate_numeric "port" "$PORT"

# Set up cleanup
cleanup() {
    log_info "Running cleanup..."
    rm -rf /tmp/script_temp
}
register_cleanup_function cleanup

# Retry logic
log_step "Connecting to API"
error_retry 3 curl -s "https://api.example.com/health" || {
    log_step_failed "API unavailable"
    exit_with_error $ERROR_NETWORK "Cannot connect to API"
}
log_step_complete

# Success
exit_with_success "All operations completed"
```

---

## Best Practices

### 1. Library Sourcing Order

Always source libraries in this order:

```bash
source "lib/error.sh"    # First - for error handling
source "lib/logging.sh"  # Second - for logging
source "lib/file.sh"     # Third - for file operations
source "lib/ssh.sh"      # Fourth - for SSH operations
```

### 2. Initialization

Always initialize error handling before other operations:

```bash
error_init "my_script" true
trap_errors
log_init "my_script" "/var/log/my_script.log"
```

### 3. Cleanup Handlers

Register cleanup functions early in your script:

```bash
cleanup() {
    log_info "Cleaning up..."
    # Cleanup code
}
register_cleanup_function cleanup
```

### 4. Error Checking

Always check return codes:

```bash
if ! backup_file "$config_file"; then
    exit_with_error $ERROR_FILE_OPERATION "Backup failed"
fi
```

### 5. Logging

Use appropriate log levels:

- `log_debug`: Detailed diagnostics
- `log_info`: General information
- `log_warning`: Non-critical issues
- `log_error`: Errors that don't stop execution
- `log_success`: Successful completion

### 6. File Operations

Always backup before modifying:

```bash
backup_path=$(backup_file "$target_file")
# ... modify file ...
if ! restore_file "$backup_path" "$target_file"; then
    log_error "Restore failed"
fi
```

### 7. SSH Operations

Test connections before operations:

```bash
if ssh_test "$host"; then
    ssh_exec "$host" "command"
else
    log_error "Cannot connect to $host"
fi
```

### 8. Retry Logic

Use retry for unreliable operations:

```bash
error_retry 3 wget "https://example.com/file.zip"
```

### 9. Signal Handling

Always enable trap handlers:

```bash
trap_errors
# ... script code ...
# Cleanup runs automatically on exit/error
```

### 10. Configuration

Use configuration variables to customize behavior:

```bash
# Customize backup location
file_set_backup_dir "/mnt/backups"

# Customize log level
log_set_level "DEBUG"

# Customize SSH timeout
ssh_set_timeout 600
```

---

## Testing

All libraries include comprehensive unit tests:

```bash
# Run all tests
./scripts/tests/test-lib-logging.sh
./scripts/tests/test-lib-file.sh
./scripts/tests/test-lib-error.sh
```

---

## Troubleshooting

### Common Issues

**Issue**: Library not found
**Solution**: Ensure library path is correct and file is executable

**Issue**: Colors not showing
**Solution**: Terminal must support ANSI colors; check with `echo $TERM`

**Issue**: Log file not created
**Solution**: Check directory permissions and create log directory

**Issue**: SSH connection fails
**Solution**: Verify SSH key path and test connection manually first

**Issue**: Backup fails
**Solution**: Ensure backup directory exists and is writable

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-03-19 | Initial release |

---

## Support

For issues, questions, or contributions, please refer to the main project documentation or contact the development team.
