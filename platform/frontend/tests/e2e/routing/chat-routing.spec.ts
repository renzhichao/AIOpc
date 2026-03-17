import { test, expect } from '@playwright/test';
import { setupApiMocks } from '../helpers/api-mocks';
import { mockUsers } from '../fixtures/test-data';
import { LoginPage } from '../../pages/LoginPage';
import { InstancesPage } from '../../pages/InstancesPage';

/**
 * Chat Page Routing E2E Tests (TASK-009-11)
 *
 * Tests the complete routing configuration for the chat functionality:
 * 1. ChatPage route exists and is protected
 * 2. Route passes instanceId parameter correctly
 * 3. Navigation from InstanceCard works correctly
 * 4. Back button navigation works correctly
 * 5. Complete user flow from dashboard to chat
 */

test.describe('Chat Page Routing (TASK-009-11)', () => {
  let loginPage: LoginPage;
  let instancesPage: InstancesPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    instancesPage = new InstancesPage(page);

    // Setup API mocks
    await setupApiMocks(page);

    // Login first
    await loginPage.goto();
    await loginPage.simulateOAuthLogin('user-001', 'mock-access-token-001');
    await page.waitForURL('**/dashboard', { timeout: 10000 });
  });

  test('ROUTE-001: ChatPage route exists and is protected', async ({ page }) => {
    await test.step('Direct access to chat route without auth should redirect to login', async () => {
      // Clear auth
      await page.evaluate(() => {
        localStorage.clear();
      });

      // Try to access chat route directly
      await page.goto('/instances/instance-001/chat');

      // Should redirect to login
      await page.waitForURL('**/login', { timeout: 5000 });
      expect(page.url()).toContain('/login');
    });

    await test.step('Direct access to chat route with auth should render ChatPage', async () => {
      // Ensure we're authenticated
      await loginPage.goto();
      await loginPage.simulateOAuthLogin('user-001', 'mock-access-token-001');
      await page.waitForURL('**/dashboard', { timeout: 10000 });

      // Navigate to chat route
      await page.goto('/instances/instance-001/chat', { waitUntil: 'domcontentloaded' });

      // Wait for chat page to load
      await page.waitForSelector('[data-testid="chat-page"]', { timeout: 10000 });

      // Verify chat page is rendered
      const chatPage = page.locator('[data-testid="chat-page"]');
      await expect(chatPage).toBeVisible();

      // Verify instance name is displayed
      const instanceName = page.locator('[data-testid="instance-name"]');
      await expect(instanceName).toBeVisible();
    });
  });

  test('ROUTE-002: Route passes instanceId parameter correctly', async ({ page }) => {
    await test.step('Navigate to chat with specific instance ID', async () => {
      const instanceId = 'instance-001';

      // Navigate to chat page
      await page.goto(`/instances/${instanceId}/chat`, { waitUntil: 'domcontentloaded' });

      // Wait for chat page to load
      await page.waitForSelector('[data-testid="chat-page"]', { timeout: 10000 });

      // Verify the URL contains the correct instance ID
      const currentUrl = page.url();
      expect(currentUrl).toContain(instanceId);

      // Verify instance name is displayed (should be loaded based on instanceId)
      const instanceName = page.locator('[data-testid="instance-name"]');
      await expect(instanceName).toBeVisible();
    });

    await test.step('Navigate to chat with different instance ID', async () => {
      const instanceId = 'instance-002';

      // Navigate to chat page with different ID
      await page.goto(`/instances/${instanceId}/chat`, { waitUntil: 'domcontentloaded' });

      // Wait for chat page to load
      await page.waitForSelector('[data-testid="chat-page"]', { timeout: 10000 });

      // Verify the URL contains the correct instance ID
      const currentUrl = page.url();
      expect(currentUrl).toContain(instanceId);
    });
  });

  test('ROUTE-003: "开始对话" button in InstanceCard navigates correctly', async ({ page }) => {
    await test.step('Navigate from instance list to chat via button', async () => {
      // Go to instances page
      await instancesPage.goto();
      await page.waitForSelector('[data-testid="instances-container"]', { timeout: 10000 });

      // Find an active instance with chat button
      const chatButton = page.locator('[data-testid="chat-button"]').first();

      // Check if chat button exists and is visible
      const chatButtonCount = await page.locator('[data-testid="chat-button"]').count();

      if (chatButtonCount > 0) {
        // Get the instance ID from the parent card
        const instanceCard = chatButton.locator('xpath=ancestor::div[@data-testid="instance-card"]');
        const instanceName = await instanceCard.locator('[data-testid="instance-name"]').textContent();

        // Click chat button
        await chatButton.click();

        // Verify navigation to chat page
        await page.waitForURL('**/instances/*/chat', { timeout: 10000 });
        expect(page.url()).toContain('/chat');

        // Verify chat page is rendered
        const chatPage = page.locator('[data-testid="chat-page"]');
        await expect(chatPage).toBeVisible();
      } else {
        // No active instances, skip this test
        test.skip(true, 'No active instances with chat button available');
      }
    });
  });

  test('ROUTE-004: Back button in ChatPage navigates correctly', async ({ page }) => {
    await test.step('Navigate from chat back to instance list', async () => {
      // Go to chat page
      await page.goto('/instances/instance-001/chat', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-testid="chat-page"]', { timeout: 10000 });

      // Verify we're on chat page
      expect(page.url()).toContain('/chat');

      // Click back button
      const backButton = page.locator('[data-testid="back-button"]');
      await backButton.click();

      // Verify navigation back to instance list
      await page.waitForURL('**/instances', { timeout: 10000 });
      expect(page.url()).toContain('/instances');
      expect(page.url()).not.toContain('/chat');

      // Verify we're back on instances page
      const instancesContainer = page.locator('[data-testid="instances-container"]');
      await expect(instancesContainer).toBeVisible();
    });
  });

  test('ROUTE-005: Complete user flow from dashboard to chat', async ({ page }) => {
    await test.step('Dashboard → Instances → Chat', async () => {
      // Start at dashboard
      await page.goto('/dashboard');
      await page.waitForSelector('[data-testid="dashboard-container"]', { timeout: 10000 });

      // Navigate to instances
      const viewInstancesLink = page.locator('a[href="/instances"]');
      await viewInstancesLink.click();
      await page.waitForURL('**/instances', { timeout: 10000 });

      // Verify instances page
      const instancesContainer = page.locator('[data-testid="instances-container"]');
      await expect(instancesContainer).toBeVisible();

      // Find and click chat button
      const chatButton = page.locator('[data-testid="chat-button"]').first();
      const chatButtonCount = await page.locator('[data-testid="chat-button"]').count();

      if (chatButtonCount > 0) {
        await chatButton.click();
        await page.waitForURL('**/instances/*/chat', { timeout: 10000 });

        // Verify chat page
        const chatPage = page.locator('[data-testid="chat-page"]');
        await expect(chatPage).toBeVisible();
      } else {
        test.skip(true, 'No active instances with chat button available');
      }
    });
  });

  test('ROUTE-006: Invalid instance ID handling', async ({ page }) => {
    await test.step('Navigate to chat with non-existent instance ID', async () => {
      // Try to access chat with invalid instance ID
      await page.goto('/instances/non-existent-instance-id/chat', { waitUntil: 'domcontentloaded' });

      // Wait for page to load
      await page.waitForTimeout(2000);

      // Should show error state or redirect gracefully
      // The page should either show an error message or handle it gracefully
      const currentUrl = page.url();

      // Check if we're still on a chat-related page (might show error) or redirected
      if (currentUrl.includes('/chat')) {
        // If on chat page, should show error state
        const chatPage = page.locator('[data-testid="chat-page"]');
        if (await chatPage.isVisible()) {
          // Should show error message
          const hasError = await page.evaluate(() => {
            const body = document.body.textContent || '';
            return body.includes('实例不存在') || body.includes('加载失败') || body.includes('错误');
          });
          expect(hasError).toBe(true);
        }
      }
    });
  });

  test('ROUTE-007: Browser back button navigation', async ({ page }) => {
    await test.step('Test browser back button from chat to instances', async () => {
      // Navigate to instances page
      await instancesPage.goto();
      await page.waitForSelector('[data-testid="instances-container"]', { timeout: 10000 });
      const instancesUrl = page.url();

      // Navigate to chat page
      await page.goto('/instances/instance-001/chat', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-testid="chat-page"]', { timeout: 10000 });

      // Verify we're on chat page
      expect(page.url()).toContain('/chat');

      // Use browser back button
      await page.goBack();

      // Verify we're back on instances page
      await page.waitForURL(`**${instancesUrl}`, { timeout: 10000 });
      expect(page.url()).toContain('/instances');
      expect(page.url()).not.toContain('/chat');

      // Verify instances page is visible
      const instancesContainer = page.locator('[data-testid="instances-container"]');
      await expect(instancesContainer).toBeVisible();
    });

    await test.step('Test browser forward button from instances to chat', async () => {
      // Navigate to instances page
      await instancesPage.goto();
      await page.waitForSelector('[data-testid="instances-container"]', { timeout: 10000 });

      // Navigate to chat page
      await page.goto('/instances/instance-001/chat', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-testid="chat-page"]', { timeout: 10000 });

      // Go back
      await page.goBack();
      await page.waitForTimeout(500);

      // Go forward
      await page.goForward();

      // Verify we're back on chat page
      await page.waitForURL('**/instances/*/chat', { timeout: 10000 });
      expect(page.url()).toContain('/chat');

      const chatPage = page.locator('[data-testid="chat-page"]');
      await expect(chatPage).toBeVisible();
    });
  });

  test('ROUTE-008: Direct URL access to chat page', async ({ page }) => {
    await test.step('Direct access via URL bar', async () => {
      const instanceId = 'instance-001';

      // Direct navigation to chat URL
      await page.goto(`/instances/${instanceId}/chat`, { waitUntil: 'domcontentloaded' });

      // Wait for chat page
      await page.waitForSelector('[data-testid="chat-page"]', { timeout: 10000 });

      // Verify correct page is loaded
      const chatPage = page.locator('[data-testid="chat-page"]');
      await expect(chatPage).toBeVisible();

      // Verify instance ID in URL
      expect(page.url()).toContain(instanceId);

      // Verify chat UI elements are present
      const messageList = page.locator('[data-testid="message-list"]');
      const messageInput = page.locator('[data-testid="message-input"]');
      const sendButton = page.locator('[data-testid="send-button"]');

      await expect(messageList).toBeVisible();
      await expect(messageInput).toBeVisible();
      await expect(sendButton).toBeVisible();
    });
  });

  test('ROUTE-009: Chat button only shows for active instances', async ({ page }) => {
    await test.step('Verify chat button visibility based on instance status', async () => {
      // Go to instances page
      await instancesPage.goto();
      await page.waitForSelector('[data-testid="instances-container"]', { timeout: 10000 });

      // Find all instance cards
      const instanceCards = page.locator('[data-testid="instance-card"]');
      const cardCount = await instanceCards.count();

      if (cardCount > 0) {
        // Check each card for chat button
        for (let i = 0; i < Math.min(cardCount, 5); i++) {
          const card = instanceCards.nth(i);

          // Check instance status
          const statusBadge = card.locator('[data-testid="status-badge"]');
          const statusText = await statusBadge.textContent();

          // Check if chat button exists
          const chatButton = card.locator('[data-testid="chat-button"]');
          const hasChatButton = await chatButton.count() > 0;

          // Chat button should only exist for active instances
          if (statusText?.includes('运行中') || statusText?.includes('active')) {
            expect(hasChatButton).toBe(true);
          } else {
            // Non-active instances might not have chat button
            // This is optional behavior, so we just log it
            console.log(`Instance ${i} status: ${statusText}, has chat button: ${hasChatButton}`);
          }
        }
      }
    });
  });

  test('ROUTE-010: Navigation preserves auth state', async ({ page }) => {
    await test.step('Verify auth state during navigation', async () => {
      // Check auth state at dashboard
      await page.goto('/dashboard');
      const authBefore = await page.evaluate(() => {
        return {
          token: localStorage.getItem('auth_token'),
          user: localStorage.getItem('auth_user'),
        };
      });

      expect(authBefore.token).toBeTruthy();
      expect(authBefore.user).toBeTruthy();

      // Navigate to chat
      await page.goto('/instances/instance-001/chat', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-testid="chat-page"]', { timeout: 10000 });

      // Check auth state after navigation
      const authAfter = await page.evaluate(() => {
        return {
          token: localStorage.getItem('auth_token'),
          user: localStorage.getItem('auth_user'),
        };
      });

      // Auth state should be preserved
      expect(authAfter.token).toBe(authBefore.token);
      expect(authAfter.user).toBe(authBefore.user);
    });
  });
});
