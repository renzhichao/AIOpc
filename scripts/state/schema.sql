--==============================================================================
-- Deployment State Database Schema
-- (部署状态数据库架构)
--
-- This schema tracks all deployment state, version history, and audit trails
-- for multi-tenant deployments.
--
-- Database: deployment_state
-- Version: 1.0
-- Created: 2026-03-19
--==============================================================================

-- Set timezone to UTC for consistency
SET timezone = 'UTC';

--==============================================================================
-- Tenants Table
-- (租户基本信息表)
--==============================================================================

CREATE TABLE IF NOT EXISTS tenants (
    tenant_id VARCHAR(255) PRIMARY KEY,
    tenant_name VARCHAR(500) NOT NULL,
    environment VARCHAR(50) NOT NULL,
    server_host VARCHAR(255) NOT NULL,
    feishu_app_id VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    CONSTRAINT env_check CHECK (environment IN ('production', 'staging', 'development'))
);

COMMENT ON TABLE tenants IS '租户基本信息表';
COMMENT ON COLUMN tenants.tenant_id IS '租户唯一标识';
COMMENT ON COLUMN tenants.tenant_name IS '租户名称';
COMMENT ON COLUMN tenants.environment IS '环境类型 (production/staging/development)';
COMMENT ON COLUMN tenants.server_host IS '服务器主机地址';
COMMENT ON COLUMN tenants.feishu_app_id IS '飞书应用ID';
COMMENT ON COLUMN tenants.is_active IS '是否激活';

-- Create index for active tenant queries
CREATE INDEX idx_tenants_active ON tenants(is_active) WHERE is_active = true;
CREATE INDEX idx_tenants_environment ON tenants(environment);

--==============================================================================
-- Deployments Table
-- (部署记录表)
--==============================================================================

CREATE TABLE IF NOT EXISTS deployments (
    deployment_id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
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
    CONSTRAINT deployment_type_check CHECK (deployment_type IN ('initial', 'update', 'rollback', 'scale')),
    CONSTRAINT component_check CHECK (component IN ('all', 'backend', 'frontend', 'database')),
    CONSTRAINT status_check CHECK (status IN ('pending', 'in_progress', 'success', 'failed', 'rolled_back'))
);

COMMENT ON TABLE deployments IS '部署记录表';
COMMENT ON COLUMN deployments.deployment_id IS '部署记录ID';
COMMENT ON COLUMN deployments.tenant_id IS '租户ID';
COMMENT ON COLUMN deployments.deployment_type IS '部署类型 (initial/update/rollback/scale)';
COMMENT ON COLUMN deployments.component IS '部署组件 (all/backend/frontend/database)';
COMMENT ON COLUMN deployments.version IS '版本号';
COMMENT ON COLUMN deployments.git_commit_sha IS 'Git提交SHA';
COMMENT ON COLUMN deployments.git_branch IS 'Git分支';
COMMENT ON COLUMN deployments.deployed_by IS '部署操作人';
COMMENT ON COLUMN deployments.status IS '部署状态 (pending/in_progress/success/failed/rolled_back)';
COMMENT ON COLUMN deployments.started_at IS '开始时间';
COMMENT ON COLUMN deployments.completed_at IS '完成时间';
COMMENT ON COLUMN deployments.health_check_status IS '健康检查状态';
COMMENT ON COLUMN deployments.rollback_deployment_id IS '回滚部署ID';
COMMENT ON COLUMN deployments.error_message IS '错误信息';
COMMENT ON COLUMN deployments.deployment_metadata IS '部署元数据 (JSONB)';

-- Create indexes for common queries
CREATE INDEX idx_deployments_tenant ON deployments(tenant_id, started_at DESC);
CREATE INDEX idx_deployments_status ON deployments(status);
CREATE INDEX idx_deployments_deployed_by ON deployments(deployed_by);
CREATE INDEX idx_deployments_version ON deployments(version);
CREATE INDEX idx_deployments_type ON deployments(deployment_type);

--==============================================================================
-- Deployment Configuration Snapshots Table
-- (部署配置快照表)
--==============================================================================

