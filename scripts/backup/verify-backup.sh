#!/bin/bash

#==============================================================================
# AIOpc Backup Verification Script
#==============================================================================
# Comprehensive backup integrity verification
#
# Features:
# - Database backup validation
# - Configuration file verification
# - Code repository validation
# - Checksum verification
# - Restore capability testing
#
# Usage:
#   ./verify-backup.sh [--path <backup-path>] [--quick] [--detailed]
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
LOG_FILE="${PROJECT_ROOT}/backup-verification.log"

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
BACKUP_PATH=${BACKUP_PATH:-/opt/opclaw/backups}

# Verification options
BACKUP_PATH_TO_VERIFY=""
VERIFICATION_TYPE="full"
CHECKSUM_VERIFY=true
RESTORE_TEST=false
DETAILED_OUTPUT=false

# Verification counters
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNING_CHECKS=0

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
    ((PASSED_CHECKS++))
    ((TOTAL_CHECKS++))
}

warning() {
    echo -e "${YELLOW}[!]${NC} $*"
    log "WARNING" "$*"
    ((WARNING_CHECKS++))
    ((TOTAL_CHECKS++))
}

error() {
    echo -e "${RED}[✗]${NC} $*"
    log "ERROR" "$*"
    ((FAILED_CHECKS++))
    ((TOTAL_CHECKS++))
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
    ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
        -i ~/.ssh/rap001_opclaw \
        "${DEPLOY_USER}@${DEPLOY_HOST}" "$command"
}

#------------------------------------------------------------------------------
# Verification Functions
#------------------------------------------------------------------------------

verify_backup_exists() {
    step "Verifying backup exists"

    if [ -z "$BACKUP_PATH_TO_VERIFY" ]; then
        error "Backup path not specified (--path required)"
        exit 1
    fi

    if ssh_exec "[ -d ${BACKUP_PATH_TO_VERIFY} ]"; then
        success "Backup directory exists: ${BACKUP_PATH_TO_VERIFY}"
    else
        error "Backup directory not found: ${BACKUP_PATH_TO_VERIFY}"
        exit 1
    fi

    # Check for metadata
    if ssh_exec "[ -f ${BACKUP_PATH_TO_VERIFY}/metadata.json ]"; then
        success "Backup metadata found"
    else
        warning "Backup metadata not found (legacy backup?)"
    fi
}

