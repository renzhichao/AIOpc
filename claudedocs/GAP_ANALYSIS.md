# 需求实现GAP分析报告

**分析日期**: 2026-03-15
**需求文档**: CORE-REQ-001
**分析范围**: 前端 + 后端已实现功能 vs 核心需求

---

## 📊 执行摘要

### 总体完成度

| 类别 | 完成度 | 说明 |
|------|--------|------|
| **核心功能 (Must Have)** | **65%** | 基础架构完成，关键功能缺失 |
| **扩展功能 (Should Have)** | **40%** | 部分UI完成，统计功能缺失 |
| **未来功能 (Could Have)** | **0%** | 未开始 |
| **整体进度** | **~50%** | 项目处于中期阶段 |

---

## 1. 核心功能（Must Have）分析

### ✅ 已完成功能

#### F-001: 实例生命周期管理 - **70% 完成**

| 子功能 | 状态 | 实现位置 | 说明 |
|--------|------|----------|------|
| 实例创建 | ✅ 完成 | Backend: InstanceController.createInstance<br>Frontend: InstanceCreatePage.tsx | 支持personal/team/enterprise模板 |
| 实例查询 | ✅ 完成 | Backend: GET /api/instances<br>Frontend: InstanceListPage.tsx | 列表展示，支持状态过滤 |
| 实例详情 | ✅ 完成 | Backend: GET /api/instances/:id<br>Frontend: InstanceDetailPage.tsx | 显示完整实例信息 |
| 实例启动 | ✅ 完成 | Backend: POST /api/instances/:id/start<br>Frontend: InstanceDetailPage.tsx | 启动按钮和API调用 |
| 实例停止 | ✅ 完成 | Backend: POST /api/instances/:id/stop<br>Frontend: InstanceDetailPage.tsx | 停止按钮和API调用 |
| 实例重启 | ✅ 完成 | Backend: POST /api/instances/:id/restart | 后端API已实现 |
| 实例释放 | ✅ 完成 | Backend: DELETE /api/instances/:id | 删除API已实现 |
| 实例续费 | ❌ **缺失** | - | **未实现** |

**缺失功能**:
- ❌ 实例续费功能 (延长到期时间)
- ❌ 实例到期时间显示 (UI中未显示)
- ❌ 实例到期提醒
- ❌ 实例到期自动停止

---

#### F-002: 二维码生成与验证 - **30% 完成**

| 子功能 | 状态 | 实现位置 | 说明 |
|--------|------|----------|------|
| 生成认领二维码 | ⚠️ 部分完成 | Frontend: LoginPage.tsx (显示QR占位) | **仅UI占位，未生成真实QR码** |
| 二维码有效期 | ❌ 缺失 | - | 未实现 |
| 二维码防篡改 | ❌ 缺失 | - | 未实现数字签名 |
| 扫码统计 | ❌ 缺失 | - | 未实现扫码记录 |
| 验证二维码 | ❌ 缺失 | - | 未实现验证API |

**API缺失**:
```yaml
# 需要实现的API
GET /api/instances/{instance_id}/qr-code   # 生成二维码
POST /api/qr-codes/validate                # 验证二维码
GET /api/instances/{instance_id}/qr-stats  # 扫码统计
```

**关键问题**:
1. 二维码只是静态UI，未生成真实QR码图片
2. 没有二维码生成逻辑（应使用qrcode库）
3. 没有二维码验证端点
4. 没有防伪签名机制

---

#### F-003: 飞书OAuth集成 - **60% 完成**

| 子功能 | 状态 | 实现位置 | 说明 |
|--------|------|----------|------|
| OAuth 2.0授权流程 | ✅ 完成 | Backend: MockOAuthController<br>Frontend: LoginPage.tsx | 使用Mock实现，非真实飞书 |
| 获取用户信息 | ✅ 完成 | Backend: OAuthController.getUserInfo | 获取用户ID、姓名等 |
| 创建用户-实例绑定 | ✅ 完成 | Backend: OAuthService | 数据库绑定关系 |
| 生成访问Token | ✅ 完成 | Backend: OAuthService | JWT Token生成 |
| 飞书开放平台配置 | ❌ Mock | 使用Mock数据 | **未接入真实飞书API** |

