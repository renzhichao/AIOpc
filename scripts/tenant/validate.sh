#!/opt/homebrew/bin/bash
#==============================================================================
# Tenant Configuration Validation Script
# (租户配置验证脚本)
#
# Purpose: Validate tenant configuration files against schema and best practices
#
# Usage:
#   scripts/tenant/validate.sh <tenant_id> [options]
#   --strict           Treat warnings as errors
#   --show-secrets     Show secret values in output
#   --output FILE      Write validation report to file
#   --format FORMAT    Output format (text|json) [default: text]
#
# Example:
#   scripts/tenant/validate.sh tenant_001
#   scripts/tenant/validate.sh tenant_001 --strict --output report.txt
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
source "${LIB_DIR}/validation.sh" 2>/dev/null || { echo "ERROR: validation.sh not found"; exit 1; }

# Default values
STRICT_MODE=false
SHOW_SECRETS=false
OUTPUT_FILE=""
OUTPUT_FORMAT="text"
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

Validate tenant configuration files against schema and best practices.

Arguments:
  tenant_id            Tenant ID (required)

Options:
  --strict             Treat warnings as errors
  --show-secrets       Show secret values in output
  --output FILE        Write validation report to file
  --format FORMAT      Output format (text|json) [default: text]
  -h, --help           Show this help message

