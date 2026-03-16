# 腾讯云自动扩缩容解决方案

**创建日期**: 2026-03-16
**目标**: AI Native 方式自动创建/部署/注册 OpenClaw 实例到资源池

---

## 执行摘要

### 发现
✅ **腾讯云有完整的 MCP 生态系统**
- GitHub: https://github.com/TencentCloudCommunity/mcp-server
- 60+ MCP 服务器覆盖所有腾讯云服务
- 支持 AI Native 自动化管理

### 关键 MCP 服务器
| MCP 服务器 | 功能 | 用途 |
|-----------|------|------|
| **mcp-server-cvm** | 云虚拟机管理 | 创建/删除/查询实例 |
| **mcp-server-tat** | 自动化工具 | 在实例上执行命令部署 OpenClaw |
| **mcp-server-as** | 自动伸缩 | 自动扩缩容实例组 |
| **cos-mcp** | 对象存储 | 存储部署脚本和配置 |

### AI Native 工作流
```
用户: "需要更多实例"
  ↓
Claude/AI Assistant 调用 MCP
  ↓
创建 CVM → TAT 部署 OpenClaw → 注册到资源池
  ↓
用户扫码认领新实例
```

---

## 问题 1: 将已有实例 (101.34.254.52) 加入资源池

### 解决方案: 实例主动注册 API

#### 步骤 1: 创建实例注册端点

**文件**: `src/controllers/InstanceRegistrationController.ts` (新增)

```typescript
import { Controller, Post, Body, Get } from 'routing-controllers';
import { InstanceService } from '../services/InstanceService';
import { InstanceRegistry } from '../services/InstanceRegistry';
import { Service } from 'typedi';
import crypto from 'crypto';

interface RegistrationRequest {
  instance_name: string;
  ip_address: string;
  port: number;
  connection_type: 'local' | 'remote';
  api_endpoint: string;
  ssh_port?: number;
  ssh_username?: string;
  capabilities?: string[];
}

@Controller('/instances')
@Service()
export class InstanceRegistrationController {
  constructor(
    private readonly instanceService: InstanceService,
    private readonly instanceRegistry: InstanceRegistry
  ) {}

  /**
   * 实例主动注册到平台
   * POST /instances/register
   *
   * 用途: 让远程 OpenClaw 实例主动注册到资源池
   */
  @Post('/register')
  async registerInstance(@Body() body: RegistrationRequest) {
    try {
      // 1. 验证必填字段
      if (!body.instance_name || !body.ip_address || !body.api_endpoint) {
        return {
          success: false,
          error: 'Missing required fields: instance_name, ip_address, api_endpoint'
        };
      }

      // 2. 检查实例是否已注册
      const existing = await this.instanceService.findByIPAddress(
        body.ip_address
      );

      if (existing) {
        return {
          success: true,
          message: 'Instance already registered',
          instance: {
            id: existing.id,
            name: existing.name,
            status: existing.status,
            registered_at: existing.created_at
          }
        };
      }

      // 3. 创建实例记录
      const instance = await this.instanceService.create({
        name: body.instance_name,
        connection_type: body.connection_type || 'remote',
        status: 'pending', // 等待健康检查通过后变为 active
        host: body.ip_address,
        port: body.port,
        api_endpoint: body.api_endpoint,
        ssh_port: body.ssh_port,
        ssh_username: body.ssh_username,
        capabilities: body.capabilities || [],
        metadata: {
          registration_method: 'api',
          registration_ip: body.ip_address,
          registered_at: new Date().toISOString()
        }
      });

      // 4. 生成实例 Token (用于后续心跳更新)
      const instanceToken = this.generateInstanceToken(instance.id);

      // 5. 注册到 InstanceRegistry
      await this.instanceRegistry.registerInstance(instance.id, {
        connection_type: body.connection_type || 'remote',
        api_endpoint: body.api_endpoint,
        instance_token: instanceToken
      });

      // 6. 触发健康检查
      await this.performHealthCheck(instance.id);

      return {
        success: true,
        message: 'Instance registered successfully',
        instance: {
          id: instance.id,
          name: instance.name,
          status: instance.status,
          instance_token: instanceToken,
          api_endpoint: body.api_endpoint,
          registered_at: instance.created_at
        },
        next_steps: [
          '1. 保存 instance_token 用于后续心跳更新',
          '2. 确保实例 API 端点可访问',
          '3. 等待健康检查通过后实例将变为 active 状态'
        ]
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Registration failed'
      };
    }
  }

  /**
   * 实例心跳更新
   * POST /instances/heartbeat
   *
   * 用途: 实例定期发送心跳保持在线状态
   */
  @Post('/heartbeat')
  async heartbeat(@Body() body: { instance_id: string; token: string }) {
    try {
      // 验证 token
      const instance = await this.instanceService.findById(body.instance_id);

      if (!instance || instance.metadata?.instance_token !== body.token) {
        return {
          success: false,
          error: 'Invalid instance or token'
        };
      }

      // 更新心跳时间
      await this.instanceRegistry.updateInstanceStatus(
        body.instance_id,
        'online'
      );

      // 更新数据库
      await this.instanceService.updateLastHeartbeat(body.instance_id);

      return {
        success: true,
        message: 'Heartbeat received',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Heartbeat failed'
      };
    }
  }

  /**
   * 查询实例注册状态
   * GET /instances/:id/status
   */
  @Get('/:id/status')
  async getRegistrationStatus(@Param('id') id: string) {
    try {
      const instance = await this.instanceService.findById(id);

      if (!instance) {
        return {
          success: false,
          error: 'Instance not found'
        };
      }

      const registryInfo = await this.instanceRegistry.getInstanceInfo(id);

      return {
        success: true,
        instance: {
          id: instance.id,
          name: instance.name,
          status: instance.status,
          connection_type: instance.connection_type,
          registered_at: instance.created_at,
          last_heartbeat: instance.last_heartbeat_at,
          registry_status: registryInfo?.status || 'unknown'
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get status'
      };
    }
  }

  /**
   * 生成实例 Token
   */
  private generateInstanceToken(instanceId: string): string {
    const secret = process.env.INSTANCE_TOKEN_SECRET || 'default-secret-change-me';
    const data = `${instanceId}:${Date.now()}`;
    return crypto
      .createHmac('sha256', secret)
      .update(data)
      .digest('hex');
  }

  /**
   * 执行健康检查
   */
  private async performHealthCheck(instanceId: string) {
    // 异步执行健康检查
    setTimeout(async () => {
      try {
        const instance = await this.instanceService.findById(instanceId);
        const registryInfo = await this.instanceRegistry.getInstanceInfo(instanceId);

        if (!registryInfo) {
          await this.instanceService.updateStatus(instanceId, 'error');
          return;
        }

        // 尝试连接实例 API
        const response = await fetch(
          `${registryInfo.api_endpoint}/health`,
          {
            method: 'GET',
            timeout: 5000
          }
        );

        if (response.ok) {
          await this.instanceService.updateStatus(instanceId, 'active');
          await this.instanceRegistry.updateInstanceStatus(instanceId, 'online');
        } else {
          await this.instanceService.updateStatus(instanceId, 'error');
          await this.instanceRegistry.updateInstanceStatus(instanceId, 'offline');
        }

      } catch (error) {
        await this.instanceService.updateStatus(instanceId, 'error');
      }
    }, 0);
  }
}
```

