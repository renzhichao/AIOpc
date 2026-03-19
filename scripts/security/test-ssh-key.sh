#!/opt/homebrew/bin/bash
#==============================================================================
# SSH Key Testing Script
# (SSH密钥测试脚本)
#
# Purpose: Test SSH key connectivity and functionality for tenant deployments
#
# Usage:
#   scripts/security/test-ssh-key.sh <tenant_id> [options]
#   --verbose         Show detailed connection test
#   --timeout N       Connection timeout in seconds (default: 10)
#   --commands        Test basic commands on remote server
#   --check-permissions Check key file permissions
#
# Examples:
#   scripts/security/test-ssh-key.sh tenant_001
#   scripts/security/test-ssh-key.sh tenant_001 --verbose --commands
#   scripts/security/test-ssh-key.sh tenant_001 --check-permissions
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
SSH_DIR="${HOME}/.ssh"

# Source required libraries
source "${LIB_DIR}/logging.sh" 2>/dev/null || { echo "ERROR: logging.sh not found"; exit 1; }
source "${LIB_DIR}/error.sh" 2>/dev/null || { echo "ERROR: error.sh not found"; exit 1; }
source "${LIB_DIR}/config.sh" 2>/dev/null || { echo "ERROR: config.sh not found"; exit 1; }

# Default values
TENANT_ID=""
VERBOSE=false
TIMEOUT=10
TEST_COMMANDS=false
CHECK_PERMISSIONS=false

# Test results
declare -a TEST_RESULTS=()

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

Test SSH key connectivity and functionality for tenant deployments.

Arguments:
  tenant_id              Tenant ID (required)

Options:
  --verbose              Show detailed connection test
  --timeout N            Connection timeout in seconds [default: 10]
  --commands             Test basic commands on remote server
  --check-permissions    Check key file permissions
  -h, --help             Show this help message

Examples:
  ${0##*/} tenant_001
  ${0##*/} tenant_001 --verbose --commands
  ${0##*/} tenant_001 --check-permissions

EOF
}

log_verbose() {
    if [ "$VERBOSE" = "true" ]; then
        echo -e "${CYAN}[VERBOSE]${NC} $*" >&2
    fi
}

# Get SSH key path for tenant
# Usage: get_ssh_key_path <tenant_id>
# Returns: Key file path or empty string
get_ssh_key_path() {
    local tenant_id="$1"

    # Check common key file locations
    local possible_paths=(
        "${SSH_DIR}/${tenant_id}_key"
        "${SSH_DIR}/id_${tenant_id}"
        "${SSH_DIR}/${tenant_id}"
    )

    for path in "${possible_paths[@]}"; do
        if [ -f "$path" ]; then
            echo "$path"
            return 0
        fi
    done

    # Check tenant config
    local config_file="${CONFIG_DIR}/${tenant_id}.yml"
    if [ -f "$config_file" ]; then
        local config_key_path
        config_key_path=$(get_config_value "$config_file" "server.ssh_key_path" 2>/dev/null)

        if [ -n "$config_key_path" ] && [ -f "$config_key_path" ]; then
            echo "$config_key_path"
            return 0
        fi
    fi

    echo ""
}

# Check SSH key file permissions
# Usage: check_key_permissions <key_file>
# Returns: 0 if secure, 1 if insecure
check_key_permissions() {
    local key_file="$1"

    if [ ! -f "$key_file" ]; then
        return 1
    fi

    # Get file permissions
    local perms
    perms=$(stat -f "%Lp" "$key_file" 2>/dev/null || stat -c "%a" "$key_file" 2>/dev/null)

    # Check if permissions are 600 or 400
    if [ "$perms" = "600" ] || [ "$perms" = "400" ]; then
        TEST_RESULTS+=("permissions:secure:$perms")
        return 0
    else
        TEST_RESULTS+=("permissions:insecure:$perms")
        return 1
    fi
}

# Test SSH connection
# Usage: test_ssh_connection <key_file> <host> <user> <port>
# Returns: 0 on success, 1 on failure
test_ssh_connection() {
    local key_file="$1"
    local host="$2"
    local user="${3:-root}"
    local port="${4:-22}"

    log_info "Testing SSH connection to ${user}@${host}:${port}..."

    local test_result
    local start_time
    local end_time
    local duration

    start_time=$(date +%s%N)

    test_result=$(ssh -i "$key_file" \
        -o StrictHostKeyChecking=no \
        -o ConnectTimeout="$TIMEOUT" \
        -o BatchMode=yes \
        -o ServerAliveInterval=5 \
        -o ServerAliveCountMax=3 \
        -p "$port" \
        "${user}@${host}" \
        "echo 'OK'" 2>&1)

    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 )) # Convert to milliseconds

    if [ "$test_result" = "OK" ]; then
        TEST_RESULTS+=("connection:success:${duration}ms")
        log_success "SSH connection successful (latency: ${duration}ms)"
        return 0
    else
        TEST_RESULTS+=("connection:failed:$test_result")
        log_error "SSH connection failed: $test_result"
        return 1
    fi
}

