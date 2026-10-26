/**
 * Custom operational API Error class with standard error code and status
 */
export class ApiError extends Error {
  constructor(statusCode, message, errorCode = 'ERROR', details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    this.isOperational = true; // Distinguishes operational errors from programmer bugs

    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Bad Request', codeOrDetails = 'BAD_REQUEST', details = null) {
    const { code, det } = ApiError._resolveCodeAndDetails('BAD_REQUEST', codeOrDetails, details);
    return new ApiError(400, message, code, det);
  }

  static unauthorized(
    message = 'Authentication required or invalid credentials',
    codeOrDetails = 'UNAUTHORIZED',
    details = null
  ) {
    const { code, det } = ApiError._resolveCodeAndDetails('UNAUTHORIZED', codeOrDetails, details);
    return new ApiError(401, message, code, det);
  }

  static forbidden(
    message = 'Access denied: insufficient permissions',
    codeOrDetails = 'FORBIDDEN',
    details = null
  ) {
    const { code, det } = ApiError._resolveCodeAndDetails('FORBIDDEN', codeOrDetails, details);
    return new ApiError(403, message, code, det);
  }

  static notFound(message = 'Resource not found', codeOrDetails = 'NOT_FOUND', details = null) {
    const { code, det } = ApiError._resolveCodeAndDetails('NOT_FOUND', codeOrDetails, details);
    return new ApiError(404, message, code, det);
  }

  static conflict(message = 'Operation conflict', codeOrDetails = 'CONFLICT', details = null) {
    const { code, det } = ApiError._resolveCodeAndDetails('CONFLICT', codeOrDetails, details);
    return new ApiError(409, message, code, det);
  }

  static unprocessable(message = 'Validation failed', codeOrDetails = 'VALIDATION_ERROR', details = null) {
    const { code, det } = ApiError._resolveCodeAndDetails('VALIDATION_ERROR', codeOrDetails, details);
    return new ApiError(422, message, code, det);
  }

  static tooManyRequests(
    message = 'Too many requests, please try again later',
    codeOrDetails = 'RATE_LIMIT_EXCEEDED',
    details = null
  ) {
    const { code, det } = ApiError._resolveCodeAndDetails('RATE_LIMIT_EXCEEDED', codeOrDetails, details);
    return new ApiError(429, message, code, det);
  }

  static internal(
    message = 'An unexpected server error occurred',
    codeOrDetails = 'INTERNAL_SERVER_ERROR',
    details = null
  ) {
    const { code, det } = ApiError._resolveCodeAndDetails('INTERNAL_SERVER_ERROR', codeOrDetails, details);
    return new ApiError(500, message, code, det);
  }

  static _resolveCodeAndDetails(defaultCode, codeOrDetails, details) {
    if (typeof codeOrDetails === 'string') {
      return { code: codeOrDetails, det: details || null };
    }
    return { code: defaultCode, det: codeOrDetails || null };
  }
}
