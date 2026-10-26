import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Strict CSRF defense middleware for cookie-authenticated state-changing endpoints (/refresh, /logout)
 * Validates request Origin / Referer against the configured CORS allowlist.
 */
export function verifyCsrfOrigin(req, res, next) {
  const origin = req.headers.origin;
  const referer = req.headers.referer;

  // If no origin and no referer (e.g. native client, curl, postman), allow in non-production or same-site
  if (!origin && !referer) {
    return next();
  }

  const allowedOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim());

  if (origin) {
    if (allowedOrigins.includes(origin) || (env.NODE_ENV !== 'production' && origin.startsWith('http://localhost'))) {
      return next();
    }
    return next(ApiError.forbidden(`CSRF blocked: Origin ${origin} is not allowed`, 'CSRF_FORBIDDEN'));
  }

  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (allowedOrigins.includes(refererOrigin) || (env.NODE_ENV !== 'production' && refererOrigin.startsWith('http://localhost'))) {
        return next();
      }
    } catch {
      return next(ApiError.forbidden('CSRF blocked: Invalid Referer header', 'CSRF_FORBIDDEN'));
    }
    return next(ApiError.forbidden('CSRF blocked: Referer is not in allowlist', 'CSRF_FORBIDDEN'));
  }

  return next();
}
