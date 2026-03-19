#!/bin/bash
#==============================================================================
# Deployment State Database Setup Script
# (部署状态数据库初始化脚本)
#
# This script creates and initializes the deployment_state database with
# all required tables, indexes, views, and functions.
#
# Usage:
#   ./setup-state-db.sh [options]
#
# Options:
#   -h, --help              Show this help message
#   -y, --yes               Skip confirmation prompts
#   -t, --test              Test database connection only
#   -s, --show-config       Show current configuration and exit
#   --db-host HOST          Database host (default: localhost)
#   --db-port PORT          Database port (default: 5432)
#   --db-name NAME          Database name (default: deployment_state)
#   --db-user USER          Database user (default: postgres)
#   --db-pass PASS          Database password
#   --create-user           Create dedicated database user
#   --drop-existing         Drop existing database first (CAUTION!)
#
# Environment Variables:
#   STATE_DB_HOST           Database host
#   STATE_DB_PORT           Database port
#   STATE_DB_NAME           Database name
#   STATE_DB_USER           Database user
#   STATE_DB_PASSWORD       Database password
#   POSTGRES_HOST           Alias for STATE_DB_HOST
#   POSTGRES_PORT           Alias for STATE_DB_PORT
#   POSTGRES_USER           Alias for STATE_DB_USER
#   POSTGRES_PASSWORD       Alias for STATE_DB_PASSWORD
#
# Author: AIOpc DevOps Team
# Created: 2026-03-19
# Version: 1.0.0
#==============================================================================

set -euo pipefail

#------------------------------------------------------------------------------
# Configuration
#------------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
SCHEMA_FILE="${SCRIPT_DIR}/schema.sql"

# Default configuration
DB_HOST="${STATE_DB_HOST:-${POSTGRES_HOST:-localhost}}"
DB_PORT="${STATE_DB_PORT:-${POSTGRES_PORT:-5432}}"
DB_NAME="${STATE_DB_NAME:-deployment_state}"
DB_USER="${STATE_DB_USER:-${POSTGRES_USER:-postgres}}"
DB_PASSWORD="${STATE_DB_PASSWORD:-${POSTGRES_PASSWORD:-}}"

# State database user (for least privilege access)
STATE_USER="opclaw_state"
STATE_PASSWORD="$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)"

# Flags
SKIP_CONFIRMATION=false
TEST_CONNECTION_ONLY=false
SHOW_CONFIG_ONLY=false
CREATE_DEDICATED_USER=false
DROP_EXISTING=false

#------------------------------------------------------------------------------
# Functions
#------------------------------------------------------------------------------

print_header() {
    echo "=============================================================================="
    echo "$1"
    echo "=============================================================================="
}

print_section() {
    echo ""
    echo ">>> $1"
}

print_success() {
    echo "✓ $1"
}

print_error() {
    echo "✗ $1" >&2
}

print_warning() {
    echo "⚠ $1"
}

show_help() {
    cat << EOF
Deployment State Database Setup Script

Usage:
    $0 [options]

Options:
    -h, --help              Show this help message
    -y, --yes               Skip confirmation prompts
    -t, --test              Test database connection only
    -s, --show-config       Show current configuration and exit
    --db-host HOST          Database host (default: localhost)
    --db-port PORT          Database port (default: 5432)
    --db-name NAME          Database name (default: deployment_state)
    --db-user USER          Database user (default: postgres)
    --db-pass PASS          Database password
    --create-user           Create dedicated database user
    --drop-existing         Drop existing database first (CAUTION!)

Environment Variables:
    STATE_DB_HOST           Database host
    STATE_DB_PORT           Database port
    STATE_DB_NAME           Database name
    STATE_DB_USER           Database user
    STATE_DB_PASSWORD       Database password

Examples:
    # Test connection to production database
    $0 --test --db-host 118.25.0.190 --db-user postgres

    # Setup with default settings (localhost)
    $0

    # Setup with custom user creation
    $0 --create-user --db-host production.db.example.com

    # Drop and recreate existing database
    $0 --drop-existing --yes

EOF
}

show_config() {
    print_header "Current Configuration"
    cat << EOF

Database Configuration:
  Host:           ${DB_HOST}
  Port:           ${DB_PORT}
  Database Name:  ${DB_NAME}
  Admin User:     ${DB_USER}

Dedicated User Configuration:
  Create User:    ${CREATE_DEDICATED_USER}
  User Name:      ${STATE_USER}
  Password:       ${STATE_PASSWORD:0:8}...

Options:
  Drop Existing:  ${DROP_EXISTING}
  Test Only:      ${TEST_CONNECTION_ONLY}
  Skip Confirm:   ${SKIP_CONFIRMATION}

EOF
}

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Check if psql is installed
check_dependencies() {
    print_section "Checking dependencies..."

    if ! command -v psql &> /dev/null; then
        print_error "psql is not installed. Please install PostgreSQL client tools."
        log "Install on Ubuntu/Debian: sudo apt-get install postgresql-client"
        log "Install on macOS: brew install postgresql"
        exit 1
    fi

    print_success "psql is installed"
}

