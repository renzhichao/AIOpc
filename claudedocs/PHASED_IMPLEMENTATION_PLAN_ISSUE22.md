# Issue #22 分阶段实施计划
# Dashboard 会话恢复功能 - 分阶段交付策略

**文档版本**: 1.0
**创建日期**: 2026-03-19
**Issue**: #22
**策略**: 分阶段修复（基于架构和测试专家评审）

---

## 📋 执行摘要

基于架构专家和测试专家的评审意见，我们将实施计划分为两个阶段：

- **Phase 1 (核心功能)**: 交付最小可用产品，重点实现会话持久化和历史展示
- **Phase 2 (优化增强)**: 补充性能优化、安全加固、完整测试覆盖

**目标**: 在 3-4 周内交付可用的核心功能，同时在后续迭代中解决技术债务。

---

## 🎯 Phase 1: 核心功能实现 (Week 1-3)

### 目标范围

**✅ 在 Phase 1 实现的功能**:

1. **数据持久化层**
   - ✅ Conversation 和 ConversationMessage Entity
   - ✅ 数据库 Migration
   - ✅ 基础 Repository 实现

2. **后端 API 核心**
   - ✅ 会话 CRUD API (创建、查询、删除、重命名)
   - ✅ 消息保存 API
   - ✅ 用户实例列表 API
   - ✅ JWT 认证集成

3. **前端核心组件**
   - ✅ Dashboard 实例列表
   - ✅ 会话列表页面
   - ✅ 会话历史消息展示
   - ✅ 基础路由和导航

4. **基础会话恢复**
   - ✅ 从数据库加载历史消息
   - ✅ 在 Chat 页面显示历史对话
   - ⚠️ **限制**: Agent 无法访问历史上下文（仅展示，无法智能继续）

**❌ Phase 1 暂不实现** (推迟到 Phase 2):

- 🔴 Agent 内存恢复机制（最复杂）
- 🔴 WebSocket 消息自动持久化
- 🔴 性能优化（N+1 查询）
- 🔴 完整的安全检查（会话所有权验证）
- 🔴 完整测试覆盖

---

### Phase 1 实施步骤

#### Week 1: 数据层和后端 API

**Day 1-2: 数据库实现**
```bash
# 创建 Entity
platform/backend/src/entities/Conversation.entity.ts
platform/backend/src/entities/ConversationMessage.entity.ts

# 创建 Migration
platform/backend/migrations/*.ts

# 验证数据库结构
docker exec opclaw-postgres psql -U opclaw -d opclaw_ciiber -c "\d conversations"
```

**Day 3-4: Repository 和 Service**
```bash
# 创建 Repository
platform/backend/src/repositories/Conversation.repository.ts
platform/backend/src/repositories/ConversationMessage.repository.ts

# 创建 Service
platform/backend/src/services/ConversationService.ts
platform/backend/src/services/MessageService.ts
platform/backend/src/services/UserInstanceService.ts
```

**Day 5: Controller 和 API 端点**
```bash
# 创建 Controller
platform/backend/src/controllers/ConversationController.ts
platform/backend/src/controllers/MessageController.ts
platform/backend/src/controllers/UserInstanceController.ts

# API 端点验证
curl http://localhost:3000/api/conversations
curl http://localhost:3000/api/user/instances
```

#### Week 2: 前端组件

**Day 1-2: API 客户端和类型定义**
```bash
# 创建 API 客户端
platform/frontend/src/lib/api/conversationApi.ts
platform/frontend/src/lib/api/instanceApi.ts
platform/frontend/src/types/conversation.ts
```

**Day 3-4: Dashboard 和实例列表**
```bash
# 创建组件
platform/frontend/src/components/dashboard/InstanceCard.tsx
platform/frontend/src/components/dashboard/InstanceList.tsx

# 更新页面
platform/frontend/src/pages/DashboardPage.tsx
```

