# 飞书 OAuth 配置指南

## 概述

本文档详细说明如何配置飞书开放平台应用，以便 AIOpc 平台可以使用飞书 OAuth 2.0 进行用户认证。

## 前置要求

- 飞书开放平台账号
- 管理员权限
- 可以访问外网的服务器

## 配置步骤

### 1. 创建飞书应用

1. 访问 [飞书开放平台](https://open.feishu.cn/)
2. 使用飞书账号登录
3. 进入"开放平台" → "应用管理"
4. 点击"创建自建应用"

### 2. 配置应用基本信息

#### 应用信息
- **应用名称**: AIOpc Platform（或您选择的名称）
- **应用描述**: 扫码即用 OpenClaw 云服务
- **应用图标**: 上传应用图标（可选）

#### 凭证信息
创建后，系统会自动生成：
- **App ID**: 格式如 `cli_xxxxxxxxxxxxx`
- **App Secret**: 点击"查看"或"重置"获取

> ⚠️ **重要**: 请妥善保管 App Secret，不要泄露给他人

### 3. 配置 OAuth 权限

进入"权限管理" → "权限配置"，申请以下权限：

| 权限名称 | 权限值 | 用途 | 必需性 |
|---------|--------|------|--------|
| 获取用户基本信息 | `contact:user.base:readonly` | 获取用户姓名、头像 | 必需 |
| 获取用户邮箱 | `contact:user.email:readonly` | 获取用户邮箱地址 | 必需 |
| 获取用户手机号 | `contact:user.phone:readonly` | 获取用户手机号 | 可选 |

### 4. 配置回调地址

进入"安全设置" → "重定向 URL"，添加以下回调地址：

#### 开发环境
```
http://localhost:3000/oauth/callback
http://localhost:5173/oauth/callback
```

#### 生产环境
```
https://your-domain.com/oauth/callback
```

> ⚠️ **注意**: 回调地址必须使用 HTTPS（生产环境）

### 5. 事件配置（可选）

如果需要接收飞书事件通知：

1. 进入"事件订阅"
2. 配置请求 URL：`https://your-domain.com/feishu/events`
3. 订阅所需事件（如应用上线、下线等）

### 6. 加密配置

#### 验证 Token
1. 进入"开发配置" → "事件订阅"
2. 设置"验证 Token"，用于验证事件请求
3. 生成方式: `openssl rand -hex 16`

#### 加密 Key
1. 进入"开发配置" → "加密配置"
2. 设置"Encrypt Key"，用于加密回调数据
3. 生成方式: `openssl rand -base64 32`

### 7. 发布应用

1. 完成上述配置后，进入"版本管理与发布"
2. 点击"创建版本"
3. 选择要发布的企业/组织
4. 提交审核

> ⚠️ **注意**: 应用需要通过审核才能在生产环境使用

## 配置 AIOpc 平台

### 1. 更新环境变量

编辑 `.env.production` 文件，填写飞书配置：

```bash
# 飞书配置
FEISHU_APP_ID=cli_xxxxxxxxxxxxx          # 从飞书开放平台获取
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxx   # 从飞书开放平台获取
FEISHU_REDIRECT_URI=https://your-domain.com/oauth/callback  # 您的域名

# 验证和加密密钥
FEISHU_ENCRYPT_KEY=your_encrypt_key_here       # 使用 openssl rand -base64 32 生成
FEISHU_VERIFICATION_TOKEN=your_verify_token   # 使用 openssl rand -hex 16 生成
```

### 2. 测试 OAuth 流程

启动应用后，访问登录页面，应该能看到：
1. 二维码显示（包含飞书 OAuth 链接）
2. 扫码后跳转到飞书授权页面
3. 授权后正确回调到应用
4. 用户信息正确获取

## 故障排查

### 问题 1: 回调地址不匹配

**症状**: OAuth 回调时报错 "redirect_uri_mismatch"

**解决方案**:
1. 检查飞书开放平台中配置的回调地址
2. 确保 FEISHU_REDIRECT_URI 与平台配置完全一致
3. 注意 HTTPS 和 HTTP 的区别

### 问题 2: App Secret 无效

**症状**: 获取 access_token 时报错 "invalid_app_secret"

**解决方案**:
1. 检查 App Secret 是否正确复制（无多余空格）
2. 确认使用的是正确环境的 App Secret
3. 尝试重置 App Secret

### 问题 3: 权限不足

**症状**: 获取用户信息时报错 "insufficient_scope"

**解决方案**:
1. 检查是否申请了所需权限
2. 确认权限已审核通过
3. 重新授权用户（需要用户重新扫码）

### 问题 4: 验证失败

**症状**: 事件验证或数据解密失败

**解决方案**:
1. 检查 ENCRYPT_KEY 和 VERIFICATION_TOKEN 是否正确
2. 确保密钥长度和格式正确
3. 重新生成密钥并更新配置

## 安全建议

1. **保护密钥**:
   - 不要将 App Secret 提交到代码仓库
   - 使用环境变量或密钥管理服务
   - 定期轮换密钥

2. **使用 HTTPS**:
   - 生产环境必须使用 HTTPS
   - 配置有效的 SSL 证书

3. **限制权限**:
   - 只申请必要的权限
   - 定期审查权限使用情况

4. **监控日志**:
   - 记录 OAuth 调用日志
   - 监控异常认证行为

## 参考链接

- [飞书开放平台文档](https://open.feishu.cn/document)
- [OAuth 2.0 授权文档](https://open.feishu.cn/document/common-capabilities/sso/api-overview)
- [用户信息获取文档](https://open.feishu.cn/document/server-docs/authentication-management/access-token/obtain-user-token-info)

---

**文档版本**: v1.0
**更新日期**: 2026-03-15
**维护者**: AIOpc Team
