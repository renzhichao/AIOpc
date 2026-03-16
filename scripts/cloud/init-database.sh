#!/bin/bash

#==============================================================================
# AIOpc Cloud Database Initialization Script
#==============================================================================
# This script initializes the PostgreSQL database for the AIOpc platform.
#
# Features:
# - Creates database and user
# - Grants necessary permissions
# - Runs schema migrations
# - Seeds initial data
#
# Usage:
#   ./init-database.sh [--drop-existing] [--seed-only]
#
# Environment Variables:
#   POSTGRES_HOST     - PostgreSQL host (default: localhost)
#   POSTGRES_PORT     - PostgreSQL port (default: 5432)
#   POSTGRES_DB       - Database name (default: opclaw)
#   POSTGRES_USER     - Database user (default: opclaw)
#   POSTGRES_PASSWORD - Database password (required)
#==============================================================================

set -e  # Exit on error
set -u  # Exit on undefined variable

#------------------------------------------------------------------------------
# Configuration
#------------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CRED_FILE="/etc/opclaw/.env"
LOG_FILE="/var/log/opclaw-db-init.log"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Options
DROP_EXISTING=false
SEED_ONLY=false

# Default values (will be overridden by .env file)
POSTGRES_HOST=${POSTGRES_HOST:-localhost}
POSTGRES_PORT=${POSTGRES_PORT:-5432}
POSTGRES_DB=${POSTGRES_DB:-opclaw}
POSTGRES_USER=${POSTGRES_USER:-opclaw}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-}

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

# Load credentials from .env file
load_credentials() {
    if [ -f "$CRED_FILE" ]; then
        info "Loading credentials from $CRED_FILE"

        # Source the .env file
        set -a
        . "$CRED_FILE"
        set +a

        # Export variables
        export POSTGRES_HOST POSTGRES_PORT POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD

        info "Credentials loaded successfully"
    else
        error "Credentials file not found: $CRED_FILE"
        error "Run init-server.sh first to generate credentials"
        exit 1
    fi

    # Validate required variables
    if [ -z "$POSTGRES_PASSWORD" ]; then
        error "POSTGRES_PASSWORD is not set"
        exit 1
    fi
}

# Check if PostgreSQL is accessible
check_postgres_connection() {
    info "Checking PostgreSQL connection..."

    if ! PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d postgres -c "SELECT 1" &> /dev/null; then
        # Try with postgres user (for first-time setup)
        if ! sudo -u postgres psql -c "SELECT 1" &> /dev/null; then
            error "Cannot connect to PostgreSQL"
            exit 1
        fi
    fi

    success "PostgreSQL connection successful"
}

#------------------------------------------------------------------------------
# Database Functions
#------------------------------------------------------------------------------

create_database() {
    info "Creating database: $POSTGRES_DB"

    # Check if database exists
    local db_exists=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$POSTGRES_DB'" 2>/dev/null)

    if [ "$db_exists" = "1" ]; then
        if [ "$DROP_EXISTING" = true ]; then
            warning "Database $POSTGRES_DB already exists. Dropping..."
            sudo -u postgres psql -c "DROP DATABASE $POSTGRES_DB;"
            sudo -u postgres psql -c "DROP DATABASE ${POSTGRES_DB}_test;"
        else
            info "Database $POSTGRES_DB already exists"
            return 0
        fi
    fi

    # Create database
    sudo -u postgres psql -c "CREATE DATABASE $POSTGRES_DB;"
    sudo -u postgres psql -c "CREATE DATABASE ${POSTGRES_DB}_test;"

    success "Database created: $POSTGRES_DB"
}

create_user() {
    info "Creating database user: $POSTGRES_USER"

    # Check if user exists
    local user_exists=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$POSTGRES_USER'" 2>/dev/null)

    if [ "$user_exists" = "1" ]; then
        if [ "$DROP_EXISTING" = true ]; then
            warning "User $POSTGRES_USER already exists. Dropping..."
            sudo -u postgres psql -c "DROP USER $POSTGRES_USER;"
        else
            info "User $POSTGRES_USER already exists"
            return 0
        fi
    fi

    # Create user with password
    sudo -u postgres psql -c "CREATE USER $POSTGRES_USER WITH PASSWORD '$POSTGRES_PASSWORD';"

    # Grant privileges
    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $POSTGRES_DB TO $POSTGRES_USER;"
    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${POSTGRES_DB}_test TO $POSTGRES_USER;"

    # Grant schema privileges
    sudo -u postgres psql -d "$POSTGRES_DB" -c "GRANT ALL ON SCHEMA public TO $POSTGRES_USER;"
    sudo -u postgres psql -d "$POSTGRES_DB" -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $POSTGRES_USER;"
    sudo -u postgres psql -d "$POSTGRES_DB" -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $POSTGRES_USER;"

    success "Database user created: $POSTGRES_USER"
}

