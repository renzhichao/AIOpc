# FIP-003: 关键GAP修复与系统整合实施方案

## 文档信息

| 项目 | 内容 |
|------|------|
| **FIP 编号** | FIP-003 |
| **关联FIP** | FIP-001, FIP-002 |
| **替换FIP** | 替代 FIP-002 (基于真实GAP重新制定) |
| **基于分析** | GAP_ANALYSIS_REAL_20260316.md |
| **标题** | 关键GAP修复与系统整合实施方案 |
| **版本** | v1.0 |
| **创建日期** | 2026-03-16 |
| **作者** | Claude Code |
| **状态** | 草案，待评审 |
| **目标上线** | Week 1-2 (核心功能), Week 3-4 (完整MVP) |

---

## 1. 执行摘要

### 1.1 问题诊断

**FIP-002执行结果**：
- ❌ 声称完成度 88%，实际功能完成度仅 50%
- ❌ 所有任务标记"已完成"，但核心功能不可用
- ❌ E2E测试全部通过，但系统端到端流程走不通

**根本原因**：
1. **Docker集成缺失**：架构核心依赖Docker容器隔离，但完全未实现
2. **环境配置错误**：OAuth URL生成有"undefined"前缀
3. **Mock vs Real**：测试用Mock数据掩盖真实集成问题
4. **任务完成定义错误**：代码实现 ≠ 系统可用

### 1.2 修正目标

**本FIP要解决的问题**：

1. **实现真实Docker集成**：每个实例对应真实Docker容器
2. **修复OAuth流程**：从二维码到用户绑定的完整流程
3. **建立真实集成测试**：使用真实组件验证系统
4. **实现可用MVP**：真正可用的"扫码即用"系统

### 1.3 预期成果

**2-3周内达成**：
- ✅ 用户扫码后可真实认领Docker实例
- ✅ 实例包含可运行的OpenClaw Agent
- ✅ 预设配置实际应用于容器
- ✅ 管理员可查看真实使用指标
- ✅ 系统具备生产环境部署条件

---

## 2. 关键GAP优先级矩阵

### 2.1 重新评估的优先级

基于**阻塞程度**和**实现难度**重新划分：

| 功能 | 实际状态 | 阻塞程度 | 实现难度 | 修正优先级 | 预计工时 |
|------|----------|----------|----------|-----------|----------|
| **Docker容器集成** | 0% 完成 | 🔴 完全阻塞 | 高 | **P0** | 3-4天 |
| **OAuth URL修复** | 70% 完成 | 🔴 阻塞认证 | 低 | **P0** | 2小时 |
| **配置真实应用** | 50% 完成 | 🔴 阻塞功能 | 中 | **P0** | 1天 |
| **实例生命周期** | 40% 完成 | 🔴 核心功能 | 高 | **P0** | 2天 |
| **真实集成测试** | 20% 完成 | 🟡 质量风险 | 中 | **P1** | 2天 |
| **指标采集运行** | 20% 完成 | 🟡 运营盲区 | 中 | **P1** | 1天 |
| **API路由规范** | 90% 完成 | 🟢 小问题 | 低 | **P2** | 30分钟 |
| **UI图表完善** | 70% 完成 | 🟢 体验优化 | 低 | **P2** | 1天 |

### 2.2 依赖关系图

```
┌─────────────────────────────────────────────────────┐
│                  P0: 核心阻塞项                      │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐      │
│  │  Docker  │───→│ Instance │───→│  OAuth   │      │
│  │ Integration│   │ Lifecycle│    │   Flow   │      │
│  └──────────┘    └──────────┘    └──────────┘      │
│       ↓                ↓                ↓            │
└─────────────────────────────────────────────────────┘
        │                │                │
        ↓                ↓                ↓
┌─────────────────────────────────────────────────────┐
│                  P1: 重要完善项                      │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐      │
│  │   Real   │    │ Metrics  │    │  Config  │      │
│  │   Tests  │    │Collection│    │Propagation│    │
│  └──────────┘    └──────────┘    └──────────┘      │
└─────────────────────────────────────────────────────┘
```

---

## 3. P0级关键修复方案

### 3.1 Docker容器集成（架构核心）

#### 3.1.1 问题分析

**现状**：
```typescript
// src/services/DockerService.ts
export class DockerService {
  async createContainer(options: ContainerOptions): Promise<string> {
    // 🔴 当前只返回mock ID，没有真实Docker操作
    return `mock-container-${Date.now()}`;
  }
}
```

**影响**：
- ❌ 实例无法实际运行
- ❌ 资源隔离无法实现
- ❌ 配置无法应用
- ❌ 整个平台架构失效

#### 3.1.2 实施方案

**架构设计**：

```
┌─────────────────────────────────────────────────┐
│              Application Layer                   │
│  ┌──────────────────────────────────────────┐  │
│  │         InstanceService                   │  │
│  │  - createInstance()                      │  │
│  │  - startInstance()                       │  │
│  │  - stopInstance()                        │  │
│  └──────────┬───────────────────────────────┘  │
│             ↓                                   │
│  ┌──────────────────────────────────────────┐  │
│  │         DockerService (NEW)              │  │
│  │  - Docker daemon connection              │  │
│  │  - Container lifecycle                   │  │
│  │  - Resource management                   │  │
│  │  - Health checks                         │  │
│  └──────────┬───────────────────────────────┘  │
└─────────────┼───────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────────┐
│              Docker Daemon                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │Container │  │Container │  │Container │     │
│  │  #001    │  │  #002    │  │  #003    │     │
│  │(opclaw-1)│  │(opclaw-2)│  │(opclaw-3)│     │
│  └──────────┘  └──────────┘  └──────────┘     │
│       ↓            ↓            ↓               │
│  OpenClaw     OpenClaw     OpenClaw            │
│   Agent        Agent        Agent               │
└─────────────────────────────────────────────────┘
```

