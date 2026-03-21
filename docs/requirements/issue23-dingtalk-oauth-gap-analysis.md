# Issue #23: 钉钉OAuth支持 - GAP分析与需求文档

**文档版本**: 1.0
**创建日期**: 2026-03-21
**关联Issue**: #23
**优先级**: P0 (高优先级)

---

## 📋 需求概述

### 业务需求
当前OpenClaw平台通过飞书开放平台实现企业用户扫码登录认领实例。需要扩展支持钉钉开放平台，让企业用户可以选择使用钉钉账号进行扫码登录，登录后的用户体验与飞书保持完全一致。

### 核心目标
1. **多平台支持**：支持飞书和钉钉两个企业通讯平台
2. **一致体验**：钉钉登录后的功能、界面、流程与飞书完全一致
3. **灵活配置**：租户可选择使用飞书、钉钉或同时支持两个平台
4. **平滑迁移**：现有飞书用户无感知，新钉钉用户无缝接入

---

## 🎯 GAP分析：基本能力

### 当前状态（飞书OAuth）
| 能力 | 实现状态 | 说明 |
|------|---------|------|
| OAuth 2.0授权码流程 | ✅ 完整实现 | 标准Authorization Code Flow |
| 扫码登录UI | ✅ 二维码展示 | 前端生成QR Code，用户扫码 |
| 用户信息获取 | ✅ 完整实现 | 获取用户ID、姓名、邮箱、头像等 |
| JWT令牌生成 | ✅ 完整实现 | access_token + refresh_token |
| 自动实例认领 | ✅ 完整实现 | 登录后自动关联未认领实例 |
| 用户数据恢复 | ✅ 完整实现 | 特殊用户名称匹配恢复机制 |
| 错误处理 | ✅ 完整实现 | 标准化错误码和友好提示 |
| 开发环境Mock | ✅ 完整实现 | MockOAuthController支持本地开发 |

### 目标状态（飞书+钉钉）
| 能力 | 飞书 | 钉钉 | GAP说明 |
|------|------|------|---------|
| OAuth 2.0授权码流程 | ✅ | ❌ 需实现 | 钉钉API不同，需适配 |
| 扫码登录UI | ✅ | ❌ 需实现 | 需支持钉钉扫码样式和流程 |
| 用户信息获取 | ✅ | ❌ 需实现 | 钉钉用户属性字段不同 |
| JWT令牌生成 | ✅ | ✅ 复用 | JWT生成逻辑可共享 |
| 自动实例认领 | ✅ | ✅ 复用 | 业务逻辑与平台无关 |
| 用户数据恢复 | ✅ | ❌ 需扩展 | 需支持钉钉用户恢复 |
| 错误处理 | ✅ | ❌ 需扩展 | 钉钉特定错误码映射 |
| 开发环境Mock | ✅ | ❌ 需实现 | 需Mock钉钉OAuth服务器 |

### 基本能力GAP总结
**关键差距**：
1. ❌ **无钉钉OAuth适配层**：需要实现DingTalkOAuthService
2. ❌ **无统一OAuth抽象**：飞书和钉钉代码耦合，无法复用
3. ❌ **无钉钉用户数据结构**：需要设计dingtalk_user_id字段
4. ❌ **无平台识别机制**：无法区分用户来自飞书还是钉钉
5. ❌ **无钉钉Mock开发支持**：影响本地开发和测试

---

## 🔧 GAP分析：配置

### 当前配置结构（单平台）

#### 租户配置 (config/tenants/CIIBER.yml)
```yaml
feishu:
  app_id: "cli_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
  app_secret: "feishu_app_secret_32_chars_v1"
  encrypt_key: "DoZ9NxC523OFphRtNnPdHDjk3OUHtsNZ"
  oauth_redirect_uri: "https://ciiber.example.com/api/auth/feishu/callback"
  event_callback_url: "${FEISHU_EVENT_CALLBACK_URL:-https://localhost/api/feishu/events}"
  api_base_url: "${FEISHU_API_BASE_URL:-https://open.feishu.cn}"
```

#### 环境变量 (.env.production)
```env
FEISHU_APP_ID=cli_xxxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxx
FEISHU_ENCRYPT_KEY=DoZ9NxC523OFphRtNnPdHDjk3OUHtsNZ
FEISHU_REDIRECT_URI=https://your-domain.com/oauth/callback
```

### 目标配置结构（双平台）

