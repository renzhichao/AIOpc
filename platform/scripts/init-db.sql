-- AIOpc Platform - 数据库初始化脚本
-- 此脚本在 PostgreSQL 容器首次启动时自动执行

-- 启用必要的扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- 创建数据库用户（如果不存在）
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'opclaw') THEN
        CREATE ROLE opclaw WITH LOGIN PASSWORD 'opclaw';
    END IF;
END
$$;

-- 授权
GRANT ALL PRIVILEGES ON DATABASE opclaw TO opclaw;
GRANT ALL PRIVILEGES ON SCHEMA public TO opclaw;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO opclaw;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO opclaw;

-- 设置默认权限
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO opclaw;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO opclaw;

-- 创建性能优化函数
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 创建通知函数（用于事件通知）
CREATE OR REPLACE FUNCTION notify_event()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify(
    'opclaw_events',
    json_build_object(
      'table', TG_TABLE_NAME,
      'operation', TG_OP,
      'data', row_to_json(NEW)
    )::text
  );
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 输出初始化完成信息
DO $$
BEGIN
    RAISE NOTICE 'AIOpc Platform 数据库初始化完成';
END;
$$;
