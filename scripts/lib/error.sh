#!/bin/bash
#==============================================================================
# Error Handling Library
# (错误处理库)
#
# Purpose: Provide comprehensive error handling, cleanup, and signal management
#
# Features:
# - Error code management with descriptive messages
# - Signal trapping (INT, TERM, EXIT, ERR)
# - Cleanup handler registration
# - Error context and stack trace
# - Retry mechanism with exponential backoff
# - Error recovery strategies
# - Integration with logging system
#
# Usage:
#   source /path/to/error.sh
#   error_init "my_script"
#   register_cleanup_function "cleanup_function"
#   trap_errors
#   # ... your code ...
#   exit_with_success "Operation completed"
#
# Dependencies:
# - bash 4+
# - logging.sh (optional, for integrated logging)
#
# Version: 1.0
# Last Updated: 2026-03-19
#==============================================================================

#==============================================================================
# Error Code Definitions
#==============================================================================

# General error codes
declare -ri ERROR_SUCCESS=0
declare -ri ERROR_GENERAL=1
declare -ri ERROR_INVALID_ARGUMENT=2
declare -ri ERROR_MISSING_DEPENDENCY=3
declare -ri ERROR_PERMISSION_DENIED=4
declare -ri ERROR_FILE_NOT_FOUND=5
declare -ri ERROR_FILE_OPERATION=6
declare -ri ERROR_NETWORK=7
declare -ri ERROR_TIMEOUT=8
declare -ri ERROR_VALIDATION=9
declare -ri ERROR_STATE=10
declare -ri ERROR_CONFIGURATION=11
declare -ri ERROR_DATABASE=12
declare -ri ERROR_SSH=13
declare -ri ERROR_DEPLOYMENT=14
declare -ri ERROR_ROLLBACK=15

# Error messages associative array
declare -A ERROR_MESSAGES=(
    [$ERROR_SUCCESS]="Success"
    [$ERROR_GENERAL]="General error"
    [$ERROR_INVALID_ARGUMENT]="Invalid argument"
    [$ERROR_MISSING_DEPENDENCY]="Missing dependency"
    [$ERROR_PERMISSION_DENIED]="Permission denied"
    [$ERROR_FILE_NOT_FOUND]="File not found"
    [$ERROR_FILE_OPERATION]="File operation failed"
    [$ERROR_NETWORK]="Network error"
    [$ERROR_TIMEOUT]="Operation timed out"
    [$ERROR_VALIDATION]="Validation failed"
    [$ERROR_STATE]="Invalid state"
    [$ERROR_CONFIGURATION]="Configuration error"
    [$ERROR_DATABASE]="Database error"
    [$ERROR_SSH]="SSH operation failed"
    [$ERROR_DEPLOYMENT]="Deployment failed"
    [$ERROR_ROLLBACK]="Rollback failed"
)

#==============================================================================
# State Variables
#==============================================================================

# Script name
declare  ERROR_SCRIPT_NAME="${ERROR_SCRIPT_NAME:-script}"

# Current error code
declare -i ERROR_CURRENT_CODE=0

# Current error message
declare  ERROR_CURRENT_MESSAGE=""

# Error context (additional information)
declare  ERROR_CONTEXT=""

# Cleanup functions array
declare -a ERROR_CLEANUP_FUNCTIONS=()

# Trap handler enabled flag
declare  ERROR_TRAPS_ENABLED=false

# Error handler enabled flag
declare  ERROR_HANDLER_ENABLED=false

# Verbose error reporting
declare  ERROR_VERBOSE="${ERROR_VERBOSE:-true}"

# Exit on error flag
declare  ERROR_EXIT_ON_ERROR="${ERROR_EXIT_ON_ERROR:-true}"

# Error stack trace
declare -a ERROR_STACK_TRACE=()

# Retry configuration
declare -i ERROR_RETRY_MAX="${ERROR_RETRY_MAX:-3}"
declare -i ERROR_RETRY_DELAY="${ERROR_RETRY_DELAY:-1}"
declare -i ERROR_RETRY_BACKOFF="${ERROR_RETRY_BACKOFF:-2}"

#==============================================================================
# Logging Integration
#==============================================================================

