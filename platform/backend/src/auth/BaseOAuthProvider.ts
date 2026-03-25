/**
 * Base OAuth Provider Abstract Class
 *
 * Provides common functionality for OAuth providers including:
 * - Enhanced redirect URI validation
 * - Protocol validation (http/https only)
 * - Production HTTPS enforcement
 * - Domain whitelist validation with subdomain support
 *
 * Security Features:
 * - Prevents open redirect vulnerabilities
 * - Enforces HTTPS in production
 * - Validates domain whitelist
 * - Supports subdomain wildcards (*.example.com)
 */
export abstract class BaseOAuthProvider {
  /**
   * Get allowed domains from environment variable
   * Format: comma-separated list, e.g., "example.com,localhost,127.0.0.1"
   * Supports wildcards: *.example.com
   *
   * Default includes localhost for development
   */
  protected getAllowedDomains(): string[] {
    const domainsFromEnv = process.env.OAUTH_ALLOWED_DOMAINS;

    if (!domainsFromEnv) {
      // Default: localhost for development
      const defaultDomains = ['localhost', '127.0.0.1'];

      // Log warning about using default whitelist
      console.warn('[OAuth Security] OAUTH_ALLOWED_DOMAINS not configured, using default whitelist', {
        defaultDomains
      });

      return defaultDomains;
    }

    return domainsFromEnv.split(',').map(domain => domain.trim()).filter(Boolean);
  }

  /**
   * Enhanced redirect URI validation with comprehensive security checks
   *
   * Validates:
   * 1. Protocol is http or https
   * 2. Production environment forces HTTPS
   * 3. Domain is in whitelist
   * 4. Supports subdomain wildcards (*.example.com)
   *
   * @param uri The redirect URI to validate
   * @returns true if valid, false otherwise
   */
  protected isValidRedirectUri(uri: string): boolean {
    try {
      // Parse URL
      const url = new URL(uri);

      // 1. Protocol validation: only http or https allowed
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        console.warn('[OAuth Security] Redirect URI protocol rejected', {
          protocol: url.protocol,
          uri: this.sanitizeUri(uri)
        });
        return false;
      }

      // 2. Production environment: force HTTPS (unless explicitly allowed for testing)
      const allowHttp = process.env.OAUTH_ALLOW_HTTP === 'true';
      if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:' && !allowHttp) {
        console.warn('[OAuth Security] HTTP redirect URI rejected in production (HTTPS required)', {
          protocol: url.protocol,
          uri: this.sanitizeUri(uri),
          hint: 'Set OAUTH_ALLOW_HTTP=true to allow HTTP for testing'
        });
        return false;
      }

      // Log if HTTP is allowed in production (for security audit)
      if (process.env.NODE_ENV === 'production' && url.protocol === 'http:' && allowHttp) {
        console.warn('[OAuth Security] HTTP redirect URI allowed in production (OAUTH_ALLOW_HTTP=true)', {
          protocol: url.protocol,
          uri: this.sanitizeUri(uri)
        });
      }

      // 3. Domain whitelist validation
      const allowedDomains = this.getAllowedDomains();
      const domain = url.hostname;

      if (!this.isDomainAllowed(domain, allowedDomains)) {
        console.warn('[OAuth Security] Redirect URI domain not in whitelist', {
          domain,
          allowedDomains,
          uri: this.sanitizeUri(uri)
        });
        return false;
      }

      // All validations passed
      return true;
    } catch (error) {
      // Invalid URL format
      console.warn('[OAuth Security] Redirect URI has invalid format', {
        uri: this.sanitizeUri(uri),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Check if domain is allowed based on whitelist
   * Supports wildcard subdomains (*.example.com)
   *
   * @param domain The domain to check
   * @param allowedDomains List of allowed domains
   * @returns true if domain is allowed
   */
  private isDomainAllowed(domain: string, allowedDomains: string[]): boolean {
    // Direct match
    if (allowedDomains.includes(domain)) {
      return true;
    }

    // Wildcard subdomain match
    for (const allowedDomain of allowedDomains) {
      if (allowedDomain.startsWith('*.')) {
        // Extract base domain from wildcard (*.example.com -> example.com)
        const baseDomain = allowedDomain.substring(2);

        // Check if domain ends with base domain or matches exactly
        if (domain === baseDomain || domain.endsWith(`.${baseDomain}`)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Sanitize URI for logging (remove sensitive query parameters)
   *
   * @param uri The URI to sanitize
   * @returns Sanitized URI safe for logging
   */
  private sanitizeUri(uri: string): string {
    try {
      const url = new URL(uri);
      // Remove query parameters that might contain sensitive data
      url.search = '';
      return url.toString();
    } catch {
      // If parsing fails, return only protocol and host part if possible
      const match = uri.match(/^(https?:\/\/[^/]+)/);
      return match ? match[1] : '[invalid uri]';
    }
  }

  /**
   * Abstract methods that must be implemented by concrete providers
   */
  abstract getPlatform(): string;
  abstract validateConfig(): void;
  abstract exchangeCodeForUserInfo(code: string): Promise<any>;
  abstract getAuthorizationUrl(redirectUri: string, state: string): Promise<string>;
}
