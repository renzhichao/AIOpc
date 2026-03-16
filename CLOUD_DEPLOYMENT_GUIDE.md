# AIOpc 云端部署指南

## 🚀 快速开始

本指南将帮助您将 AIOpc 平台部署到云端服务器（腾讯云/阿里云）。

## 📋 前置要求

### 服务器要求
- **操作系统**: Ubuntu 20.04+ 或 CentOS 7+
- **CPU**: 最少 2 核
- **内存**: 最少 4GB RAM
- **存储**: 最少 40GB SSD
- **网络**: 公网 IP，开放端口 80, 443, 3000, 3001

### 本地要求
- Git 客户端
- SSH 访问权限
- 域名（可选，用于 HTTPS）

## 📦 部署步骤

### 第一步：连接到服务器

```bash
# SSH 连接到您的服务器
ssh root@your-server-ip

# 或使用密钥
ssh -i /path/to/your/key.pem root@your-server-ip
```

### 第二步：安装 Docker 和 Docker Compose

```bash
# 更新系统
apt update && apt upgrade -y

# 安装 Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# 启动 Docker
systemctl start docker
systemctl enable docker

# 安装 Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# 验证安装
docker --version
docker-compose --version
```

### 第三步：克隆代码仓库

```bash
# 安装 Git
apt install git -y

# 克隆仓库
cd /opt
git clone https://github.com/renzhichao/AIOpc.git
cd AIOpc

# 切换到部署分支
git checkout feature/mvp-core-closed-loop
```

### 第四步：配置环境变量

```bash
# 复制环境变量模板
cp .env.production .env

# 编辑环境变量（重要！）
nano .env
```

**必须修改的配置项**:

```bash
# 数据库密码（请使用强密码）
POSTGRES_PASSWORD=your-strong-password-here

# Redis 密码
REDIS_PASSWORD=your-strong-password-here

# JWT 密钥（至少32个字符）
JWT_SECRET=your-very-secure-jwt-secret-key-here

# Feishu OAuth 配置（从 https://open.feishu.cn/app 获取）
FEISHU_APP_ID=cli_your_app_id
FEISHU_APP_SECRET=your_app_secret
FEISHU_REDIRECT_URI=https://your-domain.com/oauth/callback

# DeepSeek API 密钥
DEEPSEEK_API_KEY=sk-your-deepseek-api-key

# CORS 配置（修改为您的域名）
CORS_ALLOWED_ORIGINS=https://your-domain.com
```

### 第五步：配置 SSL 证书（可选但推荐）

#### 方案 A：使用 Let's Encrypt（免费）

```bash
# 安装 Certbot
apt install certbot python3-certbot-nginx -y

# 获取证书
certbot certonly --standalone -d your-domain.com

# 证书路径
# /etc/letsencrypt/live/your-domain.com/fullchain.pem
# /etc/letsencrypt/live/your-domain.com/privkey.pem
```

#### 方案 B：使用自签名证书（开发测试）

```bash
# 创建 SSL 目录
mkdir -p ssl/certs

# 生成自签名证书
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout ssl/certs/key.pem \
  -out ssl/certs/cert.pem \
  -subj "/CN=your-domain.com"
```

### 第六步：启动服务

```bash
# 构建并启动所有服务
docker-compose -f docker-compose.prod.yml up -d --build

# 查看服务状态
docker-compose -f docker-compose.prod.yml ps

# 查看日志
docker-compose -f docker-compose.prod.yml logs -f
```

### 第七步：验证部署

```bash
# 检查后端健康状态
curl http://localhost:3000/health

# 检查前端（如果使用 Nginx）
curl http://localhost/

# 查看所有容器状态
docker ps
```

## 🔧 配置说明

### 服务端口

| 服务 | 端口 | 说明 |
|------|------|------|
| Frontend (Nginx) | 80, 443 | HTTP/HTTPS |
| Backend API | 3000 | REST API |
| WebSocket Gateway | 3001 | WebSocket 连接 |
| PostgreSQL | 5432 | 数据库 |
| Redis | 6379 | 缓存 |

### 数据持久化

所有数据存储在 Docker volumes 中：

```bash
# 查看卷列表
docker volume ls | grep opclaw

# 备份数据库
docker exec opclaw-postgres pg_dump -U opclaw opclaw | gzip > backup_$(date +%Y%m%d).sql.gz

# 备份 Redis
docker exec opclaw-redis redis-cli --rdb /data/dump_$(date +%Y%m%d).rdb
```

## 🛠️ 常用命令

### 服务管理

```bash
# 启动服务
docker-compose -f docker-compose.prod.yml up -d

# 停止服务
docker-compose -f docker-compose.prod.yml down

# 重启服务
docker-compose -f docker-compose.prod.yml restart

# 查看日志
docker-compose -f docker-compose.prod.yml logs -f backend

# 进入容器
docker exec -it opclaw-backend sh
docker exec -it opclaw-postgres psql -U opclaw
```

### 更新部署

```bash
# 拉取最新代码
git pull origin feature/mvp-core-closed-loop

# 重新构建并启动
docker-compose -f docker-compose.prod.yml up -d --build

# 清理旧镜像
docker image prune -a
```

## 🔍 故障排查

### 服务无法启动

```bash
# 查看详细日志
docker-compose -f docker-compose.prod.yml logs backend

# 检查容器状态
docker ps -a

# 检查网络
docker network ls
docker network inspect aiopcnetwork_opclaw-network
```

### 数据库连接失败

```bash
# 检查 PostgreSQL 容器
docker exec -it opclaw-postgres psql -U opclaw -d opclaw

# 检查数据库日志
docker logs opclaw-postgres
```

### Redis 连接失败

```bash
# 测试 Redis 连接
docker exec -it opclaw-redis redis-cli -a your_password ping

# 查看 Redis 日志
docker logs opclaw-redis
```

## 📊 监控和维护

### 健康检查

```bash
# 后端健康检查
curl http://localhost:3000/health

# 数据库健康检查
docker exec opclaw-postgres pg_isready -U opclaw

# Redis 健康检查
docker exec opclaw-redis redis-cli ping
```

### 日志管理

```bash
# 查看实时日志
docker-compose -f docker-compose.prod.yml logs -f --tail=100

# 导出日志
docker-compose -f docker-compose.prod.yml logs > deployment.log

# 清理旧日志
docker system prune -a
```

## 🔒 安全建议

1. **修改所有默认密码**
2. **配置防火墙** (ufw 或 firewalld)
3. **启用 HTTPS** (使用 Let's Encrypt)
4. **定期备份数据**
5. **限制 SSH 访问** (使用密钥认证)
6. **保持系统更新**

```bash
# 配置防火墙
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw enable
```

## 📞 技术支持

如遇到问题，请查看：
- 项目文档: `/docs` 目录
- GitHub Issues: https://github.com/renzhichao/AIOpc/issues
- 服务器日志: `docker-compose logs`

## 🎉 下一步

部署完成后，您可以：

1. 访问 `http://your-server-ip` 或 `https://your-domain.com`
2. 使用 Feishu 扫码登录
3. 创建和管理 AI 实例
4. 开始使用聊天功能

祝您使用愉快！
