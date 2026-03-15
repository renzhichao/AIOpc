#!/bin/bash

##############################################################################
# 本地开发环境完整测试脚本
#
# 用途: 测试所有本地服务的健康状态和基本功能
# 使用方法: ./scripts/test-all-services.sh
###############################################################################

set -e

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 计数器
PASS=0
FAIL=0

echo -e "${BLUE}=== 本地开发环境完整测试 ===${NC}\n"

# 测试函数
test_service() {
    local name=$1
    local url=$2
    local description=$3

    echo -e "${YELLOW}测试: $name${NC}"
    echo "  URL: $url"
    echo "  描述: $description"

    if curl -s "$url" > /dev/null 2>&1; then
        echo -e "  ${GREEN}✅ 通过${NC}\n"
        ((PASS++))
        return 0
    else
        echo -e "  ${RED}❌ 失败${NC}\n"
        ((FAIL++))
        return 1
    fi
}

# 1. 前端服务测试
echo -e "${BLUE}--- 前端服务 ---${NC}\n"
test_service \
    "前端应用 (Vite Dev Server)" \
    "http://localhost:5173" \
    "React + TypeScript + Vite"

# 2. 后端服务测试
echo -e "${BLUE}--- 后端服务 ---${NC}\n"
test_service \
    "后端 API (Express)" \
    "http://localhost:3000/health" \
    "Node.js + Express + TypeORM"

# 3. Mock 服务测试
echo -e "${BLUE}--- Mock 服务 ---${NC}\n"
test_service \
    "Mock 飞书 OAuth" \
    "http://localhost:3001/health" \
    "飞书 OAuth 授权模拟服务"

test_service \
    "Mock OpenClaw AI Agent" \
    "http://localhost:3002/health" \
    "OpenClaw AI Agent 模拟服务"

# 4. 数据库服务测试
echo -e "${BLUE}--- 数据库服务 ---${NC}\n"

# PostgreSQL 测试
echo -e "${YELLOW}测试: PostgreSQL 数据库${NC}"
echo "  Port: 5432"
echo "  描述: 主数据库 (TypeORM)"
if docker exec opclaw-postgres-dev pg_isready -U opclaw > /dev/null 2>&1; then
    echo -e "  ${GREEN}✅ 通过${NC}\n"
    ((PASS++))
else
    echo -e "  ${RED}❌ 失败${NC}\n"
    ((FAIL++))
fi

# Redis 测试
echo -e "${YELLOW}测试: Redis 缓存${NC}"
echo "  Port: 6379"
echo "  描述: 缓存和会话存储"
if docker exec opclaw-redis-dev redis-cli -a dev_password ping > /dev/null 2>&1; then
    echo -e "  ${GREEN}✅ 通过${NC}\n"
    ((PASS++))
else
    echo -e "  ${RED}❌ 失败${NC}\n"
    ((FAIL++))
fi

# 5. 功能测试
echo -e "${BLUE}--- 功能测试 ---${NC}\n"

# OAuth 授权 URL 测试
echo -e "${YELLOW}测试: OAuth 授权 URL 生成${NC}"
OAUTH_RESPONSE=$(curl -s "http://localhost:3000/api/oauth/authorize?redirect_uri=http://localhost:5173/oauth/callback")
OAUTH_URL=$(echo $OAUTH_RESPONSE | jq -r '.url' 2>/dev/null)
if [[ $OAUTH_URL != "null" ]] && [[ $OAUTH_URL == http* ]]; then
    echo -e "  ${GREEN}✅ 通过${NC}"
    echo "  授权 URL: $OAUTH_URL\n"
    ((PASS++))
else
    echo -e "  ${RED}❌ 失败${NC}\n"
    ((FAIL++))
fi

# Mock OpenClaw 聊天测试
echo -e "${YELLOW}测试: Mock OpenClaw 聊天接口${NC}"
CHAT_RESPONSE=$(curl -s -X POST http://localhost:3002/chat \
    -H "Content-Type: application/json" \
    -d '{"message":"测试消息","session_id":"test-123"}')
CHAT_REPLY=$(echo $CHAT_RESPONSE | jq -r '.reply' 2>/dev/null)
if [[ $CHAT_REPLY == *"Mock OpenClaw"* ]]; then
    echo -e "  ${GREEN}✅ 通过${NC}"
    echo "  回复: ${CHAT_REPLY:0:50}...\n"
    ((PASS++))
else
    echo -e "  ${RED}❌ 失败${NC}\n"
    ((FAIL++))
fi

# 6. 数据库连接测试
echo -e "${BLUE}--- 数据库连接测试 ---${NC}\n"

echo -e "${YELLOW}测试: PostgreSQL 表结构${NC}"
TABLE_COUNT=$(docker exec opclaw-postgres-dev psql -U opclaw -d opclaw_dev -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | xargs)
if [[ $TABLE_COUNT -gt 0 ]]; then
    echo -e "  ${GREEN}✅ 通过${NC}"
    echo "  数据库表数量: $TABLE_COUNT\n"
    ((PASS++))
else
    echo -e "  ${RED}❌ 失败${NC}\n"
    ((FAIL++))
fi

# 7. 端口占用检查
echo -e "${BLUE}--- 端口占用检查 ---${NC}\n"

PORTS=(5173 3000 3001 3002 5432 6379)
PORT_NAMES=("前端" "后端API" "Mock飞书" "Mock OpenClaw" "PostgreSQL" "Redis")

for i in "${!PORTS[@]}"; do
    PORT=${PORTS[$i]}
    NAME=${PORT_NAMES[$i]}

    echo -e "${YELLOW}检查端口 $PORT ($NAME)${NC}"
    if lsof -i :$PORT > /dev/null 2>&1 || docker ps --format '{{.Ports}}' | grep -q ":$PORT" > /dev/null 2>&1; then
        echo -e "  ${GREEN}✅ 端口 $PORT 已占用${NC}\n"
        ((PASS++))
    else
        echo -e "  ${RED}⚠️  端口 $PORT 未占用${NC}\n"
        # 端口未占用不算失败，只是警告
    fi
done

# 8. 总结
echo -e "${BLUE}=== 测试总结 ===${NC}\n"
echo -e "通过: ${GREEN}$PASS${NC}"
echo -e "失败: ${RED}$FAIL${NC}"
echo ""

if [[ $FAIL -eq 0 ]]; then
    echo -e "${GREEN}🎉 所有测试通过！本地开发环境运行正常。${NC}\n"
    exit 0
else
    echo -e "${RED}⚠️  有 $FAIL 个测试失败，请检查服务状态。${NC}\n"
    exit 1
fi
