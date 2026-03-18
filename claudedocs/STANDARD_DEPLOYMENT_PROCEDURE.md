# AIOpc Platform - 标准化部署流程

## 文档说明

本文档定义了AIOpc平台的标准化DevOps流程，所有生产环境部署必须严格遵循本流程。

---

## 一、部署前准备

### 1.1 环境检查清单

```bash
# 检查Git状态
git status
git branch

# 确认无未提交的更改
```

### 1.2 备份当前状态

```bash
# 备份数据库
BACKUP_DIR=/tmp/pre_deploy_backup_$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR
docker exec opclaw-postgres pg_dump -U opclaw opclaw | gzip > $BACKUP_DIR/database.sql.gz

# 备份配置文件
cp /opt/opclaw/platform/.env.production $BACKUP_DIR/

echo "备份完成: $BACKUP_DIR"
```

### 1.3 确认配置文件

**⚠️ 关键**: 确认使用正确的配置文件：
- ✅ **主配置**: `/opt/opclaw/platform/.env.production`
- ❌ **不要使用**: `/opt/opclaw/.env.production` (可能包含placeholder)

---

## 二、标准部署流程

### 2.1 本地开发流程

```bash
# 1. 切换到主分支
git checkout main

# 2. 拉取最新代码
git pull origin main

# 3. 创建功能分支（可选）
git checkout -b feat/your-feature-name

# 4. 进行代码更改...
# 编辑文件...

# 5. 提交更改
git add .
git commit -m "feat: description of changes"

# 6. 推送到远程
git push origin feat/your-feature-name
```

### 2.2 服务器部署流程

#### 步骤1: SSH登录服务器

```bash
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190
```

#### 步骤2: 进入项目目录

```bash
cd /opt/opclaw/platform
```

#### 步骤3: 拉取最新代码

```bash
# 查看当前分支
git branch

# 拉取最新代码
git fetch origin
git pull origin main
```

#### 步骤4: 验证配置文件

```bash
# 确认关键环境变量存在
grep -E "FEISHU_APP_ID|FEISHU_APP_SECRET|JWT_SECRET|DB_PASSWORD|REDIS_PASSWORD" /opt/opclaw/platform/.env.production

# 检查是否包含placeholder（如果有则不能部署）
grep -E "cli_xxxxxxxxxxxxx|CHANGE_THIS|your_|placeholder" /opt/opclaw/platform/.env.production
# 如果有输出，说明配置文件有问题，必须修复
```

#### 步骤5: 同步代码到部署目录（如需要）

```bash
# 如果需要从platform目录同步到其他目录
rsync -av --exclude='node_modules' --exclude='.git' \
  /opt/opclaw/platform/src/ /opt/opclaw/backend/src/
```

#### 步骤6: 重建服务

```bash
# ⚠️ 关键：必须指定COMPOSE_PROJECT_NAME
COMPOSE_PROJECT_NAME=opclaw docker-compose up -d --build backend

# 等待服务启动
sleep 10
```

#### 步骤7: 验证服务状态

```bash
# 检查容器状态
docker ps | grep opclaw

# 应该看到以下容器运行中：
# opclaw-backend
# opclaw-postgres
# opclaw-redis
# opclaw-frontend

# 检查健康状态
curl http://localhost:3000/health
# 预期输出: {"status":"ok",...}

# 检查前端
curl -s -o /dev/null -w "%{http_code}" http://localhost/
# 预期输出: 200
```

#### 步骤8: 检查日志

```bash
# 查看backend日志
docker logs opclaw-backend --tail 50

# 查看是否有错误
docker logs opclaw-backend --tail 100 | grep -i error
```

---

## 三、紧急回滚流程

### 3.1 回滚条件

- 部署后服务无法启动
- 数据丢失或corruption
- 关键功能regression
- 性能严重下降

### 3.2 回滚步骤

```bash
# 1. 立即备份当前可能损坏的状态
EMERGENCY_BACKUP=/tmp/emergency_backup_$(date +%Y%m%d_%H%M%S)
mkdir -p $EMERGENCY_BACKUP
docker exec opclaw-postgres pg_dump -U opclaw opclaw > $EMERGENCY_BACKUP/emergency.sql

# 2. 回滚到上一个Git commit
git log --oneline -5  # 查看最近5个commit
git revert HEAD  # 或者 git reset --hard <commit-id>

# 3. 推送回滚
git push origin main

# 4. 服务器拉取回滚后的代码
cd /opt/opclaw/platform
git pull origin main

# 5. 重建服务
COMPOSE_PROJECT_NAME=opclaw docker-compose up -d --build backend

# 6. 恢复数据库（如需要）
# docker exec -i opclaw-postgres psql -U opclaw opclaw < /path/to/backup.sql

# 7. 验证服务
curl http://localhost:3000/health
```

---

## 四、Remote Instance部署流程

### 4.1 新服务器接入流程

使用提供的部署脚本：

```bash
# 从本地运行部署脚本
SSH_KEY_PATH="~/.ssh/aiopclaw_remote_agent"
SERVER_HOST="<new_server_ip>"
SERVER_USER="root"
bash /Users/arthurren/projects/AIOpc/scripts/cloud/deploy-new-instance.sh $SERVER_HOST $SSH_KEY_PATH
```

