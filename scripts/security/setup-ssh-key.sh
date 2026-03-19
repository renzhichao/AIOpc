#!/opt/homebrew/bin/bash
#==============================================================================
# SSH Key Setup Script
# (SSH密钥初始化脚本)
#
# Purpose: Initialize SSH keys for new tenant deployments with automated
#          deployment and GitHub Secrets integration
#
# Usage:
#   scripts/security/setup-ssh-key.sh <tenant_id> [options]
#   --type TYPE       Key type (ed25519|rsa) - default: ed25519
#   --comment COMMENT Key comment
#   --github          Update GitHub Secrets (requires gh CLI)
#   --test            Test SSH connection after setup
#   --force           Overwrite existing key
#
# Examples:
#   scripts/security/setup-ssh-key.sh tenant_001
#   scripts/security/setup-ssh-key.sh tenant_001 --type rsa --github
#   scripts/security/setup-ssh-key.sh tenant_001 --test
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
source "${LIB_DIR}/state.sh" 2>/dev/null || { echo "ERROR: state.sh not found"; exit 1; }

# Default values
TENANT_ID=""
KEY_TYPE="ed25519"
KEY_COMMENT=""
UPDATE_GITHUB=false
TEST_CONNECTION=false
FORCE=false
VERBOSE=false

# Generated key information
KEY_FILE=""
PUB_KEY_FILE=""
KEY_FINGERPRINT=""

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

Initialize SSH keys for new tenant deployments.

Arguments:
  tenant_id              Tenant ID (required)

Options:
  --type TYPE            Key type (ed25519|rsa) [default: ed25519]
  --comment COMMENT      Key comment [default: auto-generated]
  --github               Update GitHub Secrets (requires gh CLI)
  --test                 Test SSH connection after setup
  --force                Overwrite existing key
  -v, --verbose          Show detailed output
  -h, --help             Show this help message

Examples:
  ${0##*/} tenant_001
  ${0##*/} tenant_001 --type rsa --github
  ${0##*/} tenant_001 --test --verbose

EOF
}

log_verbose() {
    if [ "$VERBOSE" = "true" ]; then
        echo -e "${CYAN}[VERBOSE]${NC} $*" >&2
    fi
}

# Validate tenant exists
# Usage: validate_tenant <tenant_id>
# Returns: 0 if valid, 1 if invalid
validate_tenant() {
    local tenant_id="$1"

    # Check if tenant config exists
    local config_file="${CONFIG_DIR}/${tenant_id}.yml"
    if [ ! -f "$config_file" ]; then
        log_error "Tenant configuration not found: $config_file"
        return 1
    fi

    # Get required server configuration
    local server_host
    server_host=$(get_config_value "$config_file" "server.host" 2>/dev/null)

    if [ -z "$server_host" ]; then
        log_error "Server host not configured for tenant: $tenant_id"
        return 1
    fi

    return 0
}

# Check if SSH key already exists
# Usage: check_existing_key <tenant_id>
# Returns: 0 if exists, 1 if not
check_existing_key() {
    local tenant_id="$1"

    # Check possible key locations
    local possible_keys=(
        "${SSH_DIR}/${tenant_id}_key"
        "${SSH_DIR}/id_${tenant_id}"
        "${SSH_DIR}/${tenant_id}"
    )

    for key_path in "${possible_keys[@]}"; do
        if [ -f "$key_path" ]; then
            echo "$key_path"
            return 0
        fi
    done

    return 1
}

# Generate SSH key pair
# Usage: generate_ssh_key <tenant_id> <key_type> <comment>
# Returns: 0 on success, 1 on failure
generate_ssh_key() {
    local tenant_id="$1"
    local key_type="$2"
    local comment="${3:-ssh-key-${tenant_id}-$(date +%Y%m%d)}"

    log_info "Generating SSH key pair (type: $key_type)..."

    # Determine key file path
    KEY_FILE="${SSH_DIR}/${tenant_id}_key"
    PUB_KEY_FILE="${KEY_FILE}.pub"

    # Check if key already exists
    if [ -f "$KEY_FILE" ] && [ "$FORCE" = "false" ]; then
        log_error "SSH key already exists: $KEY_FILE"
        log_error "Use --force to overwrite"
        return 1
    fi

    # Remove existing key if force is enabled
    if [ -f "$KEY_FILE" ] && [ "$FORCE" = "true" ]; then
        log_warning "Removing existing SSH key: $KEY_FILE"
        rm -f "$KEY_FILE" "$PUB_KEY_FILE"
    fi

    # Build ssh-keygen arguments
    local keygen_args=()

    case "$key_type" in
        ed25519)
            keygen_args=(-t ed25519 -a 100 -C "$comment")
            ;;
        rsa)
            keygen_args=(-t rsa -b 4096 -a 100 -C "$comment")
            ;;
        *)
            log_error "Invalid key type: $key_type"
            return 1
            ;;
    esac

    # Generate the key
    if ! ssh-keygen "${keygen_args[@]}" -f "$KEY_FILE" -N "" 2>&1 | while IFS= read -r line; do
        log_verbose "$line"
    done; then
        log_error "Failed to generate SSH key"
        return 1
    fi

    # Set proper permissions
    chmod 600 "$KEY_FILE"
    chmod 644 "$PUB_KEY_FILE"

    # Get fingerprint
    KEY_FINGERPRINT=$(ssh-keygen -lf "$PUB_KEY_FILE" | awk '{print $2}')

    log_success "SSH key generated: $KEY_FILE"
    log_info "Fingerprint: $KEY_FINGERPRINT"

    return 0
}

