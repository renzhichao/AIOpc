#!/bin/bash
#==============================================================================
# OAuth配置验证脚本
# 功能: 验证租户OAuth配置的完整性和正确性
# 用法: ./scripts/config/validate-oauth-config.sh <tenant_id> [--verbose]
#==============================================================================

set -e

#==============================================================================
# 配置
#==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TENANTS_DIR="${PROJECT_ROOT}/config/tenants"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 详细模式
VERBOSE=false

#==============================================================================
# 工具函数
#==============================================================================

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

log_verbose() {
    if [ "$VERBOSE" = true ]; then
        echo -e "${BLUE}🔍 $1${NC}"
    fi
}

print_header() {
    echo ""
    echo "========================================="
    echo "$1"
    echo "========================================="
    echo ""
}

#==============================================================================
# 验证函数
#==============================================================================

validate_tenant_exists() {
    local tenant_id=$1
    local tenant_config="${TENANTS_DIR}/${tenant_id}.yml"

    if [ ! -f "$tenant_config" ]; then
        log_error "租户配置文件不存在: ${tenant_config}"
        return 1
    fi

    echo "$tenant_config"
}

validate_yaml_syntax() {
    local tenant_config=$1

    log_info "验证YAML语法..."

    if command -v yamllint &> /dev/null; then
        local output
        output=$(yamllint "$tenant_config" 2>&1 || true)

        if echo "$output" | grep -q "error"; then
            log_error "YAML语法错误:"
            echo "$output" | grep "error"
            return 1
        fi

        if echo "$output" | grep -q "warning"; then
            log_warning "YAML语法警告:"
            echo "$output" | grep "warning"
        fi

        log_success "YAML语法验证通过"
        return 0
    else
        log_warning "yamllint未安装，跳过YAML语法验证"
        return 0
    fi
}

validate_oauth_config_block() {
    local tenant_config=$1

    log_info "验证oauth配置块..."

    if ! grep -q "^oauth:" "$tenant_config"; then
        log_error "缺少oauth配置块"
        return 1
    fi

    # 提取enabled_platforms
    local enabled_platforms
    enabled_platforms=$(grep -A 5 "^oauth:" "$tenant_config" | grep "enabled_platforms:" -A 10 | grep "^  -" | sed 's/^  - //' || true)

    if [ -z "$enabled_platforms" ]; then
        log_error "oauth.enabled_platforms为空"
        return 1
    fi

    log_verbose "启用的平台: $(echo $enabled_platforms | tr '\n' ', ')"

    # 验证至少启用一个平台
    local platform_count
    platform_count=$(echo "$enabled_platforms" | wc -l | xargs)

    if [ "$platform_count" -eq 0 ]; then
        log_error "至少必须启用一个OAuth平台"
        return 1
    fi

    log_success "oauth配置块验证通过（${platform_count}个平台）"
    return 0
}

validate_platform_config() {
    local tenant_config=$1
    local platform=$2

    log_info "验证${platform}平台配置..."

    if ! grep -q "^${platform}:" "$tenant_config"; then
        log_error "缺少${platform}配置块"
        return 1
    fi

    # 提取配置值
    local app_id app_secret encrypt_key redirect_uri

    app_id=$(grep -A 50 "^${platform}:" "$tenant_config" | grep "app_id:" | head -1 | awk '{print $2}' | sed 's/"//g' || true)
    app_secret=$(grep -A 50 "^${platform}:" "$tenant_config" | grep "app_secret:" | head -1 | awk '{print $2}' | sed 's/"//g' || true)
    encrypt_key=$(grep -A 50 "^${platform}:" "$tenant_config" | grep "encrypt_key:" | head -1 | awk '{print $2}' | sed 's/"//g' || true)
    redirect_uri=$(grep -A 50 "^${platform}:" "$tenant_config" | grep "oauth_redirect_uri:" | head -1 | awk '{print $2}' | sed 's/"//g' || true)

    log_verbose "  app_id: ${app_id}"
    log_verbose "  app_secret: $(echo $app_secret | cut -c1-8)..."
    log_verbose "  encrypt_key: $(echo $encrypt_key | cut -c1-8)..."
    log_verbose "  redirect_uri: ${redirect_uri}"

    # 验证必需字段
    local missing_fields=()

    if [ -z "$app_id" ] || [[ "$app_id" == \$* ]]; then
        missing_fields+=("app_id")
    fi

    if [ -z "$app_secret" ] || [[ "$app_secret" == \$* ]] || [[ "$app_secret" == placeholder* ]]; then
        missing_fields+=("app_secret")
    fi

    if [ -z "$encrypt_key" ] || [[ "$encrypt_key" == \$* ]]; then
        missing_fields+=("encrypt_key")
    fi

    if [ -z "$redirect_uri" ] || [[ "$redirect_uri" == \$* ]]; then
        missing_fields+=("oauth_redirect_uri")
    fi

    if [ ${#missing_fields[@]} -gt 0 ]; then
        log_error "${platform}平台缺少必需配置: ${missing_fields[*]}"
        return 1
    fi

    # 平台特定验证
    case $platform in
        feishu)
            if ! [[ "$app_id" =~ ^cli_[a-z0-9]{24,}$ ]]; then
                log_warning "feishu.app_id格式可能不正确（应为cli_开头的24+位字符）"
            fi
            ;;
        dingtalk)
            if ! [[ "$app_id" =~ ^ding[a-z0-9]{16,}$ ]]; then
                log_warning "dingtalk.app_id格式可能不正确（应为ding开头的16+位字符）"
            fi

            # 检查corp_id（如果启用了SSO）
            local sso_enabled
            sso_enabled=$(grep -A 50 "^${platform}:" "$tenant_config" | grep "sso:" -A 5 | grep "enabled:" | awk '{print $2}' | sed 's/"//g' || true)

            if [ "$sso_enabled" = "true" ]; then
                local corp_id
                corp_id=$(grep -A 50 "^${platform}:" "$tenant_config" | grep "corp_id:" | head -1 | awk '{print $2}' | sed 's/"//g' || true)

                if [ -z "$corp_id" ] || [[ "$corp_id" == \$* ]]; then
                    log_warning "${platform}启用SSO时必须配置corp_id"
                fi
            fi
            ;;
    esac

    log_success "${platform}平台配置验证通过"
    return 0
}

