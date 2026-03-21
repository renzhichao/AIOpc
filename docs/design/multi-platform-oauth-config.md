# 多平台OAuth配置管理设计文档

**文档版本**: 1.0
**创建日期**: 2026-03-21
**关联Issue**: #23
**设计状态**: 草案
**优先级**: P0

---

## 📋 文档概述

### 设计目标

本文档定义了支持飞书和钉钉双平台OAuth的配置管理方案，旨在实现：
1. **租户隔离**：每个租户可独立配置OAuth平台
2. **灵活切换**：支持飞书、钉钉、双平台三种模式
3. **安全性**：敏感信息加密存储，密钥轮换机制
4. **可维护性**：配置层次清晰，易于理解和修改
5. **向后兼容**：现有单平台配置平滑迁移

### 适用范围

- **租户管理员**：配置租户级OAuth设置
- **DevOps工程师**：部署和配置生产环境
- **开发人员**：本地开发和测试环境配置

---

## 🏗️ 配置架构设计

### 配置层次结构

```
┌─────────────────────────────────────────────────────────────┐
│  Level 1: 应用级环境变量 (.env.*)                          │
│  - 全局默认值                                             │
│  - GitHub Secrets覆盖                                     │
│  - 部署时注入                                             │
└─────────────────────────────────────────────────────────────┘
                            ↓ 优先级覆盖
┌─────────────────────────────────────────────────────────────┐
│  Level 2: 租户配置文件 (config/tenants/*.yml)             │
│  - 租户特定OAuth配置                                       │
│  - 平台启用/禁用                                          │
│  - 回调URL配置                                            │
└─────────────────────────────────────────────────────────────┘
                            ↓ 优先级覆盖
┌─────────────────────────────────────────────────────────────┐
│  Level 3: 运行时配置 (数据库/Redis)                        │
│  - 热更新配置                                             │
│  - 功能开关                                              │
│  - A/B测试配置                                           │
└─────────────────────────────────────────────────────────────┘
```

### 配置优先级规则

1. **运行时配置** > 租户配置 > 环境变量
2. **环境变量** > 租户配置默认值
3. **GitHub Secrets** > .env文件
4. **特定平台配置** > 通用OAuth配置

---

## 📁 配置文件结构

### 1. 租户配置文件 (config/tenants/*.yml)

#### 完整配置示例

```yaml
#==============================================================================
# 多平台OAuth配置
#==============================================================================

oauth:
  # 启用的OAuth平台列表
  # 支持值: [feishu], [dingtalk], [feishu, dingtalk]
  enabled_platforms:
    - feishu
    - dingtalk

  # 默认OAuth平台（用户未选择时使用）
  # 支持值: feishu, dingtalk
  default_platform: "feishu"

  # 平台切换策略
  # 支持值: auto, user_select, tenant_default
  # - auto: 自动检测（根据用户代理或URL参数）
  # - user_select: 用户手动选择
  # - tenant_default: 使用租户默认平台
  selection_strategy: "user_select"

  # OAuth回调URL（通用）
  callback:
    # 基础回调URL
    base_url: "${OAUTH_CALLBACK_BASE_URL:-https://ciiber.example.com}"
    # 平台特定路径
    feishu_path: "/api/auth/feishu/callback"
    dingtalk_path: "/api/auth/dingtalk/callback"

#==============================================================================
# 飞书OAuth配置
#==============================================================================

feishu:
  # 飞书应用ID（必需）
  app_id: "${FEISHU_APP_ID:-cli_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6}"

  # 飞书应用密钥（必需，加密存储）
  app_secret: "${FEISHU_APP_SECRET:-placeholder_feishu_secret}"

  # 加密密钥（必需）
  encrypt_key: "${FEISHU_ENCRYPT_KEY:-DoZ9NxC523OFphRtNnPdHDjk3OUHtsNZ}"

  # OAuth重定向URI（必需）
  oauth_redirect_uri: "${FEISHU_REDIRECT_URI:-https://ciiber.example.com/api/auth/feishu/callback}"

  # 事件回调URL（可选）
  event_callback_url: "${FEISHU_EVENT_CALLBACK_URL:-https://ciiber.example.com/api/feishu/events}"

  # API基础URL（可选）
  api_base_url: "${FEISHU_API_BASE_URL:-https://open.feishu.cn}"

  # OAuth授权端点
  oauth:
    authorize_url: "${FEISHU_OAUTH_AUTHORIZE_URL:-https://open.feishu.cn/open-apis/authen/v1/authorize}"
    token_url: "${FEISHU_OAUTH_TOKEN_URL:-https://open.feishu.cn/open-apis/authen/v3/oidc/access_token}"
    user_info_url: "${FEISHU_USER_INFO_URL:-https://open.feishu.cn/open-apis/authen/v1/user_info}"

  # Webhook验证令牌
  verify_token: "${FEISHU_VERIFY_TOKEN:-}"

  # 启用状态（可通过运行时配置覆盖）
  enabled: "${FEISHU_ENABLED:-true}"

#==============================================================================
# 钉钉OAuth配置
#==============================================================================

dingtalk:
  # 钉钉应用ID（必需，又称AppKey）
  app_id: "${DINGTALK_APP_ID:-dingxxxxxxxxxxxxxxxx}"

  # 钉钉应用密钥（必需，又称AppSecret，加密存储）
  app_secret: "${DINGTALK_APP_SECRET:-placeholder_dingtalk_secret}"

  # 加密密钥（必需）
  encrypt_key: "${DINGTALK_ENCRYPT_KEY:-DingTalkEncryptKey32CharsHere123456}"

  # OAuth重定向URI（必需）
  oauth_redirect_uri: "${DINGTALK_REDIRECT_URI:-https://ciiber.example.com/api/auth/dingtalk/callback}"

  # 事件回调URL（可选）
  event_callback_url: "${DINGTALK_EVENT_CALLBACK_URL:-https://ciiber.example.com/api/dingtalk/events}"

  # API基础URL（可选）
  api_base_url: "${DINGTALK_API_BASE_URL:-https://api.dingtalk.com}"

  # 企业ID（必需，用于企业内部应用）
  corp_id: "${DINGTALK_CORP_ID:-dingxxxxxxxxxxxxxxxx}"

  # OAuth授权端点
  oauth:
    authorize_url: "${DINGTALK_OAUTH_AUTHORIZE_URL:-https://login.dingtalk.com/oauth2/auth}"
    token_url: "${DINGTALK_OAUTH_TOKEN_URL:-https://api.dingtalk.com/v1.0/oauth2/userAccessToken}"
    user_info_url: "${DINGTALK_USER_INFO_URL:-https://api.dingtalk.com/v1.0/contact/users/me}"
    refresh_url: "${DINGTALK_OAUTH_REFRESH_URL:-https://api.dingtalk.com/v1.0/oauth2/refreshAccessToken}"

  # SSO配置（可选）
  sso:
    enabled: "${DINGTALK_SSO_ENABLED:-false}"
    redirect_url: "${DINGTALK_SSO_REDIRECT_URL:-}"

  # Webhook配置
  webhook:
    token: "${DINGTALK_WEBHOOK_TOKEN:-}"
    aes_key: "${DINGTALK_WEBHOOK_AES_KEY:-}"

  # 启用状态（可通过运行时配置覆盖）
  enabled: "${DINGTALK_ENABLED:-true}"

#==============================================================================
# 安全配置
#==============================================================================

security:
  # 密钥加密配置
  encryption:
    # 加密算法
    algorithm: "${ENCRYPTION_ALGORITHM:-aes-256-gcm}"
    # 密钥长度（位）
    key_length: "${ENCRYPTION_KEY_LENGTH:-256}"
    # 密钥轮换周期（天）
    rotation_days: "${ENCRYPTION_ROTATION_DAYS:-90}"

  # OAuth安全配置
  oauth:
    # state参数过期时间（秒）
    state_ttl: "${OAUTH_STATE_TTL:-600}"
    # 授权码过期时间（秒）
    code_ttl: "${OAUTH_CODE_TTL:-300}"
    # Token刷新窗口期（秒）
    refresh_window: "${OAUTH_REFRESH_WINDOW:-86400}"
    # PKCE增强（推荐启用）
    pkce_enabled: "${OAUTH_PKCE_ENABLED:-true}"

#==============================================================================
# 功能开关
#==============================================================================

features:
  # 多平台OAuth功能
  multi_platform_oauth:
    enabled: "${FEATURE_MULTI_PLATFORM_OAUTH:-true}"

  # 平台自动检测
  platform_auto_detection:
    enabled: "${FEATURE_PLATFORM_AUTO_DETECTION:-false}"

  # 用户平台记忆
  remember_platform:
    enabled: "${FEATURE_REMEMBER_PLATFORM:-true}"
    ttl: "${PLATFORM_MEMORY_TTL:-2592000}"  # 30天

  # OAuth失败降级
  oauth_fallback:
    enabled: "${FEATURE_OAUTH_FALLBACK:-true}"
    fallback_platform: "${OAUTH_FALLBACK_PLATFORM:-feishu}"
```

