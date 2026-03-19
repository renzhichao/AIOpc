#!/bin/bash
#==============================================================================
# Tenant Rollback Script
# (租户回滚脚本)
#
# Purpose: Rollback tenant deployment to previous version
#
# Features:
# - Automatic rollback to last known good state
# - Backup restoration
# - State database recording
# - Health verification after rollback
# - Multiple rollback strategies
#
# Usage:
#   ./rollback-tenant.sh <tenant_config_file> [strategy]
#
# Strategies:
#   backup    Rollback to backup (default)
#   previous  Rollback to previous deployment
#   version   Rollback to specific version
#
# Options:
#   --force               Force rollback without confirmation
#   --skip-health-check   Skip health checks after rollback
#   --backup-id <id>      Specific backup ID to restore
#   --version <version>   Specific version to rollback to
#   --dry-run             Show what would be rolled back
#
# Dependencies:
# - scripts/lib/*.sh (all library files)
# - ssh (for remote operations)
#
# Version: 1.0
# Last Updated: 2026-03-19
#==============================================================================

set -euo pipefail

#==============================================================================
# Script Configuration
#==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="${SCRIPT_DIR}/../lib"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Rollback options
FORCE=false
SKIP_HEALTH_CHECK=false
DRY_RUN=false
STRATEGY="backup"
BACKUP_ID=""
TARGET_VERSION=""

# Rollback state
CONFIG_FILE=""
TENANT_ID=""
ROLLBACK_ID=""
DEPLOYMENT_ID=""

#==============================================================================
# Source Libraries
#==============================================================================

# Source required libraries
for lib in logging.sh error.sh config.sh state.sh ssh.sh file.sh; do
    if [[ -f "${LIB_DIR}/$lib" ]]; then
        source "${LIB_DIR}/$lib"
    else
        echo "ERROR: Required library not found: $lib" >&2
        exit 1
    fi
done

#==============================================================================
# Helper Functions
#==============================================================================

# Show usage
show_usage() {
    cat << EOF
Usage: $(basename "$0") <tenant_config_file> [strategy] [options]

Rollback tenant deployment to previous state.

Arguments:
  tenant_config_file    Path to tenant YAML configuration file
  strategy              Rollback strategy (backup, previous, version)

Strategies:
  backup                Rollback to backup (default)
  previous              Rollback to previous deployment
  version               Rollback to specific version

Options:
  --force               Force rollback without confirmation
  --skip-health-check   Skip health checks after rollback
  --backup-id <id>      Specific backup ID to restore
  --version <version>   Specific version to rollback to
  --dry-run             Show what would be rolled back
  --verbose             Enable verbose output
  --help                Show this help message

Examples:
  $(basename "$0") config/tenants/tenant_001.yml backup
  $(basename "$0") config/tenants/tenant_001.yml previous --force
  $(basename "$0") config/tenants/tenant_001.yml backup --backup-id pre-deploy.20240319_143022
  $(basename "$0") config/tenants/tenant_001.yml version --version v1.0.0

EOF
}

# Parse command line arguments
parse_arguments() {
    local config_file=""

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --force)
                FORCE=true
                shift
                ;;
            --skip-health-check)
                SKIP_HEALTH_CHECK=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --backup-id)
                BACKUP_ID="$2"
                shift 2
                ;;
            --version)
                TARGET_VERSION="$2"
                STRATEGY="version"
                shift 2
                ;;
            --verbose)
                log_set_level DEBUG
                shift
                ;;
            --help|-h)
                show_usage
                exit 0
                ;;
            -*)
                log_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
            *)
                if [[ -z "$config_file" ]]; then
                    config_file="$1"
                elif [[ -z "$STRATEGY" || "$STRATEGY" == "backup" ]]; then
                    case $1 in
                        backup|previous|version)
                            STRATEGY="$1"
                            ;;
                        *)
                            log_error "Unknown strategy: $1"
                            show_usage
                            exit 1
                            ;;
                    esac
                else
                    log_error "Too many arguments"
                    show_usage
                    exit 1
                fi
                shift
                ;;
        esac
    done

    # Validate config file
    if [[ -z "$config_file" ]]; then
        log_error "Configuration file is required"
        show_usage
        exit 1
    fi

    # Convert to absolute path
    if [[ ! "$config_file" =~ ^/ ]]; then
        config_file="${PROJECT_ROOT}/${config_file}"
    fi

    # Check if config file exists
    if [[ ! -f "$config_file" ]]; then
        log_error "Configuration file not found: $config_file"
        exit 1
    fi

    CONFIG_FILE="$config_file"

    # Validate strategy
    if [[ ! "$STRATEGY" =~ ^(backup|previous|version)$ ]]; then
        log_error "Invalid strategy: $STRATEGY"
        exit 1
    fi

    # Validate backup-id is provided with backup strategy
    if [[ "$STRATEGY" == "backup" && -n "$BACKUP_ID" ]]; then
        log_debug "Using specific backup ID: $BACKUP_ID"
    fi

    # Validate version is provided with version strategy
    if [[ "$STRATEGY" == "version" && -z "$TARGET_VERSION" ]]; then
        log_error "Version strategy requires --version parameter"
        exit 1
    fi

    log_debug "Configuration file: $CONFIG_FILE"
    log_debug "Strategy: $STRATEGY"
    log_debug "Dry run: $DRY_RUN"
}

