#!/bin/bash
#==============================================================================
# File Operations Library
# (文件操作库)
#
# Purpose: Provide file backup, restore, hash calculation, and diff functions
#
# Features:
# - File backup with timestamp and compression
# - File restore from backup with validation
# - Hash calculation (MD5, SHA256, SHA512)
# - File comparison with detailed diff output
# - File existence and permission validation
# - Safe file operations with atomic writes
# - Temporary file management
#
# Usage:
#   source /path/to/file.sh
#   backup_file "/etc/config.yml"
#   restore_file "/etc/config.yml.backup.20240319_143022"
#   file_hash "/path/to/file" "sha256"
#   file_diff "/path/to/file1" "/path/to/file2"
#
# Dependencies:
# - coreutils (cp, mv, md5sum, sha256sum, sha512sum, stat)
# - diffutils (diff)
# - gzip (for backup compression)
#
# Version: 1.0
# Last Updated: 2026-03-19
#==============================================================================

#==============================================================================
# Configuration
#==============================================================================

# Backup directory
declare -g FILE_BACKUP_DIR="${FILE_BACKUP_DIR:-/var/backups/script_backups}"

# Enable compression for backups
declare -g FILE_BACKUP_COMPRESS="${FILE_BACKUP_COMPRESS:-true}"

# Number of backups to retain
declare -g FILE_BACKUP_RETENTION="${FILE_BACKUP_RETENTION:-10}"

# Backup file extension
declare -g FILE_BACKUP_EXT="${FILE_BACKUP_EXT:-.backup}"

# Hash algorithm (md5, sha256, sha512)
declare -g FILE_HASH_ALGO="${FILE_HASH_ALGO:-sha256}"

# Temporary file directory
declare -g FILE_TMP_DIR="${FILE_TMP_DIR:-/tmp/file_ops}"

# Atomic write buffer directory
declare -g FILE_ATOMIC_DIR="${FILE_ATOMIC_DIR:-/tmp/atomic_writes}"

# Verbose mode
declare -g FILE_VERBOSE="${FILE_VERBOSE:-false}"

#==============================================================================
# Logging Integration
#==============================================================================

# Try to source logging library if available
if [[ -f "${SCRIPT_DIR}/logging.sh" ]]; then
    source "${SCRIPT_DIR}/logging.sh"
elif [[ -f "/usr/local/lib/logging.sh" ]]; then
    source "/usr/local/lib/logging.sh"
else
    # Fallback logging functions
    file_log_info() { echo "[FILE INFO] $*" >&2; }
    file_log_error() { echo "[FILE ERROR] $*" >&2; }
    file_log_warn() { echo "[FILE WARN] $*" >&2; }
    file_log_debug() { echo "[FILE DEBUG] $*" >&2; }
fi

#==============================================================================
# Utility Functions
#==============================================================================

# Initialize backup directory
_file_init_backup_dir() {
    if [[ ! -d "$FILE_BACKUP_DIR" ]]; then
        mkdir -p "$FILE_BACKUP_DIR" 2>/dev/null || {
            file_log_error "Failed to create backup directory: $FILE_BACKUP_DIR"
            return 1
        }
    fi
    return 0
}

# Initialize temporary directories
_file_init_tmp() {
    if [[ ! -d "$FILE_TMP_DIR" ]]; then
        mkdir -p "$FILE_TMP_DIR" 2>/dev/null || {
            file_log_error "Failed to create temp directory: $FILE_TMP_DIR"
            return 1
        }
    fi
    if [[ ! -d "$FILE_ATOMIC_DIR" ]]; then
        mkdir -p "$FILE_ATOMIC_DIR" 2>/dev/null || {
            file_log_error "Failed to create atomic write directory: $FILE_ATOMIC_DIR"
            return 1
        }
    fi
    return 0
}

# Get file size in bytes
# Usage: _file_get_size <file_path>
_file_get_size() {
    local file="$1"

    if [[ ! -f "$file" ]]; then
        echo "0"
        return 1
    fi

    # Try stat (Linux)
    local size
    size=$(stat -c%s "$file" 2>/dev/null) && {
        echo "$size"
        return 0
    }

    # Try stat (macOS)
    size=$(stat -f%z "$file" 2>/dev/null) && {
        echo "$size"
        return 0
    }

    # Fallback to wc
    size=$(wc -c < "$file" 2>/dev/null) && {
        echo "$size"
        return 0
    }

    echo "0"
    return 1
}

