# 多平台OAuth配置快速参考指南

**版本**: 1.0
**最后更新**: 2026-03-21
**相关文档**: [多平台OAuth配置管理设计文档](./multi-platform-oauth-config.md)

---

## 🚀 快速开始

### 场景1: 现有租户添加钉钉OAuth支持

```bash
# 1. 运行迁移脚本
./scripts/migrate/migrate-to-multi-platform.sh CIIBER

# 2. 配置钉钉凭证（环境变量）
export DINGTALK_APP_ID=dingxxxxxxxxxxxxxxxx
export DINGTALK_APP_SECRET=your_dingtalk_secret_min_32_chars
export DINGTALK_CORP_ID=dingxxxxxxxxxxxxxxxx

# 或设置GitHub Secrets
gh secret set DINGTALK_APP_ID --body "ding_xxx"
gh secret set DINGTALK_APP_SECRET --body "your_secret"
gh secret set DINGTALK_CORP_ID --body "ding_xxx"

# 3. 验证配置
./scripts/config/validate-oauth-config.sh CIIBER --verbose

# 4. 重新部署
./scripts/deploy/deploy-backend.sh --tenant=CIIBER --env=production
```

### 场景2: 新租户配置双平台OAuth

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

---

## 📝 配置模板速查

### 仅飞书（单平台）

```yaml
oauth:
  enabled_platforms:
    - feishu
  default_platform: "feishu"

feishu:
  app_id: "${FEISHU_APP_ID}"
  app_secret: "${FEISHU_APP_SECRET}"
  encrypt_key: "${FEISHU_ENCRYPT_KEY}"
  oauth_redirect_uri: "${FEISHU_REDIRECT_URI}"
```

### 仅钉钉（单平台）

```yaml
oauth:
  enabled_platforms:
    - dingtalk
  default_platform: "dingtalk"

dingtalk:
  app_id: "${DINGTALK_APP_ID}"
  app_secret: "${DINGTALK_APP_SECRET}"
  encrypt_key: "${DINGTALK_ENCRYPT_KEY}"
  corp_id: "${DINGTALK_CORP_ID}"
  oauth_redirect_uri: "${DINGTALK_REDIRECT_URI}"
```

### 双平台（飞书+钉钉）

```yaml
oauth:
  enabled_platforms:
    - feishu
    - dingtalk
  default_platform: "feishu"  # 或 "dingtalk"

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

---

## 🔑 环境变量清单

### 必需配置（生产环境）

```bash
# 全局OAuth
OAUTH_ENABLED_PLATFORMS=feishu,dingtalk
OAUTH_DEFAULT_PLATFORM=feishu

# 飞书
FEISHU_APP_ID=cli_a93ce5614ce11bd6
FEISHU_APP_SECRET=feishu_secret_min_32_chars
FEISHU_ENCRYPT_KEY=feishu_encrypt_key_32_chars
FEISHU_REDIRECT_URI=https://your-domain.com/api/auth/feishu/callback

# 钉钉（如果启用）
DINGTALK_APP_ID=dingxxxxxxxxxxxxxxxx
DINGTALK_APP_SECRET=dingtalk_secret_min_32_chars
DINGTALK_ENCRYPT_KEY=dingtalk_encrypt_key_32_chars
DINGTALK_CORP_ID=dingxxxxxxxxxxxxxxxx
DINGTALK_REDIRECT_URI=https://your-domain.com/api/auth/dingtalk/callback

# 安全
ENCRYPTION_MASTER_KEY=master_key_64_chars_minimum
```

### 可选配置

```bash
# 功能开关
FEATURE_MULTI_PLATFORM_OAUTH=true
FEATURE_REMEMBER_PLATFORM=true

# 安全
OAUTH_PKCE_ENABLED=true
ENCRYPTION_ROTATION_DAYS=90
```

---

## 🛠️ 常用命令

### 配置管理

```bash
# 验证配置
./scripts/config/validate-oauth-config.sh <tenant_id> [--verbose]

# 迁移到多平台
./scripts/migrate/migrate-to-multi-platform.sh <tenant_id>

