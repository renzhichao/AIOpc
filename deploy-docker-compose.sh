#!/bin/bash

################################################################################
# AIOpc Docker Compose 一键部署脚本
#
# 功能：
# - 自动上传项目文件到服务器
# - 配置环境变量
# - 构建前端
# - 启动所有服务
# - 执行数据库迁移
#
# 使用方法：
#   ./deploy-docker-compose.sh [--skip-build] [--skip-upload]
################################################################################

set -e

# 配置
SERVER="root@118.25.0.190"
SSH_KEY="~/.ssh/rap001_opclaw"
REMOTE_DIR="/opt/opclaw"
LOCAL_DIR="/Users/arthurren/projects/AIOpc"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# 选项
SKIP_BUILD=false
SKIP_UPLOAD=false

# 解析参数
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --skip-upload)
            SKIP_UPLOAD=true
            shift
            ;;
        *)
            echo "未知选项: $1"
            echo "使用方法: $0 [--skip-build] [--skip-upload]"
            exit 1
            ;;
    esac
done

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}AIOpc Docker Compose 一键部署${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo "服务器: $SERVER"
echo "远程目录: $REMOTE_DIR"
echo "本地目录: $LOCAL_DIR"
echo "跳过构建: $SKIP_BUILD"
echo "跳过上传: $SKIP_UPLOAD"
echo -e "${CYAN}========================================${NC}"
echo ""

# SSH命令别名
ssh_exec() {
    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SERVER" "$@"
}

# 步骤1: 上传项目文件
if [ "$SKIP_UPLOAD" = false ]; then
    echo -e "${BLUE}[步骤 1/6]${NC} 上传项目文件到服务器..."

    echo "创建远程目录..."
    ssh_exec "mkdir -p $REMOTE_DIR/platform/frontend"
    ssh_exec "mkdir -p $REMOTE_DIR/platform/backend"
    ssh_exec "mkdir -p $REMOTE_DIR/config/nginx"
    ssh_exec "mkdir -p $REMOTE_DIR/ssl/certs"

    echo "同步项目文件..."
    rsync -avz --delete \
        --exclude 'node_modules' \
        --exclude 'dist' \
        --exclude '.git' \
        --exclude 'logs' \
        --exclude '*.log' \
        -e "ssh -i $SSH_KEY" \
        "$LOCAL_DIR/" "$SERVER:$REMOTE_DIR/"

    echo -e "${GREEN}✓${NC} 项目文件上传完成"
    echo ""
else
    echo -e "${YELLOW}[跳过]${NC} 项目文件上传"
    echo ""
fi

# 步骤2: 构建前端
if [ "$SKIP_BUILD" = false ]; then
    echo -e "${BLUE}[步骤 2/6]${NC} 构建前端应用..."

    cd "$LOCAL_DIR/platform/frontend"

    if [ ! -d "node_modules" ]; then
        echo "安装前端依赖..."
        pnpm install
    fi

    echo "构建前端..."
    pnpm run build

    echo "上传构建产物..."
    rsync -avz --delete \
        -e "ssh -i $SSH_KEY" \
        dist/ "$SERVER:$REMOTE_DIR/platform/frontend/"

    echo -e "${GREEN}✓${NC} 前端构建完成"
    echo ""
else
    echo -e "${YELLOW}[跳过]${NC} 前端构建"
    echo ""
fi

# 步骤3: 配置环境变量
echo -e "${BLUE}[步骤 3/6]${NC} 配置环境变量..."

if ! ssh_exec "[ -f $REMOTE_DIR/.env ]"; then
    echo "创建环境变量文件..."
    ssh_exec "cp $REMOTE_DIR/.env.production $REMOTE_DIR/.env"

    echo -e "${YELLOW}请手动编辑服务器上的环境变量文件：${NC}"
    echo "  ssh -i $SSH_KEY $SERVER"
    echo "  nano $REMOTE_DIR/.env"
    echo ""
    echo "  需要配置的项目："
    echo "  - POSTGRES_PASSWORD（数据库密码）"
    echo "  - REDIS_PASSWORD（Redis密码）"
    echo "  - FEISHU_APP_ID 和 FEISHU_APP_SECRET（飞书OAuth）"
    echo "  - DEEPSEEK_API_KEY（DeepSeek API）"
    echo "  - JWT_SECRET（JWT密钥）"
    echo ""
    read -p "按Enter继续（确保已配置环境变量）..."
fi

echo -e "${GREEN}✓${NC} 环境变量配置完成"
echo ""

# 步骤4: 创建必要的配置文件
echo -e "${BLUE}[步骤 4/6]${NC} 创建配置文件..."

# 创建Nginx配置
ssh_exec "cat > $REMOTE_DIR/config/nginx/nginx.conf << 'NGINX_EOF'
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    log_format main '\$remote_addr - \$remote_user [\$time_local] "\$request" '
                    '\$status \$body_bytes_sent "\$http_referer" '
                    '"\$http_user_agent" "\$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    client_max_body_size 20M;

    gzip on;
    gzip_disable "msie6";

    upstream backend {
        server backend:3000;
    }

    server {
        listen 80;
        server_name renava.cn www.renava.cn;

        location / {
            root /usr/share/nginx/html;
            try_files \$uri \$uri/ /index.html;
        }

        location /api/ {
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
            proxy_cache_bypass \$http_upgrade;
        }

        location /oauth/ {
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
        }
    }

    server {
        listen 443 ssl http2;
        server_name renava.cn www.renava.cn;

        ssl_certificate /etc/nginx/certs/fullchain.pem;
        ssl_certificate_key /etc/nginx/certs/privkey.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;
        ssl_prefer_server_ciphers on;

        location / {
            root /usr/share/nginx/html;
            try_files \$uri \$uri/ /index.html;
        }

        location /api/ {
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
            proxy_cache_bypass \$http_upgrade;
        }

        location /oauth/ {
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
        }
    }
}
NGINX_EOF"

