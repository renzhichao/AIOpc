/* eslint-disable @typescript-eslint/no-unused-vars */
import { Page, expect } from '@playwright/test';

/**
 * Instances Page Object Model
 *
 * Encapsulates all interactions with the instances list page including
 * instance display, search, filtering, and instance management operations.
 */
export class InstancesPage {
  readonly page: Page;
  readonly url = '/instances';

  // Selectors
  private readonly selectors = {
    container: '[data-testid="instances-container"]',
    header: '[data-testid="instances-header"]',
    title: '[data-testid="instances-title"]',
    heading: '[data-testid="instances-header"]', // Alias for header
    instanceList: '[data-testid="instance-list"]',
    instanceCard: '[data-testid="instance-card"]',
    instanceName: '[data-testid="instance-name"]',
    instanceStatus: '[data-testid="instance-status"]',
    instanceTemplate: '[data-testid="instance-template"]',
    createButton: '[data-testid="create-instance-button"]',
    searchInput: '[data-testid="search-input"]',
    filterButton: '[data-testid="filter-button"]',
    emptyState: '[data-testid="empty-state"]',
    loading: '[data-testid="instances-loading"]',
    refreshButton: '[data-testid="refresh-button"]',
  };

  constructor(page: Page) {
    this.page = page;
  }

  // Getters for test locators
  get createButton() {
    return this.page.locator(this.selectors.createButton);
  }

  /**
   * Navigate to the instances page
   */
  async goto() {
    await this.page.goto(this.url);
    await this.waitForLoad();
  }

  /**
   * Wait for the instances page to load
   */
  async waitForLoad() {
    await this.page.waitForSelector(this.selectors.container);
  }

  /**
   * Get locator for heading element
   */
  get heading() {
    return this.page.locator(this.selectors.heading);
  }

  /**
   * Get locator for instance list
   */
  get instanceList() {
    return this.page.locator(this.selectors.instanceList);
  }

  /**
   * Get all instance cards
   */
  async getInstanceCards() {
    return await this.page.$$(this.selectors.instanceCard);
  }

  /**
   * Get instance count
   */
  async getInstanceCount(): Promise<number> {
    const cards = await this.getInstanceCards();
    return cards.length;
  }

  /**
   * Click create instance button
   */
  async clickCreateInstance() {
    await this.page.click(this.selectors.createButton);
    await this.page.waitForURL('/instances/create');
  }

  /**
   * Click on an instance card to view details
   */
  async viewInstance(instanceIndex: number) {
    const cards = await this.getInstanceCards();
    if (instanceIndex >= cards.length) {
      throw new Error(`Instance index ${instanceIndex} out of range`);
    }

    // Wait for card to be ready
    const cardLocator = this.page.locator(this.selectors.instanceCard).nth(instanceIndex);
    await cardLocator.waitFor({ state: 'visible' });

    // Click on the instance card to trigger React Router navigation
    await cardLocator.click();

    // Wait for URL to change to instance details pattern
    await this.page.waitForURL(/\/instances\/[^/]+$/, { timeout: 10000 });
  }

  /**
   * Search instances by name
   */
  async searchInstances(searchTerm: string) {
    const searchInput = await this.page.$(this.selectors.searchInput);
    if (!searchInput) {
      throw new Error('Search input not found');
    }
    await searchInput.fill(searchTerm);
    // Wait for search results
    await this.page.waitForTimeout(500);
  }

  /**
   * Clear search
   */
  async clearSearch() {
    const searchInput = await this.page.$(this.selectors.searchInput);
    if (!searchInput) {
      throw new Error('Search input not found');
    }
    await searchInput.fill('');
    await this.page.waitForTimeout(500);
  }

  /**
   * Refresh the instance list
   */
  async refresh() {
    const refreshButton = await this.page.$(this.selectors.refreshButton);
    if (!refreshButton) {
      await this.page.reload();
    } else {
      await refreshButton.click();
    }
    await this.waitForLoad();
  }

  /**
   * Check if instances page shows empty state
   */
  async isEmpty(): Promise<boolean> {
    const emptyState = await this.page.$(this.selectors.emptyState);
    return emptyState !== null;
  }

  /**
   * Verify instances page is displayed correctly
   */
  async verifyInstancesPage() {
    await expect(this.page.locator(this.selectors.header)).toBeVisible();
    await expect(this.page.locator(this.selectors.title)).toBeVisible();
  }

  /**
   * Get instance name by index
   */
  async getInstanceName(instanceIndex: number): Promise<string | null> {
    const cards = await this.getInstanceCards();
    if (instanceIndex >= cards.length) {
      return null;
    }

    const nameElement = await cards[instanceIndex].$(this.selectors.instanceName);
    if (!nameElement) return null;

    return await nameElement.textContent();
  }

  /**
   * Get instance status by index
   */
  async getInstanceStatus(instanceIndex: number): Promise<string | null> {
    const cards = await this.getInstanceCards();
    if (instanceIndex >= cards.length) {
      return null;
    }

    const statusElement = await cards[instanceIndex].$(this.selectors.instanceStatus);
    if (!statusElement) return null;

    return await statusElement.textContent();
  }

  /**
   * Wait for instances to appear
   */
  async waitForInstances(timeout = 10000): Promise<void> {
    await this.page.waitForSelector(
      this.selectors.instanceCard,
      { timeout }
    );
  }

  /**
   * Check if user is on instances page
   */
  async isOnInstancesPage(): Promise<boolean> {
    return this.page.url().includes('/instances');
  }

  /**
   * Check if an instance with the given name exists
   */
  async hasInstance(instanceName: string): Promise<boolean> {
    const cards = await this.getInstanceCards();
    for (const card of cards) {
      const nameElement = await card.$(this.selectors.instanceName);
      if (nameElement) {
        const text = await nameElement.textContent();
        if (text && text.includes(instanceName)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Check if empty state is visible
   */
  async isEmptyStateVisible(): Promise<boolean> {
    const emptyState = await this.page.$(this.selectors.emptyState);
    if (!emptyState) return false;
    return await emptyState.isVisible();
  }

  /**
   * Wait for an instance with the given name to appear in the list
   */
  async waitForInstance(instanceName: string, timeout = 10000): Promise<void> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      if (await this.hasInstance(instanceName)) {
        return;
      }
      await this.page.waitForTimeout(500);
    }
    throw new Error(`Instance "${instanceName}" did not appear within ${timeout}ms`);
  }
}
