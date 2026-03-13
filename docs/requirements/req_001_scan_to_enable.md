# 扫码即用 OpenClaw 云服务需求分析文档
# Requirements Analysis: Scan-to-Enable OpenClaw Cloud Service

## 文档信息

| 项目 | 内容 |
|------|------|
| **需求编号** | REQ-001-SCAN-TO-ENABLE |
| **需求名称** | 扫码即用 OpenClaw 云服务 |
| **版本** | v1.0 |
| **创建日期** | 2026-03-12 |
| **状态** | 已分析，待开发 |

---

## 执行摘要

### 核心价值主张

**AIOpc 云服务**通过"扫码即用"的模式，为企业和个人用户提供零配置、开箱即用的 AI Agent 服务。用户只需扫描二维码，通过飞书授权即可在云端获得一个专属的 OpenClaw 实例，无需任何技术背景或运维经验。

**三大核心差异化优势**：

1. **极致简化**：从传统 OpenClaw 自托管的 2-4 周部署周期，缩减至 <30 秒的扫码认领体验
2. **无缝集成**：与飞书生态深度集成，在飞书内直接对话，无需切换应用
3. **成本可控**：从本地部署 ¥168,600/年 降低至 云端服务 ¥49/月（个人版），成本降低 99.6%

### 关键数据指标

| 指标 | 传统方案 | AIOpc 云服务 | 改善幅度 |
|------|---------|-------------|---------|
| **部署时间** | 2-4 周 | <30 秒 | **99.9%** ↓ |
| **技术门槛** | 需 Docker/运维知识 | 零门槛 | **100%** ↓ |
| **启动成本** | ¥168,600/年 | ¥0（7天试用） | **100%** ↓ |
| **月度成本** | ¥14,050/月 | ¥49/月（个人） | **99.6%** ↓ |
| **运维负担** | 用户自运维 | 平台托管 | **100%** ↓ |

---

## 第一部分：GAP 分析

### 1.1 当前 OpenClaw 能力分析

#### 1.1.1 架构特点

根据竞争分析报告，OpenClaw 采用 **Gateway 守护进程模型**：

```
┌─────────────────────────────────────────────────────────┐
│                   OpenClaw Gateway                       │
│  ┌───────────────────────────────────────────────────┐  │
│  │         Control Plane (WebSocket :18789)          │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐          │  │
│  │  │ Clients │  │  Nodes  │  │ Canvas  │          │  │
│  │  └─────────┘  └─────────┘  └─────────┘          │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │         Messaging Surface Layer                   │  │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐            │  │
│  │  │WhatsApp│ │Telegram│ │ Slack │ │ Discord│        │  │
│  │  └──────┘ └──────┘ └──────┘ └──────┘            │  │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐            │  │
│  │  │Signal │ │iMessage│ │Feishu│ │WeChat │         │  │
│  │  └──────┘ └──────┘ └──────┘ └──────┘            │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**核心特征**：
- ✅ **单租户架构**：一个 Gateway 实例 = 一个所有者
- ✅ **WebSocket 通信**：控制平面通过 WebSocket (127.0.0.1:18789) 连接
- ✅ **设备配对机制**：基于设备的配对流程，需审批
- ✅ **物理隔离**：完全隔离的进程和数据
- ❌ **多租户缺失**：每个实例独立，无资源共享
- ❌ **扫码即用缺失**：需要手动部署和配置

#### 1.1.2 部署方式

**社区 Docker 项目 (OpenClaw-Docker-CN-IM)**：

```bash
# 部署步骤
git clone https://github.com/justlovemaki/OpenClaw-Docker-CN-IM
cd OpenClaw-Docker-CN-IM
docker compose up -d
```

**环境配置需求**：
```yaml
# 用户需要手动配置
LLM配置:
  MODEL_ID: gemini-3-flash-preview
  BASE_URL: http://localhost:3000/v1
  API_KEY: your-api-key  # ⚠️ 用户需要自己申请

飞书配置:
  FEISHU_APP_ID: cli_xxx      # ⚠️ 用户需要自己创建飞书应用
  FEISHU_APP_SECRET: xxx
  FEISHU_BOT_NAME: OpenClaw Bot
```

**部署痛点**：
- ❌ **技术门槛高**：需要 Docker、Linux、网络配置知识
- ❌ **配置复杂**：需要申请 LLM API Key、配置飞书应用
- ❌ **耗时长**：从 0 到可用需要 2-4 周学习和部署
- ❌ **运维负担**：用户需要自己维护服务器、更新、备份

#### 1.1.3 飞书集成现状

**社区插件支持**：
- ✅ 飞书官方插件存在
- ✅ 社区 Docker 项目已集成飞书
- ✅ 支持私聊和群聊

**集成方式**：
- 用户需要在飞书开放平台创建应用
- 用户需要配置 Webhook 回调
- 用户需要获取 APP_ID 和 APP_SECRET
- 用户需要部署到公网服务器并配置域名

### 1.2 期望能力：扫码即用云服务

#### 1.2.1 目标用户体验

**扫码即用流程**（< 30 秒）：

```
用户访问服务主页
    ↓
显示二维码（带引导文案）
    ↓
用户飞书扫码
    ↓
飞书 OAuth 授权
    ↓
自动创建并启动 OpenClaw 容器
    ↓
自动配置 API Key 和技能
    ↓
自动绑定飞书机器人
    ↓
用户在飞书内开始对话 ✅
```

**零配置承诺**：
- ✅ 无需 Docker 知识
- ✅ 无需申请 API Key（平台统一提供）
- ✅ 无需创建飞书应用（平台统一创建）
- ✅ 无需域名配置（平台提供）
- ✅ 无需服务器管理（平台托管）

#### 1.2.2 技术能力要求

**1. 多租户容器编排**
```yaml
# 单台 Docker 宿主机管理多个实例
capacity:
  host: 4核8GB
  per_instance: 0.5核 + 1GB
  max_instances: 8-10个

isolation:
  network: 每实例独立网络
  volume: 每实例独立数据卷
  resource_limits: CPU/内存严格限制
