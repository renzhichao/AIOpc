#!/bin/bash
#==============================================================================
# SSH Operations Library
# (SSH操作库)
#
# Purpose: Provide secure SSH command execution and file transfer functions
#
# Features:
# - Remote command execution with timeout and retry
# - Secure file copy (SCP) with progress
# - Connection testing and validation
# - SSH key-based authentication support
# - Password-based authentication (with sshpass)
# - Error handling and logging integration
#
# Usage:
#   source /path/to/ssh.sh
#   ssh_exec "user@host" "command" [timeout] [retries]
#   ssh_scp "source_file" "user@host:/path" [timeout]
#   ssh_test "user@host"
#
# Dependencies:
# - openssh-client (ssh, scp)
# - sshpass (for password-based auth, optional)
# - coreutils (timeout, etc.)
#
# Version: 1.0
# Last Updated: 2026-03-19
#==============================================================================

#==============================================================================
# Configuration
#==============================================================================

# Default SSH options
declare  SSH_OPTS="${SSH_OPTS:- -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10 -o ServerAliveInterval=15 -o ServerAliveCountMax=3}"

# Default command timeout (seconds)
declare  SSH_TIMEOUT="${SSH_TIMEOUT:-300}"

# Default number of retries
declare  SSH_RETRIES="${SSH_RETRIES:-3}"

# Default retry delay (seconds)
declare  SSH_RETRY_DELAY="${SSH_RETRY_DELAY:-5}"

# SSH password (if using password-based auth)
declare  SSH_PASSWORD="${SSH_PASSWORD:-}"

# SSH key path
declare  SSH_KEY_PATH="${SSH_KEY_PATH:-}"

# SSH port (default: 22, use -p flag for custom port)
declare  SSH_PORT="${SSH_PORT:-22}"

# Verbose mode
declare  SSH_VERBOSE="${SSH_VERBOSE:-false}"

# Temporary directory for SSH operations
declare  SSH_TMP_DIR="${SSH_TMP_DIR:-/tmp/ssh_ops}"

#==============================================================================
# Logging Integration
#==============================================================================

# Define SSH-specific logging functions
# These wrap the general logging functions if available, otherwise use fallbacks
if [[ -n "${LOGGING_SH_Sourced:-}" ]]; then
    # logging.sh is already loaded, create SSH-specific wrappers
    ssh_log_info() { log_info "$*"; }
    ssh_log_error() { log_error "$*"; }
    ssh_log_warn() { log_warning "$*"; }
    ssh_log_debug() { log_debug "$*"; }
elif [[ -f "${SCRIPT_DIR}/logging.sh" ]]; then
    source "${SCRIPT_DIR}/logging.sh"
    ssh_log_info() { log_info "$*"; }
    ssh_log_error() { log_error "$*"; }
    ssh_log_warn() { log_warning "$*"; }
    ssh_log_debug() { log_debug "$*"; }
elif [[ -f "/usr/local/lib/logging.sh" ]]; then
    source "/usr/local/lib/logging.sh"
    ssh_log_info() { log_info "$*"; }
    ssh_log_error() { log_error "$*"; }
    ssh_log_warn() { log_warning "$*"; }
    ssh_log_debug() { log_debug "$*"; }
else
    # Fallback logging functions if logging.sh not available
    ssh_log_info() { echo "[SSH INFO] $*" >&2; }
    ssh_log_error() { echo "[SSH ERROR] $*" >&2; }
    ssh_log_warn() { echo "[SSH WARN] $*" >&2; }
    ssh_log_debug() { echo "[SSH DEBUG] $*" >&2; }
fi

#==============================================================================
# Utility Functions
#==============================================================================

# Create temporary directory for SSH operations
_ssh_init_tmp() {
    if [[ ! -d "$SSH_TMP_DIR" ]]; then
        mkdir -p "$SSH_TMP_DIR" 2>/dev/null || {
            ssh_log_error "Failed to create temporary directory: $SSH_TMP_DIR"
            return 1
        }
    fi
    return 0
}

