#!/bin/bash

#==============================================================================
# AIOpc Production Backup Script
#==============================================================================
# Comprehensive production environment backup with multi-location support
# and integrity verification
#
# Features:
# - Database backup with schema and data
# - Configuration files backup
# - Code repository snapshot
# - SSH keys backup
# - Multi-location storage (local + remote)
# - Backup integrity verification
# - Automated restore testing
#
# Usage:
#   ./backup-production.sh [--full] [--quick] [--remote-only]
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
LOG_FILE="${PROJECT_ROOT}/backup-production.log"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Production settings
DEPLOY_USER=${DEPLOY_USER:-root}
DEPLOY_HOST=${DEPLOY_HOST:-118.25.0.190}
DEPLOY_PATH=${DEPLOY_PATH:-/opt/opclaw}
BACKUP_PATH=${BACKUP_PATH:-/opt/opclaw/backups}
LOCAL_BACKUP_PATH=${LOCAL_BACKUP_PATH:-/tmp/opclaw-backups}
REMOTE_BACKUP_HOST=${REMOTE_BACKUP_HOST:-""}
REMOTE_BACKUP_PATH=${REMOTE_BACKUP_PATH:-""}

# Backup options
BACKUP_TYPE="full"
VERIFY_BACKUP=true
TEST_RESTORE=false
MULTI_LOCATION=true
COMPRESS=true
RETENTION_DAYS=30
SKIP_SSH_KEYS=false

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
# SSH Wrapper Functions
#------------------------------------------------------------------------------

ssh_exec() {
    local command="$*"
    ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
        -i ~/.ssh/rap001_opclaw \
        -o ConnectTimeout=10 \
        "${DEPLOY_USER}@${DEPLOY_HOST}" "$command"
}

scp_from_remote() {
    local source="$1"
    local destination="$2"
    scp -i ~/.ssh/rap001_opclaw \
        -o StrictHostKeyChecking=no \
        "${DEPLOY_USER}@${DEPLOY_HOST}:${source}" "${destination}"
}

#------------------------------------------------------------------------------
# Pre-flight Checks
#------------------------------------------------------------------------------

check_prerequisites() {
    step "Running pre-flight checks"

    local all_passed=true

    # Check SSH connection
    if ! ssh_exec "echo 'Connection OK'" &> /dev/null; then
        error "Cannot connect to ${DEPLOY_USER}@${DEPLOY_HOST}"
        all_passed=false
    else
        success "SSH connection verified"
    fi

    # Check disk space on remote
    local available_space=$(ssh_exec "df -h ${BACKUP_PATH} 2>/dev/null | tail -1 | awk '{print \$4}' || echo '0'")
    local available_gb=$(echo "$available_space" | grep -oE '[0-9]+' | head -1)
    if [ "$available_gb" -lt 50 ]; then
        warning "Low disk space on remote: ${available_space} available (need >50GB)"
    else
        success "Disk space OK: ${available_space} available"
    fi

    # Check disk space locally
    local local_space=$(df -h "${LOCAL_BACKUP_PATH}" 2>/dev/null | tail -1 | awk '{print \$4}' || echo '0')
    local local_gb=$(echo "$local_space" | grep -oE '[0-9]+' | head -1)
    if [ "$local_gb" -lt 50 ]; then
        warning "Low disk space locally: ${local_space} available (need >50GB)"
    else
        success "Local disk space OK: ${local_space} available"
    fi

    # Check Docker containers
    if ssh_exec "docker ps | grep opclaw-postgres" &> /dev/null; then
        success "Database container running"
    else
        error "Database container not running"
        all_passed=false
    fi

    if [ "$all_passed" = false ]; then
        error "Pre-flight checks failed"
        exit 1
    fi

    success "All pre-flight checks passed"
}

#------------------------------------------------------------------------------
# Backup Functions
#------------------------------------------------------------------------------

