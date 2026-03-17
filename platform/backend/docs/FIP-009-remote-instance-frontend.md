# FIP-009: 前端远程实例认领和对话功能

## 元数据

| 字段 | 值 |
|------|-----|
| **FIP ID** | FIP-009 |
| **标题** | 前端远程实例认领和对话功能 |
| **状态** | Draft |
| **创建日期** | 2026-03-17 |
| **优先级** | P0 (关键) |
| **预计工时** | 40-60 小时 |
| **相关任务** | TASK-009 |
| **依赖** | TASK-006 (WebSocket) ✅, TASK-007 (远程实例注册) ✅ |

---

## 执行摘要

实现前端远程实例认领和对话功能，让用户能够：
1. 查看未认领的远程实例
2. 一键认领实例
3. 与远程实例进行实时 AI 对话
4. 管理已认领的实例

**业务价值**: 完成用户扫码到使用 AI 的完整闭环，是平台可用的关键功能。

---

## 问题陈述

虽然后端已完整实现远程实例系统，但前端用户仍看到"实例管理功能正在开发"的提示。

**用户痛点**:
- 扫码后无法看到可用的远程实例
- 不知道可以认领实例
- 无法与已注册的远程 Agent 对话

**技术债务**:
- 前后端类型定义不匹配
- 缺少 WebSocket 客户端集成
- 实例列表未区分本地/远程

---

## 目标

### 主要目标
1. ✅ 用户能在 Dashboard 看到可用实例统计
2. ✅ 用户能查看和认领未认领的远程实例
3. ✅ 用户能与已认领的实例进行 AI 对话
4. ✅ 用户能查看实例状态和健康信息

### 成功指标
- 用户从扫码到开始对话 < 30 秒
- 实例认领成功率 > 95%
- WebSocket 连接成功率 > 90%
- 用户满意度 > 4.0/5.0

---

## 技术方案

### 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (React)                       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Dashboard   │  │ InstanceList │  │  ChatPage    │      │
│  │              │  │              │  │              │      │
│  │ - 统计卡片   │  │ - 本地实例   │  │ - 消息列表   │      │
│  │ - 快捷入口   │  │ - 远程实例   │  │ - 输入框     │      │
│  │ - 未认领提示 │  │ - 认领按钮   │  │ - 命令面板   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│           │                 │                 │              │
│           └─────────────────┼─────────────────┘              │
│                             │                                │
│  ┌────────────────────────────────────────────────────┐    │
│  │              Services Layer                        │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────┐ │    │
│  │  │  Instance    │  │   WebSocket  │  │   Auth   │ │    │
│  │  │  Service     │  │   Service    │  │ Service  │ │    │
│  │  └──────────────┘  └──────────────┘  └──────────┘ │    │
│  └────────────────────────────────────────────────────┘    │
│           │                         │                        │
└───────────┼─────────────────────────┼────────────────────────┘
            │                         │
            │ HTTP/REST               │ WebSocket
            ↓                         ↓
┌─────────────────────────────────────────────────────────────┐
│                   Backend (Node.js/Express)                 │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Instance   │  │   Remote     │  │  WebSocket   │      │
│  │  Controller  │  │   Instance   │  │   Gateway    │      │
│  │              │  │  Controller  │  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Instance   │  │   Remote     │  │  Remote      │      │
│  │   Service    │  │   Instance   │  │    WS        │      │
│  │              │  │   Service    │  │   Gateway    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│           │                 │                 │              │
└───────────┼─────────────────┼─────────────────┘            │
            │                 │                                │
            ↓                 ↓                                │
┌─────────────────────────────────────────────────────────────┐
│                    Database (PostgreSQL)                    │
│  - instances (local & remote)                                │
│  - users                                                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 实施计划

### Phase 1: 基础设施（4-6 小时）

#### 1.1 类型定义扩展
**文件**: `frontend/src/types/instance.ts`

