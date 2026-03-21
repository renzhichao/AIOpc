# 多平台OAuth配置管理文档

## 📚 文档索引

### 核心文档

1. **[配置管理设计文档](./multi-platform-oauth-config.md)** - 完整的设计规范
   - 配置架构设计
   - 配置文件结构
   - 密钥管理方案
   - 配置验证规则
   - 迁移策略
   - 监控和告警

2. **[快速参考指南](./multi-platform-oauth-quick-reference.md)** - 常用操作速查
   - 快速开始
   - 配置模板
   - 环境变量清单
   - 常用命令
   - 常见问题

3. **[GAP分析文档](../requirements/issue23-dingtalk-oauth-gap-analysis.md)** - 需求分析
   - 当前状态分析
   - 目标状态定义
   - 差距识别
   - 实施优先级

## 🛠️ 工具脚本

### 配置迁移

```bash
# 单平台 → 多平台迁移
./scripts/migrate/migrate-to-multi-platform.sh <tenant_id>

# 示例: 将CIIBER租户迁移到双平台
./scripts/migrate/migrate-to-multi-platform.sh CIIBER
```

**功能**:
- 自动备份现有配置
- 添加oauth配置块
- 添加钉钉配置块
- 添加安全和功能开关配置
- 验证迁移后的配置

### 配置验证

```bash
# 验证OAuth配置
./scripts/config/validate-oauth-config.sh <tenant_id> [--verbose]

# 示例: 验证CIIBER租户配置
./scripts/config/validate-oauth-config.sh CIIBER --verbose
```

**验证项**:
- YAML语法检查
- oauth配置块完整性
- 平台配置完整性
- URL格式验证
- 密钥强度验证
- 环境一致性验证

## 📋 配置层次

```
Level 1: 环境变量 (.env.*)
    ├── GitHub Secrets (最高优先级)
    ├── .env.production
    └── .env.development
         ↓ 优先级覆盖
Level 2: 租户配置 (config/tenants/*.yml)
    ├── oauth: 全局OAuth配置
    ├── feishu: 飞书平台配置
    └── dingtalk: 钉钉平台配置
         ↓ 优先级覆盖
Level 3: 运行时配置 (数据库/Redis)
    ├── 热更新配置
    └── 功能开关
```

## 🔑 核心配置

### 租户配置示例 (config/tenants/CIIBER.yml)

```yaml
oauth:
  enabled_platforms:
    - feishu
    - dingtalk
  default_platform: "feishu"

feishu:
  app_id: "${FEISHU_APP_ID}"
  app_secret: "${FEISHU_APP_SECRET}"
  encrypt_key: "${FEISHU_ENCRYPT_KEY}"
  oauth_redirect_uri: "${FEISHU_REDIRECT_URI}"

dingtalk:
  app_id: "${DINGTALK_APP_ID}"
  app_secret: "${DINGTALK_APP_SECRET}"
  encrypt_key: "${DINGTALK_ENCRYPT_KEY}"
  corp_id: "${DINGTALK_CORP_ID}"
  oauth_redirect_uri: "${DINGTALK_REDIRECT_URI}"
```

### 环境变量示例 (.env.production)

```bash
# 全局OAuth
OAUTH_ENABLED_PLATFORMS=feishu,dingtalk
OAUTH_DEFAULT_PLATFORM=feishu

# 飞书
FEISHU_APP_ID=cli_a93ce5614ce11bd6
FEISHU_APP_SECRET=feishu_secret_min_32_chars
FEISHU_ENCRYPT_KEY=feishu_encrypt_key_32_chars
FEISHU_REDIRECT_URI=https://your-domain.com/api/auth/feishu/callback

# 钉钉
DINGTALK_APP_ID=dingxxxxxxxxxxxxxxxx
DINGTALK_APP_SECRET=dingtalk_secret_min_32_chars
DINGTALK_ENCRYPT_KEY=dingtalk_encrypt_key_32_chars
DINGTALK_CORP_ID=dingxxxxxxxxxxxxxxxx
DINGTALK_REDIRECT_URI=https://your-domain.com/api/auth/dingtalk/callback

# 安全
ENCRYPTION_MASTER_KEY=master_key_64_chars_minimum
```

## 🚀 快速开始

### 新租户配置双平台OAuth

