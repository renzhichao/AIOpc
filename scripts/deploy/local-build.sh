#!/opt/homebrew/bin/bash
#==============================================================================
# Local Build Script
# (本地构建脚本)
#
# Purpose: Build Docker images locally for deployment
#
# Features:
# - Local Docker image building with buildx for multi-platform support
# - Image tagging and versioning
# - Cache management for faster rebuilds
# - Build progress monitoring
# - Configuration-driven builds from tenant YAML files
#
# Usage:
#   ./local-build.sh <tenant_config_file> [options]
#
# Options:
#   --component <name>     Build specific component (all, backend, frontend)
#   --platform <arch>      Target platform (linux/amd64, linux/arm64)
#   --no-cache             Disable build cache
#   --verbose              Enable verbose output
#   --dry-run              Show what would be built without building
#   --help                 Show this help message
#
# Examples:
#   ./local-build.sh config/tenants/test_tenant_alpha.yml
#   ./local-build.sh config/tenants/test_tenant_alpha.yml --component backend
#   ./local-build.sh config/tenants/test_tenant_alpha.yml --platform linux/amd64
#   ./local-build.sh config/tenants/test_tenant_alpha.yml --no-cache
#
# Dependencies:
# - scripts/lib/*.sh (all library files)
# - docker (for container operations)
# - docker buildx (for multi-platform builds)
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

# Build configuration
BUILD_COMPONENT="all"
BUILD_PLATFORM="linux/amd64"
BUILD_NO_CACHE=false
DRY_RUN=false
VERBOSE=false

# Build state
BUILT_IMAGES=()
BUILD_START_TIME=0
BUILD_END_TIME=0

# Version info
BUILD_VERSION="${BUILD_VERSION:-v1.0.0}"
GIT_COMMIT_SHA="${GIT_COMMIT_SHA:-$(git rev-parse HEAD 2>/dev/null || echo 'unknown')}"
GIT_BRANCH="${GIT_BRANCH:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')}"

#==============================================================================
# Source Libraries
#==============================================================================

# Source all required libraries
for lib in logging.sh error.sh config.sh; do
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

Build Docker images locally for deployment.

Arguments:
  tenant_config_file    Path to tenant YAML configuration file

Options:
  --component <name>     Build specific component (all, backend, frontend)
  --platform <arch>      Target platform (linux/amd64, linux/arm64)
  --no-cache             Disable build cache
  --verbose              Enable verbose output
  --dry-run              Show what would be built without building
  --help                 Show this help message

Examples:
  $(basename "$0") config/tenants/test_tenant_alpha.yml
  $(basename "$0") config/tenants/test_tenant_alpha.yml --component backend
  $(basename "$0") config/tenants/test_tenant_alpha.yml --platform linux/amd64
  $(basename "$0") config/tenants/test_tenant_alpha.yml --no-cache

EOF
}

# Parse command line arguments
parse_arguments() {
    local config_file=""

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --component)
                BUILD_COMPONENT="$2"
                shift 2
                ;;
            --platform)
                BUILD_PLATFORM="$2"
                shift 2
                ;;
            --no-cache)
                BUILD_NO_CACHE=true
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
    if [[ ! "$BUILD_COMPONENT" =~ ^(all|backend|frontend)$ ]]; then
        log_error "Invalid component: $BUILD_COMPONENT (must be: all, backend, frontend)"
        exit 1
    fi

    log_debug "Configuration file: $CONFIG_FILE"
    log_debug "Component: $BUILD_COMPONENT"
    log_debug "Platform: $BUILD_PLATFORM"
    log_debug "No cache: $BUILD_NO_CACHE"
}

# Check build prerequisites
check_prerequisites() {
    log_step "Checking build prerequisites"

    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        return 1
    fi

    # Check Docker daemon
    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        return 1
    fi

    # Check buildx for multi-platform builds
    if [[ "$BUILD_PLATFORM" != "linux/amd64" ]]; then
        if ! docker buildx version &> /dev/null; then
            log_error "docker buildx is not installed (required for platform: $BUILD_PLATFORM)"
            return 1
        fi
    fi

    log_step_complete "Build prerequisites check passed"
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
    log_info "Build version: $BUILD_VERSION"

    log_step_complete "Configuration loaded successfully"
    return 0
}

#==============================================================================
# Build Functions
#==============================================================================

