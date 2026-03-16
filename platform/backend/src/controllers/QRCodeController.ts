import { Controller, Get, Post, Body, UseBefore, Param, Req } from 'routing-controllers';
import { Service } from 'typedi';
import { AuthRequest, AuthMiddleware } from '../middleware/AuthMiddleware';
import { QRCodeService } from '../services/QRCodeService';
import { logger } from '../config/logger';
import { AppError, ErrorCodes } from '../utils/errors';

/**
 * QR Code Controller
 *
 * TASK-003: Handles QR code generation and verification for instance claiming.
 * Supports "Scan-to-Enable" flow where users scan QR codes to claim instances.
 */
@Controller('/qrcode')
@Service()
export class QRCodeController {
  constructor(private readonly qrCodeService: QRCodeService) {}

  /**
   * Generate instance claim QR code
   * GET /qrcode/claim
   *
   * TASK-003: Checks if user already has an instance, if not generates a claim QR code.
   * This is the primary entry point for the "Scan-to-Enable" flow.
   *
   * Request headers:
   * - Authorization: Bearer <JWT_TOKEN>
   *
   * @param req - Authenticated request with user info
   * @returns QR code response or existing instance info
   *
   * @example
   * // User already has instance
   * {
   *   "success": true,
   *   "already_has_instance": true,
   *   "instance": { "id": "inst_123", "name": "My Instance", "status": "active" },
   *   "redirect_to": "/chat"
   * }
   *
   * @example
   * // User needs to claim instance
   * {
   *   "success": true,
   *   "already_has_instance": false,
   *   "qr_code": {
   *     "id": "qrc_123",
   *     "token": "abc123...",
   *     "expires_at": "2025-03-16T14:25:00.000Z",
   *     "image_url": "/api/qrcode/qrc_123/image",
   *     "scan_url": "http://localhost:5173/claim/abc123..."
   *   }
   * }
   */
  @Get('/claim')
  @UseBefore(AuthMiddleware)
  async generateClaimQRCode(@Req() req: AuthRequest): Promise<{
    success: boolean;
    already_has_instance?: boolean;
    instance?: {
      id: string;
      name: string;
      status: string;
    };
    qr_code?: {
      id: string;
      token: string;
      expires_at: Date;
      image_url: string;
      scan_url: string;
    };
    redirect_to?: string;
    error?: string;
  }> {
    try {
      const userId = req.user!.userId;

      // Check if user already has an instance
      const existingInstance = await this.qrCodeService.getUserInstance(userId);

      if (existingInstance) {
        logger.info('User already has instance', {
          userId,
          instanceId: existingInstance.instance_id,
        });

        return {
          success: true,
          already_has_instance: true,
          instance: {
            id: existingInstance.instance_id,
            name: existingInstance.name,
            status: existingInstance.status,
          },
          redirect_to: '/chat',
        };
      }

      // Generate claim QR code
      const claimQRCode = await this.qrCodeService.generateClaimQRCode(userId);

      logger.info('Generated claim QR code', {
        userId,
        qrCodeId: claimQRCode.id,
      });

      return {
        success: true,
        already_has_instance: false,
        qr_code: {
          id: claimQRCode.id,
          token: claimQRCode.token,
          expires_at: claimQRCode.expires_at,
          image_url: `/api/qrcode/${claimQRCode.id}/image`,
          scan_url: claimQRCode.scan_url,
        },
      };
    } catch (error) {
      logger.error('Failed to generate claim QR code', {
        userId: req.user!.userId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate QR code',
      };
    }
  }

  /**
   * Verify QR code and claim instance
   * POST /qrcode/claim/:token/verify
   *
   * TASK-003: Verifies QR code token and claims the instance for the authenticated user.
   * This endpoint is called after a user scans a QR code and selects an instance to claim.
   *
   * Request body:
   * {
   *   "instance_id": "inst_123",
   *   "token": "qr_token_xyz"
   * }
   *
   * @param body - Request body with instance_id and token
   * @returns Claim result
   *
   * @example
   * {
   *   "success": true,
   *   "instance": {
   *     "instance_id": "inst_123",
   *     "status": "active",
   *     "owner_id": 1
   *   }
   * }
   */
  @Post('/claim/:token/verify')
  async verifyClaimQRCode(@Body() body: {
    instance_id: string;
    token: string;
  }): Promise<{
    success: boolean;
    instance?: {
      instance_id: string;
      status: string;
      owner_id: number;
    };
    error?: string;
  }> {
    try {
      const { instance_id, token } = body;

      logger.info('Verifying QR code claim', {
        instance_id,
        token: token.substring(0, 10) + '...', // Log partial token for security
      });

      const result = await this.qrCodeService.verifyAndClaim(instance_id, token);

      logger.info('QR code claim successful', {
        instance_id,
        qrCodeToken: token.substring(0, 10) + '...',
      });

      return {
        success: true,
        instance: result,
      };
    } catch (error) {
      logger.error('Failed to verify QR code claim', {
        instance_id: body.instance_id,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Verification failed',
      };
    }
  }

  /**
   * Get QR code image
   * GET /qrcode/:id/image
   *
   * TASK-003: Returns QR code as image data URL.
   * This endpoint generates the actual QR code image for display.
   *
   * @param id - QR code ID
   * @returns Image data URL
   *
   * @example
   * {
   *   "success": true,
   *   "image_data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
   * }
   */
  @Get('/:id/image')
  async getQRCodeImage(@Param('id') id: string): Promise<{
    success: boolean;
    image_data?: string;
    error?: string;
  }> {
    try {
      const qrCode = await this.qrCodeService.findById(id);

      if (!qrCode) {
        return {
          success: false,
          error: 'QR code not found',
        };
      }

      // Generate QR code image (using qrcode library)
      const QRCode = require('qrcode');
      const imageDataURL = await QRCode.toDataURL(qrCode.scan_url);

      logger.info('Generated QR code image', { id });

      return {
        success: true,
        image_data: imageDataURL,
      };
    } catch (error) {
      logger.error('Failed to generate QR code image', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate image',
      };
    }
  }
}
