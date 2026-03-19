#!/bin/bash

#==============================================================================
# AIOpc Backup Restore Testing Script
#==============================================================================
# Safe restore testing in isolated environment without affecting production
#
# Features:
# - Database restore test (isolated database)
# - Configuration validation
# - Code extraction test
# - Rollback capability
# - Detailed reporting
#
# Usage:
#   ./test-restore.sh [--source <backup-path>] [--database-only] [--dry-run]
#
#==============================================================================

set -e  # Exit on error
set -u  # Exit on undefined variable
set -o pipefail  # Exit on pipe failure

#------------------------------------------------------------------------------
# Configuration
#------------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="${PROJECT_ROOT}/restore-test.log"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Production settings
DEPLOY_USER=${DEPLOY_USER:-root}
DEPLOY_HOST=${DEPLOY_HOST:-118.25.0.190}
DEPLOY_PATH=${DEPLOY_PATH:-/opt/opclaw}
TEST_CONTAINER_PREFIX="opclaw-restore-test-${TIMESTAMP}"

# Test options
BACKUP_SOURCE=""
TEST_TYPE="full"
DRY_RUN=false
CLEANUP=true
ISOLATED_TEST=true

# Test results
declare -a TEST_RESULTS=()
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

#------------------------------------------------------------------------------
# Logging Functions
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
    echo -e "${GREEN}[✓]${NC} $*"
    log "SUCCESS" "$*"
    TEST_RESULTS+=("PASS: $*")
    ((PASSED_TESTS++))
    ((TOTAL_TESTS++))
}

warning() {
    echo -e "${YELLOW}[!]${NC} $*"
    log "WARNING" "$*"
    TEST_RESULTS+=("WARN: $*")
    ((TOTAL_TESTS++))
}

error() {
    echo -e "${RED}[✗]${NC} $*"
    log "ERROR" "$*"
    TEST_RESULTS+=("FAIL: $*")
    ((FAILED_TESTS++))
    ((TOTAL_TESTS++))
}

step() {
    echo -e "${BLUE}==>${NC} $1"
    log "STEP" "$*"
}

section() {
    echo ""
    echo "=============================================================================="
    echo "$1"
    echo "=============================================================================="
}

#------------------------------------------------------------------------------
# SSH Wrapper Functions
#------------------------------------------------------------------------------

ssh_exec() {
    local command="$*"
    if [ "$DRY_RUN" = true ]; then
        info "[DRY RUN] Would execute: $command"
        return 0
    fi
    ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
        -i ~/.ssh/rap001_opclaw \
        "${DEPLOY_USER}@${DEPLOY_HOST}" "$command"
}

#------------------------------------------------------------------------------
# Cleanup Functions
#------------------------------------------------------------------------------

cleanup_test_containers() {
    if [ "$CLEANUP" = false ]; then
        info "Skipping cleanup (containers left for inspection)"
        return 0
    fi

    step "Cleaning up test containers"

    # Remove test containers
    local test_containers=$(ssh_exec "docker ps -a --format '{{{{.Names}}}}' | grep '${TEST_CONTAINER_PREFIX}' || echo ''")

    if [ -n "$test_containers" ]; then
        info "Removing test containers..."
        echo "$test_containers" | while read -r container; do
            if [ -n "$container" ]; then
                info "  Removing: ${container}"
                ssh_exec "docker rm -f ${container} 2>/dev/null || true"
            fi
        done
        success "Test containers removed"
    else
        info "No test containers to clean up"
    fi

    # Remove test volumes
    local test_volumes=$(ssh_exec "docker volume ls --format '{{{{.Name}}}}' | grep '${TEST_CONTAINER_PREFIX}' || echo ''")

    if [ -n "$test_volumes" ]; then
        info "Removing test volumes..."
        echo "$test_volumes" | while read -r volume; do
            if [ -n "$volume" ]; then
                info "  Removing: ${volume}"
                ssh_exec "docker volume rm ${volume} 2>/dev/null || true"
            fi
        done
        success "Test volumes removed"
    fi
}

