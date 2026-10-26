import crypto from 'crypto';
import mongoose from 'mongoose';
import { Order } from './order.model.js';
import { Payment } from '../payments/payment.model.js';
import { Product } from '../products/product.model.js';
import { Cart } from '../carts/cart.model.js';
import { Address } from '../addresses/address.model.js';
import { InventoryMovement } from '../inventory/inventoryMovement.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { env } from '../../config/env.js';
import { getPaginationParams, formatPaginatedResult } from '../../utils/pagination.js';

/**
 * Generate a unique, non-guessable collision-safe order reference
 * Format: ORD-YYYYMMDD-XXXXXX
 */
function generateOrderReference() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;
  const randStr = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
  return `ORD-${dateStr}-${randStr}`;
}

/**
 * Calculate server-authoritative monetary amounts in integer minor currency units
 */
export function calculateOrderTotals(subtotalCents) {
  const shippingCents =
    subtotalCents >= env.FREE_SHIPPING_THRESHOLD_CENTS ? 0 : env.SHIPPING_FLAT_FEE_CENTS;
  const taxCents = Math.round((subtotalCents * env.TAX_RATE_PERCENT) / 100);
  const totalCents = subtotalCents + shippingCents + taxCents;

  return {
    subtotalCents,
    shippingCents,
    taxCents,
    totalCents,
    currency: env.CURRENCY_CODE
  };
}

