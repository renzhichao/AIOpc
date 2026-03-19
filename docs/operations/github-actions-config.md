# GitHub Actions 配置指南 (Phase 2 扩展版)

> **Multi-Instance Single-Tenant Deployment Support**
> **文档版本**: 1.0.0
> **适用范围**: TASK-013 (GitHub Actions 工作流集成)
> **目标受众**: 运维团队、开发人员

---

## 目录

1. [概述](#概述)
2. [工作流文件详解](#工作流文件详解)
3. [配置参数说明](#配置参数说明)
4. [租户管理](#租户管理)
5. [部署策略](#部署策略)
6. [监控和日志](#监控和日志)
7. [故障排查](#故障排查)
8. [最佳实践](#最佳实践)

---

## 概述

### Phase 2 新增功能

Phase 2 在原有 GitHub Actions 基础上新增了以下功能：

- ✅ **租户选择器** - 动态租户列表，自动填充
- ✅ **批量部署** - 支持多租户串行/并行部署
- ✅ **集成测试** - 自动化端到端测试
- ✅ **部署状态反馈** - 实时状态更新和详细摘要
- ✅ **取消支持** - 支持中途取消部署

### 工作流文件

| 文件 | 大小 | 用途 | 作业数 |
|------|------|------|--------|
| `deploy-tenant.yml` | 36KB | 单租户部署 | 7 |
| `deploy-all-tenants.yml` | 15KB | 批量部署 | 5 |
| `integration-test.yml` | 23KB | 集成测试 | 4 |

### 架构图

```
GitHub Actions 工作流架构
├── 租户部署 (deploy-tenant.yml)
│   ├── 配置验证作业
│   ├── 安全检查作业
│   ├── 镜像构建作业
│   ├── 部署执行作业
│   ├── 健康检查作业
│   ├── 集成测试作业
│   └── 清理作业
│
├── 批量部署 (deploy-all-tenants.yml)
│   ├── 租户发现作业
│   ├── 策略选择作业
│   ├── 部署编排作业
│   ├── 监控作业
│   └── 摘要作业
│
└── 集成测试 (integration-test.yml)
    ├── 健康检查测试
    ├── OAuth 流程测试
    ├── API 功能测试
    └── 性能测试
```

---

## 工作流文件详解

### 1. 租户部署工作流

**文件**: `.github/workflows/deploy-tenant.yml`

#### 1.1 触发配置

```yaml
on:
  workflow_dispatch:
    inputs:
      tenant:
        description: '租户 (Tenant)'
        required: true
        type: choice
        options:
          - test_tenant_alpha
          # 更多租户...

      component:
        description: '部署组件 (Component to deploy)'
        required: true
        default: 'all'
        type: choice
        options:
          - all
          - backend
          - frontend

      skip_tests:
        description: '跳过测试 (Skip post-deployment tests)'
        required: false
        default: false
        type: boolean

      dry_run:
        description: '演练模式 (Dry run)'
        required: false
        default: false
        type: boolean

      force_deploy:
        description: '强制部署 (Force deployment)'
        required: false
        default: false
        type: boolean

      skip_backup:
        description: '跳过备份 (Skip backup)'
        required: false
        default: false
        type: boolean
```

#### 1.2 环境变量

```yaml
env:
  DEPLOYMENT_VERSION: v1.0.0
  SCRIPT_DIR: scripts/deploy
  LIB_DIR: scripts/lib
  LOG_LEVEL: info
```

#### 1.3 作业详解

##### 作业1: 配置验证

```yaml
validate-config:
  name: 🔍 配置验证 (Configuration Validation)
  runs-on: ubuntu-latest
  outputs:
    tenant_id: ${{ steps.extract-config.outputs.tenant_id }}
    tenant_name: ${{ steps.extract-config.outputs.tenant_name }}
    environment: ${{ steps.extract-config.outputs.environment }}
    validation_passed: ${{ steps.validate.outputs.validation_passed }}

  steps:
    - name: 检出代码
      uses: actions/checkout@v4

    - name: 安装依赖
      run: |
        sudo apt-get update
        sudo apt-get install -y yq

    - name: 提取配置信息
      id: extract-config
      run: |
        CONFIG_FILE="config/tenants/${{ github.event.inputs.tenant }}.yml"
        TENANT_ID=$(yq '.tenant.id' "$CONFIG_FILE")
        TENANT_NAME=$(yq '.tenant.name' "$CONFIG_FILE")
        ENVIRONMENT=$(yq '.tenant.environment' "$CONFIG_FILE")

        echo "tenant_id=$TENANT_ID" >> $GITHUB_OUTPUT
        echo "tenant_name=$TENANT_NAME" >> $GITHUB_OUTPUT
        echo "environment=$ENVIRONMENT" >> $GITHUB_OUTPUT

    - name: 验证配置
      id: validate
      run: |
        ./scripts/config/validate-config.sh \
          "config/tenants/${{ github.event.inputs.tenant }}.yml"
        echo "validation_passed=true" >> $GITHUB_OUTPUT
```

##### 作业2: 安全检查

```yaml
security-checks:
  name: 🔒 安全检查 (Security Checks)
  runs-on: ubuntu-latest
  needs: validate-config

  steps:
    - name: 检出代码
      uses: actions/checkout@v4

    - name: 运行安全检查套件
      run: |
        ./scripts/security/security-check-suite.sh \
          "config/tenants/${{ github.event.inputs.tenant }}.yml"

    - name: 检查配置安全
      run: |
        ./scripts/security/check-config-security.sh \
          "config/tenants/${{ github.event.inputs.tenant }}.yml"

    - name: 检查密钥强度
      run: |
        ./scripts/security/check-secret-strength.sh \
          "config/tenants/${{ github.event.inputs.tenant }}.yml"

    - name: 检查文件权限
      run: |
        ./scripts/security/check-file-permissions.sh \
          "config/tenants/${{ github.event.inputs.tenant }}.yml"
```

##### 作业3: 镜像构建

```yaml
build-images:
  name: 🔨 镜像构建 (Build Images)
  runs-on: ubuntu-latest
  needs: [validate-config, security-checks]

  strategy:
    matrix:
      component: ['backend', 'frontend']

  steps:
    - name: 检出代码
      uses: actions/checkout@v4

    - name: 设置 Docker Buildx
      uses: docker/setup-buildx-action@v3

    - name: 登录镜像仓库
      uses: docker/login-action@v3
      with:
        registry: ${{ secrets.REGISTRY_URL }}
        username: ${{ secrets.REGISTRY_USERNAME }}
        password: ${{ secrets.REGISTRY_PASSWORD }}

    - name: 构建并推送镜像
      uses: docker/build-push-action@v5
      with:
        context: ./platform/${{ matrix.component }}
        push: true
        tags: |
          ${{ secrets.REGISTRY_URL }}/opclaw-${{ matrix.component }}:${{ github.sha }}
          ${{ secrets.REGISTRY_URL }}/opclaw-${{ matrix.component }}:latest
        cache-from: type=registry,ref=${{ secrets.REGISTRY_URL }}/opclaw-${{ matrix.component }}:buildcache
        cache-to: type=registry,ref=${{ secrets.REGISTRY_URL }}/opclaw-${{ matrix.component }}:buildcache,mode=max
```

##### 作业4: 部署执行

```yaml
deploy:
  name: 🚀 部署执行 (Deploy)
  runs-on: ubuntu-latest
  needs: [validate-config, build-images]
  outputs:
    deployment_status: ${{ steps.deploy.outputs.status }}
    deployment_id: ${{ steps.deploy.outputs.deployment_id }}

  steps:
    - name: 检出代码
      uses: actions/checkout@v4

    - name: 配置 SSH
      run: |
        mkdir -p ~/.ssh
        echo "${{ secrets.SSH_PRIVATE_KEY }}" > ~/.ssh/deploy_key
        chmod 600 ~/.ssh/deploy_key
        ssh-keyscan -H ${{ needs.validate-config.outputs.server_host }} >> ~/.ssh/known_hosts

    - name: 执行部署
      id: deploy
      run: |
        ./scripts/deploy/deploy-tenant.sh \
          "config/tenants/${{ github.event.inputs.tenant }}.yml" \
          --component ${{ github.event.inputs.component }} \
          ${{ github.event.inputs.dry_run == 'true' && '--dry-run' || '' }} \
          ${{ github.event.inputs.skip_backup == 'true' && '--skip-backup' || '' }} \
          ${{ github.event.inputs.force_deploy == 'true' && '--force' || '' }} \
          --verbose
        echo "status=success" >> $GITHUB_OUTPUT
        echo "deployment_id=$(date +%s)" >> $GITHUB_OUTPUT

    - name: 取消处理
      if: cancelled()
      run: |
        echo "部署被取消，执行清理..."
        ./scripts/deploy/rollback-tenant.sh \
          "${{ needs.validate-config.outputs.tenant_id }}"
```

##### 作业5: 健康检查

```yaml
health-check:
  name: 🏥 健康检查 (Health Check)
  runs-on: ubuntu-latest
  needs: [validate-config, deploy]

  steps:
    - name: 检出代码
      uses: actions/checkout@v4

    - name: 配置 SSH
      run: |
        mkdir -p ~/.ssh
        echo "${{ secrets.SSH_PRIVATE_KEY }}" > ~/.ssh/deploy_key
        chmod 600 ~/.ssh/deploy_key

    - name: 运行健康检查
      run: |
        ./scripts/monitoring/enhanced-health-check.sh \
          --tenant "${{ needs.validate-config.outputs.tenant_id }}"

    - name: 检查结果
      run: |
        if [ $? -eq 0 ]; then
          echo "✅ 健康检查通过"
        else
          echo "❌ 健康检查失败"
          exit 1
        fi
```

##### 作业6: 集成测试

```yaml
integration-tests:
  name: 🧪 集成测试 (Integration Tests)
  runs-on: ubuntu-latest
  needs: [validate-config, health-check]
  if: github.event.inputs.skip_tests != 'true'

  steps:
    - name: 检出代码
      uses: actions/checkout@v4

    - name: OAuth 流程测试
      run: |
        ./scripts/tests/test-oauth-flow.sh \
          "${{ needs.validate-config.outputs.tenant_id }}"

    - name: API 健康测试
      run: |
        curl -f ${{ needs.validate-config.outputs.api_url }}/health || exit 1

    - name: 性能测试
      run: |
        ./scripts/tests/run-performance-test.sh \
          "${{ needs.validate-config.outputs.tenant_id }}"
```

##### 作业7: 清理

```yaml
cleanup:
  name: 🧹 清理 (Cleanup)
  runs-on: ubuntu-latest
  needs: [validate-config, deploy, health-check, integration-tests]
  if: always()

  steps:
    - name: 检出代码
      uses: actions/checkout@v4

    - name: 生成部署摘要
      run: |
        cat >> $GITHUB_STEP_SUMMARY << EOF
        ## 部署摘要

        - **租户**: ${{ needs.validate-config.outputs.tenant_name }}
        - **环境**: ${{ needs.validate-config.outputs.environment }}
        - **组件**: ${{ github.event.inputs.component }}
        - **版本**: ${{ github.sha }}
        - **状态**: ${{ needs.deploy.outputs.deployment_status }}
        EOF

    - name: 清理临时文件
      run: |
        rm -f ~/.ssh/deploy_key
        rm -rf /tmp/deploy_*
```

### 2. 批量部署工作流

**文件**: `.github/workflows/deploy-all-tenants.yml`

#### 2.1 触发配置

```yaml
on:
  workflow_dispatch:
    inputs:
      deployment_mode:
        description: '部署模式 (Deployment Mode)'
        required: true
        default: 'parallel'
        type: choice
        options:
          - parallel    # 并行部署
          - serial      # 串行部署
          - batch       # 批量部署

      batch_size:
        description: '批量大小 (Batch Size - 仅批量模式)'
        required: false
        default: '3'
        type: choice
        options:
          - '1'
          - '2'
          - '3'
          - '5'

      skip_tests:
        description: '跳过测试 (Skip tests)'
        required: false
        default: false
        type: boolean
```

#### 2.2 作业详解

##### 作业1: 租户发现

```yaml
discover-tenants:
  name: 🔍 租户发现 (Discover Tenants)
  runs-on: ubuntu-latest
  outputs:
    tenant_list: ${{ steps.discover.outputs.tenant_list }}
    tenant_count: ${{ steps.discover.outputs.tenant_count }}

  steps:
    - name: 检出代码
      uses: actions/checkout@v4

    - name: 发现租户
      id: discover
      run: |
        TENANTS=($(find config/tenants -name "*.yml" -exec basename {} .yml \;))
        TENANT_JSON=$(printf '%s\n' "${TENANTS[@]}" | jq -R . | jq -s -c '{tenants: .}')

        echo "tenant_list=$TENANT_JSON" >> $GITHUB_OUTPUT
        echo "tenant_count=${#TENANTS[@]}" >> $GITHUB_OUTPUT

        echo "发现 ${#TENANTS[@]} 个租户:"
        printf '  - %s\n' "${TENANTS[@]}"
```

##### 作业2: 部署编排

```yaml
orchestrate-deployment:
  name: 🎯 部署编排 (Orchestrate Deployment)
  runs-on: ubuntu-latest
  needs: discover-tenants
  strategy:
    fail-fast: false
    matrix:
      tenant: ${{ fromJson(needs.discover-tenants.outputs.tenant_list).tenants }}
    max-parallel: ${{ github.event.inputs.deployment_mode == 'parallel' && 5 || 1 }}

  steps:
    - name: 检出代码
      uses: actions/checkout@v4

    - name: 部署租户
      run: |
        ./scripts/deploy/deploy-tenant.sh \
          "config/tenants/${{ matrix.tenant }}.yml" \
          --skip-backup \
          --verbose
```

### 3. 集成测试工作流

**文件**: `.github/workflows/integration-test.yml`

#### 3.1 测试作业

```yaml
test-health-checks:
  name: 🏥 健康检查测试 (Health Check Tests)
  runs-on: ubuntu-latest

  steps:
    - name: 检出代码
      uses: actions/checkout@v4

    - name: Layer 1: HTTP 检查
      run: |
        ./scripts/monitoring/health-check-layer1.sh

    - name: Layer 2: 数据库连接检查
      run: |
        ./scripts/monitoring/health-check-layer2.sh

    - name: Layer 3: 数据库查询检查
      run: |
        ./scripts/monitoring/health-check-layer3.sh

    - name: Layer 4: OAuth 配置检查
      run: |
        ./scripts/monitoring/health-check-layer4.sh

    - name: Layer 5: Redis 连接检查
      run: |
        ./scripts/monitoring/health-check-layer5.sh

test-oauth-flow:
  name: 🔐 OAuth 流程测试 (OAuth Flow Tests)
  runs-on: ubuntu-latest

  steps:
    - name: 检出代码
      uses: actions/checkout@v4

    - name: 运行 OAuth 测试
      run: |
        ./scripts/tests/test-oauth-flow.sh

    - name: 验证登录流程
      run: |
        ./scripts/tests/verify-login-flow.sh

test-api-functionality:
  name: 🔌 API 功能测试 (API Functionality Tests)
  runs-on: ubuntu-latest

  steps:
    - name: 检出代码
      uses: actions/checkout@v4

    - name: 测试 API 端点
      run: |
        ./scripts/tests/test-api-endpoints.sh

    - name: 测试数据持久化
      run: |
        ./scripts/tests/test-data-persistence.sh

test-performance:
  name: ⚡ 性能测试 (Performance Tests)
  runs-on: ubuntu-latest

  steps:
    - name: 检出代码
      uses: actions/checkout@v4

    - name: 运行性能测试
      run: |
        ./scripts/tests/run-performance-test.sh

    - name: 性能基线对比
      run: |
        ./scripts/tests/compare-performance-baseline.sh
```

---

## 配置参数说明

### 租户选择器

租户选择器通过 `populate-tenants.sh` 脚本自动填充：

```bash
#!/bin/bash
# scripts/ci/populate-tenants.sh

WORKFLOW_FILE=".github/workflows/deploy-tenant.yml"

# 查找所有租户配置文件
TENANTS=($(find config/tenants -name "*.yml" -exec basename {} .yml \;))

# 生成选项列表
OPTIONS=""
for tenant in "${TENANTS[@]}"; do
    OPTIONS="$OPTIONS          - $tenant\n"
done

# 更新工作流文件
sed -i "/# Dynamically populated/a\\$OPTIONS" "$WORKFLOW_FILE"

echo "已更新租户列表，共 ${#TENANTS[@]} 个租户"
```

### Secrets 配置

需要在 GitHub仓库中配置以下 Secrets：

| Secret 名称 | 说明 | 示例 |
|------------|------|------|
| `SSH_PRIVATE_KEY` | SSH私钥 | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `REGISTRY_URL` | 镜像仓库地址 | `registry.example.com` |
| `REGISTRY_USERNAME` | 镜像仓库用户名 | `deploy_user` |
| `REGISTRY_PASSWORD` | 镜像仓库密码 | `secure_password` |
| `FEISHU_APP_SECRET` | Feishu App Secret | `xxx` |
| `DB_PASSWORD` | 数据库密码 | `xxx` |
| `JWT_SECRET` | JWT密钥 | `xxx` |
| `REDIS_PASSWORD` | Redis密码 | `xxx` |

### 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `DEPLOYMENT_VERSION` | 部署版本 | `v1.0.0` |
| `SCRIPT_DIR` | 脚本目录 | `scripts/deploy` |
| `LIB_DIR` | 库目录 | `scripts/lib` |
| `LOG_LEVEL` | 日志级别 | `info` |
| `TIMEOUT` | 超时时间 | `1800` (30分钟) |

---

## 租户管理

### 添加新租户

#### 步骤1: 创建租户配置文件

```bash
# 复制模板
cp config/tenants/template.yml config/tenants/new_tenant.yml

# 编辑配置
vim config/tenants/new_tenant.yml
```

#### 步骤2: 更新租户选择器

```bash
# 运行填充脚本
./scripts/ci/populate-tenants.sh

# 提交更改
git add .github/workflows/deploy-tenant.yml
git commit -m "Add new tenant: new_tenant"
git push
```

#### 步骤3: 验证配置

```bash
# 验证配置文件
./scripts/config/validate-config.sh config/tenants/new_tenant.yml

# 测试部署（演练模式）
./scripts/deploy/deploy-tenant.sh config/tenants/new_tenant.yml \
  --dry-run
```

### 删除租户

#### 步骤1: 删除配置文件

```bash
# 删除配置文件
rm config/tenants/old_tenant.yml

# 提交更改
git add config/tenants/old_tenant.yml
git commit -m "Remove tenant: old_tenant"
git push
```

#### 步骤2: 更新租户选择器

```bash
# 运行填充脚本
./scripts/ci/populate-tenants.sh

# 提交更改
git add .github/workflows/deploy-tenant.yml
git commit -m "Update tenant list"
git push
```

---

## 部署策略

### 并行部署

**特点**:
- 所有租户同时部署
- 部署时间最短
- 资源占用最大

**使用场景**:
- 租户间无依赖关系
- 有充足的资源
- 需要快速部署

**示例**:
```yaml
strategy:
  max-parallel: 5  # 最多5个租户并行
```

### 串行部署

**特点**:
- 租户按顺序部署
- 部署时间最长
- 资源占用最小

**使用场景**:
- 租户间有依赖关系
- 资源受限
- 需要严格控制

**示例**:
```yaml
strategy:
  max-parallel: 1  # 一次只部署1个租户
```

### 批量部署

**特点**:
- 租户分批部署
- 平衡时间和资源
- 灵活性最高

**使用场景**:
- 中等数量租户
- 需要平衡时间和资源
- 有部分依赖关系

**示例**:
```yaml
strategy:
  max-parallel: 3  # 每批3个租户
```

---

## 监控和日志

### 实时监控

#### GitHub UI

1. 进入 GitHub 仓库
2. 点击 "Actions" 标签
3. 选择正在运行的工作流
4. 查看实时日志

#### 日志级别

```yaml
env:
  LOG_LEVEL: debug  # debug, info, warn, error
```

### 部署摘要

工作流完成后会自动生成部署摘要：

```
## 部署摘要

- **租户**: Test Tenant Alpha
- **环境**: production
- **组件**: all
- **版本**: abc123
- **状态**: success
- **开始时间**: 2026-03-19 10:30:00
- **结束时间**: 2026-03-19 10:45:00
- **总耗时**: 15分钟

### 部署详情

✅ 配置验证通过
✅ 安全检查通过
✅ 镜像构建完成
✅ 部署执行成功
✅ 健康检查通过
✅ 集成测试通过

### 健康检查结果

✅ Layer 1: HTTP健康检查
✅ Layer 2: 数据库连接检查
✅ Layer 3: 数据库查询检查
✅ Layer 4: OAuth配置检查
✅ Layer 5: Redis连接检查

### 测试结果

✅ OAuth流程测试通过
✅ API健康测试通过
✅ 性能测试通过
```

### 状态数据库

部署状态会记录到 `deployment_state` 数据库：

```sql
-- 查看部署历史
SELECT
    deployment_time,
    tenant_id,
    environment,
    component,
    status,
    git_commit_sha
FROM deployments
ORDER BY deployment_time DESC
LIMIT 10;

-- 查看部署详情
SELECT * FROM deployment_config_snapshots
WHERE deployment_id = (
    SELECT id FROM deployments
    WHERE tenant_id = 'test_tenant_alpha'
    ORDER BY deployment_time DESC
    LIMIT 1
);
```

---

## 故障排查

### 问题1: 工作流触发失败

**症状**:
- GitHub Actions 不显示工作流
- 无法手动触发工作流

**诊断步骤**:
```bash
# 1. 检查工作流文件语法
yq eval 'true' .github/workflows/deploy-tenant.yml

# 2. 检查文件路径
ls -la .github/workflows/

# 3. 检查文件权限
ls -la .github/workflows/*.yml
```

**解决方案**:
```bash
# 确保工作流文件在正确的位置
# .github/workflows/*.yml 或 .github/workflows/*.yaml

# 提交并推送
git add .github/workflows/
git commit -m "Fix workflow files"
git push
```

### 问题2: 租户选择器为空

**症状**:
- 租户下拉菜单为空
- 无法选择租户

**诊断步骤**:
```bash
# 1. 检查租户配置文件
ls -la config/tenants/*.yml

# 2. 检查 populate-tenants.sh
./scripts/ci/populate-tenants.sh --dry-run

# 3. 检查工作流文件
grep -A 20 "tenant:" .github/workflows/deploy-tenant.yml
```

**解决方案**:
```bash
# 重新运行填充脚本
./scripts/ci/populate-tenants.sh

# 手动更新工作流文件
vim .github/workflows/deploy-tenant.yml

# 提交更改
git add .github/workflows/deploy-tenant.yml
git commit -m "Update tenant list"
git push
```

### 问题3: SSH 连接失败

**症状**:
```
Error: SSH connection failed
Permission denied (publickey)
```

**诊断步骤**:
```bash
# 1. 检查 Secrets
gh secret list

# 2. 验证 SSH 密钥格式
echo $SSH_PRIVATE_KEY | head -1
# 应该显示: -----BEGIN OPENSSH PRIVATE KEY-----

# 3. 测试 SSH 连接
ssh -i <(echo "$SSH_PRIVATE_KEY") root@118.25.0.190 "echo 'OK'"
```

**解决方案**:
```bash
# 重新生成 SSH 密钥
ssh-keygen -t ed25519 -a 100 -C "github-actions" -f ~/.ssh/github_actions_key

# 更新 GitHub Secrets
gh secret set SSH_PRIVATE_KEY < ~/.ssh/github_actions_key

# 部署公钥到服务器
ssh-copy-id -i ~/.ssh/github_actions_key.pub root@118.25.0.190
```

### 问题4: 镜像构建失败

**症状**:
```
Error: Docker image build failed
Failed to build backend image
```

**诊断步骤**:
```bash
# 1. 检查 Dockerfile
cat platform/backend/Dockerfile

# 2. 本地测试构建
docker build -t test-build platform/backend/

# 3. 检查镜像仓库凭据
gh secret list | grep REGISTRY
```

**解决方案**:
```bash
# 方案1: 修复 Dockerfile
# 方案2: 更新镜像仓库凭据
gh secret set REGISTRY_PASSWORD
# 方案3: 检查构建日志
```

### 问题5: 健康检查失败

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

# 3. 手动运行健康检查
./scripts/monitoring/enhanced-health-check.sh --verbose
```

**解决方案**:
```bash
# 方案1: 重启容器
docker restart opclaw-backend

# 方案2: 检查配置
docker exec opclaw-backend env | grep -E "DATABASE_URL|DB_"

# 方案3: 回滚部署
./scripts/deploy/rollback-tenant.sh test_tenant_alpha
```

---

## 最佳实践

### 1. 工作流设计

**✅ 推荐做法**:

- 使用矩阵策略并行化作业
- 每个作业职责单一
- 明确定义作业依赖关系
- 设置合理的超时时间

```yaml
jobs:
  build:
    timeout-minutes: 30
    runs-on: ubuntu-latest
    strategy:
      matrix:
        component: ['backend', 'frontend']
```

**❌ 避免做法**:
- 单个作业承担过多职责
- 不设置超时时间
- 不使用缓存
- 硬编码配置

### 2. 安全实践

**✅ 推荐做法**:

- 使用 GitHub Secrets 存储敏感信息
- 定期轮换密钥
- 最小权限原则
- 审计日志记录

```bash
# 设置 Secrets
gh secret set SSH_PRIVATE_KEY < ~/.ssh/deploy_key
gh secret set REGISTRY_PASSWORD

# 审计 Secret 使用
gh secret list
```

**❌ 避免做法**:
- 在代码中硬编码密钥
- 使用弱密码
- 共享密钥
- 不记录审计日志

### 3. 性能优化

**✅ 推荐做法**:

- 使用 Docker 缓存
- 并行化独立作业
- 依赖缓存
- 增量构建

```yaml
- uses: docker/build-push-action@v5
  with:
    cache-from: type=registry,ref=example.com/app:buildcache
    cache-to: type=registry,ref=example.com/app:buildcache,mode=max
```

**❌ 避免做法**:
- 每次都从零构建
- 串行执行独立作业
- 不使用缓存
- 构建不必要的镜像

### 4. 监控和告警

**✅ 推荐做法**:

- 设置部署摘要
- 配置通知
- 记录部署指标
- 错误追踪

```yaml
- name: 生成部署摘要
  if: always()
  run: |
    cat >> $GITHUB_STEP_SUMMARY << EOF
    ## 部署状态: ${{ job.status }}
    EOF

- name: 发送通知
  if: failure()
  run: |
    ./scripts/notify-deployment-failure.sh
```

**❌ 避免做法**:
- 不记录部署状态
- 没有通知机制
- 不追踪错误
- 缺少指标

### 5. 测试策略

**✅ 推荐做法**:

- 部署前验证配置
- 部署后健康检查
- 自动化集成测试
- 性能基线对比

```yaml
- name: 运行集成测试
  run: |
    ./scripts/tests/integration-test.sh

- name: 性能基线对比
  run: |
    ./scripts/tests/compare-performance.sh
```

**❌ 避免做法**:
- 跳过测试
- 手动测试
- 无性能验证
- 不追踪回归

---

## 附录

### A. 快速参考

```bash
# 更新租户列表
./scripts/ci/populate-tenants.sh

# 验证工作流
yq eval 'true' .github/workflows/deploy-tenant.yml

# 触发工作流
gh workflow run deploy-tenant.yml \
  -f tenant=test_tenant_alpha \
  -f component=all

# 查看工作流状态
gh workflow list
gh run list --workflow=deploy-tenant.yml
```

### B. 常用命令

```bash
# GitHub CLI
gh auth login
gh repo set-default
gh workflow run
gh run watch

# Secrets 管理
gh secret list
gh secret set
gh secret remove

# 工作流管理
gh workflow list
gh workflow enable
gh workflow disable
```

### C. 相关文档

- [部署脚本使用指南](deployment-script-guide.md)
- [安全最佳实践](../security/deployment-security.md)
- [故障排查指南](../troubleshooting/phase2-issues.md)
- [GitHub Actions 官方文档](https://docs.github.com/en/actions)

---

**文档版本**: 1.0.0
**最后更新**: 2026-03-19
**维护者**: AIOpc DevOps Team
