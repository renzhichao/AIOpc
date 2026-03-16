/**
 * Docker Test Helper
 *
 * Provides utilities for managing Docker containers during tests,
 * including cleanup, verification, and test container creation.
 */

import Docker from 'dockerode';

export class DockerHelper {
  private static docker: Docker;
  private static createdContainers: Set<string> = new Set();
  private static createdNetworks: Set<string> = new Set();
  private static createdVolumes: Set<string> = new Set();

  /**
   * Initialize Docker connection
   */
  static async connect(): Promise<void> {
    this.docker = new Docker({
      socketPath: process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock',
    });

    try {
      await this.docker.ping();
      console.log('✓ Docker daemon connected');
    } catch (error) {
      throw new Error(`Docker daemon not accessible: ${error}`);
    }
  }

  /**
   * Get Docker instance
   */
  static getDocker(): Docker {
    if (!this.docker) {
      throw new Error('Docker not initialized. Call connect() first.');
    }
    return this.docker;
  }

  /**
   * Verify required image exists
   */
  static async verifyImage(imageName: string): Promise<boolean> {
    const images = await this.docker.listImages();
    const imageExists = images.some((img: any) =>
      img.RepoTags?.some((tag: string) => tag === imageName || tag === `${imageName}:latest`)
    );

    if (!imageExists) {
      console.warn(`⚠ Image ${imageName} not found`);
    } else {
      console.log(`✓ Image ${imageName} exists`);
    }

    return imageExists;
  }

  /**
   * Track a container for cleanup
   */
  static trackContainer(containerId: string): void {
    this.createdContainers.add(containerId);
  }

  /**
   * Track a network for cleanup
   */
  static trackNetwork(networkId: string): void {
    this.createdNetworks.add(networkId);
  }

  /**
   * Track a volume for cleanup
   */
  static trackVolume(volumeName: string): void {
    this.createdVolumes.add(volumeName);
  }

