#!/bin/bash
#==============================================================================
# Tenant Configuration Generation Script
# (租户配置生成脚本)
#
# Purpose: Generate new tenant configuration from template
#
# Usage:
#   ./generate-config.sh <tenant_id> [options]
#
# Options:
#   --name <name>           Tenant name (default: tenant_id in Title Case)
#   --environment <env>     Environment (production|staging|development)
#   --tier <tier>           Tenant tier (trial|basic|standard|premium|enterprise)
#   --server-host <host>    Server host/IP
#   --output <file>         Output file path (default: config/tenants/<tenant_id>.yml)
#   --interactive           Interactive mode (prompt for values)
#   --dry-run              Show configuration without writing file
#
# Examples:
#   ./generate-config.sh tenant_001 --name "Production Tenant" --environment production
#   ./generate-config.sh tenant_002 --interactive
#   ./generate-config.sh test_tenant --environment development --dry-run
#
# Version: 1.0
# Last Updated: 2026-03-19
#==============================================================================

set -euo pipefail

# Script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
CONFIG_DIR="${PROJECT_ROOT}/config/tenants"
TEMPLATE_FILE="${CONFIG_DIR}/template.yml"

#==============================================================================
# Script Configuration
#==============================================================================

INTERACTIVE_MODE="${INTERACTIVE_MODE:-false}"
DRY_RUN="${DRY_RUN:-false}"

# Default values
DEFAULT_ENVIRONMENT="development"
DEFAULT_TIER="trial"
DEFAULT_SERVER_HOST="localhost"
DEFAULT_OUTPUT_PREFIX=""

#==============================================================================
# Usage and Help
#==============================================================================

show_usage() {
    cat <<EOF
Usage: $(basename "$0") <tenant_id> [options]

Generate a new tenant configuration file from template.

Arguments:
  tenant_id             Unique tenant identifier (alphanumeric, hyphens, underscores)

Options:
  --name <name>         Tenant name (default: auto-generated from tenant_id)
  --environment <env>   Environment: production|staging|development (default: development)
  --tier <tier>         Tenant tier: trial|basic|standard|premium|enterprise (default: trial)
  --server-host <host>  Server host or IP address (default: localhost)
  --output <file>       Output file path (default: config/tenants/<tenant_id>.yml)
  --interactive         Interactive mode (prompt for all values)
  --dry-run             Show configuration without writing file
  --help, -h            Show this help message

Examples:
  $(basename "$0") tenant_001 --name "Production Tenant" --environment production
  $(basename "$0") tenant_002 --interactive
  $(basename "$0") test_tenant --environment development --dry-run

EOF
}

#==============================================================================
# Utility Functions
#==============================================================================

# Convert string to title case
to_title_case() {
    local input=$1
    echo "$input" | sed 's/_/ /g; s/\b\(.\)/\u\1/g'
}