# Build backend Docker image
build_backend_image() {
    log_step "Building backend Docker image"

    local backend_dir="${PROJECT_ROOT}/platform/backend"
    local image_name="opclaw-backend"
    local image_tag="${BUILD_VERSION}"
    local full_image="${image_name}:${image_tag}"

    # Check if backend directory exists
    if [[ ! -d "$backend_dir" ]]; then
        log_error "Backend directory not found: $backend_dir"
        return 1
    fi

    # Check for Dockerfile
    local dockerfile="${backend_dir}/Dockerfile"
    if [[ ! -f "$dockerfile" ]]; then
        log_error "Backend Dockerfile not found: $dockerfile"
        return 1
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would build backend image: $full_image"
        log_info "[DRY-RUN] Dockerfile: $dockerfile"
        log_info "[DRY-RUN] Context: $backend_dir"
        BUILT_IMAGES+=("$full_image")
        log_step_complete "Backend image build (dry-run)"
        return 0
    fi

    # Build arguments
    local build_args=(
        build
        -t "$full_image"
        -f "$dockerfile"
        --build-arg "VERSION=${BUILD_VERSION}"
        --build-arg "GIT_COMMIT_SHA=${GIT_COMMIT_SHA}"
        --build-arg "GIT_BRANCH=${GIT_BRANCH}"
        --build-arg "BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    )

    # Add cache option
    if [[ "$BUILD_NO_CACHE" == "true" ]]; then
        build_args+=(--no-cache)
    fi

    # Add platform option
    if [[ "$BUILD_PLATFORM" != "linux/amd64" ]]; then
        build_args+=(--platform "$BUILD_PLATFORM")
    fi

    # Add verbose option
    if [[ "$VERBOSE" == "true" ]]; then
        build_args+=(--progress=plain)
    fi

    # Add context path
    build_args+=("$backend_dir")

    # Execute build
    log_info "Building image: $full_image"
    log_info "Platform: $BUILD_PLATFORM"

    local build_start
    build_start=$(date +%s)

    if docker buildx "${build_args[@]}"; then
        local build_end
        build_end=$(date +%s)
        local build_duration=$((build_end - build_start))

        log_success "Backend image built successfully in ${build_duration}s"
        BUILT_IMAGES+=("$full_image")

        # Show image size
        local image_size
        image_size=$(docker images "$full_image" --format "{{.Size}}")
        log_info "Image size: $image_size"

        log_step_complete "Backend image build complete"
        return 0
    else
        log_step_failed "Backend image build failed"
        return 1
    fi
}

# Build frontend Docker image
build_frontend_image() {
    log_step "Building frontend Docker image"

    # Check if frontend is enabled
    local frontend_enabled="${CONFIG_FRONTEND_ENABLED:-false}"

    if [[ "$frontend_enabled" != "true" ]]; then
        log_info "Frontend not enabled, skipping"
        return 0
    fi

    local frontend_dir="${PROJECT_ROOT}/platform/frontend"
    local image_name="opclaw-frontend"
    local image_tag="${BUILD_VERSION}"
    local full_image="${image_name}:${image_tag}"

    # Check if frontend directory exists
    if [[ ! -d "$frontend_dir" ]]; then
        log_warning "Frontend directory not found: $frontend_dir"
        log_info "Skipping frontend build"
        return 0
    fi

    # Check for Dockerfile
    local dockerfile="${frontend_dir}/Dockerfile"
    if [[ ! -f "$dockerfile" ]]; then
        log_warning "Frontend Dockerfile not found: $dockerfile"
        log_info "Skipping frontend build"
        return 0
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would build frontend image: $full_image"
        log_info "[DRY-RUN] Dockerfile: $dockerfile"
        log_info "[DRY-RUN] Context: $frontend_dir"
        BUILT_IMAGES+=("$full_image")
        log_step_complete "Frontend image build (dry-run)"
        return 0
    fi

    # Build arguments
    local build_args=(
        build
        -t "$full_image"
        -f "$dockerfile"
        --build-arg "VERSION=${BUILD_VERSION}"
        --build-arg "GIT_COMMIT_SHA=${GIT_COMMIT_SHA}"
        --build-arg "GIT_BRANCH=${GIT_BRANCH}"
        --build-arg "BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    )

    # Add cache option
    if [[ "$BUILD_NO_CACHE" == "true" ]]; then
        build_args+=(--no-cache)
    fi

    # Add platform option
    if [[ "$BUILD_PLATFORM" != "linux/amd64" ]]; then
        build_args+=(--platform "$BUILD_PLATFORM")
    fi

    # Add verbose option
    if [[ "$VERBOSE" == "true" ]]; then
        build_args+=(--progress=plain)
    fi

    # Add context path
    build_args+=("$frontend_dir")

    # Execute build
    log_info "Building image: $full_image"
    log_info "Platform: $BUILD_PLATFORM"

    local build_start
    build_start=$(date +%s)

    if docker buildx "${build_args[@]}"; then
        local build_end
        build_end=$(date +%s)
        local build_duration=$((build_end - build_start))

        log_success "Frontend image built successfully in ${build_duration}s"
        BUILT_IMAGES+=("$full_image")

        # Show image size
        local image_size
        image_size=$(docker images "$full_image" --format "{{.Size}}")
        log_info "Image size: $image_size"

        log_step_complete "Frontend image build complete"
        return 0
    else
        log_step_failed "Frontend image build failed"
        return 1
    fi
}

# Tag images with additional tags
tag_images() {
    log_step "Tagging images with additional tags"

    local tenant_id="${CONFIG_TENANT_ID:-}"
    local environment="${CONFIG_TENANT_ENVIRONMENT:-production}"

    for image in "${BUILT_IMAGES[@]}"; do
        # Extract image name and version
        local image_name="${image%%:*}"
        local image_version="${image##*:}"

        # Tag with tenant ID
        local tenant_tag="${image_name}:${tenant_id}-${image_version}"
        if [[ "$DRY_RUN" != "true" ]]; then
            docker tag "$image" "$tenant_tag"
            log_info "Tagged: $tenant_tag"
        else
            log_info "[DRY-RUN] Would tag: $tenant_tag"
        fi

        # Tag with environment
        local env_tag="${image_name}:${environment}-${image_version}"
        if [[ "$DRY_RUN" != "true" ]]; then
            docker tag "$image" "$env_tag"
            log_info "Tagged: $env_tag"
        else
            log_info "[DRY-RUN] Would tag: $env_tag"
        fi

        # Tag with latest
        local latest_tag="${image_name}:latest"
        if [[ "$DRY_RUN" != "true" ]]; then
            docker tag "$image" "$latest_tag"
            log_info "Tagged: $latest_tag"
        else
            log_info "[DRY-RUN] Would tag: $latest_tag"
        fi
    done

    log_step_complete "Images tagged successfully"
    return 0
}

# Display build summary
show_build_summary() {
    log_separator
    log_info "BUILD SUMMARY"
    log_separator

    log_info "Total images built: ${#BUILT_IMAGES[@]}"
    log_info "Build time: $((BUILD_END_TIME - BUILD_START_TIME))s"
    log_info "Build version: $BUILD_VERSION"
    log_info "Git commit: $GIT_COMMIT_SHA"

    if [[ ${#BUILT_IMAGES[@]} -gt 0 ]]; then
        log_separator
        log_info "Built images:"
        for image in "${BUILT_IMAGES[@]}"; do
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
# Main Build Flow
#==============================================================================

# Main function
main() {
    log_section "Local Docker Build"
    log_info "Build version: $BUILD_VERSION"
    log_info "Git commit: $GIT_COMMIT_SHA"
    log_info "Git branch: $GIT_BRANCH"

    # Parse arguments
    parse_arguments "$@"

    # Initialize error handling
    error_init "$(basename "$0")"
    trap_errors
    register_cleanup_function "cleanup"

    # Record start time
    BUILD_START_TIME=$(date +%s)

    # Pre-build phase
    log_separator
    log_info "PRE-BUILD PHASE"
    log_separator

    check_prerequisites || exit 1
    load_configuration || exit 1

    # Build phase
    log_separator
    log_info "BUILD PHASE"
    log_separator

    if [[ "$BUILD_COMPONENT" == "all" || "$BUILD_COMPONENT" == "backend" ]]; then
        build_backend_image || exit 1
    fi

    if [[ "$BUILD_COMPONENT" == "all" || "$BUILD_COMPONENT" == "frontend" ]]; then
        build_frontend_image || exit 1
    fi

    # Post-build phase
    log_separator
    log_info "POST-BUILD PHASE"
    log_separator

    tag_images || exit 1

    # Record end time
    BUILD_END_TIME=$(date +%s)

    # Show summary
    show_build_summary

    # Success
    log_success "Build completed successfully!"
    exit_with_success "Build completed"
}

#==============================================================================
# Script Entry Point
#==============================================================================

# Run main function
main "$@"
