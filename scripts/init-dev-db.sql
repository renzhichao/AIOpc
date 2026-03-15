-- AIOpc 开发环境数据库初始化脚本
-- 自动在 PostgreSQL 容器启动时执行

-- 设置编码
\echo 'Initializing AIOpc development database...'

-- 创建扩展 (如果需要)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 创建测试用户 (用于手动测试)
-- 注意: 生产环境不要使用明文密码
INSERT INTO users (feishu_user_id, name, email, avatar_url, created_at, updated_at)
VALUES (
    'test_user_001',
    '测试用户',
    'test@example.com',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=test',
    NOW(),
    NOW()
) ON CONFLICT (feishu_user_id) DO NOTHING;

-- 创建测试 API Key
INSERT INTO api_keys (key_value, description, is_active, created_by, created_at, updated_at)
VALUES (
    'sk_test_' || encode(gen_random_bytes(32), 'hex'),
    '开发测试 API Key',
    true,
    (SELECT id FROM users WHERE feishu_user_id = 'test_user_001'),
    NOW(),
    NOW()
) ON CONFLICT DO NOTHING;

\echo 'Development database initialized successfully!'
\echo 'Test user: test_user_001 / test@example.com'
\echo 'You can now run: pnpm run db:migrate'
