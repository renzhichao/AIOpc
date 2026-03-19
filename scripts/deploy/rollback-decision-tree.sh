#!/bin/bash

#==============================================================================
# Rollback Decision Tree Script
#==============================================================================
# Evaluates deployment health and determines if rollback is necessary
# based on the rollback decision tree logic
#
# Features:
# - Automatic health check evaluation
# - Rollback decision based on failure type and deployment age
# - Integration with enhanced health check system
# - Automatic rollback execution when criteria met
# - Detailed logging and audit trail
#
# Usage:
#   ./rollback-decision-tree.sh --auto          # Automatic mode
#   ./rollback-decision-tree.sh --manual        # Manual mode with prompts
#   ./rollback-decision-tree.sh --check-only    # Check only, no action
#
#==============================================================================

set -e  # Exit on error
set -u  # Exit on undefined variable
set -o pipefail  # Exit on pipe failure

#------------------------------------------------------------------------------
# Configuration
#------------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="${PROJECT_ROOT}/rollback-decision.log"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Thresholds
CRITICAL_TIME_THRESHOLD=900  # 15 minutes in seconds
HEALTH_CHECK_TIMEOUT=60

# Deployment settings
DEPLOY_USER=${DEPLOY_USER:-root}
DEPLOY_HOST=${DEPLOY_HOST:-118.25.0.190}
DEPLOY_PATH=${DEPLOY_PATH:-/opt/opclaw}

# Options
MODE="check"
AUTO_ROLLBACK_ENABLED=false
FORCE_ROLLBACK=false
VERBOSE=false

#------------------------------------------------------------------------------
# Logging Functions
#------------------------------------------------------------------------------

log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${timestamp} [${level}] ${message}" | tee -a "$LOG_FILE"
}

info() {
    echo -e "${BLUE}[INFO]${NC} $*"
    log "INFO" "$*"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
    log "SUCCESS" "$*"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*"
    log "WARNING" "$*"
}

error() {
    echo -e "${RED}[ERROR]${NC} $*"
    log "ERROR" "$*"
}

decision() {
    echo -e "${BLUE}[DECISION]${NC} $*"
    log "DECISION" "$*"
}

#------------------------------------------------------------------------------
# SSH Wrapper Function
#------------------------------------------------------------------------------

ssh_exec() {
    local command="$*"
    ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
        -o ConnectTimeout=10 -o ServerAliveInterval=5 \
        -i ~/.ssh/rap001_opclaw \
        "${DEPLOY_USER}@${DEPLOY_HOST}" "$command" 2>&1
}

#------------------------------------------------------------------------------
# Health Check Functions
#------------------------------------------------------------------------------

run_health_check() {
    info "Running enhanced health check..."

    local health_output
    local health_json

    # Run health check and capture output
    if health_output=$("${PROJECT_ROOT}/scripts/monitoring/enhanced-health-check.sh" --json 2>&1); then
        health_json=$(echo "$health_output" | tail -1)
        echo "$health_json" > "/tmp/health-check-${TIMESTAMP}.json"
        success "Health check completed"
        echo "$health_json"
        return 0
    else
        error "Health check failed"
        echo "$health_output"
        return 1
    fi
}

parse_health_status() {
    local health_json="$1"

    # Parse overall status
    local overall_status
    overall_status=$(echo "$health_json" | grep -o '"overall_status":"[^"]*"' | cut -d'"' -f4)

    # Count failed layers
    local failed_layers
    failed_layers=$(echo "$health_json" | grep -o '"status":"fail"' | wc -l)

    # Check which layers failed
    local layer1_failed
    local layer2_failed
    local layer3_failed

    layer1_failed=$(echo "$health_json" | grep '"layer":"layer1"' | grep -o '"status":"fail"' || echo "")
    layer2_failed=$(echo "$health_json" | grep '"layer":"layer2"' | grep -o '"status":"fail"' || echo "")
    layer3_failed=$(echo "$health_json" | grep '"layer":"layer3"' | grep -o '"status":"fail"' || echo "")

    # Export variables for use in decision tree
    export HEALTH_OVERALL_STATUS="$overall_status"
    export HEALTH_FAILED_LAYERS="$failed_layers"
    export HEALTH_LAYER1_FAILED="$layer1_failed"
    export HEALTH_LAYER2_FAILED="$layer2_failed"
    export HEALTH_LAYER3_FAILED="$layer3_failed"
}