**新增/更新**:
```typescript
// 实例部署类型
export type DeploymentType = 'local' | 'remote';

// 健康状态
export type HealthStatus = 'healthy' | 'warning' | 'unhealthy';

// 扩展 Instance 接口
export interface Instance {
  id: string;
  instance_id: string;
  owner_id: number | null;
  name: string;
  description?: string;

  // 新增字段
  deployment_type: DeploymentType;

  // 远程实例字段
  remote_host?: string;
  remote_port?: number;
  remote_version?: string;
  capabilities?: string[];
  platform_api_key?: string;

  // 健康监控
  health_status?: HealthStatus;
  health_reason?: string;
  last_heartbeat_at?: string;

  // 认领状态
  claimed_at?: string;
  is_claimed?: boolean;

  // 原有字段
  template: InstanceTemplate;
  config: InstanceConfig;
  status: InstanceStatus;
  docker_container_id?: string;
  restart_attempts: number;
  created_at: string;
  updated_at: string;
  last_active_at?: string;
  expires_at?: string;
}

// 未认领实例
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

// 实例统计
export interface InstanceStats {
  total: number;
  local: number;
  remote: number;
  unclaimed: number;
  active: number;
  healthy: number;
}
```

#### 1.2 后端 API 新增
**文件**: `backend/src/controllers/InstanceController.ts`

**新增端点**:

##### 1.2.1 获取未认领实例
```typescript
/**
 * Get unclaimed remote instances
 * GET /api/instances/unclaimed
 */
@Get('/unclaimed')
async getUnclaimedInstances(@Req() req: any) {
  const user = req.user;

  const unclaimed = await this.instanceService.getUnclaimedInstances({
    deployment_type: 'remote',
    status: 'pending',
    owner_id: IsNull()
  });

  return {
    success: true,
    data: unclaimed,
    count: unclaimed.length
  };
}
```

##### 1.2.2 认领实例
```typescript
/**
 * Claim an unclaimed instance
 * POST /api/instances/:instanceId/claim
 */
@Post('/:instanceId/claim')
async claimInstance(
  @Param('instanceId') instanceId: string,
  @Req() req: any
) {
  const user = req.user;

  const instance = await this.instanceService.claimInstance(
    instanceId,
    user.id
  );

  return {
    success: true,
    data: instance,
    message: '实例认领成功'
  };
}
```

##### 1.2.3 释放实例
```typescript
/**
 * Release claimed instance
 * DELETE /api/instances/:instanceId/claim
 */
@Delete('/:instanceId/claim')
async releaseInstance(
  @Param('instanceId') instanceId: string,
  @Req() req: any
) {
  const user = req.user;

  await this.instanceService.releaseInstance(
    instanceId,
    user.id
  );

  return {
    success: true,
    message: '实例已释放'
  };
}
```

##### 1.2.4 获取实例统计
```typescript
/**
 * Get instance statistics
 * GET /api/instances/stats
 */
@Get('/stats')
async getStats(@Req() req: any) {
  const user = req.user;

  const stats = await this.instanceService.getUserInstanceStats(user.id);

  return {
    success: true,
    data: stats
  };
}
```

#### 1.3 前端服务扩展
**文件**: `frontend/src/services/instance.ts`

**新增方法**:
```typescript
/**
 * 获取未认领的远程实例
 */
async getUnclaimedInstances(): Promise<UnclaimedInstance[]> {
  const response = await fetch(`${this.baseUrl}/instances/unclaimed`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) handleApiError(response);

  const result = await response.json();
  return result.data;
}

/**
 * 认领实例
 */
async claimInstance(instanceId: string): Promise<Instance> {
  const response = await fetch(`${this.baseUrl}/instances/${instanceId}/claim`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) handleApiError(response);

  const result = await response.json();
  return result.data;
}

/**
 * 释放实例
 */
async releaseInstance(instanceId: string): Promise<void> {
  const response = await fetch(`${this.baseUrl}/instances/${instanceId}/claim`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) handleApiError(response);
}

/**
 * 获取实例统计
 */
async getStats(): Promise<InstanceStats> {
  const response = await fetch(`${this.baseUrl}/instances/stats`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) handleApiError(response);

  const result = await response.json();
  return result.data;
}
```

