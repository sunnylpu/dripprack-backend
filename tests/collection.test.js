import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/database.js';
import { User } from '../src/modules/users/user.model.js';
import { Collection } from '../src/modules/collections/collection.model.js';
import { Product } from '../src/modules/products/product.model.js';
import { Category } from '../src/modules/categories/category.model.js';

describe('Collections Module Test Suite', () => {
  let mongoServer;
  let adminAccessToken;
  let customerAccessToken;
  let testCategory;
  let testProduct;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await connectDB(uri);

    // Create Admin User
    const adminPasswordHash = await User.hashPassword('AdminPassword123!');
    await User.create({
      email: 'admin_col@driprack.com',
      passwordHash: adminPasswordHash,
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      status: 'active'
    });

    // Create Customer User
    const customerPasswordHash = await User.hashPassword('CustomerPassword123!');
    await User.create({
      email: 'customer_col@driprack.com',
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
    await Collection.deleteMany({});
    await Product.deleteMany({});
    await Category.deleteMany({});

    // Login for tokens
    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin_col@driprack.com', password: 'AdminPassword123!' });
    adminAccessToken = adminLogin.body.data.accessToken;

    const customerLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'customer_col@driprack.com', password: 'CustomerPassword123!' });
    customerAccessToken = customerLogin.body.data.accessToken;

    testCategory = await Category.create({
      name: 'Outerwear',
      slug: 'outerwear',
      isActive: true
    });

    testProduct = await Product.create({
      sku: 'TEST-PUFFER-01',
      name: 'Test Heavy Puffer',
      slug: 'test-heavy-puffer',
      description: 'A heavyweight test puffer jacket for testing collections.',
      category: testCategory._id,
      priceCents: 35000,
      status: 'published',
      stock: { physical: 10, reserved: 0, available: 10 }
    });
  });

  it('should allow public access to GET /api/v1/collections', async () => {
    await Collection.create({
      title: "Fall Winter '26 - Drop 2",
      slug: 'fw26-drop-2',
      type: 'DROP',
      heroHeading: "Fall Winter '26",
      isFeaturedOnHome: true,
      isActive: true,
      products: [testProduct._id]
    });

    const res = await request(app).get('/api/v1/collections');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].slug).toBe('fw26-drop-2');
    expect(res.body.data[0].products).toHaveLength(1);
  });

  it('should allow public access to GET /api/v1/collections/detail/:slug', async () => {
    await Collection.create({
      title: 'Walking Collection',
      slug: 'walking-collection',
      type: 'CURATION',
      isActive: true,
      products: [testProduct._id]
    });

    const res = await request(app).get('/api/v1/collections/detail/walking-collection');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe('Walking Collection');
    expect(res.body.data.products[0].sku).toBe('TEST-PUFFER-01');
  });

  it('should reject non-admin from creating collection with 403', async () => {
    const res = await request(app)
      .post('/api/v1/collections')
      .set('Authorization', `Bearer ${customerAccessToken}`)
      .send({
        title: 'Unauthorized Collection',
        slug: 'unauthorized-col'
      });

    expect(res.status).toBe(403);
  });

  it('should allow admin to create and update collections', async () => {
    const createRes = await request(app)
      .post('/api/v1/collections')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({
        title: 'New Capsule Drop',
        slug: 'new-capsule-drop',
        type: 'DROP',
        heroHeading: 'Fresh Drop',
        isFeaturedOnHome: true
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.data.slug).toBe('new-capsule-drop');

    const updateRes = await request(app)
      .put(`/api/v1/collections/${createRes.body.data._id}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({
        heroHeading: 'Updated Hero Heading'
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.heroHeading).toBe('Updated Hero Heading');
  });
});

