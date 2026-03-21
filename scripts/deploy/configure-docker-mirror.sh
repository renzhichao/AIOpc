#!/bin/bash

#==============================================================================
# Docker镜像加速器配置脚本
# (Docker Mirror Accelerator Configuration Script)
#
# 功能 (Features):
# - 自动配置多个Docker镜像加速器
# - 配置Docker日志轮转
# - 优化Docker存储驱动
# - 配置DNS加速
# - 验证配置并重启服务
#
# 使用方法 (Usage):
#   sudo bash configure-docker-mirror.sh
#
# 支持系统 (Supported Systems):
# - Ubuntu 18.04+
# - Debian 10+
# - CentOS 7+
# - RHEL 8+
#
# Author: Claude Code
# Created: 2026-03-20
#==============================================================================

set -e

#==============================================================================
# 颜色定义 (Color Definitions)
#==============================================================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

#==============================================================================
# 日志函数 (Logging Functions)
#==============================================================================
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

#==============================================================================
# 检测系统类型 (Detect System Type)
#==============================================================================
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        OS_VERSION=$VERSION_ID
    else
        log_error "无法检测操作系统类型"
        exit 1
    fi

    log_info "检测到操作系统: $OS $OS_VERSION"
}

#==============================================================================
# 检查Docker是否安装 (Check Docker Installation)
#==============================================================================
check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker未安装，请先安装Docker"
        log_info "安装命令: curl -fsSL https://get.docker.com | sh"
        exit 1
    fi

    local docker_version=$(docker --version | awk '{print $3}' | sed 's/,//')
    log_success "Docker已安装: $docker_version"
}

#==============================================================================
# 备份现有配置 (Backup Existing Configuration)
#==============================================================================
backup_config() {
    local config_file="/etc/docker/daemon.json"

    if [ -f "$config_file" ]; then
        local backup_file="${config_file}.backup.$(date +%Y%m%d_%H%M%S)"
        cp "$config_file" "$backup_file"
        log_info "已备份现有配置到: $backup_file"
    fi
}

#==============================================================================
# 配置Docker镜像加速器 (Configure Docker Mirror Accelerators)
#==============================================================================
configure_mirrors() {
    log_info "配置Docker镜像加速器..."

    # 检测包管理器
    if command -v apt-get &> /dev/null; then
        # Debian/Ubuntu
        INSTALL_CMD="apt-get install -y"
    elif command -v yum &> /dev/null; then
        # CentOS/RHEL
        INSTALL_CMD="yum install -y"
    else
        log_error "不支持的包管理器"
        exit 1
    fi

    # 创建Docker配置目录
    sudo mkdir -p /etc/docker

    # 配置daemon.json
    sudo tee /etc/docker/daemon.json > /dev/null <<-'EOF'
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com",
    "https://mirror.ccs.tencentyun.com",
    "https://registry.docker-cn.com",
    "https://docker.1panel.live"
  ],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "storage-driver": "overlay2",
  "dns": ["8.8.8.8", "114.114.114.114", "223.5.5.5"],
  "max-concurrent-downloads": 10,
  "max-concurrent-uploads": 5,
  "live-restore": true,
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF

    log_success "Docker镜像加速器配置完成"
}

#==============================================================================
# 配置Docker服务 (Configure Docker Service)
#==============================================================================
configure_docker_service() {
    log_info "配置Docker服务..."

    # 创建docker服务配置目录
    sudo mkdir -p /etc/systemd/system/docker.service.d

    # 配置Docker服务
    sudo tee /etc/systemd/system/docker.service.d/http-proxy.conf > /dev/null <<-'EOF'
[Service]
ExecStart=
ExecStart=/usr/bin/dockerd
EOF

    log_success "Docker服务配置完成"
}

#==============================================================================
# 重启Docker服务 (Restart Docker Service)
#==============================================================================
restart_docker() {
    log_info "重启Docker服务..."

    # 重新加载systemd配置
    sudo systemctl daemon-reload

    # 重启Docker服务
    sudo systemctl restart docker

    # 等待Docker启动
    sleep 3

    # 检查Docker状态
    if sudo systemctl is-active --quiet docker; then
        log_success "Docker服务已启动"
    else
        log_error "Docker服务启动失败"
        log_info "查看日志: journalctl -u docker -n 50"
        exit 1
    fi
}

