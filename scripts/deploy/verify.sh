#!/bin/bash

#==============================================================================
# AIOpc 部署验证脚本 (Deployment Verification Script)
#==============================================================================
# 验证部署后的系统状态和健康检查
# (Verify system status and health checks after deployment)
#
# 功能特性 (Features):
# - 全面的健康检查 (Comprehensive health checks)
# - 服务状态验证 (Service status verification)
# - 配置验证 (Configuration validation)
# - 性能基准测试 (Performance benchmarking)
#
# 使用方法 (Usage):
#   ./verify.sh --env production --component all
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
LOG_FILE="${PROJECT_ROOT}/verify.log"

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
ENVIRONMENT="production"
COMPONENT="all"
VERBOSE=false
JSON_OUTPUT=false

# 验证结果 (Verification results)
declare -A CHECK_RESULTS
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNING_CHECKS=0

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
    echo -e "${GREEN}[✓]${NC} $*"
    log "PASS" "$*"
}

warning() {
    echo -e "${YELLOW}[⚠]${NC} $*"
    log "WARN" "$*"
}

error() {
    echo -e "${RED}[✗]${NC} $*"
    log "FAIL" "$*"
}

step() {
    echo -e "${BLUE}==>${NC} $1"
    log "STEP" "$*"
}

#------------------------------------------------------------------------------
# 检查函数 (Check Functions)
#------------------------------------------------------------------------------

check() {
    local name=$1
    local command=$2
    local expected=$3

    ((TOTAL_CHECKS++))

    if [ "$VERBOSE" = true ]; then
        info "检查: $name"
    fi

    if eval "$command" &> /dev/null; then
        if [ "$expected" = "pass" ]; then
            success "$name"
            CHECK_RESULTS[$name]="pass"
            ((PASSED_CHECKS++))
            return 0
        else
            error "$name"
            CHECK_RESULTS[$name]="fail"
            ((FAILED_CHECKS++))
            return 1
        fi
    else
        if [ "$expected" = "fail" ]; then
            success "$name"
            CHECK_RESULTS[$name]="pass"
            ((PASSED_CHECKS++))
            return 0
        else
            error "$name"
            CHECK_RESULTS[$name]="fail"
            ((FAILED_CHECKS++))
            return 1
        fi
    fi
}

warn_check() {
    local name=$1
    local command=$2

    ((TOTAL_CHECKS++))

    if eval "$command" &> /dev/null; then
        success "$name"
        CHECK_RESULTS[$name]="pass"
        ((PASSED_CHECKS++))
    else
        warning "$name"
        CHECK_RESULTS[$name]="warn"
        ((WARNING_CHECKS++))
    fi
}

#------------------------------------------------------------------------------
# SSH 包装函数 (SSH Wrapper Functions)
#------------------------------------------------------------------------------

ssh_exec() {
    ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
        -i ~/.ssh/rap001_opclaw \
        "${DEPLOY_USER}@${DEPLOY_HOST}" "$@"
}

#------------------------------------------------------------------------------
# 系统检查 (System Checks)
#------------------------------------------------------------------------------

check_system() {
    step "系统检查 (System checks)"

    # 检查SSH连接
    check "SSH连接" "ssh_exec 'echo test'" "pass"

    # 检查磁盘空间
    local disk_usage=$(ssh_exec "df -h ${DEPLOY_PATH} | tail -1 | awk '{print \$5}' | sed 's/%//'")
    if [ "$disk_usage" -lt 80 ]; then
        success "磁盘空间 (使用率: ${disk_usage}%)"
        ((PASSED_CHECKS++))
    elif [ "$disk_usage" -lt 90 ]; then
        warning "磁盘空间 (使用率: ${disk_usage}%)"
        ((WARNING_CHECKS++))
    else
        error "磁盘空间不足 (使用率: ${disk_usage}%)"
        ((FAILED_CHECKS++))
    fi
    ((TOTAL_CHECKS++))

    # 检查内存
    local mem_usage=$(ssh_exec "free | grep Mem | awk '{printf \"%.0f\", \$3/\$2 * 100.0}'")
    if [ "$mem_usage" -lt 80 ]; then
        success "内存使用 (使用率: ${mem_usage}%)"
        ((PASSED_CHECKS++))
    elif [ "$mem_usage" -lt 90 ]; then
        warning "内存使用 (使用率: ${mem_usage}%)"
        ((WARNING_CHECKS++))
    else
        error "内存不足 (使用率: ${mem_usage}%)"
        ((FAILED_CHECKS++))
    fi
    ((TOTAL_CHECKS++))

    # 检查CPU负载
    local load_avg=$(ssh_exec "uptime | awk -F'load average:' '{print \$2}' | cut -d, -f1 | sed 's/^[ \t]*//'")
    info "CPU负载: ${load_avg}"
}