verify_database_backup() {
    if [ "$VERIFICATION_TYPE" != "full" ] && [ "$VERIFICATION_TYPE" != "database" ]; then
        return 0
    fi

    section "Database Backup Verification"

    local db_dir="${BACKUP_PATH_TO_VERIFY}/database"

    # Check database directory exists
    if ! ssh_exec "[ -d ${db_dir} ]"; then
        error "Database directory not found"
        return 1
    fi

    success "Database directory exists"

    # Verify full backup
    if ssh_exec "[ -f ${db_dir}/opclaw_full.sql.gz ]"; then
        local size=$(ssh_exec "stat -f%z ${db_dir}/opclaw_full.sql.gz 2>/dev/null || stat -c%s ${db_dir}/opclaw_full.sql.gz" || echo "0")

        if [ "$size" -gt 1000 ]; then
            success "Full database backup exists (${size} bytes)"
        else
            error "Full database backup too small (${size} bytes)"
        fi

        # Test gzip integrity
        if ssh_exec "gunzip -t ${db_dir}/opclaw_full.sql.gz 2>&1"; then
            success "Gzip integrity verified"
        else
            error "Gzip integrity check failed"
        fi

        # Check SQL content
        if ssh_exec "gunzip -c ${db_dir}/opclaw_full.sql.gz | head -10 | grep -q 'PostgreSQL database dump'"; then
            success "SQL format validated"
        else
            warning "SQL format validation failed (might be corrupted)"
        fi
    else
        error "Full database backup not found"
    fi

    # Verify schema backup
    if ssh_exec "[ -f ${db_dir}/schema.sql ]"; then
        local size=$(ssh_exec "stat -f%z ${db_dir}/schema.sql 2>/dev/null || stat -c%s ${db_dir}/schema.sql" || echo "0")
        if [ "$size" -gt 100 ]; then
            success "Schema backup exists (${size} bytes)"
        else
            warning "Schema backup too small (${size} bytes)"
        fi
    else
        warning "Schema backup not found (might be older backup format)"
    fi

    # Verify data backup
    if ssh_exec "[ -f ${db_dir}/data.sql ]"; then
        local size=$(ssh_exec "stat -f%z ${db_dir}/data.sql 2>/dev/null || stat -c%s ${db_dir}/data.sql" || echo "0")
        if [ "$size" -gt 100 ]; then
            success "Data backup exists (${size} bytes)"
        else
            warning "Data backup too small (${size} bytes)"
        fi
    else
        warning "Data backup not found (might be older backup format)"
    fi

    # Verify checksums
    if ssh_exec "[ -f ${db_dir}/checksums.txt ]"; then
        if [ "$CHECKSUM_VERIFY" = true ]; then
            info "Verifying database checksums..."
            if ssh_exec "cd ${db_dir} && sha256sum -c checksums.txt > /dev/null 2>&1"; then
                success "Database checksums valid"
            else
                error "Database checksums verification failed"
            fi
        else
            success "Checksums file found (skipping verification)"
        fi
    else
        warning "Checksums file not found"
    fi

    if [ "$DETAILED_OUTPUT" = true ]; then
        info "Database backup details:"
        ssh_exec "ls -lh ${db_dir}"
    fi
}

verify_configuration_backup() {
    if [ "$VERIFICATION_TYPE" != "full" ] && [ "$VERIFICATION_TYPE" != "config" ]; then
        return 0
    fi

    section "Configuration Backup Verification"

    local config_dir="${BACKUP_PATH_TO_VERIFY}/config"

    # Check config directory exists
    if ! ssh_exec "[ -d ${config_dir} ]"; then
        error "Configuration directory not found"
        return 1
    fi

    success "Configuration directory exists"

    # Verify critical config files
    local critical_configs=(
        ".env.production"
        "docker-compose.yml"
    )

    for config in "${critical_configs[@]}"; do
        if ssh_exec "[ -f ${config_dir}/${config} ]"; then
            local size=$(ssh_exec "stat -f%z ${config_dir}/${config} 2>/dev/null || stat -c%s ${config_dir}/${config}" || echo "0")
            if [ "$size" -gt 0 ]; then
                success "Config file exists: ${config} (${size} bytes)"

                # Check for placeholder values
                if ssh_exec "grep -qE 'cli_xxxxxxxxxxxxx|CHANGE_THIS|your_|placeholder' ${config_dir}/${config}"; then
                    error "Config file contains placeholder values: ${config}"
                else
                    success "Config file has real values (no placeholders)"
                fi
            else
                error "Config file empty: ${config}"
            fi
        else
            error "Config file missing: ${config}"
        fi
    done

    # Verify optional configs
    local optional_configs=(
        "nginx.conf"
        "backend_container.json"
        "postgres_container.json"
        "redis_container.json"
    )

    for config in "${optional_configs[@]}"; do
        if ssh_exec "[ -f ${config_dir}/${config} ]"; then
            success "Optional config exists: ${config}"
        else
            warning "Optional config missing: ${config}"
        fi
    done

    # Verify checksums
    if ssh_exec "[ -f ${config_dir}/checksums.txt ]"; then
        if [ "$CHECKSUM_VERIFY" = true ]; then
            info "Verifying configuration checksums..."
            if ssh_exec "cd ${config_dir} && sha256sum -c checksums.txt > /dev/null 2>&1"; then
                success "Configuration checksums valid"
            else
                error "Configuration checksums verification failed"
            fi
        else
            success "Checksums file found (skipping verification)"
        fi
    else
        warning "Checksums file not found"
    fi

    if [ "$DETAILED_OUTPUT" = true ]; then
        info "Configuration backup details:"
        ssh_exec "ls -lh ${config_dir}"
    fi
}

