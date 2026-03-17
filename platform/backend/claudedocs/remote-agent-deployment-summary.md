# 远程 OpenClaw Agent 部署总结

## 概述

本文档总结了为 AIOpc 平台实现远程 OpenClaw Agent 部署和通信机制的工作，并包含了从生产环境中获得的关键经验和教训。

## ⚠️ 关键警告 - 从生产问题中学到的教训

本文档包含多个从实际部署问题中提取的"陷阱"和"解决方案"。在执行任何部署操作前，请务必阅读以下内容：

### 严重事故历史
1. **数据库完全丢失** - 错误删除 PostgreSQL volume，所有表和数据被删除
2. **nginx 服务停止** - 容器意外退出，导致外部无法访问
3. **环境变量缺失** - OAuth URL 配置丢失，OAuth 功能失效
4. **网络配置错误** - 使用错误的 Docker 网络，backend 无法连接数据库
5. **消息路由失败** - 远程实例未注册到 InstanceRegistry，导致消息无法路由

**相关分析文档**：
- [REGRESSION_PREVENTION_MEASURES.md](../REGRESSION_PREVENTION_MEASURES.md) - 防止回归重复发生的具体措施
- [NETWORK_REGRESSION_ANALYSIS.md](../NETWORK_REGRESSION_ANALYSIS.md) - 网络配置事故分析报告

---

## 快速参考 - 服务器访问

### SSH 访问密钥
```bash
# 平台服务器 (118.25.0.190)
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190

# 远程 Agent 服务器 (101.34.254.52)
ssh -i ~/.ssh/aiopclaw_remote_agent root@101.34.254.52
```

**重要提示**：
- SSH 密钥位于本地 `~/.ssh/` 目录
- `rap001_opclaw` 用于平台服务器
- `aiopclaw_remote_agent` 用于远程 Agent 服务器
- 不要将这些密钥提交到版本控制系统

### 服务器关键路径

#### 平台服务器 (118.25.0.190)
```bash
# 项目位置
/opt/opclaw/platform/           # 平台代码
/opt/opclaw/platform/backend/  # 后端代码

# 配置文件
/opt/opclaw/platform/.env.production  # 生产环境变量

# Docker 容器
opclaw-postgres    # PostgreSQL 数据库
opclaw-redis       # Redis 缓存
opclaw-backend     # 后端服务 (ports: 3000, 3001, 3002)
opclaw-frontend    # Nginx 前端 (port: 80)

# Docker 网络
opclaw_opclaw-network  # ⚠️ 必须使用这个确切的网络名称
```

#### 远程 Agent 服务器 (101.34.254.52)
```bash
# Agent 位置
/opt/openclaw-agent/           # Agent 主目录
/opt/openclaw-agent/agent.js   # Agent 主脚本
/opt/openclaw-agent/credentials.json  # ⚠️ 凭证文件（不是 /etc/openclaw-agent/）

# 日志文件
/var/log/openclaw-agent.log    # Agent 日志

# systemd 服务
openclaw-agent.service         # systemd 服务配置
```

---

## 快速故障排查命令

### 检查所有容器状态
```bash
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 "docker ps | grep opclaw"
```

### 检查 Docker 网络
```bash
# 查看 postgres 在哪个网络
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 "docker network inspect opclaw_opclaw-network --format '{{range .Containers}}{{.Name}} {{end}}'"
```

### 检查数据库连接
```bash
# 在 backend 容器中检查数据库连接
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 "docker logs opclaw-backend --tail 50 | grep -i 'postgres\|database\|error'"
```

### 检查 Agent 状态
```bash
ssh -i ~/.ssh/aiopclaw_remote_agent root@101.34.254.52 "systemctl status openclaw-agent"
```

### 查看 Agent 日志
```bash
ssh -i ~/.ssh/aiopclaw_remote_agent root@101.34.254.52 "tail -f /var/log/openclaw-agent.log"
```

---

## 常见问题和解决方案

### 问题 1: Backend 容器无法连接数据库

**症状**：
```
getaddrinfo EAI_AGAIN postgres
Environment: development
No metadata for "Instance"
```

**根本原因**：Backend 容器使用了错误的 Docker 网络

