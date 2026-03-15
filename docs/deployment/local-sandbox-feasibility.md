# 本地沙箱环境可行性评估报告

> **评估日期**: 2026-03-14
> **评估目标**: 确定能否通过 docker-compose 在本地启动完整的 AIOpc 开发沙箱环境
> **核心问题**: 如何绕过云资源依赖，实现本地开发和测试？

---

## 执行摘要

**结论**: ✅ **高度可行**

本地沙箱环境完全可行，关键技术点已有成熟解决方案。通过 Docker Compose + Mock 服务，可以在本地构建完整的开发和测试环境，无需依赖云资源。

**关键优势**:
- 零云资源成本（开发阶段）
- 快速迭代（秒级启动）
- 完整功能测试（支持端到端流程）
- 生产环境兼容（代码可直接部署）

**核心挑战**:
- Docker-in-Docker (已解决: 挂载宿主机 socket)
- 飞书 OAuth (已解决: Mock 服务)
- 实例隔离 (已解决: Docker 网络)

---

## 1. 技术可行性分析

### 1.1 数据库层 (PostgreSQL)

**可行性**: ✅ **完全可行**

**实现方案**:
- 使用官方 Docker 镜像 `postgres:15-alpine`
- 支持完整的 TypeORM migration 机制
- 可挂载初始化脚本自动创建表结构
- 数据持久化通过 Docker volumes

**配置示例**:
```yaml
postgres:
  image: postgres:15-alpine
  environment:
    POSTGRES_DB: opclaw_dev
    POSTGRES_USER: opclaw
    POSTGRES_PASSWORD: dev_password
  volumes:
    - postgres_data:/var/lib/postgresql/data
    - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/init.sql
  ports:
    - "5432:5432"
```

**优势**:
- 启动时间: < 5秒
- 内存占用: ~100MB
- 完整 SQL 支持
- 支持 pgvector 扩展（如需要）

---

### 1.2 缓存层 (Redis)

**可行性**: ✅ **完全可行**

**实现方案**:
- 使用官方 Docker 镜像 `redis:7-alpine`
- 无需外部依赖
- 支持持久化和集群模式

**配置示例**:
```yaml
redis:
  image: redis:7-alpine
  command: redis-server --requirepass dev_password
  volumes:
    - redis_data:/data
  ports:
    - "6379:6379"
```

**优势**:
- 启动时间: < 2秒
- 内存占用: ~30MB
- 完整 Redis 功能支持

---

### 1.3 Docker-in-Docker (关键挑战)

**可行性**: ✅ **完全可行** (方案 A 推荐)

**核心问题**: 后端服务需要管理 Docker 容器（创建/启动/停止 OpenClaw 实例），如何在容器内操作 Docker？

**三种解决方案对比**:

| 方案 | 实现难度 | 安全性 | 性能 | 推荐度 |
|------|---------|--------|------|--------|
| **A. 挂载宿主机 socket** | ⭐ 简单 | ⚠️ 中等 | ✅ 最佳 | ⭐⭐⭐⭐⭐ |
| **B. Docker-in-Docker (DinD)** | ⭐⭐⭐ 复杂 | ✅ 较好 | ⚠️ 较差 | ⭐⭐ |
| **C. Mock Docker 服务** | ⭐⭐ 中等 | ✅ 安全 | ✅ 好 | ⭐⭐⭐ |

#### 方案 A: 挂载宿主机 Docker Socket (推荐)

**实现方式**:
```yaml
backend:
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock
```

**优势**:
- 容器内直接访问宿主机 Docker daemon
- 性能最优（无额外虚拟化层）
- 实现简单，一行配置搞定
- 容器创建在宿主机，可直接访问

**安全考虑**:
- ⚠️ 容器内进程对宿主机 Docker 有完全控制权
- ✅ **开发环境可接受**（仅用于测试）
- ❌ **生产环境不推荐**（需要隔离）

**安全加固措施**:
```yaml
backend:
  security_opt:
    - no-new-privileges:true
  read_only: true
  tmpfs:
    - /tmp
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock:ro  # 只读挂载
```

#### 方案 B: Docker-in-Docker (DinD)

**实现方式**:
```yaml
dind:
  image: docker:24-dind
  privileged: true
  volumes:
    - dind_data:/var/lib/docker

backend:
  environment:
    DOCKER_HOST: tcp://dind:2375
```

**优势**:
- 完全隔离，安全性高
- 独立的 Docker daemon

**劣势**:
- 需要特权模式 (`privileged: true`)
- 性能较差（双重虚拟化）
- 镜像层叠占用空间大
- 复杂度高（需要额外服务）

