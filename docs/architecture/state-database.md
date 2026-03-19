# 状态数据库架构文档

> **Deployment State Database Architecture**
> **版本**: 1.0.0
> **创建日期**: 2026-03-19
> **数据库**: PostgreSQL 14+
> **任务**: TASK-006 状态数据库设置

---

## 目录

1. [架构概述](#架构概述)
2. [数据库Schema](#数据库schema)
3. [表结构详解](#表结构详解)
4. [视图定义](#视图定义)
5. [存储函数](#存储函数)
6. [数据关系](#数据关系)
7. [使用示例](#使用示例)
8. [性能考虑](#性能考虑)

---

## 架构概述

### 设计原则

状态数据库 (`deployment_state`) 遵循以下设计原则：

1. **完整追踪**: 记录所有部署活动、配置变更和健康检查
2. **审计友好**: 提供完整的审计日志，满足合规要求
3. **高性能查询**: 优化索引和视图，支持快速查询
4. **数据完整性**: 使用外键约束和事务确保数据一致性
5. **可扩展性**: 设计支持未来功能扩展

### 数据库组件

```
deployment_state (PostgreSQL Database)
│
├── 核心表 (8张)
│   ├── tenants                    # 租户信息
│   ├── deployments                # 部署记录
│   ├── deployment_config_snapshots # 配置快照
│   ├── health_checks              # 健康检查历史
│   ├── security_audit_log         # 安全审计日志
│   ├── config_drift_reports       # 配置漂移报告
│   ├── incidents                  # 事件跟踪
│   └── ssh_key_audit              # SSH密钥审计
│
├── 视图 (3个)
│   ├── v_deployment_summary       # 部署汇总视图
│   ├── v_tenant_health            # 租户健康状态视图
│   └── v_recent_security_events   # 最近安全事件视图
│
└── 函数 (4个)
    ├── health_check()             # 数据库健康检查
    ├── log_ssh_key_usage()        # SSH密钥使用日志
    ├── record_tenant()            # 创建/更新租户
    └── get_deployment_stats()     # 部署统计
```

### 集成架构

```
┌─────────────────────────────────────────────────────────────┐
│                    部署脚本层                                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  deploy-tenant.sh, rollback.sh, health-monitor.sh      │ │
│  └────────────────────────────────────────────────────────┘ │
│                           │                                  │
│                           ▼                                  │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  状态管理库 (scripts/lib/state.sh)                     │ │
│  │  - record_deployment_start()                           │ │
│  │  - record_health_check()                               │ │
│  │  - record_config_drift()                               │ │
│  └────────────────────────────────────────────────────────┘ │
│                           │                                  │
│                           ▼                                  │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  deployment_state 数据库 (PostgreSQL)                  │ │
│  │  ├─ 部署历史追踪                                         │ │
│  │  ├─ 配置快照存储                                         │ │
│  │  ├─ 健康检查记录                                         │ │
│  │  ├─ 安全审计日志                                         │ │
│  │  └─ 事件管理                                            │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 数据库Schema

### ER图

```
┌─────────────┐         ┌──────────────┐         ┌─────────────────────┐
│   tenants   │         │ deployments  │         │ deployment_config   │
│             │1       N│              │1     1  │   _snapshots        │
│ - tenant_id │◄────────│ - tenant_id  │─────────│ - deployment_id     │
│ - tenant_   │         │ - deployment_│         │ - config_content    │
│   name      │         │   id         │         │ - env_content       │
│ - server_   │         │ - version    │         │ - docker_content    │
│   host      │         │ - status     │         │                     │
└─────────────┘         └──────┬───────┘         └─────────────────────┘
                                │1
                                │
                                │N
                        ┌───────▼────────┐
                        │ health_checks │
                        │                │
                        │ - deployment_  │
                        │   id (nullable)│
                        │ - check_type   │
                        │ - status       │
                        └────────────────┘

┌──────────────┐         ┌───────────────┐         ┌─────────────┐
│ incidents    │         │ config_drift_ │         │ ssh_key_    │
│              │N       1│ _reports      │N       1│ _audit      │
│ - incident_  │─────────│ - tenant_id   │─────────│ - tenant_id │
│   id         │         │ - drift_sev-  │         │ - ssh_key_  │
│ - tenant_id  │         │   erity       │         │   fingerprint│
│ - severity   │         └───────────────┘         └─────────────┘
└──────────────┘
        │
        │N
┌───────▼─────────┐
│ security_audit  │
│     _log        │
│                 │
│ - tenant_id     │
│ - event_type    │
│ - actor         │
└─────────────────┘
```

### 表清单

| 表名 | 用途 | 记录数 (估计) | 大小 (估计) |
|------|------|--------------|-------------|
| tenants | 租户信息 | 10-100 | <1MB |
| deployments | 部署记录 | 1000-10000 | 10-50MB |
| deployment_config_snapshots | 配置快照 | 1000-10000 | 50-200MB |
| health_checks | 健康检查历史 | 10000-100000 | 20-100MB |
| security_audit_log | 安全审计日志 | 10000-100000 | 50-200MB |
| config_drift_reports | 配置漂移报告 | 100-1000 | 1-10MB |
| incidents | 事件跟踪 | 50-500 | 1-5MB |
| ssh_key_audit | SSH密钥审计 | 100-1000 | 1-5MB |

---

## 表结构详解

### 1. tenants - 租户表

存储租户（客户）的基本信息。

```sql
CREATE TABLE tenants (
    tenant_id VARCHAR(255) PRIMARY KEY,
    tenant_name VARCHAR(500) NOT NULL,
    environment VARCHAR(50) NOT NULL,
    server_host VARCHAR(255) NOT NULL,
    feishu_app_id VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,

    CONSTRAINT env_check
        CHECK (environment IN ('production', 'staging', 'development'))
);

-- 索引
CREATE INDEX idx_tenants_active ON tenants(is_active);
CREATE INDEX idx_tenants_environment ON tenants(environment);
```

**字段说明**:
- `tenant_id`: 租户唯一标识符 (如: "tenant_001", "test_tenant_alpha")
- `tenant_name`: 租户名称
- `environment`: 环境类型
- `server_host`: 服务器主机名或IP地址
- `feishu_app_id`: Feishu OAuth应用ID
- `is_active`: 是否激活 (默认true)

**使用场景**:
- 租户信息查询
- 环境过滤
- 活跃租户列表

### 2. deployments - 部署表

核心部署记录表，跟踪所有部署活动。

```sql
CREATE TABLE deployments (
    deployment_id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(tenant_id),
    deployment_type VARCHAR(50) NOT NULL,
    component VARCHAR(50) NOT NULL,
    version VARCHAR(100) NOT NULL,
    git_commit_sha VARCHAR(100),
    git_branch VARCHAR(255),
    deployed_by VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    health_check_status VARCHAR(50),
    rollback_deployment_id INTEGER REFERENCES deployments(deployment_id),
    error_message TEXT,
    deployment_metadata JSONB,

    CONSTRAINT deployment_type_check
        CHECK (deployment_type IN ('initial', 'update', 'rollback', 'scale')),
    CONSTRAINT component_check
        CHECK (component IN ('all', 'backend', 'frontend', 'database')),
    CONSTRAINT status_check
        CHECK (status IN ('pending', 'in_progress', 'success', 'failed', 'rolled_back'))
);

-- 索引
CREATE INDEX idx_deployments_tenant ON deployments(tenant_id, started_at DESC);
CREATE INDEX idx_deployments_status ON deployments(status);
CREATE INDEX idx_deployments_deployed_by ON deployments(deployed_by);
CREATE INDEX idx_deployments_version ON deployments(version);
CREATE INDEX idx_deployments_type ON deployments(deployment_type);
```

**字段说明**:
- `deployment_id`: 自增主键
- `tenant_id`: 关联租户ID
- `deployment_type`: 部署类型
- `component`: 部署组件
- `version`: 部署版本
- `git_commit_sha`: Git提交SHA
- `git_branch`: Git分支名
- `deployed_by`: 部署操作者
- `status`: 部署状态
- `rollback_deployment_id`: 关联的回滚部署ID

**使用场景**:
- 部署历史查询
- 部署统计分析
- 回滚追踪
- 故障排查

### 3. deployment_config_snapshots - 配置快照表

存储每次部署的配置快照。

```sql
CREATE TABLE deployment_config_snapshots (
    snapshot_id SERIAL PRIMARY KEY,
    deployment_id INTEGER NOT NULL UNIQUE REFERENCES deployments(deployment_id),
    config_content TEXT NOT NULL,
    env_content TEXT,
    docker_compose_content TEXT,
    nginx_config_content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**字段说明**:
- `snapshot_id`: 自增主键
- `deployment_id`: 关联部署ID (唯一)
- `config_content`: YAML配置 (Base64编码)
- `env_content`: 环境变量 (Base64编码)
- `docker_compose_content`: Docker Compose配置 (Base64编码)
- `nginx_config_content`: Nginx配置 (Base64编码)

**使用场景**:
- 配置回滚
- 配置历史对比
- 故障排查
- 审计追踪

### 4. health_checks - 健康检查表

记录所有健康检查执行历史。

```sql
CREATE TABLE health_checks (
    health_check_id SERIAL PRIMARY KEY,
    deployment_id INTEGER REFERENCES deployments(deployment_id),
    tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(tenant_id),
    check_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL,
    response_time_ms INTEGER,
    error_message TEXT,
    checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    check_details JSONB,

    CONSTRAINT check_type_check
        CHECK (check_type IN ('http', 'database', 'oauth', 'redis', 'ssh', 'docker')),
    CONSTRAINT status_check
        CHECK (status IN ('pass', 'fail', 'warning', 'skip'))
);

-- 索引
CREATE INDEX idx_health_checks_deployment ON health_checks(deployment_id);
CREATE INDEX idx_health_checks_tenant ON health_checks(tenant_id, checked_at DESC);
CREATE INDEX idx_health_checks_status ON health_checks(status, checked_at DESC);
CREATE INDEX idx_health_checks_type ON health_checks(check_type);
```

**字段说明**:
- `health_check_id`: 自增主键
- `deployment_id`: 关联部署ID (可为空)
- `tenant_id`: 租户ID
- `check_type`: 检查类型
- `status`: 检查状态
- `response_time_ms`: 响应时间 (毫秒)
- `check_details`: 额外检查详情 (JSON)

**使用场景**:
- 健康趋势分析
- SLA监控
- 故障诊断
- 性能分析

### 5. security_audit_log - 安全审计日志表

记录所有安全敏感操作。

```sql
CREATE TABLE security_audit_log (
    audit_id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) REFERENCES tenants(tenant_id),
    event_type VARCHAR(100) NOT NULL,
    actor VARCHAR(255) NOT NULL,
    action VARCHAR(255) NOT NULL,
    resource_type VARCHAR(100),
    resource_id VARCHAR(255),
    old_value JSONB,
    new_value JSONB,
    ip_address INET,
    user_agent TEXT,
    event_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX idx_audit_tenant ON security_audit_log(tenant_id, event_timestamp DESC);
CREATE INDEX idx_audit_actor ON security_audit_log(actor, event_timestamp DESC);
CREATE INDEX idx_audit_event_type ON security_audit_log(event_type, event_timestamp DESC);
CREATE INDEX idx_audit_timestamp ON security_audit_log(event_timestamp DESC);
```

**字段说明**:
- `audit_id`: 自增主键
- `tenant_id`: 租户ID (可为空，用于系统级事件)
- `event_type`: 事件类型
- `actor`: 操作者
- `action`: 执行的操作
- `resource_type`: 资源类型
- `resource_id`: 资源ID
- `old_value`: 旧值 (JSON)
- `new_value`: 新值 (JSON)
- `ip_address`: IP地址
- `user_agent`: 用户代理

**使用场景**:
- 安全审计
- 合规报告
- 访问分析
- 事件调查

### 6. config_drift_reports - 配置漂移报告表

记录配置漂移检测结果。

```sql
CREATE TABLE config_drift_reports (
    drift_report_id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(tenant_id),
    drift_detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    config_file_path VARCHAR(500),
    expected_value TEXT,
    actual_value TEXT,
    drift_severity VARCHAR(50),
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP,
    resolution_notes TEXT,

    CONSTRAINT drift_severity_check
        CHECK (drift_severity IN ('critical', 'major', 'minor'))
);

-- 索引
CREATE INDEX idx_drift_tenant ON config_drift_reports(tenant_id, drift_detected_at DESC);
CREATE INDEX idx_drift_unresolved ON config_drift_reports(resolved, drift_severity);
CREATE INDEX idx_drift_severity ON config_drift_reports(drift_severity);
```

**字段说明**:
- `drift_report_id`: 自增主键
- `tenant_id`: 租户ID
- `drift_detected_at`: 检测时间
- `config_file_path`: 配置文件路径
- `expected_value`: 预期值
- `actual_value`: 实际值
- `drift_severity`: 严重程度
- `resolved`: 是否已解决

**使用场景**:
- 配置漂移追踪
- 合规监控
- 配置管理
- 趋势分析

### 7. incidents - 事件表

跟踪和管理部署相关事件。

```sql
CREATE TABLE incidents (
    incident_id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) REFERENCES tenants(tenant_id),
    deployment_id INTEGER REFERENCES deployments(deployment_id),
    incident_type VARCHAR(100) NOT NULL,
    severity VARCHAR(50) NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    impact TEXT,
    mitigation_steps TEXT,
    root_cause TEXT,
    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    resolution_notes TEXT,
    assignee VARCHAR(255),
    status VARCHAR(50) DEFAULT 'open',
    incident_metadata JSONB,

    CONSTRAINT severity_check
        CHECK (severity IN ('P0', 'P1', 'P2', 'P3')),
    CONSTRAINT status_check
        CHECK (status IN ('open', 'investigating', 'resolved', 'closed'))
);

-- 索引
CREATE INDEX idx_incidents_tenant ON incidents(tenant_id, detected_at DESC);
CREATE INDEX idx_incidents_severity ON incidents(severity, status);
CREATE INDEX idx_incidents_status ON incidents(status, detected_at DESC);
CREATE INDEX idx_incidents_type ON incidents(incident_type);
```

**字段说明**:
- `incident_id`: 自增主键
- `tenant_id`: 租户ID (可为空)
- `deployment_id`: 关联部署ID (可为空)
- `incident_type`: 事件类型
- `severity`: 严重程度
- `title`: 事件标题
- `description`: 详细描述
- `impact`: 影响评估
- `mitigation_steps`: 缓解措施
- `root_cause`: 根本原因
- `status`: 状态

**使用场景**:
- 事件管理
- 故障追踪
- SLA监控
- 知识库

### 8. ssh_key_audit - SSH密钥审计表

SSH密钥使用审计日志。

```sql
CREATE TABLE ssh_key_audit (
    audit_id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(tenant_id),
    ssh_key_name VARCHAR(255),
    ssh_key_fingerprint VARCHAR(255),
    ssh_key_type VARCHAR(50),
    action VARCHAR(100) NOT NULL,
    actor VARCHAR(255),
    server_host VARCHAR(255),
    access_granted_at TIMESTAMP,
    access_revoked_at TIMESTAMP,
    last_used_at TIMESTAMP,
    key_status VARCHAR(50),
    access_reason TEXT,
    ip_address INET,
    audit_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX idx_ssh_tenant ON ssh_key_audit(tenant_id, audit_timestamp DESC);
CREATE INDEX idx_ssh_fingerprint ON ssh_key_audit(ssh_key_fingerprint);
CREATE INDEX idx_ssh_status ON ssh_key_audit(key_status);
CREATE INDEX idx_ssh_action ON ssh_key_audit(action, audit_timestamp DESC);
```

**字段说明**:
- `audit_id`: 自增主键
- `tenant_id`: 租户ID
- `ssh_key_name`: SSH密钥名称
- `ssh_key_fingerprint`: SSH密钥指纹
- `ssh_key_type`: 密钥类型 (RSA/ED25519/ECDSA)
- `action`: 操作类型
- `key_status`: 密钥状态

**使用场景**:
- SSH密钥追踪
- 访问审计
- 密钥轮换管理
- 安全监控

---

## 视图定义

### 1. v_deployment_summary - 部署汇总视图

结合部署信息和健康检查统计。

```sql
CREATE VIEW v_deployment_summary AS
SELECT
    d.deployment_id,
    d.tenant_id,
    t.tenant_name,
    t.environment,
    t.server_host,
    d.deployment_type,
    d.component,
    d.version,
    d.status,
    d.deployed_by,
    d.started_at,
    d.completed_at,
    EXTRACT(EPOCH FROM (d.completed_at - d.started_at)) as deployment_duration_seconds,
    d.git_commit_sha,
    d.git_branch,
    d.error_message,
    COUNT(CASE WHEN hc.status = 'pass' THEN 1 END) as health_checks_passed,
    COUNT(CASE WHEN hc.status = 'fail' THEN 1 END) as health_checks_failed,
    COUNT(CASE WHEN hc.status = 'warning' THEN 1 END) as health_checks_warning,
    COUNT(hc.health_check_id) as total_health_checks
FROM deployments d
JOIN tenants t ON d.tenant_id = t.tenant_id
LEFT JOIN health_checks hc ON d.deployment_id = hc.deployment_id
GROUP BY d.deployment_id, t.tenant_id, t.environment, t.server_host
ORDER BY d.started_at DESC;
```

**使用示例**:
```sql
-- 查看最近10次部署
SELECT * FROM v_deployment_summary LIMIT 10;

-- 查看失败的部署
SELECT * FROM v_deployment_summary WHERE status = 'failed';

-- 查看特定租户的部署历史
SELECT * FROM v_deployment_summary WHERE tenant_id = 'tenant_001';
```

### 2. v_tenant_health - 租户健康状态视图

提供租户整体健康状态。

```sql
CREATE VIEW v_tenant_health AS
SELECT
    t.tenant_id,
    t.tenant_name,
    t.environment,
    t.server_host,
    t.feishu_app_id,
    t.is_active,
    COUNT(CASE WHEN d.status = 'success'
        AND d.started_at > NOW() - INTERVAL '7 days'
        THEN 1 END) as successful_deployments_7d,
    COUNT(CASE WHEN d.started_at > NOW() - INTERVAL '7 days'
        THEN 1 END) as total_deployments_7d,
    MAX(d.started_at) as last_deployment_at,
    MAX(hc.checked_at) FILTER (
        WHERE hc.status = 'pass'
    ) as last_healthy_check_at,
    COUNT(CASE WHEN i.status NOT IN ('resolved', 'closed')
        THEN 1 END) as open_incidents,
    COUNT(CASE WHEN i.severity = 'P0'
        AND i.status NOT IN ('resolved', 'closed')
        THEN 1 END) as critical_incidents,
    COUNT(CASE WHEN cdr.resolved = false
        AND cdr.drift_severity = 'critical'
        THEN 1 END) as unresolved_drift,
    t.created_at,
    t.updated_at
FROM tenants t
LEFT JOIN deployments d ON t.tenant_id = d.tenant_id
LEFT JOIN health_checks hc ON t.tenant_id = hc.tenant_id
LEFT JOIN incidents i ON t.tenant_id = i.tenant_id
LEFT JOIN config_drift_reports cdr ON t.tenant_id = cdr.tenant_id
GROUP BY t.tenant_id, t.tenant_name, t.environment, t.server_host,
         t.feishu_app_id, t.is_active, t.created_at, t.updated_at
ORDER BY last_deployment_at DESC;
```

**使用示例**:
```sql
-- 查看所有活跃租户的健康状态
SELECT * FROM v_tenant_health WHERE is_active = true;

-- 查看有关键事件的租户
SELECT * FROM v_tenant_health WHERE critical_incidents > 0;

-- 查看有配置漂移的租户
SELECT * FROM v_tenant_health WHERE unresolved_drift > 0;
```

### 3. v_recent_security_events - 最近安全事件视图

最近安全事件与风险等级评估。

```sql
CREATE VIEW v_recent_security_events AS
SELECT
    sal.audit_id,
    sal.tenant_id,
    t.tenant_name,
    sal.event_type,
    sal.actor,
    sal.action,
    sal.resource_type,
    sal.resource_id,
    sal.ip_address,
    sal.event_timestamp,
    CASE
        WHEN sal.event_type IN ('ssh_access', 'deployment', 'config_change')
            AND sal.ip_address IS NULL THEN 'high'
        WHEN sal.event_type = 'ssh_access'
            AND sal.action = 'denied' THEN 'high'
        WHEN sal.event_type IN ('ssh_access', 'deployment') THEN 'medium'
        ELSE 'low'
    END as risk_level
FROM security_audit_log sal
LEFT JOIN tenants t ON sal.tenant_id = t.tenant_id
WHERE sal.event_timestamp > NOW() - INTERVAL '7 days'
ORDER BY sal.event_timestamp DESC;
```

**使用示例**:
```sql
-- 查看高风险事件
SELECT * FROM v_recent_security_events WHERE risk_level = 'high';

-- 查看SSH访问事件
SELECT * FROM v_recent_security_events WHERE event_type = 'ssh_access';

-- 查看特定租户的安全事件
SELECT * FROM v_recent_security_events WHERE tenant_id = 'tenant_001';
```

---

## 存储函数

### 1. health_check() - 数据库健康检查

检查数据库整体健康状态。

```sql
CREATE OR REPLACE FUNCTION health_check()
RETURNS TABLE (
    table_name TEXT,
    record_count BIGINT,
    table_size TEXT,
    index_count INTEGER,
    last_activity TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.table_name,
        COALESCE((SELECT COUNT(*) FROM (
            SELECT 1 FROM pg_catalog.pg_stat_user_tables
            WHERE schemaname = 'public' AND relname = t.table_name
        ) x), 0) as record_count,
        pg_size_pretty(pg_total_relation_size('public.' || t.table_name)) as table_size,
        COALESCE((SELECT COUNT(*) FROM pg_indexes
            WHERE tablename = t.table_name AND schemaname = 'public'), 0) as index_count,
        COALESCE((SELECT MAX(last_updated) FROM (
            SELECT MAX(started_at) as last_updated FROM deployments
            UNION ALL
            SELECT MAX(checked_at) FROM health_checks
            UNION ALL
            SELECT MAX(event_timestamp) FROM security_audit_log
        ) y), CURRENT_TIMESTAMP) as last_activity
    FROM (
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
    ) t
    ORDER BY t.table_name;
END;
$$ LANGUAGE plpgsql;
```

**使用示例**:
```sql
-- 检查数据库健康状态
SELECT * FROM health_check();

-- 输出示例:
-- table_name         | record_count | table_size | index_count | last_activity
-- -------------------+--------------+------------+-------------+---------------
-- tenants            |           10 | 64 kB      |           2 | 2026-03-19 12:00
-- deployments        |          150 | 256 kB     |           5 | 2026-03-19 12:00
-- health_checks      |         3000 | 512 kB     |           4 | 2026-03-19 12:00
-- ...
```

### 2. log_ssh_key_usage() - SSH密钥使用日志

记录SSH密钥使用情况到审计表。

```sql
CREATE OR REPLACE FUNCTION log_ssh_key_usage(
    p_tenant_id VARCHAR,
    p_ssh_key_name VARCHAR,
    p_ssh_key_fingerprint VARCHAR,
    p_ssh_key_type VARCHAR,
    p_action VARCHAR,
    p_actor VARCHAR,
    p_server_host VARCHAR,
    p_access_reason TEXT DEFAULT NULL,
    p_ip_address INET DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
    v_audit_id INTEGER;
BEGIN
    INSERT INTO ssh_key_audit (
        tenant_id,
        ssh_key_name,
        ssh_key_fingerprint,
        ssh_key_type,
        action,
        actor,
        server_host,
        access_reason,
        ip_address,
        access_granted_at,
        key_status
    ) VALUES (
        p_tenant_id,
        p_ssh_key_name,
        p_ssh_key_fingerprint,
        p_ssh_key_type,
        p_action,
        p_actor,
        p_server_host,
        p_access_reason,
        p_ip_address,
        CASE
            WHEN p_action = 'created' THEN CURRENT_TIMESTAMP
            ELSE NULL
        END,
        CASE
            WHEN p_action IN ('revoked', 'expired', 'compromised') THEN 'revoked'
            ELSE 'active'
        END
    ) RETURNING audit_id INTO v_audit_id;

    RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql;
```

**使用示例**:
```sql
-- 记录SSH密钥创建
SELECT log_ssh_key_usage(
    'tenant_001',
    'prod_server_key',
    'SHA256:abc123...',
    'RSA',
    'created',
    'admin',
    '118.25.0.190',
    'Production deployment access',
    '192.168.1.100'::INET
);

-- 记录SSH密钥访问
SELECT log_ssh_key_usage(
    'tenant_001',
    'prod_server_key',
    'SHA256:abc123...',
    'RSA',
    'accessed',
    'deploy_user',
    '118.25.0.190',
    'Deployment troubleshooting',
    '192.168.1.50'::INET
);

-- 记录SSH密钥轮换
SELECT log_ssh_key_usage(
    'tenant_001',
    'prod_server_key',
    'SHA256:abc123...',
    'RSA',
    'rotated',
    'admin',
    '118.25.0.190',
    'Quarterly key rotation',
    '192.168.1.100'::INET
);
```

### 3. record_tenant() - 创建/更新租户

创建新租户或更新现有租户信息。

```sql
CREATE OR REPLACE FUNCTION record_tenant(
    p_tenant_id VARCHAR,
    p_tenant_name VARCHAR,
    p_environment VARCHAR,
    p_server_host VARCHAR,
    p_feishu_app_id VARCHAR
) RETURNS INTEGER AS $$
DECLARE
    v_tenant_exists INTEGER;
BEGIN
    -- 检查租户是否存在
    SELECT COUNT(*) INTO v_tenant_exists
    FROM tenants
    WHERE tenant_id = p_tenant_id;

    IF v_tenant_exists > 0 THEN
        -- 更新现有租户
        UPDATE tenants
        SET
            tenant_name = p_tenant_name,
            environment = p_environment,
            server_host = p_server_host,
            feishu_app_id = p_feishu_app_id,
            updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = p_tenant_id;

        RETURN 0; -- 表示更新
    ELSE
        -- 创建新租户
        INSERT INTO tenants (
            tenant_id,
            tenant_name,
            environment,
            server_host,
            feishu_app_id,
            is_active
        ) VALUES (
            p_tenant_id,
            p_tenant_name,
            p_environment,
            p_server_host,
            p_feishu_app_id,
            true
        );

        RETURN 1; -- 表示创建
    END IF;
END;
$$ LANGUAGE plpgsql;
```

**使用示例**:
```sql
-- 创建新租户
SELECT record_tenant(
    'tenant_002',
    'Customer B Production',
    'production',
    '118.25.0.191',
    'cli_bxxxxxxxxxxxxxx'
);

-- 更新租户信息
SELECT record_tenant(
    'tenant_001',
    'Customer A Production (Updated)',
    'production',
    '118.25.0.190',
    'cli_a93ce5614ce11bd6'
);

-- 检查返回值:
-- 1 = 新租户创建
-- 0 = 现有租户更新
```

### 4. get_deployment_stats() - 部署统计

获取指定时间范围内的部署统计信息。

```sql
CREATE OR REPLACE FUNCTION get_deployment_stats(
    p_days INTEGER DEFAULT 7
) RETURNS TABLE (
    tenant_id VARCHAR,
    total_deployments BIGINT,
    successful_deployments BIGINT,
    failed_deployments BIGINT,
    avg_duration_seconds NUMERIC,
    last_deployment TIMESTAMP,
    success_rate NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        d.tenant_id,
        COUNT(*) as total_deployments,
        COUNT(CASE WHEN d.status = 'success' THEN 1 END) as successful_deployments,
        COUNT(CASE WHEN d.status = 'failed' THEN 1 END) as failed_deployments,
        AVG(EXTRACT(EPOCH FROM (d.completed_at - d.started_at))) as avg_duration_seconds,
        MAX(d.started_at) as last_deployment,
        ROUND(
            COUNT(CASE WHEN d.status = 'success' THEN 1 END)::NUMERIC /
            NULLIF(COUNT(*), 0) * 100,
            2
        ) as success_rate
    FROM deployments d
    WHERE d.started_at > NOW() - INTERVAL '1 day' * p_days
    GROUP BY d.tenant_id
    ORDER BY total_deployments DESC;
END;
$$ LANGUAGE plpgsql;
```

**使用示例**:
```sql
-- 获取最近7天的部署统计
SELECT * FROM get_deployment_stats(7);

-- 输出示例:
-- tenant_id   | total_deployments | successful_deployments | failed_deployments | avg_duration_seconds | last_deployment     | success_rate
-- -------------+-------------------+------------------------+--------------------+---------------------+---------------------+-------------
-- tenant_001   |               25 |                     24 |                  1 |               45.32 | 2026-03-19 11:30    |        96.00
-- tenant_002   |               18 |                     18 |                  0 |               38.15 | 2026-03-19 10:15    |       100.00
-- tenant_003   |               12 |                     11 |                  1 |               52.40 | 2026-03-18 16:45    |        91.67
```

---

## 数据关系

### 关系图

```
租户 (1) ──┬──> 部署 (N)
           │     │
           │     ├──> 配置快照 (1)
           │     │
           │     └──> 健康检查 (N)
           │
           ├──> 配置漂移报告 (N)
           │
           ├──> 事件 (N)
           │
           ├──> SSH密钥审计 (N)
           │
           └──> 安全审计日志 (N)
```

### 关键关系说明

1. **租户 → 部署 (1:N)**
   - 一个租户可以有多个部署
   - 每个部署必须关联一个租户

2. **部署 → 配置快照 (1:1)**
   - 每个部署只有一个配置快照
   - 用于配置回滚和版本追踪

3. **部署 → 健康检查 (1:N)**
   - 一个部署可以有多个健康检查
   - 健康检查也可以独立于部署存在

4. **租户 → 安全审计日志 (1:N)**
   - 记录租户级别的所有安全事件
   - 系统级事件tenant_id可为NULL

5. **部署 → 事件 (1:N)**
   - 记录与部署相关的事件
   - 事件也可以独立存在

---

## 使用示例

### 常见查询模式

#### 1. 查询租户最近部署状态

```sql
SELECT
    tenant_id,
    tenant_name,
    last_deployment_at,
    successful_deployments_7d,
    total_deployments_7d,
    ROUND(successful_deployments_7d::NUMERIC / NULLIF(total_deployments_7d, 0) * 100, 2) as success_rate
FROM v_tenant_health
WHERE is_active = true
ORDER BY last_deployment_at DESC;
```

#### 2. 查询失败的部署详情

```sql
SELECT
    d.deployment_id,
    d.tenant_id,
    d.deployment_type,
    d.version,
    d.error_message,
    d.started_at,
    d.completed_at,
    COUNT(hc.health_check_id) as health_check_count,
    COUNT(CASE WHEN hc.status = 'fail' THEN 1 END) as failed_health_checks
FROM deployments d
LEFT JOIN health_checks hc ON d.deployment_id = hc.deployment_id
WHERE d.status = 'failed'
GROUP BY d.deployment_id, d.tenant_id, d.deployment_type, d.version,
         d.error_message, d.started_at, d.completed_at
ORDER BY d.started_at DESC
LIMIT 20;
```

#### 3. 查询未解决的关键配置漂移

```sql
SELECT
    cdr.tenant_id,
    cdr.config_file_path,
    cdr.expected_value,
    cdr.actual_value,
    cdr.drift_detected_at,
    cdr.drift_severity,
    t.server_host
FROM config_drift_reports cdr
JOIN tenants t ON cdr.tenant_id = t.tenant_id
WHERE cdr.resolved = false
  AND cdr.drift_severity = 'critical'
ORDER BY cdr.drift_detected_at DESC;
```

#### 4. 查询活跃事件

```sql
SELECT
    i.incident_id,
    i.tenant_id,
    i.incident_type,
    i.severity,
    i.title,
    i.status,
    i.detected_at,
    i.assignee,
    EXTRACT(DAY FROM NOW() - i.detected_at) as days_open
FROM incidents i
WHERE i.status NOT IN ('resolved', 'closed')
ORDER BY
    CASE i.severity
        WHEN 'P0' THEN 1
        WHEN 'P1' THEN 2
        WHEN 'P2' THEN 3
        WHEN 'P3' THEN 4
    END,
    i.detected_at DESC;
```

#### 5. 查询SSH密钥使用情况

```sql
SELECT
    ska.tenant_id,
    ska.ssh_key_name,
    ska.ssh_key_type,
    COUNT(CASE WHEN ska.action = 'accessed' THEN 1 END) as access_count,
    MAX(ska.last_used_at) as last_access,
    MAX(ska.access_granted_at) as created_at,
    ska.key_status
FROM ssh_key_audit ska
GROUP BY ska.tenant_id, ska.ssh_key_name, ska.ssh_key_type, ska.key_status
ORDER BY last_access DESC NULLS LAST;
```

### 数据插入示例

#### 记录部署流程

```sql
-- 1. 开始部署
INSERT INTO deployments (
    tenant_id, deployment_type, component, version,
    git_commit_sha, git_branch, deployed_by, status
) VALUES (
    'tenant_001',
    'update',
    'backend',
    'v1.2.3',
    'abc123def456',
    'main',
    'admin',
    'pending'
) RETURNING deployment_id INTO v_deployment_id;

-- 2. 记录配置快照
INSERT INTO deployment_config_snapshots (
    deployment_id, config_content, env_content
) VALUES (
    v_deployment_id,
    encode(pgcrypto::encrypt(config_yaml, key), 'base64'),
    encode(pgcrypto::encrypt(env_content, key), 'base64')
);

-- 3. 记录健康检查
INSERT INTO health_checks (
    deployment_id, tenant_id, check_type, status, response_time_ms
) VALUES
(v_deployment_id, 'tenant_001', 'http', 'pass', 150),
(v_deployment_id, 'tenant_001', 'database', 'pass', 50),
(v_deployment_id, 'tenant_001', 'oauth', 'pass', 200);

-- 4. 更新部署状态为成功
UPDATE deployments
SET
    status = 'success',
    completed_at = CURRENT_TIMESTAMP,
    health_check_status = 'pass'
WHERE deployment_id = v_deployment_id;
```

---

## 性能考虑

### 索引策略

#### 高频查询索引

```sql
-- 租户部署历史查询 (最频繁)
CREATE INDEX idx_deployments_tenant_date
    ON deployments(tenant_id, started_at DESC);

-- 健康检查查询
CREATE INDEX idx_health_checks_tenant_date
    ON health_checks(tenant_id, checked_at DESC);

-- 安全审计查询
CREATE INDEX idx_audit_tenant_date
    ON security_audit_log(tenant_id, event_timestamp DESC);

-- 未解决事件查询
CREATE INDEX idx_incidents_unresolved
    ON incidents(status, detected_at DESC)
    WHERE status NOT IN ('resolved', 'closed');
```

#### 部分索引 (推荐)

```sql
-- 只索引活跃租户
CREATE INDEX idx_tenants_active
    ON tenants(tenant_id)
    WHERE is_active = true;

-- 只索引失败的部署
CREATE INDEX idx_deployments_failed
    ON deployments(tenant_id, started_at DESC)
    WHERE status = 'failed';

-- 只索引未解决的漂移
CREATE INDEX idx_drift_unresolved
    ON config_drift_reports(tenant_id, drift_detected_at DESC)
    WHERE resolved = false;
```

### 查询优化

#### 使用物化视图 (Materialized Views)

对于复杂的统计查询，考虑使用物化视图：

```sql
-- 创建物化视图
CREATE MATERIALIZED VIEW mv_deployment_stats AS
SELECT
    tenant_id,
    COUNT(*) as total_deployments,
    COUNT(CASE WHEN status = 'success' THEN 1 END) as successful_deployments,
    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_deployments,
    MAX(started_at) as last_deployment
FROM deployments
GROUP BY tenant_id;

-- 创建索引
CREATE UNIQUE INDEX ON mv_deployment_stats(tenant_id);

-- 刷新物化视图
REFRESH MATERIALIZED VIEW mv_deployment_stats;
```

#### 分区表 (Partitioning)

对于大表（如health_checks, security_audit_log），考虑按时间分区：

```sql
-- 按月分区health_checks表
CREATE TABLE health_checks (
    health_check_id SERIAL,
    checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- 其他字段...
) PARTITION BY RANGE (checked_at);

-- 创建分区
CREATE TABLE health_checks_2026_01 PARTITION OF health_checks
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE health_checks_2026_02 PARTITION OF health_checks
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

-- 创建未来分区的函数
CREATE OR REPLACE FUNCTION create_monthly_partition()
RETURNS void AS $$
DECLARE
    partition_date TEXT;
    start_date TEXT;
    end_date TEXT;
BEGIN
    partition_date := to_char(CURRENT_DATE + INTERVAL '1 month', 'YYYY_MM');
    start_date := to_char(CURRENT_DATE + INTERVAL '1 month', 'YYYY-MM-01');
    end_date := to_char(CURRENT_DATE + INTERVAL '2 months', 'YYYY-MM-01');

    EXECUTE format('
        CREATE TABLE IF NOT EXISTS health_checks_%s PARTITION OF health_checks
        FOR VALUES FROM (%L) TO (%L)
    ', partition_date, start_date, end_date);
END;
$$ LANGUAGE plpgsql;
```

### 定期维护

#### Vacuum和Analyze

```sql
-- 创建定期维护函数
CREATE OR REPLACE FUNCTION perform_maintenance()
RETURNS void AS $$
BEGIN
    -- Vacuum所有表
    VACUUM ANALYZE tenants;
    VACUUM ANALYZE deployments;
    VACUUM ANALYZE health_checks;
    VACVUM ANALYZE security_audit_log;

    -- 重建索引 (如果需要)
    REINDEX TABLE CONCURRENTLY deployments;
    REINDEX TABLE CONCURRENTLY health_checks;
    REINDEX TABLE CONCURRENTLY security_audit_log;

    -- 更新统计信息
    ANALYZE tenants;
    ANALYZE deployments;
    ANALYZE health_checks;
    ANALYZE security_audit_log;
END;
$$ LANGUAGE plpgsql;

-- 每周执行一次
SELECT perform_maintenance();
```

#### 数据归档

```sql
-- 归档旧的部署记录
CREATE OR REPLACE FUNCTION archive_old_deployments(p_months INTEGER DEFAULT 12)
RETURNS INTEGER AS $$
DECLARE
    v_archived_count INTEGER;
BEGIN
    -- 创建归档表 (如果不存在)
    CREATE TABLE IF NOT EXISTS deployments_archive (
        LIKE deployments INCLUDING ALL
    );

    -- 移动旧记录到归档表
    INSERT INTO deployments_archive
    SELECT * FROM deployments
    WHERE started_at < NOW() - INTERVAL '1 month' * p_months;

    GET DIAGNOSTICS v_archived_count = ROW_COUNT;

    -- 删除已归档的记录
    DELETE FROM deployments
    WHERE started_at < NOW() - INTERVAL '1 month' * p_months;

    RETURN v_archived_count;
END;
$$ LANGUAGE plpgsql;

-- 执行归档
SELECT archive_old_deployments(12); -- 归档12个月前的记录
```

---

## 附录

### 数据库连接配置

```bash
# 环境变量 (.env.state_db)
STATE_DB_HOST=localhost
STATE_DB_PORT=5432
STATE_DB_NAME=deployment_state
STATE_DB_USER=opclaw_state
STATE_DB_PASSWORD=your_secure_password

# 连接字符串
postgresql://opclaw_state:password@localhost:5432/deployment_state
```

### 备份和恢复

```bash
# 备份
docker exec opclaw-postgres pg_dump -U opclaw deployment_state | \
    gzip > deployment_state_backup_$(date +%Y%m%d).sql.gz

# 恢复
gunzip -c deployment_state_backup_20260319.sql.gz | \
    docker exec -i opclaw-postgres psql -U opclaw -d deployment_state
```

### 监控查询

```sql
-- 表大小监控
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- 慢查询监控
SELECT
    query,
    calls,
    total_time,
    mean_time,
    max_time
FROM pg_stat_statements
WHERE querydb = 'deployment_state'
ORDER BY mean_time DESC
LIMIT 10;

-- 连接数监控
SELECT
    count(*) as connections,
    count(*) FILTER (WHERE state = 'active') as active
FROM pg_stat_activity
WHERE datname = 'deployment_state';
```

---

**文档版本**: 1.0.0
**最后更新**: 2026-03-19
**维护者**: AIOpc DevOps Team