echo -e "${GREEN}✓${NC} 配置文件创建完成"
echo ""

# 步骤5: 安装Docker Compose（如果需要）
echo -e "${BLUE}[步骤 5/6]${NC} 检查Docker Compose..."

if ! ssh_exec "which docker-compose || which docker"; then
    echo "安装Docker Compose..."
    ssh_exec "apt update && apt install -y docker-compose-plugin"
else
    echo "Docker Compose已安装"
fi

echo -e "${GREEN}✓${NC} Docker环境就绪"
echo ""

# 步骤6: 启动服务
echo -e "${BLUE}[步骤 6/6]${NC} 启动Docker Compose服务..."

echo "停止旧服务..."
ssh_exec "cd $REMOTE_DIR && docker-compose -f docker-compose.prod.yml down 2>/dev/null || true"

echo "启动新服务..."
ssh_exec "cd $REMOTE_DIR && docker-compose -f docker-compose.prod.yml up -d"

echo "等待服务启动..."
sleep 10

echo "查看服务状态..."
ssh_exec "cd $REMOTE_DIR && docker-compose -f docker-compose.prod.yml ps"

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${GREEN}部署完成！${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo "服务访问地址："
echo "  前端: http://118.25.0.190"
echo "  后端API: http://118.25.0.190/api"
echo "  健康检查: http://118.25.0.190/api/health"
echo ""
echo "常用命令："
echo "  查看日志: ssh -i $SSH_KEY $SERVER 'cd $REMOTE_DIR && docker-compose -f docker-compose.prod.yml logs -f'"
echo "  重启服务: ssh -i $SSH_KEY $SERVER 'cd $REMOTE_DIR && docker-compose -f docker-compose.prod.yml restart'"
echo "  停止服务: ssh -i $SSH_KEY $SERVER 'cd $REMOTE_DIR && docker-compose -f docker-compose.prod.yml down'"
echo ""
echo "下一步："
echo "  1. 配置SSL证书（参考 SSL_SETUP.md）"
echo "  2. 验证所有服务正常运行"
echo "  3. 执行验收测试"
echo ""
