# 回滚测试指南 (Rollback Testing Guide)

## 概述 (Overview)

回滚测试是确保部署失败时能够快速、可靠恢复的关键环节。本文档详细说明了 AIOpc 平台的回滚测试流程、标准和最佳实践。

**目的 (Purpose)**:
- 验证回滚机制的可靠性
- 确保回滚时间符合 SLA 要求
- 定期检查回滚流程的有效性
- 发现并修复回滚过程中的潜在问题

**适用范围 (Scope)**:
- Staging 环境自动化测试
- 生产环境回滚前验证
- 回滚流程改进和优化

---

## 回滚时间 SLA (Rollback Time SLAs)

### 总体时间目标

```
检测 (Detection)     →  < 1 分钟
决策 (Decision)      →  < 2 分钟
执行 (Execution)     →  < 3 分钟
验证 (Verification)  →  < 5 分钟
─────────────────────────────
总计 (Total)         →  < 10 分钟
```

### 详细时间分解

| 阶段 (Phase) | 目标时间 (Target Time) | 说明 (Description) |
|--------------|----------------------|-------------------|
| 问题检测 (Detection) | < 60s | 监控系统检测到问题并触发告警 |
| 决策制定 (Decision) | < 120s | 团队评估问题并决定回滚 |
| 回滚执行 (Execution) | < 180s | 执行回滚操作，恢复服务 |
| 服务验证 (Verification) | < 300s | 验证服务恢复正常 |
| **总计 (Total)** | **< 600s** | **端到端回滚时间** |

### 自动化回滚测试时间目标

```
创建备份 (Backup)        →  < 2 分钟
部署测试 (Deploy)        →  < 3 分钟
回滚前验证 (Pre-check)   →  < 1 分钟
执行回滚 (Rollback)      →  < 3 分钟  ⭐ 关键指标
回滚后验证 (Post-check)  →  < 2 分钟
完整性验证 (Integrity)   →  < 1 分钟
─────────────────────────────────────
总计 (Total)             →  < 12 分钟
```

---

## 回滚测试场景 (Rollback Test Scenarios)

### 场景 1: 后端回滚测试

**目的**: 验证后端服务回滚功能

**步骤**:
1. 创建当前后端版本的备份
2. 部署新版本后端（或使用当前版本模拟）
3. 验证后端服务健康
4. 执行后端回滚
5. 验证后端服务恢复
6. 检查数据完整性

**验证点**:
- ✅ 后端容器正常启动
- ✅ 健康检查端点响应正常
- ✅ API 服务可用
- ✅ 数据库连接正常
- ✅ 回滚时间 < 3 分钟

### 场景 2: 前端回滚测试

**目的**: 验证前端静态资源回滚功能

**步骤**:
1. 备份当前前端版本
2. 部署新版本前端
3. 验证前端可访问
4. 执行前端回滚
5. 验证前端恢复
6. 检查资源完整性

**验证点**:
- ✅ Nginx 配置正确
- ✅ 静态资源可访问
- ✅ 页面加载正常
- ✅ JavaScript/CSS 资源完整
- ✅ 回滚时间 < 2 分钟

### 场景 3: 数据库迁移回滚测试

**目的**: 验证数据库迁移回滚功能

**步骤**:
1. 创建数据库完整备份
2. 执行测试迁移（添加测试表/字段）
3. 验证迁移成功
4. 执行数据库回滚
5. 验证数据库恢复
6. 检查数据一致性

**验证点**:
- ✅ 数据库服务正常
- ✅ 数据结构恢复正确
- ✅ 数据完整性保持
- ✅ 无数据丢失
- ✅ 回滚时间 < 5 分钟

### 场景 4: 全栈回滚测试

**目的**: 验证完整系统回滚功能

**步骤**:
1. 创建全系统备份（后端+前端+数据库）
2. 部署所有组件新版本
3. 验证系统整体健康
4. 执行全系统回滚
5. 验证所有服务恢复
6. 端到端功能测试

**验证点**:
- ✅ 所有服务正常启动
- ✅ 服务间通信正常
- ✅ 用户功能可用
- ✅ 数据一致性保持
- ✅ 回滚时间 < 10 分钟

---

## 自动化回滚测试 (Automated Rollback Testing)

### 测试脚本使用

**基本用法**:
```bash
# 测试所有组件的回滚（模拟模式）
./scripts/test-rollback.sh --env staging --dry-run

# 测试后端回滚（实际执行）
./scripts/test-rollback.sh --env staging --component backend

# 测试数据库回滚（跳过备份）
./scripts/test-rollback.sh --env staging --component database --skip-backup

# 详细输出
./scripts/test-rollback.sh --env staging --verbose
```

**参数说明**:
- `--env <environment>`: 目标环境（仅支持 staging）
- `--component <component>`: 测试组件（backend/frontend/database/all）
- `--skip-backup`: 跳过创建测试前备份
- `--dry-run`: 模拟运行，不执行实际回滚
- `--verbose`: 详细输出
- `--help`: 显示帮助信息

