# Network Regression 事故分析报告

## 事故概述

在修复WebSocket消息路由问题时，导致backend容器无法连接到postgres数据库。

**影响时间**: 2026-03-17 14:39 - 14:52 (约13分钟)
**影响范围**: Backend服务无法访问数据库，所有数据库相关功能失效
**根本原因**: 容器网络配置错误 - backend容器加入了错误的Docker网络

---

## 时间线

### 正常状态 (修复前)
```
opclaw_opclaw-network:
  - postgres: 172.20.0.2
  - redis: 172.20.0.3
  - frontend: 172.20.0.5
  - backend: [在这个网络中]
```

### 问题出现 (14:39)
```bash
# 我执行的命令
docker run -d --name opclaw-backend --network platform_opclaw-network ...

# 问题：使用了一个新创建的空网络 platform_opclaw-network
# 结果：backend无法连接到postgres和redis
```

### 错误现象
```
getaddrinfo EAI_AGAIN postgres  # DNS解析失败
Environment: development         # 回退到开发模式
No metadata for "Instance"        # TypeORM实体未初始化
```

### 修复过程 (14:52)
```bash
# 发现问题：两个不同的网络
opclaw_opclaw-network     [postgres, redis, frontend]
platform_opclaw-network   [backend]  ← 错误！

# 修复：使用正确的网络
docker run -d --name opclaw-backend --network opclaw_opclaw-network ...
```

---

## 根本原因分析

### 1. 直接原因
- **网络名称混淆**: 存在两个名称相似的网络 `opclaw_opclaw-network` 和 `platform_opclaw-network`
- **假设错误**: 假设 `platform_opclaw-network` 是正确的网络，但没有验证

### 2. 系统性问题

#### 缺少容器启动流程文档
```yaml
问题:
  - 没有记录正确的容器启动命令
  - 每次手动输入命令，容易出错
  - 网络名称需要从docker-compose.yml中确认

影响:
  - 无法快速恢复服务
  - 容易引入配置错误
```

#### 网络命名混乱
```yaml
opclaw_opclaw-network:      # 原始网络，包含所有服务
platform_opclaw-network:    # 新创建的空网络

问题:
  - 名称相似容易混淆
  - 存在孤立网络资源
```

#### 缺少验证步骤
```yaml
应该的验证流程:
  1. 检查容器网络连接性
  2. 验证数据库连接
  3. 确认服务间通信正常

实际执行:
  1. 启动容器
  2. ❌ 跳过验证
  3. 等待用户报告问题
```

### 3. 我的操作问题

| 问题 | 影响 |
|------|------|
| 没有检查现有容器配置 | 重复创建容器时使用了错误配置 |
| 没有验证网络连接性 | 启动后没有确认数据库是否可访问 |
| 盲目使用新网络名称 | `platform_opclaw-network`看起来合理但没有验证 |
| 没有对比原始配置 | 应该先检查 `docker inspect` 原始容器 |

---

## 为什么之前正常，现在出错？

### 原始启动方式
```bash
# 通过docker-compose.yml启动
cd /opt/opclaw/platform
docker-compose up -d backend

# docker-compose.yml中定义了正确的网络
networks:
  opclaw-network:
    name: opclaw_opclaw-network
```

### 我的错误操作
```bash
# 手动使用docker run启动
docker run -d --name opclaw-backend --network platform_opclaw-network ...

# 问题：
# 1. 创建了新网络而不是使用现有网络
# 2. 没有检查docker-compose.yml中的网络定义
# 3. 没有验证postgres是否在同一网络中
```

---

## 预防措施

### 1. 创建容器恢复脚本

**立即执行**: 创建标准化的容器启动脚本

```bash
# /opt/opclaw/scripts/restart-backend.sh
#!/bin/bash
set -e

echo "Checking network..."
NETWORK_NAME="opclaw_opclaw-network"

if ! docker network inspect "$NETWORK_NAME" &>/dev/null; then
    echo "ERROR: Network $NETWORK_NAME not found"
    exit 1
fi

echo "Checking postgres..."
if ! docker network inspect "$NETWORK_NAME" --format '{{range .Containers}}{{.Name}}{{end}}' | grep -q "opclaw-postgres"; then
    echo "ERROR: postgres not found in network $NETWORK_NAME"
    exit 1
fi

echo "Stopping old backend..."
docker stop opclaw-backend 2>/dev/null || true
docker rm opclaw-backend 2>/dev/null || true

echo "Starting backend..."
docker run -d \
  --name opclaw-backend \
  --network "$NETWORK_NAME" \
  --restart unless-stopped \
  -p 3000:3000 \
  -p 3001:3001 \
  -p 3002:3002 \
  -v /var/run/docker.sock:/var/run/docker.sock:rw \
  -v /opt/opclaw/platform/logs/backend:/app/logs \
  --env-file /opt/opclaw/platform/.env.production \
  platform-backend

echo "Waiting for backend to be healthy..."
sleep 10

echo "Verifying database connection..."
if ! docker exec opclaw-backend wget -q -O /dev/null http://localhost:3000/health; then
    echo "ERROR: Backend health check failed"
    docker logs opclaw-backend --tail 50
    exit 1
fi

echo "✅ Backend restarted successfully"
```

