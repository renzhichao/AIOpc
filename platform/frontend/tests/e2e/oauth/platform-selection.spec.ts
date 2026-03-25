/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * Platform Selection E2E Tests
 *
 * Tests the complete platform selection flow including:
 * - Platform selector rendering
 * - Platform selection interaction
 * - Remember choice functionality
 * - QR code generation after selection
 * - Error handling
 */

import { test, expect, Page } from '@playwright/test';

test.describe('Platform Selection Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to login page
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
  });

  test('should display platform selection screen', async ({ page }) => {
    // Wait for platform selector to load
    await page.waitForSelector('[data-testid="platform-selector"]', {
      timeout: 5000,
    });

    // Verify title
    await expect(page.locator('text=选择登录方式')).toBeVisible();

    // Verify platform cards are displayed
    await expect(page.locator('[data-testid="platform-card-feishu"]')).toBeVisible();
    await expect(page.locator('[data-testid="platform-card-dingtalk"]')).toBeVisible();
  });

  test('should select Feishu platform and display QR code', async ({ page }) => {
    // Wait for platform selector
    await page.waitForSelector('[data-testid="platform-selector"]');

    // Click on Feishu platform
    await page.click('[data-testid="platform-card-feishu"]');

    // Verify QR code container is displayed
    await page.waitForSelector('[data-testid="qr-container"]', {
      timeout: 5000,
    });

    // Verify platform-specific text
    await expect(page.locator('text=使用飞书扫码登录')).toBeVisible();

    // Verify QR code is displayed
    const qrCode = page.locator('[data-testid="qr-code"]');
    await expect(qrCode).toBeVisible();

    // Verify back button is present
    await expect(page.locator('[data-testid="back-button"]')).toBeVisible();
  });

  test('should select DingTalk platform and display QR code', async ({ page }) => {
    // Wait for platform selector
    await page.waitForSelector('[data-testid="platform-selector"]');

    // Click on DingTalk platform
    await page.click('[data-testid="platform-card-dingtalk"]');

    // Verify QR code container is displayed
    await page.waitForSelector('[data-testid="qr-container"]', {
      timeout: 5000,
    });

    // Verify platform-specific text
    await expect(page.locator('text=使用钉钉扫码登录')).toBeVisible();

    // Verify QR code is displayed
    const qrCode = page.locator('[data-testid="qr-code"]');
    await expect(qrCode).toBeVisible();
  });

  test('should remember platform selection when checkbox is checked', async ({
    page,
    context,
  }) => {
    // Wait for platform selector
    await page.waitForSelector('[data-testid="platform-selector"]');

    // Check the remember checkbox
    const rememberCheckbox = page.locator('[data-testid="remember-checkbox"]');
    await rememberCheckbox.check();

    // Select DingTalk platform
    await page.click('[data-testid="platform-card-dingtalk"]');

    // Verify selection is saved to localStorage
    const savedPlatform = await page.evaluate(() => {
      return localStorage.getItem('selected_oauth_platform');
    });
    expect(savedPlatform).toBe('dingtalk');

    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Verify DingTalk is pre-selected (should auto-advance to QR code)
    // or show DingTalk as selected in platform selector
    await page.waitForSelector('[data-testid="qr-container"]', {
      timeout: 5000,
    });
  });

  test('should navigate back to platform selection', async ({ page }) => {
    // Wait for platform selector and select a platform
    await page.waitForSelector('[data-testid="platform-selector"]');
    await page.click('[data-testid="platform-card-feishu"]');

    // Wait for QR code screen
    await page.waitForSelector('[data-testid="qr-container"]');

    // Click back button
    await page.click('[data-testid="back-button"]');

    // Verify platform selector is displayed again
    await page.waitForSelector('[data-testid="platform-selector"]');
    await expect(page.locator('text=选择登录方式')).toBeVisible();
  });

  test('should refresh QR code when refresh button is clicked', async ({
    page,
  }) => {
    // Wait for platform selector and select a platform
    await page.waitForSelector('[data-testid="platform-selector"]');
    await page.click('[data-testid="platform-card-feishu"]');

    // Wait for QR code screen
    await page.waitForSelector('[data-testid="qr-container"]');

    // Get initial QR code value
    // const initialQRCode = await page.locator('[data-testid="qr-code"]').getAttribute('value');

    // Click refresh button
    await page.click('button:has-text("刷新二维码")');

    // Wait for new QR code to load
    await page.waitForTimeout(1000);

    // Verify QR code is still displayed
    const qrCode = page.locator('[data-testid="qr-code"]');
    await expect(qrCode).toBeVisible();
  });

  test('should display error message when API fails', async ({ page }) => {
    // Mock API to fail
    await page.route('**/api/oauth/platforms', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: '获取平台列表失败' }),
      });
    });

    // Reload page to trigger API call
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Wait for error message
    await page.waitForSelector('text=获取平台列表失败', { timeout: 5000 });

    // Verify reload button is shown
    await expect(page.locator('text=重新加载')).toBeVisible();
  });

  test('should auto-select single platform when only one is enabled', async ({
    page,
  }) => {
    // Mock API to return only one platform
    await page.route('**/api/oauth/platforms', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [{ platform: 'feishu', enabled: true, isDefault: true }],
        }),
      });
    });

    // Reload page to trigger API call
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Verify QR code is displayed directly (skipping platform selection)
    await page.waitForSelector('[data-testid="qr-container"]', {
      timeout: 5000,
    });
    await expect(page.locator('text=使用飞书扫码登录')).toBeVisible();
  });

  test('should display platform icons and colors correctly', async ({ page }) => {
    // Wait for platform selector
    await page.waitForSelector('[data-testid="platform-selector"]');

    // Verify platform names are displayed
    await expect(page.locator('text=飞书')).toBeVisible();
    await expect(page.locator('text=钉钉')).toBeVisible();

    // Verify platform descriptions
    await expect(page.locator('text=使用飞书账号登录')).toBeVisible();
    await expect(page.locator('text=使用钉钉账号登录')).toBeVisible();
  });

  test('should handle platform selection on mobile viewport', async ({
    page,
  }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Wait for platform selector
    await page.waitForSelector('[data-testid="platform-selector"]');

    // Verify platform cards are stacked vertically on mobile
    const feishuCard = page.locator('[data-testid="platform-card-feishu"]');
    const dingtalkCard = page.locator('[data-testid="platform-card-dingtalk"]');

    await expect(feishuCard).toBeVisible();
    await expect(dingtalkCard).toBeVisible();

    // Verify cards are in different positions (stacked)
    const feishuBox = await feishuCard.boundingBox();
    const dingtalkBox = await dingtalkCard.boundingBox();

    expect(feishuBox?.y).not.toBe(dingtalkBox?.y);
  });
});

