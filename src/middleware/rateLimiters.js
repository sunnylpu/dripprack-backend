import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Standard handler to format rate limit responses consistently with ApiError envelope
 */
function createRateLimitHandler(message) {
  return (req, res, next) => {
    next(ApiError.tooManyRequests(message));
  };
}

/**
 * Global rate limiter across all incoming endpoints
 */
export const globalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true, // Return standard `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  handler: createRateLimitHandler('Too many requests from this IP, please try again later.'),
  skip: () => env.NODE_ENV === 'test' // Skip global rate limiting during automated tests
});

/**
 * Strict limiter for sensitive authentication endpoints (login, register, password reset)
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.RATE_LIMIT_AUTH_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Too many authentication attempts. Please try again after 15 minutes.')
});

/**
 * Limiter for checkout and order placement to prevent inventory scalping
 */
export const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Checkout rate limit exceeded. Please wait before placing more orders.')
});
