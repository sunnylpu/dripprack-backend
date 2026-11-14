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

/**
 * Dodo Payments gateway adapter (Checkout Sessions & Webhook Processor)
 */
export class DodoPaymentGateway {
  constructor() {
    this.name = 'dodo';
    this.apiKey = env.DODO_PAYMENTS_API_KEY;
    this.baseUrl =
      env.DODO_PAYMENTS_ENVIRONMENT === 'live_mode'
        ? 'https://live.dodopayments.com'
        : 'https://test.dodopayments.com';
    this.productId = env.DODO_PAYMENTS_PRODUCT_ID || 'pdt_0NrsStfz9KN9knEk3DgR2';
  }

  async createPaymentIntent({ order, payment }) {
    if (!this.apiKey) {
      throw ApiError.internal('Dodo Payments API key is not configured');
    }

    const payload = {
      product_cart: [
        {
          product_id: this.productId,
          quantity: 1,
          amount: payment.amountCents
        }
      ],
      customer: {
        email: order.customer?.email || 'customer@driprack.com',
        name: order.shippingAddress?.recipientName || 'DripRack Customer'
      },
      billing_address: {
        street: order.shippingAddress?.streetAddress1 || '420 Rue Saint-Paul Ouest',
        city: order.shippingAddress?.city || 'Montreal',
        state: order.shippingAddress?.state || 'QC',
        country: order.shippingAddress?.country || 'CA',
        zipcode: order.shippingAddress?.postalCode || 'H2Y 2A6'
      },
      metadata: {
        orderReference: order.orderReference,
        paymentId: payment._id ? payment._id.toString() : undefined
      },
      return_url: `http://localhost:5174/account/orders`
    };

    const executeCheckoutCall = async () => {
      const response = await fetch(`${this.baseUrl}/checkouts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const rawText = await response.text();
      let data = null;
      try {
        data = JSON.parse(rawText);
      } catch {
        // Non-JSON response
      }

      if (!response.ok) {
        throw new Error(data?.message || rawText || `Dodo API responded with status ${response.status}`);
      }

      if (!data || !data.checkout_url) {
        throw new Error('Dodo API response missing checkout_url');
      }

      return data;
    };

    try {
      let data;
      try {
        data = await executeCheckoutCall();
      } catch (firstErr) {
        // Retry once after brief delay for transient upstream hiccups
        await new Promise((resolve) => setTimeout(resolve, 600));
        data = await executeCheckoutCall();
      }

      return {
        provider: 'dodo',
        providerPaymentId: data.session_id,
        clientSecret: null,
        checkoutUrl: data.checkout_url,
        amountCents: payment.amountCents,
        currency: payment.currency,
        status: 'pending'
      };
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw ApiError.badGateway(`Dodo Payments checkout creation failed: ${err.message}`, 'DODO_CHECKOUT_FAILED');
    }
  }

  verifyWebhookSignature({ rawBody, signature, secret }) {
    if (!signature) {
      return false;
    }

    const webhookSecret = secret || env.DODO_PAYMENTS_WEBHOOK_KEY || 'test_webhook_secret';
    if (!webhookSecret) {
      return false;
    }

    if (!rawBody) {
      return false;
    }

    try {
      const payload = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
      const expectedHex = crypto
        .createHmac('sha256', webhookSecret)
        .update(payload)
        .digest('hex');

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

    const eventId = body.id || body.event_id || body.data?.payment_id;
    const eventType = body.type || body.event_type || 'payment.succeeded';
    const dataObj = body.data || body;

    const orderReference =
      dataObj.metadata?.orderReference ||
      dataObj.orderReference ||
      dataObj.customer?.metadata?.orderReference;

    const amountCents = dataObj.amount ?? dataObj.amountCents ?? dataObj.total_amount;
    const currency = dataObj.currency ? dataObj.currency.toUpperCase() : 'USD';
    const providerPaymentId = dataObj.payment_id || dataObj.id || dataObj.session_id;

    if (!orderReference) {
      throw ApiError.badRequest(
        'Webhook payload missing orderReference',
        'INVALID_WEBHOOK_PAYLOAD'
      );
    }

    return {
      eventId: eventId || `dodo_evt_${crypto.randomBytes(8).toString('hex')}`,
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

  if (env.PAYMENT_PROVIDER === 'dodo') {
    return new DodoPaymentGateway();
  }

  return new StripePaymentGateway();
}

export function setPaymentGateway(gateway) {
  activeGateway = gateway;
}

export function resetPaymentGateway() {
  activeGateway = null;
}
