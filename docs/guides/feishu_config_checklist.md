# 飞书开放平台配置检查清单

> **任务**: TASK-020 飞书开放平台配置
> **日期**: 2026-03-14
> **用途**: 快速检查配置完整性

## 前置条件检查

### 网络和基础设施
- [ ] TASK-006 已完成（Nginx 反向代理）
- [ ] TASK-015 已完成（后端 API）
- [ ] 域名已解析（openclaw.service.com → 服务器 IP）
- [ ] SSL 证书已配置（HTTPS 可访问）
- [ ] 后端服务运行正常（/feishu/events 端点可访问）

### 飞书账号准备
- [ ] 飞书企业账号已开通
- [ ] 具有企业管理员权限
- [ ] 可以访问飞书开放平台

## 飞书应用创建

### 1. 应用基本信息
- [ ] 应用已创建（企业自建应用）
- [ ] 应用名称：`OpenClaw 龙虾认领平台`
- [ ] 应用描述：`AI 智能助手云服务平台 - 扫码即用`
- [ ] 应用图标已上传
- [ ] App ID 已获取：`cli_xxxxxxxxxxxxx`
- [ ] App Secret 已获取：`xxxxxxxxxxxxxxxxxxxx`

### 2. OAuth 权限配置
- [ ] `contact:user.base:readonly`（获取用户基本信息）
- [ ] `contact:user.email:readonly`（获取用户邮箱）
- [ ] `contact:user.phone:readonly`（获取用户手机号，可选）
- [ ] `im:message`（以应用身份发消息）
- [ ] `im:chat`（获取群组信息）

### 3. OAuth 重定向配置
- [ ] 重定向 URL：`https://openclaw.service.com/oauth/callback`
- [ ] URL 验证通过

### 4. 事件订阅配置
- [ ] `im.message.receive_v1`（接收消息）
- [ ] `im.chat.member.added_v1`（群成员添加）
- [ ] `im.chat.member.deleted_v1`（群成员删除）

### 5. Webhook 回调配置
- [ ] 回调 URL：`https://openclaw.service.com/feishu/events`
- [ ] Encrypt Key 已生成（43位字符串）
- [ ] Verify Token 已生成并保存

### 6. 机器人能力配置
- [ ] 机器人功能已开启
- [ ] 机器人名称：`OpenClaw 助手`
- [ ] 机器人描述已配置
- [ ] 支持群聊：已开启
- [ ] 支持私聊：根据需求配置
- [ ] 欢迎语已配置

### 7. 应用发布
- [ ] 版本号：`1.0.0`
- [ ] 版本描述已填写
- [ ] 发布范围：企业内部
- [ ] 发布说明已填写
- [ ] 提交审核
- [ ] 审核通过

## 环境变量配置

### 后端 .env 配置
```bash
# 飞书应用凭证
FEISHU_APP_ID=cli_xxxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxx

# Webhook 配置
FEISHU_ENCRYPT_KEY=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0
FEISHU_VERIFY_TOKEN=openclaw_verify_token_2026

# OAuth 配置
FEISHU_REDIRECT_URI=https://openclaw.service.com/oauth/callback
FEISHU_WEBHOOK_URL=https://openclaw.service.com/feishu/events

# API 配置
FEISHU_API_BASE_URL=https://open.feishu.cn/open-apis
```

- [ ] App ID 已配置
- [ ] App Secret 已配置
- [ ] Encrypt Key 已配置
- [ ] Verify Token 已配置
- [ ] Redirect URI 已配置
- [ ] Webhook URL 已配置

## 功能测试

### 1. OAuth 授权流程测试
```bash
# 访问授权 URL
https://open.feishu.cn/open-apis/authen/v1/authorize?app_id={APP_ID}&redirect_uri={REDIRECT_URI}&scope=contact:user.base:readonly&state=test123
```
- [ ] 二维码正常显示
- [ ] 扫码后跳转到登录页
- [ ] 授权页面正常显示
- [ ] 授权后正确重定向
- [ ] 后端收到回调请求
- [ ] 用户信息正确获取
- [ ] JWT Token 正确生成

