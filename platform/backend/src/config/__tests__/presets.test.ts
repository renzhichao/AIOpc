/**
 * Unit tests for preset configuration templates
 */

import {
  PRESET_TEMPLATES,
  getPresetConfig,
  getAvailableTemplates,
  isValidTemplate,
} from '../presets';
import { InstancePresetConfig } from '../../types/config';

describe('Preset Configuration Templates', () => {
  describe('PRESET_TEMPLATES', () => {
    it('should have three templates defined', () => {
      expect(Object.keys(PRESET_TEMPLATES)).toHaveLength(3);
    });

    it('should have personal, team, and enterprise templates', () => {
      expect(PRESET_TEMPLATES).toHaveProperty('personal');
      expect(PRESET_TEMPLATES).toHaveProperty('team');
      expect(PRESET_TEMPLATES).toHaveProperty('enterprise');
    });
  });

  describe('Personal Template', () => {
    let config: InstancePresetConfig;

    beforeAll(() => {
      config = PRESET_TEMPLATES.personal;
    });

    it('should have correct LLM configuration', () => {
      expect(config.llm.provider).toBe('deepseek');
      expect(config.llm.api_base).toBe('https://api.deepseek.com');
      expect(config.llm.model).toBe('deepseek-chat');
      expect(config.llm.temperature).toBe(0.7);
      expect(config.llm.max_tokens).toBe(4000);
    });

    it('should have basic skills enabled', () => {
      const enabledSkills = config.skills.filter(s => s.enabled);
      expect(enabledSkills).toHaveLength(3);
      expect(enabledSkills.map(s => s.name)).toContain('general_chat');
      expect(enabledSkills.map(s => s.name)).toContain('web_search');
      expect(enabledSkills.map(s => s.name)).toContain('knowledge_base');
    });

    it('should have basic tools enabled', () => {
      const enabledTools = config.tools.filter(t => t.enabled);
      expect(enabledTools).toHaveLength(4);
      expect(enabledTools.map(t => t.name)).toContain('read');
      expect(enabledTools.map(t => t.name)).toContain('write');
      expect(enabledTools.map(t => t.name)).toContain('web_search');
      expect(enabledTools.map(t => t.name)).toContain('memory');
    });

    it('should have correct usage limits', () => {
      expect(config.limits.max_messages_per_day).toBe(100);
      expect(config.limits.max_storage_mb).toBe(100);
      expect(config.limits.max_users).toBeUndefined();
    });

    it('should have system prompt defined', () => {
      expect(config.system_prompt).toBeTruthy();
      expect(config.system_prompt).toContain('龙虾');
    });
  });

  describe('Team Template', () => {
    let config: InstancePresetConfig;

    beforeAll(() => {
      config = PRESET_TEMPLATES.team;
    });

    it('should have correct LLM configuration', () => {
      expect(config.llm.provider).toBe('deepseek');
      expect(config.llm.api_base).toBe('https://api.deepseek.com');
      expect(config.llm.model).toBe('deepseek-chat');
      expect(config.llm.temperature).toBe(0.7);
      expect(config.llm.max_tokens).toBe(8000);
    });

    it('should have extended skills enabled', () => {
      const enabledSkills = config.skills.filter(s => s.enabled);
      expect(enabledSkills).toHaveLength(4);
      expect(enabledSkills.map(s => s.name)).toContain('general_chat');
      expect(enabledSkills.map(s => s.name)).toContain('web_search');
      expect(enabledSkills.map(s => s.name)).toContain('knowledge_base');
      expect(enabledSkills.map(s => s.name)).toContain('email_assistant');
    });

    it('should have extended tools enabled', () => {
      const enabledTools = config.tools.filter(t => t.enabled);
      expect(enabledTools).toHaveLength(6);
      expect(enabledTools.map(t => t.name)).toContain('read');
      expect(enabledTools.map(t => t.name)).toContain('write');
      expect(enabledTools.map(t => t.name)).toContain('web_search');
      expect(enabledTools.map(t => t.name)).toContain('memory');
      expect(enabledTools.map(t => t.name)).toContain('exec');
      expect(enabledTools.map(t => t.name)).toContain('web_fetch');
    });

    it('should have correct usage limits', () => {
      expect(config.limits.max_messages_per_day).toBe(500);
      expect(config.limits.max_storage_mb).toBe(500);
      expect(config.limits.max_users).toBe(10);
    });

    it('should have team-focused system prompt', () => {
      expect(config.system_prompt).toBeTruthy();
      expect(config.system_prompt).toContain('团队协作');
    });
  });

  describe('Enterprise Template', () => {
    let config: InstancePresetConfig;

    beforeAll(() => {
      config = PRESET_TEMPLATES.enterprise;
    });

    it('should have correct LLM configuration', () => {
      expect(config.llm.provider).toBe('deepseek');
      expect(config.llm.api_base).toBe('https://api.deepseek.com');
      expect(config.llm.model).toBe('deepseek-chat');
      expect(config.llm.temperature).toBe(0.7);
      expect(config.llm.max_tokens).toBe(16000);
    });

    it('should have all skills enabled', () => {
      const enabledSkills = config.skills.filter(s => s.enabled);
      expect(enabledSkills).toHaveLength(6);
      expect(enabledSkills.map(s => s.name)).toContain('general_chat');
      expect(enabledSkills.map(s => s.name)).toContain('web_search');
      expect(enabledSkills.map(s => s.name)).toContain('knowledge_base');
      expect(enabledSkills.map(s => s.name)).toContain('email_assistant');
      expect(enabledSkills.map(s => s.name)).toContain('code_helper');
      expect(enabledSkills.map(s => s.name)).toContain('data_analyst');
    });

    it('should have all tools enabled', () => {
      const enabledTools = config.tools.filter(t => t.enabled);
      expect(enabledTools).toHaveLength(6);
      expect(enabledTools.map(t => t.name)).toContain('read');
      expect(enabledTools.map(t => t.name)).toContain('write');
      expect(enabledTools.map(t => t.name)).toContain('web_search');
      expect(enabledTools.map(t => t.name)).toContain('memory');
      expect(enabledTools.map(t => t.name)).toContain('exec');
      expect(enabledTools.map(t => t.name)).toContain('web_fetch');
    });

    it('should have correct usage limits', () => {
      expect(config.limits.max_messages_per_day).toBe(-1); // Unlimited
      expect(config.limits.max_storage_mb).toBe(5120); // 5GB
      expect(config.limits.max_users).toBe(50);
    });

    it('should have enterprise-focused system prompt', () => {
      expect(config.system_prompt).toBeTruthy();
      expect(config.system_prompt).toContain('企业');
    });
  });

  describe('getPresetConfig()', () => {
    it('should return personal template by default for invalid template', () => {
      const config = getPresetConfig('invalid' as any);
      expect(config).toEqual(PRESET_TEMPLATES.personal);
    });

    it('should return correct template for valid template name', () => {
      expect(getPresetConfig('personal')).toEqual(PRESET_TEMPLATES.personal);
      expect(getPresetConfig('team')).toEqual(PRESET_TEMPLATES.team);
      expect(getPresetConfig('enterprise')).toEqual(PRESET_TEMPLATES.enterprise);
    });
  });

  describe('getAvailableTemplates()', () => {
    it('should return array of template names', () => {
      const templates = getAvailableTemplates();
      expect(Array.isArray(templates)).toBe(true);
      expect(templates).toHaveLength(3);
    });

    it('should contain all template names', () => {
      const templates = getAvailableTemplates();
      expect(templates).toContain('personal');
      expect(templates).toContain('team');
      expect(templates).toContain('enterprise');
    });
  });

  describe('isValidTemplate()', () => {
    it('should return true for valid templates', () => {
      expect(isValidTemplate('personal')).toBe(true);
      expect(isValidTemplate('team')).toBe(true);
      expect(isValidTemplate('enterprise')).toBe(true);
    });

    it('should return false for invalid templates', () => {
      expect(isValidTemplate('invalid')).toBe(false);
      expect(isValidTemplate('')).toBe(false);
      expect(isValidTemplate('PERSONAL')).toBe(false);
    });
  });

  describe('Template Progressive Enhancement', () => {
    it('should increase max_tokens from personal to enterprise', () => {
      const personal = PRESET_TEMPLATES.personal.llm.max_tokens;
      const team = PRESET_TEMPLATES.team.llm.max_tokens;
      const enterprise = PRESET_TEMPLATES.enterprise.llm.max_tokens;

      expect(personal).toBeLessThan(team);
      expect(team).toBeLessThan(enterprise);
    });

    it('should increase storage limits from personal to enterprise', () => {
      const personal = PRESET_TEMPLATES.personal.limits.max_storage_mb;
      const team = PRESET_TEMPLATES.team.limits.max_storage_mb;
      const enterprise = PRESET_TEMPLATES.enterprise.limits.max_storage_mb;

      expect(personal).toBeLessThan(team);
      expect(team).toBeLessThan(enterprise);
    });

    it('should increase enabled skills from personal to enterprise', () => {
      const personal = PRESET_TEMPLATES.personal.skills.filter(s => s.enabled).length;
      const team = PRESET_TEMPLATES.team.skills.filter(s => s.enabled).length;
      const enterprise = PRESET_TEMPLATES.enterprise.skills.filter(s => s.enabled).length;

      expect(personal).toBeLessThanOrEqual(team);
      expect(team).toBeLessThanOrEqual(enterprise);
    });

    it('should increase enabled tools from personal to enterprise', () => {
      const personal = PRESET_TEMPLATES.personal.tools.filter(t => t.enabled).length;
      const team = PRESET_TEMPLATES.team.tools.filter(t => t.enabled).length;
      const enterprise = PRESET_TEMPLATES.enterprise.tools.filter(t => t.enabled).length;

      expect(personal).toBeLessThanOrEqual(team);
      expect(team).toBeLessThanOrEqual(enterprise);
    });
  });
});
