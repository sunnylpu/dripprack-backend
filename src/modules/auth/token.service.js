import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';

export const ADMIN_REFRESH_COOKIE_NAME = 'adminRefreshToken';
export const CUSTOMER_REFRESH_COOKIE_NAME = 'customerRefreshToken';
export const REFRESH_COOKIE_NAME = 'refreshToken';

/**
 * Resolves the client application context from request headers or query parameters
 *
 * @param {Object} req Express request
 * @returns {'admin' | 'customer' | null}
 */
export function resolveClientType(req) {
  if (!req) return null;
  const clientHeader = req.headers?.['x-app-client'] || req.headers?.['x-client-type'];
  if (typeof clientHeader === 'string') {
    const normalized = clientHeader.trim().toLowerCase();
    if (normalized === 'admin') return 'admin';
    if (normalized === 'customer') return 'customer';
  }
  if (req.query?.client) {
    const q = String(req.query.client).trim().toLowerCase();
    if (q === 'admin') return 'admin';
    if (q === 'customer') return 'customer';
  }
  return null;
}

/**
 * Determines the appropriate refresh cookie name based on application context
 *
 * @param {Object} req Express request
 * @param {Object} [fallbackUser] User document if available
 * @returns {string} Cookie name
 */
export function getRefreshCookieName(req, fallbackUser = null) {
  const clientType = resolveClientType(req);
  if (clientType === 'admin') return ADMIN_REFRESH_COOKIE_NAME;
  if (clientType === 'customer') return CUSTOMER_REFRESH_COOKIE_NAME;

  if (fallbackUser?.role === 'admin') return ADMIN_REFRESH_COOKIE_NAME;
  if (fallbackUser?.role === 'customer') return CUSTOMER_REFRESH_COOKIE_NAME;

  if (req?.cookies) {
    if (req.cookies[ADMIN_REFRESH_COOKIE_NAME] && !req.cookies[CUSTOMER_REFRESH_COOKIE_NAME]) {
      return ADMIN_REFRESH_COOKIE_NAME;
    }
    if (req.cookies[CUSTOMER_REFRESH_COOKIE_NAME] && !req.cookies[ADMIN_REFRESH_COOKIE_NAME]) {
      return CUSTOMER_REFRESH_COOKIE_NAME;
    }
    if (req.cookies[REFRESH_COOKIE_NAME]) {
      return REFRESH_COOKIE_NAME;
    }
  }

  return CUSTOMER_REFRESH_COOKIE_NAME;
}

/**
 * SHA-256 hash a plain token string for database storage/comparison
 */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a cryptographically secure random token string
 */
export function generateRandomToken(bytes = 40) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Issue a short-lived access JWT
 *
 * @param {Object} user
 * @returns {string} Signed JWT
 */
export function generateAccessToken(user) {
  const payload = {
    sub: user._id.toString(),
    role: user.role,
    type: 'access'
  };

  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.JWT_ACCESS_EXPIRES_IN
  });
}

/**
 * Verify and decode an access JWT
 *
 * @param {string} token
 * @returns {Object} Decoded payload
 */
export function verifyAccessToken(token) {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256']
    });

    if (decoded.type !== 'access') {
      throw ApiError.unauthorized('Invalid token purpose: expected access token', 'INVALID_TOKEN_TYPE');
    }

    return decoded;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (error.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('Access token has expired', 'TOKEN_EXPIRED');
    }
    if (error.name === 'JsonWebTokenError') {
      throw ApiError.unauthorized('Invalid access token format or signature', 'TOKEN_INVALID');
    }
    throw ApiError.unauthorized('Authentication failed', 'UNAUTHORIZED');
  }
}

/**
 * Standard cookie configuration for HttpOnly refresh tokens
 * Supports same-site and cross-site production deployments
 */
export function getRefreshCookieOptions(customOptions = {}) {
  const sameSite = env.COOKIE_SAME_SITE || (env.NODE_ENV === 'production' ? 'strict' : 'lax');
  const secure = env.COOKIE_SECURE === 'true' || (env.NODE_ENV === 'production' || sameSite === 'none');

  return {
    httpOnly: true,
    secure,
    sameSite,
    path: '/api/v1/auth',
    maxAge: env.JWT_REFRESH_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
    ...customOptions
  };
}

/**
 * Cookie configuration for clearing the refresh token cookie on logout
 */
export function getClearRefreshCookieOptions(customOptions = {}) {
  const sameSite = env.COOKIE_SAME_SITE || (env.NODE_ENV === 'production' ? 'strict' : 'lax');
  const secure = env.COOKIE_SECURE === 'true' || (env.NODE_ENV === 'production' || sameSite === 'none');

  return {
    httpOnly: true,
    secure,
    sameSite,
    path: '/api/v1/auth',
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
    ...customOptions
  };
}