# Test database connection
test_connection() {
    print_section "Testing database connection..."

    local test_result
    test_result=$(PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d postgres -tAc "SELECT version();" 2>&1)

    if [ $? -eq 0 ]; then
        print_success "Database connection successful"
        log "Database version: ${test_result:0:50}..."
        return 0
    else
        print_error "Database connection failed"
        log "Error: ${test_result}"
        return 1
    fi
}

# Check if database exists
database_exists() {
    local db_check
    db_check=$(PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}';" 2>&1)

    if [ "${db_check}" = "1" ]; then
        return 0
    else
        return 1
    fi
}

# Create dedicated database user
create_dedicated_user() {
    print_section "Creating dedicated database user..."

    local user_exists
    user_exists=$(PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d postgres -tAc "SELECT 1 FROM pg_user WHERE usename='${STATE_USER}';" 2>&1)

    if [ "${user_exists}" = "1" ]; then
        print_warning "User ${STATE_USER} already exists"
        read -p "Update password for existing user? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d postgres -c "ALTER USER ${STATE_USER} WITH PASSWORD '${STATE_PASSWORD}';"
            print_success "Password updated for user ${STATE_USER}"
        fi
    else
        PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d postgres << EOF
CREATE USER ${STATE_USER} WITH PASSWORD '${STATE_PASSWORD}';
EOF

        if [ $? -eq 0 ]; then
            print_success "Created database user: ${STATE_USER}"
        else
            print_error "Failed to create database user"
            return 1
        fi
    fi

    # Save credentials to .env file
    local env_file="${PROJECT_ROOT}/.env.state_db"
    cat > "${env_file}" << EOF
# Deployment State Database Configuration
# Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")

STATE_DB_HOST=${DB_HOST}
STATE_DB_PORT=${DB_PORT}
STATE_DB_NAME=${DB_NAME}
STATE_DB_USER=${STATE_USER}
STATE_DB_PASSWORD=${STATE_PASSWORD}
EOF

    print_success "Configuration saved to: ${env_file}"
    log "IMPORTANT: Store ${env_file} securely and never commit to version control"

    return 0
}

# Create database
create_database() {
    print_section "Creating database..."

    if database_exists; then
        if [ "${DROP_EXISTING}" = true ]; then
            print_warning "Database ${DB_NAME} already exists. Dropping..."
            PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d postgres -c "DROP DATABASE ${DB_NAME};"
            print_success "Existing database dropped"
        else
            print_warning "Database ${DB_NAME} already exists. Skipping creation."
            return 0
        fi
    fi

    PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d postgres << EOF
CREATE DATABASE ${DB_NAME}
    ENCODING 'UTF8'
    LC_COLLATE = 'en_US.UTF-8'
    LC_CTYPE = 'en_US.UTF-8'
    TEMPLATE template0;
EOF

    if [ $? -eq 0 ]; then
        print_success "Database created: ${DB_NAME}"
    else
        print_error "Failed to create database"
        return 1
    fi

    # Grant privileges to dedicated user
    if [ "${CREATE_DEDICATED_USER}" = true ]; then
        PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d postgres << EOF
GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${STATE_USER};
ALTER DATABASE ${DB_NAME} OWNER TO ${STATE_USER};
EOF
        print_success "Privileges granted to ${STATE_USER}"
    fi

    return 0
}

# Initialize schema
initialize_schema() {
    print_section "Initializing database schema..."

    if [ ! -f "${SCHEMA_FILE}" ]; then
        print_error "Schema file not found: ${SCHEMA_FILE}"
        return 1
    fi

    # Determine which user to use for schema creation
    local schema_user="${DB_USER}"
    local schema_password="${DB_PASSWORD}"

    if [ "${CREATE_DEDICATED_USER}" = true ]; then
        schema_user="${STATE_USER}"
        schema_password="${STATE_PASSWORD}"
    fi

    PGPASSWORD="${schema_password}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${schema_user}" -d "${DB_NAME}" -f "${SCHEMA_FILE}"

    if [ $? -eq 0 ]; then
        print_success "Database schema initialized"
        return 0
    else
        print_error "Failed to initialize schema"
        return 1
    fi
}

