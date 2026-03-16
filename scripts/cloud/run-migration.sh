#!/bin/bash

#==============================================================================
# AIOpc Cloud Migration Execution Script
#==============================================================================
# This script executes the TypeORM migration on the server.
#
# CRITICAL: This script actually RUNS the migration (not just creates files)
#
# Features:
# - Runs TypeORM migration
# - Creates .env file with database credentials
# - Builds TypeScript if needed
# - Verifies migration success
# - Provides detailed logging
#
# Usage:
#   ./run-migration.sh [--dry-run] [--revert] [--show]
#
# Environment Variables:
#   BACKEND_PATH     - Backend path (default: /opt/opclaw/backend)
#   DB_NAME          - Database name (default: opclaw)
#   DB_USER          - Database user (default: opclaw)
#   DB_PASSWORD      - Database password (required)
#==============================================================================

set -e  # Exit on error
set -u  # Exit on undefined variable

#------------------------------------------------------------------------------
# Configuration
#------------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="/var/log/opclaw-migration.log"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Options
DRY_RUN=false
REVERT=false
SHOW_ONLY=false

# Default values
BACKEND_PATH="${BACKEND_PATH:-/opt/opclaw/backend}"
DB_NAME="${DB_NAME:-opclaw}"
DB_USER="${DB_USER:-opclaw}"
DB_PASSWORD="${DB_PASSWORD:-}"

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

#------------------------------------------------------------------------------
# Validation Functions
#------------------------------------------------------------------------------

check_environment() {
    info "Checking migration environment..."

    # Check if backend directory exists
    if [ ! -d "$BACKEND_PATH" ]; then
        error "Backend directory not found: $BACKEND_PATH"
        error "Deploy backend first"
        exit 1
    fi

    # Check if package.json exists
    if [ ! -f "$BACKEND_PATH/package.json" ]; then
        error "package.json not found: $BACKEND_PATH/package.json"
        exit 1
    fi

    # Check if migrations directory exists
    if [ ! -d "$BACKEND_PATH/migrations" ]; then
        error "Migrations directory not found: $BACKEND_PATH/migrations"
        exit 1
    fi

    # Check if node_modules exists
    if [ ! -d "$BACKEND_PATH/node_modules" ]; then
        error "Dependencies not installed"
        error "Run: cd $BACKEND_PATH && pnpm install"
        exit 1
    fi

    # Check if TypeORM CLI is available
    if [ ! -f "$BACKEND_PATH/node_modules/.bin/typeorm" ]; then
        error "TypeORM CLI not found"
        error "Run: cd $BACKEND_PATH && pnpm install"
        exit 1
    fi

    # Validate password
    if [ -z "$DB_PASSWORD" ]; then
        error "DB_PASSWORD is not set"
        error "Export DB_PASSWORD or set in environment"
        exit 1
    fi

    success "Environment check passed"
}

check_database_connection() {
    info "Checking database connection..."

    if ! PGPASSWORD="$DB_PASSWORD" psql -h localhost -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" > /dev/null 2>&1; then
        error "Cannot connect to database"
        error "Check:"
        error "  1. PostgreSQL is running"
        error "  2. Database '$DB_NAME' exists"
        error "  3. User '$DB_USER' has correct password"
        error "  4. Database allows local connections"
        exit 1
    fi

    success "Database connection successful"
}

#------------------------------------------------------------------------------
# Migration Functions
#------------------------------------------------------------------------------

create_env_file() {
    info "Creating .env file for TypeORM..."

    cat > "$BACKEND_PATH/.env" << EOF
DB_HOST=localhost
DB_PORT=5432
DB_NAME=$DB_NAME
DB_USERNAME=$DB_USER
DB_PASSWORD=$DB_PASSWORD
NODE_ENV=production
EOF

    success ".env file created"
}

show_migrations() {
    info "Available migrations:"

    cd "$BACKEND_PATH"

    # Show migration files
    ls -lh migrations/*.ts 2>/dev/null || echo "No migration files found"

    echo ""
    info "Current migration status:"
    npx typeorm migration:show -d typeorm.config.ts || warning "Could not show migration status"
}

run_migration() {
    info "Running TypeORM migration..."

    cd "$BACKEND_PATH"

    if [ "$DRY_RUN" = true ]; then
        warning "Dry run mode - would execute: npx typeorm migration:run -d typeorm.config.ts"
        return 0
    fi

    # Run migration
    if npx typeorm migration:run -d typeorm.config.ts; then
        success "Migration executed successfully"
    else
        error "Migration execution failed"
        error "Check log file: $LOG_FILE"
        exit 1
    fi
}

revert_migration() {
    info "Reverting last TypeORM migration..."

    cd "$BACKEND_PATH"

    if [ "$DRY_RUN" = true ]; then
        warning "Dry run mode - would execute: npx typeorm migration:revert -d typeorm.config.ts"
        return 0
    fi

    # Revert migration
    if npx typeorm migration:revert -d typeorm.config.ts; then
        success "Migration reverted successfully"
    else
        error "Migration revert failed"
        error "Check log file: $LOG_FILE"
        exit 1
    fi
}

verify_migration() {
    info "Verifying migration results..."

    # Count tables
    local table_count=$(PGPASSWORD="$DB_PASSWORD" psql -h localhost -U "$DB_USER" -d "$DB_NAME" -t -c "
        SELECT COUNT(*)
        FROM information_schema.tables
        WHERE table_schema = 'public';
    " | tr -d ' ')

    info "Tables created: $table_count"

    if [ "$table_count" -lt 8 ]; then
        error "Expected at least 8 tables, found $table_count"
        error "Migration may have failed"
        exit 1
    fi

    success "Migration verification passed"

    # List tables
    echo ""
    info "Created tables:"
    PGPASSWORD="$DB_PASSWORD" psql -h localhost -U "$DB_USER" -d "$DB_NAME" -c "\dt"
}

print_summary() {
    echo ""
    echo "=============================================================================="
    echo "Migration Execution Complete"
    echo "=============================================================================="
    echo ""
    echo "Configuration:"
    echo "  Backend Path: $BACKEND_PATH"
    echo "  Database: $DB_NAME"
    echo "  User: $DB_USER"
    echo ""
    echo "Database Connection String:"
    echo "  postgresql://$DB_USER:****@localhost:5432/$DB_NAME"
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
            --revert)
                REVERT=true
                shift
                ;;
            --show)
                SHOW_ONLY=true
                shift
                ;;
            --help)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --dry-run    Show what would be done without executing"
                echo "  --revert     Revert the last migration"
                echo "  --show       Show available migrations and status"
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
    echo "AIOpc Cloud Migration Execution"
    echo "=============================================================================="
    echo "Timestamp: $TIMESTAMP"
    echo "Backend: $BACKEND_PATH"
    echo "Database: $DB_NAME"
    echo "Dry Run: $DRY_RUN"
    echo "=============================================================================="
    echo ""

    # Validation checks
    check_environment
    check_database_connection

    # Create .env file
    create_env_file

    # Show migrations if requested
    if [ "$SHOW_ONLY" = true ]; then
        show_migrations
        exit 0
    fi

    # Revert if requested
    if [ "$REVERT" = true ]; then
        revert_migration
        print_summary
        exit 0
    fi

    # Run migration
    run_migration
    verify_migration

    # Print summary
    print_summary

    success "Migration completed successfully!"
}

#------------------------------------------------------------------------------
# Script Entry Point
#------------------------------------------------------------------------------

main "$@"
