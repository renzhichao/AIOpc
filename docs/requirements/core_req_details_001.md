# 核心需求详细文档 001 (Core Requirements Details 001)

## 文档信息

| 项目 | 内容 |
|------|------|
| **需求编号** | CORE-REQ-001-DETAILS |
| **需求名称** | 云端Docker实例+二维码认领的轻量级OpenClaw服务（详细版） |
| **版本** | v1.0 |
| **创建日期** | 2026-03-12 |
| **基于文档** | core_req_001.md |
| **澄清方式** | 交互式对话 |
| **状态** | 已澄清，待开发 |

---

## 📊 需求澄清总结

### 核心决策记录

| 决策领域 | 用户选择 | 说明 |
|----------|----------|------|
| **云平台** | ✅ 阿里云（推荐） | 国内访问快，稳定性高，与原方案技术栈一致 |
| **实例规模** | ✅ 小规模验证（10-50实例） | 单台Docker宿主机，成本可控 |
| **API Key管理** | ✅ 平台统一提供 | 平台批量采购，成本可控，用户零配置 |
| **实例认领** | ✅ 单实例（简单模式） | 一个飞书账号认领一个实例 |
| **试用策略** | ✅ 运营平台可配置 | 不固定，灵活调整 |
| **定价策略** | ⚠️ 需要竞品分析 | 待进一步市场调研 |
| **飞书集成** | ✅ 飞书机器人（完整集成） | 在飞书内直接对话 |
| **数据安全** | ✅ 全选（隔离+导出+持久+迁移） | 完整的数据安全保障 |
| **监控功能** | ✅ 状态监控+使用量+行为分析 | 三大监控模块 |
| **支付方式** | ✅ 在线支付（微信/支付宝） | 国内主流支付 |
| **知识库** | ✅ 混合模式 | 通用知识库+个人知识库 |
| **技术栈** | ✅ TypeScript + Express | 类型安全，团队协作 |

---

## 1. 基础设施详细设计

### 1.1 阿里云部署架构

#### 服务器配置（小规模验证）

| 服务器类型 | 配置 | 数量 | 用途 | 月成本 | 年成本 |
|-----------|------|------|------|--------|--------|
| **ECS（Web服务）** | 2核4G, 40GB SSD | 1台 | Web前端 + API + OAuth | ¥300 | ¥3,600 |
| **ECS（Docker宿主）** | 4核8G, 100GB SSD | 1台 | 运行OpenClaw实例 | ¥600 | ¥7,200 |
| **RDS PostgreSQL** | 1核2G, 50GB | 1个 | 主数据库 | ¥200 | ¥2,400 |
| **Redis** | 1G主从版 | 1个 | 缓存 + 会话 | ¥200 | ¥2,400 |
| **OSS存储** | 100GB标准存储 | 1个 | 文件、日志备份 | ¥10 | ¥120 |
| **带宽** | 10Mbps按使用付费 | - | 公网出口 | ¥300 | ¥3,600 |
| **负载均衡（SLB）** | 共享型 | 1个 | 流量分发（可选） | ¥100 | ¥1,200 |
| **合计** | - | - | - | **¥1,710/月** | **¥20,520/年** |

#### 实例容量规划

**单台Docker宿主机容量计算**：
```yaml
# 单个OpenClaw实例资源限制
instance:
  cpu: 0.5核        # CPU限制
  memory: 1GB       # 内存限制
  disk: 5GB         # 磁盘配额

# Docker宿主机资源
host:
  cpu: 4核
  memory: 8GB
  disk: 100GB

# 理论容量
max_instances_by_cpu: 4核 / 0.5核 = 8个
max_instances_by_memory: 8GB / 1GB = 8个
max_instances_by_disk: 100GB / 5GB = 20个

# 实际容量（考虑系统预留和冗余）
actual_max_instances: 10-12个
recommended_instances: 8个   # 推荐运行数量
```

**MVP阶段实例分配**：
```
┌─────────────────────────────────────────┐
│  Docker宿主机（4核8G）                  │
├─────────────────────────────────────────┤
│  系统预留：1核2GB                        │
│  OpenClaw实例：3核6GB                    │
│    ├─ 实例#1（0.5核+1GB）               │
│    ├─ 实例#2（0.5核+1GB）               │
│    ├─ ...                               │
│    └─ 实例#10（0.5核+1GB）              │
│  剩余预留：0.5核（弹性）                 │
└─────────────────────────────────────────┘

推荐运行：8个实例
最大容量：10-12个实例
资源利用率：75-90%
```

#### 扩容路径

**阶段1：MVP（10-50实例）**
```
当前配置：1台Docker宿主机
容量：8-12个实例
成本：¥1,710/月
```

**阶段2：Beta（50-200实例）**
```
扩容方案：增加1-2台Docker宿主机
配置：2-3台Docker宿主机 + 负载均衡
容量：25-35个实例
成本：¥3,000-4,500/月
```

**阶段3：正式版（200+实例）**
```
扩容方案：容器编排平台
配置：Kubernetes + 弹性伸缩
容量：200-500个实例
成本：¥10,000-20,000/月
```

### 1.2 网络架构设计

#### 域名与SSL

```yaml
# 主域名
domain: openclaw.service.com

# 子域名分配
subdomains:
  web: www.openclaw.service.com          # Web前端
  api: api.openclaw.service.com          # API服务
  oauth: oauth.openclaw.service.com      # OAuth回调
  feishu: feishu.openclaw.service.com    # 飞书Webhook

# SSL证书
ssl:
  provider: Let's Encrypt（免费）
  auto_renew: true
  wildcard: *.openclaw.service.com
```

#### 网络拓扑

```
┌─────────────────────────────────────────────────┐
│                   互联网                       │
└─────────────────┬───────────────────────────────┘
                  │
          ┌───────▼────────┐
          │  阿里云SLB     │（可选，阶段2+）
          │  公网IP        │
          └───────┬────────┘
                  │
    ┌─────────────┼─────────────┐
    │             │             │
┌───▼────┐  ┌────▼────┐  ┌────▼────┐
│ Web ECS│  │Docker ECS│  │飞书服务器│
│2核4G   │  │ 4核8G    │  │         │
│80/443  │  │          │  │         │
└───┬────┘  └────┬────┘  └─────────┘
    │            │
    │    ┌───────┴────────┐
    │    │ Docker网络      │
    │    │ 172.18.0.0/16   │
    │    └───────┬────────┘
    │            │
    │    ┌───────┴──────────────┐
    │    │  OpenClaw实例       │
    │    │  ├─ Instance #1     │
    │    │  ├─ Instance #2     │
    │    │  ├─ ...             │
    │    │  └─ Instance #10    │
    │    └─────────────────────┘
    │
    └────────┐
             │
    ┌────────▼────────┐
    │  RDS PostgreSQL │
    │   192.168.1.10  │
    └─────────────────┘
```

---

## 2. LLM API Key管理详细设计

### 2.1 平台统一提供方案

#### API密钥采购策略

```yaml
# 平台API密钥管理
platform_api_keys:
  provider: DeepSeek

  # 密钥池管理
  key_pool:
    total_keys: 10-20个        # 总密钥数量
    active_keys: 5个           # 激活使用的密钥
    standby_keys: 5-10个       # 备用密钥

  # 密钥分配策略
  allocation:
    mode: round_robin          # 轮询分配，均衡负载
    quota_per_key: 10000次/天  # 单密钥日配额
    auto_rotation: true        # 自动轮换

  # 成本控制
  cost_control:
    monthly_budget: ¥10,000    # 月度预算上限
    alert_threshold: 80%       # 告警阈值
    auto_suspend: false        # 超限是否自动暂停
```

#### 密钥分配算法

