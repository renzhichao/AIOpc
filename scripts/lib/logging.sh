#!/bin/bash
#==============================================================================
# Logging Library
# (日志库)
#
# Purpose: Provide standardized logging functions with colors, levels, and file output
#
# Features:
# - Multiple log levels (DEBUG, INFO, WARNING, ERROR, SUCCESS)
# - Color-coded terminal output
# - Optional file logging with rotation
# - Timestamp support
# - Step tracking for multi-stage operations
# - Configurable log verbosity
#
# Usage:
#   source /path/to/logging.sh
#   log_init "my_script" "/var/log/my_script.log"
#   log_info "Starting operation"
#   log_step "Processing file"
#   log_success "File processed successfully"
#   log_error "Failed to process file"
#
# Dependencies:
# - bash 4+
# - coreutils (date, dirname)
#
# Version: 1.0
# Last Updated: 2026-03-19
#==============================================================================

#==============================================================================
# Configuration
#==============================================================================

# Log levels
declare -r LOG_LEVEL_DEBUG=0
declare -r LOG_LEVEL_INFO=1
declare -r LOG_LEVEL_WARNING=2
declare -r LOG_LEVEL_ERROR=3
declare -r LOG_LEVEL_SUCCESS=4

# Current log level (default: INFO)
LOG_CURRENT_LEVEL=${LOG_CURRENT_LEVEL:-$LOG_LEVEL_INFO}

# Log file path (optional)
LOG_FILE=${LOG_FILE:-""}

# Enable/disable file logging
LOG_TO_FILE=${LOG_TO_FILE:-false}

# Enable/disable timestamps
LOG_TIMESTAMPS=${LOG_TIMESTAMPS:-true}

# Log file max size (default: 10MB)
LOG_FILE_MAX_SIZE=${LOG_FILE_MAX_SIZE:-10485760}

# Script name for log prefixes
LOG_SCRIPT_NAME=${LOG_SCRIPT_NAME:-"script"}

# Step tracking
declare -i LOG_STEP_NUMBER=0
declare -a LOG_STEPS=()

# Colors (terminal detection)
if [ -t 1 ]; then
    declare -r LOG_RED='\033[0;31m'
    declare -r LOG_GREEN='\033[0;32m'
    declare -r LOG_YELLOW='\033[1;33m'
    declare -r LOG_BLUE='\033[0;34m'
    declare -r LOG_MAGENTA='\033[0;35m'
    declare -r LOG_CYAN='\033[0;36m'
    declare -r LOG_BOLD='\033[1m'
    declare -r LOG_NC='\033[0m' # No Color
else
    declare -r LOG_RED=''
    declare -r LOG_GREEN=''
    declare -r LOG_YELLOW=''
    declare -r LOG_BLUE=''
    declare -r LOG_MAGENTA=''
    declare -r LOG_CYAN=''
    declare -r LOG_BOLD=''
    declare -r LOG_NC=''
fi

#==============================================================================
# Core Logging Functions
#==============================================================================

# Initialize logging system
# Usage: log_init <script_name> [log_file_path]
log_init() {
    local script_name="${1:-$LOG_SCRIPT_NAME}"
    local log_file="${2:-}"

    LOG_SCRIPT_NAME="$script_name"

    if [[ -n "$log_file" ]]; then
        LOG_FILE="$log_file"
        LOG_TO_FILE=true

        # Create log directory if it doesn't exist
        local log_dir
        log_dir=$(dirname "$log_file")
        if [[ ! -d "$log_dir" ]]; then
            mkdir -p "$log_dir" 2>/dev/null || {
                log_warn "Failed to create log directory: $log_dir"
                LOG_TO_FILE=false
                return 1
            }
        fi

        # Initialize log file with header
        if [[ ! -f "$log_file" ]]; then
            {
                echo "# Log file for $script_name"
                echo "# Started: $(date '+%Y-%m-%d %H:%M:%S')"
                echo "#==============================================="
                echo ""
            } > "$log_file" 2>/dev/null || {
                log_warn "Failed to create log file: $log_file"
                LOG_TO_FILE=false
            }
        fi
    fi

    return 0
}

