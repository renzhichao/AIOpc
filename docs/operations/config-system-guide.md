# 配置系统使用指南

> **Configuration System Usage Guide**
> **版本**: 1.0.0
> **创建日期**: 2026-03-19
> **任务**: TASK-007 配置系统实现

---

## 目录

1. [系统概述](#系统概述)
2. [配置模板结构](#配置模板结构)
3. [环境变量扩展](#环境变量扩展)
4. [配置验证](#配置验证)
5. [配置生成](#配置生成)
6. [使用场景](#使用场景)
7. [最佳实践](#最佳实践)

---

## 系统概述

### 设计目标

配置系统旨在为多租户部署提供灵活、安全、可验证的配置管理：

- **模板化**: 使用YAML模板统一配置结构
- **环境隔离**: 支持production/staging/development环境
- **变量扩展**: 支持环境变量引用和动态替换
- **验证保护**: 完整的Schema验证和Placeholder检测
- **安全第一**: 密钥强度验证和敏感信息保护

### 配置文件位置

```
config/tenants/
├── template.yml              # 配置模板
├── schema.json               # 配置Schema
├── test_tenant_alpha.yml     # 测试租户配置
└── [tenant_id].yml           # 其他租户配置
```

### 核心组件

1. **配置模板** (`template.yml`): 定义所有可能的配置项
2. **Schema定义** (`schema.json`): 验证规则和数据类型
3. **配置加载库** (`scripts/lib/config.sh`): 读取和解析配置
4. **验证库** (`scripts/lib/validation.sh`): 配置验证
5. **生成脚本** (`scripts/config/generate-config.sh`): 从模板生成配置

---

## 配置模板结构

### 完整模板示例

```yaml
# ============================================
# 租户基本信息
# ============================================
tenant:
  tenant_id: "tenant_001"                    # 租户唯一标识符
  tenant_name: "Production Tenant"            # 租户名称
  environment: "production"                   # 环境: production/staging/development
  description: "Main production tenant"       # 租户描述

# ============================================
# 服务器配置
# ============================================
server:
  ssh_host: "118.25.0.190"                   # SSH主机地址
  ssh_port: 22                                # SSH端口
  ssh_user: "root"                           # SSH用户
  ssh_key_path: "${HOME}/.ssh/tenant_key"    # SSH密钥路径
  deploy_path: "/opt/opclaw"                 # 部署路径
  backup_path: "/opt/opclaw/backups"         # 备份路径

# ============================================
# Feishu OAuth配置
# ============================================
feishu:
  app_id: "cli_xxxxxxxxxxxxx"                 # Feishu App ID (必须替换)
  app_secret: "${FEISHU_APP_SECRET}"         # Feishu App Secret (从环境变量读取)
  encrypt_key: "${FEISHU_ENCRYPT_KEY}"       # 加密密钥
  redirect_uri: "https://example.com/oauth/callback"  # 回调地址

# ============================================
# 数据库配置
# ============================================
database:
  host: "localhost"                          # 数据库主机
  port: 5432                                 # 数据库端口
  name: "opclaw"                             # 数据库名称
  user: "opclaw"                             # 数据库用户
  password: "${DB_PASSWORD}"                 # 数据库密码 (从环境变量读取)
  pool_size: 20                              # 连接池大小
  ssl: false                                 # 是否启用SSL
  timezone: "Asia/Shanghai"                  # 时区

# ============================================
# Redis配置
# ============================================
redis:
  host: "localhost"                          # Redis主机
  port: 6379                                 # Redis端口
  password: "${REDIS_PASSWORD}"              # Redis密码 (从环境变量读取)
  db: 0                                      # 数据库编号
  pool_size: 10                              # 连接池大小
  ttl: 3600                                  # 默认TTL (秒)

# ============================================
# JWT配置
# ============================================
jwt:
  secret: "${JWT_SECRET}"                    # JWT密钥 (从环境变量读取)
  algorithm: "HS256"                         # 算法
  expiry: "7d"                               # 过期时间
  refresh_expiry: "30d"                      # 刷新令牌过期时间

# ============================================
# 应用配置
# ============================================
application:
  node_env: "production"                     # Node环境
  port: 3000                                # 应用端口
  log_level: "info"                          # 日志级别
  cors_enabled: true                         # 是否启用CORS
  cors_origins:                              # CORS允许的源
    - "https://example.com"
    - "https://www.example.com"

# ============================================
# 监控配置
# ============================================
monitoring:
  enabled: true                              # 是否启用监控
  prometheus_port: 9090                     # Prometheus端口
  health_check_interval: 30000               # 健康检查间隔(毫秒)
  metrics_path: "/metrics"                   # 指标路径

# ============================================
# 备份配置
# ============================================
backup:
  enabled: true                              # 是否启用备份
  schedule: "0 2 * * *"                      # Cron表达式 (每天凌晨2点)
  retention_days: 30                         # 保留天数
  backup_path: "/opt/opclaw/backups"         # 备份路径
  compression: true                          # 是否压缩
```

### 配置字段说明

#### tenant - 租户信息

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| tenant_id | string | ✅ | 租户唯一标识符，只允许字母、数字、下划线、连字符 |
| tenant_name | string | ✅ | 租户显示名称 |
| environment | string | ✅ | 环境类型，必须是: production/staging/development |
| description | string | ❌ | 租户描述信息 |

#### server - 服务器配置

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| ssh_host | string | ✅ | SSH主机地址 (IP或域名) |
| ssh_port | integer | ✅ | SSH端口，默认22 |
| ssh_user | string | ✅ | SSH用户名，通常是root |
| ssh_key_path | string | ✅ | SSH私钥路径，支持环境变量 |
| deploy_path | string | ✅ | 部署目标路径 |
| backup_path | string | ✅ | 备份存储路径 |

#### feishu - Feishu OAuth配置

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| app_id | string | ✅ | Feishu应用ID，格式: cli_xxxxxxxxxxxxx |
| app_secret | string | ✅ | Feishu应用密钥，敏感信息 |
| encrypt_key | string | ✅ | 加密密钥 |
| redirect_uri | string | ✅ | OAuth回调地址 |

#### database - 数据库配置

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| host | string | ✅ | 数据库主机地址 |
| port | integer | ✅ | 数据库端口，默认5432 |
| name | string | ✅ | 数据库名称 |
| user | string | ✅ | 数据库用户名 |
| password | string | ✅ | 数据库密码，敏感信息 |
| pool_size | integer | ❌ | 连接池大小，默认20 |
| ssl | boolean | ❌ | 是否启用SSL，默认false |
| timezone | string | ❌ | 数据库时区，默认Asia/Shanghai |

---

## 环境变量扩展

### 基本语法

配置文件支持环境变量引用，使用 `${VARIABLE_NAME}` 语法：

```yaml
feishu:
  app_secret: "${FEISHU_APP_SECRET}"         # 从环境变量读取
  app_id: "cli_${TENANT_ID}_app"               # 拼接字符串
  backup_path: "${HOME}/backups"              # 使用HOME变量
```

### 默认值

支持设置默认值，当环境变量不存在时使用默认值：

```yaml
database:
  password: "${DB_PASSWORD:-defaultPassword123}"  # 使用默认值
  host: "${DB_HOST:-localhost}"                    # 默认localhost
```

### 必需变量

标记环境变量为必需（不存在时报错）：

```yaml
feishu:
  app_secret: "${FEISHU_APP_SECRET:?Feishu App Secret is required}"
  # 如果FEISHU_APP_SECRET不存在，将报错并显示消息
```

### 常用环境变量

| 变量名 | 用途 | 示例值 |
|--------|------|--------|
| HOME | 用户主目录 | /Users/username |
| TENANT_ID | 租户ID | tenant_001 |
| FEISHU_APP_SECRET | Feishu密钥 | L0cHQDBbEiIys6AHW53miecONb1xA4qy |
| JWT_SECRET | JWT密钥 | suNsfjHj2nwpvIUT/gB4UZSETSaAnOVC... |
| DB_PASSWORD | 数据库密码 | secure_password_123 |
| REDIS_PASSWORD | Redis密码 | redis_password_456 |

### 环境变量优先级

1. **系统环境变量**: 最高优先级
2. **.env文件**: 从项目根目录的.env文件读取
3. **Shell配置**: 从~/.bashrc或~/.zshrc读取
4. **默认值**: 在配置中指定的默认值

---

## 配置验证

### 验证层次

配置验证分为四个层次：

#### 1. 语法验证 (Syntax Validation)

检查YAML语法是否正确：

```bash
# 使用yq工具验证语法
yq eval 'true' config/tenants/tenant_001.yml

# 或使用配置验证脚本
./scripts/config/validate-config.sh --syntax config/tenants/tenant_001.yml
```

#### 2. Schema验证 (Schema Validation)

根据schema.json验证配置结构：

```bash
# 完整Schema验证
./scripts/config/validate-config.sh --schema config/tenants/tenant_001.yml

# 输出示例:
# ✓ Schema validation passed
# ✓ All required fields present
# ✓ Data types correct
```

#### 3. 业务规则验证 (Business Rule Validation)

验证业务规则和逻辑约束：

```bash
# 业务规则验证
./scripts/config/validate-config.sh --rules config/tenants/tenant_001.yml

# 验证项:
# ✓ tenant_id format valid
# ✓ environment value is one of: production, staging, development
# ✓ feishu.app_id format valid (cli_xxxxxxxxxxxxx)
# ✓ database.port in range 1-65535
# ✓ jwt.expiry format valid (number + unit)
```

#### 4. 安全验证 (Security Validation)

检查安全相关配置：

```bash
# 安全验证
./scripts/config/validate-config.sh --security config/tenants/tenant_001.yml

# 检查项:
# ✓ No placeholder values (cli_xxxxxxxxxxxxx)
# ✓ Password strength >16 characters
# ✓ JWT secret strength >32 characters
# ✓ No hardcoded secrets in sensitive fields
```

### 验证规则详解

#### 必需字段验证

```json
{
  "required": [
    "tenant.tenant_id",
    "tenant.tenant_name",
    "tenant.environment",
    "server.ssh_host",
    "server.ssh_user",
    "feishu.app_id",
    "database.host",
    "database.name"
  ]
}
```

#### 数据类型验证

```json
{
  "types": {
    "server.ssh_port": "integer",
    "server.ssh_host": "string",
    "database.ssl": "boolean",
    "database.pool_size": "integer",
    "application.cors_origins": "array"
  }
}
```

#### 值范围验证

```json
{
  "ranges": {
    "server.ssh_port": {"min": 1, "max": 65535},
    "database.port": {"min": 1, "max": 65535},
    "redis.port": {"min": 1, "max": 65535},
    "database.pool_size": {"min": 1, "max": 100}
  }
}
```

#### 格式验证

```json
{
  "formats": {
    "tenant.tenant_id": "^[a-z][a-z0-9_]*$",
    "tenant.environment": "^(production|staging|development)$",
    "feishu.app_id": "^cli_[a-z0-9]{15}$",
    "database.host": "^[a-zA-Z0-9.-]+$",
    "jwt.expiry": "^[0-9]+(ms|s|m|h|d)$"
  }
}
```

### Placeholder检测

自动检测常见的placeholder值：

```bash
# 检测placeholder
./scripts/config/validate-config.sh --placeholders config/tenants/tenant_001.yml

# 检测到的placeholder:
# ✗ feishu.app_id: cli_xxxxxxxxxxxxx (placeholder detected)
# ✗ database.password: your_secure_password (weak password)
# ✗ jwt.secret: change_this_secret (placeholder detected)
```

---

## 配置生成

### 从模板生成配置

使用配置模板生成新的租户配置：

```bash
# 交互式生成
./scripts/config/generate-config.sh --interactive

# 命令行参数生成
./scripts/config/generate-config.sh \
  --template config/tenants/template.yml \
  --output config/tenants/new_tenant.yml \
  --tenant-id new_tenant \
  --tenant-name "New Tenant" \
  --environment production \
  --server-host 192.168.1.100 \
  --feishu-app-id cli_new123456789
```

### 批量生成配置

为多个环境生成配置：

```bash
# 为staging和production生成配置
for env in staging production; do
  ./scripts/config/generate-config.sh \
    --template config/tenants/template.yml \
    --output config/tenants/tenant_001_${env}.yml \
    --tenant-id tenant_001 \
    --environment ${env} \
    --server-host 118.25.0.190 \
    --feishu-app-id cli_a93ce5614ce11bd6
done
```

### 配置合并

合并多个配置源：

```bash
# 合并基础配置和环境特定配置
./scripts/config/generate-config.sh \
  --base config/tenants/base.yml \
  --override config/tenants/production-overrides.yml \
  --output config/tenants/tenant_001_production.yml
```

### 环境变量替换

生成配置并替换环境变量：

```bash
# 导出环境变量
export FEISHU_APP_SECRET="L0cHQDBbEiIys6AHW53miecONb1xA4qy"
export DB_PASSWORD="secure_password_123"
export JWT_SECRET="suNsfjHj2nwpvIUT/gB4UZSETSaAnOVCnoylIp4Oo6HiVz/b0Yh/hRA1fQGa/a0U"

# 生成配置并替换环境变量
./scripts/config/generate-config.sh \
  --template config/tenants/template.yml \
  --output config/tenants/tenant_001.yml \
  --env-file .env.production
```

---

## 使用场景

### 场景1: 创建新租户配置

```bash
# 1. 复制模板
cp config/tenants/template.yml config/tenants/customer_a.yml

# 2. 编辑配置
vim config/tenants/customer_a.yml

# 3. 验证配置
./scripts/config/validate-config.sh config/tenants/customer_a.yml

# 4. 测试加载
./scripts/lib/config.sh test --config config/tenants/customer_a.yml
```

### 场景2: 更新生产配置

```bash
# 1. 备份现有配置
cp config/tenants/tenant_001.yml config/tenants/tenant_001.yml.backup

# 2. 编辑配置
vim config/tenants/tenant_001.yml

# 3. 验证更改
./scripts/config/validate-config.sh \
  --before config/tenants/tenant_001.yml.backup \
  --after config/tenants/tenant_001.yml

# 4. 检测配置漂移
./scripts/monitoring/detect-config-drift.sh \
  --tenant tenant_001 \
  --config config/tenants/tenant_001.yml

# 5. 部署配置
./scripts/deploy/deploy-tenant.sh \
  --config config/tenants/tenant_001.yml \
  --component all
```

### 场景3: 环境迁移

```bash
# 1. 从staging创建production配置
./scripts/config/generate-config.sh \
  --source config/tenants/tenant_001_staging.yml \
  --output config/tenants/tenant_001_production.yml \
  --environment production \
  --update-server

# 2. 更新生产特定配置
vim config/tenants/tenant_001_production.yml

# 3. 验证生产配置
./scripts/config/validate-config.sh \
  --security \
  config/tenants/tenant_001_production.yml

# 4. 部署到生产
./scripts/deploy/deploy-tenant.sh \
  --config config/tenants/tenant_001_production.yml
```

### 场景4: 配置审查

```bash
# 完整配置审查
./scripts/config/validate-config.sh \
  --full \
  config/tenants/tenant_001.yml

# 输出:
# Configuration Audit Report
# =========================
# ✓ Syntax validation: PASS
# ✓ Schema validation: PASS
# ✓ Business rules: PASS
# ⚠ Security warnings:
#   - database.password: Consider using environment variable
#   - feishu.app_id: Verify this is the correct production ID
# ⚠ Recommendations:
#   - Enable SSL for database connections
#   - Set up backup monitoring
#   - Review CORS origins list
```

---

## 最佳实践

### 配置文件组织

#### 1. 使用版本控制

```bash
# 将配置文件纳入Git
git add config/tenants/*.yml
git commit -m "Add customer_a configuration"

# 但排除敏感信息
echo "*.env" >> .gitignore
echo "**/*.secret.yml" >> .gitignore
```

#### 2. 配置文件命名规范

```
config/tenants/
├── template.yml                    # 配置模板
├── base.yml                        # 基础配置
├── production-overrides.yml        # 生产环境覆盖
├── staging-overrides.yml           # Staging环境覆盖
├── development-overrides.yml       # 开发环境覆盖
├── tenant_001.yml                  # 租户001配置
├── tenant_001_staging.yml          # 租户001 Staging配置
├── tenant_002.yml                  # 租户002配置
└── test_tenant_alpha.yml           # 测试租户配置
```

#### 3. 配置分层管理

```yaml
# base.yml - 基础配置
tenant:
  tenant_id: "common"
  environment: "production"

server:
  deploy_path: "/opt/opclaw"

# tenant_001.yml - 租户特定配置
extends: base.yml

tenant:
  tenant_id: "tenant_001"
  tenant_name: "Customer A"

server:
  ssh_host: "118.25.0.190"
```

### 敏感信息处理

#### 1. 使用环境变量

```yaml
# ✅ 好的做法 - 使用环境变量
database:
  password: "${DB_PASSWORD}"

# ❌ 不好的做法 - 硬编码密码
database:
  password: "hardcoded_password_123"
```

#### 2. 分离敏感配置

```bash
# config/tenants/tenant_001.yml - 非敏感配置
tenant:
  tenant_id: "tenant_001"
  tenant_name: "Customer A"

server:
  ssh_host: "118.25.0.190"
  ssh_user: "root"

# config/tenants/tenant_001.secret.yml - 敏感配置
feishu:
  app_secret: "L0cHQDBbEiIys6AHW53miecONb1xA4qy"

database:
  password: "secure_password_123"

# .gitignore - 排除敏感文件
*.secret.yml
.env.*
```

#### 3. 密钥强度要求

```bash
# 密码验证规则
- 最小长度: 16字符
- 必须包含: 大写字母、小写字母、数字、特殊字符
- 不允许: 常见密码、字典单词、重复字符

# JWT密钥验证规则
- 最小长度: 32字符
- 必须使用: 随机生成的强密钥
- 推荐使用: openssl rand -base64 32
```

### 配置验证流程

#### 1. 开发阶段

```bash
# 编辑配置
vim config/tenants/new_tenant.yml

# 语法验证
yq eval 'true' config/tenants/new_tenant.yml

# Schema验证
./scripts/config/validate-config.sh --schema config/tenants/new_tenant.yml
```

#### 2. 测试阶段

```bash
# 完整验证
./scripts/config/validate-config.sh --full config/tenants/new_tenant.yml

# 加载测试
./scripts/lib/config.sh test --config config/tenants/new_tenant.yml

# 部署前检查
./scripts/deploy/pre-flight-checks.sh --config config/tenants/new_tenant.yml
```

#### 3. 生产部署

```bash
# 安全验证
./scripts/config/validate-config.sh --security config/tenants/tenant_001.yml

# 配置漂移检测
./scripts/monitoring/detect-config-drift.sh --tenant tenant_001

# 部署
./scripts/deploy/deploy-tenant.sh --config config/tenants/tenant_001.yml
```

### 配置维护

#### 1. 定期审查

```bash
# 每月检查配置
./scripts/config/validate-config.sh --full config/tenants/*.yml

# 检查配置漂移
./scripts/monitoring/detect-config-drift.sh --all-tenants

# 审查访问权限
find config/tenants/ -name "*.yml" -exec ls -la {} \;
```

#### 2. 版本管理

```bash
# 配置变更记录
git log --oneline config/tenants/tenant_001.yml

# 配置差异对比
git diff HEAD~1 config/tenants/tenant_001.yml

# 回滚到之前版本
git checkout HEAD~1 config/tenants/tenant_001.yml
```

#### 3. 备份和恢复

```bash
# 备份配置
mkdir -p config/backups
cp config/tenants/tenant_001.yml config/backups/tenant_001_$(date +%Y%m%d).yml

# 恢复配置
cp config/backups/tenant_001_20260319.yml config/tenants/tenant_001.yml
```

---

## 故障排查

### 常见问题

#### 问题1: YAML语法错误

**症状**:
```
Error: Unable to parse YAML file
```

**解决方案**:
```bash
# 验证YAML语法
yq eval 'true' config/tenants/tenant_001.yml

# 检查缩进
cat -A config/tenants/tenant_001.yml | grep -E "^\s*\*"

# 使用在线验证器
# https://www.yamllint.com/
```

#### 问题2: 环境变量未定义

**症状**:
```
Error: Environment variable 'FEISHU_APP_SECRET' not found
```

**解决方案**:
```bash
# 检查环境变量
echo ${FEISHU_APP_SECRET:-undefined}

# 导出环境变量
export FEISHU_APP_SECRET="L0cHQDBbEiIys6AHW53miecONb1xA4qy"

# 或使用.env文件
echo "FEISHU_APP_SECRET=L0cHQDBbEiIys6AHW53miecONb1xA4qy" >> .env
```

#### 问题3: 配置验证失败

**症状**:
```
Validation failed: tenant.tenant_id format invalid
```

**解决方案**:
```bash
# 查看详细错误
./scripts/config/validate-config.sh --verbose config/tenants/tenant_001.yml

# 检查Schema规则
cat config/tenants/schema.json | jq '.rules.tenant.tenant_id'

# 修正配置
# tenant_id必须是: 小写字母开头，只包含字母、数字、下划线
```

#### 问题4: Placeholder值未检测

**症状**:
生产环境中仍然使用placeholder值

**解决方案**:
```bash
# 强制安全验证
./scripts/config/validate-config.sh \
  --security \
  --strict \
  config/tenants/tenant_001.yml

# 检查所有可能的placeholder
grep -r "cli_xxxxxxxxxxxxx\|CHANGE_THIS\|your_" config/tenants/

# 更新placeholder值
# 将 cli_xxxxxxxxxxxxx 替换为真实的 App ID
```

---

## 附录

### 快速参考

#### 配置文件结构

```
config/tenants/
├── template.yml              # 配置模板 (425行)
├── schema.json               # Schema定义 (620行)
├── tenant_001.yml            # 租户配置
├── tenant_001_staging.yml    # Staging配置
└── test_tenant_alpha.yml     # 测试租户配置
```

#### 验证命令

```bash
# 语法验证
yq eval 'true' config.yml

# Schema验证
./scripts/config/validate-config.sh --schema config.yml

# 完整验证
./scripts/config/validate-config.sh --full config.yml

# 安全验证
./scripts/config/validate-config.sh --security config.yml
```

#### 生成命令

```bash
# 交互式生成
./scripts/config/generate-config.sh --interactive

# 从模板生成
./scripts/config/generate-config.sh \
  --template template.yml \
  --output new_tenant.yml \
  --tenant-id new_tenant

# 批量生成
for env in staging production; do
  ./scripts/config/generate-config.sh \
    --environment ${env} \
    --output tenant_001_${env}.yml
done
```

---

**文档版本**: 1.0.0
**最后更新**: 2026-03-19
**维护者**: AIOpc DevOps Team
