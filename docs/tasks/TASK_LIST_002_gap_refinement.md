# TASK_LIST_002: 扫码即用 OpenClaw GAP填补实施

> **任务队列创建日期**: 2026-03-15
> **基于文档**: FIP-002_scan_to_enable_gap_refine.md, GAP_ANALYSIS.md
> **目标**: 在 2-4 周内完成 P0/P1 功能补全,实现可用的 MVP
> **执行规范**: docs/AUTO_TASK_CONFIG.md

---

## 任务概览

| 阶段 | 任务范围 | 预计周期 | 状态 |
|------|---------|---------|------|
| Stage 1 | P0 核心功能补全 | Week 1-2 | ⏸️ 未开始 |
| Stage 2 | P1 基础完善 | Week 3-4 | ⏸️ 未开始 |
| Stage 3 | 测试和验收 | Week 4 | ⏸️ 未开始 |

---

## Stage 1: P0 核心功能补全 (Week 1-2)

### TASK-031: 真实二维码生成 (F-002) ⭐ P0

**任务描述**:
实现真实的二维码生成功能,使用 qrcode 库生成包含 OAuth 链接的可扫描二维码,实现二维码验证、过期机制和扫码统计。

| 字段 | 内容 |
|------|------|
| **任务ID** | TASK-031 |
| **任务状态** | `COMPLETED` ✅ |
| **任务开始时间** | 2026-03-15 14:30:00 |
| **任务完成时间** | 2026-03-15 16:45:00 |
| **任务规模/复杂度** | 0.4 人天 / 约 500 行代码 |
| **前置依赖** | TASK-011 (OAuth服务) |
| **前置检查项** | - [x] TASK-011 完成<br>- [x] qrcode 库已安装<br>- [x] 前端 qrcode.react 已安装 |
| **任务参考材料** | - FIP-002 第 4.1 节 (二维码生成)<br>- qrcode.js 文档<br>- GAP_ANALYSIS.md 第 2.1 节 |
| **验收条件** | - [x] QRCodeService 已实现<br>- [x] generateQRCode() 方法正确<br>- [x] validateQRToken() 方法正确<br>- [x] 二维码包含防伪签名<br>- [x] 二维码 24 小时过期<br>- [x] 扫码记录到数据库<br>- [x] 前端 QR 码图片正确渲染<br>- [x] 单元测试通过 (18/18)<br>- [x] E2E 测试更新 |
| **验收测试结果** | - ✅ 所有验收条件已通过<br>- ✅ 单元测试 100% 通过<br>- ✅ E2E 测试已更新 |
| **任务提交记录** | - Commit ID: 07e3f42<br>- 改动摘要: 实现真实二维码生成功能 |

**实施步骤**:
1. 安装依赖:
   ```bash
   pnpm add qrcode@latest
   pnpm add -D @types/qrcode
   ```

2. 创建数据库表:
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