CREATE TABLE IF NOT EXISTS deployment_config_snapshots (
    snapshot_id SERIAL PRIMARY KEY,
    deployment_id INTEGER NOT NULL UNIQUE REFERENCES deployments(deployment_id) ON DELETE CASCADE,
    config_content TEXT NOT NULL,
    env_content TEXT,
    docker_compose_content TEXT,
    nginx_config_content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE deployment_config_snapshots IS '部署配置快照表';
COMMENT ON COLUMN deployment_config_snapshots.snapshot_id IS '快照ID';
COMMENT ON COLUMN deployment_config_snapshots.deployment_id IS '部署ID';
COMMENT ON COLUMN deployment_config_snapshots.config_content IS 'YAML配置内容 (Base64编码)';
COMMENT ON COLUMN deployment_config_snapshots.env_content IS '环境变量内容 (Base64编码)';
COMMENT ON COLUMN deployment_config_snapshots.docker_compose_content IS 'Docker Compose配置 (Base64编码)';
COMMENT ON COLUMN deployment_config_snapshots.nginx_config_content IS 'Nginx配置 (Base64编码)';

-- Create index for deployment lookups
CREATE INDEX idx_config_snapshots_deployment ON deployment_config_snapshots(deployment_id);

--==============================================================================
-- Health Checks Table
-- (健康检查记录表)
--==============================================================================

CREATE TABLE IF NOT EXISTS health_checks (
    health_check_id SERIAL PRIMARY KEY,
    deployment_id INTEGER REFERENCES deployments(deployment_id) ON DELETE SET NULL,
    tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    check_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL,
    response_time_ms INTEGER,
    error_message TEXT,
    checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    check_details JSONB,
    CONSTRAINT check_type_check CHECK (check_type IN ('http', 'database', 'oauth', 'redis', 'ssh', 'docker')),
    CONSTRAINT status_check CHECK (status IN ('pass', 'fail', 'warning', 'skip'))
);

COMMENT ON TABLE health_checks IS '健康检查记录表';
COMMENT ON COLUMN health_checks.health_check_id IS '健康检查ID';
COMMENT ON COLUMN health_checks.deployment_id IS '部署ID';
COMMENT ON COLUMN health_checks.tenant_id IS '租户ID';
COMMENT ON COLUMN health_checks.check_type IS '检查类型 (http/database/oauth/redis/ssh/docker)';
COMMENT ON COLUMN health_checks.status IS '检查状态 (pass/fail/warning/skip)';
COMMENT ON COLUMN health_checks.response_time_ms IS '响应时间(毫秒)';
COMMENT ON COLUMN health_checks.error_message IS '错误信息';
COMMENT ON COLUMN health_checks.checked_at IS '检查时间';
COMMENT ON COLUMN health_checks.check_details IS '检查详情 (JSONB)';

-- Create indexes for health check queries
CREATE INDEX idx_health_checks_deployment ON health_checks(deployment_id);
CREATE INDEX idx_health_checks_tenant ON health_checks(tenant_id, checked_at DESC);
CREATE INDEX idx_health_checks_status ON health_checks(status, checked_at DESC);
CREATE INDEX idx_health_checks_type ON health_checks(check_type);

--==============================================================================
-- Security Audit Log Table
-- (安全审计日志表)
--==============================================================================

CREATE TABLE IF NOT EXISTS security_audit_log (
    audit_id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) REFERENCES tenants(tenant_id) ON DELETE SET NULL,
    event_type VARCHAR(100) NOT NULL,
    actor VARCHAR(255) NOT NULL,
    action VARCHAR(255) NOT NULL,
    resource_type VARCHAR(100),
    resource_id VARCHAR(255),
    old_value JSONB,
    new_value JSONB,
    ip_address INET,
    user_agent TEXT,
    event_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT event_type_check CHECK (event_type IN (
        'ssh_access', 'config_change', 'deployment', 'key_rotation',
        'permission_change', 'data_access', 'security_event'
    ))
);

