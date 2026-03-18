/**
 * Peak Load Performance Test
 *
 * Purpose: Simulate peak traffic scenarios (e.g., business hours, marketing campaigns)
 * Load: Ramp from 0 to 500 concurrent users over 5 minutes
 * Use case: Verify system handles peak load without significant degradation
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { scenarios, makeAuthRequest, checkResponse, BASE_URL } from '../k6.config.js';

// Test configuration
export const options = {
  scenarios: {
    peak: scenarios.peak,
  },
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.01'],
  },
};

// Test data - simulate larger user pool
const USER_POOL_SIZE = 50;
const TEST_USERS = Array.from({ length: USER_POOL_SIZE }, (_, i) => ({
  username: `peak_user_${i}`,
  password: 'TestPassword123!',
}));

export function setup() {
  // Setup: Login multiple users
  const tokens = [];
  const loginUrl = `${BASE_URL}/api/auth/login`;

  TEST_USERS.forEach((user) => {
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
  });

  console.log(`Setup completed with ${tokens.length} authenticated users`);
  return { tokens };
}

export default function(data) {
  // Each VU uses a unique token from the pool
  const vuIndex = __VU % data.tokens.length;
  const token = data.tokens[vuIndex];

  // Peak load simulation: mix of read-heavy and write operations

  // Operation 1: Quick health check (high frequency)
  const health = http.get(`${BASE_URL}/health`, {
    tags: { name: 'HealthCheck' },
  });
  check(health, {
    'health check successful': (r) => r.status === 200,
    'health check fast': (r) => r.timings.duration < 100,
  });

  sleep(0.05); // Minimal think time during peak

  // Operation 2: Dashboard access (high frequency)
  const dashboard = makeAuthRequest(`${BASE_URL}/api/dashboard`, 'GET', null, token);
  checkResponse(dashboard, {
    'dashboard loaded': (r) => r.status === 200,
    'dashboard responsive': (r) => r.timings.duration < 600,
  });

  sleep(0.1);

  // Operation 3: Instance listing (high frequency - read operation)
  const instances = makeAuthRequest(`${BASE_URL}/api/instances`, 'GET', null, token);
  checkResponse(instances, {
    'instances listed': (r) => r.status === 200,
    'instances list responsive': (r) => r.timings.duration < 500,
  });

  sleep(0.1);

  // Operation 4: Instance status check (if instances exist)
  if (instances.json('length') > 0) {
    const instanceId = instances.json('0').id;
    const status = makeAuthRequest(
      `${BASE_URL}/api/instances/${instanceId}/status`,
      'GET',
      null,
      token
    );
    checkResponse(status, {
      'instance status retrieved': (r) => r.status === 200,
      'status check responsive': (r) => r.timings.duration < 400,
    });

    sleep(0.1);
  }

  // Operation 5: Metrics retrieval (high frequency during peak)
  const metrics = makeAuthRequest(`${BASE_URL}/api/metrics`, 'GET', null, token);
  checkResponse(metrics, {
    'metrics retrieved': (r) => r.status === 200,
    'metrics responsive': (r) => r.timings.duration < 600,
  });

  sleep(0.1);

  // Operation 6: Notification check (medium frequency)
  if (Math.random() < 0.6) {
    const notifications = makeAuthRequest(
      `${BASE_URL}/api/notifications`,
      'GET',
      null,
      token
    );
    checkResponse(notifications, {
      'notifications loaded': (r) => r.status === 200,
      'notifications responsive': (r) => r.timings.duration < 400,
    });

    sleep(0.05);
  }

  // Operation 7: Quick read operation (logs, events)
  if (Math.random() < 0.4) {
    const logs = makeAuthRequest(
      `${BASE_URL}/api/instances/instance-001/logs?limit=50`,
      'GET',
      null,
      token
    );
    checkResponse(logs, {
      'logs retrieved': (r) => r.status === 200 || r.status === 404,
      'logs responsive': (r) => r.timings.duration < 500,
    });

    sleep(0.05);
  }

  // Minimal think time during peak - simulate active users
  sleep(Math.random() * 0.5 + 0.2);
}

export function teardown(data) {
  console.log(`Peak test completed. Total authenticated users: ${data.tokens.length}`);
}
