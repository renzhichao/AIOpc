/**
 * Mock Feishu OAuth Service
 *
 * 用于开发环境模拟飞书 OAuth 流程，避免依赖真实飞书服务
 *
 * 功能:
 * - 模拟 OAuth 授权 URL 生成
 * - 模拟授权码换取 Token
 * - 模拟用户信息获取
 * - 模拟 Webhook 接收
 */

import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 环境变量
const MOCK_USER = {
  user_id: process.env.MOCK_USER_ID || 'mock_user_123',
  union_id: 'mock_union_id_456',
  name: process.env.MOCK_USER_NAME || '开发测试用户',
  email: process.env.MOCK_USER_EMAIL || 'dev@example.com',
  avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=mock',
  mobile: '13800138000',
};

// Mock Token 存储
const MOCK_TOKENS = new Map<string, {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  created_at: number;
}>();

/**
 * 健康检查端点
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'mock-feishu-oauth',
    timestamp: new Date().toISOString(),
    mock_user: MOCK_USER,
  });
});

/**
 * Mock OAuth 授权端点
 * 模拟飞书授权页面，自动重定向到回调地址
 */
app.get('/authen/v1/authorize', (req, res) => {
  const { redirect_uri, state, scope } = req.query;

  console.log('[Mock Feishu] OAuth authorize:', {
    redirect_uri,
    state,
    scope,
  });

  // 生成 mock 授权码
  const mockCode = `mock_auth_code_${Date.now()}`;

  // 重定向到回调地址 (通常是前端应用)
  const callbackUrl = new URL(redirect_uri as string);
  callbackUrl.searchParams.set('code', mockCode);
  callbackUrl.searchParams.set('state', state as string);

  console.log('[Mock Feishu] Redirecting to:', callbackUrl.toString());

  res.redirect(callbackUrl.toString());
});

/**
 * Mock Token 端点
 * 模拟授权码换取访问令牌
 */
app.post('/authen/v1/oauth/token', (req, res) => {
  const { grant_type, code, client_id, client_secret } = req.body;

  console.log('[Mock Feishu] Token request:', {
    grant_type,
    code,
    client_id,
    client_secret,
  });

  // 模拟延迟
  setTimeout(() => {
    const accessToken = `mock_access_token_${Date.now()}`;
    const refreshToken = `mock_refresh_token_${Date.now()}`;

    // 存储 token
    MOCK_TOKENS.set(accessToken, {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 7 * 24 * 60 * 60, // 7 天
      created_at: Date.now(),
    });

    res.json({
      code: 0,
      msg: 'success',
      data: {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: 7 * 24 * 60 * 60,
        token_type: 'Bearer',
      },
    });
  }, 100);
});

/**
 * Mock 刷新 Token 端点
 */
app.post('/authen/v1/oauth/refresh', (req, res) => {
  const { refresh_token } = req.body;

  console.log('[Mock Feishu] Token refresh:', { refresh_token });

  setTimeout(() => {
    const newAccessToken = `mock_access_token_${Date.now()}`;
    const newRefreshToken = `mock_refresh_token_${Date.now()}`;

    res.json({
      code: 0,
      msg: 'success',
      data: {
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
        expires_in: 7 * 24 * 60 * 60,
        token_type: 'Bearer',
      },
    });
  }, 100);
});

/**
 * Mock 用户信息端点
 * 模拟获取当前登录用户信息
 */
app.get('/contact/v3/users/me', (req, res) => {
  const authorization = req.headers.authorization;

  console.log('[Mock Feishu] User info request:', {
    authorization: authorization ? 'Bearer ***' : 'none',
  });

  // 模拟延迟
  setTimeout(() => {
    res.json({
      code: 0,
      msg: 'success',
      data: {
        user: MOCK_USER,
      },
    });
  }, 100);
});

/**
 * Mock 用户信息端点 (按 user_id 查询)
 */
app.get('/contact/v3/users/:user_id', (req, res) => {
  const { user_id } = req.params;
  const authorization = req.headers.authorization;

  console.log('[Mock Feishu] User info by ID:', {
    user_id,
    authorization: authorization ? 'Bearer ***' : 'none',
  });

  setTimeout(() => {
    res.json({
      code: 0,
      msg: 'success',
      data: {
        user: {
          ...MOCK_USER,
          user_id,
        },
      },
    });
  }, 100);
});

/**
 * Mock Webhook 接收端点
 * 模拟接收飞书事件推送
 */
app.post('/v1/events', (req, res) => {
  console.log('[Mock Feishu] Webhook received:', {
    headers: req.headers,
    body: req.body,
  });

  // 立即返回成功
  res.json({
    code: 0,
    msg: 'success',
  });

  // 模拟异步处理
  setTimeout(() => {
    console.log('[Mock Feishu] Webhook processed');
  }, 500);
});

/**
 * Mock 验证 URL 端点
 * 用于验证 Webhook 配置
 */
app.get('/v1/events', (req, res) => {
  const { challenge, token } = req.query;

  console.log('[Mock Feishu] Webhook verification:', {
    challenge,
    token,
  });

  res.json({
    code: 0,
    msg: 'success',
    challenge,
  });
});

/**
 * Mock 消息发送端点
 * 模拟发送消息到飞书
 */
app.post('/message/v4/send', (req, res) => {
  const { receive_id, msg_type, content } = req.body;

  console.log('[Mock Feishu] Message send:', {
    receive_id,
    msg_type,
    content,
  });

  setTimeout(() => {
    res.json({
      code: 0,
      msg: 'success',
      data: {
        message_id: `mock_msg_id_${Date.now()}`,
      },
    });
  }, 200);
});

/**
 * 错误处理
 */
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Mock Feishu] Error:', err);
  res.status(500).json({
    code: -1,
    msg: err.message,
  });
});

/**
 * 404 处理
 */
app.use((req, res) => {
  console.warn('[Mock Feishu] Unknown endpoint:', req.method, req.path);
  res.status(404).json({
    code: -1,
    msg: 'endpoint not found',
    path: req.path,
  });
});

/**
 * 启动服务器
 */
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║   🎭 Mock Feishu OAuth Service                                 ║
║                                                                ║
║   🚀 Server running on port ${PORT.toString().padEnd(47)}║
║   👤 Mock User: ${MOCK_USER.name.padEnd(47)}║
║   📧 Email: ${MOCK_USER.email.padEnd(50)}║
║                                                                ║
║   📚 Available endpoints:                                      ║
║   - GET  /health                                              ║
║   - GET  /authen/v1/authorize                                  ║
║   - POST /authen/v1/oauth/token                                ║
║   - GET  /contact/v3/users/me                                  ║
║   - GET  /contact/v3/users/:user_id                            ║
║   - POST /v1/events                                           ║
║   - POST /message/v4/send                                      ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
  `);

  console.log('[Mock Feishu] Configuration:', {
    PORT,
    MOCK_USER_ID: MOCK_USER.user_id,
    MOCK_USER_NAME: MOCK_USER.name,
    MOCK_USER_EMAIL: MOCK_USER.email,
  });

  console.log('[Mock Feishu] Ready to accept requests');
});

/**
 * 优雅关闭
 */
process.on('SIGTERM', () => {
  console.log('[Mock Feishu] SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Mock Feishu] SIGINT received, shutting down gracefully');
  process.exit(0);
});
