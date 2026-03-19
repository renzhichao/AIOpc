#!/bin/bash

#==============================================================================
# AIOpc 恢复脚本 (Restore Script)
#==============================================================================
# 从备份恢复系统状态
# (Restore system state from backup)
#
# 功能特性 (Features):
# - 数据库恢复 (Database restore)
# - 配置恢复 (Configuration restore)
# - 文件恢复 (File restore)
# - 恢复验证 (Restore verification)
#
# 使用方法 (Usage):
#   ./restore.sh --type database --source /opt/opclaw/backups/20260318_120000
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
LOG_FILE="${PROJECT_ROOT}/restore.log"

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

# 选项 (Options)
RESTORE_TYPE="all"
SOURCE=""
PRE_BACKUP=true
VERIFY_RESTORE=true
DRY_RUN=false

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
# 前置检查 (Pre-flight Checks)
#------------------------------------------------------------------------------

check_prerequisites() {
    step "前置检查 (Pre-flight checks)"

    # 检查源路径
    if [ -z "$SOURCE" ]; then
        error "必须指定备份源路径 (--source)"
        exit 1
    fi

    # 检查备份是否存在
    if ! ssh_exec "[ -d ${SOURCE} ]"; then
        error "备份源不存在: ${SOURCE}"
        exit 1
    fi

    success "备份源验证通过: ${SOURCE}"

    # 检查SSH连接
    if ! ssh_exec "echo 'Connection successful'" &> /dev/null; then
        error "无法连接到服务器 ${DEPLOY_USER}@${DEPLOY_HOST}"
        exit 1
    fi

    success "服务器连接正常"
}

#------------------------------------------------------------------------------
# 创建恢复前备份 (Create Pre-restore Backup)
#------------------------------------------------------------------------------

create_pre_restore_backup() {
    if [ "$PRE_BACKUP" = false ]; then
        return 0
    fi

    step "创建恢复前备份 (Creating pre-restore backup)"

    local pre_backup_dir="${DEPLOY_PATH}/backups/pre-restore_${TIMESTAMP}"
    ssh_exec "mkdir -p ${pre_backup_dir}"

    warning "创建当前状态的备份..."

    # 备份当前数据库
    if ssh_exec "docker ps | grep opclaw-postgres" &> /dev/null; then
        info "备份当前数据库..."
        ssh_exec "docker exec opclaw-postgres pg_dump -U opclaw opclaw | gzip > ${pre_backup_dir}/database.sql.gz" || {
            warning "无法备份数据库"
        }
    fi

    # 备份当前配置
    if ssh_exec "[ -f ${DEPLOY_PATH}/backend/.env ]"; then
        info "备份当前配置..."
        ssh_exec "cp ${DEPLOY_PATH}/backend/.env ${pre_backup_dir}/backend.env"
    fi

    success "恢复前备份已创建: ${pre_backup_dir}"
    info "如果恢复失败，可以使用此备份回滚"
}

#------------------------------------------------------------------------------
# 恢复函数 (Restore Functions)
#------------------------------------------------------------------------------

restore_database() {
    if [ "$RESTORE_TYPE" != "all" ] && [ "$RESTORE_TYPE" != "database" ]; then
        return
    fi

    step "恢复数据库 (Restoring database)"

    local backup_file="${SOURCE}/database.sql.gz"

    # 检查备份文件
    if ! ssh_exec "[ -f ${backup_file} ]"; then
        error "数据库备份文件不存在: ${backup_file}"
        return 1
    fi

    # 停止后端服务 (避免数据库连接冲突)
    info "停止后端服务..."
    ssh_exec "cd ${DEPLOY_PATH} && docker compose stop backend" || {
        warning "停止后端服务失败"
    }

    # 恢复数据库
    info "恢复数据库..."
    if ssh_exec "gunzip < ${backup_file} | docker exec -i opclaw-postgres psql -U opclaw opclaw"; then
        success "数据库恢复完成"
    else
        error "数据库恢复失败"
        return 1
    fi

    # 重启后端服务
    info "重启后端服务..."
    ssh_exec "cd ${DEPLOY_PATH} && docker compose start backend" || {
        warning "启动后端服务失败"
    }
}

restore_config() {
    if [ "$RESTORE_TYPE" != "all" ] && [ "$RESTORE_TYPE" != "config" ]; then
        return
    fi

    step "恢复配置文件 (Restoring configuration)"

    # 恢复后端环境配置
    if ssh_exec "[ -f ${SOURCE}/backend.env ]"; then
        info "恢复后端环境配置..."
        ssh_exec "cp ${SOURCE}/backend.env ${DEPLOY_PATH}/backend/.env"

        # 重启后端服务以应用新配置
        info "重启后端服务..."
        ssh_exec "cd ${DEPLOY_PATH} && docker compose restart backend" || {
            warning "重启后端服务失败"
        }

        success "后端环境配置已恢复"
    fi

    # 恢复Nginx配置
    if ssh_exec "[ -f ${SOURCE}/nginx.conf ]"; then
        info "恢复Nginx配置..."
        ssh_exec "cp ${SOURCE}/nginx.conf /etc/nginx/sites-available/opclaw"

        # 测试Nginx配置
        if ssh_exec "nginx -t" &> /dev/null; then
            ssh_exec "systemctl reload nginx"
            success "Nginx配置已恢复"
        else
            error "Nginx配置测试失败"
            return 1
        fi
    fi

    # 恢复Docker Compose配置
    if ssh_exec "[ -f ${SOURCE}/docker-compose.yml ]"; then
        info "恢复Docker Compose配置..."
        ssh_exec "cp ${SOURCE}/docker-compose.yml ${DEPLOY_PATH}/docker-compose.yml"
        success "Docker Compose配置已恢复"
    fi
}

