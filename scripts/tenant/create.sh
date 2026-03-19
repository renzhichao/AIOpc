#!/opt/homebrew/bin/bash
#==============================================================================
# Tenant Creation Script
# (租户创建脚本)
#
# Purpose: Create a new tenant configuration from template
#
# Usage:
#   scripts/tenant/create.sh [options]
#   --tenant-id TID    Tenant ID (required)
#   --name NAME        Tenant name (required)
#   --environment ENV  Environment (production|staging|development)
#   --tier TIER        Tenant tier (trial|basic|standard|premium|enterprise)
#   --non-interactive  Skip prompts
#   --dry-run          Show what would be done
#
# Example:
#   scripts/tenant/create.sh --tenant-id tenant_001 --name "Acme Corp" --environment production
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
TEMPLATE_FILE="${CONFIG_DIR}/template.yml"

# Source required libraries
source "${LIB_DIR}/logging.sh" 2>/dev/null || { echo "ERROR: logging.sh not found"; exit 1; }
source "${LIB_DIR}/config.sh" 2>/dev/null || { echo "ERROR: config.sh not found"; exit 1; }
source "${LIB_DIR}/state.sh" 2>/dev/null || { echo "ERROR: state.sh not found"; exit 1; }
source "${LIB_DIR}/error.sh" 2>/dev/null || { echo "ERROR: error.sh not found"; exit 1; }

# Default values
DRY_RUN=false
NON_INTERACTIVE=false
TENANT_ID=""
TENANT_NAME=""
TENANT_ENV="development"
TENANT_TIER="trial"

# Colors for output
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    CYAN='\033[0;36m'
    NC='\033[0m'
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    CYAN=''
    NC=''
fi

#==============================================================================
# Helper Functions
#==============================================================================

