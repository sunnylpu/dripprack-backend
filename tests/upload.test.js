import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/database.js';
import { User } from '../src/modules/users/user.model.js';

describe('Media Uploads & Video Streaming Test Suite', () => {
  let mongoServer;
  let adminAccessToken;
  let customerAccessToken;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await connectDB(uri);

    const adminPasswordHash = await User.hashPassword('AdminPassword123!');
    await User.create({
      email: 'admin_upload@driprack.com',
      passwordHash: adminPasswordHash,
      firstName: 'Admin',
      lastName: 'Upload',
      role: 'admin',
      status: 'active'
    });

    const customerPasswordHash = await User.hashPassword('CustomerPassword123!');
    await User.create({
      email: 'customer_upload@driprack.com',
      passwordHash: customerPasswordHash,
      firstName: 'Customer',
      lastName: 'Upload',
      role: 'customer',
      status: 'active'
    });

    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .set('X-App-Client', 'admin')
      .send({ email: 'admin_upload@driprack.com', password: 'AdminPassword123!' });
    adminAccessToken = adminLogin.body.data.accessToken;

    const customerLogin = await request(app)
      .post('/api/v1/auth/login')
      .set('X-App-Client', 'customer')
      .send({ email: 'customer_upload@driprack.com', password: 'CustomerPassword123!' });
    customerAccessToken = customerLogin.body.data.accessToken;
  });

  afterAll(async () => {
    await disconnectDB();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  it('should reject unauthenticated upload requests with 401', async () => {
    const res = await request(app)
      .post('/api/v1/uploads')
      .attach('file', Buffer.from('fake video content'), 'test.mp4');

    expect(res.status).toBe(401);
  });

  it('should reject customer uploads with 403 Forbidden', async () => {
    const res = await request(app)
      .post('/api/v1/uploads')
      .set('Authorization', `Bearer ${customerAccessToken}`)
      .attach('file', Buffer.from('fake video content'), 'test.mp4');

    expect(res.status).toBe(403);
  });

  it('should reject unsupported file types with 400 Bad Request', async () => {
    const res = await request(app)
      .post('/api/v1/uploads')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .attach('file', Buffer.from('malicious script'), 'bad.exe');

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('Unsupported media type');
  });

  it('should allow admin to upload a video file (.mp4)', async () => {
    const sampleVideoBuffer = Buffer.from('sample-mp4-stream-data-bytes-for-test');
    const res = await request(app)
      .post('/api/v1/uploads')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .attach('file', sampleVideoBuffer, {
        filename: 'campaign_ambient.mp4',
        contentType: 'video/mp4'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.url).toBeDefined();
    expect(res.body.data.url).toContain('/uploads/file/');
    expect(res.body.data.mimeType).toBe('video/mp4');

    const uploadedId = res.body.data.id;

    // Test public streaming (200 OK)
    const streamRes = await request(app)
      .get(`/api/v1/uploads/file/${uploadedId}/campaign_ambient.mp4`)
      .buffer(true);

    expect(streamRes.status).toBe(200);
    expect(streamRes.headers['content-type']).toBe('video/mp4');
    expect(streamRes.headers['accept-ranges']).toBe('bytes');
    expect(streamRes.body.toString('utf-8')).toBe('sample-mp4-stream-data-bytes-for-test');

    // Test HTTP 206 Partial Content (Range request)
    const rangeRes = await request(app)
      .get(`/api/v1/uploads/file/${uploadedId}/campaign_ambient.mp4`)
      .set('Range', 'bytes=0-5')
      .buffer(true);

    expect(rangeRes.status).toBe(206);
    expect(rangeRes.headers['content-range']).toBeDefined();
    expect(rangeRes.headers['content-range']).toContain('bytes 0-5/');
    expect(rangeRes.body.toString('utf-8')).toBe('sample');

    // Test admin list uploads
    const listRes = await request(app)
      .get('/api/v1/uploads')
      .set('Authorization', `Bearer ${adminAccessToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.files.length).toBeGreaterThan(0);

    // Test admin delete upload
    const delRes = await request(app)
      .delete(`/api/v1/uploads/${uploadedId}`)
      .set('Authorization', `Bearer ${adminAccessToken}`);

    expect(delRes.status).toBe(200);

    // Confirm 404 after deletion
    const afterDelRes = await request(app).get(`/api/v1/uploads/file/${uploadedId}`);
    expect(afterDelRes.status).toBe(404);
  });
});
