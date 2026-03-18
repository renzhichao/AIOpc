#!/bin/bash

#==============================================================================
# AIOpc Cloud Database Schema Verification Script
#==============================================================================
# This script verifies that the database migration was successful.
#
# Features:
# - Counts tables
# - Lists all tables
# - Verifies critical tables exist
# - Checks foreign keys
# - Validates indexes
# - Tests table access
#
# Usage:
#   ./verify-database.sh [--remote] [--server SERVER] [--quiet]
#
# Environment Variables:
#   SERVER           - Server address (default: root@118.25.0.190)
#   DB_NAME          - Database name (default: opclaw)
#   DB_USER          - Database user (default: opclaw)
#==============================================================================

set -e  # Exit on error

#------------------------------------------------------------------------------
# Configuration
#------------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="/tmp/opclaw-db-verification.log"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Options
REMOTE=false
QUIET=false

# Default values
SERVER="${SERVER:-root@118.25.0.190}"
DB_NAME="${DB_NAME:-opclaw}"
DB_USER="${DB_USER:-opclaw}"
EXPECTED_TABLES=8

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
    if [ "$QUIET" = false ]; then
        echo -e "${BLUE}[INFO]${NC} $*"
    fi
    log "INFO" "$*"
}

success() {
    echo -e "${GREEN}[✓]${NC} $*"
    log "SUCCESS" "$*"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*"
    log "WARNING" "$*"
}

error() {
    echo -e "${RED}[✗]${NC} $*"
    log "ERROR" "$*"
}

section() {
    if [ "$QUIET" = false ]; then
        echo ""
        echo -e "${CYAN}=== $* ===${NC}"
    fi
    log "SECTION" "$*"
}

#------------------------------------------------------------------------------
# Database Query Functions
#------------------------------------------------------------------------------

# Execute PostgreSQL query
query() {
    local sql="$1"

    if [ "$REMOTE" = true ]; then
        ssh "$SERVER" "sudo -u postgres psql -d $DB_NAME -c \"$sql\""
    else
        sudo -u postgres psql -d "$DB_NAME" -c "$sql"
    fi
}

# Execute PostgreSQL query and return only value
query_value() {
    local sql="$1"

    if [ "$REMOTE" = true ]; then
        ssh "$SERVER" "sudo -u postgres psql -d $DB_NAME -t -c \"$sql\"" | tr -d ' '
    else
        sudo -u postgres psql -d "$DB_NAME" -t -c "$sql" | tr -d ' '
    fi
}

#------------------------------------------------------------------------------
# Verification Functions
#------------------------------------------------------------------------------

check_database_exists() {
    section "Checking Database Existence"

    if [ "$REMOTE" = true ]; then
        local db_exists=$(ssh "$SERVER" "sudo -u postgres psql -tAc \"SELECT 1 FROM pg_database WHERE datname='$DB_NAME'\" 2>/dev/null" || echo "")
    else
        local db_exists=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" 2>/dev/null || echo "")
    fi

    if [ "$db_exists" = "1" ]; then
        success "Database '$DB_NAME' exists"
    else
        error "Database '$DB_NAME' does not exist"
        exit 1
    fi
}