**实现步骤** (3-4天):

**Step 1: Docker环境准备** (0.5天)

```yaml
# docker-compose.yml 需要添加
services:
  backend:
    # ... 现有配置
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock  # 🔴 关键
    environment:
      - DOCKER_HOST=unix:///var/run/docker.sock
```

**Step 2: DockerService实现** (1.5天)

```typescript
// src/services/DockerService.ts
import Docker from 'dockerode';

@Service()
export class DockerService {
  private docker: Docker;
  private networkId: string;

  constructor() {
    // 连接Docker daemon
    this.docker = new Docker({
      socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock'
    });
  }

  async initializeNetwork(): Promise<void> {
    // 创建opclaw网络（容器间通信）
    const network = await this.docker.createNetwork({
      Name: 'opclaw-network',
      Driver: 'bridge',
      Internal: false,
      ConfigFrom: {
        Network: 'opclaw-network'
      }
    });
    this.networkId = network.id;
  }

  async createContainer(options: {
    instanceId: string;
    config: InstancePresetConfig;
    apiKey: string;
  }): Promise<string> {
    const { instanceId, config, apiKey } = options;

    // 🔴 真实创建容器
    const container = await this.docker.createContainer({
      name: `opclaw-${instanceId}`,
      Image: 'openclaw/agent:latest',  // 需要构建/拉取
      Env: [
        `INSTANCE_ID=${instanceId}`,
        `LLM_API_KEY=${apiKey}`,
        `LLM_API_BASE=${config.llm.api_base}`,
        `LLM_MODEL=${config.llm.model}`,
        `LLM_TEMPERATURE=${config.llm.temperature}`,
        `LLM_MAX_TOKENS=${config.llm.max_tokens}`,
        `ENABLED_SKILLS=${JSON.stringify(config.skills.filter(s => s.enabled).map(s => s.name))}`,
        `ENABLED_TOOLS=${JSON.stringify(config.tools.filter(t => t.enabled).map(t => t.name))}`,
        `SYSTEM_PROMPT=${config.system_prompt}`,
      ],
      HostConfig: {
        NetworkMode: 'opclaw-network',
        Memory: 512 * 1024 * 1024,  // 512MB limit
        MemorySwap: 1024 * 1024 * 1024,  // 1GB swap
        CpuQuota: 50000,  // 50% CPU
        CpuPeriod: 100000,
        RestartPolicy: {
          Name: 'unless-stopped'
        },
        LogConfig: {
          Type: 'json-file',
          Config: {
            'max-size': '10m',
            'max-file': '3'
          }
        }
      },
      Labels: {
        'com.openclaw.instance-id': instanceId,
        'com.openclaw.managed': 'true',
        'com.openclaw.created-at': new Date().toISOString()
      }
    });

    // 启动容器
    await container.start();

    return container.id;
  }

  async getContainerStats(containerId: string): Promise<{
    cpuUsage: number;
    memoryUsage: number;
    status: string;
  }> {
    const container = this.docker.getContainer(containerId);
    const stats = await container.stats({ stream: false });

    // 计算CPU使用率
    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    const cpuUsage = (cpuDelta / systemDelta) * 100;

    // 计算内存使用
    const memoryUsage = stats.memory_stats.usage / (1024 * 1024); // MB

    // 获取状态
    const info = await container.inspect();
    const status = info.State.Status;

    return { cpuUsage, memoryUsage, status };
  }

  async stopContainer(containerId: string): Promise<void> {
    const container = this.docker.getContainer(containerId);
    await container.stop({ t: 10 });  // 10秒优雅停止
  }

  async startContainer(containerId: string): Promise<void> {
    const container = this.docker.getContainer(containerId);
    await container.start();
  }

  async removeContainer(containerId: string): Promise<void> {
    const container = this.docker.getContainer(containerId);
    await container.remove({ force: true, v: true });  // 强制删除并删除volumes
  }

  async listOpenClawContainers(): Promise<Array<{
    id: string;
    name: string;
    instanceId: string;
    status: string;
    createdAt: Date;
  }>> {
    const containers = await this.docker.listContainers({ all: true });

    return containers
      .filter(c => c.Labels['com.openclaw.managed'] === 'true')
      .map(c => ({
        id: c.Id,
        name: c.Names[0],
        instanceId: c.Labels['com.openclaw.instance-id'],
        status: c.State,
        createdAt: new Date(c.Created * 1000)
      }));
  }

  async getContainerLogs(containerId: string, tail: number = 100): Promise<string> {
    const container = this.docker.getContainer(containerId);
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail,
      timestamps: true
    });
    return logs.toString('utf-8');
  }

  async executeInContainer(containerId: string, command: string[]): Promise<{
    exitCode: number;
    output: string;
  }> {
    const container = this.docker.getContainer(containerId);
    const exec = await container.exec({
      Cmd: command,
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ Detach: false });
    const chunks: Buffer[] = [];

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('error', reject);
      stream.on('end', async () => {
        const info = await exec.inspect();
        resolve({
          exitCode: info.ExitCode || 0,
          output: Buffer.concat(chunks).toString('utf-8')
        });
      });
    });
  }
}
```

