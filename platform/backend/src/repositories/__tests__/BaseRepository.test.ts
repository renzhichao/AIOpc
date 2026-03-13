import { BaseRepository } from '../BaseRepository';
import { Repository } from 'typeorm';
import { User } from '../../entities/User.entity';

// Concrete implementation for testing
class TestRepository extends BaseRepository<User> {
  constructor(repository: Repository<User>) {
    super(repository);
  }
}

describe('BaseRepository', () => {
  let baseRepository: TestRepository;
  let mockRepository: jest.Mocked<Repository<User>>;

  beforeEach(() => {
    mockRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      findAndCount: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn()
    } as any;

    baseRepository = new TestRepository(mockRepository);
  });

  describe('create', () => {
    it('should create a new entity', async () => {
      const userData = { name: 'Test User', email: 'test@example.com' };
      const createdUser = { id: 1, ...userData } as any;

      mockRepository.create.mockReturnValue(createdUser);
      mockRepository.save.mockResolvedValue(createdUser);

      const result = await baseRepository.create(userData);

      expect(mockRepository.create).toHaveBeenCalledWith(userData);
      expect(mockRepository.save).toHaveBeenCalledWith(createdUser);
      expect(result).toEqual(createdUser);
    });
  });

  describe('findById', () => {
    it('should find entity by id', async () => {
      const mockUser = { id: 1, name: 'Test User' } as any;
      mockRepository.findOne.mockResolvedValue(mockUser);

      const result = await baseRepository.findById(1);

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1 }
      });
      expect(result).toEqual(mockUser);
    });

    it('should return null when entity not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await baseRepository.findById(999);

      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should find all entities', async () => {
      const mockUsers = [
        { id: 1, name: 'User 1' } as any,
        { id: 2, name: 'User 2' } as any
      ];
      mockRepository.find.mockResolvedValue(mockUsers);

      const result = await baseRepository.findAll();

      expect(mockRepository.find).toHaveBeenCalledWith(undefined);
      expect(result).toEqual(mockUsers);
    });

    it('should find entities with filter', async () => {
      const mockUsers = [{ id: 1, name: 'User 1' } as any];
      const filter = { take: 1 };
      mockRepository.find.mockResolvedValue(mockUsers);

      const result = await baseRepository.findAll(filter);

      expect(mockRepository.find).toHaveBeenCalledWith(filter);
      expect(result).toEqual(mockUsers);
    });
  });

  describe('findWithPagination', () => {
    it('should return paginated results', async () => {
      const mockData = [
        { id: 1, name: 'User 1' } as any,
        { id: 2, name: 'User 2' } as any
      ];
      const mockTotal = 10;

      mockRepository.findAndCount.mockResolvedValue([mockData, mockTotal] as any);

      const result = await baseRepository.findWithPagination(1, 10);

      expect(mockRepository.findAndCount).toHaveBeenCalledWith({
        skip: 0,
        take: 10
      });
      expect(result).toEqual({
        data: mockData,
        total: mockTotal,
        page: 1,
        pageSize: 10
      });
    });

    it('should calculate skip offset correctly', async () => {
      mockRepository.findAndCount.mockResolvedValue([[], 0] as any);

      await baseRepository.findWithPagination(3, 20);

      expect(mockRepository.findAndCount).toHaveBeenCalledWith({
        skip: 40,
        take: 20
      });
    });
  });

  describe('update', () => {
    it('should update entity', async () => {
      const updateData = { name: 'Updated Name' };
      const updatedUser = { id: 1, name: 'Updated Name' } as any;

      mockRepository.update.mockResolvedValue({} as any);
      mockRepository.findOne.mockResolvedValue(updatedUser);

      const result = await baseRepository.update(1, updateData);

      expect(mockRepository.update).toHaveBeenCalledWith(1, updateData);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1 }
      });
      expect(result).toEqual(updatedUser);
    });
  });

  describe('delete', () => {
    it('should delete entity', async () => {
      mockRepository.delete.mockResolvedValue({} as any);

      await baseRepository.delete(1);

      expect(mockRepository.delete).toHaveBeenCalledWith(1);
    });
  });

  describe('count', () => {
    it('should count entities', async () => {
      mockRepository.count.mockResolvedValue(5);

      const result = await baseRepository.count();

      expect(mockRepository.count).toHaveBeenCalledWith(undefined);
      expect(result).toBe(5);
    });
  });

  describe('createBulk', () => {
    it('should create multiple entities', async () => {
      const usersData = [
        { name: 'User 1' },
        { name: 'User 2' }
      ];
      const createdUsers = [
        { id: 1, name: 'User 1' },
        { id: 2, name: 'User 2' }
      ] as any;

      mockRepository.create.mockReturnValue(createdUsers);
      mockRepository.save.mockResolvedValue(createdUsers);

      const result = await baseRepository.createBulk(usersData);

      expect(mockRepository.create).toHaveBeenCalledWith(usersData);
      expect(mockRepository.save).toHaveBeenCalledWith(createdUsers);
      expect(result).toEqual(createdUsers);
    });
  });

  describe('exists', () => {
    it('should return true when entity exists', async () => {
      mockRepository.count.mockResolvedValue(1);

      const result = await baseRepository.exists(1);

      expect(mockRepository.count).toHaveBeenCalledWith({
        where: { id: 1 }
      });
      expect(result).toBe(true);
    });

    it('should return false when entity does not exist', async () => {
      mockRepository.count.mockResolvedValue(0);

      const result = await baseRepository.exists(999);

      expect(result).toBe(false);
    });
  });
});
