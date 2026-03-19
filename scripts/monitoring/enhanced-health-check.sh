#!/bin/bash
#==============================================================================
# Enhanced Health Check - Multi-Layer System Health Verification
#==============================================================================
# Purpose: Comprehensive health checking with layered verification and retry logic
#
# Layers:
#   1. HTTP Health Check - Backend endpoint responding with 200
#   2. Database Connection Check - PostgreSQL accepting connections
#   3. Database Query Test - PostgreSQL executing queries
#   4. OAuth Configuration Validation - Feishu OAuth configured
#   5. Redis Connection Check - Redis cache service operational
#
# Features:
# - 3 retries with exponential backoff (1s, 2s, 4s)
# - Structured JSON and human-readable output
# - Overall health status (healthy/warning/critical)
# - Per-layer status with timestamps
# - Actionable error messages
# - Execution time tracking
#
# Usage:
#   ./enhanced-health-check.sh [options]
#
# Options:
#   --json              Output in JSON format
#   --verbose           Show detailed information
#   --quick             Skip non-critical checks
#   --layer N           Run only specific layer (1-5)
#   --no-retry          Disable retry logic
#   --timeout N         Timeout per layer in seconds (default: 10)
#
# Exit codes:
#   0: All checks passed (healthy)
#   1: Some checks failed (warning/critical)
#   2: Configuration error
#   3: Timeout error
#==============================================================================

#==============================================================================
# Configuration
#==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$(dirname "$SCRIPT_DIR")/lib"
LAYERS_DIR="$SCRIPT_DIR"

# Source health check library
source "$LIB_DIR/health-check.sh"

# Retry configuration
MAX_RETRIES=${MAX_RETRIES:-3}
INITIAL_BACKOFF=${INITIAL_BACKOFF:-1}
BACKOFF_MULTIPLIER=${BACKOFF_MULTIPLIER:-2}

# Timeout configuration
LAYER_TIMEOUT=${LAYER_TIMEOUT:-10}
TOTAL_TIMEOUT=${TOTAL_TIMEOUT:-60}

# Execution mode
QUICK_MODE=${QUICK_MODE:-false}
SPECIFIC_LAYER=${SPECIFIC_LAYER:-0}
ENABLE_RETRY=${ENABLE_RETRY:-true}

# Layer scripts
LAYER1_SCRIPT="$LAYERS_DIR/health-check-layer1.sh"
LAYER2_SCRIPT="$LAYERS_DIR/health-check-layer2.sh"
LAYER3_SCRIPT="$LAYERS_DIR/health-check-layer3.sh"
LAYER4_SCRIPT="$LAYERS_DIR/health-check-layer4.sh"
LAYER5_SCRIPT="$LAYERS_DIR/health-check-layer5.sh"

#==============================================================================
# Functions
#==============================================================================

# Display usage information
show_usage() {
    cat <<EOF
Enhanced Health Check - Multi-Layer System Health Verification

Usage: $0 [options]

Options:
  --json              Output in JSON format
  --verbose           Show detailed information
  --quick             Skip non-critical checks
  --layer N           Run only specific layer (1-5)
  --no-retry          Disable retry logic
  --timeout N         Timeout per layer in seconds (default: 10)

Layers:
  1. HTTP Health Check - Backend endpoint responding with 200
  2. Database Connection - PostgreSQL accepting connections
  3. Database Query Test - PostgreSQL executing queries
  4. OAuth Configuration - Feishu OAuth configured
  5. Redis Connection - Redis cache service operational

Exit codes:
  0: All checks passed (healthy)
  1: Some checks failed (warning/critical)
  2: Configuration error

Examples:
  $0                              # Run all checks
  $0 --json                       # JSON output
  $0 --layer 1                    # Run only layer 1
  $0 --quick                      # Skip non-critical checks
  $0 --verbose --no-retry         # Verbose, no retries

EOF
}

