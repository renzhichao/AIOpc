# Issue #22 需求分析文档
# 飞书应用主页显示用户认领的实例并支持会话恢复

**文档版本**: 1.0
**创建日期**: 2026-03-19
**Issue**: #22
**优先级**: P0
**预计工作量**: 2-3 周

---

## 1. 执行摘要

### 1.1 背景
当前系统支持飞书 OAuth 认证和实例认领功能，但缺少两个关键用户体验功能：
1. 用户无法在主页查看已认领的实例列表
2. 用户无法恢复之前的对话会话

### 1.2 GAP 分析摘要
- ✅ **已有功能**: 飞书 OAuth、实例认领、Dashboard 路由、JWT 认证
- ❌ **缺失功能**: 会话持久化、会话历史 UI、上下文恢复
- 🔄 **需扩展**: Dashboard 页面（添加实例列表）、ChatController（实现会话 API）

### 1.3 核心目标
1. 在 `/dashboard` 页面显示用户已认领的实例列表
2. 实现会话历史持久化存储
3. 实现会话恢复功能，恢复完整的对话上下文

---

## 2. 功能需求分解

### 2.1 核心功能 (P0 必须实现)

#### FR-1: 实例列表展示
**用户故事**: 作为已认领实例的用户，我希望在主页看到我的所有实例，以便快速访问。

**功能描述**:
- 在 `/dashboard` 路由显示用户已认领的实例列表
- 每个实例卡片显示：
  - 实例名称（默认："租户名-实例ID"，用户可自定义）
  - 实例状态（运行中/已停止/维护中）
  - 最后访问时间（相对时间，如"2小时前"）
  - 快速进入按钮
  - 会话历史入口

**验收标准**:
- [ ] 用户登录后，Dashboard 页面加载已认领实例列表
- [ ] 列表按最后访问时间倒序排列
- [ ] 显示实例的实时状态（健康检查）
- [ ] 未认领任何实例时显示引导卡片

#### FR-2: 会话历史列表
**用户故事**: 作为用户，我希望看到某个实例的所有历史会话，以便恢复之前的对话。

**功能描述**:
- 点击实例卡片进入会话列表页面
- 显示该实例的所有会话，每个会话显示：
  - 会话标题（自动生成：基于首条消息或"未命名会话"）
  - 会话预览（最后一条消息的内容摘要）
  - 消息数量
  - 创建时间
  - 最后更新时间

**验收标准**:
- [ ] 会话按最后更新时间倒序排列
- [ ] 显示至少 50 个历史会话
- [ ] 支持分页加载（每页 20 条）
- [ ] 点击会话卡片进入对话界面并恢复上下文

#### FR-3: 会话上下文恢复
**用户故事**: 作为用户，我希望点击历史会话后能恢复完整的对话上下文，包括之前的所有消息和 Agent 的记忆。

**功能描述**:
- 恢复会话时，加载完整的消息历史
- 恢复 Agent 的记忆状态（如果 Agent 支持持久化）
- 恢复对话的工具调用历史
- 确保恢复后的对话能无缝继续

**验收标准**:
- [ ] 恢复的会话显示所有历史消息
- [ ] Agent 能访问会话的历史上下文
- [ ] 恢复后的对话保持连贯性
- [ ] 支持恢复到任意历史消息点

### 2.2 增强功能 (P1 应该实现)

#### FR-4: 会话管理操作
- 会话重命名
- 删除会话（需二次确认）
- 会话归档/取消归档
- 会话导出（Markdown/JSON）

#### FR-5: 会话搜索和过滤
- 按时间范围筛选会话
- 按关键词搜索会话内容
- 按消息数量排序

#### FR-6: 实例管理增强
- 实例重命名
- 实例状态监控（CPU、内存、消息数量）
- 实例设置（API Key 配置、模型选择）

---

## 3. 技术需求

### 3.1 数据库设计

#### 3.1.1 新增实体：Conversation（会话）
```typescript
// platform/backend/src/entities/Conversation.entity.ts
@Entity('conversations')
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'instance_id' })
  instanceId: string;

  @Column({ name: 'title', default: '未命名会话' })
  title: string;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'last_message_at', type: 'timestamp', nullable: true })
  lastMessageAt: Date;

  @Column({ name: 'message_count', default: 0 })
  messageCount: number;

  @Column({ name: 'is_archived', default: false })
  isArchived: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @OneToMany(() => ConversationMessage, (message) => message.conversation)
  messages: ConversationMessage[];

  @ManyToOne(() => User, (user) => user.conversations)
  user: User;

  @ManyToOne(() => Instance, (instance) => instance.conversations)
  instance: Instance;
}
```

