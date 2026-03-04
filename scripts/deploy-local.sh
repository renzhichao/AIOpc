#!/bin/bash

# AIOpc 本地部署脚本
# 用途：在本地服务器上快速部署OpenClaw服务

set -e  # 遇到错误立即退出

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置变量
OPCLAW_DIR="/opt/opclaw"
CONFIG_DIR="/etc/opclaw"
DATA_DIR="/var/lib/opclaw"
LOG_DIR="/var/log/opclaw"

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

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# 检查是否为root用户
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "此脚本需要root权限，请使用sudo运行"
        exit 1
    fi
}

# 检测操作系统
detect_os() {
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        OS=$ID
        VERSION=$VERSION_ID
    else
        log_error "无法检测操作系统"
        exit 1
    fi

    log_info "检测到操作系统: $OS $VERSION"
}

# 安装Docker
install_docker() {
    log_step "安装Docker..."

    if command -v docker &> /dev/null; then
        log_info "Docker已安装: $(docker --version)"
        return
    fi

    case $OS in
        ubuntu|debian)
            apt-get update
            apt-get install -y \
                ca-certificates \
                curl \
                gnupg \
                lsb-release

            mkdir -p /etc/apt/keyrings
            curl -fsSL https://download.docker.com/linux/${OS}/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg

            echo \
              "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${OS} \
              $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

            apt-get update
            apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
            ;;

        centos|rhel)
            yum install -y yum-utils
            yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
            yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
            ;;

        *)
            log_error "不支持的操作系统: $OS"
            exit 1
            ;;
    esac

    systemctl start docker
    systemctl enable docker

    log_info "Docker安装完成"
}

# 安装Docker Compose
install_docker_compose() {
    log_step "安装Docker Compose..."

    if docker compose version &> /dev/null; then
        log_info "Docker Compose已安装"
        return
    fi

    # 使用Docker官方Compose插件
    log_info "使用Docker Compose V2"
}

# 安装Node.js
install_nodejs() {
    log_step "安装Node.js v22..."

    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        log_info "Node.js已安装: $NODE_VERSION"
        return
    fi

    case $OS in
        ubuntu|debian)
            curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
            apt-get install -y nodejs
            ;;

        centos|rhel)
            curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
            yum install -y nodejs
            ;;

        *)
            log_error "不支持的操作系统: $OS"
            exit 1
            ;;
    esac

    log_info "Node.js安装完成: $(node --version)"
}

# 安装pnpm
install_pnpm() {
    log_step "安装pnpm..."

    if command -v pnpm &> /dev/null; then
        log_info "pnpm已安装: $(pnpm --version)"
        return
    fi

    npm install -g pnpm

    log_info "pnpm安装完成: $(pnpm --version)"
}

# 安装VPN服务器（WireGuard）
install_wireguard() {
    log_step "安装WireGuard VPN..."

    if command -v wg &> /dev/null; then
        log_info "WireGuard已安装"
        return
    fi

    case $OS in
        ubuntu|debian)
            apt-get install -y wireguard
            ;;

        centos|rhel)
            yum install -y wireguard-tools
            ;;

        *)
            log_warn "跳过WireGuard安装（系统不支持）"
            return
            ;;
    esac

    log_info "WireGuard安装完成，需要后续配置"
}

# 创建目录结构
create_directories() {
    log_step "创建目录结构..."

    mkdir -p $OPCLAW_DIR
    mkdir -p $CONFIG_DIR
    mkdir -p $DATA_DIR/{postgres,redis,opclaw}
    mkdir -p $LOG_DIR
    mkdir -p $CONFIG_DIR/{agents,skills,knowledge}

    log_info "目录结构创建完成"
}

# 配置环境变量
setup_env() {
    log_step "配置环境变量..."

    if [[ ! -f $CONFIG_DIR/.env ]]; then
        cat > $CONFIG_DIR/.env << EOF
# OpenClaw配置
OPCLAW_DIR=$OPCLAW_DIR
CONFIG_DIR=$CONFIG_DIR
DATA_DIR=$DATA_DIR
LOG_DIR=$LOG_DIR

# DeepSeek API配置
DEEPSEEK_API_KEY=your_deepseek_api_key_here
DEEPSEEK_API_BASE=https://api.deepseek.com

# PostgreSQL配置
POSTGRES_DB=opclaw
POSTGRES_USER=opclaw
POSTGRES_PASSWORD=$(openssl rand -base64 32)

# Redis配置
REDIS_PASSWORD=$(openssl rand -base64 32)

# 飞书配置
FEISHU_APP_ID=your_feishu_app_id
FEISHU_APP_SECRET=your_feishu_app_secret
FEISHU_VERIFY_TOKEN=your_verify_token
FEISHU_ENCRYPT_KEY=your_encrypt_key

# 网络配置
INTERNAL_IP=$(hostname -I | awk '{print $1}')
AGENT_PORT=3000
NGINX_PORT=443
EOF

        chmod 600 $CONFIG_DIR/.env
        log_info "环境变量文件已创建: $CONFIG_DIR/.env"
        log_warn "请编辑文件并填入正确的配置信息"
    else
        log_info "环境变量文件已存在"
    fi

    # 加载环境变量
    export $(cat $CONFIG_DIR/.env | grep -v '^#' | xargs)
}