# Execute a layer with retry logic
execute_layer() {
    local layer_num=$1
    local layer_script=$2
    local layer_name=$3

    local start_time=$(date +%s%3N)
    local output=""
    local exit_code=1
    local attempt=1

    # Build command arguments
    local cmd_args=""
    [[ "$JSON_OUTPUT" = true ]] && cmd_args="$cmd_args --json"
    [[ "$VERBOSE" = true ]] && cmd_args="$cmd_args --verbose"

    if [ "$ENABLE_RETRY" = true ]; then
        # Execute with retry logic
        while [ $attempt -le $MAX_RETRIES ]; do
            if [ "$JSON_OUTPUT" = false ]; then
                log_info "Layer $layer_num: $layer_name (attempt $attempt/$MAX_RETRIES)"
            fi

            output=$($layer_script $cmd_args 2>&1)
            exit_code=$?

            if [ $exit_code -eq 0 ]; then
                break
            fi

            if [ $attempt -lt $MAX_RETRIES ]; then
                # Calculate exponential backoff: 1s, 2s, 4s
                local delay=$((INITIAL_BACKOFF * (BACKOFF_MULTIPLIER ** (attempt - 1))))
                if [ "$JSON_OUTPUT" = false ]; then
                    log_retry "Layer $layer_num: $layer_name failed, retrying in ${delay}s..."
                fi
                sleep $delay
            fi

            ((attempt++))
        done
    else
        # Execute without retry
        output=$($layer_script $cmd_args 2>&1)
        exit_code=$?
    fi

    local end_time=$(date +%s%3N)
    local execution_time=$((end_time - start_time))

    # Determine layer status
    local status="fail"
    if [ $exit_code -eq 0 ]; then
        status="pass"
    fi

    # Output result
    if [ "$JSON_OUTPUT" = false ]; then
        echo
    fi
    output_health_result \
        "layer$layer_num" \
        "$status" \
        "$layer_name" \
        "$(echo "$output" | tail -1)" \
        $execution_time

    return $exit_code
}

# Calculate overall health status
calculate_overall_status() {
    local total_checks=$1
    local passed_checks=$2
    local failed_checks=$3

    if [ $failed_checks -eq 0 ]; then
        echo "healthy"
    elif [ $failed_checks -eq 1 ]; then
        echo "warning"
    else
        echo "critical"
    fi
}

#==============================================================================
# Main Execution
#==============================================================================

