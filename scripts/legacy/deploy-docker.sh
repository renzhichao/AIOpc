#!/bin/bash

################################################################################
# AIOpc Cloud - OpenClaw Agent Docker镜像部署脚本
#
# 功能:
# - 构建或拉取openclaw/agent:latest镜像
# - 创建Docker网络和卷
# - 测试容器创建和运行
# - 验证Docker环境配置
#
# 用法: ./deploy-docker.sh [--pull-only] [--skip-test] [--help]
################################################################################

set -e  # Exit on error

#------------------------------------------------------------------------------
# 配置
#------------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DOCKERFILE_PATH="$PROJECT_ROOT/docker/openclaw-agent/Dockerfile"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 配置
IMAGE_NAME="openclaw/agent"
IMAGE_TAG="latest"
FULL_IMAGE="$IMAGE_NAME:$IMAGE_TAG"
NETWORK_NAME="opclaw-network"
VOLUME_NAME="opclaw-data"
TEST_CONTAINER="opclaw-test"

# 选项
PULL_ONLY=false
SKIP_TEST=false

#------------------------------------------------------------------------------
# 工具函数
#------------------------------------------------------------------------------

log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${timestamp} [${level}] ${message}"
}

info() {
    echo -e "${BLUE}[INFO]${NC} $*"
    log "INFO" "$*"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
    log "SUCCESS" "$*"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*"
    log "WARNING" "$*"
}

error() {
    echo -e "${RED}[ERROR]${NC} $*"
    log "ERROR" "$*"
}

step() {
    echo ""
    echo -e "${CYAN}===>$NC $*"
    log "STEP" "$*"
}

#------------------------------------------------------------------------------
# 验证函数
#------------------------------------------------------------------------------

check_docker() {
    info "Checking Docker installation..."

    if ! command -v docker &> /dev/null; then
        error "Docker is not installed"
        error "Please install Docker first: https://docs.docker.com/get-docker/"
        exit 1
    fi

    local docker_version=$(docker --version | awk '{print $3}' | sed 's/,//')
    info "Docker version: $docker_version"

    if ! docker info &> /dev/null; then
        error "Docker daemon is not running"
        error "Please start Docker: systemctl start docker"
        exit 1
    fi

    success "Docker check passed"
}

check_dockerfile() {
    info "Checking Dockerfile..."

    if [ ! -f "$DOCKERFILE_PATH" ]; then
        error "Dockerfile not found: $DOCKERFILE_PATH"
        exit 1
    fi

    success "Dockerfile found: $DOCKERFILE_PATH"
}

#------------------------------------------------------------------------------
# Docker操作函数
#------------------------------------------------------------------------------

create_network() {
    step "Creating Docker network: $NETWORK_NAME"

    if docker network ls | grep -q "$NETWORK_NAME"; then
        warning "Network $NETWORK_NAME already exists"
        local network_inspect=$(docker network inspect "$NETWORK_NAME" --format '{{.Driver}}')
        info "Network driver: $network_inspect"
    else
        info "Creating network..."
        docker network create "$NETWORK_NAME"
        success "Network $NETWORK_NAME created"
    fi
}

create_volume() {
    step "Creating Docker volume: $VOLUME_NAME"

    if docker volume ls | grep -q "$VOLUME_NAME"; then
        warning "Volume $VOLUME_NAME already exists"
    else
        info "Creating volume..."
        docker volume create "$VOLUME_NAME"
        success "Volume $VOLUME_NAME created"
    fi
}

build_or_pull_image() {
    step "Preparing Docker image: $FULL_IMAGE"

    if [ "$PULL_ONLY" = true ]; then
        info "Pulling image from registry..."
        if docker pull "$FULL_IMAGE"; then
            success "Image pulled successfully"
        else
            error "Failed to pull image"
            error "The image may not exist in the registry"
            error "Please run without --pull-only to build locally"
            exit 1
        fi
    else
        # 检查镜像是否已存在
        if docker images | grep -q "$IMAGE_NAME" | grep -q "$IMAGE_TAG"; then
            warning "Image $FULL_IMAGE already exists"
            read -p "Rebuild? (y/N): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                build_image
            else
                info "Using existing image"
            fi
        else
            build_image
        fi
    fi

    # 显示镜像信息
    local image_size=$(docker images "$IMAGE_NAME:$IMAGE_TAG" --format "{{.Size}}")
    local image_id=$(docker images "$IMAGE_NAME:$IMAGE_TAG" --format "{{.ID}}")
    info "Image details:"
    info "  ID: $image_id"
    info "  Size: $image_size"
}

build_image() {
    info "Building image locally..."

    local build_context="$PROJECT_ROOT/docker/openclaw-agent"

    if [ ! -d "$build_context" ]; then
        error "Build context not found: $build_context"
        exit 1
    fi

    local build_timestamp=$(date +%s)
    info "Build timestamp: $build_timestamp"
    info "Build context: $build_context"

    if docker build \
        -t "$FULL_IMAGE" \
        --build-arg "BUILD_TIMESTAMP=$build_timestamp" \
        "$build_context"; then
        success "Image built successfully"
    else
        error "Image build failed"
        exit 1
    fi
}