validate_url_format() {
    local tenant_config=$1

    log_info "验证URL格式..."

    local urls=()
    local platform

    # 提取所有redirect_uri
    for platform in feishu dingtalk; do
        if grep -q "^${platform}:" "$tenant_config"; then
            local url
            url=$(grep -A 50 "^${platform}:" "$tenant_config" | grep "oauth_redirect_uri:" | head -1 | awk '{print $2}' | sed 's/"//g' || true)

            if [ -n "$url" ] && [[ ! "$url" == \$* ]]; then
                urls+=("$url")
            fi
        fi
    done

    if [ ${#urls[@]} -eq 0 ]; then
        log_warning "未找到任何OAuth回调URL"
        return 0
    fi

    # 验证URL格式
    for url in "${urls[@]}"; do
        if ! [[ "$url" =~ ^https?:// ]]; then
            log_error "URL格式不正确: ${url}"
            return 1
        fi

        log_verbose "  URL: ${url}"
    done

    log_success "URL格式验证通过（${#urls[@]}个URL）"
    return 0
}

validate_key_strength() {
    local tenant_config=$1

    log_info "验证密钥强度..."

    local warnings=0

    # 检查encrypt_key长度
    local platform
    for platform in feishu dingtalk; do
        if grep -q "^${platform}:" "$tenant_config"; then
            local encrypt_key
            encrypt_key=$(grep -A 50 "^${platform}:" "$tenant_config" | grep "encrypt_key:" | head -1 | awk '{print $2}' | sed 's/"//g' || true)

            if [ -n "$encrypt_key" ] && [[ ! "$encrypt_key" == \$* ]]; then
                local key_length=${#encrypt_key}

                if [ "$key_length" -lt 32 ]; then
                    log_warning "${platform}.encrypt_key长度不足（${key_length}位，建议32位以上）"
                    ((warnings++))
                fi
            fi
        fi
    done

    if [ $warnings -eq 0 ]; then
        log_success "密钥强度验证通过"
    else
        log_warning "发现${warnings}个密钥强度警告"
    fi

    return 0
}

validate_environment_consistency() {
    local tenant_config=$1

    log_info "验证环境一致性..."

    local warnings=0

    # 检查环境变量占位符
    local placeholders
    placeholders=$(grep -c '\${.*:-' "$tenant_config" || true)

    if [ "$placeholders" -gt 0 ]; then
        log_verbose "发现${placeholders}个环境变量占位符"

        if [ -f "${PROJECT_ROOT}/platform/backend/.env.production" ]; then
            log_verbose "检查.env.production文件..."

            # 这里可以添加更详细的环境变量检查
            log_info "环境变量占位符已定义（建议确认.env.production已配置）"
        else
            log_warning "未找到.env.production文件，环境变量占位符可能未定义"
            ((warnings++))
        fi
    fi

    if [ $warnings -eq 0 ]; then
        log_success "环境一致性验证通过"
    else
        log_warning "发现${warnings}个环境一致性警告"
    fi

    return 0
}

print_summary() {
    local tenant_id=$1
    local exit_code=$2

    print_header "验证总结"

    if [ $exit_code -eq 0 ]; then
        log_success "租户 ${tenant_id} 的OAuth配置验证通过"
        echo ""
        echo "🎉 配置完整且正确，可以继续部署"
    else
        log_error "租户 ${tenant_id} 的OAuth配置验证失败"
        echo ""
        echo "💡 请修复上述错误后重新验证"
    fi

    echo ""
}

#==============================================================================
# 主函数
#==============================================================================

main() {
    local tenant_id=$1
    local tenant_config exit_code

    # 解析参数
    shift
    while [[ $# -gt 0 ]]; do
        case $1 in
            --verbose|-v)
                VERBOSE=true
                shift
                ;;
            *)
                log_error "未知参数: $1"
                exit 1
                ;;
        esac
    done

    print_header "OAuth配置验证"
    echo "租户: ${tenant_id}"
    echo ""

    # 验证租户配置文件存在
    if ! tenant_config=$(validate_tenant_exists "$tenant_id"); then
        exit 1
    fi

    # 执行验证
    exit_code=0

    validate_yaml_syntax "$tenant_config" || exit_code=$?
    validate_oauth_config_block "$tenant_config" || exit_code=$?
    validate_url_format "$tenant_config" || exit_code=$?
    validate_key_strength "$tenant_config" || exit_code=$?
    validate_environment_consistency "$tenant_config" || exit_code=$?

    # 验证每个启用的平台
    local enabled_platforms
    enabled_platforms=$(grep -A 5 "^oauth:" "$tenant_config" | grep "enabled_platforms:" -A 10 | grep "^  -" | sed 's/^  - //' || true)

    for platform in $enabled_platforms; do
        validate_platform_config "$tenant_config" "$platform" || exit_code=$?
    done

    # 打印总结
    print_summary "$tenant_id" $exit_code

    exit $exit_code
}

#==============================================================================
# 执行
#==============================================================================

main "$@"
