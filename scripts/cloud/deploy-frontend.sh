#!/bin/bash
#==============================================================================
# AIOpc Frontend Deployment Script
#==============================================================================
# Purpose: Deploy React frontend to cloud server
# Server: 118.25.0.190 (root@118.25.0.190)
# Domain: renava.cn
#
# Features:
# - Local build optimization
# - Backup before deployment
# - Rsync file synchronization
# - Nginx configuration
# - Deployment verification
#
# Usage:
#   ./scripts/cloud/deploy-frontend.sh [--skip-build] [--dry-run]
#
# Options:
#   --skip-build   Skip local build (use existing dist/)
#   --dry-run      Show what would be done without executing
#==============================================================================

set -e  # Exit on error
set -o pipefail  # Exit on pipe failure

#==============================================================================
# Configuration
#==============================================================================

SERVER="root@118.25.0.190"
FRONTEND_DIR="/var/www/opclaw"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOCAL_FRONTEND="${PROJECT_ROOT}/platform/frontend"
CONFIG_DIR="${PROJECT_ROOT}/config/nginx"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
SKIP_BUILD=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

#==============================================================================
# Functions
#==============================================================================

print_header() {
    echo
    echo -e "${BLUE}=== $1 ===${NC}"
    echo
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

run_command() {
    local cmd="$1"

    if [ "$DRY_RUN" = true ]; then
        echo "[DRY RUN] $cmd"
    else
        eval "$cmd"
    fi
}

#==============================================================================
# Pre-flight Checks
#==============================================================================

print_header "AIOpc Frontend Deployment"

echo "Server: $SERVER"
echo "Local: $LOCAL_FRONTEND"
echo "Remote: $FRONTEND_DIR"
echo

if [ "$DRY_RUN" = true ]; then
    print_warning "DRY RUN MODE - No changes will be made"
    echo
fi

# Check if frontend directory exists
print_info "Step 1: Pre-flight checks..."

if [ ! -d "$LOCAL_FRONTEND" ]; then
    print_error "Frontend directory not found: $LOCAL_FRONTEND"
    exit 1
fi

print_success "Frontend directory found"

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    print_error "pnpm is not installed"
    exit 1
fi

print_success "pnpm is installed"

# Check if rsync is installed
if ! command -v rsync &> /dev/null; then
    print_error "rsync is not installed"
    exit 1
fi

print_success "rsync is installed"

# Test SSH connection
print_info "Testing SSH connection..."
if ! run_command "ssh -o ConnectTimeout=5 $SERVER 'echo -n \"\"' 2>/dev/null"; then
    print_error "Cannot connect to server $SERVER"
    exit 1
fi

print_success "SSH connection successful"

#==============================================================================
# Build Frontend Locally
#==============================================================================

print_header "Step 2: Building frontend locally"

cd "$LOCAL_FRONTEND"

if [ "$SKIP_BUILD" = true ]; then
    print_warning "Skipping build (using existing dist/)"
    if [ ! -d "dist" ]; then
        print_error "dist/ directory not found. Cannot skip build."
        exit 1
    fi
else
    print_info "Installing dependencies..."
    run_command "pnpm install --frozen-lockfile"

    print_info "Building frontend..."
    run_command "pnpm run build"

    # Verify build
    if [ ! -d "dist" ]; then
        print_error "Build failed - dist directory not found"
        exit 1
    fi

    if [ ! -f "dist/index.html" ]; then
        print_error "Build failed - index.html not found"
        exit 1
    fi
fi

# Show build size
BUILD_SIZE=$(du -sh dist 2>/dev/null | cut -f1)
print_success "Frontend built successfully (size: $BUILD_SIZE)"

#==============================================================================
# Create Backup on Server
#==============================================================================

print_header "Step 3: Creating backup"

BACKUP_CMD="if [ -d '$FRONTEND_DIR' ]; then \
    cd /opt/opclaw && \
    BACKUP_DIR=\"/opt/opclaw/backups/frontend\" && \
    mkdir -p \$BACKUP_DIR && \
    BACKUP_FILE=\"frontend-\$(date +%Y%m%d-%H%M%S).tar.gz\" && \
    tar -czf \$BACKUP_DIR/\$BACKUP_FILE -C /var/www opclaw 2>/dev/null && \
    echo \"Backup created: \$BACKUP_FILE\"; \
    else echo 'No existing frontend to backup'; fi"

run_command "ssh $SERVER \"$BACKUP_CMD\""
print_success "Backup completed"

#==============================================================================
# Create Directory on Server
#==============================================================================

print_header "Step 4: Creating directory"

run_command "ssh $SERVER \"mkdir -p $FRONTEND_DIR\""
print_success "Directory created"

#==============================================================================
# Upload Build Artifacts
#==============================================================================

print_header "Step 5: Uploading build artifacts"

# Rsync options:
# -a: archive mode (preserve permissions, times, etc.)
# -v: verbose
# -z: compress during transfer
# --delete: delete files on destination that don't exist in source
# --delete-excluded: delete files that are excluded from transfer
# --exclude: exclude patterns

RSYNC_CMD="rsync -avz --delete \
    --exclude '.gitkeep' \
    --exclude '*.map' \
    dist/ $SERVER:$FRONTEND_DIR/"

print_info "Syncing files..."
run_command "$RSYNC_CMD"

# Count files transferred
FILE_COUNT=$(find dist -type f | wc -l | tr -d ' ')
print_success "Uploaded $FILE_COUNT files"

#==============================================================================
# Set Permissions
#==============================================================================

print_header "Step 6: Setting permissions"

run_command "ssh $SERVER \"chown -R www-data:www-data $FRONTEND_DIR\""
run_command "ssh $SERVER \"chmod -R 755 $FRONTEND_DIR\""
print_success "Permissions set"

#==============================================================================
# Configure Nginx
#==============================================================================

print_header "Step 7: Configuring Nginx"

if [ -f "$CONFIG_DIR/opclaw.conf" ]; then
    print_info "Uploading Nginx configuration..."
    run_command "scp $CONFIG_DIR/opclaw.conf $SERVER:/etc/nginx/sites-available/opclaw"

    print_info "Enabling site..."
    run_command "ssh $SERVER \"ln -sf /etc/nginx/sites-available/opclaw /etc/nginx/sites-enabled/\""

    print_info "Testing Nginx configuration..."
    if run_command "ssh $SERVER 'nginx -t 2>&1 | grep successful'"; then
        print_success "Nginx configuration valid"
    else
        print_error "Nginx configuration test failed"
        run_command "ssh $SERVER 'nginx -t'"
        exit 1
    fi

    print_info "Reloading Nginx..."
    run_command "ssh $SERVER 'systemctl reload nginx'"
    print_success "Nginx configured"
else
    print_warning "Nginx config not found: $CONFIG_DIR/opclaw.conf"
fi

#==============================================================================
# Verify Deployment
#==============================================================================

print_header "Step 8: Verifying deployment"

# Wait for Nginx to reload
sleep 2

# Check HTTP access
print_info "Testing HTTP access..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://renava.cn 2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "301" ] || [ "$HTTP_CODE" = "302" ]; then
    print_success "HTTP redirects to HTTPS (code: $HTTP_CODE)"
elif [ "$HTTP_CODE" = "200" ]; then
    print_success "HTTP accessible (code: $HTTP_CODE)"
else
    print_warning "HTTP response code: $HTTP_CODE"
fi

# Check HTTPS access (may not work yet if SSL not configured)
print_info "Testing HTTPS access..."
HTTPS_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://renava.cn 2>/dev/null || echo "000")

if [ "$HTTPS_CODE" = "200" ]; then
    print_success "HTTPS accessible (code: $HTTPS_CODE)"
elif [ "$HTTPS_CODE" = "000" ]; then
    print_warning "HTTPS not yet available (SSL pending - run setup-ssl.sh)"
else
    print_warning "HTTPS response code: $HTTPS_CODE"
fi

# Check if index.html is accessible
print_info "Testing index.html..."
if run_command "ssh $SERVER 'test -f $FRONTEND_DIR/index.html'"; then
    print_success "index.html exists on server"
else
    print_error "index.html not found on server"
    exit 1
fi

#==============================================================================
# Deployment Summary
#==============================================================================

print_header "Deployment Complete"

echo "Frontend deployed successfully!"
echo
echo "Access URLs:"
echo "  HTTP:  http://renava.cn"
echo "  HTTPS: https://renava.cn"
echo
echo "Server paths:"
echo "  Frontend: $FRONTEND_DIR"
echo "  Nginx config: /etc/nginx/sites-available/opclaw"
echo
echo "Next steps:"
echo "  1. If SSL not configured, run: ./scripts/cloud/setup-ssl.sh"
echo "  2. Verify deployment: ./scripts/cloud/verify-frontend.sh"
echo "  3. Check logs: ssh $SERVER 'tail -f /var/log/nginx/opclaw-error.log'"
echo

if [ "$DRY_RUN" = true ]; then
    print_warning "This was a DRY RUN - no actual changes were made"
fi

exit 0