#------------------------------------------------------------------------------
# Deployment Age Functions
#------------------------------------------------------------------------------

get_deployment_age() {
    info "Determining deployment age..."

    # Get latest backup timestamp
    local latest_backup
    latest_backup=$(ssh_exec "ls -t ${DEPLOY_PATH}/backups/ 2>/dev/null | grep '^backup_' | head -n 1" || echo "")

    if [ -z "$latest_backup" ]; then
        warning "Could not determine deployment age"
        export DEPLOYMENT_AGE_SECONDS=999999
        return 1
    fi

    # Extract timestamp from backup name
    local backup_timestamp
    backup_timestamp=$(echo "$latest_backup" | sed 's/backup_//' | sed 's/_//g')

    # Convert to seconds since epoch
    local backup_epoch
    backup_epoch=$(date -j -f "%Y%m%d%H%M%S" "$backup_timestamp" "+%s" 2>/dev/null || echo "0")

    if [ "$backup_epoch" -eq 0 ]; then
        warning "Could not parse backup timestamp"
        export DEPLOYMENT_AGE_SECONDS=999999
        return 1
    fi

    local current_epoch
    current_epoch=$(date "+%s")

    local age_seconds
    age_seconds=$((current_epoch - backup_epoch))

    export DEPLOYMENT_AGE_SECONDS=$age_seconds

    info "Deployment age: $age_seconds seconds ($((age_seconds / 60)) minutes)"

    return 0
}

#------------------------------------------------------------------------------
# Decision Tree Functions
#------------------------------------------------------------------------------

evaluate_failure_type() {
    decision "Evaluating failure type..."

    local failure_type="unknown"

    # Critical system failure
    if [ -n "$HEALTH_LAYER1_FAILED" ] && [ -n "$HEALTH_LAYER3_FAILED" ]; then
        failure_type="critical_system"
        decision "Detected: CRITICAL SYSTEM FAILURE (HTTP + Database)"
    elif [ -n "$HEALTH_LAYER1_FAILED" ]; then
        failure_type="http_failure"
        decision "Detected: HTTP Health Check Failure"
    elif [ -n "$HEALTH_LAYER3_FAILED" ]; then
        failure_type="database_failure"
        decision "Detected: Database Query Failure"
    elif [ "$HEALTH_FAILED_LAYERS" -gt 0 ]; then
        failure_type="partial_failure"
        decision "Detected: Partial Failure ($HEALTH_FAILED_LAYERS layers failed)"
    else
        failure_type="no_failure"
        decision "Detected: No Failure"
    fi

    export FAILURE_TYPE="$failure_type"
}

evaluate_rollback_needed() {
    decision "Evaluating rollback necessity..."

    local rollback_needed=false
    local rollback_reason=""

    # No failure - no rollback needed
    if [ "$HEALTH_OVERALL_STATUS" = "healthy" ]; then
        decision "Decision: NO ROLLBACK NEEDED (system healthy)"
        export ROLLBACK_NEEDED=false
        return 0
    fi

    # Critical failure within threshold - automatic rollback
    if [ "$FAILURE_TYPE" = "critical_system" ] && [ "$DEPLOYMENT_AGE_SECONDS" -lt "$CRITICAL_TIME_THRESHOLD" ]; then
        rollback_needed=true
        rollback_reason="Critical system failure within 15 minutes"
        decision "Decision: AUTOMATIC ROLLBACK RECOMMENDED"
        decision "Reason: $rollback_reason"

    # Critical failure beyond threshold - manual decision
    elif [ "$FAILURE_TYPE" = "critical_system" ]; then
        rollback_needed=true
        rollback_reason="Critical system failure (beyond automatic threshold)"
        decision "Decision: MANUAL ROLLBACK DECISION REQUIRED"
        decision "Reason: $rollback_reason"

    # HTTP failure within threshold - automatic rollback
    elif [ "$FAILURE_TYPE" = "http_failure" ] && [ "$DEPLOYMENT_AGE_SECONDS" -lt "$CRITICAL_TIME_THRESHOLD" ]; then
        rollback_needed=true
        rollback_reason="HTTP failure within 15 minutes"
        decision "Decision: AUTOMATIC ROLLBACK RECOMMENDED"
        decision "Reason: $rollback_reason"

    # HTTP failure beyond threshold - manual decision
    elif [ "$FAILURE_TYPE" = "http_failure" ]; then
        rollback_needed=true
        rollback_reason="HTTP failure (beyond automatic threshold)"
        decision "Decision: MANUAL ROLLBACK DECISION REQUIRED"
        decision "Reason: $rollback_reason"

    # Database failure - always rollback
    elif [ "$FAILURE_TYPE" = "database_failure" ]; then
        rollback_needed=true
        rollback_reason="Database query failure"
        decision "Decision: ROLLBACK REQUIRED"
        decision "Reason: $rollback_reason"

    # Partial failure - manual decision
    elif [ "$FAILURE_TYPE" = "partial_failure" ]; then
        rollback_needed=false
        rollback_reason="Partial failure - manual evaluation needed"
        decision "Decision: MANUAL EVALUATION REQUIRED"
        decision "Reason: $rollback_reason"

    else
        decision "Decision: NO ROLLBACK (unknown state)"
    fi

    export ROLLBACK_NEEDED=$rollback_needed
    export ROLLBACK_REASON="$rollback_reason"
}

