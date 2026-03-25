/* eslint-disable @typescript-eslint/no-unused-vars */
import { Page, expect } from '@playwright/test';

/**
 * Page Object Model for Dashboard Page
 *
 * Encapsulates interactions with the main dashboard page
 */
export class DashboardPage {
  readonly page: Page;
  readonly url = '/dashboard';

  // Page elements
  readonly heading;
  readonly welcomeMessage;
  readonly navigationMenu;
  readonly instancesLink;
  readonly settingsLink;
  readonly logoutButton;
  readonly userAvatar;
  readonly userName;
  readonly quickStartCard;
  readonly instancesOverviewCard;

  constructor(page: Page) {
    this.page = page;

    // Initialize locators
    this.heading = page.getByRole('heading', { name: /dashboard|控制台/i });
    this.welcomeMessage = page.locator('[data-testid="welcome-message"]');
    this.navigationMenu = page.locator('[data-testid="navigation-menu"]');
    this.instancesLink = page.getByRole('link', { name: /instances|实例/i });
    this.settingsLink = page.getByRole('link', { name: /settings|设置/i });
    this.logoutButton = page.getByRole('button', { name: /logout|退出/i });
    this.userAvatar = page.locator('[data-testid="user-avatar"]');
    this.userName = page.locator('[data-testid="user-name"]');
    this.quickStartCard = page.locator('[data-testid="quick-start-card"]');
    this.instancesOverviewCard = page.locator('[data-testid="instances-overview-card"]');
  }

  /**
   * Navigate to the dashboard
   */
  async goto() {
    await this.page.goto(this.url);
    await this.waitForLoad();
  }

  /**
   * Wait for dashboard to fully load
   */
  async waitForLoad() {
    await this.page.waitForLoadState('networkidle');
    await expect(this.heading).toBeVisible({ timeout: 10000 });
  }

  /**
   * Get welcome message text
   */
  async getWelcomeMessage(): Promise<string> {
    await this.welcomeMessage.waitFor({ state: 'visible' });
    return (await this.welcomeMessage.textContent()) || '';
  }

  /**
   * Get user name from dashboard
   */
  async getUserName(): Promise<string> {
    await this.userName.waitFor({ state: 'visible' });
    return (await this.userName.textContent()) || '';
  }

  /**
   * Navigate to instances page
   */
  async navigateToInstances() {
    await this.instancesLink.click();
    await this.page.waitForURL('**/instances', { timeout: 5000 });
  }

  /**
   * Navigate to settings page
   */
  async navigateToSettings() {
    await this.settingsLink.click();
    await this.page.waitForURL('**/settings', { timeout: 5000 });
  }

  /**
   * Click logout button
   */
  async logout() {
    await this.logoutButton.click();
    await this.page.waitForURL('**/login', { timeout: 5000 });
  }

  /**
   * Check if quick start card is visible
   */
  async isQuickStartVisible(): Promise<boolean> {
    return await this.quickStartCard.isVisible().catch(() => false);
  }

  /**
   * Check if instances overview card is visible
   */
  async isInstancesOverviewVisible(): Promise<boolean> {
    return await this.instancesOverviewCard.isVisible().catch(() => false);
  }

  /**
   * Get instance count from overview card
   */
  async getInstanceCount(): Promise<number> {
    const countElement = this.page.locator('[data-testid="instance-count"]');
    if (await countElement.isVisible()) {
      const text = await countElement.textContent();
      return parseInt(text || '0', 10);
    }
    return 0;
  }

  /**
   * Check if user is on dashboard
   */
  async isOnDashboard(): Promise<boolean> {
    const currentUrl = this.page.url();
    return currentUrl.includes('/dashboard');
  }
}
