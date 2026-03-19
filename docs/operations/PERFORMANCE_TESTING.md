# Performance Testing Guide

**Purpose**: This guide explains how to run and interpret performance tests for the AIOpc platform using k6.

## Table of Contents

1. [Overview](#overview)
2. [Installation](#installation)
3. [Test Scenarios](#test-scenarios)
4. [Running Tests](#running-tests)
5. [Interpreting Results](#interpreting-results)
6. [Performance Baselines](#performance-baselines)
7. [Troubleshooting](#troubleshooting)
8. [Best Practices](#best-practices)

---

## Overview

The AIOpc platform uses **k6** for performance testing. k6 is an open-source load testing tool that helps you catch performance regressions and stress test your system.

### Test Architecture

```
platform/perf/
├── scenarios/           # Performance test scenarios
│   ├── baseline.js     # Baseline test (10 VUs, 1 min)
│   ├── normal.js       # Normal load (100 VUs, 5 min)
│   ├── peak.js         # Peak load (500 VUs, 5 min)
│   └── stress.js       # Stress test (2000+ VUs)
├── tests/              # Specialized load tests
│   ├── api-load.js     # REST API load test
│   └── websocket-load.js # WebSocket load test
├── k6.config.js        # k6 configuration
├── results/            # Test results (JSON)
└── reports/            # Test reports (HTML)
```

### Performance SLOs

The platform must meet these Service Level Objectives:

| Metric | Target | Threshold |
|--------|--------|-----------|
| **P95 Latency** | < 500ms | ⚠️ Warning: 500-1000ms |
| **P99 Latency** | < 1000ms | ❌ Critical: > 1000ms |
| **Error Rate** | < 0.1% | ⚠️ Warning: 0.1-1% |
| **Throughput** | Sufficient for load | Context-dependent |

---

## Installation

### Prerequisites

- Node.js v18+ (for running the platform)
- Bash shell (for test execution script)

### Install k6

#### macOS (Homebrew)

```bash
brew install k6
```

#### Linux (Debian/Ubuntu)

```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 \
  --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69

echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | \
  sudo tee /etc/apt/sources.list.d/k6.list

sudo apt-get update
sudo apt-get install k6
```

#### Linux (RHEL/CentOS/Fedora)

```bash
sudo dnf install https://dl.k6.io/rpm/repo.rpm
sudo dnf install k6
```

#### Or Use the Installation Script

```bash
./scripts/run-performance-test.sh --install
```

### Verify Installation

```bash
k6 version
# Expected output: k6 v0.xx.x
```

---

## Test Scenarios

### 1. Baseline Test (`baseline.js`)

**Purpose**: Establish baseline metrics under light load.

**Configuration**:
- **Virtual Users (VUs)**: 10
- **Duration**: 1 minute
- **Use Case**: Verify system meets SLOs under minimal load

**Tests Performed**:
- Health check (should always be < 100ms)
- User profile retrieval
- Instance listing
- System status

**When to Run**:
- After code changes
- Before deploying to staging
- To establish performance baseline

**Example Output**:
```
✓ health check status 200
✓ health check response time < 100ms
✓ profile status 200
✓ profile response time < 200ms
```

---

### 2. Normal Load Test (`normal.js`)

**Purpose**: Simulate expected daily load.

**Configuration**:
- **Virtual Users (VUs)**: 100
- **Duration**: 5 minutes
- **Use Case**: Verify system handles normal traffic within SLOs

**Tests Performed**:
- Dashboard access (most common operation)
- Instance listing (70% of users)
- Instance details view (50% of users)
- Create/update operations (20% of users)
- Notifications (40% of users)
- Preferences update (10% of users)

**When to Run**:
- Before major releases
- After infrastructure changes
- Weekly performance regression check

**Example Output**:
```
✓ dashboard loaded
✓ dashboard load time acceptable
✓ instances listed
✓ instances list time acceptable
```

---

### 3. Peak Load Test (`peak.js`)

**Purpose**: Simulate peak traffic scenarios.

**Configuration**:
- **Virtual Users (VUs)**: Ramp from 0 to 500
- **Duration**: 5 minutes
  - 1 min: Ramp up to 100 VUs
  - 3 min: Ramp up to 500 VUs (peak)
  - 1 min: Ramp down to 0
- **Use Case**: Verify system handles peak load without significant degradation

**Tests Performed**:
- High-frequency health checks
- Dashboard access
- Instance listing
- Instance status checks
- Metrics retrieval
- Notifications

**When to Run**:
- Before holiday seasons or marketing campaigns
- After scaling infrastructure
- To determine if current infrastructure can handle growth

**Example Output**:
```
✓ health check successful
✓ health check fast
✓ dashboard loaded
✓ dashboard responsive
```

---

### 4. Stress Test (`stress.js`)

**Purpose**: Find system breaking point and recovery capabilities.

**Configuration**:
- **Virtual Users (VUs)**: Ramp from 0 to 2000+
- **Duration**: 10 minutes
  - 2 min: Ramp to 100 VUs
  - 2 min: Ramp to 500 VUs
  - 2 min: Ramp to 1000 VUs
  - 2 min: Ramp to 2000 VUs
  - 2 min: Ramp down to 0
- **Use Case**: Identify system limits and ensure graceful degradation

**Tests Performed**:
- Basic health check (should always work)
- Authentication-dependent operations
- Instance listing (database intensive)
- Write operations (create instance)
- Metrics API (computationally intensive)

**When to Run**:
- Before infrastructure upgrades
- To determine maximum capacity
- After major architecture changes

**Example Output**:
```
=== Stress Test Results ===
Total authenticated users: 100
Maximum successful VU level: 850
First failure detected at:
  - VU Level: 950
  - Operation: instance_list
System breaking point: Approximately 950 concurrent users
```

---

### 5. API Load Test (`api-load.js`)

**Purpose**: Comprehensive load testing for all REST API endpoints.

**Configuration**:
- **Rate**: 100 requests per second
- **Duration**: 5 minutes
- **Test Type**: Sustained load

**Tests Performed**:
- Authentication & Authorization APIs
- Instance Management APIs (CRUD)
- Monitoring & Metrics APIs
- User & Preferences APIs
- File Operations APIs
- Search & Filter APIs
- Admin APIs

**When to Run**:
- Before API changes
- After database schema changes
- To identify slow endpoints

---

### 6. WebSocket Load Test (`websocket-load.js`)

**Purpose**: Load testing for WebSocket connections and real-time messaging.

**Configuration**:
- **Virtual Users (VUs)**: Ramp from 0 to 100
- **Duration**: 5 minutes
- **Test Type**: Connection and message throughput

**Tests Performed**:
- Connection establishment
- Message sending
- Message receiving
- Latency measurement
- Reconnection handling

**When to Run**:
- After WebSocket protocol changes
- After infrastructure scaling
- To test real-time features

---

## Running Tests

### Quick Start

1. **Run baseline test**:
   ```bash
   ./scripts/run-performance-test.sh baseline
   ```

2. **Run all tests**:
   ```bash
   ./scripts/run-performance-test.sh all
   ```

### Advanced Usage

#### Test Different Environments

```bash
# Test staging environment
./scripts/run-performance-test.sh normal --env staging --url https://staging.aiopclaw.com

# Test production (use caution!)
./scripts/run-performance-test.sh baseline --env prod --url https://api.aiopclaw.com
```

#### Specify Output Format

```bash
# Generate HTML report
./scripts/run-performance-test.sh peak --out html

# Generate both JSON and HTML
./scripts/run-performance-test.sh peak --out both
```

#### Enable Verbose Output

```bash
./scripts/run-performance-test.sh stress --verbose
```

#### Manual k6 Execution

If you prefer running k6 directly:

```bash
# Set environment variables
export BASE_URL=http://localhost:3000
export ENVIRONMENT=dev

# Run a specific test
k6 run platform/perf/scenarios/baseline.js

# Run with output file
k6 run --out json=results.json platform/perf/scenarios/normal.js
```

---

## Interpreting Results

### Understanding k6 Output

```
✓ health check status 200
✓ health check response time < 100ms

checks.........................: 100.00% ✓ 1000      ✗ 0
data_received..................: 2.4 MB 400 kB/s
data_sent......................: 500 kB  8.3 kB/s
http_req_blocked...............: avg=1ms    min=0µs    med=1ms    max=50ms   p(95)=2ms    p(99)=5ms
http_req_connecting............: avg=1ms    min=0µs    med=1ms    max=48ms   p(95)=2ms    p(99)=4ms
http_req_duration..............: avg=150ms  min=10ms   med=120ms  max=800ms  p(95)=300ms  p(99)=500ms
{ expected_response:true }...: avg=150ms  min=10ms   med=120ms  max=800ms  p(95)=300ms  p(99)=500ms
http_req_failed................: 0.00%   ✓ 0        ✗ 1000
http_req_receiving.............: avg=5ms    min=10µs   med=3ms    max=100ms  p(95)=10ms   p(99)=20ms
http_req_sending...............: avg=2ms    min=5µs    med=1ms    max=50ms   p(95)=5ms    p(99)=10ms
http_req_tls_handshaking.......: avg=0s     min=0s     med=0s     max=1s     p(95)=0s     p(99)=1s
http_req_waiting...............: avg=143ms  min=10ms   med=116ms  max=750ms  p(95)=290ms  p(99)=480ms
http_reqs......................: 1000    16.666671/s
iteration_duration.............: avg=5s     min=1s     med=5s     max=10s    p(95)=9s     p(99)=10s
iterations.....................: 200     3.333334/s
vus............................: 10      min=10     max=10
vus_max........................: 10      min=10     max=10
```

### Key Metrics Explained

| Metric | Meaning | Good | Warning | Critical |
|--------|---------|------|---------|----------|
| **checks** | Percentage of checks passed | 100% | 95-99% | < 95% |
| **http_req_duration** | Total request time | < 500ms | 500-1000ms | > 1000ms |
| **http_req_duration p(95)** | 95th percentile latency | < 500ms | 500-1000ms | > 1000ms |
| **http_req_duration p(99)** | 99th percentile latency | < 1000ms | 1000-2000ms | > 2000ms |
| **http_req_failed** | Failed request rate | < 0.1% | 0.1-1% | > 1% |
| **http_reqs** | Total requests | - | - | - |

### Reading the Results

1. **Check the `checks` metric**: This shows how many assertions passed. Ideally 100%.

2. **Look at `http_req_duration`**:
   - `avg`: Average response time
   - `med`: Median response time (p50)
   - `p(95)`: 95th percentile (SLO target: < 500ms)
   - `p(99)`: 99th percentile (SLO target: < 1000ms)

3. **Check `http_req_failed`**: This should be 0.00% or very close to it.

4. **Review `vus`**: Virtual Users. This shows how many concurrent users were simulated.

### Example: Good Performance

```
✓ All checks passed
http_req_duration p(95)=300ms p(99)=500ms
http_req_failed=0.00%
```

**Verdict**: ✅ System meets all SLOs

### Example: Performance Degradation

```
✗ Some checks failed
http_req_duration p(95)=800ms p(99)=1500ms
http_req_failed=0.05%
```

**Verdict**: ⚠️ System is slow but functional. Investigate bottlenecks.

### Example: Critical Failure

```
✗ Many checks failed
http_req_duration p(95)=2000ms p(99)=5000ms
http_req_failed=5.20%
```

**Verdict**: ❌ System is failing. Immediate investigation required.

---

## Performance Baselines

### Establishing Baselines

Run baseline tests on a known-good system to establish performance baselines:

```bash
./scripts/run-performance-test.sh baseline --out json
```

Record the results in `platform/perf/baselines.json`:

```json
{
  "baseline": {
    "date": "2026-03-18",
    "environment": "dev",
    "metrics": {
      "p50_latency": 120,
      "p95_latency": 300,
      "p99_latency": 500,
      "throughput_rps": 16.67,
      "error_rate": 0.0
    },
    "infrastructure": {
      "cpu": "4 cores",
      "memory": "8GB",
      "database": "PostgreSQL 14"
    }
  }
}
```

### Comparing Against Baselines

After code changes, run the same test and compare:

```bash
# Run test
./scripts/run-performance-test.sh baseline

# Compare with baseline (if jq is installed)
jq '.metrics.http_req_duration' results/baseline_*.json
```

### Regression Detection

If performance degrades significantly (> 20% slower):

1. **Investigate recent code changes**
2. **Check database queries**
3. **Review infrastructure metrics**
4. **Run profiling tools**

---

## Troubleshooting

### Common Issues

#### 1. k6 Not Installed

**Error**: `k6: command not found`

**Solution**:
```bash
./scripts/run-performance-test.sh --install
```

#### 2. Connection Refused

**Error**: `dial tcp 127.0.0.1:3000: connect: connection refused`

**Solution**: Ensure the platform is running:
```bash
# Check if platform is running
curl http://localhost:3000/health

# If not, start the platform
cd platform/backend && npm start
```

#### 3. Authentication Failures

**Error**: `401 Unauthorized` or `403 Forbidden`

**Solution**: Ensure test users exist in the database:
```bash
# Create test user
psql -U opclaw -d opclaw
INSERT INTO users (username, password_hash) VALUES ('baseline_test_user', '...');
```

#### 4. Timeouts During Stress Test

**Error**: `context deadline exceeded`

**Solution**:
- Increase timeout in k6 options
- Check system resources (CPU, memory)
- Review database connection pool
- Check network bandwidth

#### 5. High Memory Usage

**Symptom**: k6 process consumes lots of memory

**Solution**:
- Reduce number of VUs
- Shorten test duration
- Limit result retention time

---

## Best Practices

### 1. Run Tests Regularly

- **Before every deployment** to staging
- **Weekly** on staging environment
- **Monthly** on production (with caution)

### 2. Use Different Environments

- **Dev**: Quick smoke tests after code changes
- **Staging**: Full test suite before releases
- **Production**: Only baseline tests during off-peak hours

### 3. Monitor During Tests

While running performance tests, monitor:
- CPU usage (target: < 70%)
- Memory usage (target: < 80%)
- Database connections (target: < 80% of pool)
- Network bandwidth (target: < 70%)

### 4. Keep Test Isolated

- Don't run performance tests on production during business hours
- Use dedicated test databases
- Clean up test data after tests

### 5. Automate Performance Regression

Add to CI/CD pipeline:

```yaml
# .github/workflows/performance.yml
name: Performance Tests

on:
  pull_request:
    branches: [main]

jobs:
  performance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Install k6
        run: |
          sudo gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
          echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
          sudo apt-get update
          sudo apt-get install k6
      - name: Run baseline test
        run: ./scripts/run-performance-test.sh baseline
```

### 6. Document Results

Keep a performance test log:

```
## Performance Test Log - March 2026

| Date | Environment | Scenario | P95 Latency | P99 Latency | Error Rate | Verdict |
|------|-------------|----------|-------------|-------------|------------|---------|
| 03-18 | dev | baseline | 300ms | 500ms | 0% | ✅ Pass |
| 03-18 | dev | normal | 450ms | 800ms | 0% | ✅ Pass |
| 03-18 | staging | baseline | 350ms | 600ms | 0% | ✅ Pass |
| 03-19 | prod | baseline | 280ms | 480ms | 0% | ✅ Pass |
```

---

## Quick Reference

### Run All Tests

```bash
./scripts/run-performance-test.sh all
```

### Run Specific Scenario

```bash
./scripts/run-performance-test.sh baseline
./scripts/run-performance-test.sh normal
./scripts/run-performance-test.sh peak
./scripts/run-performance-test.sh stress
./scripts/run-performance-test.sh api-load
./scripts/run-performance-test.sh ws-load
```

### Test Different URL

```bash
./scripts/run-performance-test.sh normal --url https://staging.example.com
```

### Generate HTML Report

```bash
./scripts/run-performance-test.sh peak --out html
```

### View Results

```bash
# JSON results
cat platform/perf/results/*.json

# HTML reports
open platform/perf/reports/*.html
```

---

## Support

For issues or questions:
- Check k6 documentation: https://k6.io/docs/
- Review test logs: `platform/perf/results/`
- Check system logs: `/var/log/opclaw/`
- Open an issue on GitHub

---

**Last Updated**: 2026-03-18
**Version**: 1.0.0
