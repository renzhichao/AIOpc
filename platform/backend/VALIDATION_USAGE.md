# 输入验证中间件使用指南

## 概述

输入验证中间件提供了全面的请求参数验证和安全防护功能，包括：

- 基于 Joi 的请求体验证
- 查询参数验证
- 路径参数验证
- XSS 攻击防护
- SQL 注入防护

## 安装

依赖已通过 pnpm 安装：

```bash
pnpm add joi
pnpm add -D @types/joi
```

## 基本使用

### 1. 导入验证函数和 Schema

```typescript
import { validateBody, validateQuery, validateParams } from './middleware/validate';
import { InstanceSchemas, AuthSchemas, CommonSchemas } from './validation/schemas';
```

### 2. 在路由中使用

#### 验证请求体

```typescript
import { Router } from 'express';
import { validateBody } from './middleware/validate';
import { InstanceSchemas } from './validation/schemas';

const router = Router();

// 创建实例
router.post(
  '/instances',
  validateBody(InstanceSchemas.create),
  async (req, res, next) => {
    // req.body 已经被验证和清理
    const { template, config } = req.body;
    // 处理逻辑...
  }
);
```

#### 验证查询参数

```typescript
// 获取实例列表
router.get(
  '/instances',
  validateQuery(CommonSchemas.pagination),
  async (req, res, next) => {
    // req.query 已经验证，包含默认值
    const { page, limit, sort, order } = req.query;
    // 处理逻辑...
  }
);
```

#### 验证路径参数

```typescript
// 获取单个实例
router.get(
  '/instances/:id',
  validateParams(Joi.object({
    id: CommonSchemas.id
  })),
  async (req, res, next) => {
    // req.params.id 已经验证为数字
    const instanceId = req.params.id;
    // 处理逻辑...
  }
);
```

### 3. 组合使用多个验证

```typescript
router.put(
  '/instances/:id',
  validateParams(Joi.object({
    id: CommonSchemas.id
  })),
  validateBody(InstanceSchemas.update),
  async (req, res, next) => {
    // 所有参数都已验证
    const { id } = req.params;
    const { config } = req.body;
    // 处理逻辑...
  }
);
```

## 自定义验证 Schema

### 创建新的 Schema

```typescript
// src/validation/schemas.ts
import Joi from 'joi';

export const CustomSchemas = {
  // 创建产品
  createProduct: Joi.object({
    name: Joi.string()
      .min(1)
      .max(100)
      .required()
      .messages({
        'any.required': '产品名称不能为空',
        'string.min': '产品名称不能为空',
        'string.max': '产品名称不能超过 100 字符'
      }),
    price: Joi.number()
      .positive()
      .required()
      .messages({
        'any.required': '价格不能为空',
        'number.positive': '价格必须大于 0'
      }),
    description: Joi.string()
      .max(500)
      .optional(),
    category: Joi.string()
      .valid('electronics', 'clothing', 'food')
      .required()
  })
};
```

### 使用自定义 Schema

```typescript
import { CustomSchemas } from './validation/schemas';

router.post(
  '/products',
  validateBody(CustomSchemas.createProduct),
  async (req, res, next) => {
    const product = await productService.create(req.body);
    res.json(product);
  }
);
```

## 错误处理

### 验证错误响应格式

当验证失败时，中间件返回以下格式的错误响应：

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

### 客户端处理示例

```typescript
// 前端处理验证错误
try {
  const response = await fetch('/api/instances', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  const result = await response.json();

  if (!result.success && result.code === 'VALIDATION_ERROR') {
    // 显示验证错误
    result.details.forEach((error: any) => {
      console.error(`${error.field}: ${error.message}`);
    });
  }
} catch (error) {
  console.error('Request failed:', error);
}
```

## 安全特性

### 1. XSS 防护

中间件自动清理所有输入，移除危险的 HTML 标签和 JavaScript 代码：

```typescript
// 输入
{
  "content": "<script>alert('xss')</script>Hello"
}

// 自动清理为
{
  "content": "Hello"
}
```

### 2. SQL 注入防护

中间件检测并阻止常见的 SQL 注入模式：

```typescript
// 被阻止的输入
{
  "query": "1' OR '1'='1"
}

// 响应
{
  "success": false,
  "code": "VALIDATION_ERROR",
  "message": "检测到非法输入"
}
```

### 3. 未知字段过滤

默认情况下，验证会移除未在 Schema 中定义的字段：

```typescript
const schema = Joi.object({
  name: Joi.string().required()
});

// 输入
{
  "name": "John",
  "unknown": "field"
}

// 验证后
{
  "name": "John"
}
```

## 高级用法

### 1. 条件验证

```typescript
const schema = Joi.object({
  paymentMethod: Joi.string().valid('credit', 'paypal').required(),
  creditCardNumber: Joi.string().when('paymentMethod', {
    is: 'credit',
    then: Joi.string().required(),
    otherwise: Joi.string().optional()
  })
});
```

### 2. 自定义验证器

```typescript
const schema = Joi.object({
  password: Joi.string()
    .min(8)
    .custom((value, helpers) => {
      if (!/[A-Z]/.test(value)) {
        return helpers.error('password.uppercase');
      }
      return value;
    })
    .messages({
      'password.uppercase': '密码必须包含至少一个大写字母'
    })
});
```

### 3. 对象和数组验证

```typescript
const schema = Joi.object({
  users: Joi.array().items(
    Joi.object({
      name: Joi.string().required(),
      email: Joi.string().email().required(),
      age: Joi.number().integer().min(18).max(120)
    })
  ).min(1).max(10)
});
```

## 最佳实践

1. **始终验证输入**：对所有 API 输入使用验证中间件
2. **提供清晰的错误消息**：使用中文消息帮助用户理解错误
3. **使用合理的默认值**：减少客户端需要提供的参数
4. **限制字符串长度**：防止过长的输入导致性能问题
5. **使用枚举验证**：限制字符串值的范围
6. **验证数字范围**：确保数值在合理的范围内
7. **验证邮箱和 URL**：使用内置的格式验证器
8. **记录验证失败**：中间件自动记录所有验证失败到日志

## 测试

### 单元测试示例

```typescript
import { validateBody } from './middleware/validate';
import Joi from 'joi';

describe('Validation Tests', () => {
  it('should validate correct data', () => {
    const schema = Joi.object({
      name: Joi.string().required()
    });

    const mockReq = {
      body: { name: 'Test' }
    };

    const mockNext = jest.fn();
    validateBody(schema)(mockReq, {}, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });
});
```

## 相关文件

- `/src/middleware/validate.ts` - 验证中间件实现
- `/src/validation/schemas.ts` - 验证 Schema 定义
- `/src/validation/index.ts` - 导出所有验证相关的模块
- `/src/middleware/__tests__/validate.test.ts` - 验证中间件测试
- `/src/middleware/__tests__/security.test.ts` - 安全功能测试
- `/src/validation/__tests__/schemas.test.ts` - Schema 测试
