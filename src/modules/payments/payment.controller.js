import { paymentService } from './payment.service.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const paymentController = {
  /**
   * POST /api/v1/payments/create-intent
   */
  createPaymentIntent: asyncHandler(async (req, res) => {
    const intent = await paymentService.createPaymentIntent(req.user._id, req.body);
    return ApiResponse.success(res, {
      message: 'Payment intent created successfully',
      data: intent
    });
  }),

  /**
   * POST /api/v1/payments/webhook
   */
  handleWebhook: asyncHandler(async (req, res) => {
    const result = await paymentService.handleWebhook({
      rawBody: req.rawBody,
      headers: req.headers,
      body: req.body
    });
    return ApiResponse.success(res, {
      message: 'Webhook processed successfully',
      data: result
    });
  })
};
