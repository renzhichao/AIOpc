#!/bin/bash
#==============================================================================
# Layer 4: OAuth Configuration Validation
#==============================================================================
# Purpose: Verify OAuth configuration is properly set
#
# Checks:
# - Feishu APP_ID is configured
# - Feishu APP_SECRET is configured
# - Configuration is loaded in backend
# - OAuth endpoint is accessible
#
# Usage:
#   ./health-check-layer4.sh [--json] [--verbose]
#
# Exit codes:
#   0: Check passed
#   1: Check failed
#   2: Configuration error
#==============================================================================



# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$(dirname "$SCRIPT_DIR")/lib"

# Source health check library
source "$LIB_DIR/health-check.sh"

#==============================================================================
# Configuration
#==============================================================================

BACKEND_CONTAINER="${BACKEND_CONTAINER:-opclaw-backend}"
ENV_FILE="${ENV_FILE:-/opt/opclaw/platform/.env.production}"
TIMEOUT=${LAYER_TIMEOUT:-10}

# Feishu OAuth endpoints
FEISHU_API_BASE="https://open.feishu.cn"
FEISHU_OAUTH_ENDPOINT="/open-apis/auth/v3/tenant_access_token/internal"

#==============================================================================
# Functions
#==============================================================================

check_feishu_app_id() {
    local start_time=$(date +%s%3N)

    local app_id=$(timeout $TIMEOUT docker exec "$BACKEND_CONTAINER" bash -c "grep FEISHU_APP_ID /app/.env 2>/dev/null | cut -d'=' -f2" 2>/dev/null || echo "")

    local end_time=$(date +%s%3N)
    local execution_time=$((end_time - start_time))

    if [ -n "$app_id" ] && [ "$app_id" != "cli_xxxxxxxxxxxxx" ]; then
        # Mask the APP_ID for security (show first 8 and last 4 characters)
        local masked_id="${app_id:0:8}...${app_id: -4}"

        output_health_result \
            "layer4" \
            "pass" \
            "Feishu APP_ID configured" \
            "APP_ID: $masked_id | Source: /app/.env" \
            $execution_time
        return 0
    else
        output_health_result \
            "layer4" \
            "fail" \
            "Feishu APP_ID not configured or invalid" \
            "Action: Set FEISHU_APP_ID in $ENV_FILE | Format: cli_xxxxxxxxxxxxx" \
            $execution_time
        return 1
    fi
}

