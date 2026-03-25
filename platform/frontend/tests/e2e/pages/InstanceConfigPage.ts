/* eslint-disable @typescript-eslint/no-unused-vars */
import { Page, expect } from '@playwright/test';

/**
 * Page Object Model for Instance Configuration Page
 *
 * Encapsulates interactions with instance configuration management
 */
export class InstanceConfigPage {
  readonly page: Page;

  // Page elements
  readonly heading;
  readonly backButton;
  readonly llmTab;
  readonly skillsTab;
  readonly toolsTab;
  readonly promptTab;
  readonly limitsTab;
  readonly saveButton;
  readonly cancelButton;
  readonly resetButton;
  readonly successMessage;
  readonly errorMessage;
  readonly configButton;

  // LLM config elements
  readonly apiKeyInput;
  readonly apiBaseInput;
  readonly modelInput;
  readonly temperatureInput;
  readonly maxTokensInput;

  // Skills elements
  readonly skillCheckboxes;
  readonly skillLabels;

  // Tools elements
  readonly toolCheckboxes;
  readonly toolLayerSelects;

  // Prompt elements
  readonly systemPromptTextarea;
  readonly promptCharCount;

  // Limits elements
  readonly maxMessagesInput;
  readonly maxStorageInput;
  readonly maxUsersInput;

  constructor(page: Page) {
    this.page = page;

    // Initialize locators
    this.heading = this.page.getByRole('heading', { name: /instance config|实例配置/i });
    this.backButton = this.page.getByRole('button', { name: /← 返回|back/i });
    this.llmTab = this.page.getByRole('button', { name: /llm 配置|llm/i });
    this.skillsTab = this.page.getByRole('button', { name: /技能管理|skills/i });
    this.toolsTab = this.page.getByRole('button', { name: /工具管理|tools/i });
    this.promptTab = this.page.getByRole('button', { name: /系统提示词|prompt/i });
    this.limitsTab = this.page.getByRole('button', { name: /使用限制|limits/i });
    this.saveButton = this.page.getByRole('button', { name: /保存配置|save/i });
    this.cancelButton = this.page.getByRole('button', { name: /取消|cancel/i });
    this.resetButton = this.page.getByRole('button', { name: /重置为默认|reset/i });
    this.successMessage = this.page.locator('.bg-green-50').or(this.page.locator('[data-testid="success-message"]'));
    this.errorMessage = this.page.locator('.bg-red-50').or(this.page.locator('[data-testid="error-message"]'));
    this.configButton = this.page.locator('[data-testid="config-button"]');

    // LLM config
    this.apiKeyInput = this.page.locator('input[type="password"]').or(this.page.locator('input[placeholder*="sk-"]'));
    this.apiBaseInput = this.page.locator('input[placeholder*="api"]').or(this.page.locator('input[placeholder*="https"]'));
    this.modelInput = this.page.locator('input[placeholder*="model"]');
    this.temperatureInput = this.page.locator('input[type="number"][step="0.1"]');
    this.maxTokensInput = this.page.locator('input[max="32000"]');

    // Skills
    this.skillCheckboxes = this.page.locator('input[id^="skill-"]');
    this.skillLabels = this.page.locator('label[for^="skill-"]');

    // Tools
    this.toolCheckboxes = this.page.locator('input[id^="tool-"]');
    this.toolLayerSelects = this.page.locator('select');

    // Prompt
    this.systemPromptTextarea = this.page.locator('textarea[placeholder*="提示词"]');
    this.promptCharCount = this.page.locator('text=/\\d+ \\/ 10000/');

    // Limits
    this.maxMessagesInput = this.page.locator('input[min="-1"]').first();
    this.maxStorageInput = this.page.locator('input[min="1"]').first();
    this.maxUsersInput = this.page.locator('input[min="1"].last()');
  }

  /**
   * Navigate to instance config page
   */
  async goto(instanceId: string) {
    await this.page.goto(`/instances/${instanceId}/config`, { waitUntil: 'commit' });
    await this.waitForLoad();
  }

  /**
   * Wait for page to fully load
   */
  async waitForLoad() {
    await this.page.waitForURL(/\/instances\/[^/]+\/config$/, { timeout: 10000 });

    // Wait for React to render
    await this.page.waitForFunction(() => {
      const root = document.querySelector('#root');
      return root && root.innerHTML.length > 100;
    }, { timeout: 10000 });

    // Wait for heading to be visible
    await this.heading.waitFor({ state: 'visible', timeout: 10000 });
  }

  /**
   * Navigate to config page from instance details
   */
  async navigateFromDetails() {
    await this.configButton.click();
    await this.page.waitForURL(/\/instances\/[^/]+\/config$/, { timeout: 5000 });
    await this.waitForLoad();
  }

  /**
   * Switch to LLM config tab
   */
  async switchToLLMTab() {
    await this.llmTab.click();
    await this.apiKeyInput.waitFor({ state: 'visible', timeout: 5000 });
  }

  /**
   * Switch to skills tab
   */
  async switchToSkillsTab() {
    await this.skillsTab.click();
    await this.skillCheckboxes.first().waitFor({ state: 'visible', timeout: 5000 });
  }

  /**
   * Switch to tools tab
   */
  async switchToToolsTab() {
    await this.toolsTab.click();
    await this.toolCheckboxes.first().waitFor({ state: 'visible', timeout: 5000 });
  }

