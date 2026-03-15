# 本地测试环境指南

## 概述

本指南说明如何在本地环境中测试 OpenClaw 平台的各个组件，无需依赖外部云资源。

---

## 1. OAuth 授权流程测试

### 测试方法

#### 方法 A: 自动化脚本测试

运行测试脚本:
```bash
./scripts/test-oauth-flow.sh
```

#### 方法 B: 手动浏览器测试

1. **访问登录页面**
   ```
   http://localhost:5173/login
   ```

2. **复制授权 URL**
   - 打开浏览器开发者工具 (F12)
   - 在控制台中执行: `document.querySelector('svg')?.parentElement?.href`
   - 或直接从网络请求中复制 `/api/oauth/authorize` 响应

3. **手动访问授权 URL**
   - 在新标签页打开复制的 URL
   - 格式: `http://localhost:3001/authen/v1/authorize?app_id=mock_app_id&redirect_uri=...`
   - 会看到 Mock 飞书授权页面

4. **完成授权**
   - 点击授权按钮
   - 自动重定向到 `http://localhost:5173/oauth/callback`
   - 前端自动处理 Token 并创建用户会话

### 验证点

| 步骤 | 验证点 | 命令 |
|------|--------|------|
| 1. 后端 API | OAuth 端点可访问 | `curl http://localhost:3000/api/oauth/authorize` |
| 2. Mock 飞书 | Mock 服务运行正常 | `curl http://localhost:3001/health` |
| 3. 前端应用 | 前端可访问 | `curl http://localhost:5173` |
| 4. 回调处理 | Token 正确存储 | 检查 localStorage |

---

## 2. OpenClaw 实例测试

### 当前状态

⚠️ **重要**: OpenClaw 是外部 AI Agent 框架，需要单独的 Docker 镜像。

当前本地环境:
- ✅ 平台后端 (InstanceService, DockerService) 已实现
- ✅ 实例管理界面已实现
- ❌ OpenClaw Docker 镜像不存在

### 本地测试方案

#### 方案 A: 使用 Mock OpenClaw 实例

创建一个简单的 Mock OpenClaw 容器用于测试:

✅ **状态**: 已完成并运行中

Mock OpenClaw 服务已创建并运行在 `http://localhost:3002`

**快速启动**:
```bash
# 方式 1: 本地运行 (推荐用于开发)
cd mock-services/openclaw
pnpm install
pnpm start

# 方式 2: Docker 运行 (推荐用于测试)
docker build -t mock-openclaw .
docker run -d --name mock-openclaw-instance -p 3002:3000 mock-openclaw
```

**测试 Mock OpenClaw**:
```bash
# 健康检查
curl http://localhost:3002/health

# 聊天测试
curl -X POST http://localhost:3002/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"测试消息","session_id":"test-123"}'

# 查看 Tools
curl http://localhost:3002/tools

# 查看 Skills
curl http://localhost:3002/skills
```

**可用端点**:
- `/health` - 健康检查
- `/chat` - 聊天接口
- `/agent/status` - Agent 状态
- `/tools` - Tools 列表
- `/skills` - Skills 列表
- `/sessions` - 会话管理
- `/api/test` - API 测试

详细文档: `mock-services/openclaw/README.md`

#### 方案 B: 测试实例管理功能 (不创建实际容器)

使用现有代码测试实例管理:

```bash
# 1. 确保所有服务运行
docker compose -f docker-compose.dev.yml ps

# 2. 测试后端 API
# 健康检查
curl http://localhost:3000/health

# 获取实例列表 (需要先登录获取 Token)
curl -H "Authorization: Bearer <TOKEN>" \
  http://localhost:3000/api/instances

# 创建实例 (需要认证)
curl -X POST \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"template": "personal", "name": "测试实例"}' \
  http://localhost:3000/api/instances
```

---

## 3. 可执行的本地任务

### 立即可执行的任务

