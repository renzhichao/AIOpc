/**
 * Docker Container Management Service
 *
 * Provides functionality to manage Docker containers for OpenClaw instances.
 * Uses Dockerode to interact with the Docker daemon.
 *
 * Features:
 * - Container lifecycle management (create, start, stop, remove)
 * - Resource limits (0.5 CPU core + 1GB memory)
 * - Network isolation
 * - Volume management
 * - Health checking
 * - Resource monitoring
 */

import { Service } from 'typedi';
import Docker from 'dockerode';
import { AppError } from '../utils/errors/AppError';
import { logger } from '../config/logger';
import {
  ContainerStatus,
  ContainerStats,
  HealthStatus,
  InstanceConfig,
  ResourceLimits,
  VolumeConfig,
  NetworkConfig,
  ContainerCreateOptions,
  LogOptions,
  LogEntry,
} from '../types/docker';

@Service()
export class DockerService {
  private docker: Docker;
  private readonly DEFAULT_IMAGE = 'openclaw:latest';
  private readonly DEFAULT_NETWORK_PREFIX = 'opclaw-network';
  private readonly DEFAULT_VOLUME_PREFIX = 'opclaw-data';
  private readonly DEFAULT_CONTAINER_PREFIX = 'opclaw';

  // Default resource limits: 0.5 CPU core + 1GB memory
  private readonly DEFAULT_RESOURCE_LIMITS: ResourceLimits = {
    memoryLimit: 1 * 1024 * 1024 * 1024, // 1GB
    cpuQuota: 500000, // 0.5 core (500,000 / 1,000,000)
    cpuPeriod: 1000000, // 1 second
    cpuShares: 512, // Relative weight (default: 1024)
  };

  constructor() {
    const socketPath = process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock';
    this.docker = new Docker({ socketPath });
    logger.info(`DockerService initialized with socket: ${socketPath}`);
  }

  /**
   * Create a new container for an OpenClaw instance
   * @param instanceId - Unique instance identifier
   * @param config - Instance configuration
   * @returns Container ID
   */
  async createContainer(
    instanceId: string,
    config: InstanceConfig
  ): Promise<string> {
    const containerName = `${this.DEFAULT_CONTAINER_PREFIX}-${instanceId}`;
    const volumeName = `${this.DEFAULT_VOLUME_PREFIX}-${instanceId}`;
    const networkName = `${this.DEFAULT_NETWORK_PREFIX}-${instanceId}`;

    try {
      logger.info(`Creating container ${containerName} for instance ${instanceId}`);

      // 1. Pull image if not exists
      await this.pullImageIfNeeded(this.DEFAULT_IMAGE);

      // 2. Create network if not exists
      await this.createNetworkIfNeeded(networkName);

      // 3. Create volume if not exists
      await this.createVolumeIfNeeded(volumeName);

      // 4. Create container
      const containerConfig: ContainerCreateOptions = {
        name: containerName,
        image: this.DEFAULT_IMAGE,
        env: {
          INSTANCE_ID: instanceId,
          DEEPSEEK_API_KEY: config.apiKey,
          DEEPSEEK_API_BASE: config.apiBase || 'https://api.deepseek.com',
          DEEPSEEK_MODEL: config.model || 'deepseek-chat',
          FEISHU_APP_ID: config.feishuAppId,
          ENABLED_SKILLS: config.skills.join(','),
          ENABLED_TOOLS: config.tools ? JSON.stringify(config.tools) : '[]',
          SYSTEM_PROMPT: config.systemPrompt || '',
          TEMPERATURE: (config.temperature || 0.7).toString(),
          MAX_TOKENS: (config.maxTokens || 4000).toString(),
          NODE_ENV: 'production',
        },
        resources: this.DEFAULT_RESOURCE_LIMITS,
        volumes: [
          {
            name: volumeName,
            mountPath: '/app/data',
            readOnly: false,
          },
        ],
        network: {
          name: networkName,
          driver: 'bridge',
        },
        restartPolicy: 'unless-stopped',
        readonlyRootfs: false,
      };

      const envArray = Object.entries(containerConfig.env).map(
        ([key, value]) => `${key}=${value}`
      );

      const container = await this.docker.createContainer({
        name: containerConfig.name,
        Image: containerConfig.image,
        Env: envArray,
        HostConfig: {
          Memory: containerConfig.resources.memoryLimit,
          NanoCpus: containerConfig.resources.cpuQuota,
          CpuPeriod: containerConfig.resources.cpuPeriod,
          CpuShares: containerConfig.resources.cpuShares,
          Binds: containerConfig.volumes?.map(
            (v) => `${v.name}:${v.mountPath}${v.readOnly ? ':ro' : ''}`
          ),
          NetworkMode: containerConfig.network?.name,
          RestartPolicy: {
            Name: containerConfig.restartPolicy || 'unless-stopped',
          },
          ReadonlyRootfs: containerConfig.readonlyRootfs || false,
        },
        NetworkingConfig: {
          EndpointsConfig: {
            [containerConfig.network!.name]: {},
          },
        },
      });

      logger.info(`Container ${containerName} created with ID: ${container.id}`);

      // 5. Start the container
      await container.start();
      logger.info(`Container ${containerName} started`);

      return container.id;
    } catch (error) {
      logger.error(`Failed to create container ${containerName}:`, error);
      throw new AppError(
        500,
        'DOCKER_CREATE_FAILED',
        `Failed to create container: ${error instanceof Error ? error instanceof Error ? error.message : String(error) : String(error)}`,
        { instanceId, containerName, error: error instanceof Error ? error instanceof Error ? error.message : String(error) : String(error) }
      );
    }
  }

