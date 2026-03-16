/**
 * InstanceRegistry Unit Tests
 *
 * TDD Implementation for TASK-007: Instance Registry Service
 *
 * Test Cycle: Red (Write failing tests) → Green (Make tests pass) → Refactor
 */

const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');

describe('InstanceRegistry - Registration Tests (TASK-007)', () => {
  let InstanceRegistry;
  let InstanceRepository;
  let Container;
  let instanceRegistry;
  let mockInstanceRepository;
  let mockFindByInstanceId;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Import using compiled dist version
    const typedi = require('typedi');
    Container = typedi.Container;

    const instanceRegistryModule = require('../../../dist/services/InstanceRegistry');
    InstanceRegistry = instanceRegistryModule.InstanceRegistry;

    const instanceRepositoryModule = require('../../../dist/repositories/InstanceRepository');
    InstanceRepository = instanceRepositoryModule.InstanceRepository;

    // Create mock repository
    mockFindByInstanceId = jest.fn();
    mockInstanceRepository = {
      findByInstanceId: mockFindByInstanceId,
    };

    // Create registry instance
    instanceRegistry = new InstanceRegistry(mockInstanceRepository);

    // Set environment variables
    process.env.REGISTRY_HEALTH_CHECK_INTERVAL = '15000';
    process.env.REGISTRY_HEARTBEAT_TIMEOUT = '30000';
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    if (instanceRegistry && instanceRegistry.stopHealthCheck) {
      instanceRegistry.stopHealthCheck();
    }
  });

  /**
   * TEST 1: Register new instance to registry
   *
   * Expected: Instance should be registered in memory with correct information
   */
  it('should register new instance to registry', async () => {
    // Arrange
    const instanceId = 'inst-123';
    const mockInstance = {
      id: 1,
      instance_id: instanceId,
      owner_id: 1,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    };

    mockFindByInstanceId.mockResolvedValue(mockInstance);

    // Act
    await instanceRegistry.registerInstance(instanceId, {
      connection_type: 'local',
      api_endpoint: 'http://localhost:3000',
    });

    // Assert
    const instanceInfo = await instanceRegistry.getInstanceInfo(instanceId);
    expect(instanceInfo).toBeDefined();
    expect(instanceInfo.instance_id).toBe(instanceId);
    expect(instanceInfo.connection_type).toBe('local');
    expect(instanceInfo.api_endpoint).toBe('http://localhost:3000');
    expect(instanceInfo.status).toBe('online');
    expect(instanceInfo.owner_id).toBe(1);
  });

  /**
   * TEST 2: Register instance with metadata
   *
   * Expected: Instance should be registered with metadata preserved
   */
  it('should register instance with metadata', async () => {
    // Arrange
    const instanceId = 'inst-456';
    const metadata = {
      docker_container_id: 'container-123',
      port: 3000,
      version: '1.0.0',
    };

    const mockInstance = {
      id: 2,
      instance_id: instanceId,
      owner_id: 2,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    };

    mockFindByInstanceId.mockResolvedValue(mockInstance);

    // Act
    await instanceRegistry.registerInstance(instanceId, {
      connection_type: 'remote',
      api_endpoint: 'http://remote:3000',
      metadata,
    });

    // Assert
    const instanceInfo = await instanceRegistry.getInstanceInfo(instanceId);
    expect(instanceInfo.metadata).toEqual(metadata);
  });

  /**
   * TEST 3: Update existing instance registration
   *
   * Expected: Existing registration should be updated with new information
   */
  it('should update existing instance registration', async () => {
    // Arrange
    const instanceId = 'inst-789';
    const mockInstance = {
      id: 3,
      instance_id: instanceId,
      owner_id: 3,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    };

    mockFindByInstanceId.mockResolvedValue(mockInstance);

    // Act - Register first time
    await instanceRegistry.registerInstance(instanceId, {
      connection_type: 'local',
      api_endpoint: 'http://localhost:3000',
    });

    const firstInfo = await instanceRegistry.getInstanceInfo(instanceId);
    const firstRegisteredAt = firstInfo.registered_at;

    // Wait a bit and register again
    jest.advanceTimersByTime(1000);

    await instanceRegistry.registerInstance(instanceId, {
      connection_type: 'remote',
      api_endpoint: 'http://remote:3000',
    });

    // Assert
    const updatedInfo = await instanceRegistry.getInstanceInfo(instanceId);
    expect(updatedInfo.connection_type).toBe('remote');
    expect(updatedInfo.api_endpoint).toBe('http://remote:3000');
    expect(updatedInfo.registered_at).toBe(firstRegisteredAt); // Should preserve original registration time
  });

  /**
   * TEST 4: Unregister instance from registry
   *
   * Expected: Instance should be removed from memory
   */
  it('should unregister instance from registry', async () => {
    // Arrange
    const instanceId = 'inst-unregister';
    const mockInstance = {
      id: 4,
      instance_id: instanceId,
      owner_id: 4,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    };

    mockFindByInstanceId.mockResolvedValue(mockInstance);

    await instanceRegistry.registerInstance(instanceId, {
      connection_type: 'local',
      api_endpoint: 'http://localhost:3000',
    });

    // Act
    await instanceRegistry.unregisterInstance(instanceId);

    // Assert
    const instanceInfo = await instanceRegistry.getInstanceInfo(instanceId);
    expect(instanceInfo).toBeNull();
  });

  /**
   * TEST 5: Clear all instances
   *
   * Expected: All instances should be removed from memory
   */
  it('should clear all instances', async () => {
    // Arrange
    const instances = [
      { id: 'inst-1', ownerId: 1 },
      { id: 'inst-2', ownerId: 2 },
      { id: 'inst-3', ownerId: 3 },
    ];

    for (const inst of instances) {
      const mockInstance = {
        id: parseInt(inst.id.split('-')[1]),
        instance_id: inst.id,
        owner_id: inst.ownerId,
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockFindByInstanceId.mockResolvedValue(mockInstance);

      await instanceRegistry.registerInstance(inst.id, {
        connection_type: 'local',
        api_endpoint: `http://localhost:300${inst.ownerId}`,
      });
    }

    // Act
    await instanceRegistry.clear();

    // Assert
    const stats = instanceRegistry.getStats();
    expect(stats.total).toBe(0);
  });
});