#### 3.1.2 新增实体：ConversationMessage（会话消息）
```typescript
// platform/backend/src/entities/ConversationMessage.entity.ts
@Entity('conversation_messages')
export class ConversationMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'conversation_id' })
  conversationId: string;

  @Column({ name: 'role' })
  role: 'user' | 'assistant' | 'system';

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'jsonb', nullable: true })
  toolCalls: any[];

  @Column({ type: 'jsonb', nullable: true })
  toolResults: any[];

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @ManyToOne(() => Conversation, (conversation) => conversation.messages)
  conversation: Conversation;
}
```

#### 3.1.3 修改现有实体

**User 实体扩展**:
```typescript
// 添加关系
@OneToMany(() => Conversation, (conversation) => conversation.user)
conversations: Conversation[];
```

**Instance 实体扩展**:
```typescript
// 添加关系
@OneToMany(() => Conversation, (conversation) => conversation.instance)
conversations: Conversation[];
```

### 3.2 API 设计

#### 3.2.1 实例管理 API

**获取用户实例列表**:
```typescript
GET /api/user/instances
Response: {
  success: true,
  instances: [
    {
      id: string,
      instanceId: string,
      name: string,
      tenantId: string,
      status: 'running' | 'stopped' | 'maintenance',
      lastAccessedAt: string,
      conversationCount: number,
      createdAt: string
    }
  ]
}
```

**更新实例最后访问时间**:
```typescript
POST /api/user/instances/:instanceId/access
Response: {
  success: true,
  instance: { instanceId: string, lastAccessedAt: string }
}
```

#### 3.2.2 会话管理 API

**获取实例的会话列表**:
```typescript
GET /api/instances/:instanceId/conversations?limit=20&offset=0
Response: {
  success: true,
  conversations: [
    {
      id: string,
      title: string,
      preview: string,
      messageCount: number,
      createdAt: string,
      lastMessageAt: string,
      isArchived: boolean
    }
  ],
  total: number,
  hasMore: boolean
}
```

**创建新会话**:
```typescript
POST /api/instances/:instanceId/conversations
Body: { title?: string }
Response: {
  success: true,
  conversation: { id: string, title: string, createdAt: string }
}
```

**获取会话详情**:
```typescript
GET /api/conversations/:conversationId
Response: {
  success: true,
  conversation: {
    id: string,
    instanceId: string,
    title: string,
    messages: [
      {
        id: string,
        role: 'user' | 'assistant',
        content: string,
        toolCalls: any[],
        createdAt: string
      }
    ],
    createdAt: string,
    lastMessageAt: string
  }
}
```

**删除会话**:
```typescript
DELETE /api/conversations/:conversationId
Response: {
  success: true,
  message: '会话已删除'
}
```

**重命名会话**:
```typescript
PATCH /api/conversations/:conversationId
Body: { title: string }
Response: {
  success: true,
  conversation: { id: string, title: string }
}
```

#### 3.2.3 消息管理 API

**保存消息到会话**:
```typescript
POST /api/conversations/:conversationId/messages
Body: {
  role: 'user' | 'assistant',
  content: string,
  toolCalls?: any[],
  toolResults?: any[]
}
Response: {
  success: true,
  message: { id: string, createdAt: string }
}
```

### 3.3 前端组件设计

#### 3.3.1 Dashboard 页面增强

**文件**: `platform/frontend/src/pages/DashboardPage.tsx`

**新增组件**:
```typescript
// platform/frontend/src/components/dashboard/InstanceList.tsx
export function InstanceList() {
  // 显示用户已认领的实例卡片
  // 支持快速进入和查看会话历史
}

// platform/frontend/src/components/dashboard/InstanceCard.tsx
export function InstanceCard({ instance }: { instance: UserInstance }) {
  // 单个实例卡片
  // 显示实例信息、状态、操作按钮
}
```

#### 3.3.2 会话历史页面

**新增文件**:
```typescript
// platform/frontend/src/pages/ConversationListPage.tsx
export function ConversationListPage() {
  // 会话列表页面
  // 显示某个实例的所有会话
}

// platform/frontend/src/components/conversations/ConversationCard.tsx
export function ConversationCard({ conversation }: { conversation: Conversation }) {
  // 会话卡片
  // 显示会话标题、预览、时间、操作按钮
}
```

#### 3.3.3 Chat 页面增强

**修改文件**: `platform/frontend/src/pages/ChatPage.tsx`

