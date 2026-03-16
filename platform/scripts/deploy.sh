#!/bin/bash
################################################################################
# AIOpc Platform - 部署脚本
# 用途: 部署 AIOpc 平台到生产环境
################################################################################

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

# 检查依赖
check_dependencies() {
    log_info "检查依赖项..."

    if ! command -v docker &> /dev/null; then
        log_error "Docker 未安装，请先安装 Docker"
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose 未安装，请先安装 Docker Compose"
        exit 1
    fi

    log_success "依赖检查通过"
}

# 检查环境配置
check_env_config() {
    log_info "检查环境配置..."

    if [ ! -f .env.production ]; then
        log_warning "未找到 .env.production 文件"
        log_info "从模板创建配置文件..."

        if [ -f .env.production.template ]; then
            cp .env.production.template .env.production
            log_info "已创建 .env.production 文件"
            log_warning "请编辑 .env.production 文件并填写正确的配置值"
            log_info "编辑后请重新运行此脚本"
            exit 0
        else
            log_error "未找到配置模板文件 .env.production.template"
            exit 1
        fi
    fi

    # 加载环境变量
    source .env.production

    # 检查必需的环境变量
    local required_vars=(
        "DB_PASSWORD"
        "REDIS_PASSWORD"
        "JWT_SECRET"
        "FEISHU_APP_ID"
        "FEISHU_APP_SECRET"
        "FEISHU_ENCRYPT_KEY"
        "DEEPSEEK_API_KEY"
    )

    local missing_vars=()

    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ] || [[ "${!var}" =~ ^your_.*_here$ ]]; then
            missing_vars+=("$var")
        fi
    done

    if [ ${#missing_vars[@]} -gt 0 ]; then
        log_error "以下环境变量未配置或使用了默认值："
        for var in "${missing_vars[@]}"; do
            echo "  - $var"
        done
        log_error "请编辑 .env.production 文件并填写正确的配置值"
        exit 1
    fi

    log_success "环境配置检查通过"
}

# 构建镜像
build_images() {
    log_info "构建 Docker 镜像..."

    docker-compose build --no-cache

    log_success "镜像构建完成"
}

# 启动服务
start_services() {
    log_info "启动服务..."

    # 创建必要的目录
    mkdir -p logs/backend logs/nginx

    # 启动服务
    docker-compose up -d

    log_success "服务启动完成"
}

# 等待服务健康检查
wait_for_healthy() {
    log_info "等待服务健康检查..."

    local max_attempts=60
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        local healthy=0
        local total=0

        # 检查 PostgreSQL
        if docker-compose ps | grep -q postgres.*Up.*healthy; then
            ((healthy++))
        fi
        ((total++))

        # 检查 Redis
        if docker-compose ps | grep -q redis.*Up.*healthy; then
            ((healthy++))
        fi
        ((total++))

        # 检查后端
        if docker-compose ps | grep -q backend.*Up.*healthy; then
            ((healthy++))
        fi
        ((total++))

        # 检查前端
        if docker-compose ps | grep -q frontend.*Up.*healthy; then
            ((healthy++))
        fi
        ((total++))

        if [ $healthy -eq $total ]; then
            log_success "所有服务健康检查通过"
            return 0
        fi

        ((attempt++))
        sleep 5
    done

    log_warning "部分服务健康检查超时，请手动检查服务状态"
    docker-compose ps
}

# 运行数据库迁移
run_migrations() {
    log_info "运行数据库迁移..."

    docker-compose exec -T backend pnpm run db:migrate

    log_success "数据库迁移完成"
}

# 显示服务状态
show_status() {
    log_info "服务状态："
    echo ""
    docker-compose ps
    echo ""

    log_info "访问地址："
    echo "  前端: http://localhost:${FRONTEND_PORT:-5173}"
    echo "  后端: http://localhost:${BACKEND_PORT:-3000}"
    echo "  后端健康检查: http://localhost:${BACKEND_PORT:-3000}/health"
    echo ""

    log_info "查看日志："
    echo "  所有服务: docker-compose logs -f"
    echo "  后端日志: docker-compose logs -f backend"
    echo "  前端日志: docker-compose logs -f frontend"
}

# 显示帮助信息
show_help() {
    echo "AIOpc Platform 部署脚本"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  -h, --help          显示此帮助信息"
    echo "  -c, --check         仅检查配置，不执行部署"
    echo "  -b, --build         构建镜像但不启动服务"
    echo "  -s, --start         仅启动服务（跳过构建）"
    echo "  -r, --restart       重启服务"
    echo "  -d, --down          停止并删除所有容器"
    echo "  -l, --logs           查看服务日志"
    echo "  --no-migrate        跳过数据库迁移"
    echo ""
    echo "示例:"
    echo "  $0                 # 完整部署流程"
    echo "  $0 -c              # 仅检查配置"
    echo "  $0 -b              # 仅构建镜像"
    echo "  $0 -s              # 仅启动服务"
    echo "  $0 -r              # 重启服务"
    echo "  $0 -d              # 停止服务"
    echo "  $0 -l              # 查看日志"
}

# 主函数
main() {
    local check_only=false
    local build_only=false
    local start_only=false
    local restart=false
    local down=false
    local show_logs=false
    local run_migration=true

    # 解析命令行参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -c|--check)
                check_only=true
                shift
                ;;
            -b|--build)
                build_only=true
                shift
                ;;
            -s|--start)
                start_only=true
                shift
                ;;
            -r|--restart)
                restart=true
                shift
                ;;
            -d|--down)
                down=true
                shift
                ;;
            -l|--logs)
                show_logs=true
                shift
                ;;
            --no-migrate)
                run_migration=false
                shift
                ;;
            *)
                log_error "未知选项: $1"
                show_help
                exit 1
                ;;
        esac
    done

    # 显示标题
    echo ""
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║         AIOpc Platform - 生产环境部署工具                 ║"
    echo "║         扫码即用 OpenClaw 云服务                          ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""

    # 检查依赖
    check_dependencies

    # 停止服务
    if [ "$down" = true ]; then
        log_info "停止服务..."
        docker-compose down
        log_success "服务已停止"
        exit 0
    fi

    # 查看日志
    if [ "$show_logs" = true ]; then
        docker-compose logs -f
        exit 0
    fi

    # 重启服务
    if [ "$restart" = true ]; then
        log_info "重启服务..."
        docker-compose restart
        wait_for_healthy
        show_status
        exit 0
    fi

    # 检查环境配置
    check_env_config

    # 仅检查配置
    if [ "$check_only" = true ]; then
        log_success "配置检查完成，配置有效"
        exit 0
    fi

    # 仅构建镜像
    if [ "$build_only" = true ]; then
        build_images
        log_success "镜像构建完成"
        exit 0
    fi

    # 仅启动服务
    if [ "$start_only" = true ]; then
        start_services
        wait_for_healthy
        if [ "$run_migration" = true ]; then
            run_migrations
        fi
        show_status
        exit 0
    fi

    # 完整部署流程
    log_info "开始部署流程..."

    build_images
    start_services
    wait_for_healthy

    if [ "$run_migration" = true ]; then
        run_migrations
    fi

    show_status

    log_success "部署完成！"
}

# 执行主函数
main "$@"