**Step 3: 镜像准备** (0.5天)

```dockerfile
# docker/openclaw-agent/Dockerfile
FROM node:22-alpine

WORKDIR /app

# 安装依赖（使用实际OpenClaw代码）
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install

# 复制OpenClaw Agent代码
COPY . .

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 启动Agent
CMD ["node", "dist/index.js"]
```

```yaml
# docker-compose.yml 添加构建配置
services:
  opclaw-agent-builder:
    build:
      context: ./openclaw-agent
      dockerfile: Dockerfile
    image: openclaw/agent:latest
```

**Step 4: 实例服务集成** (0.5天)

```typescript
// src/services/InstanceService.ts 更新
async createInstance(user: User, options: CreateInstanceOptions): Promise<Instance> {
  const { template } = options;

  // 1. 获取预设配置
  const presetConfig = PRESET_TEMPLATES[template] || PRESET_TEMPLATES.personal;

  // 2. 生成API密钥
  const apiKey = await this.apiKeyService.createApiKey(user.id, {
    name: `Instance ${template} Key`,
    scopes: ['instance:read', 'instance:write']
  });

  // 3. 创建Docker容器 (🔴 真实集成)
  const containerId = await this.dockerService.createContainer({
    instanceId: instanceId,
    config: presetConfig,
    apiKey: apikey.key
  });

  // 4. 创建实例记录
  const instance = await this.instanceRepository.create({
    id: instanceId,
    owner_id: user.id,
    template,
    status: 'initializing',
    docker_container_id: containerId,
    config: presetConfig,
    api_key_id: apiKey.id,
    created_at: new Date(),
    expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000),
  });

  // 5. 等待容器就绪
  await this.waitForContainerReady(containerId);

  // 6. 更新状态
  instance.status = 'active';
  await this.instanceRepository.update(instanceId, instance);

  return instance;
}

private async waitForContainerReady(containerId: string): Promise<void> {
  const maxWait = 60000; // 60秒
  const interval = 2000; // 2秒
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    try {
      const stats = await this.dockerService.getContainerStats(containerId);
      if (stats.status === 'running') {
        return;
      }
    } catch (error) {
      // 容器可能还在启动中
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error(`Container ${containerId} failed to start within ${maxWait}ms`);
}

async startInstance(instanceId: string): Promise<void> {
  const instance = await this.findById(instanceId);

  if (!instance.docker_container_id) {
    throw new Error('Instance has no container associated');
  }

  // 🔴 真实启动Docker容器
  await this.dockerService.startContainer(instance.docker_container_id);

  // 更新状态
  instance.status = 'active';
  await this.instanceRepository.update(instanceId, instance);
}

async stopInstance(instanceId: string): Promise<void> {
  const instance = await this.findById(instanceId);

  if (!instance.docker_container_id) {
    throw new Error('Instance has no container associated');
  }

  // 🔴 真实停止Docker容器
  await this.dockerService.stopContainer(instance.docker_container_id);

  // 更新状态
  instance.status = 'stopped';
  await this.instanceRepository.update(instanceId, instance);
}

async deleteInstance(instanceId: string): Promise<void> {
  const instance = await this.findById(instanceId);

  if (instance.docker_container_id) {
    // 🔴 真实删除Docker容器
    await this.dockerService.removeContainer(instance.docker_container_id);
  }

  // 删除API密钥
  if (instance.api_key_id) {
    await this.apiKeyService.revoke(instance.api_key_id);
  }

  // 删除实例记录
  await this.instanceRepository.delete(instanceId);
}
```

**Step 5: 健康检查更新** (0.5天)

```typescript
// src/controllers/HealthCheckController.ts
export class HealthCheckController {
  @Get('/health')
  async healthCheck(): Promise<HealthStatus> {
    // 检查Docker连接
    const dockerConnected = await this.dockerService.checkConnection();

    // 检查OpenClaw容器
    const containers = await this.dockerService.listOpenClawContainers();
    const runningCount = containers.filter(c => c.status === 'running').length;

    return {
      status: dockerConnected ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: await this.checkDatabase(),
      redis: await this.checkRedis(),
      docker: dockerConnected ? 'connected' : 'disconnected',
      containers: {
        total: containers.length,
        running: runningCount,
        stopped: containers.length - runningCount
      }
    };
  }
}
```

**验证标准**：
- ✅ 可以创建真实Docker容器
- ✅ 容器可以启动/停止/删除
- ✅ 容器资源限制生效
- ✅ 容器日志可查看
- ✅ 健康检查显示Docker状态
- ✅ 环境变量正确注入到容器

#### 3.1.3 测试计划

```typescript
// tests/integration/DockerService.integration.test.ts
describe('DockerService Integration', () => {
  test('should create real container', async () => {
    const containerId = await dockerService.createContainer({
      instanceId: 'test-001',
      config: presetConfig,
      apiKey: 'test-key'
    });

    expect(containerId).toBeTruthy();

    // 验证容器真实存在
    const container = dockerService.docker.getContainer(containerId);
    const info = await container.inspect();
    expect(info.State.Status).toBe('running');
  });

  test('should enforce resource limits', async () => {
    const stats = await dockerService.getContainerStats(containerId);

    // 验证内存限制
    expect(stats.memoryUsage).toBeLessThan(512);  // MB
    expect(stats.cpuUsage).toBeLessThan(60);  // %
  });
});
```

