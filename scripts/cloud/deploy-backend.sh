#!/bin/bash
#==============================================================================
# AIOpc Backend Deployment Script
#==============================================================================
# Purpose: Deploy backend application to cloud server
#
# Features:
# - Local build optimization
# - Automated backup creation
# - Efficient code upload with rsync
# - PM2 process management
# - Health check verification
# - Complete error handling
#
# Usage:
#   ./deploy-backend.sh [--dry-run] [--skip-build] [--verbose]
#
# Environment:
#   SERVER: SSH server address (default: root@118.25.0.190)
#   BACKEND_DIR: Remote deployment directory (default: /opt/opclaw/backend)
#==============================================================================

set -e  # Exit on error
set -u  # Exit on undefined variable
set -o pipefail  # Exit on pipe failure

#==============================================================================
# Configuration
#==============================================================================

SERVER="${SERVER:-root@118.25.0.190}"
BACKEND_DIR="${BACKEND_DIR:-/opt/opclaw/backend}"
LOCAL_BACKEND="${LOCAL_BACKEND:-platform/backend}"
BACKUP_DIR="${BACKUP_DIR:-/opt/opclaw/backups}"

# Parse arguments
DRY_RUN=false
SKIP_BUILD=false
VERBOSE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            set -x
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

#==============================================================================
# Logging Functions
#==============================================================================

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

log_step() {
    echo -e "${BLUE}==>${NC} $1"
}

#==============================================================================
# Utility Functions
#==============================================================================

check_command() {
    if ! command -v $1 &> /dev/null; then
        log_error "Required command not found: $1"
        exit 1
    fi
}

run_ssh() {
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] SSH: $1"
    else
        ssh $SERVER "$1"
    fi
}

run_scp() {
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] SCP: $1 -> $2"
    else
        scp $1 $2
    fi
}

run_rsync() {
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] RSYNC: $1 -> $2"
    else
        rsync $@
    fi
}

#==============================================================================
# Pre-flight Checks
#==============================================================================

preflight_checks() {
    log_step "Step 1: Pre-flight checks"

    # Check required commands
    log_info "Checking required commands..."
    check_command ssh
    check_command scp
    check_command rsync
    check_command node
    check_command pnpm

    # Check local backend directory
    if [ ! -d "$LOCAL_BACKEND" ]; then
        log_error "Backend directory not found: $LOCAL_BACKEND"
        exit 1
    fi
    log_success "Backend directory found: $LOCAL_BACKEND"

    # Check package.json
    if [ ! -f "$LOCAL_BACKEND/package.json" ]; then
        log_error "package.json not found in $LOCAL_BACKEND"
        exit 1
    fi
    log_success "package.json found"

    # Check server connectivity
    log_info "Checking server connectivity..."
    if ! run_ssh "echo 'Server connection successful'" &> /dev/null; then
        log_error "Cannot connect to server: $SERVER"
        log_error "Please ensure:"
        log_error "  - SSH key is configured"
        log_error "  - Server is accessible"
        log_error "  - Firewall allows SSH"
        exit 1
    fi
    log_success "Server connectivity verified"

    # Check Node.js version on server
    log_info "Checking Node.js version on server..."
    NODE_VERSION=$(run_ssh "node --version" || echo "not installed")
    log_success "Node.js version: $NODE_VERSION"

    log_success "Pre-flight checks completed"
    echo
}

#==============================================================================
# Build Backend Locally
#==============================================================================

build_backend() {
    if [ "$SKIP_BUILD" = true ]; then
        log_warning "Skipping local build (--skip-build flag)"
        return
    fi

    log_step "Step 2: Building backend locally"

    cd "$LOCAL_BACKEND"

    # Clean previous build
    log_info "Cleaning previous build..."
    rm -rf dist

    # Install dependencies
    log_info "Installing dependencies..."
    pnpm install --frozen-lockfile

    # Run tests (optional)
    if [ "${RUN_TESTS:-false}" = true ]; then
        log_info "Running tests..."
        pnpm test
    fi

    # Build TypeScript
    log_info "Building TypeScript..."
    pnpm run build

    # Verify build output
    if [ ! -f "dist/app.js" ]; then
        log_error "Build failed: dist/app.js not found"
        exit 1
    fi

    cd - > /dev/null
    log_success "Backend build completed"
    echo
}

