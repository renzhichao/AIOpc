# 生产环境部署指南 (Production Deployment Guide)

## 概述 (Overview)

本文档描述 AIOpc 平台**单生产环境**的可靠部署流程，重点解决配置管理、部署规范和数据库保护三大核心问题。

**核心目标**:
- ✅ 配置管理安全 - 防止配置 regression
- ✅ 部署流程规范 - 测试 → 备份 → 部署 → 验证
- ✅ 数据库保护 - 防止数据丢失
- ✅ 快速回滚 - 失败时 < 3 分钟恢复

**适用范围**:
- 单一生产服务器 (118.25.0.190)
- 服务: backend, frontend, postgres, redis
- 手动触发部署

---

## 部署流程 (Deployment Process)

### 完整部署流程图

```
手动触发 → 预检查 → 单元测试 → 配置验证 → 数据库保护检查
   ↓         ↓         ↓          ↓              ↓
确认    环境验证   强制测试    占位符检查      备份目录准备
   ↓                                                   ↓
创建备份 → 部署服务 → 健康检查 (3次重试) → 成功/回滚
   ↓                                         ↓
配置+数据库+代码                      失败: 自动回滚 (< 3分钟)
```

### 部署步骤详解

#### 1. 手动触发 (Manual Trigger)

**GitHub Actions 工作流**:
```yaml
# 名称: 生产环境部署
# 触发方式: workflow_dispatch (仅手动)
# 位置: .github/workflows/deploy-production.yml
```

**触发步骤**:
1. 访问 GitHub Actions 页面
2. 选择 "生产环境部署" 工作流
3. 点击 "Run workflow"
4. 填写部署参数:
   - **component**: all / backend / frontend
   - **skip_tests**: false (强烈不推荐跳过)
   - **confirm_deployment**: ✅ true (必须勾选)

#### 2. 预检查 (Pre-check)

**检查项**:
- ✅ 部署确认 (confirm_deployment = true)
- ✅ SSH 连接测试
- ✅ 生产环境验证 (hostname = VM-4-12-ubuntu)

**失败情况**:
```bash
❌ 未确认部署 → 提示勾选 confirm_deployment
❌ SSH 连接失败 → 检查密钥和网络
⚠️ 主机名不匹配 → 警告但继续（允许主机变更）
```

#### 3. 单元测试 (Unit Tests)

**测试内容**:
- Backend 单元测试 (`pnpm test`)
- 强制执行（除非 skip_tests = true）

**失败处理**:
```bash
❌ 测试失败 → 停止部署
→ 提示修复测试问题
→ 不允许跳过（除非明确选择）
```

#### 4. 配置验证 (Config Validation)

**验证项**:
- ✅ 配置文件存在 (`/opt/opclaw/.env.production`)
- ✅ 无占位符 (`cli_xxxxxxxxxxxxx`, `CHANGE_THIS`, etc.)
- ✅ 必需配置完整 (DB_PASSWORD, REDIS_PASSWORD, etc.)

**检查脚本**:
```bash
# 检查占位符
grep -E 'cli_xxxxxxxxxxxxx|CHANGE_THIS|your_|placeholder|TODO|FIXME' \
  /opt/opclaw/.env.production

# 检查必需变量
for var in DB_PASSWORD REDIS_PASSWORD FEISHU_APP_ID \
           FEISHU_APP_SECRET JWT_SECRET DEEPSEEK_API_KEY; do
  grep -q "^${var}=" /opt/opclaw/.env.production
done
```

**失败情况**:
```bash
❌ 配置文件不存在 → 停止部署
❌ 发现占位符 → 停止部署，提示配置真实值
❌ 缺少必需配置 → 停止部署
```

#### 5. 数据库保护检查 (Database Protection)

**检查项**:
- ✅ 数据库容器运行 (`opclaw-postgres`)
- ✅ 数据库连接健康 (`pg_isready`)
- ✅ 备份目录存在 (`/opt/opclaw/backups/database`)

**保护机制**:
```bash
# 数据库容器检查
docker ps --format '{{.Names}}' | grep opclaw-postgres

# 数据库连接检查
docker exec opclaw-postgres pg_isready -U opclaw

# 备份目录创建
mkdir -p /opt/opclaw/backups/database
```

#### 6. 创建备份 (Create Backup)

**备份内容**:
1. **配置文件备份**:
   ```bash
   cp /opt/opclaw/.env.production \
      /opt/opclaw/backups/.env.production.YYYYMMDD_HHMMSS
   ```

