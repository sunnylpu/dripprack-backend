import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/database.js';
import { User } from '../src/modules/users/user.model.js';
import { Category } from '../src/modules/categories/category.model.js';
import { Product } from '../src/modules/products/product.model.js';

describe('Phase 3: Category Management Test Suite', () => {
  let mongoServer;
  let adminAccessToken;
  let customerAccessToken;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await connectDB(uri);

    // Create Admin User
    const adminPasswordHash = await User.hashPassword('AdminPassword123!');
    await User.create({
      email: 'admin_cat@driprack.com',
      passwordHash: adminPasswordHash,
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      status: 'active'
    });

    // Create Customer User
    const customerPasswordHash = await User.hashPassword('CustomerPassword123!');
    await User.create({
      email: 'customer_cat@driprack.com',
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
    await Category.deleteMany({});
    await Product.deleteMany({});

    // Obtain fresh tokens
    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin_cat@driprack.com', password: 'AdminPassword123!' });
    adminAccessToken = adminLogin.body.data.accessToken;

    const customerLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'customer_cat@driprack.com', password: 'CustomerPassword123!' });
    customerAccessToken = customerLogin.body.data.accessToken;
  });

  describe('Public Category Endpoints (GET /api/v1/categories)', () => {
    it('should return only active categories for public users', async () => {
      await Category.create([
        { name: 'Streetwear Hoodies', slug: 'streetwear-hoodies', isActive: true },
        { name: 'Vintage Caps', slug: 'vintage-caps', isActive: true },
        { name: 'Archived Collection', slug: 'archived-collection', isActive: false }
      ]);

      const res = await request(app).get('/api/v1/categories');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.categories.length).toBe(2);

      const slugs = res.body.data.categories.map((c) => c.slug);
      expect(slugs).toContain('streetwear-hoodies');
      expect(slugs).toContain('vintage-caps');
      expect(slugs).not.toContain('archived-collection');
    });

    it('should return 422 for invalid ObjectId on single category read', async () => {
      const res = await request(app).get('/api/v1/categories/invalid-id-format');
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 200 for active category by valid ID', async () => {
      const activeCat = await Category.create({
        name: 'Active Category Detail',
        slug: 'active-category-detail',
        isActive: true
      });

      const res = await request(app).get(`/api/v1/categories/${activeCat._id}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.category.name).toBe('Active Category Detail');
    });

    it('should return 404 for inactive category on public lookup (regression fix)', async () => {
      const inactiveCat = await Category.create({
        name: 'Hidden Inactive Category',
        slug: 'hidden-inactive-category',
        isActive: false
      });

      const res = await request(app).get(`/api/v1/categories/${inactiveCat._id}`);
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should return 404 for nonexistent category ID', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const res = await request(app).get(`/api/v1/categories/${fakeId}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('Admin Category Creation (POST /api/v1/categories)', () => {
    it('should allow admin to create a category and auto-generate slug', async () => {
      const res = await request(app)
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          name: 'Graphic T-Shirts',
          description: 'Premium heavyweight cotton oversized t-shirts'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.category.name).toBe('Graphic T-Shirts');
      expect(res.body.data.category.slug).toBe('graphic-t-shirts');
      expect(res.body.data.category.isActive).toBe(true);
    });

    it('should allow admin to specify custom kebab-case slug', async () => {
      const res = await request(app)
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          name: 'Limited Drop Jackets',
          slug: 'custom-drop-jackets'
        });

      expect(res.status).toBe(201);
      expect(res.body.data.category.slug).toBe('custom-drop-jackets');
    });

    it('should reject non-admin users from creating categories', async () => {
      // Unauthenticated
      const unauthRes = await request(app)
        .post('/api/v1/categories')
        .send({ name: 'Sneakers' });
      expect(unauthRes.status).toBe(401);

      // Customer role
      const customerRes = await request(app)
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${customerAccessToken}`)
        .send({ name: 'Sneakers' });
      expect(customerRes.status).toBe(403);
    });

    it('should reject duplicate category name or slug with 409 Conflict', async () => {
      await Category.create({ name: 'Denim Jeans', slug: 'denim-jeans', isActive: true });

      // Duplicate Name
      const duplicateNameRes = await request(app)
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ name: 'DENIM JEANS' }); // Case variation

      expect(duplicateNameRes.status).toBe(409);
      expect(duplicateNameRes.body.error.code).toBe('CONFLICT');

      // Duplicate Slug
      const duplicateSlugRes = await request(app)
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ name: 'Other Jeans', slug: 'denim-jeans' });

      expect(duplicateSlugRes.status).toBe(409);
      expect(duplicateSlugRes.body.error.code).toBe('CONFLICT');
    });

    it('should validate category name constraints with 422', async () => {
      const res = await request(app)
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ name: 'X' }); // Too short

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Admin Category Update (PATCH /api/v1/categories/:id)', () => {
    it('should allow admin to update category details', async () => {
      const category = await Category.create({
        name: 'Footwear',
        slug: 'footwear',
        description: 'Old shoes'
      });

      const res = await request(app)
        .patch(`/api/v1/categories/${category._id}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          name: 'Luxury Footwear',
          description: 'Updated premium sneakers and loafers'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.category.name).toBe('Luxury Footwear');
      expect(res.body.data.category.description).toBe('Updated premium sneakers and loafers');
    });

    it('should reject update if new name collides with another category', async () => {
      await Category.create({ name: 'Category One', slug: 'category-one' });
      const cat2 = await Category.create({ name: 'Category Two', slug: 'category-two' });

      const res = await request(app)
        .patch(`/api/v1/categories/${cat2._id}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ name: 'Category One' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });
  });

  describe('Category Deactivation & Soft Delete (DELETE /api/v1/categories/:id)', () => {
    it('should deactivate category without hard deleting record or products', async () => {
      const category = await Category.create({
        name: 'Summer Shorts',
        slug: 'summer-shorts',
        isActive: true
      });

      const res = await request(app)
        .delete(`/api/v1/categories/${category._id}`)
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.category.isActive).toBe(false);

      // Verify record still exists in DB
      const dbCategory = await Category.findById(category._id);
      expect(dbCategory).toBeDefined();
      expect(dbCategory.isActive).toBe(false);

      // Verify it is excluded from public categories
      const publicRes = await request(app).get('/api/v1/categories');
      const slugs = publicRes.body.data.categories.map((c) => c.slug);
      expect(slugs).not.toContain('summer-shorts');
    });
  });

  describe('Admin Category Listing (GET /api/v1/admin/categories)', () => {
    it('should allow admin to view inactive categories and paginated results', async () => {
      await Category.create([
        { name: 'Active 1', slug: 'active-1', isActive: true },
        { name: 'Active 2', slug: 'active-2', isActive: true },
        { name: 'Inactive 1', slug: 'inactive-1', isActive: false }
      ]);

      const res = await request(app)
        .get('/api/v1/admin/categories?includeInactive=true')
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.categories.length).toBe(3);
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.total).toBe(3);
    });

    it('should reject non-admin from accessing admin category list', async () => {
      const res = await request(app)
        .get('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${customerAccessToken}`);

      expect(res.status).toBe(403);
    });
  });
});
