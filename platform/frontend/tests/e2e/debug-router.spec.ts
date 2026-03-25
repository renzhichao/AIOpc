 
import { test, expect } from '@playwright/test';
import { setupApiMocks } from './helpers/api-mocks';
import { mockUsers } from './fixtures/test-data';

/**
 * Debug test to investigate React Router navigation issue
 */
test.describe('Debug React Router Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);

    // Set up authentication using initScript
    const user = mockUsers[0];
    await page.goto('/login', { waitUntil: 'domcontentloaded' });

    await page.evaluate((userData) => {
      localStorage.setItem('auth_token', userData.accessToken);
      localStorage.setItem('access_token', userData.accessToken);
      localStorage.setItem('user_data', JSON.stringify({
        id: userData.id,
        feishu_user_id: userData.id,
        name: userData.name,
        email: userData.email,
      }));
      localStorage.setItem('auth_user', JSON.stringify({
        id: userData.id,
        feishu_user_id: userData.id,
        name: userData.name,
        email: userData.email,
      }));
    }, user);

    // Now navigate to dashboard
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="dashboard-container"]', { timeout: 10000 });
  });

  test('debug: inspect DOM after navigation', async ({ page }) => {
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    const debugLog: any[] = [];

    debugLog.push('[DEBUG] Starting navigation debug test...');

    // Check initial state
    const initialRootHTML = await page.evaluate(() => {
      const root = document.querySelector('#root');
      return {
        innerHTML: root ? root.innerHTML.substring(0, 500) : 'NO ROOT',
        hasChildren: root ? root.children.length : 0,
        reactRoot: !!document.querySelector('[data-reactroot]')
      };
    });
    debugLog.push('[DEBUG] Initial root HTML:', JSON.stringify(initialRootHTML, null, 2));

    // Try to navigate to instance details using page.goto()
    debugLog.push('[DEBUG] Navigating to /instances/instance-001...');
    await page.goto('/instances/instance-001', { waitUntil: 'domcontentloaded' });

    // Wait a bit for any React rendering
    await page.waitForTimeout(2000);

    // Check state after navigation
    const afterNavRootHTML = await page.evaluate(() => {
      const root = document.querySelector('#root');
      return {
        innerHTML: root ? root.innerHTML.substring(0, 1000) : 'NO ROOT',
        hasChildren: root ? root.children.length : 0,
        bodyHTML: document.body ? document.body.innerHTML.substring(0, 500) : 'NO BODY',
        url: window.location.href,
        reactRoot: !!document.querySelector('[data-reactroot]'),
        allDivs: document.querySelectorAll('div').length
      };
    });
    debugLog.push('[DEBUG] After navigation root HTML:', JSON.stringify(afterNavRootHTML, null, 2));

    // Check for React errors
    const hasReactError = await page.evaluate(() => {
      return window.__REACT_ERROR__ || false;
    });
    debugLog.push('[DEBUG] Has React error:', hasReactError);

    // Try reloading
    debugLog.push('[DEBUG] Reloading page...');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const afterReloadRootHTML = await page.evaluate(() => {
      const root = document.querySelector('#root');
      return {
        innerHTML: root ? root.innerHTML.substring(0, 1000) : 'NO ROOT',
        hasChildren: root ? root.children.length : 0,
        bodyHTML: document.body ? document.body.innerHTML.substring(0, 500) : 'NO BODY',
      };
    });
    debugLog.push('[DEBUG] After reload root HTML:', JSON.stringify(afterReloadRootHTML, null, 2));

    // Check if container exists
    const hasContainer = await page.locator('[data-testid="instance-details-container"]').count();
    debugLog.push('[DEBUG] Container count:', hasContainer);

    // Write to file
    await page.evaluate((logs) => {
      console.log('=== DEBUG OUTPUT START ===');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
      logs.forEach((log: any) => console.log(log));
      console.log('=== DEBUG OUTPUT END ===');
    }, debugLog);

    // Also output to test console
    debugLog.forEach(log => console.log(log));

    expect(debugLog.length).toBeGreaterThan(0);
  });

  test('debug: check localStorage and auth state', async ({ page }) => {
    // Check localStorage before navigation
    const beforeNavStorage = await page.evaluate(() => {
      return {
        auth_token: localStorage.getItem('auth_token'),
        access_token: localStorage.getItem('access_token'),
        user_data: localStorage.getItem('user_data'),
        auth_user: localStorage.getItem('auth_user'),
      };
    });
    console.log('[DEBUG] Before navigation localStorage:', beforeNavStorage);

    // Navigate
    await page.goto('/instances/instance-001', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Check localStorage after navigation
    const afterNavStorage = await page.evaluate(() => {
      return {
        auth_token: localStorage.getItem('auth_token'),
        access_token: localStorage.getItem('access_token'),
        user_data: localStorage.getItem('user_data'),
        auth_user: localStorage.getItem('auth_user'),
      };
    });
    console.log('[DEBUG] After navigation localStorage:', afterNavStorage);

    // Check if we were redirected
    const currentUrl = page.url();
    console.log('[DEBUG] Current URL:', currentUrl);
  });
});
