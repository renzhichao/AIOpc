import { Page, expect } from '@playwright/test';

/**
 * Page Object Model for Instance Details Page
 *
 * Encapsulates interactions with individual instance management page
 */
export class InstanceDetailsPage {
  readonly page: Page;

  // Page elements
  readonly heading;
  readonly instanceName;
  readonly instanceDescription;
  readonly instanceTemplate;
  readonly instanceStatus;
  readonly instanceCreatedAt;
  readonly startButton;
  readonly stopButton;
  readonly deleteButton;
  readonly confirmDeleteButton;
  readonly cancelButton;
  readonly backButton;
  readonly loadingSpinner;
  readonly errorMessage;
  readonly successMessage;

  constructor(page: Page) {
    this.page = page;

    // Initialize locators
    this.heading = page.getByRole('heading', { name: /instance details|实例详情/i });
    this.instanceName = page.locator('[data-testid="instance-name"]');
    this.instanceDescription = page.locator('[data-testid="instance-description"]');
    this.instanceTemplate = page.locator('[data-testid="instance-template"]');
    this.instanceStatus = page.locator('[data-testid="instance-status"]');
    this.instanceCreatedAt = page.locator('[data-testid="instance-created-at"]');
    this.startButton = page.getByRole('button', { name: /start|启动/i });
    this.stopButton = page.getByRole('button', { name: /stop|停止/i });
    this.deleteButton = page.getByRole('button', { name: /delete|删除/i });
    this.confirmDeleteButton = page.getByRole('button', { name: /confirm|确认/i });
    this.cancelButton = page.getByRole('button', { name: /cancel|取消/i });
    this.backButton = page.getByRole('button', { name: /back|返回/i });
    this.loadingSpinner = page.locator('[data-testid="loading-spinner"]');
    this.errorMessage = page.locator('[data-testid="error-message"]');
    this.successMessage = page.locator('[data-testid="success-message"]');
  }

  /**
   * Navigate to instance details page
   */
  async goto(instanceId: string) {
    await this.page.goto(`/instances/${instanceId}`);
    await this.waitForLoad();
  }

  /**
   * Wait for page to fully load
   */
  async waitForLoad() {
    await this.page.waitForLoadState('networkidle');
    await expect(this.heading).toBeVisible({ timeout: 10000 });
  }

  /**
   * Get instance name
   */
  async getInstanceName(): Promise<string> {
    await this.instanceName.waitFor({ state: 'visible' });
    return (await this.instanceName.textContent()) || '';
  }

  /**
   * Get instance description
   */
  async getInstanceDescription(): Promise<string> {
    await this.instanceDescription.waitFor({ state: 'visible' });
    return (await this.instanceDescription.textContent()) || '';
  }

  /**
   * Get instance template
   */
  async getInstanceTemplate(): Promise<string> {
    await this.instanceTemplate.waitFor({ state: 'visible' });
    return (await this.instanceTemplate.textContent()) || '';
  }

  /**
   * Get instance status
   */
  async getInstanceStatus(): Promise<string> {
    await this.instanceStatus.waitFor({ state: 'visible' });
    return (await this.instanceStatus.textContent()) || '';
  }

  /**
   * Start instance
   */
  async startInstance() {
    await this.startButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Stop instance
   */
  async stopInstance() {
    await this.stopButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Delete instance (with confirmation)
   */
  async deleteInstance() {
    await this.deleteButton.click();
    // Wait for confirmation modal
    await expect(this.confirmDeleteButton).toBeVisible({ timeout: 5000 });
    await this.confirmDeleteButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Cancel delete operation
   */
  async cancelDelete() {
    await this.deleteButton.click();
    await expect(this.cancelButton).toBeVisible({ timeout: 5000 });
    await this.cancelButton.click();
  }

  /**
   * Navigate back to instances list
   */
  async goBack() {
    await this.backButton.click();
    await this.page.waitForURL('**/instances', { timeout: 5000 });
  }

  /**
   * Check if start button is enabled
   */
  async isStartButtonEnabled(): Promise<boolean> {
    const isEnabled = await this.startButton.isEnabled();
    return isEnabled;
  }

  /**
   * Check if stop button is enabled
   */
  async isStopButtonEnabled(): Promise<boolean> {
    const isEnabled = await this.stopButton.isEnabled();
    return isEnabled;
  }

  /**
   * Check if delete button is enabled
   */
  async isDeleteButtonEnabled(): Promise<boolean> {
    const isEnabled = await this.deleteButton.isEnabled();
    return isEnabled;
  }

  /**
   * Wait for status change
   */
  async waitForStatusChange(expectedStatus: string, timeout = 15000) {
    await this.page.waitForSelector(
      `[data-testid="instance-status"]:has-text("${expectedStatus}")`,
      { timeout }
    );
  }

  /**
   * Get error message if present
   */
  async getErrorMessage(): Promise<string | null> {
    if (await this.errorMessage.isVisible({ timeout: 3000 })) {
      return await this.errorMessage.textContent();
    }
    return null;
  }

  /**
   * Get success message if present
   */
  async getSuccessMessage(): Promise<string | null> {
    if (await this.successMessage.isVisible({ timeout: 3000 })) {
      return await this.successMessage.textContent();
    }
    return null;
  }

  /**
   * Check if instance is in running state
   */
  async isRunning(): Promise<boolean> {
    const status = await this.getInstanceStatus();
    return status.toLowerCase().includes('running') || status.includes('运行中');
  }

  /**
   * Check if instance is in stopped state
   */
  async isStopped(): Promise<boolean> {
    const status = await this.getInstanceStatus();
    return status.toLowerCase().includes('stopped') || status.includes('已停止');
  }
}