| 任务 ID | 任务名称 | 状态 | 可执行性 |
|---------|---------|------|----------|
| TASK-020 | 飞书开放平台配置 | BLOCKED | ❌ 需要域名 |
| TASK-027 | 端到端测试 | PENDING | ⚠️ 需要 Playwright 配置 |
| TASK-028 | 性能测试 | PENDING | ❌ 需要完整环境 |
| TASK-029 | 生产环境部署 | PENDING | ❌ 需要云资源 |
| TASK-030 | MVP 验收 | PENDING | ❌ 需要完整功能 |

### 推荐的本地开发任务

#### 任务 A: 完善 Mock OpenClaw 服务

创建完整的 Mock OpenClaw 实例用于本地测试:

1. **创建 Mock OpenClaw Docker 镜像**
   - 实现基本的聊天接口
   - 实现健康检查接口
   - 模拟 DeepSeek API 调用

2. **测试实例创建流程**
   - 测试 InstanceService 创建实例
   - 验证 Docker 容器管理
   - 测试 API Key 分配

#### 任务 B: 实现 E2E 测试

使用 Playwright 实现端到端测试:

1. **安装 Playwright**
   ```bash
   cd platform/frontend
   pnpm add -D @playwright/test
   npx playwright install
   ```

2. **创建测试用例**
   - 测试登录流程
   - 测试实例创建
   - 测试实例操作

#### 任务 C: 完善 Mock 飞书服务

增强 Mock 飞书服务功能:

1. **实现完整的 OAuth 回调**
   - 处理授权码
   - 返回 JWT Token
   - 模拟用户信息

2. **实现消息接收**
   - Webhook 事件处理
   - 消息路由测试

---

## 4. 测试检查清单

### OAuth 流程测试

- [ ] 前端可以获取授权 URL
- [ ] 授权 URL 格式正确
- [ ] Mock 飞书服务可访问
- [ ] 回调 URL 正确配置
- [ ] Token 正确保存到 localStorage
- [ ] 登录后跳转到 Dashboard

### 实例管理测试

- [ ] 实例列表页面可访问
- [ ] 可以创建新实例
- [ ] 实例状态正确显示
- [ ] 可以启动/停止实例
- [ ] 可以删除实例

### API 测试

- [ ] 健康检查端点: `GET /health`
- [ ] OAuth 授权端点: `GET /api/oauth/authorize`
- [ ] 实例列表: `GET /api/instances`
- [ ] 创建实例: `POST /api/instances`
- [ ] 实例详情: `GET /api/instances/:id`

---

## 5. 故障排查

### 常见问题

#### Q: 前端无法连接后端 API

**A**: 检查以下项目:
1. 后端服务是否运行: `curl http://localhost:3000/health`
2. 前端代理配置: `platform/frontend/vite.config.ts`
3. CORS 配置: 后端 CORS 中间件

#### Q: OAuth 回调失败

**A**: 检查以下项目:
1. Mock 飞书服务运行: `curl http://localhost:3001/health`
2. 回调 URL 配置: `.env.development` 中的 `FEISHU_REDIRECT_URI`
3. 前端路由配置: `src/App.tsx` 中的 `/oauth/callback` 路由

#### Q: 数据库连接失败

**A**: 检查以下项目:
1. Docker PostgreSQL 运行: `docker compose -f docker-compose.dev.yml ps postgres`
2. 数据库连接测试: `docker exec opclaw-postgres-dev psql -U opclaw -d opclaw_dev`
3. 环境变量: `platform/backend/.env.development`

---

## 6. 下一步行动

### 短期 (本周)

1. ✅ 完成 OAuth 流程测试
2. ✅ 创建 Mock OpenClaw 服务 (已完成，运行在 3002 端口)
3. ⏳ 实现基本的 E2E 测试
4. ⏳ 测试实例创建流程 (需要先完成 E2E 测试配置)

### 中期 (2-3周)

1. ⏳ 完善所有 Mock 服务
2. ⏳ 实现完整的测试覆盖
3. ⏳ 准备生产环境部署

### 长期 (1-2月)

1. ⏳ 获取真实的 OpenClaw Docker 镜像
2. ⏳ 配置生产环境资源
3. ⏳ 执行完整的 MVP 验收
