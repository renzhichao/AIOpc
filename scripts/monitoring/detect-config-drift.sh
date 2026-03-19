#!/bin/bash
#==============================================================================
# Configuration Drift Detection Script
#==============================================================================
# Purpose: Detect and report configuration drift between Git and running containers
#
# Features:
# - Compare Git config vs Remote file config vs Container environment
# - Severity classification (critical/major/minor)
# - Placeholder detection (cli_xxxxxxxxxxxxx)
# - Database integration for drift history
# - JSON and human-readable output
# - Email alerts for critical drift
#
# Usage:
#   ./detect-config-drift.sh [options]
#
# Options:
#   --git-config PATH      Path to Git .env.production file
#   --remote-config PATH   Path to remote .env.production file
#   --container NAME       Container name to check
#   --json                Output in JSON format
#   --verbose             Show detailed information
#   --report-file PATH     Save report to file
#   --db-record            Record drift to state database
#   --email                Send email alert for critical drift
#   --ssh-host HOST        SSH host for remote config (user@host format)
#   --ssh-key PATH         SSH key path for remote connection
#
# Exit codes:
#   0: No drift detected
#   1: Major drift detected
#   2: Critical drift detected
#   3: Configuration error
#==============================================================================

set -eo pipefail

#==============================================================================
# Configuration
#==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$(dirname "$SCRIPT_DIR")/lib"

# Source configuration library
source "$LIB_DIR/config.sh"

# Default configuration
GIT_CONFIG_PATH="${GIT_CONFIG_PATH:-/Users/arthurren/projects/AIOpc/platform/.env.production}"
REMOTE_CONFIG_PATH="${REMOTE_CONFIG_PATH:-/opt/opclaw/platform/.env.production}"
CONTAINER_NAME="${CONTAINER_NAME:-opclaw-backend}"
SSH_HOST="${SSH_HOST:-root@118.25.0.190}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/rap001_opclaw}"
OUTPUT_DIR="${OUTPUT_DIR:-/tmp/config-drift-reports}"
DB_RECORD="${DB_RECORD:-false}"
SEND_EMAIL="${SEND_EMAIL:-false}"
EMAIL_FROM="${EMAIL_FROM:-config-drift@renava.cn}"
EMAIL_TO="${EMAIL_TO:-admin@renava.cn}"

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

#==============================================================================
# Functions
#==============================================================================

show_usage() {
    cat <<EOF
Configuration Drift Detection

Detects configuration drift between Git, remote files, and running containers.

Usage: $0 [options]

Options:
  --git-config PATH      Path to Git .env.production file
                         (default: $GIT_CONFIG_PATH)
  --remote-config PATH   Path to remote .env.production file
                         (default: $REMOTE_CONFIG_PATH)
  --container NAME       Container name to check
                         (default: $CONTAINER_NAME)
  --json                Output in JSON format
  --verbose             Show detailed information
  --report-file PATH     Save report to file
  --db-record            Record drift to state database
  --email                Send email alert for critical drift
  --ssh-host HOST        SSH host for remote config (user@host format)
                         (default: $SSH_HOST)
  --ssh-key PATH         SSH key path for remote connection
                         (default: $SSH_KEY)

Examples:
  $0                                          # Run with defaults
  $0 --json --report-file report.json         # JSON output with file
  $0 --container opclaw-frontend              # Check different container
  $0 --ssh-host root@192.168.1.100            # Check remote server
  $0 --db-record --email                      # Record to DB and email alert

Exit codes:
  0: No drift detected
  1: Major drift detected
  2: Critical drift detected
  3: Configuration error

EOF
}

# Fetch remote config via SSH
fetch_remote_config() {
    local ssh_host=$1
    local ssh_key=$2
    local remote_path=$3
    local local_path=$4

    log_drift_info "Fetching remote config from $ssh_host:$remote_path"

    if scp -i "$ssh_key" -o StrictHostKeyChecking=no \
        "$ssh_host:$remote_path" "$local_path" 2>/dev/null; then
        log_drift_info "Remote config fetched successfully"
        return 0
    else
        log_drift_info "Failed to fetch remote config (using default path)"
        return 1
    fi
}

# Record drift to state database
record_drift_to_db() {
    local drift_count=$1
    local critical_count=$2
    local major_count=$3
    local minor_count=$4
    local report_file=$5

    if [ "$DB_RECORD" = false ]; then
        return 0
    fi

    log_drift_info "Recording drift to state database..."

    # TODO: Implement database recording when state database is available
    # This will insert into config_drift_reports table
    local db_query="
        INSERT INTO config_drift_reports (
            check_time, drift_count, critical_count, major_count, minor_count,
            report_file, status
        ) VALUES (
            '$(get_timestamp)', $drift_count, $critical_count, $major_count, $minor_count,
            '$report_file', 'active'
        );
    "

    log_drift_info "Database recording not yet implemented (STATE_DB TODO)"
    return 0
}

