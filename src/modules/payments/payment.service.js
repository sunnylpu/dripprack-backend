import mongoose from 'mongoose';
import { Payment } from './payment.model.js';
import { Order } from '../orders/order.model.js';
import { Product } from '../products/product.model.js';
import { InventoryMovement } from '../inventory/inventoryMovement.model.js';
import { getPaymentGateway } from './payment.gateway.js';
import { ApiError } from '../../utils/ApiError.js';
import { env } from '../../config/env.js';

export const paymentService = {
  /**
   * Create an online payment intent for an eligible order
   */
  async createPaymentIntent(userId, { orderReference }) {
    // 1. Verify order belongs to customer
    const order = await Order.findOne({
      orderReference,
      customer: userId
    });

    if (!order) {
      throw ApiError.notFound('Order not found', 'ORDER_NOT_FOUND');
    }

    // 2. Validate order state
    if (order.paymentMethod !== 'online') {
      throw ApiError.badRequest(
        'Payment intent can only be created for online payment orders',
        'PAYMENT_METHOD_MISMATCH'
      );
    }

    if (order.orderStatus !== 'awaiting_payment' || order.paymentStatus !== 'pending') {
      throw ApiError.badRequest(
        `Order is not eligible for payment intent creation (status: ${order.orderStatus}, paymentStatus: ${order.paymentStatus})`,
        'ORDER_NOT_PAYABLE'
      );
    }

    // 3. Find payment record
    const payment = await Payment.findOne({ order: order._id });
    if (!payment) {
      throw ApiError.notFound('Payment record not found for this order', 'PAYMENT_NOT_FOUND');
    }

    // 4. Delegate to payment gateway adapter
    const gateway = getPaymentGateway();
    const intent = await gateway.createPaymentIntent({ order, payment });

    // 5. Update payment document with provider payment ID
    if (intent.providerPaymentId) {
      payment.providerPaymentId = intent.providerPaymentId;
      payment.provider = intent.provider || payment.provider;
      await payment.save();
    }

    return {
      orderReference: order.orderReference,
      providerPaymentId: intent.providerPaymentId,
      clientSecret: intent.clientSecret,
      amountCents: payment.amountCents,
      currency: payment.currency,
      provider: payment.provider,
      status: payment.status
    };
  },

  /**
   * Handle provider webhook callback with cryptographic signature verification and idempotency
   */
  async handleWebhook({ rawBody, headers, body }) {
    const signature = headers['stripe-signature'] || headers['x-webhook-signature'];
    if (!signature) {
      throw ApiError.badRequest(
        'Missing webhook signature header (Stripe-Signature or X-Webhook-Signature)',
        'INVALID_WEBHOOK_SIGNATURE'
      );
    }

    const gateway = getPaymentGateway();
    const secret = env.STRIPE_WEBHOOK_SECRET || 'test_webhook_secret';
    const isValid = gateway.verifyWebhookSignature({ rawBody, signature, secret });

    if (!isValid) {
      throw ApiError.badRequest(
        'Cryptographic webhook signature verification failed',
        'INVALID_WEBHOOK_SIGNATURE'
      );
    }

    // Parse and normalize provider event payload
    const event = gateway.parseWebhookEvent(body);

    // Locate matching Order and Payment records
    const order = await Order.findOne({ orderReference: event.orderReference });
    if (!order) {
      throw ApiError.notFound(
        `Order "${event.orderReference}" associated with webhook not found`,
        'ORDER_NOT_FOUND'
      );
    }

    const payment = await Payment.findOne({ order: order._id });
    if (!payment) {
      throw ApiError.notFound(
        `Payment record for order "${event.orderReference}" not found`,
        'PAYMENT_NOT_FOUND'
      );
    }

    // Webhook Idempotency: acknowledge duplicate events without re-applying state mutations
    if (payment.processedEvents.includes(event.eventId)) {
      return {
        acknowledged: true,
        duplicate: true,
        message: 'Webhook event already processed'
      };
    }

    // Validate amount and currency integrity against server records
    if (event.amountCents !== undefined && event.amountCents !== payment.amountCents) {
      throw ApiError.badRequest(
        `Payment amount mismatch: expected ${payment.amountCents}, received ${event.amountCents}`,
        'PAYMENT_AMOUNT_MISMATCH'
      );
    }

    if (event.currency && event.currency !== payment.currency) {
      throw ApiError.badRequest(
        `Payment currency mismatch: expected ${payment.currency}, received ${event.currency}`,
        'PAYMENT_CURRENCY_MISMATCH'
      );
    }

    const isSuccessEvent = [
      'payment_intent.succeeded',
      'payment.succeeded',
      'charge.succeeded'
    ].includes(event.eventType);

    const isFailureEvent = [
      'payment_intent.payment_failed',
      'payment.failed',
      'payment_intent.canceled'
    ].includes(event.eventType);

    if (isSuccessEvent) {
      // Transition payment to paid and order to confirmed in a transaction
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        payment.status = 'paid';
        payment.processedEvents.push(event.eventId);
        if (event.providerPaymentId) {
          payment.providerPaymentId = event.providerPaymentId;
        }
        await payment.save({ session });

        if (order.orderStatus === 'cancelled') {
          // Unpaid online order was cancelled prior to payment webhook; do not revive order
          payment.processedEvents.push(event.eventId);
          payment.failureReason = 'Payment event received after order was already cancelled';
          await payment.save({ session });
          await session.commitTransaction();
          return {
            acknowledged: true,
            status: 'cancelled_prior_to_payment',
            orderReference: order.orderReference
          };
        }

        if (order.orderStatus === 'awaiting_payment') {
          order.orderStatus = 'confirmed';
          order.paymentStatus = 'paid';
          await order.save({ session });
        }

        await session.commitTransaction();
        return {
          acknowledged: true,
          status: 'paid',
          orderReference: order.orderReference
        };
      } catch (err) {
        await session.abortTransaction();
        throw err;
      } finally {
        session.endSession();
      }
    }

    if (isFailureEvent) {
      // Transition payment to failed and release reserved stock if unpaid
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        payment.status = 'failed';
        payment.failureReason = 'Payment failed or cancelled at payment gateway';
        payment.processedEvents.push(event.eventId);
        await payment.save({ session });

        if (order.orderStatus === 'awaiting_payment' && !order.isStockRestocked) {
          order.orderStatus = 'cancelled';
          order.paymentStatus = 'failed';
          order.isStockRestocked = true;
          order.cancellation = {
            cancelledAt: new Date(),
            cancelledBy: order.customer,
            reason: 'Payment failed at gateway'
          };
          await order.save({ session });

          // Release reserved inventory
          for (const item of order.items) {
            const productBefore = await Product.findById(item.product).session(session);

            if (productBefore) {
              const productAfter = await Product.findOneAndUpdate(
                { _id: item.product, 'stock.reserved': { $gte: item.quantity } },
                { $inc: { 'stock.reserved': -item.quantity, 'stock.available': item.quantity } },
                { new: true, session }
              );

              if (productAfter) {
                await InventoryMovement.create(
                  [
                    {
                      product: item.product,
                      sku: item.sku,
                      movementType: 'release',
                      quantityDelta: item.quantity,
                      previousPhysical: productBefore.stock.physical,
                      newPhysical: productAfter.stock.physical,
                      previousAvailable: productBefore.stock.available,
                      newAvailable: productAfter.stock.available,
                      previousReserved: productBefore.stock.reserved,
                      newReserved: productAfter.stock.reserved,
                      actor: order.customer,
                      actorRole: 'system',
                      orderReference: order.orderReference,
                      reason: `Stock release on payment failure for order ${order.orderReference}`
                    }
                  ],
                  { session }
                );
              }
            }
          }
        }

        await session.commitTransaction();
        return {
          acknowledged: true,
          status: 'failed',
          orderReference: order.orderReference
        };
      } catch (err) {
        await session.abortTransaction();
        throw err;
      } finally {
        session.endSession();
      }
    }

    // Other unhandled events: record event ID for idempotency and acknowledge
    payment.processedEvents.push(event.eventId);
    await payment.save();

    return {
      acknowledged: true,
      unhandled: true,
      eventType: event.eventType
    };
  }
};
