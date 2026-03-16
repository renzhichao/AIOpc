# 生产环境配置文档

**生成日期**: 2026-03-16
**目标**: 完整的生产环境变量配置指南
**服务器**: 118.25.0.190 (renava.cn)

---

## 📋 配置概览

### 自动化配置脚本

**脚本位置**: `scripts/cloud/configure-backend-env.sh`

**功能**:
- ✅ 安全随机密钥生成
- ✅ 数据库密码配置
- ✅ 环境文件创建和上传
- ✅ 密钥导出和安全存储
- ✅ 数据库密码自动更新
- ✅ Redis密码配置

**使用方法**:
```bash
cd /Users/arthurren/projects/AIOpc/scripts/cloud
./configure-backend-env.sh
```

**可选参数**:
```bash
# 指定输出目录
./configure-backend-env.sh --output-dir /path/to/output

# 显示生成的密钥（谨慎使用）
./configure-backend-env.sh --show-secrets
```

---

## 🔧 自动配置项

以下配置项由脚本自动生成和管理：

### 1. 安全密钥

| 密钥类型 | 长度 | 用途 | 生成方法 |
|---------|------|------|---------|
| JWT_SECRET | 32字符 | JWT令牌签名 | OpenSSL随机生成 |
| SESSION_SECRET | 32字符 | 会话加密 | OpenSSL随机生成 |
| ENCRYPTION_KEY | 32字符 | 敏感数据加密 | OpenSSL随机生成 |
| FEISHU_VERIFY_TOKEN | 32字符 | Feishu Webhook验证 | OpenSSL随机生成 |
| FEISHU_ENCRYPT_KEY | 32字符 | Feishu数据加密 | OpenSSL随机生成 |

### 2. 数据库配置

| 配置项 | 值 | 说明 |
|--------|-----|------|
| DB_HOST | localhost | 本地连接 |
| DB_PORT | 5432 | PostgreSQL默认端口 |
| DB_NAME | opclaw | 数据库名称 |
| DB_USERNAME | opclaw | 数据库用户 |
| DB_PASSWORD | <自动生成24字符> | 安全密码 |
| DB_SYNC | false | 生产环境禁用同步 |
| DB_MAX_CONNECTIONS | 20 | 最大连接数 |
| DB_MIN_CONNECTIONS | 5 | 最小连接数 |
| DB_LOG_LEVEL | error | 仅记录错误 |

### 3. Redis配置

| 配置项 | 值 | 说明 |
|--------|-----|------|
| REDIS_HOST | localhost | 本地连接 |
| REDIS_PORT | 6379 | Redis默认端口 |
| REDIS_PASSWORD | <自动生成24字符> | 安全密码 |
| REDIS_DB | 0 | 默认数据库 |

### 4. Docker配置

| 配置项 | 值 | 说明 |
|--------|-----|------|
| DOCKER_SOCKET_PATH | /var/run/docker.sock | Docker套接字 |
| DOCKER_NETWORK | opclaw-network | Docker网络 |
| DOCKER_CONTAINER_CPU_LIMIT | 2.0 | CPU限制 |
| DOCKER_CONTAINER_MEMORY_LIMIT | 2g | 内存限制 |

---

## ⚠️ 手动配置项

以下配置项**必须**手动配置，脚本会生成占位符：

### 1. Feishu OAuth凭证

**获取方式**:
1. 访问 Feishu开放平台: https://open.feishu.cn/app
2. 创建企业自建应用
3. 获取 App ID 和 App Secret
4. 配置 OAuth 重定向 URI

**配置位置**: `/opt/opclaw/backend/.env`

**配置项**:
```env
FEISHU_APP_ID=cli_xxxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxx
FEISHU_REDIRECT_URI=https://renava.cn/oauth/callback
```

**验证方法**:
```bash
# SSH到服务器
ssh root@118.25.0.190

# 编辑环境文件
nano /opt/opclaw/backend/.env

# 更新后重启服务
pm2 restart opclaw-backend
```

