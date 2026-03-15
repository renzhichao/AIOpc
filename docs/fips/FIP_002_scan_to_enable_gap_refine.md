# FIP-002: 扫码即用 OpenClaw 云服务 GAP填补实施方案
# Feature Implementation Plan: Gap Analysis Refinement and Implementation

## 文档信息

| 项目 | 内容 |
|------|------|
| **FIP 编号** | FIP-002 |
| **关联FIP** | FIP-001 (v1.0) |
| **需求编号** | CORE-REQ-001 |
| **关联GAP分析** | GAP_ANALYSIS.md (v1.0) |
| **标题** | 扫码即用 OpenClaw 云服务 GAP填补实施方案 |
| **版本** | v1.0 |
| **创建日期** | 2026-03-15 |
| **作者** | Claude Code |
| **状态** | 草案，待评审 |
| **目标上线** | Week 2-4 (P0功能补全) |

---

## 目录

- [1. 执行摘要](#1-执行摘要)
- [2. GAP分析回顾](#2-gap分析回顾)
- [3. 实施优先级框架](#3-实施优先级框架)
- [4. P0级功能实施方案](#4-p0级功能实施方案)
- [5. P1级功能实施方案](#5-p1级功能实施方案)
- [6. 技术实施细节](#6-技术实施细节)
- [7. 测试策略](#7-测试策略)
- [8. 部署计划](#8-部署计划)
- [9. 风险与依赖](#9-风险与依赖)
- [10. 成本估算](#10-成本估算)
- [11. 验收标准](#11-验收标准)

---

## 1. 执行摘要

### 1.1 背景

AIOpc 项目已完成基础架构搭建和核心CRUD功能实现（前端 + 后端 + E2E测试），**整体进度约50%**。基于GAP_ANALYSIS.md的分析，项目在**核心业务逻辑**层面存在关键缺失，阻碍了MVP的可用性。

**当前状态**：
- ✅ 前后端代码框架完整
- ✅ 基础实例管理功能完成（CRUD）
- ✅ E2E测试覆盖率100% (45/45 passing)
- ❌ 核心业务逻辑缺失（真实二维码、真实OAuth、预设配置应用）
- ❌ Mock依赖严重，无法生产部署

### 1.2 核心目标

**本FIP要解决的问题**：

1. **从Mock到真实**：替换Mock OAuth为真实飞书OAuth集成
2. **从占位到功能**：实现真实二维码生成和验证
3. **从模板到应用**：将预设配置实际应用到实例创建
4. **从基础到完整**：补全实例续费、统计等核心功能

### 1.3 预期成果

**2-4周内达成**：
- ✅ 用户可完整走通"扫码认领→使用实例"流程
- ✅ 实例包含预设的DeepSeek API Key和基础Skills
- ✅ 管理员可查看实例使用统计
- ✅ 系统具备生产环境部署条件

---

## 2. GAP分析回顾

### 2.1 核心功能（Must Have）完成度

| 功能 | 完成度 | 阻塞问题 | 优先级 |
|------|--------|----------|--------|
| F-001: 实例生命周期管理 | 70% | 缺少续费功能 | P1 |
| F-002: 二维码生成与验证 | 30% | 仅UI占位，未生成真实QR | **P0** |
| F-003: 飞书OAuth集成 | 60% | 使用Mock，未接入真实飞书 | **P0** |
| F-004: 预设配置管理 | 50% | 未应用到实例创建 | **P0** |

### 2.2 扩展功能（Should Have）完成度

| 功能 | 完成度 | 阻塞问题 | 优先级 |
|------|--------|----------|--------|
| F-005: 实例管理界面 | 80% | 缺少统计展示 | P1 |
| F-006: 使用量统计 | 0% | 完全未实现 | P1 |
| F-007: 配置自定义 | 20% | 基础框架存在，功能缺失 | P2 |

### 2.3 关键阻塞点

**阻塞MVP发布的P0级问题**：

1. **真实二维码缺失**
   - 当前状态：LoginPage显示静态QR占位符
   - 需求：生成包含OAuth链接的真实QR码图片
   - 影响：用户无法实际扫码完成认领

2. **真实飞书OAuth缺失**
   - 当前状态：使用MockOAuthController
   - 需求：接入飞书开放平台OAuth 2.0
   - 影响：无法获取真实用户信息

3. **预设配置未应用**
   - 当前状态：模板文件存在但未使用
   - 需求：实例创建时自动应用LLM/Skills/Tools配置
   - 影响：实例无预设能力，不符合"开箱即用"要求

---

## 3. 实施优先级框架

### 3.1 优先级矩阵

基于**紧迫性**（是否阻塞MVP）和**重要性**（用户价值）划分：

| 功能 | 紧迫性 | 重要性 | 优先级 | 实施周期 |
|------|--------|--------|--------|----------|
| 真实二维码生成 | 🔴 高 | 🔴 高 | **P0** | 2-3h |
| 真实飞书OAuth | 🔴 高 | 🔴 高 | **P0** | 4-6h |
| 预设配置应用 | 🔴 高 | 🔴 高 | **P0** | 6-8h |
| 实例续费功能 | 🟡 中 | 🔴 高 | P1 | 3-4h |
| 使用量统计 | 🟡 中 | 🟡 中 | P1 | 14-17h |
| 二维码高级功能 | 🟢 低 | 🟢 中 | P2 | 4-6h |
| 配置自定义 | 🟢 低 | 🟡 中 | P2 | 22-30h |

### 3.2 实施阶段划分

**Stage 1: MVP核心补全** (Week 1-2)
- 目标：让系统可端到端运行
- 交付：真实二维码 + 真实OAuth + 预设配置
- 时间：15-20小时

**Stage 2: 基础完善** (Week 3)
- 目标：提供基础运营能力
- 交付：续费 + 统计 + 账单
- 时间：20-25小时

**Stage 3: 优化增强** (Week 4+)
- 目标：提供高级功能
- 交付：配置自定义 + 高级统计
- 时间：30+小时

---

## 4. P0级功能实施方案

### 4.1 真实二维码生成 (F-002)

#### 4.1.1 技术方案

**依赖库**: `qrcode` (npm)

**实现步骤**：

1. **后端API实现** (1-1.5h)
```typescript
// src/controllers/InstanceController.ts
@Get('/:id/qr-code')
async getQRCode(@Param('id') instanceId: string) {
  const qrData = {
    action: 'claim_instance',
    instance_id: instanceId,
    timestamp: Date.now(),
  };

  const token = this.oauthService.generateQRToken(qrData);
  const oauthUrl = `https://open.feishu.cn/open-apis/authen/v1/authorize?` +
    `app_id=${process.env.FEISHU_APP_ID}&` +
    `redirect_uri=${process.env.FEISHU_REDIRECT_URI}&` +
    `state=${instanceId}:${token}`;

  return {
    qr_code_url: oauthUrl,
    expires_at: new Date(Date.now() + 24*3600*1000).toISOString(),
  };
}
```

2. **前端QR码渲染** (1h)
```typescript
// src/pages/LoginPage.tsx
import QRCode from 'qrcode.react';

const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
const [qrCodeImage, setQrCodeImage] = useState<string>('');

useEffect(() => {
  const fetchQRCode = async () => {
    const response = await fetch(`/api/instances/${instanceId}/qr-code`);
    const data = await response.json();
    setQrCodeUrl(data.qr_code_url);

    // 生成QR码图片
    QRCode.toDataURL(data.qr_code_url, (error, url) => {
      if (url) setQrCodeImage(url);
    });
  };

  fetchQRCode();
}, [instanceId]);

// 渲染QR码图片
<img src={qrCodeImage} alt="Scan to claim" />
```

3. **数据库表设计** (0.5h)
```sql
CREATE TABLE qr_codes (
  id SERIAL PRIMARY KEY,
  instance_id VARCHAR(255) UNIQUE NOT NULL,
  token VARCHAR(255) UNIQUE NOT NULL,
  state VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  scan_count INTEGER DEFAULT 0,
  claimed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_qr_codes_token ON qr_codes(token);
CREATE INDEX idx_qr_codes_expires_at ON qr_codes(expires_at);
```

**验证标准**：
- ✅ 用户可扫描二维码跳转到飞书授权页
- ✅ 二维码包含防伪token
- ✅ 二维码24小时过期
- ✅ 扫码记录到数据库

#### 4.1.2 测试计划

**单元测试**：
- QRCodeService.generateQRToken()
- QRCodeService.validateQRToken()
- InstanceController.getQRCode()

**E2E测试**：
```typescript
test('should display scannable QR code', async ({ page }) => {
  await page.goto('/login');
  const qrImage = await page.locator('[data-testid="qr-code-image"]');
  await expect(qrImage).toBeVisible();

  // 验证QR码可解析
  const qrDataUrl = await qrImage.getAttribute('src');
  expect(qrDataUrl).toBeTruthy();
  expect(qrDataUrl).toContain('data:image/png;base64');
});
```

---

### 4.2 真实飞书OAuth集成 (F-003)

#### 4.2.1 技术方案

**飞书开放平台配置**：
```yaml
feishu:
  app_id: cli_xxxxxxxxxxxxx
  app_secret: xxxxxxxxxxxxxxxxxxxx
  redirect_uri: https://your-domain.com/oauth/callback
  encrypt_key: xxxxxxxxxxxxxxxxxxxx
  verification_token: xxxxxxxxxxxxxxxxxxxx
```

**实现步骤**：

1. **环境变量配置** (0.5h)
```bash
# .env.production
FEISHU_APP_ID=cli_xxxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxx
FEISHU_REDIRECT_URI=https://your-domain.com/oauth/callback
FEISHU_ENCRYPT_KEY=xxxxxxxxxxxxxxxxxx
FEISHU_VERIFICATION_TOKEN=xxxxxxxxxxxxxxxxxx
```

2. **OAuthService实现** (2-3h)
```typescript
// src/services/OAuthService.ts
import axios from 'axios';

export class OAuthService {
  private readonly FEISHU_OAUTH_URL = 'https://open.feishu.cn/open-apis/authen/v1';
  private readonly FEISHU_API_URL = 'https://open.feishu.cn/open-apis';

  async getAuthorizeUrl(state: string): Promise<string> {
    const params = new URLSearchParams({
      app_id: process.env.FEISHU_APP_ID!,
      redirect_uri: process.env.FEISHU_REDIRECT_URI!,
      scope: 'contact:user.base:readonly contact:user.email:readonly',
      state: state,
    });

    return `${this.FEISHU_OAUTH_URL}/authorize?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string): Promise<any> {
    const response = await axios.post(
      `${this.FEISHU_OAUTH_URL}/oidc/access_token`,
      {
        app_id: process.env.FEISHU_APP_ID,
        app_secret: process.env.FEISHU_APP_SECRET,
        grant_type: 'authorization_code',
        code,
      }
    );

    return response.data;
  }

  async getUserInfo(accessToken: string): Promise<any> {
    const response = await axios.get(
      `${this.FEISHU_OAUTH_URL}/oidc/user_info`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    return response.data;
  }

  verifySignature(signature: string, payload: string): boolean {
    const hmac = crypto
      .createHmac('sha256', process.env.FEISHU_ENCRYPT_KEY!)
      .update(payload)
      .digest('base64');

    return signature === hmac;
  }
}
```

3. **OAuthController更新** (1-1.5h)
```typescript
// src/controllers/OAuthController.ts
export class OAuthController {
  constructor(private readonly oauthService: OAuthService) {}

  @Get('authorize')
  async authorize(@QueryParam('instance_id') instanceId: string) {
    const state = `${instanceId}:${Date.now()}`;
    const authUrl = await this.oauthService.getAuthorizeUrl(state);

    // 保存state到Redis
    await redis.setex(`oauth:state:${state}`, 600, JSON.stringify({
      instance_id: instanceId,
      timestamp: Date.now(),
    }));

    return { authorize_url: authUrl };
  }

  @Post('callback')
  async handleCallback(@Body() body: any) {
    const { code, state } = body;

    // 验证state
    const stateData = await redis.get(`oauth:state:${state}`);
    if (!stateData) {
      throw new AppError(400, 'INVALID_STATE', 'Invalid or expired state');
    }

    const { instance_id } = JSON.parse(stateData);

    // 换取token
    const tokenData = await this.oauthService.exchangeCodeForToken(code);

    // 获取用户信息
    const userInfo = await this.oauthService.getUserInfo(
      tokenData.access_token
    );

    // 创建或更新用户
    const user = await this.userService.findOrCreate({
      feishu_user_id: userInfo.user_id,
      name: userInfo.name,
      email: userInfo.email,
      avatar: userInfo.avatar_url,
    });

    // 绑定用户和实例
    await this.instanceService.bindToUser(instance_id, user.id);

    // 生成JWT token
    const jwtToken = this.jwtService.sign({
      user_id: user.id,
      instance_id,
    });

    return {
      access_token: jwtToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      redirect_url: `/dashboard`,
    };
  }
}
```

**验证标准**：
- ✅ 用户扫码后跳转到真实飞书授权页
- ✅ 授权成功后获取真实用户信息
- ✅ 用户-实例绑定关系正确创建
- ✅ JWT Token正确生成和验证

#### 4.2.2 测试计划

**集成测试**：
```typescript
describe('Feishu OAuth Integration', () => {
  test('should exchange code for access token', async () => {
    const response = await oauthService.exchangeCodeForToken(mockCode);
    expect(response.access_token).toBeTruthy();
  });

  test('should get user info from Feishu', async () => {
    const userInfo = await oauthService.getUserInfo(accessToken);
    expect(userInfo.user_id).toBeTruthy();
    expect(userInfo.name).toBeTruthy();
  });
});
```

**E2E测试**：
```typescript
test('should complete OAuth flow end-to-end', async ({ page }) => {
  // 1. 访问登录页
  await page.goto('/login');

  // 2. 扫描二维码（模拟）
  await page.click('[data-testid="qr-code-image"]');

  // 3. 完成飞书授权
  await page.fill('input[name="username"]', 'test@example.com');
  await page.click('button[type="submit"]');

  // 4. 验证跳转到dashboard
  await expect(page).toHaveURL('/dashboard');

  // 5. 验证用户信息
  const userName = await page.locator('[data-testid="user-name"]').textContent();
  expect(userName).toBeTruthy();
});
```

---

### 4.3 预设配置应用 (F-004)

#### 4.3.1 技术方案

**实现步骤**：

1. **创建预设配置Schema** (1h)
```typescript
// src/types/config.ts
export interface InstancePresetConfig {
  llm: {
    provider: 'deepseek';
    api_key: string;
    api_base: string;
    model: string;
    temperature: number;
    max_tokens: number;
  };
  skills: Array<{
    name: string;
    enabled: boolean;
    config?: Record<string, unknown>;
  }>;
  tools: Array<{
    name: string;
    enabled: boolean;
    layer: 1 | 2;
  }>;
  system_prompt: string;
  limits: {
    max_messages_per_day: number;
    max_storage_mb: number;
    max_users?: number;
  };
}

export const PRESET_TEMPLATES: Record<string, InstancePresetConfig> = {
  personal: {
    llm: {
      provider: 'deepseek',
      api_key: process.env.DEEPSEEK_API_KEY || '',
      api_base: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      temperature: 0.7,
      max_tokens: 4000,
    },
    skills: [
      { name: 'general_chat', enabled: true },
      { name: 'web_search', enabled: true },
      { name: 'knowledge_base', enabled: true },
      { name: 'email_assistant', enabled: false },
      { name: 'code_helper', enabled: false },
      { name: 'data_analyst', enabled: false },
    ],
    tools: [
      { name: 'read', enabled: true, layer: 1 },
      { name: 'write', enabled: true, layer: 1 },
      { name: 'web_search', enabled: true, layer: 1 },
      { name: 'memory', enabled: true, layer: 1 },
    ],
    system_prompt: DEFAULT_SYSTEM_PROMPT,
    limits: {
      max_messages_per_day: 100,
      max_storage_mb: 100,
    },
  },
  team: {
    // ... team template
  },
  enterprise: {
    // ... enterprise template
  },
};

const DEFAULT_SYSTEM_PROMPT = `
你是一个名为"龙虾"的AI助手，基于OpenClaw框架构建。

你的核心能力：
1. 通用对话：回答各种问题
2. 网络搜索：获取最新信息
3. 知识问答：基于知识库回答
4. 记忆管理：记住重要信息

你的特点：
- 专业且友好
- 准确且诚实
- 保护用户隐私
- 持续学习改进

请用简洁、准确的方式回答用户问题。
`;
```

2. **InstanceService更新** (2-3h)
```typescript
// src/services/InstanceService.ts
async createInstance(user: User, options: CreateInstanceOptions): Promise<Instance> {
  const { template, config } = options;

  // 获取预设配置
  const presetConfig = PRESET_TEMPLATES[template] || PRESET_TEMPLATES.personal;

  // 创建Docker容器
  const containerId = await this.dockerService.createContainer({
    image: 'openclaw/agent:latest',
    environment: {
      LLM_API_KEY: presetConfig.llm.api_key,
      LLM_API_BASE: presetConfig.llm.api_base,
      LLM_MODEL: presetConfig.llm.model,
      LLM_TEMPERATURE: presetConfig.llm.temperature.toString(),
      LLM_MAX_TOKENS: presetConfig.llm.max_tokens.toString(),
      ENABLED_SKILLS: JSON.stringify(
        presetConfig.skills.filter(s => s.enabled).map(s => s.name)
      ),
      ENABLED_TOOLS: JSON.stringify(
        presetConfig.tools.filter(t => t.enabled).map(t => t.name)
      ),
      SYSTEM_PROMPT: presetConfig.system_prompt,
    },
  });

  // 创建实例记录
  const instance = await this.instanceRepository.save({
    id: generateInstanceId(),
    owner_id: user.id,
    template,
    status: 'pending',
    docker_container_id: containerId,
    config: presetConfig,
    created_at: new Date(),
    expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000), // 30天
  });

  return instance;
}
```

3. **配置持久化** (1h)
```typescript
// src/entities/Instance.ts
@Entity('instances')
export class Instance {
  @PrimaryColumn()
  id: string;

  @Column('jsonb')
  config: InstancePresetConfig;

  @Column()
  template: string;

  // ... other fields
}
```

**验证标准**：
- ✅ 创建实例时自动应用预设LLM配置
- ✅ 预设Skills和Tools配置正确写入环境变量
- ✅ System Prompt使用预设模板
- ✅ 支持personal/team/enterprise三种模板

#### 4.3.2 测试计划

**集成测试**：
```typescript
describe('Preset Configuration', () => {
  test('should apply personal template on instance creation', async () => {
    const user = await createTestUser();
    const instance = await instanceService.createInstance(user, {
      template: 'personal',
      config: {},
    });

    expect(instance.config.llm.model).toBe('deepseek-chat');
    expect(instance.config.skills).toHaveLength(6);
    expect(instance.config.tools).toHaveLength(4);
  });

  test('should use platform DeepSeek API key', async () => {
    const instance = await instanceService.createInstance(user, {
      template: 'personal',
      config: {},
    });

    expect(instance.config.llm.api_key).toBe(process.env.DEEPSEEK_API_KEY);
  });
});
```

**E2E测试**：
```typescript
test('should create instance with preset configuration', async ({ page }) => {
  // 1. 登录
  await login(page);

  // 2. 创建实例
  await page.click('[data-testid="create-instance-button"]');
  await page.selectOption('[data-testid="template-select"]', 'personal');
  await page.click('[data-testid="submit-button"]');

  // 3. 验证实例创建成功
  await expect(page.locator('[data-testid="success-message"]')).toBeVisible();

  // 4. 进入实例详情验证配置
  await page.goto(`/instances/${instanceId}`);

  // 5. 验证预设Skills已启用
  const enabledSkills = await page.locator('[data-testid="enabled-skills"]').textContent();
  expect(enabledSkills).toContain('general_chat');
  expect(enabledSkills).toContain('web_search');
});
```

---

## 5. P1级功能实施方案

### 5.1 实例续费功能 (F-001补充)

#### 5.1.1 技术方案

**实现步骤**：

1. **续费API** (1h)
```typescript
// src/controllers/InstanceController.ts
@Post('/:id/renew')
async renewInstance(
  @Param('id') instanceId: string,
  @Body() body: { duration_days: number },
  @Req() req: any
) {
  const user = req.user;
  const instance = await this.instanceService.findById(instanceId);

  if (instance.owner_id !== user.id) {
    throw new AppError(403, 'FORBIDDEN', 'Not authorized');
  }

  const oldExpiresAt = instance.expires_at;
  const newExpiresAt = new Date(
    oldExpiresAt.getTime() + body.duration_days * 24 * 3600 * 1000
  );

  await this.instanceService.updateExpiresAt(instanceId, newExpiresAt);

  // 记录续费历史
  await this.renewalService.record({
    instance_id: instanceId,
    old_expires_at: oldExpiresAt,
    new_expires_at: newExpiresAt,
    duration_days: body.duration_days,
    renewed_by: user.id,
  });

  return {
    success: true,
    new_expires_at: newExpiresAt,
    extended_days: body.duration_days,
  };
}
```

2. **数据库表** (0.5h)
```sql
CREATE TABLE instance_renewals (
  id SERIAL PRIMARY KEY,
  instance_id VARCHAR(255) NOT NULL,
  old_expires_at TIMESTAMP NOT NULL,
  new_expires_at TIMESTAMP NOT NULL,
  duration_days INTEGER NOT NULL,
  renewed_by VARCHAR(255) NOT NULL,
  renewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (instance_id) REFERENCES instances(id),
  FOREIGN KEY (renewed_by) REFERENCES users(id),
  INDEX idx_instance_renewals (instance_id)
);
```

3. **前端UI** (1.5h)
```typescript
// src/pages/InstanceDetailPage.tsx
const [showRenewModal, setShowRenewModal] = useState(false);

const handleRenew = async (durationDays: number) => {
  const response = await fetch(`/api/instances/${instance.id}/renew`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ duration_days: durationDays }),
  });

  if (response.ok) {
    const data = await response.json();
    setInstance(data.data);
    setShowRenewModal(false);
  }
};

// UI组件
<button onClick={() => setShowRenewModal(true)}>
  续费
</button>

<Modal isOpen={showRenewModal} onClose={() => setShowRenewModal(false)}>
  <h3>续费实例</h3>
  <p>当前到期时间：{formatDate(instance.expires_at)}</p>
  <div className="space-y-2">
    <button onClick={() => handleRenew(30)}>续费1个月</button>
    <button onClick={() => handleRenew(90)}>续费3个月</button>
    <button onClick={() => handleRenew(180)}>续费6个月</button>
  </div>
</Modal>
```

**验证标准**：
- ✅ 用户可选择续费时长（1/3/6个月）
- ✅ 续费后到期时间正确更新
- ✅ 续费历史正确记录
- ✅ 只有实例所有者可续费

---

### 5.2 使用量统计 (F-006)

#### 5.2.1 技术方案

**架构设计**：

```
┌─────────────────────────────────────────────────┐
│                Metrics Collection Layer          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │ Container │  │  API     │  │  User    │     │
│  │  Stats   │  │  Calls   │  │ Actions  │     │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘     │
│       │             │             │            │
│       └─────────────┴─────────────┘            │
│                     ↓                          │
│  ┌────────────────────────────────────┐       │
│  │   Metrics Aggregation Service    │       │
│  │   (Scheduled every 5 minutes)     │       │
│  └────────────────────────────────────┘       │
│                     ↓                          │
│  ┌────────────────────────────────────┐       │
│  │   PostgreSQL (instance_metrics)   │       │
│  └────────────────────────────────────┘       │
└─────────────────────────────────────────────────┘
```

**实现步骤**：

1. **数据库表设计** (1h)
```sql
CREATE TABLE instance_metrics (
  id SERIAL PRIMARY KEY,
  instance_id VARCHAR(255) NOT NULL,
  metric_type VARCHAR(50) NOT NULL,
  metric_value NUMERIC NOT NULL,
  unit VARCHAR(20),
  recorded_at TIMESTAMP NOT NULL,
  FOREIGN KEY (instance_id) REFERENCES instances(id),
  INDEX idx_instance_metrics_time (instance_id, recorded_at),
  INDEX idx_metrics_type_time (metric_type, recorded_at)
);

-- 聚合视图（按小时/天）
CREATE VIEW v_instance_daily_metrics AS
SELECT
  instance_id,
  metric_type,
  date(recorded_at) as metric_date,
  AVG(metric_value) as avg_value,
  MAX(metric_value) as max_value,
  MIN(metric_value) as min_value,
  SUM(metric_value) as total_value
FROM instance_metrics
GROUP BY instance_id, metric_type, date(recorded_at);
```

2. **Metrics采集服务** (2-3h)
```typescript
// src/services/MetricsCollectionService.ts
export class MetricsCollectionService {
  constructor(
    private readonly dockerService: DockerService,
    private readonly metricsRepository: MetricsRepository
  ) {}

  async collectContainerMetrics(instanceId: string): Promise<void> {
    const containerId = instance.docker_container_id;

    // 获取容器统计信息
    const stats = await this.dockerService.getContainerStats(containerId);

    // CPU使用率
    const cpuUsage = stats.cpu_stats.cpu_usage / stats.cpu_stats.system_cpu_usage;
    await this.metricsRepository.record({
      instance_id: instanceId,
      metric_type: 'cpu_usage',
      metric_value: cpuUsage * 100, // 转换为百分比
      unit: 'percent',
    });

    // 内存使用量
    const memoryUsage = stats.memory_stats.usage;
    const memoryLimit = stats.memory_stats.limit;
    await this.metricsRepository.record({
      instance_id: instanceId,
      metric_type: 'memory_usage',
      metric_value: memoryUsage / (1024 * 1024), // MB
      unit: 'mb',
    });
  }

  async collectAPIMetrics(instanceId: string): Promise<void> {
    // 从API调用日志中统计
    const messageCount = await this.apiLogRepository.countMessages(instanceId, 'day');
    await this.metricsRepository.record({
      instance_id: instanceId,
      metric_type: 'message_count',
      metric_value: messageCount,
      unit: 'count',
    });

    // Token使用量
    const tokenUsage = await this.apiLogRepository.sumTokens(instanceId, 'day');
    await this.metricsRepository.record({
      instance_id: instanceId,
      metric_type: 'token_usage',
      metric_value: tokenUsage,
      unit: 'tokens',
    });
  }
}
```

3. **统计API** (1h)
```typescript
// src/controllers/MetricsController.ts
@Controller('/instances/:id')
export class MetricsController {
  constructor(
    private readonly metricsService: MetricsService
  ) {}

  @Get('usage')
  async getUsageStats(
    @Param('id') instanceId: string,
    @QueryParam('period') period: 'day' | 'week' | 'month' = 'day'
  ) {
    const stats = await this.metricsService.getUsageStats(instanceId, period);

    return {
      instance_id: instanceId,
      period,
      total_messages: stats.messageCount,
      total_tokens: stats.tokenUsage,
      avg_cpu_usage: stats.avgCpuUsage,
      avg_memory_usage: stats.avgMemoryUsage,
      storage_used_mb: stats.storageUsed,
      recorded_at: stats.lastRecordedAt,
    };
  }

  @Get('health')
  async getHealthStatus(@Param('id') instanceId: string) {
    const health = await this.metricsService.getHealthStatus(instanceId);

    return {
      instance_id: instanceId,
      healthy: health.healthy,
      container_status: health.containerStatus,
      http_status: health.httpStatus,
      last_check: health.timestamp,
    };
  }
}
```

4. **前端统计图表** (3-4h)
```typescript
// src/pages/InstanceDetailPage.tsx
import { LineChart, LineChartData } from '../components/charts';

const InstanceStats = ({ instance }: { instance: Instance }) => {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('day');

  useEffect(() => {
    const fetchStats = async () => {
      const response = await fetch(`/api/instances/${instance.id}/usage?period=${period}`);
      const data = await response.json();
      setStats(data.data);
    };

    fetchStats();
  }, [instance.id, period]);

  const chartData: LineChartData = {
    labels: stats?.hourlyData.map(d => d.hour) || [],
    datasets: [
      {
        label: 'CPU使用率 (%)',
        data: stats?.hourlyData.map(d => d.cpu_usage) || [],
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
      },
      {
        label: '内存使用 (MB)',
        data: stats?.hourlyData.map(d => d.memory_usage) || [],
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.1)',
      },
    ],
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3>使用量统计</h3>
        <select value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="day">24小时</option>
          <option value="week">7天</option>
          <option value="month">30天</option>
        </select>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="stat-card">
          <p>消息数</p>
          <p className="text-2xl font-bold">{stats?.total_messages || 0}</p>
        </div>
        <div className="stat-card">
          <p>Token数</p>
          <p className="text-2xl font-bold">{stats?.total_tokens || 0}</p>
        </div>
        <div className="stat-card">
          <p>平均CPU</p>
          <p className="text-2xl font-bold">{stats?.avg_cpu_usage?.toFixed(1)}%</p>
        </div>
        <div className="stat-card">
          <p>平均内存</p>
          <p className="text-2xl font-bold">{stats?.avg_memory_usage?.toFixed(0)} MB</p>
        </div>
      </div>

      <LineChart data={chartData} />
    </div>
  );
};
```

**验证标准**：
- ✅ 每5分钟自动采集容器指标
- ✅ API调用量正确统计
- ✅ 支持按小时/天/周聚合查询
- ✅ 图表实时更新

---

## 6. 技术实施细节

### 6.1 环境配置

**新增环境变量**：
```bash
# .env.production
# 飞书开放平台
FEISHU_APP_ID=cli_xxxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxx
FEISHU_REDIRECT_URI=https://your-domain.com/oauth/callback
FEISHU_ENCRYPT_KEY=xxxxxxxxxxxxxxxxxx
FEISHU_VERIFICATION_TOKEN=xxxxxxxxxxxxxxxxxx

# DeepSeek API
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxx
DEEPSEEK_API_BASE=https://api.deepseek.com

# Redis（二维码token存储）
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# 定时任务
METRICS_COLLECTION_INTERVAL=300000  # 5分钟
```

### 6.2 依赖安装

**后端新增依赖**：
```bash
npm install --save qrcode@latest
npm install --save axios@latest
npm install --save crypto@latest
```

**前端新增依赖**：
```bash
cd frontend
pnpm install --save qrcode.react@latest
pnpm install --save recharts@latest  # 图表库
```

### 6.3 Docker配置

**更新Dockerfile**（如需）：
```dockerfile
# 安装qrcode生成工具
RUN apt-get update && apt-get install -y \
    libcairo5-dev \
    libpango-1.0-0 \
    libjpeg-dev \
    libgif-dev \
    && rm -rf /var/lib/apt/lists/*
```

---

## 7. 测试策略

### 7.1 测试金字塔

```
        ┌─────────┐
        │  E2E测试  │  45 tests (100%)
        │   15%   │
        ├─────────┤
        │集成测试  │  0 tests (0%)
        │   30%   │  ← 需要补充
        ├─────────┤
        │单元测试  │  35 tests (~50%)
        │   55%   │  ← 需要提升
        └─────────┘
```

**目标测试覆盖率**：
- 单元测试：80%+
- 集成测试：60%+
- E2E测试：保持100%

### 7.2 测试用例清单

#### P0功能测试（新增）

**二维码生成**：
- [ ] 生成包含OAuth链接的QR码
- [ ] QR码可被飞书扫描识别
- [ ] QR码token包含数字签名
- [ ] QR码24小时后过期
- [ ] 扫码次数正确记录

**飞书OAuth**：
- [ ] 授权链接正确跳转飞书
- [ ] 授权回调正确处理
- [ ] 用户信息正确获取
- [ ] JWT Token正确生成
- [ ] Token验证中间件正常工作

**预设配置**：
- [ ] personal模板配置正确应用
- [ ] team模板配置正确应用
- [ ] DeepSeek API Key正确注入
- [ ] Skills列表正确配置
- [ ] Tools权限正确设置

#### P1功能测试（新增）

**实例续费**：
- [ ] 续费API正确更新到期时间
- [ ] 续费历史正确记录
- [ ] 续费权限验证（仅所有者）
- [ ] 续费后UI正确显示

**使用量统计**：
- [ ] 容器指标每5分钟采集
- [ ] API调用量正确统计
- [ ] 聚合查询性能可接受（<500ms）
- [ ] 图表数据正确渲染

---

## 8. 部署计划

### 8.1 部署环境

**开发环境**：
- URL: https://dev-openclop.your-domain.com
- 数据库: PostgreSQL 15 (单实例)
- Redis: Redis 7 (单实例)
- Docker Host: 单台开发服务器

**生产环境**：
- URL: https://openclop.your-domain.com
- 数据库: PostgreSQL 15 (主从复制)
- Redis: Redis 7 (哨兵模式)
- Docker Host: 阿里云ECS 4核8G

### 8.2 CI/CD流程

**自动化部署流程**：
```
┌─────────────┐
│  Git Push  │
└──────┬──────┘
       │
       ↓
┌─────────────┐
│ GitHub CI  │
│ - Tests    │
│ - Lint     │
└──────┬──────┘
       │
       ↓
┌─────────────┐
│  Build     │
│  Docker    │
└──────┬──────┘
       │
       ↓
┌─────────────┐
│  Deploy    │
│  Staging   │
└──────┬──────┘
       │
       ↓
┌─────────────┐
│  Manual    │
│  Approval │
└──────┬──────┘
       │
       ↓
┌─────────────┐
│  Deploy    │
│  Production│
└─────────────┘
```

### 8.3 监控和告警

**监控指标**：
- 容器运行状态
- API响应时间
- 数据库连接状态
- Redis缓存命中率
- 错误率统计

**告警规则**：
- 容器停止运行（立即）
- API错误率 > 5%（5分钟）
- 数据库连接失败（立即）
- Redis连接失败（立即）

---

## 9. 风险与依赖

### 9.1 技术风险

| 风险 | 影响 | 概率 | 应对措施 |
|------|------|------|----------|
| 飞书API限流 | 高 | 中 | 实现重试机制，添加缓存 |
| Docker API不稳定 | 中 | 中 | 健康检查，自动重启 |
| 数据库性能瓶颈 | 中 | 低 | 添加索引，查询优化 |
| QR码伪造 | 高 | 低 | 数字签名验证 |

### 9.2 外部依赖

**飞书开放平台**：
- 依赖：OAuth 2.0授权
- SLA：99.9%可用性
- 限流：1000次/分钟
- 应对：实现请求缓存和限流保护

**DeepSeek API**：
- 依赖：LLM推理
- SLA：99%可用性
- 限流：基于Token
- 应对：实现API Key池和重试

**阿里云ECS**：
- 依赖：基础设施
- SLA：99.95%可用性
- 应对：多可用区部署

### 9.3 进度风险

| 风险 | 影响 | 概率 | 应对措施 |
|------|------|------|----------|
| 飞书OAuth集成复杂度 | 延期1-2天 | 中 | 提前阅读文档，准备测试账号 |
| DeepSeek API Key配置 | 延期1天 | 低 | 提前申请和配置 |
| 跨部门协作 | 延期2-3天 | 中 | 每日站会同步进度 |

---

## 10. 成本估算

### 10.1 开发成本

| 任务 | 工时 | 人员 | 成本（人天） |
|------|------|------|-------------|
| P0功能实现 | 15-20h | 1名全栈 | 2-2.5天 |
| P1功能实现 | 20-25h | 1名全栈 | 2.5-3天 |
| 测试和验证 | 10-15h | 1名QA | 1.25-2天 |
| 文档编写 | 5-8h | 1名技术文档 | 0.6-1天 |
| **总计** | **50-68h** | - | **6-8.5天** |

### 10.2 基础设施成本（月）

**开发环境**：
- 阿里云ECS 2核4G：¥300/月
- PostgreSQL RDS：¥200/月
- Redis：¥100/月
- **小计**：¥600/月

**生产环境**（50实例）：
- 阿里云ECS 4核8G：¥600/月
- PostgreSQL RDS：¥400/月
- Redis：¥150/月
- DeepSeek API：¥1,500/月（估算）
- **小计**：¥2,650/月

### 10.3 ROI分析

**投入**：
- 开发成本：6-8.5人天
- 月度成本：¥2,650/月
- 一次性成本：飞书认证、域名等，约¥1,000

**预期收入**（50实例，¥49/月）：
- 月收入：50 × ¥49 = ¥2,450
- 年收入：¥2,450 × 12 = ¥29,400

**盈亏平衡**：
- 基础设施成本覆盖：2.65/2.45 = 1.08倍
- 估算盈亏平衡点：约60-70实例/月

---

## 11. 验收标准

### 11.1 P0功能验收

**二维码生成**：
- [ ] 二维码图片正常显示
- [ ] 扫码后跳转到飞书授权页
- [ ] Token包含防伪签名
- [ ] 过期机制正常工作

**飞书OAuth**：
- [ ] 授权流程完整走通
- [ ] 用户信息正确获取
- [ ] JWT Token生成和验证正常
- [ ] 绑定关系正确创建

**预设配置**：
- [ ] DeepSeek API Key正确注入
- [ ] 预设Skills和Tools生效
- [ ] System Prompt使用预设模板
- [ ] 三种模板配置正确应用

### 11.2 P1功能验收

**实例续费**：
- [ ] 续费API正常工作
- [ ] 到期时间正确更新
- [ ] 续费历史正确记录
- [ ] UI续费功能正常

**使用量统计**：
- [ ] 指标每5分钟采集
- [ ] 聚合查询性能良好
- [ ] 统计图表正确显示
- [ ] 数据准确性验证

### 11.3 整体验收

**功能完整性**：
- [ ] 用户可完整走通"扫码认领→使用→续费"流程
- [ ] 实例包含预设能力（LLM + Skills + Tools）
- [ ] 管理员可查看统计和使用情况

**质量标准**：
- [ ] P0功能测试覆盖率 >90%
- [ ] API平均响应时间 <500ms
- [ ] 页面加载时间 <2s
- [ ] E2E测试全部通过

**部署标准**：
- [ ] 可部署到生产环境
- [ ] 监控和告警正常工作
- [ ] 数据库备份机制正常
- [ ] 日志记录完整

---

## 附录

### A. 参考资料

- [飞书开放平台OAuth文档](https://open.feishu.cn/document/ukTMukTMukTMukTM/uEjNwU4MjM1Uz)
- [DeepSeek API文档](https://platform.deepseek.com/api-docs/)
- [Docker API文档](https://docs.docker.com/engine/api/)
- [QRCode.js文档](https://github.com/soldair/node-qrcode)

### B. 相关文档

- `GAP_ANALYSIS.md` - GAP详细分析
- `CORE-REQ-001.md` - 核心需求文档
- `FIP-001_scan_to_enable.md` - 原始技术方案

### C. 变更历史

| 版本 | 日期 | 变更内容 | 作者 |
|------|------|----------|------|
| v1.0 | 2026-03-15 | 初始版本，基于GAP分析制定实施方案 | Claude Code |

---

**文档状态**: ✅ 完成
**下一步**: 生成详细任务列表（docs/tasks/）