# Cleanup temporary files
_ssh_cleanup() {
    if [[ -d "$SSH_TMP_DIR" ]]; then
        rm -rf "${SSH_TMP_DIR:?}"/* 2>/dev/null
    fi
    return 0
}

# Build SSH command with appropriate options
# Usage: _ssh_build_cmd [user@host]
_ssh_build_cmd() {
    local target="$1"
    local cmd="ssh"

    # Add SSH key if specified
    if [[ -n "$SSH_KEY_PATH" && -f "$SSH_KEY_PATH" ]]; then
        cmd="$cmd -i $SSH_KEY_PATH"
    fi

    # Add custom port if specified (not default 22)
    if [[ -n "$SSH_PORT" && "$SSH_PORT" != "22" ]]; then
        cmd="$cmd -p $SSH_PORT"
    fi

    # Add SSH options
    cmd="$cmd $SSH_OPTS"

    # Add target
    cmd="$cmd $target"

    echo "$cmd"
}

# Build SCP command with appropriate options
# Usage: _ssh_build_scp_cmd <source> <destination>
_ssh_build_scp_cmd() {
    local source="$1"
    local destination="$2"
    local cmd="scp"

    # Add SSH key if specified
    if [[ -n "$SSH_KEY_PATH" && -f "$SSH_KEY_PATH" ]]; then
        cmd="$cmd -i $SSH_KEY_PATH"
    fi

    # Add custom port if specified (not default 22)
    # Note: SCP uses -P (capital P) for port, not -p
    if [[ -n "$SSH_PORT" && "$SSH_PORT" != "22" ]]; then
        cmd="$cmd -P $SSH_PORT"
    fi

    # Add SSH options (SCP compatible)
    local scp_opts
    scp_opts=$(echo "$SSH_OPTS" | sed 's/-o StrictHostKeyChecking=no/-o StrictHostKeyChecking=no/g')

    cmd="$cmd $scp_opts"

    # Add source and destination
    cmd="$cmd $source $destination"

    echo "$cmd"
}

# Execute command with timeout using sshpass if password is set
# Usage: _ssh_exec_with_timeout <command> <timeout>
_ssh_exec_with_timeout() {
    local full_cmd="$1"
    local timeout="${2:-$SSH_TIMEOUT}"

    if [[ -n "$SSH_PASSWORD" ]]; then
        # Using sshpass for password authentication
        timeout "$timeout" sshpass -p "$SSH_PASSWORD" $full_cmd 2>&1
    else
        # Using key-based authentication
        timeout "$timeout" $full_cmd 2>&1
    fi
}

#==============================================================================
# Connection Testing
#==============================================================================

# Test SSH connection
# Usage: ssh_test <user@host> [timeout]
# Returns: 0 on success, 1 on failure
ssh_test() {
    local target="$1"
    local timeout="${2:-10}"

    ssh_log_debug "Testing SSH connection to: $target"

    local ssh_cmd
    ssh_cmd=$(_ssh_build_cmd "$target")

    # Simple connection test
    local test_cmd
    if [[ -n "$SSH_PASSWORD" ]]; then
        test_cmd="sshpass -p '$SSH_PASSWORD' timeout $timeout $ssh_cmd exit"
    else
        test_cmd="timeout $timeout $ssh_cmd exit"
    fi

    if eval "$test_cmd" 2>/dev/null; then
        ssh_log_info "SSH connection test successful: $target"
        return 0
    else
        ssh_log_error "SSH connection test failed: $target"
        return 1
    fi
}

# Test SSH connection with detailed diagnostics
# Usage: ssh_test_verbose <user@host> [timeout]
ssh_test_verbose() {
    local target="$1"
    local timeout="${2:-10}"

    echo "Testing SSH connection to: $target"
    echo "================================"

    # Check if host is reachable
    local host
    host=$(echo "$target" | cut -d'@' -f2)

    echo -n "1. Pinging host $host... "
    if ping -c 1 -W 2 "$host" &>/dev/null; then
        echo "✓ OK"
    else
        echo "✗ FAILED"
        echo "   Host is not reachable"
        return 1
    fi

    # Check if SSH port is open
    echo -n "2. Checking SSH port (22)... "
    if timeout 2 bash -c "cat < /dev/null > /dev/tcp/$host/22" 2>/dev/null; then
        echo "✓ OK"
    else
        echo "✗ FAILED"
        echo "   SSH port is not accessible"
        return 1
    fi

    # Test SSH connection
    echo -n "3. Testing SSH authentication... "
    if ssh_test "$target" "$timeout"; then
        echo "✓ OK"
        return 0
    else
        echo "✗ FAILED"
        echo "   SSH authentication failed"
        return 1
    fi
}

#==============================================================================
# Remote Command Execution
#==============================================================================

# Execute command on remote host
# Usage: ssh_exec <user@host> <command> [timeout] [retries]
# Returns: 0 on success, 1 on failure
ssh_exec() {
    local target="$1"
    local command="$2"
    local timeout="${3:-$SSH_TIMEOUT}"
    local retries="${4:-$SSH_RETRIES}"

    ssh_log_debug "Executing command on $target: $command"

    local attempt=1
    local output_file
    output_file="$(_ssh_init_tmp && mktemp "$SSH_TMP_DIR/ssh_output.XXXXXX")"

    while [[ $attempt -le $retries ]]; do
        ssh_log_debug "Attempt $attempt of $retries"

        local ssh_cmd
        ssh_cmd=$(_ssh_build_cmd "$target")

        # Execute command
        local full_cmd="$ssh_cmd '$command'"
        local result
        result=$(_ssh_exec_with_timeout "$full_cmd" "$timeout")
        local exit_code=$?

        if [[ $exit_code -eq 0 ]]; then
            ssh_log_info "Command executed successfully on $target"
            echo "$result"

            if [[ -f "$output_file" ]]; then
                rm -f "$output_file"
            fi
            return 0
        elif [[ $exit_code -eq 124 ]]; then
            ssh_log_warn "Command timed out on $target (attempt $attempt/$retries)"
        else
            ssh_log_warn "Command failed on $target with exit code $exit_code (attempt $attempt/$retries)"
        fi

        # Save output for next attempt
        echo "$result" > "$output_file"

        if [[ $attempt -lt $retries ]]; then
            ssh_log_info "Retrying in ${SSH_RETRY_DELAY}s..."
            sleep "$SSH_RETRY_DELAY"
        fi

        ((attempt++))
    done

    ssh_log_error "Command failed after $retries attempts on $target"

    if [[ -f "$output_file" ]]; then
        cat "$output_file"
        rm -f "$output_file"
    fi

    return 1
}

# Execute command and capture output
# Usage: ssh_exec_output <user@host> <command> [timeout] [retries]
# Returns: Output on stdout, 0 on success, 1 on failure
ssh_exec_output() {
    local target="$1"
    local command="$2"
    local timeout="${3:-$SSH_TIMEOUT}"
    local retries="${4:-$SSH_RETRIES}"

    ssh_log_debug "Capturing command output from $target"

    local output_file
    output_file="$(_ssh_init_tmp && mktemp "$SSH_TMP_DIR/ssh_output.XXXXXX")"

    if ssh_exec "$target" "$command" "$timeout" "$retries" > "$output_file" 2>&1; then
        cat "$output_file"
        rm -f "$output_file"
        return 0
    else
        rm -f "$output_file"
        return 1
    fi
}

# Execute command silently (no output)
# Usage: ssh_exec_silent <user@host> <command> [timeout] [retries]
ssh_exec_silent() {
    local target="$1"
    local command="$2"
    local timeout="${3:-$SSH_TIMEOUT}"
    local retries="${4:-$SSH_RETRIES}"

    ssh_log_debug "Executing command silently on $target"

    ssh_exec "$target" "$command" "$timeout" "$retries" > /dev/null 2>&1
}

# Execute command on multiple hosts
# Usage: ssh_exec_parallel <hosts_array> <command> [timeout] [retries]
ssh_exec_parallel() {
    local -n hosts_ref=$1
    local command="$2"
    local timeout="${3:-$SSH_TIMEOUT}"
    local retries="${4:-$SSH_RETRIES}"

    ssh_log_info "Executing command on ${#hosts_ref[@]} hosts in parallel"

    local pids=()
    local results=()

    for host in "${hosts_ref[@]}"; do
        {
            if ssh_exec "$host" "$command" "$timeout" "$retries"; then
                echo "SUCCESS:$host"
            else
                echo "FAILED:$host"
            fi
        } &
        pids+=($!)
    done

    # Wait for all background jobs
    local failed=0
    for i in "${!pids[@]}"; do
        wait "${pids[$i]}"
        result=$?
        results+=($result)
        if [[ $result -ne 0 ]]; then
            ((failed++))
        fi
    done

    ssh_log_info "Parallel execution complete: $(( ${#pids[@]} - failed ))/${#pids[@]} succeeded"

    return $failed
}

#==============================================================================
# File Transfer (SCP)
#==============================================================================

# Copy file to remote host
# Usage: ssh_scp_upload <local_file> <user@host:/remote/path> [timeout]
# Returns: 0 on success, 1 on failure
ssh_scp_upload() {
    local local_file="$1"
    local remote_path="$2"
    local timeout="${3:-$SSH_TIMEOUT}"

    if [[ ! -f "$local_file" ]]; then
        ssh_log_error "Local file not found: $local_file"
        return 1
    fi

    ssh_log_info "Uploading $local_file to $remote_path"

    local scp_cmd
    scp_cmd=$(_ssh_build_scp_cmd "$local_file" "$remote_path")

    if [[ -n "$SSH_PASSWORD" ]]; then
        timeout "$timeout" sshpass -p "$SSH_PASSWORD" $scp_cmd 2>&1
    else
        timeout "$timeout" $scp_cmd 2>&1
    fi

    local exit_code=$?

    if [[ $exit_code -eq 0 ]]; then
        ssh_log_info "File uploaded successfully"
        return 0
    elif [[ $exit_code -eq 124 ]]; then
        ssh_log_error "Upload timed out"
        return 1
    else
        ssh_log_error "Upload failed with exit code $exit_code"
        return 1
    fi
}

# Copy file from remote host
# Usage: ssh_scp_download <user@host:/remote/file> <local_path> [timeout]
# Returns: 0 on success, 1 on failure
ssh_scp_download() {
    local remote_file="$1"
    local local_path="$2"
    local timeout="${3:-$SSH_TIMEOUT}"

    ssh_log_info "Downloading $remote_file to $local_path"

    # Create local directory if needed
    local local_dir
    local_dir=$(dirname "$local_path")
    if [[ ! -d "$local_dir" ]]; then
        mkdir -p "$local_dir" || {
            ssh_log_error "Failed to create local directory: $local_dir"
            return 1
        }
    fi

    local scp_cmd
    scp_cmd=$(_ssh_build_scp_cmd "$remote_file" "$local_path")

    if [[ -n "$SSH_PASSWORD" ]]; then
        timeout "$timeout" sshpass -p "$SSH_PASSWORD" $scp_cmd 2>&1
    else
        timeout "$timeout" $scp_cmd 2>&1
    fi

    local exit_code=$?

    if [[ $exit_code -eq 0 ]]; then
        ssh_log_info "File downloaded successfully"
        return 0
    elif [[ $exit_code -eq 124 ]]; then
        ssh_log_error "Download timed out"
        return 1
    else
        ssh_log_error "Download failed with exit code $exit_code"
        return 1
    fi
}

# Copy directory recursively
# Usage: ssh_scp_upload_dir <local_dir> <user@host:/remote/path> [timeout]
ssh_scp_upload_dir() {
    local local_dir="$1"
    local remote_path="$2"
    local timeout="${3:-$SSH_TIMEOUT}"

    if [[ ! -d "$local_dir" ]]; then
        ssh_log_error "Local directory not found: $local_dir"
        return 1
    fi

    ssh_log_info "Uploading directory $local_dir to $remote_path"

    local scp_cmd
    scp_cmd=$(_ssh_build_scp_cmd "$local_dir" "$remote_path")
    scp_cmd="$scp_cmd -r"

    if [[ -n "$SSH_PASSWORD" ]]; then
        timeout "$timeout" sshpass -p "$SSH_PASSWORD" $scp_cmd 2>&1
    else
        timeout "$timeout" $scp_cmd 2>&1
    fi

    local exit_code=$?

    if [[ $exit_code -eq 0 ]]; then
        ssh_log_info "Directory uploaded successfully"
        return 0
    else
        ssh_log_error "Directory upload failed with exit code $exit_code"
        return 1
    fi
}

# Copy directory from remote host
# Usage: ssh_scp_download_dir <user@host:/remote/dir> <local_path> [timeout]
ssh_scp_download_dir() {
    local remote_dir="$1"
    local local_path="$2"
    local timeout="${3:-$SSH_TIMEOUT}"

    ssh_log_info "Downloading directory $remote_dir to $local_path"

    # Create local directory if needed
    if [[ ! -d "$local_path" ]]; then
        mkdir -p "$local_path" || {
            ssh_log_error "Failed to create local directory: $local_path"
            return 1
        }
    fi

    local scp_cmd
    scp_cmd=$(_ssh_build_scp_cmd "$remote_dir" "$local_path")
    scp_cmd="$scp_cmd -r"

    if [[ -n "$SSH_PASSWORD" ]]; then
        timeout "$timeout" sshpass -p "$SSH_PASSWORD" $scp_cmd 2>&1
    else
        timeout "$timeout" $scp_cmd 2>&1
    fi

    local exit_code=$?

    if [[ $exit_code -eq 0 ]]; then
        ssh_log_info "Directory downloaded successfully"
        return 0
    else
        ssh_log_error "Directory download failed with exit code $exit_code"
        return 1
    fi
}

#==============================================================================
# Configuration Functions
#==============================================================================

# Set SSH key path
# Usage: ssh_set_key <key_path>
ssh_set_key() {
    local key_path="$1"

    if [[ ! -f "$key_path" ]]; then
        ssh_log_error "SSH key not found: $key_path"
        return 1
    fi

    SSH_KEY_PATH="$key_path"
    ssh_log_debug "SSH key set: $key_path"
    return 0
}

# Set SSH password (for password-based authentication)
# Usage: ssh_set_password <password>
ssh_set_password() {
    SSH_PASSWORD="$1"
    ssh_log_debug "SSH password configured"
    return 0
}

# Set SSH timeout
# Usage: ssh_set_timeout <seconds>
ssh_set_timeout() {
    local timeout="$1"
    SSH_TIMEOUT="$timeout"
    ssh_log_debug "SSH timeout set to ${timeout}s"
    return 0
}

# Set number of retries
# Usage: ssh_set_retries <count>
ssh_set_retries() {
    local retries="$1"
    SSH_RETRIES="$retries"
    ssh_log_debug "SSH retries set to $retries"
    return 0
}

# Enable verbose mode
# Usage: ssh_set_verbose <true|false>
ssh_set_verbose() {
    SSH_VERBOSE="$1"
    ssh_log_debug "SSH verbose mode: $SSH_VERBOSE"
    return 0
}

#==============================================================================
# Cleanup and Export
#==============================================================================

# Export public functions
export -f ssh_test
export -f ssh_test_verbose
export -f ssh_exec
export -f ssh_exec_output
export -f ssh_exec_silent
export -f ssh_exec_parallel
export -f ssh_scp_upload
export -f ssh_scp_download
export -f ssh_scp_upload_dir
export -f ssh_scp_download_dir
export -f ssh_set_key
export -f ssh_set_password
export -f ssh_set_timeout
export -f ssh_set_retries
export -f ssh_set_verbose
