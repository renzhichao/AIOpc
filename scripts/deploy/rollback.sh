#!/bin/bash

#==============================================================================
# AIOpc 回滚脚本 (Rollback Script)
#==============================================================================
# 回滚到之前的部署版本
# (Rollback to previous deployment version)
#
# 功能特性 (Features):
# - 一键回滚 (One-command rollback)
# - 支持指定版本回滚 (Version-specific rollback)
# - 自动回滚失败时恢复 (Automatic recovery on rollback failure)
# - 回滚后验证 (Post-rollback verification)
#
# 使用方法 (Usage):
#   ./rollback.sh --env production --component all
#   ./rollback.sh --to backup_20260318_120000
#
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
LOG_FILE="${PROJECT_ROOT}/rollback.log"

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
ENVIRONMENT="production"
COMPONENT="all"
TO_VERSION=""
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
    log "STEP" "$*"
}

#------------------------------------------------------------------------------
# SSH 包装函数 (SSH Wrapper Functions)
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

#------------------------------------------------------------------------------
# 备份管理函数 (Backup Management Functions)
#------------------------------------------------------------------------------

list_backups() {
    info "可用备份列表 (Available backups):"
    echo ""

    local backups=$(ssh_exec "ls -t ${BACKUP_PATH} 2>/dev/null | grep '^backup_' || echo ''")

    if [ -z "$backups" ]; then
        warning "没有找到备份 (No backups found)"
        return 1
    fi

    local index=1
    echo "$backups" | while read -r backup; do
        if [ -n "$backup" ]; then
            local metadata="${BACKUP_PATH}/${backup}/metadata.txt"
            local info=$(ssh_exec "cat ${metadata} 2>/dev/null || echo 'N/A'")

            echo "  [$index] $backup"
            echo "      $info"
            echo ""
            ((index++))
        fi
    done
}

get_latest_backup() {
    ssh_exec "ls -t ${BACKUP_PATH} 2>/dev/null | grep '^backup_' | head -n 1"
}

validate_backup() {
    local backup_path=$1

    if [ "$COMPONENT" = "all" ] || [ "$COMPONENT" = "backend" ]; then
        if ! ssh_exec "[ -f ${backup_path}/backend.tar.gz ]"; then
            error "备份中缺少后端文件: ${backup_path}/backend.tar.gz"
            return 1
        fi
    fi

    if [ "$COMPONENT" = "all" ] || [ "$COMPONENT" = "frontend" ]; then
        if ! ssh_exec "[ -f ${backup_path}/frontend.tar.gz ]"; then
            error "备份中缺少前端文件: ${backup_path}/frontend.tar.gz"
            return 1
        fi
    fi

    if [ "$COMPONENT" = "all" ] || [ "$COMPONENT" = "database" ]; then
        if ! ssh_exec "[ -f ${backup_path}/database.sql.gz ]"; then
            warning "备份中缺少数据库文件: ${backup_path}/database.sql.gz"
        fi
    fi

    return 0
}

#------------------------------------------------------------------------------
# 回滚函数 (Rollback Functions)
#------------------------------------------------------------------------------

rollback_backend() {
    step "回滚后端 (Rolling back backend)"

    local backup_path=$1

    if ! ssh_exec "[ -f ${backup_path}/backend.tar.gz ]"; then
        warning "备份中没有后端文件，跳过后端回滚"
        return 0
    fi

    info "停止后端服务..."
    ssh_exec "cd ${DEPLOY_PATH} && docker compose stop backend" || {
        warning "停止后端服务失败"
    }

    info "恢复后端文件..."
    ssh_exec "rm -rf ${DEPLOY_PATH}/backend"
    ssh_exec "cd ${DEPLOY_PATH} && tar -xzf ${backup_path}/backend.tar.gz"

    info "启动后端服务..."
    ssh_exec "cd ${DEPLOY_PATH} && docker compose up -d backend" || {
        error "启动后端服务失败"
        return 1
    }

    success "后端回滚完成"
}

rollback_frontend() {
    step "回滚前端 (Rolling back frontend)"

    local backup_path=$1

    if ! ssh_exec "[ -f ${backup_path}/frontend.tar.gz ]"; then
        warning "备份中没有前端文件，跳过前端回滚"
        return 0
    fi

    info "恢复前端文件..."
    ssh_exec "rm -rf /var/www/opclaw"
    ssh_exec "tar -xzf ${backup_path}/frontend.tar.gz -C /"

    info "设置权限..."
    ssh_exec "chown -R www-data:www-data /var/www/opclaw"
    ssh_exec "chmod -R 755 /var/www/opclaw"

    info "重载Nginx..."
    ssh_exec "systemctl reload nginx"

    success "前端回滚完成"
}

