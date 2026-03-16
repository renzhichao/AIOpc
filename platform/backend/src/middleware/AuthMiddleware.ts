import { Request, Response, NextFunction } from 'express';
import { Container } from 'typedi';
import { OAuthService } from '../services/OAuthService';
import { JwtPayload } from '../types/oauth.types';

/**
 * Extended Request interface with user property
 */
export interface AuthRequest extends Request {
  user?: JwtPayload;
}

/**
 * Error response types for authentication failures
 */
enum AuthErrorType {
  MISSING_HEADER = 'Missing or invalid authorization header',
  INVALID_TOKEN = 'Invalid or expired token',
}

/**
 * Helper function to send unauthorized error response
 *
 * @param res - Express response object
 * @param message - Error message to send
 */
function sendUnauthorizedResponse(res: Response, message: AuthErrorType): void {
  res.status(401).json({
    error: 'Unauthorized',
    message,
  });
}

/**
 * Extract and validate Bearer token from authorization header
 *
 * @param authHeader - Authorization header value
 * @returns Extracted token or null if invalid
 */
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);

  if (!token || token.trim().length === 0) {
    return null;
  }

  return token;
}

/**
 * JWT Authentication Middleware
 *
 * Validates JWT Bearer tokens from Authorization header and injects
 * user information into the request object.
 *
 * Usage:
 *   @Get('/protected')
 *   @UseBefore(AuthMiddleware)
 *   protectedEndpoint() { ... }
 *
 * @param req - Express request with optional Authorization header
 * @param res - Express response
 * @param next - Express next function
 */
export function AuthMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization;
    const token = extractBearerToken(authHeader);

    if (!token) {
      sendUnauthorizedResponse(res, AuthErrorType.MISSING_HEADER);
      return;
    }

    const oauthService = Container.get(OAuthService);
    const payload: JwtPayload = oauthService.verifyToken(token);

    req.user = payload;
    next();

  } catch (error) {
    sendUnauthorizedResponse(res, AuthErrorType.INVALID_TOKEN);
  }
}

/**
 * Optional JWT Authentication Middleware
 *
 * Similar to AuthMiddleware but allows requests without tokens to pass through.
 * User info will only be injected if a valid token is provided.
 *
 * Usage:
 *   @Get('/optional-auth')
 *   @UseBefore(OptionalAuthMiddleware)
 *   optionalAuthEndpoint() { ... }
 */
export function OptionalAuthMiddleware(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization;
    const token = extractBearerToken(authHeader);

    if (!token) {
      next();
      return;
    }

    const oauthService = Container.get(OAuthService);
    const payload: JwtPayload = oauthService.verifyToken(token);
    req.user = payload;

    next();
  } catch (error) {
    // Invalid token, continue without user info
    next();
  }
}
