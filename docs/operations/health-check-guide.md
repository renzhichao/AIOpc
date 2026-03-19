# Tenant Health Check Guide

## 概述 (Overview)

租户健康检查系统提供全面的租户实例监控能力，支持单租户检查、批量检查、历史查询和告警通知。

The tenant health check system provides comprehensive monitoring capabilities for tenant instances, supporting single tenant checks, batch checks, historical queries, and alert notifications.

## 架构 (Architecture)

### 组件 (Components)

```
┌─────────────────────────────────────────────────────────────────┐
│                    Tenant Health Check System                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│  │ health-check.sh  │  │health-check-all │  │health-status│ │
│  │                  │  │                  │  │     .sh      │ │
│  │ Single Tenant    │  │  Batch Checks    │  │              │ │
│  │ Health Check     │  │  (Parallel)      │  │ Query History│ │
│  └────────┬─────────┘  └────────┬─────────┘  └──────────────┘ │
│           │                     │                             │
│           └──────────┬──────────┘                             │
│                      ▼                                        │
│           ┌──────────────────────┐                            │
│           │enhanced-health-check │                            │
│           │        .sh           │                            │
│           │  Multi-Layer Checks  │                            │
│           └──────────┬───────────┘                            │
│                      │                                        │
│           ┌──────────▼───────────┐                            │
│           │  State Database      │                            │
│           │  (health_checks)     │                            │
│           └──────────────────────┘                            │
│                                                                   │
│  ┌──────────────────┐                                          │
│  │alert-health-issue│                                          │
│  │      .sh         │                                          │
│  │                  │                                          │
│  │ Email/Webhook    │                                          │
│  │ Notifications    │                                          │
│  └──────────────────┘                                          │
└─────────────────────────────────────────────────────────────────┘
```

### 健康检查层 (Health Check Layers)

租户健康检查系统执行5层验证：

The tenant health check system performs 5 layers of verification:

| Layer | Name | Description |
|-------|------|-------------|
| 1 | HTTP Health Check | Backend endpoint responding with 200 |
| 2 | Database Connection | PostgreSQL accepting connections |
| 3 | Database Query | PostgreSQL executing queries |
| 4 | OAuth Configuration | Feishu OAuth configured |
| 5 | Redis Connection | Redis cache service operational |

### 健康状态分类 (Health Status Classification)

| Status Code | Status | Description |
|-------------|--------|-------------|
| 0 | healthy | All checks passed |
| 1 | warning | Some checks failed but service is functional |
| 2 | critical | Critical services down |
| 3 | unknown | Unable to determine status |

## 使用指南 (Usage Guide)

### 1. 单租户健康检查 (Single Tenant Health Check)

#### 基本用法 (Basic Usage)

```bash
# 检查单个租户健康状态
scripts/tenant/health-check.sh tenant_001

# 使用JSON输出
scripts/tenant/health-check.sh tenant_001 --json

# 静默模式（仅退出码）
scripts/tenant/health-check.sh tenant_001 --quiet
```

#### 高级选项 (Advanced Options)

```bash
# 仅检查特定层
scripts/tenant/health-check.sh tenant_001 --layer 1  # HTTP only
scripts/tenant/health-check.sh tenant_001 --layer 2  # Database only

# 设置超时时间
scripts/tenant/health-check.sh tenant_001 --timeout 60

# 详细输出
scripts/tenant/health-check.sh tenant_001 --verbose

# 跳过数据库记录
scripts/tenant/health-check.sh tenant_001 --no-db
```

#### 输出示例 (Output Example)

```
════════════════════════════════════════════════════════════════
  Tenant Health Check: tenant_001
════════════════════════════════════════════════════════════════

Tenant ID:     tenant_001
Name:          Test Tenant Alpha
Environment:   development
Status:        healthy
Checks:        5/5 passed
Timestamp:     2026-03-19T10:30:00Z

Execution time: 245ms
```

### 2. 批量健康检查 (Batch Health Check)

#### 基本用法 (Basic Usage)

