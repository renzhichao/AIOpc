/**
 * Configuration Validation Service
 *
 * Validates configuration updates for instances to ensure:
 * - LLM configuration is valid
 * - Skills and tools are within allowed sets
 * - System prompts meet length requirements
 * - Usage limits are within acceptable ranges
 */

import { Service } from 'typedi';
import { InstancePresetConfig } from '../types/config';
import { AppError } from '../utils/errors/AppError';

/**
 * Valid skill names that can be enabled/disabled
 */
const VALID_SKILLS = [
  'general_chat',
  'web_search',
  'knowledge_base',
  'email_assistant',
  'code_helper',
  'data_analyst',
];

/**
 * Valid tool names that can be enabled/disabled
 */
const VALID_TOOLS = [
  'read',
  'write',
  'web_search',
  'memory',
  'exec',
  'web_fetch',
  'cron',
];

/**
 * Validation errors
 */
interface ValidationError {
  field: string;
  message: string;
}

@Service()
export class ConfigValidationService {
  /**
   * Validate configuration update
   *
   * Merges current config with updates and validates the result.
   *
   * @param current - Current instance configuration
   * @param update - Partial configuration update
   * @returns Validated merged configuration
   * @throws AppError if validation fails
   */
  validateConfigUpdate(
    current: InstancePresetConfig,
    update: Partial<InstancePresetConfig>
  ): InstancePresetConfig {
    const errors: ValidationError[] = [];

    // Merge configurations
    const merged: InstancePresetConfig = {
      ...current,
      ...update,
      llm: update.llm ? { ...current.llm, ...update.llm } : current.llm,
      skills: update.skills ?? current.skills,
      tools: update.tools ?? current.tools,
      system_prompt: update.system_prompt ?? current.system_prompt,
      limits: update.limits ? { ...current.limits, ...update.limits } : current.limits,
    };

    // Validate LLM config
    try {
      this.validateLLMConfig(merged.llm);
    } catch (error) {
      if (error instanceof AppError) {
        errors.push({ field: 'llm', message: error.message });
      }
    }

    // Validate skills
    try {
      this.validateSkills(merged.skills);
    } catch (error) {
      if (error instanceof AppError) {
        errors.push({ field: 'skills', message: error.message });
      }
    }

    // Validate tools
    try {
      this.validateTools(merged.tools);
    } catch (error) {
      if (error instanceof AppError) {
        errors.push({ field: 'tools', message: error.message });
      }
    }

    // Validate system prompt
    try {
      this.validateSystemPrompt(merged.system_prompt);
    } catch (error) {
      if (error instanceof AppError) {
        errors.push({ field: 'system_prompt', message: error.message });
      }
    }

    // Validate limits
    try {
      this.validateLimits(merged.limits);
    } catch (error) {
      if (error instanceof AppError) {
        errors.push({ field: 'limits', message: error.message });
      }
    }

    // If there are any errors, throw with details
    if (errors.length > 0) {
      const errorMessages = errors.map(e => `${e.field}: ${e.message}`).join('; ');
      throw new AppError(400, 'INVALID_CONFIG', `Configuration validation failed: ${errorMessages}`);
    }

    return merged;
  }

  /**
   * Validate LLM configuration
   *
   * @param llm - LLM configuration to validate
   * @throws AppError if invalid
   */
  private validateLLMConfig(llm: InstancePresetConfig['llm']): void {
    if (!llm.api_key || llm.api_key.trim().length === 0) {
      throw new AppError(400, 'INVALID_CONFIG', 'API Key is required');
    }

    if (!llm.model || llm.model.trim().length === 0) {
      throw new AppError(400, 'INVALID_CONFIG', 'Model is required');
    }

    if (llm.temperature < 0 || llm.temperature > 2) {
      throw new AppError(400, 'INVALID_CONFIG', 'Temperature must be between 0 and 2');
    }

    if (llm.max_tokens < 1 || llm.max_tokens > 32000) {
      throw new AppError(400, 'INVALID_CONFIG', 'Max tokens must be between 1 and 32000');
    }

    if (!llm.api_base || llm.api_base.trim().length === 0) {
      throw new AppError(400, 'INVALID_CONFIG', 'API base URL is required');
    }

    // Validate URL format
    try {
      new URL(llm.api_base);
    } catch {
      throw new AppError(400, 'INVALID_CONFIG', 'API base URL must be a valid URL');
    }
  }

