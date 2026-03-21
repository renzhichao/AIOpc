#!/bin/bash
#==============================================================================
# 多平台OAuth迁移脚本
# 功能: 将现有单平台（飞书）配置迁移到多平台（飞书+钉钉）配置
# 用法: ./scripts/migrate/migrate-to-multi-platform.sh <tenant_id>
#==============================================================================

set -e  # 遇到错误立即退出

#==============================================================================
# 配置
#==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TENANTS_DIR="${PROJECT_ROOT}/config/tenants"
BACKUP_DIR="${TENANTS_DIR}/backups"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

validate_tenant_id() {
    local tenant_id=$1

    if [ -z "$tenant_id" ]; then
        log_error "未提供租户ID"
        echo "用法: $0 <tenant_id>"
        exit 1
    fi

    local tenant_config="${TENANTS_DIR}/${tenant_id}.yml"

    if [ ! -f "$tenant_config" ]; then
        log_error "租户配置文件不存在: ${tenant_config}"
        exit 1
    fi

    echo "$tenant_config"
}

check_existing_oauth_config() {
    local tenant_config=$1

    if grep -q "^oauth:" "$tenant_config"; then
        log_warning "检测到已存在oauth配置块"
        return 1
    fi

    return 0
}

check_feishu_config() {
    local tenant_config=$1

    if ! grep -q "^feishu:" "$tenant_config"; then
        log_error "未找到feishu配置块"
        return 1
    fi

    return 0
}

#==============================================================================
# 备份函数
#==============================================================================

backup_config() {
    local tenant_config=$1
    local backup_file="${BACKUP_DIR}/$(basename ${tenant_config})_$(date +%Y%m%d_%H%M%S).yml.bak"

    mkdir -p "${BACKUP_DIR}"
    cp "${tenant_config}" "${backup_file}"

    log_success "配置已备份到: ${backup_file}"
    echo "$backup_file"
}

#==============================================================================
# 迁移函数
#==============================================================================

add_oauth_config_block() {
    local tenant_config=$1

    log_info "添加oauth配置块..."

    cat >> "${tenant_config}" << 'EOF'

#==============================================================================
# 多平台OAuth配置（迁移脚本添加）
#==============================================================================

oauth:
  # 启用的OAuth平台列表
  enabled_platforms:
    - feishu
    - dingtalk

  # 默认OAuth平台（用户未选择时使用）
  default_platform: "feishu"

  # 平台切换策略
  # 支持值: auto, user_select, tenant_default
  selection_strategy: "user_select"

  # OAuth回调URL（通用）
  callback:
    base_url: "${OAUTH_CALLBACK_BASE_URL:-https://ciiber.example.com}"
    feishu_path: "/api/auth/feishu/callback"
    dingtalk_path: "/api/auth/dingtalk/callback"

EOF

    log_success "oauth配置块已添加"
}

