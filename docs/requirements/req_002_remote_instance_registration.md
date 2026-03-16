# 需求文档 002 (Requirements 002)

## 文档信息

| 项目 | 内容 |
|------|------|
| **需求编号** | REQ-002 |
| **需求名称** | 远程 OpenClaw 实例注册与管理 |
| **版本** | v1.0 |
| **创建日期** | 2026-03-16 |
| **需求来源** | 基于 CORE-REQ-001 的扩展需求 |
| **优先级** | P0（最高优先级） |
| **状态** | 待评审 |
| **依赖** | CORE-REQ-001, FIP-001 |

---

## 1. 需求背景

### 1.1 现状问题

在 CORE-REQ-001 中，我们设计了通过平台创建 Docker 容器来部署 OpenClaw 实例的方案。然而，在实际应用场景中，存在以下限制：

**单数据中心限制**：
- ❌ 所有实例必须运行在平台的 Docker 宿主机上
- ❌ 网络延迟受限于平台服务器位置
- ❌ 无法利用用户已有的服务器资源
- ❌ 扩展性受限于单一云服务商

**资源利用不足**：
- ❌ 用户已有的闲置服务器无法利用
- ❌ 无法实现边缘计算部署
- ❌ 跨地域部署成本高

**运维复杂性**：
- ❌ 平台需要管理所有实例的生命周期
- ❌ 实例故障影响平台整体稳定性
- ❌ 资源隔离和安全性挑战

### 1.2 用户核心诉求

通过与用户沟通，发现以下新诉求：

1. **利用现有资源**：希望使用已有的云服务器部署 OpenClaw Agent
2. **灵活部署**：支持在不同的云服务商或本地服务器上部署
3. **统一管理**：通过平台统一管理所有远程实例
4. **降低成本**：避免平台承担所有实例的运行成本

### 1.3 目标场景

| 场景 | 描述 | 价值 |
|------|------|------|
| **边缘部署** | 在用户地域附近部署实例 | 降低网络延迟 |
| **资源复用** | 利用已有服务器资源 | 降低总体成本 |
| **多地域** | 跨地域部署实例 | 提升可用性 |
| **混合云** | 结合不同云服务商优势 | 避免厂商锁定 |

---

## 2. 核心诉求详解

### 2.1 诉求一：远程实例注册

#### 2.1.1 需求描述

**用户期望**：
- 在独立服务器上部署 OpenClaw Agent
- Agent 启动时自动向平台注册
- 平台识别并纳入实例管理
- 支持手动注册和自动注册两种方式

**核心价值**：
- ✅ 资源解耦：实例不再依赖平台 Docker
- ✅ 灵活部署：支持任意服务器
- ✅ 成本优化：用户自担服务器成本
- ✅ 可扩展性：支持大规模实例部署

#### 2.1.2 技术方案概述

```
┌─────────────────────────────────────────────────────────────┐
│                      平台服务器 (118.25.0.190)                │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              实例注册与管理 API                        │  │
│  │  - POST   /api/instances/register                      │  │
│  │  - POST   /api/instances/:id/heartbeat                  │  │
│  │  - DELETE /api/instances/:id/unregister                │  │
│  │  - GET    /api/instances/:id/qr-code                    │  │
│  └───────────────────────────────────────────────────────┘  │
│                         ↑↓ (HTTP/WebSocket)                  │
└─────────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────────┐
│                    远程服务器 (101.34.254.52)                │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              OpenClaw Agent                           │  │
│  │  - 自动注册机制                                        │  │
│  │  - 心跳保活                                            │  │
│  │  - 消息接收与处理                                      │  │
│  │  - 状态上报                                            │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

#### 2.1.3 注册流程设计

**自动注册流程**：
```
1. OpenClaw Agent 启动
   ↓
2. 读取配置（平台地址、认证密钥）
   ↓