```bash
# 1. 创建租户配置
cp config/tenants/template.yml config/tenants/NEW_TENANT.yml

# 2. 编辑配置
vim config/tenants/NEW_TENANT.yml
# 设置: oauth.enabled_platforms: [feishu, dingtalk]

# 3. 配置环境变量
cp platform/backend/.env.production.example platform/backend/.env.production
vim platform/backend/.env.production

# 4. 验证配置
./scripts/config/validate-oauth-config.sh NEW_TENANT

# 5. 部署
./scripts/deploy/deploy-backend.sh --tenant=NEW_TENANT --env=production
```

### 现有租户添加钉钉支持

```bash
# 1. 运行迁移脚本
./scripts/migrate/migrate-to-multi-platform.sh CIIBER

# 2. 配置钉钉凭证
export DINGTALK_APP_ID=dingxxxxxxxxxxxxxxxx
export DINGTALK_APP_SECRET=your_dingtalk_secret
export DINGTALK_CORP_ID=dingxxxxxxxxxxxxxxxx

# 3. 验证配置
./scripts/config/validate-oauth-config.sh CIIBER

# 4. 重新部署
./scripts/deploy/deploy-backend.sh --tenant=CIIBER --env=production
```

## ⚠️ 常见问题

### Q1: 配置验证失败

**错误**: `缺少必需配置: dingtalk.app_secret`

**解决**:
```bash
# 检查环境变量
env | grep DINGTALK

# 设置缺失的变量
export DINGTALK_APP_SECRET=your_secret_here

# 或设置GitHub Secret
gh secret set DINGTALK_APP_SECRET --body "your_secret"
```

### Q2: 回调URL不可达

**错误**: `OAuth回调URL不可访问`

**解决**:
```bash
# 测试URL可达性
curl -I https://your-domain.com/api/health

# 检查Nginx配置
sudo nginx -t
sudo nginx -s reload
```

### Q3: 密钥解密失败

**错误**: `密钥解密失败: Decryption failed`

**解决**:
```bash
# 检查主密钥
env | grep ENCRYPTION_MASTER_KEY

# 重新生成主密钥
openssl rand -base64 64

# 更新GitHub Secret
gh secret set ENCRYPTION_MASTER_KEY --body "new_master_key"
```

## 📊 监控和告警

### 关键指标

- `oauth_config_validation_failed_total`: 配置验证失败次数
- `oauth_platform_disabled_total`: 被禁用的平台数量
- `oauth_callback_unreachable_total`: 回调URL不可达数量
- `oauth_secret_expiry_days`: 密钥到期天数
- `oauth_login_success_rate`: 登录成功率

### Prometheus告警规则

```yaml
# 所有平台被禁用
alert: AllOAuthPlatformsDisabled
expr: oauth_platform_disabled_total == 2

# 寸钥即将到期
alert: OAuthSecretExpiringSoon
expr: oauth_secret_expiry_days < 7

# 登录成功率低
alert: OAuthLoginSuccessRateLow
expr: oauth_login_success_rate < 0.8
```

## 🔗 相关资源

### 外部文档

- **飞书OAuth文档**: https://open.feishu.cn/document/common-capabilities/sso/api/get-user-info
- **钉钉OAuth文档**: https://open.dingtalk.com/document/orgapp/tutorial/obtaining-user-personal-information

### 项目文档

- **GAP分析**: `docs/requirements/issue23-dingtalk-oauth-gap-analysis.md`
- **租户配置模板**: `config/tenants/template.yml`
- **环境变量模板**: `platform/backend/.env.production.example`

## 🆘 获取帮助

```bash
# 查看脚本帮助
./scripts/migrate/migrate-to-multi-platform.sh --help
./scripts/config/validate-oauth-config.sh --help

# 查看配置示例
cat config/tenants/template.yml

# 查看环境变量示例
cat platform/backend/.env.production.example

# 查看日志
docker logs opclaw-backend 2>&1 | grep -i oauth
```

## 📝 维护说明

### 文档更新

- **设计文档**: 重大架构变更时更新
- **快速参考**: 每次新增操作场景时更新
- **GAP分析**: 需求变更时更新

### 脚本维护

- **迁移脚本**: 新增配置项时更新
- **验证脚本**: 新增验证规则时更新

### 版本历史

| 版本 | 日期 | 变更说明 |
|------|------|---------|
| 1.0 | 2026-03-21 | 初始版本，支持飞书和钉钉双平台 |

---

**最后更新**: 2026-03-21
**维护者**: DevOps Team
**反馈**: 提交Issue或Pull Request