### 4.2 Remote实例注册

注册流程自动完成：
1. Agent连接到平台
2. 自动注册并获取唯一instance_id和API key
3. Credentials保存到`/opt/openclaw-agent/credentials.json`
4. WebSocket和heartbeat机制启动

### 4.3 实例分配给用户

用户通过扫描二维码认领实例：

```sql
-- 查看可用实例
SELECT id, instance_id, status FROM instances
WHERE deployment_type = 'remote' AND owner_id IS NULL AND status = 'active';

-- 分配实例给用户
UPDATE instances SET owner_id = <user_id>
WHERE instance_id = '<instance_id>';
```

---

## 五、监控和维护

### 5.1 日常监控命令

```bash
# 检查所有容器状态
docker ps -a | grep opclaw

# 检查资源使用
docker stats opclaw-backend opclaw-postgres opclaw-redis --no-stream

# 查看日志
docker logs opclaw-backend --tail 100 -f
docker logs opclaw-frontend --tail 100 -f
```

### 5.2 数据库维护

```bash
# 连接数据库
docker exec -it opclaw-postgres psql -U opclaw -d opclaw

# 查看实例状态
SELECT id, instance_id, status, health_status, owner_id
FROM instances
ORDER BY id;

# 查看用户
SELECT id, name, feishu_user_id FROM users;
```

### 5.3 清理和优化

```bash
# 清理Docker镜像（谨慎使用）
docker image prune -a

# 清理未使用的volumes（危险！）
# docker volume prune  # ⚠️ 不要在生产环境使用

# 查看磁盘使用
df -h
docker system df
```

---

## 六、故障排查指南

### 6.1 容器无法启动

```bash
# 查看容器日志
docker logs <container_name>

# 检查容器状态
docker inspect <container_name>

# 尝试重启
docker restart <container_name>

# 如果还是失败，检查配置
docker-compose config
```

### 6.2 数据库连接失败

```bash
# 检查PostgreSQL容器
docker ps | grep postgres

# 测试连接
docker exec opclaw-postgres psql -U opclaw -d opclaw -c "SELECT 1;"

# 检查环境变量
docker exec opclaw-backend env | grep POSTGRES
```

### 6.3 实例连接问题

```bash
# 检查agent状态
ssh -i ~/.ssh/aiopclaw_remote_agent root@<remote_server_ip> "systemctl status openclaw-agent"

# 查看agent日志
ssh -i ~/.ssh/aiopclaw_remote_agent root@<remote_server_ip> "journalctl -u openclaw-agent -n 50"

# 检查credentials
ssh -i ~/.ssh/aiopclaw_remote_agent root@<remote_server_ip> "cat /opt/openclaw-agent/credentials.json"

# 重启agent
ssh -i ~/.ssh/aiopclaw_remote_agent root@<remote_server_ip> "systemctl restart openclaw-agent"
```

---

## 七、安全最佳实践

### 7.1 访问控制

- 使用SSH密钥认证，禁用密码登录
- 限制数据库远程访问
- 使用防火墙规则限制端口访问
- 定期更新系统和依赖

### 7.2 密钥管理

- **永远不要**将API key提交到Git仓库
- 使用环境变量管理敏感信息
- 定期轮换密钥
- 使用强密码策略

### 7.3 备份策略

- 每日自动备份数据库
- 备份保留7天
- 定期测试备份恢复流程
- 异地备份重要配置

---

## 八、部署检查清单

### 部署前
- [ ] 代码已review并测试
- [ ] 已创建备份
- [ ] 配置文件已验证
- [ ] 团队已通知部署窗口

### 部署中
- [ ] 使用正确的分支
- [ ] 使用docker-compose部署（不用docker run）
- [ ] 指定COMPOSE_PROJECT_NAME
- [ ] 监控日志输出

### 部署后
- [ ] 所有容器运行正常
- [ ] 健康检查通过
- [ ] 关键功能测试通过
- [ ] 性能指标正常
- [ ] 日志无异常错误
- [ ] 更新部署文档

---

## 九、联系和支持

### 服务器信息
- **平台服务器**: 118.25.0.190
- **SSH密钥**: ~/.ssh/rap001_opclaw
- **项目路径**: /opt/opclaw/platform

### Remote实例服务器
- **实例1-2**: 101.34.254.52 (~/.ssh/aiopclaw_remote_agent)
- **实例3**: 118.89.113.176 (~/.ssh/aiopclaw_remote_agent)
- **实例4**: 111.229.175.181 (~/.ssh/aiopclaw_remote_agent)
- **实例5**: 49.235.153.128 (~/.ssh/aiopclaw_remote_agent)

### 紧急联系
- 平台健康检查: http://118.25.0.190:3000/health
- Backend日志: `ssh root@118.25.0.190 "docker logs opclaw-backend -f"`
- 数据库备份: `ssh root@118.25.0.190 "docker exec opclaw-postgres pg_dump -U opclaw opclaw | gzip > backup.sql.gz"`

---

**文档版本**: 1.0
**最后更新**: 2026-03-18
**下次审查**: 2026-04-18