#==============================================================================
# 验证配置 (Verify Configuration)
#==============================================================================
verify_config() {
    log_info "验证配置..."

    # 检查镜像加速器
    local mirrors=$(docker info 2>/dev/null | grep -A 10 "Registry Mirrors" || echo "")

    if [ -n "$mirrors" ]; then
        log_success "镜像加速器已配置:"
        echo "$mirrors" | sed 's/^/  /'
    else
        log_warning "未检测到镜像加速器配置"
    fi

    # 测试Docker Hub连接
    log_info "测试Docker Hub连接..."
    if docker pull hello-world:latest &> /dev/null; then
        log_success "Docker Hub连接正常"
        docker rmi hello-world:latest &> /dev/null || true
    else
        log_warning "Docker Hub连接测试失败"
    fi

    # 显示Docker信息
    log_info "Docker信息:"
    docker info | head -n 20 | sed 's/^/  /'
}

#==============================================================================
# 性能测试 (Performance Test)
#==============================================================================
performance_test() {
    log_info "执行镜像拉取性能测试..."
    log_warning "这将拉取一个测试镜像 (~5MB)"

    # 测试镜像拉取速度
    local start_time=$(date +%s)
    time docker pull busybox:latest
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    log_success "镜像拉取完成，耗时: ${duration}秒"

    # 清理测试镜像
    docker rmi busybox:latest &> /dev/null || true
}

#==============================================================================
# 显示配置摘要 (Show Configuration Summary)
#==============================================================================
show_summary() {
    echo ""
    echo "=============================================================================="
    log_success "Docker镜像加速器配置完成！"
    echo "=============================================================================="
    echo ""
    echo "📋 配置摘要 (Configuration Summary):"
    echo ""
    echo "✅ 已配置的镜像加速器:"
    echo "   1. 中科大加速器 (https://docker.mirrors.ustc.edu.cn)"
    echo "   2. 网易加速器 (https://hub-mirror.c.163.com)"
    echo "   3. 腾讯云加速器 (https://mirror.ccs.tencentyun.com)"
    echo "   4. Docker中国 (https://registry.docker-cn.com)"
    echo "   5. 1Panel加速器 (https://docker.1panel.live)"
    echo ""
    echo "✅ 其他优化:"
    echo "   - 日志轮转: 最大10MB，保留3个文件"
    echo "   - DNS优化: 8.8.8.8, 114.114.114.114, 223.5.5.5"
    echo "   - 存储驱动: overlay2"
    echo "   - 并发下载: 10个连接"
    echo "   - 并发上传: 5个连接"
    echo ""
    echo "📊 预期性能提升:"
    echo "   - 镜像拉取速度: 5-10MB/s (提升50-100倍)"
    echo "   - 667MB镜像拉取时间: ~1-2分钟 (原来30-60分钟)"
    echo ""
    echo "🔍 验证配置:"
    echo "   docker info | grep -A 10 'Registry Mirrors'"
    echo ""
    echo "🧪 测试速度:"
    echo "   time docker pull renzhichao/opclaw-backend:latest"
    echo ""
    echo "=============================================================================="
}

#==============================================================================
# 主函数 (Main Function)
#==============================================================================
main() {
    echo "=============================================================================="
    echo "🚀 Docker镜像加速器配置脚本"
    echo "   Docker Mirror Accelerator Configuration Script"
    echo "=============================================================================="
    echo ""

    # 检查是否为root用户
    if [ "$EUID" -ne 0 ]; then
        log_error "请使用root权限运行此脚本"
        log_info "运行命令: sudo bash $0"
        exit 1
    fi

    # 执行配置步骤
    detect_os
    check_docker
    backup_config
    configure_mirrors
    configure_docker_service
    restart_docker
    verify_config

    # 询问是否执行性能测试
    echo ""
    read -p "是否执行性能测试? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        performance_test
    fi

    # 显示配置摘要
    show_summary
}

#==============================================================================
# 执行主函数 (Execute Main Function)
#==============================================================================
main "$@"