Examples:
  ${0##*/} tenant_001
  ${0##*/} tenant_001 --strict --output report.txt
  ${0##*/} tenant_001 --format json

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

validate_tenant_exists() {
    local tenant_id=$1
    local config_file="${CONFIG_DIR}/${tenant_id}.yml"

    if [ ! -f "$config_file" ]; then
        log_error "Tenant not found: $tenant_id"
        log_error "Config file does not exist: $config_file"
        return 1
    fi

    return 0
}

run_validation() {
    local config_file=$1
    local strict_mode=$2

    local total_checks=0
    local passed_checks=0
    local failed_checks=0
    local warning_checks=0

    # Store output for later
    local validation_output=""
    validation_output+="Configuration: $config_file"$'\n'
    validation_output+="Timestamp: $(get_timestamp)"$'\n'
    validation_output+=$'\n'

    # Check 1: Basic structure
    echo "Checking basic structure..." >&2
    ((total_checks++))
    if validate_basic_structure "$config_file" 2>&1; then
        ((passed_checks++))
        validation_output+="✓ Basic structure: PASS"$'\n'
    else
        ((failed_checks++))
        validation_output+="✗ Basic structure: FAIL"$'\n'
    fi

    # Check 2: Required fields
    echo "Checking required fields..." >&2
    ((total_checks++))
    if validate_required_fields "$config_file" 2>&1; then
        ((passed_checks++))
        validation_output+="✓ Required fields: PASS"$'\n'
    else
        ((failed_checks++))
        validation_output+="✗ Required fields: FAIL"$'\n'
    fi

    # Check 3: Data types
    echo "Checking data types..." >&2
    ((total_checks++))
    if validate_data_types "$config_file" 2>&1; then
        ((passed_checks++))
        validation_output+="✓ Data types: PASS"$'\n'
    else
        ((failed_checks++))
        validation_output+="✗ Data types: FAIL"$'\n'
    fi

    # Check 4: Secret strength
    echo "Checking secret strength..." >&2
    ((total_checks++))
    if validate_secret_strength "$config_file" 2>&1; then
        ((passed_checks++))
        validation_output+="✓ Secret strength: PASS"$'\n'
    else
        if [ "$strict_mode" = "true" ]; then
            ((failed_checks++))
            validation_output+="✗ Secret strength: FAIL"$'\n'
        else
            ((warning_checks++))
            validation_output+="⚠ Secret strength: WARNING"$'\n'
        fi
    fi

    # Check 5: Network settings
    echo "Checking network settings..." >&2
    ((total_checks++))
    if validate_network_settings "$config_file" 2>&1; then
        ((passed_checks++))
        validation_output+="✓ Network settings: PASS"$'\n'
    else
        ((failed_checks++))
        validation_output+="✗ Network settings: FAIL"$'\n'
    fi

    # Check 6: File paths
    echo "Checking file paths..." >&2
    ((total_checks++))
    if validate_file_paths "$config_file" 2>&1; then
        ((passed_checks++))
        validation_output+="✓ File paths: PASS"$'\n'
    else
        ((failed_checks++))
        validation_output+="✗ File paths: FAIL"$'\n'
    fi

    # Check 7: Best practices (always warnings unless strict)
    echo "Checking best practices..." >&2
    ((total_checks++))
    if validate_best_practices "$config_file" 2>&1; then
        ((passed_checks++))
        validation_output+="✓ Best practices: PASS"$'\n'
    else
        if [ "$strict_mode" = "true" ]; then
            ((failed_checks++))
            validation_output+="✗ Best practices: FAIL"$'\n'
        else
            ((warning_checks++))
            validation_output+="⚠ Best practices: WARNING"$'\n'
        fi
    fi

    # Check 8: Consistency
    echo "Checking consistency..." >&2
    ((total_checks++))
    if validate_consistency "$config_file" 2>&1; then
        ((passed_checks++))
        validation_output+="✓ Consistency: PASS"$'\n'
    else
        if [ "$strict_mode" = "true" ]; then
            ((failed_checks++))
            validation_output+="✗ Consistency: FAIL"$'\n'
        else
            ((warning_checks++))
            validation_output+="⚠ Consistency: WARNING"$'\n'
        fi
    fi

    # Print summary
    validation_output+=$'\n'
    validation_output+="========================================"$'\n'
    validation_output+="  Validation Summary"$'\n'
    validation_output+="========================================"$'\n'
    validation_output+="Total Checks: $total_checks"$'\n'
    validation_output+="Passed: $passed_checks"$'\n'
    validation_output+="Failed: $failed_checks"$'\n'
    validation_output+="Warnings: $warning_checks"$'\n'

    # Determine overall result
    local result=0
    if [ $failed_checks -gt 0 ]; then
        validation_output+=$'\n'"Result: FAILED"
        result=1
    elif [ $warning_checks -gt 0 ]; then
        validation_output+=$'\n'"Result: PASSED with warnings"
        result=0
    else
        validation_output+=$'\n'"Result: PASSED all checks"
        result=0
    fi

    # Print validation output
    echo "$validation_output"

    # Return result
    return $result
}

output_json_result() {
    local config_file=$1
    local strict_mode=$2
    local result=0

    # Run validation and capture output
    local validation_output
    validation_output=$(validate_config_comprehensive "$config_file" 2>&1) || result=$?

    # Get tenant info
    local tenant_id
    tenant_id=$(get_config_value "$config_file" "tenant.id" 2>/dev/null)

    local tenant_name
    tenant_name=$(get_config_value "$config_file" "tenant.name" 2>/dev/null)

    local environment
    environment=$(get_config_value "$config_file" "tenant.environment" 2>/dev/null)

    # Generate JSON output
    cat << EOF
{
  "tenant_id": "$tenant_id",
  "tenant_name": "$tenant_name",
  "environment": "$environment",
  "config_file": "$config_file",
  "validated_at": "$(get_timestamp)",
  "strict_mode": $strict_mode,
  "result": $([ $result -eq 0 ] && echo "true" || echo "false"),
  "validation_output": $(echo "$validation_output" | jq -Rs .)
}
EOF
}

#==============================================================================
# Main Execution
#==============================================================================

main() {
    # Set strict mode from environment if provided
    export STRICT_MODE="${STRICT_MODE:-false}"

    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --strict)
                STRICT_MODE=true
                export STRICT_MODE
                shift
                ;;
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

    log_info "=== Tenant Configuration Validation ==="

    # Check if tenant exists
    validate_tenant_exists "$TENANT_ID" || exit 1

    # Get config file path
    local config_file="${CONFIG_DIR}/${TENANT_ID}.yml"

    log_info "Validating configuration: $config_file"

    # Run validation based on output format
    local result=0

    if [ "$OUTPUT_FORMAT" = "json" ]; then
        output_json_result "$config_file" "$STRICT_MODE" > "${OUTPUT_FILE:-/dev/stdout}" || result=$?
    else
        run_validation "$config_file" "$STRICT_MODE" > "${OUTPUT_FILE:-/dev/stdout}" || result=$?
    fi

    if [ -n "$OUTPUT_FILE" ]; then
        log_info "Validation report written to: $OUTPUT_FILE"
    fi

    if [ $result -eq 0 ]; then
        log_success "Validation passed"
    else
        log_error "Validation failed"
    fi

    exit $result
}

# Run main function
main "$@"