#### 步骤 2: 在腾讯云 VM 上执行注册

**脚本**: `scripts/register-to-platform.sh` (在 101.34.254.52 上执行)

```bash
#!/bin/bash

# OpenClaw 实例注册脚本
# 用途: 将已有的 OpenClaw 实例注册到 AIOpc 平台

set -e

# 配置
PLATFORM_API="${PLATFORM_API:-http://your-platform-domain.com}"
INSTANCE_NAME="${INSTANCE_NAME:-OpenClaw-TencentCloud-$(hostname)}"
IP_ADDRESS=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 || echo "101.34.254.52")
API_PORT="${API_PORT:-3000}"
API_ENDPOINT="http://${IP_ADDRESS}:${API_PORT}"
CONNECTION_TYPE="${CONNECTION_TYPE:-remote}"

# SSH 配置 (可选，用于远程管理)
SSH_PORT="${SSH_PORT:-22}"
SSH_USERNAME="${SSH_USERNAME:-root}"

# 实例能力
CAPABILITIES='["chat","code_execution","web_search","file_operations"]'

echo "🔗 Registering OpenClaw instance to AIOpc Platform..."
echo "   Instance: ${INSTANCE_NAME}"
echo "   IP: ${IP_ADDRESS}"
echo "   API: ${API_ENDPOINT}"
echo ""

# 注册实例
RESPONSE=$(curl -s -X POST "${PLATFORM_API}/api/instances/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"instance_name\": \"${INSTANCE_NAME}\",
    \"ip_address\": \"${IP_ADDRESS}\",
    \"port\": ${API_PORT},
    \"connection_type\": \"${CONNECTION_TYPE}\",
    \"api_endpoint\": \"${API_ENDPOINT}\",
    \"ssh_port\": ${SSH_PORT},
    \"ssh_username\": \"${SSH_USERNAME}\",
    \"capabilities\": ${CAPABILITIES}
  }")

# 检查响应
SUCCESS=$(echo $RESPONSE | jq -r '.success // false')

if [ "$SUCCESS" = "true" ]; then
  echo "✅ Registration successful!"
  echo ""
  echo "Instance Details:"
  echo $RESPONSE | jq '.instance'
  echo ""

  # 保存 instance_token
  INSTANCE_TOKEN=$(echo $RESPONSE | jq -r '.instance.instance_token')
  INSTANCE_ID=$(echo $RESPONSE | jq -r '.instance.id')

  echo "💾 Save these credentials:"
  echo "   INSTANCE_ID=${INSTANCE_ID}"
  echo "   INSTANCE_TOKEN=${INSTANCE_TOKEN}"
  echo ""

  # 创建心跳脚本
  cat > /usr/local/bin/opclaw-heartbeat.sh <<EOF
#!/bin/bash
while true; do
  curl -s -X POST "${PLATFORM_API}/api/instances/heartbeat" \\
    -H "Content-Type: application/json" \\
    -d '{
      "instance_id": "${INSTANCE_ID}",
      "token": "${INSTANCE_TOKEN}"
    }'
  sleep 30
done
EOF

  chmod +x /usr/local/bin/opclaw-heartbeat.sh

  # 创建 systemd 服务
  cat > /etc/systemd/system/opclaw-heartbeat.service <<EOF
[Unit]
Description=OpenClaw Instance Heartbeat
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/opclaw-heartbeat.sh
Restart=always

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable opclaw-heartbeat
  systemctl start opclaw-heartbeat

  echo "✅ Heartbeat service started!"
  echo ""
  echo "Next steps:"
  echo "1. Verify instance status: curl ${PLATFORM_API}/api/instances/${INSTANCE_ID}/status"
  echo "2. Wait for health check to pass"
  echo "3. Instance will be available for user claim"
  echo ""

else
  echo "❌ Registration failed!"
  echo $RESPONSE | jq '.error'
  exit 1
fi
```