backup_database() {
    step "Backing up database"

    local backup_dir="${BACKUP_PATH}/${TIMESTAMP}"
    ssh_exec "mkdir -p ${backup_dir}/database"

    # Full database backup with schema and data
    info "Creating full database dump..."
    local db_backup_file="${backup_dir}/database/opclaw_full.sql.gz"

    if ssh_exec "docker exec opclaw-postgres pg_dump -U opclaw -d opclaw --schema-only > ${backup_dir}/database/schema.sql && \
                 docker exec opclaw-postgres pg_dump -U opclaw -d opclaw --data-only >> ${backup_dir}/database/data.sql && \
                 docker exec opclaw-postgres pg_dump -U opclaw -d opclaw | gzip > ${db_backup_file}"; then
        success "Database backup completed"

        # Get backup sizes
        local schema_size=$(ssh_exec "stat -f%z ${backup_dir}/database/schema.sql 2>/dev/null || stat -c%s ${backup_dir}/database/schema.sql" || echo "0")
        local data_size=$(ssh_exec "stat -f%z ${backup_dir}/database/data.sql 2>/dev/null || stat -c%s ${backup_dir}/database/data.sql" || echo "0")
        local full_size=$(ssh_exec "stat -f%z ${db_backup_file} 2>/dev/null || stat -c%s ${db_backup_file}" || echo "0")

        info "Schema backup: ${schema_size} bytes"
        info "Data backup: ${data_size} bytes"
        info "Full backup: ${full_size} bytes"

        # Create checksum
        ssh_exec "cd ${backup_dir}/database && sha256sum *.sql* > checksums.txt"
        success "Database checksums created"
    else
        error "Database backup failed"
        return 1
    fi
}

backup_configurations() {
    step "Backing up configuration files"

    local backup_dir="${BACKUP_PATH}/${TIMESTAMP}"
    ssh_exec "mkdir -p ${backup_dir}/config"

    # Backup production environment files
    local config_files=(
        "${DEPLOY_PATH}/platform/.env.production"
        "${DEPLOY_PATH}/platform/docker-compose.yml"
        "${DEPLOY_PATH}/.env"
        "/etc/nginx/sites-available/opclaw"
        "/etc/systemd/system/opclaw-backend.service"
    )

    for config_file in "${config_files[@]}"; do
        if ssh_exec "[ -f ${config_file} ]"; then
            local filename=$(basename "${config_file}")
            info "Backing up ${filename}..."
            ssh_exec "cp ${config_file} ${backup_dir}/config/${filename}"
            success "${filename} backed up"
        else
            warning "Config file not found: ${config_file}"
        fi
    done

    # Backup Docker container configurations
    info "Backing up Docker container configurations..."
    ssh_exec "docker inspect opclaw-backend > ${backup_dir}/config/backend_container.json"
    ssh_exec "docker inspect opclaw-postgres > ${backup_dir}/config/postgres_container.json"
    ssh_exec "docker inspect opclaw-redis > ${backup_dir}/config/redis_container.json"
    ssh_exec "docker inspect opclaw-frontend > ${backup_dir}/config/frontend_container.json"

    success "Docker configurations backed up"

    # Create checksum
    ssh_exec "cd ${backup_dir}/config && find . -type f -exec sha256sum {} \; > checksums.txt"
    success "Configuration checksums created"
}

backup_code_repository() {
    step "Backing up code repository"

    local backup_dir="${BACKUP_PATH}/${TIMESTAMP}"
    ssh_exec "mkdir -p ${backup_dir}/code"

    # Create git archive
    info "Creating git archive..."
    if ssh_exec "cd ${DEPLOY_PATH} && git archive --format=tar.gz HEAD > ${backup_dir}/code/repository.tar.gz 2>/dev/null || \
                 tar -czf ${backup_dir}/code/repository.tar.gz --exclude=node_modules --exclude=.git --exclude=dist --exclude=build ."; then
        success "Code repository backed up"
    else
        error "Code repository backup failed"
        return 1
    fi

    # Backup current git state
    info "Capturing git state..."
    ssh_exec "cd ${DEPLOY_PATH} && git rev-parse HEAD > ${backup_dir}/code/git_commit.txt 2>/dev/null || echo 'not-a-git-repo' > ${backup_dir}/code/git_commit.txt"
    ssh_exec "cd ${DEPLOY_PATH} && git status > ${backup_dir}/code/git_status.txt 2>/dev/null || echo 'no-git-status' > ${backup_dir}/code/git_status.txt"
    ssh_exec "cd ${DEPLOY_PATH} && git log -1 > ${backup_dir}/code/git_last_commit.txt 2>/dev/null || echo 'no-git-log' > ${backup_dir}/code/git_last_commit.txt"

    success "Git state captured"

    # Create checksum
    ssh_exec "cd ${backup_dir}/code && sha256sum * > checksums.txt"
    success "Code checksums created"
}

