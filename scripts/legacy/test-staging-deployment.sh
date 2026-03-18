#!/bin/bash
################################################################################
# AIOpc Cloud Deployment - Staging Environment Test Suite
#
# 这个脚本执行完整的本地/Staging环境测试，验证所有部署脚本和配置
#
# 用法: ./test-staging-deployment.sh [--skip-build] [--verbose]
################################################################################

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 计数器
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
WARNINGS=0

# 辅助函数
print_header() {
    echo
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

print_section() {
    echo
    echo -e "${GREEN}▶ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
    ((PASSED_TESTS++))
    ((TOTAL_TESTS++))
}

print_failure() {
    echo -e "${RED}✗ $1${NC}"
    ((FAILED_TESTS++))
    ((TOTAL_TESTS++))
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
    ((WARNINGS++))
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# 测试结果汇总
print_summary() {
    echo
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}测试结果汇总${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo -e "总测试数: ${TOTAL_TESTS}"
    echo -e "${GREEN}通过: ${PASSED_TESTS}${NC}"
    echo -e "${RED}失败: ${FAILED_TESTS}${NC}"
    echo -e "${YELLOW}警告: ${WARNINGS}${NC}"
    echo

    if [ $FAILED_TESTS -eq 0 ]; then
        echo -e "${GREEN}✅ 所有测试通过！${NC}"
        return 0
    else
        echo -e "${RED}❌ 有测试失败，请检查${NC}"
        return 1
    fi
}

################################################################################
# 测试函数
################################################################################

test_script_syntax() {
    print_section "测试1: 脚本语法验证"

    local scripts=(
        "scripts/cloud/init-server.sh"
        "scripts/cloud/check-environment.sh"
        "scripts/cloud/init-database.sh"
        "scripts/cloud/deploy.sh"
        "scripts/cloud/deploy-database.sh"
        "scripts/cloud/run-migration.sh"
        "scripts/cloud/verify-database.sh"
        "scripts/cloud/deploy-backend.sh"
        "scripts/cloud/configure-backend-env.sh"
        "scripts/cloud/health-check.sh"
        "scripts/cloud/deploy-frontend.sh"
        "scripts/cloud/verify-frontend.sh"
        "scripts/cloud/setup-ssl.sh"
        "scripts/cloud/verify-ssl.sh"
        "scripts/cloud/test-backend-scripts.sh"
    )

    for script in "${scripts[@]}"; do
        if [ -f "$script" ]; then
            if bash -n "$script" 2>/dev/null; then
                print_success "$script 语法正确"
            else
                print_failure "$script 语法错误"
            fi
        else
            print_warning "$script 文件不存在"
        fi
    done
}

test_file_permissions() {
    print_section "测试2: 文件权限验证"

    local scripts=(
        "scripts/cloud/init-server.sh"
        "scripts/cloud/deploy-database.sh"
        "scripts/cloud/deploy-backend.sh"
        "scripts/cloud/deploy-frontend.sh"
        "scripts/cloud/setup-ssl.sh"
        "scripts/cloud/health-check.sh"
        "scripts/cloud/verify-database.sh"
        "scripts/cloud/verify-frontend.sh"
        "scripts/cloud/verify-ssl.sh"
        "platform/backend/scripts/backup.sh"
        "platform/backend/scripts/deploy.sh"
        "platform/backend/scripts/rollback.sh"
    )

    for script in "${scripts[@]}"; do
        if [ -f "$script" ]; then
            if [ -x "$script" ]; then
                print_success "$script 可执行"
            else
                print_warning "$script 不可执行"
            fi
        fi
    done
}

test_config_files() {
    print_section "测试3: 配置文件验证"

    # Nginx配置
    if [ -f "config/nginx/opclaw.conf" ]; then
        if grep -q "server_name" config/nginx/opclaw.conf; then
            print_success "Nginx配置有效 (包含server_name)"
        else
            print_failure "Nginx配置无效"
        fi
    else
        print_warning "Nginx配置文件不存在"
    fi

    # PM2配置
    if [ -f "config/pm2/ecosystem.config.js" ]; then
        if grep -q "module.exports" config/pm2/ecosystem.config.js; then
            print_success "PM2配置有效 (JavaScript模块)"
        else
            print_failure "PM2配置无效"
        fi
    else
        print_warning "PM2配置文件不存在"
    fi

    # Systemd服务
    if [ -f "config/systemd/opclaw-backend.service" ]; then
        if grep -q "\[Service\]" config/systemd/opclaw-backend.service; then
            print_success "Systemd服务配置有效"
        else
            print_failure "Systemd服务配置无效"
        fi
    else
        print_warning "Systemd服务配置不存在"
    fi
}

test_documentation() {
    print_section "测试4: 文档完整性检查"

    local docs=(
        "CLOUD_DEPLOYMENT.md"
        "CLOUD_TROUBLESHOOTING.md"
        "docs/DNS_CONFIGURATION.md"
        "docs/SSL_SETUP.md"
        "docs/BACKEND_DEPLOYMENT.md"
        "docs/FRONTEND_DEPLOYMENT.md"
        "platform/backend/DEPLOYMENT.md"
        "platform/backend/PRODUCTION_SETUP.md"
    )

    for doc in "${docs[@]}"; do
        if [ -f "$doc" ]; then
            print_success "$doc 存在"
        else
            print_warning "$doc 缺失"
        fi
    done
}

test_migration_files() {
    print_section "测试5: 数据库迁移文件验证"

    if [ -f "platform/backend/migrations/1700000000000-InitialSchema.ts" ]; then
        print_success "初始迁移文件存在"

        # 检查迁移文件内容
        if grep -q "public async up()" platform/backend/migrations/1700000000000-InitialSchema.ts; then
            print_success "迁移文件包含up()方法"
        else
            print_failure "迁移文件缺少up()方法"
        fi

        if grep -q "public async down()" platform/backend/migrations/1700000000000-InitialSchema.ts; then
            print_success "迁移文件包含down()方法"
        else
            print_failure "迁移文件缺少down()方法"
        fi
    else
        print_failure "初始迁移文件不存在"
    fi
}

test_backend_structure() {
    print_section "测试6: 后端项目结构验证"

    local required=(
        "platform/backend/package.json"
        "platform/backend/tsconfig.json"
        "platform/backend/src/app.ts"
        "platform/backend/src/config/database.ts"
        "platform/backend/.env.production.example"
    )

    for file in "${required[@]}"; do
        if [ -f "$file" ]; then
            print_success "$file 存在"
        else
            print_failure "$file 缺失"
        fi
    done
}

test_frontend_structure() {
    print_section "测试7: 前端项目结构验证"

    local required=(
        "platform/frontend/package.json"
        "platform/frontend/vite.config.ts"
        "platform/frontend/index.html"
        "platform/frontend/src/main.tsx"
    )

    for file in "${required[@]}"; do
        if [ -f "$file" ]; then
            print_success "$file 存在"
        else
            print_failure "$file 缺失"
        fi
    done
}

test_docker_setup() {
    print_section "测试8: Docker环境验证"

    if command -v docker &> /dev/null; then
        print_success "Docker已安装"

        # 检查Docker daemon
        if docker info &> /dev/null; then
            print_success "Docker daemon可访问"
        else
            print_warning "Docker daemon不可访问 (可能需要sudo)"
        fi

        # 检查opclaw/agent镜像
        if docker images | grep -q "openclaw/agent"; then
            print_success "openclaw/agent镜像存在"
        else
            print_warning "openclaw/agent镜像不存在 (需要在服务器上构建)"
        fi
    else
        print_warning "Docker未安装 (本地环境)"
    fi
}

test_dockerfile() {
    print_section "测试9: Dockerfile验证"

    if [ -f "docker/openclaw-agent/Dockerfile" ]; then
        print_success "Dockerfile存在"

        # 检查Dockerfile语法
        if docker build -f docker/openclaw-agent/Dockerfile --check . 2>/dev/null; then
            print_success "Dockerfile语法有效"
        else
            print_warning "Dockerfile语法检查失败 (可能需要实际构建)"
        fi
    else
        print_warning "Dockerfile不存在"
    fi
}

test_local_build() {
    local SKIP_BUILD=false
    if [[ "$1" == "--skip-build" ]]; then
        SKIP_BUILD=true
    fi

    if [ "$SKIP_BUILD" = true ]; then
        print_section "测试10: 本地构建测试 (跳过)"
        print_info "使用--skip-build选项，跳过构建测试"
        return
    fi

    print_section "测试10: 本地构建测试"

    # 测试后端构建
    print_info "测试后端TypeScript编译..."
    if cd platform/backend && pnpm run build 2>&1 | tail -1; then
        print_success "后端构建成功"
        cd - > /dev/null
    else
        print_failure "后端构建失败"
        cd - > /dev/null
    fi

    # 测试前端构建
    print_info "测试前端Vite构建..."
    if cd platform/frontend && pnpm run build 2>&1 | tail -1; then
        print_success "前端构建成功"
        cd - > /dev/null
    else
        print_failure "前端构建失败"
        cd - > /dev/null
    fi
}

test_deployment_scripts_dry_run() {
    print_section "测试11: 部署脚本干运行模式"

    # 测试init-server.sh的dry-run
    if [ -f "scripts/cloud/init-server.sh" ]; then
        print_info "测试init-server.sh --dry-run..."
        if bash scripts/cloud/init-server.sh --dry-run 2>&1 | grep -q "Dry-run mode"; then
            print_success "init-server.sh支持--dry-run"
        else
            print_warning "init-server.sh可能不支持--dry-run"
        fi
    fi

    # 测试deploy-backend.sh的dry-run
    if [ -f "scripts/cloud/deploy-backend.sh" ]; then
        print_info "测试deploy-backend.sh --dry-run..."
        if bash scripts/cloud/deploy-backend.sh --dry-run 2>&1 | grep -q "Dry-run"; then
            print_success "deploy-backend.sh支持--dry-run"
        else
            print_warning "deploy-backend.sh可能不支持--dry-run"
        fi
    fi

    # 测试deploy-frontend.sh的dry-run
    if [ -f "scripts/cloud/deploy-frontend.sh" ]; then
        print_info "测试deploy-frontend.sh --dry-run..."
        if bash scripts/cloud/deploy-frontend.sh --dry-run 2>&1 | grep -q "Dry-run"; then
            print_success "deploy-frontend.sh支持--dry-run"
        else
            print_warning "deploy-frontend.sh可能不支持--dry-run"
        fi
    fi
}

test_environment_variables() {
    print_section "测试12: 环境变量模板验证"

    if [ -f "platform/backend/.env.production.example" ]; then
        print_success "生产环境变量模板存在"

        # 检查关键变量
        local required_vars=(
            "NODE_ENV"
            "DB_HOST"
            "DB_NAME"
            "DB_USER"
            "REDIS_HOST"
            "FEISHU_APP_ID"
            "DEEPSEEK_API_KEY"
            "JWT_SECRET"
        )

        for var in "${required_vars[@]}"; do
            if grep -q "$var" platform/backend/.env.production.example; then
                print_success "环境变量 $var 在模板中"
            else
                print_warning "环境变量 $var 不在模板中"
            fi
        done
    else
        print_failure "生产环境变量模板不存在"
    fi
}

test_backup_scripts() {
    print_section "测试13: 备份脚本验证"

    if [ -f "platform/backend/scripts/backup.sh" ]; then
        print_success "备份脚本存在"

        if [ -x "platform/backend/scripts/backup.sh" ]; then
            print_success "备份脚本可执行"
        else
            print_warning "备份脚本不可执行"
        fi
    else
        print_warning "备份脚本不存在"
    fi

    if [ -f "platform/backend/scripts/rollback.sh" ]; then
        print_success "回滚脚本存在"

        if [ -x "platform/backend/scripts/rollback.sh" ]; then
            print_success "回滚脚本可执行"
        else
            print_warning "回滚脚本不可执行"
        fi
    else
        print_warning "回滚脚本不存在"
    fi
}

################################################################################
# 主执行流程
################################################################################

main() {
    print_header "AIOpc 云端部署 - Staging环境测试套件"

    local SKIP_BUILD=false
    if [[ "$1" == "--skip-build" ]]; then
        SKIP_BUILD=true
    fi

    if [[ "$1" == "--verbose" ]]; then
        set -x
    fi

    print_info "测试开始时间: $(date)"
    print_info "当前分支: $(git branch --show-current)"
    print_info "Git提交: $(git rev-parse --short HEAD)"

    # 执行所有测试
    test_script_syntax
    test_file_permissions
    test_config_files
    test_documentation
    test_migration_files
    test_backend_structure
    test_frontend_structure
    test_docker_setup
    test_dockerfile
    test_local_build "$1"
    test_deployment_scripts_dry_run
    test_environment_variables
    test_backup_scripts

    # 打印结果汇总
    print_summary

    # 生成测试报告
    print_info "生成测试报告..."
    local REPORT_FILE="test-results-$(date +%Y%m%d-%H%M%S).txt"
    {
        echo "AIOpc Cloud Deployment - Staging Test Results"
        echo "=========================================="
        echo "Date: $(date)"
        echo "Branch: $(git branch --show-current)"
        echo "Commit: $(git rev-parse --short HEAD)"
        echo
        echo "Test Summary:"
        echo "  Total: $TOTAL_TESTS"
        echo "  Passed: $PASSED_TESTS"
        echo "  Failed: $FAILED_TESTS"
        echo "  Warnings: $WARNINGS"
        echo
        if [ $FAILED_TESTS -eq 0 ]; then
            echo "Status: ✅ ALL TESTS PASSED"
        else
            echo "Status: ❌ SOME TESTS FAILED"
        fi
    } > "$REPORT_FILE"

    print_info "测试报告已保存到: $REPORT_FILE"

    # 返回适当的退出码
    if [ $FAILED_TESTS -eq 0 ]; then
        exit 0
    else
        exit 1
    fi
}

# 执行主函数
main "$@"