**解决方案**：
```bash
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 << 'EOF'
# 停止并删除错误的容器
docker stop opclaw-backend
docker rm opclaw-backend

# 使用正确的网络重新创建容器
docker run -d \
  --name opclaw-backend \
  --network opclaw_opclaw-network \
  --restart unless-stopped \
  -p 3000:3000 \
  -p 3001:3001 \
  -p 3002:3002 \
  -v /var/run/docker.sock:/var/run/docker.sock:rw \
  -v /opt/opclaw/platform/logs/backend:/app/logs \
  --env-file /opt/opclaw/platform/.env.production \
  platform-backend

# 验证连接
sleep 5
docker logs opclaw-backend --tail 20
EOF
```

**验证步骤**：
```bash
# 1. 检查 backend 是否在正确的网络中
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 "docker inspect opclaw-backend --format '{{range $net, $conf := .NetworkSettings.Networks}}{{$net}}{{end}}'"

# 2. 检查 postgres 是否在同一网络
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 "docker network inspect opclaw_opclaw-network --format '{{range .Containers}}{{.Name}} {{end}}' | grep postgres"

# 3. 测试 DNS 解析
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 "docker exec opclaw-backend ping -c 1 postgres"
```

### 问题 2: OAuth 502 Bad Gateway 错误

**症状**：
```
GET http://renava.cn/api/oauth/authorize 502 (Bad Gateway)
```

**根本原因**：OAuth URL 环境变量缺失

**解决方案**：
```bash
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 << 'EOF'
# 1. 编辑 .env.production 文件
cat >> /opt/opclaw/platform/.env.production << 'ENV'
FEISHU_OAUTH_AUTHORIZE_URL=https://open.feishu.cn/open-apis/authen/v1/authorize
FEISHU_OAUTH_TOKEN_URL=https://open.feishu.cn/open-apis/authen/v3/oidc/access_token
FEISHU_USER_INFO_URL=https://open.feishu.cn/open-apis/authen/v1/user_info
ENV

# 2. 重新创建 backend 容器
docker stop opclaw-backend
docker rm opclaw-backend

docker run -d \
  --name opclaw-backend \
  --network opclaw_opclaw-network \
  --restart unless-stopped \
  -p 3000:3000 \
  -p 3001:3001 \
  -p 3002:3002 \
  -v /var/run/docker.sock:/var/run/docker.sock:rw \
  -v /opt/opclaw/platform/logs/backend:/app/logs \
  --env-file /opt/opclaw/platform/.env.production \
  platform-backend

# 3. 测试 OAuth 端点
sleep 5
curl -I http://localhost/api/oauth/authorize?redirect_uri=http://localhost/oauth/callback
EOF
```

### 问题 3: 数据库表丢失

**症状**：
```
relation "instances" does not exist
```

**根本原因**：PostgreSQL volume 被删除或数据库未同步

**解决方案**：
```bash
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 << 'EOF'
# 使用 sync-schema.js 同步数据库
docker exec opclaw-backend node /app/dist/scripts/sync-schema.js

# 验证表已创建
docker exec opclaw-postgres psql -U opclaw -d opclaw -c "\dt"
EOF
```

**预防措施**：
```bash
# 定期备份数据库（添加到 crontab）
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 << 'EOF'
cat > /opt/opclaw/scripts/backup-database.sh << 'SCRIPT'
#!/bin/bash
BACKUP_DIR="/backup/opclaw/database"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# 备份数据库
docker exec opclaw-postgres pg_dump -U opclaw opclaw | gzip > $BACKUP_DIR/opclaw_$DATE.sql.gz

# 保留最近7天的备份
find $BACKUP_DIR -name "opclaw_*.sql.gz" -mtime +7 -delete

echo "Backup completed: opclaw_$DATE.sql.gz"
SCRIPT

chmod +x /opt/opclaw/scripts/backup-database.sh

# 添加到 crontab（每天凌晨2点）
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/opclaw/scripts/backup-database.sh") | crontab -
EOF
```

### 问题 4: 消息路由失败 - "No instance found for user X"

**症状**：
```
Failed to route message: No instance found for user 1
```

**根本原因**：远程实例连接后未注册到 InstanceRegistry 的 userInstanceMap

**解决方案**：确保 RemoteInstanceWebSocketGateway 调用 InstanceRegistry.registerInstance()

