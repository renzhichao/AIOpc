# AIOpc 本地部署指南

## 1. 部署前准备

### 1.1 硬件要求

**服务器配置（推荐）**：

| 服务器 | CPU | 内存 | 存储 | 网络 |
|--------|-----|------|------|------|
| Server 1 | 8核+ | 16GB+ | 500GB SSD | 千兆 |
| Server 2 | 8核+ | 16GB+ | 500GB SSD | 千兆 |
| Server 3 | 8核+ | 16GB+ | 500GB SSD | 千兆 |
| Server 4 | 16核+ | 32GB+ | 1TB SSD | 千兆 |

**最低配置**：
- CPU: 4核
- 内存: 8GB
- 存储: 200GB SSD
- 网络: 千兆网卡

### 1.2 软件要求

**操作系统**：
- Ubuntu 22.04 LTS（推荐）
- Ubuntu 20.04 LTS
- Debian 11+
- CentOS 8+

**必需软件**（脚本会自动安装）：
- Docker 20.10+
- Docker Compose V2
- Node.js v22
- pnpm 8+

### 1.3 网络要求

**内网环境**：
- 固定内网IP地址
- 千兆网络交换机
- 服务器间互通

**外网访问**（可选）：
- VPN服务器（WireGuard/OpenVPN）
- 或公网IP + 端口转发
- 或内网穿透服务

## 2. 快速部署

### 2.1 自动化部署（推荐）

**步骤**：

1. **下载部署脚本**
```bash
# 克隆项目
git clone https://github.com/your-org/AIOpc.git
cd AIOpc

# 或者仅下载脚本
wget https://raw.githubusercontent.com/your-org/AIOpc/main/scripts/deploy-local.sh
chmod +x deploy-local.sh
```

2. **执行部署**
```bash
# 使用root权限执行
sudo ./deploy-local.sh
```

3. **配置环境变量**
```bash
# 编辑配置文件
sudo vi /etc/opclaw/.env

# 必填项：
# - DEEPSEEK_API_KEY
# - FEISHU_APP_ID
# - FEISHU_APP_SECRET
```

4. **重启服务**
```bash
sudo docker restart opclaw-agent
```

**部署完成后**：
- API: http://<内网IP>:3000
- Web界面: https://<内网IP>
- Prometheus: http://<内网IP>:9090
- Grafana: http://<内网IP>:3001

### 2.2 手动部署

如需更细粒度的控制，可以手动部署各个组件。

#### 2.2.1 安装Docker

**Ubuntu/Debian**：
```bash
# 更新包索引
sudo apt-get update

# 安装依赖
sudo apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

# 添加Docker官方GPG密钥
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# 设置仓库
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# 安装Docker
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# 启动Docker
sudo systemctl start docker
sudo systemctl enable docker
```

**CentOS/RHEL**：
```bash
# 安装依赖
sudo yum install -y yum-utils

# 添加Docker仓库
sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo

# 安装Docker
sudo yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# 启动Docker
sudo systemctl start docker
sudo systemctl enable docker
```

#### 2.2.2 部署PostgreSQL

```bash
# 创建数据目录
sudo mkdir -p /var/lib/opclaw/postgres

# 启动PostgreSQL容器
sudo docker run -d \
    --name opclaw-postgres \
    --restart unless-stopped \
    -e POSTGRES_DB=opclaw \
    -e POSTGRES_USER=opclaw \
    -e POSTGRES_PASSWORD=your_password \
    -v /var/lib/opclaw/postgres:/var/lib/postgresql/data \
    -p 5432:5432 \
    postgres:14-alpine

# 验证
sudo docker ps | grep opclaw-postgres
sudo docker logs -f opclaw-postgres
```

#### 2.2.3 部署Redis

```bash
# 创建数据目录
sudo mkdir -p /var/lib/opclaw/redis

# 启动Redis容器
sudo docker run -d \
    --name opclaw-redis \
    --restart unless-stopped \
    -v /var/lib/opclaw/redis:/data \
    -p 6379:6379 \
    redis:7-alpine \
    redis-server --requirepass your_password

# 验证
sudo docker ps | grep opclaw-redis
```

#### 2.2.4 部署OpenClaw Agent