add_dingtalk_config_block() {
    local tenant_config=$1

    log_info "添加钉钉配置块..."

    cat >> "${tenant_config}" << 'EOF'

#==============================================================================
# 钉钉OAuth配置（迁移脚本添加）
#==============================================================================

dingtalk:
  # 钉钉应用ID（必需，又称AppKey）
  app_id: "${DINGTALK_APP_ID:-dingxxxxxxxxxxxxxxxx}"

  # 钉钉应用密钥（必需，又称AppSecret，加密存储）
  app_secret: "${DINGTALK_APP_SECRET:-placeholder_dingtalk_secret}"

  # 加密密钥（必需）
  encrypt_key: "${DINGTALK_ENCRYPT_KEY:-DingTalkEncryptKey32CharsHere123456}"

  # OAuth重定向URI（必需）
  oauth_redirect_uri: "${DINGTALK_REDIRECT_URI:-https://ciiber.example.com/api/auth/dingtalk/callback}"

  # 事件回调URL（可选）
  event_callback_url: "${DINGTALK_EVENT_CALLBACK_URL:-https://ciiber.example.com/api/dingtalk/events}"

  # API基础URL（可选）
  api_base_url: "${DINGTALK_API_BASE_URL:-https://api.dingtalk.com}"

  # 企业ID（必需，用于企业内部应用）
  corp_id: "${DINGTALK_CORP_ID:-dingxxxxxxxxxxxxxxxx}"

  # OAuth授权端点
  oauth:
    authorize_url: "${DINGTALK_OAUTH_AUTHORIZE_URL:-https://login.dingtalk.com/oauth2/auth}"
    token_url: "${DINGTALK_OAUTH_TOKEN_URL:-https://api.dingtalk.com/v1.0/oauth2/userAccessToken}"
    user_info_url: "${DINGTALK_USER_INFO_URL:-https://api.dingtalk.com/v1.0/contact/users/me}"
    refresh_url: "${DINGTALK_OAUTH_REFRESH_URL:-https://api.dingtalk.com/v1.0/oauth2/refreshAccessToken}"

  # SSO配置（可选）
  sso:
    enabled: "${DINGTALK_SSO_ENABLED:-false}"
    redirect_url: "${DINGTALK_SSO_REDIRECT_URL:-}"

  # Webhook配置
  webhook:
    token: "${DINGTALK_WEBHOOK_TOKEN:-}"
    aes_key: "${DINGTALK_WEBHOOK_AES_KEY:-}"

  # 启用状态（可通过运行时配置覆盖）
  enabled: "${DINGTALK_ENABLED:-true}"

EOF

    log_success "钉钉配置块已添加"
}

add_security_config_block() {
    local tenant_config=$1

    log_info "添加安全配置块..."

    cat >> "${tenant_config}" << 'EOF'

#==============================================================================
# 安全配置
#==============================================================================

security:
  # 密钥加密配置
  encryption:
    algorithm: "${ENCRYPTION_ALGORITHM:-aes-256-gcm}"
    key_length: "${ENCRYPTION_KEY_LENGTH:-256}"
    rotation_days: "${ENCRYPTION_ROTATION_DAYS:-90}"

  # OAuth安全配置
  oauth:
    state_ttl: "${OAUTH_STATE_TTL:-600}"
    code_ttl: "${OAUTH_CODE_TTL:-300}"
    refresh_window: "${OAUTH_REFRESH_WINDOW:-86400}"
    pkce_enabled: "${OAUTH_PKCE_ENABLED:-true}"

EOF

    log_success "安全配置块已添加"
}

add_features_config_block() {
    local tenant_config=$1

    log_info "添加功能开关配置块..."

    cat >> "${tenant_config}" << 'EOF'

#==============================================================================
# 功能开关
#==============================================================================

features:
  # 多平台OAuth功能
  multi_platform_oauth:
    enabled: "${FEATURE_MULTI_PLATFORM_OAUTH:-true}"

  # 平台自动检测
  platform_auto_detection:
    enabled: "${FEATURE_PLATFORM_AUTO_DETECTION:-false}"

  # 用户平台记忆
  remember_platform:
    enabled: "${FEATURE_REMEMBER_PLATFORM:-true}"
    ttl: "${PLATFORM_MEMORY_TTL:-2592000}"

  # OAuth失败降级
  oauth_fallback:
    enabled: "${FEATURE_OAUTH_FALLBACK:-true}"
    fallback_platform: "${OAUTH_FALLBACK_PLATFORM:-feishu}"

EOF

    log_success "功能开关配置块已添加"
}

#==============================================================================
# 验证函数
#==============================================================================

validate_yaml_syntax() {
    local tenant_config=$1

    log_info "验证YAML语法..."

    if command -v yamllint &> /dev/null; then
        if yamllint "${tenant_config}" 2>&1 | grep -q "error"; then
            log_error "YAML语法验证失败"
            return 1
        fi
        log_success "YAML语法验证通过"
    else
        log_warning "yamllint未安装，跳过YAML语法验证"
        log_info "安装yamllint: pip install yamllint"
    fi

    return 0
}

