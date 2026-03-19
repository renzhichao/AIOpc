#!/bin/bash

#==============================================================================
# Configuration Restore Script
#==============================================================================
# Fast configuration restore with validation and drift prevention
#
# Features:
# - Optimized restore speed (< 2 minutes)
# - Pre-restore validation
# - Post-restore verification
# - Automatic backup creation
# - Configuration drift detection
#
# Usage:
#   ./restore-config.sh --source /opt/opclaw/backups/backup_20260318_120000
#   ./restore-config.sh --latest
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
LOG_FILE="${PROJECT_ROOT}/config-restore.log"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration files
BACKEND_ENV_FILE="${DEPLOY_PATH}/backend/.env"
NGINX_CONF_FILE="/etc/nginx/sites-available/opclaw"
DOCKER_COMPOSE_FILE="${DEPLOY_PATH}/docker-compose.yml"

# Deployment settings
DEPLOY_USER=${DEPLOY_USER:-root}
DEPLOY_HOST=${DEPLOY_HOST:-118.25.0.190}
DEPLOY_PATH=${DEPLOY_PATH:-/opt/opclaw}
BACKUP_PATH=${BACKUP_PATH:-/opt/opclaw/backups}

# Options
SOURCE=""
LATEST=false
RESTORE_BACKEND_ENV=true
RESTORE_NGINX_CONF=true
RESTORE_DOCKER_COMPOSE=true
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

    # Check if at least one configuration file exists
    local has_config=false

    if [ "$RESTORE_BACKEND_ENV" = true ]; then
        if ssh_exec "[ -f ${SOURCE}/.env ]"; then
            has_config=true
        fi
    fi

    if [ "$RESTORE_NGINX_CONF" = true ]; then
        if ssh_exec "[ -f ${SOURCE}/nginx.conf ]"; then
            has_config=true
        fi
    fi

    if [ "$RESTORE_DOCKER_COMPOSE" = true ]; then
        if ssh_exec "[ -f ${SOURCE}/docker-compose.yml ]"; then
            has_config=true
        fi
    fi

    if [ "$has_config" = false ]; then
        error "No configuration files found in backup source"
        exit 1
    fi

    success "Backup source validated"
}

validate_config_files() {
    step "Validating configuration files..."

    # Validate backend environment file
    if [ "$RESTORE_BACKEND_ENV" = true ]; then
        if ssh_exec "[ -f ${SOURCE}/.env ]"; then
            info "Validating backend environment file..."

            # Check for placeholder values
            if ssh_exec "grep -E 'cli_xxxxxxxxxxxxx|CHANGE_THIS|your_|placeholder' ${SOURCE}/.env"; then
                error "Backend environment file contains placeholder values"
                error "Restore aborted to prevent configuration regression"
                exit 1
            fi

            # Check for required variables
            local required_vars=("FEISHU_APP_ID" "FEISHU_APP_SECRET" "JWT_SECRET")
            for var in "${required_vars[@]}"; do
                if ! ssh_exec "grep -q '^${var}=' ${SOURCE}/.env"; then
                    warning "Required variable missing: $var"
                fi
            done

            success "Backend environment file validated"
        fi
    fi

    # Validate nginx configuration
    if [ "$RESTORE_NGINX_CONF" = true ]; then
        if ssh_exec "[ -f ${SOURCE}/nginx.conf ]"; then
            info "Validating nginx configuration..."

            # Test nginx configuration syntax
            if ! ssh_exec "nginx -t -c ${SOURCE}/nginx.conf" &> /dev/null; then
                warning "Nginx configuration has syntax errors"
            else
                success "Nginx configuration validated"
            fi
        fi
    fi

    success "Configuration files validated"
}

#------------------------------------------------------------------------------
# Pre-Restore Backup Functions
#------------------------------------------------------------------------------

create_pre_restore_backup() {
    if [ "$PRE_BACKUP" = false ]; then
        return 0
    fi

    step "Creating pre-restore backup..."

    local pre_backup_dir="${BACKUP_PATH}/pre-config-restore_${TIMESTAMP}"
    ssh_exec "mkdir -p ${pre_backup_dir}"

    info "Backing up current configuration..."

    # Backup backend environment
    if ssh_exec "[ -f ${BACKEND_ENV_FILE} ]"; then
        ssh_exec "cp ${BACKEND_ENV_FILE} ${pre_backup_dir}/backend.env"
        info "Backed up backend environment"
    fi

    # Backup nginx configuration
    if ssh_exec "[ -f ${NGINX_CONF_FILE} ]"; then
        ssh_exec "cp ${NGINX_CONF_FILE} ${pre_backup_dir}/nginx.conf"
        info "Backed up nginx configuration"
    fi

    # Backup docker-compose configuration
    if ssh_exec "[ -f ${DOCKER_COMPOSE_FILE} ]"; then
        ssh_exec "cp ${DOCKER_COMPOSE_FILE} ${pre_backup_dir}/docker-compose.yml"
        info "Backed up docker-compose configuration"
    fi

    success "Pre-restore backup created: ${pre_backup_dir}"
    echo "$pre_backup_dir" > /tmp/pre_restore_config_backup.txt
}