### 2. 清理孤立网络资源

```bash
# /opt/opclaw/scripts/cleanup-networks.sh
#!/bin/bash
echo "Checking for orphaned networks..."

# 检查是否有两个opclaw网络
OPCLAW_NETWORKS=$(docker network ls --format '{{.Name}}' | grep opclaw || true)

if echo "$OPCLAW_NETWORKS" | grep -q "platform_opclaw-network"; then
    # 检查是否有容器在使用
    CONTAINERS=$(docker network inspect platform_opclaw-network --format '{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null || echo "")

    if [ -z "$CONTAINERS" ]; then
        echo "Removing empty network: platform_opclaw-network"
        docker network rm platform_opclaw-network
    else
        echo "WARNING: platform_opclaw-network has containers: $CONTAINERS"
    fi
fi
```

### 3. 增强操作前检查清单

```markdown
## 容器操作检查清单

### 操作前检查
- [ ] 检查现有容器配置 (`docker inspect <container>`)
- [ ] 确认网络设置 (`docker network inspect`)
- [ ] 验证依赖容器状态
- [ ] 备份当前配置

### 操作后验证
- [ ] 容器成功启动 (`docker ps`)
- [ ] 数据库连接正常 (检查日志)
- [ ] 服务间通信测试 (`ping`, `curl`)
- [ ] 健康检查通过 (`/health` 端点)
```

### 4. 网络连接性验证

```bash
# /opt/opclaw/scripts/verify-connectivity.sh
#!/bin/bash
echo "Verifying container connectivity..."

# 1. 检查backend是否在正确网络中
BACKEND_NETWORK=$(docker inspect opclaw-backend --format '{{range $net, $conf := .NetworkSettings.Networks}}{{$net}}{{end}}')
echo "Backend network: $BACKEND_NETWORK"

# 2. 检查postgres是否在同一网络
if ! docker network inspect "$BACKEND_NETWORK" --format '{{range .Containers}}{{.Name}}{{end}}' | grep -q "opclaw-postgres"; then
    echo "❌ ERROR: postgres not in same network"
    exit 1
fi

# 3. 测试DNS解析
if ! docker exec opclaw-backend ping -c 1 postgres &>/dev/null; then
    echo "❌ ERROR: Cannot ping postgres"
    exit 1
fi

# 4. 测试数据库连接
if ! docker exec opclaw-backend wget -q -O /dev/null http://localhost:3000/health; then
    echo "❌ ERROR: Backend health check failed"
    exit 1
fi

echo "✅ All connectivity checks passed"
```

### 5. 改进docker run命令生成

```bash
# 从docker-compose.yml生成正确的docker run命令
generate_docker_run() {
    local SERVICE=$1
    local COMPOSE_FILE="/opt/opclaw/platform/docker-compose.yml"

    # 提取配置
    local NETWORK=$(docker-compose -f "$COMPOSE_FILE" config | grep -A 5 "$SERVICE:" | grep "networks:" | awk '{print $2}')
    local PORTS=$(docker-compose -f "$COMPOSE_FILE" config | grep -A 10 "$SERVICE:" | grep "ports:" | awk '{print $2}')

    echo "# Generated from docker-compose.yml"
    echo "docker run -d \\"
    echo "  --name opclaw-$SERVICE \\"
    echo "  --network opclaw_opclaw-network \\"
    # ... 更多配置
}
```

---

## 行为准则更新

### 黄金规则补充

1. **网络配置必须验证**
   - 容器启动后必须验证网络连接性
   - 检查所有依赖服务是否在同一网络
   - 测试DNS解析和端口连接

2. **不要假设，要验证**
   - ❌ 不要假设 `platform_*` 是正确的前缀
   - ✅ 检查实际运行中的容器配置
   - ✅ 使用 `docker inspect` 验证

3. **对比原始配置**
   - 修改前记录原始配置
   - 对比修改前后的差异
   - 使用docker-compose时优先用compose命令

4. **创建恢复脚本**
   - 记录正确的容器启动命令
   - 包含验证步骤
   - 避免每次手动输入

---

## 总结

| 类别 | 问题 | 解决方案 |
|------|------|----------|
| 直接原因 | 使用了错误的Docker网络 | 检查并使用 `opclaw_opclaw-network` |
| 系统问题 | 缺少容器启动标准化流程 | 创建恢复脚本，包含验证步骤 |
| 命名问题 | 网络名称相似容易混淆 | 清理孤立网络，统一命名 |
| 操作问题 | 没有验证网络连接性 | 启动后强制执行连接性检查 |

**最重要的一课**: 容器网络配置必须**验证**，不能**假设**。启动容器后必须检查：
1. 是否在正确的网络中
2. 能否ping通依赖服务
3. 数据库连接是否正常
4. 健康检查是否通过