3. 调用 POST /api/instances/register
   {
     "instance_type": "remote",
     "hostname": "101.34.254.52",
     "version": "1.0.0",
     "capabilities": ["chat", "web_search", ...]
   }
   ↓
4. 平台验证并分配 instance_id
   ↓
5. 返回注册成功
   {
     "instance_id": "inst-xxxxx",
     "platform_api_key": "sk-xxxxx",
     "heartbeat_interval": 30000,
     "websocket_url": "wss://platform.example.com/ws"
   }
   ↓
6. Agent 开始心跳保活
```

**手动注册流程**：
```
1. 用户在平台控制台创建实例
   ↓
2. 平台生成 instance_id 和注册令牌
   ↓
3. 用户在远程服务器上配置 Agent
   ↓
4. Agent 使用令牌向平台注册
   ↓
5. 注册成功，纳入平台管理
```

### 2.2 诉求二：心跳保活机制

#### 2.2.1 需求描述

**用户期望**：
- 平台实时了解远程实例状态
- 实例异常时自动告警
- 支持实例自动重连
- 心跳丢失后自动标记为离线

**核心价值**：
- ✅ 状态可见：实时监控实例健康
- ✅ 故障发现：及时发现实例问题
- ✅ 自动恢复：支持实例自动重连

#### 2.2.2 心跳机制设计

**心跳协议**：
```yaml
# Agent → Platform
POST /api/instances/:instance_id/heartbeat
{
  "timestamp": 1678123456789,
  "status": "online",
  "metrics": {
    "cpu_usage": 25.5,
    "memory_usage": 512,
    "active_sessions": 3,
    "messages_processed": 150
  }
}

# Platform → Agent
Response: {
  "status": "ok",
  "server_time": 1678123456790,
  "next_heartbeat": 30000,
  "commands": []  # 待执行指令
}
```

**心跳策略**：
| 参数 | 默认值 | 说明 |
|------|--------|------|
| **心跳间隔** | 30秒 | Agent 发送心跳的频率 |
| **超时时间** | 90秒 | 平台判定实例离线的阈值 |
| **重连间隔** | 5秒 | Agent 重连的初始间隔 |
| **最大重试** | 10次 | Agent 放弃重连的阈值 |

**状态转换**：
```
online → (3次心跳超时) → offline → (收到心跳) → recovering → online
online → (主动注销) → unregistered
```

### 2.3 诉求三：双向通信机制

#### 2.3.1 需求描述

**用户期望**：
- 平台可以向远程实例下发指令
- 实例可以主动向平台推送消息
- 支持实时双向通信
- 消息可靠性保证

**核心价值**：
- ✅ 远程控制：平台可管理远程实例
- ✅ 实时交互：用户与实例低延迟通信
- ✅ 消息可靠：保证消息不丢失

#### 2.3.2 通信架构设计

**通信方式对比**：

| 方式 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| **HTTP 轮询** | 简单易实现 | 延迟高，资源浪费 | ⭐⭐ |
| **WebSocket** | 实时双向，低延迟 | 需要保持连接 | ⭐⭐⭐⭐⭐ |
| **gRPC** | 高性能，流式传输 | 复杂度高 | ⭐⭐⭐⭐ |

**推荐方案**：WebSocket 长连接

```
┌─────────────────────────────────────────────────────────────┐
│                    WebSocket 通信架构                       │
│                                                              │
│  Platform (WebSocket Server)    Agent (WebSocket Client)    │
│         wss://platform/ws          ws://agent:3000/ws        │
│                                                              │
│  ┌──────────────────────┐      ┌──────────────────────┐    │
│  │  WebSocketGateway    │ ←──→ │  OpenClawAgent       │    │
│  │  - 消息路由           │      │  - 消息处理          │    │
│  │  - 连接管理           │      │  - 状态同步          │    │
│  │  - 心跳检测           │      │  - 自动重连          │    │
│  └──────────────────────┘      └──────────────────────┘    │
│            ↓↑                            ↓↑                  │
│      用户消息 ←→→→                    ←→→→ AI响应          │
│      控制指令 ←→→→                    ←→→→ 执行结果        │
└─────────────────────────────────────────────────────────────┘
```

**消息协议**：
```typescript
// 平台 → 实例（消息推送）
interface PlatformToInstanceMessage {
  type: 'user_message' | 'control_command' | 'config_update';
  message_id: string;
  instance_id: string;
  timestamp: number;
  payload: {
    content?: string;        // 用户消息内容
    command?: string;        // 控制指令
    config?: Record<string, any>;  // 配置更新
  };
}