# Deploy SSH key to server
# Usage: deploy_ssh_key <tenant_id>
# Returns: 0 on success, 1 on failure
deploy_ssh_key() {
    local tenant_id="$1"

    log_info "Deploying SSH key to server..."

    # Get tenant configuration
    local config_file="${CONFIG_DIR}/${tenant_id}.yml"

    local server_host
    local server_user
    local server_port

    server_host=$(get_config_value "$config_file" "server.host" 2>/dev/null)
    server_user=$(get_config_value "$config_file" "server.ssh_user" 2>/dev/null || echo "root")
    server_port=$(get_config_value "$config_file" "server.ssh_port" 2>/dev/null || echo "22")

    if [ -z "$server_host" ]; then
        log_error "Server host not configured"
        return 1
    fi

    # Read public key content
    local pub_key_content
    pub_key_content=$(cat "$PUB_KEY_FILE")

    # Deploy to server
    local ssh_result
    ssh_result=$(ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -o BatchMode=yes -p "$server_port" "${server_user}@${server_host}" "
        mkdir -p ~/.ssh
        chmod 700 ~/.ssh
        echo '$pub_key_content' >> ~/.ssh/authorized_keys
        chmod 600 ~/.ssh/authorized_keys
        echo 'OK'
    " 2>&1)

    if [ "$ssh_result" = "OK" ]; then
        log_success "SSH key deployed to ${server_user}@${server_host}:${server_port}"
        return 0
    else
        log_error "Failed to deploy SSH key: $ssh_result"
        return 1
    fi
}

# Test SSH connection
# Usage: test_ssh_connection <tenant_id>
# Returns: 0 on success, 1 on failure
test_ssh_connection() {
    local tenant_id="$1"

    log_info "Testing SSH connection..."

    # Get tenant configuration
    local config_file="${CONFIG_DIR}/${tenant_id}.yml"

    local server_host
    local server_user
    local server_port

    server_host=$(get_config_value "$config_file" "server.host" 2>/dev/null)
    server_user=$(get_config_value "$config_file" "server.ssh_user" 2>/dev/null || echo "root")
    server_port=$(get_config_value "$config_file" "server.ssh_port" 2>/dev/null || echo "22")

    # Test connection
    local test_result
    test_result=$(ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o ConnectTimeout=10 -o BatchMode=yes -p "$server_port" "${server_user}@${server_host}" "echo 'OK'" 2>&1)

    if [ "$test_result" = "OK" ]; then
        log_success "SSH connection test successful"
        return 0
    else
        log_error "SSH connection test failed: $test_result"
        return 1
    fi
}

# Update GitHub Secrets
# Usage: update_github_secrets <tenant_id>
# Returns: 0 on success, 1 on failure
update_github_secrets() {
    local tenant_id="$1"

    log_info "Updating GitHub Secrets..."

    # Check if gh CLI is available
    if ! command -v gh &> /dev/null; then
        log_warning "gh CLI not found, skipping GitHub Secrets update"
        return 0
    fi

    # Check if authenticated
    if ! gh auth status &> /dev/null; then
        log_warning "Not authenticated with gh CLI, skipping GitHub Secrets update"
        return 0
    fi

    # Read private key content
    local key_content
    key_content=$(cat "$KEY_FILE")

    # Update secret
    local secret_name="SSH_PRIVATE_KEY_${tenant_id^^}"
    echo "$key_content" | gh secret set "$secret_name" 2>&1 | log_verbose

    if [ $? -eq 0 ]; then
        log_success "GitHub Secret updated: $secret_name"
        return 0
    else
        log_error "Failed to update GitHub Secret"
        return 1
    fi
}

# Record key creation to audit log
# Usage: record_key_creation <tenant_id>
# Returns: 0 on success, 1 on failure
record_key_creation() {
    local tenant_id="$1"

    log_debug "Recording SSH key creation to audit log..."

    # Initialize state database
    if ! state_init 2>/dev/null; then
        log_warning "Failed to initialize state database, skipping audit log"
        return 0
    fi

    # Get server host from tenant config
    local config_file="${CONFIG_DIR}/${tenant_id}.yml"
    local server_host
    server_host=$(get_config_value "$config_file" "server.host" 2>/dev/null || echo "")

    # Log the key creation
    local actor="${USER:-unknown}"
    local metadata="{\"action\":\"ssh_key_created\",\"fingerprint\":\"${KEY_FINGERPRINT}\",\"key_type\":\"${KEY_TYPE}\",\"key_path\":\"${KEY_FILE}\"}"

    if record_security_audit "$tenant_id" "key_rotation" "$actor" "created" "ssh_key" "$KEY_FINGERPRINT" "" "" "" "" "$metadata" 2>/dev/null; then
        log_debug "Key creation recorded to audit log"
    fi

    return 0
}

# Update tenant config with SSH key path
# Usage: update_tenant_config <tenant_id>
# Returns: 0 on success, 1 on failure
update_tenant_config() {
    local tenant_id="$1"

    log_debug "Updating tenant configuration..."

    local config_file="${CONFIG_DIR}/${tenant_id}.yml"

    # Check if ssh_key_path already exists in config
    local existing_path
    existing_path=$(get_config_value "$config_file" "server.ssh_key_path" 2>/dev/null)

    if [ -n "$existing_path" ]; then
        log_verbose "SSH key path already configured: $existing_path"
        return 0
    fi

    # Add ssh_key_path to config
    if [ -f "$config_file" ]; then
        # Use yq to add the path if available, otherwise append to file
        if command -v yq &> /dev/null; then
            yq eval ".server.ssh_key_path = \"${KEY_FILE}\"" -i "$config_file" 2>/dev/null
            log_debug "Added ssh_key_path to tenant config"
        else
            # Fallback: append to file
            echo "" >> "$config_file"
            echo "server:" >> "$config_file"
            echo "  ssh_key_path: $KEY_FILE" >> "$config_file"
            log_debug "Appended ssh_key_path to tenant config"
        fi
    fi

    return 0
}

#==============================================================================
# Main Execution
#==============================================================================

main() {
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --type)
                KEY_TYPE="$2"
                if [[ ! "$KEY_TYPE" =~ ^(ed25519|rsa)$ ]]; then
                    log_error "Invalid key type: $KEY_TYPE (must be ed25519 or rsa)"
                    exit 1
                fi
                shift 2
                ;;
            --comment)
                KEY_COMMENT="$2"
                shift 2
                ;;
            --github)
                UPDATE_GITHUB=true
                shift
                ;;
            --test)
                TEST_CONNECTION=true
                shift
                ;;
            --force)
                FORCE=true
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
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

    # Validate tenant configuration
    if ! validate_tenant "$TENANT_ID"; then
        log_error "Tenant validation failed"
        exit 1
    fi

    # Check for existing key
    local existing_key
    existing_key=$(check_existing_key "$TENANT_ID" || true)

    if [ -n "$existing_key" ] && [ "$FORCE" = "false" ]; then
        log_warning "SSH key already exists: $existing_key"
        echo -n "Continue and overwrite? (y/N): "
        read -r response
        if [[ ! "$response" =~ ^[Yy]$ ]]; then
            log_info "Setup cancelled"
            exit 0
        fi
        FORCE=true
    fi

    # Show setup plan
    echo
    echo -e "${BOLD}SSH Key Setup Plan${NC}"
    echo "======================================"
    echo "Tenant ID: $TENANT_ID"
    echo "Key Type: $KEY_TYPE"
    echo "Key Comment: ${KEY_COMMENT:-auto-generated}"
    echo "Key Path: ${SSH_DIR}/${TENANT_ID}_key"
    echo "Update GitHub: $UPDATE_GITHUB"
    echo "Test Connection: $TEST_CONNECTION"
    echo "Force Overwrite: $FORCE"
    echo "======================================"
    echo

    # Generate SSH key
    if ! generate_ssh_key "$TENANT_ID" "$KEY_TYPE" "$KEY_COMMENT"; then
        log_error "SSH key generation failed"
        exit 1
    fi

    # Deploy SSH key to server
    if ! deploy_ssh_key "$TENANT_ID"; then
        log_error "SSH key deployment failed"
        exit 1
    fi

    # Test connection if requested
    if [ "$TEST_CONNECTION" = "true" ]; then
        if ! test_ssh_connection "$TENANT_ID"; then
            log_warning "SSH connection test failed"
            log_warning "Key may not be properly deployed"
        fi
    fi

    # Update GitHub Secrets if requested
    if [ "$UPDATE_GITHUB" = "true" ]; then
        if ! update_github_secrets "$TENANT_ID"; then
            log_warning "GitHub Secrets update failed"
        fi
    fi

    # Update tenant config
    update_tenant_config "$TENANT_ID"

    # Record to audit log
    record_key_creation "$TENANT_ID"

    # Success summary
    echo
    echo -e "${BOLD}======================================"
    echo -e "${GREEN}SSH Key Setup Successful${NC}"
    echo -e "${BOLD}======================================${NC}"
    echo "Tenant ID: $TENANT_ID"
    echo "Key Type: $KEY_TYPE"
    echo "Fingerprint: $KEY_FINGERPRINT"
    echo "Private Key: $KEY_FILE"
    echo "Public Key: $PUB_KEY_FILE"
    echo
    echo -e "${CYAN}Public Key Content:${NC}"
    cat "$PUB_KEY_FILE"
    echo
    echo -e "${BOLD}======================================${NC}"
    echo

    exit 0
}

# Run main function
main "$@"
