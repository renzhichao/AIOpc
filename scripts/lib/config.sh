#!/bin/bash
#==============================================================================
# Configuration Drift Detection Library
#==============================================================================
# Purpose: Detect and report configuration drift between Git and running containers
#
# Features:
# - Compare Git config vs Remote file config vs Container environment
# - Severity classification (critical/major/minor)
# - Placeholder detection (cli_xxxxxxxxxxxxx)
# - Database integration for drift history
# - JSON and human-readable output
#
# Usage:
#   source /path/to/config.sh
#   detect_config_drift "git_config_path" "container_name"
#==============================================================================

#==============================================================================
# Configuration
#==============================================================================

# Severity levels
SEVERITY_CRITICAL=0
SEVERITY_MAJOR=1
SEVERITY_MINOR=2

# Drift types
DRIFT_TYPE_ADDED="added"
DRIFT_TYPE_DELETED="deleted"
DRIFT_TYPE_MODIFIED="modified"
DRIFT_TYPE_PLACEHOLDER="placeholder"

# Known placeholder patterns
PLACEHOLDER_PATTERNS=(
    "cli_xxxxxxxxxxxxx"
    "CHANGE_THIS"
    "your-"
    "placeholder"
    "replace-in-config-page"
)

# Whitelist for expected differences (format: "variable_name:expected_value1:expected_value2")
WHITELIST=(
    "PATH::"  # PATH always differs
    "HOSTNAME::"  # Container hostname varies
    "HOME::"  # Home paths differ
    "NODE_VERSION::"  # Build-time vars
    "YARN_VERSION::"  # Build-time vars
)

# Critical variables that must match exactly
CRITICAL_VARS=(
    "FEISHU_APP_ID"
    "FEISHU_APP_SECRET"
    "JWT_SECRET"
    "DB_PASSWORD"
    "REDIS_PASSWORD"
)