// 实例 → 平台（响应上报）
interface InstanceToPlatformMessage {
  type: 'assistant_message' | 'command_result' | 'status_update' | 'error';
  message_id: string;        // 关联的平台消息ID
  instance_id: string;
  timestamp: number;
  payload: {
    content?: string;        // AI响应内容
    result?: any;            // 执行结果
    status?: InstanceStatus;
    error?: string;
  };
}
```

### 2.4 诉求四：统一实例管理

#### 2.4.1 需求描述

**用户期望**：
- 平台统一管理本地和远程实例
- 对用户透明实例类型差异
- 支持实例查询、监控、操作
- 一致的扫码认领体验

**核心价值**：
- ✅ 统一体验：用户无需关心实例位置
- ✅ 灵活切换：支持实例类型迁移
- ✅ 运维简化：统一的管理接口

#### 2.4.2 实例类型设计

**实例类型对比**：

| 特性 | Local (本地Docker) | Remote (远程Agent) |
|------|-------------------|-------------------|
| **部署方式** | 平台创建Docker容器 | 用户独立部署 |
| **网络位置** | 平台服务器内网 | 外部服务器 |
| **生命周期** | 平台完全管理 | Agent自主管理 |
| **通信方式** | Docker exec | WebSocket |
| **资源归属** | 平台承担 | 用户承担 |
| **故障隔离** | 可能影响平台 | 完全隔离 |
| **扩展性** | 受限于平台资源 | 无限制 |

**统一管理接口**：
```yaml
# 实例查询（对类型透明）
GET /api/instances
Response: {
  instances: [
    {
      instance_id: "inst-xxx",
      type: "local" | "remote",
      status: "online",
      hostname: "localhost" | "101.34.254.52",
      ...
    }
  ]
}

# 实例操作（类型适配）
POST /api/instances/:id/start
POST /api/instances/:id/stop
POST /api/instances/:id/restart
DELETE /api/instances/:id

# 二维码认领（统一流程）
GET /api/instances/:id/qr-code
POST /api/instances/:id/claim
```

---

## 3. 用户场景

### 3.1 场景1：边缘部署降低延迟

**用户画像**：
- 角色：出海企业
- 需求：为海外用户提供低延迟服务
- 资源：已有海外服务器

**用户故事**：
```
作为一家出海企业，
我希望在海外服务器上部署 OpenClaw 实例，
以便为当地用户提供低延迟的 AI 服务，
同时通过国内平台统一管理所有实例。

验收标准：
- 实例注册到平台 < 1分钟
- 用户访问延迟 < 100ms
- 平台可监控海外实例状态
```

**操作流程**：
```
1. 在海外服务器部署 OpenClaw Agent (5分钟)
2. 配置平台地址和认证信息 (2分钟)
3. 启动 Agent，自动注册到平台 (自动)
4. 平台识别为新实例，生成二维码 (自动)
5. 用户扫码认领，开始使用 (1分钟)

总计：约8分钟
```

### 3.2 场景2：利用闲置资源

**用户画像**：
- 角色：中小企业IT负责人
- 需求：利用已有服务器降低成本
- 资源：有多台闲置服务器

**用户故事**：
```
作为中小企业IT负责人，
我希望利用已有的闲置服务器部署 OpenClaw，
以便降低 AI 助手的运营成本，
同时通过平台统一管理和监控。