```typescript
// src/services/RemoteInstanceWebSocketGateway.ts
// 在 handleConnection 方法中，成功连接后添加：

try {
  await this.instanceRegistry.registerInstance(instanceId, {
    connection_type: 'remote',
    api_endpoint: `http://${instanceInfo.remote_host}:3000`,
    metadata: {
      platform_api_key: apiKey,
      remote_host: instanceInfo.remote_host,
    },
  });
  logger.info('Remote instance registered to InstanceRegistry', { instanceId });
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  logger.error('Failed to register instance to InstanceRegistry', { instanceId, error: errorMessage });
  // Don't fail the connection if registry registration fails
}
```

**验证步骤**：
```bash
# 1. 重新构建 backend 镜像
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 << 'EOF'
cd /opt/opclaw/platform/backend
docker build -t platform-backend .

# 2. 重启 backend 容器
docker stop opclaw-backend
docker rm opclaw-backend

docker run -d \
  --name opclaw-backend \
  --network opclaw_opclaw-network \
  --restart unless-stopped \
  -p 3000:3000 \
  -p 3001:3001 \
  -p 3002:3002 \
  -v /var/run/docker.sock:/var/run/docker.sock:rw \
  -v /opt/opclaw/platform/logs/backend:/app/logs \
  --env-file /opt/opclaw/platform/.env.production \
  platform-backend

# 3. 检查远程实例是否重新连接
docker logs opclaw-backend --tail 50 | grep -i "remote instance"
EOF
```

### 问题 5: 远程 Agent 无法连接 WebSocket

**症状**：
```
Agent 日志显示: WebSocket connection failed
```

**可能原因**：
1. Backend 容器未暴露端口 3002
2. 防火墙阻止了 3002 端口
3. 平台服务器网络策略阻止连接

**解决方案**：
```bash
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 << 'EOF'
# 1. 检查 backend 容器端口映射
docker port opclaw-backend

# 如果没有 3002，重新创建容器
if ! docker port opclaw-backend | grep -q "3002"; then
  docker stop opclaw-backend
  docker rm opclaw-backend

  docker run -d \
    --name opclaw-backend \
    --network opclaw_opclaw-network \
    --restart unless-stopped \
    -p 3000:3000 \
    -p 3001:3001 \
    -p 3002:3002 \
    -v /var/run/docker.sock:/var/run/docker.sock:rw \
    -v /opt/opclaw/platform/logs/backend:/app/logs \
    --env-file /opt/opclaw/platform/.env.production \
    platform-backend
fi

# 2. 检查防火墙规则
if command -v ufw &> /dev/null; then
  ufw status | grep 3002 || ufw allow 3002/tcp
elif command -v firewall-cmd &> /dev/null; then
  firewall-cmd --list-ports | grep 3002 || firewall-cmd --permanent --add-port=3002/tcp
  firewall-cmd --reload
fi
EOF
```

### 问题 6: Agent 凭证更新无效

**症状**：更新了凭证文件但 Agent 仍使用旧凭证

**根本原因**：更新了错误的文件位置

**解决方案**：
```bash
ssh -i ~/.ssh/aiopclaw_remote_agent root@101.34.254.52 << 'EOF'
# ⚠️ 注意：Agent 从 /opt/openclaw-agent/credentials.json 读取凭证
# 不是从 /etc/openclaw-agent/credentials.json

# 1. 更新正确的凭证文件
cat > /opt/openclaw-agent/credentials.json << 'CREDS'
{
  "instanceId": "inst-remote-xxx",
  "platformApiKey": "sk-remote-xxx",
  "platformUrl": "http://118.25.0.190",
  "registeredAt": "2026-03-17T00:00:00.000Z"
}
CREDS

# 2. 重启 Agent
systemctl restart openclaw-agent

