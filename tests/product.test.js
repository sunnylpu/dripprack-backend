import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/database.js';
import { User } from '../src/modules/users/user.model.js';
import { Category } from '../src/modules/categories/category.model.js';
import { Product } from '../src/modules/products/product.model.js';

describe('Phase 3: Product Catalog & Management Test Suite', () => {
  let mongoServer;
  let adminAccessToken;
  let customerAccessToken;
  let activeCategory;
  let inactiveCategory;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await connectDB(uri);

    // Create Admin User
    const adminPasswordHash = await User.hashPassword('AdminPassword123!');
    await User.create({
      email: 'admin_prod@driprack.com',
      passwordHash: adminPasswordHash,
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      status: 'active'
    });

    // Create Customer User
    const customerPasswordHash = await User.hashPassword('CustomerPassword123!');
    await User.create({
      email: 'customer_prod@driprack.com',
      passwordHash: customerPasswordHash,
      firstName: 'Jane',
      lastName: 'Customer',
      role: 'customer',
      status: 'active'
    });
  });

  afterAll(async () => {
    await disconnectDB();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await Product.deleteMany({});
    await Category.deleteMany({});

    // Seed test categories
    activeCategory = await Category.create({
      name: 'Outerwear',
      slug: 'outerwear',
      isActive: true
    });

    inactiveCategory = await Category.create({
      name: 'Discontinued Vintage',
      slug: 'discontinued-vintage',
      isActive: false
    });

    // Obtain fresh tokens
    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin_prod@driprack.com', password: 'AdminPassword123!' });
    adminAccessToken = adminLogin.body.data.accessToken;

    const customerLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'customer_prod@driprack.com', password: 'CustomerPassword123!' });
    customerAccessToken = customerLogin.body.data.accessToken;
  });

  const validProductPayload = {
    sku: 'DRIP-HOODIE-BLK-M',
    name: 'Heavyweight Boxy Hoodie',
    description: '100% French Terry cotton 450gsm heavyweight hoodie in washed onyx black.',
    priceCents: 8500, // $85.00
    compareAtPriceCents: 11000, // $110.00
    images: ['https://images.driprack.com/hoodie-front.jpg']
  };

  describe('Product Creation (POST /api/v1/products)', () => {
    it('should create a draft product with zero initial stock by default', async () => {
      const res = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          ...validProductPayload,
          category: activeCategory._id.toString()
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.product.sku).toBe('DRIP-HOODIE-BLK-M');
      expect(res.body.data.product.status).toBe('draft');
      expect(res.body.data.product.slug).toBe('heavyweight-boxy-hoodie');
      expect(res.body.data.product.priceCents).toBe(8500);

      // Verify zero stock invariant
      expect(res.body.data.product.stock.physical).toBe(0);
      expect(res.body.data.product.stock.reserved).toBe(0);
      expect(res.body.data.product.stock.available).toBe(0);
    });

    it('should prevent inventory tampering and ignore stock parameters in creation payload', async () => {
      const maliciousPayload = {
        ...validProductPayload,
        category: activeCategory._id.toString(),
        stock: {
          physical: 9999,
          reserved: 0,
          available: 9999
        }
      };

      const res = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(maliciousPayload);

      expect(res.status).toBe(201);
      expect(res.body.data.product.stock.physical).toBe(0); // Stripped & enforced to 0
      expect(res.body.data.product.stock.available).toBe(0);
    });

    it('should reject creation referencing an inactive category with 400', async () => {
      const res = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          ...validProductPayload,
          category: inactiveCategory._id.toString()
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('inactive category');
    });

    it('should reject duplicate SKU with 409 Conflict', async () => {
      await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ ...validProductPayload, category: activeCategory._id.toString() });

      const res = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          ...validProductPayload,
          name: 'Different Name Same SKU',
          category: activeCategory._id.toString()
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(res.body.error.message).toContain('SKU already exists');
    });

    it('should reject duplicate slug with 409 Conflict', async () => {
      await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ ...validProductPayload, category: activeCategory._id.toString() });

      const res = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          ...validProductPayload,
          sku: 'DRIP-HOODIE-BLK-L',
          name: 'Heavyweight Boxy Hoodie', // Generates same slug
          category: activeCategory._id.toString()
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(res.body.error.message).toContain('slug already exists');
    });

    it('should reject non-admin from creating products', async () => {
      const res = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${customerAccessToken}`)
        .send({ ...validProductPayload, category: activeCategory._id.toString() });

      expect(res.status).toBe(403);
    });
  });

  describe('Product Update & Inventory Safeguard (PATCH /api/v1/products/:id)', () => {
    let createdProduct;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ ...validProductPayload, category: activeCategory._id.toString() });
      createdProduct = res.body.data.product;
    });

    it('should allow admin to update catalog fields', async () => {
      const res = await request(app)
        .patch(`/api/v1/products/${createdProduct._id}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          priceCents: 9000,
          name: 'Updated Boxy Hoodie'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.product.priceCents).toBe(9000);
      expect(res.body.data.product.name).toBe('Updated Boxy Hoodie');
    });

    it('should strictly ignore and reject stock modifications in update payload', async () => {
      const res = await request(app)
        .patch(`/api/v1/products/${createdProduct._id}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          priceCents: 9500,
          stock: { physical: 500, available: 500 }
        });

      expect(res.status).toBe(200);
      expect(res.body.data.product.stock.physical).toBe(0);
      expect(res.body.data.product.stock.available).toBe(0);

      // Verify in DB directly
      const dbProduct = await Product.findById(createdProduct._id);
      expect(dbProduct.stock.physical).toBe(0);
      expect(dbProduct.stock.available).toBe(0);
    });
  });

  describe('Product Status Transitions (PATCH /api/v1/products/:id/status)', () => {
    let draftProduct;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ ...validProductPayload, category: activeCategory._id.toString() });
      draftProduct = res.body.data.product;
    });

    it('should allow admin to publish a draft product', async () => {
      const res = await request(app)
        .patch(`/api/v1/products/${draftProduct._id}/status`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ status: 'published' });

      expect(res.status).toBe(200);
      expect(res.body.data.product.status).toBe('published');
    });

    it('should prevent publishing if the product category is inactive', async () => {
      // Deactivate the category
      activeCategory.isActive = false;
      await activeCategory.save();

      const res = await request(app)
        .patch(`/api/v1/products/${draftProduct._id}/status`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ status: 'published' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(res.body.error.message).toContain('category is inactive');
    });

    it('should allow admin to archive a product', async () => {
      const res = await request(app)
        .patch(`/api/v1/products/${draftProduct._id}/status`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ status: 'archived' });

      expect(res.status).toBe(200);
      expect(res.body.data.product.status).toBe('archived');
    });
  });

  describe('Public Product Visibility (Listing & Lookup)', () => {
    let publishedProduct;
    let draftProduct;
    let archivedProduct;
    let productInInactiveCategory;

    beforeEach(async () => {
      // 1. Published Product in Active Category
      publishedProduct = await Product.create({
        sku: 'PUB-PROD-01',
        slug: 'published-cargo-pants',
        name: 'Military Cargo Pants',
        description: 'Durable ripstop relaxed fit cargo pants with reinforced pockets.',
        category: activeCategory._id,
        priceCents: 9500,
        status: 'published',
        stock: { physical: 10, reserved: 0, available: 10 }
      });

      // 2. Draft Product in Active Category
      draftProduct = await Product.create({
        sku: 'DRF-PROD-02',
        slug: 'draft-jacket',
        name: 'Upcoming Leather Jacket',
        description: 'Italian leather moto jacket.',
        category: activeCategory._id,
        priceCents: 25000,
        status: 'draft',
        stock: { physical: 0, reserved: 0, available: 0 }
      });

      // 3. Archived Product in Active Category
      archivedProduct = await Product.create({
        sku: 'ARC-PROD-03',
        slug: 'archived-sweatpants',
        name: 'Old Season Sweatpants',
        description: 'Discontinued fleece sweatpants.',
        category: activeCategory._id,
        priceCents: 4500,
        status: 'archived',
        stock: { physical: 0, reserved: 0, available: 0 }
      });

      // 4. Published Product in Inactive Category
      productInInactiveCategory = await Product.create({
        sku: 'PUB-INACT-04',
        slug: 'vintage-leather-vest',
        name: 'Vintage Leather Vest',
        description: 'Rare vintage vest in inactive category.',
        category: inactiveCategory._id,
        priceCents: 12000,
        status: 'published',
        stock: { physical: 5, reserved: 0, available: 5 }
      });
    });

    it('GET /api/v1/products should only return published products in active categories', async () => {
      const res = await request(app).get('/api/v1/products');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.products.length).toBe(1);
      expect(res.body.data.products[0].sku).toBe('PUB-PROD-01');
    });

    it('GET /api/v1/products/:idOrSlug should return product by ID or Slug if published and active', async () => {
      // By slug
      const resSlug = await request(app).get(`/api/v1/products/${publishedProduct.slug}`);
      expect(resSlug.status).toBe(200);
      expect(resSlug.body.data.product.name).toBe('Military Cargo Pants');

      // By ID
      const resId = await request(app).get(`/api/v1/products/${publishedProduct._id}`);
      expect(resId.status).toBe(200);
      expect(resId.body.data.product.sku).toBe('PUB-PROD-01');
    });

    it('GET /api/v1/products/:idOrSlug should return 404 for draft products', async () => {
      const res = await request(app).get(`/api/v1/products/${draftProduct.slug}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('GET /api/v1/products/:idOrSlug should return 404 for archived products', async () => {
      const res = await request(app).get(`/api/v1/products/${archivedProduct.slug}`);
      expect(res.status).toBe(404);
    });

    it('GET /api/v1/products/:idOrSlug should return 404 if product is in an inactive category', async () => {
      const res = await request(app).get(`/api/v1/products/${productInInactiveCategory.slug}`);
      expect(res.status).toBe(404);
    });
  });

  describe('Search, Filtering, Sorting, and Pagination', () => {
    beforeEach(async () => {
      await Product.create([
        {
          sku: 'TSHIRT-BLK-01',
          slug: 'black-oversized-tee',
          name: 'Black Oversized Tee',
          description: 'Premium heavyweight cotton tee in midnight black.',
          category: activeCategory._id,
          priceCents: 4500,
          status: 'published',
          stock: { physical: 5, reserved: 0, available: 5 },
          createdAt: new Date('2026-01-01')
        },
        {
          sku: 'HOODIE-WHT-02',
          slug: 'white-zip-hoodie',
          name: 'White Zip Hoodie',
          description: 'Comfortable oversized fleece zip hoodie.',
          category: activeCategory._id,
          priceCents: 8900,
          status: 'published',
          stock: { physical: 0, reserved: 0, available: 0 }, // Out of stock
          createdAt: new Date('2026-01-02')
        },
        {
          sku: 'JACKET-BLK-03',
          slug: 'black-bomber-jacket',
          name: 'Black Bomber Jacket',
          description: 'Insulated nylon flight jacket with orange lining.',
          category: activeCategory._id,
          priceCents: 15000,
          status: 'published',
          stock: { physical: 8, reserved: 0, available: 8 },
          createdAt: new Date('2026-01-03')
        }
      ]);
    });

    it('should search products by keyword in name or description', async () => {
      const res = await request(app).get('/api/v1/products?q=bomber');

      expect(res.status).toBe(200);
      expect(res.body.data.products.length).toBe(1);
      expect(res.body.data.products[0].sku).toBe('JACKET-BLK-03');
    });

    it('should filter by availability (inStock=true)', async () => {
      const res = await request(app).get('/api/v1/products?inStock=true');

      expect(res.status).toBe(200);
      expect(res.body.data.products.length).toBe(2);
      res.body.data.products.forEach((p) => {
        expect(p.stock.available).toBeGreaterThan(0);
      });
    });

    it('should sort products by price ascending (priceCents:asc)', async () => {
      const res = await request(app).get('/api/v1/products?sortBy=priceCents:asc');

      expect(res.status).toBe(200);
      const prices = res.body.data.products.map((p) => p.priceCents);
      expect(prices).toEqual([4500, 8900, 15000]);
    });

    it('should reject unallowlisted sort fields with 422', async () => {
      const res = await request(app).get('/api/v1/products?sortBy=adminPassword:desc');

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should paginate results with page and limit parameters', async () => {
      const res = await request(app).get('/api/v1/products?page=1&limit=2');

      expect(res.status).toBe(200);
      expect(res.body.data.products.length).toBe(2);
      expect(res.body.meta.total).toBe(3);
      expect(res.body.meta.totalPages).toBe(2);
      expect(res.body.meta.hasNextPage).toBe(true);
    });
  });

  describe('Admin Catalog Inspection Endpoints', () => {
    beforeEach(async () => {
      await Product.create([
        {
          sku: 'DRAFT-01',
          slug: 'draft-item',
          name: 'Draft Item',
          description: 'A draft item description.',
          category: activeCategory._id,
          priceCents: 1000,
          status: 'draft',
          stock: { physical: 0, reserved: 0, available: 0 }
        },
        {
          sku: 'ARCHIVED-01',
          slug: 'archived-item',
          name: 'Archived Item',
          description: 'An archived item description.',
          category: activeCategory._id,
          priceCents: 2000,
          status: 'archived',
          stock: { physical: 0, reserved: 0, available: 0 }
        }
      ]);
    });

    it('GET /api/v1/admin/products should allow admin to view all statuses', async () => {
      const res = await request(app)
        .get('/api/v1/admin/products')
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.products.length).toBe(2);
    });

    it('GET /api/v1/admin/products/:id should allow admin to view a draft product', async () => {
      const draft = await Product.findOne({ sku: 'DRAFT-01' });

      const res = await request(app)
        .get(`/api/v1/admin/products/${draft._id}`)
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.product.name).toBe('Draft Item');
      expect(res.body.data.product.status).toBe('draft');
    });
  });
});