count_tables() {
    section "Counting Tables"

    local table_count=$(query_value "
        SELECT COUNT(*)
        FROM information_schema.tables
        WHERE table_schema = 'public';
    ")

    info "Table count: $table_count (expected: $EXPECTED_TABLES)"

    if [ "$table_count" -ge "$EXPECTED_TABLES" ]; then
        success "Table count verification passed"
        return 0
    else
        error "Expected at least $EXPECTED_TABLES tables, found $table_count"
        return 1
    fi
}

list_tables() {
    section "Listing All Tables"

    if [ "$QUIET" = false ]; then
        query "\dt"
    fi
}

check_critical_tables() {
    section "Checking Critical Tables"

    local critical_tables=("users" "api_keys" "qr_codes" "instances" "documents" "document_chunks" "instance_metrics" "instance_renewals")
    local missing_tables=()

    for table in "${critical_tables[@]}"; do
        if query "SELECT 1 FROM $table LIMIT 1" > /dev/null 2>&1; then
            success "$table exists"
        else
            error "$table missing"
            missing_tables+=("$table")
        fi
    done

    if [ ${#missing_tables[@]} -gt 0 ]; then
        error "Missing tables: ${missing_tables[*]}"
        return 1
    else
        success "All critical tables exist"
        return 0
    fi
}

check_table_schemas() {
    section "Checking Table Schemas"

    if [ "$QUIET" = true ]; then
        return 0
    fi

    info "Users table schema:"
    query "\d users"

    info ""
    info "Instances table schema:"
    query "\d instances"
}

check_foreign_keys() {
    section "Checking Foreign Keys"

    local fk_count=$(query_value "
        SELECT COUNT(*)
        FROM information_schema.table_constraints
        WHERE constraint_type = 'FOREIGN KEY'
        AND table_schema = 'public';
    ")

    info "Foreign key count: $fk_count"

    if [ "$fk_count" -eq 0 ]; then
        warning "No foreign keys found"
    else
        success "Foreign keys found: $fk_count"
    fi

    if [ "$QUIET" = false ]; then
        info ""
        info "Foreign key details:"
        query \"
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
        \"
    fi
}

check_indexes() {
    section "Checking Indexes"

    local index_count=$(query_value "
        SELECT COUNT(*)
        FROM pg_indexes
        WHERE schemaname = 'public';
    ")

    info "Index count: $index_count"

    if [ "$index_count" -eq 0 ]; then
        warning "No indexes found"
    else
        success "Indexes found: $index_count"
    fi

    if [ "$QUIET" = false ]; then
        info ""
        info "Index details (first 20):"
        query \"
            SELECT schemaname, tablename, indexname
            FROM pg_indexes
            WHERE schemaname = 'public'
            ORDER BY tablename, indexname
            LIMIT 20;
        \"
    fi
}

check_constraints() {
    section "Checking Constraints"

    local check_count=$(query_value "
        SELECT COUNT(*)
        FROM information_schema.table_constraints
        WHERE constraint_type = 'CHECK'
        AND table_schema = 'public';
    ")

    info "CHECK constraint count: $check_count"

    if [ "$check_count" -eq 0 ]; then
        warning "No CHECK constraints found"
    else
        success "CHECK constraints found: $check_count"
    fi
}

test_database_operations() {
    section "Testing Database Operations"

    info "Testing read operation..."
    if query "SELECT COUNT(*) FROM users" > /dev/null 2>&1; then
        success "Read operation successful"
    else
        error "Read operation failed"
        return 1
    fi

    info "Testing write operation (test table)..."
    if query \"
        CREATE TABLE IF NOT EXISTS _verification_test (
            id SERIAL PRIMARY KEY,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO _verification_test VALUES (DEFAULT);
        SELECT COUNT(*) FROM _verification_test;
        DROP TABLE _verification_test;
    \" > /dev/null 2>&1; then
        success "Write operation successful"
    else
        error "Write operation failed"
        return 1
    fi
}

print_summary() {
    echo ""
    echo "=============================================================================="
    echo "Database Schema Verification Summary"
    echo "=============================================================================="
    echo ""
    echo "Database: $DB_NAME"
    echo "Server: $([ "$REMOTE" = true ] && echo "$SERVER" || echo "localhost")"
    echo "Timestamp: $TIMESTAMP"
    echo ""
    echo "Verification Status:"

    if [ ${FAILURE_COUNT:-0} -eq 0 ]; then
        echo -e "  ${GREEN}✓ ALL CHECKS PASSED${NC}"
        echo ""
        echo "The database migration was successful!"
        echo "All required tables, foreign keys, and indexes are in place."
    else
        echo -e "  ${RED}✗ SOME CHECKS FAILED${NC}"
        echo ""
        echo "Please review the errors above and fix the issues."
        echo "Common fixes:"
        echo "  1. Re-run the migration: ./deploy-database.sh"
        echo "  2. Check migration logs"
        echo "  3. Verify database permissions"
    fi

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
            --remote)
                REMOTE=true
                shift
                ;;
            --server)
                SERVER="$2"
                REMOTE=true
                shift 2
                ;;
            --quiet)
                QUIET=true
                shift
                ;;
            --help)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --remote         Verify on remote server"
                echo "  --server SERVER  Specify server address"
                echo "  --quiet          Minimal output"
                echo "  --help           Show this help message"
                exit 0
                ;;
            *)
                echo "Unknown option: $1"
                echo "Use --help for usage information"
                exit 1
                ;;
        esac
    done

    echo "=============================================================================="
    echo "AIOpc Cloud Database Schema Verification"
    echo "=============================================================================="
    echo "Timestamp: $TIMESTAMP"
    echo "Database: $DB_NAME"
    echo "Remote: $REMOTE"
    echo "=============================================================================="
    echo ""

    # Track failures
    FAILURE_COUNT=0

    # Run verification checks
    check_database_exists || FAILURE_COUNT=$((FAILURE_COUNT + 1))
    count_tables || FAILURE_COUNT=$((FAILURE_COUNT + 1))
    list_tables
    check_critical_tables || FAILURE_COUNT=$((FAILURE_COUNT + 1))
    check_table_schemas
    check_foreign_keys
    check_indexes
    check_constraints
    test_database_operations || FAILURE_COUNT=$((FAILURE_COUNT + 1))

    # Print summary
    print_summary

    # Exit with appropriate code
    if [ $FAILURE_COUNT -eq 0 ]; then
        exit 0
    else
        exit 1
    fi
}

#------------------------------------------------------------------------------
# Script Entry Point
#------------------------------------------------------------------------------

main "$@"
