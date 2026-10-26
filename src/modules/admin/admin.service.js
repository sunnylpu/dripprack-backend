import mongoose from 'mongoose';
import { Order } from '../orders/order.model.js';
import { Payment } from '../payments/payment.model.js';
import { Product } from '../products/product.model.js';
import { InventoryMovement } from '../inventory/inventoryMovement.model.js';
import { AuditLog } from './auditLog.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { escapeRegex } from '../../utils/escapeRegex.js';
import { getPaginationParams, formatPaginatedResult } from '../../utils/pagination.js';
import { env } from '../../config/env.js';

/**
 * Persist an immutable audit log record (supporting multi-document transactions)
 */
export async function createAuditRecord({
  actor,
  action,
  resourceType,
  resourceId,
  ipAddress = null,
  details = {},
  session = null
}) {
  const options = session ? { session } : {};
  const [record] = await AuditLog.create(
    [
      {
        actor,
        action: action.toUpperCase(),
        resourceType: resourceType.toLowerCase(),
        resourceId,
        ipAddress,
        details
      }
    ],
    options
  );
  return record;
}

export const adminService = {
  /**
   * List all store orders with filtering and bounded pagination
   */
  async getAdminOrders(query) {
    const filter = {};

    if (query.orderStatus) {
      filter.orderStatus = query.orderStatus;
    }
    if (query.paymentStatus) {
      filter.paymentStatus = query.paymentStatus;
    }
    if (query.paymentMethod) {
      filter.paymentMethod = query.paymentMethod;
    }

    if (query.startDate || query.endDate) {
      filter.createdAt = {};
      if (query.startDate) {
        filter.createdAt.$gte = new Date(query.startDate);
      }
      if (query.endDate) {
        filter.createdAt.$lte = new Date(query.endDate);
      }
    }

    if (query.search) {
      const escaped = escapeRegex(query.search);
      filter.$or = [
        { orderReference: { $regex: escaped, $options: 'i' } },
        { 'shippingAddress.recipientName': { $regex: escaped, $options: 'i' } }
      ];
    }

    const { page, limit, skip } = getPaginationParams(query);
    const totalItems = await Order.countDocuments(filter);

    const orders = await Order.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .populate('customer', 'firstName lastName email role')
      .lean();

    return formatPaginatedResult({ data: orders, page, limit, total: totalItems });
  },

  /**
   * Retrieve complete admin order details with customer snapshot, payment, and audit history
   */
  async getAdminOrderByReference(reference) {
    const order = await Order.findOne({ orderReference: reference }).populate(
      'customer',
      'firstName lastName email role'
    );

    if (!order) {
      throw ApiError.notFound('Order not found', 'ORDER_NOT_FOUND');
    }

    const payment = await Payment.findOne({ order: order._id });

    // Retrieve order-specific audit logs sorted newest-first
    const auditLogs = await AuditLog.find({
      resourceType: 'order',
      resourceId: order.orderReference
    })
      .populate('actor', 'firstName lastName email role')
      .sort({ createdAt: -1 })
      .lean();

    return {
      order,
      payment,
      auditLogs
    };
  },

  /**
   * Execute validated order fulfillment state transitions
   */
  async updateOrderStatus(adminId, reference, { status: targetStatus, tracking, codPaymentCollected, ipAddress = null }) {
    const order = await Order.findOne({ orderReference: reference });
    if (!order) {
      throw ApiError.notFound('Order not found', 'ORDER_NOT_FOUND');
    }

    // 1. Check if order is already in the requested status (idempotent / no-op replay)
    if (order.orderStatus === targetStatus) {
      const payment = await Payment.findOne({ order: order._id });
      return { order, payment, isNoop: true };
    }

    // 2. Disallow state mutations on terminal or non-advanceable states
    if (order.orderStatus === 'cancelled') {
      throw ApiError.conflict('Cancelled orders cannot be reopened or fulfilled', 'ORDER_ALREADY_CANCELLED');
    }

    if (order.orderStatus === 'delivered') {
      throw ApiError.conflict('Delivered orders have completed their lifecycle and cannot be modified', 'INVALID_ORDER_STATUS');
    }

    if (order.orderStatus === 'awaiting_payment') {
      throw ApiError.conflict('Orders awaiting payment cannot be advanced manually by administrator', 'INVALID_ORDER_STATUS');
    }

    // 3. Online payment invariant: online orders must be verified paid before fulfillment
    if (order.paymentMethod === 'online' && order.paymentStatus !== 'paid') {
      throw ApiError.conflict(
        'Online orders must have verified payment before fulfillment',
        'ORDER_PAYMENT_REQUIRED'
      );
    }

    // 4. Validate allowed sequential state transitions
    const validTransitions = {
      confirmed: 'processing',
      processing: 'shipped',
      shipped: 'delivered'
    };

    if (validTransitions[order.orderStatus] !== targetStatus) {
      throw ApiError.conflict(
        `Invalid order status transition from "${order.orderStatus}" to "${targetStatus}". Order transitions must follow confirmed -> processing -> shipped -> delivered.`,
        'INVALID_ORDER_TRANSITION'
      );
    }

    // 5. Execute state transition within MongoDB multi-document transaction
    const session = await mongoose.startSession();
    try {
      let updatedOrder;
      let updatedPayment;

      await session.withTransaction(async () => {
        // Atomic status claim check
        const currentOrder = await Order.findOne({
          _id: order._id,
          orderStatus: order.orderStatus
        }).session(session);

        if (!currentOrder) {
          throw ApiError.conflict('Order was concurrently modified', 'ORDER_CONCURRENT_UPDATE');
        }

        // --- Transition A: confirmed -> processing ---
        if (targetStatus === 'processing') {
          currentOrder.orderStatus = 'processing';
          await currentOrder.save({ session });

          await createAuditRecord({
            actor: adminId,
            action: 'ORDER_STATUS_CHANGED',
            resourceType: 'order',
            resourceId: currentOrder.orderReference,
            ipAddress,
            details: {
              previousStatus: 'confirmed',
              newStatus: 'processing'
            },
            session
          });
        }

        // --- Transition B: processing -> shipped ---
        else if (targetStatus === 'shipped') {
          if (!tracking || !tracking.carrier || !tracking.trackingNumber || !tracking.trackingUrl) {
            throw ApiError.badRequest(
              'Valid tracking information (carrier, trackingNumber, trackingUrl) is required to ship an order',
              'TRACKING_REQUIRED'
            );
          }

          // Atomically commit reserved stock as sold for every line item
          for (const item of currentOrder.items) {
            const productBefore = await Product.findById(item.product).session(session);
            if (!productBefore) {
              throw ApiError.notFound(`Product snapshot SKU ${item.sku} not found in catalog`, 'PRODUCT_NOT_FOUND');
            }

            if (productBefore.stock.reserved < item.quantity) {
              throw ApiError.conflict(
                `Insufficient reserved stock for product ${item.sku}. Reserved: ${productBefore.stock.reserved}, required: ${item.quantity}`,
                'INSUFFICIENT_RESERVED_STOCK'
              );
            }

            // Decrement physical and reserved stock simultaneously; available stock remains invariant
            const productAfter = await Product.findOneAndUpdate(
              {
                _id: item.product,
                'stock.reserved': { $gte: item.quantity },
                'stock.physical': { $gte: item.quantity }
              },
              {
                $inc: {
                  'stock.physical': -item.quantity,
                  'stock.reserved': -item.quantity
                }
              },
              { new: true, session }
            );

            if (!productAfter) {
              throw ApiError.conflict(
                `Concurrent inventory mutation failed for product ${item.sku}`,
                'INVENTORY_MUTATION_CONFLICT'
              );
            }

            // Create append-only 'sale' inventory movement
            await InventoryMovement.create(
              [
                {
                  product: item.product,
                  sku: item.sku,
                  movementType: 'sale',
                  quantityDelta: -item.quantity,
                  previousPhysical: productBefore.stock.physical,
                  newPhysical: productAfter.stock.physical,
                  previousAvailable: productBefore.stock.available,
                  newAvailable: productAfter.stock.available,
                  previousReserved: productBefore.stock.reserved,
                  newReserved: productAfter.stock.reserved,
                  actor: adminId,
                  actorRole: 'admin',
                  orderReference: currentOrder.orderReference,
                  reason: `Order fulfilled and shipped: ${currentOrder.orderReference}`
                }
              ],
              { session }
            );
          }

          currentOrder.orderStatus = 'shipped';
          currentOrder.tracking = {
            carrier: tracking.carrier,
            trackingNumber: tracking.trackingNumber,
            trackingUrl: tracking.trackingUrl,
            dispatchedAt: new Date()
          };
          await currentOrder.save({ session });

          await createAuditRecord({
            actor: adminId,
            action: 'ORDER_STATUS_CHANGED',
            resourceType: 'order',
            resourceId: currentOrder.orderReference,
            ipAddress,
            details: {
              previousStatus: 'processing',
              newStatus: 'shipped',
              tracking: currentOrder.tracking,
              itemsCount: currentOrder.items.length
            },
            session
          });
        }

        // --- Transition C: shipped -> delivered ---
        else if (targetStatus === 'delivered') {
          // If COD order, require explicit payment collection confirmation
          if (currentOrder.paymentMethod === 'cod' && currentOrder.paymentStatus === 'cod_due') {
            if (codPaymentCollected !== true) {
              throw ApiError.badRequest(
                'Confirmation of COD payment collection (codPaymentCollected: true) is required to deliver a COD order',
                'COD_PAYMENT_REQUIRED'
              );
            }

            currentOrder.paymentStatus = 'paid';
            updatedPayment = await Payment.findOneAndUpdate(
              { order: currentOrder._id },
              { $set: { status: 'paid' } },
              { new: true, session }
            );

            await createAuditRecord({
              actor: adminId,
              action: 'COD_PAYMENT_COLLECTED',
              resourceType: 'order',
              resourceId: currentOrder.orderReference,
              ipAddress,
              details: {
                amountCents: currentOrder.totalCents,
                currency: currentOrder.currency
              },
              session
            });
          }

          currentOrder.orderStatus = 'delivered';
          await currentOrder.save({ session });

          await createAuditRecord({
            actor: adminId,
            action: 'ORDER_STATUS_CHANGED',
            resourceType: 'order',
            resourceId: currentOrder.orderReference,
            ipAddress,
            details: {
              previousStatus: 'shipped',
              newStatus: 'delivered',
              codPaymentCollected: Boolean(codPaymentCollected)
            },
            session
          });
        }

        updatedOrder = currentOrder;
        if (!updatedPayment) {
          updatedPayment = await Payment.findOne({ order: updatedOrder._id }).session(session);
        }
      });

      return {
        order: updatedOrder,
        payment: updatedPayment
      };
    } finally {
      session.endSession();
    }
  },

  /**
   * Cancel an eligible order by administrator and release reserved inventory exactly once
   */
  async cancelOrderByAdmin(adminId, reference, { reason, ipAddress = null } = {}) {
    const order = await Order.findOne({ orderReference: reference });
    if (!order) {
      throw ApiError.notFound('Order not found', 'ORDER_NOT_FOUND');
    }

    if (order.orderStatus === 'cancelled') {
      throw ApiError.conflict('Order has already been cancelled', 'ORDER_ALREADY_CANCELLED');
    }

    if (['shipped', 'delivered'].includes(order.orderStatus)) {
      throw ApiError.conflict(
        `Orders in "${order.orderStatus}" status cannot be cancelled by administrator`,
        'ORDER_NOT_CANCELLABLE'
      );
    }

    if (order.paymentStatus === 'paid') {
      throw ApiError.conflict(
        'Paid orders cannot be automatically cancelled without refund processing',
        'REFUND_NOT_SUPPORTED'
      );
    }

    const session = await mongoose.startSession();
    try {
      let updatedOrder;
      let updatedPayment;

      await session.withTransaction(async () => {
        updatedOrder = await Order.findOneAndUpdate(
          {
            _id: order._id,
            orderStatus: { $in: ['awaiting_payment', 'confirmed', 'processing'] },
            isStockRestocked: false
          },
          {
            $set: {
              orderStatus: 'cancelled',
              paymentStatus: 'failed',
              isStockRestocked: true,
              cancellation: {
                cancelledAt: new Date(),
                cancelledBy: adminId,
                reason: reason || 'Administrative cancellation'
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

        // Release reserved inventory back to available stock
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
                    actor: adminId,
                    actorRole: 'admin',
                    orderReference: updatedOrder.orderReference,
                    reason: `Stock release on administrative order cancellation: ${updatedOrder.orderReference}`
                  }
                ],
                { session }
              );
            }
          }
        }

        updatedPayment = await Payment.findOneAndUpdate(
          { order: updatedOrder._id },
          {
            $set: {
              status: 'failed',
              failureReason: reason || 'Order cancelled by administrator'
            }
          },
          { new: true, session }
        );

        await createAuditRecord({
          actor: adminId,
          action: 'ORDER_CANCELLED',
          resourceType: 'order',
          resourceId: updatedOrder.orderReference,
          ipAddress,
          details: {
            reason: reason || 'Administrative cancellation',
            previousStatus: order.orderStatus,
            releasedItemsCount: updatedOrder.items.length
          },
          session
        });
      });

      return {
        order: updatedOrder,
        payment: updatedPayment
      };
    } finally {
      session.endSession();
    }
  },

  /**
   * Compute bounded admin dashboard summary metrics using MongoDB aggregation
   */
  async getDashboardSummary() {
    // 1. Group orders by status
    const statusAggregation = await Order.aggregate([
      {
        $group: {
          _id: '$orderStatus',
          count: { $sum: 1 }
        }
      }
    ]);

    const ordersByStatus = {
      awaiting_payment: 0,
      confirmed: 0,
      processing: 0,
      shipped: 0,
      delivered: 0,
      cancelled: 0
    };

    let totalOrdersCount = 0;
    for (const item of statusAggregation) {
      if (ordersByStatus[item._id] !== undefined) {
        ordersByStatus[item._id] = item.count;
      }
      totalOrdersCount += item.count;
    }

    // 2. Compute recognized paid revenue in integer minor units
    // Only orders with paymentStatus === 'paid' (verified online payments or confirmed COD deliveries)
    const revenueAggregation = await Order.aggregate([
      {
        $match: {
          paymentStatus: 'paid'
        }
      },
      {
        $group: {
          _id: null,
          totalRevenueCents: { $sum: '$totalCents' },
          paidOrdersCount: { $sum: 1 }
        }
      }
    ]);

    const totalRevenueCents = revenueAggregation[0]?.totalRevenueCents || 0;
    const paidOrdersCount = revenueAggregation[0]?.paidOrdersCount || 0;

    // 3. Count products at or below their low-stock threshold (excluding archived products)
    const lowStockProductsCount = await Product.countDocuments({
      status: { $ne: 'archived' },
      $expr: { $lte: ['$stock.available', '$lowStockThreshold'] }
    });

    // 4. Bounded list of latest 10 orders
    const recentOrders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select('orderReference customer currency totalCents orderStatus paymentStatus paymentMethod createdAt')
      .populate('customer', 'firstName lastName email')
      .lean();

    return {
      revenue: {
        totalRevenueCents,
        paidOrdersCount,
        currency: env.CURRENCY_CODE
      },
      ordersByStatus,
      totalOrdersCount,
      lowStockProductsCount,
      recentOrders,
      generatedAt: new Date().toISOString()
    };
  },

  /**
   * Retrieve append-only administrative audit trail with filtering and pagination
   */
  async getAuditLogs(query) {
    const filter = {};

    if (query.actor) {
      filter.actor = query.actor;
    }
    if (query.action) {
      filter.action = query.action.toUpperCase();
    }
    if (query.resourceType) {
      filter.resourceType = query.resourceType.toLowerCase();
    }
    if (query.resourceId) {
      filter.resourceId = query.resourceId;
    }

    if (query.startDate || query.endDate) {
      filter.createdAt = {};
      if (query.startDate) {
        filter.createdAt.$gte = new Date(query.startDate);
      }
      if (query.endDate) {
        filter.createdAt.$lte = new Date(query.endDate);
      }
    }

    const { page, limit, skip } = getPaginationParams(query);
    const totalItems = await AuditLog.countDocuments(filter);

    const auditLogs = await AuditLog.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .populate('actor', 'firstName lastName email role')
      .lean();

    return formatPaginatedResult({ data: auditLogs, page, limit, total: totalItems });
  }
};