COMMENT ON TABLE security_audit_log IS '安全审计日志表';
COMMENT ON COLUMN security_audit_log.audit_id IS '审计ID';
COMMENT ON COLUMN security_audit_log.tenant_id IS '租户ID';
COMMENT ON COLUMN security_audit_log.event_type IS '事件类型';
COMMENT ON COLUMN security_audit_log.actor IS '操作人';
COMMENT ON COLUMN security_audit_log.action IS '操作动作';
COMMENT ON COLUMN security_audit_log.resource_type IS '资源类型';
COMMENT ON COLUMN security_audit_log.resource_id IS '资源ID';
COMMENT ON COLUMN security_audit_log.old_value IS '旧值 (JSONB)';
COMMENT ON COLUMN security_audit_log.new_value IS '新值 (JSONB)';
COMMENT ON COLUMN security_audit_log.ip_address IS 'IP地址';
COMMENT ON COLUMN security_audit_log.user_agent IS '用户代理';
COMMENT ON COLUMN security_audit_log.event_timestamp IS '事件时间戳';

-- Create indexes for audit log queries
CREATE INDEX idx_audit_tenant ON security_audit_log(tenant_id, event_timestamp DESC);
CREATE INDEX idx_audit_actor ON security_audit_log(actor, event_timestamp DESC);
CREATE INDEX idx_audit_event_type ON security_audit_log(event_type, event_timestamp DESC);
CREATE INDEX idx_audit_timestamp ON security_audit_log(event_timestamp DESC);

--==============================================================================
-- Configuration Drift Reports Table
-- (配置漂移报告表)
--==============================================================================

CREATE TABLE IF NOT EXISTS config_drift_reports (
    drift_report_id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    drift_detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    config_file_path VARCHAR(500),
    expected_value TEXT,
    actual_value TEXT,
    drift_severity VARCHAR(50),
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP,
    resolution_notes TEXT,
    CONSTRAINT drift_severity_check CHECK (drift_severity IN ('critical', 'major', 'minor'))
);

COMMENT ON TABLE config_drift_reports IS '配置漂移报告表';
COMMENT ON COLUMN config_drift_reports.drift_report_id IS '漂移报告ID';
COMMENT ON COLUMN config_drift_reports.tenant_id IS '租户ID';
COMMENT ON COLUMN config_drift_reports.drift_detected_at IS '检测到漂移的时间';
COMMENT ON COLUMN config_drift_reports.config_file_path IS '配置文件路径';
COMMENT ON COLUMN config_drift_reports.expected_value IS '期望值';
COMMENT ON COLUMN config_drift_reports.actual_value IS '实际值';
COMMENT ON COLUMN config_drift_reports.drift_severity IS '漂移严重程度 (critical/major/minor)';
COMMENT ON COLUMN config_drift_reports.resolved IS '是否已解决';
COMMENT ON COLUMN config_drift_reports.resolved_at IS '解决时间';
COMMENT ON COLUMN config_drift_reports.resolution_notes IS '解决备注';

-- Create indexes for drift report queries
CREATE INDEX idx_drift_tenant ON config_drift_reports(tenant_id, drift_detected_at DESC);
CREATE INDEX idx_drift_unresolved ON config_drift_reports(resolved, drift_severity);
CREATE INDEX idx_drift_severity ON config_drift_reports(drift_severity, resolved);

--==============================================================================
-- Incidents Table
-- (事件记录表)
--==============================================================================

CREATE TABLE IF NOT EXISTS incidents (
    incident_id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) REFERENCES tenants(tenant_id) ON DELETE SET NULL,
    deployment_id INTEGER REFERENCES deployments(deployment_id) ON DELETE SET NULL,
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
    CONSTRAINT incident_type_check CHECK (incident_type IN (
        'deployment_failure', 'health_check_fail', 'security_breach',
        'performance_degradation', 'data_loss', 'service_unavailable'
    )),
    CONSTRAINT severity_check CHECK (severity IN ('P0', 'P1', 'P2', 'P3')),
    CONSTRAINT status_check CHECK (status IN ('open', 'investigating', 'resolved', 'closed'))
);