2. **数据库备份**:
   ```bash
   docker exec opclaw-postgres pg_dump -U opclaw opclaw | \
     gzip > /opt/opclaw/backups/database/opclaw_db_TIMESTAMP.sql.gz
   ```

3. **代码备份**:
   ```bash
   tar -czf /opt/opclaw/backups/code_backup_TIMESTAMP.tar.gz \
     --exclude='node_modules' \
     --exclude='backups' \
     --exclude='.git' \
     platform/backend
   ```

**备份保留策略**:
- 保留最近 7 天的备份
- 定期清理旧备份（可手动或自动化）

#### 7. 部署服务 (Deploy Services)

**后端部署** (component = all 或 backend):
```bash
# 1. 使用 rsync 同步代码（增量，保留权限）
rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.env*' \
  platform/backend/ \
  root@118.25.0.190:/opt/opclaw/platform/backend/

# 2. 重新构建 Docker 镜像
cd /opt/opclaw && docker compose build backend

# 3. 重启后端容器
docker compose up -d backend
```

**前端部署** (component = all 或 frontend):
```bash
# 1. 使用 rsync 同步代码
rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.env*' \
  platform/frontend/ \
  root@118.25.0.190:/opt/opclaw/platform/frontend/

# 2. 在服务器上构建
cd /opt/opclaw/platform/frontend
npm install -g pnpm@latest
pnpm install
pnpm build

# 3. 重启前端容器
cd /opt/opclaw && docker compose up -d frontend
```

#### 8. 健康检查 (Health Check)

**检查项**:
- ✅ 后端健康 (HTTP 200 on `/health`)
- ✅ 数据库健康 (`pg_isready`)

**重试机制**:
```bash
MAX_RETRIES=3
RETRY_DELAY=30

# 重试 3 次，每次间隔 30 秒
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  # 检查后端
  curl -f http://localhost:3000/health || BACKEND_HEALTH="fail"

  # 检查数据库
  docker exec opclaw-postgres pg_isready -U opclaw || DB_HEALTH="fail"

  # 都通过则成功
  [ "$BACKEND_HEALTH" = "ok" ] && [ "$DB_HEALTH" = "ok" ] && exit 0

  # 等待后重试
  sleep $RETRY_DELAY
  RETRY_COUNT=$((RETRY_COUNT + 1))
done

# 都失败则回滚
exit 1
```

#### 9. 成功或回滚 (Success or Rollback)

**成功情况**:
```bash
✅ 所有健康检查通过
→ 部署成功
→ 显示部署摘要
→ 保留备份（供后续回滚使用）
```

**失败情况**:
```bash
❌ 健康检查失败
→ 自动回滚
→ 恢复最新备份
→ 重启服务
→ 目标: < 3 分钟完成回滚
```

---

## 配置管理 (Configuration Management)

### 配置文件位置

**唯一真实配置源**:
```
/opt/opclaw/.env.production
```

**配置文件结构**:
```bash
# 数据库配置
DB_HOST=postgres
DB_PORT=5432
DB_NAME=opclaw
DB_USERNAME=opclaw
DB_PASSWORD=<真实密码>

# Redis配置
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=<真实密码>

# Feishu OAuth
FEISHU_APP_ID=cli_a93ce5614ce11bd6
FEISHU_APP_SECRET=<真实密钥>
FEISHU_REDIRECT_URI=https://renava.cn/oauth/callback

# DeepSeek API
DEEPSEEK_API_KEY=<真实密钥>

# JWT配置
JWT_SECRET=<真实密钥>
```

### 配置安全规则

#### 规则 1: 单一配置源
- ✅ **唯一真实配置**: `/opt/opclaw/.env.production`
- ❌ **不允许**: 从其他文件读取配置
- ❌ **不允许**: 环境变量覆盖

#### 规则 2: 占位符检测
```bash
# 部署前自动检测
grep -E 'cli_xxxxxxxxxxxxx|CHANGE_THIS|your_|placeholder|TODO|FIXME' \
  /opt/opclaw/.env.production

# 发现占位符 → 停止部署
```

#### 规则 3: 配置备份
```bash
# 每次部署前自动备份
cp /opt/opclaw/.env.production \
   /opt/opclaw/backups/.env.production.$(date +%Y%m%d_%H%M%S)
```

