# Chat Feature E2E Testing - Quick Reference Guide

## Overview

This guide provides quick reference for using the chat feature E2E test infrastructure created for TASK-015.

## File Structure

```
tests/
├── helpers/
│   └── websocket.helper.ts       # WebSocket testing utilities (378 lines)
├── e2e/
│   └── chat-flow.e2e.test.ts    # Complete E2E test suite (880 lines)
└── integration/
    └── helpers/
        └── database.helper.ts    # Database test utilities

claudedocs/
└── TASK-015_chat_e2e_test_summary.md  # Complete implementation summary
```

## Test Statistics

- **Total Test Cases**: 30
- **Test Scenarios**: 5
- **Lines of Code**: 1,258
- **Helper Functions**: 20+
- **Coverage Areas**: 8

## Quick Start

### 1. Running All Chat E2E Tests

```bash
# Run all E2E tests (includes chat tests)
pnpm test:e2e

# Run only chat flow tests
pnpm test:e2e tests/e2e/chat-flow.e2e.test.ts

# Run with coverage report
pnpm test:e2e:coverage tests/e2e/chat-flow.e2e.test.ts

# Run with debug output
pnpm test:e2e:debug tests/e2e/chat-flow.e2e.test.ts
```

### 2. Running Specific Test Scenarios

```bash
# Run only connection tests
pnpm test:e2e tests/e2e/chat-flow.e2e.test.ts -t "Scenario 1"

# Run only message tests
pnpm test:e2e tests/e2e/chat-flow.e2e.test.ts -t "Scenario 2"

# Run only concurrent message tests
pnpm test:e2e tests/e2e/chat-flow.e2e.test.ts -t "Scenario 3"
```

## WebSocketHelper API

### Connection Management

```typescript
// Create a WebSocket client
const client = WebSocketHelper.createClient('ws://localhost:3001', 'jwt_token');

// Wait for connection to open
await WebSocketHelper.waitForOpen(client.ws, 5000);

// Wait for connection to close
await WebSocketHelper.waitForClose(client.ws, 5000);

// Close connection gracefully
await WebSocketHelper.closeGracefully(client.ws);
```

### Message Handling

```typescript
// Wait for any message
const message = await WebSocketHelper.waitForMessage(client.ws, 5000);

// Wait for specific message type
const response = await WebSocketHelper.waitForMessageType(
  client.ws,
  'assistant_message',
  5000
);

// Wait for multiple messages
const responses = await WebSocketHelper.waitForMessages(client.ws, 10, 15000);

// Send a message
WebSocketHelper.sendMessage(client.ws, {
  type: 'user_message',
  content: 'Hello, AI!',
  message_id: 'msg-001'
});

// Send a user message (convenience method)
WebSocketHelper.sendUserMessage(client.ws, 'Hello, AI!', 'msg-001');
```

### Heartbeat Testing

```typescript
// Wait for ping
const pingReceived = await WebSocketHelper.waitForPing(client.ws, 35000);

// Wait for pong
const pongReceived = await WebSocketHelper.waitForPong(client.ws, 5000);
```

### Multi-Client Testing

```typescript
// Create multiple clients
const tokens = ['token1', 'token2', 'token3'];
const clients = await WebSocketHelper.createMultipleClients(
  'ws://localhost:3001',
  tokens,
  5000
);

// Close all clients
await WebSocketHelper.closeMultipleClients(clients);
```

### Utility Functions

```typescript
// Check if connected
const isConnected = WebSocketHelper.isConnected(client.ws);

// Get ready state
const state = WebSocketHelper.getReadyState(client.ws); // 'OPEN', 'CLOSED', etc.

// Get messages by type
const assistantMessages = WebSocketHelper.getMessagesByType(client, 'assistant_message');

// Get last message of type
const lastResponse = WebSocketHelper.getLastMessageByType(client, 'assistant_message');

// Count messages
const count = WebSocketHelper.countMessagesByType(client, 'assistant_message');

// Clear messages
WebSocketHelper.clearMessages(client);
```

## Test Data Management

### Creating Test Users

```typescript
const user = await DatabaseHelper.createTestUser({
  feishu_user_id: 'test-user-123',
  name: 'Test User',
  email: 'test@example.com'
});
```

### Creating Test Instances

```typescript
const instance = await DatabaseHelper.createTestInstance(user, {
  status: 'active',
  template: 'personal'
});
```

### Generating JWT Tokens

```typescript
const oauthService = new OAuthService(userRepository);
const validToken = oauthService.generateToken(user);
```

## Test Scenarios

### Scenario 1: Connection Establishment (6 tests)
- ✅ Valid token connection
- ✅ Invalid token rejection
- ✅ Missing token rejection
- ✅ Expired token rejection
- ✅ No instance rejection
- ✅ Connected status message

### Scenario 2: Message Exchange (5 tests)
- ✅ Send and receive
- ✅ Sequential messages
- ✅ Message ID preservation
- ✅ Metadata handling
- ✅ Message ordering

