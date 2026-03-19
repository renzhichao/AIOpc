#!/opt/homebrew/bin/bash
#==============================================================================
# SSH Key Rotation Script
# (SSH密钥轮换脚本)
#
# Purpose: Rotate SSH keys for tenant deployments with automated deployment,
#          GitHub Secrets update, and audit logging
#
# Usage:
#   scripts/security/rotate-ssh-key.sh [options]
#   --tenant TID      Rotate key for specific tenant
#   --all             Rotate keys for all tenants
#   --type TYPE       Key type (ed25519|rsa) - default: ed25519
#   --days N          Auto-rotate keys older than N days (default: 90)
#   --dry-run         Show what would be done
#   --force           Skip confirmation prompts
#   --keep-old        Keep old key (don't remove from servers)
#   --archive-dir DIR Archive directory (default: /var/backups/ssh-keys)
#   --github          Update GitHub Secrets (requires gh CLI)
#   --no-backup       Skip backup of old key
#
# Examples:
#   scripts/security/rotate-ssh-key.sh --tenant tenant_001
#   scripts/security/rotate-ssh-key.sh --all --days 90
#   scripts/security/rotate-ssh-key.sh --tenant tenant_001 --dry-run
#
# Workflow:
#   1. Generate new key pair
#   2. Test new key connectivity
#   3. Deploy new key to servers
#   4. Update GitHub Secrets (if --github)
#   5. Update tenant configs (if needed)
#   6. Verify all operations work with new key
#   7. Archive old key (encrypt and store)
#   8. Remove old key from servers
#   9. Record rotation to audit log
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
ARCHIVE_DIR="${ARCHIVE_DIR:-/var/backups/ssh-keys}"

# Source required libraries
source "${LIB_DIR}/logging.sh" 2>/dev/null || { echo "ERROR: logging.sh not found"; exit 1; }
source "${LIB_DIR}/error.sh" 2>/dev/null || { echo "ERROR: error.sh not found"; exit 1; }
source "${LIB_DIR}/state.sh" 2>/dev/null || { echo "ERROR: state.sh not found"; exit 1; }
source "${LIB_DIR}/config.sh" 2>/dev/null || { echo "ERROR: config.sh not found"; exit 1; }

# Default values
TENANT_ID=""
ROTATE_ALL=false
KEY_TYPE="ed25519"
KEY_AGE_DAYS=90
DRY_RUN=false
FORCE=false
KEEP_OLD=false
UPDATE_GITHUB=false
SKIP_BACKUP=false
VERBOSE=false