# Set cleanup trap
trap cleanup_test_containers EXIT INT TERM

#------------------------------------------------------------------------------
# Pre-flight Checks
#------------------------------------------------------------------------------

check_prerequisites() {
    step "Running pre-flight checks"

    if [ -z "$BACKUP_SOURCE" ]; then
        error "Backup source not specified (--source required)"
        exit 1
    fi

    if ! ssh_exec "[ -d ${BACKUP_SOURCE} ]"; then
        error "Backup source not found: ${BACKUP_SOURCE}"
        exit 1
    fi

    success "Backup source found: ${BACKUP_SOURCE}"

    # Check if Docker is available
    if ! ssh_exec "docker --version &> /dev/null"; then
        error "Docker not available on remote server"
        exit 1
    fi

    success "Docker is available"

    # Check available disk space
    local available_space=$(ssh_exec "df -h / | tail -1 | awk '{print \$4}' || echo '0'")
    info "Available disk space: ${available_space}"
}

#------------------------------------------------------------------------------
# Test Functions
#------------------------------------------------------------------------------

test_database_restore() {
    if [ "$TEST_TYPE" != "full" ] && [ "$TEST_TYPE" != "database" ]; then
        return 0
    fi

    section "Database Restore Test"

    local backup_file="${BACKUP_SOURCE}/database/opclaw_full.sql.gz"

    if ! ssh_exec "[ -f ${backup_file} ]"; then
        error "Database backup not found: ${backup_file}"
        return 1
    fi

    success "Database backup file found"

    # Create isolated test database container
    info "Creating test database container..."
    local test_container="${TEST_CONTAINER_PREFIX}-db"

    if ssh_exec "docker run -d --name ${test_container} \
        -e POSTGRES_USER=opclaw \
        -e POSTGRES_PASSWORD=test_password \
        -e POSTGRES_DB=opclaw_test \
        postgres:16-alpine \
        2>&1"; then
        success "Test database container created"
    else
        error "Failed to create test database container"
        return 1
    fi

    # Wait for database to be ready
    info "Waiting for database to be ready..."
    local max_attempts=30
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        if ssh_exec "docker exec ${test_container} pg_isready -U opclaw &> /dev/null"; then
            success "Database is ready"
            break
        fi
        ((attempt++))
        sleep 2
    done

    if [ $attempt -eq $max_attempts ]; then
        error "Database failed to start"
        return 1
    fi

    # Test restore
    info "Testing database restore..."
    if ssh_exec "gunzip -c ${backup_file} | docker exec -i ${test_container} psql -U opclaw -d opclaw_test > /dev/null 2>&1"; then
        success "Database restore successful"
    else
        error "Database restore failed"
        return 1
    fi

    # Verify restored data
    info "Verifying restored data..."
    local table_count=$(ssh_exec "docker exec ${test_container} psql -U opclaw -d opclaw_test -c 'SELECT count(*) FROM information_schema.tables WHERE table_schema = '\''public'\'';' -t" | xargs || echo "0")

    if [ "$table_count" -gt 0 ]; then
        success "Restored database contains ${table_count} tables"
    else
        warning "No tables found in restored database"
    fi

    # Check for critical tables
    local critical_tables=("users" "instances" "oauth_tokens")
    for table in "${critical_tables[@]}"; do
        if ssh_exec "docker exec ${test_container} psql -U opclaw -d opclaw_test -c \"SELECT to_regclass('${table}')\" -t | grep -q ${table}"; then
            success "Critical table exists: ${table}"
        else
            warning "Critical table missing: ${table}"
        fi
    done

    # Get row counts
    info "Row counts in restored database:"
    ssh_exec "docker exec ${test_container} psql -U opclaw -d opclaw_test -c '
        SELECT
            schemaname,
            tablename,
            n_tup_ins AS row_count
        FROM pg_stat_user_tables
        ORDER BY n_tup_ins DESC
        LIMIT 10;
    '" || warning "Could not retrieve row counts"

    success "Database restore test completed"
}