#------------------------------------------------------------------------------
# Configuration Restore Functions
#------------------------------------------------------------------------------

restore_backend_env() {
    if [ "$RESTORE_BACKEND_ENV" = false ]; then
        return 0
    fi

    step "Restoring backend environment configuration..."

    if ! ssh_exec "[ -f ${SOURCE}/.env ]"; then
        warning "Backend environment file not found in backup"
        return 0
    fi

    info "Restoring ${BACKEND_ENV_FILE}..."

    if ssh_exec "cp ${SOURCE}/.env ${BACKEND_ENV_FILE}"; then
        success "Backend environment restored"

        # Verify no placeholder values
        if ssh_exec "grep -E 'cli_xxxxxxxxxxxxx|CHANGE_THIS|your_|placeholder' ${BACKEND_ENV_FILE}"; then
            error "Restored configuration contains placeholder values!"
            error "Configuration regression detected"
            return 1
        fi
    else
        error "Failed to restore backend environment"
        return 1
    fi
}

restore_nginx_conf() {
    if [ "$RESTORE_NGINX_CONF" = false ]; then
        return 0
    fi

    step "Restoring nginx configuration..."

    if ! ssh_exec "[ -f ${SOURCE}/nginx.conf ]"; then
        warning "Nginx configuration not found in backup"
        return 0
    fi

    info "Restoring ${NGINX_CONF_FILE}..."

    # Copy to temporary location first
    ssh_exec "cp ${SOURCE}/nginx.conf /tmp/opclaw.conf.restore"

    # Test configuration
    info "Testing nginx configuration..."
    if ! ssh_exec "nginx -t -c /tmp/opclaw.conf.restore" &> /dev/null; then
        error "Nginx configuration test failed"
        error "Configuration not restored to prevent service disruption"
        return 1
    fi

    # Configuration is valid, restore it
    if ssh_exec "mv /tmp/opclaw.conf.restore ${NGINX_CONF_FILE}"; then
        success "Nginx configuration restored"
    else
        error "Failed to restore nginx configuration"
        return 1
    fi
}

restore_docker_compose() {
    if [ "$RESTORE_DOCKER_COMPOSE" = false ]; then
        return 0
    fi

    step "Restoring docker-compose configuration..."

    if ! ssh_exec "[ -f ${SOURCE}/docker-compose.yml ]"; then
        warning "Docker-compose configuration not found in backup"
        return 0
    fi

    info "Restoring ${DOCKER_COMPOSE_FILE}..."

    if ssh_exec "cp ${SOURCE}/docker-compose.yml ${DOCKER_COMPOSE_FILE}"; then
        success "Docker-compose configuration restored"
    else
        error "Failed to restore docker-compose configuration"
        return 1
    fi
}

#------------------------------------------------------------------------------
# Service Restart Functions
#------------------------------------------------------------------------------

reload_nginx() {
    if [ "$RESTORE_NGINX_CONF" = false ]; then
        return 0
    fi

    step "Reloading nginx..."

    if ssh_exec "systemctl reload nginx"; then
        success "Nginx reloaded successfully"
    else
        error "Failed to reload nginx"
        return 1
    fi
}

restart_backend() {
    if [ "$RESTORE_BACKEND_ENV" = false ]; then
        return 0
    fi

    step "Restarting backend service..."

    info "Restarting backend to apply new configuration..."
    if ssh_exec "cd ${DEPLOY_PATH} && docker compose restart backend"; then
        success "Backend service restarted"
    else
        warning "Failed to restart backend service"
    fi
}

#------------------------------------------------------------------------------
# Post-Restore Verification Functions
#------------------------------------------------------------------------------

verify_backend_env() {
    if [ "$RESTORE_BACKEND_ENV" = false ]; then
        return 0
    fi

    step "Verifying backend environment configuration..."

    # Check if file exists
    if ! ssh_exec "[ -f ${BACKEND_ENV_FILE} ]"; then
        error "Backend environment file not found"
        return 1
    fi

    # Verify critical variables
    info "Verifying critical environment variables..."

    if ssh_exec "grep -q '^FEISHU_APP_ID=cli_a93ce5614ce11bd6' ${BACKEND_ENV_FILE}"; then
        success "FEISHU_APP_ID verified"
    else
        warning "FEISHU_APP_ID does not match expected value"
    fi

    if ssh_exec "grep -q '^FEISHU_APP_SECRET=' ${BACKEND_ENV_FILE}"; then
        if ! ssh_exec "grep -q '^FEISHU_APP_SECRET=CHANGE' ${BACKEND_ENV_FILE}"; then
            success "FEISHU_APP_SECRET verified"
        else
            error "FEISHU_APP_SECRET contains placeholder value"
            return 1
        fi
    fi

    if ssh_exec "grep -q '^JWT_SECRET=' ${BACKEND_ENV_FILE}"; then
        if ! ssh_exec "grep -q '^JWT_SECRET=change' ${BACKEND_ENV_FILE}"; then
            success "JWT_SECRET verified"
        else
            error "JWT_SECRET contains placeholder value"
            return 1
        fi
    fi

    success "Backend environment configuration verified"
}

