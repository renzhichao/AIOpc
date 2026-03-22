#!/usr/bin/env bash
#
# deploy-ciiber-tenant.sh - CIIBER 租户部署脚本
#
# 用途：在 CIIBER 服务器上部署完整的 OpenClaw 平台服务
#
# 使用方法：
#   ./scripts/deploy/deploy-ciiber-tenant.sh
#

set -euo pipefail

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

#==============================================================================
# Sudo 辅助函数 (Sudo Helper Function)
#==============================================================================

# 运行 sudo 命令，如果配置了 SUDO_PASSWORD 环境变量则使用它
# 使用方法: run_sudo command [args...]
run_sudo() {
    if [[ -n "${SUDO_PASSWORD:-}" ]]; then
        # 使用 -S 选项从标准输入读取密码
        echo "$SUDO_PASSWORD" | sudo -S "$@"
    else
        # 没有配置密码，直接调用 sudo（假设用户有免密码权限）
        run_sudo "$@"
    fi
}

# 配置
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
CONFIG_FILE="${PROJECT_ROOT}/config/tenants/CIIBER.yml"
SERVER_IP="113.105.103.165"
SSH_USER="openclaw"
SSH_PORT="20122"

# SSH key: 优先使用环境变量（CI环境），否则使用默认路径
if [[ -n "${SSH_KEY_PATH:-}" ]]; then
    SSH_KEY="${SSH_KEY_PATH/#\~/$HOME}"
else
    SSH_KEY="${HOME}/.ssh/ciiber_key"
fi

# 从配置文件读取密码（或使用环境变量覆盖）
DB_PASSWORD="${DB_PASSWORD:-TVqSqee4ZeirusJAcuUqXm5cBt2UBFx5}"
REDIS_PASSWORD="${REDIS_PASSWORD:-8wqP09459CRNAahiGHCn}"
JWT_SECRET="${JWT_SECRET:-StoSs7OeYmRwmxuBe8Lh50mRRGiYolDcTPY6HRvoPhD7rdaj8vHW1rE4Vp9VWQ4}"
FEISHU_ENCRYPT_KEY="${FEISHU_ENCRYPT_KEY:-DoZ9NxC523OFphRtNnPdHDjk3OUHtsNZ}"

# ⚠️ TEMPORARY: Enable DB_SYNC for quick migration validation
# TODO: Remove this after proper migration implementation
DB_SYNC="${DB_SYNC:-true}"

# Docker镜像配置 - 从环境变量读取（由GitHub Actions传递）
# 默认使用Docker Hub镜像，支持通过环境变量覆盖
BACKEND_TAG="${BACKEND_TAG:-renzhichao/opclaw-backend:latest}"
FRONTEND_TAG="${FRONTEND_TAG:-renzhichao/opclaw-frontend:latest}"
BACKEND_IMAGE="${BACKEND_IMAGE:-$BACKEND_TAG}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:-$FRONTEND_TAG}"

echo "使用镜像配置:"
echo "  Backend:  $BACKEND_IMAGE"
echo "  Frontend: $FRONTEND_IMAGE"

echo -e "${BLUE}=== CIIBER 租户部署脚本 ===${NC}"
echo ""

# SSH 辅助函数
ssh_exec() {
    ssh -i "${SSH_KEY}" \
        -p "${SSH_PORT}" \
        -o StrictHostKeyChecking=no \
        -o UserKnownHostsFile=/dev/null \
        -o IdentitiesOnly=yes \
        "${SSH_USER}@${SERVER_IP}" \
        "$1"
}

# 步骤 1: 检查 SSH 连接
echo -e "${YELLOW}步骤 1: 检查 SSH 连接...${NC}"
if ssh_exec "echo '✓ SSH 连接成功'" 2>/dev/null; then
    echo -e "${GREEN}✓ SSH 连接正常${NC}"
else
    echo -e "${RED}✗ SSH 连接失败${NC}"
    exit 1
fi
echo ""

# 步骤 2: 安装 Docker
echo -e "${YELLOW}步骤 2: 安装 Docker...${NC}"
ssh_exec "
    if ! command -v docker &> /dev/null; then
        echo '安装 Docker...'
        curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
        run_sudo sh /tmp/get-docker.sh
        run_sudo usermod -aG docker ${SSH_USER}
        echo '✓ Docker 安装完成'
    else
        echo '✓ Docker 已安装'
    fi
    docker --version
" || {
    echo -e "${RED}✗ Docker 安装失败${NC}"
    exit 1
}
echo ""

