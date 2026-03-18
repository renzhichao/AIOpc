#!/bin/bash

################################################################################
# AIOpc Cloud Deployment - 验收测试脚本
#
# 功能:
# - 完整的云端部署验收测试
# - 前端访问测试
# - 后端API测试
# - 数据库连接测试
# - Redis连接测试
# - Docker环境测试
# - OAuth流程测试
# - 用户旅程测试
#
# 用法: ./cloud-acceptance-test.sh [--full] [--skip-oauth]
################################################################################

set -e

#------------------------------------------------------------------------------
# 配置
#------------------------------------------------------------------------------

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# 服务器配置
SERVER="${SERVER:-root@118.25.0.190}"
DOMAIN="${DOMAIN:-renava.cn}"
FRONTEND_URL="https://$DOMAIN"
BACKEND_URL="https://$DOMAIN/api"
HEALTH_URL="$BACKEND_URL/health"

# 选项
FULL_TEST=false
SKIP_OAUTH=false

#------------------------------------------------------------------------------
# 工具函数
#------------------------------------------------------------------------------

info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

success() {
    echo -e "${GREEN}✓${NC} $*"
}

error() {
    echo -e "${RED}✗${NC} $*"
}

warning() {
    echo -e "${YELLOW}⚠${NC} $*"
}

section() {
    echo ""
    echo -e "${CYAN}▶ $1${NC}"
}

test_pass() {
    success "$1"
    return 0
}

test_fail() {
    error "$1"
    return 1
}

#------------------------------------------------------------------------------
# 测试函数
#------------------------------------------------------------------------------

test_dns_resolution() {
    section "测试1: DNS解析"

    local ip=$(nslookup "$DOMAIN" 2>/dev/null | grep "Address:" | tail -1 | awk '{print $2}')

    if [ "$ip" = "118.25.0.190" ]; then
        test_pass "DNS解析正确: $DOMAIN → $ip"
        return 0
    else
        test_fail "DNS解析错误: $DOMAIN → $ip (预期: 118.25.0.190)"
        return 1
    fi
}

test_https_access() {
    section "测试2: HTTPS访问"

    local status_code=$(curl -s -o /dev/null -w "%{http_code}" "$FRONTEND_URL" 2>/dev/null)

    if [ "$status_code" = "200" ]; then
        test_pass "HTTPS访问成功: $FRONTEND_URL (200)"
        return 0
    else
        test_fail "HTTPS访问失败: $FRONTEND_URL ($status_code)"
        return 1
    fi
}

test_http_redirect() {
    section "测试3: HTTP到HTTPS重定向"

    local redirect_url=$(curl -s -I "http://$DOMAIN" 2>/dev/null | grep -i "Location:" | cut -d' ' -f2 | tr -d '\r')

    if echo "$redirect_url" | grep -q "https://"; then
        test_pass "HTTP重定向到HTTPS正确"
        return 0
    else
        test_fail "HTTP重定向配置错误"
        return 1
    fi
}

test_backend_health() {
    section "测试4: 后端健康检查"

    local health_response=$(curl -s "$HEALTH_URL" 2>/dev/null)

    if echo "$health_response" | grep -q '"status":"healthy"'; then
        test_pass "后端健康检查通过"
        info "  响应: $health_response"
        return 0
    else
        test_fail "后端健康检查失败"
        info "  响应: $health_response"
        return 1
    fi
}

test_database_connection() {
    section "测试5: 数据库连接"

    local db_check=$(ssh "$SERVER" "sudo -u postgres psql -d opclaw -t -c 'SELECT 1' 2>/dev/null" | tr -d ' ')

    if [ "$db_check" = "1" ]; then
        test_pass "数据库连接正常"

        # 检查表数量
        local table_count=$(ssh "$SERVER" "sudo -u postgres psql -d opclaw -t -c 'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '\''public'\'';' | tr -d ' '")
        info "  数据库表数量: $table_count"

        if [ "$table_count" -ge 8 ]; then
            test_pass "数据库schema完整 (≥8表)"
        else
            warning "数据库表数量不足 (预期≥8, 实际$table_count)"
        fi

        return 0
    else
        test_fail "数据库连接失败"
        return 1
    fi
}