#### 规则 4: 配置验证
```bash
# 必需的配置项
REQUIRED_VARS=(
  "DB_PASSWORD"
  "REDIS_PASSWORD"
  "FEISHU_APP_ID"
  "FEISHU_APP_SECRET"
  "JWT_SECRET"
  "DEEPSEEK_API_KEY"
)

# 检查每个必需项
for var in "${REQUIRED_VARS[@]}"; do
  grep -q "^${var}=" /opt/opclaw/.env.production || {
    echo "❌ 缺少必需配置: ${var}"
    exit 1
  }
done
```

### 配置变更流程

**修改配置的步骤**:
1. **备份当前配置**:
   ```bash
   cp /opt/opclaw/.env.production \
      /opt/opclaw/backups/.env.production.backup
   ```

2. **编辑配置文件**:
   ```bash
   vi /opt/opclaw/.env.production
   ```

3. **验证配置**:
   ```bash
   # 检查占位符
   grep -E 'placeholder|TODO|FIXME' /opt/opclaw/.env.production

   # 检查必需项
   for var in DB_PASSWORD REDIS_PASSWORD FEISHU_APP_ID \
              FEISHU_APP_SECRET JWT_SECRET DEEPSEEK_API_KEY; do
     grep -q "^${var}=" /opt/opclaw/.env.production
   done
   ```

4. **重启服务**:
   ```bash
   cd /opt/opclaw
   docker compose up -d backend frontend
   ```

5. **验证服务**:
   ```bash
   curl http://localhost:3000/health
   docker logs opclaw-backend --tail 50
   ```

---

## 数据库保护 (Database Protection)

### 数据库保护机制

#### 保护 1: 禁止删除 Volume

**风险命令**:
```bash
# ❌ 危险: 会删除数据库数据
docker compose down -v

# ❌ 危险: 会删除 volume
docker volume rm postgres-data
```

**保护措施**:
```bash
# 1. 部署脚本不包含 `down -v` 命令
# 2. 使用 `up -d` 而不是 `down`
# 3. 永不使用 `-v` 标志删除 volume
```

#### 保护 2: 部署前自动备份

**自动备份**:
```bash
# 每次部署前自动执行
docker exec opclaw-postgres pg_dump -U opclaw opclaw | \
  gzip > /opt/opclaw/backups/database/opclaw_db_TIMESTAMP.sql.gz
```

**备份内容**:
- 完整数据库结构和数据
- 压缩格式 (`.sql.gz`)
- 时间戳命名

#### 保护 3: 数据库恢复机制

**恢复步骤**:
```bash
# 1. 查找最新备份
LATEST_BACKUP=$(ls -t /opt/opclaw/backups/database/opclaw_db_*.sql.gz | head -1)

# 2. 停止应用（防止写入）
docker compose stop backend

# 3. 恢复数据库
gunzip < $LATEST_BACKUP | \
  docker exec -i opclaw-postgres psql -U opclaw opclaw

# 4. 重启应用
docker compose start backend

# 5. 验证恢复
docker exec opclaw-postgres pg_isready -U opclaw
```

#### 保护 4: 数据库连接验证

**部署前验证**:
```bash
# 检查数据库容器运行
docker ps --format '{{.Names}}' | grep opclaw-postgres

# 检查数据库连接
docker exec opclaw-postgres pg_isready -U opclaw
```

**部署后验证**:
```bash
# 健康检查包含数据库连接
docker exec opclaw-postgres pg_isready -U opclaw
```

---

## 回滚机制 (Rollback Mechanism)

### 自动回滚触发条件

**触发条件**:
- ❌ 健康检查失败（3次重试后）
- ❌ 后端服务不可用
- ❌ 数据库连接失败

### 回滚流程

**自动回滚步骤**:
```bash
# 1. 查找最新备份
LATEST_BACKUP=$(ls -t /opt/opclaw/backups/code_backup_*.tar.gz | head -1)

# 2. 停止当前服务
cd /opt/opclaw
docker compose stop backend frontend

# 3. 恢复代码
tar -xzf $LATEST_BACKUP -C /opt/opclaw

# 4. 重新构建（如需要）
docker compose build backend

# 5. 重启服务
docker compose up -d backend frontend

# 6. 健康检查
curl http://localhost:3000/health
```

**回滚时间目标**:
- ⏱️ **目标**: < 3 分钟
- ⏱️ **实际**: 通常 1-2 分钟

### 手动回滚

