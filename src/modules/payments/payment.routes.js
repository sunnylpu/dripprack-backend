import { Router } from 'express';
import { paymentController } from './payment.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import {
  createPaymentIntentSchema,
  paymentWebhookSchema
} from './payment.validation.js';

const router = Router();

// Customer intent creation (authenticated customer)
router.post(
  '/create-intent',
  authenticate,
  authorize('customer'),
  validateRequest(createPaymentIntentSchema),
  paymentController.createPaymentIntent
);

// Public provider webhook endpoint (cryptographically signature-verified)
router.post(
  '/webhook',
  validateRequest(paymentWebhookSchema),
  paymentController.handleWebhook
);

export default router;
