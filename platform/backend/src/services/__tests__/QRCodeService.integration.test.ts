/**
 * Integration Tests for QRCodeService
 *
 * These tests use a real database connection to test QR code generation,
 * validation, and cleanup operations.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { QRCodeService } from '../QRCodeService';
import { QRCodeRepository } from '../../repositories/QRCodeRepository';
import { InstanceRepository } from '../../repositories/InstanceRepository';
import { AppDataSource } from '../../config/database';
import { QRCode } from '../../entities/QRCode.entity';
import { Instance } from '../../entities/Instance.entity';
import { User } from '../../entities/User.entity';

describe('QRCodeService Integration Tests', () => {
  let qrCodeService: QRCodeService;
  let qrCodeRepository: QRCodeRepository;
  let instanceRepository: InstanceRepository;
  let testUser: User;
  let testInstance: Instance;

  // Set up environment variables
  const originalEnv = process.env;

  beforeAll(async () => {
    // Configure test environment
    process.env.FEISHU_APP_ID = 'test_app_id';
    process.env.FEISHU_REDIRECT_URI = 'http://localhost:5173/oauth/callback';
    process.env.FEISHU_ENCRYPT_KEY = 'test-secret-key-for-integration-testing';
    process.env.DB_HOST = process.env.DB_HOST || 'localhost';
    process.env.DB_PORT = process.env.DB_PORT || '5432';
    process.env.DB_USERNAME = process.env.DB_USERNAME || 'opclaw';
    process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'opclaw';
    process.env.DB_NAME = process.env.DB_NAME || 'opclaw';

    // Initialize database connection
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    // Create repositories
    qrCodeRepository = new QRCodeRepository(AppDataSource.getRepository(QRCode));
    instanceRepository = new InstanceRepository(AppDataSource.getRepository(Instance));

    // Create service
    qrCodeService = new QRCodeService(qrCodeRepository);

    // Create test user
    const userRepository = AppDataSource.getRepository(User);
    testUser = userRepository.create({
      feishu_user_id: `test-user-${Date.now()}`,
      name: 'Test User',
      email: `test-${Date.now()}@example.com`,
    });
    await userRepository.save(testUser);

    // Create test instance
    testInstance = await instanceRepository.create({
      instance_id: `test-instance-${Date.now()}`,
      owner_id: testUser.id,
      status: 'active',
      template: 'personal',
      config: {
        apiKey: 'test-api-key',
        feishuAppId: 'test-app-id',
        feishuAppSecret: 'test-app-secret',
        skills: ['chat', 'code'],
        systemPrompt: 'Test prompt',
        temperature: 0.7,
        maxTokens: 4000,
      },
      restart_attempts: 0,
      health_status: {},
    });
  });

  afterAll(async () => {
    // Clean up test data
    if (testInstance) {
      await instanceRepository.delete(testInstance.id);
    }

    if (testUser) {
      const userRepository = AppDataSource.getRepository(User);
      await userRepository.delete(testUser.id);
    }

    // Close database connection
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }

    // Restore environment
    process.env = originalEnv;
  });

  beforeEach(async () => {
    // Clean up QR codes before each test
    const qrCodeRepo = AppDataSource.getRepository(QRCode);
    await qrCodeRepo.delete({});
  });

  afterEach(async () => {
    // Clean up QR codes after each test
    const qrCodeRepo = AppDataSource.getRepository(QRCode);
    await qrCodeRepo.delete({});
  });

  describe('QR Code Generation with Real Database', () => {
    it('should generate QR code and save to database', async () => {
      const result = await qrCodeService.generateQRCode(testInstance.instance_id);

      expect(result).toHaveProperty('qr_code_url');
      expect(result).toHaveProperty('expires_at');
      expect(result.qr_code_url).toContain('https://open.feishu.cn/open-apis/authen/v1/authorize');
      expect(result.qr_code_url).toContain('app_id=test_app_id');

      // Verify QR code was saved to database
      const qrCodeRepo = AppDataSource.getRepository(QRCode);
      const savedQRCode = await qrCodeRepo.findOne({
        where: { instance_id: testInstance.instance_id },
      });

      expect(savedQRCode).toBeDefined();
      expect(savedQRCode!.instance_id).toBe(testInstance.instance_id);
      expect(savedQRCode!.token).toBeDefined();
      expect(savedQRCode!.state).toBeDefined();
      expect(savedQRCode!.scan_count).toBe(0);
      expect(savedQRCode!.claimed_at).toBeNull();
    });

    it('should generate unique tokens for each QR code', async () => {
      const result1 = await qrCodeService.generateQRCode(testInstance.instance_id);
      const result2 = await qrCodeService.generateQRCode(testInstance.instance_id);

      // Extract tokens from database
      const qrCodeRepo = AppDataSource.getRepository(QRCode);
      const qrCodes = await qrCodeRepo.find({
        where: { instance_id: testInstance.instance_id },
        order: { created_at: 'ASC' },
      });

      expect(qrCodes).toHaveLength(2);
      expect(qrCodes[0].token).not.toBe(qrCodes[1].token);
    });

    it('should set expiration to 24 hours from now', async () => {
      const beforeTime = Date.now();
      const result = await qrCodeService.generateQRCode(testInstance.instance_id);
      const afterTime = Date.now();

      const expiresAt = new Date(result.expires_at).getTime();
      const expectedMin = beforeTime + 24 * 3600 * 1000;
      const expectedMax = afterTime + 24 * 3600 * 1000;

      expect(expiresAt).toBeGreaterThanOrEqual(expectedMin);
      expect(expiresAt).toBeLessThanOrEqual(expectedMax);

      // Verify in database
      const qrCodeRepo = AppDataSource.getRepository(QRCode);
      const savedQRCode = await qrCodeRepo.findOne({
        where: { instance_id: testInstance.instance_id },
      });

      expect(savedQRCode!.expires_at).toBeDefined();
    });

    it('should delete existing QR code when generating new one', async () => {
      // Generate first QR code
      await qrCodeService.generateQRCode(testInstance.instance_id);

      const qrCodeRepo = AppDataSource.getRepository(QRCode);
      let count = await qrCodeRepo.count({
        where: { instance_id: testInstance.instance_id },
      });
      expect(count).toBe(1);

      // Generate second QR code
      await qrCodeService.generateQRCode(testInstance.instance_id);

      count = await qrCodeRepo.count({
        where: { instance_id: testInstance.instance_id },
      });
      expect(count).toBe(1); // Should replace, not add
    });
  });

  describe('QR Token Validation with Real Database', () => {
    it('should validate valid token from database', async () => {
      // Generate QR code
      await qrCodeService.generateQRCode(testInstance.instance_id);

      // Get token from database
      const qrCodeRepo = AppDataSource.getRepository(QRCode);
      const savedQRCode = await qrCodeRepo.findOne({
        where: { instance_id: testInstance.instance_id },
      });

      expect(savedQRCode).toBeDefined();

      // Validate token
      const isValid = await qrCodeService.validateQRToken(savedQRCode!.token);
      expect(isValid).toBe(true);
    });

    it('should return false for non-existent token', async () => {
      const isValid = await qrCodeService.validateQRToken('non-existent-token');
      expect(isValid).toBe(false);
    });

    it('should return false for expired token', async () => {
      // Generate QR code
      await qrCodeService.generateQRCode(testInstance.instance_id);

      // Get token from database and manually expire it
      const qrCodeRepo = AppDataSource.getRepository(QRCode);
      const savedQRCode = await qrCodeRepo.findOne({
        where: { instance_id: testInstance.instance_id },
      });

      // Set expiration to past
      savedQRCode!.expires_at = new Date(Date.now() - 3600000); // 1 hour ago
      await qrCodeRepo.save(savedQRCode!);

      // Validate token
      const isValid = await qrCodeService.validateQRToken(savedQRCode!.token);
      expect(isValid).toBe(false);
    });

    it('should return false for invalid signature', async () => {
      // Generate QR code
      await qrCodeService.generateQRCode(testInstance.instance_id);

      // Get token from database and tamper with signature
      const qrCodeRepo = AppDataSource.getRepository(QRCode);
      const savedQRCode = await qrCodeRepo.findOne({
        where: { instance_id: testInstance.instance_id },
      });

      // Tamper with state (change signature)
      const parts = savedQRCode!.state.split(':');
      parts[2] = 'tampered-signature';
      savedQRCode!.state = parts.join(':');
      await qrCodeRepo.save(savedQRCode!);

      // Validate token
      const isValid = await qrCodeService.validateQRToken(savedQRCode!.token);
      expect(isValid).toBe(false);
    });
  });

  describe('Scan Count Recording with Real Database', () => {
    it('should record scan count in database', async () => {
      // Generate QR code
      await qrCodeService.generateQRCode(testInstance.instance_id);

      // Get token from database
      const qrCodeRepo = AppDataSource.getRepository(QRCode);
      const savedQRCode = await qrCodeRepo.findOne({
        where: { instance_id: testInstance.instance_id },
      });

      const initialCount = savedQRCode!.scan_count;
      expect(initialCount).toBe(0);

      // Record scan
      await qrCodeService.recordScan(savedQRCode!.token);

      // Verify scan count increased
      const updatedQRCode = await qrCodeRepo.findOne({
        where: { token: savedQRCode!.token },
      });

      expect(updatedQRCode!.scan_count).toBe(initialCount + 1);
    });

    it('should record multiple scans', async () => {
      // Generate QR code
      await qrCodeService.generateQRCode(testInstance.instance_id);

      // Get token from database
      const qrCodeRepo = AppDataSource.getRepository(QRCode);
      const savedQRCode = await qrCodeRepo.findOne({
        where: { instance_id: testInstance.instance_id },
      });

      // Record multiple scans
      await qrCodeService.recordScan(savedQRCode!.token);
      await qrCodeService.recordScan(savedQRCode!.token);
      await qrCodeService.recordScan(savedQRCode!.token);

      // Verify scan count
      const updatedQRCode = await qrCodeRepo.findOne({
        where: { token: savedQRCode!.token },
      });

      expect(updatedQRCode!.scan_count).toBe(3);
    });
  });

  describe('QR Code Retrieval with Real Database', () => {
    it('should get QR code by instance ID', async () => {
      // Generate QR code
      await qrCodeService.generateQRCode(testInstance.instance_id);

      // Get QR code
      const retrievedQRCode = await qrCodeService.getQRCodeByInstance(testInstance.instance_id);

      expect(retrievedQRCode).toBeDefined();
      expect(retrievedQRCode!.instance_id).toBe(testInstance.instance_id);
      expect(retrievedQRCode!.token).toBeDefined();
      expect(retrievedQRCode!.state).toBeDefined();
    });

    it('should return null for non-existent instance', async () => {
      const retrievedQRCode = await qrCodeService.getQRCodeByInstance('non-existent-instance');
      expect(retrievedQRCode).toBeNull();
    });
  });

  describe('Expired QR Code Cleanup with Real Database', () => {
    it('should cleanup expired QR codes', async () => {
      const qrCodeRepo = AppDataSource.getRepository(QRCode);

      // Create expired QR codes
      const expiredQRCode1 = qrCodeRepo.create({
        instance_id: `expired-instance-1-${Date.now()}`,
        token: `expired-token-1-${Date.now()}`,
        state: 'test-state-1',
        expires_at: new Date(Date.now() - 3600000), // 1 hour ago
        scan_count: 0,
        claimed_at: null,
      });
      await qrCodeRepo.save(expiredQRCode1);

      const expiredQRCode2 = qrCodeRepo.create({
        instance_id: `expired-instance-2-${Date.now()}`,
        token: `expired-token-2-${Date.now()}`,
        state: 'test-state-2',
        expires_at: new Date(Date.now() - 7200000), // 2 hours ago
        scan_count: 0,
        claimed_at: null,
      });
      await qrCodeRepo.save(expiredQRCode2);

      // Create valid QR code
      const validQRCode = qrCodeRepo.create({
        instance_id: `valid-instance-${Date.now()}`,
        token: `valid-token-${Date.now()}`,
        state: 'test-state-valid',
        expires_at: new Date(Date.now() + 3600000), // 1 hour from now
        scan_count: 0,
        claimed_at: null,
      });
      await qrCodeRepo.save(validQRCode);

      // Run cleanup
      const deletedCount = await qrCodeService.cleanupExpiredQRCodes();

      expect(deletedCount).toBe(2);

      // Verify expired codes are deleted
      const remainingCodes = await qrCodeRepo.find();
      expect(remainingCodes).toHaveLength(1);
      expect(remainingCodes[0].instance_id).toBe(validQRCode.instance_id);
    });

    it('should return 0 when no expired codes exist', async () => {
      const deletedCount = await qrCodeService.cleanupExpiredQRCodes();
      expect(deletedCount).toBe(0);
    });
  });

  describe('Signature Verification with Real Database', () => {
    it('should include correct signature in state', async () => {
      // Generate QR code
      await qrCodeService.generateQRCode(testInstance.instance_id);

      // Get QR code from database
      const qrCodeRepo = AppDataSource.getRepository(QRCode);
      const savedQRCode = await qrCodeRepo.findOne({
        where: { instance_id: testInstance.instance_id },
      });

      // Verify state format: instanceId:token:signature
      const parts = savedQRCode!.state.split(':');
      expect(parts).toHaveLength(3);
      expect(parts[0]).toBe(testInstance.instance_id);
      expect(parts[1]).toBe(savedQRCode!.token);
      expect(parts[2]).toBeDefined(); // signature

      // Verify token can be validated with correct signature
      const isValid = await qrCodeService.validateQRToken(savedQRCode!.token);
      expect(isValid).toBe(true);
    });
  });
});