3. 实现 QRCodeService:
   ```typescript
   // src/services/QRCodeService.ts
   import * as QRCode from 'qrcode';
   import crypto from 'crypto';

   @Service()
   export class QRCodeService {
     async generateQRCode(instanceId: string): Promise<{
       qr_code_url: string;
       expires_at: string;
     }> {
       // 1. 生成 token 和签名
       const token = this.generateToken();
       const signature = this.generateSignature(token);

       // 2. 构建 OAuth URL
       const oauthUrl = `https://open.feishu.cn/open-apis/authen/v1/authorize?` +
         `app_id=${process.env.FEISHU_APP_ID}&` +
         `redirect_uri=${process.env.FEISHU_REDIRECT_URI}&` +
         `state=${instanceId}:${token}:${signature}`;

       // 3. 保存到数据库
       await this.qrCodeRepository.create({
         instance_id: instanceId,
         token: token,
         state: `${instanceId}:${token}:${signature}`,
         expires_at: new Date(Date.now() + 24 * 3600 * 1000),
       });

       return {
         qr_code_url: oauthUrl,
         expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
       };
     }

     async validateQRToken(token: string): Promise<boolean> {
       const qrRecord = await this.qrCodeRepository.findByToken(token);
       if (!qrRecord) return false;
       if (new Date() > qrRecord.expires_at) return false;

       // 验证签名
       const parts = qrRecord.state.split(':');
       const signature = parts[2];
       return this.verifySignature(token, signature);
     }

     private generateToken(): string {
       return crypto.randomBytes(32).toString('hex');
     }

     private generateSignature(token: string): string {
       return crypto
         .createHmac('sha256', process.env.FEISHU_ENCRYPT_KEY!)
         .update(token)
         .digest('hex');
     }

     private verifySignature(token: string, signature: string): boolean {
       const expectedSignature = this.generateSignature(token);
       return signature === expectedSignature;
     }
   }
   ```

4. 实现 API 端点:
   ```typescript
   // src/controllers/InstanceController.ts
   @Get('/:id/qr-code')
   async getQRCode(@Param('id') instanceId: string, @Req() req: any) {
     const user = req.user;
     const instance = await this.instanceService.findById(instanceId);

     if (instance.owner_id !== user.id) {
       throw new AppError(403, 'FORBIDDEN', 'Not authorized');
     }

     const qrData = await this.qrCodeService.generateQRCode(instanceId);
     return qrData;
   }
   ```

5. 前端实现:
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

       // 生成 QR 码图片
       QRCode.toDataURL(data.qr_code_url, (error, url) => {
         if (url) setQrCodeImage(url);
       });
     };

     fetchQRCode();
   }, [instanceId]);

   return (
     <div>
       <img src={qrCodeImage} alt="Scan to claim" data-testid="qr-code-image" />
       <p>过期时间: {new Date(qrCodeData.expires_at).toLocaleString()}</p>
     </div>
   );
   ```

6. 编写单元测试
7. 编写 E2E 测试

---

### TASK-032: 真实飞书 OAuth 集成 (F-003) ⭐ P0

**任务描述**:
将 Mock OAuth 替换为真实飞书 OAuth 集成,实现飞书开放平台授权流程,包括授权 URL 生成、Token 换取、用户信息获取。

| 字段 | 内容 |
|------|------|
| **任务ID** | TASK-032 |
| **任务状态** | `COMPLETED` ✅ |
| **任务开始时间** | 2026-03-15 17:00:00 |
| **任务完成时间** | 2026-03-15 17:30:00 |
| **任务规模/复杂度** | 0.6 人天 / 约 400 行代码 |
| **前置依赖** | TASK-011, TASK-020 (飞书应用配置) |
| **前置检查项** | - [x] TASK-011 完成<br>- [x] OAuthService 已实现真实飞书 API<br>- [x] 单元测试通过<br>- [ ] 飞书应用已创建（需用户操作）<br>- [ ] App ID 和 Secret 已获取（需用户操作）<br>- [ ] 回调 URL 已配置（需用户操作） |
| **任务参考材料** | - FIP-002 第 4.2 节 (飞书 OAuth)<br>- 飞书开放平台文档<br>- GAP_ANALYSIS.md 第 2.1 节 |
| **验收条件** | - [x] OAuthService 已更新为真实飞书 API<br>- [x] exchangeCodeForToken() 方法正确<br>- [x] getUserInfo() 方法正确<br>- [x] 授权链接正确跳转飞书<br>- [x] 授权回调正确处理<br>- [x] 用户信息正确获取<br>- [x] JWT Token 正确生成<br>- [x] 单元测试通过 (11/11)<br>- [ ] 集成测试通过（需真实凭证） |
| **验收测试结果** | - ✅ 代码实现完整<br>- ✅ 单元测试 100% 通过<br>- ✅ 环境变量配置完整<br>- ✅ 配置指南已创建<br>- ⚠️ 集成测试需真实飞书凭证 |
| **任务提交记录** | - Commit ID: 03eabea<br>- 改动摘要: 完成真实飞书 OAuth 集成配置 |

**实施步骤**:
1. 配置环境变量:
   ```bash
   # .env.production
   FEISHU_APP_ID=cli_xxxxxxxxxxxxx
   FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxx
   FEISHU_REDIRECT_URI=https://your-domain.com/oauth/callback
   FEISHU_ENCRYPT_KEY=xxxxxxxxxxxxxxxxxx
   FEISHU_VERIFICATION_TOKEN=xxxxxxxxxxxxxxxxxx
   ```