COMMENT ON TABLE incidents IS '事件记录表';
COMMENT ON COLUMN incidents.incident_id IS '事件ID';
COMMENT ON COLUMN incidents.tenant_id IS '租户ID';
COMMENT ON COLUMN incidents.deployment_id IS '部署ID';
COMMENT ON COLUMN incidents.incident_type IS '事件类型';
COMMENT ON COLUMN incidents.severity IS '严重程度 (P0/P1/P2/P3)';
COMMENT ON COLUMN incidents.title IS '事件标题';
COMMENT ON COLUMN incidents.description IS '事件描述';
COMMENT ON COLUMN incidents.impact IS '影响范围';
COMMENT ON COLUMN incidents.mitigation_steps IS '缓解措施';
COMMENT ON COLUMN incidents.root_cause IS '根本原因';
COMMENT ON COLUMN incidents.detected_at IS '检测时间';
COMMENT ON COLUMN incidents.resolved_at IS '解决时间';
COMMENT ON COLUMN incidents.resolution_notes IS '解决备注';
COMMENT ON COLUMN incidents.assignee IS '负责人';
COMMENT ON COLUMN incidents.status IS '状态 (open/investigating/resolved/closed)';
COMMENT ON COLUMN incidents.incident_metadata IS '事件元数据 (JSONB)';

-- Create indexes for incident queries
CREATE INDEX idx_incidents_tenant ON incidents(tenant_id, detected_at DESC);
CREATE INDEX idx_incidents_severity ON incidents(severity, status);
CREATE INDEX idx_incidents_status ON incidents(status, detected_at DESC);
CREATE INDEX idx_incidents_type ON incidents(incident_type);

--==============================================================================
-- SSH Key Audit Table
-- (SSH密钥审计表)
--==============================================================================

CREATE TABLE IF NOT EXISTS ssh_key_audit (
    audit_id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    ssh_key_name VARCHAR(255) NOT NULL,
    ssh_key_fingerprint VARCHAR(255) NOT NULL,
    ssh_key_type VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL,
    actor VARCHAR(255) NOT NULL,
    server_host VARCHAR(255),
    access_granted_at TIMESTAMP,
    access_revoked_at TIMESTAMP,
    last_used_at TIMESTAMP,
    key_status VARCHAR(50) DEFAULT 'active',
    access_reason TEXT,
    ip_address INET,
    audit_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT action_check CHECK (action IN ('created', 'accessed', 'revoked', 'rotated', 'expired')),
    CONSTRAINT key_status_check CHECK (key_status IN ('active', 'revoked', 'expired', 'compromised'))
);

COMMENT ON TABLE ssh_key_audit IS 'SSH密钥审计表';
COMMENT ON COLUMN ssh_key_audit.audit_id IS '审计ID';
COMMENT ON COLUMN ssh_key_audit.tenant_id IS '租户ID';
COMMENT ON COLUMN ssh_key_audit.ssh_key_name IS 'SSH密钥名称';
COMMENT ON COLUMN ssh_key_audit.ssh_key_fingerprint IS 'SSH密钥指纹';
COMMENT ON COLUMN ssh_key_audit.ssh_key_type IS 'SSH密钥类型 (RSA/ED25519/ECDSA)';
COMMENT ON COLUMN ssh_key_audit.action IS '操作类型 (created/accessed/revoked/rotated/expired)';
COMMENT ON COLUMN ssh_key_audit.actor IS '操作人';
COMMENT ON COLUMN ssh_key_audit.server_host IS '服务器主机';
COMMENT ON COLUMN ssh_key_audit.access_granted_at IS '授权时间';
COMMENT ON COLUMN ssh_key_audit.access_revoked_at IS '撤销时间';
COMMENT ON COLUMN ssh_key_audit.last_used_at IS '最后使用时间';
COMMENT ON COLUMN ssh_key_audit.key_status IS '密钥状态 (active/revoked/expired/compromised)';
COMMENT ON COLUMN ssh_key_audit.access_reason IS '访问原因';
COMMENT ON COLUMN ssh_key_audit.ip_address IS 'IP地址';
COMMENT ON COLUMN ssh_key_audit.audit_timestamp IS '审计时间戳';

