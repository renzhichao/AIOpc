/* eslint-disable @typescript-eslint/no-unused-vars */
import { test, expect } from '@playwright/test';
import { InstanceDetailsPage } from '../pages/InstanceDetailsPage';
import { InstancesPage } from '../pages/InstancesPage';
import { mockInstances } from '../fixtures/test-data';
import { setupApiMocks } from '../helpers/api-mocks';

/**
 * E2E Tests for Instance Management Flow (Direct Navigation Version)
 *
 * These tests use direct navigation instead of the authenticatedPage fixture
 * to avoid React Router client-side navigation issues.
 */

test.describe('Instance Management Flow (Direct Nav)', () => {
  test('should display instance details correctly', async ({ page }) => {
    // Setup mocks and auth
    await setupApiMocks(page);
    const user = mockInstances[0];

    // Set up authentication
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
    }, mockInstances[0]);

    // Navigate to instance details
    const instanceDetailsPage = new InstanceDetailsPage(page);
    await instanceDetailsPage.goto(mockInstances[0].id);

    // Verify instance information is displayed
    const name = await instanceDetailsPage.getInstanceName();
    const status = await instanceDetailsPage.getInstanceStatus();

    expect(name).toBeTruthy();
    expect(status).toBeTruthy();
  });

  test('should start a stopped instance', async ({ page }) => {
    // Setup mocks and auth
    await setupApiMocks(page);

    // Set up authentication
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
    }, mockInstances[0]);

    // Navigate to stopped instance
    const instanceDetailsPage = new InstanceDetailsPage(page);
    const stoppedInstance = mockInstances.find((i) => i.status === 'stopped') || mockInstances[1];

    await page.goto(`/instances/${stoppedInstance.id}`, { waitUntil: 'commit' });
    await instanceDetailsPage.waitForLoad();

    // Verify and click start button
    expect(await instanceDetailsPage.isStartButtonEnabled()).toBe(true);
    await instanceDetailsPage.startInstance();

    // Wait for operation
    await page.waitForTimeout(500);

    expect(await instanceDetailsPage.isStartButtonEnabled()).toBe(false);
  });

  test('should stop a running instance', async ({ page }) => {
    // Setup mocks and auth
    await setupApiMocks(page);

    // Set up authentication
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
    }, mockInstances[0]);

    // Navigate to running instance
    const instanceDetailsPage = new InstanceDetailsPage(page);
    const runningInstance = mockInstances.find((i) => i.status === 'running' || i.status === 'active') || mockInstances[0];

    await page.goto(`/instances/${runningInstance.id}`, { waitUntil: 'commit' });
    await instanceDetailsPage.waitForLoad();

    // Verify and click stop button
    expect(await instanceDetailsPage.isStopButtonEnabled()).toBe(true);
    await instanceDetailsPage.stopInstance();

    // Wait for operation
    await page.waitForTimeout(500);

    expect(await instanceDetailsPage.isStopButtonEnabled()).toBe(false);
  });

  test('should display correct status badges', async ({ page }) => {
    // Setup mocks and auth
    await setupApiMocks(page);

    // Set up authentication
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
    }, mockInstances[0]);

    // Navigate to instance
    const instanceDetailsPage = new InstanceDetailsPage(page);
    await page.goto(`/instances/${mockInstances[0].id}`, { waitUntil: 'commit' });
    await instanceDetailsPage.waitForLoad();

    // Verify status badge
    const status = await instanceDetailsPage.getInstanceStatus();
    const statusElement = page.locator('[data-testid="instance-status"]');

    await expect(statusElement).toBeVisible();
    expect(status).toBeTruthy();
    expect(status.length).toBeGreaterThan(0);
  });

  test('should disable action buttons based on instance state', async ({ page }) => {
    // Setup mocks and auth
    await setupApiMocks(page);

    // Set up authentication
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
    }, mockInstances[0]);

    // Navigate to running instance
    const instanceDetailsPage = new InstanceDetailsPage(page);
    await page.goto(`/instances/${mockInstances[0].id}`, { waitUntil: 'commit' });
    await instanceDetailsPage.waitForLoad();

    // Verify button states
    expect(await instanceDetailsPage.isStopButtonEnabled()).toBe(true);
    expect(await instanceDetailsPage.isStartButtonEnabled()).toBe(false);
  });

  test('should navigate back to instances list', async ({ page }) => {
    // Setup mocks and auth
    await setupApiMocks(page);

    // Set up authentication
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
    }, mockInstances[0]);

    // Navigate to instance
    const instanceDetailsPage = new InstanceDetailsPage(page);
    const instancesPage = new InstancesPage(page);

    await page.goto(`/instances/${mockInstances[0].id}`, { waitUntil: 'commit' });
    await instanceDetailsPage.waitForLoad();

    // Click back button
    await instanceDetailsPage.goBack();

    // Verify navigation back to instances list
    await page.waitForURL('**/instances', { timeout: 5000 });
    await expect(instancesPage.heading).toBeVisible();
  });
});
