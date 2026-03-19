/**
 * k6 Configuration File
 *
 * Performance testing configuration for AIOpc platform
 * Supports multiple environments and load scenarios
 */

import { check } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
export const errorRate = new Rate('errors');
export const latencyTrend = new Trend('latency');
export const requestCount = new Counter('requests');

// Environment configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const ENVIRONMENT = __ENV.ENVIRONMENT || 'dev';

// Stage durations (in seconds)
const STAGE_DURATIONS = {
  short: '30s',
  medium: '2m',
  long: '5m',
  extended: '10m',
};

// Common thresholds based on SLOs
const SLO_THRESHOLDS = {
  http_req_duration: ['p(95)<500', 'p(99)<1000'],
  http_req_failed: ['rate<0.01'], // < 1% error rate
  errors: ['rate<0.001'], // < 0.1% custom error rate
};

// Configuration presets for different scenarios
export const scenarios = {
  // Baseline: Light load to establish baseline metrics
  baseline: {
    executor: 'constant-vus',
    vus: 10,
    duration: '1m',
    thresholds: SLO_THRESHOLDS,
    tags: { scenario: 'baseline' },
  },

  // Normal: Expected daily load
  normal: {
    executor: 'constant-vus',
    vus: 100,
    duration: '5m',
    thresholds: SLO_THRESHOLDS,
    tags: { scenario: 'normal' },
  },

  // Peak: Peak traffic scenario
  peak: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '1m', target: 100 },   // Ramp up
      { duration: '3m', target: 500 },   // Peak load
      { duration: '1m', target: 0 },     // Ramp down
    ],
    thresholds: SLO_THRESHOLDS,
    tags: { scenario: 'peak' },
  },

  // Stress: Find breaking point
  stress: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '2m', target: 100 },
      { duration: '2m', target: 500 },
      { duration: '2m', target: 1000 },
      { duration: '2m', target: 2000 },
      { duration: '2m', target: 0 },      // Recovery
    ],
    thresholds: {
      ...SLO_THRESHOLDS,
      'http_req_duration': ['p(95)<1000', 'p(99)<2000'], // Relaxed for stress
    },
    tags: { scenario: 'stress' },
  },

  // Soak: Endurance test
  soak: {
    executor: 'constant-vus',
    vus: 50,
    duration: '30m',
    thresholds: SLO_THRESHOLDS,
    tags: { scenario: 'soak' },
  },

  // Spike: Sudden load increase
  spike: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '1m', target: 50 },
      { duration: '30s', target: 1000 },  // Sudden spike
      { duration: '1m', target: 50 },
      { duration: '30s', target: 0 },
    ],
    thresholds: SLO_THRESHOLDS,
    tags: { scenario: 'spike' },
  },
};

// Common options for all tests
export const options = {
  scenarios: {
    default: scenarios.baseline,
  },
  thresholds: SLO_THRESHOLDS,
  tags: {
    environment: ENVIRONMENT,
    project: 'aiopclaw',
  },
};

// Helper function to make authenticated requests
export function makeAuthRequest(url, method = 'GET', body = null, token = null) {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const params = {
    headers,
    tags: { name: `${method} ${url}` },
  };

  if (method === 'GET') {
    return http.get(url, params);
  } else if (method === 'POST') {
    return http.post(url, JSON.stringify(body), params);
  } else if (method === 'PUT') {
    return http.put(url, JSON.stringify(body), params);
  } else if (method === 'DELETE') {
    return http.del(url, null, params);
  }
}

// Helper function to check response
export function checkResponse(response, checks) {
  const result = check(response, checks);
  errorRate.add(!result);
  return result;
}

// Export configuration for use in tests
export { BASE_URL, ENVIRONMENT, STAGE_DURATIONS };
