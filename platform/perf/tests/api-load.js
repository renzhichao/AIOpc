/**
 * API Load Test Script
 *
 * Purpose: Comprehensive load testing for all REST API endpoints
 * Tests: CRUD operations, authentication, file uploads, pagination
 * Metrics: Response times, throughput, error rates, resource utilization
 */

import http from 'k6/http';
import { check, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { makeAuthRequest, checkResponse, BASE_URL } from '../k6.config.js';

// Custom metrics for detailed analysis
const apiErrors = new Rate('api_errors');
const apiLatency = new Trend('api_latency');
const authFailures = new Counter('auth_failures');
const dbErrors = new Counter('db_errors');

// Test configuration
export const options = {
  scenarios: {
    // Scenario 1: Sustained load
    sustained_load: {
      executor: 'constant-arrival-rate',
      rate: 100, // 100 requests per second
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 50,
      maxVUs: 200,
      tags: { test_type: 'sustained_load' },
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.01'],
    api_errors: ['rate<0.01'],
  },
};

// Test data
const TEST_DATA = {
  validUser: {
    username: 'api_test_user',
    password: 'TestPassword123!',
  },
  newInstance: {
    name: 'Load Test Instance',
    type: 'standard',
    region: 'default',
    specs: {
      cpu: 2,
      memory: 4096,
      storage: 50,
    },
  },
  testFile: {
    name: 'test-file.txt',
    content: 'This is a test file for load testing file upload functionality.',
  },
};

let authToken = null;
let testInstanceId = null;

export function setup() {
  // Setup: Authenticate and prepare test data
  console.log('Setup: Starting authentication...');

  const loginUrl = `${BASE_URL}/api/auth/login`;
  const response = http.post(loginUrl, JSON.stringify({
    username: TEST_DATA.validUser.username,
    password: TEST_DATA.validUser.password,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  if (response.status !== 200) {
    console.error('Setup failed: Authentication unsuccessful');
    return null;
  }

  const token = response.json('token');
  console.log('Setup: Authentication successful');

  // Create a test instance to use in tests
  const createResponse = http.post(
    `${BASE_URL}/api/instances`,
    JSON.stringify(TEST_DATA.newInstance),
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    }
  );

  if (createResponse.status === 201) {
    testInstanceId = createResponse.json('id');
    console.log(`Setup: Test instance created with ID: ${testInstanceId}`);
  }

  return { token, testInstanceId };
}

export default function(data) {
  if (!data || !data.token) {
    console.error('Test data not available');
    return;
  }

  authToken = data.token;
  testInstanceId = data.testInstanceId;

  // Group 1: Authentication & Authorization APIs
  group('Authentication APIs', () => {
    // Test 1.1: Verify token validity
    const verifyToken = makeAuthRequest(
      `${BASE_URL}/api/auth/verify`,
      'GET',
      null,
      authToken
    );
    checkResponse(verifyToken, {
      'token verification successful': (r) => r.status === 200,
      'token verification fast': (r) => r.timings.duration < 200,
    });
    apiLatency.add(verifyToken.timings.duration);

    // Test 1.2: Refresh token
    const refreshToken = makeAuthRequest(
      `${BASE_URL}/api/auth/refresh`,
      'POST',
      {},
      authToken
    );
    checkResponse(refreshToken, {
      'token refresh successful': (r) => r.status === 200,
      'token refresh fast': (r) => r.timings.duration < 300,
    });

    if (refreshToken.status !== 200) {
      authFailures.add(1);
    }
    apiErrors.add(refreshToken.status !== 200);
    apiLatency.add(refreshToken.timings.duration);
  });

  // Group 2: Instance Management APIs (CRUD)
  group('Instance Management APIs', () => {
    // Test 2.1: List instances with pagination
    const listInstances = makeAuthRequest(
      `${BASE_URL}/api/instances?page=1&limit=20`,
      'GET',
      null,
      authToken
    );
    checkResponse(listInstances, {
      'instances listed successfully': (r) => r.status === 200,
      'instances listed fast': (r) => r.timings.duration < 400,
      'instances pagination works': (r) => r.json('hasMore') !== undefined,
    });
    apiErrors.add(listInstances.status !== 200);
    apiLatency.add(listInstances.timings.duration);

    // Test 2.2: Get instance by ID
    if (testInstanceId) {
      const getInstance = makeAuthRequest(
        `${BASE_URL}/api/instances/${testInstanceId}`,
        'GET',
        null,
        authToken
      );
      checkResponse(getInstance, {
        'instance retrieved successfully': (r) => r.status === 200,
        'instance retrieved fast': (r) => r.timings.duration < 300,
      });
      apiErrors.add(getInstance.status !== 200);
      apiLatency.add(getInstance.timings.duration);

      // Test 2.3: Update instance
      const updateData = {
        name: `Updated Instance ${Date.now()}`,
        specs: {
          cpu: 4,
          memory: 8192,
        },
      };
      const updateInstance = makeAuthRequest(
        `${BASE_URL}/api/instances/${testInstanceId}`,
        'PUT',
        updateData,
        authToken
      );
      checkResponse(updateInstance, {
        'instance updated successfully': (r) => r.status === 200,
        'instance updated fast': (r) => r.timings.duration < 500,
      });
      apiErrors.add(updateInstance.status !== 200);
      apiLatency.add(updateInstance.timings.duration);
    }
  });

  // Group 3: Monitoring & Metrics APIs
  group('Monitoring APIs', () => {
    // Test 3.1: Get system metrics
    const metrics = makeAuthRequest(
      `${BASE_URL}/api/metrics`,
      'GET',
      null,
      authToken
    );
    checkResponse(metrics, {
      'metrics retrieved successfully': (r) => r.status === 200,
      'metrics retrieved fast': (r) => r.timings.duration < 500,
    });
    apiErrors.add(metrics.status !== 200);
    apiLatency.add(metrics.timings.duration);

    // Test 3.2: Get instance logs
    if (testInstanceId) {
      const logs = makeAuthRequest(
        `${BASE_URL}/api/instances/${testInstanceId}/logs?limit=100`,
        'GET',
        null,
        authToken
      );
      checkResponse(logs, {
        'logs retrieved successfully': (r) => r.status === 200,
        'logs retrieved fast': (r) => r.timings.duration < 600,
      });
      apiErrors.add(logs.status !== 200);
      apiLatency.add(logs.timings.duration);
    }
  });

  // Group 4: User & Preferences APIs
  group('User Management APIs', () => {
    // Test 4.1: Get user profile
    const profile = makeAuthRequest(
      `${BASE_URL}/api/user/profile`,
      'GET',
      null,
      authToken
    );
    checkResponse(profile, {
      'profile retrieved successfully': (r) => r.status === 200,
      'profile retrieved fast': (r) => r.timings.duration < 300,
    });
    apiErrors.add(profile.status !== 200);
    apiLatency.add(profile.timings.duration);

    // Test 4.2: Update user preferences
    const prefs = {
      theme: Math.random() > 0.5 ? 'dark' : 'light',
      notifications: true,
      language: 'zh-CN',
    };
    const updatePrefs = makeAuthRequest(
      `${BASE_URL}/api/user/preferences`,
      'PUT',
      prefs,
      authToken
    );
    checkResponse(updatePrefs, {
      'preferences updated successfully': (r) => r.status === 200,
      'preferences updated fast': (r) => r.timings.duration < 400,
    });
    apiErrors.add(updatePrefs.status !== 200);
    apiLatency.add(updatePrefs.timings.duration);
  });

  // Group 5: File Operations APIs
  group('File Operations APIs', () => {
    // Test 5.1: Upload file (simulated)
    const fileData = TEST_DATA.testFile.content;
    const uploadFile = http.post(
      `${BASE_URL}/api/files/upload`,
      fileData,
      {
        headers: {
          'Content-Type': 'text/plain',
          'Authorization': `Bearer ${authToken}`,
          'X-File-Name': TEST_DATA.testFile.name,
        },
        tags: { name: 'FileUpload' },
      }
    );
    checkResponse(uploadFile, {
      'file upload successful': (r) => r.status === 201 || r.status === 200,
      'file upload fast': (r) => r.timings.duration < 2000,
    });
    apiErrors.add(uploadFile.status !== 200 && uploadFile.status !== 201);
    apiLatency.add(uploadFile.timings.duration);

    // Test 5.2: List files
    const listFiles = makeAuthRequest(
      `${BASE_URL}/api/files?page=1&limit=20`,
      'GET',
      null,
      authToken
    );
    checkResponse(listFiles, {
      'files listed successfully': (r) => r.status === 200,
      'files listed fast': (r) => r.timings.duration < 400,
    });
    apiErrors.add(listFiles.status !== 200);
    apiLatency.add(listFiles.timings.duration);
  });

  // Group 6: Search & Filter APIs
  group('Search & Filter APIs', () => {
    // Test 6.1: Search instances
    const search = makeAuthRequest(
      `${BASE_URL}/api/instances/search?q=test&status=running`,
      'GET',
      null,
      authToken
    );
    checkResponse(search, {
      'search executed successfully': (r) => r.status === 200,
      'search executed fast': (r) => r.timings.duration < 600,
    });
    apiErrors.add(search.status !== 200);
    apiLatency.add(search.timings.duration);

    // Test 6.2: Filter by tags
    const filter = makeAuthRequest(
      `${BASE_URL}/api/instances?tags=production&page=1&limit=10`,
      'GET',
      null,
      authToken
    );
    checkResponse(filter, {
      'filter executed successfully': (r) => r.status === 200,
      'filter executed fast': (r) => r.timings.duration < 500,
    });
    apiErrors.add(filter.status !== 200);
    apiLatency.add(filter.timings.duration);
  });

  // Group 7: Admin APIs (if user has admin role)
  group('Admin APIs', () => {
    // Test 7.1: Get system status
    const systemStatus = makeAuthRequest(
      `${BASE_URL}/api/admin/status`,
      'GET',
      null,
      authToken
    );
    checkResponse(systemStatus, {
      'system status accessible': (r) => [200, 403].includes(r.status), // 403 if not admin
      'system status fast': (r) => r.timings.duration < 500,
    });
    apiErrors.add(systemStatus.status === 500);
    apiLatency.add(systemStatus.timings.duration);
  });
}

export function teardown(data) {
  if (data && data.testInstanceId) {
    // Cleanup: Delete test instance
    console.log(`Teardown: Deleting test instance ${data.testInstanceId}`);
    http.del(
      `${BASE_URL}/api/instances/${data.testInstanceId}`,
      null,
      {
        headers: {
          'Authorization': `Bearer ${data.token}`,
        },
      }
    );
  }
}

// Summary handler for detailed reporting
export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'results/api-load-summary.json': JSON.stringify(data),
    'results/api-load-summary.html': htmlReport(data),
  };
}