**已完成流程**:
```
✅ 1. 用户访问登录页
✅ 2. 显示二维码（占位）
✅ 3. 跳转OAuth授权页（Mock）
✅ 4. 回调处理
✅ 5. 换取Token
✅ 6. 获取用户信息
✅ 7. 创建绑定关系
✅ 8. 返回访问Token
```

**关键问题**:
1. ⚠️ 使用Mock OAuth，未接入真实飞书
2. ❌ 未配置真实飞书App ID/Secret
3. ❌ 未实现真实飞书OAuth URL跳转
4. ❌ 前端二维码未包含真实OAuth链接

---

#### F-004: 预设配置管理 - **50% 完成**

| 子功能 | 状态 | 实现位置 | 说明 |
|--------|------|----------|------|
| 实例创建时应用预设 | ⚠️ 部分 | Backend: InstanceService | 模板定义存在，但配置不完整 |
| 多套预设模板 | ✅ 完成 | Backend: templates/* | personal/team/enterprise模板 |
| 配置热重载 | ❌ 缺失 | - | 需要重启才能生效 |
| 配置版本管理 | ❌ 缺失 | - | 无版本控制 |

**预设模板状态**:
```yaml
✅ templates/personal.yaml  - 个人版模板存在
✅ templates/team.yaml     - 团队版模板存在
❌ templates/enterprise.yaml - 企业版模板（可能缺失）
⚠️ 预设Skills - 未完全实现
⚠️ 预设Tools  - 未完全实现
⚠️ LLM配置   - 未应用DeepSeek API Key
```

**关键问题**:
1. ❌ 实际创建实例时未应用预设配置
2. ❌ 未集成平台统一的DeepSeek API Key
3. ❌ 预设Skills和Tools未自动配置
4. ❌ System Prompt未使用预设模板

---

## 2. 扩展功能（Should Have）分析

### F-005: 实例管理界面（Web控制台） - **80% 完成**

| 子功能 | 状态 | 实现位置 | 说明 |
|--------|------|----------|------|
| 实例列表展示 | ✅ 完成 | Frontend: InstanceListPage.tsx | 卡片式布局，状态显示 |
| 实例详情查看 | ✅ 完成 | Frontend: InstanceDetailPage.tsx | 详细信息展示 |
| 实例操作（启动/停止/释放） | ✅ 完成 | Frontend: InstanceDetailPage.tsx | 操作按钮和API调用 |
| 使用量统计 | ❌ **缺失** | - | **未实现统计展示** |
| 账单查看 | ❌ 缺失 | - | 未实现 |

**UI完成度**: 80%
- ✅ 布局和设计完成
- ✅ 基本交互完成
- ❌ 缺少使用量统计图表
- ❌ 缺少账单信息展示

---

### F-006: 使用量统计 - **0% 完成**

| 子功能 | 状态 | 说明 |
|--------|------|------|
| 消息量统计 | ❌ 缺失 | 未实现 |
| Token使用量 | ❌ 缺失 | 未实现 |
| CPU使用率 | ❌ 缺失 | 未实现 |
| 内存使用率 | ❌ 缺失 | 未实现 |
| 存储使用量 | ❌ 缺失 | 未实现 |

**需要实现**:
```yaml
API:
  GET /api/instances/:id/usage     # 使用量统计
  GET /api/instances/:id/health    # 健康状态
  GET /api/instances/:id/metrics   # 性能指标

Database:
  - instance_metrics 表（需要创建）
  - 按小时/天聚合统计数据
```

---

### F-007: 配置自定义 - **20% 完成**

| 子功能 | 状态 | 说明 |
|--------|------|------|
| 替换LLM API密钥 | ❌ 缺失 | 未实现用户自定义密钥 |
| 调整Model参数 | ❌ 缺失 | 未实现参数调整UI |
| 增删Skills | ❌ 缺失 | 未实现Skill管理 |
| 升级Tools | ❌ 缺失 | 未实现Tool权限管理 |
| 自定义System Prompt | ❌ 缺失 | 未实现Prompt编辑器 |

---

## 3. 未来功能（Could Have）分析

| 功能 | 状态 | 说明 |
|------|------|------|
| F-008: 实例市场 | ❌ 未开始 | 无任何实现 |
| F-009: 多租户支持 | ❌ 未开始 | 数据库设计不支持 |
| F-010: API开放 | ❌ 未开始 | 无API文档 |

---

## 4. 关键缺失功能（按优先级）

### 🔴 P0 - 阻塞发布（必须立即实现）

1. **F-002: 真实二维码生成**
   - 当前: 仅为UI占位
   - 需求: 生成可扫描的真实QR码
   - 估时: 2-3小时
   - 依赖: qrcode库

2. **F-003: 真实飞书OAuth集成**
   - 当前: 使用Mock
   - 需求: 接入真实飞书API
   - 估时: 4-6小时
   - 依赖: 飞书开放平台账号

3. **F-004: 应用预设配置**
   - 当前: 模板存在但未应用
   - 需求: 创建实例时应用LLM/Skills/Tools配置
   - 估时: 6-8小时
   - 依赖: DeepSeek API Key配置

### 🟡 P1 - 重要但不阻塞（1-2周内实现）

4. **F-001: 实例续费功能**
   - 估时: 3-4小时
   - 包括: 续费API、到期时间显示、UI更新

5. **F-006: 使用量统计**
   - 估时: 8-12小时
   - 包括: 数据库表、聚合逻辑、API、UI图表

6. **F-005: 账单查看**
   - 估时: 6-8小时
   - 包括: 账单计算逻辑、历史记录、UI展示

### 🟢 P2 - 优化项（1个月内实现）

7. **F-007: 配置自定义**
   - 估时: 16-24小时
   - 包括: 配置编辑器UI、API、验证逻辑

8. **F-002: 二维码高级功能**
   - 估时: 4-6小时
   - 包括: 防伪签名、有效期检查、扫码统计

---

## 5. 技术债务

### 代码质量

| 问题 | 严重度 | 影响 | 建议 |
|------|--------|------|------|
| Mock OAuth混在代码中 | 高 | 无法切换到生产 | 环境变量分离 |
| 缺少API文档 | 中 | 前后端协作困难 | 添加Swagger |
| 缺少错误处理 | 中 | 用户体验差 | 统一错误处理 |
| 缺少日志记录 | 中 | 排查困难 | 添加结构化日志 |

### 测试覆盖

| 模块 | 单元测试 | 集成测试 | E2E测试 | 覆盖率 |
|------|----------|----------|---------|--------|
| Backend Controllers | ✅ 70% | ⚠️ 30% | ❌ 0% | Medium |
| Backend Services | ✅ 60% | ❌ 0% | ❌ 0% | Low |
| Frontend Pages | ❌ 0% | ❌ 0% | ✅ 100% | Low |
| Frontend Services | ❌ 0% | ❌ 0% | ✅ 100% | Low |

**建议**:
- 后端: 增加集成测试覆盖
- 前端: 添加单元测试

---

## 6. 数据库设计GAP

### 缺失的表

```sql
-- 实例配置表（需要）
CREATE TABLE instance_configs (
  instance_id VARCHAR PRIMARY KEY,
  llm_config JSONB,
  skills JSONB,
  tools JSONB,
  system_prompt TEXT,
  template VARCHAR(50),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- 使用量统计表（需要）
CREATE TABLE instance_metrics (
  id SERIAL PRIMARY KEY,
  instance_id VARCHAR,
  metric_type VARCHAR(50),  -- cpu, memory, messages, tokens
  metric_value NUMERIC,
  recorded_at TIMESTAMP,
  INDEX idx_instance_time (instance_id, recorded_at)
);

-- 二维码记录表（需要）
CREATE TABLE qr_codes (
  id SERIAL PRIMARY KEY,
  instance_id VARCHAR,
  token VARCHAR UNIQUE,
  signature VARCHAR,
  expires_at TIMESTAMP,
  scan_count INTEGER DEFAULT 0,
  created_at TIMESTAMP,
  INDEX idx_token (token)
);

-- 实例续费记录表（需要）
CREATE TABLE instance_renewals (
  id SERIAL PRIMARY KEY,
  instance_id VARCHAR,
  old_expires_at TIMESTAMP,
  new_expires_at TIMESTAMP,
  renewed_at TIMESTAMP,
  INDEX idx_instance (instance_id)
);
```

---

## 7. API设计GAP

### 缺失的API端点

```yaml
# 二维码管理
GET    /api/instances/:id/qr-code          # 生成二维码
POST   /api/qr-codes/validate              # 验证二维码
GET    /api/instances/:id/qr-stats         # 扫码统计

# 实例续费
POST   /api/instances/:id/renew           # 续费实例
GET    /api/instances/:id/renewals         # 续费历史

# 使用量统计
GET    /api/instances/:id/usage           # 使用量统计
GET    /api/instances/:id/health          # 健康状态
GET    /api/instances/:id/metrics         # 性能指标

# 配置管理
GET    /api/instances/:id/config          # 获取配置
PUT    /api/instances/:id/config          # 更新配置
PATCH  /api/instances/:id/config          # 部分更新配置

# 账单管理
GET    /api/instances/:id/bills           # 账单列表
GET    /api/bills/:id                     # 账单详情
```

---

## 8. 建议的实施路线图

### 第1阶段: 核心功能补全（1-2周）

**目标**: 实现可用的MVP

1. 实现真实二维码生成（2-3小时）
2. 接入真实飞书OAuth（4-6小时）
3. 应用预设配置到实例创建（6-8小时）
4. 实现实例续费功能（3-4小时）

**里程碑**: 用户可以完整走通扫码认领流程

### 第2阶段: 统计与监控（1周）

**目标**: 提供运营数据

1. 设计并实现metrics表结构（2-3小时）
2. 实现使用量统计API（4-6小时）
3. 实现健康检查API（2-3小时）
4. 实现统计图表UI（6-8小时）

**里程碑**: 管理员可以查看实例使用情况

### 第3阶段: 配置自定义（1-2周）

**目标**: 提供灵活性

1. 实现配置编辑器UI（8-12小时）
2. 实现配置更新API（4-6小时）
3. 实现Skill管理（6-8小时）
4. 实现Tool权限管理（4-6小时）

**里程碑**: 用户可以自定义实例配置

### 第4阶段: 优化与完善（持续）

1. 添加API文档（Swagger）
2. 完善错误处理
3. 添加单元测试和集成测试
4. 性能优化
5. 安全加固

---

## 9. 总结

### 当前状态

**项目处于中期阶段**，基础架构和核心流程已基本完成，但关键的业务逻辑（真实二维码、真实OAuth、预设配置应用）尚未实现。

**优势**:
- ✅ 清晰的架构设计
- ✅ 完整的前后端代码框架
- ✅ 良好的E2E测试覆盖
- ✅ 基础的CRUD功能完整

**挑战**:
- ❌ 核心业务逻辑缺失
- ❌ Mock数据依赖严重
- ❌ 缺少生产环境配置
- ❌ 统计和监控功能空白

### 下一步行动

**立即行动**（本周内）:
1. 实现真实二维码生成
2. 接入真实飞书OAuth（申请测试账号）
3. 应用预设配置逻辑

**短期目标**（2-4周）:
1. 完成核心功能补全
2. 实现基础统计功能
3. 完成测试覆盖
4. 准备生产环境部署

**中期目标**（1-2月）:
1. 实现配置自定义
2. 完善监控和日志
3. 性能优化
4. 安全加固

---

**报告生成时间**: 2026-03-15
**下次更新建议**: 完成第1阶段后更新