# 查看生效的配置
curl http://localhost:3000/api/admin/config?tenant_id=<tenant_id>
```

### 运行时操作

```bash
# 热重载配置（无需重启）
curl -X POST http://localhost:3000/api/admin/config/reload \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -d '{"tenant_id": "<tenant_id>"}'

# 查看启用的平台
curl http://localhost:3000/api/oauth/platforms?tenant_id=<tenant_id>

# 禁用某个平台
export FEISHU_ENABLED=false
curl -X POST http://localhost:3000/api/admin/config/reload
```

### 测试和调试

```bash
# 测试飞书OAuth
./scripts/test/test-oauth.sh --tenant=<tenant_id> --platform=feishu

# 测试钉钉OAuth
./scripts/test/test-oauth.sh --tenant=<tenant_id> --platform=dingtalk

# 查看OAuth日志
docker logs opclaw-backend 2>&1 | grep -i oauth

# 查看配置加载日志
docker logs opclaw-backend 2>&1 | grep "Config loaded"
```

---

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

# 检查DNS解析
nslookup your-domain.com
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

# 重新加密app_secret
./scripts/security/re-encrypt-secrets.sh --tenant=<tenant_id>
```

### Q4: 平台配置不一致

**症状**: 环境变量和租户配置不一致

**解决**:
```bash
# 查看环境变量
env | grep OAUTH_ENABLED_PLATFORMS

# 查看租户配置
yq eval '.oauth.enabled_platforms' config/tenants/<tenant_id>.yml

# 统一配置（以环境变量为准）
export OAUTH_ENABLED_PLATFORMS=feishu,dingtalk

# 重新加载
curl -X POST http://localhost:3000/api/admin/config/reload
```

---

## 📊 监控和告警

### 关键指标

```bash
# OAuth配置健康
curl http://localhost:3000/metrics | grep oauth_config

# OAuth性能
curl http://localhost:3000/metrics | grep oauth_request_duration

# OAuth登录成功率
curl http://localhost:3000/metrics | grep oauth_login_success_rate
```

### Prometheus告警

```yaml
# 所有平台被禁用
alert: AllOAuthPlatformsDisabled
expr: oauth_platform_disabled_total == 2

# 密钥即将到期
alert: OAuthSecretExpiringSoon
expr: oauth_secret_expiry_days < 7

# 登录成功率低
alert: OAuthLoginSuccessRateLow
expr: oauth_login_success_rate < 0.8
```

---

## 🔄 配置迁移示例

### 从单平台到双平台

**迁移前** (config/tenants/CIIBER.yml):
```yaml
feishu:
  app_id: "cli_xxx"
  app_secret: "secret_xxx"
```

**迁移后**:
```yaml
oauth:
  enabled_platforms: [feishu, dingtalk]
  default_platform: "feishu"

feishu:
  app_id: "cli_xxx"
  app_secret: "secret_xxx"

dingtalk:
  app_id: "${DINGTALK_APP_ID}"
  app_secret: "${DINGTALK_APP_SECRET}"
  corp_id: "${DINGTALK_CORP_ID}"
```

### 禁用某个平台

```bash
# 方法1: 环境变量
export FEISHU_ENABLED=false

# 方法2: 修改配置
yq eval '.feishu.enabled = "false"' -i config/tenants/CIIBER.yml

# 热重载
curl -X POST http://localhost:3000/api/admin/config/reload
```

---

## 📚 相关文档

- **完整设计文档**: [multi-platform-oauth-config.md](./multi-platform-oauth-config.md)
- **GAP分析**: [issue23-dingtalk-oauth-gap-analysis.md](../requirements/issue23-dingtalk-oauth-gap-analysis.md)
- **飞书OAuth文档**: https://open.feishu.cn/document/common-capabilities/sso/api/get-user-info
- **钉钉OAuth文档**: https://open.dingtalk.com/document/orgapp/tutorial/obtaining-user-personal-information

---

## 🆘 获取帮助

```bash
# 查看脚本帮助
./scripts/migrate/migrate-to-multi-platform.sh --help
./scripts/config/validate-oauth-config.sh --help

# 查看配置示例
cat config/tenants/template.yml

# 查看环境变量示例
cat platform/backend/.env.production.example
```

---

**文档结束**

*这是多平台OAuth配置管理的快速参考指南，涵盖最常用的操作和配置场景。*
