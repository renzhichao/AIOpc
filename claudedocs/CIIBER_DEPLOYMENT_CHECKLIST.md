# CIIBER 租户部署准备清单

> **租户ID**: CIIBER
> **服务器IP**: 113.105.103.165
> **创建日期**: 2026-03-19
> **状态**: 配置准备中，等待客户提供信息

---

## ✅ 已完成配置

### 租户基本信息
- ✅ **租户ID**: CIIBER
- ✅ **租户名称**: CIIBER
- ✅ **环境**: production
- ✅ **租户等级**: standard

### 服务器配置
- ✅ **服务器IP**: 113.105.103.165
- ✅ **SSH用户**: openclaw
- ✅ **SSH密码**: openclaw
- ✅ **SSH密钥路径**: ~/.ssh/ciiber_key (待登录后生成)
- ✅ **部署路径**: /opt/opclaw/platform
- ✅ **API端口**: 3000
- ✅ **指标端口**: 9090

### 数据库配置
- ✅ **数据库名**: opclaw_ciiber
- ✅ **数据库用户**: opclaw
- ✅ **本地部署**: localhost:5432

### Redis配置
- ✅ **本地部署**: localhost:6379
- ✅ **数据库**: 0

### JWT配置
- ✅ **签发者**: CIIBER
- ✅ **受众**: opclaw-api
- ✅ **过期时间**: 24h
- ✅ **刷新过期**: 7d

### Agent配置
- ✅ **API URL**: https://api.deepseek.com
- ✅ **模型**: deepseek-chat
- ✅ **最大Token**: 4096

### 配置文件位置
- ✅ **配置文件**: `/Users/arthurren/projects/AIOpc/config/tenants/CIIBER.yml`

---

## ⏳ 待客户提供信息

### 1. SSH 访问 (优先级: HIGH)
- [ ] 服务器已完成 SSH 密钥升级
  - **当前状态**: 服务器使用短密钥，无法从现代 SSH 客户端连接
  - **升级脚本**: 已提供给客户
- [ ] SSH 连接测试通过
- [ ] 生成 SSH 密钥对
  ```bash
  ssh-keygen -t ed25519 -f ~/.ssh/ciiber_key -C "ciiber@113.105.103.165"
  ```
- [ ] 部署公钥到服务器
  ```bash
  ssh-copy-id -i ~/.ssh/ciiber_key.pub root@113.105.103.165
  ```

### 2. 飞书集成 (优先级: HIGH)
- [ ] **Feishu App ID**: `cli_xxxxxxxxxxxxx`
  - 从飞书开放平台获取
  - 格式: cli_ 开头
- [ ] **Feishu App Secret**: (≥32字符)
  - 从飞书开放平台获取
  - 机密信息，需妥善保管
- [ ] **Feishu Encrypt Key**: (≥24字符)
  - 用于数据加密
  - 生成命令: `openssl rand -base64 32`
- [ ] **OAuth 回调地址**: `https://ciiber.example.com/api/auth/feishu/callback`
  - 需提供域名
  - 在飞书后台配置

### 3. 数据库密码 (优先级: HIGH)
- [ ] **数据库密码**: (≥16字符)
  - 生成命令: `openssl rand -base64 24`
  - 存储位置: 环境变量或直接填入配置文件

### 4. Redis 密码 (优先级: MEDIUM)
- [ ] **Redis密码**: (可选，如果不使用认证留空)
  - 生成命令: `openssl rand -base64 16`

### 5. JWT 密钥 (优先级: HIGH)
- [ ] **JWT Secret**: (≥32字符)
  - 生成命令: `openssl rand -base64 64`
  - 用于签名和验证 JWT token

### 6. DeepSeek API Key (优先级: HIGH)
- [ ] **DeepSeek API Key**: `sk-xxxxxxxxxxxx`
  - 从 DeepSeek 平台获取
  - 格式: sk- 开头

### 7. 域名配置 (优先级: MEDIUM)
- [ ] **服务域名**: `ciiber.example.com`
  - 用于 OAuth 回调和 API 访问
  - 需配置 DNS 解析

---

## 📋 部署前准备步骤

