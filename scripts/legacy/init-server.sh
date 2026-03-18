#!/bin/bash

#==============================================================================
# AIOpc Cloud Server Initialization Script
#==============================================================================
# This script prepares a fresh Ubuntu/Debian server for AIOpc platform deployment
#
# Features:
# - Idempotent (safe to run multiple times)
# - Error handling with clear messages
# - Dry-run mode support
# - Comprehensive logging
#
# Usage:
#   ./init-server.sh [--dry-run] [--verbose]
#
# Environment Variables (optional):
#   POSTGRES_PASSWORD - PostgreSQL password (default: auto-generated)
#   REDIS_PASSWORD    - Redis password (default: auto-generated)
#==============================================================================

set -e  # Exit on error
set -u  # Exit on undefined variable

#------------------------------------------------------------------------------
# Configuration
#------------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="/var/log/opclaw-init.log"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
DRY_RUN=false
VERBOSE=false
POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-}
REDIS_PASSWORD=${REDIS_PASSWORD:-}

#------------------------------------------------------------------------------
# Utility Functions
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

# Detect OS
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        OS_VERSION=$VERSION_ID
    else
        error "Cannot detect OS. /etc/os-release not found."
        exit 1
    fi

    info "Detected OS: $OS $OS_VERSION"

    if [[ ! "$OS" =~ ^(ubuntu|debian)$ ]]; then
        error "Unsupported OS: $OS. Only Ubuntu and Debian are supported."
        exit 1
    fi
}

# Check if running as root
check_root() {
    if [ "$EUID" -ne 0 ]; then
        error "This script must be run as root (use sudo)"
        exit 1
    fi
}

# Run command with dry-run support
run_cmd() {
    local cmd="$*"

    if [ "$DRY_RUN" = true ]; then
        info "[DRY-RUN] Would execute: $cmd"
    else
        if [ "$VERBOSE" = true ]; then
            info "Executing: $cmd"
        fi
        eval "$cmd"
    fi
}

# Generate random password
generate_password() {
    openssl rand -base64 32 | tr -d "=+/" | cut -c1-25
}

#------------------------------------------------------------------------------
# System Update
#------------------------------------------------------------------------------

update_system() {
    info "Updating system packages..."

    run_cmd "apt-get update"

    if [ "$DRY_RUN" = false ]; then
        DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold"
    fi

    success "System updated"
}

#------------------------------------------------------------------------------
# Docker Installation
#------------------------------------------------------------------------------

install_docker() {
    info "Checking Docker installation..."

    if command -v docker &> /dev/null; then
        local docker_version=$(docker --version | awk '{print $3}' | sed 's/,//')
        info "Docker already installed: $docker_version"
        return 0
    fi

    info "Installing Docker..."

    # Install prerequisites
    run_cmd "apt-get install -y apt-transport-https ca-certificates curl software-properties-common gnupg lsb-release"

    # Add Docker's official GPG key
    run_cmd "mkdir -p /etc/apt/keyrings"
    run_cmd "curl -fsSL https://download.docker.com/linux/$OS/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg"

    # Set up Docker repository
    run_cmd "echo \"deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$OS $(lsb_release -cs) stable\" | tee /etc/apt/sources.list.d/docker.list > /dev/null"

    # Install Docker
    run_cmd "apt-get update"
    run_cmd "apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin"

    # Enable and start Docker
    run_cmd "systemctl enable docker"
    run_cmd "systemctl start docker"

    # Add current user to docker group (if not root)
    if [ -n "${SUDO_USER:-}" ]; then
        run_cmd "usermod -aG docker $SUDO_USER"
        info "Added user $SUDO_USER to docker group"
    fi

    success "Docker installed successfully"
}

#------------------------------------------------------------------------------
# Node.js 22 Installation
#------------------------------------------------------------------------------

install_nodejs() {
    info "Checking Node.js installation..."

    if command -v node &> /dev/null; then
        local node_version=$(node --version)
        info "Node.js already installed: $node_version"

        # Check if version is 22
        if [[ "$node_version" =~ ^v22\. ]]; then
            info "Node.js 22 already installed"
            return 0
        else
            warning "Node.js version is not 22 (current: $node_version)"
        fi
    fi

    info "Installing Node.js 22..."

    # Install Node.js 22 using NodeSource repository
    run_cmd "curl -fsSL https://deb.nodesource.com/setup_22.x | bash -"
    run_cmd "apt-get install -y nodejs"

    # Verify installation
    local installed_version=$(node --version)
    info "Node.js installed: $installed_version"

    success "Node.js 22 installed successfully"
}