### 2. DeepSeek API密钥

**获取方式**:
1. 访问 DeepSeek平台: https://platform.deepseek.com/
2. 注册/登录账号
3. 创建 API Key
4. 记录密钥字符串

**配置位置**: `/opt/opclaw/backend/.env`

**配置项**:
```env
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
DEEPSEEK_API_BASE=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
```

**API Key池配置** (可选):
```env
DEEPSEEK_API_KEY_POOL_ENABLED=true
DEEPSEEK_MIN_POOL_SIZE=5
DEEPSEEK_MAX_POOL_SIZE=20
```

---

## 🚀 配置流程

### Step 1: 生成环境配置

```bash
# 本地执行
cd /Users/arthurren/projects/AIOpc/scripts/cloud
./configure-backend-env.sh
```

**脚本执行内容**:
1. 生成所有安全密钥
2. 创建环境配置文件
3. 上传到服务器
4. 备份现有配置（如果存在）
5. 更新数据库密码
6. 更新Redis密码
7. 导出密钥到文件

**输出示例**:
```
==============================================================
  AIOpc Backend Environment Configuration
==============================================================

Server: root@118.25.0.190
Backend Directory: /opt/opclaw/backend
Output Directory: /tmp

==============================================================

==> Generating secure secrets...
[INFO] JWT secret generated
[INFO] Session secret generated
[INFO] Encryption key generated
[INFO] Database password generated
[INFO] Redis password generated
[INFO] Feishu verify token generated
[INFO] Feishu encrypt key generated
[SUCCESS] All secrets generated

==> Creating environment configuration file...
[SUCCESS] Environment file created: /tmp/backend.env

==> Uploading environment file to server...
[INFO] Backing up existing .env file...
[SUCCESS] Environment file uploaded

==> Updating database password...
[INFO] Updating PostgreSQL user password...
[SUCCESS] Database password updated

==> Updating Redis configuration...
[WARNING] Redis password not configured in redis.conf
[INFO] To enable Redis authentication, add to /etc/redis/redis.conf:
[INFO]   requirepass <password>

==> Exporting secrets for safe storage...
[SUCCESS] Secrets exported to: /tmp/opclaw-secrets-20260316_145230.txt
[INFO] To view secrets, use: cat /tmp/opclaw-secrets-20260316_145230.txt

==> Configuration Complete - Next Steps

Environment configuration completed successfully!

IMPORTANT: Manual configuration required:

1. Configure Feishu OAuth credentials:
   ssh root@118.25.0.190
   nano /opt/opclaw/backend/.env
   # Update FEISHU_APP_ID and FEISHU_APP_SECRET

2. Configure DeepSeek API key:
   # In the same file, update DEEPSEEK_API_KEY

3. Restart backend service:
   ssh root@118.25.0.190 'pm2 restart opclaw-backend'

4. Verify service health:
   ssh root@118.25.0.190 'curl http://localhost:3000/health'

5. Monitor service logs:
   ssh root@118.25.0.190 'pm2 logs opclaw-backend'

Secrets saved to: /tmp/opclaw-secrets-20260316_145230.txt
⚠️  Store securely and delete after configuration!

==============================================================
[SUCCESS] Environment configuration completed!
==============================================================
```

### Step 2: 手动配置Feishu OAuth

```bash
# SSH到服务器
ssh root@118.25.0.190

# 编辑环境文件
nano /opt/opclaw/backend/.env

# 更新以下行
FEISHU_APP_ID=cli_xxxxxxxxxxxxx        # 替换为实际值
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxx   # 替换为实际值

# 保存并退出 (Ctrl+X, Y, Enter)
```

### Step 3: 手动配置DeepSeek API

```bash
# 在同一文件中
nano /opt/opclaw/backend/.env

# 更新以下行
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx  # 替换为实际值

# 保存并退出
```

