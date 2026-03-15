import { test, expect, Page } from '@playwright/test';

test.describe('Instance Renewal E2E', () => {
  const baseUrl = process.env.BASE_URL || 'http://localhost:5173';

  test.beforeEach(async ({ page }) => {
    // Login with valid credentials
    await page.goto(`${baseUrl}/login`);
    await page.fill('input[data-testid="feishu-user-id"]', 'test_user');
    await page.click('button[data-testid="login-button"]');
    await page.waitForURL(`${baseUrl}/dashboard`);
  });

  test('should display renewal button on instance detail page', async ({ page }) => {
    // Navigate to instance detail page
    await page.goto(`${baseUrl}/instances/test-instance-1`);

    // Wait for page to load
    await page.waitForSelector('[data-testid="instance-details-container"]');

    // Verify renewal button is present
    const renewButton = page.locator('[data-testid="renew-button"]');
    await expect(renewButton).toBeVisible();
  });

  test('should open renewal modal when clicking renew button', async ({ page }) => {
    await page.goto(`${baseUrl}/instances/test-instance-1`);
    await page.waitForSelector('[data-testid="instance-details-container"]');

    // Click renewal button
    await page.click('[data-testid="renew-button"]');

    // Verify modal is visible
    const modal = page.locator('[data-testid="renew-modal"]');
    await expect(modal).toBeVisible();

    // Verify modal content
    await expect(modal).toContainText('续费实例');
    await expect(modal).toContainText('选择续费时长:');
    await expect(modal).toContainText('续费 1 个月 (30 天)');
    await expect(modal).toContainText('续费 3 个月 (90 天)');
    await expect(modal).toContainText('续费 6 个月 (180 天)');
  });

  test('should close renewal modal when clicking cancel', async ({ page }) => {
    await page.goto(`${baseUrl}/instances/test-instance-1`);
    await page.waitForSelector('[data-testid="instance-details-container"]');

    // Open modal
    await page.click('[data-testid="renew-button"]');
    const modal = page.locator('[data-testid="renew-modal"]');
    await expect(modal).toBeVisible();

    // Click cancel button
    await page.click('button:has-text("取消")');

    // Verify modal is closed
    await expect(modal).not.toBeVisible();
  });

  test('should renew instance for 30 days', async ({ page }) => {
    await page.goto(`${baseUrl}/instances/test-instance-1`);
    await page.waitForSelector('[data-testid="instance-details-container"]');

    // Open renewal modal
    await page.click('[data-testid="renew-button"]');

    // Click renew for 30 days
    await page.click('button:has-text("续费 1 个月 (30 天)")');

    // Wait for success message (alert)
    page.on('dialog', dialog => {
      expect(dialog.message()).toContain('续费成功');
      dialog.accept();
    });

    // Wait for modal to close and page to update
    await page.waitForSelector('[data-testid="renew-modal"]', { state: 'hidden' });

    // Verify expiration date is updated
    // This would require checking the updated instance data
  });

  test('should renew instance for 90 days', async ({ page }) => {
    await page.goto(`${baseUrl}/instances/test-instance-1`);
    await page.waitForSelector('[data-testid="instance-details-container"]');

    // Open renewal modal
    await page.click('[data-testid="renew-button"]');

    // Click renew for 90 days
    await page.click('button:has-text("续费 3 个月 (90 天)")');

    // Wait for success message
    page.on('dialog', dialog => {
      expect(dialog.message()).toContain('续费成功');
      dialog.accept();
    });
  });

  test('should renew instance for 180 days', async ({ page }) => {
    await page.goto(`${baseUrl}/instances/test-instance-1`);
    await page.waitForSelector('[data-testid="instance-details-container"]');

    // Open renewal modal
    await page.click('[data-testid="renew-button"]');

    // Click renew for 180 days
    await page.click('button:has-text("续费 6 个月 (180 天)")');

    // Wait for success message
    page.on('dialog', dialog => {
      expect(dialog.message()).toContain('续费成功');
      dialog.accept();
    });
  });

  test('should display renewal history', async ({ page }) => {
    await page.goto(`${baseUrl}/instances/test-instance-1`);
    await page.waitForSelector('[data-testid="instance-details-container"]');

    // Click "查看续费历史" button
    await page.click('button:has-text("查看续费历史")');

    // Verify renewal history section is displayed
    await expect(page.locator('text=续费历史')).toBeVisible();

    // Verify renewal history content (if any)
    const renewals = page.locator('text=续费 30 天');
    if (await renewals.count() > 0) {
      await expect(renewals.first()).toBeVisible();
    }
  });

  test('should hide renewal history when clicking hide button', async ({ page }) => {
    await page.goto(`${baseUrl}/instances/test-instance-1`);
    await page.waitForSelector('[data-testid="instance-details-container"]');

    // Show renewal history
    await page.click('button:has-text("查看续费历史")');
    await expect(page.locator('text=续费历史')).toBeVisible();

    // Hide renewal history
    await page.click('button:has-text("隐藏")');
    await expect(page.locator('text=续费历史')).not.toBeVisible();
  });

  test('should show loading state during renewal', async ({ page }) => {
    await page.goto(`${baseUrl}/instances/test-instance-1`);
    await page.waitForSelector('[data-testid="instance-details-container"]');

    // Open renewal modal
    await page.click('[data-testid="renew-button"]');

    // Click renew button
    await page.click('button:has-text("续费 1 个月 (30 天)")');

    // Verify loading spinner is shown
    const loadingSpinner = page.locator('.animate-spin');
    await expect(loadingSpinner).toBeVisible();

    // Wait for loading to complete
    await expect(loadingSpinner).not.toBeVisible({ timeout: 10000 });
  });

  test('should disable renew buttons during renewal', async ({ page }) => {
    await page.goto(`${baseUrl}/instances/test-instance-1`);
    await page.waitForSelector('[data-testid="instance-details-container"]');

    // Open renewal modal
    await page.click('[data-testid="renew-button"]');

    // Click renew button
    await page.click('button:has-text("续费 1 个月 (30 天)")');

    // Verify all renew buttons are disabled
    const renewButtons = page.locator('button:has-text("续费")');
    const count = await renewButtons.count();

    for (let i = 0; i < count; i++) {
      await expect(renewButtons.nth(i)).toBeDisabled();
    }
  });

  test('should display error message on renewal failure', async ({ page }) => {
    // Mock API failure
    await page.route('**/api/instances/test-instance-1/renew', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: '续费失败：服务器错误' }),
      });
    });

    await page.goto(`${baseUrl}/instances/test-instance-1`);
    await page.waitForSelector('[data-testid="instance-details-container"]');

    // Open renewal modal
    await page.click('[data-testid="renew-button"]');

    // Click renew button
    await page.click('button:has-text("续费 1 个月 (30 天)")');

    // Wait for error message
    page.on('dialog', dialog => {
      expect(dialog.message()).toContain('续费失败');
      dialog.accept();
    });
  });
});
