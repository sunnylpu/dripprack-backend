import { describe, it, expect, vi } from 'vitest';
import crypto from 'crypto';
import { DodoPaymentGateway } from '../src/modules/payments/payment.gateway.js';

describe('DodoPaymentGateway Adapter Test Suite', () => {
  const gateway = new DodoPaymentGateway();
  const testSecret = 'whsec_test_secret_12345';

  it('should initialize with correct gateway name and test base URL', () => {
    expect(gateway.name).toBe('dodo');
    expect(gateway.baseUrl).toBe('https://test.dodopayments.com');
  });

  describe('verifyWebhookSignature', () => {
    it('should accurately verify a valid HMAC-SHA256 signature', () => {
      const payload = JSON.stringify({ type: 'payment.succeeded', payment_id: 'pay_123' });
      const signature = crypto
        .createHmac('sha256', testSecret)
        .update(Buffer.from(payload))
        .digest('hex');

      const isValid = gateway.verifyWebhookSignature({
        rawBody: Buffer.from(payload),
        signature,
        secret: testSecret
      });

      expect(isValid).toBe(true);
    });

    it('should reject a forged signature', () => {
      const payload = JSON.stringify({ type: 'payment.succeeded', payment_id: 'pay_123' });
      const forgedSig = 'forged_hex_signature_abcdef123456';

      const isValid = gateway.verifyWebhookSignature({
        rawBody: Buffer.from(payload),
        signature: forgedSig,
        secret: testSecret
      });

      expect(isValid).toBe(false);
    });

    it('should return false if signature is missing', () => {
      const isValid = gateway.verifyWebhookSignature({
        rawBody: Buffer.from('test'),
        signature: null,
        secret: testSecret
      });

      expect(isValid).toBe(false);
    });
  });

  describe('parseWebhookEvent', () => {
    it('should parse a valid Dodo payment webhook event', () => {
      const webhookPayload = {
        id: 'evt_dodo_001',
        type: 'payment.succeeded',
        data: {
          payment_id: 'pay_dodo_123',
          amount: 43500,
          currency: 'USD',
          metadata: {
            orderReference: 'ORD-2026-TEST'
          }
        }
      };

      const parsed = gateway.parseWebhookEvent(webhookPayload);

      expect(parsed.eventId).toBe('evt_dodo_001');
      expect(parsed.eventType).toBe('payment.succeeded');
      expect(parsed.orderReference).toBe('ORD-2026-TEST');
      expect(parsed.amountCents).toBe(43500);
      expect(parsed.currency).toBe('USD');
      expect(parsed.providerPaymentId).toBe('pay_dodo_123');
    });

    it('should reject payload missing orderReference', () => {
      const invalidPayload = {
        id: 'evt_001',
        type: 'payment.succeeded',
        data: {
          payment_id: 'pay_123'
        }
      };

      expect(() => gateway.parseWebhookEvent(invalidPayload)).toThrow(
        'Webhook payload missing orderReference'
      );
    });
  });
});

