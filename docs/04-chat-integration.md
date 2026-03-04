# AIOpc Chat Channel 集成方案

## 1. 飞书集成设计

### 1.1 架构设计

```
┌─────────────┐
│  飞书用户    │
└──────┬──────┘
       │ 消息
       ▼
┌─────────────────────┐
│   飞书服务器         │
│  - 企业内部应用       │
│  - 机器人            │
└──────┬──────────────┘
       │ Webhook/事件订阅
       ▼
┌─────────────────────┐
│   阿里云 SLB         │
│  (公网IP:443)        │
└──────┬──────────────┘
       │ HTTPS
       ▼
┌─────────────────────┐
│  OpenClaw Gateway    │
│  - 飞书事件处理       │
│  - 消息路由          │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│  Agent Cluster      │
│  - 财务Agent         │
│  - 运营Agent         │
│  - 知识Agent         │
│  - 数据Agent         │
└─────────────────────┘
```

### 1.2 飞书开放平台配置

#### 1.2.1 创建企业自建应用

**步骤**：
1. 登录飞书开放平台：https://open.feishu.cn/
2. 创建企业自建应用
3. 获取App ID和App Secret

**应用配置**：
```yaml
应用名称: AIOPC智能助手
应用描述: 电商公司AI助手，提供财务、运营、知识服务
App ID: cli_xxxxxxxxxxxx
App Secret: XXXX (保密)
```

#### 1.2.2 权限申请

**必需权限**：

| 权限范围 | 权限代码 | 说明 |
|----------|----------|------|
| 获取与发送消息 | im:message | 发送和接收消息 |
| 获取群组信息 | im:chat | 获取群组信息 |
| 获取用户信息 | im:user | 获取发送者信息 |
| 读取消息 | im:message:readonly | 读取消息内容 |

**申请方式**：
- 管理员审批
- 开发者后台申请

#### 1.2.3 事件订阅

**订阅事件**：

| 事件类型 | 事件代码 | 处理逻辑 |
|----------|----------|----------|
| 接收消息 | im.message.receive_v1 | 接收用户消息 |
| 群消息 | im.message.group_at_msg | 群@机器人消息 |

**Request URL配置**：
```
https://api.aiopoc.com/feishu/events
```

**验证流程**：
```
飞书服务器 -> 发送验证请求 -> 你的服务
                      <- 返回challenge验证
```

### 1.3 消息交互设计

#### 1.3.1 私聊交互

**场景**：个人与AI助手一对一对话

**交互流程**：
```
用户                    飞书                    OpenClaw
 │                       │                        │
 │─ 发送消息 ───────────>│                        │
 │                       │─ Webhook事件 ─────────>│
 │                       │                        │─ 处理请求
 │                       │                        │─ 调用LLM
 │                       │                        │─ 生成回复
 │                       │<─ 发送消息API ──────────│
 │<─ 接收回复 ───────────│                        │
 │                       │                        │
```

**代码示例（Node.js）**：
```javascript
// 接收飞书消息
app.post('/feishu/events', async (req, res) => {
  const { challenge, type, event } = req.body;

  // URL验证
  if (type === 'url_verification') {
    return res.json({ challenge });
  }

  // 处理消息事件
  if (event.type === 'im.message.receive_v1') {
    const {
      sender: { sender_id: { user_id } },
      message: { content }
    } = event;

    // 解析消息内容
    const text = JSON.parse(content).text;

    // 路由到对应Agent
    const agent = routeToAgent(text, user_id);

    // 处理并回复
    const response = await agent.process(text);

    // 发送回复到飞书
    await feishuClient.sendMessage(user_id, response);
  }

  res.json({ code: 0 });
});
```

#### 1.3.2 群聊交互

**场景**：在群里@机器人提问

**交互流程**：
```
用户A                   飞书群                  OpenClaw
 │                       │                        │
 │─ @AI助手 问题 ────────>│                        │
 │                       │─ @事件 Webhook ────────>│
 │                       │                        │─ 识别@消息
 │                       │                        │─ 提取问题
 │                       │                        │─ Agent处理
 │                       │<─ 发送群消息 ───────────│
 │<─ AI助手: 答案 ───────│                        │
```

**特殊处理**：
- 检测消息中是否@机器人
- 提取@后的内容
- 在群里直接回复（可@提问者）
- 避免循环响应

#### 1.3.3 富文本消息

**支持的消息类型**：

| 类型 | 说明 | 使用场景 |
|------|------|----------|
| text | 纯文本 | 简单问答 |
| post | 富文本 | 带格式的报告、分析 |
| interactive | 卡片消息 | 结构化输出、操作按钮 |
| image | 图片 | 图表、可视化 |