#### 租户配置 (config/tenants/CIIBER.yml)
```yaml
# OAuth平台配置
oauth:
  # 启用的平台：feishu, dingtalk, 或 both
  enabled_platforms:
    - feishu
    - dingtalk

  # 默认登录平台（用户未选择时）
  default_platform: "feishu"

feishu:
  app_id: "cli_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
  app_secret: "feishu_app_secret_32_chars_v1"
  encrypt_key: "DoZ9NxC523OFphRtNnPdHDjk3OUHtsNZ"
  oauth_redirect_uri: "https://ciiber.example.com/oauth/callback"
  event_callback_url: "${FEISHU_EVENT_CALLBACK_URL:-https://localhost/api/feishu/events}"
  api_base_url: "${FEISHU_API_BASE_URL:-https://open.feishu.cn}"

dingtalk:
  app_id: "dingxxxxxxxxxxxxxxxx"
  app_secret: "dingtalk_app_secret_32_chars_v1"
  encrypt_key: "DingTalkEncryptKey32CharsHere123456"
  oauth_redirect_uri: "https://ciiber.example.com/oauth/callback"
  event_callback_url: "${DINGTALK_EVENT_CALLBACK_URL:-https://localhost/api/dingtalk/events}"
  api_base_url: "${DINGTALK_API_BASE_URL:-https://api.dingtalk.com}"
  # 钉钉特有配置
  corp_id: "dingxxxxxxxxxxxxxxxx"  # 企业ID
  sso_enabled: "${DINGTALK_SSO_ENABLED:-false}"  # 是否启用SSO
```

#### 环境变量 (.env.production)
```env
# 飞书配置
FEISHU_APP_ID=cli_xxxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxx
FEISHU_ENCRYPT_KEY=DoZ9NxC523OFphRtNnPdHDjk3OUHtsNZ
FEISHU_REDIRECT_URI=https://your-domain.com/oauth/callback

# 钉钉配置
DINGTALK_APP_ID=dingxxxxxxxxxxxxxxxx
DINGTALK_APP_SECRET=dingtalk_app_secret_32_chars_v1
DINGTALK_ENCRYPT_KEY=DingTalkEncryptKey32CharsHere123456
DINGTALK_REDIRECT_URI=https://your-domain.com/oauth/callback
DINGTALK_CORP_ID=dingxxxxxxxxxxxxxxxx

# OAuth配置
OAUTH_ENABLED_PLATFORMS=feishu,dingtalk
OAUTH_DEFAULT_PLATFORM=feishu
```

### 配置GAP总结
**关键差距**：
1. ❌ **无平台选择配置**：无法配置启用哪个OAuth平台
2. ❌ **无钉钉配置结构**：需要添加dingtalk配置块
3. ❌ **配置管理未抽象**：每个配置项独立，缺乏统一管理
4. ❌ **无多平台共存逻辑**：配置读取、路由分发未考虑多平台
5. ❌ **环境变量命名冲突**：FEISHU_*前缀不适用于钉钉

---

## 🔄 GAP分析：业务流程

### 当前业务流程（飞书专用）

```
┌─────────────────────────────────────────────────────────────┐
│ 1. 用户访问登录页面                                       │
│    - 前端调用 GET /api/oauth/authorize                    │
│    - 生成飞书授权URL                                       │
│    - 展示飞书二维码                                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. 用户使用飞书APP扫码                                    │
│    - 跳转到飞书授权页面                                    │
│    - 用户确认授权                                          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. 飞书回调到系统                                          │
│    - POST /api/oauth/callback                             │
│    - 携带 authorization_code                               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. 后端处理OAuth回调                                       │
│    a. 使用code换取access_token                            │
│    b. 调用飞书API获取用户信息                               │
│    c. 查找或创建用户记录                                   │
│    d. 生成JWT令牌                                          │
│    e. 自动认领实例（如果有可用实例）                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. 返回JWT令牌给前端                                       │
│    - access_token, refresh_token                           │
│    - 用户基本信息                                          │
│    - 实例信息                                              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. 前端存储令牌并跳转主页                                  │
│    - localStorage存储                                      │
│    - 更新认证状态                                          │
│    - 跳转到 /dashboard                                    │
└─────────────────────────────────────────────────────────────┘
```

### 目标业务流程（飞书+钉钉）