#### 配置字段说明

| 字段路径 | 类型 | 必需 | 说明 | 默认值 |
|---------|------|------|------|--------|
| `oauth.enabled_platforms` | array | ✅ | 启用的OAuth平台列表 | `[feishu]` |
| `oauth.default_platform` | string | ✅ | 默认OAuth平台 | `feishu` |
| `oauth.selection_strategy` | string | ❌ | 平台选择策略 | `user_select` |
| `feishu.app_id` | string | ✅ | 飞书应用ID | - |
| `feishu.app_secret` | string | ✅ | 飞书应用密钥（加密） | - |
| `feishu.encrypt_key` | string | ✅ | 飞书加密密钥 | - |
| `feishu.oauth_redirect_uri` | string | ✅ | 飞书回调URL | - |
| `dingtalk.app_id` | string | ❌ | 钉钉应用ID | - |
| `dingtalk.app_secret` | string | ❌ | 钉钉应用密钥（加密） | - |
| `dingtalk.corp_id` | string | ❌ | 钉钉企业ID | - |

---

### 2. 环境变量配置 (.env.*)

#### 生产环境配置 (.env.production)

```bash
# ============================================
# 多平台OAuth全局配置
# ============================================

# 启用的OAuth平台（逗号分隔）
OAUTH_ENABLED_PLATFORMS=feishu,dingtalk

# 默认OAuth平台
OAUTH_DEFAULT_PLATFORM=feishu

# OAuth回调基础URL
OAUTH_CALLBACK_BASE_URL=https://ciiber.example.com

# 平台选择策略
OAUTH_SELECTION_STRATEGY=user_select

# ============================================
# 飞书OAuth配置
# ============================================

# 飞书应用配置
FEISHU_APP_ID=cli_a93ce5614ce11bd6
FEISHU_APP_SECRET=feishu_prod_app_secret_placeholder_min_32_chars
FEISHU_ENCRYPT_KEY=DoZ9NxC523OFphRtNnPdHDjk3OUHtsNZ

# 飞书OAuth端点
FEISHU_REDIRECT_URI=https://ciiber.example.com/api/auth/feishu/callback
FEISHU_OAUTH_AUTHORIZE_URL=https://open.feishu.cn/open-apis/authen/v1/authorize
FEISHU_OAUTH_TOKEN_URL=https://open.feishu.cn/open-apis/authen/v3/oidc/access_token
FEISHU_USER_INFO_URL=https://open.feishu.cn/open-apis/authen/v1/user_info

# 飞书事件配置
FEISHU_EVENT_CALLBACK_URL=https://ciiber.example.com/api/feishu/events
FEISHU_VERIFY_TOKEN=feishu_verify_token_min_32_chars_here
FEISHU_ENCRYPT_KEY=DoZ9NxC523OFphRtNnPdHDjk3OUHtsNZ

# 飞书API配置
FEISHU_API_BASE_URL=https://open.feishu.cn

# 飞书启用状态
FEISHU_ENABLED=true

# ============================================
# 钉钉OAuth配置
# ============================================

# 钉钉应用配置
DINGTALK_APP_ID=dingxxxxxxxxxxxxxxxx
DINGTALK_APP_SECRET=dingtalk_prod_app_secret_placeholder_min_32_chars
DINGTALK_ENCRYPT_KEY=DingTalkEncryptKey32CharsHere123456

# 钉钉企业ID
DINGTALK_CORP_ID=dingxxxxxxxxxxxxxxxx

# 钉钉OAuth端点
DINGTALK_REDIRECT_URI=https://ciiber.example.com/api/auth/dingtalk/callback
DINGTALK_OAUTH_AUTHORIZE_URL=https://login.dingtalk.com/oauth2/auth
DINGTALK_OAUTH_TOKEN_URL=https://api.dingtalk.com/v1.0/oauth2/userAccessToken
DINGTALK_USER_INFO_URL=https://api.dingtalk.com/v1.0/contact/users/me
DINGTALK_OAUTH_REFRESH_URL=https://api.dingtalk.com/v1.0/oauth2/refreshAccessToken

# 钉钉事件配置
DINGTALK_EVENT_CALLBACK_URL=https://ciiber.example.com/api/dingtalk/events
DINGTALK_WEBHOOK_TOKEN=dingtalk_webhook_token_min_32_chars
DINGTALK_WEBHOOK_AES_KEY=dingtalk_aes_key_min_43_chars_here

# 钉钉API配置
DINGTALK_API_BASE_URL=https://api.dingtalk.com

# 钉钉SSO配置
DINGTALK_SSO_ENABLED=false
DINGTALK_SSO_REDIRECT_URL=

# 钉钉启用状态
DINGTALK_ENABLED=true

# ============================================
# OAuth安全配置
# ============================================

# 加密配置
ENCRYPTION_ALGORITHM=aes-256-gcm
ENCRYPTION_KEY_LENGTH=256
ENCRYPTION_ROTATION_DAYS=90

# OAuth安全参数
OAUTH_STATE_TTL=600
OAUTH_CODE_TTL=300
OAUTH_REFRESH_WINDOW=86400
OAUTH_PKCE_ENABLED=true

# ============================================
# 功能开关
# ============================================

# 多平台OAuth功能
FEATURE_MULTI_PLATFORM_OAUTH=true

# 平台自动检测
FEATURE_PLATFORM_AUTO_DETECTION=false

# 用户平台记忆
FEATURE_REMEMBER_PLATFORM=true
PLATFORM_MEMORY_TTL=2592000

# OAuth失败降级
FEATURE_OAUTH_FALLBACK=true
OAUTH_FALLBACK_PLATFORM=feishu

# ============================================
# 开发/测试配置（生产环境必须为false）
# ============================================

# Mock OAuth（生产必须为false）
MOCK_OAUTH_ENABLED=false
MOCK_OAUTH_PLATFORM=feishu

# 调试模式（生产必须为false）
DEBUG_MODE=false
```

#### 开发环境配置 (.env.development)

```bash
# 开发环境默认只启用飞书Mock
OAUTH_ENABLED_PLATFORMS=feishu
OAUTH_DEFAULT_PLATFORM=feishu

# 启用Mock OAuth（开发环境）
MOCK_OAUTH_ENABLED=true
MOCK_OAUTH_PLATFORM=feishu

# 使用占位符配置（开发环境）
FEISHU_APP_ID=cli_mock0000000000
FEISHU_APP_SECRET=mock_feishu_secret_for_development_only
FEISHU_ENCRYPT_KEY=mock_encrypt_key_32_chars_for_dev_only

# 本地开发URL
FEISHU_REDIRECT_URI=http://localhost:3000/api/auth/feishu/callback
OAUTH_CALLBACK_BASE_URL=http://localhost:3000

# 调试模式
DEBUG_MODE=true
LOG_LEVEL=debug
```

