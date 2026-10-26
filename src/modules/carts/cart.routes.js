import { Router } from 'express';
import { cartController } from './cart.controller.js';
import {
  addCartItemSchema,
  updateCartItemSchema,
  removeCartItemSchema
} from './cart.validation.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';

const router = Router();

// Cart operations strictly require authenticated customer
router.use(authenticate, authorize('customer'));

// GET /api/v1/cart - Retrieve current shopping cart
router.get('/', cartController.getCart);

// POST /api/v1/cart/items - Add item or increment quantity
router.post('/items', validateRequest(addCartItemSchema), cartController.addItem);

// PATCH /api/v1/cart/items/:productId - Update item quantity
router.patch('/items/:productId', validateRequest(updateCartItemSchema), cartController.updateItemQuantity);

// DELETE /api/v1/cart/items/:productId - Remove item from cart
router.delete('/items/:productId', validateRequest(removeCartItemSchema), cartController.removeItem);

// DELETE /api/v1/cart - Clear all cart items
router.delete('/', cartController.clearCart);

export default router;
