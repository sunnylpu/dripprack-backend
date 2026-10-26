import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';

describe('Centralized Error Handling (Phase 1)', () => {
  it('should return 404 with standardized error envelope for undefined route', async () => {
    const res = await request(app).get('/api/v1/undefined-endpoint-for-testing');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.statusCode).toBe(404);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.message).toContain('Cannot GET /api/v1/undefined-endpoint-for-testing');
  });

  it('should return 400 for malformed JSON request body', async () => {
    const res = await request(app)
      .post('/api/v1/health/live')
      .set('Content-Type', 'application/json')
      .send('{ "invalidJson": broken ');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(res.body.error.message).toContain('Malformed JSON');
  });

  it('should reject request payload exceeding 100kb limit with 413', async () => {
    const hugePayload = { data: 'a'.repeat(105 * 1024) }; // > 100kb

    const res = await request(app)
      .post('/api/v1/health/live')
      .send(hugePayload);

    expect(res.status).toBe(413);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