验收标准：
- 无需购买新服务器
- 平台统一管理所有实例
- 成本降低 >50%
```

### 3.3 场景3：多地域高可用

**用户画像**：
- 角色：互联网公司技术负责人
- 需求：多地域部署提升可用性
- 资源：多地域云资源

**用户故事**：
```
作为技术负责人，
我希望在不同地域部署 OpenClaw 实例，
以便在单一地域故障时自动切换，
保证服务的连续性。

验收标准：
- 支持 3+ 地域部署
- 故障切换时间 < 30秒
- 数据一致性保证
```

---

## 4. 功能需求

### 4.1 核心功能（Must Have）

#### 4.1.1 远程实例注册 API

**功能编号**：F-201
**功能名称**：外部实例注册

**功能描述**：
- 支持远程 Agent 主动注册
- 验证 Agent 身份和合法性
- 分配唯一实例 ID
- 生成访问凭证

**API 设计**：
```yaml
# 注册新实例
POST /api/instances/register
Authentication: Bearer {platform_token}
Request Body: {
  instance_type: "remote",
  hostname: string,
  port: number,
  version: string,
  capabilities: string[],
  metadata?: Record<string, any>
}
Response: {
  instance_id: string,
  platform_api_key: string,
  heartbeat_interval: number,
  websocket_url: string,
  registered_at: timestamp
}

# 验证实例
GET /api/instances/:id/verify
Response: {
  valid: boolean,
  instance?: InstanceInfo,
  error?: string
}
```

**验收标准**：
- ✅ 注册响应时间 < 1秒
- ✅ 支持并发注册
- ✅ 重复注册检测
- ✅ 生成唯一实例 ID

#### 4.1.2 心跳保活 API

**功能编号**：F-202
**功能名称**：实例心跳机制

**功能描述**：
- Agent 定期发送心跳
- 平台记录心跳时间
- 超时自动标记离线
- 重新上线自动恢复

**API 设计**：
```yaml
# 发送心跳
POST /api/instances/:instance_id/heartbeat
Authentication: Bearer {platform_api_key}
Request Body: {
  timestamp: number,
  status: "online" | "busy" | "maintenance",
  metrics: {
    cpu_usage: number,
    memory_usage: number,
    active_sessions: number,
    messages_processed: number
  }
}
Response: {
  status: "ok",
  server_time: number,
  next_heartbeat: number,
  commands: Command[]
}
```

**验收标准**：
- ✅ 心跳处理时间 < 100ms
- ✅ 超时检测准确率 100%
- ✅ 自动状态转换

#### 4.1.3 实例注销 API

**功能编号**：F-203
**功能名称**：实例主动注销

**功能描述**：
- Agent 主动请求注销
- 清理平台侧资源
- 释放实例 ID
- 记录注销日志

**API 设计**：
```yaml
# 注销实例
DELETE /api/instances/:instance_id/unregister
Authentication: Bearer {platform_api_key}
Request Body: {
  reason: string,
  timestamp: number
}
Response: {
  status: "ok",
  unregistered_at: timestamp
}
```

**验收标准**：
- ✅ 注销响应时间 < 500ms
- ✅ 资源清理完整
- ✅ 日志记录完整

#### 4.1.4 WebSocket 双向通信

**功能编号**：F-204
**功能名称**：实时双向通信

**功能描述**：
- 建立 WebSocket 长连接
- 支持消息路由
- 断线自动重连
- 消息可靠性保证

**协议设计**：
```typescript
// WebSocket 连接
WS_URL = wss://platform.example.com/ws/instances/:instance_id
Query: ?token={platform_api_key}

// 消息格式
interface WebSocketMessage {
  id: string;
  type: MessageType;
  from: 'platform' | 'instance';
  to: 'platform' | 'instance';
  timestamp: number;
  payload: any;
}

