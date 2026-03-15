# 本地开发环境快速参考

## 🎯 当前状态

**完整的本地开发环境已就绪！**

✅ 所有 15 项测试通过
✅ 6 个核心服务运行中
✅ OAuth 流程正常工作
✅ Mock OpenClaw AI Agent 可用

---

## 🚀 快速启动

### 一键启动所有服务

```bash
# 启动 Docker 服务 (PostgreSQL, Redis)
docker compose -f docker-compose.dev.yml up -d

# 启动 Mock 飞书 OAuth
cd mock-services/feishu && pnpm run dev &

# 启动 Mock OpenClaw
cd mock-services/openclaw && pnpm start &

# 启动后端 API
cd platform/backend && pnpm run dev &

# 启动前端应用
cd platform/frontend && pnpm run dev
```

### 快速验证

```bash
# 运行完整测试套件
./scripts/test-all-services.sh

# 测试 OAuth 流程
./scripts/test-oauth-flow.sh
```

---

## 📊 服务清单

| 服务 | 端口 | URL | 状态 |
|------|------|-----|------|
| 前端 (Vite) | 5173 | http://localhost:5173 | ✅ 运行中 |
| 后端 API | 3000 | http://localhost:3000 | ✅ 运行中 |
| Mock 飞书 | 3001 | http://localhost:3001 | ✅ 运行中 |
| Mock OpenClaw | 3002 | http://localhost:3002 | ✅ 运行中 |
| PostgreSQL | 5432 | localhost:5432 | ✅ 运行中 |
| Redis | 6379 | localhost:6379 | ✅ 运行中 |

---

## 🔑 常用命令

### 前端开发

```bash
cd platform/frontend

# 安装依赖
pnpm install

# 启动开发服务器
pnpm run dev

# 构建生产版本
pnpm run build

# 预览生产构建
pnpm run preview
```

### 后端开发

```bash
cd platform/backend

# 安装依赖
pnpm install

# 启动开发服务器 (热重载)
pnpm run dev

# 构建生产版本
pnpm run build

# 启动生产服务器
pnpm start
```

### 数据库操作

```bash
# 访问 PostgreSQL
docker exec -it opclaw-postgres-dev psql -U opclaw -d opclaw_dev

# 备份数据库
docker exec opclaw-postgres-dev pg_dump -U opclaw opclaw_dev | gzip > backup.sql.gz

# 恢复数据库
gunzip < backup.sql.gz | docker exec -i opclaw-postgres-dev psql -U opclaw opclaw_dev
```

### Docker 服务

```bash
# 启动所有服务
docker compose -f docker-compose.dev.yml up -d

# 查看服务状态
docker compose -f docker-compose.dev.yml ps

# 查看日志
docker compose -f docker-compose.dev.yml logs -f

# 停止所有服务
docker compose -f docker-compose.dev.yml down

# 重启单个服务
docker restart opclaw-postgres-dev
```

---

## 🧪 测试指南

### OAuth 流程测试

1. **自动化测试**
   ```bash
   ./scripts/test-oauth-flow.sh
   ```

2. **手动浏览器测试**
   - 访问: http://localhost:5173/login
   - 打开开发者工具 (F12)
   - 复制授权 URL
   - 在新标签页打开授权 URL
   - 点击授权按钮
   - 自动跳转回前端并创建会话

### Mock OpenClaw 测试

```bash
# 健康检查
curl http://localhost:3002/health

# 聊天测试
curl -X POST http://localhost:3002/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"你好","session_id":"test-123"}'

# 查看 Tools
curl http://localhost:3002/tools

# 查看 Skills
curl http://localhost:3002/skills
```

### API 端点测试

```bash
# 健康检查
curl http://localhost:3000/health

# OAuth 授权
curl "http://localhost:3000/api/oauth/authorize?redirect_uri=http://localhost:5173/oauth/callback"

# 实例列表 (需要登录 Token)
curl -H "Authorization: Bearer <TOKEN>" http://localhost:3000/api/instances
```

---

## 📁 项目结构

