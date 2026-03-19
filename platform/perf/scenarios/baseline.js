/**
 * Baseline Performance Test
 *
 * Purpose: Establish baseline metrics under light load
 * Load: 10 concurrent users for 1 minute
 * Use case: Verify system meets SLOs under minimal load
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { scenarios, makeAuthRequest, checkResponse, BASE_URL } from '../k6.config.js';

// Test configuration
export const options = {
  scenarios: {
    baseline: scenarios.baseline,
  },
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.01'],
  },
};

// Test data
const TEST_USER = {
  username: 'baseline_test_user',
  password: 'TestPassword123!',
};

let authToken = null;

export function setup() {
  // Setup: Login to get auth token
  const loginUrl = `${BASE_URL}/api/auth/login`;
  const payload = {
    username: TEST_USER.username,
    password: TEST_USER.password,
  };

  const response = http.post(loginUrl, JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
  });

  if (response.status === 200 && response.json('token')) {
    return { token: response.json('token') };
  }

  return null;
}

export default function(data) {
  // Use auth token from setup
  authToken = data ? data.token : null;

  // Test 1: Health check
  const healthCheck = http.get(`${BASE_URL}/health`);
  checkResponse(healthCheck, {
    'health check status 200': (r) => r.status === 200,
    'health check response time < 100ms': (r) => r.timings.duration < 100,
  });

  sleep(0.1);

  // Test 2: Get user profile
  if (authToken) {
    const profile = makeAuthRequest(`${BASE_URL}/api/user/profile`, 'GET', null, authToken);
    checkResponse(profile, {
      'profile status 200': (r) => r.status === 200,
      'profile response time < 200ms': (r) => r.timings.duration < 200,
    });
    sleep(0.1);
  }

  // Test 3: List instances (light read operation)
  if (authToken) {
    const instances = makeAuthRequest(`${BASE_URL}/api/instances`, 'GET', null, authToken);
    checkResponse(instances, {
      'instances list status 200': (r) => r.status === 200,
      'instances list response time < 300ms': (r) => r.timings.duration < 300,
    });
    sleep(0.2);
  }

  // Test 4: Get system status
  const status = http.get(`${BASE_URL}/api/status`);
  checkResponse(status, {
    'status API status 200': (r) => r.status === 200,
    'status API response time < 150ms': (r) => r.timings.duration < 150,
  });

  sleep(0.3); // Think time between iterations
}

export function teardown(data) {
  // Cleanup: Logout if needed
  if (data && data.token) {
    // Optionally logout to clean up session
  }
}