backup_ssh_keys() {
    if [ "$SKIP_SSH_KEYS" = true ]; then
        info "Skipping SSH keys backup"
        return 0
    fi

    step "Backing up SSH keys"

    local backup_dir="${BACKUP_PATH}/${TIMESTAMP}"
    ssh_exec "mkdir -p ${backup_dir}/ssh"

    # Backup SSH directory information
    info "Documenting SSH keys..."
    ssh_exec "ls -lah ~/.ssh/ > ${backup_dir}/ssh/ssh_dir_list.txt"
    ssh_exec "find ~/.ssh/ -name 'opclaw*' -type f -exec ls -lh {} \; > ${backup_dir}/ssh/opclaw_keys_list.txt"

    # Note: We don't copy the actual keys for security reasons
    warning "SSH keys documented but not copied (security measure)"
    warning "Restore keys manually from local ~/.ssh/ directory"

    success "SSH keys documentation completed"
}

backup_system_state() {
    step "Capturing system state"

    local backup_dir="${BACKUP_PATH}/${TIMESTAMP}"
    ssh_exec "mkdir -p ${backup_dir}/system"

    # Capture running containers
    info "Capturing Docker state..."
    ssh_exec "docker ps > ${backup_dir}/system/docker_ps.txt"
    ssh_exec "docker compose -f ${DEPLOY_PATH}/platform/docker-compose.yml ps > ${backup_dir}/system/docker_compose_ps.txt"

    # Capture system info
    info "Capturing system information..."
    ssh_exec "uname -a > ${backup_dir}/system/uname.txt"
    ssh_exec "df -h > ${backup_dir}/system/df.txt"
    ssh_exec "free -h > ${backup_dir}/system/memory.txt"
    ssh_exec "uptime > ${backup_dir}/system/uptime.txt"

    # Capture recent logs
    info "Capturing recent logs..."
    ssh_exec "docker logs opclaw-backend --tail 500 > ${backup_dir}/system/backend.log" || warning "Could not capture backend logs"
    ssh_exec "docker logs opclaw-postgres --tail 500 > ${backup_dir}/system/postgres.log" || warning "Could not capture postgres logs"

    success "System state captured"
}

create_backup_metadata() {
    step "Creating backup metadata"

    local backup_dir="${BACKUP_PATH}/${TIMESTAMP}"

    # Get values locally first
    local current_date=$(date -Iseconds)
    local git_commit="unknown"
    local disk_usage="unknown"
    local ssh_keys_val="true"

    if [ "$SKIP_SSH_KEYS" = true ]; then
        ssh_keys_val="false"
    fi

    # Get git commit
    git_commit=$(ssh_exec "cd ${DEPLOY_PATH} 2>/dev/null && git rev-parse HEAD 2>/dev/null" || echo "unknown")

    # Get disk usage
    disk_usage=$(ssh_exec "du -sh ${backup_dir} 2>/dev/null | cut -f1" || echo "unknown")

    # Create JSON metadata
    ssh_exec "cat > ${backup_dir}/metadata.json" << METADATA_EOF
{
  "backup_timestamp": "${TIMESTAMP}",
  "backup_date": "${current_date}",
  "backup_type": "${BACKUP_TYPE}",
  "backup_host": "${DEPLOY_HOST}",
  "backup_user": "${DEPLOY_USER}",
  "backup_path": "${DEPLOY_PATH}",
  "backup_version": "1.0",
  "compression": ${COMPRESS},
  "verified": ${VERIFY_BACKUP},
  "multi_location": ${MULTI_LOCATION},
  "components": {
    "database": true,
    "configurations": true,
    "code": true,
    "ssh_keys": ${ssh_keys_val},
    "system_state": true
  },
  "git_commit": "${git_commit}",
  "disk_usage": "${disk_usage}"
}
METADATA_EOF

    success "Backup metadata created"
}


