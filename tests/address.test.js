import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/database.js';
import { User } from '../src/modules/users/user.model.js';
import { Address } from '../src/modules/addresses/address.model.js';

describe('Phase 5: Delivery Address Management Test Suite', () => {
  let replSet;
  let customerAUser;
  let customerBUser;
  let customerAToken;
  let customerBToken;
  let adminToken;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await connectDB(replSet.getUri());

    // Create Customer A
    const passwordHashA = await User.hashPassword('CustomerPassword123!');
    customerAUser = await User.create({
      email: 'customera_addr@driprack.com',
      passwordHash: passwordHashA,
      firstName: 'Alice',
      lastName: 'Address',
      role: 'customer',
      status: 'active'
    });

    // Create Customer B
    const passwordHashB = await User.hashPassword('CustomerPassword123!');
    customerBUser = await User.create({
      email: 'customerb_addr@driprack.com',
      passwordHash: passwordHashB,
      firstName: 'Bob',
      lastName: 'Address',
      role: 'customer',
      status: 'active'
    });

    // Create Admin User
    const adminPasswordHash = await User.hashPassword('AdminPassword123!');
    await User.create({
      email: 'admin_addr@driprack.com',
      passwordHash: adminPasswordHash,
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      status: 'active'
    });
  }, 60000);

  afterAll(async () => {
    await disconnectDB();
    if (replSet) {
      await replSet.stop();
    }
  });

  beforeEach(async () => {
    await Address.deleteMany({});

    // Authenticate customers and admin
    const loginA = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'customera_addr@driprack.com', password: 'CustomerPassword123!' });
    customerAToken = loginA.body.data.accessToken;

    const loginB = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'customerb_addr@driprack.com', password: 'CustomerPassword123!' });
    customerBToken = loginB.body.data.accessToken;

    const loginAdmin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin_addr@driprack.com', password: 'AdminPassword123!' });
    adminToken = loginAdmin.body.data.accessToken;
  });

  describe('1. Role & Access Authorization', () => {
    it('should reject unauthenticated requests with 401 Unauthorized', async () => {
      const endpoints = [
        { method: 'get', path: '/api/v1/addresses' },
        { method: 'post', path: '/api/v1/addresses', body: { recipientName: 'Test' } },
        { method: 'patch', path: `/api/v1/addresses/${new mongoose.Types.ObjectId()}`, body: { city: 'NYC' } },
        { method: 'patch', path: `/api/v1/addresses/${new mongoose.Types.ObjectId()}/default` },
        { method: 'delete', path: `/api/v1/addresses/${new mongoose.Types.ObjectId()}` }
      ];

      for (const ep of endpoints) {
        const req = request(app)[ep.method](ep.path);
        if (ep.body) req.send(ep.body);
        const res = await req;
        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
      }
    });

    it('should reject admin token with 403 Forbidden (customer role required)', async () => {
      const res = await request(app)
        .get('/api/v1/addresses')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('2. Address Creation & First-Address Default Rule', () => {
    it('should create an address and automatically set it as default if first address', async () => {
      const res = await request(app)
        .post('/api/v1/addresses')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          recipientName: 'Alice Residence',
          phone: '+1 555-234-5678',
          streetAddress1: '123 Fashion Ave',
          streetAddress2: 'Apt 4B',
          city: 'New York',
          state: 'NY',
          postalCode: '10001',
          country: 'US',
          isDefault: false // Client requested false, but as first address it MUST become default!
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.address.recipientName).toBe('Alice Residence');
      expect(res.body.data.address.isDefault).toBe(true);
      expect(res.body.data.address.user.toString()).toBe(customerAUser._id.toString());
      expect(res.body.data.address.postalCode).toBe('10001');
    });

    it('should ignore client-supplied spoofed user ID in payload', async () => {
      const spoofedUserId = new mongoose.Types.ObjectId().toString();

      const res = await request(app)
        .post('/api/v1/addresses')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          recipientName: 'Alice Anti-Spoof',
          phone: '+1 555-987-6543',
          streetAddress1: '456 Trend Blvd',
          city: 'Los Angeles',
          state: 'CA',
          postalCode: '90001',
          country: 'US',
          user: spoofedUserId // Injected spoofed owner ID
        });

      // Strict schema rejects extra properties with 422
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid fields, missing required fields, and invalid country codes', async () => {
      // Missing required city & invalid country code length
      const res = await request(app)
        .post('/api/v1/addresses')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          recipientName: 'Incomplete Address',
          phone: '+1 555-111-2222',
          streetAddress1: '789 Missing St',
          state: 'CA',
          postalCode: '90210',
          country: 'USA' // Not 2-letter ISO
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      const fields = res.body.error.details.map((d) => d.field);
      expect(fields).toContain('city');
      expect(fields).toContain('country');
    });

    it('should reject invalid phone format with 422', async () => {
      const res = await request(app)
        .post('/api/v1/addresses')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          recipientName: 'Bad Phone',
          phone: '123', // Too short
          streetAddress1: '123 Street',
          city: 'City',
          state: 'State',
          postalCode: '12345',
          country: 'US'
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('3. Address Listing & Default Ordering', () => {
    it('should list only the authenticated customer addresses with default address first', async () => {
      // Create first address for A (will be default)
      const res1 = await request(app)
        .post('/api/v1/addresses')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          recipientName: 'First Default Address',
          phone: '+1 555-100-0001',
          streetAddress1: '100 First St',
          city: 'Chicago',
          state: 'IL',
          postalCode: '60601',
          country: 'US'
        });
      const addr1Id = res1.body.data.address._id;

      // Create second address for A (non-default)
      await request(app)
        .post('/api/v1/addresses')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          recipientName: 'Second Non-Default',
          phone: '+1 555-100-0002',
          streetAddress1: '200 Second St',
          city: 'Chicago',
          state: 'IL',
          postalCode: '60602',
          country: 'US'
        });

      // Create address for Customer B
      await request(app)
        .post('/api/v1/addresses')
        .set('Authorization', `Bearer ${customerBToken}`)
        .send({
          recipientName: 'Bob Sole Address',
          phone: '+1 555-999-9999',
          streetAddress1: '999 Bob St',
          city: 'Dallas',
          state: 'TX',
          postalCode: '75001',
          country: 'US'
        });

      // Customer A lists addresses
      const resA = await request(app)
        .get('/api/v1/addresses')
        .set('Authorization', `Bearer ${customerAToken}`);

      expect(resA.status).toBe(200);
      expect(resA.body.data.addresses.length).toBe(2);
      // Default address must be first in list
      expect(resA.body.data.addresses[0]._id).toBe(addr1Id);
      expect(resA.body.data.addresses[0].isDefault).toBe(true);
      expect(resA.body.data.addresses[1].isDefault).toBe(false);

      // Verify no address from Customer B is leaked
      const bAddresses = resA.body.data.addresses.filter(
        (a) => a.user.toString() === customerBUser._id.toString()
      );
      expect(bAddresses.length).toBe(0);
    });
  });

  describe('4. Setting & Changing Default Address', () => {
    let addr1, addr2;

    beforeEach(async () => {
      // First address (default)
      const res1 = await request(app)
        .post('/api/v1/addresses')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          recipientName: 'Original Default',
          phone: '+1 555-111-2222',
          streetAddress1: '111 Main St',
          city: 'Seattle',
          state: 'WA',
          postalCode: '98101',
          country: 'US'
        });
      addr1 = res1.body.data.address;

      // Second address (non-default)
      const res2 = await request(app)
        .post('/api/v1/addresses')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          recipientName: 'Secondary Address',
          phone: '+1 555-333-4444',
          streetAddress1: '222 Second Ave',
          city: 'Seattle',
          state: 'WA',
          postalCode: '98102',
          country: 'US'
        });
      addr2 = res2.body.data.address;
    });

    it('should set second address as default and unset first address (PATCH /addresses/:id/default)', async () => {
      const res = await request(app)
        .patch(`/api/v1/addresses/${addr2._id}/default`)
        .set('Authorization', `Bearer ${customerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.address._id).toBe(addr2._id);
      expect(res.body.data.address.isDefault).toBe(true);

      // Verify in DB that addr1 was unset
      const dbAddr1 = await Address.findById(addr1._id);
      expect(dbAddr1.isDefault).toBe(false);

      const dbAddr2 = await Address.findById(addr2._id);
      expect(dbAddr2.isDefault).toBe(true);

      // Verify database uniqueness invariant: exactly 1 default address exists for customer A
      const defaultCount = await Address.countDocuments({
        user: customerAUser._id,
        isDefault: true
      });
      expect(defaultCount).toBe(1);
    });

    it('should allow setting subsequent address as default directly during creation', async () => {
      const res = await request(app)
        .post('/api/v1/addresses')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          recipientName: 'New Default via Post',
          phone: '+1 555-777-8888',
          streetAddress1: '333 Third St',
          city: 'Seattle',
          state: 'WA',
          postalCode: '98103',
          country: 'US',
          isDefault: true
        });

      expect(res.status).toBe(201);
      expect(res.body.data.address.isDefault).toBe(true);

      // Verify previous default (addr1) is now unset
      const dbAddr1 = await Address.findById(addr1._id);
      expect(dbAddr1.isDefault).toBe(false);

      const defaultCount = await Address.countDocuments({
        user: customerAUser._id,
        isDefault: true
      });
      expect(defaultCount).toBe(1);
    });
  });

  describe('5. Update & Delete Address with Default Promotion', () => {
    let addr1, addr2, addr3;

    beforeEach(async () => {
      // Address 1 (Initial default)
      const res1 = await request(app)
        .post('/api/v1/addresses')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          recipientName: 'Addr 1',
          phone: '+1 555-111-1111',
          streetAddress1: '1 First Ave',
          city: 'Miami',
          state: 'FL',
          postalCode: '33101',
          country: 'US'
        });
      addr1 = res1.body.data.address;

      // Address 2
      const res2 = await request(app)
        .post('/api/v1/addresses')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          recipientName: 'Addr 2',
          phone: '+1 555-222-2222',
          streetAddress1: '2 Second Ave',
          city: 'Miami',
          state: 'FL',
          postalCode: '33102',
          country: 'US'
        });
      addr2 = res2.body.data.address;

      // Address 3 (Newest)
      const res3 = await request(app)
        .post('/api/v1/addresses')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          recipientName: 'Addr 3',
          phone: '+1 555-333-3333',
          streetAddress1: '3 Third Ave',
          city: 'Miami',
          state: 'FL',
          postalCode: '33103',
          country: 'US'
        });
      addr3 = res3.body.data.address;
    });

    it('should update permitted fields of an owned address', async () => {
      const res = await request(app)
        .patch(`/api/v1/addresses/${addr2._id}`)
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          recipientName: 'Updated Recipient Name',
          city: 'Fort Lauderdale'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.address.recipientName).toBe('Updated Recipient Name');
      expect(res.body.data.address.city).toBe('Fort Lauderdale');
      expect(res.body.data.address.state).toBe('FL'); // Unchanged
    });

    it('should promote the newest remaining address to default when the default address is deleted', async () => {
      expect(addr1.isDefault).toBe(true);

      // Delete the default address (addr1)
      const res = await request(app)
        .delete(`/api/v1/addresses/${addr1._id}`)
        .set('Authorization', `Bearer ${customerAToken}`);

      expect(res.status).toBe(200);

      // Verify addr3 (the most recently created remaining address) was promoted to default!
      const dbAddr3 = await Address.findById(addr3._id);
      expect(dbAddr3.isDefault).toBe(true);

      const dbAddr2 = await Address.findById(addr2._id);
      expect(dbAddr2.isDefault).toBe(false);

      // Exactly 1 default address exists
      const defaultCount = await Address.countDocuments({
        user: customerAUser._id,
        isDefault: true
      });
      expect(defaultCount).toBe(1);
    });

    it('should handle deletion cleanly when no addresses remain', async () => {
      // Delete addr1, addr2, addr3 sequentially
      await request(app).delete(`/api/v1/addresses/${addr1._id}`).set('Authorization', `Bearer ${customerAToken}`);
      await request(app).delete(`/api/v1/addresses/${addr2._id}`).set('Authorization', `Bearer ${customerAToken}`);
      const res = await request(app).delete(`/api/v1/addresses/${addr3._id}`).set('Authorization', `Bearer ${customerAToken}`);

      expect(res.status).toBe(200);

      const remaining = await Address.countDocuments({ user: customerAUser._id });
      expect(remaining).toBe(0);

      // Reading addresses now returns empty list cleanly
      const listRes = await request(app).get('/api/v1/addresses').set('Authorization', `Bearer ${customerAToken}`);
      expect(listRes.body.data.addresses).toEqual([]);
    });
  });

  describe('6. Cross-Customer Isolation & IDOR Protection', () => {
    let addressB;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/v1/addresses')
        .set('Authorization', `Bearer ${customerBToken}`)
        .send({
          recipientName: 'Bob Private Home',
          phone: '+1 555-888-9999',
          streetAddress1: '888 Bob Way',
          city: 'Austin',
          state: 'TX',
          postalCode: '78701',
          country: 'US'
        });
      addressB = res.body.data.address;
    });

    it('should prevent Customer A from updating Customer B address (returns 404)', async () => {
      const res = await request(app)
        .patch(`/api/v1/addresses/${addressB._id}`)
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ recipientName: 'Hacked Recipient' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');

      const original = await Address.findById(addressB._id);
      expect(original.recipientName).toBe('Bob Private Home');
    });

    it('should prevent Customer A from setting Customer B address as default (returns 404)', async () => {
      const res = await request(app)
        .patch(`/api/v1/addresses/${addressB._id}/default`)
        .set('Authorization', `Bearer ${customerAToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should prevent Customer A from deleting Customer B address (returns 404)', async () => {
      const res = await request(app)
        .delete(`/api/v1/addresses/${addressB._id}`)
        .set('Authorization', `Bearer ${customerAToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');

      const stillExists = await Address.findById(addressB._id);
      expect(stillExists).toBeDefined();
    });
  });
});
