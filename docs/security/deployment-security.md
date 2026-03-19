# 部署安全最佳实践 (Phase 2)

> **Multi-Instance Single-Tenant Deployment Support**
> **文档版本**: 1.0.0
> **适用范围**: TASK-014 (部署中的安全集成)
> **目标受众**: 运维团队、开发人员、安全团队

---

## 目录

1. [概述](#概述)
2. [部署前安全检查](#部署前安全检查)
3. [部署中的安全措施](#部署中的安全措施)
4. [部署后安全验证](#部署后安全验证)
5. [安全监控](#安全监控)
6. [应急响应](#应急响应)
7. [合规性要求](#合规性要求)
8. [安全检查清单](#安全检查清单)

---

## 概述

### Phase 2 安全增强

Phase 2 在部署流程中集成了全面的安全检查和防护措施：

- ✅ **配置安全检查** - 检测Placeholder和敏感信息泄露
- ✅ **密钥强度验证** - 确保所有密钥符合安全标准
- ✅ **文件权限检查** - 验证配置文件和SSH密钥权限
- ✅ **日志监控扫描** - 检测异常行为和安全事件
- ✅ **部署审计** - 记录所有部署操作

### 安全架构

```
部署安全架构
├── 部署前 (Pre-Deployment)
│   ├── 配置安全检查
│   ├── 密钥强度验证
│   ├── 文件权限检查
│   └── 安全基线验证
│
├── 部署中 (During Deployment)
│   ├── 加密传输
│   ├── 访问控制
│   ├── 操作审计
│   └── 实时监控
│
└── 部署后 (Post-Deployment)
    ├── 配置漂移检测
    ├── 日志监控扫描
    ├── 安全事件告警
    └── 合规性检查
```

---

## 部署前安全检查

### 1. 配置安全检查

#### 1.1 Placeholder检测

**目的**: 防止使用默认或未配置的值

**脚本**: `scripts/security/check-config-security.sh`

```bash
# 检查Placeholder值
PLACEHOLDERS=(
    'cli_xxxxxxxxxxxxx'
    'CHANGE_THIS'
    'your_'
    'placeholder'
    'default_password'
    'REPLACE_ME'
)

for placeholder in "${PLACEHOLDERS[@]}"; do
    if grep -q "$placeholder" "$CONFIG_FILE"; then
        log_error "发现Placeholder值: $placeholder"
        return 1
    fi
done
```

**检查项**:
- [ ] Feishu App ID 不是默认值
- [ ] 数据库密码不是默认值
- [ ] JWT密钥不是默认值
- [ ] Redis密码不是默认值
- [ ] 没有配置文件中的说明性占位符

#### 1.2 敏感信息检测

**目的**: 防止敏感信息泄露到配置文件

```bash
# 检查硬编码的敏感信息
if grep -qiE 'password\s*[:=]\s*["\047]?[a-z]{1,10}["\047]?' "$CONFIG_FILE"; then
    log_error "检测到可能的弱密码或硬编码密码"
    return 1
fi

# 检查明文API密钥
if grep -qiE 'api_key\s*[:=]\s*["\047]?[a-z0-9]{20,}["\047]?' "$CONFIG_FILE"; then
    log_warning "检测到可能的明文API密钥"
fi
```

**检查项**:
- [ ] 没有硬编码的密码
- [ ] 没有明文API密钥
- [ ] 敏感信息使用环境变量引用
- [ ] 配置文件不在Git仓库中

#### 1.3 配置完整性验证

**目的**: 确保配置文件完整且有效

```bash
# 验证必需字段
REQUIRED_FIELDS=(
    'tenant.id'
    'server.host'
    'feishu.app_id'
    'database.name'
)

for field in "${REQUIRED_FIELDS[@]}"; do
    value=$(yq eval ".$field" "$CONFIG_FILE")
    if [[ "$value" == "null" ]] || [[ -z "$value" ]]; then
        log_error "缺少必需字段: $field"
        return 1
    fi
done
```

### 2. 密钥强度验证

#### 2.1 密钥长度检查

**脚本**: `scripts/security/check-secret-strength.sh`

**标准**:
- 最小长度: 16字符
- 推荐长度: 32字符
- 最大长度: 128字符

```bash
# 检查密钥长度
check_password_length() {
    local password=$1
    local min_length=16

    if [[ ${#password} -lt $min_length ]]; then
        log_error "密码长度不足: ${#password} < $min_length"
        return 1
    fi

    log_success "密码长度检查通过: ${#password} 字符"
}
```

#### 2.2 密钥熵值检查

**目的**: 确保密钥具有足够的随机性

```bash
# 计算密钥熵值
calculate_entropy() {
    local password=$1
    local entropy=0

    # 字符集大小
    local charset_size=0
    [[ "$password" =~ [a-z] ]] && ((charset_size+=26))
    [[ "$password" =~ [A-Z] ]] && ((charset_size+=26))
    [[ "$password" =~ [0-9] ]] && ((charset_size+=10))
    [[ "$password" =~ [^a-zA-Z0-9] ]] && ((charset_size+=32))

    # 计算熵值
    entropy=$(echo "l(${#password} * l($charset_size)) / l(2)" | bc -l)

    echo "$entropy"
}

# 验证熵值
MIN_ENTROPY=80
entropy=$(calculate_entropy "$password")
if (( $(echo "$entropy < $MIN_ENTROPY" | bc -l) )); then
    log_error "密钥熵值不足: $entropy < $MIN_ENTROPY bits"
    return 1
fi
```

**熵值标准**:
- 弱: < 40 bits
- 中: 40-80 bits
- 强: 80-120 bits
- 非常强: > 120 bits

#### 2.3 密钥复杂度检查

**目的**: 确保密钥包含多种字符类型

```bash
# 检查字符多样性
check_complexity() {
    local password=$1
    local score=0

    # 包含小写字母
    [[ "$password" =~ [a-z] ]] && ((score+=1))
    # 包含大写字母
    [[ "$password" =~ [A-Z] ]] && ((score+=1))
    # 包含数字
    [[ "$password" =~ [0-9] ]] && ((score+=1))
    # 包含特殊字符
    [[ "$password" =~ [^a-zA-Z0-9] ]] && ((score+=1))

    if [[ $score -lt 3 ]]; then
        log_error "密钥复杂度不足: $score/4"
        return 1
    fi

    log_success "密钥复杂度检查通过: $score/4"
}
```

**复杂度要求**:
- 至少包含3种字符类型
- 推荐包含所有4种字符类型

### 3. 文件权限检查

#### 3.1 配置文件权限

**脚本**: `scripts/security/check-file-permissions.sh`

**标准**:
- 配置文件: 600 (rw-------)
- SSH私钥: 600 (rw-------)
- SSH公钥: 644 (rw-r--r--)
- 脚本文件: 755 (rwxr-xr-x)

```bash
# 检查配置文件权限
check_config_permissions() {
    local config_file=$1
    local expected_perms="600"

    actual_perms=$(stat -c "%a" "$config_file")
    if [[ "$actual_perms" != "$expected_perms" ]]; then
        log_error "配置文件权限不正确: $actual_perms (期望: $expected_perms)"
        return 1
    fi

    log_success "配置文件权限检查通过: $actual_perms"
}
```

#### 3.2 所有权检查

**目的**: 确保文件由正确的用户拥有

```bash
# 检查文件所有权
check_ownership() {
    local file=$1
    local expected_owner=$2

    actual_owner=$(stat -c "%U" "$file")
    if [[ "$actual_owner" != "$expected_owner" ]]; then
        log_error "文件所有权不正确: $actual_owner (期望: $expected_owner)"
        return 1
    fi

    log_success "文件所有权检查通过: $actual_owner"
}
```

#### 3.3 目录权限检查

**目的**: 确保目录权限安全

```bash
# 检查目录权限
check_directory_permissions() {
    local directory=$1

    # 检查目录权限
    dir_perms=$(stat -c "%a" "$directory")
    if [[ "$dir_perms" != "700" ]]; then
        log_warning "目录权限不是700: $dir_perms"
    fi

    # 检查目录所有权
    dir_owner=$(stat -c "%U" "$directory")
    if [[ "$dir_owner" != "$USER" ]]; then
        log_error "目录所有权不正确: $dir_owner"
        return 1
    fi
}
```

### 4. 安全基线验证

#### 4.1 系统安全配置

**检查项**:
- [ ] SSH配置安全 (禁用密码认证)
- [ ] 防火墙规则配置
- [ ] 系统更新状态
- [ ] 安全补丁级别

#### 4.2 网络安全

**检查项**:
- [ ] SSL/TLS证书有效
- [ ] HTTPS强制启用
- [ ] 网络隔离配置
- [ ] VPN访问控制

---

## 部署中的安全措施

### 1. 加密传输

#### 1.1 SSH加密

**要求**: 使用SSH协议进行所有远程操作

```bash
# SSH配置标准
SSH_CONFIG=(
    "-o Protocol=2"           # 仅使用SSH协议版本2
    "-o Ciphers=aes256-gcm@openssh.com,chacha20-poly1305@openssh.com"
    "-o MACs=hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com"
    "-o KexAlgorithms=curve25519-sha256@libssh.org,diffie-hellman-group-exchange-sha256"
    "-o HostKeyAlgorithms=ssh-ed25519,rsa-sha2-512"
)

# 使用加密SSH连接
ssh "${SSH_CONFIG[@]}" -i ~/.ssh/deploy_key root@server "command"
```

#### 1.2 数据传输加密

**要求**: 使用rsync + SSH进行文件传输

```bash
# 安全传输配置
RSYNC_OPTIONS=(
    "-avz"                    # 归档模式、压缩、详细
    "-e 'ssh -i ~/.ssh/deploy_key -o StrictHostKeyChecking=no'"
    "--checksum"              # 校验和验证
    "--delete"                # 删除目标中多余的文件
)

# 执行安全传输
rsync "${RSYNC_OPTIONS[@]}" source/ destination/
```

### 2. 访问控制

#### 2.1 最小权限原则

**要求**: 仅授予必要的最小权限

```bash
# 使用专用部署账户
DEPLOY_USER="deploy_user"
DEPLOY_GROUP="deploy_group"

# 限制sudo权限
echo "$DEPLOY_USER ALL=(ALL) NOPASSWD: /usr/bin/docker, /bin/systemctl" | sudo tee /etc/sudoers.d/deploy
```

#### 2.2 临时访问令牌

**要求**: 使用临时令牌而非永久凭据

```bash
# 生成临时访问令牌
generate_temp_token() {
    local duration=${1:-3600}  # 默认1小时
    local token=$(openssl rand -hex 16)
    local expiry=$(($(date +%s) + duration))

    echo "临时令牌: $token"
    echo "有效期: $(date -d @$expiry)"

    # 存储令牌（加密）
    echo "$token|$expiry" | openssl enc -aes-256-cbc -salt -out /tmp/token.enc
}
```

### 3. 操作审计

#### 3.1 部署审计日志

**要求**: 记录所有部署操作

```bash
# 记录部署开始
log_deployment_start() {
    local tenant_id=$1
    local user=$2
    local timestamp=$(date -Iseconds)

    psql -h localhost -U postgres -d deployment_state << EOF
INSERT INTO audit_log (
    timestamp,
    actor,
    action,
    resource_type,
    resource_id,
    details
) VALUES (
    '$timestamp',
    '$user',
    'DEPLOYMENT_START',
    'TENANT',
    '$tenant_id',
    '{"deployment_type": "github_actions"}'
);
EOF
}

# 记录部署步骤
log_deployment_step() {
    local step=$1
    local status=$2
    local message=$3

    echo "[$(date -Iseconds)] [$status] $step: $message" >> /var/log/deployment.log
}
```

#### 3.2 命令执行审计

**要求**: 记录所有执行的命令

```bash
# 启用bash命令审计
set -o history

# 记录命令到审计日志
log_command() {
    local cmd="$*"
    local timestamp=$(date -Iseconds)

    echo "[$timestamp] $cmd" >> /var/log/command_audit.log
}

# 使用trap记录命令
trap 'log_command "$BASH_COMMAND"' DEBUG
```

### 4. 实时监控

#### 4.1 部署过程监控

**要求**: 实时监控部署进度和状态

```bash
# 监控部署进度
monitor_deployment() {
    local deployment_id=$1

    while true; do
        status=$(get_deployment_status "$deployment_id")

        case "$status" in
            "in_progress")
                log_info "部署进行中..."
                ;;
            "success")
                log_success "部署成功"
                break
                ;;
            "failed")
                log_error "部署失败"
                break
                ;;
        esac

        sleep 5
    done
}
```

#### 4.2 异常检测

**要求**: 检测部署过程中的异常行为

```bash
# 检测异常行为
detect_anomalies() {
    local deployment_id=$1

    # 检查部署时间是否异常
    start_time=$(get_deployment_start_time "$deployment_id")
    current_time=$(date +%s)
    duration=$((current_time - start_time))

    if [[ $duration -gt 1800 ]]; then  # 30分钟
        log_warning "部署时间异常: ${duration}秒"
    fi

    # 检查资源使用是否异常
    cpu_usage=$(get_cpu_usage)
    if [[ $(echo "$cpu_usage > 80" | bc) -eq 1 ]]; then
        log_warning "CPU使用率异常: $cpu_usage%"
    fi
}
```

---

## 部署后安全验证

### 1. 配置漂移检测

#### 1.1 自动检测

**脚本**: `scripts/monitoring/detect-config-drift.sh`

```bash
# 检测配置漂移
detect_config_drift() {
    local tenant_id=$1
    local config_file="config/tenants/${tenant_id}.yml"

    # 从Git获取预期配置
    expected_config=$(yq eval '.' "$config_file")

    # 从运行容器获取实际配置
    actual_config=$(docker exec opclaw-backend env)

    # 对比配置
    diff <(echo "$expected_config") <(echo "$actual_config") || {
        log_error "检测到配置漂移"
        return 1
    }

    log_success "配置一致，无漂移"
}
```

#### 1.2 漂移分类

**严重性级别**:
- **CRITICAL**: 可能导致安全漏洞或服务中断
- **MAJOR**: 可能影响功能或性能
- **MINOR**: 不影响功能的小差异

```bash
# 分类配置漂移
classify_drift() {
    local field=$1
    local expected=$2
    local actual=$3

    case "$field" in
        "NODE_ENV"|"DB_SYNC"|"FEISHU_APP_ID")
            echo "CRITICAL"
            ;;
        "LOG_LEVEL"|"TIMEOUT")
            echo "MAJOR"
            ;;
        *)
            echo "MINOR"
            ;;
    esac
}
```

### 2. 日志监控扫描

#### 2.1 安全事件扫描

**脚本**: `scripts/security/scan-logs.sh`

**扫描事件**:
- 异常登录尝试
- 配置变更
- 权限提升
- 敏感操作

```bash
# 扫描安全事件
scan_security_events() {
    local log_file=$1
    local time_range="${2:-1hour}"

    # 检测异常登录
    failed_logins=$(grep "Failed password" "$log_file" | \
        grep --since "$time_range" | wc -l)

    if [[ $failed_logins -gt 10 ]]; then
        log_error "检测到异常登录尝试: $failed_logins 次"
    fi

    # 检测配置变更
    config_changes=$(grep "config.*change" "$log_file" | \
        grep --since "$time_range" | wc -l)

    if [[ $config_changes -gt 0 ]]; then
        log_warning "检测到配置变更: $config_changes 次"
    fi
}
```

#### 2.2 威胁情报分析

**要求**: 检测已知的攻击模式

```bash
# 检测攻击模式
detect_attack_patterns() {
    local log_file=$1

    # 检测暴力破解
    if grep -q "爆破\|brute.*force" "$log_file"; then
        log_error "检测到暴力破解攻击"
    fi

    # 检测SQL注入
    if grep -qE "(union select|' or '1'='1|drop table)" "$log_file"; then
        log_error "检测到SQL注入攻击"
    fi

    # 检测XSS攻击
    if grep -qE "<script|javascript:|onerror=" "$log_file"; then
        log_error "检测到XSS攻击"
    fi
}
```

### 3. 安全事件告警

#### 3.1 告警配置

**告警级别**:
- **P0**: 立即响应（15分钟内）
- **P1**: 尽快响应（1小时内）
- **P2**: 计划响应（4小时内）
- **P3**: 低优先级（24小时内）

```bash
# 发送告警
send_alert() {
    local level=$1
    local message=$2
    local webhook_url=$3

    case "$level" in
        "P0")
            # 立即通知所有渠道
            send_slack_alert "$message" "$webhook_url"
            send_email_alert "security@aiopclaw.com" "$message"
            send_sms_alert "$message"
            ;;
        "P1")
            # Slack + 邮件
            send_slack_alert "$message" "$webhook_url"
            send_email_alert "ops@aiopclaw.com" "$message"
            ;;
        "P2")
            # 仅Slack
            send_slack_alert "$message" "$webhook_url"
            ;;
        "P3")
            # 记录到日志
            log_warning "$message"
            ;;
    esac
}
```

#### 3.2 告警内容

**告警信息应包含**:
- 事件类型
- 发生时间
- 影响范围
- 严重程度
- 建议措施

```bash
# 生成告警消息
generate_alert_message() {
    local event_type=$1
    local severity=$2
    local affected_resources=$3

    cat << EOF
🚨 安全事件告警

类型: $event_type
严重程度: $severity
发生时间: $(date -Iseconds)
影响资源: $affected_resources

建议措施:
$(get_recommendation "$event_type")

详情: $AUDIT_URL
EOF
}
```

---

## 安全监控

### 1. 实时监控

#### 1.1 监控指标

**安全KPI**:

| 指标 | 目标值 | 告警阈值 | 严重阈值 |
|------|--------|---------|---------|
| 部署失败率 | <5% | >10% | >20% |
| 配置漂移数量 | 0 | 1个 | 3个 |
| 安全事件数量 | 0 | 1个/天 | 3个/天 |
| 异常登录尝试 | <10次/天 | >50次/天 | >100次/天 |

#### 1.2 监控面板

```sql
-- 创建安全监控视图
CREATE OR REPLACE VIEW v_deployment_security AS
SELECT
    '部署失败率（24小时）' AS metric,
    ROUND(
        COUNT(*) FILTER (WHERE status = 'failed')::numeric /
        NULLIF(COUNT(*)::numeric, 0) * 100,
        2
    ) AS value,
    CASE
        WHEN ROUND(COUNT(*) FILTER (WHERE status = 'failed')::numeric /
            NULLIF(COUNT(*)::numeric, 0) * 100, 2) > 10 THEN 'WARNING'
        WHEN ROUND(COUNT(*) FILTER (WHERE status = 'failed')::numeric /
            NULLIF(COUNT(*)::numeric, 0) * 100, 2) > 20 THEN 'CRITICAL'
        ELSE 'OK'
    END AS status
FROM deployments
WHERE deployment_time > NOW() - INTERVAL '24 hours';
```

### 2. 定期审计

#### 2.1 每日审计

**检查项目**:
- [ ] 审查部署日志
- [ ] 检查配置漂移
- [ ] 验证备份完整性
- [ ] 审查安全事件

#### 2.2 每周审计

**检查项目**:
- [ ] 密钥轮换状态
- [ ] 访问权限审查
- [ ] 安全更新检查
- [ ] 合规性验证

#### 2.3 每月审计

**检查项目**:
- [ ] 完整安全评估
- [ ] 渗透测试
- [ ] 安全培训
- [ ] 应急演练

---

## 应急响应

### 1. 安全事件响应

#### 1.1 事件分类

| 事件类型 | 响应级别 | 响应时间 | 处理流程 |
|---------|---------|---------|---------|
| 未授权访问 | P0 | 15分钟 | 隔离→取证→修复 |
| 数据泄露 | P0 | 15分钟 | 止损→评估→通知 |
| 配置篡改 | P1 | 1小时 | 回滚→审计→加固 |
| 恶意软件 | P0 | 15分钟 | 隔离→清除→验证 |

#### 1.2 响应流程

```
1. 检测与识别
   ├── 监控系统告警
   ├── 用户报告
   └── 自动检测触发

2. 遏制与隔离
   ├── 停止受影响服务
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

### 2. 自动遏制

#### 2.1 自动锁定脚本

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

#### 2.2 快速恢复脚本

```bash
#!/bin/bash
# quick-recovery.sh - 快速恢复脚本

# 1. 从备份恢复配置
scp backup@backup.aiopclaw.com:/backup/opclaw/config_latest.tar.gz.gpg /tmp/
gpg --decrypt /tmp/config_latest.tar.gz.gpg | tar xz -C /opt/opclaw/

# 2. 验证配置
./scripts/config/validate-config.sh /opt/opclaw/.env.production

# 3. 重启服务
docker start opclaw-backend opclaw-postgres opclaw-redis

# 4. 健康检查
./scripts/monitoring/enhanced-health-check.sh

# 5. 监控24小时
./scripts/migration/post-change-monitor.sh
```

---

## 合规性要求

### 1. 数据保护

#### 1.1 数据加密

**要求**:
- 静态数据加密
- 传输数据加密
- 备份数据加密

```bash
# 静态数据加密
cryptsetup luksFormat /dev/sdb1
cryptsetup luksOpen /dev/sdb1 encrypted_data

# 传输数据加密
ssh -i ~/.ssh/deploy_key root@server "command"

# 备份加密
pg_dump -U postgres deployment_state | \
  gpg --symmetric --cipher-algo AES256 -o backup.sql.gpg
```

#### 1.2 数据保留

**要求**:
- 审计日志保留90天
- 安全事件日志保留1年
- 配置快照保留30天

### 2. 访问控制

#### 2.1 权限管理

**要求**:
- 最小权限原则
- 定期权限审查
- 访问权限记录

#### 2.2 身份验证

**要求**:
- 多因素认证
- 强密码策略
- 定期密码轮换

### 3. 安全审计

#### 3.1 审计日志

**要求**:
- 完整的操作记录
- 不可篡改的日志
- 定期审计报告

---

## 安全检查清单

### 部署前检查 (Pre-Deployment)

- [ ] 配置文件已验证
- [ ] 无Placeholder值
- [ ] 密钥强度符合要求
- [ ] 文件权限正确
- [ ] SSH密钥安全
- [ ] 安全基线验证通过
- [ ] 备份已完成
- [ ] 回滚计划已准备

### 部署中检查 (During Deployment)

- [ ] 使用加密连接
- [ ] 访问控制已启用
- [ ] 操作正在审计
- [ ] 实时监控已启用
- [ ] 异常检测已启用

### 部署后检查 (Post-Deployment)

- [ ] 配置漂移检测
- [ ] 日志监控扫描
- [ ] 健康检查通过
- [ ] 安全事件扫描
- [ ] 性能基线对比
- [ ] 审计日志完整
- [ ] 监控告警配置

### 定期检查 (Periodic)

- [ ] 每日: 审查部署日志
- [ ] 每日: 检查配置漂移
- [ ] 每日: 验证备份完整性
- [ ] 每周: 密钥轮换状态
- [ ] 每周: 访问权限审查
- [ ] 每月: 完整安全评估
- [ ] 每月: 渗透测试

---

## 附录

### A. 安全相关脚本

| 脚本文件 | 用途 | 使用频率 |
|---------|------|---------|
| `scripts/security/check-config-security.sh` | 配置安全检查 | 每次部署 |
| `scripts/security/check-secret-strength.sh` | 密钥强度验证 | 每次部署 |
| `scripts/security/check-file-permissions.sh` | 文件权限检查 | 每次部署 |
| `scripts/security/scan-logs.sh` | 日志监控扫描 | 每日 |
| `scripts/security/security-check-suite.sh` | 安全检查套件 | 每次部署 |

### B. 安全相关配置

| 配置项 | 位置 | 期望值 |
|--------|------|--------|
| 配置文件权限 | `config/tenants/*.yml` | 600 |
| SSH私钥权限 | `~/.ssh/*_private` | 600 |
| SSH公钥权限 | `~/.ssh/*_public` | 644 |
| 脚本文件权限 | `scripts/**/*.sh` | 755 |
| 目录权限 | `config/tenants/` | 700 |

### C. 常用命令

```bash
# 运行完整安全检查
./scripts/security/security-check-suite.sh

# 检查配置安全
./scripts/security/check-config-security.sh config/tenants/test_tenant_alpha.yml

# 扫描日志
./scripts/security/scan-logs.sh /var/log/opclaw/deployment.log

# 检测配置漂移
./scripts/monitoring/detect-config-drift.sh --tenant test_tenant_alpha

# 查看审计日志
psql -h localhost -U postgres -d deployment_state \
  -c "SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 50;"
```

---

**文档版本**: 1.0.0
**最后更新**: 2026-03-19
**维护者**: AIOpc DevOps Team
