#!/opt/homebrew/bin/bash
#==============================================================================
# Tenant Details Display Script
# (租户详情显示脚本)
#
# Purpose: Display detailed information about a specific tenant
#
# Usage:
#   scripts/tenant/show.sh <tenant_id> [options]
#   --show-secrets     Display sensitive values
#   --output FILE      Write to file
#   --format FORMAT    Output format (yaml|json|pretty) [default: pretty]
#
# Example:
#   scripts/tenant/show.sh tenant_001
#   scripts/tenant/show.sh tenant_001 --show-secrets
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

# Default values
SHOW_SECRETS=false
OUTPUT_FILE=""
OUTPUT_FORMAT="pretty"
TENANT_ID=""

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

Display detailed information about a specific tenant.

Arguments:
  tenant_id            Tenant ID (required)

Options:
  --show-secrets       Display sensitive values (passwords, keys, secrets)
  --output FILE        Write output to file
  --format FORMAT      Output format (yaml|json|pretty) [default: pretty]
  -h, --help           Show this help message

Examples:
  ${0##*/} tenant_001
  ${0##*/} tenant_001 --show-secrets
  ${0##*/} tenant_001 --format json --output tenant_info.json

EOF
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*" >&2
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

mask_secret() {
    local value=$1
    local length=${#value}

    if [ $length -le 8 ]; then
        echo "********"
    else
        echo "${value:0:4}...${value: -4}"
    fi
}

#==============================================================================
# Data Collection Functions
#==============================================================================

get_tenant_config() {
    local tenant_id=$1
    local config_file="${CONFIG_DIR}/${tenant_id}.yml"

    if [ ! -f "$config_file" ]; then
        log_error "Tenant configuration not found: $config_file"
        return 1
    fi

    echo "$config_file"
    return 0
}

get_tenant_database_info() {
    local tenant_id=$1

    # Initialize state database
    if ! state_init 2>/dev/null; then
        log_debug "Failed to initialize state database"
        return 1
    fi

    local sql_query
    sql_query="SELECT tenant_id, name, environment, tier, status, created_at, updated_at
    FROM tenants
    WHERE tenant_id = '$tenant_id';"

    local result
    if state_exec_sql "$sql_query" result 2>/dev/null; then
        echo "$result"
        return 0
    fi

    return 1
}

get_tenant_deployments() {
    local tenant_id=$1
    local limit=${2:-10}

    # Initialize state database
    if ! state_init 2>/dev/null; then
        return 1
    fi

    local sql_query
    sql_query="SELECT deployment_id, deployment_type, version, status, started_at, completed_at
    FROM deployments
    WHERE tenant_id = '$tenant_id'
    ORDER BY started_at DESC
    LIMIT $limit;"

    local result
    if state_exec_sql "$sql_query" result 2>/dev/null; then
        echo "$result"
        return 0
    fi

    return 1
}

get_tenant_health_checks() {
    local tenant_id=$1
    local limit=${2:-5}

    # Initialize state database
    if ! state_init 2>/dev/null; then
        return 1
    fi

    local sql_query
    sql_query="SELECT check_type, status, response_time_ms, checked_at
    FROM health_checks
    WHERE tenant_id = '$tenant_id'
    ORDER BY checked_at DESC
    LIMIT $limit;"

    local result
    if state_exec_sql "$sql_query" result 2>/dev/null; then
        echo "$result"
        return 0
    fi

    return 1
}

#==============================================================================
# Output Formatting Functions
#==============================================================================

output_pretty() {
    local tenant_id=$1
    local config_file=$2
    local db_info=$3
    local deployments=$4
    local health_checks=$5

    echo
    echo -e "${BOLD}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}  Tenant Details: $tenant_id${NC}"
    echo -e "${BOLD}════════════════════════════════════════════════════════════════${NC}"
    echo

    # Basic Information
    echo -e "${BOLD}Basic Information:${NC}"
    echo "  Tenant ID: $tenant_id"

    if [ -n "$db_info" ]; then
        local name=$(echo "$db_info" | cut -d'|' -f2)
        local environment=$(echo "$db_info" | cut -d'|' -f3)
        local tier=$(echo "$db_info" | cut -d'|' -f4)
        local status=$(echo "$db_info" | cut -d'|' -f5)
        local created_at=$(echo "$db_info" | cut -d'|' -f6)
        local updated_at=$(echo "$db_info" | cut -d'|' -f7)

        echo "  Name: $name"
        echo "  Environment: $environment"
        echo "  Tier: $tier"
        echo "  Status: $status"
        echo "  Created: $created_at"
        echo "  Updated: $updated_at"
    else
        local name=$(get_config_value "$config_file" "tenant.name" 2>/dev/null)
        local environment=$(get_config_value "$config_file" "tenant.environment" 2>/dev/null)

        echo "  Name: $name"
        echo "  Environment: $environment"
        echo "  Status: unknown (database not available)"
    fi

    echo

    # Server Configuration
    echo -e "${BOLD}Server Configuration:${NC}"
    local server_host=$(get_config_value "$config_file" "server.host" 2>/dev/null)
    local server_user=$(get_config_value "$config_file" "server.ssh_user" 2>/dev/null)
    local deploy_path=$(get_config_value "$config_file" "server.deploy_path" 2>/dev/null)
    local api_port=$(get_config_value "$config_file" "server.api_port" 2>/dev/null)

    echo "  Host: $server_host"
    echo "  SSH User: $server_user"
    echo "  Deploy Path: $deploy_path"
    echo "  API Port: $api_port"
    echo

    # Feishu Configuration
    echo -e "${BOLD}Feishu Integration:${NC}"
    local feishu_app_id=$(get_config_value "$config_file" "feishu.app_id" 2>/dev/null)
    local feishu_redirect=$(get_config_value "$config_file" "feishu.oauth_redirect_uri" 2>/dev/null)

    echo "  App ID: $feishu_app_id"
    echo "  OAuth Redirect: $feishu_redirect"

    if [ "$SHOW_SECRETS" = "true" ]; then
        local feishu_secret=$(get_config_value "$config_file" "feishu.app_secret" 2>/dev/null)
        echo "  App Secret: $feishu_secret"
    else
        echo "  App Secret: ******** (use --show-secrets to display)"
    fi
    echo

    # Database Configuration
    echo -e "${BOLD}Database Configuration:${NC}"
    local db_host=$(get_config_value "$config_file" "database.host" 2>/dev/null)
    local db_port=$(get_config_value "$config_file" "database.port" 2>/dev/null)
    local db_name=$(get_config_value "$config_file" "database.name" 2>/dev/null)
    local db_user=$(get_config_value "$config_file" "database.user" 2>/dev/null)

    echo "  Host: $db_host"
    echo "  Port: $db_port"
    echo "  Database: $db_name"
    echo "  User: $db_user"

    if [ "$SHOW_SECRETS" = "true" ]; then
        local db_password=$(get_config_value "$config_file" "database.password" 2>/dev/null)
        echo "  Password: $db_password"
    else
        echo "  Password: ******** (use --show-secrets to display)"
    fi
    echo

    # Agent Configuration
    echo -e "${BOLD}Agent Configuration:${NC}"
    local deepseek_model=$(get_config_value "$config_file" "agent.deepseek.model" 2>/dev/null)
    local deepseek_api=$(get_config_value "$config_file" "agent.deepseek.api_base_url" 2>/dev/null)

    echo "  Model: $deepseek_model"
    echo "  API Base: $deepseek_api"

    if [ "$SHOW_SECRETS" = "true" ]; then
        local deepseek_key=$(get_config_value "$config_file" "agent.deepseek.api_key" 2>/dev/null)
        echo "  API Key: $deepseek_key"
    else
        echo "  API Key: ******** (use --show-secrets to display)"
    fi
    echo

    # Deployment History
    if [ -n "$deployments" ]; then
        echo -e "${BOLD}Recent Deployments:${NC}"
        echo "$deployments" | while IFS='|' read -r dep_id dep_type version status started completed; do
            if [ -n "$dep_id" ]; then
                local status_color=""
                case $status in
                    success) status_color="${GREEN}" ;;
                    failed) status_color="${RED}" ;;
                    in_progress) status_color="${YELLOW}" ;;
                esac
                echo "  [$dep_id] $dep_type - $version"
                echo "      Status: ${status_color}${status}${NC}"
                echo "      Started: $started"
                echo
            fi
        done
    fi

    # Health Check History
    if [ -n "$health_checks" ]; then
        echo -e "${BOLD}Recent Health Checks:${NC}"
        echo "$health_checks" | while IFS='|' read -r check_type status response_time checked; do
            if [ -n "$check_type" ]; then
                local status_color=""
                case $status in
                    pass) status_color="${GREEN}" ;;
                    fail) status_color="${RED}" ;;
                    warning) status_color="${YELLOW}" ;;
                esac
                echo "  [$check_type] ${status_color}${status}${NC} (${response_time}ms) - $checked"
            fi
        done
        echo
    fi

    # Configuration File Location
    echo -e "${BOLD}Configuration File:${NC}"
    echo "  $config_file"
    echo
}