#### 方案 C: Mock Docker 服务 (开发测试)

**适用场景**: 纯功能测试，不需要真实容器

**实现方式**:
```typescript
// mock-docker.service.ts
class MockDockerService {
  async createContainer(instanceId, config) {
    // 模拟创建，仅记录到内存/数据库
    this.mockContainers.set(instanceId, { status: 'running' });
    return `mock-container-${instanceId}`;
  }

  async getContainerStatus(instanceId) {
    return this.mockContainers.get(instanceId);
  }
}
```

**优势**:
- 快速测试（无需真实容器）
- 无 Docker 依赖
- CI/CD 友好

**劣势**:
- 无法测试真实容器操作
- 需要维护 Mock 逻辑

**最终推荐**: **开发环境用方案 A，CI/CD 用方案 C**

---

### 1.4 飞书 OAuth 集成

**可行性**: ✅ **可行** (两种方案)

**挑战**:
1. OAuth 流程需要真实飞书应用
2. Webhook 接收需要公网地址

#### 方案 A: Mock 飞书服务 (推荐用于开发)

**实现方式**:
```yaml
feishu-mock:
  build: ./mock-services/feishu
  ports:
    - "3001:3000"
  environment:
    MOCK_USER_ID: mock_user_123
    MOCK_USER_NAME: 测试用户
```

**Mock 服务实现**:
```typescript
// mock-services/feishu/src/server.ts
import express from 'express';

const app = express();

// Mock OAuth 授权端点
app.get('/authen/v1/authorize', (req, res) => {
  res.redirect(`http://localhost:5173/oauth/callback?code=mock_code&state=${req.query.state}`);
});

// Mock Token 端点
app.post('/authen/v1/oauth/token', (req, res) => {
  res.json({
    code: 0,
    data: {
      access_token: 'mock_access_token',
      refresh_token: 'mock_refresh_token',
    }
  });
});

// Mock 用户信息端点
app.get('/contact/v3/users/:user_id', (req, res) => {
  res.json({
    code: 0,
    data: {
      user: {
        user_id: 'mock_user_123',
        name: '测试用户',
        email: 'test@example.com',
        avatar_url: 'https://example.com/avatar.png'
      }
    }
  });
});

app.listen(3000, () => console.log('Mock Feishu server running on port 3000'));
```

**后端配置**:
```env
# 使用 Mock 服务
FEISHU_OAUTH_AUTHORIZE_URL=http://feishu-mock:3000/authen/v1/authorize
FEISHU_OAUTH_TOKEN_URL=http://feishu-mock:3000/authen/v1/oauth/token
FEISHU_USER_INFO_URL=http://feishu-mock:3000/contact/v3/users/me
FEISHU_APP_ID=mock_app_id
FEISHU_APP_SECRET=mock_app_secret
```

#### 方案 B: 真实飞书应用 + Ngrok (集成测试)

**实现方式**:
```yaml
ngrok:
  image: wernight/ngrok
  command: ngrok http backend:3000
  ports:
    - "4040:4040"
```

**使用流程**:
1. 注册真实飞书应用（开发环境）
2. 配置重定向 URI 为 ngrok 地址
3. 启动 ngrok 隧道
4. 使用真实飞书账号测试

**优势**:
- 完整真实的 OAuth 流程
- 可测试飞书 Webhook

**劣势**:
- 需要公网地址
- 依赖外部服务

**最终推荐**: **开发用 Mock，集成测试用真实飞书**

---

### 1.5 前端开发环境

**可行性**: ✅ **完全可行**

**实现方案**:
- Vite 开发服务器（热更新）
- 代理后端 API 到本地容器

**配置示例**:
```typescript
// vite.config.ts
export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/oauth': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  }
});
```

**Docker 集成** (可选):
```yaml
frontend:
  build:
    context: ./platform/frontend
    target: development
  volumes:
    - ./platform/frontend:/app
    - /app/node_modules
  ports:
    - "5173:5173"
  environment:
    - VITE_API_BASE_URL=http://localhost:3000
  command: pnpm run dev
