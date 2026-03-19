# 核心需求文档: 支持多服务实例部署（简化版）

> **需求文档版本**: 2.0
> **创建日期**: 2026-03-19
> **更新日期**: 2026-03-19
> **Issue**: #21 - 支持多服务实例部署
> **优先级**: P0 - 高优先级

> **架构模式**: 多实例单租户 (Multi-Instance Single-Tenant)

---

## 📋 需求概述

### 业务背景

当前 AIOpc 平台采用 **单实例单租户** 架构，仅支持单一企业部署。需要改造为 **多实例单租户** 架构，使每个企业客户拥有独立的平台实例（独立服务器、数据库、域名、飞书应用）。

### 核心设计原则

**架构简化**:
- ✅ 每个租户 = 独立服务器 + 独立数据库 + 独立配置
- ✅ 不需要数据库层面的租户隔离
- ✅ 不需要应用层面的租户路由
- ✅ 配置通过独立配置文件管理

**核心价值**:
- 🚀 快速部署：为不同企业快速部署独立平台实例
- 🔒 完全隔离：每个租户数据、配置、资源完全独立
- 📦 简单管理：每个租户一个配置文件，易于管理
- 🔄 灵活扩展：新增租户只需部署新实例

---

## 🎯 功能需求

### REQ-MULTI-001: 租户配置文件管理

**优先级**: P0
**描述**: 为每个租户创建独立的配置文件，包含该租户的所有配置信息

**Acceptance Criteria**:
- [ ] 每个租户一个独立配置文件 `config/tenants/{tenant_id}.yml`
- [ ] 配置文件包含：服务器信息、SSH密钥、飞书应用配置、数据库配置
- [ ] 支持配置文件模板 `config/tenants/template.yml`
- [ ] 支持配置文件验证（检查必需字段）

**配置文件结构**:
```yaml
# config/tenants/tenant_a.yml
tenant:
  id: tenant_a
  name: "客户A公司"
  environment: production

# 服务器配置
server:
  host: tenant-a.example.com
  ssh_user: root
  ssh_key_path: ~/.ssh/tenant_a_key
  deploy_path: /opt/opclaw

# 飞书应用配置
feishu:
  app_id: cli_aaa111111
  app_secret: L0cHQDBbEiIys6AHW53miecONb1xA4qy
  encrypt_key: suNsfjHj2nwpvIUT/gB4UZSETSaAnOVCnoylIp4Oo6HiVz/b0Yh/hRA1fQGa/a0U
  oauth_redirect_uri: https://tenant-a.example.com/api/oauth/callback

# 数据库配置
database:
  host: localhost
  port: 5432
  name: opclaw
  user: opclaw
  password: ${DB_PASSWORD}  # 从环境变量读取

# Redis配置
redis:
  host: localhost
  port: 6379
  password: ${REDIS_PASSWORD}

# JWT配置
jwt:
  secret: ${JWT_SECRET}
  expires_in: 7d
```

---

### REQ-MULTI-002: 参数化部署脚本

**优先级**: P0
**描述**: 修改部署脚本支持租户配置文件参数

**Acceptance Criteria**:
- [ ] 部署脚本接受租户配置文件作为参数
- [ ] 自动从配置文件读取服务器信息、SSH密钥等
- [ ] 支持部署前验证（服务器连接、配置完整性）
- [ ] 支持部署后验证（健康检查）
- [ ] 错误处理和回滚机制

**部署命令示例**:
```bash
# 部署到指定租户
./scripts/deploy/deploy-tenant.sh \
  --config config/tenants/tenant_a.yml \
  --component all \
  --skip-tests false

# 批量部署多个租户
./scripts/deploy/deploy-all-tenants.sh \
  --tenants tenant_a,tenant_b,tenant_c

# 仅部署后端
./scripts/deploy/deploy-tenant.sh \
  --config config/tenants/tenant_a.yml \
  --component backend
```

---

### REQ-MULTI-003: 多租户部署工作流

**优先级**: P0
**描述**: 创建 GitHub Actions 工作流支持多租户部署

**Acceptance Criteria**:
- [ ] 支持通过 GitHub Actions 触发租户部署
- [ ] 支持手动选择目标租户
- [ ] 支持选择部署组件（all/backend/frontend）
- [ ] 部署日志和状态反馈

