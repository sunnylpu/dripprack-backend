import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/database.js';
import { User } from '../src/modules/users/user.model.js';
import { Project } from '../src/modules/projects/project.model.js';
import { Product } from '../src/modules/products/product.model.js';
import { Category } from '../src/modules/categories/category.model.js';

describe('Projects Module Test Suite', () => {
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
      email: 'admin_proj@driprack.com',
      passwordHash: adminPasswordHash,
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      status: 'active'
    });

    // Create Customer User
    const customerPasswordHash = await User.hashPassword('CustomerPassword123!');
    await User.create({
      email: 'customer_proj@driprack.com',
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
    await Project.deleteMany({});
    await Product.deleteMany({});
    await Category.deleteMany({});

    // Login for tokens
    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin_proj@driprack.com', password: 'AdminPassword123!' });
    adminAccessToken = adminLogin.body.data.accessToken;

    const customerLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'customer_proj@driprack.com', password: 'CustomerPassword123!' });
    customerAccessToken = customerLogin.body.data.accessToken;

    testCategory = await Category.create({
      name: 'Outerwear',
      slug: 'outerwear',
      isActive: true
    });

    testProduct = await Product.create({
      sku: 'TEST-PUFFER-02',
      name: 'Test Heavy Puffer 2',
      slug: 'test-heavy-puffer-2',
      description: 'A test puffer jacket for project tagging.',
      category: testCategory._id,
      priceCents: 42000,
      status: 'published',
      stock: { physical: 15, reserved: 0, available: 15 }
    });
  });

  it('should allow public access to GET /api/v1/projects', async () => {
    await Project.create({
      title: "Fall Winter '26 Lookbook",
      slug: 'fw26-lookbook',
      season: 'FW26',
      statement: 'Architectural streetwear lookbook.',
      isPublished: true,
      taggedProducts: [testProduct._id]
    });

    const res = await request(app).get('/api/v1/projects');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].slug).toBe('fw26-lookbook');
    expect(res.body.data[0].taggedProducts).toHaveLength(1);
  });

  it('should allow public access to GET /api/v1/projects/detail/:slug', async () => {
    await Project.create({
      title: 'The Art of Doing Nothing',
      slug: 'the-art-of-doing-nothing',
      season: 'CORE',
      statement: 'Quiet living campaign.',
      isPublished: true,
      taggedProducts: [testProduct._id]
    });

    const res = await request(app).get('/api/v1/projects/detail/the-art-of-doing-nothing');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe('The Art of Doing Nothing');
    expect(res.body.data.taggedProducts[0].sku).toBe('TEST-PUFFER-02');
  });

  it('should reject non-admin from creating project with 403', async () => {
    const res = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${customerAccessToken}`)
      .send({
        title: 'Unauthorized Project',
        slug: 'unauthorized-proj'
      });

    expect(res.status).toBe(403);
  });

  it('should allow admin to create and update projects', async () => {
    const createRes = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({
        title: 'Saucony Collaboration Lookbook',
        slug: 'saucony-collab-lookbook',
        season: 'SS26',
        statement: 'Footwear collaboration study.',
        isPublished: true
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.data.slug).toBe('saucony-collab-lookbook');

    const updateRes = await request(app)
      .put(`/api/v1/projects/${createRes.body.data._id}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({
        statement: 'Updated statement for collaborative lookbook.'
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.statement).toContain('Updated statement');
  });
});