# Core logging function (internal use)
# Usage: _log <level> <level_num> <color> <message>
_log() {
    local level="$1"
    local level_num="$2"
    local color="$3"
    shift 3
    local message="$*"

    # Check if this level should be logged
    if [[ $level_num -lt $LOG_CURRENT_LEVEL ]]; then
        return 0
    fi

    # Build timestamp
    local timestamp=""
    if [[ "$LOG_TIMESTAMPS" == "true" ]]; then
        timestamp="[$(date '+%Y-%m-%d %H:%M:%S')]"
    fi

    # Build prefix
    local prefix="${color}[${level}]${LOG_NC}"
    if [[ -n "$timestamp" ]]; then
        prefix="${timestamp} ${prefix}"
    fi

    # Output to terminal
    echo -e "${prefix} ${message}" >&2

    # Output to file if enabled
    if [[ "$LOG_TO_FILE" == "true" && -n "$LOG_FILE" ]]; then
        # Strip color codes for file output
        local clean_message="${message//${LOG_RED}/}"
        clean_message="${clean_message//${LOG_GREEN}/}"
        clean_message="${clean_message//${LOG_YELLOW}/}"
        clean_message="${clean_message//${LOG_BLUE}/}"
        clean_message="${clean_message//${LOG_MAGENTA}/}"
        clean_message="${clean_message//${LOG_CYAN}/}"
        clean_message="${clean_message//${LOG_BOLD}/}"
        clean_message="${clean_message//${LOG_NC}/}"

        echo "${timestamp} [${level}] ${clean_message}" >> "$LOG_FILE" 2>/dev/null

        # Check log file size and rotate if necessary
        _log_rotate_if_needed
    fi

    return 0
}

# Rotate log file if it exceeds max size
_log_rotate_if_needed() {
    if [[ ! -f "$LOG_FILE" ]]; then
        return 0
    fi

    local file_size
    file_size=$(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)

    if [[ $file_size -ge $LOG_FILE_MAX_SIZE ]]; then
        local backup_file="${LOG_FILE}.$(date '+%Y%m%d_%H%M%S').bak"
        mv "$LOG_FILE" "$backup_file" 2>/dev/null

        # Create new log file with header
        {
            echo "# Log file for $LOG_SCRIPT_NAME (rotated)"
            echo "# Previous log: $backup_file"
            echo "# Rotated: $(date '+%Y-%m-%d %H:%M:%S')"
            echo "#==============================================="
            echo ""
        } > "$LOG_FILE" 2>/dev/null
    fi
}

#==============================================================================
# Public Logging Functions
#==============================================================================

# Log debug message
# Usage: log_debug <message>
log_debug() {
    _log "DEBUG" $LOG_LEVEL_DEBUG "$LOG_CYAN" "$@"
}

# Log info message
# Usage: log_info <message>
log_info() {
    _log "INFO" $LOG_LEVEL_INFO "$LOG_BLUE" "$@"
}

# Log warning message
# Usage: log_warning <message>
log_warning() {
    _log "WARNING" $LOG_LEVEL_WARNING "$LOG_YELLOW" "$@"
}

# Alias for log_warning
log_warn() {
    log_warning "$@"
}

# Log error message
# Usage: log_error <message>
log_error() {
    _log "ERROR" $LOG_LEVEL_ERROR "$LOG_RED" "$@"
}

# Log success message
# Usage: log_success <message>
log_success() {
    _log "SUCCESS" $LOG_LEVEL_SUCCESS "$LOG_GREEN" "$@"
}

#==============================================================================
# Step Tracking Functions
#==============================================================================

# Start a new step
# Usage: log_step <step_description>
log_step() {
    ((LOG_STEP_NUMBER++))
    local step_desc="$*"
    LOG_STEPS+=("$step_desc")

    local padded_num
    padded_num=$(printf "%02d" "$LOG_STEP_NUMBER")

    echo -e "${LOG_BOLD}${LOG_CYAN}[STEP ${padded_num}]${LOG_NC} $step_desc" >&2

    if [[ "$LOG_TO_FILE" == "true" && -n "$LOG_FILE" ]]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [STEP ${padded_num}] $step_desc" >> "$LOG_FILE" 2>/dev/null
    fi
}

# Mark current step as complete
# Usage: log_step_complete [message]
log_step_complete() {
    local message="${1:-Complete}"
    local padded_num
    padded_num=$(printf "%02d" "$LOG_STEP_NUMBER")

    echo -e "${LOG_GREEN}✓ [STEP ${padded_num}] ${message}${LOG_NC}" >&2

    if [[ "$LOG_TO_FILE" == "true" && -n "$LOG_FILE" ]]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [STEP ${padded_num}] ✓ ${message}" >> "$LOG_FILE" 2>/dev/null
    fi
}