**Workflow 输入参数**:
```yaml
name: 租户部署 (Tenant Deployment)

on:
  workflow_dispatch:
    inputs:
      tenant:
        description: '选择租户 (Select Tenant)'
        required: true
        type: choice
        options:
          - tenant_a
          - tenant_b
          - tenant_c
      component:
        description: '部署组件 (Component)'
        required: true
        type: choice
        options:
          - all
          - backend
          - frontend
      skip_tests:
        description: '跳过测试 (Skip Tests)'
        type: boolean
        default: false
```

---

### REQ-MULTI-004: 租户管理脚本

**优先级**: P1
**描述**: 创建租户管理脚本，简化租户部署和管理操作

**Acceptance Criteria**:
- [ ] 支持列出所有租户
- [ ] 支持查看租户配置
- [ ] 支持验证租户配置完整性
- [ ] 支持租户健康检查

**管理命令示例**:
```bash
# 列出所有租户
./scripts/tenant/list.sh

# 查看租户配置
./scripts/tenant/show.sh --tenant tenant_a

# 验证租户配置
./scripts/tenant/validate.sh --tenant tenant_a

# 租户健康检查
./scripts/tenant/health-check.sh --tenant tenant_a

# 批量健康检查
./scripts/tenant/health-check-all.sh
```

---

### REQ-MULTI-005: 租户配置模板

**优先级**: P1
**描述**: 创建租户配置模板，简化新租户配置创建

**Acceptance Criteria**:
- [ ] 提供租户配置模板 `template.yml`
- [ ] 提供配置生成脚本
- [ ] 提供配置验证脚本
- [ ] 文档说明各配置项含义

**快速创建新租户**:
```bash
# 从模板创建新租户配置
./scripts/tenant/create.sh \
  --tenant-id tenant_d \
  --tenant-name "客户D公司" \
  --server tenant-d.example.com \
  --ssh-key ~/.ssh/tenant_d_key

# 交互式创建
./scripts/tenant/create.sh --interactive
```

---

### REQ-MULTI-006: 部署验证与监控

**优先级**: P1
**描述**: 实现租户级别的部署验证和基础监控

**Acceptance Criteria**:
- [ ] 部署后自动验证服务健康
- [ ] 检查关键端点（健康检查、OAuth回调）
- [ ] 生成部署报告
- [ ] 记录部署历史

**验证项**:
```bash
# 部署验证检查清单
- [ ] 服务器连接成功
- [ ] 配置文件加载成功
- [ ] 后端容器运行正常
- [ ] 前端容器运行正常
- [ ] 数据库连接正常
- [ ] Redis 连接正常
- [ ] 健康检查端点响应正常
- [ ] OAuth 回调端点可访问
```

---

## 🏗️ 非功能需求

### NFR-MULTI-001: 性能要求

| 指标 | 要求 | 说明 |
|------|------|------|
| 部署时间 | < 10 分钟 | 从触发到部署完成 |
| 健康检查时间 | < 30 秒 | 部署后验证时间 |
| 配置加载时间 | < 5 秒 | 从文件加载配置 |

### NFR-MULTI-002: 安全要求

| 要求 | 说明 |
|------|------|
| SSH 密钥管理 | 每个租户使用独立的 SSH 密钥 |
| 配置文件权限 | 配置文件权限 600，仅所有者可读 |
| 敏感信息加密 | 敏感配置使用环境变量，不写入配置文件 |
| 审计日志 | 记录所有部署操作（谁、何时、哪个租户） |

### NFR-MULTI-003: 可维护性要求

| 要求 | 说明 |
|------|------|
| 配置即代码 | 租户配置文件纳入版本控制 |
| 文档完善 | 每个脚本包含帮助信息和使用示例 |
| 错误处理 | 友好的错误提示和恢复建议 |
| 日志记录 | 详细的部署日志，便于排查问题 |

---

## 🔄 用例场景

### UC-MULTI-001: 部署新租户

**Actor**: 运维工程师

**前置条件**:
- 租户服务器已准备就绪
- 租户飞书应用已创建
- SSH 密钥已配置

**主要流程**:
1. 创建租户配置文件
   ```bash
   ./scripts/tenant/create.sh --tenant-id tenant_a
   ```
2. 编辑配置文件，填写租户信息
   ```bash
   vi config/tenants/tenant_a.yml
   ```
3. 验证配置文件
   ```bash
   ./scripts/tenant/validate.sh --tenant tenant_a
   ```
4. 执行部署
   ```bash
   ./scripts/deploy/deploy-tenant.sh --config config/tenants/tenant_a.yml
   ```
5. 等待部署完成并检查健康状态
   ```bash
   ./scripts/tenant/health-check.sh --tenant tenant_a
   ```
6. 测试租户平台功能

**后置条件**: 租户平台部署成功，可以独立使用

