# FIP-001: 扫码即用 OpenClaw 云服务技术实现方案
# Feature Implementation Plan: Scan-to-Enable OpenClaw Cloud Service

## 文档信息

| 项目 | 内容 |
|------|------|
| **FIP 编号** | FIP-001 |
| **需求编号** | REQ-001-SCAN-TO-ENABLE |
| **标题** | 扫码即用 OpenClaw 云服务技术实现方案 |
| **版本** | v1.0 |
| **创建日期** | 2026-03-12 |
| **作者** | Claude Code |
| **状态** | 草案，待评审 |
| **目标上线** | Week 8 (MVP) |

---

## 目录

- [1. 执行摘要](#1-执行摘要)
- [2. 现状分析](#2-现状分析)
- [3. GAP 分析](#3-gap-分析)
- [4. 技术方案设计](#4-技术方案设计)
- [5. 核心模块设计](#5-核心模块设计)
- [6. 数据模型设计](#6-数据模型设计)
- [7. API 设计](#7-api-设计)
- [8. 部署架构](#8-部署架构)
- [9. 实施路径](#9-实施路径)
- [10. 技术选型论证](#10-技术选型论证)
- [11. 风险与应对](#11-风险与应对)
- [12. 附录](#12-附录)

---

## 1. 执行摘要

### 1.1 背景

AIOpc 项目当前处于**规划阶段**，仅有技术文档和部署脚本，**尚未实现任何代码**。项目原定位为**企业内部本地部署方案**，采用 4 服务器架构，为财务和电商部门提供 AI Agent 服务。

基于需求分析（REQ-001），项目需要转型为**云端 SaaS 服务**，提供"扫码即用"的 OpenClaw 实例，目标用户从企业内部转变为**公网 SaaS 用户**。

### 1.2 核心目标

**本 FIP 要解决的核心问题**：

1. **从零构建云服务平台**：当前无代码实现，需要从零开始构建完整的 SaaS 平台
2. **单租户到多租户**：从企业内部单租户转型为公网多租户 SaaS
3. **用户自托管到平台托管**：从用户自行部署转型为平台统一托管
4. **固定架构到弹性扩展**：从固定 4 服务器架构转型为支持 10-10000+ 实例的弹性架构

### 1.3 技术方案概览

**采用技术栈**：

| 层级 | 技术选型 | 版本 | 说明 |
|------|---------|------|------|
| **前端** | React + TypeScript | 18+ | Landing + 控制台 |
| **后端** | Node.js + Express + TypeScript | 22.x | API 服务 |
| **数据库** | PostgreSQL | 15+ | 主数据库 + pgvector |
| **缓存** | Redis | 7+ | 会话 + 缓存 + 消息队列 |
| **容器** | Docker + Dockerode | 24+ | OpenClaw 实例容器化 |
| **Web 服务器** | Nginx | 1.25+ | 反向代理 |
| **监控** | Prometheus + Grafana | Latest | 监控和告警 |
| **日志** | Winston + Loki | Latest | 日志管理 |

**核心能力**：
- ✅ 飞书 OAuth 2.0 集成（扫码授权）
- ✅ 多租户容器编排（Docker API）
- ✅ API Key 池管理（统一分配）
- ✅ 实例生命周期管理（自动化）
- ✅ 飞书机器人深度集成（消息路由）
- ✅ 混合知识库（通用 + 个人）
- ✅ 监控和告警（完整可观测性）

### 1.4 预期成果

**MVP 阶段**（8周）：
- 支持 10-50 个并发实例
- 单台 Docker 宿主机（4核8G）
- 完整的扫码即用流程
- 基础监控和告警

**Beta 阶段**（3个月）：
- 支持 50-200 个并发实例
- 负载均衡 + 2台宿主机
- 完善的监控和告警
- 在线支付系统

**正式版**（6个月）：
- 支持 200-1000 个并发实例
- Kubernetes 容器编排
- 企业级功能
- 多区域部署

---

## 2. 现状分析

### 2.1 项目当前状态

#### 2.1.1 文档完成度

| 文档类型 | 状态 | 完成度 |
|---------|------|--------|
| **需求文档** | ✅ 完成 | 95% |
| **架构文档** | ✅ 完成 | 90% |
| **部署指南** | ✅ 完成 | 85% |
| **代码实现** | ❌ 未开始 | 0% |

**结论**：项目处于**规划阶段**，文档完善但**无实际代码实现**。

#### 2.1.2 现有架构分析

**本地部署架构**（4服务器）：

```
┌─────────────────────────────────────────────────────────────┐
│                    企业内网环境                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Server 1 (Web/API)      Server 2 (Agent)                   │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │  Nginx (80/443) │    │  OpenClaw Agent │                │
│  │       ↓         │    │  (Node.js v22)  │                │
│  │  Web Frontend   │    │                 │                │
│  └─────────────────┘    └─────────────────┘                │
│                                                              │
│  Server 3 (Database)    Server 4 (Monitoring)               │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │  PostgreSQL     │    │  Prometheus     │                │
│  │  Redis          │    │  Grafana        │                │
│  └─────────────────┘    └─────────────────┘                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
         ↑                         ↑
         │ VPN/专线                │
         └─────────────────────────┘
         阿里云端（飞书接入）
```

**关键特征**：
- ✅ 企业内网部署，数据不出内网
- ✅ 单租户架构，单一企业使用
- ✅ 固定架构，4台物理/虚拟服务器
- ✅ OpenClaw Agent 提供 25 Tools + 53 Skills
- ✅ 飞书集成（通过 VPN/专线）

#### 2.1.3 现有技术栈

| 组件 | 技术选型 | 说明 |
|------|---------|------|
| **AI 基础设施** | OpenClaw | 基于 Node.js v22 |
| **LLM 模型** | DeepSeek-V3 | 国产开源模型 |
| **运行时** | Node.js v22 | JavaScript 运行时 |
| **数据库** | PostgreSQL 14 | 主数据库 |
| **缓存** | Redis 7 | 缓存和会话 |
| **容器化** | Docker + Docker Compose | 容器编排 |
| **Web 服务器** | Nginx | 反向代理 |
| **存储** | 阿里云 OSS | 文档和媒体 |

**现状**：所有技术选型已确定，有完善的部署脚本（deploy-local.sh, deploy.sh）。

### 2.2 现有文件结构

```
AIOpc/
├── README.md                      # 项目概述
├── CLAUDE.md                      # Claude Code 项目指导
├── SUMMARY.md                     # 项目总结
├── SUMMARY-local.md               # 本地部署总结
├── config/                        # 配置文件目录（空）
├── platform/                      # 平台代码目录（空）
├── scripts/                       # 部署脚本
│   ├── deploy-local.sh            # 本地部署脚本（540行）
│   └── deploy.sh                  # 通用部署脚本
├── deployment/                    # 部署配置
│   └── docker-compose.yml         # Docker Compose 配置
├── docs/                          # 文档目录
│   ├── requirements/              # 需求文档
│   │   ├── core_req_001.md
│   │   ├── core_req_details_001.md
│   │   └── req_001_scan_to_enable.md
│   ├── fips/                      # 功能实现方案（新建）
│   │   └── FIP_001_scan_to_enable.md（本文档）
│   ├── 01-technical-architecture.md
│   ├── 02-resource-requirements.md
│   ├── 03-network-architecture.md
│   ├── 04-chat-integration.md
│   ├── 05-agent-roles.md
│   ├── 06-cost-model.md
│   └── 07-local-deployment-guide.md
└── claudedocs/                    # Claude Code 生成的文档
    ├── project-status-review.md
    └── AI_Agent_Platform_Competitive_Analysis_Report.md
```

**关键发现**：
- ❌ `platform/` 目录为空，**无任何代码实现**
- ❌ `config/` 目录为空，**无配置文件**
- ✅ `scripts/` 有部署脚本，但仅用于本地部署
- ✅ `docs/` 文档完善，架构设计清晰

---

## 3. GAP 分析

### 3.1 架构 GAP

| 维度 | 现状 | 目标 | GAP 描述 |
|------|------|------|---------|
| **部署模式** | 本地部署（企业内网） | 云端托管（公网 SaaS） | 需要构建云服务平台 |
| **租户模式** | 单租户（企业内部） | 多租户（公网 SaaS） | 需要实现多租户隔离和路由 |
| **用户规模** | 单一企业（<100人） | 公网用户（10000+人） | 需要支持大规模并发 |
| **实例数量** | 固定 4-8个 Agent | 弹性 10-10000+ 实例 | 需要实现容器编排 |
| **访问方式** | 内网访问 + VPN | 公网访问 + OAuth | 需要实现 OAuth 和认证 |
| **运维模式** | 用户自运维 | 平台统一托管 | 需要实现自动化运维 |

### 3.2 技术 GAP

#### 3.2.1 代码实现 GAP

| 模块 | 现状 | 目标 | GAP 等级 |
|------|------|------|---------|
| **后端 API** | ❌ 无 | ✅ TypeScript + Express | 🔴 高 |
| **前端界面** | ❌ 无 | ✅ React + TypeScript | 🔴 高 |
| **数据库模型** | ❌ 无 | ✅ TypeORM + PostgreSQL | 🔴 高 |
| **OAuth 服务** | ❌ 无 | ✅ 飞书 OAuth 2.0 | 🔴 高 |
| **容器编排** | ⚠️ Docker Compose | ✅ Docker API 动态管理 | 🟡 中 |
| **实例管理** | ❌ 无 | ✅ 完整生命周期管理 | 🔴 高 |
| **API Key 池** | ❌ 无 | ✅ 池管理和分配 | 🔴 高 |
| **飞书集成** | ⚠️ 基础集成 | ✅ 深度集成 + 消息路由 | 🟡 中 |
| **监控告警** | ⚠️ 基础监控 | ✅ 完整可观测性 | 🟡 中 |
| **计费系统** | ❌ 无 | ✅ 订阅和支付 | 🔴 高 |

**结论**：**从零构建**，所有核心模块需要实现。

#### 3.2.2 技术栈 GAP

| 组件 | 现状 | 目标 | 变更必要性 |
|------|------|------|-----------|
| **后端语言** | JavaScript (Node.js) | TypeScript (Node.js) | ✅ **必需**（类型安全） |
| **后端框架** | 无 | Express | ✅ **必需**（新增） |
| **ORM** | 无 | TypeORM | ✅ **必需**（新增） |
| **前端框架** | 无 | React | ✅ **必需**（新增） |
| **认证方式** | 无 | OAuth 2.0 + JWT | ✅ **必需**（新增） |
| **容器管理** | Docker Compose | Docker API (Dockerode) | ✅ **必需**（动态管理） |
| **数据库** | PostgreSQL | PostgreSQL + pgvector | ⚠️ 扩展（向量检索） |

**关键变更**：
- ✅ **JavaScript → TypeScript**：提供类型安全，支持大型项目
- ✅ **新增 Express**：构建 RESTful API
- ✅ **新增 TypeORM**：数据库 ORM 和迁移
- ✅ **新增 React**：Web UI（Landing + 控制台）
- ✅ **新增 OAuth 2.0**：飞书扫码授权
- ✅ **新增 JWT**：用户会话管理

### 3.3 功能 GAP

#### 3.3.1 核心功能对比

| 功能模块 | 现状（本地部署） | 目标（云端 SaaS） | 新增/改造 |
|---------|----------------|-----------------|----------|
| **用户管理** | ❌ 无（企业内部） | ✅ 多用户注册和登录 | 🆕 新增 |
| **OAuth 认证** | ❌ 无 | ✅ 飞书 OAuth 2.0 | 🆕 新增 |
| **实例认领** | ❌ 无（固定分配） | ✅ 扫码认领实例 | 🆕 新增 |
| **容器编排** | ⚠️ Docker Compose（静态） | ✅ Docker API（动态） | 🔧 改造 |
| **API Key 管理** | ❌ 用户自行配置 | ✅ 平台统一池管理 | 🆕 新增 |
| **飞书集成** | ⚠️ 基础机器人 | ✅ 深度集成 + 消息路由 | 🔧 增强 |
| **计费系统** | ❌ 无 | ✅ 订阅和支付 | 🆕 新增 |
| **监控告警** | ⚠️ 基础监控 | ✅ 完整可观测性 | 🔧 增强 |
| **知识库** | ⚠️ 通用知识库 | ✅ 混合知识库（通用+个人） | 🔧 增强 |
| **数据导出** | ❌ 无 | ✅ 支持导出和迁移 | 🆕 新增 |

**图例**：
- 🆕 新增：从零构建
- 🔧 改造：现有功能增强
- ⚠️ 部分实现：需要完善

#### 3.3.2 用户体验 GAP

**现状（本地部署）**：
```
用户（IT管理员）                用户（最终用户）
    │                              │
    ├─ 采购4台服务器               └─ 联系IT开通权限
    ├─ 安装Docker和依赖
    ├─ 配置网络和VPN
    ├─ 部署OpenClaw
    ├─ 配置飞书应用
    ├─ 申请LLM API Key
    ├─ 配置环境变量
    ├─ 启动服务
    └─ 分配给最终用户 (2-4周)
```

**目标（云端 SaaS）**：
```
用户
    │
    ├─ 访问服务主页
    ├─ 扫描二维码
    ├─ 飞书授权
    └─ 开始对话 (<30秒)
```

**GAP 总结**：
- 部署时间：**2-4周 → <30秒**（99.9% 改善）
- 技术门槛：**需要Docker/运维知识 → 零门槛**
- 启动成本：**¥168,600/年 → ¥0（7天试用）**

### 3.4 数据模型 GAP

#### 3.4.1 现有数据模型

**本地部署**（简单）：
```sql
-- OpenClaw 默认使用 SQLite
-- 数据结构相对简单，主要是对话历史和记忆
conversations (id, user_id, messages, created_at)
memories (id, key, value, embedding)
```

#### 3.4.2 目标数据模型

**云端 SaaS**（复杂）：
```sql
-- 用户和认证
users (id, feishu_user_id, name, email, subscription_plan, ...)
oauth_sessions (id, user_id, access_token, refresh_token, ...)

-- 实例管理
instances (id, instance_id, owner_id, status, docker_container_id, ...)
claim_records (id, instance_id, user_id, claimed_at, released_at, ...)

-- API Key 管理
api_keys (id, key_hash, provider, daily_quota, used_today, ...)
instance_api_usage (id, instance_id, api_key_id, request_count, cost, ...)

-- 知识库
documents (id, instance_id, name, type, size, oss_key, ...)
document_chunks (id, document_id, instance_id, content, embedding)

-- 使用统计
usage_metrics (id, instance_id, message_count, total_tokens, api_cost, ...)

-- 配置和运营
trial_config (id, config_key, config_value, description, ...)
subscription_invoices (id, user_id, plan, amount, status, ...)
```

**GAP 总结**：需要从简单数据模型扩展到**完整的 SaaS 数据模型**，涵盖用户、实例、计费、监控等多个领域。

---

## 4. 技术方案设计

### 4.1 总体架构

#### 4.1.1 MVP 阶段架构（10-50实例）

```
┌─────────────────────────────────────────────────────────────┐
│                          互联网                              │
└───────────────────────┬─────────────────────────────────────┘
                        │
                ┌───────▼────────┐
                │  阿里云 SLB    │（可选，MVP可省略）
                │   公网IP       │
                └───────┬────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
┌───────▼────────┐ ┌────▼────┐ ┌────────▼────────┐
│  Web ECS       │ │Docker ECS│ │  飞书服务器      │
│  2核4G         │ │ 4核8G    │ │                 │
│  80/443        │ │          │ │                 │
│  ├─ Nginx      │ │          │ │                 │
│  └─ Node.js    │ │          │ │                 │
│    (Express)   │ │          │ │                 │
└───────┬────────┘ └────┬────┘ └────────────────┘
        │               │
        │    ┌──────────┴────────┐
        │    │  Docker 网络       │
        │    │  172.18.0.0/16    │
        │    └──────────┬────────┘
        │               │
        │    ┌──────────▼──────────────────────┐
        │    │  OpenClaw 实例（动态创建）        │
        │    │  ├─ Instance #1 (0.5核+1GB)     │
        │    │  ├─ Instance #2 (0.5核+1GB)     │
        │    │  ├─ ...                           │
        │    │  └─ Instance #10 (0.5核+1GB)    │
        │    └──────────────────────────────────┘
        │
        └────────┐
                 │
        ┌────────▼────────┐
        │  RDS PostgreSQL │
        │   2核4G          │
        │  • 用户数据      │
        │  • 实例配置      │
        │  • API Key 池    │
        │  • 对话历史      │
        │  • 知识库向量    │
        └─────────────────┘

        ┌─────────────────┐
        │  Redis          │
        │  1G             │
        │  • 会话缓存      │
        │  • API 缓存      │
        └─────────────────┘
```

**关键特性**：
- ✅ 单台 Docker 宿主机，支持 8-10 个实例
- ✅ 资源限制：每个实例 0.5 核 + 1GB
- ✅ 网络隔离：每个实例独立网络
- ✅ 数据持久化：独立数据卷
- ✅ 高可用：Nginx 反向代理

#### 4.1.2 架构分层

```
┌─────────────────────────────────────────────────────────────┐
│                         接入层                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Web 前端     │  │ OAuth 服务   │  │  飞书 Webhook │      │
│  │  (React)     │  │ (飞书 OAuth) │  │  (消息接收)   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                         应用层                               │
│  ┌──────────────────────────────────────────────────┐      │
│  │         API 网关 (Express + TypeScript)           │      │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐ │      │
│  │  │ 用户管理   │  │ 实例管理   │  │ 计费管理   │ │      │
│  │  └────────────┘  └────────────┘  └────────────┘ │      │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐ │      │
│  │  │ OAuth服务  │  │ Docker编排 │  │ 监控服务   │ │      │
│  │  └────────────┘  └────────────┘  └────────────┘ │      │
│  └──────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                        服务层                                │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐           │
│  │ PostgreSQL │  │  Redis     │  │  Docker    │           │
│  │  (数据)     │  │  (缓存)     │  │  (容器)    │           │
│  └────────────┘  └────────────┘  └────────────┘           │
│  ┌────────────┐  ┌────────────┐                           │
│  │ 飞书 API   │  │  OSS       │                           │
│  │  (外部)     │  │  (存储)     │                           │
│  └────────────┘  └────────────┘                           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                        数据层                                │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐           │
│  │ 用户数据   │  │ 实例数据   │  │ 监控数据   │           │
│  └────────────┘  └────────────┘  └────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 核心流程设计

#### 4.2.1 扫码即用流程（核心流程）

```
┌────────┐     ┌────────┐     ┌────────┐     ┌────────┐     ┌────────┐
│  用户   │────→│ Web页面 │────→│ OAuth  │────→│ 实例编排│────→│飞书对话│
└────────┘     └────────┘     └────────┘     └────────┘     └────────┘
   │              │              │              │              │
   │  1. 访问     │  3. 重定向   │  6. 回调     │  9. 创建     │ 12. 绑定
   │     服务主页  │     到飞书    │    + code   │   Docker     │   机器人
   │              │              │              │              │
   │  2. 显示     │  4. 用户     │  7. 换token  │ 10. 分配     │ 13. 开始
   │     二维码    │     授权      │              │   API Key    │    对话
   │              │  5. 同意授权  │  8. 获取用户  │ 11. 启动     │
   │              │              │     信息      │   容器       │
```

**详细步骤**：

```typescript
// 完整流程伪代码
async function scanToEnableFlow(userQRCodeScan: string) {
  // Step 1-2: 用户访问主页，显示二维码
  const qrCode = await generateOAuthQRCode();

  // Step 3-5: 飞书 OAuth 授权
  const authCode = await feishuOAuth.getAuthCode();

  // Step 6-8: OAuth 回调，获取用户信息
  const accessToken = await feishuOAuth.exchangeToken(authCode);
  const userInfo = await feishuOAuth.getUserInfo(accessToken);

  // Step 9: 检查认领资格
  const eligible = await checkClaimEligibility(userInfo.user_id);
  if (!eligible) throw new Error('已认领过实例');

  // Step 10: 创建实例记录
  const instance = await createInstanceRecord(userInfo);

  // Step 11: 启动 Docker 容器
  const containerId = await dockerService.createContainer(instance.id);

  // Step 12: 分配 API Key
  const apiKey = await apiKeyPoolService.assignKey(instance.id);

  // Step 13: 绑定飞书机器人
  await feishuService.bindBot(instance.id, userInfo.user_id);

  // Step 14: 更新实例状态
  await instance.update({ status: 'active', container_id: containerId });

  // Step 15: 发送成功通知
  await sendSuccessNotification(userInfo);

  return instance;
}
```

#### 4.2.2 消息路由流程

```
┌────────┐     ┌────────┐     ┌────────┐     ┌────────┐     ┌────────┐
│  用户   │────→│  飞书   │────→│Webhook │────→│ 路由器 │────→│OpenClaw│
└────────┘     └────────┘     └────────┘     └────────┘     └────────┘
   │              │              │              │              │
   │  1. 发送     │  2. Webhook  │  3. 解析     │  4. 查找     │  5. 调用
   │     消息     │     事件      │    消息      │   用户实例   │   实例API
   │              │              │              │              │
   │                            │  7. 返回     │  6. 处理     │
   │                            │    回复      │    请求      │
   │  8. 接收     │←─────────────│              │              │
   │     回复     │  飞书发送API │              │              │
```

**路由表设计**：

```typescript
// 消息路由器
class MessageRouter {
  private routingTable: Map<string, string> = new Map();

  /**
   * 路由消息到对应实例
   */
  async routeMessage(feishuUserId: string, message: string): Promise<string> {
    // 1. 查找用户对应的实例
    const instanceId = await this.findInstanceByFeishuUser(feishuUserId);
    if (!instanceId) {
      return '您还未认领OpenClaw实例，请访问：https://openclaw.service.com';
    }

    // 2. 调用实例 API
    const response = await this.callOpenClawInstance(instanceId, message);

    return response;
  }

  /**
   * 查找用户对应的实例
   */
  private async findInstanceByFeishuUser(feishuUserId: string): Promise<string | null> {
    // 从缓存查找
    const cached = await redis.get(`instance:user:${feishuUserId}`);
    if (cached) return cached;

    // 从数据库查找
    const instance = await db.instances.findOne({
      where: {
        owner: { feishu_user_id: feishuUserId },
        status: 'active'
      }
    });

    if (instance) {
      // 缓存路由关系（1小时）
      await redis.setex(`instance:user:${feishuUserId}`, 3600, instance.instance_id);
      return instance.instance_id;
    }

    return null;
  }
}
```

### 4.3 安全设计

#### 4.3.1 多租户隔离

**三层隔离策略**：

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: 应用层隔离（Row-Level Security）                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   用户A数据   │  │   用户B数据   │  │   用户C数据   │     │
│  │  owner_id=A  │  │  owner_id=B  │  │  owner_id=C  │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  Layer 2: 容器层隔离（Docker Isolation）                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Instance A   │  │ Instance B   │  │ Instance C   │     │
│  │ 0.5核+1GB    │  │ 0.5核+1GB    │  │ 0.5核+1GB    │     │
│  │ 独立网络     │  │ 独立网络     │  │ 独立网络     │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: 数据层隔离（PostgreSQL RLS）                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Schema A    │  │  Schema B    │  │  Schema C    │     │
│  │ (可选)       │  │ (可选)       │  │ (可选)       │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

**实现**：

```typescript
// 应用层隔离（中间件）
export function tenantIsolationMiddleware(req: Request, res: Response, next: NextFunction) {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // 注入租户 ID 到请求上下文
  req.tenantId = userId;

  // 所有数据库查询自动添加 tenant_id 过滤
  const originalQuery = db.query;
  db.query = (...args) => {
    // 自动添加 WHERE owner_id = req.tenantId
    return originalQuery(...args).where('owner_id', req.tenantId);
  };

  next();
}

// 数据库层隔离（RLS）
-- 启用行级安全
ALTER TABLE instances ENABLE ROW LEVEL SECURITY;

-- 用户只能访问自己的实例
CREATE POLICY user_instances_policy ON instances
  FOR ALL
  TO authenticated_user
  USING (owner_id = current_user_id());
```

#### 4.3.2 API Key 安全

**加密存储**：

```typescript
// API Key 加密服务
class ApiKeySecurityService {
  private encryptionKey: Buffer;

  constructor() {
    // 从环境变量获取主密钥
    this.encryptionKey = Buffer.from(process.env.MASTER_ENCRYPTION_KEY, 'hex');
  }

  /**
   * 加密 API Key
   */
  encryptApiKey(apiKey: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    let encrypted = cipher.update(apiKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // 返回：iv + authTag + encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * 解密 API Key
   */
  decryptApiKey(encryptedApiKey: string): string {
    const [ivHex, authTagHex, encrypted] = encryptedApiKey.split(':');

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
```

**访问审计**：

```sql
-- API Key 访问审计日志
CREATE TABLE api_key_audit_log (
  id SERIAL PRIMARY KEY,
  api_key_id INT NOT NULL,
  instance_id VARCHAR(64),
  action VARCHAR(50),              -- rotate/suspend/activate/use
  actor VARCHAR(100),             -- 操作人/系统
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_api_key (api_key_id),
  INDEX idx_created (created_at)
);
```

---

## 5. 核心模块设计

### 5.1 模块架构图

```
src/
├── index.ts                      # 应用入口
├── app.ts                        # Express 应用配置
│
├── config/                       # 配置模块
│   ├── index.ts
│   ├── database.ts               # 数据库配置
│   ├── redis.ts                  # Redis 配置
│   ├── docker.ts                 # Docker 配置
│   └── feishu.ts                 # 飞书配置
│
├── controllers/                  # 控制器层
│   ├── instance.controller.ts    # 实例管理
│   ├── oauth.controller.ts       # OAuth 认证
│   ├── user.controller.ts        # 用户管理
│   └── health.controller.ts      # 健康检查
│
├── services/                     # 服务层
│   ├── instance.service.ts       # 实例业务逻辑
│   ├── oauth.service.ts          # OAuth 业务逻辑
│   ├── docker.service.ts         # Docker 容器管理
│   ├── feishu.service.ts         # 飞书集成
│   ├── apikey.service.ts         # API Key 管理
│   ├── notification.service.ts   # 通知服务
│   └── export.service.ts         # 数据导出
│
├── models/                       # 数据模型（TypeORM）
│   ├── User.ts
│   ├── Instance.ts
│   ├── ApiKey.ts
│   ├── Document.ts
│   └── index.ts
│
├── repositories/                 # 数据访问层
│   ├── base.repository.ts        # 基础 Repository
│   ├── user.repository.ts
│   ├── instance.repository.ts
│   └── apikey.repository.ts
│
├── middleware/                   # 中间件
│   ├── auth.middleware.ts        # 认证中间件
│   ├── tenant.middleware.ts      # 租户隔离
│   ├── error.middleware.ts       # 统一错误处理
│   ├── validation.middleware.ts  # 输入验证
│   └── logger.middleware.ts      # 日志记录
│
├── routes/                       # 路由
│   ├── index.ts
│   ├── instance.routes.ts
│   ├── oauth.routes.ts
│   └── feishu.routes.ts
│
├── utils/                        # 工具函数
│   ├── crypto.ts                 # 加密工具
│   ├── logger.ts                 # 日志工具
│   ├── validator.ts              # 验证工具
│   └── qrcode.ts                 # 二维码生成
│
├── types/                        # TypeScript 类型
│   ├── express.d.ts
│   ├── feishu.d.ts
│   └── index.ts
│
└── tests/                        # 测试
    ├── unit/
    ├── integration/
    └── e2e/
```

### 5.2 核心模块详细设计

#### 5.2.1 OAuth 服务模块

**职责**：
- 飞书 OAuth 2.0 授权流程
- 用户信息获取和同步
- JWT Token 生成和验证
- 会话管理

**核心接口**：

```typescript
interface IOAuthService {
  // 生成授权 URL
  getAuthorizationUrl(state: string): Promise<string>;

  // 处理 OAuth 回调
  handleCallback(authCode: string): Promise<OAuthToken>;

  // 刷新 Token
  refreshToken(refreshToken: string): Promise<OAuthToken>;

  // 验证 Token
  verifyToken(token: string): Promise<FeishuUser>;

  // 生成 JWT Token
  generateJWTToken(user: FeishuUser): Promise<string>;

  // 验证 JWT Token
  verifyJWTToken(token: string): Promise<JWTPayload>;
}
```

**实现示例**：

```typescript
// src/services/oauth.service.ts
import { Service } from 'typedi';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import { UserRepository } from '../repositories/user.repository';

@Service()
export class OAuthService implements IOAuthService {
  constructor(
    private userRepository: UserRepository,
    private config: Config
  ) {}

  /**
   * 生成授权 URL
   */
  async getAuthorizationUrl(state: string): Promise<string> {
    const params = new URLSearchParams({
      app_id: this.config.feishu.appId,
      redirect_uri: this.config.feishu.redirectUri,
      scope: 'contact:user.base:readonly',
      state: state
    });

    return `https://open.feishu.cn/open-apis/authen/v1/authorize?${params}`;
  }

  /**
   * 处理 OAuth 回调
   */
  async handleCallback(authCode: string): Promise<OAuthToken> {
    // 1. 用 code 换取 access_token
    const tokenResponse = await this.exchangeCodeForToken(authCode);

    // 2. 获取用户信息
    const userInfo = await this.getUserInfo(tokenResponse.access_token);

    // 3. 创建或更新用户
    const user = await this.userRepository.findOrCreate({
      feishu_user_id: userInfo.user_id,
      feishu_union_id: userInfo.union_id,
      name: userInfo.name,
      avatar_url: userInfo.avatar_url,
      email: userInfo.email
    });

    // 4. 生成 JWT Token
    const jwtToken = this.generateJWTToken(user);

    return {
      access_token: jwtToken,
      refresh_token: tokenResponse.refresh_token,
      expires_in: 3600 * 24 * 7 // 7天
    };
  }

  /**
   * 用 code 换取 access_token
   */
  private async exchangeCodeForToken(authCode: string): Promise<any> {
    const response = await axios.post(
      'https://open.feishu.cn/open-apis/authen/v1/oidc/access_token',
      {
        app_id: this.config.feishu.appId,
        app_secret: this.config.feishu.appSecret,
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
  private async getUserInfo(accessToken: string): Promise<any> {
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
   * 生成 JWT Token
   */
  generateJWTToken(user: User): string {
    return jwt.sign(
      {
        user_id: user.id,
        feishu_user_id: user.feishu_user_id
      },
      this.config.jwt.secret,
      {
        expiresIn: '7d'
      }
    );
  }

  /**
   * 验证 JWT Token
   */
  verifyJWTToken(token: string): JWTPayload {
    try {
      return jwt.verify(token, this.config.jwt.secret) as JWTPayload;
    } catch (error) {
      throw new Error('Invalid token');
    }
  }
}
```

#### 5.2.2 Docker 编排服务模块

**职责**：
- OpenClaw 实例容器生命周期管理
- 容器资源限制和隔离
- 容器健康检查和自动恢复
- 容器日志收集

**核心接口**：

```typescript
interface IDockerService {
  // 创建实例容器
  createInstanceContainer(instanceId: string, config: InstanceConfig): Promise<string>;

  // 停止实例容器
  stopInstanceContainer(instanceId: string): Promise<void>;

  // 删除实例容器
  removeInstanceContainer(instanceId: string): Promise<void>;

  // 获取容器状态
  getContainerStatus(instanceId: string): Promise<ContainerStatus>;

  // 获取容器统计信息
  getContainerStats(instanceId: string): Promise<ContainerStats>;

  // 容器健康检查
  healthCheck(instanceId: string): Promise<HealthStatus>;

  // 重启容器
  restartContainer(instanceId: string): Promise<void>;
}
```

**实现示例**：

```typescript
// src/services/docker.service.ts
import { Service } from 'typedi';
import Docker from 'dockerode';
import { InstanceConfig } from '../types/instance';

@Service()
export class DockerService implements IDockerService {
  private docker: Docker;

  constructor() {
    this.docker = new Docker({
      socketPath: process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock'
    });
  }

  /**
   * 创建实例容器
   */
  async createInstanceContainer(
    instanceId: string,
    config: InstanceConfig
  ): Promise<string> {
    const containerName = `opclaw-${instanceId}`;

    try {
      // 1. 拉取镜像
      await this.pullImage('openclaw:latest');

      // 2. 创建独立网络
      const networkId = await this.createNetwork(instanceId);

      // 3. 创建数据卷
      const volumeName = `opclaw-data-${instanceId}`;
      await this.docker.createVolume({ Name: volumeName });

      // 4. 创建容器
      const container = await this.docker.createContainer({
        name: containerName,
        Image: 'openclaw:latest',
        Env: [
          `INSTANCE_ID=${instanceId}`,
          `DEEPSEEK_API_KEY=${config.apiKey}`,
          `FEISHU_APP_ID=${config.feishuAppId}`,
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
          Binds: [
            `${volumeName}:/app/data`
          ],

          // 网络隔离
          NetworkMode: networkId,

          // 读写根文件系统（可选）
          ReadonlyRootfs: false
        },

        // 重启策略
        RestartPolicy: {
          Name: 'unless-stopped'
        }
      });

      // 5. 启动容器
      await container.start();

      return container.id;

    } catch (error) {
      throw new Error(`Failed to create container: ${error.message}`);
    }
  }

  /**
   * 停止实例容器
   */
  async stopInstanceContainer(instanceId: string): Promise<void> {
    const containerName = `opclaw-${instanceId}`;
    const container = this.docker.getContainer(containerName);

    await container.stop({ t: 10 }); // 10秒超时
  }

  /**
   * 删除实例容器
   */
  async removeInstanceContainer(instanceId: string): Promise<void> {
    const containerName = `opclaw-${instanceId}`;
    const container = this.docker.getContainer(containerName);

    // 停止容器
    await container.stop({ t: 10 });

    // 删除容器
    await container.remove({ force: true });

    // 删除数据卷（可选，根据保留策略）
    const volumeName = `opclaw-data-${instanceId}`;
    const volume = this.docker.getVolume(volumeName);
    await volume.remove();

    // 删除网络
    const networkName = `opclaw-network-${instanceId}`;
    const network = this.docker.getNetwork(networkName);
    await network.remove();
  }

  /**
   * 获取容器状态
   */
  async getContainerStatus(instanceId: string): Promise<ContainerStatus> {
    const containerName = `opclaw-${instanceId}`;

    try {
      const container = this.docker.getContainer(containerName);
      const info = await container.inspect();

      return {
        id: info.Id,
        name: info.Name,
        state: info.State.Running ? 'running' : 'stopped',
        created: info.Created,
        restartCount: info.RestartCount
      };
    } catch (error) {
      return {
        id: null,
        name: containerName,
        state: 'not_found',
        created: null,
        restartCount: 0
      };
    }
  }

  /**
   * 容器健康检查
   */
  async healthCheck(instanceId: string): Promise<HealthStatus> {
    const containerStatus = await this.getContainerStatus(instanceId);

    if (containerStatus.state === 'not_found') {
      return {
        status: 'unhealthy',
        reason: 'Container not found'
      };
    }

    if (containerStatus.state !== 'running') {
      return {
        status: 'unhealthy',
        reason: 'Container not running'
      };
    }

    try {
      const container = this.docker.getContainer(`opclaw-${instanceId}`);
      const info = await container.inspect();

      // 检查 HTTP 健康端点
      const port = info.NetworkSettings.Ports['3000/tcp'][0].HostPort;
      const response = await axios.get(
        `http://localhost:${port}/health`,
        { timeout: 5000 }
      );

      if (response.status !== 200) {
        return {
          status: 'unhealthy',
          reason: 'Health check failed'
        };
      }

      // 获取资源使用情况
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
   * 创建独立网络
   */
  private async createNetwork(instanceId: string): Promise<string> {
    const networkName = `opclaw-network-${instanceId}`;

    const network = await this.docker.createNetwork({
      Name: networkName,
      Driver: 'bridge',
      Internal: false, // 允许访问外网
      IPAM: {
        Config: [
          {
            Subnet: `172.${Math.floor(Math.random() * 255)}.0.0/16`
          }
        ]
      }
    });

    return network.id;
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

  /**
   * 计算 CPU 使用率
   */
  private calculateCpuUsage(stats: any): number {
    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    const cpuUsage = (cpuDelta / systemDelta) * 100;

    return cpuUsage;
  }
}
```

#### 5.2.3 实例管理服务模块

**职责**：
- 实例生命周期管理
- 实例状态跟踪
- 实例配额管理
- 实例绑定和解绑

**核心接口**：

```typescript
interface IInstanceService {
  // 创建实例
  createInstance(user: User, config: InstanceConfig): Promise<Instance>;

  // 查询实例
  getInstance(instanceId: string): Promise<Instance>;

  // 查询用户实例
  getUserInstance(userId: number): Promise<Instance>;

  // 停止实例
  stopInstance(instanceId: string): Promise<void>;

  // 删除实例
  deleteInstance(instanceId: string): Promise<void>;

  // 释放实例
  releaseInstance(instanceId: string): Promise<void>;

  // 检查认领资格
  checkClaimEligibility(userId: number): Promise<boolean>;
}
```

**实现示例**：

```typescript
// src/services/instance.service.ts
import { Service } from 'typedi';
import { InjectRepository } from 'typeorm-typedi-extensions';
import { InstanceRepository } from '../repositories/instance.repository';
import { UserRepository } from '../repositories/user.repository';
import { DockerService } from './docker.service';
import { ApiKeyService } from './apikey.service';
import { FeishuService } from './feishu.service';

@Service()
export class InstanceService implements IInstanceService {
  constructor(
    @InjectRepository() private instanceRepository: InstanceRepository,
    @InjectRepository() private userRepository: UserRepository,
    private dockerService: DockerService,
    private apiKeyService: ApiKeyService,
    private feishuService: FeishuService
  ) {}

  /**
   * 创建实例（OAuth 回调触发）
   */
  async createInstance(user: User, config: InstanceConfig): Promise<Instance> {
    // 1. 检查认领资格
    const eligible = await this.checkClaimEligibility(user.id);
    if (!eligible) {
      throw new Error('USER_ALREADY_HAS_INSTANCE');
    }

    // 2. 生成实例 ID
    const instanceId = this.generateInstanceId();

    // 3. 分配 API Key
    const apiKey = await this.apiKeyService.assignKey(instanceId);

    // 4. 创建实例记录（pending 状态）
    const instance = await this.instanceRepository.create({
      instance_id: instanceId,
      owner_id: user.id,
      status: 'pending',
      phase: config.phase || 'trial',
      config: {
        apiKey: apiKey,
        skills: config.skills || ['general_chat', 'web_search', 'memory'],
        systemPrompt: config.systemPrompt
      },
      expires_at: this.calculateExpiry(config.phase)
    });

    // 5. 异步启动容器
    this.launchContainerAsync(instanceId, user, apiKey);

    return instance;
  }

  /**
   * 异步启动容器
   */
  private async launchContainerAsync(
    instanceId: string,
    user: User,
    apiKey: string
  ): Promise<void> {
    try {
      // 1. 获取实例配置
      const instance = await this.instanceRepository.findByInstanceId(instanceId);

      // 2. 启动 Docker 容器
      const containerId = await this.dockerService.createInstanceContainer(
        instanceId,
        {
          apiKey: apiKey,
          skills: instance.config.skills,
          feishuAppId: process.env.FEISHU_APP_ID
        }
      );

      // 3. 绑定飞书机器人
      await this.feishuService.bindBot(instanceId, user.feishu_user_id);

      // 4. 更新实例状态
      await this.instanceRepository.update(instanceId, {
        status: 'active',
        docker_container_id: containerId
      });

      // 5. 发送成功通知
      await this.feishuService.sendMessage(user.feishu_user_id, {
        text: '🎉 您的 OpenClaw 实例已创建成功！现在可以开始对话了。'
      });

    } catch (error) {
      // 标记实例为失败状态
      await this.instanceRepository.update(instanceId, {
        status: 'error',
        error_message: error.message
      });

      // 发送错误通知
      await this.feishuService.sendMessage(user.feishu_user_id, {
        text: `❌ 实例创建失败：${error.message}`
      });
    }
  }

  /**
   * 检查认领资格
   */
  async checkClaimEligibility(userId: number): Promise<boolean> {
    // 1. 查找用户已有实例
    const existingInstance = await this.instanceRepository.findActiveByUserId(userId);

    // 2. 检查实例状态
    if (existingInstance) {
      return false; // 用户已有活跃实例
    }

    // 3. 检查系统容量
    const activeCount = await this.instanceRepository.countActiveInstances();
    const maxCapacity = parseInt(process.env.MAX_INSTANCES || '10');

    if (activeCount >= maxCapacity) {
      throw new Error('INSTANCE_POOL_FULL');
    }

    return true;
  }

  /**
   * 查询用户实例
   */
  async getUserInstance(userId: number): Promise<Instance> {
    const instance = await this.instanceRepository.findActiveByUserId(userId);

    if (!instance) {
      throw new Error('INSTANCE_NOT_FOUND');
    }

    return instance;
  }

  /**
   * 停止实例
   */
  async stopInstance(instanceId: string): Promise<void> {
    // 1. 停止 Docker 容器
    await this.dockerService.stopInstanceContainer(instanceId);

    // 2. 更新实例状态
    await this.instanceRepository.update(instanceId, {
      status: 'stopped'
    });
  }

  /**
   * 删除实例
   */
  async deleteInstance(instanceId: string): Promise<void> {
    // 1. 停止并删除容器
    await this.dockerService.removeInstanceContainer(instanceId);

    // 2. 删除实例记录
    await this.instanceRepository.delete(instanceId);
  }

  /**
   * 释放实例
   */
  async releaseInstance(instanceId: string): Promise<void> {
    const instance = await this.instanceRepository.findByInstanceId(instanceId);

    // 1. 记录释放日志
    await this.instanceRepository.createReleaseRecord({
      instance_id: instanceId,
      user_id: instance.owner_id,
      released_at: new Date(),
      reason: 'user_request'
    });

    // 2. 删除实例
    await this.deleteInstance(instanceId);
  }

  /**
   * 生成实例 ID
   */
  private generateInstanceId(): string {
    return `opclaw-${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * 计算过期时间
   */
  private calculateExpiry(phase: string): Date {
    const now = new Date();

    switch (phase) {
      case 'trial':
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7天
      case 'paid':
        return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30天
      default:
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    }
  }
}
```

#### 5.2.4 错误处理服务模块 ⭐ P0必须实施

**职责**：
- 统一的应用错误处理
- 错误分类和错误码管理
- 用户友好的错误消息转换
- 错误日志记录和监控
- 错误恢复和重试机制

**核心接口**：

```typescript
interface IErrorService {
  // 创建应用错误
  createError(code: string, message?: string, details?: any): AppError;

  // 处理错误
  handleError(error: Error, req: Request): ErrorResponse;

  // 获取用户友好的错误消息
  getUserMessage(error: AppError): UserFriendlyMessage;

  // 记录错误
  logError(error: Error, context: RequestContext): void;

  // 发送错误告警
  alertError(error: Error, severity: 'low' | 'medium' | 'high'): Promise<void>;
}
```

**实现示例**：

```typescript
// src/errors/AppError.ts
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    public message: string,
    public details?: any,
    public userMessage?: string,
    public actions?: string[]
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }

  // 静态方法：快速创建常见错误
  static badRequest(message: string, details?: any) {
    return new AppError(400, 'BAD_REQUEST', message, details);
  }

  static unauthorized(message: string = 'Unauthorized') {
    return new AppError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message: string = 'Forbidden') {
    return new AppError(403, 'FORBIDDEN', message);
  }

  static notFound(resource: string = 'Resource') {
    return new AppError(404, 'NOT_FOUND', `${resource} not found`);
  }

  static conflict(message: string, details?: any) {
    return new AppError(409, 'CONFLICT', message, details);
  }

  static internal(message: string = 'Internal server error') {
    return new AppError(500, 'INTERNAL_ERROR', message);
  }
}

// 业务错误类型
export class BusinessError extends AppError {
  constructor(
    code: string,
    message: string,
    userMessage?: string,
    actions?: string[]
  ) {
    super(400, code, message, undefined, userMessage, actions);
    this.name = 'BusinessError';
  }
}

// src/errors/error-codes.ts
export const ErrorCodes = {
  // OAuth 相关 (1000-1099)
  OAUTH_INVALID_CODE: {
    code: 'OAUTH_INVALID_CODE',
    message: 'Invalid authorization code',
    userMessage: '授权码无效或已过期，请重新授权',
    statusCode: 400
  },
  OAUTH_STATE_MISMATCH: {
    code: 'OAUTH_STATE_MISMATCH',
    message: 'OAuth state mismatch',
    userMessage: '授权验证失败，请重新尝试',
    statusCode: 400
  },

  // 实例管理相关 (1100-1199)
  USER_ALREADY_HAS_INSTANCE: {
    code: 'USER_ALREADY_HAS_INSTANCE',
    message: 'User already has an active instance',
    userMessage: '您已认领过实例，每个账号只能认领一个',
    actions: ['查看我的实例', '释放现有实例'],
    statusCode: 409
  },
  INSTANCE_POOL_FULL: {
    code: 'INSTANCE_POOL_FULL',
    message: 'Instance pool is full',
    userMessage: '抱歉，实例池已满，请稍后再试',
    actions: ['加入等待列表', '联系客服'],
    statusCode: 503
  },
  INSTANCE_NOT_FOUND: {
    code: 'INSTANCE_NOT_FOUND',
    message: 'Instance not found',
    userMessage: '实例不存在或已被删除',
    actions: ['创建新实例'],
    statusCode: 404
  },
  INSTANCE_START_FAILED: {
    code: 'INSTANCE_START_FAILED',
    message: 'Failed to start instance',
    userMessage: '实例启动失败，我们的技术团队正在处理',
    actions: ['重试', '联系客服'],
    statusCode: 500
  },

  // API Key 相关 (1200-1299)
  APIKEY_UNAVAILABLE: {
    code: 'APIKEY_UNAVAILABLE',
    message: 'No API key available',
    userMessage: 'API Key暂时不可用，请稍后再试',
    statusCode: 503
  },
  APIKEY_QUOTA_EXCEEDED: {
    code: 'APIKEY_QUOTA_EXCEEDED',
    message: 'API key daily quota exceeded',
    userMessage: '今日API调用次数已达上限，请明天再试',
    statusCode: 429
  },

  // 容器相关 (1300-1399)
  CONTAINER_CREATE_FAILED: {
    code: 'CONTAINER_CREATE_FAILED',
    message: 'Failed to create container',
    userMessage: '容器创建失败，请稍后重试',
    actions: ['重试', '联系客服'],
    statusCode: 500
  },
  CONTAINER_NOT_FOUND: {
    code: 'CONTAINER_NOT_FOUND',
    message: 'Container not found',
    userMessage: '实例容器未找到',
    statusCode: 404
  },
  CONTAINER_UNHEALTHY: {
    code: 'CONTAINER_UNHEALTHY',
    message: 'Container is unhealthy',
    userMessage: '实例状态异常，正在自动恢复',
    statusCode: 503
  },

  // 验证相关 (1400-1499)
  VALIDATION_ERROR: {
    code: 'VALIDATION_ERROR',
    message: 'Validation failed',
    userMessage: '输入数据格式不正确',
    statusCode: 400
  },

  // 数据库相关 (1500-1599)
  DATABASE_ERROR: {
    code: 'DATABASE_ERROR',
    message: 'Database operation failed',
    userMessage: '数据库操作失败，请稍后重试',
    statusCode: 500
  },
  DATABASE_CONNECTION_ERROR: {
    code: 'DATABASE_CONNECTION_ERROR',
    message: 'Database connection failed',
    userMessage: '数据库连接失败，请稍后重试',
    statusCode: 503
  },

  // 外部服务相关 (1600-1699)
  FEISHU_API_ERROR: {
    code: 'FEISHU_API_ERROR',
    message: 'Feishu API call failed',
    userMessage: '飞书服务调用失败，请稍后重试',
    statusCode: 502
  },
  DEEPSEEK_API_ERROR: {
    code: 'DEEPSEEK_API_ERROR',
    message: 'DeepSeek API call failed',
    userMessage: 'AI服务暂时不可用',
    statusCode: 502
  }
};

// src/middleware/error.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError';
import { logger } from '../utils/logger';
import { ErrorService } from '../services/error.service';

interface ErrorResponse {
  code: string;
  message: string;
  user_message?: string;
  actions?: string[];
  request_id: string;
  timestamp: number;
  details?: any;
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const errorService = new ErrorService();

  // 生成请求ID（如果没有的话）
  const requestId = req.id || Math.random().toString(36).substring(7);

  // 记录错误
  errorService.logError(err, {
    requestId,
    method: req.method,
    url: req.url,
    body: req.body,
    query: req.query,
    headers: req.headers,
    user: req.user
  });

  // 处理已知的应用错误
  if (err instanceof AppError) {
    const response: ErrorResponse = {
      code: err.code,
      message: err.message,
      request_id: requestId,
      timestamp: Date.now()
    };

    // 添加用户友好消息（如果有）
    if (err.userMessage) {
      response.user_message = err.userMessage;
    }

    // 添加操作建议（如果有）
    if (err.actions) {
      response.actions = err.actions;
    }

    // 开发环境返回详细信息
    if (process.env.NODE_ENV === 'development') {
      response.details = err.details;
    }

    return res.status(err.statusCode).json(response);
  }

  // 处理未知的错误
  logger.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    requestId
  });

  const response: ErrorResponse = {
    code: 'INTERNAL_ERROR',
    message: 'Internal server error',
    request_id: requestId,
    timestamp: Date.now()
  };

  // 开发环境返回错误栈
  if (process.env.NODE_ENV === 'development') {
    response.message = err.message;
    response.details = {
      stack: err.stack
    };
  }

  return res.status(500).json(response);
}

// 异步错误包装器
export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// src/services/error.service.ts
import { Service } from 'typedi';
import { AppError } from '../errors/AppError';
import { logger } from '../utils/logger';
import { notificationService } from './notification.service';

@Service()
export class ErrorService {
  /**
   * 创建应用错误
   */
  createError(code: string, message?: string, details?: any): AppError {
    const errorCode = ErrorCodes[code];
    if (!errorCode) {
      return new AppError(500, 'UNKNOWN_ERROR', message || 'Unknown error');
    }

    return new AppError(
      errorCode.statusCode,
      errorCode.code,
      message || errorCode.message,
      details,
      errorCode.userMessage,
      errorCode.actions
    );
  }

  /**
   * 处理错误并返回响应对象
   */
  handleError(error: Error, req: Request): ErrorResponse {
    const requestId = req.id || Math.random().toString(36).substring(7);

    if (error instanceof AppError) {
      return {
        code: error.code,
        message: error.message,
        user_message: error.userMessage,
        actions: error.actions,
        request_id: requestId,
        timestamp: Date.now(),
        details: process.env.NODE_ENV === 'development' ? error.details : undefined
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      request_id: requestId,
      timestamp: Date.now()
    };
  }

  /**
   * 获取用户友好的错误消息
   */
  getUserMessage(error: AppError): string {
    return error.userMessage || error.message || '操作失败，请稍后重试';
  }

  /**
   * 记录错误
   */
  logError(error: Error, context: any): void {
    const logData = {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      context
    };

    // 根据错误类型决定日志级别
    if (error instanceof AppError) {
      if (error.statusCode >= 500) {
        logger.error('Application error:', logData);
      } else if (error.statusCode >= 400) {
        logger.warn('Client error:', logData);
      }
    } else {
      logger.error('Unknown error:', logData);
    }
  }

  /**
   * 发送错误告警（仅对严重错误）
   */
  async alertError(error: Error, severity: 'low' | 'medium' | 'high'): Promise<void> {
    // 只对高严重度错误发送告警
    if (severity === 'high') {
      const message = `
        🔴 **严重错误告警**
        **错误类型**: ${error.name}
        **错误消息**: ${error.message}
        **时间**: ${new Date().toISOString()}
        **严重程度**: ${severity}
      `;

      await notificationService.sendAlert({
        message,
        severity,
        channel: 'feishu'
      });
    }
  }

  /**
   * 判断错误是否可重试
   */
  isRetryable(error: Error): boolean {
    if (error instanceof AppError) {
      // 5xx错误和某些特定错误可重试
      return error.statusCode >= 500 ||
        ['APIKEY_UNAVAILABLE', 'CONTAINER_UNHEALTHY', 'FEISHU_API_ERROR'].includes(error.code);
    }
    return false;
  }

  /**
   * 计算重试延迟（指数退避）
   */
  calculateRetryDelay(attempt: number): number {
    return Math.min(1000 * Math.pow(2, attempt), 30000); // 最大30秒
  }
}

// 使用示例
// src/controllers/instance.controller.ts
export class InstanceController {
  async createInstance(req: Request, res: Response, next: NextFunction) {
    try {
      // 业务逻辑
      const instance = await this.instanceService.createInstance(req.user, req.body);

      res.json({
        code: 0,
        message: 'success',
        data: instance
      });
    } catch (error) {
      // 将普通错误转换为AppError
      if (error.message === 'User already has an instance') {
        const appError = new AppError(
          409,
          'USER_ALREADY_HAS_INSTANCE',
          error.message,
          undefined,
          '您已认领过实例，每个账号只能认领一个',
          ['查看我的实例', '释放现有实例']
        );
        return next(appError);
      }
      next(error);
    }
  }
}

// 或者使用asyncHandler简化
export class InstanceController {
  createInstance = asyncHandler(async (req: Request, res: Response) => {
    const instance = await this.instanceService.createInstance(req.user, req.body);
    res.json({
      code: 0,
      message: 'success',
      data: instance
    });
  });
}
```

**错误恢复策略**：

```typescript
// src/utils/retry.ts
export async function retryWithErrorHandling<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts?: number;
    onRetry?: (error: Error, attempt: number) => void;
  } = {}
): Promise<T> {
  const { maxAttempts = 3, onRetry } = options;
  let lastError: Error;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // 检查是否可重试
      if (!errorService.isRetryable(error) || attempt === maxAttempts) {
        throw error;
      }

      // 计算延迟
      const delay = errorService.calculateRetryDelay(attempt);

      // 调用回调
      if (onRetry) {
        onRetry(error, attempt);
      }

      // 等待后重试
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
```

#### 5.2.5 健康检查和自动恢复模块 ⭐ P0必须实施

**职责**：
- 实例健康状态监控
- 自动故障检测
- 容器自动恢复
- 健康状态报告
- 自动重建机制

**核心接口**：

```typescript
interface IHealthCheckService {
  // 检查单个实例健康状态
  checkInstanceHealth(instanceId: string): Promise<HealthStatus>;

  // 检查所有活跃实例
  checkAllInstances(): Promise<Map<string, HealthStatus>>;

  // 启动定期健康检查
  scheduleHealthChecks(): void;

  // 恢复不健康的实例
  recoverUnhealthyInstance(instanceId: string): Promise<void>;

  // 获取健康统计
  getHealthStats(): Promise<HealthStatistics>;
}
```

**实现示例**：

```typescript
// src/services/health-check.service.ts
import { Service } from 'typedi';
import { InstanceRepository } from '../repositories/instance.repository';
import { DockerService } from './docker.service';
import { Logger } from '../utils/logger';
import axios from 'axios';

interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'unknown';
  reason?: string;
  cpu_usage?: number;
  memory_usage?: number;
  uptime?: number;
  last_check: Date;
}

interface HealthStatistics {
  total_instances: number;
  healthy_instances: number;
  unhealthy_instances: number;
  unknown_instances: number;
  average_response_time: number;
}

@Service()
export class HealthCheckService implements IHealthCheckService {
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL = 60000; // 1分钟
  private readonly HEALTH_CHECK_TIMEOUT = 5000; // 5秒超时
  private readonly MAX_RESTART_ATTEMPTS = 3;
  private readonly REBUILD_THRESHOLD = 3; // 重启失败3次后重建

  constructor(
    private instanceRepository: InstanceRepository,
    private dockerService: DockerService,
    private logger: Logger
  ) {}

  /**
   * 启动定期健康检查
   */
  scheduleHealthChecks(): void {
    if (this.healthCheckInterval) {
      this.logger.warn('Health checks already scheduled');
      return;
    }

    this.logger.info('Scheduling health checks...');

    // 立即执行一次
    this.performHealthChecks();

    // 定期执行
    this.healthCheckInterval = setInterval(
      () => this.performHealthChecks(),
      this.CHECK_INTERVAL
    );

    this.logger.info(`Health checks scheduled every ${this.CHECK_INTERVAL / 1000}s`);
  }

  /**
   * 停止健康检查
   */
  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      this.logger.info('Health checks stopped');
    }
  }

  /**
   * 执行健康检查（内部方法）
   */
  private async performHealthChecks(): Promise<void> {
    try {
      this.logger.debug('Performing health checks...');

      const instances = await this.instanceRepository.findActive();

      if (instances.length === 0) {
        this.logger.debug('No active instances to check');
        return;
      }

      this.logger.info(`Checking ${instances.length} active instances...`);

      const healthResults = await Promise.allSettled(
        instances.map(instance => this.checkAndRecoverInstance(instance))
      );

      const successful = healthResults.filter(r => r.status === 'fulfilled').length;
      const failed = healthResults.filter(r => r.status === 'rejected').length;

      this.logger.info(`Health checks completed: ${successful} successful, ${failed} failed`);
    } catch (error) {
      this.logger.error('Health check failed:', error);
    }
  }

  /**
   * 检查并恢复单个实例
   */
  private async checkAndRecoverInstance(instance: Instance): Promise<void> {
    const { instance_id, id } = instance;

    try {
      // 检查健康状态
      const health = await this.checkInstanceHealth(instance_id);

      if (health.status === 'healthy') {
        this.logger.debug(`Instance ${instance_id} is healthy`);

        // 清除重启计数（如果有的话）
        await this.instanceRepository.update(id, {
          restart_attempts: 0
        });

        return;
      }

      // 实例不健康，尝试恢复
      this.logger.warn(`Instance ${instance_id} is unhealthy: ${health.reason}`);

      await this.recoverUnhealthyInstance(instance_id);

    } catch (error) {
      this.logger.error(`Failed to check/recover instance ${instance_id}:`, error);

      // 发送告警
      await this.sendAlert(instance_id, error);
    }
  }

  /**
   * 检查单个实例健康状态
   */
  async checkInstanceHealth(instanceId: string): Promise<HealthStatus> {
    try {
      // 1. 检查容器是否存在和运行
      const containerStatus = await this.dockerService.getContainerStatus(instanceId);

      if (containerStatus.state === 'not_found') {
        return {
          status: 'unhealthy',
          reason: 'Container not found',
          last_check: new Date()
        };
      }

      if (containerStatus.state !== 'running') {
        return {
          status: 'unhealthy',
          reason: `Container state: ${containerStatus.state}`,
          last_check: new Date()
        };
      }

      // 2. 检查HTTP健康端点
      try {
        const containerName = `opclaw-${instanceId}`;
        const container = this.dockerService.docker.getContainer(containerName);
        const info = await container.inspect();

        // 获取映射的端口
        const portBindings = info.NetworkSettings.Ports['3000/tcp'];
        if (!portBindings || portBindings.length === 0) {
          return {
            status: 'unhealthy',
            reason: 'Port 3000 not mapped',
            last_check: new Date()
          };
        }

        const hostPort = portBindings[0].HostPort;

        // 调用健康端点
        const response = await axios.get(
          `http://localhost:${hostPort}/health`,
          { timeout: this.HEALTH_CHECK_TIMEOUT }
        );

        if (response.status !== 200) {
          return {
            status: 'unhealthy',
            reason: `Health check returned status ${response.status}`,
            last_check: new Date()
          };
        }

        // 3. 获取资源使用情况
        const stats = await container.stats({ stream: false });
        const cpuUsage = this.calculateCpuUsage(stats);
        const memoryUsage = stats.memory_stats.usage / (1024 * 1024); // MB

        // 4. 检查资源是否异常
        if (cpuUsage > 95 || memoryUsage > 900) {
          return {
            status: 'unhealthy',
            reason: `Resource usage too high: CPU ${cpuUsage.toFixed(2)}%, Memory ${memoryUsage.toFixed(2)}MB`,
            cpu_usage: cpuUsage,
            memory_usage: memoryUsage,
            last_check: new Date()
          };
        }

        // 所有检查通过
        return {
          status: 'healthy',
          cpu_usage: cpuUsage,
          memory_usage: memoryUsage,
          uptime: Date.now() - new Date(info.State.StartedAt).getTime(),
          last_check: new Date()
        };

      } catch (httpError) {
        return {
          status: 'unhealthy',
          reason: `HTTP health check failed: ${httpError.message}`,
          last_check: new Date()
        };
      }

    } catch (error) {
      return {
        status: 'unknown',
        reason: `Health check error: ${error.message}`,
        last_check: new Date()
      };
    }
  }

  /**
   * 恢复不健康的实例
   */
  async recoverUnhealthyInstance(instanceId: string): Promise<void> {
    this.logger.info(`Attempting to recover instance ${instanceId}...`);

    const instance = await this.instanceRepository.findByInstanceId(instanceId);

    if (!instance) {
      this.logger.error(`Instance ${instanceId} not found in database`);
      return;
    }

    // 获取当前重启次数
    const restartAttempts = instance.restart_attempts || 0;

    try {
      // 如果重启次数超过阈值，重建容器
      if (restartAttempts >= this.REBUILD_THRESHOLD) {
        this.logger.warn(`Instance ${instanceId} restart attempts exceeded, rebuilding...`);
        await this.rebuildInstance(instance);
        return;
      }

      // 尝试重启容器
      this.logger.info(`Restarting instance ${instanceId} (attempt ${restartAttempts + 1}/${this.MAX_RESTART_ATTEMPTS})...`);

      // 更新重启次数
      await this.instanceRepository.update(instance.id, {
        restart_attempts: restartAttempts + 1,
        status: 'recovering'
      });

      // 停止容器
      await this.dockerService.stopInstanceContainer(instanceId);
      await this.sleep(5000);

      // 启动容器
      await this.dockerService.startContainer(instanceId);
      await this.sleep(10000);

      // 再次检查健康状态
      const health = await this.checkInstanceHealth(instanceId);

      if (health.status === 'healthy') {
        this.logger.info(`Instance ${instanceId} recovered successfully`);

        // 清除重启次数
        await this.instanceRepository.update(instance.id, {
          status: 'active',
          restart_attempts: 0
        });

        // 发送恢复通知
        await this.sendRecoveryNotification(instanceId);
      } else {
        throw new Error(`Restart failed, instance still unhealthy: ${health.reason}`);
      }

    } catch (error) {
      this.logger.error(`Failed to recover instance ${instanceId}:`, error);

      // 更新实例状态
      await this.instanceRepository.update(instance.id, {
        status: 'error',
        error_message: `Recovery failed: ${error.message}`
      });

      // 如果是最后一次尝试，发送严重告警
      if (restartAttempts >= this.MAX_RESTART_ATTEMPTS - 1) {
        await this.sendCriticalAlert(instanceId, error);
      }

      throw error;
    }
  }

  /**
   * 重建实例（最后手段）
   */
  private async rebuildInstance(instance: Instance): Promise<void> {
    const { instance_id, id, owner_id } = instance;

    this.logger.info(`Rebuilding instance ${instance_id}...`);

    try {
      // 1. 删除旧容器
      await this.dockerService.removeInstanceContainer(instance_id);

      // 2. 创建新容器
      const containerId = await this.dockerService.createInstanceContainer(
        instance_id,
        {
          apiKey: instance.config.apiKey,
          skills: instance.config.skills,
          feishuAppId: process.env.FEISHU_APP_ID
        }
      );

      // 3. 等待容器启动
      await this.sleep(15000);

      // 4. 检查健康状态
      const health = await this.checkInstanceHealth(instance_id);

      if (health.status === 'healthy') {
        this.logger.info(`Instance ${instance_id} rebuilt successfully`);

        // 更新实例状态
        await this.instanceRepository.update(id, {
          status: 'active',
          docker_container_id: containerId,
          restart_attempts: 0,
          error_message: null
        });

        // 发送通知
        await this.sendRecoveryNotification(instance_id);
      } else {
        throw new Error(`Rebuilt instance still unhealthy: ${health.reason}`);
      }

    } catch (error) {
      this.logger.error(`Failed to rebuild instance ${instance_id}:`, error);

      // 更新实例状态
      await this.instanceRepository.update(id, {
        status: 'error',
        error_message: `Rebuild failed: ${error.message}`,
        restart_attempts: 0
      });

      // 发送严重告警
      await this.sendCriticalAlert(instance_id, error);

      throw error;
    }
  }

  /**
   * 检查所有活跃实例
   */
  async checkAllInstances(): Promise<Map<string, HealthStatus>> {
    const instances = await this.instanceRepository.findActive();
    const healthMap = new Map<string, HealthStatus>();

    for (const instance of instances) {
      const health = await this.checkInstanceHealth(instance.instance_id);
      healthMap.set(instance.instance_id, health);
    }

    return healthMap;
  }

  /**
   * 获取健康统计
   */
  async getHealthStats(): Promise<HealthStatistics> {
    const healthMap = await this.checkAllInstances();

    let healthyCount = 0;
    let unhealthyCount = 0;
    let unknownCount = 0;

    for (const [, health] of healthMap) {
      if (health.status === 'healthy') healthyCount++;
      else if (health.status === 'unhealthy') unhealthyCount++;
      else unknownCount++;
    }

    return {
      total_instances: healthMap.size,
      healthy_instances: healthyCount,
      unhealthy_instances: unhealthyCount,
      unknown_instances: unknownCount,
      average_response_time: 0 // TODO: 计算平均响应时间
    };
  }

  /**
   * 计算 CPU 使用率
   */
  private calculateCpuUsage(stats: any): number {
    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    const cpuUsage = (cpuDelta / systemDelta) * 100 * stats.cpu_stats.online_cpus;
    return cpuUsage;
  }

  /**
   * 睡眠指定毫秒
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 发送告警
   */
  private async sendAlert(instanceId: string, error: Error): Promise<void> {
    // TODO: 实现告警通知（飞书、邮件等）
    this.logger.error(`Alert for instance ${instanceId}:`, error);
  }

  /**
   * 发送严重告警
   */
  private async sendCriticalAlert(instanceId: string, error: Error): Promise<void> {
    // TODO: 实现严重告警通知
    this.logger.error(`CRITICAL alert for instance ${instanceId}:`, error);
  }

  /**
   * 发送恢复通知
   */
  private async sendRecoveryNotification(instanceId: string): Promise<void> {
    // TODO: 实现恢复通知
    this.logger.info(`Instance ${instanceId} recovered successfully`);
  }
}

// 数据库迁移：添加 restart_attempts 字段
// migration/xxxxxxxxxxxxxx-add-restart-attempts.ts
import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class addRestartAttempts implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'instances',
      new TableColumn({
        name: 'restart_attempts',
        type: 'int',
        default: 0
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('instances', 'restart_attempts');
  }
}
```

**健康检查端点**：

```typescript
// src/controllers/health.controller.ts
import { Request, Response } from 'express';
import { HealthCheckService } from '../services/health-check.service';

export class HealthController {
  constructor(private healthCheckService: HealthCheckService) {}

  // 系统健康检查
  async systemHealth(req: Request, res: Response) {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      environment: process.env.NODE_ENV
    };

    res.json(health);
  }

  // 实例健康检查
  async instanceHealth(req: Request, res: Response) {
    const { instance_id } = req.params;

    const health = await this.healthCheckService.checkInstanceHealth(instance_id);

    const statusCode = health.status === 'healthy' ? 200 : 503;

    res.status(statusCode).json(health);
  }

  // 健康统计
  async healthStats(req: Request, res: Response) {
    const stats = await this.healthCheckService.getHealthStats();

    res.json({
      code: 0,
      message: 'success',
      data: stats
    });
  }
}
```

---

## 6. 数据模型设计

### 6.1 ER 图

```
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│    users     │         │  instances   │         │  api_keys    │
├──────────────┤         ├──────────────┤         ├──────────────┤
│ id (PK)      │──1:N────│ id (PK)      │         │ id (PK)      │
│ feishu_user_id│       │ instance_id  │         │ key_hash     │
│ feishu_union_id│       │ owner_id (FK)│         │ provider     │
│ name         │         │ status       │         │ daily_quota  │
│ email        │         │ docker_container_id     │ used_today   │
│ subscription │         │ expires_at   │         │ status       │
│ created_at   │         │ created_at   │         └──────────────┘
└──────────────┘         └──────────────┘              │
                              │                       │
                              │ 1:N                   │
                              ▼                       │
                    ┌──────────────┐                │
                    │ claim_records│                │
                    ├──────────────┤                │
                    │ id (PK)      │                │
                    │ instance_id  │                │
                    │ user_id      │                │
                    │ claimed_at   │                │
                    │ released_at  │                │
                    └──────────────┘                │
                                                    │ N:1
┌──────────────┐         ┌──────────────┐            │
│ usage_metrics│         │ instance_api │            │
├──────────────┤         │ _usage       │            │
│ id (PK)      │         ├──────────────┤            │
│ instance_id  │         │ id (PK)      │◄───────────┘
│ message_count│         │ instance_id  │
│ total_tokens │         │ api_key_id   │
│ api_cost     │         │ request_count│
└──────────────┘         └──────────────┘

┌──────────────┐         ┌──────────────┐
│  documents   │         │document_chunks│
├──────────────┤         ├──────────────┤
│ id (PK)      │──1:N────│ id (PK)      │
│ instance_id  │         │ document_id  │
│ name         │         │ instance_id  │
│ type         │         │ chunk_index  │
│ size         │         │ content      │
│ oss_key      │         │ embedding    │
└──────────────┘         └──────────────┘
```

### 6.2 表结构详细设计

#### 6.2.1 用户表（users）

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

  -- 订阅信息
  subscription_plan VARCHAR(20) DEFAULT 'free',  -- free/personal/team/enterprise
  subscription_expires_at TIMESTAMP,
  auto_renew BOOLEAN DEFAULT false,

  -- 时间戳
  created_at TIMESTAMP DEFAULT NOW(),
  last_login_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW(),

  -- 索引
  INDEX idx_feishu_user (feishu_user_id),
  INDEX idx_subscription (subscription_plan, subscription_expires_at)
);

-- 行级安全策略
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_isolation_policy ON users
  FOR ALL
  TO authenticated_user
  USING (id = current_user_id());
```

#### 6.2.2 实例表（instances）

```sql
CREATE TABLE instances (
  id SERIAL PRIMARY KEY,
  instance_id VARCHAR(64) UNIQUE NOT NULL,

  -- 实例状态
  status VARCHAR(20) NOT NULL,        -- pending/active/stopped/error/released
  phase VARCHAR(20) DEFAULT 'trial',   -- trial/paid

  -- 配置
  template VARCHAR(50),               -- 配置模板
  config JSONB,                       -- 实例配置
  system_prompt TEXT,                 -- 自定义System Prompt

  -- 认领信息
  owner_id INT NOT NULL,              -- 认领用户ID
  claimed_at TIMESTAMP,

  -- Docker信息
  docker_container_id VARCHAR(64),
  docker_container_name VARCHAR(100),
  docker_image VARCHAR(100),

  -- 有效期
  expires_at TIMESTAMP,
  error_message TEXT,

  -- 时间戳
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- 外键
  CONSTRAINT fk_owner FOREIGN KEY (owner_id) REFERENCES users(id),

  -- 索引
  INDEX idx_instance_id (instance_id),
  INDEX idx_owner (owner_id),
  INDEX idx_status (status),
  INDEX idx_expires (expires_at)
);

-- 行级安全策略
ALTER TABLE instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY instance_isolation_policy ON instances
  FOR ALL
  TO authenticated_user
  USING (owner_id = current_user_id());
```

#### 6.2.3 API Key 表（api_keys）

```sql
CREATE TABLE api_keys (
  id SERIAL PRIMARY KEY,
  key_hash VARCHAR(64) UNIQUE NOT NULL,    -- 密钥哈希（不存储明文）
  encrypted_key TEXT NOT NULL,             -- 加密后的密钥
  provider VARCHAR(20) NOT NULL,           -- 提供商（deepseek/openai等）
  daily_quota INT DEFAULT 10000,           -- 日配额
  used_today INT DEFAULT 0,                -- 今日已用
  status VARCHAR(20) DEFAULT 'active',     -- active/suspended/expired

  -- 时间戳
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  last_used_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW(),

  -- 索引
  INDEX idx_status (status),
  INDEX idx_expires (expires_at)
);
```

#### 6.2.4 认领记录表（claim_records）

```sql
CREATE TABLE claim_records (
  id SERIAL PRIMARY KEY,
  instance_id VARCHAR(64) NOT NULL,
  user_id INT NOT NULL,
  claimed_at TIMESTAMP DEFAULT NOW(),
  released_at TIMESTAMP,
  release_reason VARCHAR(20),   -- user_request/expired/admin

  -- 外键
  CONSTRAINT fk_instance FOREIGN KEY (instance_id) REFERENCES instances(instance_id),
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id),

  -- 索引
  INDEX idx_instance (instance_id),
  INDEX idx_user (user_id)
);
```

#### 6.2.5 使用量统计表（usage_metrics）

```sql
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
  metric_hour INT NOT NULL,      -- 0-23
  created_at TIMESTAMP DEFAULT NOW(),

  -- 唯一约束
  UNIQUE (instance_id, metric_date, metric_hour),

  -- 索引
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

#### 6.2.6 文档表（documents）

```sql
CREATE TABLE documents (
  id SERIAL PRIMARY KEY,
  instance_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50),
  size BIGINT,
  oss_key VARCHAR(500),
  chunk_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),

  -- 外键
  CONSTRAINT fk_instance FOREIGN KEY (instance_id) REFERENCES instances(instance_id),

  -- 索引
  INDEX idx_instance (instance_id)
);
```

#### 6.2.7 文档块表（document_chunks）

```sql
-- 需要安装 pgvector 扩展
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE document_chunks (
  id SERIAL PRIMARY KEY,
  document_id INT NOT NULL,
  instance_id VARCHAR(64) NOT NULL,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),              -- PostgreSQL pgvector扩展
  created_at TIMESTAMP DEFAULT NOW(),

  -- 外键
  CONSTRAINT fk_document FOREIGN KEY (document_id) REFERENCES documents(id),

  -- 索引
  INDEX idx_instance_chunk (instance_id, chunk_index),
  INDEX idx_embedding (embedding) USING ivfflat (vector_cosine_ops)
);
```

### 6.3 TypeORM 实体定义

```typescript
// src/models/User.ts
import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
@Index(['feishu_user_id'])
@Index(['subscription_plan', 'subscription_expires_at'])
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 64, unique: true })
  feishu_user_id: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  feishu_union_id: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  feishu_open_id: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string;

  @Column({ type: 'text', nullable: true })
  avatar_url: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string;

  @Column({ type: 'varchar', length: 20, default: 'free' })
  subscription_plan: 'free' | 'personal' | 'team' | 'enterprise';

  @Column({ type: 'timestamp', nullable: true })
  subscription_expires_at: Date;

  @Column({ type: 'boolean', default: false })
  auto_renew: boolean;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  last_login_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;
}

// src/models/Instance.ts
import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from './User';

@Entity('instances')
@Index(['instance_id'])
@Index(['owner_id'])
@Index(['status'])
@Index(['expires_at'])
export class Instance {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 64, unique: true })
  instance_id: string;

  @Column({ type: 'varchar', length: 20 })
  status: 'pending' | 'active' | 'stopped' | 'error' | 'released';

  @Column({ type: 'varchar', length: 20, default: 'trial' })
  phase: 'trial' | 'paid';

  @Column({ type: 'varchar', length: 50, nullable: true })
  template: string;

  @Column({ type: 'jsonb', nullable: true })
  config: {
    apiKey: string;
    skills: string[];
    systemPrompt?: string;
  };

  @Column({ type: 'text', nullable: true })
  system_prompt: string;

  @Column({ type: 'int' })
  owner_id: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @Column({ type: 'timestamp', nullable: true })
  claimed_at: Date;

  @Column({ type: 'varchar', length: 64, nullable: true })
  docker_container_id: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  docker_container_name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  docker_image: string;

  @Column({ type: 'timestamp', nullable: true })
  expires_at: Date;

  @Column({ type: 'text', nullable: true })
  error_message: string;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;
}

// src/models/ApiKey.ts
import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('api_keys')
@Index(['status'])
@Index(['expires_at'])
export class ApiKey {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 64, unique: true })
  key_hash: string;

  @Column({ type: 'text' })
  encrypted_key: string;

  @Column({ type: 'varchar', length: 20 })
  provider: string;

  @Column({ type: 'int', default: 10000 })
  daily_quota: number;

  @Column({ type: 'int', default: 0 })
  used_today: number;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: 'active' | 'suspended' | 'expired';

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  expires_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  last_used_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;
}

// src/models/Document.ts
import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Instance } from './Instance';

@Entity('documents')
@Index(['instance_id'])
export class Document {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 64 })
  instance_id: string;

  @ManyToOne(() => Instance)
  @JoinColumn({ name: 'instance_id' })
  instance: Instance;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  type: string;

  @Column({ type: 'bigint' })
  size: number;

  @Column({ type: 'varchar', length: 500 })
  oss_key: string;

  @Column({ type: 'int', default: 0 })
  chunk_count: number;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;
}

// src/models/DocumentChunk.ts
import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Document } from './Document';

@Entity('document_chunks')
@Index(['instance_id', 'chunk_index'])
export class DocumentChunk {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  document_id: number;

  @ManyToOne(() => Document)
  @JoinColumn({ name: 'document_id' })
  document: Document;

  @Column({ type: 'varchar', length: 64 })
  instance_id: string;

  @Column({ type: 'int' })
  chunk_index: number;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'vector', length: 1536 })
  embedding: number[];

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;
}
```

---

## 7. API 设计

### 7.1 RESTful API 规范

**Base URL**: `https://api.openclaw.service.com/v1`

**通用响应格式**：

```typescript
// 成功响应
interface SuccessResponse<T> {
  code: 0;
  message: 'success';
  data: T;
  request_id: string;
  timestamp: number;
}

// 错误响应
interface ErrorResponse {
  code: number;
  message: string;
  error?: string;
  request_id: string;
  timestamp: number;
}
```

### 7.2 核心 API 端点

#### 7.2.1 OAuth 认证 API

```yaml
# 1. 获取授权 URL
GET /oauth/authorize

Query Parameters:
  - redirect_uri: string (可选) - 回调地址
  - state: string (可选) - CSRF令牌

Response:
{
  "code": 0,
  "message": "success",
  "data": {
    "auth_url": "https://open.feishu.cn/open-apis/authen/v1/authorize?...",
    "state": "encrypted_state",
    "expires_at": "2026-03-12T15:00:00Z"
  }
}

# 2. OAuth 回调
POST /oauth/callback

Body:
{
  "code": "auth_code_from_feishu",
  "state": "encrypted_state"
}

Response:
{
  "code": 0,
  "message": "success",
  "data": {
    "access_token": "jwt_token",
    "refresh_token": "refresh_token",
    "expires_in": 604800,
    "user": {
      "id": 123,
      "name": "张三",
      "feishu_user_id": "ou_xxx"
    }
  }
}

# 3. 刷新 Token
POST /oauth/refresh

Headers:
  Authorization: Bearer {refresh_token}

Response:
{
  "code": 0,
  "message": "success",
  "data": {
    "access_token": "new_jwt_token",
    "expires_in": 604800
  }
}
```

#### 7.2.2 实例管理 API

```yaml
# 1. 创建实例（OAuth 回调后自动调用，也可手动创建）
POST /instances

Headers:
  Authorization: Bearer {access_token}

Body:
{
  "template": "personal",
  "phase": "trial",
  "config": {
    "skills": ["general_chat", "web_search", "memory"],
    "systemPrompt": "你是一个AI助手..."
  }
}

Response:
{
  "code": 0,
  "message": "success",
  "data": {
    "instance_id": "opclaw-abc123",
    "status": "pending",
    "expires_at": "2026-03-19T15:00:00Z"
  }
}

# 2. 查询实例详情
GET /instances/{instance_id}

Headers:
  Authorization: Bearer {access_token}

Response:
{
  "code": 0,
  "message": "success",
  "data": {
    "instance_id": "opclaw-abc123",
    "status": "active",
    "phase": "trial",
    "config": {
      "skills": ["general_chat", "web_search", "memory"]
    },
    "created_at": "2026-03-12T15:00:00Z",
    "expires_at": "2026-03-19T15:00:00Z",
    "container": {
      "id": "container_id",
      "name": "opclaw-opclaw-abc123",
      "status": "running"
    }
  }
}

# 3. 查询用户实例
GET /instances/me

Headers:
  Authorization: Bearer {access_token}

Response:
{
  "code": 0,
  "message": "success",
  "data": {
    "instance_id": "opclaw-abc123",
    "status": "active",
    ...
  }
}

# 4. 停止实例
POST /instances/{instance_id}/stop

Headers:
  Authorization: Bearer {access_token}

Response:
{
  "code": 0,
  "message": "Instance stopped successfully"
}

# 5. 启动实例
POST /instances/{instance_id}/start

Headers:
  Authorization: Bearer {access_token}

Response:
{
  "code": 0,
  "message": "Instance started successfully"
}

# 6. 删除实例
DELETE /instances/{instance_id}

Headers:
  Authorization: Bearer {access_token}

Response:
{
  "code": 0,
  "message": "Instance deleted successfully"
}

# 7. 释放实例
POST /instances/{instance_id}/release

Headers:
  Authorization: Bearer {access_token}

Response:
{
  "code": 0,
  "message": "Instance released successfully",
  "data": {
    "export_url": "https://openclaw.service.com/exports/...",
    "expires_at": "2026-03-19T15:00:00Z"
  }
}
```

#### 7.2.3 用户管理 API

```yaml
# 1. 获取当前用户信息
GET /users/me

Headers:
  Authorization: Bearer {access_token}

Response:
{
  "code": 0,
  "message": "success",
  "data": {
    "id": 123,
    "name": "张三",
    "email": "zhangsan@example.com",
    "feishu_user_id": "ou_xxx",
    "subscription_plan": "personal",
    "subscription_expires_at": "2026-04-12T15:00:00Z",
    "created_at": "2026-03-12T15:00:00Z"
  }
}

# 2. 更新用户信息
PUT /users/me

Headers:
  Authorization: Bearer {access_token}

Body:
{
  "name": "张三",
  "email": "newemail@example.com"
}

Response:
{
  "code": 0,
  "message": "User updated successfully"
}

# 3. 导出用户数据
POST /users/me/export

Headers:
  Authorization: Bearer {access_token}

Response:
{
  "code": 0,
  "message": "Export started",
  "data": {
    "export_id": "export_abc123",
    "status": "processing",
    "estimated_time": 300
  }
}
```

#### 7.2.4 监控和统计 API

```yaml
# 1. 获取实例统计
GET /instances/{instance_id}/stats

Headers:
  Authorization: Bearer {access_token}

Query Parameters:
  - period: string (day/week/month) - 统计周期

Response:
{
  "code": 0,
  "message": "success",
  "data": {
    "instance_id": "opclaw-abc123",
    "period": "day",
    "metrics": {
      "message_count": 150,
      "total_tokens": 75000,
      "input_tokens": 50000,
      "output_tokens": 25000,
      "api_cost": 112.5
    },
    "timeline": [
      {
        "hour": 0,
        "message_count": 5,
        "total_tokens": 2500
      },
      ...
    ]
  }
}

# 2. 获取实例健康状态
GET /instances/{instance_id}/health

Headers:
  Authorization: Bearer {access_token}

Response:
{
  "code": 0,
  "message": "success",
  "data": {
    "status": "healthy",
    "uptime": 86400,
    "cpu_usage": 15.5,
    "memory_usage": 512,
    "response_time_avg": 150,
    "response_time_p95": 300,
    "error_rate": 0.5
  }
}
```

### 7.3 飞书 Webhook API

```yaml
# 飞书事件接收
POST /feishu/events

Headers:
  X-Lark-Request-Timestamp: number
  X-Lark-Request-Nonce: string
  X-Lark-Signature: string

Body:
{
  "challenge": "challenge_string",
  "type": "url_verification",
  "token": "verify_token"
}

Response (URL验证):
{
  "challenge": "challenge_string"
}

Body (事件接收):
{
  "type": "event",
  "event": {
    "type": "im.message.receive_v1",
    "app_id": "cli_xxx",
    "create_time": "1678123456",
    "tenant_key": "xxx",
    "sender": {
      "sender_id": {
        "user_id": "ou_xxx"
      }
    },
    "message": {
      "message_id": "om_xxx",
      "content": "{\"text\":\"你好\"}",
      "msg_type": "text"
    }
  }
}

Response:
{
  "code": 0,
  "msg": "success"
}
```

### 7.4 API 实现（Express 路由）

```typescript
// src/routes/oauth.routes.ts
import { Router } from 'express';
import { OAuthController } from '../controllers/oauth.controller';

const router = Router();
const controller = new OAuthController();

// 获取授权 URL
router.get('/authorize', controller.getAuthorizationUrl);

// OAuth 回调
router.post('/callback', controller.handleCallback);

// 刷新 Token
router.post('/refresh', controller.refreshToken);

export default router;

// src/routes/instance.routes.ts
import { Router } from 'express';
import { InstanceController } from '../controllers/instance.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();
const controller = new InstanceController();

// 所有路由需要认证
router.use(authMiddleware);

// 创建实例
router.post('/', controller.createInstance);

// 查询用户实例
router.get('/me', controller.getUserInstance);

// 查询实例详情
router.get('/:instance_id', controller.getInstance);

// 停止实例
router.post('/:instance_id/stop', controller.stopInstance);

// 启动实例
router.post('/:instance_id/start', controller.startInstance);

// 删除实例
router.delete('/:instance_id', controller.deleteInstance);

// 释放实例
router.post('/:instance_id/release', controller.releaseInstance);

// 获取实例统计
router.get('/:instance_id/stats', controller.getInstanceStats);

// 获取实例健康状态
router.get('/:instance_id/health', controller.getInstanceHealth);

export default router;

// src/app.ts
import express from 'express';
import { json } from 'body-parser';
import { errorMiddleware } from './middleware/error.middleware';
import { loggerMiddleware } from './middleware/logger.middleware';
import oauthRoutes from './routes/oauth.routes';
import instanceRoutes from './routes/instance.routes';
import feishuRoutes from './routes/feishu.routes';
import userRoutes from './routes/user.routes';
import healthRoutes from './routes/health.routes';

const app = express();

// 中间件
app.use(json());
app.use(loggerMiddleware);

// 路由
app.use('/v1/oauth', oauthRoutes);
app.use('/v1/instances', instanceRoutes);
app.use('/v1/users', userRoutes);
app.use('/v1/feishu', feishuRoutes);
app.use('/v1/health', healthRoutes);

// 错误处理
app.use(errorMiddleware);

export default app;
```

---

## 8. 部署架构

### 8.1 MVP 阶段部署方案

#### 8.1.1 阿里云资源配置

| 资源类型 | 配置 | 数量 | 用途 | 月成本 |
|---------|------|------|------|--------|
| **ECS (Web)** | 2核4G, 40GB SSD | 1台 | Web前端 + API + OAuth | ¥300 |
| **ECS (Docker)** | 4核8G, 100GB SSD | 1台 | 运行OpenClaw实例 | ¥600 |
| **RDS PostgreSQL** | 1核2G, 50GB | 1个 | 主数据库 | ¥200 |
| **Redis** | 1G主从版 | 1个 | 缓存 + 会话 | ¥200 |
| **OSS存储** | 100GB标准存储 | 1个 | 文件、日志备份 | ¥10 |
| **带宽** | 10Mbps按使用付费 | - | 公网出口 | ¥300 |
| **SLB** | 共享型 | 1个 | 流量分发（可选） | ¥100 |
| **合计** | - | - | - | **¥1,710** |

#### 8.1.2 Docker Compose 配置

```yaml
# docker-compose.cloud.yml
version: '3.8'

services:
  # API 服务
  api:
    image: node:22-alpine
    container_name: opclaw-api
    working_dir: /app
    volumes:
      - ./platform:/app
      - /app/node_modules
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DB_HOST=${DB_HOST}
      - DB_PORT=${DB_PORT:-5432}
      - DB_USER=${DB_USER}
      - DB_PASSWORD=${DB_PASSWORD}
      - DB_NAME=${DB_NAME}
      - REDIS_HOST=${REDIS_HOST}
      - REDIS_PORT=${REDIS_PORT:-6379}
      - REDIS_PASSWORD=${REDIS_PASSWORD}
      - JWT_SECRET=${JWT_SECRET}
      - FEISHU_APP_ID=${FEISHU_APP_ID}
      - FEISHU_APP_SECRET=${FEISHU_APP_SECRET}
      - FEISHU_ENCRYPT_KEY=${FEISHU_ENCRYPT_KEY}
      - FEISHU_REDIRECT_URI=${FEISHU_REDIRECT_URI}
      - DEEPSEEK_API_BASE=${DEEPSEEK_API_BASE}
      - MASTER_ENCRYPTION_KEY=${MASTER_ENCRYPTION_KEY}
      - DOCKER_HOST=${DOCKER_HOST:-unix:///var/run/docker.sock}
      - MAX_INSTANCES=${MAX_INSTANCES:-10}
    ports:
      - "3000:3000"
    command: sh -c "npm install && npm run build && npm run start:prod"
    restart: unless-stopped
    networks:
      - opclaw-network
    depends_on:
      - postgres
      - redis

  # Nginx 反向代理
  nginx:
    image: nginx:alpine
    container_name: opclaw-nginx
    volumes:
      - ./deployment/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./deployment/nginx/ssl:/etc/nginx/ssl:ro
      - ./platform/public:/usr/share/nginx/html:ro
    ports:
      - "80:80"
      - "443:443"
    restart: unless-stopped
    networks:
      - opclaw-network
    depends_on:
      - api

  # PostgreSQL 数据库
  postgres:
    image: postgres:15-alpine
    container_name: opclaw-postgres
    environment:
      - POSTGRES_DB=${DB_NAME:-opclaw}
      - POSTGRES_USER=${DB_USER:-opclaw}
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./deployment/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    ports:
      - "5432:5432"
    restart: unless-stopped
    networks:
      - opclaw-network

  # Redis 缓存
  redis:
    image: redis:7-alpine
    container_name: opclaw-redis
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis-data:/data
    ports:
      - "6379:6379"
    restart: unless-stopped
    networks:
      - opclaw-network

  # Prometheus 监控
  prometheus:
    image: prom/prometheus:latest
    container_name: opclaw-prometheus
    volumes:
      - ./deployment/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus-data:/prometheus
    ports:
      - "9090:9090"
    restart: unless-stopped
    networks:
      - opclaw-network

  # Grafana 可视化
  grafana:
    image: grafana/grafana:latest
    container_name: opclaw-grafana
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD}
    volumes:
      - grafana-data:/var/lib/grafana
      - ./deployment/grafana/dashboards:/etc/grafana/provisioning/dashboards:ro
      - ./deployment/grafana/datasources:/etc/grafana/provisioning/datasources:ro
    ports:
      - "3001:3000"
    restart: unless-stopped
    networks:
      - opclaw-network

volumes:
  postgres-data:
  redis-data:
  prometheus-data:
  grafana-data:

networks:
  opclaw-network:
    driver: bridge
```

#### 8.1.3 Nginx 配置

```nginx
# deployment/nginx/nginx.conf
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;

    # Gzip 压缩
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript application/xml+rss;

    # 限流配置
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=feishu:10m rate=50r/s;

    # 上游服务器
    upstream api_backend {
        server api:3000;
    }

    # HTTP 重定向到 HTTPS
    server {
        listen 80;
        server_name openclaw.service.com;
        return 301 https://$server_name$request_uri;
    }

    # HTTPS 服务器
    server {
        listen 443 ssl http2;
        server_name openclaw.service.com;

        # SSL 证书
        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;
        ssl_session_timeout 1d;
        ssl_session_cache shared:SSL:50m;
        ssl_session_tickets off;

        # 现代化 SSL 配置
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
        ssl_prefer_server_ciphers on;

        # 安全头
        add_header Strict-Transport-Security "max-age=31536000" always;
        add_header X-Frame-Options DENY;
        add_header X-Content-Type-Options nosniff;
        add_header X-XSS-Protection "1; mode=block";

        # 静态文件
        location / {
            root /usr/share/nginx/html;
            index index.html;
            try_files $uri $uri/ /index.html;
        }

        # API 路由
        location /v1/ {
            limit_req zone=api burst=20 nodelay;

            proxy_pass http://api_backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # 超时配置
            proxy_connect_timeout 60s;
            proxy_send_timeout 60s;
            proxy_read_timeout 60s;
        }

        # 飞书 Webhook
        location /v1/feishu/events {
            limit_req zone=feishu burst=100 nodelay;

            proxy_pass http://api_backend;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # 健康检查
        location /health {
            proxy_pass http://api_backend/health;
            access_log off;
        }
    }
}
```

### 8.2 部署流程

#### 8.2.1 自动化部署脚本

```bash
#!/bin/bash
# scripts/deploy-cloud.sh

set -e

echo "🚀 开始部署 OpenClaw 云服务..."

# 1. 检查环境变量
if [ ! -f .env ]; then
    echo "❌ 错误：.env 文件不存在"
    echo "请先创建 .env 文件并配置必要的环境变量"
    exit 1
fi

# 2. 加载环境变量
export $(cat .env | xargs)

# 3. 检查必需的环境变量
required_vars=(
    "DB_PASSWORD"
    "REDIS_PASSWORD"
    "JWT_SECRET"
    "FEISHU_APP_ID"
    "FEISHU_APP_SECRET"
    "MASTER_ENCRYPTION_KEY"
)

for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo "❌ 错误：缺少必需的环境变量 $var"
        exit 1
    fi
done

echo "✅ 环境变量检查通过"

# 4. 创建必要的目录
mkdir -p deployment/nginx/ssl
mkdir -p deployment/postgres
mkdir -p deployment/prometheus
mkdir -p deployment/grafana/dashboards
mkdir -p deployment/grafana/datasources

echo "✅ 目录创建完成"

# 5. 生成 SSL 证书（如果不存在）
if [ ! -f deployment/nginx/ssl/cert.pem ]; then
    echo "📜 生成自签名 SSL 证书..."
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout deployment/nginx/ssl/key.pem \
        -out deployment/nginx/ssl/cert.pem \
        -subj "/C=CN/ST=Beijing/L=Beijing/O=OpenClaw/CN=openclaw.service.com"
    echo "✅ SSL 证书生成完成"
else
    echo "✅ SSL 证书已存在"
fi

# 6. 构建前端（如果存在）
if [ -d "platform/web" ]; then
    echo "🔨 构建前端..."
    cd platform/web
    npm install
    npm run build
    cd ../..
    echo "✅ 前端构建完成"
fi

# 7. 构建后端
echo "🔨 构建后端..."
cd platform
npm install
npm run build
cd ..
echo "✅ 后端构建完成"

# 8. 停止旧容器
echo "🛑 停止旧容器..."
docker-compose -f docker-compose.cloud.yml down

# 9. 启动新容器
echo "🚀 启动新容器..."
docker-compose -f docker-compose.cloud.yml up -d

# 10. 等待服务启动
echo "⏳ 等待服务启动..."
sleep 30

# 11. 运行数据库迁移
echo "🗄️ 运行数据库迁移..."
docker-compose -f docker-compose.cloud.yml exec api npm run migration:run

# 12. 健康检查
echo "🏥 健康检查..."
if curl -f http://localhost/health > /dev/null 2>&1; then
    echo "✅ 服务启动成功"
else
    echo "❌ 服务启动失败"
    docker-compose -f docker-compose.cloud.yml logs
    exit 1
fi

# 13. 清理旧镜像
echo "🧹 清理旧镜像..."
docker image prune -f

echo "🎉 部署完成！"
echo "📊 监控面板: http://localhost:3001"
echo "📈 Prometheus: http://localhost:9090"
echo "🌐 Web服务: https://openclaw.service.com"
```

---

## 9. 实施路径

### 9.1 MVP 开发计划（8周）

#### Week 1-2: 基础设施搭建

**目标**：完成开发环境和基础框架

**任务清单**：

- [ ] **项目初始化**
  - [ ] 创建 Git 仓库
  - [ ] 配置 TypeScript + ESLint + Prettier
  - [ ] 配置 Jest 测试框架
  - [ ] 配置 Git Hooks（Husky）

- [ ] **阿里云服务器采购**
  - [ ] 购买 ECS（2核4G + 4核8G）
  - [ ] 购买 RDS PostgreSQL
  - [ ] 购买 Redis
  - [ ] 申请域名
  - [ ] 配置 SSL 证书

- [ ] **Docker 环境搭建**
  - [ ] 安装 Docker 和 Docker Compose
  - [ ] 配置 Docker 网络
  - [ ] 配置卷挂载

- [ ] **数据库初始化**
  - [ ] 安装 PostgreSQL 15
  - [ ] 安装 pgvector 扩展
  - [ ] 创建数据库和用户
  - [ ] 配置主从复制（可选）

- [ ] **Redis 部署**
  - [ ] 部署 Redis 7
  - [ ] 配置密码认证
  - [ ] 配置持久化

- [ ] **Nginx 配置**
  - [ ] 安装 Nginx
  - [ ] 配置反向代理
  - [ ] 配置 SSL
  - [ ] 配置限流

- [ ] **CI/CD 流水线**
  - [ ] 配置 GitHub Actions
  - [ ] 自动化测试
  - [ ] 自动化部署

**验收标准**：
- ✅ 所有服务器可访问
- ✅ 数据库连接正常
- ✅ Redis 连接正常
- ✅ SSL 证书有效
- ✅ Nginx 可转发请求

#### Week 3-4: 核心服务开发

**目标**：完成后端核心 API

**任务清单**：

- [ ] **项目脚手架搭建**
  - [ ] 创建项目结构
  - [ ] 配置 Express
  - [ ] 配置 TypeORM
  - [ ] 配置 Winston 日志

- [ ] **数据库模型定义**
  - [ ] User 实体
  - [ ] Instance 实体
  - [ ] ApiKey 实体
  - [ ] Document 实体
  - [ ] DocumentChunk 实体
  - [ ] 数据库迁移

- [ ] **Repository 层**
  - [ ] BaseRepository
  - [ ] UserRepository
  - [ ] InstanceRepository
  - [ ] ApiKeyRepository

- [ ] **OAuth 服务实现**
  - [ ] 飞书 OAuth 集成
  - [ ] JWT Token 生成和验证
  - [ ] 用户信息同步

- [ ] **实例管理服务**
  - [ ] 实例创建
  - [ ] 实例查询
  - [ ] 实例停止
  - [ ] 实例删除

- [ ] **Docker 容器管理服务**
  - [ ] Dockerode 封装
  - [ ] 容器创建
  - [ ] 容器启动
  - [ ] 容器停止
  - [ ] 容器删除
  - [ ] 健康检查

- [ ] **API Key 管理服务**
  - [ ] 密钥加密存储
  - [ ] 密钥池管理
  - [ ] 密钥分配算法
  - [ ] 配额管理

- [ ] **RESTful API 实现**
  - [ ] OAuth 路由
  - [ ] 实例路由
  - [ ] 用户路由
  - [ ] 监控路由

- [ ] **中间件** ⭐ P0必须实施
  - [ ] 认证中间件
  - [ ] 租户隔离中间件
  - [ ] **统一错误处理中间件** ⭐ P0
    - [ ] AppError 错误类
    - [ ] ErrorCodes 错误码定义
    - [ ] errorHandler 统一处理函数
    - [ ] asyncHandler 异步包装器
    - [ ] ErrorService 错误服务
  - [ ] **输入验证中间件** ⭐ P0
    - [ ] Joi 验证框架集成
    - [ ] 请求体验证Schema
    - [ ] 验证错误处理
  - [ ] 日志中间件
  - [ ] 请求ID生成中间件

- [ ] **错误处理机制** ⭐ P0必须实施
  - [ ] 错误分类系统（业务错误、系统错误、外部错误）
  - [ ] 用户友好的错误消息
  - [ ] 错误日志记录
  - [ ] 错误告警机制
  - [ ] 重试机制（指数退避）
  - [ ] 错误恢复策略

- [ ] **健康检查和自动恢复** ⭐ P0必须实施
  - [ ] HealthCheckService 实现
    - [ ] 实例健康状态检查
    - [ ] 容器状态监控
    - [ ] HTTP健康端点检查
    - [ ] 资源使用监控（CPU、内存）
  - [ ] 自动恢复机制
    - [ ] 容器自动重启
    - [ ] 重启计数跟踪
    - [ ] 自动重建机制（重启失败3次后）
    - [ ] 恢复通知
  - [ ] 健康检查API端点
    - [ ] 系统健康检查
    - [ ] 实例健康检查
    - [ ] 健康统计API
  - [ ] 数据库迁移（restart_attempts字段）

- [ ] **单元测试**
  - [ ] Service 层测试
  - [ ] Repository 层测试
  - [ ] Controller 层测试

**验收标准**：
- ✅ OAuth 流程可正常走通
- ✅ 实例可以创建和启动
- ✅ Docker 容器可正常管理
- ✅ 单元测试覆盖率 >80%
- ✅ **统一错误处理** ⭐ P0
  - [ ] 所有错误都通过errorHandler统一处理
  - [ ] 错误响应格式统一（code、message、user_message、actions、request_id）
  - [ ] 错误日志完整记录（错误类型、堆栈、请求上下文）
  - [ ] 用户收到友好的错误消息
  - [ ] 业务错误包含操作建议（actions）
- ✅ **输入验证** ⭐ P0
  - [ ] 所有API输入都经过Joi验证
  - [ ] 验证失败返回清晰错误提示
  - [ ] 防止SQL注入和XSS攻击
- ✅ **健康检查** ⭐ P0
  - [ ] 系统健康检查端点可访问（/health）
  - [ ] 实例健康检查可正确返回状态
  - [ ] 健康统计API可返回正确数据
  - [ ] 健康检查定期自动执行（每分钟）
- ✅ **自动恢复** ⭐ P0
  - [ ] 不健康容器自动重启
  - [ ] 重启失败3次后自动重建
  - [ ] 恢复成功后清除重启计数
  - [ ] 恢复失败发送告警通知
  - [ ] 实例状态正确更新（active/recovering/error）

#### Week 5-6: 飞书机器人集成

**目标**：完成飞书机器人完整集成

**任务清单**：

- [ ] **飞书开放平台配置**
  - [ ] 创建飞书应用
  - [ ] 配置权限
  - [ ] 配置事件订阅
  - [ ] 配置回调 URL

- [ ] **Webhook 接收端点**
  - [ ] URL 验证
  - [ ] 签名验证
  - [ ] 事件解密
  - [ ] 消息解析

- [ ] **消息处理逻辑**
  - [ ] 私聊消息处理
  - [ ] 群聊消息处理
  - [ ] 消息路由
  - [ ] 实例调用

- [ ] **OpenClaw 实例通信**
  - [ ] HTTP API 封装
  - [ ] WebSocket 连接（可选）
  - [ ] 错误处理
  - [ ] 超时处理

- [ ] **飞书消息发送**
  - [ ] 文本消息
  - [ ] 富文本消息
  - [ ] 卡片消息（可选）
  - [ ] 消息格式化

- [ ] **消息路由系统**
  - [ ] 用户-实例映射
  - [ ] 缓存优化
  - [ ] 路由表管理

- [ ] **错误处理和重试**
  - [ ] 重试机制
  - [ ] 错误日志
  - [ ] 告警通知

- [ ] **集成测试**
  - [ ] 端到端测试
  - [ ] 压力测试

**验收标准**：
- ✅ 飞书扫码可正常授权
- ✅ 私聊消息可正常收发
- ✅ 群聊消息可正常收发
- ✅ 消息响应时间 <3秒

#### Week 7: 知识库功能

**目标**：完成混合知识库功能

**任务清单**：

- [ ] **通用知识库准备**
  - [ ] 数据收集
  - [ ] 文档清洗
  - [ ] 分块处理
  - [ ] 向量化

- [ ] **文档上传功能**
  - [ ] 文件上传 API
  - [ ] OSS 存储
  - [ ] 文件类型验证
  - [ ] 大小限制

- [ ] **文档解析和分块**
  - [ ] PDF 解析
  - [ ] Word 解析
  - [ ] Markdown 解析
  - [ ] 文本分块算法

- [ ] **向量化索引**
  - [ ] Embedding API 集成
  - [ ] pgvector 索引创建
  - [ ] 相似度搜索

- [ ] **知识检索 API**
  - [ ] 查询向量化
  - [ ] 向量相似度搜索
  - [ ] 结果排序

- [ ] **知识库管理界面**
  - [ ] 文档列表
  - [ ] 上传界面
  - [ ] 删除功能
  - [ ] 搜索功能

**验收标准**：
- ✅ 通用知识库可正常检索
- ✅ 用户可上传文档
- ✅ 检索结果相关性 >70%

#### Week 8: 监控与测试

**目标**：完成监控系统和测试

**任务清单**：

- [ ] **监控部署**
  - [ ] Prometheus 部署
  - [ ] Grafana 部署
  - [ ] 监控配置

- [ ] **指标采集**
  - [ ] Node Exporter
  - [ ] cAdvisor
  - [ ] 自定义指标

- [ ] **告警配置**
  - [ ] 告警规则
  - [ ] 通知渠道（飞书）
  - [ ] 告警测试

- [ ] **Dashboard 配置**
  - [ ] 系统指标 Dashboard
  - [ ] 业务指标 Dashboard
  - [ ] 告警 Dashboard

- [ ] **单元测试完善**
  - [ ] 补充测试用例
  - [ ] 提高覆盖率
  - [ ] 测试报告

- [ ] **集成测试编写**
  - [ ] API 测试
  - [ ] OAuth 流程测试
  - [ ] Docker 编排测试

- [ ] **压力测试**
  - [ ] 并发用户测试
  - [ ] 实例创建测试
  - [ ] 消息吞吐量测试

- [ ] **用户验收测试**
  - [ ] 用户手册
  - [ ] 测试场景
  - [ ] 反馈收集

**验收标准**：
- ✅ 监控面板可正常展示
- ✅ 告警可正常触发
- ✅ 单元测试覆盖率 >80%
- ✅ 集成测试通过率 >90%
- ✅ 支持 10 个并发实例

### 9.2 里程碑

| 周次 | 里程碑 | 交付物 |
|------|--------|--------|
| **Week 2** | 基础设施完成 | 可访问的服务器 + 基础框架 |
| **Week 4** | 核心 API 完成 | OAuth + 实例管理 + Docker 编排 |
| **Week 6** | 飞书集成完成 | 扫码即用流程可用 |
| **Week 7** | 知识库完成 | 文档上传和检索功能 |
| **Week 8** | MVP 上线 | 完整的 MVP 系统 |

### 9.3 团队配置

**最小配置**（2-3人）：

| 角色 | 职责 | 技能要求 |
|------|------|---------|
| **全栈工程师 1** | 后端 API + Docker 编排 | TypeScript, Node.js, Docker |
| **全栈工程师 2** | 前端 + 飞书集成 | React, Feishu API |
| **运维工程师** | 基础设施 + 监控 | Linux, Docker, Nginx, Prometheus |

**理想配置**（4-5人）：

| 角色 | 职责 | 技能要求 |
|------|------|---------|
| **后端工程师** | 后端 API | TypeScript, Node.js, Express |
| **前端工程师** | Web UI | React, TypeScript |
| **集成工程师** | 飞书集成 | Feishu API, OAuth |
| **运维工程师** | 基础设施 | Linux, Docker, K8s |
| **测试工程师** | 测试 | Jest, Cypress |

---

## 10. 技术选型论证

### 10.1 为什么选择 TypeScript？

**优势**：

1. **类型安全**
   - 编译时类型检查
   - 减少运行时错误
   - IDE 智能提示

2. **大型项目友好**
   - 更好的代码组织
   - 更容易重构
   - 更好的团队协作

3. **生态完善**
   - @types/* 类型定义
   - 与 JavaScript 100% 兼容
   - 渐进式采用

4. **现代化**
   - ESNext 特性支持
   - 装饰器支持
   - 元编程能力

**对比 JavaScript**：

| 特性 | TypeScript | JavaScript |
|------|-----------|------------|
| 类型检查 | ✅ 编译时 | ❌ 运行时 |
| IDE 支持 | ✅ 优秀 | ⚠️ 一般 |
| 重构能力 | ✅ 强大 | ⚠️ 弱 |
| 学习曲线 | ⚠️ 较陡 | ✅ 平缓 |
| 代码可读性 | ✅ 高 | ⚠️ 依赖注释 |

**结论**：TypeScript 的类型安全和大型项目支持能力使其成为 SaaS 平台的最佳选择。

### 10.2 为什么选择 Express？

**优势**：

1. **轻量级**
   - 核心功能精简
   - 灵活的中间件机制
   - 可定制性强

2. **生态成熟**
   - 大量中间件
   - 社区活跃
   - 问题容易解决

3. **性能优秀**
   - V8 引擎优化
   - 异步非阻塞 I/O
   - 高并发能力

4. **学习成本低**
   - 简单直观的 API
   - 丰富的文档
   - 大量教程

**对比 Koa**：

| 特性 | Express | Koa |
|------|--------|-----|
| 学习曲线 | ⚠️ 中等 | ⚠️ 较陡 |
| 中间件模式 | ❌ 线性（易混乱） | ✅ 洋葱模型 |
| 异步支持 | ⚠️ 回调/Promise | ✅ async/await 原生 |
| 社区规模 | ✅ 大 | ⚠️ 中等 |
| 性能 | ⚠️ 略低 | ✅ 略高 |

**结论**：Express 的成熟生态和低学习成本更适合快速 MVP 开发。

### 10.3 为什么选择 PostgreSQL？

**优势**：

1. **功能强大**
   - 完整的 ACID 支持
   - 复杂查询能力
   - 窗口函数
   - JSONB 支持

2. **扩展性**
   - pgvector 向量检索
   - PostGIS 地理信息
   - 全文搜索
   - 自定义类型

3. **可靠性**
   - 成熟稳定
   - 数据完整性
   - 事务支持

4. **开源免费**
   - 无许可费用
   - 社区支持
   - 自主可控

**对比 MySQL**：

| 特性 | PostgreSQL | MySQL |
|------|-----------|-------|
| ACID 支持 | ✅ 完整 | ⚠️ 部分引擎 |
| JSON 支持 | ✅ JSONB | ⚠️ JSON |
| 全文搜索 | ✅ 内置 | ⚠️ 较弱 |
| 向量检索 | ✅ pgvector | ❌ 需要插件 |
| 复杂查询 | ✅ 强大 | ⚠️ 一般 |
| 主从复制 | ✅ 成熟 | ✅ 成熟 |

**结论**：PostgreSQL 的功能完整性和扩展性（特别是 pgvector）使其成为最佳选择。

### 10.4 为什么选择 Docker API 而非 Kubernetes（MVP）？

**Docker API 优势（MVP 阶段）**：

1. **简单**
   - API 直观
   - 学习曲线平缓
   - 快速上手

2. **轻量**
   - 无额外组件
   - 资源占用少
   - 运维成本低

3. **灵活**
   - 完全控制
   - 无抽象限制
   - 调试方便

**Kubernetes 优势（正式版）**：

1. **可扩展**
   - 自动扩展
   - 高可用
   - 负载均衡

2. **自动化**
   - 自动恢复
   - 自动部署
   - 自动回滚

3. **企业级**
   - 多集群管理
   - RBAC
   - 监控集成

**对比**：

| 特性 | Docker API | Kubernetes |
|------|-----------|------------|
| 复杂度 | ⭐⭐ 低 | ⭐⭐⭐⭐⭐ 高 |
| 扩展性 | ⭐⭐ 手动 | ⭐⭐⭐⭐⭐ 自动 |
| 学习曲线 | ⭐ 平缓 | ⭐⭐⭐⭐ 陡峭 |
| 资源占用 | ⭐ 低 | ⭐⭐⭐ 高 |
| 运维成本 | ⭐⭐ 低 | ⭐⭐⭐⭐ 高 |
| 适用规模 | 10-50 实例 | 100-10000 实例 |

**结论**：
- **MVP 阶段**：使用 Docker API（快速上线）
- **Beta 阶段**：使用 Docker Swarm（简单扩展）
- **正式版**：迁移到 Kubernetes（大规模扩展）

---

## 11. 风险与应对

### 11.1 技术风险

#### 风险1：容器隔离不足

**描述**：Docker 容器间资源隔离不足，可能影响性能和安全。

**影响**：⚠️ 中等

**应对**：

```yaml
mitigation:
  # 资源限制
  resource_limits:
    cpu_quota: 50000
    cpu_period: 100000
    memory_limit: 1GB
    memory_swap: 0
    memory_reservation: 512MB

  # 网络隔离
  network:
    mode: bridge
    isolated: true
    firewall_rules:
      - block: inter_container_communication

  # 文件系统隔离
  filesystem:
    read_only_rootfs: false
    tmpfs:
      - /tmp: noexec,nosuid,size=64m

  # 监控
  monitoring:
    resource_usage: true
    alert_on_limit: true
```

#### 风险2：数据库性能瓶颈

**描述**：单实例数据库可能成为性能瓶颈。

**影响**：⚠️ 中等

**应对**：

```yaml
mitigation:
  # 连接池优化
  connection_pool:
    max: 20
    min: 5
    idle_timeout: 30000

  # 查询优化
  query_optimization:
    index_optimization: true
    slow_query_log: true
    query_cache: true

  # 扩展路径
  scaling_path:
    stage_1: 读写分离
    stage_2: 连接池优化
    stage_3: 数据库分片
    stage_4: 迁移到分布式数据库
```

#### 风险3：API Key 泄露

**描述**：API Key 被恶意获取，导致成本损失。

**影响**：🔴 高

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
    auto_suspend:
      enabled: true
      threshold: 5x正常用量
```

### 11.2 商业风险

#### 风险1：定价竞争

**描述**：竞品降价影响市场份额。

**影响**：⚠️ 中等

**应对**：

- ✅ 差异化竞争（飞书深度集成）
- ✅ 提升服务质量（更快响应、更好支持）
- ✅ 长期合同优惠（年付8折）
- ✅ 功能创新（持续迭代）

#### 风险2：获客成本高

**描述**：CAC（获客成本）过高，无法盈利。

**影响**：🔴 高

**应对**：

- ✅ 内容营销（技术博客、案例）
- ✅ 社区运营（飞书用户群）
- ✅ 免费增值（7天试用）
- ✅ 推荐计划（推荐奖励）

### 11.3 运营风险

#### 风险1：飞书政策变更

**描述**：飞书开放平台政策变更影响服务。

**影响**：⚠️ 中等

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

  # 多平台支持
  multi_platform:
    current: 飞书
    planned: [钉钉, 企业微信, Slack]
```

### 11.4 合规风险

#### 风险1：数据隐私

**描述**：用户数据泄露或滥用。

**影响**：🔴 高

**应对**：

- ✅ 数据加密（传输 + 存储）
- ✅ 行级安全（RLS）
- ✅ 定期安全审计
- ✅ 隐私政策透明
- ✅ 用户数据导出支持

---

## 12. 附录

### 12.1 术语表

| 术语 | 解释 |
|------|------|
| **OpenClaw** | 开源 AI Agent 框架，基于 Node.js v22 |
| **扫码即用** | 用户扫描二维码后自动创建和配置实例 |
| **飞书集成** | 与飞书开放平台深度集成，支持机器人和 OAuth |
| **多租户** | 单一平台服务多个用户，数据隔离 |
| **物理隔离** | 每个租户独立的进程和资源 |
| **Docker** | 容器技术，用于实例隔离 |
| **OAuth 2.0** | 开放授权标准，用于飞书登录 |
| **JWT** | JSON Web Token，用于用户会话管理 |
| **TypeORM** | TypeScript ORM 框架 |
| **pgvector** | PostgreSQL 向量检索扩展 |
| **Dockerode** | Docker 的 Node.js SDK |
| **Express** | Node.js Web 框架 |
| **TypeScript** | JavaScript 的超集，提供类型安全 |

### 12.2 参考资料

**技术文档**：
- TypeScript: https://www.typescriptlang.org/
- Express: https://expressjs.com/
- TypeORM: https://typeorm.io/
- PostgreSQL: https://www.postgresql.org/
- Docker: https://www.docker.com/
- Dockerode: https://github.com/apocas/dockerode
- Redis: https://redis.io/
- Nginx: https://nginx.org/

**飞书开放平台**：
- 文档: https://open.feishu.cn/document
- OAuth: https://open.feishu.cn/document/server-docs/authentication-management/access-token/tenant-access-token
- Webhook: https://open.feishu.cn/document/server-docs/event-subscription-guide

**OpenClaw**：
- GitHub: https://github.com/OpenClaw
- Docker CN-IM: https://github.com/justlovemaki/OpenClaw-Docker-CN-IM

**监控**：
- Prometheus: https://prometheus.io/
- Grafana: https://grafana.com/

### 12.3 环境变量清单

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
JWT_SECRET=your_jwt_secret_min_32_chars
JWT_EXPIRES_IN=7d

# 飞书配置
FEISHU_APP_ID=cli_xxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxx
FEISHU_ENCRYPT_KEY=xxxxxxxxxxxxxxxxxxxxx
FEISHU_REDIRECT_URI=https://openclaw.service.com/v1/oauth/callback

# DeepSeek API配置
DEEPSEEK_API_BASE=https://api.deepseek.com
DEEPSEEK_API_KEYS=sk-xxx,sk-yyy,sk-zzz

# 加密配置
MASTER_ENCRYPTION_KEY=your_master_encryption_key_32_chars

# Docker配置
DOCKER_HOST=unix:///var/run/docker.sock
MAX_INSTANCES=10

# OSS配置
OSS_REGION=oss-cn-hangzhou
OSS_BUCKET=opclaw-service
OSS_ACCESS_KEY_ID=your_access_key
OSS_ACCESS_KEY_SECRET=your_secret

# 监控配置
GRAFANA_PASSWORD=your_grafana_password

# 服务配置
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# 域名配置
DOMAIN=openclaw.service.com
PROTOCOL=https
```

---

## 变更历史

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| v1.0 | 2026-03-12 | Claude Code | 初始版本 |
| v1.1 | 2026-03-13 | Claude Code | ⭐ **P0-4错误处理机制** - 根据技术评审反馈补充：<br>- 新增 5.2.4 错误处理服务模块（AppError、ErrorCodes、ErrorService）<br>- 新增 5.2.5 健康检查和自动恢复模块（HealthCheckService）<br>- 更新中间件架构，增加输入验证中间件<br>- Week 3-4任务清单明确错误处理和健康检查开发任务<br>- Week 3-4验收标准增加5项P0错误处理和健康检查要求 |

---

**文档状态**：✅ **v1.1 - 已根据技术评审反馈补充错误处理机制**
**下一步行动**：
1. ✅ 技术评审（已完成）
2. ✅ 架构评审（已完成）
3. ✅ 补充P0错误处理机制（已完成）
4. 团队组建
5. MVP 开发启动（Week 1-2）

---

*本文档基于需求分析文档（REQ-001-SCAN-TO-ENABLE）和当前项目现状分析生成，提供了扫码即用 OpenClaw 云服务的完整技术实现方案。*
