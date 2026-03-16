#!/bin/bash

#==============================================================================
# AIOpc Cloud Database Migration Deployment Script
#==============================================================================
# This script deploys and executes the database migration on the cloud server.
#
# CRITICAL: This is the #1 blocker fix - it actually EXECUTES the migration
# (unlike TASK-051 which only created migration files).
#
# Features:
# - Uploads migration files to server
# - Installs dependencies
# - Initializes PostgreSQL database
# - Executes TypeORM migration
# - Verifies table creation
#
# Usage:
#   ./deploy-database.sh [--dry-run] [--skip-init] [--skip-migrate] [--verify-only]
#
# Environment Variables:
#   SERVER           - Server address (default: root@118.25.0.190)
#   DB_NAME          - Database name (default: opclaw)
#   DB_USER          - Database user (default: opclaw)
#   DB_PASSWORD      - Database password (required)
#   BACKEND_PATH     - Backend path on server (default: /opt/opclaw/backend)
#==============================================================================

set -e  # Exit on error
set -u  # Exit on undefined variable

#------------------------------------------------------------------------------
# Configuration
#------------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKEND_SRC="$PROJECT_ROOT/platform/backend"
LOG_FILE="/tmp/opclaw-db-deployment.log"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Options
DRY_RUN=false
SKIP_INIT=false
SKIP_MIGRATE=false
VERIFY_ONLY=false

# Default values
SERVER="${SERVER:-root@118.25.0.190}"
DB_NAME="${DB_NAME:-opclaw}"
DB_USER="${DB_USER:-opclaw}"
DB_PASSWORD="${DB_PASSWORD:-opclaw123}"
BACKEND_PATH="${BACKEND_PATH:-/opt/opclaw/backend}"

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

step() {
    echo ""
    echo -e "${CYAN}===>$NC $*"
    log "STEP" "$*"
}

dry_run_msg() {
    if [ "$DRY_RUN" = true ]; then
        echo -e "${YELLOW}[DRY RUN]${NC} Would execute: $*"
        log "DRY_RUN" "$*"
    fi
}

#------------------------------------------------------------------------------
# Validation Functions
#------------------------------------------------------------------------------

check_local_files() {
    info "Checking local files..."

    if [ ! -d "$BACKEND_SRC" ]; then
        error "Backend source directory not found: $BACKEND_SRC"
        error "Run this script from the AIOpc project root"
        exit 1
    fi

    if [ ! -f "$BACKEND_SRC/package.json" ]; then
        error "package.json not found: $BACKEND_SRC/package.json"
        exit 1
    fi

    if [ ! -f "$BACKEND_SRC/typeorm.config.ts" ]; then
        error "TypeORM config not found: $BACKEND_SRC/typeorm.config.ts"
        exit 1
    fi

    if [ ! -d "$BACKEND_SRC/migrations" ]; then
        error "Migrations directory not found: $BACKEND_SRC/migrations"
        exit 1
    fi

    # Count migration files
    local migration_count=$(find "$BACKEND_SRC/migrations" -name "*.ts" | wc -l)
    info "Found $migration_count migration file(s)"

    if [ "$migration_count" -eq 0 ]; then
        error "No migration files found"
        exit 1
    fi

    success "Local files check passed"
}

check_server_connectivity() {
    info "Checking server connectivity..."

    if [ "$DRY_RUN" = true ]; then
        warning "Dry run mode - skipping server connectivity check"
        return 0
    fi

    if ! ssh -o ConnectTimeout=5 -o BatchMode=yes "$SERVER" "echo 'Connection successful'" > /dev/null 2>&1; then
        error "Cannot connect to server: $SERVER"
        error "Please ensure:"
        error "  1. SSH key is configured"
        error "  2. Server is accessible"
        error "  3. Firewall allows SSH"
        exit 1
    fi

    success "Server connectivity check passed"
}

