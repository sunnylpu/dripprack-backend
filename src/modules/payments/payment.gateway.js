import crypto from 'crypto';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';

/**
 * Mock payment gateway adapter for isolated testing and development
 */
export class MockPaymentGateway {
  constructor() {
    this.name = 'mock';
  }

  async createPaymentIntent({ order, payment }) {
    const providerPaymentId = `mock_pi_${crypto.randomBytes(12).toString('hex')}`;
    const clientSecret = `mock_sec_${crypto.randomBytes(16).toString('hex')}`;

    return {
      provider: 'mock',
      providerPaymentId,
      clientSecret,
      amountCents: payment.amountCents,
      currency: payment.currency,
      status: 'pending'
    };
  }

  verifyWebhookSignature({ rawBody, signature, secret }) {
    if (!signature) {
      return false;
    }

    const webhookSecret = secret || env.STRIPE_WEBHOOK_SECRET || 'test_webhook_secret';
    if (!webhookSecret) {
      return false;
    }

    if (!rawBody) {
      return false;
    }

    const payload = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);

    const expectedHex = crypto
      .createHmac('sha256', webhookSecret)
      .update(payload)
      .digest('hex');

    // Support standard hex or Stripe-style t=timestamp,v1=hex format
    if (signature === expectedHex) {
      return true;
    }

    if (signature.startsWith('t=') || signature.includes('v1=')) {
      const parts = signature.split(',');
      const v1Part = parts.find((p) => p.startsWith('v1='));
      if (v1Part) {
        const receivedHex = v1Part.replace('v1=', '');
        return crypto.timingSafeEqual(
          Buffer.from(receivedHex, 'utf8'),
          Buffer.from(expectedHex, 'utf8')
        );
      }
    }

    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'utf8'),
        Buffer.from(expectedHex, 'utf8')
      );
    } catch {
      return false;
    }
  }

  parseWebhookEvent(body) {
    if (!body || typeof body !== 'object') {
      throw ApiError.badRequest('Invalid webhook payload format', 'INVALID_WEBHOOK_PAYLOAD');
    }

    const eventId = body.id || body.eventId;
    const eventType = body.type || body.eventType;
    const data = body.data || body;

    const orderReference = data.orderReference || data.object?.metadata?.orderReference;
    const amountCents = data.amountCents ?? data.object?.amount;
    const currency = data.currency || data.object?.currency?.toUpperCase();
    const providerPaymentId = data.providerPaymentId || data.object?.id;

    if (!eventId || !eventType || !orderReference) {
      throw ApiError.badRequest(
        'Webhook payload missing mandatory fields (id, type, orderReference)',
        'INVALID_WEBHOOK_PAYLOAD'
      );
    }

    return {
      eventId,
      eventType,
      orderReference,
      amountCents,
      currency,
      providerPaymentId
    };
  }
}

/**
 * Production Stripe payment gateway adapter
 */
export class StripePaymentGateway {
  constructor() {
    this.name = 'stripe';
  }

  async createPaymentIntent({ order, payment }) {
    if (!env.ENABLE_ONLINE_PAYMENTS || !env.STRIPE_SECRET_KEY) {
      throw ApiError.badRequest(
        'Online payment processing is currently disabled or unconfigured',
        'ONLINE_PAYMENTS_DISABLED'
      );
    }

    // In a production setup with live Stripe SDK, this creates a Stripe PaymentIntent.
    // For DripRack V1 foundation, online payments are disabled unless genuine credentials exist.
    throw ApiError.badRequest(
      'Online payment gateway is not active in this environment',
      'ONLINE_PAYMENTS_DISABLED'
    );
  }

  verifyWebhookSignature({ rawBody, signature, secret }) {
    const webhookSecret = secret || env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret || !signature || !rawBody) {
      return false;
    }

    try {
      const payload = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
      const expectedHex = crypto
        .createHmac('sha256', webhookSecret)
        .update(payload)
        .digest('hex');

      if (signature.includes('v1=')) {
        const parts = signature.split(',');
        const v1Part = parts.find((p) => p.startsWith('v1='));
        if (v1Part) {
          const receivedHex = v1Part.replace('v1=', '');
          return crypto.timingSafeEqual(
            Buffer.from(receivedHex, 'utf8'),
            Buffer.from(expectedHex, 'utf8')
          );
        }
      }

      return crypto.timingSafeEqual(
        Buffer.from(signature, 'utf8'),
        Buffer.from(expectedHex, 'utf8')
      );
    } catch {
      return false;
    }
  }

  parseWebhookEvent(body) {
    if (!body || typeof body !== 'object') {
      throw ApiError.badRequest('Invalid webhook payload format', 'INVALID_WEBHOOK_PAYLOAD');
    }

    const eventId = body.id;
    const eventType = body.type;
    const dataObj = body.data?.object || body.data || body;

    const orderReference = dataObj.metadata?.orderReference || dataObj.orderReference;
    const amountCents = dataObj.amount ?? dataObj.amountCents;
    const currency = dataObj.currency ? dataObj.currency.toUpperCase() : undefined;
    const providerPaymentId = dataObj.id || dataObj.providerPaymentId;

    if (!eventId || !eventType || !orderReference) {
      throw ApiError.badRequest(
        'Webhook payload missing required event attributes (id, type, orderReference)',
        'INVALID_WEBHOOK_PAYLOAD'
      );
    }

    return {
      eventId,
      eventType,
      orderReference,
      amountCents,
      currency,
      providerPaymentId
    };
  }
}

// Active gateway reference with injection mechanism for tests
let activeGateway = null;

export function getPaymentGateway() {
  if (activeGateway) {
    return activeGateway;
  }

  if (env.NODE_ENV === 'test' || env.PAYMENT_PROVIDER === 'mock') {
    return new MockPaymentGateway();
  }

  return new StripePaymentGateway();
}

export function setPaymentGateway(gateway) {
  activeGateway = gateway;
}

export function resetPaymentGateway() {
  activeGateway = null;
}