#### 步骤 3: 执行注册

```bash
# 在 101.34.254.52 上执行
export PLATFORM_API="http://your-platform-api.com"
export INSTANCE_NAME="OpenClaw-TencentCloud-Primary"

# 下载并执行注册脚本
curl -sSL https://raw.githubusercontent.com/your-repo/main/scripts/register-to-platform.sh | bash

# 或者手动执行
bash scripts/register-to-platform.sh
```

---

## 问题 2: AI Native 自动创建/部署/注册

### 解决方案: 基于 Tencent Cloud MCP 的自动化

#### 架构设计

```
┌─────────────────────────────────────────────────────────┐
│                  AI Assistant (Claude)                   │
│  "创建 3 个新的 OpenClaw 实例到腾讯云广州区域"            │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                   MCP Orchestrator                       │
│  解析意图 → 调用腾讯云 MCP → 编排工作流                   │
└─────────────────────────────────────────────────────────┘
                          ↓
        ┌─────────────────┬─────────────────┬─────────────────┐
        │                 │                 │                 │
┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐
│ CVM MCP     │  │ TAT MCP     │  │ COS MCP     │  │ Platform API│
│ 创建实例     │  │ 部署应用     │  │ 存储脚本     │  │ 注册实例     │
└─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘
        ↓                 ↓                 ↓                 ↓
   [新 CVM]         [OpenClaw]      [deploy.sh]      [资源池更新]
```

#### 步骤 1: 安装腾讯云 MCP 服务器

```bash
# 安装腾讯云 CVM MCP (云虚拟机管理)
npm install -g mcp-server-cvm

# 安装腾讯云 TAT MCP (自动化工具)
npm install -g mcp-server-tat

# 安装腾讯云 COS MCP (对象存储)
npm install -g cos-mcp
```

#### 步骤 2: 配置 MCP 客户端

**文件**: `mcp-config.json`

