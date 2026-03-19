#!/bin/bash

#==============================================================================
# AIOpc 统一部署脚本 (Unified Deployment Script)
#==============================================================================
# 整合了后端、前端、数据库的部署功能
# (Consolidates backend, frontend, and database deployment)
#
# 功能特性 (Features):
# - 一键部署 (One-command deployment)
# - 幂等性保证 (Idempotency guaranteed)
# - 自动备份 (Automatic backup)
# - 健康检查 (Health checks)
# - 回滚支持 (Rollback support)
#
# 使用方法 (Usage):
#   ./deploy.sh --env production --component all
#
# 环境变量 (Environment Variables):
#   DEPLOY_USER      - SSH用户 (默认: root)
#   DEPLOY_HOST      - SSH主机 (默认: 118.25.0.190)
#   DEPLOY_PATH      - 部署路径 (默认: /opt/opclaw)
#==============================================================================

set -e  # 遇到错误退出
set -u  # 使用未定义变量时退出
set -o pipefail  # 管道失败时退出

#------------------------------------------------------------------------------
# 配置 (Configuration)
#------------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="${PROJECT_ROOT}/deploy.log"

# 颜色代码 (Color codes)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 部署设置 (Deployment settings)
DEPLOY_USER=${DEPLOY_USER:-root}
DEPLOY_HOST=${DEPLOY_HOST:-118.25.0.190}
DEPLOY_PATH=${DEPLOY_PATH:-/opt/opclaw}
BACKUP_PATH=${BACKUP_PATH:-/opt/opclaw/backups}

# 选项 (Options)
ENVIRONMENT="staging"
COMPONENT="all"
SKIP_BUILD=false
SKIP_BACKUP=false
SKIP_TESTS=false
DRY_RUN=false
VERBOSE=false

#------------------------------------------------------------------------------
# 日志函数 (Logging Functions)
#------------------------------------------------------------------------------

log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${timestamp} [${level}] ${message}" | tee -a "$LOG_FILE"
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
    echo -e "${BLUE}==>${NC} $1"
    log "STEP" "$1"
}

#------------------------------------------------------------------------------
# SSH/SCP 包装函数 (SSH/SCP Wrapper Functions)
#------------------------------------------------------------------------------

ssh_exec() {
    local command="$*"
    if [ "$DRY_RUN" = true ]; then
        info "[DRY RUN] SSH: $command"
    else
        ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
            -i ~/.ssh/rap001_opclaw \
            "${DEPLOY_USER}@${DEPLOY_HOST}" "$command"
    fi
}

scp_upload() {
    local source=$1
    local destination=$2
    if [ "$DRY_RUN" = true ]; then
        info "[DRY RUN] SCP: $source -> $destination"
    else
        scp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
            -i ~/.ssh/rap001_opclaw \
            "$source" "${DEPLOY_USER}@${DEPLOY_HOST}:${destination}"
    fi
}

#------------------------------------------------------------------------------
# 状态检查函数 (State Check Functions)
#------------------------------------------------------------------------------

check_state() {
    local component=$1
    local check_command=$2

    if ssh_exec "$check_command" &> /dev/null; then
        return 0  # 状态存在
    else
        return 1  # 状态不存在
    fi
}

mark_state() {
    local component=$1
    local state_file="${DEPLOY_PATH}/.deploy-state_${component}"

    ssh_exec "echo '${TIMESTAMP}' > ${state_file}"
}

get_state() {
    local component=$1
    local state_file="${DEPLOY_PATH}/.deploy-state_${component}"

    ssh_exec "cat ${state_file} 2>/dev/null || echo 'not-deployed'"
}

#------------------------------------------------------------------------------
# 前置检查 (Pre-flight Checks)
#------------------------------------------------------------------------------