---

### 3.2 OAuth URL修复（认证入口）

#### 3.2.1 问题分析

**现状**：
```bash
$ curl "http://localhost:3000/api/oauth/authorize?redirect_uri=http://localhost:5173/oauth/callback"
{
  "url": "undefined?app_id=cli_a93ce5614ce11bd6&..."
}
```

**根本原因**：
```typescript
// src/services/OAuthService.ts 大约第24行
async getAuthorizeUrl(state: string): Promise<string> {
  const baseUrl = process.env.FEISHU_BASE_URL;  // 🔴 未设置

  return `${baseUrl}/authorize?` +  // 结果: "undefined/authorize?"
    `app_id=${process.env.FEISHU_APP_ID}&` +
    `redirect_uri=${process.env.FEISHU_REDIRECT_URI}&` +
    `scope=${this.scope}&` +
    `state=${state}`;
}
```

#### 3.2.2 实施方案

**修复步骤** (2小时):

**Step 1: 修复环境变量** (30分钟)

```bash
# .env.production 添加
FEISHU_BASE_URL=https://open.feishu.cn/open-apis/authen/v1
FEISHU_APP_ID=cli_a93ce5614ce11bd6
FEISHU_APP_SECRET=your_secret_here
FEISHU_REDIRECT_URI=http://localhost:5173/oauth/callback
FEISHU_ENCRYPT_KEY=your_encrypt_key_here
FEISHU_VERIFICATION_TOKEN=your_verification_token_here
```

**Step 2: 修复URL构建逻辑** (30分钟)

```typescript
// src/services/OAuthService.ts
export class OAuthService {
  private readonly FEISHU_BASE_URL = 'https://open.feishu.cn/open-apis/authen/v1';
  private readonly FEISHU_API_URL = 'https://open.feishu.cn/open-apis';

  constructor() {
    // 🔴 使用默认值，防止环境变量缺失
    this.FEISHU_BASE_URL = process.env.FEISHU_BASE_URL || this.FEISHU_BASE_URL;
  }

  async getAuthorizeUrl(state: string): Promise<string> {
    const params = new URLSearchParams({
      app_id: process.env.FEISHU_APP_ID!,
      redirect_uri: process.env.FEISHU_REDIRECT_URI!,
      scope: 'contact:user.base:readonly contact:user.email:readonly',
      state: state,
    });

    return `${this.FEISHU_BASE_URL}/authorize?${params.toString()}`;
  }

  // 🔴 添加URL验证
  private validateUrl(url: string): void {
    try {
      new URL(url);
    } catch (error) {
      throw new AppError(
        500,
        'INVALID_URL',
        `Generated OAuth URL is invalid: ${url}`,
        { url }
      );
    }
  }
}
```

**Step 3: 添加URL验证中间件** (30分钟)

```typescript
// src/middleware/validateOAuth.ts
export function validateOAuthUrl(req: Request, res: Response, next: NextFunction) {
  const redirectUri = req.query.redirect_uri as string;

  // 验证redirect_uri在白名单中
  const allowedUris = process.env.ALLOWED_REDIRECT_URIS?.split(',') || [
    'http://localhost:5173/oauth/callback',
    'https://your-domain.com/oauth/callback'
  ];

  if (!allowedUris.includes(redirectUri)) {
    throw new AppError(400, 'INVALID_REDIRECT_URI', 'Redirect URI not allowed');
  }

  next();
}

// src/controllers/OAuthController.ts
@Get('authorize')
@UseBefore(validateOAuthUrl)
async authorize(@QueryParam('redirect_uri') redirectUri: string) {
  // ...
}
```

**Step 4: 端到端测试** (30分钟)

```bash
# 测试OAuth URL生成
curl "http://localhost:3000/api/oauth/authorize?redirect_uri=http://localhost:5173/oauth/callback"

# 期望输出:
{
  "url": "https://open.feishu.cn/open-apis/authen/v1/authorize?app_id=cli_...&redirect_uri=http%3A%2F%2Flocalhost%3A5173%2Foauth%2Fcallback&scope=contact%3Auser.base%3Areadonly&state=..."
}
```

**验证标准**：
- ✅ URL不包含"undefined"
- ✅ URL可以被飞书识别
- ✅ redirect_uri白名单验证
- ✅ state参数包含防伪签名

---

### 3.3 配置真实应用（开箱即用）

#### 3.3.1 问题分析

**现状**：
```typescript
// 配置保存到数据库
instance.config = presetConfig;  // ✅ 已实现

// 但未应用到实际运行环境
// 🔴 缺失：容器环境变量、运行时配置
```

#### 3.3.2 实施方案

**与3.1 Docker集成配合实现**：