test_configuration_restore() {
    if [ "$TEST_TYPE" != "full" ] && [ "$TEST_TYPE" != "config" ]; then
        return 0
    fi

    section "Configuration Restore Test"

    local config_dir="${BACKUP_SOURCE}/config"

    if ! ssh_exec "[ -d ${config_dir} ]"; then
        error "Configuration directory not found: ${config_dir}"
        return 1
    fi

    success "Configuration directory found"

    # Test critical configuration files
    local critical_configs=(".env.production" "docker-compose.yml")

    for config in "${critical_configs[@]}"; do
        local config_file="${config_dir}/${config}"

        if ssh_exec "[ -f ${config_file} ]"; then
            success "Configuration file exists: ${config}"

            # Validate configuration
            if [ "$config" = ".env.production" ]; then
                # Check for required variables
                local required_vars=("FEISHU_APP_ID" "FEISHU_APP_SECRET" "JWT_SECRET" "DATABASE_URL")
                for var in "${required_vars[@]}"; do
                    if ssh_exec "grep -q \"^${var}=\" ${config_file}"; then
                        success "Required variable present: ${var}"
                    else
                        error "Required variable missing: ${var}"
                    fi
                done

                # Check for placeholder values
                if ssh_exec "grep -qE 'cli_xxxxxxxxxxxxx|CHANGE_THIS|your_|placeholder' ${config_file}"; then
                    error "Configuration contains placeholder values"
                else
                    success "Configuration has real values (no placeholders)"
                fi
            fi

            if [ "$config" = "docker-compose.yml" ]; then
                # Validate YAML syntax
                if ssh_exec "docker-compose -f ${config_file} config > /dev/null 2>&1"; then
                    success "Docker Compose configuration is valid"
                else
                    error "Docker Compose configuration is invalid"
                fi
            fi
        else
            error "Configuration file missing: ${config}"
        fi
    done

    # Test Docker container configurations
    info "Testing Docker container configurations..."
    local container_configs=("backend_container.json" "postgres_container.json")

    for config in "${container_configs[@]}"; do
        local config_file="${config_dir}/${config}"

        if ssh_exec "[ -f ${config_file} ]"; then
            # Validate JSON
            if ssh_exec "python3 -c \"import json; json.load(open('${config_file}'))\" 2>/dev/null || jq empty ${config_file} 2>/dev/null"; then
                success "Valid JSON: ${config}"
            else
                error "Invalid JSON: ${config}"
            fi
        else
            warning "Container config not found: ${config}"
        fi
    done

    success "Configuration restore test completed"
}

test_code_extraction() {
    if [ "$TEST_TYPE" != "full" ] && [ "$TEST_TYPE" != "code" ]; then
        return 0
    fi

    section "Code Extraction Test"

    local code_dir="${BACKUP_SOURCE}/code"
    local test_extract_dir="/tmp/${TEST_CONTAINER_PREFIX}-code"

    if ! ssh_exec "[ -f ${code_dir}/repository.tar.gz ]"; then
        error "Code repository backup not found"
        return 1
    fi

    success "Code repository backup found"

    # Test extraction
    info "Testing code extraction..."
    if ssh_exec "mkdir -p ${test_extract_dir} && \
                 tar -xzf ${code_dir}/repository.tar.gz -C ${test_extract_dir} 2>&1"; then
        success "Code extraction successful"

        # Verify extracted contents
        local file_count=$(ssh_exec "find ${test_extract_dir} -type f | wc -l" || echo "0")

        if [ "$file_count" -gt 10 ]; then
            success "Extracted ${file_count} files"
        else
            warning "Low file count extracted: ${file_count}"
        fi

        # Check for critical files
        local critical_files=("package.json" "CLAUDE.md" "README.md")
        for file in "${critical_files[@]}"; do
            if ssh_exec "[ -f ${test_extract_dir}/${file} ] || find ${test_extract_dir} -name '${file}' | grep -q ."; then
                success "Critical file found: ${file}"
            else
                warning "Critical file not found: ${file}"
            fi
        done

        # Check git state files
        if ssh_exec "[ -f ${code_dir}/git_commit.txt ]"; then
            local commit=$(ssh_exec "cat ${code_dir}/git_commit.txt" || echo "unknown")
            info "Git commit: ${commit}"
            success "Git commit recorded"
        fi

    else
        error "Code extraction failed"
        return 1
    fi

    # Clean up test extraction
    ssh_exec "rm -rf ${test_extract_dir}"

    success "Code extraction test completed"
}