print_usage() {
    cat << EOF
Usage: ${0##*/} [options]

Create a new tenant configuration from template.

Options:
  --tenant-id TID       Tenant ID (required, alphanumeric with hyphens/underscores)
  --name NAME           Tenant name (required)
  --environment ENV     Environment (production|staging|development) [default: development]
  --tier TIER           Tenant tier (trial|basic|standard|premium|enterprise) [default: trial]
  --non-interactive     Skip all prompts
  --dry-run             Show what would be done without making changes
  -h, --help            Show this help message

Examples:
  ${0##*/} --tenant-id tenant_001 --name "Acme Corp" --environment production
  ${0##*/} --tenant-id test_tenant --name "Test Tenant" --environment development --non-interactive

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

    if [[ ! "$tenant_id" =~ ^[a-zA-Z0-9_-]+$ ]]; then
        log_error "Invalid tenant ID: $tenant_id"
        log_error "Tenant ID must contain only alphanumeric characters, hyphens, and underscores"
        return 1
    fi

    if [[ "$tenant_id" =~ (example|test|demo|placeholder|template) ]]; then
        log_warning "Tenant ID contains default/test value: $tenant_id"
    fi

    return 0
}

validate_environment() {
    local environment=$1

    if [[ ! "$environment" =~ ^(production|staging|development)$ ]]; then
        log_error "Invalid environment: $environment"
        log_error "Environment must be: production, staging, or development"
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

check_tenant_exists() {
    local tenant_id=$1
    local config_file="${CONFIG_DIR}/${tenant_id}.yml"

    if [ -f "$config_file" ]; then
        log_error "Tenant already exists: $tenant_id"
        log_error "Config file: $config_file"
        return 1
    fi

    return 0
}

#==============================================================================
# Creation Functions
#==============================================================================

prompt_for_values() {
    log_info "Enter tenant configuration values"

    # Prompt for tenant ID
    if [ -z "$TENANT_ID" ]; then
        while true; do
            read -p "Tenant ID: " input_id
            if [ -n "$input_id" ]; then
                if validate_tenant_id "$input_id"; then
                    TENANT_ID="$input_id"
                    break
                fi
            else
                log_error "Tenant ID cannot be empty"
            fi
        done
    fi

    # Prompt for tenant name
    if [ -z "$TENANT_NAME" ]; then
        while true; do
            read -p "Tenant Name: " input_name
            if [ -n "$input_name" ]; then
                TENANT_NAME="$input_name"
                break
            else
                log_error "Tenant name cannot be empty"
            fi
        done
    fi

    # Prompt for environment
    if [ "$TENANT_ENV" = "development" ]; then
        read -p "Environment [production|staging|development] [default: development]: " input_env
        if [ -n "$input_env" ]; then
            if validate_environment "$input_env"; then
                TENANT_ENV="$input_env"
            else
                log_warning "Invalid environment, using default: development"
            fi
        fi
    fi

    # Prompt for tier
    read -p "Tier [trial|basic|standard|premium|enterprise] [default: trial]: " input_tier
    if [ -n "$input_tier" ]; then
        if validate_tier "$input_tier"; then
            TENANT_TIER="$input_tier"
        else
            log_warning "Invalid tier, using default: trial"
        fi
    fi

    # Confirmation
    echo
    log_info "Tenant Configuration Summary:"
    echo "  Tenant ID: $TENANT_ID"
    echo "  Tenant Name: $TENANT_NAME"
    echo "  Environment: $TENANT_ENV"
    echo "  Tier: $TENANT_TIER"
    echo

    if [ "$NON_INTERACTIVE" != "true" ]; then
        read -p "Continue? [y/N]: " confirm
        if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
            log_info "Tenant creation cancelled"
            exit 0
        fi
    fi
}

create_tenant_config() {
    local tenant_id=$1
    local tenant_name=$2
    local environment=$3
    local tier=$4
    local config_file="${CONFIG_DIR}/${tenant_id}.yml"

    log_info "Creating tenant configuration: $config_file"

    # Check if template exists
    if [ ! -f "$TEMPLATE_FILE" ]; then
        log_error "Template file not found: $TEMPLATE_FILE"
        return $ERROR_FILE_NOT_FOUND
    fi

    # Create config from template with variable substitution
    {
        # Set environment variables for substitution
        export TENANT_ID="$tenant_id"
        export TENANT_NAME="$tenant_name"
        export TENANT_ENV="$environment"
        export TENANT_TIER="$tier"

        # Use envsubst to replace variables in template
        envsubst < "$TEMPLATE_FILE"
    } > "$config_file"

    log_success "Tenant configuration created: $config_file"
    return 0
}

add_tenant_to_database() {
    local tenant_id=$1
    local tenant_name=$2
    local environment=$3

    log_debug "Adding tenant to state database"

    # Initialize state database
    if ! state_init; then
        log_warning "Failed to initialize state database, skipping database entry"
        return 0
    fi

    # Add tenant record
    local sql_query
    sql_query="INSERT INTO tenants (
        tenant_id,
        name,
        environment,
        tier,
        status,
        created_at,
        updated_at
    ) VALUES (
        '$tenant_id',
        '$tenant_name',
        '$environment',
        '$TENANT_TIER',
        'provisioning',
        NOW(),
        NOW()
    ) ON CONFLICT (tenant_id) DO NOTHING;"

    if state_exec_sql "$sql_query"; then
        log_success "Tenant record added to database"
        return 0
    else
        log_warning "Failed to add tenant to database"
        return 1
    fi
}

print_next_steps() {
    local tenant_id=$1
    local config_file="${CONFIG_DIR}/${tenant_id}.yml"

    echo
    log_info "Next Steps:"
    echo
    echo "  1. Review and edit the configuration file:"
    echo "     $config_file"
    echo
    echo "  2. Set required environment variables or edit config directly:"
    echo "     - FEISHU_APP_ID"
    echo "     - FEISHU_APP_SECRET"
    echo "     - FEISHU_ENCRYPT_KEY"
    echo "     - DB_PASSWORD"
    echo "     - REDIS_PASSWORD"
    echo "     - JWT_SECRET"
    echo "     - DEEPSEEK_API_KEY"
    echo
    echo "  3. Validate the configuration:"
    echo "     scripts/tenant/validate.sh $tenant_id"
    echo
    echo "  4. Deploy the tenant:"
    echo "     scripts/deploy/deploy-tenant.sh --tenant-id $tenant_id"
    echo
}

#==============================================================================
# Main Execution
#==============================================================================

main() {
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --tenant-id)
                TENANT_ID="$2"
                shift 2
                ;;
            --name)
                TENANT_NAME="$2"
                shift 2
                ;;
            --environment)
                TENANT_ENV="$2"
                shift 2
                ;;
            --tier)
                TENANT_TIER="$2"
                shift 2
                ;;
            --non-interactive)
                NON_INTERACTIVE=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            -h|--help)
                print_usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                print_usage
                exit $ERROR_INVALID_ARGUMENT
                ;;
        esac
    done

    log_info "=== Tenant Creation Script ==="

    # Validate required values or prompt for them
    if [ "$NON_INTERACTIVE" = "true" ]; then
        if [ -z "$TENANT_ID" ] || [ -z "$TENANT_NAME" ]; then
            log_error "--tenant-id and --name are required in non-interactive mode"
            print_usage
            exit $ERROR_INVALID_ARGUMENT
        fi
    else
        prompt_for_values
    fi

    # Validate inputs
    log_debug "Validating tenant configuration"
    validate_tenant_id "$TENANT_ID" || exit $ERROR_INVALID_ARGUMENT
    validate_environment "$TENANT_ENV" || exit $ERROR_INVALID_ARGUMENT
    validate_tier "$TENANT_TIER" || exit $ERROR_INVALID_ARGUMENT

    # Check if tenant already exists
    check_tenant_exists "$TENANT_ID" || exit $ERROR_GENERAL

    # Show what would be done in dry-run mode
    if [ "$DRY_RUN" = "true" ]; then
        log_info "DRY RUN: Would create tenant configuration:"
        echo "  Tenant ID: $TENANT_ID"
        echo "  Tenant Name: $TENANT_NAME"
        echo "  Environment: $TENANT_ENV"
        echo "  Tier: $TENANT_TIER"
        echo "  Config File: ${CONFIG_DIR}/${TENANT_ID}.yml"
        exit 0
    fi

    # Create tenant configuration
    log_debug "Creating tenant configuration file"
    create_tenant_config "$TENANT_ID" "$TENANT_NAME" "$TENANT_ENV" "$TENANT_TIER" || exit $?

    # Add tenant to database
    add_tenant_to_database "$TENANT_ID" "$TENANT_NAME" "$TENANT_ENV"

    # Print success message and next steps
    echo
    log_success "Tenant created successfully!"
    echo
    print_next_steps "$TENANT_ID"

    exit 0
}

# Run main function
main "$@"