```
┌─────────────────────────────────────────────────────────────┐
│ 1. 用户访问登录页面                                       │
│    - 前端调用 GET /api/oauth/platforms                     │
│    - 获取可用的OAuth平台列表                                │
│    - 展示平台选择界面（飞书/钉钉）                           │
└─────────────────────────────────────────────────────────────┘
                            ↓
                 ┌───────────────┴───────────────┐
                 ↓                               ↓
        ┌─────────────────┐           ┌─────────────────┐
        │ 用户选择飞书     │           │ 用户选择钉钉     │
        └─────────────────┘           └─────────────────┘
                 ↓                               ↓
        ┌─────────────────┐           ┌─────────────────┐
        │ 2a. 生成飞书     │           │ 2b. 生成钉钉     │
        │    授权URL      │           │    授权URL      │
        │    展示飞书二维码 │           │    展示钉钉二维码 │
        └─────────────────┘           └─────────────────┘
                 ↓                               ↓
        ┌─────────────────┐           ┌─────────────────┐
        │ 3a. 飞书扫码授权  │           │ 3b. 钉钉扫码授权  │
        └─────────────────┘           └─────────────────┘
                 ↓                               ↓
                 └───────────────┬───────────────┘
                                 ↓
        ┌─────────────────────────────────────────┐
        │ 4. 平台回调到系统                         │
        │    - 飞书: POST /api/oauth/feishu/callback│
        │    - 钉钉: POST /api/oauth/dingtalk/callback│
        └─────────────────────────────────────────┘
                                 ↓
        ┌─────────────────────────────────────────┐
        │ 5. 后端处理OAuth回调（平台无关）         │
        │    a. 识别OAuth平台（feishu/dingtalk）   │
        │    b. 调用对应平台服务处理              │
        │    c. 标准化用户信息                    │
        │    d. 查找或创建用户记录（带平台标识）   │
        │    e. 生成JWT令牌（平台无关）            │
        │    f. 自动认领实例（平台无关）           │
        └─────────────────────────────────────────┘
                                 ↓
        ┌─────────────────────────────────────────┐
        │ 6. 返回JWT令牌给前端（平台无关）         │
        │    - access_token, refresh_token        │
        │    - 用户基本信息                       │
        │    - OAuth平台标识                      │
        │    - 实例信息                           │
        └─────────────────────────────────────────┘
                                 ↓
        ┌─────────────────────────────────────────┐
        │ 7. 前端存储令牌并跳转主页（一致体验）     │
        └─────────────────────────────────────────┘
```

### 业务流程GAP总结
**关键差距**：
1. ❌ **无平台选择步骤**：当前直接飞书，需增加平台选择界面
2. ❌ **路由未区分平台**：callback URL需要支持 /feishu/callback 和 /dingtalk/callback
3. ❌ **无平台识别机制**：回调处理中无法识别用户来自哪个平台
4. ❌ **服务未抽象**：FeishuOAuthService包含平台特定逻辑，无法复用
5. ❌ **用户数据未标准化**：飞书和钉钉用户属性需要映射到统一结构
6. ❌ **前端未抽象**：LoginPage直接硬编码飞书，需要平台选择UI

---

## 🏗️ GAP分析：架构

### 当前架构（单平台 - 飞书）

