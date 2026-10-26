import crypto from 'crypto';
import mongoose from 'mongoose';
import { Product } from '../products/product.model.js';
import { Category } from '../categories/category.model.js';
import { InventoryMovement } from './inventoryMovement.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { escapeRegex } from '../../utils/escapeRegex.js';
import { getPaginationParams, formatPaginatedResult } from '../../utils/pagination.js';
import { logger } from '../../utils/logger.js';

function parseStockSort(sortBy = 'createdAt:desc') {
  const sortMap = {
    'sku:asc': { sku: 1 },
    'sku:desc': { sku: -1 },
    'name:asc': { name: 1 },
    'name:desc': { name: -1 },
    'physical:asc': { 'stock.physical': 1 },
    'physical:desc': { 'stock.physical': -1 },
    'available:asc': { 'stock.available': 1 },
    'available:desc': { 'stock.available': -1 },
    'createdAt:asc': { createdAt: 1 },
    'createdAt:desc': { createdAt: -1 }
  };
  return sortMap[sortBy] || { createdAt: -1 };
}

function computePayloadHash({ productId, quantityDelta, reason }) {
  const normalized = JSON.stringify({
    productId: productId.toString(),
    quantityDelta: Number(quantityDelta),
    reason: reason.trim()
  });
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export const inventoryService = {
  /**
   * Atomically adjust stock with transaction safety and idempotency support
   * Admin only operation
   */
  async adjustStock({ productId, quantityDelta, reason, actorId, actorRole, idempotencyKey }) {
    const trimmedReason = reason.trim();
    let payloadHash = null;

    // 1. Idempotency pre-check if key is provided
    if (idempotencyKey) {
      payloadHash = computePayloadHash({ productId, quantityDelta, reason: trimmedReason });

      const existingMovement = await InventoryMovement.findOne({ idempotencyKey })
        .populate('product', 'name slug sku')
        .populate('actor', 'firstName lastName email role');

      if (existingMovement) {
        if (existingMovement.idempotencyPayloadHash === payloadHash) {
          const product = await Product.findById(productId).populate('category', 'name slug');
          return {
            product,
            movement: existingMovement,
            isIdempotentReplay: true
          };
        }

        throw ApiError.conflict(
          'Idempotency key has already been used with a different request payload',
          'IDEMPOTENCY_CONFLICT'
        );
      }
    }

    // 2. Multi-document transaction for stock update and audit record
    const supportsTransactions = Boolean(
      mongoose.connection?.client?.topology?.description?.setName ||
      mongoose.connection?.client?.topology?.description?.type === 'ReplicaSetWithPrimary' ||
      mongoose.connection?.client?.topology?.description?.type === 'Sharded'
    );

    const session = await mongoose.startSession();
    let result;

    try {
      if (supportsTransactions) {
        await session.withTransaction(async () => {
          result = await this._executeStockAdjustment({
            productId,
            quantityDelta,
            reason: trimmedReason,
            actorId,
            actorRole,
            idempotencyKey,
            payloadHash,
            session
          });
        });
      } else {
        // Fallback for standalone dev environments where transactions are unavailable
        logger.warn('MongoDB deployment does not support replica set transactions; executing atomic update directly');
        result = await this._executeStockAdjustment({
          productId,
          quantityDelta,
          reason: trimmedReason,
          actorId,
          actorRole,
          idempotencyKey,
          payloadHash,
          session: null
        });
      }
    } catch (error) {
      // Check for concurrent duplicate idempotency key race condition
      if (error && error.code === 11000 && error.keyPattern?.idempotencyKey && idempotencyKey) {
        const raceMovement = await InventoryMovement.findOne({ idempotencyKey })
          .populate('product', 'name slug sku')
          .populate('actor', 'firstName lastName email role');

        if (raceMovement) {
          if (raceMovement.idempotencyPayloadHash === payloadHash) {
            const product = await Product.findById(productId).populate('category', 'name slug');
            return {
              product,
              movement: raceMovement,
              isIdempotentReplay: true
            };
          }
          throw ApiError.conflict(
            'Idempotency key has already been used with a different request payload',
            'IDEMPOTENCY_CONFLICT'
          );
        }
      }
      throw error;
    } finally {
      await session.endSession();
    }

    return result;
  },

  /**
   * Internal helper to execute atomic stock update and movement record
   */
  async _executeStockAdjustment({
    productId,
    quantityDelta,
    reason,
    actorId,
    actorRole,
    idempotencyKey,
    payloadHash,
    session
  }) {
    // A. Verify product exists
    const findQuery = Product.findById(productId);
    if (session) findQuery.session(session);
    const product = await findQuery;

    if (!product) {
      throw ApiError.notFound('Product not found');
    }

    const previousPhysical = product.stock.physical;
    const previousAvailable = product.stock.available;

    // B. Check available stock for negative adjustments
    if (quantityDelta < 0 && previousAvailable < Math.abs(quantityDelta)) {
      throw ApiError.conflict(
        `Insufficient available stock for reduction. Available: ${previousAvailable}, Requested reduction: ${Math.abs(quantityDelta)}`,
        'INSUFFICIENT_STOCK'
      );
    }

    // C. Atomic conditional update enforcing stock constraint at query level
    const updateFilter = { _id: productId };
    if (quantityDelta < 0) {
      updateFilter['stock.available'] = { $gte: Math.abs(quantityDelta) };
    }

    const updateOptions = { new: true };
    if (session) updateOptions.session = session;

    const updatedProduct = await Product.findOneAndUpdate(
      updateFilter,
      {
        $inc: {
          'stock.physical': quantityDelta,
          'stock.available': quantityDelta
        }
      },
      updateOptions
    );

    if (!updatedProduct) {
      throw ApiError.conflict(
        'Stock update conflict or insufficient available stock',
        'STOCK_UPDATE_CONFLICT'
      );
    }

    // D. Create append-only movement record
    const movementData = {
      product: updatedProduct._id,
      sku: product.sku,
      movementType: 'adjustment',
      quantityDelta,
      previousPhysical,
      newPhysical: updatedProduct.stock.physical,
      previousAvailable,
      newAvailable: updatedProduct.stock.available,
      actor: actorId,
      actorRole,
      reason
    };

    if (idempotencyKey) {
      movementData.idempotencyKey = idempotencyKey;
      movementData.idempotencyPayloadHash = payloadHash;
    }

    const createOptions = session ? { session } : {};
    const [movement] = await InventoryMovement.create([movementData], createOptions);

    await updatedProduct.populate('category', 'name slug');
    await movement.populate('actor', 'firstName lastName email role');

    return {
      product: updatedProduct,
      movement,
      isIdempotentReplay: false
    };
  },

  /**
   * Get administrator stock view across catalog
   */
  async getStockList(query) {
    const { page, limit, skip } = getPaginationParams(query);
    const filter = {};

    // 1. Category filter
    if (query.category) {
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(query.category);
      if (isObjectId) {
        filter.category = query.category;
      } else {
        const cat = await Category.findOne({ slug: query.category.toLowerCase() });
        if (cat) {
          filter.category = cat._id;
        } else {
          return formatPaginatedResult({ data: [], total: 0, page, limit });
        }
      }
    }

    // 2. Search by SKU or product name
    if (query.q) {
      const escaped = escapeRegex(query.q);
      filter.$or = [
        { name: new RegExp(escaped, 'i') },
        { sku: new RegExp(escaped, 'i') }
      ];
    }

    // 3. Availability filter
    if (query.inStock === 'true') {
      filter['stock.available'] = { $gt: 0 };
    } else if (query.inStock === 'false') {
      filter['stock.available'] = 0;
    }

    // 4. Low stock only filter (stock.available <= lowStockThreshold)
    if (query.lowStockOnly === 'true') {
      filter.$expr = { $lte: ['$stock.available', '$lowStockThreshold'] };
    }

    const sort = parseStockSort(query.sortBy);

    const [products, total] = await Promise.all([
      Product.find(filter)
        .populate('category', 'name slug isActive')
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Product.countDocuments(filter)
    ]);

    const formattedData = products.map((p) => ({
      _id: p._id,
      sku: p.sku,
      name: p.name,
      slug: p.slug,
      status: p.status,
      category: p.category,
      stock: {
        physical: p.stock.physical,
        reserved: p.stock.reserved,
        available: p.stock.available
      },
      lowStockThreshold: p.lowStockThreshold,
      isLowStock: p.stock.available <= p.lowStockThreshold,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt
    }));

    return formatPaginatedResult({ data: formattedData, total, page, limit });
  },

  /**
   * Get low-stock product report (stock.available <= lowStockThreshold)
   */
  async getLowStockProducts(query) {
    const { page, limit, skip } = getPaginationParams(query);
    const filter = {
      $expr: { $lte: ['$stock.available', '$lowStockThreshold'] }
    };

    // Category filter
    if (query.category) {
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(query.category);
      if (isObjectId) {
        filter.category = query.category;
      } else {
        const cat = await Category.findOne({ slug: query.category.toLowerCase() });
        if (cat) {
          filter.category = cat._id;
        } else {
          return formatPaginatedResult({ data: [], total: 0, page, limit });
        }
      }
    }

    // Search filter
    if (query.q) {
      const escaped = escapeRegex(query.q);
      filter.$or = [
        { name: new RegExp(escaped, 'i') },
        { sku: new RegExp(escaped, 'i') }
      ];
    }

    const sort = parseStockSort(query.sortBy);

    const [products, total] = await Promise.all([
      Product.find(filter)
        .populate('category', 'name slug isActive')
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Product.countDocuments(filter)
    ]);

    const formattedData = products.map((p) => ({
      _id: p._id,
      sku: p.sku,
      name: p.name,
      slug: p.slug,
      status: p.status,
      category: p.category,
      stock: {
        physical: p.stock.physical,
        reserved: p.stock.reserved,
        available: p.stock.available
      },
      lowStockThreshold: p.lowStockThreshold,
      isLowStock: true,
      unitsBelowThreshold: Math.max(0, p.lowStockThreshold - p.stock.available),
      createdAt: p.createdAt,
      updatedAt: p.updatedAt
    }));

    return formatPaginatedResult({ data: formattedData, total, page, limit });
  },

  /**
   * Get append-only inventory movement audit history
   */
  async getMovements(query) {
    const { page, limit, skip } = getPaginationParams(query);
    const filter = {};

    if (query.productId) {
      filter.product = query.productId;
    }

    if (query.movementType) {
      filter.movementType = query.movementType;
    }

    if (query.actor) {
      filter.actor = query.actor;
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

    const sort = query.sortBy === 'createdAt:asc' ? { createdAt: 1 } : { createdAt: -1 };

    const [movements, total] = await Promise.all([
      InventoryMovement.find(filter)
        .populate('product', 'name slug sku')
        .populate('actor', 'firstName lastName email role')
        .sort(sort)
        .skip(skip)
        .limit(limit),
      InventoryMovement.countDocuments(filter)
    ]);

    return formatPaginatedResult({ data: movements, total, page, limit });
  }
};
