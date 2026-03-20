# 阿里云容器镜像服务 (ACR) 配置指南

## 概述 (Overview)

本文档说明如何配置阿里云容器镜像服务 (ACR) 用于加速国内Docker镜像拉取。

**优势**:
- 国内访问速度提升100倍 (100x faster image pulling in China)
- 支持跨地域同步
- 免费额度充足 (Generous free tier)
- 与现有GitHub Actions workflow无缝集成

---

## 1. 创建阿里云ACR实例

### 1.1 开通容器镜像服务

1. 访问 [阿里云容器镜像服务](https://cr.console.aliyun.com/)
2. 选择"个人版" (免费) 或"企业版" (付费，功能更多)
3. 完成开通流程

### 1.2 创建命名空间 (Namespace)

```bash
# 推荐配置
命名空间名称: aiopc
访问权限: 私有 (Private)
```

**注意**: 命名空间创建后不可修改，请谨慎命名。

### 1.3 创建镜像仓库

创建两个镜像仓库:

#### Backend 镜像仓库
```
仓库名称: opclaw-backend
摘要: OpenClaw Backend Service
代码源: 本地仓库 (Local)
覆盖规则: 不覆盖
```

#### Frontend 镜像仓库
```
仓库名称: opclaw-frontend
摘要: OpenClaw Frontend Application
代码源: 本地仓库 (Local)
覆盖规则: 不覆盖
```

---

## 2. 获取访问凭证

### 2.1 设置固定密码

1. 访问 [访问凭证页面](https://cr.console.aliyun.com/unicorn/accelerator)
2. 设置"固定密码" (Set Registry Password)
3. **重要**: 记录用户名和密码

**凭证格式**:
```
用户名: 阿里云账号全称 (例如: your-account@aliyun.com)
密码: 自定义设置的密码
```

### 2.2 验证访问权限

```bash
docker login registry.cn-hangzhou.aliyuncs.com
# 输入用户名和密码
```

---

## 3. 配置GitHub Secrets

### 3.1 必需的GitHub Secrets

在GitHub仓库中添加以下Secrets:

| Secret名称 | 说明 | 示例值 |
|-----------|------|--------|
| `ALIYUN_ACR_REGISTRY` | ACR仓库地址 | `registry.cn-hangzhou.aliyuncs.com` |
| `ALIYUN_ACR_NAMESPACE` | ACR命名空间 | `aiopc` |
| `ALIYUN_ACR_USERNAME` | ACR用户名 | `your-account@aliyun.com` |
| `ALIYUN_ACR_PASSWORD` | ACR密码 | `your-registry-password` |

### 3.2 配置步骤

1. 访问GitHub仓库设置页面
   ```
   https://github.com/renzhichao/AIOpc/settings/secrets/actions
   ```

2. 点击"New repository secret"添加Secret

3. 按照上表添加4个Secret

---

## 4. 更新租户配置

### 4.1 修改租户YAML文件

在租户配置文件中添加Docker registry配置:

```yaml
# config/tenants/OMNITECH.yml

server:
  docker_registry:
    type: "aliyun"  # 使用阿里云ACR
    aliyun:
      registry: "registry.cn-hangzhou.aliyuncs.com"
      namespace: "aiopc"
    pull_policy: "always"
```

### 4.2 验证配置

```bash
# 验证YAML语法
yq eval '.' config/tenants/OMNITECH.yml
```

---

## 5. 使用ACR进行部署

### 5.1 触发部署

使用GitHub Actions部署:

```bash
# 方法1: 使用GitHub CLI
gh workflow run deploy-tenant.yml -f tenant=OMNITECH

# 方法2: 通过GitHub UI
# 1. 访问 Actions 页面
# 2. 选择 "Tenant Deployment" workflow
# 3. 点击 "Run workflow"
# 4. 选择租户并运行
```

### 5.2 镜像地址

部署时使用的镜像地址:

```
Backend:  registry.cn-hangzhou.aliyuncs.com/aiopc/opclaw-backend:latest
Frontend: registry.cn-hangzhou.aliyuncs.com/aiopc/opclaw-frontend:latest
```

### 5.3 手动拉取镜像测试

在目标服务器上测试镜像拉取速度:

```bash
# 登录ACR
docker login registry.cn-hangzhou.aliyuncs.com

# 拉取镜像
time docker pull registry.cn-hangzhou.aliyuncs.com/aiopc/opclaw-backend:latest

# 预期速度: 5-10 MB/s (国内网络)
```

---

## 6. 区域选择建议

### 6.1 可用区域

| 区域 | 地址 | 适用场景 |
|------|------|----------|
| 华东1 (杭州) | registry.cn-hangzhou.aliyuncs.com | **默认推荐** |
| 华北2 (北京) | registry.cn-beijing.aliyuncs.com | 北方用户 |
| 华南1 (深圳) | registry.cn-shenzhen.aliyuncs.com | 南方用户 |
| 西南1 (成都) | registry.cn-chengdu.aliyuncs.com | 西部用户 |

### 6.2 选择建议

- **CIIBER (113.105.103.165)**: 使用杭州区域
- **OmniTech (118.25.0.190)**: 使用杭州区域

---

## 7. 故障排查

### 7.1 登录失败

**问题**: `Error response from daemon: Get "https://registry.cn-hangzhou.aliyuncs.com/v2/": unauthorized`

**解决**:
```bash
# 1. 验证凭证
docker logout registry.cn-hangzhou.aliyuncs.com
docker login registry.cn-hangzhou.aliyuncs.com

# 2. 检查GitHub Secrets是否正确配置
gh secret list
```

### 7.2 镜像拉取缓慢

**问题**: 镜像拉取速度仍然很慢

**解决**:
```bash
# 配置Docker镜像加速器
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json <<-'EOF'
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com"
  ],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF

sudo systemctl daemon-reload
sudo systemctl restart docker
```

### 7.3 权限错误

**问题**: `denied: requested access to the resource is denied`

**解决**:
1. 检查命名空间权限设置
2. 确认仓库为私有且当前账号有访问权限
3. 验证GitHub Secret中的凭证是否正确

---

## 8. 迁移现有部署

### 8.1 从GHCR迁移到ACR

如果已有GHCR上的镜像，可以复制到ACR:

```bash
# 拉取GHCR镜像
docker pull ghcr.io/renzhichao/aiopc/opclaw-backend:latest

# 重新打标签
docker tag ghcr.io/renzhichao/aiopc/opclaw-backend:latest \
           registry.cn-hangzhou.aliyuncs.com/aiopc/opclaw-backend:latest

# 推送到ACR
docker push registry.cn-hangzhou.aliyuncs.com/aiopc/opclaw-backend:latest
```

### 8.2 更新服务器配置

在目标服务器上更新docker-compose.yml:

```yaml
services:
  backend:
    image: registry.cn-hangzhou.aliyuncs.com/aiopc/opclaw-backend:latest
    # ... 其他配置保持不变

  frontend:
    image: registry.cn-hangzhou.aliyuncs.com/aiopc/opclaw-frontend:latest
    # ... 其他配置保持不变
```

---

## 9. 成本估算

### 9.1 免费额度

| 版本 | 价格 | 存储容量 | 流量 |
|------|------|----------|------|
| 个人版 | 免费 | 300GB | 不限 |
| 企业版 | ¥0.17/GB/月 | 按需付费 | ¥0.50/GB |

### 9.2 预估成本

假设每月部署10个版本，每个镜像500MB:

```
存储成本: 10个版本 × 500MB × ¥0.17 = ¥0.85/月
流量成本: 可忽略不计 (国内访问流量免费)
总成本: < ¥1/月 (个人版完全免费)
```

---

## 10. 最佳实践

### 10.1 安全建议

1. ✅ 使用私有仓库 (Private repository)
2. ✅ 定期更换访问密码
3. ✅ 不要将密码提交到代码仓库
4. ✅ 使用GitHub Secrets管理敏感信息

### 10.2 性能优化

1. ✅ 选择离服务器最近的区域
2. ✅ 启用镜像构建缓存
3. ✅ 使用多阶段构建减小镜像大小
4. ✅ 定期清理旧版本镜像

### 10.3 版本管理

```bash
# 推荐的镜像标签策略
latest           # 最新版本
v1.0.0           # 正式版本
v1.0.0-beta.1    # 预发布版本
v1.0.0-rc.1      # 候选版本
```

---

## 11. 参考资料

- [阿里云容器镜像服务文档](https://help.aliyun.com/product/60716.html)
- [Docker Registry认证](https://docs.docker.com/registry/spec/auth/)
- [GitHub Actions文档](https://docs.github.com/en/actions)

---

## 更新日志

| 日期 | 版本 | 更新内容 |
|------|------|----------|
| 2026-03-20 | v1.0 | 初始版本，支持阿里云ACR配置 |