```bash
# 检查所有租户
scripts/tenant/health-check-all.sh

# 按环境过滤
scripts/tenant/health-check-all.sh --environment production

# 仅显示摘要
scripts/tenant/health-check-all.sh --summary-only
```

#### 并行执行 (Parallel Execution)

```bash
# 启用并行检查（默认5个worker）
scripts/tenant/health-check-all.sh --parallel

# 自定义worker数量
scripts/tenant/health-check-all.sh --parallel --max-workers 10

# 仅生产环境并行检查
scripts/tenant/health-check-all.sh --environment production --parallel --max-workers 3
```

#### JSON输出 (JSON Output)

```bash
# JSON格式输出
scripts/tenant/health-check-all.sh --json

# JSON输出用于集成
scripts/tenant/health-check-all.sh --json | jq '.[] | select(.status == "critical")'
```

#### 输出示例 (Output Example)

```
════════════════════════════════════════════════════════════════
  Batch Tenant Health Check Report
════════════════════════════════════════════════════════════════

Total Tenants:   3
Completed:       3
Failed:          0

Tenant Details:
──────────────────────────────────────────────────────────────────
TENANT_ID            NAME                 ENVIRONMENT      STATUS        TIME(ms)     TIMESTAMP
──────────────────── ──────────────────── ──────────────── ──────────── ──────────── ──────────────
tenant_001           Test Tenant Alpha    development      healthy       245          2026-03-19T10:30:00Z
tenant_002           Test Tenant Beta     staging          healthy       312          2026-03-19T10:30:01Z
tenant_003           Test Tenant Gamma    production       warning       456          2026-03-19T10:30:02Z
```

### 3. 健康状态查询 (Health Status Query)

#### 查询历史记录 (Query History)

```bash
# 显示最近10次检查
scripts/tenant/health-status.sh tenant_001

# 显示最近20次检查
scripts/tenant/health-status.sh tenant_001 --history 20

# 仅显示最新状态
scripts/tenant/health-status.sh tenant_001 --latest
```

#### 过滤查询 (Filter Queries)

```bash
# 按检查类型过滤
scripts/tenant/health-status.sh tenant_001 --check-type http
scripts/tenant/health-status.sh tenant_001 --check-type database

# 按状态过滤
scripts/tenant/health-status.sh tenant_001 --status fail
scripts/tenant/health-status.sh tenant_001 --status warning

# 按时间范围过滤
scripts/tenant/health-status.sh tenant_001 --since 2026-03-01
scripts/tenant/health-status.sh tenant_001 --since 2026-03-01 --until 2026-03-15
```

#### 输出格式 (Output Formats)

```bash
# 紧凑格式（每行一个检查）
scripts/tenant/health-status.sh tenant_001 --compact

# JSON格式
scripts/tenant/health-status.sh tenant_001 --json
```

#### 输出示例 (Output Example)

```
════════════════════════════════════════════════════════════════
  Tenant Health Status: tenant_001
════════════════════════════════════════════════════════════════

Tenant ID:     tenant_001
Name:          Test Tenant Alpha
Environment:   development

Health Statistics:
  Total Checks:     50
  Passed:           48
  Failed:           2
  Warnings:         0
  Skipped:          0
  Avg Response:     285.45ms
  Min Response:     145ms
  Max Response:     456ms

Health Check History:
[HTTP] pass (245ms) - 2026-03-19 10:30:00
[Database] pass (152ms) - 2026-03-19 10:30:00
[OAuth] pass (98ms) - 2026-03-19 10:30:00
[Redis] pass (87ms) - 2026-03-19 10:30:00
```

### 4. 健康告警 (Health Alerts)

#### 邮件告警 (Email Alerts)

```bash
# 发送邮件告警
scripts/tenant/alert-health-issue.sh tenant_001 \
  --issue critical \
  --severity critical \
  --email admin@example.com

# 自定义消息
scripts/tenant/alert-health-issue.sh tenant_001 \
  --issue database \
  --email ops@example.com \
  --message "Database connection timeout detected"
```

#### Webhook告警 (Webhook Alerts)

