# 飞书开放平台配置指南

> **任务编号**: TASK-020
> **文档版本**: v1.0
> **创建日期**: 2026-03-14

## 概述

本文档提供飞书开放平台应用的完整配置步骤，用于实现"扫码即用"OpenClaw 云服务平台的 OAuth 认证和机器人功能。

## 前置条件

在开始配置之前，请确保以下条件已满足：

- [ ] TASK-006 完成（Nginx 反向代理已配置）
- [ ] TASK-015 完成（后端 API 已实现）
- [ ] 域名已解析到服务器 IP（如：openclaw.service.com）
- [ ] SSL 证书已配置（HTTPS 访问正常）
- [ ] 后端服务 /feishu/events 端点可访问
- [ ] 飞书开放平台账号已开通（企业账号）

## 配置步骤

### 第一步：创建飞书应用

1. **登录飞书开放平台**
   - 访问：https://open.feishu.cn/app
   - 使用企业管理员账号登录

2. **创建企业自建应用**
   - 点击"创建企业自建应用"
   - 应用名称：`OpenClaw 龙虾认领平台`
   - 应用描述：`AI 智能助手云服务平台 - 扫码即用`
   - 应用图标：上传应用 Logo（建议使用龙虾图标）
   - 点击"创建"

3. **获取应用凭证**
   - 进入应用详情页
   - 在"凭证与基础信息"页面，获取：
     - `App ID`：复制并保存
     - `App Secret`：复制并保存（注意保密）

### 第二步：配置 OAuth 权限

1. **进入权限管理**
   - 在应用详情页，点击"权限管理"
   - 点击"权限配置"

2. **配置必要权限**
   搜索并开通以下权限：

   | 权限名称 | 权限 scope | 用途 |
   |---------|-----------|------|
   | 获取用户基本信息 | `contact:user.base:readonly` | 读取用户基本信息 |
   | 获取用户邮箱 | `contact:user.email:readonly` | 读取用户邮箱地址 |
   | 获取用户手机号 | `contact:user.phone:readonly` | 读取用户手机号（可选） |
   | 以应用身份发消息 | `im:message` | 发送消息到群聊 |
   | 获取群组信息 | `im:chat` | 读取群聊信息 |

3. **申请权限范围**
   - 选择"全部成员"或"指定成员"
   - 对于 MVP 阶段，建议选择"全部成员"
   - 点击"申请"

4. **配置 OAuth 重定向 URL**
   - 在"安全设置" → "重定向 URL"
   - 添加以下 URL：
     ```
     https://openclaw.service.com/oauth/callback
     ```
   - 点击"保存"

### 第三步：配置事件订阅

1. **进入事件订阅**
   - 在应用详情页，点击"事件订阅"
   - 选择"添加事件"

2. **配置订阅事件**
   添加以下事件类型：

   | 事件类型 | 事件名称 | 用途 |
   |---------|---------|------|
   | `im.message.receive_v1` | 接收消息 | 接收用户发送给机器人的消息 |
   | `im.chat.member.added_v1` | 群成员添加 | 机器人被添加到群聊时触发 |
   | `im.chat.member.deleted_v1` | 群成员删除 | 机器人被移出群聊时触发 |

3. **配置回调 URL**
   - 回调 URL：`https://openclaw.service.com/feishu/events`
   - 请求方式：POST
   - 内容类型：application/json

### 第四步：配置 Encrypt Key 和 Verify Token

1. **生成加密密钥**
   - 在"事件订阅"页面，找到"Encrypt Key"
   - 点击"生成"或手动输入（43位随机字符串）
   - 示例：`a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0`

2. **生成验证令牌**
   - 在同一页面，找到"Verify Token"
   - 点击"生成"或手动输入（自定义字符串）
   - 示例：`openclaw_verify_token_2026`

3. **保存配置信息**
   ```bash
   # 将以下信息添加到 .env 文件
   FEISHU_APP_ID=cli_xxxxxxxxxxxxx
   FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxx
   FEISHU_ENCRYPT_KEY=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0
   FEISHU_VERIFY_TOKEN=openclaw_verify_token_2026
   FEISHU_REDIRECT_URI=https://openclaw.service.com/oauth/callback
   FEISHU_WEBHOOK_URL=https://openclaw.service.com/feishu/events
   ```

### 第五步：启用机器人能力

1. **进入机器人配置**
   - 在应用详情页，点击"机器人"
   - 点击"开启机器人"

