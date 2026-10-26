import { ApiError } from '../utils/ApiError.js';

/**
 * Middleware factory for validating incoming requests using Zod schemas
 *
 * @param {Object} schemas
 * @param {import('zod').ZodSchema} [schemas.body]
 * @param {import('zod').ZodSchema} [schemas.query]
 * @param {import('zod').ZodSchema} [schemas.params]
 */
export function validateRequest(schemas) {
  return async (req, res, next) => {
    try {
      if (schemas.headers) {
        req.headers = await schemas.headers.parseAsync(req.headers);
      }
      if (schemas.params) {
        req.params = await schemas.params.parseAsync(req.params);
      }
      if (schemas.query) {
        req.query = await schemas.query.parseAsync(req.query);
      }
      if (schemas.body) {
        req.body = await schemas.body.parseAsync(req.body);
      }
      return next();
    } catch (error) {
      if (error && error.errors && Array.isArray(error.errors)) {
        const details = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message
        }));
        return next(new ApiError(422, 'Request validation failed', 'VALIDATION_ERROR', details));
      }
      return next(error);
    }
  };
}
