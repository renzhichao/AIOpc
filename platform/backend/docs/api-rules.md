# API Route Standards and Best Practices

## Overview

This document defines the API route standards for the AIOpc Platform backend. All API endpoints must follow these conventions to ensure consistency, maintainability, and developer experience.

## Table of Contents

1. [RESTful Conventions](#restful-conventions)
2. [Route Naming](#route-naming)
3. [HTTP Methods](#http-methods)
4. [Request/Response Format](#requestresponse-format)
5. [Error Handling](#error-handling)
6. [Authentication](#authentication)
7. [Validation](#validation)
8. [Versioning](#versioning)
9. [Pagination](#pagination)
10. [Filtering and Sorting](#filtering-and-sorting)

## RESTful Conventions

### Resource-Based Design

API routes should be resource-based, not action-based:

```
✅ GOOD                          ❌ BAD
GET /api/v1/instances            GET /api/v1/getInstances
GET /api/v1/instances/:id        GET /api/v1/instanceById
POST /api/v1/instances           POST /api/v1/createInstance
PUT /api/v1/instances/:id        POST /api/v1/updateInstance
DELETE /api/v1/instances/:id     POST /api/v1/deleteInstance
```

### Nesting Resources

Nest resources only when they have a clear parent-child relationship:

```
✅ GOOD                          ❌ BAD
GET /api/v1/instances/:id/logs   GET /api/v1/logs?instanceId=:id
GET /api/v1/instances/:id/config GET /api/v1/instance-config
```

## Route Naming

### General Rules

1. **Use plural nouns for collections**
   ```
   ✅ /api/v1/instances
   ✅ /api/v1/users
   ✅ /api/v1/api-keys
   ```

2. **Use kebab-case for multi-word paths**
   ```
   ✅ /api/v1/instance-presets
   ❌ /api/v1/instancePresets
   ```

3. **Avoid verbs in paths** (use HTTP methods instead)
   ```
   ✅ POST /api/v1/instances/:id/start
   ❌ POST /api/v1/instances/:id/startInstance
   ```

### Parameter Naming

- Use snake_case for path parameters (consistent with database)
- Use snake_case for query parameters
- Use camelCase for JSON request/response bodies

```
Path:      /api/v1/instances/:instance_id/logs
Query:     ?status=active&page=1&limit=20
JSON:      { "userName": "john", "instanceId": "123" }
```

## HTTP Methods

### GET - Retrieve Resources

Used for fetching resources without side effects:

```
GET /api/v1/instances              # List instances
GET /api/v1/instances/:id          # Get single instance
GET /api/v1/instances/:id/logs     # Get instance logs
```

**Rules:**
- Never modify state
- Support pagination, filtering, sorting via query params
- Return 200 OK with data or 404 if not found

### POST - Create Resources or Trigger Actions

Used for creating resources or triggering actions:

```
POST /api/v1/instances              # Create instance
POST /api/v1/instances/:id/start    # Start instance (action)
POST /api/v1/oauth/callback         # OAuth callback (action)
```

**Rules:**
- Return 201 Created with new resource location
- For actions, return 200 OK with action result
- Include request body for creation

### PUT - Full Resource Update

Used for complete resource replacement (rarely used):

```
PUT /api/v1/instances/:id  # Replace entire instance
```

**Rules:**
- Require all fields in request body
- Return 200 OK with updated resource
- Return 400 Bad Request if validation fails

### PATCH - Partial Resource Update

Used for partial updates (preferred over PUT):

```
PATCH /api/v1/instances/:id/config  # Update instance config
```

**Rules:**
- Only include fields to update
- Return 200 OK with updated resource
- Return 400 Bad Request if validation fails

### DELETE - Remove Resources

Used for deletion:

```
DELETE /api/v1/instances/:id  # Delete instance
```

**Rules:**
- Return 204 No Content (no body)
- Or return 200 OK with deletion confirmation
- Consider soft deletes for audit trail

## Request/Response Format

### Standard Response Format

#### Success Response

```typescript
{
  "success": true,
  "data": T,                    // The actual data
  "meta": {                     // Optional metadata
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

#### Success Response with Message

```typescript
{
  "success": true,
  "data": T,
  "message": "Operation completed successfully"
}
```

#### Error Response

```typescript
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",     // Machine-readable error code
    "message": "Invalid input",     // Human-readable message
    "details": {                    // Optional validation details
      "field": "email",
      "reason": "Invalid format"
    },
    "stack": "..."                  // Stack trace (development only)
  }
}
```

### Response Status Codes

| Status | Usage | Example |
|--------|-------|---------|
| 200 OK | Successful operation | GET /api/v1/instances/:id |
| 201 Created | Resource created | POST /api/v1/instances |
| 204 No Content | Successful deletion | DELETE /api/v1/instances/:id |
| 400 Bad Request | Invalid input | POST with validation error |
| 401 Unauthorized | Missing/invalid auth | GET without token |
| 403 Forbidden | Valid auth, no permission | GET other user's instance |
| 404 Not Found | Resource not found | GET /api/v1/instances/999 |
| 409 Conflict | Resource conflict | POST duplicate email |
| 422 Unprocessable | Semantic errors | POST with business logic error |
| 429 Too Many Requests | Rate limit exceeded | Too many requests |
| 500 Internal Error | Server error | Unexpected error |

## Error Handling

### Error Response Structure

All errors must follow the standard error format:

```typescript
// ValidationError
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      },
      {
        "field": "password",
        "message": "Password must be at least 8 characters"
      }
    ]
  }
}

// AppError
{
  "success": false,
  "error": {
    "code": "INSTANCE_NOT_FOUND",
    "message": "Instance with ID '123' not found",
    "details": {
      "instanceId": "123"
    }
  }
}
```

### Error Codes

Use standardized error codes from `utils/errors.ts`:

```typescript
// Common error codes
UNAUTHORIZED          = 'UNAUTHORIZED'
FORBIDDEN            = 'FORBIDDEN'
NOT_FOUND            = 'NOT_FOUND'
VALIDATION_ERROR     = 'VALIDATION_ERROR'
INTERNAL_ERROR       = 'INTERNAL_ERROR'
INSTANCE_NOT_FOUND   = 'INSTANCE_NOT_FOUND'
INVALID_TEMPLATE     = 'INVALID_TEMPLATE'
DOCKER_ERROR         = 'DOCKER_ERROR'
```

## Authentication

### JWT Authentication

All protected endpoints require valid JWT token:

```typescript
// In controller
@UseBefore(authMiddleware)
@Get('/protected')
async protectedEndpoint(@Req() req: any) {
  const user = req.user;  // Set by auth middleware
  // ...
}
```

### Authentication Header

```
Authorization: Bearer <JWT_TOKEN>
```

### Public Endpoints

Mark public endpoints explicitly:

```typescript
// No auth required
@Get('/authorize')
async getAuthorizationUrl() {
  // ...
}
```

## Validation

### Request Validation

Use `class-validator` for request DTOs:

```typescript
import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';

export class CreateInstanceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsString()
  template: 'personal' | 'team' | 'enterprise';
}
```

### Validation Middleware

Apply validation middleware to routes:

```typescript
@Post()
@UseBefore(validateDto(CreateInstanceDto))
async createInstance(@Body() dto: CreateInstanceDto) {
  // dto is validated
}
```

### Validation Error Response

Return detailed validation errors:

```typescript
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      {
        "field": "name",
        "constraints": {
          "minLength": "Name must be at least 1 character",
          "maxLength": "Name must not exceed 100 characters"
        }
      }
    ]
  }
}
```

## Versioning

### URL Versioning

Use URL path versioning:

```
/api/v1/instances
/api/v2/instances  # Future version
```

### Versioning Strategy

- **Major versions** (v1, v2): Breaking changes
- **Minor versions**: Additions, backward compatible
- **Deprecation**: Mark old versions with `X-API-Deprecation` header

### Version Header

Include API version in response headers:

```
X-API-Version: 1.0.0
X-API-Deprecated: true; sunset=2025-12-31
```

## Pagination

### Pagination Parameters

Use consistent pagination parameters:

```
GET /api/v1/instances?page=1&limit=20
```

- `page`: Page number (default: 1, min: 1)
- `limit`: Items per page (default: 20, max: 100)

### Pagination Response

Include pagination metadata:

```typescript
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