  /**
   * Start a stopped container
   * @param instanceId - Instance identifier
   */
  async startContainer(instanceId: string): Promise<void> {
    const containerName = `${this.DEFAULT_CONTAINER_PREFIX}-${instanceId}`;

    try {
      logger.info(`Starting container ${containerName}`);
      const container = this.docker.getContainer(containerName);
      await container.start();
      logger.info(`Container ${containerName} started`);
    } catch (error) {
      logger.error(`Failed to start container ${containerName}:`, error);
      throw new AppError(
        500,
        'DOCKER_START_FAILED',
        `Failed to start container: ${error instanceof Error ? error.message : String(error)}`,
        { instanceId, containerName, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Stop a running container
   * @param instanceId - Instance identifier
   * @param timeout - Timeout in seconds (default: 10)
   */
  async stopContainer(instanceId: string, timeout: number = 10): Promise<void> {
    const containerName = `${this.DEFAULT_CONTAINER_PREFIX}-${instanceId}`;

    try {
      logger.info(`Stopping container ${containerName} (timeout: ${timeout}s)`);
      const container = this.docker.getContainer(containerName);
      await container.stop({ t: timeout });
      logger.info(`Container ${containerName} stopped`);
    } catch (error) {
      logger.error(`Failed to stop container ${containerName}:`, error);
      throw new AppError(
        500,
        'DOCKER_STOP_FAILED',
        `Failed to stop container: ${error instanceof Error ? error.message : String(error)}`,
        { instanceId, containerName, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Restart a container
   * @param instanceId - Instance identifier
   * @param timeout - Timeout in seconds (default: 10)
   */
  async restartContainer(instanceId: string, timeout: number = 10): Promise<void> {
    const containerName = `${this.DEFAULT_CONTAINER_PREFIX}-${instanceId}`;

    try {
      logger.info(`Restarting container ${containerName} (timeout: ${timeout}s)`);
      const container = this.docker.getContainer(containerName);
      await container.restart({ t: timeout });
      logger.info(`Container ${containerName} restarted`);
    } catch (error) {
      logger.error(`Failed to restart container ${containerName}:`, error);
      throw new AppError(
        500,
        'DOCKER_RESTART_FAILED',
        `Failed to restart container: ${error instanceof Error ? error.message : String(error)}`,
        { instanceId, containerName, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Remove a container (stop if running, then remove)
   * @param instanceId - Instance identifier
   * @param force - Force removal without stopping
   * @param removeVolumes - Remove associated volumes
   */
  async removeContainer(
    instanceId: string,
    force: boolean = false,
    removeVolumes: boolean = true
  ): Promise<void> {
    const containerName = `${this.DEFAULT_CONTAINER_PREFIX}-${instanceId}`;
    const volumeName = `${this.DEFAULT_VOLUME_PREFIX}-${instanceId}`;
    const networkName = `${this.DEFAULT_NETWORK_PREFIX}-${instanceId}`;

    try {
      logger.info(`Removing container ${containerName} (force: ${force}, removeVolumes: ${removeVolumes})`);

      const container = this.docker.getContainer(containerName);

      // Stop container if running and not force
      if (!force) {
        try {
          const status = await this.getContainerStatus(instanceId);
          if (status.isRunning) {
            await container.stop({ t: 10 });
          }
        } catch (error) {
          logger.warn(`Container ${containerName} may not be running: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // Remove container
      await container.remove({ force, v: removeVolumes });
      logger.info(`Container ${containerName} removed`);

      // Remove volume if requested
      if (removeVolumes) {
        try {
          const volume = this.docker.getVolume(volumeName);
          await volume.remove();
          logger.info(`Volume ${volumeName} removed`);
        } catch (error) {
          logger.warn(`Failed to remove volume ${volumeName}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // Remove network
      try {
        const network = this.docker.getNetwork(networkName);
        await network.remove();
        logger.info(`Network ${networkName} removed`);
      } catch (error) {
        logger.warn(`Failed to remove network ${networkName}: ${error instanceof Error ? error.message : String(error)}`);
      }
    } catch (error) {
      logger.error(`Failed to remove container ${containerName}:`, error);
      throw new AppError(
        500,
        'DOCKER_REMOVE_FAILED',
        `Failed to remove container: ${error instanceof Error ? error.message : String(error)}`,
        { instanceId, containerName, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Get container status
   * @param instanceId - Instance identifier
   * @returns Container status
   */
  async getContainerStatus(instanceId: string): Promise<ContainerStatus> {
    const containerName = `${this.DEFAULT_CONTAINER_PREFIX}-${instanceId}`;

    try {
      const container = this.docker.getContainer(containerName);
      const info = await container.inspect();

      const state = info.State;
      const created = new Date(info.Created);
      const started = state.StartedAt ? new Date(state.StartedAt) : undefined;

      return {
        id: info.Id,
        name: info.Name.replace(/^\//, ''), // Remove leading slash
        state: state.Running
          ? 'running'
          : state.Paused
          ? 'paused'
          : state.Restarting
          ? 'restarting'
          : state.Dead
          ? 'dead'
          : 'exited',
        status: state.Status,
        isRunning: state.Running || false,
        isPaused: state.Paused || false,
        isRestarting: state.Restarting || false,
        created,
        started,
      };
    } catch (error) {
      logger.error(`Failed to get status for container ${containerName}:`, error);
      throw new AppError(
        500,
        'DOCKER_INSPECT_FAILED',
        `Failed to inspect container: ${error instanceof Error ? error.message : String(error)}`,
        { instanceId, containerName, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Get container resource statistics
   * @param instanceId - Instance identifier
   * @returns Container statistics
   */
  async getContainerStats(instanceId: string): Promise<ContainerStats> {
    const containerName = `${this.DEFAULT_CONTAINER_PREFIX}-${instanceId}`;

    try {
      const container = this.docker.getContainer(containerName);
      const stats = await container.stats({ stream: false });

      // Calculate CPU usage percentage
      const cpuDelta =
        stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
      const systemDelta =
        stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
      const cpuPercent =
        systemDelta > 0 ? (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100 : 0;

      // Calculate memory usage
      const memoryUsage = stats.memory_stats.usage || 0;
      const memoryLimit = stats.memory_stats.limit || 0;
      const memoryPercent = memoryLimit > 0 ? (memoryUsage / memoryLimit) * 100 : 0;

      // Get network stats
      const networkRX = stats.networks
        ? Object.values(stats.networks).reduce((acc: number, net: any) => acc + (net.rx_bytes || 0), 0)
        : 0;
      const networkTX = stats.networks
        ? Object.values(stats.networks).reduce((acc: number, net: any) => acc + (net.tx_bytes || 0), 0)
        : 0;

      // Get block I/O stats
      const blockRead = stats.blkio_stats?.io_service_bytes_recursive
        ?.filter((b: any) => b.op === 'Read')
        .reduce((acc: number, b: any) => acc + (b.value || 0), 0);
      const blockWrite = stats.blkio_stats?.io_service_bytes_recursive
        ?.filter((b: any) => b.op === 'Write')
        .reduce((acc: number, b: any) => acc + (b.value || 0), 0);

      return {
        id: stats.id || containerName,
        name: stats.name || containerName,
        cpuPercent: Math.round(cpuPercent * 100) / 100,
        memoryUsage,
        memoryLimit,
        memoryPercent: Math.round(memoryPercent * 100) / 100,
        networkRX,
        networkTX,
        blockRead,
        blockWrite,
        timestamp: new Date(stats.read || Date.now()),
      };
    } catch (error) {
      logger.error(`Failed to get stats for container ${containerName}:`, error);
      throw new AppError(
        500,
        'DOCKER_STATS_FAILED',
        `Failed to get container stats: ${error instanceof Error ? error.message : String(error)}`,
        { instanceId, containerName, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Check container health
   * @param instanceId - Instance identifier
   * @returns Health status
   */
  async healthCheck(instanceId: string): Promise<HealthStatus> {
    const containerName = `${this.DEFAULT_CONTAINER_PREFIX}-${instanceId}`;

    try {
      const container = this.docker.getContainer(containerName);
      const info = await container.inspect();
      const state = info.State;

      // Check if container is running
      if (!state.Running) {
        return {
          status: 'unhealthy',
          reason: `Container is not running (state: ${state.Status})`,
          lastCheck: new Date(),
        };
      }

      // Check if container is restarting
      if (state.Restarting) {
        return {
          status: 'unhealthy',
          reason: 'Container is restarting',
          lastCheck: new Date(),
        };
      }

      // Check if container is paused
      if (state.Paused) {
        return {
          status: 'unhealthy',
          reason: 'Container is paused',
          lastCheck: new Date(),
        };
      }

      // Check if container is dead
      if (state.Dead) {
        return {
          status: 'unhealthy',
          reason: 'Container is dead',
          lastCheck: new Date(),
        };
      }

      // Check if container has OOM killed
      if (state.OOMKilled) {
        return {
          status: 'unhealthy',
          reason: 'Container was OOM killed',
          lastCheck: new Date(),
        };
      }

      // Check container health (if healthcheck is defined)
      if (state.Health !== undefined) {
        if (state.Health.Status !== 'healthy') {
          return {
            status: 'unhealthy',
            reason: `Health check failed: ${state.Health.Status}`,
            lastCheck: new Date(),
          };
        }
      }

      // Get container stats
      const stats = await this.getContainerStats(instanceId);

      // Calculate uptime
      const startedAt = state.StartedAt ? new Date(state.StartedAt) : new Date();
      const uptime = Math.floor((Date.now() - startedAt.getTime()) / 1000);

      return {
        status: 'healthy',
        reason: 'Container is running and healthy',
        cpuUsage: stats.cpuPercent,
        memoryUsage: stats.memoryPercent,
        uptime,
        lastCheck: new Date(),
      };
    } catch (error) {
      logger.error(`Failed to check health for container ${containerName}:`, error);
      return {
        status: 'unknown',
        reason: `Failed to check health: ${error instanceof Error ? error.message : String(error)}`,
        lastCheck: new Date(),
      };
    }
  }

  /**
   * Get container logs
   * @param instanceId - Instance identifier
   * @param options - Log options
   * @returns Array of log entries
   */
  async getLogs(instanceId: string, options: LogOptions = {}): Promise<LogEntry[]> {
    const containerName = `${this.DEFAULT_CONTAINER_PREFIX}-${instanceId}`;

    try {
      const container = this.docker.getContainer(containerName);
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        tail: options.tail || 100,
        follow: false,
        timestamps: options.timestamps !== undefined ? options.timestamps : true,
        since: options.since,
      });

      const logString = logs.toString('utf-8');
      const logLines = logString.split('\n').filter((line: any) => line.trim());

      return logLines.map((line: any) => {
        let message = line;
        let timestamp = new Date();

        if (options.timestamps !== false) {
          const parts = line.split(' ');
          const ts = parts[0];
          const msg = parts.slice(1).join(' ');
          timestamp = new Date(ts);
          message = msg;
        }

        return {
          message,
          timestamp,
          containerId: instanceId,
          containerName,
        };
      });
    } catch (error) {
      logger.error(`Failed to get logs for container ${containerName}:`, error);
      throw new AppError(
        500,
        'DOCKER_LOGS_FAILED',
        `Failed to get container logs: ${error instanceof Error ? error.message : String(error)}`,
        { instanceId, containerName, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * List all OpenClaw containers
   * @returns Array of container statuses
   */
  async listContainers(): Promise<ContainerStatus[]> {
    try {
      const containers = await this.docker.listContainers({ all: true });

      return containers
        .filter((c: any) => c.Names.some((n: any) => n.startsWith(`/${this.DEFAULT_CONTAINER_PREFIX}-`)))
        .map((c: any) => ({
          id: c.Id,
          name: c.Names[0].replace(/^\//, ''),
          state: c.State as any,
          status: c.Status,
          isRunning: c.State === 'running',
          isPaused: c.State === 'paused',
          isRestarting: c.State === 'restarting',
          created: new Date(c.Created * 1000),
        }));
    } catch (error) {
      logger.error('Failed to list containers:', error);
      throw new AppError(
        500,
        'DOCKER_LIST_FAILED',
        `Failed to list containers: ${error instanceof Error ? error.message : String(error)}`,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Pull Docker image if not exists locally
   * @param image - Image name with tag
   */
  private async pullImageIfNeeded(image: string): Promise<void> {
    try {
      const images = await this.docker.listImages();
      const exists = images.some((img: any) =>
        img.RepoTags?.some((tag: any) => tag === image || tag === `${image}:latest`)
      );

      if (exists) {
        logger.info(`Image ${image} already exists locally`);
        return;
      }

      logger.info(`Pulling image ${image}...`);
      await new Promise<void>((resolve, reject) => {
        this.docker.pull(image, (err: Error, stream: NodeJS.ReadableStream) => {
          if (err) {
            reject(err);
            return;
          }

          this.docker.modem.followProgress(stream, (err: any) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
      });

      logger.info(`Image ${image} pulled successfully`);
    } catch (error) {
      logger.error(`Failed to pull image ${image}:`, error);
      throw new AppError(
        500,
        'DOCKER_PULL_FAILED',
        `Failed to pull image: ${error instanceof Error ? error.message : String(error)}`,
        { image, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Create network if not exists
   * @param networkName - Network name
   */
  private async createNetworkIfNeeded(networkName: string): Promise<void> {
    try {
      const networks = await this.docker.listNetworks();
      const exists = networks.some((n: any) => n.Name === networkName);

      if (exists) {
        logger.info(`Network ${networkName} already exists`);
        return;
      }

      logger.info(`Creating network ${networkName}...`);
      await this.docker.createNetwork({
        Name: networkName,
        Driver: 'bridge',
        Internal: false,
      });

      logger.info(`Network ${networkName} created`);
    } catch (error) {
      logger.error(`Failed to create network ${networkName}:`, error);
      throw new AppError(
        500,
        'DOCKER_NETWORK_CREATE_FAILED',
        `Failed to create network: ${error instanceof Error ? error.message : String(error)}`,
        { networkName, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Create volume if not exists
   * @param volumeName - Volume name
   */
  private async createVolumeIfNeeded(volumeName: string): Promise<void> {
    try {
      const volumes = await this.docker.listVolumes();
      const exists = volumes.Volumes?.some((v: any) => v.Name === volumeName);

      if (exists) {
        logger.info(`Volume ${volumeName} already exists`);
        return;
      }

      logger.info(`Creating volume ${volumeName}...`);
      await this.docker.createVolume({
        Name: volumeName,
        Driver: 'local',
      });

      logger.info(`Volume ${volumeName} created`);
    } catch (error) {
      logger.error(`Failed to create volume ${volumeName}:`, error);
      throw new AppError(
        500,
        'DOCKER_VOLUME_CREATE_FAILED',
        `Failed to create volume: ${error instanceof Error ? error.message : String(error)}`,
        { volumeName, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Get Docker system information
   *
   * @returns System information
   */
  async getSystemInfo(): Promise<{
    server_version: string;
    containers: number;
    containers_running: number;
  }> {
    try {
      const version = await this.docker.version();
      const info = await this.docker.info();

      return {
        server_version: version.Version || 'unknown',
        containers: info.Containers || 0,
        containers_running: info.ContainersRunning || 0
      };
    } catch (error) {
      logger.error('Failed to get Docker system info:', error);

      return {
        server_version: 'unknown',
        containers: 0,
        containers_running: 0
      };
    }
  }
}
