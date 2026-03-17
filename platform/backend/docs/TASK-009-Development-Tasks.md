# TASK-009: 前端远程实例认领和对话功能 - 开发任务

## 任务概述

**父任务**: TASK-009
**FIP 文档**: [FIP-009](./FIP-009-remote-instance-frontend.md)
**GAP 分析**: [GAP Analysis](./GAP-Analysis-Remote-Instance-Frontend.md)
**预计工时**: 40-60 小时
**优先级**: P0 (关键)

---

## 任务列表

### Phase 1: 后端 API 扩展 (6-8 小时)

#### TASK-009-01: 新增后端 API 端点 (4-6 小时)

**描述**: 扩展 InstanceController，新增面向前端的远程实例管理 API

**文件**:
- `src/controllers/InstanceController.ts` - 新增 4 个端点
- `src/services/InstanceService.ts` - 新增业务逻辑方法

**新增 API**:

1. **GET /api/instances/unclaimed** - 获取未认领实例列表
   ```typescript
   async getUnclaimedInstances(params?: {
     deployment_type?: 'remote';
     status?: 'pending';
   }): Promise<Instance[]>
   ```

2. **POST /api/instances/:instanceId/claim** - 认领实例
   ```typescript
   async claimInstance(instanceId: string, userId: number): Promise<Instance>
   ```

3. **DELETE /api/instances/:instanceId/claim** - 释放实例
   ```typescript
   async releaseInstance(instanceId: string, userId: number): Promise<void>
   ```

4. **GET /api/instances/stats** - 获取实例统计
   ```typescript
   async getUserInstanceStats(userId: number): Promise<{
     total: number;
     local: number;
     remote: number;
     unclaimed: number;
     active: number;
     healthy: number;
   }>
   ```

**验收标准**:
- [ ] 所有端点正常响应
- [ ] 正确的认证和授权检查
- [ ] 错误处理完善
- [ ] API 文档更新

**依赖**: 无
**估时**: 4-6 小时

---

#### TASK-009-02: 后端 API 测试 (2 小时)

**描述**: 为新增的 API 端点编写单元测试和集成测试

**文件**:
- `tests/controllers/InstanceController.test.ts`
- `tests/services/InstanceService.test.ts`

**测试用例**:
1. getUnclaimedInstances - 只返回 owner_id IS NULL 的实例
2. claimInstance - 成功认领，设置 owner_id 和 claimed_at
3. claimInstance - 二次认领失败
4. releaseInstance - 成功释放，清空 owner_id
5. releaseInstance - 只能释放自己的实例
6. getUserInstanceStats - 统计数据正确

**验收标准**:
- [ ] 测试覆盖率 > 80%
- [ ] 所有测试通过
- [ ] 边界情况测试

**依赖**: TASK-009-01
**估时**: 2 小时

---

### Phase 2: 前端类型和服务 (4-6 小时)

#### TASK-009-03: 扩展前端类型定义 (1 小时)

**描述**: 扩展 Instance 类型定义，支持远程实例字段

**文件**:
- `frontend/src/types/instance.ts`

**变更**:
```typescript
// 新增类型
export type DeploymentType = 'local' | 'remote';
export type HealthStatus = 'healthy' | 'warning' | 'unhealthy';

// 扩展 Instance 接口
export interface Instance {
  // ... 原有字段

  // 新增字段
  deployment_type: DeploymentType;
  remote_host?: string;
  remote_port?: number;
  remote_version?: string;
  capabilities?: string[];
  platform_api_key?: string;
  health_status?: HealthStatus;
  health_reason?: string;
  last_heartbeat_at?: string;
  claimed_at?: string;
  is_claimed?: boolean;
}

// 新增接口
export interface UnclaimedInstance {
  instance_id: string;
  deployment_type: 'remote';
  status: 'pending';
  remote_host: string;
  remote_port: number;
  remote_version: string;
  capabilities: string[];
  health_status: HealthStatus;
  created_at: string;
}

export interface InstanceStats {
  total: number;
  local: number;
  remote: number;
  unclaimed: number;
  active: number;
  healthy: number;
}
```