check_feishu_app_secret() {
    local start_time=$(date +%s%3N)

    local app_secret=$(timeout $TIMEOUT docker exec "$BACKEND_CONTAINER" bash -c "grep FEISHU_APP_SECRET /app/.env 2>/dev/null | cut -d'=' -f2" 2>/dev/null || echo "")

    local end_time=$(date +%s%3N)
    local execution_time=$((end_time - start_time))

    if [ -n "$app_secret" ] && [ ${#app_secret} -gt 20 ]; then
        # Show only length for security
        local secret_length=${#app_secret}

        output_health_result \
            "layer4" \
            "pass" \
            "Feishu APP_SECRET configured" \
            "Secret length: $secret_length characters | Source: /app/.env" \
            $execution_time
        return 0
    else
        output_health_result \
            "layer4" \
            "fail" \
            "Feishu APP_SECRET not configured or too short" \
            "Action: Set FEISHU_APP_SECRET in $ENV_FILE | Obtain from Feishu developer console" \
            $execution_time
        return 1
    fi
}

check_feishu_encrypt_key() {
    local start_time=$(date +%s%3N)

    local encrypt_key=$(timeout $TIMEOUT docker exec "$BACKEND_CONTAINER" bash -c "grep FEISHU_ENCRYPT_KEY /app/.env 2>/dev/null | cut -d'=' -f2" 2>/dev/null || echo "")

    local end_time=$(date +%s%3N)
    local execution_time=$((end_time - start_time))

    if [ -n "$encrypt_key" ] && [ ${#encrypt_key} -gt 10 ]; then
        local key_length=${#encrypt_key}

        output_health_result \
            "layer4" \
            "pass" \
            "Feishu ENCRYPT_KEY configured" \
            "Key length: $key_length characters | Source: /app/.env" \
            $execution_time
        return 0
    else
        output_health_result \
            "layer4" \
            "warn" \
            "Feishu ENCRYPT_KEY not configured" \
            "Action: Set FEISHU_ENCRYPT_KEY in $ENV_FILE for event verification" \
            $execution_time
        return 0  # Warning is not a failure
    fi
}

check_jwt_secret() {
    local start_time=$(date +%s%3N)

    local jwt_secret=$(timeout $TIMEOUT docker exec "$BACKEND_CONTAINER" bash -c "grep JWT_SECRET /app/.env 2>/dev/null | cut -d'=' -f2" 2>/dev/null || echo "")

    local end_time=$(date +%s%3N)
    local execution_time=$((end_time - start_time))

    if [ -n "$jwt_secret" ] && [ ${#jwt_secret} -gt 30 ]; then
        local secret_length=${#jwt_secret}

        output_health_result \
            "layer4" \
            "pass" \
            "JWT_SECRET configured" \
            "Secret length: $secret_length characters | Source: /app/.env" \
            $execution_time
        return 0
    else
        output_health_result \
            "layer4" \
            "fail" \
            "JWT_SECRET not configured or too weak" \
            "Action: Set JWT_SECRET in $ENV_FILE | Use strong random string (min 64 chars recommended)" \
            $execution_time
        return 1
    fi
}

check_oauth_endpoint() {
    local start_time=$(date +%s%3N)

    # Check if backend OAuth service endpoint is accessible
    local response=$(timeout $TIMEOUT curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/api/auth/feishu/url" 2>/dev/null || echo "000")

    local end_time=$(date +%s%3N)
    local execution_time=$((end_time - start_time))

    if [ "$response" = "200" ] || [ "$response" = "401" ]; then
        output_health_result \
            "layer4" \
            "pass" \
            "OAuth endpoint accessible" \
            "Endpoint: /api/auth/feishu/url | Status: $response" \
            $execution_time
        return 0
    else
        output_health_result \
            "layer4" \
            "warn" \
            "OAuth endpoint not accessible" \
            "Endpoint: /api/auth/feishu/url | Status: $response | Action: Check backend OAuth routes" \
            $execution_time
        return 0  # Warning is not a failure
    fi
}

check_feishu_api_connectivity() {
    local start_time=$(date +%s%3N)

    # Test basic connectivity to Feishu API (without actual credentials)
    local response=$(timeout $TIMEOUT curl -s -o /dev/null -w "%{http_code}" "${FEISHU_API_BASE}/open-apis/auth/v3/tenant_access_token/internal" -X POST 2>/dev/null || echo "000")

    local end_time=$(date +%s%3N)
    local execution_time=$((end_time - start_time))

    if [ "$response" != "000" ]; then
        output_health_result \
            "layer4" \
            "pass" \
            "Feishu API reachable" \
            "API: ${FEISHU_API_BASE} | Response: $response | Note: Actual auth requires valid credentials" \
            $execution_time
        return 0
    else
        output_health_result \
            "layer4" \
            "warn" \
            "Feishu API unreachable" \
            "API: ${FEISHU_API_BASE} | Action: Check network connectivity and firewall rules" \
            $execution_time
        return 0  # Warning is not a failure
    fi
}

#==============================================================================
# Main Execution
#==============================================================================

main() {
    local overall_status="pass"
    local exit_code=0

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --json)
                JSON_OUTPUT=true
                shift
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            *)
                echo "Unknown option: $1"
                exit 2
                ;;
        esac
    done

    # Start JSON output if enabled
    if [ "$JSON_OUTPUT" = true ]; then
        json_start
        json_add_timestamp "check_start"
    fi

    # Run critical checks
    check_feishu_app_id || { overall_status="fail"; exit_code=1; }
    check_feishu_app_secret || { overall_status="fail"; exit_code=1; }
    check_jwt_secret || { overall_status="fail"; exit_code=1; }

    # Run additional checks (non-critical)
    check_feishu_encrypt_key || true
    check_oauth_endpoint || true
    check_feishu_api_connectivity || true

    # End JSON output if enabled
    if [ "$JSON_OUTPUT" = true ]; then
        json_add_field "layer" "4"
        json_add_field "name" "OAuth Configuration Validation"
        json_add_field "status" "$overall_status"
        json_end
    fi

    exit $exit_code
}

# Run main function
main "$@"