# Verify installation
verify_installation() {
    print_section "Verifying installation..."

    local schema_user="${DB_USER}"
    local schema_password="${DB_PASSWORD}"

    if [ "${CREATE_DEDICATED_USER}" = true ]; then
        schema_user="${STATE_USER}"
        schema_password="${STATE_PASSWORD}"
    fi

    # Check if tables exist
    local tables_check
    tables_check=$(PGPASSWORD="${schema_password}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${schema_user}" -d "${DB_NAME}" -tAc "
        SELECT COUNT(*)
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name IN (
            'tenants', 'deployments', 'deployment_config_snapshots',
            'health_checks', 'security_audit_log', 'config_drift_reports',
            'incidents', 'ssh_key_audit'
        );
    " 2>&1)

    if [ "${tables_check}" = "8" ]; then
        print_success "All 8 tables created"
    else
        print_error "Expected 8 tables, found ${tables_check}"
        return 1
    fi

    # Check if views exist
    local views_check
    views_check=$(PGPASSWORD="${schema_password}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${schema_user}" -d "${DB_NAME}" -tAc "
        SELECT COUNT(*)
        FROM information_schema.views
        WHERE table_schema = 'public'
        AND table_name IN ('v_deployment_summary', 'v_tenant_health', 'v_recent_security_events');
    " 2>&1)

    if [ "${views_check}" = "3" ]; then
        print_success "All 3 views created"
    else
        print_error "Expected 3 views, found ${views_check}"
        return 1
    fi

    # Check if functions exist
    local functions_check
    functions_check=$(PGPASSWORD="${schema_password}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${schema_user}" -d "${DB_NAME}" -tAc "
        SELECT COUNT(*)
        FROM information_schema.routines
        WHERE routine_schema = 'public'
        AND routine_name IN ('health_check', 'log_ssh_key_usage', 'record_tenant', 'get_deployment_stats');
    " 2>&1)

    if [ "${functions_check}" = "4" ]; then
        print_success "All 4 functions created"
    else
        print_error "Expected 4 functions, found ${functions_check}"
        return 1
    fi

    # Test health_check function
    local health_test
    health_test=$(PGPASSWORD="${schema_password}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${schema_user}" -d "${DB_NAME}" -tAc "SELECT COUNT(*) FROM health_check() WHERE status = 'pass';" 2>&1)

    if [ "${health_test}" = "5" ]; then
        print_success "health_check() function working correctly"
    else
        print_warning "health_check() function returned ${health_test} passing checks (expected 5)"
    fi

    return 0
}

#------------------------------------------------------------------------------
# Parse Arguments
#------------------------------------------------------------------------------

parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -y|--yes)
                SKIP_CONFIRMATION=true
                shift
                ;;
            -t|--test)
                TEST_CONNECTION_ONLY=true
                shift
                ;;
            -s|--show-config)
                SHOW_CONFIG_ONLY=true
                shift
                ;;
            --db-host)
                DB_HOST="$2"
                shift 2
                ;;
            --db-port)
                DB_PORT="$2"
                shift 2
                ;;
            --db-name)
                DB_NAME="$2"
                shift 2
                ;;
            --db-user)
                DB_USER="$2"
                shift 2
                ;;
            --db-pass)
                DB_PASSWORD="$2"
                shift 2
                ;;
            --create-user)
                CREATE_DEDICATED_USER=true
                shift
                ;;
            --drop-existing)
                DROP_EXISTING=true
                shift
                ;;
            *)
                print_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

#------------------------------------------------------------------------------
# Main Execution
#------------------------------------------------------------------------------

main() {
    parse_arguments "$@"

    print_header "Deployment State Database Setup"

    show_config

    if [ "${SHOW_CONFIG_ONLY}" = true ]; then
        exit 0
    fi

    # Check dependencies
    check_dependencies

    # Test connection
    if ! test_connection; then
        print_error "Cannot connect to database. Please check your configuration."
        exit 1
    fi

    if [ "${TEST_CONNECTION_ONLY}" = true ]; then
        print_success "Connection test passed. Exiting."
        exit 0
    fi

    # Confirmation prompt
    if [ "${SKIP_CONFIRMATION}" = false ]; then
        echo ""
        read -p "Continue with database setup? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log "Setup cancelled by user"
            exit 0
        fi
    fi

    # Create dedicated user if requested
    if [ "${CREATE_DEDICATED_USER}" = true ]; then
        if ! create_dedicated_user; then
            print_error "Failed to create dedicated user"
            exit 1
        fi
    fi

    # Create database
    if ! create_database; then
        print_error "Failed to create database"
        exit 1
    fi

    # Initialize schema
    if ! initialize_schema; then
        print_error "Failed to initialize schema"
        exit 1
    fi

    # Verify installation
    if ! verify_installation; then
        print_error "Verification failed"
        exit 1
    fi

    # Success
    print_header "Setup Complete!"
    cat << EOF

✓ Deployment state database has been successfully initialized!

Database:
  Host: ${DB_HOST}
  Port: ${DB_PORT}
  Name: ${DB_NAME}

EOF

    if [ "${CREATE_DEDICATED_USER}" = true ]; then
        cat << EOF
Dedicated User:
  Username: ${STATE_USER}
  Password: ${STATE_PASSWORD}
  Config: ${PROJECT_ROOT}/.env.state_db

IMPORTANT:
  1. Save the .env.state_db file securely
  2. Never commit .env.state_db to version control
  3. Distribute the credentials to deployment scripts

EOF
    fi

    cat << EOF
Next Steps:
  1. Test the database connection:
     ./test-db-connection.sh

  2. Verify all components:
     psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} -c "SELECT * FROM health_check();"

  3. Start using the state database in deployment scripts

For more information, see:
  ${PROJECT_ROOT}/docs/operations/state-database-setup.md

EOF

    log "State database setup completed successfully"
}

# Run main function
main "$@"