---

## 🔐 密钥管理方案

### 密钥加密存储

#### 加密策略

1. **应用密钥加密**：`app_secret` 使用AES-256-GCM加密后存储
2. **密钥层次**：
   ```
   Master Key (GitHub Secrets / KMS)
      ↓
   Data Encryption Key (DEK)
      ↓
   Encrypted app_secret
   ```

#### 加密实现

```typescript
// platform/backend/src/utils/encryption.ts

import crypto from 'crypto';

export class EncryptionService {
  private algorithm = 'aes-256-gcm';
  private keyLength = 32; // 256 bits
  private ivLength = 16;  // 128 bits
  private saltLength = 64;
  private tagLength = 16;

  constructor(private masterKey: string) {
    if (!masterKey || masterKey.length < 32) {
      throw new Error('Master key must be at least 32 characters');
    }
  }

  /**
   * 加密敏感数据（如app_secret）
   */
  encrypt(plaintext: string): string {
    // 生成随机salt和IV
    const salt = crypto.randomBytes(this.saltLength);
    const iv = crypto.randomBytes(this.ivLength);

    // 从master key派生加密密钥
    const key = crypto.pbkdf2Sync(
      this.masterKey,
      salt,
      100000,  // 迭代次数
      this.keyLength,
      'sha256'
    );

    // 加密
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);
    let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');

    // 获取认证标签
    const tag = cipher.getAuthTag();

    // 组合: salt + iv + tag + ciphertext
    return [
      salt.toString('hex'),
      iv.toString('hex'),
      tag.toString('hex'),
      ciphertext
    ].join(':');
  }

  /**
   * 解密敏感数据
   */
  decrypt(encrypted: string): string {
    const [saltHex, ivHex, tagHex, ciphertext] = encrypted.split(':');

    const salt = Buffer.from(saltHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');

    // 从master key派生解密密钥
    const key = crypto.pbkdf2Sync(
      this.masterKey,
      salt,
      100000,
      this.keyLength,
      'sha256'
    );

    // 解密
    const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
    decipher.setAuthTag(tag);

    let plaintext = decipher.update(ciphertext, 'hex', 'utf8');
    plaintext += decipher.final('utf8');

    return plaintext;
  }
}
```

#### 密钥轮换机制

```typescript
// platform/backend/src/services/KeyRotationService.ts

export class KeyRotationService {
  private rotationIntervalDays = 90;

  /**
   * 检查密钥是否需要轮换
   */
  async shouldRotateKey(tenantId: string, platform: string): Promise<boolean> {
    const lastRotation = await this.getLastRotationDate(tenantId, platform);
    const daysSinceRotation = this.daysBetween(lastRotation, new Date());
    return daysSinceRotation >= this.rotationIntervalDays;
  }

  /**
   * 轮换应用密钥
   */
  async rotateAppSecret(
    tenantId: string,
    platform: string,
    newSecret: string
  ): Promise<void> {
    // 1. 验证新密钥格式
    this.validateSecretFormat(platform, newSecret);

    // 2. 使用当前密钥加密新密钥
    const encryptedSecret = this.encryptionService.encrypt(newSecret);

    // 3. 更新配置（原子操作）
    await this.updateTenantConfig(tenantId, platform, {
      app_secret: encryptedSecret,
      last_rotated_at: new Date(),
    });

    // 4. 记录审计日志
    await this.auditLogService.record({
      action: 'KEY_ROTATION',
      tenant_id: tenantId,
      platform: platform,
      timestamp: new Date(),
    });

    // 5. 发送告警通知
    await this.notificationService.sendKeyRotatedAlert(tenantId, platform);
  }

  /**
   * 批量轮换（用于计划任务）
   */
  async batchRotateDueKeys(): Promise<void> {
    const tenants = await this.getAllTenants();

    for (const tenant of tenants) {
      for (const platform of tenant.oauth.enabled_platforms) {
        if (await this.shouldRotateKey(tenant.id, platform)) {
          // 生成新密钥或从GitHub Secrets获取
          const newSecret = await this.getNewSecret(tenant.id, platform);
          await this.rotateAppSecret(tenant.id, platform, newSecret);
        }
      }
    }
  }
}
```

### GitHub Secrets集成

#### 必需的GitHub Secrets

| Secret名称 | 说明 | 示例值 | 必需 |
|-----------|------|--------|------|
| `ENCRYPTION_MASTER_KEY` | 主加密密钥 | 64位随机字符串 | ✅ |
| `FEISHU_APP_ID` | 飞书应用ID | `cli_xxx` | ✅ |
| `FEISHU_APP_SECRET` | 飞书应用密钥 | 32+位字符串 | ✅ |
| `DINGTALK_APP_ID` | 钉钉应用ID | `ding_xxx` | ❌ |
| `DINGTALK_APP_SECRET` | 钉钉应用密钥 | 32+位字符串 | ❌ |
| `DINGTALK_CORP_ID` | 钉钉企业ID | `ding_xxx` | ❌ |

#### 配置加载流程

```typescript
// platform/backend/src/config/OAuthConfigLoader.ts

export class OAuthConfigLoader {
  async loadTenantConfig(tenantId: string): Promise<TenantOAuthConfig> {
    // 1. 加载租户YAML配置
    const yamlConfig = await this.loadYamlConfig(tenantId);

    // 2. 加载环境变量（优先级高于YAML）
    const envConfig = this.loadEnvConfig();

    // 3. 加载GitHub Secrets（优先级最高）
    const secretsConfig = await this.loadGitHubSecrets();

    // 4. 合并配置（按优先级）
    const mergedConfig = this.mergeConfigs({
      yaml: yamlConfig,
      env: envConfig,
      secrets: secretsConfig,
    });

    // 5. 解密敏感字段
    const decryptedConfig = await this.decryptSensitiveFields(mergedConfig);

    // 6. 验证配置完整性
    await this.validateConfig(decryptedConfig);

    return decryptedConfig;
  }

  private mergeConfigs(sources: ConfigSources): TenantOAuthConfig {
    return {
      oauth: {
        enabled_platforms:
          sources.secrets.oauth?.enabled_platforms ??
          sources.env.oauth?.enabled_platforms ??
          sources.yaml.oauth.enabled_platforms,
        default_platform:
          sources.secrets.oauth?.default_platform ??
          sources.env.oauth?.default_platform ??
          sources.yaml.oauth.default_platform,
      },
      feishu: {
        app_id:
          sources.secrets.feishu?.app_id ??
          sources.env.feishu?.app_id ??
          sources.yaml.feishu.app_id,
        app_secret: sources.secrets.feishu?.app_secret ?? sources.yaml.feishu.app_secret,
        // ... 其他字段
      },
      dingtalk: {
        // ... 类似逻辑
      },
    };
  }
}
```

---

## ✅ 配置验证规则

### 验证层次

#### 1. 启用前验证（配置加载时）

