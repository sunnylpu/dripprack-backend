import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/database.js';
import { User } from '../src/modules/users/user.model.js';
import { Category } from '../src/modules/categories/category.model.js';
import { Product } from '../src/modules/products/product.model.js';
import { Cart } from '../src/modules/carts/cart.model.js';

describe('Phase 5: Shopping Cart Management Test Suite', () => {
  let replSet;
  let customerAUser;
  let customerBUser;
  let customerAToken;
  let customerBToken;
  let adminToken;
  let activeCategory;
  let inactiveCategory;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await connectDB(replSet.getUri());

    // Create Customer A
    const passwordHashA = await User.hashPassword('CustomerPassword123!');
    customerAUser = await User.create({
      email: 'customera_cart@driprack.com',
      passwordHash: passwordHashA,
      firstName: 'Alice',
      lastName: 'Customer',
      role: 'customer',
      status: 'active'
    });

    // Create Customer B
    const passwordHashB = await User.hashPassword('CustomerPassword123!');
    customerBUser = await User.create({
      email: 'customerb_cart@driprack.com',
      passwordHash: passwordHashB,
      firstName: 'Bob',
      lastName: 'Customer',
      role: 'customer',
      status: 'active'
    });

    // Create Admin User
    const adminPasswordHash = await User.hashPassword('AdminPassword123!');
    await User.create({
      email: 'admin_cart@driprack.com',
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
    await Cart.deleteMany({});
    await Product.deleteMany({});
    await Category.deleteMany({});

    // Authenticate customers and admin
    const loginA = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'customera_cart@driprack.com', password: 'CustomerPassword123!' });
    customerAToken = loginA.body.data.accessToken;

    const loginB = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'customerb_cart@driprack.com', password: 'CustomerPassword123!' });
    customerBToken = loginB.body.data.accessToken;

    const loginAdmin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin_cart@driprack.com', password: 'AdminPassword123!' });
    adminToken = loginAdmin.body.data.accessToken;

    // Categories
    activeCategory = await Category.create({
      name: 'Active Streetwear',
      slug: 'active-streetwear',
      isActive: true
    });

    inactiveCategory = await Category.create({
      name: 'Archived Line',
      slug: 'archived-line',
      isActive: false
    });
  });

  describe('1. Role & Access Authorization', () => {
    it('should reject unauthenticated requests with 401 Unauthorized', async () => {
      const endpoints = [
        { method: 'get', path: '/api/v1/cart' },
        { method: 'post', path: '/api/v1/cart/items', body: { productId: new mongoose.Types.ObjectId(), quantity: 1 } },
        { method: 'patch', path: `/api/v1/cart/items/${new mongoose.Types.ObjectId()}`, body: { quantity: 2 } },
        { method: 'delete', path: `/api/v1/cart/items/${new mongoose.Types.ObjectId()}` },
        { method: 'delete', path: '/api/v1/cart' }
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
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('2. Empty Cart & Cart Retrieval', () => {
    it('should return empty cart representation for a new customer with 200 OK', async () => {
      const res = await request(app)
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${customerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.cart.items).toEqual([]);
      expect(res.body.data.cart.itemCount).toBe(0);
      expect(res.body.data.cart.estimatedSubtotalCents).toBe(0);
      expect(res.body.data.cart.currency).toBe('USD');
      expect(res.body.data.cart.isAuthoritative).toBe(false);
    });
  });

  describe('3. Add Items to Cart', () => {
    let product1;
    let product2;

    beforeEach(async () => {
      product1 = await Product.create({
        sku: 'DRIP-TEE-BLK',
        slug: 'drip-tee-blk',
        name: 'Drip Heavyweight Tee',
        description: 'Heavyweight streetwear t-shirt',
        category: activeCategory._id,
        priceCents: 4500,
        status: 'published',
        stock: { physical: 50, reserved: 0, available: 50 }
      });

      product2 = await Product.create({
        sku: 'DRIP-HOODIE-GRY',
        slug: 'drip-hoodie-gry',
        name: 'Grey French Terry Hoodie',
        description: 'Warm winter hoodie',
        category: activeCategory._id,
        priceCents: 8500,
        status: 'published',
        stock: { physical: 10, reserved: 0, available: 10 }
      });
    });

    it('should add a valid published product with 200 OK', async () => {
      const res = await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          productId: product1._id.toString(),
          quantity: 2
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.cart.items.length).toBe(1);
      expect(res.body.data.cart.items[0].product._id).toBe(product1._id.toString());
      expect(res.body.data.cart.items[0].quantity).toBe(2);
      expect(res.body.data.cart.items[0].unitPriceCents).toBe(4500);
      expect(res.body.data.cart.items[0].lineTotalCents).toBe(9000);
      expect(res.body.data.cart.items[0].isAvailableForPurchase).toBe(true);
      expect(res.body.data.cart.itemCount).toBe(2);
      expect(res.body.data.cart.estimatedSubtotalCents).toBe(9000);

      // Verify product stock was NOT altered
      const dbProduct = await Product.findById(product1._id);
      expect(dbProduct.stock.available).toBe(50);
      expect(dbProduct.stock.physical).toBe(50);
    });

    it('should increment existing item quantity when adding the same product again', async () => {
      // First addition: quantity 2
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ productId: product1._id.toString(), quantity: 2 });

      // Second addition: quantity 3
      const res = await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ productId: product1._id.toString(), quantity: 3 });

      expect(res.status).toBe(200);
      expect(res.body.data.cart.items.length).toBe(1); // Still exactly one line!
      expect(res.body.data.cart.items[0].quantity).toBe(5);
      expect(res.body.data.cart.itemCount).toBe(5);
      expect(res.body.data.cart.estimatedSubtotalCents).toBe(5 * 4500);
    });

    it('should reject invalid, zero, negative, and fractional quantities with 422', async () => {
      const invalidQuantities = [0, -1, -10, 1.5, 'two', null];

      for (const qty of invalidQuantities) {
        const res = await request(app)
          .post('/api/v1/cart/items')
          .set('Authorization', `Bearer ${customerAToken}`)
          .send({ productId: product1._id.toString(), quantity: qty });

        expect(res.status).toBe(422);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should reject quantity exceeding 99 with 422', async () => {
      const res = await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ productId: product1._id.toString(), quantity: 100 });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject adding nonexistent product ID with 404', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ productId: fakeId, quantity: 1 });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should reject adding draft or archived product with 409', async () => {
      const draftProduct = await Product.create({
        sku: 'DRAFT-ITEM-01',
        slug: 'draft-item-01',
        name: 'Draft Pants',
        description: 'Not published yet',
        category: activeCategory._id,
        priceCents: 6000,
        status: 'draft',
        stock: { physical: 10, reserved: 0, available: 10 }
      });

      const res = await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ productId: draftProduct._id.toString(), quantity: 1 });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PRODUCT_UNAVAILABLE');
    });

    it('should reject adding product whose category is inactive with 409', async () => {
      const inactiveCatProduct = await Product.create({
        sku: 'INACTIVE-CAT-PROD',
        slug: 'inactive-cat-prod',
        name: 'Archived Category Item',
        description: 'Item in an inactive category',
        category: inactiveCategory._id,
        priceCents: 7000,
        status: 'published',
        stock: { physical: 10, reserved: 0, available: 10 }
      });

      const res = await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ productId: inactiveCatProduct._id.toString(), quantity: 1 });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CATEGORY_INACTIVE');
    });

    it('should reject adding out of stock product with 409', async () => {
      const outOfStockProduct = await Product.create({
        sku: 'OUT-OF-STOCK-01',
        slug: 'out-of-stock-01',
        name: 'Sold Out Sneakers',
        description: 'Zero available stock',
        category: activeCategory._id,
        priceCents: 12000,
        status: 'published',
        stock: { physical: 0, reserved: 0, available: 0 }
      });

      const res = await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ productId: outOfStockProduct._id.toString(), quantity: 1 });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('OUT_OF_STOCK');
    });

    it('should reject adding quantity that exceeds current available stock with 409', async () => {
      // product2 has 10 units available
      const res = await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ productId: product2._id.toString(), quantity: 15 });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    });
  });

  describe('4. Update Quantity (PATCH /api/v1/cart/items/:productId)', () => {
    let product;

    beforeEach(async () => {
      product = await Product.create({
        sku: 'DRIP-CAP-BLK',
        slug: 'drip-cap-blk',
        name: 'Black Snapback',
        description: 'Streetwear snapback cap',
        category: activeCategory._id,
        priceCents: 3500,
        status: 'published',
        stock: { physical: 20, reserved: 0, available: 20 }
      });

      // Add to cart with quantity 2
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ productId: product._id.toString(), quantity: 2 });
    });

    it('should update quantity of existing item to 5', async () => {
      const res = await request(app)
        .patch(`/api/v1/cart/items/${product._id}`)
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ quantity: 5 });

      expect(res.status).toBe(200);
      expect(res.body.data.cart.items[0].quantity).toBe(5);
      expect(res.body.data.cart.itemCount).toBe(5);
      expect(res.body.data.cart.estimatedSubtotalCents).toBe(5 * 3500);
    });

    it('should reject updating to quantity exceeding available stock with 409', async () => {
      const res = await request(app)
        .patch(`/api/v1/cart/items/${product._id}`)
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ quantity: 25 }); // Only 20 available

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    });

    it('should return 404 when updating product not present in cart', async () => {
      const otherProduct = await Product.create({
        sku: 'OTHER-ITEM',
        slug: 'other-item',
        name: 'Other Item',
        description: 'Item not added',
        category: activeCategory._id,
        priceCents: 2000,
        status: 'published',
        stock: { physical: 10, reserved: 0, available: 10 }
      });

      const res = await request(app)
        .patch(`/api/v1/cart/items/${otherProduct._id}`)
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ quantity: 3 });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('5. Remove Item & Clear Cart', () => {
    let p1, p2;

    beforeEach(async () => {
      p1 = await Product.create({
        sku: 'P1-TEST',
        slug: 'p1-test',
        name: 'Item 1',
        description: 'Item 1 desc',
        category: activeCategory._id,
        priceCents: 2000,
        status: 'published',
        stock: { physical: 10, reserved: 0, available: 10 }
      });

      p2 = await Product.create({
        sku: 'P2-TEST',
        slug: 'p2-test',
        name: 'Item 2',
        description: 'Item 2 desc',
        category: activeCategory._id,
        priceCents: 3000,
        status: 'published',
        stock: { physical: 10, reserved: 0, available: 10 }
      });

      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ productId: p1._id.toString(), quantity: 1 });

      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ productId: p2._id.toString(), quantity: 2 });
    });

    it('should remove a single item from cart while preserving others', async () => {
      const res = await request(app)
        .delete(`/api/v1/cart/items/${p1._id}`)
        .set('Authorization', `Bearer ${customerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.cart.items.length).toBe(1);
      expect(res.body.data.cart.items[0].product._id).toBe(p2._id.toString());
      expect(res.body.data.cart.itemCount).toBe(2);
    });

    it('should remove an item even if it has become archived or out of stock', async () => {
      // Archive p1 and set out of stock
      p1.status = 'archived';
      p1.stock.physical = 0;
      p1.stock.available = 0;
      await p1.save();

      // Removal must still succeed seamlessly
      const res = await request(app)
        .delete(`/api/v1/cart/items/${p1._id}`)
        .set('Authorization', `Bearer ${customerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.cart.items.length).toBe(1);
    });

    it('should clear all items from cart (DELETE /api/v1/cart)', async () => {
      const res = await request(app)
        .delete('/api/v1/cart')
        .set('Authorization', `Bearer ${customerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.cart.items).toEqual([]);
      expect(res.body.data.cart.itemCount).toBe(0);
      expect(res.body.data.cart.estimatedSubtotalCents).toBe(0);
    });
  });

  describe('6. Real-Time Eligibility & Dynamic Pricing Reflection', () => {
    it('should dynamically reflect catalog price updates on subsequent cart reads', async () => {
      const product = await Product.create({
        sku: 'PRICE-CHANGE-TEST',
        slug: 'price-change-test',
        name: 'Leather Jacket',
        description: 'Premium leather',
        category: activeCategory._id,
        priceCents: 20000,
        status: 'published',
        stock: { physical: 5, reserved: 0, available: 5 }
      });

      // Add 2 units at $200.00 each
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ productId: product._id.toString(), quantity: 2 });

      let cartRes = await request(app)
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${customerAToken}`);
      expect(cartRes.body.data.cart.estimatedSubtotalCents).toBe(40000);

      // Admin updates product price to $250.00 (25000 cents)
      product.priceCents = 25000;
      await product.save();

      // Read cart again: must dynamically recalculate without stale prices
      cartRes = await request(app)
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${customerAToken}`);
      expect(cartRes.body.data.cart.items[0].unitPriceCents).toBe(25000);
      expect(cartRes.body.data.cart.items[0].lineTotalCents).toBe(50000);
      expect(cartRes.body.data.cart.estimatedSubtotalCents).toBe(50000);
    });

    it('should flag items as unavailable if product is unpublished or archived without deleting the line', async () => {
      const product = await Product.create({
        sku: 'DISCONTINUED-TEST',
        slug: 'discontinued-test',
        name: 'Limited Shoes',
        description: 'Sneakers',
        category: activeCategory._id,
        priceCents: 15000,
        status: 'published',
        stock: { physical: 10, reserved: 0, available: 10 }
      });

      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ productId: product._id.toString(), quantity: 1 });

      // Admin archives product
      product.status = 'archived';
      await product.save();

      const cartRes = await request(app)
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${customerAToken}`);

      expect(cartRes.status).toBe(200);
      expect(cartRes.body.data.cart.items.length).toBe(1);
      const item = cartRes.body.data.cart.items[0];
      expect(item.isAvailableForPurchase).toBe(false);
      expect(item.unavailableReason).toBe('Product is currently archived');
      // Unavailable items do NOT contribute to estimated subtotal
      expect(cartRes.body.data.cart.estimatedSubtotalCents).toBe(0);
    });
  });

  describe('7. Isolation Between Customers & Concurrency', () => {
    let sharedProduct;

    beforeEach(async () => {
      sharedProduct = await Product.create({
        sku: 'SHARED-PROD-01',
        slug: 'shared-prod-01',
        name: 'Shared Product',
        description: 'Product tested by multiple customers',
        category: activeCategory._id,
        priceCents: 5000,
        status: 'published',
        stock: { physical: 100, reserved: 0, available: 100 }
      });
    });

    it('should strictly isolate carts between Customer A and Customer B', async () => {
      // Customer A adds 2 items
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ productId: sharedProduct._id.toString(), quantity: 2 });

      // Customer B adds 5 items
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerBToken}`)
        .send({ productId: sharedProduct._id.toString(), quantity: 5 });

      // Customer A reads cart
      const resA = await request(app)
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${customerAToken}`);
      expect(resA.body.data.cart.items[0].quantity).toBe(2);

      // Customer B reads cart
      const resB = await request(app)
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${customerBToken}`);
      expect(resB.body.data.cart.items[0].quantity).toBe(5);

      // Customer A clears cart
      await request(app)
        .delete('/api/v1/cart')
        .set('Authorization', `Bearer ${customerAToken}`);

      // Customer B cart remains unaffected!
      const resBAfter = await request(app)
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${customerBToken}`);
      expect(resBAfter.body.data.cart.items.length).toBe(1);
      expect(resBAfter.body.data.cart.items[0].quantity).toBe(5);
    });

    it('should handle concurrent additions without losing increments or creating duplicate lines', async () => {
      // Send 3 concurrent add requests of 2 units each for Customer A
      const reqs = [1, 2, 3].map(() =>
        request(app)
          .post('/api/v1/cart/items')
          .set('Authorization', `Bearer ${customerAToken}`)
          .send({ productId: sharedProduct._id.toString(), quantity: 2 })
      );

      const results = await Promise.all(reqs);
      for (const res of results) {
        expect([200]).toContain(res.status);
      }

      const cartRes = await request(app)
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${customerAToken}`);

      expect(cartRes.body.data.cart.items.length).toBe(1); // No duplicate lines!
      expect(cartRes.body.data.cart.items[0].quantity).toBe(6); // Exactly 2 + 2 + 2 = 6!
    });
  });
});