```bash
# 克隆OpenClaw仓库
git clone https://github.com/your-org/opclaw.git /opt/opclaw
cd /opt/opclaw

# 安装Node.js v22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装pnpm
npm install -g pnpm

# 安装依赖
pnpm install

# 配置环境变量
cat > .env << EOF
DEEPSEEK_API_KEY=your_api_key
DEEPSEEK_API_BASE=https://api.deepseek.com
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=opclaw
POSTGRES_USER=opclaw
POSTGRES_PASSWORD=your_password
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password
EOF

# 构建并运行
pnpm run build
pnpm start
```

#### 2.2.5 部署Nginx

```bash
# 创建Nginx配置
sudo mkdir -p /etc/opclaw/nginx
cat > /etc/opclaw/nginx/nginx.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    upstream agent_cluster {
        server 127.0.0.1:3000;
    }

    server {
        listen 443 ssl;
        server_name aiopoc.internal;

        ssl_certificate /etc/opclaw/nginx/ssl/internal.crt;
        ssl_certificate_key /etc/opclaw/nginx/ssl/internal.key;

        location / {
            proxy_pass http://agent_cluster;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }
    }
}
EOF

# 生成自签名证书
sudo mkdir -p /etc/opclaw/nginx/ssl
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/opclaw/nginx/ssl/internal.key \
    -out /etc/opclaw/nginx/ssl/internal.crt \
    -subj "/C=CN/ST=State/L=City/O=Organization/CN=aiopoc.internal"

# 启动Nginx
sudo docker run -d \
    --name opclaw-nginx \
    --restart unless-stopped \
    -v /etc/opclaw/nginx/nginx.conf:/etc/nginx/nginx.conf:ro \
    -v /etc/opclaw/nginx/ssl:/etc/nginx/ssl:ro \
    -p 443:443 \
    nginx:alpine
```

## 3. VPN配置

### 3.1 WireGuard VPN（推荐）

**Server端配置**：

```bash
# 安装WireGuard
sudo apt-get install -y wireguard

# 生成密钥
sudo wg genkey | sudo tee /etc/wireguard/privatekey
sudo wg pubkey < /etc/wireguard/privatekey | sudo tee /etc/wireguard/publickey

# 创建配置文件
sudo cat > /etc/wireguard/wg0.conf << EOF
[Interface]
PrivateKey = $(cat /etc/wireguard/privatekey)
Address = 10.0.0.1/24
ListenPort = 51820

[Peer]
# Client 1
PublicKey = <客户端公钥>
AllowedIPs = 10.0.0.2/32
EOF

# 启动WireGuard
sudo wg-quick up wg0
sudo systemctl enable wg-quick@wg0

# 开放端口
sudo ufw allow 51820/udp
```

**Client端配置**：

```bash
# 安装WireGuard
sudo apt-get install -y wireguard

# 生成密钥
wg genkey | sudo tee /etc/wireguard/privatekey
wg pubkey < /etc/wireguard/privatekey | sudo tee /etc/wireguard/publickey

# 创建配置文件
sudo cat > /etc/wireguard/wg0.conf << EOF
[Interface]
PrivateKey = <客户端私钥>
Address = 10.0.0.2/24
DNS = 8.8.8.8

[Peer]
PublicKey = <服务器公钥>
Endpoint = <服务器公网IP>:51820
AllowedIPs = 10.0.0.0/24, 192.168.1.0/24
PersistentKeepalive = 25
EOF

# 启动WireGuard
sudo wg-quick up wg0
```

### 3.2 OpenVPN（备选）

使用OpenVPN的Docker部署：

```bash
# 启动OpenVPN服务器
sudo docker run -d \
    --name openvpn \
    --restart unless-stopped \
    -v /etc/openvpn:/etc/openvpn \
    -p 1194:1194/udp \
    kylemanna/openvpn

# 生成客户端配置
# （略，参考OpenVPN文档）
```

## 4. 飞书集成配置

### 4.1 内网环境下的飞书集成

由于是内网环境，飞书无法直接访问内网Webhook，有以下几种方案：

#### 方案1：内网穿透（测试用）

使用frp或ngrok：

```bash
# 安装frp客户端
wget https://github.com/fatedier/frp/releases/download/v0.52.0/frp_0.52.0_linux_amd64.tar.gz
tar -xzf frp_0.52.0_linux_amd64.tar.gz
cd frp_0.52.0_linux_amd64

# 配置frpc
cat > frpc.ini << EOF
[common]
server_addr = <VPS公网IP>
server_port = 7000

[web]
type = https
local_ip = 192.168.1.10
local_port = 443
custom_domains = aiopoc.yourdomain.com
EOF

# 启动frpc
./frpc -c frpc.ini
```