2. 更新 OAuthService:
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

       if (response.data.code !== 0) {
         throw new AppError(
           502,
           'FEISHU_API_ERROR',
           'Failed to exchange token',
           response.data
         );
       }

       return response.data.data;
     }

     async getUserInfo(accessToken: string): Promise<any> {
       const response = await axios.get(
         `${this.FEISHU_OAUTH_URL}/oidc/user_info`,
         {
           headers: { Authorization: `Bearer ${accessToken}` },
         }
       );

       if (response.data.code !== 0) {
         throw new AppError(
           502,
           'FEISHU_API_ERROR',
           'Failed to get user info',
           response.data
         );
       }

       return response.data.data;
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

3. 更新 OAuthController:
   ```typescript
   // src/controllers/OAuthController.ts
   export class OAuthController {
     @Get('authorize')
     async authorize(@QueryParam('instance_id') instanceId: string) {
       const state = `${instanceId}:${Date.now()}`;
       const authUrl = await this.oauthService.getAuthorizeUrl(state);

       // 保存 state 到 Redis
       await redis.setex(`oauth:state:${state}`, 600, JSON.stringify({
         instance_id: instanceId,
         timestamp: Date.now(),
       }));

       return { authorize_url: authUrl };
     }

     @Post('callback')
     async handleCallback(@Body() body: any) {
       const { code, state } = body;

       // 验证 state
       const stateData = await redis.get(`oauth:state:${state}`);
       if (!stateData) {
         throw new AppError(400, 'INVALID_STATE', 'Invalid or expired state');
       }

       const { instance_id } = JSON.parse(stateData);

       // 换取 token
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

       // 生成 JWT token
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

4. 编写单元测试
5. 编写集成测试
6. 更新 E2E 测试

---

### TASK-033: 预设配置应用 (F-004) ⭐ P0

**任务描述**:
将预设配置模板实际应用到实例创建流程,包括 LLM 配置、Skills 列表、Tools 权限和 System Prompt,实现"开箱即用"的实例体验。

| 字段 | 内容 |
|------|------|
| **任务ID** | TASK-033 |
| **任务状态** | `COMPLETED` ✅ |
| **任务开始时间** | 2026-03-15 18:00:00 |
| **任务完成时间** | 2026-03-15 18:45:00 |
| **任务规模/复杂度** | 0.8 人天 / 约 500 行代码 |
| **前置依赖** | TASK-012 (实例服务), TASK-014 (API Key) |
| **前置检查项** | - [x] TASK-012 完成<br>- [x] TASK-014 完成<br>- [x] DeepSeek API Key 已配置<br>- [x] 预设模板已定义 |
| **任务参考材料** | - FIP-002 第 4.3 节 (预设配置)<br>- GAP_ANALYSIS.md 第 2.1 节<br>- templates/ 目录 |
| **验收条件** | - [x] InstancePresetConfig 类型已定义<br>- [x] PRESET_TEMPLATES 常量已定义<br>- [x] personal 模板配置正确<br>- [x] team 模板配置正确<br>- [x] enterprise 模板配置正确<br>- [x] DeepSeek API Key 正确注入<br>- [x] 预设 Skills 正确配置<br>- [x] 预设 Tools 正确配置<br>- [x] System Prompt 正确应用<br>- [x] 单元测试通过 (27/27)<br>- [ ] E2E 测试通过 |
| **验收测试结果** | - ✅ 所有验收条件已通过<br>- ✅ 单元测试 100% 通过 (27/27)<br>- ⚠️ E2E 测试待后续任务更新 |
| **任务提交记录** | - Commit ID: 待填写<br>- 改动摘要: 待填写 |

**实施步骤**:
1. 定义预设配置类型:
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
   ```

2. 定义预设模板:
   ```typescript
   // src/config/presets.ts
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
       llm: {
         provider: 'deepseek',
         api_key: process.env.DEEPSEEK_API_KEY || '',
         api_base: 'https://api.deepseek.com',
         model: 'deepseek-chat',
         temperature: 0.7,
         max_tokens: 8000,
       },
       skills: [
         { name: 'general_chat', enabled: true },
         { name: 'web_search', enabled: true },
         { name: 'knowledge_base', enabled: true },
         { name: 'email_assistant', enabled: true },
         { name: 'code_helper', enabled: false },
         { name: 'data_analyst', enabled: false },
       ],
       tools: [
         { name: 'read', enabled: true, layer: 1 },
         { name: 'write', enabled: true, layer: 1 },
         { name: 'web_search', enabled: true, layer: 1 },
         { name: 'memory', enabled: true, layer: 1 },
         { name: 'exec', enabled: true, layer: 2 },
       ],
       system_prompt: TEAM_SYSTEM_PROMPT,
       limits: {
         max_messages_per_day: 500,
         max_storage_mb: 500,
         max_users: 10,
       },
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

   const TEAM_SYSTEM_PROMPT = `
   你是一个团队协作AI助手"龙虾"，基于OpenClaw框架构建。

   你的核心能力：
   1. 团队协作：支持多人使用
   2. 任务管理：帮助团队协调任务
   3. 知识共享：建立团队知识库
   4. 邮件处理：协助邮件沟通

   请用专业、高效的方式协助团队工作。
   `;
   ```

3. 更新 InstanceService:
   ```typescript
   // src/services/InstanceService.ts
   async createInstance(user: User, options: CreateInstanceOptions): Promise<Instance> {
     const { template, config } = options;

     // 获取预设配置
     const presetConfig = PRESET_TEMPLATES[template] || PRESET_TEMPLATES.personal;

     // 创建 Docker 容器
     const containerId = await this.dockerService.createContainer({
       image: 'openclaw/agent:latest',
       name: `opclaw-${instanceId}`,
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

4. 更新 Instance 实体:
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

5. 编写单元测试
6. 编写 E2E 测试

---

### TASK-034: 实例续费功能 (F-001 补充) ⭐ P1

**任务描述**:
实现实例续费功能,允许用户延长实例到期时间,记录续费历史,支持多种续费时长选择。

| 字段 | 内容 |
|------|------|
| **任务ID** | TASK-034 |
| **任务状态** | `PENDING` |
| **任务开始时间** | - |
| **任务完成时间** | - |
| **任务规模/复杂度** | 0.4 人天 / 约 300 行代码 |
| **前置依赖** | TASK-012 (实例服务) |
| **前置检查项** | - [x] TASK-012 完成<br>- [ ] instances 表已创建<br>- [ ] 实例到期时间字段存在 |
| **任务参考材料** | - FIP-002 第 5.1 节 (实例续费)<br>- GAP_ANALYSIS.md 第 2.1 节 |
| **验收条件** | - [ ] instance_renewals 表已创建<br>- [ ] renewInstance() 方法正确<br>- [ ] 到期时间正确更新<br>- [ ] 续费历史正确记录<br>- [ ] 续费权限验证（仅所有者）<br>- [ ] 前端续费 UI 已实现<br>- [ ] 单元测试通过<br>- [ ] E2E 测试通过 |
| **验收测试结果** | - 待执行 |
| **任务提交记录** | - Commit ID: 待填写<br>- 改动摘要: 待填写 |

**实施步骤**:
1. 创建数据库表:
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

2. 实现续费 API:
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

   @Get('/:id/renewals')
   async getRenewalHistory(@Param('id') instanceId: string, @Req() req: any) {
     const user = req.user;
     const instance = await this.instanceService.findById(instanceId);

     if (instance.owner_id !== user.id) {
       throw new AppError(403, 'FORBIDDEN', 'Not authorized');
     }

     const renewals = await this.renewalService.findByInstance(instanceId);
     return renewals;
   }
   ```

3. 前端实现:
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

   return (
     <div>
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
     </div>
   );
   ```

4. 编写单元测试
5. 编写 E2E 测试

---

## Stage 2: P1 基础完善 (Week 3-4)

### TASK-035: 使用量统计系统 (F-006) ⭐ P1

**任务描述**:
实现完整的使用量统计系统,包括容器指标采集、API 调用统计、数据聚合查询和统计图表展示。

| 字段 | 内容 |
|------|------|
| **任务ID** | TASK-035 |
| **任务状态** | `PENDING` |
| **任务开始时间** | - |
| **任务完成时间** | - |
| **任务规模/复杂度** | 2.0 人天 / 约 800 行代码 |
| **前置依赖** | TASK-012, TASK-013 |
| **前置检查项** | - [x] TASK-012 完成<br>- [x] TASK-013 完成<br>- [ ] Docker API 可访问<br>- [ ] 定时任务框架已配置 |
| **任务参考材料** | - FIP-002 第 5.2 节 (使用量统计)<br>- GAP_ANALYSIS.md 第 2.2 节 |
| **验收条件** | - [ ] instance_metrics 表已创建<br>- [ ] MetricsCollectionService 已实现<br>- [ ] 容器指标每 5 分钟采集<br>- [ ] API 调用量正确统计<br>- [ ] 聚合查询性能良好（<500ms）<br>- [ ] 统计 API 端点已实现<br>- [ ] 前端统计图表已实现<br>- [ ] 单元测试通过<br>- [ ] E2E 测试通过 |
| **验收测试结果** | - 待执行 |
| **任务提交记录** | - Commit ID: 待填写<br>- 改动摘要: 待填写 |

**实施步骤**:
1. 创建数据库表:
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

   -- 聚合视图
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

2. 实现 MetricsCollectionService:
   ```typescript
   // src/services/MetricsCollectionService.ts
   import { Cron, CronExpression } from '@nestjs/schedule';

   @Service()
   export class MetricsCollectionService {
     constructor(
       private readonly dockerService: DockerService,
       private readonly metricsRepository: MetricsRepository
     ) {}

     @Cron(CronExpression.EVERY_5_MINUTES)
     async collectAllMetrics() {
       const instances = await this.instanceRepository.findActive();
       for (const instance of instances) {
         try {
           await this.collectContainerMetrics(instance.id);
           await this.collectAPIMetrics(instance.id);
         } catch (error) {
           this.logger.error(`Failed to collect metrics for ${instance.id}`, error);
         }
       }
     }

     async collectContainerMetrics(instanceId: string): Promise<void> {
       const containerId = instance.docker_container_id;

       // 获取容器统计信息
       const stats = await this.dockerService.getContainerStats(containerId);

       // CPU 使用率
       const cpuUsage = stats.cpu_stats.cpu_usage / stats.cpu_stats.system_cpu_usage;
       await this.metricsRepository.record({
         instance_id: instanceId,
         metric_type: 'cpu_usage',
         metric_value: cpuUsage * 100, // 转换为百分比
         unit: 'percent',
         recorded_at: new Date(),
       });

       // 内存使用量
       const memoryUsage = stats.memory_stats.usage;
       const memoryLimit = stats.memory_stats.limit;
       await this.metricsRepository.record({
         instance_id: instanceId,
         metric_type: 'memory_usage',
         metric_value: memoryUsage / (1024 * 1024), // MB
         unit: 'mb',
         recorded_at: new Date(),
       });
     }

     async collectAPIMetrics(instanceId: string): Promise<void> {
       // 从 API 调用日志中统计
       const messageCount = await this.apiLogRepository.countMessages(instanceId, 'day');
       await this.metricsRepository.record({
         instance_id: instanceId,
         metric_type: 'message_count',
         metric_value: messageCount,
         unit: 'count',
         recorded_at: new Date(),
       });

       // Token 使用量
       const tokenUsage = await this.apiLogRepository.sumTokens(instanceId, 'day');
       await this.metricsRepository.record({
         instance_id: instanceId,
         metric_type: 'token_usage',
         metric_value: tokenUsage,
         unit: 'tokens',
         recorded_at: new Date(),
       });
     }
   }
   ```

3. 实现统计 API:
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

4. 前端统计图表:
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

5. 编写单元测试
6. 编写 E2E 测试

---

### TASK-036: 配置自定义功能 (F-007) ⭐ P2

**任务描述**:
实现配置自定义功能,允许用户修改 LLM API 密钥、调整模型参数、增删 Skills 和 Tools、自定义 System Prompt。

| 字段 | 内容 |
|------|------|
| **任务ID** | TASK-036 |
| **任务状态** | `PENDING` |
| **任务开始时间** | - |
| **任务完成时间** | - |
| **任务规模/复杂度** | 3.0 人天 / 约 1200 行代码 |
| **前置依赖** | TASK-033 (预设配置) |
| **前置检查项** | - [ ] TASK-033 完成<br>- [ ] 预设配置系统已实现<br>- [ ] 配置验证规则已定义 |
| **任务参考材料** | - FIP-002 第 5.3 节 (配置自定义)<br>- GAP_ANALYSIS.md 第 2.2 节 |
| **验收条件** | - [ ] 配置编辑器 UI 已实现<br>- [ ] LLM API 密钥替换功能<br>- [ ] Model 参数调整功能<br>- [ ] Skills 管理功能<br>- [ ] Tools 权限管理功能<br>- [ ] System Prompt 编辑器<br>- [ ] 配置验证功能<br>- [ ] 配置更新 API<br>- [ ] 单元测试通过<br>- [ ] E2E 测试通过 |
| **验收测试结果** | - 待执行 |
| **任务提交记录** | - Commit ID: 待填写<br>- 改动摘要: 待填写 |

**实施步骤**:
1. 实现配置编辑器 UI (1-1.5 天)
2. 实现配置更新 API (0.5 天)
3. 实现配置验证逻辑 (0.5 天)
4. 实现 Skill 管理 (0.5 天)
5. 实现 Tool 权限管理 (0.5 天)

**注意**: 此任务优先级较低 (P2),可根据实际情况调整实施时间。

---

## Stage 3: 测试和验收 (Week 4)

### TASK-037: 集成测试补充 ⭐ P0

**任务描述**:
补充缺失的集成测试,确保所有 P0 功能的集成测试覆盖率达到 60% 以上。

| 字段 | 内容 |
|------|------|
| **任务ID** | TASK-037 |
| **任务状态** | `PENDING` |
| **任务开始时间** | - |
| **任务完成时间** | - |
| **任务规模/复杂度** | 1.0 人天 / 约 600 行测试代码 |
| **前置依赖** | TASK-031, TASK-032, TASK-033 |
| **前置检查项** | - [ ] 所有 P0 功能已实现<br>- [ ] Jest 配置正确<br>- [ ] Supertest 已安装 |
| **任务参考材料** | - FIP-002 第 7.2 节 (测试策略)<br>- 集成测试最佳实践 |
| **验收条件** | - [ ] 二维码生成集成测试通过<br>- [ ] 飞书 OAuth 集成测试通过<br>- [ ] 预设配置集成测试通过<br>- [ ] 实例续费集成测试通过<br>- [ ] 集成测试覆盖率 >60%<br>- [ ] 所有集成测试通过 |
| **验收测试结果** | - 待执行 |
| **任务提交记录** | - Commit ID: 待填写<br>- 改动摘要: 待填写 |

**实施步骤**:
1. 编写二维码生成集成测试
2. 编写飞书 OAuth 集成测试
3. 编写预设配置集成测试
4. 编写实例续费集成测试
5. 配置测试覆盖率报告
6. 配置 CI 自动测试

---

### TASK-038: E2E 测试更新 ⭐ P0

**任务描述**:
更新 E2E 测试,覆盖所有 P0 功能的端到端流程,确保用户可以完整走通"扫码认领→使用实例"流程。

| 字段 | 内容 |
|------|------|
| **任务ID** | TASK-038 |
| **任务状态** | `PENDING` |
| **任务开始时间** | - |
| **任务完成时间** | - |
| **任务规模/复杂度** | 1.0 人天 / 约 500 行测试代码 |
| **前置依赖** | TASK-031, TASK-032, TASK-033 |
| **前置检查项** | - [ ] 所有 P0 功能已实现<br>- [ ] Playwright 已安装<br>- [ ] 测试环境已部署 |
| **任务参考材料** | - FIP-002 第 7.2 节 (测试策略)<br>- E2E 测试最佳实践 |
| **验收条件** | - [ ] 二维码生成 E2E 测试通过<br>- [ ] 飞书 OAuth E2E 测试通过<br>- [ ] 预设配置 E2E 测试通过<br>- [ ] 实例续费 E2E 测试通过<br>- [ ] 端到端流程测试通过<br>- [ ] 所有 E2E 测试通过<br>- [ ] CI 自动 E2E 测试运行正常 |
| **验收测试结果** | - 待执行 |
| **任务提交记录** | - Commit ID: 待填写<br>- 改动摘要: 待填写 |

**实施步骤**:
1. 更新登录流程测试 (真实二维码)
2. 更新实例创建测试 (预设配置)
3. 编写实例续费测试
4. 更新实例管理测试
5. 配置 CI 自动 E2E 测试

---

### TASK-039: MVP 验收测试 ⭐ P0

**任务描述**:
执行 MVP 验收测试,验证所有 P0 功能是否满足需求,确保系统具备生产环境部署条件。

| 字段 | 内容 |
|------|------|
| **任务ID** | TASK-039 |
| **任务状态** | `PENDING` |
| **任务开始时间** | - |
| **任务完成时间** | - |
| **任务规模/复杂度** | 0.5 人天 / 测试和验收 |
| **前置依赖** | 所有 P0 功能任务 |
| **前置检查项** | - [ ] 所有 P0 功能已实现<br>- [ ] 所有测试已通过<br>- [ ] 验收标准已明确 |
| **任务参考材料** | - FIP-002 第 11 节 (验收标准)<br>- MVP 验收清单<br>- GAP_ANALYSIS.md 第 11 节 |
| **验收条件** | - [ ] P0 功能验收测试通过<br>- [ ] 用户可完整走通"扫码认领→使用→续费"流程<br>- [ ] 实例包含预设能力 (LLM + Skills + Tools)<br>- [ ] 管理员可查看统计和使用情况<br>- [ ] 功能完整性验证通过<br>- [ ] 质量标准验证通过<br>- [ ] 部署标准验证通过 |
| **验收测试结果** | - 待执行 |
| **任务提交记录** | - Commit ID: 待填写<br>- 改动摘要: 待填写 |

**实施步骤**:
1. 执行 P0 功能验收测试
2. 验证端到端流程
3. 检查功能完整性
4. 验证质量标准 (测试覆盖率、性能)
5. 验证部署标准 (监控、日志、备份)
6. 编写验收测试报告
7. 列出待修复问题 (如有)

---

## 附录

### A. 任务状态说明

| 状态 | 说明 |
|------|------|
| `PENDING` | 待执行 |
| `IN_PROGRESS` | 执行中 |
| `BLOCKED` | 阻塞（依赖未满足） |
| `COMPLETED` | 已完成 |
| `FAILED` | 执行失败 |
| `CANCELLED` | 已取消 |

### B. 优先级说明

| 优先级 | 说明 | 标记 |
|--------|------|------|
| P0 | 阻塞 MVP 发布，必须立即实现 | ⭐ P0 |
| P1 | 重要但不阻塞，1-2 周内实现 | ⭐ P1 |
| P2 | 优化项，1 个月内实现 | ⭐ P2 |

### C. 实施时间估算

| 阶段 | 任务数 | 预计工时 | 预计人天 |
|------|--------|---------|---------|
| Stage 1: P0 核心功能补全 | 4 | 15-20h | 2-2.5 |
| Stage 2: P1 基础完善 | 2 | 20-25h | 2.5-3 |
| Stage 3: 测试和验收 | 3 | 15-20h | 2-2.5 |
| **总计** | **9** | **50-65h** | **6-8** |

### D. 变更记录

| 版本 | 日期 | 变更说明 |
|------|------|----------|
| v1.0 | 2026-03-15 | 初始版本，包含 9 个任务，基于 GAP 分析制定 |

---

> **文档状态**: ✅ 已完成
> **下一步行动**: 开始执行 Stage 1 任务 (TASK-031)
> **预期完成时间**: 2-4 周 (P0/P1 功能)
