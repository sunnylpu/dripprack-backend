import { authService } from './auth.service.js';
import {
  ADMIN_REFRESH_COOKIE_NAME,
  CUSTOMER_REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  resolveClientType,
  getRefreshCookieName,
  getRefreshCookieOptions,
  getClearRefreshCookieOptions
} from './token.service.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const authController = {
  /**
   * Register a new customer
   */
  register: asyncHandler(async (req, res) => {
    const user = await authService.register(req.body);
    return ApiResponse.created(res, {
      message: 'Account registered successfully. You may now log in.',
      data: { user }
    });
  }),

  /**
   * Login customer or administrator with isolated application session cookies
   */
  login: asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const deviceInfo = req.headers['user-agent'] || 'Unknown Device';
    const ipAddress = req.ip || req.socket.remoteAddress;

    const clientType = resolveClientType(req);

    const { accessToken, refreshToken, user } = await authService.login({
      email,
      password,
      deviceInfo,
      ipAddress
    });

    // Enforce role authorization if the client context explicitly identifies as admin
    if (clientType === 'admin' && user.role !== 'admin') {
      throw ApiError.forbidden(
        'Access denied: Administrator privileges required for admin portal',
        'FORBIDDEN_ROLE'
      );
    }

    const cookieName = getRefreshCookieName(req, user);

    // Set application-specific HttpOnly cookie
    res.cookie(cookieName, refreshToken, getRefreshCookieOptions());

    // If no clientType header was provided (legacy/direct calls), also set legacy cookie for backward compatibility
    if (!clientType) {
      res.cookie(REFRESH_COOKIE_NAME, refreshToken, getRefreshCookieOptions());
    }

    return ApiResponse.success(res, {
      message: 'Authentication successful',
      data: {
        accessToken,
        user
      }
    });
  }),

  /**
   * Rotate refresh token and issue new access token within application context
   */
  refresh: asyncHandler(async (req, res) => {
    const clientType = resolveClientType(req);
    let cookieName;
    let plainRefreshToken;

    if (clientType === 'admin') {
      cookieName = ADMIN_REFRESH_COOKIE_NAME;
      plainRefreshToken = req.cookies?.[ADMIN_REFRESH_COOKIE_NAME] || req.cookies?.[REFRESH_COOKIE_NAME];
    } else if (clientType === 'customer') {
      cookieName = CUSTOMER_REFRESH_COOKIE_NAME;
      plainRefreshToken = req.cookies?.[CUSTOMER_REFRESH_COOKIE_NAME] || req.cookies?.[REFRESH_COOKIE_NAME];
    } else {
      // Auto-detect based on cookie presence
      if (req.cookies?.[ADMIN_REFRESH_COOKIE_NAME] && !req.cookies?.[CUSTOMER_REFRESH_COOKIE_NAME]) {
        cookieName = ADMIN_REFRESH_COOKIE_NAME;
        plainRefreshToken = req.cookies[ADMIN_REFRESH_COOKIE_NAME];
      } else if (req.cookies?.[CUSTOMER_REFRESH_COOKIE_NAME] && !req.cookies?.[ADMIN_REFRESH_COOKIE_NAME]) {
        cookieName = CUSTOMER_REFRESH_COOKIE_NAME;
        plainRefreshToken = req.cookies[CUSTOMER_REFRESH_COOKIE_NAME];
      } else if (req.cookies?.[REFRESH_COOKIE_NAME]) {
        cookieName = REFRESH_COOKIE_NAME;
        plainRefreshToken = req.cookies[REFRESH_COOKIE_NAME];
      } else {
        cookieName = CUSTOMER_REFRESH_COOKIE_NAME;
        plainRefreshToken = req.cookies?.[CUSTOMER_REFRESH_COOKIE_NAME];
      }
    }

    const deviceInfo = req.headers['user-agent'] || 'Unknown Device';
    const ipAddress = req.ip || req.socket.remoteAddress;

    const { accessToken, refreshToken: newRefreshToken, user } = await authService.refresh({
      plainRefreshToken,
      deviceInfo,
      ipAddress
    });

    // Enforce role consistency with requested client
    if (clientType === 'admin' && user.role !== 'admin') {
      throw ApiError.forbidden(
        'Access denied: Administrator privileges required for admin session',
        'FORBIDDEN_ROLE'
      );
    }

    // Set updated HttpOnly refresh cookie for this application context
    res.cookie(cookieName, newRefreshToken, getRefreshCookieOptions());

    // If legacy cookie was also sent, keep it synchronized
    if (!clientType && req.cookies?.[REFRESH_COOKIE_NAME]) {
      res.cookie(REFRESH_COOKIE_NAME, newRefreshToken, getRefreshCookieOptions());
    }

    return ApiResponse.success(res, {
      message: 'Token refreshed successfully',
      data: {
        accessToken,
        user
      }
    });
  }),

  /**
   * Invalidate current session and clear the targeted application refresh cookie
   */
  logout: asyncHandler(async (req, res) => {
    const clientType = resolveClientType(req);
    let cookieName;
    let plainRefreshToken;

    if (clientType === 'admin') {
      cookieName = ADMIN_REFRESH_COOKIE_NAME;
      plainRefreshToken = req.cookies?.[ADMIN_REFRESH_COOKIE_NAME] || req.cookies?.[REFRESH_COOKIE_NAME];
    } else if (clientType === 'customer') {
      cookieName = CUSTOMER_REFRESH_COOKIE_NAME;
      plainRefreshToken = req.cookies?.[CUSTOMER_REFRESH_COOKIE_NAME] || req.cookies?.[REFRESH_COOKIE_NAME];
    } else {
      if (req.cookies?.[ADMIN_REFRESH_COOKIE_NAME] && !req.cookies?.[CUSTOMER_REFRESH_COOKIE_NAME]) {
        cookieName = ADMIN_REFRESH_COOKIE_NAME;
        plainRefreshToken = req.cookies[ADMIN_REFRESH_COOKIE_NAME];
      } else if (req.cookies?.[CUSTOMER_REFRESH_COOKIE_NAME] && !req.cookies?.[ADMIN_REFRESH_COOKIE_NAME]) {
        cookieName = CUSTOMER_REFRESH_COOKIE_NAME;
        plainRefreshToken = req.cookies[CUSTOMER_REFRESH_COOKIE_NAME];
      } else {
        cookieName = req.cookies?.[CUSTOMER_REFRESH_COOKIE_NAME]
          ? CUSTOMER_REFRESH_COOKIE_NAME
          : (req.cookies?.[ADMIN_REFRESH_COOKIE_NAME] ? ADMIN_REFRESH_COOKIE_NAME : REFRESH_COOKIE_NAME);
        plainRefreshToken = req.cookies?.[cookieName] || req.cookies?.[REFRESH_COOKIE_NAME];
      }
    }

    await authService.logout({ plainRefreshToken });

    // Clear only the targeted application refresh cookie
    res.clearCookie(cookieName, getClearRefreshCookieOptions());
    if (!clientType && req.cookies?.[REFRESH_COOKIE_NAME]) {
      res.clearCookie(REFRESH_COOKIE_NAME, getClearRefreshCookieOptions());
    }

    return ApiResponse.success(res, {
      message: 'Logged out successfully'
    });
  }),

  /**
   * Get current authenticated user profile
   */
  getMe: asyncHandler(async (req, res) => {
    return ApiResponse.success(res, {
      message: 'User profile retrieved successfully',
      data: { user: req.user }
    });
  })
};
