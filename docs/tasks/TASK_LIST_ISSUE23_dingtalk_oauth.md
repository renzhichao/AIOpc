# TASK LIST - Issue #23: 钉钉OAuth支持

> **创建日期**: 2026-03-21
> **版本**: 1.0
> **Issue**: #23 - 支持钉钉作为扫码登录认领OpenClaw的入口
> **预计工期**: 4-5周
> **资源限制**: 无配置中心/监控系统，P0安全问题必须修复

---

## 任务概览

| 任务ID | 任务名称 | 优先级 | 预计工期 | 状态 |
|--------|----------|--------|----------|------|
| TASK-001 | State参数安全机制实现 | P0 | 1-2天 | PENDING |
| TASK-002 | 敏感信息脱敏机制 | P0 | 1天 | PENDING |
| TASK-003 | 数据库并发创建用户保护 | P0 | 1-2天 | PENDING |
| TASK-004 | OAuth回调URL白名单验证 | P0 | 1天 | PENDING |
| TASK-005 | IOAuthProvider接口定义 | P1 | 0.5天 | PENDING |
| TASK-006 | DingTalkOAuthProvider实现 | P1 | 2-3天 | PENDING |
| TASK-007 | OAuthService多平台支持 | P1 | 1-2天 | PENDING |
| TASK-008 | 数据库Schema变更 | P1 | 1天 | PENDING |
| TASK-009 | 多平台OAuth路由扩展 | P1 | 1天 | PENDING |
| TASK-010 | 平台选择前端页面 | P1 | 2-3天 | PENDING |
| TASK-011 | 单元测试补充 | P2 | 3-4天 | PENDING |
| TASK-012 | 集成测试编写 | P2 | 2-3天 | PENDING |
| TASK-013 | E2E测试实现 | P2 | 2天 | PENDING |

---

## Phase 1: P0安全问题修复 (1周)

### TASK-001: State参数安全机制实现

**优先级**: P0 (必须修复)
**预计工期**: 1-2天
**状态**: PENDING

**任务描述**:
实现OAuth State参数的完整安全机制，防止CSRF攻击和重放攻击。包括State生成、存储、验证、过期管理、一次性使用等完整生命周期管理。

**前置依赖**: 无

**前置检查项**:
- [ ] 现有OAuthService已分析
- [ ] 了解当前State参数使用方式
- [ ] Redis配置已验证可用

**参考文档**:
- `docs/design/oauth-abstraction-layer.md` - State管理设计
- `docs/requirements/issue23-dingtalk-oauth-gap-analysis.md` - 安全需求

**Acceptance Criteria**:

| 类型 | 检查项 |
|------|--------|
| 功能 | [ ] StateManager类实现，支持store/validate/delete操作 |
| 功能 | [ ] State使用加密随机生成（至少32字节） |
| 功能 | [ ] State存储包含平台、时间戳、redirectUri元数据 |
| 功能 | [ ] State验证检查过期时间（10分钟TTL） |
| 功能 | [ ] State一次性使用后自动删除 |
| 功能 | [ ] OAuth回调时强制验证State参数 |
| 安全 | [ ] State加密存储在Redis |
| 测试 | [ ] 单元测试覆盖：生成、验证、过期、重放场景 |
| 测试 | [ ] 集成测试覆盖完整OAuth流程 |

**输出物**:
- `src/auth/StateManager.ts` - State管理器
- `src/auth/stateManager.spec.ts` - 单元测试
- 更新 `src/auth/OAuthService.ts` - 集成State验证

---

### TASK-002: 敏感信息脱敏机制

**优先级**: P0 (必须修复)
**预计工期**: 1天
**状态**: PENDING

**任务描述**:
实现统一的日志脱敏机制，确保appSecret、accessToken、authorization code等敏感信息不会出现在日志和错误消息中。

**前置依赖**: 无

**前置检查项**:
- [ ] 现有日志输出点已识别
- [ ] 敏感字段清单已确认

**参考文档**:
- `docs/design/dingtalk-oauth-backend-implementation.md` - 安全设计

**Acceptance Criteria**:

| 类型 | 检查项 |
|------|--------|
| 功能 | [ ] LogSanitizer工具类实现 |
| 功能 | [ ] Config对象脱敏（appKey只显示前8位，appSecret完全隐藏） |
| 功能 | [ ] Token对象脱敏（accessToken、refreshToken完全隐藏） |
| 功能 | [ ] Code对象脱敏（authorization code只显示长度） |
| 功能 | [ ] Error对象脱敏（不泄露内部配置细节） |
| 集成 | [ ] OAuthProvider所有日志调用使用脱敏 |
| 集成 | [ ] OAuthController错误响应使用脱敏 |
| 测试 | [ ] 单元测试验证各类敏感信息正确脱敏 |

**输出物**:
- `src/utils/LogSanitizer.ts` - 日志脱敏工具
- `src/utils/logSanitizer.spec.ts` - 单元测试
- 更新所有OAuth相关日志调用

---

### TASK-003: 数据库并发创建用户保护

**优先级**: P0 (必须修复)
**预计工期**: 1-2天
**状态**: PENDING

**任务描述**:
修复用户创建并发竞态条件，通过数据库唯一约束和重试机制确保同一用户不会重复创建。

**前置依赖**: 无

**前置检查项**:
- [ ] 现有User entity已分析
- [ ] 用户创建流程已理解

**参考文档**:
- `docs/design/dingtalk-oauth-backend-implementation.md` - 并发控制设计

**Acceptance Criteria**:

| 类型 | 检查项 |
|------|--------|
| 数据库 | [ ] dingtalk_user_id字段添加UNIQUE约束 |
| 数据库 | [ ] feishu_user_id字段添加UNIQUE约束（如未存在） |
| 代码 | [ ] findOrCreateUser实现重试机制（最多3次） |
| 代码 | [ ] 检测23505唯一约束冲突错误码 |
| 代码 | [ ] 冲突时重新查询用户而非直接失败 |
| 测试 | [ ] 并发创建单元测试（模拟100并发） |
| 测试 | [ ] 验证只创建一条用户记录 |
| 迁移 | [ ] 数据库迁移脚本可回滚 |

**输出物**:
- `src/migrations/*AddOAuthUniqueConstraints*.ts` - 迁移脚本
- 更新 `src/repositories/UserRepository.ts` - 添加createWithRetry方法
- `src/repositories/userRepository.spec.ts` - 并发测试

---

### TASK-004: OAuth回调URL白名单验证

**优先级**: P0 (必须修复)
**预计工期**: 1天
**状态**: PENDING

**任务描述**:
实现OAuth回调URL的严格验证，包括协议验证、域名白名单、生产环境强制HTTPS等安全措施。

**前置依赖**: 无

**前置检查项**:
- [ ] 现有redirectUri验证代码已定位
- [ ] 租户域名配置已明确

**参考文档**:
- `docs/design/dingtalk-oauth-backend-implementation.md` - URL验证设计

**Acceptance Criteria**:

| 类型 | 检查项 |
|------|--------|
| 功能 | [ ] isValidRedirectUri实现增强验证 |
| 功能 | [ ] 协议验证：只允许http/https |
| 功能 | [ ] 生产环境强制HTTPS（NODE_ENV=production） |
| 功能 | [ ] 域名白名单验证（OAUTH_ALLOWED_DOMAINS环境变量） |
| 功能 | [ ] 支持子域名匹配（*.example.com） |
| 安全 | [ ] 拒绝非白名单域名并记录警告日志 |
| 配置 | [ ] 默认白名单包含localhost（开发环境） |
| 测试 | [ ] 单元测试：合法域名、非法域名、HTTP降级攻击 |
| 测试 | [ ] 集成测试：完整OAuth流程使用白名单URL |

**输出物**:
- 更新 `src/auth/BaseOAuthProvider.ts` - 增强URL验证
- `src/auth/baseOAuthProvider.spec.ts` - URL验证测试
- 更新 `.env.example` - 添加OAUTH_ALLOWED_DOMAINS配置

---

## Phase 2: 核心功能实现 (2-3周)

### TASK-005: IOAuthProvider接口定义

**优先级**: P1
**预计工期**: 0.5天
**状态**: PENDING

**任务描述**:
定义OAuth提供商的统一接口抽象，为后续实现飞书、钉钉等平台提供商奠定基础。

**前置依赖**: TASK-001, TASK-002, TASK-003, TASK-004

**前置检查项**:
- [ ] 所有P0安全任务已完成
- [ ] 现有FeishuOAuthService已分析

