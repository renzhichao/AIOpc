/**
 * OAuth 2.0 类型定义
 * 用于飞书授权流程和 JWT Token 管理
 */

/**
 * 飞书授权 URL 选项
 */
export interface FeishuAuthUrlOptions {
  /** 状态参数，用于防止 CSRF 攻击 */
  state?: string;
  /** 重定向 URI */
  redirect_uri?: string;
  /** 授权范围 */
  scope?: string;
}

/**
 * 飞书 Token 响应
 */
export interface FeishuTokenResponse {
  /** 响应码，0 表示成功 */
  code: number;
  /** 响应消息 */
  msg: string;
  /** 响应数据（包含用户信息） */
  data?: {
    /** 访问令牌 */
    access_token: string;
    /** 令牌类型 */
    token_type: string;
    /** 过期时间（秒） */
    expires_in: number;
    /** 刷新令牌 */
    refresh_token: string;
    /** 刷新令牌过期时间（秒） */
    refresh_expires_in: number;
    /** 用户名 */
    name: string;
    /** 英文名 */
    en_name: string;
    /** 邮箱 */
    email: string;
    /** 头像 URL */
    avatar_url: string;
    /** 头像大图 */
    avatar_big: string;
    /** 头像中图 */
    avatar_middle: string;
    /** 头像缩略图 */
    avatar_thumb: string;
    /** 应用内用户标识 */
    open_id: string;
    /** 跨应用用户标识 */
    union_id: string;
    /** 租户 key */
    tenant_key: string;
    /** 会话 ID */
    sid: string;
  };
  /** 兼容旧格式：访问令牌 */
  access_token?: string;
  /** 兼容旧格式：令牌类型 */
  token_type?: string;
  /** 兼容旧格式：过期时间（秒） */
  expires_in?: number;
  /** 兼容旧格式：刷新令牌 */
  refresh_token?: string;
}

/**
 * 飞书用户信息
 */
export interface FeishuUserInfo {
  /** 用户名 */
  user_id: string;
  /** 中文名 */
  name: string;
  /** 英文名 */
  en_name: string;
  /** 邮箱 */
  email: string;
  /** 头像 URL */
  avatar_url: string;
  /** 跨应用用户标识 */
  union_id: string;
  /** 应用内用户标识 */
  open_id: string;
}

/**
 * JWT 载荷
 */
export interface JwtPayload {
  /** 用户 ID */
  userId: number;
  /** 飞书用户 ID */
  feishuUserId: string;
  /** 飞书 Union ID */
  feishuUnionId?: string;
  /** 用户名 */
  name: string;
  /** 邮箱 */
  email?: string;
  /** 签发时间 */
  iat?: number;
  /** 过期时间 */
  exp?: number;
}

/**
 * OAuth Token 响应
 */
export interface OAuthTokenResponse {
  /** 访问令牌 */
  access_token: string;
  /** 刷新令牌 */
  refresh_token: string;
  /** 过期时间（秒） */
  expires_in: number;
  /** 令牌类型 */
  token_type: string;
  /** 用户信息 */
  user: {
    /** 用户 ID */
    id: number;
    /** 飞书用户 ID */
    feishu_user_id: string;
    /** 用户名 */
    name: string;
    /** 邮箱 */
    email?: string;
  };
  /** TASK-001: 是否自动认领了实例 */
  has_instance: boolean;
  /** TASK-001: 认领的实例 ID（如果有） */
  instance_id?: string | null;
  /** TASK-001: 重定向目标 */
  redirect_to: string;
}