# 部署PostgreSQL
deploy_postgres() {
    log_step "部署PostgreSQL..."

    docker run -d \
        --name opclaw-postgres \
        --restart unless-stopped \
        -e POSTGRES_DB=${POSTGRES_DB} \
        -e POSTGRES_USER=${POSTGRES_USER} \
        -e POSTGRES_PASSWORD=${POSTGRES_PASSWORD} \
        -v $DATA_DIR/postgres:/var/lib/postgresql/data \
        -p 5432:5432 \
        postgres:14-alpine

    log_info "PostgreSQL部署完成"
}

# 部署Redis
deploy_redis() {
    log_step "部署Redis..."

    docker run -d \
        --name opclaw-redis \
        --restart unless-stopped \
        -v $DATA_DIR/redis:/data \
        -p 6379:6379 \
        redis:7-alpine \
        redis-server --requirepass ${REDIS_PASSWORD}

    log_info "Redis部署完成"
}

# 部署OpenClaw
deploy_opclaw() {
    log_step "部署OpenClaw..."

    # 克隆OpenClaw仓库
    if [[ ! -d $OPCLAW_DIR/opclaw ]]; then
        git clone https://github.com/your-org/opclaw.git $OPCLAW_DIR/opclaw
    fi

    cd $OPCLAW_DIR/opclaw

    # 安装依赖
    pnpm install

    # 初始化配置
    cp $CONFIG_DIR/.env .env

    # 构建Docker镜像
    docker build -t opclaw:latest .

    # 启动OpenClaw容器
    docker run -d \
        --name opclaw-agent \
        --restart unless-stopped \
        -v $CONFIG_DIR:/app/config \
        -v $DATA_DIR/opclaw:/app/data \
        -v $LOG_DIR:/app/logs \
        -p 3000:3000 \
        --env-file $CONFIG_DIR/.env \
        opclaw:latest

    log_info "OpenClaw部署完成"
}

# 部署Nginx
deploy_nginx() {
    log_step "部署Nginx..."

    # 创建Nginx配置
    cat > $CONFIG_DIR/nginx.conf << EOF
events {
    worker_connections 1024;
}

http {
    upstream agent_cluster {
        least_conn;
        server ${INTERNAL_IP}:3000 max_fails=3 fail_timeout=30s;
    }

    server {
        listen 443 ssl;
        server_name aiopoc.internal;

        ssl_certificate $CONFIG_DIR/ssl/internal.crt;
        ssl_certificate_key $CONFIG_DIR/ssl/internal.key;

        location /feishu/events {
            proxy_pass http://agent_cluster;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
        }

        location / {
            proxy_pass http://agent_cluster;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
        }
    }

    server {
        listen 80;
        server_name aiopoc.internal;
        return 301 https://\$server_name\$request_uri;
    }
}
EOF

    # 创建自签名SSL证书
    mkdir -p $CONFIG_DIR/ssl
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout $CONFIG_DIR/ssl/internal.key \
        -out $CONFIG_DIR/ssl/internal.crt \
        -subj "/C=CN/ST=State/L=City/O=Organization/CN=aiopoc.internal"

    # 启动Nginx
    docker run -d \
        --name opclaw-nginx \
        --restart unless-stopped \
        -v $CONFIG_DIR/nginx.conf:/etc/nginx/nginx.conf:ro \
        -v $CONFIG_DIR/ssl:/etc/nginx/ssl:ro \
        -p 80:80 \
        -p 443:443 \
        nginx:alpine

    log_info "Nginx部署完成"
}

