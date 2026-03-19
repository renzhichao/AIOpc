#!/opt/homebrew/bin/bash
#==============================================================================
# Tenant Deletion Script
# (租户删除脚本)
#
# Purpose: Safely delete tenant configuration and database records
#
# Usage:
#   scripts/tenant/delete.sh <tenant_id> [options]
#   --force            Skip confirmation prompts
#   --backup           Backup configuration before deletion
#   --backup-dir DIR   Custom backup directory
#   --purge            Remove all database records (not just soft delete)
#
# Example:
#   scripts/tenant/delete.sh tenant_001
#   scripts/tenant/delete.sh tenant_001 --backup --force
#
# Version: 1.0
# Last Updated: 2026-03-19
#==============================================================================

set -euo pipefail

#==============================================================================
# Configuration and Initialization
#==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
LIB_DIR="${PROJECT_ROOT}/scripts/lib"
CONFIG_DIR="${PROJECT_ROOT}/config/tenants"
BACKUP_DIR="${PROJECT_ROOT}/backups/tenants"

# Source required libraries
source "${LIB_DIR}/logging.sh" 2>/dev/null || { echo "ERROR: logging.sh not found"; exit 1; }
source "${LIB_DIR}/config.sh" 2>/dev/null || { echo "ERROR: config.sh not found"; exit 1; }
source "${LIB_DIR}/state.sh" 2>/dev/null || { echo "ERROR: state.sh not found"; exit 1; }

# Default values
FORCE=false
DO_BACKUP=false
PURGE=false
TENANT_ID=""

# Colors for output
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    BOLD='\033[1m'
    NC='\033[0m'
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    BOLD=''
    NC=''
fi

#==============================================================================
# Helper Functions
#==============================================================================

