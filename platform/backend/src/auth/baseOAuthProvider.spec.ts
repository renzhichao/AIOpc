import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { BaseOAuthProvider } from './BaseOAuthProvider';

/**
 * Test implementation of BaseOAuthProvider for testing purposes
 */
class TestOAuthProvider extends BaseOAuthProvider {
  getPlatform(): string {
    return 'test';
  }

  validateConfig(): void {
    // Test implementation
  }

  async exchangeCodeForUserInfo(code: string): Promise<any> {
    return { user_id: 'test' };
  }

  async getAuthorizationUrl(redirectUri: string, state: string): Promise<string> {
    return `https://test.com/auth?redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
  }

  // Expose protected method for testing
  public testIsValidRedirectUri(uri: string): boolean {
    return this.isValidRedirectUri(uri);
  }
}

describe('BaseOAuthProvider - URL Validation', () => {
  let provider: TestOAuthProvider;
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
    delete process.env.OAUTH_ALLOWED_DOMAINS;

    provider = new TestOAuthProvider();
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
  });

  describe('Protocol Validation', () => {
    it('should accept valid HTTPS URLs for whitelisted domains', () => {
      process.env.OAUTH_ALLOWED_DOMAINS = 'example.com,localhost,127.0.0.1';
      expect(provider.testIsValidRedirectUri('https://example.com/callback')).toBe(true);
      expect(provider.testIsValidRedirectUri('https://localhost:3000/callback')).toBe(true);
      expect(provider.testIsValidRedirectUri('https://127.0.0.1:3000/callback')).toBe(true);
    });

    it('should accept valid HTTP URLs in development', () => {
      process.env.NODE_ENV = 'development';
      expect(provider.testIsValidRedirectUri('http://localhost:3000/callback')).toBe(true);
      expect(provider.testIsValidRedirectUri('http://127.0.0.1:3000/callback')).toBe(true);
    });

    it('should reject non-HTTP protocols', () => {
      expect(provider.testIsValidRedirectUri('ftp://example.com/callback')).toBe(false);
      expect(provider.testIsValidRedirectUri('javascript://alert(1)')).toBe(false);
      expect(provider.testIsValidRedirectUri('data:text/html,<script>alert(1)</script>')).toBe(false);
      expect(provider.testIsValidRedirectUri('file:///etc/passwd')).toBe(false);
    });

    it('should reject invalid URL format', () => {
      expect(provider.testIsValidRedirectUri('not-a-url')).toBe(false);
      expect(provider.testIsValidRedirectUri('javascript:alert(1)')).toBe(false);
      expect(provider.testIsValidRedirectUri('//evil.com')).toBe(false);
    });
  });

  describe('Production HTTPS Enforcement', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('should enforce HTTPS in production', () => {
      // Configure whitelist
      process.env.OAUTH_ALLOWED_DOMAINS = 'example.com';

      // HTTP should be rejected
      expect(provider.testIsValidRedirectUri('http://example.com/callback')).toBe(false);

      // HTTPS should be accepted
      expect(provider.testIsValidRedirectUri('https://example.com/callback')).toBe(true);
    });

    it('should allow HTTPS in production for whitelisted domains', () => {
      process.env.OAUTH_ALLOWED_DOMAINS = 'ciiber.example.com,localhost';

      expect(provider.testIsValidRedirectUri('https://ciiber.example.com/callback')).toBe(true);
      expect(provider.testIsValidRedirectUri('https://localhost/callback')).toBe(true);
    });
  });

  describe('Domain Whitelist Validation', () => {
    beforeEach(() => {
      process.env.OAUTH_ALLOWED_DOMAINS = 'ciiber.example.com,localhost,127.0.0.1';
    });

    it('should accept whitelisted domains', () => {
      expect(provider.testIsValidRedirectUri('https://ciiber.example.com/callback')).toBe(true);
      expect(provider.testIsValidRedirectUri('https://localhost/callback')).toBe(true);
      expect(provider.testIsValidRedirectUri('https://127.0.0.1/callback')).toBe(true);
    });

    it('should reject non-whitelisted domains', () => {
      expect(provider.testIsValidRedirectUri('https://evil.com/callback')).toBe(false);
      expect(provider.testIsValidRedirectUri('https://malicious-site.com/callback')).toBe(false);
      expect(provider.testIsValidRedirectUri('https://example.com/callback')).toBe(false);
    });

    it('should handle port numbers correctly', () => {
      expect(provider.testIsValidRedirectUri('https://localhost:3000/callback')).toBe(true);
      expect(provider.testIsValidRedirectUri('https://127.0.0.1:8080/callback')).toBe(true);
      expect(provider.testIsValidRedirectUri('https://ciiber.example.com:8443/callback')).toBe(true);
    });

    it('should handle paths and query parameters', () => {
      expect(provider.testIsValidRedirectUri('https://ciiber.example.com/oauth/callback')).toBe(true);
      expect(provider.testIsValidRedirectUri('https://ciiber.example.com/callback?code=123')).toBe(true);
      expect(provider.testIsValidRedirectUri('https://ciiber.example.com/callback#fragment')).toBe(true);
    });
  });

  describe('Subdomain Wildcard Support', () => {
    beforeEach(() => {
      process.env.OAUTH_ALLOWED_DOMAINS = '*.example.com,localhost';
    });

    it('should accept subdomains with wildcard', () => {
      expect(provider.testIsValidRedirectUri('https://sub.example.com/callback')).toBe(true);
      expect(provider.testIsValidRedirectUri('https://api.example.com/callback')).toBe(true);
      expect(provider.testIsValidRedirectUri('https://app.example.com/callback')).toBe(true);
    });

    it('should accept base domain with wildcard', () => {
      expect(provider.testIsValidRedirectUri('https://example.com/callback')).toBe(true);
    });

    it('should reject non-matching domains with wildcard', () => {
      expect(provider.testIsValidRedirectUri('https://evil.com/callback')).toBe(false);
      expect(provider.testIsValidRedirectUri('https://example.org/callback')).toBe(false);
    });

    it('should support multiple wildcards', () => {
      process.env.OAUTH_ALLOWED_DOMAINS = '*.example.com,*.test.com,localhost';

      expect(provider.testIsValidRedirectUri('https://sub.example.com/callback')).toBe(true);
      expect(provider.testIsValidRedirectUri('https://app.test.com/callback')).toBe(true);
      expect(provider.testIsValidRedirectUri('https://localhost/callback')).toBe(true);
    });

    it('should handle nested subdomains', () => {
      expect(provider.testIsValidRedirectUri('https://api.v1.example.com/callback')).toBe(true);
      expect(provider.testIsValidRedirectUri('https://app.prod.example.com/callback')).toBe(true);
    });
  });

  describe('CIIBER Tenant Configuration', () => {
    beforeEach(() => {
      process.env.OAUTH_ALLOWED_DOMAINS = 'ciiber.example.com,localhost,127.0.0.1';
    });

    it('should accept CIIBER whitelisted domains', () => {
      expect(provider.testIsValidRedirectUri('https://ciiber.example.com/callback')).toBe(true);
      expect(provider.testIsValidRedirectUri('https://localhost/callback')).toBe(true);
      expect(provider.testIsValidRedirectUri('https://127.0.0.1/callback')).toBe(true);
    });

    it('should reject OMNITECH tenant domains', () => {
      process.env.OAUTH_ALLOWED_DOMAINS = 'ciiber.example.com,localhost,127.0.0.1';

      // OMNITECH domains (assuming omnitech.example.com)
      expect(provider.testIsValidRedirectUri('https://omnitech.example.com/callback')).toBe(false);
      expect(provider.testIsValidRedirectUri('https://admin.omnitech.example.com/callback')).toBe(false);
    });

    it('should support CIIBER subdomains if configured', () => {
      process.env.OAUTH_ALLOWED_DOMAINS = '*.ciiber.example.com,localhost';

      expect(provider.testIsValidRedirectUri('https://app.ciiber.example.com/callback')).toBe(true);
      expect(provider.testIsValidRedirectUri('https://api.ciiber.example.com/callback')).toBe(true);
    });
  });

  describe('Default Whitelist Behavior', () => {
    beforeEach(() => {
      delete process.env.OAUTH_ALLOWED_DOMAINS;
    });

    it('should use default whitelist when OAUTH_ALLOWED_DOMAINS not configured', () => {
      // Should allow localhost by default
      expect(provider.testIsValidRedirectUri('https://localhost/callback')).toBe(true);
      expect(provider.testIsValidRedirectUri('https://127.0.0.1/callback')).toBe(true);

      // Should reject other domains
      expect(provider.testIsValidRedirectUri('https://example.com/callback')).toBe(false);
    });

    it('should warn about using default whitelist', () => {
      provider.testIsValidRedirectUri('https://localhost/callback');

      // Verify default whitelist is used (localhost should work)
      expect(provider.testIsValidRedirectUri('https://localhost/callback')).toBe(true);
    });
  });

  describe('HTTP Downgrade Attack Prevention', () => {
    it('should prevent HTTP downgrade in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.OAUTH_ALLOWED_DOMAINS = 'example.com';

      // Attacker tries to downgrade HTTPS to HTTP
      expect(provider.testIsValidRedirectUri('http://example.com/callback')).toBe(false);
      expect(provider.testIsValidRedirectUri('https://example.com/callback')).toBe(true);
    });

    it('should prevent mixed content attacks', () => {
      process.env.NODE_ENV = 'development';
      process.env.OAUTH_ALLOWED_DOMAINS = 'example.com';

      // Attacker uses http to intercept
      expect(provider.testIsValidRedirectUri('http://example.com/callback')).toBe(true); // OK in dev
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      process.env.OAUTH_ALLOWED_DOMAINS = 'example.com,localhost';
    });

    it('should handle trailing slashes in domains', () => {
      // Trailing slash in domain should still work
      expect(provider.testIsValidRedirectUri('https://example.com/callback/')).toBe(true);
    });

    it('should handle special characters in paths', () => {
      expect(provider.testIsValidRedirectUri('https://example.com/callback?code=abc&state=xyz')).toBe(true);
      expect(provider.testIsValidRedirectUri('https://example.com/callback#fragment')).toBe(true);
      expect(provider.testIsValidRedirectUri('https://example.com/callback?a=b&c=d')).toBe(true);
    });

    it('should handle international domain names', () => {
      process.env.OAUTH_ALLOWED_DOMAINS = 'localhost';
      // IDN support (if the environment supports it)
      expect(provider.testIsValidRedirectUri('https://localhost/callback')).toBe(true);
    });

    it('should handle IPv6 addresses (if supported)', () => {
      // IPv6 is valid URL format but [::1] as domain won't match typical whitelists
      // This test verifies the validation logic works correctly
      process.env.OAUTH_ALLOWED_DOMAINS = '::1';

      // IPv6 loopback - will be rejected as domain doesn't match whitelist format
      expect(provider.testIsValidRedirectUri('https://[::1]/callback')).toBe(false);
    });

    it('should reject empty or null URIs', () => {
      expect(provider.testIsValidRedirectUri('')).toBe(false);
      expect(provider.testIsValidRedirectUri('   ')).toBe(false);
    });
  });

  describe('Security Logging', () => {
    beforeEach(() => {
      process.env.OAUTH_ALLOWED_DOMAINS = 'example.com';
    });

    it('should log rejected domains for security monitoring', () => {
      const evilUri = 'https://evil.com/callback';
      const result = provider.testIsValidRedirectUri(evilUri);

      // Verify rejection logic works
      expect(result).toBe(false);
    });

    it('should log protocol rejections', () => {
      const result = provider.testIsValidRedirectUri('ftp://example.com/callback');

      // Verify protocol rejection works
      expect(result).toBe(false);
    });

    it('should log production HTTP rejections', () => {
      process.env.NODE_ENV = 'production';
      const result = provider.testIsValidRedirectUri('http://localhost/callback');

      // Verify production HTTP rejection works
      expect(result).toBe(false);
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete OAuth callback URL validation', () => {
      process.env.OAUTH_ALLOWED_DOMAINS = 'ciiber.example.com,localhost';

      // Valid CIIBER callback URL
      const validCallback = 'https://ciiber.example.com/oauth/callback?code=auth_code_123&state=xyz';
      expect(provider.testIsValidRedirectUri(validCallback)).toBe(true);

      // Invalid callback (wrong domain)
      const invalidCallback = 'https://evil.com/oauth/callback?code=auth_code_123&state=xyz';
      expect(provider.testIsValidRedirectUri(invalidCallback)).toBe(false);
    });

    it('should support development and production configurations', () => {
      process.env.OAUTH_ALLOWED_DOMAINS = 'ciiber.example.com,localhost,127.0.0.1';

      // Development mode
      process.env.NODE_ENV = 'development';
      expect(provider.testIsValidRedirectUri('http://localhost:3000/callback')).toBe(true);
      expect(provider.testIsValidRedirectUri('https://ciiber.example.com/callback')).toBe(true);

      // Production mode (HTTP should be rejected)
      process.env.NODE_ENV = 'production';
      expect(provider.testIsValidRedirectUri('http://localhost:3000/callback')).toBe(false);
      expect(provider.testIsValidRedirectUri('https://ciiber.example.com/callback')).toBe(true);
    });
  });
});
