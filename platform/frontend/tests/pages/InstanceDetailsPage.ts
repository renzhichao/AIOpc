 
import { Page, expect } from '@playwright/test';

/**
 * Instance Details Page Object Model
 *
 * Encapsulates all interactions with the instance details page including
 * viewing instance information, managing instance state (start/stop), and
 * deleting instances.
 */
export class InstanceDetailsPage {
  readonly page: Page;

  // Selectors
  private readonly selectors = {
    container: '[data-testid="instance-details-container"]',
    header: '[data-testid="instance-name"]', // Use instance-name as heading since no dedicated header exists
    backButton: '[data-testid="back-button"]',
    instanceName: '[data-testid="instance-name"]',
    instanceId: '[data-testid="instance-id"]',
    instanceStatus: '[data-testid="instance-status"]',
    instanceTemplate: '[data-testid="instance-template"]',
    createdAt: '[data-testid="created-at"]',
    expiresAt: '[data-testid="expires-at"]',
    startButton: '[data-testid="start-button"]',
    stopButton: '[data-testid="stop-button"]',
    restartButton: '[data-testid="restart-button"]',
    deleteButton: '[data-testid="delete-button"]',
    confirmModal: '[data-testid="confirm-modal"]',
    confirmButton: '[data-testid="confirm-button"]',
    cancelButton: '[data-testid="cancel-button"]',
    loading: '[data-testid="instance-loading"]',
    error: '[data-testid="instance-error"]',
    successMessage: '[data-testid="success-message"]',
    stats: '[data-testid="instance-stats"]',
    healthStatus: '[data-testid="health-status"]',
  };

  // Getters for test locators
  get heading() {
    return this.page.locator(this.selectors.header);
  }

  get deleteButton() {
    return this.page.locator(this.selectors.deleteButton);
  }

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Navigate to instance details page
   */
  async goto(instanceId: string) {
    const url = `/instances/${instanceId}`;

    // Force a full page reload to avoid React Router client-side navigation issues
    await this.page.goto(url, { waitUntil: 'commit' });

    // Wait for the instance details page to load
    await this.waitForLoad();
  }

  /**
   * Wait for the instance details page to load
   */
  async waitForLoad() {
    // Wait for URL to be instance details pattern
    await this.page.waitForURL(/\/instances\/[^/]+$/, { timeout: 10000 });

    // Wait for React to render ANY content (based on working minimal test)
    try {
      await this.page.waitForFunction(() => {
        const root = document.querySelector('#root');
        return root && root.innerHTML.length > 100;
      }, { timeout: 10000 });
    } catch {
      // If React doesn't render, try reloading once
      console.log('[DEBUG] React not rendering, reloading...');
      await this.page.reload({ waitUntil: 'commit' });

      await this.page.waitForFunction(() => {
        const root = document.querySelector('#root');
        return root && root.innerHTML.length > 100;
      }, { timeout: 10000 });
    }

    // Wait for the instance details container
    await this.page.waitForSelector(this.selectors.container, { timeout: 15000 });

    // Wait for instance name to be visible (this is the actual h1 heading)
    await this.page.waitForSelector(this.selectors.instanceName, { state: 'visible', timeout: 10000 });
  }

  /**
   * Get instance name
   */
  async getInstanceName(): Promise<string> {
    // No need to wait here since waitForLoad already waits for instanceName
    const element = await this.page.$(this.selectors.instanceName);
    if (!element) throw new Error('Instance name not found');
    const text = await element.textContent();
    return text || '';
  }

  /**
   * Get instance status
   */
  async getInstanceStatus(): Promise<string> {
    // No need to wait here since waitForLoad already waited for the container
    const element = await this.page.$(this.selectors.instanceStatus);
    if (!element) throw new Error('Instance status not found');
    const text = await element.textContent();
    return text || '';
  }

  /**
   * Get instance ID
   */
  async getInstanceId(): Promise<string> {
    const element = await this.page.$(this.selectors.instanceId);
    if (!element) throw new Error('Instance ID not found');
    const text = await element.textContent();
    return text || '';
  }

