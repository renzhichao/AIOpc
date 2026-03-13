/**
 * 飞书 Webhook 类型定义
 * 用于飞书事件接收和处理
 */

/**
 * 飞书 Webhook 请求体
 */
export interface FeishuWebhookRequest {
  /** 请求类型 */
  type: string;
  /** 验证令牌 (URL 验证时) */
  token?: string;
  /** 挑战字符串 (URL 验证时) */
  challenge?: string;
  /** 事件回调数据 */
  event?: FeishuEvent;
}

/**
 * 飞书事件基础
 */
export interface FeishuEvent {
  /** 事件类型 */
  type: string;
  /** 事件类型 (具体类型，如 im.message.receive_v1) */
  event_type: string;
  /** 事件时间戳 (毫秒) */
  create_time: string;
  /** 事件 token (用于验证) */
  token: string;
  /** 事件 ID (用于去重) */
  event_id: string;
  /** 应用 ID */
  app_id: string;
  /** 租户 key */
  tenant_key: string;
  /** 事件详情 */
  event: FeishuEventDetail;
}

/**
 * 飞书事件详情
 */
export interface FeishuEventDetail {
  /** 消息事件 */
  message?: FeishuMessageEvent;
  /** 群添加机器人事件 */
  bot_added_to_chat?: FeishuBotAddedEvent;
}

/**
 * 飞书消息事件
 */
export interface FeishuMessageEvent {
  /** 消息 ID */
  message_id: string;
  /** 消息创建时间 */
  create_time: string;
  /** 消息内容 */
  content: string;
  /** 消息类型 */
  msg_type: string;
  /** 发送者信息 */
  sender: FeishuSender;
  /** 群信息 (群消息时) */
  chat?: FeishuChat;
}

/**
 * 飞书群添加机器人事件
 */
export interface FeishuBotAddedEvent {
  /** 操作者信息 */
  operator: FeishuSender;
  /** 群信息 */
  chat: FeishuChat;
  /** 操作时间 */
  operate_time: string;
}

/**
 * 飞书发送者信息
 */
export interface FeishuSender {
  /** 发送者 ID */
  sender_id: FeishuSenderId;
  /** 发送者类型 */
  sender_type: string;
  /** 租户 key */
  tenant_key: string;
}

/**
 * 飞书发送者 ID
 */
export interface FeishuSenderId {
  /** 开放 ID */
  open_id: string;
  /** 联合 ID */
  union_id?: string;
  /** 用户 ID */
  user_id?: string;
}

/**
 * 飞书群信息
 */
export interface FeishuChat {
  /** 群 ID */
  chat_id: string;
  /** 群类型 */
  chat_type: string;
  /** 群名称 */
  name?: string;
  /** 租户 key */
  tenant_key: string;
}

/**
 * 飞书 Webhook 响应
 */
export interface FeishuWebhookResponse {
  /** 响应码 */
  code: number;
  /** 响应消息 */
  msg: string;
  /** 挑战字符串 (URL 验证时) */
  challenge?: string;
}

/**
 * 事件处理结果
 */
export interface EventProcessResult {
  /** 是否成功 */
  success: boolean;
  /** 错误消息 */
  error?: string;
  /** 响应数据 */
  data?: any;
}

/**
 * 消息内容解析结果
 */
export interface MessageContent {
  /** 文本内容 */
  text?: string;
  /** 原始 JSON */
  raw?: any;
}