# Try to source logging library if available
if [[ -f "${SCRIPT_DIR}/logging.sh" ]]; then
    source "${SCRIPT_DIR}/logging.sh"
    ERROR_HAS_LOGGING=true
elif [[ -f "/usr/local/lib/logging.sh" ]]; then
    source "/usr/local/lib/logging.sh"
    ERROR_HAS_LOGGING=true
else
    ERROR_HAS_LOGGING=false
    # Fallback logging functions
    error_log_info() { echo "[ERROR INFO] $*" >&2; }
    error_log_error() { echo "[ERROR] $*" >&2; }
    error_log_warn() { echo "[ERROR WARN] $*" >&2; }
fi

#==============================================================================
# Error Message Functions
#==============================================================================

# Get error message for error code
# Usage: error_get_message <error_code>
error_get_message() {
    local code="$1"
    local message="${ERROR_MESSAGES[$code]}"

    if [[ -n "$message" ]]; then
        echo "$message"
    else
        echo "Unknown error code: $code"
    fi
}

# Set custom error message for error code
# Usage: error_set_message <error_code> <message>
error_set_message() {
    local code="$1"
    local message="$2"
    ERROR_MESSAGES[$code]="$message"
}

#==============================================================================
# Error Handler Functions
#==============================================================================

# Main error handler (called by trap)
# Usage: _error_handler <lineno> <bash_lineno>
_error_handler() {
    local lineno="$1"
    local bash_lineno="$2"

    # Get last command exit code
    local exit_code=$?

    # If exit code is 0, nothing to do
    if [[ $exit_code -eq 0 ]]; then
        return 0
    fi

    # Update current error state
    ERROR_CURRENT_CODE=$exit_code
    ERROR_CURRENT_MESSAGE="$(error_get_message "$exit_code")"

    # Add to stack trace
    ERROR_STACK_TRACE+=("Line $lineno: Exit code $exit_code")

    # Log error
    if [[ "$ERROR_HAS_LOGGING" == "true" ]]; then
        log_error "Error at line $lineno: $ERROR_CURRENT_MESSAGE"
    else
        error_log_error "Error at line $lineno: $ERROR_CURRENT_MESSAGE"
    fi

    # Print stack trace if verbose
    if [[ "$ERROR_VERBOSE" == "true" ]]; then
        error_print_stack_trace
    fi

    # Run cleanup functions
    error_run_cleanup

    # Exit if configured to do so
    if [[ "$ERROR_EXIT_ON_ERROR" == "true" ]]; then
        exit_with_error "$exit_code" "Exiting due to error"
    fi

    return 0
}

# Exit with error message
# Usage: exit_with_error [exit_code] [message]
exit_with_error() {
    local code="${1:-$ERROR_GENERAL}"
    local message="${2:-}"

    # Update error state
    ERROR_CURRENT_CODE=$code
    ERROR_CURRENT_MESSAGE="${message:-$(error_get_message "$code")}"

    # Log error
    if [[ "$ERROR_HAS_LOGGING" == "true" ]]; then
        log_error "$ERROR_CURRENT_MESSAGE"
    else
        error_log_error "$ERROR_CURRENT_MESSAGE"
    fi

    # Run cleanup
    error_run_cleanup

    # Exit
    exit "$code"
}

# Exit with success message
# Usage: exit_with_success [message]
exit_with_success() {
    local message="${1:-Operation completed successfully}"

    # Log success
    if [[ "$ERROR_HAS_LOGGING" == "true" ]]; then
        log_success "$message"
    else
        error_log_info "$message"
    fi

    # Run cleanup
    error_run_cleanup

    # Exit
    exit 0
}

# Exit with error code and message
# Usage: die <error_code> <message>
die() {
    local code="$1"
    shift
    local message="$*"

    exit_with_error "$code" "$message"
}

#==============================================================================
# Stack Trace Functions
#==============================================================================

