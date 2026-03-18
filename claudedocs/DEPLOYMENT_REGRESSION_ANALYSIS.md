# AIOpc Platform - Deployment Regression Analysis

## 概述

本文档记录在生产环境部署过程中发生的regression和数据丢失问题，以及制定正确的DevOps流程来避免类似问题。

---

## 一、数据丢失事件 (2026-03-17)

### 问题描述
在2026-03-17的部署过程中，发生了数据库数据丢失：
- **丢失前**: 5个实例，2个用户（Arthur和Joseph）
- **丢失后**: 2个旧实例，只有Arthur用户
- **影响**: 用户数据丢失，需要重新注册所有实例

### 根本原因
使用docker-compose重建服务时，PostgreSQL volume被重新创建而非使用现有volume。

**具体原因**：
```bash
# 项目名称配置不一致导致volume不匹配
COMPOSE_PROJECT_NAME=opclaw docker-compose up -d backend
# 实际创建的volume: opclaw_postgres-data
# 而不是使用已存在的volume
```

### 数据恢复
- 无法从备份恢复（无可用备份）
- 需要重新注册所有4个remote instances
- 用户需要重新扫码认领实例

---

## 二、配置Regression事件

### 事件1: OAuth配置丢失

**问题描述**: 二维码生成失败，错误信息："Failed to generate authorization URL"

**原因**: 使用docker run重建backend容器时，遗漏了关键环境变量

**错误命令**:
```bash
docker run -d --name opclaw-backend \
  -e POSTGRES_DB=opclaw \
  -e POSTGRES_USER=opclaw \
  # ❌ 遗漏了FEISHU_REDIRECT_URI等关键配置
  opclaw-backend:latest
```

**正确做法**:
```bash
COMPOSE_PROJECT_NAME=opclaw docker-compose up -d backend
# docker-compose会自动加载.env.production中的所有环境变量
```

### 事件2: 前端WebSocket端口缺失

**问题描述**: 前端无法连接到ws://118.25.0.190:3001

**原因**: docker-compose.yml中只映射了3000和3002端口，遗漏了3001

**修复**: 添加端口映射
```yaml
ports:
  - "${BACKEND_PORT:-3000}:3000"
  - "${WS_PORT:-3001}:3001"  # 添加此行
  - "${REMOTE_WS_PORT:-3002}:3002"
```

---

## 三、Agent配置不一致问题

### 问题描述
Remote agent使用通用API key而非注册后分配的唯一key，导致heartbeat失败。

### 根本原因
Agent的`.env`文件配置：
```bash
PLATFORM_API_KEY=sk-remote-instance-auto-register-2024
```

但数据库中实例的实际API key是唯一生成的，例如：
```
sk-remote-987ed3801608df297d7a8e9921717596eec46de9e4a208fee4d155fc65b907a3
```

### 解决方案
注册成功后，agent会保存credentials到`/opt/openclaw-agent/credentials.json`：
```json
{
  "instanceId": "inst-remote-mmvqx3gu-25ca804c53f94cfc",
  "platformApiKey": "sk-remote-987ed3801608df297d7a8e9921717596eec46de9e4a208fee4d155fc65b907a3",
  "platformUrl": "http://118.25.0.190",
  "registeredAt": "2026-03-18T07:54:47.129Z"
}
```

**修复**: 重启agent服务让它加载credentials.json
```bash
systemctl restart openclaw-agent
```

---

## 四、实例状态自动变为Error

### 问题描述
实例初始为active状态，但health check周期自动将其标记为error。

### 原因
有多个健康检查机制同时运行：
1. RemoteHeartbeatMonitor - 检查heartbeat超时
2. InstanceRegistry - WebSocket连接检查
3. MetricsCollectionService - 容器健康检查（错误地检查remote实例的Docker容器）

### 临时解决方案
手动更新实例状态：
```sql
UPDATE instances SET status = 'active', health_status = 'healthy'
WHERE id IN (3,4);
```

---

## 五、正确的DevOps规则

### 1. 永不使用docker run直接部署
**❌ 错误**:
```bash
docker run -d --name opclaw-backend [options] opclaw-backend:latest
```

**✅ 正确**:
```bash
COMPOSE_PROJECT_NAME=opclaw docker-compose up -d backend
```

### 2. 配置文件管理
**主要配置文件位置**:
- **PRIMARY**: `/opt/opclaw/platform/.env.production` (生产环境真实配置)
- **REFERENCE**: `/opt/opclaw/backend/.env.production.example` (模板文件)

**⚠️ 警告**: 不要使用其他位置的.env文件（可能是过时或placeholder）

