# TASK_LIST_003: 关键GAP修复与系统整合

> **任务队列创建日期**: 2026-03-16
> **基于文档**: FIP-003_critical_gaps_fix.md, GAP_ANALYSIS_REAL_20260316.md
> **目标**: 在 2-3 周内完成真实功能整合,实现可用的MVP
> **执行规范**: docs/AUTO_TASK_CONFIG.md
> **替代**: TASK_LIST_002 (基于真实GAP重新制定)

---

## 任务概览

| 阶段 | 任务范围 | 预计周期 | 状态 |
|------|---------|---------|------|
| Phase 1 | P0 核心阻塞修复 (Docker + OAuth) | Week 1 | ⏳ 待执行 |
| Phase 2 | P0/P1 功能完善与整合 | Week 2 | ⏳ 待执行 |
| Phase 3 | P2 优化与验收 | Week 3 | ⏳ 待执行 |

---

## Phase 1: P0 核心阻塞修复 (Week 1)

### TASK-040: Docker环境配置与镜像构建 ⭐ P0

**任务描述**:
配置Docker环境,构建OpenClaw Agent镜像,准备容器化基础设施。

| 字段 | 内容 |
|------|------|
| **任务ID** | TASK-040 |
| **任务状态** | `COMPLETED` ✅ |
| **任务规模** | 0.5 人天 / 约 4 小时 |
| **前置依赖** | 无 |
| **优先级** | **P0 - CRITICAL** |
| **完成时间** | 2026-03-16 |
| **提交记录** | Commit: 95a3215 |

**验收条件**:
- [x] Docker daemon可访问
- [x] openclaw-agent镜像构建成功
- [x] 容器可以启动并运行健康检查
- [x] 网络配置正确(opclaw-network)

**实施步骤**:

1. **Docker环境准备** (1h)
   ```bash
   # 检查Docker daemon
   sudo systemctl status docker
   docker --version

   # 添加用户到docker组
   sudo usermod -aG docker $USER
   newgrp docker

   # 测试容器创建
   docker run --rm hello-world
   ```

2. **创建Dockerfile** (1.5h)
   ```dockerfile
   # docker/openclaw-agent/Dockerfile
   FROM node:22-alpine

   WORKDIR /app

   # 安装依赖
   COPY package.json pnpm-lock.yaml ./
   RUN npm install -g pnpm && pnpm install --frozen-lockfile

   # 复制源码
   COPY . .

   # 构建
   RUN pnpm build

   # 暴露端口
   EXPOSE 3000

   # 健康检查
   HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
     CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

   CMD ["node", "dist/index.js"]
   ```

3. **构建镜像** (1h)
   ```bash
   # 构建镜像
   docker build -t openclaw/agent:latest -f docker/openclaw-agent/Dockerfile .

   # 测试运行
   docker run --rm -p 3001:3000 openclaw/agent:latest

   # 验证健康检查
   curl http://localhost:3001/health
   ```

4. **配置网络** (0.5h)
   ```bash
   # 创建opclaw网络
   docker network create opclaw-network

   # 验证网络
   docker network ls | grep opclaw
   ```

**交付物**:
- `docker/openclaw-agent/Dockerfile`
- `docker/openclaw-agent/.dockerignore`
- 镜像 `openclaw-agent:latest`

---

### TASK-041: DockerService核心实现 ⭐ P0

**任务描述**:
实现DockerService核心功能,包括容器创建、启动、停止、删除和状态查询。

| 字段 | 内容 |
|------|------|
| **任务ID** | TASK-041 |
| **任务状态** | `PENDING` |
| **任务规模** | 1.5 人天 / 约 12 小时 |
| **前置依赖** | TASK-040 |
| **优先级** | **P0 - CRITICAL** |

**验收条件**:
- [ ] `createContainer()` 创建真实容器
- [ ] `startContainer()` 启动容器
- [ ] `stopContainer()` 停止容器
- [ ] `removeContainer()` 删除容器
- [ ] `getContainerStats()` 获取统计信息
- [ ] `listOpenClawContainers()` 列出所有容器
- [ ] 单元测试通过 (15/15)
- [ ] 集成测试通过 (真实Docker操作)

**实施步骤**:

1. **安装dockerode** (0.5h)
   ```bash
   pnpm add dockerode @types/dockerode
   ```

2. **实现DockerService** (8h)
   ```typescript
   // src/services/DockerService.ts
   import Docker from 'dockerode';
   import { Service } from 'typedi';
   import { InstancePresetConfig } from '../types/config';

   @Service()
   export class DockerService {
     private docker: Docker;
     private networkId: string;

     constructor() {
       this.docker = new Docker({
         socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock'
       });
     }

     async initializeNetwork(): Promise<void> {
       // 网络初始化逻辑
     }

     async createContainer(options: {
       instanceId: string;
       config: InstancePresetConfig;
       apiKey: string;
     }): Promise<string> {
       // 容器创建逻辑
     }

     async getContainerStats(containerId: string): Promise<{
       cpuUsage: number;
       memoryUsage: number;
       status: string;
     }> {
       // 统计信息获取
     }

     async startContainer(containerId: string): Promise<void> {
       // 启动容器
     }

     async stopContainer(containerId: string): Promise<void> {
       // 停止容器
     }

     async removeContainer(containerId: string): Promise<void> {
       // 删除容器
     }

     async listOpenClawContainers(): Promise<Array<{
       id: string;
       name: string;
       instanceId: string;
       status: string;
     }>> {
       // 列出所有opclaw容器
     }

     async getContainerLogs(containerId: string, tail?: number): Promise<string> {
       // 获取容器日志
     }
   }
   ```

3. **单元测试** (2h)
   ```typescript
   // tests/unit/DockerService.test.ts
   describe('DockerService', () => {
     test('should create container with correct config')
     test('should enforce resource limits')
     test('should get container stats')
     test('should start/stop container')
     test('should remove container')
   });
   ```

