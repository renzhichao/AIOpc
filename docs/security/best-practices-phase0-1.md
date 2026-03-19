# Phase 0 & 1 安全最佳实践

> **Multi-Instance Single-Tenant Deployment Support**
> **文档版本**: 1.0.0
> **适用范围**: Phase 0 & 1 实施成果
> **目标受众**: 运维团队、开发人员、系统管理员

---

## 目录

1. [安全架构概述](#安全架构概述)
2. [访问控制](#访问控制)
3. [审计日志](#审计日志)
4. [备份与恢复安全](#备份与恢复安全)
5. [配置安全](#配置安全)
6. [SSH密钥管理](#ssh密钥管理)
7. [生产环境安全](#生产环境安全)
8. [安全监控](#安全监控)
9. [应急响应](#应急响应)
10. [安全检查清单](#安全检查清单)

---

## 安全架构概述

### 多层防御模型

Phase 0 & 1 实施了以下安全层级：

```
┌─────────────────────────────────────────┐
│         Layer 5: 监控与审计              │
│  - 审计日志 (audit_log表)                │
│  - 安全事件监控 (v_recent_security_events)│
│  - 配置漂移检测                          │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│         Layer 4: 访问控制                │
│  - SSH密钥管理                           │
│  - 最小权限原则                          │
│  - 多租户隔离                            │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│         Layer 3: 数据保护                │
│  - 数据库备份加密                         │
│  - 配置文件权限控制                      │
│  - 敏感信息脱敏                          │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│         Layer 2: 网络安全                │
│  - SSH密钥认证 (禁用密码)                │
│  - 防火墙规则                            │
│  - 容器网络隔离                          │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│         Layer 1: 基础设施                │
│  - 定期安全更新                          │
│  - 最小化攻击面                          │
│  - 安全配置基线                          │
└─────────────────────────────────────────┘
```

### 安全设计原则

1. **纵深防御**: 多层安全控制，单层失效不影响整体安全
2. **最小权限**: 仅授予完成任务所需的最小权限
3. **默认拒绝**: 除非明确允许，否则拒绝所有访问
4. **审计追踪**: 所有敏感操作必须记录可审计日志
5. **持续监控**: 实时检测和响应安全事件

---

## 访问控制

### SSH访问控制

#### 1. SSH密钥认证

**✅ 推荐做法**:

```bash
# 使用强加密算法的SSH密钥
ssh-keygen -t ed25519 -a 100 -C "admin@aiopclaw"

# 密钥文件权限
chmod 600 ~/.ssh/aiopclaw_remote_agent
chmod 644 ~/.ssh/aiopclaw_remote_agent.pub

# SSH配置强制密钥认证
cat /etc/ssh/sshd_config
PasswordAuthentication no
PubkeyAuthentication yes
```

**❌ 禁止做法**:

```bash
# 禁止使用密码认证
PasswordAuthentication yes  # ❌ 不安全

# 禁止使用弱加密算法
ssh-keygen -t rsa -b 2048  # ❌ RSA 2048已不安全
```

#### 2. 访问权限矩阵

| 服务器角色 | 密钥文件 | 访问权限 | 审计要求 |
|-----------|---------|---------|---------|
| Platform Server (118.25.0.190) | `rap001_opclaw` | 运维团队 | 所有SSH会话记录 |
| Remote Agent Server (101.34.254.52) | `aiopclaw_remote_agent` | 运维团队 | 所有SSH会话记录 |
| 数据库服务器 | `<role>_db_key` | DBA团队 | 所有数据库操作记录 |

#### 3. 会话管理

**强制会话审计**:

```bash
# 启用SSH会话记录
echo "session required pam_exec.so /usr/local/bin/log-ssh-session.sh" >> /etc/pam.d/sshd

# 会话日志格式
{
  "timestamp": "2026-03-19T10:30:00Z",
  "user": "root",
  "ssh_key": "rap001_opclaw",
  "server": "118.25.0.190",
  "session_id": "ssh_123456",
  "command": "docker logs opclaw-backend --tail 50"
}
```

### 数据库访问控制

#### 1. PostgreSQL权限模型

```sql
-- 租户隔离：每个租户使用独立的数据库schema
CREATE SCHEMA tenant_<tenant_id>;
GRANT USAGE ON SCHEMA tenant_<tenant_id> TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tenant_<tenant_id>.* TO app_user;

-- 禁止跨租户访问
REVOKE ALL ON ALL TABLES IN SCHEMA tenant_<tenant_id> FROM public;

-- 只读用户（用于监控）
CREATE USER monitor_user WITH PASSWORD '<secure_password>';
GRANT SELECT ON ALL TABLES IN SCHEMA public TO monitor_user;
```

#### 2. 连接限制

```sql
-- 限制并发连接数
ALTER USER app_user CONNECTION LIMIT 10;

-- 限制来自特定IP的连接
hostssl deployment_state    app_user  10.0.0.0/8  scram-sha-256
hostssl deployment_state    app_user  192.168.0.0/16 scram-sha-256
host    all                 all      0.0.0.0/0    reject
```

### 容器访问控制

```yaml
# docker-compose.yml 安全配置
services:
  backend:
    # 使用非root用户运行
    user: "1000:1000"

    # 限制容器能力
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE

    # 只读文件系统
    read_only: true
    tmpfs:
      - /tmp

    # 禁用特权模式
    privileged: false

    # 网络隔离
    networks:
      - internal_network
    networks:
      internal_network:
        internal: true  # 禁止外网访问
```

---

## 审计日志

### 审计日志架构

Phase 0 & 1 实现的审计系统：

```
┌─────────────────────────────────────────┐
│         应用层审计                        │
│  - 用户登录/登出                         │
│  - 配置变更                              │
│  - 敏感操作                              │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│         系统层审计                        │
│  - SSH会话记录                           │
│  - sudo命令使用                          │
│  - 文件访问                              │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│         数据库层审计                      │
│  - 数据库连接                            │
│  - 数据变更                              │
│  - schema变更                            │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│         审计日志存储                      │
│  - PostgreSQL audit_log表                │
│  - 文件系统日志                          │
│  - 日志轮转和归档                        │
└─────────────────────────────────────────┘
```

### 数据库审计日志

#### 表结构

```sql
CREATE TABLE audit_log (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor TEXT NOT NULL,           -- 执行者
    action TEXT NOT NULL,           -- 操作类型
    resource_type TEXT NOT NULL,    -- 资源类型
    resource_id TEXT,               -- 资源ID
    tenant_id TEXT,                 -- 租户ID
    details JSONB,                  -- 详细信息
    ip_address INET,                -- IP地址
    user_agent TEXT,                -- 用户代理
    status TEXT                     -- 操作状态
);

-- 性能优化：时间范围分区
CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp DESC);
CREATE INDEX idx_audit_log_actor ON audit_log(actor);
CREATE INDEX idx_audit_log_tenant ON audit_log(tenant_id);
```

#### 审计事件类型

| 事件类型 | 描述 | 级别 | 保留期 |
|---------|------|------|--------|
| USER_LOGIN | 用户登录 | INFO | 90天 |
| USER_LOGOUT | 用户登出 | INFO | 90天 |
| CONFIG_CHANGE | 配置变更 | WARNING | 1年 |
| SSH_KEY_ADD | SSH密钥添加 | WARNING | 1年 |
| SSH_KEY_ROTATE | SSH密钥轮换 | WARNING | 1年 |
| DEPLOYMENT_CREATE | 部署创建 | INFO | 90天 |
| DEPLOYMENT_UPDATE | 部署更新 | INFO | 90天 |
| DEPLOYMENT_DELETE | 部署删除 | CRITICAL | 永久 |
| SECURITY_EVENT | 安全事件 | CRITICAL | 永久 |

#### 审计查询示例

```sql
-- 查看最近的安全事件
SELECT * FROM v_recent_security_events
ORDER BY event_timestamp DESC
LIMIT 50;

-- 查询特定用户的审计记录
SELECT
    timestamp,
    action,
    resource_type,
    details,
    ip_address
FROM audit_log
WHERE actor = 'admin@aiopclaw'
  AND timestamp > NOW() - INTERVAL '7 days'
ORDER BY timestamp DESC;

-- 查询敏感配置变更
SELECT
    timestamp,
    actor,
    details->>'field_name' AS field_name,
    details->>'old_value' AS old_value,
    details->>'new_value' AS new_value
FROM audit_log
WHERE action = 'CONFIG_CHANGE'
  AND details->>'severity' = 'CRITICAL'
ORDER BY timestamp DESC;
```

### 系统审计配置

#### 1. SSH会话审计

```bash
# /etc/pam.d/sshd
session required pam_warn.so
session optional pam_exec.so /usr/local/bin/log-ssh-session.sh

# /usr/local/bin/log-ssh-session.sh
#!/bin/bash
USER=$PAM_USER
REMOTE_IP=$PAM_RHOST
SESSION_ID=$(uuidgen)

# 记录会话开始
psql -h localhost -U postgres -d deployment_state -c \
  "INSERT INTO audit_log (actor, action, resource_type, details, ip_address)
   VALUES ('$USER', 'SSH_LOGIN', 'SESSION',
           '{\"session_id\": \"$SESSION_ID\"}', '$REMOTE_IP')"

# 记录会话结束
trap "psql -h localhost -U postgres -d deployment_state -c \
  \"INSERT INTO audit_log (actor, action, resource_type, details, ip_address)
   VALUES ('$USER', 'SSH_LOGOUT', 'SESSION',
           {\"session_id\": \"$SESSION_ID\"}, '$REMOTE_IP')\"" EXIT
```

#### 2. sudo命令审计

```bash
# /etc/sudoers.d/audit
Defaults logfile=/var/log/sudo.log
Defaults log_output
Defaults log_input

# 日志格式
sudo -i
tail -f /var/log/sudo.log
```

### 审计日志保护

```bash
# 1. 日志文件权限
chmod 600 /var/log/audit.log
chown root:root /var/log/audit.log

# 2. 不可变属性（防止删除）
chattr +i /var/log/audit.log

# 3. 日志轮转
cat /etc/logrotate.d/audit
/var/log/audit.log {
    daily
    rotate 90
    compress
    delaycompress
    missingok
    notifempty
    create 0600 root root
    sharedscripts
    postrotate
        # 发送到远程日志服务器
        rsync -avz /var/log/audit.* logserver:/backup/logs/
    endscript
}
```

---

## 备份与恢复安全

### 备份加密

#### 1. 数据库备份加密

```bash
# 使用GPG加密备份
pg_dump -U postgres deployment_state | \
  gpg --symmetric --cipher-algo AES256 --compress-algo 1 \
      --s2k-digest-algo SHA512 \
      --s2k-count 65536 \
      -o backup_$(date +%Y%m%d).sql.gpg

# 备份密码管理
echo "BACKUP_GPG_PASSWORD=<strong_password>" >> /etc/opclaw/.env
chmod 600 /etc/opclaw/.env
```

#### 2. 配置文件备份加密

```bash
# 加密敏感配置
tar czf - /etc/opclaw/.env.production | \
  gpg --symmetric --cipher-algo AES256 \
      -o config_backup_$(date +%Y%m%d).tar.gz.gpg
```

### 备份存储安全

#### 1. 多位置存储策略

```bash
# 本地存储（快速恢复）
LOCAL_BACKUP_DIR="/var/backups/opclaw"

# 远程存储（灾难恢复）
REMOTE_BACKUP_SERVER="backup.aiopclaw.com"
REMOTE_BACKUP_DIR="/backup/opclaw"

# 安全传输（使用rsync + SSH）
rsync -avz --delete \
  -e "ssh -i ~/.ssh/backup_key" \
  $LOCAL_BACKUP_DIR/ \
  backup@$REMOTE_BACKUP_SERVER:$REMOTE_BACKUP_DIR/

# 验证传输完整性
rsync -avz --checksum \
  $LOCAL_BACKUP_DIR/ \
  backup@$REMOTE_BACKUP_SERVER:$REMOTE_BACKUP_DIR/
```

#### 2. 备份权限控制

```bash
# 本地备份权限
chmod 700 /var/backups/opclaw
chmod 600 /var/backups/opclaw/*
chown root:root /var/backups/opclaw/*

# 远程备份权限
ssh backup@$REMOTE_BACKUP_SERVER \
  "chmod 700 /backup/opclaw && \
   chmod 600 /backup/opclaw/* && \
   chown backup:backup /backup/opclaw"
```

### 恢复安全验证

```bash
# 1. 备份完整性验证
gpg --verify backup_20260319.sql.gpg.sig
sha256sum backup_20260319.sql.gpg | compare backup_20260319.sha256

# 2. 恢复到测试环境
docker exec -i opclaw-postgres-test psql -U postgres < \
  <(gpg --decrypt backup_20260319.sql.gpg)

# 3. 数据一致性检查
docker exec opclaw-postgres-test psql -U postgres -d deployment_state \
  -c "SELECT COUNT(*) FROM deployments;"
docker exec opclaw-postgres-test psql -U postgres -d deployment_state \
  -c "SELECT COUNT(*) FROM configurations;"
```

---

## 配置安全

### 配置文件权限

#### 1. 敏感配置文件

```bash
# 生产环境配置
chmod 600 /opt/opclaw/platform/.env.production
chown root:root /opt/opclaw/platform/.env.production

# SSH密钥
chmod 600 ~/.ssh/rap001_opclaw
chmod 644 ~/.ssh/rap001_opclaw.pub
chown $USER:$USER ~/.ssh/rap001_opclaw*

# Docker Compose配置
chmod 644 /opt/opclaw/docker-compose.yml
chown root:root /opt/opclaw/docker-compose.yml
```

#### 2. 配置文件所有权

```bash
# 检查配置文件权限
find /opt/opclaw -name ".env*" -type f -exec ls -la {} \;

# 修复权限
find /opt/opclaw -name ".env*" -type f -exec chmod 600 {} \;
find /opt/opclaw -name ".env*" -type f -exec chown root:root {} \;
```

### 敏感信息管理

#### 1. 环境变量安全

```bash
# 使用.env文件存储敏感信息
cat /opt/opclaw/.env.production
# ✅ 正确：敏感信息在.env文件中
DEEPSEEK_API_KEY=sk-abc123...
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
JWT_SECRET=xxx

# ❌ 错误：不要硬编码在代码中
# const API_KEY = "sk-abc123..."  # 永远不要这样做
```

#### 2. 密钥轮换

```bash
# 密钥轮换脚本
#!/bin/bash
OLD_KEY=$1
NEW_KEY=$2

# 1. 生成新密钥
NEW_SECRET=$(openssl rand -base64 32)

# 2. 更新配置
sed -i "s/$OLD_KEY/$NEW_SECRET/" /opt/opclaw/.env.production

# 3. 重启服务
docker restart opclaw-backend

# 4. 记录审计日志
psql -h localhost -U postgres -d deployment_state -c \
  "INSERT INTO audit_log (actor, action, resource_type, details)
   VALUES ('$USER', 'KEY_ROTATE', 'JWT_SECRET',
           '{\"old_key_hash\": \"$(echo $OLD_KEY | sha256sum)\",
            \"new_key_hash\": \"$(echo $NEW_KEY | sha256sum)\"}')"
```

### 配置漂移检测安全

#### 1. 自动化检测

```bash
# 每日配置漂移检测
0 2 * * * /scripts/monitoring/detect-config-drift.sh

# 检测到漂移时自动告警
if [ $DRIFT_DETECTED -eq 1 ]; then
  # 发送告警
  curl -X POST $SLACK_WEBHOOK \
    -d "{\"text\": \"🚨 配置漂移检测: 发现$CRITICAL_COUNT个关键漂移\"}"
fi
```

#### 2. 配置验证

```bash
# 部署前配置验证
/scripts/lib/config.sh validate \
  --template /opt/opclaw/template.yml \
  --output /opt/opclaw/.env.production

# 检查占位符
/scripts/lib/config.sh check-placeholders /opt/opclaw/.env.production
```

---

## SSH密钥管理

### 密钥生成安全

#### 1. 使用强加密算法

```bash
# ✅ 推荐：Ed25519（现代、安全、快速）
ssh-keygen -t ed25519 -a 100 -C "admin@aiopclaw"

# ✅ 可接受：RSA 4096（兼容性好）
ssh-keygen -t rsa -b 4096 -a 100 -C "admin@aiopclaw"

# ❌ 不推荐：RSA 2048（已过时）
ssh-keygen -t rsa -b 2048  # ❌ 不安全

# ❌ 禁止：DSA（已弃用）
ssh-keygen -t dsa  # ❌ 已不安全
```

#### 2. 密钥密码保护

```bash
# ✅ 使用强密码保护
ssh-keygen -t ed25519 -a 100 -C "admin@aiopclaw"
# 提示时输入强密码（至少16字符，包含大小写、数字、符号）

# ❌ 无密码密钥（仅用于服务账户）
ssh-keygen -t ed25519 -f ~/.ssh/service_key -N ""
# 必须明确标记为服务账户密钥
```

### 密钥存储安全

#### 1. 本地存储

```bash
# 密钥文件权限
chmod 600 ~/.ssh/rap001_opclaw
chmod 644 ~/.ssh/rap001_opclaw.pub

# SSH目录权限
chmod 700 ~/.ssh

# 检查权限
ls -la ~/.ssh/
# -rw-------  1 user staff  3.3K Mar 16 14:12 rap001_opclaw
# -rw-r--r--  1 user staff  117B Mar 16 14:12 rap001_opclaw.pub
```

#### 2. 密钥指纹验证

```bash
# 生成密钥指纹
ssh-keygen -l -f ~/.ssh/rap001_opclaw
# 4096 SHA256:M471M+QScAc+MZcNf5McOBlrDwLeWC1Gq97/OLwlz4A root@VM-4-12-ubuntu (RSA)

# 首次连接时验证指纹
ssh-keyscan -H 118.25.0.190 >> ~/.ssh/known_hosts
```

### 密钥轮换

#### 1. 定期轮换策略

| 密钥类型 | 轮换周期 | 触发条件 |
|---------|---------|---------|
| 管理员密钥 | 90天 | 定期轮换 |
| 服务账户密钥 | 180天 | 定期轮换 |
| 临时访问密钥 | 7天 | 自动过期 |
| 泄露密钥 | 立即 | 安全事件 |

#### 2. 轮换程序

```bash
# 密钥轮换脚本
#!/bin/bash
KEY_NAME=$1
SERVER=$2

# 1. 生成新密钥对
ssh-keygen -t ed25519 -a 100 -C "${KEY_NAME}_$(date +%Y%m%d)" \
  -f ~/.ssh/${KEY_NAME}_new

# 2. 添加新公钥到服务器
ssh-copy-id -i ~/.ssh/${KEY_NAME}_new.pub root@$SERVER

# 3. 验证新密钥连接
ssh -i ~/.ssh/${KEY_NAME}_new root@$SERVER "echo '新密钥工作正常'"

# 4. 删除服务器上的旧公钥
ssh -i ~/.ssh/${KEY_NAME}_new root@$SERVER \
  "sed -i '/$(ssh-keygen -lf ~/.ssh/${KEY_NAME} | awk '{print $2}')/d' \
   ~/.ssh/authorized_keys"

# 5. 备份旧密钥
mv ~/.ssh/${KEY_NAME} ~/.ssh/${KEY_NAME}_$(date +%Y%m%d).bak

# 6. 重命名新密钥
mv ~/.ssh/${KEY_NAME}_new ~/.ssh/${KEY_NAME}

# 7. 记录审计日志
# ... (记录到audit_log表)
```

### 密钥审计

#### 1. 密钥使用审计

```sql
-- 查询SSH密钥使用记录
SELECT
    timestamp,
    actor,
    details->>'ssh_key' AS ssh_key,
    details->>'server' AS server,
    details->>'command' AS command
FROM audit_log
WHERE action IN ('SSH_LOGIN', 'SSH_COMMAND')
  AND timestamp > NOW() - INTERVAL '30 days'
ORDER BY timestamp DESC;
```

#### 2. 未使用密钥检测

```bash
# 检测90天未使用的密钥
for key in ~/.ssh/*_private; do
  LAST_USED=$(stat -c %Y "$key")
  DAYS_AGO=$(( ($(date +%s) - $LAST_USED) / 86400 ))
  if [ $DAYS_AGO -gt 90 ]; then
    echo "警告: 密钥 $key 已 $DAYS_AGO 天未使用"
  fi
done
```

---

## 生产环境安全

### 生产环境保护

#### 1. 环境隔离

```bash
# 生产、预发布、开发环境完全隔离
PRODUCTION_SERVER="118.25.0.190"
STAGING_SERVER="118.25.0.191"
DEVELOPMENT_SERVER="118.25.0.192"

# 生产环境专用SSH密钥
ssh -i ~/.ssh/production_only root@$PRODUCTION_SERVER

# 禁止开发环境直接访问生产
# ❌ 不要在开发脚本中硬编码生产凭据
```

#### 2. 生产环境访问控制

```bash
# 生产访问需要多因素认证
# 1. SSH密钥认证
# 2. VPN连接
# 3. 临时访问令牌

# 生成临时访问令牌
TOKEN=$(openssl rand -hex 16)
echo "临时访问令牌: $TOKEN (有效期1小时)"

# 使用令牌访问
ssh -i ~/.ssh/production_only root@$PRODUCTION_SERVER \
  "echo $TOKEN > /tmp/access_token && \
   chmod 600 /tmp/access_token"
```

### 生产环境监控

#### 1. 安全事件监控

```bash
# 实时监控SSH登录
tail -f /var/log/auth.log | grep --line-buffered "Accepted" | \
  while read line; do
    echo "[$(date)] SSH登录: $line" | \
      mail -s "SSH登录告警" security@aiopclaw.com
  done

# 监控配置变更
inotifywait -m -e modify /opt/opclaw/.env.production | \
  while read path action file; do
    echo "配置文件被修改: $file"
    # 触发配置漂移检测
    /scripts/monitoring/detect-config-drift.sh
  done
```

#### 2. 异常行为检测

```bash
# 检测异常数据库连接
psql -h localhost -U postgres -d deployment_state -c \
  "SELECT
        client_ip,
        COUNT(*) as connection_count,
        MAX(backend_start) as last_connection
   FROM pg_stat_activity
   WHERE datname = 'deployment_state'
   GROUP BY client_ip
   HAVING COUNT(*) > 100;"

# 检测异常SSH登录尝试
grep "Failed password" /var/log/auth.log | \
  awk '{print $(NF-3)}' | sort | uniq -c | sort -nr | \
  awk '$1 > 10 {print "告警: 异常登录尝试: " $2}'
```

### 生产环境变更管理

#### 1. 变更审批流程

```
1. 提交变更请求
   ├── 变更描述
   ├── 影响范围分析
   ├── 回滚计划
   └── 测试验证结果

2. 安全审查
   ├── 配置安全检查
   ├── 权限影响评估
   └── 审计日志配置

3. 变更执行
   ├── 创建检查点
   ├── 执行变更
   ├── 健康检查验证
   └── 监控24小时

4. 变更关闭
   ├── 更新文档
   └── 归档变更记录
```

#### 2. 变更窗口管理

```bash
# 生产变更窗口
# 周二-周四，凌晨2:00-4:00（低峰期）

# 变更前检查
/scripts/migration/pre-change-check.sh

# 执行变更
/scripts/migration/apply-change.sh

# 变更后监控
/scripts/migration/post-change-monitor.sh
```

---

## 安全监控

### 监控指标

#### 1. 安全KPI

| 指标 | 目标值 | 告警阈值 | 严重阈值 |
|------|--------|---------|---------|
| SSH失败登录率 | <1% | >5% | >10% |
| 配置漂移数量 | 0 | 1个 | 3个 |
| 审计日志丢失率 | 0% | >0.1% | >1% |
| 备份失败率 | 0% | >1% | >5% |
| 异常数据库连接 | 0 | >10/min | >100/min |

#### 2. 安全事件等级

| 等级 | 描述 | 响应时间 | 示例 |
|------|------|---------|------|
| P0 - 紧急 | 系统入侵、数据泄露 | 15分钟 | 检测到未授权访问 |
| P1 - 高 | 重要配置变更 | 1小时 | 生产环境配置漂移 |
| P2 - 中 | 多次失败登录 | 4小时 | 暴力破解尝试 |
| P3 - 低 | 异常访问模式 | 24小时 | 非工作时间访问 |

### 监控工具

#### 1. 安全监控面板

```sql
-- 创建安全监控视图
CREATE OR REPLACE VIEW v_security_dashboard AS
SELECT
    'SSH失败登录（24小时）' AS metric,
    COUNT(*) AS value,
    CASE
        WHEN COUNT(*) > 100 THEN 'CRITICAL'
        WHEN COUNT(*) > 50 THEN 'WARNING'
        ELSE 'OK'
    END AS status
FROM audit_log
WHERE action = 'SSH_LOGIN_FAILED'
  AND timestamp > NOW() - INTERVAL '24 hours'

UNION ALL

SELECT
    '配置漂移数量' AS metric,
    COUNT(*) AS value,
    CASE
        WHEN COUNT(*) > 0 THEN 'WARNING'
        ELSE 'OK'
    END AS status
FROM configuration_drift
WHERE detected_at > NOW() - INTERVAL '24 hours'
  AND severity = 'CRITICAL';

-- 查询安全状态
SELECT * FROM v_security_dashboard;
```

#### 2. 告警配置

```bash
# Prometheus告警规则
cat /etc/prometheus/security-alerts.yml
groups:
  - name: security_alerts
    rules:
      - alert: SSHBruteForceDetected
        expr: rate(ssh_login_failures_total[5m]) > 10
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "SSH暴力破解检测"
          description: "{{ $labels.instance }} SSH失败率过高"

      - alert: ConfigDriftDetected
        expr: config_drift_count > 0
        for: 1m
        labels:
          severity: warning
        annotations:
          summary: "配置漂移检测"
          description: "检测到{{ $value }}个配置漂移"
```

### 日志分析

#### 1. 安全日志聚合

```bash
# 使用ELK Stack聚合日志
# Filebeat → Logstash → Elasticsearch → Kibana

# filebeat.yml
filebeat.inputs:
  - type: log
    enabled: true
    paths:
      - /var/log/auth.log
      - /var/log/audit.log
    fields:
      type: security
      environment: production

output.logstash:
  hosts: ["logstash.aiopclaw.com:5044"]
```

#### 2. 异常检测

```bash
# 使用Elasticsearch Machine Learning检测异常
# 1. 配置ML作业
# 2. 训练模型（历史数据）
# 3. 实时检测异常
# 4. 自动告警

# 示例：检测异常SSH登录时间
# 正常模式：工作时间（9:00-18:00）
# 异常模式：凌晨3:00登录 → 告警
```

---

## 应急响应

### 事件分类

#### 1. 安全事件类型

| 事件类型 | 描述 | 响应级别 | 处理流程 |
|---------|------|---------|---------|
| 未授权访问 | 检测到非法登录 | P0 | 隔离→取证→修复 |
| 数据泄露 | 敏感数据暴露 | P0 | 止损→评估→通知 |
| 配置篡改 | 生产配置被修改 | P1 | 回滚→审计→加固 |
| 恶意软件 | 检测到病毒/木马 | P0 | 隔离→清除→验证 |
| 拒绝服务 | 服务不可用 | P1 | 切换→缓解→恢复 |

#### 2. 事件响应流程

```
1. 检测与识别
   ├── 监控系统告警
   ├── 用户报告
   └── 自动检测触发

2. 遏制与隔离
   ├── 断开受影响系统网络
   ├── 禁用 compromised 账户
   └── 切换到备份系统

3. 根除与消除
   ├── 删除恶意软件
   ├── 修复安全漏洞
   └── 重置所有凭据

4. 恢复与还原
   ├── 从干净备份恢复
   ├── 验证系统完整性
   └── 恢复正常运营

5. 事后分析
   ├── 根本原因分析
   ├── 改进安全措施
   └── 更新应急响应计划
```

### 应急响应脚本

#### 1. 自动遏制脚本

```bash
#!/bin/bash
# emergency-lockdown.sh - 紧急锁定脚本

# 1. 停止所有服务
docker stop $(docker ps -q)

# 2. 禁用所有非必要账户
for user in $(cut -d: -f1 /etc/passwd | grep -v -E "root|admin"); do
  usermod --lock $user
done

# 3. 启用防火墙阻断所有入站连接
ufw default deny incoming
ufw enable

# 4. 记录事件到审计日志
psql -h localhost -U postgres -d deployment_state -c \
  "INSERT INTO audit_log (actor, action, resource_type, details)
   VALUES ('emergency_response', 'LOCKDOWN', 'SYSTEM',
           '{\"timestamp\": \"$(date -Iseconds)\", \"trigger\": \"$1\"}')"

echo "系统已进入紧急锁定状态"
```

#### 2. 快速恢复脚本

```bash
#!/bin/bash
# quick-recovery.sh - 快速恢复脚本

# 1. 从备份恢复配置
scp backup@backup.aiopclaw.com:/backup/opclaw/config_latest.tar.gz.gpg /tmp/
gpg --decrypt /tmp/config_latest.tar.gz.gpg | tar xz -C /opt/opclaw/

# 2. 验证配置
/scripts/lib/config.sh validate /opt/opclaw/.env.production

# 3. 重启服务
docker start opclaw-backend opclaw-postgres opclaw-redis

# 4. 健康检查
/scripts/health/check-all-layers.sh

# 5. 监控24小时
/scripts/migration/post-change-monitor.sh
```

### 应急联系清单

| 角色 | 姓名 | 联系方式 | 职责 |
|------|------|---------|------|
| 安全负责人 | - | security@aiopclaw.com | 安全事件决策 |
| 运维负责人 | - | ops@aiopclaw.com | 技术响应执行 |
| 数据库DBA | - | dba@aiopclaw.com | 数据库恢复 |
| 开发负责人 | - | dev@aiopclaw.com | 代码分析 |
| 法务顾问 | - | legal@aiopclaw.com | 法律合规 |

---

## 安全检查清单

### 日常检查（Daily）

- [ ] 审查SSH登录日志（`/var/log/auth.log`）
- [ ] 检查配置漂移检测结果
- [ ] 验证备份任务完成
- [ ] 检查安全监控告警
- [ ] 审查审计日志异常记录

### 每周检查（Weekly）

- [ ] 旋转所有临时访问密钥
- [ ] 审查未使用的SSH密钥并删除
- [ ] 检查系统安全更新
- [ ] 审查访问权限并移除不必要的授权
- [ ] 测试备份恢复流程

### 每月检查（Monthly）

- [ ] 完整安全审计
- [ ] 渗透测试
- [ ] 安全培训
- [ ] 应急响应演练
- [ ] 安全策略审查和更新

### 部署前检查（Pre-Deployment）

- [ ] 代码安全审查
- [ ] 依赖项漏洞扫描
- [ ] 配置安全验证
- [ ] 权限最小化检查
- [ ] 回滚计划准备
- [ ] 监控告警配置

### 部署后检查（Post-Deployment）

- [ ] 健康检查验证
- [ ] 性能基线对比
- [ ] 安全监控验证
- [ ] 审计日志完整性
- [ ] 配置漂移检测
- [ ] 24小时监控

---

## 附录

### A. 安全相关文件

| 文件路径 | 用途 | 权限 |
|---------|------|------|
| `/opt/opclaw/.env.production` | 生产环境配置 | `600` |
| `~/.ssh/rap001_opclaw` | Platform服务器密钥 | `600` |
| `~/.ssh/aiopclaw_remote_agent` | Agent服务器密钥 | `600` |
| `/var/log/audit.log` | 审计日志 | `600` |
| `/var/backups/opclaw/` | 备份目录 | `700` |

### B. 安全命令参考

```bash
# SSH连接
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190

# 检查配置权限
ls -la /opt/opclaw/.env.production

# 查看审计日志
tail -f /var/log/audit.log

# 检查SSH登录历史
grep "Accepted" /var/log/auth.log | tail -20

# 配置漂移检测
/scripts/monitoring/detect-config-drift.sh

# 健康检查
/scripts/health/check-all-layers.sh

# 备份验证
/scripts/backup/verify-backup.sh
```

### C. 安全相关视图和函数

```sql
-- 查看最近安全事件
SELECT * FROM v_recent_security_events
ORDER BY event_timestamp DESC
LIMIT 50;

-- 查看租户健康状态
SELECT * FROM v_tenant_health
WHERE status != 'healthy';

-- 记录SSH密钥使用
SELECT log_ssh_key_usage(
    'admin@aiopclaw',
    'rap001_opclaw',
    '118.25.0.190',
    'login'
);

-- 获取部署统计
SELECT * FROM get_deployment_stats();
```

---

## 更新记录

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|---------|
| 1.0.0 | 2026-03-19 | Claude Code | 初始版本，基于Phase 0 & 1实施成果 |

---

**相关文档**:
- [Phase 0 & 1 实施总结](../implementation/phase0-1-summary.md)
- [配置漂移处理指南](../operations/config-drift-handling.md)
- [状态数据库架构](../architecture/state-database.md)
- [故障排查指南](../troubleshooting/phase0-1-issues.md)
