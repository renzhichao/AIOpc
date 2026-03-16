import { Controller, Post, Body, Req } from 'routing-controllers';
import { Service } from 'typedi';
import crypto from 'crypto';
import { FeishuWebhookService } from '../services/FeishuWebhookService';
import { logger } from '../config/logger';
import {
  FeishuWebhookRequest,
  FeishuWebhookResponse,
  FeishuWebhookEncryptedRequest,
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
   * 解密飞书加密请求
   * 根据飞书官方文档：https://open.feishu.cn/document/ukTMukTMukTM/uUTNz4SN1MjL1UzM
   * @param encryptString 加密字符串
   * @returns 解密后的 JSON 对象
   */
  private decryptRequest(encryptString: string): any {
    try {
      const encryptKey = process.env.FEISHU_ENCRYPT_KEY;
      if (!encryptKey) {
        throw new Error('FEISHU_ENCRYPT_KEY not configured');
      }

      // 根据飞书官方文档，Encrypt Key 需要先通过 SHA-256 哈希生成 32 字节密钥
      const key = crypto.createHash('sha256').update(encryptKey).digest();

      // Base64 解码加密字符串
      const encryptedBuffer = Buffer.from(encryptString, 'base64');

      // 提取 IV（前 16 字节）
      const iv = encryptedBuffer.slice(0, 16);
      const encryptedData = encryptedBuffer.slice(16);

      // 创建解密器 (AES-256-CBC)
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

      // 解密
      let decrypted = decipher.update(encryptedData);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      // 移除 PKCS7 填充
      const padding = decrypted[decrypted.length - 1];
      if (padding && padding <= 16) {
        decrypted = decrypted.slice(0, -padding);
      }

      // 解析 JSON
      const decryptedString = decrypted.toString('utf8');
      const result = JSON.parse(decryptedString);

      logger.info('Decrypted Feishu request', {
        type: result.type,
        has_challenge: !!result.challenge,
        has_token: !!result.token,
      });

      return result;
    } catch (error) {
      logger.error('Failed to decrypt Feishu request', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Webhook 事件接收端点
   * POST /feishu/events
   * @param request 请求对象
   * @param body 请求体（可能是加密格式或明文格式）
   * @returns Webhook 响应
   */
  @Post('/events')
  async handleWebhook(
    @Req() request: Request,
    @Body() body: any
  ): Promise<FeishuWebhookResponse> {
    const startTime = Date.now();

    try {
      let webhookBody: FeishuWebhookRequest;

      // 检测是否为加密格式请求
      if (body.encrypt) {
        logger.info('Received encrypted Feishu webhook request', {
          ip: request.ip,
          encrypt_length: body.encrypt.length,
        });

        // 解密请求
        try {
          webhookBody = this.decryptRequest(body.encrypt);
          logger.info('Successfully decrypted Feishu webhook request', {
            type: webhookBody.type,
            has_challenge: !!webhookBody.challenge,
            has_event: !!webhookBody.event,
          });
        } catch (error) {
          logger.error('Failed to decrypt Feishu webhook request', error);
          return {
            code: 401,
            msg: 'Decryption failed',
          };
        }
      } else {
        // 明文格式请求
        webhookBody = body as FeishuWebhookRequest;
        logger.info('Received plaintext Feishu webhook request', {
          ip: request.ip,
          type: webhookBody.type,
        });
      }

      // 可选：验证请求签名
      const timestamp = request.headers['x-feishu-timestamp'] as string;
      const signature = request.headers['x-feishu-signature'] as string;

      if (timestamp && signature) {
        const isValid = this.webhookService.validateSignature(webhookBody, signature, timestamp);
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
      const response = await this.webhookService.handleWebhook(webhookBody);

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