// 消息类型
enum MessageType {
  // 平台 → 实例
  USER_MESSAGE = 'user_message',
  CONTROL_COMMAND = 'control_command',
  CONFIG_UPDATE = 'config_update',
  SHUTDOWN = 'shutdown',

  // 实例 → 平台
  ASSISTANT_MESSAGE = 'assistant_message',
  COMMAND_RESULT = 'command_result',
  STATUS_UPDATE = 'status_update',
  ERROR = 'error'
}
```

**验收标准**：
- ✅ 连接建立时间 < 2秒
- ✅ 消息延迟 < 200ms
- ✅ 断线重连时间 < 5秒
- ✅ 消息送达率 > 99.9%

#### 4.1.5 实例类型统一管理

**功能编号**：F-205
**功能名称**：统一实例管理

**功能描述**：
- 对用户透明实例类型
- 统一的操作接口
- 类型适配器模式
- 一致的错误处理

**接口设计**：
```typescript
// 实例服务接口
interface InstanceService {
  createInstance(user, options): Promise<Instance>;
  startInstance(instanceId): Promise<Instance>;
  stopInstance(instanceId): Promise<Instance>;
  deleteInstance(instanceId): Promise<void>;
  getInstanceStatus(instanceId): Promise<InstanceState>;
}

// 实例适配器
interface InstanceAdapter {
  type: 'local' | 'remote';
  start(instanceId): Promise<void>;
  stop(instanceId): Promise<void>;
  sendMessage(instanceId, message): Promise<Response>;
  getStatus(instanceId): Promise<Status>;
}

// Local 适配器
class LocalDockerAdapter implements InstanceAdapter {
  type = 'local';
  async start(instanceId) {
    await this.dockerService.startContainer(instanceId);
  }
  // ...
}

// Remote 适配器
class RemoteAgentAdapter implements InstanceAdapter {
  type = 'remote';
  async start(instanceId) {
    await this.websocketService.send(instanceId, {
      type: 'control_command',
      payload: { command: 'start' }
    });
  }
  // ...
}
```

**验收标准**：
- ✅ API 接口一致
- ✅ 错误处理统一
- ✅ 性能差异 < 10%

### 4.2 扩展功能（Should Have）

#### 4.2.1 实例健康监控

**功能描述**：
- 实时资源监控
- 性能指标收集
- 异常告警
- 健康评分

**监控指标**：
```yaml
metrics:
  system:
    - cpu_usage
    - memory_usage
    - disk_usage
    - network_io

  application:
    - active_sessions
    - messages_processed
    - average_response_time
    - error_rate

  custom:
    - user_defined_metrics