```typescript
// platform/backend/src/validation/OAuthConfigValidator.ts

export class OAuthConfigValidator {
  /**
   * 验证租户OAuth配置
   */
  async validateTenantConfig(config: TenantOAuthConfig): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // 1. 验证启用平台配置
    this.validateEnabledPlatforms(config, errors, warnings);

    // 2. 验证默认平台配置
    this.validateDefaultPlatform(config, errors, warnings);

    // 3. 验证每个启用平台的配置完整性
    for (const platform of config.oauth.enabled_platforms) {
      await this.validatePlatformConfig(config, platform, errors, warnings);
    }

    // 4. 验证URL格式
    this.validateUrls(config, errors);

    // 5. 验证密钥强度
    this.validateKeyStrength(config, warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private validateEnabledPlatforms(
    config: TenantOAuthConfig,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    const { enabled_platforms } = config.oauth;

    // 必须至少启用一个平台
    if (!enabled_platforms || enabled_platforms.length === 0) {
      errors.push({
        field: 'oauth.enabled_platforms',
        message: '至少必须启用一个OAuth平台',
        severity: 'critical',
      });
      return;
    }

    // 检查平台名称有效性
    const validPlatforms = ['feishu', 'dingtalk'];
    const invalidPlatforms = enabled_platforms.filter(p => !validPlatforms.includes(p));

    if (invalidPlatforms.length > 0) {
      errors.push({
        field: 'oauth.enabled_platforms',
        message: `不支持的平台: ${invalidPlatforms.join(', ')}`,
        severity: 'error',
        supported_values: validPlatforms,
      });
    }

    // 双平台配置建议
    if (enabled_platforms.length > 1) {
      warnings.push({
        field: 'oauth.enabled_platforms',
        message: '多平台配置需要确保所有平台配置完整',
        severity: 'info',
      });
    }
  }

  private async validatePlatformConfig(
    config: TenantOAuthConfig,
    platform: string,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): Promise<void> {
    const platformConfig = config[platform];

    if (!platformConfig) {
      errors.push({
        field: platform,
        message: `启用了${platform}平台但缺少配置`,
        severity: 'critical',
      });
      return;
    }

    // 验证必需字段
    const requiredFields = this.getRequiredFields(platform);
    for (const field of requiredFields) {
      if (!platformConfig[field]) {
        errors.push({
          field: `${platform}.${field}`,
          message: `缺少必需配置: ${platform}.${field}`,
          severity: 'error',
        });
      }
    }

    // 平台特定验证
    switch (platform) {
      case 'feishu':
        await this.validateFeishuConfig(platformConfig, errors, warnings);
        break;
      case 'dingtalk':
        await this.validateDingtalkConfig(platformConfig, errors, warnings);
        break;
    }
  }

  private async validateFeishuConfig(
    config: FeishuOAuthConfig,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): Promise<void> {
    // 验证app_id格式
    if (!config.app_id.match(/^cli_[a-z0-9]{24,}$/)) {
      errors.push({
        field: 'feishu.app_id',
        message: '飞书app_id格式不正确，应为cli_开头的24+位字符',
        severity: 'error',
        pattern: '^cli_[a-z0-9]{24,}$',
      });
    }

    // 验证app_secret长度
    if (config.app_secret && config.app_secret.length < 32) {
      errors.push({
        field: 'feishu.app_secret',
        message: '飞书app_secret长度不足，最少32字符',
        severity: 'error',
        min_length: 32,
      });
    }

    // 验证回调URL
    if (!config.oauth_redirect_uri) {
      errors.push({
        field: 'feishu.oauth_redirect_uri',
        message: '缺少飞书OAuth回调URL配置',
        severity: 'error',
      });
    }
  }

  private async validateDingtalkConfig(
    config: DingtalkOAuthConfig,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): Promise<void> {
    // 验证app_id格式
    if (!config.app_id.match(/^ding[a-z0-9]{16,}$/)) {
      errors.push({
        field: 'dingtalk.app_id',
        message: '钉钉app_id格式不正确，应为ding开头的16+位字符',
        severity: 'error',
        pattern: '^ding[a-z0-9]{16,}$',
      });
    }

    // 验证corp_id（企业内部应用必需）
    if (config.sso?.enabled && !config.corp_id) {
      errors.push({
        field: 'dingtalk.corp_id',
        message: '启用SSO时必须配置corp_id',
        severity: 'error',
      });
    }
  }

  private validateKeyStrength(
    config: TenantOAuthConfig,
    warnings: ValidationWarning[]
  ): void {
    // 检查密钥强度
    const checkStrength = (key: string, field: string) => {
      if (!key || key.length < 32) {
        warnings.push({
          field,
          message: '密钥长度不足，建议使用32位以上强密钥',
          severity: 'warning',
          recommended_length: 32,
        });
      }
    };

    if (config.feishu?.encrypt_key) {
      checkStrength(config.feishu.encrypt_key, 'feishu.encrypt_key');
    }

    if (config.dingtalk?.encrypt_key) {
      checkStrength(config.dingtalk.encrypt_key, 'dingtalk.encrypt_key');
    }
  }

  private getRequiredFields(platform: string): string[] {
    const requiredFieldsMap = {
      feishu: ['app_id', 'app_secret', 'encrypt_key', 'oauth_redirect_uri'],
      dingtalk: ['app_id', 'app_secret', 'encrypt_key', 'oauth_redirect_uri'],
    };

    return requiredFieldsMap[platform] || [];
  }
}
```

#### 2. 运行时验证（OAuth请求时）

```typescript
// platform/backend/src/middleware/OAuthValidationMiddleware.ts

export class OAuthValidationMiddleware {
  /**
   * 验证OAuth请求的配置完整性
   */
  async validateOAuthRequest(
    tenantId: string,
    platform: string
  ): Promise<void> {
    // 1. 检查平台是否启用
    const enabledPlatforms = await this.getEnabledPlatforms(tenantId);
    if (!enabledPlatforms.includes(platform)) {
      throw new OAuthConfigError(
        `平台 ${platform} 未启用`,
        'PLATFORM_NOT_ENABLED',
        { tenant_id: tenantId, platform }
      );
    }

    // 2. 检查平台配置完整性
    const config = await this.getPlatformConfig(tenantId, platform);
    const missingFields = this.findMissingRequiredFields(platform, config);

    if (missingFields.length > 0) {
      throw new OAuthConfigError(
        `平台 ${platform} 配置不完整，缺少: ${missingFields.join(', ')}`,
        'INCOMPLETE_PLATFORM_CONFIG',
        {
          tenant_id: tenantId,
          platform,
          missing_fields: missingFields,
        }
      );
    }

    // 3. 验证回调URL可访问性
    const callbackUrl = config.oauth_redirect_uri;
    const isAccessible = await this.checkUrlAccessible(callbackUrl);

    if (!isAccessible) {
      throw new OAuthConfigError(
        `OAuth回调URL不可访问: ${callbackUrl}`,
        'CALLBACK_URL_NOT_ACCESSIBLE',
        { tenant_id: tenantId, platform, callback_url: callbackUrl }
      );
    }
  }
}
```

#### 3. 环境差异验证

```typescript
// platform/backend/src/validation/EnvironmentValidator.ts

export class EnvironmentValidator {
  /**
   * 验证环境配置与环境的匹配性
   */
  async validateEnvironmentConfig(
    config: TenantOAuthConfig,
    environment: 'production' | 'development' | 'staging'
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // 生产环境特殊检查
    if (environment === 'production') {
      // 禁止Mock OAuth
      if (config.features?.mock_oauth_enabled) {
        errors.push({
          field: 'features.mock_oauth_enabled',
          message: '生产环境禁止启用Mock OAuth',
          severity: 'critical',
        });
      }

      // 禁止调试模式
      if (config.debug_mode) {
        errors.push({
          field: 'debug_mode',
          message: '生产环境禁止启用调试模式',
          severity: 'critical',
        });
      }

      // 强制HTTPS
      for (const platform of config.oauth.enabled_platforms) {
        const callbackUrl = config[platform].oauth_redirect_uri;
        if (!callbackUrl.startsWith('https://')) {
          errors.push({
            field: `${platform}.oauth_redirect_uri`,
            message: '生产环境OAuth回调URL必须使用HTTPS',
            severity: 'error',
            callback_url: callbackUrl,
          });
        }
      }
    }

    // 开发环境检查
    if (environment === 'development') {
      // 建议启用Mock OAuth
      if (!config.features?.mock_oauth_enabled) {
        warnings.push({
          field: 'features.mock_oauth_enabled',
          message: '开发环境建议启用Mock OAuth',
          severity: 'info',
        });
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}
```