**参考文档**:
- `docs/design/oauth-abstraction-layer.md` - 接口设计

**Acceptance Criteria**:

| 类型 | 检查项 |
|------|--------|
| 接口 | [ ] IOAuthProvider接口定义完整 |
| 接口 | [ ] OAuthPlatform枚举（FEISHU, DINGTALK） |
| 接口 | [ ] TokenResponse接口标准化 |
| 接口 | [ ] UserProfile接口标准化 |
| 接口 | [ ] OAuthError标准错误类型 |
| 类型 | [ ] TypeScript类型导出正确 |
| 文档 | [ ] 接口JSDoc注释完整 |

**输出物**:
- `src/auth/interfaces/IOAuthProvider.ts` - 接口定义
- `src/auth/interfaces/OAuthTypes.ts` - 类型定义
- `src/auth/interfaces/index.ts` - 导出文件

---

### TASK-006: DingTalkOAuthProvider实现

**优先级**: P1
**预计工期**: 2-3天
**状态**: PENDING

**任务描述**:
实现钉钉OAuth提供商的完整功能，包括授权URL生成、授权码换取Token、获取用户信息、Token刷新等。

**前置依赖**: TASK-005

**前置检查项**:
- [ ] IOAuthProvider接口已定义
- [ ] 钉钉开放平台API文档已熟悉
- [ ] 测试用AppKey/AppSecret已准备

**参考文档**:
- `docs/design/dingtalk-oauth-backend-implementation.md` - 钉钉实现设计
- 钉钉开放平台文档: https://open.dingtalk.com/document/

**Acceptance Criteria**:

| 类型 | 检查项 |
|------|--------|
| 功能 | [ ] 实现IOAuthProvider接口所有方法 |
| 功能 | [ ] getAuthorizationUrl生成正确授权URL |
| 功能 | [ ] exchangeCodeForToken调用钉钉API |
| 功能 | [ ] getUserInfo获取并标准化用户信息 |
| 功能 | [ ] validateToken验证Token有效性 |
| 功能 | [ ] refreshAccessToken刷新Token |
| 配置 | [ ] 支持DINGTALK_APP_ID、DINGTALK_APP_SECRET等环境变量 |
| 错误 | [ ] 钉钉错误码正确映射到OAuthError |
| 测试 | [ ] 单元测试覆盖所有公共方法 |
| 测试 | [ ] Mock钉钉API响应测试 |
| 集成 | [ ] 可与真实钉钉API集成测试（使用测试账号） |

**输出物**:
- `src/auth/providers/DingTalkOAuthProvider.ts` - 钉钉提供商实现
- `src/auth/providers/dingTalkOAuthProvider.spec.ts` - 单元测试
- 更新 `.env.example` - 添加钉钉配置项

---

### TASK-007: OAuthService多平台支持

**优先级**: P1
**预计工期**: 1-2天
**状态**: PENDING

**任务描述**:
扩展OAuthService支持多平台，包括平台注册、获取启用平台列表、平台路由等核心功能。

**前置依赖**: TASK-005, TASK-006

**前置检查项**:
- [ ] IOAuthProvider接口已实现
- [ ] DingTalkOAuthProvider已实现
- [ ] 现有OAuthService代码已分析

**参考文档**:
- `docs/design/oauth-abstraction-layer.md` - OAuthService设计

**Acceptance Criteria**:

| 类型 | 检查项 |
|------|--------|
| 架构 | [ ] ProviderFactory实现平台实例化 |
| 架构 | [ ] OAuthService支持多平台provider |
| 功能 | [ ] registerPlatform注册新平台 |
| 功能 | [ ] getEnabledPlatforms获取启用平台列表 |
| 功能 | [ ] getProvider根据platform获取provider实例 |
| 功能 | [ ] handleCallback支持platform参数 |
| 功能 | [ ] getAuthorizationUrl支持平台选择 |
| 配置 | [ ] OAuth配置支持enabled_platforms数组 |
| 向后兼容 | [ ] 默认platform保持为feishu |
| 向后兼容 | [ ] 现有/oauth/callback路由保持兼容 |
| 测试 | [ ] 单元测试：平台注册、获取、路由 |
| 集成 | [ ] 多平台同时启用的集成测试 |