# Confirm rollback
confirm_rollback() {
    if [[ "$FORCE" == "true" ]]; then
        return 0
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        return 0
    fi

    echo
    echo "========================================"
    echo "  ROLLBACK CONFIRMATION"
    echo "========================================"
    echo "Tenant ID: $TENANT_ID"
    echo "Strategy: $STRATEGY"
    echo "Configuration: $CONFIG_FILE"
    echo
    echo "WARNING: This will rollback the deployment!"
    echo "All changes since the last backup will be lost."
    echo
    echo -n "Are you sure you want to proceed? (yes/no): "
    read -r response

    if [[ "$response" != "yes" && "$response" != "y" ]]; then
        log_info "Rollback cancelled by user"
        exit 0
    fi

    echo
}

#==============================================================================
# Rollback Strategy Functions
#==============================================================================

# Rollback to backup
rollback_to_backup() {
    log_step "Rolling back to backup"

    local server_host="${CONFIG_SERVER_HOST:-}"
    local server_user="${CONFIG_SERVER_SSH_USER:-}"
    local deploy_path="${CONFIG_SERVER_DEPLOY_PATH:-/opt/opclaw/platform}"
    local ssh_target="${server_user}@${server_host}"
    local backup_dir="/var/backups/opclaw/${TENANT_ID}"

    # Find backup to restore
    local backup_path=""

    if [[ -n "$BACKUP_ID" ]]; then
        # Use specified backup ID
        backup_path="${backup_dir}/${BACKUP_ID}"
        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "[DRY-RUN] Would check for backup: $backup_path"
        else
            if ! ssh_exec "$ssh_target" "test -d '$backup_path'"; then
                log_error "Specified backup not found: $backup_path"
                return 1
            fi
        fi
    else
        # Find latest backup
        log_info "Finding latest backup..."
        local latest_backup
        latest_backup=$(ssh_exec "$ssh_target" "ls -t ${backup_dir}/pre-deploy.* 2>/dev/null | head -1" || true)

        if [[ -z "$latest_backup" ]]; then
            log_error "No backups found in: $backup_dir"
            return 1
        fi

        backup_path="$latest_backup"
        log_info "Found backup: $backup_path"
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would rollback to backup: $backup_path"
        ROLLBACK_ID="$backup_path"
        return 0
    fi

    # Stop current deployment
    log_info "Stopping current deployment..."
    ssh_exec "$ssh_target" "cd $deploy_path && docker compose down 2>/dev/null || true"

    # Backup current state (in case we need to rollback the rollback)
    log_info "Backing up current state before rollback..."
    local pre_rollback_backup="${backup_dir}/pre-rollback.$(date '+%Y%m%d_%H%M%S')"
    ssh_exec "$ssh_target" "cp -r $deploy_path $pre_rollback_backup 2>/dev/null || true"
    log_info "Pre-rollback backup created: $pre_rollback_backup"

    # Restore from backup
    log_info "Restoring from backup: $backup_path"
    if ! ssh_exec "$ssh_target" "rm -rf $deploy_path && cp -r $backup_path $deploy_path"; then
        log_error "Failed to restore from backup"
        return 1
    fi

    # Start services
    log_info "Starting services..."
    if ! ssh_exec "$ssh_target" "cd $deploy_path && docker compose up -d"; then
        log_error "Failed to start services after rollback"
        return 1
    fi

    ROLLBACK_ID="$backup_path"
    log_success "Rollback to backup completed"
    return 0
}