### 2. Webhook 事件接收测试
```bash
# 发送测试请求
curl -X POST https://openclaw.service.com/feishu/events \
    -H 'Content-Type: application/json' \
    -d '{
        "type": "url_verification",
        "challenge": "test_challenge",
        "token": "your_verify_token"
    }'
```
- [ ] URL 验证通过
- [ ] 返回正确的 challenge 响应
- [ ] 后端日志记录正常

### 3. 机器人功能测试
- [ ] 机器人可添加到群聊
- [ ] 发送消息：`@OpenClaw 助手 你好`
- [ ] 后端接收到消息事件
- [ ] 机器人正确回复消息
- [ ] 机器人被移出群聊时触发事件

### 4. API 连接测试
```bash
# 测试获取租户访问令牌
curl -X POST https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal \
    -H 'Content-Type: application/json' \
    -d '{
        "app_id": "{APP_ID}",
        "app_secret": "{APP_SECRET}"
    }'
```
- [ ] API 请求成功
- [ ] 获取到 tenant_access_token
- [ ] token 有效期正常（2小时）

## 验收条件确认

根据 TASK-020 的验收条件：

- [ ] 飞书应用已创建
- [ ] App ID 和 App Secret 已获取
- [ ] 权限已配置（contact:user.base:readonly）
- [ ] 事件订阅已配置
- [ ] 回调 URL 已配置（https://openclaw.service.com/feishu/events）
- [ ] Verify Token 和 Encrypt Key 已生成
- [ ] 飞书机器人可添加到群聊
- [ ] Webhook 事件可接收

## 配置信息记录

### 应用信息
| 项目 | 值 |
|------|-----|
| 应用名称 | OpenClaw 龙虾认领平台 |
| App ID | `cli_xxxxxxxxxxxxx` |
| App Secret | `xxxxxxxxxxxxxxxxxxxx` |
| 应用类型 | 企业自建应用 |
| 发布状态 | 企业内部 |

### 安全凭证
| 项目 | 值 | 存储位置 |
|------|-----|---------|
| Encrypt Key | `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0` | .env |
| Verify Token | `openclaw_verify_token_2026` | .env |

### URL 配置
| 项目 | 值 |
|------|-----|
| OAuth 授权 URL | `https://open.feishu.cn/open-apis/authen/v1/authorize` |
| OAuth Token URL | `https://open.feishu.cn/open-apis/authen/v2/oauth/token` |
| 重定向 URL | `https://openclaw.service.com/oauth/callback` |
| Webhook URL | `https://openclaw.service.com/feishu/events` |

## 常见问题排查

### 问题 1：回调 URL 验证失败
**检查项**:
- [ ] 域名 DNS 解析正确
- [ ] SSL 证书有效
- [ ] Nginx 配置正确
- [ ] 后端服务运行正常
- [ ] 防火墙规则允许访问

### 问题 2：事件订阅不生效
**检查项**:
- [ ] Encrypt Key 配置一致
- [ ] Verify Token 配置一致
- [ ] 后端正确处理 url_verification
- [ ] 后端正确验证事件签名
- [ ] 查看后端日志

### 问题 3：机器人无法回复
**检查项**:
- [ ] 机器人权限已开启
- [ ] 租户访问令牌有效
- [ ] 消息接收者 ID 正确
- [ ] 消息格式符合规范

## 完成确认

- [ ] 所有前置条件已满足
- [ ] 飞书应用已创建和配置
- [ ] 环境变量已配置
- [ ] 功能测试全部通过
- [ ] 验收条件全部满足
- [ ] 配置信息已记录
- [ ] 文档已更新

---

**配置完成时间**: ___________
**配置人员**: ___________
**审核人员**: ___________
**备注**: ___________________________________
