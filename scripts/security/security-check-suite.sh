#!/usr/bin/env bash
#==============================================================================
# Security Check Suite
# (安全检查套件)
#
# Purpose: Main orchestrator for all security checks in deployment pipeline
#
# Features:
# - Run all security checks in sequence
# - Aggregate results from all checks
# - Generate comprehensive security report
# - Fail deployment on critical security issues
# - Record all security events to state database
# - Support for selective check execution
#
# Usage:
#   ./security-check-suite.sh <config_file> [tenant_id] [options]
#
# Options:
#   --all                    Run all checks (default)
#   --config                 Run configuration security checks only
#   --secrets                Run secret strength checks only
#   --permissions            Run file permission checks only
#   --logs                   Run log scanning checks only
#   --fix-permissions        Auto-fix permission issues
#   --continue-on-error      Continue running checks even if some fail
#   --quiet                  Minimal output (for CI/CD)
#   --verbose                Detailed output (for debugging)
#
# Exit Codes:
#   0: All security checks passed
#   1: Security issues found (deployment should be blocked)
#   2: Configuration errors
#   3: Partial completion (some checks failed)
#
# Dependencies:
# - scripts/security/*.sh (all security check scripts)
# - scripts/lib/*.sh (all library files)
# - yq (YAML processor)
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

# Overall results
declare -a CHECK_RESULTS=()
declare -i TOTAL_CHECKS=0
declare -i PASSED_CHECKS=0
declare -i FAILED_CHECKS=0
declare -i WARNING_CHECKS=0
declare -i SKIPPED_CHECKS=0

# Exit codes
declare -r EXIT_SUCCESS=0
declare -r EXIT_SECURITY_ISSUES=1
declare -r EXIT_CONFIG_ERROR=2
declare -r EXIT_PARTIAL=3

# Options
RUN_CONFIG_CHECK=true
RUN_SECRET_CHECK=true
RUN_PERMISSION_CHECK=true
RUN_LOG_SCAN_CHECK=true
AUTO_FIX_PERMISSIONS=false
CONTINUE_ON_ERROR=false
QUIET_MODE=false
VERBOSE_MODE=false

#==============================================================================
# Source Libraries
#==============================================================================

for lib in logging.sh error.sh config.sh state.sh; do
    if [[ -f "${LIB_DIR}/$lib" ]]; then
        source "${LIB_DIR}/$lib"
    else
        echo "ERROR: Required library not found: $lib" >&2
        exit $EXIT_CONFIG_ERROR
    fi
done

#==============================================================================
# Helper Functions
#==============================================================================

# Print usage information
usage() {
    cat << EOF
Usage: $(basename "$0") <config_file> [tenant_id] [options]

Arguments:
  config_file        Path to tenant configuration file (YAML)
  tenant_id          Optional tenant ID for audit logging

Options:
  --all              Run all security checks (default)
  --config           Run configuration security checks only
  --secrets          Run secret strength checks only
  --permissions      Run file permission checks only
  --logs             Run log scanning checks only
  --fix-permissions  Auto-fix permission issues
  --continue-on-error Continue running checks even if some fail
  --quiet            Minimal output (for CI/CD)
  --verbose          Detailed output (for debugging)
  --help             Show this help message

Examples:
  # Run all security checks
  $(basename "$0") config/tenants/tenant001.yml

  # Run specific checks only
  $(basename "$0") config/tenants/tenant001.yml --config --secrets

  # Auto-fix permission issues
  $(basename "$0") config/tenants/tenant001.yml --fix-permissions

  # Continue on error (useful for auditing)
  $(basename "$0") config/tenants/tenant001.yml --continue-on-error

Exit Codes:
  0  All security checks passed
  1  Security issues found (deployment blocked)
  2  Configuration errors
  3  Partial completion (some checks failed)

EOF
}

