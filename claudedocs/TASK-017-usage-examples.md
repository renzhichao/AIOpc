# Error Handling Usage Examples

This file provides practical examples of how to use the error handling mechanism implemented in TASK-017.

## Table of Contents
- [Basic Error Creation](#basic-error-creation)
- [Using ErrorService](#using-errorservice)
- [Express Route Handlers](#express-route-handlers)
- [Retry Mechanism](#retry-mechanism)
- [Service Layer Integration](#service-layer-integration)

## Basic Error Creation

### Direct AppError Usage

```typescript
import { AppError } from '@/utils/errors';

// Simple error
throw new AppError(404, 'NOT_FOUND', 'User not found');

// Error with details
throw new AppError(
  400,
  'VALIDATION_ERROR',
  'Email validation failed',
  { field: 'email', value: 'invalid' },
  '邮箱格式不正确'
);

// Error with suggested actions
throw new AppError(
  403,
  'FORBIDDEN',
  'Insufficient permissions',
  { requiredRole: 'admin' },
  '您没有权限执行此操作',
  ['联系管理员', '检查账户权限']
);
```

### Using ErrorCodes

```typescript
import { ErrorCodes, ErrorCodeKey } from '@/utils/errors';
import { AppError } from '@/utils/errors';

// Create error from predefined code
const errorCode: ErrorCodeKey = 'UNAUTHORIZED';
const config = ErrorCodes[errorCode];

throw new AppError(
  config.statusCode,
  config.code,
  config.message,
  undefined,
  config.userMessage
);
```

## Using ErrorService

### Injecting ErrorService

```typescript
import { Service } from 'typedi';
import { ErrorService } from '@/services/ErrorService';

@Service()
export class UserService {
  constructor(private errorService: ErrorService) {}

  async getUser(id: string) {
    const user = await this.userRepository.findById(id);

    if (!user) {
      throw this.errorService.notFound('User', id);
    }

    return user;
  }
}
```

### ErrorService Methods

```typescript
import { ErrorService } from '@/services/ErrorService';

const errorService = Container.get(ErrorService);

// Create error from ErrorCodes
throw errorService.createError('UNAUTHORIZED');

// Not found error
throw errorService.notFound('User', '123');
throw errorService.notFound('Instance');

// Validation error
throw errorService.validation('email', 'Invalid format');

// Unauthorized error
throw errorService.unauthorized('Token expired');

// Forbidden error
throw errorService.forbidden('Delete user');

// Conflict error
throw errorService.conflict('User', { email: 'test@example.com' });
```

## Express Route Handlers

### Using asyncHandler

```typescript
import { asyncHandler } from '@/middleware/asyncHandler';
import { ErrorService } from '@/services/ErrorService';
import { Container } from 'typedi';

router.get('/users/:id', asyncHandler(async (req, res) => {
  const errorService = Container.get(ErrorService);
  const userService = Container.get(UserService);

  try {
    const user = await userService.getUser(req.params.id);
    res.json(user);
  } catch (error) {
    // Errors are automatically caught by asyncHandler
    throw error;
  }
}));

// Simpler version - let errors propagate
router.get('/users/:id', asyncHandler(async (req, res) => {
  const userService = Container.get(UserService);
  const user = await userService.getUser(req.params.id);
  res.json(user);
}));
```

### Complete Controller Example

```typescript
import { Router } from 'express';
import { asyncHandler } from '@/middleware/asyncHandler';
import { Container } from 'typedi';
import { UserService } from '@/services/UserService';
import { AppError } from '@/utils/errors';

const router = Router();

export class UserController {
  // Get user by ID
  static getById = asyncHandler(async (req, res) => {
    const userService = Container.get(UserService);
    const user = await userService.getUser(req.params.id);
    res.json(user);
  });

  // Create user
  static create = asyncHandler(async (req, res) => {
    const userService = Container.get(UserService);
    const newUser = await userService.create(req.body);
    res.status(201).json(newUser);
  });

  // Update user
  static update = asyncHandler(async (req, res) => {
    const userService = Container.get(UserService);
    const updated = await userService.update(req.params.id, req.body);
    res.json(updated);
  });

  // Delete user
  static delete = asyncHandler(async (req, res) => {
    const userService = Container.get(UserService);
    await userService.delete(req.params.id);
    res.status(204).send();
  });
}

// Routes
router.get('/users/:id', UserController.getById);
router.post('/users', UserController.create);
router.put('/users/:id', UserController.update);
router.delete('/users/:id', UserController.delete);

export default router;
```

## Retry Mechanism

### Basic Retry

```typescript
import { retry } from '@/utils/retry';

// Simple retry with defaults
const result = await retry(() => fetchData());
```

### Custom Retry Configuration

```typescript
import { retry } from '@/utils/retry';

// Retry with custom options
const result = await retry(
  async () => {
    return await externalAPI.call();
  },
  {
    maxAttempts: 5,
    initialDelay: 2000,
    maxDelay: 30000,
    backoffMultiplier: 2
  }
);
```

### Conditional Retry

```typescript
import { retry } from '@/utils/retry';

// Only retry on server errors
const result = await retry(
  async () => {
    return await externalAPI.call();
  },
  {
    maxAttempts: 3,
    initialDelay: 1000,
    shouldRetry: (error) => {
      // Only retry on 5xx errors
      return error.statusCode >= 500 && error.statusCode < 600;
    }
  }
);

// Retry specific error types
const result = await retry(
  async () => {
    return await database.query();
  },
  {
    maxAttempts: 3,
    shouldRetry: (error) => {
      // Retry on connection errors
      return error.code === 'ECONNRESET' ||
             error.code === 'ETIMEDOUT';
    }
  }
);
```

### Retry with Callbacks

```typescript
import { retry } from '@/utils/retry';

const result = await retry(
  async () => {
    return await externalAPI.call();
  },
  {
    maxAttempts: 3,
    initialDelay: 1000,
    onRetry: (attempt, error) => {
      console.log(`Attempt ${attempt} failed: ${error.message}`);
      // Log to monitoring system
      metrics.increment('retry.attempt', { attempt });
    }
  }
);
```

### Retry with Jitter

```typescript
import { retryWithJitter } from '@/utils/retry';

// Use jitter to prevent thundering herd
const result = await retryWithJitter(
  async () => {
    return await externalAPI.call();
  },
  {
    maxAttempts: 5,
    initialDelay: 1000,
    maxDelay: 10000
  }
);
```

## Service Layer Integration

### Complete Service Example

```typescript
import { Service } from 'typedi';
import { AppError } from '@/utils/errors';
import { ErrorService } from '@/services/ErrorService';
import { retry } from '@/utils/retry';

@Service()
export class InstanceService {
  constructor(
    private errorService: ErrorService,
    private dockerService: DockerService
  ) {}

  async startInstance(instanceId: string) {
    // Validate instance exists
    const instance = await this.getInstance(instanceId);
    if (!instance) {
      throw this.errorService.notFound('Instance', instanceId);
    }

    // Check if already running
    if (instance.status === 'running') {
      throw this.errorService.createError('INSTANCE_ALREADY_RUNNING', {
        instanceId
      });
    }

    // Start with retry for transient failures
    try {
      await retry(
        async () => {
          return await this.dockerService.start(instanceId);
        },
        {
          maxAttempts: 3,
          initialDelay: 1000,
          shouldRetry: (error) => {
            // Retry on Docker daemon errors
            return error.message.includes('Docker daemon') ||
                   error.code === 'ECONNREFUSED';
          }
        }
      );
    } catch (error) {
      // Log and create user-friendly error
      this.errorService.logError(error, { instanceId, action: 'start' });
      throw this.errorService.createError('INSTANCE_START_FAILED', {
        instanceId,
        originalError: error.message
      });
    }

    // Update instance status
    await this.updateInstanceStatus(instanceId, 'running');
    return instance;
  }

  async stopInstance(instanceId: string) {
    const instance = await this.getInstance(instanceId);
    if (!instance) {
      throw this.errorService.notFound('Instance', instanceId);
    }

    if (instance.status === 'stopped') {
      throw this.errorService.createError('INSTANCE_ALREADY_STOPPED', {
        instanceId
      });
    }

    try {
      await this.dockerService.stop(instanceId);
    } catch (error) {
      this.errorService.logError(error, { instanceId, action: 'stop' });
      throw this.errorService.createError('INSTANCE_STOP_FAILED', {
        instanceId,
        originalError: error.message
      });
    }

    await this.updateInstanceStatus(instanceId, 'stopped');
    return instance;
  }

  private async getInstance(instanceId: string) {
    // Implementation
  }

  private async updateInstanceStatus(instanceId: string, status: string) {
    // Implementation
  }
}
```

## Error Response Format

All errors return a consistent JSON format:

```json
{
  "success": false,
  "code": "NOT_FOUND",
  "message": "找不到标识为 '123' 的User",
  "details": {
    "resource": "User",
    "identifier": "123"
  },
  "actions": [
    "检查用户ID",
    "联系管理员"
  ],
  "timestamp": "2026-03-13T12:00:00.000Z"
}
```

## Best Practices

1. **Always use ErrorService** for creating errors in services
2. **Wrap async route handlers** with asyncHandler
3. **Provide helpful details** in error details object
4. **Include user-friendly actions** for common errors
5. **Log errors with context** using ErrorService.logError()
6. **Use retry mechanism** for external API calls
7. **Create custom error codes** for domain-specific errors
8. **Keep error messages bilingual** (Chinese for users, English for debugging)

## Testing Error Handling

```typescript
import { AppError } from '@/utils/errors';
import { ErrorCodes } from '@/utils/errors';

describe('UserService', () => {
  it('should throw not found error', async () => {
    const service = new UserService();

    await expect(
      service.getUser('nonexistent')
    ).rejects.toThrow(AppError);

    await expect(
      service.getUser('nonexistent')
    ).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND'
    });
  });

  it('should retry on transient failures', async () => {
    let attempts = 0;
    const mockAPI = jest.fn().mockImplementation(() => {
      attempts++;
      if (attempts < 3) {
        throw new Error('Transient error');
      }
      return Promise.resolve('success');
    });

    const result = await retry(mockAPI, {
      maxAttempts: 3,
      initialDelay: 10
    });

    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });
});
```

## Migration Guide

### Before (Old Pattern)
```typescript
app.get('/users/:id', async (req, res, next) => {
  try {
    const user = await userService.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    next(error);
  }
});
```

### After (New Pattern)
```typescript
app.get('/users/:id', asyncHandler(async (req, res) => {
  const user = await userService.findById(req.params.id);
  if (!user) {
    throw errorService.notFound('User', req.params.id);
  }
  res.json(user);
}));
```

## Summary

The error handling mechanism provides:
- **Consistent error format** across the application
- **Type-safe error codes** with TypeScript
- **Automatic error logging** with context
- **User-friendly error messages** in Chinese
- **Built-in retry mechanism** for resilience
- **Comprehensive test coverage** for reliability

For more details, see the implementation summary in `TASK-017-implementation-summary.md`.
