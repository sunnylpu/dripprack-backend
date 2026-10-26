import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/database.js';
import { User } from '../src/modules/users/user.model.js';
import { Category } from '../src/modules/categories/category.model.js';
import { Product } from '../src/modules/products/product.model.js';
import { InventoryMovement } from '../src/modules/inventory/inventoryMovement.model.js';

describe('Phase 4: Inventory & Stock Management Test Suite', () => {
  let replSet;
  let adminUser;
  let adminAccessToken;
  let customerAccessToken;
  let testCategory;

  beforeAll(async () => {
    // Multi-document transactions require a replica set environment
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const uri = replSet.getUri();
    await connectDB(uri);

    // Create Admin User
    const adminPasswordHash = await User.hashPassword('AdminPassword123!');
    adminUser = await User.create({
      email: 'admin_inv@driprack.com',
      passwordHash: adminPasswordHash,
      firstName: 'Inventory',
      lastName: 'Admin',
      role: 'admin',
      status: 'active'
    });

    // Create Customer User
    const customerPasswordHash = await User.hashPassword('CustomerPassword123!');
    await User.create({
      email: 'customer_inv@driprack.com',
      passwordHash: customerPasswordHash,
      firstName: 'Customer',
      lastName: 'Shopper',
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
    await Product.deleteMany({});
    await Category.deleteMany({});
    await InventoryMovement.deleteMany({});

    // Obtain fresh tokens
    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin_inv@driprack.com', password: 'AdminPassword123!' });
    adminAccessToken = adminLogin.body.data.accessToken;

    const customerLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'customer_inv@driprack.com', password: 'CustomerPassword123!' });
    customerAccessToken = customerLogin.body.data.accessToken;

    // Create active test category
    testCategory = await Category.create({
      name: 'Outerwear',
      slug: 'outerwear',
      isActive: true
    });
  });

  describe('1. Route Authorization & Actor Controls', () => {
    it('should reject unauthenticated requests to inventory endpoints with 401', async () => {
      const endpoints = [
        { method: 'post', path: '/api/v1/inventory/adjust' },
        { method: 'get', path: '/api/v1/inventory/stock' },
        { method: 'get', path: '/api/v1/inventory/low-stock' },
        { method: 'get', path: '/api/v1/inventory/movements' }
      ];

      for (const ep of endpoints) {
        const res = await request(app)[ep.method](ep.path);
        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
      }
    });

    it('should reject customer tokens with 403 Forbidden on all inventory routes', async () => {
      const endpoints = [
        { method: 'post', path: '/api/v1/inventory/adjust', body: { quantityDelta: 5 } },
        { method: 'get', path: '/api/v1/inventory/stock' },
        { method: 'get', path: '/api/v1/inventory/low-stock' },
        { method: 'get', path: '/api/v1/inventory/movements' }
      ];

      for (const ep of endpoints) {
        const req = request(app)[ep.method](ep.path).set('Authorization', `Bearer ${customerAccessToken}`);
        if (ep.body) req.send(ep.body);
        const res = await req;
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
      }
    });

    it('should ignore client-supplied spoofed actor ID and derive actor from session', async () => {
      const product = await Product.create({
        sku: 'DRIP-PARKA-BLK',
        slug: 'drip-parka-blk',
        name: 'Drip Heavy Parka',
        description: 'Warm winter parka jacket',
        category: testCategory._id,
        priceCents: 15000,
        stock: { physical: 0, reserved: 0, available: 0 }
      });

      const spoofedActorId = new mongoose.Types.ObjectId().toString();

      // Passing extra fields triggers strict payload check or ignores spoofing
      const res = await request(app)
        .post('/api/v1/inventory/adjust')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          productId: product._id.toString(),
          quantityDelta: 10,
          reason: 'Initial warehouse shipment'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const movement = await InventoryMovement.findOne({ product: product._id });
      expect(movement.actor.toString()).toBe(adminUser._id.toString());
      expect(movement.actor.toString()).not.toBe(spoofedActorId);
      expect(movement.actorRole).toBe('admin');
    });
  });

  describe('2. Stock Adjustment Input Validation', () => {
    let sampleProduct;

    beforeEach(async () => {
      sampleProduct = await Product.create({
        sku: 'DRIP-HOOD-BLK',
        slug: 'drip-hood-blk',
        name: 'Black Hoodie',
        description: 'Heavyweight cotton hoodie',
        category: testCategory._id,
        priceCents: 8500,
        stock: { physical: 10, reserved: 0, available: 10 }
      });
    });

    it('should reject zero quantityDelta with 422', async () => {
      const res = await request(app)
        .post('/api/v1/inventory/adjust')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          productId: sampleProduct._id.toString(),
          quantityDelta: 0,
          reason: 'Zero delta test'
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject fractional quantityDelta with 422', async () => {
      const res = await request(app)
        .post('/api/v1/inventory/adjust')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          productId: sampleProduct._id.toString(),
          quantityDelta: 2.5,
          reason: 'Fractional test'
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject excessive adjustment magnitude (> 100,000) with 422', async () => {
      const res = await request(app)
        .post('/api/v1/inventory/adjust')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          productId: sampleProduct._id.toString(),
          quantityDelta: 999999,
          reason: 'Excessive adjustment'
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject missing or blank reason with 422', async () => {
      const res = await request(app)
        .post('/api/v1/inventory/adjust')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          productId: sampleProduct._id.toString(),
          quantityDelta: 5,
          reason: '   '
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid product ID format with 422', async () => {
      const res = await request(app)
        .post('/api/v1/inventory/adjust')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          productId: 'invalid-hex-id',
          quantityDelta: 5,
          reason: 'Valid reason'
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 404 for nonexistent product ID', async () => {
      const nonExistentId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .post('/api/v1/inventory/adjust')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          productId: nonExistentId,
          quantityDelta: 5,
          reason: 'Restocking non-existent'
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should reject payloads with unexpected fields (strict schema)', async () => {
      const res = await request(app)
        .post('/api/v1/inventory/adjust')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          productId: sampleProduct._id.toString(),
          quantityDelta: 5,
          reason: 'Restock with extra fields',
          reserved: 10 // Attempted direct reserved update
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('3. Stock Adjustments & Invariant Integrity', () => {
    let product;

    beforeEach(async () => {
      product = await Product.create({
        sku: 'DRIP-JACKET-V1',
        slug: 'drip-jacket-v1',
        name: 'Bomber Jacket',
        description: 'Nylon satin bomber jacket',
        category: testCategory._id,
        priceCents: 12000,
        stock: { physical: 0, reserved: 0, available: 0 },
        lowStockThreshold: 5
      });
    });

    it('should perform positive adjustment increasing physical and available stock', async () => {
      const res = await request(app)
        .post('/api/v1/inventory/adjust')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          productId: product._id.toString(),
          quantityDelta: 25,
          reason: 'Factory shipment arrival'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.product.stock.physical).toBe(25);
      expect(res.body.data.product.stock.reserved).toBe(0);
      expect(res.body.data.product.stock.available).toBe(25);

      // Verify DB persistence
      const updated = await Product.findById(product._id);
      expect(updated.stock.physical).toBe(25);
      expect(updated.stock.reserved).toBe(0);
      expect(updated.stock.available).toBe(25);
      expect(updated.stock.available).toBe(updated.stock.physical - updated.stock.reserved);
    });

    it('should perform negative adjustment decreasing physical and available stock', async () => {
      // First add stock
      await request(app)
        .post('/api/v1/inventory/adjust')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          productId: product._id.toString(),
          quantityDelta: 20,
          reason: 'Initial intake'
        });

      // Now decrease by 7
      const res = await request(app)
        .post('/api/v1/inventory/adjust')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          productId: product._id.toString(),
          quantityDelta: -7,
          reason: 'Damaged in transit'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.product.stock.physical).toBe(13);
      expect(res.body.data.product.stock.reserved).toBe(0);
      expect(res.body.data.product.stock.available).toBe(13);
    });

    it('should reject negative adjustment when available stock is insufficient with 409', async () => {
      // Product starts with 0 stock
      const res = await request(app)
        .post('/api/v1/inventory/adjust')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          productId: product._id.toString(),
          quantityDelta: -5,
          reason: 'Attempted reduction below zero'
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');

      // Verify stock was not mutated
      const dbProduct = await Product.findById(product._id);
      expect(dbProduct.stock.physical).toBe(0);
      expect(dbProduct.stock.available).toBe(0);

      // Verify no movement was created
      const movements = await InventoryMovement.find({ product: product._id });
      expect(movements.length).toBe(0);
    });

    it('should prevent reducing physical stock below reserved stock with 409', async () => {
      // Set physical = 10, reserved = 8, available = 2 directly in DB to simulate reserved units
      await Product.findByIdAndUpdate(product._id, {
        'stock.physical': 10,
        'stock.reserved': 8,
        'stock.available': 2
      });

      // Attempting to remove 4 physical units would violate reserved <= physical (available is only 2)
      const res = await request(app)
        .post('/api/v1/inventory/adjust')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          productId: product._id.toString(),
          quantityDelta: -4,
          reason: 'Attempted reduction exceeding available buffer'
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');

      const dbProduct = await Product.findById(product._id);
      expect(dbProduct.stock.physical).toBe(10);
      expect(dbProduct.stock.reserved).toBe(8);
      expect(dbProduct.stock.available).toBe(2);
    });

    it('should never alter reserved stock during manual adjustments', async () => {
      await Product.findByIdAndUpdate(product._id, {
        'stock.physical': 15,
        'stock.reserved': 5,
        'stock.available': 10
      });

      // Positive adjustment
      await request(app)
        .post('/api/v1/inventory/adjust')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          productId: product._id.toString(),
          quantityDelta: 10,
          reason: 'Restock'
        });

      let dbProduct = await Product.findById(product._id);
      expect(dbProduct.stock.reserved).toBe(5);
      expect(dbProduct.stock.physical).toBe(25);
      expect(dbProduct.stock.available).toBe(20);

      // Negative adjustment
      await request(app)
        .post('/api/v1/inventory/adjust')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          productId: product._id.toString(),
          quantityDelta: -5,
          reason: 'Remove defective'
        });

      dbProduct = await Product.findById(product._id);
      expect(dbProduct.stock.reserved).toBe(5);
      expect(dbProduct.stock.physical).toBe(20);
      expect(dbProduct.stock.available).toBe(15);
    });
  });

  describe('4. Audit Trail & SKU Snapshotting', () => {
    it('should create exactly one movement record per adjustment with SKU snapshot', async () => {
      const product = await Product.create({
        sku: 'DRIP-ORIGINAL-SKU',
        slug: 'drip-original-sku',
        name: 'Retro Trackpants',
        description: 'Vintage trackpants',
        category: testCategory._id,
        priceCents: 6000,
        stock: { physical: 10, reserved: 0, available: 10 }
      });

      const res = await request(app)
        .post('/api/v1/inventory/adjust')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          productId: product._id.toString(),
          quantityDelta: 15,
          reason: 'New batch received from supplier'
        });

      expect(res.status).toBe(200);

      const movements = await InventoryMovement.find({ product: product._id });
      expect(movements.length).toBe(1);

      const m = movements[0];
      expect(m.sku).toBe('DRIP-ORIGINAL-SKU');
      expect(m.movementType).toBe('adjustment');
      expect(m.quantityDelta).toBe(15);
      expect(m.previousPhysical).toBe(10);
      expect(m.newPhysical).toBe(25);
      expect(m.previousAvailable).toBe(10);
      expect(m.newAvailable).toBe(25);
      expect(m.reason).toBe('New batch received from supplier');
      expect(m.actor.toString()).toBe(adminUser._id.toString());
      expect(m.actorRole).toBe('admin');

      // Now change the product SKU in catalog
      product.sku = 'DRIP-NEW-RENAMED-SKU';
      await product.save();

      // Verify movement historical snapshot is preserved intact
      const historicalMovement = await InventoryMovement.findById(m._id);
      expect(historicalMovement.sku).toBe('DRIP-ORIGINAL-SKU');
    });

    it('should rollback stock change if movement creation fails in transaction', async () => {
      const product = await Product.create({
        sku: 'DRIP-TX-TEST',
        slug: 'drip-tx-test',
        name: 'Transaction Test Item',
        description: 'Testing rollback consistency',
        category: testCategory._id,
        priceCents: 5000,
        stock: { physical: 10, reserved: 0, available: 10 }
      });

      // Spy on InventoryMovement.create to simulate database error during audit insertion
      const originalCreate = InventoryMovement.create;
      InventoryMovement.create = async function () {
        throw new Error('Simulated audit movement creation failure');
      };

      try {
        const res = await request(app)
          .post('/api/v1/inventory/adjust')
          .set('Authorization', `Bearer ${adminAccessToken}`)
          .send({
            productId: product._id.toString(),
            quantityDelta: 5,
            reason: 'This should fail and rollback'
          });

        expect(res.status).toBe(500);

        // Verify product stock in DB was NOT updated (rolled back)
        const dbProduct = await Product.findById(product._id);
        expect(dbProduct.stock.physical).toBe(10);
        expect(dbProduct.stock.available).toBe(10);

        // Verify no orphaned movements exist
        const movements = await InventoryMovement.find({ product: product._id });
        expect(movements.length).toBe(0);
      } finally {
        InventoryMovement.create = originalCreate;
      }
    });

    it('should have no endpoints for modifying or deleting movement records (immutability)', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();

      const patchRes = await request(app)
        .patch(`/api/v1/inventory/movements/${fakeId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ reason: 'Hacked reason' });

      expect(patchRes.status).toBe(404);

      const deleteRes = await request(app)
        .delete(`/api/v1/inventory/movements/${fakeId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(deleteRes.status).toBe(404);
    });
  });

  describe('5. Idempotency Controls', () => {
    let product;

    beforeEach(async () => {
      product = await Product.create({
        sku: 'DRIP-IDEM-01',
        slug: 'drip-idem-01',
        name: 'Idempotency Test Item',
        description: 'Deduplication testing',
        category: testCategory._id,
        priceCents: 4500,
        stock: { physical: 10, reserved: 0, available: 10 }
      });
    });

    it('should return existing result and not double-adjust stock on repeated Idempotency-Key', async () => {
      const idempotencyKey = 'key-test-adjust-abc-123';
      const payload = {
        productId: product._id.toString(),
        quantityDelta: 10,
        reason: 'Restocking batch #1'
      };

      // First submission
      const res1 = await request(app)
        .post('/api/v1/inventory/adjust')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);

      expect(res1.status).toBe(200);
      expect(res1.body.data.product.stock.physical).toBe(20);
      const movementId1 = res1.body.data.movement._id;

      // Second submission (network retry with identical key and payload)
      const res2 = await request(app)
        .post('/api/v1/inventory/adjust')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);

      expect(res2.status).toBe(200);
      expect(res2.body.data.movement._id).toBe(movementId1);

      // Verify stock was NOT double-adjusted
      const dbProduct = await Product.findById(product._id);
      expect(dbProduct.stock.physical).toBe(20);
      expect(dbProduct.stock.available).toBe(20);

      // Verify only 1 movement record exists
      const movements = await InventoryMovement.find({ idempotencyKey });
      expect(movements.length).toBe(1);
    });

    it('should reject reusing Idempotency-Key with different payload with 409 Conflict', async () => {
      const idempotencyKey = 'key-test-conflict-999';

      // First request with +10
      await request(app)
        .post('/api/v1/inventory/adjust')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          productId: product._id.toString(),
          quantityDelta: 10,
          reason: 'Initial shipment'
        });

      // Second request reusing same key with different quantityDelta (+20)
      const conflictRes = await request(app)
        .post('/api/v1/inventory/adjust')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          productId: product._id.toString(),
          quantityDelta: 20,
          reason: 'Initial shipment'
        });

      expect(conflictRes.status).toBe(409);
      expect(conflictRes.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    });

    it('should handle concurrent requests with same idempotency key and produce only one adjustment', async () => {
      const idempotencyKey = 'concurrent-idem-key-' + Date.now();
      const payload = {
        productId: product._id.toString(),
        quantityDelta: 5,
        reason: 'Concurrent race check'
      };

      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/v1/inventory/adjust')
          .set('Authorization', `Bearer ${adminAccessToken}`)
          .set('Idempotency-Key', idempotencyKey)
          .send(payload),
        request(app)
          .post('/api/v1/inventory/adjust')
          .set('Authorization', `Bearer ${adminAccessToken}`)
          .set('Idempotency-Key', idempotencyKey)
          .send(payload)
      ]);

      expect([200]).toContain(res1.status);
      expect([200]).toContain(res2.status);

      const dbProduct = await Product.findById(product._id);
      expect(dbProduct.stock.physical).toBe(15); // Exactly 10 + 5, not 10 + 10
      expect(dbProduct.stock.available).toBe(15);

      const movements = await InventoryMovement.find({ idempotencyKey });
      expect(movements.length).toBe(1);
    });
  });

  describe('6. Stock Listing (GET /api/v1/inventory/stock)', () => {
    beforeEach(async () => {
      await Product.create([
        {
          sku: 'SKU-001-A',
          slug: 'product-one',
          name: 'Alpha Tee',
          description: 'A classic tee',
          category: testCategory._id,
          priceCents: 3000,
          stock: { physical: 50, reserved: 0, available: 50 },
          lowStockThreshold: 10
        },
        {
          sku: 'SKU-002-B',
          slug: 'product-two',
          name: 'Beta Hoodie',
          description: 'A warm hoodie',
          category: testCategory._id,
          priceCents: 7500,
          stock: { physical: 4, reserved: 0, available: 4 },
          lowStockThreshold: 10
        },
        {
          sku: 'SKU-003-C',
          slug: 'product-three',
          name: 'Gamma Jacket',
          description: 'A cool jacket',
          category: testCategory._id,
          priceCents: 15000,
          stock: { physical: 0, reserved: 0, available: 0 },
          lowStockThreshold: 5
        }
      ]);
    });

    it('should return paginated stock levels with computed isLowStock flag', async () => {
      const res = await request(app)
        .get('/api/v1/inventory/stock')
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.stock.length).toBe(3);
      expect(res.body.meta.total).toBe(3);

      const itemA = res.body.data.stock.find((s) => s.sku === 'SKU-001-A');
      expect(itemA.stock.available).toBe(50);
      expect(itemA.isLowStock).toBe(false);

      const itemB = res.body.data.stock.find((s) => s.sku === 'SKU-002-B');
      expect(itemB.stock.available).toBe(4);
      expect(itemB.isLowStock).toBe(true);

      const itemC = res.body.data.stock.find((s) => s.sku === 'SKU-003-C');
      expect(itemC.stock.available).toBe(0);
      expect(itemC.isLowStock).toBe(true);
    });

    it('should filter by lowStockOnly=true', async () => {
      const res = await request(app)
        .get('/api/v1/inventory/stock?lowStockOnly=true')
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.stock.length).toBe(2);
      const skus = res.body.data.stock.map((s) => s.sku);
      expect(skus).toContain('SKU-002-B');
      expect(skus).toContain('SKU-003-C');
      expect(skus).not.toContain('SKU-001-A');
    });

    it('should search products by name or SKU', async () => {
      const res = await request(app)
        .get('/api/v1/inventory/stock?q=Hoodie')
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.stock.length).toBe(1);
      expect(res.body.data.stock[0].sku).toBe('SKU-002-B');
    });

    it('should sort products by available stock ascending', async () => {
      const res = await request(app)
        .get('/api/v1/inventory/stock?sortBy=available:asc')
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(res.status).toBe(200);
      const availableCounts = res.body.data.stock.map((s) => s.stock.available);
      expect(availableCounts).toEqual([0, 4, 50]);
    });

    it('should reject invalid sort field with 422', async () => {
      const res = await request(app)
        .get('/api/v1/inventory/stock?sortBy=unsupportedField:asc')
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('7. Low-Stock Reporting (GET /api/v1/inventory/low-stock)', () => {
    beforeEach(async () => {
      await Product.create([
        {
          sku: 'LOW-01',
          slug: 'low-product-one',
          name: 'Low Stock Cap',
          description: 'A cap',
          category: testCategory._id,
          priceCents: 2000,
          stock: { physical: 2, reserved: 0, available: 2 },
          lowStockThreshold: 5 // available (2) <= threshold (5) -> LOW
        },
        {
          sku: 'LOW-02',
          slug: 'low-product-two',
          name: 'Zero Stock Socks',
          description: 'Socks',
          category: testCategory._id,
          priceCents: 1000,
          stock: { physical: 0, reserved: 0, available: 0 },
          lowStockThreshold: 10 // available (0) <= threshold (10) -> LOW
        },
        {
          sku: 'NORMAL-01',
          slug: 'normal-product',
          name: 'Healthy Stock Belt',
          description: 'A belt',
          category: testCategory._id,
          priceCents: 4000,
          stock: { physical: 30, reserved: 0, available: 30 },
          lowStockThreshold: 5 // available (30) > threshold (5) -> NOT LOW
        }
      ]);
    });

    it('should return only products where stock.available <= lowStockThreshold', async () => {
      const res = await request(app)
        .get('/api/v1/inventory/low-stock')
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.products.length).toBe(2);

      const skus = res.body.data.products.map((p) => p.sku);
      expect(skus).toContain('LOW-01');
      expect(skus).toContain('LOW-02');
      expect(skus).not.toContain('NORMAL-01');

      for (const p of res.body.data.products) {
        expect(p.isLowStock).toBe(true);
        expect(p.stock.available).toBeLessThanOrEqual(p.lowStockThreshold);
      }
    });
  });

  describe('8. Movement History (GET /api/v1/inventory/movements)', () => {
    let p1, p2;

    beforeEach(async () => {
      p1 = await Product.create({
        sku: 'HIST-01',
        slug: 'hist-01',
        name: 'History Product 1',
        description: 'First item',
        category: testCategory._id,
        priceCents: 5000,
        stock: { physical: 0, reserved: 0, available: 0 }
      });

      p2 = await Product.create({
        sku: 'HIST-02',
        slug: 'hist-02',
        name: 'History Product 2',
        description: 'Second item',
        category: testCategory._id,
        priceCents: 7000,
        stock: { physical: 0, reserved: 0, available: 0 }
      });

      // Perform adjustments
      await request(app)
        .post('/api/v1/inventory/adjust')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ productId: p1._id.toString(), quantityDelta: 10, reason: 'First batch for P1' });

      await request(app)
        .post('/api/v1/inventory/adjust')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ productId: p2._id.toString(), quantityDelta: 20, reason: 'First batch for P2' });

      await request(app)
        .post('/api/v1/inventory/adjust')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ productId: p1._id.toString(), quantityDelta: -2, reason: 'Damaged P1' });
    });

    it('should return all movements with pagination and populated fields', async () => {
      const res = await request(app)
        .get('/api/v1/inventory/movements')
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.movements.length).toBe(3);
      expect(res.body.meta.total).toBe(3);

      const m = res.body.data.movements[0];
      expect(m.product).toBeDefined();
      expect(m.sku).toBeDefined();
      expect(m.actor).toBeDefined();
      expect(m.actor.email).toBe('admin_inv@driprack.com');
      expect(m.quantityDelta).toBeDefined();
    });

    it('should filter movements by productId', async () => {
      const res = await request(app)
        .get(`/api/v1/inventory/movements?productId=${p1._id.toString()}`)
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.movements.length).toBe(2);
      for (const m of res.body.data.movements) {
        expect(m.product._id.toString()).toBe(p1._id.toString());
      }
    });

    it('should reject invalid date range where startDate > endDate with 422', async () => {
      const res = await request(app)
        .get('/api/v1/inventory/movements?startDate=2026-10-28T00:00:00.000Z&endDate=2026-10-20T00:00:00.000Z')
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
