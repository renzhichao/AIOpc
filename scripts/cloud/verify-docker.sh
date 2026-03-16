#!/bin/bash

################################################################################
# AIOpc Cloud - Docker环境验证脚本
#
# 功能:
# - 验证Docker安装和配置
# - 检查镜像、网络、卷
# - 测试容器创建和运行
# - 性能和资源使用检查
#
# 用法: ./verify-docker.sh [--verbose] [--quick]
################################################################################

set -e

#------------------------------------------------------------------------------
# 配置
#------------------------------------------------------------------------------

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# 配置
IMAGE_NAME="openclaw/agent"
NETWORK_NAME="opclaw-network"
VOLUME_NAME="opclaw-data"

# 选项
VERBOSE=false
QUICK=false

#------------------------------------------------------------------------------
# 工具函数
#------------------------------------------------------------------------------

info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

success() {
    echo -e "${GREEN}✓${NC} $*"
}

warning() {
    echo -e "${YELLOW}⚠${NC} $*"
}

error() {
    echo -e "${RED}✗${NC} $*"
}

section() {
    echo ""
    echo -e "${CYAN}▶ $1${NC}"
}

#------------------------------------------------------------------------------
# 检查函数
#------------------------------------------------------------------------------

check_docker_installation() {
    section "Docker Installation"

    if command -v docker &> /dev/null; then
        local version=$(docker --version | awk '{print $3}' | sed 's/,//')
        success "Docker installed: $version"
        return 0
    else
        error "Docker not installed"
        return 1
    fi
}

check_docker_daemon() {
    section "Docker Daemon"

    if docker info &> /dev/null; then
        success "Docker daemon running"

        if [ "$VERBOSE" = true ]; then
            info "Docker info:"
            docker info | head -20
        fi
        return 0
    else
        error "Docker daemon not running"
        return 1
    fi
}

check_docker_compose() {
    section "Docker Compose"

    if docker compose version &> /dev/null; then
        local version=$(docker compose version --short)
        success "Docker Compose installed: $version"
        return 0
    else
        warning "Docker Compose not installed (optional)"
        return 0
    fi
}

check_image() {
    section "Docker Image"

    if docker images | grep -q "$IMAGE_NAME"; then
        local tag=$(docker images "$IMAGE_NAME" --format "{{.Tag}}" | head -1)
        local id=$(docker images "$IMAGE_NAME:$tag" --format "{{.ID}}")
        local size=$(docker images "$IMAGE_NAME:$tag" --format "{{.Size}}")
        local created=$(docker images "$IMAGE_NAME:$tag" --format "{{.CreatedSince}}")

        success "Image found: $IMAGE_NAME:$tag"
        info "  ID: $id"
        info "  Size: $size"
        info "  Created: $created"

        if [ "$VERBOSE" = true ]; then
            info "Image details:"
            docker inspect "$IMAGE_NAME:$tag" --format '{{json .Config}}' | jq -r '.'
        fi

        return 0
    else
        error "Image not found: $IMAGE_NAME"
        info "  Build with: ./scripts/cloud/deploy-docker.sh"
        return 1
    fi
}

check_network() {
    section "Docker Network"

    if docker network ls | grep -q "$NETWORK_NAME"; then
        success "Network found: $NETWORK_NAME"

        local driver=$(docker network inspect "$NETWORK_NAME" --format '{{.Driver}}')
        local scope=$(docker network inspect "$NETWORK_NAME" --format '{{.Scope}}')
        local subnet=$(docker network inspect "$NETWORK_NAME" --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}')

        info "  Driver: $driver"
        info "  Scope: $scope"
        if [ -n "$subnet" ]; then
            info "  Subnet: $subnet"
        fi

        if [ "$VERBOSE" = true ]; then
            local containers=$(docker network inspect "$NETWORK_NAME" --format '{{len .Containers}}')
            info "  Connected containers: $containers"
        fi

        return 0
    else
        error "Network not found: $NETWORK_NAME"
        info "  Create with: docker network create $NETWORK_NAME"
        return 1
    fi
}

check_volume() {
    section "Docker Volume"

    if docker volume ls | grep -q "$VOLUME_NAME"; then
        success "Volume found: $VOLUME_NAME"

        local driver=$(docker volume inspect "$VOLUME_NAME" --format '{{.Driver}}')
        local mountpoint=$(docker volume inspect "$VOLUME_NAME" --format '{{.Mountpoint}}')
        local size=$(du -sh "$mountpoint" 2>/dev/null | awk '{print $1}' || echo "unknown")

        info "  Driver: $driver"
        info "  Mountpoint: $mountpoint"
        info "  Size: $size"

        return 0
    else
        error "Volume not found: $VOLUME_NAME"
        info "  Create with: docker volume create $VOLUME_NAME"
        return 1
    fi
}

