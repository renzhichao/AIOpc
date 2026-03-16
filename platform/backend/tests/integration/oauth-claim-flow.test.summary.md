# OAuth-Claim Flow Integration Tests (TASK-005)

## Overview

Comprehensive integration tests for the complete OAuth→Auto-Claim→QR Code flow for the AIOpc platform.

## Test File Location

`/Users/arthurren/projects/AIOpc/platform/backend/tests/integration/oauth-claim-flow.test.ts`

## Test Scenarios

### Scenario 1: User Login with Available Instance (Auto-Claim Flow)

**Test Case 1.1: Auto-claim available instance when user logs in**
- **Given**: An unclaimed instance exists in the database
- **When**: User authenticates via Feishu OAuth
- **Then**:
  - System auto-claims the instance for the user
  - User receives JWT tokens with `has_instance=true`
  - Response includes `instance_id`
  - User is redirected to `/chat`
  - Instance status changes to `active`
  - Instance `claimed_at` timestamp is set

**Test Case 1.2: Claim oldest unclaimed instance when multiple available**
- **Given**: Multiple unclaimed instances with different timestamps
- **When**: User authenticates via Feishu OAuth
- **Then**: System claims the oldest instance (created_at ASC)

**Test Case 1.3: No re-login for user with existing instance**
- **Given**: User already has a claimed instance
- **And**: Another unclaimed instance exists
- **When**: User logs in again via OAuth
- **Then**:
  - User does NOT claim the new instance
  - Response shows `has_instance=false`
  - Existing instance remains owned by user
  - Unclaimed instance remains unclaimed

### Scenario 2: User Login without Available Instance (QR Code Flow)

**Test Case 2.1: Return has_instance=false when no instances available**
- **Given**: No unclaimed instances exist in database
- **When**: User authenticates via Feishu OAuth
- **Then**:
  - User receives JWT tokens with `has_instance=false`
  - Response does NOT include `instance_id`
  - User is redirected to `/no-instance`
  - User is created in database

**Test Case 2.2: Generate QR code for unclaimed instance**
- **Given**: An unclaimed instance exists
- **When**: System generates QR code
- **Then**:
  - QR code URL is generated
  - URL contains Feishu OAuth authorization URL
  - URL includes encrypted token and state
  - QR code is stored in database
  - QR code has 24-hour expiration
  - Initial `scan_count` is 0
  - `claimed_at` is null

**Test Case 2.3: Update existing QR code when regenerating**
- **Given**: QR code already exists for instance
- **When**: New QR code is generated for same instance
- **Then**:
  - Old QR code is deleted
  - New QR code with different token is created
  - Only one QR code exists per instance

### Scenario 3: QR Code Verification and Claim Flow

**Test Case 3.1: Verify and claim instance via QR code**
- **Given**: Unclaimed instance with valid QR code
- **And**: Authenticated user
- **When**: User scans QR code and claims instance
- **Then**:
  - QR code token is validated
  - Instance is claimed for user
  - Instance status changes to `active`
  - QR code `claimed_at` timestamp is set

**Test Case 3.2: Prevent claiming already claimed instance**
- **Given**: Instance already claimed by User A
- **When**: User B tries to claim the same instance
- **Then**:
  - `findUnclaimed()` returns null
  - Instance remains owned by User A
  - User B does not get an instance

**Test Case 3.3: Record QR code scan count**
- **Given**: QR code exists
- **When**: QR code is scanned
- **Then**:
  - `scan_count` is incremented
  - Multiple scans are tracked correctly

### Scenario 4: Edge Cases

**Test Case 4.1: Handle expired QR codes**
- **Given**: QR code with expired timestamp
- **When**: System validates the QR code
- **Then**:
  - Validation returns `false`
  - Instance remains unclaimed

**Test Case 4.2: Handle invalid QR code tokens**
- **Given**: Non-existent or malformed token
- **When**: System validates the token
- **Then**: Validation returns `false`

**Test Case 4.3: Handle concurrent login attempts**
- **Given**: One unclaimed instance
- **And**: Two users login simultaneously
- **When**: Both users try to claim the instance
- **Then**:
  - Only one user successfully claims the instance
  - The other user does not get an instance
  - Database integrity is maintained

**Test Case 4.4: Cleanup expired QR codes**
- **Given**: Multiple expired QR codes
- **And**: One valid QR code
- **When**: Cleanup job runs
- **Then**:
  - Expired QR codes are deleted
  - Valid QR code remains
  - Correct count of deleted codes is returned

**Test Case 4.5: Handle database errors gracefully**
- **Given**: Database connection fails
- **When**: Any database operation is attempted
- **Then**:
  - Error is caught and logged
  - System does not crash
  - User receives appropriate error response

### Performance Tests

**Test Case P.1: Auto-claim flow performance**
- Expect completion within 5 seconds (per `TestFixtures.PERFORMANCE_BENCHMARKS.oauthFlow.warning`)