---

### Phase 2: UI 组件开发（8-12 小时）

#### 2.1 Dashboard 更新
**文件**: `frontend/src/pages/DashboardPage.tsx`

**实现**:
```tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { instanceService } from '../services/instance';
import type { InstanceStats } from '../types/instance';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<InstanceStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const data = await instanceService.getStats();
      setStats(data);
    } catch (error) {
      console.error('加载统计失败', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 导航栏 */}
      <nav>...</nav>

      {/* 主内容 */}
      <main className="max-w-7xl mx-auto py-6">
        {/* 欢迎卡片 */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h1 className="text-2xl font-bold mb-4">
            欢迎来到 OpenClaw
          </h1>

          {/* 未认领实例提示 */}
          {stats && stats.unclaimed > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-green-800">
                    🎉 有 {stats.unclaimed} 个可用实例
                  </h3>
                  <p className="text-sm text-green-700">
                    立即认领并开始使用 AI 智能体
                  </p>
                </div>
                <button
                  onClick={() => navigate('/instances?tab=unclaimed')}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg"
                >
                  查看实例
                </button>
              </div>
            </div>
          )}

          {/* 统计卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard
              title="我的实例"
              value={stats?.total || 0}
              icon="🦞"
              onClick={() => navigate('/instances')}
            />
            <StatCard
              title="可用实例"
              value={stats?.unclaimed || 0}
              icon="✨"
              onClick={() => navigate('/instances?tab=unclaimed')}
              highlight={stats?.unclaimed > 0}
            />
            <StatCard
              title="运行中"
              value={stats?.active || 0}
              icon="🟢"
            />
            <StatCard
              title="健康状态"
              value={`${stats?.healthy || 0}/${stats?.total || 0}`}
              icon="💚"
            />
          </div>
        </div>

        {/* 快捷操作 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <QuickActionCard
            title="查看我的实例"
            description="管理您已认领的 AI 智能体"
            icon="📋"
            onClick={() => navigate('/instances')}
          />
          <QuickActionCard
            title="认领新实例"
            description="从可用实例中选择一个"
            icon="🎁"
            onClick={() => navigate('/instances?tab=unclaimed')}
            disabled={stats?.unclaimed === 0}
          />
        </div>
      </main>
    </div>
  );
}

function StatCard({ title, value, icon, onClick, highlight }: any) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-lg p-4 cursor-pointer transition-all
        ${highlight ? 'ring-2 ring-green-500 shadow-lg' : 'hover:shadow-md'}
      `}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
        <span className="text-3xl">{icon}</span>
      </div>
    </div>
  );
}
```

#### 2.2 实例列表页面更新
**文件**: `frontend/src/pages/InstanceListPage.tsx`

**新增功能**:
```tsx
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

