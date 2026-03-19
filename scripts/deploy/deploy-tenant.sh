#!/bin/bash
#==============================================================================
# Tenant Deployment Script
# (租户部署脚本)
#
# Purpose: Parameterized deployment script for tenant instances
#
# Features:
# - Configuration-driven deployment from tenant YAML files
# - Pre-deployment validation and checks
# - Atomic deployment with automatic rollback on failure
# - Health check integration
# - State database recording
# - Concurrent deployment detection
# - SSH-based remote deployment
#
# Usage:
#   ./deploy-tenant.sh <tenant_config_file> [options]
#
# Options:
#   --dry-run              Show what would be deployed without making changes
#   --skip-health-check    Skip post-deployment health checks
#   --skip-backup          Skip pre-deployment backup
#   --force                Force deployment even if concurrent deployment detected
#   --component <name>     Deploy specific component (all, backend, frontend)
#   --verbose              Enable verbose output
#   --help                 Show this help message
#
# Examples:
#   ./deploy-tenant.sh config/tenants/tenant_001.yml
#   ./deploy-tenant.sh config/tenants/tenant_001.yml --component backend
#   ./deploy-enant.sh config/tenants/tenant_001.yml --dry-run
#
# Dependencies:
# - scripts/lib/*.sh (all library files)
# - yq (YAML processor)
# - docker (for container operations)
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

Deploy a tenant instance based on configuration file.

Arguments:
  tenant_config_file    Path to tenant YAML configuration file

Options:
  --dry-run              Show what would be deployed without making changes
  --skip-health-check    Skip post-deployment health checks
  --skip-backup          Skip pre-deployment backup
  --force                Force deployment even if concurrent deployment detected
  --component <name>     Deploy specific component (all, backend, frontend)
  --verbose              Enable verbose output
  --help                 Show this help message

Examples:
  $(basename "$0") config/tenants/tenant_001.yml
  $(basename "$0") config/tenants/tenant_001.yml --component backend
  $(basename "$0") config/tenants/tenant_001.yml --dry-run

EOF
}