# Print error stack trace
# Usage: error_print_stack_trace
error_print_stack_trace() {
    if [[ ${#ERROR_STACK_TRACE[@]} -eq 0 ]]; then
        return 0
    fi

    echo "Stack trace:" >&2
    echo "============" >&2
    local i=1
    for frame in "${ERROR_STACK_TRACE[@]}"; do
        echo "  #$i  $frame" >&2
        ((i++))
    done
    echo "" >&2
}

# Clear stack trace
# Usage: error_clear_stack_trace
error_clear_stack_trace() {
    ERROR_STACK_TRACE=()
}

# Add frame to stack trace
# Usage: error_add_stack_frame <message>
error_add_stack_frame() {
    local message="$*"
    ERROR_STACK_TRACE+=("$message")
}

#==============================================================================
# Cleanup Functions
#==============================================================================

# Register a cleanup function
# Usage: register_cleanup_function <function_name>
register_cleanup_function() {
    local func_name="$1"

    # Check if function exists
    if ! declare -F "$func_name" > /dev/null; then
        if [[ "$ERROR_HAS_LOGGING" == "true" ]]; then
            log_error "Cannot register non-existent function: $func_name"
        else
            error_log_error "Cannot register non-existent function: $func_name"
        fi
        return 1
    fi

    ERROR_CLEANUP_FUNCTIONS+=("$func_name")

    if [[ "$ERROR_HAS_LOGGING" == "true" ]]; then
        log_debug "Registered cleanup function: $func_name"
    fi

    return 0
}

# Unregister a cleanup function
# Usage: unregister_cleanup_function <function_name>
unregister_cleanup_function() {
    local func_name="$1"
    local new_array=()

    for func in "${ERROR_CLEANUP_FUNCTIONS[@]}"; do
        if [[ "$func" != "$func_name" ]]; then
            new_array+=("$func")
        fi
    done

    ERROR_CLEANUP_FUNCTIONS=("${new_array[@]}")

    if [[ "$ERROR_HAS_LOGGING" == "true" ]]; then
        log_debug "Unregistered cleanup function: $func_name"
    fi
}

# Run all registered cleanup functions
# Usage: error_run_cleanup
error_run_cleanup() {
    if [[ ${#ERROR_CLEANUP_FUNCTIONS[@]} -eq 0 ]]; then
        return 0
    fi

    if [[ "$ERROR_HAS_LOGGING" == "true" ]]; then
        log_info "Running ${#ERROR_CLEANUP_FUNCTIONS[@]} cleanup function(s)"
    fi

    for func in "${ERROR_CLEANUP_FUNCTIONS[@]}"; do
        if [[ "$ERROR_HAS_LOGGING" == "true" ]]; then
            log_debug "Running cleanup: $func"
        fi

        # Run cleanup function
        "$func" 2>/dev/null || {
            if [[ "$ERROR_HAS_LOGGING" == "true" ]]; then
                log_warn "Cleanup function failed: $func"
            else
                error_log_warn "Cleanup function failed: $func"
            fi
        }
    done

    return 0
}

# Clear all cleanup functions
# Usage: error_clear_cleanup
error_clear_cleanup() {
    ERROR_CLEANUP_FUNCTIONS=()
}

#==============================================================================
# Trap Handling Functions
#==============================================================================

# Initialize error handling system
# Usage: error_init <script_name> [verbose]
error_init() {
    local script_name="${1:-script}"
    ERROR_SCRIPT_NAME="$script_name"
    ERROR_VERBOSE="${2:-true}"

    # Reset state
    ERROR_CURRENT_CODE=0
    ERROR_CURRENT_MESSAGE=""
    ERROR_CONTEXT=""
    ERROR_STACK_TRACE=()

    if [[ "$ERROR_HAS_LOGGING" == "true" ]]; then
        log_debug "Error handling initialized for: $script_name"
    fi
}

# Enable error trapping
# Usage: trap_errors
trap_errors() {
    if [[ "$ERROR_TRAPS_ENABLED" == "true" ]]; then
        return 0
    fi

    # Trap ERR signal (errors)
    trap '_error_handler ${LINENO} ${BASH_LINENO}' ERR

    # Trap EXIT signal (always run cleanup)
    trap 'error_run_cleanup' EXIT

    # Trap INT and TERM signals (interrupts)
    trap 'error_handle_interrupt' INT TERM

    ERROR_TRAPS_ENABLED=true
    ERROR_HANDLER_ENABLED=true

    if [[ "$ERROR_HAS_LOGGING" == "true" ]]; then
        log_debug "Error trapping enabled"
    fi
}

# Disable error trapping
# Usage: untrap_errors
untrap_errors() {
    if [[ "$ERROR_TRAPS_ENABLED" == "false" ]]; then
        return 0
    fi

    # Clear all traps
    trap - ERR EXIT INT TERM

    ERROR_TRAPS_ENABLED=false
    ERROR_HANDLER_ENABLED=false

    if [[ "$ERROR_HAS_LOGGING" == "true" ]]; then
        log_debug "Error trapping disabled"
    fi
}

# Handle interrupt signals
# Usage: error_handle_interrupt
error_handle_interrupt() {
    if [[ "$ERROR_HAS_LOGGING" == "true" ]]; then
        log_warning "Interrupt signal received"
    else
        error_log_warn "Interrupt signal received"
    fi

    error_run_cleanup

    if [[ "$ERROR_HAS_LOGGING" == "true" ]]; then
        log_info "Exiting due to interrupt"
    fi

    exit 130
}

#==============================================================================
# Retry Mechanism
#==============================================================================

# Execute command with retry
# Usage: error_retry <max_attempts> <command> [args...]
error_retry() {
    local max_attempts="$1"
    shift
    local command=("$@")
    local attempt=1
    local delay=$ERROR_RETRY_DELAY

    while [[ $attempt -le $max_attempts ]]; do
        if [[ "$ERROR_HAS_LOGGING" == "true" ]]; then
            log_debug "Attempt $attempt of $max_attempts: ${command[*]}"
        fi

        # Execute command
        if "${command[@]}"; then
            return 0
        fi

        local exit_code=$?

        if [[ $attempt -lt $max_attempts ]]; then
            if [[ "$ERROR_HAS_LOGGING" == "true" ]]; then
                log_info "Command failed (exit code: $exit_code), retrying in ${delay}s..."
            else
                error_log_info "Command failed (exit code: $exit_code), retrying in ${delay}s..."
            fi

            sleep "$delay"

            # Exponential backoff
            delay=$((delay * ERROR_RETRY_BACKOFF))
        fi

        ((attempt++))
    done

    if [[ "$ERROR_HAS_LOGGING" == "true" ]]; then
        log_error "Command failed after $max_attempts attempts"
    else
        error_log_error "Command failed after $max_attempts attempts"
    fi

    return 1
}

# Execute command with default retry configuration
# Usage: error_retry_default <command> [args...]
error_retry_default() {
    error_retry "$ERROR_RETRY_MAX" "$@"
}

#==============================================================================
# Validation Functions
#==============================================================================

# Validate command exists
# Usage: error_validate_command <command>
error_validate_command() {
    local cmd="$1"

    if ! command -v "$cmd" &> /dev/null; then
        if [[ "$ERROR_HAS_LOGGING" == "true" ]]; then
            log_error "Required command not found: $cmd"
        else
            error_log_error "Required command not found: $cmd"
        fi
        return 1
    fi

    return 0
}

# Validate file exists and is readable
# Usage: error_validate_file <file_path>
error_validate_file() {
    local file="$1"

    if [[ ! -f "$file" ]]; then
        if [[ "$ERROR_HAS_LOGGING" == "true" ]]; then
            log_error "File not found: $file"
        else
            error_log_error "File not found: $file"
        fi
        return $ERROR_FILE_NOT_FOUND
    fi

    if [[ ! -r "$file" ]]; then
        if [[ "$ERROR_HAS_LOGGING" == "true" ]]; then
            log_error "File not readable: $file"
        else
            error_log_error "File not readable: $file"
        fi
        return $ERROR_PERMISSION_DENIED
    fi

    return 0
}

# Validate directory exists and is writable
# Usage: error_validate_directory <directory_path>
error_validate_directory() {
    local dir="$1"

    if [[ ! -d "$dir" ]]; then
        if [[ "$ERROR_HAS_LOGGING" == "true" ]]; then
            log_error "Directory not found: $dir"
        else
            error_log_error "Directory not found: $dir"
        fi
        return $ERROR_FILE_NOT_FOUND
    fi

    if [[ ! -w "$dir" ]]; then
        if [[ "$ERROR_HAS_LOGGING" == "true" ]]; then
            log_error "Directory not writable: $dir"
        else
            error_log_error "Directory not writable: $dir"
        fi
        return $ERROR_PERMISSION_DENIED
    fi

    return 0
}

# Validate argument is not empty
# Usage: error_validate_not_empty <arg_name> <value>
error_validate_not_empty() {
    local arg_name="$1"
    local value="$2"

    if [[ -z "$value" ]]; then
        if [[ "$ERROR_HAS_LOGGING" == "true" ]]; then
            log_error "Argument cannot be empty: $arg_name"
        else
            error_log_error "Argument cannot be empty: $arg_name"
        fi
        return $ERROR_INVALID_ARGUMENT
    fi

    return 0
}

# Validate numeric argument
# Usage: error_validate_numeric <arg_name> <value>
error_validate_numeric() {
    local arg_name="$1"
    local value="$2"

    if ! [[ "$value" =~ ^[0-9]+$ ]]; then
        if [[ "$ERROR_HAS_LOGGING" == "true" ]]; then
            log_error "Argument must be numeric: $arg_name"
        else
            error_log_error "Argument must be numeric: $arg_name"
        fi
        return $ERROR_INVALID_ARGUMENT
    fi

    return 0
}

#==============================================================================
# Context Management
#==============================================================================

# Set error context
# Usage: error_set_context <context_string>
error_set_context() {
    ERROR_CONTEXT="$*"
}

# Get error context
# Usage: error_get_context
error_get_context() {
    echo "$ERROR_CONTEXT"
}

# Clear error context
# Usage: error_clear_context
error_clear_context() {
    ERROR_CONTEXT=""
}

# Get full error info (code, message, context)
# Usage: error_get_info
error_get_info() {
    echo "Error Code: $ERROR_CURRENT_CODE"
    echo "Error Message: $ERROR_CURRENT_MESSAGE"
    if [[ -n "$ERROR_CONTEXT" ]]; then
        echo "Context: $ERROR_CONTEXT"
    fi
}

#==============================================================================
# Configuration Functions
#==============================================================================

# Enable/disable exit on error
# Usage: error_set_exit_on_error <true|false>
error_set_exit_on_error() {
    ERROR_EXIT_ON_ERROR="$1"
}

# Enable/disable verbose error reporting
# Usage: error_set_verbose <true|false>
error_set_verbose() {
    ERROR_VERBOSE="$1"
}

# Set retry configuration
# Usage: error_set_retry_config <max_attempts> <delay> <backoff>
error_set_retry_config() {
    local max="$1"
    local delay="$2"
    local backoff="${3:-2}"

    error_validate_numeric "max_attempts" "$max" || return 1
    error_validate_numeric "delay" "$delay" || return 1
    error_validate_numeric "backoff" "$backoff" || return 1

    ERROR_RETRY_MAX=$max
    ERROR_RETRY_DELAY=$delay
    ERROR_RETRY_BACKOFF=$backoff
}

#==============================================================================
# Cleanup and Export
#==============================================================================

# Export public functions
export -f error_init
export -f error_get_message
export -f error_set_message
export -f exit_with_error
export -f exit_with_success
export -f die
export -f trap_errors
export -f untrap_errors
export -f error_handle_interrupt
export -f register_cleanup_function
export -f unregister_cleanup_function
export -f error_run_cleanup
export -f error_clear_cleanup
export -f error_print_stack_trace
export -f error_clear_stack_trace
export -f error_add_stack_frame
export -f error_retry
export -f error_retry_default
export -f error_validate_command
export -f error_validate_file
export -f error_validate_directory
export -f error_validate_not_empty
export -f error_validate_numeric
export -f error_set_context
export -f error_get_context
export -f error_clear_context
export -f error_get_info
export -f error_set_exit_on_error
export -f error_set_verbose
export -f error_set_retry_config

# Export error codes
export ERROR_SUCCESS
export ERROR_GENERAL
export ERROR_INVALID_ARGUMENT
export ERROR_MISSING_DEPENDENCY
export ERROR_PERMISSION_DENIED
export ERROR_FILE_NOT_FOUND
export ERROR_FILE_OPERATION
export ERROR_NETWORK
export ERROR_TIMEOUT
export ERROR_VALIDATION
export ERROR_STATE
export ERROR_CONFIGURATION
export ERROR_DATABASE
export ERROR_SSH
export ERROR_DEPLOYMENT
export ERROR_ROLLBACK