```json
{
  "mcpServers": {
    "tencent-cvm": {
      "command": "uvx",
      "args": ["mcp-server-cvm"],
      "env": {
        "TENCENTCLOUD_SECRET_ID": "${TENCENTCLOUD_SECRET_ID}",
        "TENCENTCLOUD_SECRET_KEY": "${TENCENTCLOUD_SECRET_KEY}",
        "TENCENTCLOUD_REGION": "ap-guangzhou"
      }
    },
    "tencent-tat": {
      "command": "uvx",
      "args": ["mcp-server-tat"],
      "env": {
        "TENCENTCLOUD_SECRET_ID": "${TENCENTCLOUD_SECRET_ID}",
        "TENCENTCLOUD_SECRET_KEY": "${TENCENTCLOUD_SECRET_KEY}",
        "TENCENTCLOUD_REGION": "ap-guangzhou"
      }
    },
    "cos-mcp": {
      "command": "npx",
      "args": ["cos-mcp"],
      "env": {
        "TENCENTCLOUD_SECRET_ID": "${TENCENTCLOUD_SECRET_ID}",
        "TENCENTCLOUD_SECRET_KEY": "${TENCENTCLOUD_SECRET_KEY}",
        "COS_BUCKET": "aiopc-deploy-scripts",
        "COS_REGION": "ap-guangzhou"
      }
    }
  }
}
```

#### 步骤 3: 创建自动扩缩容服务

**文件**: `src/services/AutoScalingService.ts` (新增)

```typescript
import { Service } from 'typedi';
import { logger } from '../config/logger';

/**
 * 自动扩缩容服务
 * 集成腾讯云 MCP 实现 AI Native 自动化
 */
@Service()
export class AutoScalingService {
  private mcpClient: any; // MCP 客户端

  /**
   * 创建新的 OpenClaw 实例
   * AI Native: 用户只需说"创建新实例"
   */
  async createInstance(params: {
    region?: string;
    count?: number;
    instanceType?: string;
  }): Promise<{
    success: boolean;
    instances?: any[];
    error?: string;
  }> {
    try {
      const {
        region = 'ap-guangzhou',
        count = 1,
        instanceType = 'S5.MEDIUM4' // 4核8G
      } = params;

      logger.info('Creating new OpenClaw instances', {
        region,
        count,
        instanceType
      });

      // 1. 调用 CVM MCP 创建实例
      const cvmResult = await this.callMCPTool('tencent-cvm', 'create_instances', {
        region,
        instance_count: count,
        instance_type: instanceType,
        image_id: 'img-xxx', // OpenClaw 镜像 ID
        internet_charge_type: 'TRAFFIC_POSTPAID_BY_HOUR',
        internet_max_bandwidth_out: 10,
        login_settings: {
          password: this.generatePassword()
        },
        instance_name: `OpenClaw-${Date.now()}`,
        system_disk: {
          disk_type: 'CLOUD_PREMIUM',
          disk_size: 50
        }
      });

      if (!cvmResult.success) {
        throw new Error(`Failed to create CVM instances: ${cvmResult.error}`);
      }

      const instanceIds = cvmResult.data.InstanceIdSet;

      logger.info('CVM instances created', { instanceIds });

      // 2. 等待实例启动
      await this.waitForInstancesReady(instanceIds, region);

      // 3. 获取实例公网 IP
      const instances = await this.getInstanceDetails(instanceIds, region);

      // 4. 上传部署脚本到 COS
      await this.uploadDeployScript();

      // 5. 通过 TAT 在实例上执行部署脚本
      const deployResults = await Promise.all(
        instances.map(async (instance: any) => {
          return await this.deployOpenClaw(instance.InstanceId);
        })
      );

      // 6. 注册到平台资源池
      const registrationResults = await Promise.all(
        instances.map(async (instance: any) => {
          return await this.registerToPlatform(instance);
        })
      );

      logger.info('Auto-scaling completed', {
        created: instanceIds.length,
        deployed: deployResults.filter(r => r.success).length,
        registered: registrationResults.filter(r => r.success).length
      });

      return {
        success: true,
        instances: instances.map((inst: any, idx: number) => ({
          instance_id: inst.InstanceId,
          public_ip: inst.PublicIpAddresses[0],
          deploy_status: deployResults[idx].success ? 'success' : 'failed',
          registration_status: registrationResults[idx].success ? 'registered' : 'pending'
        }))
      };

    } catch (error) {
      logger.error('Auto-scaling failed', {
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Auto-scaling failed'
      };
    }
  }

  /**
   * 终止闲置实例
   * 当实例空闲超过阈值时自动释放
   */
  async terminateIdleInstances(threshold: {
    idleHours: number;
    minInstances: number;
  }): Promise<{
    terminated: number;
    remaining: number;
  }> {
    try {
      // 1. 查询所有实例状态
      const instances = await this.callMCPTool('tencent-cvm', 'describe_instances', {
        region: 'ap-guangzhou'
      });

      // 2. 筛选闲置实例
      const idleInstances = instances.data.InstanceSet.filter(
        (inst: any) => this.isIdle(inst, threshold.idleHours)
      );

      // 3. 确保保留最少实例数
      const toTerminate = idleInstances.slice(0, Math.max(0, idleInstances.length - threshold.minInstances));

      if (toTerminate.length === 0) {
        logger.info('No idle instances to terminate');
        return { terminated: 0, remaining: instances.data.InstanceSet.length };
      }

      // 4. 终止实例
      const instanceIds = toTerminate.map((inst: any) => inst.InstanceId);

      await this.callMCPTool('tencent-cvm', 'terminate_instances', {
        region: 'ap-guangzhou',
        instance_ids: instanceIds
      });

      logger.info('Idle instances terminated', {
        count: instanceIds.length,
        instance_ids: instanceIds
      });

      return {
        terminated: instanceIds.length,
        remaining: instances.data.InstanceSet.length - instanceIds.length
      };

    } catch (error) {
      logger.error('Failed to terminate idle instances', { error });
      throw error;
    }
  }

  /**
   * 等待实例就绪
   */
  private async waitForInstancesReady(
    instanceIds: string[],
    region: string
  ): Promise<void> {
    const maxAttempts = 60; // 最多等待 5 分钟
    const interval = 5000; // 每 5 秒检查一次

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const details = await this.getInstanceDetails(instanceIds, region);
      const allReady = details.every(
        (inst: any) => inst.InstanceState === 'RUNNING'
      );

      if (allReady) {
        logger.info('All instances are ready');
        return;
      }

      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error('Instances failed to become ready in time');
  }

  /**
   * 获取实例详情
   */
  private async getInstanceDetails(instanceIds: string[], region: string) {
    const result = await this.callMCPTool('tencent-cvm', 'describe_instances', {
      region,
      instance_ids: instanceIds
    });

    return result.data.InstanceSet;
  }

  /**
   * 上传部署脚本到 COS
   */
  private async uploadDeployScript(): Promise<void> {
    const deployScript = `