-- Create indexes for SSH key audit queries
CREATE INDEX idx_ssh_tenant ON ssh_key_audit(tenant_id, audit_timestamp DESC);
CREATE INDEX idx_ssh_fingerprint ON ssh_key_audit(ssh_key_fingerprint);
CREATE INDEX idx_ssh_status ON ssh_key_audit(key_status);
CREATE INDEX idx_ssh_action ON ssh_key_audit(action, audit_timestamp DESC);

--==============================================================================
-- Views for Common Queries
-- (常用查询视图)
--==============================================================================

-- Deployment Summary View
CREATE OR REPLACE VIEW v_deployment_summary AS
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
    (SELECT COUNT(*) FROM health_checks hc WHERE hc.deployment_id = d.deployment_id AND hc.status = 'pass') as health_checks_passed,
    (SELECT COUNT(*) FROM health_checks hc WHERE hc.deployment_id = d.deployment_id AND hc.status = 'fail') as health_checks_failed,
    (SELECT COUNT(*) FROM health_checks hc WHERE hc.deployment_id = d.deployment_id AND hc.status = 'warning') as health_checks_warning,
    d.git_commit_sha,
    d.git_branch,
    d.error_message
FROM deployments d
JOIN tenants t ON d.tenant_id = t.tenant_id
ORDER BY d.started_at DESC;

COMMENT ON VIEW v_deployment_summary IS '部署摘要视图 - 包含部署记录和健康检查统计';

-- Tenant Health Status View
CREATE OR REPLACE VIEW v_tenant_health AS
SELECT
    t.tenant_id,
    t.tenant_name,
    t.environment,
    t.server_host,
    t.feishu_app_id,
    t.is_active,
    (SELECT COUNT(*) FROM deployments d WHERE d.tenant_id = t.tenant_id AND d.status = 'success' AND d.started_at > NOW() - INTERVAL '7 days') as successful_deployments_7d,
    (SELECT COUNT(*) FROM deployments d WHERE d.tenant_id = t.tenant_id AND d.started_at > NOW() - INTERVAL '7 days') as total_deployments_7d,
    (SELECT MAX(d.started_at) FROM deployments d WHERE d.tenant_id = t.tenant_id) as last_deployment_at,
    (SELECT MAX(hc.checked_at) FROM health_checks hc WHERE hc.tenant_id = t.tenant_id AND hc.status = 'pass') as last_healthy_check_at,
    (SELECT COUNT(*) FROM incidents i WHERE i.tenant_id = t.tenant_id AND i.status NOT IN ('resolved', 'closed')) as open_incidents,
    (SELECT COUNT(*) FROM incidents i WHERE i.tenant_id = t.tenant_id AND i.severity = 'P0' AND i.status NOT IN ('resolved', 'closed')) as critical_incidents,
    (SELECT COUNT(*) FROM config_drift_reports cdr WHERE cdr.tenant_id = t.tenant_id AND cdr.resolved = false) as unresolved_drift,
    t.created_at,
    t.updated_at
FROM tenants t;

COMMENT ON VIEW v_tenant_health IS '租户健康状态视图 - 包含部署统计、健康检查和事件信息';

-- Recent Security Events View
CREATE OR REPLACE VIEW v_recent_security_events AS
SELECT
    sa.audit_id,
    sa.tenant_id,
    t.tenant_name,
    sa.event_type,
    sa.actor,
    sa.action,
    sa.resource_type,
    sa.resource_id,
    sa.ip_address,
    sa.event_timestamp,
    CASE
        WHEN sa.event_type IN ('ssh_access', 'security_breach') THEN 'high'
        WHEN sa.event_type IN ('config_change', 'key_rotation') THEN 'medium'
        ELSE 'low'
    END as risk_level
FROM security_audit_log sa
LEFT JOIN tenants t ON sa.tenant_id = t.tenant_id
WHERE sa.event_timestamp > NOW() - INTERVAL '7 days'
ORDER BY sa.event_timestamp DESC;

