import { QRCodeRepository } from '../QRCodeRepository';
import { QRCode } from '../../entities/QRCode.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from 'typeorm-typedi-extensions';

// Mock TypeORM and TypeORM extensions
jest.mock('typeorm');
jest.mock('typeorm-typedi-extensions');

describe('QRCodeRepository', () => {
  let qrCodeRepository: QRCodeRepository;
  let mockRepository: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock repository
    mockRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      createQueryBuilder: jest.fn(),
      increment: jest.fn(),
    };

    // Mock InjectRepository decorator
    (InjectRepository as any) = () => () => mockRepository;

    qrCodeRepository = new QRCodeRepository(mockRepository);
  });

  describe('findByToken', () => {
    it('should find QR code by token', async () => {
      const mockQRCode = {
        id: 1,
        token: 'test-token',
        instance_id: 'instance-123',
      };

      mockRepository.findOne.mockResolvedValue(mockQRCode);

      const result = await qrCodeRepository.findByToken('test-token');

      expect(result).toEqual(mockQRCode);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { token: 'test-token' }
      });
    });

    it('should return null when token not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await qrCodeRepository.findByToken('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findByInstanceId', () => {
    it('should find QR code by instance ID', async () => {
      const mockQRCode = {
        id: 1,
        token: 'test-token',
        instance_id: 'instance-123',
      };

      mockRepository.findOne.mockResolvedValue(mockQRCode);

      const result = await qrCodeRepository.findByInstanceId('instance-123');

      expect(result).toEqual(mockQRCode);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { instance_id: 'instance-123' }
      });
    });

    it('should return null when instance ID not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await qrCodeRepository.findByInstanceId('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('incrementScanCount', () => {
    it('should increment scan count for token', async () => {
      mockRepository.increment.mockResolvedValue({ affected: 1 });

      await qrCodeRepository.incrementScanCount('test-token');

      expect(mockRepository.increment).toHaveBeenCalledWith(
        { token: 'test-token' },
        'scan_count',
        1
      );
    });
  });

  describe('markAsClaimed', () => {
    it('should mark QR code as claimed', async () => {
      mockRepository.update.mockResolvedValue({ affected: 1 });

      await qrCodeRepository.markAsClaimed('test-token');

      expect(mockRepository.update).toHaveBeenCalledWith(
        { token: 'test-token' },
        { claimed_at: expect.any(Date) }
      );
    });
  });

  describe('deleteByInstanceId', () => {
    it('should delete QR code by instance ID', async () => {
      mockRepository.delete.mockResolvedValue({ affected: 1 });

      await qrCodeRepository.deleteByInstanceId('instance-123');

      expect(mockRepository.delete).toHaveBeenCalledWith({
        instance_id: 'instance-123'
      });
    });
  });
});