test_redis_connection() {
    section "测试6: Redis连接"

    local redis_check=$(ssh "$SERVER" "redis-cli ping 2>/dev/null")

    if [ "$redis_check" = "PONG" ]; then
        test_pass "Redis连接正常"
        return 0
    else
        test_fail "Redis连接失败"
        return 1
    fi
}

test_docker_environment() {
    section "测试7: Docker环境"

    # 检查Docker daemon
    if ssh "$SERVER" "docker info &> /dev/null"; then
        test_pass "Docker daemon运行中"
    else
        test_fail "Docker daemon未运行"
        return 1
    fi

    # 检查网络
    if ssh "$SERVER" "docker network ls | grep -q 'opclaw-network'"; then
        test_pass "Docker网络存在"
    else
        warning "Docker网络不存在 (opclaw-network)"
    fi

    # 检查卷
    if ssh "$SERVER" "docker volume ls | grep -q 'opclaw-data'"; then
        test_pass "Docker卷存在"
    else
        warning "Docker卷不存在 (opclaw-data)"
    fi

    # 检查镜像
    if ssh "$SERVER" "docker images | grep -q 'openclaw/agent'"; then
        test_pass "Agent镜像存在"
    else
        warning "Agent镜像不存在 (openclaw/agent)"
    fi

    return 0
}

test_ssl_certificate() {
    section "测试8: SSL证书"

    local cert_info=$(echo | openssl s_client -servername "$DOMAIN" -connect "$DOMAIN:443" 2>/dev/null | openssl x509 -noout -subject -dates 2>/dev/null)

    if [ -n "$cert_info" ]; then
        test_pass "SSL证书有效"
        info "  证书信息:"
        echo "$cert_info" | sed 's/^/    /'

        # 检查证书过期时间
        local expiry=$(echo "$cert_info" | grep "notAfter" | cut -d= -f2)
        info "  过期时间: $expiry"

        return 0
    else
        test_fail "SSL证书无效或不存在"
        return 1
    fi
}

test_pm2_service() {
    section "测试9: PM2进程管理"

    local pm2_status=$(ssh "$SERVER" "pm2 list 2>/dev/null" | grep "opclaw-backend" | awk '{print $10}')

    if [ "$pm2_status" = "online" ]; then
        test_pass "PM2服务运行中"

        local memory=$(ssh "$SERVER" "pm2 list 2>/dev/null" | grep "opclaw-backend" | awk '{print $6}')
        local cpu=$(ssh "$SERVER" "pm2 list 2>/dev/null" | grep "opclaw-backend" | awk '{print $7}')

        info "  内存使用: $memory"
        info "  CPU使用: $cpu"

        return 0
    else
        test_fail "PM2服务未运行"
        return 1
    fi
}

test_nginx_service() {
    section "测试10: Nginx服务"

    local nginx_status=$(ssh "$SERVER" "systemctl is-active nginx 2>/dev/null")

    if [ "$nginx_status" = "active" ]; then
        test_pass "Nginx服务运行中"

        # 测试Nginx配置
        if ssh "$SERVER" "nginx -t &> /dev/null"; then
            test_pass "Nginx配置有效"
        else
            warning "Nginx配置可能有误"
        fi

        return 0
    else
        test_fail "Nginx服务未运行"
        return 1
    fi
}

test_api_endpoints() {
    section "测试11: API端点"

    # 测试健康端点
    local health_status=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null)
    if [ "$health_status" = "200" ]; then
        test_pass "GET /health ($health_status)"
    else
        test_fail "GET /health ($health_status)"
    fi

    # 测试未授权端点
    local api_status=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/instances" 2>/dev/null)
    if [ "$api_status" = "401" ] || [ "$api_status" = "403" ]; then
        test_pass "GET /api/instances 认证保护 ($api_status)"
    else
        warning "GET /api/instances 返回 $api_status (预期401/403)"
    fi

    return 0
}