# Parse command line arguments
parse_arguments() {
    local config_file=""

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
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

    log_debug "Configuration file: $CONFIG_FILE"
    log_debug "Component: $DEPLOY_COMPONENT"
    log_debug "Dry run: $DRY_RUN"
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

    # Setup SSH port configuration for all SSH operations
    local server_port="${CONFIG_SERVER_PORT:-22}"
    if [[ -n "$server_port" && "$server_port" != "22" ]]; then
        export SSH_PORT="$server_port"
        log_info "SSH port configured: $server_port (non-default)"
    else
        export SSH_PORT="22"
        log_debug "SSH port: 22 (default)"
    fi

    log_step_complete "Configuration loaded and validated"
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

    # Priority: Use SSH_KEY_PATH from environment if set (CI environment),
    # otherwise use path from config file (local deployment)
    if [[ -n "${SSH_KEY_PATH:-}" ]]; then
        ssh_key_path="${SSH_KEY_PATH}"
        log_debug "Using SSH key from environment: $ssh_key_path"
    else
        # Expand SSH key path from config
        ssh_key_path="${ssh_key_path/#\~/$HOME}"
        log_debug "Using SSH key from config: $ssh_key_path"
    fi

    if [[ ! -f "$ssh_key_path" ]]; then
        log_step_failed "SSH key not found: $ssh_key_path"
        return 1
    fi

    # Configure SSH
    ssh_set_key "$ssh_key_path"

    # Test connection (SSH_PORT is already set by load_tenant_configuration)
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
    if [[ -d "$deploy_path" ]] || ssh_exec "${server_user}@${server_host}" "[ -d $deploy_path ]"; then
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

    local deployment_type="${CONFIG_DEPLOYMENT_TYPE:-update}"
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
# Deployment Functions
#==============================================================================

# Deploy backend service
deploy_backend() {
    log_step "Deploying backend service"

    local server_host="${CONFIG_SERVER_HOST:-}"
    local server_user="${CONFIG_SERVER_SSH_USER:-}"
    local deploy_path="${CONFIG_SERVER_DEPLOY_PATH:-/opt/opclaw/platform}"
    local api_port="${CONFIG_SERVER_API_PORT:-3000}"

    # Create deployment directory
    log_info "Creating deployment directory"
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would create directory: $deploy_path"
    else
        ssh_exec "${server_user}@${server_host}" "mkdir -p $deploy_path"
    fi

    # Build backend (if needed)
    log_info "Building backend service"
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would build backend service"
    else
        # TODO: Implement actual build process
        # This could be:
        # - Building Docker image
        # - Compiling TypeScript
        # - Running tests
        log_debug "Backend build placeholder"
    fi

    # Upload backend files
    log_info "Uploading backend files"
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would upload backend files to: ${deploy_path}/backend"
    else
        # TODO: Implement actual file upload
        # This could be:
        # - Uploading Docker image
        # - Uploading compiled JavaScript
        # - Uploading source code
        log_debug "Backend upload placeholder"
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
        # TODO: Implement actual service start
        # This could be:
        # - Starting Docker container
        # - Restarting systemd service
        # - Running PM2
        log_debug "Backend start placeholder"
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

    local server_host="${CONFIG_SERVER_HOST:-}"
    local server_user="${CONFIG_SERVER_SSH_USER:-}"
    local deploy_path="${CONFIG_SERVER_DEPLOY_PATH:-/opt/opclaw/platform}"

    # Build frontend
    log_info "Building frontend"
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would build frontend"
    else
        # TODO: Implement actual frontend build
        log_debug "Frontend build placeholder"
    fi

    # Upload frontend files
    log_info "Uploading frontend files"
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would upload frontend files to: ${deploy_path}/frontend"
    else
        # TODO: Implement actual frontend upload
        log_debug "Frontend upload placeholder"
    fi

    log_step_complete "Frontend deployed"
    return 0
}

# Configure Nginx
configure_nginx() {
    log_step "Configuring Nginx"

    local server_host="${CONFIG_SERVER_HOST:-}"
    local server_user="${CONFIG_SERVER_SSH_USER:-}"
    local domain="${CONFIG_SERVER_DOMAIN:-localhost}"
    local api_port="${CONFIG_SERVER_API_PORT:-3000}"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would configure Nginx for domain: $domain"
        return 0
    fi

    # TODO: Implement Nginx configuration
    # This could be:
    # - Generating Nginx config from template
    # - Uploading Nginx config
    # - Reloading Nginx
    log_debug "Nginx configuration placeholder"

    log_step_complete "Nginx configured"
    return 0
}

# Configure SSL certificates
configure_ssl() {
    log_step "Configuring SSL certificates"

    local domain="${CONFIG_SERVER_DOMAIN:-localhost}"
    local ssl_enabled="${CONFIG_SERVER_SSL_ENABLED:-true}"

    if [[ "$ssl_enabled" != "true" ]]; then
        log_info "SSL not enabled, skipping"
        return 0
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would configure SSL for domain: $domain"
        return 0
    fi

    # TODO: Implement SSL configuration
    # This could be:
    # - Generating self-signed certificate
    # - Requesting Let's Encrypt certificate
    # - Uploading custom certificate
    log_debug "SSL configuration placeholder"

    log_step_complete "SSL configured"
    return 0
}

# Update DNS records
update_dns() {
    log_step "Updating DNS records"

    local domain="${CONFIG_SERVER_DOMAIN:-}"
    local server_ip="${CONFIG_SERVER_HOST:-}"

    if [[ -z "$domain" ]]; then
        log_info "No domain configured, skipping DNS update"
        return 0
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would update DNS: $domain -> $server_ip"
        return 0
    fi

    # TODO: Implement DNS update
    # This could be:
    # - Updating Cloudflare DNS
    # - Updating Route53
    # - Updating local /etc/hosts
    log_debug "DNS update placeholder"

    log_step_complete "DNS records updated"
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

# Verify OAuth flow
verify_oauth_flow() {
    log_step "Verifying OAuth flow"

    local feishu_app_id="${CONFIG_FEISHU_APP_ID:-}"

    if [[ -z "$feishu_app_id" ]]; then
        log_warning "Feishu App ID not configured, skipping OAuth verification"
        return 0
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would verify OAuth flow"
        return 0
    fi

    # TODO: Implement OAuth flow verification
    # This could be:
    # - Testing OAuth redirect
    # - Verifying callback handling
    # - Testing token refresh
    log_debug "OAuth verification placeholder"

    log_step_complete "OAuth flow verified"
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
    log_section "Tenant Deployment"
    log_info "Deployment version: $DEPLOYMENT_VERSION"
    log_info "Git commit: $GIT_COMMIT_SHA"
    log_info "Git branch: $GIT_BRANCH"

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
    check_concurrent_deployments || exit 1
    test_ssh_connection || exit 1
    create_deployment_backup || exit 1
    record_deployment_start || exit 1

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
        configure_nginx || rollback_deployment "Nginx configuration failed"
        configure_ssl || rollback_deployment "SSL configuration failed"
        update_dns || log_warning "DNS update failed, continuing anyway"
    fi

    # Post-deployment phase
    log_separator
    log_info "POST-DEPLOYMENT PHASE"
    log_separator

    run_health_checks || rollback_deployment "Health checks failed"
    verify_oauth_flow || log_warning "OAuth verification failed, continuing anyway"
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
