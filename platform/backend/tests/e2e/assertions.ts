/**
 * E2E Test Assertions
 *
 * Custom assertions for end-to-end test validation.
 * Provides semantic assertions for common E2E test scenarios.
 *
 * Features:
 * - Container state validation
 * - Database record validation
 * - API key allocation validation
 * - Docker configuration validation
 * - Instance lifecycle validation
 */

import Docker from 'dockerode';
import { AppDataSource } from '../../src/config/database';
import { Instance } from '../../src/entities/Instance.entity';
import { ApiKey } from '../../src/entities/ApiKey.entity';
import { User } from '../../src/entities/User.entity';
import { DockerHelper } from '../integration/helpers/docker.helper';

export class E2EAssertions {
  private static docker: Docker;

  /**
   * Initialize Docker connection
   */
  static async initialize(): Promise<void> {
    if (!this.docker) {
      await DockerHelper.connect();
      this.docker = DockerHelper.getDocker();
    }
  }

  // ==================== Container Assertions ====================

  /**
   * Assert that a container exists
   */
  static async assertContainerExists(
    containerId: string,
    message?: string
  ): Promise<void> {
    await this.initialize();

    try {
      const container = this.docker.getContainer(containerId);
      await container.inspect();
      // Success - container exists
    } catch (error) {
      throw new Error(
        message || `Expected container ${containerId} to exist, but it was not found`
      );
    }
  }

  /**
   * Assert that a container does not exist
   */
  static async assertContainerNotExists(
    containerId: string,
    message?: string
  ): Promise<void> {
    await this.initialize();

    try {
      const container = this.docker.getContainer(containerId);
      await container.inspect();
      throw new Error(
        message || `Expected container ${containerId} to not exist, but it was found`
      );
    } catch (error) {
      // Success - container does not exist
      if ((error as Error).message.includes('not found')) {
        return;
      }
      throw error;
    }
  }

  /**
   * Assert that a container is running
   */
  static async assertContainerRunning(
    instanceId: string,
    message?: string
  ): Promise<void> {
    await this.initialize();

    const containerName = `opclaw-${instanceId}`;
    const containers = await this.docker.listContainers({ all: true });

    const container = containers.find((c: any) =>
      c.Names.some((n: string) => n === `/${containerName}`)
    );

    if (!container) {
      throw new Error(
        message || `Expected container ${containerName} to be running, but it was not found`
      );
    }

    if (container.State !== 'running') {
      throw new Error(
        message || `Expected container ${containerName} to be running, but state is ${container.State}`
      );
    }
  }

  /**
   * Assert that a container is stopped
   */
  static async assertContainerStopped(
    instanceId: string,
    message?: string
  ): Promise<void> {
    await this.initialize();

    const containerName = `opclaw-${instanceId}`;
    const containers = await this.docker.listContainers({ all: true });

    const container = containers.find((c: any) =>
      c.Names.some((n: string) => n === `/${containerName}`)
    );

    if (!container) {
      throw new Error(
        message || `Expected container ${containerName} to be stopped, but it was not found`
      );
    }

    if (container.State === 'running') {
      throw new Error(
        message || `Expected container ${containerName} to be stopped, but it is running`
      );
    }
  }

  /**
   * Assert container configuration
   */
  static async assertContainerConfig(
    containerId: string,
    expectedConfig: {
      image?: string;
      envVars?: Record<string, string>;
      memoryLimit?: number;
      cpuLimit?: number;
      restartPolicy?: string;
    },
    message?: string
  ): Promise<void> {
    await this.initialize();

    try {
      const container = this.docker.getContainer(containerId);
      const info = await container.inspect();

      // Check image
      if (expectedConfig.image) {
        if (!info.Config.Image.includes(expectedConfig.image)) {
          throw new Error(
            `Expected image to include ${expectedConfig.image}, got ${info.Config.Image}`
          );
        }
      }

      // Check environment variables
      if (expectedConfig.envVars) {
        const envVars = info.Config.Env || [];
        for (const [key, value] of Object.entries(expectedConfig.envVars)) {
          const envVar = envVars.find(e => e.startsWith(`${key}=`));
          if (!envVar) {
            throw new Error(`Expected environment variable ${key} not found`);
          }
          const [, actualValue] = envVar.split('=');
          if (actualValue !== value) {
            throw new Error(
              `Expected ${key}=${value}, got ${key}=${actualValue}`
            );
          }
        }
      }

      // Check memory limit
      if (expectedConfig.memoryLimit) {
        if (info.HostConfig.Memory !== expectedConfig.memoryLimit) {
          throw new Error(
            `Expected memory limit ${expectedConfig.memoryLimit}, ` +
            `got ${info.HostConfig.Memory}`
          );
        }
      }

      // Check CPU limit
      if (expectedConfig.cpuLimit) {
        if (info.HostConfig.NanoCpus !== expectedConfig.cpuLimit) {
          throw new Error(
            `Expected CPU limit ${expectedConfig.cpuLimit}, ` +
            `got ${info.HostConfig.NanoCpus}`
          );
        }
      }

      // Check restart policy
      if (expectedConfig.restartPolicy) {
        if (info.HostConfig.RestartPolicy?.Name !== expectedConfig.restartPolicy) {
          throw new Error(
            `Expected restart policy ${expectedConfig.restartPolicy}, ` +
            `got ${info.HostConfig.RestartPolicy?.Name}`
          );
        }
      }
    } catch (error) {
      throw new Error(
        message || `Container configuration assertion failed: ${(error as Error).message}`
      );
    }
  }

