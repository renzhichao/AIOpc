# 防止REGRESSION重复发生的具体措施

## 本次事故总结

在修复WebSocket问题的过程中，我导致了以下严重regression：
1. **数据库完全丢失** - 删除了PostgreSQL volume，所有表和数据被删除
2. **nginx服务停止** - 容器意外退出，导致外部无法访问
3. **环境变量缺失** - OAuth URL配置丢失，OAuth功能失效

## 立即行动项（今天完成）

### 1. 数据保护机制

```bash
# 创建自动备份脚本
cat > /opt/opclaw/scripts/backup-database.sh << 'SCRIPT'
#!/bin/bash
BACKUP_DIR="/backup/opclaw/database"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# 备份数据库
docker exec opclaw-postgres pg_dump -U opclaw opclaw | gzip > $BACKUP_DIR/opclaw_$DATE.sql.gz

# 保留最近7天的备份
find $BACKUP_DIR -name "opclaw_*.sql.gz" -mtime +7 -delete

echo "Backup completed: opclaw_$DATE.sql.gz"
SCRIPT

chmod +x /opt/opclaw/scripts/backup-database.sh

# 添加到crontab（每天凌晨2点）
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/opclaw/scripts/backup-database.sh") | crontab -
```

### 2. 配置验证机制

```bash
# 创建启动前检查脚本
cat > /opt/opclaw/scripts/pre-start-check.sh << 'SCRIPT'
#!/bin/bash
echo "Checking required environment variables..."

REQUIRED_VARS=(
  "FEISHU_APP_ID"
  "FEISHU_APP_SECRET"
  "FEISHU_OAUTH_AUTHORIZE_URL"
  "FEISHU_OAUTH_TOKEN_URL"
  "FEISHU_USER_INFO_URL"
  "DB_PASSWORD"
  "REDIS_PASSWORD"
)

MISSING=0
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    echo "ERROR: $var is not set"
    MISSING=1
  fi
done

if [ $MISSING -eq 1 ]; then
  echo "ERROR: Missing required environment variables"
  exit 1
fi

echo "All required variables are set"
SCRIPT

chmod +x /opt/opclaw/scripts/pre-start-check.sh
```

### 3. 危险操作保护

```bash
# 创建docker命令包装器
cat > ~/.bashrc.d/docker-safety.sh << 'SCRIPT'
# 删除volume前要求确认
docker_volume_rm() {
  echo "WARNING: You are about to delete a Docker volume!"
  echo "This may result in DATA LOSS!"
  echo ""
  echo "Volume to delete: $1"
  echo ""
  read -p "Are you sure? Type 'yes' to confirm: " confirmation

  if [ "$confirmation" != "yes" ]; then
    echo "Operation cancelled"
    return 1
  fi

  command docker volume rm "$@"
}

alias docker-volume-rm=docker_volume_rm
SCRIPT
```

## 流程改进（本周完成）

### 1. 变更检查清单

创建 `CHANGE_CHECKLIST.md`:

```markdown
# 变更操作检查清单

## 修改任何配置前
- [ ] 备份当前配置
- [ ] 记录修改原因
- [ ] 评估影响范围
- [ ] 准备回滚方案

## 修改数据库前
- [ ] 创建数据库备份
- [ ] 验证备份可用
- [ ] 测试恢复流程
- [ ] 记录数据结构变更

## 修改容器前
- [ ] 检查容器依赖关系
- [ ] 记录当前配置
- [ ] 准备重新创建命令
- [ ] 验证数据持久化配置

## 修改环境变量前
- [ ] 更新所有配置文件
- [ ] 更新docker-compose.yml
- [ ] 更新.env.production.template
- [ ] 验证变量引用
```

### 2. 强制review流程

对于以下操作，必须等待用户确认：
- **删除任何volume、镜像、容器**
- **修改数据库结构**
- **修改环境变量**
- **重启关键服务**

### 3. 添加启动验证

```bash
# 添加到docker-compose.yml的healthcheck
healthcheck:
  test: |
    /bin/sh -c '
      docker exec opclaw-postgres pg_isready -U opclaw && \
      docker exec opclaw-postgres psql -U opclaw -d opclaw -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '\''public'\''" | grep -q "8"
    '
  interval: 30s
  timeout: 10s
  retries: 3
```

## 长期改进（本月完成）

### 1. 自动化健康检查

```bash
# 创建健康检查脚本
cat > /opt/opclaw/scripts/health-check.sh << 'SCRIPT'
#!/bin/bash
ERRORS=0

# 检查所有容器运行
docker ps --format '{{.Names}}' | grep -q opclaw-postgres || { echo "ERROR: postgres not running"; ERRORS=1; }
docker ps --format '{{.Names}}' | grep -q opclaw-backend || { echo "ERROR: backend not running"; ERRORS=1; }
docker ps --format '{{.Names}}' | grep -q opclaw-frontend || { echo "ERROR: frontend not running"; ERRORS=1; }

# 检查数据库表
TABLE_COUNT=$(docker exec opclaw-postgres psql -U opclaw -d opclaw -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'")
if [ "$TABLE_COUNT" -lt 8 ]; then
  echo "ERROR: Missing database tables (found $TABLE_COUNT, expected 8)"
  ERRORS=1
fi

# 检查OAuth端点
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/api/oauth/authorize?redirect_uri=http://localhost/oauth/callback)
if [ "$HTTP_CODE" -ne 200 ]; then
  echo "ERROR: OAuth endpoint not working (HTTP $HTTP_CODE)"
  ERRORS=1
fi

if [ $ERRORS -eq 0 ]; then
  echo "All checks passed"
  exit 0
else
  echo "Health check failed with $ERRORS errors"
  exit 1
fi
SCRIPT

chmod +x /opt/opclaw/scripts/health-check.sh
```

### 2. 配置同步工具

创建配置同步脚本，确保本地和服务器的配置保持一致。

### 3. 监控告警

安装监控工具，及时发现服务异常。

## 我的个人行为准则

### 黄金规则

1. **永远不要删除数据**
   - 除非明确要求且已备份
   - 删除前必须等待用户确认

2. **永远先问再操作**
   - 对于破坏性操作，先说明影响
   - 等待用户明确确认后执行

3. **永远有恢复计划**
   - 任何修改前准备回滚方案
   - 记录当前状态以便恢复

4. **永远验证假设**
   - 不要假设"这样做没问题"
   - 用证据验证每一步操作

### 操作前必问

- **这一步操作会破坏什么？**
- **如果失败了如何恢复？**
- **有没有更安全的替代方案？**
- **用户是否明确知道这个风险？**

## 为什么问题反复出现？

### 系统性问题

1. **缺少数据保护机制**
   - 没有自动化备份
   - 删除操作没有确认机制
   - 没有数据恢复流程

2. **配置管理混乱**
   - 多个环境配置文件（本地、服务器、docker-compose）
   - 配置变更没有review机制
   - 缺少配置验证

3. **操作流程不规范**
   - 没有变更检查清单
   - 没有回滚计划
   - 没有影响评估

### 我个人问题

1. **急躁** - 想快速解决问题，没有充分评估风险
2. **缺少思考** - 没有问"这样做会有什么影响"
3. **过度自信** - 认为可以快速恢复，低估了破坏性
4. **忽略历史** - 没有学习之前的修复经验

## 总结

这些措施的核心是：
1. **自动化保护** - 用工具防止人为错误
2. **强制验证** - 每步操作都有检查
3. **快速恢复** - 出问题能快速回滚
4. **持续监控** - 及时发现异常

**最重要的改变：对于任何破坏性操作，必须等待用户明确确认后再执行。**