# Key rotation state
declare -a ROTATED_TENANTS=()
declare -a FAILED_TENANTS=()
declare -a BACKUP_FILES=()

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
Usage: ${0##*/} [options]

Rotate SSH keys for tenant deployments with automated deployment and audit logging.

Arguments:
  --tenant TID           Rotate key for specific tenant
  --all                  Rotate keys for all tenants

Options:
  --type TYPE            Key type (ed25519|rsa) [default: ed25519]
  --days N               Auto-rotate keys older than N days [default: 90]
  --dry-run              Show what would be done without making changes
  --force                Skip confirmation prompts
  --keep-old             Keep old key (don't remove from servers)
  --archive-dir DIR      Archive directory [default: /var/backups/ssh-keys]
  --github               Update GitHub Secrets (requires gh CLI)
  --no-backup            Skip backup of old key
  -v, --verbose          Show detailed output
  -h, --help             Show this help message

Examples:
  ${0##*/} --tenant tenant_001
  ${0##*/} --all --days 90
  ${0##*/} --tenant tenant_001 --dry-run --verbose
  ${0##*/} --tenant tenant_001 --github --type rsa

EOF
}

log_verbose() {
    if [ "$VERBOSE" = "true" ]; then
        echo -e "${CYAN}[VERBOSE]${NC} $*" >&2
    fi
}

# Generate SSH key pair
# Usage: generate_ssh_key <key_type> <output_file> [comment]
# Returns: 0 on success, 1 on failure
generate_ssh_key() {
    local key_type="$1"
    local output_file="$2"
    local comment="${3:-ssh-key-rotation-$(date +%Y%m%d)}"

    log_info "Generating new SSH key pair (type: $key_type)..."

    # Check if key already exists
    if [ -f "$output_file" ]; then
        log_error "SSH key already exists: $output_file"
        return 1
    fi

    # Generate key based on type
    local keygen_args=()

    case "$key_type" in
        ed25519)
            keygen_args=(-t ed25519 -a 100 -C "$comment")
            ;;
        rsa)
            keygen_args=(-t rsa -b 4096 -a 100 -C "$comment")
            ;;
        *)
            log_error "Invalid key type: $key_type (must be ed25519 or rsa)"
            return 1
            ;;
    esac

    # Generate the key
    if [ "$DRY_RUN" = "true" ]; then
        log_verbose "[DRY-RUN] Would generate SSH key: $output_file"
        echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEdryRunPhoto /tmp/key_${TENANT_ID}_$(date +%s)" > "${output_file}.pub"
        return 0
    fi

    ssh-keygen "${keygen_args[@]}" -f "$output_file" -N "" 2>&1 | while IFS= read -r line; do
        log_verbose "$line"
    done

    if [ $? -ne 0 ]; then
        log_error "Failed to generate SSH key"
        return 1
    fi

    # Set proper permissions
    chmod 600 "$output_file"
    chmod 644 "${output_file}.pub"

    log_success "SSH key generated: $output_file"
    return 0
}

# Get SSH key fingerprint
# Usage: get_ssh_key_fingerprint <public_key_file>
# Returns: Fingerprint string
get_ssh_key_fingerprint() {
    local pub_key="$1"

    if [ ! -f "$pub_key" ]; then
        log_error "Public key file not found: $pub_key"
        return 1
    fi

    ssh-keygen -lf "$pub_key" | awk '{print $2}'
}

# Test SSH connection with key
# Usage: test_ssh_connection <private_key_file> <host> <user> [port]
# Returns: 0 on success, 1 on failure
test_ssh_connection() {
    local key_file="$1"
    local host="$2"
    local user="${3:-root}"
    local port="${4:-22}"

    log_info "Testing SSH connection to ${user}@${host}:${port}..."

    if [ "$DRY_RUN" = "true" ]; then
        log_verbose "[DRY-RUN] Would test SSH connection to ${user}@${host}:${port}"
        return 0
    fi

    local test_result
    test_result=$(ssh -i "$key_file" -o StrictHostKeyChecking=no -o ConnectTimeout=10 -o BatchMode=yes -p "$port" "${user}@${host}" "echo 'OK'" 2>&1)

    if [ "$test_result" = "OK" ]; then
        log_success "SSH connection test successful"
        return 0
    else
        log_error "SSH connection test failed: $test_result"
        return 1
    fi
}

# Deploy SSH key to server
# Usage: deploy_ssh_key <private_key_file> <public_key_file> <host> <user> [port]
# Returns: 0 on success, 1 on failure
deploy_ssh_key() {
    local priv_key="$1"
    local pub_key="$2"
    local host="$3"
    local user="${4:-root}"
    local port="${5:-22}"

    log_info "Deploying SSH key to ${user}@${host}:${port}..."

    if [ "$DRY_RUN" = "true" ]; then
        log_verbose "[DRY-RUN] Would deploy SSH key to ${user}@${host}:${port}"
        return 0
    fi

    # Read public key content
    local pub_key_content
    pub_key_content=$(cat "$pub_key")

    # Add public key to authorized_keys on remote server
    local ssh_result
    ssh_result=$(ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -p "$port" "${user}@${host}" "
        mkdir -p ~/.ssh
        chmod 700 ~/.ssh
        echo '$pub_key_content' >> ~/.ssh/authorized_keys
        chmod 600 ~/.ssh/authorized_keys
        echo 'OK'
    " 2>&1)

    if [ "$ssh_result" = "OK" ]; then
        log_success "SSH key deployed successfully"
        return 0
    else
        log_error "Failed to deploy SSH key: $ssh_result"
        return 1
    fi
}

# Remove SSH key from server
# Usage: remove_ssh_key <public_key_file> <host> <user> [port]
# Returns: 0 on success, 1 on failure
remove_ssh_key() {
    local pub_key="$1"
    local host="$2"
    local user="${3:-root}"
    local port="${4:-22}"

    log_info "Removing old SSH key from ${user}@${host}:${port}..."

    if [ "$DRY_RUN" = "true" ]; then
        log_verbose "[DRY-RUN] Would remove SSH key from ${user}@${host}:${port}"
        return 0
    fi

    # Get fingerprint of key to remove
    local fingerprint
    fingerprint=$(get_ssh_key_fingerprint "$pub_key")

    # Remove key from authorized_keys
    local ssh_result
    ssh_result=$(ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -p "$port" "${user}@${host}" "
        # Create backup
        cp ~/.ssh/authorized_keys ~/.ssh/authorized_keys.bak
        # Remove line containing the fingerprint
        grep -v '$fingerprint' ~/.ssh/authorized_keys.bak > ~/.ssh/authorized_keys || true
        echo 'OK'
    " 2>&1)

    if [ "$ssh_result" = "OK" ]; then
        log_success "Old SSH key removed successfully"
        return 0
    else
        log_error "Failed to remove SSH key: $ssh_result"
        return 1
    fi
}

# Archive old SSH key
# Usage: archive_ssh_key <private_key_file> <public_key_file> <tenant_id>
# Returns: 0 on success, 1 on failure
archive_ssh_key() {
    local priv_key="$1"
    local pub_key="$2"
    local tenant_id="$3"

    log_info "Archiving old SSH key..."

    if [ "$SKIP_BACKUP" = "true" ]; then
        log_warning "Backup skipped (--no-backup flag)"
        return 0
    fi

    # Create archive directory
    local archive_dir="${ARCHIVE_DIR}/${tenant_id}"
    mkdir -p "$archive_dir"

    # Create archive filename with timestamp
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local archive_base="${archive_dir}/ssh_key_${timestamp}"

    if [ "$DRY_RUN" = "true" ]; then
        log_verbose "[DRY-RUN] Would archive SSH key to ${archive_base}.tar.gz"
        BACKUP_FILES+=("${archive_base}.tar.gz")
        return 0
    fi

    # Encrypt and archive private key
    local encrypted_key="${archive_base}.key.enc"
    openssl enc -aes-256-cbc -salt -pbkdf2 -in "$priv_key" -out "$encrypted_key" -k "$(hostname)_${tenant_id}" 2>/dev/null

    if [ $? -ne 0 ]; then
        log_error "Failed to encrypt private key"
        return 1
    fi

    # Copy public key
    cp "$pub_key" "${archive_base}.pub"

    # Create tar.gz archive
    tar -czf "${archive_base}.tar.gz" -C "$archive_dir" "$(basename "$encrypted_key")" "$(basename "${archive_base}.pub")" 2>/dev/null

    if [ $? -eq 0 ]; then
        # Remove individual files, keep only archive
        rm -f "$encrypted_key" "${archive_base}.pub"
        BACKUP_FILES+=("${archive_base}.tar.gz")
        log_success "SSH key archived to: ${archive_base}.tar.gz"
        return 0
    else
        log_error "Failed to create archive"
        return 1
    fi
}

# Update GitHub Secrets
# Usage: update_github_secrets <private_key_file> <repo> [key_name]
# Returns: 0 on success, 1 on failure
update_github_secrets() {
    local key_file="$1"
    local repo="${2:-}"
    local key_name="${3:-SSH_PRIVATE_KEY}"

    log_info "Updating GitHub Secrets..."

    if [ "$DRY_RUN" = "true" ]; then
        log_verbose "[DRY-RUN] Would update GitHub Secret: $key_name"
        return 0
    fi

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
    key_content=$(cat "$key_file")

    # Update secret
    if [ -n "$repo" ]; then
        echo "$key_content" | gh secret set "$key_name" -R "$repo" 2>&1 | log_verbose
    else
        echo "$key_content" | gh secret set "$key_name" 2>&1 | log_verbose
    fi

    if [ $? -eq 0 ]; then
        log_success "GitHub Secret updated: $key_name"
        return 0
    else
        log_error "Failed to update GitHub Secret"
        return 1
    fi
}

# Record SSH key rotation to audit log
# Usage: record_rotation <tenant_id> <old_fingerprint> <new_fingerprint> <key_type>
# Returns: 0 on success, 1 on failure
record_rotation() {
    local tenant_id="$1"
    local old_fingerprint="$2"
    local new_fingerprint="$3"
    local key_type="$4"

    log_debug "Recording SSH key rotation to audit log..."

    if [ "$DRY_RUN" = "true" ]; then
        log_verbose "[DRY-RUN] Would record rotation to audit log"
        return 0
    fi

    # Initialize state database
    if ! state_init 2>/dev/null; then
        log_warning "Failed to initialize state database, skipping audit log"
        return 0
    fi

    # Get server host from tenant config
    local config_file="${CONFIG_DIR}/${tenant_id}.yml"
    local server_host=""
    if [ -f "$config_file" ]; then
        server_host=$(get_config_value "$config_file" "server.host" 2>/dev/null || echo "")
    fi

    # Log the rotation using security audit function
    local actor="${USER:-unknown}"
    local metadata="{\"action\":\"ssh_key_rotation\",\"old_fingerprint\":\"${old_fingerprint}\",\"new_fingerprint\":\"${new_fingerprint}\",\"key_type\":\"${key_type}\"}"

    if record_security_audit "$tenant_id" "key_rotation" "$actor" "rotated" "ssh_key" "$new_fingerprint" "" "" "$old_fingerprint" "$metadata" 2>/dev/null; then
        log_debug "Rotation recorded to security audit log"
    fi

    return 0
}

# Get SSH key age in days
# Usage: get_key_age <key_file>
# Returns: Age in days
get_key_age() {
    local key_file="$1"

    if [ ! -f "$key_file" ]; then
        echo "9999"
        return
    fi

    local key_mtime
    key_mtime=$(stat -f "%m" "$key_file" 2>/dev/null || stat -c "%Y" "$key_file" 2>/dev/null)
    local current_time
    current_time=$(date +%s)
    local age_seconds=$((current_time - key_mtime))
    local age_days=$((age_seconds / 86400))

    echo "$age_days"
}

# Rotate SSH key for a single tenant
# Usage: rotate_tenant_key <tenant_id>
# Returns: 0 on success, 1 on failure
rotate_tenant_key() {
    local tenant_id="$1"

    log_info "======================================"
    log_info "Rotating SSH key for tenant: $tenant_id"
    log_info "======================================"

    # Get tenant config
    local config_file="${CONFIG_DIR}/${tenant_id}.yml"
    if [ ! -f "$config_file" ]; then
        log_error "Tenant config not found: $config_file"
        FAILED_TENANTS+=("$tenant_id:config_not_found")
        return 1
    fi

    # Get server configuration
    local server_host
    local server_user
    local server_port
    local ssh_key_path

    server_host=$(get_config_value "$config_file" "server.host" 2>/dev/null)
    server_user=$(get_config_value "$config_file" "server.ssh_user" 2>/dev/null || echo "root")
    server_port=$(get_config_value "$config_file" "server.ssh_port" 2>/dev/null || echo "22")
    ssh_key_path=$(get_config_value "$config_file" "server.ssh_key_path" 2>/dev/null)

    if [ -z "$server_host" ]; then
        log_error "Server host not configured for tenant: $tenant_id"
        FAILED_TENANTS+=("$tenant_id:no_server_host")
        return 1
    fi

    # Determine current SSH key path
    local current_key=""
    if [ -n "$ssh_key_path" ] && [ -f "$ssh_key_path" ]; then
        current_key="$ssh_key_path"
    else
        # Check default SSH key location
        current_key="${HOME}/.ssh/id_${tenant_id}"
        if [ ! -f "$current_key" ]; then
            current_key="${HOME}/.ssh/${tenant_id}_key"
        fi
    fi

    # Check if key needs rotation
    if [ -f "$current_key" ]; then
        local key_age
        key_age=$(get_key_age "$current_key")
        if [ "$key_age" -lt "$KEY_AGE_DAYS" ]; then
            log_info "Key age: $key_age days (threshold: $KEY_AGE_DAYS days), skipping rotation"
            return 0
        fi
        log_warning "Key age: $key_age days exceeds threshold of $KEY_AGE_DAYS days"
    else
        log_warning "No existing SSH key found, will create new key"
        current_key=""
    fi

    # Generate temporary filenames for new keys
    local temp_dir="/tmp/ssh_key_rotation_${tenant_id}_$(date +%s)"
    mkdir -p "$temp_dir"
    local new_key="${temp_dir}/key_${tenant_id}"
    local new_pub="${new_key}.pub"

    # Get old key fingerprint for audit
    local old_fingerprint=""
    if [ -n "$current_key" ] && [ -f "$current_key" ]; then
        old_fingerprint=$(get_ssh_key_fingerprint "${current_key}.pub")
        log_info "Old key fingerprint: $old_fingerprint"
    fi

    # Generate new key pair
    if ! generate_ssh_key "$KEY_TYPE" "$new_key" "ssh-key-${tenant_id}-$(date +%Y%m%d)"; then
        log_error "Failed to generate new SSH key"
        rm -rf "$temp_dir"
        FAILED_TENANTS+=("$tenant_id:key_generation_failed")
        return 1
    fi

    # Get new key fingerprint
    local new_fingerprint
    new_fingerprint=$(get_ssh_key_fingerprint "$new_pub")
    log_info "New key fingerprint: $new_fingerprint"

    # Test new key connectivity
    if ! test_ssh_connection "$new_key" "$server_host" "$server_user" "$server_port"; then
        log_error "New SSH key connectivity test failed"
        rm -rf "$temp_dir"
        FAILED_TENANTS+=("$tenant_id:connectivity_test_failed")
        return 1
    fi

    # Deploy new key to server
    if ! deploy_ssh_key "$new_key" "$new_pub" "$server_host" "$server_user" "$server_port"; then
        log_error "Failed to deploy new SSH key to server"
        rm -rf "$temp_dir"
        FAILED_TENANTS+=("$tenant_id:deployment_failed")
        return 1
    fi

    # Update GitHub Secrets if requested
    if [ "$UPDATE_GITHUB" = "true" ]; then
        if ! update_github_secrets "$new_key"; then
            log_warning "GitHub Secrets update failed, but continuing with rotation"
        fi
    fi

    # Verify new key works
    if ! test_ssh_connection "$new_key" "$server_host" "$server_user" "$server_port"; then
        log_error "New SSH key verification failed after deployment"
        rm -rf "$temp_dir"
        FAILED_TENANTS+=("$tenant_id:verification_failed")
        return 1
    fi

    # Archive old key if exists
    if [ -n "$current_key" ] && [ -f "$current_key" ]; then
        if ! archive_ssh_key "$current_key" "${current_key}.pub" "$tenant_id"; then
            log_warning "Failed to archive old key, continuing with rotation"
        fi
    fi

    # Remove old key from server (unless --keep-old)
    if [ "$KEEP_OLD" = "false" ] && [ -n "$current_key" ] && [ -f "${current_key}.pub" ]; then
        if ! remove_ssh_key "${current_key}.pub" "$server_host" "$server_user" "$server_port"; then
            log_warning "Failed to remove old key from server, manual cleanup may be required"
        fi
    fi

    # Record rotation to audit log
    record_rotation "$tenant_id" "$old_fingerprint" "$new_fingerprint" "$KEY_TYPE"

    # Move new key to permanent location
    local final_key="${HOME}/.ssh/${tenant_id}_key"
    if [ "$DRY_RUN" = "false" ]; then
        mv "$new_key" "$final_key"
        mv "$new_pub" "${final_key}.pub"
        chmod 600 "$final_key"
        chmod 644 "${final_key}.pub"
        log_success "New SSH key installed: $final_key"
    else
        log_verbose "[DRY-RUN] Would move new key to: $final_key"
    fi

    # Cleanup temp directory
    rm -rf "$temp_dir"

    ROTATED_TENANTS+=("$tenant_id")
    log_success "SSH key rotation completed for tenant: $tenant_id"
    return 0
}

#==============================================================================
# Main Execution
#==============================================================================

main() {
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --tenant)
                TENANT_ID="$2"
                shift 2
                ;;
            --all)
                ROTATE_ALL=true
                shift
                ;;
            --type)
                KEY_TYPE="$2"
                if [[ ! "$KEY_TYPE" =~ ^(ed25519|rsa)$ ]]; then
                    log_error "Invalid key type: $KEY_TYPE (must be ed25519 or rsa)"
                    exit 1
                fi
                shift 2
                ;;
            --days)
                KEY_AGE_DAYS="$2"
                if ! [[ "$KEY_AGE_DAYS" =~ ^[0-9]+$ ]]; then
                    log_error "Invalid days value: $KEY_AGE_DAYS (must be a positive integer)"
                    exit 1
                fi
                shift 2
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --force)
                FORCE=true
                shift
                ;;
            --keep-old)
                KEEP_OLD=true
                shift
                ;;
            --archive-dir)
                ARCHIVE_DIR="$2"
                shift 2
                ;;
            --github)
                UPDATE_GITHUB=true
                shift
                ;;
            --no-backup)
                SKIP_BACKUP=true
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
            *)
                log_error "Unknown option: $1"
                print_usage
                exit 1
                ;;
        esac
    done

    # Validate arguments
    if [ -z "$TENANT_ID" ] && [ "$ROTATE_ALL" = "false" ]; then
        log_error "Either --tenant or --all must be specified"
        print_usage
        exit 1
    fi

    if [ -n "$TENANT_ID" ] && [ "$ROTATE_ALL" = "true" ]; then
        log_error "Cannot specify both --tenant and --all"
        exit 1
    fi

    # Show rotation plan
    echo
    echo -e "${BOLD}SSH Key Rotation Plan${NC}"
    echo "======================================"
    echo "Key Type: $KEY_TYPE"
    echo "Age Threshold: $KEY_AGE_DAYS days"
    echo "Archive Directory: $ARCHIVE_DIR"
    echo "Update GitHub: $UPDATE_GITHUB"
    echo "Keep Old Keys: $KEEP_OLD"
    echo "Skip Backup: $SKIP_BACKUP"
    echo "Dry Run: $DRY_RUN"
    echo "======================================"
    echo

    if [ "$DRY_RUN" = "true" ]; then
        log_warning "DRY-RUN mode: No actual changes will be made"
    fi

    # Confirmation prompt
    if [ "$FORCE" = "false" ] && [ "$DRY_RUN" = "false" ]; then
        echo -n "Continue with SSH key rotation? (y/N): "
        read -r response
        if [[ ! "$response" =~ ^[Yy]$ ]]; then
            log_info "Rotation cancelled"
            exit 0
        fi
    fi

    # Create archive directory
    if [ "$DRY_RUN" = "false" ]; then
        mkdir -p "$ARCHIVE_DIR"
    fi

    # Get list of tenants to process
    local tenants_to_process=()

    if [ "$ROTATE_ALL" = "true" ]; then
        # Get all tenant config files
        for config_file in "${CONFIG_DIR}"/*.yml; do
            if [ -f "$config_file" ]; then
                local tenant_name
                tenant_name=$(basename "$config_file" .yml)
                tenants_to_process+=("$tenant_name")
            fi
        done
    else
        tenants_to_process=("$TENANT_ID")
    fi

    # Process each tenant
    local total=${#tenants_to_process[@]}
    local current=0

    for tenant in "${tenants_to_process[@]}"; do
        ((current++))
        log_info "Processing tenant $current of $total: $tenant"
        rotate_tenant_key "$tenant" || true
        echo
    done

    # Summary
    echo
    echo -e "${BOLD}======================================"
    echo -e "SSH Key Rotation Summary${NC}"
    echo -e "${BOLD}======================================${NC}"
    echo "Total tenants processed: $total"
    echo "Successful rotations: ${#ROTATED_TENANTS[@]}"
    echo "Failed rotations: ${#FAILED_TENANTS[@]}"

    if [ ${#ROTATED_TENANTS[@]} -gt 0 ]; then
        echo
        echo -e "${GREEN}Successfully rotated:${NC}"
        for tenant in "${ROTATED_TENANTS[@]}"; do
            echo "  ✓ $tenant"
        done
    fi

    if [ ${#FAILED_TENANTS[@]} -gt 0 ]; then
        echo
        echo -e "${RED}Failed rotations:${NC}"
        for failure in "${FAILED_TENANTS[@]}"; do
            echo "  ✗ $failure"
        done
    fi

    if [ ${#BACKUP_FILES[@]} -gt 0 ]; then
        echo
        echo -e "${CYAN}Backup files created:${NC}"
        for backup in "${BACKUP_FILES[@]}"; do
            echo "  📦 $backup"
        done
    fi

    echo -e "${BOLD}======================================${NC}"
    echo

    # Exit with error if any rotations failed
    if [ ${#FAILED_TENANTS[@]} -gt 0 ]; then
        exit 1
    fi

    exit 0
}

# Run main function
main "$@"
