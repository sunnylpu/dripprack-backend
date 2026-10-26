import { inventoryService } from './inventory.service.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const inventoryController = {
  /**
   * Adjust product stock level (Admin only)
   * POST /api/v1/inventory/adjust
   */
  adjustStock: asyncHandler(async (req, res) => {
    const idempotencyKey =
      req.headers['idempotency-key'] || req.headers['x-idempotency-key'] || null;

    const result = await inventoryService.adjustStock({
      productId: req.body.productId,
      quantityDelta: req.body.quantityDelta,
      reason: req.body.reason,
      actorId: req.user._id,
      actorRole: req.user.role,
      idempotencyKey
    });

    const statusCode = result.isIdempotentReplay ? 200 : 200;
    const message = result.isIdempotentReplay
      ? 'Idempotent replay: previous stock adjustment returned'
      : 'Stock adjusted successfully';

    return ApiResponse.success(res, {
      statusCode,
      message,
      data: {
        product: result.product,
        movement: result.movement
      }
    });
  }),

  /**
   * Get administrator stock listing across catalog
   * GET /api/v1/inventory/stock
   */
  getStockList: asyncHandler(async (req, res) => {
    const result = await inventoryService.getStockList(req.query);
    return ApiResponse.success(res, {
      message: 'Inventory stock levels retrieved successfully',
      data: { stock: result.data },
      meta: result.meta
    });
  }),

  /**
   * Get low-stock inventory report
   * GET /api/v1/inventory/low-stock
   */
  getLowStockProducts: asyncHandler(async (req, res) => {
    const result = await inventoryService.getLowStockProducts(req.query);
    return ApiResponse.success(res, {
      message: 'Low-stock inventory report retrieved successfully',
      data: { products: result.data },
      meta: result.meta
    });
  }),

  /**
   * Get inventory movement audit history
   * GET /api/v1/inventory/movements
   */
  getMovements: asyncHandler(async (req, res) => {
    const result = await inventoryService.getMovements(req.query);
    return ApiResponse.success(res, {
      message: 'Inventory movements retrieved successfully',
      data: { movements: result.data },
      meta: result.meta
    });
  })
};