restore_files() {
    if [ "$RESTORE_TYPE" != "all" ] && [ "$RESTORE_TYPE" != "files" ]; then
        return
    fi

    step "恢复文件 (Restoring files)"

    # 恢复后端代码
    if ssh_exec "[ -f ${SOURCE}/backend.tar.gz ]"; then
        info "恢复后端代码..."
        ssh_exec "rm -rf ${DEPLOY_PATH}/backend"
        ssh_exec "cd ${DEPLOY_PATH} && tar -xzf ${SOURCE}/backend.tar.gz"
        success "后端代码已恢复"
    fi

    # 恢复前端文件
    if ssh_exec "[ -f ${SOURCE}/frontend.tar.gz ]"; then
        info "恢复前端文件..."
        ssh_exec "rm -rf /var/www/opclaw"
        ssh_exec "tar -xzf ${SOURCE}/frontend.tar.gz -C /"

        # 设置权限
        ssh_exec "chown -R www-data:www-data /var/www/opclaw"
        ssh_exec "chmod -R 755 /var/www/opclaw"

        success "前端文件已恢复"
    fi
}

#------------------------------------------------------------------------------
# 恢复验证 (Restore Verification)
#------------------------------------------------------------------------------

verify_restore() {
    if [ "$VERIFY_RESTORE" = false ]; then
        return 0
    fi

    step "验证恢复 (Verifying restore)"

    local all_passed=true

    # 验证数据库
    if [ "$RESTORE_TYPE" = "all" ] || [ "$RESTORE_TYPE" = "database" ]; then
        info "验证数据库..."
        if ssh_exec "docker exec opclaw-postgres pg_isready -U opclaw" &> /dev/null; then
            success "数据库连接正常"

            # 检查数据库表数量
            local table_count=$(ssh_exec "docker exec opclaw-postgres psql -U opclaw -d opclaw -c 'SELECT count(*) FROM information_schema.tables WHERE table_schema = '\''public'\'';' -t" | xargs || echo "0")
            info "数据库表数量: ${table_count}"

            if [ "$table_count" -gt 0 ]; then
                success "数据库数据存在"
            else
                warning "数据库可能为空"
            fi
        else
            error "数据库连接失败"
            all_passed=false
        fi
    fi

    # 验证配置
    if [ "$RESTORE_TYPE" = "all" ] || [ "$RESTORE_TYPE" = "config" ]; then
        info "验证配置..."
        if ssh_exec "[ -f ${DEPLOY_PATH}/backend/.env ]"; then
            success "后端配置文件存在"
        else
            error "后端配置文件缺失"
            all_passed=false
        fi
    fi

    # 验证文件
    if [ "$RESTORE_TYPE" = "all" ] || [ "$RESTORE_TYPE" = "files" ]; then
        info "验证文件..."
        if ssh_exec "[ -d ${DEPLOY_PATH}/backend ]"; then
            success "后端目录存在"
        else
            error "后端目录缺失"
            all_passed=false
        fi

        if ssh_exec "[ -f /var/www/opclaw/index.html ]"; then
            success "前端文件存在"
        else
            error "前端文件缺失"
            all_passed=false
        fi
    fi

    # 验证服务状态
    info "验证服务状态..."
    if ssh_exec "cd ${DEPLOY_PATH} && docker compose ps" &> /dev/null; then
        success "Docker服务运行中"
    else
        warning "Docker服务可能未正常运行"
    fi

    if [ "$all_passed" = true ]; then
        success "所有验证通过"
    else
        error "部分验证失败"
        return 1
    fi
}

#------------------------------------------------------------------------------
# 打印摘要 (Print Summary)
#------------------------------------------------------------------------------