export default function InstanceListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('claimed'); // 'claimed' | 'unclaimed'
  const [claimedInstances, setClaimedInstances] = useState<Instance[]>([]);
  const [unclaimedInstances, setUnclaimedInstances] = useState<UnclaimedInstance[]>([]);

  useEffect(() => {
    const tab = searchParams.get('tab') || 'claimed';
    setActiveTab(tab);
    loadInstances(tab);
  }, [searchParams]);

  const loadInstances = async (tab: string) => {
    if (tab === 'claimed') {
      const data = await instanceService.listInstances();
      setClaimedInstances(data);
    } else {
      const data = await instanceService.getUnclaimedInstances();
      setUnclaimedInstances(data);
    }
  };

  const handleClaim = async (instanceId: string) => {
    try {
      await instanceService.claimInstance(instanceId);
      // 刷新列表
      loadInstances('unclaimed');
      loadInstances('claimed');
      // 显示成功提示
      alert('认领成功！');
    } catch (error) {
      alert('认领失败：' + error.message);
    }
  };

  return (
    <div>
      {/* 头部 */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold">实例管理</h1>
        </div>
      </div>

      {/* 标签切换 */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setSearchParams({ tab: 'claimed' })}
            className={`px-6 py-2 rounded-lg font-medium ${
              activeTab === 'claimed'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-700'
            }`}
          >
            我的实例 ({claimedInstances.length})
          </button>
          <button
            onClick={() => setSearchParams({ tab: 'unclaimed' })}
            className={`px-6 py-2 rounded-lg font-medium ${
              activeTab === 'unclaimed'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-700'
            }`}
          >
            可用实例 ({unclaimedInstances.length})
          </button>
        </div>

        {/* 内容区域 */}
        {activeTab === 'claimed' ? (
          <ClaimedInstancesList instances={claimedInstances} />
        ) : (
          <UnclaimedInstancesList
            instances={unclaimedInstances}
            onClaim={handleClaim}
          />
        )}
      </div>
    </div>
  );
}
```

#### 2.3 远程实例卡片组件
**新建文件**: `frontend/src/components/RemoteInstanceCard.tsx`

```tsx
import type { UnclaimedInstance } from '../types/instance';

interface Props {
  instance: UnclaimedInstance;
  onClaim: (instanceId: string) => void;
  loading?: boolean;
}