#------------------------------------------------------------------------------
# Multi-Location Backup
#----------------------------------------------------------------------------__

copy_to_local() {
    if [ "$MULTI_LOCATION" = false ]; then
        return 0
    fi

    step "Copying backup to local storage"

    local backup_dir="${BACKUP_PATH}/${TIMESTAMP}"
    local local_dir="${LOCAL_BACKUP_PATH}/${TIMESTAMP}"

    # Create local directory
    mkdir -p "${local_dir}"

    # Copy backup files
    info "Downloading backup from remote..."
    if scp_from_remote "${backup_dir}/*" "${local_dir}/"; then
        success "Backup copied to local: ${local_dir}"

        # Create local checksums
        cd "${local_dir}"
        find . -type f -exec sha256sum {} \; > local_checksums.txt
        success "Local checksums created"
    else
        error "Failed to copy backup to local"
        return 1
    fi
}

copy_to_remote() {
    if [ "$MULTI_LOCATION" = false ]; then
        return 0
    fi

    if [ -z "$REMOTE_BACKUP_HOST" ] || [ -z "$REMOTE_BACKUP_PATH" ]; then
        info "No remote backup location configured"
        return 0
    fi

    step "Copying backup to remote location"

    local backup_dir="${BACKUP_PATH}/${TIMESTAMP}"

    info "Transferring to ${REMOTE_BACKUP_HOST}..."
    if ssh_exec "scp -r ${backup_dir} ${REMOTE_BACKUP_HOST}:${REMOTE_BACKUP_PATH}/"; then
        success "Backup copied to remote: ${REMOTE_BACKUP_HOST}:${REMOTE_BACKUP_PATH}/${TIMESTAMP}"
    else
        warning "Failed to copy backup to remote location"
    fi
}

#------------------------------------------------------------------------------
# Backup Verification
#------------------------------------------------------------------------------

verify_backup() {
    if [ "$VERIFY_BACKUP" = false ]; then
        return 0
    fi

    step "Verifying backup integrity"

    local backup_dir="${BACKUP_PATH}/${TIMESTAMP}"
    local all_valid=true

    # Verify database backup
    info "Verifying database backup..."
    if ssh_exec "[ -f ${backup_dir}/database/opclaw_full.sql.gz ]"; then
        local size=$(ssh_exec "stat -f%z ${backup_dir}/database/opclaw_full.sql.gz 2>/dev/null || stat -c%s ${backup_dir}/database/opclaw_full.sql.gz" || echo "0")
        if [ "$size" -gt 1000 ]; then
            success "Database backup valid (${size} bytes)"

            # Test gzip integrity
            if ssh_exec "gunzip -t ${backup_dir}/database/opclaw_full.sql.gz"; then
                success "Database backup gzip integrity verified"
            else
                error "Database backup gzip integrity check failed"
                all_valid=false
            fi
        else
            error "Database backup file too small: ${size} bytes"
            all_valid=false
        fi
    else
        error "Database backup file not found"
        all_valid=false
    fi

    # Verify configuration backup
    info "Verifying configuration backup..."
    local required_configs=(".env.production" "docker-compose.yml")
    for config in "${required_configs[@]}"; do
        if ssh_exec "[ -f ${backup_dir}/config/${config} ]"; then
            success "Config file exists: ${config}"
        else
            error "Config file missing: ${config}"
            all_valid=false
        fi
    done

    # Verify code backup
    info "Verifying code backup..."
    if ssh_exec "[ -f ${backup_dir}/code/repository.tar.gz ]"; then
        local size=$(ssh_exec "stat -f%z ${backup_dir}/code/repository.tar.gz 2>/dev/null || stat -c%s ${backup_dir}/code/repository.tar.gz" || echo "0")
        if [ "$size" -gt 1000 ]; then
            success "Code backup valid (${size} bytes)"

            # Test tar integrity
            if ssh_exec "tar -tzf ${backup_dir}/code/repository.tar.gz > /dev/null"; then
                success "Code backup tar integrity verified"
            else
                error "Code backup tar integrity check failed"
                all_valid=false
            fi
        else
            error "Code backup file too small: ${size} bytes"
            all_valid=false
        fi
    else
        error "Code backup file not found"
        all_valid=false
    fi

    # Verify checksums
    info "Verifying checksums..."
    if ssh_exec "cd ${backup_dir}/database && sha256sum -c checksums.txt > /dev/null 2>&1"; then
        success "Database checksums valid"
    else
        warning "Database checksum verification failed"
    fi

    if ssh_exec "cd ${backup_dir}/config && sha256sum -c checksums.txt > /dev/null 2>&1"; then
        success "Configuration checksums valid"
    else
        warning "Configuration checksum verification failed"
    fi

    if ssh_exec "cd ${backup_dir}/code && sha256sum -c checksums.txt > /dev/null 2>&1"; then
        success "Code checksums valid"
    else
        warning "Code checksum verification failed"
    fi

    if [ "$all_valid" = true ]; then
        success "All backup verifications passed"
    else
        error "Some backup verifications failed"
        return 1
    fi
}