```

**2. API Key 池管理**
```yaml
# 平台统一提供和分配
key_pool:
  total_keys: 10-20个
  allocation_strategy: round_robin
  quota_per_key: 10000次/天
  auto_rotation: 90天
```

**3. OAuth + 实例自动化**
```typescript
// OAuth 回调后自动执行
async function onOAuthSuccess(user: FeishuUser) {
  // 1. 检查认领资格
  const canClaim = await checkClaimEligibility(user.id);
  if (!canClaim) throw new Error('已认领过实例');

  // 2. 创建实例记录
  const instance = await createInstanceRecord(user.id);

  // 3. 启动 Docker 容器
  const containerId = await dockerService.createContainer(instance.id);

  // 4. 分配 API Key
  const apiKey = await apiKeyService.assignKey(instance.id);

  // 5. 配置飞书机器人绑定
  await feishuService.bindBot(instance.id, user.id);

  // 6. 更新实例状态
  await instance.update({ status: 'active', container_id: containerId });

  return instance;
}
```

**4. 飞书机器人自动绑定**
```yaml
# 平台统一创建飞书应用
platform_feishu_app:
  app_id: cli_xxx
  app_secret: xxx

# 动态实例路由
message_routing:
  strategy: by_feishu_user_id
  mapping:
    feishu_user_123: instance_opclaw_abc
    feishu_user_456: instance_opclaw_def
```

### 1.3 GAP 总结

| GAP 维度 | 当前 OpenClaw | 期望能力 | 差距描述 |
|---------|--------------|---------|---------|
| **部署方式** | 用户自托管 Docker | 云端扫码即用 | 需要构建云服务平台 |
| **多租户** | 单租户架构 | 多租户共享资源 | 需要实现多租户隔离和路由 |
| **API Key** | 用户自行申请 | 平台统一提供 | 需要构建 API Key 池管理系统 |
| **飞书集成** | 用户自行配置 | 平台统一配置 | 需要构建飞书应用和路由系统 |
| **实例生命周期** | 用户手动管理 | 平台自动化管理 | 需要构建实例编排服务 |
| **计费系统** | 无 | 按订阅计费 | 需要构建计费和支付系统 |
| **监控系统** | 基础日志 | 完整监控平台 | 需要构建监控和告警系统 |

---

## 第二部分：竞品分析洞察

### 2.1 竞品对比矩阵

| 特性维度 | AIOpc 云服务 | Dify | FastGPT | Coze | 飞书智能伙伴 |
|---------|-------------|------|---------|------|-------------|
| **部署方式** | 云端扫码即用 | Docker/K8s 自托管 | Docker Compose | 云托管 | 云托管 |
| **技术门槛** | ⭐ 零门槛 | ⭐⭐⭐⭐ 高 | ⭐⭐ 低 | ⭐ 零门槛 | ⭐ 零门槛 |
| **飞书集成** | ✅ 原生深度集成 | ❌ 需自行集成 | ❌ 需自行集成 | ⚠️ 有限支持 | ✅ 原生集成 |
| **扫码即用** | ✅ 核心特性 | ❌ | ❌ | ✅ | ✅ |
| **数据隔离** | ✅ 物理隔离 | ⚠️ 命名空间隔离 | ⚠️ 基础隔离 | ⚠️ 多租户逻辑隔离 | ⚠️ 企业级隔离 |
| **成本透明** | ✅ 固定月费 | ⚠️ 自托管成本 | ✅ 免费+付费 | ⚠️ 积分制 | ⚠️ 积分制 |
| **迁移能力** | ✅ 支持导出 | ✅ 开源可迁移 | ✅ 开源可迁移 | ❌ 闭源 | ❌ 闭源 |
| **定制能力** | ✅ 基于 OpenClaw | ✅ 高度可定制 | ✅ 开源可定制 | ⚠️ 受限 | ❌ 不支持 |

### 2.2 竞品定价策略分析

#### 2.2.1 飞书智能伙伴

**定价模式**：
- 初始赠送：20,000 积分
- 后续购买：按使用量计费
- 估算成本：约 ¥50/用户/月

**优势**：
- ✅ 深度飞书生态集成
- ✅ 企业级安全合规
- ✅ 扫码即用体验

**劣势**：
- ❌ 积分制定价不透明，成本不可控
- ❌ 数据迁移困难（闭源）
- ❌ 定制能力受限
- ❌ 依赖飞书生态，无法独立使用

#### 2.2.2 Dify

**定价模式**：
- 开源版：免费（自托管）
- 云版：按 API 调用计费
- 企业版：定制报价

**优势**：
- ✅ 开源，可自建，数据可控
- ✅ 功能完善，LLMOps 平台
- ✅ 企业级多租户支持（企业版）

**劣势**：
- ❌ 技术门槛高，需要运维能力
- ❌ 飞书集成需要自行开发
- ❌ 扫码即用缺失
- ❌ 成本不透明（云版）

#### 2.2.3 Coze

**定价模式**：
- 免费版 → 付费订阅（从免费转向收费）

**优势**：
- ✅ 零门槛，可视化编排
- ✅ 多租户架构完善

**劣势**：
- ❌ 商业化转型影响用户体验
- ❌ 闭源，数据迁移困难
- ❌ 定制能力受限

### 2.3 差异化策略

#### 2.3.1 核心差异化优势

**1. 开源 + 云服务的混合模式**

```
┌─────────────────────────────────────────────────┐
│           AIOpc 混合模式                        │
├─────────────────────────────────────────────────┤
│                                                 │
│  云端服务（便捷）                开源基础（可控） │
│  ├─ 扫码即用                    ├─ 基于 OpenClaw │
│  ├─ 零配置                     ├─ 数据可导出    │
│  ├─ 平台托管                   ├─ 支持本地部署  │
│  └─ 按需付费                   └─ 完全自主可控  │
│                                                 │
└─────────────────────────────────────────────────┘
```

**价值主张**：
- ✅ **入零门槛**：扫码即用，无需技术背景
- ✅ **出无锁定**：数据可导出，支持迁移到本地部署
- ✅ **成本透明**：固定月费，无隐藏成本
- ✅ **飞书原生**：深度集成，体验优于竞品

**2. 物理隔离的多租户架构**

```
竞品（逻辑隔离）           AIOpc（物理隔离）
┌─────────────────┐      ┌─────────────────────────┐
│  多租户应用      │      │  实例A    实例B   实例C │
│  ├─ 租户A数据   │      │  ┌─────┐ ┌─────┐ ┌─────┐│
│  ├─ 租户B数据   │      │  │Docker│ │Docker│ │Docker││
│  └─ 租户C数据   │      │  │ Container│ │Container│ │
└─────────────────┘      │  └─────┘ └─────┘ └─────┘│
  共享进程和内存          │    独立进程和内存       │
                         └─────────────────────────┘
  性能好但隔离弱            性能略差但隔离强
