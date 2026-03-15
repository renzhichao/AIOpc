#!/bin/bash

##############################################################################
# OAuth 流程测试脚本
#
# 用途: 在本地环境测试完整的 OAuth 授权流程
# 使用方法: ./scripts/test-oauth-flow.sh
###############################################################################

set -e

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== OAuth 流程测试 ===${NC}\n"

# 步骤 1: 获取授权 URL
echo -e "${YELLOW}步骤 1: 获取授权 URL${NC}"
AUTH_RESPONSE=$(curl -s "http://localhost:3000/api/oauth/authorize?redirect_uri=http://localhost:5173/oauth/callback")
AUTH_URL=$(echo $AUTH_RESPONSE | jq -r '.url')

echo "授权 URL: $AUTH_URL"

if [[ $AUTH_URL == "null" ]] || [[ -z $AUTH_URL ]]; then
    echo -e "${RED}❌ 获取授权 URL 失败${NC}"
    exit 1
fi

echo -e "${GREEN}✅ 授权 URL 获取成功${NC}\n"

# 步骤 2: 访问 Mock 飞书授权端点
echo -e "${YELLOW}步骤 2: 访问 Mock 飞书授权端点${NC}"
echo "正在访问: $AUTH_URL"

MOCK_RESPONSE=$(curl -s "$AUTH_URL")
echo "Mock 飞书响应: $MOCK_RESPONSE"

if [[ $MOCK_RESPONSE == *"error"* ]]; then
    echo -e "${RED}❌ Mock 飞书授权失败${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Mock 飞书授权成功${NC}\n"

# 步骤 3: 显示 Mock 用户信息
echo -e "${YELLOW}步骤 3: 检查 Mock 用户信息${NC}"
USER_INFO=$(curl -s http://localhost:3001/health)
echo -e "Mock 用户信息:\n$USER_INFO\n"

# 步骤 4: 测试回调处理
echo -e "${YELLOW}步骤 4: 测试 OAuth 回调${NC}"
# 注意: 这需要实际的用户交互，这里只是说明
echo "请在浏览器中执行以下步骤:"
echo "1. 访问: http://localhost:5173/login"
echo "2. 复制二维码中的 URL"
echo "3. 在新标签页打开该 URL"
echo "4. 完成授权后会自动跳转回前端\n"

echo -e "${GREEN}=== OAuth 流程测试完成 ===${NC}"
echo -e "${BLUE}提示: 完整的 E2E 测试需要:${NC}"
echo "1. Mock 飞书服务运行在: http://localhost:3001"
echo "2. 前端应用运行在: http://localhost:5173"
echo "3. 后端 API 运行在: http://localhost:3000"
echo "4. 使用浏览器手动测试完整的登录流程"
