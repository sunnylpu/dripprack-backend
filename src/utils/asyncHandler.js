/**
 * Wraps an async route handler or middleware and forwards any uncaught errors to next()
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
