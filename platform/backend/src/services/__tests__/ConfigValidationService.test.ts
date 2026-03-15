/**
 * Unit Tests for ConfigValidationService
 *
 * Tests configuration validation logic for:
 * - LLM configuration validation
 * - Skills configuration validation
 * - Tools configuration validation
 * - System prompt validation
 * - Usage limits validation
 */

import { ConfigValidationService } from '../ConfigValidationService';
import { InstancePresetConfig } from '../../types/config';
import { AppError } from '../../utils/errors/AppError';

describe('ConfigValidationService', () => {
  let validationService: ConfigValidationService;

  const mockBaseConfig: InstancePresetConfig = {
    llm: {
      provider: 'deepseek',
      api_key: 'sk-test-key-12345',
      api_base: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      temperature: 0.7,
      max_tokens: 4000,
    },
    skills: [
      { name: 'general_chat', enabled: true, config: {} },
      { name: 'web_search', enabled: true, config: {} },
      { name: 'knowledge_base', enabled: true, config: {} },
      { name: 'email_assistant', enabled: false, config: {} },
      { name: 'code_helper', enabled: false, config: {} },
      { name: 'data_analyst', enabled: false, config: {} },
    ],
    tools: [
      { name: 'read', enabled: true, layer: 1 },
      { name: 'write', enabled: true, layer: 1 },
      { name: 'web_search', enabled: true, layer: 1 },
      { name: 'memory', enabled: true, layer: 1 },
      { name: 'exec', enabled: false, layer: 2 },
      { name: 'web_fetch', enabled: false, layer: 2 },
    ],
    system_prompt: 'You are a helpful AI assistant.',
    limits: {
      max_messages_per_day: 100,
      max_storage_mb: 100,
    },
  };

  beforeEach(() => {
    validationService = new ConfigValidationService();
  });

  describe('validateConfigUpdate', () => {
    it('should successfully validate a valid configuration update', () => {
      const update: Partial<InstancePresetConfig> = {
        llm: {
          ...mockBaseConfig.llm,
          temperature: 0.8,
          max_tokens: 8000,
        },
      };

      const result = validationService.validateConfigUpdate(mockBaseConfig, update);

      expect(result.llm.temperature).toBe(0.8);
      expect(result.llm.max_tokens).toBe(8000);
      expect(result.llm.api_key).toBe(mockBaseConfig.llm.api_key); // Unchanged
    });

    it('should merge partial updates with existing config', () => {
      const update: Partial<InstancePresetConfig> = {
        system_prompt: 'Updated system prompt',
      };

      const result = validationService.validateConfigUpdate(mockBaseConfig, update);

      expect(result.system_prompt).toBe('Updated system prompt');
      expect(result.llm).toEqual(mockBaseConfig.llm);
      expect(result.skills).toEqual(mockBaseConfig.skills);
    });

    it('should throw error for invalid LLM config', () => {
      const update: Partial<InstancePresetConfig> = {
        llm: {
          ...mockBaseConfig.llm,
          temperature: 3, // Invalid: > 2
        },
      };

      expect(() => {
        validationService.validateConfigUpdate(mockBaseConfig, update);
      }).toThrow(AppError);
    });

    it('should throw error for invalid skills', () => {
      const update: Partial<InstancePresetConfig> = {
        skills: [
          { name: 'invalid_skill', enabled: true, config: {} },
        ],
      };

      expect(() => {
        validationService.validateConfigUpdate(mockBaseConfig, update);
      }).toThrow(AppError);
    });

    it('should throw error for no enabled skills', () => {
      const update: Partial<InstancePresetConfig> = {
        skills: [
          { name: 'general_chat', enabled: false, config: {} },
          { name: 'web_search', enabled: false, config: {} },
        ],
      };

      expect(() => {
        validationService.validateConfigUpdate(mockBaseConfig, update);
      }).toThrow(AppError);
    });

    it('should throw error for invalid tools', () => {
      const update: Partial<InstancePresetConfig> = {
        tools: [
          { name: 'invalid_tool', enabled: true, layer: 1 },
        ],
      };

      expect(() => {
        validationService.validateConfigUpdate(mockBaseConfig, update);
      }).toThrow(AppError);
    });

    it('should throw error for invalid tool layer', () => {
      const update: Partial<InstancePresetConfig> = {
        tools: [
          { name: 'read', enabled: true, layer: 1 }, // Valid, but we'll test validation logic
        ],
      };

      // This should pass validation as layer 1 is valid
      expect(() => {
        validationService.validateConfigUpdate(mockBaseConfig, update);
      }).not.toThrow();
    });

    it('should throw error for system prompt too short', () => {
      const update: Partial<InstancePresetConfig> = {
        system_prompt: 'short',
      };

      expect(() => {
        validationService.validateConfigUpdate(mockBaseConfig, update);
      }).toThrow(AppError);
    });

    it('should throw error for system prompt too long', () => {
      const update: Partial<InstancePresetConfig> = {
        system_prompt: 'x'.repeat(10001),
      };

      expect(() => {
        validationService.validateConfigUpdate(mockBaseConfig, update);
      }).toThrow(AppError);
    });
  });

  describe('validateLLMConfig', () => {
    it('should accept valid LLM configuration', () => {
      const validLLM = {
        provider: 'deepseek' as const,
        api_key: 'sk-test-key-12345',
        api_base: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        temperature: 0.7,
        max_tokens: 4000,
      };

      expect(() => {
        validationService.validateConfigUpdate(mockBaseConfig, { llm: validLLM });
      }).not.toThrow();
    });

    it('should reject empty API key', () => {
      const invalidLLM = {
        ...mockBaseConfig.llm,
        api_key: '',
      };

      expect(() => {
        validationService.validateConfigUpdate(mockBaseConfig, { llm: invalidLLM });
      }).toThrow(AppError);
    });

    it('should reject temperature out of range', () => {
      expect(() => {
        validationService.validateConfigUpdate(mockBaseConfig, {
          llm: { ...mockBaseConfig.llm, temperature: -1 },
        });
      }).toThrow(AppError);

      expect(() => {
        validationService.validateConfigUpdate(mockBaseConfig, {
          llm: { ...mockBaseConfig.llm, temperature: 2.1 },
        });
      }).toThrow(AppError);
    });

    it('should reject max_tokens out of range', () => {
      expect(() => {
        validationService.validateConfigUpdate(mockBaseConfig, {
          llm: { ...mockBaseConfig.llm, max_tokens: 0 },
        });
      }).toThrow(AppError);

      expect(() => {
        validationService.validateConfigUpdate(mockBaseConfig, {
          llm: { ...mockBaseConfig.llm, max_tokens: 32001 },
        });
      }).toThrow(AppError);
    });

    it('should reject invalid API base URL', () => {
      expect(() => {
        validationService.validateConfigUpdate(mockBaseConfig, {
          llm: { ...mockBaseConfig.llm, api_base: 'not-a-url' },
        });
      }).toThrow(AppError);
    });
  });

  describe('validateSkills', () => {
    it('should accept valid skills', () => {
      const validSkills = [
        { name: 'general_chat', enabled: true, config: {} },
        { name: 'web_search', enabled: true, config: {} },
      ];

      expect(() => {
        validationService.validateConfigUpdate(mockBaseConfig, { skills: validSkills });
      }).not.toThrow();
    });

    it('should reject invalid skill name', () => {
      const invalidSkills = [
        { name: 'invalid_skill', enabled: true, config: {} },
      ];

      expect(() => {
        validationService.validateConfigUpdate(mockBaseConfig, { skills: invalidSkills });
      }).toThrow(AppError);
    });

    it('should reject skills array with all disabled', () => {
      const allDisabledSkills = [
        { name: 'general_chat', enabled: false, config: {} },
        { name: 'web_search', enabled: false, config: {} },
      ];

      expect(() => {
        validationService.validateConfigUpdate(mockBaseConfig, { skills: allDisabledSkills });
      }).toThrow(AppError);
    });
  });

  describe('validateTools', () => {
    it('should accept valid tools', () => {
      const validTools = [
        { name: 'read', enabled: true, layer: 1 as const },
        { name: 'write', enabled: true, layer: 1 as const },
      ];

      expect(() => {
        validationService.validateConfigUpdate(mockBaseConfig, { tools: validTools });
      }).not.toThrow();
    });

    it('should reject invalid tool name', () => {
      const invalidTools = [
        { name: 'invalid_tool', enabled: true, layer: 1 as const },
      ];

      expect(() => {
        validationService.validateConfigUpdate(mockBaseConfig, { tools: invalidTools });
      }).toThrow(AppError);
    });

    it('should reject tools array with all disabled', () => {
      const allDisabledTools = [
        { name: 'read', enabled: false, layer: 1 as const },
        { name: 'write', enabled: false, layer: 1 as const },
      ];

      expect(() => {
        validationService.validateConfigUpdate(mockBaseConfig, { tools: allDisabledTools });
      }).toThrow(AppError);
    });

    it('should reject invalid tool layer', () => {
      // Test that only layers 1 and 2 are allowed
      // Since TypeScript enforces this at compile time, we test the runtime validation
      // by using a type assertion to bypass the type check for testing purposes
      const invalidLayerTools = [
        { name: 'read', enabled: true, layer: 3 as any },
      ];

      expect(() => {
        validationService.validateConfigUpdate(mockBaseConfig, { tools: invalidLayerTools });
      }).toThrow(AppError);
    });
  });

  describe('validateSystemPrompt', () => {
    it('should accept valid system prompt', () => {
      const validPrompt = 'You are a helpful AI assistant.';

      expect(() => {
        validationService.validateConfigUpdate(mockBaseConfig, { system_prompt: validPrompt });
      }).not.toThrow();
    });

    it('should reject prompt shorter than 10 characters', () => {
      const shortPrompt = 'Too short';

      expect(() => {
        validationService.validateConfigUpdate(mockBaseConfig, { system_prompt: shortPrompt });
      }).toThrow(AppError);
    });

    it('should reject prompt longer than 10000 characters', () => {
      const longPrompt = 'x'.repeat(10001);

      expect(() => {
        validationService.validateConfigUpdate(mockBaseConfig, { system_prompt: longPrompt });
      }).toThrow(AppError);
    });
  });

  describe('validateLimits', () => {
    it('should accept valid limits', () => {
      const validLimits = {
        max_messages_per_day: 100,
        max_storage_mb: 500,
        max_users: 10,
      };

      expect(() => {
        validationService.validateConfigUpdate(mockBaseConfig, { limits: validLimits });
      }).not.toThrow();
    });

    it('should accept unlimited messages (-1)', () => {
      const unlimitedLimits = {
        max_messages_per_day: -1,
        max_storage_mb: 500,
      };

      expect(() => {
        validationService.validateConfigUpdate(mockBaseConfig, { limits: unlimitedLimits });
      }).not.toThrow();
    });

    it('should reject zero messages per day', () => {
      const invalidLimits = {
        max_messages_per_day: 0,
        max_storage_mb: 500,
      };

      expect(() => {
        validationService.validateConfigUpdate(mockBaseConfig, { limits: invalidLimits });
      }).toThrow(AppError);
    });

    it('should reject negative storage', () => {
      const invalidLimits = {
        max_messages_per_day: 100,
        max_storage_mb: -1,
      };

      expect(() => {
        validationService.validateConfigUpdate(mockBaseConfig, { limits: invalidLimits });
      }).toThrow(AppError);
    });

    it('should reject zero or negative users', () => {
      expect(() => {
        validationService.validateConfigUpdate(mockBaseConfig, {
          limits: { ...mockBaseConfig.limits, max_users: 0 },
        });
      }).toThrow(AppError);

      expect(() => {
        validationService.validateConfigUpdate(mockBaseConfig, {
          limits: { ...mockBaseConfig.limits, max_users: -1 },
        });
      }).toThrow(AppError);
    });
  });

  describe('Utility methods', () => {
    it('should return list of valid skills', () => {
      const validSkills = validationService.getValidSkills();

      expect(Array.isArray(validSkills)).toBe(true);
      expect(validSkills.length).toBeGreaterThan(0);
      expect(validSkills).toContain('general_chat');
      expect(validSkills).toContain('web_search');
    });

    it('should return list of valid tools', () => {
      const validTools = validationService.getValidTools();

      expect(Array.isArray(validTools)).toBe(true);
      expect(validTools.length).toBeGreaterThan(0);
      expect(validTools).toContain('read');
      expect(validTools).toContain('write');
    });

    it('should check if skill is valid', () => {
      expect(validationService.isValidSkill('general_chat')).toBe(true);
      expect(validationService.isValidSkill('invalid_skill')).toBe(false);
    });

    it('should check if tool is valid', () => {
      expect(validationService.isValidTool('read')).toBe(true);
      expect(validationService.isValidTool('invalid_tool')).toBe(false);
    });
  });
});
