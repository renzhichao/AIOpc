#!/opt/homebrew/bin/bash
#
# diagnose-remote-server.sh - 诊断远程服务器SSH配置
#
# 用途：当SSH密钥兼容性问题时，帮助诊断服务器状态
#

set -euo pipefail

SERVER_IP="${1:-113.105.103.165}"
SSH_USER="${2:-root}"
SSH_PORT="${3:-22}"

echo "=== 诊断远程服务器: ${SERVER_IP}:${SSH_PORT} ==="
echo ""

# 1. 检查端口是否开放
echo "1. 检查端口 ${SSH_PORT} 是否开放..."
if command -v nc &> /dev/null; then
    if nc -z -w 3 "${SERVER_IP}" "${SSH_PORT}" 2>/dev/null; then
        echo "✅ 端口 ${SSH_PORT} 可访问"
    else
        echo "❌ 端口 ${SSH_PORT} 无法访问"
        exit 1
    fi
else
    echo "⚠️  nc 命令不可用，跳过端口检查"
fi
echo ""

# 2. 尝试获取 SSH banner
echo "2. 尝试获取 SSH banner..."
if command -v timeout &> /dev/null; then
    BANNER=$(timeout 3 bash -c "echo '' | nc ${SERVER_IP} ${SSH_PORT}" 2>/dev/null | head -1)
    if [[ -n "${BANNER}" ]]; then
        echo "✅ SSH Banner: ${BANNER}"
    else
        echo "⚠️  无法获取 SSH banner"
    fi
else
    echo "⚠️  timeout 命令不可用，跳过 banner 检查"
fi
echo ""

# 3. 输出推荐的 SSH 连接命令
echo "3. 推荐的连接测试命令："
echo ""
echo "# 使用密码认证（交互式输入密码）："
echo "ssh -o PreferredAuthentications=password \
    -o PubkeyAuthentication=no \
    ${SSH_USER}@${SERVER_IP}"
echo ""
echo "# 或者尝试所有可用的认证方式："
echo "ssh -o PreferredAuthentications=publickey,password,keyboard-interactive \
    ${SSH_USER}@${SERVER_IP}"
echo ""

# 4. 提供服务器端需要执行的升级命令
echo "4. 服务器端需要执行的升级命令（请提供给服务器管理员）："
echo ""
cat << 'SERVER_SCRIPT'
# === 服务器端升级 SSH 密钥脚本 ===

# 备份现有配置
sudo cp -r /etc/ssh /etc/ssh.backup.$(date +%Y%m%d)

# 生成新的 SSH 主机密钥
sudo ssh-keygen -t rsa -b 4096 -f /etc/ssh/ssh_host_rsa_key -N ""
sudo ssh-keygen -t ed25519 -f /etc/ssh/ssh_host_ed25519_key -N ""

# 更新 SSH 配置
sudo bash -c 'cat >> /etc/ssh/sshd_config << "EOF"

# 现代密钥类型
HostKey /etc/ssh/ssh_host_rsa_key
HostKey /etc/ssh/ssh_host_ed25519_key

# 推荐的安全设置
Protocol 2
PermitRootLogin yes
PasswordAuthentication yes
PubkeyAuthentication yes
EOF'

# 重启 SSH 服务
sudo systemctl restart sshd
# 或: sudo service ssh restart
SERVER_SCRIPT
echo ""

# 5. 常见SSH用户名列表
echo "5. 常见的 SSH 用户名（可尝试）："
for user in root openclaw admin ubuntu centos; do
    echo "   - ${user}"
done
echo ""

# 6. 下一步操作建议
echo "6. 下一步操作："
echo "   a) 将上述升级脚本提供给服务器管理员执行"
echo "   b) 等待服务器重启 SSH 服务"
echo "   c) 使用以下命令测试连接："
echo "      ssh ${SSH_USER}@${SERVER_IP}"
echo "   d) 连接成功后，可以继续配置 OpenClaw 服务"
echo ""

# 7. 检查本地 SSH 配置
echo "7. 检查本地 ~/.ssh/config 配置..."
if [[ -f ~/.ssh/config ]]; then
    echo "✅ 本地 SSH 配置文件存在"
    echo ""
    echo "建议添加以下配置到 ~/.ssh/config："
    echo ""
    cat << SSH_CONFIG
Host ${SERVER_IP}
    HostName ${SERVER_IP}
    User ${SSH_USER}
    Port ${SSH_PORT}
    ServerAliveInterval 60
    ServerAliveCountMax 3
SSH_CONFIG
else
    echo "⚠️  本地 SSH 配置文件不存在，可以创建以简化连接"
fi
echo ""