4. **集成测试** (1.5h)
   ```typescript
   // tests/integration/DockerService.integration.test.ts
   describe('DockerService Integration', () => {
     test('should create real container')
     test('should enforce memory limit')
     test('should enforce CPU limit')
     test('should cleanup on error')
   });
   ```

**交付物**:
- `src/services/DockerService.ts`
- `tests/unit/DockerService.test.ts`
- `tests/integration/DockerService.integration.test.ts`

---

### TASK-042: InstanceService与Docker集成 ⭐ P0

**任务描述**:
将InstanceService与DockerService集成,实现真实的实例生命周期管理。

| 字段 | 内容 |
|------|------|
| **任务ID** | TASK-042 |
| **任务状态** | `PENDING` |
| **任务规模** | 2 人天 / 约 16 小时 |
| **前置依赖** | TASK-041 |
| **优先级** | **P0 - CRITICAL** |

**验收条件**:
- [ ] `createInstance()` 创建真实Docker容器
- [ ] `startInstance()` 启动容器
- [ ] `stopInstance()` 停止容器
- [ ] `deleteInstance()` 删除容器
- [ ] 容器状态同步到数据库
- [ ] 配置应用到容器环境变量
- [ ] 集成测试通过

**实施步骤**:

1. **更新InstanceService** (8h)
   ```typescript
   // src/services/InstanceService.ts
   async createInstance(user: User, options: CreateInstanceOptions): Promise<Instance> {
     const { template } = options;

     // 1. 获取预设配置
     const presetConfig = PRESET_TEMPLATES[template];

     // 2. 创建API密钥
     const apiKey = await this.apiKeyService.createApiKey(...);

     // 3. 创建Docker容器 (🔴 真实集成)
     const containerId = await this.dockerService.createContainer({
       instanceId,
       config: presetConfig,
       apiKey: apiKey.key
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

   async startInstance(instanceId: string): Promise<void> {
     const instance = await this.findById(instanceId);
     await this.dockerService.startContainer(instance.docker_container_id);
     instance.status = 'active';
     await this.instanceRepository.update(instanceId, instance);
   }

   async stopInstance(instanceId: string): Promise<void> {
     const instance = await this.findById(instanceId);
     await this.dockerService.stopContainer(instance.docker_container_id);
     instance.status = 'stopped';
     await this.instanceRepository.update(instanceId, instance);
   }

   async deleteInstance(instanceId: string): Promise<void> {
     const instance = await this.findById(instanceId);

     if (instance.docker_container_id) {
       await this.dockerService.removeContainer(instance.docker_container_id);
     }

     await this.apiKeyService.revoke(instance.api_key_id);
     await this.instanceRepository.delete(instanceId);
   }
   ```

2. **容器就绪检测** (2h)
   ```typescript
   private async waitForContainerReady(containerId: string): Promise<void> {
     const maxWait = 60000;
     const interval = 2000;

     for (let i = 0; i < maxWait / interval; i++) {
       const stats = await this.dockerService.getContainerStats(containerId);
       if (stats.status === 'running') {
         // 等待健康检查通过
         await this.waitForHealthCheck(containerId);
         return;
       }
       await new Promise(resolve => setTimeout(resolve, interval));
     }

     throw new Error(`Container ${containerId} failed to start`);
   }

   private async waitForHealthCheck(containerId: string): Promise<void> {
     // 等待容器健康检查通过
     // 可以通过检查容器日志或HTTP端点
   }
   ```

3. **集成测试** (6h)
   ```typescript
   // tests/integration/InstanceService.integration.test.ts
   describe('InstanceService Integration', () => {
     test('should create instance with real container', async () => {
       const instance = await instanceService.createInstance(user, {
         template: 'personal',
         config: {}
       });

       // 验证容器存在
       const containers = await dockerService.listOpenClawContainers();
       expect(containers.find(c => c.instanceId === instance.id)).toBeDefined();
     });

     test('should apply preset configuration to container', async () => {
       const instance = await instanceService.createInstance(user, {
         template: 'personal',
         config: {}
       });

       const env = await dockerService.getContainerEnv(instance.docker_container_id);
       expect(env.LLM_MODEL).toBe('deepseek-chat');
       expect(env.ENABLED_SKILLS).toContain('general_chat');
     });

     test('should start/stop instance', async () => {
       await instanceService.stopInstance(instanceId);
       const stats = await dockerService.getContainerStats(containerId);
       expect(stats.status).toBe('exited');

       await instanceService.startInstance(instanceId);
       const stats2 = await dockerService.getContainerStats(containerId);
       expect(stats2.status).toBe('running');
     });

     test('should delete instance and container', async () => {
       await instanceService.deleteInstance(instanceId);

       const containers = await dockerService.listOpenClawContainers();
       expect(containers.find(c => c.instanceId === instanceId)).toBeUndefined();

       const instance = await instanceRepository.findById(instanceId);
       expect(instance).toBeNull();
     });
   });
   ```

**交付物**:
- 更新的 `src/services/InstanceService.ts`
- `tests/integration/InstanceService.integration.test.ts`

---

### TASK-043: OAuth URL修复 ⭐ P0

**任务描述**:
修复OAuth URL生成逻辑,解决"undefined"前缀问题。

| 字段 | 内容 |
|------|------|
| **任务ID** | TASK-043 |
| **任务状态** | `PENDING` |
| **任务规模** | 0.25 人天 / 约 2 小时 |
| **前置依赖** | 无 |
| **优先级** | **P0 - CRITICAL** |

**验收条件**:
- [ ] OAuth URL不包含"undefined"
- [ ] URL格式正确
- [ ] redirect_uri白名单验证
- [ ] 单元测试通过

**实施步骤**:

1. **修复环境变量** (30min)
   ```bash
   # .env.production
   FEISHU_BASE_URL=https://open.feishu.cn/open-apis/authen/v1
   FEISHU_APP_ID=cli_a93ce5614ce11bd6
   FEISHU_APP_SECRET=your_secret_here
   FEISHU_REDIRECT_URI=http://localhost:5173/oauth/callback
   FEISHU_ENCRYPT_KEY=your_encrypt_key_here
   ```

2. **修复OAuthService** (30min)
   ```typescript
   // src/services/OAuthService.ts
   export class OAuthService {
     private readonly FEISHU_BASE_URL = 'https://open.feishu.cn/open-apis/authen/v1';

     constructor() {
       // 使用环境变量或默认值
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

     private validateUrl(url: string): void {
       if (!url || url.includes('undefined')) {
         throw new AppError(500, 'INVALID_URL', `Generated OAuth URL is invalid: ${url}`);
       }
     }
   }
   ```

3. **添加验证中间件** (30min)
   ```typescript
   // src/middleware/validateOAuth.ts
   export function validateOAuthUrl(req: Request, res: Response, next: NextFunction) {
     const redirectUri = req.query.redirect_uri as string;
     const allowedUris = process.env.ALLOWED_REDIRECT_URIS?.split(',') || [
       'http://localhost:5173/oauth/callback'
     ];

     if (!allowedUris.includes(redirectUri)) {
       throw new AppError(400, 'INVALID_REDIRECT_URI');
     }

     next();
   }
   ```

4. **测试** (30min)
   ```bash
   # 测试OAuth URL生成
   curl "http://localhost:3000/api/oauth/authorize?redirect_uri=http://localhost:5173/oauth/callback"

   # 验证输出:
   {
     "url": "https://open.feishu.cn/open-apis/authen/v1/authorize?..."
   }
   ```

**交付物**:
- 更新的 `src/services/OAuthService.ts`
- `src/middleware/validateOAuth.ts`
- 环境变量配置

---

### TASK-044: 配置应用验证 ⭐ P0

**任务描述**:
验证预设配置是否正确应用到Docker容器。

| 字段 | 内容 |
|------|------|
| **任务ID** | TASK-044 |
| **任务状态** | `PENDING` |
| **任务规模** | 1 人天 / 约 8 小时 |
| **前置依赖** | TASK-042 |
| **优先级** | **P0 - CRITICAL** |

**验收条件**:
- [ ] LLM配置应用到容器环境变量
- [ ] Skills配置正确
- [ ] Tools配置正确
- [ ] System Prompt正确
- [ ] 资源限制生效

**实施步骤**:

1. **验证环境变量** (2h)
   ```typescript
   // tests/integration/ConfigApplication.integration.test.ts
   describe('Configuration Application', () => {
     test('should apply LLM configuration', async () => {
       const instance = await instanceService.createInstance(user, {
         template: 'personal',
         config: {}
       });

       const env = await dockerService.getContainerEnv(instance.docker_container_id);

       expect(env.LLM_API_KEY).toBeTruthy();
       expect(env.LLM_MODEL).toBe('deepseek-chat');
       expect(env.LLM_TEMPERATURE).toBe('0.7');
       expect(env.LLM_MAX_TOKENS).toBe('4000');
     });

     test('should apply Skills configuration', async () => {
       const env = await dockerService.getContainerEnv(containerId);
       const skills = JSON.parse(env.ENABLED_SKILLS);

       expect(skills).toContain('general_chat');
       expect(skills).toContain('web_search');
       expect(skills).toContain('knowledge_base');
       expect(skills).not.toContain('email_assistant');  // 默认关闭
     });

     test('should apply Tools configuration', async () => {
       const env = await dockerService.getContainerEnv(containerId);
       const tools = JSON.parse(env.ENABLED_TOOLS);

       expect(tools).toContain('read');
       expect(tools).toContain('write');
       expect(tools).toContain('web_search');
       expect(tools).toContain('memory');
     });

     test('should apply System Prompt', async () => {
       const env = await dockerService.getContainerEnv(containerId);
       expect(env.SYSTEM_PROMPT).toContain('龙虾');
       expect(env.SYSTEM_PROMPT).toContain('AI助手');
     });

     test('should enforce resource limits', async () => {
       const stats = await dockerService.getContainerStats(containerId);

       // 等待容器运行一段时间后采集
       await new Promise(resolve => setTimeout(resolve, 5000));

       const stats2 = await dockerService.getContainerStats(containerId);

       expect(stats2.memoryUsage).toBeLessThan(512);  // MB
       expect(stats2.cpuUsage).toBeLessThan(60);  // %
     });
   });
   ```