**验收标准**:
- [ ] 类型定义无错误
- [ ] 与后端响应匹配
- [ ] 导出所有新类型

**依赖**: 无
**估时**: 1 小时

---

#### TASK-009-04: 扩展前端服务 (3-5 小时)

**描述**: 在 InstanceService 中新增远程实例管理方法

**文件**:
- `frontend/src/services/instance.ts`

**新增方法**:
```typescript
class InstanceService {
  // 新增方法

  /**
   * 获取未认领的远程实例
   */
  async getUnclaimedInstances(): Promise<UnclaimedInstance[]>

  /**
   * 认领实例
   */
  async claimInstance(instanceId: string): Promise<Instance>

  /**
   * 释放实例
   */
  async releaseInstance(instanceId: string): Promise<void>

  /**
   * 获取实例统计
   */
  async getStats(): Promise<InstanceStats>
}
```

**验收标准**:
- [ ] 所有方法实现完成
- [ ] 正确处理认证 Token
- [ ] 错误处理完善
- [ ] TypeScript 类型检查通过

**依赖**: TASK-009-01, TASK-009-03
**估时**: 3-5 小时

---

### Phase 3: UI 组件开发 (12-16 小时)

#### TASK-009-05: 更新 Dashboard 页面 (3-4 小时)

**描述**: 更新 Dashboard 显示可用实例统计和快捷操作

**文件**:
- `frontend/src/pages/DashboardPage.tsx`

**功能**:
1. 显示实例统计卡片
   - 我的实例数
   - 可用实例数（高亮）
   - 运行中实例数
   - 健康实例数

2. 未认领实例提示
   - 当有可用实例时显示提示
   - 点击跳转到实例列表

3. 快捷操作卡片
   - 查看我的实例
   - 认领新实例

**验收标准**:
- [ ] 统计数据正确显示
- [ ] 可用实例数量 > 0 时高亮提示
- [ ] 快捷操作按钮正常跳转
- [ ] 响应式布局适配

**依赖**: TASK-009-03, TASK-009-04
**估时**: 3-4 小时

---

#### TASK-009-06: 更新实例列表页面 (4-5 小时)

**描述**: 添加标签页切换，区分已认领和未认领实例

**文件**:
- `frontend/src/pages/InstanceListPage.tsx`

**功能**:
1. 标签页切换
   - "我的实例" 标签
   - "可用实例" 标签
   - URL 参数同步 (?tab=claimed|unclaimed)

2. 我的实例列表
   - 显示本地和已认领的远程实例
   - 实例类型徽章
   - 健康状态指示

3. 可用实例列表
   - 显示未认领的远程实例
   - 认领按钮
   - 实例详细信息

**验收标准**:
- [ ] 标签切换流畅
- [ ] 列表数据正确加载
- [ ] 认领功能正常
- [ ] 过滤和搜索功能保留

**依赖**: TASK-009-03, TASK-009-04
**估时**: 4-5 小时

---

#### TASK-009-07: 创建远程实例卡片组件 (3-4 小时)

**描述**: 创建专门显示远程实例信息的卡片组件

**文件**:
- `frontend/src/components/RemoteInstanceCard.tsx` (新建)
- `frontend/src/components/InstanceTypeBadge.tsx` (新建)
- `frontend/src/components/HealthStatusBadge.tsx` (新建)

**组件结构**:
```
RemoteInstanceCard
├── 头部
│   ├── 实例名称/ID
│   ├── 类型徽章 (Remote)
│   └── 健康状态徽章
├── 连接信息
│   ├── 主机地址
│   ├── 端口
│   └── 版本
├── 能力标签
└── 认领按钮
```

**验收标准**:
- [ ] 组件样式统一
- [ ] 响应式布局
- [ ] 加载状态处理
- [ ] 错误状态处理

**依赖**: TASK-009-03
**估时**: 3-4 小时

---

#### TASK-009-08: 更新 InstanceCard 组件 (2-3 小时)