export default function RemoteInstanceCard({
  instance,
  onClaim,
  loading
}: Props) {
  return (
    <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-6">
      {/* 头部 */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-lg font-semibold">远程实例</h3>
            <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded">
              Remote
            </span>
            <HealthStatusBadge status={instance.health_status} />
          </div>
          <p className="text-sm text-gray-600 font-mono">
            {instance.instance_id}
          </p>
        </div>
      </div>

      {/* 连接信息 */}
      <div className="space-y-2 mb-4">
        <div className="flex items-center text-sm">
          <span className="text-gray-600 w-24">主机:</span>
          <span className="font-mono">{instance.remote_host}:{instance.remote_port}</span>
        </div>
        <div className="flex items-center text-sm">
          <span className="text-gray-600 w-24">版本:</span>
          <span>{instance.remote_version}</span>
        </div>
      </div>

      {/* 能力标签 */}
      <div className="mb-4">
        <p className="text-sm text-gray-600 mb-2">能力:</p>
        <div className="flex flex-wrap gap-2">
          {instance.capabilities.map(cap => (
            <span
              key={cap}
              className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded"
            >
              {cap}
            </span>
          ))}
        </div>
      </div>

      {/* 操作按钮 */}
      <button
        onClick={() => onClaim(instance.instance_id)}
        disabled={loading}
        className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700
          disabled:bg-gray-300 text-white rounded-lg font-medium
          transition-colors"
      >
        {loading ? '处理中...' : '认领实例'}
      </button>
    </div>
  );
}

function HealthStatusBadge({ status }: { status: string }) {
  const config = {
    healthy: { color: 'green', label: '健康' },
    warning: { color: 'yellow', label: '警告' },
    unhealthy: { color: 'red', label: '异常' }
  };

  const { color, label } = config[status] || config.unhealthy;

  return (
    <span className={`px-2 py-1 bg-${color}-100 text-${color}-700 text-xs rounded`}>
      {label}
    </span>
  );
}
```

#### 2.4 对话页面组件
**新建文件**: `frontend/src/pages/ChatPage.tsx`

```tsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { instanceService } from '../services/instance';
import { webSocketService } from '../services/websocket';
import type { Instance } from '../types/instance';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function ChatPage() {
  const { instanceId } = useParams<{ instanceId: string }>();
  const navigate = useNavigate();
  const [instance, setInstance] = useState<Instance | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    loadInstance();
    setupWebSocket();

    return () => {
      webSocketService.disconnect();
    };
  }, [instanceId]);

  const loadInstance = async () => {
    try {
      const data = await instanceService.getInstance(instanceId!);
      setInstance(data);
    } catch (error) {
      console.error('加载实例失败', error);
    }
  };

  const setupWebSocket = async () => {
    try {
      await webSocketService.connect(instanceId!);
      setIsConnected(true);

      webSocketService.onMessage((message) => {
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'assistant',
          content: message.content,
          timestamp: new Date()
        }]);
        setIsTyping(false);
      });
    } catch (error) {
      console.error('WebSocket 连接失败', error);
    }
  };

  const handleSend = async () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    try {
      // 通过 WebSocket 发送消息
      await webSocketService.sendMessage({
        type: 'chat',
        content: userMessage.content,
        instance_id: instanceId
      });
    } catch (error) {
      console.error('发送消息失败', error);
      setIsTyping(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 头部 */}
      <header className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/instances')}
              className="text-gray-600 hover:text-gray-900"
            >
              ← 返回
            </button>
            <div>
              <h2 className="font-semibold">{instance?.name}</h2>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span className={`w-2 h-2 rounded-full ${
                  isConnected ? 'bg-green-500' : 'bg-gray-400'
                }`} />
                {isConnected ? '已连接' : '未连接'}
                {instance?.deployment_type === 'remote' && (
                  <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">
                    Remote
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.map(message => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[70%] rounded-lg px-4 py-2 ${
                message.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-900 shadow'
              }`}>
                <p>{message.content}</p>
                <p className="text-xs opacity-70 mt-1">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-white rounded-lg px-4 py-2 shadow">
                <div className="flex space-x-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100" />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 输入框 */}
      <div className="bg-white border-t">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex gap-4">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder="输入消息..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2
                focus:ring-indigo-500 focus:border-transparent"
              disabled={!isConnected}
            />
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || !isConnected}
              className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700
                disabled:bg-gray-300 text-white rounded-lg font-medium"
            >
              发送
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

### Phase 3: WebSocket 客户端（6-8 小时）

#### 3.1 WebSocket 服务
**新建文件**: `frontend/src/services/websocket.ts`

```typescript
class WebSocketService {
  private ws: WebSocket | null = null;
  private messageHandlers: ((message: any) => void)[] = [];
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  /**
   * Connect to WebSocket server
   */
  async connect(instanceId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const token = localStorage.getItem('access_token');
        const wsUrl = `ws://118.25.0.190/ws?instance_id=${instanceId}&token=${token}`;

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log('WebSocket connected');
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            this.messageHandlers.forEach(handler => handler(message));
          } catch (error) {
            console.error('Failed to parse message:', error);
          }
        };

        this.ws.onclose = () => {
          console.log('WebSocket closed');
          this.attemptReconnect(instanceId);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Send message through WebSocket
   */
  async sendMessage(message: any): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      try {
        this.ws.send(JSON.stringify(message));
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Register message handler
   */
  onMessage(handler: (message: any) => void): void {
    this.messageHandlers.push(handler);
  }

  /**
   * Remove message handler
   */
  offMessage(handler: (message: any) => void): void {
    this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
  }

  /**
   * Attempt to reconnect
   */
  private attemptReconnect(instanceId: string): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`Reconnecting in ${delay}ms... (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect(instanceId);
    }, delay);
  }

  /**
   * Disconnect WebSocket
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Get connection state
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

export const webSocketService = new WebSocketService();
```

---

### Phase 4: 路由和导航（2-4 小时）

#### 4.1 更新路由配置
**文件**: `frontend/src/App.tsx`

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import InstanceListPage from './pages/InstanceListPage';
import ChatPage from './pages/ChatPage';
import LoginPage from './pages/LoginPage';
import ProtectedRoute from './pages/components/ProtectedRoute';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        } />
        <Route path="/instances" element={
          <ProtectedRoute>
            <InstanceListPage />
          </ProtectedRoute>
        } />
        <Route path="/instances/:id/chat" element={
          <ProtectedRoute>
            <ChatPage />
          </ProtectedRoute>
        } />
      </Routes>
    </BrowserRouter>
  );
}
```

#### 4.2 更新 InstanceCard 组件
**文件**: `frontend/src/components/InstanceCard.tsx`

```tsx
// 添加对话按钮
<button
  onClick={() => navigate(`/instances/${instance.id}/chat`)}
  className="px-4 py-2 bg-indigo-600 text-white rounded-lg"
>
  开始对话
</button>
```

---

## 测试计划

### 单元测试
- [ ] InstanceService 新增方法
- [ ] WebSocketService 连接和消息处理
- [ ] 类型定义验证

### 集成测试
- [ ] 获取未认领实例列表
- [ ] 认领实例流程
- [ ] WebSocket 连接建立
- [ ] 消息发送和接收

### E2E 测试
- [ ] 用户扫码 → Dashboard → 查看实例 → 认领 → 对话

### 手动测试场景
1. **场景 1**: 新用户首次登录
   - 验证显示可用实例数量
   - 验证能查看未认领实例
   - 验证认领功能正常

2. **场景 2**: 认领实例
   - 验证认领后实例归用户所有
   - 验证其他用户看不到已认领实例

3. **场景 3**: 与远程实例对话
   - 验证 WebSocket 连接成功
   - 验证消息发送和接收
   - 验证实时响应

---

## 部署计划

### 开发环境
1. 启动前端开发服务器: `npm run dev`
2. 配置代理到后端 API
3. 测试所有功能

### 生产环境
1. 构建前端: `npm run build`
2. 部署到 nginx 静态文件服务
3. 配置 WebSocket 代理
4. 验证生产环境功能

---

## 风险和缓解

### 风险 1: WebSocket 连接不稳定
**影响**: 高
**概率**: 中
**缓解**:
- 实现自动重连机制
- 添加连接状态指示
- 提供 HTTP 轮询备用方案

### 风险 2: 实例认领冲突
**影响**: 中
**概率**: 低
**缓解**:
- 后端使用数据库事务
- 前端乐观更新 + 回滚
- 添加冲突错误提示

### 风险 3: 前后端类型不一致
**影响**: 中
**概率**: 中
**缓解**:
- 使用 OpenAPI 生成类型
- 定期同步类型定义
- 添加运行时验证

---

## 成功标准

### 功能完整性
- ✅ 用户能查看未认领实例
- ✅ 用户能认领实例
- ✅ 用户能与远程实例对话
- ✅ 显示实例健康状态

### 性能指标
- 页面加载时间 < 2s
- WebSocket 连接时间 < 1s
- 消息响应时间 < 500ms

### 用户体验
- 认领流程 < 3 步
- 对话界面直观易用
- 错误提示清晰友好

---

## 后续优化

### 短期（1-2 周）
1. 添加实例释放确认对话框
2. 实现消息历史持久化
3. 添加多语言支持

### 中期（1 个月）
1. 实现实例性能监控图表
2. 添加命令推送历史
3. 实现批量操作

### 长期（3 个月）
1. 实现实例分组管理
2. 添加自动化运维功能
3. 实现跨区域实例调度

---

## 附录

### A. 相关文档
- [GAP Analysis](./GAP-Analysis-Remote-Instance-Frontend.md)
- [WebSocket Technical Solution](./WebSocket-Technical-Solution.md)
- [API Documentation](../api/README.md)

### B. 变更日志
| 版本 | 日期 | 变更内容 | 作者 |
|------|------|----------|------|
| 1.0 | 2026-03-17 | 初稿 | Claude Code |

---

**文档版本**: 1.0
**最后更新**: 2026-03-17
**审核状态**: Pending
**实施状态**: Not Started