### Pagination Links (Optional)

Include HATEOAS-style links:

```typescript
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  },
  "links": {
    "self": "/api/v1/instances?page=1&limit=20",
    "first": "/api/v1/instances?page=1&limit=20",
    "last": "/api/v1/instances?page=5&limit=20",
    "next": "/api/v1/instances?page=2&limit=20",
    "prev": null
  }
}
```

## Filtering and Sorting

### Filtering

Use query parameters for filtering:

```
GET /api/v1/instances?status=active&template=personal
```

Support common operators:
- Exact match: `?status=active`
- Multiple values: `?status=active,stopped`
- Range: `?created_after=2024-01-01`
- Search: `?search=keyword`

### Sorting

Use `sort` and `order` parameters:

```
GET /api/v1/instances?sort=created_at&order=desc
```

- `sort`: Field to sort by
- `order`: `asc` or `desc` (default: `asc`)

Multiple sort fields:

```
GET /api/v1/instances?sort=created_at,status&order=desc,asc
```

## API Endpoint Examples

### Instances API

```
# List instances
GET /api/v1/instances
GET /api/v1/instances?status=active&page=1&limit=20

# Get instance details
GET /api/v1/instances/:id

# Create instance
POST /api/v1/instances
Body: { "template": "personal", "config": { "name": "My Instance" } }

# Update instance config
PATCH /api/v1/instances/:id/config
Body: { "llm": { "provider": "deepseek" } }

# Instance actions
POST /api/v1/instances/:id/start
POST /api/v1/instances/:id/stop
POST /api/v1/instances/:id/restart

# Instance logs
GET /api/v1/instances/:id/logs?lines=100

# Instance metrics
GET /api/v1/instances/:id/metrics

# Delete instance
DELETE /api/v1/instances/:id

# Instance renewal
POST /api/v1/instances/:id/renew
Body: { "duration_days": 30 }

# Renewal history
GET /api/v1/instances/:id/renewals

# QR code
GET /api/v1/instances/:id/qr-code
```