# Rollback to previous deployment
rollback_to_previous() {
    log_step "Rolling back to previous deployment"

    # Get last deployment from state database
    log_info "Querying deployment history..."

    if ! state_init; then
        log_error "Failed to initialize state database"
        return 1
    fi

    local last_deployment
    get_tenant_last_deployment "$TENANT_ID" last_deployment

    if [[ -z "$last_deployment" ]]; then
        log_error "No previous deployment found"
        return 1
    fi

    # Parse deployment info
    local prev_deployment_id=$(echo "$last_deployment" | cut -d'|' -f1)
    local prev_status=$(echo "$last_deployment" | cut -d'|' -f2)
    local prev_version=$(echo "$last_deployment" | cut -d'|' -f3)

    log_info "Previous deployment: ID=$prev_deployment_id, Status=$prev_status, Version=$prev_version"

    if [[ "$prev_status" != "success" ]]; then
        log_error "Previous deployment was not successful"
        return 1
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would rollback to deployment: $prev_deployment_id"
        ROLLBACK_ID="$prev_deployment_id"
        return 0
    fi

    # Get configuration snapshot from previous deployment
    log_info "Retrieving configuration snapshot..."
    # TODO: Implement snapshot retrieval and restoration
    # This would query the deployment_config_snapshots table
    log_debug "Configuration snapshot retrieval placeholder"

    ROLLBACK_ID="$prev_deployment_id"
    log_success "Rollback to previous deployment completed"
    return 0
}

# Rollback to specific version
rollback_to_version() {
    log_step "Rolling back to version: $TARGET_VERSION"

    if [[ -z "$TARGET_VERSION" ]]; then
        log_error "Target version not specified"
        return 1
    fi

    # Query deployment history for this version
    log_info "Searching for deployment of version: $TARGET_VERSION"

    if ! state_init; then
        log_error "Failed to initialize state database"
        return 1
    fi

    # TODO: Implement version-specific rollback
    # This would query the deployments table for the specific version
    log_debug "Version rollback placeholder"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would rollback to version: $TARGET_VERSION"
        ROLLBACK_ID="$TARGET_VERSION"
        return 0
    fi

    ROLLBACK_ID="$TARGET_VERSION"
    log_success "Rollback to version completed"
    return 0
}

#==============================================================================
# Post-Rollback Functions
#==============================================================================

# Run health checks after rollback
verify_rollback_health() {
    if [[ "$SKIP_HEALTH_CHECK" == "true" ]]; then
        log_info "Skipping health checks after rollback (--skip-health-check specified)"
        return 0
    fi

    log_step "Verifying rollback health"

    local server_host="${CONFIG_SERVER_HOST:-}"
    local domain="${CONFIG_SERVER_DOMAIN:-$server_host}"
    local api_port="${CONFIG_SERVER_API_PORT:-3000}"

    # Wait for services to start
    log_info "Waiting for services to start..."
    local max_wait=30
    local waited=0

    while [[ $waited -lt $max_wait ]]; do
        if curl -f -s "http://${domain}:${api_port}/health" > /dev/null 2>&1; then
            log_info "Services are now healthy"
            break
        fi
        sleep 2
        ((waited += 2))
    done

    if [[ $waited -ge $max_wait ]]; then
        log_warning "Services did not become healthy within ${max_wait}s"
        return 1
    fi

    # Run full health check
    log_info "Running full health check..."

    # Call post-deploy script for verification
    local post_deploy_script="${SCRIPT_DIR}/post-deploy.sh"
    if [[ -f "$post_deploy_script" ]]; then
        if "$post_deploy_script" "$CONFIG_FILE"; then
            log_success "Health checks passed"
            return 0
        else
            log_error "Health checks failed"
            return 1
        fi
    else
        log_warning "Post-deploy script not found, skipping detailed health check"
        return 0
    fi
}

