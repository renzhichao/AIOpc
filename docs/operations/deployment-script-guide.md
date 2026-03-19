# 部署脚本使用指南

> **Multi-Instance Single-Tenant Deployment Support**
> **文档版本**: 1.0.0
> **适用范围**: TASK-011, TASK-012
> **目标受众**: 运维团队、开发人员

---

## 目录

1. [概述](#概述)
2. [租户部署脚本](#租户部署脚本)
3. [本地部署脚本](#本地部署脚本)
4. [部署前检查脚本](#部署前检查脚本)
5. [部署后验证脚本](#部署后验证脚本)
6. [回滚脚本](#回滚脚本)
7. [使用场景](#使用场景)
8. [最佳实践](#最佳实践)
9. [故障排查](#故障排查)

---

## 概述

### 脚本架构

Phase 2 实现了完整的部署脚本体系，支持多种部署场景：

```
scripts/deploy/
├── deploy-tenant.sh          # 租户部署脚本 (主脚本)
├── deploy-local.sh           # 本地部署脚本
├── local-build.sh            # 本地构建脚本
├── local-transfer.sh         # 本地传输脚本
├── pre-deploy.sh             # 部署前检查
├── post-deploy.sh            # 部署后验证
└── rollback-tenant.sh        # 租户回滚脚本
```

### 脚本依赖

所有部署脚本依赖于以下库文件：

```bash
scripts/lib/
├── logging.sh      # 日志库
├── error.sh        # 错误处理库
├── config.sh       # 配置库
├── validation.sh   # 验证库
├── state.sh        # 状态管理库
├── ssh.sh          # SSH库
└── file.sh         # 文件操作库
```

### 环境要求

**必需工具**:
- Bash 5.0+ (`/opt/homebrew/bin/bash`)
- Docker 20.10+
- SSH客户端
- rsync (用于文件传输)
- yq (YAML处理器)

**可选工具**:
- git (用于版本信息)
- jq (用于JSON处理)

---

## 租户部署脚本

### 脚本信息

- **文件**: `scripts/deploy/deploy-tenant.sh`
- **大小**: 25KB
- **函数数量**: 35+
- **用途**: 参数化租户部署

### 基本用法

```bash
./scripts/deploy/deploy-tenant.sh <tenant_config_file> [options]
```

### 参数说明

#### 位置参数

| 参数 | 说明 | 示例 |
|------|------|------|
| `tenant_config_file` | 租户配置文件路径 | `config/tenants/test_tenant_alpha.yml` |

#### 选项参数

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `--dry-run` | 演练模式，不实际部署 | false |
| `--skip-health-check` | 跳过部署后健康检查 | false |
| `--skip-backup` | 跳过部署前备份 | false |
| `--force` | 强制部署，忽略并发检测 | false |
| `--component <name>` | 部署指定组件 | all |
| `--verbose` | 详细输出模式 | false |
| `--help` | 显示帮助信息 | - |

**组件选项**:
- `all`: 部署所有组件 (backend + frontend)
- `backend`: 仅部署后端
- `frontend`: 仅部署前端

### 使用示例

#### 1. 标准部署

```bash
# 部署所有组件
./scripts/deploy/deploy-tenant.sh config/tenants/test_tenant_alpha.yml

# 仅部署后端
./scripts/deploy/deploy-tenant.sh config/tenants/test_tenant_alpha.yml \
  --component backend
```

#### 2. 演练模式

```bash
# 查看部署计划，不实际执行
./scripts/deploy/deploy-tenant.sh config/tenants/test_tenant_alpha.yml \
  --dry-run
```

#### 3. 强制部署

```bash
# 忽略并发部署检测
./scripts/deploy/deploy-tenant.sh config/tenants/test_tenant_alpha.yml \
  --force
```

#### 4. 快速部署

```bash
# 跳过备份和健康检查
./scripts/deploy/deploy-tenant.sh config/tenants/test_tenant_alpha.yml \
  --skip-backup \
  --skip-health-check
```

#### 5. 详细输出

```bash
# 显示详细的部署过程
./scripts/deploy/deploy-tenant.sh config/tenants/test_tenant_alpha.yml \
  --verbose
```

### 部署流程

```
┌─────────────────────────────────────────┐
│         1. 解析配置文件                   │
│    - 加载YAML配置                         │
│    - 验证配置完整性                       │
│    - 检查Placeholder值                   │
└─────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────┐
│         2. 部署前检查                     │
│    - 并发部署检测                         │
│    - SSH连接测试                          │
│    - 磁盘空间检查                         │
│    - 安全检查                             │
└─────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────┐
│         3. 创建备份                       │
│    - 数据库备份                           │
│    - 配置文件备份                         │
│    - 代码备份                             │
└─────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────┐
│         4. 执行部署                       │
│    - 停止现有容器                         │
│    - 拉取新镜像                           │
│    - 启动新容器                           │
│    - 配置验证                             │
└─────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────┐
│         5. 部署后验证                     │
│    - 5层健康检查                          │
│    - OAuth流程测试                        │
│    - API健康检查                          │
└─────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────┐
│         6. 记录状态                       │
│    - 更新状态数据库                       │
│    - 记录部署历史                         │
│    - 记录配置快照                         │
└─────────────────────────────────────────┘
```

### 退出代码

| 代码 | 说明 |
|------|------|
| 0 | 部署成功 |
| 1 | 通用错误 |
| 2 | 配置文件错误 |
| 3 | 验证失败 |
| 4 | 并发部署检测 |
| 5 | 备份失败 |
| 6 | 部署失败 |
| 7 | 健康检查失败 |
| 8 | 回滚失败 |

### 输出示例

```
[2026-03-19 10:30:00] 🔧 开始部署: test_tenant_alpha
[2026-03-19 10:30:01] 📋 加载配置文件: config/tenants/test_tenant_alpha.yml
[2026-03-19 10:30:02] ✅ 配置验证通过
[2026-03-19 10:30:03] 🔍 检查并发部署...
[2026-03-19 10:30:04] ✅ 无并发部署
[2026-03-19 10:30:05] 💾 创建备份...
[2026-03-19 10:30:10] ✅ 备份完成: /tmp/backup_20260319_103010
[2026-03-19 10:30:11) 🚀 开始部署...
[2026-03-19 10:30:15] 📦 部署后端...
[2026-03-19 10:30:30] ✅ 后端部署完成
[2026-03-19 10:30:31] 🏥 执行健康检查...
[2026-03-19 10:30:35] ✅ Layer 1: HTTP健康检查通过
[2026-03-19 10:30:36] ✅ Layer 2: 数据库连接检查通过
[2026-03-19 10:30:37] ✅ Layer 3: 数据库查询检查通过
[2026-03-19 10:30:38] ✅ Layer 4: OAuth配置检查通过
[2026-03-19 10:30:39] ✅ Layer 5: Redis连接检查通过
[2026-03-19 10:30:40] ✅ 部署成功完成
[2026-03-19 10:30:41] 📊 记录部署状态到数据库
[2026-03-19 10:30:42] 🎉 部署完成！总耗时: 42秒
```

---

## 本地部署脚本

### 脚本信息

- **文件**: `scripts/deploy/deploy-local.sh`
- **大小**: 987行
- **函数数量**: 25+
- **用途**: 本地部署，与GitHub Actions功能对等

### 基本用法

```bash
./scripts/deploy/deploy-local.sh <tenant_config_file> [options]
```

### 参数说明

#### 选项参数

| 选项 | 说明 | 默认值 |
|------|------|------|
| `--build-only` | 仅构建镜像，不部署 | false |
| `--transfer-only` | 仅传输文件，不构建 | false |
| `--remote-build` | 在远程服务器构建 | false |
| `--dry-run` | 演练模式 | false |
| `--skip-health-check` | 跳过健康检查 | false |
| `--skip-backup` | 跳过备份 | false |
| `--force` | 强制部署 | false |
| `--component <name>` | 部署指定组件 | all |
| `--verbose` | 详细输出 | false |
| `--help` | 显示帮助 | - |

### 使用示例

#### 1. 完整本地部署

```bash
# 本地构建 + 传输 + 部署
./scripts/deploy/deploy-local.sh config/tenants/test_tenant_alpha.yml
```

#### 2. 仅构建镜像

```bash
# 只构建Docker镜像，不部署
./scripts/deploy/deploy-local.sh config/tenants/test_tenant_alpha.yml \
  --build-only
```

#### 3. 仅传输文件

```bash
# 只传输文件到远程服务器
./scripts/deploy/deploy-local.sh config/tenants/test_tenant_alpha.yml \
  --transfer-only
```

#### 4. 远程构建

```bash
# 在远程服务器上构建镜像
./scripts/deploy/deploy-local.sh config/tenants/test_tenant_alpha.yml \
  --remote-build
```

#### 5. 离线部署

```bash
# 1. 本地构建镜像
./scripts/deploy/deploy-local.sh config/tenants/test_tenant_alpha.yml \
  --build-only

# 2. 传输镜像tar包到远程服务器
./scripts/deploy/local-transfer.sh config/tenants/test_tenant_alpha.yml \
  --transfer-images

# 3. 在远程服务器加载镜像并部署
./scripts/deploy/deploy-local.sh config/tenants/test_tenant_alpha.yml \
  --load-images
```

### 部署流程

```
┌─────────────────────────────────────────┐
│         1. 解析配置和参数                 │
│    - 加载YAML配置                         │
│    - 确定部署模式                         │
└─────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────┐
│         2. 本地构建 (可选)                │
│    - 构建Docker镜像                       │
│    - 镜像标签管理                         │
│    - 构建缓存优化                         │
└─────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────┐
│         3. 文件传输                      │
│    - 传输配置文件                         │
│    - 传输Docker镜像                       │
│    - rsync增量传输                       │
└─────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────┐
│         4. 远程部署                       │
│    - SSH连接远程服务器                    │
│    - 执行部署脚本                         │
│    - 健康检查验证                         │
└─────────────────────────────────────────┘
```

### 与GitHub Actions的差异

| 特性 | GitHub Actions | 本地部署 |
|------|---------------|---------|
| 触发方式 | 手动触发 | 命令行 |
| 构建位置 | GitHub Runner | 本地或远程 |
| 网络要求 | 需要GitHub | 无需GitHub |
| 适用场景 | 正式部署 | 开发测试、应急 |
| 部署时间 | ~15分钟 | ~15分钟 |
| 可视化 | 有UI | 命令行输出 |

---

## 部署前检查脚本

### 脚本信息

- **文件**: `scripts/deploy/pre-deploy.sh`
- **用途**: 部署前的环境和配置检查

### 检查项目

#### 1. 配置验证

```bash
# 检查配置文件是否存在
check_config_exists() {
    local config_file=$1
    if [[ ! -f "$config_file" ]]; then
        log_error "配置文件不存在: $config_file"
        return 1
    fi
}

# 检查配置文件语法
check_config_syntax() {
    local config_file=$1
    if ! yq eval 'true' "$config_file" >/dev/null 2>&1; then
        log_error "配置文件语法错误: $config_file"
        return 1
    fi
}

# 检查Placeholder值
check_placeholders() {
    local config_file=$1
    local placeholders=$(grep -E '(cli_xxxxxxxxxxxxx|CHANGE_THIS|your_)' "$config_file")
    if [[ -n "$placeholders" ]]; then
        log_error "配置文件包含Placeholder值: $config_file"
        echo "$placeholders"
        return 1
    fi
}
```

#### 2. 环境检查

```bash
# 检查Docker是否可用
check_docker() {
    if ! command -v docker >/dev/null 2>&1; then
        log_error "Docker未安装"
        return 1
    fi

    if ! docker info >/dev/null 2>&1; then
        log_error "Docker守护进程未运行"
        return 1
    fi
}

# 检查磁盘空间
check_disk_space() {
    local required_space_gb=5
    local available_space_gb=$(df / | awk 'NR==2 {print int($4/1024/1024)}')

    if [[ $available_space_gb -lt $required_space_gb ]]; then
        log_error "磁盘空间不足: 可用 ${available_space_gb}GB, 需要 ${required_space_gb}GB"
        return 1
    fi
}
```

#### 3. 网络检查

```bash
# 检查SSH连接
check_ssh_connection() {
    local server=$1
    local ssh_key=$2

    if ! ssh -i "$ssh_key" -o ConnectTimeout=10 -o StrictHostKeyChecking=no \
        "$server" "echo 'Connection successful'" >/dev/null 2>&1; then
        log_error "SSH连接失败: $server"
        return 1
    fi
}

# 检查网络连通性
check_network() {
    local host=$1
    local port=$2

    if ! nc -z -w5 "$host" "$port" 2>/dev/null; then
        log_error "网络不通: $host:$port"
        return 1
    fi
}
```

### 使用示例

```bash
# 运行所有检查
./scripts/deploy/pre-deploy.sh config/tenants/test_tenant_alpha.yml

# 检查特定项目
./scripts/deploy/pre-deploy.sh --check config
./scripts/deploy/pre-deploy.sh --check environment
./scripts/deploy/pre-deploy.sh --check network
```

---

## 部署后验证脚本

### 脚本信息

- **文件**: `scripts/deploy/post-deploy.sh`
- **用途**: 部署后的健康检查和验证

### 验证项目

#### 1. 5层健康检查

```bash
# Layer 1: HTTP健康检查
check_http_health() {
    local url=$1
    local response=$(curl -s -o /dev/null -w "%{http_code}" "$url")

    if [[ $response -eq 200 ]]; then
        log_success "Layer 1: HTTP健康检查通过"
        return 0
    else
        log_error "Layer 1: HTTP健康检查失败 (HTTP $response)"
        return 1
    fi
}

# Layer 2: 数据库连接检查
check_db_connection() {
    local db_host=$1
    local db_port=$2

    if docker exec opclaw-postgres pg_isready -h "$db_host" -p "$db_port" >/dev/null 2>&1; then
        log_success "Layer 2: 数据库连接检查通过"
        return 0
    else
        log_error "Layer 2: 数据库连接检查失败"
        return 1
    fi
}

# Layer 3: 数据库查询检查
check_db_query() {
    if docker exec opclaw-postgres psql -U opclaw -d opclaw -c "SELECT 1" >/dev/null 2>&1; then
        log_success "Layer 3: 数据库查询检查通过"
        return 0
    else
        log_error "Layer 3: 数据库查询检查失败"
        return 1
    fi
}

# Layer 4: OAuth配置检查
check_oauth_config() {
    local app_id=$1
    if [[ "$app_id" =~ ^cli_[a-z0-9]{15}$ ]]; then
        log_success "Layer 4: OAuth配置检查通过"
        return 0
    else
        log_error "Layer 4: OAuth配置检查失败 (App ID格式错误)"
        return 1
    fi
}

# Layer 5: Redis连接检查
check_redis_connection() {
    if docker exec opclaw-redis redis-cli -a "$REDIS_PASSWORD" PING >/dev/null 2>&1; then
        log_success "Layer 5: Redis连接检查通过"
        return 0
    else
        log_error "Layer 5: Redis连接检查失败"
        return 1
    fi
}
```

#### 2. 功能测试

```bash
# OAuth流程测试
test_oauth_flow() {
    local login_url=$1
    local response=$(curl -s -o /dev/null -w "%{http_code}" "$login_url")

    if [[ $response -eq 200 ]]; then
        log_success "OAuth流程测试通过"
        return 0
    else
        log_error "OAuth流程测试失败 (HTTP $response)"
        return 1
    fi
}

# API健康检查
test_api_health() {
    local api_url=$1
    local response=$(curl -s "$api_url/health")

    if echo "$response" | jq -e '.status == "healthy"' >/dev/null; then
        log_success "API健康检查通过"
        return 0
    else
        log_error "API健康检查失败"
        return 1
    fi
}
```

### 使用示例

```bash
# 运行所有验证
./scripts/deploy/post-deploy.sh config/tenants/test_tenant_alpha.yml

# 验证特定项目
./scripts/deploy/post-deploy.sh --check health
./scripts/deploy/post-deploy.sh --check oauth
./scripts/deploy/post-deploy.sh --check api
```

---

## 回滚脚本

### 脚本信息

- **文件**: `scripts/deploy/rollback-tenant.sh`
- **用途**: 部署失败时回滚到之前的状态

### 基本用法

```bash
./scripts/deploy/rollback-tenant.sh <tenant_id> [options]
```

### 参数说明

| 选项 | 说明 | 默认值 |
|------|------|------|
| `--backup-path <path>` | 指定备份路径 | 自动查找最新备份 |
| `--dry-run` | 演练模式 | false |
| `--skip-health-check` | 跳过回滚后健康检查 | false |
| `--force` | 强制回滚 | false |
| `--verbose` | 详细输出 | false |

### 使用示例

#### 1. 标准回滚

```bash
# 回滚到最新备份
./scripts/deploy/rollback-tenant.sh test_tenant_alpha
```

#### 2. 指定备份回滚

```bash
# 回滚到指定备份
./scripts/deploy/rollback-tenant.sh test_tenant_alpha \
  --backup-path /tmp/backup_20260319_103010
```

#### 3. 演练模式

```bash
# 查看回滚计划
./scripts/deploy/rollback-tenant.sh test_tenant_alpha \
  --dry-run
```

### 回滚流程

```
┌─────────────────────────────────────────┐
│         1. 查找备份                       │
│    - 查找最新备份                         │
│    - 验证备份完整性                       │
└─────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────┐
│         2. 停止服务                       │
│    - 停止所有容器                         │
│    - 清理失败部署                         │
└─────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────┐
│         3. 恢复备份                       │
│    - 恢复数据库                           │
│    - 恢复配置文件                         │
│    - 恢复代码                             │
└─────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────┐
│         4. 重启服务                       │
│    - 启动所有容器                         │
│    - 验证服务状态                         │
└─────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────┐
│         5. 健康检查                       │
│    - 5层健康检查                          │
│    - 功能验证                             │
└─────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────┐
│         6. 记录状态                       │
│    - 记录回滚操作                         │
│    - 更新部署状态                         │
└─────────────────────────────────────────┘
```

---

## 使用场景

### 场景1: 日常部署

**场景**: 需要部署新版本到生产环境

**步骤**:
1. 更新租户配置文件
2. 运行部署脚本
3. 等待健康检查
4. 验证功能正常

**命令**:
```bash
./scripts/deploy/deploy-tenant.sh config/tenants/test_tenant_alpha.yml
```

### 场景2: 紧急修复

**场景**: 需要快速部署紧急修复

**步骤**:
1. 修改代码并提交
2. 使用本地部署脚本（更快）
3. 跳过备份以节省时间

**命令**:
```bash
./scripts/deploy/deploy-local.sh config/tenants/test_tenant_alpha.yml \
  --skip-backup
```

### 场景3: 离线部署

**场景**: 网络受限环境，需要离线部署

**步骤**:
1. 本地构建镜像
2. 打包镜像tar包
3. 传输到目标服务器
4. 加载镜像并部署

**命令**:
```bash
# 1. 本地构建
./scripts/deploy/deploy-local.sh config/tenants/test_tenant_alpha.yml \
  --build-only

# 2. 传输镜像
./scripts/deploy/local-transfer.sh config/tenants/test_tenant_alpha.yml

# 3. 远程部署
./scripts/deploy/deploy-local.sh config/tenants/test_tenant_alpha.yml \
  --remote-build
```

### 场景4: 批量部署

**场景**: 需要部署多个租户

**步骤**:
1. 使用GitHub Actions批量部署
2. 或使用脚本循环部署

**命令**:
```bash
# 使用GitHub Actions
# GitHub UI: Actions → Deploy All Tenants → Run workflow

# 或使用脚本循环
for config in config/tenants/*.yml; do
    ./scripts/deploy/deploy-tenant.sh "$config"
done
```

### 场景5: 部署失败回滚

**场景**: 部署失败，需要回滚

**步骤**:
1. 确认部署失败
2. 运行回滚脚本
3. 验证回滚成功
4. 分析失败原因

**命令**:
```bash
./scripts/deploy/rollback-tenant.sh test_tenant_alpha
```

---

## 最佳实践

### 1. 部署前准备

**✅ 推荐做法**:

```bash
# 1. 验证配置文件
./scripts/config/validate-config.sh config/tenants/test_tenant_alpha.yml

# 2. 检查环境
./scripts/deploy/pre-deploy.sh --check environment

# 3. 演练模式测试
./scripts/deploy/deploy-tenant.sh config/tenants/test_tenant_alpha.yml \
  --dry-run
```

**❌ 避免做法**:
- 直接部署而不验证配置
- 跳过备份（除非紧急情况）
- 在生产环境先测试

### 2. 部署执行

**✅ 推荐做法**:

```bash
# 1. 标准部署流程
./scripts/deploy/deploy-tenant.sh config/tenants/test_tenant_alpha.yml \
  --verbose

# 2. 监控部署过程
tail -f /var/log/opclaw/deployment.log

# 3. 部署后验证
./scripts/deploy/post-deploy.sh config/tenants/test_tenant_alpha.yml
```

**❌ 避免做法**:
- 并发部署同一租户
- 部署时离开终端
- 忽略警告信息

### 3. 回滚策略

**✅ 推荐做法**:

```bash
# 1. 演练回滚流程
./scripts/deploy/rollback-tenant.sh test_tenant_alpha \
  --dry-run

# 2. 验证备份可用性
./scripts/backup/verify-backup.sh --path /tmp/backup_latest

# 3. 回滚后完整检查
./scripts/monitoring/enhanced-health-check.sh
```

**❌ 避免做法**:
- 没有备份就部署
- 回滚后不验证
- 删除旧备份

### 4. 监控和日志

**✅ 推荐做法**:

```bash
# 1. 实时监控日志
tail -f /var/log/opclaw/deployment.log
tail -f /var/log/opclaw/health-check.log

# 2. 查看部署历史
psql -h localhost -U postgres -d deployment_state \
  -c "SELECT * FROM deployments WHERE tenant_id = 'test_tenant_alpha' ORDER BY deployment_time DESC LIMIT 10;"

# 3. 配置漂移检测
./scripts/monitoring/detect-config-drift.sh --tenant test_tenant_alpha
```

### 5. 安全实践

**✅ 推荐做法**:

```bash
# 1. 部署前安全检查
./scripts/security/security-check-suite.sh

# 2. 验证配置权限
ls -la config/tenants/test_tenant_alpha.yml
# 应该是 600

# 3. 检查SSH密钥
ls -la ~/.ssh/rap001_opclaw
# 应该是 600
```

---

## 故障排查

### 问题1: 配置文件加载失败

**症状**:
```
Error: Failed to load configuration file
YAML parse error
```

**诊断步骤**:
```bash
# 1. 验证YAML语法
yq eval 'true' config/tenants/test_tenant_alpha.yml

# 2. 检查文件权限
ls -la config/tenants/test_tenant_alpha.yml

# 3. 检查文件编码
file -I config/tenants/test_tenant_alpha.yml
```

**解决方案**:
```bash
# 修复YAML语法错误
# 常见问题: 缩进错误、特殊字符未转义
# 使用在线工具验证: https://www.yamllint.com/

# 修复文件权限
chmod 600 config/tenants/test_tenant_alpha.yml

# 转换为UTF-8编码
iconv -f UTF-8 -t UTF-8 config/tenants/test_tenant_alpha.yml > fixed.yml
mv fixed.yml config/tenants/test_tenant_alpha.yml
```

### 问题2: 并发部署检测

**症状**:
```
Error: Concurrent deployment detected
Deployment already in progress for tenant: test_tenant_alpha
```

**诊断步骤**:
```bash
# 1. 检查状态数据库
psql -h localhost -U postgres -d deployment_state \
  -c "SELECT * FROM deployments WHERE tenant_id = 'test_tenant_alpha' AND status = 'in_progress';"

# 2. 检查进程
ps aux | grep deploy-tenant
```

**解决方案**:
```bash
# 方案1: 等待当前部署完成
# 方案2: 如果是误报，使用--force强制部署
./scripts/deploy/deploy-tenant.sh config/tenants/test_tenant_alpha.yml \
  --force

# 方案3: 清理错误状态
psql -h localhost -U postgres -d deployment_state \
  -c "UPDATE deployments SET status = 'failed' WHERE tenant_id = 'test_tenant_alpha' AND status = 'in_progress';"
```

### 问题3: SSH连接失败

**症状**:
```
Error: SSH connection failed
Connection timeout
Permission denied (publickey)
```

**诊断步骤**:
```bash
# 1. 测试SSH连接
ssh -i ~/.ssh/rap001_opclaw -o ConnectTimeout=10 -o StrictHostKeyChecking=no \
  root@118.25.0.190 "echo 'Connection successful'"

# 2. 检查SSH密钥
ls -la ~/.ssh/rap001_opclaw*

# 3. 检查服务器SSH配置
# 在服务器上运行:
grep "PasswordAuthentication" /etc/ssh/sshd_config
grep "PubkeyAuthentication" /etc/ssh/sshd_config
```

**解决方案**:
```bash
# 方案1: 修复密钥权限
chmod 600 ~/.ssh/rap001_opclaw
chmod 644 ~/.ssh/rap001_opclaw.pub

# 方案2: 测试密钥连接
ssh -i ~/.ssh/rap001_opclaw -o StrictHostKeyChecking=no root@118.25.0.190

# 方案3: 部署密钥到服务器
ssh-copy-id -i ~/.ssh/rap001_opclaw.pub root@118.25.0.190
```

### 问题4: 健康检查失败

**症状**:
```
Error: Health check failed
Layer 3: Database query check failed
```

**诊断步骤**:
```bash
# 1. 检查容器状态
docker ps | grep opclaw

# 2. 检查容器日志
docker logs opclaw-backend --tail 100
docker logs opclaw-postgres --tail 100

# 3. 手动运行健康检查
./scripts/monitoring/enhanced-health-check.sh --verbose
```

**解决方案**:
```bash
# 方案1: 重启容器
docker restart opclaw-backend opclaw-postgres

# 方案2: 检查数据库连接
docker exec opclaw-postgres psql -U opclaw -d opclaw -c "SELECT 1"

# 方案3: 检查配置
docker exec opclaw-backend env | grep -E "DATABASE_URL|DB_"
```

### 问题5: 镜像构建失败

**症状**:
```
Error: Docker image build failed
Failed to build backend image
```

**诊断步骤**:
```bash
# 1. 检查Dockerfile
cat platform/backend/Dockerfile

# 2. 检查构建日志
docker logs opclaw-backend-build

# 3. 检查磁盘空间
df -h /var/lib/docker
```

**解决方案**:
```bash
# 方案1: 清理Docker缓存
docker system prune -af

# 方案2: 重新构建
docker-compose build --no-cache backend

# 方案3: 检查Dockerfile语法
docker build --check -f platform/backend/Dockerfile platform/backend/
```

---

## 附录

### A. 快速参考

```bash
# 租户部署
./scripts/deploy/deploy-tenant.sh <config_file> [options]

# 本地部署
./scripts/deploy/deploy-local.sh <config_file> [options]

# 回滚
./scripts/deploy/rollback-tenant.sh <tenant_id> [options]

# 部署前检查
./scripts/deploy/pre-deploy.sh <config_file>

# 部署后验证
./scripts/deploy/post-deploy.sh <config_file>
```

### B. 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DEPLOYMENT_VERSION` | 部署版本 | v1.0.0 |
| `GIT_COMMIT_SHA` | Git提交SHA | 自动检测 |
| `GIT_BRANCH` | Git分支 | 自动检测 |
| `VERBOSE` | 详细输出 | false |
| `DRY_RUN` | 演练模式 | false |

### C. 配置文件示例

```yaml
# config/tenants/test_tenant_alpha.yml
tenant:
  id: test_tenant_alpha
  name: Test Tenant Alpha
  environment: production

server:
  host: 118.25.0.190
  ssh_key: ~/.ssh/rap001_opclaw
  user: root

feishu:
  app_id: cli_a93ce5614ce11bd6
  app_secret: ${FEISHU_APP_SECRET}

database:
  host: localhost
  port: 5432
  name: opclaw
  user: opclaw
  password: ${DB_PASSWORD}

redis:
  host: localhost
  port: 6379
  password: ${REDIS_PASSWORD}

jwt:
  secret: ${JWT_SECRET}
  expiration: 7d
```

---

**文档版本**: 1.0.0
**最后更新**: 2026-03-19
**维护者**: AIOpc DevOps Team