test_oauth_configuration() {
    if [ "$SKIP_OAUTH" = true ]; then
        section "测试12: OAuth配置 (跳过)"
        warning "OAuth测试已跳过 (--skip-oauth)"
        return 0
    fi

    section "测试12: OAuth配置"

    local feishu_app_id=$(ssh "$SERVER" "grep FEISHU_APP_ID /opt/opclaw/backend/.env 2>/dev/null | cut -d= -f2")
    local feishu_app_secret=$(ssh "$SERVER" "grep FEISHU_APP_SECRET /opt/opclaw/backend/.env 2>/dev/null | cut -d= -f2")

    if [ "$feishu_app_id" != "\${FEISHU_APP_ID}" ] && [ -n "$feishu_app_id" ]; then
        test_pass "Feishu App ID已配置"

        if [ "$feishu_app_secret" != "\${FEISHU_APP_SECRET}" ] && [ -n "$feishu_app_secret" ]; then
            test_pass "Feishu App Secret已配置"
            return 0
        else
            warning "Feishu App Secret未配置"
            return 1
        fi
    else
        warning "Feishu OAuth凭证未配置"
        return 1
    fi
}

test_deepseek_configuration() {
    section "测试13: DeepSeek配置"

    local deepseek_key=$(ssh "$SERVER" "grep DEEPSEEK_API_KEY /opt/opclaw/backend/.env 2>/dev/null | cut -d= -f2")

    if [ "$deepseek_key" != "\${DEEPSEEK_API_KEY}" ] && [ -n "$deepseek_key" ]; then
        test_pass "DeepSeek API Key已配置"

        # 测试API连接（如果可以的话）
        if [ "$FULL_TEST" = true ]; then
            info "  测试DeepSeek API连接..."
            local api_test=$(curl -s -X POST https://api.deepseek.com/v1/chat/completions \
                -H "Content-Type: application/json" \
                -H "Authorization: Bearer $deepseek_key" \
                -d '{"model":"deepseek-chat","messages":[{"role":"user","content":"test"}],"max_tokens":10}' \
                2>/dev/null | head -c 100)

            if echo "$api_test" | grep -q "choices"; then
                test_pass "DeepSeek API连接正常"
            else
                warning "DeepSeek API连接测试失败"
            fi
        fi

        return 0
    else
        warning "DeepSeek API Key未配置"
        return 1
    fi
}

test_disk_space() {
    section "测试14: 磁盘空间"

    local disk_usage=$(ssh "$SERVER" "df -h / | awk 'NR==2 {print \$5}' | sed 's/%//'")

    if [ "$disk_usage" -lt 80 ]; then
        test_pass "磁盘空间充足 (使用: ${disk_usage}%)"
        return 0
    elif [ "$disk_usage" -lt 90 ]; then
        warning "磁盘空间偏紧 (使用: ${disk_usage}%)"
        return 0
    else
        test_fail "磁盘空间不足 (使用: ${disk_usage}%)"
        return 1
    fi
}

test_system_resources() {
    section "测试15: 系统资源"

    # CPU使用率
    local cpu_usage=$(ssh "$SERVER" "top -bn1 | grep 'Cpu(s)' | awk '{print \$2}' | cut -d% -f1")
    info "  CPU使用率: ${cpu_usage}%"

    # 内存使用率
    local mem_usage=$(ssh "$SERVER" "free | grep Mem | awk '{printf \"%.0f\", (\$3/\$2) * 100.0}'")
    info "  内存使用率: ${mem_usage}%"

    if [ $(echo "$mem_usage < 90" | bc) -eq 1 ]; then
        test_pass "系统资源正常"
        return 0
    else
        warning "内存使用率较高: ${mem_usage}%"
        return 0
    fi
}

test_firewall_rules() {
    section "测试16: 防火墙规则"

    if ssh "$SERVER" "ufw status | grep -q 'Status: active'"; then
        test_pass "UFW防火墙已启用"

        # 检查必要端口
        if ssh "$SERVER" "ufw status | grep -q '22.*ALLOW'"; then
            test_pass "SSH端口(22)已开放"
        else
            warning "SSH端口可能未开放"
        fi

        if ssh "$SERVER" "ufw status | grep -q '80.*ALLOW'"; then
            test_pass "HTTP端口(80)已开放"
        else
            warning "HTTP端口可能未开放"
        fi

        if ssh "$SERVER" "ufw status | grep -q '443.*ALLOW'"; then
            test_pass "HTTPS端口(443)已开放"
        else
            warning "HTTPS端口可能未开放"
        fi

        return 0
    else
        warning "UFW防火墙未启用或使用其他防火墙"
        return 0
    fi
}

