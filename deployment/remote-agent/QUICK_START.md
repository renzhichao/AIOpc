# OpenClaw远程实例快速接入指南

## 📋 概述

本文档提供完整的OpenClaw远程实例接入流水线，支持快速将新的云服务器注册到平台实例池中。

### 当前架构状态

**✅ 已支持的功能**：
- 远程实例自动注册
- WebSocket双向通信
- 心跳保活机制
- 实例状态监控
- 消息路由分发

**🚧 待完善的功能**：
- 一键部署脚本
- 配置管理界面
- 自动化扩容工具

---

## 🏗️ 架构设计

### 实例注册流程

```
┌─────────────────────────────────────────────────────────────┐
│                   新服务器接入流程                           │
└─────────────────────────────────────────────────────────────┘

1. 准备阶段
   ├── 申请云服务器（腾讯云/阿里云/AWS等）
   ├── 配置安全组（开放出站HTTPS/WebSocket）
   └── 获取SSH访问凭证

2. 部署阶段（5-10分钟）
   ├── SSH登录服务器
   ├── 安装Node.js runtime (v22+)
   ├── 部署OpenClaw Agent
   ├── 部署OpenClaw Service
   └── 配置环境变量

3. 注册阶段（自动）
   ├── Agent启动时读取配置
   ├── 连接平台WebSocket服务（端口3002）
   ├── 发送注册消息（带platform_api_key）
   └── 平台分配instance_id并纳入实例池

4. 验证阶段
   ├── 检查平台日志确认注册成功
   ├── 查看实例状态（online/offline）
   └── 测试消息路由

总耗时：约10-15分钟/实例
```

### 实例通信架构

```
┌───────────────────────────────────────────────────────────┐
│              Platform (118.25.0.190)                       │
│  ┌────────────────────────────────────────────────────┐   │
│  │   RemoteInstanceWebSocketGateway (Port 3002)       │   │
│  │   - 接收Agent连接                                   │   │
│  │   - 验证platform_api_key                             │   │
│  │   - 分配instance_id                                 │   │
│  │   - 双向消息路由                                    │   │
│  │   - 心跳监控 (30s interval)                         │   │
│  └────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────┘
                        ↕ WebSocket
┌───────────────────────────────────────────────────────────┐
│              Remote Agent (新服务器)                       │
│  ┌────────────────────────────────────────────────────┐   │
│  │   OpenClaw Agent (agent-ws-updated.js)             │   │
│  │   - WebSocket Client                                │   │
│  │   - 自动注册                                        │   │
│  │   - 心跳保活                                        │   │
│  │   - 消息转发 → OpenClaw Service                    │   │
│  └────────────────────────────────────────────────────┘   │
│  ┌────────────────────────────────────────────────────┐   │
│  │   OpenClaw Service (Port 3001)                      │   │
│  │   - AI处理                                         │   │
│  │   - 文件上传支持 (50MB body limit)                  │   │
│  │   - LLM API调用                                     │   │
│  └────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────┘
```

---

## 🚀 快速接入步骤

### 步骤1: 准备新服务器

**服务器要求**：
- CPU: 2核+
- 内存: 4GB+
- 操作系统: Ubuntu 20.04+ / CentOS 7+ / Debian 10+
- 网络: 可访问平台服务器 (118.25.0.190:3002)
- Node.js: v22.22.1+

**安全组配置**：
```
出站规则:
- HTTPS (443) → 118.25.0.190
- WebSocket (3002) → 118.25.0.190
- HTTP (80) → 用于API调用

入站规则（可选）:
- SSH (22) → 你的IP
- HTTP (3001) → 健康检查（可选）
```

### 步骤2: 获取配置信息

从平台获取以下信息：
```bash
# 1. 获取platform_api_key
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 "docker exec opclaw-backend env | grep PLATFORM_API_KEY"

# 2. 获取平台地址
PLATFORM_HOST="118.25.0.190"
PLATFORM_WS_PORT="3002"  # WebSocket端口
PLATFORM_API_PORT="3000" # API端口
```

### 步骤3: 自动化部署脚本

创建 `deploy-remote-instance.sh`：

