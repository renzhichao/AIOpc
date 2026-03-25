 
import { Page, expect } from '@playwright/test';

/**
 * Page Object Model for Instances List Page
 *
 * Encapsulates interactions with the instances management page
 */
export class InstancesPage {
  readonly page: Page;
  readonly url = '/instances';

  // Page elements
  readonly heading;
  readonly createButton;
  readonly instanceList;
  readonly emptyState;
  readonly loadingSpinner;
  readonly searchInput;
  readonly filterButton;
  readonly refreshButton;

  constructor(page: Page) {
    this.page = page;

    // Initialize locators
    this.heading = page.getByRole('heading', { name: /instances|实例/i });
    this.createButton = page.getByRole('button', { name: /create|new|创建/i });
    this.instanceList = page.locator('[data-testid="instance-list"]');
    this.emptyState = page.locator('[data-testid="empty-state"]');
    this.loadingSpinner = page.locator('[data-testid="loading-spinner"]');
    this.searchInput = page.getByPlaceholder(/search|搜索/i);
    this.filterButton = page.getByRole('button', { name: /filter|过滤/i });
    this.refreshButton = page.getByRole('button', { name: /refresh|刷新/i });
  }

  /**
   * Navigate to instances page
   */
  async goto() {
    await this.page.goto(this.url);
    await this.waitForLoad();
  }

  /**
   * Wait for instances page to fully load
   */
  async waitForLoad() {
    await this.page.waitForLoadState('networkidle');
    await expect(this.heading).toBeVisible({ timeout: 10000 });
  }

  /**
   * Click create instance button
   */
  async clickCreateInstance() {
    await this.createButton.click();
    // Wait for navigation or modal to appear
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Get list of instance cards
   */
  async getInstanceCards() {
    return this.page.locator('[data-testid^="instance-card-"]').all();
  }

  /**
   * Get count of displayed instances
   */
  async getInstanceCount(): Promise<number> {
    const cards = await this.getInstanceCards();
    return cards.length;
  }

  /**
   * Get instance name by index
   */
  async getInstanceName(index: number): Promise<string> {
    const card = this.page.locator(`[data-testid="instance-card-${index}"]`);
    const nameElement = card.locator('[data-testid="instance-name"]');
    await nameElement.waitFor({ state: 'visible' });
    return (await nameElement.textContent()) || '';
  }

  /**
   * Get instance status by index
   */
  async getInstanceStatus(index: number): Promise<string> {
    const card = this.page.locator(`[data-testid="instance-card-${index}"]`);
    const statusElement = card.locator('[data-testid="instance-status"]');
    await statusElement.waitFor({ state: 'visible' });
    return (await statusElement.textContent()) || '';
  }

  /**
   * Click instance card by index
   */
  async clickInstance(index: number) {
    const card = this.page.locator(`[data-testid="instance-card-${index}"]`);
    await card.click();
  }

  /**
   * Click view details button for an instance
   */
  async viewInstanceDetails(instanceId: string) {
    const button = this.page.locator(`[data-testid="view-details-${instanceId}"]`);
    await button.click();
  }

  /**
   * Search instances by name
   */
  async searchInstances(query: string) {
    await this.searchInput.fill(query);
    await this.page.waitForTimeout(500); // Debounce wait
  }

  /**
   * Clear search
   */
  async clearSearch() {
    await this.searchInput.clear();
    await this.page.waitForTimeout(500); // Debounce wait
  }

  /**
   * Refresh instances list
   */
  async refresh() {
    await this.refreshButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Check if empty state is shown
   */
  async isEmptyStateVisible(): Promise<boolean> {
    return await this.emptyState.isVisible().catch(() => false);
  }

  /**
   * Check if loading spinner is visible
   */
  async isLoading(): Promise<boolean> {
    return await this.loadingSpinner.isVisible().catch(() => false);
  }

  /**
   * Wait for instance to appear in list
   */
  async waitForInstance(instanceName: string, timeout = 10000) {
    await this.page.waitForSelector(`[data-testid="instance-name"]:has-text("${instanceName}")`, {
      timeout,
    });
  }

  /**
   * Check if instance exists in list
   */
  async hasInstance(instanceName: string): Promise<boolean> {
    const instance = this.page.locator(`[data-testid="instance-name"]:has-text("${instanceName}")`);
    return await instance.count().then((count) => count > 0);
  }
}
