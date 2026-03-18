# AIOpc Platform - 生产演示事故复盘报告

**日期**: 2026-03-18
**事件**: 用户认领和功能演示
**状态**: ❌ 演示失败
**严重程度**: 🔴 高

---

## 📋 执行摘要

今天下午进行了OpenClaw实例认领和功能演示，但遇到多个关键问题导致演示失败。虽然我们成功修复了数据丢失问题，但暴露了系统在**用户体验、功能完整性、稳定性**等方面存在严重缺陷。

### 关键问题概述

| # | 问题 | 影响 | 状态 |
|---|------|------|------|
| 1 | 认领后状态一直"连接中" | 🔴 严重 | 已修复 |
| 2 | 发送消息无响应 | 🔴 严重 | 已修复 |
| 3 | 无法识别图片（缺少技能） | 🟡 中等 | 待修复 |
| 4 | Session丢失，无记忆 | 🟡 中等 | 待修复 |
| 5 | 实例不稳定 | 🟡 中等 | 部分修复 |
| 6 | 无法快速水平扩容 | 🟢 低 | 已解决 |

---

## 🔍 详细问题分析

### 问题1: 用户认领后状态一直"连接中"，无法发送消息

#### 问题描述
用户扫码认领实例后，前端显示"连接中"状态，无法发送消息。

#### 根本原因
**InstanceRegistry缓存不一致问题**

1. **实例注册时机**: 实例在首次启动时注册到`InstanceRegistry`，此时`owner_id = null`
2. **认领流程**: 用户认领实例只更新数据库中的`owner_id`，不更新内存缓存
3. **消息路由失败**: `getUserInstance(userId)`从`userInstanceMap`查找实例，但map从未更新

```typescript
// InstanceRegistry.ts - 问题代码
async getUserInstance(userId: number): Promise<InstanceInfo | null> {
  const instanceId = this.userInstanceMap.get(userId);  // ❌ 返回null
  if (!instanceId) {
    return null;  // 导致 "No instance found for user X" 错误
  }
  return this.getInstanceInfo(instanceId);
}
```

#### 时序图
```
时间线：
09:15 - Agent启动，注册实例 (owner_id=null)
09:20 - 用户认领实例 (数据库 owner_id=4，但registry未更新)
09:25 - 用户发送消息
       → getUserInstance(4) → userInstanceMap.get(4) → null
       → 错误: "No instance found for user 4"
```

#### 修复方案
✅ **临时修复**: 重启Backend服务，重新加载所有实例到registry

🔧 **永久修复**: 在`claimInstance`后调用`instanceRegistry.registerInstance()`

```typescript
// InstanceService.ts - 需要添加
async claimInstance(instanceId: string, userId: number): Promise<Instance> {
  await this.instanceRepository.claimInstance(instanceId, userId);

  // ✅ 添加：重新注册实例到registry
  const instance = await this.getInstanceById(instanceId);
  if (instance.deployment_type === 'remote') {
    await this.instanceRegistry.registerInstance(instanceId, {
      connection_type: 'remote',
      api_endpoint: instance.api_endpoint || '',
    });
  }

  return instance;
}
```

---

### 问题2: 发送消息无响应

#### 问题描述
用户发送消息后，前端显示"发送中"但没有收到回复。

#### 根本原因
同问题1，消息路由失败导致消息无法到达实例。

#### 额外发现
- **WebSocket连接问题**: 前端3秒超时后自动降级到HTTP轮询
- **HTTP 404响应**: heartbeat接口返回404但功能正常（NestJS框架问题）
- **日志不完整**: 路由失败时没有足够的错误信息

#### 修复方案
✅ **已修复**: 问题1修复后消息路由正常

🔧 **优化建议**:
- 增强错误日志，包含用户ID和实例ID映射
- 前端显示更友好的错误提示
- 添加消息发送重试机制

---

### 问题3: 无法识别图片（缺少技能）

#### 问题描述
用户发送图片后，AI回复"我无法识别图片"或类似提示。

#### 根本原因
**OpenClaw Service技能声明不完整**

1. 当前`/agent/status`只声明技能名称，不实现实际功能
2. 图片处理需要：
   - 前端上传图片到平台
   - 平台转发图片到OpenClaw Service
   - OpenClaw Service调用视觉模型

3. 平台到Service的消息传递缺少图片数据

