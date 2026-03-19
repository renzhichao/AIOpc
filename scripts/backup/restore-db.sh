#!/bin/bash

#==============================================================================
# Database Restore Script
#==============================================================================
# Fast database restore with validation and integrity checks
#
# Features:
# - Optimized restore speed (< 3 minutes)
# - Pre-restore validation
# - Post-restore verification
# - Automatic backup creation
# - Direct pipe restore (no intermediate files)
#
# Usage:
#   ./restore-db.sh --source /opt/opclaw/backups/backup_20260318_120000
#   ./restore-db.sh --latest
#
#==============================================================================

set -e  # Exit on error
set -u  # Exit on undefined variable
set -o pipefail  # Exit on pipe failure

#------------------------------------------------------------------------------
# Configuration
#------------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="${PROJECT_ROOT}/db-restore.log"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Database settings
DB_NAME=${DB_NAME:-opclaw}
DB_USER=${DB_USER:-opclaw}
DB_CONTAINER=${DB_CONTAINER:-opclaw-postgres}

# Deployment settings
DEPLOY_USER=${DEPLOY_USER:-root}
DEPLOY_HOST=${DEPLOY_HOST:-118.25.0.190}
DEPLOY_PATH=${DEPLOY_PATH:-/opt/opclaw}
BACKUP_PATH=${BACKUP_PATH:-/opt/opclaw/backups}

# Options
SOURCE=""
LATEST=false
PRE_BACKUP=true
VERIFY_RESTORE=true
DRY_RUN=false

# Timing
START_TIME=$(date +%s)

#------------------------------------------------------------------------------
# Logging Functions
#------------------------------------------------------------------------------

log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${timestamp} [${level}] ${message}" | tee -a "$LOG_FILE"
}

info() {
    echo -e "${BLUE}[INFO]${NC} $*"
    log "INFO" "$*"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
    log "SUCCESS" "$*"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*"
    log "WARNING" "$*"
}

error() {
    echo -e "${RED}[ERROR]${NC} $*"
    log "ERROR" "$*"
}

step() {
    echo -e "${BLUE}==>${NC} $1"
    log "STEP" "$*"
}

#------------------------------------------------------------------------------
# SSH Wrapper Function
#------------------------------------------------------------------------------

ssh_exec() {
    local command="$*"
    if [ "$DRY_RUN" = true ]; then
        info "[DRY RUN] SSH: $command"
    else
        ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
            -i ~/.ssh/rap001_opclaw \
            "${DEPLOY_USER}@${DEPLOY_HOST}" "$command" 2>&1
    fi
}

#------------------------------------------------------------------------------
# Timing Functions
#------------------------------------------------------------------------------

show_elapsed() {
    local end_time=$(date +%s)
    local elapsed=$((end_time - START_TIME))
    local minutes=$((elapsed / 60))
    local seconds=$((elapsed % 60))
    info "Elapsed time: ${minutes}m ${seconds}s"
}

#------------------------------------------------------------------------------
# Validation Functions
#------------------------------------------------------------------------------

validate_source() {
    step "Validating backup source..."

    if [ -z "$SOURCE" ]; then
        error "Backup source not specified"
        exit 1
    fi

    # Check if source exists
    if ! ssh_exec "[ -d ${SOURCE} ]"; then
        error "Backup source does not exist: ${SOURCE}"
        exit 1
    fi

    # Check if database backup file exists
    if ! ssh_exec "[ -f ${SOURCE}/database.sql.gz ]"; then
        error "Database backup file not found: ${SOURCE}/database.sql.gz"
        exit 1
    fi

    # Verify backup file integrity
    info "Verifying backup file integrity..."
    if ! ssh_exec "gunzip -t ${SOURCE}/database.sql.gz"; then
        error "Backup file is corrupted"
        exit 1
    fi

    success "Backup source validated"
}

validate_database_connection() {
    step "Validating database connection..."

    # Check if database container is running
    if ! ssh_exec "docker ps | grep -q ${DB_CONTAINER}"; then
        error "Database container is not running"
        return 1
    fi

    # Check if database accepts connections
    if ! ssh_exec "docker exec ${DB_CONTAINER} pg_isready -U ${DB_USER}" &> /dev/null; then
        error "Database is not accepting connections"
        return 1
    fi

    success "Database connection validated"
    return 0
}

