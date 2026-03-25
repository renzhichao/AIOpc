 
import { Page, expect } from '@playwright/test';

/**
 * Dashboard Page Object Model
 *
 * Encapsulates all interactions with the dashboard page including navigation,
 * instance overview, and authentication status verification.
 */
export class DashboardPage {
  readonly page: Page;
  readonly url = '/dashboard';

  // Selectors
  private readonly selectors = {
    container: '[data-testid="dashboard-container"]',
    header: '[data-testid="dashboard-header"]',
    title: '[data-testid="dashboard-title"]',
    instanceList: '[data-testid="instance-list"]',
    instanceCard: '[data-testid="instance-card"]',
    createButton: '[data-testid="create-instance-button"]',
    logoutButton: '[data-testid="logout-button"]',
    userMenu: '[data-testid="user-menu"]',
    userName: '[data-testid="user-name"]',
    userEmail: '[data-testid="user-email"]',
    emptyState: '[data-testid="empty-state"]',
    loading: '[data-testid="dashboard-loading"]',
  };

  constructor(page: Page) {
    this.page = page;
  }

  // Getters for test locators
  get heading() {
    return this.page.locator(this.selectors.title);
  }

  /**
   * Navigate to the dashboard
   */
  async goto() {
    await this.page.goto(this.url);
    await this.waitForLoad();
  }

  /**
   * Wait for the dashboard to load
   */
  async waitForLoad() {
    await this.page.waitForSelector(this.selectors.container);
  }

  /**
   * Verify user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    const token = await this.page.evaluate(() => {
      return localStorage.getItem('auth_token');
    });
    return token !== null;
  }

  /**
   * Get current user info from localStorage
   */
  async getCurrentUser() {
    return await this.page.evaluate(() => {
      const userStr = localStorage.getItem('auth_user');
      return userStr ? JSON.parse(userStr) : null;
    });
  }

  /**
   * Verify user info is displayed
   */
  async verifyUserInfo() {
    const user = await this.getCurrentUser();
    expect(user).not.toBeNull();

    const userName = await this.page.$(this.selectors.userName);
    expect(userName).not.toBeNull();
  }

  /**
   * Click logout button
   */
  async logout() {
    await this.page.click(this.selectors.logoutButton);
    await this.page.waitForURL('/login');
  }

  /**
   * Click create instance button
   */
  async clickCreateInstance() {
    await this.page.click(this.selectors.createButton);
    // Should navigate to create page
    await this.page.waitForURL('/instances/create');
  }

  /**
   * Get instance count displayed on dashboard
   */
  async getInstanceCount(): Promise<number> {
    const cards = await this.page.$$(this.selectors.instanceCard);
    return cards.length;
  }

  /**
   * Check if dashboard shows empty state
   */
  async isEmpty(): Promise<boolean> {
    const emptyState = await this.page.$(this.selectors.emptyState);
    return emptyState !== null;
  }

  /**
   * Verify dashboard elements are displayed
   */
  async verifyDashboard() {
    await expect(this.page.locator(this.selectors.header)).toBeVisible();
    await expect(this.page.locator(this.selectors.title)).toBeVisible();
  }

  /**
   * Check if user is on dashboard page
   */
  async isOnDashboard(): Promise<boolean> {
    return this.page.url().includes('/dashboard');
  }

  /**
   * Navigate to instances page
   */
  async goToInstances() {
    await this.page.goto('/instances');
  }

  /**
   * Wait for instances to load
   */
  async waitForInstances(timeout = 10000): Promise<void> {
    await this.page.waitForSelector(
      this.selectors.instanceCard,
      { timeout }
    );
  }

  /**
   * Refresh dashboard
   */
  async refresh() {
    await this.page.reload();
    await this.waitForLoad();
  }

  /**
   * Get welcome message from dashboard
   */
  async getWelcomeMessage(): Promise<string | null> {
    const titleElement = await this.page.$(this.selectors.title);
    if (!titleElement) return null;
    return await titleElement.textContent();
  }
}
