# 核心需求文档: 支持多服务实例部署

> **需求文档版本**: 1.0
> **创建日期**: 2026-03-19
> **Issue**: #21 - 支持多服务实例部署
> **优先级**: P0 - 高优先级

---

## 📋 需求概述

### 业务背景

当前 AIOpc 平台仅支持单一租户部署，无法满足企业客户的私有化部署需求。多个企业客户需要将平台部署到各自的服务器和飞书帐号体系中，实现数据和配置的完全隔离。

### 核心问题

1. **单租户限制**: 平台仅支持单一飞书应用配置，无法服务于多个企业
2. **部署限制**: 部署流程仅针对单台服务器设计，无法灵活部署到不同租户服务器
3. **配置耦合**: 飞书 OAuth 配置硬编码，缺乏多实例配置管理
4. **扩展性不足**: 缺乏横向扩展能力，难以支持多租户并发

---

## 🎯 功能需求

### REQ-MULTI-001: 多租户配置管理

**优先级**: P0
**描述**: 支持为不同租户配置独立的飞书应用凭据

**Acceptance Criteria**:
- [ ] 支持为每个租户配置独立的 `FEISHU_APP_ID` 和 `FEISHU_APP_SECRET`
- [ ] 配置支持动态加载，无需重启服务
- [ ] 配置变更支持热更新
- [ ] 配置文件支持环境变量覆盖

**输入示例**:
```yaml
# 租户配置示例
tenants:
  tenant_a:
    feishu_app_id: cli_aaa111111
    feishu_app_secret: xxx_secret_aaa
    domain: tenant-a.example.com

  tenant_b:
    feishu_app_id: cli_bbb222222
    feishu_app_secret: yyy_secret_bbb
    domain: tenant-b.example.com
```

---

### REQ-MULTI-002: 租户识别与路由

**优先级**: P0
**描述**: 实现基于域名的租户识别和请求路由

**Acceptance Criteria**:
- [ ] 支持通过请求域名识别租户（如 `tenant-a.example.com`）
- [ ] 支持通过子域名模式识别租户（如 `tenant-a.platform.com`）
- [ ] 支持通过 URL 路径识别租户（如 `platform.com/tenant-a/`）
- [ ] 租户识别失败时返回友好错误提示

**路由规则**:
```typescript
// 租户识别优先级
1. 子域名: tenant-a.example.com → tenant_a
2. 自定义域名: custom-domain.com → tenant_x (映射配置)
3. 路径参数: example.com/tenant-a/ → tenant_a
4. 默认租户: example.com → default_tenant
```

---

### REQ-MULTI-003: 多服务器部署支持

**优先级**: P0
**描述**: 修改部署流水线支持部署到指定的租户服务器

**Acceptance Criteria**:
- [ ] 部署脚本支持指定目标服务器
- [ ] 支持为不同租户配置独立的部署配置
- [ ] 支持部署前验证（配置检查、依赖检查）
- [ ] 支持部署后健康检查
- [ ] 支持多服务器并行部署

**部署命令示例**:
```bash
# 部署到特定租户服务器
./scripts/deploy/deploy-tenant.sh \
  --tenant tenant_a \
  --server tenant-a.example.com \
  --ssh-key ~/.ssh/tenant_a_key \
  --config config/tenants/tenant_a.yml

# 批量部署到多个租户
./scripts/deploy/deploy-all-tenants.sh \
  --tenants tenant_a,tenant_b,tenant_c
```

---

### REQ-MULTI-004: 租户数据隔离

**优先级**: P1
**描述**: 实现租户级别的数据隔离，确保不同租户数据完全独立

**Acceptance Criteria**:
- [ ] 不同租户用户数据完全隔离（users 表增加 tenant_id）
- [ ] 不同租户实例数据完全隔离（instances 表增加 tenant_id）
- [ ] 不同租户配置数据完全隔离
- [ ] API 查询自动过滤租户数据
- [ ] 防止跨租户数据访问

