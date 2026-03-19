#!/opt/homebrew/bin/bash
#==============================================================================
# Local Transfer Script
# (本地传输脚本)
#
# Purpose: Transfer files and Docker images to remote servers
#
# Features:
# - Efficient file transfer using rsync
# - Docker image transfer via docker save/load
# - Support for remote build mode (transfer code only)
# - Progress monitoring and verification
# - Configuration-driven transfers from tenant YAML files
#
# Usage:
#   ./local-transfer.sh <tenant_config_file> [options]
#
# Options:
#   --component <name>     Transfer specific component (all, backend, frontend)
#   --remote-build         Transfer code for remote build instead of images
#   --skip-images          Skip image transfer
#   --skip-code            Skip code transfer
#   --verbose              Enable verbose output
#   --dry-run              Show what would be transferred without transferring
#   --help                 Show this help message
#
# Examples:
#   ./local-transfer.sh config/tenants/test_tenant_alpha.yml
#   ./local-transfer.sh config/tenants/test_tenant_alpha.yml --component backend
#   ./local-transfer.sh config/tenants/test_tenant_alpha.yml --remote-build
#   ./local-transfer.sh config/tenants/test_tenant_alpha.yml --skip-code
#
# Dependencies:
# - scripts/lib/*.sh (all library files)
# - rsync (for efficient file transfer)
# - ssh (for remote operations)
# - docker (for image operations)
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

# Transfer configuration
TRANSFER_COMPONENT="all"
REMOTE_BUILD=false
SKIP_IMAGES=false
SKIP_CODE=false
DRY_RUN=false
VERBOSE=false

# Transfer state
TRANSFERRED_FILES=()
TRANSFERRED_IMAGES=()
TRANSFER_START_TIME=0
TRANSFER_END_TIME=0

# Version info
TRANSFER_VERSION="${TRANSFER_VERSION:-v1.0.0}"

#==============================================================================
# Source Libraries
#==============================================================================

# Source all required libraries
for lib in logging.sh error.sh config.sh ssh.sh; do
    if [[ -f "${LIB_DIR}/$lib" ]]; then
        source "${LIB_DIR}/$lib"
    else
        echo "ERROR: Required library not found: $lib" >&2
        exit 1
    fi
done

#==============================================================================
# Helper Functions
#==============================================================================

# Show usage information
show_usage() {
    cat << EOF
Usage: $(basename "$0") <tenant_config_file> [options]

Transfer files and Docker images to remote servers.

Arguments:
  tenant_config_file    Path to tenant YAML configuration file

Options:
  --component <name>     Transfer specific component (all, backend, frontend)
  --remote-build         Transfer code for remote build instead of images
  --skip-images          Skip image transfer
  --skip-code            Skip code transfer
  --verbose              Enable verbose output
  --dry-run              Show what would be transferred without transferring
  --help                 Show this help message

Transfer Modes:
  Image Transfer (default):  Transfer Docker images built locally
  Remote Build (--remote-build): Transfer source code for remote build

Examples:
  $(basename "$0") config/tenants/test_tenant_alpha.yml
  $(basename "$0") config/tenants/test_tenant_alpha.yml --component backend
  $(basename "$0") config/tenants/test_tenant_alpha.yml --remote-build
  $(basename "$0") config/tenants/test_tenant_alpha.yml --skip-code

EOF
}

# Parse command line arguments
parse_arguments() {
    local config_file=""

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --component)
                TRANSFER_COMPONENT="$2"
                shift 2
                ;;
            --remote-build)
                REMOTE_BUILD=true
                shift
                ;;
            --skip-images)
                SKIP_IMAGES=true
                shift
                ;;
            --skip-code)
                SKIP_CODE=true
                shift
                ;;
            --verbose)
                VERBOSE=true
                log_set_level DEBUG
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --help|-h)
                show_usage
                exit 0
                ;;
            -*)
                log_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
            *)
                if [[ -z "$config_file" ]]; then
                    config_file="$1"
                else
                    log_error "Multiple config files specified"
                    show_usage
                    exit 1
                fi
                shift
                ;;
        esac
    done

    # Validate config file
    if [[ -z "$config_file" ]]; then
        log_error "Configuration file is required"
        show_usage
        exit 1
    fi

    # Convert to absolute path
    if [[ ! "$config_file" =~ ^/ ]]; then
        config_file="${PROJECT_ROOT}/${config_file}"
    fi

    # Check if config file exists
    if [[ ! -f "$config_file" ]]; then
        log_error "Configuration file not found: $config_file"
        exit 1
    fi

    CONFIG_FILE="$config_file"

    # Validate component
    if [[ ! "$TRANSFER_COMPONENT" =~ ^(all|backend|frontend)$ ]]; then
        log_error "Invalid component: $TRANSFER_COMPONENT (must be: all, backend, frontend)"
        exit 1
    fi

    # Validate mutually exclusive options
    if [[ "$REMOTE_BUILD" == "true" && "$SKIP_CODE" == "true" ]]; then
        log_error "--remote-build and --skip-code are mutually exclusive"
        exit 1
    fi

    log_debug "Configuration file: $CONFIG_FILE"
    log_debug "Component: $TRANSFER_COMPONENT"
    log_debug "Remote build: $REMOTE_BUILD"
    log_debug "Skip images: $SKIP_IMAGES"
    log_debug "Skip code: $SKIP_CODE"
}

