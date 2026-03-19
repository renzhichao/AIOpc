# AIOpc 部署脚本文档 (Deployment Scripts Documentation)

本文档提供 AIOpc 项目部署脚本的全面指南。脚本已整合为 5 个核心脚本，提供统一、高效、幂等的部署工作流。

This document provides a comprehensive guide to AIOpc project deployment scripts. The scripts have been consolidated into 5 core scripts, providing a unified, efficient, and idempotent deployment workflow.

---

## 目录 (Table of Contents)

1. [快速开始 (Quick Start)](#快速开始-quick-start)
2. [脚本结构 (Script Structure)](#脚本结构-script-structure)
3. [部署脚本 (Deployment Scripts)](#部署脚本-deployment-scripts)
4. [备份脚本 (Backup Scripts)](#备份脚本-backup-scripts)
5. [CI 脚本 (CI Scripts)](#ci-脚本-ci-scripts)
6. [最佳实践 (Best Practices)](#最佳实践-best-practices)
7. [故障排除 (Troubleshooting)](#故障排除-troubleshooting)
8. [集成 CI/CD (CI/CD Integration)](#集成-cicd-cicd-integration)

---

## 快速开始 (Quick Start)

### 一键部署 (One-Command Deployment)

```bash
# 部署所有组件到生产环境
./scripts/deploy/deploy.sh --env production --component all
```

### 快速验证 (Quick Verification)

```bash
# 验证部署状态
./scripts/deploy/verify.sh --env production --component all
```

### 快速备份 (Quick Backup)

```bash
# 备份所有内容
./scripts/backup/backup.sh --type all
```

---

## 脚本结构 (Script Structure)

```
scripts/
├── ci/                    # CI 脚本 (CI Scripts)
│   ├── build.sh          # 构建脚本 (Build Script)
│   └── test.sh           # 测试脚本 (Test Script)
├── deploy/               # 部署脚本 (Deployment Scripts)
│   ├── deploy.sh         # 主部署脚本 (Main Deployment Script)
│   ├── rollback.sh       # 回滚脚本 (Rollback Script)
│   └── verify.sh         # 验证脚本 (Verification Script)
├── backup/               # 备份脚本 (Backup Scripts)
│   ├── backup.sh         # 备份脚本 (Backup Script)
│   └── restore.sh        # 恢复脚本 (Restore Script)
├── legacy/               # 已归档的旧脚本 (Archived Old Scripts)
│   └── [原有脚本]        # (Original Scripts)
└── README.md             # 本文档 (This Document)
```

---

## 部署脚本 (Deployment Scripts)

### 1. deploy.sh - 主部署脚本

**功能 (Features)**:
- ✅ 一键部署后端、前端、数据库 (One-command deployment)
- ✅ 幂等性保证 (可多次运行) (Idempotency guaranteed)
- ✅ 自动备份 (Automatic backup)
- ✅ 健康检查 (Health checks)
- ✅ 回滚支持 (Rollback support)
- ✅ 并行构建 (Parallel builds)

**使用方法 (Usage)**:

```bash
# 基本用法
./scripts/deploy/deploy.sh --env production --component all

# 仅部署后端
./scripts/deploy/deploy.sh --component backend

# 跳过构建和测试
./scripts/deploy/deploy.sh --skip-build --skip-tests

# 模拟运行
./scripts/deploy/deploy.sh --dry-run
```

**选项 (Options)**:

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `--env` | 目标环境 (staging, production) | staging |
| `--component` | 部署组件 (backend, frontend, database, all) | all |
| `--skip-build` | 跳过构建步骤 | false |
| `--skip-backup` | 跳过备份步骤 | false |
| `--skip-tests` | 跳过测试步骤 | false |
| `--dry-run` | 模拟运行 | false |
| `--verbose` | 详细输出 | false |
| `--help` | 显示帮助信息 | - |

**幂等性 (Idempotency)**:

脚本可以安全地多次运行。它会检测已部署的组件并跳过不必要的操作。

The script can be safely run multiple times. It detects deployed components and skips unnecessary operations.

```bash
# 第一次运行：完整部署
./scripts/deploy/deploy.sh --env production

# 第二次运行：仅更新变更的内容
./scripts/deploy/deploy.sh --env production

# 第三次运行：无操作（所有组件已最新）
./scripts/deploy/deploy.sh --env production
```

**部署流程 (Deployment Flow)**:

1. 前置检查 (Prerequisites check)
2. 构建检查 (Build check)
3. 构建组件 (Build components)
4. 运行测试 (Run tests)
5. 创建备份 (Create backup)
6. 部署配置 (Deploy config)
7. 部署组件 (Deploy components)
8. 重启服务 (Restart services)
9. 健康检查 (Health check)

**输出示例 (Output Example)**:

```
==============================================================================
AIOpc 统一部署脚本 (Unified Deployment Script)
==============================================================================
时间戳 (Timestamp): 20260318_120000
主机 (Host): root@118.25.0.190
组件 (Component): all
环境 (Environment): production
==============================================================================

==> 前置检查 (Pre-flight checks)
[SUCCESS] 服务器连接正常
[SUCCESS] 项目目录检查通过

==> 检查构建产物 (Checking build artifacts)
[SUCCESS] 所有构建产物已就绪

==> 运行测试 (Running tests)
[SUCCESS] 所有测试通过

==> 创建备份 (Creating backup)
[SUCCESS] 备份创建完成: /opt/opclaw/backups/backup_20260318_120000

==> 部署后端 (Deploying backend)
[SUCCESS] 后端部署完成

==> 部署前端 (Deploying frontend)
[SUCCESS] 前端部署完成

==> 重启服务 (Restarting services)
[SUCCESS] 服务重启完成

==> 健康检查 (Health checks)
[SUCCESS] 所有健康检查通过

==============================================================================
部署成功完成! (Deployment completed successfully!)
==============================================================================
```

---

### 2. rollback.sh - 回滚脚本

**功能 (Features)**:
- ✅ 一键回滚 (One-command rollback)
- ✅ 支持指定版本回滚 (Version-specific rollback)
- ✅ 自动回滚前备份 (Pre-rollback backup)
- ✅ 回滚后验证 (Post-rollback verification)

**使用方法 (Usage)**:

```bash
# 回滚到最新备份
./scripts/deploy/rollback.sh --env production

# 回滚到指定版本
./scripts/deploy/rollback.sh --to backup_20260318_120000

# 仅回滚后端
./scripts/deploy/rollback.sh --component backend

# 列出所有可用备份
./scripts/deploy/rollback.sh --list

# 模拟运行
./scripts/deploy/rollback.sh --dry-run
```

**选项 (Options)**:

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `--env` | 目标环境 (staging, production) | production |
| `--component` | 回滚组件 (backend, frontend, database, all) | all |
| `--to` | 回滚到指定备份版本 | 最新备份 |
| `--list` | 列出所有可用备份 | - |
| `--dry-run` | 模拟运行 | false |

**回滚流程 (Rollback Flow)**:

1. 确定回滚版本 (Determine rollback version)
2. 验证备份完整性 (Verify backup integrity)
3. 确认回滚操作 (Confirm rollback)
4. 创建回滚前备份 (Create pre-rollback backup)
5. 执行回滚 (Execute rollback)
6. 验证回滚 (Verify rollback)

---

### 3. verify.sh - 验证脚本

**功能 (Features)**:
- ✅ 全面的健康检查 (Comprehensive health checks)
- ✅ 服务状态验证 (Service status verification)
- ✅ 配置验证 (Configuration validation)
- ✅ 性能基准测试 (Performance benchmarking)
- ✅ 安全检查 (Security checks)

**使用方法 (Usage)**:

```bash
# 验证所有组件
./scripts/deploy/verify.sh --env production --component all

# 仅验证后端
./scripts/deploy/verify.sh --component backend

# 详细输出
./scripts/deploy/verify.sh --verbose

# JSON 格式输出
./scripts/deploy/verify.sh --json
```

**检查类别 (Check Categories)**:

| 类别 | 检查项 |
|------|--------|
| **系统检查** | SSH连接、磁盘空间、内存使用、CPU负载 |
| **后端检查** | 容器运行、健康端点、API响应、日志错误、端口监听 |
| **前端检查** | 文件存在、文件权限、HTTP访问、Nginx配置 |
| **数据库检查** | 容器运行、连接状态、数据库大小、连接数、慢查询 |
| **配置检查** | 环境配置、必需变量、Nginx配置、SSL证书 |
| **性能检查** | 响应时间、查询性能、磁盘I/O |
| **安全检查** | 防火墙、SSH配置、文件权限、开放端口 |

**输出示例 (Output Example)**:

```
==============================================================================
AIOpc 部署验证脚本 (Deployment Verification Script)
==============================================================================
时间戳 (Timestamp): 20260318_120000
主机 (Host): root@118.25.0.190
组件 (Component): all
==============================================================================

==> 系统检查 (System checks)
[✓] SSH连接
[✓] 磁盘空间 (使用率: 45%)
[✓] 内存使用 (使用率: 62%)
[INFO] CPU负载: 0.15, 0.12, 0.08

==> 后端检查 (Backend checks)
[✓] 后端容器运行
[✓] 后端健康端点
[✓] 后端API响应
[✓] 后端日志错误数: 2
[✓] 后端端口监听

==> 前端检查 (Frontend checks)
[✓] 前端文件存在
[✓] 前端文件权限
[✓] 前端HTTP访问 (HTTP 200)
[✓] Nginx配置有效
[✓] Nginx运行状态

==============================================================================
验证摘要 (Verification Summary)
==============================================================================
总检查数 (Total checks): 25
通过 (Passed): 25
失败 (Failed): 0
警告 (Warnings): 0

通过率 (Pass rate): 100%
[SUCCESS] 所有关键检查通过! (All critical checks passed!)
==============================================================================
```

---

## 备份脚本 (Backup Scripts)

### 1. backup.sh - 备份脚本

**功能 (Features)**:
- ✅ 自动备份 (Automatic backup)
- ✅ 增量备份支持 (Incremental backup support)
- ✅ 备份验证 (Backup verification)
- ✅ 自动清理旧备份 (Automatic cleanup)

**使用方法 (Usage)**:

```bash
# 备份所有内容
./scripts/backup/backup.sh --type all

# 仅备份数据库
./scripts/backup/backup.sh --type database

# 备份到指定路径
./scripts/backup/backup.sh --destination /mnt/backups

# 保留30天的备份
./scripts/backup/backup.sh --retention 30
```

**选项 (Options)**:

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `--type` | 备份类型 (database, config, files, logs, all) | all |
| `--destination` | 备份目标路径 | /opt/opclaw/backups |
| `--retention` | 保留天数 | 7 |
| `--no-verify` | 跳过备份验证 | - |
| `--no-compress` | 不压缩备份文件 | - |

**备份类型 (Backup Types)**:

- **database**: 数据库备份 (PostgreSQL)
- **config**: 配置文件备份 (.env, nginx, docker-compose)
- **files**: 文件备份 (backend code, frontend files)
- **logs**: 日志文件备份
- **all**: 全部备份 (默认)

**备份文件命名 (Backup Naming)**:

备份目录使用时间戳命名，格式: `YYYYMMDD_HHMMSS`

示例: `20260318_120000`

**自动清理 (Automatic Cleanup)**:

默认保留最近7天的备份，超过保留期的备份会被自动删除。

---

### 2. restore.sh - 恢复脚本

**功能 (Features)**:
- ✅ 数据库恢复 (Database restore)
- ✅ 配置恢复 (Configuration restore)
- ✅ 文件恢复 (File restore)
- ✅ 恢复验证 (Restore verification)
- ✅ 恢复前备份 (Pre-restore backup)

**使用方法 (Usage)**:

```bash
# 从备份恢复所有内容
./scripts/backup/restore.sh --type all --source /opt/opclaw/backups/20260318_120000

# 仅恢复数据库
./scripts/backup/restore.sh --type database --source /opt/opclaw/backups/20260318_120000

# 恢复但不创建恢复前备份
./scripts/backup/restore.sh --no-backup --source /opt/opclaw/backups/20260318_120000
```

**选项 (Options)**:

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `--type` | 恢复类型 (database, config, files, all) | all |
| `--source` | 备份源路径 | 必需 |
| `--no-backup` | 不创建恢复前备份 | - |
| `--no-verify` | 跳过恢复验证 | - |

**恢复前备份 (Pre-restore Backup)**:

默认情况下，恢复操作会先创建当前状态的备份。如果恢复失败，可以使用此备份回滚到恢复前的状态。

**安全性 (Safety)**:

- 恢复操作会覆盖现有数据
- 建议先在测试环境验证
- 确保备份文件完整且可访问
- 恢复前会自动创建当前状态的备份

---

## CI 脚本 (CI Scripts)

### 1. build.sh - 构建脚本

**功能 (Features)**:
- ✅ 并行构建 (Parallel builds)
- ✅ 依赖检查 (Dependency checks)
- ✅ 构建验证 (Build verification)
- ✅ 产物缓存 (Artifact caching)

**使用方法 (Usage)**:

```bash
# 构建所有组件
./scripts/ci/build.sh --component all

# 仅构建后端
./scripts/ci/build.sh --component backend

# 清理并重新构建
./scripts/ci/build.sh --clean

# 串行构建
./scripts/ci/build.sh --no-parallel
```

**选项 (Options)**:

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `--component` | 构建组件 (backend, frontend, all) | all |
| `--parallel` | 并行构建 | true |
| `--clean` | 清理旧构建 | false |
| `--verbose` | 详细输出 | false |

**环境要求 (Requirements)**:

- Node.js >= 18.0.0
- pnpm 或 npm
- TypeScript

**构建输出 (Build Output)**:

- 后端: `platform/backend/dist/`
- 前端: `platform/frontend/dist/`

---

### 2. test.sh - 测试脚本

**功能 (Features)**:
- ✅ 单元测试 (Unit tests)
- ✅ 集成测试 (Integration tests)
- ✅ 覆盖率报告 (Coverage reports)
- ✅ 并行测试执行 (Parallel test execution)

**使用方法 (Usage)**:

```bash
# 运行所有测试
./scripts/ci/test.sh --component all

# 运行测试并生成覆盖率报告
./scripts/ci/test.sh --coverage

# 仅运行后端测试
./scripts/ci/test.sh --component backend

# 运行集成测试
./scripts/ci/test.sh --type integration

# 监视模式
./scripts/ci/test.sh --watch
```

**选项 (Options)**:

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `--component` | 测试组件 (backend, frontend, all) | all |
| `--type` | 测试类型 (unit, integration, e2e, all) | all |
| `--coverage` | 生成覆盖率报告 | false |
| `--watch` | 监视模式 | false |
| `--parallel` | 并行测试 | true |

**测试类型 (Test Types)**:

- **unit**: 单元测试 (默认)
- **integration**: 集成测试
- **e2e**: 端到端测试
- **all**: 所有测试

---

## 最佳实践 (Best Practices)

### 1. 部署前检查 (Pre-deployment Checks)

```bash
# 1. 运行质量门禁
./scripts/quality-gate.sh

# 2. 运行测试
./scripts/ci/test.sh --coverage

# 3. 构建项目
./scripts/ci/build.sh --component all

# 4. 创建备份
./scripts/backup/backup.sh --type all
```

### 2. 分阶段部署 (Phased Deployment)

```bash
# 1. 部署到测试环境
./scripts/deploy/deploy.sh --env staging --component all

# 2. 验证测试环境
./scripts/deploy/verify.sh --env staging

# 3. 部署到生产环境
./scripts/deploy/deploy.sh --env production --component all

# 4. 验证生产环境
./scripts/deploy/verify.sh --env production
```

### 3. 回滚策略 (Rollback Strategy)

```bash
# 1. 列出可用备份
./scripts/deploy/rollback.sh --list

# 2. 回滚到指定版本
./scripts/deploy/rollback.sh --to backup_20260318_120000

# 3. 验证回滚
./scripts/deploy/verify.sh --env production
```

### 4. 定期备份 (Regular Backup)

```bash
# 设置 cron 任务定期备份
# 每天凌晨2点备份
0 2 * * * /path/to/scripts/backup/backup.sh --type all --retention 7
```

### 5. 监控和告警 (Monitoring and Alerting)

```bash
# 定期运行健康检查
# 每5分钟检查一次
*/5 * * * * /path/to/scripts/deploy/verify.sh --json > /tmp/health.json
```

---

## 故障排除 (Troubleshooting)

### 常见问题 (Common Issues)

#### 1. SSH 连接失败

**问题 (Problem)**:
```
[ERROR] 无法连接到服务器 root@118.25.0.190
```

**解决方案 (Solution)**:
```bash
# 检查 SSH 密钥
ls -la ~/.ssh/rap001_opclaw

# 测试 SSH 连接
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190

# 检查服务器防火墙
ssh root@118.25.0.190 'ufw status'
```

#### 2. 构建失败

**问题 (Problem)**:
```
[ERROR] 构建失败: dist/app.js not found
```

**解决方案 (Solution)**:
```bash
# 清理并重新构建
./scripts/ci/build.sh --clean --component backend

# 检查 Node.js 版本
node -v  # 应该 >= 18.0.0

# 重新安装依赖
cd platform/backend && rm -rf node_modules && pnpm install
```

#### 3. 健康检查失败

**问题 (Problem)**:
```
[ERROR] 后端健康检查失败
```

**解决方案 (Solution)**:
```bash
# 检查服务状态
ssh root@118.25.0.190 'cd /opt/opclaw && docker compose ps'

# 查看服务日志
ssh root@118.25.0.190 'cd /opt/opclaw && docker compose logs -f backend'

# 重启服务
ssh root@118.25.0.190 'cd /opt/opclaw && docker compose restart backend'
```

#### 4. 数据库连接失败

**问题 (Problem)**:
```
[ERROR] 数据库连接失败
```

**解决方案 (Solution)**:
```bash
# 检查数据库容器
ssh root@118.25.0.190 'docker ps | grep opclaw-postgres'

# 测试数据库连接
ssh root@118.25.0.190 'docker exec opclaw-postgres pg_isready -U opclaw'

# 查看数据库日志
ssh root@118.25.0.190 'docker logs opclaw-postgres'
```

#### 5. 磁盘空间不足

**问题 (Problem)**:
```
[WARNING] 磁盘空间不足 (使用率: 92%)
```

**解决方案 (Solution)**:
```bash
# 清理旧备份
ssh root@118.25.0.190 'find /opt/opclaw/backups -mtime +30 -delete'

# 清理 Docker 镜像
ssh root@118.25.0.190 'docker system prune -a'

# 清理日志文件
ssh root@118.25.0.190 'journalctl --vacuum-time=7d'
```

### 日志位置 (Log Locations)

| 组件 | 日志位置 |
|------|----------|
| **部署日志** | `deploy.log` |
| **备份日志** | `backup.log` |
| **恢复日志** | `restore.log` |
| **测试日志** | `test.log` |
| **构建日志** | `build.log` |
| **后端日志** | `ssh root@118.25.0.190 'docker logs opclaw-backend'` |
| **Nginx 日志** | `ssh root@118.25.0.190 'tail -f /var/log/nginx/opclaw-error.log'` |

---

## 集成 CI/CD (CI/CD Integration)

### GitHub Actions 示例

```yaml
name: Deploy to Production

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Run tests
        run: ./scripts/ci/test.sh --coverage

      - name: Build project
        run: ./scripts/ci/build.sh --component all

      - name: Deploy to production
        env:
          SSH_KEY: ${{ secrets.SSH_KEY }}
        run: ./scripts/deploy/deploy.sh --env production

      - name: Verify deployment
        run: ./scripts/deploy/verify.sh --env production
```

### GitLab CI 示例

```yaml
stages:
  - test
  - build
  - deploy

test:
  stage: test
  script:
    - ./scripts/ci/test.sh --coverage

build:
  stage: build
  script:
    - ./scripts/ci/build.sh --component all

deploy:
  stage: deploy
  script:
    - ./scripts/deploy/deploy.sh --env production
    - ./scripts/deploy/verify.sh --env production
  only:
    - main
```

---

## 附录 (Appendix)

### 环境变量 (Environment Variables)

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DEPLOY_USER` | SSH 用户 | root |
| `DEPLOY_HOST` | SSH 主机 | 118.25.0.190 |
| `DEPLOY_PATH` | 部署路径 | /opt/opclaw |
| `BACKUP_PATH` | 备份路径 | /opt/opclaw/backups |

### 退出码 (Exit Codes)

| 代码 | 含义 |
|------|------|
| 0 | 成功 |
| 1 | 错误/失败 |
| 2 | 警告 |

### 相关文档 (Related Documentation)

- [CLAUDE.md](../CLAUDE.md) - 项目总览
- [CLOUD_DEPLOYMENT.md](../CLOUD_DEPLOYMENT.md) - 云部署指南
- [CLOUD_TROUBLESHOOTING.md](../CLOUD_TROUBLESHOOTING.md) - 故障排除

### 支持 (Support)

如有问题，请查看故障排除部分或查看相关文档。

For issues, please refer to the troubleshooting section or consult related documentation.

---

**最后更新 (Last Updated)**: 2026-03-18

**版本 (Version)**: 1.0.0
