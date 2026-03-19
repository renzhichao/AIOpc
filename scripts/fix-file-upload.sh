#!/bin/bash

# AIOpc Platform - 文件上传功能修复脚本
# 修复Nginx配置以支持文件上传

set -e

echo "🔧 开始修复文件上传功能..."

# 配置变量
SERVER="root@118.25.0.190"
SSH_KEY="~/.ssh/rap001_opclaw"
REMOTE_DIR="/opt/opclaw"
NGINX_CONF_SRC="./platform/nginx/nginx-simple.conf"
NGINX_CONF_DST="${REMOTE_DIR}/platform/nginx/nginx-simple.conf"

# 1. 上传修复后的nginx配置
echo "📤 上传nginx配置到服务器..."
scp -i "${SSH_KEY}" "${NGINX_CONF_SRC}" "${SERVER}:${NGINX_CONF_DST}"

# 2. 备份当前nginx配置
echo "💾 备份当前nginx配置..."
ssh -i "${SSH_KEY}" "${SERVER}" << 'ENDSSH'
cp /opt/opclaw/platform/nginx/nginx.conf /opt/opclaw/platform/nginx/nginx.conf.backup.$(date +%s)
ENDSSH

# 3. 应用新的nginx配置
echo "🔄 应用新的nginx配置..."
ssh -i "${SSH_KEY}" "${SERVER}" << 'ENDSSH'
# 停止nginx容器
docker stop opclaw-nginx

# 更新nginx配置
cp /opt/opclaw/platform/nginx/nginx-simple.conf /opt/opclaw/platform/nginx/nginx.conf

# 重启nginx容器
docker start opclaw-nginx

# 等待nginx启动
sleep 3

# 验证nginx配置
docker exec opclaw-nginx nginx -t

# 检查nginx状态
docker ps | grep opclaw-nginx

echo "✅ Nginx配置已更新"
ENDSSH

# 4. 验证修复
echo "🔍 验证修复..."
ssh -i "${SSH_KEY}" "${SERVER}" << 'ENDSSH'
# 检查nginx配置中的文件上传限制
echo "检查nginx文件上传配置:"
docker exec opclaw-nginx grep -E "client_max_body_size|proxy_buffering" /etc/nginx/nginx.conf

# 检查后端multer配置
echo ""
echo "检查后端服务状态:"
docker ps | grep opclaw-backend
ENDSSH

echo ""
echo "✅ 文件上传功能修复完成!"
echo ""
echo "📋 修复内容:"
echo "  - Nginx文件上传大小限制: 10MB"
echo "  - 禁用代理缓冲以支持大文件上传"
echo "  - 增加超时时间到60秒"
echo ""
echo "🧪 测试步骤:"
echo "  1. 访问 http://118.25.0.190 或 http://renava.cn"
echo "  2. 在聊天界面点击附件图标"
echo "  3. 选择一个小于10MB的文件上传"
echo "  4. 检查是否成功上传并显示预览"
echo ""
