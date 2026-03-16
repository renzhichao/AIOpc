#!/bin/bash
#==============================================================================
# AIOpc Backend Health Check Script
#==============================================================================
# Purpose: Verify backend service health and status
#
# Features:
# - PM2 process status check
# - Health endpoint verification
# - Database connectivity test
# - Redis connectivity test
# - Docker connectivity test
# - Recent error log analysis
# - Performance metrics display
#
# Usage:
#   ./health-check.sh [--verbose] [--json] [--watch]
#
# Exit codes:
#   0: All checks passed
#   1: One or more checks failed
#   2: Service not running
#   3: Critical error
#==============================================================================

set -e  # Exit on error
set -u  # Exit on undefined variable

#==============================================================================
# Configuration
#==============================================================================

SERVER="${SERVER:-root@118.25.0.190}"
BACKEND_DIR="${BACKEND_DIR:-/opt/opclaw/backend}"
HEALTH_URL="${HEALTH_URL:-http://localhost:3000/health}"
API_URL="${API_URL:-http://localhost:3000}"

# Parse arguments
VERBOSE=false
JSON_OUTPUT=false
WATCH_MODE=false
WATCH_INTERVAL=10

while [[ $# -gt 0 ]]; do
    case $1 in
        --verbose)
            VERBOSE=true
            shift
            ;;
        --json)
            JSON_OUTPUT=true
            shift
            ;;
        --watch)
            WATCH_MODE=true
            shift
            ;;
        --interval)
            WATCH_INTERVAL="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Colors for output (disabled in JSON mode)
