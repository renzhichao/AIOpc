import Joi from 'joi';

/**
 * 通用验证 Schema
 */
export const CommonSchemas = {
  // ID 参数验证
  id: Joi.string()
    .pattern(/^[0-9]+$/)
    .required()
    .messages({
      'string.pattern.base': 'ID 必须为数字'
    }),

  // 实例 ID 验证
  instanceId: Joi.string()
    .pattern(/^[a-z0-9-]{36}$/)
    .required()
    .messages({
      'string.pattern.base': '实例 ID 格式不正确'
    }),

  // 分页参数
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sort: Joi.string().optional(),
    order: Joi.string().valid('ASC', 'DESC').default('DESC')
  }).optional()
};

/**
 * OAuth 相关 Schema
 */
export const AuthSchemas = {
  // OAuth 回调
  callback: Joi.object({
    code: Joi.string()
      .required()
      .messages({
        'any.required': '授权码不能为空'
      }),
    state: Joi.string().optional()
  }),

  // Token 刷新
  refreshToken: Joi.object({
    refresh_token: Joi.string()
      .required()
      .messages({
        'any.required': '刷新令牌不能为空'
      })
  }),

  // Token 验证
  verifyToken: Joi.object({
    token: Joi.string()
      .required()
      .messages({
        'any.required': '令牌不能为空'
      })
  })
};

/**
 * 实例相关 Schema
 */
export const InstanceSchemas = {
  // 创建实例
  create: Joi.object({
    template: Joi.string()
      .valid('personal', 'team', 'enterprise')
      .required()
      .messages({
        'any.required': '模板类型不能为空',
        'any.only': '模板类型必须是 personal、team 或 enterprise'
      }),
    config: Joi.object({
      temperature: Joi.number()
        .min(0)
        .max(1)
        .default(0.7)
        .messages({
          'number.min': '温度值不能小于 0',
          'number.max': '温度值不能大于 1'
        }),
      max_tokens: Joi.number()
        .min(1)
        .max(8000)
        .default(4000)
        .messages({
          'number.min': '最大 Token 数不能小于 1',
          'number.max': '最大 Token 数不能大于 8000'
        }),
      system_prompt: Joi.string()
        .max(2000)
        .optional()
        .messages({
          'string.max': '系统提示不能超过 2000 字符'
        })
    }).default({
      temperature: 0.7,
      max_tokens: 4000
    })
  }),

  // 更新实例
  update: Joi.object({
    config: Joi.object({
      temperature: Joi.number().min(0).max(1).optional(),
      max_tokens: Joi.number().min(1).max(8000).optional(),
      system_prompt: Joi.string().max(2000).optional()
    }).optional()
  })
};

/**
 * 用户相关 Schema
 */
export const UserSchemas = {
  // 更新用户信息
  update: Joi.object({
    name: Joi.string()
      .min(1)
      .max(50)
      .optional()
      .messages({
        'string.min': '姓名不能为空',
        'string.max': '姓名不能超过 50 字符'
      }),
    email: Joi.string()
      .email()
      .optional()
      .messages({
        'string.email': '邮箱格式不正确'
      })
  })
};

/**
 * 文档相关 Schema
 */
export const DocumentSchemas = {
  // 创建文档
  create: Joi.object({
    title: Joi.string()
      .min(1)
      .max(200)
      .required()
      .messages({
        'any.required': '文档标题不能为空',
        'string.min': '文档标题不能为空',
        'string.max': '文档标题不能超过 200 字符'
      }),
    content: Joi.string()
      .required()
      .messages({
        'any.required': '文档内容不能为空'
      }),
    metadata: Joi.object().optional()
  }),

  // 搜索文档
  search: Joi.object({
    query: Joi.string()
      .min(1)
      .max(100)
      .required()
      .messages({
        'any.required': '搜索关键词不能为空'
      }),
    limit: Joi.number().integer().min(1).max(50).default(10)
  })
};
