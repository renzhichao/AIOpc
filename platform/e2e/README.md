# E2E Testing Framework for AIOpc Platform

Comprehensive end-to-end testing framework for the AIOpc cloud SaaS platform, covering OAuth authentication, instance registration, and WebSocket communication.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Test Coverage](#test-coverage)
- [Running Tests](#running-tests)
- [Writing Tests](#writing-tests)
- [Test Structure](#test-structure)
- [Helper Classes](#helper-classes)
- [CI/CD Integration](#cicd-integration)
- [Troubleshooting](#troubleshooting)

## Overview

This E2E testing framework uses [Playwright](https://playwright.dev/) to test critical user flows in the AIOpc platform. The tests are designed to:

- ✅ Verify OAuth 2.0 authentication with Feishu integration
- ✅ Test instance creation, configuration, and lifecycle management
- ✅ Validate WebSocket connections for real-time agent communication
- ✅ Prevent production regressions through comprehensive coverage
- ✅ Provide fast feedback with parallel test execution

### Key Features

- **Mock API Integration**: Tests mock Feishu OAuth and backend APIs for reliable, fast testing
- **Multi-Browser Support**: Tests run on Chromium, Firefox, WebKit, and mobile browsers
- **WebSocket Testing**: Full WebSocket lifecycle testing with connection management
- **Visual Regression**: Screenshots and videos on failure for debugging
- **HTML Reports**: Interactive HTML reports for test result visualization
- **Type Safety**: Full TypeScript support for maintainable tests

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm (recommended) or npm
- Docker (for containerized testing)

### Installation

```bash
# Navigate to E2E directory
cd platform/e2e

# Install dependencies
pnpm install

# Install Playwright browsers
npx playwright install
```

### Run All Tests

```bash
# Run all E2E tests
pnpm test

# Run with UI mode (interactive debugging)
pnpm test:ui

# Run with debug mode (step-through debugging)
pnpm test:debug

# Run with headed mode (show browser window)
pnpm test:headed

# View test report
pnpm test:report
```

### Run Specific Test Suites

```bash
# Run only authentication tests
pnpm test auth.spec.ts

# Run only instance tests
pnpm test instance.spec.ts

# Run only WebSocket tests
pnpm test websocket.spec.ts
```

## Test Coverage

### 1. OAuth Authentication Flow (`auth.spec.ts`)

Tests the complete OAuth 2.0 authentication flow with Feishu integration:

**QR Code Generation (AUTH-001)**
- ✅ QR code generation and display
- ✅ Unique QR codes per session
- ✅ Auto-refresh before expiration
- ✅ Loading states

**OAuth URL Generation (AUTH-002)**
- ✅ Valid OAuth URL with required parameters
- ✅ CSRF token in state parameter
- ✅ Unique state per request

**Token Exchange (AUTH-003)**
- ✅ Authorization code to access token exchange
- ✅ User information storage
- ✅ Invalid code handling
- ✅ Expired code handling

**Session Management (AUTH-004)**
- ✅ Authentication persistence across navigation
- ✅ Session persistence on page refresh
- ✅ Protected route redirect
- ✅ Access token validation

**Logout (AUTH-005)**
- ✅ Session clearing on logout
- ✅ Redirect to login after logout
- ✅ Protected route prevention

**Error Handling (AUTH-006)**
- ✅ QR code generation failure
- ✅ Network timeout handling
- ✅ CSRF token mismatch
- ✅ Rate limiting handling

**Multi-User Support (AUTH-007)**
- ✅ Multiple user handling
- ✅ Session isolation between users

**Security Features (AUTH-008)**
- ✅ HTTPS for OAuth in production
- ✅ Secure token storage
- ✅ Session timeout implementation

### 2. Instance Registration and Management (`instance.spec.ts`)

Tests the complete instance lifecycle:

**Instance Creation Flow (INSTANCE-001)**
- ✅ Instance creation page display
- ✅ Personal template creation
- ✅ Team template creation
- ✅ Instance name validation

**Instance Registration (INSTANCE-002)**
- ✅ Backend API registration
- ✅ API key allocation
- ✅ Docker container provisioning

**Instance Configuration (INSTANCE-003)**
- ✅ Configuration options display
- ✅ Configuration updates
- ✅ Configuration validation

**Instance Lifecycle (INSTANCE-004)**
- ✅ Instance start
- ✅ Instance stop
- ✅ Instance restart

**Instance Renewal (INSTANCE-005)**
- ✅ Renewal options display
- ✅ 30-day renewal
- ✅ Renewal history display

**Instance Deletion (INSTANCE-006)**
- ✅ Deletion with confirmation
- ✅ Deletion cancellation

**Instance List and Filtering (INSTANCE-007)**
- ✅ All instances display
- ✅ Status filtering
- ✅ Name search

**Error Handling (INSTANCE-008)**
- ✅ Creation failure handling
- ✅ Duplicate name handling
- ✅ Start failure handling

### 3. WebSocket Connection and Communication (`websocket.spec.ts`)

Tests WebSocket functionality for real-time agent communication:

**WebSocket Connection (WS-001)**
- ✅ Connection with JWT authentication
- ✅ Connection timeout handling
- ✅ Authentication failure handling

**Message Exchange (WS-002)**
- ✅ Message sending to agent
- ✅ Message receiving from agent
- ✅ Multiple concurrent messages
- ✅ Send failure handling

**Connection Lifecycle (WS-003)**
- ✅ Connection loss handling
- ✅ Automatic reconnection
- ✅ Message queue during reconnection
- ✅ Explicit disconnect

**Ping/Pong Heartbeat (WS-004)**
- ✅ Ping frame sending
- ✅ Pong frame receiving
- ✅ Missing pong detection

**Multi-User Sessions (WS-005)**
- ✅ Concurrent connections from different users
- ✅ Message isolation between users

**Instance-Specific Channels (WS-006)**
- ✅ Instance-specific channel connection
- ✅ Multiple instance connections
- ✅ Message routing to correct instance

**Error Handling and Recovery (WS-007)**
- ✅ Server shutdown handling
- ✅ Malformed message handling
- ✅ Network interruption handling
- ✅ Reconnection attempt limiting

**Performance and Scalability (WS-008)**
- ✅ High-frequency message handling
- ✅ Large message handling
- ✅ Performance under load

## Running Tests

### Local Development

```bash
# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage

# Run tests in debug mode
pnpm test:debug
```

### CI/CD Pipeline

```bash
# Run tests in CI environment
CI=true pnpm test

# Run tests with JUnit reporter for CI
pnpm test --reporter=junit
```

### Browser Selection

```bash
# Run on specific browser
pnpm test --project=chromium
pnpm test --project=firefox
pnpm test --project=webkit

# Run on mobile browsers
pnpm test --project="Mobile Chrome"
pnpm test --project="Mobile Safari"
```

### Test Filtering

```bash
# Run tests matching pattern
pnpm test --grep "OAuth"

# Run tests in specific file
pnpm test auth.spec.ts

# Run specific test line
pnpm test auth.spec.ts:15
```

## Writing Tests

### Test Structure

```typescript
import { test, expect } from '@playwright/test';
import { OAuthHelper } from '../helpers/oauth-helper';

test.describe('Feature Name', () => {
  let oauthHelper: OAuthHelper;

  test.beforeEach(async ({ page }) => {
    oauthHelper = new OAuthHelper(page);
    await oauthHelper.setupMockSession({
      user_id: 'test-user',
      access_token: 'test-token',
    });
  });

  test('should do something specific', async ({ page }) => {
    // Arrange
    await page.goto('/some-page');

    // Act
    await page.click('[data-testid="button"]');

    // Assert
    await expect(page.locator('[data-testid="result"]')).toBeVisible();
  });
});
```

### Best Practices

1. **Use Test IDs**: Add `data-testid` attributes to elements for reliable selection
   ```html
   <button data-testid="submit-button">Submit</button>
   ```

2. **Wait for Elements**: Use explicit waits instead of fixed timeouts
   ```typescript
   await expect(page.locator('[data-testid="result"]')).toBeVisible();
   ```

3. **Mock External APIs**: Don't rely on real Feishu or backend APIs in tests
   ```typescript
   await oauthHelper.mockFeishuOAuthCallback({
     user_id: 'test-user',
     access_token: 'test-token',
   });
   ```

4. **Use Helpers**: Leverage helper classes for common operations
   ```typescript
   await oauthHelper.setupMockSession(options);
   await instanceHelper.createInstanceViaAPI(options);
   ```

5. **Test Idempotency**: Tests should be runnable multiple times without side effects
   ```typescript
   test.afterEach(async ({ page }) => {
     // Cleanup test data
   });
   ```

6. **Descriptive Test Names**: Use clear, descriptive test names
   ```typescript
   test('should display error message when login fails', async ({ page }) => {
     // ...
   });
   ```

## Test Structure

```
platform/e2e/
├── tests/
│   ├── auth.spec.ts          # OAuth authentication tests
│   ├── instance.spec.ts      # Instance management tests
│   └── websocket.spec.ts     # WebSocket communication tests
├── helpers/
│   ├── oauth-helper.ts       # OAuth test helpers
│   ├── instance-helper.ts    # Instance test helpers
│   ├── websocket-helper.ts   # WebSocket test helpers
│   └── api-helper.ts         # API mock helpers
├── fixtures/                 # Test fixtures and data
├── playwright.config.ts      # Playwright configuration
├── global-setup.ts          # Global test setup
├── global-teardown.ts       # Global test teardown
└── README.md                # This file
```

## Helper Classes

### OAuthHelper

Provides OAuth authentication testing utilities:

```typescript
const oauthHelper = new OAuthHelper(page);

// Setup mock session
await oauthHelper.setupMockSession({
  user_id: 'test-user',
  access_token: 'test-token',
});

// Mock OAuth callback
await oauthHelper.mockFeishuOAuthCallback({
  user_id: 'user-001',
  access_token: 'token-001',
});

// Check authentication
const isAuthenticated = await oauthHelper.isAuthenticated();
```

### InstanceHelper

Provides instance management testing utilities:

```typescript
const instanceHelper = new InstanceHelper(page);

// Create instance via API
const instanceId = await instanceHelper.createInstanceViaAPI({
  name: 'Test Instance',
  template: 'personal',
});

// Fill instance form
await instanceHelper.fillInstanceForm({
  name: 'My Instance',
  template: 'personal',
  description: 'Test instance',
});

// Check if instance exists
const exists = await instanceHelper.instanceExistsInList('Test Instance');
```

### WebSocketHelper

Provides WebSocket testing utilities:

```typescript
const wsHelper = new WebSocketHelper(page);

// Setup WebSocket mock
await wsHelper.setupWebSocketMock();

// Wait for connection
const connected = await wsHelper.waitForConnection(5000);

// Send message
await wsHelper.sendMessage('Hello, Agent!');

// Simulate agent response
await wsHelper.simulateAgentMessage('Response from agent');

// Check connection state
const state = await wsHelper.getConnectionState();
```

### APIHelper

Provides API mocking utilities:

```typescript
const apiHelper = new APIHelper(page);

// Setup instance API
await apiHelper.setupInstanceAPI();

// Mock authenticated endpoint
await apiHelper.mockAuthenticatedEndpoint('/api/user/profile', {
  user_id: 'user-001',
  name: 'Test User',
});

// Make authenticated request
const response = await apiHelper.makeAuthenticatedRequest('/api/user/profile');
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  e2e:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '22'

      - name: Install pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Install dependencies
        run: |
          cd platform/e2e
          pnpm install

      - name: Install Playwright browsers
        run: |
          cd platform/e2e
          npx playwright install --with-deps

      - name: Run E2E tests
        run: |
          cd platform/e2e
          CI=true pnpm test

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: platform/e2e/playwright-report/

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: test-results
          path: platform/e2e/test-results/
```

### Pipeline Integration

The E2E tests are designed to integrate with your CI/CD pipeline:

1. **Block Merges on Failure**: E2E test failures should prevent PR merges
2. **HTML Reports**: Upload Playwright HTML reports for visualization
3. **JUnit Output**: Generate JUnit XML for test result aggregation
4. **Parallel Execution**: Run tests in parallel for faster feedback
5. **Retry on Flaky Tests**: Configure retries for CI environment

## Troubleshooting

### Common Issues

**Issue: Tests timeout waiting for connection**
```bash
# Solution: Increase timeout in playwright.config.ts
use: {
  actionTimeout: 30000,  // Increase from 10000
  navigationTimeout: 60000,
}
```

**Issue: WebSocket tests fail with connection errors**
```bash
# Solution: Ensure WebSocket mock is properly setup
await wsHelper.setupWebSocketMock();
await wsHelper.waitForConnection(5000);
```

**Issue: Tests fail to find elements**
```bash
# Solution: Add data-testid attributes to elements
# Instead of: await page.click('button')
# Use: await page.click('[data-testid="submit-button"]')
```

**Issue: Tests pass locally but fail in CI**
```bash
# Solution: Check for timing issues and add explicit waits
await expect(page.locator('[data-testid="result"]')).toBeVisible();
```

**Issue: Browser crashes during test execution**
```bash
# Solution: Reduce parallel workers or increase resources
workers: 1  # In playwright.config.ts
```

### Debug Mode

```bash
# Run tests with debug mode
pnpm test:debug

# Run specific test in debug mode
pnpm test:debug auth.spec.ts:15

# Run with headed mode to see browser
pnpm test:headed
```

### Test Reports

```bash
# View HTML report
pnpm test:report

# Report is generated at:
# platform/e2e/playwright-report/index.html

# View JSON results
cat platform/e2e/test-results/test-results.json

# View JUnit results
cat platform/e2e/test-results/junit.xml
```

## Performance Metrics

Target metrics for E2E test execution:

- ✅ **Pass Rate**: ≥95% (allowing for flaky tests)
- ✅ **Execution Time**: <10 minutes for full suite
- ✅ **Test Count**: 100+ test cases across 3 suites
- ✅ **Parallel Execution**: 5 workers for fast feedback

## Contributing

When adding new E2E tests:

1. Follow the existing test structure and naming conventions
2. Use helper classes for common operations
3. Add `data-testid` attributes to new UI elements
4. Mock all external API calls
5. Write descriptive test names and comments
6. Update this README with new test coverage

## License

This E2E testing framework is part of the AIOpc project.

## Support

For issues or questions about E2E testing:
- Check existing test files for examples
- Review Playwright documentation: https://playwright.dev/
- Consult project documentation in `docs/` directory
