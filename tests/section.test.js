import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/database.js';
import { User } from '../src/modules/users/user.model.js';
import { StorefrontSection } from '../src/modules/sections/section.model.js';
import { Product } from '../src/modules/products/product.model.js';
import { Category } from '../src/modules/categories/category.model.js';

describe('Storefront Sections CMS Test Suite', () => {
  let mongoServer;
  let adminAccessToken;
  let customerAccessToken;
  let testCategory;
  let testProduct;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await connectDB(uri);

    const adminPasswordHash = await User.hashPassword('AdminPassword123!');
    await User.create({
      email: 'admin_section@driprack.com',
      passwordHash: adminPasswordHash,
      firstName: 'Admin',
      lastName: 'CMS',
      role: 'admin',
      status: 'active'
    });

    const customerPasswordHash = await User.hashPassword('CustomerPassword123!');
    await User.create({
      email: 'customer_section@driprack.com',
      passwordHash: customerPasswordHash,
      firstName: 'Client',
      lastName: 'User',
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
    await StorefrontSection.deleteMany({});
    await Product.deleteMany({});
    await Category.deleteMany({});

    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin_section@driprack.com', password: 'AdminPassword123!' });
    adminAccessToken = adminLogin.body.data.accessToken;

    const customerLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'customer_section@driprack.com', password: 'CustomerPassword123!' });
    customerAccessToken = customerLogin.body.data.accessToken;

    testCategory = await Category.create({
      name: 'Outerwear',
      slug: 'outerwear',
      description: 'Technical outerwear and wool coats'
    });

    testProduct = await Product.create({
      name: 'Oversized Wool Trench',
      slug: 'oversized-wool-trench',
      sku: 'TRENCH-01',
      description: 'Relaxed tailored trench coat in heavy virgin wool.',
      priceCents: 45000,
      category: testCategory._id,
      images: ['https://images.unsplash.com/photo-1544441893-675973e31985'],
      stock: { physical: 12, reserved: 0, available: 12 },
      status: 'published'
    });
  });

  describe('POST /api/v1/sections', () => {
    it('should allow admin to create a new section', async () => {
      const payload = {
        sectionKey: 'home_hero_video',
        sectionName: 'Hero Video Loop',
        sectionType: 'HERO_VIDEO',
        page: 'home',
        sortOrder: 1,
        placementNotice: 'Top of Home Page (Above Fold, full bleed ambient video banner)',
        media: {
          videoUrl: 'https://estudioniksen.com/cdn/shop/videos/c/vp/8646ef9c189740bf93c0a2c8d9b42e80/8646ef9c189740bf93c0a2c8d9b42e80.HD-1080p-7.2Mbps-101245130.mp4',
          posterUrl: 'https://estudioniksen.com/cdn/shop/files/preview_images/8646ef9c189740bf93c0a2c8d9b42e80.thumbnail.0000000000_small.jpg'
        },
        content: {
          heading: 'WINTER / SPRING 2026',
          subheading: 'Architectural drapery and raw Japanese denim'
        },
        cta: {
          text: 'SHOP COLLECTION',
          link: '/shop',
          style: 'white'
        },
        isActive: true
      };

      const res = await request(app)
        .post('/api/v1/sections')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.section.sectionKey).toBe('home_hero_video');
      expect(res.body.data.section.media.videoUrl).toBe(payload.media.videoUrl);
    });

    it('should reject non-admin requests', async () => {
      const res = await request(app)
        .post('/api/v1/sections')
        .set('Authorization', `Bearer ${customerAccessToken}`)
        .send({
          sectionKey: 'unauthorized_section',
          sectionName: 'Should Fail',
          sectionType: 'HERO_VIDEO',
          placementNotice: 'Testing unauthorized rejection'
        });

      expect(res.status).toBe(403);
    });

    it('should reject duplicate sectionKey', async () => {
      const payload = {
        sectionKey: 'home_hero_video',
        sectionName: 'Hero Video Loop',
        sectionType: 'HERO_VIDEO',
        placementNotice: 'Top of Home Page'
      };

      await request(app)
        .post('/api/v1/sections')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(payload);

      const res = await request(app)
        .post('/api/v1/sections')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(payload);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('SECTION_KEY_EXISTS');
    });
  });

  describe('GET /api/v1/sections', () => {
    beforeEach(async () => {
      await StorefrontSection.create([
        {
          sectionKey: 'home_hero_video',
          sectionName: 'Hero Video',
          sectionType: 'HERO_VIDEO',
          page: 'home',
          sortOrder: 1,
          placementNotice: 'Top of Home Page',
          isActive: true
        },
        {
          sectionKey: 'home_shop_look_uma',
          sectionName: 'Shop the Look 1',
          sectionType: 'SHOP_THE_LOOK',
          page: 'home',
          sortOrder: 3,
          placementNotice: 'Middle of Home Page',
          curation: {
            category: testCategory._id,
            products: [testProduct._id],
            modelSpecs: 'Uma wears size S / 176cm'
          },
          isActive: true
        },
        {
          sectionKey: 'draft_section',
          sectionName: 'Draft Section',
          sectionType: 'BANNER',
          sectionType: 'IMAGE_BANNER',
          page: 'home',
          sortOrder: 9,
          placementNotice: 'Draft test',
          isActive: false
        }
      ]);
    });

    it('should return all sections sorted by sortOrder', async () => {
      const res = await request(app).get('/api/v1/sections');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.sections.length).toBe(3);
      expect(res.body.data.sections[0].sectionKey).toBe('home_hero_video');
    });

    it('should filter sections by isActive query', async () => {
      const res = await request(app).get('/api/v1/sections?isActive=true');

      expect(res.status).toBe(200);
      expect(res.body.data.sections.length).toBe(2);
      expect(res.body.data.sections.every((s) => s.isActive)).toBe(true);
    });

    it('should retrieve a single section by key with populated products', async () => {
      const res = await request(app).get('/api/v1/sections/key/home_shop_look_uma');

      expect(res.status).toBe(200);
      expect(res.body.data.section.sectionKey).toBe('home_shop_look_uma');
      expect(res.body.data.section.curation.products[0].name).toBe('Oversized Wool Trench');
    });
  });

  describe('PUT /api/v1/sections/:id & PATCH /toggle', () => {
    let sectionId;

    beforeEach(async () => {
      const section = await StorefrontSection.create({
        sectionKey: 'home_hero_video',
        sectionName: 'Hero Video',
        sectionType: 'HERO_VIDEO',
        page: 'home',
        sortOrder: 1,
        placementNotice: 'Top of Home Page',
        isActive: true
      });
      sectionId = section._id.toString();
    });

    it('should allow admin to update section details', async () => {
      const res = await request(app)
        .put(`/api/v1/sections/${sectionId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          content: {
            heading: 'NEW SEASON ARRIVALS'
          }
        });

      expect(res.status).toBe(200);
      expect(res.body.data.section.content.heading).toBe('NEW SEASON ARRIVALS');
    });

    it('should allow admin to toggle active status', async () => {
      const res = await request(app)
        .patch(`/api/v1/sections/${sectionId}/toggle`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ isActive: false });

      expect(res.status).toBe(200);
      expect(res.body.data.section.isActive).toBe(false);
    });

    it('should allow admin to delete a section', async () => {
      const res = await request(app)
        .delete(`/api/v1/sections/${sectionId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.deleted).toBe(true);

      const check = await StorefrontSection.findById(sectionId);
      expect(check).toBeNull();
    });
  });
});
