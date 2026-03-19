# GitHub Actions 工作流指南
# (GitHub Actions Workflow Guide)

## 目录 (Table of Contents)

1. [概述 (Overview)](#概述-overview)
2. [工作流列表 (Workflow List)](#工作流列表-workflow-list)
3. [配置要求 (Configuration Requirements)](#配置要求-configuration-requirements)
4. [使用指南 (Usage Guide)](#使用指南-usage-guide)
5. [最佳实践 (Best Practices)](#最佳实践-best-practices)
6. [故障排查 (Troubleshooting)](#故障排查-troubleshooting)

---

## 概述 (Overview)

本项目使用 GitHub Actions 实现自动化 CI/CD 流程，支持多租户部署、集成测试和批量操作。

### 核心特性 (Key Features)

- ✅ **手动触发部署** - 通过 GitHub UI 触发部署
- ✅ **多租户支持** - 支持多个独立租户的部署
- ✅ **配置验证** - 自动验证租户配置文件
- ✅ **安全检查** - 检测占位符和弱密码
- ✅ **健康检查** - 部署后自动验证服务健康
- ✅ **批量部署** - 支持串行或并行批量部署
- ✅ **集成测试** - 自动化端到端测试
- ✅ **状态反馈** - 实时部署状态和详细摘要

### 工作流架构 (Workflow Architecture)

```
GitHub Actions CI/CD Pipeline
├── 租户部署 (deploy-tenant.yml)
│   ├── 配置验证 (Configuration Validation)
│   ├── 组件构建 (Component Build)
│   ├── 服务部署 (Service Deployment)
│   └── 部署验证 (Deployment Verification)
│
├── 批量部署 (deploy-all-tenants.yml)
│   ├── 租户发现 (Tenant Discovery)
│   ├── 串行/并行部署 (Serial/Parallel Deployment)
│   └── 批量摘要 (Batch Summary)
│
└── 集成测试 (integration-test.yml)
    ├── 健康检查 (Health Check Tests)
    ├── OAuth 测试 (OAuth Tests)
    ├── API 测试 (API Tests)
    └── 性能测试 (Performance Tests)
```

---

## 工作流列表 (Workflow List)

### 1. 租户部署工作流 (Tenant Deployment Workflow)

**文件**: `.github/workflows/deploy-tenant.yml`

**用途**: 部署单个租户实例

**触发方式**: 手动触发 (workflow_dispatch)

**输入参数**:
- `tenant` (必需): 租户ID - 从下拉菜单选择
- `component` (必需): 部署组件 - `all`/`backend`/`frontend`
- `skip_tests` (可选): 跳过测试 - 默认 `false`
- `dry_run` (可选): 演练模式 - 默认 `false`
- `force_deploy` (可选): 强制部署 - 默认 `false`
- `skip_backup` (可选): 跳过备份 - 默认 `false`

**作业流程**:
1. **validate-config**: 配置验证
   - YAML 语法验证
   - 必填字段验证
   - 占位符检测
   - 安全字段验证
   - 文件权限验证

2. **build**: 组件构建
   - 构建 Docker 镜像
   - 推送到镜像仓库
   - 标记版本信息

3. **deploy**: 服务部署
   - 配置 SSH 连接
   - 执行部署脚本
   - 处理取消请求

4. **verify**: 部署验证
   - HTTP 健康检查
   - 烟雾测试
   - 端点验证

5. **cleanup**: 部署后清理
   - 生成最终摘要
   - 更新部署状态

**使用示例**:
```bash
# 通过 GitHub UI 使用
1. 进入 Actions 标签页
2. 选择 "租户部署 (Tenant Deployment)" 工作流
3. 点击 "Run workflow"
4. 选择租户和配置选项
5. 点击 "Run workflow" 执行
```

### 2. 批量租户部署工作流 (Batch Tenant Deployment Workflow)

**文件**: `.github/workflows/deploy-all-tenants.yml`

**用途**: 批量部署多个租户

**触发方式**: 手动触发 (workflow_dispatch)

**输入参数**:
- `deployment_mode` (必需): 部署模式 - `serial`/`parallel`
- `on_failure` (必需): 失败行为 - `continue`/`stop`
- `skip_tests` (可选): 跳过测试 - 默认 `true`
- `dry_run` (可选): 演练模式 - 默认 `true`
- `target_environment` (必需): 目标环境 - `development`/`production`

**作业流程**:
1. **discover-tenants**: 租户发现
   - 扫描配置文件
   - 过滤目标环境
   - 验证配置有效性

2. **deploy-serial**: 串行部署 (如果选择串行模式)
   - 依次部署每个租户
   - 失败时根据配置决定是否继续

3. **deploy-parallel**: 并行部署 (如果选择并行模式)
   - 并发部署多个租户
   - 独立跟踪每个租户状态

4. **batch-summary**: 批量摘要
   - 汇总所有部署结果
   - 生成部署报告

**使用示例**:
```bash
# 批量部署所有开发环境租户
1. 进入 Actions 标签页
2. 选择 "批量租户部署 (Batch Tenant Deployment)"
3. 配置选项:
   - 部署模式: parallel
   - 失败行为: continue
   - 目标环境: development
4. 执行工作流
```

### 3. 集成测试工作流 (Integration Test Workflow)

**文件**: `.github/workflows/integration-test.yml`

**用途**: 自动化集成测试

**触发方式**:
- 手动触发 (workflow_dispatch)
- Pull Request (自动触发)
- 定期执行 (每天凌晨2点)
- 部署完成后 (自动触发)

**输入参数**:
- `tenant` (必需): 测试租户 - 默认 `test_tenant_alpha`
- `test_suite` (必需): 测试套件 - `all`/`health`/`oauth`/`api`/`performance`
- `skip_cleanup` (可选): 跳过清理 - 默认 `false`

**测试套件**:
1. **test-health**: 健康检查测试
   - 根路径端点
   - 健康端点
   - 指标端点
   - 响应时间

2. **test-oauth**: OAuth 测试
   - OAuth 登录端点
   - 重定向 URL 格式
   - Feishu API 连通性

3. **test-api**: API 测试
   - API 版本端点
   - API 状态端点
   - CORS 头部验证

4. **test-performance**: 性能测试
   - 响应时间基准
   - 并发请求处理
   - 性能等级评估

**使用示例**:
```bash
# 手动运行集成测试
1. 进入 Actions 标签页
2. 选择 "集成测试 (Integration Tests)"
3. 选择测试租户和测试套件
4. 执行工作流
```

---

## 配置要求 (Configuration Requirements)

### GitHub Secrets 配置

在 GitHub 仓库设置中配置以下 Secrets:

#### 必需的 Secrets (Required Secrets)

| Secret 名称 | 描述 | 示例 |
|------------|------|------|
| `SSH_PRIVATE_KEY` | SSH 私钥，用于连接远程服务器 | `-----BEGIN RSA PRIVATE KEY-----...` |
| `DOCKER_REGISTRY_USERNAME` | Docker 镜像仓库用户名 | `username` |
| `DOCKER_REGISTRY_PASSWORD` | Docker 镜像仓库密码 | `password` |

#### 可选的 Secrets (Optional Secrets)

| Secret 名称 | 描述 | 默认值 |
|------------|------|--------|
| `DOCKER_REGISTRY` | Docker 镜像仓库地址 | `ghcr.io` |
| `STATE_DB_CONNECTION` | 状态数据库连接字符串 | - |

#### 配置步骤

1. 进入 GitHub 仓库设置
2. 点击 "Secrets and variables" → "Actions"
3. 点击 "New repository secret"
4. 添加上述必需的 Secrets

### 租户配置文件

租户配置文件位于 `config/tenants/` 目录，格式为 YAML。

#### 配置文件示例

```yaml
# config/tenants/tenant_001.yml

tenant:
  id: tenant_001
  name: "示例租户"
  environment: production

server:
  host: 118.25.0.190
  ssh_user: root
  ssh_key_path: ~/.ssh/id_rsa
  deploy_path: /opt/opclaw/platform
  api_port: 3000
  metrics_port: 9090

feishu:
  app_id: cli_a93ce5614ce11bd6
  app_secret: L0cHQDBbEiIys6AHW53miecONb1xA4qy
  encrypt_key: your_encrypt_key_24_chars_min
  oauth_redirect_uri: http://localhost:3000/api/auth/feishu/callback
  api_base_url: https://open.feishu.cn

database:
  host: localhost
  port: 5432
  name: opclaw_tenant_001
  user: opclaw
  password: your_db_password_16_chars

redis:
  host: localhost
  port: 6379
  password: your_redis_password

jwt:
  secret: your_jwt_secret_32_characters_long_min
  expires_in: 24h

agent:
  deepseek:
    api_key: sk-your-deepseek-api-key
    model: deepseek-chat
```

#### 配置验证规则

1. **YAML 语法**: 文件必须是有效的 YAML 格式
2. **必填字段**: 所有必要字段必须存在且非空
3. **占位符检测**: 不允许使用 `changeme`、`placeholder`、`test_` 等占位符
4. **密码强度**:
   - JWT secret: 至少 32 字符
   - Feishu app secret: 至少 32 字符
   - Database password: 至少 16 字符
5. **SSH 密钥**: 文件权限必须为 `600` 或 `400`

---

## 使用指南 (Usage Guide)

### 基本部署流程 (Basic Deployment Flow)

#### 步骤 1: 准备租户配置

1. 创建租户配置文件:
```bash
cp config/tenants/template.yml config/tenants/my_tenant.yml
```

2. 编辑配置文件，填写实际配置值:
```bash
vi config/tenants/my_tenant.yml
```

3. 验证配置文件:
```bash
yq eval '.' config/tenants/my_tenant.yml
```

#### 步骤 2: 更新工作流

运行租户填充脚本以更新工作流下拉菜单:
```bash
./scripts/ci/populate-tenants.sh --commit
```

#### 步骤 3: 执行部署

1. 在 GitHub 上打开 Actions 页面
2. 选择 "租户部署 (Tenant Deployment)" 工作流
3. 点击 "Run workflow"
4. 选择租户和配置选项
5. 点击 "Run workflow" 执行部署

#### 步骤 4: 监控部署

- 查看 Actions 页面的实时日志
- 检查作业摘要了解部署状态
- 验证服务健康状态

### 高级使用场景 (Advanced Scenarios)

#### 场景 1: 演练部署 (Dry Run Deployment)

在不实际部署的情况下测试部署流程:

1. 在工作流输入中勾选 `dry_run` 选项
2. 执行工作流
3. 查看摘要了解将会执行的步骤

#### 场景 2: 批量部署到开发环境

使用批量部署工作流部署所有开发环境租户:

1. 选择 "批量租户部署" 工作流
2. 配置:
   - 部署模式: `parallel`
   - 失败行为: `continue`
   - 目标环境: `development`
3. 执行工作流

#### 场景 3: 部署后自动测试

配置部署工作流在完成后自动运行集成测试:

1. 确保 `integration-test.yml` 中的 `workflow_run` 触发器已启用
2. 部署完成后，集成测试将自动运行
3. 查看测试结果验证部署成功

#### 场景 4: 失败时回滚

如果部署失败，可以使用手动回滚:

```bash
# 使用回滚脚本
./scripts/deploy/rollback-tenant.sh config/tenants/my_tenant.yml
```

---

## 最佳实践 (Best Practices)

### 1. 配置管理 (Configuration Management)

✅ **推荐做法**:
- 为每个租户维护独立的配置文件
- 使用版本控制跟踪配置变更
- 定期审查和更新配置
- 在配置文件中添加注释

❌ **避免**:
- 在多个租户间共享配置
- 硬编码敏感信息
- 使用占位符或测试值
- 忽略配置验证警告

### 2. 部署策略 (Deployment Strategy)

✅ **推荐做法**:
- 先在开发环境测试
- 使用演练模式验证流程
- 在低流量时段部署生产环境
- 准备回滚计划

❌ **避免**:
- 直接部署到生产环境
- 跳过健康检查
- 在高流量时段部署
- 没有备份直接部署

### 3. 安全实践 (Security Practices)

✅ **推荐做法**:
- 使用 GitHub Secrets 存储敏感信息
- 定期轮换密钥和密码
- 使用强密码和随机密钥
- 限制 SSH 密钥访问

❌ **避免**:
- 在配置文件中硬编码密钥
- 使用弱密码或默认密钥
- 共享 SSH 密钥
- 忽略安全警告

### 4. 监控和日志 (Monitoring and Logging)

✅ **推荐做法**:
- 检查部署日志
- 监控服务健康状态
- 收集性能指标
- 设置告警通知

❌ **避免**:
- 忽略部署错误
- 不检查服务状态
- 不收集日志
- 没有监控机制

### 5. 测试覆盖 (Test Coverage)

✅ **推荐做法**:
- 在部署前运行集成测试
- 测试所有关键功能
- 验证性能指标
- 自动化测试流程

❌ **避免**:
- 跳过测试
- 只测试部分功能
- 忽略性能测试
- 手动测试

---

## 故障排查 (Troubleshooting)

### 常见问题 (Common Issues)

#### 问题 1: 配置验证失败

**症状**:
```
❌ 错误: 配置文件包含占位符值
```

**解决方案**:
1. 检查配置文件中的占位符
2. 替换所有 `changeme`、`placeholder` 等值
3. 确保所有必填字段都已填写
4. 验证 YAML 语法正确

#### 问题 2: SSH 连接失败

**症状**:
```
❌ SSH 连接测试失败
```

**解决方案**:
1. 验证 SSH 密钥已正确配置在 GitHub Secrets 中
2. 检查服务器地址和用户名
3. 确认 SSH 密钥文件权限为 `600`
4. 测试手动 SSH 连接

#### 问题 3: 健康检查失败

**症状**:
```
❌ 健康检查失败
```

**解决方案**:
1. 检查服务是否正常启动
2. 验证端口配置正确
3. 查看服务日志
4. 确认防火墙规则允许访问

#### 问题 4: Docker 镜像构建失败

**症状**:
```
❌ 构建后端镜像失败
```

**解决方案**:
1. 检查 Dockerfile 语法
2. 验证依赖文件存在
3. 确认构建上下文正确
4. 查看构建日志获取详细错误

#### 问题 5: 部署超时

**症状**:
```
⏱️ 部署超时
```

**解决方案**:
1. 检查网络连接
2. 验证服务器资源充足
3. 优化部署脚本
4. 增加超时时间

### 调试技巧 (Debugging Tips)

#### 1. 启用详细日志

在工作流中添加 `--verbose` 选项:
```yaml
DEPLOY_CMD="$DEPLOY_CMD --verbose"
```

#### 2. 使用演练模式

在部署前先运行演练:
```yaml
if [ "${{ github.event.inputs.dry_run }}" = "true" ]; then
  DEPLOY_CMD="$DEPLOY_CMD --dry-run"
fi
```

#### 3. 检查作业摘要

每个作业完成后查看 GitHub 生成的摘要，了解详细状态。

#### 4. 查看完整日志

点击作业步骤查看完整的执行日志。

#### 5. 本地测试脚本

在 CI 环境外测试部署脚本:
```bash
./scripts/deploy/deploy-tenant.sh config/tenants/test_tenant.yml --dry-run --verbose
```

---

## 附录 (Appendix)

### A. 工作流文件结构

```
.github/workflows/
├── deploy-tenant.yml          # 租户部署工作流
├── deploy-all-tenants.yml     # 批量部署工作流
├── integration-test.yml       # 集成测试工作流
├── ci.yml                     # 持续集成工作流
├── pr-check.yml               # PR 检查工作流
├── quality-gate.yml           # 质量门禁工作流
└── test-rollback.yml          # 回滚测试工作流
```

### B. 脚本文件结构

```
scripts/
├── ci/
│   └── populate-tenants.sh    # 租户填充脚本
└── deploy/
    ├── deploy-tenant.sh       # 租户部署脚本
    ├── pre-deploy.sh          # 部署前检查
    ├── post-deploy.sh         # 部署后验证
    └── rollback-tenant.sh     # 租户回滚脚本
```

### C. 配置文件结构

```
config/
└── tenants/
    ├── template.yml           # 租户配置模板
    ├── test_tenant_alpha.yml  # 测试租户
    └── tenant_001.yml         # 生产租户
```

### D. 参考资源

- [GitHub Actions 文档](https://docs.github.com/en/actions)
- [YAML 语法指南](https://yaml.org/spec/1.2/spec.html)
- [Docker 最佳实践](https://docs.docker.com/develop/dev-best-practices/)
- [SSH 密钥管理](https://www.ssh.com/academy/ssh/key)

---

## 更新日志 (Changelog)

### v1.0.0 (2026-03-19)

初始版本，包含以下功能:
- ✅ 租户部署工作流
- ✅ 批量部署工作流
- ✅ 集成测试工作流
- ✅ 租户填充脚本
- ✅ 完整文档

---

## 联系支持 (Contact Support)

如有问题或建议，请:
- 提交 GitHub Issue
- 联系 DevOps 团队
- 查看项目文档