2. **OpenClaw Agent启动验证** (4h)
   ```typescript
   // 验证Agent可以读取配置并正确启动
   describe('OpenClaw Agent Startup', () => {
     test('should start with correct LLM config', async () => {
       // 检查Agent日志
       const logs = await dockerService.getContainerLogs(containerId);
       expect(logs).toContain('LLM initialized: deepseek-chat');
     });

     test('should have correct Skills enabled', async () => {
       const response = await fetch(`http://localhost:${port}/api/skills`);
       const skills = await response.json();

       expect(skills.enabled).toContain('general_chat');
       expect(skills.enabled).toContain('web_search');
     });

     test('should respond to health check', async () => {
       const response = await fetch(`http://localhost:${port}/health`);
       expect(response.ok).toBeTruthy();

       const data = await response.json();
       expect(data.status).toBe('healthy');
     });
   });
   ```

3. **配置热重载测试** (2h)
   ```typescript
   test('should reload configuration', async () => {
     // 修改配置
     await instanceService.updateConfig(instanceId, {
       llm: { temperature: 0.9 }
     });

     // 触发重载
     await configReloadService.reloadConfig(instanceId);

     // 验证新配置生效
     const env = await dockerService.getContainerEnv(containerId);
     expect(env.LLM_TEMPERATURE).toBe('0.9');
   });
   ```

**交付物**:
- `tests/integration/ConfigApplication.integration.test.ts`
- 配置验证报告

---

## Phase 2: P0/P1 功能完善 (Week 2)

### TASK-045: 真实集成测试实现 ⭐ P1

**任务描述**:
实现使用真实组件的集成测试,替代Mock测试。

| 字段 | 内容 |
|------|------|
| **任务ID** | TASK-045 |
| **任务状态** | `PENDING` |
| **任务规模** | 2 人天 / 约 16 小时 |
| **前置依赖** | TASK-042, TASK-044 |
| **优先级** | **P1 - IMPORTANT** |

**验收条件**:
- [ ] 集成测试使用真实PostgreSQL
- [ ] 集成测试使用真实Redis
- [ ] 集成测试创建真实Docker容器
- [ ] 测试覆盖率 >60%
- [ ] 所有集成测试通过

**实施步骤**:

1. **测试环境配置** (2h)
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

     test-runner:
       build:
       context: .
       dockerfile: Dockerfile.test
       environment:
         DB_HOST: test-db
         DB_PORT: 5432
         REDIS_HOST: test-redis
         REDIS_PORT: 6379
         DOCKER_HOST: unix:///var/run/docker.sock
       volumes:
         - /var/run/docker.sock:/var/run/docker.sock
       depends_on:
         - test-db
         - test-redis
   ```

2. **集成测试实现** (12h)
   ```typescript
   // tests/integration/CompleteFlow.integration.test.ts
   describe('Complete Instance Flow', () => {
     let user: User;
     let instanceService: InstanceService;
     let dockerService: DockerService;

     beforeAll(async () => {
       // 初始化测试环境
       await setupTestDatabase();
       await setupTestRedis();

       dockerService = new DockerService();
       await dockerService.initializeNetwork();

       instanceService = new InstanceService(dockerService);
       user = await createTestUser();
     });

     test('should complete full instance lifecycle', async () => {
       // 1. 创建实例
       const instance = await instanceService.createInstance(user, {
         template: 'personal',
         config: {}
       });

       // 2. 验证容器创建
       const containers = await dockerService.listOpenClawContainers();
       expect(containers.find(c => c.instanceId === instance.id)).toBeDefined();

       // 3. 验证实例状态
       expect(instance.status).toBe('active');
       expect(instance.docker_container_id).toBeTruthy();

       // 4. 停止实例
       await instanceService.stopInstance(instance.id);
       const stoppedInstance = await instanceService.findById(instance.id);
       expect(stoppedInstance.status).toBe('stopped');

       // 5. 重新启动
       await instanceService.startInstance(instance.id);
       const startedInstance = await instanceService.findById(instance.id);
       expect(startedInstance.status).toBe('active');

       // 6. 删除实例
       await instanceService.deleteInstance(instance.id);

       // 7. 验证容器删除
       const finalContainers = await dockerService.listOpenClawContainers();
       expect(finalContainers.find(c => c.instanceId === instance.id)).toBeUndefined();

       // 8. 验证数据库删除
       const deletedInstance = await instanceService.findById(instance.id);
       expect(deletedInstance).toBeNull();
     });

     test('should handle instance creation failure', async () => {
       // 测试Docker创建失败时的回滚
       dockerService.createContainer = jest.fn().mockRejectedValue(new Error('Docker error'));

       await expect(
         instanceService.createInstance(user, { template: 'personal', config: {} })
       ).rejects.toThrow('Docker error');

       // 验证数据库没有残留记录
       const instances = await instanceService.findByUser(user.id);
       expect(instances).toHaveLength(0);
     });

     afterAll(async () => {
       // 清理
       const containers = await dockerService.listOpenClawContainers();
       for (const container of containers) {
         await dockerService.removeContainer(container.id);
       }

       await cleanupTestDatabase();
       await cleanupTestRedis();
     });
   });
   ```

3. **OAuth集成测试** (2h)
   ```typescript
   // tests/integration/OAuthFlow.integration.test.ts
   describe('OAuth Flow Integration', () => {
     test('should complete OAuth flow', async () => {
       // 1. 生成授权URL
       const authUrl = await oauthService.getAuthorizeUrl(state);

       // 2. 验证URL格式
       expect(authUrl).toMatch(/^https:\/\/open\.feishu\.cn\/open-apis\/authen\/v1\/authorize/);
       expect(authUrl).toContain('app_id=');
       expect(authUrl).toContain('redirect_uri=');
       expect(authUrl).toContain('state=');

       // 3. 模拟回调
       const mockCode = 'test_code_' + Math.random();
       const userInfo = {
         user_id: 'test_user_id',
         name: 'Test User',
         email: 'test@example.com'
       };

       // Mock飞书API响应
       mockFeishuTokenExchange(mockCode);
       mockFeishuUserInfo(mockCode, userInfo);

       // 4. 处理回调
       const result = await oauthService.handleCallback(mockCode, state);

       // 5. 验证结果
       expect(result.access_token).toBeTruthy();
       expect(result.user.name).toBe('Test User');

       // 6. 验证用户创建
       const user = await userRepository.findByFeishuId(userInfo.user_id);
       expect(user).toBeDefined();
       expect(user.name).toBe('Test User');
     });
   });
   ```

**交付物**:
- `docker-compose.test.yml`
- `tests/integration/*.integration.test.ts`
- 测试覆盖率报告

---

### TASK-046: 指标采集定时任务 ⭐ P1

**任务描述**:
配置并实现指标采集定时任务,确保每5分钟采集容器指标。

| 字段 | 内容 |
|------|------|
| **任务ID** | TASK-046 |
| **任务状态** | `PENDING` |
| **任务规模** | 1 人天 / 约 8 小时 |
| **前置依赖** | TASK-042 |
| **优先级** | **P1 - IMPORTANT** |