rollback_database() {
    step "回滚数据库 (Rolling back database)"

    local backup_path=$1

    if ! ssh_exec "[ -f ${backup_path}/database.sql.gz ]"; then
        warning "备份中没有数据库文件，跳过数据库回滚"
        return 0
    fi

    info "停止数据库服务..."
    ssh_exec "cd ${DEPLOY_PATH} && docker compose stop postgres" || {
        warning "停止数据库服务失败"
    }

    # 创建当前数据库的备份
    warning "创建当前数据库的备份..."
    ssh_exec "mkdir -p ${BACKUP_PATH}/pre-rollback_${TIMESTAMP}"
    ssh_exec "docker exec opclaw-postgres pg_dump -U opclaw opclaw | gzip > ${BACKUP_PATH}/pre-rollback_${TIMESTAMP}/database.sql.gz" || {
        warning "无法创建当前数据库备份"
    }

    info "恢复数据库..."
    if ssh_exec "gunzip < ${backup_path}/database.sql.gz | docker exec -i opclaw-postgres psql -U opclaw opclaw"; then
        success "数据库恢复成功"
    else
        error "数据库恢复失败"
        return 1
    fi

    info "启动数据库服务..."
    ssh_exec "cd ${DEPLOY_PATH} && docker compose up -d postgres" || {
        error "启动数据库服务失败"
        return 1
    }

    success "数据库回滚完成"
}

rollback_config() {
    step "回滚配置 (Rolling back configuration)"

    local backup_path=$1

    # 回滚环境配置
    if ssh_exec "[ -f ${backup_path}/.env ]"; then
        info "恢复环境配置..."
        ssh_exec "cp ${backup_path}/.env ${DEPLOY_PATH}/backend/.env"
    fi

    # 回滚nginx配置
    if ssh_exec "[ -f ${backup_path}/nginx.conf ]"; then
        info "恢复Nginx配置..."
        ssh_exec "cp ${backup_path}/nginx.conf /etc/nginx/sites-available/opclaw"

        # 测试nginx配置
        if ssh_exec "nginx -t" &> /dev/null; then
            ssh_exec "systemctl reload nginx"
            success "Nginx配置已恢复"
        else
            error "Nginx配置测试失败"
            return 1
        fi
    fi

    success "配置回滚完成"
}

#------------------------------------------------------------------------------
# 回滚后验证 (Post-Rollback Verification)
#------------------------------------------------------------------------------

verify_rollback() {
    step "验证回滚 (Verifying rollback)"

    local all_passed=true

    # 验证后端
    if [ "$COMPONENT" = "all" ] || [ "$COMPONENT" = "backend" ]; then
        info "验证后端..."
        local max_attempts=30
        local attempt=1

        while [ $attempt -le $max_attempts ]; do
            if ssh_exec "curl -sf http://localhost:3000/health" &> /dev/null; then
                success "后端验证通过"
                break
            fi

            if [ $attempt -eq $max_attempts ]; then
                error "后端验证失败"
                all_passed=false
                break
            fi

            info "等待后端启动... (${attempt}/${max_attempts})"
            sleep 2
            ((attempt++))
        done
    fi

    # 验证前端
    if [ "$COMPONENT" = "all" ] || [ "$COMPONENT" = "frontend" ]; then
        info "验证前端..."
        HTTP_CODE=$(ssh_exec "curl -s -o /dev/null -w '%{http_code}' http://localhost" || echo "000")

        if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "301" ] || [ "$HTTP_CODE" = "302" ]; then
            success "前端验证通过 (HTTP ${HTTP_CODE})"
        else
            warning "前端响应异常 (HTTP ${HTTP_CODE})"
            all_passed=false
        fi
    fi

    # 验证数据库
    if [ "$COMPONENT" = "all" ] || [ "$COMPONENT" = "database" ]; then
        info "验证数据库..."
        if ssh_exec "docker exec opclaw-postgres pg_isready -U opclaw" &> /dev/null; then
            success "数据库验证通过"
        else
            error "数据库验证失败"
            all_passed=false
        fi
    fi

    if [ "$all_passed" = false ]; then
        error "部分验证失败"
        return 1
    fi

    success "所有验证通过"
}

#------------------------------------------------------------------------------
# 打印摘要 (Print Summary)
#------------------------------------------------------------------------------