create_schemas() {
    info "Creating database schemas..."

    local schemas=("users" "instances" "metrics" "knowledge")

    for schema in "${schemas[@]}"; do
        info "Creating schema: $schema"

        PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE SCHEMA IF NOT EXISTS $schema;"
        PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "GRANT ALL ON SCHEMA $schema TO $POSTGRES_USER;"
    done

    success "Database schemas created"
}

create_extensions() {
    info "Creating database extensions..."

    # Required extensions
    local extensions=("uuid-ossp" "pgcrypto" "pg_trgm")

    for ext in "${extensions[@]}"; do
        info "Creating extension: $ext"

        PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE EXTENSION IF NOT EXISTS $ext;" || {
            warning "Failed to create extension: $ext"
        }
    done

    success "Database extensions created"
}

run_migrations() {
    info "Running database migrations..."

    local migration_dir="/opt/opclaw/backend/migrations"
    local run_migration_script="/opt/opclaw/scripts/cloud/run-migration.sh"

    # Check if migration directory exists
    if [ ! -d "$migration_dir" ]; then
        warning "Migration directory not found: $migration_dir"
        warning "Skipping migrations (will be run during application deployment)"
        return 0
    fi

    # Check if migration script exists
    if [ ! -f "$run_migration_script" ]; then
        warning "Migration script not found: $run_migration_script"
        warning "Skipping migrations (will be run during application deployment)"
        return 0
    fi

    # Check if Node.js is available
    if ! command -v node &> /dev/null; then
        warning "Node.js not available. Skipping migrations."
        return 0
    fi

    # Run migrations using the migration script
    info "Executing TypeORM migrations..."
    chmod +x "$run_migration_script"

    # Export database credentials for migration script
    export BACKEND_PATH="/opt/opclaw/backend"
    export DB_NAME="$POSTGRES_DB"
    export DB_USER="$POSTGRES_USER"
    export DB_PASSWORD="$POSTGRES_PASSWORD"

    if "$run_migration_script"; then
        success "Database migrations executed successfully"
    else
        warning "Migration execution failed or returned non-zero exit code"
        warning "Migrations may need to be run manually"
        warning "Run: $run_migration_script"
    fi
}

seed_data() {
    info "Seeding initial data..."

    local seed_dir="/opt/opclaw/backend/seeds"

    if [ ! -d "$seed_dir" ]; then
        warning "Seed directory not found: $seed_dir"
        warning "Skipping seed data (will be run during application deployment)"
        return 0
    fi

    # Seed initial data
    # This will be implemented during backend deployment
    info "Seed data will be inserted during backend deployment"

    success "Seed data check completed"
}

test_database() {
    info "Testing database connection and permissions..."

    # Test connection
    PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT current_database(), current_user;" > /dev/null

    # Test write permissions
    PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
        CREATE TABLE IF NOT EXISTS _test_table (
            id SERIAL PRIMARY KEY,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO _test_table VALUES (DEFAULT);
        DROP TABLE _test_table;
    " > /dev/null

    success "Database connection and permissions test passed"
}

print_summary() {
    echo ""
    echo "=============================================================================="
    echo "Database Initialization Complete"
    echo "=============================================================================="
    echo ""
    echo "Database Configuration:"
    echo "  Host: $POSTGRES_HOST"
    echo "  Port: $POSTGRES_PORT"
    echo "  Database: $POSTGRES_DB"
    echo "  User: $POSTGRES_USER"
    echo "  Test Database: ${POSTGRES_DB}_test"
    echo ""
    echo "Connection String:"
    echo "  postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}"
    echo ""
    echo "Next Steps:"
    echo "  1. Deploy the backend application"
    echo "  2. Run database migrations"
    echo "  3. Seed initial data"
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
            --drop-existing)
                DROP_EXISTING=true
                shift
                ;;
            --seed-only)
                SEED_ONLY=true
                shift
                ;;
            --help)
                echo "Usage: $0 [--drop-existing] [--seed-only]"
                echo ""
                echo "Options:"
                echo "  --drop-existing  Drop existing database and user before creating"
                echo "  --seed-only      Only run seed data (skip database/user creation)"
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
    echo "AIOpc Cloud Database Initialization"
    echo "=============================================================================="
    echo "Timestamp: $TIMESTAMP"
    echo "Drop Existing: $DROP_EXISTING"
    echo "Seed Only: $SEED_ONLY"
    echo "=============================================================================="
    echo ""

    # Load credentials
    load_credentials

    # Check PostgreSQL connection
    check_postgres_connection

    # Execute initialization steps
    if [ "$SEED_ONLY" = false ]; then
        create_database
        create_user
        create_schemas
        create_extensions
    fi

    run_migrations
    seed_data
    test_database

    # Print summary
    print_summary

    success "Database initialization completed successfully!"
}

#------------------------------------------------------------------------------
# Script Entry Point
#------------------------------------------------------------------------------

main "$@"