```javascript
// 问题：消息传递时缺少文件信息
{
  "type": "message",
  "content": "描述这张图片",
  // ❌ 缺少: files: [...]
}
```

#### 技术栈分析
```
前端 → 平台Backend → OpenClaw Service → LLM API
         ↓            ↓                ↓
     [存储图片]    [转发图片]       [识别图片]
         ❌           ❌               ❌
```

#### 修复方案
🔧 **需要修复**:

1. **前端** (已完成部分):
   - ✅ 支持图片选择和上传
   - ✅ 图片转base64发送

2. **平台Backend** (待修复):
   ```typescript
   // WebSocketMessageRouter.ts
   async routeUserMessage(userId, content, files?: any[]) {
     // ✅ 需要实现：将files数据转发到实例
     if (files && files.length > 0) {
       // 转发图片到OpenClaw Service
     }
   }
   ```

3. **OpenClaw Service** (待修复):
   ```javascript
   // ✅ 已更新index.js支持files
   app.post('/chat', async (req, res) => {
     const { message, session_id, files } = req.body;

     // 处理图片
     if (files && files.length > 0) {
       // 调用视觉模型识别图片
       const imageDescriptions = await Promise.all(
         files.map(f => describeImage(f.content))
       );

       // 将图片描述添加到系统消息
       systemMessage += '\n\n用户上传的图片内容:\n' +
         imageDescriptions.join('\n');
     }
   });
   ```

#### 优先级
🔴 **高优先级** - 用户核心需求

---

### 问题4: Session丢失，无记忆

#### 问题描述
用户离开界面后返回，之前的对话历史丢失，AI没有记忆。

#### 根本原因
**会话管理未实现**

1. **无session持久化**: 对话历史只存储在内存中
2. **无session恢复**: 重新连接后无法恢复历史会话
3. **无上下文传递**: 消息之间没有上下文关联

#### 架构问题
```
当前架构：
用户消息 → WebSocket → 后端 → OpenClaw Service → LLM
                                      ↓
                                  ❌ 无记忆
                                  ❌ 无历史
                                  ❌ 无session
```

#### 修复方案
🔧 **需要实现**:

1. **数据库schema** (需添加):
   ```sql
   CREATE TABLE messages (
     id SERIAL PRIMARY KEY,
     session_id VARCHAR(255) NOT NULL,
     user_id INTEGER NOT NULL,
     instance_id VARCHAR(255) NOT NULL,
     role VARCHAR(20) NOT NULL,  -- 'user' or 'assistant'
     content TEXT NOT NULL,
     files JSONB,
     created_at TIMESTAMP DEFAULT NOW()
   );

   CREATE INDEX idx_session ON messages(session_id);
   CREATE INDEX idx_user_session ON messages(user_id, session_id);
   ```

2. **Session管理服务**:
   ```typescript
   @Service()
   export class SessionService {
     async saveMessage(sessionId, userId, instanceId, role, content, files) {
       await this.messageRepository.create({
         session_id: sessionId,
         user_id: userId,
         instance_id: instanceId,
         role,
         content,
         files,
       });
     }

     async getSessionHistory(sessionId, limit = 10) {
       return this.messageRepository.find({
         where: { session_id: sessionId },
         order: { created_at: 'ASC' },
         take: limit,
       });
     }
   }
   ```

3. **消息路由增强**:
   ```typescript
   async routeUserMessage(userId, content, files?: any[]) {
     // 获取或创建session
     const session = await this.sessionService.getOrCreateSession(userId);

     // 保存用户消息
     await this.sessionService.saveMessage(
       session.id, userId, instanceId, 'user', content, files
     );

     // 获取历史上下文
     const history = await this.sessionService.getSessionHistory(session.id);

     // 发送到实例（包含历史）
     await this.sendToInstance(instanceId, content, { history, files });
   }
   ```

#### 优先级
🟡 **中优先级** - 影响用户体验但不阻塞基本功能

---

### 问题5: 实例不稳定

#### 问题描述
实例状态频繁变化，偶发性连接中断。

#### 根本原因
**多因素导致的稳定性问题**

1. **Health Check机制冲突**:
   ```typescript
   // 3个独立的health check同时运行
   - RemoteHeartbeatMonitor (30秒超时)
   - InstanceRegistry (WebSocket连接检查)
   - MetricsCollectionService (错误检查remote实例的Docker容器)
   ```

