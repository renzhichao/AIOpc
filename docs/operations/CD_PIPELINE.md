# AIOpc CD 流水线文档

**版本 (Version)**: 1.0.0
**最后更新 (Last Updated)**: 2026-03-18
**维护者 (Maintainer)**: DevOps Team

---

## 目录 (Table of Contents)

1. [概述 (Overview)](#概述-overview)
2. [架构设计 (Architecture)](#架构设计-architecture)
3. [部署流程 (Deployment Process)](#部署流程-deployment-process)
4. [健康检查 (Health Checks)](#健康检查-health-checks)
5. [自动回滚 (Auto Rollback)](#自动回滚-auto-rollback)
6. [环境配置 (Environment Configuration)](#环境配置-environment-configuration)
7. [故障排查 (Troubleshooting)](#故障排查-troubleshooting)
8. [最佳实践 (Best Practices)](#最佳实践-best-practices)

---

## 概述 (Overview)

### 什么是 CD 流水线？

AIOpc 的持续部署 (CD) 流水线实现了从代码提交到生产环境的自动化部署，包括：

- **自动化部署**: Push 到 `develop` 分支自动触发 Staging 环境部署
- **手动审批**: 生产环境部署需要 2 名维护者审批
- **健康检查**: 部署后自动验证服务健康状态
- **自动回滚**: 健康检查失败时自动回滚到上一版本
- **零停机**: 生产环境采用零停机部署策略

### 流水线组件

```
┌─────────────────────────────────────────────────────────────┐
│                     CD Pipeline Architecture                  │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐      ┌──────────────┐      ┌────────────┐ │
│  │   CI Pipeline│ ───> │   CD Pipeline│ ───> │  Staging   │ │
│  │   (Completed)│      │   (Automatic) │      │  (Auto)    │ │
│  └──────────────┘      └──────────────┘      └────────────┘ │
│                                                               │
│  ┌──────────────┐      ┌──────────────┐      ┌────────────┐ │
│  │   Manual     │ ───> │   CD Pipeline│ ───> │ Production │ │
│  │   Trigger    │      │ (Approved)    │      │ (Manual)   │ │
│  └──────────────┘      └──────────────┘      └────────────┘ │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### 关键指标

| 指标 (Metric) | Staging | Production | 目标 (Target) |
|---------------|---------|------------|---------------|
| 部署时间 | < 5 分钟 | < 10 分钟 | < 5 分钟 (95th) |
| 健康检查超时 | 60 秒 | 90 秒 | < 1 分钟 |
| 重试次数 | 3 次 | 5 次 | ≥ 3 次 |
| 回滚时间 | < 3 分钟 | < 3 分钟 | < 3 分钟 (95th) |
| 部署成功率 | ≥ 95% | ≥ 95% | ≥ 95% |
| 回滚成功率 | 100% | 100% | 100% |

---

## 架构设计 (Architecture)

### 工作流程文件

#### 1. Staging 部署工作流 (`.github/workflows/deploy-staging.yml`)

**触发条件**:
- Push 到 `develop` 分支
- 手动触发 (`workflow_dispatch`)

**工作流程**:
```yaml
jobs:
  deploy-staging:
    steps:
      - 创建备份 (Create backup)
      - 部署后端 (Deploy backend)
      - 部署前端 (Deploy frontend)
      - 重启服务 (Restart services)
      - 健康检查 - 后端 (Health check - Backend)
      - 健康检查 - 前端 (Health check - Frontend)
      - 健康检查 - 数据库 (Health check - Database)
      - 验证部署 (Verify deployment)
      - 失败时回滚 (Rollback on failure)
      - 通知状态 (Notify status)

  post-deploy-tests:
    steps:
      - 运行冒烟测试 (Run smoke tests)

  deployment-summary:
    steps:
      - 生成部署摘要 (Generate deployment summary)
```

**关键特性**:
- ✅ 自动部署 (Automatic deployment)
- ✅ 创建备份 (Backup creation)
- ✅ 健康检查重试 (Health check with retry)
- ✅ 自动回滚 (Auto rollback)
- ✅ 冒烟测试 (Smoke tests)
- ✅ 部署摘要 (Deployment summary)

#### 2. Production 部署工作流 (`.github/workflows/deploy-production.yml`)

**触发条件**:
- 仅手动触发 (`workflow_dispatch`)
- 需要 2 名维护者审批

**工作流程**:
```yaml
jobs:
  pre-deployment-checks:
    steps:
      - 验证 Staging 部署存在 (Verify staging exists)
      - 检查部署窗口 (Check deployment window)
      - 验证构建产物 (Verify build artifacts)

  await-approval:
    steps:
      - 请求审批 (Request approval - 2 approvers)

  deploy-production:
    steps:
      - 创建备份 (Create backup)
      - 部署后端 (Deploy backend)
      - 部署前端 (Deploy frontend)
      - 部署数据库 (Deploy database)
      - 重启服务 - 零停机 (Restart services - zero-downtime)
      - 扩展健康检查 - 后端 (Extended health check - Backend)
      - 扩展健康检查 - 前端 (Extended health check - Frontend)
      - 扩展健康检查 - 数据库 (Extended health check - Database)
      - 全面验证 (Comprehensive verification)
      - 失败时回滚 (Rollback on failure)
      - 通知状态 (Notify status)

  post-deploy-tests:
    steps:
      - 运行生产冒烟测试 (Run production smoke tests)

  deployment-summary:
    steps:
      - 生成部署摘要 (Generate deployment summary)
```

**关键特性**:
- ✅ 手动审批 (Manual approval)
- ✅ 前置检查 (Pre-deployment checks)
- ✅ 零停机部署 (Zero-downtime deployment)
- ✅ 扩展健康检查 (Extended health checks)
- ✅ 全面验证 (Comprehensive verification)
- ✅ 自动回滚 (Auto rollback)
- ✅ 部署窗口检查 (Deployment window check)

### 部署脚本集成

CD 流水线使用以下部署脚本：

1. **`scripts/deploy/deploy.sh`**: 统一部署脚本
   - 支持多组件部署 (backend, frontend, database, all)
   - 自动备份 (Automatic backup)
   - 幂等性保证 (Idempotency)
   - 健康检查 (Health checks)

2. **`scripts/deploy/verify.sh`**: 部署验证脚本
   - 系统检查 (System checks)
   - 后端检查 (Backend checks)
   - 前端检查 (Frontend checks)
   - 数据库检查 (Database checks)
   - 配置检查 (Configuration checks)
   - 性能检查 (Performance checks)
   - 安全检查 (Security checks)

3. **`scripts/deploy/rollback.sh`**: 回滚脚本
   - 自动回滚到最新备份 (Auto rollback to latest backup)
   - 支持指定版本回滚 (Version-specific rollback)
   - 回滚后验证 (Post-rollback verification)

---

## 部署流程 (Deployment Process)

### Staging 环境部署流程

```
┌───────────────────────────────────────────────────────────────┐
│              Staging Deployment Flow                          │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  1. Push to develop branch                                    │
│     │                                                          │
│     ▼                                                          │
│  2. Trigger CD workflow (automatic)                           │
│     │                                                          │
│     ▼                                                          │
│  3. Pre-deployment: Create backup                             │
│     ├── Backup backend code                                   │
│     ├── Backup frontend build                                 │
│     └── Backup database                                       │
│     │                                                          │
│     ▼                                                          │
│  4. Deploy components                                         │
│     ├── Sync backend code (rsync)                             │
│     ├── Build backend (on server)                             │
│     ├── Build frontend (local)                                │
│     └── Sync frontend build (rsync)                           │
│     │                                                          │
│     ▼                                                          │
│  5. Restart services                                          │
│     ├── Restart backend (docker compose)                      │
│     └── Reload nginx                                          │
│     │                                                          │
│     ▼                                                          │
│  6. Health checks (with retry)                                │
│     ├── Backend health (/health) - 3 attempts, 60s timeout   │
│     ├── Frontend health (HTTP 200) - 3 attempts, 60s timeout  │
│     └── Database health (pg_isready) - 3 attempts, 60s       │
│     │                                                          │
│     ▼                                                          │
│  7. Verify deployment (verify.sh)                             │
│     │                                                          │
│     ▼                                                          │
│  8. Post-deployment: Smoke tests                              │
│     │                                                          │
│     ▼                                                          │
│  9. Success ✅ or Rollback on failure ❌                       │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### Production 环境部署流程

```
┌───────────────────────────────────────────────────────────────┐
│             Production Deployment Flow                        │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  1. Manual trigger (workflow_dispatch)                        │
│     │                                                          │
│     ▼                                                          │
│  2. Pre-deployment checks                                     │
│     ├── Verify staging deployment exists                      │
│     ├── Check deployment window                               │
│     └── Verify build artifacts                                │
│     │                                                          │
│     ▼                                                          │
│  3. Await approval (2 approvers required)                     │
│     │                                                          │
│     ▼                                                          │
│  4. Pre-deployment: Create backup                             │
│     ├── Backup backend code                                   │
│     ├── Backup frontend build                                 │
│     └── Backup database                                       │
│     │                                                          │
│     ▼                                                          │
│  5. Deploy components (zero-downtime)                         │
│     ├── Sync backend code (rsync)                             │
│     ├── Build backend (on server)                             │
│     ├── Build frontend (local)                                │
│     ├── Sync frontend build (rsync)                           │
│     └── Apply database migrations (if any)                    │
│     │                                                          │
│     ▼                                                          │
│  6. Restart services (zero-downtime)                          │
│     ├── Graceful backend restart (docker compose up -d)      │
│     └── Graceful nginx reload                                 │
│     │                                                          │
│     ▼                                                          │
│  7. Extended health checks (with retry)                        │
│     ├── Backend health (/health) - 5 attempts, 90s timeout   │
│     ├── Frontend health (HTTP 200) - 5 attempts, 90s timeout  │
│     └── Database health (pg_isready) - 5 attempts, 90s       │
│     │                                                          │
│     ▼                                                          │
│  8. Comprehensive verification (verify.sh)                    │
│     │                                                          │
│     ▼                                                          │
│  9. Post-deployment: Production smoke tests                   │
│     │                                                          │
│     ▼                                                          │
│  10. Success ✅ or Rollback on failure ❌                      │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### 部署时间目标

| 阶段 (Phase) | Staging | Production | 说明 (Notes) |
|--------------|---------|------------|--------------|
| 备份创建 | 30s | 30s | 取决于数据库大小 |
| 代码部署 | 60s | 90s | 包含构建时间 |
| 服务重启 | 20s | 30s | 零停机重启 |
| 健康检查 | 60s | 90s | 包含重试时间 |
| 验证测试 | 30s | 60s | 冒烟测试 |
| **总计** | **< 5 分钟** | **< 10 分钟** | 95th percentile |

---

## 健康检查 (Health Checks)

### 健康检查策略

#### 1. 后端健康检查

**端点 (Endpoint)**: `http://localhost:3000/health`

**检查内容**:
- 服务状态 (Service status)
- 数据库连接 (Database connection)
- Redis 连接 (Redis connection)
- 内存使用 (Memory usage)
- CPU 使用 (CPU usage)

**Staging 配置**:
```yaml
- timeout_minutes: 1
- max_attempts: 3
- retry_on: error
```

**Production 配置**:
```yaml
- timeout_minutes: 2
- max_attempts: 5
- retry_on: error
- warning_on_retry: true
```

#### 2. 前端健康检查

**端点 (Endpoint)**: `http://localhost`

**检查内容**:
- HTTP 状态码 (HTTP status code: 200, 301, 302)
- 页面可访问性 (Page accessibility)
- 静态资源加载 (Static resource loading)

**Staging 配置**:
```yaml
- timeout_minutes: 1
- max_attempts: 3
- retry_on: error
```

**Production 配置**:
```yaml
- timeout_minutes: 2
- max_attempts: 5
- retry_on: error
- warning_on_retry: true
```

#### 3. 数据库健康检查

**命令 (Command)**: `docker exec opclaw-postgres pg_isready -U opclaw`

**检查内容**:
- 数据库容器运行状态 (Container status)
- 数据库连接状态 (Connection status)
- 数据库响应时间 (Response time)

**Staging 配置**:
```yaml
- timeout_minutes: 1
- max_attempts: 3
- retry_on: error
```

**Production 配置**:
```yaml
- timeout_minutes: 2
- max_attempts: 5
- retry_on: error
- warning_on_retry: true
```

### 健康检查失败处理

```yaml
if health_check_fails:
  if attempts < max_attempts:
    retry with exponential backoff
  else:
    trigger_rollback()
    notify_team()
    create_incident_report()
```

### 健康检查自定义

如需添加自定义健康检查，编辑以下文件：

1. **Staging**: `.github/workflows/deploy-staging.yml`
   - 在 `Health check` 步骤中添加新检查

2. **Production**: `.github/workflows/deploy-production.yml`
   - 在 `Extended health check` 步骤中添加新检查

3. **Verification Script**: `scripts/deploy/verify.sh`
   - 在相应组件的检查函数中添加新检查

---

## 自动回滚 (Auto Rollback)

### 回滚触发条件

自动回滚在以下情况下触发：

1. **健康检查失败** (Health check failure)
   - 所有重试次数用尽后仍失败
   - 任何组件的健康检查失败

2. **验证失败** (Verification failure)
   - `verify.sh` 脚本返回非零退出码
   - 关键验证步骤失败

3. **部署超时** (Deployment timeout)
   - Staging: 超过 5 分钟
   - Production: 超过 10 分钟

4. **手动触发** (Manual trigger)
   - 运维人员手动执行回滚脚本

### 回滚流程

```
┌───────────────────────────────────────────────────────────────┐
│                  Rollback Process                             │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  1. Deployment failure detected                               │
│     │                                                          │
│     ▼                                                          │
│  2. Stop deployment                                           │
│     │                                                          │
│     ▼                                                          │
│  3. Execute rollback script (rollback.sh)                     │
│     ├── Identify latest backup                                │
│     ├── Stop current services                                 │
│     ├── Restore backend code                                  │
│     ├── Restore frontend build                                │
│     ├── Restore database (if needed)                          │
│     └── Restart services                                      │
│     │                                                          │
│     ▼                                                          │
│  4. Verify rollback                                           │
│     ├── Backend health check                                  │
│     ├── Frontend health check                                 │
│     └── Database health check                                 │
│     │                                                          │
│     ▼                                                          │
│  5. Notify team                                               │
│     ├── Slack notification                                    │
│     ├── Email alert                                           │
│     └── GitHub issue                                          │
│     │                                                          │
│     ▼                                                          │
│  6. Create incident report                                    │
│     ├── Root cause analysis                                   │
│     ├── Timeline of events                                    │
│     └── Action items                                          │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### 回滚时间目标

| 组件 (Component) | 目标时间 (Target) | 说明 (Notes) |
|------------------|-------------------|--------------|
| 后端回滚 | < 2 分钟 | 包含服务重启 |
| 前端回滚 | < 1 分钟 | 仅文件恢复 |
| 数据库回滚 | < 3 分钟 | 取决于数据量 |
| **总计** | **< 3 分钟** | 95th percentile |

### 回滚验证

回滚后自动验证：

1. **后端验证** (Backend verification)
   ```bash
   curl -sf http://localhost:3000/health
   ```

2. **前端验证** (Frontend verification)
   ```bash
   curl -s -o /dev/null -w '%{http_code}' http://localhost
   # Expected: 200, 301, or 302
   ```

3. **数据库验证** (Database verification)
   ```bash
   docker exec opclaw-postgres pg_isready -U opclaw
   ```

### 回滚失败处理

如果回滚失败：

1. **立即通知团队** (Immediate team notification)
2. **保留失败状态** (Preserve failed state for investigation)
3. **启动应急响应** (Initiate incident response)
4. **手动干预** (Manual intervention)

---

## 环境配置 (Environment Configuration)

### GitHub Secrets 配置

#### Staging 环境

```yaml
# Required secrets
STAGING_SSH_KEY: <SSH private key for staging server>
STAGING_SERVER: "118.25.0.190"
STAGING_USER: "root"

# Optional secrets (override defaults)
DEPLOY_PATH: "/opt/opclaw"
BACKUP_PATH: "/opt/opclaw/backups"
```

#### Production 环境

```yaml
# Required secrets
PRODUCTION_SSH_KEY: <SSH private key for production server>
PRODUCTION_SERVER: "118.25.0.190"
PRODUCTION_USER: "root"

# Optional secrets (override defaults)
DEPLOY_PATH: "/opt/opclaw"
BACKUP_PATH: "/opt/opclaw/backups"
```

### 服务器配置

#### Staging 服务器

- **服务器**: 118.25.0.190
- **SSH 密钥**: `~/.ssh/rap001_opclaw`
- **部署路径**: `/opt/opclaw`
- **前端路径**: `/var/www/opclaw`
- **数据库**: PostgreSQL (Docker)
- **Web 服务器**: Nginx

#### Production 服务器

- **服务器**: 118.25.0.190 (同服务器，不同配置)
- **SSH 密钥**: `~/.ssh/rap001_opclaw`
- **部署路径**: `/opt/opclaw`
- **前端路径**: `/var/www/opclaw`
- **数据库**: PostgreSQL (Docker)
- **Web 服务器**: Nginx

### 环境变量配置

#### 后端环境变量 (`/opt/opclaw/backend/.env`)

```bash
# Server
PORT=3000
NODE_ENV=production

# Database
DB_HOST=postgres
DB_PORT=5432
DB_NAME=opclaw
DB_USER=opclaw
DB_PASSWORD=<secure_password>

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# JWT
JWT_SECRET=<secure_secret>

# Feishu (飞书)
FEISHU_APP_ID=cli_a93ce5614ce11bd6
FEISHU_APP_SECRET=L0cHQDBbEiIys6AHW53miecONb1xA4qy

# OpenRouter (if using)
OPENROUTER_API_KEY=<api_key>
```

### GitHub Actions 环境配置

在 GitHub 仓库设置中配置环境：

#### Staging 环境

```yaml
Name: staging
URL: http://118.25.0.190
Protection Rules: None (自动部署)
```

#### Production 环境

```yaml
Name: production
URL: http://118.25.0.190
Protection Rules:
  - Required reviewers: 2
  - Wait timer: 0 minutes
  - Branch: main
```

---

## 故障排查 (Troubleshooting)

### 常见问题

#### 1. 部署失败 (Deployment Failure)

**症状 (Symptoms)**:
- 部署工作流失败
- 健康检查失败
- 回滚已触发

**诊断步骤 (Diagnosis)**:
1. 检查 GitHub Actions 日志
2. 检查服务器日志: `ssh root@118.25.0.190 'docker logs opclaw-backend --tail 100'`
3. 检查 Nginx 日志: `ssh root@118.25.0.190 'tail -f /var/log/nginx/error.log'`
4. 检查系统资源: `ssh root@118.25.0.190 'free -h && df -h'`

**解决方案 (Solutions)**:
- 如果是代码错误: 修复代码并重新部署
- 如果是配置错误: 检查环境变量配置
- 如果是资源不足: 扩展服务器资源
- 如果是依赖问题: 检查 `pnpm-lock.yaml` 文件

#### 2. 健康检查超时 (Health Check Timeout)

**症状 (Symptoms)**:
- 健康检查步骤超时
- 服务无法启动
- 连接被拒绝

**诊断步骤 (Diagnosis)**:
1. 检查容器状态: `ssh root@118.25.0.190 'docker ps'`
2. 检查容器日志: `ssh root@118.25.0.190 'docker logs opclaw-backend'`
3. 检查端口监听: `ssh root@118.25.0.190 'netstat -tuln | grep 3000'`
4. 检查防火墙: `ssh root@118.25.0.190 'ufw status'`

**解决方案 (Solutions)**:
- 如果容器未启动: 手动启动容器
- 如果端口冲突: 修改端口配置
- 如果依赖未就绪: 等待依赖服务启动
- 如果配置错误: 检查 `.env` 文件

#### 3. 回滚失败 (Rollback Failure)

**症状 (Symptoms)**:
- 回滚脚本执行失败
- 备份文件不存在或损坏
- 服务无法恢复

**诊断步骤 (Diagnosis)**:
1. 检查备份是否存在: `ssh root@118.25.0.190 'ls -la /opt/opclaw/backups/'`
2. 检查备份完整性: `ssh root@118.25.0.190 'tar -tzf /opt/opclaw/backups/backup_*/backend.tar.gz'`
3. 检查回滚日志: `cat rollback.log`
4. 检查当前服务状态: `ssh root@118.25.0.190 'cd /opt/opclaw && docker compose ps'`

**解决方案 (Solutions)**:
- 如果备份不存在: 使用更早的备份版本
- 如果备份损坏: 恢复到上一个已知良好状态
- 如果服务无法启动: 手动启动并调试
- 如果数据丢失: 从数据库备份恢复

#### 4. 部署超时 (Deployment Timeout)

**症状 (Symptoms)**:
- 部署时间超过目标时间
- 部署流程卡住
- 工作流超时

**诊断步骤 (Diagnosis)**:
1. 检查部署步骤耗时
2. 检查网络连接: `ssh root@118.25.0.190 'ping -c 4 github.com'`
3. 检查磁盘 I/O: `ssh root@118.25.0.190 'iostat -x 1 5'`
4. 检查系统负载: `ssh root@118.25.0.190 'uptime'`

**解决方案 (Solutions)**:
- 如果网络慢: 检查网络带宽
- 如果构建慢: 优化构建过程
- 如果 I/O 慢: 优化磁盘性能
- 如果依赖下载慢: 使用缓存镜像

### 调试命令

#### 查看部署状态

```bash
# 查看最近的部署
gh run list --workflow=deploy-staging.yml

# 查看特定部署的详情
gh run view <run-id>

# 查看部署日志
gh run view <run-id> --log
```

#### 手动部署

```bash
# 部署到 Staging
./scripts/deploy/deploy.sh --env staging --component all

# 部署到 Production
./scripts/deploy/deploy.sh --env production --component all

# 仅部署后端
./scripts/deploy/deploy.sh --component backend
```

#### 手动回滚

```bash
# 回滚到最新备份
./scripts/deploy/rollback.sh

# 回滚到指定版本
./scripts/deploy/rollback.sh --to backup_20260318_120000

# 列出所有备份
./scripts/deploy/rollback.sh --list
```

#### 验证部署

```bash
# 验证所有组件
./scripts/deploy/verify.sh --env production --component all

# 仅验证后端
./scripts/deploy/verify.sh --component backend

# 详细输出
./scripts/deploy/verify.sh --verbose

# JSON 格式输出
./scripts/deploy/verify.sh --json
```

### 日志位置

| 日志类型 (Log Type) | 位置 (Location) | 说明 (Description) |
|--------------------|-----------------|-------------------|
| GitHub Actions | GitHub Web UI | 工作流执行日志 |
| 后端应用 | `/var/log/opclaw/backend.log` | 后端应用日志 |
| Nginx 访问 | `/var/log/nginx/access.log` | Nginx 访问日志 |
| Nginx 错误 | `/var/log/nginx/error.log` | Nginx 错误日志 |
| Docker 容器 | `docker logs opclaw-backend` | 容器日志 |
| 系统日志 | `/var/log/syslog` | 系统日志 |
| 部署日志 | `/opt/opclaw/deploy.log` | 部署脚本日志 |
| 回滚日志 | `/opt/opclaw/rollback.log` | 回滚脚本日志 |

---

## 最佳实践 (Best Practices)

### 部署最佳实践

#### 1. 部署前检查

- ✅ **确保 CI 通过**: 只部署通过所有 CI 检查的代码
- ✅ **在 Staging 测试**: 先在 Staging 环境测试所有更改
- ✅ **检查部署窗口**: Production 部署避开高峰时段
- ✅ **准备回滚计划**: 始终准备回滚方案
- ✅ **通知团队**: 部署前通知相关团队成员

#### 2. 部署过程

- ✅ **使用自动化**: 始终使用 CD 流水线部署
- ✅ **监控部署**: 实时监控部署进度和状态
- ✅ **保持冷静**: 遇到问题冷静分析，不要慌乱
- ✅ **记录问题**: 记录部署中遇到的问题和解决方案

#### 3. 部署后验证

- ✅ **运行冒烟测试**: 部署后运行关键功能测试
- ✅ **检查日志**: 检查应用日志是否有错误
- ✅ **监控指标**: 监控关键性能指标
- ✅ **用户验证**: 验证关键用户场景

### 回滚最佳实践

#### 1. 回滚决策

- ❌ **不要犹豫**: 如果健康检查失败，立即回滚
- ✅ **优先考虑用户体验**: 回滚比有问题的部署更好
- ✅ **分析原因**: 回滚后分析根本原因

#### 2. 回滚执行

- ✅ **使用自动回滚**: 优先使用 CD 流水线的自动回滚
- ✅ **验证回滚**: 回滚后验证服务健康
- ✅ **通知团队**: 及时通知团队回滚情况

#### 3. 回滚后

- ✅ **创建问题报告**: 记录回滚原因和过程
- ✅ **修复问题**: 修复导致回滚的问题
- ✅ **重新部署**: 问题修复后重新部署

### 安全最佳实践

#### 1. 凭证管理

- ✅ **使用 GitHub Secrets**: 存储敏感信息在 GitHub Secrets
- ✅ **定期轮换密钥**: 定期更换 SSH 密钥和访问令牌
- ✅ **最小权限原则**: 只授予必要的权限
- ✅ **审计访问**: 定期审计访问日志

#### 2. 备份策略

- ✅ **定期备份**: 每次部署前自动备份
- ✅ **异地备份**: 保留备份在多个位置
- ✅ **备份验证**: 定期验证备份完整性
- ✅ **备份测试**: 定期测试备份恢复流程

#### 3. 监控和告警

- ✅ **实时监控**: 监控部署状态和服务健康
- ✅ **告警配置**: 配置适当的告警规则
- ✅ **响应流程**: 建立清晰的响应流程
- ✅ **演练**: 定期进行故障演练

### 性能优化

#### 1. 部署速度优化

- ✅ **并行化**: 尽可能并行执行部署步骤
- ✅ **增量部署**: 只部署更改的文件
- ✅ **缓存依赖**: 缓存依赖包以加速构建
- ✅ **优化镜像**: 使用优化的 Docker 镜像

#### 2. 零停机部署

- ✅ **蓝绿部署**: 使用蓝绿部署策略
- ✅ **滚动更新**: 逐步更新服务实例
- ✅ **健康检查**: 确保新实例健康后才切换流量
- ✅ **快速回滚**: 保持旧版本可用以便快速回滚

### 文档和知识管理

#### 1. 文档维护

- ✅ **保持更新**: 保持文档与实际流程同步
- ✅ **详细记录**: 详细记录每个步骤和决策
- ✅ **示例代码**: 提供常用命令的示例
- ✅ **故障案例**: 记录常见问题和解决方案

#### 2. 知识共享

- ✅ **团队培训**: 定期进行团队培训
- ✅ **问题分享**: 分享部署问题和解决方案
- ✅ **最佳实践**: 总结和分享最佳实践
- ✅ **持续改进**: 持续改进部署流程

---

## 附录 (Appendix)

### A. 相关文档

- [CI 流水线文档](../devops/CI_PIPELINE.md)
- [部署脚本文档](../../scripts/deploy/README.md)
- [故障排查指南](../troubleshooting/DEPLOYMENT_ISSUES.md)
- [变更管理流程](../devops/CHANGE_MANAGEMENT.md)

### B. 命令参考

#### GitHub CLI

```bash
# 查看工作流运行状态
gh run list --workflow=deploy-staging.yml

# 查看特定工作流
gh run view <run-id>

# 重新运行工作流
gh run rerun <run-id>

# 取消运行中的工作流
gh run cancel <run-id>
```

#### SSH 连接

```bash
# 连接到 Staging 服务器
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190

# 查看服务器状态
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 'cd /opt/opclaw && docker compose ps'

# 查看服务器日志
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 'docker logs opclaw-backend --tail 100 -f'
```

### C. 联系方式

- **DevOps Team**: devops@example.com
- **On-Call Engineer**: on-call@example.com
- **Emergency Contact**: emergency@example.com

### D. 变更历史

| 版本 (Version) | 日期 (Date) | 变更 (Changes) | 作者 (Author) |
|---------------|-------------|----------------|---------------|
| 1.0.0 | 2026-03-18 | 初始版本 | DevOps Team |

---

**文档结束 (End of Document)**
