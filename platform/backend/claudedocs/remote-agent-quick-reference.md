# 远程 OpenClaw Agent 快速参考

## 架构概览

```
平台 (118.25.0.190)
├── HTTP API (3000)        ← 注册、心跳、注销
└── WebSocket Gateway (3002) ← 双向通信、命令推送

远程 Agent (101.34.254.52)
├── OpenClaw Agent         ← Node.js 进程
└── systemd 服务           ← 自动管理
```

## 关键文件

### 平台端
- `src/services/RemoteInstanceWebSocketGateway.ts` - 远程实例 WebSocket 网关
- `src/services/RemoteInstanceService.ts` - 远程实例服务
- `src/controllers/RemoteInstanceController.ts` - HTTP API 控制器

### 远程 Agent
- `/opt/openclaw-agent/agent.js` - Agent 主程序
- `/etc/openclaw-agent/credentials.json` - 注册凭证
- `/var/log/openclaw-agent.log` - 运行日志
- `/etc/systemd/system/openclaw-agent.service` - systemd 配置

## 常用命令

### 平台操作
```bash
# 启动平台
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190
cd /path/to/AIOpc/platform/backend
npm start

# 查看平台日志
tail -f logs/app.log

# 检查 API 状态
curl http://118.25.0.190:3000/health

# 检查 WebSocket 端口
netstat -an | grep 3002
```

### Agent 操作
```bash
# 连接到远程服务器
ssh -i ~/.ssh/aiopclaw_remote_agent root@101.34.254.52

# 查看服务状态
systemctl status openclaw-agent

# 启动服务
systemctl start openclaw-agent

# 停止服务
systemctl stop openclaw-agent

# 重启服务
systemctl restart openclaw-agent

# 查看日志
tail -f /var/log/openclaw-agent.log

# 查看 systemd 日志
journalctl -u openclaw-agent -f

# 查看注册凭证
cat /etc/openclaw-agent/credentials.json

# 删除凭证（强制重新注册）
rm /etc/openclaw-agent/credentials.json
systemctl restart openclaw-agent
```

## 测试和验证

### 快速测试
```bash
# 运行完整测试
bash /Users/arthurren/projects/AIOpc/platform/backend/scripts/test-remote-agent-registration.sh

# 检查注册状态
ssh -i ~/.ssh/aiopclaw_remote_agent root@101.34.254.52 "cat /etc/openclaw-agent/credentials.json"

# 查看实时日志
ssh -i ~/.ssh/aiopclaw_remote_agent root@101.34.254.52 "tail -f /var/log/openclaw-agent.log"
```

### API 测试
```bash
# 验证实例注册
curl http://118.25.0.190:3000/api/instances/inst-remote-xxx/verify

# 发送测试心跳
curl -X POST http://118.25.0.190:3000/api/instances/inst-remote-xxx/heartbeat \
  -H "X-Platform-API-Key: sk-remote-xxx" \
  -H "Content-Type: application/json" \
  -d '{"timestamp": 1612345678900, "status": "online", "metrics": {}}'
```

## 环境变量

### 平台
```bash
PLATFORM_URL=http://118.25.0.190
WS_ENABLED=true
WS_PORT=3001
REMOTE_WS_ENABLED=true
REMOTE_WS_PORT=3002
```

### Agent
```bash
NODE_ENV=production
PLATFORM_URL=http://118.25.0.190
PLATFORM_API_PORT=3000
PLATFORM_WS_PORT=3002
AGENT_PORT=3000
```

## 故障排查

| 问题 | 可能原因 | 解决方案 |
|------|----------|----------|
| Agent 无法注册 | 平台 API 未运行 | 启动平台服务 |
| Agent 无法注册 | 网络不通 | 检查防火墙和路由 |
| WebSocket 连接失败 | 端口未开放 | 开放 3002 端口 |
| 心跳失败 | API key 错误 | 删除凭证重新注册 |
| Agent 频繁重启 | 代码错误 | 查看日志修复 |

## 日志级别

- `error`: 错误信息
- `warn`: 警告信息
- `info`: 一般信息（默认）
- `debug`: 调试信息

修改日志级别：编辑 `agent.js` 中的 `level` 配置

## 监控指标

### Agent 发送的指标
- CPU 使用率
- 内存使用率
- 活动会话数
- 处理的消息数

### 平台监控的指标
- 最后心跳时间
- 实例健康状态
- 连接状态
- 注册时长

## 安全注意事项

1. **API Key**: 不要泄露 platform_api_key
2. **防火墙**: 只开放必要的端口
3. **日志**: 定期清理和归档日志
4. **凭证**: 定期轮换 API key
5. **网络**: 使用 VPN 或专线连接

## 部署流程

1. **准备阶段**
   - 确保平台 API 运行
   - 确保网络连通
   - 准备 SSH 密钥

2. **部署 Agent**
   - 运行部署脚本
   - 验证服务状态
   - 检查注册状态

3. **验证阶段**
   - 查看注册日志
   - 验证心跳正常
   - 测试 WebSocket 连接

4. **监控阶段**
   - 监控服务状态
   - 查看日志文件
   - 定期检查健康状态

## 扩展功能

### 待实现功能
- [ ] 命令推送和执行
- [ ] 配置更新
- [ ] 远程重启
- [ ] 日志上传
- [ ] 性能监控
- [ ] 告警通知

### 自定义配置
编辑 `/opt/openclaw-agent/agent.js` 中的配置常量：
- `HEARTBEAT_INTERVAL`: 心跳间隔（默认 30000ms）
- `AGENT_PORT`: Agent 端口（默认 3000）
- 日志级别和格式

## 联系方式

- 技术支持：查看项目文档
- 问题报告：提交 Issue
- 功能建议：提交 PR