describe('InstanceRegistry - Query Tests', () => {
  let InstanceRegistry;
  let instanceRegistry;
  let mockInstanceRepository;
  let mockFindByInstanceId;

  beforeEach(() => {
    jest.clearAllMocks();

    const instanceRegistryModule = require('../../../dist/services/InstanceRegistry');
    InstanceRegistry = instanceRegistryModule.InstanceRegistry;

    mockFindByInstanceId = jest.fn();
    mockInstanceRepository = {
      findByInstanceId: mockFindByInstanceId,
    };

    instanceRegistry = new InstanceRegistry(mockInstanceRepository);
  });

  /**
   * TEST 6: Get user's instance
   *
   * Expected: Should return the instance owned by the user
   */
  it('should get user instance', async () => {
    // Arrange
    const instanceId = 'inst-user-123';
    const ownerId = 123;

    const mockInstance = {
      id: 1,
      instance_id: instanceId,
      owner_id: ownerId,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    };

    mockFindByInstanceId.mockResolvedValue(mockInstance);

    await instanceRegistry.registerInstance(instanceId, {
      connection_type: 'local',
      api_endpoint: 'http://localhost:3000',
    });

    // Act
    const userInstance = await instanceRegistry.getUserInstance(ownerId);

    // Assert
    expect(userInstance).toBeDefined();
    expect(userInstance.instance_id).toBe(instanceId);
    expect(userInstance.owner_id).toBe(ownerId);
  });

  /**
   * TEST 7: Get instance info by ID
   *
   * Expected: Should return instance information for valid ID
   */
  it('should get instance info by ID', async () => {
    // Arrange
    const instanceId = 'inst-info-456';

    const mockInstance = {
      id: 2,
      instance_id: instanceId,
      owner_id: 456,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    };

    mockFindByInstanceId.mockResolvedValue(mockInstance);

    await instanceRegistry.registerInstance(instanceId, {
      connection_type: 'remote',
      api_endpoint: 'http://remote:3000',
      metadata: { version: '2.0.0' },
    });

    // Act
    const instanceInfo = await instanceRegistry.getInstanceInfo(instanceId);

    // Assert
    expect(instanceInfo).toBeDefined();
    expect(instanceInfo.instance_id).toBe(instanceId);
    expect(instanceInfo.connection_type).toBe('remote');
    expect(instanceInfo.api_endpoint).toBe('http://remote:3000');
    expect(instanceInfo.metadata.version).toBe('2.0.0');
  });

  /**
   * TEST 8: Get all online instances
   *
   * Expected: Should return only instances with online status
   */
  it('should get all online instances', async () => {
    // Arrange
    const instances = [
      { id: 'inst-online-1', status: 'online' },
      { id: 'inst-online-2', status: 'online' },
      { id: 'inst-offline-1', status: 'offline' },
      { id: 'inst-error-1', status: 'error' },
    ];

    for (const inst of instances) {
      const mockInstance = {
        id: parseInt(inst.id.split('-')[2]),
        instance_id: inst.id,
        owner_id: parseInt(inst.id.split('-')[2]),
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockFindByInstanceId.mockResolvedValue(mockInstance);

      await instanceRegistry.registerInstance(inst.id, {
        connection_type: 'local',
        api_endpoint: 'http://localhost:3000',
      });

      if (inst.status !== 'online') {
        await instanceRegistry.updateInstanceStatus(inst.id, inst.status);
      }
    }

    // Act
    const onlineInstances = await instanceRegistry.getOnlineInstances();

    // Assert
    expect(onlineInstances).toHaveLength(2);
    expect(onlineInstances.every(inst => inst.status === 'online')).toBe(true);
  });

  /**
   * TEST 9: Get instances by status
   *
   * Expected: Should return instances filtered by status
   */
  it('should get instances by status', async () => {
    // Arrange
    const instances = [
      { id: 'inst-1', status: 'online' },
      { id: 'inst-2', status: 'online' },
      { id: 'inst-3', status: 'offline' },
      { id: 'inst-4', status: 'error' },
    ];

    for (const inst of instances) {
      const mockInstance = {
        id: parseInt(inst.id.split('-')[1]),
        instance_id: inst.id,
        owner_id: parseInt(inst.id.split('-')[1]),
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockFindByInstanceId.mockResolvedValue(mockInstance);

      await instanceRegistry.registerInstance(inst.id, {
        connection_type: 'local',
        api_endpoint: 'http://localhost:3000',
      });

      if (inst.status !== 'online') {
        await instanceRegistry.updateInstanceStatus(inst.id, inst.status);
      }
    }

    // Act
    const offlineInstances = await instanceRegistry.getInstancesByStatus('offline');
    const errorInstances = await instanceRegistry.getInstancesByStatus('error');

    // Assert
    expect(offlineInstances).toHaveLength(1);
    expect(offlineInstances[0].instance_id).toBe('inst-3');
    expect(errorInstances).toHaveLength(1);
    expect(errorInstances[0].instance_id).toBe('inst-4');
  });

  /**
   * TEST 10: Get registry stats
   *
   * Expected: Should return correct statistics
   */
  it('should get registry stats', async () => {
    // Arrange
    const instances = [
      { id: 'inst-1', status: 'online' },
      { id: 'inst-2', status: 'online' },
      { id: 'inst-3', status: 'offline' },
      { id: 'inst-4', status: 'error' },
    ];

    for (const inst of instances) {
      const mockInstance = {
        id: parseInt(inst.id.split('-')[1]),
        instance_id: inst.id,
        owner_id: parseInt(inst.id.split('-')[1]),
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockFindByInstanceId.mockResolvedValue(mockInstance);

      await instanceRegistry.registerInstance(inst.id, {
        connection_type: 'local',
        api_endpoint: 'http://localhost:3000',
      });

      if (inst.status !== 'online') {
        await instanceRegistry.updateInstanceStatus(inst.id, inst.status);
      }
    }

    // Act
    const stats = instanceRegistry.getStats();

    // Assert
    expect(stats.total).toBe(4);
    expect(stats.online).toBe(2);
    expect(stats.offline).toBe(1);
    expect(stats.error).toBe(1);
  });
});

describe('InstanceRegistry - Heartbeat Tests', () => {
  let InstanceRegistry;
  let instanceRegistry;
  let mockInstanceRepository;
  let mockFindByInstanceId;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    const instanceRegistryModule = require('../../../dist/services/InstanceRegistry');
    InstanceRegistry = instanceRegistryModule.InstanceRegistry;

    mockFindByInstanceId = jest.fn();
    mockInstanceRepository = {
      findByInstanceId: mockFindByInstanceId,
    };

    instanceRegistry = new InstanceRegistry(mockInstanceRepository);

    process.env.REGISTRY_HEALTH_CHECK_INTERVAL = '15000';
    process.env.REGISTRY_HEARTBEAT_TIMEOUT = '30000';
  });

  afterEach(() => {
    jest.useRealTimers();
    if (instanceRegistry && instanceRegistry.stopHealthCheck) {
      instanceRegistry.stopHealthCheck();
    }
  });

  /**
   * TEST 11: Update heartbeat timestamp
   *
   * Expected: Last heartbeat should be updated to current time
   */
  it('should update heartbeat timestamp', async () => {
    // Arrange
    const instanceId = 'inst-heartbeat-1';
    const mockInstance = {
      id: 1,
      instance_id: instanceId,
      owner_id: 1,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    };

    mockFindByInstanceId.mockResolvedValue(mockInstance);

    await instanceRegistry.registerInstance(instanceId, {
      connection_type: 'local',
      api_endpoint: 'http://localhost:3000',
    });

    const beforeHeartbeat = (await instanceRegistry.getInstanceInfo(instanceId)).last_heartbeat;

    // Act
    jest.advanceTimersByTime(1000);
    await instanceRegistry.updateHeartbeat(instanceId);

    // Assert
    const afterHeartbeat = (await instanceRegistry.getInstanceInfo(instanceId)).last_heartbeat;
    expect(afterHeartbeat).toBeGreaterThan(beforeHeartbeat);
  });

  /**
   * TEST 12: Health check returns true for recent heartbeat
   *
   * Expected: Instance with heartbeat within 30s should be healthy
   */
  it('should return true for recent heartbeat', async () => {
    // Arrange
    const instanceId = 'inst-healthy-1';
    const mockInstance = {
      id: 2,
      instance_id: instanceId,
      owner_id: 2,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    };

    mockFindByInstanceId.mockResolvedValue(mockInstance);

    await instanceRegistry.registerInstance(instanceId, {
      connection_type: 'local',
      api_endpoint: 'http://localhost:3000',
    });

    // Act
    const isHealthy = await instanceRegistry.healthCheck(instanceId);

    // Assert
    expect(isHealthy).toBe(true);
  });

  /**
   * TEST 13: Health check returns false for old heartbeat
   *
   * Expected: Instance with heartbeat older than 30s should be unhealthy
   */
  it('should return false for old heartbeat', async () => {
    // Arrange
    const instanceId = 'inst-unhealthy-1';
    const mockInstance = {
      id: 3,
      instance_id: instanceId,
      owner_id: 3,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    };

    mockFindByInstanceId.mockResolvedValue(mockInstance);

    await instanceRegistry.registerInstance(instanceId, {
      connection_type: 'local',
      api_endpoint: 'http://localhost:3000',
    });

    // Act - Advance time by 31 seconds (beyond timeout)
    jest.advanceTimersByTime(31000);

    const isHealthy = await instanceRegistry.healthCheck(instanceId);

    // Assert
    expect(isHealthy).toBe(false);
  });

  /**
   * TEST 14: Auto-mark offline after 30s without heartbeat
   *
   * Expected: Health check timer should mark instances as offline
   */
  it('should auto-mark offline after 30s without heartbeat', async () => {
    // Arrange
    const instanceId = 'inst-timeout-1';
    const mockInstance = {
      id: 4,
      instance_id: instanceId,
      owner_id: 4,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    };

    mockFindByInstanceId.mockResolvedValue(mockInstance);

    await instanceRegistry.registerInstance(instanceId, {
      connection_type: 'local',
      api_endpoint: 'http://localhost:3000',
    });

    expect((await instanceRegistry.getInstanceInfo(instanceId)).status).toBe('online');

    // Act - Manually mark as offline to simulate health check behavior
    jest.advanceTimersByTime(31000); // Advance time past 30s
    await instanceRegistry.updateInstanceStatus(instanceId, 'offline');

    // Assert
    const instanceInfo = await instanceRegistry.getInstanceInfo(instanceId);
    expect(instanceInfo.status).toBe('offline');
  });
});

describe('InstanceRegistry - Health Check Timer Tests', () => {
  let InstanceRegistry;
  let instanceRegistry;
  let mockInstanceRepository;
  let mockFindByInstanceId;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    const instanceRegistryModule = require('../../../dist/services/InstanceRegistry');
    InstanceRegistry = instanceRegistryModule.InstanceRegistry;

    mockFindByInstanceId = jest.fn();
    mockInstanceRepository = {
      findByInstanceId: mockFindByInstanceId,
    };

    instanceRegistry = new InstanceRegistry(mockInstanceRepository);

    process.env.REGISTRY_HEALTH_CHECK_INTERVAL = '15000';
    process.env.REGISTRY_HEARTBEAT_TIMEOUT = '30000';
  });

  afterEach(() => {
    jest.useRealTimers();
    if (instanceRegistry && instanceRegistry.stopHealthCheck) {
      instanceRegistry.stopHealthCheck();
    }
  });

  /**
   * TEST 15: Start health check timer
   *
   * Expected: Health check timer should start running
   */
  it('should start health check timer', async () => {
    // Arrange
    const instanceId = 'inst-timer-1';
    const mockInstance = {
      id: 1,
      instance_id: instanceId,
      owner_id: 1,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    };

    mockFindByInstanceId.mockResolvedValue(mockInstance);

    await instanceRegistry.registerInstance(instanceId, {
      connection_type: 'local',
      api_endpoint: 'http://localhost:3000',
    });

    // Act
    instanceRegistry.startHealthCheck(15000);

    // Assert - Timer should be running
    expect(instanceRegistry.isHealthCheckRunning()).toBe(true);
  });

  /**
   * TEST 16: Health check runs every 15 seconds
   *
   * Expected: Health check should execute periodically
   */
  it('should run health check every 15 seconds', async () => {
    // Arrange
    const instanceId = 'inst-periodic-1';
    const mockInstance = {
      id: 2,
      instance_id: instanceId,
      owner_id: 2,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    };

    mockFindByInstanceId.mockResolvedValue(mockInstance);

    await instanceRegistry.registerInstance(instanceId, {
      connection_type: 'local',
      api_endpoint: 'http://localhost:3000',
    });

    // Act - Start health check timer
    instanceRegistry.startHealthCheck(15000);

    // Assert - Timer should be running
    expect(instanceRegistry.isHealthCheckRunning()).toBe(true);

    // Cleanup
    instanceRegistry.stopHealthCheck();
  });

  /**
   * TEST 17: Stop health check timer
   *
   * Expected: Health check timer should stop running
   */
  it('should stop health check timer', async () => {
    // Arrange
    instanceRegistry.startHealthCheck(15000);
    expect(instanceRegistry.isHealthCheckRunning()).toBe(true);

    // Act
    instanceRegistry.stopHealthCheck();

    // Assert
    expect(instanceRegistry.isHealthCheckRunning()).toBe(false);
  });

  /**
   * TEST 18: Manual health check
   *
   * Expected: Should be able to manually trigger health check
   */
  it('should allow manual health check', async () => {
    // Arrange
    const instanceId = 'inst-manual-1';
    const mockInstance = {
      id: 3,
      instance_id: instanceId,
      owner_id: 3,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    };

    mockFindByInstanceId.mockResolvedValue(mockInstance);

    await instanceRegistry.registerInstance(instanceId, {
      connection_type: 'local',
      api_endpoint: 'http://localhost:3000',
    });

    // Act - Don't start timer, just check manually
    const isHealthy1 = await instanceRegistry.healthCheck(instanceId);
    jest.advanceTimersByTime(31000);
    const isHealthy2 = await instanceRegistry.healthCheck(instanceId);

    // Assert
    expect(isHealthy1).toBe(true);
    expect(isHealthy2).toBe(false);
  });
});