```
┌─────────────────────────────────────────────────────────────┐
│                        前端层                                 │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ LoginPage.tsx                                        │  │
│  │  - getAuthorizationUrl() → 硬编码飞书API            │  │
│  │  - handleCallback() → 处理飞书回调                  │  │
│  │  - 展示飞书二维码                                     │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                        路由层                                 │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ OAuthController.ts                                    │  │
│  │  GET  /oauth/authorize → 飞书授权URL                 │  │
│  │  POST /oauth/callback → 飞书回调处理                 │  │
│  │  POST /oauth/refresh → 刷新令牌                     │  │
│  │  POST /oauth/verify → 验证令牌                      │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                        服务层                                 │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ FeishuOAuthService.ts                                 │  │
│  │  - getAuthorizationUrl()                              │  │
│  │  - handleCallback()                                   │  │
│  │  - exchangeCodeForToken() → 飞书API                  │  │
│  │  - getUserInfo() → 飞书API                            │  │
│  │  - findOrCreateUser() → 飞书用户ID                   │  │
│  │  - generateJWT()                                      │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                        数据层                                 │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ User.entity.ts                                         │  │
│  │  - id: number (PK)                                     │  │
│  │  - feishu_user_id: string (unique)                     │  │
│  │  - feishu_union_id: string                             │  │
│  │  - name: string                                        │  │
│  │  - email: string                                       │  │
│  │  - avatar_url: string                                  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 目标架构（多平台 - 飞书+钉钉）

```
┌─────────────────────────────────────────────────────────────┐
│                        前端层                                 │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ PlatformSelectionPage.tsx (新增)                      │  │
│  │  - getEnabledPlatforms() → API调用                   │  │
│  │  - 展示平台选择界面（飞书/钉钉）                       │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ OAuthLoginPage.tsx (重构)                             │  │
│  │  - getAuthorizationUrl(platform) → 平台特定           │  │
│  │  - handleCallback(platform, code) → 平台特定          │  │
│  │  - 展示对应平台二维码                                  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                        路由层                                 │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ OAuthController.ts (重构)                             │  │
│  │  GET  /oauth/platforms → 获取启用的平台列表           │  │
│  │  GET  /oauth/authorize?platform=feishu → 飞书授权     │  │
│  │  GET  /oauth/authorize?platform=dingtalk → 钉钉授权   │  │
│  │  POST /oauth/feishu/callback → 飞书回调              │  │
│  │  POST /oauth/dingtalk/callback → 钉钉回调            │  │
│  │  POST /oauth/refresh → 统一刷新（平台无关）           │  │
│  │  POST /oauth/verify → 统一验证（平台无关）            │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                        服务层（抽象化）                        │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ IOAuthProvider (接口) - 新增                          │  │
│  │  + getAuthorizationUrl(redirectUri, state): string   │  │
│  │  + exchangeCodeForToken(code): Promise<TokenResponse>│  │
│  │  + getUserInfo(accessToken): Promise<UserProfile>   │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────┬─────────────────────────────┐  │
│  │ FeishuOAuthProvider   │ DingTalkOAuthProvider       │  │
│  │ (重构)                │ (新增)                      │  │
│  │                       │                              │  │
│  │ 实现IOAuthProvider    │ 实现IOAuthProvider          │  │
│  │                       │                              │  │
│  │ - 飞书API调用          │ - 钉钉API调用                │  │
│  │ - 飞书用户信息映射      │ - 钉钉用户信息映射           │  │
│  └───────────────────────┴─────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ OAuthService.ts (新增 - 统一编排)                    │  │
│  │  - getProvider(platform): IOAuthProvider             │  │
│  │  - handleOAuthCallback(platform, code)              │  │
│  │  - standardizeUserInfo(platform, rawInfo): UserProfile│  │
│  │  - findOrCreateUser(platform, userProfile): User    │  │
│  │  - generateJWT(user, platform): TokenResponse       │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                        数据层                                 │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ User.entity.ts (扩展)                                 │  │
│  │  - id: number (PK)                                     │  │
│  │  - oauth_platform: string (feishu/dingtalk) 新增    │  │
│  │  - feishu_user_id: string (nullable) 改为nullable    │  │
│  │  - dingtalk_user_id: string (nullable, unique) 新增  │  │
│  │  - feishu_union_id: string (nullable)                 │  │
│  │  - dingtalk_union_id: string (nullable, unique) 新增 │  │
│  │  - name: string                                        │  │
│  │  - email: string                                       │  │
│  │  - avatar_url: string                                  │  │
│  │  INDEX: idx_feishu_user_id                            │  │
│  │  INDEX: idx_dingtalk_user_id 新增                      │  │
│  │  INDEX: idx_oauth_platform (联合索引) 新增            │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 架构GAP总结
**关键差距**：
1. ❌ **无OAuth抽象接口**：需要IOAuthProvider接口定义统一契约
2. ❌ **服务层未解耦**：FeishuOAuthService包含平台特定逻辑，需要拆分
3. ❌ **无统一编排层**：需要OAuthService统一协调多平台OAuth流程
4. ❌ **数据模型未扩展**：User表不支持多平台用户ID
5. ❌ **路由未分层**：callback URL需要区分平台
6. ❌ **前端未抽象**：需要平台选择和平台参数传递

---

## 📊 技术实现优先级

### P0 - 核心功能（MVP必需）
1. **OAuth抽象层**
   - 创建IOAuthProvider接口
   - 重构FeishuOAuthService实现接口
   - 实现DingTalkOAuthProvider
   - 创建OAuthService统一编排

