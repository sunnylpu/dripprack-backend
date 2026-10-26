import { cartService } from './cart.service.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const cartController = {
  /**
   * Get authenticated customer's cart
   * GET /api/v1/cart
   */
  getCart: asyncHandler(async (req, res) => {
    const cart = await cartService.getCart(req.user._id);
    return ApiResponse.success(res, {
      message: 'Shopping cart retrieved successfully',
      data: { cart }
    });
  }),

  /**
   * Add item to cart or increment quantity
   * POST /api/v1/cart/items
   */
  addItem: asyncHandler(async (req, res) => {
    const cart = await cartService.addItem({
      userId: req.user._id,
      productId: req.body.productId,
      quantity: req.body.quantity
    });

    return ApiResponse.success(res, {
      message: 'Item added to shopping cart successfully',
      data: { cart }
    });
  }),

  /**
   * Update quantity of a cart item
   * PATCH /api/v1/cart/items/:productId
   */
  updateItemQuantity: asyncHandler(async (req, res) => {
    const cart = await cartService.updateItemQuantity({
      userId: req.user._id,
      productId: req.params.productId,
      quantity: req.body.quantity
    });

    return ApiResponse.success(res, {
      message: 'Cart item quantity updated successfully',
      data: { cart }
    });
  }),

  /**
   * Remove a product from cart
   * DELETE /api/v1/cart/items/:productId
   */
  removeItem: asyncHandler(async (req, res) => {
    const cart = await cartService.removeItem({
      userId: req.user._id,
      productId: req.params.productId
    });

    return ApiResponse.success(res, {
      message: 'Item removed from shopping cart successfully',
      data: { cart }
    });
  }),

  /**
   * Clear all items from cart
   * DELETE /api/v1/cart
   */
  clearCart: asyncHandler(async (req, res) => {
    const cart = await cartService.clearCart(req.user._id);
    return ApiResponse.success(res, {
      message: 'Shopping cart cleared successfully',
      data: { cart }
    });
  })
};
