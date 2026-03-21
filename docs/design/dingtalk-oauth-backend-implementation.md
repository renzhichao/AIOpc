# 钉钉OAuth后端实现设计方案

**文档版本**: 1.0
**创建日期**: 2026-03-21
**关联Issue**: #23
**基于文档**: issue23-dingtalk-oauth-gap-analysis.md

---

## 📋 目录

1. [设计概述](#设计概述)
2. [文件结构图](#文件结构图)
3. [核心接口定义](#核心接口定义)
4. [DingTalkOAuthProvider实现](#dingtalkoauthprovider实现)
5. [服务层重构](#服务层重构)
6. [路由和控制器扩展](#路由和控制器扩展)
7. [数据库迁移](#数据库迁移)
8. [API端点规范](#api端点规范)
9. [错误处理策略](#错误处理策略)
10. [测试策略](#测试策略)
11. [实施计划](#实施计划)

---

## 🎯 设计概述

### 核心原则

1. **SOLID原则应用**
   - **S (单一职责)**: Provider只负责平台特定API调用，OAuthService负责流程编排
   - **O (开闭原则)**: 通过IOAuthProvider接口扩展，不修改现有代码
   - **L (里氏替换)**: 所有Provider可互换使用
   - **I (接口隔离)**: IOAuthProvider只定义必要方法
   - **D (依赖倒转)**: 高层模块依赖抽象接口

2. **向后兼容**
   - 保留所有现有飞书OAuth功能
   - 默认行为不变（/oauth/callback仍为飞书）
   - 新增功能通过新端点和参数实现

3. **性能优化**
   - HTTP连接池复用（Axios实例）
   - 配置缓存（避免重复读取环境变量）
   - 数据库索引优化（唯一索引覆盖查询）
   - 异步非阻塞（所有IO操作使用async/await）

4. **安全可靠**
   - 敏感信息加密存储（app_secret）
   - Token安全传输（HTTPS only）
   - CSRF防护（state参数验证）
   - 错误信息脱敏（不泄露内部实现）

### 技术栈

- **后端框架**: NestJS + TypeScript (使用routing-controllers)
- **数据库**: PostgreSQL + TypeORM
- **HTTP客户端**: Axios (with connection pooling)
- **配置管理**: @nestjs/config + process.env
- **依赖注入**: TypeDI (Service装饰器)
- **日志**: Winston (logger实例)

---

## 📁 文件结构图

### 新增文件

```
platform/backend/src/
├── providers/
│   ├── IOAuthProvider.interface.ts           # OAuth提供者接口
│   ├── BaseOAuthProvider.abstract.ts         # 基础OAuth提供者（抽象类）
│   ├── feishu/
│   │   └── FeishuOAuthProvider.ts           # 飞书OAuth提供者（重构）
│   └── dingtalk/
│       ├── DingTalkOAuthProvider.ts         # 钉钉OAuth提供者（新增）
│       ├── DingTalkAuthProvider.ts          # 钉钉认证专用服务
│       └── types.ts                         # 钉钉类型定义
├── services/
│   └── OAuthService.ts                      # OAuth服务（重构为平台无关）
├── controllers/
│   └── OAuthController.ts                   # OAuth控制器（扩展）
├── types/
│   └── oauth.types.ts                       # OAuth类型（扩展）
├── entities/
│   └── User.entity.ts                       # 用户实体（扩展字段）
├── repositories/
│   └── UserRepository.ts                    # 用户仓储（扩展方法）
└── migrations/
    └── 1700000000000-add-dingtalk-oauth.ts  # 数据库迁移脚本
```

### 修改文件

```
✏️ platform/backend/src/services/OAuthService.ts      # 平台无关重构
✏️ platform/backend/src/controllers/OAuthController.ts # 添加平台路由
✏️ platform/backend/src/entities/User.entity.ts       # 添加钉钉字段
✏️ platform/backend/src/repositories/UserRepository.ts# 添加查询方法
✏️ platform/backend/src/types/oauth.types.ts          # 扩展类型定义
```

---

## 🔌 核心接口定义

### 1. IOAuthProvider接口

**文件**: `src/providers/IOAuthProvider.interface.ts`

```typescript
/**
 * OAuth提供者统一接口
 * 所有OAuth平台（飞书、钉钉等）必须实现此接口
 */
export interface IOAuthProvider {
  /**
   * 获取平台标识符
   * @returns 平台名称（feishu/dingtalk）
   */
  getPlatform(): OAuthPlatform;

  /**
   * 生成授权URL
   * @param redirectUri 回调地址
   * @param state CSRF防护参数
   * @returns 授权URL
   */
  getAuthorizationUrl(redirectUri: string, state: string): Promise<string>;

  /**
   * 交换授权码获取用户信息
   * @param code 授权码
   * @returns 标准化用户信息
   */
  exchangeCodeForUserInfo(code: string): Promise<StandardizedUserInfo>;

  /**
   * 刷新访问令牌（可选）
   * @param refreshToken 刷新令牌
   * @returns 新的用户信息
   */
  refreshUserInfo?(refreshToken: string): Promise<StandardizedUserInfo>;

  /**
   * 验证配置完整性
   * @throws {Error} 配置缺失时抛出异常
   */
  validateConfig(): void;
}

/**
 * 支持的OAuth平台类型
 */
export type OAuthPlatform = 'feishu' | 'dingtalk';

/**
 * 标准化用户信息
 * 所有平台用户信息统一映射到此结构
 */
export interface StandardizedUserInfo {
  /** 平台标识 */
  platform: OAuthPlatform;

  /** 平台用户唯一ID (相当于open_id) */
  user_id: string;

  /** 跨应用用户ID (相当于union_id) */
  union_id?: string;

  /** 用户姓名 */
  name: string;

  /** 邮箱 */
  email?: string;

  /** 头像URL */
  avatar_url?: string;

  /** 原始响应数据（用于调试和扩展） */
  raw: any;
}
```

### 2. 钉钉类型定义

**文件**: `src/providers/dingtalk/types.ts`

```typescript
/**
 * 钉钉OAuth配置
 */
export interface DingTalkOAuthConfig {
  /** 钉钉AppKey (即ClientID) */
  appKey: string;

  /** 钉钉AppSecret */
  appSecret: string;

  /** 企业ID（可选，用于企业内部应用） */
  corpId?: string;

  /** OAuth授权URL */
  authorizeUrl: string;

  /** 获取Token URL */
  tokenUrl: string;

  /** 获取用户信息URL */
  userInfoUrl: string;

  /** 回调地址 */
  redirectUri: string;
}

/**
 * 钉钉Token请求
 */
export interface DingTalkTokenRequest {
  clientId: string;
  code: string;
  grantType: 'authorization_code';
  refreshToken?: string;
}

/**
 * 钉钉Token响应
 */
export interface DingTalkTokenResponse {
  /** 访问令牌 */
  accessToken: string;

  /** 令牌类型 */
  tokenType: string;

  /** 过期时间（秒） */
  expiresIn: number;

  /** 刷新令牌 */
  refreshToken?: string;
}

/**
 * 钉钉用户信息
 */
export interface DingTalkUserInfo {
  /** 跨企业用户唯一标识 */
  unionId: string;

  /** 企业内用户唯一标识 */
  userId: string;

  /** 用户姓名 */
  name: string;

  /** 头像URL */
  avatarUrl: string;

  /** 用户状态 */
  stateCode: string;

  /** 邮箱 */
  email?: string;

  /** 手机号 */
  mobile?: string;

  /** 部门信息 */
  deptOrderList?: Array<{
    deptId: number;
    order: number;
  }>;
}

/**
 * 钉钉API错误响应
 */
export interface DingTalkErrorResponse {
  /** 错误码 */
  code: string;

  /** 错误消息 */
  message: string;

  /** 请求ID（用于排查） */
  requestId?: string;
}
```

---

## 🔧 DingTalkOAuthProvider实现

### 1. DingTalkOAuthProvider主类

**文件**: `src/providers/dingtalk/DingTalkOAuthProvider.ts`

```typescript
import { Service } from 'typedi';
import axios, { AxiosInstance } from 'axios';
import { logger } from '../../config/logger';
import {
  IOAuthProvider,
  OAuthPlatform,
  StandardizedUserInfo
} from '../IOAuthProvider.interface';
import {
  DingTalkOAuthConfig,
  DingTalkTokenRequest,
  DingTalkTokenResponse,
  DingTalkUserInfo
} from './types';
import { AppError } from '../../utils/errors';

/**
 * 钉钉OAuth提供者
 *
 * 实现钉钉OAuth 2.0授权流程
 * 文档: https://open.dingtalk.com/document/orgapp-server/obtain-user-token
 */
@Service()
export class DingTalkOAuthProvider implements IOAuthProvider {
  private readonly axiosInstance: AxiosInstance;
  private readonly config: DingTalkOAuthConfig;
  private readonly PLATFORM: OAuthPlatform = 'dingtalk';

  constructor() {
    // 初始化配置
    this.config = this.loadConfig();

    // 创建Axios实例（连接池复用）
    this.axiosInstance = axios.create({
      timeout: 10000, // 10秒超时
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // 响应拦截器（统一错误处理）
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error('DingTalk API request failed', {
          url: error.config?.url,
          status: error.response?.status,
          message: error.message
        });
        throw this.handleDingTalkError(error);
      }
    );

    logger.info('DingTalkOAuthProvider initialized');
  }

  /**
   * 获取平台标识
   */
  getPlatform(): OAuthPlatform {
    return this.PLATFORM;
  }

  /**
   * 验证配置完整性
   */
  validateConfig(): void {
    const required: (keyof DingTalkOAuthConfig)[] = [
      'appKey',
      'appSecret',
      'authorizeUrl',
      'tokenUrl',
      'userInfoUrl'
    ];

    const missing = required.filter(
      (key) => !this.config[key]
    );

    if (missing.length > 0) {
      throw new AppError(
        500,
        'DINGTALK_CONFIG_MISSING',
        `Missing DingTalk configuration: ${missing.join(', ')}`
      );
    }
  }

  /**
   * 生成钉钉授权URL
   *
   * 文档: https://open.dingtalk.com/document/orgapp-server/dingtalk-retrieve-authorization
   */
  async getAuthorizationUrl(
    redirectUri: string,
    state: string
  ): Promise<string> {
    this.validateConfig();

    const params = new URLSearchParams({
      redirect_uri: redirectUri,
      response_type: 'code',
      client_id: this.config.appKey,
      scope: 'openid corpid', // 获取企业信息
      state: state,
      prompt: 'consent' // 每次都显示授权页面
    });

    const url = `${this.config.authorizeUrl}?${params.toString()}`;

    logger.info('Generated DingTalk authorization URL', { state });

    return url;
  }

  /**
   * 交换授权码获取用户信息
   *
   * 流程:
   * 1. 使用code换取access_token
   * 2. 使用access_token获取用户信息
   *
   * 文档:
   * - 获取Token: https://open.dingtalk.com/document/orgapp-server/obtain-user-token
   * - 获取用户信息: https://open.dingtalk.com/document/orgapp-server/dingtalk-retrieve-user-information
   */
  async exchangeCodeForUserInfo(
    code: string
  ): Promise<StandardizedUserInfo> {
    this.validateConfig();

    try {
      // Step 1: 换取access_token
      const tokenResponse = await this.exchangeCodeForToken(code);

      // Step 2: 获取用户信息
      const dingTalkUserInfo = await this.getUserInfo(
        tokenResponse.accessToken
      );

      // Step 3: 标准化为统一格式
      return this.standardizeUserInfo(dingTalkUserInfo);
    } catch (error) {
      logger.error('Failed to exchange code for user info', {
        platform: 'dingtalk',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new AppError(
        401,
        'DINGTALK_OAUTH_FAILED',
        'Failed to authenticate with DingTalk'
      );
    }
  }

  /**
   * 交换授权码获取访问令牌（私有方法）
   */
  private async exchangeCodeForToken(
    code: string
  ): Promise<DingTalkTokenResponse> {
    const request: DingTalkTokenRequest = {
      clientId: this.config.appKey,
      code: code,
      grantType: 'authorization_code'
    };

    logger.info('Exchanging code for DingTalk token', {
      clientId: this.config.appKey,
      codeLength: code.length
    });

    const response = await this.axiosInstance.post<any>(
      this.config.tokenUrl,
      request
    );

    // 钉钉API成功响应不返回code字段，直接返回token数据
    const tokenData = response.data;

    logger.info('DingTalk token received', {
      hasAccessToken: !!tokenData.accessToken,
      tokenType: tokenData.tokenType,
      expiresIn: tokenData.expiresIn
    });

    return {
      accessToken: tokenData.accessToken,
      tokenType: tokenData.tokenType,
      expiresIn: tokenData.expiresIn,
      refreshToken: tokenData.refreshToken
    };
  }

  /**
   * 获取钉钉用户信息（私有方法）
   */
  private async getUserInfo(accessToken: string): Promise<DingTalkUserInfo> {
    const response = await this.axiosInstance.get<{ data: DingTalkUserInfo }>(
      this.config.userInfoUrl,
      {
        headers: {
          'x-acs-dingtalk-access-token': accessToken
        }
      }
    );

    const userInfo = response.data.data;

    logger.info('DingTalk user info retrieved', {
      unionId: userInfo.unionId,
      userId: userInfo.userId,
      name: userInfo.name
    });

    return userInfo;
  }

  /**
   * 标准化用户信息（私有方法）
   *
   * 钉钉字段 -> 标准字段映射:
   * - userId -> user_id
   * - unionId -> union_id
   * - name -> name
   * - avatarUrl -> avatar_url
   */
  private standardizeUserInfo(
    dingTalkInfo: DingTalkUserInfo
  ): StandardizedUserInfo {
    return {
      platform: 'dingtalk',
      user_id: dingTalkInfo.userId,
      union_id: dingTalkInfo.unionId,
      name: dingTalkInfo.name,
      email: dingTalkInfo.email,
      avatar_url: dingTalkInfo.avatarUrl,
      raw: dingTalkInfo
    };
  }

  /**
   * 处理钉钉API错误（私有方法）
   */
  private handleDingTalkError(error: any): Error {
    if (error.response) {
      const dingTalkError = error.response.data as DingTalkErrorResponse;

      // 错误码映射
      const errorMessages: Record<string, string> = {
        'invalid_request': '请求参数无效',
        'invalid_client': 'AppKey或AppSecret无效',
        'invalid_grant': '授权码无效或已过期',
        'unauthorized_client': '应用未授权',
        'access_denied': '用户拒绝授权',
        'invalid_token': 'Token无效或已过期'
      };

      const message =
        errorMessages[dingTalkError.code] ||
        dingTalkError.message ||
        '钉钉API调用失败';

      return new AppError(
        error.response.status,
        `DINGTALK_${dingTalkError.code.toUpperCase()}`,
        message
      );
    }

    // 网络错误或超时
    if (error.code === 'ECONNABORTED') {
      return new AppError(
        504,
        'DINGTALK_TIMEOUT',
        '钉钉API请求超时'
      );
    }

    return error;
  }

  /**
   * 加载配置（私有方法）
   */
  private loadConfig(): DingTalkOAuthConfig {
    return {
      appKey: process.env.DINGTALK_APP_KEY || '',
      appSecret: process.env.DINGTALK_APP_SECRET || '',
      corpId: process.env.DINGTALK_CORP_ID,
      authorizeUrl:
        process.env.DINGTALK_OAUTH_AUTHORIZE_URL ||
        'https://login.dingtalk.com/oauth2/auth',
      tokenUrl:
        process.env.DINGTALK_OAUTH_TOKEN_URL ||
        'https://api.dingtalk.com/v1.0/oauth2/userAccessToken',
      userInfoUrl:
        process.env.DINGTALK_OAUTH_USERINFO_URL ||
        'https://api.dingtalk.com/v1.0/contact/users/me',
      redirectUri:
        process.env.DINGTALK_REDIRECT_URI ||
        process.env.OAUTH_REDIRECT_URI ||
        ''
    };
  }
}
```

### 2. BaseOAuthProvider抽象类（可选优化）

**文件**: `src/providers/BaseOAuthProvider.abstract.ts`

```typescript
import axios, { AxiosInstance } from 'axios';
import { logger } from '../config/logger';
import { IOAuthProvider, OAuthPlatform, StandardizedUserInfo } from './IOAuthProvider.interface';

/**
 * 基础OAuth提供者抽象类
 * 提供通用功能，减少重复代码
 */
export abstract class BaseOAuthProvider implements IOAuthProvider {
  protected readonly axiosInstance: AxiosInstance;
  protected readonly RETRY_MAX_ATTEMPTS = 3;
  protected readonly RETRY_DELAY_MS = 1000;

  constructor() {
    this.axiosInstance = axios.create({
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    this.setupInterceptors();
  }

  /**
   * 抽象方法：子类必须实现
   */
  abstract getPlatform(): OAuthPlatform;
  abstract validateConfig(): void;
  abstract exchangeCodeForUserInfo(code: string): Promise<StandardizedUserInfo>;
  abstract getAuthorizationUrl(redirectUri: string, state: string): Promise<string>;

  /**
   * 设置拦截器
   */
  protected setupInterceptors(): void {
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error) => {
        const config = error.config;

        // 重试逻辑
        if (!config.__retryCount) {
          config.__retryCount = 0;
        }

        if (config.__retryCount < this.RETRY_MAX_ATTEMPTS) {
          config.__retryCount++;

          logger.info('Retrying API request', {
            url: config.url,
            attempt: config.__retryCount
          });

          await new Promise((resolve) =>
            setTimeout(resolve, this.RETRY_DELAY_MS * config.__retryCount)
          );

          return this.axiosInstance.request(config);
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * 生成state参数
   */
  protected generateState(): string {
    return Math.random().toString(36).substring(2, 15) +
           Math.random().toString(36).substring(2, 15);
  }

  /**
   * 验证redirect URI
   */
  protected isValidRedirectUri(uri: string): boolean {
    try {
      const url = new URL(uri);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }
}
```

---

## 🔄 服务层重构

### OAuthService平台无关重构

**文件**: `src/services/OAuthService.ts`

```typescript
import { Service } from 'typedi';
import jwt from 'jsonwebtoken';
import { UserRepository } from '../repositories/UserRepository';
import { InstanceRepository } from '../repositories/InstanceRepository';
import { User } from '../entities/User.entity';
import { logger } from '../config/logger';
import type { StringValue } from 'ms';
import {
  IOAuthProvider,
  OAuthPlatform,
  StandardizedUserInfo
} from '../providers/IOAuthProvider.interface';
import { DingTalkOAuthProvider } from '../providers/dingtalk/DingTalkOAuthProvider';
import { FeishuOAuthProvider } from '../providers/feishu/FeishuOAuthProvider';
import {
  JwtPayload,
  OAuthTokenResponse,
  OAuthPlatformInfo
} from '../types/oauth.types';
import { AppError } from '../utils/errors';

/**
 * OAuth 2.0 服务（平台无关）
 *
 * 职责:
 * - 平台提供者管理
 * - OAuth流程编排
 * - 用户信息标准化
 * - JWT令牌生成
 * - 自动实例认领
 */
@Service()
export class OAuthService {
  private readonly providers: Map<OAuthPlatform, IOAuthProvider>;

  constructor(
    private readonly userRepository: UserRepository,
    private readonly instanceRepository: InstanceRepository
  ) {
    // 初始化OAuth提供者
    this.providers = new Map([
      ['feishu', new FeishuOAuthProvider()],
      ['dingtalk', new DingTalkOAuthProvider()]
    ]);

    logger.info('OAuthService initialized', {
      platforms: Array.from(this.providers.keys())
    });
  }

  /**
   * 获取启用的OAuth平台列表
   */
  getEnabledPlatforms(): OAuthPlatformInfo[] {
    const enabledFromEnv = process.env.OAUTH_ENABLED_PLATFORMS;
    const enabledList = enabledFromEnv
      ? (enabledFromEnv.split(',') as OAuthPlatform[])
      : ['feishu']; // 默认只启用飞书

    return enabledList
      .filter((platform) => this.providers.has(platform))
      .map((platform) => {
        const provider = this.providers.get(platform)!;
        provider.validateConfig(); // 验证配置

        return {
          platform,
          name: this.getPlatformDisplayName(platform),
          enabled: true
        };
      });
  }

  /**
   * 生成授权URL
   * @param platform OAuth平台
   * @param redirectUri 回调地址
   * @returns 授权URL
   */
  async getAuthorizationUrl(
    platform: OAuthPlatform,
    redirectUri?: string
  ): Promise<string> {
    const provider = this.getProvider(platform);

    const state = this.generateState();
    const finalRedirectUri =
      redirectUri ||
      process.env.OAUTH_REDIRECT_URI ||
      process.env.FEISHU_REDIRECT_URI;

    if (!finalRedirectUri) {
      throw new AppError(
        500,
        'OAUTH_CONFIG_MISSING',
        'OAuth redirect URI not configured'
      );
    }

    return provider.getAuthorizationUrl(finalRedirectUri, state);
  }

  /**
   * 处理OAuth回调
   * @param platform OAuth平台
   * @param code 授权码
   * @returns OAuth Token响应
   */
  async handleCallback(
    platform: OAuthPlatform,
    code: string
  ): Promise<OAuthTokenResponse> {
    try {
      // 1. 获取对应平台的Provider
      const provider = this.getProvider(platform);

      // 2. 交换授权码获取用户信息
      const userInfo = await provider.exchangeCodeForUserInfo(code);

      // 3. 查找或创建用户
      const user = await this.findOrCreateUser(userInfo);

      // 4. 更新最后登录时间
      await this.userRepository.updateLastLogin(user.id);

      // 5. 自动认领实例
      const claimedInstance = await this.autoClaimInstanceIfAvailable(user.id);

      // 6. 生成JWT令牌
      const jwtPayload: JwtPayload = {
        userId: user.id,
        platform: platform,
        [`${platform}UserId`]: this.getPlatformUserId(user, platform),
        [`${platform}UnionId`]: this.getPlatformUnionId(user, platform),
        name: user.name,
        email: user.email || undefined
      };

      const accessToken = this.generateJWTToken(jwtPayload);
      const refreshToken = this.generateRefreshToken(jwtPayload);

      logger.info('OAuth callback successful', {
        platform,
        userId: user.id,
        name: user.name
      });

      return {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: parseInt(process.env.JWT_EXPIRES_IN || '604800'), // 7天
        token_type: 'Bearer',
        user: {
          id: user.id,
          platform: platform,
          name: user.name,
          email: user.email
        },
        has_instance: !!claimedInstance,
        instance_id: claimedInstance?.instance_id || null,
        redirect_to: claimedInstance ? '/chat' : '/no-instance'
      };
    } catch (error) {
      logger.error('OAuth callback failed', {
        platform,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new AppError(
        401,
        'OAUTH_CALLBACK_FAILED',
        'Failed to process OAuth callback'
      );
    }
  }

  /**
   * 刷新JWT令牌
   */
  async refreshToken(refreshToken: string): Promise<{ access_token: string }> {
    try {
      const payload = jwt.verify(
        refreshToken,
        process.env.JWT_SECRET!
      ) as JwtPayload;

      const newAccessToken = this.generateJWTToken({
        userId: payload.userId,
        platform: payload.platform,
        [`${payload.platform}UserId`]:
          payload[`${payload.platform}UserId`],
        [`${payload.platform}UnionId`]:
          payload[`${payload.platform}UnionId`],
        name: payload.name,
        email: payload.email
      });

      logger.info('Token refresh successful', {
        userId: payload.userId,
        platform: payload.platform
      });

      return { access_token: newAccessToken };
    } catch (error) {
      logger.error('Token refresh failed', error);
      throw new AppError(
        401,
        'INVALID_REFRESH_TOKEN',
        'Invalid or expired refresh token'
      );
    }
  }

  /**
   * 验证JWT令牌
   */
  verifyToken(token: string): JwtPayload {
    try {
      const payload = jwt.verify(
        token,
        process.env.JWT_SECRET!
      ) as JwtPayload;
      return payload;
    } catch (error) {
      logger.error('Token verification failed', error);
      throw new AppError(
        401,
        'INVALID_TOKEN',
        'Invalid or expired token'
      );
    }
  }

  /**
   * 获取OAuth提供者（私有方法）
   */
  private getProvider(platform: OAuthPlatform): IOAuthProvider {
    const provider = this.providers.get(platform);

    if (!provider) {
      throw new AppError(
        400,
        'UNSUPPORTED_PLATFORM',
        `Unsupported OAuth platform: ${platform}`
      );
    }

    return provider;
  }

  /**
   * 查找或创建用户（私有方法）
   */
  private async findOrCreateUser(
    userInfo: StandardizedUserInfo
  ): Promise<User> {
    // 根据平台查找用户
    let user: User | null = null;

    switch (userInfo.platform) {
      case 'feishu':
        user = await this.userRepository.findByFeishuUserId(userInfo.user_id);
        break;
      case 'dingtalk':
        user = await this.userRepository.findByDingtalkUserId(userInfo.user_id);
        break;
    }

    // 如果找不到用户，创建新用户
    if (!user) {
      user = await this.createUser(userInfo);
      logger.info('New user created', {
        platform: userInfo.platform,
        userId: user.id,
        name: user.name
      });
    } else {
      // 更新现有用户
      await this.updateUser(user, userInfo);
      logger.info('Existing user updated', {
        platform: userInfo.platform,
        userId: user.id,
        name: user.name
      });
    }

    return user;
  }

  /**
   * 创建新用户（私有方法）
   */
  private async createUser(
    userInfo: StandardizedUserInfo
  ): Promise<User> {
    const createData: any = {
      oauth_platform: userInfo.platform,
      name: userInfo.name,
      email: userInfo.email || undefined,
      avatar_url: userInfo.avatar_url
    };

    // 根据平台设置对应字段
    switch (userInfo.platform) {
      case 'feishu':
        createData.feishu_user_id = userInfo.user_id;
        createData.feishu_union_id = userInfo.union_id;
        break;
      case 'dingtalk':
        createData.dingtalk_user_id = userInfo.user_id;
        createData.dingtalk_union_id = userInfo.union_id;
        break;
    }

    return this.userRepository.create(createData);
  }

  /**
   * 更新用户信息（私有方法）
   */
  private async updateUser(
    user: User,
    userInfo: StandardizedUserInfo
  ): Promise<void> {
    const updateData: any = {
      name: userInfo.name,
      email: userInfo.email || undefined,
      avatar_url: userInfo.avatar_url
    };

    // 根据平台更新union_id
    if (userInfo.union_id) {
      switch (userInfo.platform) {
        case 'feishu':
          updateData.feishu_union_id = userInfo.union_id;
          break;
        case 'dingtalk':
          updateData.dingtalk_union_id = userInfo.union_id;
          break;
      }
    }

    await this.userRepository.update(user.id, updateData);
  }

  /**
   * 获取平台用户ID（私有方法）
   */
  private getPlatformUserId(
    user: User,
    platform: OAuthPlatform
  ): string {
    switch (platform) {
      case 'feishu':
        return user.feishu_user_id;
      case 'dingtalk':
        return user.dingtalk_user_id || '';
    }
  }

  /**
   * 获取平台Union ID（私有方法）
   */
  private getPlatformUnionId(
    user: User,
    platform: OAuthPlatform
  ): string | undefined {
    switch (platform) {
      case 'feishu':
        return user.feishu_union_id || undefined;
      case 'dingtalk':
        return user.dingtalk_union_id || undefined;
    }
  }

  /**
   * 生成JWT访问令牌（私有方法）
   */
  private generateJWTToken(payload: JwtPayload): string {
    const tokenExpiresIn = process.env.JWT_EXPIRES_IN || '7d';
    return jwt.sign(payload, process.env.JWT_SECRET!, {
      expiresIn: tokenExpiresIn as StringValue | number
    });
  }

  /**
   * 生成JWT刷新令牌（私有方法）
   */
  private generateRefreshToken(payload: JwtPayload): string {
    const refreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '30d';
    return jwt.sign(payload, process.env.JWT_SECRET!, {
      expiresIn: refreshExpiresIn as StringValue | number
    });
  }

  /**
   * 生成随机state参数（私有方法）
   */
  private generateState(): string {
    return Math.random().toString(36).substring(2, 15) +
           Math.random().toString(36).substring(2, 15);
  }

  /**
   * 自动认领实例（私有方法）
   */
  private async autoClaimInstanceIfAvailable(
    userId: number
  ): Promise<{ instance_id: string } | null> {
    try {
      const unclaimedInstance =
        await this.instanceRepository.findUnclaimed();

      if (unclaimedInstance) {
        await this.instanceRepository.claimInstance(
          unclaimedInstance.instance_id,
          userId
        );

        logger.info('Auto-claimed instance for user', {
          userId,
          instanceId: unclaimedInstance.instance_id
        });

        return { instance_id: unclaimedInstance.instance_id };
      }

      return null;
    } catch (error) {
      logger.error('Failed to auto-claim instance', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * 获取平台显示名称（私有方法）
   */
  private getPlatformDisplayName(platform: OAuthPlatform): string {
    const names: Record<OAuthPlatform, string> = {
      feishu: '飞书',
      dingtalk: '钉钉'
    };
    return names[platform];
  }
}
```

---

## 🌐 路由和控制器扩展

### OAuthController扩展

**文件**: `src/controllers/OAuthController.ts`

```typescript
import { Controller, Post, Get, Body, QueryParam, Req, Res } from 'routing-controllers';
import { Service } from 'typedi';
import { OAuthService } from '../services/OAuthService';
import { logger } from '../config/logger';
import { AppError } from '../utils/errors';
import { OAuthPlatform } from '../providers/IOAuthProvider.interface';

/**
 * OAuth 2.0 Controller
 *
 * 多平台OAuth支持:
 * - 飞书 (feishu)
 * - 钉钉 (dingtalk)
 *
 * 向后兼容:
 * - GET  /oauth/authorize (默认飞书)
 * - POST /oauth/callback (默认飞书)
 */
@Service()
@Controller('/oauth')
export class OAuthController {
  constructor(
    private readonly oauthService: OAuthService
  ) {}

  /**
   * 获取启用的OAuth平台列表
   * GET /api/oauth/platforms
   *
   * 前端根据返回结果显示平台选择界面
   */
  @Get('/platforms')
  async getPlatforms() {
    try {
      const platforms = this.oauthService.getEnabledPlatforms();

      return {
        success: true,
        data: {
          platforms,
          default: process.env.OAUTH_DEFAULT_PLATFORM || 'feishu'
        }
      };
    } catch (error) {
      logger.error('Failed to get platforms', error);

      throw new AppError(
        500,
        'PLATFORMS_FETCH_FAILED',
        'Failed to fetch available platforms'
      );
    }
  }

  /**
   * 获取授权URL（多平台）
   * GET /oauth/authorize?platform=dingtalk
   *
   * Query Parameters:
   * - platform: OAuth平台 (feishu/dingtalk)，默认为feishu
   * - redirect_uri: 可选的自定义回调地址
   */
  @Get('/authorize')
  async getAuthorizationUrl(
    @QueryParam('platform') platform?: OAuthPlatform,
    @QueryParam('redirect_uri') redirectUri?: string
  ) {
    try {
      // 默认使用飞书
      const targetPlatform = platform || 'feishu';

      // 验证平台
      if (
!['feishu', 'dingtalk'].includes(targetPlatform)
) {
        throw new AppError(
          400,
          'INVALID_PLATFORM',
          `Invalid OAuth platform: ${targetPlatform}`
        );
      }

      // 验证redirect URI
      if (redirectUri && !this.isValidRedirectUri(redirectUri)) {
        throw new AppError(
          400,
          'INVALID_REDIRECT_URI',
          'Invalid redirect URI format'
        );
      }

      const url = await this.oauthService.getAuthorizationUrl(
        targetPlatform,
        redirectUri
      );

      return {
        success: true,
        data: {
          url,
          platform: targetPlatform
        }
      };
    } catch (error) {
      logger.error('Failed to generate authorization URL', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        500,
        'AUTH_URL_GENERATION_FAILED',
        'Failed to generate authorization URL'
      );
    }
  }

  /**
   * 飞书OAuth回调（向后兼容）
   * POST /oauth/feishu/callback
   */
  @Post('/feishu/callback')
  async handleFeishuCallback(@Body() body: any) {
    return this.handleCallback('feishu', body);
  }

  /**
   * 钉钉OAuth回调
   * POST /oauth/dingtalk/callback
   */
  @Post('/dingtalk/callback')
  async handleDingtalkCallback(@Body() body: any) {
    return this.handleCallback('dingtalk', body);
  }

  /**
   * 通用OAuth回调（向后兼容，默认飞书）
   * POST /oauth/callback
   */
  @Post('/callback')
  async handleCallbackDefault(@Body() body: any) {
    return this.handleCallback('feishu', body);
  }

  /**
   * 刷新令牌（平台无关）
   * POST /oauth/refresh
   */
  @Post('/refresh')
  async refreshToken(@Body() body: any) {
    const refreshToken = body.refresh_token;

    if (!refreshToken) {
      throw new AppError(
        400,
        'MISSING_REFRESH_TOKEN',
        'Refresh token is required'
      );
    }

    try {
      const tokens = await this.oauthService.refreshToken(refreshToken);

      return {
        success: true,
        data: tokens,
        message: 'Token refreshed successfully'
      };
    } catch (error) {
      logger.error('Token refresh failed', error);

      throw new AppError(
        401,
        'INVALID_REFRESH_TOKEN',
        'Invalid or expired refresh token'
      );
    }
  }

  /**
   * 验证令牌（平台无关）
   * POST /oauth/verify
   */
  @Post('/verify')
  async verifyToken(@Body() body: any) {
    const token = body.token;

    if (!token) {
      throw new AppError(
        400,
        'MISSING_TOKEN',
        'Token is required'
      );
    }

    try {
      const payload = this.oauthService.verifyToken(token);

      return {
        success: true,
        data: {
          valid: true,
          payload
        }
      };
    } catch (error) {
      logger.error('Token verification failed', error);

      return {
        success: true,
        data: {
          valid: false,
          error: 'Invalid or expired token'
        }
      };
    }
  }

  /**
   * 统一回调处理（私有方法）
   */
  private async handleCallback(platform: OAuthPlatform, body: any) {
    const authCode = body.code;

    if (!authCode) {
      throw new AppError(
        400,
        'MISSING_AUTH_CODE',
        'Authorization code is required'
      );
    }

    try {
      const tokens = await this.oauthService.handleCallback(
        platform,
        authCode
      );

      return {
        success: true,
        data: tokens,
        message: 'Authentication successful'
      };
    } catch (error) {
      logger.error('OAuth callback failed', {
        platform,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      throw new AppError(
        401,
        'OAUTH_CALLBACK_FAILED',
        `Failed to process ${platform} OAuth callback`
      );
    }
  }

  /**
   * 验证redirect URI（私有方法）
   */
  private isValidRedirectUri(uri: string): boolean {
    try {
      const url = new URL(uri);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }
}
```

---

## 🗄️ 数据库迁移

### 迁移脚本

**文件**: `src/migrations/1700000000000-add-dingtalk-oauth.ts`

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 添加钉钉OAuth支持
 *
 * 修改内容:
 * - User表添加oauth_platform字段
 * - User表添加dingtalk_user_id和dingtalk_union_id字段
 * - 将feishu_user_id改为nullable
 * - 添加唯一索引和联合索引
 */
export class AddDingtalkOAuth1700000000000
  implements MigrationInterface {
  name = 'AddDingtalkOAuth1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. 添加oauth_platform字段
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "oauth_platform" varchar(20) DEFAULT 'feishu'
    `);

    // 2. 添加dingtalk_user_id字段
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "dingtalk_user_id" varchar(255)
    `);

    // 3. 添加dingtalk_union_id字段
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "dingtalk_union_id" varchar(255)
    `);

    // 4. 将feishu_user_id改为nullable
    await queryRunner.query(`
      ALTER TABLE "users"
      ALTER COLUMN "feishu_user_id" DROP NOT NULL
    `);

    // 5. 创建dingtalk_user_id唯一索引
    await queryRunner.query(`
      CREATE INDEX "idx_users_dingtalk_user_id"
      ON "users" ("dingtalk_user_id")
      WHERE "dingtalk_user_id" IS NOT NULL
    `);

    // 6. 创建dingtalk_union_id索引
    await queryRunner.query(`
      CREATE INDEX "idx_users_dingtalk_union_id"
      ON "users" ("dingtalk_union_id")
      WHERE "dingtalk_union_id" IS NOT NULL
    `);

    // 7. 创建oauth_platform索引
    await queryRunner.query(`
      CREATE INDEX "idx_users_oauth_platform"
      ON "users" ("oauth_platform")
    `);

    // 8. 创建平台联合索引（用于多平台查询优化）
    await queryRunner.query(`
      CREATE UNIQUE INDEX "idx_users_platform_user_id"
      ON "users" (
        CASE
          WHEN "oauth_platform" = 'feishu' THEN "feishu_user_id"
          WHEN "oauth_platform" = 'dingtalk' THEN "dingtalk_user_id"
          ELSE NULL
        END
      )
      WHERE "oauth_platform" IN ('feishu', 'dingtalk')
    `);

    // 9. 为现有用户设置oauth_platform
    await queryRunner.query(`
      UPDATE "users"
      SET "oauth_platform" = 'feishu'
      WHERE "feishu_user_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 回滚操作
    await queryRunner.query(`
      DROP INDEX "idx_users_platform_user_id"
    `);

    await queryRunner.query(`
      DROP INDEX "idx_users_oauth_platform"
    `);

    await queryRunner.query(`
      DROP INDEX "idx_users_dingtalk_union_id"
    `);

    await queryRunner.query(`
      DROP INDEX "idx_users_dingtalk_user_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ALTER COLUMN "feishu_user_id" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN "dingtalk_union_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN "dingtalk_user_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN "oauth_platform"
    `);
  }
}
```

### User实体扩展

**文件**: `src/entities/User.entity.ts`

```typescript
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, OneToMany } from 'typeorm';
import { Conversation } from './Conversation.entity';
import { OAuthPlatform } from '../providers/IOAuthProvider.interface';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 20, default: 'feishu' })
  @Index()
  oauth_platform: OAuthPlatform;

  // 飞书字段（改为nullable）
  @Column({ nullable: true })
  @Index()
  feishu_user_id: string;

  @Column({ nullable: true })
  feishu_union_id: string;

  // 钉钉字段（新增）
  @Column({ nullable: true })
  @Index()
  dingtalk_user_id: string;

  @Column({ nullable: true })
  dingtalk_union_id: string;

  // 通用字段
  @Column()
  name: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  avatar_url: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  last_login_at: Date;

  /**
   * Relationship to user's conversations
   */
  @OneToMany(() => Conversation, (conversation) => conversation.user)
  conversations: Conversation[];
}
```

### UserRepository扩展

**文件**: `src/repositories/UserRepository.ts`

```typescript
/**
 * 根据钉钉用户ID查找用户（新增）
 */
async findByDingtalkUserId(dingtalkUserId: string): Promise<User | null> {
  const result = await this.repository.findOne({
    where: { dingtalk_user_id: dingtalkUserId }
  });
  return result || null;
}

/**
 * 根据钉钉Union ID查找用户（新增）
 */
async findByDingtalkUnionId(dingtalkUnionId: string): Promise<User | null> {
  const result = await this.repository.findOne({
    where: { dingtalk_union_id: dingtalkUnionId }
  });
  return result || null;
}

/**
 * 根据平台和用户ID查找用户（新增通用方法）
 */
async findByPlatformAndUserId(
  platform: OAuthPlatform,
  userId: string
): Promise<User | null> {
  const result = await this.repository.findOne({
    where: {
      oauth_platform: platform,
      ...(platform === 'feishu' && { feishu_user_id: userId }),
      ...(platform === 'dingtalk' && { dingtalk_user_id: userId })
    }
  });
  return result || null;
}
```

---

## 📡 API端点规范

### 1. 获取平台列表

**端点**: `GET /oauth/platforms`

**请求**: 无需参数

**响应**:
```json
{
  "success": true,
  "data": {
    "platforms": [
      {
        "platform": "feishu",
        "name": "飞书",
        "enabled": true
      },
      {
        "platform": "dingtalk",
        "name": "钉钉",
        "enabled": true
      }
    ],
    "default": "feishu"
  }
}
```

### 2. 获取授权URL

**端点**: `GET /oauth/authorize`

**请求参数**:
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| platform | string | 否 | OAuth平台（feishu/dingtalk），默认feishu |
| redirect_uri | string | 否 | 自定义回调地址 |

**响应**:
```json
{
  "success": true,
  "data": {
    "url": "https://login.dingtalk.com/oauth2/auth?...",
    "platform": "dingtalk"
  }
}
```

### 3. 钉钉OAuth回调

**端点**: `POST /oauth/dingtalk/callback`

**请求体**:
```json
{
  "code": "dingtalk_authorization_code"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "access_token": "jwt_access_token",
    "refresh_token": "jwt_refresh_token",
    "expires_in": 604800,
    "token_type": "Bearer",
    "user": {
      "id": 123,
      "platform": "dingtalk",
      "name": "张三",
      "email": "zhangsan@example.com"
    },
    "has_instance": true,
    "instance_id": "inst_abc123",
    "redirect_to": "/chat"
  },
  "message": "Authentication successful"
}
```

### 4. 错误响应格式

**统一错误格式**:
```json
{
  "success": false,
  "error": {
    "code": "DINGTALK_OAUTH_FAILED",
    "message": "用户拒绝授权",
    "details": {}
  }
}
```

**常见错误码**:
| 错误码 | HTTP状态 | 说明 |
|--------|---------|------|
| INVALID_PLATFORM | 400 | 不支持的OAuth平台 |
| MISSING_AUTH_CODE | 400 | 缺少授权码 |
| DINGTALK_OAUTH_FAILED | 401 | 钉钉OAuth认证失败 |
| DINGTALK_TIMEOUT | 504 | 钉钉API请求超时 |
| OAUTH_CONFIG_MISSING | 500 | OAuth配置缺失 |

---

## ⚠️ 错误处理策略

### 1. 错误分类

#### 平台特定错误

**钉钉错误码映射**:
```typescript
const DINGTALK_ERROR_CODES: Record<string, { message: string; httpStatus: number }> = {
  'invalid_request': { message: '请求参数无效', httpStatus: 400 },
  'invalid_client': { message: 'AppKey或AppSecret无效', httpStatus: 401 },
  'invalid_grant': { message: '授权码无效或已过期', httpStatus: 401 },
  'unauthorized_client': { message: '应用未授权此操作', httpStatus: 403 },
  'access_denied': { message: '用户拒绝授权', httpStatus: 401 },
  'invalid_token': { message: 'Token无效或已过期', httpStatus: 401 }
};
```

#### 系统级错误

- **配置错误**: 缺少必需环境变量 → 500
- **网络错误**: 连接超时 → 504
- **数据库错误**: 用户创建失败 → 500

### 2. 重试策略

```typescript
// 自动重试配置
const RETRY_CONFIG = {
  maxAttempts: 3,
  initialDelay: 1000, // ms
  backoffMultiplier: 2,
  retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED']
};

// 指数退避重试
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config = RETRY_CONFIG
): Promise<T> {
  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === config.maxAttempts) throw error;

      const delay = config.initialDelay * Math.pow(config.backoffMultiplier, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Max retry attempts reached');
}
```

### 3. 降级策略

- **OAuth服务不可用时**: 返回友好错误提示，引导用户重试
- **部分功能失败**: 如自动认领实例失败，不影响登录流程
- **日志记录**: 所有错误详细记录，便于排查

---

## 🧪 测试策略

### 1. 单元测试

#### DingTalkOAuthProvider测试

```typescript
describe('DingTalkOAuthProvider', () => {
  let provider: DingTalkOAuthProvider;
  let mockAxios: jest.Mocked<AxiosInstance>;

  beforeEach(() => {
    mockAxios = axios.create() as jest.Mocked<AxiosInstance>;
    provider = new DingTalkOAuthProvider();
    provider['axiosInstance'] = mockAxios;
  });

  describe('getAuthorizationUrl', () => {
    it('should generate correct DingTalk auth URL', async () => {
      const url = await provider.getAuthorizationUrl(
        'https://example.com/callback',
        'test-state'
      );

      expect(url).toContain('https://login.dingtalk.com/oauth2/auth');
      expect(url).toContain('client_id=');
      expect(url).toContain('redirect_uri=https://example.com/callback');
      expect(url).toContain('state=test-state');
    });
  });

  describe('exchangeCodeForUserInfo', () => {
    it('should successfully exchange code for user info', async () => {
      const mockTokenResponse = {
        data: {
          accessToken: 'test-access-token',
          tokenType: 'Bearer',
          expiresIn: 7200
        }
      };

      const mockUserInfo = {
        data: {
          data: {
            unionId: 'test-union-id',
            userId: 'test-user-id',
            name: '测试用户',
            avatarUrl: 'https://example.com/avatar.jpg'
          }
        }
      };

      mockAxios.post.mockResolvedValue(mockTokenResponse);
      mockAxios.get.mockResolvedValue(mockUserInfo);

      const userInfo = await provider.exchangeCodeForUserInfo('test-code');

      expect(userInfo.platform).toBe('dingtalk');
      expect(userInfo.user_id).toBe('test-user-id');
      expect(userInfo.name).toBe('测试用户');
    });
  });

  describe('validateConfig', () => {
    it('should throw error when AppKey is missing', () => {
      process.env.DINGTALK_APP_KEY = '';

      expect(() => provider.validateConfig()).toThrow('Missing DingTalk configuration');
    });
  });
});
```

#### OAuthService测试

```typescript
describe('OAuthService', () => {
  let service: OAuthService;
  let mockUserRepo: jest.Mocked<UserRepository>;
  let mockInstanceRepo: jest.Mocked<InstanceRepository>;

  beforeEach(() => {
    mockUserRepo = createMockUserRepository();
    mockInstanceRepo = createMockInstanceRepository();
    service = new OAuthService(mockUserRepo, mockInstanceRepo);
  });

  describe('getEnabledPlatforms', () => {
    it('should return only enabled platforms', () => {
      process.env.OAUTH_ENABLED_PLATFORMS = 'feishu,dingtalk';

      const platforms = service.getEnabledPlatforms();

      expect(platforms).toHaveLength(2);
      expect(platforms[0].platform).toBe('feishu');
      expect(platforms[1].platform).toBe('dingtalk');
    });
  });

  describe('handleCallback', () => {
    it('should create new user for DingTalk', async () => {
      mockUserRepo.findByDingtalkUserId.mockResolvedValue(null);
      mockUserRepo.create.mockResolvedValue({
        id: 123,
        dingtalk_user_id: 'test-user-id',
        name: '测试用户'
      } as User);

      const result = await service.handleCallback('dingtalk', 'test-code');

      expect(result.user.platform).toBe('dingtalk');
      expect(mockUserRepo.create).toHaveBeenCalled();
    });
  });
});
```

### 2. 集成测试

```typescript
describe('OAuth Integration Tests', () => {
  describe('DingTalk OAuth Flow', () => {
    it('should complete full DingTalk OAuth flow', async () => {
      // 1. 获取授权URL
      const authResponse = await request(app)
        .get('/oauth/authorize?platform=dingtalk')
        .expect(200);

      expect(authResponse.body.data.url).toContain('login.dingtalk.com');

      // 2. 模拟钉钉回调
      const callbackResponse = await request(app)
        .post('/oauth/dingtalk/callback')
        .send({ code: 'mock-dingtalk-code' })
        .expect(200);

      expect(callbackResponse.body.data.user.platform).toBe('dingtalk');
      expect(callbackResponse.body.data.access_token).toBeDefined();
    });
  });
});
```

### 3. E2E测试

```typescript
describe('OAuth E2E Tests', () => {
  it('should allow user to login with DingTalk and access protected routes', async () => {
    // 1. 获取平台列表
    const platformsResponse = await request(app)
      .get('/oauth/platforms')
      .expect(200);

    expect(platformsResponse.body.data.platforms).toContainEqual({
      platform: 'dingtalk',
      name: '钉钉',
      enabled: true
    });

    // 2. 获取授权URL
    const authResponse = await request(app)
      .get('/oauth/authorize?platform=dingtalk')
      .expect(200);

    // 3. 模拟扫码授权回调
    const callbackResponse = await request(app)
      .post('/oauth/dingtalk/callback')
      .send({ code: 'test-auth-code' })
      .expect(200);

    const { access_token } = callbackResponse.body.data;

    // 4. 使用token访问受保护路由
    await request(app)
      .get('/api/v1/user/profile')
      .set('Authorization', `Bearer ${access_token}`)
      .expect(200);
  });
});
```

---

## 📅 实施计划

### Phase 1: 基础设施 (1-2天)

- [x] 创建IOAuthProvider接口
- [ ] 实现BaseOAuthProvider抽象类
- [ ] 创建DingTalkOAuthProvider骨架
- [ ] 定义钉钉类型定义
- [ ] 编写单元测试框架

### Phase 2: 核心实现 (2-3天)

- [ ] 完成DingTalkOAuthProvider实现
- [ ] 重构FeishuOAuthProvider实现接口
- [ ] 扩展OAuthService支持多平台
- [ ] 添加平台配置验证
- [ ] 完成单元测试

### Phase 3: 数据库和API (1-2天)

- [ ] 创建并执行数据库迁移
- [ ] 扩展User实体和Repository
- [ ] 扩展OAuthController添加新路由
- [ ] 实现错误处理和重试逻辑
- [ ] 完成集成测试

### Phase 4: 测试和文档 (1-2天)

- [ ] 编写E2E测试
- [ ] 性能测试和优化
- [ ] 更新API文档
- [ ] 编写部署指南
- [ ] 代码审查和修复

### Phase 5: 部署和验证 (1天)

- [ ] 准备生产环境配置
- [ ] 执行数据库迁移
- [ ] 灰度发布到生产
- [ ] 监控和日志验证
- [ ] 用户验收测试

**总计**: 6-10个工作日

---

## 🔒 安全考虑

### 1. 密钥管理

- **环境变量存储**: DINGTALK_APP_SECRET存储在环境变量
- **加密传输**: 所有OAuth通信使用HTTPS
- **不记录日志**: app_secret和access_token不记录到日志

### 2. Token安全

- **JWT签名**: 使用强密钥（JWT_SECRET）
- **Token过期**: access_token 7天，refresh_token 30天
- **刷新机制**: 支持无感刷新，避免频繁重新登录

### 3. CSRF防护

- **State参数**: 授权URL包含随机state
- **State验证**: 回调时验证state匹配
- **短生命周期**: state 10分钟有效期

### 4. 错误信息

- **不泄露敏感信息**: 错误消息不包含app_secret等
- **统一错误格式**: 前端友好展示
- **详细日志**: 后端记录完整错误栈用于排查

---

## 📊 性能优化

### 1. 连接池

```typescript
// Axios实例复用，默认连接池大小
this.axiosInstance = axios.create({
  httpAgent: new http.Agent({ keepAlive: true, maxSockets: 50 }),
  httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 50 })
});
```

### 2. 缓存策略

- **配置缓存**: OAuth配置启动时加载，避免重复读取环境变量
- **Provider缓存**: OAuthProvider实例单例，复用HTTP连接

### 3. 数据库优化

- **索引覆盖**: 查询常用字段（user_id, union_id, oauth_platform）添加索引
- **联合索引**: 平台+用户ID联合索引，加速多平台查询

### 4. 异步处理

```typescript
// 所有IO操作异步非阻塞
async handleCallback(platform: OAuthPlatform, code: string) {
  const userInfo = await provider.exchangeCodeForUserInfo(code); // 异步
  const user = await this.findOrCreateUser(userInfo); // 异步
  const tokens = await this.generateTokens(user); // 异步
  return tokens;
}
```

---

## 📚 参考文档

- **钉钉开放平台文档**: https://open.dingtalk.com/document/orgapp-server/obtain-user-token
- **钉钉OAuth 2.0规范**: https://open.dingtalk.com/document/orgapp-server/dingtalk-retrieve-authorization
- **TypeORM文档**: https://typeorm.io/#/
- **Axios文档**: https://axios-http.com/docs/intro

---

**文档结束**

*本设计方案为钉钉OAuth后端实现的完整技术规范，包含核心接口定义、实现代码、数据库迁移、API规范、测试策略和实施计划。*
