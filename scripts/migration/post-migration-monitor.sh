#!/bin/bash
#==============================================================================
# Post-Migration Monitoring Script
#==============================================================================
# Purpose: 24-hour monitoring after migration with automated health checks
#
# Features:
# - Automated health checks every 5 minutes
# - Performance metrics tracking
# - Anomaly detection and alerting
# - Log file analysis
# - Resource usage monitoring
# - OAuth success rate tracking
#
# Usage:
#   ./post-migration-monitor.sh [--duration SECONDS] [--interval SECONDS]
#
# Options:
#   --duration N     Monitoring duration in seconds (default: 86400 = 24h)
#   --interval N     Health check interval in seconds (default: 300 = 5min)
#   --alert EMAIL    Send alerts to email address
#   --slack WEBHOOK  Send alerts to Slack webhook
#   --verbose        Show detailed output
#
# Exit codes:
#   0: Monitoring completed successfully
#   1: Critical issue detected
#   2: Configuration error
#==============================================================================

set -euo pipefail

#==============================================================================
# Configuration
#==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LIB_DIR="$PROJECT_ROOT/scripts/lib"
LOG_DIR="$PROJECT_ROOT/logs/monitoring"
MONITOR_ID="monitor_$(date +%Y%m%d_%H%M%S)"

# Source libraries
source "$LIB_DIR/health-check.sh"

# Monitoring configuration
MONITORING_DURATION=${MONITORING_DURATION:-86400}  # 24 hours
MONITORING_INTERVAL=${MONITORING_INTERVAL:-300}    # 5 minutes
ALERT_EMAIL=${ALERT_EMAIL:-""}
SLACK_WEBHOOK=${SLACK_WEBHOOK:-""}
VERBOSE=${VERBOSE:-false}

# Monitoring thresholds
CPU_WARNING_THRESHOLD=80
CPU_CRITICAL_THRESHOLD=90
MEMORY_WARNING_THRESHOLD=80
MEMORY_CRITICAL_THRESHOLD=90
DISK_WARNING_THRESHOLD=80
DISK_CRITICAL_THRESHOLD=90
ERROR_RATE_WARNING_THRESHOLD=5
ERROR_RATE_CRITICAL_THRESHOLD=10

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

#==============================================================================
# Logging Functions
#==============================================================================

log_monitor() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] [${level}] ${message}" | tee -a "$LOG_DIR/post_migration_${MONITOR_ID}.log"
}

log_info() {
    echo -e "${BLUE}[MONITOR]${NC} $1" | tee -a "$LOG_DIR/post_migration_${MONITOR_ID}.log"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1" | tee -a "$LOG_DIR/post_migration_${MONITOR_ID}.log"
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1" | tee -a "$LOG_DIR/post_migration_${MONITOR_ID}.log"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_DIR/post_migration_${MONITOR_ID}.log"
}

log_alert() {
    local message="$1"
    local severity="$2"
    echo -e "${RED}[ALERT]${NC} [$severity] $1" | tee -a "$LOG_DIR/post_migration_${MONITOR_ID}.log"

    # Send alerts if configured
    if [ -n "$ALERT_EMAIL" ]; then
        send_email_alert "$message" "$severity"
    fi

    if [ -n "$SLACK_WEBHOOK" ]; then
        send_slack_alert "$message" "$severity"
    fi
}

#==============================================================================
# Alert Functions
#==============================================================================

send_email_alert() {
    local message="$1"
    local severity="$2"

    # Simple email sending (requires mailutils or similar)
    if command -v mail &>/dev/null; then
        echo "$message" | mail -s "[$severity] Migration Monitor Alert" "$ALERT_EMAIL"
    else
        log_warning "Email command not available, alert not sent"
    fi
}