```typescript
// 密钥分配器
class ApiKeyDistributor {
  private keyPool: ApiKey[] = [];

  /**
   * 获取可用的API密钥
   * 策略：轮询 + 配额检查
   */
  async getAvailableKey(): Promise<ApiKey> {
    // 1. 过滤出未超限的密钥
    const availableKeys = this.keyPool.filter(key =>
      key.usedToday < key.dailyQuota &&
      key.status === 'active'
    );

    if (availableKeys.length === 0) {
      throw new Error('No available API keys');
    }

    // 2. 轮询选择使用次数最少的密钥
    const selectedKey = availableKeys.reduce((min, key) =>
      key.usedToday < min.usedToday ? key : min
    );

    // 3. 更新使用计数
    selectedKey.usedToday++;

    return selectedKey;
  }

  /**
   * 重置每日配额
   * 定时任务：每天凌晨执行
   */
  resetDailyQuota(): void {
    this.keyPool.forEach(key => {
      key.usedToday = 0;
    });
  }
}
```

#### 数据库设计

**api_keys表（API密钥表）**：
```sql
CREATE TABLE api_keys (
  id SERIAL PRIMARY KEY,
  key_hash VARCHAR(64) UNIQUE NOT NULL,    -- 密钥哈希（不存储明文）
  provider VARCHAR(20) NOT NULL,           -- 提供商（deepseek/openai等）
  daily_quota INT DEFAULT 10000,           -- 日配额
  used_today INT DEFAULT 0,                -- 今日已用
  status VARCHAR(20) DEFAULT 'active',     -- active/suspended/expired
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,                    -- 过期时间
  last_used_at TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_expires (expires_at)
);
```

**instance_api_usage表（实例使用记录）**：
```sql
CREATE TABLE instance_api_usage (
  id SERIAL PRIMARY KEY,
  instance_id VARCHAR(64) NOT NULL,
  api_key_id INT NOT NULL,
  request_count INT DEFAULT 1,             -- 请求次数
  input_tokens INT DEFAULT 0,              -- 输入Token数
  output_tokens INT DEFAULT 0,             -- 输出Token数
  cost DECIMAL(10,4) DEFAULT 0,             -- 成本（元）
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_instance (instance_id),
  INDEX idx_created (created_at)
);
```

### 2.2 成本分摊与计费

#### 成本计算模型

```typescript
// DeepSeek API定价（2026年参考）
const DEEPSEEK_PRICING = {
  input: 0.001,   // 输入：¥0.001/1K tokens
  output: 0.002   // 输出：¥0.002/1K tokens
};

// 成本计算
function calculateApiCost(
  inputTokens: number,
  outputTokens: number
): number {
  const inputCost = (inputTokens / 1000) * DEEPSEEK_PRICING.input;
  const outputCost = (outputTokens / 1000) * DEEPSEEK_PRICING.output;
  return inputCost + outputCost;
}

// 示例计算
const example = {
  inputTokens: 1000,
  outputTokens: 500,
  cost: calculateApiCost(1000, 500)  // ¥0.002
};
```

#### 用户配额管理

```yaml
# 用户配额（按订阅计划）
quota_plans:
  free:
    name: "免费体验版"
    daily_messages: 10
    monthly_tokens: 50000
    cost: 0

  personal:
    name: "个人版"
    daily_messages: 100
    monthly_tokens: 500000
    cost: 49

  team:
    name: "团队版"
    daily_messages: 500
    monthly_tokens: 2000000
    cost: 99
    max_users: 5

  enterprise:
    name: "企业版"
    daily_messages: -1     # 无限制
    monthly_tokens: -1     # 无限制
    cost: 299
    max_users: 50
```

### 2.3 API密钥安全

#### 安全措施

**1. 密钥存储安全**：
```typescript
// 密钥加密存储
import { encrypt, decrypt } from './crypto-utils';

class ApiKeyStorage {
  /**
   * 存储API密钥（加密）
   */
  async storeKey(apiKey: string): Promise<void> {
    // 1. 哈希存储（用于检索）
    const keyHash = this.hashKey(apiKey);

    // 2. 加密存储（用于使用）
    const encryptedKey = await encrypt(apiKey, process.env.MASTER_KEY);

    // 3. 存入数据库
    await db.api_keys.create({
      key_hash: keyHash,
      encrypted_key: encryptedKey,
      provider: 'deepseek'
    });
  }

  /**
   * 获取API密钥（解密）
   */
  async getKey(keyId: number): Promise<string> {
    const record = await db.api_keys.findByPk(keyId);
    const decryptedKey = await decrypt(record.encrypted_key, process.env.MASTER_KEY);
    return decryptedKey;
  }
}
```

**2. 密钥轮换策略**：
```yaml
rotation_policy:
  # 自动轮换
  auto_rotation:
    enabled: true
    interval: 90天                # 每90天轮换一次
    warning_days: 7               # 提前7天通知

  # 手动轮换
  manual_rotation:
    requires_approval: true       # 需要审批
    log_change: true              # 记录变更日志

  # 应急轮换
  emergency_rotation:
    trigger: key_leak_detected    # 密钥泄露检测
    immediate: true               # 立即轮换
    notify_users: true            # 通知受影响用户
```

**3. 访问审计**：
```sql
CREATE TABLE api_key_audit_log (
  id SERIAL PRIMARY KEY,
  api_key_id INT NOT NULL,
  instance_id VARCHAR(64),
  action VARCHAR(50),              # rotate/suspend/activate
  actor VARCHAR(100),             # 操作人
  reason TEXT,                    # 操作原因
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_api_key (api_key_id),
  INDEX idx_created (created_at)
);
```

---

## 3. 实例认领流程详细设计

### 3.1 单实例认领机制

#### 认领约束

```yaml
# 认领规则
claim_rules:
  # 单用户单实例
  one_user_one_instance: true
  constraint_message: "一个飞书账号只能认领一个实例"

  # 认领后的操作限制
  after_claim:
    can_release: true             # 可释放实例
    can_transfer: false           # 不可转让（MVP阶段）
    can_reclaim: false            # 不可重新认领（释放后）

  # 实例有效期
  validity_period:
    trial: 7天                    # 免费试用
    paid: 30天                    # 付费订阅
    auto_renew: true              # 自动续费
```

#### 数据库设计

**users表（用户表）**：
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  feishu_user_id VARCHAR(64) UNIQUE NOT NULL,
  feishu_union_id VARCHAR(64),
  feishu_open_id VARCHAR(64),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255),
  avatar_url TEXT,
  phone VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW(),
  last_login_at TIMESTAMP,

  -- 订阅信息
  subscription_plan VARCHAR(20) DEFAULT 'free',  -- free/personal/team/enterprise
  subscription_expires_at TIMESTAMP,
  auto_renew BOOLEAN DEFAULT false,

  INDEX idx_feishu_user (feishu_user_id),
  INDEX idx_subscription (subscription_plan, subscription_expires_at)
);
```

**instances表（实例表）**：
```sql
CREATE TABLE instances (
  id SERIAL PRIMARY KEY,
  instance_id VARCHAR(64) UNIQUE NOT NULL,

  -- 实例状态
  status VARCHAR(20) NOT NULL,        -- pending_claimed/active/stopped/released
  phase VARCHAR(20) DEFAULT 'trial',   -- trial/paid

  -- 配置
  template VARCHAR(50),               -- 配置模板
  config JSONB,                       -- 实例配置
  system_prompt TEXT,                 -- 自定义System Prompt

  -- 认领信息
  owner_id INT,                       -- 认领用户ID
  claimed_at TIMESTAMP,

  -- Docker信息
  docker_container_id VARCHAR(64),
  docker_image VARCHAR(100),

  -- 有效期
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,

  INDEX idx_status (status),
  INDEX idx_owner (owner_id),
  INDEX idx_expires (expires_at)
);
```

**claim_records表（认领记录表）**：
```sql
CREATE TABLE claim_records (
  id SERIAL PRIMARY KEY,
  instance_id VARCHAR(64) NOT NULL,
  user_id INT NOT NULL,
  claimed_at TIMESTAMP DEFAULT NOW(),
  released_at TIMESTAMP,                -- 释放时间
  release_reason VARCHAR(20),           # user_request/expired/admin

  INDEX idx_instance (instance_id),
  INDEX idx_user (user_id)
);
```

### 3.2 认领流程时序图

```
用户              Web界面           OAuth服务            飞书API           数据库
 │                  │                  │                   │               │
 │─ 访问服务主页 ───>│                  │                   │               │
 │<─ 显示二维码 ─────│                  │                   │               │
 │                  │                  │                   │               │
 │─ 飞书扫码 ────────>│                  │                   │               │
 │                  │─ 发起授权 ───────>│                   │               │
 │                  │                  │─ OAuth授权 ──────>│               │
 │                  │                  │<─ 授权码 ──────────│               │
 │                  │                  │─ 换取Token ───────>│               │
 │                  │                  │<─ access_token ────│               │
 │                  │                  │─ 获取用户信息 ───>│               │
 │                  │                  │<─ user_info ──────│               │
 │                  │                  │                   │               │
 │                  │─ 检查认领资格 ────────────────────────────────>│               │
 │                  │<─ 可认领 ──────────────────────────────────────│               │
 │                  │                  │                   │               │
 │                  │─ 创建绑定关系 ────────────────────────────────>│               │
 │                  │                  │                   │               │
 │                  │─ 启动Docker容器 ───────────────────────────────>│               │
 │                  │<─ 容器ID ───────────────────────────────────────│               │
 │                  │                  │                   │               │
 │<─ 认领成功 ───────│                  │                   │               │
 │                  │                  │                   │               │
