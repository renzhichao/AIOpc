#!/bin/bash

######################################################################
# Backup Script for AIOpc Platform Backend
######################################################################
#
# This script creates automated backups of:
# - PostgreSQL database
# - Application files
# - Configuration files
# - Redis data
#
# Usage:
#   ./scripts/backup.sh [type]
#
# Arguments:
#   type - Backup type: full|db|files|redis [default: full]
#
# Scheduling:
#   Add to crontab for automated backups:
#   0 2 * * * /path/to/scripts/backup.sh full
#
######################################################################

set -e  # Exit on error
set -u  # Exit on undefined variable
set -o pipefail  # Exit on pipe failure

######################################################################
# Configuration
######################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKUP_TYPE="${1:-full}"
BACKUP_ROOT="${BACKUP_DIR:-/var/backups/opclaw}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-30}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

######################################################################
# Logging Functions
######################################################################

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

######################################################################
# Helper Functions
######################################################################

create_backup_dir() {
    if [ ! -d "${BACKUP_ROOT}" ]; then
        mkdir -p "${BACKUP_ROOT}"
        log_info "Created backup directory: ${BACKUP_ROOT}"
    fi
}

cleanup_old_backups() {
    local pattern=$1
    log_info "Cleaning up old backups (older than ${RETENTION_DAYS} days)..."

    find "${BACKUP_ROOT}" -name "${pattern}" -mtime +${RETENTION_DAYS} -delete

    log_success "Old backups cleaned up"
}

get_backup_size() {
    local file=$1
    if [ -f "${file}" ]; then
        local size=$(du -h "${file}" | cut -f1)
        echo "${size}"
    else
        echo "N/A"
    fi
}

######################################################################
# Database Backup
######################################################################

backup_database() {
    log_info "Backing up PostgreSQL database..."

    local backup_file="${BACKUP_ROOT}/opclaw_db_${TIMESTAMP}.sql.gz"

    # Get database credentials from environment
    local db_host=${DB_HOST:-localhost}
    local db_port=${DB_PORT:-5432}
    local db_name=${DB_NAME:-opclaw_production}
    local db_user=${DB_USERNAME:-opclaw}

    # Create backup
    if ! PGPASSWORD="${DB_PASSWORD}" pg_dump \
        -h "${db_host}" \
        -p "${db_port}" \
        -U "${db_user}" \
        -d "${db_name}" \
        --verbose \
        | gzip > "${backup_file}"; then
        log_error "Database backup failed"
        return 1
    fi

    # Verify backup
    if [ ! -f "${backup_file}" ] || [ ! -s "${backup_file}" ]; then
        log_error "Backup file is empty or does not exist"
        return 1
    fi

    local size=$(get_backup_size "${backup_file}")
    log_success "Database backed up to: ${backup_file} (${size})"

    # Cleanup old backups
    cleanup_old_backups "opclaw_db_*.sql.gz"
}

######################################################################
# Files Backup
######################################################################

backup_files() {
    log_info "Backing up application files..."

    local backup_file="${BACKUP_ROOT}/opclaw_files_${TIMESTAMP}.tar.gz"

    # Files to backup
    local files_to_backup=(
        ".env.production"
        "dist/"
        "node_modules/"
        "migrations/"
    )

    # Create tar archive
    if ! tar -czf "${backup_file}" \
        -C "${PROJECT_ROOT}" \
        "${files_to_backup[@]}" 2>/dev/null; then
        log_warning "Some files could not be backed up (this may be normal)"
    fi

    if [ ! -f "${backup_file}" ] || [ ! -s "${backup_file}" ]; then
        log_error "File backup failed"
        return 1
    fi

    local size=$(get_backup_size "${backup_file}")
    log_success "Files backed up to: ${backup_file} (${size})"

    # Cleanup old backups
    cleanup_old_backups "opclaw_files_*.tar.gz"
}

######################################################################
# Redis Backup
######################################################################

