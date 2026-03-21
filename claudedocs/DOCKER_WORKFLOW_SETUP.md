# Docker 镜像自动化构建部署指南

## 工作流说明

GitHub Actions 会自动检测 `platform/backend` 和 `platform/frontend` 目录的变更，并构建对应的 Docker 镜像推送到 Docker Hub。

### 触发条件

- **自动触发**: 当推送到 `main` 或 `develop` 分支时
- **PR 触发**: 当创建针对 `main` 或 `develop` 的 PR 时
- **手动触发**: 在 GitHub Actions 页面手动运行

## 首次配置步骤

### 1. 配置 GitHub Secrets

在 GitHub 仓库设置中添加以下 Secrets：

**路径**: Settings → Secrets and variables → Actions → New repository secret

| Secret 名称 | 值 | 说明 |
|------------|---|----|
| `DOCKER_USERNAME` | `renzhichao` | Docker Hub 用户名 |
| `DOCKER_PASSWORD` | `<Docker Hub Access Token>` | Docker Hub 访问令牌（不是密码）|

### 2. 创建 Docker Hub Access Token

1. 登录 [Docker Hub](https://hub.docker.com/)
2. 点击右上角头像 → Account Settings
3. 左侧菜单选择 Security
4. 点击 "New Access Token"
5. 输入描述（如 `github-actions`）
6. 权限选择 `Read, Write, Delete`
7. 复制生成的 Token（只显示一次！）

### 3. 推送代码触发构建

```bash
# 提交 frontend .env.production 更改
git add platform/frontend/.env.production
git commit -m "feat(frontend): Use relative API URL for production"
git push origin feature/issue19-devops-pipeline
```

## 工作流输出

构建成功后会生成以下镜像标签：

- `latest` (仅 main 分支)
- `main-<sha>` (如 main-abc123)
- `develop-<sha>` (如 develop-def456)
- `<version>` (如果有语义化版本标签)

## 本地开发流程

### 方式 1: 完全自动化（推荐）

1. 修改代码并提交
2. 推送到 GitHub
3. GitHub Actions 自动构建并推送镜像
4. 在服务器上拉取最新镜像

```bash
# 服务器上拉取最新镜像
docker pull renzhichao/opclaw-frontend:latest
docker pull renzhichao/opclaw-backend:latest

# 重启服务
docker compose -f /opt/opclaw/platform/docker-compose.yml up -d
```

### 方式 2: 手动触发工作流

在 GitHub Actions 页面手动运行 "Build and Push Docker Images" 工作流。

## 优化建议

### Docker Hub 加速器配置（国内服务器）

在 CIIBER 服务器上配置 Docker Hub 镜像加速：

```bash
# 创建或修改 Docker daemon 配置
sudo tee /etc/docker/daemon.json > /dev/null <<EOF
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com",
    "https://mirror.baidubce.com"
  ]
}
EOF

# 重启 Docker
sudo systemctl daemon-reload
sudo systemctl restart docker
```

### 阿里云容器镜像服务（可选）

如果速度仍然太慢，可以考虑使用阿里云容器镜像服务：

1. 登录阿里云控制台
2. 创建命名空间（如 `renzhichao`）
3. 修改工作流中的镜像地址：
   ```yaml
   env:
     DOCKER_REGISTRY: registry.cn-hangzhou.aliyuncs.com
     BACKEND_IMAGE: registry.cn-hangzhou.aliyuncs.com/renzhichao/opclaw-backend
     FRONTEND_IMAGE: registry.cn-hangzhou.aliyuncs.com/renzhichao/opclaw-frontend
   ```

## 验证构建

### 查看工作流状态

在 GitHub 仓库页面：
1. 点击 "Actions" 标签
2. 选择 "Build and Push Docker Images" 工作流
3. 查看运行日志

### 验证镜像

```bash
# 检查镜像是否已推送
docker pull renzhichao/opclaw-frontend:latest
docker images | grep opclaw-frontend

# 查看镜像信息
docker inspect renzhichao/opclaw-frontend:latest | grep Created
```

## 常见问题

### Q: 构建失败怎么办？

A: 检查 Actions 日志中的错误信息：
- Docker 登录失败 → 检查 `DOCKER_USERNAME` 和 `DOCKER_PASSWORD` secrets
- 构建失败 → 检查 Dockerfile 语法
- 推送失败 → 检查 Docker Hub 权限

### Q: 如何回滚到之前的版本？

A: 使用 Git SHA 标签：
```bash
docker pull renzhichao/opclaw-frontend:main-<previous-sha>
docker tag renzhichao/opclaw-frontend:main-<previous-sha> renzhichao/opclaw-frontend:latest
```

### Q: 可以在 PR 中测试构建吗？

A: 可以！PR 触发的构建会生成 `pr-<number>` 标签，不会覆盖 `latest` 标签。