### OAuth API

```
# Get authorization URL
GET /api/v1/oauth/authorize?redirect_uri=...

# OAuth callback
POST /api/v1/oauth/callback
Body: { "code": "..." }

# Refresh token
POST /api/v1/oauth/refresh
Body: { "refresh_token": "..." }

# Verify token
POST /api/v1/oauth/verify
Body: { "token": "..." }

# Logout
POST /api/v1/oauth/logout
```

### Health API

```
# Platform health
GET /api/v1/health

# Instance health
GET /api/v1/health/instances/:id

# Trigger recovery
POST /api/v1/health/instances/:id/recover

# Health statistics
GET /api/v1/health/statistics

# Health history
GET /api/v1/health/instances/:id/history

# Clear history
POST /api/v1/health/instances/:id/history/clear

# Run health check cycle
POST /api/v1/health/cycle
```

## OpenAPI Specification

All endpoints must be documented in the OpenAPI specification:

**Location**: `/platform/backend/docs/openapi.yaml`

Generate from code or maintain manually. Ensure:
- All endpoints are documented
- Request/response schemas are defined
- Authentication requirements are specified
- Error responses are included

## Testing

### Integration Tests

Every endpoint must have integration tests:

```typescript
describe('POST /api/v1/instances', () => {
  it('should create instance with valid data', async () => {
    const response = await request(app)
      .post('/api/v1/instances')
      .set('Authorization', `Bearer ${token}`)
      .send({
        template: 'personal',
        config: { name: 'Test Instance' }
      });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('success', true);
    expect(response.body.data).toHaveProperty('id');
  });

  it('should return 400 with invalid template', async () => {
    const response = await request(app)
      .post('/api/v1/instances')
      .set('Authorization', `Bearer ${token}`)
      .send({
        template: 'invalid',
        config: { name: 'Test Instance' }
      });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('success', false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});
```

## Best Practices Summary

1. **Use RESTful conventions**: Resource-based, not action-based
2. **Consistent naming**: Plural nouns, kebab-case paths
3. **Proper HTTP methods**: GET, POST, PUT, PATCH, DELETE
4. **Standardized responses**: Consistent success/error format
5. **Meaningful status codes**: Use appropriate HTTP status codes
6. **Request validation**: Validate all input data
7. **Authentication**: Protect non-public endpoints
8. **Error handling**: Detailed error messages with codes
9. **Pagination**: Support pagination for list endpoints
10. **Versioning**: Plan for API evolution
11. **Documentation**: Maintain OpenAPI spec
12. **Testing**: Comprehensive integration tests

## References

- [REST API Design Best Practices](https://restfulapi.net/)
- [OpenAPI 3.0 Specification](https://swagger.io/specification/)
- [HTTP Status Codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status)
- [class-validator](https://github.com/typestack/class-validator)
