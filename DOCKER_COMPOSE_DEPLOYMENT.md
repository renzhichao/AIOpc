# AIOpc Docker Compose 部署指南

## 🎯 快速开始

### 前置要求

- ✅ Docker 已安装（已验证：v27.5.1）
- ✅ 服务器可以访问互联网
- ✅ SSH密钥访问已配置

### 一键部署步骤

```bash
# 1. 在服务器上创建项目目录
mkdir -p /opt/opclaw
cd /opt/opclaw

# 2. 上传项目文件（在本地执行）
# 从本地Mac上传项目到服务器
cd /Users/arthurren/projects/AIOpc
rsync -avz --exclude 'node_modules' --exclude 'dist' --exclude '.git' \
  -e "ssh -i ~/.ssh/rap001_opclaw" \
  . root@118.25.0.190:/opt/opclaw/

# 3. 配置环境变量（在服务器上执行）
cd /opt/opclaw
cp .env.production .env
nano .env
# 修改所有密码和密钥

# 4. 构建前端（在本地执行，因为服务器没有Node.js）
cd /Users/arthurren/projects/AIOpc/platform/frontend
pnpm install
pnpm run build

# 5. 上传构建产物到服务器
rsync -avz dist/ \
  -e "ssh -i ~/.ssh/rap001_opclaw" \
  root@118.25.0.190:/opt/opclaw/platform/frontend/

# 6. 启动服务（在服务器上执行）
cd /opt/opclaw
docker-compose -f docker-compose.prod.yml up -d

# 7. 查看服务状态
docker-compose -f docker-compose.prod.yml ps
docker-compose -f docker-compose.prod.yml logs -f
```

---

## 📋 详细配置说明

### 1. 环境变量配置

编辑 `.env` 文件，配置以下关键项：

```bash
# 数据库密码（强密码）
POSTGRES_PASSWORD=YourStrongDBPassword123!

# Redis密码（强密码）
REDIS_PASSWORD=YourStrongRedisPassword123!

# Feishu OAuth（从飞书开放平台获取）
FEISHU_APP_ID=cli_xxxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxx

# DeepSeek API Key（从DeepSeek平台获取）
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx

# JWT密钥（32字符以上）
JWT_SECRET=$(openssl rand -base64 32)
```

### 2. Docker Compose服务说明

| 服务 | 容器名 | 端口 | 说明 |
|------|--------|------|------|
| postgres | opclaw-postgres | 5432 | PostgreSQL 16数据库 |
| redis | opclaw-redis | 6379 | Redis 7缓存 |
| backend | opclaw-backend | 3000 | 后端API服务 |
| frontend | opclaw-frontend | 80,443 | 前端Nginx服务 |
| migrate | opclaw-migrate | - | 数据库迁移（一次性） |

### 3. 数据持久化

所有数据都存储在Docker卷中，即使容器删除也不会丢失：

```bash
# 查看卷列表
docker volume ls | grep opclaw

# 备份数据卷
docker run --rm -v opclaw_postgres-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/postgres-backup.tar.gz /data

# 恢复数据卷
docker run --rm -v opclaw_postgres-data:/data -v $(pwd):/backup \
  alpine tar xzf /backup/postgres-backup.tar.gz -C /
```

---

## 🚀 常用运维命令

### 服务管理

```bash
# 启动所有服务
docker-compose -f docker-compose.prod.yml up -d

# 停止所有服务
docker-compose -f docker-compose.prod.yml down

# 重启服务
docker-compose -f docker-compose.prod.yml restart backend

# 查看服务状态
docker-compose -f docker-compose.prod.yml ps

# 查看服务日志
docker-compose -f docker-compose.prod.yml logs -f backend

# 查看所有服务日志
docker-compose -f docker-compose.prod.yml logs -f

# 重新构建并启动
docker-compose -f docker-compose.prod.yml up -d --build
```

### 数据库操作

```bash
# 进入PostgreSQL容器
docker exec -it opclaw-postgres psql -U opclaw -d opclaw

# 执行数据库备份
docker exec opclaw-postgres pg_dump -U opclaw opclaw > backup.sql

# 恢复数据库
docker exec -i opclaw-postgres psql -U opclaw opclaw < backup.sql

# 查看数据库表
docker exec opclaw-postgres psql -U opclaw -d opclaw -c "\dt"
```

### Redis操作