```

**安全优势**：
- ✅ **进程级隔离**：每个实例独立进程
- ✅ **资源隔离**：CPU/内存严格限制
- ✅ **数据隔离**：独立数据卷，无共享
- ✅ **故障隔离**：一个实例故障不影响其他

**3. 成本透明可控**

| 版本 | 月付 | 年付 | 消息配额 | 实例数 | 目标用户 |
|------|------|------|---------|--------|----------|
| **免费试用** | ¥0 | ¥0 | 100条/7天 | 1个 | 体验用户 |
| **个人版** | ¥49 | ¥470(8折) | 500条/月 | 1个 | 个人用户 |
| **团队版** | ¥99 | ¥950(8折) | 2000条/月 | 1个 | 小团队 |
| **企业版** | ¥299 | ¥2870(8折) | 无限制 | 1个 | 中小企业 |

**对比飞书智能伙伴**：
- 飞书：¥50/用户/月，积分制定价不透明
- AIOpc：¥49/实例/月，固定费用，成本可控

**对比 Dify 云版**：
- Dify：按 API 调用计费，成本不可预测
- AIOpc：固定月费，包含一定配额，超量付费清晰

#### 2.3.2 目标用户定位

**1. 个人用户**
- **痛点**：ChatGPT/Claude 需要魔法，国内使用不便
- **需求**：飞书内直接对话，零配置
- **AIOpc 方案**：个人版 ¥49/月，扫码即用

**2. 小团队/创业公司**
- **痛点**：没有运维能力，需要快速部署
- **需求**：开箱即用，成本可控
- **AIOpc 方案**：团队版 ¥99/月，支持 5 用户

**3. 中小企业**
- **痛点**：数据安全要求，需要独立实例
- **需求**：物理隔离，支持定制
- **AIOpc 方案**：企业版 ¥299/月，支持 50 用户，可导出数据

**4. 技术团队**
- **痛点**：需要数据自主可控
- **需求**：可迁移到本地部署
- **AIOpc 方案**：云端体验 → 数据导出 → 本地部署路径

---

## 第三部分：极致可扩展性架构设计

### 3.1 四阶段可扩展性路径

#### 阶段 1：MVP 验证（10-50 实例）

**架构**：
```
┌─────────────────────────────────────────────┐
│  单台 Docker 宿主机（4核8G）                 │
├─────────────────────────────────────────────┤
│  Nginx (80/443)                             │
│    ├─ Web 服务 (Node.js)                    │
│    └─ API 服务 (Express)                    │
│         ↓                                   │
│  Docker Engine                              │
│    ├─ 实例#1 (0.5核+1GB)                   │
│    ├─ 实例#2 (0.5核+1GB)                   │
│    ├─ ...                                   │
│    └─ 实例#10 (0.5核+1GB)                  │
│         ↓                                   │
│  PostgreSQL + Redis                         │
└─────────────────────────────────────────────┘

容量：8-10个实例
成本：¥1,710/月
用户规模：10-50人
```

**关键特性**：
- ✅ Docker 容器资源限制（CPU/内存）
- ✅ Nginx 反向代理
- ✅ PostgreSQL 数据持久化
- ✅ Redis 缓存

**限制**：
- ⚠️ 单点故障
- ⚠️ 扩容需要手动

#### 阶段 2：负载均衡（50-200 实例）

**架构**：
```
┌─────────────────────────────────────────────┐
│  阿里云 SLB (负载均衡)                       │
└──────────────┬──────────────────────────────┘
               │
      ┌────────┴────────┐
      │                 │
┌─────▼─────┐    ┌─────▼─────┐
│ Web ECS 1 │    │ Web ECS 2 │
│ 2核4G     │    │ 2核4G     │
└─────┬─────┘    └─────┬─────┘
      │                 │
      └────────┬────────┘
               │
      ┌────────▼────────────────────┐
      │  Docker 宿主机集群           │
      │  ┌────────┐  ┌────────┐   │
      │  │ Host 1│  │ Host 2│   │
      │  │ 4核8G │  │ 4核8G │   │
      │  │ 10实例│  │ 10实例│   │
      │  └────────┘  └────────┘   │
      └────────┬──────────────────┘
               │
      ┌────────▼────────┐
      │  RDS PostgreSQL │
      │  (主从复制)     │
      └─────────────────┘

容量：20-25个实例
成本：¥3,000-4,500/月
用户规模：50-200人
```

**关键特性**：
- ✅ 负载均衡（SLB）
- ✅ Web 服务高可用（2台）
- ✅ Docker 宿主集群
- ✅ 数据库主从复制

#### 阶段 3：容器编排（200-1000 实例）

**架构**：
```
┌─────────────────────────────────────────────┐
│  API Gateway (Kong/Traefik)                 │
└──────────────────┬──────────────────────────┘
                   │
       ┌───────────┼───────────┐
       │           │           │
┌──────▼───┐ ┌────▼────┐ ┌────▼────┐
│ Auth Svc │ │Agent Svc│ │Chat Svc │
└──────┬───┘ └────┬────┘ └────┬────┘
       │          │           │
┌──────▼──────────▼───────────▼────┐
│     Kubernetes Cluster           │
│  ┌────────┐  ┌────────┐        │
│  │ Node 1 │  │ Node 2 │ ...    │
│  │ 8核16G │  │ 8核16G │        │
│  │ 20实例 │  │ 20实例 │        │
│  └────────┘  └────────┘        │
└─────────────────────────────────┘
       │          │           │