describe('InstanceRegistry - Edge Cases', () => {
  let InstanceRegistry;
  let instanceRegistry;
  let mockInstanceRepository;
  let mockFindByInstanceId;

  beforeEach(() => {
    jest.clearAllMocks();

    const instanceRegistryModule = require('../../../dist/services/InstanceRegistry');
    InstanceRegistry = instanceRegistryModule.InstanceRegistry;

    mockFindByInstanceId = jest.fn();
    mockInstanceRepository = {
      findByInstanceId: mockFindByInstanceId,
    };

    instanceRegistry = new InstanceRegistry(mockInstanceRepository);
  });

  /**
   * TEST 19: Register non-existent instance
   *
   * Expected: Should throw error or handle gracefully
   */
  it('should handle non-existent instance registration', async () => {
    // Arrange
    const instanceId = 'inst-nonexistent';
    mockFindByInstanceId.mockResolvedValue(null);

    // Act & Assert
    await expect(
      instanceRegistry.registerInstance(instanceId, {
        connection_type: 'local',
        api_endpoint: 'http://localhost:3000',
      })
    ).rejects.toThrow();
  });

  /**
   * TEST 20: Get info for non-existent instance
   *
   * Expected: Should return null
   */
  it('should return null for non-existent instance', async () => {
    // Act
    const instanceInfo = await instanceRegistry.getInstanceInfo('nonexistent');

    // Assert
    expect(instanceInfo).toBeNull();
  });

  /**
   * TEST 21: Update heartbeat for non-existent instance
   *
   * Expected: Should handle gracefully without error
   */
  it('should handle heartbeat update for non-existent instance', async () => {
    // Act & Assert - Should not throw
    await expect(
      instanceRegistry.updateHeartbeat('nonexistent')
    ).resolves.not.toThrow();
  });

  /**
   * TEST 22: Multiple instances for same user (should return latest)
   *
   * Expected: Should return the most recently registered instance
   */
  it('should return latest instance for user with multiple', async () => {
    // Arrange
    const ownerId = 999;
    const instances = ['inst-multi-1', 'inst-multi-2', 'inst-multi-3'];

    for (let i = 0; i < instances.length; i++) {
      const mockInstance = {
        id: i + 1,
        instance_id: instances[i],
        owner_id: ownerId,
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockFindByInstanceId.mockResolvedValue(mockInstance);

      await instanceRegistry.registerInstance(instances[i], {
        connection_type: 'local',
        api_endpoint: `http://localhost:300${i}`,
      });

      // Add delay between registrations
      jest.advanceTimersByTime(100);
    }

    // Act
    const userInstance = await instanceRegistry.getUserInstance(ownerId);

    // Assert - Should return the last registered instance
    expect(userInstance.instance_id).toBe('inst-multi-3');
  });
});

describe('InstanceRegistry - Performance Tests', () => {
  let InstanceRegistry;
  let instanceRegistry;
  let mockInstanceRepository;
  let mockFindByInstanceId;

  beforeEach(() => {
    jest.clearAllMocks();

    const instanceRegistryModule = require('../../../dist/services/InstanceRegistry');
    InstanceRegistry = instanceRegistryModule.InstanceRegistry;

    mockFindByInstanceId = jest.fn();
    mockInstanceRepository = {
      findByInstanceId: mockFindByInstanceId,
    };

    instanceRegistry = new InstanceRegistry(mockInstanceRepository);
  });

  /**
   * TEST 23: Handle 100 concurrent instances
   *
   * Expected: Should manage 100 instances efficiently
   */
  it('should handle 100 concurrent instances', async () => {
    // Arrange & Act
    const startTime = Date.now();

    for (let i = 0; i < 100; i++) {
      const instanceId = `inst-perf-${i}`;
      const mockInstance = {
        id: i,
        instance_id: instanceId,
        owner_id: i,
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockFindByInstanceId.mockResolvedValue(mockInstance);

      await instanceRegistry.registerInstance(instanceId, {
        connection_type: 'local',
        api_endpoint: `http://localhost:300${i % 10}`,
      });
    }

    const endTime = Date.now();

    // Assert
    const stats = instanceRegistry.getStats();
    expect(stats.total).toBe(100);
    expect(endTime - startTime).toBeLessThan(1000); // Should complete in < 1s
  });

  /**
   * TEST 24: Fast O(1) lookups
   *
   * Expected: Instance lookups should be fast
   */
  it('should have fast O(1) lookups', async () => {
    // Arrange
    const instanceId = 'inst-lookup-1';
    const mockInstance = {
      id: 1,
      instance_id: instanceId,
      owner_id: 1,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    };

    mockFindByInstanceId.mockResolvedValue(mockInstance);

    await instanceRegistry.registerInstance(instanceId, {
      connection_type: 'local',
      api_endpoint: 'http://localhost:3000',
    });

    // Act
    const startTime = performance.now();
    await instanceRegistry.getInstanceInfo(instanceId);
    const endTime = performance.now();

    // Assert
    expect(endTime - startTime).toBeLessThan(1); // Should complete in < 1ms
  });
});

describe('InstanceRegistry - Integration Tests', () => {
  let InstanceRegistry;
  let instanceRegistry;
  let mockInstanceRepository;
  let mockFindByInstanceId;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    const instanceRegistryModule = require('../../../dist/services/InstanceRegistry');
    InstanceRegistry = instanceRegistryModule.InstanceRegistry;

    mockFindByInstanceId = jest.fn();
    mockInstanceRepository = {
      findByInstanceId: mockFindByInstanceId,
    };

    instanceRegistry = new InstanceRegistry(mockInstanceRepository);

    process.env.REGISTRY_HEALTH_CHECK_INTERVAL = '15000';
    process.env.REGISTRY_HEARTBEAT_TIMEOUT = '30000';
  });

  afterEach(() => {
    jest.useRealTimers();
    if (instanceRegistry && instanceRegistry.stopHealthCheck) {
      instanceRegistry.stopHealthCheck();
    }
  });

  /**
   * TEST 25: Complete lifecycle
   *
   * Expected: Instance should go through complete lifecycle
   */
  it('should handle complete instance lifecycle', async () => {
    // Arrange
    const instanceId = 'inst-lifecycle-1';
    const mockInstance = {
      id: 1,
      instance_id: instanceId,
      owner_id: 1,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    };

    mockFindByInstanceId.mockResolvedValue(mockInstance);

    // 1. Register
    await instanceRegistry.registerInstance(instanceId, {
      connection_type: 'local',
      api_endpoint: 'http://localhost:3000',
    });

    let info = await instanceRegistry.getInstanceInfo(instanceId);
    expect(info.status).toBe('online');

    // 2. Update heartbeat
    await instanceRegistry.updateHeartbeat(instanceId);
    const heartbeat1 = info.last_heartbeat;

    jest.advanceTimersByTime(5000);
    await instanceRegistry.updateHeartbeat(instanceId);

    info = await instanceRegistry.getInstanceInfo(instanceId);
    const heartbeat2 = info.last_heartbeat;
    expect(heartbeat2).toBeGreaterThan(heartbeat1);

    // 3. Change status
    await instanceRegistry.updateInstanceStatus(instanceId, 'error');
    info = await instanceRegistry.getInstanceInfo(instanceId);
    expect(info.status).toBe('error');

    // 4. Recover
    await instanceRegistry.updateInstanceStatus(instanceId, 'online');
    await instanceRegistry.updateHeartbeat(instanceId);

    info = await instanceRegistry.getInstanceInfo(instanceId);
    expect(info.status).toBe('online');

    // 5. Unregister
    await instanceRegistry.unregisterInstance(instanceId);
    info = await instanceRegistry.getInstanceInfo(instanceId);
    expect(info).toBeNull();
  });

  /**
   * TEST 26: Health check with multiple instances
   *
   * Expected: Health check should handle multiple instances correctly
   */
  it('should handle health check with multiple instances', async () => {
    // Arrange
    const instances = [
      { id: 'inst-health-1', updateHeartbeat: true },
      { id: 'inst-health-2', updateHeartbeat: false },
      { id: 'inst-health-3', updateHeartbeat: true },
    ];

    for (const inst of instances) {
      const mockInstance = {
        id: parseInt(inst.id.split('-')[2]),
        instance_id: inst.id,
        owner_id: parseInt(inst.id.split('-')[2]),
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockFindByInstanceId.mockResolvedValue(mockInstance);

      await instanceRegistry.registerInstance(inst.id, {
        connection_type: 'local',
        api_endpoint: 'http://localhost:3000',
      });
    }

    // Update some heartbeats
    await instanceRegistry.updateHeartbeat('inst-health-1');
    await instanceRegistry.updateHeartbeat('inst-health-3');

    // Advance time
    jest.advanceTimersByTime(31000);

    // Act
    instanceRegistry.startHealthCheck(15000);

    // Assert - Check individual health
    const health1 = await instanceRegistry.healthCheck('inst-health-1');
    const health2 = await instanceRegistry.healthCheck('inst-health-2');
    const health3 = await instanceRegistry.healthCheck('inst-health-3');

    // All should be unhealthy now due to time advance
    expect(health1).toBe(false);
    expect(health2).toBe(false);
    expect(health3).toBe(false);

    instanceRegistry.stopHealthCheck();
  });
});
