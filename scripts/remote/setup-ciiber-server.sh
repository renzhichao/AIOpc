#!/opt/homebrew/bin/bash
#
# setup-ciiber-server.sh - CIIBER 服务器连接和初始化脚本
#
# 用途：在服务器 SSH 升级后，快速建立连接并进行初始化配置
#

set -euo pipefail

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置
SERVER_IP="113.105.103.165"
SSH_USER="openclaw"
SSH_KEY_PATH="${HOME}/.ssh/ciiber_key"
CONFIG_FILE="${PWD}/config/tenants/CIIBER.yml"

echo -e "${BLUE}=== CIIBER 服务器连接和初始化脚本 ===${NC}"
echo ""

# 步骤 1: 检查本地 SSH 密钥
echo -e "${YELLOW}步骤 1: 检查本地 SSH 密钥...${NC}"
if [[ -f "${SSH_KEY_PATH}" ]]; then
    echo -e "${GREEN}✓ SSH 密钥已存在: ${SSH_KEY_PATH}${NC}"
    read -p "是否要重新生成密钥？(y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "生成新的 SSH 密钥对..."
        ssh-keygen -t ed25519 -f "${SSH_KEY_PATH}" -C "ciiber@${SERVER_IP}" -N ""
        echo -e "${GREEN}✓ 新密钥已生成${NC}"
    fi
else
    echo "生成 SSH 密钥对..."
    ssh-keygen -t ed25519 -f "${SSH_KEY_PATH}" -C "ciiber@${SERVER_IP}" -N ""
    echo -e "${GREEN}✓ SSH 密钥已生成: ${SSH_KEY_PATH}${NC}"
fi
echo ""

# 步骤 2: 测试 SSH 连接
echo -e "${YELLOW}步骤 2: 测试 SSH 连接...${NC}"
echo "尝试连接到 ${SSH_USER}@${SERVER_IP}..."

if ssh -i "${SSH_KEY_PATH}" \
    -o StrictHostKeyChecking=no \
    -o UserKnownHostsFile=/dev/null \
    -o ConnectTimeout=10 \
    "${SSH_USER}@${SERVER_IP}" \
    "echo '连接成功！' && whoami && pwd" 2>/dev/null; then

    echo -e "${GREEN}✓ SSH 连接成功！${NC}"
else
    echo -e "${RED}✗ SSH 连接失败${NC}"
    echo ""
    echo -e "${YELLOW}可能的原因：${NC}"
    echo "1. 服务器 SSH 密钥未升级（短密钥被现代 SSH 客户端拒绝）"
    echo "2. 公钥未部署到服务器"
    echo ""
    echo -e "${YELLOW}解决方案：${NC}"
    echo ""
    echo "【方案 1】如果服务器 SSH 已升级，部署公钥："
    echo "  ssh-copy-id -i ${SSH_KEY_PATH}.pub ${SSH_USER}@${SERVER_IP}"
    echo ""
    echo "【方案 2】如果服务器 SSH 未升级，提供升级脚本给管理员："
    cat << 'SERVER_SCRIPT'
#!/bin/bash
# === 服务器端 SSH 升级脚本 ===

sudo cp -r /etc/ssh /etc/ssh.backup.$(date +%Y%m%d)
sudo ssh-keygen -t rsa -b 4096 -f /etc/ssh/ssh_host_rsa_key -N ""
sudo ssh-keygen -t ed25519 -f /etc/ssh/ssh_host_ed25519_key -N ""
sudo systemctl restart sshd
SERVER_SCRIPT
    echo ""
    exit 1
fi
echo ""

# 步骤 3: 部署公钥到服务器
read -p "是否要将公钥部署到服务器？(y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "部署公钥..."
    ssh-copy-id -i "${SSH_KEY_PATH}.pub" "${SSH_USER}@${SERVER_IP}"
    echo -e "${GREEN}✓ 公钥已部署${NC}"
fi
echo ""

# 步骤 4: 检查服务器环境
echo -e "${YELLOW}步骤 4: 检查服务器环境...${NC}"
ssh -i "${SSH_KEY_PATH}" \
    -o StrictHostKeyChecking=no \
    -o UserKnownHostsFile=/dev/null \
    "${SSH_USER}@${SERVER_IP}" << 'REMOTE_SCRIPT'
echo "=== 系统信息 ==="
uname -a
echo ""
echo "=== 磁盘空间 ==="
df -h /opt
echo ""
echo "=== Docker 版本 ==="
docker --version 2>/dev/null || echo "Docker 未安装"
echo ""
echo "=== Docker Compose 版本 ==="
docker compose version 2>/dev/null || docker-compose --version 2>/dev/null || echo "Docker Compose 未安装"
echo ""
echo "=== Node.js 版本 ==="
node --version 2>/dev/null || echo "Node.js 未安装"
echo ""
echo "=== pnpm 版本 ==="
pnpm --version 2>/dev/null || echo "pnpm 未安装"
echo ""
echo "=== PostgreSQL 状态 ==="
docker ps | grep postgres || echo "PostgreSQL 容器未运行"
echo ""
echo "=== Redis 状态 ==="
docker ps | grep redis || echo "Redis 容器未运行"
echo ""
echo "=== /opt 目录结构 ==="
ls -la /opt/ 2>/dev/null || echo "/opt 目录不存在"
REMOTE_SCRIPT
echo ""

# 步骤 5: 检查部署目录
echo -e "${YELLOW}步骤 5: 检查部署目录...${NC}"
DEPLOY_PATH="/opt/opclaw"
ssh -i "${SSH_KEY_PATH}" \
    -o StrictHostKeyChecking=no \
    -o UserKnownHostsFile=/dev/null \
    "${SSH_USER}@${SERVER_IP}" \
    "test -d ${DEPLOY_PATH} && echo '✓ 部署目录存在' || echo '✗ 部署目录不存在'"
echo ""

# 步骤 6: 测试 sudo 权限
echo -e "${YELLOW}步骤 6: 测试 sudo 权限...${NC}"
if ssh -i "${SSH_KEY_PATH}" \
    -o StrictHostKeyChecking=no \
    -o UserKnownHostsFile=/dev/null \
    "${SSH_USER}@${SERVER_IP}" \
    "sudo whoami" 2>/dev/null; then
    echo -e "${GREEN}✓ 有 sudo 权限${NC}"
else
    echo -e "${YELLOW}⚠ 无 sudo 权限（部署时可能需要输入密码）${NC}"
fi
echo ""

# 步骤 7: 显示下一步操作
echo -e "${BLUE}=== 下一步操作 ===${NC}"
echo ""
echo "1. 验证配置文件："
echo "   ./scripts/tenant/validate.sh CIIBER"
echo ""
echo "2. 安全检查："
echo "   ./scripts/security/security-check-suite.sh config/tenants/CIIBER.yml"
echo ""
echo "3. 执行部署："
echo "   ./scripts/deploy/deploy-tenant.sh config/tenants/CIIBER.yml"
echo ""
echo "4. 健康检查："
echo "   ./scripts/tenant/health-check.sh CIIBER"
echo ""
echo -e "${GREEN}=== 服务器连接配置完成 ===${NC}"