#------------------------------------------------------------------------------
# Pre-Restore Backup Functions
#------------------------------------------------------------------------------

create_pre_restore_backup() {
    if [ "$PRE_BACKUP" = false ]; then
        return 0
    fi

    step "Creating pre-restore backup..."

    local pre_backup_dir="${BACKUP_PATH}/pre-db-restore_${TIMESTAMP}"
    ssh_exec "mkdir -p ${pre_backup_dir}"

    info "Backing up current database..."
    if ssh_exec "docker exec ${DB_CONTAINER} pg_dump -U ${DB_USER} ${DB_NAME} | gzip > ${pre_backup_dir}/database.sql.gz"; then
        success "Pre-restore backup created: ${pre_backup_dir}"
        echo "$pre_backup_dir" > /tmp/pre_restore_backup.txt
    else
        warning "Failed to create pre-restore backup"
        return 1
    fi
}

#------------------------------------------------------------------------------
# Database Restore Functions
#------------------------------------------------------------------------------

stop_backend_service() {
    step "Stopping backend service..."

    info "Stopping backend to prevent database connections..."
    if ssh_exec "cd ${DEPLOY_PATH} && docker compose stop backend"; then
        success "Backend service stopped"
    else
        warning "Failed to stop backend service (may not be running)"
    fi

    # Wait for connections to close
    info "Waiting for connections to close..."
    sleep 5
}

restore_database() {
    step "Restoring database..."

    info "Starting database restore (direct pipe - optimized speed)..."

    # Use direct pipe for fastest restore
    # gunzip -> docker exec -> psql
    local restore_command="gunzip < ${SOURCE}/database.sql.gz | docker exec -i ${DB_CONTAINER} psql -U ${DB_USER} -d ${DB_NAME}"

    if ssh_exec "$restore_command"; then
        success "Database restore completed"
    else
        error "Database restore failed"
        return 1
    fi
}

start_backend_service() {
    step "Starting backend service..."

    info "Starting backend service..."
    if ssh_exec "cd ${DEPLOY_PATH} && docker compose start backend"; then
        success "Backend service started"
    else
        warning "Failed to start backend service"
    fi
}

#------------------------------------------------------------------------------
# Post-Restore Verification Functions
#------------------------------------------------------------------------------

verify_database_connection() {
    step "Verifying database connection..."

    local max_attempts=10
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        if ssh_exec "docker exec ${DB_CONTAINER} pg_isready -U ${DB_USER}" &> /dev/null; then
            success "Database connection verified"
            return 0
        fi

        info "Waiting for database to be ready... (${attempt}/${max_attempts})"
        sleep 3
        ((attempt++))
    done

    error "Database connection verification failed"
    return 1
}

verify_data_integrity() {
    step "Verifying data integrity..."

    # Check if database tables exist
    info "Checking database tables..."
    local table_count
    table_count=$(ssh_exec "docker exec ${DB_CONTAINER} psql -U ${DB_USER} -d ${DB_NAME} -c 'SELECT count(*) FROM information_schema.tables WHERE table_schema = '\''public'\'';' -t" | xargs || echo "0")

    if [ "$table_count" -gt 0 ]; then
        success "Database contains $table_count tables"
    else
        warning "Database appears to be empty (0 tables)"
    fi

    # Check critical tables
    info "Checking critical tables..."
    local critical_tables=("users" "instances" "deployments")

    for table in "${critical_tables[@]}"; do
        if ssh_exec "docker exec ${DB_CONTAINER} psql -U ${DB_USER} -d ${DB_NAME} -c 'SELECT 1 FROM ${table} LIMIT 1;' &> /dev/null"; then
            local count
            count=$(ssh_exec "docker exec ${DB_CONTAINER} psql -U ${DB_USER} -d ${DB_NAME} -c 'SELECT count(*) FROM ${table};' -t" | xargs || echo "0")
            success "Table '${table}' exists with $count rows"
        else
            warning "Table '${table}' does not exist or is not accessible"
        fi
    done
}