backup_redis() {
    log_info "Backing up Redis data..."

    local backup_file="${BACKUP_ROOT}/opclaw_redis_${TIMESTAMP}.rdb"

    # Trigger Redis BGSAVE
    if ! redis-cli BGSAVE &> /dev/null; then
        log_warning "Redis BGSAVE command failed, trying manual backup..."
    fi

    # Wait for BGSAVE to complete
    local max_wait=30
    local waited=0
    while [ $waited -lt $max_wait ]; do
        local redis_status=$(redis-cli LASTSAVE 2>/dev/null || echo "0")
        if [ "$redis_status" != "0" ]; then
            break
        fi
        sleep 1
        waited=$((waited + 1))
    done

    # Copy Redis dump file
    local redis_dump_dir=${REDIS_DUMP_DIR:-/var/lib/redis}
    local redis_dump_file="${redis_dump_dir}/dump.rdb"

    if [ -f "${redis_dump_file}" ]; then
        if ! cp "${redis_dump_file}" "${backup_file}"; then
            log_error "Redis backup failed"
            return 1
        fi

        # Compress the backup
        gzip "${backup_file}"
        backup_file="${backup_file}.gz"

        local size=$(get_backup_size "${backup_file}")
        log_success "Redis backed up to: ${backup_file} (${size})"

        # Cleanup old backups
        cleanup_old_backups "opclaw_redis_*.rdb.gz"
    else
        log_warning "Redis dump file not found at ${redis_dump_file}"
    fi
}

######################################################################
# Full Backup
######################################################################

backup_full() {
    log_info "Starting full backup..."

    backup_database
    backup_files
    backup_redis

    log_success "Full backup completed"
}

######################################################################
# Backup Verification
######################################################################

verify_backup() {
    local backup_file=$1

    log_info "Verifying backup: ${backup_file}"

    if [ ! -f "${backup_file}" ]; then
        log_error "Backup file does not exist"
        return 1
    fi

    # Check file size
    local size=$(stat -f%z "${backup_file}" 2>/dev/null || stat -c%s "${backup_file}" 2>/dev/null)
    if [ "${size}" -lt 1000 ]; then
        log_error "Backup file is too small (${size} bytes)"
        return 1
    fi

    log_success "Backup verification passed"
}

######################################################################
# Generate Backup Report
######################################################################

generate_backup_report() {
    local report_file="${BACKUP_ROOT}/backup_report_${TIMESTAMP}.txt"

    log_info "Generating backup report..."

    {
        echo "==============================================="
        echo "AIOpc Platform Backup Report"
        echo "==============================================="
        echo ""
        echo "Backup Type: ${BACKUP_TYPE}"
        echo "Timestamp: ${TIMESTAMP}"
        echo "Backup Directory: ${BACKUP_ROOT}"
        echo ""
        echo "Backup Files:"
        ls -lh "${BACKUP_ROOT}"/*_${TIMESTAMP}* 2>/dev/null || echo "No backup files found"
        echo ""
        echo "Disk Usage:"
        df -h "${BACKUP_ROOT}"
        echo ""
        echo "==============================================="
    } > "${report_file}"

    log_success "Backup report generated: ${report_file}"
}

######################################################################
# Send Notification (Optional)
######################################################################

send_notification() {
    local status=$1
    local message=$2

    # Add your notification logic here
    # Examples: Slack webhook, Email, SMS, etc.

    log_info "Notification: ${message}"
}

######################################################################
# Main Backup Flow
######################################################################

main() {
    log_info "=========================================="
    log_info "AIOpc Platform Backup Script"
    log_info "=========================================="
    log_info "Backup Type: ${BACKUP_TYPE}"
    log_info "Timestamp: ${TIMESTAMP}"
    log_info "Backup Directory: ${BACKUP_ROOT}"
    log_info "=========================================="

    # Create backup directory
    create_backup_dir

    # Execute backup based on type
    case "${BACKUP_TYPE}" in
        full)
            backup_full
            ;;
        db)
            backup_database
            ;;
        files)
            backup_files
            ;;
        redis)
            backup_redis
            ;;
        *)
            log_error "Unknown backup type: ${BACKUP_TYPE}"
            log_info "Valid types: full, db, files, redis"
            exit 1
            ;;
    esac

    # Generate report
    generate_backup_report

    log_success "=========================================="
    log_success "Backup completed successfully!"
    log_success "=========================================="
}

######################################################################
# Error Handling
######################################################################

trap 'log_error "Backup failed at line $LINENO"; send_notification "failed" "Backup failed"; exit 1' ERR

######################################################################
# Script Entry Point
######################################################################

# Check if running as root (required for some backups)
if [ "$EUID" -ne 0 ] && [ "${BACKUP_TYPE}" = "redis" ]; then
    log_warning "Redis backup requires root privileges"
    log_info "Running with sudo..."
    exec sudo "$0" "$@"
fi

# Run main backup flow
main "$@"

# Send success notification
send_notification "success" "Backup completed successfully"