#------------------------------------------------------------------------------
# pnpm Installation
#----------------------------------------------------------------------------#

install_pnpm() {
    info "Checking pnpm installation..."

    if command -v pnpm &> /dev/null; then
        local pnpm_version=$(pnpm --version)
        info "pnpm already installed: $pnpm_version"
        return 0
    fi

    info "Installing pnpm..."

    # Install pnpm globally using npm
    run_cmd "npm install -g pnpm"

    # Verify installation
    local installed_version=$(pnpm --version)
    info "pnpm installed: $installed_version"

    success "pnpm installed successfully"
}

#------------------------------------------------------------------------------
# PostgreSQL 16 Installation
#------------------------------------------------------------------------------

install_postgresql() {
    info "Checking PostgreSQL installation..."

    if command -v psql &> /dev/null; then
        local pg_version=$(psql --version | awk '{print $3}' | sed 's/\.[0-9]*$//')
        info "PostgreSQL already installed: $pg_version"

        if [ "$pg_version" = "16" ]; then
            info "PostgreSQL 16 already installed"
            return 0
        fi
    fi

    info "Installing PostgreSQL 16..."

    # Install PostgreSQL
    run_cmd "apt-get install -y postgresql-16 postgresql-contrib-16"

    # Enable and start PostgreSQL
    run_cmd "systemctl enable postgresql"
    run_cmd "systemctl start postgresql"

    success "PostgreSQL 16 installed successfully"
}

#------------------------------------------------------------------------------
# Redis Installation
#------------------------------------------------------------------------------

install_redis() {
    info "Checking Redis installation..."

    if command -v redis-server &> /dev/null; then
        local redis_version=$(redis-server --version | awk '{print $3}')
        info "Redis already installed: $redis_version"
        return 0
    fi

    info "Installing Redis..."

    # Install Redis
    run_cmd "apt-get install -y redis-server"

    # Configure Redis
    local redis_conf="/etc/redis/redis.conf"

    # Generate password if not set
    if [ -z "$REDIS_PASSWORD" ]; then
        REDIS_PASSWORD=$(generate_password)
        warning "Generated Redis password (save it securely!): $REDIS_PASSWORD"
    fi

    # Configure Redis with password
    if [ "$DRY_RUN" = false ]; then
        sed -i "s/# requirepass foobared/requirepass $REDIS_PASSWORD/" "$redis_conf"
        sed -i 's/supervised no/supervised systemd/' "$redis_conf"
    fi

    # Enable and start Redis
    run_cmd "systemctl enable redis-server"
    run_cmd "systemctl start redis-server"

    success "Redis installed and configured successfully"
}

#------------------------------------------------------------------------------
# Nginx Installation
#------------------------------------------------------------------------------

install_nginx() {
    info "Checking Nginx installation..."

    if command -v nginx &> /dev/null; then
        local nginx_version=$(nginx -v 2>&1 | awk -F'/' '{print $2}')
        info "Nginx already installed: $nginx_version"
        return 0
    fi

    info "Installing Nginx..."

    # Install Nginx
    run_cmd "apt-get install -y nginx"

    # Enable and start Nginx
    run_cmd "systemctl enable nginx"
    run_cmd "systemctl start nginx"

    success "Nginx installed successfully"
}

#------------------------------------------------------------------------------
# Firewall Configuration
#------------------------------------------------------------------------------

configure_firewall() {
    info "Configuring firewall..."

    # Check if UFW is installed
    if ! command -v ufw &> /dev/null; then
        info "Installing UFW..."
        run_cmd "apt-get install -y ufw"
    fi

    # Configure UFW rules
    info "Setting up firewall rules..."

    # Allow SSH
    run_cmd "ufw allow 22/tcp comment 'SSH'"

    # Allow HTTP/HTTPS
    run_cmd "ufw allow 80/tcp comment 'HTTP'"
    run_cmd "ufw allow 443/tcp comment 'HTTPS'"

    # Allow backend API (optional, for direct access)
    run_cmd "ufw allow 3000/tcp comment 'Backend API'"

    # Enable UFW
    if [ "$DRY_RUN" = false ]; then
        echo "y" | ufw enable
    fi

    # Show status
    run_cmd "ufw status verbose"

    success "Firewall configured successfully"
}

#------------------------------------------------------------------------------
# Create Directory Structure
#------------------------------------------------------------------------------

