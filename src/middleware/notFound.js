import { ApiError } from '../utils/ApiError.js';

/**
 * 404 Handler for undefined API routes
 */
export function notFoundHandler(req, res, next) {
  next(ApiError.notFound(`Cannot ${req.method} ${req.originalUrl}`));
}