#### 方案2：主动轮询（推荐内网环境）

Agent主动向飞书拉取消息：

```javascript
// 轮询飞书消息
setInterval(async () => {
  const messages = await feishuClient.getUnreadMessages();

  for (const msg of messages) {
    await agent.process(msg);
  }
}, 5000); // 每5秒轮询一次
```

#### 方案3：企业内部IM（最佳方案）

使用企业内部IM系统替代飞书：
- 企业微信（可本地部署）
- 钉钉（可本地部署）
- 自建IM系统

### 4.2 配置飞书应用

1. **创建应用**
   - 登录飞书开放平台
   - 创建企业自建应用
   - 获取App ID和App Secret

2. **配置权限**
   - 消息接收权限
   - 消息发送权限
   - 用户信息读取权限

3. **配置Webhook**（如使用内网穿透）
   - URL: https://aiopoc.yourdomain.com/feishu/events
   - 验证Token: 自定义token
   - 加密Key: 自动生成

4. **发布应用**
   - 发布到企业工作台
   - 分配给相关部门

## 5. 监控配置

### 5.1 Prometheus监控

**配置Prometheus**：

```yaml
# /etc/prometheus/prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'opclaw'
    static_configs:
      - targets: ['localhost:3000']

  - job_name: 'postgres'
    static_configs:
      - targets: ['localhost:9187']

  - job_name: 'redis'
    static_configs:
      - targets: ['localhost:9121']
```

### 5.2 Grafana可视化

**导入仪表板**：

1. 访问Grafana: http://<内网IP>:3001
2. 登录（默认admin/admin）
3. 添加Prometheus数据源
4. 导入OpenClaw仪表板（JSON文件）

### 5.3 告警配置

**Alertmanager配置**：

```yaml
# alertmanager.yml
global:
  resolve_timeout: 5m

route:
  group_by: ['alertname']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 1h
  receiver: 'webhook'

receivers:
  - name: 'webhook'
    webhook_configs:
      - url: 'http://localhost:3000/alerts'
```

## 6. 备份配置

### 6.1 数据库备份

**自动备份脚本**：

```bash
#!/bin/bash
# /usr/local/bin/backup-postgres.sh

BACKUP_DIR="/backup/postgres"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# 备份PostgreSQL
docker exec opclaw-postgres pg_dump -U opclaw opclaw | gzip > $BACKUP_DIR/opclaw_$DATE.sql.gz

# 保留最近7天的备份
find $BACKUP_DIR -name "opclaw_*.sql.gz" -mtime +7 -delete

echo "Backup completed: opclaw_$DATE.sql.gz"
```

**配置定时任务**：

```bash
# 添加到crontab
crontab -e

# 每天凌晨2点备份
0 2 * * * /usr/local/bin/backup-postgres.sh >> /var/log/backup.log 2>&1
```

### 6.2 配置文件备份

```bash
# 备份配置文件
tar -czf /backup/config_$(date +%Y%m%d).tar.gz /etc/opclaw

# 推送到远程仓库（可选）
cd /etc/opclaw
git add .
git commit -m "Backup $(date +%Y%m%d)"
git push origin main
```

## 7. 故障排查

### 7.1 常见问题

**问题1：Docker容器无法启动**
```bash
# 查看容器日志
sudo docker logs <container_name>

# 检查容器状态
sudo docker ps -a

# 重启容器
sudo docker restart <container_name>
```

**问题2：无法访问数据库**
```bash
# 检查数据库容器
sudo docker ps | grep postgres

# 测试连接
sudo docker exec -it opclaw-postgres psql -U opclaw -d opclaw

# 检查网络
sudo docker network inspect bridge
```

**问题3：VPN连接失败**
```bash
# 检查WireGuard状态
sudo wg show

# 查看日志
sudo journalctl -u wg-quick@wg0 -f

# 检查端口
sudo netstat -tuln | grep 51820
```

**问题4：Agent响应慢**
```bash
# 检查资源使用
top
htop

# 检查Agent日志
sudo docker logs -f opclaw-agent

# 检查数据库性能
sudo docker exec opclaw-postgres psql -U opclaw -d opclaw -c "SELECT * FROM pg_stat_activity;"
```

### 7.2 日志位置

| 服务 | 日志位置 |
|------|----------|
| OpenClaw Agent | /var/log/opclaw/ |
| Nginx | docker logs opclaw-nginx |
| PostgreSQL | docker logs opclaw-postgres |
| Redis | docker logs opclaw-redis |
| 系统日志 | /var/log/syslog |