```typescript
// src/services/DockerService.ts (已在3.1中定义)
async createContainer(options: {
  instanceId: string;
  config: InstancePresetConfig;
  apiKey: string;
}): Promise<string> {
  const { instanceId, config, apiKey } = options;

  const container = await this.docker.createContainer({
    name: `opclaw-${instanceId}`,
    Image: 'openclaw/agent:latest',
    Env: [
      // 🔴 LLM配置
      `LLM_API_KEY=${apiKey}`,
      `LLM_API_BASE=${config.llm.api_base}`,
      `LLM_MODEL=${config.llm.model}`,
      `LLM_TEMPERATURE=${config.llm.temperature}`,
      `LLM_MAX_TOKENS=${config.llm.max_tokens}`,

      // 🔴 Skills配置
      `ENABLED_SKILLS=${JSON.stringify(
        config.skills.filter(s => s.enabled).map(s => s.name)
      )}`,

      // 🔴 Tools配置
      `ENABLED_TOOLS=${JSON.stringify(
        config.tools.filter(t => t.enabled).map(t => t.name)
      )}`,

      // 🔴 System Prompt
      `SYSTEM_PROMPT=${config.system_prompt}`,

      // 🔴 配额限制
      `MAX_MESSAGES_PER_DAY=${config.limits.max_messages_per_day}`,
      `MAX_STORAGE_MB=${config.limits.max_storage_mb}`,
    ],
    // ... 其他配置
  });

  return container.id;
}
```

**OpenClaw Agent启动逻辑**：

```typescript
// openclaw-agent/src/index.ts (Agent内部代码)
import { OpenClawAgent } from '@openclaw/sdk';

const agent = new OpenClawAgent({
  llm: {
    apiKey: process.env.LLM_API_KEY,
    apiBase: process.env.LLM_API_BASE,
    model: process.env.LLM_MODEL,
    temperature: parseFloat(process.env.LLM_TEMPERATURE),
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS),
  },

  skills: JSON.parse(process.env.ENABLED_SKILLS || '[]'),

  tools: {
    read: true,
    write: true,
    web_search: true,
    memory: true,
    // Layer 2 tools需要额外权限
    exec: process.env.ENABLE_LAYER_2_TOOLS === 'true',
  },

  systemPrompt: process.env.SYSTEM_PROMPT,

  limits: {
    maxMessagesPerDay: parseInt(process.env.MAX_MESSAGES_PER_DAY),
    maxStorageMB: parseInt(process.env.MAX_STORAGE_MB),
  },
});

// 🔴 启动Agent
agent.start();
```

**配置热重载**（可选）：

```typescript
// src/services/ConfigReloadService.ts
@Service()
export class ConfigReloadService {
  async reloadConfig(instanceId: string): Promise<void> {
    const instance = await this.instanceService.findById(instanceId);

    // 1. 获取最新配置
    const config = instance.config;

    // 2. 更新容器环境变量
    await this.dockerService.updateContainerEnv(
      instance.docker_container_id,
      {
        LLM_MODEL: config.llm.model,
        LLM_TEMPERATURE: config.llm.temperature.toString(),
        ENABLED_SKILLS: JSON.stringify(config.skills.filter(s => s.enabled).map(s => s.name)),
        // ... 其他配置
      }
    );

    // 3. 发送SIGHUP信号重载配置
    await this.dockerService.signalContainer(
      instance.docker_container_id,
      'SIGHUP'
    );
  }
}
```

**验证标准**：
- ✅ 容器启动时配置生效
- ✅ Agent使用正确的LLM配置
- ✅ Skills和Tools按配置启用
- ✅ System Prompt正确设置
- ✅ 配额限制生效

---

## 4. P1级重要完善方案

### 4.1 真实集成测试

#### 4.1.1 测试策略

**当前问题**：
```typescript
// tests/unit/InstanceService.test.ts
describe('InstanceService', () => {
  test('should create instance', async () => {
    // 🔴 使用mock DockerService
    const mockDockerService = {
      createContainer: jest.fn().mockResolvedValue('mock-container-id')
    };

    // 测试通过，但真实功能不工作
    const instance = await instanceService.createInstance(user, options);
    expect(instance.docker_container_id).toBe('mock-container-id');
  });
});
```

**新的测试策略**：

```
┌─────────────────────────────────────────────────┐
│              测试金字塔 (修订版)                  │
│  ┌─────────┐                                    │
│  │ E2E测试  │  10% - 真实环境端到端测试          │
│  │ (真实)  │     - Docker容器                   │
│  ├─────────┤     - 真实数据库                   │
│  │集成测试  │  30% - 组件集成测试                │
│  │ (真实)  │     - API + Service + Repository   │
│  ├─────────┤     - 真实Docker操作                │
│  │单元测试  │  60% - 逻辑单元测试                │
│  │ (Mock)  │     - 纯函数逻辑                   │
│  └─────────┘     - 可使用Mock                    │
└─────────────────────────────────────────────────┘
```

#### 4.1.2 实施步骤 (2天)

**Step 1: 集成测试环境准备** (0.5天)

```yaml
# docker-compose.test.yml
version: '3.8'
services:
  test-db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: opclaw_test
      POSTGRES_USER: opclaw
      POSTGRES_PASSWORD: test_password
    ports:
      - "5433:5432"

  test-redis:
    image: redis:7-alpine
    ports:
      - "6380:6379"

  test-docker:
    image: docker:dind
    privileged: true
    environment:
      DOCKER_TLS_CERTDIR: ""
    ports:
      - "2376:2375"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
```

**Step 2: 真实集成测试** (1天)