```

### 3.3 认领异常处理

#### 异常场景与处理

| 场景 | 检测条件 | 处理方式 | 用户提示 |
|------|----------|----------|----------|
| **用户已有实例** | 用户ID已绑定其他实例 | 拒绝认领 | "您已认领过实例，请先释放现有实例" |
| **实例已被认领** | 实例状态为active | 拒绝认领 | "该实例已被认领，请选择其他实例" |
| **实例已过期** | 当前时间 > expires_at | 拒绝认领 | "该实例已过期，请联系管理员" |
| **实例已释放** | 实例状态为released | 拒绝认领 | "该实例已释放" |
| **Docker启动失败** | 容器创建异常 | 标记为错误 | "实例启动失败，请联系客服" |

#### 错误码设计

```typescript
enum ClaimErrorCode {
  // 用户相关错误
  USER_ALREADY_HAS_INSTANCE = 'USER_ALREADY_HAS_INSTANCE',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  USER_SUBSCRIPTION_EXPIRED = 'USER_SUBSCRIPTION_EXPIRED',

  // 实例相关错误
  INSTANCE_NOT_FOUND = 'INSTANCE_NOT_FOUND',
  INSTANCE_ALREADY_CLAIMED = 'INSTANCE_ALREADY_CLAIMED',
  INSTANCE_EXPIRED = 'INSTANCE_EXPIRED',
  INSTANCE_RELEASED = 'INSTANCE_RELEASED',
  INSTANCE_INVALID_STATUS = 'INSTANCE_INVALID_STATUS',

  // Docker相关错误
  DOCKER_CREATE_FAILED = 'DOCKER_CREATE_FAILED',
  DOCKER_START_FAILED = 'DOCKER_START_FAILED',
  DOCKER_RESOURCE_LIMIT = 'DOCKER_RESOURCE_LIMIT',

  // 系统错误
  SYSTEM_ERROR = 'SYSTEM_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR'
}

// 错误响应格式
interface ClaimErrorResponse {
  code: ClaimErrorCode;
  message: string;
  details?: any;
  request_id: string;
}
```

---

## 4. 飞书机器人完整集成设计

### 4.1 飞书开放平台配置

#### 应用配置

```yaml
feishu_app:
  app_id: cli_xxxxxxxxx
  app_secret: xxxxxxxxxxxxxxxx
  app_name: "OpenClaw AI助手"
  app_description: "您的个人AI助手，基于OpenClaw框架"

  # 权限申请
  permissions:
    # 消息权限
    - id: im:message
      scope: "发送消息和接收消息"
      type: required

    - id: im:message:group_at_msg
      scope: "接收群组@消息"
      type: required

    # 用户信息
    - id: contact:user.base:readonly
      scope: "读取用户基本信息"
      type: required

    - id: contact:user.email:readonly
      scope: "读取用户邮箱"
      type: optional

    # 获取群组信息
    - id: im:chat
      scope: "获取群组信息"
      type: optional

  # 事件订阅
  events:
    - im.message.receive_v1           # 接收消息
    - im.message.group_at_msg          # 群@机器人消息

  # 回调配置
  callback:
    encrypt_key: xxxxxxxxxxxxxxxx      # 加密Key
    verification_token: xxxxxxxxxxx    # 验证Token
    url: https://openclaw.service.com/feishu/events
```

### 4.2 消息交互流程

#### 私聊交互

```
用户                    飞书                   OpenClaw服务
 │                       │                        │
 │─ 发送消息 ───────────>│                        │
 │                       │─ Webhook事件 ─────────>│
 │                       │                        │─ 验证签名
 │                       │                        │─ 路由到实例
 │                       │                        │─ 调用LLM
 │                       │                        │─ 生成回复
 │                       │<─ 发送消息API ──────────│
 │<─ 接收回复 ───────────│                        │
 │                       │                        │
```

#### 群聊交互

```
用户A                  飞书群                  OpenClaw服务
 │                       │                        │
 │─ @机器人 问题 ────────>│                        │
 │                       │─ @事件 Webhook ────────>│
 │                       │                        │─ 识别@消息
 │                       │                        │─ 提取问题内容
 │                       │                        │─ Agent处理
 │                       │<─ 发送群消息 ───────────│
 │<─ AI助手: 答案 ───────│                        │
 │                       │                        │
```

### 4.3 机器人实现

#### Webhook接收端点

```typescript
import express from 'express';
import crypto from 'crypto';

const router = express.Router();

/**
 * 飞书Webhook接收端点
 */
router.post('/feishu/events', async (req, res) => {
  const { challenge, type, event } = req.body;

  try {
    // 1. URL验证
    if (type === 'url_verification') {
      return res.json({ challenge });
    }

    // 2. 验证签名
    if (!verifySignature(req)) {
      return res.status(401).json({ code: -1, message: 'Invalid signature' });
    }

    // 3. 解密事件数据
    const decryptedEvent = decryptEvent(event);

    // 4. 处理不同事件类型
    switch (decryptedEvent.type) {
      case 'im.message.receive_v1':
        await handlePrivateMessage(decryptedEvent);
        break;

      case 'im.message.group_at_msg':
        await handleGroupMessage(decryptedEvent);
        break;

      default:
        console.log('Unhandled event type:', decryptedEvent.type);
    }

    res.json({ code: 0, message: 'success' });

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ code: -1, message: 'Internal error' });
  }
});

/**
 * 验证签名
 */
function verifySignature(req: express.Request): boolean {
  const timestamp = req.headers['x-lark-request-timestamp'];
  const nonce = req.headers['x-lark-request-nonce'];
  const body = req.body;
  const signature = req.headers['x-lark-signature'];

  const signStr = timestamp + nonce + JSON.stringify(body);
  const expectedSignature = crypto
    .createHmac('sha256', process.env.FEISHU_ENCRYPT_KEY)
    .update(signStr)
    .digest('base64');

  return signature === expectedSignature;
}

/**
 * 处理私聊消息
 */