### Step 4: 重启后端服务

```bash
# 重启PM2服务
pm2 restart opclaw-backend

# 查看日志（确认启动成功）
pm2 logs opclaw-backend --lines 50
```

### Step 5: 验证配置

```bash
# 健康检查
curl http://localhost:3000/health

# 预期输出
# {"status":"healthy","timestamp":"2026-03-16T14:52:30.000Z"}

# 检查PM2进程状态
pm2 status

# 预期输出
# ┌──────┬─────────────────┬─────────────┬─────────┐
# │ ID   │ Name            │ State       │ CPU     │
# ├──────┼─────────────────┼─────────────┼─────────┤
# │ 0    │ opclaw-backend  │ online      │ 0.1%    │
# └──────┴─────────────────┴─────────────┴─────────┘
```

---

## 📁 密钥文件管理

### 生成的密钥文件

脚本会在输出目录生成密钥文件：
```
/tmp/opclaw-secrets-YYYYMMDD_HHMMSS.txt
```

**文件内容**:
```
# AIOpc Production Secrets
# Generated: 2026-03-16 14:52:30
# Server: root@118.25.0.190
# Backend Directory: /opt/opclaw/backend

# ============================================
# SECURITY WARNING
# ============================================
# Store this file securely and delete after configuration!
# Do not commit to version control or share insecurely!

# ============================================
# Database Credentials
# ============================================
Database User: opclaw
Database Password: <24-character-random-password>
Database Host: localhost
Database Port: 5432
Database Name: opclaw

# ============================================
# Redis Credentials
# ============================================
Redis Password: <24-character-random-password>
Redis Host: localhost
Redis Port: 6379

# ============================================
# JWT and Session Secrets
# ============================================
JWT Secret: <32-character-random-secret>
JWT Expiration: 7d
Session Secret: <32-character-random-secret>
Session Max Age: 604800000 (7 days)

# ============================================
# Encryption Keys
# ============================================
Encryption Key: <32-character-random-key>
Encryption Algorithm: aes-256-gcm

# ============================================
# Feishu OAuth Security
# ============================================
Verify Token: <32-character-random-token>
Encrypt Key: <32-character-random-key>

# ============================================
# Configuration Required
# ============================================
# The following values MUST be configured manually:
#
# 1. Feishu OAuth Credentials:
#    - FEISHU_APP_ID
#    - FEISHU_APP_SECRET
#    Get from: https://open.feishu.cn/app
#
# 2. DeepSeek API Key:
#    - DEEPSEEK_API_KEY
#    Get from: https://platform.deepseek.com/
#
# Update these values in: /opt/opclaw/backend/.env
# Then restart service: ssh root@118.25.0.190 'pm2 restart opclaw-backend'
```

**安全建议**:
1. ✅ 将密钥文件存储在安全位置（密码管理器、加密USB）
2. ✅ 文件权限已自动设置为 `600` (仅所有者读写)
3. ✅ 配置完成后删除密钥文件
4. ❌ 不要提交到版本控制
5. ❌ 不要通过不安全渠道传输

---

## 🔍 配置验证清单

### 自动配置验证

- [x] JWT密钥已生成 (32字符)
- [x] Session密钥已生成 (32字符)
- [x] 加密密钥已生成 (32字符)
- [x] 数据库密码已生成并更新
- [x] Redis密码已生成
- [x] Feishu安全令牌已生成
- [x] 环境文件已创建并上传
- [x] 文件权限已设置 (600)

### 手动配置验证

- [ ] Feishu App ID已配置
- [ ] Feishu App Secret已配置
- [ ] DeepSeek API Key已配置
- [ ] 后端服务已重启
- [ ] 健康检查通过
- [ ] OAuth流程测试通过
- [ ] LLM调用测试通过

---

## 🛠️ 故障排除

### 问题1: 数据库连接失败