```

**优势**:
- 热更新 < 1秒
- 支持 React DevTools
- TypeScript 类型检查

---

## 2. 完整架构设计

### 2.1 本地沙箱架构图

```
┌─────────────────────────────────────────────────────────┐
│                    开发者机器                             │
│  ┌─────────────────────────────────────────────────────┐ │
│  │                  Docker Compose                      │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐          │ │
│  │  │ Frontend │  │ Backend  │  │  Mock    │          │ │
│  │  │  (Vite)  │──│  (Node)  │──│ Feishu   │          │ │
│  │  │  :5173   │  │  :3000   │  │  :3001   │          │ │
│  │  └──────────┘  └────┬─────┘  └──────────┘          │ │
│  │                      │                                │ │
│  │              ┌───────┴────────┐                      │ │
│  │              │  PostgreSQL    │                      │ │
│  │              │    :5432       │                      │ │
│  │              └────────────────┘                      │ │
│  │                      │                                │ │
│  │              ┌───────┴────────┐                      │ │
│  │              │     Redis      │                      │ │
│  │              │    :6379       │                      │ │
│  │              └────────────────┘                      │ │
│  │                                                      │ │
│  │  ┌───────────────────────────────────────────┐      │ │
│  │  │  /var/run/docker.sock (宿主机挂载)        │      │ │
│  │  └───────────────┬───────────────────────────┘      │ │
│  │                  │                                  │ │
│  └──────────────────┼──────────────────────────────────┘ │
│                     │                                     │
│  ┌──────────────────┴──────────────────────────────────┐ │
│  │         宿主机 Docker Daemon                         │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐          │ │
│  │  │Instance1 │  │Instance2 │  │Instance3 │  ...     │ │
│  │  │:8001     │  │:8002     │  │:8003     │          │ │
│  │  └──────────┘  └──────────┘  └──────────┘          │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 2.2 服务清单

| 服务 | 容器名 | 端口 | 内存占用 | 启动时间 |
|------|--------|------|----------|----------|
| Frontend (Vite) | frontend | 5173 | ~200MB | 5s |
| Backend (Node) | backend | 3000 | ~300MB | 3s |
| PostgreSQL | postgres | 5432 | ~100MB | 3s |
| Redis | redis | 6379 | ~30MB | 2s |
| Mock Feishu | feishu-mock | 3001 | ~50MB | 2s |
| **总计** | - | - | **~680MB** | **< 15s** |

**资源要求**:
- 最低配置: 2核4GB (可运行，但较慢)
- 推荐配置: 4核8GB (流畅开发)
- 磁盘空间: ~5GB (含镜像和数据卷)

---

## 3. 关键挑战和解决方案

### 3.1 实例网络隔离

**问题**: 多个 OpenClaw 实例需要独立网络，避免端口冲突

**解决方案**:
```typescript
// DockerService.ts (已实现)
async createContainer(instanceId: string, config: InstanceConfig) {
  const networkName = `opclaw-network-${instanceId}`;

  // 为每个实例创建独立网络
  await this.createNetworkIfNeeded(networkName);

  // 容器加入独立网络
  const container = await this.docker.createContainer({
    NetworkingConfig: {
      EndpointsConfig: {
        [networkName]: {}
      }
    }
  });
}
```

**效果**:
- 每个实例独立网络命名空间
- 实例间网络隔离
- 端口不冲突（实例内部端口固定，外部端口动态分配）

---

### 3.2 实例资源限制

**问题**: 防止单个实例占用过多资源

**解决方案**:
```typescript
// DockerService.ts (已实现)
private readonly DEFAULT_RESOURCE_LIMITS: ResourceLimits = {
  memoryLimit: 1 * 1024 * 1024 * 1024, // 1GB
  cpuQuota: 500000, // 0.5 core
  cpuPeriod: 1000000,
  cpuShares: 512,
};
```

**验证命令**:
```bash
# 查看容器资源使用
docker stats opclaw-instance-123

# 输出示例:
# CONTAINER   CPU %   MEM USAGE / LIMIT   MEM %
# opclaw-...  25%     512MiB / 1GiB       50%
```

---

### 3.3 数据持久化

**问题**: 实例删除后数据需要保留或清理

**解决方案**:
```typescript
// 每个实例独立数据卷
const volumeName = `opclaw-data-${instanceId}`;

// 创建卷
await this.docker.createVolume({ Name: volumeName });

// 挂载到容器
Binds: [`${volumeName}:/app/data`]

// 删除实例时选择是否保留数据
await this.removeContainer(instanceId, {
  force: false,
  removeVolumes: true  // true = 删除数据, false = 保留数据
});
```

---

### 3.4 开发环境热更新

**问题**: 代码修改后如何快速生效

**解决方案**:

**后端**:
```yaml
backend:
  volumes:
    - ./platform/backend:/app
  command: pnpm run dev:docker  # 使用 nodemon
```