```bash
#!/bin/bash

# OpenClaw Remote Instance Auto-Deployment Script
# Usage: ./deploy-remote-instance.sh <platform_host> <platform_api_key>

set -e

PLATFORM_HOST=${1:-"118.25.0.190"}
PLATFORM_API_KEY=${2}
AGENT_DIR="/opt/openclaw-agent"
SERVICE_DIR="/opt/openclaw-service"

echo "🚀 OpenClaw Remote Instance Deployment"
echo "========================================"
echo "Platform Host: ${PLATFORM_HOST}"
echo ""

# 检查Node.js版本
check_nodejs() {
    if ! command -v node &> /dev/null; then
        echo "❌ Node.js not found. Installing Node.js v22..."
        curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
        sudo apt-get install -y nodejs
    else
        NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$NODE_VERSION" -lt 22 ]; then
            echo "⚠️  Node.js version $NODE_VERSION detected. v22+ required."
            echo "Installing Node.js v22..."
            curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
            sudo apt-get install -y nodejs
        else
            echo "✅ Node.js $(node -v) detected"
        fi
    fi
}

# 创建工作目录
create_directories() {
    echo "📁 Creating working directories..."
    sudo mkdir -p ${AGENT_DIR}
    sudo mkdir -p ${SERVICE_DIR}
}

# 下载Agent代码
deploy_agent() {
    echo "📦 Deploying OpenClaw Agent..."

    # 从平台复制agent代码（需要先打包到可访问位置）
    # 或使用wget从GitHub/对象存储下载

    sudo tee ${AGENT_DIR}/agent-ws-updated.js > /dev/null <<'EOAGENT'
    // Agent code will be copied here
    // TODO: 替换为实际的agent代码
EOAGENT

    # 设置环境变量
    sudo tee ${AGENT_DIR}/.env > /dev/null <<EOF
PLATFORM_URL=http://${PLATFORM_HOST}
PLATFORM_WS_URL=ws://${PLATFORM_HOST}:3002
PLATFORM_API_KEY=${PLATFORM_API_KEY}
EOF

    echo "✅ Agent deployed to ${AGENT_DIR}"
}

# 部署OpenClaw Service
deploy_service() {
    echo "📦 Deploying OpenClaw Service..."

    # TODO: 部署OpenClaw服务代码

    # 设置环境变量
    sudo tee ${SERVICE_DIR}/.env > /dev/null <<EOF
PORT=3001
LLM_API_PROVIDER=deepseek
DEEPSEEK_API_KEY=your_deepseek_key_here
EOF

    echo "✅ Service deployed to ${SERVICE_DIR}"
}

# 创建systemd服务
create_services() {
    echo "⚙️  Creating systemd services..."

    # Agent服务
    sudo tee /etc/systemd/system/openclaw-agent.service > /dev/null <<'EOSVC'
[Unit]
Description=OpenClaw Remote Agent
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/openclaw-agent
EnvironmentFile=/opt/openclaw-agent/.env
ExecStart=/usr/bin/node /opt/openclaw-agent/agent-ws-updated.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=openclaw-agent

[Install]
WantedBy=multi-user.target
EOSVC

    # OpenClaw Service
    sudo tee /etc/systemd/system/openclaw-service.service > /dev/null <<'EOSVC'
[Unit]
Description=OpenClaw AI Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/openclaw-service
EnvironmentFile=/opt/openclaw-service/.env
ExecStart=/usr/bin/node /opt/openclaw-service/src/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=openclaw-service

[Install]
WantedBy=multi-user.target
EOSVC

    sudo systemctl daemon-reload
    echo "✅ Systemd services created"
}

# 启动服务
start_services() {
    echo "▶️  Starting services..."
    sudo systemctl enable openclaw-agent
    sudo systemctl enable openclaw-service
    sudo systemctl start openclaw-agent
    sudo systemctl start openclaw-service
    sleep 3

    echo "📊 Service Status:"
    echo "---"
    sudo systemctl status openclaw-agent --no-pager | head -5
    echo "---"
    sudo systemctl status openclaw-service --no-pager | head -5
}

# 主流程
main() {
    check_nodejs
    create_directories
    deploy_agent
    deploy_service
    create_services
    start_services

    echo ""
    echo "✅ Deployment completed!"
    echo ""
    echo "📝 Next Steps:"
    echo "1. Verify agent logs: sudo journalctl -u openclaw-agent -f"
    echo "2. Check platform logs for registration"
    echo "3. Verify instance appears in platform console"
}

main "$@"
```

### 步骤4: 手动部署（推荐）

由于自动化脚本需要实际的Agent代码，建议使用手动部署：

```bash
# 1. SSH登录新服务器
ssh root@<新服务器IP>

# 2. 安装Node.js v22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. 创建目录
sudo mkdir -p /opt/openclaw-agent
sudo mkdir -p /opt/openclaw-service

# 4. 从现有实例复制代码
# (在101.34.254.52上)
scp -i ~/.ssh/aiopclaw_remote_agent \
    root@101.34.254.52:/opt/openclaw-agent/agent-ws-updated.js \
    /tmp/agent-ws-updated.js

scp -i ~/.ssh/aiopclaw_remote_agent \
    -r root@101.34.254.52:/opt/openclaw-service \
    /tmp/openclaw-service

# 5. 上传到新服务器
scp -i <新服务器SSH密钥> \
    /tmp/agent-ws-updated.js \
    root@<新服务器IP>:/opt/openclaw-agent/

scp -i <新服务器SSH密钥> \
    -r /tmp/openclaw-service \
    root@<新服务器IP>:/opt/

# 6. 配置环境变量
# 在新服务器上
sudo tee /opt/openclaw-agent/.env > /dev/null <<EOF
PLATFORM_URL=http://118.25.0.190
PLATFORM_WS_URL=ws://118.25.0.190:3002
PLATFORM_API_KEY=<从平台获取的API_KEY>
EOF

# 7. 创建systemd服务（参考上面的脚本）

# 8. 启动服务
sudo systemctl daemon-reload
sudo systemctl enable openclaw-agent openclaw-service
sudo systemctl start openclaw-agent openclaw-service
```

