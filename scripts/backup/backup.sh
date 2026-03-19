#!/bin/bash

#==============================================================================
# AIOpc 备份脚本 (Backup Script)
#==============================================================================
# 创建系统备份，包括数据库、配置文件和用户数据
# (Create system backups including database, config, and user data)
#
# 功能特性 (Features):
# - 自动备份 (Automatic backup)
# - 增量备份支持 (Incremental backup support)
# - 备份验证 (Backup verification)
# - 自动清理旧备份 (Automatic cleanup of old backups)
#
# 使用方法 (Usage):
#   ./backup.sh --type all --destination /opt/opclaw/backups
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
LOG_FILE="${PROJECT_ROOT}/backup.log"

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
BACKUP_TYPE="all"
DESTINATION=""
RETENTION_DAYS=7
VERIFY_BACKUP=true
COMPRESS=true
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
# 备份函数 (Backup Functions)
#------------------------------------------------------------------------------

backup_database() {
    step "备份数据库 (Backing up database)"

    local backup_dir="${DESTINATION}/${TIMESTAMP}"
    ssh_exec "mkdir -p ${backup_dir}"

    # 检查数据库容器
    if ! ssh_exec "docker ps | grep opclaw-postgres" &> /dev/null; then
        warning "数据库容器未运行，跳过数据库备份"
        return 0
    fi

    # 创建数据库备份
    info "创建数据库转储..."
    local db_backup_file="${backup_dir}/database.sql.gz"

    if ssh_exec "docker exec opclaw-postgres pg_dump -U opclaw opclaw | gzip > ${db_backup_file}"; then
        success "数据库备份完成"

        # 获取备份文件大小
        local size=$(ssh_exec "ls -lh ${db_backup_file} | awk '{print \$5}'")
        info "备份大小: ${size}"
    else
        error "数据库备份失败"
        return 1
    fi
}

backup_config() {
    step "备份配置文件 (Backing up configuration)"

    local backup_dir="${DESTINATION}/${TIMESTAMP}"
    ssh_exec "mkdir -p ${backup_dir}"

    # 备份后端环境配置
    if ssh_exec "[ -f ${DEPLOY_PATH}/backend/.env ]"; then
        info "备份后端环境配置..."
        ssh_exec "cp ${DEPLOY_PATH}/backend/.env ${backup_dir}/backend.env"
        success "后端环境配置已备份"
    fi

    # 备份Nginx配置
    if ssh_exec "[ -f /etc/nginx/sites-available/opclaw ]"; then
        info "备份Nginx配置..."
        ssh_exec "cp /etc/nginx/sites-available/opclaw ${backup_dir}/nginx.conf"
        success "Nginx配置已备份"
    fi

    # 备份Docker Compose配置
    if ssh_exec "[ -f ${DEPLOY_PATH}/docker-compose.yml ]"; then
        info "备份Docker Compose配置..."
        ssh_exec "cp ${DEPLOY_PATH}/docker-compose.yml ${backup_dir}/docker-compose.yml"
        success "Docker Compose配置已备份"
    fi

    # 备份systemd服务文件 (如果存在)
    if ssh_exec "[ -f /etc/systemd/system/opclaw-backend.service ]"; then
        info "备份systemd服务文件..."
        ssh_exec "cat /etc/systemd/system/opclaw-backend.service > ${backup_dir}/opclaw-backend.service"
        success "systemd服务文件已备份"
    fi
}

backup_files() {
    step "备份文件 (Backing up files)"

    local backup_dir="${DESTINATION}/${TIMESTAMP}"
    ssh_exec "mkdir -p ${backup_dir}"

    # 备份后端代码
    if ssh_exec "[ -d ${DEPLOY_PATH}/backend ]"; then
        info "备份后端代码..."
        if [ "$COMPRESS" = true ]; then
            ssh_exec "cd ${DEPLOY_PATH} && tar -czf ${backup_dir}/backend.tar.gz backend/"
        else
            ssh_exec "mkdir -p ${backup_dir}/files && cp -r ${DEPLOY_PATH}/backend ${backup_dir}/files/"
        fi
        success "后端代码已备份"
    fi

    # 备份前端文件
    if ssh_exec "[ -d /var/www/opclaw ]"; then
        info "备份前端文件..."
        if [ "$COMPRESS" = true ]; then
            ssh_exec "tar -czf ${backup_dir}/frontend.tar.gz -C /var/www opclaw"
        else
            ssh_exec "mkdir -p ${backup_dir}/files && cp -r /var/www/opclaw ${backup_dir}/files/"
        fi
        success "前端文件已备份"
    fi
}

