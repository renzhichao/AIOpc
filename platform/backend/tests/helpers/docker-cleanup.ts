/**
 * Docker Cleanup Helper
 *
 * Provides utility functions to clean up Docker artifacts (containers, networks, volumes)
 * created during testing. Prevents resource exhaustion and conflicts.
 */

import Docker from 'dockerode';

const docker = new Docker({ socketPath: process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock' });

/**
 * Remove all test containers
 *
 * @param testName - Optional test name filter (e.g., 'integration-test', 'test-list')
 * @returns Promise resolving when cleanup is complete
 */
export async function removeTestContainers(testName?: string): Promise<void> {
  try {
    const containers = await docker.listContainers({ all: true });

    for (const container of containers) {
      // Check if container is a test container
      const isTestContainer = container.Names.some((name: string) => {
        const cleanName = name.replace(/^\//, ''); // Remove leading slash
        return (
          cleanName.includes('test') ||
          cleanName.includes('integration') ||
          cleanName.includes('preset') ||
          (testName && cleanName.includes(testName))
        );
      });

      if (isTestContainer) {
        try {
          const containerObj = docker.getContainer(container.Id);
          await containerObj.remove({ force: true, v: true });
          console.log(`✓ Removed test container: ${container.Names[0]}`);
        } catch (error) {
          console.warn(`Failed to remove container ${container.Id}:`, error);
        }
      }
    }
  } catch (error) {
    console.error('Failed to list containers for cleanup:', error);
  }
}

/**
 * Remove all test networks
 *
 * @param testName - Optional test name filter (e.g., 'integration-test', 'test-list')
 * @returns Promise resolving when cleanup is complete
 */
export async function removeTestNetworks(testName?: string): Promise<void> {
  try {
    const networks = await docker.listNetworks();

    for (const network of networks) {
      // Skip built-in networks
      if (['bridge', 'host', 'none'].includes(network.Name)) {
        continue;
      }

      // Check if network is a test network
      const isTestNetwork =
        network.Name.includes('test') ||
        network.Name.includes('integration') ||
        network.Name.includes('preset') ||
        (testName && network.Name.includes(testName));

      if (isTestNetwork) {
        try {
          const networkObj = docker.getNetwork(network.Id);
          await networkObj.remove();
          console.log(`✓ Removed test network: ${network.Name}`);
        } catch (error: any) {
          // Ignore errors if network is still in use
          if (!error.message?.includes('network')) {
            console.warn(`Failed to remove network ${network.Name}:`, error);
          }
        }
      }
    }
  } catch (error) {
    console.error('Failed to list networks for cleanup:', error);
  }
}

/**
 * Remove all test volumes
 *
 * @param testName - Optional test name filter
 * @returns Promise resolving when cleanup is complete
 */
export async function removeTestVolumes(testName?: string): Promise<void> {
  try {
    const volumes = await docker.listVolumes();

    if (volumes.Volumes) {
      for (const volume of volumes.Volumes) {
        // Check if volume is a test volume
        const isTestVolume =
          volume.Name.includes('test') ||
          volume.Name.includes('integration') ||
          volume.Name.includes('preset') ||
          (testName && volume.Name.includes(testName));

        if (isTestVolume) {
          try {
            const volumeObj = docker.getVolume(volume.Name);
            await volumeObj.remove();
            console.log(`✓ Removed test volume: ${volume.Name}`);
          } catch (error) {
            console.warn(`Failed to remove volume ${volume.Name}:`, error);
          }
        }
      }
    }
  } catch (error) {
    console.error('Failed to list volumes for cleanup:', error);
  }
}

/**
 * Remove all test Docker artifacts (containers, networks, volumes)
 *
 * This is the main cleanup function to call in test afterEach/beforeAll hooks.
 *
 * @param testName - Optional test name filter
 * @returns Promise resolving when all cleanup is complete
 */
export async function cleanupDockerArtifacts(testName?: string): Promise<void> {
  console.log('🧹 Cleaning up Docker test artifacts...');

  // Remove containers first (they may depend on networks/volumes)
  await removeTestContainers(testName);

  // Then remove networks
  await removeTestNetworks(testName);

  // Finally remove volumes
  await removeTestVolumes(testName);

  console.log('✅ Docker cleanup complete');
}

/**
 * Prune all unused Docker resources
 *
 * More aggressive cleanup that removes all unused resources, not just test ones.
 * Use with caution in test suites.
 *
 * @returns Promise resolving when prune is complete
 */
export async function pruneAllResources(): Promise<void> {
  console.log('🧹 Pruning all unused Docker resources...');

  try {
    // Prune containers
    await docker.pruneContainers();
    console.log('✓ Pruned containers');

    // Prune networks
    await docker.pruneNetworks();
    console.log('✓ Pruned networks');

    // Prune volumes
    await docker.pruneVolumes();
    console.log('✓ Pruned volumes');

    // Prune images (optional - can be slow)
    // await docker.pruneImages();
    // console.log('✓ Pruned images');

    console.log('✅ Docker prune complete');
  } catch (error) {
    console.error('Failed to prune Docker resources:', error);
  }
}

/**
 * Check if there are any orphaned test resources
 *
 * @returns Object with counts of orphaned resources
 */
export async function checkOrphanedResources(): Promise<{
  containers: number;
  networks: number;
  volumes: number;
}> {
  let containers = 0;
  let networks = 0;
  let volumes = 0;

  try {
    const containerList = await docker.listContainers({ all: true });
    containers = containerList.filter((c: any) =>
      c.Names.some((n: string) => n.includes('test') || n.includes('integration'))
    ).length;
  } catch (error) {
    console.error('Failed to check containers:', error);
  }

  try {
    const networkList = await docker.listNetworks();
    networks = networkList.filter(
      (n: any) =>
        !['bridge', 'host', 'none'].includes(n.Name) &&
        (n.Name.includes('test') || n.Name.includes('integration'))
    ).length;
  } catch (error) {
    console.error('Failed to check networks:', error);
  }

  try {
    const volumeList = await docker.listVolumes();
    volumes =
      volumeList.Volumes?.filter(
        (v: any) => v.Name.includes('test') || v.Name.includes('integration')
      ).length || 0;
  } catch (error) {
    console.error('Failed to check volumes:', error);
  }

  return { containers, networks, volumes };
}
