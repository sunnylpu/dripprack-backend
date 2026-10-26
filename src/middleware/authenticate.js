import { verifyAccessToken } from '../modules/auth/token.service.js';
import { User } from '../modules/users/user.model.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Middleware to authenticate requests via Bearer JWT access token
 */
export const authenticate = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw ApiError.unauthorized(
      'Authentication required: Please provide a valid Bearer token in Authorization header',
      'UNAUTHORIZED'
    );
  }

  const token = authHeader.split(' ')[1]?.trim();
  if (!token) {
    throw ApiError.unauthorized('Authentication token cannot be empty', 'TOKEN_MISSING');
  }

  // Verify and decode JWT access token
  const decoded = verifyAccessToken(token);

  // Look up user in database to ensure user still exists and is active
  const user = await User.findById(decoded.sub);
  if (!user) {
    throw ApiError.unauthorized('User associated with this token no longer exists', 'USER_NOT_FOUND');
  }

  // Account status verification
  if (user.status === 'suspended') {
    throw new ApiError(403, 'Account is suspended. Access denied.', 'ACCOUNT_SUSPENDED');
  }
  if (user.status === 'deactivated') {
    throw new ApiError(403, 'Account is deactivated. Access denied.', 'ACCOUNT_DEACTIVATED');
  }
  if (user.status !== 'active') {
    throw new ApiError(403, 'Account is inactive. Access denied.', 'ACCOUNT_NOT_ACTIVE');
  }

  // Attach sanitized user to request context
  req.user = user.toJSON();
  req.userDoc = user; // Internal reference if needed

  next();
});