  /**
   * Click start button
   */
  async startInstance() {
    await this.page.click(this.selectors.startButton);
    await this.waitForOperation();
  }

  /**
   * Click stop button
   */
  async stopInstance() {
    await this.page.click(this.selectors.stopButton);
    await this.waitForOperation();
  }

  /**
   * Click restart button
   */
  async restartInstance() {
    await this.page.click(this.selectors.restartButton);
    await this.waitForOperation();
  }

  /**
   * Click delete button
   */
  async clickDelete() {
    await this.page.click(this.selectors.deleteButton);
    // Should show confirmation modal
    await this.page.waitForSelector(this.selectors.confirmModal);
  }

  /**
   * Confirm delete operation
   */
  async confirmDelete() {
    await this.page.click(this.selectors.confirmButton);
    await this.page.waitForURL('/instances');
  }

  /**
   * Cancel delete operation
   */
  async cancelDelete() {
    await this.page.click(this.selectors.cancelButton);
    // Modal should disappear
    await this.page.waitForSelector(this.selectors.confirmModal, {
      state: 'hidden'
    });
  }

  /**
   * Go back to instances list
   */
  async goBack() {
    await this.page.click(this.selectors.backButton);
    await this.page.waitForURL('/instances');
  }

  /**
   * Check if start button is enabled
   */
  async isStartButtonEnabled(): Promise<boolean> {
    // Button may not exist if it's not rendered for current instance state
    const count = await this.page.locator(this.selectors.startButton).count();
    if (count === 0) return false;

    const button = await this.page.$(this.selectors.startButton);
    if (!button) return false;
    const disabled = await button.isDisabled();
    return !disabled;
  }

  /**
   * Check if stop button is enabled
   */
  async isStopButtonEnabled(): Promise<boolean> {
    // Button may not exist if it's not rendered for current instance state
    const count = await this.page.locator(this.selectors.stopButton).count();
    if (count === 0) return false;

    const button = await this.page.$(this.selectors.stopButton);
    if (!button) return false;
    const disabled = await button.isDisabled();
    return !disabled;
  }

  /**
   * Check if delete button is enabled
   */
  async isDeleteButtonEnabled(): Promise<boolean> {
    // Button may not exist if it's not rendered for current instance state
    const count = await this.page.locator(this.selectors.deleteButton).count();
    if (count === 0) return false;

    const button = await this.page.$(this.selectors.deleteButton);
    if (!button) return false;
    const disabled = await button.isDisabled();
    return !disabled;
  }

  /**
   * Get error message if present
   */
  async getErrorMessage(): Promise<string | null> {
    const element = await this.page.$(this.selectors.error);
    if (!element) return null;
    return await element.textContent();
  }

  /**
   * Get success message if present
   */
  async getSuccessMessage(): Promise<string | null> {
    const element = await this.page.$(this.selectors.successMessage);
    if (!element) return null;
    return await element.textContent();
  }

  /**
   * Verify instance details are displayed
   */
  async verifyInstanceDetails() {
    await expect(this.page.locator(this.selectors.instanceName)).toBeVisible();
    await expect(this.page.locator(this.selectors.instanceStatus)).toBeVisible();
    await expect(this.page.locator(this.selectors.instanceTemplate)).toBeVisible();
  }

  /**
   * Wait for operation to complete
   */
  private async waitForOperation(timeout = 10000) {
    // Wait for loading to appear and disappear
    try {
      await this.page.waitForSelector(this.selectors.loading, { timeout: 2000 });
      await this.page.waitForSelector(this.selectors.loading, {
        state: 'hidden',
        timeout
      });
    } catch {
      // Loading might not appear if operation is fast
    }
  }

  /**
   * Check if user is on instance details page
   */
  async isOnInstanceDetails(): Promise<boolean> {
    const url = this.page.url();
    return /\/instances\/[^/]+$/.test(url);
  }
}
