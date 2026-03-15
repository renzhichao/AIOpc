# Mock Feishu OAuth Service

用于本地开发环境的飞书 OAuth Mock 服务，避免依赖真实飞书应用。

## 功能

- ✅ 模拟 OAuth 授权流程
- ✅ 模拟 Token 获取和刷新
- ✅ 模拟用户信息查询
- ✅ 模拟 Webhook 事件接收
- ✅ 模拟消息发送

## 本地运行

```bash
# 安装依赖
pnpm install

# 开发模式 (热更新)
pnpm run dev

# 构建
pnpm run build

# 生产模式
pnpm start
```

## Docker 运行

```bash
# 构建镜像
docker build -t mock-feishu .

# 运行容器
docker run -p 3001:3000 mock-feishu
```

## API 端点

| 端点 | 方法 | 描述 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/authen/v1/authorize` | GET | OAuth 授权 |
| `/authen/v1/oauth/token` | POST | 获取 Token |
| `/authen/v1/oauth/refresh` | POST | 刷新 Token |
| `/contact/v3/users/me` | GET | 获取当前用户 |
| `/contact/v3/users/:user_id` | GET | 获取指定用户 |
| `/v1/events` | GET/POST | Webhook 事件 |
| `/message/v4/send` | POST | 发送消息 |

## Mock 用户信息

默认 Mock 用户:
- user_id: `mock_user_123`
- name: `开发测试用户`
- email: `dev@example.com`

可通过环境变量自定义:
```bash
MOCK_USER_ID=custom_user_123 \
MOCK_USER_NAME=自定义用户 \
MOCK_USER_EMAIL=user@example.com \
pnpm run dev
```

## OAuth 流程示例

1. 前端访问授权 URL:
   ```
   http://localhost:3001/authen/v1/authorize?redirect_uri=http://localhost:5173/oauth/callback&state=xyz
   ```

2. Mock 服务重定向到回调地址并携带授权码:
   ```
   http://localhost:5173/oauth/callback?code=mock_auth_code_123&state=xyz
   ```

3. 后端使用授权码换取 Token:
   ```bash
   POST http://localhost:3001/authen/v1/oauth/token
   {
     "grant_type": "authorization_code",
     "code": "mock_auth_code_123",
     "client_id": "mock_app_id",
     "client_secret": "mock_app_secret"
   }
   ```

4. 使用 Token 获取用户信息:
   ```bash
   GET http://localhost:3001/contact/v3/users/me
   Authorization: Bearer mock_access_token_123
   ```

## 注意事项

- 此服务仅用于本地开发和测试
- 生产环境必须使用真实飞书 OAuth 服务
- Token 不会真实过期（除非手动实现过期逻辑）
- 所有数据存储在内存中，重启后清空
