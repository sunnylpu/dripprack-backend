import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { validateRequest } from '../src/middleware/validateRequest.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { ApiResponse } from '../src/utils/ApiResponse.js';

describe('Validation Foundation with Zod (Phase 1)', () => {
  const testApp = express();
  testApp.use(express.json());

  const sampleSchema = {
    body: z.object({
      email: z.string().email('Invalid email address format'),
      age: z.number().int().min(18, 'Must be at least 18 years old')
    })
  };

  testApp.post(
    '/test-validation',
    validateRequest(sampleSchema),
    (req, res) => {
      return ApiResponse.success(res, { data: req.body });
    }
  );

  testApp.use(errorHandler);

  it('should accept valid payload matching Zod schema', async () => {
    const res = await request(testApp)
      .post('/test-validation')
      .send({ email: 'john.doe@example.com', age: 25 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe('john.doe@example.com');
    expect(res.body.data.age).toBe(25);
  });

  it('should reject invalid payload with 422 and field-level details', async () => {
    const res = await request(testApp)
      .post('/test-validation')
      .send({ email: 'not-an-email', age: 14 });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toBeInstanceOf(Array);
    expect(res.body.error.details.length).toBe(2);

    const emailError = res.body.error.details.find((d) => d.field === 'email');
    const ageError = res.body.error.details.find((d) => d.field === 'age');

    expect(emailError.message).toBe('Invalid email address format');
    expect(ageError.message).toBe('Must be at least 18 years old');
  });

  it('should strip unrecognized fields to prevent mass assignment', async () => {
    const res = await request(testApp)
      .post('/test-validation')
      .send({
        email: 'john.doe@example.com',
        age: 30,
        role: 'admin', // malicious property attempt
        isAdmin: true
      });

    expect(res.status).toBe(200);
    expect(res.body.data.role).toBeUndefined();
    expect(res.body.data.isAdmin).toBeUndefined();
    expect(res.body.data.email).toBe('john.doe@example.com');
  });
});