**安全机制**:
- ⚠️ 自动检测环境，禁止在 production 运行
- ⚠️ 检查生产环境配置标识
- ⚠️ 创建测试前备份
- ⚠️ 完整的验证流程

### CI/CD 集成

**定期测试**:
- 每周日凌晨 3 点自动执行
- 测试所有组件回滚功能
- 生成测试报告并归档

**手动触发**:
```yaml
# GitHub Actions 手动触发
- component: 选择测试组件
- dry_run: 是否模拟运行
```

**测试报告**:
- JSON 格式详细报告
- 时间统计和 SLA 检查
- 测试结果汇总
- 保存 30 天供审计

---

## 回滚测试流程 (Rollback Testing Process)

### 测试前准备

1. **环境检查**:
   ```bash
   # 确认是 Staging 环境
   ssh root@118.25.0.190 "cat /etc/opclaw/.env | grep -i staging"

   # 检查服务状态
   ssh root@118.25.0.190 "cd /opt/opclaw && docker compose ps"
   ```

2. **备份空间检查**:
   ```bash
   # 检查备份目录空间
   ssh root@118.25.0.190 "df -h /opt/opclaw/backups"
   ```

3. **清理旧备份**（可选）:
   ```bash
   # 删除 30 天前的备份
   ssh root@118.25.0.190 "find /opt/opclaw/backups -name 'backup_*' -mtime +30 -exec rm -rf {} +"
   ```

### 执行测试

**步骤 1: 创建测试前备份**
```bash
# 自动创建测试前备份
./scripts/test-rollback.sh --env staging
```

**步骤 2: 部署测试版本**
- 使用当前版本作为测试基线
- 或部署指定的测试版本

**步骤 3: 回滚前验证**
- 检查所有服务健康状态
- 记录当前系统状态

**步骤 4: 执行回滚**
- 调用回滚脚本
- 执行回滚操作
- 记录回滚时间

**步骤 5: 回滚后验证**
- 检查服务恢复状态
- 验证功能正常

**步骤 6: 数据完整性检查**
- 验证配置文件
- 检查数据库连接
- 确认服务间通信

**步骤 7: 生成测试报告**
- 汇总测试结果
- 检查 SLA 合规性
- 保存测试报告

### 测试后清理

```bash
# 查看测试备份
ssh root@118.25.0.190 "ls -lh /opt/opclaw/backups/test-rollback-*"

# 清理测试备份（确认测试通过后）
ssh root@118.25.0.190 "rm -rf /opt/opclaw/backups/test-rollback-*"
```

---

## 测试结果验证 (Test Result Validation)

### 测试报告结构

**JSON 报告**:
```json
{
  "test_id": "rollback-test-20260318_030000",
  "timestamp": "20260318_030000",
  "environment": "staging",
  "component": "all",
  "results": {
    "total_tests": 16,
    "passed": 16,
    "failed": 0,
    "pass_rate": 100.00
  },
  "timing": {
    "backup_seconds": 45,
    "deploy_seconds": 10,
    "verify_before_seconds": 15,
    "rollback_seconds": 120,
    "verify_after_seconds": 45,
    "integrity_seconds": 20,
    "total_seconds": 255
  },
  "sla_compliance": {
    "rollback_time_target": "180 seconds",
    "rollback_time_actual": "120 seconds",
    "rollback_time_passed": true,
    "total_time_target": "600 seconds",
    "total_time_actual": "255 seconds",
    "total_time_passed": true
  }
}
```

### 测试用例检查清单

**安全检查 (Safety Checks)**:
- [ ] 环境检查通过（仅 staging）
- [ ] 生产环境检查通过
- [ ] 备份目录检查通过

**功能测试 (Functional Tests)**:
- [ ] 创建测试前备份
- [ ] 备份完整性验证
- [ ] 部署测试版本
- [ ] 回滚前验证
- [ ] 执行回滚操作
- [ ] 回滚后验证
- [ ] 数据完整性验证

**SLA 检查 (SLA Compliance)**:
- [ ] 回滚执行时间 < 3 分钟
- [ ] 总回滚时间 < 10 分钟

**质量检查 (Quality Checks)**:
- [ ] 测试脚本幂等性
- [ ] 错误处理正确
- [ ] 日志记录完整

---

## 故障排查指南 (Troubleshooting Guide)

### 常见问题

**问题 1: 回滚时间超过 SLA**

**症状**: 回滚执行时间 > 3 分钟

**可能原因**:
- 容器启动慢
- 网络延迟
- 资源限制

**解决方案**:
```bash
# 检查容器启动时间
docker inspect opclaw-backend | grep -A 10 State

# 检查资源使用
docker stats

# 优化容器启动
# - 预拉取镜像
# - 减少容器启动依赖
# - 优化健康检查
```

**问题 2: 回滚后服务不健康**

**症状**: 回滚后健康检查失败

**可能原因**:
- 备份不完整
- 配置错误
- 数据库连接失败

**解决方案**:
```bash
# 检查容器日志
docker logs opclaw-backend --tail 100

# 检查数据库连接
docker exec opclaw-postgres psql -U opclaw -c "SELECT 1;"

# 验证配置文件
cat /opt/opclaw/backend/.env

# 检查网络连接
docker network inspect opclaw_opclaw-network
```