**新增功能**:
- 支持从历史会话恢复
- 显示会话历史加载状态
- 自动保存对话到当前会话

#### 3.3.4 Context 和 Hooks

**新增文件**:
```typescript
// platform/frontend/src/contexts/ConversationContext.tsx
export const ConversationContext = createContext<{
  conversations: Conversation[];
  loadConversations: (instanceId: string) => Promise<void>;
  createConversation: (instanceId: string, title?: string) => Promise<Conversation>;
  restoreConversation: (conversationId: string) => Promise<void>;
  saveMessage: (conversationId: string, message: Message) => Promise<void>;
}>();

// platform/frontend/src/hooks/useConversations.ts
export function useConversations(instanceId: string) {
  // 获取会话列表
}

// platform/frontend/src/hooks/useConversationRestore.ts
export function useConversationRestore(conversationId: string) {
  // 恢复会话上下文
}
```

### 3.4 后端服务设计

#### 3.4.1 ConversationService

**新增文件**: `platform/backend/src/services/ConversationService.ts`

```typescript
@Injectable()
export class ConversationService {
  async createConversation(userId: string, instanceId: string, title?: string) {
    // 创建新会话
  }

  async getConversations(instanceId: string, userId: string, limit?: number, offset?: number) {
    // 获取会话列表
  }

  async getConversationById(conversationId: string, userId: string) {
    // 获取会话详情（包含所有消息）
  }

  async addMessage(conversationId: string, message: CreateMessageDto) {
    // 添加消息到会话
  }

  async deleteConversation(conversationId: string, userId: string) {
    // 删除会话（级联删除消息）
  }

  async updateConversationTitle(conversationId: string, title: string, userId: string) {
    // 更新会话标题
  }

  async restoreConversation(conversationId: string, userId: string) {
    // 恢复会话（返回完整上下文）
  }
}
```

#### 3.4.2 UserInstanceService

**新增文件**: `platform/backend/src/services/UserInstanceService.ts`

```typescript
@Injectable()
export class UserInstanceService {
  async getUserInstances(userId: string) {
    // 获取用户的所有实例
  }

  async updateLastAccessed(userId: string, instanceId: string) {
    // 更新最后访问时间
  }

  async getInstanceStats(instanceId: string) {
    // 获取实例统计信息
  }
}
```

---

## 4. 实现计划

### 4.1 Phase 1: 数据库和基础服务 (Week 1)

**任务清单**:
1. ✅ 创建数据库迁移脚本
2. ✅ 创建 Conversation 和 ConversationMessage 实体
3. ✅ 创建 ConversationRepository 和 ConversationMessageRepository
4. ✅ 实现 ConversationService（CRUD 操作）
5. ✅ 实现 UserInstanceService
6. ✅ 编写单元测试

**输出**:
- 新增 2 个 Entity、2 个 Repository、2 个 Service
- 数据库迁移文件
- 单元测试覆盖率 > 80%

### 4.2 Phase 2: API 端点实现 (Week 1-2)

**任务清单**:
1. ✅ 创建 ConversationController
2. ✅ 实现会话管理 API 端点
3. ✅ 实现消息管理 API 端点
4. ✅ 实现用户实例 API 端点
5. ✅ 集成 JWT 认证和权限验证
6. ✅ 编写 API 集成测试

**输出**:
- 新增 1 个 Controller
- 10+ 个 API 端点
- API 集成测试套件

### 4.3 Phase 3: 前端实例列表 (Week 2)

**任务清单**:
1. ✅ 创建 InstanceCard 组件
2. ✅ 创建 InstanceList 组件
3. ✅ 修改 DashboardPage 集成实例列表
4. ✅ 实现实例状态轮询
5. ✅ 实现快速进入功能
6. ✅ 添加空状态和加载状态

**输出**:
- 新增 2 个组件
- 修改 1 个页面
- 实例列表功能完整

### 4.4 Phase 4: 前端会话历史 (Week 2-3)

**任务清单**:
1. ✅ 创建 ConversationList 页面
2. ✅ 创建 ConversationCard 组件
3. ✅ 创建 ConversationContext
4. ✅ 实现 useConversations 和 useConversationRestore hooks
5. ✅ 修改 ChatPage 支持会话恢复
6. ✅ 实现消息自动保存
7. ✅ 添加会话管理 UI（重命名、删除）

**输出**:
- 新增 1 个页面、3 个组件
- 新增 2 个 hooks
- 修改 1 个页面
- 会话历史功能完整

### 4.5 Phase 5: 集成测试和优化 (Week 3)

