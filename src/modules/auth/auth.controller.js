import { authService } from './auth.service.js';
import {
  REFRESH_COOKIE_NAME,
  getRefreshCookieOptions,
  getClearRefreshCookieOptions
} from './token.service.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
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
   * Login customer or administrator
   */
  login: asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const deviceInfo = req.headers['user-agent'] || 'Unknown Device';
    const ipAddress = req.ip || req.socket.remoteAddress;

    const { accessToken, refreshToken, user } = await authService.login({
      email,
      password,
      deviceInfo,
      ipAddress
    });

    // Set HttpOnly cookie for refresh token - never expose in JSON response
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, getRefreshCookieOptions());

    return ApiResponse.success(res, {
      message: 'Authentication successful',
      data: {
        accessToken,
        user
      }
    });
  }),

  /**
   * Rotate refresh token and issue new access token
   */
  refresh: asyncHandler(async (req, res) => {
    // Read refresh token from HttpOnly cookie
    const plainRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    const deviceInfo = req.headers['user-agent'] || 'Unknown Device';
    const ipAddress = req.ip || req.socket.remoteAddress;

    const { accessToken, refreshToken: newRefreshToken, user } = await authService.refresh({
      plainRefreshToken,
      deviceInfo,
      ipAddress
    });

    // Set updated HttpOnly refresh cookie
    res.cookie(REFRESH_COOKIE_NAME, newRefreshToken, getRefreshCookieOptions());

    return ApiResponse.success(res, {
      message: 'Token refreshed successfully',
      data: {
        accessToken,
        user
      }
    });
  }),

  /**
   * Invalidate current session and clear refresh cookie
   */
  logout: asyncHandler(async (req, res) => {
    const plainRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];

    await authService.logout({ plainRefreshToken });

    // Clear refresh cookie
    res.clearCookie(REFRESH_COOKIE_NAME, getClearRefreshCookieOptions());

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