  /**
   * Remove a container
   */
  static async removeContainer(containerId: string, force = true): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.remove({ force, v: true });
      this.createdContainers.delete(containerId);
      console.log(`✓ Removed container ${containerId}`);
    } catch (error) {
      console.warn(`Failed to remove container ${containerId}:`, error);
    }
  }

  /**
   * Remove all tracked containers
   */
  static async removeAllTrackedContainers(): Promise<void> {
    const removals = Array.from(this.createdContainers).map(async (containerId) => {
      await this.removeContainer(containerId);
    });

    await Promise.all(removals);
    this.createdContainers.clear();
  }

  /**
   * Remove all tracked networks
   */
  static async removeAllTrackedNetworks(): Promise<void> {
    const removals = Array.from(this.createdNetworks).map(async (networkId) => {
      try {
        const network = this.docker.getNetwork(networkId);
        await network.remove();
        this.createdNetworks.delete(networkId);
        console.log(`✓ Removed network ${networkId}`);
      } catch (error) {
        console.warn(`Failed to remove network ${networkId}:`, error);
      }
    });

    await Promise.all(removals);
    this.createdNetworks.clear();
  }

  /**
   * Remove all tracked volumes
   */
  static async removeAllTrackedVolumes(): Promise<void> {
    const removals = Array.from(this.createdVolumes).map(async (volumeName) => {
      try {
        const volume = this.docker.getVolume(volumeName);
        await volume.remove();
        this.createdVolumes.delete(volumeName);
        console.log(`✓ Removed volume ${volumeName}`);
      } catch (error) {
        console.warn(`Failed to remove volume ${volumeName}:`, error);
      }
    });

    await Promise.all(removals);
    this.createdVolumes.clear();
  }

  /**
   * Clean up all tracked Docker resources
   */
  static async cleanupAll(): Promise<void> {
    await this.removeAllTrackedContainers();
    await this.removeAllTrackedNetworks();
    await this.removeAllTrackedVolumes();
    console.log('✓ All Docker resources cleaned up');
  }

  /**
   * Remove all test containers (even untracked ones)
   */
  static async removeAllTestContainers(): Promise<void> {
    try {
      const containers = await this.docker.listContainers({ all: true });

      const removals = containers
        .filter((c: any) =>
          c.Names.some((n: string) =>
            n.includes('test-') || n.includes('integration-') || n.includes('inst-')
          )
        )
        .map(async (c: any) => {
          try {
            const container = this.docker.getContainer(c.Id);
            await container.remove({ force: true, v: true });
            console.log(`✓ Removed test container ${c.Id}`);
          } catch (error) {
            console.warn(`Failed to remove test container ${c.Id}:`, error);
          }
        });

      await Promise.all(removals);
    } catch (error) {
      console.warn('Failed to remove test containers:', error);
    }
  }

  /**
   * Check if container exists
   */
  static async containerExists(containerId: string): Promise<boolean> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.inspect();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get container status
   */
  static async getContainerStatus(containerId: string): Promise<{
    running: boolean;
    status: string;
  }> {
    try {
      const container = this.docker.getContainer(containerId);
      const info = await container.inspect();

      return {
        running: info.State.Running,
        status: info.State.Status,
      };
    } catch (error) {
      throw new Error(`Failed to get container status: ${error}`);
    }
  }

  /**
   * Wait for container to be in a specific state
   */
  static async waitForContainerState(
    containerId: string,
    desiredState: 'running' | 'exited' | 'stopped',
    timeout = 30000,
    interval = 500
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const status = await this.getContainerStatus(containerId);

      if (desiredState === 'running' && status.running) {
        return;
      }

      if (desiredState === 'exited' && status.status === 'exited') {
        return;
      }

      if (desiredState === 'stopped' && !status.running) {
        return;
      }

      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error(
      `Container ${containerId} did not reach state ${desiredState} within ${timeout}ms`
    );
  }

  /**
   * Get container logs
   */
  static async getContainerLogs(containerId: string, tail = 100): Promise<string> {
    try {
      const container = this.docker.getContainer(containerId);
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        tail,
        timestamps: true,
      });

      return logs.toString('utf-8');
    } catch (error) {
      throw new Error(`Failed to get container logs: ${error}`);
    }
  }

  /**
   * Get container stats
   */
  static async getContainerStats(containerId: string): Promise<{
    cpuPercent: number;
    memoryUsage: number;
    memoryLimit: number;
    memoryPercent: number;
  }> {
    try {
      const container = this.docker.getContainer(containerId);
      const stats = await container.stats({ stream: false });

      const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
      const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
      const cpuPercent = (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100;

      const memoryUsage = stats.memory_stats.usage || 0;
      const memoryLimit = stats.memory_stats.limit || 0;
      const memoryPercent = (memoryUsage / memoryLimit) * 100;

      return {
        cpuPercent: Math.round(cpuPercent * 100) / 100,
        memoryUsage,
        memoryLimit,
        memoryPercent: Math.round(memoryPercent * 100) / 100,
      };
    } catch (error) {
      throw new Error(`Failed to get container stats: ${error}`);
    }
  }

  /**
   * Execute command in container
   */
  static async execInContainer(
    containerId: string,
    command: string[]
  ): Promise<{ exitCode: number; output: string }> {
    try {
      const container = this.docker.getContainer(containerId);
      const exec = await container.exec({
        Cmd: command,
        AttachStdout: true,
        AttachStderr: true,
      });

      const stream = await exec.start({ Detach: false });
      const chunks: Buffer[] = [];

      return new Promise((resolve, reject) => {
        stream.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        stream.on('error', reject);

        stream.on('end', async () => {
          const info = await exec.inspect();
          const output = Buffer.concat(chunks).toString('utf-8');

          resolve({
            exitCode: info.ExitCode || 0,
            output,
          });
        });
      });
    } catch (error) {
      throw new Error(`Failed to exec in container: ${error}`);
    }
  }

  /**
   * Get container count by prefix
   */
  static async getContainerCountByPrefix(prefix: string): Promise<number> {
    try {
      const containers = await this.docker.listContainers({ all: true });
      return containers.filter((c: any) =>
        c.Names.some((n: string) => n.startsWith(`/${prefix}`))
      ).length;
    } catch (error) {
      return 0;
    }
  }

  /**
   * List all OpenClaw containers
   */
  static async listOpenClawContainers(): Promise<Array<{
    id: string;
    name: string;
    state: string;
    status: string;
  }>> {
    try {
      const containers = await this.docker.listContainers({ all: true });

      return containers
        .filter((c: any) => c.Names.some((n: string) => n.startsWith('/opclaw-')))
        .map((c: any) => ({
          id: c.Id,
          name: c.Names[0].substring(1), // Remove leading /
          state: c.State,
          status: c.Status,
        }));
    } catch (error) {
      throw new Error(`Failed to list OpenClaw containers: ${error}`);
    }
  }

  /**
   * Get Docker system info
   */
  static async getSystemInfo(): Promise<{
    containers: number;
    containersRunning: number;
    containersStopped: number;
    images: number;
    version: string;
  }> {
    try {
      const info = await this.docker.info();
      const version = await this.docker.version();

      return {
        containers: info.Containers,
        containersRunning: info.ContainersRunning,
        containersStopped: info.ContainersStopped,
        images: info.Images,
        version: version.Version,
      };
    } catch (error) {
      throw new Error(`Failed to get system info: ${error}`);
    }
  }
}
