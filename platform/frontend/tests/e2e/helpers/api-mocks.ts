/* eslint-disable @typescript-eslint/no-unused-vars */
import { Page, Route } from '@playwright/test';

/**
 * API Mock Helpers for E2E Tests
 *
 * This file provides utilities to mock API responses in E2E tests,
 * allowing tests to run without depending on backend services.
 */

export class ApiMocks {
  constructor(private page: Page) {}

  // Flag to control empty state mode
  private emptyStateMode = false;

  // Store created instances dynamically
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  private createdInstances: any[] = [
    {
      id: 'instance-001',
      owner_id: 'user-001',
      name: '测试实例1',
      description: '这是一个测试实例',
      template: 'personal',
      config: {
        name: '测试实例1',
        description: '这是一个测试实例',
      },
      status: 'active',
      docker_container_id: 'container-001',
      restart_attempts: 0,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      last_active_at: '2024-01-01T00:00:00Z',
    },
    {
      id: 'instance-002',
      owner_id: 'user-001',
      name: '测试实例2',
      description: '另一个测试实例',
      template: 'team',
      config: {
        name: '测试实例2',
        description: '另一个测试实例',
      },
      status: 'stopped',
      docker_container_id: 'container-002',
      restart_attempts: 0,
      created_at: '2024-01-02T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z',
      last_active_at: '2024-01-02T00:00:00Z',
    },
    {
      id: 'instance-003',
      owner_id: 'user-001',
      name: '测试实例3',
      description: '第三个测试实例',
      template: 'enterprise',
      config: {
        name: '测试实例3',
        description: '第三个测试实例',
      },
      status: 'error',
      docker_container_id: 'container-003',
      restart_attempts: 3,
      created_at: '2024-01-03T00:00:00Z',
      updated_at: '2024-01-03T00:00:00Z',
      last_active_at: '2024-01-03T00:00:00Z',
    },
  ];