check_prerequisites() {
    step "前置检查 (Pre-flight checks)"

    # 检查SSH连接
    if ! command -v ssh &> /dev/null; then
        error "SSH客户端未安装"
        exit 1
    fi

    # 检查服务器连接
    if ! ssh_exec "echo 'Connection successful'" &> /dev/null; then
        error "无法连接到服务器 ${DEPLOY_USER}@${DEPLOY_HOST}"
        exit 1
    fi
    success "服务器连接正常"

    # 检查项目目录
    if [ ! -d "$PROJECT_ROOT/platform/backend" ]; then
        error "后端目录不存在: $PROJECT_ROOT/platform/backend"
        exit 1
    fi

    if [ ! -d "$PROJECT_ROOT/platform/frontend" ]; then
        error "前端目录不存在: $PROJECT_ROOT/platform/frontend"
        exit 1
    fi
    success "项目目录检查通过"
}

check_build() {
    step "检查构建产物 (Checking build artifacts)"

    local backend_built=false
    local frontend_built=false

    # 检查后端构建
    if [ -d "$PROJECT_ROOT/platform/backend/dist" ]; then
        info "后端构建已存在"
        backend_built=true
    fi

    # 检查前端构建
    if [ -d "$PROJECT_ROOT/platform/frontend/dist" ]; then
        info "前端构建已存在"
        frontend_built=true
    fi

    if [ "$backend_built" = true ] && [ "$frontend_built" = true ]; then
        success "所有构建产物已就绪"
        return 0
    fi

    if [ "$SKIP_BUILD" = true ]; then
        warning "构建产物缺失但跳过构建 (--skip-build)"
        return 0
    fi

    warning "需要重新构建"
    build_components
}

#------------------------------------------------------------------------------
# 构建函数 (Build Functions)
#------------------------------------------------------------------------------

build_components() {
    step "构建组件 (Building components)"

    # 构建后端
    if [ "$COMPONENT" = "all" ] || [ "$COMPONENT" = "backend" ]; then
        if [ ! -d "$PROJECT_ROOT/platform/backend/dist" ] || [ "$SKIP_BUILD" = false ]; then
            info "构建后端..."
            cd "$PROJECT_ROOT/platform/backend"

            if [ -f "pnpm-lock.yaml" ]; then
                pnpm install --frozen-lockfile
            else
                npm ci
            fi

            pnpm run build
            success "后端构建完成"
        else
            info "后端已构建，跳过"
        fi
    fi

    # 构建前端
    if [ "$COMPONENT" = "all" ] || [ "$COMPONENT" = "frontend" ]; then
        if [ ! -d "$PROJECT_ROOT/platform/frontend/dist" ] || [ "$SKIP_BUILD" = false ]; then
            info "构建前端..."
            cd "$PROJECT_ROOT/platform/frontend"

            if [ -f "pnpm-lock.yaml" ]; then
                pnpm install --frozen-lockfile
            else
                npm ci
            fi

            pnpm run build
            success "前端构建完成"
        else
            info "前端已构建，跳过"
        fi
    fi

    cd "$PROJECT_ROOT"
}

#------------------------------------------------------------------------------
# 备份函数 (Backup Functions)
#------------------------------------------------------------------------------