test_log_files() {
    section "测试17: 日志文件"

    if ssh "$SERVER" "[ -f /opt/opclaw/backend/logs/combined.log ]"; then
        test_pass "后端日志文件存在"

        local log_size=$(ssh "$SERVER" "wc -l < /opt/opclaw/backend/logs/combined.log 2>/dev/null" || echo "0")
        info "  日志行数: $log_size"

        return 0
    else
        warning "后端日志文件不存在"
        return 0
    fi
}

test_backup_configuration() {
    section "测试18: 备份配置"

    if ssh "$SERVER" "[ -d /var/backups/opclaw ]"; then
        test_pass "备份目录存在"

        local backup_count=$(ssh "$SERVER" "ls /var/backups/opclaw 2>/dev/null | wc -l")
        info "  备份文件数: $backup_count"

        return 0
    else
        warning "备份目录不存在"
        return 0
    fi
}

print_summary() {
    echo ""
    echo "=============================================================================="
    echo "验收测试完成"
    echo "=============================================================================="
    echo ""
    echo "测试结果:"
    echo "  通过: $passed"
    echo "  失败: $failed"
    echo "  警告: $warnings"
    echo "  总计: $total"
    echo ""

    if [ $failed -eq 0 ]; then
        success "✅ 所有关键测试通过！"
        echo ""
        echo "云端部署验收测试结果: **通过**"
        echo ""
        echo "系统已准备就绪，可以投入生产使用。"
        return 0
    else
        error "❌ 有 $failed 个测试失败"
        echo ""
        echo "云端部署验收测试结果: **未通过**"
        echo ""
        echo "请解决上述问题后重新测试。"
        return 1
    fi
}

#------------------------------------------------------------------------------
# 主函数
#------------------------------------------------------------------------------

main() {
    # 解析参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            --full)
                FULL_TEST=true
                shift
                ;;
            --skip-oauth)
                SKIP_OAUTH=true
                shift
                ;;
            *)
                echo "Usage: $0 [--full] [--skip-oauth]"
                exit 1
                ;;
        esac
    done

    echo "=============================================================================="
    echo "AIOpc Cloud Deployment - 验收测试"
    echo "=============================================================================="
    echo "测试时间: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "服务器: $SERVER"
    echo "域名: $DOMAIN"
    echo "完整测试: $FULL_TEST"
    echo "=============================================================================="
    echo ""

    local total=0
    local passed=0
    local failed=0
    local warnings=0

    # 执行所有测试
    test_dns_resolution && ((passed++)) || ((failed++))
    ((total++))

    test_https_access && ((passed++)) || ((failed++))
    ((total++))

    test_http_redirect && ((passed++)) || ((failed++))
    ((total++))

    test_backend_health && ((passed++)) || ((failed++))
    ((total++))

    test_database_connection && ((passed++)) || ((failed++))
    ((total++))

    test_redis_connection && ((passed++)) || ((failed++))
    ((total++))

    test_docker_environment || ((warnings++))
    ((total++))

    test_ssl_certificate && ((passed++)) || ((failed++))
    ((total++))

    test_pm2_service && ((passed++)) || ((failed++))
    ((total++))

    test_nginx_service && ((passed++)) || ((failed++))
    ((total++))

    test_api_endpoints || ((warnings++))
    ((total++))

    test_oauth_configuration || ((warnings++))
    ((total++))

    test_deepseek_configuration || ((warnings++))
    ((total++))

    test_disk_space && ((passed++)) || ((failed++))
    ((total++))

    test_system_resources || ((warnings++))
    ((total++))

    test_firewall_rules || ((warnings++))
    ((total++))

    test_log_files || ((warnings++))
    ((total++))

    test_backup_configuration || ((warnings++))
    ((total++))

    # 打印总结
    print_summary
}

# 执行主函数
main "$@"
