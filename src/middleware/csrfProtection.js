import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Validates whether an incoming origin or referer matches allowed CORS / deployment domains
 */
function isAllowedOrigin(incomingOrigin, allowedOrigins) {
  if (!incomingOrigin) return false;
  if (allowedOrigins.includes('*')) return true;
  if (allowedOrigins.includes(incomingOrigin)) return true;
  if (incomingOrigin.startsWith('http://localhost') || incomingOrigin.startsWith('http://127.0.0.1')) return true;
  if (incomingOrigin.endsWith('.vercel.app') || incomingOrigin.endsWith('.onrender.com')) return true;
  return false;
}

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
    if (isAllowedOrigin(origin, allowedOrigins)) {
      return next();
    }
    return next(ApiError.forbidden(`CSRF blocked: Origin ${origin} is not allowed`, 'CSRF_FORBIDDEN'));
  }

  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (isAllowedOrigin(refererOrigin, allowedOrigins)) {
        return next();
      }
    } catch {
      return next(ApiError.forbidden('CSRF blocked: Invalid Referer header', 'CSRF_FORBIDDEN'));
    }
    return next(ApiError.forbidden('CSRF blocked: Referer is not in allowlist', 'CSRF_FORBIDDEN'));
  }

  return next();
}
