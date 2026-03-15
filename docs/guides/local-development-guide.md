# AIOpc 本地开发指南

> **最后更新**: 2026-03-14
> **适用场景**: 本地开发和测试环境
> **阅读时间**: 约 10 分钟

---

## 目录

1. [快速开始](#快速开始)
2. [环境要求](#环境要求)
3. [项目结构](#项目结构)
4. [服务说明](#服务说明)
5. [开发工作流](#开发工作流)
6. [调试技巧](#调试技巧)
7. [常见问题](#常见问题)
8. [生产部署](#生产部署)

---

## 快速开始

### 一键启动 (推荐)

```bash
# 克隆项目
git clone <repo-url>
cd AIOpc

# 运行一键设置脚本
./scripts/setup-local-dev.sh
```

脚本会自动完成:
- ✅ 检查系统依赖 (Docker, Node.js, pnpm)
- ✅ 创建配置文件
- ✅ 启动所有服务
- ✅ 运行数据库迁移
- ✅ 显示访问地址和测试账号

### 手动启动

```bash
# 1. 创建配置文件
cp platform/backend/.env.example platform/backend/.env.development
cp platform/frontend/.env.example platform/frontend/.env.development

# 2. 配置 DeepSeek API Key (必需)
echo "DEEPSEEK_API_KEY=your_actual_key" >> platform/backend/.env.development

# 3. 启动服务
docker compose -f docker-compose.dev.yml up -d

# 4. 运行数据库迁移
docker compose -f docker-compose.dev.yml exec backend pnpm run db:migrate

# 5. 访问应用
open http://localhost:5173
```

---

## 环境要求

### 必需依赖

| 工具 | 版本要求 | 用途 | 检查命令 |
|------|---------|------|----------|
| Docker | >= 20.10 | 容器运行时 | `docker --version` |
| Docker Compose | >= V2 | 容器编排 | `docker compose version` |
| Node.js | >= 22 | 运行时环境 | `node --version` |
| pnpm | >= 8 | 包管理器 | `pnpm --version` |

### 推荐配置

| 资源 | 最低配置 | 推荐配置 |
|------|---------|----------|
| CPU | 2 核 | 4 核 |
| 内存 | 4 GB | 8 GB |
| 磁盘 | 10 GB | 20 GB |

### 安装依赖

**macOS**:
```bash
# 安装 Homebrew (如果未安装)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 安装 Docker Desktop
brew install --cask docker

# 安装 Node.js (包含 pnpm)
brew install node
npm install -g pnpm
```

**Linux (Ubuntu/Debian)**:
```bash
# 安装 Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 安装 Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装 pnpm
npm install -g pnpm
```

**Windows**:
1. 安装 [Docker Desktop](https://www.docker.com/products/docker-desktop/)
2. 安装 [Node.js 22 LTS](https://nodejs.org/)
3. 安装 pnpm: `npm install -g pnpm`

---

## 项目结构

```
AIOpc/
├── platform/                    # 平台代码
│   ├── backend/                 # 后端服务
│   │   ├── src/
│   │   │   ├── controllers/     # 控制器
│   │   │   ├── services/        # 业务逻辑
│   │   │   ├── repositories/    # 数据访问层
│   │   │   ├── entities/        # 数据库实体
│   │   │   ├── middleware/      # 中间件
│   │   │   ├── routes/          # 路由
│   │   │   └── config/          # 配置
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── .env.development     # 开发环境变量
│   │   └── Dockerfile
│   └── frontend/                # 前端应用
│       ├── src/
│       │   ├── pages/           # 页面组件
│       │   ├── components/      # 通用组件
│       │   ├── contexts/        # React Context
│       │   └── main.tsx
│       ├── package.json
│       ├── vite.config.ts
│       ├── .env.development     # 开发环境变量
│       └── Dockerfile
├── mock-services/               # Mock 服务
│   └── feishu/                  # Mock 飞书 OAuth
│       ├── src/
│       │   └── server.ts
│       ├── package.json
│       └── Dockerfile
├── scripts/                     # 脚本
│   ├── setup-local-dev.sh       # 本地环境设置
│   ├── deploy-local.sh          # 本地部署
│   └── init-dev-db.sql          # 数据库初始化
├── deployment/                  # 部署配置
│   ├── docker-compose.yml       # 生产环境编排
│   └── nginx.conf               # Nginx 配置
├── docker-compose.dev.yml       # 开发环境编排
├── docs/                        # 文档
│   ├── deployment/              # 部署文档
│   ├── fips/                    # 功能实现提案
│   └── guides/                  # 指南
└── claudedocs/                  # Claude Code 生成的文档
```

---

## 服务说明

### 核心服务

| 服务 | 容器名 | 端口 | 用途 | 启动时间 |
|------|--------|------|------|----------|
| **Frontend** | opclaw-frontend-dev | 5173 | React 前端应用 | ~5s |
| **Backend** | opclaw-backend-dev | 3000 | Node.js API 服务 | ~3s |
| **PostgreSQL** | opclaw-postgres-dev | 5432 | PostgreSQL 数据库 | ~3s |
| **Redis** | opclaw-redis-dev | 6379 | Redis 缓存 | ~2s |
| **Mock Feishu** | opclaw-feishu-mock | 3001 | Mock 飞书 OAuth | ~2s |

### 可选服务 (开发工具)

| 服务 | 容器名 | 端口 | 用途 | 启动方式 |
|------|--------|------|------|----------|
| **PgAdmin** | opclaw-pgadmin-dev | 5050 | PostgreSQL 管理 | `--profile tools` |
| **Redis Commander** | opclaw-redis-commander-dev | 8081 | Redis 管理 | `--profile tools` |

启动开发工具:
```bash
docker compose -f docker-compose.dev.yml --profile tools up -d
```

### 服务架构

```
┌─────────────────────────────────────────────────────────┐
│                    开发者浏览器                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  Frontend (Vite)                                    │ │
│  │  http://localhost:5173                              │ │
│  └──────────────┬──────────────────────────────────────┘ │
│                 │ HTTP                                   │
│  ┌──────────────┴──────────────────────────────────────┐ │
│  │  Backend (Express)                                  │ │
│  │  http://localhost:3000                              │ │
│  │  ┌──────────────┬──────────────┬──────────────┐    │ │
│  │  │ PostgreSQL   │ Redis        │ Mock Feishu  │    │ │
│  │  │ :5432        │ :6379        │ :3001        │    │ │
│  │  └──────────────┴──────────────┴──────────────┘    │ │
│  │                                                      │ │
│  │  /var/run/docker.sock ─────────────────────────┐    │ │
│  └──────────────────────────────────────────────────┼────┘ │
│                                                     │      │
│  ┌──────────────────────────────────────────────────┴────┐ │
│  │         宿主机 Docker Daemon                         │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐          │ │
│  │  │Instance1 │  │Instance2 │  │Instance3 │  ...     │ │
│  │  └──────────┘  └──────────┘  └──────────┘          │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## 开发工作流

### 1. 启动开发环境

```bash
# 启动所有服务
docker compose -f docker-compose.dev.yml up -d

# 查看服务状态
docker compose -f docker-compose.dev.yml ps

# 查看服务日志
docker compose -f docker-compose.dev.yml logs -f

# 查看特定服务日志
docker compose -f docker-compose.dev.yml logs -f backend
```

### 2. 后端开发

**热更新**: 代码修改后自动重启 (~2秒)

```bash
# 进入后端容器
docker compose -f docker-compose.dev.yml exec backend sh

# 运行测试
pnpm run test

# 运行测试覆盖率
pnpm run test:coverage

# 运行 Lint
pnpm run lint

# 运行数据库迁移
pnpm run db:migrate

# 回滚迁移
pnpm run db:revert
```

**代码位置**: `platform/backend/src/`

**重要文件**:
- `app.ts` - 应用入口
- `config/database.ts` - 数据库配置
- `config/redis.ts` - Redis 配置
- `entities/` - 数据库实体
- `services/` - 业务逻辑

### 3. 前端开发

**热更新**: 代码修改后自动刷新 (< 1秒)

```bash
# 进入前端容器
docker compose -f docker-compose.dev.yml exec frontend sh

# 运行测试
pnpm run test

# 运行测试 UI
pnpm run test:ui

# 运行测试覆盖率
pnpm run test:coverage

# 运行 Lint
pnpm run lint

# 构建
pnpm run build
```

**代码位置**: `platform/frontend/src/`

**重要文件**:
- `main.tsx` - 应用入口
- `App.tsx` - 根组件
- `pages/` - 页面组件
- `components/` - 通用组件
- `contexts/` - React Context

### 4. 数据库操作

**使用 psql**:
```bash
# 连接到数据库
docker compose -f docker-compose.dev.yml exec postgres psql -U opclaw -d opclaw_dev

# 常用 SQL 命令
\dt                    # 列出所有表
\d+ users              # 查看表结构
SELECT * FROM users;   # 查询数据
\q                     # 退出
```

**使用 PgAdmin** (可选):
1. 启动 PgAdmin: `docker compose -f docker-compose.dev.yml --profile tools up -d`
2. 访问: http://localhost:5050
3. 登录: admin@example.com / admin
4. 添加服务器:
   - Host: postgres
   - Port: 5432
   - Database: opclaw_dev
   - Username: opclaw
   - Password: dev_password

### 5. Redis 操作

**使用 redis-cli**:
```bash
# 连接到 Redis
docker compose -f docker-compose.dev.yml exec redis redis-cli -a dev_password

# 常用命令
KEYS *              # 列出所有键
GET key_name        # 获取值
SET key_name value  # 设置值
DEL key_name        # 删除键
FLUSHDB             # 清空当前数据库
EXIT                # 退出
```

**使用 Redis Commander** (可选):
1. 启动 Redis Commander: `docker compose -f docker-compose.dev.yml --profile tools up -d`
2. 访问: http://localhost:8081
3. 自动连接到本地 Redis

### 6. 实例管理

**查看运行中的实例**:
```bash
docker ps | grep opclaw-instance
```

**查看实例日志**:
```bash
docker logs opclaw-instance-123
docker logs -f opclaw-instance-123  # 实时查看
```

**进入实例容器**:
```bash
docker exec -it opclaw-instance-123 sh
```

**手动测试实例创建**:
```bash
# 使用 Backend API 创建实例
curl -X POST http://localhost:3000/api/instances \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "测试实例",
    "description": "手动创建的测试实例",
    "skills": ["conversation", "code_interpreter"],
    "systemPrompt": "你是一个有帮助的 AI 助手",
    "temperature": 0.7,
    "maxTokens": 4000
  }'
```

### 7. 停止和清理

```bash
# 停止所有服务
docker compose -f docker-compose.dev.yml down

# 停止并删除数据卷 (⚠️ 会删除所有数据)
docker compose -f docker-compose.dev.yml down -v

# 重启特定服务
docker compose -f docker-compose.dev.yml restart backend

# 重建并启动服务
docker compose -f docker-compose.dev.yml up -d --build
```

---

## 调试技巧

### 1. 后端调试

**查看详细日志**:
```bash
# 实时查看后端日志
docker compose -f docker-compose.dev.yml logs -f backend

# 查看最近 100 行日志
docker compose -f docker-compose.dev.yml logs --tail=100 backend
```

**使用 Node.js 调试器**:
```bash
# 启动调试模式
docker compose -f docker-compose.dev.yml exec backend sh
node --inspect-brk=0.0.0.0:9229 dist/app.js
```

然后在 Chrome DevTools 中打开 `chrome://inspect`

**使用 VS Code 调试**:
创建 `.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "attach",
      "name": "Attach to Backend",
      "port": 9229,
      "address": "localhost",
      "remoteRoot": "/app",
      "localRoot": "${workspaceFolder}/platform/backend"
    }
  ]
}
```

### 2. 前端调试

**浏览器 DevTools**:
1. 打开 http://localhost:5173
2. 按 F12 打开 DevTools
3. 使用 React DevTools 查看组件树

**网络调试**:
1. DevTools → Network 标签
2. 查看 API 请求和响应
3. 检查请求头和请求体

**Console 日志**:
```typescript
// 在组件中添加日志
console.log('Debug info:', data);
console.error('Error:', error);
```

### 3. 数据库调试

**慢查询分析**:
```sql
-- 查看正在运行的查询
SELECT pid, query, state, wait_event
FROM pg_stat_activity
WHERE state != 'idle';

-- 查看慢查询
SELECT query, calls, total_time, mean_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
```

**查看表大小**:
```sql
SELECT
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### 4. Redis 调试

**查看内存使用**:
```bash
docker compose -f docker-compose.dev.yml exec redis redis-cli -a dev_password INFO memory
```

**查看慢查询**:
```bash
docker compose -f docker-compose.dev.yml exec redis redis-cli -a dev_password SLOWLOG GET 10
```

### 5. Docker 调试

**查看容器资源使用**:
```bash
docker stats
```

**查看容器详细信息**:
```bash
docker inspect opclaw-backend-dev
```

**进入容器文件系统**:
```bash
docker compose -f docker-compose.dev.yml exec backend sh
cd /app
ls -la
```

---

## 常见问题

### 1. 端口已被占用

**问题**: 启动服务时报错 `port is already allocated`

**解决**:
```bash
# 查看占用端口的进程
lsof -i :3000  # macOS/Linux
netstat -ano | findstr :3000  # Windows

# 停止占用端口的进程
kill -9 <PID>  # macOS/Linux
taskkill /PID <PID> /F  # Windows
```

### 2. Docker 服务启动失败

**问题**: 容器无法启动或立即退出

**解决**:
```bash
# 查看容器日志
docker compose -f docker-compose.dev.yml logs backend

# 检查配置文件
cat platform/backend/.env.development

# 重建容器
docker compose -f docker-compose.dev.yml up -d --force-recreate
```

### 3. 数据库连接失败

**问题**: Backend 无法连接到 PostgreSQL

**解决**:
```bash
# 检查 PostgreSQL 是否运行
docker compose -f docker-compose.dev.yml ps postgres

# 测试连接
docker compose -f docker-compose.dev.yml exec postgres pg_isready -U opclaw

# 检查网络
docker compose -f docker-compose.dev.yml exec backend ping postgres
```

### 4. 前端无法访问后端 API

**问题**: 前端请求后端 API 时出现 CORS 或网络错误

**解决**:
```bash
# 检查后端是否运行
curl http://localhost:3000/health

# 检查前端代理配置
cat platform/frontend/vite.config.ts

# 查看后端 CORS 配置
docker compose -f docker-compose.dev.yml logs backend | grep -i cors
```

### 5. Mock 飞书服务不工作

**问题**: OAuth 流程失败

**解决**:
```bash
# 检查 Mock 服务是否运行
curl http://localhost:3001/health

# 查看 Mock 服务日志
docker compose -f docker-compose.dev.yml logs feishu-mock

# 检查后端配置
docker compose -f docker-compose.dev.yml exec backend env | grep FEISHU
```

### 6. 实例创建失败

**问题**: 创建 OpenClaw 实例时报错

**解决**:
```bash
# 检查 Docker socket 挂载
docker compose -f docker-compose.dev.yml exec backend ls -la /var/run/docker.sock

# 测试 Docker 权限
docker compose -f docker-compose.dev.yml exec backend docker ps

# 检查实例日志
docker logs opclaw-instance-123

# 手动测试 Docker
docker run --rm hello-world
```

### 7. 磁盘空间不足

**问题**: Docker 占用过多磁盘空间

**解决**:
```bash
# 查看 Docker 磁盘使用
docker system df

# 清理未使用的镜像
docker image prune -a

# 清理未使用的容器
docker container prune

# 清理未使用的卷
docker volume prune

# 完全清理 (⚠️ 谨慎使用)
docker system prune -a --volumes
```

### 8. 内存不足

**问题**: 系统变慢或容器被 OOM 杀死

**解决**:
```bash
# 查看内存使用
docker stats

# 限制容器内存
# 在 docker-compose.dev.yml 中添加:
# mem_limit: 512m
# memswap_limit: 1g

# 减少并发实例数量
```

---

## 生产部署

### 从本地到生产

**代码兼容性**: 本地开发环境的代码可直接部署到生产环境，无需修改。

**环境变量差异**:
- 本地: 使用 `.env.development`
- 生产: 使用 `.env.production` 或环境变量

**配置差异**:
- 本地: Mock 飞书服务
- 生产: 真实飞书 OAuth
- 本地: Docker socket 挂载
- 生产: Docker socket 挂载 (需安全加固)

### 生产部署清单

- [ ] 更新环境变量 (生产数据库、Redis、飞书配置)
- [ ] 配置真实飞书应用
- [ ] 配置 SSL 证书
- [ ] 配置域名和 DNS
- [ ] 配置防火墙规则
- [ ] 配置日志聚合
- [ ] 配置监控和告警
- [ ] 配置备份策略
- [ ] 执行数据库迁移
- [ ] 运行冒烟测试

### 部署脚本

参考 `docs/deployment/FIP_001_REVISED_local_first.md` 中的生产部署指南。

---

## 附录

### A. 环境变量参考

**后端环境变量** (`platform/backend/.env.development`):
```env
# 服务器配置
PORT=3000
NODE_ENV=development

# 数据库配置
DB_HOST=postgres
DB_PORT=5432
DB_NAME=opclaw_dev
DB_USER=opclaw
DB_PASSWORD=dev_password

# Redis 配置
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=dev_password

# JWT 配置
JWT_SECRET=dev_jwt_secret_change_in_production
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# 飞书配置
FEISHU_APP_ID=mock_app_id
FEISHU_APP_SECRET=mock_app_secret
FEISHU_REDIRECT_URI=http://localhost:5173/oauth/callback

# DeepSeek API
DEEPSEEK_API_KEY=your_actual_key
```

**前端环境变量** (`platform/frontend/.env.development`):
```env
# API 基础 URL
VITE_API_BASE_URL=http://localhost:3000
```

### B. 常用命令速查

```bash
# 启动/停止
docker compose -f docker-compose.dev.yml up -d
docker compose -f docker-compose.dev.yml down
docker compose -f docker-compose.dev.yml restart backend

# 日志
docker compose -f docker-compose.dev.yml logs -f
docker compose -f docker-compose.dev.yml logs --tail=100 backend

# 进入容器
docker compose -f docker-compose.dev.yml exec backend sh
docker compose -f docker-compose.dev.yml exec postgres psql -U opclaw -d opclaw_dev

# 数据库
pnpm run db:migrate
pnpm run db:revert

# 测试
pnpm run test
pnpm run test:coverage
pnpm run lint
```

### C. 资源链接

- **项目文档**: `/docs`
- **API 文档**: http://localhost:3000/api/docs (启动后访问)
- **Docker 文档**: https://docs.docker.com/
- **Node.js 文档**: https://nodejs.org/docs
- **React 文档**: https://react.dev/
- **TypeScript 文档**: https://www.typescriptlang.org/docs/

---

**文档维护**: 请在更新配置或流程时同步更新本文档。
**问题反馈**: 如遇到问题，请查看 [常见问题](#常见问题) 或提交 Issue。
