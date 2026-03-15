# Mock OpenClaw Service

本地开发测试用的模拟 OpenClaw AI Agent 服务。

## 功能特性

- ✅ 聊天接口 (`/chat`)
- ✅ 健康检查 (`/health`)
- ✅ Agent 状态 (`/agent/status`)
- ✅ Tools 列表 (`/tools`)
- ✅ Skills 列表 (`/skills`)
- ✅ 会话管理 (`/sessions`)
- ✅ API 测试 (`/api/test`)

## 本地运行

### 方式 1: 直接运行 (推荐用于开发)

```bash
# 安装依赖
pnpm install

# 启动服务
pnpm start

# 开发模式 (自动重启)
pnpm run dev
```

### 方式 2: Docker 运行 (推荐用于测试)

```bash
# 构建镜像
docker build -t mock-openclaw .

# 运行容器
docker run -d --name mock-openclaw-instance -p 3002:3000 mock-openclaw

# 查看日志
docker logs -f mock-openclaw-instance

# 停止容器
docker stop mock-openclaw-instance
docker rm mock-openclaw-instance
```

## API 端点

### 健康检查
```bash
curl http://localhost:3002/health
```

### 聊天接口
```bash
curl -X POST http://localhost:3002/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "你好，请帮我分析数据",
    "session_id": "test-session-123"
  }'
```

### Agent 状态
```bash
curl http://localhost:3002/agent/status
```

### Tools 列表
```bash
curl http://localhost:3002/tools
```

### Skills 列表
```bash
curl http://localhost:3002/skills
```

### 会话列表
```bash
curl http://localhost:3002/sessions
```

## 集成测试

在平台后端测试实例创建:

```bash
# 1. 确保后端服务运行
cd platform/backend
pnpm run dev

# 2. 使用 Mock OpenClaw 镜像创建实例
curl -X POST http://localhost:3000/api/instances \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "template": "personal",
    "name": "测试 Mock OpenClaw 实例"
  }'
```

## 注意事项

- 这是 Mock 服务，不会调用真实的 DeepSeek API
- 响应内容是预设的模拟数据
- 仅用于本地开发和功能测试
- 生产环境请使用真实的 OpenClaw Docker 镜像

## 端口说明

- **本地运行**: 3000 (可通过 PORT 环境变量修改)
- **Docker 运行**: 3002 (映射到容器内的 3000)
- **避免冲突**: Backend 使用 3000，Docker 容器映射到 3002