validate_config() {
    local tenant_config=$1

    log_info "验证配置完整性..."

    # 检查必需的配置块
    local required_blocks=("oauth" "feishu" "dingtalk")
    for block in "${required_blocks[@]}"; do
        if ! grep -q "^${block}:" "$tenant_config"; then
            log_error "缺少必需配置块: ${block}"
            return 1
        fi
    done

    log_success "配置完整性验证通过"
    return 0
}

#==============================================================================
# 主函数
#==============================================================================

main() {
    local tenant_id=$1
    local tenant_config backup_file

    print_header "多平台OAuth迁移脚本"
    echo "租户: ${tenant_id}"
    echo ""

    # 验证租户ID和配置文件
    tenant_config=$(validate_tenant_id "$tenant_id")

    # 检查是否已迁移
    if ! check_existing_oauth_config "$tenant_config"; then
        log_warning "租户${tenant_id}已存在oauth配置，跳过迁移"
        echo ""
        echo "💡 如需重新迁移，请先手动恢复备份或删除现有oauth配置块"
        exit 0
    fi

    # 检查现有飞书配置
    if ! check_feishu_config "$tenant_config"; then
        log_error "未找到feishu配置块，无法迁移"
        exit 1
    fi

    log_success "配置检查通过"

    # 备份现有配置
    print_header "步骤 1/5: 备份现有配置"
    backup_file=$(backup_config "$tenant_config")

    # 添加配置块
    print_header "步骤 2/5: 添加oauth配置块"
    add_oauth_config_block "$tenant_config"

    print_header "步骤 3/5: 添加钉钉配置块"
    add_dingtalk_config_block "$tenant_config"

    print_header "步骤 4/5: 添加安全配置块"
    add_security_config_block "$tenant_config"

    print_header "步骤 5/5: 添加功能开关配置块"
    add_features_config_block "$tenant_config"

    # 验证迁移后的配置
    print_header "验证迁移后的配置"

    if ! validate_yaml_syntax "$tenant_config"; then
        log_error "YAML语法验证失败"
        log_info "恢复备份: cp ${backup_file} ${tenant_config}"
        cp "${backup_file}" "${tenant_config}"
        exit 1
    fi

    if ! validate_config "$tenant_config"; then
        log_error "配置完整性验证失败"
        log_info "恢复备份: cp ${backup_file} ${tenant_config}"
        cp "${backup_file}" "${tenant_config}"
        exit 1
    fi

    # 迁移完成
    print_header "迁移完成"
    log_success "租户 ${tenant_id} 已成功迁移到多平台OAuth配置"

    echo ""
    echo "📋 后续步骤:"
    echo ""
    echo "1. 配置钉钉应用凭证（环境变量或GitHub Secrets）:"
    echo "   - DINGTALK_APP_ID"
    echo "   - DINGTALK_APP_SECRET"
    echo "   - DINGTALK_CORP_ID"
    echo ""
    echo "2. 更新环境变量文件 (.env.production):"
    echo "   cp platform/backend/.env.production.example platform/backend/.env.production"
    echo "   # 编辑.env.production，填入钉钉配置"
    echo ""
    echo "3. 设置GitHub Secrets:"
    echo "   gh secret set DINGTALK_APP_ID --body \"ding_xxx\""
    echo "   gh secret set DINGTALK_APP_SECRET --body \"your_secret\""
    echo "   gh secret set DINGTALK_CORP_ID --body \"ding_xxx\""
    echo ""
    echo "4. 重新部署应用:"
    echo "   ./scripts/deploy/deploy-backend.sh --tenant=${tenant_id} --env=production"
    echo ""
    echo "📁 备份位置: ${backup_file}"
    echo ""
}

#==============================================================================
# 执行
#==============================================================================

main "$@"