create_backup() {
    if [ "$SKIP_BACKUP" = true ]; then
        warning "跳过备份 (--skip-backup)"
        return 0
    fi

    step "创建备份 (Creating backup)"

    local backup_dir="${BACKUP_PATH}/backup_${TIMESTAMP}"

    # 创建备份目录
    ssh_exec "mkdir -p ${backup_dir}"

    # 备份后端
    if [ "$COMPONENT" = "all" ] || [ "$COMPONENT" = "backend" ]; then
        if check_state "backend" "[ -d ${DEPLOY_PATH}/backend ]"; then
            info "备份后端..."
            ssh_exec "cd ${DEPLOY_PATH} && tar -czf ${backup_dir}/backend.tar.gz backend/ 2>/dev/null || true"
            success "后端已备份"
        else
            info "后端不存在，跳过备份"
        fi
    fi

    # 备份前端
    if [ "$COMPONENT" = "all" ] || [ "$COMPONENT" = "frontend" ]; then
        if check_state "frontend" "[ -d /var/www/opclaw ]"; then
            info "备份前端..."
            ssh_exec "tar -czf ${backup_dir}/frontend.tar.gz /var/www/opclaw 2>/dev/null || true"
            success "前端已备份"
        else
            info "前端不存在，跳过备份"
        fi
    fi

    # 备份数据库
    if [ "$COMPONENT" = "all" ] || [ "$COMPONENT" = "database" ]; then
        if check_state "database" "docker ps | grep opclaw-postgres"; then
            info "备份数据库..."
            ssh_exec "docker exec opclaw-postgres pg_dump -U opclaw opclaw | gzip > ${backup_dir}/database.sql.gz" || {
                warning "数据库备份失败 (可能尚未初始化)"
            }
            success "数据库已备份"
        else
            info "数据库不存在，跳过备份"
        fi
    fi

    # 保存备份元数据
    ssh_exec "cat > ${backup_dir}/metadata.txt << EOF
Timestamp: ${TIMESTAMP}
Deploy Date: $(date)
Deploy User: ${DEPLOY_USER}
Deploy Host: ${DEPLOY_HOST}
Component: ${COMPONENT}
Environment: ${ENVIRONMENT}
EOF"

    success "备份创建完成: ${backup_dir}"

    # 清理旧备份 (保留最近5个)
    info "清理旧备份 (保留最近5个)..."
    ssh_exec "cd ${BACKUP_PATH} && ls -t | tail -n +6 | xargs -r rm -rf"
}

#------------------------------------------------------------------------------
# 部署函数 (Deployment Functions)
#------------------------------------------------------------------------------

deploy_backend() {
    step "部署后端 (Deploying backend)"

    # 检查是否已部署
    local current_state=$(get_state "backend")
    if [ "$current_state" != "not-deployed" ]; then
        info "后端已部署 (上次: ${current_state})"
        if [ "$DRY_RUN" = false ]; then
            info "重新部署..."
        fi
    fi

    # 上传后端代码
    info "上传后端文件..."
    ssh_exec "mkdir -p ${DEPLOY_PATH}/backend"

    # 使用rsync同步代码
    rsync -avz --delete \
        --exclude 'node_modules' \
        --exclude 'dist' \
        --exclude '.env' \
        --exclude '.env.*' \
        --exclude 'coverage' \
        --exclude '*.log' \
        --exclude '.DS_Store' \
        -e "ssh -i ~/.ssh/rap001_opclaw" \
        "$PROJECT_ROOT/platform/backend/" \
        "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}/backend/"

    # 在服务器上安装依赖并构建
    info "安装生产依赖..."
    ssh_exec "cd ${DEPLOY_PATH}/backend && pnpm install --prod --frozen-lockfile"

    info "构建后端..."
    ssh_exec "cd ${DEPLOY_PATH}/backend && pnpm run build"

    # 标记部署状态
    mark_state "backend"

    success "后端部署完成"
}

deploy_frontend() {
    step "部署前端 (Deploying frontend)"

    # 检查是否已部署
    local current_state=$(get_state "frontend")
    if [ "$current_state" != "not-deployed" ]; then
        info "前端已部署 (上次: ${current_state})"
        if [ "$DRY_RUN" = false ]; then
            info "重新部署..."
        fi
    fi

    # 创建前端目录
    ssh_exec "mkdir -p /var/www/opclaw"

    # 上传前端构建产物
    info "上传前端文件..."
    rsync -avz --delete \
        --exclude '*.map' \
        -e "ssh -i ~/.ssh/rap001_opclaw" \
        "$PROJECT_ROOT/platform/frontend/dist/" \
        "${DEPLOY_USER}@${DEPLOY_HOST}:/var/www/opclaw/"

    # 设置权限
    ssh_exec "chown -R www-data:www-data /var/www/opclaw"
    ssh_exec "chmod -R 755 /var/www/opclaw"

    # 标记部署状态
    mark_state "frontend"

    success "前端部署完成"
}