#==============================================================================
# Create Backup on Server
#==============================================================================

create_backup() {
    log_step "Step 3: Creating backup on server"

    # Create backup directory if it doesn't exist
    run_ssh "mkdir -p $BACKUP_DIR"

    # Check if backend directory exists
    if run_ssh "[ -d '$BACKEND_DIR' ]"; then
        # Create timestamped backup
        TIMESTAMP=$(date +%Y%m%d_%H%M%S)
        BACKUP_NAME="backend_backup_$TIMESTAMP"

        log_info "Creating backup: $BACKUP_NAME"
        run_ssh "cd /opt/opclaw && tar -czf $BACKUP_DIR/$BACKUP_NAME.tar.gz backend 2>/dev/null || true"

        # Keep only last 5 backups
        log_info "Cleaning old backups (keeping last 5)..."
        run_ssh "cd $BACKUP_DIR && ls -t backend_backup_*.tar.gz 2>/dev/null | tail -n +6 | xargs -r rm"

        log_success "Backup created: $BACKUP_NAME"
    else
        log_info "No existing backend directory found, skipping backup"
    fi
    echo
}

#==============================================================================
# Upload Code to Server
#==============================================================================

upload_code() {
    log_step "Step 4: Uploading backend code to server"

    # Create remote directory
    run_ssh "mkdir -p $BACKEND_DIR"

    # Upload code using rsync
    log_info "Uploading files with rsync..."
    run_rsync -avz --delete \
        --exclude 'node_modules' \
        --exclude 'dist' \
        --exclude '.env' \
        --exclude '.env.*' \
        --exclude 'coverage' \
        --exclude '*.log' \
        --exclude '.DS_Store' \
        --exclude 'tmp' \
        --exclude 'temp' \
        "$LOCAL_BACKEND/" $SERVER:$BACKEND_DIR/

    log_success "Code upload completed"
    echo
}

#==============================================================================
# Install Production Dependencies
#==============================================================================

install_dependencies() {
    log_step "Step 5: Installing production dependencies"

    run_ssh "cd $BACKEND_DIR && pnpm install --prod --frozen-lockfile"

    log_success "Dependencies installed"
    echo
}

#==============================================================================
# Build on Server
#==============================================================================

build_on_server() {
    log_step "Step 6: Building on server"

    run_ssh "cd $BACKEND_DIR && pnpm run build"

    # Verify build
    if ! run_ssh "[ -f '$BACKEND_DIR/dist/app.js' ]"; then
        log_error "Build failed on server: dist/app.js not found"
        exit 1
    fi

    log_success "Server build completed"
    echo
}

#==============================================================================
# Configure Environment
#==============================================================================

configure_environment() {
    log_step "Step 7: Configuring environment"

    # Check if .env exists
    if run_ssh "[ -f '$BACKEND_DIR/.env' ]"; then
        log_warning ".env file already exists, skipping configuration"
        log_info "To reconfigure, remove the existing .env file first"
    else
        log_info "Creating .env from template..."
        run_ssh "cp $BACKEND_DIR/.env.production.example $BACKEND_DIR/.env"
        log_warning "Please edit .env on server with production values"
    fi

    echo
}

#==============================================================================
# Install and Configure PM2
#==============================================================================

install_pm2() {
    log_step "Step 8: Installing and configuring PM2"

    # Check if PM2 is installed
    if ! run_ssh "npm list -g pm2" &> /dev/null; then
        log_info "Installing PM2 globally..."
        run_ssh "npm install -g pm2"
    else
        log_info "PM2 already installed"
    fi

    # Copy ecosystem config if it exists
    if [ -f "config/pm2/ecosystem.config.js" ]; then
        log_info "Uploading PM2 ecosystem config..."
        run_scp "config/pm2/ecosystem.config.js" $SERVER:$BACKEND_DIR/ecosystem.config.js
    fi

    log_success "PM2 configured"
    echo
}

#==============================================================================
# Start/Restart Service
#==============================================================================