#!/bin/bash
# OpenClaw 自动部署脚本

set -e

echo "🚀 Deploying OpenClaw..."

# 安装 Docker
curl -fsSL https://get.docker.com | bash
systemctl enable docker
systemctl start docker

# 拉取 OpenClaw 镜像
docker pull ghcr.io/openclaw/agent:latest

# 启动 OpenClaw
docker run -d \\
  --name opclaw-agent \\
  -p 3000:3000 \\
  -v /var/lib/opclaw:/data \\
  -e DEEPSEEK_API_KEY="\${DEEPSEEK_API_KEY}" \\
  ghcr.io/openclaw/agent:latest

# 等待服务启动
sleep 10

# 获取本机 IP
LOCAL_IP=\$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)

# 注册到平台
curl -X POST "\${PLATFORM_API}/api/instances/register" \\
  -H "Content-Type: application/json" \\
  -d "{
    \\"instance_name\\": \\"OpenClaw-TencentCloud-\\$(hostname)\\",
    \\"ip_address\\": \\"\${LOCAL_IP}\\",
    \\"port\\": 3000,
    \\"connection_type\\": \\"remote\\",
    \\"api_endpoint\\": \\"http://\${LOCAL_IP}:3000\\"
  }"

echo "✅ OpenClaw deployed and registered!"
`;

    await this.callMCPTool('cos-mcp', 'upload_file', {
      bucket: 'aiopc-deploy-scripts',
      key: 'deploy-openclaw.sh',
      body: deployScript,
      contentType: 'text/x-shellscript'
    });

    logger.info('Deploy script uploaded to COS');
  }

  /**
   * 通过 TAT 部署 OpenClaw
   */
  private async deployOpenClaw(instanceId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // 获取部署脚本
      const script = await this.callMCPTool('cos-mcp', 'get_file', {
        bucket: 'aiopc-deploy-scripts',
        key: 'deploy-openclaw.sh'
      });

      // 通过 TAT 执行
      const result = await this.callMCPTool('tencent-tat', 'invoke_command', {
        region: 'ap-guangzhou',
        instance_ids: [instanceId],
        command_type: 'SHELL',
        command: script.body,
        timeout: 300,
        working_directory: '/root'
      });

      if (result.error) {
        throw new Error(result.error);
      }

      logger.info('OpenClaw deployed', { instance_id: instanceId });

      return { success: true };

    } catch (error) {
      logger.error('Failed to deploy OpenClaw', {
        instance_id: instanceId,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Deployment failed'
      };
    }
  }

  /**
   * 注册到平台
   */
  private async registerToPlatform(instance: any): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const publicIp = instance.PublicIpAddresses[0];

      const response = await fetch(`${process.env.PLATFORM_API}/api/instances/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instance_name: `OpenClaw-${instance.InstanceId}`,
          ip_address: publicIp,
          port: 3000,
          connection_type: 'remote',
          api_endpoint: `http://${publicIp}:3000`
        })
      });

      if (!response.ok) {
        throw new Error(`Registration failed: ${response.statusText}`);
      }

      logger.info('Instance registered to platform', {
        instance_id: instance.InstanceId,
        public_ip: publicIp
      });

      return { success: true };

    } catch (error) {
      logger.error('Failed to register instance', {
        instance_id: instance.InstanceId,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Registration failed'
      };
    }
  }

  /**
   * 判断实例是否闲置
   */
  private isIdle(instance: any, idleHours: number): boolean {
    // TODO: 从平台查询实例的使用情况
    // 这里简化处理：检查创建时间
    const createdTime = new Date(instance.CreatedTime);
    const hoursSinceCreation = (Date.now() - createdTime.getTime()) / (1000 * 60 * 60);

    return hoursSinceCreation > idleHours;
  }

  /**
   * 生成随机密码
   */
  private generatePassword(): string {
    const length = 16;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';

    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }

    return password;
  }

  /**
   * 调用 MCP 工具
   */
  private async callMCPTool(serverName: string, toolName: string, params: any): Promise<any> {
    // TODO: 实现 MCP 客户端调用
    // 这里需要集成实际的 MCP 客户端库

    logger.info('Calling MCP tool', {
      server: serverName,
      tool: toolName,
      params: JSON.stringify(params)
    });

    // 模拟调用
    return {
      success: true,
      data: {
        InstanceIdSet: ['ins-xxx'],
        InstanceSet: []
      }
    };
  }
}
```

#### 步骤 4: 创建 AI Orchestrator

**文件**: `src/services/AIOrchestratorService.ts` (新增)

```typescript
import { Service } from 'typedi';
import { AutoScalingService } from './AutoScalingService';
import { logger } from '../config/logger';