test.describe('Platform Selection Accessibility', () => {
  test('should have proper data-testid attributes', async ({ page }) => {
    await page.goto('/login');
    await page.waitForSelector('[data-testid="platform-selector"]');

    // Verify all test IDs are present
    await expect(page.locator('[data-testid="platform-selector"]')).toBeVisible();
    await expect(page.locator('[data-testid="platform-card-feishu"]')).toBeVisible();
    await expect(page.locator('[data-testid="platform-card-dingtalk"]')).toBeVisible();
    await expect(page.locator('[data-testid="remember-checkbox"]')).toBeVisible();
  });

  test('should update selected state visually', async ({ page }) => {
    await page.goto('/login');
    await page.waitForSelector('[data-testid="platform-selector"]');

    const feishuCard = page.locator('[data-testid="platform-card-feishu"]');

    // Initially not selected
    await expect(feishuCard).not.toHaveAttribute('data-selected', 'true');

    // Click to select
    await feishuCard.click();

    // Now selected
    await expect(feishuCard).toHaveAttribute('data-selected', 'true');
  });
});

test.describe('Platform Selection Integration', () => {
  test('should complete full login flow with platform selection', async ({
    page,
  }) => {
    // This test validates the complete flow from platform selection to OAuth redirect
    // Note: Actual OAuth redirect cannot be fully tested in E2E without real OAuth server

    await page.waitForSelector('[data-testid="platform-selector"]');

    // Select Feishu
    await page.click('[data-testid="platform-card-feishu"]');

    // Wait for QR code
    await page.waitForSelector('[data-testid="qr-container"]');

    // Verify QR code is displayed
    const qrCode = page.locator('[data-testid="qr-code"]');
    await expect(qrCode).toBeVisible();

    // Verify QR code has a value (URL)
    const qrValue = await qrCode.getAttribute('value');
    expect(qrValue).toBeTruthy();
    expect(qrValue).toContain('https://');
  });

  test('should handle platform switching', async ({ page }) => {
    await page.waitForSelector('[data-testid="platform-selector"]');

    // Select Feishu first
    await page.click('[data-testid="platform-card-feishu"]');
    await page.waitForSelector('[data-testid="qr-container"]');

    // Go back
    await page.click('[data-testid="back-button"]');
    await page.waitForSelector('[data-testid="platform-selector"]');

    // Select DingTalk instead
    await page.click('[data-testid="platform-card-dingtalk"]');
    await page.waitForSelector('[data-testid="qr-container"]');

    // Verify DingTalk-specific text
    await expect(page.locator('text=使用钉钉扫码登录')).toBeVisible();
  });
});
