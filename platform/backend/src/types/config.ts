/**
 * Instance Configuration Types
 * Defines types for instance preset configurations and templates
 */

/**
 * LLM configuration for an instance
 */
export interface LLMConfig {
  /** LLM provider (currently only DeepSeek is supported) */
  provider: 'deepseek';
  /** API key for LLM access */
  api_key: string;
  /** API base URL */
  api_base: string;
  /** Model name */
  model: string;
  /** Temperature for generation (0-1) */
  temperature: number;
  /** Maximum tokens to generate */
  max_tokens: number;
}

/**
 * Skill configuration for an instance
 */
export interface SkillConfig {
  /** Skill name/identifier */
  name: string;
  /** Whether the skill is enabled */
  enabled: boolean;
  /** Optional skill-specific configuration */
  config?: Record<string, unknown>;
}

/**
 * Tool configuration for an instance
 */
export interface ToolConfig {
  /** Tool name/identifier */
  name: string;
  /** Whether the tool is enabled */
  enabled: boolean;
  /** Security layer: 1 = basic capabilities, 2 = advanced capabilities */
  layer: 1 | 2;
}

/**
 * Usage limits for an instance
 */
export interface UsageLimits {
  /** Maximum messages per day */
  max_messages_per_day: number;
  /** Maximum storage in MB */
  max_storage_mb: number;
  /** Maximum number of users (optional, for team/enterprise) */
  max_users?: number;
}

/**
 * Complete instance preset configuration
 * This configuration is applied when creating a new instance
 */
export interface InstancePresetConfig {
  /** LLM configuration */
  llm: LLMConfig;
  /** Enabled skills configuration */
  skills: SkillConfig[];
  /** Enabled tools configuration */
  tools: ToolConfig[];
  /** System prompt for the AI agent */
  system_prompt: string;
  /** Usage limits */
  limits: UsageLimits;
}

/**
 * Instance template type
 */
export type InstanceTemplate = 'personal' | 'team' | 'enterprise';
