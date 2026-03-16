/**
 * WebSocket Test Client
 *
 * Manual testing tool for WebSocket Gateway (TASK-006)
 *
 * Usage:
 *   node scripts/test-websocket-client.js <JWT_TOKEN>
 *
 * Example:
 *   node scripts/test-websocket-client.js eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 */

const WebSocket = require('ws');

const JWT_TOKEN = process.argv[2];
const WS_URL = `ws://localhost:3001?token=${JWT_TOKEN}`;

console.log('🔌 WebSocket Test Client');
console.log('======================\n');
console.log(`Connecting to: ${WS_URL}\n`);

const ws = new WebSocket(WS_URL);

// Connection opened
ws.on('open', () => {
  console.log('✅ Connected to WebSocket Gateway\n');

  // Send test message
  const testMessage = {
    type: 'user_message',
    content: 'Hello, AI assistant!',
    timestamp: new Date().toISOString(),
  };

  console.log('📤 Sending test message:');
  console.log(JSON.stringify(testMessage, null, 2));
  console.log();

  ws.send(JSON.stringify(testMessage));
});

// Message received
ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    console.log('📥 Message received:');
    console.log(JSON.stringify(message, null, 2));
    console.log();
  } catch (error) {
    console.log('📥 Raw message received:');
    console.log(data.toString());
    console.log();
  }
});

// Error occurred
ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
  console.error('Error details:', error);
  process.exit(1);
});

// Connection closed
ws.on('close', (code, reason) => {
  console.log(`🔌 Connection closed`);
  console.log(`   Code: ${code}`);
  console.log(`   Reason: ${reason.toString() || 'No reason provided'}`);
  console.log();

  // WebSocket close code explanations
  const closeCodes = {
    1000: 'Normal Closure - Connection closed cleanly',
    1001: 'Going Away - Server/client is shutting down',
    1002: 'Protocol Error - WebSocket protocol error',
    1003: 'Unsupported Data - Received unsupported data type',
    1008: 'Policy Violation - Token invalid or instance not found',
    1009: 'Message Too Big - Message size exceeded limit',
    1011: 'Internal Error - Server encountered unexpected condition',
    1012: 'Service Restart - Server is restarting',
    1013: 'Try Again Later - Server is overloaded',
  };

  if (closeCodes[code]) {
    console.log(`   Explanation: ${closeCodes[code]}`);
  }

  process.exit(code === 1000 ? 0 : 1);
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n\n🛑 Received SIGINT, closing connection...');
  ws.close(1000, 'Test client terminated');
});

// Keep-alive ping/pong handling
ws.on('ping', (data) => {
  console.log('📨 Ping received from server');
  ws.pong(data);
});

ws.on('pong', (data) => {
  console.log('📨 Pong received from server');
});

console.log('Waiting for connection...');
console.log('Press Ctrl+C to exit\n');