# 部署监控（可选）
deploy_monitoring() {
    log_step "部署监控服务（可选）..."

    # Prometheus
    docker run -d \
        --name opclaw-prometheus \
        --restart unless-stopped \
        -v $CONFIG_DIR/prometheus.yml:/etc/prometheus/prometheus.yml \
        -p 9090:9090 \
        prom/prometheus

    # Grafana
    docker run -d \
        --name opclaw-grafana \
        --restart unless-stopped \
        -v $DATA_DIR/grafana:/var/lib/grafana \
        -p 3001:3000 \
        grafana/grafana

    log_info "监控服务部署完成"
    log_info "Prometheus: http://${INTERNAL_IP}:9090"
    log_info "Grafana: http://${INTERNAL_IP}:3001 (admin/admin)"
}

# 配置防火墙
setup_firewall() {
    log_step "配置防火墙..."

    if command -v ufw &> /dev/null; then
        ufw allow 22/tcp
        ufw allow 80/tcp
        ufw allow 443/tcp
        ufw allow 5432/tcp  # PostgreSQL
        ufw allow 6379/tcp  # Redis
        ufw allow 3000/tcp  # Agent
        ufw --force enable
        log_info "UFW防火墙已配置"
    elif command -v firewall-cmd &> /dev/null; then
        firewall-cmd --permanent --add-port=22/tcp
        firewall-cmd --permanent --add-port=80/tcp
        firewall-cmd --permanent --add-port=443/tcp
        firewall-cmd --permanent --add-port=5432/tcp
        firewall-cmd --permanent --add-port=6379/tcp
        firewall-cmd --permanent --add-port=3000/tcp
        firewall-cmd --reload
        log_info "firewalld防火墙已配置"
    else
        log_warn "未检测到防火墙，跳过配置"
    fi
}

# 健康检查
health_check() {
    log_step "执行健康检查..."

    sleep 5

    # 检查Docker容器
    local containers=("opclaw-postgres" "opclaw-redis" "opclaw-agent" "opclaw-nginx")
    local all_running=true

    for container in "${containers[@]}"; do
        if docker ps | grep $container > /dev/null; then
            log_info "✓ $container 运行正常"
        else
            log_error "✗ $container 未运行"
            all_running=false
        fi
    done

    # 检查API
    if curl -f http://localhost:3000/health > /dev/null 2>&1; then
        log_info "✓ API健康检查通过"
    else
        log_warn "✗ API健康检查失败，服务可能还在启动中"
    fi

    if [[ "$all_running" = true ]]; then
        log_info "所有服务运行正常"
        return 0
    else
        log_error "部分服务未正常运行"
        return 1
    fi
}

# 显示部署信息
show_info() {
    log_info "=========================================="
    log_info "OpenClaw本地部署完成！"
    log_info "=========================================="
    echo ""
    log_info "服务访问地址："
    echo "  - API: http://${INTERNAL_IP}:3000"
    echo "  - Web界面: https://${INTERNAL_IP} (内网)"
    echo ""
    log_info "数据库连接："
    echo "  - PostgreSQL: ${INTERNAL_IP}:5432"
    echo "  - 用户: ${POSTGRES_USER}"
    echo "  - 密码: ${POSTGRES_PASSWORD}"
    echo ""
    log_info "监控服务："
    echo "  - Prometheus: http://${INTERNAL_IP}:9090"
    echo "  - Grafana: http://${INTERNAL_IP}:3001"
    echo ""
    log_info "配置文件位置："
    echo "  - 环境变量: $CONFIG_DIR/.env"
    echo "  - Nginx配置: $CONFIG_DIR/nginx.conf"
    echo "  - 数据目录: $DATA_DIR"
    echo "  - 日志目录: $LOG_DIR"
    echo ""
    log_info "常用命令："
    echo "  - 查看日志: docker logs -f opclaw-agent"
    echo "  - 重启服务: docker restart opclaw-agent"
    echo "  - 查看状态: docker ps"
    echo ""
    log_warn "下一步："
    echo "  1. 编辑配置: vi $CONFIG_DIR/.env"
    echo "  2. 配置飞书开放平台"
    echo "  3. 设置Webhook URL"
    echo "  4. 导入知识库数据"
    echo ""
    log_warn "重要提示："
    echo "  - 请立即修改默认密码"
    echo "  - 配置DeepSeek API密钥"
    echo "  - 配置飞书应用密钥"
    echo ""
}

# 主函数
main() {
    log_info "开始AIOpc OpenClaw本地部署..."
    echo ""

    check_root
    detect_os
    install_docker
    install_docker_compose
    install_nodejs
    install_pnpm
    install_wireguard
    create_directories
    setup_env
    deploy_postgres
    deploy_redis
    deploy_opclaw
    deploy_nginx
    deploy_monitoring
    setup_firewall
    health_check
    show_info

    log_info "部署脚本执行完成！"
}

# 执行主函数
main "$@"