### 错误处理

```typescript
// platform/backend/src/errors/OAuthConfigError.ts

export class OAuthConfigError extends Error {
  constructor(
    message: string,
    public code: OAuthConfigErrorCode,
    public details: Record<string, any> = {}
  ) {
    super(message);
    this.name = 'OAuthConfigError';
  }

  toJSON() {
    return {
      error: 'OAuthConfigError',
      code: this.code,
      message: this.message,
      details: this.details,
      timestamp: new Date().toISOString(),
    };
  }
}

export enum OAuthConfigErrorCode {
  // 平台配置错误
  PLATFORM_NOT_ENABLED = 'PLATFORM_NOT_ENABLED',
  INCOMPLETE_PLATFORM_CONFIG = 'INCOMPLETE_PLATFORM_CONFIG',
  INVALID_PLATFORM_CONFIG = 'INVALID_PLATFORM_CONFIG',

  // URL错误
  CALLBACK_URL_NOT_ACCESSIBLE = 'CALLBACK_URL_NOT_ACCESSIBLE',
  INVALID_CALLBACK_URL = 'INVALID_CALLBACK_URL',

  // 密钥错误
  MISSING_APP_SECRET = 'MISSING_APP_SECRET',
  WEAK_APP_SECRET = 'WEAK_APP_SECRET',
  DECRYPTION_FAILED = 'DECRYPTION_FAILED',

  // 环境错误
  PRODUCTION_MISCONFIGURATION = 'PRODUCTION_MISCONFIGURATION',
  MOCK_OAUTH_IN_PRODUCTION = 'MOCK_OAUTH_IN_PRODUCTION',
}
```

---

## 🔄 配置迁移策略

### 迁移场景

#### 场景1：现有飞书单平台 → 飞书+钉钉双平台

**迁移前（config/tenants/CIIBER.yml）**:
```yaml
feishu:
  app_id: "cli_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
  app_secret: "feishu_app_secret_32_chars_v1"
  encrypt_key: "DoZ9NxC523OFphRtNnPdHDjk3OUHtsNZ"
  oauth_redirect_uri: "https://ciiber.example.com/api/auth/feishu/callback"
```

**迁移后**:
```yaml
oauth:
  enabled_platforms:
    - feishu
    - dingtalk
  default_platform: "feishu"

feishu:
  app_id: "cli_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
  app_secret: "feishu_app_secret_32_chars_v1"
  encrypt_key: "DoZ9NxC523OFphRtNnPdHDjk3OUHtsNZ"
  oauth_redirect_uri: "https://ciiber.example.com/api/auth/feishu/callback"

dingtalk:
  app_id: "${DINGTALK_APP_ID}"
  app_secret: "${DINGTALK_APP_SECRET}"
  encrypt_key: "${DINGTALK_ENCRYPT_KEY}"
  oauth_redirect_uri: "https://ciiber.example.com/api/auth/dingtalk/callback"
  corp_id: "${DINGTALK_CORP_ID}"
```

**迁移脚本**:
```bash
#!/bin/bash
# scripts/migrate/migrate-to-multi-platform.sh

set -e

TENANT_ID=${1:-"CIIBER"}
TENANT_CONFIG="config/tenants/${TENANT_ID}.yml"
BACKUP_DIR="config/tenants/backups"

echo "========================================="
echo "多平台OAuth迁移脚本"
echo "租户: ${TENANT_ID}"
echo "========================================="

# 1. 备份现有配置
echo "📦 步骤 1/5: 备份现有配置..."
mkdir -p "${BACKUP_DIR}"
BACKUP_FILE="${BACKUP_DIR}/${TENANT_ID}_$(date +%Y%m%d_%H%M%S).yml.bak"
cp "${TENANT_CONFIG}" "${BACKUP_FILE}"
echo "✅ 配置已备份到: ${BACKUP_FILE}"

# 2. 检查当前配置
echo "🔍 步骤 2/5: 检查当前配置..."
if grep -q "^oauth:" "${TENANT_CONFIG}"; then
  echo "⚠️  检测到已存在oauth配置块，跳过迁移"
  echo "💡 如需重新迁移，请先手动恢复备份"
  exit 0
fi

if ! grep -q "^feishu:" "${TENANT_CONFIG}"; then
  echo "❌ 错误: 未找到feishu配置块"
  exit 1
fi

echo "✅ 配置检查通过"

# 3. 添加oauth配置块
echo "➕ 步骤 3/5: 添加oauth配置块..."
cat >> "${TENANT_CONFIG}" << 'EOF'

#==============================================================================
# 多平台OAuth配置（迁移脚本添加）
#==============================================================================

oauth:
  enabled_platforms:
    - feishu
    - dingtalk
  default_platform: "feishu"
  selection_strategy: "user_select"

  callback:
    base_url: "${OAUTH_CALLBACK_BASE_URL:-https://ciiber.example.com}"
    feishu_path: "/api/auth/feishu/callback"
    dingtalk_path: "/api/auth/dingtalk/callback"

EOF

echo "✅ oauth配置块已添加"

# 4. 添加钉钉配置块（占位符）
echo "➕ 步骤 4/5: 添加钉钉配置块..."
cat >> "${TENANT_CONFIG}" << 'EOF'

#==============================================================================
# 钉钉OAuth配置（迁移脚本添加）
#==============================================================================

dingtalk:
  app_id: "${DINGTALK_APP_ID:-dingxxxxxxxxxxxxxxxx}"
  app_secret: "${DINGTALK_APP_SECRET:-placeholder_dingtalk_secret}"
  encrypt_key: "${DINGTALK_ENCRYPT_KEY:-DingTalkEncryptKey32CharsHere123456}"
  oauth_redirect_uri: "${DINGTALK_REDIRECT_URI:-https://ciiber.example.com/api/auth/dingtalk/callback}"
  event_callback_url: "${DINGTALK_EVENT_CALLBACK_URL:-https://ciiber.example.com/api/dingtalk/events}"
  api_base_url: "${DINGTALK_API_BASE_URL:-https://api.dingtalk.com}"
  corp_id: "${DINGTALK_CORP_ID:-dingxxxxxxxxxxxxxxxx}"

  oauth:
    authorize_url: "${DINGTALK_OAUTH_AUTHORIZE_URL:-https://login.dingtalk.com/oauth2/auth}"
    token_url: "${DINGTALK_OAUTH_TOKEN_URL:-https://api.dingtalk.com/v1.0/oauth2/userAccessToken}"
    user_info_url: "${DINGTALK_USER_INFO_URL:-https://api.dingtalk.com/v1.0/contact/users/me}"
    refresh_url: "${DINGTALK_OAUTH_REFRESH_URL:-https://api.dingtalk.com/v1.0/oauth2/refreshAccessToken}"

  sso:
    enabled: "${DINGTALK_SSO_ENABLED:-false}"
    redirect_url: "${DINGTALK_SSO_REDIRECT_URL:-}"

  webhook:
    token: "${DINGTALK_WEBHOOK_TOKEN:-}"
    aes_key: "${DINGTALK_WEBHOOK_AES_KEY:-}"

  enabled: "${DINGTALK_ENABLED:-true}"

EOF

echo "✅ 钉钉配置块已添加"

# 5. 验证迁移后的配置
echo "🔍 步骤 5/5: 验证迁移后的配置..."
if ! command -v yamllint &> /dev/null; then
  echo "⚠️  yamllint未安装，跳过YAML语法验证"
else
  if yamllint "${TENANT_CONFIG}"; then
    echo "✅ YAML语法验证通过"
  else
    echo "❌ YAML语法验证失败"
    echo "💡 恢复备份: cp ${BACKUP_FILE} ${TENANT_CONFIG}"
    exit 1
  fi
fi

echo ""
echo "========================================="
echo "✅ 迁移完成！"
echo "========================================="
echo ""
echo "📋 后续步骤:"
echo "1. 配置钉钉应用凭证（环境变量或GitHub Secrets）:"
echo "   - DINGTALK_APP_ID"
echo "   - DINGTALK_APP_SECRET"
echo "   - DINGTALK_CORP_ID"
echo ""
echo "2. 更新环境变量文件 (.env.production):"
echo "   cp .env.production.example .env.production"
echo "   # 编辑.env.production，填入钉钉配置"
echo ""
echo "3. 验证配置:"
echo "   npm run config:validate -- --tenant=${TENANT_ID}"
echo ""
echo "4. 测试钉钉OAuth:"
echo "   npm run test:oauth -- --platform=dingtalk"
echo ""
echo "📁 备份位置: ${BACKUP_FILE}"
echo ""
```

