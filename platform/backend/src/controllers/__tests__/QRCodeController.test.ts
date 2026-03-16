const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');

describe('QRCodeController (TASK-003)', () => {
  let QRCodeController;
  let QRCodeService;
  let AuthMiddleware;
  let mockQRCodeService;
  let controller;
  let Container;

  beforeEach(() => {
    // Import modules inside beforeEach to avoid initialization issues
    const typedi = require('typedi');
    Container = typedi.Container;

    // Use compiled dist version to avoid TypeScript parsing issues
    const qrcodeController = require('../../../dist/controllers/QRCodeController');
    QRCodeController = qrcodeController.QRCodeController;

    const qrcodeService = require('../../../dist/services/QRCodeService');
    QRCodeService = qrcodeService.QRCodeService;

    const authMiddleware = require('../../../dist/middleware/AuthMiddleware');
    AuthMiddleware = authMiddleware.AuthMiddleware;

    // Create fresh mocks for each test
    mockQRCodeService = {
      generateClaimQRCode: jest.fn(),
      verifyAndClaim: jest.fn(),
      getUserInstance: jest.fn(),
      findById: jest.fn(),
    };

    // Set the mock in the container
    Container.set(QRCodeService, mockQRCodeService);

    // Create controller instance
    controller = new QRCodeController(mockQRCodeService);
  });

  afterEach(() => {
    // Reset mocks after each test
    jest.clearAllMocks();
    Container.reset();
  });

  describe('generateClaimQRCode', () => {
    it('should return instance info if user already has one', async () => {
      // Arrange
      const existingInstance = {
        instance_id: 'inst_123',
        name: 'My Instance',
        status: 'active',
      };

      const mockReq = {
        user: {
          userId: 1,
          feishuUserId: 'feishu_123',
          name: 'Test User',
          email: 'test@example.com',
        },
      };

      mockQRCodeService.getUserInstance.mockResolvedValue(existingInstance);

      // Act
      const result = await controller.generateClaimQRCode(mockReq);

      // Assert
      expect(result.success).toBe(true);
      expect(result.already_has_instance).toBe(true);
      expect(result.instance).toEqual({
        id: 'inst_123',
        name: 'My Instance',
        status: 'active',
      });
      expect(result.redirect_to).toBe('/chat');
      expect(mockQRCodeService.getUserInstance).toHaveBeenCalledWith(1);
    });

    it('should generate QR code when user has no instance', async () => {
      // Arrange
      const claimQRCode = {
        id: '123',
        token: 'qr_token_xyz',
        expires_at: new Date(Date.now() + 5 * 60 * 1000),
        type: 'claim',
        scan_url: 'http://localhost:5173/claim/qr_token_xyz',
      };

      const mockReq = {
        user: {
          userId: 1,
          feishuUserId: 'feishu_123',
          name: 'Test User',
          email: 'test@example.com',
        },
      };

      mockQRCodeService.getUserInstance.mockResolvedValue(null);
      mockQRCodeService.generateClaimQRCode.mockResolvedValue(claimQRCode);

      // Act
      const result = await controller.generateClaimQRCode(mockReq);

      // Assert
      expect(result.success).toBe(true);
      expect(result.already_has_instance).toBe(false);
      expect(result.qr_code).toBeDefined();
      expect(result.qr_code.token).toBe('qr_token_xyz');
      expect(result.qr_code.image_url).toBe('/api/qrcode/123/image');
      expect(result.qr_code.scan_url).toContain('/claim/qr_token_xyz');
      expect(mockQRCodeService.generateClaimQRCode).toHaveBeenCalledWith(1);
    });

    it('should return error on service failure', async () => {
      // Arrange
      const mockReq = {
        user: {
          userId: 1,
          feishuUserId: 'feishu_123',
          name: 'Test User',
          email: 'test@example.com',
        },
      };

      const error = new Error('Database connection failed');
      mockQRCodeService.getUserInstance.mockRejectedValue(error);

      // Act
      const result = await controller.generateClaimQRCode(mockReq);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Database connection failed');
    });
  });

  describe('verifyClaimQRCode', () => {
    it('should verify and claim instance successfully', async () => {
      // Arrange
      const claimedInstance = {
        instance_id: 'inst_claimed',
        status: 'active',
        owner_id: 1,
      };

      const mockBody = {
        instance_id: 'inst_claimed',
        token: 'valid_token',
      };

      mockQRCodeService.verifyAndClaim.mockResolvedValue(claimedInstance);

      // Act
      const result = await controller.verifyClaimQRCode(mockBody);

      // Assert
      expect(result.success).toBe(true);
      expect(result.instance).toEqual(claimedInstance);
      expect(mockQRCodeService.verifyAndClaim).toHaveBeenCalledWith(
        'inst_claimed',
        'valid_token'
      );
    });

    it('should return error when verification fails', async () => {
      // Arrange
      const mockBody = {
        instance_id: 'inst_123',
        token: 'invalid_token',
      };

      const error = new Error('Invalid or expired token');
      mockQRCodeService.verifyAndClaim.mockRejectedValue(error);

      // Act
      const result = await controller.verifyClaimQRCode(mockBody);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid or expired token');
    });
  });

  describe('getQRCodeImage', () => {
    it('should return QR code image successfully', async () => {
      // Arrange
      const qrCode = {
        id: '123',
        token: 'test_token',
        scan_url: 'http://localhost:5173/claim/test_token',
        expires_at: new Date(Date.now() + 5 * 60 * 1000),
      };

      const mockImageDataUrl =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      mockQRCodeService.findById.mockResolvedValue(qrCode);

      // Mock qrcode library
      jest.mock('qrcode', () => ({
        toDataURL: jest.fn().mockResolvedValue(mockImageDataUrl),
      }));

      const QRCode = require('qrcode');
      QRCode.toDataURL.mockResolvedValue(mockImageDataUrl);

      // Act
      const result = await controller.getQRCodeImage('123');

      // Assert
      expect(result.success).toBe(true);
      expect(result.image_data).toBe(mockImageDataUrl);
      expect(mockQRCodeService.findById).toHaveBeenCalledWith('123');
      expect(QRCode.toDataURL).toHaveBeenCalledWith(qrCode.scan_url);
    });

    it('should return error when QR code not found', async () => {
      // Arrange
      mockQRCodeService.findById.mockResolvedValue(null);

      // Act
      const result = await controller.getQRCodeImage('nonexistent');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('QR code not found');
      expect(mockQRCodeService.findById).toHaveBeenCalledWith('nonexistent');
    });

    it('should return error when image generation fails', async () => {
      // Arrange
      const qrCode = {
        id: '123',
        token: 'test_token',
        scan_url: 'http://localhost:5173/claim/test_token',
        expires_at: new Date(Date.now() + 5 * 60 * 1000),
      };

      mockQRCodeService.findById.mockResolvedValue(qrCode);

      const QRCode = require('qrcode');
      QRCode.toDataURL.mockRejectedValue(new Error('Generation failed'));

      // Act
      const result = await controller.getQRCodeImage('123');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Generation failed');
    });
  });
});
