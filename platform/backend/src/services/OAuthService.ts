import { Service } from 'typedi';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import { UserRepository } from '../repositories/UserRepository';
import { InstanceRepository } from '../repositories/InstanceRepository';
import { User } from '../entities/User.entity';
import { logger } from '../config/logger';
import type { StringValue } from 'ms';
import {
  FeishuAuthUrlOptions,
  FeishuTokenResponse,
  FeishuUserInfo,
  JwtPayload,
  OAuthTokenResponse
} from '../types/oauth.types';

/**
 * OAuth 2.0 服务
 * 处理飞书授权流程、Token 管理和用户认证
 */
@Service()
export class OAuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly instanceRepository: InstanceRepository
  ) {}

  /**
   * 验证必需的环境变量
   * @param vars 需要验证的环境变量列表
   * @throws {Error} 如果缺少必需的环境变量
   */
  private validateConfig(vars: string[] = []): void {
    const defaultRequiredVars = [
      'FEISHU_APP_ID',
      'FEISHU_REDIRECT_URI',
      'FEISHU_OAUTH_AUTHORIZE_URL'
    ];

    const requiredVars = vars.length > 0 ? vars : defaultRequiredVars;
    const missingVars = requiredVars.filter(varName => !process.env[varName]);

    if (missingVars.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missingVars.join(', ')}. ` +
        `Please check your .env configuration.`
      );
    }
  }

  /**
   * 生成飞书授权 URL
   * @param options 授权 URL 选项
   * @returns 飞书授权 URL
   * @throws {Error} 如果缺少必需的配置
   */
  getAuthorizationUrl(options: FeishuAuthUrlOptions = {}): string {
    // 验证配置
    this.validateConfig();

    const {
      state = this.generateState(),
      redirect_uri = process.env.FEISHU_REDIRECT_URI,
      scope = 'contact:user.base:readonly'
    } = options;

    // 构建查询参数
    const params = new URLSearchParams({
      app_id: process.env.FEISHU_APP_ID!,
      redirect_uri: redirect_uri!,
      scope: scope,
      state: state
    });

    const authorizeUrl = process.env.FEISHU_OAUTH_AUTHORIZE_URL!;
    const url = `${authorizeUrl}?${params}`;

    // 验证生成的 URL 不包含 "undefined"
    if (url.includes('undefined')) {
      logger.error('Generated OAuth URL contains "undefined"', { url });
      throw new Error(
        'Failed to generate valid OAuth URL: URL contains undefined values. ' +
        'Please check your environment configuration.'
      );
    }

    logger.info('Generated Feishu authorization URL', { state });
    return url;
  }

  /**
   * 处理 OAuth 回调并交换授权码获取 Token
   * @param authCode 授权码
   * @returns OAuth Token 响应
   */
  async handleCallback(authCode: string): Promise<OAuthTokenResponse> {
    try {
      // 验证配置
      this.validateConfig([
        'FEISHU_APP_ID',
        'FEISHU_APP_SECRET',
        'JWT_SECRET'
      ]);

      // 1. 使用授权码换取访问令牌（飞书 /authen/v1/access_token 已直接返回用户信息）
      const tokenResponse = await this.exchangeCodeForToken(authCode);

      // 2. 从 token 响应中提取用户信息
      if (!tokenResponse.data) {
        throw new Error('Token response does not contain user information');
      }

      const feishuUserData = tokenResponse.data;
      const userInfo: FeishuUserInfo = {
        user_id: feishuUserData.open_id,
        name: feishuUserData.name,
        en_name: feishuUserData.en_name,
        email: feishuUserData.email,
        avatar_url: feishuUserData.avatar_url,
        union_id: feishuUserData.union_id,
        open_id: feishuUserData.open_id
      };

      logger.info('User info extracted from token response', {
        open_id: userInfo.open_id,
        union_id: userInfo.union_id,
        name: userInfo.name
      });

      // 3. 在数据库中查找或创建用户
      // ======================================================================
      // TEMPORARY HACK: 特殊处理数据丢失恢复的临时用户 (2026-03-18)
      // TODO: 完成所有用户重新登录后，移除此特殊处理代码
      // ======================================================================
      let user = await this.userRepository.findByFeishuUserId(userInfo.open_id);

      // 如果通过 open_id 找不到用户，检查是否是数据丢失恢复的临时用户
      if (!user) {
        user = await this.handleRecoveredUser(userInfo);
      }

      // 如果仍然找不到用户，创建新用户
      if (!user) {
        const newUser = await this.userRepository.create({
          feishu_user_id: userInfo.open_id,
          feishu_union_id: userInfo.union_id,
          name: userInfo.name,
          email: userInfo.email || undefined,
          avatar_url: userInfo.avatar_url
        });
        user = newUser;
        logger.info('New user created', { userId: user.id, name: user.name });
      } else {
        // 更新现有用户数据
        const updateData: Partial<User> = {
          name: userInfo.name,
          email: userInfo.email || undefined,
          avatar_url: userInfo.avatar_url
        };

        if (userInfo.union_id !== undefined) {
          updateData.feishu_union_id = userInfo.union_id;
        }

        await this.userRepository.update(user.id, updateData);
        const updatedUser = await this.userRepository.findById(user.id);
        if (updatedUser) {
          user = updatedUser;
        }
        logger.info('Existing user updated', { userId: user.id, name: user.name });
      }
      // ======================================================================
      // END TEMPORARY HACK
      // ======================================================================

      // 4. 更新最后登录时间
      await this.userRepository.updateLastLogin(user.id);

      // 5. 自动认领未认领的实例（TASK-001）
      const claimedInstance = await this.autoClaimInstanceIfAvailable(user.id);

      // 5. 生成 JWT Token
      const jwtPayload: JwtPayload = {
        userId: user.id,
        feishuUserId: user.feishu_user_id,
        feishuUnionId: user.feishu_union_id || undefined,
        name: user.name,
        email: user.email || undefined
      };

      const accessToken = this.generateJWTToken(jwtPayload);
      const refreshToken = this.generateRefreshToken(jwtPayload);

      logger.info('OAuth callback successful', { userId: user.id });

      return {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: parseInt(process.env.JWT_EXPIRES_IN || '604800'), // 7 天
        token_type: 'Bearer',
        user: {
          id: user.id,
          feishu_user_id: user.feishu_user_id,
          name: user.name,
          email: user.email
        },
        // TASK-001: Auto-claim response fields
        has_instance: !!claimedInstance,
        instance_id: claimedInstance?.instance_id || null,
        redirect_to: claimedInstance ? '/chat' : '/no-instance'
      };
    } catch (error) {
      logger.error('OAuth callback failed', error);
      throw new Error('OAuth callback failed');
    }
  }

  /**
   * 刷新 JWT Token
   * @param refreshToken 刷新令牌
   * @returns 新的访问令牌
   */
  async refreshToken(refreshToken: string): Promise<{ access_token: string }> {
    try {
      // 验证配置
      this.validateConfig(['JWT_SECRET']);

      const payload = jwt.verify(
        refreshToken,
        process.env.JWT_SECRET!
      ) as JwtPayload;

      // 生成新的访问令牌
      const newAccessToken = this.generateJWTToken({
        userId: payload.userId,
        feishuUserId: payload.feishuUserId,
        feishuUnionId: payload.feishuUnionId,
        name: payload.name,
        email: payload.email
      });

      logger.info('Token refresh successful', { userId: payload.userId });

      return { access_token: newAccessToken };
    } catch (error) {
      logger.error('Token refresh failed', error);
      throw new Error('Invalid refresh token');
    }
  }

  /**
   * 验证 JWT Token
   * @param token JWT Token
   * @returns Token 载荷
   */
  verifyToken(token: string): JwtPayload {
    try {
      // 验证配置
      this.validateConfig(['JWT_SECRET']);

      const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
      return payload;
    } catch (error) {
      logger.error('Token verification failed', error);
      throw new Error('Invalid token');
    }
  }

  /**
   * 使用授权码换取访问令牌（私有方法）
   * @param authCode 授权码
   * @returns 飞书 Token 响应
   */
  private async exchangeCodeForToken(authCode: string): Promise<FeishuTokenResponse> {
    try {
      const appId = process.env.FEISHU_APP_ID;
      const appSecret = process.env.FEISHU_APP_SECRET;

      // 验证必需的环境变量
      if (!appId || !appSecret) {
        throw new Error(
          'Missing required configuration for token exchange. ' +
          'Please check FEISHU_APP_ID and FEISHU_APP_SECRET.'
        );
      }

      logger.info('Exchanging code for token', {
        appId,
        codeLength: authCode?.length
      });

      // 使用飞书标准 OAuth 2.0 端点
      const tokenUrl = 'https://open.feishu.cn/open-apis/authen/v1/access_token';

      const response = await axios.post<FeishuTokenResponse>(
        tokenUrl,
        {
          grant_type: 'authorization_code',
          app_id: appId,
          app_secret: appSecret,
          code: authCode
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      // 详细记录飞书 API 响应
      logger.info('Feishu token API response', {
        status: response.status,
        statusText: response.statusText,
        rawData: JSON.stringify(response.data),
        dataType: typeof response.data,
        dataKeys: Object.keys(response.data),
        hasCode: 'code' in response.data,
        codeValue: (response.data as any).code,
        hasMsg: 'msg' in response.data,
        msgValue: (response.data as any).msg,
        hasAccessToken: 'access_token' in response.data,
        hasData: 'data' in response.data
      });

      if (response.data.code !== 0) {
        throw new Error(`Feishu API error: ${response.data.msg}`);
      }

      return response.data;
    } catch (error) {
      logger.error('Failed to exchange code for token', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new Error('Failed to exchange authorization code');
    }
  }

  /**
   * 从飞书获取用户信息（私有方法）
   * @param accessToken 访问令牌
   * @returns 飞书用户信息
   */
  private async getUserInfo(accessToken: string): Promise<FeishuUserInfo> {
    try {
      const userInfoUrl = process.env.FEISHU_OAUTH_USERINFO_URL;

      if (!userInfoUrl) {
        throw new Error(
          'Missing required configuration for user info. ' +
          'Please check FEISHU_OAUTH_USERINFO_URL.'
        );
      }

      const response = await axios.get<{ code: number; data: FeishuUserInfo }>(
        userInfoUrl,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      if (response.data.code !== 0) {
        throw new Error(`Feishu API error: ${response.data.code}`);
      }

      return response.data.data;
    } catch (error) {
      logger.error('Failed to get user info', error);
      throw new Error('Failed to fetch user information');
    }
  }

  /**
   * 生成 JWT 访问令牌（私有方法）
   * @param payload Token 载荷
   * @returns JWT Token
   */
  private generateJWTToken(payload: JwtPayload): string {
    const tokenExpiresIn = process.env.JWT_EXPIRES_IN || '7d';
    return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: tokenExpiresIn as StringValue | number });
  }

  /**
   * 生成 JWT 刷新令牌（私有方法）
   * @param payload Token 载荷
   * @returns JWT Token
   */
  private generateRefreshToken(payload: JwtPayload): string {
    const refreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '30d';
    return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: refreshExpiresIn as StringValue | number });
  }

  /**
   * 生成随机状态参数（私有方法）
   * @returns 随机字符串
   */
  private generateState(): string {
    return Math.random().toString(36).substring(2, 15) +
           Math.random().toString(36).substring(2, 15);
  }

  /**
   * 自动为用户认领可用实例（TASK-001）
   * @param userId 用户 ID
   * @returns 认领的实例，如果没有可用实例则返回 null
   */
  private async autoClaimInstanceIfAvailable(userId: number): Promise<{ instance_id: string } | null> {
    try {
      const unclaimedInstance = await this.instanceRepository.findUnclaimed();

      if (unclaimedInstance) {
        await this.instanceRepository.claimInstance(
          unclaimedInstance.instance_id,
          userId
        );

        logger.info('Auto-claimed instance for user', {
          userId: userId,
          instanceId: unclaimedInstance.instance_id
        });

        return { instance_id: unclaimedInstance.instance_id };
      }

      return null;
    } catch (error) {
      // 如果自动认领失败，记录错误但不中断登录流程
      logger.error('Failed to auto-claim instance for user', {
        userId: userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * ======================================================================
   * TEMPORARY HACK: 处理数据丢失恢复的临时用户 (2026-03-18)
   * TODO: 完成所有用户重新登录后（预计1-2周），移除此方法和相关调用
   * ======================================================================
   *
   * 当用户通过飞书登录时，检查是否是数据丢失恢复的4个特殊用户之一：
   * - 向总 (ID: 3)
   * - 李芬 (ID: 4)
   * - 蔡总 (ID: 5)
   * - 张志云 (ID: 6)
   *
   * 如果是，更新临时用户的 Feishu ID 为真实值，用户无感知自动关联原有账户和数据
   *
   * @param userInfo 从飞书获取的用户信息
   * @returns 匹配的临时用户，如果不匹配则返回 null
   */
  private async handleRecoveredUser(userInfo: FeishuUserInfo): Promise<User | null> {
    try {
      // 数据丢失恢复的特殊用户映射（基于用户名称模糊匹配）
      const recoveredUsersMap: { [key: string]: number } = {
        '向总': 3,
        '李芬': 4,
        '蔡总': 5,
        '张志云': 6
      };

      // 检查用户名称是否匹配
      let matchedUserId: number | null = null;

      // 精确匹配
      if (recoveredUsersMap[userInfo.name]) {
        matchedUserId = recoveredUsersMap[userInfo.name];
      } else {
        // 模糊匹配（处理"向总 (待恢复)"这样的情况）
        for (const [namePattern, userId] of Object.entries(recoveredUsersMap)) {
          if (userInfo.name.includes(namePattern) || namePattern.includes(userInfo.name)) {
            matchedUserId = userId;
            break;
          }
        }
      }

      // 如果找到匹配的用户
      if (matchedUserId !== null) {
        const tempUser = await this.userRepository.findById(matchedUserId);

        if (tempUser) {
          // 检查是否是临时用户（feishu_user_id 以 pending_recover_ 开头）
          if (tempUser.feishu_user_id && tempUser.feishu_user_id.startsWith('pending_recover_')) {
            logger.info('Found recovered user, updating with real Feishu credentials', {
              userId: tempUser.id,
              userName: tempUser.name,
              oldFeishuId: tempUser.feishu_user_id,
              newFeishuId: userInfo.open_id
            });

            // 更新用户的真实 Feishu ID
            await this.userRepository.update(tempUser.id, {
              feishu_user_id: userInfo.open_id,
              feishu_union_id: userInfo.union_id || undefined,
              name: userInfo.name,
              email: userInfo.email || undefined,
              avatar_url: userInfo.avatar_url
            });

            // 重新获取更新后的用户
            const updatedUser = await this.userRepository.findById(tempUser.id);

            logger.info('Successfully merged recovered user account', {
              userId: updatedUser?.id,
              feishuUserId: updatedUser?.feishu_user_id
            });

            return updatedUser || null;
          }
        }
      }

      // 没有找到匹配的临时用户，返回 null 让调用者创建新用户
      return null;
    } catch (error) {
      // 如果处理失败，记录错误但不中断登录流程
      logger.error('Failed to handle recovered user', {
        userName: userInfo.name,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }
  /**
   * ======================================================================
   * END TEMPORARY HACK
   * ======================================================================
   */
}