print_usage() {
    cat << EOF
Usage: ${0##*/} <tenant_id> [options]

Safely delete tenant configuration and database records.

Arguments:
  tenant_id            Tenant ID (required)

Options:
  --force              Skip confirmation prompts
  --backup             Backup configuration before deletion
  --backup-dir DIR     Custom backup directory [default: backups/tenants]
  --purge              Remove all database records (not just soft delete)
  -h, --help           Show this help message

WARNING: This action cannot be easily undone. Always use --backup for production tenants.

Examples:
  ${0##*/} tenant_001 --backup
  ${0##*/} tenant_001 --backup --force
  ${0##*/} test_tenant --purge --force

EOF
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*" >&2
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*" >&2
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

#==============================================================================
# Validation Functions
#==============================================================================

check_tenant_exists() {
    local tenant_id=$1
    local config_file="${CONFIG_DIR}/${tenant_id}.yml"

    if [ ! -f "$config_file" ]; then
        log_error "Tenant not found: $tenant_id"
        log_error "Config file does not exist: $config_file"
        return 1
    fi

    return 0
}

check_deployments_exist() {
    local tenant_id=$1

    # Initialize state database
    if ! state_init 2>/dev/null; then
        log_debug "Could not check for active deployments (database unavailable)"
        return 0
    fi

    local sql_query
    sql_query="SELECT COUNT(*)
    FROM deployments
    WHERE tenant_id = '$tenant_id'
        AND status = 'in_progress';"

    local count
    if state_exec_sql "$sql_query" count 2>/dev/null; then
        count=$(echo "$count" | tr -d ' ')
        if [ "$count" -gt 0 ]; then
            log_warning "Tenant has $count in-progress deployment(s)"
            return 1
        fi
    fi

    return 0
}

#==============================================================================
# Backup Functions
#==============================================================================

backup_tenant_config() {
    local tenant_id=$1
    local backup_dir=$2

    log_info "Backing up tenant configuration..."

    # Create backup directory
    mkdir -p "$backup_dir"

    # Create backup filename with timestamp
    local timestamp
    timestamp=$(date -u +"%Y%m%d_%H%M%S")
    local backup_file="${backup_dir}/${tenant_id}_${timestamp}.yml"

    # Copy config file
    local config_file="${CONFIG_DIR}/${tenant_id}.yml"
    cp "$config_file" "$backup_file"

    log_success "Configuration backed up to: $backup_file"

    # Also backup to database
    if state_init 2>/dev/null; then
        # Backup config as base64 in database
        local config_content
        config_content=$(base64 -i "$config_file" 2>/dev/null)

        local sql_query
        sql_query="INSERT INTO tenant_config_backups (
            tenant_id,
            config_content,
            backup_reason,
            created_at
        ) VALUES (
            '$tenant_id',
            '$config_content',
            'deletion',
            NOW()
        );"

        if state_exec_sql "$sql_query" 2>/dev/null; then
            log_success "Configuration backed up to database"
        fi
    fi

    return 0
}

#==============================================================================
# Deletion Functions
#==============================================================================

soft_delete_tenant() {
    local tenant_id=$1

    log_debug "Soft deleting tenant from database"

    # Initialize state database
    if ! state_init 2>/dev/null; then
        log_warning "Failed to initialize state database, skipping database update"
        return 1
    fi

    local sql_query
    sql_query="UPDATE tenants
    SET status = 'deleted',
        updated_at = NOW()
    WHERE tenant_id = '$tenant_id';"

    if state_exec_sql "$sql_query" 2>/dev/null; then
        log_success "Tenant marked as deleted in database"
        return 0
    else
        log_warning "Failed to update tenant status in database"
        return 1
    fi
}

purge_tenant() {
    local tenant_id=$1

    log_debug "Purging tenant from database"

    # Initialize state database
    if ! state_init 2>/dev/null; then
        log_warning "Failed to initialize state database, skipping database purge"
        return 1
    fi

    # Delete tenant record
    local sql_query
    sql_query="DELETE FROM tenants WHERE tenant_id = '$tenant_id';"

    if state_exec_sql "$sql_query" 2>/dev/null; then
        log_success "Tenant record purged from database"
    else
        log_warning "Failed to purge tenant from database"
    fi

    # Delete deployment records
    sql_query="DELETE FROM deployments WHERE tenant_id = '$tenant_id';"

    if state_exec_sql "$sql_query" 2>/dev/null; then
        log_success "Deployment records purged from database"
    fi

    # Delete health check records
    sql_query="DELETE FROM health_checks WHERE tenant_id = '$tenant_id';"

    if state_exec_sql "$sql_query" 2>/dev/null; then
        log_success "Health check records purged from database"
    fi

    return 0
}

delete_tenant_config() {
    local tenant_id=$1
    local config_file="${CONFIG_DIR}/${tenant_id}.yml"

    log_debug "Deleting tenant configuration file"

    # Move to trash or delete
    if [ -f "$config_file" ]; then
        rm -f "$config_file"
        log_success "Configuration file deleted: $config_file"
    fi

    return 0
}

confirm_deletion() {
    local tenant_id=$1

    echo
    echo -e "${RED}${BOLD}WARNING: You are about to delete tenant: $tenant_id${NC}"
    echo
    echo "This will:"
    echo "  - Delete the configuration file"
    if [ "$PURGE" = "true" ]; then
        echo "  - PERMANENTLY remove all database records"
    else
        echo "  - Mark tenant as deleted in database (soft delete)"
    fi
    if [ "$DO_BACKUP" = "true" ]; then
        echo "  - Create a backup before deletion"
    fi
    echo
    echo "This action is difficult to undo!"
    echo

    if [ "$FORCE" != "true" ]; then
        read -p "Type '${tenant_id}' to confirm deletion: " confirm
        if [ "$confirm" != "$tenant_id" ]; then
            log_info "Deletion cancelled"
            exit 0
        fi
    fi

    return 0
}

#==============================================================================
# Main Execution
#==============================================================================

main() {
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --force)
                FORCE=true
                shift
                ;;
            --backup)
                DO_BACKUP=true
                shift
                ;;
            --backup-dir)
                BACKUP_DIR="$2"
                shift 2
                ;;
            --purge)
                PURGE=true
                shift
                ;;
            -h|--help)
                print_usage
                exit 0
                ;;
            -*)
                log_error "Unknown option: $1"
                print_usage
                exit 1
                ;;
            *)
                TENANT_ID="$1"
                shift
                ;;
        esac
    done

    # Validate tenant ID
    if [ -z "$TENANT_ID" ]; then
        log_error "Tenant ID is required"
        print_usage
        exit 1
    fi

    log_info "=== Tenant Deletion Script ==="

    # Check if tenant exists
    check_tenant_exists "$TENANT_ID" || exit 1

    # Check for active deployments
    if ! check_deployments_exist "$TENANT_ID"; then
        log_error "Cannot delete tenant with in-progress deployments"
        log_error "Use --force to override this check"
        if [ "$FORCE" != "true" ]; then
            exit 1
        fi
    fi

    # Confirm deletion
    confirm_deletion "$TENANT_ID"

    # Backup configuration if requested
    if [ "$DO_BACKUP" = "true" ]; then
        backup_tenant_config "$TENANT_ID" "$BACKUP_DIR" || log_warning "Backup failed"
    fi

    # Update database (soft delete or purge)
    if [ "$PURGE" = "true" ]; then
        purge_tenant "$TENANT_ID"
    else
        soft_delete_tenant "$TENANT_ID"
    fi

    # Delete configuration file
    delete_tenant_config "$TENANT_ID"

    echo
    log_success "Tenant deleted successfully: $TENANT_ID"

    if [ "$DO_BACKUP" = "true" ]; then
        log_info "Backup is available in: $BACKUP_DIR"
    fi

    exit 0
}

# Run main function
main "$@"