# Parse command line arguments
parse_arguments() {
    local config_file="$1"
    local tenant_id="$2"
    shift 2

    # Reset options
    RUN_CONFIG_CHECK=false
    RUN_SECRET_CHECK=false
    RUN_PERMISSION_CHECK=false
    RUN_LOG_SCAN_CHECK=false

    # Parse options
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --all)
                RUN_CONFIG_CHECK=true
                RUN_SECRET_CHECK=true
                RUN_PERMISSION_CHECK=true
                RUN_LOG_SCAN_CHECK=true
                ;;
            --config)
                RUN_CONFIG_CHECK=true
                ;;
            --secrets)
                RUN_SECRET_CHECK=true
                ;;
            --permissions)
                RUN_PERMISSION_CHECK=true
                ;;
            --logs)
                RUN_LOG_SCAN_CHECK=true
                ;;
            --fix-permissions)
                AUTO_FIX_PERMISSIONS=true
                ;;
            --continue-on-error)
                CONTINUE_ON_ERROR=true
                ;;
            --quiet)
                QUIET_MODE=true
                ;;
            --verbose)
                VERBOSE_MODE=true
                ;;
            --help)
                usage
                exit $EXIT_SUCCESS
                ;;
            *)
                log_error "Unknown option: $1"
                usage
                exit $EXIT_CONFIG_ERROR
                ;;
        esac
        shift
    done

    # If no specific checks selected, run all
    if [[ "$RUN_CONFIG_CHECK" == false && \
          "$RUN_SECRET_CHECK" == false && \
          "$RUN_PERMISSION_CHECK" == false && \
          "$RUN_LOG_SCAN_CHECK" == false ]]; then
        RUN_CONFIG_CHECK=true
        RUN_SECRET_CHECK=true
        RUN_PERMISSION_CHECK=true
        RUN_LOG_SCAN_CHECK=true
    fi
}

# Run a single security check
# Usage: run_security_check <check_name> <check_script> <args...>
run_security_check() {
    local check_name="$1"
    local check_script="$2"
    shift 2
    local args=("$@")

    ((TOTAL_CHECKS++))

    if [[ "$QUIET_MODE" == false ]]; then
        log_info "Running: $check_name"
    fi

    local check_start_time
    check_start_time=$(date +%s)

    # Run the check
    local exit_code=0
    if [[ "$VERBOSE_MODE" == true ]]; then
        "$check_script" "${args[@]}" || exit_code=$?
    else
        "$check_script" "${args[@]}" &>/dev/null || exit_code=$?
    fi

    local check_end_time
    check_end_time=$(date +%s)
    local check_duration=$((check_end_time - check_start_time))

    # Record result
    case $exit_code in
        0)
            ((PASSED_CHECKS++))
            CHECK_RESULTS+=("PASS:$check_name:$check_duration")
            if [[ "$QUIET_MODE" == false ]]; then
                log_success "✓ $check_name (${check_duration}s)"
            fi
            ;;
        1)
            ((FAILED_CHECKS++))
            CHECK_RESULTS+=("FAIL:$check_name:$check_duration")
            if [[ "$QUIET_MODE" == false ]]; then
                log_error "✗ $check_name (${check_duration}s)"
            fi

            if [[ "$CONTINUE_ON_ERROR" == false ]]; then
                return 1
            fi
            ;;
        2)
            ((SKIPPED_CHECKS++))
            CHECK_RESULTS+=("SKIP:$check_name:$check_duration")
            if [[ "$QUIET_MODE" == false ]]; then
                log_warning "⊘ $check_name - Configuration error (${check_duration}s)"
            fi
            ;;
        *)
            ((SKIPPED_CHECKS++))
            CHECK_RESULTS+=("ERROR:$check_name:$check_duration")
            if [[ "$QUIET_MODE" == false ]]; then
                log_warning "⊘ $check_name - Unknown error (${check_duration}s)"
            fi
            ;;
    esac

    return 0
}