COMMENT ON VIEW v_recent_security_events IS '最近安全事件视图 - 包含过去7天的安全审计日志';

--==============================================================================
-- Database Functions
-- (数据库函数)
--==============================================================================

-- Health Check Function
CREATE OR REPLACE FUNCTION health_check()
RETURNS TABLE(
    check_name TEXT,
    status TEXT,
    details TEXT,
    checked_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        'database_connection' as check_name,
        'pass' as status,
        'Database connection successful' as details,
        NOW() as checked_at
    UNION ALL
    SELECT
        'table_tenants' as check_name,
        CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tenants') THEN 'pass' ELSE 'fail' END as status,
        'Tenants table exists' as details,
        NOW() as checked_at
    UNION ALL
    SELECT
        'table_deployments' as check_name,
        CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'deployments') THEN 'pass' ELSE 'fail' END as status,
        'Deployments table exists' as details,
        NOW() as checked_at
    UNION ALL
    SELECT
        'table_health_checks' as check_name,
        CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'health_checks') THEN 'pass' ELSE 'fail' END as status,
        'Health checks table exists' as details,
        NOW() as checked_at
    UNION ALL
    SELECT
        'view_deployment_summary' as check_name,
        CASE WHEN EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'v_deployment_summary') THEN 'pass' ELSE 'fail' END as status,
        'Deployment summary view exists' as details,
        NOW() as checked_at;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION health_check() IS '数据库健康检查函数 - 返回数据库组件状态';

-- SSH Key Usage Logging Function
CREATE OR REPLACE FUNCTION log_ssh_key_usage(
    p_tenant_id VARCHAR(255),
    p_ssh_key_name VARCHAR(255),
    p_ssh_key_fingerprint VARCHAR(255),
    p_ssh_key_type VARCHAR(50),
    p_action VARCHAR(100),
    p_actor VARCHAR(255),
    p_server_host VARCHAR(255),
    p_access_reason TEXT,
    p_ip_address VARCHAR(45)
)
RETURNS INTEGER AS $$
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
        last_used_at,
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
        p_ip_address::INET,
        CASE WHEN p_action = 'accessed' THEN NOW() ELSE NULL END,
        CASE WHEN p_action = 'revoked' THEN 'revoked' ELSE 'active' END
    ) RETURNING audit_id INTO v_audit_id;

    -- Also log to security audit log
    INSERT INTO security_audit_log (
        tenant_id,
        event_type,
        actor,
        action,
        resource_type,
        resource_id,
        new_value,
        ip_address
    ) VALUES (
        p_tenant_id,
        'ssh_access',
        p_actor,
        p_action,
        'ssh_key',
        p_ssh_key_name,
        jsonb_build_object(
            'key_name', p_ssh_key_name,
            'fingerprint', p_ssh_key_fingerprint,
            'key_type', p_ssh_key_type,
            'server', p_server_host
        ),
        p_ip_address::INET
    );

    RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION log_ssh_key_usage() IS 'SSH密钥使用记录函数 - 记录SSH密钥访问和操作';

