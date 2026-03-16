# WebSocket 连接技术方案

## 问题总结

### 根本原因
1. **依赖缺失**: 生产容器使用的是旧版代码，构建时 `ws` 模块尚未添加到依赖
2. **网络安全限制**: 云服务商安全组阻止端口 3000、3001、3002，仅开放 80 和 443
3. **架构不一致**: WebSocket Gateway 尝试在端口 3002 监听，但该端口被阻止

### 当前状态
- ✅ HTTP API 完全正常（通过 nginx 端口 80）
- ✅ 远程实例注册功能完整
- ✅ 心跳机制正常工作
- ❌ WebSocket 连接被禁用（待重建镜像）
- ❌ 后端容器不稳定（由于 ws 依赖问题）

## 推荐技术方案

### 方案 A: 完整重建（推荐用于生产）

**步骤**:

1. **本地构建包含 ws 依赖的镜像**:
   \`\`\`bash
   # 在本地开发环境
   cd /Users/arthurren/projects/AIOpc/platform/backend
   docker build -t opclaw-backend:latest --target production .
   
   # 验证镜像包含 ws 依赖
   docker run --rm opclaw-backend:latest npm list ws
   \`\`\`

2. **导出并传输镜像**:
   \`\`\`bash
   docker save opclaw-backend:latest | gzip > backend-image.tar.gz
   
   scp -i ~/.ssh/rap001_opclaw backend-image.tar.gz root@118.25.0.190:/tmp/
   \`\`\`

3. **在平台服务器加载镜像**:
   \`\`\`bash
   ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190
   
   # 停止旧容器
   docker stop opclaw-backend
   docker rm opclaw-backend
   
   # 加载新镜像
   gunzip -c /tmp/backend-image.tar.gz | docker load
   
   # 重新标记镜像
   docker tag opclaw-backend:latest opclaw-backend:production
   
   # 更新 docker-compose 配置
   # 然后启动新容器
   \`\`\`

4. **配置 nginx WebSocket 代理**:
   \`\`\`nginx
   location /ws {
       proxy_pass http://opclaw-backend:3002;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "Upgrade";
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_read_timeout 3600s;
       proxy_send_timeout 3600s;
   }
   \`\`\`

5. **更新 Agent WebSocket URL**:
   \`\`\`javascript
   const wsUrl = 'ws://118.25.0.190/ws?api_key=' + platformApiKey;
   \`\`\`

### 方案 B: HTTP 轮询（当前可用方案）

**优势**:
- ✅ 无需重建镜像
- ✅ 立即可用
- ✅ 通过现有 nginx 代理工作
- ✅ 可靠且经过验证

**实现**:
- Agent 每 30 秒发送心跳到 `/api/instances/:id/heartbeat`
- 响应中包含待处理的命令数组
- 命令状态通过心跳回报

**代码示例**:
\`\`\`javascript
// Agent 侧
async function heartbeat() {
  const response = await axios.post(
    \`\${platformUrl}/api/instances/\${instanceId}/heartbeat\`,
    { metrics: getCurrentMetrics() },
    { headers: { 'X-Platform-API-Key': apiKey } }
  );
  
  // 处理响应中的命令
  for (const command of response.data.commands) {
    await executeCommand(command);
  }
}

setInterval(heartbeat, 30000);
\`\`\`

## 当前实施状态

### ✅ 已完成
1. 远程实例注册 API
2. 心跳监控机制
3. HTTP API 通信
4. nginx 反向代理（端口 80）
5. 数据库集成

### ⚠️ 待完成
1. 重新构建后端 Docker 镜像（包含 ws 依赖）
2. 配置 nginx WebSocket 代理
3. 更新 Agent WebSocket URL
4. 测试端到端 WebSocket 连接
5. 实现命令推送机制

### ❌ 当前问题
1. 后端容器因缺少 ws 依赖而不稳定
2. WebSocket 功能暂时禁用
3. Agent 无法通过 WebSocket 连接

## 后续步骤

**立即行动**（恢复服务）:
1. 使用方案 B（HTTP 轮询）恢复服务
2. 修复后端容器稳定性

**短期目标**（1-2 天）:
1. 完成方案 A 的镜像构建
2. 部署新镜像到平台
3. 配置 WebSocket 代理

**长期目标**（1 周）:
1. 实现 WebSocket 双向通信
2. 添加实时命令推送
3. 实现 WebSocket 连接状态监控
4. 添加 WebSocket 重连机制

## 技术债务

1. **Docker 镜像构建流程**: 需要建立自动化的 CI/CD 流程
2. **依赖管理**: 确保所有运行时依赖正确打包
3. **监控**: 添加 WebSocket 连接状态监控
4. **文档**: 更新部署文档说明 WebSocket 配置

## 联系信息

如有问题，请参考:
- 本地开发环境: `/Users/arthurren/projects/AIOpc/platform/backend`
- 平台服务器: `root@118.25.0.190`
- 远程实例服务器: `root@101.34.254.52`
