/**
 * Error Codes Definition
 *
 * Standardized error codes with corresponding status codes,
 * technical messages, and user-friendly messages.
 *
 * Error Categories:
 * - 4xx: Client errors (validation, authorization, not found)
 * - 5xx: Server errors (database, Docker, internal)
 * - External errors: Third-party service failures
 */

export const ErrorCodes = {
  // ==================== Client Errors (4xx) ====================

  UNAUTHORIZED: {
    statusCode: 401,
    code: 'UNAUTHORIZED',
    message: 'Unauthorized access',
    userMessage: '您需要先登录才能进行此操作'
  },

  FORBIDDEN: {
    statusCode: 403,
    code: 'FORBIDDEN',
    message: 'Forbidden',
    userMessage: '您没有权限执行此操作'
  },

  NOT_FOUND: {
    statusCode: 404,
    code: 'NOT_FOUND',
    message: 'Resource not found',
    userMessage: '请求的资源不存在'
  },

  VALIDATION_ERROR: {
    statusCode: 400,
    code: 'VALIDATION_ERROR',
    message: 'Validation failed',
    userMessage: '请检查输入参数'
  },

  INVALID_INPUT: {
    statusCode: 400,
    code: 'INVALID_INPUT',
    message: 'Invalid input',
    userMessage: '输入参数格式不正确'
  },

  MISSING_REQUIRED_FIELD: {
    statusCode: 400,
    code: 'MISSING_REQUIRED_FIELD',
    message: 'Missing required field',
    userMessage: '缺少必填字段'
  },

  CONFLICT: {
    statusCode: 409,
    code: 'CONFLICT',
    message: 'Resource conflict',
    userMessage: '资源冲突，请检查后重试'
  },

  // ==================== Server Errors (5xx) ====================

  INTERNAL_ERROR: {
    statusCode: 500,
    code: 'INTERNAL_ERROR',
    message: 'Internal server error',
    userMessage: '服务器内部错误，请稍后重试'
  },

  DATABASE_ERROR: {
    statusCode: 500,
    code: 'DATABASE_ERROR',
    message: 'Database error',
    userMessage: '数据库错误，请稍后重试'
  },

  DOCKER_ERROR: {
    statusCode: 500,
    code: 'DOCKER_ERROR',
    message: 'Docker error',
    userMessage: 'Docker容器错误，请稍后重试'
  },

  SERVICE_UNAVAILABLE: {
    statusCode: 503,
    code: 'SERVICE_UNAVAILABLE',
    message: 'Service unavailable',
    userMessage: '服务暂时不可用，请稍后重试'
  },

  // ==================== External Errors ====================

  FEISHU_API_ERROR: {
    statusCode: 502,
    code: 'FEISHU_API_ERROR',
    message: 'Feishu API error',
    userMessage: '飞书服务暂时不可用，请稍后重试'
  },

  APIKEY_UNAVAILABLE: {
    statusCode: 503,
    code: 'APIKEY_UNAVAILABLE',
    message: 'API key unavailable',
    userMessage: '服务暂时繁忙，请稍后重试'
  },

  EXTERNAL_API_ERROR: {
    statusCode: 502,
    code: 'EXTERNAL_API_ERROR',
    message: 'External API error',
    userMessage: '外部服务错误，请稍后重试'
  },

  // ==================== Instance Errors ====================

  INSTANCE_NOT_FOUND: {
    statusCode: 404,
    code: 'INSTANCE_NOT_FOUND',
    message: 'Instance not found',
    userMessage: '实例不存在'
  },

  INSTANCE_START_FAILED: {
    statusCode: 500,
    code: 'INSTANCE_START_FAILED',
    message: 'Failed to start instance',
    userMessage: '实例启动失败，请稍后重试'
  },

  INSTANCE_STOP_FAILED: {
    statusCode: 500,
    code: 'INSTANCE_STOP_FAILED',
    message: 'Failed to stop instance',
    userMessage: '实例停止失败，请稍后重试'
  },

  INSTANCE_ALREADY_RUNNING: {
    statusCode: 409,
    code: 'INSTANCE_ALREADY_RUNNING',
    message: 'Instance already running',
    userMessage: '实例已在运行中'
  },

  INSTANCE_ALREADY_STOPPED: {
    statusCode: 409,
    code: 'INSTANCE_ALREADY_STOPPED',
    message: 'Instance already stopped',
    userMessage: '实例已停止'
  },

  INSTANCE_CREATE_FAILED: {
    statusCode: 500,
    code: 'INSTANCE_CREATE_FAILED',
    message: 'Failed to create instance',
    userMessage: '实例创建失败，请稍后重试'
  },

  INSTANCE_RESTART_FAILED: {
    statusCode: 500,
    code: 'INSTANCE_RESTART_FAILED',
    message: 'Failed to restart instance',
    userMessage: '实例重启失败，请稍后重试'
  },

  INSTANCE_DELETE_FAILED: {
    statusCode: 500,
    code: 'INSTANCE_DELETE_FAILED',
    message: 'Failed to delete instance',
    userMessage: '实例删除失败，请稍后重试'
  },

  INSTANCE_UPDATE_FAILED: {
    statusCode: 500,
    code: 'INSTANCE_UPDATE_FAILED',
    message: 'Failed to update instance',
    userMessage: '更新实例失败，请稍后重试'
  },

  INSTANCE_STATUS_FAILED: {
    statusCode: 500,
    code: 'INSTANCE_STATUS_FAILED',
    message: 'Failed to get instance status',
    userMessage: '获取实例状态失败，请稍后重试'
  },

  INSTANCE_LOGS_FAILED: {
    statusCode: 500,
    code: 'INSTANCE_LOGS_FAILED',
    message: 'Failed to get instance logs',
    userMessage: '获取实例日志失败，请稍后重试'
  },

  INSTANCE_ALREADY_CLAIMED: {
    statusCode: 409,
    code: 'INSTANCE_ALREADY_CLAIMED',
    message: 'Instance already claimed',
    userMessage: '实例已被其他用户认领'
  },

  INSTANCE_RELEASE_FAILED: {
    statusCode: 500,
    code: 'INSTANCE_RELEASE_FAILED',
    message: 'Failed to release instance',
    userMessage: '释放实例失败，请稍后重试'
  },

  INVALID_STATE_TRANSITION: {
    statusCode: 400,
    code: 'INVALID_STATE_TRANSITION',
    message: 'Invalid instance state transition',
    userMessage: '实例状态转换无效'
  },

  // ==================== Quota Errors ====================

  QUOTA_EXCEEDED: {
    statusCode: 429,
    code: 'QUOTA_EXCEEDED',
    message: 'Quota exceeded',
    userMessage: '已达到配额限制'
  },

  RATE_LIMIT_EXCEEDED: {
    statusCode: 429,
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Rate limit exceeded',
    userMessage: '请求过于频繁，请稍后重试'
  },

  // ==================== OAuth Errors ====================

  OAUTH_TOKEN_INVALID: {
    statusCode: 401,
    code: 'OAUTH_TOKEN_INVALID',
    message: 'Invalid OAuth token',
    userMessage: '访问令牌无效，请重新授权'
  },

  OAUTH_CODE_INVALID: {
    statusCode: 400,
    code: 'OAUTH_CODE_INVALID',
    message: 'Invalid OAuth code',
    userMessage: '授权码无效或已过期'
  },

  OAUTH_STATE_MISMATCH: {
    statusCode: 400,
    code: 'OAUTH_STATE_MISMATCH',
    message: 'OAuth state mismatch',
    userMessage: '授权状态不匹配，请重新授权'
  },

  OAUTH_CALLBACK_FAILED: {
    statusCode: 500,
    code: 'OAUTH_CALLBACK_FAILED',
    message: 'OAuth callback failed',
    userMessage: '授权回调失败，请重试'
  },

  // ==================== User Errors ====================

  USER_NOT_FOUND: {
    statusCode: 404,
    code: 'USER_NOT_FOUND',
    message: 'User not found',
    userMessage: '用户不存在，请先登录'
  },

  // ==================== Message Router Errors ====================

  MESSAGE_FORWARD_FAILED: {
    statusCode: 500,
    code: 'MESSAGE_FORWARD_FAILED',
    message: 'Failed to forward message to instance',
    userMessage: '消息转发失败，请稍后重试'
  },

  INSTANCE_NOT_RUNNING: {
    statusCode: 503,
    code: 'INSTANCE_NOT_RUNNING',
    message: 'Instance is not running',
    userMessage: '实例正在启动中，请稍后再试'
  },

  INSTANCE_UNREACHABLE: {
    statusCode: 503,
    code: 'INSTANCE_UNREACHABLE',
    message: 'Instance is unreachable',
    userMessage: '实例暂时无法访问，请稍后重试'
  },

  INSTANCE_TIMEOUT: {
    statusCode: 504,
    code: 'INSTANCE_TIMEOUT',
    message: 'Instance response timeout',
    userMessage: '处理超时，请稍后再试或简化您的问题'
  },

  CONTAINER_NO_IP: {
    statusCode: 500,
    code: 'CONTAINER_NO_IP',
    message: 'Container has no IP address',
    userMessage: '实例网络配置错误，请联系管理员'
  },

  FEISHU_MESSAGE_SEND_FAILED: {
    statusCode: 502,
    code: 'FEISHU_MESSAGE_SEND_FAILED',
    message: 'Failed to send message to Feishu',
    userMessage: '回复发送失败，请稍后重试'
  },

  // ==================== Conversation Errors ====================

  CONVERSATION_NOT_FOUND: {
    statusCode: 404,
    code: 'CONVERSATION_NOT_FOUND',
    message: 'Conversation not found',
    userMessage: '会话不存在'
  },

  CONVERSATION_ACCESS_DENIED: {
    statusCode: 403,
    code: 'CONVERSATION_ACCESS_DENIED',
    message: 'Access denied to conversation',
    userMessage: '您没有权限访问此会话'
  },

  INVALID_TITLE: {
    statusCode: 400,
    code: 'INVALID_TITLE',
    message: 'Invalid conversation title',
    userMessage: '会话标题格式不正确'
  },

  INVALID_MESSAGE_CONTENT: {
    statusCode: 400,
    code: 'INVALID_MESSAGE_CONTENT',
    message: 'Invalid message content',
    userMessage: '消息内容不能为空'
  },

  INSTANCE_NOT_OWNED: {
    statusCode: 403,
    code: 'INSTANCE_NOT_OWNED',
    message: 'Instance not owned by user',
    userMessage: '您没有权限访问此实例'
  },

  INVALID_INSTANCE_NAME: {
    statusCode: 400,
    code: 'INVALID_INSTANCE_NAME',
    message: 'Invalid instance name',
    userMessage: '实例名称格式不正确'
  },

  CONVERSATION_CREATE_FAILED: {
    statusCode: 500,
    code: 'CONVERSATION_CREATE_FAILED',
    message: 'Failed to create conversation',
    userMessage: '创建会话失败，请稍后重试'
  },

  MESSAGE_SAVE_FAILED: {
    statusCode: 500,
    code: 'MESSAGE_SAVE_FAILED',
    message: 'Failed to save message',
    userMessage: '保存消息失败，请稍后重试'
  }
} as const;

export type ErrorCodeKey = keyof typeof ErrorCodes;