**如果自动回滚失败**:
```bash
# 1. SSH 到服务器
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190

# 2. 查看可用备份
ls -lht /opt/opclaw/backups/

# 3. 选择备份并恢复
# 恢复配置
cp /opt/opclaw/backups/.env.production.YYYYMMDD_HHMMSS \
   /opt/opclaw/.env.production

# 恢复数据库
gunzip < /opt/opclaw/backups/database/opclaw_db_TIMESTAMP.sql.gz | \
  docker exec -i opclaw-postgres psql -U opclaw opclaw

# 恢复代码
cd /opt/opclaw
tar -xzf /opt/opclaw/backups/code_backup_TIMESTAMP.tar.gz

# 4. 重启服务
docker compose up -d

# 5. 验证
docker ps
curl http://localhost:3000/health
```

---

## 部署检查清单 (Deployment Checklist)

### 部署前检查

- [ ] **确认部署目的**
  - [ ] 部署原因: 新功能 / Bug 修复 / 配置变更
  - [ ] 影响范围: backend / frontend / database / all

- [ ] **代码准备**
  - [ ] 代码已合并到 main 分支
  - [ ] 单元测试通过
  - [ ] 代码审查完成

- [ ] **配置准备**
  - [ ] 配置文件无占位符
  - [ ] 必需配置项完整
  - [ ] 配置变更已记录

- [ ] **备份准备**
  - [ ] 备份目录存在且有空间
  - [ ] 数据库可正常备份
  - [ ] 配置可正常备份

### 部署中监控

- [ ] **GitHub Actions 日志**
  - [ ] 预检查通过
  - [ ] 单元测试通过
  - [ ] 配置验证通过
  - [ ] 数据库保护检查通过
  - [ ] 备份创建成功
  - [ ] 部署执行中
  - [ ] 健康检查通过

### 部署后验证

- [ ] **服务状态**
  - [ ] 所有容器运行
  - [ ] 后端健康检查通过
  - [ ] 前端可访问
  - [ ] 数据库连接正常

- [ ] **功能验证**
  - [ ] 用户可登录
  - [ ] 核心功能可用
  - [ ] 无明显错误

- [ ] **日志检查**
  - [ ] 后端日志无错误
  - [ ] 前端日志无错误
  - [ ] 数据库日志正常

---

## 故障排查 (Troubleshooting)

### 常见问题

#### 问题 1: 单元测试失败

**症状**: GitHub Actions 在单元测试阶段失败

**原因**: 代码问题或测试问题

**解决方案**:
```bash
# 本地运行测试
cd platform/backend
pnpm test

# 修复失败的测试
# 重新提交代码
# 重新触发部署
```

#### 问题 2: 配置验证失败

**症状**: 配置验证阶段失败，提示占位符或缺少配置

**原因**: 配置文件包含占位符或缺少必需配置

**解决方案**:
```bash
# SSH 到服务器
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190

# 检查配置文件
cat /opt/opclaw/.env.production | grep -E 'placeholder|TODO|FIXME'

# 检查必需配置
for var in DB_PASSWORD REDIS_PASSWORD FEISHU_APP_ID \
           FEISHU_APP_SECRET JWT_SECRET DEEPSEEK_API_KEY; do
  grep "^${var}=" /opt/opclaw/.env.production || echo "Missing: $var"
done

# 修复配置后重新部署
```

#### 问题 3: 健康检查失败

**症状**: 部署后健康检查失败，自动回滚

**原因**: 服务启动失败或配置错误

**解决方案**:
```bash
# SSH 到服务器
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190

# 检查容器状态
docker ps -a | grep opclaw

# 检查后端日志
docker logs opclaw-backend --tail 100

# 检查数据库日志
docker logs opclaw-postgres --tail 100

# 手动健康检查
curl http://localhost:3000/health
docker exec opclaw-postgres pg_isready -U opclaw

# 根据日志修复问题
# 重新部署
```

#### 问题 4: 回滚失败

**症状**: 部署失败后自动回滚也失败

**原因**: 备份文件损坏或不存在

**解决方案**:
```bash
# SSH 到服务器
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190

# 检查备份
ls -lht /opt/opclaw/backups/

# 如果备份文件损坏，尝试更早的备份
LATEST_BACKUP=$(ls -t /opt/opclaw/backups/code_backup_*.tar.gz | head -1)

# 手动回滚
cd /opt/opclaw
docker compose stop
tar -xzf $LATEST_BACKUP
docker compose up -d

# 如果所有备份都失败，手动恢复服务
# 1. 恢复数据库备份
# 2. 恢复配置备份
# 3. 重新构建镜像
```

#### 问题 5: 部署卡住