# Check transfer prerequisites
check_prerequisites() {
    log_step "Checking transfer prerequisites"

    local missing_tools=()

    # Check for required tools
    if ! command -v rsync &> /dev/null; then
        missing_tools+=("rsync")
    fi

    if ! command -v ssh &> /dev/null; then
        missing_tools+=("ssh")
    fi

    if ! command -v docker &> /dev/null && [[ "$REMOTE_BUILD" != "true" ]]; then
        missing_tools+=("docker")
    fi

    if [[ ${#missing_tools[@]} -gt 0 ]]; then
        log_error "Missing required tools: ${missing_tools[*]}"
        log_info "Install with: apt-get install ${missing_tools[*]}"
        return 1
    fi

    log_step_complete "Transfer prerequisites check passed"
    return 0
}

# Load tenant configuration
load_configuration() {
    log_step "Loading tenant configuration"

    # Load configuration
    if ! load_tenant_config "$CONFIG_FILE"; then
        log_step_failed "Failed to load tenant configuration"
        return 1
    fi

    # Get tenant ID from loaded config
    local tenant_id="${CONFIG_TENANT_ID:-}"

    if [[ -z "$tenant_id" ]]; then
        log_step_failed "Tenant ID not found in configuration"
        return 1
    fi

    log_info "Tenant ID: $tenant_id"

    log_step_complete "Configuration loaded successfully"
    return 0
}

# Test SSH connection
test_connection() {
    log_step "Testing SSH connection"

    local server_host="${CONFIG_SERVER_HOST:-}"
    local server_user="${CONFIG_SERVER_SSH_USER:-}"
    local ssh_key_path="${CONFIG_SERVER_SSH_KEY_PATH:-}"

    if [[ -z "$server_host" || -z "$server_user" ]]; then
        log_step_failed "Server host or SSH user not configured"
        return 1
    fi

    # Expand SSH key path
    ssh_key_path="${ssh_key_path/#\~/$HOME}"

    if [[ ! -f "$ssh_key_path" ]]; then
        log_step_failed "SSH key not found: $ssh_key_path"
        return 1
    fi

    # Configure SSH
    ssh_set_key "$ssh_key_path"

    # Test connection
    local ssh_target="${server_user}@${server_host}"
    if ! ssh_test "$ssh_target"; then
        log_step_failed "SSH connection test failed"
        return 1
    fi

    log_step_complete "SSH connection test successful"
    return 0
}

#==============================================================================
# Transfer Functions
#==============================================================================

# Transfer code files for remote build
transfer_code() {
    log_step "Transferring code files"

    if [[ "$SKIP_CODE" == "true" ]]; then
        log_info "Skipping code transfer (--skip-code specified)"
        return 0
    fi

    local server_host="${CONFIG_SERVER_HOST:-}"
    local server_user="${CONFIG_SERVER_SSH_USER:-}"
    local deploy_path="${CONFIG_SERVER_DEPLOY_PATH:-/opt/opclaw/platform}"
    local ssh_target="${server_user}@${server_host}"

    # Create deployment directory on remote
    log_info "Creating deployment directory on remote server"
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would create directory: $deploy_path"
    else
        ssh_exec "$ssh_target" "mkdir -p $deploy_path"
    fi

    # Transfer platform code
    if [[ "$TRANSFER_COMPONENT" == "all" || "$TRANSFER_COMPONENT" == "backend" ]]; then
        local backend_dir="${PROJECT_ROOT}/platform/backend"
        if [[ -d "$backend_dir" ]]; then
            log_info "Transferring backend code"
            if [[ "$DRY_RUN" == "true" ]]; then
                log_info "[DRY-RUN] Would rsync: $backend_dir/ -> ${ssh_target}:${deploy_path}/backend/"
            else
                rsync -avz --delete \
                    --exclude 'node_modules/' \
                    --exclude 'dist/' \
                    --exclude '.env*' \
                    --exclude '*.log' \
                    --exclude '.git/' \
                    "${backend_dir}/" "${ssh_target}:${deploy_path}/backend/"
                TRANSFERRED_FILES+=("${deploy_path}/backend/")
            fi
        fi
    fi

    # Transfer frontend code
    if [[ "$TRANSFER_COMPONENT" == "all" || "$TRANSFER_COMPONENT" == "frontend" ]]; then
        local frontend_dir="${PROJECT_ROOT}/platform/frontend"
        if [[ -d "$frontend_dir" ]]; then
            log_info "Transferring frontend code"
            if [[ "$DRY_RUN" == "true" ]]; then
                log_info "[DRY-RUN] Would rsync: $frontend_dir/ -> ${ssh_target}:${deploy_path}/frontend/"
            else
                rsync -avz --delete \
                    --exclude 'node_modules/' \
                    --exclude 'dist/' \
                    --exclude '.env*' \
                    --exclude '*.log' \
                    --exclude '.git/' \
                    "${frontend_dir}/" "${ssh_target}:${deploy_path}/frontend/"
                TRANSFERRED_FILES+=("${deploy_path}/frontend/")
            fi
        fi
    fi

    # Transfer docker-compose.yml
    local compose_file="${PROJECT_ROOT}/deployment/docker-compose.yml"
    if [[ -f "$compose_file" ]]; then
        log_info "Transferring docker-compose.yml"
        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "[DRY-RUN] Would rsync: $compose_file -> ${ssh_target}:${deploy_path}/"
        else
            rsync -avz "$compose_file" "${ssh_target}:${deploy_path}/"
            TRANSFERRED_FILES+=("${deploy_path}/docker-compose.yml")
        fi
    fi

    log_step_complete "Code files transferred successfully"
    return 0
}

# Transfer Docker images
transfer_images() {
    log_step "Transferring Docker images"

    if [[ "$SKIP_IMAGES" == "true" ]]; then
        log_info "Skipping image transfer (--skip-images specified)"
        return 0
    fi

    if [[ "$REMOTE_BUILD" == "true" ]]; then
        log_info "Skipping image transfer (--remote-build specified)"
        return 0
    fi

    local server_host="${CONFIG_SERVER_HOST:-}"
    local server_user="${CONFIG_SERVER_SSH_USER:-}"
    local ssh_target="${server_user}@${server_host}"
    local tenant_id="${CONFIG_TENANT_ID:-}"

    # Transfer backend image
    if [[ "$TRANSFER_COMPONENT" == "all" || "$TRANSFER_COMPONENT" == "backend" ]]; then
        local backend_image="opclaw-backend:${TRANSFER_VERSION}"
        if docker images "$backend_image" &> /dev/null; then
            log_info "Transferring backend image: $backend_image"

            if [[ "$DRY_RUN" == "true" ]]; then
                log_info "[DRY-RUN] Would transfer image: $backend_image"
            else
                # Save image to tar file
                local temp_tar="/tmp/${backend_image//:/_}.tar"
                log_info "Saving image to tar file..."
                docker save "$backend_image" -o "$temp_tar"

                # Transfer tar file
                log_info "Transferring tar file to remote..."
                rsync -avz --progress "$temp_tar" "${ssh_target}:/tmp/"

                # Load image on remote
                log_info "Loading image on remote..."
                ssh_exec "$ssh_target" "docker load -i /tmp/$(basename "$temp_tar")"

                # Cleanup local tar file
                rm -f "$temp_tar"

                # Cleanup remote tar file
                ssh_exec "$ssh_target" "rm -f /tmp/$(basename "$temp_tar")"

                TRANSFERRED_IMAGES+=("$backend_image")
            fi
        else
            log_warning "Backend image not found locally: $backend_image"
            log_info "You may need to run local-build.sh first"
        fi
    fi

    # Transfer frontend image
    if [[ "$TRANSFER_COMPONENT" == "all" || "$TRANSFER_COMPONENT" == "frontend" ]]; then
        local frontend_image="opclaw-frontend:${TRANSFER_VERSION}"
        if docker images "$frontend_image" &> /dev/null; then
            log_info "Transferring frontend image: $frontend_image"

            if [[ "$DRY_RUN" == "true" ]]; then
                log_info "[DRY-RUN] Would transfer image: $frontend_image"
            else
                # Save image to tar file
                local temp_tar="/tmp/${frontend_image//:/_}.tar"
                log_info "Saving image to tar file..."
                docker save "$frontend_image" -o "$temp_tar"

                # Transfer tar file
                log_info "Transferring tar file to remote..."
                rsync -avz --progress "$temp_tar" "${ssh_target}:/tmp/"

                # Load image on remote
                log_info "Loading image on remote..."
                ssh_exec "$ssh_target" "docker load -i /tmp/$(basename "$temp_tar")"

                # Cleanup local tar file
                rm -f "$temp_tar"

                # Cleanup remote tar file
                ssh_exec "$ssh_target" "rm -f /tmp/$(basename "$temp_tar")"

                TRANSFERRED_IMAGES+=("$frontend_image")
            fi
        else
            log_warning "Frontend image not found locally: $frontend_image"
            log_info "You may need to run local-build.sh first"
        fi
    fi

    log_step_complete "Docker images transferred successfully"
    return 0
}

# Verify transferred files
verify_transfers() {
    log_step "Verifying transferred files"

    local server_host="${CONFIG_SERVER_HOST:-}"
    local server_user="${CONFIG_SERVER_SSH_USER:-}"
    local deploy_path="${CONFIG_SERVER_DEPLOY_PATH:-/opt/opclaw/platform}"
    local ssh_target="${server_user}@${server_host}"

    # Verify code files
    for file in "${TRANSFERRED_FILES[@]}"; do
        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "[DRY-RUN] Would verify: $file"
        else
            if ssh_exec "$ssh_target" "[ -e $file ]"; then
                log_info "Verified: $file"
            else
                log_warning "File not found on remote: $file"
            fi
        fi
    done

    # Verify images
    for image in "${TRANSFERRED_IMAGES[@]}"; do
        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "[DRY-RUN] Would verify image: $image"
        else
            if ssh_exec "$ssh_target" "docker images $image &> /dev/null"; then
                log_info "Verified image: $image"
            else
                log_warning "Image not found on remote: $image"
            fi
        fi
    done

    log_step_complete "Transfer verification complete"
    return 0
}

# Display transfer summary
show_transfer_summary() {
    log_separator
    log_info "TRANSFER SUMMARY"
    log_separator

    log_info "Total files transferred: ${#TRANSFERRED_FILES[@]}"
    log_info "Total images transferred: ${#TRANSFERRED_IMAGES[@]}"
    log_info "Transfer time: $((TRANSFER_END_TIME - TRANSFER_START_TIME))s"

    if [[ ${#TRANSFERRED_FILES[@]} -gt 0 ]]; then
        log_separator
        log_info "Transferred files:"
        for file in "${TRANSFERRED_FILES[@]}"; do
            log_info "  - $file"
        done
    fi

    if [[ ${#TRANSFERRED_IMAGES[@]} -gt 0 ]]; then
        log_separator
        log_info "Transferred images:"
        for image in "${TRANSFERRED_IMAGES[@]}"; do
            log_info "  - $image"
        done
    fi

    log_separator
}

#==============================================================================
# Cleanup Functions
#==============================================================================

# Cleanup function
cleanup() {
    log_debug "Cleaning up..."

    # Unset sensitive environment variables
    unset CONFIG_FEISHU_APP_SECRET
    unset CONFIG_DATABASE_PASSWORD
    unset CONFIG_REDIS_PASSWORD
    unset CONFIG_JWT_SECRET
    unset CONFIG_AGENT_DEEPSEEK_API_KEY

    log_debug "Cleanup complete"
}

#==============================================================================
# Main Transfer Flow
#==============================================================================

# Main function
main() {
    log_section "Local File Transfer"
    log_info "Transfer version: $TRANSFER_VERSION"

    # Parse arguments
    parse_arguments "$@"

    # Initialize error handling
    error_init "$(basename "$0")"
    trap_errors
    register_cleanup_function "cleanup"

    # Record start time
    TRANSFER_START_TIME=$(date +%s)

    # Pre-transfer phase
    log_separator
    log_info "PRE-TRANSFER PHASE"
    log_separator

    check_prerequisites || exit 1
    load_configuration || exit 1
    test_connection || exit 1

    # Transfer phase
    log_separator
    log_info "TRANSFER PHASE"
    log_separator

    if [[ "$REMOTE_BUILD" == "true" ]]; then
        transfer_code || exit 1
    else
        transfer_code || exit 1
        transfer_images || exit 1
    fi

    # Post-transfer phase
    log_separator
    log_info "POST-TRANSFER PHASE"
    log_separator

    verify_transfers || exit 1

    # Record end time
    TRANSFER_END_TIME=$(date +%s)

    # Show summary
    show_transfer_summary

    # Success
    log_success "Transfer completed successfully!"
    exit_with_success "Transfer completed"
}

#==============================================================================
# Script Entry Point
#==============================================================================

# Run main function
main "$@"