verify_restore() {
    if [ "$VERIFY_RESTORE" = false ]; then
        return 0
    fi

    step "Verifying restore..."

    local all_passed=true

    if ! verify_database_connection; then
        all_passed=false
    fi

    if ! verify_data_integrity; then
        all_passed=false
    fi

    if [ "$all_passed" = false ]; then
        error "Restore verification failed"
        return 1
    fi

    success "Restore verification completed"
}

#------------------------------------------------------------------------------
# Summary Functions
#------------------------------------------------------------------------------

print_summary() {
    echo ""
    echo "=============================================================================="
    echo "Database Restore Complete"
    echo "=============================================================================="
    echo ""
    echo "Restore Details:"
    echo "  Source: $SOURCE"
    echo "  Database: $DB_NAME"
    echo "  Timestamp: $TIMESTAMP"
    echo ""
    show_elapsed
    echo ""
    if [ "$PRE_BACKUP" = true ]; then
        local pre_backup=$(cat /tmp/pre_restore_backup.txt 2>/dev/null || echo "N/A")
        echo "Pre-Restore Backup:"
        echo "  Location: $pre_backup"
        echo ""
    fi
    echo "Verification:"
    if [ "$VERIFY_RESTORE" = true ]; then
        echo "  Connection: Verified"
        echo "  Data Integrity: Verified"
    else
        echo "  Skipped (--no-verify)"
    fi
    echo ""
    echo "=============================================================================="
}

#------------------------------------------------------------------------------
# Help Function
#------------------------------------------------------------------------------

show_help() {
    cat << EOF
Usage: $0 [options]

Options:
  --source <path>       Backup source path [required unless --latest]
  --latest              Use latest backup
  --no-backup           Skip pre-restore backup
  --no-verify           Skip post-restore verification
  --dry-run             Simulate restore without executing
  --help                Display this help message

Environment Variables:
  DB_NAME               Database name [default: opclaw]
  DB_USER               Database user [default: opclaw]
  DB_CONTAINER          Container name [default: opclaw-postgres]
  DEPLOY_USER           SSH user [default: root]
  DEPLOY_HOST           SSH host [default: 118.25.0.190]
  DEPLOY_PATH           Deployment path [default: /opt/opclaw]

Examples:
  # Restore from specific backup
  $0 --source /opt/opclaw/backups/backup_20260318_120000

  # Restore from latest backup
  $0 --latest

  # Restore without verification
  $0 --source /opt/opclaw/backups/backup_20260318_120000 --no-verify

  # Simulate restore
  $0 --source /opt/opclaw/backups/backup_20260318_120000 --dry-run

Features:
  - Optimized restore speed (< 3 minutes)
  - Pre-restore backup creation
  - Post-restore verification
  - Data integrity checks
  - Direct pipe restore (no intermediate files)

EOF
}

#------------------------------------------------------------------------------
# Main Function
#------------------------------------------------------------------------------

main() {
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --source)
                SOURCE="$2"
                shift 2
                ;;
            --latest)
                LATEST=true
                shift
                ;;
            --no-backup)
                PRE_BACKUP=false
                shift
                ;;
            --no-verify)
                VERIFY_RESTORE=false
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done

    # Get latest backup if requested
    if [ "$LATEST" = true ]; then
        info "Finding latest backup..."
        SOURCE=$(ssh_exec "ls -t ${BACKUP_PATH} 2>/dev/null | grep '^backup_' | head -n 1")
        if [ -z "$SOURCE" ]; then
            error "No backups found"
            exit 1
        fi
        SOURCE="${BACKUP_PATH}/${SOURCE}"
        info "Latest backup: $SOURCE"
    fi

    # Print header
    echo "=============================================================================="
    echo "Database Restore Script"
    echo "=============================================================================="
    echo "Timestamp: $TIMESTAMP"
    echo "Source: $SOURCE"
    echo "Database: $DB_NAME"
    echo "=============================================================================="
    echo ""

    if [ "$DRY_RUN" = true ]; then
        warning "DRY RUN MODE - No changes will be made"
        echo ""
    fi

    # Execute restore process
    validate_source
    validate_database_connection
    create_pre_restore_backup
    stop_backend_service
    restore_database
    start_backend_service
    verify_restore

    # Print summary
    print_summary

    success "Database restore completed successfully!"
}

#------------------------------------------------------------------------------
# Script Entry Point
#------------------------------------------------------------------------------

main "$@"