# Validate file exists and is readable
# Usage: _file_validate_readable <file_path>
_file_validate_readable() {
    local file="$1"

    if [[ ! -e "$file" ]]; then
        file_log_error "File does not exist: $file"
        return 1
    fi

    if [[ ! -f "$file" ]]; then
        file_log_error "Not a regular file: $file"
        return 1
    fi

    if [[ ! -r "$file" ]]; then
        file_log_error "File is not readable: $file"
        return 1
    fi

    return 0
}

# Validate directory exists and is writable
# Usage: _file_validate_writable_dir <dir_path>
_file_validate_writable_dir() {
    local dir="$1"

    if [[ ! -d "$dir" ]]; then
        file_log_error "Directory does not exist: $dir"
        return 1
    fi

    if [[ ! -w "$dir" ]]; then
        file_log_error "Directory is not writable: $dir"
        return 1
    fi

    return 0
}

#==============================================================================
# Backup Functions
#==============================================================================

# Create backup of a file with timestamp
# Usage: backup_file <file_path> [backup_dir] [compress]
# Returns: 0 on success, path to backup file on stdout
backup_file() {
    local source_file="$1"
    local backup_dir="${2:-$FILE_BACKUP_DIR}"
    local compress="${3:-$FILE_BACKUP_COMPRESS}"

    file_log_info "Creating backup of: $source_file"

    # Validate source file
    if ! _file_validate_readable "$source_file"; then
        return 1
    fi

    # Initialize backup directory
    _file_init_backup_dir || return 1

    # Generate backup filename with timestamp
    local timestamp
    timestamp=$(date '+%Y%m%d_%H%M%S')
    local base_name
    base_name=$(basename "$source_file")
    local backup_file="${backup_dir}/${base_name}${FILE_BACKUP_EXT}.${timestamp}"

    # Check if backup already exists
    if [[ -f "$backup_file" ]]; then
        file_log_warn "Backup file already exists: $backup_file"
        # Add microseconds to make unique
        local usecs
        usecs=$(date '+%s%N' | cut -c1-13)
        backup_file="${backup_dir}/${base_name}${FILE_BACKUP_EXT}.${timestamp}_${usecs}"
    fi

    # Create backup
    if cp "$source_file" "$backup_file"; then
        file_log_info "Backup created: $backup_file"

        # Compress if requested
        if [[ "$compress" == "true" ]]; then
            if gzip -f "$backup_file"; then
                backup_file="${backup_file}.gz"
                file_log_info "Backup compressed: $backup_file"
            else
                file_log_warn "Failed to compress backup, keeping uncompressed"
            fi
        fi

        # Cleanup old backups
        _file_cleanup_old_backups "$backup_dir" "$base_name"

        # Output backup file path
        echo "$backup_file"
        return 0
    else
        file_log_error "Failed to create backup: $backup_file"
        return 1
    fi
}

# Cleanup old backup files
# Usage: _file_cleanup_old_backups <backup_dir> <file_basename>
_file_cleanup_old_backups() {
    local backup_dir="$1"
    local base_name="$2"

    # List backup files sorted by modification time (oldest first)
    local backups
    backups=$(ls -t "${backup_dir}/${base_name}${FILE_BACKUP_EXT}".* 2>/dev/null)

    if [[ -z "$backups" ]]; then
        return 0
    fi

    # Count backups
    local count
    count=$(echo "$backups" | wc -l)

    # Remove old backups if we have more than retention count
    if [[ $count -gt $FILE_BACKUP_RETENTION ]]; then
        local to_remove=$((count - FILE_BACKUP_RETENTION))
        file_log_info "Cleaning up $to_remove old backup(s)"

        # Get the oldest backups
        local old_backups
        old_backups=$(echo "$backups" | tail -n "$to_remove")

        # Remove old backups
        while IFS= read -r old_backup; do
            if rm -f "$old_backup"; then
                file_log_debug "Removed old backup: $old_backup"
            else
                file_log_warn "Failed to remove old backup: $old_backup"
            fi
        done <<< "$old_backups"
    fi

    return 0
}

