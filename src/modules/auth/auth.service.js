import { User } from '../users/user.model.js';
import { AuthSession } from './authSession.model.js';
import {
  generateAccessToken,
  generateRandomToken,
  hashToken
} from './token.service.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { logger } from '../../utils/logger.js';

export const authService = {
  /**
   * Register a new customer
   */
  async register({ email, password, firstName, lastName }) {
    const normalizedEmail = email.trim().toLowerCase();

    // Check if account already exists
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      throw ApiError.conflict('An account with this email address already exists', [
        { field: 'email', message: 'Email is already in use' }
      ]);
    }

    // Hash password with Argon2id
    const passwordHash = await User.hashPassword(password);

    // Create user with explicit 'customer' role
    const user = await User.create({
      email: normalizedEmail,
      passwordHash,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      role: 'customer', // Public registration ALWAYS assigns customer
      status: 'active'
    });

    return user.toJSON();
  },

  /**
   * Authenticate user credentials and create a new session
   */
  async login({ email, password, deviceInfo, ipAddress }) {
    const normalizedEmail = email.trim().toLowerCase();

    // Explicitly query passwordHash which is select: false by default
    const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');
    if (!user) {
      throw ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    // Account status check
    if (user.status === 'suspended') {
      throw new ApiError(403, 'Account is suspended. Please contact support.', 'ACCOUNT_SUSPENDED');
    }
    if (user.status === 'deactivated') {
      throw new ApiError(403, 'Account has been deactivated.', 'ACCOUNT_DEACTIVATED');
    }

    // Verify password with Argon2id
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      throw ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const plainRefreshToken = generateRandomToken(40);
    const tokenHash = hashToken(plainRefreshToken);
    const expiresAt = new Date(Date.now() + env.JWT_REFRESH_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000);

    // Store verifier hash in AuthSession
    await AuthSession.create({
      user: user._id,
      tokenHash,
      deviceInfo: deviceInfo || 'Unknown Device',
      ipAddress: ipAddress || null,
      expiresAt
    });

    return {
      accessToken,
      refreshToken: plainRefreshToken,
      user: user.toJSON()
    };
  },

  /**
   * Rotate refresh token and issue a fresh access token
   * Detects reuse of invalidated tokens to prevent session hijacking
   */
  async refresh({ plainRefreshToken, deviceInfo, ipAddress }) {
    if (!plainRefreshToken) {
      throw ApiError.unauthorized('Refresh token is required', 'MISSING_REFRESH_TOKEN');
    }

    const tokenHash = hashToken(plainRefreshToken);
    const session = await AuthSession.findOne({ tokenHash });

    if (!session) {
      throw ApiError.unauthorized('Invalid or expired refresh session', 'INVALID_SESSION');
    }

    // REUSE DETECTION: If an already-revoked session token is presented
    if (session.isRevoked) {
      // Invalidate all active sessions for this user as a safeguard
      await AuthSession.updateMany({ user: session.user }, { isRevoked: true });
      logger.warn(
        { userId: session.user },
        'Revoked refresh token reuse detected! All active sessions revoked for security.'
      );
      throw ApiError.unauthorized(
        'Security alert: Invalidated session reuse detected. All active sessions have been terminated.',
        'REVOKED_SESSION_REUSE'
      );
    }

    // Check expiration
    if (session.expiresAt < new Date()) {
      session.isRevoked = true;
      await session.save();
      throw ApiError.unauthorized('Refresh session has expired. Please log in again.', 'SESSION_EXPIRED');
    }

    // Verify user is still active
    const user = await User.findById(session.user);
    if (!user || user.status !== 'active') {
      session.isRevoked = true;
      await session.save();
      throw ApiError.unauthorized('User account is suspended, deactivated, or not found', 'ACCOUNT_INACTIVE');
    }

    // Invalidate current session (Rotation)
    session.isRevoked = true;
    await session.save();

    // Issue fresh token pair
    const newAccessToken = generateAccessToken(user);
    const newPlainRefreshToken = generateRandomToken(40);
    const newTokenHash = hashToken(newPlainRefreshToken);
    const newExpiresAt = new Date(Date.now() + env.JWT_REFRESH_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000);

    await AuthSession.create({
      user: user._id,
      tokenHash: newTokenHash,
      deviceInfo: deviceInfo || session.deviceInfo,
      ipAddress: ipAddress || session.ipAddress,
      expiresAt: newExpiresAt
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newPlainRefreshToken,
      user: user.toJSON()
    };
  },

  /**
   * Invalidate current session and clear refresh token
   */
  async logout({ plainRefreshToken }) {
    if (plainRefreshToken) {
      const tokenHash = hashToken(plainRefreshToken);
      await AuthSession.updateOne({ tokenHash }, { isRevoked: true });
    }
    return true;
  }
};
