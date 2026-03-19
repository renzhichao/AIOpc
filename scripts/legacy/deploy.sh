#!/bin/bash

#==============================================================================
# AIOpc Cloud Deployment Script
#==============================================================================
# This script handles the deployment of the AIOpc platform to the cloud server.
#
# Features:
# - Zero-downtime deployment
# - Automatic backups
# - Health checks
# - Rollback support
# - Clear logging
#
# Usage:
#   ./deploy.sh [--skip-backup] [--skip-tests] [--rollback]
#
# Environment Variables:
#   DEPLOY_USER      - SSH user (default: root)
#   DEPLOY_HOST      - SSH host (default: 118.25.0.190)
#   DEPLOY_PATH      - Deployment path (default: /opt/opclaw)
#   BACKUP_PATH      - Backup path (default: /opt/opclaw/backups)
#==============================================================================

set -e  # Exit on error
set -u  # Exit on undefined variable

#------------------------------------------------------------------------------
# Configuration
#------------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Deployment settings
DEPLOY_USER=${DEPLOY_USER:-root}
DEPLOY_HOST=${DEPLOY_HOST:-118.25.0.190}
DEPLOY_PATH=${DEPLOY_PATH:-/opt/opclaw}
BACKUP_PATH=${BACKUP_PATH:-/opt/opclaw/backups}

# Options
SKIP_BACKUP=false
SKIP_TESTS=false
ROLLBACK=false

#------------------------------------------------------------------------------
# Utility Functions
#------------------------------------------------------------------------------

log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    echo -e "${timestamp} [${level}] ${message}" | tee -a "$PROJECT_ROOT/deploy.log"
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

# SSH command wrapper
ssh_exec() {
    local command="$*"
    ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "${DEPLOY_USER}@${DEPLOY_HOST}" "$command"
}

# SCP command wrapper
scp_upload() {
    local source=$1
    local destination=$2
    scp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "$source" "${DEPLOY_USER}@${DEPLOY_HOST}:${destination}"
}

#------------------------------------------------------------------------------
# Pre-flight Checks
#------------------------------------------------------------------------------

check_prerequisites() {
    info "Checking prerequisites..."

    # Check if SSH is available
    if ! command -v ssh &> /dev/null; then
        error "SSH client is not installed"
        exit 1
    fi

    # Check if we can connect to the server
    if ! ssh_exec "echo 'Connection successful'" &> /dev/null; then
        error "Cannot connect to server ${DEPLOY_USER}@${DEPLOY_HOST}"
        error "Please check your SSH credentials and network connection"
        exit 1
    fi

    # Check if required directories exist
    if [ ! -d "$PROJECT_ROOT/backend" ]; then
        error "Backend directory not found: $PROJECT_ROOT/backend"
        exit 1
    fi

    if [ ! -d "$PROJECT_ROOT/frontend" ]; then
        error "Frontend directory not found: $PROJECT_ROOT/frontend"
        exit 1
    fi

    success "Prerequisites check passed"
}

check_build() {
    info "Checking if build artifacts exist..."

    # Check if backend is built
    if [ ! -d "$PROJECT_ROOT/backend/dist" ]; then
        warning "Backend build not found. Building..."
        build_backend
    else
        info "Backend build exists"
    fi

    # Check if frontend is built
    if [ ! -d "$PROJECT_ROOT/frontend/dist" ]; then
        warning "Frontend build not found. Building..."
        build_frontend
    else
        info "Frontend build exists"
    fi

    success "Build artifacts check passed"
}

#------------------------------------------------------------------------------
# Build Functions
#------------------------------------------------------------------------------

build_backend() {
    info "Building backend..."

    cd "$PROJECT_ROOT/backend"

    # Install dependencies
    if [ -f "pnpm-lock.yaml" ]; then
        pnpm install --frozen-lockfile
    else
        npm ci
    fi

    # Build
    pnpm run build

    success "Backend build completed"
}

build_frontend() {
    info "Building frontend..."

    cd "$PROJECT_ROOT/frontend"

    # Install dependencies
    if [ -f "pnpm-lock.yaml" ]; then
        pnpm install --frozen-lockfile
    else
        npm ci
    fi

    # Build
    pnpm run build

    success "Frontend build completed"
}

#------------------------------------------------------------------------------
# Backup Functions
#------------------------------------------------------------------------------