**输出物**:
- `src/auth/ProviderFactory.ts` - Provider工厂
- 更新 `src/auth/OAuthService.ts` - 多平台支持
- `src/auth/providerFactory.spec.ts` - 单元测试
- 更新 `src/auth/oAuthService.spec.ts` - 集成测试

---

### TASK-008: 数据库Schema变更

**优先级**: P1
**预计工期**: 1天
**状态**: PENDING

**任务描述**:
扩展User entity支持多平台OAuth，添加oauth_platform、dingtalk_user_id等字段，以及相应的索引和约束。

**前置依赖**: TASK-003

**前置检查项**:
- [ ] 现有User entity已分析
- [ ] TypeORM迁移机制已熟悉

**参考文档**:
- `docs/design/dingtalk-oauth-backend-implementation.md` - 数据库设计

**Acceptance Criteria**:

| 类型 | 检查项 |
|------|--------|
| Entity | [ ] User entity添加oauth_platform字段 |
| Entity | [ ] User entity添加dingtalk_user_id字段 |
| Entity | [ ] 字段类型、可空性、默认值正确 |
| Index | [ ] dingtalk_user_id添加唯一索引 |
| Index | [ ] oauth_platform添加索引（查询优化） |
| 迁移 | [ ] 迁移脚本up()方法实现 |
| 迁移 | [ ] 迁移脚本down()方法实现（可回滚） |
| 迁移 | [ ] 现有feishu用户oauth_platform设置为'feishu' |
| 测试 | [ ] 迁移脚本测试：up/down完整循环 |
| 测试 | [ ] 验证现有数据不受影响 |

**输出物**:
- `src/migrations/*AddMultiPlatformOAuth*.ts` - 迁移脚本
- 更新 `src/entities/User.ts` - Entity定义
- `src/migrations/migration.spec.ts` - 迁移测试

---

### TASK-009: 多平台OAuth路由扩展

**优先级**: P1
**预计工期**: 1天
**状态**: PENDING

**任务描述**:
扩展OAuthController支持多平台路由，包括平台选择、平台特定回调、平台列表查询等API端点。

**前置依赖**: TASK-007, TASK-008

**前置检查项**:
- [ ] OAuthService多平台支持已实现
- [ ] 数据库schema已变更
- [ ] 现有路由已分析

**参考文档**:
- `docs/design/dingtalk-oauth-backend-implementation.md` - API设计

**Acceptance Criteria**:

| 类型 | 检查项 |
|------|--------|
| 路由 | [ ] GET /oauth/platforms - 获取启用平台列表 |
| 路由 | [ ] GET /oauth/authorize/:platform - 平台特定授权 |
| 路由 | [ ] POST /oauth/callback/:platform - 平台特定回调 |
| 路由 | [ ] POST /oauth/feishu/callback - 保持向后兼容 |
| 验证 | [ ] 平台参数验证（必须是启用平台） |
| 响应 | [ ] 统一响应格式（成功/错误） |
| 错误 | [ ] 平台不支持返回明确错误 |
| 文档 | [ ] OpenAPI/Swagger文档更新 |
| 测试 | [ ] 单元测试：所有新端点 |
| 集成 | [ ] API集成测试：完整OAuth流程 |

**输出物**:
- 更新 `src/controllers/OAuthController.ts` - 路由扩展
- `src/controllers/oauthController.spec.ts` - 单元测试
- 更新 `src/routes/auth.routes.ts` - 路由定义
- 更新 API文档

---

### TASK-010: 平台选择前端页面

**优先级**: P1
**预计工期**: 2-3天
**状态**: PENDING

**任务描述**:
实现平台选择UI页面，允许用户在飞书和钉钉之间选择OAuth登录方式。

**前置依赖**: TASK-009

**前置检查项**:
- [ ] 后端多平台API已实现
- [ ] 前端框架已熟悉（React/Vue）
- [ ] 现有登录页面已分析

**参考文档**:
- `docs/design/multi-platform-oauth-quick-reference.md` - 前端设计

**Acceptance Criteria**:

| 类型 | 检查项 |
|------|--------|
| UI | [ ] 平台选择页面实现 |
| UI | [ ] 显示所有启用平台的图标和名称 |
| UI | [ ] 支持点击选择平台 |
| 交互 | [ ] 选择后跳转到对应OAuth授权URL |
| 交互 | [ ] 支持"记住选择"功能（localStorage） |
| 样式 | [ ] 响应式设计（移动端友好） |
| 样式 | [ ] 飞书/钉钉官方颜色和图标 |
| API | [ ] 调用GET /oauth/platforms获取平台列表 |
| 错误 | [ ] API失败时显示友好错误提示 |
| 测试 | [ ] 单元测试：组件渲染 |
| 测试 | [ ] E2E测试：完整选择流程 |

**输出物**:
- `platform/frontend/src/components/PlatformSelector.tsx` - 平台选择组件
- `platform/frontend/src/pages/LoginPage.tsx` - 登录页面更新
- `platform/frontend/src/components/__tests__/PlatformSelector.spec.tsx` - 测试
- 更新 `platform/frontend/src/api/oauth.ts` - API客户端

---

## Phase 3: 测试补充 (1-2周)

### TASK-011: 单元测试补充

**优先级**: P2
**预计工期**: 3-4天
**状态**: PENDING

**任务描述**:
补充所有新增和修改代码的单元测试，确保测试覆盖率≥85%。

**前置依赖**: TASK-005, TASK-006, TASK-007, TASK-008, TASK-009

**前置检查项**:
- [ ] 所有核心功能已实现
- [ ] 测试框架已配置（Jest/Vitest）

**参考文档**:
- QA专家评审报告 - 测试用例清单

**Acceptance Criteria**:

| 类型 | 检查项 |
|------|--------|
| 覆盖率 | [ ] 整体代码覆盖率≥85% |
| 覆盖率 | [ ] 核心模块覆盖率≥90% |
| 单元测试 | [ ] StateManager所有方法测试 |
| 单元测试 | [ ] LogSanitizer所有方法测试 |
| 单元测试 | [ ] DingTalkOAuthProvider所有公共方法测试 |
| 单元测试 | [ ] ProviderFactory所有方法测试 |
| 单元测试 | [ ] OAuthService多平台方法测试 |
| 单元测试 | [ ] UserRepository并发创建测试 |
| Mock | [ ] 所有外部依赖正确Mock |
| 边界 | [ ] 边界条件测试（空值、null、undefined） |
| 错误 | [ ] 错误场景测试（API失败、超时、无效响应） |

**输出物**:
- 所有模块对应的`.spec.ts`测试文件
- 更新 `jest.config.ts` - 测试配置
- 测试覆盖率报告

---

### TASK-012: 集成测试编写

**优先级**: P2
**预计工期**: 2-3天
**状态**: PENDING

**任务描述**:
编写OAuth流程的集成测试，验证多平台OAuth完整流程、数据库操作、跨平台场景等。

**前置依赖**: TASK-011

**前置检查项**:
- [ ] 所有单元测试已通过
- [ ] 测试数据库已配置

**参考文档**:
- QA专家评审报告 - 集成测试场景

**Acceptance Criteria**:

| 类型 | 检查项 |
|------|--------|
| 流程 | [ ] 钉钉完整OAuth流程测试 |
| 流程 | [ ] 飞书完整OAuth流程测试（验证兼容性） |
| 场景 | [ ] 用户首次登录创建账号 |
| 场景 | [ ] 用户再次登录更新信息 |
| 场景 | [ ] 同一用户多平台登录（飞书+钉钉） |
| 场景 | [ ] Token刷新流程 |
| 数据库 | [ ] 验证数据库记录正确创建/更新 |
| 数据库 | [ ] 验证唯一约束生效 |
| 并发 | [ ] 并发登录场景测试 |
| 清理 | [ ] 每个测试独立运行并清理数据 |

**输出物**:
- `tests/integration/oauth.integration.spec.ts` - OAuth集成测试
- `tests/integration/multi-platform.integration.spec.ts` - 多平台测试
- 测试fixture和工具函数

---

### TASK-013: E2E测试实现

**优先级**: P2
**预计工期**: 2天
**状态**: PENDING

**任务描述**:
实现端到端测试，模拟真实用户在浏览器中的完整OAuth登录流程。

**前置依赖**: TASK-010, TASK-012

**前置检查项**:
- [ ] 前端平台选择页面已实现
- [ ] 后端API已实现
- [ ] E2E测试框架已配置（Playwright/Cypress）

**参考文档**:
- QA专家评审报告 - E2E测试场景