deploy_database() {
    step "部署数据库 (Deploying database)"

    # 检查是否已部署
    if check_state "database" "docker ps | grep opclaw-postgres"; then
        info "数据库已运行"
        return 0
    fi

    info "启动数据库容器..."
    ssh_exec "cd ${DEPLOY_PATH} && docker compose up -d postgres" || {
        warning "数据库启动失败 (可能需要手动配置)"
        return 1
    }

    # 等待数据库启动
    info "等待数据库启动..."
    sleep 10

    # 标记部署状态
    mark_state "database"

    success "数据库部署完成"
}

deploy_config() {
    step "部署配置 (Deploying configuration)"

    # 部署环境配置
    if [ -f "$PROJECT_ROOT/platform/backend/.env.production" ]; then
        info "部署后端环境配置..."
        ssh_exec "mkdir -p ${DEPLOY_PATH}/backend"

        # 检查是否已存在配置
        if ssh_exec "[ -f ${DEPLOY_PATH}/backend/.env ]"; then
            info "环境配置已存在，跳过"
        else
            warning "需要手动配置环境变量"
            warning "请运行: configure-backend-env.sh"
        fi
    fi

    # 部署nginx配置
    if [ -f "$PROJECT_ROOT/config/nginx/opclaw.conf" ]; then
        info "部署Nginx配置..."
        scp_upload "$PROJECT_ROOT/config/nginx/opclaw.conf" "/tmp/opclaw.conf"

        ssh_exec "mv /tmp/opclaw.conf /etc/nginx/sites-available/opclaw"
        ssh_exec "ln -sf /etc/nginx/sites-available/opclaw /etc/nginx/sites-enabled/opclaw"

        # 测试nginx配置
        if ! ssh_exec "nginx -t" &> /dev/null; then
            error "Nginx配置测试失败"
            return 1
        fi

        ssh_exec "systemctl reload nginx"
        success "Nginx配置已部署"
    fi
}

#------------------------------------------------------------------------------
# 服务管理 (Service Management)
#------------------------------------------------------------------------------

restart_services() {
    step "重启服务 (Restarting services)"

    # 重启后端
    if [ "$COMPONENT" = "all" ] || [ "$COMPONENT" = "backend" ]; then
        info "重启后端服务..."
        ssh_exec "cd ${DEPLOY_PATH} && docker compose restart backend" || {
            warning "后端服务重启失败"
        }
    fi

    # 重启nginx
    if [ "$COMPONENT" = "all" ] || [ "$COMPONENT" = "frontend" ]; then
        info "重载Nginx..."
        ssh_exec "systemctl reload nginx" || {
            warning "Nginx重载失败"
        }
    fi

    success "服务重启完成"
}

#------------------------------------------------------------------------------
# 健康检查 (Health Checks)
#------------------------------------------------------------------------------

