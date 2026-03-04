# AIOpc 技术架构设计（本地部署版）

## 1. 架构变更说明

### 1.1 变更对比

| 项目 | 原方案（云为主） | 新方案（本地为主） | 优势 |
|------|-----------------|-------------------|------|
| 部署位置 | 阿里云ECS（3台） | 本地服务器（4台） | 降低80%基础设施成本 |
| Agent运行 | 云端 | 本地内网 | 数据安全性更高 |
| LLM推理 | DeepSeek API | DeepSeek API（通过公网） | 保持灵活性 |
| 数据存储 | RDS云数据库 | 本地PostgreSQL | 降低成本 |
| 访问方式 | 公网SLB | 内网/VPN | 更安全的访问 |

### 1.2 架构优势

✅ **成本优势**：基础设施成本降低80%（从¥62,400降至¥12,000/年）
✅ **数据安全**：核心数据不出内网
✅ **性能优势**：本地访问延迟更低
✅ **可扩展性**：4台服务器支持灵活配置
✅ **高可用性**：本地多节点部署

## 2. 总体架构

```
┌─────────────────────────────────────────────────────────────┐
│                        用户层                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  财务人员  │  │ 运营人员  │  │  管理层   │  │  技术人员  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↓
                    ┌───────────────┐
                    │   内网交换机   │
                    │ 192.168.1.0/24│
                    └───────┬───────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
┌───────▼────────┐  ┌───────▼────────┐  ┌──────▼─────────┐
│  本地服务器群    │  │   内网网关      │  │  本地数据库/存储 │
│                │  │                │  │                │
│ Server 1       │  │ • VPN服务器    │  │ • PostgreSQL   │
│ • Agent主节点   │  │ • 飞书Webhook  │  │ • Redis       │
│ • Nginx网关    │  │ • 邮件网关     │  │ • 文档存储     │
│                │  │                │  │                │
│ Server 2       │  └────────────────┘  └────────────────┘
│ • Agent从节点1  │          │
│                │          │ (公网出口)
│ Server 3       │          ▼
│ • Agent从节点2  │  ┌────────────────┐
│                │  │   Internet     │
│ Server 4       │  └────────┬───────┘
│ • 监控/日志     │           │ DeepSeek API
│ • 备份节点      │           │
└────────────────┘           ▼
                     ┌────────────────┐
                     │ DeepSeek API   │
                     │ (LLM推理服务)  │
                     └────────────────┘
```

## 3. 本地服务器架构

### 3.1 服务器规划

假设有4台服务器，配置为**8核16G**（标准配置），分配如下：

| 服务器 | IP地址 | 角色 | 主要服务 | 配置要求 |
|--------|--------|------|----------|----------|
| Server 1 | 192.168.1.10 | 主节点 | Nginx, Agent主节点 | 8核16G, 500G SSD |
| Server 2 | 192.168.1.11 | Agent节点1 | OpenClaw Agent | 8核16G, 500G SSD |
| Server 3 | 192.168.1.12 | Agent节点2 | OpenClaw Agent | 8核16G, 500G SSD |
| Server 4 | 192.168.1.13 | 数据/监控 | PostgreSQL, Redis, 监控 | 16核32G, 1TB SSD |

**硬件需求**：
- CPU：8核+（推荐16核）
- 内存：16G+（推荐32G）
- 存储：500GB SSD+（推荐1TB）
- 网络：千兆网卡

### 3.2 服务分布

**Server 1 - 主节点 & 网关**
```
服务清单：
├── Nginx (反向代理 + 负载均衡)
├── OpenClaw Agent (主节点)
├── VPN服务器 (WireGuard/OpenVPN)
└── 飞书Webhook接收服务
```

**Server 2 - Agent节点1**
```
服务清单：
├── OpenClaw Agent (从节点1)
├── 财务Agent实例
└── 知识Agent实例
```

**Server 3 - Agent节点2**
```
服务清单：
├── OpenClaw Agent (从节点2)
├── 运营Agent实例
└── 数据Agent实例
```

**Server 4 - 数据与监控**
```
服务清单：
├── PostgreSQL 14 (主数据库)
├── Redis (缓存)
├── Prometheus (监控)
├── Grafana (可视化)
├── 文件存储 (知识库)
└── 备份服务
```

## 4. 网络架构

### 4.1 内网网络设计

