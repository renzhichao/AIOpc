import { Service } from 'typedi';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';
import { QRCodeRepository } from '../repositories/QRCodeRepository';
import { logger } from '../config/logger';
import { AppError, ErrorCodes } from '../utils/errors';

export interface QRCodeData {
  qr_code_url: string;
  expires_at: string;
}

@Service()
export class QRCodeService {
  constructor(
    private readonly qrCodeRepository: QRCodeRepository
  ) {}

  /**
   * Generate QR code for instance claim
   *
   * @param instanceId - The instance ID to generate QR code for
   * @returns QR code data containing URL and expiration time
   */
  async generateQRCode(instanceId: string): Promise<QRCodeData> {
    try {
      // 1. Generate token and signature
      const token = this.generateToken();
      const signature = this.generateSignature(token);

      // 2. Build OAuth URL
      const oauthUrl = this.buildOAuthUrl(instanceId, token, signature);

      // 3. Delete existing QR code for this instance (if any)
      await this.qrCodeRepository.deleteByInstanceId(instanceId);

      // 4. Save to database
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000); // 24 hours
      const state = `${instanceId}:${token}:${signature}`;

      await this.qrCodeRepository.create({
        instance_id: instanceId,
        token: token,
        state: state,
        expires_at: expiresAt,
        scan_count: 0,
        claimed_at: null,
      });

      logger.info(`QR code generated for instance: ${instanceId}`);

      return {
        qr_code_url: oauthUrl,
        expires_at: expiresAt.toISOString(),
      };
    } catch (error) {
      logger.error('Failed to generate QR code', error);
      throw new AppError(
        ErrorCodes.INTERNAL_ERROR.statusCode,
        ErrorCodes.INTERNAL_ERROR.code,
        'Failed to generate QR code'
      );
    }
  }

  /**
   * Validate QR token
   *
   * @param token - The token to validate
   * @returns true if token is valid and not expired, false otherwise
   */
  async validateQRToken(token: string): Promise<boolean> {
    try {
      const qrRecord = await this.qrCodeRepository.findByToken(token);

      if (!qrRecord) {
        logger.warn(`QR code token not found: ${token}`);
        return false;
      }

      // Check expiration
      if (new Date() > qrRecord.expires_at) {
        logger.warn(`QR code token expired: ${token}`);
        return false;
      }

      // Verify signature
      const parts = qrRecord.state.split(':');
      if (parts.length !== 3) {
        logger.warn(`Invalid QR code state format: ${qrRecord.state}`);
        return false;
      }

      const [instanceId, tokenPart, signature] = parts;

      if (!this.verifySignature(tokenPart, signature)) {
        logger.warn(`QR code signature verification failed: ${token}`);
        return false;
      }

      logger.info(`QR code token validated: ${token}`);
      return true;
    } catch (error) {
      logger.error('Failed to validate QR token', error);
      return false;
    }
  }

  /**
   * Record QR code scan
   *
   * @param token - The token to record scan for
   */
  async recordScan(token: string): Promise<void> {
    try {
      await this.qrCodeRepository.incrementScanCount(token);
      logger.info(`QR code scan recorded: ${token}`);
    } catch (error) {
      logger.error('Failed to record QR code scan', error);
    }
  }

  /**
   * Generate random token
   *
   * @returns Random 32-byte hex string
   */
  private generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generate HMAC signature for token
   *
   * @param token - The token to sign
   * @returns HMAC-SHA256 signature
   */
  private generateSignature(token: string): string {
    const secret = process.env.FEISHU_ENCRYPT_KEY || 'default-secret-key-change-in-production';
    return crypto
      .createHmac('sha256', secret)
      .update(token)
      .digest('hex');
  }

  /**
   * Verify token signature
   *
   * @param token - The token to verify
   * @param signature - The signature to verify against
   * @returns true if signature is valid, false otherwise
   */
  private verifySignature(token: string, signature: string): boolean {
    const expectedSignature = this.generateSignature(token);
    return signature === expectedSignature;
  }

  /**
   * Build OAuth URL for Feishu authorization
   *
   * @param instanceId - The instance ID
   * @param token - The QR code token
   * @param signature - The signature
   * @returns Complete OAuth authorization URL
   */
  private buildOAuthUrl(instanceId: string, token: string, signature: string): string {
    const appId = process.env.FEISHU_APP_ID;
    const redirectUri = process.env.FEISHU_REDIRECT_URI || 'http://localhost:5173/oauth/callback';
    const state = `${instanceId}:${token}:${signature}`;

    if (!appId) {
      throw new AppError(
        ErrorCodes.INTERNAL_ERROR.statusCode,
        ErrorCodes.INTERNAL_ERROR.code,
        'Feishu App ID not configured'
      );
    }

    const params = new URLSearchParams({
      app_id: appId,
      redirect_uri: redirectUri,
      state: state,
      scope: 'contact:user.base:readonly contact:user.email:readonly',
    });

    return `https://open.feishu.cn/open-apis/authen/v1/authorize?${params.toString()}`;
  }

  /**
   * Get QR code by instance ID
   *
   * @param instanceId - The instance ID
   * @returns QR code record or null
   */
  async getQRCodeByInstance(instanceId: string) {
    return this.qrCodeRepository.findByInstanceId(instanceId);
  }

  /**
   * Cleanup expired QR codes
   *
   * @returns Number of deleted records
   */
  async cleanupExpiredQRCodes(): Promise<number> {
    try {
      const expiredCodes = await this.qrCodeRepository.findExpired();
      const count = expiredCodes.length;

      await this.qrCodeRepository.deleteExpired();

      logger.info(`Cleaned up ${count} expired QR codes`);
      return count;
    } catch (error) {
      logger.error('Failed to cleanup expired QR codes', error);
      return 0;
    }
  }
}