**验收条件**:
- [ ] Cron任务每5分钟执行
- [ ] 采集CPU和内存指标
- [ ] 数据存储到数据库
- [ ] 错误不中断其他实例采集
- [ ] 集成测试通过

**实施步骤**:

1. **配置定时任务** (2h)
   ```typescript
   // src/app.ts
   import { CronJob } from 'cron';

   export class App {
     private scheduledJobs: CronJob[] = [];

     private initializeScheduledTasks(): void {
       logger.info('Initializing scheduled tasks...');

       // 指标采集任务
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

       logger.info(`Registered ${this.scheduledJobs.length} scheduled tasks`);
     }

     public async shutdown(): Promise<void> {
       logger.info('Shutting down scheduled tasks...');
       this.scheduledJobs.forEach(job => job.stop());
       this.scheduledJobs = [];
     }
   }
   ```

2. **实现指标采集** (4h)
   ```typescript
   // src/services/MetricsCollectionService.ts
   @Service()
   export class MetricsCollectionService {
     async collectAllMetrics(): Promise<void> {
       logger.info('Starting metrics collection...');

       const instances = await this.instanceRepository.findActive();
       logger.info(`Collecting metrics for ${instances.length} instances`);

       for (const instance of instances) {
         try {
           await this.collectInstanceMetrics(instance.id);
         } catch (error) {
           logger.error(`Failed to collect metrics for instance ${instance.id}`, error);
         }
       }

       logger.info('Metrics collection completed');
     }

     async collectInstanceMetrics(instanceId: string): Promise<void> {
       const instance = await this.instanceRepository.findById(instanceId);

       if (!instance.docker_container_id) {
         logger.warn(`Instance ${instanceId} has no container, skipping`);
         return;
       }

       // 采集容器指标
       const stats = await this.dockerService.getContainerStats(
         instance.docker_container_id
       );

       // 记录到数据库
       await this.metricsRepository.record({
         instance_id: instanceId,
         metric_type: 'cpu_usage',
         metric_value: stats.cpuUsage,
         unit: 'percent',
         recorded_at: new Date(),
       });

       await this.metricsRepository.record({
         instance_id: instanceId,
         metric_type: 'memory_usage',
         metric_value: stats.memoryUsage,
         unit: 'mb',
         recorded_at: new Date(),
       });
     }
   }
   ```

3. **测试定时任务** (2h)
   ```typescript
   // tests/integration/MetricsCollection.integration.test.ts
   describe('Metrics Collection', () => {
     test('should collect metrics on schedule', async () => {
       // 创建测试实例
       const instance = await createTestInstance();

       // 等待下次定时任务执行
       await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));

       // 验证指标被采集
       const metrics = await metricsRepository.findByInstance(instance.id);
       expect(metrics.length).toBeGreaterThan(0);

       const cpuMetrics = metrics.filter(m => m.metric_type === 'cpu_usage');
       expect(cpuMetrics.length).toBeGreaterThan(0);

       const memoryMetrics = metrics.filter(m => m.metric_type === 'memory_usage');
       expect(memoryMetrics.length).toBeGreaterThan(0);
     });

     test('should handle collection errors gracefully', async () => {
       // 创建一个会失败的实例（无效容器ID）
       const instance = await createTestInstance({
         docker_container_id: 'invalid-container-id'
       });

       // 任务应该继续执行，不中断
       await metricsCollectionService.collectAllMetrics();

       // 其他实例的指标应该仍被采集
       const validInstances = await instanceRepository.findActive();
       const validInstance = validInstances.find(i => i.id !== instance.id);
       const metrics = await metricsRepository.findByInstance(validInstance.id);
       expect(metrics.length).toBeGreaterThan(0);
     });
   });
   ```

**交付物**:
- 更新的 `src/app.ts` (定时任务配置)
- 完整的 `src/services/MetricsCollectionService.ts`
- 集成测试

---

### TASK-047: E2E测试完整流程 ⭐ P1

**任务描述**:
更新E2E测试以覆盖真实的"扫码认领→使用实例"流程。

| 字段 | 内容 |
|------|------|
| **任务ID** | TASK-047 |
| **任务状态** | `PENDING` |
| **任务规模** | 1.25 人天 / 约 10 小时 |
| **前置依赖** | TASK-042, TASK-043, TASK-044 |
| **优先级** | **P1 - IMPORTANT** |

**验收条件**:
- [ ] 完整用户旅程测试
- [ ] OAuth流程测试
- [ ] 实例创建测试
- [ ] 实例管理测试
- [ ] 所有E2E测试通过

**实施步骤**:

1. **完整用户旅程测试** (4h)
   ```typescript
   // tests/e2e/complete-user-journey.spec.ts
   import { test, expect } from '@playwright/test';

   test.describe('Complete User Journey', () => {
     test('should complete scan-to-use flow', async ({ page, context }) => {
       // ===== 步骤1: 访问登录页 =====
       await page.goto('/login');
       await expect(page).toHaveTitle(/OpenClaw/);

       // ===== 步骤2: 验证二维码 =====
       const qrCodeElement = await page.locator('[data-testid="qr-code-image"]');
       await expect(qrCodeElement).toBeVisible();

       const qrCodeUrl = await page.locator('[data-testid="qr-code-url"]').textContent();
       expect(qrCodeUrl).toMatch(/^https:\/\/open\.feishu\.cn/);
       expect(qrCodeUrl).not.toContain('undefined');

       // ===== 步骤3: 模拟OAuth回调 =====
       // 从URL提取state参数
       const url = new URL(qrCodeUrl);
       const state = url.searchParams.get('state');

       // 模拟飞书授权回调
       const callbackResponse = await context.request.post('/api/oauth/callback', {
         data: {
           code: 'test_auth_code_' + Math.random(),
           state: state
         }
       });

       expect(callbackResponse.ok()).toBeTruthy();
       const callbackData = await callbackResponse.json();
       expect(callbackData.access_token).toBeTruthy();

       // 设置认证token
       await context.addInitScript(() => {
         localStorage.setItem('access_token', callbackData.access_token);
       });

       // ===== 步骤4: 访问Dashboard =====
       await page.goto('/dashboard');
       await expect(page.locator('[data-testid="user-name"]')).toBeVisible();

       // ===== 步骤5: 创建实例 =====
       await page.click('[data-testid="create-instance-button"]');

       // 选择模板
       await page.selectOption('[data-testid="template-select"]', 'personal');

       // 提交创建
       await page.click('[data-testid="submit-button"]');

       // 等待实例创建（包括Docker容器启动）
       await expect(page.locator('[data-testid="instance-status"]')).toHaveText('active', {
         timeout: 60000  // 60秒超时
       });

       // ===== 步骤6: 验证实例详情 =====
       const instanceId = await page.locator('[data-testid="instance-id"]').textContent();
       const instanceName = await page.locator('[data-testid="instance-name"]').textContent();
       const expiresAt = await page.locator('[data-testid="expires-at"]').textContent();

       expect(instanceId).toBeTruthy();
       expect(instanceName).toContain('personal');
       expect(expiresAt).toBeTruthy();

       // ===== 步骤7: 查看实例配置 =====
       await page.click(`[data-testid="instance-${instanceId}"]`);

       // 验证预设配置显示
       await expect(page.locator('[data-testid="llm-model"]')).toHaveText('deepseek-chat');
       await expect(page.locator('[data-testid="enabled-skills"]')).toContainText('general_chat');
       await expect(page.locator('[data-testid="enabled-tools"]')).toContainText('read');

       // ===== 步骤8: 测试实例操作 =====
       // 停止实例
       await page.click('[data-testid="stop-instance-button"]');
       await expect(page.locator('[data-testid="instance-status"]')).toHaveText('stopped', {
         timeout: 30000
       });

       // 启动实例
       await page.click('[data-testid="start-instance-button"]');
       await expect(page.locator('[data-testid="instance-status"]')).toHaveText('active', {
         timeout: 30000
       });

       // ===== 步骤9: 查看使用统计 =====
       await page.click('[data-testid="metrics-tab"]');

       // 等待指标加载
       await expect(page.locator('[data-testid="cpu-usage-chart"]')).toBeVisible({
         timeout: 10000
       });

       // 验证统计数据
       const cpuUsage = await page.locator('[data-testid="avg-cpu-usage"]').textContent();
       const memoryUsage = await page.locator('[data-testid="avg-memory-usage"]').textContent();

       expect(cpuUsage).toBeTruthy();
       expect(memoryUsage).toBeTruthy();

       // ===== 步骤10: 续费实例 =====
       await page.click('[data-testid="renew-button"]');
       await page.click('[data-testid="renew-30-days"]');

       // 等待续费成功
       await expect(page.locator('[data-testid="renew-success-message"]')).toBeVisible();

       // 验证新的到期时间
       const newExpiresAt = await page.locator('[data-testid="expires-at"]').textContent();
       expect(newExpiresAt).not.toEqual(expiresAt);
     });
   });
   ```

2. **错误处理测试** (2h)
   ```typescript
   test.describe('Error Handling', () => {
     test('should handle OAuth error gracefully', async ({ page }) => {
       await page.goto('/login');

       // 模拟OAuth错误
       const invalidCode = 'invalid_code';
       // ... 测试错误处理
     });

     test('should handle instance creation failure', async ({ page }) => {
       await login(page);
       await page.goto('/dashboard');

       // Mock Docker失败
       // ... 测试失败场景
     });

     test('should handle network timeout', async ({ page }) => {
       // 模拟慢网络
       await page.context().setOffline(true);

       // 验证错误提示
       await page.goto('/login');
       await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
     });
   });
   ```

3. **性能测试** (2h)
   ```typescript
   test.describe('Performance', () => {
     test('should load dashboard within 2 seconds', async ({ page }) => {
       const startTime = Date.now();

       await page.goto('/dashboard');
       await page.waitForLoadState('networkidle');

       const loadTime = Date.now() - startTime;
       expect(loadTime).toBeLessThan(2000);
     });

     test('should create instance within 60 seconds', async ({ page }) => {
       await login(page);
       await page.goto('/dashboard');

      const startTime = Date.now();

       await page.click('[data-testid="create-instance-button"]');
       await page.selectOption('[data-testid="template-select"]', 'personal');
       await page.click('[data-testid="submit-button"]');

       await expect(page.locator('[data-testid="instance-status"]')).toHaveText('active', {
         timeout: 60000
       });

       const createTime = Date.now() - startTime;
       expect(createTime).toBeLessThan(60000);
     });
   });
   ```

4. **多用户场景测试** (2h)
   ```typescript
   test.describe('Multi-User Scenarios', () => {
     test('should support multiple instances per user', async ({ page }) => {
       await login(page);
       await page.goto('/dashboard');

       // 创建第一个实例
       await createInstance(page, 'personal', 'instance-1');
       await expect(page.locator('[data-testid="instance-instance-1"]')).toBeVisible();

       // 创建第二个实例
       await createInstance(page, 'team', 'instance-2');
       await expect(page.locator('[data-testid="instance-instance-2"]')).toBeVisible();

       // 验证两个实例都存在
       const instances = await page.locator('[data-testid^="instance-"]').all();
       expect(instances).toHaveLength(2);
     });

     test('should isolate instances between users', async ({ browser }) => {
       // 用户A创建实例
       const contextA = await browser.newContext();
       const pageA = await contextA.newPage();
       await login(pageA, 'userA');
       const instanceA = await createInstance(pageA, 'personal');

       // 用户B无法看到用户A的实例
       const contextB = await browser.newContext();
       const pageB = await contextB.newPage();
       await login(pageB, 'userB');
       await pageB.goto('/dashboard');

       await expect(pageB.locator(`[data-testid="instance-${instanceA}"]`)).not.toBeVisible();
     });
   });
   ```