**描述**: 更新现有 InstanceCard，支持远程实例显示

**文件**:
- `frontend/src/components/InstanceCard.tsx`

**变更**:
1. 添加实例类型徽章
2. 添加健康状态指示
3. 远程实例显示特殊样式
4. 添加"开始对话"按钮

**验收标准**:
- [ ] 本地和远程实例正确区分
- [ ] 健康状态正确显示
- [ ] 对话按钮跳转正确

**依赖**: TASK-009-03
**估时**: 2-3 小时

---

### Phase 4: WebSocket 客户端 (8-10 小时)

#### TASK-009-09: 实现 WebSocket 服务 (4-5 小时)

**描述**: 创建 WebSocket 客户端服务，管理实时通信

**文件**:
- `frontend/src/services/websocket.ts` (新建)

**功能**:
1. 连接管理
   - 建立连接
   - 自动重连
   - 连接状态管理

2. 消息处理
   - 发送消息
   - 接收消息
   - 消息处理器注册

3. 错误处理
   - 连接失败
   - 消息发送失败
   - 超时处理

**API**:
```typescript
class WebSocketService {
  connect(instanceId: string): Promise<void>
  sendMessage(message: any): Promise<void>
  onMessage(handler: Function): void
  offMessage(handler: Function): void
  disconnect(): void
  isConnected(): boolean
}
```

**验收标准**:
- [ ] 连接建立成功率 > 95%
- [ ] 自动重连机制工作
- [ ] 消息发送接收正常
- [ ] 错误处理完善

**依赖**: TASK-009-03
**估时**: 4-5 小时

---

#### TASK-009-10: 创建对话页面 (4-5 小时)

**描述**: 创建与远程实例对话的页面

**文件**:
- `frontend/src/pages/ChatPage.tsx` (新建)

**功能**:
1. 消息显示
   - 消息列表
   - 用户/AI 消息区分
   - 时间戳显示

2. 消息输入
   - 输入框
   - 发送按钮
   - 快捷键支持 (Enter)

3. 连接状态
   - 连接指示器
   - 实例信息显示
   - 返回按钮

4. 实时更新
   - WebSocket 消息接收
   - 正在输入提示
   - 消息自动滚动

**验收标准**:
- [ ] 消息发送接收流畅
- [ ] UI 响应式适配
- [ ] 连接状态清晰
- [ ] 错误提示友好

**依赖**: TASK-009-09
**估时**: 4-5 小时

---

### Phase 5: 路由和集成 (2-4 小时)

#### TASK-009-11: 更新路由配置 (1-2 小时)

**描述**: 添加新页面路由，配置导航

**文件**:
- `frontend/src/App.tsx`

**新增路由**:
```tsx
<Route path="/instances/:id/chat" element={<ChatPage />} />
```

**更新导航**:
- InstanceCard 添加"开始对话"链接
- 添加返回按钮

**验收标准**:
- [ ] 路由配置正确
- [ ] 导航流畅
- [ ] URL 参数正确

**依赖**: TASK-009-10
**估时**: 1-2 小时

---

#### TASK-009-12: 集成测试和修复 (1-2 小时)

**描述**: 端到端测试，修复集成问题

**测试场景**:
1. 用户登录 → Dashboard → 查看可用实例
2. 用户登录 → Dashboard → 认领实例
3. 用户认领实例 → 开始对话
4. 对话页面发送消息 → 接收响应
5. WebSocket 断线重连

**验收标准**:
- [ ] 所有场景测试通过
- [ ] 无控制台错误
- [ ] 用户体验流畅

**依赖**: TASK-009-01 ~ TASK-009-11
**估时**: 1-2 小时

---

### Phase 6: 文档和部署 (2-3 小时)

#### TASK-009-13: 更新用户文档 (1 小时)

**文件**:
- `docs/user-guide.md` (更新)

**内容**:
1. 如何查看可用实例
2. 如何认领实例
3. 如何开始对话
4. 常见问题解答

**验收标准**:
- [ ] 文档清晰易懂
- [ ] 截图完整
- [ ] 步骤详细

