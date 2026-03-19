# CIIBER 租户部署准备清单

> **租户ID**: CIIBER
> **服务器IP**: 113.105.103.165:20122
> **创建日期**: 2026-03-19
> **状态**: 🟢 基础设施部署完成，等待客户信息

---

## ✅ 已完成配置

### 租户基本信息
- ✅ **租户ID**: CIIBER
- ✅ **租户名称**: CIIBER
- ✅ **环境**: production
- ✅ **租户等级**: standard

### 服务器配置
- ✅ **服务器IP**: 113.105.103.165
- ✅ **SSH端口**: 20122 (非标准端口)
- ✅ **SSH用户**: openclaw
- ✅ **SSH密钥**: ~/.ssh/ciiber_key (已生成并部署)
- ✅ **SSH认证**: 密钥认证工作正常
- ✅ **部署路径**: /opt/opclaw/platform
- ✅ **API端口**: 3000
- ✅ **指标端口**: 9090
- ✅ **系统**: Ubuntu 22.04 (Linux 6.8.0-106)
- ✅ **磁盘空间**: 173GB 可用 (7% 已使用)
- ✅ **Docker**: v29.3.0 已安装并运行
- ✅ **Docker Compose**: v5.1.0 已安装
- ✅ **PostgreSQL**: v16 运行中 (容器: opclaw-postgres)
- ✅ **Redis**: v7 运行中 (容器: opclaw-redis)
- ✅ **健康检查**: /usr/local/bin/opclaw-health.sh

### 已生成密钥
- ✅ **数据库密码**: TVqSqee4ZeirusJAcuUqXm5cBt2UBFx5 (32字符)
- ✅ **Redis密码**: 8wqP09459CRNAahiGHCn (18字符)
- ✅ **JWT密钥**: StoSs7OeYmRwmxuBe8Lh50mRRGiYolDcTPY6HRvoPhD7rdaj8vHW1rE4Vp9VWQ4 (64字符)
- ✅ **Feishu加密密钥**: DoZ9NxC523OFphRtNnPdHDjk3OUHtsNZ (32字符)

### 数据库配置
- ✅ **数据库名**: opclaw_ciiber
- ✅ **数据库用户**: opclaw
- ✅ **数据库密码**: 已生成并配置
- ✅ **本地部署**: localhost:5432

### Redis配置
- ✅ **本地部署**: localhost:6379
- ✅ **Redis密码**: 已生成并配置
- ✅ **数据库**: 0

### JWT配置
- ✅ **JWT密钥**: 已生成并配置
- ✅ **签发者**: CIIBER
- ✅ **受众**: opclaw-api
- ✅ **过期时间**: 24h
- ✅ **刷新过期**: 7d

### Agent配置
- ✅ **API URL**: https://api.deepseek.com
- ✅ **模型**: deepseek-chat
- ✅ **最大Token**: 4096

### 配置文件位置
- ✅ **配置文件**: `/Users/arthurren/projects/AIOpc/config/tenants/CIIBER.yml`
- ✅ **部署脚本**: `/Users/arthurren/projects/AIOpc/scripts/deploy/deploy-ciiber-tenant.sh`

---

## 🟢 当前状态 (2026-03-19 17:25)

### 已完成
1. ✅ SSH 密钥对生成并部署到服务器
2. ✅ SSH 密钥认证测试通过
3. ✅ 服务器环境检查 (Ubuntu 22.04, 173GB 磁盘)
4. ✅ 所有必要密钥已生成 (DB, Redis, JWT, Feishu)
5. ✅ 配置文件已更新 (CIIBER.yml)
6. ✅ Docker 和 Docker Compose 已安装
7. ✅ 国内 Docker 镜像源已配置
8. ✅ 目录结构已创建 (/opt/opclaw, /etc/opclaw)
9. ✅ 环境配置文件已创建 (/etc/opclaw/.env.production)
10. ✅ Docker Compose 配置已创建 (docker-compose.yml)
11. ✅ PostgreSQL 容器已启动并健康运行
12. ✅ Redis 容器已启动并健康运行
13. ✅ 健康检查脚本已创建 (/usr/local/bin/opclaw-health.sh)