# 步骤 3: 创建部署目录结构
echo -e "${YELLOW}步骤 3: 创建部署目录结构...${NC}"
ssh_exec "
    run_sudo mkdir -p /opt/opclaw/platform
    run_sudo mkdir -p /opt/opclaw/data/postgres
    run_sudo mkdir -p /opt/opclaw/data/redis
    run_sudo mkdir -p /etc/opclaw
    run_sudo chown -R ${SSH_USER}:${SSH_USER} /opt/opclaw
    run_sudo chown -R ${SSH_USER}:${SSH_USER} /etc/opclaw
    echo '✓ 目录结构创建完成'
    ls -la /opt/opclaw/
"
echo ""

# 步骤 4: 创建 .env 文件
echo -e "${YELLOW}步骤 4: 创建环境配置文件...${NC}"

# Get Feishu credentials from environment (provided by CI workflow)
FEISHU_APP_ID_ENV="${FEISHU_APP_ID:-}"
FEISHU_APP_SECRET_ENV="${FEISHU_APP_SECRET:-}"

# Get DingTalk credentials from environment (provided by CI workflow)
DINGTALK_APP_KEY_ENV="${DINGTALK_APP_KEY:-}"
DINGTALK_APP_SECRET_ENV="${DINGTALK_APP_SECRET:-}"

ssh_exec "
    cat > /etc/opclaw/.env.production << 'ENV_EOF'
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=opclaw_ciiber
DB_USER=opclaw
DB_PASSWORD=${DB_PASSWORD}

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=${REDIS_PASSWORD}

# JWT Configuration
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=24h
JWT_ISSUER=CIIBER

# Feishu Configuration
FEISHU_APP_ID=${FEISHU_APP_ID_ENV}
FEISHU_APP_SECRET=${FEISHU_APP_SECRET_ENV}
FEISHU_ENCRYPT_KEY=${FEISHU_ENCRYPT_KEY}
FEISHU_OAUTH_REDIRECT_URI=http://113.105.103.165:20180/api/auth/feishu/callback

# DingTalk Configuration
DINGTALK_APP_KEY=${DINGTALK_APP_KEY_ENV}
DINGTALK_APP_SECRET=${DINGTALK_APP_SECRET_ENV}
DINGTALK_ENCRYPT_KEY=${DINGTALK_ENCRYPT_KEY}
DINGTALK_OAUTH_REDIRECT_URI=http://113.105.103.165:20180/api/auth/dingtalk/callback

# Multi-Platform OAuth Configuration
OAUTH_ENABLED_PLATFORMS=feishu,dingtalk

# Server Configuration
PORT=3000
NODE_ENV=production

# DeepSeek Configuration
DEEPSEEK_API_KEY=
DEEPSEEK_API_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
ENV_EOF

    chmod 600 /etc/opclaw/.env.production
    echo '✓ 环境配置文件创建完成'
    cat /etc/opclaw/.env.production
"
echo ""

