# WebSocket 连接调试指南

## 问题症状

前端 WebSocket 连接一直显示"连接中"状态，无法变为"已连接"。

## 调试步骤

### 1. 打开浏览器开发者工具

按 `F12` 打开开发者工具，然后切换到以下标签页查看：

#### Console（控制台）标签页
查看是否有 JavaScript 错误或 WebSocket 相关的日志：

```
期望看到：
- WebSocket connected（连接成功）
- WebSocket error: xxx（连接错误）
- No access token found（token缺失）

可能的问题：
- CORS 错误
- 网络错误
- JavaScript 异常
```

#### Network（网络）标签页
1. 刷新页面
2. 筛选 `WS`（WebSocket）类型
3. 查找连接到 `118.25.0.190:3001` 的 WebSocket 连接
4. 点击该连接查看详细信息：

```
Headers 标签页：
- Request URL: ws://118.25.0.190:3001/?token=xxx
- 检查 token 参数是否存在

Messages 标签页：
- 是否有数据传输
- 服务器是否发送了任何消息

Timing 标签页：
- 连接建立时间
- 是否超时
```

### 2. 检查本地存储

在 Console 中执行：

```javascript
// 检查 access_token
localStorage.getItem('access_token')

// 检查 auth_token（备用）
localStorage.getItem('auth_token')
```

**期望结果**: 应该返回一个 JWT token 字符串
**问题**: 如果返回 `null`，说明 token 没有保存，需要重新登录

### 3. 手动测试 WebSocket 连接

在 Console 中执行：

```javascript
// 1. 获取 token
const token = localStorage.getItem('access_token') || localStorage.getItem('auth_token');
console.log('Token:', token ? `${token.substring(0, 20)}...` : 'NULL');

// 2. 创建 WebSocket 连接
const ws = new WebSocket(`ws://118.25.0.190:3001/?token=${token}`);

// 3. 监听事件
ws.onopen = () => console.log('✅ WebSocket connected');
ws.onerror = (error) => console.error('❌ WebSocket error:', error);
ws.onclose = (event) => console.log('🔌 WebSocket closed:', event.code, event.reason);
ws.onmessage = (msg) => console.log('📨 Message:', msg.data);

// 4. 检查连接状态
setTimeout(() => {
  console.log('Connection state:', ws.readyState);
  console.log('0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED');
}, 3000);
```

**期望结果**:
- 3秒内应该看到 "✅ WebSocket connected"
- Connection state 应该是 1 (OPEN)

**可能的问题**:
- 如果看到 "❌ WebSocket error"，说明服务器拒绝连接
- 如果 Connection state 是 3 (CLOSED)，说明连接被关闭
- 如果一直保持 0 (CONNECTING)，说明握手超时

### 4. 查看网络请求详细信息

在 Network 标签页中：

1. 找到失败的 WebSocket 连接（红色标记）
2. 点击查看详细信息
3. 查看 Response 标签页：

```
可能的错误信息：
- HTTP/1.1 426 Upgrade Required（需要 Upgrade 头）
- HTTP/1.1 401 Unauthorized（认证失败）
- HTTP/1.1 403 Forbidden（权限不足）
- HTTP/1.1 500 Internal Server Error（服务器错误）
```

### 5. 检查后端日志

同时检查后端是否收到连接请求：

```bash
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 "docker logs opclaw-backend -f --tail 50"
```

然后刷新页面，观察是否有新的日志：

```
期望看到：
- WebSocket connected { userId: xxx, instanceId: xxx }
- Invalid token { error: xxx }
- No instance found for user { userId: xxx }
- Connection handling failed { error: xxx }
```

### 6. 常见问题排查

#### 问题 A: Token 过期或无效

**症状**: Console 显示 "Invalid token" 或后端日志显示 "Invalid token"

**解决**:
```javascript
// 清除旧 token 并重新登录
localStorage.removeItem('access_token');
localStorage.removeItem('auth_token');
// 然后刷新页面重新登录
```

#### 问题 B: 用户没有实例

**症状**: 后端日志显示 "No instance found for user"

**解决**: 需要先认领或创建一个实例

#### 问题 C: CORS 错误

**症状**: Console 显示 CORS 相关错误

**解决**: 这是服务器配置问题，需要联系管理员

#### 问题 D: 网络连接问题

**症状**: 连接一直处于 CONNECTING 状态，3秒后超时

**检查**:
```bash
# 从你的机器测试端口连接
nc -z -v -w 3 118.25.0.190 3001
```

## 报告问题时请提供

1. **Console 标签页截图/日志**
   - 所有红色错误
   - WebSocket 相关的日志

2. **Network 标签页信息**
   - WebSocket 连接的详细信息
   - Request URL
   - Response 状态

3. **手动测试结果**
   - 执行步骤3的脚本后的输出

4. **后端日志**
   - 刷新页面时的相关日志
