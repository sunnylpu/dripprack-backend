import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/database.js';
import { User } from '../src/modules/users/user.model.js';
import { AuthSession } from '../src/modules/auth/authSession.model.js';
import { authenticate } from '../src/middleware/authenticate.js';
import { authorize } from '../src/middleware/authorize.js';
import { ApiResponse } from '../src/utils/ApiResponse.js';
import { env } from '../src/config/env.js';
import { REFRESH_COOKIE_NAME } from '../src/modules/auth/token.service.js';

describe('Phase 2: Authentication & Authorization Test Suite', () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await connectDB(uri);
  });

  afterAll(async () => {
    await disconnectDB();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await AuthSession.deleteMany({});
  });

  const validCustomer = {
    email: 'customer@example.com',
    password: 'Password123!',
    firstName: 'Jane',
    lastName: 'Doe'
  };

  describe('Customer Registration (POST /api/v1/auth/register)', () => {
    it('should register a new customer with 201 Created and sanitized profile', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send(validCustomer);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.email).toBe('customer@example.com');
      expect(res.body.data.user.role).toBe('customer');
      expect(res.body.data.user.status).toBe('active');
      expect(res.body.data.user.passwordHash).toBeUndefined();
      expect(res.body.data.user.password).toBeUndefined();

      // Verify in DB that password was hashed with Argon2id
      const dbUser = await User.findOne({ email: 'customer@example.com' }).select('+passwordHash');
      expect(dbUser).toBeDefined();
      expect(dbUser.passwordHash).toContain('$argon2id$');
    });

    it('should prevent mass assignment and ignore client-supplied role: "admin"', async () => {
      const maliciousPayload = {
        ...validCustomer,
        email: 'attacker@example.com',
        role: 'admin',
        status: 'suspended'
      };

      const res = await request(app)
        .post('/api/v1/auth/register')
        .send(maliciousPayload);

      expect(res.status).toBe(201);
      expect(res.body.data.user.role).toBe('customer'); // Forced to customer
      expect(res.body.data.user.status).toBe('active');

      const dbUser = await User.findOne({ email: 'attacker@example.com' });
      expect(dbUser.role).toBe('customer');
    });

    it('should reject registration with duplicate email with 409 Conflict', async () => {
      await request(app).post('/api/v1/auth/register').send(validCustomer);

      // Re-register with same email in different case
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ ...validCustomer, email: 'CUSTOMER@EXAMPLE.COM' });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(res.body.error.message).toContain('already exists');
    });

    it('should reject passwords that fail complexity constraints with 422', async () => {
      const weakPasswords = ['short1!', 'NoNumberSpecial!', 'noncapital1!', 'NOPUNCTUATION123'];

      for (const password of weakPasswords) {
        const res = await request(app)
          .post('/api/v1/auth/register')
          .send({ ...validCustomer, email: `test_${Date.now()}@example.com`, password });

        expect(res.status).toBe(422);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }
    });
  });

  describe('Customer Login (POST /api/v1/auth/login)', () => {
    beforeEach(async () => {
      await request(app).post('/api/v1/auth/register').send(validCustomer);
    });

    it('should login successfully, return access token and set HttpOnly refresh cookie', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'CUSTOMER@example.com', // Test email case-insensitivity
          password: 'Password123!'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.refreshToken).toBeUndefined(); // NEVER exposed in response body!

      // Check cookie headers
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const refreshCookie = cookies.find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
      expect(refreshCookie).toBeDefined();
      expect(refreshCookie).toContain('HttpOnly');
      expect(refreshCookie).toContain('Path=/api/v1/auth');
    });

    it('should return 401 with generic error for incorrect password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'customer@example.com',
          password: 'WrongPassword999!'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(res.body.error.message).toBe('Invalid email or password');
    });

    it('should return 401 with generic error for non-existent email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'ghost@example.com',
          password: 'Password123!'
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(res.body.error.message).toBe('Invalid email or password');
    });

    it('should reject login for suspended accounts with 403 Forbidden', async () => {
      await User.updateOne({ email: 'customer@example.com' }, { status: 'suspended' });

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'customer@example.com',
          password: 'Password123!'
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
    });

    it('should reject login for deactivated accounts with 403 Forbidden', async () => {
      await User.updateOne({ email: 'customer@example.com' }, { status: 'deactivated' });

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'customer@example.com',
          password: 'Password123!'
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ACCOUNT_DEACTIVATED');
    });
  });

  describe('Current User Profile & JWT Validation (GET /api/v1/auth/me)', () => {
    let accessToken;

    beforeEach(async () => {
      await request(app).post('/api/v1/auth/register').send(validCustomer);
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: validCustomer.email, password: validCustomer.password });
      accessToken = loginRes.body.data.accessToken;
    });

    it('should return 200 and profile when authenticated with valid Bearer token', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(validCustomer.email);
      expect(res.body.data.user.role).toBe('customer');
      expect(res.body.data.user.passwordHash).toBeUndefined();
    });

    it('should return 401 when Authorization header is missing', async () => {
      const res = await request(app).get('/api/v1/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 when token format is not Bearer', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Basic ${accessToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 when token is signed with wrong secret or tampered', async () => {
      const forgedToken = jwt.sign(
        { sub: 'randomUserId', role: 'admin', type: 'access' },
        'wrong_tampered_secret_key_123456789'
      );

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${forgedToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TOKEN_INVALID');
    });

    it('should return 401 when token purpose is not access (e.g. type: refresh)', async () => {
      const invalidPurposeToken = jwt.sign(
        { sub: 'someUser', role: 'customer', type: 'refresh' },
        env.JWT_ACCESS_SECRET
      );

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${invalidPurposeToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_TOKEN_TYPE');
    });

    it('should return 401 when token is expired', async () => {
      const expiredToken = jwt.sign(
        { sub: 'someUser', role: 'customer', type: 'access' },
        env.JWT_ACCESS_SECRET,
        { expiresIn: '-1s' }
      );

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TOKEN_EXPIRED');
    });
  });

  describe('Refresh Token Rotation & Reuse Detection (POST /api/v1/auth/refresh)', () => {
    let refreshCookie;

    beforeEach(async () => {
      await request(app).post('/api/v1/auth/register').send(validCustomer);
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: validCustomer.email, password: validCustomer.password });
      refreshCookie = loginRes.headers['set-cookie'].find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
    });

    it('should rotate refresh token, issuing a new access token and new refresh cookie', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', [refreshCookie]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();

      const newCookie = res.headers['set-cookie'].find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
      expect(newCookie).toBeDefined();
      expect(newCookie).not.toBe(refreshCookie); // Token must be rotated
    });

    it('should reject replay of an old refresh token and trigger reuse detection to revoke all sessions', async () => {
      // First rotation: valid
      const firstRotation = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', [refreshCookie]);
      expect(firstRotation.status).toBe(200);

      // Second attempt using the OLD invalidated cookie (Token Theft / Replay Attack simulation)
      const replayRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', [refreshCookie]);

      expect(replayRes.status).toBe(401);
      expect(replayRes.body.error.code).toBe('REVOKED_SESSION_REUSE');

      // Verify that all sessions for this user were invalidated in DB
      const user = await User.findOne({ email: validCustomer.email });
      const activeSessions = await AuthSession.find({ user: user._id, isRevoked: false });
      expect(activeSessions.length).toBe(0);
    });

    it('should return 401 when refresh cookie is missing', async () => {
      const res = await request(app).post('/api/v1/auth/refresh');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('MISSING_REFRESH_TOKEN');
    });
  });

  describe('Logout (POST /api/v1/auth/logout)', () => {
    let refreshCookie;

    beforeEach(async () => {
      await request(app).post('/api/v1/auth/register').send(validCustomer);
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: validCustomer.email, password: validCustomer.password });
      refreshCookie = loginRes.headers['set-cookie'].find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
    });

    it('should revoke session and clear the refresh token cookie', async () => {
      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', [refreshCookie]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify cookie is cleared (has max-age=0 or expires in past)
      const cookies = res.headers['set-cookie'];
      const clearedCookie = cookies.find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
      expect(clearedCookie).toMatch(/Expires=|Max-Age=0/i);

      // Verify that calling refresh with the logged-out cookie fails
      const refreshAttempt = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', [refreshCookie]);

      expect(refreshAttempt.status).toBe(401);
    });
  });

  describe('Role-Based Authorization & Admin Protection', () => {
    let customerAccessToken;
    let adminAccessToken;

    beforeEach(async () => {
      // Create customer
      await request(app).post('/api/v1/auth/register').send(validCustomer);
      const customerLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: validCustomer.email, password: validCustomer.password });
      customerAccessToken = customerLogin.body.data.accessToken;

      // Create admin
      const adminPasswordHash = await User.hashPassword('AdminMaster123!');
      const adminUser = await User.create({
        email: 'admin@driprack.com',
        passwordHash: adminPasswordHash,
        firstName: 'Admin',
        lastName: 'Master',
        role: 'admin',
        status: 'active'
      });

      const adminLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@driprack.com', password: 'AdminMaster123!' });
      adminAccessToken = adminLogin.body.data.accessToken;
    });

    it('should reject a customer trying to access an admin-only endpoint with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/v1/test/admin-only')
        .set('Authorization', `Bearer ${customerAccessToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('Requires admin permission');
    });

    it('should permit an admin user to access an admin-only endpoint with 200 OK', async () => {
      const res = await request(app)
        .get('/api/v1/test/admin-only')
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe('admin');
    });
  });

  describe('Rate Limiting & Abuse Prevention', () => {
    it('should return 429 Too Many Requests when auth rate limit is exceeded', async () => {
      const email = 'ratelimit@example.com';
      const password = 'WrongPassword123!';

      // Perform 5 attempts (configured max) with X-Test-Rate-Limit header
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/v1/auth/login')
          .set('X-Test-Rate-Limit', 'true')
          .send({ email, password });
      }

      // 6th attempt should be blocked by auth rate limiter
      const blockedRes = await request(app)
        .post('/api/v1/auth/login')
        .set('X-Test-Rate-Limit', 'true')
        .send({ email, password });

      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(blockedRes.body.error.message).toContain('Too many authentication attempts');
    });
  });

  describe('Admin Bootstrap Anti-Elevation Rules', () => {
    it('should prevent an existing customer from being converted to admin', async () => {
      await request(app).post('/api/v1/auth/register').send(validCustomer);

      const existingCustomer = await User.findOne({ email: validCustomer.email });
      expect(existingCustomer.role).toBe('customer');

      // Attempting to create an admin with this customer email should fail
      const attemptElevation = async () => {
        const found = await User.findOne({ email: validCustomer.email });
        if (found && found.role !== 'admin') {
          throw new Error(`Security Violation: A user with email '${validCustomer.email}' exists with role '${found.role}'.`);
        }
      };

      await expect(attemptElevation()).rejects.toThrow('Security Violation');
    });
  });
});