**Acceptance Criteria**:

| 类型 | 检查项 |
|------|--------|
| 流程 | [ ] 用户访问登录页面 |
| 流程 | [ ] 选择钉钉平台 |
| 流程 | [ ] 跳转到钉钉授权页（Mock） |
| 流程 | [ ] 授权回调返回 |
| 流程 | [ ] 用户成功登录并跳转首页 |
| 流程 | [ ] 验证JWT token正确设置 |
| 错误 | [ ] OAuth授权失败场景 |
| 错误 | [ ] 网络错误场景 |
| 多平台 | [ ] 飞书登录E2E测试（验证向后兼容） |
| 多平台 | [ ] 平台切换E2E测试 |

**输出物**:
- `tests/e2e/oauth-login.spec.ts` - E2E测试
- `tests/e2e/fixtures/oauth.mock.ts` - Mock钉钉/飞书API
- Playwright/Cypress配置更新

---

## 依赖关系图

```
Phase 1: P0安全修复 (可并行)
├─ TASK-001: State参数安全机制
├─ TASK-002: 敏感信息脱敏
├─ TASK-003: 并发创建用户保护
└─ TASK-004: 回调URL白名单验证
         ↓
Phase 2: 核心功能 (顺序依赖)
├─ TASK-005: IOAuthProvider接口 ←───┐
│                                   │
├─ TASK-006: DingTalkOAuthProvider ←─┤
│                                   │
├─ TASK-008: 数据库Schema变更 ←─────┤
│                                   │
├─ TASK-007: OAuthService扩展 ←──────┤
│                                   │
├─ TASK-009: 路由扩展 ←──────────────┘
│
└─ TASK-010: 前端平台选择页面
         ↓
Phase 3: 测试 (部分并行)
├─ TASK-011: 单元测试 ←────┐
│                           │
├─ TASK-012: 集成测试 ←─────┤
│                           │
└─ TASK-013: E2E测试 ←──────┘
```

---

## 执行策略

### 阶段1: P0安全修复 (Week 1)
- 并行执行TASK-001, TASK-002, TASK-003, TASK-004
- 目标：1周内完成所有P0安全问题修复

### 阶段2: 核心功能实现 (Week 2-3)
- 顺序执行TASK-005 → TASK-006 → TASK-008 → TASK-007 → TASK-009 → TASK-010
- 每个任务完成后立即提交并更新TASK LIST

### 阶段3: 测试补充 (Week 4-5)
- TASK-011可与其他任务并行启动（边开发边写测试）
- TASK-012在TASK-011完成后执行
- TASK-013在TASK-010完成后执行

---

## 排除的专家建议

以下建议因资源限制暂时不采纳：

| 建议 | 原因 | 未来考虑 |
|------|------|----------|
| 配置中心统一管理 | 无配置中心基础设施 | 长期规划 |
| 监控指标和告警 | 无监控系统 | 长期规划 |
| 性能优化（并行化） | 资源优先保证核心功能 | P2优化项 |
| 配置热更新 | 无配置中心支持 | 长期规划 |

---

## 验收标准

### Phase 1完成标准
- [ ] 所有P0安全问题修复完成
- [ ] 安全测试通过（无CSRF、无信息泄露、无并发冲突）
- [ ] 代码审查通过

### Phase 2完成标准
- [ ] 钉钉OAuth完整流程可用
- [ ] 飞书OAuth向后兼容验证通过
- [ ] 前端平台选择页面可用
- [ ] API文档更新完整

### Phase 3完成标准
- [ ] 单元测试覆盖率≥85%
- [ ] 所有集成测试通过
- [ ] E2E测试覆盖关键路径
- [ ] 性能基准测试通过（OAuth流程≤5秒）

---

## 变更记录

| 版本 | 日期 | 变更说明 |
|------|------|----------|
| 1.0 | 2026-03-21 | 初始版本，基于技术评审创建任务队列 |

---

> 📌 **执行说明**:
> 1. 每个任务执行前请阅读 `docs/AUTO_TASK_CONFIG.md` 了解执行规范
> 2. 严格遵循上下文隔离策略，每个任务启动前清理上下文
> 3. 任务完成后立即更新本TASK LIST并提交Git
> 4. 遇到阻塞问题及时记录在对应任务的"阻塞原因"字段
