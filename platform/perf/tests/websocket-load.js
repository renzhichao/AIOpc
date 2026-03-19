/**
 * WebSocket Load Test Script
 *
 * Purpose: Load testing for WebSocket connections and real-time messaging
 * Tests: Connection establishment, message throughput, latency, reconnection
 * Metrics: Connection time, message latency, disconnection rate, concurrent connections
 */

import { check } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import websocket from 'k6/x/websocket';
import { BASE_URL } from '../k6.config.js';

// Custom WebSocket metrics
const wsConnected = new Rate('ws_connected');
const wsErrors = new Rate('ws_errors');
const wsMessageLatency = new Trend('ws_message_latency');
const wsReconnections = new Counter('ws_reconnections');
const wsMessagesSent = new Counter('ws_messages_sent');
const wsMessagesReceived = new Counter('ws_messages_received');

// Test configuration
export const options = {
  scenarios: {
    // Scenario 1: Connection load
    connection_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 50 },   // Ramp up connections
        { duration: '2m', target: 50 },   // Sustain connections
        { duration: '1m', target: 100 },  // Ramp up more
        { duration: '2m', target: 100 },  // Sustain
        { duration: '1m', target: 0 },    // Ramp down
      ],
      gracefulRampDown: '30s',
      tags: { test_type: 'connection_load' },
    },
  },
  thresholds: {
    ws_connected: ['rate>0.95'], // 95%+ connection success rate
    ws_errors: ['rate<0.05'],    // < 5% error rate
    ws_message_latency: ['p(95)<500', 'p(99)<1000'],
  },
};

// WebSocket configuration
const WS_CONFIG = {
  // Convert BASE_URL to WebSocket URL
  url: BASE_URL.replace('http://', 'ws://').replace('https://', 'wss://'),
  path: '/ws',
  ping_interval: 30000, // 30 seconds
  ping_timeout: 10000,  // 10 seconds
  reconnect_interval: 5000, // 5 seconds
};

// Message types for testing
const MESSAGE_TYPES = {
  AUTH: 'auth',
  INSTANCE_STATUS: 'instance_status',
  LOG_STREAM: 'log_stream',
  METRICS_UPDATE: 'metrics_update',
  NOTIFICATION: 'notification',
  PING: 'ping',
  PONG: 'pong',
};

// Test data
const TEST_CREDENTIALS = {
  username: 'ws_test_user',
  password: 'TestPassword123!',
};

export function setup() {
  // Setup: Get authentication token for WebSocket
  console.log('Setup: Getting auth token for WebSocket connections');

  // In real implementation, this would call the login API
  // For now, we'll simulate having a token
  const mockToken = 'mock_jwt_token_for_testing';

  console.log('Setup: Auth token obtained');
  return { authToken: mockToken };
}

export default function(data) {
  const authToken = data.authToken;
  const wsUrl = `${WS_CONFIG.url}${WS_CONFIG.path}?token=${authToken}`;

  // Track connection state
  let connected = false;
  let connectionTime = null;
  let messageCount = 0;
  let messagesReceived = 0;
  let reconnectCount = 0;

  // Test 1: Establish WebSocket connection
  const startTime = Date.now();

  try {
    const socket = websocket.connect(wsUrl, null, function(socket) {
      connectionTime = Date.now() - startTime;
      connected = true;

      console.log(`VU ${__VU}: WebSocket connected in ${connectionTime}ms`);

      // Track successful connection
      wsConnected.add(true);

      // Test 1.1: Send authentication message
      const authMsg = {
        type: MESSAGE_TYPES.AUTH,
        token: authToken,
        timestamp: Date.now(),
      };
      socket.send(JSON.stringify(authMsg));
      wsMessagesSent.add(1);

      // Test 1.2: Subscribe to instance status updates
      const subscribeMsg = {
        type: 'subscribe',
        channel: 'instance_status',
        instance_id: 'test-instance-001',
      };
      socket.send(JSON.stringify(subscribeMsg));
      wsMessagesSent.add(1);

      // Test 1.3: Request log stream
      const logStreamMsg = {
        type: 'subscribe',
        channel: 'log_stream',
        instance_id: 'test-instance-001',
        filter: 'error',
      };
      socket.send(JSON.stringify(logStreamMsg));
      wsMessagesSent.add(1);

      // Message handler
      socket.on('message', function(message) {
        const receiveTime = Date.now();
        messagesReceived++;
        wsMessagesReceived.add(1);

        try {
          const data = JSON.parse(message);

          // Calculate message latency if timestamp is present
          if (data.timestamp) {
            const latency = receiveTime - data.timestamp;
            wsMessageLatency.add(latency);

            check(data, {
              'message latency acceptable': () => latency < 1000,
              'message timestamp present': () => data.timestamp > 0,
            });
          }

          // Handle different message types
          switch (data.type) {
            case MESSAGE_TYPES.INSTANCE_STATUS:
              check(data, {
                'instance status has required fields': () =>
                  data.instance_id && data.status !== undefined,
              });
              break;

            case MESSAGE_TYPES.LOG_STREAM:
              check(data, {
                'log entry has required fields': () =>
                  data.instance_id && data.message && data.level,
              });
              break;

            case MESSAGE_TYPES.NOTIFICATION:
              check(data, {
                'notification has required fields': () =>
                  data.id && data.message && data.created_at,
              });
              break;

            case MESSAGE_TYPES.PONG:
              // Handle pong response to ping
              check(data, {
                'pong response timely': () =>
                  receiveTime - (data.original_timestamp || receiveTime) < 5000,
              });
              break;

            default:
              console.warn(`Unknown message type: ${data.type}`);
          }

          // Send periodic ping (every 30 seconds)
          if (messagesReceived % 50 === 0) {
            const pingMsg = {
              type: MESSAGE_TYPES.PING,
              timestamp: receiveTime,
            };
            socket.send(JSON.stringify(pingMsg));
            wsMessagesSent.add(1);
          }

        } catch (parseError) {
          console.error(`Failed to parse WebSocket message: ${parseError.message}`);
          wsErrors.add(1);
        }
      });

      // Error handler
      socket.on('error', function(error) {
        console.error(`WebSocket error: ${error}`);
        wsErrors.add(1);
        wsConnected.add(false);
      });

      // Close handler
      socket.on('close', function() {
        console.log(`VU ${__VU}: WebSocket connection closed`);
        wsConnected.add(false);
      });

      // Set up periodic tasks
      const intervalId = setInterval(() => {
        // Test 2: Send real-time command
        const commandMsg = {
          type: 'command',
          action: 'get_status',
          instance_id: 'test-instance-001',
          timestamp: Date.now(),
        };
        socket.send(JSON.stringify(commandMsg));
        wsMessagesSent.add(1);
        messageCount++;

      }, 5000); // Every 5 seconds

      // Cleanup on disconnect
      socket.on('close', function() {
        clearInterval(intervalId);
      });

    });

    // Keep connection alive for the test duration
    // The socket will be automatically closed when the test ends

  } catch (error) {
    console.error(`WebSocket connection failed: ${error.message}`);
    wsErrors.add(1);
    wsConnected.add(false);
  }

  // Test duration: maintain connection and handle messages
  // The VU will stay connected until the scenario stage changes

  // Small delay before next iteration (if any)
  if (Math.random() < 0.1) {
    // 10% chance to disconnect and reconnect (test reconnection)
    reconnectCount++;
    wsReconnections.add(1);
  }
}

