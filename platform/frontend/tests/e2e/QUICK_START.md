# E2E Testing Quick Start Guide

## Prerequisites Check

Before running E2E tests, verify all services are running:

```bash
# Check service status
curl http://localhost:5173 > /dev/null 2>&1 && echo "✅ Frontend running" || echo "❌ Frontend not running"
curl http://localhost:3000/health > /dev/null 2>&1 && echo "✅ Backend running" || echo "❌ Backend not running"
curl http://localhost:3001 > /dev/null 2>&1 && echo "✅ Mock Feishu running" || echo "❌ Mock Feishu not running"
curl http://localhost:3002 > /dev/null 2>&1 && echo "✅ Mock OpenClaw running" || echo "❌ Mock OpenClaw not running"
```

## Quick Commands

### Run All Tests (Headless)
```bash
pnpm run test:e2e
```

### Run Tests with UI (Interactive)
```bash
pnpm run test:e2e:ui
```

### Debug Tests
```bash
pnpm run test:e2e:debug
```

### Run Tests in Browser (Watch)
```bash
pnpm run test:e2e:headed
```

### View Test Report
```bash
pnpm run test:e2e:report
```

## Test Organization

### Test Files
- `tests/e2e/auth/login-flow.spec.ts` - OAuth authentication tests
- `tests/e2e/instances/creation.spec.ts` - Instance creation tests
- `tests/e2e/instances/management.spec.ts` - Instance management tests

### Page Objects
- `LoginPage.ts` - Login page interactions
- `DashboardPage.ts` - Dashboard interactions
- `InstancesPage.ts` - Instance list interactions
- `InstanceDetailsPage.ts` - Instance details interactions

### Fixtures
- `fixtures/index.ts` - Extended test fixtures
- `fixtures/test-data.ts` - Mock test data

## Running Specific Tests

### Run Authentication Tests
```bash
npx playwright test tests/e2e/auth/
```

### Run Instance Tests
```bash
npx playwright test tests/e2e/instances/
```

### Run Specific Test File
```bash
npx playwright test tests/e2e/auth/login-flow.spec.ts
```

### Run Tests by Name Pattern
```bash
npx playwright test -g "OAuth"
npx playwright test -g "create instance"
npx playwright test -g "delete"
```

## Test Results

### Results Location
- HTML Report: `playwright-report/index.html`
- Test Results: `test-results/`
- Screenshots: `test-results/screenshots/`
- Videos: `test-results/videos/`
- Traces: `test-results/traces/`

### View Results
```bash
# Open HTML report
pnpm run test:e2e:report

# Or directly open file
open playwright-report/index.html
```

## Common Issues & Solutions

### Issue: "Service Not Available"
**Solution:** Start required services
```bash
# Backend
cd platform/backend && pnpm run dev

# Mock Services
cd mock-services && pnpm run dev
```

### Issue: "Browser Not Found"
**Solution:** Install Playwright browsers
```bash
npx playwright install chromium
```

### Issue: "Tests Timeout"
**Solution:** Increase timeout in `playwright.config.ts`
```typescript
use: {
  actionTimeout: 15000,
  navigationTimeout: 45000,
}
```

### Issue: "QR Code Not Loading"
**Solution:** Check backend API and increase timeout
```bash
# Verify backend is responding
curl http://localhost:3000/api/auth/url

# Increase timeout in test
await loginPage.waitForQRCode({ timeout: 15000 });
```

## Development Workflow

### 1. Make Code Changes
Edit your React components or business logic

### 2. Run Relevant Tests
```bash
# Quick test run
npx playwright test -g "your feature name"
```

### 3. Debug Failures
```bash
# Run with debug mode
npx playwright test --debug

# Or run specific test
npx playwright test --debug tests/e2e/your-test.spec.ts
```

### 4. View Results
```bash
# Open HTML report
pnpm run test:e2e:report
```

### 5. Fix Issues & Repeat
Continue until tests pass

## CI/CD Integration

### GitHub Actions
Tests run automatically on:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`
- Manual trigger via workflow_dispatch

### View CI Results
1. Go to GitHub Actions tab
2. Select the "E2E Tests" workflow
3. View test results and artifacts
4. Download test reports for detailed analysis

## Test Coverage

### Current Coverage
- **Total Tests:** 36
- **Authentication:** 10 tests
- **Instance Creation:** 11 tests
- **Instance Management:** 15 tests
- **Coverage:** ~70% of E2E scenarios

### Critical Paths Covered
✅ OAuth login flow
✅ Instance creation flow
✅ Instance lifecycle management
✅ Error handling
✅ Navigation flows

## Best Practices

### Writing New Tests

1. **Use Page Objects**
```typescript
const loginPage = new LoginPage(page);
await loginPage.goto();
await loginPage.waitForQRCode();
```

2. **Use Fixtures**
```typescript
test('my test', async ({ authenticatedPage }) => {
  // authenticatedPage is pre-authenticated
});
```

3. **Add Data Test IDs**
```tsx
<div data-testid="submit-button">Submit</div>
```

4. **Use Explicit Waits**
```typescript
await expect(element).toBeVisible();
await page.waitForURL('**/dashboard');
```

### Test Organization

- Group related tests with `test.describe()`
- Use `test.beforeEach()` for common setup
- Use descriptive test names
- Add comments for complex scenarios

## Resources

- [Playwright Documentation](https://playwright.dev/)
- [Page Object Model](https://playwright.dev/docs/pom)
- [Best Practices](https://playwright.dev/docs/best-practices)
- [Full Documentation](./README.md)
- [Test Summary](./E2E_TEST_SUMMARY.md)

## Getting Help

### Debug Mode
```bash
npx playwright test --debug
```
This opens inspector with step-by-step execution.

### UI Mode
```bash
npx playwright test --ui
```
Interactive UI for running and debugging tests.

### Trace Viewer
```bash
npx playwright show-trace test-results/traces/trace.zip
```
View detailed trace of test execution.

### Codegen
```bash
npx playwright codegen http://localhost:5173
```
Generate test code by interacting with the browser.

## Quick Reference

| Command | Description |
|---------|-------------|
| `pnpm run test:e2e` | Run all E2E tests |
| `pnpm run test:e2e:ui` | Run with interactive UI |
| `pnpm run test:e2e:debug` | Debug mode with inspector |
| `pnpm run test:e2e:headed` | Run in headed browser |
| `pnpm run test:e2e:report` | View HTML report |
| `npx playwright test -g "pattern"` | Run tests matching pattern |
| `npx playwright test --project=chromium` | Run specific browser project |
| `npx playwright install` | Install Playwright browsers |

---

**Happy Testing! 🎭**