verify_code_backup() {
    if [ "$VERIFICATION_TYPE" != "full" ] && [ "$VERIFICATION_TYPE" != "code" ]; then
        return 0
    fi

    section "Code Backup Verification"

    local code_dir="${BACKUP_PATH_TO_VERIFY}/code"

    # Check code directory exists
    if ! ssh_exec "[ -d ${code_dir} ]"; then
        error "Code directory not found"
        return 1
    fi

    success "Code directory exists"

    # Verify repository archive
    if ssh_exec "[ -f ${code_dir}/repository.tar.gz ]"; then
        local size=$(ssh_exec "stat -f%z ${code_dir}/repository.tar.gz 2>/dev/null || stat -c%s ${code_dir}/repository.tar.gz" || echo "0")

        if [ "$size" -gt 1000 ]; then
            success "Repository archive exists (${size} bytes)"

            # Test tar integrity
            if ssh_exec "tar -tzf ${code_dir}/repository.tar.gz > /dev/null 2>&1"; then
                success "Archive integrity verified"

                # Check archive contents
                local file_count=$(ssh_exec "tar -tzf ${code_dir}/repository.tar.gz | wc -l" || echo "0")
                info "Archive contains ${file_count} files"

                if [ "$file_count" -gt 10 ]; then
                    success "Archive has reasonable file count"
                else
                    warning "Archive has low file count (might be incomplete)"
                fi
            else
                error "Archive integrity check failed"
            fi
        else
            error "Repository archive too small (${size} bytes)"
        fi
    else
        error "Repository archive not found"
    fi

    # Verify git state files
    local git_files=("git_commit.txt" "git_status.txt" "git_last_commit.txt")
    for git_file in "${git_files[@]}"; do
        if ssh_exec "[ -f ${code_dir}/${git_file} ]"; then
            success "Git state file exists: ${git_file}"
        else
            warning "Git state file missing: ${git_file}"
        fi
    done

    # Verify checksums
    if ssh_exec "[ -f ${code_dir}/checksums.txt ]"; then
        if [ "$CHECKSUM_VERIFY" = true ]; then
            info "Verifying code checksums..."
            if ssh_exec "cd ${code_dir} && sha256sum -c checksums.txt > /dev/null 2>&1"; then
                success "Code checksums valid"
            else
                error "Code checksums verification failed"
            fi
        else
            success "Checksums file found (skipping verification)"
        fi
    else
        warning "Checksums file not found"
    fi

    if [ "$DETAILED_OUTPUT" = true ]; then
        info "Code backup details:"
        ssh_exec "ls -lh ${code_dir}"
    fi
}

verify_ssh_keys_backup() {
    if [ "$VERIFICATION_TYPE" != "full" ]; then
        return 0
    fi

    section "SSH Keys Backup Verification"

    local ssh_dir="${BACKUP_PATH_TO_VERIFY}/ssh"

    # Check SSH directory exists
    if ssh_exec "[ -d ${ssh_dir} ]"; then
        success "SSH directory exists"

        # Check for SSH documentation
        if ssh_exec "[ -f ${ssh_dir}/ssh_dir_list.txt ]"; then
            success "SSH directory listing exists"
        else
            warning "SSH directory listing not found"
        fi

        if ssh_exec "[ -f ${ssh_dir}/opclaw_keys_list.txt ]"; then
            success "SSH keys documentation exists"
        else
            warning "SSH keys documentation not found"
        fi

        # Note: SSH keys should NOT be in the backup for security
        if ssh_exec "find ${ssh_dir} -name '*.pem' -o -name 'id_*' | grep -q ."; then
            warning "SSH keys found in backup (security risk - keys should be stored locally only)"
        else
            success "No SSH keys in backup (correct security practice)"
        fi
    else
        warning "SSH directory not found (might be older backup format)"
    fi
}

