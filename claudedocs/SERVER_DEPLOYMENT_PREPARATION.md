# 服务器部署准备文档

**生成日期**: 2026-03-16
**目标**: 为云端服务器部署准备所有必要配置和验证
**服务器**: 118.25.0.190 (renava.cn)

---

## 🚨 关键发现

### DNS配置问题

**当前状态**: ❌ **DNS配置错误**
- **预期**: renava.cn → 118.25.0.190
- **实际**: renava.cn → 198.18.0.32
- **问题**: 198.18.0.32是RFC 2544基准测试地址，非公网IP

**影响范围**:
- ❌ 无法通过域名访问服务器
- ❌ SSL证书申请失败（Let's Encrypt需要正确DNS）
- ❌ OAuth回调无法工作
- ❌ 用户无法访问平台

**优先级**: 🔴 **P0 CRITICAL** - 必须在部署前解决

---

## ✅ 服务器验证结果

### 网络连通性

```bash
$ ping -c 1 118.25.0.190
PING 118.25.0.190 (118.25.0.190): 56 data bytes
64 bytes from 118.25.0.190: icmp_seq=0 ttl=64 time=0.146 ms
--- 118.25.0.190 ping statistics ---
1 packets transmitted, 1 packets received, 0.0% packet loss
```

**结论**: ✅ 服务器IP可达，延迟0.146ms（正常）

### DNS解析验证

```bash
$ nslookup renava.cn
Server:		223.5.5.5
Address:	223.5.5.5#53

Name:	renava.cn
Address:	198.18.0.32
```

**结论**: ❌ DNS解析错误，指向非目标IP

---

## 🔧 立即行动项

### 1. 修复DNS配置

**操作步骤**:

1. **登录DNS服务商控制台**
   - 阿里云: https://dns.console.aliyun.com
   - 腾讯云: https://console.cloud.tencent.com/cns
   - Cloudflare: https://dash.cloudflare.com

2. **更新A记录**
   ```
   记录类型: A
   主机记录: @
   记录值: 118.25.0.190
   TTL: 600（或默认值）

   记录类型: A
   主机记录: www
   记录值: 118.25.0.190
   TTL: 600（或默认值）

   记录类型: A
   主机记录: api
   记录值: 118.25.0.190
   TTL: 600（或默认值）
   ```

3. **验证DNS更新**
   ```bash
   # 等待DNS传播（10分钟-48小时）
   watch -n 10 nslookup renava.cn

   # 或使用dig
   watch -n 10 dig renava.cn +short

   # 正确输出应该是:
   # 118.25.0.190
   ```

4. **测试本地解析**
   ```bash
   # 清理本地DNS缓存
   sudo dscacheutil -flushcache  # macOS
   sudo systemd-resolve --flush-caches  # Linux

   # 再次验证
   nslookup renava.cn
   ```

**预期结果**:
```
$ nslookup renava.cn
Server:		223.5.5.5
Address:	223.5.5.5#53

Name:	renava.cn
Address:	118.25.0.190  ✅
```

### 2. SSH连接测试

**连接命令**:
```bash
# 测试SSH连接
ssh -o ConnectTimeout=5 root@118.25.0.190 'echo "Connection successful"'

# 如果使用密钥认证
ssh -i ~/.ssh/id_rsa -o ConnectTimeout=5 root@118.25.0.190 'echo "Connection successful"'

# 如果SSH端口非默认22
ssh -p <port> -o ConnectTimeout=5 root@118.25.0.190 'echo "Connection successful"'
```

**预期输出**:
```
Connection successful
```

**如果连接失败**:
```bash
# 检查本地SSH配置
cat ~/.ssh/config

# 测试网络连通性
telnet 118.25.0.190 22

# 检查防火墙（服务器端）
ssh root@118.25.0.190 'ufw status'
ssh root@118.25.0.190 'iptables -L -n | grep 22'
```

### 3. 服务器环境检查

**上传并运行环境检查脚本**:
```bash
# 从项目根目录执行
cd /Users/arthurren/projects/AIOpc

# 上传检查脚本
scp scripts/cloud/check-environment.sh root@118.25.0.190:/root/

# SSH到服务器并运行
ssh root@118.25.0.190 'bash /root/check-environment.sh'

# 或在服务器上运行
ssh root@118.25.0.190
bash /root/check-environment.sh
```

**预期输出** (JSON格式):
```json
{
  "node": {
    "installed": true,
    "version": "22.x.x"
  },
  "pnpm": {
    "installed": true,
    "version": "9.x.x"
  },
  "docker": {
    "installed": true,
    "version": "24.x.x",
    "running": true
  },
  "postgres": {
    "installed": true,
    "version": "16.x"
  },
  "redis": {
    "installed": true,
    "running": true
  },
  "nginx": {
    "installed": true,
    "running": true
  }
}
```

---

## 📋 部署前检查清单

### Phase 1: DNS和网络配置

- [ ] **DNS A记录配置**
  - [ ] renava.cn → 118.25.0.190
  - [ ] www.renava.cn → 118.25.0.190
  - [ ] api.renava.cn → 118.25.0.190
  - [ ] DNS传播完成（nslookup验证）

- [ ] **网络连通性**
  - [ ] Ping测试成功
  - [ ] SSH连接成功
  - [ ] HTTP端口80可访问
  - [ ] HTTPS端口443可访问

### Phase 2: 服务器环境

- [ ] **系统依赖**
  - [ ] Node.js 22+ 已安装
  - [ ] pnpm 已安装
  - [ ] Docker 已安装并运行
  - [ ] Docker Compose 已安装