---

## 🔍 验证与测试

### 1. 检查Agent状态

```bash
# 在新服务器上
sudo journalctl -u openclaw-agent -n 50

# 应该看到类似日志:
# "Connected to platform WebSocket"
# "Registered to platform"
# "instance_id: inst-remote-xxxxx"
```

### 2. 检查平台日志

```bash
# 在平台服务器上
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190
docker logs opclaw-backend --tail 100 | grep -E "(instance.*registered|Remote instance)"

# 应该看到:
# "Remote instance WebSocket connected"
# "instanceId: inst-remote-xxxxx"
```

### 3. 验证实例状态

```bash
# 查询实例列表
curl -H "Authorization: Bearer <your_jwt_token>" \
     http://118.25.0.190:3000/api/instances

# 应该看到新实例在列表中，status为"online"
```

### 4. 测试消息路由

发送测试消息，验证新实例能正常处理：
- 上传文件
- 发送聊天消息
- 检查AI响应

---

## ⚙️ 配置说明

### Agent环境变量

| 变量 | 说明 | 示例值 |
|------|------|--------|
| `PLATFORM_URL` | 平台HTTP地址 | `http://118.25.0.190` |
| `PLATFORM_WS_URL` | 平台WebSocket地址 | `ws://118.25.0.190:3002` |
| `PLATFORM_API_KEY` | 平台API密钥 | 从数据库获取 |

### Service环境变量

| 变量 | 说明 | 示例值 |
|------|------|--------|
| `PORT` | 服务端口 | `3001` |
| `LLM_API_PROVIDER` | LLM提供商 | `deepseek` / `openrouter` |
| `DEEPSEEK_API_KEY` | DeepSeek API密钥 | `sk-xxxxx` |
| `OPENROUTER_API_KEY` | OpenRouter密钥 | `sk-or-xxxxx` |
| `LLM_API_MODEL` | 模型名称 | `deepseek-chat` |

---

## 🔧 故障排查

### 问题1: Agent无法连接平台

**症状**: 日志显示"Connection refused"或"ECONNREFUSED"

**解决方案**:
```bash
# 1. 检查平台WebSocket服务状态
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 \
    "docker ps | grep 3002"

# 2. 检查安全组规则
# 确保新服务器可以访问118.25.0.190:3002

# 3. 检查网络连通性
telnet 118.25.0.190 3002
```

### 问题2: 注册失败

**症状**: 日志显示"Registration failed"或"Invalid API key"

**解决方案**:
```bash
# 1. 验证API_KEY
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 \
    "docker exec opclaw-backend psql -U opclaw -d opclaw \
     -c \"SELECT api_key, instance_id FROM instances WHERE deployment_type='remote'\""

# 2. 生成新的API_KEY（如果需要）
# 在平台控制台操作或直接调用API
```

### 问题3: 心跳超时

**症状**: 实例状态在online/offline之间切换

**解决方案**:
```bash
# 1. 检查心跳间隔配置
sudo systemctl cat openclaw-agent | grep Environment

# 2. 检查网络延迟
ping 118.25.0.190

# 3. 调整心跳间隔（如果网络较慢）
# 编辑.env文件，添加HEARTBEAT_INTERVAL=60000 (60秒)
```

---

## 📊 扩容能力评估

### 当前架构支持

| 维度 | 当前能力 | 扩展建议 |
|------|----------|----------|
| **实例数量** | 10+ (测试) | 数据库优化 → 1000+ |
| **并发连接** | 50+ WebSocket | 负载均衡 → 无限制 |
| **消息吞吐** | ~100 msg/s | 消息队列 → 1000+ msg/s |
| **部署速度** | 10-15分钟/实例 | 自动化脚本 → 2分钟/实例 |

### 快速扩容方案

#### 方案1: 手动复制（当前）
- 从现有实例复制代码
- 手动配置环境变量
- 手动启动服务
- **耗时**: 10-15分钟/实例

#### 方案2: 脚本化部署（推荐）
- 使用部署脚本自动化
- 预配置镜像/容器
- **耗时**: 3-5分钟/实例

#### 方案3: 镜像/容器化（最佳）
- Docker镜像预构建
- 一键启动容器
- 配置管理工具
- **耗时**: <1分钟/实例

---

## 📝 待办事项

### 高优先级

- [ ] 创建Agent Docker镜像
- [ ] 完善一键部署脚本
- [ ] 实现配置管理界面
- [ ] 添加实例健康监控

### 中优先级

- [ ] 实例自动扩缩容
- [ ] 多地域负载均衡
- [ ] 配置热更新
- [ ] 批量部署工具

### 低优先级

- [ ] 实例迁移工具
- [ ] 成本分析报表
- [ ] 性能优化建议
- [ ] 自动化测试

---

## 📞 技术支持

如有问题，请：
1. 查看平台日志: `docker logs opclaw-backend -f`
2. 查看Agent日志: `journalctl -u openclaw-agent -f`
3. 查看Service日志: `journalctl -u openclaw-service -f`
4. 联系技术支持团队

---

**文档版本**: v1.0
**最后更新**: 2026-03-18
**维护者**: AIOpc Team