#### 场景2：双平台 → 仅钉钉

```bash
#!/bin/bash
# scripts/migrate/disable-feishu-enable-dingtalk.sh

TENANT_ID=${1:-"CIIBER"}
TENANT_CONFIG="config/tenants/${TENANT_ID}.yml"

# 使用yq工具修改配置
yq eval '.oauth.enabled_platforms = ["dingtalk"] | .oauth.default_platform = "dingtalk"' \
  -i "${TENANT_CONFIG}"

# 禁用飞书配置
yq eval '.feishu.enabled = "false"' -i "${TENANT_CONFIG}"

echo "✅ 已切换到钉钉单平台模式"
```

---

## 🏢 租户配置最佳实践

### 新租户配置清单

#### 步骤1：创建租户配置文件

```bash
# 1. 复制模板
cp config/tenants/template.yml config/tenants/NEW_TENANT.yml

# 2. 编辑基本配置
vim config/tenants/NEW_TENANT.yml
```

#### 步骤2：配置OAuth平台

**仅飞书**:
```yaml
oauth:
  enabled_platforms:
    - feishu
  default_platform: "feishu"
```

**仅钉钉**:
```yaml
oauth:
  enabled_platforms:
    - dingtalk
  default_platform: "dingtalk"
```

**双平台**:
```yaml
oauth:
  enabled_platforms:
    - feishu
    - dingtalk
  default_platform: "feishu"  # 或 "dingtalk"
```

#### 步骤3：配置环境变量

```bash
# 飞书环境变量
FEISHU_APP_ID=cli_xxxxxxxxxxxxx
FEISHU_APP_SECRET=feishu_app_secret_min_32_chars
FEISHU_ENCRYPT_KEY=feishu_encrypt_key_32_chars
FEISHU_REDIRECT_URI=https://tenant.example.com/api/auth/feishu/callback

# 钉钉环境变量（如果启用）
DINGTALK_APP_ID=dingxxxxxxxxxxxxxxxx
DINGTALK_APP_SECRET=dingtalk_app_secret_min_32_chars
DINGTALK_ENCRYPT_KEY=dingtalk_encrypt_key_32_chars
DINGTALK_CORP_ID=dingxxxxxxxxxxxxxxxx
DINGTALK_REDIRECT_URI=https://tenant.example.com/api/auth/dingtalk/callback
```

#### 步骤4：配置GitHub Secrets

```bash
# 使用GitHub CLI设置Secrets
gh secret set ENCRYPTION_MASTER_KEY --body "64_chars_master_key"
gh secret set FEISHU_APP_ID --body "cli_xxx"
gh secret set FEISHU_APP_SECRET --body "feishu_secret"

# 钉钉Secrets（如果启用）
gh secret set DINGTALK_APP_ID --body "ding_xxx"
gh secret set DINGTALK_APP_SECRET --body "dingtalk_secret"
gh secret set DINGTALK_CORP_ID --body "ding_xxx"
```

#### 步骤5：验证配置

```bash
# 验证YAML语法
yamllint config/tenants/NEW_TENANT.yml

# 验证配置完整性
npm run config:validate -- --tenant=NEW_TENANT

# 测试OAuth连接
npm run test:oauth -- --tenant=NEW_TENANT --platform=feishu
npm run test:oauth -- --tenant=NEW_TENANT --platform=dingtalk
```

### 配置模板管理

#### 生产租户模板

```yaml
# config/tenants/templates/production-dual-platform.yml

oauth:
  enabled_platforms:
    - feishu
    - dingtalk
  default_platform: "feishu"
  selection_strategy: "user_select"

feishu:
  app_id: "${FEISHU_APP_ID}"
  app_secret: "${FEISHU_APP_SECRET}"
  encrypt_key: "${FEISHU_ENCRYPT_KEY}"
  oauth_redirect_uri: "${FEISHU_REDIRECT_URI}"

dingtalk:
  app_id: "${DINGTALK_APP_ID}"
  app_secret: "${DINGTALK_APP_SECRET}"
  encrypt_key: "${DINGTALK_ENCRYPT_KEY}"
  oauth_redirect_uri: "${DINGTALK_REDIRECT_URI}"
  corp_id: "${DINGTALK_CORP_ID}"

security:
  encryption:
    algorithm: "aes-256-gcm"
    rotation_days: 90
```

#### 开发租户模板

```yaml
# config/tenants/templates/development-mock.yml

oauth:
  enabled_platforms:
    - feishu
  default_platform: "feishu"

feishu:
  app_id: "cli_mock0000000000"
  app_secret: "mock_secret_for_development_only"
  encrypt_key: "mock_encrypt_key_32_chars_for_dev"

features:
  mock_oauth_enabled: true
  debug_mode: true
```

---

## 🔧 运维场景处理

### 场景1：新租户配置双平台OAuth

**操作步骤**:

1. **创建租户配置**:
```bash
./scripts/tenant/create-tenant.sh --id=NEW_TENANT --platforms=feishu,dingtalk
```

2. **配置GitHub Secrets**:
```bash
./scripts/config/setup-secrets.sh --tenant=NEW_TENANT --platform=feishu
./scripts/config/setup-secrets.sh --tenant=NEW_TENANT --platform=dingtalk
```

3. **验证配置**:
```bash
./scripts/config/validate-config.sh --tenant=NEW_TENANT
```

4. **部署应用**:
```bash
./scripts/deploy/deploy-backend.sh --tenant=NEW_TENANT --env=production
```

### 场景2：临时禁用某个OAuth平台

**操作步骤**:

1. **修改配置**:
```bash
# 方法1: 修改环境变量
export FEISHU_ENABLED=false

# 方法2: 修改租户配置
yq eval '.feishu.enabled = "false"' -i config/tenants/TENANT.yml
```

2. **热更新配置**（无需重启）:
```bash
curl -X POST http://localhost:3000/api/admin/config/reload \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -d '{"tenant_id": "TENANT"}'
```

3. **验证**:
```bash
curl http://localhost:3000/api/oauth/platforms?tenant_id=TENANT
# 应该不返回被禁用的平台
```

### 场景3：配置错误恢复

**错误示例**: OAuth回调URL配置错误

**恢复步骤**:

1. **识别错误**:
```bash
# 查看日志
docker logs opclaw-backend --tail 100 | grep "OAuth"

# 验证配置
./scripts/config/validate-config.sh --tenant=TENANT
```

2. **恢复备份**:
```bash
# 找到最近的备份
ls -lt config/tenants/backups/TENANT_*.bak

# 恢复
cp config/tenants/backups/TENANT_20260320_120000.yml.bak \
   config/tenants/TENANT.yml
```

3. **修正错误**:
```bash
# 编辑配置
vim config/tenants/TENANT.yml

# 重新验证
./scripts/config/validate-config.sh --tenant=TENANT
```

4. **重新加载配置**:
```bash
curl -X POST http://localhost:3000/api/admin/config/reload \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

### 场景4：密钥轮换

**操作步骤**:

1. **生成新密钥**:
```bash
# 生成新的app_secret
openssl rand -base64 32

