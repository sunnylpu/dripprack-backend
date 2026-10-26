import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import crypto from 'crypto';
import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/database.js';
import { User } from '../src/modules/users/user.model.js';
import { Category } from '../src/modules/categories/category.model.js';
import { Product } from '../src/modules/products/product.model.js';
import { Address } from '../src/modules/addresses/address.model.js';
import { Order } from '../src/modules/orders/order.model.js';
import { Payment } from '../src/modules/payments/payment.model.js';
import { InventoryMovement } from '../src/modules/inventory/inventoryMovement.model.js';
import { AuditLog } from '../src/modules/admin/auditLog.model.js';

describe('Phase 7: Admin Order Fulfillment, Dashboard and Audit Logging Test Suite', () => {
  let replSet;
  let adminUser;
  let customerUser;
  let adminToken;
  let customerToken;
  let testCategory;
  let testProduct;
  let testAddress;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await connectDB(replSet.getUri());

    // Create Admin
    const adminPasswordHash = await User.hashPassword('AdminPassword123!');
    adminUser = await User.create({
      email: 'admin_phase7@driprack.com',
      passwordHash: adminPasswordHash,
      firstName: 'Super',
      lastName: 'Admin',
      role: 'admin',
      status: 'active'
    });

    // Create Customer
    const customerPasswordHash = await User.hashPassword('CustomerPassword123!');
    customerUser = await User.create({
      email: 'customer_phase7@driprack.com',
      passwordHash: customerPasswordHash,
      firstName: 'Jane',
      lastName: 'Customer',
      role: 'customer',
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
    await Order.deleteMany({});
    await Payment.deleteMany({});
    await InventoryMovement.deleteMany({});
    await AuditLog.deleteMany({});
    await Product.deleteMany({});
    await Category.deleteMany({});
    await Address.deleteMany({});

    // Login Admin
    const loginAdmin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin_phase7@driprack.com', password: 'AdminPassword123!' });
    adminToken = loginAdmin.body.data.accessToken;

    // Login Customer
    const loginCustomer = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'customer_phase7@driprack.com', password: 'CustomerPassword123!' });
    customerToken = loginCustomer.body.data.accessToken;

    // Create Category
    testCategory = await Category.create({
      name: 'Outerwear',
      slug: 'outerwear',
      isActive: true
    });

    // Create Product with stock: physical 50, reserved 10, available 40
    testProduct = await Product.create({
      name: 'Cargo Bomber Jacket',
      slug: 'cargo-bomber-jacket',
      sku: 'DRIP-CBJ-001',
      description: 'Tactical streetwear bomber jacket',
      category: testCategory._id,
      priceCents: 15000,
      stock: {
        physical: 50,
        reserved: 10,
        available: 40
      },
      lowStockThreshold: 15,
      status: 'published'
    });

    // Create Address for customer
    testAddress = await Address.create({
      user: customerUser._id,
      recipientName: 'Jane Customer',
      phone: '+1-555-0199',
      streetAddress1: '123 Drip Blvd',
      city: 'Los Angeles',
      state: 'CA',
      postalCode: '90001',
      country: 'US',
      isDefault: true
    });
  });

  // Helper to create an Order and corresponding Payment directly
  async function createTestOrder({
    orderStatus = 'confirmed',
    paymentMethod = 'cod',
    paymentStatus = 'cod_due',
    quantity = 2,
    priceCents = 15000,
    isStockRestocked = false
  } = {}) {
    const subtotalCents = priceCents * quantity;
    const shippingCents = 0;
    const taxCents = Math.round((subtotalCents * 10) / 100);
    const totalCents = subtotalCents + shippingCents + taxCents;
    const orderReference = `ORD-20261027-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    const order = await Order.create({
      orderReference,
      customer: customerUser._id,
      currency: 'USD',
      subtotalCents,
      shippingCents,
      taxCents,
      totalCents,
      orderStatus,
      paymentMethod,
      paymentStatus,
      isStockRestocked,
      shippingAddress: {
        recipientName: testAddress.recipientName,
        phone: testAddress.phone,
        streetAddress1: testAddress.streetAddress1,
        city: testAddress.city,
        state: testAddress.state,
        postalCode: testAddress.postalCode,
        country: testAddress.country
      },
      items: [
        {
          product: testProduct._id,
          sku: testProduct.sku,
          name: testProduct.name,
          unitPriceCents: priceCents,
          quantity,
          lineTotalCents: subtotalCents
        }
      ]
    });

    const payment = await Payment.create({
      order: order._id,
      orderReference: order.orderReference,
      provider: paymentMethod === 'cod' ? 'cod' : 'mock',
      amountCents: totalCents,
      currency: 'USD',
      status: paymentStatus
    });

    return { order, payment };
  }

  describe('1. Role Authorization and Endpoint Protection', () => {
    it('should reject unauthenticated requests with 401 Unauthorized', async () => {
      const endpoints = [
        { method: 'get', url: '/api/v1/admin/orders' },
        { method: 'get', url: '/api/v1/admin/orders/ORD-TEST-001' },
        { method: 'patch', url: '/api/v1/admin/orders/ORD-TEST-001/status' },
        { method: 'post', url: '/api/v1/admin/orders/ORD-TEST-001/cancel' },
        { method: 'get', url: '/api/v1/admin/dashboard/summary' },
        { method: 'get', url: '/api/v1/admin/audit-logs' }
      ];

      for (const ep of endpoints) {
        const res = await request(app)[ep.method](ep.url);
        expect(res.status).toBe(401);
        expect(res.body.error?.code).toBe('UNAUTHORIZED');
      }
    });

    it('should reject customer tokens with 403 Forbidden on all admin endpoints', async () => {
      const endpoints = [
        { method: 'get', url: '/api/v1/admin/orders' },
        { method: 'get', url: '/api/v1/admin/orders/ORD-TEST-001' },
        { method: 'patch', url: '/api/v1/admin/orders/ORD-TEST-001/status' },
        { method: 'post', url: '/api/v1/admin/orders/ORD-TEST-001/cancel' },
        { method: 'get', url: '/api/v1/admin/dashboard/summary' },
        { method: 'get', url: '/api/v1/admin/audit-logs' }
      ];

      for (const ep of endpoints) {
        const res = await request(app)[ep.method](ep.url).set(
          'Authorization',
          `Bearer ${customerToken}`
        );
        expect(res.status).toBe(403);
        expect(res.body.error?.code).toBe('FORBIDDEN');
      }
    });
  });

  describe('2. Admin Order Listing and Details (GET /admin/orders)', () => {
    it('should list orders with bounded pagination and filter by order status', async () => {
      await createTestOrder({ orderStatus: 'confirmed' });
      await createTestOrder({ orderStatus: 'processing' });
      await createTestOrder({ orderStatus: 'shipped' });

      const res = await request(app)
        .get('/api/v1/admin/orders?orderStatus=processing')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.orders).toHaveLength(1);
      expect(res.body.data.orders[0].orderStatus).toBe('processing');
      expect(res.body.meta.total).toBe(1);
      expect(res.body.data.orders[0].customer.email).toBe('customer_phase7@driprack.com');
    });

    it('should filter orders by paymentMethod and paymentStatus', async () => {
      await createTestOrder({ paymentMethod: 'cod', paymentStatus: 'cod_due' });
      await createTestOrder({ paymentMethod: 'online', paymentStatus: 'paid', orderStatus: 'confirmed' });

      const res = await request(app)
        .get('/api/v1/admin/orders?paymentMethod=online&paymentStatus=paid')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.orders).toHaveLength(1);
      expect(res.body.data.orders[0].paymentMethod).toBe('online');
      expect(res.body.data.orders[0].paymentStatus).toBe('paid');
    });

    it('should reject invalid date range with 422 Unprocessable Entity', async () => {
      const res = await request(app)
        .get('/api/v1/admin/orders?startDate=2026-12-31T00:00:00.000Z&endDate=2026-01-01T00:00:00.000Z')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(422);
      expect(res.body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should retrieve full order details, payment record, and associated audit logs by reference', async () => {
      const { order } = await createTestOrder({ orderStatus: 'confirmed' });

      // Create an audit entry for this order
      await AuditLog.create({
        actor: adminUser._id,
        action: 'ORDER_STATUS_CHANGED',
        resourceType: 'order',
        resourceId: order.orderReference,
        details: { previousStatus: 'awaiting_payment', newStatus: 'confirmed' }
      });

      const res = await request(app)
        .get(`/api/v1/admin/orders/${order.orderReference}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.order.orderReference).toBe(order.orderReference);
      expect(res.body.data.order.items[0].sku).toBe('DRIP-CBJ-001');
      expect(res.body.data.payment.amountCents).toBe(order.totalCents);
      expect(res.body.data.auditLogs).toHaveLength(1);
      expect(res.body.data.auditLogs[0].action).toBe('ORDER_STATUS_CHANGED');
    });

    it('should return 404 for non-existent order reference', async () => {
      const res = await request(app)
        .get('/api/v1/admin/orders/ORD-99999999-NOTFOUND')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error?.code).toBe('ORDER_NOT_FOUND');
    });
  });

  describe('3. Fulfillment State Transitions & Inventory Lifecycle', () => {
    it('should advance order from confirmed to processing and write an audit log', async () => {
      const { order } = await createTestOrder({ orderStatus: 'confirmed' });

      const res = await request(app)
        .patch(`/api/v1/admin/orders/${order.orderReference}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'processing' });

      expect(res.status).toBe(200);
      expect(res.body.data.order.orderStatus).toBe('processing');

      // Verify AuditLog written
      const logs = await AuditLog.find({ resourceId: order.orderReference });
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('ORDER_STATUS_CHANGED');
      expect(logs[0].details.previousStatus).toBe('confirmed');
      expect(logs[0].details.newStatus).toBe('processing');
    });

    it('should reject transitioning an unpaid online order to processing', async () => {
      const { order } = await createTestOrder({
        orderStatus: 'confirmed',
        paymentMethod: 'online',
        paymentStatus: 'pending' // Unpaid online order
      });

      const res = await request(app)
        .patch(`/api/v1/admin/orders/${order.orderReference}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'processing' });

      expect(res.status).toBe(409);
      expect(res.body.error?.code).toBe('ORDER_PAYMENT_REQUIRED');
    });

    it('should reject transition to shipped without valid tracking info', async () => {
      const { order } = await createTestOrder({ orderStatus: 'processing' });

      // Missing tracking payload
      const res1 = await request(app)
        .patch(`/api/v1/admin/orders/${order.orderReference}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'shipped' });

      expect(res1.status).toBe(422);

      // Insecure HTTP url
      const res2 = await request(app)
        .patch(`/api/v1/admin/orders/${order.orderReference}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'shipped',
          tracking: {
            carrier: 'DHL Express',
            trackingNumber: 'DHL12345678',
            trackingUrl: 'http://insecure-tracking.com/12345678'
          }
        });

      expect(res2.status).toBe(422);
    });

    it('should ship order, decrement physical and reserved stock, preserve available stock, and record a sale movement', async () => {
      const { order } = await createTestOrder({ orderStatus: 'processing', quantity: 4 });

      // Before shipping: physical 50, reserved 10, available 40
      const productBefore = await Product.findById(testProduct._id);
      expect(productBefore.stock.physical).toBe(50);
      expect(productBefore.stock.reserved).toBe(10);
      expect(productBefore.stock.available).toBe(40);

      const res = await request(app)
        .patch(`/api/v1/admin/orders/${order.orderReference}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'shipped',
          tracking: {
            carrier: 'FedEx',
            trackingNumber: 'FDX987654321',
            trackingUrl: 'https://fedex.com/track?id=FDX987654321'
          }
        });

      expect(res.status).toBe(200);
      expect(res.body.data.order.orderStatus).toBe('shipped');
      expect(res.body.data.order.tracking.carrier).toBe('FedEx');
      expect(res.body.data.order.tracking.trackingNumber).toBe('FDX987654321');
      expect(res.body.data.order.tracking.dispatchedAt).toBeDefined();

      // After shipping:
      // physical drops by 4 (50 -> 46)
      // reserved drops by 4 (10 -> 6)
      // available is UNCHANGED at 40 (46 - 6 = 40)
      const productAfter = await Product.findById(testProduct._id);
      expect(productAfter.stock.physical).toBe(46);
      expect(productAfter.stock.reserved).toBe(6);
      expect(productAfter.stock.available).toBe(40);

      // Verify InventoryMovement of type 'sale'
      const movements = await InventoryMovement.find({
        orderReference: order.orderReference,
        movementType: 'sale'
      });
      expect(movements).toHaveLength(1);
      expect(movements[0].quantityDelta).toBe(-4);
      expect(movements[0].previousPhysical).toBe(50);
      expect(movements[0].newPhysical).toBe(46);
      expect(movements[0].previousReserved).toBe(10);
      expect(movements[0].newReserved).toBe(6);
      expect(movements[0].previousAvailable).toBe(40);
      expect(movements[0].newAvailable).toBe(40);
    });

    it('should reject delivering a COD order without codPaymentCollected confirmation', async () => {
      const { order } = await createTestOrder({
        orderStatus: 'shipped',
        paymentMethod: 'cod',
        paymentStatus: 'cod_due'
      });

      const res = await request(app)
        .patch(`/api/v1/admin/orders/${order.orderReference}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'delivered' });

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('COD_PAYMENT_REQUIRED');
    });

    it('should successfully deliver COD order when codPaymentCollected is true and update payment to paid without deducting stock again', async () => {
      const { order } = await createTestOrder({
        orderStatus: 'shipped',
        paymentMethod: 'cod',
        paymentStatus: 'cod_due'
      });

      const stockBefore = await Product.findById(testProduct._id);

      const res = await request(app)
        .patch(`/api/v1/admin/orders/${order.orderReference}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'delivered', codPaymentCollected: true });

      expect(res.status).toBe(200);
      expect(res.body.data.order.orderStatus).toBe('delivered');
      expect(res.body.data.order.paymentStatus).toBe('paid');
      expect(res.body.data.payment.status).toBe('paid');

      // Verify stock was NOT altered on delivery
      const stockAfter = await Product.findById(testProduct._id);
      expect(stockAfter.stock.physical).toBe(stockBefore.stock.physical);
      expect(stockAfter.stock.reserved).toBe(stockBefore.stock.reserved);
      expect(stockAfter.stock.available).toBe(stockBefore.stock.available);

      // Verify AuditLogs created: COD_PAYMENT_COLLECTED and ORDER_STATUS_CHANGED
      const codAudit = await AuditLog.findOne({
        resourceId: order.orderReference,
        action: 'COD_PAYMENT_COLLECTED'
      });
      expect(codAudit).toBeDefined();
      expect(codAudit.details.amountCents).toBe(order.totalCents);
    });

    it('should reject invalid status jumps (e.g. confirmed directly to shipped)', async () => {
      const { order } = await createTestOrder({ orderStatus: 'confirmed' });

      const res = await request(app)
        .patch(`/api/v1/admin/orders/${order.orderReference}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'shipped',
          tracking: {
            carrier: 'DHL',
            trackingNumber: 'DHL123',
            trackingUrl: 'https://dhl.com/track/123'
          }
        });

      expect(res.status).toBe(409);
      expect(res.body.error?.code).toBe('INVALID_ORDER_TRANSITION');
    });

    it('should reject status mutations on delivered or cancelled orders', async () => {
      const { order: deliveredOrder } = await createTestOrder({
        orderStatus: 'delivered',
        paymentStatus: 'paid'
      });

      const res1 = await request(app)
        .patch(`/api/v1/admin/orders/${deliveredOrder.orderReference}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'processing' });

      expect(res1.status).toBe(409);
      expect(res1.body.error?.code).toBe('INVALID_ORDER_STATUS');

      const { order: cancelledOrder } = await createTestOrder({
        orderStatus: 'cancelled',
        isStockRestocked: true
      });

      const res2 = await request(app)
        .patch(`/api/v1/admin/orders/${cancelledOrder.orderReference}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'processing' });

      expect(res2.status).toBe(409);
      expect(res2.body.error?.code).toBe('ORDER_ALREADY_CANCELLED');
    });

    it('should safely handle repeating status requests idempotently without duplicate stock mutations', async () => {
      const { order } = await createTestOrder({ orderStatus: 'processing' });

      const res = await request(app)
        .patch(`/api/v1/admin/orders/${order.orderReference}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'processing' });

      expect(res.status).toBe(200);
      expect(res.body.data.isNoop).toBe(true);

      const logs = await AuditLog.find({ resourceId: order.orderReference });
      expect(logs).toHaveLength(0); // No duplicate audit entries
    });
  });

  describe('4. Administrative Order Cancellation & Stock Release', () => {
    it('should allow admin to cancel an order in processing and release reserved stock exactly once', async () => {
      const { order } = await createTestOrder({ orderStatus: 'processing', quantity: 5 });

      // Before: physical 50, reserved 10, available 40
      const res = await request(app)
        .post(`/api/v1/admin/orders/${order.orderReference}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Item out of season; administrative cancellation' });

      expect(res.status).toBe(200);
      expect(res.body.data.order.orderStatus).toBe('cancelled');
      expect(res.body.data.order.paymentStatus).toBe('failed');
      expect(res.body.data.order.isStockRestocked).toBe(true);
      expect(res.body.data.order.cancellation.reason).toBe(
        'Item out of season; administrative cancellation'
      );

      // Inventory after cancellation:
      // reserved decrements by 5 (10 -> 5)
      // available increments by 5 (40 -> 45)
      // physical remains 50
      const productAfter = await Product.findById(testProduct._id);
      expect(productAfter.stock.physical).toBe(50);
      expect(productAfter.stock.reserved).toBe(5);
      expect(productAfter.stock.available).toBe(45);

      // Verify 'release' movement
      const movements = await InventoryMovement.find({
        orderReference: order.orderReference,
        movementType: 'release'
      });
      expect(movements).toHaveLength(1);
      expect(movements[0].quantityDelta).toBe(5);
      expect(movements[0].actorRole).toBe('admin');

      // Verify AuditLog written
      const audit = await AuditLog.findOne({
        resourceId: order.orderReference,
        action: 'ORDER_CANCELLED'
      });
      expect(audit).toBeDefined();
      expect(audit.details.previousStatus).toBe('processing');
    });

    it('should reject repeated cancellation attempts with 409 and not double-release stock', async () => {
      const { order } = await createTestOrder({ orderStatus: 'processing', quantity: 2 });

      // First cancel
      await request(app)
        .post(`/api/v1/admin/orders/${order.orderReference}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'First cancel' });

      const stockAfterFirst = await Product.findById(testProduct._id);

      // Second cancel attempt
      const res2 = await request(app)
        .post(`/api/v1/admin/orders/${order.orderReference}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Second cancel attempt' });

      expect(res2.status).toBe(409);
      expect(res2.body.error?.code).toBe('ORDER_ALREADY_CANCELLED');

      // Ensure stock was not released twice
      const stockAfterSecond = await Product.findById(testProduct._id);
      expect(stockAfterSecond.stock.available).toBe(stockAfterFirst.stock.available);
      expect(stockAfterSecond.stock.reserved).toBe(stockAfterFirst.stock.reserved);
    });

    it('should reject admin cancellation of shipped or delivered orders', async () => {
      const { order: shippedOrder } = await createTestOrder({ orderStatus: 'shipped' });

      const res = await request(app)
        .post(`/api/v1/admin/orders/${shippedOrder.orderReference}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Too late to cancel' });

      expect(res.status).toBe(409);
      expect(res.body.error?.code).toBe('ORDER_NOT_CANCELLABLE');
    });

    it('should reject admin cancellation of paid online orders when refunds are not supported', async () => {
      const { order: paidOrder } = await createTestOrder({
        orderStatus: 'confirmed',
        paymentMethod: 'online',
        paymentStatus: 'paid'
      });

      const res = await request(app)
        .post(`/api/v1/admin/orders/${paidOrder.orderReference}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Cancellation requested' });

      expect(res.status).toBe(409);
      expect(res.body.error?.code).toBe('REFUND_NOT_SUPPORTED');
    });
  });

  describe('5. Audit Logging Trail & Dashboard Summary', () => {
    it('should retrieve paginated administrative audit logs with filtering', async () => {
      // Create some sample audit entries
      await AuditLog.create([
        {
          actor: adminUser._id,
          action: 'ORDER_STATUS_CHANGED',
          resourceType: 'order',
          resourceId: 'ORD-TEST-001',
          details: { status: 'processing' }
        },
        {
          actor: adminUser._id,
          action: 'ORDER_CANCELLED',
          resourceType: 'order',
          resourceId: 'ORD-TEST-002',
          details: { reason: 'Customer requested' }
        }
      ]);

      const res = await request(app)
        .get('/api/v1/admin/audit-logs?action=ORDER_CANCELLED')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.auditLogs).toHaveLength(1);
      expect(res.body.data.auditLogs[0].action).toBe('ORDER_CANCELLED');
      expect(res.body.data.auditLogs[0].actor.email).toBe('admin_phase7@driprack.com');
      expect(res.body.meta.total).toBe(1);
    });

    it('should confirm audit logs are append-only with no PUT, PATCH, or DELETE routes exposed', async () => {
      const putRes = await request(app)
        .put('/api/v1/admin/audit-logs/123')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action: 'FORGED_EDIT' });
      expect([404, 405]).toContain(putRes.status);

      const deleteRes = await request(app)
        .delete('/api/v1/admin/audit-logs/123')
        .set('Authorization', `Bearer ${adminToken}`);
      expect([404, 405]).toContain(deleteRes.status);
    });

    it('should compute dashboard summary with accurate status counts, paid revenue, and low-stock count', async () => {
      // 1. Confirmed COD order (unpaid revenue)
      await createTestOrder({ orderStatus: 'confirmed', paymentStatus: 'cod_due', priceCents: 10000 });
      // 2. Delivered COD order (paid revenue: 11000 cents with 10% tax = 11000)
      const { order: paidOrder } = await createTestOrder({
        orderStatus: 'delivered',
        paymentStatus: 'paid',
        priceCents: 10000,
        quantity: 1
      });
      // 3. Cancelled order (excluded from revenue)
      await createTestOrder({ orderStatus: 'cancelled', paymentStatus: 'failed', priceCents: 5000 });

      // Create a low-stock product: available 3, lowStockThreshold 5
      await Product.create({
        name: 'Limited Cap',
        slug: 'limited-cap',
        sku: 'DRIP-CAP-001',
        description: 'Streetwear cap',
        category: testCategory._id,
        priceCents: 3000,
        stock: { physical: 3, reserved: 0, available: 3 },
        lowStockThreshold: 5,
        status: 'published'
      });

      const res = await request(app)
        .get('/api/v1/admin/dashboard/summary')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const { data } = res.body;

      // Status breakdown
      expect(data.ordersByStatus.confirmed).toBe(1);
      expect(data.ordersByStatus.delivered).toBe(1);
      expect(data.ordersByStatus.cancelled).toBe(1);
      expect(data.totalOrdersCount).toBe(3);

      // Revenue: only the paid delivered order is recognized
      expect(data.revenue.paidOrdersCount).toBe(1);
      expect(data.revenue.totalRevenueCents).toBe(paidOrder.totalCents);
      expect(data.revenue.currency).toBe('USD');

      // Low stock count: Cargo Bomber Jacket has available 40 (>15), Limited Cap has available 3 (<=5) -> 1 product
      expect(data.lowStockProductsCount).toBe(1);

      // Recent orders list is bounded
      expect(data.recentOrders.length).toBeLessThanOrEqual(10);
      expect(data.recentOrders[0].orderReference).toBeDefined();
    });
  });
});
