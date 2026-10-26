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

describe('Phase 6: Checkout and Order Management Test Suite', () => {
  let replSet;
  let customerAUser;
  let customerBUser;
  let customerAToken;
  let customerBToken;
  let adminToken;
  let activeCategory;
  let inactiveCategory;
  let customerAAddress;
  let customerBAddress;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await connectDB(replSet.getUri());

    // Create Customer A
    const passwordHashA = await User.hashPassword('CustomerPassword123!');
    customerAUser = await User.create({
      email: 'customera_order@driprack.com',
      passwordHash: passwordHashA,
      firstName: 'Alice',
      lastName: 'Customer',
      role: 'customer',
      status: 'active'
    });

    // Create Customer B
    const passwordHashB = await User.hashPassword('CustomerPassword123!');
    customerBUser = await User.create({
      email: 'customerb_order@driprack.com',
      passwordHash: passwordHashB,
      firstName: 'Bob',
      lastName: 'Customer',
      role: 'customer',
      status: 'active'
    });

    // Create Admin User
    const adminPasswordHash = await User.hashPassword('AdminPassword123!');
    await User.create({
      email: 'admin_order@driprack.com',
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
    await Order.deleteMany({});
    await Payment.deleteMany({});
    await InventoryMovement.deleteMany({});
    await Cart.deleteMany({});
    await Product.deleteMany({});
    await Category.deleteMany({});
    await Address.deleteMany({});

    // Authenticate customers and admin
    const loginA = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'customera_order@driprack.com', password: 'CustomerPassword123!' });
    customerAToken = loginA.body.data.accessToken;

    const loginB = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'customerb_order@driprack.com', password: 'CustomerPassword123!' });
    customerBToken = loginB.body.data.accessToken;

    const loginAdmin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin_order@driprack.com', password: 'AdminPassword123!' });
    adminToken = loginAdmin.body.data.accessToken;

    // Create categories
    activeCategory = await Category.create({
      name: 'Active Streetwear',
      slug: 'active-streetwear',
      isActive: true
    });

    inactiveCategory = await Category.create({
      name: 'Archived Collection',
      slug: 'archived-collection',
      isActive: false
    });

    // Create delivery addresses
    customerAAddress = await Address.create({
      user: customerAUser._id,
      recipientName: 'Alice Customer',
      phone: '+14155552671',
      streetAddress1: '100 Market St',
      city: 'San Francisco',
      state: 'CA',
      postalCode: '94105',
      country: 'US',
      isDefault: true
    });

    customerBAddress = await Address.create({
      user: customerBUser._id,
      recipientName: 'Bob Customer',
      phone: '+14155559876',
      streetAddress1: '500 Howard St',
      city: 'San Francisco',
      state: 'CA',
      postalCode: '94105',
      country: 'US',
      isDefault: true
    });
  });

  describe('1. Role Authorization and Endpoint Protection', () => {
    it('should reject unauthenticated requests to quote with 401', async () => {
      const res = await request(app)
        .post('/api/v1/orders/quote')
        .send({ addressId: customerAAddress._id.toString() });

      expect(res.status).toBe(401);
      expect(res.body.error?.code).toBe('UNAUTHORIZED');
    });

    it('should reject unauthenticated requests to order placement with 401', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Idempotency-Key', 'idem-1')
        .send({ addressId: customerAAddress._id.toString(), paymentMethod: 'cod' });

      expect(res.status).toBe(401);
      expect(res.body.error?.code).toBe('UNAUTHORIZED');
    });

    it('should reject admin tokens from customer order endpoints with 403', async () => {
      const resQuote = await request(app)
        .post('/api/v1/orders/quote')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ addressId: customerAAddress._id.toString() });

      expect(resQuote.status).toBe(403);
      expect(resQuote.body.error?.code).toBe('FORBIDDEN');

      const resCreate = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', 'idem-2')
        .send({ addressId: customerAAddress._id.toString(), paymentMethod: 'cod' });

      expect(resCreate.status).toBe(403);
      expect(resCreate.body.error?.code).toBe('FORBIDDEN');
    });
  });

  describe('2. Checkout Quote Calculations and Catalog Validation', () => {
    it('should reject quote if customer cart is empty', async () => {
      const res = await request(app)
        .post('/api/v1/orders/quote')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ addressId: customerAAddress._id.toString() });

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('CART_EMPTY');
    });

    it('should reject quote if delivery address belongs to another user', async () => {
      const product = await Product.create({
        sku: 'DRIP-HOODIE-BLK',
        slug: 'drip-hoodie-black',
        name: 'Drip Hoodie Black',
        description: 'Heavyweight fleece',
        category: activeCategory._id,
        priceCents: 4500,
        status: 'published',
        stock: { physical: 10, reserved: 0, available: 10 }
      });

      await Cart.create({
        user: customerAUser._id,
        items: [{ product: product._id, quantity: 1 }]
      });

      // Customer A tries to use Customer B's address
      const res = await request(app)
        .post('/api/v1/orders/quote')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ addressId: customerBAddress._id.toString() });

      expect(res.status).toBe(404);
      expect(res.body.error?.code).toBe('ADDRESS_NOT_FOUND');
    });

    it('should reject quote if product is unpublished or archived', async () => {
      const draftProduct = await Product.create({
        sku: 'DRIP-DRAFT-TEE',
        slug: 'drip-draft-tee',
        name: 'Draft Tee',
        description: 'Not yet released',
        category: activeCategory._id,
        priceCents: 2000,
        status: 'draft',
        stock: { physical: 10, reserved: 0, available: 10 }
      });

      await Cart.create({
        user: customerAUser._id,
        items: [{ product: draftProduct._id, quantity: 1 }]
      });

      const res = await request(app)
        .post('/api/v1/orders/quote')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ addressId: customerAAddress._id.toString() });

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('PRODUCT_UNAVAILABLE');
    });

    it('should reject quote if product category is inactive', async () => {
      const inactiveCatProduct = await Product.create({
        sku: 'DRIP-ARCHIVED-TEE',
        slug: 'drip-archived-tee',
        name: 'Archived Tee',
        description: 'Old season',
        category: inactiveCategory._id,
        priceCents: 2000,
        status: 'published',
        stock: { physical: 10, reserved: 0, available: 10 }
      });

      await Cart.create({
        user: customerAUser._id,
        items: [{ product: inactiveCatProduct._id, quantity: 1 }]
      });

      const res = await request(app)
        .post('/api/v1/orders/quote')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ addressId: customerAAddress._id.toString() });

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('CATEGORY_INACTIVE');
    });

    it('should reject quote if product stock is insufficient', async () => {
      const lowStockProduct = await Product.create({
        sku: 'DRIP-LOW-STOCK-HAT',
        slug: 'drip-low-stock-hat',
        name: 'Low Stock Hat',
        description: 'Limited edition',
        category: activeCategory._id,
        priceCents: 2500,
        status: 'published',
        stock: { physical: 2, reserved: 0, available: 2 }
      });

      await Cart.create({
        user: customerAUser._id,
        items: [{ product: lowStockProduct._id, quantity: 5 }]
      });

      const res = await request(app)
        .post('/api/v1/orders/quote')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ addressId: customerAAddress._id.toString() });

      expect(res.status).toBe(409);
      expect(res.body.error?.code).toBe('INSUFFICIENT_STOCK');
    });

    it('should accurately calculate quote with flat shipping when under free shipping threshold', async () => {
      const product = await Product.create({
        sku: 'DRIP-CAP-BLK',
        slug: 'drip-cap-black',
        name: 'Drip Cap Black',
        description: 'Adjustable snapback',
        category: activeCategory._id,
        priceCents: 3000, // $30.00 (< $50 threshold)
        status: 'published',
        stock: { physical: 10, reserved: 0, available: 10 }
      });

      await Cart.create({
        user: customerAUser._id,
        items: [{ product: product._id, quantity: 1 }]
      });

      const res = await request(app)
        .post('/api/v1/orders/quote')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ addressId: customerAAddress._id.toString() });

      expect(res.status).toBe(200);
      expect(res.body.data.subtotalCents).toBe(3000);
      expect(res.body.data.shippingCents).toBe(500); // $5.00 flat fee
      expect(res.body.data.totalCents).toBe(3500); // 3000 + 500
      expect(res.body.data.currency).toBe('USD');
      expect(res.body.data.isAuthoritative).toBe(false);
    });

    it('should accurately calculate quote with free shipping when at or above threshold', async () => {
      const product = await Product.create({
        sku: 'DRIP-JACKET-PREMIUM',
        slug: 'drip-jacket-premium',
        name: 'Drip Premium Jacket',
        description: 'Waterproof shell',
        category: activeCategory._id,
        priceCents: 6500, // $65.00 (>= $50 threshold)
        status: 'published',
        stock: { physical: 10, reserved: 0, available: 10 }
      });

      await Cart.create({
        user: customerAUser._id,
        items: [{ product: product._id, quantity: 1 }]
      });

      const res = await request(app)
        .post('/api/v1/orders/quote')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ addressId: customerAAddress._id.toString() });

      expect(res.status).toBe(200);
      expect(res.body.data.subtotalCents).toBe(6500);
      expect(res.body.data.shippingCents).toBe(0); // Free shipping!
      expect(res.body.data.totalCents).toBe(6500);
    });

    it('should reject client-injected price tampering or extra fields in quote payload', async () => {
      const res = await request(app)
        .post('/api/v1/orders/quote')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          addressId: customerAAddress._id.toString(),
          priceCents: 100,
          shippingCents: 0
        });

      expect(res.status).toBe(422);
      expect(res.body.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('3. Order Creation (COD), Inventory Reservation, and ACID Guarantees', () => {
    it('should successfully place a COD order, reserve inventory, clear cart, and record audit movement', async () => {
      const product = await Product.create({
        sku: 'DRIP-TEE-WHT',
        slug: 'drip-tee-white',
        name: 'Drip Tee White',
        description: 'Classic oversized tee',
        category: activeCategory._id,
        priceCents: 2500,
        status: 'published',
        stock: { physical: 10, reserved: 0, available: 10 }
      });

      await Cart.create({
        user: customerAUser._id,
        items: [{ product: product._id, quantity: 2 }]
      });

      const idemKey = `order-idem-${crypto.randomUUID()}`;

      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerAToken}`)
        .set('Idempotency-Key', idemKey)
        .send({
          addressId: customerAAddress._id.toString(),
          paymentMethod: 'cod'
        });

      expect(res.status).toBe(201);
      const order = res.body.data;
      expect(order.orderReference).toMatch(/^ORD-\d{8}-[A-Z0-9]{6}$/);
      expect(order.orderStatus).toBe('confirmed');
      expect(order.paymentMethod).toBe('cod');
      expect(order.paymentStatus).toBe('cod_due');
      expect(order.subtotalCents).toBe(5000);
      expect(order.shippingCents).toBe(0); // 5000 >= 5000 threshold
      expect(order.totalCents).toBe(5000);
      expect(order.items).toHaveLength(1);
      expect(order.items[0].sku).toBe('DRIP-TEE-WHT');
      expect(order.items[0].quantity).toBe(2);
      expect(order.shippingAddress.recipientName).toBe('Alice Customer');

      // Verify product stock invariant: physical: 10, reserved: 2, available: 8
      const updatedProduct = await Product.findById(product._id);
      expect(updatedProduct.stock.physical).toBe(10);
      expect(updatedProduct.stock.reserved).toBe(2);
      expect(updatedProduct.stock.available).toBe(8);
      expect(updatedProduct.stock.available).toBe(
        updatedProduct.stock.physical - updatedProduct.stock.reserved
      );

      // Verify payment document
      const payment = await Payment.findOne({ order: order._id });
      expect(payment).toBeTruthy();
      expect(payment.provider).toBe('cod');
      expect(payment.status).toBe('cod_due');
      expect(payment.amountCents).toBe(5000);

      // Verify inventory movement
      const movements = await InventoryMovement.find({ orderReference: order.orderReference });
      expect(movements).toHaveLength(1);
      expect(movements[0].movementType).toBe('reservation');
      expect(movements[0].quantityDelta).toBe(-2);
      expect(movements[0].previousAvailable).toBe(10);
      expect(movements[0].newAvailable).toBe(8);
      expect(movements[0].previousReserved).toBe(0);
      expect(movements[0].newReserved).toBe(2);

      // Verify customer cart was cleared
      const updatedCart = await Cart.findOne({ user: customerAUser._id });
      expect(updatedCart.items).toHaveLength(0);
    });

    it('should safely return existing order when retrying with identical Idempotency-Key and payload', async () => {
      const product = await Product.create({
        sku: 'DRIP-SWEATSHIRT',
        slug: 'drip-sweatshirt',
        name: 'Drip Sweatshirt',
        description: 'Cotton crewneck',
        category: activeCategory._id,
        priceCents: 4000,
        status: 'published',
        stock: { physical: 10, reserved: 0, available: 10 }
      });

      await Cart.create({
        user: customerAUser._id,
        items: [{ product: product._id, quantity: 1 }]
      });

      const idemKey = `idem-test-replay-${crypto.randomUUID()}`;

      // First request
      const res1 = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerAToken}`)
        .set('Idempotency-Key', idemKey)
        .send({
          addressId: customerAAddress._id.toString(),
          paymentMethod: 'cod'
        });

      expect(res1.status).toBe(201);
      const originalRef = res1.body.data.orderReference;

      // Replay identical request
      const res2 = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerAToken}`)
        .set('Idempotency-Key', idemKey)
        .send({
          addressId: customerAAddress._id.toString(),
          paymentMethod: 'cod'
        });

      expect(res2.status).toBe(200);
      expect(res2.body.data.orderReference).toBe(originalRef);

      // Verify stock was only deducted once
      const p = await Product.findById(product._id);
      expect(p.stock.reserved).toBe(1);
      expect(p.stock.available).toBe(9);
    });

    it('should reject reused Idempotency-Key with different payload with 409 Conflict', async () => {
      const product = await Product.create({
        sku: 'DRIP-SOCKS-SET',
        slug: 'drip-socks-set',
        name: 'Drip Socks Set',
        description: '3-pack socks',
        category: activeCategory._id,
        priceCents: 1500,
        status: 'published',
        stock: { physical: 10, reserved: 0, available: 10 }
      });

      await Cart.create({
        user: customerAUser._id,
        items: [{ product: product._id, quantity: 1 }]
      });

      const idemKey = `idem-conflict-${crypto.randomUUID()}`;

      // First request
      await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerAToken}`)
        .set('Idempotency-Key', idemKey)
        .send({
          addressId: customerAAddress._id.toString(),
          paymentMethod: 'cod'
        });

      // Second request reusing same key with different paymentMethod
      const resConflict = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerAToken}`)
        .set('Idempotency-Key', idemKey)
        .send({
          addressId: customerAAddress._id.toString(),
          paymentMethod: 'online'
        });

      expect(resConflict.status).toBe(409);
      expect(resConflict.body.error?.code).toBe('IDEMPOTENCY_CONFLICT');
    });

    it('should roll back all mutations if order placement fails midway', async () => {
      const product = await Product.create({
        sku: 'DRIP-LIMITED-TEE',
        slug: 'drip-limited-tee',
        name: 'Limited Tee',
        description: 'Rare drop',
        category: activeCategory._id,
        priceCents: 3000,
        status: 'published',
        stock: { physical: 1, reserved: 0, available: 1 }
      });

      // Cart requests 2 units, but available stock is only 1
      await Cart.create({
        user: customerAUser._id,
        items: [{ product: product._id, quantity: 2 }]
      });

      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerAToken}`)
        .set('Idempotency-Key', `idem-fail-${crypto.randomUUID()}`)
        .send({
          addressId: customerAAddress._id.toString(),
          paymentMethod: 'cod'
        });

      expect(res.status).toBe(409);
      expect(res.body.error?.code).toBe('INSUFFICIENT_STOCK');

      // Verify rollback: stock remains untouched
      const p = await Product.findById(product._id);
      expect(p.stock.physical).toBe(1);
      expect(p.stock.reserved).toBe(0);
      expect(p.stock.available).toBe(1);

      // Verify no order or movement was created
      const orders = await Order.find({});
      expect(orders).toHaveLength(0);
      const movements = await InventoryMovement.find({});
      expect(movements).toHaveLength(0);

      // Verify cart was not cleared
      const cart = await Cart.findOne({ user: customerAUser._id });
      expect(cart.items).toHaveLength(1);
    });

    it('should prevent overselling when two customers race for the last remaining unit', async () => {
      const product = await Product.create({
        sku: 'DRIP-LAST-ONE-DROP',
        slug: 'drip-last-one-drop',
        name: 'Last Unit Drop',
        description: 'Only 1 left',
        category: activeCategory._id,
        priceCents: 5000,
        status: 'published',
        stock: { physical: 1, reserved: 0, available: 1 }
      });

      // Customer A cart has 1 unit
      await Cart.create({
        user: customerAUser._id,
        items: [{ product: product._id, quantity: 1 }]
      });

      // Customer B cart has 1 unit
      await Cart.create({
        user: customerBUser._id,
        items: [{ product: product._id, quantity: 1 }]
      });

      // Execute parallel order placements
      const [resA, resB] = await Promise.all([
        request(app)
          .post('/api/v1/orders')
          .set('Authorization', `Bearer ${customerAToken}`)
          .set('Idempotency-Key', `race-a-${crypto.randomUUID()}`)
          .send({ addressId: customerAAddress._id.toString(), paymentMethod: 'cod' }),
        request(app)
          .post('/api/v1/orders')
          .set('Authorization', `Bearer ${customerBToken}`)
          .set('Idempotency-Key', `race-b-${crypto.randomUUID()}`)
          .send({ addressId: customerBAddress._id.toString(), paymentMethod: 'cod' })
      ]);

      const statuses = [resA.status, resB.status];
      expect(statuses).toContain(201);
      expect(statuses).toContain(409); // Exactly one succeeds, one receives conflict

      // Verify zero overselling: stock.available = 0, stock.reserved = 1
      const finalProduct = await Product.findById(product._id);
      expect(finalProduct.stock.physical).toBe(1);
      expect(finalProduct.stock.reserved).toBe(1);
      expect(finalProduct.stock.available).toBe(0);
    });
  });

  describe('4. Customer Order History and Details (Anti-BOLA Scoping)', () => {
    it('should list only the authenticated customer orders with pagination', async () => {
      const product = await Product.create({
        sku: 'DRIP-BEANIE-GRN',
        slug: 'drip-beanie-green',
        name: 'Green Beanie',
        description: 'Ribbed knit',
        category: activeCategory._id,
        priceCents: 2000,
        status: 'published',
        stock: { physical: 20, reserved: 0, available: 20 }
      });

      // Place 2 orders for Customer A
      await Cart.findOneAndUpdate(
        { user: customerAUser._id },
        { $set: { items: [{ product: product._id, quantity: 1 }] } },
        { upsert: true }
      );
      await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerAToken}`)
        .set('Idempotency-Key', `idem-history-1-${crypto.randomUUID()}`)
        .send({ addressId: customerAAddress._id.toString(), paymentMethod: 'cod' });

      await Cart.findOneAndUpdate(
        { user: customerAUser._id },
        { $set: { items: [{ product: product._id, quantity: 2 }] } },
        { upsert: true }
      );
      await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerAToken}`)
        .set('Idempotency-Key', `idem-history-2-${crypto.randomUUID()}`)
        .send({ addressId: customerAAddress._id.toString(), paymentMethod: 'cod' });

      // Place 1 order for Customer B
      await Cart.findOneAndUpdate(
        { user: customerBUser._id },
        { $set: { items: [{ product: product._id, quantity: 1 }] } },
        { upsert: true }
      );
      await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerBToken}`)
        .set('Idempotency-Key', `idem-history-b-${crypto.randomUUID()}`)
        .send({ addressId: customerBAddress._id.toString(), paymentMethod: 'cod' });

      // Fetch Customer A history
      const resA = await request(app)
        .get('/api/v1/orders/my-orders')
        .set('Authorization', `Bearer ${customerAToken}`);

      expect(resA.status).toBe(200);
      expect(resA.body.data).toHaveLength(2);
      expect(resA.body.meta.total).toBe(2);

      // Fetch Customer B history
      const resB = await request(app)
        .get('/api/v1/orders/my-orders')
        .set('Authorization', `Bearer ${customerBToken}`);

      expect(resB.status).toBe(200);
      expect(resB.body.data).toHaveLength(1);
      expect(resB.body.meta.total).toBe(1);
    });

    it('should allow customer to view owned order details, but return 404 for another customer order', async () => {
      const product = await Product.create({
        sku: 'DRIP-BELT-BLK',
        slug: 'drip-belt-black',
        name: 'Drip Webbing Belt',
        description: 'Military style',
        category: activeCategory._id,
        priceCents: 1800,
        status: 'published',
        stock: { physical: 10, reserved: 0, available: 10 }
      });

      await Cart.create({ user: customerAUser._id, items: [{ product: product._id, quantity: 1 }] });
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerAToken}`)
        .set('Idempotency-Key', `idem-detail-${crypto.randomUUID()}`)
        .send({ addressId: customerAAddress._id.toString(), paymentMethod: 'cod' });

      const orderRef = orderRes.body.data.orderReference;

      // Customer A views own order -> 200 OK
      const resOwn = await request(app)
        .get(`/api/v1/orders/my-orders/${orderRef}`)
        .set('Authorization', `Bearer ${customerAToken}`);

      expect(resOwn.status).toBe(200);
      expect(resOwn.body.data.order.orderReference).toBe(orderRef);
      expect(resOwn.body.data.payment).toBeTruthy();

      // Customer B attempts to view Customer A order -> 404 NOT FOUND
      const resForeign = await request(app)
        .get(`/api/v1/orders/my-orders/${orderRef}`)
        .set('Authorization', `Bearer ${customerBToken}`);

      expect(resForeign.status).toBe(404);
      expect(resForeign.body.error?.code).toBe('ORDER_NOT_FOUND');
    });
  });

  describe('5. Order Cancellation and Stock Restocking', () => {
    it('should cancel an eligible order, release reserved stock, and record release audit movement', async () => {
      const product = await Product.create({
        sku: 'DRIP-CARGO-PANTS',
        slug: 'drip-cargo-pants',
        name: 'Cargo Pants',
        description: 'Multi-pocket cargo',
        category: activeCategory._id,
        priceCents: 7500,
        status: 'published',
        stock: { physical: 10, reserved: 0, available: 10 }
      });

      await Cart.create({ user: customerAUser._id, items: [{ product: product._id, quantity: 2 }] });
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerAToken}`)
        .set('Idempotency-Key', `idem-cancel-${crypto.randomUUID()}`)
        .send({ addressId: customerAAddress._id.toString(), paymentMethod: 'cod' });

      const orderRef = orderRes.body.data.orderReference;

      // Verify stock was reserved: reserved: 2, available: 8
      let p = await Product.findById(product._id);
      expect(p.stock.reserved).toBe(2);
      expect(p.stock.available).toBe(8);

      // Cancel order
      const cancelRes = await request(app)
        .post(`/api/v1/orders/my-orders/${orderRef}/cancel`)
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ reason: 'Changed my mind' });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.orderStatus).toBe('cancelled');
      expect(cancelRes.body.data.isStockRestocked).toBe(true);
      expect(cancelRes.body.data.cancellation.reason).toBe('Changed my mind');

      // Verify stock was released exactly once: reserved: 0, available: 10
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
      expect(releaseMovement.previousAvailable).toBe(8);
      expect(releaseMovement.newAvailable).toBe(10);
      expect(releaseMovement.previousReserved).toBe(2);
      expect(releaseMovement.newReserved).toBe(0);
    });

    it('should reject repeated cancellation attempts and never release stock twice', async () => {
      const product = await Product.create({
        sku: 'DRIP-WINDBREAKER',
        slug: 'drip-windbreaker',
        name: 'Windbreaker',
        description: 'Lightweight jacket',
        category: activeCategory._id,
        priceCents: 6000,
        status: 'published',
        stock: { physical: 5, reserved: 0, available: 5 }
      });

      await Cart.create({ user: customerAUser._id, items: [{ product: product._id, quantity: 1 }] });
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerAToken}`)
        .set('Idempotency-Key', `idem-repeat-cancel-${crypto.randomUUID()}`)
        .send({ addressId: customerAAddress._id.toString(), paymentMethod: 'cod' });

      const orderRef = orderRes.body.data.orderReference;

      // First cancel succeeds
      await request(app)
        .post(`/api/v1/orders/my-orders/${orderRef}/cancel`)
        .set('Authorization', `Bearer ${customerAToken}`)
        .send();

      // Second cancel should be rejected with 409 Conflict
      const secondCancel = await request(app)
        .post(`/api/v1/orders/my-orders/${orderRef}/cancel`)
        .set('Authorization', `Bearer ${customerAToken}`)
        .send();

      expect(secondCancel.status).toBe(409);
      expect(secondCancel.body.error?.code).toBe('ORDER_ALREADY_CANCELLED');

      // Verify stock was not released a second time (must remain at original 5 available)
      const p = await Product.findById(product._id);
      expect(p.stock.physical).toBe(5);
      expect(p.stock.reserved).toBe(0);
      expect(p.stock.available).toBe(5);
    });

    it('should prevent Customer B from cancelling Customer A order', async () => {
      const product = await Product.create({
        sku: 'DRIP-FLANNEL',
        slug: 'drip-flannel',
        name: 'Plaid Flannel',
        description: 'Brushed cotton',
        category: activeCategory._id,
        priceCents: 4500,
        status: 'published',
        stock: { physical: 5, reserved: 0, available: 5 }
      });

      await Cart.create({ user: customerAUser._id, items: [{ product: product._id, quantity: 1 }] });
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerAToken}`)
        .set('Idempotency-Key', `idem-cross-cancel-${crypto.randomUUID()}`)
        .send({ addressId: customerAAddress._id.toString(), paymentMethod: 'cod' });

      const orderRef = orderRes.body.data.orderReference;

      // Customer B tries to cancel Customer A's order -> 404 NOT FOUND
      const cancelRes = await request(app)
        .post(`/api/v1/orders/my-orders/${orderRef}/cancel`)
        .set('Authorization', `Bearer ${customerBToken}`)
        .send();

      expect(cancelRes.status).toBe(404);
      expect(cancelRes.body.error?.code).toBe('ORDER_NOT_FOUND');
    });

    it('should reject cancellation of orders in processing, shipped, or delivered status', async () => {
      const product = await Product.create({
        sku: 'DRIP-BACKPACK',
        slug: 'drip-backpack',
        name: 'Commuter Backpack',
        description: 'Durable nylon',
        category: activeCategory._id,
        priceCents: 8000,
        status: 'published',
        stock: { physical: 5, reserved: 0, available: 5 }
      });

      await Cart.create({ user: customerAUser._id, items: [{ product: product._id, quantity: 1 }] });
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerAToken}`)
        .set('Idempotency-Key', `idem-status-check-${crypto.randomUUID()}`)
        .send({ addressId: customerAAddress._id.toString(), paymentMethod: 'cod' });

      const orderRef = orderRes.body.data.orderReference;

      // Simulate administrative advancement to processing
      await Order.findOneAndUpdate({ orderReference: orderRef }, { $set: { orderStatus: 'processing' } });

      const cancelRes = await request(app)
        .post(`/api/v1/orders/my-orders/${orderRef}/cancel`)
        .set('Authorization', `Bearer ${customerAToken}`)
        .send();

      expect(cancelRes.status).toBe(400);
      expect(cancelRes.body.error?.code).toBe('ORDER_NOT_CANCELLABLE');
    });
  });
});