check_server_environment() {
    info "Checking server environment..."

    if [ "$DRY_RUN" = true ]; then
        warning "Dry run mode - skipping server environment check"
        return 0
    fi

    # Check Node.js
    local node_version=$(ssh "$SERVER" "node --version 2>/dev/null" || echo "")
    if [ -z "$node_version" ]; then
        error "Node.js is not installed on server"
        error "Run init-server.sh first"
        exit 1
    fi
    info "Node.js version: $node_version"

    # Check pnpm
    local pnpm_version=$(ssh "$SERVER" "pnpm --version 2>/dev/null" || echo "")
    if [ -z "$pnpm_version" ]; then
        error "pnpm is not installed on server"
        error "Run init-server.sh first"
        exit 1
    fi
    info "pnpm version: $pnpm_version"

    # Check PostgreSQL
    local pg_version=$(ssh "$SERVER" "sudo -u postgres psql --version 2>/dev/null" || echo "")
    if [ -z "$pg_version" ]; then
        error "PostgreSQL is not installed on server"
        error "Run init-server.sh first"
        exit 1
    fi
    info "PostgreSQL version: $pg_version"

    success "Server environment check passed"
}

#------------------------------------------------------------------------------
# Deployment Functions
#------------------------------------------------------------------------------

upload_backend_files() {
    step "Uploading backend files to server"

    if [ "$DRY_RUN" = true ]; then
        dry_run_msg "scp -r $BACKEND_SRC $SERVER:$BACKEND_PATH"
        dry_run_msg "mkdir -p $BACKEND_PATH/migrations"
        dry_run_msg "mkdir -p $BACKEND_PATH/src"
        return 0
    fi

    info "Creating backend directory on server..."
    ssh "$SERVER" "mkdir -p $BACKEND_PATH/{migrations,src,dist}"

    info "Uploading package.json..."
    scp "$BACKEND_SRC/package.json" "$SERVER:$BACKEND_PATH/"

    info "Uploading tsconfig.json..."
    if [ -f "$BACKEND_SRC/tsconfig.json" ]; then
        scp "$BACKEND_SRC/tsconfig.json" "$SERVER:$BACKEND_PATH/"
    fi

    info "Uploading TypeORM configuration..."
    scp "$BACKEND_SRC/typeorm.config.ts" "$SERVER:$BACKEND_PATH/"

    info "Uploading migration files..."
    scp -r "$BACKEND_SRC/migrations/"* "$SERVER:$BACKEND_PATH/migrations/"

    info "Uploading source files..."
    if [ -d "$BACKEND_SRC/src" ]; then
        scp -r "$BACKEND_SRC/src/"* "$SERVER:$BACKEND_PATH/src/"
    fi

    success "Backend files uploaded successfully"
}

install_dependencies() {
    step "Installing dependencies on server"

    if [ "$DRY_RUN" = true ]; then
        dry_run_msg "cd $BACKEND_PATH && pnpm install"
        return 0
    fi

    info "Installing npm packages..."
    ssh "$SERVER" "cd $BACKEND_PATH && pnpm install --silent"

    success "Dependencies installed successfully"
}

initialize_database() {
    step "Initializing PostgreSQL database"

    if [ "$SKIP_INIT" = true ]; then
        warning "Skipping database initialization (--skip-init flag)"
        return 0
    fi

    if [ "$DRY_RUN" = true ]; then
        dry_run_msg "sudo -u postgres psql -c \"CREATE DATABASE $DB_NAME\""
        dry_run_msg "sudo -u postgres psql -c \"CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD'\""
        dry_run_msg "sudo -u postgres psql -c \"GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER\""
        return 0
    fi

    info "Uploading database initialization script..."
    scp "$SCRIPT_DIR/init-database.sh" "$SERVER:/tmp/init-database.sh"

    info "Running database initialization..."
    ssh "$SERVER" "
        export POSTGRES_DB='$DB_NAME'
        export POSTGRES_USER='$DB_USER'
        export POSTGRES_PASSWORD='$DB_PASSWORD'
        chmod +x /tmp/init-database.sh
        sudo /tmp/init-database.sh
    "

    success "Database initialized successfully"
}

execute_migration() {
    step "Executing TypeORM migration"

    if [ "$SKIP_MIGRATE" = true ]; then
        warning "Skipping migration execution (--skip-migrate flag)"
        return 0
    fi

    if [ "$DRY_RUN" = true ]; then
        dry_run_msg "cd $BACKEND_PATH && npm run db:migrate"
        return 0
    fi

    info "Creating .env file for migration..."
    ssh "$SERVER" "
        cat > $BACKEND_PATH/.env << EOF
DB_HOST=localhost
DB_PORT=5432
DB_NAME=$DB_NAME
DB_USERNAME=$DB_USER
DB_PASSWORD=$DB_PASSWORD
NODE_ENV=production
EOF
    "

    info "Running TypeORM migration..."
    ssh "$SERVER" "cd $BACKEND_PATH && npm run db:migrate"

    success "Migration executed successfully"
}