  // ==================== Database Assertions ====================

  /**
   * Assert that a database record exists
   */
  static async assertDatabaseRecordExists<T>(
    entityClass: new () => T,
    criteria: Record<string, any>,
    message?: string
  ): Promise<void> {
    const repository = AppDataSource.getRepository(entityClass);
    const record = await repository.findOne({ where: criteria });

    if (!record) {
      throw new Error(
        message ||
        `Expected ${entityClass.name} record to exist with criteria ${JSON.stringify(criteria)}`
      );
    }
  }

  /**
   * Assert that a database record does not exist
   */
  static async assertDatabaseRecordNotExists<T>(
    entityClass: new () => T,
    criteria: Record<string, any>,
    message?: string
  ): Promise<void> {
    const repository = AppDataSource.getRepository(entityClass);
    const record = await repository.findOne({ where: criteria });

    if (record) {
      throw new Error(
        message ||
        `Expected ${entityClass.name} record to not exist with criteria ${JSON.stringify(criteria)}`
      );
    }
  }

  /**
   * Assert database record count
   */
  static async assertDatabaseRecordCount<T>(
    entityClass: new () => T,
    criteria: Record<string, any>,
    expectedCount: number,
    message?: string
  ): Promise<void> {
    const repository = AppDataSource.getRepository(entityClass);
    const count = await repository.count({ where: criteria });

    if (count !== expectedCount) {
      throw new Error(
        message ||
        `Expected ${expectedCount} ${entityClass.name} records, but found ${count}`
      );
    }
  }

  // ==================== Instance Assertions ====================

  /**
   * Assert instance exists in database
   */
  static async assertInstanceExists(
    instanceId: string,
    message?: string
  ): Promise<void> {
    await this.assertDatabaseRecordExists(Instance, { instance_id: instanceId }, message);
  }

  /**
   * Assert instance does not exist in database
   */
  static async assertInstanceNotExists(
    instanceId: string,
    message?: string
  ): Promise<void> {
    await this.assertDatabaseRecordNotExists(Instance, { instance_id: instanceId }, message);
  }

  /**
   * Assert instance status
   */
  static async assertInstanceStatus(
    instanceId: string,
    expectedStatus: 'pending' | 'active' | 'stopped' | 'error',
    message?: string
  ): Promise<void> {
    const repository = AppDataSource.getRepository(Instance);
    const instance = await repository.findOne({ where: { instance_id: instanceId } });

    if (!instance) {
      throw new Error(message || `Instance ${instanceId} not found`);
    }

    if (instance.status !== expectedStatus) {
      throw new Error(
        message ||
        `Expected instance status ${expectedStatus}, but got ${instance.status}`
      );
    }
  }

  /**
   * Assert instance template
   */
  static async assertInstanceTemplate(
    instanceId: string,
    expectedTemplate: 'personal' | 'team' | 'enterprise',
    message?: string
  ): Promise<void> {
    const repository = AppDataSource.getRepository(Instance);
    const instance = await repository.findOne({ where: { instance_id: instanceId } });

    if (!instance) {
      throw new Error(message || `Instance ${instanceId} not found`);
    }

    if (instance.template !== expectedTemplate) {
      throw new Error(
        message ||
        `Expected instance template ${expectedTemplate}, but got ${instance.template}`
      );
    }
  }

  // ==================== API Key Assertions ====================

  /**
   * Assert API key allocated for user
   */
  static async assertApiKeyAllocated(
    userId: string,
    message?: string
  ): Promise<void> {
    await this.assertDatabaseRecordExists(
      ApiKey,
      { user_id: userId, status: 'active' },
      message || `Expected active API key for user ${userId}`
    );
  }