# Test basic commands on remote server
# Usage: test_remote_commands <key_file> <host> <user> <port>
# Returns: 0 on success, 1 on failure
test_remote_commands() {
    local key_file="$1"
    local host="$2"
    local user="${3:-root}"
    local port="${4:-22}"

    log_info "Testing basic commands on remote server..."

    local commands=(
        "pwd:Print working directory"
        "whoami:Show current user"
        "uname -s:Show operating system"
        "uptime:Show system uptime"
    )

    local all_passed=true

    for cmd_info in "${commands[@]}"; do
        IFS=':' read -r cmd description <<< "$cmd_info"

        log_verbose "Testing: $description ($cmd)"

        local result
        result=$(ssh -i "$key_file" \
            -o StrictHostKeyChecking=no \
            -o ConnectTimeout="$TIMEOUT" \
            -o BatchMode=yes \
            -p "$port" \
            "${user}@${host}" \
            "$cmd" 2>&1)

        if [ $? -eq 0 ]; then
            TEST_RESULTS+=("command:${cmd// /_}:success:${result}")
            log_success "✓ $description: $result"
        else
            TEST_RESULTS+=("command:${cmd// /_}:failed:$result")
            log_error "✗ $description failed: $result"
            all_passed=false
        fi
    done

    if [ "$all_passed" = "true" ]; then
        return 0
    else
        return 1
    fi
}

# Get detailed SSH connection info
# Usage: get_detailed_connection_info <key_file> <host> <user> <port>
# Returns: Detailed connection information
get_detailed_connection_info() {
    local key_file="$1"
    local host="$2"
    local user="${3:-root}"
    local port="${4:-22}"

    log_info "Gathering detailed connection information..."

    # Get server info
    local server_info
    server_info=$(ssh -i "$key_file" \
        -o StrictHostKeyChecking=no \
        -o ConnectTimeout="$TIMEOUT" \
        -o BatchMode=yes \
        -p "$port" \
        "${user}@${host}" \
        "
        echo 'Hostname:' \$(hostname)
        echo 'OS:' \$(uname -s) \$(uname -r)
        echo 'Uptime:' \$(uptime | awk -F'(up|load)' '{print \$2}')
        echo 'CPU:' \$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 'N/A')
        echo 'Memory:' \$(free -h 2>/dev/null | grep Mem | awk '{print \$2}' || echo 'N/A')
        echo 'Disk:' \$(df -h / | tail -1 | awk '{print \$2}')
        " 2>&1)

    if [ $? -eq 0 ]; then
        echo "$server_info"
    else
        echo "Failed to get server info"
    fi
}

#==============================================================================
# Main Execution
#==============================================================================