  /**
   * Mock the authorization URL endpoint
   */
  async mockGetAuthorizationUrl() {
    await this.page.route('**/api/oauth/authorize', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          url: 'https://mock-feishu.com/oauth/authorize?state=test-state-123',
          state: 'test-state-123',
          expires_in: 300,
        }),
      });
    });
  }

  /**
   * Mock the OAuth callback endpoint
   */
  async mockOAuthCallback() {
    await this.page.route('**/api/oauth/callback', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-access-token',
          refresh_token: 'mock-refresh-token',
          user: {
            id: 'user-001',
            feishu_user_id: 'feishu-001',
            name: '开发测试用户',
            email: 'dev@example.com',
          },
        }),
      });
    });
  }

  /**
   * Mock all instances endpoints with a unified handler to avoid route conflicts
   * This handles: GET list, POST create, GET details, DELETE, POST start, POST stop
   */
  async mockInstancesEndpoints() {
    // Store reference to 'this' for use in the handler
    // eslint-disable-next-line @typescript-eslint/no-this-alias

    // Mock the health endpoint separately since it has a different URL structure
    await this.page.route(/api\/health\/instances\/[^/]+$/, async (route) => {
      const url = route.request().url();
      const pathname = new URL(url).pathname;
      const instanceId = pathname.split('/').pop();

      console.log('🎯 Mock health endpoint:', pathname, 'Method:', route.request().method());

      if (route.request().method() === 'GET' && instanceId) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            healthy: true,
            container_status: 'running',
            http_status: 'healthy',
            cpu_usage: 45.5,
            memory_usage: 62.3,
            timestamp: new Date().toISOString(),
          }),
        });
      } else {
        route.continue();
      }
    });

    // Create a single handler that will be registered for all patterns
    const handleInstanceRequest = async (route: Route) => {
      const url = route.request().url();
      const method = route.request().method();
      const pathname = new URL(url).pathname;

      console.log('🎯 Mock instances endpoint:', pathname, 'Method:', method);

      // Extract instance ID from URL if present
      const instanceIdMatch = pathname.match(/^\/api\/instances\/([^/]+)/);
      const instanceId = instanceIdMatch ? instanceIdMatch[1] : null;

      // ===== ROUTING LOGIC =====

      // Case 1: GET /api/instances - List instances
      if (pathname === '/api/instances' && method === 'GET') {
        const instances = self.emptyStateMode ? [] : self.createdInstances;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: instances,
            pagination: {
              page: 1,
              limit: 10,
              total: instances.length,
            },
          }),
        });
        return;
      }

      // Case 2: POST /api/instances - Create instance
      if (pathname === '/api/instances' && method === 'POST') {
        // Check for duplicate name error scenario
        try {
          const body = route.request().postDataJSON();
          if (body.config?.name === 'Duplicate Instance Name') {
            // Simulate error for duplicate name
            await route.fulfill({
              status: 400,
              contentType: 'application/json',
              body: JSON.stringify({
                success: false,
                error: {
                  code: 'DUPLICATE_NAME',
                  message: '实例名称已存在',
                },
              }),
            });
            return;
          }
        } catch { /* ignore */ } {
          // If we can't parse the body, continue with normal flow
        }

        // Get the request body to return the actual data
        let requestBody = {};
        try {
          requestBody = route.request().postDataJSON() || {};
        } catch { /* ignore */ } {
          // If we can't parse the body, use defaults
        }

        // Create the new instance
        const now = new Date().toISOString();
        const newInstance = {
          id: `instance-${Date.now()}`,
          owner_id: 'user-001',
          name: requestBody?.config?.name || '新实例',
          description: requestBody?.config?.description || '新创建的实例',
          template: requestBody?.template || 'personal',
          config: {
            name: requestBody?.config?.name || '新实例',
            description: requestBody?.config?.description || '新创建的实例',
          },
          status: 'pending',
          docker_container_id: `container-${Date.now()}`,
          restart_attempts: 0,
          created_at: now,
          updated_at: now,
          last_active_at: now,
        };

        // Add to our dynamic list
        self.createdInstances.push(newInstance);

        // Add delay to simulate network latency and ensure loading state is visible
        await new Promise(resolve => setTimeout(resolve, 500));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: newInstance,
            message: '实例创建成功',
          }),
        });
        return;
      }

      // If we have an instance ID, handle instance-specific operations
      if (instanceId) {
        // Case 3: GET /api/instances/:id/usage - Usage stats
        if (pathname.endsWith('/usage') && method === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              total_messages: 1000,
              total_tokens: 50000,
              cpu_usage: 45.5,
              memory_usage: 62.3,
              uptime: 3600,
              last_active: new Date().toISOString(),
            }),
          });
          return;
        }

        // Case 4: GET /api/instances/:id/health - Health check (not currently used)
        if (pathname.endsWith('/health') && method === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              healthy: true,
              container_status: 'running',
              http_status: 'healthy',
              cpu_usage: 45.5,
              memory_usage: 62.3,
              timestamp: new Date().toISOString(),
            }),
          });
          return;
        }

        // Case 5: POST /api/instances/:id/start - Start instance
        if (pathname.endsWith('/start') && method === 'POST') {
          // Simulate error for specific instance
          if (instanceId === 'instance-003') {
            await route.fulfill({
              status: 500,
              contentType: 'application/json',
              body: JSON.stringify({
                success: false,
                error: {
                  code: 'START_FAILED',
                  message: '启动实例失败',
                },
              }),
            });
          } else {
            // Update instance status to active
            const instance = self.createdInstances.find(i => i.id === instanceId);
            if (instance) {
              instance.status = 'active';
              instance.updated_at = new Date().toISOString();
            }

            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                success: true,
                data: instance || {
                  id: instanceId,
                  status: 'active',
                  updated_at: new Date().toISOString(),
                },
                message: '实例启动成功',
              }),
            });
          }
          return;
        }

        // Case 6: POST /api/instances/:id/stop - Stop instance
        if (pathname.endsWith('/stop') && method === 'POST') {
          // Update instance status to stopped
          const instance = self.createdInstances.find(i => i.id === instanceId);
          if (instance) {
            instance.status = 'stopped';
            instance.updated_at = new Date().toISOString();
          }

          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              data: instance || {
                id: instanceId,
                status: 'stopped',
                updated_at: new Date().toISOString(),
              },
              message: '实例停止成功',
            }),
          });
          return;
        }

        // Case 7: GET /api/instances/:id - Get instance details
        if (method === 'GET') {
          // First check in dynamically created instances
          let instanceData = self.createdInstances.find(i => i.id === instanceId);

          // If not found, check in the base mockInstances
          if (!instanceData) {
            instanceData = mockInstances.find(i => i.id === instanceId);
          }

          console.log(`[DEBUG] GET /api/instances/${instanceId} - found:`, !!instanceData);

          if (instanceData) {
            const response = {
              success: true,
              data: instanceData,
            };
            console.log(`[DEBUG] Returning instance data:`, instanceData.name);
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify(response),
            });
          } else {
            // Return 404 for unknown instances
            console.log(`[DEBUG] Instance ${instanceId} not found`);
            await route.fulfill({
              status: 404,
              contentType: 'application/json',
              body: JSON.stringify({
                success: false,
                error: {
                  code: 'INSTANCE_NOT_FOUND',
                  message: '实例不存在',
                },
              }),
            });
          }
          return;
        }

        // Case 8: DELETE /api/instances/:id - Delete instance
        if (method === 'DELETE') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              message: '实例删除成功',
            }),
          });
          return;
        }
      }

      // If no pattern matched, continue with the request
      console.log('⚠️ No pattern matched for:', pathname, method);
      route.continue();
    };

    // Register the handler with a single catch-all pattern
    // This pattern matches all requests starting with /api/instances
    await this.page.route(/\/api\/instances\//, handleInstanceRequest);
  }

  /**
   * Setup all common API mocks
   */
  async setupCommonMocks() {
    await this.mockGetAuthorizationUrl();
    await this.mockOAuthCallback();
    await this.mockInstancesEndpoints();
  }

  /**
   * Override instances list to return empty array
   * This is useful for testing empty state scenarios
   */
  async mockEmptyInstancesList() {
    this.emptyStateMode = true;
  }

  /**
   * Reset empty state mode to normal
   */
  async resetEmptyStateMode() {
    this.emptyStateMode = false;
  }
}