### 服务器状态
- **系统**: Ubuntu 22.04 (Linux 6.8.0-106)
- **用户**: openclaw (在 sudo 组中)
- **Docker**: ✅ v29.3.0 已安装并运行
- **Docker Compose**: ✅ v5.1.0 已安装
- **PostgreSQL**: ✅ v16 运行中 (健康)
- **Redis**: ✅ v7 运行中 (健康)
- **目录**: ✅ /opt/opclaw 已创建
- **配置**: ✅ /etc/opclaw/.env.production 已配置

---

## ⏳ 待客户提供信息

### 1. 飞书集成 (优先级: HIGH)
- [ ] **Feishu App ID**: `cli_xxxxxxxxxxxxx`
  - 从飞书开放平台获取
  - 格式: cli_ 开头
- [ ] **Feishu App Secret**: (≥32字符)
  - 从飞书开放平台获取
  - 机密信息，需妥善保管
- [ ] **OAuth 回调地址**: `https://ciiber.example.com/api/auth/feishu/callback`
  - 需提供域名
  - 在飞书后台配置

### 3. DeepSeek API Key (优先级: HIGH)
- [ ] **DeepSeek API Key**: `sk-xxxxxxxxxxxx`
  - 从 DeepSeek 平台获取
  - 格式: sk- 开头

### 4. 域名配置 (优先级: MEDIUM)
- [ ] **服务域名**: `ciiber.example.com`
  - 用于 OAuth 回调和 API 访问
  - 需配置 DNS 解析

---

## 📋 部署选项

### 选项 1: 提供 sudo 密钥 (推荐自动化部署)

如果您能提供 openclaw 用户的 sudo 密码，我们可以使用部署脚本完成自动化部署：

```bash
# 使用 expect 自动输入密码
./scripts/deploy/deploy-ciiber-tenant.sh
```

部署脚本将自动完成：
1. ✅ 安装 Docker 和 Docker Compose
2. ✅ 创建必要的目录结构
3. ✅ 创建环境配置文件
4. ✅ 启动 PostgreSQL 和 Redis 容器
5. ✅ 配置健康检查脚本

### 选项 2: 手动执行安装步骤

如果不能提供 sudo 密码，请让服务器管理员手动执行以下步骤：

#### 步骤 1: 安装 Docker
```bash
# 登录服务器
ssh -p 20122 openclaw@113.105.103.165

# 安装 Docker
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 将当前用户添加到 docker 组
sudo usermod -aG docker openclaw

# 验证安装
docker --version
docker compose version
```

#### 步骤 2: 创建目录结构
```bash
sudo mkdir -p /opt/opclaw/platform
sudo mkdir -p /opt/opclaw/data/postgres
sudo mkdir -p /opt/opclaw/data/redis
sudo mkdir -p /etc/opclaw
sudo chown -R openclaw:openclaw /opt/opclaw
sudo chown -R openclaw:openclaw /etc/opclaw
```

#### 步骤 3: 创建环境配置文件
```bash
cat > /etc/opclaw/.env.production << 'EOF'
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=opclaw_ciiber
DB_USER=opclaw
DB_PASSWORD=TVqSqee4ZeirusJAcuUqXm5cBt2UBFx5

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=8wqP09459CRNAahiGHCn

# JWT Configuration
JWT_SECRET=StoSs7OeYmRwmxuBe8Lh50mRRGiYolDcTPY6HRvoPhD7rdaj8vHW1rE4Vp9VWQ4
JWT_EXPIRES_IN=24h
JWT_ISSUER=CIIBER

# Feishu Configuration
FEISHU_APP_ID=
FEISHU_APP_SECRET=
FEISHU_ENCRYPT_KEY=DoZ9NxC523OFphRtNnPdHDjk3OUHtsNZ
FEISHU_OAUTH_REDIRECT_URI=https://ciiber.example.com/api/auth/feishu/callback

# Server Configuration
PORT=3000
NODE_ENV=production

# DeepSeek Configuration
DEEPSEEK_API_KEY=
DEEPSEEK_API_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
EOF

chmod 600 /etc/opclaw/.env.production
```

#### 步骤 4: 创建 Docker Compose 配置
```bash
cd /opt/opclaw/platform

cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: opclaw-postgres
    environment:
      POSTGRES_DB: opclaw_ciiber
      POSTGRES_USER: opclaw
      POSTGRES_PASSWORD: TVqSqee4ZeirusJAcuUqXm5cBt2UBFx5
    volumes:
      - /opt/opclaw/data/postgres:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U opclaw"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: opclaw-redis
    command: redis-server --requirepass 8wqP09459CRNAahiGHCn
    volumes:
      - /opt/opclaw/data/redis:/data
    ports:
      - "6379:6379"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "8wqP09459CRNAahiGHCn", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

networks:
  default:
    name: opclaw-network
EOF
```

