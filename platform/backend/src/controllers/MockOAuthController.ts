import { Controller, Get, QueryParam } from 'routing-controllers';
import { Service } from 'typedi';

/**
 * Mock OAuth Controller
 *
 * 开发环境使用的模拟 OAuth 控制器
 * 提供测试用的授权 URL
 */
@Service()
@Controller('/oauth')
export class MockOAuthController {
  /**
   * 获取模拟授权 URL
   * GET /api/oauth/authorize
   */
  @Get('/authorize')
  async getAuthorizationUrl(@QueryParam('redirect_uri') redirectUri?: string) {
    // 使用 Mock 飞书服务器的 URL
    const mockUrl = 'http://localhost:3001/authen/v1/authorize';

    const params = new URLSearchParams({
      app_id: 'mock_app_id',
      redirect_uri: redirectUri || process.env.FEISHU_REDIRECT_URI || 'http://localhost:5173/oauth/callback',
      state: this.generateState(),
    });

    const url = `${mockUrl}?${params.toString()}`;

    return { url };
  }

  /**
   * 生成随机 state 参数
   */
  private generateState(): string {
    return Math.random().toString(36).substring(2, 15) +
           Math.random().toString(36).substring(2, 15);
  }
}