# 3. 验证凭证已加载
sleep 3
journalctl -u openclaw-agent --since "3 seconds ago" | grep -i "credentials\|registered"
EOF
```

---

## 部署检查清单

### 部署前检查
- [ ] 确认 SSH 密钥位置正确 (`~/.ssh/rap001_opclaw`, `~/.ssh/aiopclaw_remote_agent`)
- [ ] 备份当前配置文件
- [ ] 记录当前运行的容器状态 (`docker ps`)
- [ ] 验证网络配置 (`docker network ls`)

### 修改环境变量前
- [ ] 更新 `.env.production` 文件
- [ ] 更新 `docker-compose.yml` 文件
- [ ] 验证变量引用正确
- [ ] 更新相关文档

### 重新创建容器前
- [ ] 确认 Docker 网络名称 (`opclaw_opclaw-network`)
- [ ] 确认端口映射 (3000, 3001, 3002)
- [ ] 确认环境变量文件路径
- [ ] 备份重要数据

### 容器启动后验证
- [ ] 容器成功启动 (`docker ps`)
- [ ] 数据库连接正常 (检查日志)
- [ ] 服务间通信测试 (ping, curl)
- [ ] 健康检查通过 (`/health` 端点)
- [ ] OAuth 端点工作 (测试登录)
- [ ] 远程实例连接 (检查日志)

---

## 完整 Backend 恢复脚本

当需要完全重新创建 backend 容器时使用：

```bash
#!/bin/bash
# 完整的 backend 容器恢复脚本
# 使用方法: ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 'bash -s' < recover-backend.sh

set -e

echo "=== Backend 容器恢复脚本 ==="

# 1. 检查网络
echo "步骤 1: 检查 Docker 网络..."
if ! docker network inspect opclaw_opclaw-network &>/dev/null; then
    echo "❌ 错误: 网络 opclaw_opclaw-network 不存在"
    exit 1
fi

if ! docker network inspect opclaw_opclaw-network --format '{{range .Containers}}{{.Name}}{{end}}' | grep -q "opclaw-postgres"; then
    echo "❌ 错误: postgres 不在网络 opclaw_opclaw-network 中"
    exit 1
fi

echo "✅ 网络检查通过"

# 2. 停止并删除旧容器
echo "步骤 2: 停止并删除旧容器..."
docker stop opclaw-backend 2>/dev/null || true
docker rm opclaw-backend 2>/dev/null || true

# 3. 启动新容器
echo "步骤 3: 启动新的 backend 容器..."
docker run -d \
  --name opclaw-backend \
  --network opclaw_opclaw-network \
  --restart unless-stopped \
  -p 3000:3000 \
  -p 3001:3001 \
  -p 3002:3002 \
  -v /var/run/docker.sock:/var/run/docker.sock:rw \
  -v /opt/opclaw/platform/logs/backend:/app/logs \
  --env-file /opt/opclaw/platform/.env.production \
  platform-backend

# 4. 等待容器启动
echo "步骤 4: 等待容器启动..."
sleep 10

# 5. 验证数据库连接
echo "步骤 5: 验证数据库连接..."
if docker logs opclaw-backend --tail 50 | grep -q "getaddrinfo EAI_AGAIN postgres"; then
    echo "❌ 错误: 数据库连接失败"
    docker logs opclaw-backend --tail 50
    exit 1
fi

# 6. 验证健康检查
echo "步骤 6: 验证健康检查..."
if ! curl -f -s http://localhost:3000/health > /dev/null; then
    echo "❌ 错误: 健康检查失败"
    docker logs opclaw-backend --tail 50
    exit 1
fi

# 7. 验证 OAuth 端点
echo "步骤 7: 验证 OAuth 端点..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/api/oauth/authorize?redirect_uri=http://localhost/oauth/callback)
if [ "$HTTP_CODE" -ne 200 ]; then
    echo "⚠️  警告: OAuth 端点返回 HTTP $HTTP_CODE (预期 200 或 302)"
else
    echo "✅ OAuth 端点正常"
fi

