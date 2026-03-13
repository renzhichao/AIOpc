import { Controller, Post, Body, Req } from 'routing-controllers';
import { Service } from 'typedi';
import { FeishuWebhookService } from '../services/FeishuWebhookService';
import { logger } from '../config/logger';
import {
  FeishuWebhookRequest,
  FeishuWebhookResponse,
} from '../types/feishu-webhook.types';
import { Request } from 'express';

/**
 * 飞书 Webhook 控制器
 * 处理飞书事件推送
 */
@Controller('/feishu')
@Service()
export class FeishuWebhookController {
  constructor(
    private readonly webhookService: FeishuWebhookService
  ) {}

  /**
   * Webhook 事件接收端点
   * POST /feishu/events
   * @param request 请求对象
   * @param body 请求体
   * @returns Webhook 响应
   */
  @Post('/events')
  async handleWebhook(
    @Req() request: Request,
    @Body() body: FeishuWebhookRequest
  ): Promise<FeishuWebhookResponse> {
    const startTime = Date.now();

    try {
      // 记录请求信息
      logger.info('Received Feishu webhook request', {
        ip: request.ip,
        headers: {
          'x-feishu-timestamp': request.headers['x-feishu-timestamp'],
          'x-feishu-signature': request.headers['x-feishu-signature'],
        },
        type: body.type,
      });

      // 可选：验证请求签名
      const timestamp = request.headers['x-feishu-timestamp'] as string;
      const signature = request.headers['x-feishu-signature'] as string;

      if (timestamp && signature) {
        const isValid = this.webhookService.validateSignature(body, signature, timestamp);
        if (!isValid) {
          logger.error('Invalid request signature', {
            timestamp,
            signature,
          });
          return {
            code: 403,
            msg: 'Invalid signature',
          };
        }
      }

      // 处理 Webhook 请求
      const response = await this.webhookService.handleWebhook(body);

      // 记录处理时间
      const duration = Date.now() - startTime;
      logger.info('Webhook request processed', {
        duration: `${duration}ms`,
        response_code: response.code,
      });

      return response;
    } catch (error) {
      // 记录错误
      const duration = Date.now() - startTime;
      logger.error('Failed to handle webhook request', {
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: `${duration}ms`,
      });

      // 返回错误响应
      return {
        code: 500,
        msg: 'Internal server error',
      };
    }
  }

  /**
   * 健康检查端点 (用于测试 Webhook 连接)
   * POST /feishu/health
   * @returns 健康状态
   */
  @Post('/health')
  healthCheck(): { status: string; message: string } {
    return {
      status: 'ok',
      message: 'Feishu webhook service is running',
    };
  }
}