```bash
# Slack webhook
scripts/tenant/alert-health-issue.sh tenant_001 \
  --issue critical \
  --webhook https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# 自定义webhook
scripts/tenant/alert-health-issue.sh tenant_001 \
  --issue oauth \
  --webhook https://your-webhook.example.com/alert
```

#### 干跑模式 (Dry Run Mode)

```bash
# 查看告警内容而不实际发送
scripts/tenant/alert-health-issue.sh tenant_001 \
  --issue http \
  --dry-run
```

#### 告警类型 (Alert Types)

| Issue Type | Description | Use Case |
|------------|-------------|----------|
| critical | Critical system failure | Complete service outage |
| warning | Warning condition | Performance degradation |
| database | Database issues | Connection/query problems |
| oauth | OAuth problems | Authentication failures |
| redis | Redis issues | Cache service problems |
| http | HTTP endpoint issues | API not responding |
| ssh | SSH access problems | Cannot access server |

## 定时任务 (Scheduled Tasks)

### Crontab示例 (Crontab Examples)

```bash
# 每5分钟检查一次生产租户
*/5 * * * * /path/to/AIOpc/scripts/tenant/health-check.sh tenant_003 --quiet

# 每小时批量检查所有租户
0 * * * * /path/to/AIOpc/scripts/tenant/health-check-all.sh --summary-only

# 每天午夜检查所有租户并记录历史
0 0 * * * /path/to/AIOpc/scripts/tenant/health-check-all.sh --json > /var/log/tenant-health-$(date +\%Y\%m\%d).json

# 每周生成健康报告
0 0 * * 0 /path/to/AIOpc/scripts/tenant/health-status.sh tenant_001 --history 100 > /var/log/weekly-health-report.txt
```

### Systemd Timer示例 (Systemd Timer Examples)

创建服务文件 `/etc/systemd/system/tenant-health-check.service`:
Create service file:

```ini
[Unit]
Description=Tenant Health Check Service
After=network.target

[Service]
Type=oneshot
User=opclaw
WorkingDirectory=/opt/opclaw
ExecStart=/opt/opclaw/scripts/tenant/health-check-all.sh --summary-only
```

创建定时器 `/etc/systemd/system/tenant-health-check.timer`:
Create timer file:

```ini
[Unit]
Description=Tenant Health Check Timer
Requires=tenant-health-check.service

[Timer]
OnCalendar=hourly
Persistent=true

[Install]
WantedBy=timers.target
```

启用定时器:
Enable timer:

```bash
systemctl daemon-reload
systemctl enable tenant-health-check.timer
systemctl start tenant-health-check.timer
```

## 监控集成 (Monitoring Integration)

### Prometheus集成 (Prometheus Integration)

```bash
# 添加健康检查指标到Prometheus
# 创建脚本 /opt/opclaw/scripts/exporter/tenant-health-metrics.sh
```

```bash
#!/bin/bash
# tenant-health-metrics.sh
TENANT_ID="tenant_001"
OUTPUT=$(/opt/opclaw/scripts/tenant/health-check.sh "$TENANT_ID" --json)

# 解析JSON并输出Prometheus格式
STATUS=$(echo "$OUTPUT" | jq -r '.status')
RESPONSE_TIME=$(echo "$OUTPUT" | jq -r '.summary.execution_time_ms')

echo "# HELP tenant_health_status Tenant health status (0=healthy, 1=warning, 2=critical)"
echo "# TYPE tenant_health_status gauge"
echo "tenant_health_status{tenant=\"$TENANT_ID\"} $STATUS"

echo "# HELP tenant_health_response_time_ms Tenant health check response time"
echo "# TYPE tenant_health_response_time_ms gauge"
echo "tenant_health_response_time_ms{tenant=\"$TENANT_ID\"} $RESPONSE_TIME"
```

### Grafana Dashboard (Grafana Dashboard)

创建Grafana面板查询示例:
Create Grafana panel query examples:

```promql
# 租户健康状态
tenant_health_status

# 租户健康检查响应时间
tenant_health_response_time_ms

# 失败率
rate(tenant_health_status{status="2"}[5m])
```

