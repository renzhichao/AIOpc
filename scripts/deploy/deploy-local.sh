#!/opt/homebrew/bin/bash
#==============================================================================
# Local Deployment Script
# (本地部署脚本)
#
# Purpose: Orchestrate local deployment without GitHub Actions dependency
#
# Features:
# - Local Docker image building
# - Local file and image transfer to remote servers
# - Configuration-driven deployment from tenant YAML files
# - Pre-deployment validation and checks
# - Atomic deployment with automatic rollback on failure
# - Health check integration
# - State database recording
# - Feature parity with GitHub Actions deployment
#
# Usage:
#   ./deploy-local.sh <tenant_config_file> [options]
#
# Options:
#   --build-only           Only build images, don't deploy
#   --transfer-only        Only transfer files, don't build
#   --remote-build         Build on remote server instead of local
#   --dry-run              Show what would be deployed without making changes
#   --skip-health-check    Skip post-deployment health checks
#   --skip-backup          Skip pre-deployment backup
#   --force                Force deployment even if concurrent deployment detected
#   --component <name>     Deploy specific component (all, backend, frontend)
#   --verbose              Enable verbose output
#   --help                 Show this help message
#
# Examples:
#   ./deploy-local.sh config/tenants/test_tenant_alpha.yml
#   ./deploy-local.sh config/tenants/test_tenant_alpha.yml --component backend
#   ./deploy-local.sh config/tenants/test_tenant_alpha.yml --build-only
#   ./deploy-local.sh config/tenants/test_tenant_alpha.yml --remote-build
#   ./deploy-local.sh config/tenants/test_tenant_alpha.yml --dry-run
#
# Dependencies:
# - scripts/deploy/local-build.sh (local Docker build)
# - scripts/deploy/local-transfer.sh (local file transfer)
# - scripts/lib/*.sh (all library files)
# - docker (for container operations)
# - rsync (for efficient file transfer)
# - ssh (for remote deployment)
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

# Deployment modes
BUILD_ONLY=false
TRANSFER_ONLY=false
REMOTE_BUILD=false

# Deployment configuration
DRY_RUN=false
SKIP_HEALTH_CHECK=false
SKIP_BACKUP=false
FORCE_DEPLOY=false
DEPLOY_COMPONENT="all"
VERBOSE=false

# Deployment state
DEPLOYMENT_ID=""
CONFIG_FILE=""
TENANT_ID=""
BACKUP_FILES=()
ROLLBACK_SNAPSHOT=""
DEPLOYMENT_STARTED=false

# Build state
LOCAL_IMAGES_BUILT=()
REMOTE_IMAGES_LOADED=()

# Version info
DEPLOYMENT_VERSION="${DEPLOYMENT_VERSION:-v1.0.0}"
GIT_COMMIT_SHA="${GIT_COMMIT_SHA:-$(git rev-parse HEAD 2>/dev/null || echo 'unknown')}"
GIT_BRANCH="${GIT_BRANCH:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')}"

#==============================================================================
# Source Libraries
#==============================================================================

# Source all required libraries
for lib in logging.sh error.sh config.sh validation.sh state.sh ssh.sh file.sh; do
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

Deploy a tenant instance locally without GitHub Actions dependency.

Arguments:
  tenant_config_file    Path to tenant YAML configuration file

Options:
  --build-only           Only build images, don't deploy
  --transfer-only        Only transfer files, don't build
  --remote-build         Build on remote server instead of local
  --dry-run              Show what would be deployed without making changes
  --skip-health-check    Skip post-deployment health checks
  --skip-backup          Skip pre-deployment backup
  --force                Force deployment even if concurrent deployment detected
  --component <name>     Deploy specific component (all, backend, frontend)
  --verbose              Enable verbose output
  --help                 Show this help message

Deployment Modes:
  Local Build (default):  Build Docker images locally, transfer to remote
  Remote Build (--remote-build): Transfer code, build on remote server
  Build Only (--build-only): Only build images, skip deployment
  Transfer Only (--transfer-only): Only transfer files, skip build