- [ ] **数据库和缓存**
  - [ ] PostgreSQL 16+ 已安装
  - [ ] Redis 已安装并运行
  - [ ] 数据库用户已创建
  - [ ] 数据库schema已初始化

- [ ] **Web服务器**
  - [ ] Nginx 已安装
  - [ ] Nginx 服务运行中
  - [ ] 防火墙规则已配置

### Phase 3: 应用配置

- [ ] **代码部署**
  - [ ] 后端代码已上传
  - [ ] 前端已构建并部署
  - [ ] 环境变量已配置
  - [ ] PM2 进程管理已配置

- [ ] **SSL/TLS**
  - [ ] SSL证书已申请（需要正确DNS）
  - [ ] HTTPS可访问
  - [ ] HTTP自动重定向到HTTPS

- [ ] **Docker环境**
  - [ ] openclaw/agent镜像可用
  - [ ] Docker网络已创建
  - [ ] Docker卷已创建

---

## 🚀 下一步操作

### 选项A: 立即开始部署（DNS已修复）

如果DNS已经正确配置，可以立即开始部署：

```bash
# 1. 服务器初始化
cd /Users/arthurren/projects/AIOpc/scripts/cloud
./init-server.sh

# 2. 数据库部署
./deploy-database.sh

# 3. 后端部署
./deploy-backend.sh

# 4. 前端部署
./deploy-frontend.sh

# 5. SSL配置（DNS必须正确）
./setup-ssl.sh

# 6. Docker镜像部署
# (TASK-062 待实施)

# 7. 生产环境配置
# (TASK-063 待实施)

# 8. 验收测试
# (TASK-064 待实施)
```

### 选项B: 等待DNS传播

如果刚更新DNS配置，需要等待传播：

```bash
# 监控DNS传播
watch -n 10 'nslookup renava.cn | grep Address'

# 同时可以进行服务器初始化（不依赖域名）
ssh root@118.25.0.190
# 执行服务器初始化步骤
```

### 选项C: 分步验证部署

逐步验证每个组件，确保稳定性：

```bash
# Step 1: 验证服务器环境
./scripts/cloud/check-environment.sh

# Step 2: 初始化服务器
./scripts/cloud/init-server.sh

# Step 3: 部署数据库
./scripts/cloud/deploy-database.sh
./scripts/cloud/verify-database.sh --remote

# Step 4: 部署后端
./scripts/cloud/deploy-backend.sh
./scripts/cloud/health-check.sh

# Step 5: 部署前端
./scripts/cloud/deploy-frontend.sh
./scripts/cloud/verify-frontend.sh

# Step 6: 配置SSL（需要DNS正确）
./scripts/cloud/setup-ssl.sh
./scripts/cloud/verify-ssl.sh
```

---

## ⚠️ 常见问题

### Q1: DNS传播需要多久？

**A**:
- **通常**: 10分钟 - 2小时
- **最长**: 48小时
- **本地测试**: 可以修改 `/etc/hosts` 立即生效

**本地测试方法**:
```bash
# 编辑hosts文件
sudo nano /etc/hosts

# 添加以下行
118.25.0.190 renava.cn
118.25.0.190 www.renava.cn
118.25.0.190 api.renava.cn

# 保存后立即生效，用于测试
curl https://renava.cn
```

### Q2: SSH连接超时怎么办？

**A**: 检查以下几点：
1. 确认服务器IP正确: `ping 118.25.0.190`
2. 确认SSH端口开放: `telnet 118.25.0.190 22`
3. 检查防火墙规则:
   ```bash
   ssh root@118.25.0.190 'ufw status'
   ssh root@118.25.0.190 'iptables -L -n'
   ```
4. 查看SSH日志:
   ```bash
   ssh root@118.25.0.190 'journalctl -u ssh -n 50'
   ```

### Q3: 如何验证服务器配置正确？

**A**: 运行环境检查脚本：
```bash
scp scripts/cloud/check-environment.sh root@118.25.0.190:/root/
ssh root@118.25.0.190 'bash /root/check-environment.sh --verbose'
```

---

## 📊 当前状态

| 组件 | 状态 | 说明 |
|------|------|------|
| 服务器IP | ✅ 可达 | 118.25.0.190 响应正常 |
| DNS配置 | ❌ 错误 | renava.cn → 198.18.0.32 (非目标IP) |
| SSH连接 | ⏳ 待测试 | 需要验证 |
| 服务器环境 | ⏳ 待检查 | 需要运行检查脚本 |
| 部署脚本 | ✅ 就绪 | 所有脚本已创建并测试 |

---

## 🎯 推荐行动顺序

### 立即执行 (Critical)
1. **修复DNS配置** (P0) - 联系域名管理员或登录DNS服务商控制台
2. **验证SSH连接** (P0) - 确保可以远程管理服务器
3. **检查服务器环境** (P0) - 运行环境检查脚本

### 短期执行 (Today)
4. **服务器初始化** (P1) - 安装和配置所有依赖
5. **数据库部署** (P1) - 执行迁移和schema创建
6. **应用部署** (P1) - 部署后端和前端

### 中期执行 (This Week)
7. **SSL证书** (P1) - DNS传播后立即申请
8. **Docker镜像** (P2) - TASK-062
9. **生产配置** (P2) - TASK-063
10. **验收测试** (P2) - TASK-064

---

**生成时间**: 2026-03-16
**文档版本**: 1.0
**状态**: 🟡 等待DNS修复
**下一步**: 修复DNS → 验证SSH → 开始部署
