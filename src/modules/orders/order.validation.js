import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const checkoutQuoteSchema = {
  body: z
    .object({
      addressId: z
        .string({ required_error: 'Delivery address ID is required' })
        .regex(objectIdRegex, 'Invalid address ID format')
    })
    .strict('Unexpected fields in request payload are not permitted')
};

export const createOrderSchema = {
  headers: z
    .object({
      'idempotency-key': z
        .string({ required_error: 'Idempotency-Key header is required for order creation' })
        .trim()
        .min(1, 'Idempotency key cannot be empty')
        .max(128, 'Idempotency key cannot exceed 128 characters')
    })
    .passthrough(),
  body: z
    .object({
      addressId: z
        .string({ required_error: 'Delivery address ID is required' })
        .regex(objectIdRegex, 'Invalid address ID format'),
      paymentMethod: z.enum(['cod', 'online'], {
        required_error: 'Payment method is required',
        invalid_type_error: "Payment method must be either 'cod' or 'online'"
      })
    })
    .strict('Unexpected fields in request payload are not permitted')
};

export const orderReferenceParamSchema = {
  params: z
    .object({
      reference: z.string().trim().min(1, 'Order reference is required')
    })
    .strict()
};

export const cancelOrderSchema = {
  params: z
    .object({
      reference: z.string().trim().min(1, 'Order reference is required')
    })
    .strict(),
  body: z
    .object({
      reason: z.string().trim().max(500, 'Reason cannot exceed 500 characters').optional()
    })
    .strict('Unexpected fields in request payload are not permitted')
    .optional()
};

export const orderListingQuerySchema = {
  query: z
    .object({
      page: z.coerce.number().int().min(1).optional().default(1),
      limit: z.coerce.number().int().min(1).max(100).optional().default(20),
      orderStatus: z
        .enum([
          'awaiting_payment',
          'confirmed',
          'processing',
          'shipped',
          'delivered',
          'cancelled'
        ])
        .optional()
    })
    .strip()
};