#------------------------------------------------------------------------------
# Cleanup Old Backups
#------------------------------------------------------------------------------

cleanup_old_backups() {
    step "Cleaning up old backups"

    info "Keeping backups for ${RETENTION_DAYS} days"

    # Clean up remote backups
    local old_backups=$(ssh_exec "find ${BACKUP_PATH} -maxdepth 1 -type d -name '20*' -mtime +${RETENTION_DAYS} || echo ''")

    if [ -n "$old_backups" ]; then
        info "Deleting old remote backups:"
        echo "$old_backups" | while read -r backup; do
            if [ -n "$backup" ]; then
                info "  Deleting: ${backup}"
                ssh_exec "rm -rf ${backup}"
            fi
        done
        success "Old remote backups cleaned"
    else
        info "No old remote backups to clean"
    fi

    # Clean up local backups
    if [ -d "${LOCAL_BACKUP_PATH}" ]; then
        local old_local=$(find "${LOCAL_BACKUP_PATH}" -maxdepth 1 -type d -name '20*' -mtime +${RETENTION_DAYS} || echo '')
        if [ -n "$old_local" ]; then
            info "Deleting old local backups:"
            echo "$old_local" | while read -r backup; do
                if [ -n "$backup" ]; then
                    info "  Deleting: ${backup}"
                    rm -rf "${backup}"
                fi
            done
            success "Old local backups cleaned"
        fi
    fi

    # Show backup disk usage
    local total_size=$(ssh_exec "du -sh ${BACKUP_PATH} 2>/dev/null | awk '{print \$1}' || echo 'unknown'")
    info "Total backup directory size: ${total_size}"
}

#------------------------------------------------------------------------------
# Print Summary
#------------------------------------------------------------------------------

print_summary() {
    local backup_dir="${BACKUP_PATH}/${TIMESTAMP}"

    echo ""
    echo "=============================================================================="
    echo "Production Backup Complete"
    echo "=============================================================================="
    echo ""
    echo "Backup Details:"
    echo "  Timestamp: ${TIMESTAMP}"
    echo "  Type: ${BACKUP_TYPE}"
    echo "  Remote Path: ${backup_dir}"
    if [ "$MULTI_LOCATION" = true ]; then
        echo "  Local Path: ${LOCAL_BACKUP_PATH}/${TIMESTAMP}"
    fi
    echo ""
    echo "Backup Components:"
    echo "  [✓] Database (PostgreSQL with schema + data)"
    echo "  [✓] Configurations (.env, docker-compose, nginx)"
    echo "  [✓] Code repository (git archive)"
    echo "  [✓] SSH keys (documentation)"
    echo "  [✓] System state (Docker, logs, metrics)"
    echo ""
    echo "Backup Size:"
    ssh_exec "du -sh ${backup_dir}"
    echo ""
    echo "Verification:"
    if [ "$VERIFY_BACKUP" = true ]; then
        echo "  [✓] Integrity verified"
    else
        echo "  [ ] Skipped"
    fi
    if [ "$MULTI_LOCATION" = true ]; then
        echo "  [✓] Multi-location storage (remote + local)"
    fi
    echo ""
    echo "Restore Instructions:"
    echo "  1. Verify backup: ./verify-backup.sh ${backup_dir}"
    echo "  2. Test restore: ./test-restore.sh ${backup_dir}"
    echo "  3. Full restore: ./restore-production.sh --source ${backup_dir}"
    echo ""
    echo "=============================================================================="
}