async function handlePrivateMessage(event: any) {
  const { sender: { sender_id }, message: { content } } = event;

  // 解析消息内容
  const messageContent = JSON.parse(content);
  const userMessage = messageContent.text;

  // 查找用户对应的实例
  const instance = await findInstanceByFeishuUserId(sender_id.user_id);

  if (!instance) {
    await sendFeishuMessage(sender_id.user_id, {
      text: '您还未认领OpenClaw实例，请访问：https://openclaw.service.com'
    });
    return;
  }

  // 调用OpenClaw实例处理消息
  const response = await callOpenClawInstance(instance.instance_id, userMessage);

  // 发送回复
  await sendFeishuMessage(sender_id.user_id, {
    text: response
  });
}

/**
 * 处理群聊消息
 */
async function handleGroupMessage(event: any) {
  const { sender: { sender_id }, chat_id } = event;

  // 类似私聊，但需要检查机器人是否在群中
  const instance = await findInstanceByFeishuChatId(chat_id);

  if (!instance) {
    return; // 机器人未在该群中
  }

  // 处理消息...
}

/**
 * 发送飞书消息
 */
async function sendFeishuMessage(userId: string, content: any) {
  const url = 'https://open.feishu.cn/open-apis/im/v1/messages/create';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${await getAccessToken()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      msg_type: 'text',
      receive_id: userId,
      receive_id_type: 'user_id',
      content: JSON.stringify({
        text: content.text
      })
    })
  });

  return response.json();
}
```

### 4.4 消息类型支持

#### 支持的消息格式

```typescript
// 文本消息
interface TextMessage {
  msg_type: 'text';
  content: {
    text: string;
  };
}

// 富文本消息
interface PostMessage {
  msg_type: 'post';
  content: {
    post: {
      zh_cn: {
        title: string;
        content: Array<Array<{
          tag: 'text' | 'a' | 'at';
          text?: string;
          href?: string;
          user_id?: string;
        }>>;
      }
    }
  };
}

// 卡片消息
interface CardMessage {
  msg_type: 'interactive';
  card: {
    header: {
      title: {
        tag: 'plain_text';
        content: string;
      };
    };
    elements: Array<any>;
  };
}

// 文件消息
interface FileMessage {
  msg_type: 'file';
  content: {
    file_key: string;
  };
}
```

#### 消息模板示例

```typescript
// 财务报告模板
function generateFinancialReportMessage(data: any): PostMessage {
  return {
    msg_type: 'post',
    content: {
      post: {
        zh_cn: {
          title: '📊 财务分析报告',
          content: [
            [{
              tag: 'text',
              text: `日期：${data.date}\n`
            }],
            [{
              tag: 'text',
              text: `**本月销售额**：¥${data.sales}\n`
            }],
            [{
              tag: 'text',
              text: `**环比增长**：${data.growth}%\n`
            }],
            [{
              tag: 'text',
              text: `**利润率**：${data.profitMargin}%\n`
            }]
          ]
        }
      }
    }
  };
}