**前端**:
```yaml
frontend:
  volumes:
    - ./platform/frontend:/app
    - /app/node_modules  # 防止 node_modules 被覆盖
  command: pnpm run dev  # Vite 热更新
```

**效果**:
- 后端: 代码修改后 nodemon 自动重启 (~2秒)
- 前端: 代码修改后 Vite 热更新 (< 1秒)
- 数据库: schema 修改需手动执行迁移

---

## 4. 推荐方案总结

### 4.1 开发环境配置 (推荐)

```yaml
# docker-compose.dev.yml
version: '3.8'

services:
  # PostgreSQL 数据库
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: opclaw_dev
      POSTGRES_USER: opclaw
      POSTGRES_PASSWORD: dev_password
    volumes:
      - postgres_dev_data:/var/lib/postgresql/data
      - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "5432:5432"

  # Redis 缓存
  redis:
    image: redis:7-alpine
    command: redis-server --requirepass dev_password
    volumes:
      - redis_dev_data:/data
    ports:
      - "6379:6379"

  # Mock 飞书服务
  feishu-mock:
    build: ./mock-services/feishu
    ports:
      - "3001:3000"
    environment:
      MOCK_USER_ID: mock_user_123
      MOCK_USER_NAME: 开发测试用户

  # 后端 API 服务
  backend:
    build:
      context: ./platform/backend
      target: development
    environment:
      NODE_ENV: development
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: opclaw_dev
      DB_USER: opclaw
      DB_PASSWORD: dev_password
      REDIS_HOST: redis
      REDIS_PORT: 6379
      REDIS_PASSWORD: dev_password
      # 使用 Mock 飞书服务
      FEISHU_OAUTH_AUTHORIZE_URL: http://feishu-mock:3000/authen/v1/authorize
      FEISHU_OAUTH_TOKEN_URL: http://feishu-mock:3000/authen/v1/oauth/token
      FEISHU_USER_INFO_URL: http://feishu-mock:3000/contact/v3/users/me
      FEISHU_APP_ID: mock_app_id
      FEISHU_APP_SECRET: mock_app_secret
      FEISHU_REDIRECT_URI: http://localhost:5173/oauth/callback
      JWT_SECRET: dev_jwt_secret_change_in_production
      JWT_EXPIRES_IN: 7d
      DEEPSEEK_API_KEY: ${DEEPSEEK_API_KEY}
      DOCKER_SOCKET_PATH: /var/run/docker.sock
    volumes:
      - ./platform/backend:/app
      - /var/run/docker.sock:/var/run/docker.sock:ro
    ports:
      - "3000:3000"
    depends_on:
      - postgres
      - redis
      - feishu-mock
    command: pnpm run dev

  # 前端应用 (可选，也可独立运行)
  frontend:
    build:
      context: ./platform/frontend
      target: development
    environment:
      VITE_API_BASE_URL: http://localhost:3000
    volumes:
      - ./platform/frontend:/app
      - /app/node_modules
    ports:
      - "5173:5173"
    command: pnpm run dev

volumes:
  postgres_dev_data:
  redis_dev_data:
```

### 4.2 启动命令

```bash
# 一键启动所有服务
docker-compose -f docker-compose.dev.yml up -d

# 查看日志
docker-compose -f docker-compose.dev.yml logs -f backend

# 停止所有服务
docker-compose -f docker-compose.dev.yml down

# 停止并删除数据卷
docker-compose -f docker-compose.dev.yml down -v
```

---

## 5. 开发工作流

### 5.1 首次设置

```bash
# 1. 克隆项目
git clone <repo-url>
cd AIOpc

# 2. 复制环境变量模板
cp platform/backend/.env.example platform/backend/.env.development
cp platform/frontend/.env.example platform/frontend/.env.development

# 3. 配置 DeepSeek API Key (必需)
echo "DEEPSEEK_API_KEY=your_actual_key" >> platform/backend/.env.development

# 4. 启动服务
docker-compose -f docker-compose.dev.yml up -d

# 5. 等待服务启动 (约 15 秒)
sleep 15

# 6. 运行数据库迁移
docker-compose -f docker-compose.dev.yml exec backend pnpm run db:migrate

# 7. 访问应用
open http://localhost:5173
```

### 5.2 日常开发

```bash
# 启动服务
docker-compose -f docker-compose.dev.yml up -d

# 后端开发 (代码自动重载)
cd platform/backend
# 编辑代码，nodemon 自动重启

# 前端开发 (热更新)
cd platform/frontend
# 编辑代码，Vite 热更新

# 查看日志
docker-compose -f docker-compose.dev.yml logs -f backend
docker-compose -f docker-compose.dev.yml logs -f frontend

# 运行测试
docker-compose -f docker-compose.dev.yml exec backend pnpm run test

# 重启服务
docker-compose -f docker-compose.dev.yml restart backend
```