**依赖**: TASK-009-12
**估时**: 1 小时

---

#### TASK-009-14: 部署和验证 (1-2 小时)

**任务**:
1. 构建前端: `npm run build`
2. 部署到 nginx
3. 生产环境功能验证
4. 性能测试

**验收标准**:
- [ ] 生产环境功能正常
- [ ] 页面加载时间 < 2s
- [ ] WebSocket 连接成功
- [ ] 无部署错误

**依赖**: TASK-009-12
**估时**: 1-2 小时

---

## 任务依赖关系

```
Phase 1: 后端 API
├─ TASK-009-01 (API 端点) ─┐
└─ TASK-009-02 (API 测试)   ├─> Phase 2: 前端类型和服务
                            ├─> TASK-009-03 (类型定义)
                            ├─> TASK-009-04 (前端服务)
                            └─> Phase 3: UI 组件
                                 ├─> TASK-009-05 (Dashboard)
                                 ├─> TASK-009-06 (实例列表)
                                 ├─> TASK-009-07 (远程卡片)
                                 └─> TASK-009-08 (更新卡片)
                                       └─> Phase 4: WebSocket
                                            ├─> TASK-009-09 (WebSocket 服务)
                                            └─> TASK-009-10 (对话页面)
                                                  └─> Phase 5: 路由
                                                       ├─> TASK-009-11 (路由配置)
                                                       └─> TASK-009-12 (集成测试)
                                                             └─> Phase 6: 文档部署
                                                                  ├─> TASK-009-13 (文档)
                                                                  └─> TASK-009-14 (部署)
```

---

## 总工时估算

| Phase | 任务数 | 预计工时 |
|-------|--------|----------|
| Phase 1: 后端 API | 2 | 6-8 小时 |
| Phase 2: 类型和服务 | 2 | 4-6 小时 |
| Phase 3: UI 组件 | 4 | 12-16 小时 |
| Phase 4: WebSocket | 2 | 8-10 小时 |
| Phase 5: 路由集成 | 2 | 2-4 小时 |
| Phase 6: 文档部署 | 2 | 2-3 小时 |
| **总计** | **14** | **34-47 小时** |

---

## 里程碑

### Milestone 1: 后端 API 完成 (Week 1, Day 2)
- [x] TASK-009-01 ✅ (2026-03-17: 实现完成并提交)
- [x] TASK-009-02 ✅ (2026-03-17: 测试完成并提交，12 个测试用例全部通过)

### Milestone 2: 前端基础完成 (Week 1, Day 4)
- [x] TASK-009-03 ✅ (2026-03-17: 前端类型定义完成，TypeScript 编译通过)
- [x] TASK-009-04 ✅ (2026-03-17: 前端服务方法完成，11 个新测试用例全部通过)
- [x] TASK-009-05 ✅ (2026-03-17: Dashboard 页面更新完成，19 个测试用例全部通过)

### Milestone 3: UI 组件完成 (Week 2, Day 2)
- [x] TASK-009-06 ✅ (2026-03-17: 实例列表页面更新完成，28 个测试用例全部通过)
- [x] TASK-009-07 ✅ (2026-03-17: 远程实例卡片组件创建完成，54 个测试用例全部通过)
- [x] TASK-009-08 ✅ (2026-03-17: InstanceCard 组件更新完成，14 个新测试用例全部通过)

### Milestone 4: WebSocket 完成 (Week 2, Day 4)
- [ ] TASK-009-09 ✅
- [ ] TASK-009-10 ✅

### Milestone 5: 功能发布 (Week 2, Day 5)
- [ ] TASK-009-11 ✅
- [ ] TASK-009-12 ✅
- [ ] TASK-009-13 ✅
- [ ] TASK-009-14 ✅

---

## 风险管理

### 高风险任务
1. **TASK-009-01** (后端 API 端点) - ✅ 已完成
   - 状态: 实现已提交并通过测试验证
   - 测试: 12 个测试用例全部通过

