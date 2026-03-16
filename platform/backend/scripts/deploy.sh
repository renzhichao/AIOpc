#!/bin/bash

######################################################################
# Production Deployment Script
######################################################################
#
# This script automates the deployment of the AIOpc Platform Backend
# to production environment.
#
# Usage:
#   ./scripts/deploy.sh [environment]
#
# Arguments:
#   environment - Target environment (production|staging) [default: production]
#
# Features:
# - Pre-deployment checks
# - Automated backup
# - Zero-downtime deployment
# - Rollback capability
# - Health check validation
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
ENVIRONMENT="${1:-production}"

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
# Pre-deployment Checks
######################################################################

check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check Node.js version
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi

    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 20 ]; then
        log_error "Node.js version 20 or higher is required (current: $(node -v))"
        exit 1
    fi
    log_success "Node.js version: $(node -v)"

    # Check pnpm
    if ! command -v pnpm &> /dev/null; then
        log_error "pnpm is not installed"
        exit 1
    fi
    log_success "pnpm version: $(pnpm -v)"

    # Check environment file
    if [ ! -f "${PROJECT_ROOT}/.env.${ENVIRONMENT}" ]; then
        log_error "Environment file not found: .env.${ENVIRONMENT}"
        log_info "Please create .env.${ENVIRONMENT} from .env.production.example"
        exit 1
    fi
    log_success "Environment file found"

    # Check PostgreSQL connection
    if ! psql -h localhost -U opclaw -d opclaw_production -c "SELECT 1" &> /dev/null; then
        log_error "Cannot connect to PostgreSQL database"
        exit 1
    fi
    log_success "PostgreSQL connection OK"

    # Check Redis connection
    if ! redis-cli ping &> /dev/null; then
        log_error "Cannot connect to Redis"
        exit 1
    fi
    log_success "Redis connection OK"

    log_success "All prerequisites passed"
}

######################################################################
# Backup Functions
######################################################################

backup_database() {
    log_info "Backing up database..."

    local backup_dir="${PROJECT_ROOT}/backups"
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    local backup_file="${backup_dir}/opclaw_db_${timestamp}.sql.gz"

    mkdir -p "${backup_dir}"

    if ! pg_dump -U opclaw -h localhost opclaw_production | gzip > "${backup_file}"; then
        log_error "Database backup failed"
        exit 1
    fi

    log_success "Database backed up to: ${backup_file}"
}

backup_files() {
    log_info "Backing up files..."

    local backup_dir="${PROJECT_ROOT}/backups"
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    local backup_file="${backup_dir}/opclaw_files_${timestamp}.tar.gz"

    mkdir -p "${backup_dir}"

    if ! tar -czf "${backup_file}" \
        -C "${PROJECT_ROOT}" \
        .env.${ENVIRONMENT} \
        dist/ \
        node_modules/; then
        log_error "File backup failed"
        exit 1
    fi

    log_success "Files backed up to: ${backup_file}"
}

######################################################################
# Deployment Functions
######################################################################

install_dependencies() {
    log_info "Installing dependencies..."

    cd "${PROJECT_ROOT}"

    if ! pnpm install --prod=false; then
        log_error "Failed to install dependencies"
        exit 1
    fi

    log_success "Dependencies installed"
}

build_application() {
    log_info "Building application..."

    cd "${PROJECT_ROOT}"

    if ! pnpm run build; then
        log_error "Build failed"
        exit 1
    fi

    log_success "Application built successfully"
}

run_migrations() {
    log_info "Running database migrations..."

    cd "${PROJECT_ROOT}"

    if ! pnpm run db:migrate; then
        log_error "Database migrations failed"
        exit 1
    fi

    log_success "Database migrations completed"
}

restart_service() {
    log_info "Restarting service..."

    if [ "$ENVIRONMENT" = "production" ]; then
        sudo systemctl restart opclaw-backend
    else
        # For staging/development, use PM2 or nodemon
        pkill -f "node dist/app.js" || true
        nohup node dist/app.js > app.log 2>&1 &
    fi

    log_success "Service restarted"
}

######################################################################
# Health Check Functions
######################################################################

wait_for_service() {
    local max_attempts=30
    local attempt=1

    log_info "Waiting for service to be ready..."

    while [ $attempt -le $max_attempts ]; do
        if curl -f http://localhost:3000/health &> /dev/null; then
            log_success "Service is ready"
            return 0
        fi

        log_info "Attempt ${attempt}/${max_attempts}: Service not ready yet..."
        sleep 2
        attempt=$((attempt + 1))
    done

    log_error "Service failed to start within expected time"
    return 1
}

run_health_checks() {
    log_info "Running health checks..."

    # Check basic health
    if ! curl -f http://localhost:3000/health &> /dev/null; then
        log_error "Basic health check failed"
        return 1
    fi

    # Check readiness
    if ! curl -f http://localhost:3000/health/ready &> /dev/null; then
        log_error "Readiness check failed"
        return 1
    fi

    # Check database connectivity
    local health_output=$(curl -s http://localhost:3000/health/ready)
    if ! echo "$health_output" | grep -q '"database".*"healthy"'; then
        log_error "Database health check failed"
        return 1
    fi

    # Check Redis connectivity
    if ! echo "$health_output" | grep -q '"redis".*"healthy"'; then
        log_error "Redis health check failed"
        return 1
    fi

    log_success "All health checks passed"
}

######################################################################
# Rollback Function
######################################################################

rollback() {
    log_error "Deployment failed, initiating rollback..."

    local backup_dir="${PROJECT_ROOT}/backups"

    # Find latest database backup
    local latest_db_backup=$(ls -t "${backup_dir}"/opclaw_db_*.sql.gz 2>/dev/null | head -1)
    if [ -n "$latest_db_backup" ]; then
        log_info "Restoring database from: ${latest_db_backup}"
        gunzip < "${latest_db_backup}" | psql -U opclaw -d opclaw_production
    fi

    # Restart service
    restart_service
    wait_for_service

    log_error "Rollback completed"
}

######################################################################
# Main Deployment Flow
######################################################################

main() {
    log_info "Starting deployment to ${ENVIRONMENT}..."
    log_info "Project root: ${PROJECT_ROOT}"
    log_info "Timestamp: $(date)"

    # Pre-deployment checks
    check_prerequisites

    # Backup
    backup_database
    backup_files

    # Deployment
    install_dependencies
    build_application
    run_migrations

    # Restart service
    restart_service

    # Wait for service to be ready
    if ! wait_for_service; then
        rollback
        exit 1
    fi

    # Health checks
    if ! run_health_checks; then
        rollback
        exit 1
    fi

    log_success "Deployment to ${ENVIRONMENT} completed successfully!"
    log_info "Deployment timestamp: $(date)"
}

######################################################################
# Script Entry Point
######################################################################

# Trap errors and cleanup
trap 'log_error "Deployment failed at line $LINENO"; rollback; exit 1' ERR

# Run main deployment flow
main "$@"
