# OpenClaw Remote Agent - 本地开发环境 (含 Ngrok)

本目录包含在本地 Mac 上运行 OpenClaw Remote Agent 的完整配置，**使用 Ngrok 建立隧道**，让远程平台服务器可以访问你本地的 Agent。

## 架构

```
本地 Mac (Docker)
├── openclaw-service (端口 3001)
│   └── DeepSeek API 集成
├── openclaw-agent (端口 3000)
│   ├── WebSocket 连接到平台 (118.25.0.190:3002)
│   ├── HTTP 健康检查 (localhost:3000/health)
│   └── 调用本地 openclaw-service
├── ngrok (端口 4040)
│   └── 将本机 agent 暴露到公网
├── ngrok-helper
│   └── 自动获取和显示 ngrok 公网 URL
└── 持久化卷
    ├── credentials (注册信息)
    └── logs (日志文件)
         │
         ▼
   [Ngrok 隧道]
         │
         ▼
远程平台服务器 (118.25.0.190)
└── 通过 ngrok URL 连接到你的本地 agent
```

## 工作原理

1. **Agent 启动**: 连接到平台服务器，注册实例（使用本地 IP）
2. **Ngrok 隧道**: 将 `localhost:3000` 暴露为公网 URL（如 `https://abc123.ngrok.io`）
3. **数据库更新**: 手动更新实例的 `remote_host` 为 ngrok URL
4. **平台连接**: 平台通过 ngrok URL 连接回你的本地 agent

## 前置要求

1. **Docker Desktop** 已安装并运行
2. **Ngrok 账号** (免费账号即可): https://ngrok.com/signup
3. **DeepSeek API Key** (可以使用测试 key)
4. 网络可以访问 `118.25.0.190` (平台服务器)

## 快速开始

### 1. 获取 Ngrok Auth Token

```bash
# 访问 https://ngrok.com/signup 注册
# 登录后获取 authtoken，在 "Your Authtoken" 页面
```

### 2. 配置环境变量

```bash
cd deployment/remote-agent
cp .env.example .env
# 编辑 .env 文件，设置以下变量：
#   DEEPSEEK_API_KEY=your_key_here
#   NGROK_AUTHTOKEN=your_ngrok_token_here
```

### 3. 启动所有服务

```bash
docker-compose -f docker-compose-local.yml up -d --build
```

### 4. 查看 Ngrok 公网 URL

```bash
# 方法 1: 查看 ngrok-helper 日志
docker logs local-openclaw-ngrok-helper

# 方法 2: 访问 ngrok Web UI
open http://localhost:4040

# 方法 3: 直接查询 API
curl -s http://localhost:4040/api/tunnels | jq '.tunnels[0].public_url'
```

**预期输出示例**:
```
========================================
Ngrok Public URL: https://abc123.ngrok.io
========================================

IMPORTANT: Update the instance registration on the platform:
  UPDATE instances
  SET remote_host = "abc123.ngrok.io",
      remote_port = 443
  WHERE instance_id = "<your-instance-id>";

Or use the agent health check at: https://abc123.ngrok.io/health
========================================
```

### 5. 更新平台数据库中的实例地址

```bash
# 方法 1: 直接 SSH 到平台服务器更新
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190

# 连接到数据库
docker exec -it opclaw-postgres psql -U opclaw -d opclaw

# 获取你的 instance_id (从 agent 日志中查找)
# 然后更新实例的 remote_host
UPDATE instances
SET remote_host = 'abc123.ngrok.io',  -- 使用你的实际 ngrok URL
    remote_port = 443                   -- ngrok 使用 HTTPS 端口
WHERE instance_id = 'inst-remote-xxx';  -- 使用你的 instance_id

# 退出数据库
\q

# 重启平台后端以重新加载实例配置
docker restart opclaw-backend
```

```bash
# 方法 2: 使用平台 API 更新（如果有）
NGROK_HOST=$(curl -s http://localhost:4040/api/tunnels | jq -r '.tunnels[0].public_url' | sed 's|https://||')
INSTANCE_ID=<your-instance-id>

curl -X PATCH http://118.25.0.190:3000/api/instances/$INSTANCE_ID \
  -H "Content-Type: application/json" \
  -d "{\"remote_host\":\"$NGROK_HOST\",\"remote_port\":443}"
```

### 6. 验证连接

```bash
# 本地健康检查
curl http://localhost:3000/health

# 通过 ngrok 访问健康检查
curl https://abc123.ngrok.io/health  # 使用你的实际 ngrok URL

# 查看 agent 日志，应该看到平台 WebSocket 连接成功
docker logs local-openclaw-agent | grep -i "websocket\|connected\|registered"
```

## 服务管理

### 查看所有服务状态

```bash
docker-compose -f docker-compose-local.yml ps
```

### 查看日志

```bash
# 所有服务日志
docker-compose -f docker-compose-local.yml logs -f

# 特定服务日志
docker logs -f local-openclaw-agent      # Agent
docker logs -f local-openclaw-service    # Service
docker logs -f local-openclaw-ngrok      # Ngrok
docker logs -f local-openclaw-ngrok-helper  # Helper
```

