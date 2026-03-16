#!/bin/bash

################################################################################
# AIOpc 一键云端部署脚本
#
# 功能：
# - 自动检查服务器环境
# - 安装 Docker 和 Docker Compose
# - 克隆/更新代码仓库
# - 配置环境变量
# - 启动所有服务
# - 验证部署状态
#
# 用法: ./deploy-to-cloud.sh [环境]
#
# 参数:
#   环境 - production|staging (默认: production)
################################################################################

set -e  # 遇到错误立即退出

#------------------------------------------------------------------------------
# 配置
#------------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="/opt/AIOpc"
ENVIRONMENT="${1:-production}"
BRANCH="feature/mvp-core-closed-loop"
REPO_URL="https://github.com/renzhichao/AIOpc.git"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

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
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${MAGENTA}$*${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════════════════${NC}"
    echo ""
    log "STEP" "$*"
}

#------------------------------------------------------------------------------
# 系统检查函数
#------------------------------------------------------------------------------

check_root() {
    if [ "$EUID" -ne 0 ]; then
        error "此脚本需要 root 权限运行"
        error "请使用: sudo $0"
        exit 1
    fi
    success "Root 权限检查通过"
}

check_os() {
    info "检查操作系统..."

    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        VERSION=$VERSION_ID
        info "操作系统: $OS $VERSION"
    else
        error "无法检测操作系统版本"
        exit 1
    fi

    success "操作系统检查通过"
}

check_memory() {
    info "检查系统内存..."

    local total_mem=$(free -m | awk 'NR==2{print $2}')
    local required_mem=4096  # 4GB

    if [ "$total_mem" -lt $required_mem ]; then
        warning "系统内存不足: ${total_mem}MB < ${required_mem}MB"
        warning "建议至少 4GB 内存"
        read -p "是否继续部署? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            error "部署已取消"
            exit 1
        fi
    else
        success "内存检查通过: ${total_mem}MB"
    fi
}

check_disk() {
    info "检查磁盘空间..."

    local available_space=$(df -m /opt | awk 'NR==2{print $4}')
    local required_space=20480  # 20GB

    if [ "$available_space" -lt $required_space ]; then
        error "磁盘空间不足: ${available_space}MB < ${required_space}MB"
        error "请至少释放 20GB 空间"
        exit 1
    fi

    success "磁盘空间检查通过: ${available_space}MB 可用"
}

#------------------------------------------------------------------------------
# 安装函数
#------------------------------------------------------------------------------

install_docker() {
    if command -v docker &> /dev/null; then
        info "Docker 已安装: $(docker --version)"
        return
    fi

    info "安装 Docker..."

    # 安装依赖
    apt update
    apt install -y \
        apt-transport-https \
        ca-certificates \
        curl \
        gnupg \
        lsb-release

    # 添加 Docker GPG 密钥
    curl -fsSL https://download.docker.com/linux/${OS}/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

    # 添加 Docker 仓库
    echo \
        "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/${OS} \
        $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

    # 安装 Docker
    apt update
    apt install -y docker-ce docker-ce-cli containerd.io

    # 启动 Docker
    systemctl start docker
    systemctl enable docker

    success "Docker 安装完成: $(docker --version)"
}

install_docker_compose() {
    if command -v docker-compose &> /dev/null; then
        info "Docker Compose 已安装: $(docker-compose --version)"
        return
    fi

    info "安装 Docker Compose..."

    # 下载最新版本
    local compose_version="2.24.0"
    curl -L "https://github.com/docker/compose/releases/download/v${compose_version}/docker-compose-$(uname -s)-$(uname -m)" \
        -o /usr/local/bin/docker-compose

    # 添加执行权限
    chmod +x /usr/local/bin/docker-compose

    # 创建符号链接
    ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose

    success "Docker Compose 安装完成: $(docker-compose --version)"
}

install_git() {
    if command -v git &> /dev/null; then
        info "Git 已安装: $(git --version)"
        return
    fi

    info "安装 Git..."
    apt install -y git
    success "Git 安装完成: $(git --version)"
}

install_dependencies() {
    step "安装系统依赖"

    install_git
    install_docker
    install_docker_compose
}

#------------------------------------------------------------------------------
# 部署函数
#------------------------------------------------------------------------------

clone_or_update_repo() {
    step "准备代码仓库"

    if [ -d "$PROJECT_ROOT" ]; then
        info "项目目录已存在，更新代码..."
        cd "$PROJECT_ROOT"
        git fetch origin
        git checkout "$BRANCH"
        git pull origin "$BRANCH"
    else
        info "克隆代码仓库..."
        mkdir -p "$(dirname "$PROJECT_ROOT")"
        cd "$(dirname "$PROJECT_ROOT")"
        git clone "$REPO_URL" "$PROJECT_ROOT"
        cd "$PROJECT_ROOT"
        git checkout "$BRANCH"
    fi

    success "代码准备完成: $PROJECT_ROOT"
}

configure_environment() {
    step "配置环境变量"

    cd "$PROJECT_ROOT"

    if [ ! -f .env ]; then
        info "创建环境配置文件..."
        cp .env.production .env

        warning "请编辑 .env 文件配置以下必需项："
        echo ""
        echo "🔐 必须修改的配置项："
        echo "  - POSTGRES_PASSWORD (数据库密码)"
        echo "  - REDIS_PASSWORD (Redis 密码)"
        echo "  - JWT_SECRET (JWT 密钥)"
        echo "  - FEISHU_APP_ID (飞书应用 ID)"
        echo "  - FEISHU_APP_SECRET (飞书应用密钥)"
        echo "  - DEEPSEEK_API_KEY (DeepSeek API 密钥)"
        echo ""

        read -p "是否现在编辑配置文件? (Y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z "$REPLY" ]]; then
            ${EDITOR:-nano} .env
        fi

        success "环境配置完成"
    else
        info "环境配置文件已存在"
    fi
}