### 步骤 1: 验证服务器连接 (SSH升级后)
```bash
# 测试 SSH 连接
ssh -i ~/.ssh/ciiber_key root@113.105.103.165

# 检查服务器环境
ssh -i ~/.ssh/ciiber_key root@113.105.103.165 "uname -a && df -h /opt && docker --version"
```

### 步骤 2: 更新配置文件
```bash
# 编辑配置文件
vi /Users/arthurren/projects/AIOpc/config/tenants/CIIBER.yml

# 或使用环境变量
export FEISHU_APP_ID="cli_xxxxxxxxxxxxx"
export FEISHU_APP_SECRET="min_32_chars_long_secret"
export JWT_SECRET="min_32_chars_jwt_secret"
export DEEPSEEK_API_KEY="sk-deepseek-api-key"
```

### 步骤 3: 验证配置
```bash
# 验证配置文件语法
./scripts/tenant/validate.sh CIIBER

# 检查占位符
grep -r "PENDING\|placeholder\|changeme" config/tenants/CIIBER.yml
```

### 步骤 4: 安全检查
```bash
# 运行安全检查套件
./scripts/security/security-check-suite.sh config/tenants/CIIBER.yml
```

---

## 🚀 部署执行 (配置完成后)

### 方式 1: 使用部署脚本 (推荐)
```bash
# 完整部署流程
./scripts/deploy/deploy-tenant.sh config/tenants/CIIBER.yml

# 带详细输出
./scripts/deploy/deploy-tenant.sh config/tenants/CIIBER.yml --verbose

# 演练模式 (不实际部署)
./scripts/deploy/deploy-tenant.sh config/tenants/CIIBER.yml --dry-run
```

### 方式 2: 使用 GitHub Actions
1. 进入 GitHub Actions 页面
2. 选择 "租户部署 (Tenant Deployment)" 工作流
3. 选择租户: CIIBER
4. 选择组件: all
5. 执行工作流

### 方式 3: 本地快速部署 (仅适用本地构建)
```bash
# 本地构建并部署
./scripts/deploy/deploy-local.sh config/tenants/CIIBER.yml
```

---

## 📊 部署后验证

### 1. 健康检查
```bash
# 单租户健康检查
./scripts/tenant/health-check.sh CIIBER

# 查看详细状态
./scripts/tenant/health-check.sh CIIBER --show-details
```

### 2. 服务验证
```bash
# 检查 API 健康端点
curl http://113.105.103.165:3000/health

# 检查指标端点
curl http://113.105.103.165:9090/metrics
```

### 3. 租户信息查看
```bash
# 查看租户配置
./scripts/tenant/show.sh CIIBER

# 查看部署历史
./scripts/tenant/show.sh CIIBER --show-history
```

---

## 🔧 快速命令参考

```bash
# === 配置管理 ===
./scripts/tenant/create.sh --tenant-id CIIBER              # 创建租户
./scripts/tenant/list.sh                                   # 列出租户
./scripts/tenant/show.sh CIIBER                             # 查看租户详情
./scripts/tenant/update.sh CIIBER --name "New Name"         # 更新租户
./scripts/tenant/validate.sh CIIBER                          # 验证配置

# === 部署相关 ===
./scripts/deploy/deploy-tenant.sh config/tenants/CIIBER.yml # 部署
./scripts/deploy/pre-deploy.sh config/tenants/CIIBER.yml    # 部署前检查
./scripts/deploy/rollback-tenant.sh config/tenants/CIIBER.yml # 回滚

# === 健康检查 ===
./scripts/tenant/health-check.sh CIIBER                     # 健康检查
./scripts/tenant/health-status.sh CIIBER                     # 健康状态历史

# === 安全相关 ===
./scripts/security/security-check-suite.sh config/tenants/CIIBER.yml # 安全检查
./scripts/security/check-config-security.sh config/tenants/CIIBER.yml # 配置安全
./scripts/security/check-secret-strength.sh                  # 密钥强度检查
```

---

## 📞 联系信息

如有问题或需要协助，请联系：
- **技术支持**: arthurren@example.com
- **项目文档**: `/Users/arthurren/projects/AIOpc/docs/`

---

**最后更新**: 2026-03-19
**配置版本**: 1.0