## 8. 安全加固

### 8.1 系统安全

```bash
# 更新系统
sudo apt-get update && sudo apt-get upgrade -y

# 配置防火墙
sudo ufw enable
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from 192.168.0.0/16  # 允许内网访问
sudo ufw allow 22/tcp  # SSH

# 禁用root远程登录
sudo sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl restart sshd
```

### 8.2 应用安全

```bash
# 修改默认密码
sudo docker exec -it opclaw-postgres psql -U opclaw -d opclaw -c "ALTER USER opclaw WITH PASSWORD 'strong_password';"

# 配置SSL/TLS
# （使用Let's Encrypt或自签名证书）

# 限制数据库访问
# 编辑pg_hba.conf，仅允许本地访问
```

## 9. 性能优化

### 9.1 数据库优化

```sql
-- PostgreSQL配置调优
ALTER SYSTEM SET shared_buffers = '4GB';
ALTER SYSTEM SET effective_cache_size = '12GB';
ALTER SYSTEM SET maintenance_work_mem = '1GB';
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET default_statistics_target = 100;
-- 重启PostgreSQL
```

### 9.2 Redis优化

```bash
# Redis配置优化
# /etc/redis/redis.conf
maxmemory 2gb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
```

### 9.3 Agent优化

```javascript
// 配置缓存
const cacheConfig = {
  enabled: true,
  ttl: 3600,  // 1小时
  maxSize: 1000
};

// 连接池配置
const poolConfig = {
  min: 2,
  max: 10,
  acquireTimeoutMillis: 30000
};
```

## 10. 维护手册

### 10.1 日常维护

**每日任务**：
- 检查服务状态
- 查看错误日志
- 监控资源使用

**每周任务**：
- 备份验证
- 性能分析
- 安全更新检查

**每月任务**：
- 数据库清理
- 日志归档
- 容量规划

### 10.2 扩容指南

**垂直扩容**（提升单机配置）：
```bash
# 增加资源
# 停止容器
sudo docker stop opclaw-agent

# 调整配置（内存、CPU限制）
# 重新启动
sudo docker start opclaw-agent
```

**水平扩容**（增加节点）：
```bash
# 在新服务器上部署Agent
# 配置Nginx负载均衡
# 添加到upstream配置
```

## 11. 迁移指南

### 11.1 从云方案迁移到本地

1. **导出云端数据**
```bash
# 导出数据库
pg_dump -h cloud-db -U user dbname > cloud_backup.sql

# 导出配置文件
# 导出知识库
```

2. **导入到本地**
```bash
# 导入数据库
cat cloud_backup.sql | docker exec -i opclaw-postgres psql -U opclaw opclaw

# 恢复配置文件
# 恢复知识库
```

3. **切换DNS/Webhook**
```bash
# 更新飞书Webhook URL
# 更新客户端配置
```

### 11.2 备份恢复

```bash
# 恢复数据库
gunzip < /backup/postgres/opclaw_20240101.sql.gz | docker exec -i opclaw-postgres psql -U opclaw opclaw

# 恢复配置
tar -xzf /backup/config_20240101.tar.gz -C /
```

## 12. 附录

### 12.1 端口清单

| 端口 | 服务 | 说明 |
|------|------|------|
| 22 | SSH | 服务器管理 |
| 80 | HTTP | 重定向到HTTPS |
| 443 | HTTPS | API和Web界面 |
| 3000 | Agent | OpenClaw Agent API |
| 5432 | PostgreSQL | 数据库 |
| 6379 | Redis | 缓存 |
| 9090 | Prometheus | 监控 |
| 3001 | Grafana | 可视化 |
| 51820 | WireGuard | VPN |

### 12.2 目录结构

```
/opt/opclaw/          # OpenClaw安装目录
/etc/opclaw/          # 配置文件目录
/var/lib/opclaw/      # 数据目录
  ├── postgres/       # PostgreSQL数据
  ├── redis/          # Redis数据
  └── opclaw/         # Agent数据
/var/log/opclaw/      # 日志目录
/backup/              # 备份目录
  ├── postgres/       # 数据库备份
  └── config/         # 配置备份
```

### 12.3 联系支持

如有问题，请联系：
- 技术支持：[待填写]
- 问题反馈：GitHub Issues
- 文档更新：[待填写]