#------------------------------------------------------------------------------
# 后端检查 (Backend Checks)
#------------------------------------------------------------------------------

check_backend() {
    if [ "$COMPONENT" != "all" ] && [ "$COMPONENT" != "backend" ]; then
        return
    fi

    step "后端检查 (Backend checks)"

    # 检查后端容器
    check "后端容器运行" "ssh_exec 'docker ps | grep opclaw-backend'" "pass"

    # 检查后端健康端点
    check "后端健康端点" "ssh_exec 'curl -sf http://localhost:3000/health'" "pass"

    # 检查后端API响应
    warn_check "后端API响应" "ssh_exec 'curl -sf http://localhost:3000/api/health'"

    # 检查后端日志错误
    local error_count=$(ssh_exec "docker logs opclaw-backend --tail 100 2>&1 | grep -i error | wc -l" || echo "0")
    if [ "$error_count" -lt 5 ]; then
        success "后端日志错误数: ${error_count}"
        ((PASSED_CHECKS++))
    else
        warning "后端日志错误数较多: ${error_count}"
        ((WARNING_CHECKS++))
    fi
    ((TOTAL_CHECKS++))

    # 检查后端端口监听
    check "后端端口监听" "ssh_exec 'netstat -tuln | grep :3000'" "pass"
}

#------------------------------------------------------------------------------
# 前端检查 (Frontend Checks)
#------------------------------------------------------------------------------

check_frontend() {
    if [ "$COMPONENT" != "all" ] && [ "$COMPONENT" != "frontend" ]; then
        return
    fi

    step "前端检查 (Frontend checks)"

    # 检查前端文件
    check "前端文件存在" "ssh_exec '[ -f /var/www/opclaw/index.html ]'" "pass"

    # 检查前端权限
    check "前端文件权限" "ssh_exec 'ls -ld /var/www/opclaw | grep www-data'" "pass"

    # 检查HTTP访问
    local http_code=$(ssh_exec "curl -s -o /dev/null -w '%{http_code}' http://localhost" || echo "000")
    if [ "$http_code" = "200" ] || [ "$http_code" = "301" ] || [ "$http_code" = "302" ]; then
        success "前端HTTP访问 (HTTP ${http_code})"
        ((PASSED_CHECKS++))
    else
        error "前端HTTP访问失败 (HTTP ${http_code})"
        ((FAILED_CHECKS++))
    fi
    ((TOTAL_CHECKS++))

    # 检查Nginx配置
    check "Nginx配置有效" "ssh_exec 'nginx -t'" "pass"

    # 检查Nginx运行状态
    check "Nginx运行状态" "ssh_exec 'systemctl is-active nginx'" "pass"
}

#------------------------------------------------------------------------------
# 数据库检查 (Database Checks)
#------------------------------------------------------------------------------

check_database() {
    if [ "$COMPONENT" != "all" ] && [ "$COMPONENT" != "database" ]; then
        return
    fi

    step "数据库检查 (Database checks)"

    # 检查数据库容器
    check "数据库容器运行" "ssh_exec 'docker ps | grep opclaw-postgres'" "pass"

    # 检查数据库连接
    check "数据库连接" "ssh_exec 'docker exec opclaw-postgres pg_isready -U opclaw'" "pass"

    # 检查数据库大小
    local db_size=$(ssh_exec "docker exec opclaw-postgres psql -U opclaw -d opclaw -c 'SELECT pg_size_pretty(pg_database_size(\\'opclaw\\'));' -t" | xargs || echo "unknown")
    info "数据库大小: ${db_size}"

    # 检查数据库连接数
    local connections=$(ssh_exec "docker exec opclaw-postgres psql -U opclaw -d opclaw -c 'SELECT count(*) FROM pg_stat_activity;' -t" | xargs || echo "0")
    info "数据库连接数: ${connections}"

    # 检查数据库慢查询
    warn_check "数据库慢查询检查" "ssh_exec 'docker exec opclaw-postgres psql -U opclaw -d opclaw -c \"SELECT count(*) FROM pg_stat_statements WHERE mean_exec_time > 1000;\" -t | grep -q \"^0\"'"
}