output_yaml() {
    local config_file=$1

    if [ "$SHOW_SECRETS" = "true" ]; then
        cat "$config_file"
    else
        # Mask secrets in YAML output
        local content
        content=$(cat "$config_file")

        # Mask common secret fields
        content=$(echo "$content" | sed 's/^\(.*app_secret:\).*/\1 ********/')
        content=$(echo "$content" | sed 's/^\(.*encrypt_key:\).*/\1 ********/')
        content=$(echo "$content" | sed 's/^\(.*password:\).*/\1 ********/')
        content=$(echo "$content" | sed 's/^\(.*secret:\).*/\1 ********/')
        content=$(echo "$content" | sed 's/^\(.*api_key:\).*/\1 ********/')

        echo "$content"
    fi
}

output_json() {
    local config_file=$1

    if [ "$SHOW_SECRETS" = "true" ]; then
        yq eval -o=json -I=0 "$config_file" 2>/dev/null
    else
        # Mask secrets in JSON output
        local json_content
        json_content=$(yq eval -o=json -I=0 "$config_file" 2>/dev/null)

        # Mask common secret fields (simple approach)
        json_content=$(echo "$json_content" | jq 'walk(if type == "object" then (
            if has("app_secret") or has("encrypt_key") or has("password") or has("secret") or has("api_key") then
                with_entries(if .key | test("app_secret|encrypt_key|password|secret|api_key") then .value = "********" else . end)
            else
                .
            end)
        else . end)')

        echo "$json_content"
    fi
}