echo ""
echo "=== 恢复完成 ==="
echo "容器状态:"
docker ps | grep opclaw-backend
```

---

## 已完成的工作

### 1. 平台端 WebSocket 通信机制实现

#### 文件列表
- `/Users/arthurren/projects/AIOpc/platform/backend/src/services/RemoteInstanceWebSocketGateway.ts` - 新创建的远程实例 WebSocket 网关
- `/Users/arthurren/projects/AIOpc/platform/backend/src/services/RemoteInstanceService.ts` - 更新以支持公共 API key 验证
- `/Users/arthurren/projects/AIOpc/platform/backend/src/app.ts` - 更新以启动远程实例 WebSocket 网关

#### 功能特性
- **专用 WebSocket 端口**: 3002 (可通过 `REMOTE_WS_PORT` 环境变量配置)
- **双向通信**: 支持平台向远程实例推送命令，实例向平台发送状态更新
- **API Key 认证**: 使用平台生成的 API key 进行身份验证
- **心跳机制**: 30秒间隔的 WebSocket ping/pong 心跳
- **命令队列**: 当实例离线时缓存待发送的命令
- **自动重连**: 连接断开后自动尝试重新连接

#### API 端点
平台已实现的 HTTP API 端点（在 RemoteInstanceController.ts 中）：
- `POST /api/instances/register` - 注册新实例
- `POST /api/instances/:instanceId/heartbeat` - 发送心跳
- `DELETE /api/instances/:instanceId/unregister` - 注销实例
- `GET /api/instances/:instanceId/verify` - 验证实例注册状态

### 2. 远程服务器 (101.34.254.52) 环境配置

#### 服务器信息
- **操作系统**: Ubuntu 24.04 LTS
- **IP 地址**: 101.34.254.52
- **SSH Key**: ~/.ssh/aiopclaw_remote_agent

#### 已安装软件
- **Node.js**: v22.22.1
- **npm**: 10.9.4
- **Docker**: 29.3.0

#### 安装目录
- `/opt/openclaw-agent/` - Agent 主目录
- `/etc/openclaw-agent/` - 配置和凭证目录
- `/var/log/openclaw-agent.log` - 日志文件

### 3. OpenClaw Agent 实现

#### 文件列表
- `/opt/openclaw-agent/agent.js` - Agent 主脚本
- `/opt/openclaw-agent/package.json` - Node.js 项目配置
- `/etc/systemd/system/openclaw-agent.service` - systemd 服务配置

#### 功能特性
- **自动注册**: 启动时向平台注册，获取 instance_id 和 platform_api_key
- **凭证持久化**: 将注册凭证保存到 `/etc/openclaw-agent/credentials.json`
- **WebSocket 连接**: 连接到平台的 WebSocket 网关 (端口 3002)
- **HTTP 心跳**: 每 30 秒通过 HTTP API 发送心跳
- **系统监控**: 收集 CPU、内存使用情况
- **优雅关闭**: 处理 SIGINT/SIGTERM 信号，正确关闭连接
- **自动重启**: 通过 systemd 配置，崩溃后自动重启

#### systemd 服务管理
```bash
# 启动服务
ssh -i ~/.ssh/aiopclaw_remote_agent root@101.34.254.52 "systemctl start openclaw-agent"

# 停止服务
ssh -i ~/.ssh/aiopclaw_remote_agent root@101.34.254.52 "systemctl stop openclaw-agent"

# 重启服务
ssh -i ~/.ssh/aiopclaw_remote_agent root@101.34.254.52 "systemctl restart openclaw-agent"

# 查看状态
ssh -i ~/.ssh/aiopclaw_remote_agent root@101.34.254.52 "systemctl status openclaw-agent"

# 查看日志
ssh -i ~/.ssh/aiopclaw_remote_agent root@101.34.254.52 "journalctl -u openclaw-agent -f"
```

### 4. 部署脚本

#### 自动部署脚本
- `/Users/arthurren/projects/AIOpc/platform/backend/scripts/deploy-remote-agent.sh` - 完整的自动化部署脚本

该脚本包含以下步骤：
1. 检查 root 权限
2. 安装系统依赖
3. 安装 Node.js v22
4. 安装 Docker
5. 设置 OpenClaw Agent 目录
6. 创建 Agent 脚本
7. 创建 systemd 服务
8. 配置防火墙

## 部署架构

```
┌─────────────────────────────────────────────────────────────┐
│                    平台服务器 (118.25.0.190)                  │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │           HTTP API (端口 3000)                         │  │
│  │  - POST /api/instances/register                        │  │
│  │  - POST /api/instances/:id/heartbeat                   │  │
│  │  - DELETE /api/instances/:id/unregister                │  │
│  │  - GET /api/instances/:id/verify                       │  │
│  └───────────────────────────────────────────────────────┘  │
│                          ↓                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │        RemoteInstanceWebSocketGateway (端口 3002)      │  │
│  │  - 双向通信                                             │  │
│  │  - 命令推送                                             │  │
│  │  - 状态更新                                             │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↕
                    WebSocket + HTTP
                            ↕