  /**
   * Validate skills configuration
   *
   * @param skills - Skills to validate
   * @throws AppError if invalid
   */
  private validateSkills(skills: InstancePresetConfig['skills']): void {
    if (!Array.isArray(skills)) {
      throw new AppError(400, 'INVALID_CONFIG', 'Skills must be an array');
    }

    for (const skill of skills) {
      if (!skill.name || typeof skill.name !== 'string') {
        throw new AppError(400, 'INVALID_CONFIG', 'Each skill must have a valid name');
      }

      if (!VALID_SKILLS.includes(skill.name)) {
        throw new AppError(
          400,
          'INVALID_CONFIG',
          `Invalid skill: ${skill.name}. Valid skills are: ${VALID_SKILLS.join(', ')}`
        );
      }

      if (typeof skill.enabled !== 'boolean') {
        throw new AppError(400, 'INVALID_CONFIG', `Skill ${skill.name} must have enabled boolean flag`);
      }
    }

    // Ensure at least one skill is enabled
    const enabledSkills = skills.filter(s => s.enabled);
    if (enabledSkills.length === 0) {
      throw new AppError(400, 'INVALID_CONFIG', 'At least one skill must be enabled');
    }
  }

  /**
   * Validate tools configuration
   *
   * @param tools - Tools to validate
   * @throws AppError if invalid
   */
  private validateTools(tools: InstancePresetConfig['tools']): void {
    if (!Array.isArray(tools)) {
      throw new AppError(400, 'INVALID_CONFIG', 'Tools must be an array');
    }

    for (const tool of tools) {
      if (!tool.name || typeof tool.name !== 'string') {
        throw new AppError(400, 'INVALID_CONFIG', 'Each tool must have a valid name');
      }

      if (!VALID_TOOLS.includes(tool.name)) {
        throw new AppError(
          400,
          'INVALID_CONFIG',
          `Invalid tool: ${tool.name}. Valid tools are: ${VALID_TOOLS.join(', ')}`
        );
      }

      if (typeof tool.enabled !== 'boolean') {
        throw new AppError(400, 'INVALID_CONFIG', `Tool ${tool.name} must have enabled boolean flag`);
      }

      if (tool.layer !== 1 && tool.layer !== 2) {
        throw new AppError(400, 'INVALID_CONFIG', `Tool ${tool.name} layer must be 1 or 2`);
      }
    }

    // Ensure at least basic tools are enabled
    const enabledTools = tools.filter(t => t.enabled);
    if (enabledTools.length === 0) {
      throw new AppError(400, 'INVALID_CONFIG', 'At least one tool must be enabled');
    }

    // Layer 2 tools should have approval mechanism
    const layer2Tools = tools.filter(t => t.enabled && t.layer === 2);
    if (layer2Tools.length > 0) {
      // This is just a warning, not an error
      // Layer 2 tools require user approval in the agent
    }
  }

  /**
   * Validate system prompt
   *
   * @param prompt - System prompt to validate
   * @throws AppError if invalid
   */
  private validateSystemPrompt(prompt: string): void {
    if (typeof prompt !== 'string') {
      throw new AppError(400, 'INVALID_CONFIG', 'System prompt must be a string');
    }

    if (prompt.length < 10) {
      throw new AppError(400, 'INVALID_CONFIG', 'System prompt must be at least 10 characters');
    }

    if (prompt.length > 10000) {
      throw new AppError(400, 'INVALID_CONFIG', 'System prompt must not exceed 10000 characters');
    }
  }

  /**
   * Validate usage limits
   *
   * @param limits - Usage limits to validate
   * @throws AppError if invalid
   */
  private validateLimits(limits: InstancePresetConfig['limits']): void {
    if (limits.max_messages_per_day < -1) {
      throw new AppError(400, 'INVALID_CONFIG', 'Max messages per day must be -1 (unlimited) or greater');
    }

    if (limits.max_messages_per_day === 0) {
      throw new AppError(400, 'INVALID_CONFIG', 'Max messages per day cannot be 0');
    }

    if (limits.max_storage_mb < 1) {
      throw new AppError(400, 'INVALID_CONFIG', 'Max storage must be at least 1 MB');
    }

    if (limits.max_users !== undefined && limits.max_users < 1) {
      throw new AppError(400, 'INVALID_CONFIG', 'Max users must be at least 1');
    }
  }

  /**
   * Get list of valid skills
   *
   * @returns Array of valid skill names
   */
  getValidSkills(): string[] {
    return [...VALID_SKILLS];
  }

  /**
   * Get list of valid tools
   *
   * @returns Array of valid tool names
   */
  getValidTools(): string[] {
    return [...VALID_TOOLS];
  }

  /**
   * Check if a skill name is valid
   *
   * @param skillName - Skill name to check
   * @returns True if valid
   */
  isValidSkill(skillName: string): boolean {
    return VALID_SKILLS.includes(skillName);
  }

  /**
   * Check if a tool name is valid
   *
   * @param toolName - Tool name to check
   * @returns True if valid
   */
  isValidTool(toolName: string): boolean {
    return VALID_TOOLS.includes(toolName);
  }
}