# 或使用钉钉/飞书控制台生成
```

2. **更新配置**:
```bash
# 更新GitHub Secret
gh secret set FEISHU_APP_SECRET --body "new_secret"

# 或更新环境变量
export FEISHU_APP_SECRET=new_secret
```

3. **执行轮换**:
```bash
./scripts/security/rotate-secret.sh \
  --tenant=TENANT \
  --platform=feishu \
  --secret=app_secret
```

4. **验证**:
```bash
# 测试OAuth流程
./scripts/test/test-oauth.sh --tenant=TENANT --platform=feishu
```

---

## 📊 监控指标和告警规则

### 关键监控指标

#### OAuth配置健康指标

| 指标名称 | 类型 | 描述 | 告警阈值 |
|---------|------|------|---------|
| `oauth_config_validation_failed` | Counter | 配置验证失败次数 | > 0 |
| `oauth_platform_disabled` | Gauge | 被禁用的OAuth平台数量 | = 2 (全部禁用) |
| `oauth_callback_unreachable` | Gauge | 回调URL不可达的平台数量 | > 0 |
| `oauth_secret_expiry_days` | Gauge | 密钥到期天数 | < 7 |
| `oauth_config_drift_detected` | Counter | 配置漂移检测次数 | > 0 |

#### OAuth性能指标

| 指标名称 | 类型 | 描述 | 告警阈值 |
|---------|------|------|---------|
| `oauth_request_duration_seconds` | Histogram | OAuth请求处理时间 | p95 > 5s |
| `oauth_callback_success_rate` | Gauge | OAuth回调成功率 | < 95% |
| `oauth_token_refresh_success_rate` | Gauge | Token刷新成功率 | < 90% |

#### OAuth业务指标

| 指标名称 | 类型 | 描述 | 告警阈值 |
|---------|------|------|---------|
| `oauth_login_attempts_total` | Counter | 登录尝试总数（按平台） | - |
| `oauth_login_success_rate` | Gauge | 登录成功率（按平台） | < 80% |
| `oauth_active_users_total` | Gauge | 活跃用户数（按平台） | - |

### Prometheus告警规则

```yaml
# platform/monitoring/prometheus/rules/oauth-alerts.yml

groups:
  - name: oauth_config_alerts
    interval: 30s
    rules:
      # 配置验证失败
      - alert: OAuthConfigValidationFailed
        expr: oauth_config_validation_failed_total > 0
        for: 1m
        labels:
          severity: critical
          component: oauth
        annotations:
          summary: "OAuth配置验证失败 (租户: {{ $labels.tenant_id }})"
          description: "租户 {{ $labels.tenant_id }} 的OAuth配置验证失败 {{ $value }} 次"

      # 所有平台被禁用
      - alert: AllOAuthPlatformsDisabled
        expr: oauth_platform_disabled_total == 2
        for: 1m
        labels:
          severity: critical
          component: oauth
        annotations:
          summary: "所有OAuth平台被禁用 (租户: {{ $labels.tenant_id }})"
          description: "租户 {{ $labels.tenant_id }} 的所有OAuth平台均被禁用，用户无法登录"

      # 回调URL不可达
      - alert: OAuthCallbackURLUnreachable
        expr: oauth_callback_unreachable_total > 0
        for: 5m
        labels:
          severity: warning
          component: oauth
        annotations:
          summary: "OAuth回调URL不可达 (租户: {{ $labels.tenant_id }}, 平台: {{ $labels.platform }})"
          description: "租户 {{ $labels.tenant_id }} 的 {{ $labels.platform }} 平台回调URL不可达"

      # 密钥即将到期
      - alert: OAuthSecretExpiringSoon
        expr: oauth_secret_expiry_days < 7
        for: 1h
        labels:
          severity: warning
          component: oauth
        annotations:
          summary: "OAuth密钥即将到期 (租户: {{ $labels.tenant_id }}, 平台: {{ $labels.platform }})"
          description: "租户 {{ $labels.tenant_id }} 的 {{ $labels.platform }} 平台密钥将在 {{ $value }} 天后到期，请及时轮换"

      # OAuth登录成功率低
      - alert: OAuthLoginSuccessRateLow
        expr: oauth_login_success_rate < 0.8
        for: 10m
        labels:
          severity: warning
          component: oauth
        annotations:
          summary: "OAuth登录成功率低 (租户: {{ $labels.tenant_id }}, 平台: {{ $labels.platform }})"
          description: "租户 {{ $labels.tenant_id }} 的 {{ $labels.platform }} 平台登录成功率为 {{ $value | humanizePercentage }}，低于80%阈值"

      # OAuth响应时间过长
      - alert: OAuthResponseTimeSlow
        expr: histogram_quantile(0.95, rate(oauth_request_duration_seconds_bucket[5m])) > 5
        for: 5m
        labels:
          severity: warning
          component: oauth
        annotations:
          summary: "OAuth响应时间过长 (租户: {{ $labels.tenant_id }}, 平台: {{ $labels.platform }})"
          description: "租户 {{ $labels.tenant_id }} 的 {{ $labels.platform }} 平台OAuth请求p95响应时间为 {{ $value }}s，超过5s阈值"
```

### Grafana Dashboard配置

```json
{
  "dashboard": {
    "title": "OAuth配置监控",
    "panels": [
      {
        "title": "OAuth平台启用状态",
        "targets": [
          {
            "expr": "oauth_platform_enabled",
            "legendFormat": "{{ tenant_id }} - {{ platform }}"
          }
        ],
        "type": "stat"
      },
      {
        "title": "OAuth登录成功率（按平台）",
        "targets": [
          {
            "expr": "oauth_login_success_rate",
            "legendFormat": "{{ tenant_id }} - {{ platform }}"
          }
        ],
        "type": "graph"
      },
      {
        "title": "OAuth响应时间分布",
        "targets": [
          {
            "expr": "histogram_quantile(0.50, rate(oauth_request_duration_seconds_bucket[5m]))",
            "legendFormat": "p50 - {{ tenant_id }} - {{ platform }}"
          },
          {
            "expr": "histogram_quantile(0.95, rate(oauth_request_duration_seconds_bucket[5m]))",
            "legendFormat": "p95 - {{ tenant_id }} - {{ platform }}"
          }
        ],
        "type": "graph"
      },
      {
        "title": "密钥到期倒计时",
        "targets": [
          {
            "expr": "oauth_secret_expiry_days",
            "legendFormat": "{{ tenant_id }} - {{ platform }}"
          }
        ],
        "type": "gauge"
      }
    ]
  }
}
```

---

## 🔍 故障排查指南

### 常见问题和解决方案

#### 问题1：配置验证失败

**症状**:
```
Error: OAuth配置验证失败: 缺少必需配置: dingtalk.app_secret
```

**排查步骤**:

1. **检查配置文件**:
```bash
# 查看租户配置
yq eval '.dingtalk' config/tenants/TENANT.yml

# 检查环境变量
env | grep DINGTALK
```

2. **检查GitHub Secrets**:
```bash
# 列出所有Secrets
gh secret list

# 检查特定Secret
gh secret view DINGTALK_APP_SECRET
```

3. **解决方案**:
```bash
# 添加缺失的配置
export DINGTALK_APP_SECRET=your_secret_here

# 或设置GitHub Secret
gh secret set DINGTALK_APP_SECRET --body "your_secret_here"
```

#### 问题2：回调URL不可达

**症状**:
```
Error: OAuth回调URL不可访问: https://ciiber.example.com/api/auth/feishu/callback
```

**排查步骤**:

1. **检查DNS解析**:
```bash
nslookup ciiber.example.com
dig ciiber.example.com
```

2. **检查端口连通性**:
```bash
curl -I https://ciiber.example.com/api/health
telnet ciiber.example.com 443
```

3. **检查Nginx配置**:
```bash
# 查看Nginx配置
cat /etc/nginx/sites-enabled/ciiber.conf