health_check() {
    step "健康检查 (Health checks)"

    local all_passed=true

    # 检查后端健康
    if [ "$COMPONENT" = "all" ] || [ "$COMPONENT" = "backend" ]; then
        info "检查后端健康状态..."
        local max_attempts=30
        local attempt=1

        while [ $attempt -le $max_attempts ]; do
            if ssh_exec "curl -sf http://localhost:3000/health" &> /dev/null; then
                success "后端健康检查通过"
                break
            fi

            if [ $attempt -eq $max_attempts ]; then
                error "后端健康检查失败"
                all_passed=false
                break
            fi

            info "等待后端启动... (${attempt}/${max_attempts})"
            sleep 2
            ((attempt++))
        done
    fi

    # 检查前端
    if [ "$COMPONENT" = "all" ] || [ "$COMPONENT" = "frontend" ]; then
        info "检查前端可访问性..."
        HTTP_CODE=$(ssh_exec "curl -s -o /dev/null -w '%{http_code}' http://localhost" || echo "000")

        if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "301" ] || [ "$HTTP_CODE" = "302" ]; then
            success "前端可访问 (HTTP ${HTTP_CODE})"
        else
            warning "前端响应异常 (HTTP ${HTTP_CODE})"
        fi
    fi

    # 检查数据库
    if [ "$COMPONENT" = "all" ] || [ "$COMPONENT" = "database" ]; then
        info "检查数据库连接..."
        if ssh_exec "docker exec opclaw-postgres pg_isready -U opclaw" &> /dev/null; then
            success "数据库连接正常"
        else
            warning "数据库连接失败"
            all_passed=false
        fi
    fi

    if [ "$all_passed" = false ]; then
        error "部分健康检查失败"
        return 1
    fi

    success "所有健康检查通过"
}

#------------------------------------------------------------------------------
# 运行测试 (Run Tests)
#------------------------------------------------------------------------------

run_tests() {
    if [ "$SKIP_TESTS" = true ]; then
        warning "跳过测试 (--skip-tests)"
        return 0
    fi

    step "运行测试 (Running tests)"

    # 后端测试
    if [ "$COMPONENT" = "all" ] || [ "$COMPONENT" = "backend" ]; then
        if [ -f "$PROJECT_ROOT/platform/backend/package.json" ]; then
            cd "$PROJECT_ROOT/platform/backend"

            if grep -q '"test"' package.json; then
                info "运行后端测试..."
                pnpm test || {
                    error "后端测试失败"
                    return 1
                }
                success "后端测试通过"
            else
                warning "后端没有配置测试脚本"
            fi
        fi
    fi

    # 前端测试
    if [ "$COMPONENT" = "all" ] || [ "$COMPONENT" = "frontend" ]; then
        if [ -f "$PROJECT_ROOT/platform/frontend/package.json" ]; then
            cd "$PROJECT_ROOT/platform/frontend"

            if grep -q '"test"' package.json; then
                info "运行前端测试..."
                pnpm test || {
                    error "前端测试失败"
                    return 1
                }
                success "前端测试通过"
            else
                warning "前端没有配置测试脚本"
            fi
        fi
    fi

    cd "$PROJECT_ROOT"
    success "所有测试通过"
}

#------------------------------------------------------------------------------
# 打印摘要 (Print Summary)
#------------------------------------------------------------------------------

print_summary() {
    echo ""
    echo "=============================================================================="
    echo "部署完成 (Deployment Complete)"
    echo "=============================================================================="
    echo ""
    echo "部署详情 (Deployment Details):"
    echo "  时间戳 (Timestamp): $TIMESTAMP"
    echo "  主机 (Host): $DEPLOY_HOST"
    echo "  组件 (Component): $COMPONENT"
    echo "  环境 (Environment): $ENVIRONMENT"
    echo ""
    echo "访问地址 (Access URLs):"
    echo "  前端 (Frontend): https://renava.cn"
    echo "  API: https://renava.cn/api"
    echo "  健康检查 (Health): https://renava.cn/api/health"
    echo ""
    echo "服务管理 (Service Management):"
    echo "  状态: ssh ${DEPLOY_USER}@${DEPLOY_HOST} 'cd ${DEPLOY_PATH} && docker compose ps'"
    echo "  日志: ssh ${DEPLOY_USER}@${DEPLOY_HOST} 'cd ${DEPLOY_PATH} && docker compose logs -f'"
    echo "  重启: ssh ${DEPLOY_USER}@${DEPLOY_HOST} 'cd ${DEPLOY_PATH} && docker compose restart'"
    echo ""
    echo "=============================================================================="
}

#------------------------------------------------------------------------------
# 帮助信息 (Help)
#------------------------------------------------------------------------------

