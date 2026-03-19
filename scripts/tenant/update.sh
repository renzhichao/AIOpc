#!/opt/homebrew/bin/bash
#==============================================================================
# Tenant Update Script
# (租户更新脚本)
#
# Purpose: Update tenant configuration and database records
#
# Usage:
#   scripts/tenant/update.sh <tenant_id> [options]
#   --name NAME        Update tenant name
#   --status STATUS    Update tenant status
#   --tier TIER        Update tenant tier
#   --config KEY=VAL   Update config value (can be used multiple times)
#   --set-env VAR=VAL  Set environment variable in config
#   --dry-run          Show what would be done
#
# Example:
#   scripts/tenant/update.sh tenant_001 --name "New Name" --status active
#   scripts/tenant/update.sh tenant_001 --config server.host=192.168.1.100
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

# Source required libraries
source "${LIB_DIR}/logging.sh" 2>/dev/null || { echo "ERROR: logging.sh not found"; exit 1; }
source "${LIB_DIR}/config.sh" 2>/dev/null || { echo "ERROR: config.sh not found"; exit 1; }
source "${LIB_DIR}/state.sh" 2>/dev/null || { echo "ERROR: state.sh not found"; exit 1; }
source "${LIB_DIR}/validation.sh" 2>/dev/null || { echo "ERROR: validation.sh not found"; exit 1; }

# Default values
DRY_RUN=false
TENANT_ID=""
NEW_NAME=""
NEW_STATUS=""
NEW_TIER=""
declare -a CONFIG_UPDATES=()
declare -a ENV_UPDATES=()

# Colors for output
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    CYAN='\033[0;36m'
    BOLD='\033[1m'
    NC='\033[0m'
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    CYAN=''
    BOLD=''
    NC=''
fi

#==============================================================================
# Helper Functions
#==============================================================================

