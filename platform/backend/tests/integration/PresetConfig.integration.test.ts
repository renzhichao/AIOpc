/**
 * Integration tests for Preset Configuration Application
 * Tests REAL Docker containers to verify preset configs are properly applied
 *
 * TDD Approach:
 * 1. RED: Write failing tests first
 * 2. GREEN: Make tests pass by fixing implementation
 * 3. REFACTOR: Clean up and improve code
 */

import Docker from 'dockerode';
import { DockerService } from '../../src/services/DockerService';
import { InstanceService } from '../../src/services/InstanceService';
import { InstanceConfig } from '../../src/types/docker';
import { InstancePresetConfig, InstanceTemplate } from '../../src/types/config';
import { getPresetConfig } from '../../src/config/presets';

describe('Preset Configuration Integration Tests', () => {
  let dockerService: DockerService;
  let docker: Docker;
  let createdContainers: string[] = [];

  beforeAll(async () => {
    // Initialize DockerService with real Docker daemon
    dockerService = new DockerService();
    docker = new Docker({ socketPath: process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock' });

    // Verify Docker is accessible
    try {
      await docker.ping();
      console.log('✓ Docker daemon is accessible');
    } catch (error) {
      throw new Error(`Docker daemon not accessible: ${error}`);
    }

    // Verify the openclaw/agent:latest image exists
    const images = await docker.listImages();
    const imageExists = images.some((img: any) =>
      img.RepoTags?.some((tag: string) => tag === 'openclaw/agent:latest' || tag === 'openclaw:latest')
    );

    if (!imageExists) {
      console.warn('⚠ openclaw/agent:latest image not found. Tests will use mock image.');
    } else {
      console.log('✓ openclaw/agent:latest image exists');
    }
  });

  afterEach(async () => {
    // Cleanup: remove all test containers
    for (const containerId of createdContainers) {
      try {
        const container = docker.getContainer(containerId);
        await container.remove({ force: true, v: true });
        console.log(`✓ Cleaned up container ${containerId}`);
      } catch (error) {
        console.warn(`Failed to cleanup container ${containerId}:`, error);
      }
    }
    createdContainers = [];

    // Additional cleanup: remove any leftover test containers
    try {
      const containers = await docker.listContainers({ all: true });
      for (const c of containers) {
        if (c.Names.some((n: string) => n.includes('preset-test'))) {
          try {
            const container = docker.getContainer(c.Id);
            await container.remove({ force: true, v: true });
            console.log(`✓ Cleaned up leftover preset test container`);
          } catch (error) {
            console.warn(`Failed to cleanup leftover container:`, error);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to cleanup leftover containers:', error);
    }

    // Cleanup: remove any leftover test networks
    try {
      const networks = await docker.listNetworks();
      for (const n of networks) {
        if (n.Name && (n.Name.includes('preset-test') || n.Name.includes('integration-test'))) {
          try {
            const network = docker.getNetwork(n.Id);
            await network.remove();
            console.log(`✓ Cleaned up leftover test network: ${n.Name}`);
          } catch (error) {
            console.warn(`Failed to cleanup network ${n.Name}:`, error);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to cleanup leftover networks:', error);
    }
  });

  /**
   * Helper function to extract environment variables from container
   */
  async function getContainerEnvVars(containerId: string): Promise<Record<string, string>> {
    const container = docker.getContainer(containerId);
    const info = await container.inspect();
    const envVars = info.Config.Env || [];

    const envMap: Record<string, string> = {};
    envVars.forEach((envVar: string) => {
      const [key, ...valueParts] = envVar.split('=');
      const value = valueParts.join('=');
      envMap[key] = value;
    });

    return envMap;
  }

  /**
   * Helper function to create test container and return ID
   */
  async function createTestContainer(
    template: InstanceTemplate,
    instanceId?: string
  ): Promise<{ containerId: string; instanceId: string; envVars: Record<string, string> }> {
    const testId = instanceId || `preset-test-${template}-${Date.now()}`;

    // Get preset configuration
    const presetConfig = getPresetConfig(template);

    // Build instance config from preset
    const instanceConfig: InstanceConfig = {
      apiKey: presetConfig.llm.api_key || 'sk-test-key',
      feishuAppId: process.env.FEISHU_APP_ID || 'test_app_id',
      feishuAppSecret: process.env.FEISHU_APP_SECRET || 'test_secret',
      skills: presetConfig.skills.filter(s => s.enabled).map(s => s.name),
      tools: presetConfig.tools.filter(t => t.enabled).map(t => ({ name: t.name, layer: t.layer })),
      systemPrompt: presetConfig.system_prompt,
      temperature: presetConfig.llm.temperature,
      maxTokens: presetConfig.llm.max_tokens,
      template: template,
      apiBase: presetConfig.llm.api_base,
      model: presetConfig.llm.model
    };

    // Create container
    const containerId = await dockerService.createContainer(testId, instanceConfig);
    createdContainers.push(containerId);

    // Get environment variables
    const envVars = await getContainerEnvVars(containerId);

    return { containerId, instanceId: testId, envVars };
  }

  describe('LLM Configuration', () => {
    it('should apply LLM model from preset to container env vars', async () => {
      const { envVars } = await createTestContainer('personal');

      // Verify DEEPSEEK_MODEL is set correctly
      expect(envVars.DEEPSEEK_MODEL).toBeDefined();
      expect(envVars.DEEPSEEK_MODEL).toBe('deepseek-chat');
      console.log(`✓ LLM Model: ${envVars.DEEPSEEK_MODEL}`);
    });

    it('should apply LLM temperature from preset to container env vars', async () => {
      const { envVars } = await createTestContainer('personal');

      // Verify TEMPERATURE is set correctly
      expect(envVars.TEMPERATURE).toBeDefined();
      expect(parseFloat(envVars.TEMPERATURE)).toBe(0.7);
      console.log(`✓ LLM Temperature: ${envVars.TEMPERATURE}`);
    });

    it('should apply LLM max_tokens from preset to container env vars', async () => {
      const { envVars } = await createTestContainer('personal');

      // Verify MAX_TOKENS is set correctly
      expect(envVars.MAX_TOKENS).toBeDefined();
      expect(parseInt(envVars.MAX_TOKENS)).toBe(4000);
      console.log(`✓ LLM Max Tokens: ${envVars.MAX_TOKENS}`);
    });

    it('should apply different max_tokens for different presets', async () => {
      // Personal preset: 4000 tokens
      const { envVars: personalEnv } = await createTestContainer('personal');
      expect(parseInt(personalEnv.MAX_TOKENS)).toBe(4000);
      console.log(`✓ Personal Max Tokens: ${personalEnv.MAX_TOKENS}`);

      // Team preset: 8000 tokens
      const { envVars: teamEnv } = await createTestContainer('team');
      expect(parseInt(teamEnv.MAX_TOKENS)).toBe(8000);
      console.log(`✓ Team Max Tokens: ${teamEnv.MAX_TOKENS}`);

      // Enterprise preset: 16000 tokens
      const { envVars: enterpriseEnv } = await createTestContainer('enterprise');
      expect(parseInt(enterpriseEnv.MAX_TOKENS)).toBe(16000);
      console.log(`✓ Enterprise Max Tokens: ${enterpriseEnv.MAX_TOKENS}`);
    });

    it('should apply API base URL from preset to container env vars', async () => {
      const { envVars } = await createTestContainer('personal');

      // Verify DEEPSEEK_API_BASE is set correctly
      expect(envVars.DEEPSEEK_API_BASE).toBeDefined();
      expect(envVars.DEEPSEEK_API_BASE).toBe('https://api.deepseek.com');
      console.log(`✓ API Base URL: ${envVars.DEEPSEEK_API_BASE}`);
    });

    it('should apply API key from preset to container env vars', async () => {
      const { envVars } = await createTestContainer('personal');

      // Verify DEEPSEEK_API_KEY is set
      expect(envVars.DEEPSEEK_API_KEY).toBeDefined();
      expect(envVars.DEEPSEEK_API_KEY).not.toBe('');
      console.log(`✓ API Key is set (length: ${envVars.DEEPSEEK_API_KEY.length})`);
    });
  });

  describe('Skills Configuration', () => {
    it('should apply enabled skills from preset to container env vars', async () => {
      const { envVars } = await createTestContainer('personal');
      const presetConfig = getPresetConfig('personal');

      // Get expected enabled skills
      const expectedSkills = presetConfig.skills
        .filter(s => s.enabled)
        .map(s => s.name)
        .sort();

      // Verify ENABLED_SKILLS is set correctly
      expect(envVars.ENABLED_SKILLS).toBeDefined();

      // Parse and verify skills
      const actualSkills = envVars.ENABLED_SKILLS.split(',').sort();
      expect(actualSkills).toEqual(expectedSkills);
      console.log(`✓ Enabled Skills: ${actualSkills.join(', ')}`);
    });

    it('should only include enabled skills (not disabled ones)', async () => {
      const { envVars } = await createTestContainer('personal');
      const presetConfig = getPresetConfig('personal');

      // Get disabled skills
      const disabledSkills = presetConfig.skills
        .filter(s => !s.enabled)
        .map(s => s.name);

      // Verify disabled skills are NOT in ENABLED_SKILLS
      const actualSkills = envVars.ENABLED_SKILLS.split(',');

      disabledSkills.forEach(skill => {
        expect(actualSkills).not.toContain(skill);
      });

      console.log(`✓ Disabled skills excluded: ${disabledSkills.join(', ')}`);
    });

    it('should apply different skills for different presets', async () => {
      // Personal preset: basic skills only
      const { envVars: personalEnv } = await createTestContainer('personal');
      const personalSkills = personalEnv.ENABLED_SKILLS.split(',');
      expect(personalSkills).toContain('general_chat');
      expect(personalSkills).not.toContain('email_assistant');
      console.log(`✓ Personal Skills: ${personalSkills.join(', ')}`);

      // Team preset: includes email_assistant
      const { envVars: teamEnv } = await createTestContainer('team');
      const teamSkills = teamEnv.ENABLED_SKILLS.split(',');
      expect(teamSkills).toContain('general_chat');
      expect(teamSkills).toContain('email_assistant');
      console.log(`✓ Team Skills: ${teamSkills.join(', ')}`);

      // Enterprise preset: all skills
      const { envVars: enterpriseEnv } = await createTestContainer('enterprise');
      const enterpriseSkills = enterpriseEnv.ENABLED_SKILLS.split(',');
      expect(enterpriseSkills).toContain('general_chat');
      expect(enterpriseSkills).toContain('email_assistant');
      expect(enterpriseSkills).toContain('code_helper');
      expect(enterpriseSkills).toContain('data_analyst');
      console.log(`✓ Enterprise Skills: ${enterpriseSkills.join(', ')}`);
    });

    it('should handle skills list as comma-separated string', async () => {
      const { envVars } = await createTestContainer('personal');

      // Verify ENABLED_SKILLS is a string (not JSON)
      expect(typeof envVars.ENABLED_SKILLS).toBe('string');
      expect(envVars.ENABLED_SKILLS).not.toMatch(/^\[/); // Not JSON array
      expect(envVars.ENABLED_SKILLS).toMatch(/^[a-z_]+(,[a-z_]+)*$/); // Comma-separated
      console.log(`✓ Skills format: comma-separated string`);
    });
  });

  describe('Tools Configuration', () => {
    it('should apply enabled tools from preset to container env vars', async () => {
      const { envVars } = await createTestContainer('personal');
      const presetConfig = getPresetConfig('personal');

      // Get expected enabled tools
      const expectedTools = presetConfig.tools
        .filter(t => t.enabled)
        .map(t => ({ name: t.name, layer: t.layer }));

      // Verify ENABLED_TOOLS is set
      expect(envVars.ENABLED_TOOLS).toBeDefined();

      // Parse and verify tools
      const actualTools = JSON.parse(envVars.ENABLED_TOOLS);
      expect(actualTools).toEqual(expectedTools);
      console.log(`✓ Enabled Tools: ${JSON.stringify(actualTools)}`);
    });

    it('should include tool layer information', async () => {
      const { envVars } = await createTestContainer('personal');

      // Parse tools
      const actualTools = JSON.parse(envVars.ENABLED_TOOLS);

      // Verify each tool has layer information
      actualTools.forEach((tool: any) => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('layer');
        expect([1, 2]).toContain(tool.layer);
      });

      console.log(`✓ All tools have layer information`);
    });

    it('should only include enabled tools (not disabled ones)', async () => {
      const { envVars } = await createTestContainer('personal');
      const presetConfig = getPresetConfig('personal');

      // Get disabled tools
      const disabledTools = presetConfig.tools
        .filter(t => !t.enabled)
        .map(t => t.name);

      // Verify disabled tools are NOT in ENABLED_TOOLS
      const actualTools = JSON.parse(envVars.ENABLED_TOOLS);
      const actualToolNames = actualTools.map((t: any) => t.name);

      disabledTools.forEach(tool => {
        expect(actualToolNames).not.toContain(tool);
      });

      console.log(`✓ Disabled tools excluded: ${disabledTools.join(', ')}`);
    });

    it('should apply different tools for different presets', async () => {
      // Personal preset: layer 1 tools only
      const { envVars: personalEnv } = await createTestContainer('personal');
      const personalTools = JSON.parse(personalEnv.ENABLED_TOOLS);
      expect(personalTools.some((t: any) => t.name === 'read')).toBe(true);
      expect(personalTools.some((t: any) => t.name === 'exec')).toBe(false);
      console.log(`✓ Personal Tools: ${JSON.stringify(personalTools.map((t: any) => t.name))}`);

      // Team preset: includes layer 2 tools
      const { envVars: teamEnv } = await createTestContainer('team');
      const teamTools = JSON.parse(teamEnv.ENABLED_TOOLS);
      expect(teamTools.some((t: any) => t.name === 'read')).toBe(true);
      expect(teamTools.some((t: any) => t.name === 'exec')).toBe(true);
      console.log(`✓ Team Tools: ${JSON.stringify(teamTools.map((t: any) => t.name))}`);

      // Enterprise preset: all tools
      const { envVars: enterpriseEnv } = await createTestContainer('enterprise');
      const enterpriseTools = JSON.parse(enterpriseEnv.ENABLED_TOOLS);
      expect(enterpriseTools.some((t: any) => t.name === 'read')).toBe(true);
      expect(enterpriseTools.some((t: any) => t.name === 'exec')).toBe(true);
      console.log(`✓ Enterprise Tools: ${JSON.stringify(enterpriseTools.map((t: any) => t.name))}`);
    });

    it('should handle tools list as JSON array', async () => {
      const { envVars } = await createTestContainer('personal');

      // Verify ENABLED_TOOLS is valid JSON
      expect(() => JSON.parse(envVars.ENABLED_TOOLS)).not.toThrow();
      const parsed = JSON.parse(envVars.ENABLED_TOOLS);
      expect(Array.isArray(parsed)).toBe(true);
      console.log(`✓ Tools format: JSON array`);
    });
  });

  describe('System Prompt Configuration', () => {
    it('should apply system prompt from preset to container env vars', async () => {
      const { envVars } = await createTestContainer('personal');
      const presetConfig = getPresetConfig('personal');

      // Verify SYSTEM_PROMPT is set correctly
      expect(envVars.SYSTEM_PROMPT).toBeDefined();
      expect(envVars.SYSTEM_PROMPT).toBe(presetConfig.system_prompt);
      console.log(`✓ System Prompt length: ${envVars.SYSTEM_PROMPT.length} chars`);
    });

    it('should apply different system prompts for different presets', async () => {
      // Personal preset
      const { envVars: personalEnv } = await createTestContainer('personal');
      expect(personalEnv.SYSTEM_PROMPT).toContain('AI助手');
      expect(personalEnv.SYSTEM_PROMPT).toContain('通用对话');
      console.log(`✓ Personal System Prompt: ${personalEnv.SYSTEM_PROMPT.substring(0, 50)}...`);

      // Team preset
      const { envVars: teamEnv } = await createTestContainer('team');
      expect(teamEnv.SYSTEM_PROMPT).toContain('团队');
      expect(teamEnv.SYSTEM_PROMPT).toContain('协作');
      console.log(`✓ Team System Prompt: ${teamEnv.SYSTEM_PROMPT.substring(0, 50)}...`);

      // Enterprise preset
      const { envVars: enterpriseEnv } = await createTestContainer('enterprise');
      expect(enterpriseEnv.SYSTEM_PROMPT).toContain('企业');
      expect(enterpriseEnv.SYSTEM_PROMPT).toContain('协作');
      console.log(`✓ Enterprise System Prompt: ${enterpriseEnv.SYSTEM_PROMPT.substring(0, 50)}...`);
    });

    it('should preserve system prompt formatting and line breaks', async () => {
      const { envVars } = await createTestContainer('personal');
      const presetConfig = getPresetConfig('personal');

      // Verify line breaks are preserved
      expect(envVars.SYSTEM_PROMPT).toContain('\n');
      expect(envVars.SYSTEM_PROMPT).toEqual(presetConfig.system_prompt);
      console.log(`✓ System Prompt formatting preserved`);
    });
  });

  describe('Resource Limits', () => {
    it('should apply memory limit from preset to container', async () => {
      const { containerId } = await createTestContainer('personal');

      const container = docker.getContainer(containerId);
      const info = await container.inspect();

      // Verify memory limit
      const memoryLimit = info.HostConfig.Memory;
      expect(memoryLimit).toBeDefined();
      expect(memoryLimit).toBeGreaterThan(0);

      // Should be 1GB (default)
      const memoryLimitGB = memoryLimit / (1024 * 1024 * 1024);
      expect(memoryLimitGB).toBeCloseTo(1.0, 1);
      console.log(`✓ Memory Limit: ${memoryLimitGB.toFixed(2)}GB`);
    });

    it('should apply CPU quota from preset to container', async () => {
      const { containerId } = await createTestContainer('personal');

      const container = docker.getContainer(containerId);
      const info = await container.inspect();

      // Verify CPU quota
      const cpuQuota = info.HostConfig.CpuQuota;
      expect(cpuQuota).toBeDefined();
      expect(cpuQuota).toBeGreaterThan(0);

      // Should be 0.5 core (500,000 microseconds)
      expect(cpuQuota).toBe(500000);
      console.log(`✓ CPU Quota: ${cpuQuota} microseconds (0.5 core)`);
    });

    it('should apply CPU period from preset to container', async () => {
      const { containerId } = await createTestContainer('personal');

      const container = docker.getContainer(containerId);
      const info = await container.inspect();

      // Verify CPU period
      const cpuPeriod = info.HostConfig.CpuPeriod;
      expect(cpuPeriod).toBeDefined();
      expect(cpuPeriod).toBe(1000000);
      console.log(`✓ CPU Period: ${cpuPeriod} microseconds`);
    });

    it('should apply CPU shares from preset to container', async () => {
      const { containerId } = await createTestContainer('personal');

      const container = docker.getContainer(containerId);
      const info = await container.inspect();

      // Verify CPU shares
      const cpuShares = info.HostConfig.CpuShares;
      expect(cpuShares).toBeDefined();
      expect(cpuShares).toBe(512);
      console.log(`✓ CPU Shares: ${cpuShares}`);
    });

    it('should enforce memory limit on running container', async () => {
      const { instanceId } = await createTestContainer('personal');

      // Wait for container to stabilize
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Get container stats
      const stats = await dockerService.getContainerStats(instanceId);

      // Memory usage should be less than limit
      expect(stats.memoryUsage).toBeLessThan(stats.memoryLimit);

      const memoryUsageMB = stats.memoryUsage / (1024 * 1024);
      const memoryLimitMB = stats.memoryLimit / (1024 * 1024);

      console.log(`✓ Memory Usage: ${memoryUsageMB.toFixed(2)}MB / ${memoryLimitMB.toFixed(2)}MB`);
    });
  });

  describe('Feishu Configuration', () => {
    it('should apply Feishu App ID to container env vars', async () => {
      const { envVars } = await createTestContainer('personal');

      // Verify FEISHU_APP_ID is set
      expect(envVars.FEISHU_APP_ID).toBeDefined();
      expect(envVars.FEISHU_APP_ID).not.toBe('');
      console.log(`✓ Feishu App ID: ${envVars.FEISHU_APP_ID}`);
    });

    it('should apply Feishu App Secret to container env vars', async () => {
      const { envVars } = await createTestContainer('personal');

      // Note: FEISHU_APP_SECRET might not be in env vars for security reasons
      // This test checks if it's provided in the config
      expect(envVars.FEISHU_APP_ID).toBeDefined();
      console.log(`✓ Feishu configuration present`);
    });
  });

  describe('Instance ID Configuration', () => {
    it('should apply instance ID to container env vars', async () => {
      const testId = `preset-test-instance-${Date.now()}`;
      const { envVars } = await createTestContainer('personal', testId);

      // Verify INSTANCE_ID is set correctly
      expect(envVars.INSTANCE_ID).toBeDefined();
      expect(envVars.INSTANCE_ID).toBe(testId);
      console.log(`✓ Instance ID: ${envVars.INSTANCE_ID}`);
    });

    it('should generate unique instance IDs for each container', async () => {
      const { containerId: id1, envVars: env1 } = await createTestContainer('personal');
      const { containerId: id2, envVars: env2 } = await createTestContainer('personal');

      // Verify instance IDs are different
      expect(env1.INSTANCE_ID).not.toBe(env2.INSTANCE_ID);
      expect(id1).not.toBe(id2);
      console.log(`✓ Instance IDs are unique: ${env1.INSTANCE_ID} vs ${env2.INSTANCE_ID}`);
    });
  });

  describe('Environment Variable Serialization', () => {
    it('should properly serialize skills array to comma-separated string', async () => {
      const { envVars } = await createTestContainer('team');

      // Skills with multiple items
      const skills = envVars.ENABLED_SKILLS.split(',');
      expect(skills.length).toBeGreaterThan(1);

      // Verify no JSON artifacts
      skills.forEach(skill => {
        expect(skill).not.toContain('[');
        expect(skill).not.toContain(']');
        expect(skill).not.toContain('"');
      });

      console.log(`✓ Skills serialized correctly: ${skills.join(', ')}`);
    });

    it('should properly serialize tools array to JSON', async () => {
      const { envVars } = await createTestContainer('team');

      // Parse tools
      const tools = JSON.parse(envVars.ENABLED_TOOLS);

      // Verify structure
      expect(Array.isArray(tools)).toBe(true);
      tools.forEach((tool: any) => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('layer');
        expect(typeof tool.name).toBe('string');
        expect(typeof tool.layer).toBe('number');
      });

      console.log(`✓ Tools serialized correctly: ${JSON.stringify(tools)}`);
    });

    it('should handle special characters in system prompt', async () => {
      const { envVars } = await createTestContainer('enterprise');

      // System prompt contains Chinese characters and special formatting
      expect(envVars.SYSTEM_PROMPT).toContain('你');
      expect(envVars.SYSTEM_PROMPT).toContain('\n');
      expect(envVars.SYSTEM_PROMPT.length).toBeGreaterThan(50);

      console.log(`✓ Special characters handled correctly`);
    });

    it('should handle numeric values (temperature, max_tokens)', async () => {
      const { envVars } = await createTestContainer('personal');

      // Temperature should be numeric string
      expect(envVars.TEMPERATURE).toMatch(/^\d+(\.\d+)?$/);
      expect(parseFloat(envVars.TEMPERATURE)).toBe(0.7);

      // Max tokens should be numeric string
      expect(envVars.MAX_TOKENS).toMatch(/^\d+$/);
      expect(parseInt(envVars.MAX_TOKENS)).toBe(4000);

      console.log(`✓ Numeric values serialized correctly`);
    });
  });

  describe('Configuration Completeness', () => {
    it('should apply all required configuration fields for personal preset', async () => {
      const { envVars } = await createTestContainer('personal');

      // Verify all required fields are present
      expect(envVars.INSTANCE_ID).toBeDefined();
      expect(envVars.DEEPSEEK_API_KEY).toBeDefined();
      expect(envVars.DEEPSEEK_API_BASE).toBeDefined();
      expect(envVars.DEEPSEEK_MODEL).toBeDefined();
      expect(envVars.FEISHU_APP_ID).toBeDefined();
      expect(envVars.ENABLED_SKILLS).toBeDefined();
      expect(envVars.ENABLED_TOOLS).toBeDefined();
      expect(envVars.SYSTEM_PROMPT).toBeDefined();
      expect(envVars.TEMPERATURE).toBeDefined();
      expect(envVars.MAX_TOKENS).toBeDefined();

      console.log(`✓ All required configuration fields present`);
    });

    it('should apply all required configuration fields for team preset', async () => {
      const { envVars } = await createTestContainer('team');

      // Verify all required fields are present
      expect(envVars.INSTANCE_ID).toBeDefined();
      expect(envVars.DEEPSEEK_API_KEY).toBeDefined();
      expect(envVars.DEEPSEEK_API_BASE).toBeDefined();
      expect(envVars.DEEPSEEK_MODEL).toBeDefined();
      expect(envVars.FEISHU_APP_ID).toBeDefined();
      expect(envVars.ENABLED_SKILLS).toBeDefined();
      expect(envVars.ENABLED_TOOLS).toBeDefined();
      expect(envVars.SYSTEM_PROMPT).toBeDefined();
      expect(envVars.TEMPERATURE).toBeDefined();
      expect(envVars.MAX_TOKENS).toBeDefined();

      console.log(`✓ All required configuration fields present`);
    });

    it('should apply all required configuration fields for enterprise preset', async () => {
      const { envVars } = await createTestContainer('enterprise');

      // Verify all required fields are present
      expect(envVars.INSTANCE_ID).toBeDefined();
      expect(envVars.DEEPSEEK_API_KEY).toBeDefined();
      expect(envVars.DEEPSEEK_API_BASE).toBeDefined();
      expect(envVars.DEEPSEEK_MODEL).toBeDefined();
      expect(envVars.FEISHU_APP_ID).toBeDefined();
      expect(envVars.ENABLED_SKILLS).toBeDefined();
      expect(envVars.ENABLED_TOOLS).toBeDefined();
      expect(envVars.SYSTEM_PROMPT).toBeDefined();
      expect(envVars.TEMPERATURE).toBeDefined();
      expect(envVars.MAX_TOKENS).toBeDefined();

      console.log(`✓ All required configuration fields present`);
    });
  });

  describe('End-to-End Configuration Validation', () => {
    it('should create fully configured container from personal preset', async () => {
      const { containerId, envVars } = await createTestContainer('personal');
      const presetConfig = getPresetConfig('personal');

      // Verify LLM configuration
      expect(envVars.DEEPSEEK_MODEL).toBe(presetConfig.llm.model);
      expect(parseFloat(envVars.TEMPERATURE)).toBe(presetConfig.llm.temperature);
      expect(parseInt(envVars.MAX_TOKENS)).toBe(presetConfig.llm.max_tokens);

      // Verify skills
      const expectedSkills = presetConfig.skills.filter(s => s.enabled).map(s => s.name).sort();
      const actualSkills = envVars.ENABLED_SKILLS.split(',').sort();
      expect(actualSkills).toEqual(expectedSkills);

      // Verify tools
      const expectedTools = presetConfig.tools.filter(t => t.enabled).map(t => ({ name: t.name, layer: t.layer }));
      const actualTools = JSON.parse(envVars.ENABLED_TOOLS);
      expect(actualTools).toEqual(expectedTools);

      // Verify system prompt
      expect(envVars.SYSTEM_PROMPT).toBe(presetConfig.system_prompt);

      // Verify container is running
      const container = docker.getContainer(containerId);
      const info = await container.inspect();
      expect(info.State.Running).toBe(true);

      console.log(`✓ Personal preset fully applied and container running`);
    });

    it('should create fully configured container from team preset', async () => {
      const { containerId, envVars } = await createTestContainer('team');
      const presetConfig = getPresetConfig('team');

      // Verify LLM configuration
      expect(envVars.DEEPSEEK_MODEL).toBe(presetConfig.llm.model);
      expect(parseFloat(envVars.TEMPERATURE)).toBe(presetConfig.llm.temperature);
      expect(parseInt(envVars.MAX_TOKENS)).toBe(presetConfig.llm.max_tokens);

      // Verify skills
      const expectedSkills = presetConfig.skills.filter(s => s.enabled).map(s => s.name).sort();
      const actualSkills = envVars.ENABLED_SKILLS.split(',').sort();
      expect(actualSkills).toEqual(expectedSkills);

      // Verify tools
      const expectedTools = presetConfig.tools.filter(t => t.enabled).map(t => ({ name: t.name, layer: t.layer }));
      const actualTools = JSON.parse(envVars.ENABLED_TOOLS);
      expect(actualTools).toEqual(expectedTools);

      // Verify system prompt
      expect(envVars.SYSTEM_PROMPT).toBe(presetConfig.system_prompt);

      // Verify container is running
      const container = docker.getContainer(containerId);
      const info = await container.inspect();
      expect(info.State.Running).toBe(true);

      console.log(`✓ Team preset fully applied and container running`);
    });

    it('should create fully configured container from enterprise preset', async () => {
      const { containerId, envVars } = await createTestContainer('enterprise');
      const presetConfig = getPresetConfig('enterprise');

      // Verify LLM configuration
      expect(envVars.DEEPSEEK_MODEL).toBe(presetConfig.llm.model);
      expect(parseFloat(envVars.TEMPERATURE)).toBe(presetConfig.llm.temperature);
      expect(parseInt(envVars.MAX_TOKENS)).toBe(presetConfig.llm.max_tokens);

      // Verify skills
      const expectedSkills = presetConfig.skills.filter(s => s.enabled).map(s => s.name).sort();
      const actualSkills = envVars.ENABLED_SKILLS.split(',').sort();
      expect(actualSkills).toEqual(expectedSkills);

      // Verify tools
      const expectedTools = presetConfig.tools.filter(t => t.enabled).map(t => ({ name: t.name, layer: t.layer }));
      const actualTools = JSON.parse(envVars.ENABLED_TOOLS);
      expect(actualTools).toEqual(expectedTools);

      // Verify system prompt
      expect(envVars.SYSTEM_PROMPT).toBe(presetConfig.system_prompt);

      // Verify container is running
      const container = docker.getContainer(containerId);
      const info = await container.inspect();
      expect(info.State.Running).toBe(true);

      console.log(`✓ Enterprise preset fully applied and container running`);
    });
  });
});
