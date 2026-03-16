/**
 * Docker Initialization Test
 *
 * Verifies that E2E orchestrator properly initializes Docker connection
 * and resolves the "Docker not initialized" error.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { E2EOrchestrator } from './orchestrator';

describe('Docker Initialization Test', () => {
  let orchestrator: E2EOrchestrator;

  beforeAll(async () => {
    orchestrator = E2EOrchestrator.getInstance();
  });

  afterAll(async () => {
    if (orchestrator) {
      await orchestrator.teardown();
    }
  });

  it('should initialize orchestrator without throwing error', () => {
    // This test verifies that getInstance() doesn't throw
    // The old implementation would throw "Docker not initialized"
    expect(orchestrator).toBeDefined();
    expect(orchestrator).toBeInstanceOf(E2EOrchestrator);
  });

  it('should setup Docker connection successfully', async () => {
    // This test verifies that setup() properly initializes Docker
    await expect(orchestrator.setup({ skipDockerVerification: true })).resolves.toBeDefined();

    // Verify Docker is connected
    const docker = orchestrator.getDocker();
    expect(docker).toBeDefined();

    // Verify we can ping Docker
    await expect(docker.ping()).resolves.toBeUndefined();
  });

  it('should throw error when accessing Docker before setup', async () => {
    const freshOrchestrator = E2EOrchestrator.getInstance();

    // Try to get Docker before setup - should throw
    expect(() => {
      freshOrchestrator.getDocker();
    }).toThrow('Docker not connected');
  });

  it('should allow Docker operations after setup', async () => {
    await orchestrator.setup({ skipDockerVerification: true });

    const docker = orchestrator.getDocker();

    // List containers (should not throw)
    const containers = await docker.listContainers();
    expect(containers).toBeDefined();
    expect(Array.isArray(containers)).toBe(true);

    // Get Docker version (should not throw)
    const version = await docker.version();
    expect(version).toBeDefined();
    expect(version.Version).toBeDefined();
  });

  it('should cleanup and teardown successfully', async () => {
    await orchestrator.setup({ skipDockerVerification: true });

    // Teardown should not throw
    await expect(orchestrator.teardown()).resolves.toBeDefined();

    const report = await orchestrator.teardown();
    expect(report).toBeDefined();
    expect(report.runId).toBeDefined();
    expect(report.summary).toBeDefined();
  });
});