## 故障排除 (Troubleshooting)

### 常见问题 (Common Issues)

#### 1. 健康检查超时 (Health Check Timeout)

**问题**: 检查超时或无响应

**解决方案**:
```bash
# 增加超时时间
scripts/tenant/health-check.sh tenant_001 --timeout 120

# 仅检查关键层
scripts/tenant/health-check.sh tenant_001 --layer 1
```

#### 2. 数据库连接失败 (Database Connection Failed)

**问题**: 无法连接到状态数据库

**解决方案**:
```bash
# 检查数据库连接
psql -h localhost -U postgres -d deployment_state -c "SELECT 1"

# 跳过数据库记录
scripts/tenant/health-check.sh tenant_001 --no-db
```

#### 3. 租户配置未找到 (Tenant Configuration Not Found)

**问题**: 租户配置文件缺失

**解决方案**:
```bash
# 检查配置文件
ls -la /opt/opclaw/config/tenants/

# 创建租户配置
scripts/tenant/create.sh --id tenant_004 --name "Tenant 004" --environment staging
```

#### 4. 并行检查问题 (Parallel Check Issues)

**问题**: 并行检查导致资源耗尽

**解决方案**:
```bash
# 减少worker数量
scripts/tenant/health-check-all.sh --parallel --max-workers 2

# 使用顺序检查
scripts/tenant/health-check-all.sh
```

### 日志检查 (Log Checking)

```bash
# 查看健康检查日志
tail -f /var/log/opclaw/health-check.log

# 查看特定租户的检查历史
scripts/tenant/health-status.sh tenant_001 --history 50

# 查看失败的健康检查
scripts/tenant/health-status.sh tenant_001 --status fail --since 2026-03-01
```

## 最佳实践 (Best Practices)

### 1. 监控频率 (Monitoring Frequency)

- **生产环境**: 每5-10分钟检查一次
- **预发布环境**: 每15-30分钟检查一次
- **开发环境**: 每小时检查一次

### 2. 告警策略 (Alert Strategy)

- **critical**: 立即发送告警（邮件+webhook）
- **warning**: 每小时汇总告警
- **info**: 仅记录，不发送告警

### 3. 数据保留 (Data Retention)

```sql
-- 清理30天前的健康检查记录
DELETE FROM health_checks
WHERE checked_at < NOW() - INTERVAL '30 days';
```

### 4. 性能优化 (Performance Optimization)

- 使用并行检查提高效率
- 仅检查必要的层（如仅HTTP）
- 使用JSON输出便于自动化处理
- 定期清理历史数据

### 5. 安全考虑 (Security Considerations)

- 不要在日志中记录敏感信息
- 使用环境变量存储数据库密码
- 限制告警邮件/ webhook的访问权限
- 定期审核安全审计日志

## 测试 (Testing)

### 运行测试套件 (Run Test Suite)

```bash
# 运行所有测试
scripts/tests/test-health-check.sh

# 详细输出
scripts/tests/test-health-check.sh --verbose

# 跳过集成测试
scripts/tests/test-health-check.sh --skip-integration

# 测试特定租户
scripts/tests/test-health-check.sh --tenant tenant_001
```

### 测试覆盖 (Test Coverage)

测试套件包含:
- 单元测试 (Unit Tests)
- 集成测试 (Integration Tests)
- 性能测试 (Performance Tests)
- 错误处理测试 (Error Handling Tests)

## 相关文档 (Related Documentation)

- [Enhanced Health Check Implementation](../monitoring/enhanced-health-check.md)
- [State Management System](../lib/state.md)
- [Tenant Management Guide](tenant-management.md)
- [Alert Configuration Guide](alert-configuration.md)

## 版本历史 (Version History)

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-03-19 | Initial release |

## 支持 (Support)

如有问题或建议，请联系:
For issues or suggestions, please contact:

- Email: support@example.com
- Slack: #tenant-health-check
- GitHub Issues: https://github.com/example/AIOpc/issues