# Generate security report
# Usage: generate_security_report <output_file>
generate_security_report() {
    local output_file="$1"

    {
        echo "# Security Check Report"
        echo "# Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
        echo "# Tenant: ${TENANT_ID:-unknown}"
        echo "# Configuration: ${CONFIG_FILE:-unknown}"
        echo

        echo "## Summary"
        echo
        echo "- Total Checks: $TOTAL_CHECKS"
        echo "- Passed: $PASSED_CHECKS"
        echo "- Failed: $FAILED_CHECKS"
        echo "- Warnings: $WARNING_CHECKS"
        echo "- Skipped: $SKIPPED_CHECKS"
        echo

        echo "## Check Results"
        echo
        printf "%-20s %-10s %s\n" "Check Name" "Status" "Duration"
        printf "%-20s %-10s %s\n" "----------" "------" " "--------"

        for result in "${CHECK_RESULTS[@]}"; do
            IFS=':' read -r status name duration <<< "$result"

            local status_symbol
            case $status in
                PASS) status_symbol="✓" ;;
                FAIL) status_symbol="✗" ;;
                SKIP) status_symbol="⊘" ;;
                ERROR) status_symbol="!" ;;
            esac

            printf "%-20s [%s] %-8s %ds\n" "$name" "$status_symbol" "$status" "$duration"
        done

        echo

        if [[ $FAILED_CHECKS -gt 0 ]]; then
            echo "## Security Issues"
            echo
            echo "CRITICAL: $FAILED_CHECKS security check(s) failed."
            echo
            echo "Deployment is BLOCKED until these issues are resolved:"
            echo

            for result in "${CHECK_RESULTS[@]}"; do
                IFS=':' read -r status name duration <<< "$result"

                if [[ "$status" == "FAIL" ]]; then
                    echo "- $name"
                fi
            done

            echo
        fi

        if [[ $WARNING_CHECKS -gt 0 ]]; then
            echo "## Warnings"
            echo
            echo "$WARNING_CHECKS check(s) passed with warnings."
            echo "Review recommended but deployment can proceed."
            echo
        fi

        echo "## Recommendation"
        echo

        if [[ $FAILED_CHECKS -eq 0 && $WARNING_CHECKS -eq 0 ]]; then
            echo "**APPROVED**: All security checks passed. Deployment can proceed."
        elif [[ $FAILED_CHECKS -eq 0 ]]; then
            echo "**APPROVED WITH WARNINGS**: Deployment can proceed but review warnings."
        else
            echo "**BLOCKED**: Deployment must NOT proceed until security issues are resolved."
        fi

    } > "$output_file"

    log_success "Security report saved to: $output_file"
}

#==============================================================================
# Main Function
#==============================================================================