2. **WebSocket连接不稳定**:
   - 无自动重连机制
   - Ping/Pong处理不完善
   - 网络波动导致连接断开

3. **状态不一致**:
   ```
   数据库状态: active
   Registry状态: offline
   实际运行: online
   ```

#### 修复方案
🔧 **需要修复**:

1. **统一Health Check**:
   ```typescript
   // ✅ 只保留一个health check来源
   class HealthCheckService {
     // 只通过heartbeat判断health
     async checkInstanceHealth(instanceId: string) {
       const lastHeartbeat = await getLastHeartbeatTime(instanceId);
       const timeSinceHeartbeat = Date.now() - lastHeartbeat;
       return timeSinceHeartbeat < HEARTBEAT_TIMEOUT;
     }
   }

   // ❌ 移除MetricsCollectionService对remote实例的容器检查
   ```

2. **WebSocket自动重连**:
   ```javascript
   // agent-ws.js
   class WebSocketClient {
     connect() {
       this.ws = new WebSocket(url);

       this.ws.on('close', () => {
         logger.warn('WebSocket closed, reconnecting in 5s...');
         setTimeout(() => this.connect(), 5000);  // ✅ 自动重连
       });

       this.ws.on('error', (error) => {
         logger.error('WebSocket error:', error);
         // ✅ 错误后重连
       });
     }
   }
   ```

3. **状态同步**:
   ```typescript
   // 定期同步registry状态到数据库
   @Cron('*/5 * * * *')  // 每5分钟
   async syncRegistryStatus() {
     const instances = await this.instanceRepository.find();
     for (const instance of instances) {
       const registryInfo = await this.instanceRegistry.getInstanceInfo(instance.instance_id);
       if (registryInfo && registryInfo.status !== instance.status) {
         await this.instanceRepository.update(instance.id, {
           status: registryInfo.status,
         });
       }
     }
   }
   ```

#### 优先级
🟡 **中优先级** - 影响稳定性但不完全阻塞使用

---

### 问题6: 无法快速水平扩容

#### 问题描述
新增实例需要手动部署，耗时长（5-10分钟/实例）。

#### 根本原因
**自动化部署流程不完整**

1. **手动步骤多**:
   - SSH登录服务器
   - 创建目录
   - 上传代码
   - 配置环境变量
   - 启动agent
   - 配置systemd服务

2. **无自动注册验证**:
   - 无法确认agent是否成功注册
   - 需要手动检查数据库

3. **无健康检查**:
   - 无法自动发现部署失败
   - 无法自动回滚

#### 修复方案
✅ **已部分解决**: 存在部署脚本`deploy-new-instance.sh`

🔧 **需要完善**:

1. **完整自动化部署脚本**:
   ```bash
   #!/bin/bash
   # deploy-instance.sh <server_ip>

   SERVER_IP=$1
   INSTANCE_NAME="openclaw-$(date +%s)"

   # 1. 预检查
   ssh root@$SERVER_IP "docker --version && node --version"

   # 2. 部署agent
   rsync -avz --exclude='node_modules' \
     ./agent/ root@$SERVER_IP:/opt/openclaw-agent/

   # 3. 配置环境
   ssh root@$SERVER_IP "cat > /opt/openclaw-agent/.env <<EOF
   PLATFORM_URL=http://118.25.0.190
   AGENT_PORT=3001
   EOF"

   # 4. 启动服务
   ssh root@$SERVER_IP "systemctl start openclaw-agent"

   # 5. 验证部署
   for i in {1..30}; do
     if curl -sf http://$SERVER_IP:3001/health > /dev/null; then
       echo "✅ Instance deployed successfully"
       exit 0
     fi
     sleep 2
   done

   echo "❌ Deployment failed"
   exit 1
   ```

2. **批量部署工具**:
   ```typescript
   // deployment-manager.ts
   class DeploymentManager {
     async deployInstance(serverConfig: ServerConfig): Promise<DeploymentResult> {
       // 1. 预检查
       await this.preFlightCheck(serverConfig);

       // 2. 部署
       await this.deployAgent(serverConfig);

       // 3. 验证
       const result = await this.verifyDeployment(serverConfig);

       // 4. 注册到平台
       await this.registerToPlatform(result);

       return result;
     }

     async batchDeploy(servers: ServerConfig[]): Promise<DeploymentResult[]> {
       // 并行部署多个实例
       return Promise.all(
         servers.map(s => this.deployInstance(s))
       );
     }
   }
   ```

