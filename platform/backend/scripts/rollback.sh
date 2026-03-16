#!/bin/bash

######################################################################
# Rollback Script for AIOpc Platform Backend
######################################################################
#
# This script automates the rollback of a failed deployment by:
# - Restoring database from backup
# - Restoring application files
# - Restarting services
# - Verifying rollback success
#
# Usage:
#   ./scripts/rollback.sh [timestamp]
#
# Arguments:
#   timestamp - Backup timestamp to restore (format: YYYYMMDD_HHMMSS)
#               If not provided, uses the latest backup
#
# Examples:
#   ./scripts/rollback.sh                    # Rollback to latest backup
#   ./scripts/rollback.sh 20260316_120000    # Rollback to specific backup
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
BACKUP_ROOT="${BACKUP_DIR:-/var/backups/opclaw}"
BACKUP_TIMESTAMP="${1:-latest}"
SERVICE_NAME="opclaw-backend"

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
# Confirmation Prompt
######################################################################

confirm_rollback() {
    echo ""
    log_warning "=========================================="
    log_warning "ROLLBACK CONFIRMATION"
    log_warning "=========================================="
    log_warning "This will rollback the deployment to:"
    log_warning "  Backup: ${BACKUP_TIMESTAMP}"
    log_warning "  Project: ${PROJECT_ROOT}"
    log_warning "  Service: ${SERVICE_NAME}"
    log_warning ""
    log_warning "WARNING: This action cannot be undone!"
    log_warning "=========================================="
    echo ""

    read -p "Are you sure you want to proceed? (yes/no): " response

    if [ "$response" != "yes" ]; then
        log_info "Rollback cancelled by user"
        exit 0
    fi
}

######################################################################
# Backup Discovery
######################################################################

find_latest_backup() {
    log_info "Finding latest backup..."

    local latest_db=$(ls -t "${BACKUP_ROOT}"/opclaw_db_*.sql.gz 2>/dev/null | head -1)

    if [ -z "$latest_db" ]; then
        log_error "No database backups found"
        exit 1
    fi

    # Extract timestamp from filename
    local timestamp=$(basename "$latest_db" | sed 's/opclaw_db_\(.*\)\.sql\.gz/\1/')
    BACKUP_TIMESTAMP="$timestamp"

    log_success "Latest backup found: ${BACKUP_TIMESTAMP}"
}