┌─────────────────────────────────────────────────────────────┐
│              远程服务器 (101.34.254.52)                       │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │            OpenClaw Agent (Node.js)                    │  │
│  │  - 自动注册                                             │  │
│  │  - HTTP 心跳 (30s)                                      │  │
│  │  - WebSocket 连接                                       │  │
│  │  - 系统监控                                             │  │
│  └───────────────────────────────────────────────────────┘  │
│                          ↓                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │         systemd 服务管理                                │  │
│  │  - 自动启动                                             │  │
│  │  - 自动重启                                             │  │
│  │  - 日志管理                                             │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## 测试结果

### 当前状态
- ✅ 平台代码已更新并构建成功
- ✅ 远程实例 WebSocket Gateway 已实现
- ✅ 远程服务器环境已配置完成
- ✅ OpenClaw Agent 已部署并运行
- ⚠️ 平台服务器 (118.25.0.190) 当前无法访问

### 测试验证步骤

一旦平台服务器可访问，请执行以下测试：

1. **启动平台服务**
   ```bash
   ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190
   cd /path/to/AIOpc/platform/backend
   npm start
   ```

2. **验证 Agent 注册**
   ```bash
   # 查看 Agent 日志
   ssh -i ~/.ssh/aiopclaw_remote_agent root@101.34.254.52 "tail -f /var/log/openclaw-agent.log"

   # 应该看到类似输出：
   # info: Successfully registered with platform
   # info: WebSocket connection established
   ```

3. **验证数据库记录**
   ```sql
   -- 连接到平台数据库
   SELECT * FROM instances WHERE deployment_type = 'remote';

   -- 应该看到新注册的实例
   ```

4. **验证心跳**
   ```bash
   # 查看 Agent 日志中的心跳记录
   ssh -i ~/.ssh/aiopclaw_remote_agent root@101.34.254.52 "grep 'Heartbeat sent successfully' /var/log/openclaw-agent.log"
   ```

5. **测试 WebSocket 连接**
   ```bash
   # 在平台服务器上检查 WebSocket 连接
   # 应该能看到来自 101.34.254.52 的连接
   ```

## 环境变量配置

### 平台服务器
```bash
# .env 或 .env.production
PLATFORM_URL=http://118.25.0.190
WS_ENABLED=true
WS_PORT=3001
REMOTE_WS_ENABLED=true
REMOTE_WS_PORT=3002
```

### 远程 Agent
```bash
# systemd 服务配置
NODE_ENV=production
PLATFORM_URL=http://118.25.0.190
PLATFORM_API_PORT=3000
PLATFORM_WS_PORT=3002
AGENT_PORT=3000
```

## 故障排查

### Agent 无法注册
1. 检查平台 API 是否运行: `curl http://118.25.0.190:3000/health`
2. 检查网络连接: 从 101.34.254.52 ping 118.25.0.190
3. 查看 Agent 日志: `tail -f /var/log/openclaw-agent.log`
4. 查看平台日志

### WebSocket 连接失败
1. 确认平台 WebSocket Gateway 已启动 (端口 3002)
2. 检查防火墙规则
3. 验证 API key 是否正确

### 心跳失败
1. 检查 instance_id 和 platform_api_key 是否匹配
2. 验证 API 端点路径正确
3. 查看平台日志中的错误信息

## 下一步工作

1. **部署平台服务**: 将更新的代码部署到 118.25.0.190
2. **端到端测试**: 验证完整的注册、心跳、通信流程
3. **功能完善**: 实现平台向实例推送命令的功能
4. **监控和告警**: 添加实例状态监控和异常告警
5. **文档更新**: 创建用户文档和运维手册

## 相关文件清单

### 平台代码
- `src/services/RemoteInstanceWebSocketGateway.ts` (新建)
- `src/services/RemoteInstanceService.ts` (更新)
- `src/app.ts` (更新)
- `src/controllers/RemoteInstanceController.ts` (已存在)

### Agent 代码
- `/opt/openclaw-agent/agent.js` (远程服务器)
- `/opt/openclaw-agent/package.json` (远程服务器)
- `/etc/systemd/system/openclaw-agent.service` (远程服务器)

### 脚本
- `scripts/deploy-remote-agent.sh` (部署脚本)
- `/tmp/test-remote-agent.sh` (测试脚本)

## 联系信息

如需技术支持，请查看：
- 平台日志: 平台服务器上的应用日志
- Agent 日志: `/var/log/openclaw-agent.log`
- systemd 日志: `journalctl -u openclaw-agent -f`