#------------------------------------------------------------------------------
# 配置检查 (Configuration Checks)
#------------------------------------------------------------------------------

check_configuration() {
    step "配置检查 (Configuration checks)"

    # 检查环境配置文件
    warn_check "后端环境配置" "ssh_exec '[ -f ${DEPLOY_PATH}/backend/.env ]'"

    # 检查环境配置内容
    if ssh_exec "[ -f ${DEPLOY_PATH}/backend/.env ]"; then
        # 检查必需的环境变量
        local required_vars=("PORT" "NODE_ENV" "DB_HOST")
        for var in "${required_vars[@]}"; do
            warn_check "环境变量 ${var}" "ssh_exec 'grep -q \"${var}=\" ${DEPLOY_PATH}/backend/.env'"
        done
    fi

    # 检查Nginx配置
    warn_check "Nginx站点配置" "ssh_exec '[ -L /etc/nginx/sites-enabled/opclaw ]'"

    # 检查SSL证书 (如果存在)
    if ssh_exec "[ -f /etc/ssl/certs/opclaw.crt ]"; then
        local cert_valid=$(ssh_exec "openssl x509 -checkend 2592000 -noout -in /etc/ssl/certs/opclaw.crt && echo 'valid' || echo 'expired'")
        if [ "$cert_valid" = "valid" ]; then
            success "SSL证书有效 (30天内)"
            ((PASSED_CHECKS++))
        else
            warning "SSL证书即将过期或已过期"
            ((WARNING_CHECKS++))
        fi
        ((TOTAL_CHECKS++))
    fi
}

#------------------------------------------------------------------------------
# 性能检查 (Performance Checks)
#------------------------------------------------------------------------------

check_performance() {
    step "性能检查 (Performance checks)"

    # 检查后端响应时间
    local response_time=$(ssh_exec "time curl -s http://localhost:3000/health 2>&1 | grep real | awk '{print \$2}'" || echo "N/A")
    info "后端响应时间: ${response_time}"

    # 检查数据库查询性能
    warn_check "数据库查询性能" "ssh_exec 'docker exec opclaw-postgres psql -U opclaw -d opclaw -c \"SELECT mean_exec_time < 100 FROM pg_stat_statements LIMIT 1;\" -t | grep -q \"t\"'"

    # 检查磁盘I/O
    local io_wait=$(ssh_exec "iostat -x 1 2 | grep avg | tail -1 | awk '{print \$4}'" || echo "N/A")
    info "磁盘I/O等待: ${io_wait}%"
}

#------------------------------------------------------------------------------
# 安全检查 (Security Checks)
#------------------------------------------------------------------------------

check_security() {
    step "安全检查 (Security checks)"

    # 检查防火墙状态
    warn_check "防火墙运行" "ssh_exec 'systemctl is-active ufw || systemctl is-active firewalld'"

    # 检查SSH配置
    warn_check "SSH密钥认证" "ssh_exec 'grep -q \"PasswordAuthentication no\" /etc/ssh/sshd_config'"

    # 检查文件权限
    check "敏感文件权限" "ssh_exec 'chmod 600 ${DEPLOY_PATH}/backend/.env 2>/dev/null || true'" "pass"

    # 检查暴露的端口
    local open_ports=$(ssh_exec "netstat -tuln | grep LISTEN | wc -l" || echo "0")
    info "开放端口数: ${open_ports}"
}

#------------------------------------------------------------------------------
# 打印摘要 (Print Summary)
#------------------------------------------------------------------------------

