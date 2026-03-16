# 远程 OpenClaw Agent 部署总结

## 概述

本文档总结了为 AIOpc 平台实现远程 OpenClaw Agent 部署和通信机制的工作。

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