Examples:
  $(basename "$0") config/tenants/test_tenant_alpha.yml
  $(basename "$0") config/tenants/test_tenant_alpha.yml --component backend
  $(basename "$0") config/tenants/test_tenant_alpha.yml --build-only
  $(basename "$0") config/tenants/test_tenant_alpha.yml --remote-build
  $(basename "$0") config/tenants/test_tenant_alpha.yml --dry-run

EOF
}

# Parse command line arguments
parse_arguments() {
    local config_file=""

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --build-only)
                BUILD_ONLY=true
                shift
                ;;
            --transfer-only)
                TRANSFER_ONLY=true
                shift
                ;;
            --remote-build)
                REMOTE_BUILD=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --skip-health-check)
                SKIP_HEALTH_CHECK=true
                shift
                ;;
            --skip-backup)
                SKIP_BACKUP=true
                shift
                ;;
            --force)
                FORCE_DEPLOY=true
                shift
                ;;
            --component)
                DEPLOY_COMPONENT="$2"
                shift 2
                ;;
            --verbose)
                VERBOSE=true
                log_set_level DEBUG
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
    if [[ ! "$DEPLOY_COMPONENT" =~ ^(all|backend|frontend|database)$ ]]; then
        log_error "Invalid component: $DEPLOY_COMPONENT (must be: all, backend, frontend, database)"
        exit 1
    fi

    # Validate mutually exclusive options
    if [[ "$BUILD_ONLY" == "true" && "$TRANSFER_ONLY" == "true" ]]; then
        log_error "--build-only and --transfer-only are mutually exclusive"
        exit 1
    fi

    if [[ "$BUILD_ONLY" == "true" && "$REMOTE_BUILD" == "true" ]]; then
        log_error "--build-only and --remote-build are mutually exclusive"
        exit 1
    fi

    log_debug "Configuration file: $CONFIG_FILE"
    log_debug "Component: $DEPLOY_COMPONENT"
    log_debug "Dry run: $DRY_RUN"
    log_debug "Build only: $BUILD_ONLY"
    log_debug "Transfer only: $TRANSFER_ONLY"
    log_debug "Remote build: $REMOTE_BUILD"
}

#==============================================================================
# Pre-Deployment Functions
#==============================================================================

# Load and validate tenant configuration
load_tenant_configuration() {
    log_step "Loading tenant configuration"

    # Load configuration
    if ! load_tenant_config "$CONFIG_FILE"; then
        log_step_failed "Failed to load tenant configuration"
        return 1
    fi

    # Get tenant ID from loaded config
    TENANT_ID="${CONFIG_TENANT_ID:-}"

    if [[ -z "$TENANT_ID" ]]; then
        log_step_failed "Tenant ID not found in configuration"
        return 1
    fi

    log_info "Tenant ID: $TENANT_ID"
    log_info "Environment: ${CONFIG_TENANT_ENVIRONMENT:-unknown}"

    # Validate configuration
    log_step "Validating tenant configuration"
    if ! validate_config "$CONFIG_FILE"; then
        log_step_failed "Configuration validation failed"
        return 1
    fi

    # Run comprehensive validation
    log_step "Running comprehensive validation"
    if ! validate_config_comprehensive "$CONFIG_FILE"; then
        log_step_failed "Comprehensive validation failed"
        return 1
    fi

    log_step_complete "Configuration loaded and validated"
    return 0
}