**Test Case P.2: QR code generation performance**
- Expect completion within 1 second

### Security Tests

**Test Case S.1: No sensitive information in error messages**
- Error messages should not leak internal details

**Test Case S.2: Secure random tokens for QR codes**
- Tokens should be unique
- Tokens should be sufficiently long (>20 characters)
- 100 consecutive tokens should all be different

**Test Case S.3: Appropriate QR code expiration**
- QR codes should expire in approximately 24 hours
- Expiration time should be within 23-25 hours

## Test Infrastructure

### Database Helper (`tests/integration/helpers/database.helper.ts`)

Provides utilities for:
- Database connection management
- Test data creation (users, instances, API keys, QR codes)
- Database cleanup between tests
- Transaction support
- Statistics and queries

### Test Fixtures (`tests/integration/helpers/fixtures.ts`)

Provides:
- Test data generators
- Performance benchmarks
- OAuth credentials
- Error scenarios
- Concurrent test configurations

### Environment Variables Required

```bash
# Feishu OAuth
FEISHU_APP_ID=test_feishu_app_id_oauth_claim
FEISHU_APP_SECRET=test_feishu_app_secret_oauth_claim
FEISHU_REDIRECT_URI=http://localhost:5173/oauth/callback
FEISHU_OAUTH_AUTHORIZE_URL=https://open.feishu.cn/open-apis/authen/v1/authorize
FEISHU_OAUTH_TOKEN_URL=https://open.feishu.cn/open-apis/authen/v1/oidc/access_token
FEISHU_USER_INFO_URL=https://open.feishu.cn/open-apis/authen/v1/user_info
FEISHU_ENCRYPT_KEY=test-encrypt-key-32-bytes-long!

# JWT
JWT_SECRET=test-jwt-secret-oauth-claim
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# Database (uses test database)
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=opclaw
DB_PASSWORD=opclaw
DB_NAME=opclaw
```

## Running the Tests

```bash
# Run all integration tests
npm test -- tests/integration/oauth-claim-flow.test.ts

# Run with coverage
npm test -- tests/integration/oauth-claim-flow.test.ts --coverage

# Run with verbose output
npm test -- tests/integration/oauth-claim-flow.test.ts --verbose

# Run specific test suite
npm test -- tests/integration/oauth-claim-flow.test.ts --testNamePattern="Scenario 1"
```

## Expected Test Results

- ✅ All 20+ test cases should pass
- ✅ Core flow code coverage > 80%
- ✅ Tests complete within 60 seconds
- ✅ No test data pollution in development database
- ✅ All resources cleaned up after tests

## Test Coverage

The integration tests cover the following components:

1. **OAuthService** (`src/services/OAuthService.ts`):
   - User authentication via Feishu
   - JWT token generation
   - Auto-claim logic
   - Token refresh

2. **QRCodeService** (`src/services/QRCodeService.ts`):
   - QR code generation
   - Token validation
   - Scan recording
   - Expired code cleanup

3. **InstanceRepository** (`src/repositories/InstanceRepository.ts`):
   - Finding unclaimed instances
   - Claiming instances
   - Instance status management

4. **UserRepository** (`src/repositories/UserRepository.ts`):
   - User creation
   - User lookup by Feishu ID
   - Last login tracking

5. **QRCodeRepository** (`src/repositories/QRCodeRepository.ts`):
   - QR code CRUD operations
   - Token lookup
   - Claim tracking

## Acceptance Criteria Status

| Criteria | Status |
|----------|--------|
| Test creating unclaimed instances | ✅ Implemented |
| Test login user auto-claims instance | ✅ Implemented |
| Test correct status when no instances available | ✅ Implemented |
| Test QR code generation | ✅ Implemented |
| Test QR code verification and claim | ✅ Implemented |
| Test re-login for users with claimed instances | ✅ Implemented |
| Test QR code expiry handling | ✅ Implemented |
| Core flow code coverage > 80% | ✅ Targeted |
| Automation via `npm test` | ✅ Configured |
| Test data isolation | ✅ Implemented |

## Notes

- Tests use mocked Feishu API calls via `jest.mock('axios')`
- Tests use isolated test database
- Each test cleans up after itself
- Tests follow TDD Red-Green-Refactor cycle
- Comprehensive logging for debugging

## Related Tasks

- **TASK-001**: OAuth Auto-Claim Integration
- **TASK-002**: Auth Middleware
- **TASK-003**: QR Code Service
- **TASK-004**: OAuth Callback Page (Frontend)

## Dependencies

- ✅ TASK-001: Completed
- ✅ TASK-002: Completed
- ✅ TASK-003: Completed
- ✅ TASK-004: Completed

---

**Last Updated**: 2025-03-16
**Status**: Implementation Complete (awaiting test environment fix)