-- Record Tenant Function
CREATE OR REPLACE FUNCTION record_tenant(
    p_tenant_id VARCHAR(255),
    p_tenant_name VARCHAR(500),
    p_environment VARCHAR(50),
    p_server_host VARCHAR(255),
    p_feishu_app_id VARCHAR(100)
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO tenants (
        tenant_id,
        tenant_name,
        environment,
        server_host,
        feishu_app_id,
        created_at,
        updated_at
    ) VALUES (
        p_tenant_id,
        p_tenant_name,
        p_environment,
        p_server_host,
        p_feishu_app_id,
        NOW(),
        NOW()
    ) ON CONFLICT (tenant_id) DO UPDATE SET
        tenant_name = EXCLUDED.tenant_name,
        environment = EXCLUDED.environment,
        server_host = EXCLUDED.server_host,
        feishu_app_id = EXCLUDED.feishu_app_id,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION record_tenant() IS '记录或更新租户信息';

-- Get Deployment Statistics Function
CREATE OR REPLACE FUNCTION get_deployment_stats(p_days INTEGER DEFAULT 7)
RETURNS TABLE(
    tenant_id VARCHAR(255),
    total_deployments BIGINT,
    successful_deployments BIGINT,
    failed_deployments BIGINT,
    avg_duration_seconds NUMERIC,
    last_deployment TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        d.tenant_id,
        COUNT(*) as total_deployments,
        COUNT(*) FILTER (WHERE d.status = 'success') as successful_deployments,
        COUNT(*) FILTER (WHERE d.status = 'failed') as failed_deployments,
        AVG(EXTRACT(EPOCH FROM (d.completed_at - d.started_at))) as avg_duration_seconds,
        MAX(d.started_at) as last_deployment
    FROM deployments d
    WHERE d.started_at > NOW() - (p_days || ' days')::INTERVAL
    GROUP BY d.tenant_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_deployment_stats() IS '获取部署统计信息';

--==============================================================================
-- Triggers for Automatic Timestamp Updates
-- (自动更新时间戳触发器)
--==============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for tenants table
DROP TRIGGER IF EXISTS update_tenants_updated_at ON tenants;
CREATE TRIGGER update_tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON FUNCTION update_updated_at_column() IS '更新 updated_at 时间戳的触发器函数';

--==============================================================================
-- Sample Data (Optional - for testing)
--==============================================================================

-- This section is commented out by default. Uncomment to insert sample data.

/*
-- Sample Tenant
INSERT INTO tenants (tenant_id, tenant_name, environment, server_host, feishu_app_id)
VALUES ('tenant_001', 'Example Production', 'production', '118.25.0.190', 'cli_example123');

-- Sample Deployment
INSERT INTO deployments (tenant_id, deployment_type, component, version, git_commit_sha, git_branch, deployed_by, status)
VALUES ('tenant_001', 'initial', 'all', 'v1.0.0', 'abc123', 'main', 'admin', 'success');

-- Sample Health Check
INSERT INTO health_checks (deployment_id, tenant_id, check_type, status, response_time_ms)
VALUES (1, 'tenant_001', 'http', 'pass', 150);

-- Sample Security Audit Log
INSERT INTO security_audit_log (tenant_id, event_type, actor, action, resource_type, resource_id, ip_address)
VALUES ('tenant_001', 'deployment', 'admin', 'deploy', 'server', '118.25.0.190', '192.168.1.100');
*/

--==============================================================================
-- Schema Setup Complete
--==============================================================================

-- Display setup summary
DO $$
BEGIN
    RAISE NOTICE '==============================================================================';
    RAISE NOTICE 'Deployment State Database Schema Setup Complete!';
    RAISE NOTICE '==============================================================================';
    RAISE NOTICE 'Tables Created: 8';
    RAISE NOTICE '  - tenants';
    RAISE NOTICE '  - deployments';
    RAISE NOTICE '  - deployment_config_snapshots';
    RAISE NOTICE '  - health_checks';
    RAISE NOTICE '  - security_audit_log';
    RAISE NOTICE '  - config_drift_reports';
    RAISE NOTICE '  - incidents';
    RAISE NOTICE '  - ssh_key_audit';
    RAISE NOTICE '';
    RAISE NOTICE 'Views Created: 3';
    RAISE NOTICE '  - v_deployment_summary';
    RAISE NOTICE '  - v_tenant_health';
    RAISE NOTICE '  - v_recent_security_events';
    RAISE NOTICE '';
    RAISE NOTICE 'Functions Created: 4';
    RAISE NOTICE '  - health_check()';
    RAISE NOTICE '  - log_ssh_key_usage()';
    RAISE NOTICE '  - record_tenant()';
    RAISE NOTICE '  - get_deployment_stats()';
    RAISE NOTICE '';
    RAISE NOTICE 'Triggers Created: 1';
    RAISE NOTICE '  - update_tenants_updated_at';
    RAISE NOTICE '==============================================================================';
END $$;