create_ssl_certificates() {
    step "配置 SSL 证书"

    mkdir -p ssl/certs

    if [ ! -f ssl/certs/cert.pem ] || [ ! -f ssl/certs/key.pem ]; then
        warning "未找到 SSL 证书，生成自签名证书..."

        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout ssl/certs/key.pem \
            -out ssl/certs/cert.pem \
            -subj "/C=CN/ST=Beijing/L=Beijing/O=AIOpc/OU=IT/CN=localhost"

        warning "使用自签名证书"
        warning "生产环境建议使用 Let's Encrypt 免费证书"
        warning "获取证书: certbot certonly --standalone -d your-domain.com"

        success "SSL 证书生成完成"
    else
        info "SSL 证书已存在"
    fi
}

start_services() {
    step "启动服务"

    cd "$PROJECT_ROOT"

    info "构建并启动 Docker 容器..."
    docker-compose -f docker-compose.prod.yml up -d --build

    info "等待服务启动..."
    sleep 10

    success "服务启动完成"
}

verify_deployment() {
    step "验证部署"

    cd "$PROJECT_ROOT"

    # 检查容器状态
    info "检查容器状态..."
    docker-compose -f docker-compose.prod.yml ps

    # 检查后端健康
    info "检查后端健康状态..."
    local max_attempts=30
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        if curl -f http://localhost:3000/health &> /dev/null; then
            success "后端服务健康检查通过"
            break
        fi

        if [ $attempt -eq $max_attempts ]; then
            error "后端服务健康检查失败"
            error "请查看日志: docker-compose logs backend"
            return 1
        fi

        info "等待后端服务启动... ($attempt/$max_attempts)"
        sleep 2
        attempt=$((attempt + 1))
    done

    # 检查前端
    info "检查前端服务..."
    if curl -f http://localhost/ &> /dev/null; then
        success "前端服务健康检查通过"
    else
        warning "前端服务可能未就绪"
    fi

    # 显示服务信息
    echo ""
    info "═══════════════════════════════════════════════════════════════════════════"
    info "                    部署成功！"
    info "═══════════════════════════════════════════════════════════════════════════"
    echo ""
    info "服务地址:"
    info "  前端: http://$(hostname -I | awk '{print $1}')"
    info "  后端 API: http://$(hostname -I | awk '{print $1}'):3000"
    info "  健康检查: http://$(hostname -I | awk '{print $1}'):3000/health"
    echo ""
    info "管理命令:"
    info "  查看日志: docker-compose -f docker-compose.prod.yml logs -f"
    info "  重启服务: docker-compose -f docker-compose.prod.yml restart"
    info "  停止服务: docker-compose -f docker-compose.prod.yml down"
    echo ""
    info "文档: 查看 CLOUD_DEPLOYMENT_GUIDE.md 了解更多"
}

#------------------------------------------------------------------------------
# 主函数
#------------------------------------------------------------------------------

print_banner() {
    echo ""
    echo "██╗     ██╗███████╗██╗  ██╗██╗      ██████╗ ███████╗ █████╗ ██████╗ "
    echo "██║     ██║██╔════╝██║ ██╔╝██║     ██╔════╝ ██╔════╝██╔══██╗██╔══██╗"
    echo "██║     ██║█████╗  █████╔╝██║     ██║  ███╗█████╗  ███████║██║  ██║"
    echo "██║     ██║██╔══╝  ██╔═██╗██║     ██║   ██║██╔══╝  ██╔══██║██║  ██║"
    echo "███████╗██║███████╗██║  ██║███████╗╚██████╔╝███████╗██║  ██║██████╔╝"
    echo "╚══════╝╚═╝╚══════╝╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝╚═════╝ "
    echo ""
    echo "                       云端部署工具 v1.0"
    echo "                   AIOpc Platform Deployment"
    echo ""
}

print_usage() {
    cat << EOF
用法: $0 [选项] [环境]

选项:
  -h, --help     显示此帮助信息
  -v, --verbose  详细输出模式

环境:
  production     生产环境 (默认)
  staging        测试环境

示例:
  $0              # 部署到生产环境
  $0 staging      # 部署到测试环境

EOF
}

main() {
    # 解析参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                print_usage
                exit 0
                ;;
            -v|--verbose)
                set -x
                shift
                ;;
            production|staging)
                ENVIRONMENT="$1"
                shift
                ;;
            *)
                error "未知参数: $1"
                print_usage
                exit 1
                ;;
        esac
    done

    # 打印横幅
    print_banner

    # 系统检查
    check_root
    check_os
    check_memory
    check_disk

    # 安装依赖
    install_dependencies

    # 部署应用
    clone_or_update_repo
    configure_environment
    create_ssl_certificates
    start_services

    # 验证部署
    verify_deployment

    success "🎉 部署完成！"
}

#------------------------------------------------------------------------------
# 脚本入口
#------------------------------------------------------------------------------

# 捕获错误
trap 'error "部署失败，请查看错误信息"; exit 1' ERR

# 运行主函数
main "$@"