main() {
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --verbose)
                VERBOSE=true
                shift
                ;;
            --timeout)
                TIMEOUT="$2"
                if ! [[ "$TIMEOUT" =~ ^[0-9]+$ ]]; then
                    log_error "Invalid timeout value: $TIMEOUT"
                    exit 1
                fi
                shift 2
                ;;
            --commands)
                TEST_COMMANDS=true
                shift
                ;;
            --check-permissions)
                CHECK_PERMISSIONS=true
                shift
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
                if [ -z "$TENANT_ID" ]; then
                    TENANT_ID="$1"
                    shift
                else
                    log_error "Multiple tenant IDs specified"
                    print_usage
                    exit 1
                fi
                ;;
        esac
    done

    # Validate tenant ID
    if [ -z "$TENANT_ID" ]; then
        log_error "Tenant ID is required"
        print_usage
        exit 1
    fi

    # Get tenant configuration
    local config_file="${CONFIG_DIR}/${TENANT_ID}.yml"
    if [ ! -f "$config_file" ]; then
        log_error "Tenant configuration not found: $config_file"
        exit 1
    fi

    # Get server configuration
    local server_host
    local server_user
    local server_port

    server_host=$(get_config_value "$config_file" "server.host" 2>/dev/null)
    server_user=$(get_config_value "$config_file" "server.ssh_user" 2>/dev/null || echo "root")
    server_port=$(get_config_value "$config_file" "server.ssh_port" 2>/dev/null || echo "22")

    if [ -z "$server_host" ]; then
        log_error "Server host not configured for tenant: $TENANT_ID"
        exit 1
    fi

    # Get SSH key path
    local key_path
    key_path=$(get_ssh_key_path "$TENANT_ID")

    if [ -z "$key_path" ]; then
        log_error "SSH key not found for tenant: $TENANT_ID"
        log_error "Expected locations:"
        log_error "  ${SSH_DIR}/${TENANT_ID}_key"
        log_error "  ${SSH_DIR}/id_${TENANT_ID}"
        log_error "  ${SSH_DIR}/${TENANT_ID}"
        exit 1
    fi

    # Show test plan
    echo
    echo -e "${BOLD}======================================"
    echo -e "${BOLD}SSH Key Test Plan${NC}"
    echo -e "${BOLD}======================================${NC}"
    echo "Tenant ID: $TENANT_ID"
    echo "Server: ${server_user}@${server_host}:${server_port}"
    echo "SSH Key: $key_path"
    echo "Timeout: ${TIMEOUT}s"
    echo "Test Commands: $TEST_COMMANDS"
    echo "Check Permissions: $CHECK_PERMISSIONS"
    echo "Verbose Mode: $VERBOSE"
    echo -e "${BOLD}======================================${NC}"
    echo

    # Check key permissions if requested
    if [ "$CHECK_PERMISSIONS" = "true" ]; then
        log_info "Checking key file permissions..."
        if check_key_permissions "$key_path"; then
            log_success "Key file permissions are secure"
        else
            log_warning "Key file permissions may not be secure"
        fi
        echo
    fi

    # Test SSH connection
    if ! test_ssh_connection "$key_path" "$server_host" "$server_user" "$server_port"; then
        log_error "SSH connection test failed"
        exit 1
    fi

    # Test remote commands if requested
    if [ "$TEST_COMMANDS" = "true" ]; then
        echo
        if ! test_remote_commands "$key_path" "$server_host" "$server_user" "$server_port"; then
            log_warning "Some command tests failed"
        fi
    fi

    # Show detailed connection info if verbose
    if [ "$VERBOSE" = "true" ]; then
        echo
        log_info "Detailed connection information:"
        echo "-----------------------------------"
        get_detailed_connection_info "$key_path" "$server_host" "$server_user" "$server_port"
    fi

    # Test results summary
    echo
    echo -e "${BOLD}======================================"
    echo -e "${BOLD}Test Results Summary${NC}"
    echo -e "${BOLD}======================================${NC}"

    local passed=0
    local failed=0

    for result in "${TEST_RESULTS[@]}"; do
        IFS=':' read -r test_type test_status test_value <<< "$result"

        if [ "$test_status" = "success" ] || [ "$test_status" = "secure" ]; then
            echo -e "${GREEN}✓${NC} $test_type: $test_value"
            ((passed++))
        else
            echo -e "${RED}✗${NC} $test_type: $test_value"
            ((failed++))
        fi
    done

    echo -e "${BOLD}======================================${NC}"
    echo "Passed: $passed"
    echo "Failed: $failed"
    echo "Total: $((passed + failed))"
    echo -e "${BOLD}======================================${NC}"
    echo

    # Exit with error if any tests failed
    if [ $failed -gt 0 ]; then
        exit 1
    fi

    exit 0
}

# Run main function
main "$@"