```
AIOpc/
├── platform/
│   ├── frontend/          # React + TypeScript 前端
│   │   ├── src/
│   │   │   ├── components/    # React 组件
│   │   │   ├── contexts/      # Context (Auth, etc.)
│   │   │   ├── services/      # API 服务
│   │   │   ├── pages/         # 页面组件
│   │   │   └── utils/         # 工具函数
│   │   └── package.json
│   │
│   └── backend/           # Node.js + Express 后端
│       ├── src/
│       │   ├── controllers/   # 控制器
│       │   ├── services/      # 业务逻辑
│       │   ├── entities/      # TypeORM 实体
│       │   └── middleware/    # 中间件
│       └── package.json
│
├── mock-services/
│   ├── feishu/            # Mock 飞书 OAuth 服务
│   └── openclaw/          # Mock OpenClaw AI Agent
│
├── scripts/               # 工具脚本
│   ├── setup-local-dev.sh
│   ├── test-oauth-flow.sh
│   └── test-all-services.sh
│
├── docs/
│   └── guides/
│       ├── LOCAL_TESTING_GUIDE.md    # 详细测试指南
│       └── QUICK_REFERENCE.md        # 本文件
│
└── docker-compose.dev.yml  # Docker 编排配置
```

---

## 🔐 环境变量

### 开发环境配置

**platform/backend/.env.development**
```bash
# 服务器
PORT=3000
NODE_ENV=development

# 数据库
DB_HOST=postgres
DB_PORT=5432
DB_USERNAME=opclaw
DB_PASSWORD=dev_password
DB_NAME=opclaw_dev

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=dev_password

# JWT
JWT_SECRET=your-jwt-secret-key
JWT_EXPIRES_IN=7d

# 飞书 OAuth (Mock)
FEISHU_APP_ID=mock_app_id
FEISHU_APP_SECRET=mock_app_secret
FEISHU_REDIRECT_URI=http://localhost:5173/oauth/callback
```

**platform/frontend/.env.development**
```bash
# API Base URL
VITE_API_BASE_URL=http://localhost:3000/api
```

---

## 🛠️ 故障排查

### 前端无法连接后端

1. 检查后端是否运行: `curl http://localhost:3000/health`
2. 检查前端代理配置: `platform/frontend/vite.config.ts`
3. 检查 CORS 配置

### OAuth 回调失败

1. 检查 Mock 飞书服务: `curl http://localhost:3001/health`
2. 检查回调 URL 配置
3. 检查前端路由配置

### 数据库连接失败

1. 检查 Docker PostgreSQL: `docker compose -f docker-compose.dev.yml ps postgres`
2. 检查数据库密码: `.env.development` 中的 `DB_PASSWORD`
3. 测试连接: `docker exec opclaw-postgres-dev psql -U opclaw -d opclaw_dev`

---

## 📚 相关文档

- **详细测试指南**: `docs/guides/LOCAL_TESTING_GUIDE.md`
- **Mock OpenClaw 文档**: `mock-services/openclaw/README.md`
- **项目架构**: `CLAUDE.md`
- **FIP-001**: `docs/fips/FIP_001_scan_to_enable.md`

---

## 🎯 下一步任务

### 立即可执行

1. **实现 E2E 测试**
   - 安装 Playwright: `cd platform/frontend && pnpm add -D @playwright/test`
   - 创建测试用例

2. **测试实例创建流程**
   - 使用 Mock OpenClaw 镜像
   - 测试 InstanceService
   - 验证 Docker 容器管理

3. **完善 Mock 服务**
   - 增强飞书 Webhook 处理
   - 添加更多 OpenClaw 功能

### 需要外部资源

- TASK-020: 飞书开放平台配置 (需要域名)
- TASK-029: 生产环境部署 (需要云资源)
- TASK-030: MVP 验收 (需要完整功能)

---

## 💡 提示

- 使用 `./scripts/test-all-services.sh` 快速验证所有服务
- 使用 `./scripts/test-oauth-flow.sh` 测试 OAuth 流程
- 所有服务都已配置热重载，修改代码后自动重启
- 数据库数据在 Docker 容器中，重启不会丢失
- 如需完全重置环境: `docker compose -f docker-compose.dev.yml down -v`

---

**最后更新**: 2026-03-15
**环境状态**: ✅ 所有服务正常运行