# Validate tenant ID format
validate_tenant_id() {
    local tenant_id=$1

    if [[ ! "$tenant_id" =~ ^[a-zA-Z0-9_-]+$ ]]; then
        echo "Error: Invalid tenant ID format. Use alphanumeric characters, hyphens, and underscores only." >&2
        return 1
    fi

    if [ ${#tenant_id} -lt 3 ]; then
        echo "Error: Tenant ID must be at least 3 characters." >&2
        return 1
    fi

    if [ ${#tenant_id} -gt 100 ]; then
        echo "Error: Tenant ID must be less than 100 characters." >&2
        return 1
    fi

    return 0
}

# Check if tenant ID already exists
tenant_exists() {
    local tenant_id=$1
    local config_file="${CONFIG_DIR}/${tenant_id}.yml"

    if [ -f "$config_file" ]; then
        return 0
    fi

    return 1
}

# Prompt user for input
prompt_input() {
    local prompt=$1
    local default=$2
    local required=${3:-true}

    local input
    local prompt_str

    if [ -n "$default" ]; then
        prompt_str="$prompt [$default]: "
    else
        prompt_str="$prompt: "
    fi

    while true; do
        read -rp "$prompt_str" input

        # Use default if no input provided
        if [ -z "$input" ] && [ -n "$default" ]; then
            echo "$default"
            return 0
        fi

        # Check if required
        if [ "$required" = true ] && [ -z "$input" ]; then
            echo "This field is required. Please enter a value." >&2
            continue
        fi

        echo "$input"
        return 0
    done
}

# Select from options
prompt_select() {
    local prompt=$1
    shift
    local options=("$@")
    local default_index=${#options[@]}  # Default to last option

    echo "$prompt"
    local i=1
    for option in "${options[@]}"; do
        echo "  $i) $option"
        ((i++))
    done

    while true; do
        local selection
        read -rp "Select option [1-${#options[@]}]: " selection

        if [ -z "$selection" ]; then
            selection=$default_index
        fi

        if [[ "$selection" =~ ^[0-9]+$ ]] && [ "$selection" -ge 1 ] && [ "$selection" -le ${#options[@]} ]; then
            echo "${options[$((selection-1))]}"
            return 0
        fi

        echo "Invalid selection. Please enter a number between 1 and ${#options[@]}" >&2
    done
}

#==============================================================================
# Configuration Generation Functions
#==============================================================================

generate_config_interactive() {
    local tenant_id=$1

    echo
    echo "=============================================="
    echo "  Interactive Configuration Generator"
    echo "=============================================="
    echo "Tenant ID: $tenant_id"
    echo

    # Collect information interactively
    local tenant_name
    tenant_name=$(prompt_input "Tenant Name" "$(to_title_case "$tenant_id")")

    local environment
    environment=$(prompt_select "Environment" "development" "staging" "production")

    local tier
    tier=$(prompt_select "Tenant Tier" "trial" "basic" "standard" "premium" "enterprise")

    local server_host
    server_host=$(prompt_input "Server Host/IP" "localhost")

    local ssh_user
    ssh_user=$(prompt_input "SSH User" "root")

    local ssh_key_path
    ssh_key_path=$(prompt_input "SSH Key Path" "~/.ssh/id_rsa")

    local deploy_path
    deploy_path=$(prompt_input "Deploy Path" "/opt/opclaw/platform")

    local feishu_app_id
    feishu_app_id=$(prompt_input "Feishu App ID" "" "true")

    local db_host
    db_host=$(prompt_input "Database Host" "localhost")

    local redis_host
    redis_host=$(prompt_input "Redis Host" "localhost")

    # Generate configuration
    generate_config_file \
        "$tenant_id" \
        "$tenant_name" \
        "$environment" \
        "$tier" \
        "$server_host" \
        "$ssh_user" \
        "$ssh_key_path" \
        "$deploy_path" \
        "$feishu_app_id" \
        "$db_host" \
        "$redis_host"
}

generate_config_non_interactive() {
    local tenant_id=$1
    local tenant_name=${2:-"$(to_title_case "$tenant_id")"}
    local environment=${3:-"$DEFAULT_ENVIRONMENT"}
    local tier=${4:-"$DEFAULT_TIER"}
    local server_host=${5:-"$DEFAULT_SERVER_HOST"}
    local ssh_user=${6:-"root"}
    local ssh_key_path=${7:-"~/.ssh/id_rsa"}
    local deploy_path=${8:-"/opt/opclaw/platform"}
    local feishu_app_id=${9:-""}
    local db_host=${10:-"localhost"}
    local redis_host=${11:-"localhost"}

    # Generate configuration
    generate_config_file \
        "$tenant_id" \
        "$tenant_name" \
        "$environment" \
        "$tier" \
        "$server_host" \
        "$ssh_user" \
        "$ssh_key_path" \
        "$deploy_path" \
        "$feishu_app_id" \
        "$db_host" \
        "$redis_host"
}

generate_config_file() {
    local tenant_id=$1
    local tenant_name=$2
    local environment=$3
    local tier=$4
    local server_host=$5
    local ssh_user=$6
    local ssh_key_path=$7
    local deploy_path=$8
    local feishu_app_id=$9
    local db_host=${10}
    local redis_host=${11}

    # Read template
    if [ ! -f "$TEMPLATE_FILE" ]; then
        echo "Error: Template file not found: $TEMPLATE_FILE" >&2
        exit 1
    fi

    local template_content
    template_content=$(cat "$TEMPLATE_FILE")

    # Replace placeholders using yq
    local config_content
    config_content=$(echo "$template_content" | yq eval "
        .tenant.id = \"$tenant_id\" |
        .tenant.name = \"$tenant_name\" |
        .tenant.environment = \"$environment\" |
        .tenant.tier = \"$tier\" |
        .server.host = \"$server_host\" |
        .server.ssh_user = \"$ssh_user\" |
        .server.ssh_key_path = \"$ssh_key_path\" |
        .server.deploy_path = \"$deploy_path\"
    " - 2>/dev/null)

    # Update Feishu App ID if provided
    if [ -n "$feishu_app_id" ]; then
        config_content=$(echo "$config_content" | yq eval ".feishu.app_id = \"$feishu_app_id\"" -)
    fi

    # Update database host
    config_content=$(echo "$config_content" | yq eval ".database.host = \"$db_host\"" -)

    # Update Redis host
    config_content=$(echo "$config_content" | yq eval ".redis.host = \"$redis_host\"" -)

    # Update database name to include tenant ID
    config_content=$(echo "$config_content" | yq eval ".database.name = \"opclaw_${tenant_id}\"" -)

    # Output configuration
    if [ "$DRY_RUN" = true ]; then
        echo
        echo "=============================================="
        echo "  Generated Configuration (Dry Run)"
        echo "=============================================="
        echo
        echo "$config_content"
        echo
        echo "=============================================="
        echo "  Configuration would be written to:"
        echo "  ${CONFIG_DIR}/${tenant_id}.yml"
        echo "=============================================="
    else
        local output_file="${CONFIG_DIR}/${tenant_id}.yml"
        echo "$config_content" > "$output_file"

        echo
        echo "=============================================="
        echo "  Configuration Generated Successfully"
        echo "=============================================="
        echo "Tenant ID: $tenant_id"
        echo "Tenant Name: $tenant_name"
        echo "Environment: $environment"
        echo "Tier: $tier"
        echo "Output File: $output_file"
        echo
        echo "Next steps:"
        echo "  1. Review the configuration file"
        echo "  2. Set environment variables for sensitive data"
        echo "  3. Validate with: ./validate-config.sh $output_file"
        echo "=============================================="
    fi
}

#==============================================================================
# Parse Arguments
#==============================================================================

parse_arguments() {
    local tenant_id=""
    local tenant_name=""
    local environment=""
    local tier=""
    local server_host=""
    local output_file=""

    # Check if no arguments provided
    if [ $# -eq 0 ]; then
        show_usage
        exit 1
    fi

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --interactive)
                INTERACTIVE_MODE=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --name)
                tenant_name="$2"
                shift 2
                ;;
            --environment)
                environment="$2"
                shift 2
                ;;
            --tier)
                tier="$2"
                shift 2
                ;;
            --server-host)
                server_host="$2"
                shift 2
                ;;
            --output)
                output_file="$2"
                shift 2
                ;;
            --help|-h)
                show_usage
                exit 0
                ;;
            -*)
                echo "Error: Unknown option: $1" >&2
                show_usage
                exit 1
                ;;
            *)
                if [ -z "$tenant_id" ]; then
                    tenant_id="$1"
                else
                    echo "Error: Multiple tenant IDs specified" >&2
                    show_usage
                    exit 1
                fi
                shift
                ;;
        esac
    done

    # Validate tenant ID
    if [ -z "$tenant_id" ]; then
        echo "Error: Tenant ID not specified" >&2
        show_usage
        exit 1
    fi

    validate_tenant_id "$tenant_id" || exit 1

    # Check if tenant already exists
    if tenant_exists "$tenant_id"; then
        if [ "$INTERACTIVE_MODE" = true ]; then
            local overwrite
            read -rp "Tenant '$tenant_id' already exists. Overwrite? [y/N]: " overwrite
            if [[ ! "$overwrite" =~ ^[Yy]$ ]]; then
                echo "Aborted."
                exit 0
            fi
        else
            echo "Error: Tenant '$tenant_id' already exists." >&2
            echo "Use --interactive to overwrite existing configuration." >&2
            exit 1
        fi
    fi

    # Export variables
    export ARG_TENANT_ID="$tenant_id"
    export ARG_TENANT_NAME="$tenant_name"
    export ARG_ENVIRONMENT="$environment"
    export ARG_TIER="$tier"
    export ARG_SERVER_HOST="$server_host"
    export ARG_OUTPUT_FILE="$output_file"
}

#==============================================================================
# Main Function
#==============================================================================

main() {
    # Check if template file exists
    if [ ! -f "$TEMPLATE_FILE" ]; then
        echo "Error: Template file not found: $TEMPLATE_FILE" >&2
        echo "Please ensure the template.yml exists in: $CONFIG_DIR" >&2
        exit 1
    fi

    # Check if yq is installed
    if ! command -v yq &> /dev/null; then
        echo "Error: yq is not installed." >&2
        echo "Install with: brew install yq (macOS) or visit https://github.com/mikefarah/yq#install" >&2
        exit 1
    fi

    # Parse arguments
    parse_arguments "$@"

    # Generate configuration
    if [ "$INTERACTIVE_MODE" = true ]; then
        generate_config_interactive "$ARG_TENANT_ID"
    else
        generate_config_non_interactive \
            "$ARG_TENANT_ID" \
            "$ARG_TENANT_NAME" \
            "$ARG_ENVIRONMENT" \
            "$ARG_TIER" \
            "$ARG_SERVER_HOST"
    fi
}

#==============================================================================
# Script Entry Point
#==============================================================================

main "$@"