**问题 3: 数据完整性验证失败**

**症状**: 数据库连接失败或数据不一致

**可能原因**:
- 数据库备份不完整
- 回滚过程中断
- 数据库迁移问题

**解决方案**:
```bash
# 检查数据库状态
docker exec opclaw-postgres pg_isready -U opclaw

# 验证数据库备份
gunzip -c /opt/opclaw/backups/backup_xxx/database.sql.gz | head -n 100

# 检查数据库表
docker exec opclaw-postgres psql -U opclaw -d opclaw -c "\dt"

# 恢复数据库（如有必要）
gunzip < backup.sql.gz | docker exec -i opclaw-postgres psql -U opclaw opclaw
```

**问题 4: 测试脚本执行失败**

**症状**: 测试脚本报错退出

**可能原因**:
- SSH 连接失败
- 权限不足
- 环境变量错误

**解决方案**:
```bash
# 检查 SSH 连接
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 "hostname"

# 检查脚本权限
ls -l scripts/test-rollback.sh

# 检查环境变量
env | grep -E "DEPLOY_|ENVIRONMENT"

# 启用详细输出
./scripts/test-rollback.sh --env staging --verbose
```

---

## 最佳实践 (Best Practices)

### 测试频率

**定期测试**:
- **每周一次**: 自动化全量测试
- **部署前**: 手动验证回滚能力
- **重大变更后**: 立即测试新回滚流程

**测试环境**:
- ⚠️ **仅限 Staging 环境**
- ⚠️ **禁止在 Production 测试**

### 测试准备

1. **备份策略**:
   - 保留最近 7 天的备份
   - 定期清理旧备份
   - 验证备份完整性

2. **监控设置**:
   - 配置告警规则
   - 设置回滚时间监控
   - 记录测试历史

3. **文档维护**:
   - 更新测试流程
   - 记录已知问题
   - 分享测试经验

### 测试执行

1. **安全第一**:
   - 始终在测试环境验证
   - 创建完整备份
   - 准备回滚方案

2. **全面测试**:
   - 测试所有组件
   - 验证所有场景
   - 检查边界情况

3. **详细记录**:
   - 记录测试结果
   - 分析失败原因
   - 跟踪改进进度

### 持续改进

1. **性能优化**:
   - 优化回滚时间
   - 减少服务中断
   - 提高自动化程度

2. **流程改进**:
   - 简化测试步骤
   - 提高测试效率
   - 增强测试覆盖

3. **经验积累**:
   - 总结测试经验
   - 分享最佳实践
   - 培训团队成员

---

## 集成与协作 (Integration & Collaboration)

### 与 CI/CD 集成

**GitHub Actions**:
- 自动化定期测试
- PR 合并前验证
- 部署后质量检查

**触发条件**:
```yaml
# 定期执行
schedule:
  - cron: '0 3 * * 0'  # 每周日凌晨 3 点

# 手动触发
workflow_dispatch:
  inputs:
    component:
      type: choice
      options: [all, backend, frontend, database]
```

### 与变更管理集成

**变更前验证**:
- 验证变更可回滚
- 评估回滚风险
- 准备回滚计划

**变更后测试**:
- 验证回滚能力保持
- 更新回滚文档
- 记录变更影响

### 与事件响应集成

**回滚决策**:
- 监控告警触发
- 自动化评估
- 快速回滚执行

**事后分析**:
- 分析回滚原因
- 改进回滚流程
- 更新测试用例

---

## 附录 (Appendix)

### 回滚测试检查清单

**测试前**:
- [ ] 确认是 Staging 环境
- [ ] 检查服务状态正常
- [ ] 验证备份空间充足
- [ ] 通知相关人员

**测试中**:
- [ ] 执行安全检查
- [ ] 创建测试前备份
- [ ] 验证服务健康
- [ ] 执行回滚操作
- [ ] 验证服务恢复
- [ ] 检查数据完整性

**测试后**:
- [ ] 生成测试报告
- [ ] 检查 SLA 合规
- [ ] 分析测试结果
- [ ] 清理测试数据
- [ ] 更新文档记录

### 相关文档

- [变更管理流程](CHANGE_MANAGEMENT.md)
- [回滚操作指南](CHANGE_MANAGEMENT_ROLLBACK.md)
- [CI/CD 流程](CI_PIPELINE.md)
- [事件响应流程](INCIDENT_RESPONSE.md)

### 支持联系

**技术支持**:
- DevOps 团队: devops@aiopclaw.com
- 紧急联系: oncall@aiopclaw.com

**反馈渠道**:
- GitHub Issues: https://github.com/your-org/AIOpc/issues
- 内部论坛: #devops-rollback

---

**版本信息**:
- 文档版本: v1.0.0
- 最后更新: 2026-03-18
- 维护者: DevOps Team

**审核状态**:
- ✅ 技术审核: 通过
- ✅ 运营审核: 通过
- ✅ 安全审核: 通过