create_directories() {
    info "Creating directory structure..."

    # Main directories
    run_cmd "mkdir -p /opt/opclaw/backend"
    run_cmd "mkdir -p /opt/opclaw/frontend"
    run_cmd "mkdir -p /opt/opclaw/logs"
    run_cmd "mkdir -p /opt/opclaw/backups"
    run_cmd "mkdir -p /opt/opclaw/scripts"
    run_cmd "mkdir -p /opt/opclaw/ssl"

    # Config directory
    run_cmd "mkdir -p /etc/opclaw"

    # Set permissions
    run_cmd "chmod -R 755 /opt/opclaw"

    # Create log file if it doesn't exist
    run_cmd "touch $LOG_FILE"
    run_cmd "chmod 644 $LOG_FILE"

    success "Directory structure created"
}

#------------------------------------------------------------------------------
# Save Credentials
#------------------------------------------------------------------------------

save_credentials() {
    info "Saving credentials..."

    local cred_file="/etc/opclaw/.env"

    if [ "$DRY_RUN" = false ]; then
        # Generate passwords if not set
        if [ -z "$POSTGRES_PASSWORD" ]; then
            POSTGRES_PASSWORD=$(generate_password)
            warning "Generated PostgreSQL password: $POSTGRES_PASSWORD"
        fi

        if [ -z "$REDIS_PASSWORD" ]; then
            REDIS_PASSWORD=$(generate_password)
            warning "Generated Redis password: $REDIS_PASSWORD"
        fi

        # Save to file
        cat > "$cred_file" << EOF
# AIOpc Environment Variables
# Generated on: $(date)

# PostgreSQL
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=opclaw
POSTGRES_USER=opclaw
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=${REDIS_PASSWORD}

# Application
NODE_ENV=production
PORT=3000

# Domain
DOMAIN=renava.cn

# Secrets (generate your own)
JWT_SECRET=$(generate_password)
SESSION_SECRET=$(generate_password)
EOF

        # Set permissions
        chmod 600 "$cred_file"

        info "Credentials saved to $cred_file"
        warning "IMPORTANT: Save these passwords securely!"
    fi

    success "Credentials saved"
}

#------------------------------------------------------------------------------
# Print Summary
#------------------------------------------------------------------------------

print_summary() {
    echo ""
    echo "=============================================================================="
    echo "Server Initialization Complete"
    echo "=============================================================================="
    echo ""
    echo "Installed Components:"
    echo "  - Docker: $(docker --version 2>/dev/null || echo 'Not installed')"
    echo "  - Node.js: $(node --version 2>/dev/null || echo 'Not installed')"
    echo "  - pnpm: $(pnpm --version 2>/dev/null || echo 'Not installed')"
    echo "  - PostgreSQL: $(psql --version 2>/dev/null | awk '{print $3}' || echo 'Not installed')"
    echo "  - Redis: $(redis-server --version 2>/dev/null | awk '{print $3}' || echo 'Not installed')"
    echo "  - Nginx: $(nginx -v 2>&1 | awk -F'/' '{print $2}' || echo 'Not installed')"
    echo ""
    echo "Credentials saved to: /etc/opclaw/.env"
    echo "Log file: $LOG_FILE"
    echo ""
    echo "Next Steps:"
    echo "  1. Save the credentials from /etc/opclaw/.env"
    echo "  2. Run: ./scripts/cloud/check-environment.sh"
    echo "  3. Run: ./scripts/cloud/init-database.sh"
    echo "  4. Deploy the application"
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
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            --help)
                echo "Usage: $0 [--dry-run] [--verbose]"
                echo ""
                echo "Options:"
                echo "  --dry-run    Show what would be done without making changes"
                echo "  --verbose    Show detailed output"
                echo "  --help       Show this help message"
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
    echo "AIOpc Cloud Server Initialization"
    echo "=============================================================================="
    echo "Timestamp: $TIMESTAMP"
    echo "Dry-run: $DRY_RUN"
    echo "Verbose: $VERBOSE"
    echo "=============================================================================="
    echo ""

    # Pre-flight checks
    check_root
    detect_os

    # Execute installation steps
    update_system
    install_docker
    install_nodejs
    install_pnpm
    install_postgresql
    install_redis
    install_nginx
    configure_firewall
    create_directories
    save_credentials

    # Print summary
    print_summary

    success "Server initialization completed successfully!"
}

#------------------------------------------------------------------------------
# Script Entry Point
#------------------------------------------------------------------------------

main "$@"