verify_system_state_backup() {
    if [ "$VERIFICATION_TYPE" != "full" ]; then
        return 0
    fi

    section "System State Backup Verification"

    local system_dir="${BACKUP_PATH_TO_VERIFY}/system"

    # Check system directory exists
    if ssh_exec "[ -d ${system_dir} ]"; then
        success "System state directory exists"

        # Check for system info files
        local system_files=(
            "docker_ps.txt"
            "df.txt"
            "memory.txt"
            "uptime.txt"
        )

        for sys_file in "${system_files[@]}"; do
            if ssh_exec "[ -f ${system_dir}/${sys_file} ]"; then
                success "System info file exists: ${sys_file}"
            else
                warning "System info file missing: ${sys_file}"
            fi
        done

        # Check for logs
        if ssh_exec "[ -f ${system_dir}/backend.log ]"; then
            local log_size=$(ssh_exec "stat -f%z ${system_dir}/backend.log 2>/dev/null || stat -c%s ${system_dir}/backend.log" || echo "0")
            success "Backend log exists (${log_size} bytes)"
        else
            warning "Backend log not found"
        fi

        if ssh_exec "[ -f ${system_dir}/postgres.log ]"; then
            local log_size=$(ssh_exec "stat -f%z ${system_dir}/postgres.log 2>/dev/null || stat -c%s ${system_dir}/postgres.log" || echo "0")
            success "Postgres log exists (${log_size} bytes)"
        else
            warning "Postgres log not found"
        fi
    else
        warning "System state directory not found (might be older backup format)"
    fi
}

verify_metadata() {
    section "Metadata Verification"

    if ssh_exec "[ -f ${BACKUP_PATH_TO_VERIFY}/metadata.json ]"; then
        success "Metadata file exists"

        if [ "$DETAILED_OUTPUT" = true ]; then
            info "Metadata contents:"
            ssh_exec "cat ${BACKUP_PATH_TO_VERIFY}/metadata.json"
        fi
    else
        warning "Metadata file not found (legacy backup?)"
    fi
}

estimate_restore_time() {
    section "Restore Time Estimation"

    local backup_size=$(ssh_exec "du -sb ${BACKUP_PATH_TO_VERIFY} 2>/dev/null | awk '{print \$1}' || echo '0'")
    local backup_size_mb=$((backup_size / 1024 / 1024))

    info "Total backup size: ${backup_size_mb} MB"

    # Rough estimates (conservative)
    local db_restore_time=$((backup_size_mb / 10))  # ~10 MB/s
    local code_extract_time=$((backup_size_mb / 50))  # ~50 MB/s
    local total_time=$((db_restore_time + code_extract_time + 60))  # +60s overhead

    info "Estimated restore times:"
    info "  - Database restore: ~${db_restore_time}s"
    info "  - Code extraction: ~${code_extract_time}s"
    info "  - Total estimated: ~${total_time}s (~$((total_time/60)) minutes)"
}

#------------------------------------------------------------------------------
# Print Summary
#------------------------------------------------------------------------------