run_test_container() {
    if [ "$SKIP_TEST" = true ]; then
        warning "Skipping test container creation (--skip-test flag)"
        return
    fi

    step "Running test container: $TEST_CONTAINER"

    # 清理可能存在的旧容器
    if docker ps -a | grep -q "$TEST_CONTAINER"; then
        info "Removing old test container..."
        docker rm -f "$TEST_CONTAINER" &> /dev/null || true
    fi

    info "Starting test container..."
    if docker run -d \
        --name "$TEST_CONTAINER" \
        --network "$NETWORK_NAME" \
        -p 3010:3000 \
        -e NODE_ENV=production \
        "$FULL_IMAGE"; then

        success "Test container started"

        # 等待容器启动
        info "Waiting for container to be ready..."
        sleep 5

        # 检查容器状态
        local container_status=$(docker inspect "$TEST_CONTAINER" --format '{{.State.Status}}')
        info "Container status: $container_status"

        if [ "$container_status" = "running" ]; then
            success "Test container is running"

            # 检查健康状态
            info "Checking container health..."
            local health_status=$(docker inspect "$TEST_CONTAINER" --format '{{.State.Health.Status}}' 2>/dev/null || echo "checking")

            if [ "$health_status" = "healthy" ]; then
                success "Container health check passed"
            elif [ "$health_status" = "checking" ]; then
                info "Health check in progress..."
            else
                warning "Health status: $health_status"
            fi

            # 显示容器日志
            info "Container logs:"
            docker logs "$TEST_CONTAINER" --tail 10

            # 测试HTTP访问
            info "Testing HTTP access..."
            if curl -f -s http://localhost:3010/health &> /dev/null; then
                success "HTTP health check passed"
            else
                warning "HTTP health check failed (endpoint may not be ready yet)"
            fi
        else
            error "Container failed to start"
            docker logs "$TEST_CONTAINER" --tail 20
            exit 1
        fi
    else
        error "Failed to start test container"
        exit 1
    fi

    # 保留容器用于手动检查
    info ""
    info "Test container is running for manual inspection"
    info "To view logs: docker logs -f $TEST_CONTAINER"
    info "To stop: docker stop $TEST_CONTAINER"
    info "To remove: docker rm -f $TEST_CONTAINER"
}

verify_docker_environment() {
    step "Verifying Docker environment"

    info "Docker system info:"
    docker system df

    info ""
    info "Images:"
    docker images | grep -E "REPOSITORY|$IMAGE_NAME"

    info ""
    info "Networks:"
    docker network ls | grep -E "NETWORK|$NETWORK_NAME"

    info ""
    info "Volumes:"
    docker volume ls | grep -E "VOLUME|$VOLUME_NAME"

    info ""
    info "Containers:"
    docker ps | grep -E "CONTAINER|$TEST_CONTAINER" || info "No containers running"
}

#------------------------------------------------------------------------------
# 清理函数
#------------------------------------------------------------------------------

cleanup_test_container() {
    info "Cleaning up test container..."
    docker stop "$TEST_CONTAINER" &> /dev/null || true
    docker rm "$TEST_CONTAINER" &> /dev/null || true
    success "Test container cleaned up"
}

#------------------------------------------------------------------------------
# 主函数
#------------------------------------------------------------------------------

print_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Options:
  --pull-only      Only pull image from registry, don't build
  --skip-test      Skip test container creation
  --help           Show this help message

Examples:
  $0                              # Build image and run test
  $0 --pull-only                  # Pull from registry only
  $0 --skip-test                  # Build without testing

Environment Variables:
  IMAGE_NAME      Docker image name (default: openclaw/agent)
  IMAGE_TAG       Docker image tag (default: latest)
  NETWORK_NAME    Docker network name (default: opclaw-network)
  VOLUME_NAME     Docker volume name (default: opclaw-data)
EOF
}

print_summary() {
    echo ""
    echo "=============================================================================="
    echo "Docker Deployment Complete"
    echo "=============================================================================="
    echo ""
    echo "Configuration:"
    echo "  Image: $FULL_IMAGE"
    echo "  Network: $NETWORK_NAME"
    echo "  Volume: $VOLUME_NAME"
    echo ""
    echo "Next Steps:"
    echo "  1. Verify application can connect to database"
    echo "  2. Deploy backend application (TASK-060)"
    echo "  3. Deploy frontend application (TASK-061)"
    echo ""
    echo "Useful Commands:"
    echo "  docker ps                           # List running containers"
    echo "  docker logs -f $TEST_CONTAINER      # View container logs"
    echo "  docker exec -it $TEST_CONTAINER sh  # Access container shell"
    echo "  docker stop $TEST_CONTAINER         # Stop test container"
    echo "  docker rm -f $TEST_CONTAINER        # Remove test container"
    echo ""
    echo "=============================================================================="
}

main() {
    # 解析参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            --pull-only)
                PULL_ONLY=true
                shift
                ;;
            --skip-test)
                SKIP_TEST=true
                shift
                ;;
            --help)
                print_usage
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                print_usage
                exit 1
                ;;
        esac
    done

    echo "=============================================================================="
    echo "AIOpc Cloud - OpenClaw Agent Docker Deployment"
    echo "=============================================================================="
    echo "Timestamp: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "Image: $FULL_IMAGE"
    echo "Pull Only: $PULL_ONLY"
    echo "Skip Test: $SKIP_TEST"
    echo "=============================================================================="
    echo ""

    # 验证环境
    check_docker
    check_dockerfile

    # 创建Docker资源
    create_network
    create_volume

    # 构建或拉取镜像
    build_or_pull_image

    # 运行测试容器
    run_test_container

    # 验证环境
    verify_docker_environment

    # 打印总结
    print_summary

    success "Docker deployment completed successfully!"

    # 询问是否清理测试容器
    if [ "$SKIP_TEST" = false ]; then
        echo ""
        read -p "Keep test container running? (Y/n): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]] && [[ -n "$REPLY" ]]; then
            cleanup_test_container
        fi
    fi
}

#------------------------------------------------------------------------------
# 脚本入口
#------------------------------------------------------------------------------

main "$@"
