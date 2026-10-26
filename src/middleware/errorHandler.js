import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

/**
 * Centralized application error handling middleware
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  let error = err;

  // Handle JSON parse errors from express.json()
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    error = ApiError.badRequest('Malformed JSON in request body');
  }

  // Handle Payload Too Large (e.g. body-parser limit exceeded)
  if (err.status === 413 || err.type === 'entity.too.large') {
    error = new ApiError(413, 'Request payload exceeds 100kb limit', 'PAYLOAD_TOO_LARGE');
  }

  // Handle Mongoose Bad ObjectId (CastError)
  if (err.name === 'CastError') {
    error = ApiError.badRequest(`Invalid format for parameter: ${err.path}`, [
      { field: err.path, message: `Invalid ID value: ${err.value}` }
    ]);
  }

  // Handle Mongoose Validation Error
  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors).map((item) => ({
      field: item.path,
      message: item.message
    }));
    error = new ApiError(422, 'Database validation failed', 'VALIDATION_ERROR', details);
  }

  // Handle MongoDB Duplicate Key (E11000)
  if (err.code === 11000) {
    const duplicateField = Object.keys(err.keyValue || {})[0] || 'field';
    error = ApiError.conflict(
      `A record with this ${duplicateField} already exists`,
      [{ field: duplicateField, message: `${duplicateField} must be unique` }]
    );
  }

  // If not already an operational ApiError, wrap as 500 Internal Error
  if (!(error instanceof ApiError)) {
    logger.error(
      {
        err,
        requestId: req.id,
        method: req.method,
        url: req.originalUrl,
        ip: req.ip
      },
      'Unhandled internal server exception'
    );

    error = ApiError.internal(
      env.NODE_ENV === 'production'
        ? 'An unexpected error occurred. Please contact support if the issue persists.'
        : err.message || 'Internal Server Error'
    );
  } else if (error.statusCode >= 500) {
    logger.error(
      {
        err: error,
        requestId: req.id,
        method: req.method,
        url: req.originalUrl
      },
      error.message
    );
  } else {
    // 4xx operational errors logged as debug/warn
    logger.debug(
      {
        statusCode: error.statusCode,
        code: error.errorCode,
        message: error.message,
        details: error.details,
        requestId: req.id
      },
      'Client request error'
    );
  }

  const responsePayload = {
    success: false,
    statusCode: error.statusCode,
    error: {
      code: error.errorCode,
      message: error.message,
      details: error.details
    }
  };

  // In development only, attach stack trace for debugging
  if (env.NODE_ENV === 'development' && error.statusCode === 500) {
    responsePayload.error.stack = err.stack;
  }

  return res.status(error.statusCode).json(responsePayload);
}