**交付物**:
- `tests/e2e/complete-user-journey.spec.ts`
- `tests/e2e/error-handling.spec.ts`
- `tests/e2e/performance.spec.ts`
- `tests/e2e/multi-user.spec.ts`

---

## Phase 3: P2 优化与验收 (Week 3)

### TASK-048: API路由规范 ⭐ P2

**任务描述**:
规范API路由结构,添加缺失的`/api/health`端点。

| 字段 | 内容 |
|------|------|
| **任务ID** | TASK-048 |
| **任务状态** | `PENDING` |
| **任务规模** | 0.06 人天 / 约 30 分钟 |
| **前置依赖** | 无 |
| **优先级** | **P2** |

**验收条件**:
- [ ] `/api/health` 端点存在
- [ ] 返回Docker状态
- [ ] API结构一致

**实施步骤**:

1. **添加API健康检查** (15min)
   ```typescript
   // src/routes/api.ts
   import { Router } from 'express';

   const apiRouter = Router();

   apiRouter.get('/health', (req, res) => {
     res.json({
       status: 'ok',
       timestamp: new Date().toISOString(),
       database: 'connected',
       redis: 'connected',
       docker: 'connected'
     });
   });

   export { apiRouter };
   ```

2. **注册路由** (15min)
   ```typescript
   // src/app.ts
   import { apiRouter } from './routes/api';

   private initializeControllers(): void {
     // 注册API路由
     this.app.use('/api', apiRouter);

     // 注册其他路由
     this.app.use('/api/instances', instanceController.router);
     this.app.use('/api/oauth', oauthController.router);
   }
   ```

**交付物**:
- `src/routes/api.ts`
- 更新的 `src/app.ts`

---

### TASK-049: UI图表完善 ⭐ P2

**任务描述**:
完善前端统计图表,实时显示实例指标。

| 字段 | 内容 |
|------|------|
| **任务ID** | TASK-049 |
| **任务状态** | `PENDING` |
| **任务规模** | 1 人天 / 约 8 小时 |
| **前置依赖** | TASK-046 |
| **优先级** | **P2** |

**验收条件**:
- [ ] CPU使用率图表
- [ ] 内存使用图表
- [ ] API调用统计
- [ ] 实时数据刷新

**实施步骤**:

1. **安装图表库** (30min)
   ```bash
   pnpm add recharts
   ```

2. **实现指标组件** (6h)
   ```typescript
   // src/components/MetricsChart.tsx
   import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

   interface MetricsChartProps {
     instanceId: string;
     period: '24h' | '7d' | '30d';
   }

   export const MetricsChart: React.FC<MetricsChartProps> = ({ instanceId, period }) => {
     const [metrics, setMetrics] = useState<MetricsData | null>(null);
     const [loading, setLoading] = useState(true);

     useEffect(() => {
       const fetchMetrics = async () => {
         setLoading(true);
         const response = await fetch(`/api/instances/${instanceId}/metrics?period=${period}`);
         const data = await response.json();
         setMetrics(data.data);
         setLoading(false);
       };

       fetchMetrics();
       const interval = setInterval(fetchMetrics, 30000);  // 30秒刷新
       return () => clearInterval(interval);
     }, [instanceId, period]);

     if (loading) return <div>加载中...</div>;

     return (
       <div className="metrics-dashboard">
         <ResponsiveContainer width="100%" height={300}>
           <LineChart data={metrics?.cpuHistory}>
             <CartesianGrid strokeDasharray="3 3" />
             <XAxis dataKey="timestamp" />
             <YAxis />
             <Tooltip />
             <Legend />
             <Line type="monotone" dataKey="cpuUsage" stroke="#8884d8" name="CPU使用率 (%)" />
           </LineChart>
         </ResponsiveContainer>

         <ResponsiveContainer width="100%" height={300}>
           <LineChart data={metrics?.memoryHistory}>
             <CartesianGrid strokeDasharray="3 3" />
             <XAxis dataKey="timestamp" />
             <YAxis />
             <Tooltip />
             <Legend />
             <Line type="monotone" dataKey="memoryUsage" stroke="#82ca9d" name="内存使用 (MB)" />
           </LineChart>
         </ResponsiveContainer>
       </div>
     );
   };
   ```

3. **集成到详情页** (1.5h)
   ```typescript
   // src/pages/InstanceDetailPage.tsx
   export const InstanceDetailPage: React.FC = () => {
     const [period, setPeriod] = useState<'24h' | '7d' | '30d'>('24h');

     return (
       <div className="instance-detail">
         <h1>实例详情</h1>

         {/* 实例信息 */}
         <InstanceInfo instance={instance} />

         {/* 指标图表 */}
         <div className="metrics-section">
           <div className="period-selector">
             <button onClick={() => setPeriod('24h')}>24小时</button>
             <button onClick={() => setPeriod('7d')}>7天</button>
             <button onClick={() => setPeriod('30d')}>30天</button>
           </div>

           <MetricsChart instanceId={instance.id} period={period} />
         </div>

         {/* 统计卡片 */}
         <div className="stats-cards">
           <StatCard title="平均CPU" value={metrics?.avgCpuUsage} unit="%" />
           <StatCard title="平均内存" value={metrics?.avgMemoryUsage} unit="MB" />
           <StatCard title="API调用" value={metrics?.totalApiCalls} unit="次" />
         </div>
       </div>
     );
   };
   ```

**交付物**:
- `src/components/MetricsChart.tsx`
- 更新的 `src/pages/InstanceDetailPage.tsx`

---

### TASK-050: MVP最终验收 ⭐ P0

**任务描述**:
执行最终MVP验收测试,验证所有核心功能可用。