list_backups() {
    log_info "Available backups:"

    if [ ! -d "${BACKUP_ROOT}" ]; then
        log_error "Backup directory not found: ${BACKUP_ROOT}"
        exit 1
    fi

    local backups=($(ls -t "${BACKUP_ROOT}"/opclaw_db_*.sql.gz 2>/dev/null | xargs -n1 basename 2>/dev/null | sed 's/opclaw_db_\(.*\)\.sql\.gz/\1/'))

    if [ ${#backups[@]} -eq 0 ]; then
        log_error "No backups found"
        exit 1
    fi

    for i in "${!backups[@]}"; do
        local idx=$((i + 1))
        echo "  ${idx}. ${backups[$i]}"
    done
}

verify_backup_exists() {
    local backup_type=$1
    local backup_file="${BACKUP_ROOT}/opclaw_${backup_type}_${BACKUP_TIMESTAMP}.*"

    if ! ls ${backup_file} 1> /dev/null 2>&1; then
        log_error "Backup not found: opclaw_${backup_type}_${BACKUP_TIMESTAMP}.*"
        log_info "Available backups:"
        list_backups
        exit 1
    fi

    log_success "Backup found: ${backup_type}"
}

######################################################################
# Service Management
######################################################################

stop_service() {
    log_info "Stopping ${SERVICE_NAME} service..."

    if systemctl is-active --quiet ${SERVICE_NAME}; then
        sudo systemctl stop ${SERVICE_NAME}
        log_success "Service stopped"
    else
        log_warning "Service is not running"
    fi
}

start_service() {
    log_info "Starting ${SERVICE_NAME} service..."

    sudo systemctl start ${SERVICE_NAME}

    if systemctl is-active --quiet ${SERVICE_NAME}; then
        log_success "Service started"
    else
        log_error "Failed to start service"
        return 1
    fi
}

restart_service() {
    log_info "Restarting ${SERVICE_NAME} service..."

    sudo systemctl restart ${SERVICE_NAME}

    if systemctl is-active --quiet ${SERVICE_NAME}; then
        log_success "Service restarted"
    else
        log_error "Failed to restart service"
        return 1
    fi
}

get_service_status() {
    systemctl status ${SERVICE_NAME} --no-pager || true
}

######################################################################
# Database Rollback
######################################################################

rollback_database() {
    log_info "Rolling back database..."

    local backup_file="${BACKUP_ROOT}/opclaw_db_${BACKUP_TIMESTAMP}.sql.gz"

    if [ ! -f "${backup_file}" ]; then
        log_error "Database backup not found: ${backup_file}"
        return 1
    fi

    # Get database credentials
    local db_host=${DB_HOST:-localhost}
    local db_port=${DB_PORT:-5432}
    local db_name=${DB_NAME:-opclaw_production}
    local db_user=${DB_USERNAME:-opclaw}

    # Restore database
    log_info "Restoring database from: ${backup_file}"

    if ! gunzip < "${backup_file}" | \
        PGPASSWORD="${DB_PASSWORD}" psql \
            -h "${db_host}" \
            -p "${db_port}" \
            -U "${db_user}" \
            -d "${db_name}"; then
        log_error "Database restore failed"
        return 1
    fi

    log_success "Database rolled back successfully"
}

######################################################################
# Files Rollback
######################################################################

rollback_files() {
    log_info "Rolling back application files..."

    local backup_file="${BACKUP_ROOT}/opclaw_files_${BACKUP_TIMESTAMP}.tar.gz"

    if [ ! -f "${backup_file}" ]; then
        log_warning "File backup not found: ${backup_file}"
        log_warning "Skipping file rollback"
        return 0
    fi

    # Extract files to temporary directory
    local temp_dir=$(mktemp -d)

    log_info "Extracting backup to temporary directory: ${temp_dir}"

    if ! tar -xzf "${backup_file}" -C "${temp_dir}"; then
        log_error "Failed to extract backup"
        rm -rf "${temp_dir}"
        return 1
    fi

    # Backup current files (just in case)
    local current_backup="${BACKUP_ROOT}/pre_rollback_files_${TIMESTAMP}.tar.gz"
    log_info "Backing up current files to: ${current_backup}"

    tar -czf "${current_backup}" -C "${PROJECT_ROOT}" \
        .env.production \
        dist/ \
        node_modules/ 2>/dev/null || true

    # Restore files
    log_info "Restoring files..."

    cp -r "${temp_dir}/"* "${PROJECT_ROOT}/"

    # Cleanup
    rm -rf "${temp_dir}"

    log_success "Files rolled back successfully"
}

######################################################################
# Verification
######################################################################

verify_rollback() {
    log_info "Verifying rollback..."

    local max_attempts=30
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        if curl -f http://localhost:3000/health &> /dev/null; then
            log_success "Service is responding"

            # Check database connectivity
            local health_output=$(curl -s http://localhost:3000/health/ready)
            if echo "$health_output" | grep -q '"database".*"healthy"'; then
                log_success "Database connectivity verified"
            else
                log_warning "Database connectivity check failed"
            fi

            # Check Redis connectivity
            if echo "$health_output" | grep -q '"redis".*"healthy"'; then
                log_success "Redis connectivity verified"
            else
                log_warning "Redis connectivity check failed"
            fi

            log_success "Rollback verification completed"
            return 0
        fi

        log_info "Attempt ${attempt}/${max_attempts}: Waiting for service..."
        sleep 2
        attempt=$((attempt + 1))
    done

    log_error "Service failed to start after rollback"
    return 1
}

######################################################################
# Rollback Report
######################################################################

generate_rollback_report() {
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    local report_file="${BACKUP_ROOT}/rollback_report_${timestamp}.txt"

    log_info "Generating rollback report..."

    {
        echo "==============================================="
        echo "AIOpc Platform Rollback Report"
        echo "==============================================="
        echo ""
        echo "Rollback Timestamp: ${timestamp}"
        echo "Restored Backup: ${BACKUP_TIMESTAMP}"
        echo "Project Root: ${PROJECT_ROOT}"
        echo "Service: ${SERVICE_NAME}"
        echo ""
        echo "Service Status:"
        get_service_status
        echo ""
        echo "==============================================="
    } > "${report_file}"

    log_success "Rollback report generated: ${report_file}"
}

######################################################################
# Main Rollback Flow
######################################################################

main() {
    log_info "=========================================="
    log_info "AIOpc Platform Rollback Script"
    log_info "=========================================="
    log_info "Backup Timestamp: ${BACKUP_TIMESTAMP}"
    log_info "Project Root: ${PROJECT_ROOT}"
    log_info "Service: ${SERVICE_NAME}"
    log_info "=========================================="

    # Check backup directory
    if [ ! -d "${BACKUP_ROOT}" ]; then
        log_error "Backup directory not found: ${BACKUP_ROOT}"
        exit 1
    fi

    # Find latest backup if not specified
    if [ "${BACKUP_TIMESTAMP}" = "latest" ]; then
        find_latest_backup
    fi

    # Verify backups exist
    verify_backup_exists "db"

    # Show confirmation prompt
    confirm_rollback

    # Stop service
    stop_service

    # Rollback database
    if ! rollback_database; then
        log_error "Database rollback failed"
        start_service
        exit 1
    fi

    # Rollback files (optional)
    if [ "${SKIP_FILES_ROLLBACK:-false}" != "true" ]; then
        rollback_files || log_warning "File rollback failed (continuing)"
    fi

    # Start service
    if ! start_service; then
        log_error "Failed to start service after rollback"
        exit 1
    fi

    # Verify rollback
    if ! verify_rollback; then
        log_error "Rollback verification failed"
        get_service_status
        exit 1
    fi

    # Generate report
    generate_rollback_report

    log_success "=========================================="
    log_success "Rollback completed successfully!"
    log_success "=========================================="
}

######################################################################
# Error Handling
######################################################################

trap 'log_error "Rollback failed at line $LINENO"; start_service; exit 1' ERR

######################################################################
# Script Entry Point
######################################################################

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    log_warning "This script requires root privileges"
    log_info "Running with sudo..."
    exec sudo "$0" "$@"
fi

# Run main rollback flow
main "$@"