# 步骤 5: 创建 docker-compose.yml
echo -e "${YELLOW}步骤 5: 创建 Docker Compose 配置...${NC}"
ssh_exec "
    cat > /opt/opclaw/platform/docker-compose.yml << 'COMPOSE_EOF'
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: opclaw-postgres
    environment:
      POSTGRES_DB: opclaw_ciiber
      POSTGRES_USER: opclaw
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - /opt/opclaw/data/postgres:/var/lib/postgresql/data
    ports:
      - \"5432:5432\"
    restart: unless-stopped
    healthcheck:
      test: [\"CMD-SHELL\", \"pg_isready -U opclaw\"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: opclaw-redis
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - /opt/opclaw/data/redis:/data
    ports:
      - \"6379:6379\"
    restart: unless-stopped
    healthcheck:
      test: [\"CMD\", \"redis-cli\", \"-a\", \"${REDIS_PASSWORD}\", \"ping\"]
      interval: 10s
      timeout: 5s
      retries: 5

networks:
  default:
    name: opclaw-network
COMPOSE_EOF

    echo '✓ Docker Compose 配置创建完成'
    cat /opt/opclaw/platform/docker-compose.yml
"
echo ""

# 步骤 6: 启动数据库服务
echo -e "${YELLOW}步骤 6: 启动数据库服务...${NC}"
ssh_exec "
    cd /opt/opclaw/platform
    docker compose up -d postgres redis
    echo '等待数据库启动...'
    sleep 10
    docker ps | grep -E 'postgres|redis'
    echo '✓ 数据库服务启动完成'
"
echo ""

# 步骤 7: 验证数据库连接
echo -e "${YELLOW}步骤 7: 验证数据库连接...${NC}"
ssh_exec "
    # 等待 PostgreSQL 就绪
    for i in {1..30}; do
        if docker exec opclaw-postgres pg_isready -U opclaw &> /dev/null; then
            echo '✓ PostgreSQL 就绪'
            break
        fi
        echo '等待 PostgreSQL 就绪...'
        sleep 2
    done

    # 测试连接
    docker exec opclaw-postgres psql -U opclaw -d opclaw_ciiber -c 'SELECT version();' || {
        echo '初始化数据库...'
        docker exec opclaw-postgres psql -U opclaw -d postgres -c \"CREATE DATABASE opclaw_ciiber;\"
        docker exec opclaw-postgres psql -U opclaw -d opclaw_ciiber -c 'SELECT version();'
    }

    # 验证 Redis
    if docker exec opclaw-redis redis-cli -a ${REDIS_PASSWORD} ping &> /dev/null; then
        echo '✓ Redis 就绪'
    else
        echo '✗ Redis 连接失败'
        exit 1
    fi
"
echo ""

# 步骤 8: 创建健康检查脚本
echo -e "${YELLOW}步骤 8: 创建健康检查脚本...${NC}"
ssh_exec "
    run_sudo tee /usr/local/bin/opclaw-health.sh > /dev/null << 'HEALTH_EOF'
#!/bin/bash
echo '=== OpenClaw 服务健康检查 ==='
echo ''
echo '=== Docker 容器状态 ==='
docker ps --filter 'name=opclaw' --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
echo ''
echo '=== PostgreSQL 连接测试 ==='
docker exec opclaw-postgres pg_isready -U opclaw || echo 'PostgreSQL 未就绪'
echo ''
echo '=== Redis 连接测试 ==='
docker exec opclaw-redis redis-cli -a ${REDIS_PASSWORD} ping || echo 'Redis 未就绪'
echo ''
echo '=== 后端 API 健康检查 ==='
curl -f http://localhost:3000/health || echo '后端 API 未就绪'
echo ''
echo '=== 前端服务检查 ==='
curl -f http://localhost/ || echo '前端服务未就绪'
echo ''
echo '=== 磁盘空间 ==='
df -h /opt/opclaw
HEALTH_EOF

    run_sudo chmod +x /usr/local/bin/opclaw-health.sh
    echo '✓ 健康检查脚本创建完成'
"
echo ""

# 步骤 9: 部署应用服务
echo -e "${YELLOW}步骤 9: 部署应用服务（前端 + 后端）...${NC}"

# Get GHCR credentials from environment
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
GITHUB_USERNAME="${GITHUB_USERNAME:-}"

# Get Feishu credentials from environment
FEISHU_APP_ID_ENV="${FEISHU_APP_ID:-}"
FEISHU_APP_SECRET_ENV="${FEISHU_APP_SECRET:-}"

# 9.1: 登录 GitHub Container Registry
echo -e "${YELLOW}  9.1: 登录 GitHub Container Registry...${NC}"
if [[ -n "${GITHUB_TOKEN}" ]]; then
    if [[ -n "${GITHUB_USERNAME}" ]]; then
        ssh_exec "echo \"${GITHUB_TOKEN}\" | docker login ghcr.io -u \"${GITHUB_USERNAME}\" --password-stdin" || {
            echo -e "${RED}✗ GHCR 登录失败${NC}"
            exit 1
        }
    else
        ssh_exec "echo \"${GITHUB_TOKEN}\" | docker login ghcr.io -u \${GITHUB_ACTOR:-github} --password-stdin" || {
            echo -e "${RED}✗ GHCR 登录失败${NC}"
            exit 1
        }
    fi
    echo -e "${GREEN}✓ GHCR 登录成功${NC}"
else
    echo -e "${YELLOW}⚠ 未提供 GITHUB_TOKEN，尝试拉取公开镜像...${NC}"
fi

# 9.2: 拉取后端镜像
echo -e "${YELLOW}  9.2: 拉取后端镜像 ${BACKEND_IMAGE}...${NC}"
ssh_exec "docker pull ${BACKEND_IMAGE}" || {
    echo -e "${RED}✗ 后端镜像拉取失败: ${BACKEND_IMAGE}${NC}"
    exit 1
}
echo -e "${GREEN}✓ 后端镜像拉取完成${NC}"

# 9.3: 拉取前端镜像
echo -e "${YELLOW}  9.3: 拉取前端镜像 ${FRONTEND_IMAGE}...${NC}"
ssh_exec "docker pull ${FRONTEND_IMAGE}" || {
    echo -e "${RED}✗ 前端镜像拉取失败: ${FRONTEND_IMAGE}${NC}"
    exit 1
}
echo -e "${GREEN}✓ 前端镜像拉取完成${NC}"

# 9.4: 拉取 Nginx 镜像
echo -e "${YELLOW}  9.4: 拉取 Nginx 镜像...${NC}"
ssh_exec "docker pull nginx:alpine" || {
    echo -e "${RED}✗ Nginx 镜像拉取失败${NC}"
    exit 1
}
echo -e "${GREEN}✓ Nginx 镜像拉取完成${NC}"

# 9.5: 创建 docker-compose .env 文件
echo -e "${YELLOW}  9.5: 创建 docker-compose .env 文件...${NC}"
ssh_exec "
    cat > /opt/opclaw/platform/.env << 'ENV_EOF'
DB_PASSWORD=${DB_PASSWORD}
REDIS_PASSWORD=${REDIS_PASSWORD}
JWT_SECRET=${JWT_SECRET}
FEISHU_ENCRYPT_KEY=${FEISHU_ENCRYPT_KEY}
FEISHU_APP_ID=${FEISHU_APP_ID_ENV}
FEISHU_APP_SECRET=${FEISHU_APP_SECRET_ENV}
FEISHU_OAUTH_REDIRECT_URI=http://113.105.103.165:20180/api/auth/feishu/callback
# ⚠️ TEMPORARY: Enable DB_SYNC for conversation tables auto-creation
DB_SYNC=true
ENV_EOF

    chmod 600 /opt/opclaw/platform/.env
    echo '✓ .env 文件创建完成'
    cat /opt/opclaw/platform/.env
" || {
    echo -e "${RED}✗ .env 文件创建失败${NC}"
    exit 1
}

# 9.6: 更新 docker-compose.yml
echo -e "${YELLOW}  9.6: 更新 docker-compose.yml...${NC}"
ssh_exec "
    cat > /opt/opclaw/platform/docker-compose.yml << COMPOSE_EOF
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: opclaw-postgres
    environment:
      POSTGRES_DB: opclaw_ciiber
      POSTGRES_USER: opclaw
      POSTGRES_PASSWORD: \\\${DB_PASSWORD}
    volumes:
      - /opt/opclaw/data/postgres:/var/lib/postgresql/data
    ports:
      - \"5432:5432\"
    restart: unless-stopped
    healthcheck:
      test: [\"CMD-SHELL\", \"pg_isready -U opclaw\"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - opclaw-network

  redis:
    image: redis:7-alpine
    container_name: opclaw-redis
    command: redis-server --requirepass \\\${REDIS_PASSWORD}
    volumes:
      - /opt/opclaw/data/redis:/data
    ports:
      - \"6379:6379\"
    restart: unless-stopped
    healthcheck:
      test: [\"CMD\", \"redis-cli\", \"-a\", \"\\\$REDIS_PASSWORD\", \"ping\"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - opclaw-network

  backend:
    image: ${BACKEND_IMAGE}
    container_name: opclaw-backend
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    env_file:
      - /etc/opclaw/.env.production
    environment:
      NODE_ENV: production
      PORT: 3000
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: opclaw_ciiber
      DB_USERNAME: opclaw
      DB_PASSWORD: \\\${DB_PASSWORD}
      DB_SYNC: \"true\"
      REDIS_HOST: redis
      REDIS_PORT: 6379
      REDIS_PASSWORD: \\\${REDIS_PASSWORD}
      FEISHU_APP_ID: \\\${FEISHU_APP_ID}
      FEISHU_APP_SECRET: \\\${FEISHU_APP_SECRET}
      FEISHU_ENCRYPT_KEY: \\\${FEISHU_ENCRYPT_KEY}
      FEISHU_REDIRECT_URI: \\\${FEISHU_OAUTH_REDIRECT_URI}
      DINGTALK_APP_KEY: \\\${DINGTALK_APP_KEY}
      DINGTALK_APP_SECRET: \\\${DINGTALK_APP_SECRET}
      DINGTALK_ENCRYPT_KEY: \\\${DINGTALK_ENCRYPT_KEY}
      DINGTALK_REDIRECT_URI: \\\${DINGTALK_OAUTH_REDIRECT_URI}
      OAUTH_ENABLED_PLATFORMS: \\\${OAUTH_ENABLED_PLATFORMS}
      JWT_SECRET: \\\${JWT_SECRET}
      JWT_EXPIRES_IN: 24h
      LOG_LEVEL: info
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    ports:
      - \"3000:3000\"
    healthcheck:
      test: [\"CMD\", \"wget\", \"--no-verbose\", \"--tries=1\", \"--spider\", \"http://localhost:3000/health\"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    networks:
      - opclaw-network

  frontend:
    image: ${FRONTEND_IMAGE}
    container_name: opclaw-frontend
    restart: unless-stopped
    depends_on:
      - backend
    # No port binding - only accessible via nginx
    expose:
      - \"5173\"
    healthcheck:
      test: [\"CMD\", \"wget\", \"--no-verbose\", \"--tries=1\", \"--spider\", \"http://localhost:5173/\"]
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - opclaw-network

  nginx:
    image: nginx:alpine
    container_name: opclaw-nginx
    restart: unless-stopped
    depends_on:
      - frontend
      - backend
    ports:
      - \"80:80\"
    volumes:
      - /opt/opclaw/platform/nginx.conf:/etc/nginx/nginx.conf:ro
    healthcheck:
      test: [\"CMD\", \"wget\", \"--no-verbose\", \"--tries=1\", \"--spider\", \"http://localhost/\"]
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - opclaw-network

networks:
  opclaw-network:
    driver: bridge
COMPOSE_EOF

    echo '✓ docker-compose.yml 更新完成'
" || {
    echo -e "${RED}✗ docker-compose.yml 更新失败${NC}"
    exit 1
}

# 9.7: 启动所有服务
echo -e "${YELLOW}  9.7: 启动所有服务...${NC}"
ssh_exec "
    cd /opt/opclaw/platform
    # Stop and remove existing containers that may have been started manually
    # (docker compose down only manages containers started by compose)
    echo '  → 停止现有容器...'
    docker stop opclaw-frontend opclaw-backend opclaw-nginx 2>/dev/null || true
    docker rm opclaw-frontend opclaw-backend opclaw-nginx 2>/dev/null || true

    # Stop compose-managed containers
    echo '  → 停止 compose 管理的容器...'
    docker compose down 2>/dev/null || true

    # Pull latest images
    echo '  → 拉取最新镜像...'
    docker compose pull

    # Start all services with fresh containers
    echo '  → 启动所有服务...'
    docker compose up -d
    echo '✓ 所有服务启动完成'
" || {
    echo -e "${RED}✗ 服务启动失败${NC}"
    exit 1
}

# 9.8: 等待服务就绪
echo -e "${YELLOW}  9.8: 等待服务就绪...${NC}"
ssh_exec "sleep 15" || {
    echo -e "${YELLOW}⚠ 等待服务启动时出现警告${NC}"
}

# 9.9: 验证服务状态
echo -e "${YELLOW}  9.9: 验证服务状态...${NC}"
ssh_exec "
    echo '=== Docker 容器状态 ==='
    docker ps --filter 'name=opclaw' --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
" || {
    echo -e "${YELLOW}⚠ 无法获取服务状态${NC}"
}

# 9.10: 验证端口监听
echo -e "${YELLOW}  9.10: 验证端口监听...${NC}"
ssh_exec "
    echo '检查 80 端口（前端）...'
    if netstat -tuln 2>/dev/null | grep ':80 ' > /dev/null || ss -tuln 2>/dev/null | grep ':80 ' > /dev/null; then
        echo '✓ 80 端口正在监听'
    else
        echo '⚠ 80 端口未监听'
    fi

    echo '检查 3000 端口（后端）...'
    if netstat -tuln 2>/dev/null | grep ':3000 ' > /dev/null || ss -tuln 2>/dev/null | grep ':3000 ' > /dev/null; then
        echo '✓ 3000 端口正在监听'
    else
        echo '⚠ 3000 端口未监听'
    fi
" || {
    echo -e "${YELLOW}⚠ 端口验证时出现警告${NC}"
}

echo -e "${GREEN}✓ 应用服务部署完成${NC}"
echo ""

# 步骤 10: 部署完成摘要
echo -e "${GREEN}=== CIIBER 租户部署完成 ===${NC}"
echo ""
echo "部署信息："
echo "  服务器: ${SERVER_IP}:${SSH_PORT}"
echo "  用户: ${SSH_USER}"
echo "  部署路径: /opt/opclaw/platform"
echo ""
echo "服务状态："
ssh_exec "docker ps --filter 'name=opclaw' --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
echo ""
echo "访问地址："
echo "  前端: http://${SERVER_IP}"
echo "  后端 API: http://${SERVER_IP}:3000"
echo ""
echo "健康检查："
echo "  SSH 登录后运行: opclaw-health.sh"
echo ""
echo "后续配置："
echo "  1. 提供 DeepSeek API Key（如需使用 AI 功能）"
echo "  2. 配置服务域名和 SSL 证书"
echo "  3. 配置反向代理（如需要）"
echo ""
echo -e "${GREEN}✓ 完整平台部署完成！（前端 + 后端 + 数据库）${NC}"