| 字段 | 内容 |
|------|------|
| **任务ID** | TASK-050 |
| **任务状态** | `PENDING` |
| **任务规模** | 0.5 人天 / 约 4 小时 |
| **前置依赖** | 所有P0/P1任务 |
| **优先级** | **P0 - CRITICAL** |

**验收条件**:
- [ ] P0功能完整性 100%
- [ ] P1功能完整性 >90%
- [ ] 集成测试覆盖率 >60%
- [ ] E2E测试 100%通过
- [ ] 真实用户旅程测试通过
- [ ] 性能指标达标
- [ ] 生产部署就绪

**验收清单**:

#### P0核心功能

- [ ] **Docker集成**
  - [ ] 可以创建真实容器
  - [ ] 容器可以启动/停止/删除
  - [ ] 资源限制生效
  - [ ] 容器日志可查看

- [ ] **OAuth流程**
  - [ ] 二维码URL正确
  - [ ] 可以跳转到飞书
  - [ ] 授权回调处理正确
  - [ ] 用户信息获取正确
  - [ ] 实例绑定成功

- [ ] **实例管理**
  - [ ] 创建实例 <60秒
  - [ ] 启动实例 <30秒
  - [ ] 停止实例 <10秒
  - [ ] 删除实例 <5秒
  - [ ] 续费功能正常

- [ ] **配置应用**
  - [ ] LLM配置生效
  - [ ] Skills配置正确
  - [ ] Tools配置正确
  - [ ] System Prompt正确

#### P1重要功能

- [ ] **指标采集**
  - [ ] 定时任务运行
  - [ ] 容器指标采集
  - [ ] 数据存储正确
  - [ ] 统计API返回数据

- [ ] **测试覆盖**
  - [ ] 单元测试 >70%
  - [ ] 集成测试 >60%
  - [ ] E2E测试 100%

#### 性能指标

- [ ] **响应时间**
  - [ ] API平均响应 <500ms
  - [ ] 页面加载 <2s
  - [ ] 实例创建 <60s

- [ ] **资源使用**
  - [ ] 容器内存限制生效
  - [ ] CPU限制生效
  - [ ] 无内存泄漏

#### 生产就绪

- [ ] **监控**
  - [ ] 健康检查正常
  - [ ] 日志完整
  - [ ] 错误追踪

- [ ] **部署**
  - [ ] Docker镜像可用
  - [ ] 环境变量配置
  - [ ] 数据库迁移
  - [ ] 备份策略

**验收测试**:

```bash
# 1. 健康检查
curl http://localhost:3000/health
curl http://localhost:3000/api/health

# 2. 运行所有测试
pnpm test:unit
pnpm test:integration
pnpm test:e2e

# 3. 性能测试
pnpm test:performance

# 4. 安全扫描
pnpm security:audit

# 5. 代码质量
pnpm lint
pnpm type-check
```

**验收报告**:

生成最终验收报告,包括:
1. 功能完成度
2. 测试覆盖率
3. 性能指标
4. 已知问题
5. 上线建议

**交付物**:
- `MVP_FINAL_ACCEPTANCE_REPORT.md`
- 验收测试结果
- 上线检查清单

---

## 附录

### A. 任务状态说明

| 状态 | 说明 |
|------|------|
| `PENDING` | 待执行 |
| `IN_PROGRESS` | 执行中 |
| `BLOCKED` | 阻塞 |
| `COMPLETED` | 已完成 |
| `FAILED` | 失败 |
| `CANCELLED` | 已取消 |

### B. 优先级说明

| 优先级 | 说明 | 标记 |
|--------|------|------|
| P0 | 阻塞MVP,必须立即实现 | ⭐ P0 |
| P1 | 重要但不阻塞 | ⭐ P1 |
| P2 | 优化项 | ⭐ P2 |

### C. 时间估算

| 阶段 | 任务数 | 预计工时 | 预计人天 |
|------|--------|---------|---------|
| Phase 1: P0核心修复 | 5 | 46h | 5.75 |
| Phase 2: P0/P1完善 | 3 | 34h | 4.25 |
| Phase 3: P2优化验收 | 3 | 12.5h | 1.56 |
| **总计** | **11** | **92.5h** | **11.56** |

### D. 关键路径

```
TASK-040 (Docker环境)
    ↓
TASK-041 (DockerService)
    ↓
TASK-042 (Instance集成) ←→ TASK-043 (OAuth修复)
    ↓
TASK-044 (配置验证)
    ↓
TASK-045 (集成测试) ←→ TASK-046 (指标采集)
    ↓
TASK-047 (E2E测试)
    ↓
TASK-050 (最终验收)
```

### E. 风险提示

1. **Docker集成** (高风险)
   - Docker daemon权限配置
   - 容器镜像构建
   - 网络配置

2. **环境依赖** (中风险)
   - 飞书开放平台应用
   - DeepSeek API密钥
   - Docker daemon访问

3. **时间估计** (低风险)
   - 可能遇到未知问题
   - 预留20%缓冲时间

---

**文档状态**: ✅ 完成
**创建日期**: 2026-03-16
**预期完成**: 2-3周
**下一步**: 开始执行 TASK-040

---

## 与TASK_LIST_002对比

| 维度 | TASK_LIST_002 | TASK_LIST_003 | 改进 |
|------|---------------|---------------|------|
| **真实性** | Mock测试为主 | 真实集成测试 | ✅ |
| **Docker** | 代码存在但不工作 | 完整实现 | ✅ |
| **优先级** | 声称全部完成 | 明确P0/P1/P2 | ✅ |
| **工时估计** | 偏乐观 | 基于实际复杂度 | ✅ |
| **可执行性** | 任务标记完成但不可用 | 按真实进度规划 | ✅ |

**核心改进**: 从"代码实现"转向"系统可用",从"Mock测试"转向"真实验证"
