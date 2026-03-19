# Phase 0 & 1 故障排查指南

> **Troubleshooting Guide for Phase 0 & 1**
> **版本**: 1.0.0
> **创建日期**: 2026-03-19
> **适用范围**: TASK-001 至 TASK-009

---

## 目录

1. [概述](#概述)
2. [备份和恢复问题](#备份和恢复问题)
3. [健康检查问题](#健康检查问题)
4. [配置漂移问题](#配置漂移问题)
5. [回滚问题](#回滚问题)
6. [状态数据库问题](#状态数据库问题)
7. [配置系统问题](#配置系统问题)
8. [脚本库问题](#脚本库问题)
9. [诊断工具](#诊断工具)

---

## 概述

### 文档目的

本指南提供Phase 0 & 1实施过程中可能遇到的问题的诊断步骤和解决方案。

### 问题分类

- 🔴 **CRITICAL**: 影响生产环境，需要立即处理
- 🟡 **WARNING**: 可能影响功能，需要尽快处理
- 🟢 **INFO**: 信息性问题，可以稍后处理

### 报告问题

遇到问题时，请收集以下信息：

```bash
# 系统信息
uname -a > /tmp/system_info.txt
df -h >> /tmp/system_info.txt
docker ps >> /tmp/system_info.txt

# 日志信息
docker logs opclaw-backend --tail 100 > /tmp/backend.log
docker logs opclaw-postgres --tail 100 > /tmp/postgres.log

# 配置信息
cp config/tenants/*.yml /tmp/config_backup/
```

---

## 备份和恢复问题

### 问题1: 备份创建失败

**症状**:
```
Error: Backup creation failed
Permission denied
```

**诊断步骤**:
```bash
# 1. 检查磁盘空间
df -h /opt/opclaw/backups

# 2. 检查目录权限
ls -la /opt/opclaw/backups

# 3. 检查Docker容器状态
docker ps | grep postgres

# 4. 手动测试备份
docker exec opclaw-postgres pg_dump -U opclaw -d opclaw > /tmp/test_backup.sql
```

**解决方案**:
```bash
# 方案1: 创建备份目录
mkdir -p /opt/opclaw/backups
chmod 700 /opt/opclaw/backups

# 方案2: 修复磁盘空间问题
# 清理旧备份
find /opt/opclaw/backups -name "*.sql.gz" -mtime +30 -delete

# 方案3: 修复权限问题
chown -R $(whoami):$(whoami) /opt/opclaw/backups
```

### 问题2: 备份验证失败

**症状**:
```
Checksum verification failed
Backup file corrupted
```

**诊断步骤**:
```bash
# 1. 检查校验和文件
cat /opt/opclaw/backups/20260319_115707/checksums.txt

# 2. 手动验证校验和
sha256sum -c /opt/opclaw/backups/20260319_115707/checksums.txt

# 3. 检查备份文件完整性
gzip -t /opt/opclaw/backups/20260319_115707/database/opclaw_full.sql.gz
```

**解决方案**:
```bash
# 方案1: 重新生成校验和
cd /opt/opclaw/backups/20260319_115707
sha256sum database/* > checksums.txt
sha256sum config/* >> checksums.txt
sha256sum code/* >> checksums.txt

# 方案2: 删除损坏的备份并重新备份
rm -rf /opt/opclaw/backups/20260319_115707
./scripts/backup/backup-production.sh --full
```

### 问题3: 恢复测试失败

**症状**:
```
Restore test failed: Database connection error
Permission denied
```

**诊断步骤**:
```bash
# 1. 检查测试数据库
docker exec opclaw-postgres psql -U opclaw -d opclaw_test -c "SELECT 1"

# 2. 检查备份文件
gunzip -c /opt/opclaw/backups/20260319_115707/database/opclaw_full.sql.gz | head -n 50

# 3. 检查磁盘空间
df -h /tmp
```

**解决方案**:
```bash
# 方案1: 创建测试数据库
docker exec opclaw-postgres psql -U opclaw -d opclaw -c "CREATE DATABASE opclaw_test;"

# 方案2: 清理临时空间
rm -rf /tmp/opclaw-restore-test/*

# 方案3: 手动恢复测试
gunzip -c /opt/opclaw/backups/20260319_115707/database/opclaw_full.sql.gz | \
  docker exec -i opclaw-postgres psql -U opclaw -d opclaw_test
```

---

## 健康检查问题

### 问题1: HTTP健康检查失败

**症状**:
```
HTTP health check failed: HTTP 502
Backend not responding
```

**诊断步骤**:
```bash
# 1. 检查后端容器状态
docker ps | grep opclaw-backend

# 2. 检查后端日志
docker logs opclaw-backend --tail 100

# 3. 手动HTTP测试
curl -v http://localhost:3000/health

# 4. 检查端口绑定
docker port opclaw-backend
```

**解决方案**:
```bash
# 方案1: 重启后端容器
docker restart opclaw-backend
sleep 10
curl http://localhost:3000/health

# 方案2: 检查环境变量
docker exec opclaw-backend env | grep -E "NODE_ENV|PORT|DATABASE_URL"

# 方案3: 查看详细错误
docker logs opclaw-backend --tail 200 | grep -i error
```

### 问题2: 数据库健康检查失败

**症状**:
```
Database connectivity check failed
Connection refused
```

**诊断步骤**:
```bash
# 1. 检查PostgreSQL容器
docker ps | grep postgres

# 2. 检查数据库连接
docker exec opclaw-postgres pg_isready -U opclaw

# 3. 检查数据库日志
docker logs opclaw-postgres --tail 50

# 4. 测试数据库查询
docker exec opclaw-postgres psql -U opclaw -d opclaw -c "SELECT 1"
```

**解决方案**:
```bash
# 方案1: 重启数据库容器
docker restart opclaw-postgres
sleep 5
docker exec opclaw-postgres pg_isready -U opclaw

# 方案2: 检查数据库密码
docker exec opclaw-postgres psql -U opclaw -d opclaw -c "\conninfo"

# 方案3: 验证数据库配置
# 检查.env.production中的数据库配置
grep -E "DB_HOST|DB_PORT|DB_NAME|DB_USER" .env.production
```

### 问题3: OAuth健康检查失败

**症状**:
```
OAuth configuration check failed
Invalid Feishu App ID
```

**诊断步骤**:
```bash
# 1. 检查Feishu配置
docker exec opclaw-backend env | grep FEISHU

# 2. 测试OAuth配置
curl -X POST http://localhost:3000/api/test/oauth/config \
  -H "Content-Type: application/json" \
  -d '{"app_id":"cli_a93ce5614ce11bd6"}'

# 3. 检查应用日志
docker logs opclaw-backend --tail 100 | grep -i oauth
```

**解决方案**:
```bash
# 方案1: 验证Feishu App ID
# 确认配置文件中的App ID格式为: cli_xxxxxxxxxxxxx
grep "FEISHU_APP_ID" .env.production

# 方案2: 检查App Secret
# 确保App Secret正确且未过期
grep "FEISHU_APP_SECRET" .env.production

# 方案3: 测试OAuth流程
# 手动测试OAuth登录流程
```

### 问题4: Redis健康检查失败

**症状**:
```
Redis connectivity check failed
Connection refused
```

**诊断步骤**:
```bash
# 1. 检查Redis容器
docker ps | grep redis

# 2. 测试Redis连接
docker exec opclaw-redis redis-cli -a ${REDIS_PASSWORD} PING

# 3. 检查Redis日志
docker logs opclaw-redis --tail 50
```

**解决方案**:
```bash
# 方案1: 重启Redis容器
docker restart opclaw-redis
sleep 5
docker exec opclaw-redis redis-cli -a ${REDIS_PASSWORD} PING

# 方案2: 验证Redis密码
grep "REDIS_PASSWORD" .env.production

# 方案3: 检查Redis配置
docker exec opclaw-redis redis-cli CONFIG GET requirepass
```

---

## 配置漂移问题

### 问题1: 配置漂移误报

**症状**:
```
Config drift detected but values are actually correct
False positive drift detection
```

**诊断步骤**:
```bash
# 1. 运行详细漂移检测
./scripts/monitoring/detect-config-drift.sh \
  --tenant tenant_001 \
  --verbose

# 2. 检查白名单配置
./scripts/lib/config.sh test --whitelist

# 3. 手动对比配置
diff <(grep FEISHU_APP_ID config/tenants/tenant_001.yml) \
     <(docker exec opclaw-backend env | grep FEISHU_APP_ID)
```

**解决方案**:
```bash
# 方案1: 添加到白名单
# 在scripts/lib/config.sh中添加变量到DRIFT_WHITELIST

# 方案2: 更新Git配置
# 将运行中的正确配置更新到Git
docker exec opclaw-backend env | grep FEISHU_APP_ID >> config/tenants/tenant_001.yml

# 方案3: 标记为预期差异
# 记录到state database作为预期差异
```

### 问题2: 配置漂移无法修复

**症状**:
```
Config drift detected but unable to fix
Configuration keeps reverting
```

**诊断步骤**:
```bash
# 1. 检查配置文件权限
ls -la config/tenants/tenant_001.yml

# 2. 检查Git状态
git status config/tenants/tenant_001.yml

# 3. 检查部署脚本
cat scripts/deploy/deploy-tenant.sh | grep -A10 "env_file"
```

**解决方案**:
```bash
# 方案1: 修复配置文件权限
chmod 600 config/tenants/tenant_001.yml

# 方案2: 更新Git配置
vim config/tenants/tenant_001.yml
git add config/tenants/tenant_001.yml
git commit -m "Fix configuration drift"

# 方案3: 重新部署
./scripts/deploy/deploy-tenant.sh \
  --config config/tenants/tenant_001.yml \
  --component all
```

---

## 回滚问题

### 问题1: 回滚脚本执行失败

**症状**:
```
Rollback script failed
Unable to restore from backup
```

**诊断步骤**:
```bash
# 1. 检查备份文件
ls -la /opt/opclaw/backups/ | tail -5

# 2. 验证备份完整性
./scripts/backup/verify-backup.sh \
  --path /opt/opclaw/backups/$(ls -t /opt/opclaw/backups | head -1)

# 3. 检查回滚日志
./scripts/deploy/rollback.sh --dry-run --tenant tenant_001
```

**解决方案**:
```bash
# 方案1: 手动回滚数据库
gunzip -c /opt/opclaw/backups/latest/database/opclaw_full.sql.gz | \
  docker exec -i opclaw-postgres psql -U opclaw -d opclaw

# 方案2: 手动回滚代码
cd /opt/opclaw/platform/backend
git reset --hard HEAD~1

# 方案3: 手动回滚配置
cp /opt/opclaw/backups/latest/config/.env.production \
   /opt/opclaw/platform/backend/.env.production
docker restart opclaw-backend
```

### 问题2: 回滚后健康检查仍然失败

**症状**:
```
Rollback completed but health check still failing
Services not responding after rollback
```

**诊断步骤**:
```bash
# 1. 检查回滚后的版本
git log --oneline -5

# 2. 检查容器状态
docker ps -a | grep opclaw

# 3. 运行完整健康检查
./scripts/monitoring/enhanced-health-check.sh --verbose

# 4. 检查应用日志
docker logs opclaw-backend --tail 200
```

**解决方案**:
```bash
# 方案1: 清理并重启
docker-compose down
docker-compose up -d

# 方案2: 重新构建镜像
docker-compose build --no-cache backend
docker-compose up -d backend

# 方案3: 恢复到更早的版本
# 找到更早的稳定版本
git log --oneline | head -20
git reset --hard <stable_commit_sha>
docker-compose up -d --force-recreate
```

---

## 状态数据库问题

### 问题1: 数据库连接失败

**症状**:
```
Connection to deployment_state database failed
FATAL: database "deployment_state" does not exist
```

**诊断步骤**:
```bash
# 1. 检查数据库是否存在
docker exec opclaw-postgres psql -U opclaw -d postgres -c "\l" | grep deployment_state

# 2. 检查数据库用户
docker exec opclaw-postgres psql -U opclaw -d postgres -c "\du" | grep opclaw_state

# 3. 测试连接
docker exec opclaw-postgres psql -U opclaw -d deployment_state -c "SELECT 1"
```

**解决方案**:
```bash
# 方案1: 创建数据库
docker exec opclaw-postgres psql -U opclaw -d postgres -c "CREATE DATABASE deployment_state;"

# 方案2: 初始化Schema
docker exec -i opclaw-postgres psql -U opclaw -d deployment_state < scripts/state/schema.sql

# 方案3: 创建用户
docker exec opclaw-postgres psql -U opclaw -d postgres -c \
  "CREATE USER opclaw_state WITH PASSWORD 'secure_password';"
docker exec opclaw-postgres psql -U opclaw -d postgres -c \
  "GRANT ALL PRIVILEGES ON DATABASE deployment_state TO opclaw_state;"
```

### 问题2: 数据库表不存在

**症状**:
```
ERROR: relation "deployments" does not exist
Table not found
```

**诊断步骤**:
```bash
# 1. 检查表列表
docker exec opclaw-postgres psql -U opclaw -d deployment_state -c "\dt"

# 2. 检查Schema文件
cat scripts/state/schema.sql | head -50

# 3. 验证Schema是否执行
docker exec opclaw-postgres psql -U opclaw -d deployment_state -c \
  "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';"
```

**解决方案**:
```bash
# 方案1: 重新执行Schema
docker exec -i opclaw-postgres psql -U opclaw -d deployment_state < scripts/state/schema.sql

# 方案2: 验证表创建
docker exec opclaw-postgres psql -U opclaw -d deployment_state -c \
  "SELECT * FROM health_check();"
```

---

## 配置系统问题

### 问题1: 配置文件加载失败

**症状**:
```
Error loading configuration file
YAML parse error
```

**诊断步骤**:
```bash
# 1. 验证YAML语法
yq eval 'true' config/tenants/tenant_001.yml

# 2. 检查文件权限
ls -la config/tenants/tenant_001.yml

# 3. 检查文件编码
file -I config/tenants/tenant_001.yml

# 4. 查看YAML错误详情
yq eval '.' config/tenants/tenant_001.yml 2>&1 | head -20
```

**解决方案**:
```bash
# 方案1: 修复YAML语法
# 常见问题: 缩进错误、特殊字符未转义、引号不匹配
# 使用在线工具验证: https://www.yamllint.com/

# 方案2: 修复文件编码
# 确保文件为UTF-8编码
iconv -f UTF-8 -t UTF-8 config/tenants/tenant_001.yml > config/tenants/tenant_001_fixed.yml
mv config/tenants/tenant_001_fixed.yml config/tenants/tenant_001.yml

# 方案3: 重新生成配置
cp config/tenants/template.yml config/tenants/tenant_001.yml
# 然后重新编辑
```

### 问题2: 环境变量未扩展

**症状**:
```
Environment variable not expanded
${DB_PASSWORD} literal value in config
```

**诊断步骤**:
```bash
# 1. 检查环境变量
echo ${DB_PASSWORD:-undefined}

# 2. 检查.env文件
cat .env.production | grep DB_PASSWORD

# 3. 测试配置加载
./scripts/lib/config.sh test --config config/tenants/tenant_001.yml
```

**解决方案**:
```bash
# 方案1: 导出环境变量
export DB_PASSWORD="secure_password_123"
export JWT_SECRET="your_jwt_secret_here"

# 方案2: 使用.env文件
echo "DB_PASSWORD=secure_password_123" >> .env.production
echo "JWT_SECRET=your_jwt_secret_here" >> .env.production

# 方案3: 在配置中使用默认值
# database:
#   password: "${DB_PASSWORD:-defaultPassword123}"
```

---

## 脚本库问题

### 问题1: 日志库函数未找到

**症状**:
```
log_info: command not found
log_error: function not defined
```

**诊断步骤**:
```bash
# 1. 检查库文件是否存在
ls -la scripts/lib/logging.sh

# 2. 检查source语句
grep "source.*logging.sh" your_script.sh

# 3. 检查库函数定义
grep "log_info" scripts/lib/logging.sh
```

**解决方案**:
```bash
# 方案1: 正确加载库
# 在脚本开头添加:
source scripts/lib/logging.sh
# 或使用绝对路径:
source /path/to/AIOpc/scripts/lib/logging.sh

# 方案2: 检查文件权限
chmod +x scripts/lib/logging.sh

# 方案3: 初始化日志系统
log_init "your_script_name"
```

### 问题2: SSH连接失败

**症状**:
```
SSH connection failed
Connection timeout
Permission denied (publickey)
```

**诊断步骤**:
```bash
# 1. 测试SSH连接
ssh -i ~/.ssh/tenant_key -o ConnectTimeout=10 -o StrictHostKeyChecking=no \
  root@118.25.0.190 "echo 'Connection successful'"

# 2. 检查SSH密钥
ls -la ~/.ssh/tenant_key*

# 3. 检查服务器SSH配置
# 在服务器上运行:
# grep "PasswordAuthentication" /etc/ssh/sshd_config
# grep "PubkeyAuthentication" /etc/ssh/sshd_config
```

**解决方案**:
```bash
# 方案1: 修复密钥权限
chmod 600 ~/.ssh/tenant_key
chmod 644 ~/.ssh/tenant_key.pub

# 方案2: 测试密钥连接
ssh -i ~/.ssh/tenant_key -o StrictHostKeyChecking=no root@118.25.0.190

# 方案3: 部署密钥到服务器
ssh-copy-id -i ~/.ssh/tenant_key.pub root@118.25.0.190

# 方案4: 检查服务器SSH配置
# 确保以下配置正确:
# PubkeyAuthentication yes
# PasswordAuthentication no (推荐)
```

---

## 诊断工具

### 综合诊断脚本

```bash
#!/bin/bash
# scripts/diagnostics/full-diagnostic.sh

echo "==================================="
echo "AIOpc 系统诊断"
echo "==================================="

# 1. 系统信息
echo ""
echo ">>> 系统信息"
echo "---"
uname -a
df -h
uptime

# 2. Docker状态
echo ""
echo ">>> Docker状态"
echo "---"
docker ps -a | grep opclaw

# 3. 容器健康检查
echo ""
echo ">>> 容器健康检查"
echo "---"
for container in opclaw-backend opclaw-postgres opclaw-redis; do
  echo -n "$container: "
  if docker inspect $container | grep -q '"Status": "up"'; then
    echo "✓ Running"
  else
    echo "✗ Not running"
  fi
done

# 4. 磁盘空间检查
echo ""
echo ">>> 磁盘空间"
echo "---"
df -h | grep -E "Filesystem|/opt/opclaw"

# 5. 日志检查
echo ""
echo ">>> 最近错误日志"
echo "---"
docker logs opclaw-backend --tail 20 | grep -i error || echo "No recent errors"
docker logs opclaw-postgres --tail 20 | grep -i error || echo "No recent errors"

# 6. 备份状态
echo ""
echo ">>> 备份状态"
echo "---"
latest_backup=$(ls -t /opt/opclaw/backups 2>/dev/null | head -1)
if [ -n "$latest_backup" ]; then
  echo "最新备份: $latest_backup"
  ls -lh /opt/opclaw/backups/$latest_backup
else
  echo "✗ 未找到备份"
fi

echo ""
echo "==================================="
echo "诊断完成"
echo "==================================="
```

### 快速诊断命令

```bash
# 健康检查
./scripts/monitoring/enhanced-health-check.sh

# 配置漂移检测
./scripts/monitoring/detect-config-drift.sh --all-tenants

# 状态数据库健康检查
docker exec opclaw-postgres psql -U opclaw -d deployment_state -c "SELECT * FROM health_check();"

# 配置验证
./scripts/config/validate-config.sh --full config/tenants/*.yml
```

### 日志收集

```bash
# 创建日志收集目录
mkdir -p /tmp/opclaw-logs-$(date +%Y%m%d_%H%M%S)

# 收集系统信息
uname -a > /tmp/opclaw-logs-$(date +%Y%m%d_%H%M%S)/system-info.txt
df -h >> /tmp/opclaw-logs-$(date +%Y%m%d_%H%M%S)/system-info.txt
docker ps -a >> /tmp/opclaw-logs-$(date +%Y%m%d_%H%M%S)/system-info.txt

# 收集容器日志
docker logs opclaw-backend --tail 500 > /tmp/opclaw-logs-$(date +%Y%m%d_%H%M%S)/backend.log
docker logs opclaw-postgres --tail 500 > /tmp/opclaw-logs-$(date +%Y%m%d_%H%M%S)/postgres.log
docker logs opclaw-redis --tail 500 > /tmp/opclaw-logs-$(date +%Y%m%d_%H%M%S)/redis.log

# 收集配置文件
cp -r config/tenants /tmp/opclaw-logs-$(date +%Y%m%d_%H%M%S)/

# 压缩日志包
cd /tmp
tar czf opclaw-logs-$(date +%Y%m%d_%H%M%S).tar.gz opclaw-logs-$(date +%Y%m%d_%H%M%S)

echo "日志包已创建: /tmp/opclaw-logs-$(date +%Y%m%d_%H%M%S).tar.gz"
```

---

## 附录

### 常用命令参考

```bash
# 备份相关
./scripts/backup/backup-production.sh --full              # 完整备份
./scripts/backup/verify-backup.sh --path /path/to/backup  # 验证备份
./scripts/backup/test-restore.sh --source /path/to/backup  # 测试恢复

# 健康检查相关
./scripts/monitoring/enhanced-health-check.sh              # 完整健康检查
./scripts/monitoring/health-check-layer1.sh                # HTTP检查
./scripts/monitoring/health-check-layer2.sh                # DB连接检查
./scripts/monitoring/health-check-layer3.sh                # DB查询检查
./scripts/monitoring/health-check-layer4.sh                # OAuth检查
./scripts/monitoring/health-check-layer5.sh                # Redis检查

# 配置漂移相关
./scripts/monitoring/detect-config-drift.sh --tenant tenant_001  # 检测漂移
./scripts/monitoring/schedule-drift-check.sh install               # 安装定时检查
./scripts/monitoring/schedule-drift-check.sh run-now              # 立即运行检查

# 回滚相关
./scripts/deploy/rollback.sh --tenant tenant_001                   # 回滚
./scripts/deploy/rollback-decision-tree.sh                      # 决策树

# 状态数据库相关
./scripts/state/test-db-connection.sh                             # 测试连接
docker exec opclaw-postgres psql -U opclaw -d deployment_state -c "SELECT * FROM health_check();"

# 配置相关
./scripts/config/validate-config.sh config/tenants/tenant_001.yml
./scripts/config/generate-config.sh --template template.yml --output new_tenant.yml
```

---

**文档版本**: 1.0.0
**最后更新**: 2026-03-19
**维护者**: AIOpc DevOps Team