/**
 * AI Orchestrator Service
 * 连接 AI Assistant 和平台服务，实现 AI Native 自动化
 */
@Service()
export class AIOrchestratorService {
  constructor(private readonly autoScaling: AutoScalingService) {}

  /**
   * 处理 AI 请求
   *
   * 示例:
   * - "创建 3 个新实例"
   * - "释放 2 个闲置实例"
   * - "扩容到 10 个实例"
   */
  async handleAIRequest(request: {
    intent: string;
    parameters: Record<string, any>;
  }): Promise<{
    success: boolean;
    result?: any;
    error?: string;
  }> {
    try {
      logger.info('AI request received', {
        intent: request.intent,
        parameters: request.parameters
      });

      // 解析意图
      const intent = this.parseIntent(request.intent);

      // 执行对应操作
      switch (intent.action) {
        case 'create_instances':
          return await this.autoScaling.createInstance({
            count: intent.count,
            region: intent.region,
            instanceType: intent.instanceType
          });

        case 'terminate_instances':
          return await this.autoScaling.terminateIdleInstances({
            idleHours: intent.idleHours || 24,
            minInstances: intent.minInstances || 1
          });

        case 'scale_to':
          // 先查询当前实例数，再创建差额
          const currentCount = await this.getCurrentInstanceCount();
          const toCreate = Math.max(0, intent.count - currentCount);

          if (toCreate === 0) {
            return {
              success: true,
              result: {
                message: 'Already at desired capacity',
                current: currentCount,
                desired: intent.count
              }
            };
          }

          return await this.autoScaling.createInstance({
            count: toCreate
          });

        default:
          return {
            success: false,
            error: `Unknown intent: ${intent.action}`
          };
      }

    } catch (error) {
      logger.error('AI request failed', {
        intent: request.intent,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'AI request failed'
      };
    }
  }

  /**
   * 解析用户意图
   *
   * 支持的自然语言:
   * - "创建 3 个新实例" → { action: 'create_instances', count: 3 }
   * - "在广州区域创建 2 个大内存实例" → { action: 'create_instances', count: 2, region: 'ap-guangzhou', instanceType: 'MEMORY_LARGE' }
   * - "释放闲置实例" → { action: 'terminate_instances' }
   * - "扩容到 10 个实例" → { action: 'scale_to', count: 10 }
   */
  private parseIntent(naturalLanguage: string): {
    action: string;
    count?: number;
    region?: string;
    instanceType?: string;
    idleHours?: number;
    minInstances?: number;
  } {
    // TODO: 使用 NLP 或 LLM 解析自然语言
    // 这里简化处理，使用正则表达式

    const lower = naturalLanguage.toLowerCase();

    // 创建实例
    const createMatch = lower.match(/(?:创建|新增|添加)(\s*)(\d+)(\s*)个?(.*)实例/);
    if (createMatch) {
      return {
        action: 'create_instances',
        count: parseInt(createMatch[2]),
        instanceType: this.parseInstanceType(createMatch[4])
      };
    }

    // 扩容到
    const scaleMatch = lower.match(/(?:扩容|扩展)(?:到|至)(\s*)(\d+)(\s*)个?/);
    if (scaleMatch) {
      return {
        action: 'scale_to',
        count: parseInt(scaleMatch[2])
      };
    }

    // 释放实例
    const terminateMatch = lower.match(/(?:释放|删除|终止)(?:闲置|空闲)(\s*)实例/);
    if (terminateMatch) {
      return {
        action: 'terminate_instances'
      };
    }

    // 默认: 尝试创建 1 个实例
    return {
      action: 'create_instances',
      count: 1
    };
  }

  /**
   * 解析实例类型
   */
  private parseInstanceType(description: string): string {
    if (!description) return 'S5.MEDIUM4'; // 默认 4核8G

    const lower = description.toLowerCase();

    if (lower.includes('大内存') || lower.includes('memory')) {
      return 'M5.MEDIUM8'; // 大内存型
    }

    if (lower.includes('高io') || lower.includes('io')) {
      return 'I5.MEDIUM4'; // 高IO型
    }

    if (lower.includes('gpu') || lower.includes('计算')) {
      return 'GN10X.MEDIUM20'; // GPU型
    }

    return 'S5.MEDIUM4'; // 默认标准型
  }

  /**
   * 获取当前实例数
   */
  private async getCurrentInstanceCount(): Promise<number> {
    // TODO: 从数据库查询
    return 3;
  }
}
```

#### 步骤 5: 创建 AI 端点

**文件**: `src/controllers/AIOrchestrationController.ts` (新增)

```typescript
import { Controller, Post, Body } from 'routing-controllers';
import { AIOrchestratorService } from '../services/AIOrchestratorService';
import { Service } from 'typedi';

@Controller('/ai')
@Service()
export class AIOrchestrationController {
  constructor(
    private readonly orchestrator: AIOrchestratorService
  ) {}