```typescript
// tests/integration/InstanceCreation.integration.test.ts
describe('Instance Creation - Real Integration', () => {
  let testUser: User;
  let dockerService: DockerService;
  let instanceService: InstanceService;

  beforeAll(async () => {
    // 🔴 使用真实数据库
    await setupTestDatabase();

    // 🔴 使用真实Docker
    dockerService = new DockerService();
    await dockerService.initializeNetwork();

    instanceService = new InstanceService(dockerService);
  });

  test('should create real Docker container', async () => {
    const instance = await instanceService.createInstance(testUser, {
      template: 'personal',
      config: {}
    });

    // 验证容器真实存在
    const containers = await dockerService.listOpenClawContainers();
    const container = containers.find(c => c.instanceId === instance.id);

    expect(container).toBeDefined();
    expect(container.status).toBe('running');

    // 验证环境变量
    const env = await dockerService.getContainerEnv(container.id);
    expect(env.LLM_MODEL).toBe('deepseek-chat');
  });

  test('should enforce resource limits', async () => {
    const stats = await dockerService.getContainerStats(containerId);

    expect(stats.memoryUsage).toBeLessThan(512);  // MB
    expect(stats.cpuUsage).toBeLessThan(60);  // %
  });

  test('should apply preset configuration', async () => {
    const config = await instanceService.getInstanceConfig(instance.id);

    expect(config.llm.model).toBe('deepseek-chat');
    expect(config.skills).toHaveLength(6);
    expect(config.tools).toHaveLength(4);
  });

  afterAll(async () => {
    // 清理测试容器
    const containers = await dockerService.listOpenClawContainers();
    for (const container of containers) {
      await dockerService.removeContainer(container.id);
    }

    // 清理测试数据库
    await cleanupTestDatabase();
  });
});
```

**Step 3: 端到端测试** (0.5天)

```typescript
// tests/e2e/complete-user-journey.e2e.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Complete User Journey', () => {
  test('should complete scan-to-use flow', async ({ page, context }) => {
    // 1. 访问登录页
    await page.goto('/login');

    // 2. 获取二维码
    const qrCodeUrl = await page.locator('[data-testid="qr-code-url"]').textContent();
    expect(qrCodeUrl).toContain('https://open.feishu.cn/open-apis/authen/v1/authorize');
    expect(qrCodeUrl).not.toContain('undefined');

    // 3. 模拟飞书OAuth回调
    const authCode = 'test_auth_code_' + Math.random();
    const state = new URL(qrCodeUrl).searchParams.get('state');

    const callbackResponse = await context.request.post('/api/oauth/callback', {
      data: { code: authCode, state }
    });

    expect(callbackResponse.ok()).toBeTruthy();

    // 4. 验证用户登录
    await page.goto('/dashboard');
    await expect(page.locator('[data-testid="user-name"]')).toBeVisible();

    // 5. 创建实例
    await page.click('[data-testid="create-instance-button"]');
    await page.selectOption('[data-testid="template-select"]', 'personal');
    await page.click('[data-testid="submit-button"]');

    // 6. 等待实例创建完成（包括Docker容器启动）
    await expect(page.locator('[data-testid="instance-status"]')).toHaveText('active', { timeout: 60000 });

    // 7. 验证实例可访问
    const instanceId = await page.locator('[data-testid="instance-id"]').textContent();
    const response = await context.request.get(`/api/instances/${instanceId}`);
    expect(response.ok()).toBeTruthy();
  });
});
```

**验证标准**：
- ✅ 集成测试使用真实数据库
- ✅ 集成测试创建真实Docker容器
- ✅ E2E测试走通完整流程
- ✅ 测试覆盖率 >60%

---

### 4.2 指标采集运行

#### 4.2.1 问题分析

**现状**：
```typescript
// src/services/MetricsCollectionService.ts
@Service()
export class MetricsCollectionService {
  @Cron(CronExpression.EVERY_5_MINUTES)
  async collectAllMetrics() {
    // 🔴 定时任务未注册
    // 代码存在但不执行
  }
}
```

**原因**：
- `node-cron` 或 `@nestjs/schedule` 未正确配置
- CronJob未在应用启动时注册

#### 4.2.2 实施方案 (1天)

**Step 1: 配置定时任务** (0.5天)

```typescript
// src/app.ts
import { CronJob } from 'cron';

export class App {
  private scheduledJobs: CronJob[] = [];

  private initializeScheduledTasks(): void {
    logger.info('Initializing scheduled tasks...');

    // 🔴 注册指标采集任务
    const metricsJob = new CronJob(
      '*/5 * * * *',  // 每5分钟
      async () => {
        try {
          await this.metricsCollectionService.collectAllMetrics();
          logger.info('Metrics collection completed');
        } catch (error) {
          logger.error('Metrics collection failed', error);
        }
      },
      null,
      true,
      'Asia/Shanghai'
    );

    this.scheduledJobs.push(metricsJob);

    // 注册其他定时任务
    // - 健康检查任务
    // - 过期实例检查
    // - 旧数据清理

    logger.info(`Registered ${this.scheduledJobs.length} scheduled tasks`);
  }

  public async shutdown(): Promise<void> {
    logger.info('Shutting down scheduled tasks...');
    this.scheduledJobs.forEach(job => job.stop());
    this.scheduledJobs = [];
  }
}
```

**Step 2: 实现指标采集** (0.5天)

