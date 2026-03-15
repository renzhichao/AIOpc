#!/bin/bash

###############################################################################
# AIOpc 本地开发环境一键设置脚本
#
# 功能:
# - 检查系统依赖 (Docker, pnpm, Node.js)
# - 创建配置文件
# - 启动开发环境服务
# - 运行数据库迁移
# - 提供访问地址和测试账号
#
# 使用方法:
#   ./scripts/setup-local-dev.sh
#
# 环境要求:
#   - Docker 20+
#   - Docker Compose V2
#   - pnpm 8+
#   - Node.js 22+
###############################################################################

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
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

# 打印带边框的标题
print_banner() {
    local text="$1"
    local width=60

    echo ""
    echo -e "${BLUE}$(printf '=%.0s' $(seq 1 $width))${NC}"
    echo -e "${BLUE}$(printf ' %.0s' $(seq 1 $((($width - ${#text}) / 2))))${text}$(printf ' %.0s' $(seq 1 $((($width - ${#text}) / 2))))${NC}"
    echo -e "${BLUE}$(printf '=%.0s' $(seq 1 $width))${NC}"
    echo ""
}

# 检查命令是否存在
check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "$1 未安装"
        return 1
    fi
    return 0
}

# 检查系统依赖
check_dependencies() {
    print_banner "检查系统依赖"

    local all_ok=true

    # 检查 Docker
    if check_command docker; then
        local docker_version=$(docker --version | awk '{print $3}' | sed 's/,//')
        log_success "Docker 已安装: $docker_version"
    else
        log_error "Docker 未安装，请先安装 Docker: https://docs.docker.com/get-docker/"
        all_ok=false
    fi

    # 检查 Docker Compose
    if docker compose version &> /dev/null; then
        local compose_version=$(docker compose version --short)
        log_success "Docker Compose 已安装: $compose_version"
    else
        log_error "Docker Compose 未安装，请先安装 Docker Compose V2"
        all_ok=false
    fi

    # 检查 Node.js
    if check_command node; then
        local node_version=$(node --version)
        log_success "Node.js 已安装: $node_version"

        # 检查版本是否符合要求 (>= 22)
        local major_version=$(echo $node_version | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$major_version" -lt 22 ]; then
            log_warning "Node.js 版本过低 ($node_version)，建议使用 Node.js 22 或更高版本"
        fi
    else
        log_error "Node.js 未安装，请先安装 Node.js: https://nodejs.org/"
        all_ok=false
    fi

    # 检查 pnpm
    if check_command pnpm; then
        local pnpm_version=$(pnpm --version)
        log_success "pnpm 已安装: $pnpm_version"
    else
        log_warning "pnpm 未安装，正在安装 pnpm..."
        npm install -g pnpm
        if [ $? -eq 0 ]; then
            log_success "pnpm 安装成功: $(pnpm --version)"
        else
            log_error "pnpm 安装失败"
            all_ok=false
        fi
    fi

    if [ "$all_ok" = false ]; then
        log_error "依赖检查失败，请安装缺失的依赖后重试"
        exit 1
    fi

    log_success "所有依赖检查通过"
    echo ""
}

# 创建配置文件
create_config_files() {
    print_banner "创建配置文件"

    # 创建后端 .env 文件
    if [ ! -f "platform/backend/.env.development" ]; then
        log_info "创建 platform/backend/.env.development"

        cat > platform/backend/.env.development << 'EOF'
# 服务器配置
PORT=3000
NODE_ENV=development

# 数据库配置
DB_HOST=postgres
DB_PORT=5432
DB_NAME=opclaw_dev
DB_USER=opclaw
DB_PASSWORD=dev_password

# Redis 配置
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=dev_password

# JWT 配置
JWT_SECRET=dev_jwt_secret_change_in_production
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# 飞书配置 (使用 Mock 服务)
FEISHU_APP_ID=mock_app_id
FEISHU_APP_SECRET=mock_app_secret
FEISHU_REDIRECT_URI=http://localhost:5173/oauth/callback
FEISHU_VERIFY_TOKEN=mock_verify_token
FEISHU_ENCRYPT_KEY=mock_encrypt_key

# DeepSeek API 配置 (请填写真实的 API Key)
DEEPSEEK_API_KEY=

# Docker 配置
DOCKER_SOCKET_PATH=/var/run/docker.sock
EOF

        log_success "✓ platform/backend/.env.development 创建成功"
    else
        log_warning "✗ platform/backend/.env.development 已存在，跳过"
    fi

    # 创建前端 .env 文件
    if [ ! -f "platform/frontend/.env.development" ]; then
        log_info "创建 platform/frontend/.env.development"

        cat > platform/frontend/.env.development << 'EOF'
# API 基础 URL
VITE_API_BASE_URL=http://localhost:3000
EOF

        log_success "✓ platform/frontend/.env.development 创建成功"
    else
        log_warning "✗ platform/frontend/.env.development 已存在，跳过"
    fi

    echo ""
}

# 检查环境变量
check_env_variables() {
    print_banner "检查环境变量"

    # 检查 DeepSeek API Key
    source platform/backend/.env.development
    if [ -z "$DEEPSEEK_API_KEY" ] || [ "$DEEPSEEK_API_KEY" = "" ]; then
        log_warning "DEEPSEEK_API_KEY 未配置"
        echo ""
        log_info "请获取 DeepSeek API Key:"
        echo "  1. 访问 https://platform.deepseek.com/"
        echo "  2. 注册/登录账号"
        echo "  3. 进入 API Keys 页面创建新的 Key"
        echo "  4. 将 Key 添加到 platform/backend/.env.development:"
        echo ""
        echo "     DEEPSEEK_API_KEY=your_actual_api_key_here"
        echo ""
        read -p "是否现在配置 DeepSeek API Key? (y/N) " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            read -p "请输入 DeepSeek API Key: " api_key
            if [ -n "$api_key" ]; then
                sed -i.bak "s/DEEPSEEK_API_KEY=/DEEPSEEK_API_KEY=$api_key/" platform/backend/.env.development
                log_success "DEEPSEEK_API_KEY 已配置"
            else
                log_warning "跳过 DEEPSEEK_API_KEY 配置 (后续可手动配置)"
            fi
        fi
    else
        log_success "DEEPSEEK_API_KEY 已配置"
    fi

    echo ""
}

# 启动 Docker 服务
start_docker_services() {
    print_banner "启动 Docker 服务"

    log_info "使用 docker-compose.dev.yml 启动服务..."

    # 构建并启动服务
    docker compose -f docker-compose.dev.yml up -d --build

    if [ $? -eq 0 ]; then
        log_success "Docker 服务启动成功"
    else
        log_error "Docker 服务启动失败"
        exit 1
    fi

    echo ""

    # 等待服务健康检查通过
    log_info "等待服务就绪..."
    sleep 15

    # 检查服务状态
    docker compose -f docker-compose.dev.yml ps

    echo ""
}

# 运行数据库迁移
run_database_migrations() {
    print_banner "运行数据库迁移"

    log_info "检查后端服务是否就绪..."

    # 等待后端服务启动
    local max_attempts=30
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        if curl -s http://localhost:3000/health > /dev/null 2>&1; then
            log_success "后端服务已就绪"
            break
        fi

        attempt=$((attempt + 1))
        echo -n "."
        sleep 2
    done

    echo ""

    if [ $attempt -eq $max_attempts ]; then
        log_error "后端服务启动超时"
        exit 1
    fi

    # 运行迁移
    log_info "运行数据库迁移..."

    docker compose -f docker-compose.dev.yml exec -T backend pnpm run db:migrate

    if [ $? -eq 0 ]; then
        log_success "数据库迁移完成"
    else
        log_warning "数据库迁移失败 (可能已运行过)"
    fi

    echo ""
}

# 显示访问信息
show_access_info() {
    print_banner "环境就绪"

    cat << EOF
${GREEN}✓ 本地开发环境已成功启动！${NC}

${BLUE}🌐 服务访问地址:${NC}
  • 前端应用:     http://localhost:5173
  • 后端 API:     http://localhost:3000
  • API 文档:     http://localhost:3000/api/docs
  • 健康检查:     http://localhost:3000/health

${BLUE}🔧 开发工具 (可选):${NC}
  • PgAdmin:      http://localhost:5050 (admin@example.com / admin)
  • Redis Cmd:    http://localhost:8081

${BLUE}👤 测试账号 (Mock):${NC}
  • 用户名:       开发测试用户
  • Email:        dev@example.com
  • User ID:      mock_user_123

${BLUE}📝 常用命令:${NC}
  • 查看日志:     docker compose -f docker-compose.dev.yml logs -f [service]
  • 重启服务:     docker compose -f docker-compose.dev.yml restart [service]
  • 停止服务:     docker compose -f docker-compose.dev.yml down
  • 删除数据:     docker compose -f docker-compose.dev.yml down -v

${BLUE}🐛 调试技巧:${NC}
  • 进入后端:     docker compose -f docker-compose.dev.yml exec backend sh
  • 进入数据库:   docker compose -f docker-compose.dev.yml exec postgres psql -U opclaw -d opclaw_dev
  • 查看 Redis:   docker compose -f docker-compose.dev.yml exec redis redis-cli -a dev_password

${YELLOW}⚠️  注意事项:${NC}
  • DeepSeek API Key 需要配置才能使用 LLM 功能
  • Mock 飞书服务仅用于开发，生产环境需使用真实飞书应用
  • 容器内可访问宿主机 Docker daemon (挂载了 /var/run/docker.sock)

EOF
}

# 主函数
main() {
    print_banner "AIOpc 本地开发环境设置"

    # 检查是否在项目根目录
    if [ ! -f "docker-compose.dev.yml" ]; then
        log_error "请在项目根目录运行此脚本"
        log_info "当前目录: $(pwd)"
        exit 1
    fi

    # 执行设置步骤
    check_dependencies
    create_config_files
    check_env_variables
    start_docker_services
    run_database_migrations
    show_access_info

    log_success "设置完成！开始开发吧 🚀"
}

# 捕获错误
trap 'log_error "设置失败，请检查错误信息"; exit 1' ERR

# 运行主函数
main "$@"