### Scenario 3: Concurrent Messages (4 tests)
- ✅ Single user concurrency (10 messages)
- ✅ Multi-user concurrency (3 users)
- ✅ Rapid bursts (20 messages)
- ✅ Message isolation

### Scenario 4: Connection Management (5 tests)
- ✅ Graceful disconnect
- ✅ Heartbeat ping
- ✅ Pong response
- ✅ Disconnect status
- ✅ Reconnection

### Scenario 5: Edge Cases (10 tests)
- ✅ Empty messages
- ✅ Long messages (10KB)
- ✅ Malformed JSON
- ✅ Special characters
- ✅ Unicode characters
- ✅ JSON in content
- ✅ Rapid connect/disconnect
- ✅ Immediate message
- ✅ Missing fields
- ✅ Null values

## Writing Custom Tests

### Basic Test Template

```typescript
import { WebSocketHelper } from '../helpers/websocket.helper';
import { DatabaseHelper } from '../integration/helpers/database.helper';

describe('Custom Chat Tests', () => {
  let testUser: User;
  let testInstance: Instance;
  let validToken: string;

  beforeEach(async () => {
    await DatabaseHelper.clean();

    testUser = await DatabaseHelper.createTestUser();
    testInstance = await DatabaseHelper.createTestInstance(testUser);

    const oauthService = new OAuthService(userRepository);
    validToken = oauthService.generateToken(testUser);
  });

  afterEach(async () => {
    await DatabaseHelper.clean();
  });

  it('should test custom scenario', async () => {
    const client = WebSocketHelper.createClient('ws://localhost:3001', validToken);
    await WebSocketHelper.waitForOpen(client.ws, 5000);

    // Your test logic here

    await WebSocketHelper.closeGracefully(client.ws);
  });
});
```

### Concurrent Test Template

```typescript
it('should handle concurrent operations', async () => {
  const client = WebSocketHelper.createClient('ws://localhost:3001', validToken);
  await WebSocketHelper.waitForOpen(client.ws, 5000);

  // Send multiple messages concurrently
  const promises = [];
  for (let i = 0; i < 10; i++) {
    WebSocketHelper.sendUserMessage(client.ws, `Message ${i}`, `msg-${i}`);
  }

  // Wait for responses
  const responses = await WebSocketHelper.waitForMessages(client.ws, 10, 15000);

  expect(responses.length).toBeGreaterThan(0);

  await WebSocketHelper.closeGracefully(client.ws);
});
```

## Troubleshooting

### Connection Timeout
```typescript
// Increase timeout if needed
await WebSocketHelper.waitForOpen(client.ws, 10000); // 10 seconds
```

### Message Timeout
```typescript
// Increase message timeout
const response = await WebSocketHelper.waitForMessageType(
  client.ws,
  'assistant_message',
  10000 // 10 seconds
);
```

### Database Cleanup
```typescript
// Ensure cleanup between tests
afterEach(async () => {
  await DatabaseHelper.clean();
});
```

## Best Practices

1. **Always cleanup connections**
   ```typescript
   afterEach(async () => {
     await WebSocketHelper.closeGracefully(client.ws);
   });
   ```

2. **Use unique test data**
   ```typescript
   const user = await DatabaseHelper.createTestUser({
     feishu_user_id: `test-${Date.now()}` // Unique ID
   });
   ```

3. **Wait for status messages**
   ```typescript
   await WebSocketHelper.waitForMessageType(client.ws, 'status', 2000);
   ```

4. **Handle errors gracefully**
   ```typescript
   try {
     const response = await WebSocketHelper.waitForMessageType(...);
   } catch (error) {
     // Handle timeout or error
   }
   ```

5. **Test isolation**
   ```typescript
   beforeEach(async () => {
     await DatabaseHelper.clean(); // Fresh state
   });
   ```

## Integration with CI/CD

### GitHub Actions Example

```yaml
- name: Run Chat E2E Tests
  run: pnpm test:e2e tests/e2e/chat-flow.e2e.test.ts

- name: Generate Coverage Report
  run: pnpm test:e2e:coverage tests/e2e/chat-flow.e2e.test.ts

- name: Upload Test Results
  uses: actions/upload-artifact@v3
  with:
    name: e2e-test-results
    path: test-reports/e2e/
```

## Additional Resources

- **Complete Summary**: `claudedocs/TASK-015_chat_e2e_test_summary.md`
- **WebSocket Types**: `src/types/websocket.types.ts`
- **WebSocket Gateway**: `src/services/WebSocketGateway.ts`
- **Test Database Helper**: `tests/integration/helpers/database.helper.ts`

## Support

For issues or questions:
1. Check the complete summary document
2. Review existing test implementations
3. Consult WebSocket type definitions
4. Review Jest configuration in `jest.config.js`

---

**Last Updated**: 2026-03-16
**Task**: TASK-015
**Status**: Test Infrastructure Complete
