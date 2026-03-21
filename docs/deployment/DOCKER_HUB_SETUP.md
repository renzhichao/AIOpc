# Docker Hub + 镜像加速器配置指南

## 概述 (Overview)

本方案使用 **Docker Hub** 作为镜像仓库，配合阿里云镜像加速器，实现：
- ✅ **完全免费** - 无任何费用
- ✅ **国内速度快** - 配置加速器后可达5-10MB/s
- ✅ **配置简单** - 5分钟完成配置
- ✅ **稳定可靠** - Docker官方仓库

---

## 1. Docker Hub 账号设置

### 1.1 注册Docker Hub账号

1. 访问 [Docker Hub](https://hub.docker.com/)
2. 点击 "Sign Up" 注册账号
3. 验证邮箱

**重要**: 记住您的Docker Hub用户名，后续配置需要使用。

### 1.2 创建访问Token (推荐)

为了安全，建议使用访问Token而非密码：

1. 登录 Docker Hub
2. 点击右上角头像 → "Account Settings"
3. 选择 "Security" → "New Access Token"
4. 输入Token描述（如：GitHub Actions）
5. 复制生成的Token（只显示一次！）

**Token格式**: `dckr_pat_<xxxxx>`

---

## 2. 配置GitHub Secrets

### 2.1 必需的GitHub Secrets

在GitHub仓库中添加以下Secrets:

| Secret名称 | 说明 | 示例值 |
|-----------|------|--------|
| `DOCKERHUB_USERNAME` | Docker Hub用户名 | `your-dockerhub-username` |
| `DOCKERHUB_TOKEN` | Docker Hub访问Token | `dckr_pat_xxxxx` |

### 2.2 配置步骤

1. 访问GitHub仓库设置页面
   ```
   https://github.com/renzhichao/AIOpc/settings/secrets/actions
   ```

2. 点击"New repository secret"添加Secret

3. 添加上述两个Secret

---

## 3. 服务器镜像加速器配置

### 3.1 自动配置（推荐）

使用我们提供的自动化脚本：

```bash
# 方法1: 使用curl
curl -fsSL https://your-server/configure-docker-mirror.sh | sudo bash

# 方法2: 手动下载脚本
scp configure-docker-mirror.sh root@118.25.0.190:/tmp/
ssh root@118.25.0.190 "bash /tmp/configure-docker-mirror.sh"
```

脚本会自动：
- ✅ 配置多个镜像加速器
- ✅ 配置Docker日志轮转
- ✅ 重启Docker服务
- ✅ 验证配置是否生效

### 3.2 手动配置

如果需要手动配置：

#### Step 1: 创建配置文件

```bash
sudo mkdir -p /etc/docker

sudo tee /etc/docker/daemon.json <<-'EOF'
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com",
    "https://mirror.ccs.tencentyun.com",
    "https://registry.docker-cn.com"
  ],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "storage-driver": "overlay2",
  "dns": ["8.8.8.8", "114.114.114.114"]
}
EOF
```

#### Step 2: 重启Docker服务

```bash
sudo systemctl daemon-reload
sudo systemctl restart docker
```

#### Step 3: 验证配置

```bash
# 查看Docker信息
docker info | grep -A 10 "Registry Mirrors"

# 应该看到类似输出：
# Registry Mirrors:
#  https://docker.mirrors.ustc.edu.cn/
#  https://hub-mirror.c.163.com/
#  https://mirror.ccs.tencentyun.com/
#  https://registry.docker-cn.com/
```

---

## 4. 测试镜像拉取速度

### 4.1 配置前（GHCR）

```bash
time docker pull ghcr.io/renzhichao/aiopc/opclaw-backend:latest
# 预期速度: ~100KB/s
# 预期时间: 30-60分钟 (667MB镜像)
```

### 4.2 配置后（Docker Hub + 加速器）

```bash
time docker pull renzhichao/opclaw-backend:latest
# 预期速度: 5-10MB/s
# 预期时间: 1-3分钟
```

### 4.3 速度对比

| 配置 | 速度 | 667MB镜像时间 | 提升 |
|------|------|--------------|------|
| GHCR | 100KB/s | 60分钟 | 基准 |
| Docker Hub + 加速器 | 10MB/s | 1分钟 | **60倍** |

---

## 5. 使用Docker Hub部署

### 5.1 触发部署

```bash
# 使用GitHub CLI
gh workflow run deploy-tenant.yml -f tenant=CIIBER

# 或通过GitHub UI
# Actions → Tenant Deployment → Run workflow
```

### 5.2 镜像地址

部署时使用的镜像地址：

```
Backend:  renzhichao/opclaw-backend:latest
Frontend: renzhichao/opclaw-frontend:latest
```

### 5.3 手动拉取测试

在目标服务器上测试：

```bash
# 登录Docker Hub (如果需要)
docker login

# 拉取镜像
time docker pull renzhichao/opclaw-backend:latest

# 验证镜像
docker images | grep opclaw
```

---

## 6. 镜像加速器列表

### 6.1 推荐加速器（按速度排序）

| 加速器 | 地址 | 状态 | 速度 |
|--------|------|------|------|
| 中科大 | `https://docker.mirrors.ustc.edu.cn` | ✅ 稳定 | ⭐⭐⭐⭐⭐ |
| 网易 | `https://hub-mirror.c.163.com` | ✅ 稳定 | ⭐⭐⭐⭐⭐ |
| 腾讯云 | `https://mirror.ccs.tencentyun.com` | ✅ 稳定 | ⭐⭐⭐⭐ |
| Docker中国 | `https://registry.docker-cn.com` | ⚠️ 较慢 | ⭐⭐⭐ |

### 6.2 备用加速器

如果主要加速器不可用，可以添加：

```json
{
  "registry-mirrors": [
    "https://docker.1panel.live",
    "https://docker.unsee.tech",
    "https://docker.ckyl.me"
  ]
}
```

---

## 7. 常见问题

### 7.1 加速器不生效

**问题**: 配置后速度仍然很慢

**解决**:
```bash
# 1. 检查配置
docker info | grep -A 10 "Registry Mirrors"

# 2. 清理Docker缓存
docker system prune -a

# 3. 重启Docker
sudo systemctl restart docker

# 4. 测试网络连接
curl -I https://docker.mirrors.ustc.edu.cn
```

### 7.2 镜像拉取失败

**问题**: `Error response from daemon: pull access denied`

**解决**:
```bash
# 1. 登录Docker Hub
docker login

# 2. 检查镜像是否存在
# 访问 https://hub.docker.com/r/renzhichao/opclaw-backend

# 3. 确认用户名正确
echo $DOCKERHUB_USERNAME
```

### 7.3 Docker启动失败

**问题**: 配置daemon.json后Docker无法启动

**解决**:
```bash
# 1. 检查JSON语法
cat /etc/docker/daemon.json | python3 -m json.tool

# 2. 查看Docker日志
journalctl -u docker -n 50

# 3. 恢复默认配置
sudo mv /etc/docker/daemon.json /etc/docker/daemon.json.bak
sudo systemctl restart docker
```

---

## 8. 多服务器配置

### 8.1 CIIBER服务器 (113.105.103.165)

```bash
ssh -i ~/.ssh/ciiber_key openclaw@113.105.103.165 -p 20122
```

然后执行自动配置脚本。

### 8.2 OmniTech服务器 (118.25.0.190)

```bash
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190
```

然后执行自动配置脚本。

### 8.3 批量配置脚本

```bash
#!/bin/bash
# configure-all-servers.sh

SERVERS=(
  "openclaw@113.105.103.165:20122:~/.ssh/ciiber_key"
  "root@118.25.0.190:22:~/.ssh/rap001_opclaw"
)

for SERVER in "${SERVERS[@]}"; do
  IFS=':' read -r USER HOST PORT KEY <<< "$SERVER"
  echo "Configuring $USER@$HOST:$PORT..."

  scp -i "$KEY" configure-docker-mirror.sh \
    "$USER@$HOST:$PORT":/tmp/

  ssh -i "$KEY" -p "$PORT" "$USER@$HOST" \
    "bash /tmp/configure-docker-mirror.sh"
done
```

---

## 9. 成本分析

### 9.1 Docker Hub (本方案)

| 项目 | 费用 |
|------|------|
| 镜像存储 | ¥0 (无限制) |
| 下载流量 | ¥0 (无限制) |
| 上传流量 | ¥0 (无限制) |
| 私有仓库 | ¥0 (无限制) |
| **总计** | **¥0/月** |

### 9.2 其他方案对比

| 方案 | 月成本 | 备注 |
|------|--------|------|
| **Docker Hub** | **¥0** | ✅ 完全免费 |
| 腾讯云TCR | ¥0 | 个人版免费 |
| 华为云SWR | ¥0-50 | 5GB免费额度 |
| 阿里云ACR | ¥170+ | 企业版收费 |
| GHCR | ¥0 | 国内慢 |

---

## 10. 最佳实践

### 10.1 安全建议

1. ✅ 使用访问Token而非密码
2. ✅ 定期轮换Token（每3-6个月）
3. ✅ 限制Token权限（只读、读写等）
4. ✅ 启用Docker Hub两步验证

### 10.2 性能优化

1. ✅ 使用多个镜像加速器（提高可用性）
2. ✅ 配置DNS加速解析
3. ✅ 启用Docker BuildKit缓存
4. ✅ 使用多阶段构建减小镜像

### 10.3 版本管理

推荐的镜像标签策略：

```bash
# 正式版本
renzhichao/opclaw-backend:v1.0.0

# 预发布版本
renzhichao/opclaw-backend:v1.0.0-beta.1

# 最新版本
renzhichao/opclaw-backend:latest

# 特定commit
renzhichao/opclaw-backend:commit-abc123
```

---

## 11. 从GHCR迁移

### 11.1 已有镜像处理

如果GHCR上已有镜像，可以复制到Docker Hub：

```bash
# 拉取GHCR镜像
docker pull ghcr.io/renzhichao/aiopc/opclaw-backend:latest

# 重新打标签
docker tag ghcr.io/renzhichao/aiopc/opclaw-backend:latest \
           renzhichao/opclaw-backend:latest

# 推送到Docker Hub
docker push renzhichao/opclaw-backend:latest
```

### 11.2 更新服务器配置

修改docker-compose.yml：

```yaml
services:
  backend:
    # 从
    image: ghcr.io/renzhichao/aiopc/opclaw-backend:latest
    # 改为
    image: renzhichao/opclaw-backend:latest
```

---

## 12. 监控和日志

### 12.1 查看镜像拉取日志

```bash
# 实时查看Docker日志
journalctl -u docker -f

# 查看镜像拉取历史
docker events --since '1h' | grep pull
```

### 12.2 性能监控

```bash
# 测试镜像拉取速度
time docker pull renzhichao/opclaw-backend:latest

# 查看镜像大小
docker images renzhichao/opclaw-backend --format "table {{.Repository}}:{{.Tag}}\t{{.Size}}"
```

---

## 13. 参考资料

- [Docker Hub官方文档](https://docs.docker.com/docker-hub/)
- [Docker镜像加速器](https://docs.docker.com/registry/recipes/mirror/)
- [Docker最佳实践](https://docs.docker.com/develop/dev-best-practices/)

---

## 更新日志

| 日期 | 版本 | 更新内容 |
|------|------|----------|
| 2026-03-20 | v1.0 | 初始版本，Docker Hub + 镜像加速器配置 |