---

### UC-MULTI-002: 更新租户配置

**Actor**: 运维工程师

**前置条件**:
- 租户已部署
- 需要更新飞书应用配置或其他配置

**主要流程**:
1. 编辑租户配置文件
2. 验证配置文件
3. 执行增量部署（仅更新配置，不重新部署代码）
   ```bash
   ./scripts/deploy/deploy-tenant.sh \
     --config config/tenants/tenant_a.yml \
     --mode config-only
   ```
4. 重启相关服务
5. 验证配置生效

---

### UC-MULTI-003: 批量部署多个租户

**Actor**: 运维工程师

**前置条件**:
- 多个租户配置文件已准备好
- 多个租户服务器已准备就绪

**主要流程**:
1. 验证所有租户配置
   ```bash
   ./scripts/tenant/validate-all.sh
   ```
2. 执行批量部署
   ```bash
   ./scripts/deploy/deploy-all-tenants.sh \
     --tenants tenant_a,tenant_b,tenant_c \
     --parallel 3  # 并发数为3
   ```
3. 监控部署进度
4. 查看部署报告
   ```bash
   ./scripts/tenant/deployment-report.sh
   ```

---

## 📊 系统约束

### 约束-1: 服务器资源
- 每个租户需要独立的服务器资源
- 服务器需满足最低配置要求（CPU、内存、磁盘）

### 约束-2: 飞书应用
- 每个租户需要创建独立的飞书应用
- 需要配置正确的 OAuth 回调 URL

### 约束-3: 域名和SSL
- 每个租户需要独立的域名
- 需要配置 SSL 证书（Let's Encrypt 或自有证书）

### 约束-4: 配置安全
- 租户配置文件包含敏感信息，需要妥善保管
- 建议将配置文件纳入私有仓库，使用密钥管理工具

---

## 🎯 成功标准

### 最小可行产品 (MVP)

- [ ] 支持通过配置文件部署到不同租户服务器
- [ ] 每个租户使用独立的飞书应用配置
- [ ] 部署脚本支持参数化（服务器、SSH密钥、配置）
- [ ] 基础的健康检查和验证

### 完整功能

- [ ] GitHub Actions 集成
- [ ] 租户管理脚本套件
- [ ] 批量部署支持
- [ ] 部署历史和报告
- [ ] 监控和告警集成

---

## 📚 参考文档

- [Issue #21: 支持多服务实例部署](https://github.com/renzhichao/AIOpc/issues/21)
- [GAP Analysis: 多租户部署现状分析](./GAP_Analysis_issue21_multi_tenant_v2.md)
- [现有部署脚本](../../scripts/deploy/README.md)
- [现有部署工作流](../../.github/workflows/deploy-production.yml)

---

## 🎨 架构图

### 多实例单租户架构

```
┌─────────────────────────────────────────────────────────────┐
│                    GitHub (代码仓库)                          │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  AIOpc 代码库                                          │ │
│  │  ├─ platform/ (前端/后端代码)                        │ │
│  │  ├─ config/tenants/ (租户配置)                        │ │
│  │  │  ├─ template.yml (配置模板)                       │ │
│  │  │  ├─ tenant_a.yml (租户A配置)                      │ │
│  │  │  └─ tenant_b.yml (租户B配置)                      │ │
│  │  └─ scripts/deploy/ (部署脚本)                        │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
              ┌─────────────────────────┐
              │  部署脚本 (参数化)        │
              │  deploy-tenant.sh       │
              │  --config tenant_a.yml  │
              └─────────────────────────┘
                            │
            ┌───────────┬───────────────┐
            ▼           ▼               ▼
    ┌─────────┐  ┌─────────┐   ┌─────────┐
    │租户A    │  │租户B    │   │租户C    │
    │服务器   │  │服务器   │   │服务器   │
    └─────────┘  └─────────┘   └─────────┘
        │            │               │
        ▼            ▼               ▼
    ┌─────────────────────────────────────┐
    │  每个租户独立部署                     │
    │  ├─ Docker Compose                 │
    │  ├─ Nginx (租户域名)               │
    │  ├─ Backend (租户飞书配置)        │
    │  ├─ Frontend                       │
    │  ├─ PostgreSQL (独立数据库)       │
    │  └─ Redis (独立缓存)               │
    └─────────────────────────────────────┘
```

---

**文档版本历史**:
- v1.0 (2026-03-19): 初始版本（复杂多租户架构）
- v2.0 (2026-03-19): 简化为多实例单租户架构 ⭐ **当前版本**