┌──────▼───┐ ┌────▼────┐ ┌────▼────┐
│   Auth   │ │Agent DB │ │Chat DB  │
│  Redis   │ │ PG 1    │ │  PG 2   │
└──────────┘ └─────────┘ └─────────┘

容量：200-500个实例
成本：¥10,000-20,000/月
用户规模：200-1000人
```

**关键特性**：
- ✅ Kubernetes 容器编排
- ✅ 微服务架构
- ✅ 水平自动扩展（HPA）
- ✅ 服务网格（Istio）
- ✅ 数据库分片

#### 阶段 4：云原生分布式（1000-10000+ 实例）

**架构**：
```
┌─────────────────────────────────────────────┐
│  CDN + Global Load Balancer                 │
└──────────────────┬──────────────────────────┘
                   │
       ┌───────────┼───────────┐
       │           │           │
┌──────▼───┐ ┌────▼────┐ ┌────▼────┐
│ Region 1 │ │Region 2 │ │Region 3 │
│ (华东)   │ │ (华北)  │ │ (华南)  │
└──────┬───┘ └────┬────┘ └────┬────┘
       │          │           │
┌──────▼──────────▼───────────▼────┐
│   Multi-Region K8s Federation    │
│  ┌────────┐  ┌────────┐        │
│  │Cluster1│  │Cluster2│ ...   │
│  │100实例 │  │100实例 │        │
│  └────────┘  └────────┘        │
└─────────────────────────────────┘
       │          │           │
┌──────▼──────────▼───────────▼────┐
│    Distributed Database           │
│  ┌────────┐  ┌────────┐         │
│  │ Primary│  │Replicas│ 读写分离│
│  └────────┘  └────────┘         │
└──────────────────────────────────┘
┌──────────────────────────────────┐
│    Redis Cluster (分片)          │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐  │
│  │Shard1│Shard2│Shard3│Shard4│ │
│  └────┘ └────┘ └────┘ └────┘  │
└──────────────────────────────────┘
┌──────────────────────────────────┐
│   Message Queue (Kafka)          │
│  ┌────────┐  ┌────────┐         │
│  │ Topic1 │  │ Topic2 │ 事件驱动│
│  └────────┘  └────────┘         │
└──────────────────────────────────┘

容量：10000+个实例
成本：¥100,000+/月
用户规模：10000+人
```

**关键特性**：
- ✅ 多区域部署
- ✅ 数据库读写分离 + 分片
- ✅ Redis 分片集群
- ✅ 消息队列异步处理
- ✅ 自动故障转移
- ✅ 弹性伸缩

### 3.2 实例自动化编排

#### 3.2.1 实例生命周期管理

```typescript
// 实例编排服务
class InstanceOrchestrationService {
  private docker: Docker;
  private db: Database;
  private redis: Redis;

  /**
   * 创建实例（OAuth 回调触发）
   */
  async createInstance(user: FeishuUser): Promise<Instance> {
    // 1. 检查容量
    const availableCapacity = await this.checkCapacity();
    if (availableCapacity < 1) {
      throw new Error('实例池已满');
    }

    // 2. 生成实例 ID
    const instanceId = this.generateInstanceId();

    // 3. 创建实例记录（pending 状态）
    const instance = await this.db.instances.create({
      instance_id: instanceId,
      owner_id: user.id,
      status: 'pending',
      phase: 'trial',
      expires_at: this.calculateTrialExpiry()
    });

    // 4. 异步启动容器
    this.launchContainerAsync(instanceId, user);

    return instance;
  }

  /**
   * 异步启动容器
   */
  private async launchContainerAsync(instanceId: string, user: FeishuUser) {
    try {
      // 1. 拉取镜像
      await this.pullImage('openclaw:latest');

      // 2. 创建容器网络
      const networkId = await this.createNetwork(instanceId);

      // 3. 创建数据卷
      const volumeName = `opclaw-data-${instanceId}`;
      await this.docker.createVolume({ Name: volumeName });

      // 4. 分配 API Key
      const apiKey = await this.assignApiKey(instanceId);

      // 5. 创建容器
      const container = await this.docker.createContainer({
        name: `opclaw-${instanceId}`,
        Image: 'openclaw:latest',
        Env: [
          `INSTANCE_ID=${instanceId}`,
          `DEEPSEEK_API_KEY=${apiKey}`,
          `FEISHU_APP_ID=${process.env.FEISHU_APP_ID}`,
          `ENABLED_SKILLS=general_chat,web_search,memory`,
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
          Binds: [
            `${volumeName}:/app/data`
          ],

          // 网络隔离
          NetworkMode: networkId
        },

        // 重启策略
        RestartPolicy: {
          Name: 'unless-stopped'
        }
      });

      // 6. 启动容器
      await container.start();

      // 7. 更新实例状态
      await this.db.instances.update(
        { instance_id: instanceId },
        {
          status: 'active',
          docker_container_id: container.id,
          docker_container_name: `opclaw-${instanceId}`
        }
      );

      // 8. 发送飞书通知
      await this.sendFeishuNotification(user, 'instance_ready', {
        instance_id: instanceId
      });

    } catch (error) {
      // 标记实例为失败状态
      await this.db.instances.update(
        { instance_id: instanceId },
        { status: 'error' }
      );

      // 发送错误通知
      await this.sendFeishuNotification(user, 'instance_error', {
        instance_id: instanceId,
        error: error.message
      });
    }
  }

  /**
   * 停止实例
   */
  async stopInstance(instanceId: string): Promise<void> {
    const container = this.docker.getContainer(`opclaw-${instanceId}`);
    await container.stop();

    await this.db.instances.update(
      { instance_id: instanceId },
      { status: 'stopped' }
    );
  }

  /**
   * 删除实例
   */
  async deleteInstance(instanceId: string): Promise<void> {
    const container = this.docker.getContainer(`opclaw-${instanceId}`);

    // 1. 停止容器
    await container.stop();

    // 2. 删除容器
    await container.remove({ force: true });

    // 3. 删除数据卷（可选，根据保留策略）
    const volumeName = `opclaw-data-${instanceId}`;
    const volume = this.docker.getVolume(volumeName);
    await volume.remove();

    // 4. 删除网络
    const network = this.docker.getNetwork(`opclaw-network-${instanceId}`);
    await network.remove();

    // 5. 更新数据库
    await this.db.instances.update(
      { instance_id: instanceId },
      { status: 'deleted' }
    );
  }

