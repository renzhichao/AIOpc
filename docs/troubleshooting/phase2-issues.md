# Phase 2 故障排查指南

> **Multi-Instance Single-Tenant Deployment Support**
> **文档版本**: 1.0.0
> **适用范围**: TASK-011 至 TASK-015
> **目标受众**: 运维团队、开发人员

---

## 目录

1. [概述](#概述)
2. [部署脚本问题](#部署脚本问题)
3. [本地部署问题](#本地部署问题)
4. [GitHub Actions问题](#github-actions问题)
5. [安全检查问题](#安全检查问题)
6. [配置问题](#配置问题)
7. [网络问题](#网络问题)
8. [性能问题](#性能问题)
9. [诊断工具](#诊断工具)

---

## 概述

### 文档目的

本指南提供Phase 2实施过程中可能遇到的问题的诊断步骤和解决方案。

### 问题分类

- 🔴 **CRITICAL**: 影响生产环境，需要立即处理
- 🟡 **WARNING**: 可能影响功能，需要尽快处理
- 🟢 **INFO**: 信息性问题，可以稍后处理

### 报告问题

遇到问题时，请收集以下信息：

```bash
# 系统信息
uname -a > /tmp/issue_info.txt
df -h >> /tmp/issue_info.txt
docker ps >> /tmp/issue_info.txt

# 日志信息
docker logs opclaw-backend --tail 100 > /tmp/backend.log
docker logs opclaw-postgres --tail 100 > /tmp/postgres.log

# 部署信息
./scripts/deploy/deploy-tenant.sh --help > /tmp/deploy_help.txt
git log --oneline -5 >> /tmp/issue_info.txt
```

---

## 部署脚本问题

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

# 4. 查看YAML错误详情
yq eval '.' config/tenants/test_tenant_alpha.yml 2>&1 | head -20
```

**解决方案**:
```bash
# 方案1: 修复YAML语法
# 常见问题: 缩进错误、特殊字符未转义、引号不匹配
# 使用在线工具验证: https://www.yamllint.com/

# 方案2: 修复文件编码
# 确保文件为UTF-8编码
iconv -f UTF-8 -t UTF-8 config/tenants/test_tenant_alpha.yml > fixed.yml
mv fixed.yml config/tenants/test_tenant_alpha.yml

# 方案3: 修复文件权限
chmod 600 config/tenants/test_tenant_alpha.yml

# 方案4: 重新生成配置
cp config/tenants/template.yml config/tenants/test_tenant_alpha.yml
# 然后重新编辑
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

# 3. 检查SSH连接
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 "ps aux | grep deploy"
```

**解决方案**:
```bash
# 方案1: 等待当前部署完成
# 每30秒检查一次
while true; do
    status=$(psql -h localhost -U postgres -d deployment_state \
        -t -c "SELECT status FROM deployments WHERE tenant_id = 'test_tenant_alpha' AND status = 'in_progress';")
    if [[ -z "$status" ]]; then
        break
    fi
    echo "等待部署完成..."
    sleep 30
done

# 方案2: 如果是误报，使用--force强制部署
./scripts/deploy/deploy-tenant.sh config/tenants/test_tenant_alpha.yml \
  --force

# 方案3: 清理错误状态
psql -h localhost -U postgres -d deployment_state \
  -c "UPDATE deployments SET status = 'failed', error_message = 'Manual cleanup' WHERE tenant_id = 'test_tenant_alpha' AND status = 'in_progress';"
```

### 问题3: 部署回滚失败

**症状**:
```
Error: Rollback failed
Unable to restore from backup
```

**诊断步骤**:
```bash
# 1. 检查备份文件
ls -la /opt/opclaw/backups/ | tail -5

# 2. 验证备份完整性
./scripts/backup/verify-backup.sh \
  --path /opt/opclaw/backups/$(ls -t /opt/opclaw/backups | head -1)

# 3. 检查回滚日志
./scripts/deploy/rollback-tenant.sh --dry-run --tenant test_tenant_alpha

# 4. 检查磁盘空间
df -h /opt/opclaw/backups
```

**解决方案**:
```bash
# 方案1: 手动回滚数据库
gunzip -c /opt/opclaw/backups/latest/database/opclaw_full.sql.gz | \
  docker exec -i opclaw-postgres psql -U opclaw -d opclaw

# 方案2: 手动回滚代码
cd /opt/opclaw/platform/backend
git reset --hard HEAD~1

# 方案3: 手动回滚配置
cp /opt/opclaw/backups/latest/config/.env.production \
   /opt/opclaw/platform/backend/.env.production
docker restart opclaw-backend

# 方案4: 使用更早的备份
# 找到更早的稳定备份
ls -lt /opt/opclaw/backups/ | head -10
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

# 4. 检查特定层级
./scripts/monitoring/health-check-layer3.sh --verbose
```

**解决方案**:
```bash
# 方案1: 重启容器
docker restart opclaw-backend opclaw-postgres

# 方案2: 检查数据库连接
docker exec opclaw-postgres psql -U opclaw -d opclaw -c "SELECT 1"

# 方案3: 检查配置
docker exec opclaw-backend env | grep -E "DATABASE_URL|DB_"

# 方案4: 查看详细错误
docker logs opclaw-backend --tail 200 | grep -i error
```

### 问题5: 脚本执行超时

**症状**:
```
Error: Script execution timeout
Deployment timed out after 1800 seconds
```

**诊断步骤**:
```bash
# 1. 检查脚本执行时间
time ./scripts/deploy/deploy-tenant.sh config/tenants/test_tenant_alpha.yml

# 2. 检查网络连接
ping -c 3 118.25.0.190
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 "echo 'OK'"

# 3. 检查磁盘I/O
iostat -x 1 5

# 4. 检查系统负载
uptime
top -bn1 | head -20
```

**解决方案**:
```bash
# 方案1: 增加超时时间
export TIMEOUT=3600  # 60分钟
./scripts/deploy/deploy-tenant.sh config/tenants/test_tenant_alpha.yml

# 方案2: 分步部署
./scripts/deploy/deploy-tenant.sh config/tenants/test_tenant_alpha.yml \
  --component backend

# 等待完成后
./scripts/deploy/deploy-tenant.sh config/tenants/test_tenant_alpha.yml \
  --component frontend

# 方案3: 使用本地部署
./scripts/deploy/deploy-local.sh config/tenants/test_tenant_alpha.yml
```

---

## 本地部署问题

### 问题1: Docker镜像构建失败

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

# 4. 手动测试构建
cd platform/backend
docker build -t test-build .
```

**解决方案**:
```bash
# 方案1: 清理Docker缓存
docker system prune -af

# 方案2: 重新构建
docker-compose build --no-cache backend

# 方案3: 检查Dockerfile语法
docker build --check -f platform/backend/Dockerfile platform/backend/

# 方案4: 增加构建资源
# 修改Docker daemon配置
sudo vim /etc/docker/daemon.json
# 添加: {"max-memory": "4g", "max-cpus": 2}
sudo systemctl restart docker
```

### 问题2: 文件传输失败

**症状**:
```
Error: File transfer failed
rsync: connection refused
```

**诊断步骤**:
```bash
# 1. 测试SSH连接
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 "echo 'OK'"

# 2. 测试rsync
rsync --dry-run -avz -e "ssh -i ~/.ssh/rap001_opclaw" \
  /tmp/test/ root@118.25.0.190:/tmp/test/

# 3. 检查网络连接
ping -c 3 118.25.0.190
nc -zv 118.25.0.190 22

# 4. 检查磁盘空间
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 "df -h"
```

**解决方案**:
```bash
# 方案1: 修复SSH连接
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 "echo 'OK'"

# 方案2: 分批传输
# 传输小文件
rsync -avz -e "ssh -i ~/.ssh/rap001_opclaw" \
  config/ root@118.25.0.190:/tmp/config/

# 传输大文件
rsync -avz --progress -e "ssh -i ~/.ssh/rap001_opclaw" \
  images/ root@118.25.0.190:/tmp/images/

# 方案3: 使用压缩传输
rsync -avzz -e "ssh -i ~/.ssh/rap001_opclaw" \
  /tmp/source/ root@118.25.0.190:/tmp/dest/

# 方案4: 检查防火墙
# 在目标服务器上
sudo ufw allow from <your-ip> to any port 22
```

### 问题3: 远程构建失败

**症状**:
```
Error: Remote build failed
Docker not available on remote server
```

**诊断步骤**:
```bash
# 1. 检查远程Docker
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 "docker --version"

# 2. 检查Docker守护进程
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 "docker info"

# 3. 检查构建上下文
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 "ls -la /tmp/build/"

# 4. 检查远程日志
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 "docker logs opclaw-backend-build"
```

**解决方案**:
```bash
# 方案1: 安装Docker
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 \
  "curl -fsSL https://get.docker.com | sh"

# 方案2: 使用本地构建
./scripts/deploy/deploy-local.sh config/tenants/test_tenant_alpha.yml

# 方案3: 传输预构建镜像
# 本地构建
docker build -t opclaw-backend platform/backend/

# 保存镜像
docker save opclaw-backend | gzip > opclaw-backend.tar.gz

# 传输镜像
scp -i ~/.ssh/rap001_opclaw opclaw-backend.tar.gz \
  root@118.25.0.190:/tmp/

# 加载镜像
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 \
  "docker load < /tmp/opclaw-backend.tar.gz"
```

---

## GitHub Actions问题

### 问题1: 工作流不显示

**症状**:
- GitHub Actions不显示工作流
- 无法手动触发工作流

**诊断步骤**:
```bash
# 1. 检查工作流文件
yq eval 'true' .github/workflows/deploy-tenant.yml

# 2. 检查文件路径
ls -la .github/workflows/

# 3. 检查文件权限
ls -la .github/workflows/*.yml

# 4. 验证YAML语法
yq eval '.on.workflow_dispatch' .github/workflows/deploy-tenant.yml
```

**解决方案**:
```bash
# 方案1: 确保工作流文件在正确的位置
# .github/workflows/*.yml 或 .github/workflows/*.yaml

# 方案2: 检查工作流文件语法
# 必须包含 on: workflow_dispatch

# 方案3: 提交并推送
git add .github/workflows/
git commit -m "Fix workflow files"
git push

# 方案4: 检查仓库设置
# GitHub UI → Settings → Actions → General
# 确保Actions已启用
```

### 问题2: 租户选择器为空

**症状**:
- 租户下拉菜单为空
- 无法选择租户

**诊断步骤**:
```bash
# 1. 检查租户配置文件
ls -la config/tenants/*.yml

# 2. 检查populate-tenants.sh
./scripts/ci/populate-tenants.sh --dry-run

# 3. 检查工作流文件
grep -A 20 "tenant:" .github/workflows/deploy-tenant.yml

# 4. 手动运行脚本
bash -x ./scripts/ci/populate-tenants.sh
```

**解决方案**:
```bash
# 方案1: 重新运行填充脚本
./scripts/ci/populate-tenants.sh

# 方案2: 手动更新工作流文件
vim .github/workflows/deploy-tenant.yml
# 在options下添加租户列表

# 方案3: 检查脚本权限
chmod +x scripts/ci/populate-tenants.sh

# 方案4: 提交更改
git add .github/workflows/deploy-tenant.yml scripts/ci/
git commit -m "Update tenant list"
git push
```

### 问题3: SSH连接失败

**症状**:
```
Error: SSH connection failed
Permission denied (publickey)
```

**诊断步骤**:
```bash
# 1. 检查Secrets
gh secret list

# 2. 验证SSH密钥格式
echo $SSH_PRIVATE_KEY | head -1
# 应该显示: -----BEGIN OPENSSH PRIVATE KEY-----

# 3. 测试SSH连接
ssh -i <(echo "$SSH_PRIVATE_KEY") root@118.25.0.190 "echo 'OK'"

# 4. 检查GitHub Actions日志
gh run view --log
```

**解决方案**:
```bash
# 方案1: 重新生成SSH密钥
ssh-keygen -t ed25519 -a 100 -C "github-actions" -f ~/.ssh/github_actions_key

# 方案2: 更新GitHub Secrets
gh secret set SSH_PRIVATE_KEY < ~/.ssh/github_actions_key

# 方案3: 部署公钥到服务器
ssh-copy-id -i ~/.ssh/github_actions_key.pub root@118.25.0.190

# 方案4: 测试连接
ssh -i ~/.ssh/github_actions_key root@118.25.0.190 "echo 'OK'"
```

### 问题4: 作业超时

**症状**:
```
Error: Job timed out
The workflow was taking too long
```

**诊断步骤**:
```bash
# 1. 检查作业配置
grep -A 5 "timeout-minutes" .github/workflows/deploy-tenant.yml

# 2. 查看执行时间
gh run list --workflow=deploy-tenant.yml --json databaseId,conclusion,createdAt,updatedAt

# 3. 查看详细日志
gh run view --log-failed

# 4. 分析瓶颈
# 检查哪个作业耗时最长
```

**解决方案**:
```yaml
# 方案1: 增加超时时间
jobs:
  deploy:
    timeout-minutes: 60  # 增加到60分钟

# 方案2: 优化作业流程
# 使用并行策略
strategy:
  matrix:
    component: ['backend', 'frontend']
  max-parallel: 2

# 方案3: 使用缓存
- uses: actions/cache@v3
  with:
    path: /tmp/.buildx-cache
    key: ${{ runner.os }}-buildx-${{ github.sha }}

# 方案4: 分步部署
# 拆分长时间作业为多个短作业
```

---

## 安全检查问题

### 问题1: 配置安全检查失败

**症状**:
```
Error: Config security check failed
Placeholder value detected
```

**诊断步骤**:
```bash
# 1. 运行详细检查
./scripts/security/check-config-security.sh \
  config/tenants/test_tenant_alpha.yml --verbose

# 2. 查看具体问题
./scripts/security/check-config-security.sh \
  config/tenants/test_tenant_alpha.yml | grep "ERROR"

# 3. 手动检查配置
grep -E '(cli_xxxxxxxxxxxxx|CHANGE_THIS|your_)' \
  config/tenants/test_tenant_alpha.yml
```

**解决方案**:
```bash
# 方案1: 替换Placeholder值
# 编辑配置文件
vim config/tenants/test_tenant_alpha.yml
# 替换所有 cli_xxxxxxxxxxxxx 为实际值

# 方案2: 使用环境变量
# 修改配置文件
# database:
#   password: "${DB_PASSWORD}"

# 导出环境变量
export DB_PASSWORD="secure_password_123"

# 方案3: 生成安全值
# 生成随机密码
openssl rand -base64 32

# 生成JWT密钥
openssl rand -base64 64
```

### 问题2: 密钥强度检查失败

**症状**:
```
Error: Secret strength check failed
Password too short: 8 < 16
```

**诊断步骤**:
```bash
# 1. 检查密钥长度
yq eval '.database.password' config/tenants/test_tenant_alpha.yml | wc -c

# 2. 检查密钥熵值
./scripts/security/check-secret-strength.sh \
  config/tenants/test_tenant_alpha.yml --entropy

# 3. 检查密钥复杂度
./scripts/security/check-secret-strength.sh \
  config/tenants/test_tenant_alpha.yml --complexity
```

**解决方案**:
```bash
# 方案1: 生成强密码
openssl rand -base64 32
# 输出: SGVsbG8gV29ybGQhIFRoaXMgaXMgYSByYW5kb20gcGFzc3dvcmQu

# 方案2: 生成JWT密钥
openssl rand -base64 64
# 输出: SGVsbG8gV29ybGQhIFRoaXMgaXMgYSByYW5kb20gSldUIHNlY3JldC4=

# 方案3: 使用密码管理器
# 使用 LastPass, 1Password 等生成强密码

# 方案4: 更新配置文件
vim config/tenants/test_tenant_alpha.yml
# 替换密钥为生成的强密钥
```

### 问题3: 文件权限检查失败

**症状**:
```
Error: File permission check failed
Config file permissions: 644 (expected: 600)
```

**诊断步骤**:
```bash
# 1. 检查文件权限
ls -la config/tenants/test_tenant_alpha.yml

# 2. 检查目录权限
ls -la config/tenants/

# 3. 检查文件所有权
stat config/tenants/test_tenant_alpha.yml

# 4. 检查SSH密钥权限
ls -la ~/.ssh/rap001_opclaw*
```

**解决方案**:
```bash
# 方案1: 修复配置文件权限
chmod 600 config/tenants/test_tenant_alpha.yml

# 方案2: 修复SSH密钥权限
chmod 600 ~/.ssh/rap001_opclaw
chmod 644 ~/.ssh/rap001_opclaw.pub

# 方案3: 修复目录权限
chmod 700 config/tenants/

# 方案4: 修复所有权
chown $USER:$USER config/tenants/test_tenant_alpha.yml
chown $USER:$USER ~/.ssh/rap001_opclaw*
```

### 问题4: 日志扫描发现异常

**症状**:
```
Warning: Log scan detected anomalies
Failed login attempts: 50
```

**诊断步骤**:
```bash
# 1. 查看详细日志
./scripts/security/scan-logs.sh /var/log/opclaw/deployment.log --verbose

# 2. 检查SSH日志
grep "Failed password" /var/log/auth.log | tail -20

# 3. 检查异常来源
grep "Failed password" /var/log/auth.log | awk '{print $(NF-3)}' | sort | uniq -c

# 4. 检查时间范围
grep "Failed password" /var/log/auth.log | grep "$(date +%Y-%m-%d)"
```

**解决方案**:
```bash
# 方案1: 封禁恶意IP
# 添加到hosts.deny
echo "ALL: <malicious_ip>" >> /etc/hosts.deny

# 方案2: 配置fail2ban
# 安装fail2ban
sudo apt-get install fail2ban

# 配置fail2ban
sudo vim /etc/fail2ban/jail.local
[sshd]
enabled = true
bantime = 3600
findtime = 600
maxretry = 5

# 重启fail2ban
sudo systemctl restart fail2ban

# 方案3: 使用SSH密钥认证
# 禁用密码认证
sudo vim /etc/ssh/sshd_config
PasswordAuthentication no
sudo systemctl restart sshd

# 方案4: 监控和告警
# 配置实时监控
tail -f /var/log/auth.log | grep --line-buffered "Failed" | \
  while read line; do
    echo "[$(date)] $line" | mail -s "SSH登录失败" admin@aiopclaw.com
  done
```

---

## 配置问题

### 问题1: 环境变量未扩展

**症状**:
```
Error: Environment variable not expanded
${DB_PASSWORD} literal value in config
```

**诊断步骤**:
```bash
# 1. 检查环境变量
echo ${DB_PASSWORD:-undefined}

# 2. 检查.env文件
cat .env.production | grep DB_PASSWORD

# 3. 测试配置加载
./scripts/lib/config.sh test --config config/tenants/test_tenant_alpha.yml

# 4. 检查导出状态
export | grep DB_PASSWORD
```

**解决方案**:
```bash
# 方案1: 导出环境变量
export DB_PASSWORD="secure_password_123"
export JWT_SECRET="your_jwt_secret_here"

# 方案2: 使用.env文件
echo "DB_PASSWORD=secure_password_123" >> .env.production
echo "JWT_SECRET=your_jwt_secret_here" >> .env.production

# 方案3: 在配置中使用默认值
# database:
#   password: "${DB_PASSWORD:-defaultPassword123}"

# 方案4: 使用direnv
# 安装direnv
brew install direnv

# 配置direnv
echo 'eval "$(direnv hook bash)"' >> ~/.bashrc
echo "export DB_PASSWORD=secure_password_123" > .envrc
direnv allow
```

### 问题2: 配置验证失败

**症状**:
```
Error: Configuration validation failed
Required field missing: tenant.id
```

**诊断步骤**:
```bash
# 1. 运行验证脚本
./scripts/config/validate-config.sh config/tenants/test_tenant_alpha.yml

# 2. 检查Schema
yq eval '.' config/tenants/test_tenant_alpha.yml | head -50

# 3. 对比模板
diff config/tenants/template.yml config/tenants/test_tenant_alpha.yml

# 4. 查看Schema定义
cat config/tenants/schema.json | jq '.required'
```

**解决方案**:
```bash
# 方案1: 添加缺失字段
vim config/tenants/test_tenant_alpha.yml
# 添加缺失的字段

# 方案2: 从模板重新生成
cp config/tenants/template.yml config/tenants/test_tenant_alpha.yml
# 然后填写具体值

# 方案3: 使用生成脚本
./scripts/config/generate-config.sh \
  --template config/tenants/template.yml \
  --output config/tenants/test_tenant_alpha.yml

# 方案4: 验证JSON Schema
yq eval '.' config/tenants/test_tenant_alpha.yml | \
  jq -f config/tenants/schema.json
```

---

## 网络问题

### 问题1: SSH连接超时

**症状**:
```
Error: SSH connection timeout
Connection timeout
```

**诊断步骤**:
```bash
# 1. 测试网络连通性
ping -c 3 118.25.0.190

# 2. 测试SSH端口
nc -zv 118.25.0.190 22

# 3. 测试SSH连接
ssh -v -i ~/.ssh/rap001_opclaw root@118.25.0.190 "echo 'OK'"

# 4. 检查防火墙
sudo iptables -L -n | grep 22
```

**解决方案**:
```bash
# 方案1: 增加SSH超时时间
ssh -o ConnectTimeout=30 -i ~/.ssh/rap001_opclaw root@118.25.0.190 "echo 'OK'"

# 方案2: 检查路由
traceroute 118.25.0.190

# 方案3: 检查DNS
nslookup 118.25.0.190

# 方案4: 检查服务器SSH配置
# 在服务器上
sudo vim /etc/ssh/sshd_config
# 确保以下配置正确:
# Port 22
# ListenAddress 0.0.0.0
# PermitRootLogin yes
sudo systemctl restart sshd
```

### 问题2: rsync传输失败

**症状**:
```
Error: rsync transfer failed
rsync: connection refused
```

**诊断步骤**:
```bash
# 1. 测试rsync
rsync --dry-run -avz -e "ssh -i ~/.ssh/rap001_opclaw" \
  /tmp/test/ root@118.25.0.190:/tmp/test/

# 2. 检查磁盘空间
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 "df -h"

# 3. 检查inodes
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 "df -i"

# 4. 测试网络带宽
iperf3 -c 118.25.0.190
```

**解决方案**:
```bash
# 方案1: 使用压缩传输
rsync -avzz -e "ssh -i ~/.ssh/rap001_opclaw" \
  /tmp/source/ root@118.25.0.190:/tmp/dest/

# 方案2: 分批传输
# 传输小文件
rsync -avz -e "ssh -i ~/.ssh/rap001_opclaw" \
  --max-size=10M /tmp/source/ root@118.25.0.190:/tmp/dest/

# 传输大文件
rsync -avz -e "ssh -i ~/.ssh/rap001_opclaw" \
  --min-size=10M /tmp/source/ root@118.25.0.190:/tmp/dest/

# 方案3: 清理磁盘空间
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 \
  "rm -rf /tmp/old_files/*"

# 方案4: 使用限速
rsync -avz --bwlimit=10M -e "ssh -i ~/.ssh/rap001_opclaw" \
  /tmp/source/ root@118.25.0.190:/tmp/dest/
```

---

## 性能问题

### 问题1: 部署速度慢

**症状**:
```
Warning: Deployment taking longer than expected
Deployment time: 45 minutes (expected: 15 minutes)
```

**诊断步骤**:
```bash
# 1. 测量各个步骤时间
time ./scripts/deploy/deploy-tenant.sh config/tenants/test_tenant_alpha.yml

# 2. 检查网络速度
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 "iperf3 -s"
iperf3 -c 118.25.0.190

# 3. 检查磁盘I/O
iostat -x 1 5

# 4. 检查CPU使用
top -bn1 | head -20
```

**解决方案**:
```bash
# 方案1: 使用并行部署
./scripts/deploy/deploy-local.sh config/tenants/test_tenant_alpha.yml \
  --component backend &
./scripts/deploy/deploy-local.sh config/tenants/test_tenant_alpha.yml \
  --component frontend &

# 方案2: 跳过备份（非生产环境）
./scripts/deploy/deploy-tenant.sh config/tenants/test_tenant_alpha.yml \
  --skip-backup

# 方案3: 跳过健康检查（谨慎使用）
./scripts/deploy/deploy-tenant.sh config/tenants/test_tenant_alpha.yml \
  --skip-health-check

# 方案4: 使用本地缓存
# 使用Docker构建缓存
docker build --cache-from=opclaw-backend:latest \
  -t opclaw-backend platform/backend/
```

### 问题2: 内存不足

**症状**:
```
Error: Out of memory
Cannot allocate memory
```

**诊断步骤**:
```bash
# 1. 检查内存使用
free -h

# 2. 检查Docker内存限制
docker system info | grep memory

# 3. 检查进程内存使用
ps aux --sort=-%mem | head -20

# 4. 检查容器内存使用
docker stats --no-stream
```

**解决方案**:
```bash
# 方案1: 增加交换空间
sudo dd if=/dev/zero of=/swapfile bs=1G count=4
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# 方案2: 清理Docker缓存
docker system prune -af

# 方案3: 限制容器内存
docker run -m 512m opclaw-backend

# 方案4: 增加系统内存
# 升级服务器配置或添加更多RAM
```

---

## 诊断工具

### 综合诊断脚本

```bash
#!/bin/bash
# scripts/diagnostics/deployment-diagnostic.sh

echo "==================================="
echo "AIOpc 部署诊断"
echo "==================================="

# 1. 系统信息
echo ""
echo ">>> 系统信息"
echo "---"
uname -a
df -h
uptime

# 2. Docker状态
echo ""
echo ">>> Docker状态"
echo "---"
docker ps -a | grep opclaw

# 3. 容器健康检查
echo ""
echo ">>> 容器健康检查"
echo "---"
for container in opclaw-backend opclaw-postgres opclaw-redis; do
    echo -n "$container: "
    if docker inspect $container | grep -q '"Status": "up"'; then
        echo "✓ Running"
    else
        echo "✗ Not running"
    fi
done

# 4. 网络连接
echo ""
echo ">>> 网络连接"
echo "---"
ping -c 1 118.25.0.190 > /dev/null 2>&1 && echo "✓ 网络可达" || echo "✗ 网络不可达"

# 5. SSH连接
echo ""
echo ">>> SSH连接"
echo "---"
ssh -i ~/.ssh/rap001_opclaw -o ConnectTimeout=5 -o StrictHostKeyChecking=no \
    root@118.25.0.190 "echo '✓ SSH连接成功'" || echo "✗ SSH连接失败"

# 6. 磁盘空间
echo ""
echo ">>> 磁盘空间"
echo "---"
df -h | grep -E "Filesystem|/opt|/var|/tmp"

# 7. 日志检查
echo ""
echo ">>> 最近错误日志"
echo "---"
docker logs opclaw-backend --tail 20 | grep -i error || echo "No recent errors"
docker logs opclaw-postgres --tail 20 | grep -i error || echo "No recent errors"

# 8. 配置检查
echo ""
echo ">>> 配置文件"
echo "---"
ls -la config/tenants/*.yml 2>/dev/null || echo "✗ 配置文件不存在"

# 9. 部署历史
echo ""
echo ">>> 最近部署"
echo "---"
psql -h localhost -U postgres -d deployment_state \
    -c "SELECT deployment_time, tenant_id, status FROM deployments ORDER BY deployment_time DESC LIMIT 5;" 2>/dev/null || echo "✗ 无法连接数据库"

echo ""
echo "==================================="
echo "诊断完成"
echo "==================================="
```

### 快速诊断命令

```bash
# 健康检查
./scripts/monitoring/enhanced-health-check.sh

# 配置验证
./scripts/config/validate-config.sh config/tenants/*.yml

# 安全检查
./scripts/security/security-check-suite.sh

# 配置漂移检测
./scripts/monitoring/detect-config-drift.sh --all-tenants

# 日志扫描
./scripts/security/scan-logs.sh /var/log/opclaw/
```

---

## 附录

### 常用命令参考

```bash
# 部署相关
./scripts/deploy/deploy-tenant.sh <config_file> [options]
./scripts/deploy/deploy-local.sh <config_file> [options]
./scripts/deploy/rollback-tenant.sh <tenant_id> [options]

# 检查相关
./scripts/monitoring/enhanced-health-check.sh
./scripts/config/validate-config.sh <config_file>
./scripts/security/security-check-suite.sh

# 诊断相关
./scripts/diagnostics/deployment-diagnostic.sh
./scripts/security/scan-logs.sh <log_file>
./scripts/monitoring/detect-config-drift.sh --tenant <tenant_id>
```

### 相关文档

- [Phase 2 实施总结](../implementation/phase2-summary.md)
- [部署脚本使用指南](../operations/deployment-script-guide.md)
- [GitHub Actions 配置指南](../operations/github-actions-config.md)
- [部署安全最佳实践](../security/deployment-security.md)

---

**文档版本**: 1.0.0
**最后更新**: 2026-03-19
**维护者**: AIOpc DevOps Team
