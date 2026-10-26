import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const addCartItemSchema = {
  body: z
    .object({
      productId: z
        .string({ required_error: 'Product ID is required' })
        .regex(objectIdRegex, 'Invalid product ID format'),
      quantity: z
        .number()
        .int('Quantity must be an integer')
        .min(1, 'Quantity must be at least 1')
        .max(99, 'Quantity cannot exceed 99 units')
        .optional()
        .default(1)
    })
    .strict('Unexpected fields in request body are not permitted')
};

export const updateCartItemSchema = {
  params: z.object({
    productId: z
      .string({ required_error: 'Product ID is required' })
      .regex(objectIdRegex, 'Invalid product ID format')
  }),
  body: z
    .object({
      quantity: z
        .number({ required_error: 'Quantity is required' })
        .int('Quantity must be an integer')
        .min(1, 'Quantity must be at least 1')
        .max(99, 'Quantity cannot exceed 99 units')
    })
    .strict('Unexpected fields in request body are not permitted')
};

export const removeCartItemSchema = {
  params: z.object({
    productId: z
      .string({ required_error: 'Product ID is required' })
      .regex(objectIdRegex, 'Invalid product ID format')
  })
};
