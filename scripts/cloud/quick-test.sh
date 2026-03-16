#!/bin/bash
################################################################################
# AIOpc Cloud Deployment - 简化测试脚本
################################################################################

echo "=== AIOpc 云端部署测试 ==="
echo

PASSED=0
FAILED=0

# 测试函数
test_item() {
    local name="$1"
    local command="$2"

    echo "测试: $name"
    if eval "$command" >/dev/null 2>&1; then
        echo "  ✅ PASS"
        ((PASSED++))
        return 0
    else
        echo "  ❌ FAIL"
        ((FAILED++))
        return 1
    fi
}

echo "1. 脚本语法验证"
echo "----------------"
test_item "init-server.sh" "bash -n scripts/cloud/init-server.sh"
test_item "deploy-database.sh" "bash -n scripts/cloud/deploy-database.sh"
test_item "deploy-backend.sh" "bash -n scripts/cloud/deploy-backend.sh"
test_item "deploy-frontend.sh" "bash -n scripts/cloud/deploy-frontend.sh"
test_item "setup-ssl.sh" "bash -n scripts/cloud/setup-ssl.sh"
echo

echo "2. 配置文件验证"
echo "----------------"
test_item "Nginx配置存在" "test -f config/nginx/opclaw.conf"
test_item "PM2配置存在" "test -f config/pm2/ecosystem.config.js"
test_item "Systemd服务存在" "test -f config/systemd/opclaw-backend.service"
echo

echo "3. 文档验证"
echo "----------------"
test_item "部署指南" "test -f CLOUD_DEPLOYMENT.md"
test_item "故障排除指南" "test -f CLOUD_TROUBLESHOOTING.md"
test_item "DNS配置指南" "test -f docs/DNS_CONFIGURATION.md"
test_item "SSL配置指南" "test -f docs/SSL_SETUP.md"
echo

echo "4. 后端结构验证"
echo "----------------"
test_item "package.json" "test -f platform/backend/package.json"
test_item "tsconfig.json" "test -f platform/backend/tsconfig.json"
test_item "app.ts" "test -f platform/backend/src/app.ts"
test_item "数据库配置" "test -f platform/backend/src/config/database.ts"
test_item "环境变量模板" "test -f platform/backend/.env.production.example"
echo

echo "5. 前端结构验证"
echo "----------------"
test_item "前端package.json" "test -f platform/frontend/package.json"
test_item "Vite配置" "test -f platform/frontend/vite.config.ts"
test_item "index.html" "test -f platform/frontend/index.html"
echo

echo "6. 迁移文件验证"
echo "----------------"
test_item "初始迁移文件" "test -f platform/backend/migrations/1700000000000-InitialSchema.ts"
if [ -f "platform/backend/migrations/1700000000000-InitialSchema.ts" ]; then
    test_item "迁移包含up()" "grep -q 'public async up' platform/backend/migrations/1700000000000-InitialSchema.ts"
    test_item "迁移包含down()" "grep -q 'public async down' platform/backend/migrations/1700000000000-InitialSchema.ts"
fi
echo

echo "7. Docker环境验证"
echo "----------------"
test_item "Docker已安装" "command -v docker"
test_item "Dockerfile存在" "test -f docker/openclaw-agent/Dockerfile"
test_item "Docker忽略文件" "test -f docker/openclaw-agent/.dockerignore"
echo

echo "8. 脚本可执行权限"
echo "----------------"
test_item "init-server.sh可执行" "test -x scripts/cloud/init-server.sh"
test_item "deploy-database.sh可执行" "test -x scripts/cloud/deploy-database.sh"
test_item "deploy-backend.sh可执行" "test -x scripts/cloud/deploy-backend.sh"
test_item "deploy-frontend.sh可执行" "test -x scripts/cloud/deploy-frontend.sh"
echo

echo "=== 测试结果 ==="
echo "通过: $PASSED"
echo "失败: $FAILED"
echo "总计: $((PASSED + FAILED))"
echo

if [ $FAILED -eq 0 ]; then
    echo "✅ 所有测试通过！"
    exit 0
else
    echo "❌ 有测试失败"
    exit 1
fi