**卡片消息示例**：
```javascript
{
  "msg_type": "interactive",
  "card": {
    "header": {
      "title": {
        "tag": "plain_text",
        "content": "📊 财务分析报告"
      }
    },
    "elements": [
      {
        "tag": "div",
        "text": {
          "tag": "lark_md",
          "content": "**本月销售额**: ¥1,234,567\n**环比增长**: +15.3%"
        }
      },
      {
        "tag": "action",
        "actions": [
          {
            "tag": "button",
            "text": { "tag": "plain_text", "content": "查看详情" },
            "type": "primary",
            "url": "https://dashboard.aiopoc.com/report/123"
          }
        ]
      }
    ]
  }
}
```

### 1.4 Agent路由设计

#### 1.4.1 智能路由

**策略**：根据用户输入自动选择合适的Agent

```javascript
function routeToAgent(text, userId) {
  // 关键词匹配
  if (/财务|报表|费用|预算|发票/.test(text)) {
    return financeAgent;
  }
  if (/订单|客服|选品|活动|销量/.test(text)) {
    return operationsAgent;
  }
  if (/怎么|如何|什么是|流程/.test(text)) {
    return knowledgeAgent;
  }
  if (/分析|趋势|预测|统计/.test(text)) {
    return dataAgent;
  }

  // 默认路由到通用Agent
  return generalAgent;
}
```

#### 1.4.2 用户绑定

**场景**：特定用户绑定特定Agent

**实现**：
```javascript
const userAgentMap = {
  // 财务人员绑定财务Agent
  'user_finance_001': financeAgent,
  'user_finance_002': financeAgent,

  // 运营人员绑定运营Agent
  'user_ops_001': operationsAgent,
  'user_ops_002': operationsAgent,
};

function getAgentForUser(userId) {
  return userAgentMap[userId] || generalAgent;
}
```

### 1.5 飞书集成配置示例

**config/feishu.yaml**：
```yaml
# 飞书应用配置
app:
  id: cli_xxxxxxxxx
  app_secret: xxxxxxxxxxxxxxxx
  encrypt_key: xxxxxxxxxxxxxxxx
  verification_token: xxxxxxxxxxxxxxxx

# API配置
api:
  base_url: https://open.feishu.cn
  timeout: 30000

# 事件订阅
events:
  endpoint: /feishu/events
  enabled:
    - im.message.receive_v1
    - im.message.group_at_msg

# 消息发送
message:
  retry_times: 3
  retry_delay: 1000
```

## 2. 邮件集成设计

### 2.1 架构设计

```
┌─────────────┐
│  用户邮箱    │
└──────┬──────┘
       │ SMTP/IMAP
       ▼
┌─────────────────────┐
│  邮件服务器          │
│  - 企业邮箱/SMTP服务  │
└──────┬──────────────┘
       │ (通过VPN或Internet)
       ▼
┌─────────────────────┐
│  OpenClaw Email模块  │
│  - SMTP发送          │
│  - IMAP接收(可选)    │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│  Agent Cluster      │
└─────────────────────┘
```

### 2.2 SMTP发送邮件

#### 2.2.1 配置方案

**方案1：企业邮箱SMTP**
```yaml
smtp:
  host: smtp.exmail.qq.com  # 腾讯企业邮箱
  port: 465
  secure: true
  auth:
    user: ai@company.com
    pass: password
```

**方案2：阿里云邮件推送**
```yaml
smtp:
  host: smtpdm.aliyun.com
  port: 80或465
  secure: false/true
  auth:
    user: ai@company.com
    pass: api_key
```

#### 2.2.2 发送邮件实现

```javascript
// 使用Nodemailer发送邮件
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.secure,
  auth: {
    user: config.smtp.auth.user,
    pass: config.smtp.auth.pass
  }
});

async function sendEmail(to, subject, content) {
  const mailOptions = {
    from: '"AIOpc助手" <ai@company.com>',
    to: to,
    subject: subject,
    html: content
  };

  const info = await transporter.sendMail(mailOptions);
  return info;
}
```

### 2.3 IMAP接收邮件（可选）

#### 2.3.1 配置

```yaml
imap:
  host: imap.exmail.qq.com
  port: 993
  secure: true
  auth:
    user: ai@company.com
    pass: password
```

#### 2.3.2 监听新邮件