### 5.3 调试技巧

**后端调试**:
```bash
# 进入容器
docker-compose -f docker-compose.dev.yml exec backend sh

# 查看 PostgreSQL
docker-compose -f docker-compose.dev.yml exec postgres psql -U opclaw -d opclaw_dev

# 查看 Redis
docker-compose -f docker-compose.dev.yml exec redis redis-cli -a dev_password

# 查看创建的实例
docker ps | grep opclaw-instance

# 查看实例日志
docker logs opclaw-instance-123
```

**前端调试**:
```bash
# 浏览器开发者工具
# - React DevTools
# - Network 查看API调用
# - Console 查看错误
```

---

## 6. 风险评估

| 风险项 | 严重性 | 概率 | 缓解措施 |
|--------|--------|------|----------|
| Docker socket 权限过高 | 中 | 高 | 开发环境可接受；生产环境禁用 |
| Mock 服务与真实服务差异 | 低 | 中 | 集成测试阶段使用真实飞书 |
| 实例资源耗尽 | 中 | 低 | 已实现资源限制 (0.5核+1GB) |
| 数据卷占用空间过大 | 低 | 低 | 定期清理未使用实例 |
| 端口冲突 | 低 | 中 | Docker 动态端口映射 |

---

## 7. 性能预估

### 7.1 启动时间

| 操作 | 时间 |
|------|------|
| docker-compose up | ~15秒 |
| 后端服务启动 | ~3秒 |
| 前端服务启动 | ~5秒 |
| 实例创建 (首次拉取镜像) | ~30秒 |
| 实例创建 (镜像已存在) | ~3秒 |

### 7.2 运行时性能

| 操作 | 性能 |
|------|------|
| API 响应时间 | < 100ms |
| 数据库查询 | < 50ms |
| Redis 读写 | < 10ms |
| 实例启动时间 | ~5秒 |
| 前端热更新 | < 1秒 |

### 7.3 资源占用

**开发环境** (1个实例运行):
- CPU: ~10% (空闲), ~30% (负载)
- 内存: ~680MB (基础服务) + 1GB (实例) = ~1.7GB
- 磁盘: ~5GB (含镜像和数据卷)

**建议硬件配置**:
- 最低: 2核4GB (可运行，但体验较差)
- 推荐: 4核8GB (流畅开发)
- 理想: 8核16GB (可运行 5-10 个并发实例)

---

## 8. 下一步行动

### 8.1 立即执行 (优先级 P0)

1. ✅ 创建 `docker-compose.dev.yml`
2. ✅ 创建 Mock 飞书服务
3. ✅ 创建数据库初始化脚本
4. ✅ 创建环境变量模板
5. ✅ 编写本地开发指南

### 8.2 短期优化 (优先级 P1)

1. 添加开发环境启动脚本 (`scripts/setup-local-dev.sh`)
2. 添加开发环境健康检查
3. 添加数据库迁移自动化
4. 添加日志聚合 (ELK 或 Loki)
5. 添加性能监控 (Prometheus + Grafana)

### 8.3 长期改进 (优先级 P2)

1. 添加 CI/CD 集成
2. 添加自动化测试
3. 添加负载测试工具
4. 添加多环境配置 (dev/staging/prod)
5. 添加灾难恢复演练

---

## 9. 总结

### 核心结论

✅ **本地沙箱环境高度可行**，所有技术挑战都有成熟解决方案。

### 关键优势

1. **零成本**: 开发阶段无需云资源
2. **快速迭代**: 秒级启动，热更新
3. **完整测试**: 支持端到端功能测试
4. **生产兼容**: 代码可直接部署到生产环境

### 实施建议

1. **Week 1-2**: 搭建本地沙箱环境
2. **Week 3-4**: 完成功能开发和测试
3. **Week 5-6**: 真实飞书集成测试
4. **Week 7-8**: 云资源采购和生产部署

### 成功标准

- [ ] 15秒内启动完整开发环境
- [ ] 支持完整的 OAuth 流程 (Mock)
- [ ] 支持实例创建和管理
- [ ] 支持热更新和快速迭代
- [ ] 代码可直接部署到生产环境

---

**评估人**: Claude (AI Assistant)
**评估日期**: 2026-03-14
**文档版本**: 1.0
**下次评审**: 2周后或 FIP-001 方案调整时