2. **配置机器人信息**
   - 机器人名称：`OpenClaw 助手`
   - 机器人描述：`您的智能 AI 助手，支持对话、分析和任务执行`
   - 机器人头像：上传机器人 Logo

3. **配置机器人功能**
   - 勾选"支持群聊"
   - 勾选"支持私聊"（可选）
   - 设置欢迎语：
     ```
     🦊 欢迎使用 OpenClaw 龙虾认领平台！

     我是一个智能 AI 助手，可以帮助您：
     - 回答问题和提供信息
     - 分析数据和生成报告
     - 执行任务和自动化工作

     开始对话吧！
     ```

### 第六步：发布应用

1. **版本管理**
   - 在应用详情页，点击"版本管理"
   - 创建新版本：
     - 版本号：`1.0.0`
     - 版本描述：`MVP 版本 - 扫码即用功能`
   - 点击"创建"

2. **申请发布**
   - 点击"申请发布"
   - 选择发布范围：
     - 选择"企业内部"
     - 选择"全部成员"
   - 填写发布说明：
     ```
     OpenClaw 龙虾认领平台 MVP 版本

     功能特性：
     - 扫码快速登录
     - AI 智能对话
     - 实例管理
     - 消息路由
     ```
   - 提交审核

3. **等待审核**
   - 企业内部应用通常会快速通过审核
   - 审核通过后，应用即可使用

### 第七步：测试验证

1. **验证 OAuth 授权**
   - 访问授权 URL：
     ```
     https://open.feishu.cn/open-apis/authen/v1/authorize?app_id={APP_ID}&redirect_uri={REDIRECT_URI}&scope=contact:user.base:readonly&state=test123
     ```
   - 扫描二维码
   - 确认授权
   - 检查是否正确重定向到回调 URL

2. **验证 Webhook 事件**
   - 将机器人添加到测试群聊
   - 发送测试消息：`@OpenClaw 助手 你好`
   - 检查后端日志是否收到事件
   - 验证机器人是否正确回复

3. **验证 API 调用**
   ```bash
   # 测试获取访问令牌
   curl -X POST https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal \
     -H 'Content-Type: application/json' \
     -d '{
       "app_id": "{APP_ID}",
       "app_secret": "{APP_SECRET}"
     }'
   ```

## 验收清单

完成以上配置后，请确认以下验收条件：

- [ ] 飞书应用已创建并可见
- [ ] App ID 和 App Secret 已获取并保存
- [ ] 权限已正确配置（contact:user.base:readonly 等）
- [ ] OAuth 重定向 URL 已配置
- [ ] 事件订阅已配置（接收消息、群添加机器人等）
- [ ] Webhook 回调 URL 已配置（https://openclaw.service.com/feishu/events）
- [ ] Encrypt Key 已生成（43位字符串）
- [ ] Verify Token 已生成并保存到 .env
- [ ] 飞书机器人已启用并配置
- [ ] 应用已发布到企业内部
- [ ] OAuth 授权流程测试通过
- [ ] Webhook 事件接收测试通过
- [ ] 机器人可添加到群聊
- [ ] 机器人可接收和回复消息

## 常见问题

### Q1: 回调 URL 验证失败怎么办？

**A**: 检查以下几点：
1. 确认域名已正确解析
2. 确认 SSL 证书有效
3. 确认 Nginx 反向代理配置正确
4. 确认后端服务正常运行
5. 检查防火墙和安全组规则

### Q2: 事件订阅不生效？

**A**: 确认：
1. Encrypt Key 和 Verify Token 配置一致
2. 后端正确处理 url_verification 请求
3. 后端正确验证事件签名
4. 检查后端日志是否有错误

### Q3: OAuth 授权后回调失败？

**A**: 检查：
1. 重定向 URL 配置是否完全匹配
2. state 参数是否正确传递和验证
3. 后端是否正确处理授权码
4. 飞书应用权限是否已授予

### Q4: 机器人无法回复消息？

**A**: 确认：
1. 机器人权限已开启（im:message）
2. 租户访问令牌有效
3. 消息接收者 ID 正确
4. 消息格式符合飞书规范

## 安全建议

1. **保护密钥安全**
   - App Secret 不要提交到代码仓库
   - 使用环境变量存储敏感信息
   - 定期轮换密钥

2. **验证请求来源**
   - 验证飞书事件签名
   - 检查请求时间戳（防重放攻击）
   - 使用 HTTPS 加密传输

