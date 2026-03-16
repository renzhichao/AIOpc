# Integration Test Suite Documentation

## Overview

This integration test suite provides comprehensive end-to-end testing for the AIOpc platform, replacing mock-based tests with real Docker, database, and API operations.

## Test Architecture

```
tests/
├── integration/
│   ├── e2e/                          # End-to-end tests
│   │   ├── complete-user-journey.e2e.test.ts
│   │   ├── oauth-flow.e2e.test.ts
│   │   └── container-lifecycle.e2e.test.ts
│   ├── performance/                  # Performance and concurrency tests
│   │   └── concurrent-operations.test.ts
│   └── helpers/                      # Test utilities and fixtures
│       ├── database.helper.ts
│       ├── docker.helper.ts
│       └── fixtures.ts
└── README.md                         # This file
```

## Key Features

- ✅ **Real Docker Operations**: Tests use actual Docker daemon and containers
- ✅ **Real Database**: Tests use actual PostgreSQL database
- ✅ **Complete User Journeys**: E2E tests covering full workflows
- ✅ **Performance Benchmarks**: Validates system performance under load
- ✅ **Error Scenarios**: Comprehensive error handling tests
- ✅ **Concurrency Testing**: Race condition and parallel operation tests
- ✅ **Isolated Tests**: Each test cleans up after itself
- ✅ **Detailed Logging**: Clear test progress and results

## Prerequisites

### 1. Docker Environment

Ensure Docker daemon is running and accessible:

```bash
# Verify Docker is running
docker ps

# Verify required image exists
docker images | grep openclaw/agent
```

If the image doesn't exist, build it first:

```bash
# From project root
cd platform/backend
docker build -t openclaw/agent:latest -f docker/Dockerfile .
```

### 2. Database Setup

Ensure PostgreSQL is running and test database exists:

```bash
# Using Docker Compose
cd platform/backend
docker-compose -f docker/docker-compose.dev.yml up -d postgres

# Verify database connection
psql -h localhost -U opclaw -d opclaw -c "SELECT 1;"
```

### 3. Environment Configuration

Create `.env.test` file:

```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=opclaw
DB_PASSWORD=opclaw
DB_NAME=opclaw

# DeepSeek API
DEEPSEEK_API_KEY=test-deepseek-api-key

# Feishu OAuth
FEISHU_APP_ID=test_feishu_app_id
FEISHU_APP_SECRET=test_feishu_app_secret
FEISHU_REDIRECT_URI=http://localhost:5173/oauth/callback

# JWT
JWT_SECRET=test-jwt-secret
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# Docker
DOCKER_SOCKET_PATH=/var/run/docker.sock
```

## Running Tests

### Run All Integration Tests

```bash
cd platform/backend
npm test -- tests/integration
```

### Run Specific Test Suite

```bash
# E2E tests
npm test -- tests/integration/e2e

# Performance tests
npm test -- tests/integration/performance

# Specific test file
npm test -- tests/integration/e2e/complete-user-journey.e2e.test.ts
```

### Run with Coverage

```bash
npm test -- tests/integration --coverage
```

### Run in Watch Mode

```bash
npm test -- tests/integration --watch
```

### Run with Verbose Output

```bash
npm test -- tests/integration --verbose
```

## Test Categories

### 1. Complete User Journey E2E Tests

**File**: `e2e/complete-user-journey.e2e.test.ts`

Tests the complete user journey from registration to deletion:

- User registration via OAuth
- API key allocation
- Instance creation (personal/team/enterprise)
- Container startup
- Instance usage
- Instance stop/start
- Instance deletion
- Resource cleanup

**Example**:
```bash
npm test -- complete-user-journey.e2e.test.ts
```

### 2. OAuth Flow E2E Tests

**File**: `e2e/oauth-flow.e2e.test.ts`

Tests OAuth authorization flow with Feishu:

- Authorization URL generation
- Callback handling
- Token exchange
- User creation/update
- JWT token generation
- Token refresh
- Security validation
- Performance benchmarks

**Example**:
```bash
npm test -- oauth-flow.e2e.test.ts
```

### 3. Container Lifecycle E2E Tests

**File**: `e2e/container-lifecycle.e2e.test.ts`

Tests Docker container lifecycle:

- Container creation
- Container configuration
- Network setup
- Volume mounting
- State transitions
- Resource monitoring
- Container removal
- Performance benchmarks

**Example**:
```bash
npm test -- container-lifecycle.e2e.test.ts
```

### 4. Concurrent Operations Tests

**File**: `performance/concurrent-operations.test.ts`

Tests system performance under load:

- Concurrent instance creation (3, 5, 10 instances)
- Parallel container operations
- Concurrent database operations
- Race condition prevention
- Scalability testing
- Performance benchmarks

**Example**:
```bash
npm test -- concurrent-operations.test.ts
```

## Test Helpers

### DatabaseHelper

Provides database utilities:

```typescript
import { DatabaseHelper } from '../helpers/database.helper';

// Connect to database
await DatabaseHelper.connect();

// Create test user
const user = await DatabaseHelper.createTestUser();

// Create test instance
const instance = await DatabaseHelper.createTestInstance(user);

// Clean up
await DatabaseHelper.clean();
await DatabaseHelper.disconnect();
```

### DockerHelper

Provides Docker utilities:

```typescript
import { DockerHelper } from '../helpers/docker.helper';

// Connect to Docker
await DockerHelper.connect();

// Verify image
const exists = await DockerHelper.verifyImage('openclaw/agent:latest');

// Get container status
const status = await DockerHelper.getContainerStatus(containerId);

// Clean up
await DockerHelper.removeAllTestContainers();
await DockerHelper.cleanupAll();
```

### TestFixtures

Provides test data and configurations:

```typescript
import { TestFixtures } from '../helpers/fixtures';

// Generate test user data
const userData = TestFixtures.generateTestUser();

// Generate test instance data
const instanceData = TestFixtures.generateTestInstance(userId);

// Get preset configuration
const personalPreset = TestFixtures.getPreset('personal');

// Performance benchmarks
const benchmark = TestFixtures.PERFORMANCE_BENCHMARKS.containerCreation;
```

## Performance Benchmarks

The test suite validates the following performance benchmarks:

| Operation | Target | Warning |
|-----------|--------|---------|
| Container Creation | 5s | 10s |
| Container Start | 3s | 5s |
| Container Stop | 2s | 4s |
| Container Removal | 2s | 4s |
| OAuth Flow | 2s | 5s |
| Instance Creation | 8s | 15s |

## Test Output

Successful test run:

```
✓ Docker daemon connected
✓ Test database connected
✓ openclaw/agent:latest image exists

=== Step 1: User Registration ===
✓ Authorization URL generated
✓ User registered via OAuth

=== Step 2: API Key Allocation ===
✓ API key allocated: sk-test-1234567890
✓ API key stored in database

=== Step 3: Instance Creation ===
✓ Instance created in 5234ms: test-inst-1234567890
✓ Creation time within acceptable range

...

=== Complete User Journey: SUCCESS ===

Tests: 45 passed, 45 total
Time: 2.345s
```

## Troubleshooting

### Docker Daemon Not Accessible

**Error**: `Docker daemon not accessible`

**Solution**:
```bash
# Start Docker daemon
sudo systemctl start docker  # Linux
open -a Docker  # macOS

# Verify connection
docker ps
```

### Required Image Not Found

**Error**: `Required image openclaw/agent:latest not found`

**Solution**:
```bash
# Build the image
cd platform/backend
docker build -t openclaw/agent:latest -f docker/Dockerfile .

# Verify image
docker images | grep openclaw
```

### Database Connection Failed

**Error**: `Database connection failed`

**Solution**:
```bash
# Start PostgreSQL
docker-compose -f docker/docker-compose.dev.yml up -d postgres

# Verify connection
psql -h localhost -U opclaw -d opclaw -c "SELECT 1;"
```

### Container Cleanup Issues

**Error**: `Failed to cleanup container`

**Solution**:
```bash
# Manually remove test containers
docker ps -a | grep test- | awk '{print $1}' | xargs docker rm -f

# Remove test networks
docker network ls | grep test- | awk '{print $1}' | xargs docker network rm

# Remove test volumes
docker volume ls | grep test- | awk '{print $2}' | xargs docker volume rm
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Integration Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_DB: opclaw
          POSTGRES_USER: opclaw
          POSTGRES_PASSWORD: opclaw
        ports:
          - 5432:5432

      docker:
        image: docker:dind
        options: --privileged

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: |
          cd platform/backend
          npm ci

      - name: Build Docker image
        run: |
          cd platform/backend
          docker build -t openclaw/agent:latest -f docker/Dockerfile .

      - name: Run integration tests
        run: |
          cd platform/backend
          npm test -- tests/integration
```

## Best Practices

### 1. Test Isolation

Each test should clean up after itself:

```typescript
afterEach(async () => {
  await DockerHelper.removeAllTestContainers();
  await DatabaseHelper.clean();
});
```

### 2. Idempotent Tests

Tests should be runnable multiple times without side effects:

```typescript
beforeEach(async () => {
  await DatabaseHelper.clean();
  testUser = await DatabaseHelper.createTestUser();
});
```

### 3. Descriptive Test Names

Use clear, descriptive test names:

```typescript
it('should create container with correct configuration', async () => {
  // Test implementation
});
```

### 4. Comprehensive Logging

Use logging for test progress:

```typescript
console.log('✓ Container created');
console.log(`✓ Container name: ${info.Name}`);
```

### 5. Performance Validation

Validate performance against benchmarks:

```typescript
expect(duration).toBeLessThan(
  TestFixtures.PERFORMANCE_BENCHMARKS.containerCreation.warning
);
```

## Contributing

When adding new tests:

1. Use test helpers for common operations
2. Follow existing test structure
3. Add comprehensive logging
4. Include performance benchmarks
5. Clean up resources
6. Update this documentation

## Test Coverage

Current test coverage:

- ✅ Complete user journeys
- ✅ OAuth authorization flow
- ✅ Container lifecycle
- ✅ Database operations
- ✅ Error scenarios
- ✅ Performance benchmarks
- ✅ Concurrency testing
- ✅ Race condition prevention

## Support

For issues or questions:

1. Check test output for specific errors
2. Review troubleshooting section
3. Verify prerequisites are met
4. Check test logs in `logs/test.log`

## License

MIT

## Authors

AIOpc Platform Team

---

**Last Updated**: 2025-03-16
