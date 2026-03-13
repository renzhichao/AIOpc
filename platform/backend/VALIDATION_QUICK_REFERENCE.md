# 输入验证中间件快速参考

## 快速开始

### 1. 导入
```typescript
import { validateBody, validateQuery, validateParams } from './middleware/validate';
import { InstanceSchemas, AuthSchemas, CommonSchemas } from './validation/schemas';
```

### 2. 基本用法

#### 验证请求体
```typescript
router.post('/instances', validateBody(InstanceSchemas.create), handler);
```

#### 验证查询参数
```typescript
router.get('/instances', validateQuery(CommonSchemas.pagination), handler);
```

#### 验证路径参数
```typescript
router.get('/instances/:id',
  validateParams(Joi.object({ id: CommonSchemas.id })),
  handler
);
```

## 可用 Schema

### CommonSchemas
- `id` - 数字 ID 验证
- `instanceId` - UUID 格式验证
- `pagination` - 分页参数（page, limit, sort, order）

### AuthSchemas
- `callback` - OAuth 回调验证
- `refreshToken` - 刷新令牌验证
- `verifyToken` - 令牌验证

### InstanceSchemas
- `create` - 创建实例验证
- `update` - 更新实例验证

### UserSchemas
- `update` - 更新用户信息验证

### DocumentSchemas
- `create` - 创建文档验证
- `search` - 搜索文档验证

## 自定义 Schema

```typescript
import Joi from 'joi';

const customSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  email: Joi.string().email().required(),
  age: Joi.number().integer().min(18).max(120).optional()
});

router.post('/users', validateBody(customSchema), handler);
```

## 错误响应格式

```json
{
  "success": false,
  "code": "VALIDATION_ERROR",
  "message": "请求参数验证失败",
  "details": [
    {
      "field": "email",
      "message": "\"email\" must be a valid email"
    }
  ]
}
```

## 安全特性

### 自动防护
- ✅ XSS 攻击防护（自动清理 HTML/JavaScript）
- ✅ SQL 注入防护（检测和阻止 SQL 模式）
- ✅ 未知字段过滤（仅保留 Schema 定义的字段）
- ✅ 自动类型转换（字符串转数字等）
- ✅ 默认值应用

### 无需额外配置
安全防护在 `src/app.ts` 中全局启用，自动应用于所有请求。

## 常用验证规则

### 字符串
```typescript
Joi.string().min(1).max(100).required()
Joi.string().email().required()
Joi.string().pattern(/^[a-z]+$/).required()
```

### 数字
```typescript
Joi.number().integer().min(0).max(100).required()
Joi.number().positive().required()
Joi.number().default(0)
```

### 枚举
```typescript
Joi.string().valid('option1', 'option2', 'option3').required()
```

### 对象
```typescript
Joi.object({
  name: Joi.string().required(),
  age: Joi.number().optional()
}).default({ name: 'default', age: 0 })
```

### 数组
```typescript
Joi.array().items(Joi.string()).min(1).max(10)
Joi.array().items(
  Joi.object({
    id: Joi.number().required()
  })
)
```

## 测试

```typescript
import { validateBody } from './middleware/validate';
import Joi from 'joi';

describe('Validation', () => {
  it('should validate', () => {
    const schema = Joi.object({
      name: Joi.string().required()
    });

    const mockReq = { body: { name: 'Test' } };
    const mockNext = jest.fn();

    validateBody(schema)(mockReq, {}, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });
});
```

## 更多信息

详细文档请参阅 `VALIDATION_USAGE.md`