# Create backup with custom suffix
# Usage: backup_file_custom <file_path> <suffix> [backup_dir]
backup_file_custom() {
    local source_file="$1"
    local suffix="$2"
    local backup_dir="${3:-$FILE_BACKUP_DIR}"

    file_log_info "Creating backup with suffix '$suffix': $source_file"

    # Validate source file
    if ! _file_validate_readable "$source_file"; then
        return 1
    fi

    # Initialize backup directory
    _file_init_backup_dir || return 1

    # Generate backup filename
    local base_name
    base_name=$(basename "$source_file")
    local backup_file="${backup_dir}/${base_name}.${suffix}"

    # Create backup
    if cp "$source_file" "$backup_file"; then
        file_log_info "Backup created: $backup_file"
        echo "$backup_file"
        return 0
    else
        file_log_error "Failed to create backup: $backup_file"
        return 1
    fi
}

# List all backup files for a given file
# Usage: list_backups <file_path> [backup_dir]
list_backups() {
    local source_file="$1"
    local backup_dir="${2:-$FILE_BACKUP_DIR}"
    local base_name
    base_name=$(basename "$source_file")

    _file_init_backup_dir || return 1

    # List backup files sorted by modification time (newest first)
    local backups
    backups=$(ls -t "${backup_dir}/${base_name}${FILE_BACKUP_EXT}".* 2>/dev/null)

    if [[ -z "$backups" ]]; then
        file_log_info "No backups found for: $source_file"
        return 1
    fi

    echo "Backups for $source_file:"
    echo "========================"
    while IFS= read -r backup; do
        local size
        size=$(_file_get_size "$backup")
        local mtime
        mtime=$(stat -c%y "$backup" 2>/dev/null | cut -d'.' -f1 || stat -f "%Sm" "$backup" 2>/dev/null)
        printf "%-60s %10s bytes  %s\n" "$backup" "$size" "$mtime"
    done <<< "$backups"

    return 0
}

#==============================================================================
# Restore Functions
#==============================================================================

# Restore file from backup
# Usage: restore_file <backup_file> <target_file> [validate]
# Returns: 0 on success, 1 on failure
restore_file() {
    local backup_file="$1"
    local target_file="$2"
    local validate="${3:-true}"

    file_log_info "Restoring from backup: $backup_file"

    # Validate backup file
    if ! _file_validate_readable "$backup_file"; then
        return 1
    fi

    # Check if backup is compressed
    local decompressed_backup="$backup_file"
    if [[ "$backup_file" == *.gz ]]; then
        decompressed_backup="${backup_file%.gz}"
        if ! gunzip -c "$backup_file" > "$decompressed_backup"; then
            file_log_error "Failed to decompress backup: $backup_file"
            return 1
        fi
    fi

    # Create backup of current file before restoring
    if [[ -f "$target_file" ]]; then
        file_log_info "Backing up current file before restore"
        backup_file_custom "$target_file" "pre-restore" || {
            file_log_warn "Failed to create pre-restore backup, continuing anyway"
        }
    fi

    # Restore file
    if cp "$decompressed_backup" "$target_file"; then
        file_log_info "File restored successfully: $target_file"

        # Validate restored file
        if [[ "$validate" == "true" ]]; then
            if ! _file_validate_readable "$target_file"; then
                file_log_error "Restored file validation failed: $target_file"
                return 1
            fi
            file_log_info "Restored file validated successfully"
        fi

        # Clean up decompressed file if we created it
        if [[ "$backup_file" == *.gz && -f "$decompressed_backup" ]]; then
            rm -f "$decompressed_backup"
        fi

        return 0
    else
        file_log_error "Failed to restore file: $target_file"
        # Clean up decompressed file if we created it
        if [[ "$backup_file" == *.gz && -f "$decompressed_backup" ]]; then
            rm -f "$decompressed_backup"
        fi
        return 1
    fi
}

# Restore file with hash verification
# Usage: restore_file_verify <backup_file> <target_file> <expected_hash>
restore_file_verify() {
    local backup_file="$1"
    local target_file="$2"
    local expected_hash="$3"

    file_log_info "Restoring with hash verification: $backup_file"

    # Restore file
    if ! restore_file "$backup_file" "$target_file" false; then
        return 1
    fi

    # Verify hash
    local actual_hash
    actual_hash=$(file_hash "$target_file" "$FILE_HASH_ALGO")

    if [[ "$actual_hash" == "$expected_hash" ]]; then
        file_log_info "Hash verification successful"
        return 0
    else
        file_log_error "Hash verification failed"
        file_log_error "Expected: $expected_hash"
        file_log_error "Actual: $actual_hash"
        return 1
    fi
}