#### 步骤 5: 启动数据库服务
```bash
cd /opt/opclaw/platform
docker compose up -d postgres redis

# 等待服务启动
sleep 10

# 验证服务状态
docker ps

# 验证 PostgreSQL
docker exec opclaw-postgres pg_isready -U opclaw

# 验证 Redis
docker exec opclaw-redis redis-cli -a 8wqP09459CRNAahiGHCn ping
```

#### 步骤 6: 创建健康检查脚本
```bash
sudo tee /usr/local/bin/opclaw-health.sh > /dev/null << 'EOF'
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
docker exec opclaw-redis redis-cli -a 8wqP09459CRNAahiGHCn ping || echo 'Redis 未就绪'
echo ''
echo '=== 磁盘空间 ==='
df -h /opt/opclaw
EOF

sudo chmod +x /usr/local/bin/opclaw-health.sh
```

### 选项 3: 使用 root 用户部署

如果可以使用 root 用户登录，可以提供 root 用户的 SSH 访问信息：

```bash
# 需要提供:
# - root 用户密码或 SSH 密钥
# - 或允许 openclaw 用户无密码 sudo
```

---

## 📊 基础设施部署后 (需要客户信息)

完成基础设施部署后，还需要客户提供以下信息才能部署完整服务：

### 飞书集成信息
- Feishu App ID
- Feishu App Secret
- OAuth 回调域名

### DeepSeek API
- DeepSeek API Key

### 服务配置
- 服务域名 (用于 OAuth 回调)
- SSL 证书 (如有)

---

## 🔧 快速命令参考

### 本地 SSH 连接
```bash
# 使用密钥连接
ssh -i ~/.ssh/ciiber_key -p 20122 openclaw@113.105.103.165

# 使用密码连接
ssh -p 20122 openclaw@113.105.103.165
```

### 服务器检查命令
```bash
# 健康检查
ssh -i ~/.ssh/ciiber_key -p 20122 openclaw@113.105.103.165 "opclaw-health.sh"

# 查看容器状态
ssh -i ~/.ssh/ciiber_key -p 20122 openclaw@113.105.103.165 "docker ps"

# 查看日志
ssh -i ~/.ssh/ciiber_key -p 20122 openclaw@113.105.103.165 "docker logs opclaw-postgres --tail 50"
```

### 配置管理
```bash
# 查看租户配置
./scripts/tenant/show.sh CIIBER

# 验证配置
./scripts/tenant/validate.sh CIIBER

# 安全检查
./scripts/security/security-check-suite.sh config/tenants/CIIBER.yml
```

---

## 📞 联系信息

如有问题或需要协助，请联系：
- **技术支持**: arthurren@example.com
- **项目文档**: `/Users/arthurren/projects/AIOpc/docs/`

---

**最后更新**: 2026-03-19 17:25
**配置版本**: 1.0
**当前状态**: 🟢 基础设施部署完成，等待客户信息

---

## 📝 变更日志

### 2026-03-19 17:25 - 基础设施部署完成
- ✅ Docker v29.3.0 和 Docker Compose v5.1.0 已安装
- ✅ 国内 Docker 镜像源已配置（加速镜像拉取）
- ✅ 目录结构已创建 (/opt/opclaw, /etc/opclaw)
- ✅ 环境配置文件已创建 (/etc/opclaw/.env.production)
- ✅ Docker Compose 配置已创建 (docker-compose.yml)
- ✅ PostgreSQL 16 容器已启动并健康运行
- ✅ Redis 7 容器已启动并健康运行
- ✅ 健康检查脚本已创建 (/usr/local/bin/opclaw-health.sh)

### 2026-03-19 16:52
- ✅ SSH 密钥对生成并部署
- ✅ 所有必要密钥已生成
- ✅ 配置文件已更新
- ✅ 部署脚本已创建

### 2026-03-19 初始创建
- 创建 CIIBER 租户配置
- 服务器连接诊断
- 部署检查清单初始化
