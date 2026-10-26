import { ApiError } from '../utils/ApiError.js';

/**
 * Role-Based Access Control (RBAC) middleware
 *
 * @param {...string} allowedRoles Roles permitted to access the route
 */
export function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(
        ApiError.unauthorized('Authentication required before role verification', 'UNAUTHORIZED')
      );
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        ApiError.forbidden(
          `Access forbidden: Requires ${allowedRoles.join(' or ')} permission`,
          'FORBIDDEN'
        )
      );
    }

    return next();
  };
}