#==============================================================================
# Hash Functions
#==============================================================================

# Calculate file hash
# Usage: file_hash <file_path> [algorithm]
# Returns: Hash value on stdout
# Algorithms: md5, sha256, sha512
file_hash() {
    local file="$1"
    local algo="${2:-$FILE_HASH_ALGO}"

    # Validate file
    if ! _file_validate_readable "$file"; then
        return 1
    fi

    # Calculate hash based on algorithm
    local hash
    case "$algo" in
        md5)
            hash=$(md5sum "$file" 2>/dev/null | cut -d' ' -f1)
            ;;
        sha256)
            hash=$(sha256sum "$file" 2>/dev/null | cut -d' ' -f1)
            ;;
        sha512)
            hash=$(sha512sum "$file" 2>/dev/null | cut -d' ' -f1)
            ;;
        *)
            file_log_error "Unsupported hash algorithm: $algo"
            return 1
            ;;
    esac

    if [[ -n "$hash" ]]; then
        echo "$hash"
        file_log_debug "File hash ($algo): $hash"
        return 0
    else
        file_log_error "Failed to calculate hash: $file"
        return 1
    fi
}

# Verify file hash
# Usage: file_hash_verify <file_path> <expected_hash> [algorithm]
# Returns: 0 if match, 1 if mismatch
file_hash_verify() {
    local file="$1"
    local expected_hash="$2"
    local algo="${3:-$FILE_HASH_ALGO}"

    file_log_debug "Verifying hash for: $file"

    local actual_hash
    actual_hash=$(file_hash "$file" "$algo")

    if [[ "$actual_hash" == "$expected_hash" ]]; then
        file_log_info "Hash verification successful"
        return 0
    else
        file_log_error "Hash verification failed"
        file_log_error "Expected: $expected_hash"
        file_log_error "Actual: $actual_hash"
        return 1
    fi
}

# Calculate hash of directory (recursive)
# Usage: file_hash_dir <directory_path> [algorithm]
file_hash_dir() {
    local dir="$1"
    local algo="${2:-$FILE_HASH_ALGO}"

    if [[ ! -d "$dir" ]]; then
        file_log_error "Directory not found: $dir"
        return 1
    fi

    file_log_debug "Calculating directory hash: $dir"

    # Create a list of all files with their hashes
    local temp_file
    temp_file=$(_file_init_tmp && mktemp "$FILE_TMP_DIR/dirhash.XXXXXX")

    # Find all files sorted by path, calculate hash for each
    find "$dir" -type f -print0 | sort -z | while IFS= read -r -d '' file; do
        local relative_path="${file#$dir}"
        local file_hash
        file_hash=$(file_hash "$file" "$algo")
        echo "$file_hash  $relative_path"
    done > "$temp_file"

    # Calculate hash of the hash list
    local dir_hash
    dir_hash=$(file_hash "$temp_file" "$algo")

    rm -f "$temp_file"

    echo "$dir_hash"
    return 0
}

#==============================================================================
# Diff Functions
#==============================================================================

# Compare two files and show differences
# Usage: file_diff <file1> <file2> [unified]
# Returns: 0 if identical, 1 if different
file_diff() {
    local file1="$1"
    local file2="$2"
    local unified="${3:-true}"

    file_log_debug "Comparing files: $file1 vs $file2"

    # Validate both files
    _file_validate_readable "$file1" || return 1
    _file_validate_readable "$file2" || return 1

    # Compare files
    if diff "$file1" "$file2" > /dev/null 2>&1; then
        file_log_info "Files are identical"
        return 0
    else
        file_log_info "Files are different"

        if [[ "$FILE_VERBOSE" == "true" ]]; then
            if [[ "$unified" == "true" ]]; then
                echo "=== Differences ==="
                diff -u "$file1" "$file2" || true
            else
                echo "=== Differences ==="
                diff "$file1" "$file2" || true
            fi
        fi

        return 1
    fi
}

# Create a diff file
# Usage: file_diff_create <file1> <file2> <diff_file>
file_diff_create() {
    local file1="$1"
    local file2="$2"
    local diff_file="$3"

    file_log_info "Creating diff file: $diff_file"

    # Validate both files
    _file_validate_readable "$file1" || return 1
    _file_validate_readable "$file2" || return 1

    # Create diff
    if diff -u "$file1" "$file2" > "$diff_file" 2>&1; then
        file_log_info "Files are identical, no diff created"
        rm -f "$diff_file"
        return 0
    else
        file_log_info "Diff file created: $diff_file"
        return 0
    fi
}