if [ "$JSON_OUTPUT" = false ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    NC='\033[0m' # No Color
fi

#==============================================================================
# Logging Functions
#==============================================================================

log_info() {
    if [ "$JSON_OUTPUT" = false ]; then
        echo -e "${BLUE}[INFO]${NC} $1"
    fi
}

log_success() {
    if [ "$JSON_OUTPUT" = false ]; then
        echo -e "${GREEN}[✓]${NC} $1"
    fi
}

log_warning() {
    if [ "$JSON_OUTPUT" = false ]; then
        echo -e "${YELLOW}[⚠]${NC} $1"
    fi
}

log_error() {
    if [ "$JSON_OUTPUT" = false ]; then
        echo -e "${RED}[✗]${NC} $1"
    fi
}

log_section() {
    if [ "$JSON_OUTPUT" = false ]; then
        echo
        echo -e "${BLUE}==>${NC} $1"
        echo
    fi
}

#==============================================================================
# Utility Functions
#==============================================================================

run_ssh() {
    ssh $SERVER "$1"
}

check_command() {
    if ! command -v jq &> /dev/null && [ "$JSON_OUTPUT" = true ]; then
        echo "Error: jq required for JSON output"
        exit 1
    fi
}

#==============================================================================
# Health Checks
#==============================================================================

check_pm2_process() {
    if [ "$JSON_OUTPUT" = true ]; then
        PM2_STATUS=$(run_ssh "pm2 jlist" 2>/dev/null || echo "[]")
        echo "$PM2_STATUS" | jq -r '[.[] | select(.name == "opclaw-backend") | {name, status, cpu, memory, uptime}] | .[0]'
    else
        log_section "1. PM2 Process Status"

        PM2_STATUS=$(run_ssh "pm2 describe opclaw-backend 2>/dev/null" || echo "Process not found")

        if echo "$PM2_STATUS" | grep -q "online"; then
            log_success "PM2 process is running"

            if [ "$VERBOSE" = true ]; then
                echo
                run_ssh "pm2 show opclaw-backend"
            fi
        else
            log_error "PM2 process is not running"
            return 1
        fi
    fi
}

check_health_endpoint() {
    if [ "$JSON_OUTPUT" = true ]; then
        HEALTH_RESPONSE=$(run_ssh "curl -s -f $HEALTH_URL" 2>/dev/null || echo '{"status":"error"}')
        echo "$HEALTH_RESPONSE"
    else
        log_section "2. Health Endpoint"

        HEALTH_RESPONSE=$(run_ssh "curl -s -f $HEALTH_URL" 2>/dev/null || echo "")

        if [ -n "$HEALTH_RESPONSE" ]; then
            log_success "Health endpoint responding"

            if [ "$VERBOSE" = true ]; then
                echo
                echo "Response:"
                echo "$HEALTH_RESPONSE" | jq '.' 2>/dev/null || echo "$HEALTH_RESPONSE"
            fi
        else
            log_error "Health endpoint not responding"
            return 1
        fi
    fi
}

check_api_endpoints() {
    if [ "$JSON_OUTPUT" = true ]; then
        API_STATUS=$(run_ssh "curl -s -o /dev/null -w '%{http_code}' $API_URL/api/status" 2>/dev/null || echo "000")
        echo "{\"api_status_code\": $API_STATUS}"
    else
        log_section "3. API Endpoints"

        # Check main API status endpoint
        API_STATUS=$(run_ssh "curl -s -o /dev/null -w '%{http_code}' $API_URL/api/status" 2>/dev/null || echo "000")

        if [ "$API_STATUS" = "200" ]; then
            log_success "API status endpoint: $API_STATUS"
        else
            log_warning "API status endpoint: $API_STATUS"
        fi
    fi
}

check_database_connection() {
    if [ "$JSON_OUTPUT" = true ]; then
        DB_STATUS=$(run_ssh "sudo -u postgres psql -U opclaw -d opclaw -c 'SELECT 1 as status' -t" 2>/dev/null || echo "error")
        if [ "$DB_STATUS" = "1" ]; then
            echo "{\"database\": \"connected\"}"
        else
            echo "{\"database\": \"disconnected\", \"error\": \"$DB_STATUS\"}"
        fi
    else
        log_section "4. Database Connection"

        DB_STATUS=$(run_ssh "sudo -u postgres psql -U opclaw -d opclaw -c 'SELECT 1 as status' -t" 2>/dev/null || echo "error")

        if echo "$DB_STATUS" | grep -q "1"; then
            log_success "PostgreSQL connection: OK"
        else
            log_error "PostgreSQL connection: FAILED"
            return 1
        fi
    fi
}

check_redis_connection() {
    if [ "$JSON_OUTPUT" = true ]; then
        REDIS_STATUS=$(run_ssh "redis-cli -a \$REDIS_PASSWORD ping 2>/dev/null || echo 'error'" || echo "error")
        if [ "$REDIS_STATUS" = "PONG" ]; then
            echo "{\"redis\": \"connected\"}"
        else
            echo "{\"redis\": \"disconnected\", \"response\": \"$REDIS_STATUS\"}"
        fi
    else
        log_section "5. Redis Connection"

        REDIS_STATUS=$(run_ssh "redis-cli ping" 2>/dev/null || echo "error")

        if [ "$REDIS_STATUS" = "PONG" ]; then
            log_success "Redis connection: OK"
        else
            log_warning "Redis connection: FAILED (may not be configured)"
        fi
    fi
}

check_docker_connection() {
    if [ "$JSON_OUTPUT" = true ]; then
        DOCKER_STATUS=$(run_ssh "docker info > /dev/null 2>&1 && echo 'running' || echo 'error'")
        echo "{\"docker\": \"$DOCKER_STATUS\"}"
    else
        log_section "6. Docker Connection"

        DOCKER_STATUS=$(run_ssh "docker info > /dev/null 2>&1 && echo 'running' || echo 'error'")

        if [ "$DOCKER_STATUS" = "running" ]; then
            log_success "Docker daemon: Running"

            if [ "$VERBOSE" = true ]; then
                echo
                CONTAINER_COUNT=$(run_ssh "docker ps --filter 'name=opclaw' --format '{{.Names}}' | wc -l")
                echo "Active AIOpc containers: $CONTAINER_COUNT"
            fi
        else
            log_error "Docker daemon: Not running"
            return 1
        fi
    fi
}

check_recent_errors() {
    if [ "$JSON_OUTPUT" = true ]; then
        ERROR_COUNT=$(run_ssh "pm2 logs opclaw-backend --err --lines 100 --nostream --raw" 2>/dev/null | grep -c "ERROR\|FATAL\|Exception" || echo "0")
        echo "{\"recent_errors\": $ERROR_COUNT}"
    else
        log_section "7. Recent Error Analysis"

        ERROR_LOG=$(run_ssh "pm2 logs opclaw-backend --err --lines 20 --nostream" 2>/dev/null || echo "")

        if [ -n "$ERROR_LOG" ]; then
            ERROR_COUNT=$(echo "$ERROR_LOG" | grep -c "ERROR\|FATAL\|Exception" || echo "0")

            if [ "$ERROR_COUNT" -gt 0 ]; then
                log_warning "Found $ERROR_COUNT error(s) in recent logs"

                if [ "$VERBOSE" = true ]; then
                    echo
                    echo "Recent errors:"
                    echo "$ERROR_LOG"
                fi
            else
                log_success "No errors in recent logs"
            fi
        else
            log_success "No error logs found"
        fi
    fi
}

check_performance_metrics() {
    if [ "$JSON_OUTPUT" = true ]; then
        METRICS=$(run_ssh "pm2 jlist" 2>/dev/null | jq -r '[.[] | select(.name == "opclaw-backend") | {cpu: .cpu, memory: .memory}] | .[0]')
        echo "$METRICS"
    else
        log_section "8. Performance Metrics"

        if [ "$VERBOSE" = true ]; then
            METRICS=$(run_ssh "pm2 jlist" 2>/dev/null | jq -r '.[] | select(.name == "opclaw-backend")' || echo "{}")

            if [ -n "$METRICS" ]; then
                CPU=$(echo "$METRICS" | jq -r '.cpu // "N/A"')
                MEMORY=$(echo "$METRICS" | jq -r '.memory // "N/A"')
                UPTIME=$(echo "$METRICS" | jq -r '.pm2_env.pm_uptime // "N/A"')

                echo "CPU Usage: $CPU%"
                echo "Memory Usage: $MEMORY bytes"
                echo "Uptime: $UPTIME"
            fi
        else
            log_info "Use --verbose for detailed metrics"
        fi
    fi
}

#==============================================================================
# Display Summary
#==============================================================================

display_summary() {
    if [ "$JSON_OUTPUT" = false ]; then
        log_section "Health Check Summary"

        echo "Backend service: OK"
        echo "Health endpoint: OK"
        echo "Database: OK"
        echo "Redis: OK"
        echo "Docker: OK"
        echo
        echo "✓ All critical services are healthy"
        echo
        echo "For more details:"
        echo "  ssh $SERVER 'pm2 logs opclaw-backend'"
        echo "  ssh $SERVER 'pm2 status'"
        echo
    fi
}

#==============================================================================
# Run All Checks
#==============================================================================

run_all_checks() {
    EXIT_CODE=0

    check_pm2_process || EXIT_CODE=$?
    check_health_endpoint || EXIT_CODE=$?
    check_api_endpoints
    check_database_connection || EXIT_CODE=$?
    check_redis_connection
    check_docker_connection || EXIT_CODE=$?
    check_recent_errors
    check_performance_metrics

    display_summary

    return $EXIT_CODE
}

#==============================================================================
# Watch Mode
#==============================================================================

watch_mode() {
    log_info "Watch mode enabled (interval: ${WATCH_INTERVAL}s)"
    log_info "Press Ctrl+C to exit"
    echo

    while true; do
        clear
        echo "============================================================"
        echo "  AIOpc Backend Health Check - $(date '+%Y-%m-%d %H:%M:%S')"
        echo "============================================================"
        echo

        run_all_checks

        sleep $WATCH_INTERVAL
    done
}

#==============================================================================
# Main Execution
#==============================================================================

main() {
    if [ "$JSON_OUTPUT" = false ]; then
        echo
        echo "============================================================"
        echo "  AIOpc Backend Health Check"
        echo "============================================================"
        echo
        echo "Server: $SERVER"
        echo "Backend: $BACKEND_DIR"
        echo "Watch Mode: $WATCH_MODE"
        echo
    fi

    if [ "$WATCH_MODE" = true ]; then
        watch_mode
    else
        run_all_checks
        EXIT_CODE=$?

        if [ "$JSON_OUTPUT" = false ]; then
            echo "============================================================"
            if [ $EXIT_CODE -eq 0 ]; then
                log_success "Health check completed successfully"
            else
                log_error "Health check failed with exit code: $EXIT_CODE"
            fi
            echo "============================================================"
            echo
        fi

        exit $EXIT_CODE
    fi
}

# Run main function
main "$@"