  /**
   * AI 自动化端点
   * POST /ai/automate
   *
   * 用途: AI Assistant 调用此端点执行自动化操作
   *
   * 示例请求:
   * {
   *   "intent": "创建 3 个新实例",
   *   "parameters": {
   *     "region": "ap-guangzhou",
   *     "instance_type": "S5.MEDIUM4"
   *   }
   * }
   */
  @Post('/automate')
  async automate(@Body() body: {
    intent: string;
    parameters?: Record<string, any>;
  }) {
    const result = await this.orchestrator.handleAIRequest({
      intent: body.intent,
      parameters: body.parameters || {}
    });

    return result;
  }

  /**
   * 自然语言端点
   * POST /ai/chat
   *
   * 用途: 直接用自然语言与 AI 交互
   *
   * 示例请求:
   * {
   *   "message": "我们需要更多实例，现在就创建 2 个"
   * }
   */
  @Post('/chat')
  async chat(@Body() body: { message: string }) {
    // 直接转发到 automate
    return await this.orchestrator.handleAIRequest({
      intent: body.message,
      parameters: {}
    });
  }
}
```

---

## 使用示例

### 场景 1: 将已有实例加入资源池

```bash
# 在 101.34.254.52 上执行注册脚本
curl -sSL https://your-platform.com/scripts/register-to-platform.sh | \
  PLATFORM_API="https://your-platform.com" \
  INSTANCE_NAME="OpenClaw-TencentCloud-Primary" \
  bash
```

### 场景 2: AI Native 创建新实例

**方式 1: 通过 AI Assistant (Claude Desktop)**

```
用户: 帮我在腾讯云广州区域创建 3 个新的 OpenClaw 实例

Claude: 好的，我将为您创建 3 个新实例...
[调用 MCP 工具]
✅ 已成功创建 3 个实例:
- Instance 1: 101.34.xxx.1 (已部署并注册)
- Instance 2: 101.34.xxx.2 (已部署并注册)
- Instance 3: 101.34.xxx.3 (已部署并注册)

所有实例已加入资源池，用户现在可以扫码认领了。
```

**方式 2: 通过 API**

```bash
curl -X POST "https://your-platform.com/api/ai/automate" \
  -H "Content-Type: application/json" \
  -d '{
    "intent": "创建 3 个新实例",
    "parameters": {
      "region": "ap-guangzhou",
      "instance_type": "S5.MEDIUM4"
    }
  }'
