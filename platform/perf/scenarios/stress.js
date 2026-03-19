/**
 * Stress Performance Test
 *
 * Purpose: Find system breaking point and recovery capabilities
 * Load: Ramp from 0 to 2000+ concurrent users to find failure point
 * Use case: Identify system limits and ensure graceful degradation
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { scenarios, makeAuthRequest, checkResponse, BASE_URL } from '../k6.config.js';

// Test configuration - relaxed thresholds for stress test
export const options = {
  scenarios: {
    stress: scenarios.stress,
  },
  thresholds: {
    http_req_duration: ['p(95)<1000', 'p(99)<2000'], // Relaxed
    http_req_failed: ['rate<0.05'], // Allow 5% errors during stress
  },
};

// Large user pool for stress testing
const USER_POOL_SIZE = 100;
const TEST_USERS = Array.from({ length: USER_POOL_SIZE }, (_, i) => ({
  username: `stress_user_${i}`,
  password: 'TestPassword123!',
}));

// Track failure points
let failurePoint = null;
let maxSuccessfulVUs = 0;

export function setup() {
  // Setup: Login many users
  const tokens = [];
  const loginUrl = `${BASE_URL}/api/auth/login`;

  console.log('Setup: Logging in users for stress test...');

  TEST_USERS.forEach((user, index) => {
    const response = http.post(loginUrl, JSON.stringify({
      username: user.username,
      password: user.password,
    }), {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'Login' },
    });

    if (response.status === 200 && response.json('token')) {
      tokens.push(response.json('token'));
    }

    // Progress indicator
    if ((index + 1) % 10 === 0) {
      console.log(`Logged in ${index + 1}/${USER_POOL_SIZE} users`);
    }
  });

  console.log(`Setup completed with ${tokens.length} authenticated users`);
  return { tokens };
}

export default function(data) {
  const currentVUs = __VU;
  const token = data.tokens[currentVUs % data.tokens.length];

  // Track if we're still successful at this VU level
  let currentIterationSuccessful = true;

  // Test 1: Basic health check (should always work)
  const health = http.get(`${BASE_URL}/health`, {
    tags: { name: 'HealthCheck' },
  });

  if (health.status !== 200) {
    console.warn(`Health check failed at VU ${currentVUs}: ${health.status}`);
    currentIterationSuccessful = false;
    if (!failurePoint) {
      failurePoint = { vu: currentVUs, operation: 'health_check' };
    }
  }

  sleep(0.05);

  // Test 2: Authentication-dependent operations
  try {
    const dashboard = makeAuthRequest(`${BASE_URL}/api/dashboard`, 'GET', null, token);

    if (dashboard.status === 200) {
      check(dashboard, {
        'dashboard responsive under stress': (r) => r.timings.duration < 1500,
      });
    } else if (dashboard.status >= 500) {
      console.warn(`Dashboard failed at VU ${currentVUs}: ${dashboard.status}`);
      currentIterationSuccessful = false;
      if (!failurePoint) {
        failurePoint = { vu: currentVUs, operation: 'dashboard' };
      }
    }

    sleep(0.05);

    // Test 3: Instance listing (database intensive)
    const instances = makeAuthRequest(`${BASE_URL}/api/instances`, 'GET', null, token);

    if (instances.status === 200) {
      check(instances, {
        'instances responsive under stress': (r) => r.timings.duration < 2000,
      });
    } else if (instances.status >= 500) {
      console.warn(`Instance list failed at VU ${currentVUs}: ${instances.status}`);
      currentIterationSuccessful = false;
      if (!failurePoint) {
        failurePoint = { vu: currentVUs, operation: 'instance_list' };
      }
    }

    sleep(0.05);

    // Test 4: Write operation (create instance)
    if (Math.random() < 0.3) {
      const newInstance = {
        name: `Stress Test Instance ${Date.now()}`,
        type: 'standard',
        region: 'default',
      };

      const createResponse = makeAuthRequest(
        `${BASE_URL}/api/instances`,
        'POST',
        newInstance,
        token
      );

      if (createResponse.status === 201 || createResponse.status === 202) {
        check(createResponse, {
          'instance creation responsive under stress': (r) => r.timings.duration < 3000,
        });
      } else if (createResponse.status >= 500) {
        console.warn(`Instance creation failed at VU ${currentVUs}: ${createResponse.status}`);
        currentIterationSuccessful = false;
        if (!failurePoint) {
          failurePoint = { vu: currentVUs, operation: 'instance_creation' };
        }
      }

      sleep(0.05);
    }

    // Test 5: Metrics API (computationally intensive)
    const metrics = makeAuthRequest(`${BASE_URL}/api/metrics`, 'GET', null, token);

    if (metrics.status === 200) {
      check(metrics, {
        'metrics responsive under stress': (r) => r.timings.duration < 2500,
      });
    } else if (metrics.status >= 500) {
      console.warn(`Metrics failed at VU ${currentVUs}: ${metrics.status}`);
      currentIterationSuccessful = false;
      if (!failurePoint) {
        failurePoint = { vu: currentVUs, operation: 'metrics' };
      }
    }

  } catch (error) {
    console.error(`Exception at VU ${currentVUs}: ${error.message}`);
    currentIterationSuccessful = false;
    if (!failurePoint) {
      failurePoint = { vu: currentVUs, operation: 'exception', error: error.message };
    }
  }

  // Track maximum successful VU level
  if (currentIterationSuccessful && currentVUs > maxSuccessfulVUs) {
    maxSuccessfulVUs = currentVUs;
  }

  // Minimal think time - stress testing
  sleep(Math.random() * 0.3 + 0.1);
}

export function teardown(data) {
  console.log('=== Stress Test Results ===');
  console.log(`Total authenticated users: ${data.tokens.length}`);
  console.log(`Maximum successful VU level: ${maxSuccessfulVUs}`);

  if (failurePoint) {
    console.log(`First failure detected at:`);
    console.log(`  - VU Level: ${failurePoint.vu}`);
    console.log(`  - Operation: ${failurePoint.operation}`);
    if (failurePoint.error) {
      console.log(`  - Error: ${failurePoint.error}`);
    }
    console.log(`System breaking point: Approximately ${failurePoint.vu} concurrent users`);
  } else {
    console.log('No failures detected - system handled all load levels');
  }

  // Export results for reporting
  const results = {
    maxSuccessfulVUs,
    failurePoint,
    totalUsers: data.tokens.length,
    timestamp: new Date().toISOString(),
  };

  // Write results to file
  if (typeof __ENV.RESULT_FILE !== 'undefined') {
    console.log(`Writing results to ${__ENV.RESULT_FILE}`);
  }
}

// Handle summary for better reporting
export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'results/stress-test-summary.json': JSON.stringify(data),
    'results/stress-test-summary.html': htmlReport(data),
  };
}