// 卡片消息模板
function generateCardMessage(title: string, items: Array<{label: string, value: string}>): CardMessage {
  return {
    msg_type: 'interactive',
    card: {
      header: {
        title: {
          tag: 'plain_text',
          content: title
        }
      },
      elements: items.map(item => ({
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**${item.label}**：${item.value}`
        }
      }))
    }
  };
}
```

---

## 5. 知识库混合模式设计

### 5.1 知识库架构

```
┌─────────────────────────────────────────────────┐
│              知识库架构                          │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │    通用知识库（平台提供）                 │  │
│  │    - 通用常识                           │  │
│  │    - 技术文档                           │  │
│  │    - 百科知识                           │  │
│  │    - 维基百科                           │  │
│  │    - 存量：1GB                          │  │
│  └──────────────────────────────────────────┘  │
│                    ↓                         │
│            知识检索引擎                      │
│                    ↓                         │
│  ┌──────────────────────────────────────────┐  │
│  │    个人知识库（用户自定义）               │  │
│  │    - 用户文档                           │  │
│  │    - 笔记内容                           │  │
│  │    - 历史对话                           │  │
│  │    - 存量：100MB/实例                    │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 5.2 知识库实现

#### 通用知识库设计

```yaml
# 通用知识库配置
general_knowledge_base:
  name: "通用知识库"

  # 数据源
  sources:
    - type: wikipedia
      url: https://zh.wikipedia.org
      update_freq: weekly

    - type: technical_docs
      path: /knowledge/general/technical
      size: 500MB

    - type: common_knowledge
      path: /knowledge/general/common
      size: 500MB

  # 向量化配置
  embedding:
    model: text-embedding-ada-002
    chunk_size: 500
    chunk_overlap: 50

  # 检索配置
  retrieval:
    top_k: 5
    threshold: 0.7
```

#### 个人知识库设计

```typescript
// 个人知识库管理
class PersonalKnowledgeBase {
  private instanceId: string;

  /**
   * 上传文档
   */
  async uploadDocument(file: File): Promise<Document> {
    // 1. 验证文件类型和大小
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('文件大小超过10MB限制');
    }

    // 2. 存储到OSS
    const ossKey = `knowledge/${this.instanceId}/${Date.now()}-${file.name}`;
    await uploadToOSS(ossKey, file);

    // 3. 提取文本
    const text = await extractText(file);

    // 4. 分块和向量化
    const chunks = await this.chunkText(text);
    const embeddings = await this.embedChunks(chunks);

    // 5. 存储到数据库
    const document = await db.documents.create({
      instance_id: this.instanceId,
      name: file.name,
      type: file.type,
      size: file.size,
      oss_key: ossKey,
      chunk_count: chunks.length
    });

    // 6. 存储向量
    for (let i = 0; i < chunks.length; i++) {
      await db.document_chunks.create({
        document_id: document.id,
        chunk_index: i,
        content: chunks[i],
        embedding: JSON.stringify(embeddings[i])
      });
    }

    return document;
  }

  /**
   * 检索相关知识
   */
  async search(query: string, topK: number = 5): Promise<SearchResult[]> {
    // 1. 向量化查询
    const queryEmbedding = await this.embedQuery(query);

    // 2. 向量相似度搜索
    const chunks = await db.document_chunks.findAll({
      where: {
        instance_id: this.instanceId
      },
      order: [
        ['cosine_similarity', 'DESC']
      ],
      limit: topK
    });

    // 3. 返回结果
    return chunks.map(chunk => ({
      content: chunk.content,
      document_id: chunk.document_id,
      score: chunk.cosine_similarity
    }));
  }
}
```

#### 知识库数据库设计

```sql
-- 文档表
CREATE TABLE documents (
  id SERIAL PRIMARY KEY,
  instance_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50),
  size BIGINT,
  oss_key VARCHAR(500),
  chunk_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_instance (instance_id)
);

-- 文档块表
CREATE TABLE document_chunks (
  id SERIAL PRIMARY KEY,
  document_id INT NOT NULL,
  instance_id VARCHAR(64) NOT NULL,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),              -- PostgreSQL pgvector扩展
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_instance_chunk (instance_id, chunk_index),
  INDEX idx_embedding (embedding) USING ivfflat (vector_cosine_ops)
);
```

---

## 6. 数据安全与隐私设计

### 6.1 数据隔离

#### 多租户隔离策略

```yaml
# 数据隔离层级
isolation_levels:
  # Level 1: 用户级隔离
  user_level:
    database:
      schema: public
      row_level_security: true
      query_filter: "owner_id = current_user_id"

    storage:
      path_prefix: "/data/{user_id}/"
      access_control: "user:{user_id}:rwx"

  # Level 2: 实例级隔离
  instance_level:
    docker:
      network: "instance_{instance_id}"
      volume_mount: "/data/{instance_id}"
      resource_limits: true

    database:
      table_partitioning: "BY HASH (instance_id)"
      query_filter: "instance_id = '{instance_id}'"

  # Level 3: 传输加密
  transit:
    https: true
    tls_version: "1.3"
    encryption: "AES-256"
```

#### 行级安全策略（RLS）

```sql
-- 启用行级安全
ALTER TABLE instances ENABLE ROW LEVEL SECURITY;

-- 用户只能访问自己的实例
CREATE POLICY user_instances_policy ON instances
  FOR ALL
  TO authenticated_user
  USING (owner_id = current_user_id());

-- 用户只能访问自己的文档
CREATE POLICY user_documents_policy ON documents
  FOR ALL
  TO authenticated_user
  USING (
    instance_id IN (
      SELECT instance_id FROM instances WHERE owner_id = current_user_id()
    )
  );
```

### 6.2 数据导出功能

#### 导出格式支持

```typescript
// 数据导出服务
class DataExportService {
  /**
   * 导出用户数据
   */
  async exportUserData(userId: number): Promise<ExportPackage> {
    // 1. 收集用户数据
    const userData = await this.collectUserData(userId);

    // 2. 打包成ZIP
    const zip = new JSZip();

    // 2.1 用户信息
    zip.file('user_profile.json', JSON.stringify(userData.profile, null, 2));

    // 2.2 对话历史
    zip.file('conversations.json', JSON.stringify(userData.conversations, null, 2));

    // 2.3 文档
    for (const doc of userData.documents) {
      zip.file(`documents/${doc.name}`, doc.content);
    }

    // 2.4 配置
    zip.file('instance_config.json', JSON.stringify(userData.config, null, 2));

    // 3. 生成ZIP文件
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    // 4. 上传到OSS（临时链接）
    const ossKey = `exports/${userId}/${Date.now()}.zip`;
    await uploadToOSS(ossKey, zipBuffer);

    // 5. 生成下载链接（7天有效）
    const downloadUrl = await generatePresignedUrl(ossKey, 7 * 24 * 3600);

    return {
      download_url: downloadUrl,
      expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      size: zipBuffer.length
    };
  }

  /**
   * 收集用户数据
   */
  private async collectUserData(userId: number) {
    const [user, instances, conversations, documents] = await Promise.all([
      // 用户信息
      db.users.findByPk(userId),

      // 实例信息
      db.instances.findAll({ where: { owner_id: userId } }),

      // 对话历史
      db.conversations.findAll({
        where: { instance_id: In(instances.map(i => i.instance_id)) },
        order: [['created_at', 'DESC']]
      }),

      // 文档
      db.documents.findAll({
        where: { instance_id: In(instances.map(i => i.instance_id)) }
      })
    ]);

    return { user, instances, conversations, documents };
  }
}
```

### 6.3 数据持久化策略

```yaml
# 数据保留策略
data_retention:
  # 对话历史
  conversations:
    retention_period: 永久保留
    backup: true
    archive_after: 90天              # 90天后归档到OSS

  # 文档
  documents:
    retention_period: 永久保留
    backup: true
    versioning: true                 # 支持版本管理

  # 日志
  logs:
    retention_period: 30天
    backup: false
    auto_delete: true
```

### 6.4 迁移到本地支持

#### 导出格式（本地部署兼容）

```json
{
  "export_version": "1.0",
  "exported_at": "2026-03-12T14:30:00Z",
  "platform": "openclaw.service.com",

  "user_profile": {
    "feishu_user_id": "ou_xxx",
    "name": "张三",
    "email": "zhangsan@example.com"
  },

  "instances": [
    {
      "instance_id": "opclaw-xxx",
      "config": {
        "llm": { "model": "deepseek-chat", "temperature": 0.7 },
        "skills": ["general_chat", "web_search"],
        "tools": ["read", "write", "web_search", "memory"]
      },
      "system_prompt": "你是一个AI助手...",
      "created_at": "2026-03-01T10:00:00Z"
    }
  ],

  "conversations": [
    {
      "instance_id": "opclaw-xxx",
      "messages": [
        { "role": "user", "content": "你好", "timestamp": "2026-03-12T14:00:00Z" },
        { "role": "assistant", "content": "你好！有什么可以帮到你的？", "timestamp": "2026-03-12T14:00:01Z" }
      ]
    }
  ],

  "documents": [
    {
      "name": "产品说明书.pdf",
      "type": "application/pdf",
      "size": 1024000,
      "content_base64": "JVBERi0xL..."
    }
  ],

  "migration_guide": {
    "local_deployment": {
      "version": "1.0.0-local",
      "import_script": "scripts/import-from-cloud.sh",
      "documentation": "https://docs.openclaw.service.com/migration"
    }
  }
}
```

#### 本地导入脚本

```bash
#!/bin/bash
# scripts/import-from-cloud.sh

echo "OpenClaw本地部署导入工具"

# 1. 解析导出文件
EXPORT_FILE=$1
if [ -z "$EXPORT_FILE" ]; then
  echo "用法: $0 <导出文件路径>"
  exit 1
fi

# 2. 验证导出文件格式
echo "验证导出文件..."
python3 scripts/validate_export.py $EXPORT_FILE
if [ $? -ne 0 ]; then
  echo "导出文件格式无效"
  exit 1
fi

# 3. 导入用户配置
echo "导入用户配置..."
python3 scripts/import_user_config.py $EXPORT_FILE

# 4. 导入对话历史
echo "导入对话历史..."
python3 scripts/import_conversations.py $EXPORT_FILE

# 5. 导入文档
echo "导入文档..."
python3 scripts/import_documents.py $EXPORT_FILE

# 6. 导入实例配置
echo "导入实例配置..."
docker-compose -f deployment/docker-compose-local.yml up -d

echo "导入完成！"
echo "请访问本地服务：https://localhost"
```

---

## 7. TypeScript + Express 技术栈详细设计

### 7.1 项目结构

```
openclaw-service/
├── src/
│   ├── index.ts                 # 应用入口
│   ├── app.ts                  # Express应用配置
│   ├── config/                 # 配置
│   │   ├── index.ts
│   │   ├── database.ts
│   │   ├── redis.ts
│   │   └── docker.ts
│   ├── controllers/            # 控制器
│   │   ├── instance.controller.ts
│   │   ├── oauth.controller.ts
│   │   ├── qr-code.controller.ts
│   │   └── user.controller.ts
│   ├── services/               # 服务层
│   │   ├── instance.service.ts
│   │   ├── oauth.service.ts
│   │   ├── docker.service.ts
│   │   ├── feishu.service.ts
│   │   └── export.service.ts
│   ├── models/                 # 数据模型
│   │   ├── User.ts
│   │   ├── Instance.ts
│   │   ├── ApiKey.ts
│   │   └── index.ts
│   ├── repositories/           # 数据访问层
│   │   ├── user.repository.ts
│   │   ├── instance.repository.ts
│   │   └── base.repository.ts
│   ├── middleware/             # 中间件
│   │   ├── auth.middleware.ts
│   │   ├── error.middleware.ts
│   │   └── logger.middleware.ts
│   ├── routes/                 # 路由
│   │   ├── index.ts
│   │   ├── instance.routes.ts
│   │   ├── oauth.routes.ts
│   │   └── feishu.routes.ts
│   ├── utils/                  # 工具函数
│   │   ├── crypto.ts
│   │   ├── logger.ts
│   │   └── validator.ts
│   ├── types/                  # TypeScript类型定义
│   │   ├── express.d.ts
│   │   ├── feishu.d.ts
│   │   └── index.ts
│   └── tests/                  # 测试
│       ├── unit/
│       ├── integration/
│       └── e2e/
├── package.json
├── tsconfig.json
├── .eslintrc.js
└── jest.config.js
```

### 7.2 核心依赖

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "typeorm": "^0.3.17",
    "pg": "^8.11.3",
    "redis": "^4.6.10",
    "dockerode": "^4.0.0",
    "axios": "^1.6.0",
    "jsonwebtoken": "^9.0.2",
    "joi": "^17.11.0",
    "winston": "^3.11.0",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "@types/express": "^4.17.17",
    "@types/node": "^20.10.0",
    "typescript": "^5.3.3",
    "ts-node": "^10.9.1",
    "jest": "^29.7.0",
    "@types/jest": "^29.5.8",
    "ts-jest": "^29.1.1",
    "eslint": "^8.54.0",
    "@typescript-eslint/eslint-plugin": "^6.12.0",
    "prettier": "^3.1.0"
  }
}
```

### 7.3 数据库配置（TypeORM）

```typescript
// src/config/database.ts
import { DataSource } from 'typeorm';
import { User } from '../models/User';
import { Instance } from '../models/Instance';
import { ApiKey } from '../models/ApiKey';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USER || 'opclaw',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'opclaw',
  synchronize: process.env.NODE_ENV === 'development', // 生产环境关闭
  logging: process.env.NODE_ENV === 'development',
  entities: [User, Instance, ApiKey],
  migrations: ['dist/migrations/*js'],
  extra: {
    max: 20, // 连接池大小
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  }
});
```

### 7.4 Docker服务封装

```typescript
// src/services/docker.service.ts
import Docker from 'dockerode';

export class DockerService {
  private docker: Docker;

  constructor() {
    this.docker = new Docker({
      socketPath: process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock'
    });
  }

  /**
   * 创建OpenClaw实例容器
   */
  async createInstanceContainer(instanceId: string, config: any): Promise<string> {
    const containerName = `opclaw-${instanceId}`;

    // 1. 拉取镜像
    await this.pullImage('openclaw:latest');

    // 2. 创建容器
    const container = await this.docker.createContainer({
      name: containerName,
      Image: 'openclaw:latest',
      Env: [
        `INSTANCE_ID=${instanceId}`,
        `DEEPSEEK_API_KEY=${config.apiKey}`,
        `SYSTEM_PROMPT=${config.systemPrompt}`,
        `ENABLED_SKILLS=${config.skills.join(',')}`,
        `NODE_ENV=production`
      ],
      HostConfig: {
        // 资源限制
        Memory: 1 * 1024 * 1024 * 1024, // 1GB
        CpuQuota: 50000, // 0.5 CPU
        CpuPeriod: 100000,

        // 端口映射
        PortBindings: {
          '3000/tcp': [{ HostPort: '0' }] // 随机端口
        },

        // 卷挂载
        Binds: {
          `/data/${instanceId}`: '/app/data'
        },

        // 网络隔离
        NetworkMode: `opclaw-network-${instanceId}`
      },

      // 重启策略
      RestartPolicy: {
        Name: 'unless-stopped'
      }
    });

    // 3. 启动容器
    await container.start();

    return container.id;
  }

  /**
   * 停止实例容器
   */
  async stopInstanceContainer(instanceId: string): Promise<void> {
    const containerName = `opclaw-${instanceId}`;

    const container = this.docker.getContainer(containerName);
    await container.stop();
  }

  /**
   * 删除实例容器
   */
  async removeInstanceContainer(instanceId: string): Promise<void> {
    const containerName = `opclaw-${instanceId}`;

    const container = this.docker.getContainer(containerName);
    await container.remove({ force: true });
  }

  /**
   * 获取容器状态
   */
  async getContainerStatus(instanceId: string): Promise<string> {
    const containerName = `opclaw-${instanceId}`;

    try {
      const container = await this.docker.getContainer(containerName);
      const info = await container.inspect();

      return info.State.Running ? 'running' : 'stopped';
    } catch (error) {
      return 'not_found';
    }
  }

  /**
   * 拉取镜像
   */
  private async pullImage(imageName: string): Promise<void> {
    await new Promise((resolve, reject) => {
      this.docker.pull(imageName, (err: Error, stream: NodeJS.ReadableStream) => {
        if (err) {
          reject(err);
        } else {
          this.docker.modem.followProgress(stream, onEvent => {
            console.log(`Pulling ${imageName}: ${onEvent.status}`);
          }, (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        }
      });
    });
  }
}
```

---

## 8. 监控与告警设计

### 8.1 监控架构

```
┌─────────────────────────────────────────────────┐
│              监控数据采集层                    │
├─────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐           │
│  │Node Exporter │  │Custom Metrics│           │
│  │(系统指标)    │  │(业务指标)    │           │
│  └──────┬───────┘  └──────┬───────┘           │
│         │                  │                   │
│         └────────┬─────────┘                   │
│                  ▼                             │
│          ┌───────────────┐                    │
│          │  Metrics API  │                    │
│          └───────┬───────┘                    │
└──────────────────┼─────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────┐
│              监控数据存储层                    │
├─────────────────────────────────────────────────┤
│          ┌───────────────┐                     │
│          │  PostgreSQL   │                     │
│          │(metrics存储) │                     │
│          └───────────────┘                     │
└─────────────────────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────┐
│              监控展示与告警                     │
├─────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐           │
│  │   Grafana    │  │Alertmanager │           │
│  │(数据可视化)  │  │(告警规则)    │           │
│  └──────────────┘  └──────┬───────┘           │
│                            │                   │
│                      ┌───────▼────────┐         │
│                      │ 飞书/邮件通知    │         │
│                      └────────────────┘         │
└─────────────────────────────────────────────────┘
```

### 8.2 监控指标定义

#### 实例状态监控

```typescript
// 实例状态指标
interface InstanceMetrics {
  instance_id: string;

  // 基础指标
  status: 'running' | 'stopped' | 'error';
  uptime: number;              // 运行时长（秒）
  cpu_usage: number;           // CPU使用率（%）
  memory_usage: number;        // 内存使用量（MB）
  disk_usage: number;          // 磁盘使用量（MB）

  // 性能指标
  response_time_avg: number;  // 平均响应时间（ms）
  response_time_p95: number;  // P95响应时间（ms）
  error_rate: number;         // 错误率（%）

  // 业务指标
  daily_message_count: number;
  daily_token_usage: number;
  daily_api_cost: number;

  // 采集时间
  collected_at: Date;
}

// 指标采集器
class MetricsCollector {
  /**
   * 采集实例指标
   */
  async collectInstanceMetrics(instanceId: string): Promise<InstanceMetrics> {
    // 1. Docker容器指标
    const dockerStats = await this.collectDockerStats(instanceId);

    // 2. 业务指标
    const businessMetrics = await this.collectBusinessMetrics(instanceId);

    return {
      instance_id: instanceId,
      status: dockerStats.status,
      uptime: dockerStats.uptime,
      cpu_usage: dockerStats.cpu_usage,
      memory_usage: dockerStats.memory_usage,
      disk_usage: dockerStats.disk_usage,
      response_time_avg: businessMetrics.response_time_avg,
      response_time_p95: businessMetrics.response_time_p95,
      error_rate: businessMetrics.error_rate,
      daily_message_count: businessMetrics.daily_message_count,
      daily_token_usage: businessMetrics.daily_token_usage,
      daily_api_cost: businessMetrics.daily_api_cost,
      collected_at: new Date()
    };
  }

  /**
   * 采集Docker统计信息
   */
  private async collectDockerStats(instanceId: string) {
    const containerName = `opclaw-${instanceId}`;
    const container = await this.docker.getContainer(containerName);
    const stats = await container.stats({ stream: false });

    return {
      status: stats.State.Running ? 'running' : 'stopped',
      uptime: stats.State.StartedAt,
      cpu_usage: stats.cpu_stats.cpu_usage,
      memory_usage: stats.memory_stats.usage,
      disk_usage: 0 // TODO: 实现磁盘使用检测
    };
  }
}
```

#### 使用量统计

```sql
-- 使用量统计表
CREATE TABLE usage_metrics (
  id SERIAL PRIMARY KEY,
  instance_id VARCHAR(64) NOT NULL,

  -- 消息统计
  message_count INT DEFAULT 0,

  -- Token统计
  input_tokens INT DEFAULT 0,
  output_tokens INT DEFAULT 0,
  total_tokens INT DEFAULT 0,

  -- 成本统计
  api_cost DECIMAL(10,4) DEFAULT 0,

  -- 时间维度
  metric_date DATE NOT NULL,
  metric_hour INT NOT NULL,      # 0-23
  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE (instance_id, metric_date, metric_hour),
  INDEX idx_instance_date (instance_id, metric_date)
);

-- 使用量汇总视图
CREATE VIEW v_daily_usage AS
SELECT
  instance_id,
  metric_date,
  SUM(message_count) as total_messages,
  SUM(total_tokens) as total_tokens,
  SUM(api_cost) as total_cost
FROM usage_metrics
GROUP BY instance_id, metric_date;
```

### 8.3 用户行为分析

```typescript
// 用户行为分析
class UserBehaviorAnalytics {
  /**
   * 分析用户活跃度
   */
  async analyzeUserActivity(userId: number, days: number = 7) {
    const result = await db.query(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as action_count,
        COUNT(DISTINCT instance_id) as active_instances
      FROM user_activity_log
      WHERE user_id = ?
        AND created_at >= NOW() - INTERVAL '? days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `, [userId, days]);

    return {
      total_days: result.length,
      total_actions: result.reduce((sum, row) => sum + row.action_count, 0),
      avg_daily_actions: result.reduce((sum, row) => sum + row.action_count, 0) / result.length,
      most_active_day: result[0]
    };
  }

  /**
   * 分析功能使用偏好
   */
  async analyzeFeaturePreference(instanceId: string) {
    const result = await db.query(`
      SELECT
        skill_name,
        COUNT(*) as usage_count,
        AVG(response_time) as avg_response_time
      FROM skill_usage_log
      WHERE instance_id = ?
        AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY skill_name
      ORDER BY usage_count DESC
    `, [instanceId]);

    return {
      most_used_skill: result[0]?.skill_name,
      skill_distribution: result,
      total_skills_used: result.length
    };
  }
}
```

---

## 9. MVP开发计划

### 9.1 开发阶段划分

#### 阶段1：基础设施搭建（Week 1-2）

**目标**：完成基础环境和核心服务

**任务清单**：
- [ ] 阿里云ECS采购和初始化（2核4G + 4核8G）
- [ ] Docker环境安装和配置
- [ ] PostgreSQL数据库部署和初始化
- [ ] Redis缓存服务部署
- [ ] 域名申请和SSL证书配置
- [ ] Nginx反向代理配置
- [ ] CI/CD流水线搭建（可选）

**验收标准**：
- ✅ 所有服务器可访问
- ✅ 数据库连接正常
- ✅ SSL证书有效
- ✅ Nginx可转发请求

#### 阶段2：后端服务开发（Week 3-4）

**目标**：完成核心API和业务逻辑

**任务清单**：
- [ ] 项目脚手架搭建（TypeScript + Express）
- [ ] 数据库模型定义（User, Instance, ApiKey）
- [ ] OAuth服务实现（飞书OAuth集成）
- [ ] 实例管理服务（创建、查询、停止）
- [ ] 二维码生成服务
- [ ] Docker容器管理服务
- [ ] API密钥管理服务
- [ ] 单元测试编写

**验收标准**：
- ✅ OAuth流程可正常走通
- ✅ 实例可以创建和启动
- ✅ Docker容器可正常管理
- ✅ 单元测试覆盖率 >80%

#### 阶段3：飞书机器人集成（Week 5-6）

**目标**：完成飞书机器人完整集成

**任务清单**：
- [ ] 飞书开放平台应用创建
- [ ] Webhook接收端点实现
- [ ] 消息处理逻辑实现
- [ ] 与OpenClaw实例通信
- [ ] 富文本消息支持
- [ ] 卡片消息支持
- [ ] 错误处理和重试机制

**验收标准**：
- ✅ 飞书扫码可正常授权
- ✅ 私聊消息可正常收发
- ✅ 群聊消息可正常收发
- ✅ 消息响应时间 <3秒

#### 阶段4：知识库功能（Week 7）

**目标**：完成混合知识库功能

**任务清单**：
- [ ] 通用知识库数据准备
- [ ] 文档上传功能
- [ ] 文档解析和分块
- [ ] 向量化索引创建
- [ ] 知识检索API
- [ ] 知识库管理界面

**验收标准**：
- ✅ 通用知识库可正常检索
- ✅ 用户可上传文档
- � ] 检索结果相关性 >70%

#### 阶段5：监控与测试（Week 8）

**目标**：完成监控系统和测试

**任务清单**：
- [ ] Prometheus + Grafana部署
- [ ] 监控指标采集
- [ ] 告警规则配置
- [ ] 单元测试完善
- [ ] 集成测试编写
- [ ] 压力测试
- [ ] 用户验收测试

**验收标准**：
- ✅ 监控面板可正常展示
- ✅ 告警可正常触发
- ✅ 单元测试覆盖率 >80%
- ✅ 集成测试通过率 >90%
- ✅ 支持10个并发实例

### 9.2 MVP功能范围

| 功能模块 | 必须实现 | 可选实现 | 暂不实现 |
|---------|---------|---------|---------|
| **实例管理** | ✅ 创建、查询、停止 | - | 启动（自动启动） |
| **认领流程** | ✅ 二维码、OAuth、绑定 | - | 转让、重新认领 |
| **飞书集成** | ✅ 私聊、群聊、富文本 | 卡片消息 | 文件上传 |
| **知识库** | ✅ 通用知识库、上传 | 向量检索优化 | 高级搜索 |
| **监控** | ✅ 实例状态、使用量 | 行为分析 | 成本告警 |
| **支付** | ❌ MVP阶段暂不实现 | - | 微信/支付宝 |
| **Web UI** | ✅ Landing、认领页 | 控制台 | 高级配置 |

---

## 10. 技术风险与应对

### 10.1 Docker容器隔离风险

**风险**：容器间资源隔离不足

**应对**：
```yaml
mitigation:
  # 资源限制
  resource_limits:
    cpu_quota: 50000
    cpu_period: 100000
    memory_limit: 1GB
    memory_swap: 0              # 禁用swap
    memory_reservation: 512MB

  # 网络隔离
  network:
    mode: bridge
    isolated: true
    firewall_rules:
      - block: inter_container_communication

  # 文件系统隔离
  filesystem:
    read_only: false
    tmpfs:
      - /tmp: noexec,nosuid,size=64m