```typescript
// src/services/MetricsCollectionService.ts
@Service()
export class MetricsCollectionService {
  constructor(
    private readonly dockerService: DockerService,
    private readonly metricsRepository: MetricsRepository,
    private readonly instanceRepository: InstanceRepository
  ) {}

  async collectAllMetrics(): Promise<void> {
    logger.info('Starting metrics collection...');

    // 获取所有active实例
    const instances = await this.instanceRepository.findActive();

    logger.info(`Collecting metrics for ${instances.length} instances`);

    for (const instance of instances) {
      try {
        await this.collectInstanceMetrics(instance.id);
      } catch (error) {
        logger.error(`Failed to collect metrics for instance ${instance.id}`, error);
        // 继续处理其他实例，不中断
      }
    }

    logger.info('Metrics collection completed');
  }

  async collectInstanceMetrics(instanceId: string): Promise<void> {
    const instance = await this.instanceRepository.findById(instanceId);

    if (!instance.docker_container_id) {
      logger.warn(`Instance ${instanceId} has no container, skipping metrics`);
      return;
    }

    // 1. 采集容器指标
    const containerStats = await this.dockerService.getContainerStats(
      instance.docker_container_id
    );

    // 记录CPU使用率
    await this.metricsRepository.record({
      instance_id: instanceId,
      metric_type: 'cpu_usage',
      metric_value: containerStats.cpuUsage,
      unit: 'percent',
      recorded_at: new Date(),
    });

    // 记录内存使用
    await this.metricsRepository.record({
      instance_id: instanceId,
      metric_type: 'memory_usage',
      metric_value: containerStats.memoryUsage,
      unit: 'mb',
      recorded_at: new Date(),
    });

    // 2. 采集API调用指标（从日志或API网关）
    // TODO: 实现API调用量统计

    logger.debug(`Collected metrics for instance ${instanceId}`);
  }
}
```

**Step 3: 验证定时任务** (已在Docker集成中)

```bash
# 查看日志，确认定时任务运行
$ docker logs opclaw-backend --tail 100

# 期望输出:
[2026-03-16 10:00:00] INFO: Starting metrics collection...
[2026-03-16 10:00:01] INFO: Collecting metrics for 5 instances
[2026-03-16 10:00:03] INFO: Metrics collection completed
```

**验证标准**：
- ✅ 定时任务每5分钟执行
- ✅ 容器指标正确采集
- ✅ 数据正确存储到数据库
- ✅ 错误不中断其他实例采集

---

## 5. P2级优化方案

### 5.1 API路由规范 (30分钟)

**问题**：`/api/health` 返回404，不一致的API结构

**修复**：

```typescript
// src/routes/index.ts
export class ApiRoutes {
  static register(app: Express): void {
    // 🔴 添加 /api 前缀路由
    const apiRouter = Router();

    // 健康检查
    apiRouter.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: 'connected',
        redis: 'connected',
        docker: 'connected'  // 添加Docker状态
      });
    });

    // 其他API路由
    apiRouter.use('/instances', instanceRoutes);
    apiRouter.use('/oauth', oauthRoutes);
    apiRouter.use('/metrics', metricsRoutes);

    // 挂载到 /api
    app.use('/api', apiRouter);
  }
}
```

---

### 5.2 UI图表完善 (1天)

**实施**：

```typescript
// src/pages/InstanceDetailPage.tsx
const InstanceMetrics = ({ instance }: { instance: Instance }) => {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      setLoading(true);
      const response = await fetch(`/api/instances/${instance.id}/metrics?period=24h`);
      const data = await response.json();
      setMetrics(data.data);
      setLoading(false);
    };

    fetchMetrics();
    // 每30秒刷新
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, [instance.id]);

  if (loading) return <div>加载中...</div>;

  return (
    <div className="metrics-dashboard">
      {/* CPU使用率图表 */}
      <MetricCard
        title="CPU使用率"
        value={metrics?.avgCpuUsage}
        unit="%"
        data={metrics?.cpuHistory}
      />

      {/* 内存使用图表 */}
      <MetricCard
        title="内存使用"
        value={metrics?.avgMemoryUsage}
        unit="MB"
        data={metrics?.memoryHistory}
      />

      {/* API调用统计 */}
      <MetricCard
        title="API调用"
        value={metrics?.totalApiCalls}
        unit="次"
        data={metrics?.apiCallsHistory}
      />
    </div>
  );
};
```

---

## 6. 部署与验证

### 6.1 环境准备清单

```bash
# 1. Docker环境
sudo systemctl start docker
sudo systemctl enable docker
docker --version

# 2. Docker Compose
docker compose version

# 3. 环境变量
cp .env.example .env.production
# 编辑 .env.production，填入真实凭证

# 4. 飞书开放平台
# - 创建应用: https://open.feishu.cn/app/
# - 获取 App ID 和 App Secret
# - 配置回调地址: https://your-domain.com/oauth/callback

# 5. DeepSeek API
# - 申请API Key: https://platform.deepseek.com/
# - 配置到 .env.production
```

### 6.2 部署步骤

```bash
# 1. 构建镜像
docker compose build

# 2. 启动服务
docker compose up -d

# 3. 等待服务就绪
./scripts/wait-for-healthy.sh

# 4. 运行迁移
docker compose exec backend pnpm db:migrate

# 5. 运行测试
docker compose exec backend pnpm test:integration
docker compose exec backend pnpm test:e2e

# 6. 验证健康检查
curl http://localhost:3000/health
curl http://localhost:3000/api/health
```

### 6.3 验收清单

#### P0功能验收

- [ ] **Docker集成**
  - [ ] 可以创建真实Docker容器
  - [ ] 容器可以启动/停止/删除
  - [ ] 资源限制生效
  - [ ] 容器日志可查看