# 测试配置
sudo nginx -t

# 重载Nginx
sudo nginx -s reload
```

4. **解决方案**:
```bash
# 更新回调URL配置
export FEISHU_REDIRECT_URI=https://new-domain.com/api/auth/feishu/callback

# 或修改租户配置
yq eval '.feishu.oauth_redirect_uri = "https://new-domain.com/api/auth/feishu/callback"' \
  -i config/tenants/TENANT.yml
```

#### 问题3：密钥解密失败

**症状**:
```
Error: 密钥解密失败: Decryption failed
```

**排查步骤**:

1. **检查加密主密钥**:
```bash
# 查看主密钥配置
env | grep ENCRYPTION_MASTER_KEY

# 或查看GitHub Secret
gh secret view ENCRYPTION_MASTER_KEY
```

2. **验证密钥格式**:
```bash
# 主密钥应为64位
echo $ENCRYPTION_MASTER_KEY | wc -c
```

3. **检查密钥轮换状态**:
```bash
# 查看密钥轮换日志
docker logs opclaw-backend | grep "Key rotation"
```

4. **解决方案**:
```bash
# 重新生成主密钥
openssl rand -base64 64

# 更新GitHub Secret
gh secret set ENCRYPTION_MASTER_KEY --body "new_master_key"

# 重新加密所有app_secret
./scripts/security/re-encrypt-secrets.sh --tenant=TENANT
```

#### 问题4：平台配置不一致

**症状**: 环境变量和租户配置不一致

**排查步骤**:

1. **对比配置**:
```bash
# 查看租户配置
yq eval '.oauth.enabled_platforms' config/tenants/TENANT.yml

# 查看环境变量
env | grep OAUTH_ENABLED_PLATFORMS
```

2. **查看实际生效的配置**:
```bash
curl http://localhost:3000/api/admin/config?tenant_id=TENANT
```

3. **解决方案**:
```bash
# 统一配置（以环境变量为准）
export OAUTH_ENABLED_PLATFORMS=feishu,dingtalk

# 重新加载配置
curl -X POST http://localhost:3000/api/admin/config/reload
```

### 日志分析

#### 关键日志位置

```bash
# 应用日志
docker logs opclaw-backend --tail 100 -f

# OAuth相关日志
docker logs opclaw-backend 2>&1 | grep -i oauth

# 配置加载日志
docker logs opclaw-backend 2>&1 | grep "Config loaded"
```

#### 日志级别调整

```bash
# 临时调整（运行时）
export LOG_LEVEL=debug

# 永久调整（.env文件）
echo "LOG_LEVEL=debug" >> .env.production

# 重启应用
docker restart opclaw-backend
```

---

## 📚 附录

### A. 完整环境变量清单

#### 全局OAuth配置

| 环境变量 | 类型 | 必需 | 默认值 | 说明 |
|---------|------|------|--------|------|
| `OAUTH_ENABLED_PLATFORMS` | string | ❌ | `feishu` | 启用的OAuth平台（逗号分隔） |
| `OAUTH_DEFAULT_PLATFORM` | string | ❌ | `feishu` | 默认OAuth平台 |
| `OAUTH_CALLBACK_BASE_URL` | string | ❌ | - | OAuth回调基础URL |
| `OAUTH_SELECTION_STRATEGY` | string | ❌ | `user_select` | 平台选择策略 |

#### 飞书配置

| 环境变量 | 类型 | 必需 | 默认值 | 说明 |
|---------|------|------|--------|------|
| `FEISHU_APP_ID` | string | ✅ | - | 飞书应用ID |
| `FEISHU_APP_SECRET` | string | ✅ | - | 飞书应用密钥 |
| `FEISHU_ENCRYPT_KEY` | string | ✅ | - | 飞书加密密钥 |
| `FEISHU_REDIRECT_URI` | string | ✅ | - | 飞书OAuth回调URL |
| `FEISHU_API_BASE_URL` | string | ❌ | `https://open.feishu.cn` | 飞书API基础URL |
| `FEISHU_ENABLED` | boolean | ❌ | `true` | 飞书启用状态 |

#### 钉钉配置

| 环境变量 | 类型 | 必需 | 默认值 | 说明 |
|---------|------|------|--------|------|
| `DINGTALK_APP_ID` | string | ❌ | - | 钉钉应用ID（AppKey） |
| `DINGTALK_APP_SECRET` | string | ❌ | - | 钉钉应用密钥（AppSecret） |
| `DINGTALK_ENCRYPT_KEY` | string | ❌ | - | 钉钉加密密钥 |
| `DINGTALK_CORP_ID` | string | ❌ | - | 钉钉企业ID |
| `DINGTALK_REDIRECT_URI` | string | ❌ | - | 钉钉OAuth回调URL |
| `DINGTALK_API_BASE_URL` | string | ❌ | `https://api.dingtalk.com` | 钉钉API基础URL |
| `DINGTALK_SSO_ENABLED` | boolean | ❌ | `false` | 钉钉SSO启用状态 |
| `DINGTALK_ENABLED` | boolean | ❌ | `true` | 钉钉启用状态 |

#### 安全配置

| 环境变量 | 类型 | 必需 | 默认值 | 说明 |
|---------|------|------|--------|------|
| `ENCRYPTION_MASTER_KEY` | string | ✅ | - | 主加密密钥（64位） |
| `ENCRYPTION_ALGORITHM` | string | ❌ | `aes-256-gcm` | 加密算法 |
| `ENCRYPTION_KEY_LENGTH` | number | ❌ | `256` | 密钥长度（位） |
| `ENCRYPTION_ROTATION_DAYS` | number | ❌ | `90` | 密钥轮换周期（天） |

#### 功能开关

| 环境变量 | 类型 | 必需 | 默认值 | 说明 |
|---------|------|------|--------|------|
| `FEATURE_MULTI_PLATFORM_OAUTH` | boolean | ❌ | `true` | 多平台OAuth功能 |
| `FEATURE_PLATFORM_AUTO_DETECTION` | boolean | ❌ | `false` | 平台自动检测 |
| `FEATURE_REMEMBER_PLATFORM` | boolean | ❌ | `true` | 用户平台记忆 |
| `MOCK_OAUTH_ENABLED` | boolean | ❌ | `false` | Mock OAuth（开发环境） |

### B. 配置验证工具

#### yamllint配置

```yaml
# .yamllint
---
extends: default

rules:
  line-length:
    max: 120
    level: warning
  indentation:
    spaces: 2
    indent-sequences: true
  comments:
    min-spaces-from-content: 1
```

#### 配置验证脚本

```bash
#!/bin/bash
# scripts/config/validate-config.sh

set -e

TENANT_ID=${1}

echo "验证租户配置: ${TENANT_ID}"

# 1. YAML语法检查
echo "1. YAML语法检查..."
yamllint config/tenants/${TENANT_ID}.yml

# 2. 配置完整性检查
echo "2. 配置完整性检查..."
npm run config:validate -- --tenant=${TENANT_ID}

# 3. 环境变量检查
echo "3. 环境变量检查..."
npm run config:check-env -- --tenant=${TENANT_ID}

echo "✅ 配置验证通过"
```

### C. 相关文档链接

- **GAP分析**: `docs/requirements/issue23-dingtalk-oauth-gap-analysis.md`
- **飞书OAuth文档**: `https://open.feishu.cn/document/common-capabilities/sso/api/get-user-info`
- **钉钉OAuth文档**: `https://open.dingtalk.com/document/orgapp/tutorial/obtaining-user-personal-information`
- **租户配置模板**: `config/tenants/template.yml`

---

**文档结束**

*本文档为多平台OAuth配置管理的设计规范，涵盖配置结构、验证规则、迁移策略、运维实践和监控告警等方面。*