```

### 10.2 API密钥泄露风险

**风险**：API密钥被恶意获取

**应对**：
```yaml
mitigation:
  # 加密存储
  encryption:
    at_rest: AES-256
    in_transit: TLS 1.3
    key_rotation: 90天

  # 访问控制
  access_control:
    rbac: true
    audit_log: true
    ip_whitelist: []

  # 使用监控
  monitoring:
    rate_limiting:
      per_key: 100次/分钟
      per_instance: 1000次/天
    anomaly_detection:
      enabled: true
      alert_threshold: 3x正常用量
```

### 10.3 飞书API变更风险

**风险**：飞书API不兼容变更

**应对**：
```yaml
mitigation:
  # 版本锁定
  version_locking:
    api_version: "v1.0"
    backward_compatibility: true

  # 兼容层
  adapter_layer:
    version: "1.0.0"
    auto_update: false

  # 监控告警
  monitoring:
    api_health_check: 每小时
    breaking_change_alert: 立即通知
```

---

## 11. 运营配置灵活性

### 11.1 试用策略配置

**配置表设计**：

```sql
CREATE TABLE trial_config (
  id SERIAL PRIMARY KEY,
  config_key VARCHAR(100) UNIQUE NOT NULL,
  config_value JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- 配置元数据
  is_active BOOLEAN DEFAULT true,
  requires_restart BOOLEAN DEFAULT false
);