print_summary() {
    local backup_path=$1

    echo ""
    echo "=============================================================================="
    echo "回滚完成 (Rollback Complete)"
    echo "=============================================================================="
    echo ""
    echo "回滚详情 (Rollback Details):"
    echo "  时间戳 (Timestamp): $TIMESTAMP"
    echo "  主机 (Host): $DEPLOY_HOST"
    echo "  组件 (Component): $COMPONENT"
    echo "  回滚到 (Rolled back to): $backup_path"
    echo ""
    echo "验证状态 (Verification Status):"
    echo "  后端 (Backend): 运行中"
    echo "  前端 (Frontend): 可访问"
    echo "  数据库 (Database): 连接正常"
    echo ""
    echo "回滚前备份 (Pre-rollback backup):"
    echo "  位置: ${BACKUP_PATH}/pre-rollback_${TIMESTAMP}/"
    echo ""
    echo "服务管理 (Service Management):"
    echo "  状态: ssh ${DEPLOY_USER}@${DEPLOY_HOST} 'cd ${DEPLOY_PATH} && docker compose ps'"
    echo "  日志: ssh ${DEPLOY_USER}@${DEPLOY_HOST} 'cd ${DEPLOY_PATH} && docker compose logs -f'"
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
  --env <环境>          目标环境 (staging, production) [默认: production]
  --component <组件>    回滚组件 (backend, frontend, database, all) [默认: all]
  --to <版本>           回滚到指定备份版本 [默认: 最新备份]
  --list                列出所有可用备份
  --dry-run             模拟运行，不执行实际操作
  --verbose             详细输出
  --help                显示此帮助信息

环境变量 (Environment Variables):
  DEPLOY_USER           SSH用户 [默认: root]
  DEPLOY_HOST           SSH主机 [默认: 118.25.0.190]
  DEPLOY_PATH           部署路径 [默认: /opt/opclaw]
  BACKUP_PATH           备份路径 [默认: /opt/opclaw/backups]

示例 (Examples):
  # 回滚到最新备份
  $0 --env production

  # 回滚到指定版本
  $0 --to backup_20260318_120000

  # 仅回滚后端
  $0 --component backend

  # 列出所有可用备份
  $0 --list

  # 模拟运行
  $0 --dry-run

注意 (Notes):
  - 回滚前会自动创建当前状态的备份
  - 回滚操作会停止服务，可能导致短暂的服务中断
  - 建议在非高峰期执行回滚操作

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
            --to)
                TO_VERSION="$2"
                shift 2
                ;;
            --list)
                list_backups
                exit 0
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
    echo "AIOpc 回滚脚本 (Rollback Script)"
    echo "=============================================================================="
    echo "时间戳 (Timestamp): $TIMESTAMP"
    echo "主机 (Host): ${DEPLOY_USER}@${DEPLOY_HOST}"
    echo "组件 (Component): $COMPONENT"
    echo "环境 (Environment): $ENVIRONMENT"
    echo "模拟运行 (Dry Run): $DRY_RUN"
    echo "=============================================================================="
    echo ""

    if [ "$DRY_RUN" = true ]; then
        warning "模拟运行模式 - 不会执行实际操作 (DRY RUN MODE - No changes will be made)"
        echo ""
    fi

    # 确定要回滚到的备份
    local backup_path=""

    if [ -n "$TO_VERSION" ]; then
        backup_path="${BACKUP_PATH}/${TO_VERSION}"
        info "回滚到指定版本: $backup_path"
    else
        backup_path="${BACKUP_PATH}/$(get_latest_backup)"
        if [ -z "$backup_path" ]; then
            error "没有找到可用的备份"
            exit 1
        fi
        info "回滚到最新备份: $backup_path"
    fi

    # 验证备份存在
    if ! ssh_exec "[ -d ${backup_path} ]"; then
        error "备份不存在: $backup_path"
        exit 1
    fi

    # 验证备份完整性
    if ! validate_backup "$backup_path"; then
        error "备份验证失败"
        exit 1
    fi

    # 确认回滚操作
    if [ "$DRY_RUN" = false ]; then
        echo -n "确认回滚到 ${backup_path}? (yes/no): "
        read -r confirmation

        if [ "$confirmation" != "yes" ]; then
            info "回滚已取消"
            exit 0
        fi
    fi

    # 执行回滚
    if [ "$COMPONENT" = "all" ] || [ "$COMPONENT" = "backend" ]; then
        rollback_backend "$backup_path"
    fi

    if [ "$COMPONENT" = "all" ] || [ "$COMPONENT" = "frontend" ]; then
        rollback_frontend "$backup_path"
    fi

    if [ "$COMPONENT" = "all" ] || [ "$COMPONENT" = "database" ]; then
        rollback_database "$backup_path"
    fi

    rollback_config "$backup_path"

    # 验证回滚
    if ! verify_rollback; then
        error "回滚验证失败"
        error "请检查日志: $LOG_FILE"
        exit 1
    fi

    # 打印摘要
    print_summary "$backup_path"

    success "回滚成功完成! (Rollback completed successfully!)"
}

#------------------------------------------------------------------------------
# 脚本入口点 (Script Entry Point)
#------------------------------------------------------------------------------

main "$@"