# Check local prerequisites
check_local_prerequisites() {
    log_step "Checking local prerequisites"

    local missing_tools=()

    # Check for required tools
    if ! command -v docker &> /dev/null; then
        missing_tools+=("docker")
    fi

    if ! command -v rsync &> /dev/null; then
        missing_tools+=("rsync")
    fi

    if ! command -v ssh &> /dev/null; then
        missing_tools+=("ssh")
    fi

    if [[ ${#missing_tools[@]} -gt 0 ]]; then
        log_error "Missing required tools: ${missing_tools[*]}"
        log_info "Install with: apt-get install ${missing_tools[*]}"
        return 1
    fi

    # Check Docker daemon is running
    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        return 1
    fi

    log_step_complete "Local prerequisites check passed"
    return 0
}

# Check for concurrent deployments
check_concurrent_deployments() {
    log_step "Checking for concurrent deployments"

    # Initialize state database
    if ! state_init; then
        log_warning "Failed to initialize state database, skipping concurrent deployment check"
        return 0
    fi

    # Check for concurrent deployments
    local concurrent_id
    if check_concurrent_deployment "$TENANT_ID" concurrent_id; then
        if [[ "$FORCE_DEPLOY" == "true" ]]; then
            log_warning "Concurrent deployment detected (ID: $concurrent_id) but --force specified, continuing"
        else
            log_step_failed "Concurrent deployment detected (ID: $concurrent_id). Use --force to override"
            return 1
        fi
    else
        log_debug "No concurrent deployments detected"
    fi

    log_step_complete "No blocking concurrent deployments"
    return 0
}

# Test SSH connection to remote server
test_ssh_connection() {
    log_step "Testing SSH connection to remote server"

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

# Create deployment backup
create_deployment_backup() {
    if [[ "$SKIP_BACKUP" == "true" ]]; then
        log_info "Skipping backup (--skip-backup specified)"
        return 0
    fi

    log_step "Creating deployment backup"

    local deploy_path="${CONFIG_SERVER_DEPLOY_PATH:-/opt/opclaw/platform}"
    local server_host="${CONFIG_SERVER_HOST:-}"
    local server_user="${CONFIG_SERVER_SSH_USER:-}"

    # Create backup directory
    local backup_dir="/var/backups/opclaw/${TENANT_ID}"
    local timestamp
    timestamp=$(date '+%Y%m%d_%H%M%S')
    local backup_path="${backup_dir}/pre-deploy.${timestamp}"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would create backup at: $backup_path"
        ROLLBACK_SNAPSHOT="$backup_path"
        return 0
    fi

    # Create backup directory on remote server
    ssh_exec "${server_user}@${server_host}" "mkdir -p $backup_dir"

    # Backup current deployment
    if ssh_exec "${server_user}@${server_host}" "[ -d $deploy_path ]"; then
        if ssh_exec "${server_user}@${server_host}" "cp -r $deploy_path $backup_path"; then
            log_info "Backup created: $backup_path"
            ROLLBACK_SNAPSHOT="$backup_path"
            BACKUP_FILES+=("$backup_path")
        else
            log_warning "Failed to create backup, continuing anyway"
        fi
    else
        log_info "No existing deployment to backup (first deployment)"
    fi

    log_step_complete "Backup completed"
    return 0
}

# Record deployment start
record_deployment_start() {
    log_step "Recording deployment start"

    local deployment_type="local-${CONFIG_DEPLOYMENT_TYPE:-update}"
    if [[ "$REMOTE_BUILD" == "true" ]]; then
        deployment_type="local-remote-build"
    fi
    local environment="${CONFIG_TENANT_ENVIRONMENT:-production}"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would record deployment start"
        DEPLOYMENT_ID="dry-run-$(date +%s)"
        return 0
    fi

    if ! record_deployment_start "$TENANT_ID" "$DEPLOYMENT_VERSION" "$environment" "$deployment_type" "$DEPLOY_COMPONENT"; then
        log_warning "Failed to record deployment start in state database"
        DEPLOYMENT_ID="local-$(date +%s)"
    else
        DEPLOYMENT_ID="$STATE_LAST_DEPLOYMENT_ID"
    fi

    DEPLOYMENT_STARTED=true
    log_info "Deployment ID: $DEPLOYMENT_ID"

    # Record configuration snapshot
    if [[ -n "$DEPLOYMENT_ID" ]]; then
        record_config_snapshot "$DEPLOYMENT_ID" "$CONFIG_FILE"
    fi

    log_step_complete "Deployment start recorded"
    return 0
}

#==============================================================================
# Build Functions
#==============================================================================

# Build Docker images locally
build_local_images() {
    log_step "Building Docker images locally"

    if [[ "$TRANSFER_ONLY" == "true" ]]; then
        log_info "Skipping build (--transfer-only specified)"
        return 0
    fi

    if [[ "$REMOTE_BUILD" == "true" ]]; then
        log_info "Skipping local build (--remote-build specified)"
        return 0
    fi

    local build_script="${SCRIPT_DIR}/local-build.sh"

    if [[ ! -f "$build_script" ]]; then
        log_error "Build script not found: $build_script"
        return 1
    fi

    # Build arguments
    local build_args=(
        "$CONFIG_FILE"
        --component "$DEPLOY_COMPONENT"
    )

    if [[ "$VERBOSE" == "true" ]]; then
        build_args+=(--verbose)
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        build_args+=(--dry-run)
        log_info "[DRY-RUN] Would build images locally"
    fi

    # Execute build script
    if ! "$build_script" "${build_args[@]}"; then
        log_step_failed "Local image build failed"
        return 1
    fi

    # Collect built image names
    if [[ "$DEPLOY_COMPONENT" == "all" || "$DEPLOY_COMPONENT" == "backend" ]]; then
        LOCAL_IMAGES_BUILT+=("opclaw-backend:${DEPLOYMENT_VERSION}")
    fi

    if [[ "$DEPLOY_COMPONENT" == "all" || "$DEPLOY_COMPONENT" == "frontend" ]]; then
        LOCAL_IMAGES_BUILT+=("opclaw-frontend:${DEPLOYMENT_VERSION}")
    fi

    log_step_complete "Local images built successfully"
    return 0
}

#==============================================================================
# Transfer Functions
#==============================================================================

# Transfer files and images to remote server
transfer_to_remote() {
    log_step "Transferring files and images to remote server"

    local transfer_script="${SCRIPT_DIR}/local-transfer.sh"

    if [[ ! -f "$transfer_script" ]]; then
        log_error "Transfer script not found: $transfer_script"
        return 1
    fi

    # Build transfer arguments
    local transfer_args=(
        "$CONFIG_FILE"
        --component "$DEPLOY_COMPONENT"
    )

    if [[ "$REMOTE_BUILD" == "true" ]]; then
        transfer_args+=(--remote-build)
    fi

    if [[ "$VERBOSE" == "true" ]]; then
        transfer_args+=(--verbose)
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        transfer_args+=(--dry-run)
        log_info "[DRY-RUN] Would transfer files to remote server"
    fi

    # Execute transfer script
    if ! "$transfer_script" "${transfer_args[@]}"; then
        log_step_failed "File transfer failed"
        return 1
    fi

    log_step_complete "Files transferred successfully"
    return 0
}

#==============================================================================
# Deployment Functions
#==============================================================================

# Deploy backend service
deploy_backend() {
    log_step "Deploying backend service"

    local server_host="${CONFIG_SERVER_HOST:-}"
    local server_user="${CONFIG_SERVER_SSH_USER:-}"
    local deploy_path="${CONFIG_SERVER_DEPLOY_PATH:-/opt/opclaw/platform}"
    local api_port="${CONFIG_SERVER_API_PORT:-3000}"

    if [[ "$BUILD_ONLY" == "true" ]]; then
        log_info "Skipping deployment (--build-only specified)"
        return 0
    fi

    # Create deployment directory
    log_info "Creating deployment directory"
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would create directory: $deploy_path"
    else
        ssh_exec "${server_user}@${server_host}" "mkdir -p $deploy_path"
    fi

    # Create .env file from configuration
    log_info "Creating environment configuration"
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would create .env file"
    else
        create_env_file | ssh_exec "${server_user}@${server_host}" "cat > ${deploy_path}/.env"
    fi

    # Start/restart backend service
    log_info "Starting backend service"
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would start backend service on port $api_port"
    else
        # Load Docker image if built locally
        if [[ "$REMOTE_BUILD" != "true" && ${#LOCAL_IMAGES_BUILT[@]} -gt 0 ]]; then
            for image in "${LOCAL_IMAGES_BUILT[@]}"; do
                if [[ "$image" == *"backend"* ]]; then
                    log_info "Loading Docker image: $image"
                    # Image should already be loaded by local-transfer.sh
                fi
            done
        fi

        # Start or restart container
        ssh_exec "${server_user}@${server_host}" "cd $deploy_path && docker compose up -d backend 2>/dev/null || docker run -d --name opclaw-backend --restart unless-stopped -p ${api_port}:3000 --env-file ${deploy_path}/.env opclaw-backend:${DEPLOYMENT_VERSION}"
    fi

    log_step_complete "Backend service deployed"
    return 0
}

# Deploy frontend (if applicable)
deploy_frontend() {
    log_step "Deploying frontend"

    # Check if frontend is enabled
    local frontend_enabled="${CONFIG_FRONTEND_ENABLED:-false}"

    if [[ "$frontend_enabled" != "true" ]]; then
        log_info "Frontend not enabled, skipping"
        return 0
    fi

    if [[ "$BUILD_ONLY" == "true" ]]; then
        log_info "Skipping deployment (--build-only specified)"
        return 0
    fi

    local server_host="${CONFIG_SERVER_HOST:-}"
    local server_user="${CONFIG_SERVER_SSH_USER:-}"
    local deploy_path="${CONFIG_SERVER_DEPLOY_PATH:-/opt/opclaw/platform}"

    # Start/restart frontend service
    log_info "Starting frontend service"
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would start frontend service"
    else
        ssh_exec "${server_user}@${server_host}" "cd $deploy_path && docker compose up -d frontend 2>/dev/null || true"
    fi

    log_step_complete "Frontend deployed"
    return 0
}

# Configure Nginx
configure_nginx() {
    log_step "Configuring Nginx"

    if [[ "$BUILD_ONLY" == "true" ]]; then
        log_info "Skipping deployment (--build-only specified)"
        return 0
    fi

    local server_host="${CONFIG_SERVER_HOST:-}"
    local server_user="${CONFIG_SERVER_SSH_USER:-}"
    local domain="${CONFIG_SERVER_DOMAIN:-localhost}"
    local api_port="${CONFIG_SERVER_API_PORT:-3000}"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would configure Nginx for domain: $domain"
        return 0
    fi

    # Configure Nginx
    ssh_exec "${server_user}@${server_host}" "docker exec opclaw-nginx nginx -t && docker exec opclaw-nginx nginx -s reload 2>/dev/null || true"

    log_step_complete "Nginx configured"
    return 0
}

#==============================================================================
# Post-Deployment Functions
#==============================================================================

# Run health checks
run_health_checks() {
    if [[ "$SKIP_HEALTH_CHECK" == "true" ]]; then
        log_info "Skipping health checks (--skip-health-check specified)"
        return 0
    fi

    if [[ "$BUILD_ONLY" == "true" ]]; then
        log_info "Skipping health checks (--build-only specified)"
        return 0
    fi

    log_step "Running health checks"

    local server_host="${CONFIG_SERVER_HOST:-}"
    local domain="${CONFIG_SERVER_DOMAIN:-$server_host}"
    local api_port="${CONFIG_SERVER_API_PORT:-3000}"

    # HTTP health check
    log_info "Checking HTTP endpoint: http://${domain}:${api_port}/health"
    local http_status="fail"
    local response_time=0

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would check HTTP endpoint"
        http_status="pass"
    else
        local start_time
        start_time=$(date +%s%3N)
        if curl -f -s "http://${domain}:${api_port}/health" > /dev/null 2>&1; then
            http_status="pass"
        fi
        local end_time
        end_time=$(date +%s%3N)
        response_time=$((end_time - start_time))
    fi

    # Record health check
    if [[ -n "$DEPLOYMENT_ID" ]]; then
        record_health_check "$TENANT_ID" "http" "$http_status" "$response_time" "" "$DEPLOYMENT_ID"
    fi

    if [[ "$http_status" != "pass" ]]; then
        log_step_failed "HTTP health check failed"
        return 1
    fi

    log_step_complete "Health checks passed"
    return 0
}

# Record deployment success
record_deployment_success() {
    log_step "Recording deployment success"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would record deployment success"
        return 0
    fi

    if [[ -n "$DEPLOYMENT_ID" ]]; then
        if ! record_deployment_success "$DEPLOYMENT_ID" "Deployment completed successfully"; then
            log_warning "Failed to record deployment success"
        fi
    fi

    log_step_complete "Deployment success recorded"
    return 0
}

#==============================================================================
# Rollback Functions
#==============================================================================

# Rollback deployment
rollback_deployment() {
    log_error "Initiating deployment rollback..."

    local error_message="${1:-Unknown error}"

    if [[ -z "$ROLLBACK_SNAPSHOT" ]]; then
        log_error "No rollback snapshot available"
        return 1
    fi

    log_info "Rolling back to: $ROLLBACK_SNAPSHOT"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would rollback deployment"
        return 0
    fi

    local server_host="${CONFIG_SERVER_HOST:-}"
    local server_user="${CONFIG_SERVER_SSH_USER:-}"
    local deploy_path="${CONFIG_SERVER_DEPLOY_PATH:-/opt/opclaw/platform}"

    # Stop current deployment
    log_info "Stopping current deployment"
    ssh_exec "${server_user}@${server_host}" "docker stop opclaw-backend 2>/dev/null || true"

    # Restore from backup
    log_info "Restoring from backup"
    if ssh_exec "${server_user}@${server_host}" "rm -rf $deploy_path && cp -r $ROLLBACK_SNAPSHOT $deploy_path"; then
        log_info "Backup restored successfully"
    else
        log_error "Failed to restore from backup"
        return 1
    fi

    # Restart services
    log_info "Restarting services"
    ssh_exec "${server_user}@${server_host}" "cd $deploy_path && docker compose up -d 2>/dev/null || true"

    # Record rollback in state database
    if [[ -n "$DEPLOYMENT_ID" ]]; then
        record_deployment_failure "$DEPLOYMENT_ID" "ROLLBACK" "$error_message"
    fi

    log_warning "Rollback completed"
    return 0
}

#==============================================================================
# Utility Functions
#==============================================================================

# Create .env file from configuration
create_env_file() {
    cat << EOF
# Tenant Configuration
TENANT_ID=${CONFIG_TENANT_ID}
TENANT_NAME=${CONFIG_TENANT_NAME}
TENANT_ENVIRONMENT=${CONFIG_TENANT_ENVIRONMENT}

# Server Configuration
SERVER_HOST=${CONFIG_SERVER_HOST}
API_PORT=${CONFIG_SERVER_API_PORT:-3000}
METRICS_PORT=${CONFIG_SERVER_METRICS_PORT:-9090}

# Feishu Configuration
FEISHU_APP_ID=${CONFIG_FEISHU_APP_ID}
FEISHU_APP_SECRET=${CONFIG_FEISHU_APP_SECRET}
FEISHU_ENCRYPT_KEY=${CONFIG_FEISHU_ENCRYPT_KEY}
FEISHU_OAUTH_REDIRECT_URI=${CONFIG_FEISHU_OAUTH_REDIRECT_URI}
FEISHU_API_BASE_URL=${CONFIG_FEISHU_API_BASE_URL:-https://open.feishu.cn}

# Database Configuration
DB_HOST=${CONFIG_DATABASE_HOST}
DB_PORT=${CONFIG_DATABASE_PORT:-5432}
DB_NAME=${CONFIG_DATABASE_NAME}
DB_USER=${CONFIG_DATABASE_USER}
DB_PASSWORD=${CONFIG_DATABASE_PASSWORD}

# Redis Configuration
REDIS_HOST=${CONFIG_REDIS_HOST}
REDIS_PORT=${CONFIG_REDIS_PORT:-6379}
REDIS_PASSWORD=${CONFIG_REDIS_PASSWORD}

# JWT Configuration
JWT_SECRET=${CONFIG_JWT_SECRET}
JWT_EXPIRES_IN=${CONFIG_JWT_EXPIRES_IN:-24h}

# Agent Configuration
DEEPSEEK_API_KEY=${CONFIG_AGENT_DEEPSEEK_API_KEY}
DEEPSEEK_MODEL=${CONFIG_AGENT_DEEPSEEK_MODEL:-deepseek-chat}

# Deployment Info
DEPLOYMENT_ID=${DEPLOYMENT_ID}
DEPLOYMENT_VERSION=${DEPLOYMENT_VERSION}
DEPLOYED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
GIT_COMMIT_SHA=${GIT_COMMIT_SHA}
GIT_BRANCH=${GIT_BRANCH}
EOF
}

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
# Main Deployment Flow
#==============================================================================

# Main deployment function
main() {
    log_section "Local Deployment"
    log_info "Deployment version: $DEPLOYMENT_VERSION"
    log_info "Git commit: $GIT_COMMIT_SHA"
    log_info "Git branch: $GIT_BRANCH"
    log_info "Deployment mode: $([ "$REMOTE_BUILD" == "true" ] && echo "Remote Build" || echo "Local Build")"

    # Parse arguments
    parse_arguments "$@"

    # Initialize error handling
    error_init "$(basename "$0")"
    trap_errors
    register_cleanup_function "cleanup"

    # Pre-deployment phase
    log_separator
    log_info "PRE-DEPLOYMENT PHASE"
    log_separator

    load_tenant_configuration || exit 1
    check_local_prerequisites || exit 1
    check_concurrent_deployments || exit 1
    test_ssh_connection || exit 1
    create_deployment_backup || exit 1
    record_deployment_start || exit 1

    # Build phase
    log_separator
    log_info "BUILD PHASE"
    log_separator

    build_local_images || exit 1

    # Transfer phase
    log_separator
    log_info "TRANSFER PHASE"
    log_separator

    transfer_to_remote || exit 1

    # Exit early if build-only mode
    if [[ "$BUILD_ONLY" == "true" ]]; then
        log_separator
        log_success "Build completed successfully!"
        log_info "Images built: ${LOCAL_IMAGES_BUILT[*]}"
        log_separator
        exit_with_success "Build completed"
    fi

    # Deployment phase
    log_separator
    log_info "DEPLOYMENT PHASE"
    log_separator

    if [[ "$DEPLOY_COMPONENT" == "all" || "$DEPLOY_COMPONENT" == "backend" ]]; then
        deploy_backend || rollback_deployment "Backend deployment failed"
    fi

    if [[ "$DEPLOY_COMPONENT" == "all" || "$DEPLOY_COMPONENT" == "frontend" ]]; then
        deploy_frontend || rollback_deployment "Frontend deployment failed"
    fi

    if [[ "$DEPLOY_COMPONENT" == "all" ]]; then
        configure_nginx || log_warning "Nginx configuration failed, continuing anyway"
    fi

    # Post-deployment phase
    log_separator
    log_info "POST-DEPLOYMENT PHASE"
    log_separator

    run_health_checks || rollback_deployment "Health checks failed"
    record_deployment_success || log_warning "Failed to record deployment success"

    # Success
    log_separator
    log_success "Deployment completed successfully!"
    log_info "Tenant ID: $TENANT_ID"
    log_info "Deployment ID: $DEPLOYMENT_ID"
    log_info "Component: $DEPLOY_COMPONENT"
    log_separator

    exit_with_success "Deployment completed successfully"
}

#==============================================================================
# Script Entry Point
#==============================================================================

# Run main function
main "$@"