### 3. 部署前检查清单
- [ ] 确认当前分支和commit
- [ ] 备份数据库: `docker exec opclaw-postgres pg_dump -U opclaw opclaw | gzip > backup.sql.gz`
- [ ] 备份配置文件: `cp /opt/opclaw/platform/.env.production /backup/`
- [ ] 使用git pull拉取最新代码（而非手动修改）
- [ ] 使用rsync同步代码到服务器
- [ ] 使用docker-compose重建服务（指定COMPOSE_PROJECT_NAME）
- [ ] 验证服务状态: `docker ps | grep opclaw`
- [ ] 检查健康状态: `curl http://localhost:3000/health`

### 4. 数据库保护规则
- **永远不要**在生产环境直接执行DROP/DELETE/TRUNCATE
- **变更前必须备份**
- **使用事务进行批量更新**
- **关键操作使用EXPLAIN分析**

### 5. 服务配置优先级
1. **环境变量**: 通过.env.production文件
2. **docker-compose.yml**: 服务编排配置
3. **代码默认值**: 仅作为fallback

---

## 六、部署工具和流程

### 部署工具链
```
本地开发 → Git提交 → 推送到远程 → rsync同步 → docker-compose部署
```

### 正确的部署流程
```bash
# 1. 本地提交代码
git add .
git commit -m "feat: description"
git push origin main

# 2. 登录服务器
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190

# 3. 拉取代码
cd /opt/opclaw/platform
git pull origin main

# 4. 同步到部署目录（如果有）
rsync -av --exclude='node_modules' --exclude='.git' src/ ../deployment/

# 5. 重建服务
COMPOSE_PROJECT_NAME=opclaw docker-compose up -d --build backend

# 6. 验证服务
docker ps | grep opclaw
curl http://localhost:3000/health
```

### 回滚流程
```bash
# 1. 立即备份当前状态
docker exec opclaw-postgres pg_dump -U opclaw opclaw > rollback_backup.sql

# 2. 回滚代码
git revert HEAD
git push origin main

# 3. 服务器回滚
cd /opt/opclaw/platform
git pull origin main
COMPOSE_PROJECT_NAME=opclaw docker-compose up -d --build

# 4. 恢复数据库（如需要）
docker exec -i opclaw-postgres psql -U opclaw opclaw < rollback_backup.sql
```

---

## 七、监控和验证

### 关键监控指标
1. **容器状态**: `docker ps | grep opclaw`
2. **健康检查**:
   - Backend: `curl http://localhost:3000/health`
   - Frontend: `curl http://localhost/`
3. **数据库连接**:
   ```bash
   docker exec opclaw-postgres psql -U opclaw -d opclaw -c "SELECT COUNT(*) FROM instances;"
   ```
4. **Redis连接**: `docker exec opclaw-redis redis-cli -a $REDIS_PASSWORD ping`

### 日志位置
- Backend: `docker logs opclaw-backend -f`
- Frontend/Nginx: `docker logs opclaw-frontend -f`
- PostgreSQL: `docker logs opclaw-postgres -f`
- Agent: `journalctl -u openclaw-agent -f`

---

## 八、备份策略

### 定期备份
```bash
# 每日备份脚本
cat > /root/backup_daily.sh <<'EOF'
#!/bin/bash
BACKUP_DIR=/root/backups/$(date +%Y%m%d)
mkdir -p $BACKUP_DIR

# 数据库备份
docker exec opclaw-postgres pg_dump -U opclaw opclaw | gzip > $BACKUP_DIR/database.sql.gz

# 配置文件备份
cp /opt/opclaw/platform/.env.production $BACKUP_DIR/

# 保留最近7天
find /root/backups -type d -mtime +7 -exec rm -rf {} \;
EOF

chmod +x /root/backup_daily.sh

# 添加到crontab
echo "0 2 * * * /root/backup_daily.sh" | crontab -
```

---

## 九、已知问题和待修复

### 1. Health Check误报
- **问题**: Remote实例被错误地检查Docker容器状态
- **影响**: 实例状态被标记为error
- **状态**: 需要修复MetricsCollectionService逻辑

### 2. WebSocket HTTP 404响应
- **问题**: Heartbeat请求返回404，但功能正常
- **影响**: 日志中有大量警告信息
- **状态**: 不影响功能，属于NestJS框架问题

### 3. Agent credentials管理
- **问题**: Agent需要重启才能加载新的API key
- **影响**: 部署后可能需要手动重启agent
- **状态**: 需要优化agent的配置加载逻辑

---

## 十、总结和行动计划

### 立即行动项
1. ✅ 建立定期备份机制
2. ✅ 更新部署文档
3. ⏳ 优化health check逻辑，避免误报
4. ⏳ 改进agent配置管理

### DevOps原则
1. **自动化优先**: 使用docker-compose而非手动docker命令
2. **配置管理**: 所有配置通过.env文件管理
3. **变更可逆**: 每次部署前备份
4. **监控验证**: 部署后立即验证服务状态
5. **文档同步**: 代码变更时同步更新文档

---

**文档版本**: 1.0
**最后更新**: 2026-03-18
**维护者**: DevOps Team