- [ ] **OAuth流程**
  - [ ] 二维码URL正确（无"undefined"）
  - [ ] 可以跳转到飞书授权页
  - [ ] 授权回调正确处理
  - [ ] 用户信息正确获取
  - [ ] 实例绑定成功

- [ ] **配置应用**
  - [ ] 预设配置应用到容器
  - [ ] LLM配置生效
  - [ ] Skills和Tools正确启用
  - [ ] System Prompt正确

- [ ] **实例管理**
  - [ ] 可以创建实例
  - [ ] 可以启动实例
  - [ ] 可以停止实例
  - [ ] 可以删除实例
  - [ ] 可以续费实例

#### P1功能验收

- [ ] **指标采集**
  - [ ] 定时任务运行
  - [ ] 容器指标采集
  - [ ] 数据正确存储
  - [ ] 统计API返回数据

- [ ] **真实测试**
  - [ ] 集成测试通过
  - [ ] E2E测试通过
  - [ ] 测试覆盖率 >60%

---

## 7. 风险与缓解

### 7.1 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| Docker API不稳定 | 高 | 中 | 实现重试机制，健康检查 |
| OpenClaw Agent镜像不存在 | 高 | 中 | 预先构建和测试镜像 |
| 资源限制不生效 | 中 | 低 | 使用cgroups严格限制 |
| 容器逃逸风险 | 高 | 低 | 安全基线，只读文件系统 |

### 7.2 实施风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| Docker daemon权限问题 | 高 | 中 | 提前配置，添加用户到docker组 |
| 网络配置问题 | 中 | 中 | 简化网络，使用bridge模式 |
| 环境变量配置错误 | 高 | 中 | 提供配置检查脚本 |
| 估计时间不足 | 中 | 中 | 分阶段实施，优先P0 |

---

## 8. 成本与时间估算

### 8.1 工时估算

| 任务 | 工时 | 人天 | 优先级 |
|------|------|------|--------|
| Docker容器集成 | 28-32h | 3.5-4 | P0 |
| OAuth URL修复 | 2h | 0.25 | P0 |
| 配置真实应用 | 8h | 1 | P0 |
| 实例生命周期 | 16h | 2 | P0 |
| 真实集成测试 | 16h | 2 | P1 |
| 指标采集运行 | 8h | 1 | P1 |
| API路由规范 | 0.5h | 0.06 | P2 |
| UI图表完善 | 8h | 1 | P2 |
| **总计** | **86.5h** | **10.8** | - |

### 8.2 分阶段计划

**Phase 1: 核心阻塞修复 (Week 1)** - 5-6天
- Docker集成 (3.5-4天)
- OAuth修复 (0.25天)
- 配置应用 (1天)

**Phase 2: 功能完善 (Week 2)** - 3-4天
- 实例生命周期 (2天)
- 指标采集 (1天)
- 真实测试 (1天)

**Phase 3: 优化提升 (Week 2-3)** - 1-2天
- API规范 (0.06天)
- UI完善 (1天)

**总计**: 2.5-3周（考虑并行开发）

---

## 9. 成功标准

### 9.1 功能完整性

| 指标 | 目标 | 测量方法 |
|------|------|----------|
| P0功能完成度 | 100% | 功能可用性验证 |
| P1功能完成度 | 90% | 功能可用性验证 |
| 端到端流程 | 100% | 用户旅程测试 |

### 9.2 技术质量

| 指标 | 目标 | 测量方法 |
|------|------|----------|
| 真实集成测试覆盖率 | >60% | Jest coverage |
| E2E测试通过率 | 100% | Playwright results |
| Docker容器成功率 | >95% | 监控统计 |
| API响应时间 | <500ms | 性能测试 |

### 9.3 用户体验

| 指标 | 目标 | 测量方法 |
|------|------|----------|
| 扫码到使用时间 | <5分钟 | 用户测试 |
| 实例创建时间 | <60秒 | 系统监控 |
| OAuth成功率 | >95% | 日志统计 |

---

## 10. 附录

### A. Dockerfile示例

```dockerfile
# docker/openclaw-agent/Dockerfile
FROM node:22-alpine AS builder

WORKDIR /app

# 安装pnpm
RUN npm install -g pnpm

# 复制依赖文件
COPY package.json pnpm-lock.yaml ./

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制源代码
COPY . .

# 构建项目
RUN pnpm build

# 生产镜像
FROM node:22-alpine

WORKDIR /app

# 安装运行时依赖
RUN npm install -g pnpm

# 从构建阶段复制
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# 创建非root用户
RUN addgroup -g 1001 -S opclaw && \
    adduser -S opclaw -u 1001 && \
    chown -R opclaw:opclaw /app

USER opclaw

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 启动Agent
CMD ["node", "dist/index.js"]
```

### B. 相关文档

- `GAP_ANALYSIS_REAL_20260316.md` - 真实GAP分析
- `TASK_LIST_003_critical_gaps_fix.md` - 修订版任务列表
- `CORE-REQ-001.md` - 核心需求文档

### C. 变更历史

| 版本 | 日期 | 变更内容 | 作者 |
|------|------|----------|------|
| v1.0 | 2026-03-16 | 初始版本，基于真实GAP分析制定 | Claude Code |

---

**文档状态**: ✅ 完成
**下一步**: 生成详细任务列表 (TASK_LIST_003)
**预期完成时间**: 2-3周
