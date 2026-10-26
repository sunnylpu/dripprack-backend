import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/database.js';

describe('Health Checks & Base API (Phase 1)', () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await connectDB(uri);
  });

  afterAll(async () => {
    await disconnectDB();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  it('GET /health/live should return 200 with UP status', async () => {
    const res = await request(app).get('/health/live');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('UP');
    expect(typeof res.body.data.uptimeSeconds).toBe('number');
    expect(res.body.data.timestamp).toBeDefined();
  });

  it('GET /health/ready should return 200 when database is connected', async () => {
    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.database).toBe('CONNECTED');
  });

  it('GET /api/v1 should return base API information', async () => {
    const res = await request(app).get('/api/v1');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.version).toBe('1.0.0');
    expect(res.body.data.status).toBe('operational');
  });

  it('GET /health/ready should return 503 if database is disconnected', async () => {
    // Temporarily disconnect to test readiness failure probe
    await mongoose.disconnect();

    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.data.database).toBe('DISCONNECTED');

    // Reconnect for remaining tests
    const uri = mongoServer.getUri();
    await connectDB(uri);
  });
});