2. **数据模型扩展**
   - 修改User实体添加oauth_platform字段
   - 添加dingtalk_user_id和dingtalk_union_id字段
   - 创建数据库迁移脚本
   - 添加必要的唯一索引

3. **钉钉OAuth实现**
   - 实现DingTalkOAuthProvider核心方法
   - 钉钉API适配（获取用户信息）
   - 钉钉用户信息映射到标准化UserProfile

4. **路由和控制器扩展**
   - 添加GET /oauth/platforms端点
   - 修改/oauth/authorize支持platform参数
   - 添加/oauth/dingtalk/callback路由
   - 保持/oauth/callback向后兼容（默认飞书）

### P1 - 用户体验（高优先级）
1. **前端平台选择**
   - 创建PlatformSelectionPage组件
   - 重构OAuthLoginPage支持platform参数
   - 更新AuthService支持platform参数

2. **配置管理**
   - 扩展tenant配置支持enabled_platforms
   - 添加钉钉配置块
   - 环境变量支持多平台
   - 配置验证和默认值

3. **错误处理增强**
   - 钉钉特定错误码映射
   - 平台特定错误提示
   - OAuth失败重试机制

### P2 - 完善功能（中优先级）
1. **开发环境Mock**
   - 实现MockDingTalkOAuthController
   - 钉钉Mock服务器模拟
   - 本地开发测试支持

2. **监控和日志**
   - OAuth平台标识日志
   - 钉钉API调用监控
   - 平台特定指标收集

3. **文档和测试**
   - 钉钉OAuth接入文档
   - 多平台配置示例
   - 集成测试和E2E测试

---

## 🎯 实施建议

### 开发策略
1. **渐进式重构**：先抽象接口，迁移飞书，再添加钉钉
2. **向后兼容**：保持现有飞书OAuth无缝工作
3. **特性开关**：使用配置控制钉钉OAuth启用
4. **测试驱动**：为每个新组件编写单元测试

### 风险控制
1. **数据迁移**：User表字段添加使用nullable，避免破坏现有数据
2. **API兼容性**：新增路由，修改现有路由时保持兼容
3. **性能影响**：平台选择查询缓存，减少数据库压力
4. **安全性**：钉钉app_secret加密存储，token安全传输

### 验收标准
1. ✅ 钉钉用户可扫码登录并获得JWT令牌
2. ✅ 钉钉用户登录后体验与飞书完全一致
3. ✅ 飞书用户登录流程不受影响
4. ✅ 租户可配置启用哪个OAuth平台
5. ✅ 健康检查和监控正常工作

---

## 📚 附录：钉钉OAuth参考信息

### 钉钉开放平台OAuth 2.0流程

**1. 获取授权URL**
```
https://login.dingtalk.com/oauth2/auth?
  redirect_uri={encode(uri)}&
  response_type=code&
  client_id={app_key}&
  scope={scope}&
  state={state}&
  prompt=consent
```

**2. 通过授权码换取Token**
```
POST https://api.dingtalk.com/v1.0/oauth2/userAccessToken
Headers:
  Content-Type: application/json
Body:
{
  "clientId": "{app_key}",
  "code": "{auth_code}",
  "grantType": "authorization_code",
  "refreshToken": "{refresh_token}"  // 刷新时使用
}
```

**3. 获取用户信息**
```
GET https://api.dingtalk.com/v1.0/contact/users/me
Headers:
  x-acs-dingtalk-access-token: {access_token}
```

### 钉钉用户信息结构
```json
{
  "unionId": "dingxxxxxxxxxxxx",
  "userId": "manager1234",
  "name": "张三",
  "avatarUrl": "https://xxx.dingtalk.com/xxx.jpg",
  "stateCode": "active",
  "email": "zhangsan@xxx.com",
  "mobile": "13800138000",
  "deptOrderList": [...]
}
```

### 钉钉与飞书字段映射

| 标准化字段 | 飞书字段 | 钉钉字段 | 转换逻辑 |
|-----------|---------|---------|---------|
| user_id | open_id | userId | 直接映射 |
| union_id | union_id | unionId | 直接映射 |
| name | name | name | 直接映射 |
| email | email | email | 直接映射 |
| avatar_url | avatar_url | avatarUrl | 字段名转换 |
| platform | "feishu" | "dingtalk" | 固定值 |

---

**文档结束**

*本文档为Issue #23的GAP分析和需求分析，将作为后续技术设计和实现的基础。*