#==============================================================================
# Main Execution
#==============================================================================

main() {
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --show-secrets)
                SHOW_SECRETS=true
                shift
                ;;
            --output)
                OUTPUT_FILE="$2"
                shift 2
                ;;
            --format)
                OUTPUT_FORMAT="$2"
                shift 2
                ;;
            -h|--help)
                print_usage
                exit 0
                ;;
            -*)
                echo "Unknown option: $1" >&2
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

    log_debug "Fetching tenant details for: $TENANT_ID"

    # Get tenant config file
    local config_file
    config_file=$(get_tenant_config "$TENANT_ID") || exit 1

    # Get tenant database info
    local db_info
    db_info=$(get_tenant_database_info "$TENANT_ID") || true

    # Get deployment history
    local deployments
    deployments=$(get_tenant_deployments "$TENANT_ID" 5) || true

    # Get health check history
    local health_checks
    health_checks=$(get_tenant_health_checks "$TENANT_ID" 5) || true

    # Generate output
    local output
    case $OUTPUT_FORMAT in
        pretty)
            output_pretty "$TENANT_ID" "$config_file" "$db_info" "$deployments" "$health_checks" > "${OUTPUT_FILE:-/dev/stdout}"
            ;;
        yaml)
            output_yaml "$config_file" > "${OUTPUT_FILE:-/dev/stdout}"
            ;;
        json)
            output_json "$config_file" > "${OUTPUT_FILE:-/dev/stdout}"
            ;;
        *)
            log_error "Unknown output format: $OUTPUT_FORMAT"
            exit 1
            ;;
    esac

    if [ -n "$OUTPUT_FILE" ]; then
        log_info "Output written to: $OUTPUT_FILE"
    fi
}

# Run main function
main "$@"
