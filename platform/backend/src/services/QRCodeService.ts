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
   * @param instanceId - The instance ID (database primary key, number) to generate QR code for
   * @returns QR code data containing URL and expiration time
   */
  async generateQRCode(instanceId: number): Promise<QRCodeData> {
    try {
      // 1. Generate token and signature
      const token = this.generateToken();
      const signature = this.generateSignature(token);

      // 2. Build OAuth URL
      const oauthUrl = this.buildOAuthUrl(instanceId.toString(), token, signature);

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
   * Get QR code by instance business ID (e.g., "inst_123")
   * Note: This queries by the instance's database primary key, not the business ID
   *
   * @param instanceId - The instance business ID (string)
   * @returns QR code record or null
   */
  async getQRCodeByInstance(instanceId: string) {
    // TODO: Need to lookup instance by business ID first to get database primary key
    // For now, this method signature accepts string but converts to number for the query
    // This assumes the caller passes a numeric string or we need to add instance lookup
    const numericId = parseInt(instanceId, 10);
    if (isNaN(numericId)) {
      logger.warn(`Invalid instance ID format for QR lookup: ${instanceId}`);
      return null;
    }
    return this.qrCodeRepository.findByInstanceId(numericId);
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

  /**
   * Generate claim QR code for a user
   * TASK-003: Creates a QR code that allows claiming an unassigned instance
   *
   * @param userId - The user ID requesting the QR code
   * @returns QR code data with token and expiration
   */
  async generateClaimQRCode(userId: number): Promise<{
    id: string;
    token: string;
    expires_at: Date;
    type: string;
    scan_url: string;
  }> {
    try {
      // Generate token
      const token = this.generateToken();
      const signature = this.generateSignature(token);

      // Create scan URL for frontend
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const scanUrl = `${frontendUrl}/claim/${token}`;

      // Set expiration (5 minutes)
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      // Save to database
      // For claim QR codes, use 0 as placeholder instance_id (will be updated when claimed)
      // Note: Real instance IDs start from 1, so 0 is safe to use as placeholder
      const qrCode = await this.qrCodeRepository.create({
        instance_id: 0, // Placeholder: will be replaced with actual instance ID when claimed
        token: token,
        state: `${userId}:${token}:${signature}`,
        expires_at: expiresAt,
        scan_count: 0,
        claimed_at: null,
      });

      logger.info(`Generated claim QR code for user: ${userId}`, {
        qrCodeId: qrCode.id.toString(),
        userId,
      });

      return {
        id: qrCode.id.toString(), // Convert number ID to string
        token: qrCode.token,
        expires_at: expiresAt,
        type: 'claim',
        scan_url: scanUrl,
      };
    } catch (error) {
      logger.error('Failed to generate claim QR code', error);
      throw new AppError(
        ErrorCodes.INTERNAL_ERROR.statusCode,
        ErrorCodes.INTERNAL_ERROR.code,
        'Failed to generate claim QR code'
      );
    }
  }

  /**
   * Verify QR code and claim an instance for the user
   * TASK-003: Verifies token and assigns an available instance to the user
   *
   * @param instanceId - The instance ID to claim
   * @param token - The QR code token
   * @returns Claimed instance data
   */
  async verifyAndClaim(
    instanceId: string,
    token: string
  ): Promise<{
    instance_id: string;
    status: string;
    owner_id: number;
  }> {
    try {
      // Validate token
      const isValid = await this.validateQRToken(token);
      if (!isValid) {
        throw new AppError(
          ErrorCodes.VALIDATION_ERROR.statusCode,
          ErrorCodes.VALIDATION_ERROR.code,
          'Invalid or expired QR code token'
        );
      }

      // Get QR code record to extract user ID
      const qrRecord = await this.qrCodeRepository.findByToken(token);
      if (!qrRecord) {
        throw new AppError(
          ErrorCodes.NOT_FOUND.statusCode,
          ErrorCodes.NOT_FOUND.code,
          'QR code not found'
        );
      }

      // Extract user ID from state
      const stateParts = qrRecord.state.split(':');
      if (stateParts.length !== 3) {
        throw new AppError(
          ErrorCodes.VALIDATION_ERROR.statusCode,
          ErrorCodes.VALIDATION_ERROR.code,
          'Invalid QR code state format'
        );
      }

      const userId = parseInt(stateParts[0], 10);
      if (isNaN(userId)) {
        throw new AppError(
          ErrorCodes.VALIDATION_ERROR.statusCode,
          ErrorCodes.VALIDATION_ERROR.code,
          'Invalid user ID in QR code'
        );
      }

      // Import InstanceRepository dynamically to avoid circular dependency
      const { InstanceRepository } = await import('../repositories/InstanceRepository');
      const instanceRepo = new InstanceRepository();

      // Claim the instance
      await instanceRepo.claimInstance(instanceId, userId);

      // Mark QR code as claimed
      await this.qrCodeRepository.markAsClaimed(token);

      // Get the claimed instance
      const instance = await instanceRepo.findByInstanceId(instanceId);
      if (!instance) {
        throw new AppError(
          ErrorCodes.NOT_FOUND.statusCode,
          ErrorCodes.NOT_FOUND.code,
          'Instance not found after claiming'
        );
      }

      logger.info(`Instance claimed successfully`, {
        instanceId,
        userId,
        qrCodeId: qrRecord.id,
      });

      return {
        instance_id: instance.instance_id,
        status: instance.status,
        owner_id: instance.owner_id || userId,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error('Failed to verify and claim instance', {
        instanceId,
        token: token.substring(0, 10) + '...',
        error: error instanceof Error ? error.message : String(error),
      });

      throw new AppError(
        ErrorCodes.INTERNAL_ERROR.statusCode,
        ErrorCodes.INTERNAL_ERROR.code,
        'Failed to claim instance'
      );
    }
  }

  /**
   * Get user's existing instance
   * TASK-003: Checks if user already has an instance assigned
   *
   * @param userId - The user ID to check
   * @returns User's instance or null if none exists
   */
  async getUserInstance(userId: number): Promise<{
    instance_id: string;
    name: string;
    status: string;
  } | null> {
    try {
      // Import InstanceRepository dynamically to avoid circular dependency
      const { InstanceRepository } = await import('../repositories/InstanceRepository');
      const instanceRepo = new InstanceRepository();

      const instances = await instanceRepo.findByOwnerId(userId);

      if (instances.length === 0) {
        return null;
      }

      // Return the first (most recent) instance
      const instance = instances[0];

      return {
        instance_id: instance.instance_id,
        name: instance.name,
        status: instance.status,
      };
    } catch (error) {
      logger.error('Failed to get user instance', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Find QR code by ID
   * TASK-003: Retrieves QR code record for image generation
   *
   * @param id - The QR code ID (string representation of numeric ID)
   * @returns QR code record or null
   */
  async findById(id: string): Promise<{
    id: string;
    token: string;
    scan_url: string;
    expires_at: Date;
  } | null> {
    try {
      // The QRCode.id is a number, but we receive it as string
      // Try to find by token first (since that's what we're passing as ID in the controller)
      let qrCode = await this.qrCodeRepository.findByToken(id);

      // If not found by token, try by numeric ID
      if (!qrCode) {
        const numericId = parseInt(id, 10);
        if (!isNaN(numericId)) {
          qrCode = await this.qrCodeRepository.findById(numericId) as any;
        }
      }

      if (!qrCode) {
        return null;
      }

      // Generate scan URL from token
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const scanUrl = `${frontendUrl}/claim/${qrCode.token}`;

      return {
        id: qrCode.id.toString(), // Convert number ID to string
        token: qrCode.token,
        scan_url: scanUrl,
        expires_at: qrCode.expires_at,
      };
    } catch (error) {
      logger.error('Failed to find QR code by ID', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}