/**
 * Mock instances data for testing
 */
export const mockInstances = [
  {
    id: 'instance-001',
    owner_id: 'user-001',
    name: '测试实例1',
    description: '这是一个测试实例',
    template: 'personal',
    config: {
      name: '测试实例1',
      description: '这是一个测试实例',
    },
    status: 'active',
    docker_container_id: 'container-001',
    restart_attempts: 0,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'instance-002',
    owner_id: 'user-001',
    name: '测试实例2',
    description: '另一个测试实例',
    template: 'team',
    config: {
      name: '测试实例2',
      description: '另一个测试实例',
    },
    status: 'stopped',
    docker_container_id: 'container-002',
    restart_attempts: 0,
    created_at: '2024-01-02T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
  },
  {
    id: 'instance-003',
    owner_id: 'user-001',
    name: '测试实例3',
    description: '运行中的实例',
    template: 'team',
    config: {
      name: '测试实例3',
      description: '运行中的实例',
    },
    status: 'running',
    docker_container_id: 'container-003',
    restart_attempts: 0,
    created_at: '2024-01-03T00:00:00Z',
    updated_at: '2024-01-03T00:00:00Z',
  },
];

/**
 * Helper function to setup API mocks for a page
 */
export async function setupApiMocks(page: Page) {
  // Log all requests for debugging
  page.on('request', request => {
    const url = request.url();
    if (url.includes('/api/')) {
      console.log('[API REQ]', request.method(), url);
    }
  });

  page.on('response', response => {
    const url = response.url();
    if (url.includes('/api/')) {
      console.log('[API RES]', response.status(), url);
    }
  });

  const mocks = new ApiMocks(page);
  await mocks.setupCommonMocks();
  return mocks;
}
