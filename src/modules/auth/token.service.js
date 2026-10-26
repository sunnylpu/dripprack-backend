import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';

export const REFRESH_COOKIE_NAME = 'refreshToken';

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
 */
export function getRefreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'strict' : 'lax',
    path: '/api/v1/auth',
    maxAge: env.JWT_REFRESH_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000
  };
}

/**
 * Cookie configuration for clearing the refresh token cookie on logout
 */
export function getClearRefreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'strict' : 'lax',
    path: '/api/v1/auth'
  };
}
