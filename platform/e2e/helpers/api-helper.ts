import { Page } from '@playwright/test';

/**
 * API Helper Class
 *
 * Provides helper methods for API testing including:
 * - API endpoint mocking
 * - Authenticated request handling
 * - Instance API mocking
 * - Docker provisioning mocking
 */
export class APIHelper {
  constructor(private page: Page) {}

  /**
   * Setup instance API endpoints
   */
  async setupInstanceAPI(): Promise<void> {
    // Mock list instances
    await this.page.route('**/api/instances', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            instances: [],
          }),
        });
      } else if (route.request().method() === 'POST') {
        await route.continue();
      }
    });

    // Mock instance details
    await this.page.route('**/api/instances/*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            instance_id: 'instance-001',
            name: 'Test Instance',
            template: 'personal',
            status: 'stopped',
            created_at: new Date().toISOString(),
          }),
        });
      } else if (route.request().method() === 'PATCH') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
          }),
        });
      } else if (route.request().method() === 'DELETE') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
          }),
        });
      }
    });

    // Mock instance actions (start, stop, restart)
    await this.page.route('**/api/instances/*/start', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'starting',
        }),
      });
    });

    await this.page.route('**/api/instances/*/stop', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'stopping',
        }),
      });
    });

    await this.page.route('**/api/instances/*/restart', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'restarting',
        }),
      });
    });

    // Mock renewal API
    await this.page.route('**/api/instances/*/renew', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          new_expiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      });
    });
  }

  /**
   * Mock authenticated endpoint
   */
  async mockAuthenticatedEndpoint(endpoint: string, response: any): Promise<void> {
    await this.page.route(`**${endpoint}`, async (route) => {
      const authHeader = route.request().headers()['authorization'];

      if (!authHeader) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Unauthorized',
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(response),
      });
    });
  }

  /**
   * Make authenticated request
   */
  async makeAuthenticatedRequest(endpoint: string): Promise<{
    status: number;
    data: any;
  }> {
    const response = await this.page.evaluate(async (url) => {
      const token = localStorage.getItem('access_token');
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      return {
        status: response.status,
        data: await response.json(),
      };
    }, endpoint);

    return response;
  }

  /**
   * Mock Docker provisioning
   */
  async mockDockerProvisioning(options: {
    container_id: string;
    status: string;
  }): Promise<void> {
    await this.page.route('**/api/docker/provision', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          container_id: options.container_id,
          status: options.status,
        }),
      });
    });
  }
}