# Mark current step as failed
# Usage: log_step_failed <reason>
log_step_failed() {
    local reason="$*"
    local padded_num
    padded_num=$(printf "%02d" "$LOG_STEP_NUMBER")

    echo -e "${LOG_RED}✗ [STEP ${padded_num}] Failed: ${reason}${LOG_NC}" >&2

    if [[ "$LOG_TO_FILE" == "true" && -n "$LOG_FILE" ]]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [STEP ${padded_num}] ✗ Failed: ${reason}" >> "$LOG_FILE" 2>/dev/null
    fi
}

# Reset step counter
# Usage: log_reset_steps
log_reset_steps() {
    LOG_STEP_NUMBER=0
    LOG_STEPS=()
}

#==============================================================================
# Utility Functions
#==============================================================================

# Set log level
# Usage: log_set_level <level>
# Valid levels: DEBUG, INFO, WARNING, ERROR, SUCCESS
log_set_level() {
    local level="${1^^}" # Convert to uppercase

    case "$level" in
        DEBUG)
            LOG_CURRENT_LEVEL=$LOG_LEVEL_DEBUG
            ;;
        INFO)
            LOG_CURRENT_LEVEL=$LOG_LEVEL_INFO
            ;;
        WARNING|WARN)
            LOG_CURRENT_LEVEL=$LOG_LEVEL_WARNING
            ;;
        ERROR)
            LOG_CURRENT_LEVEL=$LOG_LEVEL_ERROR
            ;;
        SUCCESS)
            LOG_CURRENT_LEVEL=$LOG_LEVEL_SUCCESS
            ;;
        *)
            log_error "Invalid log level: $level"
            return 1
            ;;
    esac

    return 0
}

# Enable file logging
# Usage: log_enable_file <log_file_path>
log_enable_file() {
    local log_file="$1"

    if [[ -z "$log_file" ]]; then
        log_error "Log file path required"
        return 1
    fi

    log_init "$LOG_SCRIPT_NAME" "$log_file"
}

# Disable file logging
# Usage: log_disable_file
log_disable_file() {
    LOG_TO_FILE=false
    LOG_FILE=""
}

# Get current log level
# Usage: log_get_level
log_get_level() {
    case "$LOG_CURRENT_LEVEL" in
        $LOG_LEVEL_DEBUG) echo "DEBUG" ;;
        $LOG_LEVEL_INFO) echo "INFO" ;;
        $LOG_LEVEL_WARNING) echo "WARNING" ;;
        $LOG_LEVEL_ERROR) echo "ERROR" ;;
        $LOG_LEVEL_SUCCESS) echo "SUCCESS" ;;
        *) echo "UNKNOWN" ;;
    esac
}

# Print separator line
# Usage: log_separator [char] [length]
log_separator() {
    local char="${1:-=}"
    local length="${2:-60}"
    local line=""
    for ((i=0; i<length; i++)); do
        line+="${char}"
    done
    echo -e "${LOG_CYAN}${line}${LOG_NC}" >&2

    if [[ "$LOG_TO_FILE" == "true" && -n "$LOG_FILE" ]]; then
        echo "$line" >> "$LOG_FILE" 2>/dev/null
    fi
}

# Print section header
# Usage: log_section <title>
log_section() {
    local title="$*"
    local line="================================================================================"
    local padding=20
    local title_len=${#title}
    local total_padding=$((padding * 2))
    local line_len=${#line}
    local available_space=$((line_len - total_padding - title_len))

    if [[ $available_space -lt 0 ]]; then
        available_space=0
    fi

    local left_pad=$((total_padding / 2))
    local right_pad=$((total_padding - left_pad))

    echo -e "${LOG_BOLD}${LOG_CYAN}${line}${LOG_NC}" >&2
    printf "${LOG_BOLD}${LOG_CYAN}%*s%s%*s${LOG_NC}\n" $left_pad "" "$title" $right_pad "" >&2
    echo -e "${LOG_BOLD}${LOG_CYAN}${line}${LOG_NC}" >&2

    if [[ "$LOG_TO_FILE" == "true" && -n "$LOG_FILE" ]]; then
        echo "$line" >> "$LOG_FILE" 2>/dev/null
        printf "%*s%s%*s\n" $left_pad "" "$title" $right_pad "" >> "$LOG_FILE" 2>/dev/null
        echo "$line" >> "$LOG_FILE" 2>/dev/null
    fi
}

#==============================================================================
# Cleanup and Export
#==============================================================================

# Export public functions
export -f log_init
export -f log_debug
export -f log_info
export -f log_warning
export -f log_warn
export -f log_error
export -f log_success
export -f log_step
export -f log_step_complete
export -f log_step_failed
export -f log_reset_steps
export -f log_set_level
export -f log_enable_file
export -f log_disable_file
export -f log_get_level
export -f log_separator
export -f log_section