export const orderService = {
  /**
   * Compute non-reservation checkout quote from live database state
   */
  async getCheckoutQuote(userId, { addressId }) {
    // 1. Verify shipping address belongs to authenticated customer
    const address = await Address.findOne({ _id: addressId, user: userId });
    if (!address) {
      throw ApiError.notFound(
        'Delivery address not found or does not belong to customer',
        'ADDRESS_NOT_FOUND'
      );
    }

    // 2. Fetch customer cart
    const cart = await Cart.findOne({ user: userId });
    if (!cart || !cart.items || cart.items.length === 0) {
      throw ApiError.badRequest('Shopping cart is empty', 'CART_EMPTY');
    }

    // 3. Load live product records
    const productIds = cart.items.map((i) => i.product);
    const products = await Product.find({ _id: { $in: productIds } }).populate('category');
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));

    let subtotalCents = 0;
    const itemQuotes = [];

    // 4. Validate product availability and live pricing
    for (const item of cart.items) {
      const product = productMap.get(item.product.toString());

      if (!product) {
        throw ApiError.badRequest(
          'One or more items in your cart no longer exist in the catalog',
          'PRODUCT_UNAVAILABLE'
        );
      }

      if (product.status !== 'published') {
        throw ApiError.badRequest(
          `Product "${product.name}" is currently ${product.status} and cannot be purchased`,
          'PRODUCT_UNAVAILABLE'
        );
      }

      if (!product.category || !product.category.isActive) {
        throw ApiError.badRequest(
          `Product "${product.name}" belongs to an inactive category`,
          'CATEGORY_INACTIVE'
        );
      }

      if (product.stock.available < item.quantity) {
        throw ApiError.conflict(
          `Insufficient stock for "${product.name}". Available: ${product.stock.available}, requested: ${item.quantity}`,
          'INSUFFICIENT_STOCK'
        );
      }

      const unitPriceCents = product.priceCents;
      const lineTotalCents = unitPriceCents * item.quantity;
      subtotalCents += lineTotalCents;

      itemQuotes.push({
        product: product._id,
        sku: product.sku,
        name: product.name,
        quantity: item.quantity,
        unitPriceCents,
        lineTotalCents
      });
    }

    // 5. Calculate authoritative totals
    const totals = calculateOrderTotals(subtotalCents);

    return {
      shippingAddress: {
        recipientName: address.recipientName,
        phone: address.phone,
        streetAddress1: address.streetAddress1,
        streetAddress2: address.streetAddress2 || '',
        city: address.city,
        state: address.state,
        postalCode: address.postalCode,
        country: address.country
      },
      items: itemQuotes,
      ...totals,
      isAuthoritative: false, // Quotes are informational; placement recalculates
      quotedAt: new Date().toISOString()
    };
  },

  /**
   * Place order idempotently with ACID transaction and stock reservation
   */
  async createOrder(userId, { addressId, paymentMethod }, idempotencyKey) {
    // 1. Check if online payments are allowed
    if (paymentMethod === 'online' && !env.ENABLE_ONLINE_PAYMENTS && env.NODE_ENV !== 'test') {
      throw ApiError.badRequest(
        'Online payment processing is currently disabled or unconfigured',
        'ONLINE_PAYMENTS_DISABLED'
      );
    }

    // 2. Compute logical request hash for idempotency validation
    const payloadHash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ addressId, paymentMethod }))
      .digest('hex');

    // 3. Idempotency deduplication check
    if (idempotencyKey) {
      const existingOrder = await Order.findOne({ idempotencyKey });
      if (existingOrder) {
        if (existingOrder.idempotencyPayloadHash === payloadHash) {
          // Replay identical request safely
          return { order: existingOrder, isIdempotentReplay: true };
        }
        throw ApiError.conflict(
          'An order with this idempotency key already exists with a different payload',
          'IDEMPOTENCY_CONFLICT'
        );
      }
    }

    // 4. Multi-document transaction for atomic order creation
    const session = await mongoose.startSession();
    let order;

    try {
      await session.withTransaction(async () => {
        // 4a. Load and verify shipping address within transaction
        const address = await Address.findOne({ _id: addressId, user: userId }).session(session);
        if (!address) {
          throw ApiError.notFound(
            'Delivery address not found or does not belong to customer',
            'ADDRESS_NOT_FOUND'
          );
        }

        // 4b. Load customer cart within transaction
        const cart = await Cart.findOne({ user: userId }).session(session);
        if (!cart || !cart.items || cart.items.length === 0) {
          throw ApiError.badRequest('Shopping cart is empty', 'CART_EMPTY');
        }

        let subtotalCents = 0;
        const orderItems = [];
        const stockReservationSnapshots = [];

        // 4c. Process and atomically reserve each product line
        for (const item of cart.items) {
          const product = await Product.findById(item.product).populate('category').session(session);

          if (!product) {
            throw ApiError.badRequest(
              'One or more products no longer exist in the catalog',
              'PRODUCT_UNAVAILABLE'
            );
          }

          if (product.status !== 'published') {
            throw ApiError.badRequest(
              `Product "${product.name}" is not published`,
              'PRODUCT_UNAVAILABLE'
            );
          }

          if (!product.category || !product.category.isActive) {
            throw ApiError.badRequest(
              `Product "${product.name}" belongs to an inactive category`,
              'CATEGORY_INACTIVE'
            );
          }

          // Atomic conditional stock reservation
          const updatedProduct = await Product.findOneAndUpdate(
            {
              _id: item.product,
              status: 'published',
              'stock.available': { $gte: item.quantity }
            },
            {
              $inc: {
                'stock.reserved': item.quantity,
                'stock.available': -item.quantity
              }
            },
            {
              new: true,
              session
            }
          );

          if (!updatedProduct) {
            throw ApiError.conflict(
              `Insufficient available stock for product "${product.name}"`,
              'INSUFFICIENT_STOCK'
            );
          }

          const unitPriceCents = product.priceCents;
          const lineTotalCents = unitPriceCents * item.quantity;
          subtotalCents += lineTotalCents;

          orderItems.push({
            product: product._id,
            sku: product.sku,
            name: product.name,
            unitPriceCents,
            quantity: item.quantity,
            lineTotalCents
          });

          stockReservationSnapshots.push({
            product: product._id,
            sku: product.sku,
            quantity: item.quantity,
            previousPhysical: product.stock.physical,
            newPhysical: updatedProduct.stock.physical,
            previousAvailable: product.stock.available,
            newAvailable: updatedProduct.stock.available,
            previousReserved: product.stock.reserved,
            newReserved: updatedProduct.stock.reserved
          });
        }

        // 4d. Calculate authoritative totals
        const totals = calculateOrderTotals(subtotalCents);

        // 4e. Generate non-guessable collision-safe order reference
        let orderReference;
        let isUnique = false;
        for (let attempt = 0; attempt < 5; attempt++) {
          orderReference = generateOrderReference();
          const existing = await Order.findOne({ orderReference }).session(session);
          if (!existing) {
            isUnique = true;
            break;
          }
        }

        if (!isUnique) {
          throw ApiError.internal(
            'Failed to generate unique order reference, please retry',
            'ORDER_REF_GENERATION_FAILED'
          );
        }

        // 4f. Create immutable shipping address snapshot
        const shippingAddress = {
          recipientName: address.recipientName,
          phone: address.phone,
          streetAddress1: address.streetAddress1,
          streetAddress2: address.streetAddress2 || '',
          city: address.city,
          state: address.state,
          postalCode: address.postalCode,
          country: address.country
        };

        // 4g. Determine initial order and payment status
        const orderStatus = paymentMethod === 'cod' ? 'confirmed' : 'awaiting_payment';
        const paymentStatus = paymentMethod === 'cod' ? 'cod_due' : 'pending';

        // 4h. Persist Order document
        const orderDocs = await Order.create(
          [
            {
              orderReference,
              idempotencyKey,
              idempotencyPayloadHash: payloadHash,
              customer: userId,
              items: orderItems,
              currency: totals.currency,
              subtotalCents: totals.subtotalCents,
              shippingCents: totals.shippingCents,
              taxCents: totals.taxCents,
              totalCents: totals.totalCents,
              shippingAddress,
              orderStatus,
              paymentMethod,
              paymentStatus,
              isStockRestocked: false
            }
          ],
          { session }
        );
        order = orderDocs[0];

        // 4i. Persist Payment record
        const provider =
          paymentMethod === 'cod'
            ? 'cod'
            : env.PAYMENT_PROVIDER === 'mock' || env.NODE_ENV === 'test'
              ? 'mock'
              : 'stripe';

        await Payment.create(
          [
            {
              order: order._id,
              orderReference: order.orderReference,
              provider,
              amountCents: totals.totalCents,
              currency: totals.currency,
              status: paymentStatus,
              processedEvents: []
            }
          ],
          { session }
        );

        // 4j. Persist InventoryMovement audit records for each reservation
        const movements = stockReservationSnapshots.map((it) => ({
          product: it.product,
          sku: it.sku,
          movementType: 'reservation',
          quantityDelta: -it.quantity,
          previousPhysical: it.previousPhysical,
          newPhysical: it.newPhysical,
          previousAvailable: it.previousAvailable,
          newAvailable: it.newAvailable,
          previousReserved: it.previousReserved,
          newReserved: it.newReserved,
          actor: userId,
          actorRole: 'customer',
          orderReference: order.orderReference,
          reason: `Order placement stock reservation for ${order.orderReference}`
        }));
        await InventoryMovement.create(movements, { session });

        // 4k. Clear customer cart
        await Cart.findOneAndUpdate(
          { user: userId },
          { $set: { items: [] } },
          { session }
        );
      });

      return { order, isIdempotentReplay: false };
    } catch (error) {
      // Handle race condition on duplicate idempotency key
      if (error && error.code === 11000 && error.keyPattern?.idempotencyKey) {
        const raceOrder = await Order.findOne({ idempotencyKey });
        if (raceOrder) {
          if (raceOrder.idempotencyPayloadHash === payloadHash) {
            return { order: raceOrder, isIdempotentReplay: true };
          }
          throw ApiError.conflict(
            'An order with this idempotency key already exists with a different payload',
            'IDEMPOTENCY_CONFLICT'
          );
        }
      }

      // Handle transient write conflict in concurrent stock races
      if (
        error &&
        (error.code === 112 ||
          (typeof error.hasErrorLabel === 'function' &&
            error.hasErrorLabel('TransientTransactionError')))
      ) {
        throw ApiError.conflict(
          'Could not complete order due to concurrent inventory contention. Please retry.',
          'INSUFFICIENT_STOCK'
        );
      }

      throw error;
    } finally {
      session.endSession();
    }
  },

  /**
   * Get paginated customer order history
   */
  async getMyOrders(userId, query) {
    const { page, limit, skip } = getPaginationParams(query);
    const filter = { customer: userId };

    if (query.orderStatus) {
      filter.orderStatus = query.orderStatus;
    }

    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Order.countDocuments(filter)
    ]);

    return formatPaginatedResult({ data: orders, total, page, limit });
  },

  /**
   * Get single order details scoped strictly to customer ownership
   */
  async getOrderByReference(userId, reference) {
    const order = await Order.findOne({
      orderReference: reference,
      customer: userId
    });

    if (!order) {
      throw ApiError.notFound('Order not found', 'ORDER_NOT_FOUND');
    }

    const payment = await Payment.findOne({ order: order._id });

    return {
      order,
      payment
    };
  },

  /**
   * Cancel an eligible order and release reserved inventory exactly once
   */
  async cancelOrder(userId, reference, { reason } = {}) {
    // 1. Verify existence and ownership
    const order = await Order.findOne({
      orderReference: reference,
      customer: userId
    });

    if (!order) {
      throw ApiError.notFound('Order not found', 'ORDER_NOT_FOUND');
    }

    // 2. Verify cancellable states
    if (order.orderStatus === 'cancelled') {
      throw ApiError.conflict('Order has already been cancelled', 'ORDER_ALREADY_CANCELLED');
    }

    if (!['awaiting_payment', 'confirmed'].includes(order.orderStatus)) {
      throw ApiError.badRequest(
        `Orders in "${order.orderStatus}" status cannot be cancelled by customer`,
        'ORDER_NOT_CANCELLABLE'
      );
    }

    // 3. Paid orders require genuine refund handling
    if (order.paymentStatus === 'paid') {
      throw ApiError.conflict(
        'Paid orders cannot be automatically cancelled without refund processing',
        'REFUND_NOT_SUPPORTED'
      );
    }

    // 4. Execute cancellation and inventory release inside transaction
    const session = await mongoose.startSession();
    let updatedOrder;

    try {
      await session.withTransaction(async () => {
        // Atomic status transition requiring order to still be in cancellable state
        updatedOrder = await Order.findOneAndUpdate(
          {
            _id: order._id,
            customer: userId,
            orderStatus: { $in: ['awaiting_payment', 'confirmed'] },
            isStockRestocked: false
          },
          {
            $set: {
              orderStatus: 'cancelled',
              paymentStatus: 'failed',
              isStockRestocked: true,
              cancellation: {
                cancelledAt: new Date(),
                cancelledBy: userId,
                reason: reason || 'Customer requested cancellation'
              }
            }
          },
          { new: true, session }
        );

        if (!updatedOrder) {
          throw ApiError.conflict(
            'Order was concurrently modified or already cancelled',
            'ORDER_ALREADY_CANCELLED'
          );
        }

        // Release reserved stock for each item
        for (const item of updatedOrder.items) {
          const productBefore = await Product.findById(item.product).session(session);

          if (productBefore) {
            const productAfter = await Product.findOneAndUpdate(
              {
                _id: item.product,
                'stock.reserved': { $gte: item.quantity }
              },
              {
                $inc: {
                  'stock.reserved': -item.quantity,
                  'stock.available': item.quantity
                }
              },
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
                    actor: userId,
                    actorRole: 'customer',
                    orderReference: updatedOrder.orderReference,
                    reason: `Stock release on customer order cancellation: ${updatedOrder.orderReference}`
                  }
                ],
                { session }
              );
            }
          }
        }

        // Transition Payment status to failed
        await Payment.findOneAndUpdate(
          { order: updatedOrder._id },
          {
            $set: {
              status: 'failed',
              failureReason: 'Order cancelled by customer'
            }
          },
          { session }
        );
      });

      return updatedOrder;
    } catch (error) {
      if (
        error &&
        (error.code === 112 ||
          (typeof error.hasErrorLabel === 'function' &&
            error.hasErrorLabel('TransientTransactionError')))
      ) {
        throw ApiError.conflict(
          'Order was concurrently modified or already cancelled',
          'ORDER_ALREADY_CANCELLED'
        );
      }
      throw error;
    } finally {
      session.endSession();
    }
  }
};