3. **权限最小化**
   - 只申请必要的权限
   - 定期审查权限使用情况
   - 移除不需要的权限

4. **日志和监控**
   - 记录所有 API 调用
   - 监控异常请求
   - 设置告警机制

## 相关文档

- [飞书开放平台文档](https://open.feishu.cn/document)
- [OAuth 2.0 授权](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMuk/oauth-2.0/authorization-code)
- [事件订阅](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/event-management)
- [机器人能力](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/bot-sexplorer/bot-overview)

## 附录

### A. 环境变量配置模板

```bash
# 飞书应用配置
FEISHU_APP_ID=cli_xxxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxx
FEISHU_ENCRYPT_KEY=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0
FEISHU_VERIFY_TOKEN=openclaw_verify_token_2026
FEISHU_REDIRECT_URI=https://openclaw.service.com/oauth/callback
FEISHU_WEBHOOK_URL=https://openclaw.service.com/feishu/events

# 飞书 API 配置
FEISHU_API_BASE_URL=https://open.feishu.cn/open-apis
FEISHU_OAUTH_AUTHORIZE_URL=https://open.feishu.cn/open-apis/authen/v1/authorize
FEISHU_OAUTH_TOKEN_URL=https://open.feishu.cn/open-apis/authen/v2/oauth/token
FEISHU_OAUTH_REFRESH_URL=https://open.feishu.cn/open-apis/authen/v2/refresh_token
```

### B. 配置检查脚本

```bash
#!/bin/bash
# 飞书配置检查脚本

echo "=== 飞书开放平台配置检查 ==="

# 检查环境变量
if [ -f .env ]; then
    source .env
    echo "✅ .env 文件已加载"
else
    echo "❌ .env 文件不存在"
    exit 1
fi

# 检查必需的环境变量
required_vars=(
    "FEISHU_APP_ID"
    "FEISHU_APP_SECRET"
    "FEISHU_ENCRYPT_KEY"
    "FEISHU_VERIFY_TOKEN"
    "FEISHU_REDIRECT_URI"
    "FEISHU_WEBHOOK_URL"
)

for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo "❌ 环境变量 $var 未设置"
    else
        echo "✅ 环境变量 $var 已设置"
    fi
done

# 测试飞书 API 连接
echo ""
echo "=== 测试飞书 API 连接 ==="
response=$(curl -s -X POST https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal \
    -H 'Content-Type: application/json' \
    -d "{
        \"app_id\": \"$FEISHU_APP_ID\",
        \"app_secret\": \"$FEISHU_APP_SECRET\"
    }")

if echo "$response" | grep -q "tenant_access_token"; then
    echo "✅ 飞书 API 连接成功"
    token=$(echo "$response" | grep -o '"tenant_access_token":"[^"]*' | cut -d'"' -f4)
    echo "✅ 获取到租户访问令牌: ${token:0:20}..."
else
    echo "❌ 飞书 API 连接失败"
    echo "响应: $response"
fi

# 测试 Webhook 端点
echo ""
echo "=== 测试 Webhook 端点 ==="
webhook_response=$(curl -s -o /dev/null -w "%{http_code}" https://openclaw.service.com/feishu/events)
if [ "$webhook_response" = "200" ] || [ "$webhook_response" = "404" ]; then
    echo "✅ Webhook 端点可访问 (HTTP $webhook_response)"
else
    echo "❌ Webhook 端点不可访问 (HTTP $webhook_response)"
fi

echo ""
echo "=== 检查完成 ==="
```

### C. 故障排除命令

```bash
# 查看后端服务日志
docker logs -f opclaw-backend

# 查看 Nginx 日志
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log

# 测试 Webhook 端点
curl -X POST https://openclaw.service.com/feishu/events \
    -H 'Content-Type: application/json' \
    -d '{
        "type": "url_verification",
        "challenge": "test_challenge",
        "token": "your_verify_token"
    }'

# 测试 OAuth 授权
curl "https://open.feishu.cn/open-apis/authen/v1/authorize?app_id=$FEISHU_APP_ID&redirect_uri=$FEISHU_REDIRECT_URI&scope=contact:user.base:readonly&state=test123"

# 检查 DNS 解析
nslookup openclaw.service.com

# 检查 SSL 证书
openssl s_client -connect openclaw.service.com:443 -servername openclaw.service.com
```

---

> **文档状态**: ✅ 已完成
> **下一步**: 等待 TASK-006 完成后执行本配置
> **预计时间**: 0.5 小时