2. **TASK-009-02** (后端 API 测试) - ✅ 已完成
   - 状态: 测试完成并提交
   - 测试: 12 个远程实例管理测试用例全部通过

3. **TASK-009-03** (前端类型定义) - ✅ 已完成
   - 状态: 前端类型定义完成并提交
   - 提交: b0c908ba07aa56f7d901b9fe9778b34f241a8c78
   - 验证: TypeScript 编译通过，类型与后端实体对齐

4. **TASK-009-04** (前端服务方法) - ✅ 已完成
   - 状态: 前端服务方法完成并提交
   - 提交: 6efb58f6dcc0cd390f24b623c1b7f3932c4e1f01
   - 测试: 11 个新测试用例全部通过
   - 方法: getUnclaimedInstances, claimInstance, releaseInstance, getStats

5. **TASK-009-05** (Dashboard 页面) - ✅ 已完成
   - 状态: Dashboard 页面更新完成并提交
   - 提交: 5ba43b8
   - 测试: 19 个测试用例全部通过
   - 功能: 实例统计卡片、未认领实例通知、快捷操作

6. **TASK-009-06** (实例列表页面) - ✅ 已完成
   - 状态: 实例列表页面更新完成并提交
   - 提交: c07216cc77187493486dacb60eb6d6a651c2135d
   - 测试: 28 个测试用例全部通过
   - 功能: 标签页切换、认领功能、实例类型显示

7. **TASK-009-07** (远程实例卡片组件) - ✅ 已完成
   - 状态: 远程实例卡片组件创建完成并提交
   - 提交: 0b74b3b173b009a4fd71b48d23d36fdd8119e430
   - 测试: 54 个测试用例全部通过
   - 组件: RemoteInstanceCard, InstanceTypeBadge, HealthStatusBadge

8. **TASK-009-08** (InstanceCard 组件更新) - ✅ 已完成
   - 状态: InstanceCard 组件更新完成并提交
   - 提交: e4d491bf0b7685807308ad549581e45b5ceb1784
   - 测试: 14 个新测试用例全部通过
   - 功能: 集成类型和状态徽章、开始对话按钮

9. **TASK-009-09** (WebSocket 服务) - ⏸️ 待开始
   - 技术复杂度高
   - 缓解: 提前技术验证，准备 HTTP 轮询备用方案

10. **TASK-009-10** (对话页面) - ⏸️ 待开始
    - UI 复杂度中等
    - 缓解: 参考成熟聊天 UI 设计，分步实现

### 时间风险
- 总工时 34-47 小时，建议按 50 小时规划
- 预留 20% 缓冲时间处理意外问题

---

## 成功标准

### 功能完整性
- [x] 用户能查看未认领实例 (TASK-009-05, TASK-009-06)
- [x] 用户能认领实例 (TASK-009-04, TASK-009-06)
- [ ] 用户能与远程实例对话 (TASK-009-10 待开始)
- [x] 显示实例健康状态 (TASK-009-07, TASK-009-08)

### 质量标准
- [ ] 单元测试覆盖率 > 80%
- [ ] E2E 测试全部通过
- [ ] 无已知 Bug
- [ ] 性能指标达标

### 用户体验
- [ ] 认领流程 < 3 步
- [ ] 从扫码到对话 < 30 秒
- [ ] 界面直观易用
- [ ] 错误提示清晰

---

## 相关资源

### 文档
- [FIP-009](./FIP-009-remote-instance-frontend.md)
- [GAP Analysis](./GAP-Analysis-Remote-Instance-Frontend.md)
- [WebSocket Technical Solution](./WebSocket-Technical-Solution.md)

### 代码参考
- 后端 RemoteInstanceController: `src/controllers/RemoteInstanceController.ts`
- 前端 InstanceListPage: `frontend/src/pages/InstanceListPage.tsx`
- WebSocket Gateway: `src/services/RemoteInstanceWebSocketGateway.ts`

---

**任务状态**: In Progress
**创建日期**: 2026-03-17
**负责人**: TBD
**审核人**: TBD
**最后更新**: 2026-03-17 (Milestone 1, 2, 3 完成)