main() {
    local total_checks=0
    local passed_checks=0
    local failed_checks=0
    local overall_status="healthy"
    local final_exit_code=0
    local total_execution_time=0
    local script_start_time=$(date +%s%3N)

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --help|-h)
                show_usage
                exit 0
                ;;
            --json)
                JSON_OUTPUT=true
                shift
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            --quick)
                QUICK_MODE=true
                shift
                ;;
            --layer)
                SPECIFIC_LAYER="$2"
                if ! [[ "$SPECIFIC_LAYER" =~ ^[1-5]$ ]]; then
                    log_error "Invalid layer number: $SPECIFIC_LAYER"
                    exit 2
                fi
                shift 2
                ;;
            --no-retry)
                ENABLE_RETRY=false
                shift
                ;;
            --timeout)
                LAYER_TIMEOUT="$2"
                shift 2
                ;;
            *)
                log_error "Unknown option: $1"
                show_usage
                exit 2
                ;;
        esac
    done

    # Start JSON output if enabled
    if [ "$JSON_OUTPUT" = true ]; then
        json_start
        json_add_timestamp "check_start"
        json_add_field "timeout_per_layer" "$LAYER_TIMEOUT"
        json_add_field "max_retries" "$MAX_RETRIES"
        json_add_field "retry_enabled" "$ENABLE_RETRY"
        json_add_field "quick_mode" "$QUICK_MODE"
    fi

    # Display header
    if [ "$JSON_OUTPUT" = false ]; then
        echo
        echo "============================================================"
        echo "  Enhanced Health Check - Multi-Layer Verification"
        echo "============================================================"
        echo
        echo "Started: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
        echo "Timeout per layer: ${LAYER_TIMEOUT}s"
        echo "Retry logic: $([ "$ENABLE_RETRY" = true ] && echo "enabled (max ${MAX_RETRIES} retries)" || echo "disabled")"
        echo "Quick mode: $QUICK_MODE"
        echo
    fi

    # Execute layers
    if [ "$SPECIFIC_LAYER" -gt 0 ]; then
        # Execute specific layer only
        case $SPECIFIC_LAYER in
            1)
                execute_layer 1 "$LAYER1_SCRIPT" "HTTP Health Check" || { failed_checks=1; final_exit_code=1; }
                total_checks=1
                passed_checks=$((total_checks - failed_checks))
                ;;
            2)
                execute_layer 2 "$LAYER2_SCRIPT" "Database Connection Check" || { failed_checks=1; final_exit_code=1; }
                total_checks=1
                passed_checks=$((total_checks - failed_checks))
                ;;
            3)
                execute_layer 3 "$LAYER3_SCRIPT" "Database Query Test" || { failed_checks=1; final_exit_code=1; }
                total_checks=1
                passed_checks=$((total_checks - failed_checks))
                ;;
            4)
                execute_layer 4 "$LAYER4_SCRIPT" "OAuth Configuration Validation" || { failed_checks=1; final_exit_code=1; }
                total_checks=1
                passed_checks=$((total_checks - failed_checks))
                ;;
            5)
                execute_layer 5 "$LAYER5_SCRIPT" "Redis Connection Check" || { failed_checks=1; final_exit_code=1; }
                total_checks=1
                passed_checks=$((total_checks - failed_checks))
                ;;
        esac
    else
        # Execute all layers
        if [ "$JSON_OUTPUT" = false ]; then
            log_section "Layer 1: HTTP Health Check"
        fi
        ((total_checks++))
        if execute_layer 1 "$LAYER1_SCRIPT" "HTTP Health Check"; then
            ((passed_checks++))
        else
            ((failed_checks++))
            final_exit_code=1
        fi

        if [ "$JSON_OUTPUT" = false ]; then
            echo
            log_section "Layer 2: Database Connection Check"
        fi
        ((total_checks++))
        if execute_layer 2 "$LAYER2_SCRIPT" "Database Connection Check"; then
            ((passed_checks++))
        else
            ((failed_checks++))
            final_exit_code=1
        fi

        if [ "$QUICK_MODE" = false ]; then
            if [ "$JSON_OUTPUT" = false ]; then
                echo
                log_section "Layer 3: Database Query Test"
            fi
            ((total_checks++))
            if execute_layer 3 "$LAYER3_SCRIPT" "Database Query Test"; then
                ((passed_checks++))
            else
                ((failed_checks++))
                final_exit_code=1
            fi
        fi

        if [ "$JSON_OUTPUT" = false ]; then
            echo
            log_section "Layer 4: OAuth Configuration Validation"
        fi
        ((total_checks++))
        if execute_layer 4 "$LAYER4_SCRIPT" "OAuth Configuration Validation"; then
            ((passed_checks++))
        else
            ((failed_checks++))
            final_exit_code=1
        fi

        if [ "$JSON_OUTPUT" = false ]; then
            echo
            log_section "Layer 5: Redis Connection Check"
        fi
        ((total_checks++))
        if execute_layer 5 "$LAYER5_SCRIPT" "Redis Connection Check"; then
            ((passed_checks++))
        else
            ((failed_checks++))
            final_exit_code=1
        fi
    fi

    # Calculate total execution time
    local script_end_time=$(date +%s%3N)
    total_execution_time=$((script_end_time - script_start_time))

    # Calculate overall status
    overall_status=$(calculate_overall_status $total_checks $passed_checks $failed_checks)

    # Output final status
    if [ "$JSON_OUTPUT" = false ]; then
        output_final_status "$overall_status" "$total_checks" "$passed_checks" "$failed_checks" "$total_execution_time"
    else
        output_final_status "$overall_status" "$total_checks" "$passed_checks" "$failed_checks" "$total_execution_time"
    fi

    exit $final_exit_code
}

# Run main function
main "$@"