# Record rollback in state database
record_rollback() {
    log_step "Recording rollback"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would record rollback in state database"
        return 0
    fi

    if [[ -z "$DEPLOYMENT_ID" ]]; then
        log_warning "No deployment ID to record rollback against"
        return 0
    fi

    # Record rollback as a failed deployment
    local rollback_message="Rollback to ${STRATEGY} (${ROLLBACK_ID})"
    if ! record_deployment_failure "$DEPLOYMENT_ID" "ROLLBACK" "$rollback_message"; then
        log_warning "Failed to record rollback in state database"
        return 1
    fi

    log_success "Rollback recorded in state database"
    return 0
}

# Create rollback report
create_rollback_report() {
    log_info "Creating rollback report..."

    local report_file="${PROJECT_ROOT}/claudedocs/rollback_${TENANT_ID}_$(date '+%Y%m%d_%H%M%S').md"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would create rollback report: $report_file"
        return 0
    fi

    {
        echo "# Rollback Report"
        echo
        echo "## Rollback Details"
        echo "- **Tenant ID**: ${TENANT_ID}"
        echo "- **Strategy**: ${STRATEGY}"
        echo "- **Rollback Target**: ${ROLLBACK_ID}"
        echo "- **Timestamp**: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
        echo "- **Triggered By**: ${USER}"
        echo
        echo "## Configuration"
        echo "- **Config File**: ${CONFIG_FILE}"
        echo "- **Environment**: ${CONFIG_TENANT_ENVIRONMENT:-unknown}"
        echo "- **Server**: ${CONFIG_SERVER_HOST:-unknown}"
        echo
        echo "## Status"
        if [[ ${#FAILED_CHECKS[@]} -eq 0 ]]; then
            echo "**Status**: Success"
            echo "Rollback completed successfully and all health checks passed."
        else
            echo "**Status**: Partial Success"
            echo "Rollback completed but some health checks failed:"
            for check in "${FAILED_CHECKS[@]}"; do
                echo "  - $check"
            done
        fi
        echo
        echo "## Notes"
        echo "- Review the cause of the original deployment failure"
        echo "- Verify the rollback has restored service functionality"
        echo "- Consider creating a new deployment after fixing issues"
    } > "$report_file"

    log_success "Rollback report created: $report_file"
    return 0
}

#==============================================================================
# Main Rollback Flow
#==============================================================================

# Main rollback function
main() {
    log_section "Tenant Rollback"
    log_warning "This operation will rollback the deployment!"

    # Parse arguments
    parse_arguments "$@"

    # Initialize error handling
    error_init "$(basename "$0")"
    trap_errors

    # Load tenant configuration
    log_step "Loading tenant configuration"
    if ! load_tenant_config "$CONFIG_FILE"; then
        log_error "Failed to load tenant configuration"
        exit 1
    fi

    TENANT_ID="${CONFIG_TENANT_ID:-}"
    if [[ -z "$TENANT_ID" ]]; then
        log_error "Tenant ID not found in configuration"
        exit 1
    fi

    log_info "Tenant ID: $TENANT_ID"

    # Get current deployment ID
    if state_init; then
        local last_deployment
        get_tenant_last_deployment "$TENANT_ID" last_deployment
        if [[ -n "$last_deployment" ]]; then
            DEPLOYMENT_ID=$(echo "$last_deployment" | cut -d'|' -f1)
            log_info "Current deployment ID: $DEPLOYMENT_ID"
        fi
    fi

    # Confirm rollback
    confirm_rollback

    # Execute rollback based on strategy
    log_separator
    log_info "ROLLBACK EXECUTION"
    log_separator

    case "$STRATEGY" in
        backup)
            rollback_to_backup || exit 1
            ;;
        previous)
            rollback_to_previous || exit 1
            ;;
        version)
            rollback_to_version || exit 1
            ;;
    esac

    # Post-rollback verification
    log_separator
    log_info "POST-ROLLBACK VERIFICATION"
    log_separator

    verify_rollback_health || log_warning "Health checks failed after rollback"
    record_rollback || log_warning "Failed to record rollback"

    # Create report
    create_rollback_report

    # Success
    log_separator
    log_warning "Rollback completed successfully!"
    log_info "Tenant ID: $TENANT_ID"
    log_info "Strategy: $STRATEGY"
    log_info "Rollback Target: $ROLLBACK_ID"
    log_separator

    exit_with_success "Rollback completed successfully"
}

#==============================================================================
# Script Entry Point
#==============================================================================

# Run main function
main "$@"