# Apply a diff file
# Usage: file_diff_apply <diff_file> <target_file>
file_diff_apply() {
    local diff_file="$1"
    local target_file="$2"

    file_log_info "Applying diff to: $target_file"

    # Validate diff file
    _file_validate_readable "$diff_file" || return 1

    # Create backup of target file
    if [[ -f "$target_file" ]]; then
        backup_file "$target_file" || {
            file_log_error "Failed to create backup before applying diff"
            return 1
        }
    fi

    # Apply diff
    if patch "$target_file" < "$diff_file"; then
        file_log_info "Diff applied successfully"
        return 0
    else
        file_log_error "Failed to apply diff"
        return 1
    fi
}

#==============================================================================
# Atomic Write Functions
#==============================================================================

# Write to file atomically (write to temp, then move)
# Usage: file_atomic_write <target_file> <content>
file_atomic_write() {
    local target_file="$1"
    local content="$2"

    _file_init_tmp || return 1

    # Create temp file in same filesystem as target
    local target_dir
    target_dir=$(dirname "$target_file")
    local temp_file
    temp_file=$(mktemp "${target_dir}/.atomic_write.XXXXXX")

    # Write content to temp file
    if ! printf '%s' "$content" > "$temp_file"; then
        file_log_error "Failed to write to temp file: $temp_file"
        rm -f "$temp_file"
        return 1
    fi

    # Move temp file to target (atomic operation)
    if ! mv "$temp_file" "$target_file"; then
        file_log_error "Failed to move temp file to target: $target_file"
        rm -f "$temp_file"
        return 1
    fi

    file_log_debug "Atomic write successful: $target_file"
    return 0
}

# Write file from stdin atomically
# Usage: cat <file> | file_atomic_write_stdin <target_file>
file_atomic_write_stdin() {
    local target_file="$1"

    _file_init_tmp || return 1

    # Create temp file
    local target_dir
    target_dir=$(dirname "$target_file")
    local temp_file
    temp_file=$(mktemp "${target_dir}/.atomic_write.XXXXXX")

    # Write stdin to temp file
    if ! cat > "$temp_file"; then
        file_log_error "Failed to write stdin to temp file: $temp_file"
        rm -f "$temp_file"
        return 1
    fi

    # Move temp file to target
    if ! mv "$temp_file" "$target_file"; then
        file_log_error "Failed to move temp file to target: $target_file"
        rm -f "$temp_file"
        return 1
    fi

    file_log_debug "Atomic write from stdin successful: $target_file"
    return 0
}

#==============================================================================
# Configuration Functions
#==============================================================================

# Set backup directory
# Usage: file_set_backup_dir <directory>
file_set_backup_dir() {
    local dir="$1"

    if [[ ! -d "$dir" ]]; then
        mkdir -p "$dir" || {
            file_log_error "Failed to create backup directory: $dir"
            return 1
        }
    fi

    FILE_BACKUP_DIR="$dir"
    file_log_debug "Backup directory set to: $dir"
    return 0
}

# Set hash algorithm
# Usage: file_set_hash_algo <algorithm>
file_set_hash_algo() {
    local algo="$1"

    case "$algo" in
        md5|sha256|sha512)
            FILE_HASH_ALGO="$algo"
            file_log_debug "Hash algorithm set to: $algo"
            return 0
            ;;
        *)
            file_log_error "Invalid hash algorithm: $algo"
            return 1
            ;;
    esac
}

# Enable/disable verbose mode
# Usage: file_set_verbose <true|false>
file_set_verbose() {
    FILE_VERBOSE="$1"
    file_log_debug "Verbose mode: $FILE_VERBOSE"
    return 0
}

#==============================================================================
# Cleanup and Export
#==============================================================================

# Export public functions
export -f backup_file
export -f backup_file_custom
export -f list_backups
export -f restore_file
export -f restore_file_verify
export -f file_hash
export -f file_hash_verify
export -f file_hash_dir
export -f file_diff
export -f file_diff_create
export -f file_diff_apply
export -f file_atomic_write
export -f file_atomic_write_stdin
export -f file_set_backup_dir
export -f file_set_hash_algo
export -f file_set_verbose
