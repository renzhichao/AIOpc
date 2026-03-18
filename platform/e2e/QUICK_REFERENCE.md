# E2E Testing Quick Reference

## Quick Commands

```bash
# Setup (first time only)
cd platform/e2e
pnpm install
npx playwright install --with-deps

# Run tests
pnpm test                    # All tests
pnpm test auth.spec.ts       # OAuth tests only
pnpm test instance.spec.ts   # Instance tests only
pnpm test websocket.spec.ts  # WebSocket tests only

# Debug tests
pnpm test:ui                 # UI mode (interactive)
pnpm test:debug              # Debug mode (step-through)
pnpm test:headed             # Show browser window

# Reports
pnpm test:report             # View HTML report

# Verification
pnpm verify                  # Check acceptance criteria
```

## Test Files

| File | Tests | Coverage |
|------|-------|----------|
| `tests/auth.spec.ts` | 30+ | OAuth flow, QR code, session management |
| `tests/instance.spec.ts` | 25+ | Creation, lifecycle, renewal, deletion |
| `tests/websocket.spec.ts` | 20+ | Connection, messaging, reconnection |

## Helper Classes

| Helper | Purpose |
|--------|---------|
| `OAuthHelper` | Mock OAuth, setup sessions, test auth |
| `InstanceHelper` | Create instances, validate forms, test lifecycle |
| `WebSocketHelper` | Mock WebSocket, test connections, message handling |
| `APIHelper` | Mock API endpoints, authenticated requests |

## Writing a Test

```typescript
import { test, expect } from '@playwright/test';
import { OAuthHelper } from '../helpers/oauth-helper';

test.describe('My Feature', () => {
  test('should do something', async ({ page }) => {
    // Setup
    const oauthHelper = new OAuthHelper(page);
    await oauthHelper.setupMockSession({
      user_id: 'test-user',
      access_token: 'test-token',
    });

    // Act
    await page.goto('/my-page');
    await page.click('[data-testid="my-button"]');

    // Assert
    await expect(page.locator('[data-testid="result"]')).toBeVisible();
  });
});
```

## Best Practices

1. ✅ Use `data-testid` attributes for element selection
2. ✅ Mock all external API calls
3. ✅ Use helper classes for common operations
4. ✅ Write descriptive test names
5. ✅ Clean up in `afterEach` hooks
6. ✅ Use explicit waits over `waitForTimeout`

## Troubleshooting

**Test timeout?** Increase timeout in `playwright.config.ts`
**Element not found?** Add `data-testid` attribute to element
**Tests flaky?** Mock external APIs properly
**WebSocket fails?** Ensure `wsHelper.setupWebSocketMock()` is called

## CI/CD Integration

```yaml
- name: Run E2E tests
  run: |
    cd platform/e2e
    CI=true pnpm test

- name: Upload results
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: platform/e2e/playwright-report/
```

## Metrics

- Target pass rate: ≥95%
- Target execution time: <10 minutes
- Total test cases: 75+
- Browser support: Chromium, Firefox, WebKit, Mobile

## Documentation

- Full guide: `platform/e2e/README.md`
- Completion report: `platform/e2e/TASK-004-COMPLETION-REPORT.md`
