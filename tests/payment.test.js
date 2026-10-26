import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import crypto from 'crypto';
import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/database.js';
import { User } from '../src/modules/users/user.model.js';
import { Category } from '../src/modules/categories/category.model.js';
import { Product } from '../src/modules/products/product.model.js';
import { Cart } from '../src/modules/carts/cart.model.js';
import { Address } from '../src/modules/addresses/address.model.js';
import { Order } from '../src/modules/orders/order.model.js';
import { Payment } from '../src/modules/payments/payment.model.js';
import { InventoryMovement } from '../src/modules/inventory/inventoryMovement.model.js';
import {
  setPaymentGateway,
  resetPaymentGateway,
  MockPaymentGateway
} from '../src/modules/payments/payment.gateway.js';

describe('Phase 6: Payment Foundation & Webhooks Test Suite', () => {
  let replSet;
  let customerUser;
  let customerToken;
  let adminToken;
  let category;
  let address;
  let product;
  const webhookSecret = 'test_webhook_secret';

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await connectDB(replSet.getUri());

    const passwordHash = await User.hashPassword('CustomerPassword123!');
    customerUser = await User.create({
      email: 'customer_payment@driprack.com',
      passwordHash,
      firstName: 'Pay',
      lastName: 'Customer',
      role: 'customer',
      status: 'active'
    });

    const adminHash = await User.hashPassword('AdminPassword123!');
    await User.create({
      email: 'admin_payment@driprack.com',
      passwordHash: adminHash,
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      status: 'active'
    });
  }, 60000);

  afterAll(async () => {
    resetPaymentGateway();
    await disconnectDB();
    if (replSet) {
      await replSet.stop();
    }
  });

  beforeEach(async () => {
    resetPaymentGateway();
    setPaymentGateway(new MockPaymentGateway());

    await Order.deleteMany({});
    await Payment.deleteMany({});
    await InventoryMovement.deleteMany({});
    await Cart.deleteMany({});
    await Product.deleteMany({});
    await Category.deleteMany({});
    await Address.deleteMany({});

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'customer_payment@driprack.com', password: 'CustomerPassword123!' });
    customerToken = loginRes.body.data.accessToken;

    const adminLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin_payment@driprack.com', password: 'AdminPassword123!' });
    adminToken = adminLoginRes.body.data.accessToken;

    category = await Category.create({
      name: 'Outerwear',
      slug: 'outerwear',
      isActive: true
    });

    address = await Address.create({
      user: customerUser._id,
      recipientName: 'Pay Customer',
      phone: '+14155550000',
      streetAddress1: '77 Geary St',
      city: 'San Francisco',
      state: 'CA',
      postalCode: '94108',
      country: 'US',
      isDefault: true
    });

    product = await Product.create({
      sku: 'DRIP-PARKA-BLK',
      slug: 'drip-parka-black',
      name: 'Drip Down Parka',
      description: 'Heavy insulation',
      category: category._id,
      priceCents: 12000,
      status: 'published',
      stock: { physical: 10, reserved: 0, available: 10 }
    });
  });

  describe('1. Payment Intent Creation & Role Protection', () => {
    it('should reject unauthenticated request to create-intent with 401', async () => {
      const res = await request(app)
        .post('/api/v1/payments/create-intent')
        .send({ orderReference: 'ORD-TEST-0001' });

      expect(res.status).toBe(401);
      expect(res.body.error?.code).toBe('UNAUTHORIZED');
    });

    it('should reject admin token to create-intent with 403', async () => {
      const res = await request(app)
        .post('/api/v1/payments/create-intent')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ orderReference: 'ORD-TEST-0001' });

      expect(res.status).toBe(403);
      expect(res.body.error?.code).toBe('FORBIDDEN');
    });

    it('should create payment intent for an eligible awaiting_payment online order', async () => {
      // Place online order
      await Cart.create({
        user: customerUser._id,
        items: [{ product: product._id, quantity: 1 }]
      });

      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .set('Idempotency-Key', `idem-online-${crypto.randomUUID()}`)
        .send({
          addressId: address._id.toString(),
          paymentMethod: 'online'
        });

      expect(orderRes.status).toBe(201);
      const order = orderRes.body.data;
      expect(order.orderStatus).toBe('awaiting_payment');
      expect(order.paymentStatus).toBe('pending');

      // Create intent
      const intentRes = await request(app)
        .post('/api/v1/payments/create-intent')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ orderReference: order.orderReference });

      expect(intentRes.status).toBe(200);
      expect(intentRes.body.data.providerPaymentId).toMatch(/^mock_pi_/);
      expect(intentRes.body.data.clientSecret).toMatch(/^mock_sec_/);
      expect(intentRes.body.data.amountCents).toBe(12000);
      expect(intentRes.body.data.currency).toBe('USD');

      // Verify payment document updated with providerPaymentId
      const payment = await Payment.findOne({ order: order._id });
      expect(payment.providerPaymentId).toBe(intentRes.body.data.providerPaymentId);
    });

    it('should reject payment intent creation for COD orders', async () => {
      await Cart.create({
        user: customerUser._id,
        items: [{ product: product._id, quantity: 1 }]
      });

      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .set('Idempotency-Key', `idem-cod-check-${crypto.randomUUID()}`)
        .send({
          addressId: address._id.toString(),
          paymentMethod: 'cod'
        });

      const orderRef = orderRes.body.data.orderReference;

      const intentRes = await request(app)
        .post('/api/v1/payments/create-intent')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ orderReference: orderRef });

      expect(intentRes.status).toBe(400);
      expect(intentRes.body.error?.code).toBe('PAYMENT_METHOD_MISMATCH');
    });

    it('should reject payment intent creation for unowned orders', async () => {
      const intentRes = await request(app)
        .post('/api/v1/payments/create-intent')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ orderReference: 'ORD-99999999-FAKE01' });

      expect(intentRes.status).toBe(404);
      expect(intentRes.body.error?.code).toBe('ORDER_NOT_FOUND');
    });
  });

  describe('2. Webhook Signature Verification and Integrity Safeguards', () => {
    it('should reject webhooks missing signature header with 400', async () => {
      const res = await request(app)
        .post('/api/v1/payments/webhook')
        .send({
          id: 'evt_1',
          type: 'payment_intent.succeeded',
          orderReference: 'ORD-TEST'
        });

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('INVALID_WEBHOOK_SIGNATURE');
    });

    it('should reject webhooks with forged or invalid signature with 400', async () => {
      const payload = JSON.stringify({
        id: 'evt_2',
        type: 'payment_intent.succeeded',
        orderReference: 'ORD-TEST'
      });

      const res = await request(app)
        .post('/api/v1/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('Stripe-Signature', 'forged_signature_hex')
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('INVALID_WEBHOOK_SIGNATURE');
    });

    it('should reject webhook if payment amount or currency does not match server order', async () => {
      // Place online order for 12000 cents ($120)
      await Cart.create({
        user: customerUser._id,
        items: [{ product: product._id, quantity: 1 }]
      });

      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .set('Idempotency-Key', `idem-tamper-check-${crypto.randomUUID()}`)
        .send({ addressId: address._id.toString(), paymentMethod: 'online' });

      const orderRef = orderRes.body.data.orderReference;

      // Event payload with fraudulent amount: 1000 cents ($10)
      const eventPayload = {
        id: `evt_tamper_${crypto.randomUUID()}`,
        type: 'payment_intent.succeeded',
        data: {
          orderReference: orderRef,
          amountCents: 1000, // Mismatched amount!
          currency: 'USD'
        }
      };

      const rawPayload = JSON.stringify(eventPayload);
      const validSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawPayload)
        .digest('hex');

      const res = await request(app)
        .post('/api/v1/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('Stripe-Signature', validSignature)
        .send(rawPayload);

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('PAYMENT_AMOUNT_MISMATCH');

      // Verify order and payment remain awaiting_payment / pending
      const checkOrder = await Order.findOne({ orderReference: orderRef });
      expect(checkOrder.orderStatus).toBe('awaiting_payment');
      expect(checkOrder.paymentStatus).toBe('pending');
    });
  });

  describe('3. Successful Payment Transition and Idempotency', () => {
    it('should transition order to confirmed and payment to paid upon verified payment_intent.succeeded event', async () => {
      await Cart.create({
        user: customerUser._id,
        items: [{ product: product._id, quantity: 1 }]
      });

      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .set('Idempotency-Key', `idem-success-test-${crypto.randomUUID()}`)
        .send({ addressId: address._id.toString(), paymentMethod: 'online' });

      const orderRef = orderRes.body.data.orderReference;
      const eventId = `evt_success_${crypto.randomUUID()}`;

      const eventPayload = {
        id: eventId,
        type: 'payment_intent.succeeded',
        data: {
          orderReference: orderRef,
          amountCents: 12000,
          currency: 'USD',
          providerPaymentId: 'mock_pi_verified_123'
        }
      };

      const rawPayload = JSON.stringify(eventPayload);
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawPayload)
        .digest('hex');

      const res = await request(app)
        .post('/api/v1/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('Stripe-Signature', signature)
        .send(rawPayload);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('paid');

      // Verify order transitioned to confirmed
      const order = await Order.findOne({ orderReference: orderRef });
      expect(order.orderStatus).toBe('confirmed');
      expect(order.paymentStatus).toBe('paid');

      // Verify payment document updated
      const payment = await Payment.findOne({ order: order._id });
      expect(payment.status).toBe('paid');
      expect(payment.processedEvents).toContain(eventId);
    });

    it('should idempotently acknowledge duplicate valid webhook events without double-applying mutations', async () => {
      await Cart.create({
        user: customerUser._id,
        items: [{ product: product._id, quantity: 1 }]
      });

      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .set('Idempotency-Key', `idem-dup-webhook-${crypto.randomUUID()}`)
        .send({ addressId: address._id.toString(), paymentMethod: 'online' });

      const orderRef = orderRes.body.data.orderReference;
      const eventId = `evt_dup_${crypto.randomUUID()}`;

      const eventPayload = {
        id: eventId,
        type: 'payment_intent.succeeded',
        data: {
          orderReference: orderRef,
          amountCents: 12000,
          currency: 'USD'
        }
      };

      const rawPayload = JSON.stringify(eventPayload);
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawPayload)
        .digest('hex');

      // First webhook post
      const res1 = await request(app)
        .post('/api/v1/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('Stripe-Signature', signature)
        .send(rawPayload);

      expect(res1.status).toBe(200);
      expect(res1.body.data.status).toBe('paid');

      // Replay identical webhook post
      const res2 = await request(app)
        .post('/api/v1/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('Stripe-Signature', signature)
        .send(rawPayload);

      expect(res2.status).toBe(200);
      expect(res2.body.data.duplicate).toBe(true);
      expect(res2.body.data.acknowledged).toBe(true);
    });
  });

  describe('4. Failed Payment Webhook and Compensating Stock Release', () => {
    it('should transition order to cancelled and release reserved stock on payment_intent.payment_failed event', async () => {
      await Cart.create({
        user: customerUser._id,
        items: [{ product: product._id, quantity: 2 }]
      });

      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .set('Idempotency-Key', `idem-fail-flow-${crypto.randomUUID()}`)
        .send({ addressId: address._id.toString(), paymentMethod: 'online' });

      const orderRef = orderRes.body.data.orderReference;

      // Verify stock was reserved: reserved: 2, available: 8
      let p = await Product.findById(product._id);
      expect(p.stock.reserved).toBe(2);
      expect(p.stock.available).toBe(8);

      const eventPayload = {
        id: `evt_failed_${crypto.randomUUID()}`,
        type: 'payment_intent.payment_failed',
        data: {
          orderReference: orderRef,
          amountCents: 24000,
          currency: 'USD'
        }
      };

      const rawPayload = JSON.stringify(eventPayload);
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawPayload)
        .digest('hex');

      const res = await request(app)
        .post('/api/v1/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('Stripe-Signature', signature)
        .send(rawPayload);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('failed');

      // Verify order cancelled and stock restock flag set
      const order = await Order.findOne({ orderReference: orderRef });
      expect(order.orderStatus).toBe('cancelled');
      expect(order.paymentStatus).toBe('failed');
      expect(order.isStockRestocked).toBe(true);

      // Verify reserved stock was released back to available
      p = await Product.findById(product._id);
      expect(p.stock.physical).toBe(10);
      expect(p.stock.reserved).toBe(0);
      expect(p.stock.available).toBe(10);

      // Verify release movement audit record
      const releaseMovement = await InventoryMovement.findOne({
        orderReference: orderRef,
        movementType: 'release'
      });
      expect(releaseMovement).toBeTruthy();
      expect(releaseMovement.quantityDelta).toBe(2);
      expect(releaseMovement.newAvailable).toBe(10);
    });
  });
});