**症状**: GitHub Actions 工作流运行时间过长，无响应

**原因**: SSH 连接问题或服务器资源不足

**解决方案**:
```bash
# 1. 取消 GitHub Actions 工作流
# 2. SSH 到服务器检查状态
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190

# 检查部署进程
ps aux | grep deploy

# 检查 Docker 操作
docker ps

# 检查服务器资源
htop
df -h

# 清理卡住的进程
# 重新触发部署
```

---

## 最佳实践 (Best Practices)

### 部署频率

**推荐做法**:
- 小步快跑: 频繁小部署而非少量大部署
- 每周至少一次: 保持部署流程熟悉度
- 重要变更后: 立即部署验证

### 部署时间

**推荐时间**:
- 非高峰时段: 周末或凌晨
- 提前通知: 如果可能影响用户
- 准备回滚: 始终准备快速回滚

### 监控告警

**部署后监控**:
- 检查服务日志: `docker logs opclaw-backend --tail 100`
- 检查错误率: 观察应用错误日志
- 检查响应时间: 确保性能正常

### 团队协作

**部署前沟通**:
- 通知团队: 即将进行部署
- 说明影响: 哪些服务可能受影响
- 预计时间: 部署预计耗时

**部署后总结**:
- 记录问题: 遇到的问题和解决方案
- 更新文档: 如果流程有变化
- 分享经验: 团队内分享部署经验

---

## 附录 (Appendix)

### 环境变量完整列表

```bash
# 数据库配置
DB_HOST=postgres
DB_PORT=5432
DB_NAME=opclaw
DB_USERNAME=opclaw
DB_PASSWORD=<必需>
POSTGRES_DB=opclaw
POSTGRES_USER=opclaw
POSTGRES_PASSWORD=<必需>

# Redis配置
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=<必需>

# 应用配置
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Feishu OAuth
FEISHU_APP_ID=<必需>
FEISHU_APP_SECRET=<必需>
FEISHU_REDIRECT_URI=https://renava.cn/oauth/callback
FEISHU_OAUTH_AUTHORIZE_URL=https://open.feishu.cn/open-apis/authen/v1/authorize
FEISHU_OAUTH_TOKEN_URL=https://open.feishu.cn/open-apis/authen/v1/oidc/access_token
FEISHU_OAUTH_USERINFO_URL=https://open.feishu.cn/open-apis/authen/v1/user_info
FEISHU_VERIFY_TOKEN=<必需>
FEISHU_ENCRYPT_KEY=<必需>

# DeepSeek API
DEEPSEEK_API_KEY=<必需>
DEEPSEEK_API_BASE=https://api.deepseek.com/v1

# JWT配置
JWT_SECRET=<必需>
JWT_EXPIRES_IN=7d
SESSION_SECRET=<必需>

# CORS配置
CORS_ALLOWED_ORIGINS=https://renava.cn,https://www.renava.cn

# Docker配置
DOCKER_HOST=unix:///var/run/docker.sock
DOCKER_NETWORK=opclaw-network

# 其他配置
ENABLE_METRICS=true
```

### 端口使用

```bash
# 后端
3000: Backend API
3002: WebSocket

# 数据库
5432: PostgreSQL

# Redis
6379: Redis

# 前端
80: HTTP (Nginx)
443: HTTPS (Nginx)
```

### 目录结构

```
/opt/opclaw/
├── .env.production              # 唯一配置源
├── docker-compose.prod.yml      # 生产环境 Docker Compose
├── platform/
│   ├── backend/                 # 后端代码
│   │   ├── src/
│   │   ├── dist/
│   │   └── Dockerfile
│   └── frontend/                # 前端代码
│       ├── src/
│       ├── dist/
│       └── nginx.conf
├── backups/                     # 备份目录
│   ├── .env.production.*        # 配置备份
│   ├── database/                # 数据库备份
│   │   └── opclaw_db_*.sql.gz
│   └── code_backup_*.tar.gz     # 代码备份
├── ssl/                         # SSL 证书
│   └── certs/
├── init-db.sql/                 # 数据库初始化脚本
└── config/
    └── nginx/
        ├── nginx.conf
        └── conf.d/
```

---

**版本信息**:
- 文档版本: v2.0.0 (单生产环境)
- 最后更新: 2026-03-18
- 维护者: DevOps Team

**变更历史**:
- v2.0.0 (2026-03-18): 重写为单生产环境部署流程
- v1.0.0 (2026-03-18): 初始版本（多环境）