  /**
   * Switch to prompt tab
   */
  async switchToPromptTab() {
    await this.promptTab.click();
    await this.systemPromptTextarea.waitFor({ state: 'visible', timeout: 5000 });
  }

  /**
   * Switch to limits tab
   */
  async switchToLimitsTab() {
    await this.limitsTab.click();
    await this.maxMessagesInput.waitFor({ state: 'visible', timeout: 5000 });
  }

  /**
   * Update LLM configuration
   */
  async updateLLMConfig(config: {
    apiKey?: string;
    apiBase?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }) {
    await this.switchToLLMTab();

    if (config.apiKey !== undefined) {
      await this.apiKeyInput.fill(config.apiKey);
    }
    if (config.apiBase !== undefined) {
      await this.apiBaseInput.fill(config.apiBase);
    }
    if (config.model !== undefined) {
      await this.modelInput.fill(config.model);
    }
    if (config.temperature !== undefined) {
      await this.temperatureInput.fill(config.temperature.toString());
    }
    if (config.maxTokens !== undefined) {
      await this.maxTokensInput.fill(config.maxTokens.toString());
    }
  }

  /**
   * Toggle skill by name
   */
  async toggleSkill(skillName: string) {
    await this.switchToSkillsTab();
    const skillCheckbox = this.page.locator(`input[id="skill-${skillName}"]`);
    await skillCheckbox.check();
  }

  /**
   * Enable skill
   */
  async enableSkill(skillName: string) {
    await this.switchToSkillsTab();
    const skillCheckbox = this.page.locator(`input[id="skill-${skillName}"]`);
    await skillCheckbox.check();
  }

  /**
   * Disable skill
   */
  async disableSkill(skillName: string) {
    await this.switchToSkillsTab();
    const skillCheckbox = this.page.locator(`input[id="skill-${skillName}"]`);
    await skillCheckbox.uncheck();
  }

  /**
   * Get skill enabled status
   */
  async isSkillEnabled(skillName: string): Promise<boolean> {
    const skillCheckbox = this.page.locator(`input[id="skill-${skillName}"]`);
    const isChecked = await skillCheckbox.isChecked();
    return isChecked;
  }

  /**
   * Toggle tool by name
   */
  async toggleTool(toolName: string) {
    await this.switchToToolsTab();
    const toolCheckbox = this.page.locator(`input[id="tool-${toolName}"]`);
    await toolCheckbox.check();
  }

  /**
   * Update tool layer
   */
  async updateToolLayer(toolName: string, layer: 1 | 2) {
    await this.switchToToolsTab();
    const toolRow = this.page.locator(`input[id="tool-${toolName}"]`).locator('....');
    const layerSelect = toolRow.locator('select');
    await layerSelect.selectOption(layer.toString());
  }

  /**
   * Update system prompt
   */
  async updateSystemPrompt(prompt: string) {
    await this.switchToPromptTab();
    await this.systemPromptTextarea.fill(prompt);
  }

  /**
   * Get current system prompt
   */
  async getSystemPrompt(): Promise<string> {
    return await this.systemPromptTextarea.inputValue();
  }

  /**
   * Get prompt character count
   */
  async getPromptCharCount(): Promise<number> {
    const text = await this.promptCharCount.textContent();
    const match = text?.match(/(\d+) \/ 10000/);
    return match ? parseInt(match[1]) : 0;
  }

  /**
   * Update usage limits
   */
  async updateLimits(limits: {
    maxMessages?: number;
    maxStorage?: number;
    maxUsers?: number;
  }) {
    await this.switchToLimitsTab();

    if (limits.maxMessages !== undefined) {
      await this.maxMessagesInput.fill(limits.maxMessages.toString());
    }
    if (limits.maxStorage !== undefined) {
      await this.maxStorageInput.fill(limits.maxStorage.toString());
    }
    if (limits.maxUsers !== undefined) {
      await this.maxUsersInput.fill(limits.maxUsers.toString());
    }
  }

  /**
   * Save configuration
   */
  async saveConfig() {
    await this.saveButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Cancel changes
   */
  async cancelChanges() {
    await this.cancelButton.click();
  }

  /**
   * Reset to default configuration
   */
  async resetToDefault() {
    await this.resetButton.click();
    // Handle confirmation modal
    const confirmButton = this.page.getByRole('button', { name: /确认重置|confirm reset/i });
    await confirmButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Check if save button is enabled
   */
  async isSaveButtonEnabled(): Promise<boolean> {
    return await this.saveButton.isEnabled();
  }

  /**
   * Check if success message is visible
   */
  async isSuccessMessageVisible(): Promise<boolean> {
    return await this.successMessage.isVisible().catch(() => false);
  }

  /**
   * Check if error message is visible
   */
  async isErrorMessageVisible(): Promise<boolean> {
    return await this.errorMessage.isVisible().catch(() => false);
  }

  /**
   * Get success message text
   */
  async getSuccessMessage(): Promise<string> {
    const text = await this.successMessage.textContent();
    return text || '';
  }

  /**
   * Get error message text
   */
  async getErrorMessage(): Promise<string> {
    const text = await this.errorMessage.textContent();
    return text || '';
  }

  /**
   * Navigate back to instance details
   */
  async goBack() {
    await this.backButton.click();
    await this.page.waitForURL(/\/instances\/[^/]+$/, { timeout: 5000 });
  }
}