verify_nginx_conf() {
    if [ "$RESTORE_NGINX_CONF" = false ]; then
        return 0
    fi

    step "Verifying nginx configuration..."

    # Test nginx configuration
    if ssh_exec "nginx -t" &> /dev/null; then
        success "Nginx configuration is valid"
    else
        error "Nginx configuration test failed"
        return 1
    fi

    # Check if nginx is running
    if ssh_exec "systemctl is-active nginx" &> /dev/null; then
        success "Nginx is running"
    else
        error "Nginx is not running"
        return 1
    fi
}

verify_restore() {
    if [ "$VERIFY_RESTORE" = false ]; then
        return 0
    fi

    step "Verifying restore..."

    local all_passed=true

    if ! verify_backend_env; then
        all_passed=false
    fi

    if ! verify_nginx_conf; then
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
    echo "Configuration Restore Complete"
    echo "=============================================================================="
    echo ""
    echo "Restore Details:"
    echo "  Source: $SOURCE"
    echo "  Timestamp: $TIMESTAMP"
    echo ""
    echo "Components Restored:"
    [ "$RESTORE_BACKEND_ENV" = true ] && echo "  ✓ Backend Environment"
    [ "$RESTORE_NGINX_CONF" = true ] && echo "  ✓ Nginx Configuration"
    [ "$RESTORE_DOCKER_COMPOSE" = true ] && echo "  ✓ Docker Compose Configuration"
    echo ""
    show_elapsed
    echo ""
    if [ "$PRE_BACKUP" = true ]; then
        local pre_backup=$(cat /tmp/pre_restore_config_backup.txt 2>/dev/null || echo "N/A")
        echo "Pre-Restore Backup:"
        echo "  Location: $pre_backup"
        echo ""
    fi
    echo "Verification:"
    if [ "$VERIFY_RESTORE" = true ]; then
        echo "  Backend Environment: Verified"
        echo "  Nginx Configuration: Verified"
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
  --no-backend-env      Skip backend environment restore
  --no-nginx            Skip nginx configuration restore
  --no-docker-compose   Skip docker-compose configuration restore
  --no-backup           Skip pre-restore backup
  --no-verify           Skip post-restore verification
  --dry-run             Simulate restore without executing
  --help                Display this help message

Environment Variables:
  DEPLOY_USER           SSH user [default: root]
  DEPLOY_HOST           SSH host [default: 118.25.0.190]
  DEPLOY_PATH           Deployment path [default: /opt/opclaw]
  BACKUP_PATH           Backup path [default: /opt/opclaw/backups]

Examples:
  # Restore all configuration from specific backup
  $0 --source /opt/opclaw/backups/backup_20260318_120000

  # Restore only backend environment
  $0 --source /opt/opclaw/backups/backup_20260318_120000 --no-nginx --no-docker-compose

  # Restore from latest backup
  $0 --latest

  # Simulate restore
  $0 --source /opt/opclaw/backups/backup_20260318_120000 --dry-run

Features:
  - Optimized restore speed (< 2 minutes)
  - Pre-restore backup creation
  - Post-restore verification
  - Configuration regression prevention
  - Placeholder value detection

Configuration Regression Prevention:
  This script includes safety checks to prevent configuration regression:
  - Detects placeholder values (cli_xxx, CHANGE_THIS, your_xxx)
  - Verifies critical configuration values
  - Tests nginx configuration before applying
  - Creates pre-restore backup for recovery

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
            --no-backend-env)
                RESTORE_BACKEND_ENV=false
                shift
                ;;
            --no-nginx)
                RESTORE_NGINX_CONF=false
                shift
                ;;
            --no-docker-compose)
                RESTORE_DOCKER_COMPOSE=false
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
    echo "Configuration Restore Script"
    echo "=============================================================================="
    echo "Timestamp: $TIMESTAMP"
    echo "Source: $SOURCE"
    echo "=============================================================================="
    echo ""

    if [ "$DRY_RUN" = true ]; then
        warning "DRY RUN MODE - No changes will be made"
        echo ""
    fi

    # Execute restore process
    validate_source
    validate_config_files
    create_pre_restore_backup
    restore_backend_env
    restore_nginx_conf
    restore_docker_compose
    reload_nginx
    restart_backend
    verify_restore

    # Print summary
    print_summary

    success "Configuration restore completed successfully!"
}

#------------------------------------------------------------------------------
# Script Entry Point
#------------------------------------------------------------------------------

main "$@"
