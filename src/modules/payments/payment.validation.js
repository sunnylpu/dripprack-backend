import { z } from 'zod';

export const createPaymentIntentSchema = {
  body: z
    .object({
      orderReference: z
        .string({ required_error: 'Order reference is required' })
        .trim()
        .min(1, 'Order reference cannot be empty')
    })
    .strict('Unexpected fields in request payload are not permitted')
};

export const paymentWebhookSchema = {
  headers: z
    .object({
      'stripe-signature': z.string().optional(),
      'x-webhook-signature': z.string().optional()
    })
    .passthrough()
};
