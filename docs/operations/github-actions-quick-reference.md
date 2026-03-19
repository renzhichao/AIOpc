# GitHub Actions 快速参考
# (GitHub Actions Quick Reference)

## 快速开始 (Quick Start)

### 1. 首次部署 (First Deployment)

```bash
# 1. 创建租户配置
cp config/tenants/template.yml config/tenants/my_tenant.yml
vi config/tenants/my_tenant.yml

# 2. 更新工作流下拉菜单
./scripts/ci/populate-tenants.sh --commit --push

# 3. 在 GitHub 上执行部署
# GitHub UI → Actions → 租户部署 → Run workflow
```

### 2. 批量部署 (Batch Deployment)

```bash
# 在 GitHub UI 中执行
# Actions → 批量租户部署 → Run workflow
# 选择部署模式: serial 或 parallel
# 选择目标环境: development 或 production
```

### 3. 运行测试 (Run Tests)

```bash
# 手动触发
# Actions → 集成测试 → Run workflow

# 自动触发
# - PR 创建或更新时
# - 部署完成后
# - 每天凌晨 2 点
```

## 常用命令 (Common Commands)

### 本地测试脚本

```bash
# 部署测试
./scripts/deploy/deploy-tenant.sh config/tenants/test_tenant_alpha.yml --dry-run --verbose

# 预检查
./scripts/deploy/pre-deploy.sh config/tenants/test_tenant_alpha.yml

# 回滚
./scripts/deploy/rollback-tenant.sh config/tenants/test_tenant_alpha.yml
```

### 租户管理

```bash
# 更新工作流下拉菜单
./scripts/ci/populate-tenants.sh --dry-run        # 预览
./scripts/ci/populate-tenants.sh --commit         # 提交
./scripts/ci/populate-tenants.sh --commit --push  # 提交并推送

# 验证配置
yq eval '.' config/tenants/my_tenant.yml
```

## 工作流配置 (Workflow Configuration)

### 必需的 GitHub Secrets

```
SSH_PRIVATE_KEY              # SSH 私钥
DOCKER_REGISTRY_USERNAME     # Docker 用户名
DOCKER_REGISTRY_PASSWORD     # Docker 密码
```

### 租户配置模板

```yaml
tenant:
  id: tenant_id
  name: "Tenant Name"
  environment: production

server:
  host: server_ip
  ssh_user: root
  ssh_key_path: ~/.ssh/id_rsa
  deploy_path: /opt/opclaw/platform
  api_port: 3000

feishu:
  app_id: cli_xxxxxxxxxxxxx
  app_secret: min_32_chars_long_secret
  encrypt_key: min_24_chars_long_key
  oauth_redirect_uri: http://localhost:3000/api/auth/feishu/callback

database:
  host: localhost
  port: 5432
  name: opclaw_tenant
  user: opclaw
  password: min_16_chars_password

redis:
  host: localhost
  port: 6379
  password: redis_password

jwt:
  secret: min_32_chars_jwt_secret
  expires_in: 24h

agent:
  deepseek:
    api_key: sk-deepseek-api-key
    model: deepseek-chat
```

## 故障排查 (Troubleshooting)

### 配置验证失败

```bash
# 检查占位符
grep -E "(changeme|placeholder|test_|your_)" config/tenants/my_tenant.yml

# 检查必填字段
yq eval '.tenant.id' config/tenants/my_tenant.yml
```

### SSH 连接问题

```bash
# 测试 SSH 连接
ssh -i ~/.ssh/deploy_key root@server_ip

# 检查密钥权限
ls -la ~/.ssh/deploy_key  # 应该是 600
```

### 健康检查失败

```bash
# 手动测试健康端点
curl http://server_ip:3000/health

# 检查服务状态
ssh root@server_ip "docker ps | grep opclaw"
```

## 部署流程 (Deployment Flow)

### 标准部署流程

```
1. 配置验证 (Configuration Validation)
   ├── YAML 语法检查
   ├── 必填字段验证
   ├── 占位符检测
   └── 安全字段验证

2. 组件构建 (Component Build)
   ├── Docker 镜像构建
   ├── 镜像标记和打标签
   └── 推送到镜像仓库

3. 服务部署 (Service Deployment)
   ├── SSH 连接配置
   ├── 执行部署脚本
   ├── 服务启动和重启
   └── Nginx 配置更新

4. 部署验证 (Deployment Verification)
   ├── HTTP 健康检查
   ├── 烟雾测试
   ├── OAuth 流程验证
   └── 性能基准测试

5. 部署完成 (Deployment Completion)
   ├── 生成部署摘要
   ├── 记录部署状态
   └── 清理临时文件
```

### 批量部署流程

```
1. 租户发现 (Tenant Discovery)
   ├── 扫描配置文件
   ├── 过滤目标环境
   └── 验证配置有效性

2. 部署执行 (Deployment Execution)
   ├── 串行模式 (Serial)
   │   └── 依次部署每个租户
   └── 并行模式 (Parallel)
       └── 并发部署多个租户

3. 批量摘要 (Batch Summary)
   ├── 汇总部署结果
   ├── 生成部署报告
   └── 更新部署状态
```

## 监控和日志 (Monitoring and Logging)

### 查看部署日志

```bash
# GitHub Actions 日志
# GitHub UI → Actions → 选择工作流运行 → 查看作业日志

# 服务器日志
ssh root@server_ip "docker logs opclaw-backend --tail 100"

# 部署脚本日志
ssh root@server_ip "tail -f /var/log/opclaw/deploy.log"
```

### 健康检查端点

```bash
# 健康检查
curl http://server_ip:3000/health

# 指标端点
curl http://server_ip:3000/metrics

# API 状态
curl http://server_ip:3000/api/status
```

## 最佳实践 (Best Practices)

### 部署前

✅ 在开发环境测试
✅ 备份当前部署
✅ 使用演练模式验证
✅ 检查配置文件

### 部署时

✅ 监控部署日志
✅ 准备回滚计划
✅ 在低流量时段部署
✅ 保持 SSH 连接可用

### 部署后

✅ 验证服务健康
✅ 检查应用日志
✅ 运行集成测试
✅ 监控性能指标

## 紧急回滚 (Emergency Rollback)

```bash
# 使用回滚脚本
./scripts/deploy/rollback-tenant.sh config/tenants/my_tenant.yml

# 手动回滚
ssh root@server_ip << 'EOF'
cd /opt/opclaw/platform
docker compose down
cp -r /var/backups/opclaw/my_tenant/pre-deploy.*/* .
docker compose up -d
EOF
```

## 支持和资源 (Support and Resources)

- **文档**: `docs/operations/github-actions-guide.md`
- **配置模板**: `config/tenants/template.yml`
- **测试租户**: `config/tenants/test_tenant_alpha.yml`
- **部署脚本**: `scripts/deploy/`
- **CI 脚本**: `scripts/ci/`

---

**最后更新**: 2026-03-19
**版本**: 1.0.0