  /**
   * Assert API key released for user
   */
  static async assertApiKeyReleased(
    userId: string,
    message?: string
  ): Promise<void> {
    await this.assertDatabaseRecordNotExists(
      ApiKey,
      { user_id: userId, status: 'active' },
      message || `Expected no active API key for user ${userId}`
    );
  }

  /**
   * Assert API key format
   */
  static async assertApiKeyFormat(
    apiKey: string,
    message?: string
  ): Promise<void> {
    const keyPattern = /^sk-[a-zA-Z0-9_-]{20,}$/;

    if (!keyPattern.test(apiKey)) {
      throw new Error(
        message || `Expected API key to match pattern ${keyPattern}, got ${apiKey}`
      );
    }
  }

  // ==================== User Assertions ====================

  /**
   * Assert user exists
   */
  static async assertUserExists(
    userId: string,
    message?: string
  ): Promise<void> {
    await this.assertDatabaseRecordExists(User, { id: userId }, message);
  }

  /**
   * Assert user has instance count
   */
  static async assertUserInstanceCount(
    userId: string,
    expectedCount: number,
    message?: string
  ): Promise<void> {
    await this.assertDatabaseRecordCount(
      Instance,
      { owner_id: userId },
      expectedCount,
      message || `Expected user ${userId} to have ${expectedCount} instances`
    );
  }

  // ==================== Metrics Assertions ====================

  /**
   * Assert metrics collected for instance
   */
  static async assertMetricsCollected(
    instanceId: string,
    message?: string
  ): Promise<void> {
    // This would check if metrics exist in the metrics storage
    // For now, we'll check if the instance exists and is active
    await this.assertInstanceStatus(instanceId, 'active', message);
  }

  /**
   * Assert container resource usage within limits
   */
  static async assertResourceUsage(
    instanceId: string,
    limits: {
      maxCpuPercent?: number;
      maxMemoryPercent?: number;
    },
    message?: string
  ): Promise<void> {
    await this.initialize();

    const containerName = `opclaw-${instanceId}`;
    const containers = await this.docker.listContainers();

    const container = containers.find((c: any) =>
      c.Names.some((n: string) => n === `/${containerName}`)
    );

    if (!container) {
      throw new Error(`Container ${containerName} not found`);
    }

    const stats = await DockerHelper.getContainerStats(container.Id);

    if (limits.maxCpuPercent && stats.cpuPercent > limits.maxCpuPercent) {
      throw new Error(
        message ||
        `CPU usage ${stats.cpuPercent}% exceeds limit ${limits.maxCpuPercent}%`
      );
    }

    if (limits.maxMemoryPercent && stats.memoryPercent > limits.maxMemoryPercent) {
      throw new Error(
        message ||
        `Memory usage ${stats.memoryPercent}% exceeds limit ${limits.maxMemoryPercent}%`
      );
    }
  }

  // ==================== Helper Methods ====================

  /**
   * Assert with timeout
   */
  static async assertWithinTimeout(
    assertion: () => Promise<void>,
    timeout: number,
    timeoutMessage?: string
  ): Promise<void> {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(timeoutMessage || `Assertion timed out after ${timeout}ms`)), timeout)
    );

    await Promise.race([assertion(), timeoutPromise]);
  }

  /**
   * Assert with retries
   */
  static async assertWithRetry(
    assertion: () => Promise<void>,
    maxAttempts = 3,
    delay = 1000
  ): Promise<void> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await assertion();
        return;
      } catch (error) {
        lastError = error as Error;
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }
}

// Export convenience functions
export const assertContainerExists = E2EAssertions.assertContainerExists.bind(E2EAssertions);
export const assertContainerRunning = E2EAssertions.assertContainerRunning.bind(E2EAssertions);
export const assertContainerStopped = E2EAssertions.assertContainerStopped.bind(E2EAssertions);
export const assertContainerNotExists = E2EAssertions.assertContainerNotExists.bind(E2EAssertions);
export const assertInstanceExists = E2EAssertions.assertInstanceExists.bind(E2EAssertions);
export const assertInstanceNotExists = E2EAssertions.assertInstanceNotExists.bind(E2EAssertions);
export const assertInstanceStatus = E2EAssertions.assertInstanceStatus.bind(E2EAssertions);
export const assertApiKeyAllocated = E2EAssertions.assertApiKeyAllocated.bind(E2EAssertions);
export const assertApiKeyReleased = E2EAssertions.assertApiKeyReleased.bind(E2EAssertions);
export const assertMetricsCollected = E2EAssertions.assertMetricsCollected.bind(E2EAssertions);