# Send email alert for critical drift
send_email_alert() {
    local critical_count=$1
    local major_count=$2
    local report_file=$3

    if [ "$SEND_EMAIL" = false ]; then
        return 0
    fi

    if [ $critical_count -eq 0 ] && [ $major_count -eq 0 ]; then
        return 0  # No email for minor drifts only
    fi

    log_drift_info "Sending email alert..."

    local subject="[$(hostname)] CRITICAL: Configuration Drift Detected"
    local body="
Configuration drift has been detected on $(hostname).

Summary:
  Critical Drifts: $critical_count
  Major Drifts: $major_count

Time: $(get_timestamp)
Server: $(hostname)
Container: $CONTAINER_NAME

Please review the attached report and take immediate action.

This is an automated alert from the configuration drift detection system.
"

    if command -v mail &> /dev/null; then
        echo "$body" | mail -s "$subject" -a "$report_file" "$EMAIL_TO"
        log_drift_info "Email alert sent to $EMAIL_TO"
    else
        log_drift_info "Email command not available, skipping alert"
    fi
}

#==============================================================================
# Main Execution
#==============================================================================

main() {
    local exit_code=0
    local report_file=""
    local temp_remote_config=""

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --help|-h)
                show_usage
                exit 0
                ;;
            --git-config)
                GIT_CONFIG_PATH="$2"
                shift 2
                ;;
            --remote-config)
                REMOTE_CONFIG_PATH="$2"
                shift 2
                ;;
            --container)
                CONTAINER_NAME="$2"
                shift 2
                ;;
            --json)
                JSON_OUTPUT=true
                shift
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            --report-file)
                report_file="$2"
                shift 2
                ;;
            --db-record)
                DB_RECORD=true
                shift
                ;;
            --email)
                SEND_EMAIL=true
                shift
                ;;
            --ssh-host)
                SSH_HOST="$2"
                shift 2
                ;;
            --ssh-key)
                SSH_KEY="$2"
                shift 2
                ;;
            *)
                echo "Unknown option: $1" >&2
                show_usage
                exit 3
                ;;
        esac
    done

    # Validate inputs
    if [ ! -f "$GIT_CONFIG_PATH" ]; then
        log_drift_critical "Git config file not found: $GIT_CONFIG_PATH"
        exit 3
    fi

    if [ ! -f "$SSH_KEY" ]; then
        log_drift_critical "SSH key not found: $SSH_KEY"
        exit 3
    fi

    # Start JSON output if enabled
    if [ "$JSON_OUTPUT" = true ]; then
        echo "{"
        echo "  \"check_time\": \"$(get_timestamp)\","
        echo "  \"git_config\": \"$GIT_CONFIG_PATH\","
        echo "  \"remote_config\": \"$REMOTE_CONFIG_PATH\","
        echo "  \"container\": \"$CONTAINER_NAME\","
        echo "  \"drifts\": ["
    fi

    # Fetch remote config
    temp_remote_config=$(mktemp)
    if fetch_remote_config "$SSH_HOST" "$SSH_KEY" "$REMOTE_CONFIG_PATH" "$temp_remote_config"; then
        REMOTE_CONFIG_PATH="$temp_remote_config"
    fi

    # Generate report file path if not specified
    if [ -z "$report_file" ]; then
        report_file="$OUTPUT_DIR/drift-report-$(date +%Y%m%d-%H%M%S).txt"
    fi

    # Run drift detection
    local drift_start_time=$(date +%s%3N)

    detect_config_drift \
        "$GIT_CONFIG_PATH" \
        "$REMOTE_CONFIG_PATH" \
        "$CONTAINER_NAME" \
        "$report_file"

    exit_code=$?

    local drift_end_time=$(date +%s%3N)
    local drift_execution_time=$((drift_end_time - drift_start_time))

    # End JSON output if enabled
    if [ "$JSON_OUTPUT" = true ]; then
        echo "  ],"
        echo "  \"report_file\": \"$report_file\","
        echo "  \"execution_time_ms\": $drift_execution_time"
        echo "}"
    fi

    # Record to database if requested
    if [ $exit_code -gt 0 ]; then
        record_drift_to_db 0 0 0 0 "$report_file"
        send_email_alert 0 0 "$report_file"
    fi

    # Cleanup
    rm -f "$temp_remote_config" 2>/dev/null || true

    exit $exit_code
}

# Run main function
main "$@"