**症状**: 后端日志显示数据库连接错误

**诊断**:
```bash
# 测试数据库连接
ssh root@118.25.0.190
sudo -u postgres psql -d opclaw -c "SELECT 1"

# 检查环境变量
cat /opt/opclaw/backend/.env | grep DB_

# 检查PostgreSQL状态
systemctl status postgresql
```

**解决**:
```bash
# 更新数据库密码
psql -U postgres -c "ALTER USER opclaw WITH PASSWORD '<new-password>';"

# 更新.env文件中的DB_PASSWORD
nano /opt/opclaw/backend/.env

# 重启服务
pm2 restart opclaw-backend
```

### 问题2: Redis连接失败

**症状**: 后端日志显示Redis连接错误

**诊断**:
```bash
# 测试Redis连接
redis-cli ping

# 检查Redis状态
systemctl status redis-server

# 检查Redis配置
cat /etc/redis/redis.conf | grep requirepass
```

**解决**:
```bash
# 配置Redis密码
nano /etc/redis/redis.conf
# 添加: requirepass <your-redis-password>

# 重启Redis
systemctl restart redis-server

# 验证
redis-cli -a <your-redis-password> ping
# 应该输出: PONG
```

### 问题3: OAuth重定向失败

**症状**: OAuth回调后显示错误

**诊断**:
```bash
# 检查Feishu配置
cat /opt/opclaw/backend/.env | grep FEISHU

# 验证重定向URI
echo "Feishu Redirect URI: https://renava.cn/oauth/callback"
```

**解决**:
1. 确认Feishu应用配置中的重定向URI匹配
2. 确认服务器可以从公网访问
3. 检查防火墙规则
4. 查看后端日志: `pm2 logs opclaw-backend`

### 问题4: DeepSeek API调用失败

**症状**: Agent无法响应，LLM调用超时

**诊断**:
```bash
# 检查API密钥配置
cat /opt/opclaw/backend/.env | grep DEEPSEEK

# 测试API连接
curl -X POST https://api.deepseek.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-api-key>" \
  -d '{
    "model": "deepseek-chat",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

**解决**:
1. 验证API密钥有效性
2. 检查API配额是否用尽
3. 验证网络连接到DeepSeek API
4. 检查后端日志查看详细错误

---

## 📊 配置参考

### 完整的环境变量列表

详见 `platform/backend/.env.production.example`

关键配置类别：
- 应用配置 (NODE_ENV, PORT, LOG_LEVEL)
- 数据库配置 (DB_*)
- Redis配置 (REDIS_*)
- Docker配置 (DOCKER_*)
- Feishu OAuth (FEISHU_*)
- DeepSeek LLM (DEEPSEEK_*)
- 安全配置 (JWT_*, SESSION_*, ENCRYPTION_*)
- CORS配置 (CORS_*)
- 速率限制 (RATE_LIMIT_*)
- 监控配置 (ENABLE_METRICS, HEALTH_CHECK_*)
- 日志配置 (LOG_*)
- 备份配置 (BACKUP_*)
- 实例管理 (INSTANCE_*)
- 功能开关 (FEATURE_*)

---

## ✅ 配置完成标准

生产环境配置完成当且仅当：

- ✅ 所有自动生成的密钥已创建
- ✅ 数据库密码已更新并验证
- ✅ Redis密码已配置（可选）
- ✅ Feishu OAuth凭证已配置
- ✅ DeepSeek API密钥已配置
- ✅ 后端服务重启成功
- ✅ 健康检查通过 (`/health` 返回 200)
- ✅ OAuth流程测试通过
- ✅ LLM调用测试通过
- ✅ 密钥文件已安全存储并从临时位置删除

---

**生成时间**: 2026-03-16
**文档版本**: 1.0
**状态**: ✅ 配置脚本已就绪
**下一步**: 执行配置脚本 → 手动配置Feishu和DeepSeek → 验证服务健康