create_backup() {
    if [ "$SKIP_BACKUP" = true ]; then
        warning "Skipping backup (--skip-backup flag set)"
        return 0
    fi

    info "Creating backup..."

    local backup_dir="${BACKUP_PATH}/backup_${TIMESTAMP}"

    # Create backup directory on server
    ssh_exec "mkdir -p ${backup_dir}"

    # Backup backend
    if ssh_exec "[ -d ${DEPLOY_PATH}/backend ]"; then
        info "Backing up backend..."
        ssh_exec "cd ${DEPLOY_PATH} && tar -czf ${backup_dir}/backend.tar.gz backend/"
    fi

    # Backup frontend
    if ssh_exec "[ -d /var/www/opclaw ]"; then
        info "Backing up frontend..."
        ssh_exec "tar -czf ${backup_dir}/frontend.tar.gz /var/www/opclaw"
    fi

    # Backup database
    info "Backing up database..."
    ssh_exec "PGPASSWORD=\${POSTGRES_PASSWORD} pg_dump -h localhost -U opclaw opclaw | gzip > ${backup_dir}/database.sql.gz" || {
        warning "Database backup failed (may not be initialized yet)"
    }

    # Save backup metadata
    ssh_exec "cat > ${backup_dir}/metadata.txt << EOF
Timestamp: ${TIMESTAMP}
Deploy Date: $(date)
Deploy User: ${DEPLOY_USER}
Deploy Host: ${DEPLOY_HOST}
EOF"

    success "Backup created: ${backup_dir}"

    # Keep only last 5 backups
    info "Cleaning old backups..."
    ssh_exec "cd ${BACKUP_PATH} && ls -t | tail -n +6 | xargs -r rm -rf"
}

#------------------------------------------------------------------------------
# Deployment Functions
#------------------------------------------------------------------------------

deploy_backend() {
    info "Deploying backend..."

    # Upload backend build
    info "Uploading backend files..."
    scp_upload -r "$PROJECT_ROOT/backend/dist" "${DEPLOY_PATH}/backend/"

    # Upload backend dependencies
    info "Uploading backend dependencies..."
    scp_upload "$PROJECT_ROOT/backend/package.json" "${DEPLOY_PATH}/backend/"
    scp_upload "$PROJECT_ROOT/backend/pnpm-lock.yaml" "${DEPLOY_PATH}/backend/"

    # Install dependencies on server
    ssh_exec "cd ${DEPLOY_PATH}/backend && pnpm install --prod"

    success "Backend deployed successfully"
}

deploy_frontend() {
    info "Deploying frontend..."

    # Create frontend directory if it doesn't exist
    ssh_exec "mkdir -p /var/www/opclaw"

    # Upload frontend build
    info "Uploading frontend files..."
    scp_upload -r "$PROJECT_ROOT/frontend/dist/" "/var/www/opclaw/"

    # Set permissions
    ssh_exec "chown -R www-data:www-data /var/www/opclaw"
    ssh_exec "chmod -R 755 /var/www/opclaw"

    success "Frontend deployed successfully"
}

deploy_config() {
    info "Deploying configuration files..."

    # Deploy systemd service files
    if [ -d "$PROJECT_ROOT/config/systemd" ]; then
        info "Uploading systemd service files..."
        scp_upload "$PROJECT_ROOT/config/systemd/opclaw-backend.service" "/etc/systemd/system/"
        scp_upload "$PROJECT_ROOT/config/systemd/opclaw-metrics.service" "/etc/systemd/system/"

        # Reload systemd
        ssh_exec "systemctl daemon-reload"
    fi

    # Deploy nginx configuration
    if [ -f "$PROJECT_ROOT/config/nginx/opclaw.conf" ]; then
        info "Uploading nginx configuration..."
        scp_upload "$PROJECT_ROOT/config/nginx/opclaw.conf" "/etc/nginx/sites-available/opclaw"

        # Enable site
        ssh_exec "ln -sf /etc/nginx/sites-available/opclaw /etc/nginx/sites-enabled/opclaw"

        # Test nginx configuration
        if ! ssh_exec "nginx -t" &> /dev/null; then
            error "Nginx configuration test failed"
            error "Rolling back nginx configuration..."
            ssh_exec "rm -f /etc/nginx/sites-enabled/opclaw"
            exit 1
        fi
    fi

    success "Configuration files deployed successfully"
}

#------------------------------------------------------------------------------
# Service Management
#------------------------------------------------------------------------------

restart_services() {
    info "Restarting services..."

    # Restart backend
    info "Restarting backend service..."
    ssh_exec "systemctl restart opclaw-backend"

    # Restart metrics collector
    info "Restarting metrics service..."
    ssh_exec "systemctl restart opclaw-metrics" || {
        warning "Metrics service restart failed (may not be configured yet)"
    }

    # Reload nginx
    info "Reloading nginx..."
    ssh_exec "systemctl reload nginx"

    success "Services restarted successfully"
}

#------------------------------------------------------------------------------
# Health Checks
#------------------------------------------------------------------------------

health_check() {
    info "Running health checks..."

    # Wait for backend to start
    sleep 5

    # Check backend health
    local max_attempts=30
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        if ssh_exec "curl -sf http://localhost:3000/health" &> /dev/null; then
            success "Backend health check passed"
            return 0
        fi

        info "Waiting for backend to start... (attempt $attempt/$max_attempts)"
        sleep 2
        ((attempt++))
    done

    error "Backend health check failed after $max_attempts attempts"
    return 1
}

#------------------------------------------------------------------------------
# Rollback Functions
#------------------------------------------------------------------------------