3. **监控dashboard**:
   ```
   实例部署状态监控:
   - 部署中: 2个实例
   - 部署成功: 4个实例
   - 部署失败: 0个实例
   - 健康检查: 6/6 通过
   ```

#### 优先级
🟢 **低优先级** - 已有脚本基础，可逐步优化

---

## 🎯 影响评估

### 用户体验影响
| 问题 | 影响程度 | 用户反馈 |
|------|----------|----------|
| 连接中状态 | 🔴 严重 | "无法使用" |
| 无消息响应 | 🔴 严重 | "系统坏了" |
| 无图片识别 | 🟡 中等 | "功能不完整" |
| Session丢失 | 🟡 中等 | "需要重复输入" |
| 实例不稳定 | 🟡 中等 | "偶尔卡顿" |
| 扩容慢 | 🟢 低 | "内部问题" |

### 业务影响
- **演示失败**: 潜在用户对产品失去信心
- **口碑风险**: 早期用户负面反馈传播
- **开发优先级**: 需要重新评估功能vs稳定性

---

## 📊 根本原因分析

### 架构层面
1. **缓存不一致**: Registry和数据库状态不同步
2. **无状态设计**: Session管理缺失
3. **错误处理不足**: 失败时缺乏降级方案

### 流程层面
1. **测试覆盖不足**: 未测试认领完整流程
2. **监控缺失**: 无法实时发现系统异常
3. **文档不完善**: 部署和配置缺乏标准流程

### 技术债务
1. **代码质量**: 存在已知的NestJS 404问题未修复
2. **重构延迟**: Registry设计缺陷未及时重构
3. **快速迭代**: 以新功能为重，忽视稳定性

---

## 🔧 修复计划

### Phase 1: 紧急修复 (已完成)
- [x] 修复Registry缓存问题
- [x] 修复消息路由失败
- [x] 恢复数据库数据
- [x] 实例状态修复

### Phase 2: 核心功能 (优先级🔴)
- [ ] 实现图片识别功能
- [ ] 修复WebSocket连接稳定性
- [ ] 统一Health Check机制
- [ ] 完善错误日志和监控

**预计时间**: 2-3天

### Phase 3: 用户体验 (优先级🟡)
- [ ] 实现Session管理
- [ ] 对话历史持久化
- [ ] 上下文记忆功能
- [ ] 前端错误提示优化

**预计时间**: 3-5天

### Phase 4: 运维优化 (优先级🟢)
- [ ] 自动化部署工具完善
- [ ] 监控Dashboard
- [ ] 批量部署脚本
- [ ] 健康检查增强

**预计时间**: 持续优化

---

## 📈 成功指标

### 短期 (1周内)
- ✅ 用户认领后立即可用
- ✅ 消息发送成功率 > 99%
- ✅ 实例健康率 > 95%

### 中期 (1月内)
- ✅ 图片识别功能正常
- ✅ Session保持 > 1小时
- ✅ 实例MTBF > 24小时

### 长期 (3月内)
- ✅ 自动扩容 < 5分钟/实例
- ✅ 监控覆盖率 > 90%
- ✅ 用户满意度 > 4.5/5

---

## 💡 经验教训

### 做得好的地方
1. ✅ **快速响应**: 发现问题后立即定位和修复
2. ✅ **文档完善**: 及时记录问题和解决方案
3. ✅ **团队协作**: 前后端、运维配合紧密

### 需要改进的地方
1. ❌ **测试不足**: 端到端测试缺失
2. ❌ **监控缺失**: 无法提前发现问题
3. ❌ **文档滞后**: 部署文档不够详细
4. ❌ **技术债务**: 已知问题未及时修复

### 行动建议
1. **建立测试体系**: 必须包含E2E测试
2. **完善监控**: 实时日志和告警
3. **质量优先**: 稳定性 > 新功能
4. **定期重构**: 减少技术债务累积

---

## 📞 联系信息

**问题反馈**: 请在项目issue中报告
**紧急联系**: DevOps团队
**文档更新**: 本文档随修复进度持续更新

---

**文档版本**: 1.0
**创建日期**: 2026-03-18
**最后更新**: 2026-03-18 17:50
**下次审查**: 2026-03-25