-- 插入默认配置
INSERT INTO trial_config (config_key, config_value, description) VALUES
(
  'trial_duration_days',
  '{"value": 7, "min": 1, "max": 30}',
  '试用期长度（天）'
),
(
  'trial_instance_quota',
  '{"value": 10, "min": 1, "max": 100}',
  '试用期间实例配额'
),
(
  'trial_message_quota',
  '{"value": 100, "min": 10, "max": 1000}',
  '试用期间消息配额'
),
(
  'auto_convert_to_paid',
  '{"value": false, "can_override": true}',
  '试用期结束后自动转为付费'
);
```

**动态配置加载**：

```typescript
class TrialConfigService {
  private configCache: Map<string, any> = new Map();

  /**
   * 获取配置
   */
  async getConfig(key: string): Promise<any> {
    // 1. 检查缓存
    if (this.configCache.has(key)) {
      return this.configCache.get(key);
    }

    // 2. 从数据库加载
    const config = await db.trial_config.findOne({
      where: { config_key: key, is_active: true }
    });

    if (!config) {
      throw new Error(`Config not found: ${key}`);
    }

    // 3. 解析配置值
    const value = JSON.parse(config.config_value);

    // 4. 缓存配置（1分钟）
    this.configCache.set(key, value);
    setTimeout(() => this.configCache.delete(key), 60000);

    return value;
  }

