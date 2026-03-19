#!/bin/bash
#==============================================================================
# Configuration Drift Check Scheduler
#==============================================================================
# Purpose: Schedule daily configuration drift checks with automated reporting
#
# Features:
# - Cron job installation and management
# - Daily drift checks at configurable times
# - Automated report generation and retention
# - Email alerts for critical drift
# - Log rotation for check history
#
# Usage:
#   ./schedule-drift-check.sh [action]
#
# Actions:
#   install       Install cron job for daily checks
#   uninstall     Remove cron job
#   status        Show cron job status
#   run-now       Run drift check immediately
#   test          Run test drift check with verbose output
#
# Configuration:
#   CRON_SCHEDULE: Cron schedule (default: 0 2 * * * for 2 AM daily)
#   REPORT_RETENTION_DAYS: Days to keep reports (default: 30)
#   LOG_RETENTION_DAYS: Days to keep logs (default: 7)
#==============================================================================

set -euo pipefail

#==============================================================================
# Configuration
#==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DETECT_SCRIPT="$SCRIPT_DIR/detect-config-drift.sh"

# Default configuration
CRON_SCHEDULE="${CRON_SCHEDULE:-0 2 * * *}"  # 2 AM daily
REPORT_RETENTION_DAYS="${REPORT_RETENTION_DAYS:-30}"
LOG_RETENTION_DAYS="${LOG_RETENTION_DAYS:-7}"

# Paths
OUTPUT_DIR="${OUTPUT_DIR:-/tmp/config-drift-reports}"
LOG_DIR="${LOG_DIR:-/var/log/config-drift}"
CRON_JOB_MARKER="config-drift-check"

# Email configuration
EMAIL_FROM="${EMAIL_FROM:-config-drift@renava.cn}"
EMAIL_TO="${EMAIL_TO:-admin@renava.cn}"

# Create directories
mkdir -p "$OUTPUT_DIR"
mkdir -p "$LOG_DIR"

#==============================================================================
# Functions
#==============================================================================

log_info() {
    echo -e "\033[0;34m[INFO]\033[0m $1"
}

log_success() {
    echo -e "\033[0;32m[✓]\033[0m $1"
}

log_error() {
    echo -e "\033[0;31m[✗]\033[0m $1"
}

log_warning() {
    echo -e "\033[1;33m[⚠]\033[0m $1"
}

# Install cron job
install_cron_job() {
    log_info "Installing configuration drift check cron job..."

    # Check if script exists
    if [ ! -f "$DETECT_SCRIPT" ]; then
        log_error "Detection script not found: $DETECT_SCRIPT"
        return 1
    fi

    # Make script executable
    chmod +x "$DETECT_SCRIPT"

    # Check if cron job already exists
    local existing_job
    existing_job=$(crontab -l 2>/dev/null | grep -F "$CRON_JOB_MARKER" || true)

    if [ -n "$existing_job" ]; then
        log_warning "Cron job already exists:"
        echo "$existing_job"
        echo
        read -p "Replace existing job? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Installation cancelled"
            return 0
        fi

        # Remove existing job
        crontab -l 2>/dev/null | grep -v "$CRON_JOB_MARKER" | crontab -
    fi

    # Create cron command
    local cron_cmd="$CRON_SCHEDULE $DETECT_SCRIPT --db-record --email >> $LOG_DIR/check.log 2>&1 #$CRON_JOB_MARKER"

    # Install cron job
    (crontab -l 2>/dev/null; echo "$cron_cmd") | crontab -

    log_success "Cron job installed successfully"
    echo
    echo "Schedule: $CRON_SCHEDULE"
    echo "Log file: $LOG_DIR/check.log"
    echo "Report directory: $OUTPUT_DIR"
    echo
    echo "To view cron job: crontab -l | grep $CRON_JOB_MARKER"
    echo "To view logs: tail -f $LOG_DIR/check.log"
}

# Uninstall cron job
uninstall_cron_job() {
    log_info "Removing configuration drift check cron job..."

    # Check if job exists
    local existing_job
    existing_job=$(crontab -l 2>/dev/null | grep -F "$CRON_JOB_MARKER" || true)

    if [ -z "$existing_job" ]; then
        log_warning "No cron job found"
        return 0
    fi

    # Remove job
    crontab -l 2>/dev/null | grep -v "$CRON_JOB_MARKER" | crontab -

    log_success "Cron job removed successfully"
}