**Day 5: 会话列表**
```bash
# 创建组件
platform/frontend/src/components/conversations/ConversationCard.tsx
platform/frontend/src/components/conversations/ConversationList.tsx

# 创建页面
platform/frontend/src/pages/ConversationListPage.tsx
```

#### Week 3: 会话恢复和集成

**Day 1-2: 会话 Context 和 Hooks**
```bash
# 创建 Context
platform/frontend/src/contexts/ConversationContext.tsx

# 创建 Hooks
platform/frontend/src/hooks/useConversations.ts
platform/frontend/src/hooks/useConversationRestore.ts
```

**Day 3-4: Chat 页面集成**
```bash
# 修改 Chat 页面支持会话恢复
platform/frontend/src/pages/ChatPage.tsx

# 添加路由
/src/app.tsx
```

**Day 5: 基础测试和调试**
- 手动测试核心流程
- 修复关键 Bug
- 准备 Demo

---

### Phase 1 验收标准

**功能验收**:
- ✅ 用户可以在 Dashboard 看到已认领的实例列表
- ✅ 点击实例可以看到该实例的所有会话列表
- ✅ 点击会话可以进入 Chat 页面并看到历史消息
- ✅ 可以创建新会话
- ✅ 可以删除和重命名会话

**性能验收** (可放宽):
- ⚠️ 实例列表加载时间 < 2s (Phase 1 允许)
- ⚠️ 会话列表加载时间 < 2s (Phase 1 允许)
- ⚠️ 会话恢复时间 < 3s (Phase 1 允许)

**安全验收** (最低要求):
- ✅ 需要登录才能访问（JWT 验证）
- ⚠️ 会话所有权验证（Phase 2 完整实现）

---

## 🔧 Phase 2: 优化和增强 (Week 4-6)

### 目标范围

基于 Phase 1 的实际使用反馈，补充以下功能：

#### 2.1 Agent 内存恢复机制 (最关键)

**问题**: Phase 1 只能显示历史消息，Agent 无法获取上下文

**解决方案**:
```typescript
// Agent 上下文恢复 API
POST /api/conversations/:conversationId/restore
Response: {
  messages: Array<{
    role: 'user' | 'assistant',
    content: string,
    timestamp: string
  }>,
  context: {
    tools: string[],      // 历史使用的工具
    skills: string[],     // 历史使用的技能
    metadata: Record<string, any>
  }
}
```

**实施**:
1. 在 ConversationMessage 中记录 tool_calls 和 tool_results
2. 恢复时重建 Agent 的会话上下文
3. 传递给 OpenClaw Agent 框架

**工作量**: 3-4天

#### 2.2 性能优化

**N+1 查询问题**:
```typescript
// Phase 1: 21次查询 (20个实例 + 1次用户查询)
for (instance of instances) {
  instance.conversationCount = await db.count(conversations, { instanceId: instance.id });
}

// Phase 2: 2次查询 (使用 JOIN)
SELECT i.*, COUNT(c.id) as conversation_count
FROM instances i
LEFT JOIN conversations c ON c.instance_id = i.id
WHERE i.user_id = $1
GROUP BY i.id
```

**数据库触发器优化**:
```sql
-- 使用消息队列异步更新 message_count
CREATE OR REPLACE FUNCTION update_message_count_async()
RETURNS TRIGGER AS $$
BEGIN
  -- 发送到 Redis 队列
  SELECT pg_notify('conversation_update', NEW.conversation_id::text);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
```

**工作量**: 2-3天

#### 2.3 安全加固

**会话所有权验证**:
```typescript
// 在每个 API 端点添加
@Get(':conversationId')
async getConversation(@Param('conversationId') conversationId: string, @Request() req) {
  const conversation = await this.conversationService.findById(conversationId);

  // 验证所有权
  if (conversation.userId !== req.user.userId) {
    throw new ForbiddenException('You do not own this conversation');
  }

  return conversation;
}
```

