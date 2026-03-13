import { InstanceRepository } from '../InstanceRepository';
import { Instance } from '../../entities/Instance.entity';
import { Repository } from 'typeorm';

describe('InstanceRepository', () => {
  let instanceRepository: InstanceRepository;
  let mockRepository: jest.Mocked<Repository<Instance>>;

  beforeEach(() => {
    mockRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      createQueryBuilder: jest.fn()
    } as any;

    instanceRepository = new InstanceRepository(mockRepository as any);
  });

  describe('findByOwnerId', () => {
    it('should find instances by owner_id', async () => {
      const mockInstances = [
        { id: 1, owner_id: 100, instance_id: 'inst_1' } as any,
        { id: 2, owner_id: 100, instance_id: 'inst_2' } as any
      ];
      mockRepository.find.mockResolvedValue(mockInstances);

      const result = await instanceRepository.findByOwnerId(100);

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { owner_id: 100 },
        order: { created_at: 'DESC' },
        relations: ['owner']
      });
      expect(result).toEqual(mockInstances);
    });
  });

  describe('findByStatus', () => {
    it('should find instances by status', async () => {
      const mockInstances = [
        { id: 1, status: 'active', instance_id: 'inst_1' } as any
      ];
      mockRepository.find.mockResolvedValue(mockInstances);

      const result = await instanceRepository.findByStatus('active');

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { status: 'active' },
        order: { created_at: 'DESC' },
        relations: ['owner']
      });
      expect(result).toEqual(mockInstances);
    });
  });

  describe('findByInstanceId', () => {
    it('should find instance by instance_id', async () => {
      const mockInstance = { id: 1, instance_id: 'test_inst' } as any;
      mockRepository.findOne.mockResolvedValue(mockInstance);

      const result = await instanceRepository.findByInstanceId('test_inst');

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { instance_id: 'test_inst' },
        relations: ['owner']
      });
      expect(result).toEqual(mockInstance);
    });

    it('should return null when instance not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await instanceRepository.findByInstanceId('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findActiveInstances', () => {
    it('should find all active instances', async () => {
      const mockInstances = [
        { id: 1, status: 'active', instance_id: 'inst_1' } as any,
        { id: 2, status: 'active', instance_id: 'inst_2' } as any
      ];
      mockRepository.find.mockResolvedValue(mockInstances);

      const result = await instanceRepository.findActiveInstances();

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { status: 'active' },
        order: { created_at: 'DESC' },
        relations: ['owner']
      });
      expect(result).toEqual(mockInstances);
    });
  });

  describe('findPendingInstances', () => {
    it('should find pending instances', async () => {
      const mockInstances = [
        { id: 1, status: 'pending', instance_id: 'inst_1' } as any
      ];
      mockRepository.find.mockResolvedValue(mockInstances);

      const result = await instanceRepository.findPendingInstances();

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { status: 'pending' },
        order: { created_at: 'ASC' }
      });
      expect(result).toEqual(mockInstances);
    });
  });

  describe('findErrorInstances', () => {
    it('should find error instances', async () => {
      const mockInstances = [
        { id: 1, status: 'error', instance_id: 'inst_1' } as any
      ];
      mockRepository.find.mockResolvedValue(mockInstances);

      const result = await instanceRepository.findErrorInstances();

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { status: 'error' },
        order: { created_at: 'DESC' },
        relations: ['owner']
      });
      expect(result).toEqual(mockInstances);
    });
  });

  describe('updateStatus', () => {
    it('should update instance status', async () => {
      mockRepository.update.mockResolvedValue({} as any);

      await instanceRepository.updateStatus('inst_1', 'active');

      expect(mockRepository.update).toHaveBeenCalledWith(
        { instance_id: 'inst_1' },
        { status: 'active' }
      );
    });
  });

  describe('updateHealthStatus', () => {
    it('should update health status', async () => {
      const healthStatus = { status: 'healthy', last_check: new Date() };
      mockRepository.update.mockResolvedValue({} as any);

      await instanceRepository.updateHealthStatus('inst_1', healthStatus);

      expect(mockRepository.update).toHaveBeenCalledWith(
        { instance_id: 'inst_1' },
        { health_status: healthStatus }
      );
    });
  });

  describe('claimInstance', () => {
    it('should claim instance for user', async () => {
      mockRepository.update.mockResolvedValue({} as any);

      await instanceRepository.claimInstance('inst_1', 100);

      expect(mockRepository.update).toHaveBeenCalledWith(
        { instance_id: 'inst_1' },
        {
          owner_id: 100,
          status: 'active',
          claimed_at: expect.any(Date)
        }
      );
    });
  });

  describe('releaseInstance', () => {
    it('should release instance', async () => {
      mockRepository.update.mockResolvedValue({} as any);

      await instanceRepository.releaseInstance('inst_1');

      expect(mockRepository.update).toHaveBeenCalledWith(
        { instance_id: 'inst_1' },
        {
          owner_id: null,
          status: 'stopped',
          claimed_at: null
        }
      );
    });
  });

  describe('updateDockerContainerId', () => {
    it('should update docker container id', async () => {
      mockRepository.update.mockResolvedValue({} as any);

      await instanceRepository.updateDockerContainerId('inst_1', 'container_123');

      expect(mockRepository.update).toHaveBeenCalledWith(
        { instance_id: 'inst_1' },
        { docker_container_id: 'container_123' }
      );
    });
  });

  describe('incrementRestartAttempts', () => {
    it('should increment restart attempts', async () => {
      const queryBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(undefined)
      };

      mockRepository.createQueryBuilder.mockReturnValue(queryBuilder as any);

      await instanceRepository.incrementRestartAttempts('inst_1');

      expect(queryBuilder.set).toHaveBeenCalledWith({
        restart_attempts: expect.any(Function)
      });
      expect(queryBuilder.where).toHaveBeenCalledWith('instance_id = :instanceId', {
        instanceId: 'inst_1'
      });
      expect(queryBuilder.execute).toHaveBeenCalled();
    });
  });

  describe('resetRestartAttempts', () => {
    it('should reset restart attempts', async () => {
      mockRepository.update.mockResolvedValue({} as any);

      await instanceRepository.resetRestartAttempts('inst_1');

      expect(mockRepository.update).toHaveBeenCalledWith(
        { instance_id: 'inst_1' },
        { restart_attempts: 0 }
      );
    });
  });

  describe('countByStatus', () => {
    it('should count instances by status', async () => {
      const mockResult = [
        { status: 'active', count: '10' },
        { status: 'pending', count: '5' }
      ];
      const queryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(mockResult)
      };

      mockRepository.createQueryBuilder.mockReturnValue(queryBuilder as any);

      const result = await instanceRepository.countByStatus();

      expect(result).toEqual({
        active: 10,
        pending: 5
      });
    });
  });

  describe('countByUser', () => {
    it('should count instances by user', async () => {
      mockRepository.count.mockResolvedValue(3);

      const result = await instanceRepository.countByUser(100);

      expect(mockRepository.count).toHaveBeenCalledWith({
        where: { owner_id: 100 }
      });
      expect(result).toBe(3);
    });
  });

  describe('findRecoverableInstances', () => {
    it('should find instances with restart attempts below limit', async () => {
      const mockInstances = [
        { id: 1, status: 'error', restart_attempts: 2 } as any,
        { id: 2, status: 'error', restart_attempts: 1 } as any,
        { id: 3, status: 'error', restart_attempts: 4 } as any
      ];
      mockRepository.find.mockResolvedValue(mockInstances);

      const result = await instanceRepository.findRecoverableInstances(3);

      expect(result).toHaveLength(2);
      expect(result.every(inst => inst.restart_attempts < 3)).toBe(true);
    });
  });
});