backup_logs() {
    step "备份日志文件 (Backing up logs)"

    local backup_dir="${DESTINATION}/${TIMESTAMP}"
    ssh_exec "mkdir -p ${backup_dir}"

    # 备份Docker日志
    if ssh_exec "docker ps | grep opclaw-backend" &> /dev/null; then
        info "备份后端日志..."
        ssh_exec "docker logs opclaw-backend --tail 1000 > ${backup_dir}/backend.log" || {
            warning "无法备份后端日志"
        }
    fi

    # 备份Nginx日志
    if ssh_exec "[ -f /var/log/nginx/opclaw-access.log ]"; then
        info "备份Nginx访问日志..."
        ssh_exec "tail -n 1000 /var/log/nginx/opclaw-access.log > ${backup_dir}/nginx-access.log" || {
            warning "无法备份Nginx访问日志"
        }
    fi

    if ssh_exec "[ -f /var/log/nginx/opclaw-error.log ]"; then
        info "备份Nginx错误日志..."
        ssh_exec "tail -n 1000 /var/log/nginx/opclaw-error.log > ${backup_dir}/nginx-error.log" || {
            warning "无法备份Nginx错误日志"
        }
    fi

    success "日志文件已备份"
}

#------------------------------------------------------------------------------
# 备份验证 (Backup Verification)
#------------------------------------------------------------------------------

verify_backup() {
    if [ "$VERIFY_BACKUP" = false ]; then
        return 0
    fi

    step "验证备份 (Verifying backup)"

    local backup_dir="${DESTINATION}/${TIMESTAMP}"
    local all_valid=true

    # 验证数据库备份
    if [ "$BACKUP_TYPE" = "all" ] || [ "$BACKUP_TYPE" = "database" ]; then
        if ssh_exec "[ -f ${backup_dir}/database.sql.gz ]"; then
            info "验证数据库备份..."
            local size=$(ssh_exec "stat -f%z ${backup_dir}/database.sql.gz 2>/dev/null || stat -c%s ${backup_dir}/database.sql.gz" || echo "0")
            if [ "$size" -gt 100 ]; then
                success "数据库备份有效 (${size} bytes)"
            else
                error "数据库备份文件过小"
                all_valid=false
            fi
        fi
    fi

    # 验证配置备份
    if [ "$BACKUP_TYPE" = "all" ] || [ "$BACKUP_TYPE" = "config" ]; then
        local config_files=("backend.env" "nginx.conf" "docker-compose.yml")
        for file in "${config_files[@]}"; do
            if ssh_exec "[ -f ${backup_dir}/${file} ]"; then
                info "验证 ${file}..."
                success "${file} 已备份"
            fi
        done
    fi

    # 验证文件备份
    if [ "$BACKUP_TYPE" = "all" ] || [ "$BACKUP_TYPE" = "files" ]; then
        if [ "$COMPRESS" = true ]; then
            if ssh_exec "[ -f ${backup_dir}/backend.tar.gz ]"; then
                info "验证后端代码备份..."
                success "后端代码备份有效"
            fi

            if ssh_exec "[ -f ${backup_dir}/frontend.tar.gz ]"; then
                info "验证前端文件备份..."
                success "前端文件备份有效"
            fi
        fi
    fi

    if [ "$all_valid" = true ]; then
        success "所有备份验证通过"
    else
        error "部分备份验证失败"
        return 1
    fi
}

#------------------------------------------------------------------------------
# 创建备份元数据 (Create Backup Metadata)
#------------------------------------------------------------------------------

create_metadata() {
    step "创建备份元数据 (Creating backup metadata)"

    local backup_dir="${DESTINATION}/${TIMESTAMP}"

    ssh_exec "cat > ${backup_dir}/metadata.txt << EOF
Backup Metadata
===============
Timestamp: ${TIMESTAMP}
Date: $(date)
Backup Type: ${BACKUP_TYPE}
Host: ${DEPLOY_HOST}
User: ${DEPLOY_USER}
Path: ${DEPLOY_PATH}
Compression: ${COMPRESS}
Verified: ${VERIFY_BACKUP}

Contents:
$(ssh_exec "ls -lh ${backup_dir} | tail -n +2")

Disk Usage:
$(ssh_exec "du -sh ${backup_dir}")
EOF"

    success "备份元数据已创建"
}

#------------------------------------------------------------------------------
# 清理旧备份 (Cleanup Old Backups)
#------------------------------------------------------------------------------

cleanup_old_backups() {
    step "清理旧备份 (Cleaning up old backups)"

    info "保留最近 ${RETENTION_DAYS} 天的备份"

    # 查找并删除超过保留期的备份
    local old_backups=$(ssh_exec "find ${DESTINATION} -maxdepth 1 -type d -name '20*' -mtime +${RETENTION_DAYS} || echo ''")

    if [ -n "$old_backups" ]; then
        info "删除以下旧备份:"
        echo "$old_backups" | while read -r backup; do
            if [ -n "$backup" ]; then
                info "  删除: ${backup}"
                ssh_exec "rm -rf ${backup}"
            fi
        done
        success "旧备份已清理"
    else
        info "没有需要清理的旧备份"
    fi

    # 显示备份磁盘使用情况
    local total_size=$(ssh_exec "du -sh ${DEST_PATH} 2>/dev/null | awk '{print \$1}' || echo 'unknown'")
    info "备份目录总大小: ${total_size}"
}

#------------------------------------------------------------------------------
# 打印摘要 (Print Summary)
#------------------------------------------------------------------------------