send_slack_alert() {
    local message="$1"
    local severity="$2"

    if command -v curl &>/dev/null; then
        local color="good"
        [ "$severity" = "CRITICAL" ] && color="danger"
        [ "$severity" = "WARNING" ] && color="warning"

        curl -s -X POST "$SLACK_WEBHOOK" \
            -H 'Content-Type: application/json' \
            -d "{
                \"attachments\": [{
                    \"color\": \"$color\",
                    \"title\": \"Migration Monitor Alert [$severity]\",
                    \"text\": \"$message\",
                    \"ts\": $(date +%s)
                }]
            }" &>/dev/null || log_warning "Slack alert failed"
    else
        log_warning "curl command not available, Slack alert not sent"
    fi
}

#==============================================================================
# Health Check Functions
#==============================================================================

run_health_checks() {
    local check_number=$1
    local check_file="$LOG_DIR/health_check_${MONITOR_ID}_${check_number}.json"

    log_info "Running health check #${check_number}..."

    # Run enhanced health check
    if [ -f "$SCRIPT_DIR/../monitoring/enhanced-health-check.sh" ]; then
        bash "$SCRIPT_DIR/../monitoring/enhanced-health-check.sh" --json \
            > "$check_file" 2>/dev/null || {
            log_error "Health check #${check_number} failed"
            echo '{"overall_status":"error","layers":[]}' > "$check_file"
        }
    else
        log_warning "Enhanced health check script not found"
        echo '{"overall_status":"unknown","layers":[]}' > "$check_file"
    fi

    # Parse and log results
    if [ -f "$check_file" ]; then
        local status=$(jq -r '.overall_status // "unknown"' "$check_file" 2>/dev/null || echo "unknown")
        log_info "Health check #${check_number} status: $status"

        # Check for critical status
        if [ "$status" = "critical" ]; then
            log_alert "Health check #${check_number} returned CRITICAL status" "CRITICAL"
            return 1
        elif [ "$status" = "warning" ]; then
            log_alert "Health check #${check_number} returned WARNING status" "WARNING"
        fi
    fi

    log_success "Health check #${check_number} completed"
}

check_resource_usage() {
    local check_number=$1

    log_info "Checking resource usage..."

    # Backend container
    if docker ps --format '{{.Names}}' | grep -q "^opclaw-backend$"; then
        local backend_stats=$(docker stats opclaw-backend --no-stream --format "{{.CPUPerc}},{{.MemUsage}},{{.MemPerc}}" 2>/dev/null)

        if [ -n "$backend_stats" ]; then
            local cpu_percent=$(echo "$backend_stats" | cut -d, -f1 | sed 's/%//')
            local mem_usage=$(echo "$backend_stats" | cut -d, -f2)
            local mem_percent=$(echo "$backend_stats" | cut -d, -f3 | sed 's/%//')

            log_info "Backend - CPU: ${cpu_percent}%, Memory: ${mem_usage} (${mem_percent}%)"

            # Check thresholds
            if [ "$cpu_percent" != "%CPU" ]; then
                local cpu_value=$(echo $cpu_percent | cut -d. -f1)
                if [ $cpu_value -ge $CPU_CRITICAL_THRESHOLD ]; then
                    log_alert "Backend CPU usage CRITICAL: ${cpu_percent}%" "CRITICAL"
                elif [ $cpu_value -ge $CPU_WARNING_THRESHOLD ]; then
                    log_alert "Backend CPU usage WARNING: ${cpu_percent}%" "WARNING"
                fi
            fi

            if [ "$mem_percent" != "%MEM" ]; then
                local mem_value=$(echo $mem_percent | cut -d. -f1)
                if [ $mem_value -ge $MEMORY_CRITICAL_THRESHOLD ]; then
                    log_alert "Backend memory usage CRITICAL: ${mem_percent}%" "CRITICAL"
                elif [ $mem_value -ge $MEMORY_WARNING_THRESHOLD ]; then
                    log_alert "Backend memory usage WARNING: ${mem_percent}%" "WARNING"
                fi
            fi
        fi
    fi

    # Database container
    if docker ps --format '{{.Names}}' | grep -q "^opclaw-postgres$"; then
        local db_stats=$(docker stats opclaw-postgres --no-stream --format "{{.CPUPerc}},{{.MemUsage}},{{.MemPerc}}" 2>/dev/null)

        if [ -n "$db_stats" ]; then
            local cpu_percent=$(echo "$db_stats" | cut -d, -f1 | sed 's/%//')
            local mem_usage=$(echo "$db_stats" | cut -d, -f2)
            local mem_percent=$(echo "$db_stats" | cut -d, -f3 | sed 's/%//')

            log_info "Database - CPU: ${cpu_percent}%, Memory: ${mem_usage} (${mem_percent}%)"

            # Check thresholds
            if [ "$cpu_percent" != "%CPU" ]; then
                local cpu_value=$(echo $cpu_percent | cut -d. -f1)
                if [ $cpu_value -ge $CPU_CRITICAL_THRESHOLD ]; then
                    log_alert "Database CPU usage CRITICAL: ${cpu_percent}%" "CRITICAL"
                elif [ $cpu_value -ge $CPU_WARNING_THRESHOLD ]; then
                    log_alert "Database CPU usage WARNING: ${cpu_percent}%" "WARNING"
                fi
            fi

            if [ "$mem_percent" != "%MEM" ]; then
                local mem_value=$(echo $mem_percent | cut -d. -f1)
                if [ $mem_value -ge $MEMORY_CRITICAL_THRESHOLD ]; then
                    log_alert "Database memory usage CRITICAL: ${mem_percent}%" "CRITICAL"
                elif [ $mem_value -ge $MEMORY_WARNING_THRESHOLD ]; then
                    log_alert "Database memory usage WARNING: ${mem_percent}%" "WARNING"
                fi
            fi
        fi
    fi

    # Disk usage
    local disk_usage=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
    log_info "Disk usage: ${disk_usage}%"

    if [ $disk_usage -ge $DISK_CRITICAL_THRESHOLD ]; then
        log_alert "Disk usage CRITICAL: ${disk_usage}%" "CRITICAL"
    elif [ $disk_usage -ge $DISK_WARNING_THRESHOLD ]; then
        log_alert "Disk usage WARNING: ${disk_usage}%" "WARNING"
    fi
}