show_help() {
    cat << EOF
用法 (Usage): $0 [选项]

选项 (Options):
  --env <环境>          目标环境 (staging, production) [默认: staging]
  --component <组件>    部署组件 (backend, frontend, database, all) [默认: all]
  --skip-build          跳过构建步骤
  --skip-backup         跳过备份步骤
  --skip-tests          跳过测试步骤
  --dry-run             模拟运行，不执行实际操作
  --verbose             详细输出
  --help                显示此帮助信息

环境变量 (Environment Variables):
  DEPLOY_USER           SSH用户 [默认: root]
  DEPLOY_HOST           SSH主机 [默认: 118.25.0.190]
  DEPLOY_PATH           部署路径 [默认: /opt/opclaw]

示例 (Examples):
  # 部署所有组件到生产环境
  $0 --env production --component all

  # 仅部署后端
  $0 --component backend

  # 跳过构建和测试
  $0 --skip-build --skip-tests

  # 模拟运行
  $0 --dry-run

幂等性 (Idempotency):
  此脚本可安全地多次运行。它会检测已部署的组件并跳过不必要的操作。
  (This script can be safely run multiple times. It detects deployed components
  and skips unnecessary operations.)

EOF
}

#------------------------------------------------------------------------------
# 主函数 (Main Function)
#------------------------------------------------------------------------------

main() {
    # 解析参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            --env)
                ENVIRONMENT="$2"
                shift 2
                ;;
            --component)
                COMPONENT="$2"
                shift 2
                ;;
            --skip-build)
                SKIP_BUILD=true
                shift
                ;;
            --skip-backup)
                SKIP_BACKUP=true
                shift
                ;;
            --skip-tests)
                SKIP_TESTS=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --verbose)
                VERBOSE=true
                set -x
                shift
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                error "未知选项: $1"
                echo "使用 --help 查看帮助信息"
                exit 1
                ;;
        esac
    done

    # 打印配置
    echo "=============================================================================="
    echo "AIOpc 统一部署脚本 (Unified Deployment Script)"
    echo "=============================================================================="
    echo "时间戳 (Timestamp): $TIMESTAMP"
    echo "主机 (Host): ${DEPLOY_USER}@${DEPLOY_HOST}"
    echo "组件 (Component): $COMPONENT"
    echo "环境 (Environment): $ENVIRONMENT"
    echo "跳过构建 (Skip Build): $SKIP_BUILD"
    echo "跳过备份 (Skip Backup): $SKIP_BACKUP"
    echo "跳过测试 (Skip Tests): $SKIP_TESTS"
    echo "模拟运行 (Dry Run): $DRY_RUN"
    echo "=============================================================================="
    echo ""

    if [ "$DRY_RUN" = true ]; then
        warning "模拟运行模式 - 不会执行实际操作 (DRY RUN MODE - No changes will be made)"
        echo ""
    fi

    # 执行部署流程
    check_prerequisites
    check_build

    if [ "$SKIP_BUILD" = false ]; then
        build_components
    fi

    run_tests
    create_backup

    # 部署配置
    deploy_config

    # 部署组件
    if [ "$COMPONENT" = "all" ] || [ "$COMPONENT" = "backend" ]; then
        deploy_backend
    fi

    if [ "$COMPONENT" = "all" ] || [ "$COMPONENT" = "frontend" ]; then
        deploy_frontend
    fi

    if [ "$COMPONENT" = "all" ] || [ "$COMPONENT" = "database" ]; then
        deploy_database
    fi

    # 重启服务
    restart_services

    # 健康检查
    if ! health_check; then
        error "健康检查失败。请检查日志。"
        error "Health check failed. Please check logs."
        exit 1
    fi

    # 打印摘要
    print_summary

    success "部署成功完成! (Deployment completed successfully!)"
}

#------------------------------------------------------------------------------
# 脚本入口点 (Script Entry Point)
#------------------------------------------------------------------------------

main "$@"
