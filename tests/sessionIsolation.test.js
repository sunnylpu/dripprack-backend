import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/database.js';
import { User } from '../src/modules/users/user.model.js';
import { AuthSession } from '../src/modules/auth/authSession.model.js';
import { env } from '../src/config/env.js';
import {
  ADMIN_REFRESH_COOKIE_NAME,
  CUSTOMER_REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_NAME
} from '../src/modules/auth/token.service.js';

describe('Admin & Customer Session Isolation and Multi-Cookie Architecture', () => {
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

  const adminCredentials = {
    email: 'admin@driprack.internal',
    password: 'AdminPassword123!',
    firstName: 'System',
    lastName: 'Admin'
  };

  const customerCredentials = {
    email: 'shopper@example.com',
    password: 'CustomerPassword123!',
    firstName: 'Jane',
    lastName: 'Shopper'
  };

  async function seedAccounts() {
    const adminPasswordHash = await User.hashPassword(adminCredentials.password);
    const admin = await User.create({
      email: adminCredentials.email,
      passwordHash: adminPasswordHash,
      firstName: adminCredentials.firstName,
      lastName: adminCredentials.lastName,
      role: 'admin',
      status: 'active'
    });

    const customerPasswordHash = await User.hashPassword(customerCredentials.password);
    const customer = await User.create({
      email: customerCredentials.email,
      passwordHash: customerPasswordHash,
      firstName: customerCredentials.firstName,
      lastName: customerCredentials.lastName,
      role: 'customer',
      status: 'active'
    });

    return { admin, customer };
  }

  function extractCookie(res, cookieName) {
    const rawCookies = res.headers['set-cookie'];
    if (!rawCookies) return null;
    const cookieList = Array.isArray(rawCookies) ? rawCookies : [rawCookies];
    for (const c of cookieList) {
      if (c.startsWith(`${cookieName}=`)) {
        return c.split(';')[0];
      }
    }
    return null;
  }

  it('should set adminRefreshToken cookie on admin login with X-App-Client: admin', async () => {
    await seedAccounts();

    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('X-App-Client', 'admin')
      .send({
        email: adminCredentials.email,
        password: adminCredentials.password
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.role).toBe('admin');

    const adminCookie = extractCookie(res, ADMIN_REFRESH_COOKIE_NAME);
    const customerCookie = extractCookie(res, CUSTOMER_REFRESH_COOKIE_NAME);

    expect(adminCookie).toBeTruthy();
    expect(adminCookie).toContain(`${ADMIN_REFRESH_COOKIE_NAME}=`);
    expect(customerCookie).toBeNull();
  });

  it('should set customerRefreshToken cookie on customer login with X-App-Client: customer', async () => {
    await seedAccounts();

    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('X-App-Client', 'customer')
      .send({
        email: customerCredentials.email,
        password: customerCredentials.password
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.role).toBe('customer');

    const customerCookie = extractCookie(res, CUSTOMER_REFRESH_COOKIE_NAME);
    const adminCookie = extractCookie(res, ADMIN_REFRESH_COOKIE_NAME);

    expect(customerCookie).toBeTruthy();
    expect(customerCookie).toContain(`${CUSTOMER_REFRESH_COOKIE_NAME}=`);
    expect(adminCookie).toBeNull();
  });

  it('should reject non-admin account attempting to log in with X-App-Client: admin', async () => {
    await seedAccounts();

    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('X-App-Client', 'admin')
      .send({
        email: customerCredentials.email,
        password: customerCredentials.password
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
    expect(extractCookie(res, ADMIN_REFRESH_COOKIE_NAME)).toBeNull();
  });

  it('should support dedicated aliases /auth/admin/login and /auth/customer/login', async () => {
    await seedAccounts();

    const adminRes = await request(app)
      .post('/api/v1/auth/admin/login')
      .send({
        email: adminCredentials.email,
        password: adminCredentials.password
      });

    expect(adminRes.status).toBe(200);
    expect(extractCookie(adminRes, ADMIN_REFRESH_COOKIE_NAME)).toBeTruthy();

    const custRes = await request(app)
      .post('/api/v1/auth/customer/login')
      .send({
        email: customerCredentials.email,
        password: customerCredentials.password
      });

    expect(custRes.status).toBe(200);
    expect(extractCookie(custRes, CUSTOMER_REFRESH_COOKIE_NAME)).toBeTruthy();
  });

  it('should independently refresh admin session without affecting customer session', async () => {
    await seedAccounts();

    // 1. Log in admin
    const adminLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .set('X-App-Client', 'admin')
      .send({
        email: adminCredentials.email,
        password: adminCredentials.password
      });
    const adminCookie = extractCookie(adminLoginRes, ADMIN_REFRESH_COOKIE_NAME);

    // 2. Log in customer
    const customerLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .set('X-App-Client', 'customer')
      .send({
        email: customerCredentials.email,
        password: customerCredentials.password
      });
    const customerCookie = extractCookie(customerLoginRes, CUSTOMER_REFRESH_COOKIE_NAME);

    // Both sessions exist in database
    const totalSessionsBefore = await AuthSession.countDocuments({ isRevoked: false });
    expect(totalSessionsBefore).toBe(2);

    // 3. Refresh admin session while passing both cookies in the request header
    const adminRefreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('X-App-Client', 'admin')
      .set('Cookie', `${adminCookie}; ${customerCookie}`);

    expect(adminRefreshRes.status).toBe(200);
    expect(adminRefreshRes.body.data.user.role).toBe('admin');
    const newAdminCookie = extractCookie(adminRefreshRes, ADMIN_REFRESH_COOKIE_NAME);
    expect(newAdminCookie).toBeTruthy();

    // 4. Verify customer session remains completely valid and can still refresh
    const customerRefreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('X-App-Client', 'customer')
      .set('Cookie', `${newAdminCookie}; ${customerCookie}`);

    expect(customerRefreshRes.status).toBe(200);
    expect(customerRefreshRes.body.data.user.role).toBe('customer');
    const newCustomerCookie = extractCookie(customerRefreshRes, CUSTOMER_REFRESH_COOKIE_NAME);
    expect(newCustomerCookie).toBeTruthy();
  });

  it('should independently log out admin session without invalidating customer session', async () => {
    await seedAccounts();

    const adminLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .set('X-App-Client', 'admin')
      .send({
        email: adminCredentials.email,
        password: adminCredentials.password
      });
    const adminCookie = extractCookie(adminLoginRes, ADMIN_REFRESH_COOKIE_NAME);

    const customerLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .set('X-App-Client', 'customer')
      .send({
        email: customerCredentials.email,
        password: customerCredentials.password
      });
    const customerCookie = extractCookie(customerLoginRes, CUSTOMER_REFRESH_COOKIE_NAME);

    // Logout Admin only
    const adminLogoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('X-App-Client', 'admin')
      .set('Cookie', `${adminCookie}; ${customerCookie}`);

    expect(adminLogoutRes.status).toBe(200);
    const setCookies = adminLogoutRes.headers['set-cookie'];
    const adminCleared = setCookies.some((c) => c.includes(`${ADMIN_REFRESH_COOKIE_NAME}=;`));
    const customerCleared = setCookies.some((c) => c.includes(`${CUSTOMER_REFRESH_COOKIE_NAME}=;`));

    expect(adminCleared).toBe(true);
    expect(customerCleared).toBe(false);

    // Customer session should still be active and refreshable
    const customerRefreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('X-App-Client', 'customer')
      .set('Cookie', customerCookie);

    expect(customerRefreshRes.status).toBe(200);
    expect(customerRefreshRes.body.data.user.role).toBe('customer');
  });

  it('should expose public store configuration via GET /api/v1/config', async () => {
    const res = await request(app).get('/api/v1/config');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.currency).toBe(env.CURRENCY_CODE);
    expect(res.body.data.taxRatePercent).toBe(env.TAX_RATE_PERCENT);
    expect(res.body.data.shipping.flatFeeCents).toBe(env.SHIPPING_FLAT_FEE_CENTS);
    expect(res.body.data.shipping.freeShippingThresholdCents).toBe(env.FREE_SHIPPING_THRESHOLD_CENTS);
    expect(res.body.data.payments.codEnabled).toBe(true);
    expect(res.body.data.payments.onlineEnabled).toBe(false);
    expect(res.body.data.payments.provider).toBe('cod');
  });
});