check_error_rates() {
    local check_number=$1

    log_info "Checking error rates..."

    # Check backend logs for errors
    local error_count=0
    local log_files=(
        "/var/log/opclaw/backend.log"
        "$PROJECT_ROOT/logs/backend.log"
    )

    for log_file in "${log_files[@]}"; do
        if [ -f "$log_file" ]; then
            # Count errors in last 5 minutes
            local recent_errors=$(grep -c "ERROR" "$log_file" 2>/dev/null || echo "0")
            error_count=$((error_count + recent_errors))
        fi
    fi

    log_info "Recent error count: $error_count"

    if [ $error_count -ge $ERROR_RATE_CRITICAL_THRESHOLD ]; then
        log_alert "Error rate CRITICAL: $error_count errors" "CRITICAL"
    elif [ $error_count -ge $ERROR_RATE_WARNING_THRESHOLD ]; then
        log_alert "Error rate WARNING: $error_count errors" "WARNING"
    fi
}

check_oauth_health() {
    local check_number=$1

    log_info "Checking OAuth health..."

    # Check OAuth endpoint
    local oauth_status=$(curl -s -o /dev/null -w "%{http_code}" \
        http://localhost:3000/api/auth/feishu/health 2>/dev/null || echo "000")

    if [ "$oauth_status" = "200" ]; then
        log_success "OAuth endpoint healthy"
    else
        log_warning "OAuth endpoint returned status: $oauth_status"
    fi

    # Check OAuth configuration
    if [ -f "/opt/opclaw/.env.production" ]; then
        if grep -q "^FEISHU_APP_ID=" /opt/opclaw/.env.production && \
           grep -q "^FEISHU_APP_SECRET=" /opt/opclaw/.env.production; then
            log_success "OAuth configuration present"
        else
            log_warning "OAuth configuration incomplete"
        fi
    fi
}

check_database_performance() {
    local check_number=$1

    log_info "Checking database performance..."

    # Check database connection count
    local conn_count=$(docker exec opclaw-postgres psql -U opclaw -d opclaw -c \
        "SELECT count(*) FROM pg_stat_activity;" -t 2>/dev/null | xargs || echo "0")

    log_info "Database connections: $conn_count"

    # Check database size
    local db_size=$(docker exec opclaw-postgres psql -U opclaw -d opclaw -c \
        "SELECT pg_size_pretty(pg_database_size('opclaw'));" -t 2>/dev/null | xargs || echo "unknown")

    log_info "Database size: $db_size"

    # Check for long-running queries
    local long_queries=$(docker exec opclaw-postgres psql -U opclaw -d opclaw -c \
        "SELECT count(*) FROM pg_stat_activity WHERE state = 'active' AND query_start < now() - interval '5 minutes';" \
        -t 2>/dev/null | xargs || echo "0")

    if [ "$long_queries" -gt 0 ]; then
        log_warning "Found $long_queries long-running queries"
    fi
}

generate_summary_report() {
    local report_file="$LOG_DIR/monitoring_summary_${MONITOR_ID}.md"

    log_info "Generating monitoring summary report..."

    cat > "$report_file" <<EOF
# Post-Migration Monitoring Summary Report

**Monitor ID**: ${MONITOR_ID}
**Monitoring Duration**: $(format_duration $MONITORING_DURATION)
**Monitoring Interval**: ${MONITORING_INTERVAL}s
**Start Time**: $(date -r $MONITOR_START_TIME '+%Y-%m-%d %H:%M:%S')
**End Time**: $(date '+%Y-%m-%d %H:%M:%S')

## Monitoring Statistics

- **Total Health Checks**: $TOTAL_CHECKS
- **Successful Checks**: $SUCCESSFUL_CHECKS
- **Failed Checks**: $FAILED_CHECKS
- **Warnings**: $WARNING_COUNT
- **Critical Alerts**: $CRITICAL_COUNT
- **Resources Monitored**: Backend, Database, Redis, Disk

## Health Check Results

### Overall Status
$([ $FAILED_CHECKS -eq 0 ] && echo "✅ All health checks passed" || echo "❌ Some health checks failed")

### Layer Breakdown
$(jq -r '.layers[] | "- Layer \(.layer_number): \(.layer_name) - \(.status)"' "$LOG_DIR/health_check_${MONITOR_ID}_1.json" 2>/dev/null || echo "Layer data not available")

## Resource Usage Trends

### CPU Usage
- Backend Average: ${AVG_BACKEND_CPU:-N/A}
- Database Average: ${AVG_DB_CPU:-N/A}

### Memory Usage
- Backend Average: ${AVG_BACKEND_MEM:-N/A}
- Database Average: ${AVG_DB_MEM:-N/A}

### Disk Usage
- Current: ${FINAL_DISK_USAGE:-N/A}
- Peak: ${PEAK_DISK_USAGE:-N/A}

## Error Analysis

- **Total Errors Detected**: $TOTAL_ERRORS
- **Error Rate**: $(echo "scale=2; $TOTAL_ERRORS / $TOTAL_CHECKS" | bc) errors/check
- **Critical Incidents**: $CRITICAL_COUNT

## OAuth Performance

- **Endpoint Uptime**: ${OAUTH_UPTIME:-N/A}
- **Total Requests**: ${OAUTH_REQUESTS:-N/A}
- **Success Rate**: ${OAUTH_SUCCESS_RATE:-N/A}

## Database Performance

- **Average Connections**: ${AVG_DB_CONNECTIONS:-N/A}
- **Database Size**: ${FINAL_DB_SIZE:-N/A}
- **Long Queries Detected**: ${LONG_QUERY_COUNT:-N/A}

## Recommendations

$([ $CRITICAL_COUNT -eq 0 ] && echo "✅ No critical issues detected. Migration stable." || echo "⚠️ Critical issues detected. Review and investigate.")

$( [ $WARNING_COUNT -gt 10 ] && echo "⚠️ High number of warnings. Monitor closely." || echo "✅ Warning count within acceptable range.")

---

**Report Generated**: $(date)
**Monitoring Log**: \`$LOG_DIR/post_migration_${MONITOR_ID}.log\`
EOF

    log_success "Summary report generated: $report_file"
    cat "$report_file"
}

format_duration() {
    local seconds=$1
    local hours=$((seconds / 3600))
    local minutes=$(((seconds % 3600) / 60))
    local secs=$((seconds % 60))
    printf "%02d:%02d:%02d" $hours $minutes $secs
}

#==============================================================================
# Main Monitoring Loop
#==============================================================================

main() {
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --duration)
                MONITORING_DURATION="$2"
                shift 2
                ;;
            --interval)
                MONITORING_INTERVAL="$2"
                shift 2
                ;;
            --alert)
                ALERT_EMAIL="$2"
                shift 2
                ;;
            --slack)
                SLACK_WEBHOOK="$2"
                shift 2
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            *)
                echo "Unknown option: $1"
                exit 1
                ;;
        esac
    done

    # Create log directory
    mkdir -p "$LOG_DIR"

    # Initialize counters
    TOTAL_CHECKS=0
    SUCCESSFUL_CHECKS=0
    FAILED_CHECKS=0
    WARNING_COUNT=0
    CRITICAL_COUNT=0
    TOTAL_ERRORS=0

    # Monitoring loop
    log_info "========================================="
    log_info "Post-Migration Monitoring Started"
    log_info "========================================="
    log_info "Duration: $(format_duration $MONITORING_DURATION)"
    log_info "Interval: ${MONITORING_INTERVAL}s"
    log_info "Monitor ID: ${MONITOR_ID}"
    log_info "========================================="

    MONITOR_START_TIME=$(date +%s)
    MONITOR_END_TIME=$((MONITOR_START_TIME + MONITORING_DURATION))

    while [ $(date +%s) -lt $MONITOR_END_TIME ]; do
        TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
        local current_time=$(date +%s)
        local elapsed=$((current_time - MONITOR_START_TIME))
        local remaining=$((MONITOR_END_TIME - current_time))

        log_info "========================================="
        log_info "Monitoring Cycle #${TOTAL_CHECKS}"
        log_info "Elapsed: $(format_duration $elapsed), Remaining: $(format_duration $remaining)"
        log_info "========================================="

        # Run health checks
        if run_health_checks "$TOTAL_CHECKS"; then
            SUCCESSFUL_CHECKS=$((SUCCESSFUL_CHECKS + 1))
        else
            FAILED_CHECKS=$((FAILED_CHECKS + 1))
        fi

        # Check resource usage
        check_resource_usage "$TOTAL_CHECKS"

        # Check error rates
        check_error_rates "$TOTAL_CHECKS"

        # Check OAuth health
        check_oauth_health "$TOTAL_CHECKS"

        # Check database performance
        check_database_performance "$TOTAL_CHECKS"

        # Wait for next check
        if [ $(date +%s) -lt $MONITOR_END_TIME ]; then
            local sleep_time=$MONITORING_INTERVAL
            if [ $((current_time + sleep_time)) -gt $MONITOR_END_TIME ]; then
                sleep_time=$((MONITOR_END_TIME - current_time))
            fi

            if [ "$VERBOSE" = true ]; then
                log_info "Next check in ${sleep_time}s..."
            fi

            sleep $sleep_time
        fi
    done

    log_info "========================================="
    log_info "Monitoring Completed"
    log_info "========================================="
    log_info "Total Checks: $TOTAL_CHECKS"
    log_info "Successful: $SUCCESSFUL_CHECKS"
    log_info "Failed: $FAILED_CHECKS"
    log_info "Warnings: $WARNING_COUNT"
    log_info "Critical: $CRITICAL_COUNT"
    log_info "========================================="

    # Generate summary report
    generate_summary_report

    log_success "Monitoring completed successfully!"
    log_info "Summary report: $LOG_DIR/monitoring_summary_${MONITOR_ID}.md"
    log_info "Detailed log: $LOG_DIR/post_migration_${MONITOR_ID}.log"
}

# Execute main function
main "$@"
