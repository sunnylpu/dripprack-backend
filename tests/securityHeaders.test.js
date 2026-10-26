import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';

describe('Security Headers & Tracing (Phase 1)', () => {
  it('should include Helmet security headers on responses', async () => {
    const res = await request(app).get('/health/live');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['x-dns-prefetch-control']).toBe('off');
  });

  it('should generate an X-Request-Id header if none provided', async () => {
    const res = await request(app).get('/health/live');

    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-request-id'].length).toBeGreaterThan(10);
  });

  it('should preserve incoming X-Request-Id header for distributed tracing', async () => {
    const customTraceId = 'custom-trace-uuid-12345';
    const res = await request(app)
      .get('/health/live')
      .set('X-Request-Id', customTraceId);

    expect(res.headers['x-request-id']).toBe(customTraceId);
  });
});
