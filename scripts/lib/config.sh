#!/bin/bash
#==============================================================================
# Tenant Configuration Management Library
# (租户配置管理库)
#
# Purpose: Load, parse, validate, and manage tenant configurations
#
# Features:
# - YAML configuration parsing (using yq)
# - Environment variable expansion (${VAR} format)
# - Configuration validation
# - Placeholder detection (cli_xxxxxxxxxxxxx)
# - Integration with state database
# - Configuration snapshots
#
# Usage:
#   source /path/to/config.sh
#   load_tenant_config "/path/to/config.yml"
#   get_config_value "tenant.id"
#
# Dependencies:
# - yq (https://github.com/mikefarah/yq)
# - PostgreSQL client (psql) for database integration
#
# Version: 1.0
# Last Updated: 2026-03-19
#==============================================================================

#==============================================================================
# Configuration
#==============================================================================

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Configuration directories
CONFIG_DIR="${PROJECT_ROOT}/config/tenants"
SCHEMA_FILE="${CONFIG_DIR}/schema.json"
TEMPLATE_FILE="${CONFIG_DIR}/template.yml"

# State database configuration
STATE_DB_HOST="${STATE_DB_HOST:-localhost}"
STATE_DB_PORT="${STATE_DB_PORT:-5432}"
STATE_DB_NAME="${STATE_DB_NAME:-deployment_state}"
STATE_DB_USER="${STATE_DB_USER:-postgres}"
STATE_DB_PASSWORD="${STATE_DB_PASSWORD:-}"

# Placeholder patterns for detection
PLACEHOLDER_PATTERNS=(
    "cli_xxxxxxxxxxxxx"
    "CHANGE_THIS"
    "your-"
    "placeholder"
    "replace-in-config-page"
    "\${[^}]*\:-example\}"  # ${VAR:-example}
    "\${[^}]*\:-test\}"     # ${VAR:-test}
)

# Critical fields that cannot have placeholders
CRITICAL_FIELDS=(
    "feishu.app_id"
    "feishu.app_secret"
    "feishu.encrypt_key"
    "database.password"
    "jwt.secret"
    "agent.deepseek.api_key"
)

# Colors for output
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    MAGENTA='\033[0;35m'
    CYAN='\033[0;36m'
    NC='\033[0m' # No Color
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    MAGENTA=''
    CYAN=''
    NC=''
fi

#==============================================================================
# Logging Functions
#==============================================================================

log_config_info() {
    echo -e "${BLUE}[CONFIG INFO]${NC} $1" >&2
}

log_config_success() {
    echo -e "${GREEN}[CONFIG ✓]${NC} $1" >&2
}

log_config_warning() {
    echo -e "${YELLOW}[CONFIG ⚠]${NC} $1" >&2
}

log_config_error() {
    echo -e "${RED}[CONFIG ✗]${NC} $1" >&2
}

log_config_debug() {
    if [ "${CONFIG_DEBUG:-false}" = "true" ]; then
        echo -e "${CYAN}[CONFIG DEBUG]${NC} $1" >&2
    fi
}

#==============================================================================
# Utility Functions
#==============================================================================

# Get current timestamp in ISO 8601 format
get_timestamp() {
    date -u +"%Y-%m-%dT%H:%M:%SZ"
}

# Check if yq is installed and accessible
check_yq_installed() {
    if ! command -v yq &> /dev/null; then
        log_config_error "yq is not installed. Please install yq v4+"
        log_config_info "Install with: brew install yq (macOS) or https://github.com/mikefarah/yq#install"
        return 1
    fi

    # Check yq version (need v4+)
    local yq_version
    yq_version=$(yq --version 2>&1 | grep -oE 'version v([0-9]+)' | grep -oE '[0-9]+' || echo "0")
    if [ "${yq_version:-0}" -lt 4 ]; then
        log_config_error "yq version 4+ required. Current version: $yq_version"
        return 1
    fi

    return 0
}

# Check if config file exists
check_config_file() {
    local config_file=$1

    if [ ! -f "$config_file" ]; then
        log_config_error "Configuration file not found: $config_file"
        return 1
    fi

    return 0
}

# Expand environment variables in a string
expand_env_vars() {
    local value=$1
    local max_iterations=10
    local iteration=0

    while [[ "$value" == *'${'*'}'* ]] && [ $iteration -lt $max_iterations ]; do
        local new_value
        new_value=$(eval echo "$value" 2>/dev/null || echo "$value")

        if [ "$new_value" = "$value" ]; then
            break
        fi

        value="$new_value"
        ((iteration++))
    done

    echo "$value"
}