execute_rollback_decision() {
    decision "Executing rollback decision..."

    # If no rollback needed, return
    if [ "$ROLLBACK_NEEDED" = false ]; then
        success "No rollback needed"
        return 0
    fi

    # Determine if automatic or manual
    local auto_rollback=false

    if [ "$FAILURE_TYPE" = "critical_system" ] && [ "$DEPLOYMENT_AGE_SECONDS" -lt "$CRITICAL_TIME_THRESHOLD" ]; then
        auto_rollback=true
    elif [ "$FAILURE_TYPE" = "http_failure" ] && [ "$DEPLOYMENT_AGE_SECONDS" -lt "$CRITICAL_TIME_THRESHOLD" ]; then
        auto_rollback=true
    elif [ "$FAILURE_TYPE" = "database_failure" ]; then
        auto_rollback=true
    fi

    # Execute based on mode
    if [ "$MODE" = "auto" ] && [ "$auto_rollback" = true ]; then
        decision "Mode: AUTOMATIC - Executing rollback"
        execute_rollback

    elif [ "$MODE" = "auto" ]; then
        warning "Automatic rollback not recommended for this failure type"
        warning "Reason: $ROLLBACK_REASON"
        warning "Deployment age: $((DEPLOYMENT_AGE_SECONDS / 60)) minutes"
        warning "Run with --manual for manual rollback"

    elif [ "$MODE" = "manual" ]; then
        decision "Mode: MANUAL - Prompting for decision"
        prompt_rollback_decision

    else
        decision "Mode: CHECK ONLY - No action taken"
        info "Rollback would be recommended: $ROLLBACK_REASON"
    fi
}

prompt_rollback_decision() {
    echo ""
    echo "=============================================================================="
    echo "Rollback Decision Required"
    echo "=============================================================================="
    echo ""
    echo "Health Status: $HEALTH_OVERALL_STATUS"
    echo "Failed Layers: $HEALTH_FAILED_LAYERS"
    echo "Failure Type: $FAILURE_TYPE"
    echo "Deployment Age: $((DEPLOYMENT_AGE_SECONDS / 60)) minutes"
    echo ""
    echo "Reason: $ROLLBACK_REASON"
    echo ""
    echo "=============================================================================="
    echo ""

    if [ "$FORCE_ROLLBACK" = true ]; then
        info "Force rollback enabled - executing rollback"
        execute_rollback
        return $?
    fi

    echo -n "Execute rollback? (yes/no): "
    read -r response

    if [ "$response" = "yes" ]; then
        execute_rollback
        return $?
    else
        info "Rollback cancelled by user"
        return 0
    fi
}

execute_rollback() {
    info "Executing rollback..."

    # Run rollback script
    if "${PROJECT_ROOT}/scripts/deploy/rollback.sh" --env production --component all; then
        success "Rollback completed successfully"

        # Verify rollback with health check
        info "Verifying rollback with health check..."
        sleep 10  # Give services time to start

        if "${PROJECT_ROOT}/scripts/monitoring/enhanced-health-check.sh"; then
            success "Rollback verification passed"
            return 0
        else
            error "Rollback verification failed"
            error "System unhealthy after rollback"
            return 1
        fi
    else
        error "Rollback failed"
        error "Check logs: $LOG_FILE"
        return 1
    fi
}