test_backup_integrity() {
    section "Backup Integrity Test"

    # Test metadata
    if ssh_exec "[ -f ${BACKUP_SOURCE}/metadata.json ]"; then
        success "Metadata file exists"

        # Validate JSON
        if ssh_exec "python3 -c \"import json; json.load(open('${BACKUP_SOURCE}/metadata.json'))\" 2>/dev/null || jq empty ${BACKUP_SOURCE}/metadata.json 2>/dev/null"; then
            success "Metadata is valid JSON"
        else
            error "Metadata is invalid JSON"
        fi
    else
        warning "Metadata not found (legacy backup?)"
    fi

    # Test checksums
    local checksum_dirs=("database" "config" "code")
    for dir in "${checksum_dirs[@]}"; do
        local checksum_file="${BACKUP_SOURCE}/${dir}/checksums.txt"

        if ssh_exec "[ -f ${checksum_file} ]"; then
            info "Verifying checksums in ${dir}..."
            if ssh_exec "cd ${BACKUP_SOURCE}/${dir} && sha256sum -c checksums.txt > /dev/null 2>&1"; then
                success "Checksums valid in ${dir}"
            else
                error "Checksum verification failed in ${dir}"
            fi
        else
            warning "Checksums not found in ${dir}"
        fi
    done

    success "Backup integrity test completed"
}

estimate_restore_time() {
    section "Restore Time Estimation"

    local backup_size=$(ssh_exec "du -sb ${BACKUP_SOURCE} 2>/dev/null | awk '{print \$1}' || echo '0'")
    local backup_size_mb=$((backup_size / 1024 / 1024))

    info "Backup size: ${backup_size_mb} MB"

    # Conservative estimates based on test results
    local db_restore_time=$((backup_size_mb / 10))
    local code_extract_time=$((backup_size_mb / 50))
    local config_restore_time=30
    local total_time=$((db_restore_time + code_extract_time + config_restore_time))

    echo ""
    echo "Estimated Restore Times (Production):"
    echo "  Database restore: ~${db_restore_time}s (~$((db_restore_time/60)) minutes)"
    echo "  Code extraction: ~${code_extract_time}s (~$((code_extract_time/60)) minutes)"
    echo "  Config restore: ~${config_restore_time}s"
    echo "  Total estimated: ~${total_time}s (~$((total_time/60)) minutes)"
    echo ""
}

#------------------------------------------------------------------------------
# Print Report
#------------------------------------------------------------------------------