verify_migration() {
    step "Verifying database schema"

    if [ "$DRY_RUN" = true ]; then
        dry_run_msg "sudo -u postgres psql -d $DB_NAME -c \"\\dt\""
        return 0
    fi

    info "Checking created tables..."

    local table_count=$(ssh "$SERVER" "
        sudo -u postgres psql -d $DB_NAME -t -c "
            SELECT COUNT(*)
            FROM information_schema.tables
            WHERE table_schema = 'public';
        " | tr -d ' '
    ")

    info "Table count: $table_count"

    if [ "$table_count" -lt 8 ]; then
        error "Expected at least 8 tables, found $table_count"
        error "Migration may have failed"
        exit 1
    fi

    success "Table count verification passed ($table_count tables)"

    info "Listing all tables:"
    ssh "$SERVER" "sudo -u postgres psql -d $DB_NAME -c '\dt'"

    info "Checking critical tables..."

    local critical_tables=("users" "api_keys" "qr_codes" "instances" "documents" "document_chunks" "instance_metrics" "instance_renewals")

    for table in "${critical_tables[@]}"; do
        if ssh "$SERVER" "sudo -u postgres psql -d $DB_NAME -c \"SELECT 1 FROM $table LIMIT 1\" > /dev/null 2>&1"; then
            success "  ✓ $table exists"
        else
            error "  ✗ $table missing"
            exit 1
        fi
    done

    info "Checking foreign keys..."
    ssh "$SERVER" "sudo -u postgres psql -d $DB_NAME -c \"
        SELECT
            tc.table_name,
            kcu.column_name,
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name
        FROM
            information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
        ORDER BY tc.table_name;
    \""

    info "Checking indexes..."
    ssh "$SERVER" "sudo -u postgres psql -d $DB_NAME -c \"
        SELECT schemaname, tablename, indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
        ORDER BY tablename, indexname
        LIMIT 20;
    \""

    success "Database schema verification completed"
}

print_summary() {
    echo ""
    echo "=============================================================================="
    echo "Database Migration Deployment Complete"
    echo "=============================================================================="
    echo ""
    echo "Configuration:"
    echo "  Server: $SERVER"
    echo "  Database: $DB_NAME"
    echo "  User: $DB_USER"
    echo "  Backend Path: $BACKEND_PATH"
    echo ""
    echo "Next Steps:"
    echo "  1. Verify application can connect to database"
    echo "  2. Deploy backend application (TASK-060)"
    echo "  3. Deploy frontend application (TASK-061)"
    echo ""
    echo "Database Connection String:"
    echo "  postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME"
    echo ""
    echo "Log file: $LOG_FILE"
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
            --skip-init)
                SKIP_INIT=true
                shift
                ;;
            --skip-migrate)
                SKIP_MIGRATE=true
                shift
                ;;
            --verify-only)
                VERIFY_ONLY=true
                shift
                ;;
            --help)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --dry-run        Show what would be done without executing"
                echo "  --skip-init      Skip database initialization"
                echo "  --skip-migrate   Skip migration execution"
                echo "  --verify-only    Only verify existing database"
                echo "  --help           Show this help message"
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
    echo "AIOpc Cloud Database Migration Deployment"
    echo "=============================================================================="
    echo "Timestamp: $TIMESTAMP"
    echo "Server: $SERVER"
    echo "Database: $DB_NAME"
    echo "Dry Run: $DRY_RUN"
    echo "=============================================================================="
    echo ""

    if [ "$VERIFY_ONLY" = true ]; then
        verify_migration
        print_summary
        exit 0
    fi

    # Validation checks
    check_local_files
    check_server_connectivity
    check_server_environment

    # Deployment steps
    upload_backend_files
    install_dependencies
    initialize_database
    execute_migration
    verify_migration

    # Print summary
    print_summary

    success "Database migration deployment completed successfully!"
}

#------------------------------------------------------------------------------
# Script Entry Point
#------------------------------------------------------------------------------

main "$@"