#------------------------------------------------------------------------------
# Display Functions
#------------------------------------------------------------------------------

display_decision_summary() {
    echo ""
    echo "=============================================================================="
    echo "Rollback Decision Summary"
    echo "=============================================================================="
    echo ""
    echo "Timestamp: $TIMESTAMP"
    echo "Mode: $MODE"
    echo ""
    echo "Health Check Results:"
    echo "  Overall Status: $HEALTH_OVERALL_STATUS"
    echo "  Failed Layers: $HEALTH_FAILED_LAYERS"
    echo "  Failure Type: $FAILURE_TYPE"
    echo ""
    echo "Deployment Information:"
    echo "  Age: $((DEPLOYMENT_AGE_SECONDS / 60)) minutes"
    echo "  Threshold: $((CRITICAL_TIME_THRESHOLD / 60)) minutes"
    echo ""
    echo "Rollback Decision:"
    if [ "$ROLLBACK_NEEDED" = true ]; then
        echo "  Rollback Needed: YES"
        echo "  Reason: $ROLLBACK_REASON"
    else
        echo "  Rollback Needed: NO"
        echo "  Reason: System healthy or manual evaluation required"
    fi
    echo ""
    echo "=============================================================================="
    echo ""
}

#------------------------------------------------------------------------------
# Help Function
#------------------------------------------------------------------------------

show_help() {
    cat << EOF
Usage: $0 [options]

Options:
  --auto               Automatic mode (execute rollback if criteria met)
  --manual             Manual mode (prompt for rollback decision)
  --check-only         Check health status only, no rollback execution
  --force              Force rollback without confirmation
  --verbose            Enable verbose output
  --help               Display this help message

Exit Codes:
  0: No rollback needed or rollback successful
  1: Rollback failed
  2: Health check failed
  3: Configuration error

Examples:
  # Check health status and recommend action
  $0 --check-only

  # Automatic rollback if criteria met
  $0 --auto

  # Manual rollback with prompts
  $0 --manual

  # Force rollback without confirmation
  $0 --manual --force

Decision Tree Logic:
  1. Run enhanced health check (5 layers)
  2. Determine deployment age
  3. Evaluate failure type
  4. Apply rollback decision tree:
     - Critical failure + < 15min → Automatic rollback
     - Critical failure + > 15min → Manual decision
     - Database failure → Always rollback
     - Partial failure → Manual evaluation
     - No failure → No rollback

EOF
}

#------------------------------------------------------------------------------
# Main Function
#------------------------------------------------------------------------------

main() {
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --auto)
                MODE="auto"
                shift
                ;;
            --manual)
                MODE="manual"
                shift
                ;;
            --check-only)
                MODE="check"
                shift
                ;;
            --force)
                FORCE_ROLLBACK=true
                shift
                ;;
            --verbose)
                VERBOSE=true
                set -x
                shift
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                show_help
                exit 3
                ;;
        esac
    done

    # Print header
    echo "=============================================================================="
    echo "Rollback Decision Tree Evaluation"
    echo "=============================================================================="
    echo "Timestamp: $TIMESTAMP"
    echo "Mode: $MODE"
    echo "=============================================================================="
    echo ""

    # Step 1: Run health check
    info "Step 1: Running health check..."
    local health_json
    if ! health_json=$(run_health_check); then
        error "Health check failed"
        exit 2
    fi

    # Step 2: Parse health status
    info "Step 2: Parsing health status..."
    parse_health_status "$health_json"

    # Step 3: Get deployment age
    info "Step 3: Determining deployment age..."
    get_deployment_age

    # Step 4: Evaluate failure type
    info "Step 4: Evaluating failure type..."
    evaluate_failure_type

    # Step 5: Evaluate rollback needed
    info "Step 5: Evaluating rollback necessity..."
    evaluate_rollback_needed

    # Step 6: Display summary
    display_decision_summary

    # Step 7: Execute decision
    info "Step 6: Executing rollback decision..."
    execute_rollback_decision

    local exit_code=$?

    if [ $exit_code -eq 0 ]; then
        success "Rollback decision tree completed successfully"
    else
        error "Rollback decision tree failed with exit code: $exit_code"
    fi

    exit $exit_code
}

#------------------------------------------------------------------------------
# Script Entry Point
#------------------------------------------------------------------------------

main "$@"