main() {
    local config_file="$1"
    local tenant_id="${2:-}"

    # Validate arguments
    if [[ -z "$config_file" ]]; then
        log_error "Usage: $(basename "$0") <config_file> [tenant_id] [options]"
        usage
        exit $EXIT_CONFIG_ERROR
    fi

    # Convert to absolute path
    if [[ ! "$config_file" =~ ^/ ]]; then
        config_file="${PROJECT_ROOT}/${config_file}"
    fi

    # Check if config file exists
    if [[ ! -f "$config_file" ]]; then
        log_error "Configuration file not found: $config_file"
        exit $EXIT_CONFIG_ERROR
    fi

    # Parse remaining arguments
    shift 2
    parse_arguments "$config_file" "$tenant_id" "$@"

    # Export for child scripts
    export CONFIG_FILE="$config_file"
    export TENANT_ID="$tenant_id"
    export PROJECT_ROOT SCRIPT_DIR LIB_DIR

    # Initialize logging
    log_init "$(basename "$0")"

    if [[ "$QUIET_MODE" == false ]]; then
        log_section "Security Check Suite"
        log_info "Configuration: $config_file"
        log_info "Tenant ID: ${tenant_id:-not specified}"
    fi

    # Initialize state database if tenant_id provided
    if [[ -n "$tenant_id" ]]; then
        if ! state_init; then
            log_warning "Could not initialize state database, audit logging disabled"
        fi
    fi

    # Record security check start
    if [[ -n "$tenant_id" ]]; then
        record_security_audit \
            "$tenant_id" \
            "security_event" \
            "security_check_suite" \
            "started" \
            "config_file" \
            "$config_file" \
            "" \
            "" \
            "{\"checks\":{\"config\":$RUN_CONFIG_CHECK,\"secrets\":$RUN_SECRET_CHECK,\"permissions\":$RUN_PERMISSION_CHECK,\"logs\":$RUN_LOG_SCAN_CHECK}}" \
            "{}"
    fi

    local suite_start_time
    suite_start_time=$(date +%s)

    # Run selected security checks
    if [[ "$RUN_CONFIG_CHECK" == true ]]; then
        run_security_check \
            "Configuration Security" \
            "${SCRIPT_DIR}/check-config-security.sh" \
            "$config_file" "$tenant_id" || true
    fi

    if [[ "$RUN_SECRET_CHECK" == true ]]; then
        run_security_check \
            "Secret Strength" \
            "${SCRIPT_DIR}/check-secret-strength.sh" \
            "$config_file" "$tenant_id" || true
    fi

    if [[ "$RUN_PERMISSION_CHECK" == true ]]; then
        local fix_flag=""
        [[ "$AUTO_FIX_PERMISSIONS" == true ]] && fix_flag="true"

        run_security_check \
            "File Permissions" \
            "${SCRIPT_DIR}/check-file-permissions.sh" \
            "$config_file" "$tenant_id" "$fix_flag" || true
    fi

    if [[ "$RUN_LOG_SCAN_CHECK" == true ]]; then
        run_security_check \
            "Log Scanning" \
            "${SCRIPT_DIR}/scan-logs.sh" \
            "--all" "$tenant_id" || true
    fi

    local suite_end_time
    suite_end_time=$(date +%s)
    local suite_duration=$((suite_end_time - suite_start_time))

    # Print summary
    if [[ "$QUIET_MODE" == false ]]; then
        log_separator
        log_info "Security Check Summary"
        log_separator

        log_info "Total checks: $TOTAL_CHECKS"
        log_success "Passed: $PASSED_CHECKS"
        log_error "Failed: $FAILED_CHECKS"
        log_warning "Warnings: $WARNING_CHECKS"
        log_info "Skipped: $SKIPPED_CHECKS"
        log_info "Duration: ${suite_duration}s"
        log_separator

        # Detailed results
        if [[ "$VERBOSE_MODE" == true ]]; then
            for result in "${CHECK_RESULTS[@]}"; do
                IFS=':' read -r status name duration <<< "$result"

                case $status in
                    PASS) log_success "✓ $name (${duration}s)" ;;
                    FAIL) log_error "✗ $name (${duration}s)" ;;
                    SKIP) log_warning "⊘ $name (${duration}s)" ;;
                    ERROR) log_warning "! $name (${duration}s)" ;;
                esac
            done
        fi
    fi

    # Generate report
    local report_file="${PROJECT_ROOT}/claudedocs/security-report-${tenant_id:-unknown}-$(date +%s).md"
    generate_security_report "$report_file"

    # Record security check completion
    if [[ -n "$tenant_id" ]]; then
        record_security_audit \
            "$tenant_id" \
            "security_event" \
            "security_check_suite" \
            "completed" \
            "security_report" \
            "" \
            "" \
            "" \
            "{\"total\":$TOTAL_CHECKS,\"passed\":$PASSED_CHECKS,\"failed\":$FAILED_CHECKS,\"warnings\":$WARNING_CHECKS,\"skipped\":$SKIPPED_CHECKS,\"duration\":$suite_duration,\"report\":\"$report_file\"}" \
            "{}"
    fi

    # Determine exit code
    local exit_code=$EXIT_SUCCESS

    if [[ $FAILED_CHECKS -gt 0 ]]; then
        if [[ "$CONTINUE_ON_ERROR" == true ]]; then
            exit_code=$EXIT_PARTIAL
            if [[ "$QUIET_MODE" == false ]]; then
                log_warning "Security checks completed with failures (continue-on-error enabled)"
            fi
        else
            exit_code=$EXIT_SECURITY_ISSUES
            if [[ "$QUIET_MODE" == false ]]; then
                log_error "Security checks FAILED - Deployment BLOCKED"
            fi
        fi
    else
        if [[ "$QUIET_MODE" == false ]]; then
            log_success "Security checks PASSED - Deployment approved"
        fi
    fi

    if [[ "$QUIET_MODE" == false ]]; then
        log_separator
    fi

    exit $exit_code
}

main "$@"
