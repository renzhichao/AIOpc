 
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
  readonly renewButton;
  readonly renewModal;
  readonly renewButton30Days;
  readonly renewButton90Days;
  readonly renewButton180Days;
  readonly renewalHistoryButton;
  readonly renewalHistorySection;
  readonly configButton;

  constructor(page: Page) {
    this.page = page;

    // Initialize locators - use data-testid selectors for reliability
    this.heading = page.getByRole('heading', { name: /instance details|实例详情/i });
    this.instanceName = page.locator('[data-testid="instance-name"]');
    this.instanceDescription = page.locator('[data-testid="instance-description"]');
    this.instanceTemplate = page.locator('[data-testid="instance-template"]');
    this.instanceStatus = page.locator('[data-testid="instance-status"]');
    this.instanceCreatedAt = page.locator('[data-testid="instance-created-at"]');
    this.startButton = page.locator('[data-testid="start-button"]');
    this.stopButton = page.locator('[data-testid="stop-button"]');
    this.deleteButton = page.locator('[data-testid="delete-button"]');
    this.confirmDeleteButton = page.getByRole('button', { name: /confirm|确认/i });
    this.cancelButton = page.getByRole('button', { name: /cancel|取消/i });
    this.backButton = page.locator('[data-testid="back-button"]');
    this.loadingSpinner = page.locator('[data-testid="loading-spinner"]');
    this.errorMessage = page.locator('[data-testid="error-message"]');
    this.successMessage = page.locator('[data-testid="success-message"]');
    this.renewButton = page.locator('[data-testid="renew-button"]');
    this.renewModal = page.locator('[data-testid="renew-modal"]');
    this.renewButton30Days = page.getByRole('button', { name: /续费 1 个月|续费 30 天/i });
    this.renewButton90Days = page.getByRole('button', { name: /续费 3 个月|续费 90 天/i });
    this.renewButton180Days = page.getByRole('button', { name: /续费 6 个月|续费 180 天/i });
    this.renewalHistoryButton = page.getByRole('button', { name: /查看续费历史|renewal history/i });
    this.renewalHistorySection = page.locator('[data-testid="renewal-history-section"]');
    this.configButton = page.locator('[data-testid="config-button"]');
  }

  /**
   * Navigate to instance details page
   */
  async goto(instanceId: string) {
    await this.page.goto(`/instances/${instanceId}`, { waitUntil: 'commit' });
    await this.waitForLoad();
  }

  /**
   * Wait for page to fully load
   */
  async waitForLoad() {
    // Wait for URL to match instance details pattern
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
    await this.page.waitForSelector('[data-testid="instance-details-container"]', { timeout: 15000 });

    // Wait for instance name to be visible (this is the actual h1 heading)
    await this.instanceName.waitFor({ state: 'visible', timeout: 10000 });
  }

  /**
   * Get instance name
   */
  async getInstanceName(): Promise<string> {
    // No need to wait here since waitForLoad already waits for instanceName
    const text = await this.instanceName.textContent();
    return text || '';
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
    // No need to wait here since waitForLoad already waited for the container
    const text = await this.instanceStatus.textContent();
    return text || '';
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
    // Button may not exist if it's not rendered for current instance state
    const count = await this.startButton.count();
    if (count === 0) return false;

    const isEnabled = await this.startButton.isEnabled();
    return isEnabled;
  }

  /**
   * Check if stop button is enabled
   */
  async isStopButtonEnabled(): Promise<boolean> {
    // Button may not exist if it's not rendered for current instance state
    const count = await this.stopButton.count();
    if (count === 0) return false;

    const isEnabled = await this.stopButton.isEnabled();
    return isEnabled;
  }

  /**
   * Check if delete button is enabled
   */
  async isDeleteButtonEnabled(): Promise<boolean> {
    // Button may not exist if it's not rendered for current instance state
    const count = await this.deleteButton.count();
    if (count === 0) return false;

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

  /**
   * Check if renew button is visible
   */
  async isRenewButtonVisible(): Promise<boolean> {
    return await this.renewButton.isVisible().catch(() => false);
  }

  /**
   * Click renew button to open renewal modal
   */
  async clickRenewButton() {
    await this.renewButton.click();
    await this.renewModal.waitFor({ state: 'visible', timeout: 5000 });
  }

  /**
   * Check if renewal modal is visible
   */
  async isRenewModalVisible(): Promise<boolean> {
    return await this.renewModal.isVisible().catch(() => false);
  }

  /**
   * Renew instance for 30 days
   */
  async renewFor30Days() {
    await this.clickRenewButton();
    await this.renewButton30Days.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Renew instance for 90 days
   */
  async renewFor90Days() {
    await this.clickRenewButton();
    await this.renewButton90Days.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Renew instance for 180 days
   */
  async renewFor180Days() {
    await this.clickRenewButton();
    await this.renewButton180Days.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Close renewal modal
   */
  async closeRenewModal() {
    const cancelButton = this.renewModal.getByRole('button', { name: /cancel|取消/i });
    await cancelButton.click();
    await this.renewModal.waitFor({ state: 'hidden', timeout: 5000 });
  }

  /**
   * Show renewal history
   */
  async showRenewalHistory() {
    await this.renewalHistoryButton.click();
    await this.renewalHistorySection.waitFor({ state: 'visible', timeout: 5000 });
  }

  /**
   * Hide renewal history
   */
  async hideRenewalHistory() {
    const hideButton = this.page.getByRole('button', { name: /隐藏|hide/i });
    await hideButton.click();
    await this.renewalHistorySection.waitFor({ state: 'hidden', timeout: 5000 });
  }

  /**
   * Check if renewal history is visible
   */
  async isRenewalHistoryVisible(): Promise<boolean> {
    return await this.renewalHistorySection.isVisible().catch(() => false);
  }

  /**
   * Get renewal history entries count
   */
  async getRenewalHistoryCount(): Promise<number> {
    if (!await this.isRenewalHistoryVisible()) {
      return 0;
    }
    const entries = this.renewalHistorySection.locator('[data-testid="renewal-entry"]');
    return await entries.count();
  }
}
