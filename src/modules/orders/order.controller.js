import { orderService } from './order.service.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const orderController = {
  /**
   * POST /api/v1/orders/quote
   */
  getCheckoutQuote: asyncHandler(async (req, res) => {
    const quote = await orderService.getCheckoutQuote(req.user._id, req.body);
    return ApiResponse.success(res, {
      message: 'Checkout quote calculated successfully',
      data: quote
    });
  }),

  /**
   * POST /api/v1/orders
   */
  createOrder: asyncHandler(async (req, res) => {
    const idempotencyKey = req.headers['idempotency-key'];
    const { order, isIdempotentReplay } = await orderService.createOrder(
      req.user._id,
      req.body,
      idempotencyKey
    );

    if (isIdempotentReplay) {
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Idempotent replay: previous order returned',
        data: order
      });
    }

    return ApiResponse.created(res, {
      message: 'Order placed successfully',
      data: order
    });
  }),

  /**
   * GET /api/v1/orders/my-orders
   */
  getMyOrders: asyncHandler(async (req, res) => {
    const { data, meta } = await orderService.getMyOrders(req.user._id, req.query);
    return ApiResponse.success(res, {
      message: 'Customer order history retrieved successfully',
      data,
      meta
    });
  }),

  /**
   * GET /api/v1/orders/my-orders/:reference
   */
  getOrderByReference: asyncHandler(async (req, res) => {
    const result = await orderService.getOrderByReference(req.user._id, req.params.reference);
    return ApiResponse.success(res, {
      message: 'Order details retrieved successfully',
      data: result
    });
  }),

  /**
   * POST /api/v1/orders/my-orders/:reference/cancel
   */
  cancelOrder: asyncHandler(async (req, res) => {
    const order = await orderService.cancelOrder(
      req.user._id,
      req.params.reference,
      req.body || {}
    );
    return ApiResponse.success(res, {
      message: 'Order cancelled successfully and reserved inventory released',
      data: order
    });
  })
};