print_usage() {
    cat << EOF
Usage: ${0##*/} <tenant_id> [options]

Update tenant configuration and database records.

Arguments:
  tenant_id            Tenant ID (required)

Options:
  --name NAME          Update tenant name
  --status STATUS      Update tenant status (provisioning|active|suspended|deleted)
  --tier TIER          Update tenant tier (trial|basic|standard|premium|enterprise)
  --config KEY=VAL     Update config value (e.g., server.host=192.168.1.100)
  --set-env VAR=VAL    Set environment variable (e.g., DEEPSEEK_API_KEY=sk-xxx)
  --dry-run            Show what would be done without making changes
  -h, --help           Show this help message

Examples:
  ${0##*/} tenant_001 --name "Acme Corporation"
  ${0##*/} tenant_001 --status active --tier premium
  ${0##*/} tenant_001 --config server.host=192.168.1.100 --config database.port=5433
  ${0##*/} tenant_001 --set-env DEEPSEEK_API_KEY=sk-xxxxx

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

log_debug() {
    if [[ "${DEBUG:-false}" == "true" ]]; then
        echo -e "${CYAN}[DEBUG]${NC} $*" >&2
    fi
}

#==============================================================================
# Validation Functions
#==============================================================================

validate_tenant_id() {
    local tenant_id=$1
    local config_file="${CONFIG_DIR}/${tenant_id}.yml"

    if [ ! -f "$config_file" ]; then
        log_error "Tenant not found: $tenant_id"
        log_error "Config file does not exist: $config_file"
        return 1
    fi

    return 0
}

validate_status() {
    local status=$1

    if [[ ! "$status" =~ ^(provisioning|active|suspended|deleted)$ ]]; then
        log_error "Invalid status: $status"
        log_error "Status must be: provisioning, active, suspended, or deleted"
        return 1
    fi

    return 0
}

validate_tier() {
    local tier=$1

    if [[ ! "$tier" =~ ^(trial|basic|standard|premium|enterprise)$ ]]; then
        log_error "Invalid tier: $tier"
        log_error "Tier must be: trial, basic, standard, premium, or enterprise"
        return 1
    fi

    return 0
}

validate_config_path() {
    local path=$1

    # Validate YAML path format (e.g., server.host, database.port)
    if [[ ! "$path" =~ ^[a-z_]+(\.[a-z_]+)+$ ]]; then
        log_error "Invalid config path: $path"
        log_error "Path must be in format: section.key (e.g., server.host)"
        return 1
    fi

    return 0
}

#==============================================================================
# Update Functions
#==============================================================================

update_tenant_in_database() {
    local tenant_id=$1
    local updates=$2

    log_debug "Updating tenant in database: $updates"

    # Initialize state database
    if ! state_init 2>/dev/null; then
        log_warning "Failed to initialize state database, skipping database update"
        return 1
    fi

    local sql_query
    sql_query="UPDATE tenants
    SET $updates, updated_at = NOW()
    WHERE tenant_id = '$tenant_id';"

    if state_exec_sql "$sql_query" 2>/dev/null; then
        log_success "Tenant record updated in database"
        return 0
    else
        log_warning "Failed to update tenant in database"
        return 1
    fi
}

update_config_value() {
    local config_file=$1
    local path=$2
    local value=$3

    log_debug "Updating config value: $path = $value"

    # Use yq to update the value
    if ! yq eval ".$path = \"$value\"" -i "$config_file" 2>/dev/null; then
        log_error "Failed to update config value: $path"
        return 1
    fi

    log_success "Config value updated: $path = $value"
    return 0
}

update_environment_variable() {
    local config_file=$1
    local var_name=$2
    local var_value=$3

    log_debug "Setting environment variable: $var_name"

    # Check if variable already exists in config
    if grep -q "\${$var_name:-" "$config_file" 2>/dev/null; then
        # Update existing variable
        sed -i.bak "s|\${$var_name:-[^}]*}|\${$var_name:-$var_value}|g" "$config_file"
        rm -f "${config_file}.bak"
        log_success "Environment variable updated: $var_name"
    else
        # Add new environment variable comment
        echo "# Environment variable: $var_name" >> "$config_file"
        log_info "Environment variable reference added: $var_name"
    fi

    return 0
}

confirm_updates() {
    log_info "The following updates will be applied to tenant: $TENANT_ID"
    echo

    if [ -n "$NEW_NAME" ]; then
        echo "  Name: $NEW_NAME"
    fi

    if [ -n "$NEW_STATUS" ]; then
        echo "  Status: $NEW_STATUS"
    fi

    if [ -n "$NEW_TIER" ]; then
        echo "  Tier: $NEW_TIER"
    fi

    for config_update in "${CONFIG_UPDATES[@]}"; do
        local key=${config_update%%=*}
        local value=${config_update#*=}
        echo "  Config: $key = $value"
    done

    for env_update in "${ENV_UPDATES[@]}"; do
        local var=${env_update%%=*}
        local value=${env_update#*=}
        echo "  Environment: $var = ${value:0:20}..."
    done

    echo
    read -p "Continue? [y/N]: " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        log_info "Update cancelled"
        exit 0
    fi
}

#==============================================================================
# Main Execution
#==============================================================================

main() {
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --name)
                NEW_NAME="$2"
                shift 2
                ;;
            --status)
                NEW_STATUS="$2"
                shift 2
                ;;
            --tier)
                NEW_TIER="$2"
                shift 2
                ;;
            --config)
                CONFIG_UPDATES+=("$2")
                shift 2
                ;;
            --set-env)
                ENV_UPDATES+=("$2")
                shift 2
                ;;
            --dry-run)
                DRY_RUN=true
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

    validate_tenant_id "$TENANT_ID" || exit 1

    # Check if any updates specified
    if [ -z "$NEW_NAME" ] && [ -z "$NEW_STATUS" ] && [ -z "$NEW_TIER" ] && [ ${#CONFIG_UPDATES[@]} -eq 0 ] && [ ${#ENV_UPDATES[@]} -eq 0 ]; then
        log_error "No updates specified"
        print_usage
        exit 1
    fi

    # Validate updates
    if [ -n "$NEW_STATUS" ]; then
        validate_status "$NEW_STATUS" || exit 1
    fi

    if [ -n "$NEW_TIER" ]; then
        validate_tier "$NEW_TIER" || exit 1
    fi

    for config_update in "${CONFIG_UPDATES[@]}"; do
        local key=${config_update%%=*}
        local value=${config_update#*=}
        validate_config_path "$key" || exit 1
    done

    # Get config file path
    local config_file="${CONFIG_DIR}/${TENANT_ID}.yml"

    # Show what would be done in dry-run mode
    if [ "$DRY_RUN" = "true" ]; then
        log_info "DRY RUN: Would update tenant: $TENANT_ID"
        confirm_updates
        exit 0
    fi

    # Confirm updates
    confirm_updates

    # Apply updates
    local db_updates=""
    local has_updates=false

    # Update name
    if [ -n "$NEW_NAME" ]; then
        update_config_value "$config_file" "tenant.name" "$NEW_NAME"
        db_updates="name = '$NEW_NAME'"
        has_updates=true
    fi

    # Update tier
    if [ -n "$NEW_TIER" ]; then
        update_config_value "$config_file" "tenant.tier" "$NEW_TIER"
        if [ -n "$db_updates" ]; then
            db_updates="$db_updates, tier = '$NEW_TIER'"
        else
            db_updates="tier = '$NEW_TIER'"
        fi
        has_updates=true
    fi

    # Update status in database only
    if [ -n "$NEW_STATUS" ]; then
        if [ -n "$db_updates" ]; then
            db_updates="$db_updates, status = '$NEW_STATUS'"
        else
            db_updates="status = '$NEW_STATUS'"
        fi
        has_updates=true
    fi

    # Update config values
    for config_update in "${CONFIG_UPDATES[@]}"; do
        local key=${config_update%%=*}
        local value=${config_update#*=}
        update_config_value "$config_file" "$key" "$value"
        has_updates=true
    done

    # Update environment variables
    for env_update in "${ENV_UPDATES[@]}"; do
        local var=${env_update%%=*}
        local value=${env_update#*=}
        update_environment_variable "$config_file" "$var" "$value"
        has_updates=true
    done

    # Update database
    if [ -n "$db_updates" ]; then
        update_tenant_in_database "$TENANT_ID" "$db_updates" || true
    fi

    # Validate updated configuration
    log_info "Validating updated configuration..."
    if validate_config "$config_file" 2>/dev/null; then
        log_success "Configuration validation passed"
    else
        log_warning "Configuration validation failed with warnings"
    fi

    echo
    log_success "Tenant updated successfully: $TENANT_ID"
    exit 0
}

# Run main function
main "$@"