```

#### 4.2.2 实例配置热更新

**功能描述**：
- 在线更新配置
- 无需重启实例
- 配置版本管理
- 回滚支持

**配置 API**：
```yaml
# 更新配置
PATCH /api/instances/:id/config
Body: {
  llm: { temperature: 0.8 },
  skills: { enable: ["code_helper"] },
  limits: { max_messages: 200 }
}
```

#### 4.2.3 实例迁移支持

**功能描述**：
- Local → Remote 迁移
- Remote → Local 迁移
- 数据迁移
- 无缝切换

### 4.3 未来功能（Could Have）

#### 4.3.1 实例自动扩缩容

**功能描述**：
- 基于负载自动扩容
- 空闲实例自动回收
- 成本优化

#### 4.3.2 多实例负载均衡

**功能描述**：
- 智能路由
- 故障转移
- 就近接入

---

## 5. 非功能需求

### 5.1 性能要求

| 指标 | 目标值 | 测量方法 |
|------|--------|----------|
| **注册响应时间** | < 1秒 | API 调用计时 |
| **心跳处理时间** | < 100ms | 服务端计时 |
| **消息延迟** | < 200ms (P95) | 端到端计时 |
| **WebSocket 连接时间** | < 2秒 | 连接建立计时 |
| **并发注册能力** | 100/秒 | 压力测试 |

### 5.2 可用性要求

| 指标 | 目标值 | 说明 |
|------|--------|------|
| **注册服务可用性** | 99.9% | 月度停机 < 43分钟 |
| **心跳检测准确性** | 100% | 无误判 |
| **消息送达率** | > 99.9% | 保证可靠传输 |
| **自动重连成功率** | > 95% | 3次尝试内 |

### 5.3 安全要求

**认证与授权**：
- ✅ 平台 Token 认证
- ✅ 实例白名单机制
- ✅ IP 限制（可选）
- ✅ 权限隔离

**数据安全**：
- ✅ WebSocket 加密 (WSS)
- ✅ 消息签名验证
- ✅ 敏感信息脱敏
- ✅ 审计日志

**防护措施**：
- ✅ 防止恶意注册
- ✅ 防止实例冒充
- ✅ 限流保护
- ✅ DDoS 防护

### 5.4 可扩展性要求

**水平扩展**：
- 支持实例数：10,000+
- 并发心跳：1,000/秒
- WebSocket 连接：10,000+

**垂直扩展**：
- 实例分布：多地域
- 负载均衡：智能路由

---

## 6. 技术架构设计

### 6.1 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                       用户层                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │  飞书App  │  │  Web UI  │  │  API调用 │                  │
│  └──────────┘  └──────────┘  └──────────┘                  │
└─────────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────┐
│                      平台层                                 │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              网关与负载均衡                           │    │
│  └─────────────────────────────────────────────────────┘    │
│                    ↓                                        │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────┐   │
│  │  实例管理API   │  │ WebSocket网关  │  │ 心跳服务   │   │
│  │  (Express)     │  │ (WS Gateway)   │  │ (Heartbeat)│   │
│  └────────────────┘  └────────────────┘  └────────────┘   │
│                    ↓                                        │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────┐   │
│  │  Local适配器   │  │  Remote适配器  │  │  统一路由  │   │
│  │  (Docker)      │  │  (WebSocket)   │  │  (Router)  │   │
│  └────────────────┘  └────────────────┘  └────────────┘   │
└─────────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────┐
│                     数据层                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │PostgreSQL│  │  Redis   │  │  OSS存储 │  │  监控    │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────┐
│                    实例层                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Local实例    │  │ Remote实例   │  │ Remote实例   │      │
│  │ (Docker)     │  │ (101.34.x)   │  │ (其他地域)   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 数据库设计

#### 实例表扩展

```sql
-- 添加实例类型字段
ALTER TABLE instances ADD COLUMN deployment_type VARCHAR(20) DEFAULT 'local';
-- local: 平台管理的Docker实例
-- remote: 远程独立部署的实例

-- 添加远程实例专属字段
ALTER TABLE instances ADD COLUMN remote_host VARCHAR(255);
ALTER TABLE instances ADD COLUMN remote_port INTEGER;
ALTER TABLE instances ADD COLUMN remote_version VARCHAR(50);
ALTER TABLE instances ADD COLUMN platform_api_key VARCHAR(255);
ALTER TABLE instances ADD COLUMN last_heartbeat_at TIMESTAMP;
ALTER TABLE instances ADD COLUMN heartbeat_interval INTEGER DEFAULT 30000;