  /**
   * 检查容量
   */
  private async checkCapacity(): Promise<number> {
    // 1. 获取当前活跃实例数
    const activeCount = await this.db.instances.count({
      where: { status: 'active' }
    });

    // 2. 获取最大容量
    const maxCapacity = parseInt(process.env.MAX_INSTANCES || '10');

    // 3. 返回可用容量
    return Math.max(0, maxCapacity - activeCount);
  }
}
```

#### 3.2.2 健康检查和自动恢复

```typescript
// 健康检查服务
class HealthCheckService {
  /**
   * 实例健康检查
   */
  async checkInstanceHealth(instanceId: string): Promise<HealthStatus> {
    const container = this.docker.getContainer(`opclaw-${instanceId}`);

    try {
      // 1. 获取容器状态
      const info = await container.inspect();

      // 2. 检查容器是否运行
      if (!info.State.Running) {
        return {
          status: 'unhealthy',
          reason: 'Container not running'
        };
      }

      // 3. 检查 HTTP 健康端点
      const response = await axios.get(
        `http://localhost:${info.NetworkSettings.Ports['3000/tcp'][0].HostPort}/health`,
        { timeout: 5000 }
      );

      if (response.status !== 200) {
        return {
          status: 'unhealthy',
          reason: 'Health check failed'
        };
      }

      // 4. 检查资源使用
      const stats = await container.stats({ stream: false });
      const cpuUsage = this.calculateCpuUsage(stats);
      const memoryUsage = stats.memory_stats.usage / (1024 * 1024); // MB

      return {
        status: 'healthy',
        cpu_usage: cpuUsage,
        memory_usage: memoryUsage
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        reason: error.message
      };
    }
  }

  /**
   * 自动恢复不健康实例
   */
  async recoverUnhealthyInstance(instanceId: string): Promise<void> {
    const health = await this.checkInstanceHealth(instanceId);

    if (health.status !== 'unhealthy') {
      return; // 实例健康，无需恢复
    }

    console.log(`检测到不健康实例 ${instanceId}，尝试恢复...`);

    const container = this.docker.getContainer(`opclaw-${instanceId}`);

    try {
      // 1. 尝试重启容器
      await container.restart();

      // 2. 等待容器启动
      await this.sleep(10000); // 等待 10 秒

      // 3. 再次检查健康状态
      const newHealth = await this.checkInstanceHealth(instanceId);

      if (newHealth.status === 'healthy') {
        console.log(`实例 ${instanceId} 恢复成功`);
        return;
      }

      // 4. 重启失败，尝试重建容器
      console.log(`重启失败，尝试重建实例 ${instanceId}...`);
      await this.recreateInstance(instanceId);

    } catch (error) {
      console.error(`实例 ${instanceId} 恢复失败:`, error);

      // 5. 发送告警
      await this.sendAlert(instanceId, error);
    }
  }

  /**
   * 重建实例
   */
  private async recreateInstance(instanceId: string): Promise<void> {
    // 1. 获取实例配置
    const instance = await this.db.instances.findOne({
      where: { instance_id: instanceId }
    });

    if (!instance) {
      throw new Error('Instance not found');
    }

    // 2. 删除旧容器
    const oldContainer = this.docker.getContainer(`opclaw-${instanceId}`);
    await oldContainer.remove({ force: true });

    // 3. 创建新容器
    const orchestrationService = new InstanceOrchestrationService();
    await orchestrationService.launchContainerAsync(
      instanceId,
      await instance.getUser()
    );
  }

  /**
   * 定期健康检查（定时任务）
   */
  async scheduleHealthChecks(): Promise<void> {
    setInterval(async () => {
      const activeInstances = await this.db.instances.findAll({
        where: { status: 'active' }
      });

      for (const instance of activeInstances) {
        const health = await this.checkInstanceHealth(instance.instance_id);

        if (health.status === 'unhealthy') {
          // 异步恢复，不阻塞
          this.recoverUnhealthyInstance(instance.instance_id);
        }
      }
    }, 60000); // 每分钟检查一次
  }
}
```

### 3.3 扫码即用实现细节

#### 3.3.1 OAuth 2.0 授权流程

```
┌─────────┐                    ┌─────────┐                    ┌─────────┐
│  用户   │                    │ 飞书/   │                    │  你的   │
│         │                    │  第三方 │                    │  应用   │
└────┬────┘                    └────┬────┘                    └────┬────┘
     │                              │                              │
     │  1. 访问服务主页               │                              │
     ├─────────────────────────────>│                              │
     │                              │                              │
     │  2. 显示二维码 + 引导文案      │                              │
     │<─────────────────────────────┤                              │
     │                              │                              │
     │  3. 飞书扫码                  │                              │
     ├─────────────────────────────>│                              │
     │                              │                              │
     │                              │  4. 重定向到授权页面          │
     │                              ├─────────────────────────────>│
     │                              │                              │
     │                              │  5. 用户确认授权              │
     │                              │<─────────────────────────────┤
     │                              │                              │
     │                              │  6. 授权回调 + auth_code       │
     │                              │<─────────────────────────────┤
     │                              │                              │
     │                              │  7. 用 code 换 access_token   │
     │                              ├─────────────────────────────>│
     │                              │                              │
     │                              │  8. 返回 access_token        │
     │                              │<─────────────────────────────┤
     │                              │                              │
     │                              │  9. 获取用户信息             │
     │                              ├─────────────────────────────>│
     │                              │                              │
     │                              │  10. 返回用户信息            │
     │                              │<─────────────────────────────┤
     │                              │                              │
     │                              │  11. 检查认领资格            │
     │                              ├─────────────────────────────>│
     │                              │                              │
     │                              │  12. 返回可认领              │
     │                              │<─────────────────────────────┤
     │                              │                              │
     │                              │  13. 创建实例 + 启动容器     │
     │                              ├─────────────────────────────>│
     │                              │                              │
     │                              │  14. 返回实例信息            │
     │                              │<─────────────────────────────┤
     │                              │                              │
     │  15. 跳转到成功页面           │                              │
     │<─────────────────────────────┤                              │
     │                              │                              │
     │  16. 飞书机器人自动添加        │                              │
     │<─────────────────────────────┤                              │
     │                              │                              │
     │  17. 开始对话 ✅              │                              │
     ├─────────────────────────────>│                              │