# Show cron job status
show_status() {
    log_info "Configuration drift check status"
    echo

    # Check cron job
    local existing_job
    existing_job=$(crontab -l 2>/dev/null | grep -F "$CRON_JOB_MARKER" || true)

    if [ -n "$existing_job" ]; then
        log_success "Cron job: Installed"
        echo "Schedule: $(echo $existing_job | cut -d'#' -f1)"
    else
        log_warning "Cron job: Not installed"
    fi

    echo

    # Check recent reports
    log_info "Recent reports:"
    if [ -d "$OUTPUT_DIR" ]; then
        local recent_reports
        recent_reports=$(find "$OUTPUT_DIR" -name "drift-report-*.txt" -mtime -1 2>/dev/null | wc -l)

        if [ "$recent_reports" -gt 0 ]; then
            echo "Found $recent_reports report(s) in last 24 hours"
            echo
            echo "Latest reports:"
            ls -lt "$OUTPUT_DIR"/drift-report-*.txt 2>/dev/null | head -5 | awk '{print "  " $9 " (" $6 " " $7 " " $8 ")"}'
        else
            echo "No recent reports found"
        fi
    else
        echo "Report directory not found: $OUTPUT_DIR"
    fi

    echo

    # Check disk usage
    log_info "Disk usage:"
    du -sh "$OUTPUT_DIR" 2>/dev/null || echo "  Unable to determine"
    du -sh "$LOG_DIR" 2>/dev/null || echo "  Unable to determine"
}

# Run drift check immediately
run_now() {
    log_info "Running configuration drift check now..."

    if [ ! -f "$DETECT_SCRIPT" ]; then
        log_error "Detection script not found: $DETECT_SCRIPT"
        return 1
    fi

    "$DETECT_SCRIPT" --verbose --db-record --email
}

# Run test drift check
run_test() {
    log_info "Running test configuration drift check..."
    echo

    if [ ! -f "$DETECT_SCRIPT" ]; then
        log_error "Detection script not found: $DETECT_SCRIPT"
        return 1
    fi

    # Run with verbose output and no database/email
    "$DETECT_SCRIPT" --verbose
}

# Cleanup old reports and logs
cleanup_old_files() {
    log_info "Cleaning up old reports and logs..."

    # Remove old reports
    if [ -d "$OUTPUT_DIR" ]; then
        local old_reports
        old_reports=$(find "$OUTPUT_DIR" -name "drift-report-*.txt" -mtime +$REPORT_RETENTION_DAYS 2>/dev/null | wc -l)

        if [ "$old_reports" -gt 0 ]; then
            find "$OUTPUT_DIR" -name "drift-report-*.txt" -mtime +$REPORT_RETENTION_DAYS -delete 2>/dev/null
            log_success "Removed $old_reports old report(s)"
        else
            log_info "No old reports to remove"
        fi
    fi

    # Remove old logs
    if [ -d "$LOG_DIR" ]; then
        local old_logs
        old_logs=$(find "$LOG_DIR" -name "*.log" -mtime +$LOG_RETENTION_DAYS 2>/dev/null | wc -l)

        if [ "$old_logs" -gt 0 ]; then
            find "$LOG_DIR" -name "*.log" -mtime +$LOG_RETENTION_DAYS -delete 2>/dev/null
            log_success "Removed $old_logs old log(s)"
        else
            log_info "No old logs to remove"
        fi
    fi
}

# Show usage
show_usage() {
    cat <<EOF
Configuration Drift Check Scheduler

Manages automated configuration drift detection scheduling.

Usage: $0 [action]

Actions:
  install       Install cron job for daily checks (default: 2 AM)
  uninstall     Remove cron job
  status        Show cron job status and recent reports
  run-now       Run drift check immediately
  test          Run test drift check with verbose output
  cleanup       Remove old reports and logs

Configuration:
  CRON_SCHEDULE         Cron schedule (default: 0 2 * * *)
  REPORT_RETENTION_DAYS Days to keep reports (default: 30)
  LOG_RETENTION_DAYS   Days to keep logs (default: 7)
  OUTPUT_DIR           Report directory (default: /tmp/config-drift-reports)
  LOG_DIR              Log directory (default: /var/log/config-drift)

Examples:
  $0 install              # Install daily check at 2 AM
  $0 status               # Show current status
  $0 run-now              # Run check immediately
  $0 test                 # Run test check
  CRON_SCHEDULE="0 6 * * *" $0 install  # Install for 6 AM

EOF
}

#==============================================================================
# Main Execution
#==============================================================================

main() {
    local action=${1:-"status"}

    case "$action" in
        install)
            install_cron_job
            ;;
        uninstall)
            uninstall_cron_job
            ;;
        status)
            show_status
            ;;
        run-now)
            run_now
            ;;
        test)
            run_test
            ;;
        cleanup)
            cleanup_old_files
            ;;
        --help|-h)
            show_usage
            ;;
        *)
            log_error "Unknown action: $action"
            echo
            show_usage
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