-- 添加索引
CREATE INDEX idx_deployment_type ON instances(deployment_type);
CREATE INDEX idx_last_heartbeat ON instances(last_heartbeat_at);
```

#### 心跳记录表

```sql
CREATE TABLE instance_heartbeats (
  id SERIAL PRIMARY KEY,
  instance_id VARCHAR(64) NOT NULL,
  heartbeat_at TIMESTAMP DEFAULT NOW(),
  status VARCHAR(20) NOT NULL,
  metrics JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_instance_heartbeat (instance_id, heartbeat_at)
);
```

#### WebSocket 连接表

```sql
CREATE TABLE websocket_connections (
  id SERIAL PRIMARY KEY,
  instance_id VARCHAR(64) NOT NULL,
  connection_id VARCHAR(255) UNIQUE NOT NULL,
  connected_at TIMESTAMP DEFAULT NOW(),
  disconnected_at TIMESTAMP,
  last_ping_at TIMESTAMP,
  status VARCHAR(20) DEFAULT 'active',
  INDEX idx_instance_connection (instance_id),
  INDEX idx_connection_status (status)
);
```

### 6.3 API 规范

#### RESTful API

**Base URL**: `https://platform.example.com/api/v1`

**认证方式**: Bearer Token

```yaml
# 实例注册
POST   /instances/register
Body: {
  deployment_type: "remote",
  hostname: string,
  port: number,
  version: string,
  capabilities: string[]
}
Response: {
  instance_id: string,
  platform_api_key: string,
  heartbeat_interval: number,
  websocket_url: string
}

# 心跳更新
POST   /instances/:instance_id/heartbeat
Body: {
  timestamp: number,
  status: string,
  metrics: object
}
Response: {
  status: "ok",
  server_time: number,
  commands: array
}

# 实例注销
DELETE /instances/:instance_id/unregister
Body: {
  reason: string
}
Response: {
  status: "ok",
  unregistered_at: timestamp
}

# 获取实例信息（统一接口）
GET    /instances/:instance_id
Response: {
  instance_id: string,
  deployment_type: "local" | "remote",
  status: string,
  remote_host?: string,
  ...
}

# 实例操作（统一接口）
POST   /instances/:instance_id/start
POST   /instances/:instance_id/stop
POST   /instances/:instance_id/restart
DELETE /instances/:instance_id

# 二维码认领（统一接口）
GET    /instances/:instance_id/qr-code
POST   /instances/:instance_id/claim
```

#### WebSocket API

**连接 URL**: `wss://platform.example.com/ws/instances/:instance_id?token={api_key}`

**消息格式**：
```typescript
// 统一消息格式
interface Message {
  id: string;              // 消息唯一ID
  type: MessageType;       // 消息类型
  from: 'platform' | 'instance';
  to: 'platform' | 'instance';
  timestamp: number;
  payload: any;
  ack?: boolean;           // 是否需要确认
  ref_id?: string;         // 关联消息ID
}

// 消息确认
interface AckMessage {
  type: 'ack';
  ref_id: string;          // 确认的消息ID
  received_at: number;
}
```

---

## 7. 实施计划

### 7.1 阶段划分

#### Phase 1: 核心API实现（1周）

**目标**：实现远程实例注册和心跳机制

**任务清单**：
- [ ] 创建远程实例注册 API
- [ ] 实现心跳处理服务
- [ ] 实现实例注销 API
- [ ] 数据库表结构扩展
- [ ] 单元测试覆盖

**验收标准**：
- Agent 可以成功注册到平台
- 心跳机制正常工作
- 超时检测准确

#### Phase 2: WebSocket通信（1周）

**目标**：实现双向实时通信

**任务清单**：
- [ ] 实现 WebSocket Gateway
- [ ] 实现消息路由机制
- [ ] 实现断线重连
- [ ] 消息可靠性保证
- [ ] 集成测试

**验收标准**：
- WebSocket 连接稳定
- 消息延迟 < 200ms
- 断线自动重连

#### Phase 3: 统一管理接口（1周）

**目标**：统一本地和远程实例管理

**任务清单**：
- [ ] 实现适配器模式
- [ ] 统一实例操作接口
- [ ] 实现实例类型透明化
- [ ] 完整的端到端测试

**验收标准**：
- 用户无需关心实例类型
- API 接口一致
- 性能差异 < 10%

#### Phase 4: 部署与测试（1周）

**目标**：在实际环境中验证