# Colors for output
JSON_OUTPUT="${JSON_OUTPUT:-false}"
if [ "$JSON_OUTPUT" = false ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    MAGENTA='\033[0;35m'
    NC='\033[0m' # No Color
fi

#==============================================================================
# Logging Functions
#==============================================================================

log_drift_info() {
    if [ "$JSON_OUTPUT" = false ]; then
        echo -e "${BLUE}[DRIFT INFO]${NC} $1" >&2
    fi
}

log_drift_critical() {
    if [ "$JSON_OUTPUT" = false ]; then
        echo -e "${RED}[CRITICAL DRIFT]${NC} $1" >&2
    fi
}

log_drift_major() {
    if [ "$JSON_OUTPUT" = false ]; then
        echo -e "${MAGENTA}[MAJOR DRIFT]${NC} $1" >&2
    fi
}

log_drift_minor() {
    if [ "$JSON_OUTPUT" = false ]; then
        echo -e "${YELLOW}[MINOR DRIFT]${NC} $1" >&2
    fi
}

log_no_drift() {
    if [ "$JSON_OUTPUT" = false ]; then
        echo -e "${GREEN}[✓]${NC} $1" >&2
    fi
}

#==============================================================================
# Utility Functions
#==============================================================================

# Get current timestamp in ISO 8601 format
get_timestamp() {
    date -u +"%Y-%m-%dT%H:%M:%SZ"
}

# Check if value is a placeholder
is_placeholder() {
    local value=$1

    for pattern in "${PLACEHOLDER_PATTERNS[@]}"; do
        if [[ "$value" == *"$pattern"* ]]; then
            return 0  # Is placeholder
        fi
    done

    return 1  # Not a placeholder
}

# Check if variable is in whitelist
is_whitelisted() {
    local var_name=$1
    local git_value=$2
    local running_value=$3

    for entry in "${WHITELIST[@]}"; do
        IFS=':' read -r whitelist_var whitelist_git whitelist_running <<< "$entry"

        if [ "$var_name" = "$whitelist_var" ]; then
            # Check if both values match whitelist expectations
            if [ -z "$whitelist_git" ] || [ "$git_value" = "$whitelist_git" ]; then
                if [ -z "$whitelist_running" ] || [ "$running_value" = "$whitelist_running" ]; then
                    return 0  # Is whitelisted
                fi
            fi
        fi
    done

    return 1  # Not whitelisted
}

# Check if variable is critical
is_critical_var() {
    local var_name=$1

    for critical_var in "${CRITICAL_VARS[@]}"; do
        if [ "$var_name" = "$critical_var" ]; then
            return 0  # Is critical
        fi
    done

    return 1  # Not critical
}

# Sanitize value for logging (hide secrets)
sanitize_value() {
    local var_name=$1
    local value=$2

    # Don't log sensitive values
    if [[ "$var_name" =~ *(SECRET|PASSWORD|KEY|TOKEN)* ]]; then
        if [ ${#value} -gt 8 ]; then
            echo "${value:0:4}****${value: -4}"
        else
            echo "****"
        fi
    else
        echo "$value"
    fi
}

# Parse .env file and output as "VAR_NAME|value" lines (using | as delimiter to avoid = in values)
parse_env_file() {
    local file_path=$1

    if [ ! -f "$file_path" ]; then
        return 1
    fi

    # Use grep to find lines with VAR=VALUE pattern, skip comments
    grep -E '^[A-Z_][A-Z0-9_]*=' "$file_path" 2>/dev/null | while IFS='=' read -r name value; do
        # Skip comments
        [[ "$name" =~ ^#.*$ ]] && continue

        # Remove leading/trailing whitespace from value and name
        name=$(echo "$name" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        value=$(echo "$value" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

        # Skip if name or value is empty
        [ -z "$name" ] && continue
        [ -z "$value" ] && continue

        # Output with | delimiter to avoid issues with = in values
        echo "$name|$value"
    done

    return 0
}

# Compare two values and determine drift type and severity
compare_values() {
    local var_name=$1
    local git_value=$2
    local running_value=$3

    # Check if value is placeholder
    if is_placeholder "$git_value"; then
        echo "$DRIFT_TYPE_PLACEHOLDER:$SEVERITY_CRITICAL"
        return 0
    fi

    # Check if values are the same
    if [ "$git_value" = "$running_value" ]; then
        echo "none:$SEVERITY_MINOR"
        return 0
    fi

    # Check if whitelisted
    if is_whitelisted "$var_name" "$git_value" "$running_value"; then
        echo "whitelisted:$SEVERITY_MINOR"
        return 0
    fi

    # Determine severity based on variable type
    if is_critical_var "$var_name"; then
        echo "$DRIFT_TYPE_MODIFIED:$SEVERITY_CRITICAL"
    elif [[ "$var_name" =~ *(REDIRECT_URI|CORS|ORIGIN)* ]]; then
        echo "$DRIFT_TYPE_MODIFIED:$SEVERITY_MAJOR"
    else
        echo "$DRIFT_TYPE_MODIFIED:$SEVERITY_MINOR"
    fi

    return 0
}

#==============================================================================
# Configuration Comparison Functions
#==============================================================================

# Load environment variables from a source (file or container)
load_env_vars() {
    local source=$1
    local source_type=$2  # "file" or "container"

    declare -A env_vars

    if [ "$source_type" = "file" ]; then
        # Load from file
        if [ -f "$source" ]; then
            while IFS='=' read -r name value; do
                [[ "$name" =~ ^#.*$ ]] && continue
                [[ -z "$name" ]] && continue
                value=$(echo "$value" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
                [ -z "$value" ] && continue
                env_vars["$name"]="$value"
            done < "$source"
        fi
    elif [ "$source_type" = "container" ]; then
        # Load from container
        local container_vars
        container_vars=$(docker exec "$source" printenv 2>/dev/null || echo "")

        while IFS='=' read -r name value; do
            [[ -z "$name" ]] && continue
            env_vars["$name"]="$value"
        done <<< "$container_vars"
    fi

    # Return associative array as space-separated list
    for name in "${!env_vars[@]}"; do
        echo "$name|${env_vars[$name]}"
    done
}

# Detect configuration drift
detect_config_drift() {
    local git_config_path=$1
    local remote_config_path=$2
    local container_name=$3
    local output_file=${4:-""}

    # Load configurations
    local git_vars=()
    local remote_vars=()
    local container_vars=()

    log_drift_info "Loading Git configuration from: $git_config_path"
    while IFS='|' read -r name value; do
        git_vars["$name"]="$value"
    done < <(parse_env_file "$git_config_path")

    log_drift_info "Loading remote file configuration from: $remote_config_path"
    if [ -f "$remote_config_path" ]; then
        while IFS='|' read -r name value; do
            remote_vars["$name"]="$value"
        done < <(parse_env_file "$remote_config_path")
    fi

    log_drift_info "Loading container environment from: $container_name"
    while IFS='|' read -r name value; do
        container_vars["$name"]="$value"
    done < <(load_env_vars "$container_name" "container")

    # Compare configurations
    local drift_detected=false
    local drift_count=0
    local critical_count=0
    local major_count=0
    local minor_count=0

    declare -a drift_reports

    # Check for variables in Git vs Container
    for var_name in "${!git_vars[@]}"; do
        local git_value="${git_vars[$var_name]}"
        local container_value="${container_vars[$var_name]:-}"

        if [ -z "$container_value" ]; then
            # Variable exists in Git but not in container
            if is_critical_var "$var_name"; then
                drift_reports+=("DELETED|$var_name|$git_value||critical|Variable exists in Git but missing from container")
                ((critical_count++))
            else
                drift_reports+=("DELETED|$var_name|$git_value||minor|Variable exists in Git but missing from container")
                ((minor_count++))
            fi
            ((drift_count++))
            drift_detected=true
        else
            # Variable exists in both, compare values
            local comparison
            comparison=$(compare_values "$var_name" "$git_value" "$container_value")
            IFS=':' read -r drift_type severity <<< "$comparison"

            if [ "$drift_type" != "none" ] && [ "$drift_type" != "whitelisted" ]; then
                local severity_text
                case $severity in
                    $SEVERITY_CRITICAL) severity_text="critical" ;;
                    $SEVERITY_MAJOR) severity_text="major" ;;
                    $SEVERITY_MINOR) severity_text="minor" ;;
                esac

                drift_reports+=("$drift_type|$var_name|$git_value|$container_value|$severity_text|Configuration drift detected")
                ((drift_count++))
                drift_detected=true

                case $severity in
                    $SEVERITY_CRITICAL) ((critical_count++)) ;;
                    $SEVERITY_MAJOR) ((major_count++)) ;;
                    $SEVERITY_MINOR) ((minor_count++)) ;;
                esac
            fi
        fi
    done

    # Check for variables in Container but not in Git (added variables)
    for var_name in "${!container_vars[@]}"; do
        if [ -z "${git_vars[$var_name]:-}" ]; then
            local container_value="${container_vars[$var_name]}"
            if ! is_whitelisted "$var_name" "" "$container_value"; then
                drift_reports+=("ADDED|$var_name||$container_value|minor|Variable exists in container but not in Git config")
                ((drift_count++))
                ((minor_count++))
                drift_detected=true
            fi
        fi
    done

    # Generate report
    if [ "$JSON_OUTPUT" = false ]; then
        echo
        echo "============================================================"
        echo "  Configuration Drift Detection Report"
        echo "============================================================"
        echo "Check Time: $(get_timestamp)"
        echo "Git Config: $git_config_path"
        echo "Remote Config: $remote_config_path"
        echo "Container: $container_name"
        echo
        echo "Summary:"
        echo "  Total Drifts: $drift_count"
        echo "  - Critical: $critical_count"
        echo "  - Major: $major_count"
        echo "  - Minor: $minor_count"
        echo
    fi

    # Output drift details
    if [ $drift_detected = true ]; then
        if [ "$JSON_OUTPUT" = false ]; then
            echo "Drift Details:"
            echo "------------------------------------------------------------"
        fi

        # Sort drift reports by severity (critical first)
        IFS=$'\n' sorted_reports=($(sort -t'|' -k5 -r <<<"${drift_reports[*]}"))

        for report in "${sorted_reports[@]}"; do
            IFS='|' read -r drift_type var_name git_val running_val severity message <<< "$report"

            if [ "$JSON_OUTPUT" = false ]; then
                # Human-readable output
                case $severity in
                    critical)
                        log_drift_critical "$var_name"
                        ;;
                    major)
                        log_drift_major "$var_name"
                        ;;
                    minor)
                        log_drift_minor "$var_name"
                        ;;
                esac

                echo "  Type: $drift_type"
                echo "  Git Value: $(sanitize_value "$var_name" "$git_val")"
                [ -n "$running_val" ] && echo "  Running Value: $(sanitize_value "$var_name" "$running_val")"
                echo "  Message: $message"
                echo
            else
                # JSON output
                cat <<EOF
  {
    "variable": "$var_name",
    "drift_type": "$drift_type",
    "severity": "$severity",
    "git_value": "$(sanitize_value "$var_name" "$git_val")",
    "running_value": "$(sanitize_value "$var_name" "$running_val")",
    "message": "$message"
  },
EOF
            fi
        done
    else
        log_no_drift "No configuration drift detected"
    fi

    # Write to output file if specified
    if [ -n "$output_file" ]; then
        {
            echo "# Configuration Drift Report"
            echo "# Generated: $(get_timestamp)"
            echo
            echo "Summary:"
            echo "  Total Drifts: $drift_count"
            echo "  - Critical: $critical_count"
            echo "  - Major: $major_count"
            echo "  - Minor: $minor_count"
            echo
            if [ $drift_detected = true ]; then
                echo "Drift Details:"
                for report in "${drift_reports[@]}"; do
                    IFS='|' read -r drift_type var_name git_val running_val severity message <<< "$report"
                    echo "  [$severity] $var_name"
                    echo "    Type: $drift_type"
                    echo "    Git: $(sanitize_value "$var_name" "$git_val")"
                    [ -n "$running_val" ] && echo "    Running: $(sanitize_value "$var_name" "$running_val")"
                    echo "    Message: $message"
                    echo
                done
            fi
        } > "$output_file"
        log_drift_info "Report saved to: $output_file"
    fi

    # Return exit code based on severity
    if [ $critical_count -gt 0 ]; then
        return 2  # Critical drift detected
    elif [ $major_count -gt 0 ]; then
        return 1  # Major drift detected
    else
        return 0  # No significant drift
    fi
}

#==============================================================================
# Export Functions
#==============================================================================

export -f log_drift_info log_drift_critical log_drift_major log_drift_minor log_no_drift
export -f get_timestamp is_placeholder is_whitelisted is_critical_var sanitize_value
export -f parse_env_file compare_values load_env_vars detect_config_drift
