import { Router } from 'express';
import { orderController } from './order.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import { checkoutLimiter } from '../../middleware/rateLimiters.js';
import {
  checkoutQuoteSchema,
  createOrderSchema,
  orderReferenceParamSchema,
  cancelOrderSchema,
  orderListingQuerySchema
} from './order.validation.js';

const router = Router();

// All customer order endpoints require authentication and customer role
router.use(authenticate, authorize('customer'));

// Generate checkout quote
router.post('/quote', validateRequest(checkoutQuoteSchema), orderController.getCheckoutQuote);

// Place order idempotently with stock reservation
router.post(
  '/',
  checkoutLimiter,
  validateRequest(createOrderSchema),
  orderController.createOrder
);

// Customer order history
router.get('/my-orders', validateRequest(orderListingQuerySchema), orderController.getMyOrders);

// View order details
router.get(
  '/my-orders/:reference',
  validateRequest(orderReferenceParamSchema),
  orderController.getOrderByReference
);

// Cancel eligible order
router.post(
  '/my-orders/:reference/cancel',
  validateRequest(cancelOrderSchema),
  orderController.cancelOrder
);

export default router;
