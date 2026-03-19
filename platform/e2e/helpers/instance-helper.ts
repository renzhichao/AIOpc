import { Page } from '@playwright/test';

/**
 * Instance Helper Class
 *
 * Provides helper methods for instance management testing including:
 * - Instance creation and configuration
 * - Instance lifecycle operations
 * - Mock API responses
 * - Form validation
 * - Error handling
 */
export class InstanceHelper {
  private instanceCounter = 0;

  constructor(private page: Page) {}

  /**
   * Create instance via API mock
   */
  async createInstanceViaAPI(options: {
    name: string;
    template: 'personal' | 'team' | 'enterprise';
    status?: string;
    expires_at?: string;
  }): Promise<string> {
    this.instanceCounter++;
    const instanceId = `instance-${this.instanceCounter}`;

    await this.page.route('**/api/instances', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          instance_id: instanceId,
          name: options.name,
          template: options.template,
          status: options.status || 'stopped',
          expires_at: options.expires_at || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString(),
        }),
      });
    });

    await this.page.route(`**/api/instances/${instanceId}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          instance_id: instanceId,
          name: options.name,
          template: options.template,
          status: options.status || 'stopped',
          expires_at: options.expires_at || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString(),
          api_key: `sk-test-${instanceId}`,
          container_id: `container-${instanceId}`,
          resources: {
            cpu: 2,
            memory: 4096,
            storage: 20480,
          },
        }),
      });
    });

    return instanceId;
  }

  /**
   * Fill instance creation form
   */
  async fillInstanceForm(data: {
    name: string;
    template: string;
    description?: string;
  }): Promise<void> {
    // Select template
    const templateSelector = `[data-testid="template-${data.template}"]`;
    await this.page.locator(templateSelector).click();

    // Fill name
    await this.page.locator('[data-testid="instance-name-input"]').fill(data.name);

    // Fill description if provided
    if (data.description) {
      await this.page.locator('[data-testid="instance-description-input"]').fill(data.description);
    }
  }

  /**
   * Check if instance exists in list
   */
  async instanceExistsInList(instanceName: string): Promise<boolean> {
    await this.page.goto('/instances');
    await this.page.waitForSelector('[data-testid="instances-container"]', { timeout: 5000 });

    const instanceCards = await this.page.locator('[data-testid="instance-card"]').all();

    for (const card of instanceCards) {
      const name = await card.locator('[data-testid="instance-name"]').textContent();
      if (name === instanceName) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get form validation error
   */
  async getFormError(): Promise<string> {
    const errorElement = this.page.locator('[data-testid="form-error"]');
    const isVisible = await errorElement.isVisible().catch(() => false);

    if (isVisible) {
      return await errorElement.textContent() || '';
    }

    return '';
  }

  /**
   * Get success message
   */
  async getSuccessMessage(): Promise<string> {
    const successElement = this.page.locator('[data-testid="success-message"]');
    const isVisible = await successElement.isVisible().catch(() => false);

    if (isVisible) {
      return await successElement.textContent() || '';
    }

    return '';
  }

  /**
   * Get error message
   */
  async getErrorMessage(): Promise<string> {
    const errorElement = this.page.locator('[data-testid="error-message"]');
    const isVisible = await errorElement.isVisible().catch(() => false);

    if (isVisible) {
      return await errorElement.textContent() || '';
    }

    return '';
  }
}