```bash
# 进入Redis容器
docker exec -it opclaw-redis redis-cli -a YOUR_REDIS_PASSWORD

# 查看Redis信息
docker exec opclaw-redis redis-cli -a YOUR_REDIS_PASSWORD info

# 清空Redis缓存（谨慎使用）
docker exec opclaw-redis redis-cli -a YOUR_REDIS_PASSWORD FLUSHALL
```

### 监控和诊断

```bash
# 查看容器资源使用
docker stats

# 查看容器详细信息
docker inspect opclaw-backend

# 进入容器shell
docker exec -it opclaw-backend sh

# 查看容器进程
docker exec opclaw-backend ps aux

# 健康检查
docker exec opclaw-backend wget -O- http://localhost:3000/health
```

---

## 🔧 故障排除

### 问题1: 容器无法启动

```bash
# 查看详细错误信息
docker-compose -f docker-compose.prod.yml logs backend

# 检查容器状态
docker ps -a

# 检查网络连接
docker network inspect opclaw-network
```

### 问题2: 数据库连接失败

```bash
# 检查PostgreSQL是否就绪
docker exec opclaw-postgres pg_isready -U opclaw

# 查看PostgreSQL日志
docker logs opclaw-postgres

# 验证网络连接
docker exec opclaw-backend ping postgres
```

### 问题3: 前端无法访问后端API

```bash
# 检查Nginx配置
docker exec opclaw-frontend cat /etc/nginx/nginx.conf

# 检查后端服务是否运行
docker exec opclaw-frontend wget -O- http://backend:3000/health

# 查看后端日志
docker logs opclaw-backend
```

### 问题4: SSL证书问题

```bash
# 检查证书文件
docker exec opclaw-frontend ls -la /etc/nginx/certs/

# 更新证书（使用Let's Encrypt）
# 请参考 SSL 配置文档

# 临时使用HTTP测试
# 修改 docker-compose.prod.yml 中frontend的端口映射
```

---

## 📊 监控和日志

### 日志管理

```bash
# 查看实时日志
docker-compose -f docker-compose.prod.yml logs -f

# 查看最近100行日志
docker-compose -f docker-compose.prod.yml logs --tail=100

# 查看特定时间的日志
docker logs --since 1h opclaw-backend
```

### 性能监控

```bash
# 查看容器资源使用
docker stats --no-stream

# 查看特定容器
docker stats opclaw-backend opclaw-postgres
```

---

## 🔄 更新和升级

### 更新应用代码

```bash
# 1. 上传新代码
rsync -avz --exclude 'node_modules' \
  -e "ssh -i ~/.ssh/rap001_opclaw" \
  . root@118.25.0.190:/opt/opclaw/

# 2. 重新构建并启动
docker-compose -f docker-compose.prod.yml up -d --build

# 3. 查看新容器日志
docker-compose -f docker-compose.prod.yml logs -f
```

### 零停机部署

```bash
# 1. 拉取新镜像
docker-compose -f docker-compose.prod.yml pull

# 2. 启动新容器（旧容器继续运行）
docker-compose -f docker-compose.prod.yml up -d --no-deps --build backend

# 3. 验证新容器正常后，停止旧容器
docker-compose -f docker-compose.prod.yml up -d --remove-orphans
```

---

## 🔐 安全建议

1. **定期更新镜像**
   ```bash
   docker pull postgres:16-alpine
   docker pull redis:7-alpine
   ```

2. **限制容器权限**
   - 所有容器都以非root用户运行
   - 使用只挂载卷（:ro）

3. **网络隔离**
   - 使用独立的Docker网络
   - 只暴露必要的端口

4. **定期备份**
   ```bash
   # 数据库备份
   docker exec opclaw-postgres pg_dump -U opclaw opclaw | gzip > backup-$(date +%Y%m%d).sql.gz

   # 配置文件备份
   tar czf config-backup-$(date +%Y%m%d).tar.gz .env docker-compose.prod.yml
   ```

---

## 📞 支持和帮助

如遇到问题，请检查：
1. Docker和Docker Compose版本
2. 服务器资源（CPU、内存、磁盘）
3. 网络连接
4. 防火墙配置

更多帮助文档：
- 部署文档: `CLOUD_DEPLOYMENT.md`
- 故障排除: `CLOUD_TROUBLESHOOTING.md`
- Docker Compose文档: https://docs.docker.com/compose/