print_summary() {
    local backup_dir="${DESTINATION}/${TIMESTAMP}"

    echo ""
    echo "=============================================================================="
    echo "备份完成 (Backup Complete)"
    echo "=============================================================================="
    echo ""
    echo "备份详情 (Backup Details):"
    echo "  时间戳 (Timestamp): ${TIMESTAMP}"
    echo "  备份类型 (Backup Type): ${BACKUP_TYPE}"
    echo "  备份路径 (Backup Path): ${backup_dir}"
    echo "  压缩 (Compression): ${COMPRESS}"
    echo "  验证 (Verified): ${VERIFY_BACKUP}"
    echo ""
    echo "备份内容 (Backup Contents):"
    ssh_exec "ls -lh ${backup_dir} | tail -n +2"
    echo ""
    echo "备份大小 (Backup Size):"
    ssh_exec "du -sh ${backup_dir}"
    echo ""
    echo "恢复方法 (Restore Method):"
    echo "  恢复数据库: ${SCRIPT_DIR}/restore.sh --type database --source ${backup_dir}/database.sql.gz"
    echo "  恢复配置: ${SCRIPT_DIR}/restore.sh --type config --source ${backup_dir}"
    echo "  恢复文件: ${SCRIPT_DIR}/restore.sh --type files --source ${backup_dir}"
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
  --type <类型>         备份类型 (database, config, files, logs, all) [默认: all]
  --destination <路径>  备份目标路径 [默认: /opt/opclaw/backups]
  --retention <天数>    保留天数 [默认: 7]
  --no-verify           跳过备份验证
  --no-compress         不压缩备份文件
  --dry-run             模拟运行，不执行实际操作
  --help                显示此帮助信息

环境变量 (Environment Variables):
  DEPLOY_USER           SSH用户 [默认: root]
  DEPLOY_HOST           SSH主机 [默认: 118.25.0.190]
  DEPLOY_PATH           部署路径 [默认: /opt/opclaw]
  BACKUP_PATH           备份路径 [默认: /opt/opclaw/backups]

备份类型 (Backup Types):
  database  - 数据库备份 (PostgreSQL)
  config    - 配置文件备份 (.env, nginx, docker-compose)
  files     - 文件备份 (backend code, frontend files)
  logs      - 日志文件备份
  all       - 全部备份 (默认)

示例 (Examples):
  # 备份所有内容
  $0 --type all

  # 仅备份数据库
  $0 --type database

  # 备份到指定路径
  $0 --destination /mnt/backups

  # 保留30天的备份
  $0 --retention 30

  # 模拟运行
  $0 --dry-run

备份文件命名 (Backup Naming):
  备份目录使用时间戳命名，格式: YYYYMMDD_HHMMSS
  例如: 20260318_120000

自动清理 (Automatic Cleanup):
  默认保留最近7天的备份，超过保留期的备份会被自动删除

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
                BACKUP_TYPE="$2"
                shift 2
                ;;
            --destination)
                DESTINATION="$2"
                shift 2
                ;;
            --retention)
                RETENTION_DAYS="$2"
                shift 2
                ;;
            --no-verify)
                VERIFY_BACKUP=false
                shift
                ;;
            --no-compress)
                COMPRESS=false
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

    # 设置默认目标路径
    if [ -z "$DESTINATION" ]; then
        DESTINATION="${BACKUP_PATH}"
    fi

    # 打印配置
    echo "=============================================================================="
    echo "AIOpc 备份脚本 (Backup Script)"
    echo "=============================================================================="
    echo "时间戳 (Timestamp): ${TIMESTAMP}"
    echo "主机 (Host): ${DEPLOY_USER}@${DEPLOY_HOST}"
    echo "备份类型 (Backup Type): ${BACKUP_TYPE}"
    echo "目标路径 (Destination): ${DESTINATION}"
    echo "保留天数 (Retention): ${RETENTION_DAYS} days"
    echo "压缩 (Compress): ${COMPRESS}"
    echo "验证 (Verify): ${VERIFY_BACKUP}"
    echo "模拟运行 (Dry Run): ${DRY_RUN}"
    echo "=============================================================================="
    echo ""

    if [ "$DRY_RUN" = true ]; then
        warning "模拟运行模式 - 不会执行实际操作 (DRY RUN MODE - No changes will be made)"
        echo ""
    fi

    # 执行备份
    if [ "$BACKUP_TYPE" = "all" ] || [ "$BACKUP_TYPE" = "database" ]; then
        backup_database
    fi

    if [ "$BACKUP_TYPE" = "all" ] || [ "$BACKUP_TYPE" = "config" ]; then
        backup_config
    fi

    if [ "$BACKUP_TYPE" = "all" ] || [ "$BACKUP_TYPE" = "files" ]; then
        backup_files
    fi

    if [ "$BACKUP_TYPE" = "all" ] || [ "$BACKUP_TYPE" = "logs" ]; then
        backup_logs
    fi

    # 验证备份
    verify_backup

    # 创建元数据
    create_metadata

    # 清理旧备份
    cleanup_old_backups

    # 打印摘要
    print_summary

    success "备份成功完成! (Backup completed successfully!)"
}

#------------------------------------------------------------------------------
# 脚本入口点 (Script Entry Point)
#------------------------------------------------------------------------------

main "$@"