start_service() {
    log_step "Step 9: Starting/restarting service with PM2"

    # Check if process exists
    if run_ssh "pm2 describe opclaw-backend" &> /dev/null; then
        log_info "Restarting existing process..."
        run_ssh "cd $BACKEND_DIR && pm2 restart opclaw-backend"
    else
        log_info "Starting new process..."
        run_ssh "cd $BACKEND_DIR && pm2 start dist/app.js --name opclaw-backend"
    fi

    # Save PM2 process list
    run_ssh "pm2 save"

    # Setup PM2 startup script (if not already done)
    log_info "Configuring PM2 startup..."
    run_ssh "pm2 startup systemd -u opclaw --hp /home/opclaw 2>/dev/null || echo 'PM2 startup already configured'"

    log_success "Service started"
    echo
}

#==============================================================================
# Health Check
#==============================================================================

health_check() {
    log_step "Step 10: Performing health check"

    # Wait for service to start
    log_info "Waiting for service to start..."
    sleep 5

    # Check PM2 process status
    log_info "Checking PM2 process status..."
    PM2_STATUS=$(run_ssh "pm2 status opclaw-backend --json" || echo "{}")
    if ! echo "$PM2_STATUS" | grep -q "online"; then
        log_error "PM2 process is not running"
        run_ssh "pm2 logs opclaw-backend --lines 20 --nostream"
        exit 1
    fi
    log_success "PM2 process is running"

    # Check health endpoint
    log_info "Checking health endpoint..."
    HEALTH_CHECK=$(run_ssh "curl -f -s http://localhost:3000/health || echo 'failed'" || echo "failed")
    if [ "$HEALTH_CHECK" = "failed" ]; then
        log_error "Health check failed"
        run_ssh "pm2 logs opclaw-backend --lines 20 --nostream"
        exit 1
    fi
    log_success "Health check passed"

    # Show service info
    log_info "Service information:"
    run_ssh "pm2 show opclaw-backend"

    log_success "Health check completed"
    echo
}

#==============================================================================
# Display Summary
#==============================================================================

display_summary() {
    log_step "Deployment Summary"

    echo
    echo "Backend Deployment Complete!"
    echo
    echo "Server: $SERVER"
    echo "Directory: $BACKEND_DIR"
    echo
    echo "Service Management:"
    echo "  Status:    ssh $SERVER 'pm2 status'"
    echo "  Logs:      ssh $SERVER 'pm2 logs opclaw-backend'"
    echo "  Restart:   ssh $SERVER 'pm2 restart opclaw-backend'"
    echo "  Stop:      ssh $SERVER 'pm2 stop opclaw-backend'"
    echo
    echo "Service Access:"
    echo "  API:       http://118.25.0.190:3000"
    echo "  Health:    http://118.25.0.190:3000/health"
    echo
    echo "Next Steps:"
    echo "  1. Configure environment variables on server:"
    echo "     ssh $SERVER 'nano $BACKEND_DIR/.env'"
    echo
    echo "  2. Restart service after configuration:"
    echo "     ssh $SERVER 'pm2 restart opclaw-backend'"
    echo
    echo "  3. Verify service health:"
    echo "     ssh $SERVER 'curl http://localhost:3000/health'"
    echo
}

#==============================================================================
# Main Execution
#==============================================================================

main() {
    echo
    echo "=============================================================="
    echo "  AIOpc Backend Deployment"
    echo "=============================================================="
    echo
    echo "Server: $SERVER"
    echo "Local: $LOCAL_BACKEND"
    echo "Remote: $BACKEND_DIR"
    echo "Dry Run: $DRY_RUN"
    echo
    echo "=============================================================="
    echo

    if [ "$DRY_RUN" = true ]; then
        log_warning "DRY RUN MODE - No changes will be made"
        echo
    fi

    # Execute deployment steps
    preflight_checks
    build_backend
    create_backup
    upload_code
    install_dependencies
    build_on_server
    configure_environment
    install_pm2
    start_service
    health_check
    display_summary

    echo "=============================================================="
    log_success "Deployment completed successfully!"
    echo "=============================================================="
    echo
}

# Run main function
main "$@"