```

#### 3.3.2 OAuth 服务实现

```typescript
// OAuth 服务
class FeishuOAuthService {
  private appId: string;
  private appSecret: string;
  private redirectUri: string;

  constructor() {
    this.appId = process.env.FEISHU_APP_ID;
    this.appSecret = process.env.FEISHU_APP_SECRET;
    this.redirectUri = process.env.FEISHU_REDIRECT_URI;
  }

  /**
   * 生成授权 URL
   */
  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      app_id: this.appId,
      redirect_uri: this.redirectUri,
      scope: 'contact:user.base:readonly',
      state: state
    });

    return `https://open.feishu.cn/open-apis/authen/v1/authorize?${params}`;
  }

  /**
   * 处理 OAuth 回调
   */
  async handleCallback(authCode: string): Promise<FeishuUser> {
    // 1. 用 code 换取 access_token
    const tokenResponse = await this.exchangeCodeForToken(authCode);

    // 2. 获取用户信息
    const userInfo = await this.getUserInfo(tokenResponse.access_token);

    // 3. 创建或更新用户
    const user = await this.createOrUpdateUser(userInfo);

    return user;
  }

  /**
   * 用 code 换取 access_token
   */
  private async exchangeCodeForToken(authCode: string): Promise<TokenResponse> {
    const response = await axios.post(
      'https://open.feishu.cn/open-apis/authen/v1/oidc/access_token',
      {
        app_id: this.appId,
        app_secret: this.appSecret,
        grant_type: 'authorization_code',
        code: authCode
      }
    );

    if (response.data.code !== 0) {
      throw new Error(`Failed to exchange token: ${response.data.msg}`);
    }

    return response.data.data;
  }

  /**
   * 获取用户信息
   */
  private async getUserInfo(accessToken: string): Promise<FeishuUserInfo> {
    const response = await axios.get(
      'https://open.feishu.cn/open-apis/authen/v1/user_info',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    if (response.data.code !== 0) {
      throw new Error(`Failed to get user info: ${response.data.msg}`);
    }

    return response.data.data;
  }

  /**
   * 创建或更新用户
   */
  private async createOrUpdateUser(userInfo: FeishuUserInfo): Promise<FeishuUser> {
    // 1. 查找用户
    let user = await this.db.users.findOne({
      where: { feishu_user_id: userInfo.user_id }
    });

    if (user) {
      // 2. 更新用户信息
      user = await this.db.users.update(
        { id: user.id },
        {
          name: userInfo.name,
          avatar_url: userInfo.avatar_url,
          email: userInfo.email,
          last_login_at: new Date()
        }
      );
    } else {
      // 3. 创建新用户
      user = await this.db.users.create({
        feishu_user_id: userInfo.user_id,
        feishu_union_id: userInfo.union_id,
        feishu_open_id: userInfo.open_id,
        name: userInfo.name,
        avatar_url: userInfo.avatar_url,
        email: userInfo.email,
        subscription_plan: 'free',
        subscription_expires_at: this.calculateTrialExpiry()
      });
    }

    return user;
  }
}
```

#### 3.3.3 二维码生成和展示

```typescript
// 二维码服务
class QRCodeService {
  /**
   * 生成认领二维码
   */
  async generateClaimQRCode(instanceId: string): Promise<QRCode> {
    // 1. 生成 OAuth 授权 URL
    const state = this.generateState(instanceId);
    const authUrl = this.oauthService.getAuthorizationUrl(state);

    // 2. 生成二维码
    const qrCode = await qrcode.toDataURL(authUrl, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    return {
      qr_code: qrCode,
      auth_url: authUrl,
      state: state,
      expires_at: new Date(Date.now() + 5 * 60 * 1000) // 5分钟过期
    };
  }

  /**
   * 生成唯一 state（防 CSRF）
   */
  private generateState(instanceId: string): string {
    const randomBytes = crypto.randomBytes(16).toString('hex');
    const stateData = {
      instance_id: instanceId,
      random: randomBytes,
      timestamp: Date.now()
    };

    // 加密并签名
    const encrypted = this.encrypt(JSON.stringify(stateData));
    const signature = this.sign(encrypted);

    return `${encrypted}.${signature}`;
  }

  /**
   * 验证 state
   */
  verifyState(state: string): { instance_id: string } | null {
    const [encrypted, signature] = state.split('.');

    // 验证签名
    if (!this.verifySignature(encrypted, signature)) {
      return null;
    }

    // 解密
    const stateData = JSON.parse(this.decrypt(encrypted));

    // 检查过期时间（5分钟）
    if (Date.now() - stateData.timestamp > 5 * 60 * 1000) {
      return null;
    }

    return {
      instance_id: stateData.instance_id
    };
  }
}
```

---

## 第四部分：技术实施路线图

### 4.1 MVP 开发计划（8周）

#### Week 1-2: 基础设施搭建

**目标**：完成基础环境

**任务**：
- [ ] 阿里云服务器采购和初始化
- [ ] Docker 环境安装和配置
- [ ] PostgreSQL 数据库部署
- [ ] Redis 缓存服务部署
- [ ] 域名申请和 SSL 证书配置
- [ ] Nginx 反向代理配置
- [ ] 基础监控部署

**验收**：
- ✅ 所有服务可访问
- ✅ SSL 证书有效
- ✅ 数据库连接正常

#### Week 3-4: 核心服务开发

**目标**：完成后端核心 API

**任务**：
- [ ] 项目脚手架搭建（TypeScript + Express）
- [ ] 数据库模型定义（User, Instance, ApiKey）
- [ ] OAuth 服务实现（飞书集成）
- [ ] 实例管理服务（创建、查询、停止）
- [ ] 二维码生成服务
- [ ] Docker 容器管理服务
- [ ] API Key 池管理服务
- [ ] 单元测试编写

**验收**：
- ✅ OAuth 流程可正常走通
- ✅ 实例可以创建和启动
- ✅ Docker 容器可正常管理
- ✅ 单元测试覆盖率 >80%

#### Week 5-6: 飞书机器人集成

**目标**：完成飞书机器人完整集成

**任务**：
- [ ] 飞书开放平台应用创建
- [ ] Webhook 接收端点实现
- [ ] 消息处理逻辑实现
- [ ] 与 OpenClaw 实例通信
- [ ] 富文本消息支持
- [ ] 错误处理和重试机制
- [ ] 飞书机器人自动绑定

**验收**：
- ✅ 飞书扫码可正常授权
- ✅ 私聊消息可正常收发
- ✅ 群聊消息可正常收发
- ✅ 消息响应时间 <3秒

#### Week 7: 知识库功能

**目标**：完成混合知识库功能

**任务**：
- [ ] 通用知识库数据准备
- [ ] 文档上传功能
- [ ] 文档解析和分块
- [ ] 向量化索引创建
- [ ] 知识检索 API
- [ ] 知识库管理界面

**验收**：
- ✅ 通用知识库可正常检索
- ✅ 用户可上传文档
- ✅ 检索结果相关性 >70%

#### Week 8: 监控与测试

**目标**：完成监控系统和测试

**任务**：
- [ ] Prometheus + Grafana 部署
- [ ] 监控指标采集
- [ ] 告警规则配置
- [ ] 单元测试完善
- [ ] 集成测试编写
- [ ] 压力测试
- [ ] 用户验收测试

**验收**：
- ✅ 监控面板可正常展示
- ✅ 告警可正常触发
- ✅ 单元测试覆盖率 >80%
- ✅ 集成测试通过率 >90%
- ✅ 支持 10 个并发实例

### 4.2 技术栈总结

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| **前端** | React + TypeScript | Web UI（Landing + 控制台） |
| **后端** | Node.js + Express + TypeScript | API 服务 |
| **数据库** | PostgreSQL 15 | 主数据库 + pgvector |
| **缓存** | Redis 6 | 会话 + 缓存 |
| **容器** | Docker | OpenClaw 实例容器化 |
| **Web 服务器** | Nginx | 反向代理 |
| **监控** | Prometheus + Grafana | 监控和告警 |
| **日志** | Winston | 日志管理 |
| **测试** | Jest | 单元测试 + 集成测试 |

### 4.3 关键技术决策

#### 决策1：为什么选择 TypeScript？

**理由**：
- ✅ 类型安全，减少运行时错误
- ✅ 团队协作友好
- ✅ 与 Node.js 生态无缝集成
- ✅ IDE 支持完善

**对比 JavaScript**：
- TypeScript 提供编译时类型检查
- 更好的代码提示和重构
- 大型项目维护性更好

#### 决策2：为什么选择 PostgreSQL？

**理由**：
- ✅ 支持行级安全（RLS）
- ✅ pgvector 扩展支持向量检索
- ✅ ACID 事务支持
- ✅ 成熟稳定

**对比 MySQL**：
- pgvector 支持更好
- RLS 功能更完善
- JSONB 性能更好

#### 决策3：为什么选择 Docker 容器而非 K8s（MVP）？

**理由**：
- ✅ MVP 阶段简单够用
- ✅ 运维成本较低
- ✅ 学习曲线平缓

**演进路径**：
- MVP：Docker
- Beta：Docker Swarm
- 正式版：Kubernetes

---

## 第五部分：成本与商业模式

### 5.1 成本结构分析

#### 5.1.1 MVP 阶段成本（10-50实例）

| 项目 | 配置 | 月成本 | 年成本 |
|------|------|--------|--------|
| **ECS (Web)** | 2核4G | ¥300 | ¥3,600 |
| **ECS (Docker)** | 4核8G | ¥600 | ¥7,200 |
| **RDS PostgreSQL** | 1核2G | ¥200 | ¥2,400 |
| **Redis** | 1G | ¥200 | ¥2,400 |
| **OSS** | 100GB | ¥10 | ¥120 |
| **带宽** | 10Mbps | ¥300 | ¥3,600 |
| **SLB** | 共享型 | ¥100 | ¥1,200 |
| **合计** | - | **¥1,710** | **¥20,520** |

#### 5.1.2 单实例成本分析

**资源成本**：
```
单实例资源占用：
  CPU: 0.5核
  内存: 1GB
  磁盘: 5GB

单实例基础设施成本：
  服务器分摊: ¥900/月 / 10实例 = ¥90/月
  数据库分摊: ¥200/月 / 10实例 = ¥20/月
  缓存分摊: ¥200/月 / 10实例 = ¥20/月
  其他分摊: ¥390/月 / 10实例 = ¥39/月
  合计: ¥169/月/实例
```

**API 成本**（DeepSeek）：
```
假设平均对话：
  输入: 500 tokens
  输出: 500 tokens
  成本: (500/1000 * ¥0.001) + (500/1000 * ¥0.002) = ¥0.0015

假设每日对话数：20条
月成本：20 * 30 * ¥0.0015 = ¥0.9/月
```

**总成本**：
```
单实例总成本：
  基础设施: ¥169/月
  API 成本: ¥0.9/月
  合计: ¥169.9/月 ≈ ¥170/月
```

### 5.2 定价策略

#### 5.2.1 定价矩阵

| 版本 | 月付 | 年付 | 成本 | 毛利 | 毛利率 |
|------|------|------|------|------|--------|
| **个人版** | ¥49 | ¥470 | ¥170 | ¥-121 | -247% |
| **团队版** | ¥99 | ¥950 | ¥170 | ¥-71 | -72% |
| **企业版** | ¥299 | ¥2,870 | ¥170 | ¥129 | 43% |

**分析**：
- ⚠️ **个人版和团队版亏损**：这是获客策略
- ✅ **企业版盈利**：毛利率 43%，可持续
- ✅ **年付优惠**：8折，提升现金流

#### 5.2.2 盈亏平衡分析

**固定成本**：
```
服务器: ¥1,710/月
人员: ¥50,000/月（假设 2 人团队）
营销: ¥10,000/月
合计: ¥61,710/月
```

**盈亏平衡点**：
```
企业版订阅数 = 61,710 / 129 = 479 订阅

即需要 479 个企业版订阅才能盈亏平衡
```

**乐观场景**（12个月）：
```
月增长率: 20%
第12个月订阅数: 479 * (1.2)^11 ≈ 3,000 订阅
月营收: 3,000 * ¥299 = ¥897,000
```

### 5.3 增长策略

#### 5.3.1 免费试用策略

**试用配置**：
- 试用时长：7天
- 消息配额：100条
- 功能限制：无限制（完整体验）

**转化目标**：
- 试用转付费率：10%
- 获客成本：¥50/人

#### 5.3.2 推荐计划

**推荐奖励**：
- 推荐人：获得 1 个月免费
- 被推荐人：获得 9 折优惠

**病毒系数**：
- 目标：每个用户平均推荐 0.5 人
- 增长：月增长 20%

---

## 第六部分：风险与应对

### 6.1 技术风险

#### 风险1：容器隔离不足

**描述**：Docker 容器间资源隔离不足，可能影响性能

**应对**：
```yaml
mitigation:
  resource_limits:
    cpu_quota: 50000
    memory_limit: 1GB
    memory_swap: 0