check_containers() {
    section "Running Containers"

    local containers=$(docker ps --format '{{.Names}}' | grep -c "opclaw" || echo "0")

    if [ "$containers" -gt 0 ]; then
        success "Found $containers opclaw container(s)"

        if [ "$VERBOSE" = true ]; then
            info "Container details:"
            docker ps --filter "name=opclaw" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
        fi
    else
        info "No opclaw containers running"
    fi

    return 0
}

check_disk_space() {
    section "Disk Space"

    local docker_df=$(docker system df --format "table {{.Type}}\t{{.TotalCount}}\t{{.Size}}" 2>/dev/null || echo "")

    if [ -n "$docker_df" ]; then
        success "Docker disk usage:"
        echo "$docker_df"
    else
        warning "Could not get disk usage"
    fi

    # 检查可用磁盘空间
    local available=$(df -h / | awk 'NR==2 {print $4}')
    info "Available disk space: $available"

    return 0
}

check_docker_health() {
    section "Docker Health"

    # 检查Docker服务状态
    if systemctl is-active --quiet docker 2>/dev/null; then
        success "Docker service is active"
    else
        warning "Docker service status unknown (systemd not available)"
    fi

    # 检查Docker API
    if docker version &> /dev/null; then
        success "Docker API responding"
    else
        error "Docker API not responding"
        return 1
    fi

    return 0
}

run_test_container() {
    if [ "$QUICK" = true ]; then
        return 0
    fi

    section "Test Container"

    info "Creating test container..."

    local test_container="verify-test-$$"

    if docker run -d \
        --name "$test_container" \
        --network "$NETWORK_NAME" \
        -e NODE_ENV=test \
        "$IMAGE_NAME:latest" sleep 5 &> /dev/null; then

        success "Test container created"

        # 检查容器日志
        if [ "$VERBOSE" = true ]; then
            info "Container logs:"
            docker logs "$test_container" 2>/dev/null || true
        fi

        # 清理
        docker rm -f "$test_container" &> /dev/null
        success "Test container cleaned up"

        return 0
    else
        error "Failed to create test container"
        return 1
    fi
}

print_summary() {
    echo ""
    echo "=============================================================================="
    echo "Docker Environment Verification Complete"
    echo "=============================================================================="
    echo ""
    echo "Quick Commands:"
    echo "  docker ps                    # List running containers"
    echo "  docker images                # List images"
    echo "  docker network ls            # List networks"
    echo "  docker volume ls             # List volumes"
    echo "  docker system df             # Show disk usage"
    echo "  docker stats                 # Show container stats"
    echo ""
    echo "=============================================================================="
}

#------------------------------------------------------------------------------
# 主函数
#------------------------------------------------------------------------------

main() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --verbose)
                VERBOSE=true
                shift
                ;;
            --quick)
                QUICK=true
                shift
                ;;
            *)
                echo "Usage: $0 [--verbose] [--quick]"
                exit 1
                ;;
        esac
    done

    echo "=============================================================================="
    echo "AIOpc Cloud - Docker Environment Verification"
    echo "=============================================================================="
    echo "Timestamp: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "=============================================================================="
    echo ""

    local passed=0
    local failed=0

    # 执行检查
    check_docker_installation && ((passed++)) || ((failed++))
    check_docker_daemon && ((passed++)) || ((failed++))
    check_docker_compose && ((passed++)) || ((failed++))
    check_image && ((passed++)) || ((failed++))
    check_network && ((passed++)) || ((failed++))
    check_volume && ((passed++)) || ((failed++))
    check_containers && ((passed++)) || ((failed++))
    check_disk_space && ((passed++)) || ((failed++))
    check_docker_health && ((passed++)) || ((failed++))

    if [ "$QUICK" = false ]; then
        run_test_container && ((passed++)) || ((failed++))
    fi

    # 打印总结
    print_summary

    echo ""
    echo "Results: $passed passed, $failed failed"

    if [ $failed -eq 0 ]; then
        success "All checks passed!"
        exit 0
    else
        error "Some checks failed"
        exit 1
    fi
}

main "$@"