**任务清单**：
- [ ] 在 101.34.254.52 部署 OpenClaw Agent
- [ ] 测试注册流程
- [ ] 测试心跳保活
- [ ] 测试 WebSocket 通信
- [ ] 测试扫码认领
- [ ] 性能测试

**验收标准**：
- 完整流程跑通
- 性能指标达标
- 文档完善

### 7.2 里程碑

| 里程碑 | 目标日期 | 交付物 |
|--------|----------|--------|
| **M1: API 完成** | Week 1 | 注册、心跳、注销 API |
| **M2: 通信完成** | Week 2 | WebSocket 双向通信 |
| **M3: 统一管理** | Week 3 | 适配器模式实现 |
| **M4: 现场验证** | Week 4 | 远程实例实际部署 |

---

## 8. 风险评估

### 8.1 技术风险

| 风险 | 概率 | 影响 | 应对措施 |
|------|------|------|----------|
| WebSocket 连接不稳定 | 中 | 高 | 实现自动重连和心跳保活 |
| 网络延迟影响体验 | 中 | 中 | 智能路由和就近接入 |
| 并发注册性能瓶颈 | 低 | 高 | 实现队列和限流 |
| 消息丢失 | 低 | 高 | 实现消息确认和重传 |

### 8.2 运维风险

| 风险 | 概率 | 影响 | 应对措施 |
|------|------|------|----------|
| 远程实例失控 | 中 | 高 | 实现强制注销机制 |
| 心跳误判 | 低 | 中 | 多次超时再判定离线 |
| 平台单点故障 | 低 | 高 | 实现高可用架构 |

---

## 9. 成功标准

### 9.1 技术指标

| 指标 | 目标值 | 测量方法 |
|------|--------|----------|
| 注册成功率 | > 99% | 统计成功注册数/总数 |
| 心跳准确率 | 100% | 对比实例实际状态 |
| 消息送达率 | > 99.9% | 消息确认统计 |
| API 响应时间 | P95 < 500ms | 性能监控 |

### 9.2 功能完整性

| 功能 | 状态 |
|------|------|
| 远程实例注册 | ✅ 必须实现 |
| 心跳保活机制 | ✅ 必须实现 |
| WebSocket 通信 | ✅ 必须实现 |
| 统一实例管理 | ✅ 必须实现 |
| 健康监控 | ⚠️ 可选实现 |
| 配置热更新 | ⚠️ 可选实现 |

### 9.3 用户体验

| 指标 | 目标值 |
|------|--------|
| 实例类型透明度 | 100% |
| 操作一致性 | 100% |
| 故障切换时间 | < 30秒 |

---

## 10. 附录

### 10.1 术语表

| 术语 | 解释 |
|------|------|
| **Local 实例** | 平台通过 Docker 创建和管理的实例 |
| **Remote 实例** | 用户独立部署、注册到平台的实例 |
| **注册** | Remote Agent 向平台登记并获取凭证的过程 |
| **心跳** | Agent 定期向平台发送状态信息的机制 |
| **适配器** | 统一不同类型实例操作接口的设计模式 |

### 10.2 参考资料

| 资源 | 链接 |
|------|------|
| OpenClaw 官方文档 | https://docs.openclaw.ai/ |
| OpenClaw NPM 包 | https://www.npmjs.com/package/openclaw |
| WebSocket 协议 RFC | https://rfc-editor.org/rfc/rfc6455/ |
| CORE-REQ-001 | [内部文档](../requirements/core_req_001.md) |
| FIP-001 | [内部文档](../fips/FIP_001_scan_to_enable.md) |

### 10.3 变更历史

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| v1.0 | 2026-03-16 | Claude Code | 初始版本 |

---

**文档状态**：✅ 待评审
**下一步行动**：组织技术评审，确认 API 设计和实施方案
**预期完成时间**：4周

---

*本需求文档扩展了 CORE-REQ-001，增加了远程实例注册与管理的功能，使平台支持更灵活的部署方式。*
