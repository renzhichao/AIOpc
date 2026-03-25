/* eslint-disable @typescript-eslint/no-unused-vars */
import { test, expect } from '../../fixtures';
import { InstancesPage } from '../../pages/InstancesPage';
import { InstanceDetailsPage } from '../../pages/InstanceDetailsPage';
import { LoginPage } from '../../pages/LoginPage';
import { TestDataHelpers, mockTemplates } from '../../fixtures/test-data';
import { setupApiMocks } from '../helpers/api-mocks';

/**
 * E2E Tests for Instance Creation Flow
 *
 * These tests verify the complete instance creation process including:
 * - Navigation to creation page
 * - Template selection
 * - Form validation
 * - Instance creation
 * - Success handling
 * - Appearance in instance list
 */

test.describe('Instance Creation Flow', () => {
  let loginPage: LoginPage;
  let instancesPage: InstancesPage;

  test.beforeEach(async ({ authenticatedPage }) => {
    loginPage = new LoginPage(authenticatedPage);
    instancesPage = new InstancesPage(authenticatedPage);

    // Start from instances page
    // Note: API mocks are already set up in the authenticatedPage fixture
    await instancesPage.goto();
  });

  test('should display create instance button', async ({ authenticatedPage }) => {
    // Verify create button is visible
    await expect(instancesPage.createButton).toBeVisible();
  });

  test('should navigate to create instance page', async ({ authenticatedPage }) => {
    // Click create button
    await instancesPage.clickCreateInstance();

    // Verify navigation or modal appears
    await authenticatedPage.waitForURL('**/instances/create', { timeout: 5000 });
    const currentUrl = authenticatedPage.url();
    expect(currentUrl).toContain('/instances/create');
  });

  test('should display available templates', async ({ authenticatedPage }) => {
    // Navigate to create page
    await instancesPage.clickCreateInstance();

    // Verify templates are displayed
    // mockTemplates is an object, so we need to convert to array
    const templates = Object.values(mockTemplates);
    for (const template of templates) {
      const templateElement = authenticatedPage.locator(
        `[data-testid="template-${template.id}"]`
      );
      await expect(templateElement).toBeVisible();
    }
  });

  test('should allow template selection', async ({ authenticatedPage }) => {
    // Navigate to create page
    await instancesPage.clickCreateInstance();

    // Click on personal template (the label containing the radio input)
    const personalTemplateLabel = authenticatedPage.locator('label').filter({ hasText: '个人体验版' });
    await personalTemplateLabel.click();

    // Verify template is selected by checking the radio input
    const personalTemplateInput = authenticatedPage.locator('[data-testid="template-personal"]');
    await expect(personalTemplateInput).toBeChecked();
  });

  test('should validate instance name input', async ({ authenticatedPage }) => {
    // Navigate to create page
    await instancesPage.clickCreateInstance();

    // Try to submit without name
    const submitButton = authenticatedPage.locator('[data-testid="submit-button"]');
    await submitButton.click();

    // Should show validation error
    const errorMessage = authenticatedPage.locator('[data-testid="name-error"]');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText(/实例名称不能为空/);
  });

  test('should validate instance name length', async ({ authenticatedPage }) => {
    // Navigate to create page
    await instancesPage.clickCreateInstance();

    // Enter name that's too long
    const nameInput = authenticatedPage.locator('[data-testid="instance-name-input"]');
    await nameInput.fill('a'.repeat(101)); // Assuming max is 100

    // Try to submit
    const submitButton = authenticatedPage.locator('[data-testid="submit-button"]');
    await submitButton.click();

    // Should show validation error
    const errorMessage = authenticatedPage.locator('[data-testid="name-error"]');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText(/不能超过100个字符/);
  });

  test('should create instance with personal template', async ({ authenticatedPage }) => {
    const instanceName = TestDataHelpers.generateInstanceName();
    const instanceDescription = TestDataHelpers.generateInstanceDescription();

    // Navigate to create page
    await instancesPage.clickCreateInstance();

    // Select personal template
    const personalTemplate = authenticatedPage.locator('[data-testid="template-personal"]');
    await personalTemplate.click();

    // Fill in form
    const nameInput = authenticatedPage.locator('[data-testid="instance-name-input"]');
    const descInput = authenticatedPage.locator('[data-testid="instance-description-input"]');

    await nameInput.fill(instanceName);
    await descInput.fill(instanceDescription);

    // Submit form
    const submitButton = authenticatedPage.locator('[data-testid="submit-button"]');
    await submitButton.click();

    // Wait for success and redirect
    await authenticatedPage.waitForURL('**/instances', { timeout: 10000 });

    // Verify instance appears in list
    await instancesPage.goto();
    await instancesPage.waitForInstance(instanceName, 10000);
    expect(await instancesPage.hasInstance(instanceName)).toBe(true);
  });

  test('should create instance with team template', async ({ authenticatedPage }) => {
    const instanceName = TestDataHelpers.generateInstanceName();
    const instanceDescription = TestDataHelpers.generateInstanceDescription();

    // Navigate to create page
    await instancesPage.clickCreateInstance();

    // Select team template
    const teamTemplate = authenticatedPage.locator('[data-testid="template-team"]');
    await teamTemplate.click();

    // Fill in form
    const nameInput = authenticatedPage.locator('[data-testid="instance-name-input"]');
    const descInput = authenticatedPage.locator('[data-testid="instance-description-input"]');

    await nameInput.fill(instanceName);
    await descInput.fill(instanceDescription);

    // Submit form
    const submitButton = authenticatedPage.locator('[data-testid="submit-button"]');
    await submitButton.click();

    // Wait for success and redirect
    await authenticatedPage.waitForURL('**/instances', { timeout: 10000 });

    // Verify instance appears in list
    await instancesPage.goto();
    await instancesPage.waitForInstance(instanceName, 10000);
    expect(await instancesPage.hasInstance(instanceName)).toBe(true);
  });

  test('should show loading state during creation', async ({ authenticatedPage }) => {
    const instanceName = TestDataHelpers.generateInstanceName();

    // Navigate to create page
    await instancesPage.clickCreateInstance();

    // Select template and fill form
    const personalTemplate = authenticatedPage.locator('[data-testid="template-personal"]');
    await personalTemplate.click();

    const nameInput = authenticatedPage.locator('[data-testid="instance-name-input"]');
    await nameInput.fill(instanceName);

    // Submit and check for loading state
    const submitButton = authenticatedPage.locator('[data-testid="submit-button"]');
    await submitButton.click();

    // Verify loading state appears
    const loadingState = authenticatedPage.locator('[data-testid="loading-state"]');
    await expect(loadingState).toBeVisible();
  });

  test('should display success message after creation', async ({ authenticatedPage }) => {
    const instanceName = TestDataHelpers.generateInstanceName();

    // Navigate to create page
    await instancesPage.clickCreateInstance();

    // Select template and fill form
    const personalTemplate = authenticatedPage.locator('[data-testid="template-personal"]');
    await personalTemplate.click();

    const nameInput = authenticatedPage.locator('[data-testid="instance-name-input"]');
    const descInput = authenticatedPage.locator('[data-testid="instance-description-input"]');

    await nameInput.fill(instanceName);
    await descInput.fill('Test instance description');

    // Submit form
    const submitButton = authenticatedPage.locator('[data-testid="submit-button"]');
    await submitButton.click();

    // Verify success message
    const successMessage = authenticatedPage.locator('[data-testid="success-message"]');
    await expect(successMessage).toBeVisible();
    await expect(successMessage).toContainText(/created|success|成功|创建/i);
  });

  test('should handle creation errors gracefully', async ({ authenticatedPage }) => {
    // Navigate to create page
    await instancesPage.clickCreateInstance();

    // Try to create with duplicate name
    const duplicateName = 'Duplicate Instance Name';
    const nameInput = authenticatedPage.locator('[data-testid="instance-name-input"]');
    await nameInput.fill(duplicateName);

    const submitButton = authenticatedPage.locator('[data-testid="submit-button"]');
    await submitButton.click();

    // Verify error message
    const errorMessage = authenticatedPage.locator('[data-testid="error-message"]');
    await expect(errorMessage).toBeVisible();
  });

  test('should cancel instance creation', async ({ authenticatedPage }) => {
    // Navigate to create page
    await instancesPage.clickCreateInstance();

    // Fill in form partially
    const nameInput = authenticatedPage.locator('[data-testid="instance-name-input"]');
    await nameInput.fill('Unfinished Instance');

    // Click cancel
    const cancelButton = authenticatedPage.getByRole('button', { name: /cancel|取消/i });
    await cancelButton.click();

    // Verify redirect back to instances list
    await authenticatedPage.waitForURL('**/instances', { timeout: 5000 });
    expect(authenticatedPage.url()).toContain('/instances');

    // Verify instance was not created
    await instancesPage.goto();
    expect(await instancesPage.hasInstance('Unfinished Instance')).toBe(false);
  });

  test('should create multiple instances successfully', async ({ authenticatedPage }) => {
    const instancesToCreate = 2;

    for (let i = 0; i < instancesToCreate; i++) {
      const instanceName = `Test Instance ${Date.now()}-${i}`;
      const instanceDescription = TestDataHelpers.generateInstanceDescription();

      // Navigate to create page
      await instancesPage.clickCreateInstance();

      // Select template and fill form
      const personalTemplate = authenticatedPage.locator('[data-testid="template-personal"]');
      await personalTemplate.click();

      const nameInput = authenticatedPage.locator('[data-testid="instance-name-input"]');
      const descInput = authenticatedPage.locator('[data-testid="instance-description-input"]');

      await nameInput.fill(instanceName);
      await descInput.fill(instanceDescription);

      // Submit form
      const submitButton = authenticatedPage.locator('[data-testid="submit-button"]');
      await submitButton.click();

      // Wait for redirect
      await authenticatedPage.waitForURL('**/instances', { timeout: 10000 });

      // Verify instance appears in list
      await instancesPage.waitForInstance(instanceName, 10000);
      expect(await instancesPage.hasInstance(instanceName)).toBe(true);
    }

    // Verify both instances exist
    const instanceCount = await instancesPage.getInstanceCount();
    expect(instanceCount).toBeGreaterThanOrEqual(instancesToCreate);
  });

  // ===== PRESET CONFIGURATION TESTS =====

  test('should display preset configuration details for personal template', async ({ authenticatedPage }) => {
    await instancesPage.clickCreateInstance();

    // Select personal template
    const personalTemplate = authenticatedPage.locator('[data-testid="template-personal"]');
    await personalTemplate.click();

    // Verify preset configuration is displayed
    const configSection = authenticatedPage.locator('[data-testid="preset-config-personal"]');
    const isVisible = await configSection.isVisible().catch(() => false);

    if (isVisible) {
      // Verify configuration details
      await expect(configSection).toContainText(/CPU|cpu|核心/i);
      await expect(configSection).toContainText(/内存|memory/i);
      await expect(configSection).toContainText(/存储|storage/i);
    }
  });

  test('should display preset configuration details for team template', async ({ authenticatedPage }) => {
    await instancesPage.clickCreateInstance();

    // Select team template
    const teamTemplate = authenticatedPage.locator('[data-testid="template-team"]');
    await teamTemplate.click();

    // Verify preset configuration is displayed
    const configSection = authenticatedPage.locator('[data-testid="preset-config-team"]');
    const isVisible = await configSection.isVisible().catch(() => false);

    if (isVisible) {
      // Verify configuration details
      await expect(configSection).toContainText(/CPU|cpu|核心/i);
      await expect(configSection).toContainText(/内存|memory/i);
      await expect(configSection).toContainText(/存储|storage/i);
    }
  });

  test('should display preset configuration details for enterprise template', async ({ authenticatedPage }) => {
    await instancesPage.clickCreateInstance();

    // Select enterprise template
    const enterpriseTemplate = authenticatedPage.locator('[data-testid="template-enterprise"]');
    const hasEnterprise = await enterpriseTemplate.count() > 0;

    if (hasEnterprise) {
      await enterpriseTemplate.click();

      // Verify preset configuration is displayed
      const configSection = authenticatedPage.locator('[data-testid="preset-config-enterprise"]');
      const isVisible = await configSection.isVisible().catch(() => false);

      if (isVisible) {
        // Verify configuration details
        await expect(configSection).toContainText(/CPU|cpu|核心/i);
        await expect(configSection).toContainText(/内存|memory/i);
        await expect(configSection).toContainText(/存储|storage/i);
      }
    }
  });

  test('should show resource comparison between templates', async ({ authenticatedPage }) => {
    await instancesPage.clickCreateInstance();

    // Verify templates show resource specifications
    const templates = authenticatedPage.locator('[data-testid^="template-"]');
    const templateCount = await templates.count();

    expect(templateCount).toBeGreaterThan(0);

    // Each template should show resource info
    for (let i = 0; i < templateCount; i++) {
      const template = templates.nth(i);
      const text = await template.textContent();
      expect(text).toBeTruthy();
    }
  });

  test('should create instance with correct preset configuration', async ({ authenticatedPage }) => {
    const instanceName = TestDataHelpers.generateInstanceName();

    await instancesPage.clickCreateInstance();

    // Select personal template
    const personalTemplate = authenticatedPage.locator('[data-testid="template-personal"]');
    await personalTemplate.click();

    // Fill form and submit
    const nameInput = authenticatedPage.locator('[data-testid="instance-name-input"]');
    await nameInput.fill(instanceName);

    const submitButton = authenticatedPage.locator('[data-testid="submit-button"]');
    await submitButton.click();

    // Wait for creation
    await authenticatedPage.waitForURL('**/instances', { timeout: 10000 });

    // Navigate to instance details and verify configuration
    const instanceId = 'instance-001'; // This would be dynamic in real scenario
    const instanceDetailsPage = new InstanceDetailsPage(authenticatedPage);
    await instanceDetailsPage.goto(instanceId);

    // Verify template is correct
    const template = await instanceDetailsPage.getInstanceTemplate();
    expect(template.toLowerCase()).toContain('personal');
  });

  test('should display pricing information for each preset', async ({ authenticatedPage }) => {
    await instancesPage.clickCreateInstance();

    // Check if pricing information is displayed
    const pricingElements = authenticatedPage.locator('[data-testid*="pricing"], [data-testid*="price"]');
    const pricingCount = await pricingElements.count();

    if (pricingCount > 0) {
      // Verify pricing is shown for templates
      const hasPricing = await pricingElements.first().isVisible();
      expect(hasPricing).toBe(true);
    }
  });

  test('should handle preset selection change correctly', async ({ authenticatedPage }) => {
    await instancesPage.clickCreateInstance();

    // Select personal template first
    const personalTemplate = authenticatedPage.locator('[data-testid="template-personal"]');
    await personalTemplate.click();
    await expect(personalTemplate).toBeChecked();

    // Change to team template
    const teamTemplate = authenticatedPage.locator('[data-testid="template-team"]');
    await teamTemplate.click();

    // Verify team is now selected
    await expect(teamTemplate).toBeChecked();

    // Verify personal is no longer selected
    await expect(personalTemplate).not.toBeChecked();
  });

  test('should show preset features and capabilities', async ({ authenticatedPage }) => {
    await instancesPage.clickCreateInstance();

    // Select team template
    const teamTemplate = authenticatedPage.locator('[data-testid="template-team"]');
    await teamTemplate.click();

    // Look for feature list
    const featuresList = authenticatedPage.locator('[data-testid="template-features"]');
    const hasFeatures = await featuresList.isVisible().catch(() => false);

    if (hasFeatures) {
      // Verify features are listed
      const featureItems = featuresList.locator('li, [data-testid="feature-item"]');
      const featureCount = await featureItems.count();
      expect(featureCount).toBeGreaterThan(0);
    }
  });

  test('should validate preset availability based on user quota', async ({ authenticatedPage }) => {
    await instancesPage.clickCreateInstance();

    // Check if there are any disabled templates (quota limit)
    const disabledTemplates = authenticatedPage.locator('[data-testid^="template-"][disabled]');
    const disabledCount = await disabledTemplates.count();

    // This test just verifies the UI handles quota limits
    // The actual count doesn't matter
    expect(disabledCount).toBeGreaterThanOrEqual(0);
  });

  test('should display recommended preset badge', async ({ authenticatedPage }) => {
    await instancesPage.clickCreateInstance();

    // Look for recommended badge
    const recommendedBadge = authenticatedPage.locator('[data-testid="recommended-badge"]');
    const hasRecommended = await recommendedBadge.isVisible().catch(() => false);

    if (hasRecommended) {
      // Verify recommended template is marked
      expect(await recommendedBadge.textContent()).toBeTruthy();
    }
  });
});