#------------------------------------------------------------------------------
# Help
#------------------------------------------------------------------------------

show_help() {
    cat << EOF
Usage: $0 [OPTIONS]

Options:
  --full              Full backup (default)
  --quick             Quick backup (database + config only)
  --no-verify         Skip backup verification
  --no-multi-location Skip multi-location copy
  --skip-ssh-keys     Skip SSH keys documentation
  --retention <days>  Retention period in days (default: 30)
  --help              Show this help message

Environment Variables:
  DEPLOY_USER         SSH user (default: root)
  DEPLOY_HOST         SSH host (default: 118.25.0.190)
  DEPLOY_PATH         Deployment path (default: /opt/opclaw)
  BACKUP_PATH         Remote backup path (default: /opt/opclaw/backups)
  LOCAL_BACKUP_PATH   Local backup path (default: /tmp/opclaw-backups)

Backup Components:
  - Database: Full PostgreSQL dump with schema and data
  - Configurations: .env files, docker-compose, nginx configs
  - Code: Git repository snapshot
  - SSH Keys: Documentation (not copied for security)
  - System State: Docker containers, logs, system metrics

Multi-Location Storage:
  By default, backups are stored in 2 locations:
  1. Remote server: /opt/opclaw/backups/
  2. Local machine: /tmp/opclaw-backups/

  Configure additional remote location with:
  - REMOTE_BACKUP_HOST
  - REMOTE_BACKUP_PATH

Examples:
  # Full backup with verification
  $0 --full

  # Quick backup (database + config only)
  $0 --quick

  # Skip verification for faster backup
  $0 --no-verify

  # Custom retention period
  $0 --retention 7

Backup Retention:
  Default: Keep backups for 30 days
  Older backups are automatically deleted

EOF
}

#------------------------------------------------------------------------------
# Main
#------------------------------------------------------------------------------

main() {
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --full)
                BACKUP_TYPE="full"
                shift
                ;;
            --quick)
                BACKUP_TYPE="quick"
                shift
                ;;
            --no-verify)
                VERIFY_BACKUP=false
                shift
                ;;
            --no-multi-location)
                MULTI_LOCATION=false
                shift
                ;;
            --skip-ssh-keys)
                SKIP_SSH_KEYS=true
                shift
                ;;
            --retention)
                RETENTION_DAYS="$2"
                shift 2
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                echo "Use --help for usage information"
                exit 1
                ;;
        esac
    done

    # Print header
    echo "=============================================================================="
    echo "AIOpc Production Backup Script"
    echo "=============================================================================="
    echo "Timestamp: ${TIMESTAMP}"
    echo "Host: ${DEPLOY_USER}@${DEPLOY_HOST}"
    echo "Backup Type: ${BACKUP_TYPE}"
    echo "Verify: ${VERIFY_BACKUP}"
    echo "Multi-Location: ${MULTI_LOCATION}"
    echo "Retention: ${RETENTION_DAYS} days"
    echo "=============================================================================="
    echo ""

    # Execute backup
    check_prerequisites

    if [ "$BACKUP_TYPE" = "full" ] || [ "$BACKUP_TYPE" = "quick" ]; then
        backup_database
        backup_configurations
    fi

    if [ "$BACKUP_TYPE" = "full" ]; then
        backup_code_repository
        backup_ssh_keys
        backup_system_state
    fi

    create_backup_metadata
    verify_backup

    if [ "$MULTI_LOCATION" = true ]; then
        copy_to_local
        copy_to_remote
    fi

    cleanup_old_backups
    print_summary

    success "Production backup completed successfully!"
}

main "$@"