```
                    ┌─────────────────────┐
                    │   核心交换机         │
                    │ 192.168.1.0/24      │
                    └──────────┬──────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
┌───────▼────────┐    ┌───────▼────────┐    ┌───────▼────────┐
│  管理VLAN        │    │  业务VLAN        │    │  数据VLAN        │
│  (192.168.10.0/24)│    │  (192.168.1.0/24)│    │  (192.168.20.0/24)│
│                 │    │                 │    │                 │
│ • 运维终端      │    │ • Agent节点     │    │ • PostgreSQL    │
│ • 监控系统      │    │ • 应用访问      │    │ • Redis         │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### 4.2 公网访问方案

**方案1：内网VPN访问（推荐）**

```
员工电脑
    ↓
VPN客户端 (WireGuard/OpenVPN)
    ↓
VPN服务器 (Server 1: 192.168.1.10)
    ↓
Agent集群 (内网)
```

**方案2：飞书集成（通过内网网关）**

```
飞书云服务
    ↓ HTTPS Webhook
内网网关 (Nginx反向代理)
    ↓
Agent集群 (内网)
```

**内网网关配置**：
```nginx
# Nginx配置示例
upstream agent_cluster {
    least_conn;
    server 192.168.1.10:3000 max_fails=3 fail_timeout=30s;
    server 192.168.1.11:3000 max_fails=3 fail_timeout=30s;
    server 192.168.1.12:3000 max_fails=3 fail_timeout=30s;
}

server {
    listen 443 ssl;
    server_name aiopoc.internal;

    ssl_certificate /etc/nginx/ssl/internal.crt;
    ssl_certificate_key /etc/nginx/ssl/internal.key;

    location /feishu/events {
        proxy_pass http://agent_cluster;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        proxy_pass http://agent_cluster;
    }
}
```

### 4.3 外网访问配置

如果需要通过飞书Webhook从公网访问：

**选项1：内网穿透（适合测试）**
- 使用frp、ngrok等工具
- 需要一台有公网IP的VPS（¥100-200/年）

**选项2：端口转发（推荐）**
- 在路由器配置端口转发
- 使用动态DNS（DDNS）
- 仅开放必要端口（443）

**选项3：VPN专线（企业级）**
- 使用SD-WAN或企业VPN
- 安全性最高
- 成本较高

## 5. 高可用设计

### 5.1 本地高可用架构

```
                    ┌─────────────┐
                    │  Nginx LB   │
                    │ (Server 1)  │
                    └──────┬──────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   ┌────▼────┐       ┌────▼────┐       ┌────▼────┐
   │Agent-1  │       │Agent-2  │       │Agent-3  │
   │(Master) │       │(Slave)  │       │(Slave)  │
   │Server 1 │       │Server 2 │       │Server 3 │
   └────┬────┘       └────┬────┘       └────┬────┘
        │                 │                 │
        └─────────────────┼─────────────────┘
                          │
                   ┌──────▼──────┐
                   │ PostgreSQL  │
                   │ (Server 4)  │
                   │  主从复制    │
                   └─────────────┘
```

### 5.2 故障切换

**Nginx健康检查**：
```nginx
upstream agent_cluster {
    server 192.168.1.10:3000 max_fails=3 fail_timeout=30s;
    server 192.168.1.11:3000 max_fails=3 fail_timeout=30s backup;
    server 192.168.1.12:3000 max_fails=3 fail_timeout=30s backup;
}
```

**自动故障转移**：
- Nginx自动剔除故障节点
- Agent主节点故障自动选举
- 数据库主从自动切换

## 6. DeepSeek API访问

### 6.1 本地网络访问外网

**架构**：
```
本地Agent集群
    ↓
内网网关/路由器
    ↓
NAT/端口转发
    ↓
Internet
    ↓
DeepSeek API (api.deepseek.com)
```

**网络配置**：
```bash
# 在Server 1配置NAT或使用代理
export http_proxy=http://proxy.internal:8080
export https_proxy=http://proxy.internal:8080

# 或配置白名单允许访问DeepSeek API
iptables -A OUTPUT -p tcp --dport 443 -d api.deepseek.com -j ACCEPT
```

### 6.2 API密钥管理

**安全存储**：
- 使用环境变量
- 或使用密钥管理服务（如HashiCorp Vault）
- 定期轮换密钥

```bash
# /etc/opclaw/.env
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxx
DEEPSEEK_API_BASE=https://api.deepseek.com
```

## 7. 监控与运维

### 7.1 监控架构

**Prometheus + Grafana**：

```
Prometheus (Server 4)
    ↓ 采集指标
├── Node Exporter (所有服务器)
├── OpenClaw Agent (所有节点)
├── PostgreSQL Exporter
├── Redis Exporter
└── Nginx Exporter
    ↓