**TOCTOU 竞争条件修复**:
```typescript
// 使用数据库事务和行级锁
async updateConversationTitle(conversationId: string, userId: string, title: string) {
  return await this.dataSource.transaction(async (manager) => {
    const conversation = await manager.findOne(Conversation, {
      where: { id: conversationId },
      lock: { mode: 'pessimistic_write' }  // 行级写锁
    });

    if (conversation.userId !== userId) {
      throw new ForbiddenException();
    }

    conversation.title = title;
    return await manager.save(conversation);
  });
}
```

**工作量**: 2天

#### 2.4 完整测试覆盖

**单元测试** (覆盖率 > 80%):
- Repository 层测试
- Service 层测试
- Controller 层测试
- 组件测试

**集成测试**:
- API 端到端测试
- 数据库集成测试
- 认证授权测试

**性能测试**:
- 负载测试（100+ 并发用户）
- 压力测试（1000+ 会话）
- 数据库查询性能测试

**工作量**: 5-7天

#### 2.5 WebSocket 消息自动持久化

**消息拦截器**:
```typescript
// WebSocket Gateway 拦截器
@SubscribeMessage('message')
async handleMessage(client: Socket, payload: MessagePayload) {
  // 1. 保存到数据库
  await this.messageService.saveMessage(conversationId, payload);

  // 2. 转发给 Agent
  await this.agentService.processMessage(conversationId, payload);

  // 3. 返回响应
  return { success: true };
}
```

**工作量**: 2-3天

---

### Phase 2 验收标准

**功能验收**:
- ✅ Agent 能访问历史会话上下文
- ✅ 恢复的会话能智能继续对话
- ✅ WebSocket 消息自动保存
- ✅ 所有 API 有完整的授权检查

**性能验收** (达标):
- ✅ 实例列表加载时间 < 500ms
- ✅ 会话列表加载时间 < 500ms
- ✅ 会话恢复时间 < 1s
- ✅ 支持 100+ 并发用户

**安全验收** (完整):
- ✅ 会话所有权严格验证
- ✅ 无 TOCTOU 竞争条件
- ✅ 输入验证和 SQL 注入防护
- ✅ XSS 防护

**测试验收**:
- ✅ 单元测试覆盖率 > 80%
- ✅ 集成测试覆盖所有 API
- ✅ E2E 测试覆盖核心用户流程
- ✅ 性能测试通过

---

## 📊 分阶段优先级矩阵

| 功能 | Phase 1 | Phase 2 | 优先级 | 复杂度 | 工作量 |
|------|---------|---------|--------|--------|--------|
| 数据库 Entity | ✅ | | P0 | 低 | 2天 |
| 会话 CRUD API | ✅ | | P0 | 低 | 3天 |
| 实例列表 UI | ✅ | | P0 | 中 | 3天 |
| 会话列表 UI | ✅ | | P0 | 中 | 3天 |
| 历史消息展示 | ✅ | | P0 | 中 | 3天 |
| Agent 上下文恢复 | | ✅ | P0 | 高 | 4天 |
| WebSocket 持久化 | | ✅ | P0 | 中 | 3天 |
| 性能优化 (N+1) | | ✅ | P1 | 中 | 2天 |
| 安全加固 | | ✅ | P0 | 中 | 2天 |
| 完整测试覆盖 | | ✅ | P0 | 高 | 7天 |
| 数据库触发器优化 | | ✅ | P2 | 低 | 1天 |

---

## 🚨 风险和缓解

### Phase 1 风险

**风险 1: 用户期望 Agent 能理解历史**
- **影响**: 用户可能会觉得恢复的会话"不够智能"
- **缓解**: 在 UI 上明确提示"历史会话仅显示对话记录，AI 无法访问历史上下文"
- **沟通**: 在功能说明中标注这是 Phase 1 功能

**风险 2: 性能问题影响体验**
- **影响**: 加载时间过长可能导致用户放弃
- **缓解**: 添加 Loading 状态和骨架屏，提供良好的等待体验
- **监控**: 记录实际性能数据，为 Phase 2 优化提供依据

