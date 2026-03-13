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
  /** 访问令牌 */
  access_token: string;
  /** 令牌类型 */
  token_type: string;
  /** 过期时间（秒） */
  expires_in: number;
  /** 刷新令牌 */
  refresh_token: string;
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
}