**数据模型变更**:
```sql
-- users 表增加租户字段
ALTER TABLE users ADD COLUMN tenant_id VARCHAR(64) NOT NULL DEFAULT 'default';
CREATE INDEX idx_users_tenant ON users(tenant_id);

-- instances 表增加租户字段
ALTER TABLE instances ADD COLUMN tenant_id VARCHAR(64) NOT NULL DEFAULT 'default';
CREATE INDEX idx_instances_tenant ON instances(tenant_id);

-- 租户配置表（新建）
CREATE TABLE tenants (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  feishu_app_id VARCHAR(128) NOT NULL,
  feishu_app_secret VARCHAR(255) NOT NULL,
  domain VARCHAR(255),
  status VARCHAR(32) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

### REQ-MULTI-005: 租户级 OAuth 认证

**优先级**: P0
**描述**: 支持不同租户使用各自的飞书应用进行认证

**Acceptance Criteria**:
- [ ] OAuth 回调 URL 支持动态配置（基于租户域名）
- [ ] JWT Token 包含租户信息（tenant_id, tenant_name）
- [ ] 不同租户的认证流程完全独立
- [ ] 租户 A 的用户无法访问租户 B 的资源

**Token Payload 示例**:
```typescript
{
  sub: "user_123",
  tenant_id: "tenant_a",
  tenant_name: "Tenant A Company",
  name: "张三",
  email: "zhangsan@tenant-a.com",
  roles: ["user"],
  iat: 1642234567,
  exp: 1642238167
}
```

---

### REQ-MULTI-006: 租户级监控与日志

**优先级**: P1
**描述**: 实现租户级别的监控和日志隔离

**Acceptance Criteria**:
- [ ] 日志包含租户标识（tenant_id）
- [ ] 监控指标按租户分组统计
- [ ] 支持按租户查询日志和指标
- [ ] 告警配置支持租户级别设置

**日志格式示例**:
```json
{
  "timestamp": "2026-03-19T10:00:00Z",
  "tenant_id": "tenant_a",
  "user_id": "user_123",
  "action": "instance.create",
  "resource": "inst-001",
  "status": "success"
}
```

---

## 🏗️ 非功能需求

### NFR-MULTI-001: 性能要求

| 指标 | 要求 | 说明 |
|------|------|------|
| 租户识别延迟 | < 10ms | 从请求到识别租户的时间 |
| 配置加载延迟 | < 50ms | 租户配置加载时间 |
| 并发租户数 | ≥ 100 | 系统支持的并发租户数量 |
| 租户数据隔离 | 100% | 确保无跨租户数据泄露 |

### NFR-MULTI-002: 安全要求

| 要求 | 说明 |
|------|------|
| 配置加密 | 租户敏感配置（如 app_secret）必须加密存储 |
| 传输加密 | 租户间通信必须使用 HTTPS |
| 访问控制 | 严格的租户访问控制，防止越权 |
| 审计日志 | 记录所有跨租户访问尝试 |

### NFR-MULTI-003: 兼容性要求

| 要求 | 说明 |
|------|------|
| 向后兼容 | 现有单租户部署模式必须继续支持 |
| 平滑迁移 | 支持现有单租户向多租户模式迁移 |
| 配置兼容 | 旧版配置文件可以自动转换 |

---

## 🔄 用例场景

### UC-MULTI-001: 新租户部署流程

**Actor**: 运维工程师

**前置条件**:
- 目标服务器已准备就绪
- 租户飞书应用已创建

**主要流程**:
1. 创建租户配置文件 `config/tenants/tenant_a.yml`
2. 执行部署脚本 `./deploy-tenant.sh --tenant tenant_a`
3. 验证部署状态（健康检查、配置验证）
4. 配置租户域名 DNS 解析
5. 测试租户 OAuth 认证流程
6. 确认租户数据隔离正常

**后置条件**: 租户可以独立使用平台，与其他租户完全隔离

---

### UC-MULTI-002: 租户用户登录

**Actor**: 租户用户

**前置条件**:
- 用户属于租户 A
- 租户 A 平台已部署

**主要流程**:
1. 用户访问租户 A 平台域名（tenant-a.example.com）
2. 系统识别租户为 tenant_a
3. 用户点击飞书登录
4. 系统使用租户 A 的飞书应用配置发起认证
5. 飞书认证成功后回调
6. 系统生成包含租户信息的 JWT Token
7. 用户登录成功，仅能访问租户 A 的数据

**后置条件**: 用户以租户 A 身份成功登录

---

## 📊 系统约束

### 约束-1: 向后兼容性
- 现有单租户部署模式必须继续支持
- 现有 API 接口必须保持兼容
- 现有数据库结构必须平滑升级

### 约束-2: 资源限制
- 每个租户服务器资源有限（内存、CPU）
- 需要考虑单服务器多租户 vs 多服务器单租户的成本

### 约束-3: 飞书限制
- 每个飞书应用有独立的速率限制
- 需要处理不同租户飞书 API 的限流

---

## 🎯 成功标准

### 最小可行产品 (MVP)

- [ ] 支持至少 2 个租户同时部署
- [ ] 每个租户使用独立的飞书应用配置
- [ ] 租户间数据完全隔离
- [ ] 部署脚本支持指定租户和服务器

### 完整功能

- [ ] 支持至少 10 个租户同时部署
- [ ] 租户级监控和日志
- [ ] 租户级资源配额管理
- [ ] 租户自助管理界面

---

## 📚 参考文档

- [Issue #21: 支持多服务实例部署](https://github.com/renzhichao/AIOpc/issues/21)
- [GAP Analysis: 多租户部署现状分析](./GAP_Analysis_issue21_multi_tenant.md)
- [现有 OAuth 实现](../backend/src/services/OAuthService.ts)
- [部署脚本文档](../../scripts/README.md)

---

**文档版本历史**:
- v1.0 (2026-03-19): 初始版本