```

**方式 3: 通过自然语言**

```bash
curl -X POST "https://your-platform.com/api/ai/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "我们需要更多实例，现在就创建 2 个"
  }'
```

### 场景 3: 自动释放闲置实例

```
用户: 释放超过 24 小时没有使用的实例

Claude: 好的，让我检查闲置实例...
[查询实例使用情况]
找到 2 个闲置超过 24 小时的实例:
- ins-xxx1 (空闲 48 小时)
- ins-xxx2 (空闲 30 小时)

确认释放这 2 个实例吗？(保留 1 个最小实例数)

用户: 确认

Claude: 正在释放实例...
✅ 已成功释放 2 个闲置实例
预计节省: ¥200/月
```

---

## 完整工作流

### 从 0 到 1: 自动扩缩容完整流程

```
1. 用户扫码登录
   ↓
2. OAuth 认证成功
   ↓
3. 检查可用实例 → 无可用实例
   ↓
4. AI Assistant 检测到需要扩容
   ↓
5. 调用 AI Orchestrator
   ↓
6. CVM MCP 创建新实例
   ↓
7. COS MCP 提供部署脚本
   ↓
8. TAT MCP 部署 OpenClaw
   ↓
9. 实例自动注册到平台
   ↓
10. 用户自动认领新实例
    ↓
11. 开始使用 OpenClaw
```

---

## 腾讯云 MCP 工具清单

### 可用的 MCP 服务器

| MCP 服务器 | 安装命令 | 主要工具 |
|-----------|---------|---------|
| **CVM** | `uvx mcp-server-cvm` | create_instances, terminate_instances, describe_instances |
| **TAT** | `uvx mcp-server-tat` | invoke_command, describe_commands |
| **COS** | `npx cos-mcp` | upload_file, download_file, list_files |
| **AS** | `uvx mcp-server-as` | create_scaling_policy, modify_scaling_policy |
| **VPC** | `go build ./src/vpc` | create_vpc, create_subnet |
| **CBS** | `go build ./src/cbs` | create_disk, attach_disk |

### 完整 MCP 列表
查看: https://github.com/TencentCloudCommunity/mcp-server

---

## 实施优先级

### P0 - 立即可做 (本周)
- [ ] 创建实例注册 API (`InstanceRegistrationController.ts`)
- [ ] 在 101.34.254.52 上执行注册脚本
- [ ] 验证实例成功加入资源池

### P1 - AI Native 自动化 (下周)
- [ ] 安装腾讯云 MCP 服务器
- [ ] 创建 `AutoScalingService.ts`
- [ ] 创建 `AIOrchestratorService.ts`
- [ ] 测试"创建实例"工作流

### P2 - 完善功能 (2 周内)
- [ ] 实现闲置实例自动释放
- [ ] 添加成本监控和优化
- [ ] 集成更多腾讯云服务 (监控、告警)

---

## 成本估算

### 腾讯云 CVM 成本 (广州区域)
| 实例类型 | 配置 | 价格/小时 | 价格/月 |
|---------|------|----------|--------|
| S5.MEDIUM4 | 4核8G | ¥0.62 | ¥446 |
| M5.MEDIUM8 | 4核16G | ¥0.93 | ¥669 |
| S5.LARGE8 | 8核16G | ¥1.24 | ¥893 |

### 自动扩缩容节省
- **手动模式**: 10 个实例 × ¥446 = ¥4,460/月
- **自动扩缩容**: 平均 3 个实例 × ¥446 = ¥1,338/月
- **节省**: 70% (¥3,122/月)

---

## 安全考虑

1. **API 密钥管理**
   - 使用腾讯云密钥管理服务 (KMS)
   - 定期轮换 SecretId/SecretKey

2. **实例注册认证**
   - 使用 instance_token 验证
   - 仅允许内网或 VPN 注册

3. **网络隔离**
   - 使用腾讯云 VPC 隔离
   - 安全组限制访问

4. **审计日志**
   - 记录所有 MCP 调用
   - 追踪实例创建/释放操作

---

## 下一步行动

1. **立即执行**: 注册 101.34.254.52 到资源池
2. **本周**: 创建实例注册 API
3. **下周**: 集成腾讯云 MCP，实现 AI Native 自动化
4. **2 周内**: 完整测试自动扩缩容流程

---

**文档版本**: v1.0
**最后更新**: 2026-03-16
**相关文档**:
- GAP_ANALYSIS_INSTANCE_CLAIM_CLOSED_LOOP.md
- IMPLEMENTATION_ROADMAP.md