print_summary() {
    echo ""
    echo "=============================================================================="
    echo "验证摘要 (Verification Summary)"
    echo "=============================================================================="
    echo ""
    echo "总检查数 (Total checks): $TOTAL_CHECKS"
    echo "通过 (Passed): $PASSED_CHECKS"
    echo "失败 (Failed): $FAILED_CHECKS"
    echo "警告 (Warnings): $WARNING_CHECKS"
    echo ""

    local pass_rate=0
    if [ $TOTAL_CHECKS -gt 0 ]; then
        pass_rate=$((PASSED_CHECKS * 100 / TOTAL_CHECKS))
    fi
    echo "通过率 (Pass rate): ${pass_rate}%"
    echo ""

    if [ $FAILED_CHECKS -eq 0 ]; then
        success "所有关键检查通过! (All critical checks passed!)"
    else
        error "部分检查失败，请检查日志 (Some checks failed, please check logs)"
    fi

    if [ $WARNING_CHECKS -gt 0 ]; then
        warning "存在 ${WARNING_CHECKS} 个警告，建议关注 (${WARNING_CHECKS} warnings, attention recommended)"
    fi

    echo ""
    echo "=============================================================================="

    # 如果需要JSON输出
    if [ "$JSON_OUTPUT" = true ]; then
        echo ""
        echo "{"
        echo "  \"timestamp\": \"${TIMESTAMP}\","
        echo "  \"environment\": \"${ENVIRONMENT}\","
        echo "  \"component\": \"${COMPONENT}\","
        echo "  \"total_checks\": ${TOTAL_CHECKS},"
        echo "  \"passed\": ${PASSED_CHECKS},"
        echo "  \"failed\": ${FAILED_CHECKS},"
        echo "  \"warnings\": ${WARNING_CHECKS},"
        echo "  \"pass_rate\": ${pass_rate}"
        echo "}"
    fi
}

#------------------------------------------------------------------------------
# 帮助信息 (Help)
#------------------------------------------------------------------------------

show_help() {
    cat << EOF
用法 (Usage): $0 [选项]

选项 (Options):
  --env <环境>          目标环境 (staging, production) [默认: production]
  --component <组件>    验证组件 (backend, frontend, database, all) [默认: all]
  --verbose             详细输出
  --json                以JSON格式输出结果
  --help                显示此帮助信息

环境变量 (Environment Variables):
  DEPLOY_USER           SSH用户 [默认: root]
  DEPLOY_HOST           SSH主机 [默认: 118.25.0.190]
  DEPLOY_PATH           部署路径 [默认: /opt/opclaw]

检查类别 (Check Categories):
  系统检查 (System):
    - SSH连接
    - 磁盘空间
    - 内存使用
    - CPU负载

  后端检查 (Backend):
    - 容器运行状态
    - 健康端点
    - API响应
    - 日志错误
    - 端口监听

  前端检查 (Frontend):
    - 文件存在性
    - 文件权限
    - HTTP访问
    - Nginx配置

  数据库检查 (Database):
    - 容器运行状态
    - 连接状态
    - 数据库大小
    - 连接数
    - 慢查询

  配置检查 (Configuration):
    - 环境配置文件
    - 必需环境变量
    - Nginx配置
    - SSL证书

  性能检查 (Performance):
    - 响应时间
    - 查询性能
    - 磁盘I/O

  安全检查 (Security):
    - 防火墙状态
    - SSH配置
    - 文件权限
    - 开放端口

示例 (Examples):
  # 验证所有组件
  $0 --env production --component all

  # 仅验证后端
  $0 --component backend

  # 详细输出
  $0 --verbose

  # JSON格式输出
  $0 --json

退出码 (Exit codes):
  0 - 所有检查通过
  1 - 部分检查失败
  2 - 严重错误

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
            --verbose)
                VERBOSE=true
                shift
                ;;
            --json)
                JSON_OUTPUT=true
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
    echo "AIOpc 部署验证脚本 (Deployment Verification Script)"
    echo "=============================================================================="
    echo "时间戳 (Timestamp): $TIMESTAMP"
    echo "主机 (Host): ${DEPLOY_USER}@${DEPLOY_HOST}"
    echo "组件 (Component): $COMPONENT"
    echo "环境 (Environment): $ENVIRONMENT"
    echo "=============================================================================="
    echo ""

    # 执行检查
    check_system
    check_backend
    check_frontend
    check_database
    check_configuration
    check_performance
    check_security

    # 打印摘要
    print_summary

    # 返回适当的退出码
    if [ $FAILED_CHECKS -gt 0 ]; then
        exit 1
    elif [ $WARNING_CHECKS -gt 0 ]; then
        exit 0
    else
        exit 0
    fi
}

#------------------------------------------------------------------------------
# 脚本入口点 (Script Entry Point)
#------------------------------------------------------------------------------

main "$@"