  /**
   * 更新配置
   */
  async updateConfig(key: string, value: any): Promise<void> {
    await db.trial_config.update(
      { config_key: key },
      {
        config_value: JSON.stringify(value),
        updated_at: new Date()
      }
    );

    // 清除缓存
    this.configCache.delete(key);
  }
}
```

### 11.2 运营平台配置界面

**界面设计**：

```
┌─────────────────────────────────────────────┐
│  🔧 运营配置平台                            │
├─────────────────────────────────────────────┤
│  试用期配置                                  │
│  ├─ 试用天数：[7]天                        │
│  ├─ 实例配额：[10]个                       │
│  ├─ 消息配额：[100]条/天                    │
│  ├─ 自动转付费：[否]                       │
│  └─ [保存配置]                              │
│                                             │
│  定价策略                                    │
│  ├─ 个人版：¥[49]/月                        │
│  ├─ 团队版：¥[99]/月                        │
│  ├─ 企业版：¥[299]/月                       │
│  └─ [保存配置]                              │
│                                             │
│  功能开关                                    │
│  ├─ 知识库功能：[启用]                      │
│  ├─ 高级分析：[禁用]                       │
│  ├─ API开放：[禁用]                        │
│  └─ [保存配置]                              │
└─────────────────────────────────────────────┘
```

---

## 12. 定价策略竞品分析

### 12.1 竞品调研计划

```yaml
# 竞品分析维度
competitor_analysis:
  products:
    - name: ChatGPT Plus
      pricing: "$20/月"
      features: ["GPT-4访问", "优先响应"]
      target: "个人用户"

    - name: Claude Pro
      pricing: "$20/月"
      features: ["Claude 3访问", "更大上下文"]
      target: "个人用户"

    - name: 飞书智能伙伴
      pricing: "¥50/用户/月"
      features: ["飞书集成", "企业安全"]
      target: "企业用户"

    - name: 文心一言
      pricing: "免费 + ¥49/月会员"
      features: ["基础免费", "会员增强功能"]
      target: "大众用户"

  analysis_dimensions:
    - 定价策略
    - 功能对比
    - 目标用户
    - 差异化优势
```

### 12.2 定价建议（待竞品分析后确认）

**初步定价矩阵**：

| 版本 | 月付 | 年付 | 功能限制 | 目标用户 |
|------|------|------|----------|----------|
| **免费版** | ¥0 | ¥0 | 50条消息/月 | 体验用户 |
| **个人版** | ¥49 | ¥470(8折) | 500条消息/月，单用户 | 个人用户 |
| **团队版** | ¥99 | ¥950(8折) | 2000条消息/月，5用户 | 小团队 |
| **企业版** | ¥299 | ¥2870(8折) | 无限制，50用户 | 中小企业 |

---

## 13. API文档规范

### 13.1 RESTful API设计

**Base URL**: `https://api.openclaw.service.com/v1`

**通用响应格式**：
```json
{
  "code": 0,              // 0表示成功，非0表示错误
  "message": "success",
  "data": {},             // 响应数据
  "request_id": "req-xxx",
  "timestamp": 1678123456
}
```

**核心API端点**：

```yaml
# 实例管理
POST   /instances              # 创建实例
GET    /instances/{id}         # 查询实例详情
PUT    /instances/{id}/config  # 更新配置
DELETE /instances/{id}         # 删除实例

# 二维码
GET    /instances/{id}/qr-code # 获取认领二维码

# OAuth
GET    /oauth/authorize        # 飞书OAuth入口
POST   /oauth/callback         # OAuth回调
GET    /oauth/logout           # 登出

# 统计
GET    /instances/{id}/stats   # 使用统计
```

### 13.2 SDK设计

**JavaScript SDK示例**：

```typescript
import { OpenClawClient } from '@openclaw/sdk';

const client = new OpenClawClient({
  apiBaseUrl: 'https://api.openclaw.service.com/v1',
  apiKey: process.env.OPCLAW_API_KEY
});

// 创建实例
const instance = await client.instances.create({
  template: 'personal'
});

// 获取二维码
const qrCode = await instance.getQRCode();

// 查询统计
const stats = await instance.getStats();
console.log(`今日消息数：${stats.dailyMessageCount}`);
```

---

## 14. 附录

### 14.1 环境变量配置

```bash
# .env.example

# 数据库配置
DB_HOST=localhost
DB_PORT=5432
DB_USER=opclaw
DB_PASSWORD=your_password
DB_NAME=opclaw

# Redis配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password

# JWT配置
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d

# 飞书配置
FEISHU_APP_ID=cli_xxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxx
FEISHU_ENCRYPT_KEY=xxxxxxxxxxxxxxxxxxxxx
FEISHU_VERIFICATION_TOKEN=xxxxxxxxxxxx

# DeepSeek API配置
DEEPSEEK_API_BASE=https://api.deepseek.com
DEEPSEEK_API_KEYS=sk-xxx,sk-yyy,sk-zzz

# Docker配置
DOCKER_SOCKET_PATH=/var/run/docker.sock

# OSS配置
OSS_REGION=oss-cn-hangzhou
OSS_BUCKET=opclaw-service
OSS_ACCESS_KEY_ID=your_access_key
OSS_ACCESS_KEY_SECRET=your_secret

# 服务配置
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
```

### 14.2 数据库初始化脚本

```bash
#!/bin/bash
# scripts/init-db.sh

echo "初始化数据库..."

# 1. 创建数据库
createdb -U postgres opclaw

# 2. 执行迁移
npm run typeorm migration:run

# 3. 初始化数据
psql -U postgres -d opclaw -f scripts/init-data.sql

echo "数据库初始化完成！"
```

### 14.3 Docker镜像构建

```dockerfile
# Dockerfile
FROM node:22-alpine AS builder

WORKDIR /app

# 安装pnpm
RUN npm install -g pnpm

# 复制package文件
COPY package.json pnpm-lock.yaml ./

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制源代码
COPY . .

# 构建TypeScript
RUN pnpm build

# 生产镜像
FROM node:22-alpine

WORKDIR /app

# 安装生产依赖
RUN npm install -g pnpm && pnpm install --prod

# 复制构建产物
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD node healthcheck.js

# 启动服务
CMD ["node", "dist/index.js"]
```

---

## 15. 变更历史

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| v1.0 | 2026-03-12 | Claude Code | 初始版本，基于交互式需求澄清创建 |

---

**文档状态**：✅ 已澄清，待开发
**下一步行动**：
1. 竞品分析（定价策略）
2. 技术选型确认
3. MVP开发启动
4. 团队组建

---

*本文档基于用户交互式需求澄清生成，记录了云端轻量级OpenClaw服务的详细需求规格。*
