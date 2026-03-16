# E2E Testing Framework

Complete end-to-end testing framework for the AIOpc Platform backend, validating the full user journey from OAuth authentication through instance creation, usage, and deletion.

## Overview

The E2E testing framework provides comprehensive validation of:

- **OAuth Flow**: Feishu authorization, callback handling, JWT token generation
- **Instance Lifecycle**: Creation, start, stop, restart, deletion
- **Docker Integration**: Container creation, configuration, state management
- **Database Operations**: User, instance, and API key management
- **API Key Management**: Allocation, binding, and release
- **Metrics Collection**: Container stats and health monitoring
- **Error Recovery**: Failure scenarios and graceful degradation

## Architecture

```
tests/e2e/
├── orchestrator.ts          # Test environment setup/teardown
├── assertions.ts             # Custom E2E assertions
├── reporter.ts               # Test report generation
├── scenarios/                # E2E test scenarios
│   └── complete-user-journey.e2e.test.ts
└── README.md                 # This file
```

### Components

#### 1. E2E Orchestrator (`orchestrator.ts`)

Coordinates test execution with proper setup/teardown:

- **Environment Setup**: Database, Docker, configuration
- **Test Execution**: Scenario orchestration and result tracking
- **Environment Teardown**: Cleanup and report generation
- **Utilities**: Wait conditions, retry logic

```typescript
const orchestrator = E2EOrchestrator.getInstance();
await orchestrator.setup();

await orchestrator.executeScenario('My Test', async () => {
  // Test implementation
});

const report = await orchestrator.teardown();
```

#### 2. E2E Assertions (`assertions.ts`)

Semantic assertions for E2E validation:

```typescript
// Container assertions
await E2EAssertions.assertContainerExists(containerId);
await E2EAssertions.assertContainerRunning(instanceId);
await E2EAssertions.assertContainerStopped(instanceId);
await E2EAssertions.assertContainerConfig(containerId, { ... });

// Database assertions
await E2EAssertions.assertInstanceExists(instanceId);
await E2EAssertions.assertInstanceStatus(instanceId, 'active');
await E2EAssertions.assertApiKeyAllocated(userId);
await E2EAssertions.assertUserInstanceCount(userId, 3);

// Metrics assertions
await E2EAssertions.assertMetricsCollected(instanceId);
await E2EAssertions.assertResourceUsage(instanceId, {
  maxCpuPercent: 80,
  maxMemoryPercent: 90,
});
```

#### 3. E2E Reporter (`reporter.ts`)

Generates comprehensive test reports:

- **Text Reports**: Console-friendly summaries
- **JSON Reports**: Machine-readable data
- **HTML Reports**: Interactive visualization
- **JUnit Reports**: CI/CD integration

```typescript
E2EReporter.generateReport(report, {
  format: 'all',
  includeStackTrace: true,
  includePerformanceMetrics: true,
  includeCoverage: true,
});
```

## Running Tests

### Prerequisites

1. **Docker**: Installed and running
2. **PostgreSQL**: Running on localhost:5432
3. **Redis**: Running on localhost:6379
4. **Node.js**: v20 or higher
5. **Docker Image**: `openclaw/agent:latest` built and available

### Local Development

```bash
# Run all E2E tests
npm run test:e2e

# Run with debug output
npm run test:e2e:debug

# Run with coverage
npm run test:e2e:coverage

# Run specific test scenario
npm run test:e2e -- --testNamePattern="Complete User Journey"
```

### CI/CD Integration

Tests run automatically on:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches
- Manual workflow dispatch

View results in:
- GitHub Actions logs
- Test report artifacts
- PR comments (on pull requests)

## Test Scenarios

### Complete User Journey

Validates the full user journey from OAuth to instance deletion:

1. OAuth authorization URL generation
2. OAuth callback and user creation
3. API key allocation
4. Instance creation (personal/team/enterprise templates)
5. Container startup and verification
6. Metrics collection
7. Instance stop
8. Instance restart (optional)
9. Instance deletion
10. Container removal
11. API key release

### Multi-Instance Management

Tests managing multiple instances:

- Create multiple instances with different templates
- Verify all containers running independently
- Test isolation between instances
- Validate resource allocation
- Cleanup all instances

### Error Recovery

Validates error handling and recovery:

- Invalid template rejection
- Orphaned container cleanup
- Database transaction rollback
- Graceful degradation

## Test Data

### Fixtures

Test fixtures provide reusable test data:

```typescript
// Generate test user
const userData = TestFixtures.generateTestUser({
  name: 'Custom User',
  email: 'custom@example.com',
});

// Generate test instance
const instanceData = TestFixtures.generateTestInstance(userId, {
  template: 'team',
  status: 'active',
});

// Performance benchmarks
const benchmark = TestFixtures.PERFORMANCE_BENCHMARKS.containerCreation;
expect(duration).toBeLessThan(benchmark.warning);
```