# Check if value contains placeholder pattern
is_placeholder_value() {
    local value=$1

    for pattern in "${PLACEHOLDER_PATTERNS[@]}"; do
        if [[ "$value" =~ $pattern ]]; then
            return 0  # Is placeholder
        fi
    done

    return 1  # Not a placeholder
}

# Check if field is critical
is_critical_field() {
    local field_path=$1

    for critical_field in "${CRITICAL_FIELDS[@]}"; do
        if [[ "$field_path" == *"$critical_field"* ]]; then
            return 0  # Is critical
        fi
    done

    return 1  # Not critical
}

#==============================================================================
# Configuration Loading Functions
#==============================================================================

# Load tenant configuration from YAML file
# Usage: load_tenant_config <config_file> [prefix]
# Returns: 0 on success, 1 on error
load_tenant_config() {
    local config_file=$1
    local prefix=${2:-"CONFIG"}

    check_yq_installed || return 1
    check_config_file "$config_file" || return 1

    log_config_info "Loading configuration from: $config_file"

    # Use yq to parse YAML and export as environment variables
    # This creates variables like CONFIG_TENANT_ID, CONFIG_SERVER_HOST, etc.
    local yaml_content
    yaml_content=$(cat "$config_file")

    # Extract tenant ID first
    local tenant_id
    tenant_id=$(echo "$yaml_content" | yq eval '.tenant.id // "unknown"' - 2>/dev/null)

    if [ "$tenant_id" = "null" ] || [ "$tenant_id" = "unknown" ]; then
        log_config_error "Invalid configuration: tenant.id is missing"
        return 1
    fi

    # Export tenant ID
    export "${prefix}_TENANT_ID=$tenant_id"
    log_config_debug "Tenant ID: $tenant_id"

    # Extract all configuration values and create environment variables
    # Format: CONFIG_<SECTION>_<KEY> (e.g., CONFIG_TENANT_NAME, CONFIG_SERVER_HOST)
    local sections
    sections=$(echo "$yaml_content" | yq eval 'keys | .[]' - 2>/dev/null)

    for section in $sections; do
        # Skip metadata sections
        if [[ "$section" == _* ]]; then
            continue
        fi

        local keys
        keys=$(echo "$yaml_content" | yq eval ".$section | keys | .[]" - 2>/dev/null)

        for key in $keys; do
            local value
            value=$(echo "$yaml_content" | yq eval ".$section.$key" - 2>/dev/null)

            # Skip null values
            if [ "$value" = "null" ]; then
                continue
            fi

            # Expand environment variables
            value=$(expand_env_vars "$value")

            # Create variable name (uppercase, with underscores)
            local var_name="${prefix}_${section^^}_${key^^}"
            var_name=${var_name//./_}  # Replace dots with underscores
            var_name=${var_name//-/_}  # Replace hyphens with underscores

            # Export variable
            export "$var_name=$value"
            log_config_debug "$var_name=$value"
        done
    done

    log_config_success "Configuration loaded successfully"
    return 0
}

# Get a specific configuration value
# Usage: get_config_value <config_file> <yaml_path>
# Example: get_config_value config.yml "tenant.id"
get_config_value() {
    local config_file=$1
    local yaml_path=$2

    check_yq_installed || return 1
    check_config_file "$config_file" || return 1

    local value
    value=$(yq eval ".$yaml_path" "$config_file" 2>/dev/null)

    if [ "$value" = "null" ]; then
        log_config_warning "Value not found: $yaml_path"
        return 1
    fi

    # Expand environment variables
    value=$(expand_env_vars "$value")

    echo "$value"
    return 0
}

# Get all configuration values as JSON
# Usage: get_config_json <config_file>
get_config_json() {
    local config_file=$1

    check_yq_installed || return 1
    check_config_file "$config_file" || return 1

    # Convert YAML to JSON and expand environment variables
    yq eval -o=json -I=0 "$config_file" 2>/dev/null
}

# List all tenant configurations
# Usage: list_tenant_configs [config_dir]
list_tenant_configs() {
    local config_dir=${1:-"$CONFIG_DIR"}

    if [ ! -d "$config_dir" ]; then
        log_config_error "Configuration directory not found: $config_dir"
        return 1
    fi

    log_config_info "Available tenant configurations:"

    # Find all .yml files (excluding template and test files)
    local configs
    configs=$(find "$config_dir" -maxdepth 1 -name "*.yml" -type f | grep -v -E "(template|test_)" | sort)

    if [ -z "$configs" ]; then
        log_config_warning "No tenant configurations found"
        return 0
    fi

    for config in $configs; do
        local basename
        basename=$(basename "$config" .yml)

        local tenant_id
        tenant_id=$(get_config_value "$config" "tenant.id" 2>/dev/null || echo "unknown")

        local tenant_name
        tenant_name=$(get_config_value "$config" "tenant.name" 2>/dev/null || echo "unknown")

        local environment
        environment=$(get_config_value "$config" "tenant.environment" 2>/dev/null || echo "unknown")

        echo "  - $basename (ID: $tenant_id, Name: $tenant_name, Env: $environment)"
    done

    return 0
}

#==============================================================================
# Configuration Validation Functions
#==============================================================================

# Validate configuration file
# Usage: validate_config <config_file>
validate_config() {
    local config_file=$1

    check_yq_installed || return 1
    check_config_file "$config_file" || return 1

    log_config_info "Validating configuration: $config_file"

    local has_errors=false
    local has_warnings=false

    # Check 1: Required top-level sections
    log_config_debug "Checking required sections..."
    local required_sections=("tenant" "server" "feishu" "database" "redis" "jwt" "agent")
    for section in "${required_sections[@]}"; do
        if ! yq eval ".$section" "$config_file" &>/dev/null; then
            log_config_error "Missing required section: $section"
            has_errors=true
        fi
    done

    # Check 2: Required fields in tenant section
    log_config_debug "Checking tenant section..."
    local tenant_required=("id" "name" "environment")
    for field in "${tenant_required[@]}"; do
        local value
        value=$(get_config_value "$config_file" "tenant.$field")
        if [ -z "$value" ] || [ "$value" = "null" ]; then
            log_config_error "Missing required field: tenant.$field"
            has_errors=true
        fi
    done

    # Check 3: Environment validation
    log_config_debug "Checking environment..."
    local environment
    environment=$(get_config_value "$config_file" "tenant.environment")
    if [[ ! "$environment" =~ ^(production|staging|development)$ ]]; then
        log_config_error "Invalid environment: $environment (must be production, staging, or development)"
        has_errors=true
    fi

    # Check 4: Feishu App ID format
    log_config_debug "Checking Feishu App ID..."
    local feishu_app_id
    feishu_app_id=$(get_config_value "$config_file" "feishu.app_id")
    if [[ ! "$feishu_app_id" =~ ^cli_[a-zA-Z0-9]+$ ]]; then
        log_config_error "Invalid Feishu App ID format: $feishu_app_id"
        has_errors=true
    fi

    # Check 5: Placeholder detection
    log_config_debug "Checking for placeholder values..."
    check_placeholders "$config_file" || has_warnings=true

    # Check 6: Critical fields validation
    log_config_debug "Checking critical fields..."
    check_critical_fields "$config_file" || has_errors=true

    # Check 7: Port numbers
    log_config_debug "Checking port numbers..."
    check_port_numbers "$config_file" || has_warnings=true

    # Check 8: URL formats
    log_config_debug "Checking URL formats..."
    check_url_formats "$config_file" || has_warnings=true

    # Summary
    echo
    if [ "$has_errors" = true ]; then
        log_config_error "Configuration validation FAILED with errors"
        return 1
    elif [ "$has_warnings" = true ]; then
        log_config_warning "Configuration validation PASSED with warnings"
        return 0
    else
        log_config_success "Configuration validation PASSED"
        return 0
    fi
}

# Check for placeholder values in configuration
check_placeholders() {
    local config_file=$1
    local has_placeholders=false

    log_config_debug "Scanning for placeholder patterns..."

    # Get all string values from YAML
    local values
    values=$(yq eval '.. | select(kind == "Scalar") | select(style == "single") | select(string_value != "null") | path' "$config_file" 2>/dev/null)

    # Check each value for placeholder patterns
    while IFS= read -r path; do
        if [ -z "$path" ]; then
            continue
        fi

        local value
        value=$(yq eval "$path" "$config_file" 2>/dev/null)

        if is_placeholder_value "$value"; then
            if is_critical_field "$path"; then
                log_config_error "CRITICAL: Placeholder value in $path: $value"
                has_placeholders=true
            else
                log_config_warning "Placeholder value in $path: $value"
                has_placeholders=true
            fi
        fi
    done <<< "$values"

    if [ "$has_placeholders" = true ]; then
        return 1
    fi

    return 0
}

# Check critical fields
check_critical_fields() {
    local config_file=$1
    local has_issues=false

    for field in "${CRITICAL_FIELDS[@]}"; do
        local value
        value=$(get_config_value "$config_file" "$field" 2>/dev/null)

        if [ -z "$value" ] || [ "$value" = "null" ]; then
            log_config_error "CRITICAL: Missing value for $field"
            has_issues=true
            continue
        fi

        if is_placeholder_value "$value"; then
            log_config_error "CRITICAL: Placeholder value in $field: $value"
            has_issues=true
        fi
    done

    if [ "$has_issues" = true ]; then
        return 1
    fi

    return 0
}

# Check port number validity
check_port_numbers() {
    local config_file=$1
    local has_issues=false

    local port_fields=(
        "server.api_port"
        "server.metrics_port"
        "database.port"
        "redis.port"
    )

    for field in "${port_fields[@]}"; do
        local value
        value=$(get_config_value "$config_file" "$field" 2>/dev/null)

        if [ -n "$value" ] && [ "$value" != "null" ]; then
            if ! [[ "$value" =~ ^[0-9]+$ ]] || [ "$value" -lt 1 ] || [ "$value" -gt 65535 ]; then
                log_config_warning "Invalid port number for $field: $value"
                has_issues=true
            fi
        fi
    done

    if [ "$has_issues" = true ]; then
        return 1
    fi

    return 0
}

# Check URL format validity
check_url_formats() {
    local config_file=$1
    local has_issues=false

    local url_fields=(
        "feishu.oauth_redirect_uri"
        "feishu.event_callback_url"
        "feishu.api_base_url"
    )

    for field in "${url_fields[@]}"; do
        local value
        value=$(get_config_value "$config_file" "$field" 2>/dev/null)

        if [ -n "$value" ] && [ "$value" != "null" ]; then
            if [[ ! "$value" =~ ^https?:// ]]; then
                log_config_warning "Invalid URL format for $field: $value"
                has_issues=true
            fi
        fi
    done

    if [ "$has_issues" = true ]; then
        return 1
    fi

    return 0
}

#==============================================================================
# Configuration Snapshot Functions
#==============================================================================

# Save configuration snapshot to state database
# Usage: save_config_snapshot <config_file> <deployment_id>
save_config_snapshot() {
    local config_file=$1
    local deployment_id=$2

    if [ -z "$deployment_id" ]; then
        log_config_error "Deployment ID is required for snapshot"
        return 1
    fi

    log_config_info "Saving configuration snapshot for deployment $deployment_id"

    # Read configuration file
    local config_content
    config_content=$(base64 < "$config_file" 2>/dev/null)

    if [ -z "$config_content" ]; then
        log_config_error "Failed to read configuration file"
        return 1
    fi

    # Save to database
    local sql_query
    sql_query="
        INSERT INTO deployment_config_snapshots (
            deployment_id,
            config_content,
            created_at
        ) VALUES (
            $deployment_id,
            '$config_content',
            NOW()
        );"

    if ! execute_sql "$sql_query"; then
        log_config_error "Failed to save configuration snapshot to database"
        return 1
    fi

    log_config_success "Configuration snapshot saved successfully"
    return 0
}

# Execute SQL query against state database
execute_sql() {
    local sql_query=$1

    if [ -z "$STATE_DB_PASSWORD" ]; then
        log_config_warning "Database password not set, skipping database operation"
        return 1
    fi

    PGPASSWORD="$STATE_DB_PASSWORD" psql \
        -h "$STATE_DB_HOST" \
        -p "$STATE_DB_PORT" \
        -U "$STATE_DB_USER" \
        -d "$STATE_DB_NAME" \
        -c "$sql_query" \
        &>/dev/null
}

#==============================================================================
# Export Functions
#==============================================================================

export -f log_config_info log_config_success log_config_warning log_config_error log_config_debug
export -f get_timestamp check_yq_installed check_config_file
export -f expand_env_vars is_placeholder_value is_critical_field
export -f load_tenant_config get_config_value get_config_json list_tenant_configs
export -f validate_config check_placeholders check_critical_fields
export -f check_port_numbers check_url_formats
export -f save_config_snapshot execute_sql