Grafana (Server 4)
    ↓
监控大屏 + 告警
```

### 7.2 告警配置

**Alertmanager告警规则**：
- 服务不可用（电话+飞书）
- CPU/内存超过80%（飞书）
- 磁盘空间不足20%（邮件）
- API调用失败率>5%（飞书）

### 7.3 日志管理

**本地日志收集**：
```yaml
logging:
  level: INFO
  format: json
  outputs:
    - console
    - file

  files:
    - path: /var/log/opclaw/agent.log
      max_size: 100MB
      max_backups: 10
      max_age: 30
```

**可选：远程日志（阿里云SLS）**
- 仅存储关键日志
- 降低本地存储压力
- 成本：¥100-200/月

## 8. 备份与容灾

### 8.1 本地备份

**数据库备份**：
- 每日全量备份
- 实时增量备份
- 保留30天

**配置备份**：
- Git版本控制
- 推送到远程仓库（GitHub/GitLab私有仓库）

**文件备份**：
- 知识库定期快照
- 同步到备份服务器

### 8.2 异地备份（可选）

**云存储备份**：
- 每周同步到阿里云OSS
- 成本：¥50-100/月

**备份策略**：
```
本地实时备份 → 本地每日备份 → 云端每周备份
```

## 9. 安全加固

### 9.1 网络安全

**防火墙规则**：
```bash
# 仅允许内网访问
iptables -A INPUT -s 192.168.1.0/24 -j ACCEPT
iptables -A INPUT -s 192.168.10.0/24 -j ACCEPT
iptables -A INPUT -s 192.168.20.0/24 -j ACCEPT
iptables -A INPUT -j DROP

# 允许已建立的连接
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# 允许SSH管理
iptables -A INPUT -p tcp --dport 22 -s 192.168.10.0/24 -j ACCEPT

# 允许HTTP/HTTPS
iptables -A INPUT -p tcp --dport 80 -j ACCEPT
iptables -A INPUT -p tcp --dport 443 -j ACCEPT
```

### 9.2 应用安全

**权限控制**：
- 最小权限原则
- Agent沙箱机制
- 审批机制（exec命令）

**数据加密**：
- 传输加密（TLS）
- 存储加密（敏感数据）
- 密钥轮换

## 10. 与原方案对比

### 10.1 成本对比

| 成本项 | 原方案（云） | 新方案（本地） | 节省 |
|--------|-------------|---------------|------|
| ECS服务器 | ¥33,600/年 | ¥0（自有） | ¥33,600 |
| RDS数据库 | ¥12,000/年 | ¥0（本地PG） | ¥12,000 |
| Redis | ¥3,000/年 | ¥0（本地Redis） | ¥3,000 |
| 其他云服务 | ¥13,800/年 | ¥12,000/年 | ¥1,800 |
| **基础设施合计** | **¥62,400** | **¥12,000** | **¥50,400 (81%)** |

### 10.2 优缺点对比

| 方面 | 云方案 | 本地方案 |
|------|--------|----------|
| 成本 | 高 | 低（节省81%） |
| 维护 | 低（托管） | 中（自维护） |
| 安全性 | 中（数据在云） | 高（数据本地） |
| 可扩展性 | 高（弹性） | 中（受硬件限制） |
| 访问速度 | 依赖网络 | 本地更快 |
| 运维复杂度 | 低 | 中高 |

## 11. 迁移路径

### 11.1 阶段1：准备阶段（1-2周）

- 硬件检查与升级
- 操作系统安装（Ubuntu 22.04 LTS）
- 网络配置
- VPN搭建

### 11.2 阶段2：部署阶段（2-4周）

- Docker环境安装
- PostgreSQL + Redis部署
- OpenClaw Agent部署
- Nginx配置
- 监控系统搭建

### 11.3 阶段3：测试阶段（2周）

- 功能测试
- 性能测试
- 安全测试
- 用户验收

### 11.4 阶段4：上线阶段（1周）

- 灰度发布
- 数据迁移
- 培训用户
- 正式上线

## 12. 关键风险与应对

| 风险 | 概率 | 影响 | 应对措施 |
|------|------|------|----------|
| 硬件故障 | 中 | 高 | 冗余部署 + 备份 |
| 网络中断 | 低 | 中 | VPN备份 + 离线模式 |
| 电力故障 | 低 | 高 | UPS + 发电机 |
| 维护负担 | 高 | 中 | 自动化运维 |
| 扩展受限 | 中 | 中 | 预留扩展空间 |
