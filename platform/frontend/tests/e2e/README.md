# E2E Testing Documentation

## Overview

This directory contains end-to-end tests for the AIOpc platform using Playwright. The tests cover critical user flows including authentication, instance creation, and instance management.

## Test Structure

```
tests/e2e/
├── auth/                    # Authentication tests
│   └── login-flow.spec.ts   # OAuth login flow tests
├── instances/               # Instance management tests
│   ├── creation.spec.ts     # Instance creation flow tests
│   └── management.spec.ts   # Instance management tests
├── fixtures/                # Test fixtures and utilities
│   ├── index.ts             # Extended test fixtures
│   └── test-data.ts         # Mock test data
├── pages/                   # Page Object Models
│   ├── LoginPage.ts         # Login page interactions
│   ├── DashboardPage.ts     # Dashboard page interactions
│   ├── InstancesPage.ts     # Instances list page interactions
│   └── InstanceDetailsPage.ts # Instance details page interactions
├── global-setup.ts          # Global test setup
├── global-teardown.ts       # Global test teardown
├── playwright.config.ts     # Playwright configuration
└── README.md                # This file
```

## Prerequisites

Before running E2E tests, ensure the following services are running:

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000
- **Mock Feishu**: http://localhost:3001
- **Mock OpenClaw**: http://localhost:3002
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

### Starting Services

```bash
# From platform/backend directory
cd backend && npm run dev

# From mock-services directory
cd mock-services && npm run dev

# Frontend will be started automatically by Playwright
```

## Running Tests

### Run All E2E Tests

```bash
pnpm run test:e2e
```

### Run Tests in UI Mode (Interactive)

```bash
pnpm run test:e2e:ui
```

### Run Tests in Debug Mode

```bash
pnpm run test:e2e:debug
```

### Run Tests in Headed Mode (Watch Browser)

```bash
pnpm run test:e2e:headed
```

### Run Specific Test File

```bash
npx playwright test tests/e2e/auth/login-flow.spec.ts
```

### Run Tests Matching Pattern

```bash
npx playwright test -g "OAuth"
```

### View Test Report

```bash
pnpm run test:e2e:report
```

## Test Coverage

### Authentication (login-flow.spec.ts)

- ✅ Login page rendering with QR code
- ✅ Unique QR code generation
- ✅ Mock OAuth authentication
- ✅ Token storage verification
- ✅ Dashboard redirect after login
- ✅ Protected route redirection
- ✅ Authentication persistence
- ✅ Logout functionality
- ✅ Multiple user handling

### Instance Creation (creation.spec.ts)

- ✅ Create button visibility
- ✅ Template selection
- ✅ Form validation (name, description)
- ✅ Personal template creation
- ✅ Team template creation
- ✅ Loading states
- ✅ Success messages
- ✅ Error handling
- ✅ Cancel operation
- ✅ Multiple instance creation

### Instance Management (management.spec.ts)

- ✅ Instance list display
- ✅ Instance details navigation
- ✅ Instance information display
- ✅ Start instance operation
- ✅ Stop instance operation
- ✅ Delete with confirmation
- ✅ Cancel deletion
- ✅ Status badge display
- ✅ Action button state management
- ✅ Search functionality
- ✅ Empty state handling
- ✅ Concurrent operations

## Page Object Model

The tests use the Page Object Model pattern for maintainability:

### LoginPage
- `goto()` - Navigate to login page
- `waitForQRCode()` - Wait for QR code display
- `simulateOAuthLogin()` - Mock authentication
- `isAuthenticated()` - Check auth state

### DashboardPage
- `goto()` - Navigate to dashboard
- `navigateToInstances()` - Go to instances page
- `logout()` - Perform logout
- `getInstanceCount()` - Get instance count

### InstancesPage
- `goto()` - Navigate to instances page
- `clickCreateInstance()` - Initiate creation
- `getInstanceCount()` - Get instance count
- `hasInstance()` - Check instance existence
- `searchInstances()` - Search by name

### InstanceDetailsPage
- `goto()` - Navigate to instance details
- `startInstance()` - Start instance
- `stopInstance()` - Stop instance
- `deleteInstance()` - Delete instance
- `getInstanceStatus()` - Get current status

## Test Fixtures

### Extended Fixtures

Tests use extended Playwright fixtures with custom page objects:

```typescript
export const test = base.extend<{
  loginPage: LoginPage;
  dashboardPage: DashboardPage;
  instancesPage: InstancesPage;
  instanceDetailsPage: InstanceDetailsPage;
  authenticatedPage: Page;
}>({...});
```

### Mock Data

Test data is centralized in `fixtures/test-data.ts`:

- `mockUsers` - Test user data
- `mockInstances` - Test instance data
- `mockTemplates` - Instance templates
- `TestDataHelpers` - Utility functions

## CI Integration

### GitHub Actions Workflow

```yaml
name: E2E Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - name: Install dependencies
        run: pnpm install
      - name: Install Playwright browsers
        run: npx playwright install --with-deps
      - name: Run E2E tests
        run: pnpm run test:e2e
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

## Troubleshooting

### Tests Fail with "Service Not Available"

Ensure all backend services are running:
```bash
# Check services
curl http://localhost:3000/health  # Backend
curl http://localhost:5173         # Frontend
```

### QR Code Not Loading

Increase timeout in test:
```typescript
await loginPage.waitForQRCode({ timeout: 15000 });
```

### Tests Timeout in CI

Increase timeouts in `playwright.config.ts`:
```typescript
use: {
  actionTimeout: 15000,
  navigationTimeout: 45000,
}
```

### Browser Not Found

Install Playwright browsers:
```bash
npx playwright install chromium
```

## Best Practices

1. **Isolation**: Each test should be independent and clean up after itself
2. **Descriptive Names**: Use clear test names that describe what is being tested
3. **Page Objects**: Always use Page Object Model for page interactions
4. **Wait Strategies**: Use explicit waits over implicit waits
5. **Error Handling**: Include proper assertions and error messages
6. **Test Data**: Use centralized mock data for consistency

## Adding New Tests

1. Create test file in appropriate directory (`auth/`, `instances/`)
2. Import fixtures and page objects
3. Use `test.describe()` for grouping related tests
4. Use `test.beforeEach()` for common setup
5. Write descriptive test names
6. Use proper assertions and waits
7. Run tests locally before committing

Example:
```typescript
import { test, expect } from '../../fixtures';
import { MyPage } from '../../pages/MyPage';

test.describe('New Feature', () => {
  test('should do something', async ({ authenticatedPage }) => {
    const page = new MyPage(authenticatedPage);
    await page.goto();
    await expect(page.heading).toBeVisible();
  });
});
```

## Resources

- [Playwright Documentation](https://playwright.dev/)
- [Page Object Model](https://playwright.dev/docs/pom)
- [Best Practices](https://playwright.dev/docs/best-practices)