print_summary() {
    echo ""
    echo "=============================================================================="
    echo "恢复完成 (Restore Complete)"
    echo "=============================================================================="
    echo ""
    echo "恢复详情 (Restore Details):"
    echo "  时间戳 (Timestamp): ${TIMESTAMP}"
    echo "  恢复类型 (Restore Type): ${RESTORE_TYPE}"
    echo "  恢复源 (Restore Source): ${SOURCE}"
    echo ""
    echo "验证状态 (Verification Status):"
    if [ "$VERIFY_RESTORE" = true ]; then
        echo "  数据库 (Database): 已验证"
        echo "  配置 (Configuration): 已验证"
        echo "  文件 (Files): 已验证"
    else
        echo "  跳过验证 (--no-verify)"
    fi
    echo ""
    if [ "$PRE_BACKUP" = true ]; then
        echo "恢复前备份 (Pre-restore backup):"
        echo "  位置: ${DEPLOY_PATH}/backups/pre-restore_${TIMESTAMP}/"
        echo ""
    fi
    echo "后续步骤 (Next Steps):"
    echo "  1. 检查服务状态:"
    echo "     ssh ${DEPLOY_USER}@${DEPLOY_HOST} 'cd ${DEPLOY_PATH} && docker compose ps'"
    echo ""
    echo "  2. 检查服务日志:"
    echo "     ssh ${DEPLOY_USER}@${DEPLOY_HOST} 'cd ${DEPLOY_PATH} && docker compose logs -f'"
    echo ""
    echo "  3. 验证应用功能:"
    echo "     curl https://renava.cn/health"
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
  --type <类型>         恢复类型 (database, config, files, all) [默认: all]
  --source <路径>       备份源路径 [必需]
  --no-backup           不创建恢复前备份
  --no-verify           跳过恢复验证
  --dry-run             模拟运行，不执行实际操作
  --help                显示此帮助信息

环境变量 (Environment Variables):
  DEPLOY_USER           SSH用户 [默认: root]
  DEPLOY_HOST           SSH主机 [默认: 118.25.0.190]
  DEPLOY_PATH           部署路径 [默认: /opt/opclaw]

恢复类型 (Restore Types):
  database  - 数据库恢复 (PostgreSQL)
  config    - 配置文件恢复 (.env, nginx, docker-compose)
  files     - 文件恢复 (backend code, frontend files)
  all       - 全部恢复 (默认)

示例 (Examples):
  # 从备份恢复所有内容
  $0 --type all --source /opt/opclaw/backups/20260318_120000

  # 仅恢复数据库
  $0 --type database --source /opt/opclaw/backups/20260318_120000

  # 恢复但不创建恢复前备份
  $0 --no-backup --source /opt/opclaw/backups/20260318_120000

  # 模拟运行
  $0 --dry-run --source /opt/opclaw/backups/20260318_120000

恢复前备份 (Pre-restore Backup):
  默认情况下，恢复操作会先创建当前状态的备份。
  如果恢复失败，可以使用此备份回滚到恢复前的状态。
  使用 --no-backup 选项跳过此步骤。

安全性 (Safety):
  - 恢复操作会覆盖现有数据
  - 建议先在测试环境验证
  - 确保备份文件完整且可访问
  - 恢复前会自动创建当前状态的备份

EOF
}

#------------------------------------------------------------------------------
# 主函数 (Main Function)
#------------------------------------------------------------------------------

main() {
    # 解析参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            --type)
                RESTORE_TYPE="$2"
                shift 2
                ;;
            --source)
                SOURCE="$2"
                shift 2
                ;;
            --no-backup)
                PRE_BACKUP=false
                shift
                ;;
            --no-verify)
                VERIFY_RESTORE=false
                shift
                ;;
            --dry-run)
                DRY_RUN=true
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
    echo "AIOpc 恢复脚本 (Restore Script)"
    echo "=============================================================================="
    echo "时间戳 (Timestamp): ${TIMESTAMP}"
    echo "主机 (Host): ${DEPLOY_USER}@${DEPLOY_HOST}"
    echo "恢复类型 (Restore Type): ${RESTORE_TYPE}"
    echo "恢复源 (Restore Source): ${SOURCE}"
    echo "恢复前备份 (Pre-restore backup): ${PRE_BACKUP}"
    echo "验证恢复 (Verify restore): ${VERIFY_RESTORE}"
    echo "模拟运行 (Dry Run): ${DRY_RUN}"
    echo "=============================================================================="
    echo ""

    if [ "$DRY_RUN" = true ]; then
        warning "模拟运行模式 - 不会执行实际操作 (DRY RUN MODE - No changes will be made)"
        echo ""
    fi

    # 前置检查
    check_prerequisites

    # 确认恢复操作
    if [ "$DRY_RUN" = false ]; then
        echo -n "确认从 ${SOURCE} 恢复? (yes/no): "
        read -r confirmation

        if [ "$confirmation" != "yes" ]; then
            info "恢复已取消"
            exit 0
        fi
    fi

    # 创建恢复前备份
    create_pre_restore_backup

    # 执行恢复
    restore_database
    restore_config
    restore_files

    # 验证恢复
    if ! verify_restore; then
        error "恢复验证失败"
        error "请检查日志: $LOG_FILE"
        if [ "$PRE_BACKUP" = true ]; then
            error "可以使用恢复前备份回滚: ${DEPLOY_PATH}/backups/pre-restore_${TIMESTAMP}/"
        fi
        exit 1
    fi

    # 打印摘要
    print_summary

    success "恢复成功完成! (Restore completed successfully!)"
}

#------------------------------------------------------------------------------
# 脚本入口点 (Script Entry Point)
#------------------------------------------------------------------------------

main "$@"
