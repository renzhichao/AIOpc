#!/bin/bash

# 测试脚本：远程 OpenClaw Agent 注册和通信
# 使用方法：bash test-remote-agent-registration.sh

set -e

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 配置
PLATFORM_URL="http://118.25.0.190"
PLATFORM_API_PORT="3000"
PLATFORM_WS_PORT="3002"
REMOTE_HOST="101.34.254.52"
REMOTE_SSH_KEY="~/.ssh/aiopclaw_remote_agent"

echo "=========================================="
echo "  远程 OpenClaw Agent 测试脚本"
echo "=========================================="
echo ""

# 测试 1: 检查平台 API 状态
echo -e "${YELLOW}[测试 1]${NC} 检查平台 API 状态..."
if curl -s -o /dev/null -w "HTTP %{http_code}\n" "${PLATFORM_URL}:${PLATFORM_API_PORT}/health" | grep -q "200\|302"; then
    echo -e "${GREEN}✓${NC} 平台 API 运行正常"
    PLATFORM_API_RUNNING=true
else
    echo -e "${RED}✗${NC} 平台 API 无法访问"
    echo "  请先启动平台服务："
    echo "  ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190"
    echo "  cd /path/to/AIOpc/platform/backend && npm start"
    PLATFORM_API_RUNNING=false
fi
echo ""

# 测试 2: 检查远程服务器连接
echo -e "${YELLOW}[测试 2]${NC} 检查远程服务器连接..."
if ssh -i "${REMOTE_SSH_KEY}" -o ConnectTimeout=5 root@${REMOTE_HOST} "echo 'Connected'" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} 远程服务器连接成功"
else
    echo -e "${RED}✗${NC} 无法连接到远程服务器 ${REMOTE_HOST}"
    exit 1
fi
echo ""

# 测试 3: 检查远程 Agent 服务状态
echo -e "${YELLOW}[测试 3]${NC} 检查远程 Agent 服务状态..."
AGENT_STATUS=$(ssh -i "${REMOTE_SSH_KEY}" root@${REMOTE_HOST} "systemctl is-active openclaw-agent" 2>/dev/null || echo "unknown")
if [ "$AGENT_STATUS" = "active" ]; then
    echo -e "${GREEN}✓${NC} Agent 服务运行中"
else
    echo -e "${YELLOW}⚠${NC} Agent 服务状态: ${AGENT_STATUS}"
    echo "  尝试启动服务..."
    ssh -i "${REMOTE_SSH_KEY}" root@${REMOTE_HOST} "systemctl start openclaw-agent"
    sleep 3
fi
echo ""

# 测试 4: 检查 Agent 日志中的注册信息
echo -e "${YELLOW}[测试 4]${NC} 检查 Agent 注册状态..."
CREDENTIALS=$(ssh -i "${REMOTE_SSH_KEY}" root@${REMOTE_HOST} "cat /etc/openclaw-agent/credentials.json 2>/dev/null" || echo "")
if [ -n "$CREDENTIALS" ]; then
    echo -e "${GREEN}✓${NC} 找到注册凭证"
    INSTANCE_ID=$(echo "$CREDENTIALS" | grep -o '"instanceId":"[^"]*"' | cut -d'"' -f4)
    echo "  Instance ID: ${INSTANCE_ID:0:50}..."
else
    echo -e "${YELLOW}⚠${NC} 未找到注册凭证"
    echo "  Agent 可能尚未成功注册"
fi
echo ""

# 测试 5: 查看 Agent 日志
echo -e "${YELLOW}[测试 5]${NC} 查看 Agent 最近日志..."
echo "-----------------------------------"
ssh -i "${REMOTE_SSH_KEY}" root@${REMOTE_HOST} "tail -20 /var/log/openclaw-agent.log" 2>/dev/null || echo "无法读取日志"
echo "-----------------------------------"
echo ""

# 测试 6: 检查网络连通性
echo -e "${YELLOW}[测试 6]${NC} 检查远程服务器到平台的网络连通性..."
if [ "$PLATFORM_API_RUNNING" = true ]; then
    CONNECTIVITY=$(ssh -i "${REMOTE_SSH_KEY}" root@${REMOTE_HOST} \
        "curl -s -o /dev/null -w '%{http_code}' ${PLATFORM_URL}:${PLATFORM_API_PORT}/health" 2>/dev/null || echo "000")
    if [ "$CONNECTIVITY" = "200" ] || [ "$CONNECTIVITY" = "302" ]; then
        echo -e "${GREEN}✓${NC} 远程服务器可以访问平台 API"
    else
        echo -e "${RED}✗${NC} 远程服务器无法访问平台 API (HTTP ${CONNECTIVITY})"
        echo "  请检查防火墙和网络配置"
    fi
else
    echo -e "${YELLOW}⚠${NC} 跳过网络测试（平台 API 未运行）"
fi
echo ""

# 测试 7: 验证数据库记录（需要平台运行）
if [ "$PLATFORM_API_RUNNING" = true ] && [ -n "$INSTANCE_ID" ]; then
    echo -e "${YELLOW}[测试 7]${NC} 验证数据库记录..."
    echo "  Instance ID: ${INSTANCE_ID}"
    # 这里可以添加数据库查询命令
    # ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 "psql -U postgres -d aiopcn -c \"SELECT * FROM instances WHERE instance_id = '${INSTANCE_ID}';\""
    echo "  (需要手动验证数据库记录)"
    echo ""
fi

# 总结
echo "=========================================="
echo "  测试总结"
echo "=========================================="
echo ""
echo "状态:"
[ "$PLATFORM_API_RUNNING" = true ] && echo -e "  平台 API: ${GREEN}运行中${NC}" || echo -e "  平台 API: ${RED}未运行${NC}"
[ "$AGENT_STATUS" = "active" ] && echo -e "  Agent 服务: ${GREEN}运行中${NC}" || echo -e "  Agent 服务: ${YELLOW}${AGENT_STATUS}${NC}"
[ -n "$INSTANCE_ID" ] && echo -e "  注册状态: ${GREEN}已注册${NC}" || echo -e "  注册状态: ${RED}未注册${NC}"
echo ""

echo "下一步操作:"
if [ "$PLATFORM_API_RUNNING" = false ]; then
    echo "  1. 启动平台服务"
    echo "  2. 重新运行此测试脚本"
else
    echo "  1. 查看 Agent 日志: tail -f /var/log/openclaw-agent.log"
    echo "  2. 查看平台日志验证连接"
    echo "  3. 测试命令推送功能"
fi
echo ""

echo "常用命令:"
echo "  # 查看 Agent 状态"
echo "  ssh -i ${REMOTE_SSH_KEY} root@${REMOTE_HOST} systemctl status openclaw-agent"
echo ""
echo "  # 查看 Agent 日志"
echo "  ssh -i ${REMOTE_SSH_KEY} root@${REMOTE_HOST} tail -f /var/log/openclaw-agent.log"
echo ""
echo "  # 重启 Agent"
echo "  ssh -i ${REMOTE_SSH_KEY} root@${REMOTE_HOST} systemctl restart openclaw-agent"
echo ""
echo "  # 查看 systemd 日志"
echo "  ssh -i ${REMOTE_SSH_KEY} root@${REMOTE_HOST} journalctl -u openclaw-agent -f"
echo ""