  network:
    isolated: true
    firewall_rules:
      - block: inter_container_communication
```

#### 风险2：数据库性能瓶颈

**描述**：单实例数据库可能成为性能瓶颈

**应对**：
```yaml
scaling:
  stage_1: 读写分离
  stage_2: 连接池优化
  stage_3: 数据库分片
  stage_4: 迁移到分布式数据库
```

### 6.2 商业风险

#### 风险1：定价竞争

**描述**：竞品降价影响市场份额

**应对**：
- ✅ 差异化竞争（飞书深度集成）
- ✅ 提升服务质量（更快响应、更好支持）
- ✅ 长期合同优惠（年付8折）

#### 风险2：获客成本高

**描述**：CAC（获客成本）过高，无法盈利

**应对**：
- ✅ 内容营销（技术博客、案例）
- ✅ 社区运营（飞书用户群）
- ✅ 免费增值（免费试用）

### 6.3 合规风险

#### 风险1：数据隐私

**描述**：用户数据泄露或滥用

**应对**：
- ✅ 数据加密（传输 + 存储）
- ✅ 行级安全（RLS）
- ✅ 定期安全审计
- ✅ 隐私政策透明

#### 风险2：飞书政策变更

**描述**：飞书开放平台政策变更影响服务

**应对**：
- ✅ 版本锁定（API 版本固定）
- ✅ 多平台支持（不依赖单一平台）
- ✅ 提前适配（关注政策变化）

---

## 第七部分：总结与下一步

### 7.1 核心要点总结

**1. GAP 分析结论**：
- OpenClaw 当前为单租户自托管方案，缺乏扫码即用能力
- 需要构建云服务平台，实现多租户、自动化编排、飞书深度集成

**2. 竞品分析结论**：
- Dify：功能强大但技术门槛高
- FastGPT：简单但飞书集成缺失
- Coze：零门槛但闭源
- 飞书智能伙伴：深度集成但成本不透明
- **AIOpc 差异化**：开源 + 云服务混合模式，物理隔离，成本透明

**3. 可扩展性路径**：
- 阶段1（MVP）：单台 Docker，10实例
- 阶段2（Beta）：负载均衡，50实例
- 阶段3（正式版）：K8s，200-1000实例
- 阶段4（扩展版）：多区域，10000+实例

**4. 技术实施**：
- 技术栈：TypeScript + Express + PostgreSQL + Redis + Docker
- 开发周期：8周 MVP
- 团队规模：2-3人

### 7.2 下一步行动

**立即行动**（Week 1）：
- [ ] 组建开发团队
- [ ] 采购阿里云服务器
- [ ] 注册域名
- [ ] 创建飞书开放平台应用

**短期目标**（1个月）：
- [ ] 完成 MVP 基础设施
- [ ] 实现核心 API
- [ ] 完成飞书 OAuth 集成
- [ ] 实现扫码即用流程

**中期目标**（3个月）：
- [ ] MVP 上线
- [ ] 招募 50 个种子用户
- [ ] 收集反馈并迭代
- [ ] 实现支付系统

**长期目标**（12个月）：
- [ ] 达到 1000 付费用户
- [ ] 实现盈亏平衡
- [ ] 扩展到 Kubernetes
- [ ] 支持多平台（钉钉、企业微信）

---

## 附录

### A. 术语表

| 术语 | 解释 |
|------|------|
| **OpenClaw** | 开源 AI Agent 框架，支持多种 IM 平台 |
| **扫码即用** | 用户扫描二维码后自动创建和配置实例 |
| **飞书集成** | 与飞书开放平台深度集成，支持机器人和 OAuth |
| **多租户** | 单一平台服务多个用户，数据隔离 |
| **物理隔离** | 每个租户独立的进程和资源 |
| **Docker** | 容器技术，用于实例隔离 |
| **OAuth 2.0** | 开放授权标准，用于飞书登录 |

### B. 参考资料

**OpenClaw 相关**：
- OpenClaw GitHub: https://github.com/OpenClaw
- OpenClaw-Docker-CN-IM: https://github.com/justlovemaki/OpenClaw-Docker-CN-IM

**竞品**：
- Dify: https://github.com/langgenius/dify
- FastGPT: https://github.com/labring/FastGPT
- Coze: https://www.coze.cn/

**飞书开放平台**：
- 文档: https://open.feishu.cn/document
- API 参考: https://open.feishu.cn/document/server-docs/api-reference

**技术栈**：
- TypeScript: https://www.typescriptlang.org/
- Express: https://expressjs.com/
- PostgreSQL: https://www.postgresql.org/
- Docker: https://www.docker.com/

---

**文档版本**：v1.0
**创建日期**：2026-03-12
**作者**：Claude Code
**状态**：✅ 已完成，待评审

---

*本文档基于核心需求详细文档（core_req_details_001.md）和竞品分析报告（AI_Agent_Platform_Competitive_Analysis_Report.md）综合分析生成，提供了扫码即用 OpenClaw 云服务的完整需求分析和实施路线图。*