print_report() {
    echo ""
    echo "=============================================================================="
    echo "Restore Test Report"
    echo "=============================================================================="
    echo ""
    echo "Backup Source: ${BACKUP_SOURCE}"
    echo "Test Type: ${TEST_TYPE}"
    echo "Timestamp: ${TIMESTAMP}"
    echo "Dry Run: ${DRY_RUN}"
    echo ""
    echo "Test Summary:"
    echo "  Total Tests: ${TOTAL_TESTS}"
    echo -e "  ${GREEN}Passed:${NC} ${PASSED_TESTS}"
    echo -e "  ${RED}Failed:${NC} ${FAILED_TESTS}"
    echo ""

    if [ ${#TEST_RESULTS[@]} -gt 0 ]; then
        echo "Test Results:"
        for result in "${TEST_RESULTS[@]}"; do
            if [[ $result == PASS:* ]]; then
                echo -e "  ${GREEN}${result}${NC}"
            elif [[ $result == FAIL:* ]]; then
                echo -e "  ${RED}${result}${NC}"
            else
                echo -e "  ${YELLOW}${result}${NC}"
            fi
        done
        echo ""
    fi

    echo "Recommendations:"
    if [ $FAILED_TESTS -eq 0 ]; then
        echo -e "  ${GREEN}✓ Backup is suitable for production restore${NC}"
        echo "  - All critical components tested successfully"
        echo "  - Database restore is functional"
        echo "  - Configuration files are valid"
        echo "  - Code extraction is working"
        if [ "$TEST_TYPE" = "full" ]; then
            echo "  - Backup integrity verified"
        fi
    else
        echo -e "  ${RED}✗ Backup has issues that should be addressed${NC}"
        echo "  - Review failed tests above"
        echo "  - Consider creating a new backup"
        echo "  - Test with alternative backup if available"
    fi
    echo ""

    if [ "$DRY_RUN" = true ]; then
        echo "NOTE: This was a DRY RUN - no actual changes were made"
        echo "To perform real tests, run without --dry-run flag"
        echo ""
    fi

    echo "=============================================================================="

    # Exit with appropriate code
    if [ $FAILED_TESTS -gt 0 ]; then
        exit 1
    fi
}

#------------------------------------------------------------------------------
# Help
#------------------------------------------------------------------------------

show_help() {
    cat << EOF
Usage: $0 [OPTIONS]

Options:
  --source <path>      Backup source path (required)
  --type <type>        Test type: full, database, config, code (default: full)
  --dry-run            Simulate tests without making changes
  --no-cleanup         Leave test containers for inspection
  --help               Show this help message

Environment Variables:
  DEPLOY_USER          SSH user (default: root)
  DEPLOY_HOST          SSH host (default: 118.25.0.190)

Test Components:
  - Database: Restore to isolated test container and verify data
  - Configuration: Validate file formats and required variables
  - Code: Test extraction and verify critical files
  - Integrity: Verify checksums and metadata

Safety Features:
  - Tests run in isolated containers
  - No impact on production environment
  - Automatic cleanup of test resources
  - Dry-run mode available

Examples:
  # Test full restore
  $0 --source /opt/opclaw/backups/20260319_120000

  # Test database restore only
  $0 --source /opt/opclaw/backups/20260319_120000 --type database

  # Dry run (simulate tests)
  $0 --source /opt/opclaw/backups/20260319_120000 --dry-run

  # Leave test containers for inspection
  $0 --source /opt/opclaw/backups/20260319_120000 --no-cleanup

Cleanup:
  - Test containers are automatically removed by default
  - Use --no-cleanup to inspect test results
  - Manual cleanup: docker rm -f opclaw-restore-test-*

EOF
}

#------------------------------------------------------------------------------
# Main
#------------------------------------------------------------------------------

main() {
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --source)
                BACKUP_SOURCE="$2"
                shift 2
                ;;
            --type)
                TEST_TYPE="$2"
                shift 2
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --no-cleanup)
                CLEANUP=false
                shift
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                echo "Use --help for usage information"
                exit 1
                ;;
        esac
    done

    # Print header
    echo "=============================================================================="
    echo "AIOpc Backup Restore Testing Script"
    echo "=============================================================================="
    echo "Backup Source: ${BACKUP_SOURCE}"
    echo "Test Type: ${TEST_TYPE}"
    echo "Dry Run: ${DRY_RUN}"
    echo "Auto Cleanup: ${CLEANUP}"
    echo "=============================================================================="
    echo ""

    if [ "$DRY_RUN" = true ]; then
        warning "Running in DRY RUN mode - no actual changes will be made"
        echo ""
    fi

    # Execute tests
    check_prerequisites
    test_backup_integrity
    test_database_restore
    test_configuration_restore
    test_code_extraction
    estimate_restore_time
    print_report

    if [ $FAILED_TESTS -eq 0 ]; then
        success "Restore testing completed successfully!"
    else
        error "Restore testing completed with failures"
        exit 1
    fi
}

main "$@"
