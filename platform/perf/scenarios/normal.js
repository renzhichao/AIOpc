/**
 * Normal Load Performance Test
 *
 * Purpose: Simulate expected daily load
 * Load: 100 concurrent users for 5 minutes
 * Use case: Verify system handles normal traffic within SLOs
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { scenarios, makeAuthRequest, checkResponse, BASE_URL } from '../k6.config.js';

// Test configuration
export const options = {
  scenarios: {
    normal: scenarios.normal,
  },
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.01'],
  },
};

// Test data
const TEST_USERS = [
  { username: 'normal_user_1', password: 'TestPassword123!' },
  { username: 'normal_user_2', password: 'TestPassword123!' },
  { username: 'normal_user_3', password: 'TestPassword123!' },
  { username: 'normal_user_4', password: 'TestPassword123!' },
  { username: 'normal_user_5', password: 'TestPassword123!' },
];

export function setup() {
  // Setup: Login multiple users to simulate real traffic
  const tokens = [];
  const loginUrl = `${BASE_URL}/api/auth/login`;

  TEST_USERS.forEach((user) => {
    const response = http.post(loginUrl, JSON.stringify({
      username: user.username,
      password: user.password,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });

    if (response.status === 200 && response.json('token')) {
      tokens.push(response.json('token'));
    }
  });

  return { tokens };
}

export default function(data) {
  // Pick a random user token
  const token = data.tokens[Math.floor(Math.random() * data.tokens.length)];

  // Simulate realistic user journey

  // Step 1: Dashboard view (most common operation)
  const dashboard = makeAuthRequest(`${BASE_URL}/api/dashboard`, 'GET', null, token);
  checkResponse(dashboard, {
    'dashboard loaded': (r) => r.status === 200,
    'dashboard load time acceptable': (r) => r.timings.duration < 500,
  });

  sleep(Math.random() * 2 + 1); // 1-3 seconds think time

  // Step 2: List instances (70% of users do this)
  if (Math.random() < 0.7) {
    const instances = makeAuthRequest(`${BASE_URL}/api/instances`, 'GET', null, token);
    checkResponse(instances, {
      'instances listed': (r) => r.status === 200,
      'instances list time acceptable': (r) => r.timings.duration < 400,
    });

    sleep(Math.random() * 2 + 1);

    // Step 3: View instance details (50% of those who listed)
    if (Math.random() < 0.5 && instances.json('length') > 0) {
      const instanceId = instances.json()[0].id;
      const instance = makeAuthRequest(
        `${BASE_URL}/api/instances/${instanceId}`,
        'GET',
        null,
        token
      );
      checkResponse(instance, {
        'instance details loaded': (r) => r.status === 200,
        'instance details time acceptable': (r) => r.timings.duration < 300,
      });

      sleep(Math.random() * 3 + 2);
    }
  }

  // Step 4: Create/Update operation (20% of users - write operations)
  if (Math.random() < 0.2) {
    const newInstance = {
      name: `Test Instance ${Date.now()}`,
      type: 'standard',
      region: 'default',
    };

    const createResponse = makeAuthRequest(
      `${BASE_URL}/api/instances`,
      'POST',
      newInstance,
      token
    );
    checkResponse(createResponse, {
      'instance creation initiated': (r) => r.status === 201 || r.status === 202,
      'instance creation time acceptable': (r) => r.timings.duration < 1000,
    });

    sleep(Math.random() * 2 + 1);
  }

  // Step 5: Check notifications (40% of users)
  if (Math.random() < 0.4) {
    const notifications = makeAuthRequest(
      `${BASE_URL}/api/notifications`,
      'GET',
      null,
      token
    );
    checkResponse(notifications, {
      'notifications loaded': (r) => r.status === 200,
      'notifications load time acceptable': (r) => r.timings.duration < 300,
    });

    sleep(Math.random() * 1 + 0.5);
  }

  // Step 6: User profile update (10% of users)
  if (Math.random() < 0.1) {
    const profileUpdate = {
      preferences: {
        theme: 'dark',
        notifications: true,
      },
    };

    const updateResponse = makeAuthRequest(
      `${BASE_URL}/api/user/preferences`,
      'PUT',
      profileUpdate,
      token
    );
    checkResponse(updateResponse, {
      'preferences updated': (r) => r.status === 200,
      'preferences update time acceptable': (r) => r.timings.duration < 400,
    });

    sleep(Math.random() * 1 + 0.5);
  }

  // Final think time before next iteration
  sleep(Math.random() * 3 + 2);
}
