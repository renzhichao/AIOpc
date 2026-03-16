# 实例认领闭环 - 实施路线图

**文档版本**: v1.0
**创建日期**: 2026-03-16
**预计完成**: 6-8 周

---

## 快速导航

- [P0 - 关键路径任务 (Week 1-3)](#p0---关键路径任务-week-1-3)
- [P1 - 用户体验增强 (Week 4-5)](#p1---用户体验增强-week-4-5)
- [P2 - 生产就绪功能 (Week 6-7)](#p2---生产就绪功能-week-6-7)
- [任务依赖图](#任务依赖图)
- [每日工作清单](#每日工作清单)

---

## P0 - 关键路径任务 (Week 1-3)

### 目标
实现最基本的"扫码→认领→对话"闭环功能

### Week 1: 认证与认领集成

#### Day 1-2: OAuth 认领集成

**Task 1.1: 修改 OAuthService 添加认领逻辑**
- **文件**: `src/services/OAuthService.ts`
- **优先级**: P0
- **估时**: 4-6 小时
- **依赖**: 无
- **实现内容**:
  ```typescript
  // 在 handleCallback 方法中添加
  async handleCallback(authCode: string): Promise<OAuthTokenResponse> {
    // ... 现有登录逻辑 ...

    // 新增：检查并自动认领实例
    const unclaimedInstance = await this.instanceRepository.findUnclaimed();
    let claimedInstance = null;

    if (unclaimedInstance) {
      claimedInstance = await this.instanceService.claimInstance(
        unclaimedInstance.id,
        user.id
      );

      logger.info('Auto-claimed instance for user', {
        userId: user.id,
        instanceId: unclaimedInstance.id
      });
    }

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: parseInt(process.env.JWT_EXPIRES_IN || '604800'),
      token_type: 'Bearer',
      user: {
        id: user.id,
        feishu_user_id: user.feishu_user_id,
        name: user.name,
        email: user.email
      },
      // 新增字段
      has_instance: !!claimedInstance,
      instance_id: claimedInstance?.id,
      redirect_to: claimedInstance ? '/chat' : '/no-instance'
    };
  }
  ```
- **测试**:
  - 单元测试：验证自动认领逻辑
  - 集成测试：验证登录→认领流程

---

**Task 1.2: 创建 JWT 认证中间件**
- **文件**: `src/middleware/AuthMiddleware.ts` (新增)
- **优先级**: P0
- **估时**: 2-3 小时
- **依赖**: 无
- **实现内容**:
  ```typescript
  import { Request, Response, NextFunction } from 'express';
  import { Container } from 'typedi';
  import { OAuthService } from '../services/OAuthService';

  export interface AuthRequest extends Request {
    user?: {
      userId: number;
      feishuUserId: string;
      name: string;
      email?: string;
    };
  }

  export function AuthMiddleware(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Missing or invalid authorization header'
        });
      }

      const token = authHeader.substring(7);

      // 验证 JWT Token
      const oauthService = Container.get(OAuthService);
      const payload = oauthService.verifyToken(token);

      req.user = payload;
      next();
    } catch (error) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired token'
      });
    }
  }

  // 可选：白名单路由
  export function OptionalAuthMiddleware(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const authHeader = req.headers.authorization;

      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const oauthService = Container.get(OAuthService);
        const payload = oauthService.verifyToken(token);
        req.user = payload;
      }

      next();
    } catch (error) {
      // 静默失败，继续处理请求
      next();
    }
  }
  ```
- **测试**:
  - 测试有效 token 通过
  - 测试无效 token 拒绝
  - 测试过期 token 拒绝
  - 测试缺失 header 处理

---

**Task 1.3: 修改 QRCodeController 支持认领二维码**
- **文件**: `src/controllers/QRCodeController.ts` (修改)
- **优先级**: P0
- **估时**: 3-4 小时
- **依赖**: Task 1.2
- **实现内容**:
  ```typescript
  import { Controller, Get, Post, Body, UseBefore } from 'routing-controllers';
  import { AuthMiddleware, AuthRequest } from '../middleware/AuthMiddleware';
  import { QRCodeService } from '../services/QRCodeService';
  import { Service } from 'typedi';

  @Controller('/qrcode')
  @Service()
  export class QRCodeController {
    constructor(private readonly qrCodeService: QRCodeService) {}

    /**
     * 生成实例认领二维码
     * GET /qrcode/claim
     */
    @Get('/claim')
    @UseBefore(AuthMiddleware)
    async generateClaimQRCode(req: AuthRequest) {
      try {
        const userId = req.user!.userId;

        // 检查用户是否已有实例
        const existingInstance = await this.qrCodeService.getUserInstance(userId);

        if (existingInstance) {
          return {
            success: true,
            already_has_instance: true,
            instance: {
              id: existingInstance.id,
              name: existingInstance.name,
              status: existingInstance.status
            },
            redirect_to: '/chat'
          };
        }

        // 生成认领二维码
        const claimQRCode = await this.qrCodeService.generateClaimQRCode(userId);

        return {
          success: true,
          already_has_instance: false,
          qr_code: {
            id: claimQRCode.id,
            token: claimQRCode.token,
            expires_at: claimQRCode.expires_at,
            // QR Code 图片 URL (由前端生成或使用第三方 API)
            image_url: `/api/qrcode/${claimQRCode.id}/image`,
            scan_url: `${process.env.FRONTEND_URL}/claim/${claimQRCode.token}`
          }
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }

    /**
     * 验证并处理二维码扫描
     * POST /qrcode/claim/:token/verify
     */
    @Post('/claim/:token/verify')
    async verifyClaimQRCode(@Body() body: { instance_id: string }) {
      try {
        const result = await this.qrCodeService.verifyAndClaim(
          body.instance_id,
          body.token
        );

        return {
          success: true,
          instance: result
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Verification failed'
        };
      }
    }

    /**
     * 获取二维码图片 (可选，使用 qrcode 库生成)
     * GET /qrcode/:id/image
     */
    @Get('/:id/image')
    async getQRCodeImage(@Param('id') id: string) {
      try {
        const qrCode = await this.qrCodeService.findById(id);

        if (!qrCode) {
          return { error: 'QR code not found' };
        }

        // 使用 qrcode 库生成图片
        const QRCode = require('qrcode');
        const imageDataURL = await QRCode.toDataURL(qrCode.scan_url);

        return {
          success: true,
          image_data: imageDataURL
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to generate image'
        };
      }
    }
  }
  ```
- **测试**:
  - 测试二维码生成
  - 测试已有实例用户的处理
  - 测试二维码验证和认领

---

#### Day 3-4: 前端登录页面

**Task 1.4: 修改前端登录页面显示 QR Code**
- **文件**: `frontend/src/pages/Login.tsx` (修改)
- **优先级**: P0
- **估时**: 4-6 小时
- **依赖**: Task 1.3
- **实现内容**:
  ```typescript
  import { useEffect, useState } from 'react';
  import { useNavigate } from 'react-router-dom';
  import { login } from '../services/auth';

  interface LoginResponse {
    access_token: string;
    refresh_token: string;
    user: {
      id: number;
      name: string;
      email?: string;
    };
    has_instance: boolean;
    instance_id?: string;
    redirect_to: string;
  }

  export default function Login() {
    const navigate = useNavigate();
    const [step, setStep] = useState<'login' | 'qrcode' | 'no-instance'>('login');
    const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
    const [user, setUser] = useState<{ name: string } | null>(null);

    // 处理 OAuth 回调
    useEffect(() => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');

      if (code) {
        handleCallback(code);
      }
    }, []);

    const handleCallback = async (code: string) => {
      try {
        const response = await login(code);
        const data: LoginResponse = response.data;

        // 保存 token
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('refresh_token', data.refresh_token);

        setUser(data.user);

        // 根据是否有实例决定跳转
        if (data.has_instance) {
          // 已有实例，直接跳转到聊天页面
          navigate('/chat');
        } else {
          // 没有实例，显示认领二维码
          setStep('qrcode');
          loadQRCode();
        }
      } catch (error) {
        console.error('Login failed:', error);
        alert('登录失败，请重试');
      }
    };

    const loadQRCode = async () => {
      try {
        const token = localStorage.getItem('access_token');
        const response = await fetch('/api/qrcode/claim', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        const data = await response.json();

        if (data.already_has_instance) {
          // 用户已获得实例（可能是其他用户释放的）
          navigate('/chat');
          return;
        }

        // 显示 QR Code
        setQrCodeUrl(data.qr_code.image_url);
      } catch (error) {
        console.error('Failed to load QR code:', error);
      }
    };

    // 轮询检查是否已认领到实例
    useEffect(() => {
      if (step === 'qrcode') {
        const interval = setInterval(async () => {
          try {
            const token = localStorage.getItem('access_token');
            const response = await fetch('/api/qrcode/claim', {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            });

            const data = await response.json();

            if (data.already_has_instance) {
              clearInterval(interval);
              navigate('/chat');
            }
          } catch (error) {
            console.error('Polling failed:', error);
          }
        }, 3000); // 每 3 秒检查一次

        return () => clearInterval(interval);
      }
    }, [step]);

    const handleFeishuLogin = () => {
      const authUrl = process.env.VITE_FEISHU_AUTH_URL;
      window.location.href = authUrl;
    };

    return (
      <div className="login-container">
        <div className="login-box">
          {step === 'login' && (
            <>
              <h1>欢迎使用 OpenClaw</h1>
              <p>请使用飞书账号登录</p>
              <button onClick={handleFeishuLogin}>
                <img src="/feishu-logo.png" alt="Feishu" />
                飞书登录
              </button>
            </>
          )}

          {step === 'qrcode' && (
            <>
              <h1>认领您的 OpenClaw 实例</h1>
              <p>您好，{user?.name}！</p>
              <p>请使用飞书扫描下方二维码认领实例</p>

              {qrCodeUrl && (
                <div className="qrcode-container">
                  <img src={qrCodeUrl} alt="Claim QR Code" />
                  <p className="hint">
                    二维码有效期 5 分钟，请及时扫描
                  </p>
                </div>
              )}

              <div className="loading">
                <p>等待认领中...</p>
                <div className="spinner" />
              </div>
            </>
          )}

          {step === 'no-instance' && (
            <>
              <h1>暂无可用实例</h1>
              <p>抱歉，当前没有可用的 OpenClaw 实例</p>
              <p>请联系管理员添加更多实例</p>
            </>
          )}
        </div>
      </div>
    );
  }
  ```
- **CSS 样式** (`frontend/src/pages/Login.css`):
  ```css
  .login-container {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  }

  .login-box {
    background: white;
    padding: 40px;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
    text-align: center;
    max-width: 400px;
  }

  .login-box h1 {
    margin-bottom: 10px;
    color: #333;
  }

  .login-box p {
    color: #666;
    margin-bottom: 20px;
  }

  .login-box button {
    background: #00b96b;
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 auto;
  }

  .qrcode-container {
    margin: 20px 0;
  }

  .qrcode-container img {
    max-width: 200px;
    border: 2px solid #ddd;
    border-radius: 8px;
    padding: 10px;
  }

  .hint {
    font-size: 14px;
    color: #999;
    margin-top: 10px;
  }

  .loading {
    margin-top: 20px;
  }

  .spinner {
    border: 3px solid #f3f3f3;
    border-top: 3px solid #00b96b;
    border-radius: 50%;
    width: 30px;
    height: 30px;
    animation: spin 1s linear infinite;
    margin: 10px auto;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  ```

---

#### Day 5: 集成测试

**Task 1.5: 端到端测试登录→认领流程**
- **文件**: `tests/integration/oauth-claim-flow.test.ts` (新增)
- **优先级**: P0
- **估时**: 4-6 小时
- **依赖**: Task 1.1 - 1.4
- **测试场景**:
  ```typescript
  import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
  import { OAuthService } from '../../src/services/OAuthService';
  import { InstanceService } from '../../src/services/InstanceService';
  import { QRCodeService } from '../../src/services/QRCodeService';

  describe('OAuth → Claim Flow', () => {
    let oauthService: OAuthService;
    let instanceService: InstanceService;
    let qrCodeService: QRCodeService;

    beforeAll(() => {
      // 初始化服务
    });

    afterAll(() => {
      // 清理测试数据
    });

    it('should create unclaimed instance', async () => {
      const instance = await instanceService.create({
        name: 'Test Instance',
        connection_type: 'local',
        status: 'pending'
      });

      expect(instance.status).toBe('pending');
      expect(instance.user_id).toBeNull();
    });

    it('should login user and auto-claim instance', async () => {
      // 模拟 OAuth 回调
      const response = await oauthService.handleCallback('test_auth_code');

      expect(response.has_instance).toBe(true);
      expect(response.instance_id).toBeDefined();
      expect(response.redirect_to).toBe('/chat');
    });

    it('should not claim instance when none available', async () => {
      // 删除所有可用实例
      await instanceService.deleteAll();

      const response = await oauthService.handleCallback('test_auth_code');

      expect(response.has_instance).toBe(false);
      expect(response.redirect_to).toBe('/no-instance');
    });

    it('should generate QR code for user without instance', async () => {
      const userId = 1;

      const qrCode = await qrCodeService.generateClaimQRCode(userId);

      expect(qrCode.token).toBeDefined();
      expect(qrCode.type).toBe('claim');
      expect(qrCode.expires_at).toBeDefined();
    });

    it('should verify and claim instance via QR code', async () => {
      const instance = await instanceService.create({
        name: 'QR Test Instance',
        connection_type: 'local',
        status: 'pending'
      });

      const qrCode = await qrCodeService.generateClaimQRCode(1);

      const claimed = await qrCodeService.verifyAndClaim(
        instance.id,
        qrCode.token
      );

      expect(claimed.user_id).toBe(1);
      expect(claimed.status).toBe('active');
    });
  });
  ```

---

### Week 2: WebSocket 通信

#### Day 6-7: WebSocket Gateway

**Task 2.1: 创建 WebSocket Gateway 服务**
- **文件**: `src/services/WebSocketGateway.ts` (新增)
- **优先级**: P0
- **估时**: 6-8 小时
- **依赖**: Task 1.2
- **实现内容**:
  ```typescript
  import { Service } from 'typedi';
  import WebSocket, { WebSocketServer } from 'ws';
  import jwt from 'jsonwebtoken';
  import { logger } from '../config/logger';
  import { InstanceRegistry } from './InstanceRegistry';
  import { OAuthService } from './OAuthService';

  interface WebSocketClient {
    ws: WebSocket;
    userId: number;
    instanceId?: string;
    isAlive: boolean;
  }

  interface ChatMessage {
    type: 'user_message' | 'instance_response' | 'error' | 'status';
    content: string;
    timestamp: string;
    metadata?: Record<string, any>;
  }

  @Service()
  export class WebSocketGateway {
    private wss: WebSocketServer;
    private clients: Map<number, WebSocketClient> = new Map();
    private instanceRegistry: InstanceRegistry;
    private oauthService: OAuthService;

    constructor(
      instanceRegistry: InstanceRegistry,
      oauthService: OAuthService
    ) {
      this.instanceRegistry = instanceRegistry;
      this.oauthService = oauthService;

      // 初始化 WebSocket 服务器
      this.wss = new WebSocketServer({
        port: parseInt(process.env.WS_PORT || '3001'),
        perMessageDeflate: false
      });

      this.setupServer();
      this.startHeartbeat();
    }

    private setupServer() {
      this.wss.on('connection', async (ws: WebSocket, req) => {
        try {
          // 验证 JWT Token
          const token = this.extractToken(req);

          if (!token) {
            ws.close(1008, 'Unauthorized');
            return;
          }

          const payload = this.oauthService.verifyToken(token);
          const userId = payload.userId;

          // 获取用户的实例
          const instance = await this.instanceRegistry.getUserInstance(userId);

          if (!instance) {
            ws.close(1008, 'No instance found');
            return;
          }

          // 创建客户端
          const client: WebSocketClient = {
            ws,
            userId,
            instanceId: instance.id,
            isAlive: true
          };

          this.clients.set(userId, client);

          logger.info('WebSocket client connected', {
            userId,
            instanceId: instance.id
          });

          // 发送欢迎消息
          this.sendToClient(userId, {
            type: 'status',
            content: 'Connected to OpenClaw instance',
            timestamp: new Date().toISOString(),
            metadata: {
              instance_name: instance.name,
              instance_status: instance.status
            }
          });

          // 处理消息
          ws.on('message', async (data) => {
            await this.handleMessage(userId, data);
          });

          // 处理断开
          ws.on('close', () => {
            this.clients.delete(userId);
            logger.info('WebSocket client disconnected', { userId });
          });

          // 处理错误
          ws.on('error', (error) => {
            logger.error('WebSocket error', {
              userId,
              error: error.message
            });
          });

          // 处理 pong
          ws.on('pong', () => {
            if (this.clients.has(userId)) {
              this.clients.get(userId)!.isAlive = true;
            }
          });

        } catch (error) {
          logger.error('WebSocket connection failed', {
            error: error instanceof Error ? error.message : String(error)
          });
          ws.close(1011, 'Internal server error');
        }
      });
    }

    private extractToken(req): string | null {
      const url = new URL(req.url, `http://${req.headers.host}`);
      return url.searchParams.get('token');
    }

    private async handleMessage(userId: number, data: WebSocket.Data) {
      try {
        const message: ChatMessage = JSON.parse(data.toString());

        logger.info('Received message from user', {
          userId,
          messageType: message.type,
          contentLength: message.content?.length
        });

        // 路由消息到实例
        await this.routeMessageToInstance(userId, message);

      } catch (error) {
        logger.error('Failed to handle message', {
          userId,
          error: error instanceof Error ? error.message : String(error)
        });

        this.sendToClient(userId, {
          type: 'error',
          content: 'Failed to process message',
          timestamp: new Date().toISOString()
        });
      }
    }

    private async routeMessageToInstance(userId: number, message: ChatMessage) {
      const client = this.clients.get(userId);

      if (!client) {
        logger.error('Client not found', { userId });
        return;
      }

      try {
        // 获取实例连接信息
        const instanceInfo = await this.instanceRegistry.getInstanceInfo(
          client.instanceId!
        );

        if (!instanceInfo) {
          throw new Error('Instance not found in registry');
        }

        if (instanceInfo.connection_type === 'local') {
          // 本地实例：通过 HTTP API 发送
          await this.sendToLocalInstance(instanceInfo, message);
        } else {
          // 远程实例：通过 Tunnel 发送
          await this.sendToRemoteInstance(instanceInfo, message);
        }

      } catch (error) {
        logger.error('Failed to route message to instance', {
          userId,
          instanceId: client.instanceId,
          error: error instanceof Error ? error.message : String(error)
        });

        this.sendToClient(userId, {
          type: 'error',
          content: 'Failed to send message to instance',
          timestamp: new Date().toISOString()
        });
      }
    }

    private async sendToLocalInstance(
      instanceInfo: any,
      message: ChatMessage
    ) {
      // 调用本地 OpenClaw 实例的 API
      const response = await fetch(
        `${instanceInfo.api_endpoint}/chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${instanceInfo.api_key}`
          },
          body: JSON.stringify({
            message: message.content,
            user_id: message.metadata?.userId,
            timestamp: message.timestamp
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Instance API error: ${response.status}`);
      }

      const responseData = await response.json();

      // 将响应转发回用户
      this.sendToClient(message.metadata?.userId, {
        type: 'instance_response',
        content: responseData.reply || responseData.message,
        timestamp: new Date().toISOString(),
        metadata: {
          original_message: message.content,
          response_id: responseData.id
        }
      });
    }

    private async sendToRemoteInstance(
      instanceInfo: any,
      message: ChatMessage
    ) {
      // 通过 Tunnel 发送到远程实例
      const tunnel = await this.instanceRegistry.getTunnel(instanceInfo.id);

      if (!tunnel) {
        throw new Error('Tunnel not available');
      }

      // 使用 Tunnel 发送消息
      await tunnel.send({
        type: 'user_message',
        payload: message
      });
    }

    public sendToClient(userId: number, message: ChatMessage) {
      const client = this.clients.get(userId);

      if (client && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(message));
      }
    }

    public forwardInstanceResponse(
      instanceId: string,
      response: ChatMessage
    ) {
      // 查找使用该实例的用户
      for (const [userId, client] of this.clients.entries()) {
        if (client.instanceId === instanceId) {
          this.sendToClient(userId, response);
          break;
        }
      }
    }

    private startHeartbeat() {
      setInterval(() => {
        this.wss.clients.forEach((ws) => {
          const client = this.findClientByWs(ws);

          if (client) {
            if (client.isAlive === false) {
              this.clients.delete(client.userId);
              return ws.terminate();
            }

            client.isAlive = false;
            ws.ping();
          }
        });
      }, 30000); // 每 30 秒检查一次
    }

    private findClientByWs(ws: WebSocket): WebSocketClient | undefined {
      for (const client of this.clients.values()) {
        if (client.ws === ws) {
          return client;
        }
      }
      return undefined;
    }

    public broadcast(message: ChatMessage) {
      for (const [userId, client] of this.clients.entries()) {
        this.sendToClient(userId, message);
      }
    }
  }
  ```
- **测试**:
  - 测试 WebSocket 连接建立
  - 测试消息发送和接收
  - 测试连接断开处理
  - 测试心跳机制

---

**Task 2.2: 创建 Instance Registry**
- **文件**: `src/services/InstanceRegistry.ts` (新增)
- **优先级**: P0
- **估时**: 4-6 小时
- **依赖**: 无
- **实现内容**:
  ```typescript
  import { Service } from 'typedi';
  import { InstanceRepository } from '../repositories/InstanceRepository';
  import { logger } from '../config/logger';

  interface InstanceInfo {
    instance: any;
    connection_type: 'local' | 'remote';
    api_endpoint?: string;
    api_key?: string;
    tunnel?: any;
    status: 'online' | 'offline' | 'error';
    lastHeartbeat: number;
  }

  @Service()
  export class InstanceRegistry {
    private registry: Map<string, InstanceInfo> = new Map();
    private instanceRepository: InstanceRepository;

    constructor(instanceRepository: InstanceRepository) {
      this.instanceRepository = instanceRepository;
      this.startHealthCheck();
    }

    /**
     * 注册新实例
     */
    async registerInstance(
      instanceId: string,
      connectionInfo: Partial<InstanceInfo>
    ) {
      const instance = await this.instanceRepository.findById(instanceId);

      if (!instance) {
        throw new Error(`Instance ${instanceId} not found`);
      }

      const info: InstanceInfo = {
        instance,
        connection_type: connectionInfo.connection_type || 'local',
        api_endpoint: connectionInfo.api_endpoint,
        api_key: connectionInfo.api_key,
        tunnel: connectionInfo.tunnel,
        status: 'online',
        lastHeartbeat: Date.now()
      };

      this.registry.set(instanceId, info);

      logger.info('Instance registered', {
        instanceId,
        connectionType: info.connection_type
      });

      return info;
    }

    /**
     * 注销实例
     */
    unregisterInstance(instanceId: string) {
      this.registry.delete(instanceId);

      logger.info('Instance unregistered', { instanceId });
    }

    /**
     * 获取用户的实例
     */
    async getUserInstance(userId: number): Promise<any> {
      const instance = await this.instanceRepository.findByUserId(userId);

      if (!instance) {
        return null;
      }

      // 更新心跳时间
      const info = this.registry.get(instance.id);
      if (info) {
        info.lastHeartbeat = Date.now();
      }

      return instance;
    }

    /**
     * 获取实例信息
     */
    getInstanceInfo(instanceId: string): InstanceInfo | null {
      return this.registry.get(instanceId) || null;
    }

    /**
     * 获取实例的 Tunnel
     */
    async getTunnel(instanceId: string): Promise<any> {
      const info = this.registry.get(instanceId);

      if (!info || !info.tunnel) {
        return null;
      }

      return info.tunnel;
    }

    /**
     * 更新实例状态
     */
    updateInstanceStatus(
      instanceId: string,
      status: 'online' | 'offline' | 'error'
    ) {
      const info = this.registry.get(instanceId);

      if (info) {
        info.status = status;
        info.lastHeartbeat = Date.now();

        logger.info('Instance status updated', {
          instanceId,
          status
        });
      }
    }

    /**
     * 检查实例健康状态
     */
    async healthCheck(instanceId: string): Promise<boolean> {
      const info = this.registry.get(instanceId);

      if (!info) {
        return false;
      }

      const timeSinceHeartbeat = Date.now() - info.lastHeartbeat;
      const isHealthy = timeSinceHeartbeat < 30000; // 30 秒内活跃

      if (!isHealthy && info.status !== 'offline') {
        this.updateInstanceStatus(instanceId, 'offline');

        logger.warn('Instance marked as offline', {
          instanceId,
          timeSinceHeartbeat
        });
      }

      return isHealthy;
    }

    /**
     * 启动健康检查定时器
     */
    private startHealthCheck() {
      setInterval(async () => {
        for (const [instanceId] of this.registry.entries()) {
          await this.healthCheck(instanceId);
        }
      }, 15000); // 每 15 秒检查一次
    }

    /**
     * 获取所有在线实例
     */
    getOnlineInstances(): string[] {
      const online: string[] = [];

      for (const [instanceId, info] of this.registry.entries()) {
        if (info.status === 'online') {
          online.push(instanceId);
        }
      }

      return online;
    }

    /**
     * 获取注册统计
     */
    getStats() {
      return {
        total: this.registry.size,
        online: this.getOnlineInstances().length,
        offline: this.registry.size - this.getOnlineInstances().length
      };
    }
  }
  ```
- **测试**:
  - 测试实例注册/注销
  - 测试健康检查机制
  - 测试状态更新

---

#### Day 8-9: 消息路由

**Task 2.3: 完善 MessageRouter 服务**
- **文件**: `src/services/MessageRouter.ts` (修改)
- **优先级**: P0
- **估时**: 4-6 小时
- **依赖**: Task 2.1, Task 2.2
- **实现内容**:
  ```typescript
  import { Service } from 'typedi';
  import { InstanceRegistry } from './InstanceRegistry';
  import { WebSocketGateway } from './WebSocketGateway';
  import { logger } from '../config/logger';

  interface MessageContext {
    userId: number;
    instanceId: string;
    messageId: string;
    timestamp: number;
  }

  @Service()
  export class MessageRouter {
    private instanceRegistry: InstanceRegistry;
    private wsGateway: WebSocketGateway;
    private messageQueue: Map<string, MessageContext[]> = new Map();

    constructor(
      instanceRegistry: InstanceRegistry,
      wsGateway: WebSocketGateway
    ) {
      this.instanceRegistry = instanceRegistry;
      this.wsGateway = wsGateway;
    }

    /**
     * 路由用户消息到实例
     */
    async routeUserMessage(
      userId: number,
      content: string,
      metadata?: Record<string, any>
    ): Promise<string> {
      // 获取用户实例
      const instance = await this.instanceRegistry.getUserInstance(userId);

      if (!instance) {
        throw new Error('User has no assigned instance');
      }

      // 检查实例在线状态
      const isOnline = await this.instanceRegistry.healthCheck(instance.id);

      if (!isOnline) {
        throw new Error('Instance is offline');
      }

      // 生成消息 ID
      const messageId = this.generateMessageId();

      // 创建消息上下文
      const context: MessageContext = {
        userId,
        instanceId: instance.id,
        messageId,
        timestamp: Date.now()
      };

      // 获取实例连接信息
      const instanceInfo = this.instanceRegistry.getInstanceInfo(instance.id);

      if (!instanceInfo) {
        throw new Error('Instance not found in registry');
      }

      // 根据连接类型路由消息
      try {
        if (instanceInfo.connection_type === 'local') {
          await this.sendToLocalInstance(instanceInfo, content, context);
        } else {
          await this.sendToRemoteInstance(instanceInfo, content, context);
        }

        // 保存到队列（用于重试）
        this.addToQueue(instance.id, context);

        logger.info('Message routed successfully', {
          messageId,
          userId,
          instanceId: instance.id
        });

        return messageId;

      } catch (error) {
        logger.error('Failed to route message', {
          messageId,
          userId,
          instanceId: instance.id,
          error: error instanceof Error ? error.message : String(error)
        });

        throw error;
      }
    }

    /**
     * 发送消息到本地实例
     */
    private async sendToLocalInstance(
      instanceInfo: any,
      content: string,
      context: MessageContext
    ) {
      const response = await fetch(
        `${instanceInfo.api_endpoint}/api/chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${instanceInfo.api_key}`
          },
          body: JSON.stringify({
            message: content,
            user_id: context.userId,
            message_id: context.messageId,
            timestamp: context.timestamp
          }),
          timeout: 30000 // 30 秒超时
        }
      );

      if (!response.ok) {
        throw new Error(`Instance API error: ${response.status}`);
      }

      const responseData = await response.json();

      // 转发响应给用户
      this.wsGateway.sendToClient(context.userId, {
        type: 'instance_response',
        content: responseData.reply || responseData.message,
        timestamp: new Date().toISOString(),
        metadata: {
          message_id: context.messageId,
          response_id: responseData.id
        }
      });

      // 从队列移除
      this.removeFromQueue(context.instanceId, context.messageId);
    }

    /**
     * 发送消息到远程实例
     */
    private async sendToRemoteInstance(
      instanceInfo: any,
      content: string,
      context: MessageContext
    ) {
      const tunnel = await this.instanceRegistry.getTunnel(
        context.instanceId
      );

      if (!tunnel) {
        throw new Error('Tunnel not available');
      }

      // 通过 Tunnel 发送
      await tunnel.send({
        type: 'chat',
        payload: {
          message: content,
          user_id: context.userId,
          message_id: context.messageId,
          timestamp: context.timestamp
        }
      });

      // 远程实例的响应会通过异步回调处理
      // 这里只是发送，不等待响应
    }

    /**
     * 处理远程实例的响应
     */
    async handleRemoteInstanceResponse(
      instanceId: string,
      response: any
    ) {
      // 从队列中获取消息上下文
      const context = this.findInQueue(instanceId, response.message_id);

      if (!context) {
        logger.warn('Message context not found', {
          instanceId,
          messageId: response.message_id
        });
        return;
      }

      // 转发响应给用户
      this.wsGateway.sendToClient(context.userId, {
        type: 'instance_response',
        content: response.reply || response.message,
        timestamp: new Date().toISOString(),
        metadata: {
          message_id: context.messageId,
          response_id: response.id
        }
      });

      // 从队列移除
      this.removeFromQueue(instanceId, context.messageId);
    }

    /**
     * 添加到消息队列
     */
    private addToQueue(instanceId: string, context: MessageContext) {
      if (!this.messageQueue.has(instanceId)) {
        this.messageQueue.set(instanceId, []);
      }

      this.messageQueue.get(instanceId)!.push(context);
    }

    /**
     * 从队列移除
     */
    private removeFromQueue(instanceId: string, messageId: string) {
      const queue = this.messageQueue.get(instanceId);

      if (queue) {
        const index = queue.findIndex(c => c.messageId === messageId);

        if (index !== -1) {
          queue.splice(index, 1);
        }
      }
    }

    /**
     * 在队列中查找
     */
    private findInQueue(
      instanceId: string,
      messageId: string
    ): MessageContext | undefined {
      const queue = this.messageQueue.get(instanceId);

      if (!queue) {
        return undefined;
      }

      return queue.find(c => c.messageId === messageId);
    }

    /**
     * 生成消息 ID
     */
    private generateMessageId(): string {
      return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 重试失败的消息
     */
    async retryFailedMessages(instanceId: string) {
      const queue = this.messageQueue.get(instanceId);

      if (!queue || queue.length === 0) {
        return;
      }

      logger.info('Retrying failed messages', {
        instanceId,
        count: queue.length
      });

      // 复制队列以避免在迭代时修改
      const messagesToRetry = [...queue];

      for (const context of messagesToRetry) {
        const timeSinceSent = Date.now() - context.timestamp;

        // 只重试 1 分钟内发送的消息
        if (timeSinceSent > 60000) {
          this.removeFromQueue(instanceId, context.messageId);
          continue;
        }

        try {
          const instanceInfo = this.instanceRegistry.getInstanceInfo(instanceId);

          if (instanceInfo && instanceInfo.status === 'online') {
            // 重新发送
            if (instanceInfo.connection_type === 'local') {
              // 本地实例重新发送
              // ... (实现重试逻辑)
            } else {
              // 远程实例重试
              // ... (实现重试逻辑)
            }
          }
        } catch (error) {
          logger.error('Retry failed', {
            messageId: context.messageId,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }
  }
  ```

---

#### Day 10: Chat Controller

**Task 2.4: 创建 Chat Controller**
- **文件**: `src/controllers/ChatController.ts` (新增)
- **优先级**: P0
- **估时**: 3-4 小时
- **依赖**: Task 2.1, Task 2.3
- **实现内容**:
  ```typescript
  import { Controller, Post, Body, UseBefore, Get } from 'routing-controllers';
  import { AuthMiddleware, AuthRequest } from '../middleware/AuthMiddleware';
  import { MessageRouter } from '../services/MessageRouter';
  import { Service } from 'typedi';

  @Controller('/chat')
  @Service()
  export class ChatController {
    constructor(private readonly messageRouter: MessageRouter) {}

    /**
     * 发送消息到实例
     * POST /chat/send
     */
    @Post('/send')
    @UseBefore(AuthMiddleware)
    async sendMessage(
      @Body() body: { content: string; metadata?: Record<string, any> },
      req: AuthRequest
    ) {
      try {
        const userId = req.user!.userId;

        if (!body.content || body.content.trim().length === 0) {
          return {
            success: false,
            error: 'Message content is required'
          };
        }

        const messageId = await this.messageRouter.routeUserMessage(
          userId,
          body.content,
          body.metadata
        );

        return {
          success: true,
          message_id: messageId,
          timestamp: new Date().toISOString()
        };

      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to send message'
        };
      }
    }

    /**
     * 获取聊天历史
     * GET /chat/history
     */
    @Get('/history')
    @UseBefore(AuthMiddleware)
    async getChatHistory(
      req: AuthRequest,
      @Query('limit') limit: number = 50,
      @Query('before') before?: string
    ) {
      try {
        const userId = req.user!.userId;

        // TODO: 实现消息持久化后完成此功能
        // const messages = await this.messageRepository.getHistory(
        //   userId,
        //   limit,
        //   before
        // );

        return {
          success: true,
          messages: [],
          message: 'Message history not implemented yet'
        };

      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get history'
        };
      }
    }

    /**
     * 获取实例状态
     * GET /chat/status
     */
    @Get('/status')
    @UseBefore(AuthMiddleware)
    async getInstanceStatus(req: AuthRequest) {
      try {
        const userId = req.user!.userId;

        // TODO: 从 InstanceRegistry 获取状态
        return {
          success: true,
          status: {
            connected: true,
            instance_online: true,
            messages_sent: 0,
            messages_received: 0
          }
        };

      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get status'
        };
      }
    }
  }
  ```

---

### Week 3: 前端聊天界面

#### Day 11-12: WebSocket 客户端

**Task 3.1: 创建前端 WebSocket 服务**
- **文件**: `frontend/src/services/websocket.ts` (新增)
- **优先级**: P0
- **估时**: 4-6 小时
- **依赖**: Task 2.1
- **实现内容**:
  ```typescript
  import { useEffect, useRef, useCallback } from 'react';

  export type ChatMessage = {
    type: 'user_message' | 'instance_response' | 'error' | 'status';
    content: string;
    timestamp: string;
    metadata?: Record<string, any>;
  };

  export type WebSocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

  export function useWebSocket() {
    const wsRef = useRef<WebSocket | null>(null);
    const statusRef = useRef<WebSocketStatus>('disconnected');
    const messageHandlersRef = useRef<Set<(message: ChatMessage) => void>>(new Set());
    const statusHandlersRef = useRef<Set<(status: WebSocketStatus) => void>>(new Set());
    const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

    // 连接 WebSocket
    const connect = useCallback(() => {
      const token = localStorage.getItem('access_token');

      if (!token) {
        statusRef.current = 'error';
        notifyStatusHandlers('error');
        return;
      }

      statusRef.current = 'connecting';
      notifyStatusHandlers('connecting');

      try {
        const wsUrl = `${process.env.VITE_WS_URL || 'ws://localhost:3001'}?token=${token}`;
        const ws = new WebSocket(wsUrl);

        wsRef.current = ws;

        ws.onopen = () => {
          console.log('WebSocket connected');
          statusRef.current = 'connected';
          notifyStatusHandlers('connected');

          // 清除重连定时器
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
          }
        };

        ws.onmessage = (event) => {
          try {
            const message: ChatMessage = JSON.parse(event.data);
            notifyMessageHandlers(message);
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          statusRef.current = 'error';
          notifyStatusHandlers('error');
        };

        ws.onclose = (event) => {
          console.log('WebSocket closed:', event.code, event.reason);
          statusRef.current = 'disconnected';
          notifyStatusHandlers('disconnected');

          // 自动重连
          if (event.code !== 1000) {
            reconnectTimeoutRef.current = setTimeout(() => {
              console.log('Attempting to reconnect...');
              connect();
            }, 3000);
          }
        };

      } catch (error) {
        console.error('Failed to connect WebSocket:', error);
        statusRef.current = 'error';
        notifyStatusHandlers('error');
      }
    }, []);

    // 断开连接
    const disconnect = useCallback(() => {
      if (wsRef.current) {
        wsRef.current.close(1000, 'User disconnected');
        wsRef.current = null;
      }

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      statusRef.current = 'disconnected';
      notifyStatusHandlers('disconnected');
    }, []);

    // 发送消息
    const sendMessage = useCallback((content: string, metadata?: Record<string, any>) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        const message = {
          type: 'user_message',
          content,
          timestamp: new Date().toISOString(),
          metadata
        };

        wsRef.current.send(JSON.stringify(message));
        return true;
      } else {
        console.error('WebSocket is not connected');
        return false;
      }
    }, []);

    // 注册消息处理器
    const onMessage = useCallback((handler: (message: ChatMessage) => void) => {
      messageHandlersRef.current.add(handler);

      return () => {
        messageHandlersRef.current.delete(handler);
      };
    }, []);

    // 注册状态处理器
    const onStatusChange = useCallback((handler: (status: WebSocketStatus) => void) => {
      statusHandlersRef.current.add(handler);

      return () => {
        statusHandlersRef.current.delete(handler);
      };
    }, []);

    // 获取当前状态
    const getStatus = useCallback(() => {
      return statusRef.current;
    }, []);

    // 通知所有消息处理器
    const notifyMessageHandlers = (message: ChatMessage) => {
      messageHandlersRef.current.forEach(handler => {
        try {
          handler(message);
        } catch (error) {
          console.error('Message handler error:', error);
        }
      });
    };

    // 通知所有状态处理器
    const notifyStatusHandlers = (status: WebSocketStatus) => {
      statusHandlersRef.current.forEach(handler => {
        try {
          handler(status);
        } catch (error) {
          console.error('Status handler error:', error);
        }
      });
    };

    // 组件卸载时断开连接
    useEffect(() => {
      return () => {
        disconnect();
      };
    }, [disconnect]);

    return {
      connect,
      disconnect,
      sendMessage,
      onMessage,
      onStatusChange,
      getStatus
    };
  }
  ```

---

**Task 3.2: 创建聊天组件**
- **文件**:
  - `frontend/src/components/ChatRoom.tsx` (新增)
  - `frontend/src/components/MessageList.tsx` (新增)
  - `frontend/src/components/MessageInput.tsx` (新增)
  - `frontend/src/components/ConnectionStatus.tsx` (新增)
- **优先级**: P0
- **估时**: 8-12 小时
- **依赖**: Task 3.1

**ChatRoom.tsx**:
```typescript
import { useEffect, useState } from 'react';
import { useWebSocket, ChatMessage, WebSocketStatus } from '../services/websocket';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { ConnectionStatus } from './ConnectionStatus';
import './ChatRoom.css';

export default function ChatRoom() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<WebSocketStatus>('disconnected');
  const { connect, disconnect, sendMessage, onMessage, onStatusChange, getStatus } = useWebSocket();

  useEffect(() => {
    // 连接 WebSocket
    connect();

    // 监听消息
    const unsubscribeMessage = onMessage((message) => {
      setMessages(prev => [...prev, message]);
    });

    // 监听状态变化
    const unsubscribeStatus = onStatusChange((newStatus) => {
      setStatus(newStatus);
    });

    return () => {
      unsubscribeMessage();
      unsubscribeStatus();
      disconnect();
    };
  }, [connect, disconnect, onMessage, onStatusChange]);

  const handleSendMessage = (content: string) => {
    const success = sendMessage(content);

    if (success) {
      // 添加用户消息到列表
      setMessages(prev => [...prev, {
        type: 'user_message',
        content,
        timestamp: new Date().toISOString()
      }]);
    }
  };

  return (
    <div className="chat-room">
      <div className="chat-header">
        <h1>OpenClaw Assistant</h1>
        <ConnectionStatus status={status} />
      </div>

      <MessageList messages={messages} />

      <MessageInput
        onSend={handleSendMessage}
        disabled={status !== 'connected'}
      />
    </div>
  );
}
```

**MessageList.tsx**:
```typescript
import { ChatMessage } from '../services/websocket';
import './MessageList.css';

interface MessageListProps {
  messages: ChatMessage[];
}

export function MessageList({ messages }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="message-list">
      {messages.length === 0 && (
        <div className="empty-state">
          <p>开始与 OpenClaw Assistant 对话吧！</p>
        </div>
      )}

      {messages.map((message, index) => (
        <div
          key={index}
          className={`message ${message.type === 'user_message' ? 'user' : 'assistant'}`}
        >
          <div className="message-content">
            {message.type === 'error' && (
              <span className="error-icon">⚠️ </span>
            )}
            {message.content}
          </div>
          <div className="message-timestamp">
            {new Date(message.timestamp).toLocaleTimeString()}
          </div>
        </div>
      ))}

      <div ref={messagesEndRef} />
    </div>
  );
}
```

**MessageInput.tsx**:
```typescript
import { useState, KeyboardEvent } from 'react';
import './MessageInput.css';

interface MessageInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
}

export function MessageInput({ onSend, disabled }: MessageInputProps) {
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (input.trim() && !disabled) {
      onSend(input.trim());
      setInput('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="message-input">
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
        disabled={disabled}
        rows={1}
      />
      <button
        onClick={handleSend}
        disabled={disabled || !input.trim()}
        className="send-button"
      >
        发送
      </button>
    </div>
  );
}
```

**ConnectionStatus.tsx**:
```typescript
import { WebSocketStatus } from '../services/websocket';
import './ConnectionStatus.css';

interface ConnectionStatusProps {
  status: WebSocketStatus;
}

export function ConnectionStatus({ status }: ConnectionStatusProps) {
  const statusConfig = {
    connecting: {
      text: '连接中...',
      icon: '⏳',
      className: 'connecting'
    },
    connected: {
      text: '已连接',
      icon: '🟢',
      className: 'connected'
    },
    disconnected: {
      text: '已断开',
      icon: '🔴',
      className: 'disconnected'
    },
    error: {
      text: '连接错误',
      icon: '❌',
      className: 'error'
    }
  };

  const config = statusConfig[status];

  return (
    <div className={`connection-status ${config.className}`}>
      <span className="status-icon">{config.icon}</span>
      <span className="status-text">{config.text}</span>
    </div>
  );
}
```

**CSS 样式**:
```css
/* ChatRoom.css */
.chat-room {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f5f5f5;
}

.chat-header {
  background: white;
  padding: 16px 24px;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chat-header h1 {
  margin: 0;
  font-size: 20px;
  color: #333;
}

/* MessageList.css */
.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.empty-state {
  text-align: center;
  color: #999;
  margin-top: 100px;
}

.message {
  display: flex;
  flex-direction: column;
  max-width: 70%;
}

.message.user {
  align-self: flex-end;
  align-items: flex-end;
}

.message.assistant {
  align-self: flex-start;
  align-items: flex-start;
}

.message-content {
  padding: 12px 16px;
  border-radius: 12px;
  word-wrap: break-word;
  white-space: pre-wrap;
}

.message.user .message-content {
  background: #00b96b;
  color: white;
  border-bottom-right-radius: 4px;
}

.message.assistant .message-content {
  background: white;
  color: #333;
  border: 1px solid #e0e0e0;
  border-bottom-left-radius: 4px;
}

.message.error .message-content {
  background: #ffebee;
  color: #c62828;
  border: 1px solid #ef9a9a;
}

.message-timestamp {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}

.error-icon {
  margin-right: 4px;
}

/* MessageInput.css */
.message-input {
  background: white;
  padding: 16px 24px;
  border-top: 1px solid #e0e0e0;
  display: flex;
  gap: 12px;
  align-items: flex-end;
}

.message-input textarea {
  flex: 1;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 14px;
  font-family: inherit;
  resize: none;
  min-height: 44px;
  max-height: 120px;
}

.message-input textarea:focus {
  outline: none;
  border-color: #00b96b;
}

.message-input textarea:disabled {
  background: #f5f5f5;
  cursor: not-allowed;
}

.send-button {
  background: #00b96b;
  color: white;
  border: none;
  padding: 10px 24px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  height: 44px;
}

.send-button:hover:not(:disabled) {
  background: #00a05e;
}

.send-button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

/* ConnectionStatus.css */
.connection-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
}

.connection-status.connected {
  color: #00b96b;
}

.connection-status.connecting {
  color: #ff9800;
}

.connection-status.disconnected,
.connection-status.error {
  color: #f44336;
}
```

---

#### Day 13-14: 端到端测试

**Task 3.3: 端到端测试聊天功能**
- **文件**: `tests/e2e/chat-flow.test.ts` (新增)
- **优先级**: P0
- **估时**: 6-8 小时
- **依赖**: Task 1.1 - Task 3.2
- **测试场景**:
  ```typescript
  import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
  import { OAuthService } from '../../src/services/OAuthService';
  import { WebSocketGateway } from '../../src/services/WebSocketGateway';
  import { InstanceRegistry } from '../../src/services/InstanceRegistry';
  import { MessageRouter } from '../../src/services/MessageRouter';

  describe('Chat Flow E2E', () => {
    let oauthService: OAuthService;
    let wsGateway: WebSocketGateway;
    let instanceRegistry: InstanceRegistry;
    let messageRouter: MessageRouter;
    let testUser: any;
    let testInstance: any;

    beforeAll(async () => {
      // 初始化服务
      // 创建测试用户和实例
    });

    afterAll(async () => {
      // 清理测试数据
      // 关闭服务
    });

    it('should login user via OAuth', async () => {
      const response = await oauthService.handleCallback('test_auth_code');

      expect(response.access_token).toBeDefined();
      expect(response.user).toBeDefined();
      expect(response.has_instance).toBe(true);

      testUser = response.user;
      testInstance = response.instance_id;
    });

    it('should establish WebSocket connection', async () => {
      const ws = new WebSocket(
        `ws://localhost:3001?token=${testUser.access_token}`
      );

      await new Promise((resolve, reject) => {
        ws.on('open', () => resolve(true));
        ws.on('error', reject);
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });

      expect(ws.readyState).toBe(WebSocket.OPEN);

      ws.close();
    });

    it('should send message and receive response', async (done) => {
      const ws = new WebSocket(
        `ws://localhost:3001?token=${testUser.access_token}`
      );

      ws.on('open', () => {
        // 发送测试消息
        ws.send(JSON.stringify({
          type: 'user_message',
          content: 'Hello, OpenClaw!',
          timestamp: new Date().toISOString()
        }));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());

        if (message.type === 'instance_response') {
          expect(message.content).toBeDefined();
          ws.close();
          done();
        }
      });

      ws.on('error', (error) => {
        ws.close();
        done(error);
      });
    });

    it('should handle multiple concurrent messages', async (done) => {
      const messages: string[] = [];
      const expectedResponses = 3;

      const ws = new WebSocket(
        `ws://localhost:3001?token=${testUser.access_token}`
      );

      ws.on('open', () => {
        // 发送多条消息
        for (let i = 0; i < expectedResponses; i++) {
          ws.send(JSON.stringify({
            type: 'user_message',
            content: `Test message ${i + 1}`,
            timestamp: new Date().toISOString()
          }));
        }
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());

        if (message.type === 'instance_response') {
          messages.push(message.content);

          if (messages.length === expectedResponses) {
            expect(messages.length).toBe(expectedResponses);
            ws.close();
            done();
          }
        }
      });

      ws.on('error', (error) => {
        ws.close();
        done(error);
      });
    });
  });
  ```

---

## P1 - 用户体验增强 (Week 4-5)

### Week 4: 实例管理界面

#### Day 15-16: 实例管理页面

**Task 4.1: 创建实例管理页面**
- **文件**: `frontend/src/pages/InstanceManagement.tsx` (新增)
- **优先级**: P1
- **估时**: 6-8 小时
- **功能**:
  - 显示用户当前实例信息
  - 显示实例状态（在线/离线）
  - 显示资源使用情况（CPU、内存）
  - 提供重启/停止实例功能（如果有权限）

#### Day 17-18: 消息历史

**Task 4.2: 实现消息持久化**
- **文件**:
  - `src/entities/Message.entity.ts` (新增)
  - `src/repositories/MessageRepository.ts` (新增)
- **优先级**: P1
- **估时**: 4-6 小时
- **功能**:
  - 保存所有消息到数据库
  - 支持分页查询历史消息
  - 支持按时间范围筛选

#### Day 19-20: 用户设置

**Task 4.3: 创建用户设置页面**
- **文件**: `frontend/src/pages/Settings.tsx` (新增)
- **优先级**: P1
- **估时**: 4-6 小时
- **功能**:
  - 修改用户名
  - 上传头像
  - 偏好设置（主题、字体大小等）

---

### Week 5: UI/UX 优化

#### Day 21-22: 响应式设计

**Task 5.1: 优化移动端体验**
- **文件**: `frontend/src/styles/responsive.css` (新增)
- **优先级**: P1
- **估时**: 4-6 小时
- **内容**:
  - 适配小屏幕设备
  - 触摸友好的交互
  - 移动端专用导航

#### Day 23-24: 加载状态和错误处理

**Task 5.2: 完善加载和错误状态**
- **文件**: 多个组件文件
- **优先级**: P1
- **估时**: 3-4 小时
- **内容**:
  - Loading 组件
  - ErrorBoundary 组件
  - 优雅的错误提示

---

## P2 - 生产就绪功能 (Week 6-7)

### Week 6: 监控与日志

#### Day 25-26: 监控指标收集

**Task 6.1: 实现指标收集服务**
- **文件**: `src/services/MetricsCollectionService.ts` (修改，已有基础代码)
- **优先级**: P2
- **估时**: 4-6 小时
- **功能**:
  - CPU、内存使用率
  - 消息吞吐量
  - 响应时间
  - 错误率

#### Day 27-28: 日志聚合

**Task 6.2: 部署 Loki 和 Promtail**
- **文件**: `deployment/docker-compose.monitoring.yml` (新增)
- **优先级**: P2
- **估时**: 3-4 小时
- **功能**:
  - 集中收集所有服务日志
  - 支持全文搜索
  - 创建 Grafana 面板

---

### Week 7: 备份与恢复

#### Day 29-30: 数据库备份

**Task 7.1: 实现自动备份**
- **文件**: `scripts/backup.sh` (新增)
- **优先级**: P2
- **估时**: 3-4 小时
- **功能**:
  - PostgreSQL 自动备份
  - 上传到 S3/本地存储
  - 备份验证

#### Day 31-32: 灾难恢复

**Task 7.2: 编写灾难恢复文档**
- **文件**: `docs/disaster-recovery.md` (新增)
- **优先级**: P2
- **估时**: 2-3 小时
- **内容**:
  - 恢复步骤
  - RTO/RPO 目标
  - 测试恢复流程

---

## 任务依赖图

```
OAuth → Claim 集成 (Task 1.1)
    ├─→ JWT 中间件 (Task 1.2)
    │     └─→ QR Code Controller (Task 1.3)
    │           └─→ 前端登录页面 (Task 1.4)
    │                 └─→ 集成测试 (Task 1.5)
    │