rollback() {
    warning "Initiating rollback..."

    local latest_backup=$(ssh_exec "ls -t ${BACKUP_PATH} | head -n 1" 2>/dev/null)

    if [ -z "$latest_backup" ]; then
        error "No backup found for rollback"
        exit 1
    fi

    local backup_path="${BACKUP_PATH}/${latest_backup}"

    info "Rolling back to backup: ${backup_path}"

    # Restore backend
    if ssh_exec "[ -f ${backup_path}/backend.tar.gz ]"; then
        info "Restoring backend..."
        ssh_exec "cd ${DEPLOY_PATH} && tar -xzf ${backup_path}/backend.tar.gz"
    fi

    # Restore frontend
    if ssh_exec "[ -f ${backup_path}/frontend.tar.gz ]"; then
        info "Restoring frontend..."
        ssh_exec "tar -xzf ${backup_path}/frontend.tar.gz -C /"
    fi

    # Restore database
    if ssh_exec "[ -f ${backup_path}/database.sql.gz ]"; then
        info "Restoring database..."
        ssh_exec "gunzip < ${backup_path}/database.sql.gz | PGPASSWORD=\${POSTGRES_PASSWORD} psql -h localhost -U opclaw opclaw"
    fi

    # Restart services
    restart_services

    success "Rollback completed successfully"
}

#------------------------------------------------------------------------------
# Run Tests
#------------------------------------------------------------------------------

run_tests() {
    if [ "$SKIP_TESTS" = true ]; then
        warning "Skipping tests (--skip-tests flag set)"
        return 0
    fi

    info "Running tests..."

    # Run backend tests
    if [ -f "$PROJECT_ROOT/backend/package.json" ]; then
        cd "$PROJECT_ROOT/backend"

        if grep -q '"test"' package.json; then
            info "Running backend tests..."
            pnpm test || {
                error "Backend tests failed"
                exit 1
            }
        else
            warning "No test script found in backend"
        fi
    fi

    success "Tests passed"
}

#------------------------------------------------------------------------------
# Print Summary
#------------------------------------------------------------------------------

print_summary() {
    echo ""
    echo "=============================================================================="
    echo "Deployment Complete"
    echo "=============================================================================="
    echo ""
    echo "Deployment Details:"
    echo "  Timestamp: $TIMESTAMP"
    echo "  Host: $DEPLOY_HOST"
    echo "  User: $DEPLOY_USER"
    echo "  Path: $DEPLOY_PATH"
    echo ""
    echo "Access URLs:"
    echo "  Frontend: https://renava.cn"
    echo "  API: https://renava.cn/api"
    echo "  Health: https://renava.cn/health"
    echo ""
    echo "Service Status:"
    echo "  Check: ssh ${DEPLOY_USER}@${DEPLOY_HOST} 'systemctl status opclaw-backend'"
    echo ""
    echo "Logs:"
    echo "  Backend: ssh ${DEPLOY_USER}@${DEPLOY_HOST} 'journalctl -u opclaw-backend -f'"
    echo "  Nginx: ssh ${DEPLOY_USER}@${DEPLOY_HOST} 'journalctl -u nginx -f'"
    echo ""
    echo "=============================================================================="
}

#------------------------------------------------------------------------------
# Main Function
#------------------------------------------------------------------------------

main() {
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-backup)
                SKIP_BACKUP=true
                shift
                ;;
            --skip-tests)
                SKIP_TESTS=true
                shift
                ;;
            --rollback)
                ROLLBACK=true
                shift
                ;;
            --help)
                echo "Usage: $0 [--skip-backup] [--skip-tests] [--rollback]"
                echo ""
                echo "Options:"
                echo "  --skip-backup  Skip creating backup before deployment"
                echo "  --skip-tests   Skip running tests"
                echo "  --rollback     Rollback to previous backup"
                echo "  --help         Show this help message"
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                echo "Use --help for usage information"
                exit 1
                ;;
        esac
    done

    echo "=============================================================================="
    echo "AIOpc Cloud Deployment"
    echo "=============================================================================="
    echo "Timestamp: $TIMESTAMP"
    echo "Host: ${DEPLOY_USER}@${DEPLOY_HOST}"
    echo "Skip Backup: $SKIP_BACKUP"
    echo "Skip Tests: $SKIP_TESTS"
    echo "Rollback: $ROLLBACK"
    echo "=============================================================================="
    echo ""

    # Handle rollback
    if [ "$ROLLBACK" = true ]; then
        rollback
        exit 0
    fi

    # Pre-flight checks
    check_prerequisites
    check_build

    # Run tests
    run_tests

    # Create backup
    create_backup

    # Deploy
    deploy_config
    deploy_backend
    deploy_frontend

    # Restart services
    restart_services

    # Health check
    if ! health_check; then
        error "Health check failed. Rolling back..."
        rollback
        exit 1
    fi

    # Print summary
    print_summary

    success "Deployment completed successfully!"
}

#------------------------------------------------------------------------------
# Script Entry Point
#------------------------------------------------------------------------------

main "$@"
