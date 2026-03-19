#!/bin/bash
#==============================================================================
# Tenant Configuration Validation Script
# (租户配置验证脚本)
#
# Purpose: Validate tenant configuration files against schema and best practices
#
# Usage:
#   ./validate-config.sh <config_file> [options]
#
# Options:
#   --comprehensive    Run comprehensive validation (default)
#   --schema           Validate against JSON schema only
#   --quick           Run quick validation (basic checks only)
#   --report          Generate validation report
#   --debug           Enable debug output
#   --strict          Enable strict mode (warnings become errors)
#
# Examples:
#   ./validate-config.sh config/tenants/test_tenant_alpha.yml
#   ./validate-config.sh config/tenants/production.yml --comprehensive --report
#   ./validate-config.sh config/tenants/staging.yml --quick
#
# Version: 1.0
# Last Updated: 2026-03-19
#==============================================================================

set -euo pipefail

# Script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
LIB_DIR="${PROJECT_ROOT}/scripts/lib"

# Source required libraries
source "${LIB_DIR}/config.sh"
source "${LIB_DIR}/validation.sh"

#==============================================================================
# Script Configuration
#==============================================================================

VALIDATION_MODE="${VALIDATION_MODE:-comprehensive}"
GENERATE_REPORT="${GENERATE_REPORT:-false}"
STRICT_MODE="${STRICT_MODE:-false}"
DEBUG_MODE="${DEBUG_MODE:-false}"

#==============================================================================
# Usage and Help
#==============================================================================

show_usage() {
    cat <<EOF
Usage: $(basename "$0") <config_file> [options]

Validate tenant configuration files.

Arguments:
  config_file          Path to tenant configuration YAML file

Options:
  --comprehensive      Run comprehensive validation (default)
  --schema            Validate against JSON schema only
  --quick             Run quick validation (basic checks only)
  --report            Generate validation report
  --debug             Enable debug output
  --strict            Enable strict mode (warnings become errors)
  --help, -h          Show this help message

Examples:
  $(basename "$0") config/tenants/test_tenant_alpha.yml
  $(basename "$0") config/tenants/production.yml --comprehensive --report
  $(basename "$0") config/tenants/staging.yml --quick

EOF
}

#==============================================================================
# Parse Arguments
#==============================================================================

parse_arguments() {
    local config_file=""

    # Check if no arguments provided
    if [ $# -eq 0 ]; then
        show_usage
        exit 1
    fi

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --comprehensive)
                VALIDATION_MODE="comprehensive"
                shift
                ;;
            --schema)
                VALIDATION_MODE="schema"
                shift
                ;;
            --quick)
                VALIDATION_MODE="quick"
                shift
                ;;
            --report)
                GENERATE_REPORT=true
                shift
                ;;
            --debug)
                DEBUG_MODE=true
                export CONFIG_DEBUG=true
                shift
                ;;
            --strict)
                STRICT_MODE=true
                export STRICT_MODE=true
                shift
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
                config_file="$1"
                shift
                ;;
        esac
    done

    # Validate config file argument
    if [ -z "$config_file" ]; then
        echo "Error: Configuration file not specified" >&2
        show_usage
        exit 1
    fi

    # Resolve relative paths
    if [[ ! "$config_file" = /* ]]; then
        config_file="${PROJECT_ROOT}/${config_file}"
    fi

    echo "$config_file"
}

#==============================================================================
# Validation Modes
#==============================================================================

run_quick_validation() {
    local config_file=$1

    log_config_info "Running quick validation..."

    local checks=0
    local passed=0

    # Basic structure check
    ((checks++))
    if validate_basic_structure "$config_file"; then
        ((passed++))
    fi

    # Required fields check
    ((checks++))
    if validate_required_fields "$config_file"; then
        ((passed++))
    fi

    # Data types check
    ((checks++))
    if validate_data_types "$config_file"; then
        ((passed++))
    fi

    echo
    echo "Quick Validation: $passed/$checks checks passed"

    if [ $passed -eq $checks ]; then
        return 0
    else
        return 1
    fi
}

run_schema_validation() {
    local config_file=$1
    local schema_file="${SCHEMA_FILE}"

    if [ ! -f "$schema_file" ]; then
        log_config_warning "Schema file not found: $schema_file"
        log_config_info "Skipping schema validation"
        return 0
    fi

    log_config_info "Validating against JSON schema..."

    if validate_against_schema "$config_file" "$schema_file"; then
        return 0
    else
        return 1
    fi
}

run_comprehensive_validation() {
    local config_file=$1

    log_config_info "Running comprehensive validation..."

    if validate_config_comprehensive "$config_file"; then
        return 0
    else
        return 1
    fi
}

#==============================================================================
# Report Generation
#==============================================================================

create_validation_report() {
    local config_file=$1
    local exit_code=$2

    # Generate report filename
    local basename
    basename=$(basename "$config_file" .yml)
    local report_file="${PROJECT_ROOT}/claudedocs/validation_report_${basename}_$(date +%Y%m%d_%H%M%S).txt"

    # Generate report
    generate_validation_report "$config_file" "$report_file"

    # Add exit code to report
    {
        echo
        echo "Exit Code: $exit_code"
        if [ $exit_code -eq 0 ]; then
            echo "Result: PASSED"
        else
            echo "Result: FAILED"
        fi
    } >> "$report_file"

    log_config_info "Validation report saved to: $report_file"
}

#==============================================================================
# Main Function
#==============================================================================

main() {
    local config_file
    config_file=$(parse_arguments "$@")

    echo
    echo "=============================================="
    echo "  Tenant Configuration Validation"
    echo "=============================================="
    echo "Configuration: $config_file"
    echo "Validation Mode: $VALIDATION_MODE"
    echo "Strict Mode: $STRICT_MODE"
    echo "Debug Mode: $DEBUG_MODE"
    echo

    # Check if config file exists
    if [ ! -f "$config_file" ]; then
        log_config_error "Configuration file not found: $config_file"
        exit 1
    fi

    # Run validation based on mode
    local exit_code=0

    case $VALIDATION_MODE in
        quick)
            run_quick_validation "$config_file" || exit_code=$?
            ;;
        schema)
            run_schema_validation "$config_file" || exit_code=$?
            ;;
        comprehensive)
            run_comprehensive_validation "$config_file" || exit_code=$?
            ;;
        *)
            log_config_error "Unknown validation mode: $VALIDATION_MODE"
            exit 1
            ;;
    esac

    # Generate report if requested
    if [ "$GENERATE_REPORT" = true ]; then
        create_validation_report "$config_file" $exit_code
    fi

    echo

    # Handle strict mode
    if [ "$STRICT_MODE" = true ] && [ $exit_code -ne 0 ]; then
        log_config_error "Validation failed in strict mode"
        exit 1
    fi

    exit $exit_code
}

#==============================================================================
# Script Entry Point
#==============================================================================

main "$@"
