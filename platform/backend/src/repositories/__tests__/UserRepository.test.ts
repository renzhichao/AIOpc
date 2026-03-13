import { UserRepository } from '../UserRepository';
import { User } from '../../entities/User.entity';
import { Repository } from 'typeorm';

describe('UserRepository', () => {
  let userRepository: UserRepository;
  let mockRepository: jest.Mocked<Repository<User>>;

  beforeEach(() => {
    mockRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      createQueryBuilder: jest.fn(),
      count: jest.fn()
    } as any;

    userRepository = new UserRepository(mockRepository as any);
  });

  describe('findByFeishuUserId', () => {
    it('should find user by feishu_user_id', async () => {
      const mockUser = { id: 1, feishu_user_id: 'test_123' } as any;
      mockRepository.findOne.mockResolvedValue(mockUser);

      const result = await userRepository.findByFeishuUserId('test_123');

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { feishu_user_id: 'test_123' }
      });
      expect(result).toEqual(mockUser);
    });

    it('should return null when user not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await userRepository.findByFeishuUserId('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findByFeishuUnionId', () => {
    it('should find user by feishu_union_id', async () => {
      const mockUser = { id: 1, feishu_union_id: 'union_123' } as any;
      mockRepository.findOne.mockResolvedValue(mockUser);

      const result = await userRepository.findByFeishuUnionId('union_123');

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { feishu_union_id: 'union_123' }
      });
      expect(result).toEqual(mockUser);
    });
  });

  describe('findByEmail', () => {
    it('should find user by email', async () => {
      const mockUser = { id: 1, email: 'test@example.com' } as any;
      mockRepository.findOne.mockResolvedValue(mockUser);

      const result = await userRepository.findByEmail('test@example.com');

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { email: 'test@example.com' }
      });
      expect(result).toEqual(mockUser);
    });
  });

  describe('findOrCreate', () => {
    it('should create new user if not exists', async () => {
      const feishuData = {
        feishu_user_id: 'new_123',
        name: 'Test User',
        email: 'test@example.com'
      };
      const createdUser = { id: 1, ...feishuData } as any;

      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue(createdUser);
      mockRepository.save.mockResolvedValue(createdUser);

      const result = await userRepository.findOrCreate(feishuData);

      expect(mockRepository.findOne).toHaveBeenCalled();
      expect(mockRepository.create).toHaveBeenCalledWith(feishuData);
      expect(mockRepository.save).toHaveBeenCalled();
      expect(result).toEqual(createdUser);
    });

    it('should update existing user', async () => {
      const existingUser = {
        id: 1,
        feishu_user_id: 'existing_123',
        name: 'Old Name',
        email: 'old@example.com'
      } as any;
      const feishuData = {
        feishu_user_id: 'existing_123',
        name: 'New Name',
        email: 'new@example.com'
      };
      const updatedUser = { id: 1, ...feishuData } as any;

      mockRepository.findOne.mockResolvedValueOnce(existingUser);
      mockRepository.update.mockResolvedValue({} as any);
      mockRepository.findOne.mockResolvedValueOnce(updatedUser);

      const result = await userRepository.findOrCreate(feishuData);

      expect(mockRepository.update).toHaveBeenCalledWith(1, {
        name: 'New Name',
        email: 'new@example.com'
      });
      expect(result).toEqual(updatedUser);
    });

    it('should handle undefined feishu_union_id', async () => {
      const existingUser = {
        id: 1,
        feishu_user_id: 'test_123',
        name: 'Test User'
      } as any;
      const feishuData = {
        feishu_user_id: 'test_123',
        name: 'Updated User'
      };

      mockRepository.findOne.mockResolvedValueOnce(existingUser);
      mockRepository.update.mockResolvedValue({} as any);
      mockRepository.findOne.mockResolvedValueOnce(existingUser);

      await userRepository.findOrCreate(feishuData);

      expect(mockRepository.update).toHaveBeenCalledWith(1, {
        name: 'Updated User',
        email: undefined,
        avatar_url: undefined
      });
    });
  });

  describe('updateLastLogin', () => {
    it('should update last login time', async () => {
      mockRepository.update.mockResolvedValue({} as any);

      await userRepository.updateLastLogin(1);

      expect(mockRepository.update).toHaveBeenCalledWith(1, {
        last_login_at: expect.any(Date)
      });
    });
  });

  describe('findRecentLogins', () => {
    it('should find users who logged in recently', async () => {
      const mockUsers = [
        { id: 1, name: 'User 1', last_login_at: new Date() } as any,
        { id: 2, name: 'User 2', last_login_at: new Date() } as any
      ];
      mockRepository.find.mockResolvedValue(mockUsers);

      const result = await userRepository.findRecentLogins(7, 10);

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: {
          last_login_at: {
            $gte: expect.any(Date)
          }
        },
        order: {
          last_login_at: 'DESC'
        },
        take: 10
      });
      expect(result).toEqual(mockUsers);
    });
  });

  describe('countUsers', () => {
    it('should count all users', async () => {
      mockRepository.count.mockResolvedValue(100);

      const result = await userRepository.countUsers();

      expect(mockRepository.count).toHaveBeenCalled();
      expect(result).toBe(100);
    });
  });

  describe('countActiveUsers', () => {
    it('should count active users', async () => {
      mockRepository.count.mockResolvedValue(50);

      const result = await userRepository.countActiveUsers(7);

      expect(mockRepository.count).toHaveBeenCalledWith({
        where: {
          last_login_at: {
            $gte: expect.any(Date)
          }
        }
      });
      expect(result).toBe(50);
    });
  });

  describe('searchUsers', () => {
    it('should search users by keyword', async () => {
      const mockUsers = [
        { id: 1, name: 'Test User', email: 'test@example.com' }
      ];
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockUsers)
      };

      mockRepository.createQueryBuilder.mockReturnValue(queryBuilder as any);

      const result = await userRepository.searchUsers('test', 20);

      expect(queryBuilder.where).toHaveBeenCalledWith('user.name LIKE :keyword', {
        keyword: '%test%'
      });
      expect(queryBuilder.orWhere).toHaveBeenCalledWith('user.email LIKE :keyword', {
        keyword: '%test%'
      });
      expect(queryBuilder.take).toHaveBeenCalledWith(20);
      expect(result).toEqual(mockUsers);
    });
  });
});
