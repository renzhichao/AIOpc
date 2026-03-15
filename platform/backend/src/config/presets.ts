/**
 * Instance Preset Templates
 * Defines preset configurations for different instance templates
 */

import { InstancePresetConfig } from '../types/config';

/**
 * Default system prompt for personal instances
 */
const DEFAULT_SYSTEM_PROMPT = `
你是一个名为"龙虾"的AI助手，基于OpenClaw框架构建。

你的核心能力：
1. 通用对话：回答各种问题
2. 网络搜索：获取最新信息
3. 知识问答：基于知识库回答
4. 记忆管理：记住重要信息

你的特点：
- 专业且友好
- 准确且诚实
- 保护用户隐私
- 持续学习改进

请用简洁、准确的方式回答用户问题。
`.trim();

/**
 * System prompt for team instances
 */
const TEAM_SYSTEM_PROMPT = `
你是一个团队协作AI助手"龙虾"，基于OpenClaw框架构建。

你的核心能力：
1. 团队协作：支持多人使用
2. 任务管理：帮助团队协调任务
3. 知识共享：建立团队知识库
4. 邮件处理：协助邮件沟通

请用专业、高效的方式协助团队工作。
`.trim();

/**
 * System prompt for enterprise instances
 */
const ENTERPRISE_SYSTEM_PROMPT = `
你是一个企业级AI助手"龙虾"，基于OpenClaw框架构建。

你的核心能力：
1. 企业协作：支持大规模团队协作
2. 任务自动化：自动化处理复杂任务
3. 系统集成：与企业现有系统集成
4. 数据分析：提供深入的数据洞察

请用专业、安全、高效的方式协助企业运营。
`.trim();

/**
 * Get DeepSeek API key from environment
 */
const getDeepSeekApiKey = (): string => {
  return process.env.DEEPSEEK_API_KEY || '';
};

/**
 * Personal instance preset configuration
 * - 100 messages per day
 * - 100MB storage
 * - Basic skills and tools
 */
const PERSONAL_PRESET: InstancePresetConfig = {
  llm: {
    provider: 'deepseek',
    api_key: getDeepSeekApiKey(),
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
  system_prompt: DEFAULT_SYSTEM_PROMPT,
  limits: {
    max_messages_per_day: 100,
    max_storage_mb: 100,
  },
};

/**
 * Team instance preset configuration
 * - 500 messages per day
 * - 500MB storage
 * - Up to 10 users
 * - Extended skills and tools
 */
const TEAM_PRESET: InstancePresetConfig = {
  llm: {
    provider: 'deepseek',
    api_key: getDeepSeekApiKey(),
    api_base: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    temperature: 0.7,
    max_tokens: 8000,
  },
  skills: [
    { name: 'general_chat', enabled: true, config: {} },
    { name: 'web_search', enabled: true, config: {} },
    { name: 'knowledge_base', enabled: true, config: {} },
    { name: 'email_assistant', enabled: true, config: {} },
    { name: 'code_helper', enabled: false, config: {} },
    { name: 'data_analyst', enabled: false, config: {} },
  ],
  tools: [
    { name: 'read', enabled: true, layer: 1 },
    { name: 'write', enabled: true, layer: 1 },
    { name: 'web_search', enabled: true, layer: 1 },
    { name: 'memory', enabled: true, layer: 1 },
    { name: 'exec', enabled: true, layer: 2 },
    { name: 'web_fetch', enabled: true, layer: 2 },
  ],
  system_prompt: TEAM_SYSTEM_PROMPT,
  limits: {
    max_messages_per_day: 500,
    max_storage_mb: 500,
    max_users: 10,
  },
};

/**
 * Enterprise instance preset configuration
 * - Unlimited messages
 * - 5GB storage
 * - Up to 50 users
 * - All skills and tools enabled
 */
const ENTERPRISE_PRESET: InstancePresetConfig = {
  llm: {
    provider: 'deepseek',
    api_key: getDeepSeekApiKey(),
    api_base: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    temperature: 0.7,
    max_tokens: 16000,
  },
  skills: [
    { name: 'general_chat', enabled: true, config: {} },
    { name: 'web_search', enabled: true, config: {} },
    { name: 'knowledge_base', enabled: true, config: {} },
    { name: 'email_assistant', enabled: true, config: {} },
    { name: 'code_helper', enabled: true, config: {} },
    { name: 'data_analyst', enabled: true, config: {} },
  ],
  tools: [
    { name: 'read', enabled: true, layer: 1 },
    { name: 'write', enabled: true, layer: 1 },
    { name: 'web_search', enabled: true, layer: 1 },
    { name: 'memory', enabled: true, layer: 1 },
    { name: 'exec', enabled: true, layer: 2 },
    { name: 'web_fetch', enabled: true, layer: 2 },
  ],
  system_prompt: ENTERPRISE_SYSTEM_PROMPT,
  limits: {
    max_messages_per_day: -1, // Unlimited
    max_storage_mb: 5120, // 5GB
    max_users: 50,
  },
};

/**
 * Preset templates registry
 * Maps template names to their configurations
 */
export const PRESET_TEMPLATES: Record<string, InstancePresetConfig> = {
  personal: PERSONAL_PRESET,
  team: TEAM_PRESET,
  enterprise: ENTERPRISE_PRESET,
};

/**
 * Get preset configuration for a template
 * Falls back to personal template if template not found
 *
 * @param template - Template name
 * @returns Preset configuration
 */
export function getPresetConfig(template: string): InstancePresetConfig {
  return PRESET_TEMPLATES[template] || PRESET_TEMPLATES.personal;
}

/**
 * Get list of available templates
 *
 * @returns Array of template names
 */
export function getAvailableTemplates(): string[] {
  return Object.keys(PRESET_TEMPLATES);
}

/**
 * Validate if a template exists
 *
 * @param template - Template name
 * @returns True if template exists
 */
export function isValidTemplate(template: string): boolean {
  return template in PRESET_TEMPLATES;
}