### 重启服务

```bash
# 重启所有服务
docker-compose -f docker-compose-local.yml restart

# 重启特定服务
docker-compose -f docker-compose-local.yml restart openclaw-agent
```

### 停止服务

```bash
docker-compose -f docker-compose-local.yml down
```

### 清理所有数据（包括注册信息）

```bash
docker-compose -f docker-compose-local.yml down -v
```

## 测试完整流程

### 1. 验证 Agent 注册

```bash
# 查看 agent 注册日志
docker logs local-openclaw-agent | grep "Successfully registered"

# 应该看到类似输出:
# Successfully registered with platform {
#   instanceId: "inst-remote-xxx",
#   platformApiKey: "sk-remote-..."
# }
```

### 2. 更新实例地址

按照步骤 5 更新数据库中的 `remote_host` 为 ngrok URL

### 3. 验证平台连接

```bash
# 查看平台后端日志，应该看到 WebSocket 连接
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 "docker logs opclaw-backend --tail 50 | grep -i websocket"

# 应该看到你的实例连接
# Remote instance WebSocket connected {"instanceId":"inst-remote-xxx",...}
```

### 4. 认领实例并发送消息

1. 访问 `http://renava.cn/login` (飞书登录)
2. 进入实例列表，找到你注册的实例
3. 扫码认领实例
4. **立即发送消息**（验证 P0 修复）
5. 应该能收到 AI 回复

## 端口映射

| 服务 | 容器内端口 | 本地端口 | 说明 |
|------|-----------|---------|------|
| openclaw-service | 3001 | 3001 | AI 服务 API |
| openclaw-agent | 3000 | 3000 | Agent 健康检查 |
| ngrok | - | 4040 | Ngrok Web UI |

## 故障排查

### Ngrok 无法启动

1. 检查 authtoken 是否正确
   ```bash
   docker exec local-openclaw-ngrok ngrok config check
   ```

2. 查看 ngrok 日志
   ```bash
   docker logs local-openclaw-ngrok
   ```

### 平台无法连接到 Agent

1. 验证 ngrok URL 可访问
   ```bash
   # 从你的 Mac 测试
   curl https://abc123.ngrok.io/health

   # 从平台服务器测试
   ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 \
     "curl https://abc123.ngrok.io/health"
   ```

2. 检查数据库中的实例配置
   ```bash
   ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190

   docker exec -it opclaw-postgres psql -U opclaw -d opclaw \
     -c "SELECT instance_id, remote_host, remote_port, status FROM instances \
         WHERE instance_id LIKE 'inst-remote%' ORDER BY id DESC LIMIT 5;"
   ```

3. 重启平台后端以重新加载实例配置
   ```bash
   ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 \
     "docker restart opclaw-backend"
   ```

### Agent 没有自动注册

```bash
# 删除 credentials 卷重新注册
docker volume rm openclaw-agent-credentials
docker-compose -f docker-compose-local.yml restart openclaw-agent
```

### Ngrok URL 频繁变化

免费版 ngrok 的 URL 在每次重启后会变化。你可以：

1. **不重启 ngrok**: 只重启 agent 和 service
   ```bash
   docker-compose -f docker-compose-local.yml restart openclaw-agent openclaw-service
   ```

2. **使用付费 ngrok**: 获取固定的自定义域名
   ```bash
   # 在 .env 中设置
   NGROK_DOMAIN=your-custom-domain.ngrok.io
   NGROK_AUTHTOKEN=your_paid_authtoken
   ```

## Ngrok Web UI

访问 http://localhost:4040 可以查看：
- 实时流量监控
- 连接状态
- 请求/响应详情
- 隧道配置

## 高级配置

### 自定义 Ngrok 域名（付费）

```bash
# 在 .env 中配置
NGROK_DOMAIN=your-domain.ngrok.io
NGROK_AUTHTOKEN=your_paid_authtoken
```

### Ngrok 配置文件

如果需要更复杂的 ngrok 配置，可以挂载配置文件：

```yaml
# 在 docker-compose-local.yml 的 ngrok 服务中添加
volumes:
  - ./ngrok.yml:/etc/ngrok.yml
```

## 注意事项

1. **Ngrok 免费版限制**:
   - URL 每次重启后变化
   - 并发连接数限制
   - 流量限制

2. **安全性**:
   - Ngrok URL 是公开的，任何人都可以访问
   - 不要在本地 agent 中存储敏感数据
   - 生产环境应使用真实的服务器部署

3. **网络稳定性**:
   - 依赖 Ngrok 服务稳定性
   - 如果网络断开，需要重新更新数据库中的 URL

## 相关文档

- [部署回归分析](../../claudedocs/DEPLOYMENT_REGRESSION_ANALYSIS.md)
- [标准化部署流程](../../claudedocs/STANDARD_DEPLOYMENT_PROCEDURE.md)
- [事故报告](../../claudedocs/INCIDENT_REPORT_20260318.md)
- [GitHub Issues](https://github.com/renzhichao/AIOpc/issues)
- [Ngrok 文档](https://ngrok.com/docs)