**风险 3: 安全漏洞被利用**
- **影响**: 用户可能访问他人的会话
- **缓解**: 至少实现基础的会话所有权检查
- **限制**: Phase 1 仅限内部测试用户使用

### Phase 2 风险

**风险 1: Agent 上下文恢复技术难度**
- **影响**: 可能需要更长时间实现
- **缓解**: 提前与 OpenClaw 团队沟通状态持久化接口
- **备选**: 先实现简化版本（仅传递消息历史）

**风险 2: 性能优化效果不达标**
- **影响**: 仍无法支持大规模并发
- **缓解**: 设置分阶段目标（先支持 50 并发，再 100，再 200）
- **备选**: 考虑引入 Redis 缓存层

---

## 📅 时间线总览

| 阶段 | 周数 | 工作日 | 关键交付物 | 状态 |
|------|------|--------|-----------|------|
| **Phase 1: 核心功能** | | | | |
| Week 1: 数据层和 API | 1 | 5 | Entity, Migration, API 端点 | ⏳ 待开始 |
| Week 2: 前端组件 | 1 | 5 | 实例列表、会话列表组件 | ⏳ 待开始 |
| Week 3: 集成和调试 | 1 | 5 | 会话恢复、基础测试 | ⏳ 待开始 |
| **Phase 2: 优化增强** | | | | |
| Week 4: Agent 上下文 | 1 | 4 | Agent 内存恢复机制 | ⏳ 待开始 |
| Week 5: 性能和安全 | 1 | 5 | 性能优化、安全加固 | ⏳ 待开始 |
| Week 6: 测试和文档 | 1 | 7 | 完整测试覆盖、文档更新 | ⏳ 待开始 |

**总计**: 6周（30个工作日）

---

## ✅ 成功指标

### Phase 1 成功标准

**功能完整性**:
- ✅ 用户能看到已认领实例
- ✅ 用户能看到历史会话列表
- ✅ 用户能看到历史消息内容

**基本可用性**:
- ✅ 主要流程无阻塞性 Bug
- ✅ 加载时间在可接受范围内（< 3s）
- ✅ UI 响应式布局正常

**技术可行性验证**:
- ✅ 数据库设计合理
- ✅ API 设计可行
- ✅ 前后端集成正常

### Phase 2 成功标准

**生产就绪**:
- ✅ 所有 P0 功能完整实现
- ✅ 性能指标达标
- ✅ 安全测试通过
- ✅ 测试覆盖率 > 80%

**用户体验**:
- ✅ 会话恢复功能流畅
- ✅ Agent 能智能继续对话
- ✅ 无明显性能瓶颈

---

## 🔄 迭代反馈机制

### Phase 1 完成后评估

**技术评估**:
1. 实际性能数据收集（加载时间、查询次数）
2. 用户反馈收集（功能可用性、期望功能）
3. 技术债务评估（代码质量、架构合理性）

**决策点**:
- Phase 2 是否需要调整优先级？
- 是否需要增加资源（开发时间、人力）？
- 是否有新的阻塞性问题？

### Phase 2 规划调整

根据 Phase 1 的实际情况，可能需要调整：
- Agent 上下文恢复的技术方案
- 性能优化的优先级
- 测试策略的实施细节

---

## 📚 相关文档

- [Issue #22 Requirements Analysis](./REQUIREMENTS_ANALYSIS_ISSUE22.md)
- [Frontend FIP](../fips/FIP_022_DASHBOARD_SESSION_RECOVERY.md)
- [Backend FIP](../fips/FIP_022_BACKEND_IMPLEMENTATION.md)
- [Architecture Review](./ARCHITECTURE_REVIEW_ISSUE22.md)
- [Testing Review](./TESTING_REVIEW_ISSUE22.md)

---

**文档维护**: 本文档应在每个 Phase 完成后更新实际进展和经验教训。