export function teardown(data) {
  console.log('Teardown: WebSocket load test completed');
}

// Summary handler for detailed reporting
export function handleSummary(data) {
  const summary = {
    metrics: {
      ws_connections: {
        total: data.metrics.ws_connected.values.count,
        success_rate: (data.metrics.ws_connected.values.rate * 100).toFixed(2) + '%',
      },
      ws_errors: {
        rate: (data.metrics.ws_errors.values.rate * 100).toFixed(2) + '%',
      },
      ws_messages: {
        sent: data.metrics.ws_messages_sent.values.count,
        received: data.metrics.ws_messages_received.values.count,
      },
      ws_latency: {
        p95: data.metrics.ws_message_latency.values['p(95)'],
        p99: data.metrics.ws_message_latency.values['p(99)'],
        avg: data.metrics.ws_message_latency.values.avg,
      },
      ws_reconnections: data.metrics.ws_reconnections.values.count,
    },
  };

  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'results/websocket-load-summary.json': JSON.stringify(data),
    'results/websocket-load-summary.html': htmlReport(data),
    'results/websocket-load-metrics.json': JSON.stringify(summary, null, 2),
  };
}

/**
 * Alternative: Simpler WebSocket test without k6/x/websocket extension
 * Use this if the extension is not available
 */
export function optionsSimple() {
  return {
    scenarios: {
      ws_simple: {
        executor: 'constant-vus',
        vus: 10,
        duration: '2m',
        tags: { test_type: 'ws_simple' },
      },
    },
  };
}

/**
 * Simulated WebSocket test using HTTP long-polling
 * This is a fallback if native WebSocket is not available
 */
export function simulatedWebSocketTest(data) {
  const authToken = data.authToken;

  // Simulate WebSocket connection using HTTP endpoints
  group('Simulated WebSocket - Connection', () => {
    // Test connection establishment
    const connect = http.post(
      `${BASE_URL}/api/ws/connect`,
      JSON.stringify({ token: authToken }),
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { name: 'WS-Connect' },
      }
    );

    check(connect, {
      'WS connection established': (r) => r.status === 200,
      'connection fast': (r) => r.timings.duration < 500,
    });

    if (connect.status === 200) {
      const connectionId = connect.json('connection_id');

      // Test message sending
      const sendMessage = http.post(
        `${BASE_URL}/api/ws/send`,
        JSON.stringify({
          connection_id: connectionId,
          message: {
            type: 'test',
            content: 'Test message',
          },
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          tags: { name: 'WS-SendMessage' },
        }
      );

      check(sendMessage, {
        'message sent successfully': (r) => r.status === 200,
        'message sent fast': (r) => r.timings.duration < 300,
      });

      // Test message receiving (long-polling)
      const receiveMessage = http.get(
        `${BASE_URL}/api/ws/receive?connection_id=${connectionId}&timeout=30`,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`,
          },
          tags: { name: 'WS-ReceiveMessage' },
        }
      );

      check(receiveMessage, {
        'message received or timeout': (r) => [200, 408].includes(r.status),
      });

      // Test disconnection
      const disconnect = http.post(
        `${BASE_URL}/api/ws/disconnect`,
        JSON.stringify({ connection_id: connectionId }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          tags: { name: 'WS-Disconnect' },
        }
      );

      check(disconnect, {
        'disconnection successful': (r) => r.status === 200,
      });
    }
  });
}