WebSocket Gateway (Task 2.1)
    ├─→ Instance Registry (Task 2.2)
    │     └─→ MessageRouter 完善 (Task 2.3)
    │           └─→ Chat Controller (Task 2.4)
    │
    └─→ 前端 WebSocket 服务 (Task 3.1)
          └─→ 聊天组件 (Task 3.2)
                └─→ E2E 测试 (Task 3.3)
```

---

## 每日工作清单

### Week 1
- Day 1-2: OAuth 认领集成 (Task 1.1-1.3)
- Day 3-4: 前端登录页面 (Task 1.4)
- Day 5: 集成测试 (Task 1.5)

### Week 2
- Day 6-7: WebSocket Gateway (Task 2.1)
- Day 8-9: Instance Registry + MessageRouter (Task 2.2-2.3)
- Day 10: Chat Controller (Task 2.4)

### Week 3
- Day 11-12: WebSocket 客户端 (Task 3.1)
- Day 13-14: 聊天组件 (Task 3.2)
- Day 15: E2E 测试 (Task 3.3)

### Week 4-5 (P1)
- Day 16-20: 实例管理 + 消息历史
- Day 21-24: UI/UX 优化

### Week 6-7 (P2)
- Day 25-28: 监控与日志
- Day 29-32: 备份与恢复

---

## 里程碑

### Milestone 1: MVP 闭环 (Week 3)
- ✅ 用户可以登录
- ✅ 用户可以认领实例
- ✅ 用户可以发送消息
- ✅ 用户可以接收回复

### Milestone 2: 完整产品 (Week 5)
- ✅ 实例管理界面
- ✅ 消息历史记录
- ✅ 用户体验优化

### Milestone 3: 生产就绪 (Week 7)
- ✅ 完整监控
- ✅ 自动备份
- ✅ 灾难恢复

---

**文档版本**: v1.0
**最后更新**: 2026-03-16
**下一步**: 开始 Week 1 Day 1 - OAuth 认领集成
