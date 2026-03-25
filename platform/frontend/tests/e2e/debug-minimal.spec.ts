/* eslint-disable @typescript-eslint/no-unused-vars */
import { test, expect } from '@playwright/test';
import { mockUsers } from './fixtures/test-data';

/**
 * Minimal test to debug React routing issue
 */
test.describe('Debug Minimal Navigation', () => {
  test('minimal: direct navigation to instance details', async ({ page }) => {
    // Set up authentication
    const user = mockUsers[0];

    // Use initScript to set localStorage BEFORE first navigation
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

    // Navigate directly to instance details (bypass dashboard)
    console.log('[TEST] Navigating to /instances/instance-001...');

    // Try different wait strategies
    await page.goto('/instances/instance-001', { waitUntil: 'commit' });

    console.log('[TEST] URL after navigation:', page.url());

    // Check if we were redirected
    const currentUrl = page.url();
    if (currentUrl.includes('/login')) {
      console.log('[TEST] Redirected to login - auth check failed');
    }

    // Wait for ANY React content to appear
    try {
      await page.waitForFunction(() => {
        const root = document.querySelector('#root');
        return root && root.innerHTML.length > 0;
      }, { timeout: 10000 });
      console.log('[TEST] React content found');
    } catch { /* ignore */ } {
      console.log('[TEST] No React content found');

      // Check what's actually in the DOM
      const domState = await page.evaluate(() => {
        return {
          hasRoot: !!document.querySelector('#root'),
          rootHTML: document.querySelector('#root')?.innerHTML || 'NO ROOT',
          bodyHTML: document.body?.innerHTML.substring(0, 500) || 'NO BODY',
          documentReady: document.readyState,
        };
      });
      console.log('[TEST] DOM state:', JSON.stringify(domState, null, 2));
    }
  });

  test('minimal: check if React is completely broken after navigation', async ({ page }) => {
    // First, verify React works on dashboard
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

    // Navigate to dashboard first to verify React works
    console.log('[TEST] Step 1: Navigate to dashboard...');
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    const dashboardHTML = await page.evaluate(() => {
      const root = document.querySelector('#root');
      return root ? root.innerHTML.substring(0, 200) : 'NO ROOT';
    });
    console.log('[TEST] Dashboard HTML length:', dashboardHTML.length);

    // Now try to navigate to instance details
    console.log('[TEST] Step 2: Navigate to instance details...');
    await page.goto('/instances/instance-001', { waitUntil: 'domcontentloaded' });

    const instanceHTML = await page.evaluate(() => {
      const root = document.querySelector('#root');
      return root ? root.innerHTML.substring(0, 200) : 'NO ROOT';
    });
    console.log('[TEST] Instance HTML length:', instanceHTML.length);

    // Now try going back to dashboard
    console.log('[TEST] Step 3: Go back to dashboard...');
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    const backToDashboardHTML = await page.evaluate(() => {
      const root = document.querySelector('#root');
      return root ? root.innerHTML.substring(0, 200) : 'NO ROOT';
    });
    console.log('[TEST] Back to dashboard HTML length:', backToDashboardHTML.length);

    expect(dashboardHTML.length).toBeGreaterThan(0);
    expect(backToDashboardHTML.length).toBeGreaterThan(0);
  });
});
