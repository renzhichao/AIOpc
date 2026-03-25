/* eslint-disable @typescript-eslint/no-unused-vars */
import { test, expect } from '../../fixtures';
import { InstanceConfigPage } from '../../pages/InstanceConfigPage';
import { InstanceDetailsPage } from '../../pages/InstanceDetailsPage';
import { LoginPage } from '../../pages/LoginPage';
import { InstancesPage } from '../../pages/InstancesPage';

/**
 * E2E Tests for Instance Configuration Flow
 *
 * These tests verify the complete instance configuration process including:
 * - Navigation to configuration page
 * - LLM configuration updates
 * - Skills management
 * - Tools management
 * - System prompt editing
 * - Usage limits configuration
 * - Validation errors
 * - Save and cancel operations
 */

test.describe('Instance Configuration Flow', () => {
  let loginPage: LoginPage;
  let instancesPage: InstancesPage;
  let instanceDetailsPage: InstanceDetailsPage;
  let instanceConfigPage: InstanceConfigPage;

  const testInstanceId = 'test-instance-config-123';

  test.beforeEach(async ({ authenticatedPage }) => {
    loginPage = new LoginPage(authenticatedPage);
    instancesPage = new InstancesPage(authenticatedPage);
    instanceDetailsPage = new InstanceDetailsPage(authenticatedPage);
    instanceConfigPage = new InstanceConfigPage(authenticatedPage);

    // Start from instance details page
    await instanceDetailsPage.goto(testInstanceId);
  });

  test('should display configuration button on instance details page', async ({ authenticatedPage }) => {
    // Verify config button is visible
    await expect(instanceConfigPage.configButton).toBeVisible();
    await expect(instanceConfigPage.configButton).toHaveText(/配置|config/i);
  });

  test('should navigate to configuration page', async ({ authenticatedPage }) => {
    // Click config button
    await instanceConfigPage.navigateFromDetails();

    // Verify navigation
    const currentUrl = authenticatedPage.url();
    expect(currentUrl).toContain('/instances/');
    expect(currentUrl).toContain('/config');

    // Verify page loaded
    await expect(instanceConfigPage.heading).toBeVisible();
    await expect(instanceConfigPage.heading).toContainText(/实例配置|instance config/i);
  });

  test('should display all configuration tabs', async ({ authenticatedPage }) => {
    await instanceConfigPage.navigateFromDetails();

    // Verify all tabs are visible
    await expect(instanceConfigPage.llmTab).toBeVisible();
    await expect(instanceConfigPage.skillsTab).toBeVisible();
    await expect(instanceConfigPage.toolsTab).toBeVisible();
    await expect(instanceConfigPage.promptTab).toBeVisible();
    await expect(instanceConfigPage.limitsTab).toBeVisible();
  });

  test.describe('LLM Configuration', () => {
    test.beforeEach(async ({ authenticatedPage }) => {
      await instanceConfigPage.navigateFromDetails();
      await instanceConfigPage.switchToLLMTab();
    });

    test('should display LLM configuration fields', async () => {
      // Verify LLM config fields are visible
      await expect(instanceConfigPage.apiKeyInput).toBeVisible();
      await expect(instanceConfigPage.apiBaseInput).toBeVisible();
      await expect(instanceConfigPage.modelInput).toBeVisible();
      await expect(instanceConfigPage.temperatureInput).toBeVisible();
      await expect(instanceConfigPage.maxTokensInput).toBeVisible();
    });

    test('should update LLM configuration', async ({ authenticatedPage }) => {
      // Update LLM config
      await instanceConfigPage.updateLLMConfig({
        apiKey: 'sk-new-test-key',
        model: 'deepseek-chat-new',
        temperature: 0.8,
        maxTokens: 8000,
      });

      // Verify save button is enabled
      await expect(instanceConfigPage.saveButton).toBeEnabled();
    });

    test('should validate temperature range', async ({ authenticatedPage }) => {
      // Try to set invalid temperature
      await instanceConfigPage.temperatureInput.fill('3');

      // Should show validation error or disable save
      await expect(instanceConfigPage.saveButton).toBeDisabled();
    });
  });

  test.describe('Skills Management', () => {
    test.beforeEach(async ({ authenticatedPage }) => {
      await instanceConfigPage.navigateFromDetails();
      await instanceConfigPage.switchToSkillsTab();
    });

    test('should display all skills', async () => {
      // Verify skills are displayed
      const skillCount = await instanceConfigPage.skillCheckboxes.count();
      expect(skillCount).toBeGreaterThan(0);
    });

    test('should toggle skill enabled state', async ({ authenticatedPage }) => {
      // Get initial state
      const initialState = await instanceConfigPage.isSkillEnabled('code_helper');

      // Toggle skill
      await instanceConfigPage.toggleSkill('code_helper');

      // Verify state changed
      const newState = await instanceConfigPage.isSkillEnabled('code_helper');
      expect(newState).toBe(!initialState);
    });

    test('should enable skill', async ({ authenticatedPage }) => {
      await instanceConfigPage.enableSkill('code_helper');
      expect(await instanceConfigPage.isSkillEnabled('code_helper')).toBe(true);
    });

    test('should disable skill', async ({ authenticatedPage }) => {
      await instanceConfigPage.disableSkill('email_assistant');
      expect(await instanceConfigPage.isSkillEnabled('email_assistant')).toBe(false);
    });

    test('should prevent disabling all skills', async ({ authenticatedPage }) => {
      // Try to disable all skills
      const allDisabled = await instanceConfigPage.page.evaluate(() => {
        const checkboxes = document.querySelectorAll('input[id^="skill-"]');
        let allDisabled = true;
        checkboxes.forEach(cb => {
          (cb as HTMLInputElement).checked = false;
          allDisabled = allDisabled && !(cb as HTMLInputElement).checked;
        });
        return allDisabled;
      });

      // Should show validation error
      await expect(instanceConfigPage.saveButton).toBeDisabled();
    });
  });

  test.describe('Tools Management', () => {
    test.beforeEach(async ({ authenticatedPage }) => {
      await instanceConfigPage.navigateFromDetails();
      await instanceConfigPage.switchToToolsTab();
    });

    test('should display all tools', async () => {
      // Verify tools are displayed
      const toolCount = await instanceConfigPage.toolCheckboxes.count();
      expect(toolCount).toBeGreaterThan(0);
    });

    test('should toggle tool enabled state', async ({ authenticatedPage }) => {
      // Toggle tool
      await instanceConfigPage.toggleTool('exec');

      // Verify layer select is enabled when tool is enabled
      const layerSelect = instanceConfigPage.page.locator('select').first();
      await expect(layerSelect).toBeEnabled();
    });

    test('should update tool layer', async ({ authenticatedPage }) => {
      // Enable tool first
      await instanceConfigPage.toggleTool('exec');

      // Update layer
      await instanceConfigPage.updateToolLayer('exec', 2);

      // Verify layer was updated
      const layerSelect = instanceConfigPage.page.locator('select').first();
      const value = await layerSelect.inputValue();
      expect(value).toBe('2');
    });
  });

  test.describe('System Prompt', () => {
    test.beforeEach(async ({ authenticatedPage }) => {
      await instanceConfigPage.navigateFromDetails();
      await instanceConfigPage.switchToPromptTab();
    });

    test('should display system prompt editor', async () => {
      // Verify textarea is visible
      await expect(instanceConfigPage.systemPromptTextarea).toBeVisible();
    });

    test('should display character count', async () => {
      // Verify character count is displayed
      await expect(instanceConfigPage.promptCharCount).toBeVisible();

      const count = await instanceConfigPage.getPromptCharCount();
      expect(count).toBeGreaterThanOrEqual(0);
    });

    test('should update system prompt', async ({ authenticatedPage }) => {
      const newPrompt = 'You are a specialized AI assistant for data analysis.';

      await instanceConfigPage.updateSystemPrompt(newPrompt);

      // Verify prompt was updated
      const currentPrompt = await instanceConfigPage.getSystemPrompt();
      expect(currentPrompt).toBe(newPrompt);
    });

    test('should validate prompt length', async () => {
      // Try to set too short prompt
      await instanceConfigPage.updateSystemPrompt('short');

      // Should show validation error
      const errorMsg = await instanceConfigPage.page.locator('text=/至少需要 10 个字符/i').isVisible();
      expect(errorMsg).toBe(true);
    });
  });

  test.describe('Usage Limits', () => {
    test.beforeEach(async ({ authenticatedPage }) => {
      await instanceConfigPage.navigateFromDetails();
      await instanceConfigPage.switchToLimitsTab();
    });

    test('should display usage limits fields', async () => {
      // Verify limit fields are visible
      await expect(instanceConfigPage.maxMessagesInput).toBeVisible();
      await expect(instanceConfigPage.maxStorageInput).toBeVisible();
    });

    test('should update usage limits', async ({ authenticatedPage }) => {
      await instanceConfigPage.updateLimits({
        maxMessages: 500,
        maxStorage: 1000,
      });

      // Verify values were updated
      const messages = await instanceConfigPage.maxMessagesInput.inputValue();
      expect(messages).toBe('500');
    });
  });

  test.describe('Save and Cancel', () => {
    test.beforeEach(async ({ authenticatedPage }) => {
      await instanceConfigPage.navigateFromDetails();
    });

    test('should save configuration changes', async ({ authenticatedPage }) => {
      // Make changes
      await instanceConfigPage.switchToLLMTab();
      await instanceConfigPage.updateLLMConfig({
        temperature: 0.9,
      });

      // Save
      await instanceConfigPage.saveConfig();

      // Verify success message
      await expect(instanceConfigPage.successMessage).toBeVisible();
      await expect(instanceConfigPage.successMessage).toContainText(/成功|saved/i);
    });

    test('should cancel configuration changes', async ({ authenticatedPage }) => {
      // Make changes
      await instanceConfigPage.switchToLLMTab();
      await instanceConfigPage.updateLLMConfig({
        temperature: 0.9,
      });

      // Cancel
      await instanceConfigPage.cancelChanges();

      // Verify changes were reverted (temperature should be back to original)
      const tempValue = await instanceConfigPage.temperatureInput.inputValue();
      expect(tempValue).not.toBe('0.9');
    });

    test('should reset to default configuration', async ({ authenticatedPage }) => {
      // Make changes
      await instanceConfigPage.switchToLLMTab();
      await instanceConfigPage.updateLLMConfig({
        temperature: 0.9,
      });

      // Reset
      await instanceConfigPage.resetToDefault();

      // Verify changes were reset
      const tempValue = await instanceConfigPage.temperatureInput.inputValue();
      expect(tempValue).not.toBe('0.9');
    });
  });

  test.describe('Navigation', () => {
    test('should navigate back to instance details', async ({ authenticatedPage }) => {
      await instanceConfigPage.navigateFromDetails();

      // Go back
      await instanceConfigPage.goBack();

      // Verify navigation
      const currentUrl = authenticatedPage.url();
      expect(currentUrl).toContain('/instances/');
      expect(currentUrl).not.toContain('/config');
    });
  });

  test.describe('Error Handling', () => {
    test('should display validation errors', async ({ authenticatedPage }) => {
      await instanceConfigPage.navigateFromDetails();
      await instanceConfigPage.switchToLLMTab();

      // Set invalid values
      await instanceConfigPage.updateLLMConfig({
        apiKey: '', // Empty API key
      });

      // Try to save
      await instanceConfigPage.saveConfig();

      // Verify error message
      await expect(instanceConfigPage.errorMessage).toBeVisible();
    });

    test('should handle API errors gracefully', async ({ authenticatedPage }) => {
      await instanceConfigPage.navigateFromDetails();

      // Make changes
      await instanceConfigPage.switchToLLMTab();
      await instanceConfigPage.updateLLMConfig({
        temperature: 0.8,
      });

      // Mock API error
      await authenticatedPage.route('**/api/instances/*/config', route => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Internal server error' }),
        });
      });

      // Try to save
      await instanceConfigPage.saveConfig();

      // Verify error message
      await expect(instanceConfigPage.errorMessage).toBeVisible();
    });
  });
});
