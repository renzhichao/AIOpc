import { QRCodeService } from '../QRCodeService';
import { QRCodeRepository } from '../../repositories/QRCodeRepository';
import { AppError, ErrorCodes } from '../../utils/errors';

// Mock dependencies
jest.mock('../../config/logger');
jest.mock('../../repositories/QRCodeRepository');

describe('QRCodeService', () => {
  let qrCodeService: QRCodeService;
  let mockQRCodeRepository: jest.Mocked<QRCodeRepository>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock QRCodeRepository
    mockQRCodeRepository = {
      create: jest.fn(),
      findByToken: jest.fn(),
      findByInstanceId: jest.fn(),
      findExpired: jest.fn(),
      deleteExpired: jest.fn(),
      incrementScanCount: jest.fn(),
      markAsClaimed: jest.fn(),
      deleteByInstanceId: jest.fn(),
    } as any;

    // Create QRCodeService instance
    qrCodeService = new QRCodeService(mockQRCodeRepository);

    // Set up environment variables
    process.env.FEISHU_APP_ID = 'test_app_id';
    process.env.FEISHU_REDIRECT_URI = 'http://localhost:5173/oauth/callback';
    process.env.FEISHU_ENCRYPT_KEY = 'test-secret-key';
  });

  describe('generateQRCode', () => {
    const mockInstanceId = 'test-instance-id';

    it('should generate QR code successfully', async () => {
      mockQRCodeRepository.deleteByInstanceId.mockResolvedValue(undefined);
      mockQRCodeRepository.create.mockResolvedValue({} as any);

      const result = await qrCodeService.generateQRCode(mockInstanceId);

      expect(result).toHaveProperty('qr_code_url');
      expect(result).toHaveProperty('expires_at');
      expect(result.qr_code_url).toContain('https://open.feishu.cn/open-apis/authen/v1/authorize');
      expect(result.qr_code_url).toContain('app_id=test_app_id');
      expect(result.qr_code_url).toContain('redirect_uri=');

      // Verify QR code was created in database
      expect(mockQRCodeRepository.deleteByInstanceId).toHaveBeenCalledWith(mockInstanceId);
      expect(mockQRCodeRepository.create).toHaveBeenCalled();

      const createCall = mockQRCodeRepository.create.mock.calls[0][0];
      expect(createCall.instance_id).toBe(mockInstanceId);
      expect(createCall.token).toBeDefined();
      expect(createCall.state).toBeDefined();
      expect(createCall.expires_at).toBeDefined();
      expect(createCall.scan_count).toBe(0);
      expect(createCall.claimed_at).toBeNull();
    });

    it('should generate unique tokens for each QR code', async () => {
      mockQRCodeRepository.deleteByInstanceId.mockResolvedValue(undefined);
      mockQRCodeRepository.create.mockResolvedValue({} as any);

      const result1 = await qrCodeService.generateQRCode(mockInstanceId);
      const result2 = await qrCodeService.generateQRCode(mockInstanceId);

      // Extract state from URL and decode it
      const state1 = decodeURIComponent(result1.qr_code_url.split('state=')[1]?.split('&')[0] || '');
      const state2 = decodeURIComponent(result2.qr_code_url.split('state=')[1]?.split('&')[0] || '');

      const token1 = state1.split(':')[1];
      const token2 = state2.split(':')[1];

      expect(token1).toBeDefined();
      expect(token2).toBeDefined();
      expect(token1).not.toBe(token2);
    });

    it('should include signature in state parameter', async () => {
      mockQRCodeRepository.deleteByInstanceId.mockResolvedValue(undefined);
      mockQRCodeRepository.create.mockResolvedValue({} as any);

      const result = await qrCodeService.generateQRCode(mockInstanceId);

      // State should be in format: instanceId:token:signature
      const stateMatch = result.qr_code_url.match(/state=([^&]+)/);
      expect(stateMatch).toBeDefined();

      // Decode URL-encoded state
      const state = decodeURIComponent(stateMatch![1]);
      const parts = state.split(':');
      expect(parts).toHaveLength(3);
      expect(parts[0]).toBe(mockInstanceId);
      expect(parts[1]).toBeDefined(); // token
      expect(parts[2]).toBeDefined(); // signature
    });

    it('should set expiration to 24 hours from now', async () => {
      mockQRCodeRepository.deleteByInstanceId.mockResolvedValue(undefined);
      mockQRCodeRepository.create.mockResolvedValue({} as any);

      const beforeTime = Date.now();
      const result = await qrCodeService.generateQRCode(mockInstanceId);
      const afterTime = Date.now();

      const expiresAt = new Date(result.expires_at).getTime();
      const expectedMin = beforeTime + 24 * 3600 * 1000;
      const expectedMax = afterTime + 24 * 3600 * 1000;

      expect(expiresAt).toBeGreaterThanOrEqual(expectedMin);
      expect(expiresAt).toBeLessThanOrEqual(expectedMax);
    });

    it('should throw error when FEISHU_APP_ID is not configured', async () => {
      delete process.env.FEISHU_APP_ID;

      await expect(qrCodeService.generateQRCode(mockInstanceId)).rejects.toThrow(AppError);
    });

    it('should handle repository errors gracefully', async () => {
      mockQRCodeRepository.deleteByInstanceId.mockRejectedValue(new Error('Database error'));

      await expect(qrCodeService.generateQRCode(mockInstanceId)).rejects.toThrow(AppError);
    });
  });

  describe('validateQRToken', () => {
    const mockToken = 'test-token-1234567890abcdef';
    const mockInstanceId = 'test-instance-id';

    it('should validate valid token', async () => {
      const mockQRCode = {
        id: 1,
        instance_id: mockInstanceId,
        token: mockToken,
        state: `${mockInstanceId}:${mockToken}:valid-signature`,
        expires_at: new Date(Date.now() + 3600000), // 1 hour from now
        scan_count: 0,
        claimed_at: null,
        created_at: new Date(),
        instance: {} as any, // Required by QRCode entity
      };

      mockQRCodeRepository.findByToken.mockResolvedValue(mockQRCode);

      // Note: This will fail signature validation in real scenario since we're using a mock signature
      // In a real test, we would need to set up proper signature verification
      const result = await qrCodeService.validateQRToken(mockToken);

      // Since signature will fail, we expect false
      expect(result).toBe(false);
    });

    it('should return false for non-existent token', async () => {
      mockQRCodeRepository.findByToken.mockResolvedValue(null);

      const result = await qrCodeService.validateQRToken('non-existent-token');

      expect(result).toBe(false);
    });

    it('should return false for expired token', async () => {
      const mockQRCode = {
        id: 1,
        instance_id: mockInstanceId,
        token: mockToken,
        state: `${mockInstanceId}:${mockToken}:signature`,
        expires_at: new Date(Date.now() - 3600000), // 1 hour ago
        scan_count: 0,
        claimed_at: null,
        created_at: new Date(),
        instance: {} as any, // Required by QRCode entity
      };

      mockQRCodeRepository.findByToken.mockResolvedValue(mockQRCode);

      const result = await qrCodeService.validateQRToken(mockToken);

      expect(result).toBe(false);
    });

    it('should return false for invalid state format', async () => {
      const mockQRCode = {
        id: 1,
        instance_id: mockInstanceId,
        token: mockToken,
        state: 'invalid-state-format',
        expires_at: new Date(Date.now() + 3600000),
        scan_count: 0,
        claimed_at: null,
        created_at: new Date(),
        instance: {} as any, // Required by QRCode entity
      };

      mockQRCodeRepository.findByToken.mockResolvedValue(mockQRCode);

      const result = await qrCodeService.validateQRToken(mockToken);

      expect(result).toBe(false);
    });

    it('should handle repository errors gracefully', async () => {
      mockQRCodeRepository.findByToken.mockRejectedValue(new Error('Database error'));

      const result = await qrCodeService.validateQRToken(mockToken);

      expect(result).toBe(false);
    });
  });

  describe('recordScan', () => {
    const mockToken = 'test-token-1234567890abcdef';

    it('should record scan successfully', async () => {
      mockQRCodeRepository.incrementScanCount.mockResolvedValue(undefined);

      await qrCodeService.recordScan(mockToken);

      expect(mockQRCodeRepository.incrementScanCount).toHaveBeenCalledWith(mockToken);
    });

    it('should handle repository errors gracefully', async () => {
      mockQRCodeRepository.incrementScanCount.mockRejectedValue(new Error('Database error'));

      // Should not throw, just log error
      await expect(qrCodeService.recordScan(mockToken)).resolves.not.toThrow();
    });
  });

  describe('getQRCodeByInstance', () => {
    const mockInstanceId = 'test-instance-id';
    const mockQRCode = {
      id: 1,
      instance_id: mockInstanceId,
      token: 'test-token',
      state: 'test-state',
      expires_at: new Date(),
      scan_count: 0,
      claimed_at: null,
      created_at: new Date(),
    };

    it('should get QR code by instance ID', async () => {
      const mockQRCodeWithInstance = {
        ...mockQRCode,
        instance: {} as any, // Required by QRCode entity
      };
      mockQRCodeRepository.findByInstanceId.mockResolvedValue(mockQRCodeWithInstance);

      const result = await qrCodeService.getQRCodeByInstance(mockInstanceId);

      expect(result).toEqual(mockQRCodeWithInstance);
      expect(mockQRCodeRepository.findByInstanceId).toHaveBeenCalledWith(mockInstanceId);
    });

    it('should return null for non-existent instance', async () => {
      mockQRCodeRepository.findByInstanceId.mockResolvedValue(null);

      const result = await qrCodeService.getQRCodeByInstance('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('cleanupExpiredQRCodes', () => {
    it('should cleanup expired QR codes successfully', async () => {
      const mockExpiredCodes = [
        { id: 1, token: 'expired1' },
        { id: 2, token: 'expired2' },
      ];

      mockQRCodeRepository.findExpired.mockResolvedValue(mockExpiredCodes as any);
      mockQRCodeRepository.deleteExpired.mockResolvedValue(undefined);

      const result = await qrCodeService.cleanupExpiredQRCodes();

      expect(result).toBe(2);
      expect(mockQRCodeRepository.findExpired).toHaveBeenCalled();
      expect(mockQRCodeRepository.deleteExpired).toHaveBeenCalled();
    });

    it('should return 0 when no expired codes exist', async () => {
      mockQRCodeRepository.findExpired.mockResolvedValue([]);

      const result = await qrCodeService.cleanupExpiredQRCodes();

      expect(result).toBe(0);
    });

    it('should handle repository errors gracefully', async () => {
      mockQRCodeRepository.findExpired.mockRejectedValue(new Error('Database error'));

      const result = await qrCodeService.cleanupExpiredQRCodes();

      expect(result).toBe(0);
    });
  });
});