```javascript
const Imap = require('imap');

const imap = new Imap({
  user: config.imap.auth.user,
  password: config.imap.auth.pass,
  host: config.imap.host,
  port: config.imap.port,
  tls: true
});

imap.once('ready', () => {
  imap.openBox('INBOX', false, (err) => {
    imap.on('mail', (numNewMsgs) => {
      // 接收到新邮件
      console.log(`收到 ${numNewMsgs} 封新邮件`);

      // 读取并处理邮件
      processNewEmails();
    });
  });
});

imap.connect();
```

### 2.4 邮件触发Agent

**使用场景**：
1. 定时报告：每日早上发送财务日报
2. 告警通知：异常情况邮件通知
3. 人工审批：需要人工确认时发送邮件

**示例：每日财务报告**
```javascript
// 每天早上8点发送
cron.schedule('0 8 * * *', async () => {
  // 调用财务Agent生成报告
  const report = await financeAgent.generateDailyReport();

  // 发送邮件给财务团队
  await sendEmail(
    'finance@company.com',
    `📊 ${new Date().toLocaleDateString()} 财务日报`,
    generateEmailHTML(report)
  );
});
```

## 3. 集成配置示例

### 3.1 完整配置文件

**config/integration.yaml**：
```yaml
# 飞书集成
feishu:
  enabled: true
  app:
    id: cli_xxxxxxxxx
    app_secret: ${FEISHU_APP_SECRET}
    verification_token: ${FEISHU_VERIFY_TOKEN}
    encrypt_key: ${FEISHU_ENCRYPT_KEY}

  webhook:
    url: https://api.aiopoc.com/feishu/events

  # 支持的群聊（可选）
  allowed_groups:
    - finance_team_group_id
    - operations_team_group_id

# 邮件集成
email:
  enabled: true

  smtp:
    host: smtp.exmail.qq.com
    port: 465
    secure: true
    auth:
      user: ai@company.com
      pass: ${SMTP_PASSWORD}

  imap:
    enabled: false  # 按需开启
    host: imap.exmail.qq.com
    port: 993
    secure: true
    auth:
      user: ai@company.com
      pass: ${IMAP_PASSWORD}

# 路由规则
routing:
  keywords:
    财务: finance
    运营: operations
    知识: knowledge
    数据: data

  user_bindings:
    ou_xxx: finance
    ou_yyy: operations
```

### 3.2 环境变量

**.env.example**：
```bash
# 飞书配置
FEISHU_APP_SECRET=your_app_secret
FEISHU_VERIFY_TOKEN=your_verify_token
FEISHU_ENCRYPT_KEY=your_encrypt_key

# 邮件配置
SMTP_PASSWORD=your_smtp_password
IMAP_PASSWORD=your_imap_password

# API配置
DEEPSEEK_API_KEY=your_deepseek_key
DEEPSEEK_API_BASE=https://api.deepseek.com
```

## 4. 消息模板

### 4.1 飞书消息模板

**财务报告模板**：
```javascript
{
  "msg_type": "post",
  "content": {
    "post": {
      "zh_cn": {
        "title": "📊 财务日报",
        "content": [
          [{
            "tag": "text",
            "text": f"日期: {date}\n\n"
          }],
          [{
            "tag": "text",
            "text": f"**销售额**: ¥{sales}\n"
          }],
          [{
            "tag": "text",
            "text": f"**环比**: {growth}%\n"
          }]
        ]
      }
    }
  }
}
```

### 4.2 邮件模板

**HTML邮件模板**：
```html
<!DOCTYPE html>
<html>
<head>
  <style>
    .report { font-family: Arial; }
    .header { background: #1890ff; color: white; padding: 20px; }
    .content { padding: 20px; }
    .data { margin: 10px 0; }
  </style>
</head>
<body>
  <div class="report">
    <div class="header">
      <h2>📊 财务日报 - {{date}}</h2>
    </div>
    <div class="content">
      <div class="data"><strong>销售额</strong>: ¥{{sales}}</div>
      <div class="data"><strong>环比增长</strong>: {{growth}}%</div>
    </div>
  </div>
</body>
</html>
```

## 5. 错误处理和重试

### 5.1 飞书API重试

```javascript
async function callFeishuAPI(fn, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;

      // 指数退避
      await sleep(Math.pow(2, i) * 1000);
    }
  }
}
```

### 5.2 邮件发送失败处理

```javascript
// 失败记录到数据库
async function handleEmailFailure(to, subject, error) {
  await db.failedEmails.insert({
    to,
    subject,
    error: error.message,
    timestamp: new Date(),
    retry_count: 0
  });

  // 发送告警
  await sendAlert(`邮件发送失败: ${to}`);
}
```