**任务清单**:
1. ✅ 端到端测试
2. ✅ 性能优化（数据库查询、前端渲染）
3. ✅ 用户体验优化（加载状态、错误处理）
4. ✅ 文档完善
5. ✅ 部署和验证

**输出**:
- E2E 测试套件
- 性能优化报告
- 用户文档
- 生产部署验证

---

## 5. 验收标准

### 5.1 功能验收

#### FR-1: 实例列表展示
- [ ] 用户登录后，Dashboard 显示已认领实例
- [ ] 实例卡片显示：名称、状态、最后访问时间
- [ ] 点击快速进入按钮跳转到对话页面
- [ ] 未认领实例时显示引导卡片

#### FR-2: 会话历史列表
- [ ] 点击实例进入会话列表页面
- [ ] 显示所有历史会话（按时间倒序）
- [ ] 会话卡片显示：标题、预览、消息数、时间
- [ ] 支持分页加载（每页 20 条）

#### FR-3: 会话上下文恢复
- [ ] 点击会话卡片进入对话页面
- [ ] 历史消息完整显示
- [ ] Agent 能访问历史上下文
- [ ] 恢复后能继续对话

### 5.2 性能验收

- 实例列表加载时间 < 500ms
- 会话列表加载时间 < 500ms
- 会话恢复时间 < 1s
- 支持至少 1000 个会话/用户
- 支持至少 100 条消息/会话

### 5.3 兼容性验收

- 支持飞书 OAuth 用户
- 支持现有的实例认领流程
- 兼容现有的 Chat 页面功能
- 兼容现有的 WebSocket 消息机制

---

## 6. 风险和挑战

### 6.1 技术风险

**风险 1: 会话上下文恢复的复杂性**
- 描述: Agent 的记忆状态如何持久化和恢复
- 影响: 高
- 缓解措施:
  - 先实现简单的消息历史恢复
  - Agent 记忆恢复作为 Phase 2 功能

**风险 2: 大量消息的性能问题**
- 描述: 历史会话可能包含大量消息，加载缓慢
- 影响: 中
- 缓解措施:
  - 实现分页加载消息
  - 使用虚拟滚动优化渲染
  - 添加消息数量限制

**风险 3: 多实例并发访问**
- 描述: 用户可能同时打开多个实例的多个会话
- 影响: 中
- 缓解措施:
  - 使用会话隔离机制
  - WebSocket 连接池管理

### 6.2 业务风险

**风险 4: 用户习惯改变**
- 描述: 用户可能不习惯使用会话恢复功能
- 影响: 低
- 缓解措施:
  - 提供清晰的 UI 引导
  - 默认创建会话并自动保存
  - 在首次使用时显示功能介绍

### 6.3 依赖风险

**风险 5: 依赖 OpenClaw Agent 框架**
- 描述: 会话恢复需要 Agent 框架支持状态持久化
- 影响: 高
- 缓解措施:
  - 先实现不依赖 Agent 的消息历史恢复
  - 与 OpenClaw 团队沟通状态持久化接口

---

## 7. 成功指标

### 7.1 功能指标
- 用户能看到已认领的实例列表
- 用户能恢复历史会话
- 会话历史完整保存
- 会话恢复后能继续对话

### 7.2 性能指标
- 实例列表加载时间 < 500ms
- 会话列表加载时间 < 500ms
- 会话恢复时间 < 1s

### 7.3 用户体验指标
- 新用户能在首次使用时理解会话功能
- 老用户能快速找到历史会话
- 会话恢复过程无感知（不需要额外操作）

---

## 8. 附录

### 8.1 相关文档
- [Issue #22](https://github.com/renzhichao/AIOpc/issues/22)
- [GAP Analysis Report](./GAP_ANALYSIS_ISSUE22.md)
- [数据库设计文档](../platform/backend/docs/DATABASE_SCHEMA.md)
- [飞书 OAuth 集成文档](../platform/backend/docs/FEISHU_OAUTH.md)

### 8.2 相关 Issue
- Issue #19 (DevOps 流水线) - ✅ 已完成
- Issue #21 (多租户部署) - ✅ 已完成

### 8.3 技术栈
- **前端**: React + TypeScript + Vite
- **后端**: NestJS + TypeORM + PostgreSQL
- **认证**: Feishu OAuth + JWT
- **实时通信**: WebSocket (Socket.IO)
- **数据库**: PostgreSQL 16

---

**文档维护**: 本文档应随开发进展同步更新，确保需求、设计和实现的一致性。