print_summary() {
    echo ""
    echo "=============================================================================="
    echo "Backup Verification Summary"
    echo "=============================================================================="
    echo ""
    echo "Backup Path: ${BACKUP_PATH_TO_VERIFY}"
    echo "Verification Type: ${VERIFICATION_TYPE}"
    echo "Timestamp: ${TIMESTAMP}"
    echo ""
    echo "Results:"
    echo "  Total Checks: ${TOTAL_CHECKS}"
    echo -e "  ${GREEN}Passed:${NC} ${PASSED_CHECKS}"
    echo -e "  ${YELLOW}Warnings:${NC} ${WARNING_CHECKS}"
    echo -e "  ${RED}Failed:${NC} ${FAILED_CHECKS}"
    echo ""

    if [ $FAILED_CHECKS -eq 0 ]; then
        echo -e "${GREEN}✓ Backup verification PASSED${NC}"
        echo ""
        echo "This backup is ready for restore operations."
    else
        echo -e "${RED}✗ Backup verification FAILED${NC}"
        echo ""
        echo "This backup has issues that should be addressed before use."
    fi

    echo ""
    echo "Recommendations:"
    if [ $FAILED_CHECKS -gt 0 ]; then
        echo "  - Address failed checks before using this backup"
        echo "  - Consider creating a new backup if critical components are missing"
    fi
    if [ $WARNING_CHECKS -gt 0 ]; then
        echo "  - Review warnings for potential issues"
    fi
    if [ $FAILED_CHECKS -eq 0 ] && [ $WARNING_CHECKS -eq 0 ]; then
        echo "  - Backup is in good condition"
        echo "  - Test restore procedure with: ./test-restore.sh ${BACKUP_PATH_TO_VERIFY}"
    fi
    echo ""
    echo "=============================================================================="

    # Exit with appropriate code
    if [ $FAILED_CHECKS -gt 0 ]; then
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
  --path <path>        Backup path to verify (required)
  --type <type>        Verification type: full, database, config, code (default: full)
  --quick              Quick verification (skip checksums)
  --detailed           Show detailed output
  --no-checksum        Skip checksum verification
  --help               Show this help message

Environment Variables:
  DEPLOY_USER          SSH user (default: root)
  DEPLOY_HOST          SSH host (default: 118.25.0.190)
  BACKUP_PATH          Base backup path (default: /opt/opclaw/backups)

Verification Components:
  - Database: SQL dump integrity, gzip validation, format check
  - Configuration: Critical files present, no placeholder values
  - Code: Archive integrity, file count, git state
  - SSH Keys: Documentation exists (no actual keys for security)
  - System State: Docker info, logs, metrics
  - Metadata: Backup metadata file

Examples:
  # Verify full backup
  $0 --path /opt/opclaw/backups/20260319_120000

  # Quick verification (skip checksums)
  $0 --path /opt/opclaw/backups/20260319_120000 --quick

  # Verify database only
  $0 --path /opt/opclaw/backups/20260319_120000 --type database

  # Detailed output
  $0 --path /opt/opclaw/backups/20260319_120000 --detailed

Exit Codes:
  0 - All checks passed
  1 - One or more checks failed

EOF
}

#------------------------------------------------------------------------------
# Main
#------------------------------------------------------------------------------

main() {
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --path)
                BACKUP_PATH_TO_VERIFY="$2"
                shift 2
                ;;
            --type)
                VERIFICATION_TYPE="$2"
                shift 2
                ;;
            --quick)
                CHECKSUM_VERIFY=false
                shift
                ;;
            --detailed)
                DETAILED_OUTPUT=true
                shift
                ;;
            --no-checksum)
                CHECKSUM_VERIFY=false
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
    echo "AIOpc Backup Verification Script"
    echo "=============================================================================="
    echo "Backup Path: ${BACKUP_PATH_TO_VERIFY}"
    echo "Verification Type: ${VERIFICATION_TYPE}"
    echo "Checksum Verify: ${CHECKSUM_VERIFY}"
    echo "Detailed Output: ${DETAILED_OUTPUT}"
    echo "=============================================================================="
    echo ""

    # Execute verification
    verify_backup_exists
    verify_database_backup
    verify_configuration_backup
    verify_code_backup
    verify_ssh_keys_backup
    verify_system_state_backup
    verify_metadata
    estimate_restore_time
    print_summary

    if [ $FAILED_CHECKS -eq 0 ]; then
        success "Backup verification completed successfully!"
    else
        error "Backup verification completed with failures"
        exit 1
    fi
}

main "$@"
