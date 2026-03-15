# 飞书开放平台配置指南

本指南介绍如何创建和配置飞书应用以启用 OAuth 2.0 登录功能。

## 目录

- [创建飞书应用](#创建飞书应用)
- [配置应用权限](#配置应用权限)
- [配置回调地址](#配置回调地址)
- [获取凭证信息](#获取凭证信息)
- [更新环境变量](#更新环境变量)
- [测试配置](#测试配置)
- [常见问题](#常见问题)

---

## 创建飞书应用

### 步骤 1: 访问飞书开放平台

1. 打开浏览器，访问 [飞书开放平台](https://open.feishu.cn/)
2. 使用飞书账号登录（如果没有账号，请先注册）

### 步骤 2: 创建应用

1. 登录后，点击「创建自建应用」
2. 选择「创建企业自建应用」
3. 填写应用基本信息：
   - **应用名称**：例如「OpenClaw AI 平台」
   - **应用描述**：例如「扫码即用 AI 智能体平台」
   - **应用图标**：上传应用 Logo（可选）
4. 点击「创建」

### 步骤 3: 获取凭证

创建成功后，在应用详情页找到：

- **App ID**：格式为 `cli_xxxxxxxxxxxxx`
- **App Secret**：点击「查看」或「重置」获取

> **重要**：请妥善保存 App Secret，泄露后可能导致安全风险。

---

## 配置应用权限

### 步骤 1: 配置权限范围

在应用管理页面的「权限管理」中，申请以下权限：

| 权限名称 | 权限值 | 用途 |
|---------|--------|------|
| 获取用户基本信息 | `contact:user.base:readonly` | 获取用户姓名、头像等基本信息 |
| 获取用户邮箱 | `contact:user.email:readonly` | 获取用户邮箱地址（可选） |

### 步骤 2: 申请并发布权限

1. 勾选上述权限
2. 点击「批量申请权限」
3. 填写申请理由：「用于用户登录认证」
4. 提交申请
5. 等待审批通过（通常即时通过）

---

## 配置回调地址

### 步骤 1: 配置重定向 URL

在应用管理页面的「安全设置」→「重定向 URL」中：

1. 添加以下回调地址：
   - **开发环境**：`http://localhost:3000/oauth/callback`
   - **生产环境**：`https://your-domain.com/oauth/callback`

2. 点击「保存」

> **注意**：重定向 URL 必须以 `https://` 开头（生产环境）或 `http://localhost`（开发环境）。

---

## 获取凭证信息

### 步骤 1: 复制 App ID 和 App Secret

在「凭证与基础信息」页面：

1. 复制 **App ID**（格式：`cli_xxxxxxxxxxxxx`）
2. 复制 **App Secret**（格式：32位随机字符串）

### 步骤 2: 设置 Encrypt Key 和 Verification Token

在「事件订阅」页面：

1. 点击「添加回调地址」
2. 设置 **Encrypt Key**（随机字符串，用于验证事件签名）
3. 设置 **Verification Token**（随机字符串，用于验证请求来源）
4. 记录这两个值，需要在环境变量中配置

---

## 更新环境变量

### 步骤 1: 编辑 .env 文件

在项目根目录创建或编辑 `.env` 文件：

```bash
# 飞书开放平台配置
FEISHU_APP_ID=cli_xxxxxxxxxxxxx           # 替换为你的 App ID
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxx      # 替换为你的 App Secret
FEISHU_REDIRECT_URI=http://localhost:3000/oauth/callback  # 根据环境修改
FEISHU_OAUTH_AUTHORIZE_URL=https://open.feishu.cn/open-apis/authen/v1/authorize
FEISHU_OAUTH_TOKEN_URL=https://open.feishu.cn/open-apis/authen/v1/oidc/access_token
FEISHU_USER_INFO_URL=https://open.feishu.cn/open-apis/authen/v1/user_info
FEISHU_ENCRYPT_KEY=your_encrypt_key       # 替换为你的 Encrypt Key
FEISHU_VERIFICATION_TOKEN=your_token      # 替换为你的 Verification Token
```

### 步骤 2: 重启服务

```bash
# 开发环境
pnpm dev

# 生产环境
pnpm start
```

---

## 测试配置

### 步骤 1: 测试授权 URL

访问以下 URL 测试授权流程：

```
http://localhost:3000/oauth/authorize
```

应该返回飞书授权 URL，格式如下：

```
https://open.feishu.cn/open-apis/authen/v1/authorize?app_id=cli_xxx&redirect_uri=xxx&state=xxx
```

### 步骤 2: 测试扫码登录

1. 打开登录页面：`http://localhost:5173/login`
2. 使用飞书 App 扫描二维码
3. 确认授权
4. 应该成功登录并跳转到 Dashboard

### 步骤 3: 检查日志

查看后端日志，确认 OAuth 流程正常：

```bash
# 应该看到以下日志
[INFO] Generated Feishu authorization URL
[INFO] OAuth callback successful
```

---

## 常见问题

### 1. 授权 URL 生成失败

**问题**：调用 `/oauth/authorize` 返回错误

**解决方案**：
- 检查 `.env` 文件中 `FEISHU_APP_ID` 是否正确
- 确认环境变量已正确加载
- 检查服务器是否正常运行

### 2. 扫码后回调失败

**问题**：授权后回调地址返回错误

**解决方案**：
- 确认重定向 URL 已在飞书开放平台正确配置
- 检查回调地址是否可访问（防火墙、网络问题）
- 确认 `FEISHU_REDIRECT_URI` 与飞书平台配置一致

### 3. Token 交换失败

**问题**：`exchangeCodeForToken` 返回错误

**解决方案**：
- 检查 `FEISHU_APP_SECRET` 是否正确
- 确认授权码未过期（授权码有效期 10 分钟）
- 检查网络连接到飞书 API

### 4. 用户信息获取失败

**问题**：`getUserInfo` 返回错误

**解决方案**：
- 确认已申请 `contact:user.base:readonly` 权限
- 检查 Access Token 是否有效
- 确认用户信息接口 URL 正确

### 5. 签名验证失败

**问题**：Webhook 事件签名验证失败

**解决方案**：
- 检查 `FEISHU_ENCRYPT_KEY` 是否正确
- 确认签名算法使用 HMAC-SHA256
- 检查 timestamp 和 nonce 是否在有效期内

---

## 生产环境部署注意事项

### 1. 使用 HTTPS

生产环境必须使用 HTTPS：

```bash
FEISHU_REDIRECT_URI=https://your-domain.com/oauth/callback
```

### 2. 设置合理的 Token 过期时间

根据安全需求设置 JWT 过期时间：

```bash
JWT_EXPIRES_IN=7d         # 访问令牌 7 天
JWT_REFRESH_EXPIRES_IN=30d  # 刷新令牌 30 天
```

### 3. 启用日志监控

配置日志记录和监控：

- 记录所有 OAuth 请求和响应
- 监控异常登录行为
- 设置告警规则

### 4. 定期轮换密钥

定期更新以下密钥：

- `FEISHU_APP_SECRET`：每 90 天
- `JWT_SECRET`：每 180 天
- `FEISHU_ENCRYPT_KEY`：每 180 天

---

## 参考文档

- [飞书开放平台 OAuth 文档](https://open.feishu.cn/document/ukTMukTMukTM/uEjNwU4MjM1Uz)
- [飞书开放平台 API 文档](https://open.feishu.cn/document/ukTMukTMukTM/uUTNz4SN1MjL1UzM)
- [OAuth 2.0 规范 (RFC 6749)](https://tools.ietf.org/html/rfc6749)

---

## 联系支持

如果遇到配置问题，请联系：

- **技术支持**：support@example.com
- **GitHub Issues**：https://github.com/your-repo/issues
- **文档反馈**：docs@example.com

---

> **最后更新时间**：2026-03-15
> **文档版本**：v1.0
