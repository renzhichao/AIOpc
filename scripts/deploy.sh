#!/bin/bash

# AIOpc OpenClaw部署脚本
# 用途：在阿里云ECS上快速部署OpenClaw服务

set -e  # 遇到错误立即退出

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查系统要求
check_requirements() {
    log_info "检查系统要求..."

    # 检查操作系统
    if [[ ! -f /etc/os-release ]]; then
        log_error "无法确定操作系统版本"
        exit 1
    fi

    # 检查Docker
    if ! command -v docker &> /dev/null; then
        log_warn "Docker未安装，将自动安装..."
        install_docker
    else
        log_info "Docker已安装: $(docker --version)"
    fi

    # 检查Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        log_warn "Docker Compose未安装，将自动安装..."
        install_docker_compose
    else
        log_info "Docker Compose已安装: $(docker-compose --version)"
    fi

    # 检查Node.js
    if ! command -v node &> /dev/null; then
        log_warn "Node.js未安装，将自动安装..."
        install_nodejs
    else
        NODE_VERSION=$(node --version)
        log_info "Node.js已安装: $NODE_VERSION"
        if [[ ! "$NODE_VERSION" =~ v22 ]]; then
            log_warn "建议使用Node.js v22，当前版本: $NODE_VERSION"
        fi
    fi

    # 检查pnpm
    if ! command -v pnpm &> /dev/null; then
        log_info "安装pnpm..."
        npm install -g pnpm
    else
        log_info "pnpm已安装: $(pnpm --version)"
    fi
}

# 安装Docker
install_docker() {
    log_info "安装Docker..."

    if [[ -f /etc/centos-release ]] || [[ -f /etc/redhat-release ]]; then
        # CentOS/RHEL
        sudo yum install -y yum-utils
        sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
        sudo yum install -y docker-ce docker-ce-cli containerd.io
    elif [[ -f /etc/debian_version ]]; then
        # Debian/Ubuntu
        sudo apt-get update
        sudo apt-get install -y \
            ca-certificates \
            curl \
            gnupg \
            lsb-release
        sudo mkdir -p /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
        echo \
          "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
          $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
        sudo apt-get update
        sudo apt-get install -y docker-ce docker-ce-cli containerd.io
    else
        log_error "不支持的操作系统"
        exit 1
    fi

    sudo systemctl start docker
    sudo systemctl enable docker

    log_info "Docker安装完成"
}

# 安装Docker Compose
install_docker_compose() {
    log_info "安装Docker Compose..."

    DOCKER_COMPOSE_VERSION="v2.20.2"
    sudo curl -L "https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose

    log_info "Docker Compose安装完成"
}

# 安装Node.js v22
install_nodejs() {
    log_info "安装Node.js v22..."

    if [[ -f /etc/centos-release ]] || [[ -f /etc/redhat-release ]]; then
        # CentOS/RHEL
        sudo yum install -y nodejs npm
    elif [[ -f /etc/debian_version ]]; then
        # Debian/Ubuntu
        curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
        sudo apt-get install -y nodejs
    else
        log_error "不支持的操作系统"
        exit 1
    fi

    log_info "Node.js安装完成: $(node --version)"
}

# 配置环境变量
setup_env() {
    log_info "配置环境变量..."

    if [[ ! -f .env ]]; then
        log_info "创建.env文件..."
        cat > .env << EOF
# DeepSeek API配置
DEEPSEEK_API_KEY=your_deepseek_api_key_here
DEEPSEEK_API_BASE=https://api.deepseek.com

# PostgreSQL配置
POSTGRES_DB=opclaw
POSTGRES_USER=opclaw
POSTGRES_PASSWORD=change_this_password

# Redis配置
REDIS_PASSWORD=change_this_password

# 飞书配置
FEISHU_APP_ID=your_feishu_app_id
FEISHU_APP_SECRET=your_feishu_app_secret
FEISHU_VERIFY_TOKEN=your_verify_token
FEISHU_ENCRYPT_KEY=your_encrypt_key

# SMTP配置
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_USER=ai@example.com
SMTP_PASSWORD=your_smtp_password
EOF

        log_warn "请编辑.env文件并填入正确的配置信息"
        log_warn "然后重新运行此脚本"
        exit 0
    fi

    # 加载环境变量
    export $(cat .env | grep -v '^#' | xargs)

    log_info "环境变量已加载"
}

# 部署OpenClaw
deploy_opclaw() {
    log_info "开始部署OpenClaw..."

    # 克隆OpenClaw仓库（如果不存在）
    if [[ ! -d opclaw ]]; then
        log_info "克隆OpenClaw仓库..."
        git clone https://github.com/your-org/opclaw.git
        cd opclaw
    else
        cd opclaw
        git pull
    fi

    # 安装依赖
    log_info "安装OpenClaw依赖..."
    pnpm install

    # 初始化配置
    log_info "初始化配置..."
    pnpm run setup

    # 启动服务
    log_info "启动OpenClaw服务..."
    cd ../deployment
    docker-compose up -d

    log_info "OpenClaw部署完成"
}

# 配置防火墙
setup_firewall() {
    log_info "配置防火墙..."

    if command -v firewall-cmd &> /dev/null; then
        # firewalld
        sudo firewall-cmd --permanent --add-port=80/tcp
        sudo firewall-cmd --permanent --add-port=443/tcp
        sudo firewall-cmd --permanent --add-port=3000/tcp
        sudo firewall-cmd --reload
    elif command -v ufw &> /dev/null; then
        # ufw
        sudo ufw allow 80/tcp
        sudo ufw allow 443/tcp
        sudo ufw allow 3000/tcp
    fi

    log_info "防火墙配置完成"
}

# 健康检查
health_check() {
    log_info "执行健康检查..."

    # 检查Docker容器
    if ! docker ps | grep opclaw-agent > /dev/null; then
        log_error "OpenClaw Agent容器未运行"
        return 1
    fi

    if ! docker ps | grep opclaw-postgres > /dev/null; then
        log_error "PostgreSQL容器未运行"
        return 1
    fi

    if ! docker ps | grep opclaw-redis > /dev/null; then
        log_error "Redis容器未运行"
        return 1
    fi

    # 检查API
    sleep 5
    if curl -f http://localhost:3000/health > /dev/null 2>&1; then
        log_info "API健康检查通过"
    else
        log_warn "API健康检查失败，服务可能还在启动中"
    fi

    log_info "健康检查完成"
}

# 显示部署信息
show_info() {
    log_info "=========================================="
    log_info "OpenClaw部署完成！"
    log_info "=========================================="
    echo ""
    log_info "服务访问地址："
    echo "  - API: http://localhost:3000"
    echo "  - Web界面: http://localhost:3000/dashboard"
    echo ""
    log_info "数据库连接："
    echo "  - PostgreSQL: localhost:5432"
    echo "  - Redis: localhost:6379"
    echo ""
    log_info "常用命令："
    echo "  - 查看日志: docker-compose logs -f"
    echo "  - 停止服务: docker-compose down"
    echo "  - 重启服务: docker-compose restart"
    echo ""
    log_warn "下一步："
    echo "  1. 配置飞书开放平台"
    echo "  2. 设置Webhook URL: https://your-domain.com/feishu/events"
    echo "  3. 配置Agent角色和权限"
    echo "  4. 导入知识库数据"
    echo ""
}

# 主函数
main() {
    log_info "开始AIOpc OpenClaw部署..."
    echo ""

    check_requirements
    setup_env
    deploy_opclaw
    setup_firewall
    health_check
    show_info

    log_info "部署脚本执行完成！"
}

# 执行主函数
main "$@"