## Performance Benchmarks

The framework validates performance against benchmarks:

| Operation | Target | Warning |
|-----------|--------|---------|
| Container Creation | 5000ms | 10000ms |
| Container Start | 3000ms | 5000ms |
| Container Stop | 2000ms | 4000ms |
| Container Remove | 2000ms | 4000ms |
| OAuth Flow | 2000ms | 5000ms |
| Instance Creation | 8000ms | 15000ms |

## Coverage Metrics

E2E tests cover:

- **User Journeys**: 100% of primary user flows
- **API Endpoints**: All major endpoints
- **Database Operations**: CRUD for all entities
- **Docker Operations**: Full container lifecycle
- **Error Scenarios**: Common failure modes
- **Edge Cases**: Boundary conditions

## Troubleshooting

### Docker Issues

**Problem**: Docker daemon not accessible
```bash
# Check Docker status
sudo systemctl status docker

# Start Docker
sudo systemctl start docker

# Add user to docker group
sudo usermod -aG docker $USER
```

**Problem**: Required image not found
```bash
# Build required image
docker build -t openclaw/agent:latest .

# Verify image exists
docker images | grep openclaw
```

### Database Issues

**Problem**: Database connection failed
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Start PostgreSQL
sudo systemctl start postgresql

# Verify connection
psql -h localhost -U opclaw -d opclaw
```

### Test Failures

**Problem**: Container cleanup failed
```bash
# Remove test containers manually
docker ps -a | grep test | awk '{print $1}' | xargs docker rm -f

# Remove test network
docker network rm opclaw-network-test
```

**Problem**: Database not cleaned up
```bash
# Connect to database
psql -h localhost -U opclaw -d opclaw

# Drop test data
DELETE FROM instances WHERE instance_id LIKE 'test-%';
DELETE FROM api_keys WHERE key LIKE 'sk-test-%';
DELETE FROM users WHERE feishu_user_id LIKE 'test-%';
```

## Contributing

### Adding New Test Scenarios

1. Create test file in `tests/e2e/scenarios/`
2. Import orchestrator and assertions
3. Implement test scenario
4. Use `orchestrator.executeScenario()` for tracking

```typescript
import { E2EOrchestrator } from '../orchestrator';
import { E2EAssertions } from '../assertions';

describe('My E2E Scenario', () => {
  let orchestrator: E2EOrchestrator;

  beforeAll(async () => {
    orchestrator = E2EOrchestrator.getInstance();
    await orchestrator.setup();
  });

  it('should test something', async () => {
    await orchestrator.executeScenario('My Test', async () => {
      // Test implementation
      await E2EAssertions.assertContainerExists(containerId);
    });
  });

  afterAll(async () => {
    await orchestrator.teardown();
  });
});
```

### Best Practices

1. **Use Orchestrator**: Always use `orchestrator.executeScenario()` for test tracking
2. **Assert Everything**: Use E2E assertions for all validations
3. **Clean Up**: Ensure resources are cleaned up after each test
4. **Test Isolation**: Each test should be independent
5. **Performance**: Validate operations complete within benchmarks
6. **Error Cases**: Test both success and failure scenarios
7. **Documentation**: Add clear comments explaining test logic

## CI/CD

### GitHub Actions

E2E tests run in CI/CD with:

- **PostgreSQL Service**: Containerized database
- **Redis Service**: Containerized cache
- **Docker DinD**: Docker-in-Docker for container tests
- **Multiple Node Versions**: Matrix testing for compatibility
- **Multiple PostgreSQL Versions**: Database compatibility

### Artifacts

Test results are stored as artifacts:

- **Test Reports**: Text, JSON, HTML formats
- **JUnit XML**: For test result visualization
- **Coverage Reports**: Code coverage metrics
- **Screenshots**: On failure (if applicable)

### Status Badges

Add to README:

```markdown
![E2E Tests](https://github.com/your-org/AIOpc/workflows/Backend%20E2E%20Tests/badge.svg)
```

## Maintenance

### Updating Tests

When adding new features:

1. Update test scenarios
2. Add new assertions
3. Update performance benchmarks
4. Add coverage for new endpoints
5. Update documentation

### Monitoring

Regular maintenance tasks:

- Review test execution times
- Update performance benchmarks
- Clean up test artifacts
- Update dependencies
- Review failure patterns

## References

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Dockerode Documentation](https://github.com/apocas/dockerode)
- [TypeORM Documentation](https://typeorm.io/)
- [Platform Architecture](../../docs/01-technical-architecture-local.md)
- [API Documentation](../../docs/api/README.md)

## Support

For issues or questions:

1. Check troubleshooting section
2. Review existing test scenarios
3. Check GitHub Actions logs
4. Open issue with details

---

**Last Updated**: 2026-03-16
**Version**: 1.0.0
